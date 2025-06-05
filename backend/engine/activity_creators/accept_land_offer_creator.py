import os
import sys
import logging
import json
from datetime import timedelta
import uuid

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import (
    LogColors, get_building_record, find_path_between_buildings_or_coords,
    get_closest_building_of_type, VENICE_TIMEZONE, get_contract_record
)

log = logging.getLogger(__name__)

def try_create(tables: dict, citizen_record: dict, activity_type: str, activity_parameters: dict,
               now_venice_dt, now_utc_dt, transport_api_url: str, api_base_url: str) -> list:
    """
    Creates activities for a citizen (land owner) to accept an offer for their land.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    citizen_id = citizen_record['id']

    offer_contract_id = activity_parameters.get('contractId') # Custom ContractId of the land_offer
    land_id = activity_parameters.get('landId') # LandId for context, though contract should have it
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')

    if not offer_contract_id or not land_id:
        log.error(f"{LogColors.FAIL}Missing contractId or landId for accept_land_offer for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    # Verify the offer contract exists and is active
    offer_contract_record = get_contract_record(tables, offer_contract_id)
    if not offer_contract_record or offer_contract_record['fields'].get('Type') != 'land_offer' or offer_contract_record['fields'].get('Status') != 'active':
        log.error(f"{LogColors.FAIL}Offer contract {offer_contract_id} not found, not a land_offer, or not active. Cannot accept. Activity for {citizen_username}.{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'accept_land_offer' activity chain for {citizen_username} for offer {offer_contract_id} on land {land_id}.{LogColors.ENDC}")

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
            else: log.warning(f"{LogColors.WARNING}Could not parse citizen {citizen_username} position: {citizen_position_str}.{LogColors.ENDC}")
    
    if not from_location_data:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location.{LogColors.ENDC}")
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
            found_office = get_closest_building_of_type(tables, from_location_data, office_type, transport_api_url)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id}.{LogColors.ENDC}")
                break
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office found for {citizen_username}.{LogColors.ENDC}")
            return []

    # 3. Find path to the target office building
    path_data = find_path_between_buildings_or_coords(tables, from_location_data, {"building_id": target_office_building_id}, transport_api_url)
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
            "Description": f"{citizen_username} is traveling to {target_office_record['fields'].get('Name', target_office_building_id)} to accept an offer for land {land_id}.",
            "Thought": f"I need to go to the {target_office_record['fields'].get('Type', 'office')} to accept the offer for my land {land_id}.",
            "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}.{LogColors.ENDC}")

    # 4. Create execute_accept_land_offer activity
    execute_activity_id = str(uuid.uuid4())
    execute_duration_minutes = 20 # Example duration for paperwork
    execute_start_time_utc = current_end_time_utc
    execute_end_time_utc = execute_start_time_utc + timedelta(minutes=execute_duration_minutes)

    execute_activity_details = json.dumps({
        "offerContractId": offer_contract_id, # Custom ContractId of the land_offer
        "landId": land_id,
        "sellerUsername": citizen_username # The one accepting the offer (current owner)
    })

    execute_activity = {
        "ActivityId": execute_activity_id, "Citizen": citizen_username, "Type": "execute_accept_land_offer", "Status": "created", # Use username
        "StartDate": execute_start_time_utc.isoformat(), "EndDate": execute_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id,
        "Notes": execute_activity_details, # Changed Details to Notes
        "Title": f"Accept Offer for Land {land_id}",
        "Description": f"{citizen_username} is finalizing the acceptance of offer {offer_contract_id} for land {land_id} at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": f"This offer for my land {land_id} seems good. Time to sell.",
        "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
    }
    activities_created.append(execute_activity)
    log.info(f"{LogColors.ACTIVITY}Created execute_accept_land_offer activity {execute_activity_id} for {citizen_username}. Starts at {execute_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
