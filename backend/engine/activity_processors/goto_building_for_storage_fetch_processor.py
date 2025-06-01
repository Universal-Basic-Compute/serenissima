"""
Processor for 'goto_building_for_storage_fetch' activities.
Upon arrival at the storage facility (ToBuilding of this activity), this processor
creates a 'fetch_from_storage' activity to bring resources back to the original workplace.
"""
import json
import logging
import datetime # Added import
import os # Added import
from typing import Dict, Optional, Any, List # List might be used by resources_to_fetch

from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    get_path_between_points,
    _get_building_position_coords,
    VENICE_TIMEZONE, LogColors,
    get_citizen_current_load,
    get_citizen_effective_carry_capacity, # Already imported, ensure it's used
    extract_details_from_notes # Import the helper
)
from backend.engine.activity_creators import try_create_fetch_from_storage_activity

log = logging.getLogger(__name__)

def _update_activity_notes_with_failure_reason(tables: Dict[str, Any], activity_airtable_id: str, failure_reason: str):
    """Appends a failure reason to the activity's Notes field."""
    try:
        activity_to_update = tables['activities'].get(activity_airtable_id)
        if not activity_to_update: return
        existing_notes = activity_to_update['fields'].get('Notes', '')
        timestamp = datetime.datetime.now(VENICE_TIMEZONE).strftime("%Y-%m-%d %H:%M:%S %Z")
        new_note_entry = f"\n[FAILURE @ GOTO_STORAGE_FETCH_PROC - {timestamp}] {failure_reason}"
        tables['activities'].update(activity_airtable_id, {'Notes': existing_notes + new_note_entry})
    except Exception as e:
        log.error(f"Error updating notes for activity {activity_airtable_id}: {e}")


def process(
    tables: Dict[str, Any],
    activity_record: Dict,
    building_type_defs: Dict, # Not directly used, but part of signature
    resource_defs: Dict       # Not directly used, but part of signature
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'goto_building_for_storage_fetch' activity: {activity_guid}")

    citizen_username = activity_fields.get('Citizen')
    storage_facility_custom_id = activity_fields.get('ToBuilding') # This is where the citizen arrived
    activity_notes = activity_fields.get('Notes', '') # Read from Notes for DetailsJSON

    parsed_details_from_notes = extract_details_from_notes(activity_notes) # Use imported helper
    if not parsed_details_from_notes:
        err_msg = "DetailsJSON not found in Notes or is invalid for goto_building_for_storage_fetch."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    action_on_arrival = parsed_details_from_notes.get('action_on_arrival')
    original_workplace_id = parsed_details_from_notes.get('original_workplace_id')
    storage_query_contract_id = parsed_details_from_notes.get('storage_query_contract_id') # This is now the custom ContractId
    resources_to_fetch = parsed_details_from_notes.get('resources_to_fetch') # List of {"ResourceId": X, "Amount": Y}

    if action_on_arrival != "fetch_from_storage" or not all([original_workplace_id, storage_query_contract_id, resources_to_fetch]):
        err_msg = f"Parsed DetailsJSON is invalid or missing required fields for fetch_from_storage. DetailsJSON: {parsed_details_from_notes}"
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    citizen_record = get_citizen_record(tables, citizen_username)
    storage_facility_record = get_building_record(tables, storage_facility_custom_id)
    original_workplace_record = get_building_record(tables, original_workplace_id)

    if not citizen_record:
        err_msg = f"Citizen {citizen_username} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    if not storage_facility_record:
        err_msg = f"Storage facility {storage_facility_custom_id} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    if not original_workplace_record:
        err_msg = f"Original workplace {original_workplace_id} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    storage_facility_pos = _get_building_position_coords(storage_facility_record)
    original_workplace_pos = _get_building_position_coords(original_workplace_record)

    if not storage_facility_pos or not original_workplace_pos:
        err_msg = "Missing position data for storage facility or original workplace."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    # Path from storage facility back to original workplace
    # TRANSPORT_API_URL needs to be accessible, e.g., from os.getenv or passed
    transport_api_url = os.getenv("TRANSPORT_API_URL", "http://localhost:3000/api/transport")
    path_back_to_workplace = get_path_between_points(storage_facility_pos, original_workplace_pos, transport_api_url)

    if not (path_back_to_workplace and path_back_to_workplace.get('success')):
        err_msg = f"Failed to find path from storage {storage_facility_custom_id} to workplace {original_workplace_id}."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        # Consider creating an idle activity for the citizen at the storage facility
        return False

    # Adjust resources_to_fetch based on current carry capacity before creating the fetch activity
    current_load = get_citizen_current_load(tables, citizen_username)
    # citizen_record is already fetched above.
    citizen_max_capacity = get_citizen_effective_carry_capacity(citizen_record) # Use the fetched citizen_record
    remaining_capacity = citizen_max_capacity - current_load
    
    adjusted_resources_for_fetch_activity = []
    total_amount_adjusted_for_fetch = 0.0

    if not resources_to_fetch: # Should not happen if details were correctly populated
        err_msg = f"resources_to_fetch from Details is empty for {citizen_username}. Cannot create fetch_from_storage."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    for r_item_detail in resources_to_fetch: # resources_to_fetch comes from activity's Details
        original_amount_detail = float(r_item_detail.get("Amount", 0))
        if original_amount_detail <= 0:
            continue

        amount_can_take_this_item_detail = min(original_amount_detail, remaining_capacity - total_amount_adjusted_for_fetch)
        amount_can_take_this_item_detail = float(f"{amount_can_take_this_item_detail:.4f}")

        if amount_can_take_this_item_detail >= 0.01:
            adjusted_resources_for_fetch_activity.append({
                "ResourceId": r_item_detail.get("ResourceId"),
                "Amount": amount_can_take_this_item_detail
            })
            total_amount_adjusted_for_fetch += amount_can_take_this_item_detail
        else:
            log.info(f"Not enough remaining capacity ({remaining_capacity - total_amount_adjusted_for_fetch:.2f}) for item {r_item_detail.get('ResourceId')} (requested {original_amount_detail:.2f}) for {citizen_username} at storage arrival.")

    if not adjusted_resources_for_fetch_activity:
        err_msg = f"Citizen {citizen_username} has no remaining carry capacity ({remaining_capacity:.2f}) or adjusted amounts are too small upon arrival at storage. Cannot create fetch_from_storage activity."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    
    log.info(f"Adjusted resources for subsequent fetch_from_storage for {citizen_username}: {adjusted_resources_for_fetch_activity}. Remaining capacity was {remaining_capacity:.2f}.")

    # IMPORTANT: In the new architecture, processors should NOT create follow-up activities.
    # This is a legacy pattern that should be refactored.
    # The activity creator should have created both activities in the chain:
    # 1. goto_building_for_storage_fetch (this activity)
    # 2. fetch_from_storage (the follow-up activity)
    
    # For backward compatibility, we still create the fetch_from_storage activity here,
    # but this should be moved to an activity creator in the future.
    fetch_activity_created = try_create_fetch_from_storage_activity(
        tables,
        citizen_record,
        storage_facility_record, # FromBuilding for fetch is the storage facility
        original_workplace_record, # ToBuilding for fetch is the original workplace
        adjusted_resources_for_fetch_activity, # Use the adjusted list
        storage_query_contract_id,
        path_back_to_workplace
    )

    if fetch_activity_created:
        log.info(f"{LogColors.OKGREEN}Successfully created 'fetch_from_storage' activity {fetch_activity_created['id']} for citizen {citizen_username}.{LogColors.ENDC}")
        log.warning(f"{LogColors.WARNING}Note: This processor is creating a follow-up activity, which is not aligned with the new architecture. This should be refactored to use activity creators for the entire chain.{LogColors.ENDC}")
        # The 'goto_building_for_storage_fetch' activity is now considered processed.
        # The citizen's position will be updated by the main loop in processActivities.py to the storage facility.
        # The new 'fetch_from_storage' activity will then take them back to their workplace.
        return True
    else:
        err_msg = "Failed to create subsequent 'fetch_from_storage' activity."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        # Citizen is now idle at the storage facility.
        return False
