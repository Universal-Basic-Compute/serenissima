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
    get_closest_building_to_position # Import new helper
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> Optional[Dict[str, Any]]: # Changed return type
    """
    Create both activities in the bid_on_land chain at once:
    1. A goto_location activity for travel to the official location
    2. A submit_land_bid activity that will execute after arrival
    
    The 'fromBuildingId' is now determined based on the citizen's current position.
    """
    land_id = details.get('landId')
    bid_amount = details.get('bidAmount')
    # from_building = details.get('fromBuildingId') # No longer taken from details
    to_building_id = details.get('targetBuildingId')  # courthouse or town_hall
    
    if not (land_id and bid_amount and to_building_id):
        log.error(f"Missing required details for bid_on_land: landId, bidAmount, or targetBuildingId")
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

    to_building_record = get_building_record(tables, to_building_id)
    
    # Specific checks and logging for building records
    # from_building_record is already checked by virtue of being found by get_closest_building_to_position
    if not to_building_record:
        log.error(f"Failed to create bid_on_land chain for citizen {citizen_username}: Could not find 'to' (targetOffice) building record for ID '{to_building_id}'. This ID might be invalid or not a BuildingId.")
        return None
    
    # Calculate path between buildings
    path_data = find_path_between_buildings(from_building_record, to_building_record)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path between {from_building_id_determined} and {to_building_id}")
        return None # Changed from False
    
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
    details_json = json.dumps({
        "landId": land_id,
        "bidAmount": bid_amount
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": from_building_id_determined, # Use the determined starting building ID
        "ToBuilding": to_building_id,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "landId": land_id,
            "bidAmount": bid_amount,
            "activityType": "bid_on_land", # Keep original context
            "nextStep": "submit_land_bid"
        }),
        "Status": "created",
        "Title": f"Traveling to submit bid on land {land_id}",
        "Description": f"Traveling from {from_building_record['fields'].get('Name', from_building_id_determined)} to {to_building_record['fields'].get('Name', to_building_id)} to submit a bid of {bid_amount} Ducats on land {land_id}",
        "Notes": f"First step of bid_on_land process. Will be followed by submit_land_bid activity.",
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
        "Details": details_json, # Contains landId and bidAmount
        "Status": "created",
        "Title": f"Submitting bid on land {land_id}",
        "Description": f"Submitting a bid of {bid_amount} Ducats on land {land_id}",
        "Notes": f"Second step of bid_on_land process. Will create building_bid contract.",
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
