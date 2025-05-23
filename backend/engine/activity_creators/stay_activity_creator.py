"""
Creator for 'stay' (rest) activities.
"""
import logging
import datetime
import time
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

# NIGHT_END_HOUR would ideally be passed or imported from a common config
# For now, let's define it here if createActivities.py doesn't expose it easily.
# Or, ensure the calling function in createActivities.py calculates end_time_utc.
# Assuming end_time_utc is passed directly for simplicity in this refactor.

def try_create(
    tables: Dict[str, Any], # Using Any for Table type for simplicity
    citizen_custom_id: str, 
    citizen_username: str, 
    citizen_airtable_id: str, 
    target_building_id: str, 
    stay_location_type: str = "home",
    end_time_utc_iso: str = None # Expecting ISO format string for EndDate
) -> Optional[Dict]:
    """
    Creates a stay activity for a citizen at a target location (home or inn).
    The end_time_utc_iso should be pre-calculated by the calling logic.
    """
    log.info(f"Attempting to create stay activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) at {stay_location_type} {target_building_id}")
    
    try:
        now = datetime.datetime.now(pytz.UTC)

        if not end_time_utc_iso:
            # Fallback if not provided, though it should be.
            # Calculate end time (next morning at 6 AM Venice time)
            venice_tz = pytz.timezone('Europe/Rome')
            venice_now = now.astimezone(venice_tz)
            NIGHT_END_HOUR = 6 # Assuming 6 AM
            if venice_now.hour < NIGHT_END_HOUR:
                end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
            else:
                tomorrow_venice = venice_now + datetime.timedelta(days=1)
                end_time_venice = tomorrow_venice.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
            end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
            log.warning(f"end_time_utc_iso was not provided, calculated fallback: {end_time_utc_iso}")

        note_message = f"🌙 **Resting** at {stay_location_type} for the night"
        activity_id_prefix = "rest" if stay_location_type == "home" else f"rest_at_{stay_location_type}"

        activity_payload = {
            "ActivityId": f"{activity_id_prefix}_{citizen_custom_id}_{int(time.time())}",
            "Type": "rest", 
            "Citizen": citizen_username,
            "FromBuilding": target_building_id,
            "ToBuilding": target_building_id,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time_utc_iso,
            "Notes": note_message
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created stay activity ({stay_location_type}): {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create stay activity ({stay_location_type}) for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating stay activity ({stay_location_type}) for {citizen_username}: {e}")
        return None
