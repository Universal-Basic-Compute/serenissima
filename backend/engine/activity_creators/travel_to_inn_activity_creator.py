"""
Creator for 'travel_to_inn' activities.
"""
import logging
import datetime
import time
import json
import pytz # For timezone handling
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import get_building_record # Import helper

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_custom_id: str, 
    citizen_username: str, 
    citizen_airtable_id: str, 
    inn_custom_id: str, # Changed to custom BuildingId
    path_data: Dict,
    current_time_utc: datetime.datetime, # Added current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a travel_to_inn activity for a citizen."""
    log.info(f"Attempting to create travel_to_inn activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to inn {inn_custom_id} with explicit start: {start_time_utc_iso}")
    
    try:
        # Determine effective StartDate and EndDate
        effective_start_date_iso: str
        effective_end_date_iso: str

        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
            if path_data and path_data.get('timing', {}).get('durationSeconds') is not None:
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                duration_seconds = path_data['timing']['durationSeconds']
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(seconds=duration_seconds)).isoformat()
            else:
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(hours=1)).isoformat() # Default 1 hour
        elif path_data and path_data.get('timing', {}).get('startDate') and path_data.get('timing', {}).get('endDate'):
            effective_start_date_iso = path_data['timing']['startDate']
            effective_end_date_iso = path_data['timing']['endDate']
        else:
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(hours=1)).isoformat() # Default 1 hour
        
        path_json = json.dumps(path_data.get('path', []))
        
        transporter = path_data.get('transporter') # Get transporter from path_data

        activity_payload = {
            "ActivityId": f"goto_inn_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_inn",
            "Citizen": citizen_username,
            "ToBuilding": inn_custom_id, 
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Path": path_json,
            "Transporter": transporter, 
            "Notes": "🏨 **Going to an inn** for the night",
        }
        inn_record = get_building_record(tables, inn_custom_id)
        inn_name_desc = inn_record['fields'].get('Name', inn_record['fields'].get('Type', inn_custom_id)) if inn_record else inn_custom_id
        activity_payload["Description"] = f"Traveling to inn: {inn_name_desc}"
        activity_payload["Status"] = "created"
        activity = tables['activities'].create(activity_payload)

        if activity and activity.get('id'):
            log.info(f"Created travel_to_inn activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create travel_to_inn activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating travel_to_inn activity for {citizen_username}: {e}")
        return None
