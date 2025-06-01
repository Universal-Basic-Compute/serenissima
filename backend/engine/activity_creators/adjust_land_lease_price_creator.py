import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings,
    get_building_record,
    get_citizen_home
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Create the complete adjust_land_lease_price activity chain:
    1. A goto_location activity for travel to the appropriate location (home, office, or public_archives)
    2. A file_lease_adjustment activity to register the change
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    land_id = details.get('landId')
    new_lease_price = details.get('newLeasePrice')
    strategy = details.get('strategy', 'standard')  # Optional strategy parameter
    target_office_building_id = details.get('targetOfficeBuildingId')  # Optional specific building
    
    # Validate required parameters
    if not (land_id and new_lease_price is not None):
        log.error(f"Missing required details for adjust_land_lease_price: landId or newLeasePrice")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get current citizen position to determine path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse citizen position: {citizen_position_str}")
            return False
    
    # Verify the citizen owns the land
    land_formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
    land_records = tables['lands'].all(formula=land_formula, max_records=1)
    
    if not land_records:
        log.error(f"Land {land_id} not found")
        return False
    
    land_record = land_records[0]
    land_owner = land_record['fields'].get('Owner')
    
    if land_owner != citizen:
        log.error(f"Citizen {citizen} does not own land {land_id}")
        return False
    
    # Determine the appropriate location for the adjustment
    destination_building_id = None
    
    # If a specific target building was provided, use it
    if target_office_building_id:
        target_building_record = get_building_record(tables, target_office_building_id)
        if target_building_record:
            building_type = target_building_record['fields'].get('Type')
            if building_type == 'public_archives':
                destination_building_id = target_office_building_id
                log.info(f"Using specified public_archives building: {destination_building_id}")
            else:
                log.warning(f"Specified building {target_office_building_id} is not a public_archives. Will find alternative.")
    
    # If no valid target building was provided, try citizen's home or a building they operate
    if not destination_building_id:
        # Try citizen's home first
        home_building_id = get_citizen_home(tables, citizen)
        if home_building_id:
            destination_building_id = home_building_id
            log.info(f"Using citizen's home as destination: {destination_building_id}")
        else:
            # Try to find a building operated by the citizen
            operated_buildings_formula = f"{{RunBy}}='{_escape_airtable_value(citizen)}'"
            operated_buildings = tables['buildings'].all(formula=operated_buildings_formula, max_records=10)
            
            if operated_buildings:
                # Prefer an office-type building if available
                office_types = ['office', 'counting_house', 'public_archives']
                for building in operated_buildings:
                    building_type = building['fields'].get('Type')
                    if building_type in office_types:
                        destination_building_id = building['fields'].get('BuildingId')
                        log.info(f"Using citizen's operated office building: {destination_building_id}")
                        break
                
                # If no office-type building, use the first operated building
                if not destination_building_id:
                    destination_building_id = operated_buildings[0]['fields'].get('BuildingId')
                    log.info(f"Using citizen's operated building: {destination_building_id}")
    
    # If still no destination, find the nearest public_archives
    if not destination_building_id:
        public_archives_formula = "Type='public_archives'"
        public_archives_buildings = tables['buildings'].all(formula=public_archives_formula)
        
        if public_archives_buildings:
            # Find the closest public_archives to the citizen's current position
            closest_archives = None
            min_distance = float('inf')
            
            for archives in public_archives_buildings:
                archives_position_str = archives['fields'].get('Position')
                if archives_position_str:
                    try:
                        archives_position = json.loads(archives_position_str)
                        if current_position and archives_position:
                            distance = _calculate_distance(current_position, archives_position)
                            if distance < min_distance:
                                min_distance = distance
                                closest_archives = archives
                    except json.JSONDecodeError:
                        continue
            
            if closest_archives:
                destination_building_id = closest_archives['fields'].get('BuildingId')
                log.info(f"Using closest public_archives: {destination_building_id}")
    
    if not destination_building_id:
        log.error(f"Could not find a suitable destination for lease price adjustment")
        return False
    
    # Get building record for path calculation
    destination_building_record = get_building_record(tables, destination_building_id)
    
    if not destination_building_record:
        log.error(f"Could not find building record for {destination_building_id}")
        return False
    
    # Calculate path to destination
    path_data = find_path_between_buildings(None, destination_building_record, current_position=current_position)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to {destination_building_id}")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_lease_adjustment_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    adjustment_activity_id = f"file_lease_adjustment_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate adjustment activity times (15 minutes after arrival)
    adjustment_start_date = travel_end_date  # Start immediately after arrival
    adjustment_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store adjustment details in the Details field for the processor to use
    details_json = json.dumps({
        "landId": land_id,
        "newLeasePrice": new_lease_price,
        "strategy": strategy
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": destination_building_id,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "landId": land_id,
            "newLeasePrice": new_lease_price,
            "strategy": strategy,
            "activityType": "adjust_land_lease_price",
            "nextStep": "file_lease_adjustment"
        }),
        "Status": "created",
        "Title": f"Traveling to adjust lease price for land {land_id}",
        "Description": f"Traveling to {destination_building_record['fields'].get('Name', destination_building_id)} to adjust the lease price for land {land_id} to {new_lease_price} Ducats",
        "Notes": f"First step of adjust_land_lease_price process. Will be followed by file_lease_adjustment activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    # 2. Create file_lease_adjustment activity (to be executed after arrival)
    adjustment_payload = {
        "ActivityId": adjustment_activity_id,
        "Type": "file_lease_adjustment",
        "Citizen": citizen,
        "FromBuilding": destination_building_id,  # Citizen is already at the destination
        "ToBuilding": destination_building_id,    # Stays at the same location
        "Details": details_json,
        "Status": "created",
        "Title": f"Adjusting lease price for land {land_id}",
        "Description": f"Filing paperwork to adjust the lease price for land {land_id} to {new_lease_price} Ducats",
        "Notes": f"Second step of adjust_land_lease_price process. Will update land lease price and process any fees.",
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": adjustment_start_date,  # But starts after the goto activity ends
        "EndDate": adjustment_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(adjustment_payload)
        
        log.info(f"Created complete adjust_land_lease_price activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. file_lease_adjustment activity {adjustment_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create adjust_land_lease_price activity chain: {e}")
        return False

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
