"""
Creator for 'fetch_from_storage' activities.
Citizen fetches resources they own from a storage facility to their business/workplace.
"""
import logging
import datetime
import json
import pytz
import uuid
from typing import Dict, Optional, Any, List

from backend.engine.utils.activity_helpers import (
    VENICE_TIMEZONE,
    get_citizen_current_load,
    get_citizen_effective_carry_capacity # Already imported, ensure it's used
)

log = logging.getLogger(__name__)

DEFAULT_PRIORITY_FETCH_FROM_STORAGE = 7 # Higher than general fetch_resource

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],         # Citizen performing the fetch
    from_building_record: Dict[str, Any],  # Storage facility (source of goods)
    to_building_record: Dict[str, Any],    # Business/workplace (destination)
    resources_to_fetch: List[Dict[str, Any]], # [{"ResourceId": "wood", "Amount": 10}, ...]
    storage_query_contract_custom_id: str, # Custom ContractId string of the storage_query contract
    path_data: Dict,                       # Path from from_building (storage) to to_building (workplace)
    current_time_utc: datetime.datetime,   # Added current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a 'fetch_from_storage' activity."""

    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')

    from_building_custom_id = from_building_record['fields'].get('BuildingId')
    to_building_custom_id = to_building_record['fields'].get('BuildingId')

    if not all([citizen_custom_id, citizen_username, from_building_custom_id, to_building_custom_id,
                resources_to_fetch, storage_query_contract_custom_id, path_data]):
        log.error("Missing crucial data for creating fetch_from_storage activity.")
        return None

    log.info(f"Attempting to create 'fetch_from_storage' for {citizen_username} from {from_building_custom_id} to {to_building_custom_id} for contract {storage_query_contract_custom_id} with explicit start: {start_time_utc_iso}.")

    try:
        # Calculate current load and adjust resources_to_fetch
        current_load = get_citizen_current_load(tables, citizen_username)
        # citizen_record is passed, so get_citizen_effective_carry_capacity can use it directly
        citizen_max_capacity = get_citizen_effective_carry_capacity(citizen_record) 
        remaining_capacity = citizen_max_capacity - current_load
        
        adjusted_resources_to_fetch = []
        total_amount_adjusted = 0.0

        if not resources_to_fetch: # Should not happen if called correctly
            log.warning(f"resources_to_fetch is empty for {citizen_username}. Cannot create fetch_from_storage.")
            return None

        # Assuming resources_to_fetch contains a list of dicts, e.g. [{"ResourceId": "X", "Amount": Y}]
        # For simplicity, if multiple items, we'll try to fit them proportionally or take the first ones.
        # Current logic in citizen_general_activities prepares a single resource item in resources_to_fetch.
        for r_item in resources_to_fetch:
            original_amount = float(r_item.get("Amount", 0))
            if original_amount <= 0:
                continue

            amount_can_take_this_item = min(original_amount, remaining_capacity - total_amount_adjusted)
            amount_can_take_this_item = float(f"{amount_can_take_this_item:.4f}") # Ensure precision

            if amount_can_take_this_item >= 0.01: # Minimum practical amount
                adjusted_resources_to_fetch.append({
                    "ResourceId": r_item.get("ResourceId"),
                    "Amount": amount_can_take_this_item
                })
                total_amount_adjusted += amount_can_take_this_item
            else:
                log.info(f"Not enough remaining capacity ({remaining_capacity - total_amount_adjusted:.2f}) for item {r_item.get('ResourceId')} (requested {original_amount:.2f}) for {citizen_username}.")
                # If it's the only item and we can't take any, the activity won't be useful.
                # If multiple items, this one is skipped.

        if not adjusted_resources_to_fetch:
            log.warning(f"Citizen {citizen_username} has no remaining carry capacity ({remaining_capacity:.2f}) or adjusted amounts are too small. Cannot create fetch_from_storage activity.")
            return None
        
        final_resources_to_fetch_list = adjusted_resources_to_fetch
        log.info(f"Adjusted resources for {citizen_username} due to carry capacity: {final_resources_to_fetch_list}. Remaining capacity was {remaining_capacity:.2f}.")

        effective_start_date_iso: str
        effective_end_date_iso: str

        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
            if path_data and path_data.get('timing', {}).get('durationSeconds') is not None:
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                duration_seconds = path_data['timing']['durationSeconds']
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(seconds=duration_seconds)).isoformat()
            else: # Default duration if no path data or duration in path data
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(hours=1)).isoformat() # Default 1 hour
        elif path_data and path_data.get('timing', {}).get('startDate') and path_data.get('timing', {}).get('endDate'):
            effective_start_date_iso = path_data['timing']['startDate']
            effective_end_date_iso = path_data['timing']['endDate']
        else: # Fallback to current_time_utc and default duration
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(hours=1)).isoformat() # Default 1 hour

        path_points_json = json.dumps(path_data.get('path', []))
        transporter = path_data.get('transporter')

        resources_json = json.dumps(final_resources_to_fetch_list) # Use adjusted list
        resource_summary = ", ".join([f"{r['Amount']:.0f} {r['ResourceId']}" for r in final_resources_to_fetch_list]) # Use adjusted list
        
        activity_id_str = f"fetch_storage_{citizen_custom_id}_{uuid.uuid4()}"

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_from_storage",
            "Citizen": citizen_username,
            "FromBuilding": from_building_custom_id, # Storage facility
            "ToBuilding": to_building_custom_id,     # Workplace
            "ContractId": storage_query_contract_custom_id, # Use custom ContractId string
            "Resources": resources_json, 
            "Path": path_points_json,
            "Transporter": transporter,
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Status": "created",
            "Priority": DEFAULT_PRIORITY_FETCH_FROM_STORAGE,
            "Notes": f"📦 Fetching {resource_summary} from storage at {from_building_custom_id} to {to_building_custom_id} (Contract: {storage_query_contract_custom_id}).",
        }
        from_bldg_name = from_building_record['fields'].get('Name', from_building_record['fields'].get('Type', from_building_custom_id))
        activity_payload["Description"] = f"Fetching {resource_summary} from storage {from_bldg_name}"

        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created 'fetch_from_storage' activity: {created_activity['id']}")
            return created_activity
        else:
            log.error("Failed to create 'fetch_from_storage' activity in Airtable.")
            return None

    except Exception as e:
        log.error(f"Error creating 'fetch_from_storage' activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
