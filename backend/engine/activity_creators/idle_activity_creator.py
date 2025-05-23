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
    end_date_iso: str = None, # Expecting ISO format string for EndDate
    reason_message: Optional[str] = None
) -> Optional[Dict]:
    """Creates an idle activity for a citizen."""
    log.info(f"Attempting to create idle activity for citizen {citizen_username} (CustomID: {citizen_custom_id})")
    
    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.datetime.now(VENICE_TIMEZONE)

        if not end_date_iso: # end_date_iso is expected to be a Venice time ISO string
            IDLE_ACTIVITY_DURATION_HOURS = 1 # Fallback
            end_time_calc = now_venice + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)
            end_date_iso = end_time_calc.isoformat()
            log.warning(f"end_date_iso for idle activity (Venice time) not provided, calculated fallback: {end_date_iso}")

        default_note = "⏳ **Idle activity**"
        if reason_message:
            notes = f"{default_note}: {reason_message}"
        else:
            notes = f"{default_note} due to undetermined circumstances."

        activity_payload = {
            "ActivityId": f"idle_{citizen_custom_id}_{int(time.time())}",
            "Type": "idle",
            "Citizen": citizen_username,
            "CreatedAt": now_venice.isoformat(),
            "StartDate": now_venice.isoformat(),
            "EndDate": end_date_iso, # Expected to be Venice time ISO string
            "Notes": notes
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created idle activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create idle activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating idle activity for {citizen_username}: {e}")
        return None
