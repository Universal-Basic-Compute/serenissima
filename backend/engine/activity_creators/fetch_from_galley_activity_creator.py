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
        now_utc = datetime.datetime.now(pytz.UTC)
        
        # Use timing from path_data if available
        start_date_iso = path_data_to_galley.get('timing', {}).get('startDate', now_utc.isoformat())
        end_date_iso = path_data_to_galley.get('timing', {}).get('endDate')
        
        if not end_date_iso: # Fallback if path_data has no timing
            travel_duration_default_hours = 1 
            end_time_utc = now_utc + datetime.timedelta(hours=travel_duration_default_hours)
            end_date_iso = end_time_utc.isoformat()
        
        path_json_str = json.dumps(path_data_to_galley.get('path', []))
        
        activity_id_str = f"fetch_galley_{citizen_custom_id}_{uuid.uuid4()}"
        
        # Notes should clearly indicate what is being fetched for which original contract
        notes = (f"🚚 Fetching **{amount_to_fetch:.2f}** of **{resource_id_to_fetch}** from galley **{galley_custom_id}** "
                 f"for original contract **{original_contract_custom_id}**.")

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_from_galley",
            "Citizen": citizen_username,
            "FromBuilding": galley_airtable_id, # Airtable Record ID of the galley
            "OriginalContractId": original_contract_custom_id, # Custom ID of the original contract
            "ResourceId": resource_id_to_fetch,
            "Amount": amount_to_fetch,
            "CreatedAt": now_utc.isoformat(),
            "StartDate": start_date_iso,
            "EndDate": end_date_iso,
            "Path": path_json_str,
            "Notes": notes,
            "Priority": 10 # High priority to clear the galley
        }
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'fetch_from_galley' activity: {activity['id']}")
            # Update citizen's UpdatedAt (optional, Airtable might do this)
            try:
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': now_utc.isoformat()})
            except Exception as e_update_citizen:
                log.warning(f"Could not update citizen {citizen_username} UpdatedAt: {e_update_citizen}")
            return activity
        else:
            log.error(f"Failed to create 'fetch_from_galley' activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating 'fetch_from_galley' activity for {citizen_username}: {e}")
        return None
