"""
Processor for 'goto_construction_site' activities.
When the citizen arrives at the construction site, this processor
creates the actual 'construct_building' activity.
"""
import logging
import json
import datetime
from typing import Dict, Any, Optional

log = logging.getLogger(__name__)

from backend.engine.utils.activity_helpers import get_building_record, get_citizen_record, LogColors, extract_details_from_notes # Import helper
from backend.engine.activity_creators import try_create_construct_building_activity # Import the specific creator

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any] # Not directly used here but part of signature
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}Processing 'goto_construction_site' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username = activity_fields.get('Citizen')
    target_building_custom_id = activity_fields.get('BuildingToConstruct') # Stored by creator
    contract_custom_id_from_activity = activity_fields.get('ContractId') # This is now the custom ContractId
    # WorkDurationMinutes might be in 'Notes' or a dedicated field if added to activity schema
    # For now, let's assume a default or parse from Notes if needed.
    # The creator now adds 'WorkDurationMinutes' to the payload for 'goto_construction_site'
    
    # Parse WorkDurationMinutes from DetailsJSON in Notes if available, otherwise default
    work_duration_minutes = 60 # Default
    activity_notes = activity_fields.get('Notes', '')
        
    parsed_details_from_notes = extract_details_from_notes(activity_notes) # Use imported helper

    if parsed_details_from_notes:
        try:
            work_duration_minutes = int(parsed_details_from_notes.get('work_duration_minutes', 60))
        except (ValueError, TypeError):
            log.warning(f"Could not parse work_duration_minutes from parsed DetailsJSON for activity {activity_guid}. Using default {work_duration_minutes}. DetailsJSON: {parsed_details_from_notes}")
    else:
        log.info(f"No DetailsJSON found in notes for activity {activity_guid} to get work_duration_minutes. Using default {work_duration_minutes}.")


    if not all([citizen_username, target_building_custom_id, contract_custom_id_from_activity]):
        log.error(f"Activity {activity_guid} missing crucial data (Citizen, BuildingToConstruct, or ContractId). Aborting.")
        return False

    citizen_record_data = get_citizen_record(tables, citizen_username)
    if not citizen_record_data:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}. Aborting.")
        return False

    target_building_record_data = get_building_record(tables, target_building_custom_id)
    if not target_building_record_data:
        log.error(f"Target building {target_building_custom_id} not found for activity {activity_guid}. Aborting.")
        return False

    log.info(f"Citizen {citizen_username} arrived at site {target_building_custom_id}. Creating 'construct_building' activity for {work_duration_minutes} minutes.")

    # Create the 'construct_building' activity, path_data is None because citizen is now at the site.
    if try_create_construct_building_activity(
        tables,
        citizen_record_data,
        target_building_record_data,
        work_duration_minutes,
        contract_custom_id_from_activity, # Pass the custom ContractId
        path_data=None, # Explicitly None, as citizen has arrived
        current_time_utc=datetime.datetime.now(datetime.timezone.utc) # Pass current_time_utc
    ):
        log.info(f"{LogColors.OKGREEN}Successfully created subsequent 'construct_building' activity for {citizen_username} at {target_building_custom_id} using contract {contract_custom_id_from_activity}.{LogColors.ENDC}")
        return True
    else:
        log.error(f"{LogColors.FAIL}Failed to create subsequent 'construct_building' activity for {citizen_username} at {target_building_custom_id}.{LogColors.ENDC}")
        return False
