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
    Create the complete offer_loan activity chain:
    1. A goto_location activity for travel to the financial institution or notary office
    2. A register_loan_offer_terms activity to process the loan offer
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    amount = details.get('amount')
    interest_rate = details.get('interestRate')
    term_days = details.get('termDays')
    target_borrower_username = details.get('targetBorrowerUsername')  # Optional specific borrower
    target_office_building_id = details.get('targetOfficeBuildingId')  # Optional specific financial institution
    
    # Validate required parameters
    if not (amount and interest_rate is not None and term_days is not None):
        log.error(f"Missing required details for offer_loan: amount, interestRate, or termDays")
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
    
    # Determine the destination (financial institution or notary office)
    destination_building_id = None
    
    # If a specific target building was provided, use it
    if target_office_building_id:
        target_building_record = get_building_record(tables, target_office_building_id)
        if target_building_record:
            building_type = target_building_record['fields'].get('Type')
            if building_type in ['broker_s_office', 'mint', 'courthouse', 'town_hall', 'bank']:
                destination_building_id = target_office_building_id
                log.info(f"Using specified financial/notary institution: {destination_building_id}")
            else:
                log.warning(f"Specified building {target_office_building_id} is not a financial/notary institution. Will find alternative.")
    
    # If no valid destination yet, find the nearest financial institution or notary office
    if not destination_building_id:
        financial_institutions_formula = "OR(Type='broker_s_office', Type='mint', Type='courthouse', Type='town_hall', Type='bank')"
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
                log.info(f"Using closest financial/notary institution: {destination_building_id}")
    
    if not destination_building_id:
        log.error(f"Could not find a suitable financial/notary institution for loan offer")
        return False
    
    # Get building record for path calculation
    destination_building_record = get_building_record(tables, destination_building_id)
    
    if not destination_building_record:
        log.error(f"Could not find building record for {destination_building_id}")
        return False
    
    # Calculate path to destination
    path_data = find_path_between_buildings(None, destination_building_record, current_position=current_position)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to destination")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_loan_offer_{citizen}_{ts}"
    loan_offer_activity_id = f"register_loan_offer_terms_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate loan offer activity times (15 minutes after arrival)
    loan_offer_start_date = travel_end_date  # Start immediately after arrival
    loan_offer_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store loan offer details in the Details field for the processor to use
    details_json = json.dumps({
        "amount": amount,
        "interestRate": interest_rate,
        "termDays": term_days,
        "targetBorrowerUsername": target_borrower_username
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
            "amount": amount,
            "interestRate": interest_rate,
            "termDays": term_days,
            "targetBorrowerUsername": target_borrower_username,
            "activityType": "offer_loan",
            "nextStep": "register_loan_offer_terms"
        }),
        "Status": "created",
        "Title": f"Traveling to register a loan offer of {amount} Ducats",
        "Description": f"Traveling to {destination_building_record['fields'].get('Name', destination_building_id)} to register a loan offer of {amount} Ducats at {interest_rate*100}% interest for {term_days} days",
        "Notes": f"First step of offer_loan process. Will be followed by register_loan_offer_terms activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 20  # Medium-high priority for financial activities
    }
    
    # 2. Create register_loan_offer_terms activity (to be executed after arrival)
    loan_offer_payload = {
        "ActivityId": loan_offer_activity_id,
        "Type": "register_loan_offer_terms",
        "Citizen": citizen,
        "FromBuilding": destination_building_id,
        "ToBuilding": destination_building_id,
        "Details": details_json,
        "Status": "created",
        "Title": f"Registering a loan offer of {amount} Ducats",
        "Description": f"Registering a loan offer of {amount} Ducats at {interest_rate*100}% interest for {term_days} days" + (f" for {target_borrower_username}" if target_borrower_username else ""),
        "Notes": f"Second step of offer_loan process. Will process registration fee and create loan offer record.",
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": loan_offer_start_date,  # But starts after the goto activity ends
        "EndDate": loan_offer_end_date,
        "Priority": 20  # Medium-high priority for financial activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(loan_offer_payload)
        
        log.info(f"Created complete offer_loan activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. register_loan_offer_terms activity {loan_offer_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create offer_loan activity chain: {e}")
        return False

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
