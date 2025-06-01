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
    current_time_utc: Optional[datetime.datetime] = None, # Added current_time_utc, optional for backward compatibility if called elsewhere
    start_time_utc_iso: Optional[str] = None # New parameter for explicit start time
) -> Optional[Dict]:
    """Creates an idle activity for a citizen."""
    log.info(f"Attempting to create idle activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) with explicit start: {start_time_utc_iso}")
    
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc

        if current_time_utc is None: # Fallback if not provided (should not happen from citizen_general_activities)
            log.warning("current_time_utc not provided to try_create_idle_activity, using real time UTC.")
            current_time_utc = datetime.datetime.now(pytz.UTC)

        # Determine effective StartDate
        effective_start_date_iso: str
        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
            # Ensure current_time_utc (used for fallback end_date calculation) is aligned if start_time is provided
            # This is tricky because end_date_iso is passed in. The caller should ensure end_date_iso is correct
            # relative to the start_time_utc_iso if provided.
            # For idle, the duration is fixed, so we can recalculate EndDate if start_time_utc_iso is given.
        else:
            effective_start_date_iso = current_time_utc.isoformat()

        # Determine effective EndDate
        effective_end_date_iso: str
        if end_date_iso: # If caller provides a specific end date
            if start_time_utc_iso:
                # If start_time_utc_iso is provided, we assume end_date_iso is ALREADY relative to it.
                # Or, if idle always has a fixed duration, we recalculate. Let's assume fixed duration.
                IDLE_ACTIVITY_DURATION_HOURS = 1 
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                log.info(f"Recalculated idle EndDate to {effective_end_date_iso} based on provided start_time_utc_iso and fixed duration.")
            else:
                effective_end_date_iso = end_date_iso # Use caller-provided end_date_iso
        else: # Fallback if end_date_iso was not provided
            IDLE_ACTIVITY_DURATION_HOURS = 1 
            start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
            if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
            effective_end_date_iso = (start_dt_obj + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            log.warning(f"end_date_iso for idle activity was not provided, calculated fallback (UTC): {effective_end_date_iso} based on StartDate: {effective_start_date_iso}")

        default_note = "⏳ **Idle activity**"
        if reason_message:
            notes = f"{default_note}: {reason_message}"
        else:
            notes = f"{default_note} due to undetermined circumstances."

        activity_payload = {
            "ActivityId": f"idle_{citizen_custom_id}_{int(time.time())}",
            "Type": "idle",
            "Citizen": citizen_username,
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso, 
            "EndDate": effective_end_date_iso,
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
