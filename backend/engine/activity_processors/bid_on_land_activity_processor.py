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
    1. goto_location - When citizen arrives at courthouse/town_hall (no action needed as submit_land_bid is already created)
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
        # No need to create the submit_land_bid activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the official location for bid on land {details.get('landId')}.")
        log.info(f"The submit_land_bid activity should already be scheduled to start after this activity.")
        return True
    
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

# The _handle_arrival_at_official_location function is no longer needed since
# we create both activities upfront in the activity creator

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
