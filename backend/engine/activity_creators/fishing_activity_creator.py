"""
Creator for 'fishing' and 'emergency_fishing' activities.
"""
import logging
import datetime
import json
import uuid
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

FISHING_ACTIVITY_BASE_DURATION_MINUTES = 60 # Includes travel and some fishing time

def try_create_fishing_activity(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    target_water_point_id: str, # e.g., "wp_lat_lng"
    # target_water_point_pos: Dict[str, float], # Position is in path_data
    path_data_to_water_point: Dict, # Path data from transport API
    current_time_utc: datetime.datetime,
    activity_type: str = "fishing" # "fishing" or "emergency_fishing"
) -> Optional[Dict]:
    """Creates a fishing or emergency_fishing activity."""
    log.info(f"Attempting to create '{activity_type}' for {citizen_username} to water point {target_water_point_id}")

    try:
        start_date_iso = path_data_to_water_point.get('timing', {}).get('startDate', current_time_utc.isoformat())
        end_date_iso = path_data_to_water_point.get('timing', {}).get('endDate')
        
        if not end_date_iso: 
            # If pathfinding didn't provide an end date (e.g., simple path), calculate one
            travel_duration_default_seconds = path_data_to_water_point.get('timing', {}).get('durationSeconds', FISHING_ACTIVITY_BASE_DURATION_MINUTES * 60)
            start_datetime_obj = datetime.datetime.fromisoformat(start_date_iso.replace("Z", "+00:00"))
            end_datetime_obj = start_datetime_obj + datetime.timedelta(seconds=travel_duration_default_seconds)
            end_date_iso = end_datetime_obj.isoformat()
        
        path_json_str = json.dumps(path_data_to_water_point.get('path', []))
        activity_id_str = f"{activity_type}_{citizen_custom_id}_{uuid.uuid4()}"
        
        description = f"Going fishing at {target_water_point_id}."
        priority_val = 70 # Default for "fishing"
        if activity_type == "emergency_fishing":
            description = f"Urgently going fishing at {target_water_point_id} due to hunger."
            priority_val = 4 # New priority for emergency_fishing

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": activity_type,
            "Citizen": citizen_username,
            "ToBuilding": target_water_point_id, # Store water point ID here for reference by processor
            "CreatedAt": current_time_utc.isoformat(),
            "StartDate": start_date_iso,
            "EndDate": end_date_iso,
            "Path": path_json_str,
            "Transporter": path_data_to_water_point.get('transporter'), # If applicable (e.g., rowboat)
            "Notes": description,
            "Description": description, # For display
            "Status": "created",
            "Priority": priority_val 
        }
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created '{activity_type}' activity: {activity['id']} for {citizen_username} to {target_water_point_id}")
            return activity
        else:
            log.error(f"Failed to create '{activity_type}' activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating '{activity_type}' activity for {citizen_username}: {e}")
        return None
