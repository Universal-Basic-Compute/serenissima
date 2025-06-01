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
    Create the complete manage_public_import_contract activity chain at once:
    1. A goto_location activity for travel to the customs house or broker's office
    2. A register_public_import_agreement activity that will execute after arrival
    
    This approach creates the complete activity chain upfront for a public import offer.
    """
    # Extract required parameters
    contract_id = details.get('contractId')  # Optional for new contracts
    resource_type = details.get('resourceType')
    price_per_resource = details.get('pricePerResource')
    target_amount = details.get('targetAmount')
    target_office_building_id = details.get('targetOfficeBuildingId')  # customs_house or broker_s_office
    
    # Validate required parameters
    if not (resource_type and price_per_resource is not None and target_amount is not None and 
            target_office_building_id):
        log.error(f"Missing required details for manage_public_import_contract: resourceType, pricePerResource, targetAmount, or targetOfficeBuildingId")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get building record for path calculation
    office_building_record = get_building_record(tables, target_office_building_id)
    
    if not office_building_record:
        log.error(f"Could not find building record for {target_office_building_id}")
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
    
    # Create activity IDs
    goto_office_activity_id = f"goto_office_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    register_activity_id = f"register_public_import_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    
    # Calculate activity times for path to office
    path_to_office = find_path_between_buildings(None, office_building_record, current_position=current_position)
    if not path_to_office or not path_to_office.get('path'):
        log.error(f"Could not find path to office building {target_office_building_id}")
        return False
    
    # Set start times
    goto_office_start_date = now_utc.isoformat()
    
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
            "activityType": "manage_public_import_contract",
            "nextStep": "register_public_import_agreement"
        }),
        "Status": "created",
        "Title": f"Traveling to {'modify' if contract_id else 'register'} public import offer",
        "Description": f"Traveling to {office_building_record['fields'].get('Name', target_office_building_id)} to {'modify' if contract_id else 'register'} public import offer for {target_amount} {resource_type}",
        "Notes": f"First step of manage_public_import_contract process. Will be followed by contract registration.",
        "CreatedAt": goto_office_start_date,
        "StartDate": goto_office_start_date,
        "EndDate": goto_office_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_office_payload)
    
    # Create register_public_import_agreement activity
    register_payload = {
        "ActivityId": register_activity_id,
        "Type": "register_public_import_agreement",
        "Citizen": citizen,
        "FromBuilding": target_office_building_id,
        "ToBuilding": target_office_building_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id
        }),
        "Status": "created",
        "Title": f"{'Modifying' if contract_id else 'Registering'} public import offer for {resource_type}",
        "Description": f"{'Modifying' if contract_id else 'Registering'} public import offer for {target_amount} {resource_type} at {price_per_resource} Ducats each",
        "Notes": f"Final step of manage_public_import_contract process. Will create/update public import contract.",
        "CreatedAt": goto_office_start_date,
        "StartDate": register_start_date,
        "EndDate": register_end_date,
        "Priority": 20
    }
    activities_to_create.append(register_payload)

    try:
        # Create all activities in sequence
        for activity_payload in activities_to_create:
            tables["activities"].create(activity_payload)
        
        log.info(f"Created complete manage_public_import_contract activity chain for citizen {citizen}:")
        for idx, activity in enumerate(activities_to_create, 1):
            log.info(f"  {idx}. {activity['Type']} activity {activity['ActivityId']}")
        return True
    except Exception as e:
        log.error(f"Failed to create manage_public_import_contract activity chain: {e}")
        return False
