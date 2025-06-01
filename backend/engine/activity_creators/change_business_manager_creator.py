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
    get_citizen_home,
    get_citizen_record
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Create the complete change_business_manager activity chain:
    1. A goto_location activity for travel to the business
    2. A goto_location activity for travel to the courthouse/town_hall or meeting the other party
    3. A finalize_operator_change activity to register the change
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    business_building_id = details.get('businessBuildingId')
    new_operator_username = details.get('newOperatorUsername')
    current_operator_username = details.get('currentOperatorUsername')
    owner_username = details.get('ownerUsername')
    reason = details.get('reason', 'Not specified')
    target_office_building_id = details.get('targetOfficeBuildingId')  # Optional specific building
    operation_type = details.get('operationType', 'delegate')  # 'delegate', 'request_management', 'claim_management'
    
    # Validate required parameters
    if not business_building_id:
        log.error(f"Missing required details for change_business_manager: businessBuildingId")
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
    
    # Verify the business building exists
    building_formula = f"{{BuildingId}}='{_escape_airtable_value(business_building_id)}'"
    building_records = tables['buildings'].all(formula=building_formula, max_records=1)
    
    if not building_records:
        log.error(f"Building {business_building_id} not found")
        return False
    
    building_record = building_records[0]
    building_owner = building_record['fields'].get('Owner')
    building_operator = building_record['fields'].get('RunBy')
    building_category = building_record['fields'].get('Category')
    building_name = building_record['fields'].get('Name', business_building_id)
    
    # Verify the building is a business
    if building_category != 'business':
        log.error(f"Building {business_building_id} is not a business (category: {building_category})")
        return False
    
    # Validate operation type and permissions
    if operation_type == 'delegate':
        # Only the current operator can delegate
        if building_operator != citizen:
            log.error(f"Citizen {citizen} is not the current operator of building {business_building_id}")
            return False
        if not new_operator_username:
            log.error(f"Missing newOperatorUsername for delegate operation")
            return False
    elif operation_type == 'request_management':
        # Anyone can request management, but we need to know the current operator
        if not current_operator_username:
            current_operator_username = building_operator
        if citizen == current_operator_username:
            log.error(f"Citizen {citizen} is already the operator of building {business_building_id}")
            return False
    elif operation_type == 'claim_management':
        # Only the owner can claim management
        if building_owner != citizen:
            log.error(f"Citizen {citizen} is not the owner of building {business_building_id}")
            return False
    else:
        log.error(f"Invalid operationType: {operation_type}")
        return False
    
    # Determine the target office building if not provided
    if not target_office_building_id:
        # Find the closest town_hall or courthouse
        office_types = ['town_hall', 'courthouse']
        office_formula = f"OR({{Type}}='town_hall', {{Type}}='courthouse')"
        office_buildings = tables['buildings'].all(formula=office_formula)
        
        if office_buildings:
            # Find the closest office to the citizen's current position
            closest_office = None
            min_distance = float('inf')
            
            for office in office_buildings:
                office_position_str = office['fields'].get('Position')
                if office_position_str:
                    try:
                        office_position = json.loads(office_position_str)
                        if current_position and office_position:
                            distance = _calculate_distance(current_position, office_position)
                            if distance < min_distance:
                                min_distance = distance
                                closest_office = office
                    except json.JSONDecodeError:
                        continue
            
            if closest_office:
                target_office_building_id = closest_office['fields'].get('BuildingId')
                log.info(f"Using closest office building: {target_office_building_id}")
    
    # If we're meeting the other party instead of going to an office
    meeting_party_username = None
    meeting_party_position = None
    
    if not target_office_building_id:
        if operation_type == 'delegate' and new_operator_username:
            meeting_party_username = new_operator_username
        elif operation_type == 'request_management' and current_operator_username:
            meeting_party_username = current_operator_username
        elif operation_type == 'claim_management' and building_operator and building_operator != citizen:
            meeting_party_username = building_operator
        
        if meeting_party_username:
            meeting_party_record = get_citizen_record(tables, meeting_party_username)
            if meeting_party_record:
                meeting_party_position_str = meeting_party_record['fields'].get('Position')
                if meeting_party_position_str:
                    try:
                        meeting_party_position = json.loads(meeting_party_position_str)
                    except json.JSONDecodeError:
                        meeting_party_position = None
    
    # Get building record for path calculation
    business_building_record = building_record
    
    # Calculate path to business
    path_to_business = find_path_between_buildings(None, business_building_record, current_position=current_position)
    if not path_to_business or not path_to_business.get('path'):
        log.error(f"Could not find path to business {business_building_id}")
        return False
    
    # Create activity IDs
    goto_business_activity_id = f"goto_business_for_manager_change_{_escape_airtable_value(business_building_id)}_{citizen}_{ts}"
    goto_office_activity_id = f"goto_office_for_manager_change_{citizen}_{ts}"
    finalize_change_activity_id = f"finalize_operator_change_{_escape_airtable_value(business_building_id)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel to business end date based on path duration
    business_duration_seconds = path_to_business.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    business_end_date = (now_utc + timedelta(seconds=business_duration_seconds)).isoformat()
    
    # Calculate path to office or meeting party
    path_to_destination = None
    destination_building_id = None
    destination_position = None
    
    if target_office_building_id:
        destination_building_id = target_office_building_id
        destination_building_record = get_building_record(tables, target_office_building_id)
        if destination_building_record:
            path_to_destination = find_path_between_buildings(business_building_record, destination_building_record)
    elif meeting_party_position:
        destination_position = meeting_party_position
        path_to_destination = find_path_between_buildings(business_building_record, None, target_position=meeting_party_position)
    
    if not path_to_destination or not path_to_destination.get('path'):
        log.error(f"Could not find path to destination (office or meeting party)")
        return False
    
    # Calculate travel to destination end date
    destination_duration_seconds = path_to_destination.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    destination_start_date = business_end_date
    destination_end_date = (datetime.fromisoformat(destination_start_date.replace('Z', '+00:00')) + 
                           timedelta(seconds=destination_duration_seconds)).isoformat()
    
    # Calculate finalization activity times (15 minutes)
    finalize_start_date = destination_end_date
    finalize_end_date = (datetime.fromisoformat(destination_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store details for the processor to use
    common_details = {
        "businessBuildingId": business_building_id,
        "newOperatorUsername": new_operator_username,
        "currentOperatorUsername": current_operator_username or building_operator,
        "ownerUsername": owner_username or building_owner,
        "reason": reason,
        "operationType": operation_type,
        "activityType": "change_business_manager"
    }
    
    # 1. Create goto_business activity
    goto_business_payload = {
        "ActivityId": goto_business_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": business_building_id,
        "Path": json.dumps(path_to_business.get('path', [])),
        "Details": json.dumps({
            **common_details,
            "nextStep": "goto_office_or_meeting"
        }),
        "Status": "created",
        "Title": f"Traveling to {building_name} for management change",
        "Description": f"Traveling to {building_name} to {_get_operation_description(operation_type, new_operator_username, current_operator_username)}",
        "Notes": f"First step of change_business_manager process. Will be followed by travel to office or meeting party.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": business_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    # 2. Create goto_office_or_meeting activity
    goto_destination_payload = {
        "ActivityId": goto_office_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": business_building_id,  # Starting from the business
        "ToBuilding": destination_building_id,  # May be None if meeting a party
        "Path": json.dumps(path_to_destination.get('path', [])),
        "Details": json.dumps({
            **common_details,
            "meetingPartyUsername": meeting_party_username,
            "nextStep": "finalize_operator_change"
        }),
        "Status": "created",
        "Title": f"Traveling to {destination_building_id or 'meet ' + meeting_party_username} for management change",
        "Description": f"Traveling to {destination_building_id or 'meet ' + meeting_party_username} to finalize the management change for {building_name}",
        "Notes": f"Second step of change_business_manager process. Will be followed by finalization of operator change.",
        "CreatedAt": travel_start_date,
        "StartDate": destination_start_date,
        "EndDate": destination_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    # 3. Create finalize_operator_change activity
    finalize_payload = {
        "ActivityId": finalize_change_activity_id,
        "Type": "finalize_operator_change",
        "Citizen": citizen,
        "FromBuilding": destination_building_id,  # May be None if meeting a party
        "ToBuilding": destination_building_id,    # May be None if meeting a party
        "Details": json.dumps(common_details),
        "Status": "created",
        "Title": f"Finalizing management change for {building_name}",
        "Description": f"Finalizing the {_get_operation_description(operation_type, new_operator_username, current_operator_username)} for {building_name}",
        "Notes": f"Final step of change_business_manager process. Will update building operator and process any fees.",
        "CreatedAt": travel_start_date,
        "StartDate": finalize_start_date,
        "EndDate": finalize_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }

    try:
        # Create all activities in sequence
        tables["activities"].create(goto_business_payload)
        tables["activities"].create(goto_destination_payload)
        tables["activities"].create(finalize_payload)
        
        log.info(f"Created complete change_business_manager activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location (business) activity {goto_business_activity_id}")
        log.info(f"  2. goto_location (office/meeting) activity {goto_office_activity_id}")
        log.info(f"  3. finalize_operator_change activity {finalize_change_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create change_business_manager activity chain: {e}")
        return False

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters

def _get_operation_description(operation_type, new_operator_username, current_operator_username):
    """Get a human-readable description of the operation."""
    if operation_type == 'delegate':
        return f"delegate management to {new_operator_username}"
    elif operation_type == 'request_management':
        return f"request management from {current_operator_username}"
    elif operation_type == 'claim_management':
        return "claim management as the owner"
    else:
        return "change management"
