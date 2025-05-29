"""
Creator for 'idle' activities.
"""
import logging
import datetime
import time
import pytz # For timezone handling
import random # Added for random idle descriptions
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
    end_date_iso: str = None, # Expecting ISO format string for EndDate (UTC)
    reason_message: Optional[str] = None,
    current_time_utc: Optional[datetime.datetime] = None # Added current_time_utc, optional for backward compatibility if called elsewhere
) -> Optional[Dict]:
    """Creates an idle activity for a citizen."""
    log.info(f"Attempting to create idle activity for citizen {citizen_username} (CustomID: {citizen_custom_id})")
    
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc

        if current_time_utc is None: # Fallback if not provided (should not happen from citizen_general_activities)
            log.warning("current_time_utc not provided to try_create_idle_activity, using real time UTC.")
            current_time_utc = datetime.datetime.now(pytz.UTC)

        start_date_to_use = current_time_utc.isoformat()
        end_date_to_use = end_date_iso # This is already calculated based on now_utc_dt by the caller

        if not end_date_to_use: # Fallback if end_date_iso was somehow None
            IDLE_ACTIVITY_DURATION_HOURS = 1 
            end_time_calc = current_time_utc + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)
            end_date_to_use = end_time_calc.isoformat()
            log.warning(f"end_date_iso for idle activity was not provided, calculated fallback (UTC): {end_date_to_use}")

        default_note = "⏳ **Idle activity**"
        if reason_message:
            notes = f"{default_note}: {reason_message}"
        else:
            notes = f"{default_note} due to undetermined circumstances."

        activity_payload = {
            "ActivityId": f"idle_{citizen_custom_id}_{int(time.time())}",
            "Type": "idle",
            "Citizen": citizen_username,
            "CreatedAt": start_date_to_use, # Use current_time_utc
            "StartDate": start_date_to_use, # Use current_time_utc
            "EndDate": end_date_to_use,     # Use provided or calculated UTC end date
            "Notes": notes,
            "Status": "created"
        }

        idle_descriptions = [
            f"{citizen_username} is observing the passersby.",
            f"{citizen_username} is lost in thought, gazing at the canals.",
            f"{citizen_username} is taking a moment to rest their feet.",
            f"{citizen_username} is idly sketching in a small notebook.",
            f"{citizen_username} is humming a forgotten tune.",
            f"{citizen_username} is watching the pigeons in the piazza.",
            f"{citizen_username} is stretching and yawning, enjoying a brief respite.",
            f"{citizen_username} is idly polishing a small trinket.",
            f"{citizen_username} is simply enjoying the Venetian air.",
            f"{citizen_username} is contemplating their next move."
        ]
        activity_payload["Description"] = random.choice(idle_descriptions)
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
