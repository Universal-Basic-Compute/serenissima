"""
Processor for 'fetch_from_galley' activities.
Handles a citizen picking up resources from a merchant_galley.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

# Assuming shared utilities are accessible, e.g., from processActivities or a common util module
# For now, let's define necessary local helpers or assume they'd be imported.
# from backend.engine.processActivities import get_citizen_record, _escape_airtable_value, get_building_record_by_airtable_id
# For simplicity, we'll define local versions or simplified logic if not directly available.

log = logging.getLogger(__name__)

CITIZEN_STORAGE_CAPACITY = 10.0 # Standard citizen carrying capacity

def _get_citizen_record_local(tables: Dict[str, Any], username: str) -> Optional[Dict]:
    formula = f"{{Username}} = '{username.replace(\"'\", \"\\\\'\")}'"
    try:
        records = tables['citizens'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error fetching citizen {username}: {e}")
        return None

def _get_building_by_airtable_id_local(tables: Dict[str, Any], airtable_id: str) -> Optional[Dict]:
    try:
        return tables['buildings'].get(airtable_id)
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error fetching building by Airtable ID {airtable_id}: {e}")
        return None

def get_citizen_current_load_local(tables: Dict[str, Any], citizen_username: str) -> float:
    formula = f"AND({{Asset}}='{citizen_username.replace(\"'\", \"\\\\'\")}', {{AssetType}}='citizen')"
    current_load = 0.0
    try:
        resources_carried = tables['resources'].all(formula=formula)
        for resource in resources_carried:
            current_load += float(resource['fields'].get('Count', 0))
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error calculating load for {citizen_username}: {e}")
    return current_load

def get_resource_stock_in_galley(
    tables: Dict[str, Any], 
    galley_custom_id: str, 
    resource_type_id: str
) -> Optional[Dict]:
    """Gets the specific resource record from the galley (owned by Italia)."""
    formula = (f"AND({{Type}}='{resource_type_id.replace(\"'\", \"\\\\'\")}', "
               f"{{Asset}}='{galley_custom_id.replace(\"'\", \"\\\\'\")}', "
               f"{{AssetType}}='building', "
               f"{{Owner}}='Italia')")
    try:
        records = tables['resources'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error fetching stock for {resource_type_id} in galley {galley_custom_id}: {e}")
        return None

def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, # For storage capacity if needed, not directly used here
    resource_defs: Dict      # For resource names, etc.
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'fetch_from_galley' activity: {activity_guid}")

    carrier_username = activity_fields.get('Citizen')
    # FromBuilding in activity is the Airtable Record ID of the galley
    galley_airtable_id = activity_fields.get('FromBuilding') 
    # OriginalContractId is the custom ID string of the original import contract
    original_contract_custom_id = activity_fields.get('OriginalContractId')
    resource_id_to_fetch = activity_fields.get('ResourceId')
    amount_to_fetch_from_contract = float(activity_fields.get('Amount', 0)) # Amount specified by the original contract part

    if not all([carrier_username, galley_airtable_id, original_contract_custom_id, resource_id_to_fetch, amount_to_fetch_from_contract > 0]):
        log.error(f"Activity {activity_guid} is missing crucial data.")
        return False

    # 1. Fetch records
    carrier_citizen_record = _get_citizen_record_local(tables, carrier_username)
    if not carrier_citizen_record:
        log.error(f"[fetch_from_galley_proc] Carrier citizen {carrier_username} not found.")
        return False
    carrier_airtable_id = carrier_citizen_record['id']

    galley_building_record = _get_building_by_airtable_id_local(tables, galley_airtable_id)
    if not galley_building_record:
        log.error(f"[fetch_from_galley_proc] Galley building (Airtable ID: {galley_airtable_id}) not found.")
        return False
    galley_custom_id = galley_building_record['fields'].get('BuildingId')
    galley_position_str = galley_building_record['fields'].get('Position', '{}')
    if not galley_custom_id:
        log.error(f"[fetch_from_galley_proc] Galley building {galley_airtable_id} missing BuildingId.")
        return False

    # Fetch original contract to determine the ultimate buyer
    # Assuming OriginalContractId in activity is the custom ContractId string
    original_contract_record = None
    try:
        formula_contract = f"{{ContractId}} = '{original_contract_custom_id.replace(\"'\", \"\\\\'\")}'"
        contracts_found = tables['contracts'].all(formula=formula_contract, max_records=1)
        if contracts_found:
            original_contract_record = contracts_found[0]
        else:
            log.error(f"[fetch_from_galley_proc] Original contract {original_contract_custom_id} not found.")
            return False
    except Exception as e_orig_contract:
        log.error(f"[fetch_from_galley_proc] Error fetching original contract {original_contract_custom_id}: {e_orig_contract}")
        return False
    
    ultimate_buyer_username = original_contract_record['fields'].get('Buyer')
    if not ultimate_buyer_username:
        log.error(f"[fetch_from_galley_proc] Original contract {original_contract_custom_id} missing Buyer.")
        return False

    # 2. Calculate capacity and availability
    carrier_current_load = get_citizen_current_load_local(tables, carrier_username)
    carrier_remaining_capacity = max(0, CITIZEN_STORAGE_CAPACITY - carrier_current_load)

    galley_resource_record = get_resource_stock_in_galley(tables, galley_custom_id, resource_id_to_fetch)
    if not galley_resource_record:
        log.warning(f"[fetch_from_galley_proc] Resource {resource_id_to_fetch} not found in galley {galley_custom_id} (owned by Italia).")
        return False # Cannot fetch if resource not in galley
    
    stock_in_galley = float(galley_resource_record['fields'].get('Count', 0))

    # 3. Determine actual amount to pick up
    actual_amount_to_pickup = amount_to_fetch_from_contract # Start with the amount for this contract part
    
    if actual_amount_to_pickup > stock_in_galley:
        log.warning(f"[fetch_from_galley_proc] Requested {actual_amount_to_pickup} of {resource_id_to_fetch} but only {stock_in_galley} in galley {galley_custom_id}. Limiting.")
        actual_amount_to_pickup = stock_in_galley
    
    if actual_amount_to_pickup > carrier_remaining_capacity:
        log.warning(f"[fetch_from_galley_proc] Amount {actual_amount_to_pickup} of {resource_id_to_fetch} exceeds carrier {carrier_username} capacity {carrier_remaining_capacity}. Limiting.")
        actual_amount_to_pickup = carrier_remaining_capacity
    
    actual_amount_to_pickup = float(f"{actual_amount_to_pickup:.4f}") # Standardize precision

    if actual_amount_to_pickup <= 0:
        log.info(f"[fetch_from_galley_proc] Calculated amount to pick up for {resource_id_to_fetch} is {actual_amount_to_pickup}. Nothing to fetch.")
        # Update carrier's position to Galley as they arrived there
        try:
            tables['citizens'].update(carrier_airtable_id, {'Position': galley_position_str})
            log.info(f"[fetch_from_galley_proc] Updated carrier {carrier_username} position to galley {galley_custom_id} ({galley_position_str}).")
        except Exception as e_pos_update:
            log.error(f"[fetch_from_galley_proc] Error updating carrier {carrier_username} position: {e_pos_update}")
            return False
        return True # Successfully "arrived" even if nothing picked up

    # 4. Perform Resource Transfers
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        # Decrement resource from galley
        new_galley_stock = stock_in_galley - actual_amount_to_pickup
        if new_galley_stock > 0.001:
            tables['resources'].update(galley_resource_record['id'], {'Count': new_galley_stock})
        else:
            tables['resources'].delete(galley_resource_record['id'])
        log.info(f"[fetch_from_galley_proc] Decremented {actual_amount_to_pickup} of {resource_id_to_fetch} from galley {galley_custom_id}.")

        # Add resource to carrier citizen's inventory, owned by the ultimate_buyer_username
        carrier_res_formula = (f"AND({{Type}}='{resource_id_to_fetch.replace(\"'\", \"\\\\'\")}', "
                               f"{{Asset}}='{carrier_username.replace(\"'\", \"\\\\'\")}', "
                               f"{{AssetType}}='citizen', "
                               f"{{Owner}}='{ultimate_buyer_username.replace(\"'\", \"\\\\'\")}')")
        existing_carrier_res = tables['resources'].all(formula=carrier_res_formula, max_records=1)
        res_def_details = resource_defs.get(resource_id_to_fetch, {})

        if existing_carrier_res:
            carrier_res_record_id = existing_carrier_res[0]['id']
            new_carrier_count = float(existing_carrier_res[0]['fields'].get('Count', 0)) + actual_amount_to_pickup
            tables['resources'].update(carrier_res_record_id, {'Count': new_carrier_count})
            log.info(f"[fetch_from_galley_proc] Updated {resource_id_to_fetch} for carrier {carrier_username} to {new_carrier_count} (owned by {ultimate_buyer_username}).")
        else:
            new_carrier_res_payload = {
                "ResourceId": f"resource-{uuid.uuid4()}",
                "Type": resource_id_to_fetch,
                "Name": res_def_details.get('name', resource_id_to_fetch),
                "Asset": carrier_username,
                "AssetType": "citizen",
                "Owner": ultimate_buyer_username, # Resources on citizen are owned by the contract's original buyer
                "Count": actual_amount_to_pickup,
                "Position": galley_position_str, # Citizen is at the galley
                "CreatedAt": now_iso
            }
            tables['resources'].create(new_carrier_res_payload)
            log.info(f"[fetch_from_galley_proc] Created {actual_amount_to_pickup} of {resource_id_to_fetch} for carrier {carrier_username} (owned by {ultimate_buyer_username}).")

        # Update carrier's position to Galley
        tables['citizens'].update(carrier_airtable_id, {'Position': galley_position_str})
        log.info(f"[fetch_from_galley_proc] Updated carrier {carrier_username} position to galley {galley_custom_id} ({galley_position_str}).")

        # Update PendingDeliveriesData on the galley building
        # This is complex: find the specific item in JSON, update its 'picked_up_amount' or remove if fully picked.
        # For now, let's assume this part is handled by a separate mechanism or that createActivities won't recreate for this item.
        # A simple way is to add a note to the activity that it was processed.
        # A more robust way: the galley's PendingDeliveriesData is a list of dicts.
        # We need to find the dict matching original_contract_custom_id and resource_id_to_fetch,
        # then reduce its 'amount' by actual_amount_to_pickup. If amount becomes <=0, remove the dict.
        
        pending_data_str = galley_building_record['fields'].get('PendingDeliveriesData', '[]')
        try:
            pending_deliveries = json.loads(pending_data_str)
            updated_pending_deliveries = []
            item_found_and_updated = False
            for item in pending_deliveries:
                if item.get('contract_id') == original_contract_custom_id and \
                   item.get('resource_type') == resource_id_to_fetch:
                    item_found_and_updated = True
                    remaining_amount_in_item = float(item.get('amount', 0)) - actual_amount_to_pickup
                    if remaining_amount_in_item > 0.001:
                        item['amount'] = remaining_amount_in_item
                        updated_pending_deliveries.append(item)
                    # If remaining is zero or less, it's fully picked up, so don't add back.
                else:
                    updated_pending_deliveries.append(item)
            
            if item_found_and_updated:
                tables['buildings'].update(galley_airtable_id, {"PendingDeliveriesData": json.dumps(updated_pending_deliveries)})
                log.info(f"[fetch_from_galley_proc] Updated PendingDeliveriesData on galley {galley_custom_id}.")
            else:
                log.warning(f"[fetch_from_galley_proc] Could not find matching item in PendingDeliveriesData for contract {original_contract_custom_id}, resource {resource_id_to_fetch} on galley {galley_custom_id}.")

        except json.JSONDecodeError:
            log.error(f"[fetch_from_galley_proc] Could not parse PendingDeliveriesData from galley {galley_custom_id}.")
        except Exception as e_pdd:
            log.error(f"[fetch_from_galley_proc] Error updating PendingDeliveriesData on galley {galley_custom_id}: {e_pdd}")


    except Exception as e_process:
        log.error(f"[fetch_from_galley_proc] Error during transaction processing for activity {activity_guid}: {e_process}")
        return False
            
    log.info(f"Successfully processed 'fetch_from_galley' activity {activity_guid}. Picked up {actual_amount_to_pickup} of {resource_id_to_fetch}.")
    return True
