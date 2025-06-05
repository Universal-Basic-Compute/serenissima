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
    STUB: Creates activities for a citizen to update their profile.
    This involves travel to a public archives/office and then finalizing the update.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    
    log.warning(f"{LogColors.ACTIVITY_STUB}STUB: 'update_citizen_profile_creator.try_create' called for citizen {citizen_username}. Full implementation pending.{LogColors.ENDC}")
    log.info(f"{LogColors.ACTIVITY_STUB}Params: {activity_parameters}{LogColors.ENDC}")

    # Example of how it might be structured (actual implementation needed)
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
    target_office_id = activity_parameters.get('targetOfficeBuildingId')
    target_office_record = None
    if target_office_id:
        target_office_record = get_building_record(tables, target_office_id)
    
    if not target_office_record:
        target_office_record = get_closest_building_of_type(tables, from_location_data, "public_archives", transport_api_url)
        if target_office_record:
            target_office_id = target_office_record['fields'].get('BuildingId')
        else:
            log.error(f"{LogColors.FAIL}No public_archives found for {citizen_username} to update profile.{LogColors.ENDC}")
            return []
    
    # 3. Create goto_location activity
    path_data = find_path_between_buildings_or_coords(tables, from_location_data, {"building_id": target_office_id}, transport_api_url)
    current_end_time_utc = now_utc_dt

    if path_data and path_data.get("path"):
        # ... (create goto_location activity, append to activities_created, update current_end_time_utc) ...
        log.info(f"{LogColors.ACTIVITY_STUB} STUB: Would create goto_location to {target_office_id} for profile update.{LogColors.ENDC}")
        # Placeholder for travel duration
        travel_duration_minutes = path_data.get("duration_minutes", 30) 
        current_end_time_utc += timedelta(minutes=travel_duration_minutes)


    # 4. Create finalize_update_citizen_profile activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 10 
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    # Extract profile fields to update from activity_parameters
    profile_update_data = {
        key: value for key, value in activity_parameters.items() 
        if key in ["firstName", "lastName", "familyMotto", "coatOfArmsImageUrl", "telegramUserId", "color", "secondaryColor", "description", "corePersonality", "preferences"] # Add more fields as needed
    }
    profile_update_data["citizenAirtableId"] = citizen_record['id'] # Needed by processor

    finalize_activity = {
        "ActivityId": finalize_activity_id, "Citizen": citizen_username, "Type": "finalize_update_citizen_profile", "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(), "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_id, 
        "Notes": json.dumps(profile_update_data),
        "Title": f"Update Profile for {citizen_username}",
        "Description": f"{citizen_username} is updating their profile information at {target_office_record['fields'].get('Name', target_office_id)}.",
        "Thought": "Time to update my official records.",
        "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
    }
    # activities_created.append(finalize_activity) # Uncomment when goto is implemented
    log.info(f"{LogColors.ACTIVITY_STUB}STUB: Would create finalize_update_citizen_profile activity. Data: {profile_update_data}{LogColors.ENDC}")
    
    # For now, returning empty as it's a stub.
    # When implemented, should return activities_created
    return []
