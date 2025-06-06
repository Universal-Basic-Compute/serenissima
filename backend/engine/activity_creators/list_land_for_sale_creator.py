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

from typing import Dict, Any, Optional # Added import

from backend.engine.utils.activity_helpers import (
    LogColors,
    get_building_record,
    find_path_between_buildings_or_coords, # Use the more flexible pathfinder
    get_closest_building_of_type,
    _get_building_position_coords, # Added import
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
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')

    if not land_id or price is None:
        log.error(f"{LogColors.FAIL}Missing landId or price for list_land_for_sale for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'list_land_for_sale' activity chain for {citizen_username} for land {land_id} at price {price}.{LogColors.ENDC}")

    # 1. Determine citizen's current location for pathfinding and distance calculations
    citizen_position_str = citizen_record['fields'].get('Position')
    start_location_for_pathfinding: Optional[Dict[str, Any]] = None # Can be coords or building_record
    start_coords_for_distance_calc: Optional[Dict[str, float]] = None # Must be coords

    if citizen_position_str:
        try:
            pos_data = json.loads(citizen_position_str)
            if 'lat' in pos_data and 'lng' in pos_data:
                start_coords_for_distance_calc = {"lat": float(pos_data['lat']), "lng": float(pos_data['lng'])}
                start_location_for_pathfinding = start_coords_for_distance_calc
            elif 'building_id' in pos_data:
                building_id_from_pos = pos_data['building_id']
                building_record_from_pos = get_building_record(tables, building_id_from_pos)
                if building_record_from_pos:
                    start_location_for_pathfinding = building_record_from_pos
                    start_coords_for_distance_calc = _get_building_position_coords(building_record_from_pos)
                else:
                    log.warning(f"{LogColors.WARNING}Could not find building record for ID '{building_id_from_pos}' from citizen {citizen_username} position.{LogColors.ENDC}")
        except json.JSONDecodeError:
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"):
                building_record_from_str = get_building_record(tables, citizen_position_str)
                if building_record_from_str:
                    start_location_for_pathfinding = building_record_from_str
                    start_coords_for_distance_calc = _get_building_position_coords(building_record_from_str)
                else:
                    log.warning(f"{LogColors.WARNING}Could not find building record for ID '{citizen_position_str}' from citizen {citizen_username} position string.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Could not parse citizen {citizen_username} position: {citizen_position_str}.{LogColors.ENDC}")
    
    if not start_location_for_pathfinding or not start_coords_for_distance_calc:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location for 'list_land_for_sale'. Cannot create activity chain.{LogColors.ENDC}")
        return []

    # 2. Determine the target office building
    target_office_record = None
    target_office_building_id = None

    if user_specified_target_office_id:
        log.info(f"{LogColors.ACTIVITY}User specified target office: {user_specified_target_office_id}. Attempting to use it.{LogColors.ENDC}")
        target_office_record = get_building_record(tables, user_specified_target_office_id)
        if target_office_record:
            target_office_building_id = target_office_record['fields'].get('BuildingId')
            log.info(f"{LogColors.ACTIVITY}Using user-specified target office: {target_office_building_id}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}User-specified target office {user_specified_target_office_id} not found. Proceeding to fallback search.{LogColors.ENDC}")

    if not target_office_record:
        # Define preferred office types for listing land, in order of preference
        preferred_office_types = ["town_hall", "public_archives"] # Example: add more types if relevant
        log.info(f"{LogColors.ACTIVITY}No valid user-specified target office. Searching for closest appropriate office from types: {preferred_office_types}.{LogColors.ENDC}")
        
        for office_type in preferred_office_types:
            log.debug(f"{LogColors.ACTIVITY}Searching for closest '{office_type}'...{LogColors.ENDC}")
            # Use start_coords_for_distance_calc for reference_position
            # Remove transport_api_url which was incorrectly passed as max_distance_meters
            found_office = get_closest_building_of_type(tables, start_coords_for_distance_calc, office_type)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id}. Using as target office.{LogColors.ENDC}")
                break # Found a suitable office
        
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office (types: {preferred_office_types}) found for list_land_for_sale for citizen {citizen_username}.{LogColors.ENDC}")
            return []

    # 3. Find path to the determined target office building
    # Use the newer signature: (start_location, end_location, api_base_url, transport_api_url_override=None)
    # start_location_for_pathfinding can be coords or a building record.
    # target_office_record is a full building record.
    path_data = find_path_between_buildings_or_coords(
        start_location_for_pathfinding, 
        target_office_record, 
        api_base_url, 
        transport_api_url
    )
    current_end_time_utc = now_utc_dt # Initialize here, will be updated if path found

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
            "Citizen": citizen_username, # Use username string
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
            "CreatedAt": now_utc_dt.isoformat() # Removed UpdatedAt
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username} to {target_office_building_id}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")


    # 4. Create finalize_list_land_for_sale activity
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
        "Citizen": citizen_username, # Use username string
        "Type": "finalize_list_land_for_sale",
        "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(),
        "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id, # Location where this activity occurs
        "Notes": finalize_activity_details, # Ensure this was already Notes, or change if it was Details
        "Title": f"List Land {land_id} for Sale",
        "Description": f"{citizen_username} is finalizing the listing of land {land_id} for {price} ducats at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": f"Time to make it official. I hope someone buys my land {land_id} soon for {price} ducats.",
        "CreatedAt": now_utc_dt.isoformat() # Removed UpdatedAt
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created finalize_list_land_for_sale activity {finalize_activity_id} for {citizen_username}. Starts at {finalize_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
