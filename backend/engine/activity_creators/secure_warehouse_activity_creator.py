"""
Creator for 'secure_warehouse' activities.
"""
import logging
import datetime
import json
import uuid
import pytz # Added import for pytz
from typing import Dict, Optional, Any

# Assuming VENICE_TIMEZONE is available via an import if not passed directly
from backend.engine.utils.activity_helpers import get_building_record # Import helper

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_record_id: str, # Not directly used in payload but good for consistency
    warehouse_building_custom_id: str,
    current_time_utc: datetime.datetime, # Changed from now_venice_dt to current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a 'secure_warehouse' activity for one hour."""
    log.info(f"Attempting to create 'secure_warehouse' for {citizen_username} at {warehouse_building_custom_id} with explicit start: {start_time_utc_iso}")

    try:
        activity_id_str = f"secure_wh_{citizen_custom_id}_{uuid.uuid4()}"
        
        effective_start_dt: datetime.datetime
        if start_time_utc_iso:
            effective_start_dt = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if effective_start_dt.tzinfo is None: effective_start_dt = pytz.UTC.localize(effective_start_dt)
        else:
            effective_start_dt = current_time_utc
        
        effective_start_date_iso = effective_start_dt.isoformat()
        effective_end_date_iso = (effective_start_dt + datetime.timedelta(hours=1)).isoformat()

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "secure_warehouse",
            "Citizen": citizen_username,
            "FromBuilding": warehouse_building_custom_id, 
            "ToBuilding": warehouse_building_custom_id,   
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Status": "created",
            "Priority": 5, 
            "Notes": f"🛡️ Securing warehouse {warehouse_building_custom_id}.",
        }
        warehouse_record = get_building_record(tables, warehouse_building_custom_id)
        warehouse_name_desc = warehouse_record['fields'].get('Name', warehouse_record['fields'].get('Type', warehouse_building_custom_id)) if warehouse_record else warehouse_building_custom_id
        activity_payload["Description"] = f"Securing warehouse {warehouse_name_desc}"
            # No Path, ContractId, Resources, ResourceId, Amount, TransportMode needed
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'secure_warehouse' activity: {activity['id']}")
            return activity
        else:
            log.error(f"Failed to create 'secure_warehouse' activity for {citizen_username} at {warehouse_building_custom_id}")
            return None
    except Exception as e:
        log.error(f"Error creating 'secure_warehouse' activity for {citizen_username}: {e}")
        return None
