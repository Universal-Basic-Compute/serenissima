import logging
from typing import Dict, List, Any, Optional

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_record: Dict[str, Any], 
    activity_type: str, 
    activity_parameters: Dict[str, Any],
    resource_defs: Dict, # Added based on similar contract creators
    building_type_defs: Dict, # Added based on similar contract creators
    now_venice_dt: Any, # datetime
    now_utc_dt: Any, # datetime
    transport_api_url: str,
    api_base_url: str
) -> List[Dict[str, Any]]:
    """
    Creates activities for a citizen to create or update a markup buy contract.
    This involves travel to a market, then creating/updating the contract.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    
    contract_id_to_update = activity_parameters.get('contractId') # Optional: for updating existing contract
    resource_type = activity_parameters.get('resourceType')
    target_amount = activity_parameters.get('targetAmount')
    max_price_per_resource = activity_parameters.get('maxPricePerResource')
    buyer_building_id = activity_parameters.get('buyerBuildingId') # Where the goods should be delivered
    user_specified_market_id = activity_parameters.get('targetMarketBuildingId')

    if not resource_type or target_amount is None or max_price_per_resource is None or not buyer_building_id:
        log.error(f"{LogColors.FAIL}Missing required parameters for manage_markup_buy_contract for {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'manage_markup_buy_contract' chain for {citizen_username} for {resource_type}.{LogColors.ENDC}")

    # Imports
    import json
    import uuid
    from datetime import timedelta
    from backend.engine.utils.activity_helpers import (
        LogColors, find_path_between_buildings_or_coords, 
        get_closest_building_of_type, get_building_record
    )

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
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location for manage_markup_buy_contract.{LogColors.ENDC}")
        return []

    # 2. Determine the target market building
    target_market_record = None
    target_market_building_id = None
    # Define preferred market types, e.g., 'market_stall', 'merceria', 'weighing_station'
    preferred_market_types = ["market_stall", "merceria", "weighing_station", "customs_house"] 

    if user_specified_market_id:
        target_market_record = get_building_record(tables, user_specified_market_id)
        if target_market_record: target_market_building_id = target_market_record['fields'].get('BuildingId')
        else: log.warning(f"{LogColors.WARNING}User-specified target market {user_specified_market_id} not found.{LogColors.ENDC}")

    if not target_market_record:
        for market_type in preferred_market_types:
            found_market = get_closest_building_of_type(tables, from_location_data, market_type, transport_api_url)
            if found_market:
                target_market_record = found_market
                target_market_building_id = target_market_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{market_type}': {target_market_building_id} for markup buy contract.{LogColors.ENDC}")
                break
        if not target_market_record:
            log.error(f"{LogColors.FAIL}No suitable market found for {citizen_username} to manage markup buy contract.{LogColors.ENDC}")
            return []

    # 3. Create goto_location activity
    path_data = find_path_between_buildings_or_coords(tables, from_location_data, {"building_id": target_market_building_id}, transport_api_url)
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
            "ToBuilding": target_market_building_id, "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Title": f"Travel to {target_market_record['fields'].get('Name', target_market_building_id)}",
            "Description": f"{citizen_username} is traveling to manage a markup buy contract.",
            "Thought": f"I need to visit the market at {target_market_record['fields'].get('Name', target_market_building_id)} to place my buy order.",
            "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_market_building_id}. Finalize activity will start immediately.{LogColors.ENDC}")

    # 4. Create finalize_manage_markup_buy_contract activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 15 
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    finalize_activity_details = {
        "resourceType": resource_type,
        "targetAmount": target_amount,
        "maxPricePerResource": max_price_per_resource,
        "buyerBuildingId": buyer_building_id,
        "buyerUsername": citizen_username
    }
    if contract_id_to_update:
        finalize_activity_details["contractIdToUpdate"] = contract_id_to_update

    finalize_activity = {
        "ActivityId": finalize_activity_id, "Citizen": citizen_username, "Type": "finalize_manage_markup_buy_contract", "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(), "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_market_building_id, 
        "Notes": json.dumps(finalize_activity_details),
        "Title": f"Manage Markup Buy Contract for {resource_type}",
        "Description": f"{citizen_username} is finalizing a markup buy contract for {target_amount} of {resource_type} at a max price of {max_price_per_resource} each.",
        "Thought": "Let's make this buy order official.",
        "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created finalize_manage_markup_buy_contract activity {finalize_activity_id} for {citizen_username}.{LogColors.ENDC}")

    return activities_created
