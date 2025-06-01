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
    Create the complete manage_logistics_service_contract activity chain at once:
    1. A goto_location activity for travel to the client's building (to assess logistics needs)
    2. An assess_logistics_needs activity at the client's building
    3. A goto_location activity for travel to the porter guild hall
    4. A register_logistics_service_contract activity that will execute after arrival
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    contract_id = details.get('contractId')  # Optional for new contracts
    resource_type = details.get('resourceType')  # Optional for general logistics
    service_fee_per_unit = details.get('serviceFeePerUnit')
    client_building_id = details.get('clientBuildingId')
    target_guild_hall_id = details.get('targetGuildHallId')  # porter_guild_hall
    
    # Validate required parameters
    if not (service_fee_per_unit is not None and client_building_id and target_guild_hall_id):
        log.error(f"Missing required details for manage_logistics_service_contract: serviceFeePerUnit, clientBuildingId, or targetGuildHallId")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get building records for path calculation
    client_building_record = get_building_record(tables, client_building_id)
    guild_hall_record = get_building_record(tables, target_guild_hall_id)
    
    if not client_building_record or not guild_hall_record:
        log.error(f"Could not find building records for {client_building_id} or {target_guild_hall_id}")
        return False
    
    # Get current citizen position to determine first path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse citizen position: {citizen_position_str}")
            return False
    
    # Determine if we need to go to client building first or if citizen is already there
    citizen_at_client_building = False
    if current_position:
        client_position = _get_building_position(client_building_record)
        if client_position:
            # Simple check if positions are close enough (within ~10 meters)
            distance = _calculate_distance(current_position, client_position)
            citizen_at_client_building = distance < 10
    
    # Create activity IDs
    assess_activity_id = f"assess_logistics_needs_{citizen}_{ts}"
    goto_guild_hall_activity_id = f"goto_guild_hall_{citizen}_{ts}"
    register_activity_id = f"register_logistics_service_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    
    # Calculate activity times
    if citizen_at_client_building:
        # Skip the first goto_location if already at client building
        assess_start_date = now_utc.isoformat()
        assess_end_date = (now_utc + timedelta(minutes=15)).isoformat()  # 15 min to assess needs
        goto_guild_hall_start_date = assess_end_date
    else:
        # Need to go to client building first
        # Calculate path to client building
        path_to_client = find_path_between_buildings(None, client_building_record, current_position=current_position)
        if not path_to_client or not path_to_client.get('path'):
            log.error(f"Could not find path to client building {client_building_id}")
            return False
        
        assess_start_date = now_utc.isoformat()
        # Calculate travel duration to client building
        client_duration_seconds = path_to_client.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
        assess_end_date = (now_utc + timedelta(seconds=client_duration_seconds)).isoformat()
        goto_guild_hall_start_date = (now_utc + timedelta(seconds=client_duration_seconds) + timedelta(minutes=15)).isoformat()
    
    # Calculate path from client building to guild hall
    path_to_guild_hall = find_path_between_buildings(client_building_record, guild_hall_record)
    if not path_to_guild_hall or not path_to_guild_hall.get('path'):
        log.error(f"Could not find path from client building {client_building_id} to guild hall {target_guild_hall_id}")
        return False
    
    # Calculate guild hall travel duration
    guild_hall_duration_seconds = path_to_guild_hall.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_guild_hall_end_date = (datetime.fromisoformat(goto_guild_hall_start_date.replace('Z', '+00:00')) + 
                           timedelta(seconds=guild_hall_duration_seconds)).isoformat()
    
    # Calculate registration activity times (15 minutes after arrival at guild hall)
    register_start_date = goto_guild_hall_end_date
    register_end_date = (datetime.fromisoformat(goto_guild_hall_end_date.replace('Z', '+00:00')) + 
                         timedelta(minutes=15)).isoformat()
    
    # Prepare activity payloads
    activities_to_create = []
    
    # 1. Create goto_client_building activity (if needed)
    if not citizen_at_client_building:
        goto_client_payload = {
            "ActivityId": f"goto_client_{citizen}_{ts}",
            "Type": "goto_location",
            "Citizen": citizen,
            "FromBuilding": None,  # Starting from current position
            "ToBuilding": client_building_id,
            "Path": json.dumps(path_to_client.get('path', [])),
            "Details": json.dumps({
                "resourceType": resource_type,
                "activityType": "manage_logistics_service_contract",
                "nextStep": "assess_logistics_needs"
            }),
            "Status": "created",
            "Title": f"Traveling to assess logistics needs",
            "Description": f"Traveling to {client_building_record['fields'].get('Name', client_building_id)} to assess logistics service needs",
            "Notes": f"First step of manage_logistics_service_contract process. Will be followed by needs assessment.",
            "CreatedAt": assess_start_date,
            "StartDate": assess_start_date,
            "EndDate": assess_end_date,
            "Priority": 20  # Medium-high priority for economic activities
        }
        activities_to_create.append(goto_client_payload)
    
    # 2. Create assess_logistics_needs activity (short duration at client building)
    assess_needs_payload = {
        "ActivityId": assess_activity_id,
        "Type": "assess_logistics_needs",
        "Citizen": citizen,
        "FromBuilding": client_building_id,
        "ToBuilding": client_building_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "serviceFeePerUnit": service_fee_per_unit,
            "contractId": contract_id,
            "activityType": "manage_logistics_service_contract",
            "nextStep": "goto_guild_hall"
        }),
        "Status": "created",
        "Title": f"Assessing logistics service needs",
        "Description": f"Evaluating logistics requirements at {client_building_record['fields'].get('Name', client_building_id)}",
        "Notes": f"{'Modifying' if contract_id else 'Creating new'} logistics service contract",
        "CreatedAt": assess_start_date,
        "StartDate": assess_start_date if citizen_at_client_building else assess_end_date,
        "EndDate": goto_guild_hall_start_date,
        "Priority": 20
    }
    activities_to_create.append(assess_needs_payload)
    
    # 3. Create goto_guild_hall activity
    goto_guild_hall_payload = {
        "ActivityId": goto_guild_hall_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": client_building_id,
        "ToBuilding": target_guild_hall_id,
        "Path": json.dumps(path_to_guild_hall.get('path', [])),
        "Details": json.dumps({
            "resourceType": resource_type,
            "serviceFeePerUnit": service_fee_per_unit,
            "contractId": contract_id,
            "clientBuildingId": client_building_id,
            "activityType": "manage_logistics_service_contract",
            "nextStep": "register_logistics_service_contract"
        }),
        "Status": "created",
        "Title": f"Traveling to {'modify' if contract_id else 'register'} logistics service contract",
        "Description": f"Traveling to {guild_hall_record['fields'].get('Name', target_guild_hall_id)} to {'modify' if contract_id else 'register'} logistics service contract",
        "Notes": f"Second step of manage_logistics_service_contract process. Will be followed by contract registration.",
        "CreatedAt": assess_start_date,
        "StartDate": goto_guild_hall_start_date,
        "EndDate": goto_guild_hall_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_guild_hall_payload)
    
    # 4. Create register_logistics_service_contract activity
    register_payload = {
        "ActivityId": register_activity_id,
        "Type": "register_logistics_service_contract",
        "Citizen": citizen,
        "FromBuilding": target_guild_hall_id,
        "ToBuilding": target_guild_hall_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "serviceFeePerUnit": service_fee_per_unit,
            "contractId": contract_id,
            "clientBuildingId": client_building_id
        }),
        "Status": "created",
        "Title": f"{'Modifying' if contract_id else 'Registering'} logistics service contract",
        "Description": f"{'Modifying' if contract_id else 'Registering'} logistics service contract for {client_building_record['fields'].get('Name', client_building_id)}",
        "Notes": f"Final step of manage_logistics_service_contract process. Will create/update logistics_service_request contract.",
        "CreatedAt": assess_start_date,
        "StartDate": register_start_date,
        "EndDate": register_end_date,
        "Priority": 20
    }
    activities_to_create.append(register_payload)

    try:
        # Create all activities in sequence
        for activity_payload in activities_to_create:
            tables["activities"].create(activity_payload)
        
        log.info(f"Created complete manage_logistics_service_contract activity chain for citizen {citizen}:")
        for idx, activity in enumerate(activities_to_create, 1):
            log.info(f"  {idx}. {activity['Type']} activity {activity['ActivityId']}")
        return True
    except Exception as e:
        log.error(f"Failed to create manage_logistics_service_contract activity chain: {e}")
        return False

def _get_building_position(building_record):
    """Extract position from building record."""
    position_str = building_record['fields'].get('Position')
    if position_str:
        try:
            return json.loads(position_str)
        except json.JSONDecodeError:
            return None
    return None

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
