import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
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
    details: Dict[str, Any]
) -> bool:
    """
    Create both activities in the bid_on_land chain at once:
    1. A goto_location activity for travel to the official location
    2. A submit_land_bid activity that will execute after arrival
    
    This approach creates the complete activity chain upfront rather than
    creating the second activity upon completion of the first.
    """
    land_id = details.get('landId')
    bid_amount = details.get('bidAmount')
    from_building = details.get('fromBuildingId')
    to_building = details.get('targetBuildingId')  # courthouse or town_hall
    
    if not (land_id and bid_amount and from_building and to_building):
        log.error(f"Missing required details for bid_on_land: landId, bidAmount, fromBuildingId, or targetBuildingId")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get building records for path calculation
    from_building_record = get_building_record(tables, from_building)
    to_building_record = get_building_record(tables, to_building)
    
    # Specific checks and logging for building records
    if not from_building_record:
        log.error(f"Failed to create bid_on_land chain for citizen {citizen}: Could not find 'from' building record for ID '{from_building}'. This ID might be invalid or not a BuildingId (e.g., a LandId or incorrect format was provided).")
        return False
    if not to_building_record:
        log.error(f"Failed to create bid_on_land chain for citizen {citizen}: Could not find 'to' (targetOffice) building record for ID '{to_building}'. This ID might be invalid or not a BuildingId.")
        return False
    
    # Calculate path between buildings
    path_data = find_path_between_buildings(from_building_record, to_building_record)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path between {from_building} and {to_building}")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_bid_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    submit_activity_id = f"submit_land_bid_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
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
        "Citizen": citizen,
        "FromBuilding": from_building,
        "ToBuilding": to_building,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "landId": land_id,
            "bidAmount": bid_amount,
            "activityType": "bid_on_land",
            "nextStep": "submit_land_bid"
        }),
        "Status": "created",
        "Title": f"Traveling to submit bid on land {land_id}",
        "Description": f"Traveling to {to_building_record['fields'].get('Name', to_building)} to submit a bid of {bid_amount} Ducats on land {land_id}",
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
        "Citizen": citizen,
        "FromBuilding": to_building,  # Citizen is already at the courthouse/town_hall
        "ToBuilding": to_building,    # Stays at the same location
        "Details": details_json,
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
        
        log.info(f"Created complete bid_on_land activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. submit_land_bid activity {submit_activity_id}")
        return goto_activity_record # Return the first activity record
    except Exception as e:
        log.error(f"Failed to create bid_on_land activity chain: {e}")
        return None # Return None on failure
