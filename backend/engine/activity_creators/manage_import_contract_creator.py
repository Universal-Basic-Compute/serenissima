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
    Create the complete manage_import_contract activity chain at once:
    1. A goto_location activity for travel to the buyer's building (to assess needs)
    2. An assess_import_needs activity at the buyer's building
    3. A goto_location activity for travel to the customs house or broker's office
    4. A register_import_agreement activity that will execute after arrival
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    contract_id = details.get('contractId')  # Optional for new contracts
    resource_type = details.get('resourceType')
    price_per_resource = details.get('pricePerResource')
    target_amount = details.get('targetAmount')
    buyer_building_id = details.get('buyerBuildingId')
    target_office_building_id = details.get('targetOfficeBuildingId')  # customs_house or broker_s_office
    
    # Validate required parameters
    if not (resource_type and price_per_resource is not None and target_amount is not None and 
            buyer_building_id and target_office_building_id):
        log.error(f"Missing required details for manage_import_contract: resourceType, pricePerResource, targetAmount, buyerBuildingId, or targetOfficeBuildingId")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get building records for path calculation
    buyer_building_record = get_building_record(tables, buyer_building_id)
    office_building_record = get_building_record(tables, target_office_building_id)
    
    if not buyer_building_record or not office_building_record:
        log.error(f"Could not find building records for {buyer_building_id} or {target_office_building_id}")
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
    
    # Determine if we need to go to buyer building first or if citizen is already there
    citizen_at_buyer_building = False
    if current_position:
        buyer_position = _get_building_position(buyer_building_record)
        if buyer_position:
            # Simple check if positions are close enough (within ~10 meters)
            distance = _calculate_distance(current_position, buyer_position)
            citizen_at_buyer_building = distance < 10
    
    # Create activity IDs
    assess_activity_id = f"assess_import_needs_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    goto_office_activity_id = f"goto_office_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    register_activity_id = f"register_import_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    
    # Skip the buyer building step entirely and go directly to the office
    # Calculate activity times for direct path to office
    path_to_office = find_path_between_buildings(None, office_building_record, current_position=current_position)
    if not path_to_office or not path_to_office.get('path'):
        log.error(f"Could not find path to office building {target_office_building_id}")
        return False
    
    # Set start times
    assess_start_date = now_utc.isoformat()
    goto_office_start_date = assess_start_date
    
    # Calculate path from buyer building to office
    path_to_office = find_path_between_buildings(buyer_building_record, office_building_record)
    if not path_to_office or not path_to_office.get('path'):
        log.error(f"Could not find path from buyer building {buyer_building_id} to office {target_office_building_id}")
        return False
    
    # Calculate office travel duration
    office_duration_seconds = path_to_office.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_office_end_date = (datetime.fromisoformat(goto_office_start_date.replace('Z', '+00:00')) + 
                           timedelta(seconds=office_duration_seconds)).isoformat()
    
    # Calculate registration activity times (15 minutes after arrival at office)
    register_start_date = goto_office_end_date
    register_end_date = (datetime.fromisoformat(goto_office_end_date.replace('Z', '+00:00')) + 
                         timedelta(minutes=15)).isoformat()
    
    # Prepare activity payloads
    activities_to_create = []
    
    # 1. Create goto_buyer_building activity (if needed)
    if not citizen_at_buyer_building:
        goto_buyer_payload = {
            "ActivityId": f"goto_buyer_{_escape_airtable_value(resource_type)}_{citizen}_{ts}",
            "Type": "goto_location",
            "Citizen": citizen,
            "FromBuilding": None,  # Starting from current position
            "ToBuilding": buyer_building_id,
            "Path": json.dumps(path_to_buyer.get('path', [])),
            "Details": json.dumps({
                "resourceType": resource_type,
                "activityType": "manage_import_contract",
                "nextStep": "assess_import_needs"
            }),
            "Status": "created",
            "Title": f"Traveling to assess import needs for {resource_type}",
            "Description": f"Traveling to {buyer_building_record['fields'].get('Name', buyer_building_id)} to assess import needs for {resource_type}",
            "Notes": f"First step of manage_import_contract process. Will be followed by needs assessment.",
            "CreatedAt": assess_start_date,
            "StartDate": assess_start_date,
            "EndDate": assess_end_date,
            "Priority": 20  # Medium-high priority for economic activities
        }
        activities_to_create.append(goto_buyer_payload)
    
    # 2. Create assess_import_needs activity (short duration at buyer building)
    assess_needs_payload = {
        "ActivityId": assess_activity_id,
        "Type": "assess_import_needs",
        "Citizen": citizen,
        "FromBuilding": buyer_building_id,
        "ToBuilding": buyer_building_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "activityType": "manage_import_contract",
            "nextStep": "goto_office"
        }),
        "Status": "created",
        "Title": f"Assessing import needs for {resource_type}",
        "Description": f"Evaluating import requirements for {target_amount} {resource_type} at {price_per_resource} Ducats each",
        "Notes": f"{'Modifying' if contract_id else 'Creating new'} import contract for {resource_type}",
        "CreatedAt": assess_start_date,
        "StartDate": assess_start_date if citizen_at_buyer_building else assess_end_date,
        "EndDate": goto_office_start_date,
        "Priority": 20
    }
    activities_to_create.append(assess_needs_payload)
    
    # 3. Create goto_office activity
    goto_office_payload = {
        "ActivityId": goto_office_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": buyer_building_id,
        "ToBuilding": target_office_building_id,
        "Path": json.dumps(path_to_office.get('path', [])),
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "buyerBuildingId": buyer_building_id,
            "activityType": "manage_import_contract",
            "nextStep": "register_import_agreement"
        }),
        "Status": "created",
        "Title": f"Traveling to {'modify' if contract_id else 'register'} import contract",
        "Description": f"Traveling to {office_building_record['fields'].get('Name', target_office_building_id)} to {'modify' if contract_id else 'register'} import contract for {target_amount} {resource_type}",
        "Notes": f"Second step of manage_import_contract process. Will be followed by contract registration.",
        "CreatedAt": assess_start_date,
        "StartDate": goto_office_start_date,
        "EndDate": goto_office_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_office_payload)
    
    # 4. Create register_import_agreement activity
    register_payload = {
        "ActivityId": register_activity_id,
        "Type": "register_import_agreement",
        "Citizen": citizen,
        "FromBuilding": target_office_building_id,
        "ToBuilding": target_office_building_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "buyerBuildingId": buyer_building_id
        }),
        "Status": "created",
        "Title": f"{'Modifying' if contract_id else 'Registering'} import contract for {resource_type}",
        "Description": f"{'Modifying' if contract_id else 'Registering'} import contract for {target_amount} {resource_type} at {price_per_resource} Ducats each",
        "Notes": f"Final step of manage_import_contract process. Will create/update import contract.",
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
        
        log.info(f"Created complete manage_import_contract activity chain for citizen {citizen}:")
        for idx, activity in enumerate(activities_to_create, 1):
            log.info(f"  {idx}. {activity['Type']} activity {activity['ActivityId']}")
        return True
    except Exception as e:
        log.error(f"Failed to create manage_import_contract activity chain: {e}")
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
