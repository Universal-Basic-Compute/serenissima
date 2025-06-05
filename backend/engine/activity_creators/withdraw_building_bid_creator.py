import logging
from typing import Dict, List, Any, Optional
import json
import uuid
from datetime import timedelta

from backend.engine.utils.activity_helpers import (
    LogColors, find_path_between_buildings_or_coords, 
    get_closest_building_of_type, get_contract_record,
    get_building_record
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
    Creates activities for a citizen to withdraw their building bid.
    This involves travel to an official location and then finalizing the withdrawal.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username') # This is the bidder
    
    building_bid_contract_id = activity_parameters.get('buildingBidContractId')
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')

    if not building_bid_contract_id:
        log.error(f"{LogColors.FAIL}Missing buildingBidContractId for withdraw_building_bid for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'withdraw_building_bid' activity chain for {citizen_username} for contract {building_bid_contract_id}.{LogColors.ENDC}")

    # Imports moved to module level.

    # 1. Determine citizen's current location
    citizen_position_str = citizen_record['fields'].get('Position')
    from_location_data = None
    if citizen_position_str:
        try:
            pos_data = json.loads(citizen_position_str)
            if 'lat' in pos_data and 'lng' in pos_data: from_location_data = {"lat": pos_data['lat'], "lng": pos_data['lng']}
            elif 'building_id' in pos_data: from_location_data = {"building_id": pos_data['building_id']}
        except json.JSONDecodeError:
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"): from_location_data = {"building_id": citizen_position_str}
    
    if not from_location_data:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location for withdraw_building_bid.{LogColors.ENDC}")
        return []

    # 2. Verify the contract and that the citizen is the buyer (bidder)
    bid_contract_record = get_contract_record(tables, building_bid_contract_id)
    if not bid_contract_record:
        log.error(f"{LogColors.FAIL}Building bid contract {building_bid_contract_id} not found.{LogColors.ENDC}")
        return []
    
    contract_buyer_username = bid_contract_record['fields'].get('Buyer')
    if contract_buyer_username != citizen_username:
        log.error(f"{LogColors.FAIL}Citizen {citizen_username} is not the buyer/bidder ({contract_buyer_username}) of building bid {building_bid_contract_id}. Cannot withdraw.{LogColors.ENDC}")
        return []
    
    if bid_contract_record['fields'].get('Status') != 'active':
        log.warning(f"{LogColors.WARNING}Building bid contract {building_bid_contract_id} is not 'active' (Status: {bid_contract_record['fields'].get('Status')}). Cannot withdraw.{LogColors.ENDC}")
        return [] # Or allow withdrawal of pending_acceptance bids? For now, only active.

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
            found_office = get_closest_building_of_type(tables, from_location_data, office_type, transport_api_url)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id} for withdrawing bid.{LogColors.ENDC}")
                break
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office found for {citizen_username} to withdraw building bid.{LogColors.ENDC}")
            return []

    # 4. Create goto_location activity
    path_data = find_path_between_buildings_or_coords(tables, from_location_data, {"building_id": target_office_building_id}, transport_api_url)
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
            "Description": f"{citizen_username} is traveling to withdraw bid {building_bid_contract_id}.",
            "Thought": f"I must go to the {target_office_record['fields'].get('Type', 'office')} to withdraw my offer.",
            "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}. Finalize activity will start immediately.{LogColors.ENDC}")

    # 5. Create execute_withdraw_building_bid activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 10 
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    finalize_activity_details = json.dumps({
        "buildingBidContractId": building_bid_contract_id,
        "bidderUsername": citizen_username 
    })

    finalize_activity = {
        "ActivityId": finalize_activity_id, "Citizen": citizen_username, "Type": "execute_withdraw_building_bid", "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(), "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id, 
        "Notes": finalize_activity_details,
        "Title": f"Withdraw Building Bid {building_bid_contract_id}",
        "Description": f"{citizen_username} is finalizing withdrawal of bid {building_bid_contract_id}.",
        "Thought": "I've reconsidered my offer for this building.",
        "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created execute_withdraw_building_bid activity {finalize_activity_id} for {citizen_username}. Starts at {finalize_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
