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
    activity_type_param: str, # Added - though not directly used if creator is specific
    details: Dict[str, Any],  # This is activity_parameters from dispatcher
    resource_defs: Dict[str, Any], # Added
    building_type_defs: Dict[str, Any], # Added
    now_venice_dt: datetime, # Added
    now_utc_dt_param: datetime, # Added - renamed to avoid conflict with internal now_utc
    transport_api_url: str, # Added
    api_base_url: str # Added
) -> Optional[List[Dict[str, Any]]]: # Return type changed to Optional[List[Dict]]
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
            target_office_building_id):
        log.error(f"Missing required details for manage_import_contract: resourceType, pricePerResource, targetAmount, or targetOfficeBuildingId")
        return None # Changed to None

    citizen = citizen_record['fields'].get('Username')
    # Use the passed now_venice_dt for timestamp consistency
    ts = int(now_venice_dt.timestamp())
    
    # Get building record for office
    office_building_record = get_building_record(tables, target_office_building_id)
    
    if not office_building_record:
        log.error(f"Could not find building record for {target_office_building_id}")
        return None # Changed to None
    
    # Get buyer building record if specified
    buyer_building_record = None
    if buyer_building_id:
        buyer_building_record = get_building_record(tables, buyer_building_id)
        if not buyer_building_record:
            log.error(f"Could not find building record for buyer building {buyer_building_id}")
            return None # Changed to None
    
    # Get current citizen position to determine first path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse citizen position: {citizen_position_str}")
            return None # Changed to None
    
    # Determine if we need to go to buyer building first or if citizen is already there
    citizen_at_buyer_building = False
    if buyer_building_id and current_position and buyer_building_record:
        buyer_position = _get_building_position(buyer_building_record)
        if buyer_position:
            # Simple check if positions are close enough (within ~10 meters)
            distance = _calculate_distance(current_position, buyer_position)
            citizen_at_buyer_building = distance < 10
    
    # Create activity IDs
    assess_activity_id = f"assess_import_needs_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    goto_office_activity_id = f"goto_office_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    register_activity_id = f"register_import_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    
    # Use the passed now_utc_dt_param
    now_utc = now_utc_dt_param
    
    # Skip the buyer building step entirely and go directly to the office
    # Calculate activity times for direct path to office
    # Pass api_base_url to find_path_between_buildings
    path_to_office = find_path_between_buildings(None, office_building_record, api_base_url, current_position=current_position)
    if not path_to_office or not path_to_office.get('path'):
        log.error(f"Could not find path to office building {target_office_building_id}")
        return None # Changed to None
    
    # Set start times
    assess_start_date = now_utc.isoformat() # This is effectively CreatedAt for the chain
    goto_office_start_date = assess_start_date
    
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
    
    # Create goto_office activity (direct from current position)
    goto_office_payload = {
        "ActivityId": goto_office_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
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
        "Notes": f"First step of manage_import_contract process. Will be followed by contract registration.",
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
        return activities_to_create # Return the list of payloads
    except Exception as e:
        log.error(f"Failed to create manage_import_contract activity chain: {e}")
        return None # Changed to None

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
