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
    path_data_to_galley: Dict, # Path data from transport API to the galley
    current_time_utc: datetime.datetime, # Added current_time_utc
    resource_defs: Dict[str, Any] # Added resource_defs
    # tables: Dict[str, Any] # Removed duplicate tables argument
) -> Optional[Dict]:
    """Creates a fetch_from_galley activity."""
    log.info(f"Attempting to create 'fetch_from_galley' for {citizen_username} to galley {galley_custom_id} for contract {original_contract_custom_id}")

    try:
        # from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
        
        start_date_iso_to_use = path_data_to_galley.get('timing', {}).get('startDate', current_time_utc.isoformat())
        end_date_iso_to_use = path_data_to_galley.get('timing', {}).get('endDate')
        
        if not end_date_iso_to_use: 
            travel_duration_default_hours = 1 
            start_datetime_obj_for_calc = datetime.datetime.fromisoformat(start_date_iso_to_use.replace("Z", "+00:00")) if isinstance(start_date_iso_to_use, str) else start_date_iso_to_use
            if start_datetime_obj_for_calc.tzinfo is None: # Ensure timezone aware
                 start_datetime_obj_for_calc = pytz.UTC.localize(start_datetime_obj_for_calc)
            end_time_calc = start_datetime_obj_for_calc + datetime.timedelta(hours=travel_duration_default_hours)
            end_date_iso_to_use = end_time_calc.isoformat()
        
        path_json_str = json.dumps(path_data_to_galley.get('path', []))
        
        activity_id_str = f"fetch_galley_{citizen_custom_id}_{uuid.uuid4()}"
        
        # Notes should clearly indicate what is being fetched for which original contract
        notes = (f"🚚 Fetching **{amount_to_fetch:.2f}** of **{resource_id_to_fetch}** from galley **{galley_custom_id}** "
                 f"for original contract **{original_contract_custom_id}**.")

        transporter = path_data_to_galley.get('transporter') # Get transporter from path_data

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_from_galley",
            "Citizen": citizen_username,
            "FromBuilding": galley_custom_id, # Use custom BuildingId of the galley
            "ContractId": original_contract_custom_id, # Store original contract's custom ID in ContractId field
            "Resources": json.dumps([{"ResourceId": resource_id_to_fetch, "Amount": amount_to_fetch}]), # Store as JSON array
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": start_date_iso_to_use,      # Use determined start date
            "EndDate": end_date_iso_to_use,          # Use determined end date
            "Path": path_json_str,
            "Transporter": transporter, # Add Transporter field
            "Notes": notes,
        }
        resource_name = resource_defs.get(resource_id_to_fetch, {}).get('name', resource_id_to_fetch)
        # Galley name might just be its ID, or we can try to fetch its record if it has a 'Name' field
        # For now, using the ID is fine as galleys are temporary.
        activity_payload["Description"] = f"Fetching {amount_to_fetch:.2f} {resource_name} from galley {galley_custom_id}"
        activity_payload["Priority"] = 10 # High priority to clear the galley
        activity_payload["Status"] = "created"
        
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
