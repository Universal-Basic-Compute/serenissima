import os
import sys
import logging
import json
from datetime import timedelta
import uuid
from typing import Dict, Any, Optional # Added import

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import (
    LogColors, get_building_record, find_path_between_buildings_or_coords,
    get_closest_building_of_type, VENICE_TIMEZONE, get_contract_record,
    _get_building_position_coords # Added import
)

log = logging.getLogger(__name__)

def try_create(tables: dict, citizen_record: dict, activity_type: str, activity_parameters: dict,
               now_venice_dt, now_utc_dt, transport_api_url: str, api_base_url: str) -> list:
    """
    Creates activities for a citizen to buy a listed land.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username') # This is the buyer
    citizen_id = citizen_record['id']

    listing_contract_id = activity_parameters.get('contractId') # Custom ContractId of the land_listing
    land_id = activity_parameters.get('landId')
    price = activity_parameters.get('price') # Price from the listing
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')

    if not listing_contract_id or not land_id or price is None:
        log.error(f"{LogColors.FAIL}Missing contractId, landId, or price for buy_listed_land for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    # Verify the listing contract exists and is active
    listing_contract_record = get_contract_record(tables, listing_contract_id)
    if not listing_contract_record or listing_contract_record['fields'].get('Type') != 'land_listing' or listing_contract_record['fields'].get('Status') != 'active':
        log.error(f"{LogColors.FAIL}Listing contract {listing_contract_id} not found, not a land_listing, or not active. Cannot buy. Activity for {citizen_username}.{LogColors.ENDC}")
        return []
    
    # Verify price matches
    listing_price = listing_contract_record['fields'].get('PricePerResource')
    if float(listing_price) != float(price):
        log.error(f"{LogColors.FAIL}Price mismatch for listing {listing_contract_id}. UI price: {price}, Contract price: {listing_price}. Cannot buy. Activity for {citizen_username}.{LogColors.ENDC}")
        return []


    log.info(f"{LogColors.ACTIVITY}Attempting to create 'buy_listed_land' activity chain for {citizen_username} for listing {listing_contract_id} on land {land_id} at price {price}.{LogColors.ENDC}")

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
                building_record_from_pos = get_building_record(tables, building_id_from_pos) # Renamed to avoid conflict
                if building_record_from_pos:
                    start_location_for_pathfinding = building_record_from_pos
                    start_coords_for_distance_calc = _get_building_position_coords(building_record_from_pos)
                else:
                    log.warning(f"{LogColors.WARNING}Could not find building record for ID '{building_id_from_pos}' from citizen {citizen_username} position.{LogColors.ENDC}")
        except json.JSONDecodeError:
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"):
                building_record_from_str = get_building_record(tables, citizen_position_str) # Renamed to avoid conflict
                if building_record_from_str:
                    start_location_for_pathfinding = building_record_from_str
                    start_coords_for_distance_calc = _get_building_position_coords(building_record_from_str)
                else:
                    log.warning(f"{LogColors.WARNING}Could not find building record for ID '{citizen_position_str}' from citizen {citizen_username} position string.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Could not parse citizen {citizen_username} position: {citizen_position_str}.{LogColors.ENDC}")
    
    if not start_location_for_pathfinding or not start_coords_for_distance_calc:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location for 'buy_listed_land'.{LogColors.ENDC}")
        return []

    # 2. Determine the target office building
    target_office_record = None
    target_office_building_id = None
    preferred_office_types = ["town_hall", "public_archives", "notary_office"]

    if user_specified_target_office_id:
        target_office_record = get_building_record(tables, user_specified_target_office_id)
        if target_office_record: target_office_building_id = target_office_record['fields'].get('BuildingId')
        else: log.warning(f"{LogColors.WARNING}User-specified target office {user_specified_target_office_id} not found.{LogColors.ENDC}")

    if not target_office_record:
        for office_type in preferred_office_types:
            # Use start_coords_for_distance_calc for reference_position
            # Remove transport_api_url which was incorrectly passed as max_distance_meters
            found_office = get_closest_building_of_type(tables, start_coords_for_distance_calc, office_type)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id}.{LogColors.ENDC}")
                break
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office found for {citizen_username}.{LogColors.ENDC}")
            return []

    # 3. Find path to the target office building
    # Use the newer signature: (start_location, end_location, api_base_url, transport_api_url_override=None)
    # start_location_for_pathfinding can be coords or a building record.
    # target_office_record is a full building record.
    path_data = find_path_between_buildings_or_coords(start_location_for_pathfinding, target_office_record, api_base_url, transport_api_url)
    current_end_time_utc = now_utc_dt

    if path_data and path_data.get("path"):
        path_json = json.dumps(path_data["path"])
        travel_duration_minutes = path_data["duration_minutes"]
        goto_activity_id = str(uuid.uuid4())
        goto_start_time_utc = now_utc_dt
        goto_end_time_utc = goto_start_time_utc + timedelta(minutes=travel_duration_minutes)
        current_end_time_utc = goto_end_time_utc
        goto_activity = {
            "ActivityId": goto_activity_id, "Citizen": citizen_username, "Type": "goto_location", "Status": "created", # Use username
            "StartDate": goto_start_time_utc.isoformat(), "EndDate": goto_end_time_utc.isoformat(),
            "ToBuilding": target_office_building_id, "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Title": f"Travel to {target_office_record['fields'].get('Name', target_office_building_id)}",
            "Description": f"{citizen_username} is traveling to {target_office_record['fields'].get('Name', target_office_building_id)} to buy listed land {land_id}.",
            "Thought": f"I need to go to the {target_office_record['fields'].get('Type', 'office')} to purchase the land {land_id}.",
            "CreatedAt": now_utc_dt.isoformat() # Removed UpdatedAt
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}.{LogColors.ENDC}")

    # 4. Create execute_buy_listed_land activity
    execute_activity_id = str(uuid.uuid4())
    execute_duration_minutes = 20 # Example duration
    execute_start_time_utc = current_end_time_utc
    execute_end_time_utc = execute_start_time_utc + timedelta(minutes=execute_duration_minutes)

    execute_activity_details = json.dumps({
        "listingContractId": listing_contract_id, # Custom ContractId of the land_listing
        "landId": land_id,
        "price": price,
        "buyerUsername": citizen_username # The one buying
    })

    execute_activity = {
        "ActivityId": execute_activity_id, "Citizen": citizen_username, "Type": "execute_buy_listed_land", "Status": "created", # Use username
        "StartDate": execute_start_time_utc.isoformat(), "EndDate": execute_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id,
        "Notes": execute_activity_details, # Changed Details to Notes
        "Title": f"Buy Listed Land {land_id}",
        "Description": f"{citizen_username} is finalizing the purchase of land {land_id} from listing {listing_contract_id} for {price} ducats at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": f"This land {land_id} is listed at a good price. Time to buy it.",
        "CreatedAt": now_utc_dt.isoformat() # Removed UpdatedAt
    }
    activities_created.append(execute_activity)
    log.info(f"{LogColors.ACTIVITY}Created execute_buy_listed_land activity {execute_activity_id} for {citizen_username}. Starts at {execute_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
