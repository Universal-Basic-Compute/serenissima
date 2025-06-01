"""
Creator for 'return_to_workplace' activities.
"""
import logging
import datetime
import json
import uuid
import pytz
from typing import Dict, Optional, Any, List

from backend.engine.utils.activity_helpers import get_building_record, get_citizen_inventory_details

log = logging.getLogger(__name__)

DEFAULT_PRIORITY_RETURN_TO_WORKPLACE = 7 # Same as fetch_from_storage, as it's part of a sequence

def try_create(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    workplace_custom_id: str, # The original workplace to return to
    path_data: Dict,          # Path data from current location (source of goods) to workplace
    resources_carried_json: str, # JSON string of resources the citizen is carrying
    original_activity_type_for_notes: str, # e.g., "fetch_resource", "fetch_from_storage"
    original_contract_id_for_notes: Optional[str], # If the fetch was for a contract
    current_time_utc: datetime.datetime,
    start_time_utc_iso: Optional[str] = None
) -> Optional[Dict]:
    """Creates a 'return_to_workplace' activity."""
    log.info(f"Attempting to create 'return_to_workplace' for {citizen_username} to {workplace_custom_id} with explicit start: {start_time_utc_iso}")

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
            else:
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(hours=1)).isoformat() # Default 1 hour
        elif path_data and path_data.get('timing', {}).get('startDate') and path_data.get('timing', {}).get('endDate'):
            effective_start_date_iso = path_data['timing']['startDate']
            effective_end_date_iso = path_data['timing']['endDate']
        else:
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(hours=1)).isoformat() # Default 1 hour

        path_json_str = json.dumps(path_data.get('path', []))
        transporter = path_data.get('transporter')
        activity_id_str = f"return_wp_{citizen_custom_id}_{uuid.uuid4()}"

        # FromBuilding is the current location (source of goods), ToBuilding is the workplace
        # The path_data should reflect this.
        # For simplicity, FromBuilding can be omitted if path_data is comprehensive.
        # Let's assume path_data starts from the citizen's current location (which is the source of goods).
        
        workplace_record = get_building_record(tables, workplace_custom_id)
        workplace_name_desc = workplace_record['fields'].get('Name', workplace_record['fields'].get('Type', workplace_custom_id)) if workplace_record else workplace_custom_id

        notes = f"↪️ Returning to workplace {workplace_name_desc} after {original_activity_type_for_notes}."
        if original_contract_id_for_notes:
            notes += f" (Original Contract: {original_contract_id_for_notes})."
        
        # Store what the citizen is carrying in the 'Resources' field of this activity
        # This helps the processor know what to deposit.
        # resources_carried_json is already a JSON string.

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "return_to_workplace",
            "Citizen": citizen_username,
            "ToBuilding": workplace_custom_id,
            "Path": path_json_str,
            "Transporter": transporter,
            "Resources": resources_carried_json, # Resources being transported
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Status": "created",
            "Priority": DEFAULT_PRIORITY_RETURN_TO_WORKPLACE,
            "Notes": notes,
            "Description": f"Returning to workplace: {workplace_name_desc}"
        }
        
        # If the original activity had details for a subsequent chained action (e.g. production recipe)
        # we might need to carry those forward in the Notes or a Details field of this return_to_workplace activity.
        # For now, the processor for return_to_workplace will need to know to potentially trigger production.

        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created 'return_to_workplace' activity: {created_activity['id']}")
            return created_activity
        else:
            log.error("Failed to create 'return_to_workplace' activity in Airtable.")
            return None

    except Exception as e:
        log.error(f"Error creating 'return_to_workplace' activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
