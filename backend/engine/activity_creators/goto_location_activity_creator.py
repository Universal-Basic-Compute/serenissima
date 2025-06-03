"""
Activity Creator for 'goto_location'.

This creator is responsible for generating 'goto_location' activities, which are generic
movement tasks. The purpose of the movement (and any subsequent actions) is often
defined in the 'Notes' field (formerly 'Details') as a JSON string.
"""

import logging
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    VENICE_TIMEZONE,
    get_building_record,
    get_citizen_record,
    find_path_between_buildings_or_coords, # Using the more versatile pathfinder
    create_activity_record as create_activity_record_from_payload # Renamed for clarity
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    activity_params: Dict[str, Any], # Parameters specific to this goto_location request
    resource_defs: Dict[str, Any], # Not directly used by goto_location, but part of standard signature
    building_type_defs: Dict[str, Any], # Not directly used, but part of standard signature
    now_venice_dt: datetime, # Current Venice time
    now_utc_dt: datetime,    # Current UTC time
    transport_api_url: str,
    api_base_url: str # For other API calls if needed by helpers
) -> Optional[Dict[str, Any]]: # Return the created activity record or None
    """
    Creates a 'goto_location' activity.

    Expected activity_params:
    - targetBuildingId (str): The BuildingId of the destination.
    - fromBuildingId (str, optional): The BuildingId of the starting location. If None, current citizen position is used.
    - details (dict, optional): A dictionary containing structured data for the 'Notes' field.
                                This often includes 'nextActivityType' and 'nextActivityParameters' for chaining.
    - notes (str, optional): Simple text notes if 'details' is not provided or for additional context.
    - title (str, optional): Custom title for the activity.
    - description (str, optional): Custom description for the activity.
    """
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_id = citizen_record['id'] # Airtable record ID
    
    target_building_id = activity_params.get('targetBuildingId')
    from_building_id = activity_params.get('fromBuildingId') # Optional
    
    details_for_activity = activity_params.get('details') # This is a dict
    notes_for_activity = activity_params.get('notes')     # This is a string

    if not target_building_id:
        log.error(f"Missing targetBuildingId for goto_location for {citizen_username}.")
        return None

    # Determine start location for pathfinding
    start_location_for_path: Any = None
    current_citizen_pos_str = citizen_record['fields'].get('Position')
    current_citizen_pos_coords: Optional[Dict[str, float]] = None
    if current_citizen_pos_str:
        try:
            current_citizen_pos_coords = json.loads(current_citizen_pos_str)
        except json.JSONDecodeError:
            log.warning(f"Could not parse current position for {citizen_username}: {current_citizen_pos_str}")
            # Potentially try to assign a random start if critical, or fail. For now, let pathfinder handle if None.

    if from_building_id:
        from_building_record = get_building_record(tables, from_building_id)
        if from_building_record:
            start_location_for_path = from_building_record # Pass full record
        else:
            log.warning(f"FromBuilding {from_building_id} not found. Using current citizen position if available.")
            start_location_for_path = current_citizen_pos_coords
    else:
        start_location_for_path = current_citizen_pos_coords

    if not start_location_for_path:
        log.error(f"Could not determine a valid start location for pathfinding for {citizen_username}.")
        return None

    # Determine end location for pathfinding
    target_building_record = get_building_record(tables, target_building_id)
    if not target_building_record:
        log.error(f"TargetBuilding {target_building_id} not found for goto_location for {citizen_username}.")
        return None
    
    # Pathfinding
    path_data = find_path_between_buildings_or_coords(
        start_location_for_path, 
        target_building_record, # Pass full record
        api_base_url, # Pass through the API base URL
        transport_api_url=transport_api_url
    )

    if not path_data or not path_data.get('success') or not path_data.get('path'):
        log.error(f"Pathfinding failed for {citizen_username} to {target_building_id}.")
        return None

    # Activity Timings
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800) # Default 30 min
    start_time_utc = now_utc_dt
    end_time_utc = start_time_utc + timedelta(seconds=duration_seconds)
    start_time_utc_iso = start_time_utc.isoformat()
    end_time_utc_iso = end_time_utc.isoformat()

    activity_id = f"goto_location_{citizen_username.lower()}_{uuid.uuid4().hex[:8]}"
    
    title = activity_params.get('title') or f"Traveling to {target_building_record['fields'].get('Name', target_building_id)}"
    description = activity_params.get('description') or f"{citizen_username} is traveling to {target_building_record['fields'].get('Name', target_building_id)}."
    
    # Consolidate details and notes into the 'Notes' field
    # If 'details_for_activity' (a dict) is provided, it becomes a JSON string in 'Notes'.
    # If only 'notes_for_activity' (a string) is provided, it's used directly.
    # If both, 'details_for_activity' takes precedence for the structured part.
    final_notes_content: Optional[str] = None
    if details_for_activity and isinstance(details_for_activity, dict):
        final_notes_content = json.dumps(details_for_activity)
        if notes_for_activity: # Append simple notes if also provided
            final_notes_content += f"\nAdditional Notes: {notes_for_activity}"
    elif notes_for_activity:
        final_notes_content = notes_for_activity

    # Prepare the payload for the activity record
    payload = {
        "ActivityId": activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": from_building_id, # This is the custom ID
        "ToBuilding": target_building_id,   # This is the custom ID
        "Path": json.dumps(path_data.get('path', [])),
        "Notes": final_notes_content, # Consolidated notes/details
        "Status": "created",
        "Title": title,
        "Description": description,
        "CreatedAt": start_time_utc_iso, 
        "StartDate": start_time_utc_iso,
        "EndDate": end_time_utc_iso,
        "Priority": 50  # Default priority for goto_location
    }
    
    # Remove "Notes" key if its content is None to avoid sending "null" string to Airtable
    if payload.get("Notes") is None:
        del payload["Notes"]

    # Create the activity record
    new_activity_record = create_activity_record_from_payload(tables, payload)
    
    if new_activity_record:
        log.info(f"Successfully created 'goto_location' activity {activity_id} for {citizen_username} to {target_building_id}.")
    else:
        log.error(f"Failed to create 'goto_location' activity for {citizen_username} to {target_building_id} after payload preparation.")
        
    return new_activity_record
