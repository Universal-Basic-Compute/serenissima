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
    current_time_utc: Optional[datetime.datetime] = None, # Added current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """
    Creates a stay activity for a citizen at a target location (home or inn).
    The end_time_utc_iso should be pre-calculated by the calling logic (in UTC) relative to the intended start.
    """
    log.info(f"Attempting to create stay activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) at {stay_location_type} {target_building_custom_id} with explicit start: {start_time_utc_iso}")
    
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc

        if current_time_utc is None: # Fallback
            log.warning("current_time_utc not provided to try_create_stay_activity, using real time UTC.")
            current_time_utc = datetime.datetime.now(pytz.UTC)

        # Determine effective StartDate
        effective_start_date_iso: str
        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
        else:
            effective_start_date_iso = current_time_utc.isoformat()

        # Determine effective EndDate
        # Caller is responsible for providing end_time_utc_iso that is correct relative to the intended start.
        # If start_time_utc_iso is provided, end_time_utc_iso should align with it.
        # If stay activities have a fixed duration, we could recalculate here. For now, assume caller handles it.
        effective_end_date_iso: str
        if end_time_utc_iso:
            effective_end_date_iso = end_time_utc_iso
        else: 
            # Fallback if end_time_utc_iso was not provided
            # This fallback calculates end time based on effective_start_date_iso
            # and NIGHT_END_HOUR in Venice time, then converts back to UTC.
            VENICE_TIMEZONE_FALLBACK = pytz.timezone('Europe/Rome')
            start_dt_obj_for_fallback = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
            if start_dt_obj_for_fallback.tzinfo is None: start_dt_obj_for_fallback = pytz.UTC.localize(start_dt_obj_for_fallback)
            
            current_time_venice_for_fallback = start_dt_obj_for_fallback.astimezone(VENICE_TIMEZONE_FALLBACK)
            NIGHT_END_HOUR = 6 
            if current_time_venice_for_fallback.hour < NIGHT_END_HOUR:
                end_time_venice_calc = current_time_venice_for_fallback.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
            else:
                tomorrow_venice_calc = current_time_venice_for_fallback + datetime.timedelta(days=1)
                end_time_venice_calc = tomorrow_venice_calc.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
            effective_end_date_iso = end_time_venice_calc.astimezone(pytz.UTC).isoformat()
            log.warning(f"end_time_utc_iso for stay activity was not provided, calculated fallback (UTC): {effective_end_date_iso} based on StartDate: {effective_start_date_iso}")

        note_message = f"🌙 **Resting** at {stay_location_type} for the night"
        activity_id_prefix = "rest" if stay_location_type == "home" else f"rest_at_{stay_location_type}"

        activity_payload = {
            "ActivityId": f"{activity_id_prefix}_{citizen_custom_id}_{int(time.time())}",
            "Type": "rest", 
            "Citizen": citizen_username,
            "FromBuilding": target_building_custom_id, 
            "ToBuilding": target_building_custom_id,   
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso, 
            "EndDate": effective_end_date_iso,
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
