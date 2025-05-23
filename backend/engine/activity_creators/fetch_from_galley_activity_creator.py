"""
Creator for 'fetch_from_galley' activities.
"""
import logging
import datetime
import time
import json
import uuid
import pytz 
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_airtable_id: str,
    citizen_custom_id: str,
    citizen_username: str,
    galley_airtable_id: str, # Airtable Record ID of the galley building
    galley_custom_id: str,   # Custom BuildingId of the galley (e.g. water_lat_lng)
    original_contract_custom_id: str, # Custom ContractId string of the original import contract
    resource_id_to_fetch: str,
    amount_to_fetch: float, # Amount for this specific part of the original contract
    path_data_to_galley: Dict # Path data from transport API to the galley
) -> Optional[Dict]:
    """Creates a fetch_from_galley activity."""
    log.info(f"Attempting to create 'fetch_from_galley' for {citizen_username} to galley {galley_custom_id} for contract {original_contract_custom_id}")

    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.datetime.now(VENICE_TIMEZONE)
        
        # Use timing from path_data if available, these should also be Venice time ISO strings
        start_date_iso = path_data_to_galley.get('timing', {}).get('startDate', now_venice.isoformat())
        end_date_iso = path_data_to_galley.get('timing', {}).get('endDate')
        
        if not end_date_iso: # Fallback if path_data has no timing
            travel_duration_default_hours = 1 
            end_time_calc = now_venice + datetime.timedelta(hours=travel_duration_default_hours)
            end_date_iso = end_time_calc.isoformat()
        
        path_json_str = json.dumps(path_data_to_galley.get('path', []))
        
        activity_id_str = f"fetch_galley_{citizen_custom_id}_{uuid.uuid4()}"
        
        # Notes should clearly indicate what is being fetched for which original contract
        notes = (f"🚚 Fetching **{amount_to_fetch:.2f}** of **{resource_id_to_fetch}** from galley **{galley_custom_id}** "
                 f"for original contract **{original_contract_custom_id}**.")

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_from_galley",
            "Citizen": citizen_username,
            "FromBuilding": galley_custom_id, # Use custom BuildingId of the galley
            "ContractId": original_contract_custom_id, # Store original contract's custom ID in ContractId field
            "Resources": json.dumps([{"ResourceId": resource_id_to_fetch, "Amount": amount_to_fetch}]), # Store as JSON array
            "CreatedAt": now_venice.isoformat(),
            "StartDate": start_date_iso, # Expected to be Venice time ISO string
            "EndDate": end_date_iso,     # Expected to be Venice time ISO string
            "Path": path_json_str,
            "Notes": notes,
            "Priority": 10, # High priority to clear the galley
            "Status": "created"
        }
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'fetch_from_galley' activity: {activity['id']}")
            # Citizen's UpdatedAt is automatically handled by Airtable when other fields are updated.
            return activity
        else:
            log.error(f"Failed to create 'fetch_from_galley' activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating 'fetch_from_galley' activity for {citizen_username}: {e}")
        return None
