"""
Creator for 'idle' activities.
"""
import logging
import datetime
import time
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

# IDLE_ACTIVITY_DURATION_HOURS would ideally be passed or imported
# For now, define it here or assume the calling logic handles EndDate.
# Assuming EndDate is passed for simplicity.

def try_create(
    tables: Dict[str, Any], 
    citizen_custom_id: str, 
    citizen_username: str, 
    citizen_airtable_id: str,
    end_date_iso: str = None # Expecting ISO format string for EndDate
) -> Optional[Dict]:
    """Creates an idle activity for a citizen."""
    log.info(f"Attempting to create idle activity for citizen {citizen_username} (CustomID: {citizen_custom_id})")
    
    try:
        now = datetime.datetime.now(pytz.UTC)

        if not end_date_iso:
            IDLE_ACTIVITY_DURATION_HOURS = 1 # Fallback
            end_time = now + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)
            end_date_iso = end_time.isoformat()
            log.warning(f"end_date_iso for idle activity not provided, calculated fallback: {end_date_iso}")

        activity_payload = {
            "ActivityId": f"idle_{citizen_custom_id}_{int(time.time())}",
            "Type": "idle",
            "Citizen": citizen_username,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_date_iso,
            "Notes": "⏳ **Idle activity** due to failed path finding or no home/work"
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created idle activity: {activity['id']}")
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_id}: {e_update}")
            return activity
        else:
            log.error(f"Failed to create idle activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating idle activity for {citizen_username}: {e}")
        return None
