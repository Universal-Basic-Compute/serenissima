import logging
from typing import Dict, List, Any, Optional
import json
import uuid
from datetime import timedelta

from backend.engine.utils.activity_helpers import (
    LogColors, find_path_between_buildings_or_coords, 
    get_closest_building_of_type, get_contract_record,
    get_building_record, _get_building_position_coords # Added _get_building_position_coords
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_record: Dict[str, Any], 
    activity_type: str, 
    activity_parameters: Dict[str, Any],
    now_venice_dt: Any, # datetime
    now_utc_dt: Any, # datetime
    transport_api_url: str,
    api_base_url: str
) -> List[Dict[str, Any]]:
    """
    Creates activities for a citizen (building owner) to respond to a building bid.
    This involves travel to an official location and then finalizing the response.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    
    building_bid_contract_id = activity_parameters.get('buildingBidContractId')
    response_action = activity_parameters.get('response') # "accepted" or "refused"
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')

    if not building_bid_contract_id or not response_action:
        log.error(f"{LogColors.FAIL}Missing buildingBidContractId or response for respond_to_building_bid for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []
    
    if response_action not in ["accepted", "refused"]:
        log.error(f"{LogColors.FAIL}Invalid response action '{response_action}' for respond_to_building_bid. Must be 'accepted' or 'refused'. Citizen: {citizen_username}.{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'respond_to_building_bid' activity chain for {citizen_username} for contract {building_bid_contract_id}, response: {response_action}.{LogColors.ENDC}")

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
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location for 'respond_to_building_bid'.{LogColors.ENDC}")
        return []

    # 2. Verify the contract and that the citizen is the seller
    bid_contract_record = get_contract_record(tables, building_bid_contract_id)
    if not bid_contract_record:
        log.error(f"{LogColors.FAIL}Building bid contract {building_bid_contract_id} not found.{LogColors.ENDC}")
        return []
    
    contract_seller_username = bid_contract_record['fields'].get('Seller')
    if contract_seller_username != citizen_username:
        log.error(f"{LogColors.FAIL}Citizen {citizen_username} is not the seller ({contract_seller_username}) of building bid {building_bid_contract_id}. Cannot respond.{LogColors.ENDC}")
        return []

    # 3. Determine the target office building
    target_office_record = None
    target_office_building_id = None
    preferred_office_types = ["courthouse", "notary_office", "town_hall"]

    if user_specified_target_office_id:
        target_office_record = get_building_record(tables, user_specified_target_office_id)
        if target_office_record: target_office_building_id = target_office_record['fields'].get('BuildingId')
        else: log.warning(f"{LogColors.WARNING}User-specified target office {user_specified_target_office_id} not found.{LogColors.ENDC}")

    if not target_office_record:
        for office_type in preferred_office_types:
            # Use start_coords_for_distance_calc for reference_position
            found_office = get_closest_building_of_type(tables, start_coords_for_distance_calc, office_type)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id} for responding to bid.{LogColors.ENDC}")
                break
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office found for {citizen_username} to respond to building bid.{LogColors.ENDC}")
            return []

    # 4. Create goto_location activity
    # Use the newer signature: (start_location, end_location, api_base_url, transport_api_url_override=None)
    path_data = find_path_between_buildings_or_coords(
        start_location_for_pathfinding, 
        target_office_record, 
        api_base_url, 
        transport_api_url
    )
    current_end_time_utc = now_utc_dt

    if path_data and path_data.get("path"):
        path_json = json.dumps(path_data["path"])
        travel_duration_minutes = path_data.get("duration_minutes", 30)
        
        goto_activity_id = str(uuid.uuid4())
        goto_start_time_utc = now_utc_dt
        goto_end_time_utc = goto_start_time_utc + timedelta(minutes=travel_duration_minutes)
        current_end_time_utc = goto_end_time_utc

        goto_activity = {
            "ActivityId": goto_activity_id, "Citizen": citizen_username, "Type": "goto_location", "Status": "created",
            "StartDate": goto_start_time_utc.isoformat(), "EndDate": goto_end_time_utc.isoformat(),
            "ToBuilding": target_office_building_id, "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Title": f"Travel to {target_office_record['fields'].get('Name', target_office_building_id)}",
            "Description": f"{citizen_username} is traveling to respond to bid {building_bid_contract_id}.",
            "Thought": f"I must go to the {target_office_record['fields'].get('Type', 'office')} to respond to the offer on my building.",
            "CreatedAt": now_utc_dt.isoformat() # Removed UpdatedAt
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}. Finalize activity will start immediately.{LogColors.ENDC}")

    # 5. Create execute_respond_to_building_bid activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 15 
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    finalize_activity_details = json.dumps({
        "buildingBidContractId": building_bid_contract_id,
        "response": response_action,
        "sellerUsername": citizen_username 
    })

    finalize_activity = {
        "ActivityId": finalize_activity_id, "Citizen": citizen_username, "Type": "execute_respond_to_building_bid", "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(), "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id, 
        "Notes": finalize_activity_details,
        "Title": f"Respond to Building Bid {building_bid_contract_id}",
        "Description": f"{citizen_username} is finalizing response ({response_action}) to bid {building_bid_contract_id}.",
        "Thought": f"Time to make my decision on this building offer: {response_action}.",
        "CreatedAt": now_utc_dt.isoformat() # Removed UpdatedAt
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created execute_respond_to_building_bid activity {finalize_activity_id} for {citizen_username}. Starts at {finalize_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
