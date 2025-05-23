"""
Processor for 'eat' activities.
Handles consumption of food from inventory, home, or tavern.
Updates citizen's 'AteAt' timestamp.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Optional, Any

from backend.engine.processActivities import (
    get_citizen_record,
    # get_building_record_by_airtable_id, # This will be a local helper or imported
    _escape_airtable_value
)

# Local helper or import if shared
def _get_building_by_airtable_id(tables: Dict[str, Any], airtable_id: str) -> Optional[Dict]:
    try:
        return tables['buildings'].get(airtable_id)
    except Exception as e:
        log.error(f"Error fetching building by Airtable ID {airtable_id}: {e}")
        return None

log = logging.getLogger(__name__)

# Standard amount of "hunger" one meal satisfies, or a generic food unit.
# This could be more complex if different foods satisfy different hunger amounts.
FOOD_UNIT_CONSUMED = 1.0 
TAVERN_MEAL_COST = 10 # Ducats

def _update_citizen_ate_at(tables: Dict[str, Any], citizen_airtable_id: str, timestamp_iso: str) -> bool:
    """Helper to update AteAt for a citizen."""
    try:
        tables['citizens'].update(citizen_airtable_id, {
            'AteAt': timestamp_iso
        })
        return True
    except Exception as e:
        log.error(f"Error updating AteAt for citizen {citizen_airtable_id}: {e}")
        return False

def process_eat_from_inventory(
    tables: Dict[str, Any],
    activity_record: Dict,
    resource_defs: Dict # For food details if needed in future
) -> bool:
    """Processes an 'eat_from_inventory' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    food_resource_type = activity_fields.get('ResourceId')
    amount_to_eat = float(activity_fields.get('Amount', FOOD_UNIT_CONSUMED))

    log.info(f"Processing 'eat_from_inventory' ({activity_guid}) for {citizen_username}, eating {food_resource_type}")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False
    
    # Resource is identified by AssetType='citizen', Asset=citizen_username, Owner=citizen_username, Type=food_resource_type
    # This assumes the 'Asset' field now holds Username for citizen-carried items.
    resource_formula = (f"AND({{AssetType}}='citizen', "
                        f"{{Asset}}='{_escape_airtable_value(citizen_username)}', "
                        f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                        f"{{Type}}='{_escape_airtable_value(food_resource_type)}')")
    try:
        food_records = tables['resources'].all(formula=resource_formula, max_records=1)
        if not food_records:
            log.warning(f"Food {food_resource_type} not found in {citizen_username}'s inventory for activity {activity_guid}.")
            return False # Cannot eat if food is gone

        food_record = food_records[0]
        current_amount = float(food_record['fields'].get('Count', 0))

        if current_amount < amount_to_eat:
            log.warning(f"Not enough {food_resource_type} ({current_amount}) in {citizen_username}'s inventory to eat {amount_to_eat} for activity {activity_guid}.")
            # Optionally, eat what's available if current_amount > 0
            amount_to_eat = current_amount # Eat all available
            if amount_to_eat <= 0: return False


        new_amount = current_amount - amount_to_eat
        now_iso = datetime.now(timezone.utc).isoformat()

        if new_amount > 0.001: # Epsilon for float comparison
            tables['resources'].update(food_record['id'], {'Count': new_amount})
        else:
            tables['resources'].delete(food_record['id'])
        
        log.info(f"Citizen {citizen_username} consumed {amount_to_eat} of {food_resource_type} from inventory. New amount: {new_amount if new_amount > 0.001 else 0}")
        
        return _update_citizen_ate_at(tables, citizen_record['id'], now_iso)

    except Exception as e:
        log.error(f"Error processing 'eat_from_inventory' for {citizen_username} ({activity_guid}): {e}")
        return False

def process_eat_at_home(
    tables: Dict[str, Any],
    activity_record: Dict,
    resource_defs: Dict
) -> bool:
    """Processes an 'eat_at_home' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    home_building_airtable_id = activity_fields.get('FromBuilding') # Home is the location
    food_resource_type = activity_fields.get('ResourceId')
    amount_to_eat = float(activity_fields.get('Amount', FOOD_UNIT_CONSUMED))

    log.info(f"Processing 'eat_at_home' ({activity_guid}) for {citizen_username} at {home_building_airtable_id}, eating {food_resource_type}")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False

    home_building_record = _get_building_by_airtable_id(tables, home_building_airtable_id)
    if not home_building_record:
        log.error(f"Home building {home_building_airtable_id} not found for activity {activity_guid}.")
        return False
    home_building_custom_id = home_building_record['fields'].get('BuildingId')
    if not home_building_custom_id:
        log.error(f"Home building {home_building_airtable_id} missing BuildingId for activity {activity_guid}.")
        return False

    # Resource is identified by AssetType='building', Asset=home_building_custom_id, Owner=citizen_username, Type=food_resource_type
    resource_formula = (f"AND({{AssetType}}='building', "
                        f"{{Asset}}='{_escape_airtable_value(home_building_custom_id)}', "
                        f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                        f"{{Type}}='{_escape_airtable_value(food_resource_type)}')")
    try:
        food_records = tables['resources'].all(formula=resource_formula, max_records=1)
        if not food_records:
            log.warning(f"Food {food_resource_type} not found in home {home_building_custom_id} for {citizen_username} (activity {activity_guid}).")
            return False

        food_record = food_records[0]
        current_amount = float(food_record['fields'].get('Count', 0))

        if current_amount < amount_to_eat:
            log.warning(f"Not enough {food_resource_type} ({current_amount}) in home {home_building_custom_id} to eat {amount_to_eat} for activity {activity_guid}.")
            amount_to_eat = current_amount
            if amount_to_eat <= 0: return False

        new_amount = current_amount - amount_to_eat
        now_iso = datetime.now(timezone.utc).isoformat()

        if new_amount > 0.001:
            tables['resources'].update(food_record['id'], {'Count': new_amount})
        else:
            tables['resources'].delete(food_record['id'])
        
        log.info(f"Citizen {citizen_username} consumed {amount_to_eat} of {food_resource_type} at home {home_building_custom_id}. New amount: {new_amount if new_amount > 0.001 else 0}")
        
        if _update_citizen_ate_at(tables, citizen_record['id'], now_iso):
            # Building UpdatedAt is handled by Airtable
            return True
        return False

    except Exception as e:
        log.error(f"Error processing 'eat_at_home' for {citizen_username} ({activity_guid}): {e}")
        return False

def process_eat_at_tavern(
    tables: Dict[str, Any],
    activity_record: Dict,
    resource_defs: Dict # Not used for tavern, but for signature consistency
) -> bool:
    """Processes an 'eat_at_tavern' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    tavern_building_airtable_id = activity_fields.get('FromBuilding') # Tavern is the location

    log.info(f"Processing 'eat_at_tavern' ({activity_guid}) for {citizen_username} at {tavern_building_airtable_id}")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False

    tavern_record = _get_building_by_airtable_id(tables, tavern_building_airtable_id)
    if not tavern_record:
        log.error(f"Tavern building {tavern_building_airtable_id} not found for activity {activity_guid}.")
        return False

    current_ducats = float(citizen_record['fields'].get('Ducats', 0))
    if current_ducats < TAVERN_MEAL_COST:
        log.warning(f"Citizen {citizen_username} has insufficient Ducats ({current_ducats}) for tavern meal (cost: {TAVERN_MEAL_COST}) for activity {activity_guid}.")
        # Create a problem? For now, just fail the eating.
        return False
    
    try:
        new_ducats = current_ducats - TAVERN_MEAL_COST
        now_iso = datetime.now(timezone.utc).isoformat()
        
        tables['citizens'].update(citizen_record['id'], {'Ducats': new_ducats})
        log.info(f"Citizen {citizen_username} paid {TAVERN_MEAL_COST} Ducats for a meal at tavern. New balance: {new_ducats}")
        
        # Create a transaction record for the meal purchase
        tavern_operator = tavern_record['fields'].get('RunBy') or tavern_record['fields'].get('Owner', "UnknownTavernOperator")
        
        transaction_payload = {
            "Type": "tavern_meal",
            "AssetType": "service",
            "AssetId": tavern_building_airtable_id, # Could be tavern's custom ID if available
            "Seller": tavern_operator, # The tavern operator
            "Buyer": citizen_username,
            "Price": TAVERN_MEAL_COST,
            "Details": json.dumps({
                "activity_guid": activity_guid,
                "tavern_id": tavern_building_airtable_id
            }),
            "CreatedAt": now_iso,
            "ExecutedAt": now_iso
        }
        tables['transactions'].create(transaction_payload)
        log.info(f"Created transaction record for {citizen_username}'s tavern meal.")
        
        # Credit the tavern operator
        operator_record = get_citizen_record(tables, tavern_operator)
        if operator_record:
            operator_ducats = float(operator_record['fields'].get('Ducats', 0))
            tables['citizens'].update(operator_record['id'], {'Ducats': operator_ducats + TAVERN_MEAL_COST})
            log.info(f"Credited tavern operator {tavern_operator} with {TAVERN_MEAL_COST} Ducats.")
        else:
            log.warning(f"Could not find tavern operator {tavern_operator} to credit meal cost.")

        if _update_citizen_ate_at(tables, citizen_record['id'], now_iso):
            # Building UpdatedAt is handled by Airtable
            return True
        return False
        
    except Exception as e:
        log.error(f"Error processing 'eat_at_tavern' for {citizen_username} ({activity_guid}): {e}")
        return False

# Main dispatcher for eat activities (if needed, or call specific processors directly)
def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, # Not used by eat processors but part of general signature
    resource_defs: Dict
) -> bool:
    activity_type = activity_record['fields'].get('Type')
    if activity_type == "eat_from_inventory":
        return process_eat_from_inventory(tables, activity_record, resource_defs)
    elif activity_type == "eat_at_home":
        return process_eat_at_home(tables, activity_record, resource_defs)
    elif activity_type == "eat_at_tavern":
        return process_eat_at_tavern(tables, activity_record, resource_defs)
    else:
        log.warning(f"Unknown eat activity type: {activity_type}")
        return False
