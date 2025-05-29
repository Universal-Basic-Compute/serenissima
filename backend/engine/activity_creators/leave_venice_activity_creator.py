"""
Creator for 'leave_venice' activities.
"""
import logging
import datetime
import time
import json
import uuid
import pytz 
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import get_building_record, get_citizen_inventory_details # Import helper

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    exit_point_custom_id: str, # Custom BuildingId of the exit point (e.g., a public_dock)
    path_data_to_exit: Dict,
    galley_to_delete_custom_id: Optional[str], # Custom BuildingId of the galley, if any
    current_time_utc: datetime.datetime    # Added current_time_utc
) -> Optional[Dict]:
    """Creates a 'leave_venice' activity."""
    log.info(f"Attempting to create 'leave_venice' for {citizen_username} via {exit_point_custom_id}")

    try:
        # from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
        
        start_date_iso_to_use = path_data_to_exit.get('timing', {}).get('startDate', current_time_utc.isoformat())
        end_date_iso_to_use = path_data_to_exit.get('timing', {}).get('endDate')
        
        if not end_date_iso_to_use: 
            travel_duration_default_hours = 1 
            start_datetime_obj_for_calc = datetime.datetime.fromisoformat(start_date_iso_to_use.replace("Z", "+00:00")) if isinstance(start_date_iso_to_use, str) else start_date_iso_to_use
            if start_datetime_obj_for_calc.tzinfo is None: # Ensure timezone aware
                 start_datetime_obj_for_calc = pytz.UTC.localize(start_datetime_obj_for_calc)
            end_time_calc = start_datetime_obj_for_calc + datetime.timedelta(hours=travel_duration_default_hours)
            end_date_iso_to_use = end_time_calc.isoformat()
        
        path_json_str = json.dumps(path_data_to_exit.get('path', []))
        transporter = path_data_to_exit.get('transporter')
        
        activity_id_str = f"leave_venice_{citizen_custom_id}_{uuid.uuid4()}"
        
        notes = f"🚢 {citizen_username} is leaving Venice via {exit_point_custom_id}."
        if galley_to_delete_custom_id:
            notes += f" Their galley {galley_to_delete_custom_id} will be processed upon departure."

        # Determine TransportMode from path_data
        transport_mode = "walk" # Default
        if isinstance(path_data_to_exit.get('path'), list):
            for point in path_data_to_exit['path']:
                if isinstance(point, dict) and point.get('transportMode') == 'gondola':
                    transport_mode = 'gondola'
                    break
        
        # Fetch citizen's current inventory to include in Resources field
        citizen_inventory = get_citizen_inventory_details(tables, citizen_username)
        # Format for the Resources field: list of {"ResourceId": type, "Amount": count}
        # We only need ResourceId and Amount for the activity's Resources field.
        resources_being_carried = [
            {"ResourceId": item["ResourceId"], "Amount": item["Amount"]}
            for item in citizen_inventory if item.get("ResourceId") and item.get("Amount", 0) > 0
        ]
        resources_json = json.dumps(resources_being_carried) if resources_being_carried else "[]"

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "leave_venice",
            "Citizen": citizen_username,
            "FromBuilding": exit_point_custom_id, # Citizen is at the exit point when leaving
            "ToBuilding": exit_point_custom_id, # Destination is effectively the exit point itself
            "TransportMode": transport_mode,
            "Path": path_json_str,
            "Transporter": transporter,
            "Resources": resources_json, # Citizen takes their inventory
            "Notes": notes,
            # "Details": json.dumps(details_payload) if details_payload else None, # Removed Details field
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": start_date_iso_to_use,      # Use determined start date
            "EndDate": end_date_iso_to_use,          # Use determined end date
            "Status": "created",
        }
        exit_point_record = get_building_record(tables, exit_point_custom_id)
        exit_point_name_desc = exit_point_record['fields'].get('Name', exit_point_record['fields'].get('Type', exit_point_custom_id)) if exit_point_record else exit_point_custom_id
        activity_payload["Description"] = f"Leaving Venice via {exit_point_name_desc}"
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'leave_venice' activity: {activity['id']} for {citizen_username}")
            return activity
        else:
            log.error(f"Failed to create 'leave_venice' activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating 'leave_venice' activity for {citizen_username}: {e}")
        return None
