"""
Processor for 'fishing' and 'emergency_fishing' activities.
Adds 1 fish to citizen's inventory and updates AteAt.
Updates citizen's position to the fishing spot.
"""
import json
import logging
from datetime import datetime
import pytz
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    update_resource_count,
    VENICE_TIMEZONE,
    LogColors
)

log = logging.getLogger(__name__)

FISH_RESOURCE_ID = "fish" # Assuming "fish" is the resource ID for raw fish
FISH_CAUGHT_AMOUNT = 1.0

def process_fishing_activity(
    tables: Dict[str, Any],
    activity_record: Dict,
    building_type_defs: Dict, # Not directly used, but part of signature
    resource_defs: Dict
) -> bool:
    """Processes a 'fishing' or 'emergency_fishing' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    activity_type = activity_fields.get('Type') # "fishing" or "emergency_fishing"
    
    # target_water_point_id = activity_fields.get('ToBuilding') # Stored water point ID

    log.info(f"Processing '{activity_type}' activity ({activity_guid}) for {citizen_username}.")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False

    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso_venice = now_venice.isoformat()

    # 1. Add fish to inventory
    # The owner of the fish in the citizen's inventory is the citizen themselves.
    if not update_resource_count(
        tables,
        asset_id=citizen_username, # Asset is the citizen username
        asset_type='citizen',
        owner_username=citizen_username, # Citizen owns the fish they catch
        resource_type_id=FISH_RESOURCE_ID,
        amount_change=FISH_CAUGHT_AMOUNT,
        resource_defs=resource_defs,
        now_iso=now_iso_venice
    ):
        log.error(f"Failed to add {FISH_CAUGHT_AMOUNT} {FISH_RESOURCE_ID} to {citizen_username}'s inventory for activity {activity_guid}.")
        # Continue to update AteAt and position, as they might have "eaten" on the spot conceptually
        # or the failure was minor. If this is critical, return False here.
    else:
        log.info(f"{LogColors.OKGREEN}Added {FISH_CAUGHT_AMOUNT} {FISH_RESOURCE_ID} to {citizen_username}'s inventory.{LogColors.ENDC}")

    # 2. Update AteAt timestamp
    try:
        tables['citizens'].update(citizen_record['id'], {'AteAt': now_iso_venice})
        log.info(f"{LogColors.OKGREEN}Updated AteAt for {citizen_username} to {now_iso_venice}.{LogColors.ENDC}")
    except Exception as e_ate_at:
        log.error(f"Error updating AteAt for {citizen_username} after fishing: {e_ate_at}")
        # This is not critical enough to fail the whole activity processing.

    # 3. Update citizen's position to the fishing spot
    # The main processActivities loop usually handles this if ToBuilding is a valid building.
    # Since ToBuilding here is a waterPoint ID, we need to handle it.
    # The path's end coordinate is the most reliable.
    path_json_str = activity_fields.get('Path')
    if path_json_str:
        try:
            path_points = json.loads(path_json_str)
            if path_points and isinstance(path_points, list):
                fishing_spot_coords = path_points[-1] # Last point in the path
                if isinstance(fishing_spot_coords, dict) and 'lat' in fishing_spot_coords and 'lng' in fishing_spot_coords:
                    new_position_str = json.dumps({"lat": float(fishing_spot_coords['lat']), "lng": float(fishing_spot_coords['lng'])})
                    try:
                        tables['citizens'].update(citizen_record['id'], {'Position': new_position_str})
                        log.info(f"{LogColors.OKGREEN}Updated position for {citizen_username} to fishing spot: {new_position_str}.{LogColors.ENDC}")
                    except Exception as e_pos:
                        log.error(f"Error updating position for {citizen_username} after fishing: {e_pos}")
                else:
                    log.warning(f"Last path point for activity {activity_guid} is not valid coordinates: {fishing_spot_coords}")
            else:
                log.warning(f"Path for activity {activity_guid} is empty or not a list.")
        except json.JSONDecodeError:
            log.warning(f"Could not parse Path JSON for activity {activity_guid}: {path_json_str}")
    else:
        log.warning(f"No Path found for activity {activity_guid}. Cannot update citizen position to fishing spot.")

    # Note: This processor only handles the current activity and does not create follow-up activities.
    # Any subsequent activities should be created by activity creators, not processors.
    return True
