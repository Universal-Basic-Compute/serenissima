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
    home_id: str, 
    path_data: Dict
) -> Optional[Dict]:
    """Creates a goto_home activity for a citizen."""
    log.info(f"Attempting to create goto_home activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to home {home_id}")
    
    try:
        now = datetime.datetime.now(pytz.UTC)
        
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            end_time = now + datetime.timedelta(hours=1) # Default 1 hour travel
            end_date = end_time.isoformat()
        
        path_json = json.dumps(path_data.get('path', []))
        
        activity_payload = {
            "ActivityId": f"goto_home_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_home",
            "Citizen": citizen_username,
            "ToBuilding": home_id,
            "CreatedAt": now.isoformat(),
            "StartDate": start_date,
            "EndDate": end_date,
            "Path": path_json,
            "Notes": "🏠 **Going home** for the night"
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
