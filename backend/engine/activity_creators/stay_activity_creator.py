"""
Creator for 'stay' (rest) activities.
"""
import logging
import datetime
import time
import pytz # For timezone handling
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import get_building_record # Import helper

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
    target_building_custom_id: str, # Changed to custom BuildingId
    stay_location_type: str = "home",
    end_time_utc_iso: str = None, # Expecting ISO format string for EndDate (UTC)
    current_time_utc: Optional[datetime.datetime] = None # Added current_time_utc
) -> Optional[Dict]:
    """
    Creates a stay activity for a citizen at a target location (home or inn).
    The end_time_utc_iso should be pre-calculated by the calling logic (in UTC).
    """
    log.info(f"Attempting to create stay activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) at {stay_location_type} {target_building_custom_id}")
    
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc

        if current_time_utc is None: # Fallback
            log.warning("current_time_utc not provided to try_create_stay_activity, using real time UTC.")
            current_time_utc = datetime.datetime.now(pytz.UTC)

        start_date_to_use = current_time_utc.isoformat()
        end_date_to_use = end_time_utc_iso # This is already calculated based on now_utc_dt by the caller

        if not end_date_to_use: 
            # Fallback if end_time_utc_iso was not provided (should be by citizen_general_activities)
            # This fallback calculates end time based on current_time_utc (real or forced)
            # and NIGHT_END_HOUR in Venice time, then converts back to UTC.
            VENICE_TIMEZONE_FALLBACK = pytz.timezone('Europe/Rome')
            current_time_venice_for_fallback = current_time_utc.astimezone(VENICE_TIMEZONE_FALLBACK)
            NIGHT_END_HOUR = 6 
            if current_time_venice_for_fallback.hour < NIGHT_END_HOUR:
                end_time_venice_calc = current_time_venice_for_fallback.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
            else:
                tomorrow_venice_calc = current_time_venice_for_fallback + datetime.timedelta(days=1)
                end_time_venice_calc = tomorrow_venice_calc.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
            end_date_to_use = end_time_venice_calc.astimezone(pytz.UTC).isoformat()
            log.warning(f"end_time_utc_iso for stay activity was not provided, calculated fallback (UTC): {end_date_to_use}")

        note_message = f"🌙 **Resting** at {stay_location_type} for the night"
        activity_id_prefix = "rest" if stay_location_type == "home" else f"rest_at_{stay_location_type}"

        activity_payload = {
            "ActivityId": f"{activity_id_prefix}_{citizen_custom_id}_{int(time.time())}",
            "Type": "rest", 
            "Citizen": citizen_username,
            "FromBuilding": target_building_custom_id, # Use custom BuildingId
            "ToBuilding": target_building_custom_id,   # Use custom BuildingId
            "CreatedAt": start_date_to_use, # Use current_time_utc
            "StartDate": start_date_to_use, # Use current_time_utc
            "EndDate": end_date_to_use,     # Use provided or calculated UTC end date
            "Notes": note_message,
        }
        target_bldg_record = get_building_record(tables, target_building_custom_id)
        target_bldg_name_desc = target_bldg_record['fields'].get('Name', target_bldg_record['fields'].get('Type', target_building_custom_id)) if target_bldg_record else target_building_custom_id
        activity_payload["Description"] = f"Resting at {stay_location_type} ({target_bldg_name_desc})"
        activity_payload["Status"] = "created"
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
