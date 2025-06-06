"""
Creator for 'manage_public_dock' activities.
"""
import logging
import datetime
import uuid
import pytz
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import create_activity_record, LogColors, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    public_dock_record: Dict[str, Any],
    duration_hours: float,
    current_time_utc: datetime.datetime,
    start_time_utc_iso: Optional[str] = None
) -> Optional[Dict]:
    """
    Creates a 'manage_public_dock' activity for a citizen at a specific public dock.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    dock_custom_id = public_dock_record['fields'].get('BuildingId')
    dock_name = public_dock_record['fields'].get('Name', dock_custom_id)

    if not all([citizen_custom_id, citizen_username, dock_custom_id]):
        log.error(f"{LogColors.FAIL}Missing crucial data for creating manage_public_dock activity.{LogColors.ENDC}")
        return None

    log.info(f"{LogColors.OKBLUE}Attempting to create 'manage_public_dock' for {citizen_username} at {dock_name} ({dock_custom_id}).{LogColors.ENDC}")

    try:
        # Ensure current_time_utc is timezone-aware (should be UTC)
        if current_time_utc.tzinfo is None:
            current_time_utc = pytz.UTC.localize(current_time_utc)
            log.warning(f"Localized current_time_utc in manage_public_dock_creator for {citizen_username}")

        if start_time_utc_iso:
            start_dt_obj = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if start_dt_obj.tzinfo is None:
                start_dt_obj = pytz.UTC.localize(start_dt_obj)
            effective_start_date_iso = start_dt_obj.isoformat()
        else:
            effective_start_date_iso = current_time_utc.isoformat()
            start_dt_obj = current_time_utc
        
        end_dt_obj = start_dt_obj + datetime.timedelta(hours=duration_hours)
        effective_end_date_iso = end_dt_obj.isoformat()

        activity_title = f"Managing Public Dock: {dock_name}"
        activity_description = f"{citizen_username} is overseeing operations, assisting vessels, and collecting docking fees at {dock_name}."
        activity_thought = f"Time to manage the dock ({dock_name}) and ensure everything is running smoothly. Perhaps some interesting ships will arrive today."

        # Citizen is already at the dock, so FromBuilding and ToBuilding are the same.
        # Path is not applicable as it's an on-site management task.
        activity_record = create_activity_record(
            tables=tables,
            citizen_username=citizen_username,
            activity_type="manage_public_dock",
            start_date_iso=effective_start_date_iso,
            end_date_iso=effective_end_date_iso,
            from_building_id=dock_custom_id,
            to_building_id=dock_custom_id,
            path_json="[]", # No path, on-site
            title=activity_title,
            description=activity_description,
            thought=activity_thought,
            priority_override=15 # Example priority, adjust as needed
        )

        if activity_record:
            log.info(f"{LogColors.OKGREEN}Successfully created 'manage_public_dock' activity: {activity_record.get('id')} for {citizen_username} at {dock_custom_id}.{LogColors.ENDC}")
            # Update the dock's CheckedAt field
            try:
                tables['buildings'].update(public_dock_record['id'], {'CheckedAt': datetime.datetime.now(VENICE_TIMEZONE).isoformat()})
                log.info(f"Updated CheckedAt for dock {dock_custom_id}.")
            except Exception as e_update_dock:
                log.error(f"Error updating CheckedAt for dock {dock_custom_id}: {e_update_dock}")

            return activity_record
        else:
            log.error(f"{LogColors.FAIL}Failed to create 'manage_public_dock' activity in Airtable for {citizen_username} at {dock_custom_id}.{LogColors.ENDC}")
            return None

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in try_create (manage_public_dock): {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return None
