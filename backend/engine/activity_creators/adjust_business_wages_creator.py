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
    Create the complete adjust_business_wages activity chain:
    1. A goto_location activity for travel to the business
    2. An update_wage_ledger activity to register the change
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    business_building_id = details.get('businessBuildingId')
    new_wage_amount = details.get('newWageAmount')
    strategy = details.get('strategy', 'standard')  # Optional strategy parameter
    
    # Validate required parameters
    if not (business_building_id and new_wage_amount is not None):
        log.error(f"Missing required details for adjust_business_wages: businessBuildingId or newWageAmount")
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
    
    # Verify the citizen operates the business
    building_formula = f"{{BuildingId}}='{_escape_airtable_value(business_building_id)}'"
    building_records = tables['buildings'].all(formula=building_formula, max_records=1)
    
    if not building_records:
        log.error(f"Building {business_building_id} not found")
        return False
    
    building_record = building_records[0]
    building_operator = building_record['fields'].get('RunBy')
    building_category = building_record['fields'].get('Category')
    
    if building_operator != citizen:
        log.error(f"Citizen {citizen} does not operate building {business_building_id}")
        return False
    
    if building_category != 'business':
        log.error(f"Building {business_building_id} is not a business (category: {building_category})")
        return False
    
    # Get building record for path calculation
    destination_building_record = building_record
    
    # Calculate path to destination
    path_data = find_path_between_buildings(None, destination_building_record, current_position=current_position)
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to {business_building_id}")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_wage_adjustment_{_escape_airtable_value(business_building_id)}_{citizen}_{ts}"
    adjustment_activity_id = f"update_wage_ledger_{_escape_airtable_value(business_building_id)}_{citizen}_{ts}"
    
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
        "businessBuildingId": business_building_id,
        "newWageAmount": new_wage_amount,
        "strategy": strategy
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": business_building_id,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "businessBuildingId": business_building_id,
            "newWageAmount": new_wage_amount,
            "strategy": strategy,
            "activityType": "adjust_business_wages",
            "nextStep": "update_wage_ledger"
        }),
        "Status": "created",
        "Title": f"Traveling to adjust wages for business {business_building_id}",
        "Description": f"Traveling to {destination_building_record['fields'].get('Name', business_building_id)} to adjust the wages to {new_wage_amount} Ducats",
        "Notes": f"First step of adjust_business_wages process. Will be followed by update_wage_ledger activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    # 2. Create update_wage_ledger activity (to be executed after arrival)
    adjustment_payload = {
        "ActivityId": adjustment_activity_id,
        "Type": "update_wage_ledger",
        "Citizen": citizen,
        "FromBuilding": business_building_id,  # Citizen is already at the destination
        "ToBuilding": business_building_id,    # Stays at the same location
        "Details": details_json,
        "Status": "created",
        "Title": f"Adjusting wages for business {business_building_id}",
        "Description": f"Updating the wage ledger to adjust wages to {new_wage_amount} Ducats",
        "Notes": f"Second step of adjust_business_wages process. Will update business wages.",
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": adjustment_start_date,  # But starts after the goto activity ends
        "EndDate": adjustment_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(adjustment_payload)
        
        log.info(f"Created complete adjust_business_wages activity chain for citizen {citizen}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. update_wage_ledger activity {adjustment_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create adjust_business_wages activity chain: {e}")
        return False
