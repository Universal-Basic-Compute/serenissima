"""
Processor for 'organize_collective_delivery' stratagems.
Tracks deliveries, manages rewards, and handles resource ownership transfers.
"""
import json
import logging
from datetime import datetime, timedelta
import pytz
from typing import Dict, Any, List, Optional

from pyairtable import Table

from backend.engine.utils.activity_helpers import (
    LogColors,
    get_citizen_record,
    get_building_record
)
from backend.engine.utils.notification_helpers import create_notification

log = logging.getLogger(__name__)


def process(
    tables: Dict[str, Any],
    stratagem_record: Dict[str, Any],
    resource_defs: Optional[Dict[str, Any]] = None,
    building_type_defs: Optional[Dict[str, Any]] = None,
    api_base_url: Optional[str] = None
) -> bool:
    """
    Process an organize_collective_delivery stratagem.
    
    This processor:
    1. Monitors completed delivery activities to the target
    2. Tracks participation and amounts delivered
    3. Distributes rewards to participants
    4. Updates resource ownership to building's RunBy
    5. Ends the stratagem when max amount reached or time expires
    
    Returns:
        Dict with keys: should_continue (bool), message (str)
    """
    stratagem_id = stratagem_record['id']
    initiator = stratagem_record['fields'].get('ExecutedBy')  # Changed from 'Initiator'
    current_time = datetime.now(pytz.utc)
    
    try:
        # Parse stratagem details from Notes field
        details_str = stratagem_record['fields'].get('Notes', '{}')
        details = json.loads(details_str) if details_str else {}
        
        resource_type = details.get('resource_type')
        target = details.get('target', {})
        max_total_amount = details.get('max_total_amount', 9999)
        collected_amount = details.get('collected_amount', 0)
        reward_per_unit = details.get('reward_per_unit', 0)
        participants = details.get('participants', [])
        deliveries = details.get('deliveries', [])
        
        # Check if stratagem should end
        expires_at_str = stratagem_record['fields'].get('ExpiresAt')  # Changed from 'EndsAt'
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            if current_time >= expires_at:
                return _end_stratagem(tables, stratagem_record, details, "Time limit reached")
        
        if collected_amount >= max_total_amount:
            return _end_stratagem(tables, stratagem_record, details, "Target amount collected")
        
        # Find new deliveries to target
        new_deliveries = _find_new_deliveries(tables, target, resource_type, deliveries, current_time)
        
        if new_deliveries:
            # Process each new delivery
            for delivery in new_deliveries:
                activity_id = delivery['id']
                delivering_citizen = delivery['fields'].get('Citizen')
                
                # Parse delivery notes to get amount
                try:
                    delivery_notes = json.loads(delivery['fields'].get('Notes', '{}'))
                    delivered_amount = delivery_notes.get('amount', 0)
                except:
                    log.warning(f"[Collective Delivery] Could not parse delivery amount from activity {activity_id}")
                    continue
                
                # Don't exceed max collection amount
                if collected_amount + delivered_amount > max_total_amount:
                    delivered_amount = max_total_amount - collected_amount
                
                # Update participant tracking
                participant = next((p for p in participants if p['username'] == delivering_citizen), None)
                if participant:
                    participant['amount_delivered'] += delivered_amount
                    participant['deliveries'] += 1
                else:
                    participant = {
                        'username': delivering_citizen,
                        'amount_delivered': delivered_amount,
                        'deliveries': 1,
                        'reward_earned': 0
                    }
                    participants.append(participant)
                
                # Calculate and pay reward
                if reward_per_unit > 0:
                    reward = delivered_amount * reward_per_unit
                    participant['reward_earned'] += reward
                    
                    # Transfer reward to participant
                    citizen = get_citizen_record(tables, delivering_citizen)
                    if citizen:
                        current_ducats = citizen['fields'].get('Ducats', 0)
                        tables['citizens'].update(citizen['id'], {'Ducats': current_ducats + reward})
                        
                        create_notification(
                            tables=tables,
                            citizen_username=delivering_citizen,
                            notification_type="collective_delivery_reward",
                            content=f"Earned {reward} ducats for delivering {delivered_amount} {resource_type}!",
                            details={"reward": reward, "amount_delivered": delivered_amount, "resource_type": resource_type},
                            notes=f"Stratagem {stratagem_id}"
                        )
                
                # Update resource ownership based on target mode
                _transfer_resource_ownership(tables, delivery, target)
                
                # Track delivery
                deliveries.append(activity_id)
                collected_amount += delivered_amount
                
                log.info(f"[Collective Delivery] {delivering_citizen} delivered {delivered_amount} {resource_type} (total: {collected_amount}/{max_total_amount})")
        
        # Update stratagem details
        details['collected_amount'] = collected_amount
        details['participants'] = participants
        details['deliveries'] = deliveries
        details['total_rewards_paid'] = sum(p['reward_earned'] for p in participants)
        
        tables['stratagems'].update(stratagem_id, {
            'Notes': json.dumps(details)  # Changed from 'Details' to 'Notes'
        })
        
        # Send progress update if significant milestone
        if collected_amount > 0 and collected_amount % 100 == 0:
            create_notification(
                tables=tables,
                citizen_username=initiator,
                notification_type="collective_delivery_progress",
                content=f"Collected {collected_amount}/{max_total_amount} {resource_type}. {len(participants)} participants.",
                details={"collected": collected_amount, "max": max_total_amount, "resource_type": resource_type, "participants": len(participants)},
                notes=f"Stratagem {stratagem_id}"
            )
        
        # Continue processing this stratagem
        return True
        
    except Exception as e:
        log.error(f"[Collective Delivery] Error processing stratagem: {e}")
        return False


def _find_new_deliveries(
    tables: Dict[str, Table],
    target: Dict[str, Any],
    resource_type: str,
    processed_deliveries: List[str],
    current_time: datetime
) -> List[Dict[str, Any]]:
    """Find completed delivery activities to the target that haven't been processed."""
    
    # Time window: Look for deliveries completed in the last hour
    one_hour_ago = current_time - timedelta(hours=1)
    
    if target.get('mode') == 'building':
        # Building mode: Find deliveries to specific building
        building_id = target.get('building_id')
        formula = (
            f"AND("
            f"  {{Type}}='deliver_to_storage',"
            f"  {{Status}}='completed',"
            f"  {{ToBuilding}}='{building_id}',"
            f"  IS_AFTER({{EndDate}}, '{one_hour_ago.isoformat()}')"
            f")"
        )
    else:
        # Citizen mode: Find deliveries to any of the citizen's buildings
        building_ids = target.get('building_ids', [])
        if not building_ids:
            return []
        
        building_conditions = [f"{{ToBuilding}}='{bid}'" for bid in building_ids]
        formula = (
            f"AND("
            f"  {{Type}}='deliver_to_storage',"
            f"  {{Status}}='completed',"
            f"  OR({','.join(building_conditions)}),"
            f"  IS_AFTER({{EndDate}}, '{one_hour_ago.isoformat()}')"
            f")"
        )
    
    try:
        all_deliveries = list(tables['activities'].all(formula=formula))
        
        # Filter for resource type and unprocessed deliveries
        new_deliveries = []
        for delivery in all_deliveries:
            if delivery['id'] in processed_deliveries:
                continue
            
            # Check if delivery contains the target resource
            try:
                notes = json.loads(delivery['fields'].get('Notes', '{}'))
                if notes.get('resource_type') == resource_type:
                    new_deliveries.append(delivery)
            except:
                continue
        
        return new_deliveries
        
    except Exception as e:
        log.error(f"[Collective Delivery] Error finding deliveries: {e}")
        return []


def _transfer_resource_ownership(
    tables: Dict[str, Table],
    delivery_activity: Dict[str, Any],
    target: Dict[str, Any]
) -> None:
    """Transfer ownership of delivered resources to the building's RunBy."""
    
    try:
        # Parse delivery manifest
        notes = json.loads(delivery_activity['fields'].get('Notes', '{}'))
        delivery_manifest = notes.get('delivery_manifest', [])
        
        # Determine new owner
        if target.get('mode') == 'building':
            # Get the building's RunBy
            building_id = target.get('building_id')
            building = get_building_record(tables, building_id)
            if building:
                new_owner = building['fields'].get('RunBy')
            else:
                log.error(f"[Collective Delivery] Building {building_id} not found for ownership transfer")
                return
        else:
            # Citizen mode - owner is the target citizen
            new_owner = target.get('citizen_username')
        
        if not new_owner:
            log.error(f"[Collective Delivery] No owner found for resource transfer")
            return
        
        # Update ownership of each delivered resource stack
        for manifest_item in delivery_manifest:
            stack_id = manifest_item.get('stackId')
            if stack_id:
                try:
                    # Get the resource record by ID
                    resource = tables['resources'].get(stack_id)
                    if resource:
                        tables['resources'].update(stack_id, {'Owner': new_owner})
                        log.info(f"[Collective Delivery] Transferred ownership of stack {stack_id} to {new_owner}")
                except Exception as e:
                    log.error(f"[Collective Delivery] Error transferring stack {stack_id}: {e}")
        
    except Exception as e:
        log.error(f"[Collective Delivery] Error in ownership transfer: {e}")


def _end_stratagem(
    tables: Dict[str, Table],
    stratagem_record: Dict[str, Any],
    details: Dict[str, Any],
    reason: str
) -> bool:
    """End the stratagem and handle cleanup."""
    
    stratagem_id = stratagem_record['id']
    initiator = stratagem_record['fields'].get('ExecutedBy')  # Changed from 'Initiator'
    
    # Calculate final stats
    total_collected = details.get('collected_amount', 0)
    total_rewards_paid = details.get('total_rewards_paid', 0)
    escrow_ducats = details.get('escrow_ducats', 0)
    participants = details.get('participants', [])
    
    # Refund unused escrow
    if escrow_ducats > total_rewards_paid:
        refund = escrow_ducats - total_rewards_paid
        initiator_record = get_citizen_record(tables, initiator)
        if initiator_record:
            current_ducats = initiator_record['fields'].get('Ducats', 0)
            tables['citizens'].update(initiator_record['id'], {'Ducats': current_ducats + refund})
            log.info(f"[Collective Delivery] Refunded {refund} unused ducats to {initiator}")
    
    # Send completion notification
    summary = (
        f"Collective delivery ended: {reason}\n"
        f"Total collected: {total_collected} {details.get('resource_type')}\n"
        f"Participants: {len(participants)}\n"
        f"Rewards paid: {total_rewards_paid} ducats"
    )
    
    create_notification(
        tables=tables,
        citizen_username=initiator,
        notification_type="collective_delivery_complete",
        content=summary,
        details={
            "total_collected": total_collected,
            "resource_type": details.get('resource_type'),
            "participants": len(participants),
            "total_rewards_paid": total_rewards_paid,
            "reason": reason
        },
        notes=f"Stratagem {stratagem_id}"
    )
    
    # Update stratagem status
    tables['stratagems'].update(stratagem_id, {
        'Status': 'completed'
        # Removed 'IsActive' and 'CompletedAt' as they don't exist in the schema
    })
    
    log.info(f"{LogColors.OKGREEN}[Collective Delivery] Stratagem ended: {summary}{LogColors.ENDC}")
    
    return False  # Stratagem is complete