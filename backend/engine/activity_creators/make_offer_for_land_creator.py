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
    LogColors,
    get_building_record,
    find_path_between_buildings_or_coords,
    get_closest_building_of_type,
    VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

def try_create(tables: dict, citizen_record: dict, activity_type: str, activity_parameters: dict,
               now_venice_dt, now_utc_dt, transport_api_url: str, api_base_url: str) -> list:
    """
    Creates activities for a citizen to make an offer for land.
    Involves going to an office and then finalizing the offer.
    """
    activities_created = []
    citizen_username = citizen_record['fields'].get('Username')
    citizen_id = citizen_record['id']

    land_id = activity_parameters.get('landId')
    offer_price = activity_parameters.get('offerPrice')
    # seller_username is optional; if provided, it's an offer to a specific owner.
    # If not, it could be a speculative offer or an offer for unowned land (though buy_available_land is better for that).
    target_seller_username = activity_parameters.get('sellerUsername') 
    user_specified_target_office_id = activity_parameters.get('targetOfficeBuildingId')

    if not land_id or offer_price is None:
        log.error(f"{LogColors.FAIL}Missing landId or offerPrice for make_offer_for_land for citizen {citizen_username}. Params: {activity_parameters}{LogColors.ENDC}")
        return []

    log.info(f"{LogColors.ACTIVITY}Attempting to create 'make_offer_for_land' activity chain for {citizen_username} for land {land_id} at price {offer_price}. Target seller: {target_seller_username or 'N/A'}.{LogColors.ENDC}")

    # 1. Determine citizen's current location
    citizen_position_str = citizen_record['fields'].get('Position')
    from_location_data = None
    if citizen_position_str:
        try:
            pos_data = json.loads(citizen_position_str)
            if 'lat' in pos_data and 'lng' in pos_data:
                from_location_data = {"lat": pos_data['lat'], "lng": pos_data['lng']}
            elif 'building_id' in pos_data:
                 from_location_data = {"building_id": pos_data['building_id']}
        except json.JSONDecodeError:
            if isinstance(citizen_position_str, str) and citizen_position_str.startswith("bld_"):
                from_location_data = {"building_id": citizen_position_str}
            else:
                log.warning(f"{LogColors.WARNING}Could not parse citizen {citizen_username} position: {citizen_position_str}.{LogColors.ENDC}")
    
    if not from_location_data:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no valid current location. Cannot create goto_location activity.{LogColors.ENDC}")
        return []

    # 2. Determine the target office building
    target_office_record = None
    target_office_building_id = None
    preferred_office_types = ["town_hall", "public_archives", "notary_office"]

    if user_specified_target_office_id:
        target_office_record = get_building_record(tables, user_specified_target_office_id)
        if target_office_record:
            target_office_building_id = target_office_record['fields'].get('BuildingId')
            log.info(f"{LogColors.ACTIVITY}Using user-specified target office: {target_office_building_id}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}User-specified target office {user_specified_target_office_id} not found. Proceeding to fallback search.{LogColors.ENDC}")

    if not target_office_record:
        log.info(f"{LogColors.ACTIVITY}Searching for closest appropriate office from types: {preferred_office_types}.{LogColors.ENDC}")
        for office_type in preferred_office_types:
            found_office = get_closest_building_of_type(tables, from_location_data, office_type, transport_api_url)
            if found_office:
                target_office_record = found_office
                target_office_building_id = target_office_record['fields'].get('BuildingId')
                log.info(f"{LogColors.ACTIVITY}Found closest '{office_type}': {target_office_building_id}. Using as target office.{LogColors.ENDC}")
                break
        
        if not target_office_record:
            log.error(f"{LogColors.FAIL}No suitable office found for make_offer_for_land for citizen {citizen_username}.{LogColors.ENDC}")
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
            "ActivityId": goto_activity_id, "Citizen": citizen_id, "Type": "goto_location", "Status": "created",
            "StartDate": goto_start_time_utc.isoformat(), "EndDate": goto_end_time_utc.isoformat(),
            "ToBuilding": target_office_building_id, "Path": path_json,
            "TransportMode": path_data.get("transport_mode", "walk"),
            "Title": f"Travel to {target_office_record['fields'].get('Name', target_office_building_id)}",
            "Description": f"{citizen_username} is traveling to {target_office_record['fields'].get('Name', target_office_building_id)} to make an offer for land {land_id}.",
            "Thought": f"I need to go to the {target_office_record['fields'].get('Type', 'office')} to make my offer for land {land_id}.",
            "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
        }
        activities_created.append(goto_activity)
        log.info(f"{LogColors.ACTIVITY}Created goto_location activity {goto_activity_id} for {citizen_username} to {target_office_building_id}. Duration: {travel_duration_minutes} mins.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}No path found for {citizen_username} to {target_office_building_id}. Creating finalize activity directly at current time.{LogColors.ENDC}")

    # 4. Create finalize_make_offer_for_land activity
    finalize_activity_id = str(uuid.uuid4())
    finalize_duration_minutes = 10 # Example duration
    finalize_start_time_utc = current_end_time_utc
    finalize_end_time_utc = finalize_start_time_utc + timedelta(minutes=finalize_duration_minutes)

    finalize_activity_details = {
        "landId": land_id,
        "offerPrice": offer_price,
        "buyerUsername": citizen_username # The one making the offer
    }
    if target_seller_username: # Only include if specified
        finalize_activity_details["targetSellerUsername"] = target_seller_username

    finalize_activity = {
        "ActivityId": finalize_activity_id, "Citizen": citizen_id, "Type": "finalize_make_offer_for_land", "Status": "created",
        "StartDate": finalize_start_time_utc.isoformat(), "EndDate": finalize_end_time_utc.isoformat(),
        "FromBuilding": target_office_building_id, 
        "Details": json.dumps(finalize_activity_details),
        "Title": f"Make Offer for Land {land_id}",
        "Description": f"{citizen_username} is finalizing an offer of {offer_price} ducats for land {land_id} at {target_office_record['fields'].get('Name', target_office_building_id)}.",
        "Thought": f"I hope my offer of {offer_price} ducats for land {land_id} is considered.",
        "CreatedAt": now_utc_dt.isoformat(), "UpdatedAt": now_utc_dt.isoformat()
    }
    activities_created.append(finalize_activity)
    log.info(f"{LogColors.ACTIVITY}Created finalize_make_offer_for_land activity {finalize_activity_id} for {citizen_username}. Starts at {finalize_start_time_utc.isoformat()}.{LogColors.ENDC}")

    return activities_created
