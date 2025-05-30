"""
Processor for 'goto_work' activities.
When a citizen arrives at their workplace, this processor checks if they are carrying
any resources owned by the workplace operator (RunBy). If so, and if there's
storage capacity, these resources are deposited into the workplace building.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any

# Import utility functions from activity_helpers to avoid circular imports
from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    get_building_current_storage,
    _escape_airtable_value,
    VENICE_TIMEZONE, # Assuming VENICE_TIMEZONE might be used
    LogColors      # Assuming LogColors might be used
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE, TRUST_SCORE_MINOR_POSITIVE

log = logging.getLogger(__name__)

class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def process(
    tables: Dict[str, Any],
    activity_record: Dict,
    building_type_defs: Dict,
    resource_defs: Dict
) -> bool:
    """Processes a 'goto_work' activity."""
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"🚶 Processing 'goto_work' activity: {activity_guid}")

    citizen_username = activity_fields.get('Citizen')
    # 'ToBuilding' in the activity record is now the custom BuildingId of the workplace
    workplace_building_custom_id_from_activity = activity_fields.get('ToBuilding')

    if not citizen_username or not workplace_building_custom_id_from_activity:
        log.error(f"Activity {activity_guid} is missing Citizen or ToBuilding (workplace custom ID).")
        return False

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    if not citizen_custom_id:
        log.error(f"Citizen {citizen_username} is missing CitizenId field.")
        return False

    # Fetch workplace building record using its custom BuildingId from the activity
    workplace_building_record = get_building_record(tables, workplace_building_custom_id_from_activity)
    if not workplace_building_record:
        log.error(f"Workplace building with custom ID '{workplace_building_custom_id_from_activity}' not found for activity {activity_guid}.")
        return False
    
    # The custom ID from the activity is the one we use throughout
    workplace_building_custom_id = workplace_building_custom_id_from_activity
    
    workplace_operator_username = workplace_building_record['fields'].get('RunBy')
    workplace_name_log = workplace_building_record['fields'].get('Name', workplace_building_custom_id)
    if not workplace_operator_username:
        log.warning(f"Workplace building **{workplace_name_log}** ({workplace_building_custom_id}) has no operator (RunBy). Cannot deposit resources.")
        # This is not a failure of the activity itself, but no resources can be deposited.
        return True 

    workplace_building_type_str = workplace_building_record['fields'].get('Type')
    workplace_building_def = building_type_defs.get(workplace_building_type_str, {})
    storage_capacity = workplace_building_def.get('productionInformation', {}).get('storageCapacity', 0)
    has_commercial_storage_workplace = workplace_building_def.get('commercialStorage', False)

    # Get resources carried by the citizen
    resources_to_consider_for_deposit = []
    if has_commercial_storage_workplace:
        # If commercial storage, citizen can deposit resources they own OR resources owned by the workplace operator.
        # Resources owned by a third party should NOT be deposited here just because the workplace has commercialStorage.
        # Those should be handled by a specific delivery activity (e.g., deliver_to_storage).
        # Fetch all resources carried by the citizen
        all_carried_formula = (f"AND({{AssetType}}='citizen', "
                               f"{{Asset}}='{_escape_airtable_value(citizen_username)}')")
        log.info(f"Workplace {workplace_building_custom_id} has commercialStorage. Checking resources carried by {citizen_username} for ownership by self or workplace operator.")
        try:
            all_citizen_carried_resources = tables['resources'].all(formula=all_carried_formula)
            for res_record in all_citizen_carried_resources:
                resource_owner = res_record['fields'].get('Owner')
                # Deposit if owned by the citizen themselves (for their own storage) OR by the workplace operator
                if resource_owner == citizen_username or resource_owner == workplace_operator_username:
                    resources_to_consider_for_deposit.append(res_record)
            log.info(f"Considering {len(resources_to_consider_for_deposit)} resource stacks for deposit (owned by {citizen_username} or {workplace_operator_username}).")
        except Exception as e_fetch_all_res:
            log.error(f"Error fetching all resources carried by citizen {citizen_username}: {e_fetch_all_res}")
            return False
    else:
        # If not commercial storage, only deposit resources already owned by the workplace operator.
        owned_by_operator_formula = (f"AND({{AssetType}}='citizen', "
                                     f"{{Asset}}='{_escape_airtable_value(citizen_username)}', "
                                     f"{{Owner}}='{_escape_airtable_value(workplace_operator_username)}')")
        log.info(f"Workplace {workplace_building_custom_id} does NOT have commercialStorage. Fetching only resources owned by operator {workplace_operator_username} carried by {citizen_username}.")
        try:
            resources_to_consider_for_deposit = tables['resources'].all(formula=owned_by_operator_formula)
        except Exception as e_fetch_owned_res:
            log.error(f"Error fetching resources carried by {citizen_username} and owned by {workplace_operator_username}: {e_fetch_owned_res}")
            return False
    
    # Rename for clarity in subsequent code
    citizen_carried_resources = resources_to_consider_for_deposit
    # The following except block was a syntax error as it was not part of a try block.
    # The try-except blocks for fetching resources are handled within the if/else for commercialStorage.
    # except Exception as e_fetch_res:
    #     log.error(f"Error fetching resources carried by citizen {citizen_username} (owned by {workplace_operator_username}): {e_fetch_res}")
    #     return False

    if not citizen_carried_resources:
        log.info(f"Citizen **{citizen_username}** has no resources owned by **{workplace_operator_username}** to deposit at workplace **{workplace_name_log}** ({workplace_building_custom_id}).")
        return True # Nothing to do, so it's a success.

    log.info(f"Citizen **{citizen_username}** has {len(citizen_carried_resources)} resource types (owned by **{workplace_operator_username}**) to potentially deposit at **{workplace_name_log}** ({workplace_building_custom_id}).")

    current_stored_volume_at_workplace = get_building_current_storage(tables, workplace_building_custom_id)
    
    # Calculate total volume of resources to deposit
    total_volume_to_deposit = sum(float(r['fields'].get('Count', 0)) for r in citizen_carried_resources)

    if current_stored_volume_at_workplace + total_volume_to_deposit > storage_capacity:
        log.warning(f"Not enough storage in workplace **{workplace_name_log}** ({workplace_building_custom_id}) for citizen **{citizen_username}**'s resources (owned by **{workplace_operator_username}**). "
                    f"Capacity: {storage_capacity}, Used: {current_stored_volume_at_workplace}, To Deposit: {total_volume_to_deposit}")
        # Optionally, create a problem record here or notify the operator.
        # Deposit cannot happen, so the action related to this part of the activity fails.
        # Trust: Employee failed to deposit operator's resources due to workplace capacity
        if citizen_username and workplace_operator_username:
            update_trust_score_for_activity(tables, citizen_username, workplace_operator_username, TRUST_SCORE_FAILURE_SIMPLE, "work_deposit", False, "workplace_full")
        return False # Cannot deposit if not enough space.

    all_resources_transferred = True
    # VENICE_TIMEZONE is imported from activity_helpers
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()

    for res_record_citizen_carried in citizen_carried_resources:
        resource_type_id = res_record_citizen_carried['fields'].get('Type')
        amount_to_deposit = float(res_record_citizen_carried['fields'].get('Count', 0))
        
        if not resource_type_id or amount_to_deposit <= 0:
            log.warning(f"Skipping invalid resource item from citizen {citizen_username}: {res_record_citizen_carried.get('id')}")
            continue

        # Deposit into workplace building (AssetType='building', Asset=workplace_building_custom_id, Owner=workplace_operator_username)
        workplace_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                 f"{{Asset}}='{_escape_airtable_value(workplace_building_custom_id)}', "
                                 f"{{AssetType}}='building', "
                                 f"{{Owner}}='{_escape_airtable_value(workplace_operator_username)}')")
        try:
            existing_workplace_resources = tables['resources'].all(formula=workplace_res_formula, max_records=1)
            
            if existing_workplace_resources:
                workplace_res_airtable_id = existing_workplace_resources[0]['id']
                new_count_at_workplace = float(existing_workplace_resources[0]['fields'].get('Count', 0)) + amount_to_deposit
                tables['resources'].update(workplace_res_airtable_id, {'Count': new_count_at_workplace})
                log.info(f"{LogColors.OKGREEN}Updated resource {resource_type_id} count in workplace {workplace_building_custom_id} for operator {workplace_operator_username} to {new_count_at_workplace}.{LogColors.ENDC}")
            else:
                res_def = resource_defs.get(resource_type_id, {})
                workplace_building_pos_str = workplace_building_record['fields'].get('Position', '{}')
                
                new_resource_payload_workplace = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    # "Category": res_def.get('category', 'Unknown'), # Removed Category
                    "Asset": workplace_building_custom_id,   # Asset is the custom BuildingId
                    "AssetType": "building",
                    "Owner": workplace_operator_username, # Workplace operator owns these resources
                    "Count": amount_to_deposit,
                    # "Position": workplace_building_pos_str, # Position of the workplace - REMOVED
                    "CreatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload_workplace)
                log.info(f"{LogColors.OKGREEN}Created new resource {resource_type_id} in workplace {workplace_building_custom_id} for operator {workplace_operator_username}.{LogColors.ENDC}")
            
            # Remove resource from citizen's personal inventory
            # The owner of the resource in the citizen's inventory might not be the workplace_operator_username
            # if commercialStorage is true. The deletion is based on the record ID.
            tables['resources'].delete(res_record_citizen_carried['id'])
            log.info(f"{LogColors.OKGREEN}Removed resource {resource_type_id} (amount: {amount_to_deposit}) from citizen {citizen_username}'s personal inventory. Deposited into workplace {workplace_building_custom_id} under operator {workplace_operator_username}.{LogColors.ENDC}")

        except Exception as e_deposit_workplace:
            log.error(f"Error depositing resource {resource_type_id} into workplace {workplace_building_custom_id} for operator {workplace_operator_username}: {e_deposit_workplace}")
            all_resources_transferred = False
            break 
            
    if not all_resources_transferred:
        log.error(f"Resource deposit failed for citizen {citizen_username} at workplace {workplace_building_custom_id} during 'goto_work' activity {activity_guid}.")
        # Potentially revert changes or handle partial success if necessary
        # Trust: System error during deposit by employee
        if citizen_username and workplace_operator_username:
            update_trust_score_for_activity(tables, citizen_username, workplace_operator_username, TRUST_SCORE_FAILURE_SIMPLE, "work_deposit_processing", False, "system_error")
        return False # Indicate failure to deposit

    # Trust: Successful deposit of operator's resources by employee
    # This is only if resources_to_consider_for_deposit was not empty and all_resources_transferred is true.
    if citizen_carried_resources and all_resources_transferred: # citizen_carried_resources was populated earlier
        if citizen_username and workplace_operator_username:
            # Using MINOR_POSITIVE as this is a routine part of work, not a major transaction.
            update_trust_score_for_activity(tables, citizen_username, workplace_operator_username, TRUST_SCORE_MINOR_POSITIVE, "work_deposit", True)

    log.info(f"{LogColors.OKGREEN}Successfully processed 'goto_work' activity {activity_guid} for {citizen_username}. Resources deposited as applicable.{LogColors.ENDC}")
    
    return True
