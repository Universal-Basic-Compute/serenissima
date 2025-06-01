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
    get_citizen_record
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Create the complete request_loan activity chain:
    1. A goto_location activity for travel to the financial institution or lender
    2. A submit_loan_application_form activity to process the loan request
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    amount = details.get('amount')
    purpose = details.get('purpose', 'Unspecified')
    collateral_details = details.get('collateralDetails', {})
    target_building_id = details.get('targetBuildingId')  # Optional specific financial institution
    lender_username = details.get('lenderUsername')  # Optional specific lender
    
    # Validate required parameters
    if not amount:
        log.error(f"Missing required details for request_loan: amount")
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
    
    # Determine the destination (financial institution or lender)
    destination_building_id = None
    destination_type = None
    
    # If a specific target building was provided, use it
    if target_building_id:
        target_building_record = get_building_record(tables, target_building_id)
        if target_building_record:
            building_type = target_building_record['fields'].get('Type')
            if building_type in ['broker_s_office', 'mint', 'bank']:
                destination_building_id = target_building_id
                destination_type = 'financial_institution'
                log.info(f"Using specified financial institution: {destination_building_id}")
            else:
                log.warning(f"Specified building {target_building_id} is not a financial institution. Will find alternative.")
    
    # If a specific lender was provided, use their location
    if not destination_building_id and lender_username:
        lender_record = get_citizen_record(tables, lender_username)
        if lender_record:
            lender_position_str = lender_record['fields'].get('Position')
            if lender_position_str:
                try:
                    lender_position = json.loads(lender_position_str)
                    destination_type = 'lender'
                    # We'll use the lender's position directly for pathfinding
                    log.info(f"Using lender {lender_username}'s position as destination")
                except json.JSONDecodeError:
                    log.error(f"Could not parse lender position: {lender_position_str}")
            else:
                log.warning(f"Lender {lender_username} has no position information")
        else:
            log.warning(f"Lender {lender_username} not found")
    
    # If no valid destination yet, find the nearest financial institution
    if not destination_building_id and destination_type != 'lender':
        financial_institutions_formula = "OR(Type='broker_s_office', Type='mint', Type='bank')"
        financial_institutions = tables['buildings'].all(formula=financial_institutions_formula)
        
        if financial_institutions:
            # Find the closest financial institution to the citizen's current position
            closest_institution = None
            min_distance = float('inf')
            
            for institution in financial_institutions:
                institution_position_str = institution['fields'].get('Position')
                if institution_position_str:
                    try:
                        institution_position = json.loads(institution_position_str)
                        if current_position and institution_position:
                            distance = _calculate_distance(current_position, institution_position)
                            if distance < min_distance:
                                min_distance = distance
                                closest_institution = institution
                    except json.JSONDecodeError:
                        continue
            
            if closest_institution:
                destination_building_id = closest_institution['fields'].get('BuildingId')
                destination_type = 'financial_institution'
                log.info(f"Using closest financial institution: {destination_building_id}")
    
    if not destination_building_id and destination_type != 'lender':
        log.error(f"Could not find a suitable financial institution for loan request")
        return False
    
    # Calculate path to destination
    path_data = None
    if destination_type == 'financial_institution':
        destination_building_record = get_building_record(tables, destination_building_id)
        if not destination_building_record:
            log.error(f"Could not find building record for {destination_building_id}")
            return False
        path_data = find_path_between_buildings(None, destination_building_record, current_position=current_position)
    elif destination_type == 'lender':
        # For lender, we need to create a path to their position
        if lender_position and current_position:
            # Use a simplified path directly to the lender's position
            path_data = {
                'path': [
                    {'lat': current_position['lat'], 'lng': current_position['lng']},
                    {'lat': lender_position['lat'], 'lng': lender_position['lng']}
                ],
                'timing': {'durationSeconds': 1200}  # Default 20 minutes for direct path
            }
    
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to destination")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_loan_request_{citizen}_{ts}"
    loan_request_activity_id = f"submit_loan_application_form_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate loan request activity times (15 minutes after arrival)
    loan_request_start_date = travel_end_date  # Start immediately after arrival
    loan_request_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store loan request details in the Details field for the processor to use
    details_json = json.dumps({
        "amount": amount,
        "purpose": purpose,
        "collateralDetails": collateral_details,
        "lenderUsername": lender_username
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": destination_building_id if destination_type == 'financial_institution' else None,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "amount": amount,
            "purpose": purpose,
            "collateralDetails": collateral_details,
            "lenderUsername": lender_username,
            "activityType": "request_loan",
            "nextStep": "submit_loan_application_form"
        }),
        "Status": "created",
        "Title": f"Traveling to request a loan of {amount} Ducats",
        "Description": f"Traveling to {'a financial institution' if destination_type == 'financial_institution' else f'meet {lender_username}'} to request a loan of {amount} Ducats for: {purpose}",
        "Notes": f"First step of request_loan process. Will be followed by submit_loan_application_form activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 20  # Medium-high priority for financial activities
    }
    
    # 2. Create submit_loan_application_form activity (to be executed after arrival)
    loan_request_payload = {
        "ActivityId": loan_request_activity_id,
        "Type": "submit_loan_application_form",
        "Citizen": citizen,
        "FromBuilding": destination_building_id if destination_type == 'financial_institution' else None,
        "ToBuilding": destination_building_id if destination_type == 'financial_institution' else None,
        "Details": details_json,
        "Status": "created",
        "Title": f"Requesting a loan of {amount} Ducats",
        "Description": f"Submitting a loan application for {amount} Ducats for: {purpose}",
        "Notes": f"Second step of request_loan process. Will process application fee and create loan record.",
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": loan_request_start_date,  # But starts after the goto activity ends
        "EndDate": loan_request_end_date,
        "Priority": 20  # Medium-high priority for financial activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(loan_request_payload)
        
        log.info(f"Created complete request_loan activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. submit_loan_application_form activity {loan_request_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create request_loan activity chain: {e}")
        return False

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
