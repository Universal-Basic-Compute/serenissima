"""
Creator for 'deliver_to_storage' activities.
Citizen takes resources from their business building to a contracted storage facility.
"""
import logging
import datetime
import json
import pytz
import uuid
from typing import Dict, Optional, Any, List

from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE

log = logging.getLogger(__name__)

DEFAULT_PRIORITY_DELIVER_TO_STORAGE = 3 # Low priority

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],         # Citizen performing the delivery
    from_building_record: Optional[Dict[str, Any]],  # Business building (source of goods) OR None if from inventory
    to_building_record: Dict[str, Any],    # Storage facility (destination)
    resources_to_deliver: List[Dict[str, Any]], # [{"ResourceId": "wood", "Amount": 10}, ...]
    storage_query_contract_id: Optional[str], # Custom ContractId string of the storage_query contract, now optional
    path_data: Dict,                       # Path from current location to to_building
    current_time_utc: datetime.datetime,   # Added current_time_utc
    source_is_citizen_inventory: bool = False, # New flag
    intended_owner_username_for_storage: Optional[str] = None, # New: For specifying final owner
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """
    Creates a 'deliver_to_storage' activity.
    If source_is_citizen_inventory is True, from_building_record can be None,
    and resources are taken from the citizen's inventory.
    Otherwise, resources are taken from from_building_record.
    """

    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    
    # from_building_custom_id is only required if not sourcing from inventory
    from_building_custom_id = None
    if not source_is_citizen_inventory:
        if not from_building_record:
            log.error("from_building_record is required when source_is_citizen_inventory is False.")
            return None
        from_building_custom_id = from_building_record['fields'].get('BuildingId')
        if not from_building_custom_id:
            log.error("from_building_record is missing BuildingId.")
            return None
            
    to_building_custom_id = to_building_record['fields'].get('BuildingId')

    # Validate required fields based on source
    base_required_fields = [citizen_custom_id, citizen_username, to_building_custom_id, resources_to_deliver, path_data]
    if source_is_citizen_inventory:
        # storage_query_contract_id is optional for personal deposits to own galley
        if not all(base_required_fields): # storage_query_contract_id removed from this check
            log.error(f"Missing crucial data for creating deliver_to_storage (from inventory) activity. Base fields check: {all(base_required_fields)}")
            return None
        log_info_source = "citizen inventory"
    else: # Sourcing from a building
        # from_building_custom_id is required, storage_query_contract_id is also expected for business-to-storage
        if not all(base_required_fields + [from_building_custom_id, storage_query_contract_id]):
            log.error(f"Missing crucial data for creating deliver_to_storage (from building) activity. All fields check: {all(base_required_fields + [from_building_custom_id, storage_query_contract_id])}")
            return None
        log_info_source = from_building_custom_id

    log.info(f"Attempting to create 'deliver_to_storage' for {citizen_username} from {log_info_source} to {to_building_custom_id} (Contract: {storage_query_contract_id or 'N/A'}) with explicit start: {start_time_utc_iso}.")

    try:
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
        transporter = path_data.get('transporter') # Get transporter from path_data

        resources_json = json.dumps(resources_to_deliver)
        resource_summary = ", ".join([f"{r['Amount']:.0f} {r['ResourceId']}" for r in resources_to_deliver])
        
        activity_id_str = f"deliver_storage_{citizen_custom_id}_{uuid.uuid4()}"

        notes_from_location = from_building_custom_id if not source_is_citizen_inventory else "inventory"
        contract_note_part = f"(Contract: {storage_query_contract_id})" if storage_query_contract_id else "(Personal Deposit)"
        base_notes = f"🚚 Delivering {resource_summary} from {notes_from_location} to storage at {to_building_custom_id} {contract_note_part}."

        details_payload_dict = {}
        if source_is_citizen_inventory: # This key is used by the processor to know where to decrement from
            details_payload_dict["source_is_citizen_inventory"] = True
        if intended_owner_username_for_storage: # This key is used by the processor to set final ownership
            details_payload_dict["intendedOwnerForStorage"] = intended_owner_username_for_storage
        
        final_notes = base_notes
        if details_payload_dict: 
            details_json_str = json.dumps(details_payload_dict)
            final_notes = f"{base_notes}\nDetailsJSON: {details_json_str}".strip()


        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "deliver_to_storage",
            "Citizen": citizen_username,
            "FromBuilding": from_building_custom_id, 
            "ToBuilding": to_building_custom_id,
            "ContractId": storage_query_contract_id, 
            "Resources": resources_json, 
            "Path": path_points_json,
            "Transporter": transporter,
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Status": "created",
            "Priority": DEFAULT_PRIORITY_DELIVER_TO_STORAGE,
            "Notes": final_notes, 
        }
        to_bldg_name = to_building_record['fields'].get('Name', to_building_record['fields'].get('Type', to_building_custom_id))
        activity_payload["Description"] = f"Delivering {resource_summary} to storage at {to_bldg_name}"

        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created 'deliver_to_storage' activity: {created_activity['id']}")
            return created_activity
        else:
            log.error("Failed to create 'deliver_to_storage' activity in Airtable.")
            return None

    except Exception as e:
        log.error(f"Error creating 'deliver_to_storage' activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
