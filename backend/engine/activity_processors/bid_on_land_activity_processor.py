import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value

log = logging.getLogger(__name__)

def process_bid_on_land_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """Process a bid_on_land activity: create a building_bid contract upon arrival."""
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    try:
        details = json.loads(details_str) if details_str else {}
        land_id = details.get('landId')
        bid_amount = details.get('bidAmount')
    except Exception as e:
        log.error(f"Error parsing Details for bid_on_land: {e}")
        return False

    if not (citizen and land_id and bid_amount):
        log.error(f"Missing data for bid_on_land: citizen={citizen}, land_id={land_id}, bid_amount={bid_amount}")
        return False

    contract_id = f"bid_land_{_escape_airtable_value(land_id)}_{citizen}_{int(datetime.now(timezone.utc).timestamp())}"
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
    }

    try:
        tables["contracts"].create(contract_fields)
        log.info(f"Created building_bid contract {contract_id} for land {land_id} by {citizen}")
        return True
    except Exception as e:
        log.error(f"Failed to create building_bid contract {contract_id}: {e}")
        return False
