"""
Processor for 'fetch_from_storage' activities.
Citizen arrives at storage facility, picks up resources they own (stored under a
storage_query contract), and conceptually transports them to their ToBuilding (workplace).
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Optional, Any, List

from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    get_contract_record,
    get_building_current_storage, # May not be needed if only moving own resources
    _escape_airtable_value,
    VENICE_TIMEZONE, LogColors,
    CITIZEN_CARRY_CAPACITY, # Assuming this is defined in utils or passed
    get_citizen_current_load
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE

log = logging.getLogger(__name__)


def _update_activity_notes_with_failure_reason(tables: Dict[str, Any], activity_airtable_id: str, failure_reason: str):
    """Appends a failure reason to the activity's Notes field."""
    try:
        activity_to_update = tables['activities'].get(activity_airtable_id)
        if not activity_to_update:
            log.error(f"Could not find activity {activity_airtable_id} to update notes with failure reason.")
            return
        existing_notes = activity_to_update['fields'].get('Notes', '')
        timestamp = datetime.now(VENICE_TIMEZONE).strftime("%Y-%m-%d %H:%M:%S %Z")
        new_note_entry = f"\n[FAILURE - {timestamp}] {failure_reason}"
        updated_notes = existing_notes + new_note_entry
        tables['activities'].update(activity_airtable_id, {'Notes': updated_notes})
    except Exception as e:
        log.error(f"Error updating notes for activity {activity_airtable_id}: {e}")

def process(
    tables: Dict[str, Any],
    activity_record: Dict,
    building_type_defs: Dict,
    resource_defs: Dict
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"📦 Processing 'fetch_from_storage' activity: {activity_guid}")

    resources_to_fetch_json = activity_fields.get('Resources') # Expects JSON list of {"ResourceId": X, "Amount": Y}
    from_building_custom_id = activity_fields.get('FromBuilding') # Storage facility
    to_building_custom_id = activity_fields.get('ToBuilding')     # Workplace/Business
    fetch_person_username = activity_fields.get('Citizen')
    storage_query_contract_custom_id_from_activity = activity_fields.get('ContractId') # This is now the custom ContractId

    if not all([resources_to_fetch_json, from_building_custom_id, to_building_custom_id,
                fetch_person_username, storage_query_contract_custom_id_from_activity]):
        err_msg = "Activity missing crucial data (Resources, FromBuilding, ToBuilding, Citizen, or ContractId (custom))."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    try:
        resources_to_fetch_list = json.loads(resources_to_fetch_json)
        if not isinstance(resources_to_fetch_list, list):
            raise ValueError("Resources JSON is not a list.")
    except (json.JSONDecodeError, ValueError) as e:
        err_msg = f"Failed to parse Resources JSON or not a list: {resources_to_fetch_json}. Error: {e}"
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Get citizen (fetch person)
    fetch_person_record = get_citizen_record(tables, fetch_person_username)
    if not fetch_person_record:
        err_msg = f"Fetch person {fetch_person_username} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Get storage facility (FromBuilding)
    storage_facility_record = get_building_record(tables, from_building_custom_id)
    if not storage_facility_record:
        err_msg = f"Storage facility (FromBuilding) {from_building_custom_id} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Get destination building (ToBuilding - e.g., workplace)
    destination_building_record = get_building_record(tables, to_building_custom_id)
    if not destination_building_record:
        err_msg = f"Destination building (ToBuilding) {to_building_custom_id} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    destination_building_def = building_type_defs.get(destination_building_record['fields'].get('Type'), {})
    destination_storage_capacity = destination_building_def.get('productionInformation', {}).get('storageCapacity', 0)
    destination_operator_username = destination_building_record['fields'].get('RunBy')
    if not destination_operator_username:
        err_msg = f"Destination building {to_building_custom_id} has no RunBy operator."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Get storage_query contract using its custom ID from the activity
    sq_contract_record = get_contract_record(tables, storage_query_contract_custom_id_from_activity)
    if not sq_contract_record:
        err_msg = f"Storage query contract (Custom ID: {storage_query_contract_custom_id_from_activity}) not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
        
    sq_contract_fields = sq_contract_record['fields']
    # storage_query_contract_id is now the custom ID, so use it for logging if needed.
    # The Airtable record ID is sq_contract_record['id'] if required for other operations.
    sq_buyer_username = sq_contract_fields.get('Buyer') # This is the owner of the resources in storage

    # The fetch_person_username might be an employee of sq_buyer_username, or sq_buyer_username themselves.
    # Resources in storage are owned by sq_buyer_username.
    # Resources picked up by fetch_person_username will be owned by fetch_person_username temporarily.
    # Resources deposited at ToBuilding will be owned by destination_operator_username.

    now_iso = datetime.now(VENICE_TIMEZONE).isoformat()
    
    # Check citizen's carry capacity
    current_citizen_load = get_citizen_current_load(tables, fetch_person_username)
    remaining_carry_capacity = CITIZEN_CARRY_CAPACITY - current_citizen_load

    total_amount_to_pickup_this_activity = sum(float(item.get('Amount', 0)) for item in resources_to_fetch_list)
    if total_amount_to_pickup_this_activity > remaining_carry_capacity:
        # This ideally should be checked by the activity creator.
        # For now, we'll log and potentially fail or adjust.
        # Let's assume the creator already limited by capacity. If not, this is a safeguard.
        err_msg = (f"Citizen {fetch_person_username} cannot carry {total_amount_to_pickup_this_activity:.2f} units. "
                   f"Current load: {current_citizen_load:.2f}, Capacity: {CITIZEN_CARRY_CAPACITY:.2f}, Remaining: {remaining_carry_capacity:.2f}.")
        log.warning(f"{err_msg} Activity: {activity_guid}. Will attempt to fetch up to remaining capacity if possible, or fail if individual items exceed.")
        # For simplicity, if total exceeds, we fail. A more complex logic could pro-rate.
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False


    for item_to_fetch in resources_to_fetch_list:
        resource_type_id = item_to_fetch.get('ResourceId')
        amount_requested = float(item_to_fetch.get('Amount', 0))

        if not resource_type_id or amount_requested <= 0:
            continue

        # Step 1: "Pick up" from Storage Facility (FromBuilding)
        # Resources are owned by sq_buyer_username, stored in FromBuilding
        storage_res_formula = (
            f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
            f"{{Asset}}='{_escape_airtable_value(from_building_custom_id)}', "
            f"{{AssetType}}='building', "
            f"{{Owner}}='{_escape_airtable_value(sq_buyer_username)}')"
        )
        try:
            storage_res_records = tables['resources'].all(formula=storage_res_formula, max_records=1)
            if not storage_res_records or float(storage_res_records[0]['fields'].get('Count', 0)) < amount_requested:
                err_msg = f"Insufficient stock of {resource_type_id} ({storage_res_records[0]['fields'].get('Count', 0) if storage_res_records else 0} available) " \
                          f"in storage {from_building_custom_id} (Owner: {sq_buyer_username}) to fetch {amount_requested}."
                log.error(f"{err_msg} Activity: {activity_guid}")
                _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
                # Trust: Fetch person failed to get goods for sq_buyer from storage
                if fetch_person_username and sq_buyer_username:
                    update_trust_score_for_activity(tables, fetch_person_username, sq_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_from_storage_pickup", False, "storage_stock_insufficient")
                return False 

            storage_res_record = storage_res_records[0]
            new_storage_count = float(storage_res_record['fields'].get('Count', 0)) - amount_requested
            if new_storage_count > 0.001:
                tables['resources'].update(storage_res_record['id'], {'Count': new_storage_count})
            else:
                tables['resources'].delete(storage_res_record['id'])
            storage_facility_name_log = storage_facility_record['fields'].get('Name', from_building_custom_id)
            log.info(f"📦 Decremented **{amount_requested:.2f}** of **{resource_type_id}** from storage **{storage_facility_name_log}** ({from_building_custom_id}) (Owner: **{sq_buyer_username}**).")
        except Exception as e_pickup:
            err_msg = f"Error picking up {resource_type_id} from storage {from_building_custom_id}: {e_pickup}"
            log.error(f"{err_msg} Activity: {activity_guid}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            return False

        # Add to citizen's inventory (owned by citizen temporarily)
        # For simplicity, assume resources picked up by fetch_person are owned by them during transit.
        # Or, if fetch_person is an employee of sq_buyer, they are owned by sq_buyer.
        # Let's assume owned by fetch_person for now.
        citizen_inv_formula = (
            f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
            f"{{Asset}}='{_escape_airtable_value(fetch_person_username)}', "
            f"{{AssetType}}='citizen', "
            f"{{Owner}}='{_escape_airtable_value(fetch_person_username)}')"
        )
        try:
            existing_citizen_inv = tables['resources'].all(formula=citizen_inv_formula, max_records=1)
            res_def_temp = resource_defs.get(resource_type_id, {}) # For name
            if existing_citizen_inv:
                inv_record = existing_citizen_inv[0]
                new_inv_count = float(inv_record['fields'].get('Count', 0)) + amount_requested
                tables['resources'].update(inv_record['id'], {'Count': new_inv_count})
            else:
                tables['resources'].create({
                    "ResourceId": f"resource-{uuid.uuid4()}", "Type": resource_type_id,
                    "Name": res_def_temp.get('name', resource_type_id),
                    "Asset": fetch_person_username, "AssetType": "citizen",
                    "Owner": fetch_person_username, "Count": amount_requested, "CreatedAt": now_iso,
                    "Notes": f"Fetched from storage under contract {storage_query_contract_custom_id_from_activity}"
                })
            log.info(f"🛍️ Added **{amount_requested:.2f}** of **{resource_type_id}** to **{fetch_person_username}**'s inventory.")
        except Exception as e_inv_add:
            err_msg = f"Error adding {resource_type_id} to {fetch_person_username}'s inventory: {e_inv_add}"
            log.error(f"{err_msg} Activity: {activity_guid}")
            # Attempt to revert pickup from storage
            # ... (revert logic would be complex, for now, mark as fail)
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            return False

    # Citizen "arrives" at ToBuilding (workplace) - this is conceptual for this processor
    # Step 2: "Deposit" into ToBuilding (Workplace)
    # Resources are taken from citizen's inventory and added to workplace, owned by workplace operator.
    
    # Check destination storage capacity
    current_dest_stored_volume = get_building_current_storage(tables, to_building_custom_id)
    if current_dest_stored_volume + total_amount_to_pickup_this_activity > destination_storage_capacity:
        err_msg = (f"Not enough storage in destination building {to_building_custom_id}. "
                   f"Capacity: {destination_storage_capacity}, Used: {current_dest_stored_volume}, To Deposit: {total_amount_to_pickup_this_activity}")
        log.warning(f"{err_msg} Activity: {activity_guid}")
        # Resources are now stuck with the citizen. This is a problem.
        # For now, fail the activity. A more robust solution might create a "return_to_storage" or "drop_items" activity.
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        # Trust: Fetch person failed to deliver to destination operator due to capacity
        if fetch_person_username and destination_operator_username:
            update_trust_score_for_activity(tables, fetch_person_username, destination_operator_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_from_storage_delivery", False, "destination_full")
        return False


    for item_to_deposit in resources_to_fetch_list: # Iterate again for deposit
        resource_type_id = item_to_deposit.get('ResourceId')
        amount_to_deposit = float(item_to_deposit.get('Amount', 0))

        if not resource_type_id or amount_to_deposit <= 0:
            continue

        # Decrement from citizen's inventory
        citizen_inv_formula_dec = (
            f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
            f"{{Asset}}='{_escape_airtable_value(fetch_person_username)}', "
            f"{{AssetType}}='citizen', "
            f"{{Owner}}='{_escape_airtable_value(fetch_person_username)}')"
        )
        try:
            citizen_inv_records_dec = tables['resources'].all(formula=citizen_inv_formula_dec, max_records=1)
            if not citizen_inv_records_dec or float(citizen_inv_records_dec[0]['fields'].get('Count', 0)) < amount_to_deposit:
                # This should not happen if pickup was successful and carry capacity was checked.
                err_msg = f"Logic error: Citizen {fetch_person_username} does not have enough {resource_type_id} ({citizen_inv_records_dec[0]['fields'].get('Count',0) if citizen_inv_records_dec else 0}) to deposit {amount_to_deposit}."
                log.error(f"{err_msg} Activity: {activity_guid}")
                _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
                return False 

            inv_record_dec = citizen_inv_records_dec[0]
            new_inv_count_dec = float(inv_record_dec['fields'].get('Count', 0)) - amount_to_deposit
            if new_inv_count_dec > 0.001:
                tables['resources'].update(inv_record_dec['id'], {'Count': new_inv_count_dec})
            else:
                tables['resources'].delete(inv_record_dec['id'])
            log.info(f"🛍️ Decremented **{amount_to_deposit:.2f}** of **{resource_type_id}** from **{fetch_person_username}**'s inventory.")
        except Exception as e_inv_dec:
            err_msg = f"Error decrementing {resource_type_id} from {fetch_person_username}'s inventory: {e_inv_dec}"
            log.error(f"{err_msg} Activity: {activity_guid}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            return False

        # Increment/Create in ToBuilding (Workplace), Owner = destination_operator_username
        dest_building_res_formula = (
            f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
            f"{{Asset}}='{_escape_airtable_value(to_building_custom_id)}', "
            f"{{AssetType}}='building', "
            f"{{Owner}}='{_escape_airtable_value(destination_operator_username)}')"
        )
        try:
            existing_dest_res_records = tables['resources'].all(formula=dest_building_res_formula, max_records=1)
            res_def = resource_defs.get(resource_type_id, {})
            if existing_dest_res_records:
                dest_res_record = existing_dest_res_records[0]
                new_dest_count = float(dest_res_record['fields'].get('Count', 0)) + amount_to_deposit
                tables['resources'].update(dest_res_record['id'], {'Count': new_dest_count})
            else:
                tables['resources'].create({
                    "ResourceId": f"resource-{uuid.uuid4()}", "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    "Asset": to_building_custom_id, "AssetType": "building",
                    "Owner": destination_operator_username, "Count": amount_to_deposit, "CreatedAt": now_iso,
                    "Notes": f"Deposited after fetching from storage (Contract: {storage_query_contract_custom_id_from_activity})"
                })
            destination_building_name_log = destination_building_record['fields'].get('Name', to_building_custom_id)
            log.info(f"📦 Deposited **{amount_to_deposit:.2f}** of **{resource_type_id}** into **{destination_building_name_log}** ({to_building_custom_id}) (Owner: **{destination_operator_username}**).")
        except Exception as e_deposit_dest:
            err_msg = f"Error depositing {resource_type_id} into {to_building_custom_id} (Owner: {destination_operator_username}): {e_deposit_dest}"
            log.error(f"{err_msg} Activity: {activity_guid}")
            # Attempt to revert citizen inventory decrement
            # ... (complex, for now, mark as fail)
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            # Trust: System error during deposit phase
            if fetch_person_username and destination_operator_username:
                update_trust_score_for_activity(tables, fetch_person_username, destination_operator_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_from_storage_delivery_processing", False, "system_error_deposit")
            return False

    # Trust: Successful fetch and delivery
    if fetch_person_username and sq_buyer_username: # Successful pickup for owner
        update_trust_score_for_activity(tables, fetch_person_username, sq_buyer_username, TRUST_SCORE_SUCCESS_SIMPLE, "fetch_from_storage_pickup", True)
    if fetch_person_username and destination_operator_username: # Successful delivery to destination operator
        update_trust_score_for_activity(tables, fetch_person_username, destination_operator_username, TRUST_SCORE_SUCCESS_SIMPLE, "fetch_from_storage_delivery", True)

    # This processor only handles the resource transfer.
    # Any follow-up activities should have been created by the activity creator.
    # In the new architecture, processors should ONLY process the current activity and NOT create follow-up activities.

    log.info(f"{LogColors.OKGREEN}Successfully processed 'fetch_from_storage' activity {activity_guid}.{LogColors.ENDC}")
    return True
