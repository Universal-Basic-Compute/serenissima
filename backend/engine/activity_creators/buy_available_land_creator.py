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
    Create both activities in the buy_available_land chain at once:
    1. A goto_location activity for travel to the official location (courthouse/town_hall)
    2. A finalize_land_purchase activity that will execute after arrival
    
    This approach creates the complete activity chain upfront.
    """
    land_id = details.get('landId')
    expected_price = details.get('expectedPrice')
    from_building = details.get('fromBuildingId')
    to_building = details.get('targetBuildingId')  # courthouse or town_hall
    
    if not (land_id and expected_price is not None and to_building):
        log.error(f"Missing required details for buy_available_land: landId, expectedPrice, or targetBuildingId")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get building records for path calculation
    to_building_record = get_building_record(tables, to_building)
    
    if not to_building_record:
        log.error(f"Could not find building record for {to_building}")
        return False
    
    # Get current citizen position to determine path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse citizen position: {citizen_position_str}")
            return False
    
    # Calculate path to official building
    from_building_record = None
    if from_building:
        from_building_record = get_building_record(tables, from_building)
    
    path_data = find_path_between_buildings(from_building_record, to_building_record, current_position=current_position)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to {to_building}")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_purchase_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    purchase_activity_id = f"finalize_land_purchase_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate purchase activity times (15 minutes after arrival)
    purchase_start_date = travel_end_date  # Start immediately after arrival
    purchase_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store purchase details in the Details field for the processor to use
    details_json = json.dumps({
        "landId": land_id,
        "expectedPrice": expected_price
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": from_building,
        "ToBuilding": to_building,
        "Path": json.dumps(path_data.get('path', [])),
        "Notes": json.dumps({ # Changed Details to Notes
            "landId": land_id,
            "expectedPrice": expected_price,
            "activityType": "buy_available_land",
            "nextStep": "finalize_land_purchase"
        }),
        "Status": "created",
        "Title": f"Traveling to purchase land {land_id}",
        "Description": f"Traveling to {to_building_record['fields'].get('Name', to_building)} to purchase land {land_id} for {expected_price} Ducats",
        "Notes": f"First step of buy_available_land process. Will be followed by finalize_land_purchase activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    # 2. Create finalize_land_purchase activity (to be executed after arrival)
    purchase_payload = {
        "ActivityId": purchase_activity_id,
        "Type": "finalize_land_purchase",
        "Citizen": citizen,
        "FromBuilding": to_building,  # Citizen is already at the courthouse/town_hall
        "ToBuilding": to_building,    # Stays at the same location
        "Notes": details_json, # Changed Details to Notes. The original "Notes" field content is now part of details_json or needs to be added there if still relevant.
        "Status": "created",
        "Title": f"Finalizing purchase of land {land_id}",
        "Description": f"Completing the purchase of land {land_id} for {expected_price} Ducats",
        # "Notes" field now contains details_json. If the simple text note is still needed, it should be part of details_json.
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": purchase_start_date,  # But starts after the goto activity ends
        "EndDate": purchase_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(purchase_payload)
        
        log.info(f"Created complete buy_available_land activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. finalize_land_purchase activity {purchase_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create buy_available_land activity chain: {e}")
        return False
