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
    current_time_utc: datetime.datetime # Added current_time_utc
) -> Optional[Dict]:
    """Creates a travel_to_inn activity for a citizen."""
    log.info(f"Attempting to create travel_to_inn activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to inn {inn_custom_id}")
    
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
        
        start_date_iso_to_use = path_data.get('timing', {}).get('startDate', current_time_utc.isoformat())
        end_date_iso_to_use = path_data.get('timing', {}).get('endDate')
        
        if not end_date_iso_to_use:
            start_datetime_obj_for_calc = datetime.datetime.fromisoformat(start_date_iso_to_use.replace("Z", "+00:00")) if isinstance(start_date_iso_to_use, str) else start_date_iso_to_use
            if start_datetime_obj_for_calc.tzinfo is None: # Ensure timezone aware
                 start_datetime_obj_for_calc = pytz.UTC.localize(start_datetime_obj_for_calc)
            end_time_calc = start_datetime_obj_for_calc + datetime.timedelta(hours=1) # Default 1 hour travel
            end_date_iso_to_use = end_time_calc.isoformat()
        
        path_json = json.dumps(path_data.get('path', []))
        
        transporter = path_data.get('transporter') # Get transporter from path_data

        activity_payload = {
            "ActivityId": f"goto_inn_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_inn",
            "Citizen": citizen_username,
            "ToBuilding": inn_custom_id, # Use custom BuildingId
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": start_date_iso_to_use,      # Use determined start date
            "EndDate": end_date_iso_to_use,          # Use determined end date
            "Path": path_json,
            "Transporter": transporter, # Add Transporter field
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
