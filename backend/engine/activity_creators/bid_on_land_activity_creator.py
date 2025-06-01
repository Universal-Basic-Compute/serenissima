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
    Create a goto_location activity for the citizen to travel to an official location
    (courthouse or town_hall) to submit a land bid.
    
    This is the first step in a multi-activity chain for bidding on land.
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
    
    if not from_building_record or not to_building_record:
        log.error(f"Could not find building records for {from_building} or {to_building}")
        return False
    
    # Calculate path between buildings
    path_data = find_path_between_buildings(from_building_record, to_building_record)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path between {from_building} and {to_building}")
        return False
    
    # Create goto_location activity
    goto_activity_id = f"goto_location_for_bid_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    start_date = now_utc.isoformat()
    
    # Calculate end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Store bid details in the Details field for the processor to use
    details_json = json.dumps({
        "landId": land_id,
        "bidAmount": bid_amount,
        "activityType": "bid_on_land",
        "nextStep": "submit_land_bid"
    })
    
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": from_building,
        "ToBuilding": to_building,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": details_json,
        "Status": "created",
        "Title": f"Traveling to submit bid on land {land_id}",
        "Description": f"Traveling to {to_building_record['fields'].get('Name', to_building)} to submit a bid of {bid_amount} Ducats on land {land_id}",
        "Notes": f"First step of bid_on_land process. Will create submit_land_bid activity upon arrival.",
        "CreatedAt": start_date,
        "StartDate": start_date,
        "EndDate": end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }

    try:
        tables["activities"].create(goto_payload)
        log.info(f"Created goto_location activity {goto_activity_id} for citizen {citizen} to bid on land {land_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create goto_location activity for bid_on_land: {e}")
        return False
