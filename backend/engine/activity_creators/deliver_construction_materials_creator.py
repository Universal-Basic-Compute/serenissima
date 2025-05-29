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
    current_time_utc: datetime.datetime  # Added current_time_utc
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
        # Determine start and end times from path_data or current_time_utc
        # from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Not needed if using current_time_utc
        
        start_date_iso_to_use = path_data.get('timing', {}).get('startDate', current_time_utc.isoformat())
        end_date_iso_to_use = path_data.get('timing', {}).get('endDate')
        if not end_date_iso_to_use: 
            travel_duration_seconds = path_data.get('timing', {}).get('durationSeconds', 3600) 
            # Ensure start_date_iso_to_use is a datetime object for timedelta if it came from current_time_utc
            start_datetime_obj_for_calc = datetime.datetime.fromisoformat(start_date_iso_to_use.replace("Z", "+00:00")) if isinstance(start_date_iso_to_use, str) else start_date_iso_to_use
            if start_datetime_obj_for_calc.tzinfo is None: # Ensure timezone aware
                 start_datetime_obj_for_calc = pytz.UTC.localize(start_datetime_obj_for_calc)

            end_datetime_obj = start_datetime_obj_for_calc + datetime.timedelta(seconds=travel_duration_seconds)
            end_date_iso_to_use = end_datetime_obj.isoformat()

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
            "Transporter": path_data.get('transporter'), # If applicable from path_data
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": start_date_iso_to_use,      # Use determined start date
            "EndDate": end_date_iso_to_use,          # Use determined end date
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
