import os
import sys
import logging
import json
from datetime import timedelta
import uuid

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import (
    LogColors,
    get_building_record,
    find_path_between_buildings_or_coords, # Use the more flexible pathfinder
    get_closest_building_of_type,
    VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

def try_create(tables: dict, citizen_record: dict, activity_type: str, activity_parameters: dict, 
               now_venice_dt, now_utc_dt, transport_api_url: str, api_base_url: str) -> list:
    """
    Creates activities for a citizen to list land for sale.
    This involves:
    1. Going to a target office building (e.g., town_hall).
    2. Finalizing the land listing.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    citizen_id = citizen_record['id']

    land_id = activity_parameters.get('landId')
    price = activity_parameters.get('price')
    # sellerUsername is implicitly citizen_username for this activity type
    target_office_building_id = activity_parameters.get('targetOfficeBuildingId', 'town_hall_default') # Default to a known Town Hall ID

    if not land_id or price is None:
        log.error(f"{LogColors.FAIL}Missing landId or price for list_land_for_sale for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'list_land_for_sale' activity chain for {citizen_username} for land {land_id} at price {price}.{LogColors.ENDC}")

    # 1. Determine citizen's current location (building or coordinates)
    citizen_position_str = citizen_record['fields'].get('Position')
    from_location_data = None
    if citizen_position_str:
        try:
            pos_data = json.loads(citizen_position_str)
            if 'lat' in pos_data and 'lng' in pos_data:
                from_location_data = {"lat": pos_data['lat'], "lng": pos_data['lng']}
            elif 'building_id' in pos_data: # Assuming Position might store current building_id
                 from_location_data = {"building_id": pos_data['building_id']}
        except json.JSONDecodeError:
            # Check if Position is a direct building_id string
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"): # Example check
                from_location_data = {"building_id": citizen_position_str}
            else:
                log.warning(f"{LogColors.WARNING}Could not parse citizen {citizen_username} position: {citizen_position_str}. Pathfinding might be impaired.{LogColors.ENDC}")
    
    if not from_location_data: # Fallback if position is unknown or unparsable
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location. Cannot create goto_location activity.{LogColors.ENDC}")
        # Potentially create the finalize_list_land_for_sale activity directly if no travel is strictly needed by game logic
        # For now, we'll assume travel is part of the process.
        return []


    # 2. Find path to the target office building
    # Ensure target_office_building_id is a valid building that exists
    target_office_record = get_building_record(tables, target_office_building_id)
    if not target_office_record:
        log.error(f"{LogColors.FAIL}Target office building {target_office_building_id} not found for list_land_for_sale.{LogColors.ENDC}")
        # Fallback: try to find any town_hall
        target_office_record = get_closest_building_of_type(tables, from_location_data, "town_hall", transport_api_url)
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No town_hall found as fallback for list_land_for_sale.{LogColors.ENDC}")
            return []
        target_office_building_id = target_office_record['fields'].get('BuildingId')
        log.info(f"{LogColors.ACTIVITY}Using fallback target office: {target_office_building_id}{LogColors.ENDC}")


    path_data = find_path_between_buildings_or_coords(
        tables, 
        from_location_data, # Can be {"building_id": "bld_xxx"} or {"lat": y, "lng": x}
        {"building_id": target_office_building_id}, # Target is always a building
        transport_api_url
    )

    if not path_data or not path_data.get("path"):
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}. Creating finalize activity directly at current time.{LogColors.ENDC}")
        # If no path, create the finalize_list_land_for_sale activity to start immediately
        # This assumes the citizen can somehow perform the action without travel if pathing fails.
        # Or, one might choose to fail the entire chain here.
        # For now, let's proceed with immediate finalize.
        current_end_time_utc = now_utc_dt
        path_json = None
        travel_duration_minutes = 0
    else:
        path_json = json.dumps(path_data["path"])
        travel_duration_minutes = path_data["duration_minutes"]
        
        goto_activity_id = str(uuid.uuid4())
        goto_start_time_utc = now_utc_dt
        goto_end_time_utc = goto_start_time_utc + timedelta(minutes=travel_duration_minutes)
        current_end_time_utc = goto_end_time_utc # For the next activity in chain

        goto_activity = {
            "ActivityId": goto_activity_id,
            "Citizen": citizen_id, # Link to citizen record ID
            "Type": "goto_location",
            "Status": "created",
            "StartDate": goto_start_time_utc.isoformat(),
            "EndDate": goto_end_time_utc.isoformat(),
            "ToBuilding": target_office_building_id, # Custom BuildingId
            "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Title": f"Travel to {target_office_record['fields'].get('Name', target_office_building_id)}",
            "Description": f"{citizen_username} is traveling to {target_office_record['fields'].get('Name', target_office_building_id)} to list land for sale.",
            "Thought": f"I need to go to the {target_office_record['fields'].get('Type', 'office')} to list my land {land_id} for sale.",
            "CreatedAt": now_utc_dt.isoformat(),
            "UpdatedAt": now_utc_dt.isoformat()
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username} to {target_office_building_id}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")


    # 3. Create finalize_list_land_for_sale activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 15 # Example duration for paperwork
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    finalize_activity_details = json.dumps({
        "landId": land_id,
        "price": price,
        "sellerUsername": citizen_username # Redundant but good for processor clarity
    })

    finalize_activity = {
        "ActivityId": finalize_activity_id,
        "Citizen": citizen_id, # Link to citizen record ID
        "Type": "finalize_list_land_for_sale",
        "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(),
        "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id, # Location where this activity occurs
        "Details": finalize_activity_details,
        "Title": f"List Land {land_id} for Sale",
        "Description": f"{citizen_username} is finalizing the listing of land {land_id} for {price} ducats at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": f"Time to make it official. I hope someone buys my land {land_id} soon for {price} ducats.",
        "CreatedAt": now_utc_dt.isoformat(), # All activities in chain created at same time
        "UpdatedAt": now_utc_dt.isoformat()
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created finalize_list_land_for_sale activity {finalize_activity_id} for {citizen_username}. Starts at {finalize_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
