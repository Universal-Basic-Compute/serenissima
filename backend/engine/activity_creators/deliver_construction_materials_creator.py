"""
Creator for 'deliver_construction_materials' activities.
"""
import logging
import datetime
import time
import pytz
import json
import uuid
from typing import Dict, Optional, Any, List

log = logging.getLogger(__name__)

def try_create_deliver_construction_materials_activity(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],      # Citizen performing the delivery
    from_building_record: Dict[str, Any], # Workshop (source of materials)
    to_building_record: Dict[str, Any],   # Construction site (destination)
    resources_to_deliver: List[Dict[str, Any]], # [{"type": "wood", "amount": 10}, ...]
    contract_custom_id: str,             # Custom ContractId string of the construction_project contract
    path_data: Dict,                      # Path from citizen's current location to construction site
    current_time_utc: datetime.datetime,  # Added current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """
    Creates a 'deliver_construction_materials' activity.
    The citizen is assumed to be at the from_building (workshop) or their current location if path_data starts from there.
    The path_data should lead to the to_building (construction site).
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_id = citizen_record['id']

    from_building_custom_id = from_building_record['fields'].get('BuildingId')
    to_building_custom_id = to_building_record['fields'].get('BuildingId')

    # Verify the citizen is the occupant of the workshop (FromBuilding)
    workshop_occupant_username = from_building_record['fields'].get('Occupant')
    if workshop_occupant_username != citizen_username:
        log.warning(f"Citizen {citizen_username} is not the occupant of the workshop {from_building_custom_id} (Actual Occupant: {workshop_occupant_username}). "
                    "Cannot create deliver_construction_materials activity.")
        return None

    if not all([citizen_custom_id, citizen_username, from_building_custom_id, to_building_custom_id, resources_to_deliver, contract_custom_id, path_data]):
        log.error("Missing crucial data for creating deliver_construction_materials activity.")
        return None

    log.info(f"Attempting to create deliver_construction_materials for {citizen_username} from {from_building_custom_id} to {to_building_custom_id} for contract {contract_custom_id}.")

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
        transport_mode = "walk" # Default, can be enhanced from path_data if available
        if isinstance(path_data.get('path'), list):
            for point in path_data['path']:
                if isinstance(point, dict) and point.get('transportMode') == 'gondola':
                    transport_mode = 'gondola'
                    break
        
        resources_json = json.dumps(resources_to_deliver)
        resource_summary = ", ".join([f"{r['amount']:.0f} {r['type']}" for r in resources_to_deliver])

        activity_payload = {
            "ActivityId": f"deliver_constr_mat_{citizen_custom_id}_{uuid.uuid4()}",
            "Type": "deliver_construction_materials",
            "Citizen": citizen_username,
            "FromBuilding": from_building_custom_id, # Workshop
            "ToBuilding": to_building_custom_id,     # Construction site
            "ContractId": contract_custom_id,         # Custom ContractId string
            "ResourcesToDeliver": resources_json,     # Specific field for these resources
            "TransportMode": transport_mode,
            "Path": path_points_json,
            "Transporter": path_data.get('transporter'), 
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Status": "created",
            "Notes": f"🚚 Delivering construction materials ({resource_summary}) to site {to_building_custom_id}.",
        }
        to_bldg_name = to_building_record['fields'].get('Name', to_building_record['fields'].get('Type', to_building_custom_id))
        activity_payload["Description"] = f"Delivering {resource_summary} to {to_bldg_name}"

        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created deliver_construction_materials activity: {created_activity['id']}")
            # Note: The citizen's resources are not modified here. That happens in the processor
            # when they arrive at the workshop (if needed to pick up) or at the site (to deposit).
            # This creator assumes the citizen will pick up from workshop inventory.
            return created_activity
        else:
            log.error("Failed to create deliver_construction_materials activity in Airtable.")
            return None

    except Exception as e:
        log.error(f"Error creating deliver_construction_materials activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
