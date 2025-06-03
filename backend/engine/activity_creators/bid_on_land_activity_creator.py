import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings, # Keep this for path between determined from_building and to_building
    get_building_record,
    get_closest_building_to_position, # Import new helper
    _get_building_position_coords, # Import missing helper
    _calculate_distance_meters # Import missing helper
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any],
    api_base_url: str, # Added api_base_url
    transport_api_url: str # Added transport_api_url
) -> Optional[Dict[str, Any]]:
    """
    Create both activities in the bid_on_land chain at once:
    1. A goto_location activity for travel to the official location
    2. A submit_land_bid activity that will execute after arrival
    
    The 'fromBuildingId' is now determined based on the citizen's current position.
    The 'targetBuildingId' (official office) is determined by finding the closest town_hall or courthouse.
    The 'sellerUsername' is determined from the land's current owner.
    """
    land_id = details.get('landId')
    bid_amount = details.get('bidAmount') or details.get('offerPrice') # Accept offerPrice as an alias
    # from_building_id is determined based on citizen's current position
    # to_building_id (targetOfficeBuildingId) will be determined below
    # sellerUsername will be determined from land_id's owner
    
    if not (land_id and bid_amount):
        log.error(f"Missing required details for bid_on_land: landId or bidAmount (or offerPrice). Provided details: {details}")
        return None

    citizen_username = citizen_record['fields'].get('Username')
    if not citizen_username:
        log.error(f"Citizen record {citizen_record.get('id')} is missing Username. Cannot create bid_on_land activity.")
        return None
        
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())

    # Determine from_building_record based on citizen's current position
    citizen_position_str = citizen_record['fields'].get('Position')
    citizen_position_coords: Optional[Dict[str, float]] = None
    if citizen_position_str:
        try:
            citizen_position_coords = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.warning(f"Could not parse citizen {citizen_username} position string: {citizen_position_str}")
            # Potentially try to assign a random position or fail, for now, let's try to proceed if Point exists
            # or fail if no valid position can be determined.
            # For bid_on_land, starting point is crucial.
            
    if not citizen_position_coords: # If Position is invalid or missing, try Point
        point_str = citizen_record['fields'].get('Point')
        if point_str and isinstance(point_str, str):
            parts = point_str.split('_')
            if len(parts) >= 3:
                try:
                    citizen_position_coords = {"lat": float(parts[1]), "lng": float(parts[2])}
                    log.info(f"Used citizen's Point field {point_str} to derive position: {citizen_position_coords}")
                except ValueError:
                    log.error(f"Citizen {citizen_username} has invalid Point field {point_str} for position. Cannot determine starting building.")
                    return None
        if not citizen_position_coords: # Still no position
            log.error(f"Citizen {citizen_username} has no valid Position or Point. Cannot determine starting building for bid_on_land.")
            return None

    # Find the closest building to the citizen's current position to use as from_building
    # Using a small max_distance to ensure the citizen is "at" or very near a building.
    from_building_record = get_closest_building_to_position(tables, citizen_position_coords, max_distance_meters=20.0)
    
    if not from_building_record:
        log.error(f"Citizen {citizen_username} is not close enough to any building to initiate bid_on_land. Position: {citizen_position_coords}")
        return None
    
    from_building_id_determined = from_building_record['fields'].get('BuildingId', from_building_record['id'])
    log.info(f"Determined starting building for {citizen_username} for bid_on_land: {from_building_id_determined} (based on current position).")

    # Determine targetBuildingId (official office)
    official_building_types = ["town_hall", "courthouse"]
    closest_official_office_record = None
    min_dist_to_office = float('inf')

    for office_type in official_building_types:
        try:
            offices = tables['buildings'].all(formula=f"{{Type}}='{_escape_airtable_value(office_type)}'")
            for office in offices:
                office_pos = _get_building_position_coords(office)
                if office_pos and citizen_position_coords: # citizen_position_coords is from_building_record's location effectively
                    dist = _calculate_distance_meters(citizen_position_coords, office_pos)
                    if dist < min_dist_to_office:
                        min_dist_to_office = dist
                        closest_official_office_record = office
        except Exception as e_office:
            log.error(f"Error fetching {office_type} buildings: {e_office}")
            continue
            
    if not closest_official_office_record:
        log.error(f"Failed to find any official office (town_hall or courthouse) for {citizen_username} to submit bid.")
        return None
        
    to_building_record = closest_official_office_record
    to_building_id = to_building_record['fields'].get('BuildingId', to_building_record['id'])
    log.info(f"Determined target office for {citizen_username} bid: {to_building_id} ({to_building_record['fields'].get('Type')}) at {min_dist_to_office:.0f}m distance.")

    # Determine sellerUsername from land_id
    from backend.engine.utils.activity_helpers import get_land_record # Import locally if not already top-level
    land_record_for_bid = get_land_record(tables, land_id)
    seller_username = "ConsiglioDeiDieci" # Default if no owner
    if land_record_for_bid and land_record_for_bid['fields'].get('Owner'):
        seller_username = land_record_for_bid['fields'].get('Owner')
        log.info(f"Land {land_id} is owned by {seller_username}.")
    elif land_record_for_bid:
        log.info(f"Land {land_id} has no specific owner, assuming ConsiglioDeiDieci.")
    else:
        log.warning(f"Could not find land record for {land_id}. Assuming bid is for unlisted/state land, seller ConsiglioDeiDieci.")

    # Calculate path between buildings
    # Use find_path_between_buildings_or_coords for consistency, or ensure find_path_between_buildings takes api_base_url
    # Assuming find_path_between_buildings is the intended direct helper here.
    # It needs api_base_url and optionally transport_api_url.
    # The helper find_path_between_buildings in activity_helpers.py already takes api_base_url.
    # It does not take transport_api_url directly, it constructs it from api_base_url.
    path_data = find_path_between_buildings(from_building_record, to_building_record, api_base_url)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path between {from_building_id_determined} and {to_building_id}")
        return None
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_bid_{_escape_airtable_value(land_id)}_{citizen_username}_{ts}"
    submit_activity_id = f"submit_land_bid_{_escape_airtable_value(land_id)}_{citizen_username}_{ts}"
    
    now_utc = datetime.now(timezone.utc) # Ensure timezone aware UTC
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate submission activity times (15 minutes after arrival)
    submit_start_date = travel_end_date  # Start immediately after arrival
    submit_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store bid details in the Details field for the processor to use
    # Include determined seller and office for context, though processor might not use them directly for contract.
    details_for_goto = {
        "landId": land_id,
        "bidAmount": bid_amount,
        "activityType": "bid_on_land", # Keep original context
        "nextStep": "submit_land_bid",
        "determinedSellerUsername": seller_username, # For context/logging
        "determinedTargetOfficeId": to_building_id   # For context/logging
    }
    details_for_submit = { # submit_land_bid processor primarily needs landId and bidAmount
        "landId": land_id,
        "bidAmount": bid_amount,
        "determinedSellerUsername": seller_username, 
        "determinedTargetOfficeId": to_building_id
    }
    details_json_for_submit = json.dumps(details_for_submit)
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": from_building_id_determined, # Use the determined starting building ID
        "ToBuilding": to_building_id,
        "Path": json.dumps(path_data.get('path', [])),
        "Notes": json.dumps(details_for_goto), # Changed Details to Notes
        "Status": "created",
        "Title": f"Traveling to submit bid on land {land_id}",
        "Description": f"Traveling from {from_building_record['fields'].get('Name', from_building_id_determined)} to {to_building_record['fields'].get('Name', to_building_id)} to submit a bid of {bid_amount} Ducats on land {land_id}",
        # "Notes" field was already here for simple text notes, now the JSON details go into the primary "Notes" field.
        # If a separate simple text note is still desired, it could be appended to the JSON string or handled differently.
        # For now, assuming the JSON details are the primary content for "Notes".
        # We can add a simple text note to the details_for_goto if needed:
        # details_for_goto["simple_note"] = "First step of bid_on_land process."
        # Then the "Notes" field in goto_payload would correctly contain this.
        # For now, let's keep the existing simple note if it's not part of details_for_goto.
        # The original "Notes" field for simple text was:
        # "Notes": f"First step of bid_on_land process. Will be followed by submit_land_bid activity.",
        # Let's ensure this simple note is preserved if details_for_goto doesn't cover it.
        # A common pattern is to have one "Notes" field that can be simple text or JSON.
        # If details_for_goto is the primary content, the simple note might be redundant or part of details_for_goto.
        # Given the error, "Details" was the problematic key.
        # The schema indicates "Notes" (Texte multiligne): Notes diverses ou chaîne JSON...
        # So, json.dumps(details_for_goto) is correct for the "Notes" field.
        # The original simple text note will be overridden by this JSON.
        # If both are needed, the simple note should be part of the details_for_goto dict.
        # For now, this change directly addresses the "Unknown field name: Details" error.
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    # 2. Create submit_land_bid activity (to be executed after arrival)
    submit_payload = {
        "ActivityId": submit_activity_id,
        "Type": "submit_land_bid",
        "Citizen": citizen_username,
        "FromBuilding": to_building_id,  # Citizen is already at the courthouse/town_hall
        "ToBuilding": to_building_id,    # Stays at the same location
        "Notes": details_json_for_submit, # Changed Details to Notes
        "Status": "created",
        "Title": f"Submitting bid on land {land_id}",
        "Description": f"Submitting a bid of {bid_amount} Ducats on land {land_id} (Seller: {seller_username}) at {to_building_record['fields'].get('Name', to_building_id)}.",
        # The original simple text note "Second step..." will be overridden by details_json_for_submit.
        # If this simple note is important, it should be part of the details_for_submit dict.
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": submit_start_date,  # But starts after the goto activity ends
        "EndDate": submit_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }

    try:
        # Create both activities in sequence
        goto_activity_record = tables["activities"].create(goto_payload) # Capture the record
        tables["activities"].create(submit_payload)
        
        log.info(f"Created complete bid_on_land activity chain for citizen {citizen_username}:")
        log.info(f"  1. goto_location activity {goto_activity_id} (from {from_building_id_determined})")
        log.info(f"  2. submit_land_bid activity {submit_activity_id}")
        return goto_activity_record # Return the first activity record
    except Exception as e:
        log.error(f"Failed to create bid_on_land activity chain for citizen {citizen_username}: {e}")
        return None # Return None on failure
