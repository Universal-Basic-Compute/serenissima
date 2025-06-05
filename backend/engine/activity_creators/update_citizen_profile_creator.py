import logging
import json
import uuid
from datetime import timedelta
from typing import Dict, List, Any, Optional

# Assuming utils are in backend.engine.utils
from backend.engine.utils.activity_helpers import (
    LogColors,
    get_building_record,
    find_path_between_buildings_or_coords,
    get_closest_building_of_type
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_record: Dict[str, Any], 
    activity_type: str, 
    activity_parameters: Dict[str, Any],
    now_venice_dt: Any, # datetime
    now_utc_dt: Any, # datetime
    transport_api_url: str,
    api_base_url: str
) -> List[Dict[str, Any]]:
    """
    Creates activities for a citizen to update their profile.
    This involves travel to a public archives/office and then finalizing the update.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    
    # Extract profile fields to update from activity_parameters
    # These are the fields the user wants to change.
    profile_data_to_update = {
        key: value for key, value in activity_parameters.items() 
        if key in ["firstName", "lastName", "familyMotto", "coatOfArmsImageUrl", 
                   "telegramUserId", "color", "secondaryColor", "description", 
                   "corePersonality", "preferences", "homeCity"] # Added homeCity
    }

    if not profile_data_to_update:
        log.warning(f"{LogColors.WARNING}No profile data provided for update by {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'update_citizen_profile' chain for {citizen_username}. Data: {profile_data_to_update}{LogColors.ENDC}")

    # 1. Determine citizen's current location
    citizen_position_str = citizen_record['fields'].get('Position')
    from_location_data = None
    if citizen_position_str:
        try:
            pos_data = json.loads(citizen_position_str)
            if 'lat' in pos_data and 'lng' in pos_data: from_location_data = {"lat": pos_data['lat'], "lng": pos_data['lng']}
            elif 'building_id' in pos_data: from_location_data = {"building_id": pos_data['building_id']}
        except json.JSONDecodeError:
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"): from_location_data = {"building_id": citizen_position_str}
    
    if not from_location_data:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location for profile update.{LogColors.ENDC}")
        return []

    # 2. Determine target office (e.g., public_archives)
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')
    target_office_record = None
    target_office_building_id = None
    preferred_office_types = ["public_archives", "town_hall"]


    if user_specified_target_office_id:
        target_office_record = get_building_record(tables, user_specified_target_office_id)
        if target_office_record: target_office_building_id = target_office_record['fields'].get('BuildingId')
        else: log.warning(f"{LogColors.WARNING}User-specified target office {user_specified_target_office_id} not found.{LogColors.ENDC}")

    if not target_office_record:
        for office_type in preferred_office_types:
            found_office = get_closest_building_of_type(tables, from_location_data, office_type, transport_api_url)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id} for profile update.{LogColors.ENDC}")
                break
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office found for {citizen_username} to update profile.{LogColors.ENDC}")
            return []
    
    # 3. Create goto_location activity
    path_data = find_path_between_buildings_or_coords(tables, from_location_data, {"building_id": target_office_building_id}, transport_api_url)
    current_end_time_utc = now_utc_dt

    if path_data and path_data.get("path"):
        path_json = json.dumps(path_data["path"])
        travel_duration_minutes = path_data.get("duration_minutes", 30)
        
        goto_activity_id = str(uuid.uuid4())
        goto_start_time_utc = now_utc_dt
        goto_end_time_utc = goto_start_time_utc + timedelta(minutes=travel_duration_minutes)
        current_end_time_utc = goto_end_time_utc

        goto_activity = {
            "ActivityId": goto_activity_id, "Citizen": citizen_username, "Type": "goto_location", "Status": "created",
            "StartDate": goto_start_time_utc.isoformat(), "EndDate": goto_end_time_utc.isoformat(),
            "ToBuilding": target_office_building_id, "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Title": f"Travel to {target_office_record['fields'].get('Name', target_office_building_id)}",
            "Description": f"{citizen_username} is traveling to update their profile.",
            "Thought": f"I need to visit the {target_office_record['fields'].get('Type', 'office')} to update my records.",
            "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}. Finalize activity will start immediately.{LogColors.ENDC}")

    # 4. Create finalize_update_citizen_profile activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 10 
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    # Ensure citizenAirtableId is included for the processor
    profile_data_to_update["citizenAirtableId"] = citizen_record['id'] 

    finalize_activity = {
        "ActivityId": finalize_activity_id, "Citizen": citizen_username, "Type": "finalize_update_citizen_profile", "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(), "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id, 
        "Notes": json.dumps(profile_data_to_update), # Store the data to be updated
        "Title": f"Update Profile for {citizen_username}",
        "Description": f"{citizen_username} is updating their profile information at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": "Time to update my official records.",
        "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created finalize_update_citizen_profile activity {finalize_activity_id} for {citizen_username}.{LogColors.ENDC}")
    
    return activities_created
