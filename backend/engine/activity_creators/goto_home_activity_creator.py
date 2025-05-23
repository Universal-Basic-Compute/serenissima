"""
Creator for 'goto_home' activities.
"""
import logging
import datetime
import time
import json
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_custom_id: str, 
    citizen_username: str, 
    citizen_airtable_id: str, 
    home_custom_id: str, # Changed to custom BuildingId
    path_data: Dict
) -> Optional[Dict]:
    """Creates a goto_home activity for a citizen."""
    log.info(f"Attempting to create goto_home activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to home {home_custom_id}")
    
    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.datetime.now(VENICE_TIMEZONE)
        
        start_date = path_data.get('timing', {}).get('startDate', now_venice.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            end_time_calc = now_venice + datetime.timedelta(hours=1) # Default 1 hour travel
            end_date = end_time_calc.isoformat()
        
        path_json = json.dumps(path_data.get('path', []))
        
        transporter = path_data.get('transporter') # Get transporter from path_data

        activity_payload = {
            "ActivityId": f"goto_home_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_home",
            "Citizen": citizen_username,
            "ToBuilding": home_custom_id, # Use custom BuildingId
            "CreatedAt": now_venice.isoformat(),
            "StartDate": start_date, # Expected to be Venice time ISO string
            "EndDate": end_date,     # Expected to be Venice time ISO string
            "Path": path_json,
            "Transporter": transporter, # Add Transporter field
            "Notes": "🏠 **Going home** for the night",
            "Status": "created"
        }
        activity = tables['activities'].create(activity_payload)

        if activity and activity.get('id'):
            log.info(f"Created goto_home activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create goto_home activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating goto_home activity for {citizen_username}: {e}")
        return None
