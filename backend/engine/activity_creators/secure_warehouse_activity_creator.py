"""
Creator for 'secure_warehouse' activities.
"""
import logging
import datetime
import json
import uuid
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
    current_time_utc: datetime.datetime # Changed from now_venice_dt to current_time_utc
) -> Optional[Dict]:
    """Creates a 'secure_warehouse' activity for one hour."""
    log.info(f"Attempting to create 'secure_warehouse' for {citizen_username} at {warehouse_building_custom_id}")

    try:
        activity_id_str = f"secure_wh_{citizen_custom_id}_{uuid.uuid4()}"
        
        start_date_iso_to_use = current_time_utc.isoformat()
        end_date_iso_to_use = (current_time_utc + datetime.timedelta(hours=1)).isoformat()

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "secure_warehouse",
            "Citizen": citizen_username,
            "FromBuilding": warehouse_building_custom_id, # Citizen is at the warehouse
            "ToBuilding": warehouse_building_custom_id,   # Stays at the warehouse
            "CreatedAt": start_date_iso_to_use, # Use current_time_utc
            "StartDate": start_date_iso_to_use, # Use current_time_utc
            "EndDate": end_date_iso_to_use,
            "Status": "created",
            "Priority": 5, # Default priority
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
