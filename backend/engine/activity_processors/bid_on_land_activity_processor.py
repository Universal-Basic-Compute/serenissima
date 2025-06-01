import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_bid_on_land_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the bid_on_land chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at courthouse/town_hall, create submit_land_bid activity
    2. submit_land_bid - Create the actual building_bid contract
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for {activity_type}: {e}")
        return False
    
    # Handle goto_location activity (first step in chain)
    if activity_type == "goto_location" and details.get("activityType") == "bid_on_land":
        return _handle_arrival_at_official_location(tables, activity_record, details)
    
    # Handle submit_land_bid activity (second step in chain)
    elif activity_type == "submit_land_bid":
        return _create_land_bid_contract(tables, activity_record, details)
    
    # Handle legacy bid_on_land activity (for backward compatibility)
    elif activity_type == "bid_on_land":
        log.warning(f"Processing legacy bid_on_land activity. This format is deprecated.")
        land_id = details.get('landId')
        bid_amount = details.get('bidAmount')
        
        if not (citizen and land_id and bid_amount):
            log.error(f"Missing data for bid_on_land: citizen={citizen}, land_id={land_id}, bid_amount={bid_amount}")
            return False
            
        return _create_land_bid_contract_direct(tables, citizen, land_id, bid_amount)
    
    else:
        log.error(f"Unexpected activity type in bid_on_land processor: {activity_type}")
        return False

def _handle_arrival_at_official_location(
    tables: Dict[str, Any],
    arrival_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Handle citizen arrival at courthouse/town_hall.
    Create a submit_land_bid activity to represent the paperwork and official submission.
    """
    fields = arrival_activity.get('fields', {})
    citizen = fields.get('Citizen')
    to_building = fields.get('ToBuilding')  # courthouse/town_hall
    land_id = details.get('landId')
    bid_amount = details.get('bidAmount')
    
    if not (citizen and to_building and land_id and bid_amount):
        log.error(f"Missing data for creating submit_land_bid: citizen={citizen}, to_building={to_building}, land_id={land_id}, bid_amount={bid_amount}")
        return False
    
    # Create a short duration activity for the submission process
    now_utc = datetime.utcnow()
    start_date = now_utc.isoformat()
    # Submission takes 15 minutes
    end_date = (now_utc + timedelta(minutes=15)).isoformat()
    
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    submit_activity_id = f"submit_land_bid_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    
    submit_payload = {
        "ActivityId": submit_activity_id,
        "Type": "submit_land_bid",
        "Citizen": citizen,
        "FromBuilding": to_building,  # Citizen is already at the courthouse/town_hall
        "ToBuilding": to_building,    # Stays at the same location
        "Details": json.dumps({
            "landId": land_id,
            "bidAmount": bid_amount
        }),
        "Status": "created",
        "Title": f"Submitting bid on land {land_id}",
        "Description": f"Submitting a bid of {bid_amount} Ducats on land {land_id}",
        "Notes": f"Second step of bid_on_land process. Will create building_bid contract.",
        "CreatedAt": start_date,
        "StartDate": start_date,
        "EndDate": end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    
    try:
        tables["activities"].create(submit_payload)
        log.info(f"Created submit_land_bid activity {submit_activity_id} for citizen {citizen}")
        return True
    except Exception as e:
        log.error(f"Failed to create submit_land_bid activity: {e}")
        return False

def _create_land_bid_contract(
    tables: Dict[str, Any],
    submit_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Create the actual building_bid contract when the submit_land_bid activity is processed."""
    fields = submit_activity.get('fields', {})
    citizen = fields.get('Citizen')
    land_id = details.get('landId')
    bid_amount = details.get('bidAmount')
    
    if not (citizen and land_id and bid_amount):
        log.error(f"Missing data for creating contract: citizen={citizen}, land_id={land_id}, bid_amount={bid_amount}")
        return False
    
    return _create_land_bid_contract_direct(tables, citizen, land_id, bid_amount)

def _create_land_bid_contract_direct(
    tables: Dict[str, Any],
    citizen: str,
    land_id: str,
    bid_amount: float
) -> bool:
    """Create a building_bid contract for the land."""
    contract_id = f"bid_land_{_escape_airtable_value(land_id)}_{citizen}_{int(datetime.now(timezone.utc).timestamp())}"
    
    # Calculate a reasonable expiration date (7 days from now)
    end_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    
    contract_fields: Dict[str, Any] = {
        "ContractId": contract_id,
        "Type": "building_bid",
        "Buyer": citizen,
        "Asset": land_id,
        "AssetType": "land",
        "PricePerResource": bid_amount,
        "TargetAmount": 1,
        "Status": "active",
        "CreatedAt": datetime.utcnow().isoformat(),
        "EndAt": end_date,  # Bids expire after 7 days
        "Title": f"Bid on Land {land_id}",
        "Description": f"Formal bid of {bid_amount} Ducats for Land {land_id}"
    }

    try:
        tables["contracts"].create(contract_fields)
        log.info(f"Created building_bid contract {contract_id} for land {land_id} by {citizen}")
        
        # Could add a small fee payment here for bid registration
        # This would involve creating a transaction record
        
        return True
    except Exception as e:
        log.error(f"Failed to create building_bid contract {contract_id}: {e}")
        return False
