"""
Processor for 'deliver_resource_batch' activities.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

# To import utility functions from processActivities.py, we assume it's in the parent of this package.
# This might require adjustments based on how Python's path is configured when running.
# A cleaner way would be to move shared utilities to a common module.
from backend.engine.processActivities import (
    get_citizen_record,
    get_building_record,
    get_contract_record,
    get_building_current_storage,
    _escape_airtable_value,
    update_building_updated_at # Assuming this will be added to processActivities or a shared util
)

# If update_building_updated_at is not in processActivities, define it here or import from its actual location.
# For now, let's assume it will be available. If not, we can define a local helper.

log = logging.getLogger(__name__) # Use a logger specific to this module

def process(
    tables: Dict[str, Any], # Using Any for Table type for simplicity here
    activity_record: Dict, 
    building_type_defs: Dict, 
    resource_defs: Dict
) -> bool:
    """Processes a 'deliver_resource_batch' activity."""
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'deliver_resource_batch' activity: {activity_guid}")

    resources_to_deliver_json = activity_fields.get('Resources')
    to_building_id = activity_fields.get('ToBuilding')
    delivery_person_username = activity_fields.get('Citizen') # This is Username

    if not all([resources_to_deliver_json, to_building_id, delivery_person_username]):
        log.error(f"Activity {activity_guid} is missing crucial data (Resources, ToBuilding, or Citizen).")
        return False

    try:
        resources_to_deliver = json.loads(resources_to_deliver_json)
    except json.JSONDecodeError:
        log.error(f"Failed to parse Resources JSON for activity {activity_guid}: {resources_to_deliver_json}")
        return False

    delivery_person_citizen_record = get_citizen_record(tables, delivery_person_username)
    if not delivery_person_citizen_record:
        log.error(f"Delivery person (citizen) {delivery_person_username} not found for activity {activity_guid}.")
        return False
    # delivery_person_citizen_id (custom ctz_ id) is not directly used in resource query with Asset field.
    # Username (delivery_person_username) will be used for the Asset field.

    dest_building_record = get_building_record(tables, to_building_id)
    if not dest_building_record:
        log.error(f"Destination building {to_building_id} not found for activity {activity_guid}.")
        return False
    
    dest_building_type_str = dest_building_record['fields'].get('Type')
    dest_building_def = building_type_defs.get(dest_building_type_str, {})
    storage_capacity = dest_building_def.get('productionInformation', {}).get('storageCapacity', 0)
    
    current_stored_volume = get_building_current_storage(tables, to_building_id)
    total_amount_to_deposit = sum(item.get('Amount', 0) for item in resources_to_deliver)

    if current_stored_volume + total_amount_to_deposit > storage_capacity:
        log.warning(f"Not enough storage in building {to_building_id} for activity {activity_guid}. "
                    f"Capacity: {storage_capacity}, Used: {current_stored_volume}, To Deposit: {total_amount_to_deposit}")
        return False

    target_owner_username = dest_building_record['fields'].get('RunBy') or dest_building_record['fields'].get('Owner')
    if not target_owner_username:
        log.error(f"Could not determine target owner for resources in building {to_building_id}.")
        return False

    all_resources_transferred = True
    for item in resources_to_deliver:
        resource_type_id = item.get('ResourceId')
        amount = float(item.get('Amount', 0))
        if not resource_type_id or amount <= 0:
            log.warning(f"Invalid resource item in activity {activity_guid}: {item}")
            continue

        # For citizen-carried resources (AssetType='citizen'), Asset field uses Username.
        tracking_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                f"{{Asset}}='{_escape_airtable_value(delivery_person_username)}', " # Asset -> Asset, use Username
                                f"{{AssetType}}='citizen', {{Owner}}='Italia')")
        try:
            tracking_resources = tables['resources'].all(formula=tracking_res_formula, max_records=1)
            if tracking_resources:
                tracking_res_record = tracking_resources[0]
                current_tracking_count = float(tracking_res_record['fields'].get('Count', 0))
                if current_tracking_count > amount: # Assuming amount is what's being delivered from this tracking stock
                    tables['resources'].update(tracking_res_record['id'], {'Count': current_tracking_count - amount})
                else: # Delivered all or more than was tracked (or exactly tracked amount)
                    tables['resources'].delete(tracking_res_record['id'])
                log.info(f"Adjusted import-tracking resource {resource_type_id} for delivery citizen {delivery_person_username}.")
            else:
                log.warning(f"Import-tracking resource {resource_type_id} not found for delivery citizen {delivery_person_username}. This might indicate a prior issue.")
        except Exception as e_track:
            log.error(f"Error adjusting import-tracking resource {resource_type_id} for {delivery_person_username}: {e_track}")
            all_resources_transferred = False; break

        # For building resources (AssetType='building'), Asset field uses BuildingId.
        # The Owner is the target_owner_username (RunBy or Owner of the building).
        # BuildingId field is also present for convenience.
        building_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                f"{{Asset}}='{_escape_airtable_value(to_building_id)}', " # Asset -> Asset
                                f"{{AssetType}}='building', "
                                f"{{Owner}}='{_escape_airtable_value(target_owner_username)}')")
        try:
            existing_building_resources = tables['resources'].all(formula=building_res_formula, max_records=1)
            now_iso = datetime.now(timezone.utc).isoformat()
            if existing_building_resources:
                bres_record = existing_building_resources[0]
                new_count = float(bres_record['fields'].get('Count', 0)) + amount
                tables['resources'].update(bres_record['id'], {'Count': new_count})
                log.info(f"Updated resource {resource_type_id} count in building {to_building_id} for {target_owner_username} to {new_count}.")
            else:
                res_def = resource_defs.get(resource_type_id, {})
                building_pos_str = dest_building_record['fields'].get('Position', '{}')
                
                new_resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    # "Category": res_def.get('category', 'Unknown'), # Removed Category
                    "BuildingId": to_building_id, # Custom BuildingId
                    "Asset": to_building_id,      # Asset field stores BuildingId for AssetType='building'
                    "AssetType": "building",
                    "Owner": target_owner_username,
                    "Count": amount,
                    "Position": building_pos_str,
                    "CreatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload)
                log.info(f"Created new resource {resource_type_id} in building {to_building_id} for {target_owner_username}.")
        except Exception as e_deposit:
            log.error(f"Error depositing resource {resource_type_id} into {to_building_id}: {e_deposit}")
            all_resources_transferred = False; break
            
    if not all_resources_transferred:
        log.error(f"Resource transfer failed for activity {activity_guid}. Financial transactions will be skipped.")
        return False

    notes = activity_fields.get('Notes', '')
    contract_ids_match = re.search(r"Involves Contract IDs: ([\w\s,-]+)", notes)
    if not contract_ids_match:
        log.error(f"Could not parse original Contract IDs from notes for activity {activity_guid}: {notes}")
        return False
    
    original_contract_ids_str = contract_ids_match.group(1)
    original_contract_ids = [cid.strip() for cid in original_contract_ids_str.split(',')]

    all_financials_processed = True
    for original_contract_id in original_contract_ids:
        contract_record = get_contract_record(tables, original_contract_id)
        if not contract_record:
            log.warning(f"Original contract {original_contract_id} not found for activity {activity_guid}. Skipping its financial part.")
            all_financials_processed = False
            continue

        contract_fields = contract_record['fields']
        buyer_username = contract_fields.get('Buyer')
        seller_username = contract_fields.get('Seller')
        price_per_resource = float(contract_fields.get('PricePerResource', 0))
        amount_for_this_contract_part = float(contract_fields.get('HourlyAmount', 0)) 
        
        if not buyer_username or not seller_username or price_per_resource <= 0 or amount_for_this_contract_part <= 0:
            log.warning(f"Contract {original_contract_id} has invalid financial details. Skipping.")
            all_financials_processed = False
            continue

        total_cost = price_per_resource * amount_for_this_contract_part
        buyer_citizen_rec = get_citizen_record(tables, buyer_username)
        seller_citizen_rec = get_citizen_record(tables, seller_username)

        if not buyer_citizen_rec or not seller_citizen_rec:
            log.warning(f"Buyer or Seller citizen record not found for contract {original_contract_id}. Skipping.")
            all_financials_processed = False
            continue
        
        try:
            buyer_ducats = float(buyer_citizen_rec['fields'].get('Ducats', 0))
            seller_ducats = float(seller_citizen_rec['fields'].get('Ducats', 0))

            tables['citizens'].update(buyer_citizen_rec['id'], {'Ducats': buyer_ducats - total_cost})
            tables['citizens'].update(seller_citizen_rec['id'], {'Ducats': seller_ducats + total_cost})

            transaction_payload = {
                "Type": "import_payment",
                "AssetType": "contract",
                "Asset": original_contract_id,
                "Seller": seller_username,
                "Buyer": buyer_username,
                "Price": total_cost,
                "Details": json.dumps({
                    "resource_type": contract_fields.get('ResourceType'),
                    "amount": amount_for_this_contract_part,
                    "price_per_unit": price_per_resource,
                    "activity_guid": activity_guid
                }),
                "CreatedAt": datetime.now(timezone.utc).isoformat(),
                "ExecutedAt": datetime.now(timezone.utc).isoformat()
            }
            tables['transactions'].create(transaction_payload)
            log.info(f"Processed financial transaction for contract {original_contract_id} (Activity: {activity_guid}). Cost: {total_cost}")
        except Exception as e_finance:
            log.error(f"Error processing financial transaction for contract {original_contract_id}: {e_finance}")
            all_financials_processed = False
    
    # Building UpdatedAt is handled by Airtable
    return all_financials_processed
