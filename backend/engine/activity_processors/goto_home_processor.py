"""
Processor for 'goto_home' activities.
Deposits all resources owned by the citizen (AssetType='citizen') into their home building.
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

log = logging.getLogger(__name__)

def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, 
    resource_defs: Dict
) -> bool:
    """Processes a 'goto_home' activity."""
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'goto_home' activity: {activity_guid}")

    citizen_username = activity_fields.get('Citizen')
    # 'ToBuilding' in the activity record is now the custom BuildingId of the home
    home_building_custom_id_from_activity = activity_fields.get('ToBuilding') 

    if not citizen_username or not home_building_custom_id_from_activity:
        log.error(f"Activity {activity_guid} is missing Citizen or ToBuilding (home custom ID).")
        return False

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False
    
    # Fetch home building record using its custom BuildingId from the activity
    home_building_record = get_building_record(tables, home_building_custom_id_from_activity)
    if not home_building_record:
        log.error(f"Home building with custom ID '{home_building_custom_id_from_activity}' not found for activity {activity_guid}.")
        return False
    
    # The custom ID from the activity is the one we use throughout
    home_building_custom_id = home_building_custom_id_from_activity

    home_building_type_str = home_building_record['fields'].get('Type')
    home_building_def = building_type_defs.get(home_building_type_str, {})
    storage_capacity = home_building_def.get('productionInformation', {}).get('storageCapacity', 0)
    
    # Get resources owned by the citizen (AssetType='citizen', Owner=citizen_username, Asset=citizen_username)
    # The 'Asset' field for citizen-owned resources now stores the Username.
    # The 'Owner' field also stores the Username for self-owned items.
    
    # citizen_custom_id is still useful for logging or other non-query purposes if needed.
    # citizen_custom_id = citizen_record['fields'].get('CitizenId')
    # if not citizen_custom_id:
    #     log.error(f"Citizen {citizen_username} is missing CitizenId field for logging.")
        # Not returning False, as username is primary for query now.

    citizen_resources_formula = (f"AND({{AssetType}}='citizen', "
                                 f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                                 f"{{Asset}}='{_escape_airtable_value(citizen_username)}')")
    try:
        citizen_owned_resources = tables['resources'].all(formula=citizen_resources_formula)
    except Exception as e_fetch_res:
        log.error(f"Error fetching resources for citizen {citizen_username} (Asset: {citizen_username}): {e_fetch_res}")
        return False

    if not citizen_owned_resources:
        log.info(f"Citizen {citizen_username} has no resources to deposit at home {home_building_custom_id}.")
        return True # Nothing to do, so it's a success.

    log.info(f"Citizen {citizen_username} has {len(citizen_owned_resources)} resource types to deposit.")

    current_stored_volume_at_home = get_building_current_storage(tables, home_building_custom_id)
    total_amount_to_deposit = sum(float(r['fields'].get('Count', 0)) for r in citizen_owned_resources)

    if current_stored_volume_at_home + total_amount_to_deposit > storage_capacity:
        log.warning(f"Not enough storage in home {home_building_custom_id} for citizen {citizen_username}'s resources. "
                    f"Capacity: {storage_capacity}, Used: {current_stored_volume_at_home}, To Deposit: {total_amount_to_deposit}")
        # Optionally, create a problem record here
        return False # Cannot deposit if not enough space

    all_resources_transferred = True
    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()

    for res_record_citizen_owned in citizen_owned_resources:
        resource_type_id = res_record_citizen_owned['fields'].get('Type')
        amount_to_deposit = float(res_record_citizen_owned['fields'].get('Count', 0))
        
        if not resource_type_id or amount_to_deposit <= 0:
            log.warning(f"Skipping invalid resource item from citizen {citizen_username}: {res_record_citizen_owned.get('id')}")
            continue

        # Deposit into home building (AssetType='building', Asset=home_building_custom_id, Owner=citizen_username)
        home_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                            f"{{Asset}}='{_escape_airtable_value(home_building_custom_id)}', "
                            f"{{AssetType}}='building', "
                            f"{{Owner}}='{_escape_airtable_value(citizen_username)}')")
        try:
            existing_home_resources = tables['resources'].all(formula=home_res_formula, max_records=1)
            
            if existing_home_resources:
                home_res_airtable_id = existing_home_resources[0]['id']
                new_count_at_home = float(existing_home_resources[0]['fields'].get('Count', 0)) + amount_to_deposit
                tables['resources'].update(home_res_airtable_id, {'Count': new_count_at_home})
                log.info(f"{LogColors.OKGREEN}Updated resource {resource_type_id} count in home {home_building_custom_id} for {citizen_username} to {new_count_at_home}.{LogColors.ENDC}")
            else:
                res_def = resource_defs.get(resource_type_id, {})
                home_building_pos_str = home_building_record['fields'].get('Position', '{}')
                
                new_resource_payload_home = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    # "Category": res_def.get('category', 'Unknown'), # Removed Category
                    # "BuildingId": home_building_custom_id, # This field is not valid for RESOURCES table
                    "Asset": home_building_custom_id,   # Asset is the custom BuildingId
                    "AssetType": "building",
                    "Owner": citizen_username, # Citizen owns the resources in their home
                    "Count": amount_to_deposit,
                    # "Position": home_building_pos_str, # Position of the home - REMOVED for building resources
                    "CreatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload_home)
                log.info(f"{LogColors.OKGREEN}Created new resource {resource_type_id} in home {home_building_custom_id} for {citizen_username}.{LogColors.ENDC}")
            
            # Remove resource from citizen's personal inventory
            tables['resources'].delete(res_record_citizen_owned['id'])
            log.info(f"{LogColors.OKGREEN}Removed resource {resource_type_id} (amount: {amount_to_deposit}) from citizen {citizen_username}'s personal inventory.{LogColors.ENDC}")

        except Exception as e_deposit_home:
            log.error(f"Error depositing resource {resource_type_id} into home {home_building_custom_id} for {citizen_username}: {e_deposit_home}")
            all_resources_transferred = False
            break 
            
    if not all_resources_transferred:
        log.error(f"Resource deposit failed for citizen {citizen_username} during 'goto_home' activity {activity_guid}.")
        # Potentially revert changes or handle partial success if necessary
        return False

    log.info(f"{LogColors.OKGREEN}Successfully processed 'goto_home' activity {activity_guid} for {citizen_username}. All resources deposited.{LogColors.ENDC}")
    
    return True
