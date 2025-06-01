import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Create a bid_on_land travel activity for the citizen."""
    land_id = details.get('landId')
    bid_amount = details.get('bidAmount')
    from_building = details.get('fromBuildingId')
    to_building = details.get('targetBuildingId')
    if not (land_id and bid_amount and from_building and to_building):
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    activity_id = f"bid_on_land_{_escape_airtable_value(land_id)}_{citizen}_{ts}"

    payload = {
        "ActivityId": activity_id,
        "Type": "bid_on_land",
        "Citizen": citizen,
        "FromBuilding": from_building,
        "ToBuilding": to_building,
        "Details": json.dumps({"landId": land_id, "bidAmount": bid_amount}),
        "Status": "created",
        "CreatedAt": datetime.utcnow().isoformat(),
        "StartDate": datetime.utcnow().isoformat(),
        "EndDate": datetime.utcnow().isoformat()  # arrival handled by processor
    }

    try:
        tables["activities"].create(payload)
        return True
    except Exception:
        return False
