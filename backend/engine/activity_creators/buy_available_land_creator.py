import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List # Added List
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings,
    get_building_record
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_record: Dict[str, Any], 
    activity_type: str, # Added
    activity_parameters: Dict[str, Any], # Renamed from details
    now_venice_dt: Any, # datetime, Added
    now_utc_dt: Any, # datetime, Added
    transport_api_url: str, # Added
    api_base_url: str # Added
) -> List[Dict[str, Any]]: # Return type changed to list of activity dicts
    """
    Creates a chain of activities for a citizen to buy available land:
    1. A goto_location activity for travel to the official location (e.g., town_hall).
    2. A finalize_land_purchase activity that will execute after arrival.
    Returns a list of activity dictionaries to be created by the caller.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    
    land_id = activity_parameters.get('landId')
    expected_price = activity_parameters.get('expectedPrice')
    # from_building_id = activity_parameters.get('fromBuildingId') # Optional, current location used if None
    target_office_building_id = activity_parameters.get('targetBuildingId') # e.g., town_hall

    if not (land_id and expected_price is not None and target_office_building_id):
        log.error(f"Missing required details for buy_available_land: landId, expectedPrice, or targetBuildingId. Params: {activity_parameters}")
        return []

    log.info(f"Attempting to create 'buy_available_land' activity chain for {citizen_username} for land {land_id} at price {expected_price}.")

    # 1. Determine citizen's current location
    citizen_position_str = citizen_record['fields'].get('Position')
    from_location_data: Optional[Dict[str, Any]] = None
    if citizen_position_str:
        try:
            pos_data = json.loads(citizen_position_str)
            if 'lat' in pos_data and 'lng' in pos_data: from_location_data = {"lat": pos_data['lat'], "lng": pos_data['lng']}
            elif 'building_id' in pos_data: from_location_data = {"building_id": pos_data['building_id']}
        except json.JSONDecodeError:
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"): from_location_data = {"building_id": citizen_position_str}
    
    if not from_location_data:
        log.warning(f"Citizen {citizen_username} has no valid current location for buy_available_land. Cannot create goto_location.")
        return [] # Or decide to create finalize_land_purchase directly if travel is optional

    # 2. Get target office building record
    target_office_record = get_building_record(tables, target_office_building_id)
    if not target_office_record:
        log.error(f"Could not find target office building record for {target_office_building_id}.")
        return []
    
    # 3. Find path to the target office building
    # The find_path_between_buildings_or_coords helper is more flexible
    from backend.engine.utils.activity_helpers import find_path_between_buildings_or_coords
    path_data = find_path_between_buildings_or_coords(tables, from_location_data, {"building_id": target_office_building_id}, transport_api_url)
    
    current_activity_end_time_utc = now_utc_dt # Start time for the first activity in chain

    # 4. Create goto_location activity if path is found
    if path_data and path_data.get("path"):
        path_json = json.dumps(path_data["path"])
        travel_duration_minutes = path_data.get("duration_minutes", 30) # Default 30 min
        
        goto_activity_id = str(uuid.uuid4())
        goto_start_time_utc = now_utc_dt # Travel starts now
        goto_end_time_utc = goto_start_time_utc + timedelta(minutes=travel_duration_minutes)
        current_activity_end_time_utc = goto_end_time_utc # Update for next activity

        goto_activity = {
            "ActivityId": goto_activity_id,
            "Type": "goto_location",
            "Citizen": citizen_username,
            "FromBuilding": from_location_data.get("building_id") if isinstance(from_location_data, dict) and "building_id" in from_location_data else None,
            "ToBuilding": target_office_building_id,
            "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Notes": json.dumps({
                "landId": land_id,
                "expectedPrice": expected_price,
                "originalActivityType": "buy_available_land",
                "nextStep": "finalize_land_purchase"
            }),
            "Status": "created",
            "Title": f"Travel to purchase land {land_id}",
            "Description": f"Traveling to {target_office_record['fields'].get('Name', target_office_building_id)} to purchase land {land_id}.",
            "Thought": f"I must go to the {target_office_record['fields'].get('Type', 'office')} to secure the land parcel {land_id}.",
            "CreatedAt": now_utc_dt.isoformat(),
            "StartDate": goto_start_time_utc.isoformat(),
            "EndDate": goto_end_time_utc.isoformat(),
            "Priority": 20 
        }
        activities_created.append(goto_activity)
        log.info(f"Created goto_location activity {goto_activity_id} for {citizen_username} to {target_office_building_id}. Duration: {travel_duration_minutes} mins.")
    else:
        log.warning(f"No path found for {citizen_username} to {target_office_building_id}. Finalize activity will start immediately.")
        # If no path, the finalize_land_purchase activity will start at now_utc_dt (current_activity_end_time_utc is still now_utc_dt)

    # 5. Create finalize_land_purchase activity
    purchase_activity_id = str(uuid.uuid4())
    purchase_duration_minutes = 15 # Example duration
    purchase_start_time_utc = current_activity_end_time_utc # Starts after travel (or immediately if no travel)
    purchase_end_time_utc = purchase_start_time_utc + timedelta(minutes=purchase_duration_minutes)

    purchase_details_json = json.dumps({
        "landId": land_id,
        "expectedPrice": expected_price,
        "buyerUsername": citizen_username # For clarity in processor
    })
    
    purchase_activity = {
        "ActivityId": purchase_activity_id,
        "Type": "finalize_land_purchase",
        "Citizen": citizen_username,
        "FromBuilding": target_office_building_id, 
        "ToBuilding": target_office_building_id,   
        "Notes": purchase_details_json,
        "Status": "created",
        "Title": f"Finalize purchase of land {land_id}",
        "Description": f"Completing the purchase of land {land_id} for {expected_price} Ducats at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": f"Now to complete the paperwork for land {land_id}.",
        "CreatedAt": now_utc_dt.isoformat(), # Created at the same time as goto
        "StartDate": purchase_start_time_utc.isoformat(),
        "EndDate": purchase_end_time_utc.isoformat(),
        "Priority": 20
    }
    activities_created.append(purchase_activity)
    log.info(f"Created finalize_land_purchase activity {purchase_activity_id} for {citizen_username}. Starts at {purchase_start_time_utc.isoformat()}.")
    
    return activities_created
