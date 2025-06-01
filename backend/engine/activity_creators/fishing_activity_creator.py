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
    path_data_to_water_point: Dict, # Path data from transport API
    current_time_utc: datetime.datetime,
    activity_type: str = "fishing", # "fishing" or "emergency_fishing"
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a fishing or emergency_fishing activity."""
    log.info(f"Attempting to create '{activity_type}' for {citizen_username} to water point {target_water_point_id} with explicit start: {start_time_utc_iso}")

    try:
        effective_start_date_iso: str
        effective_end_date_iso: str

        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
            start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
            if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
            
            if path_data_to_water_point and path_data_to_water_point.get('timing', {}).get('durationSeconds') is not None:
                duration_seconds = path_data_to_water_point['timing']['durationSeconds']
                # This duration is travel + fishing. If only travel, add fishing time.
                # For now, assume path_data_to_water_point.timing.durationSeconds is travel time only.
                # The processor will handle the actual fishing duration.
                # So, EndDate here is arrival at fishing spot.
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(seconds=duration_seconds)).isoformat()
            else: # No path data or no duration, assume a base duration for travel + fishing
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(minutes=FISHING_ACTIVITY_BASE_DURATION_MINUTES)).isoformat()
        
        elif path_data_to_water_point and path_data_to_water_point.get('timing', {}).get('startDate') and path_data_to_water_point.get('timing', {}).get('endDate'):
            effective_start_date_iso = path_data_to_water_point['timing']['startDate']
            # EndDate from path_data is arrival. Processor handles fishing duration.
            effective_end_date_iso = path_data_to_water_point['timing']['endDate']
        else: # Fallback to current_time_utc and base duration
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(minutes=FISHING_ACTIVITY_BASE_DURATION_MINUTES)).isoformat()
        
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
            "ToBuilding": target_water_point_id, 
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Path": path_json_str,
            "Transporter": path_data_to_water_point.get('transporter'), 
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
