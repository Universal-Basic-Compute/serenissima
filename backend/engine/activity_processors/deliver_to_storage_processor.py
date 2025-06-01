"""
Processor for 'deliver_to_storage' activities.
Citizen arrives at storage facility and deposits resources they own (which were
conceptually picked up from their FromBuilding - e.g. business - at the start of the activity).
Resources are stored in the ToBuilding (storage facility) but remain owned by the
Buyer of the storage_query contract (who is also the operator of the FromBuilding).
"""
import json
import logging
import uuid
import re # For the new helper function
from datetime import datetime
from typing import Dict, Optional, Any, List

from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    get_contract_record,
    get_building_current_storage,
    _escape_airtable_value,
    VENICE_TIMEZONE, LogColors,
    extract_details_from_notes # Import the helper
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
    log.info(f"Processing 'deliver_to_storage' activity: {activity_guid}")

    resources_to_deposit_json = activity_fields.get('Resources')
    from_building_custom_id = activity_fields.get('FromBuilding') # Business building OR None
    to_building_custom_id = activity_fields.get('ToBuilding')     # Storage facility
    delivery_person_username = activity_fields.get('Citizen')
    storage_query_contract_custom_id_from_activity = activity_fields.get('ContractId') # This is now the custom ContractId, can be None
    details_json_str = activity_fields.get('Details') # This field is not consistently set by creators, Notes with DetailsJSON is preferred

    source_is_citizen_inventory = False
    # Prefer parsing DetailsJSON from Notes if available
    activity_notes_for_details = activity_fields.get('Notes', '')

    parsed_details_from_notes = extract_details_from_notes(activity_notes_for_details) # Use imported helper

    if parsed_details_from_notes and 'source_is_citizen_inventory' in parsed_details_from_notes:
        source_is_citizen_inventory = parsed_details_from_notes.get('source_is_citizen_inventory', False)
    elif details_json_str: # Fallback to Details field if Notes doesn't have it
        try:
            details = json.loads(details_json_str)
            source_is_citizen_inventory = details.get('source_is_citizen_inventory', False)
        except json.JSONDecodeError:
            log.warning(f"Could not parse Details field JSON for activity {activity_guid}: {details_json_str}. Assuming source is building if not in Notes.")
    
    log.info(f"Deliver_to_storage source: {'Citizen Inventory' if source_is_citizen_inventory else f'Building {from_building_custom_id}'}. Contract ID: {storage_query_contract_custom_id_from_activity or 'N/A'}")

    # Base required fields
    base_required_fields_check = all([
        resources_to_deposit_json,
        to_building_custom_id,
        delivery_person_username
    ])
    # Conditional required fields
    if not source_is_citizen_inventory and not from_building_custom_id:
        err_msg = "Activity (from building) missing FromBuilding."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    # storage_query_contract_custom_id_from_activity is now optional at the activity level
    # but might be required depending on the logic (e.g., business depositing to 3rd party storage)

    if not base_required_fields_check:
        err_msg = "Activity missing crucial data (Resources, ToBuilding, or Citizen)."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    try:
        resources_to_deposit = json.loads(resources_to_deposit_json)
        if not isinstance(resources_to_deposit, list):
            raise ValueError("Resources JSON is not a list.")
    except (json.JSONDecodeError, ValueError) as e:
        err_msg = f"Failed to parse Resources JSON or not a list: {resources_to_deposit_json}. Error: {e}"
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Get citizen (delivery person, operator of FromBuilding)
    delivery_person_record = get_citizen_record(tables, delivery_person_username)
    if not delivery_person_record:
        err_msg = f"Delivery person {delivery_person_username} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Get storage facility (ToBuilding)
    storage_facility_record = get_building_record(tables, to_building_custom_id)
    if not storage_facility_record:
        err_msg = f"Storage facility (ToBuilding) {to_building_custom_id} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    storage_facility_type_str = storage_facility_record['fields'].get('Type')
    storage_facility_def = building_type_defs.get(storage_facility_type_str, {})
    storage_capacity = storage_facility_def.get('productionInformation', {}).get('storageCapacity', 0)

    # Determine the owner of the deposited resources
    owner_of_deposited_resources = None

    if parsed_details_from_notes and parsed_details_from_notes.get('intendedOwnerForStorage'):
        owner_of_deposited_resources = parsed_details_from_notes['intendedOwnerForStorage']
        log.info(f"Using 'intendedOwnerForStorage' from DetailsJSON ('{owner_of_deposited_resources}') as owner for deposited resources.")
    elif storage_query_contract_custom_id_from_activity:
        sq_contract_record = get_contract_record(tables, storage_query_contract_custom_id_from_activity)
        if not sq_contract_record:
            err_msg = f"Storage contract (Custom ID: {storage_query_contract_custom_id_from_activity}) not found, though an ID was provided."
            log.error(f"{err_msg} Activity: {activity_guid}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            return False
        
        sq_contract_fields = sq_contract_record['fields']
        contract_type = sq_contract_fields.get('Type')

        if contract_type == 'public_storage':
            # For public storage, the delivery person (Forestiero) is storing their own goods.
            owner_of_deposited_resources = delivery_person_username
            log.info(f"Contract {storage_query_contract_custom_id_from_activity} is 'public_storage'. Owner of deposited resources set to delivery person: {delivery_person_username}.")
        else: # e.g., 'storage_query' or other types where Buyer is specified
            sq_buyer_username = sq_contract_fields.get('Buyer')
            if not sq_buyer_username:
                err_msg = f"Storage contract {storage_query_contract_custom_id_from_activity} (type: {contract_type}) is missing a Buyer."
                log.error(f"{err_msg} Activity: {activity_guid}")
                _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
                return False
            owner_of_deposited_resources = sq_buyer_username
            log.info(f"Using contract buyer '{sq_buyer_username}' from contract {storage_query_contract_custom_id_from_activity} (type: {contract_type}) as owner for deposited resources.")

        # Contract-specific capacity check (if contract is present)
        # This part remains similar, but uses the now determined owner_of_deposited_resources
        sq_resource_type = sq_contract_fields.get('ResourceType') # May be null for some contract types, handle gracefully
        sq_target_amount = float(sq_contract_fields.get('TargetAmount', 0))

        if sq_resource_type and sq_target_amount > 0: # Only check if contract specifies a resource type and amount
            total_amount_this_delivery_this_resource_type = 0
            for item in resources_to_deposit:
                if item.get('ResourceId') == sq_resource_type:
                    total_amount_this_delivery_this_resource_type += float(item.get('Amount', 0))
            
            current_stored_this_resource_formula = (
                f"AND({{Asset}}='{_escape_airtable_value(to_building_custom_id)}', "
                f"{{AssetType}}='building', "
                f"{{Owner}}='{_escape_airtable_value(owner_of_deposited_resources)}', "
                f"{{Type}}='{_escape_airtable_value(sq_resource_type)}')"
            )
            current_stored_this_resource_count = 0.0
            try:
                existing_records = tables['resources'].all(formula=current_stored_this_resource_formula)
                for rec in existing_records:
                    current_stored_this_resource_count += float(rec['fields'].get('Count', 0))
            except Exception as e_query_res:
                err_msg = f"Error querying existing stored amount for {sq_resource_type} by {owner_of_deposited_resources} in {to_building_custom_id}: {e_query_res}"
                log.error(f"{err_msg} Activity: {activity_guid}")
                _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
                return False

            if current_stored_this_resource_count + total_amount_this_delivery_this_resource_type > sq_target_amount:
                err_msg = (f"Depositing {total_amount_this_delivery_this_resource_type:.2f} of {sq_resource_type} would exceed "
                           f"contracted capacity ({sq_target_amount:.2f}). Currently stored: {current_stored_this_resource_count:.2f}.")
                log.warning(f"{err_msg} Activity: {activity_guid}")
                _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
                return False
    else: # No contract ID and no intendedOwnerForStorage in DetailsJSON
        owner_of_deposited_resources = delivery_person_username
        log.info(f"No contract ID or 'intendedOwnerForStorage' in DetailsJSON. Defaulting owner of deposited resources to delivery person: {delivery_person_username}.")

    if not owner_of_deposited_resources: # Should be caught by earlier checks, but as a safeguard
        err_msg = "Critical error: Could not determine owner for deposited resources after all checks."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # General capacity check for the building
    current_total_stored_volume_in_facility = get_building_current_storage(tables, to_building_custom_id)
    total_amount_overall_this_delivery = sum(float(item.get('Amount', 0)) for item in resources_to_deposit)
    if current_total_stored_volume_in_facility + total_amount_overall_this_delivery > storage_capacity:
        err_msg = (f"Not enough overall storage in facility {to_building_custom_id}. "
                   f"Capacity: {storage_capacity}, Used: {current_total_stored_volume_in_facility}, To Deposit: {total_amount_overall_this_delivery}")
        log.warning(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        # Trust: Delivery person failed to deliver to owner of deposited resources due to facility capacity
        if delivery_person_username and owner_of_deposited_resources:
            update_trust_score_for_activity(tables, delivery_person_username, owner_of_deposited_resources, TRUST_SCORE_FAILURE_SIMPLE, "delivery_to_storage", False, "facility_full")
        return False

    # Process resource transfer
    # 1. "Pick up" from FromBuilding (Business) - conceptually, resources are taken from business's stock
    #    These resources are owned by the delivery_person_username (who is the RunBy of the business)
    # 2. "Deposit" into ToBuilding (Storage) - resources are now in storage, still owned by delivery_person_username (Buyer of contract)
    
    now_iso = datetime.now(VENICE_TIMEZONE).isoformat()

    for item in resources_to_deposit:
        resource_type_id = item.get('ResourceId')
        amount_to_transfer = float(item.get('Amount', 0))

        if not resource_type_id or amount_to_transfer <= 0:
            continue

        # Step 1: Decrement from source (either FromBuilding or Citizen Inventory)
        if source_is_citizen_inventory:
            # Resources in citizen's inventory are owned by delivery_person_username
            source_res_formula = (
                f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                f"{{Asset}}='{_escape_airtable_value(delivery_person_username)}', "
                f"{{AssetType}}='citizen', "
                f"{{Owner}}='{_escape_airtable_value(delivery_person_username)}')" # Assuming citizen owns what they carry for this purpose
            )
            source_description = f"citizen inventory of {delivery_person_username}"
        else: # Source is FromBuilding
            # Resources in FromBuilding are owned by delivery_person_username (operator)
            source_res_formula = (
                f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                f"{{Asset}}='{_escape_airtable_value(from_building_custom_id)}', "
                f"{{AssetType}}='building', "
                f"{{Owner}}='{_escape_airtable_value(delivery_person_username)}')" # Resources in business are owned by its operator
            )
            source_description = f"FromBuilding {from_building_custom_id} (Owner: {delivery_person_username})"
        
        try:
            source_res_records = tables['resources'].all(formula=source_res_formula, max_records=1)
            if not source_res_records or float(source_res_records[0]['fields'].get('Count', 0)) < amount_to_transfer:
                err_msg = f"Insufficient stock of {resource_type_id} ({source_res_records[0]['fields'].get('Count', 0) if source_res_records else 0} available) " \
                          f"in {source_description} to transfer {amount_to_transfer}."
                log.error(f"{err_msg} Activity: {activity_guid}")
                _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
                # Trust: Delivery person failed to pick up from source for owner of deposited resources
                if delivery_person_username and owner_of_deposited_resources:
                    update_trust_score_for_activity(tables, delivery_person_username, owner_of_deposited_resources, TRUST_SCORE_FAILURE_SIMPLE, "pickup_for_storage", False, "source_stock_insufficient")
                return False

            source_res_record = source_res_records[0]
            new_source_count = float(source_res_record['fields'].get('Count', 0)) - amount_to_transfer
            if new_source_count > 0.001:
                tables['resources'].update(source_res_record['id'], {'Count': new_source_count})
            else:
                tables['resources'].delete(source_res_record['id'])
            log.info(f"Decremented {amount_to_transfer} of {resource_type_id} from {source_description}.")
        except Exception as e_pickup:
            err_msg = f"Error picking up {resource_type_id} from {source_description}: {e_pickup}"
            log.error(f"{err_msg} Activity: {activity_guid}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            return False

        # Step 2: Increment/Create in ToBuilding (Storage Facility), Owner = owner_of_deposited_resources
        to_building_res_formula = (
            f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
            f"{{Asset}}='{_escape_airtable_value(to_building_custom_id)}', "
            f"{{AssetType}}='building', "
            f"{{Owner}}='{_escape_airtable_value(owner_of_deposited_resources)}')"
        )
        try:
            existing_to_res_records = tables['resources'].all(formula=to_building_res_formula, max_records=1)
            res_def = resource_defs.get(resource_type_id, {})
            if existing_to_res_records:
                to_res_record = existing_to_res_records[0]
                new_to_count = float(to_res_record['fields'].get('Count', 0)) + amount_to_transfer
                tables['resources'].update(to_res_record['id'], {'Count': new_to_count})
            else:
                notes_for_new_resource = f"Stored by {delivery_person_username}."
                if storage_query_contract_custom_id_from_activity:
                    notes_for_new_resource += f" Contract: {storage_query_contract_custom_id_from_activity}"
                else:
                    notes_for_new_resource += " Personal deposit."

                new_resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}", "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    "Asset": to_building_custom_id, "AssetType": "building",
                    "Owner": owner_of_deposited_resources,
                    "Count": amount_to_transfer, "CreatedAt": now_iso,
                    "Notes": notes_for_new_resource
                }
                tables['resources'].create(new_resource_payload)
            log.info(f"Incremented/Created {amount_to_transfer} of {resource_type_id} in {to_building_custom_id} (Owner: {owner_of_deposited_resources}).")
        except Exception as e_deposit:
            err_msg = f"Error depositing {resource_type_id} into {to_building_custom_id} (Owner: {owner_of_deposited_resources}): {e_deposit}"
            log.error(f"{err_msg} Activity: {activity_guid}")
            # Attempt to revert pickup
            try:
                source_res_records_revert = tables['resources'].all(formula=source_res_formula, max_records=1)
                if source_res_records_revert:
                    tables['resources'].update(source_res_records_revert[0]['id'], {'Count': float(source_res_records_revert[0]['fields'].get('Count',0)) + amount_to_transfer})
                else:
                    recreate_payload = {
                        "Type": resource_type_id, 
                        "Asset": from_building_custom_id if not source_is_citizen_inventory else delivery_person_username, 
                        "AssetType": "building" if not source_is_citizen_inventory else "citizen", 
                        "Owner": delivery_person_username,
                        "Count": amount_to_transfer, 
                        "CreatedAt": now_iso
                    }
                    tables['resources'].create(recreate_payload)
                log.info(f"Reverted pickup of {resource_type_id} from {source_description} due to deposit error.")
            except Exception as e_revert:
                log.error(f"Failed to revert pickup for {resource_type_id} from {source_description}: {e_revert}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            # Trust: Delivery person failed to deposit for owner of deposited resources (system error during deposit)
            if delivery_person_username and owner_of_deposited_resources:
                update_trust_score_for_activity(tables, delivery_person_username, owner_of_deposited_resources, TRUST_SCORE_FAILURE_SIMPLE, "delivery_to_storage_processing", False, "system_error_deposit")
            return False

    # Trust: Successful delivery to storage
    if delivery_person_username and owner_of_deposited_resources:
        update_trust_score_for_activity(tables, delivery_person_username, owner_of_deposited_resources, TRUST_SCORE_SUCCESS_SIMPLE, "delivery_to_storage", True)

    # This processor only handles the resource transfer.
    # Any follow-up activities should have been created by the activity creator.
    # In the new architecture, processors should ONLY process the current activity and NOT create follow-up activities.

    log.info(f"{LogColors.OKGREEN}Successfully processed 'deliver_to_storage' activity {activity_guid}.{LogColors.ENDC}")
    return True
