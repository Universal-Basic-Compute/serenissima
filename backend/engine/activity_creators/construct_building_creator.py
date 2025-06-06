"""
Creator for 'construct_building' activities.
"""
import logging
import datetime
import time
import json
import uuid
import pytz # For timezone handling
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import get_building_record, get_closest_building_to_position, get_citizen_inventory_details # Import helpers

log = logging.getLogger(__name__)

def try_create_construct_building_activity(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],         # Citizen performing the construction
    target_building_record: Dict[str, Any], # Construction site
    work_duration_minutes: int,             # How long this specific activity will last
    contract_custom_id_or_airtable_id: str, # Can be custom ContractId or Airtable ID depending on context
    path_data: Optional[Dict],               # Path from citizen's current location to site (if not already there)
    current_time_utc: datetime.datetime,     # Added current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """
    Creates a 'construct_building' activity.
    If path_data is provided, it's a travel activity to the site first.
    If path_data is None, citizen is assumed to be at the site, and it's a direct work activity.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    
    target_building_custom_id = target_building_record['fields'].get('BuildingId')

    if not all([citizen_custom_id, citizen_username, target_building_custom_id, contract_custom_id_or_airtable_id]):
        log.error("Missing crucial data for creating construct_building activity.")
        return None

    log.info(f"Attempting to create construct_building for {citizen_username} at {target_building_custom_id} for contract {contract_custom_id_or_airtable_id}.")

    try:
        # VENICE_TIMEZONE can be imported if needed for display, but current_time_utc is the source of truth for timestamps
        # from backend.engine.utils.activity_helpers import VENICE_TIMEZONE
        
        activity_payload: Dict[str, Any] = {
            "Citizen": citizen_username,
            "Status": "created",
        }
        
        details_payload: Dict[str, Any] = {}
        effective_start_date_iso: str
        effective_end_date_iso: str

        if start_time_utc_iso: # Explicit start time provided
            effective_start_date_iso = start_time_utc_iso
            if path_data and path_data.get('success') and path_data.get('timing', {}).get('durationSeconds', 0) > 30:
                # Travel involved, EndDate is StartDate + travel_duration + work_duration
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                travel_duration_seconds = path_data['timing']['durationSeconds']
                arrival_dt = start_dt_obj + datetime.timedelta(seconds=travel_duration_seconds)
                effective_end_date_iso = (arrival_dt + datetime.timedelta(minutes=work_duration_minutes)).isoformat()
            else: # No travel or path_data missing duration, EndDate is StartDate + work_duration
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(minutes=work_duration_minutes)).isoformat()
        
        elif path_data and path_data.get('success') and path_data.get('timing', {}).get('durationSeconds', 0) > 30:
            # Path data exists, use its timing for travel, then add work duration
            effective_start_date_iso = path_data.get('timing', {}).get('startDate', current_time_utc.isoformat())
            arrival_at_business_iso = path_data.get('timing', {}).get('endDate', (current_time_utc + datetime.timedelta(minutes=30)).isoformat())
            arrival_dt = datetime.datetime.fromisoformat(arrival_at_business_iso.replace("Z", "+00:00"))
            if arrival_dt.tzinfo is None: arrival_dt = pytz.UTC.localize(arrival_dt)
            effective_end_date_iso = (arrival_dt + datetime.timedelta(minutes=work_duration_minutes)).isoformat()
        else: # No explicit start, no path data: direct work activity
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(minutes=work_duration_minutes)).isoformat()

        activity_payload["CreatedAt"] = effective_start_date_iso # Use effective start for CreatedAt

        if path_data and path_data.get('success') and path_data.get('timing', {}).get('durationSeconds', 0) > 30:
            # This means travel is involved, so it's a 'goto_construction_site'
            # If it were an Airtable ID, we'd need to fetch the contract to get its custom ID.
            # Assuming contract_custom_id_or_airtable_id is already the custom string ID here for goto_construction_site.
            custom_contract_id_str_for_goto = contract_custom_id_or_airtable_id

            activity_payload["ContractId"] = custom_contract_id_str_for_goto
            activity_payload["ActivityId"] = f"goto_constr_site_{citizen_custom_id}_{uuid.uuid4()}"
            activity_payload["Type"] = "goto_construction_site"

            # Determine FromBuilding for goto_construction_site
            from_building_custom_id_for_goto = None
            citizen_pos_str = citizen_record['fields'].get('Position')
            if citizen_pos_str:
                try:
                    citizen_coords = json.loads(citizen_pos_str)
                    if citizen_coords and 'lat' in citizen_coords and 'lng' in citizen_coords:
                        # Assuming get_closest_building_to_position is available and imported
                        closest_building_to_start = get_closest_building_to_position(tables, citizen_coords)
                        if closest_building_to_start:
                            from_building_custom_id_for_goto = closest_building_to_start['fields'].get('BuildingId')
                except json.JSONDecodeError:
                    log.warning(f"Could not parse citizen position string for FromBuilding: {citizen_pos_str}")
            activity_payload["FromBuilding"] = from_building_custom_id_for_goto
            
            activity_payload["ToBuilding"] = target_building_custom_id

            # Determine TransportMode
            transport_mode = "walk" # Default
            path_points_list = path_data.get('path', [])
            if isinstance(path_points_list, list): # Ensure it's a list
                for point in path_points_list:
                    if isinstance(point, dict) and point.get('transportMode') == 'gondola':
                        transport_mode = 'gondola'
                        break
            activity_payload["TransportMode"] = transport_mode

            # Transporter
            activity_payload["Transporter"] = path_data.get('transporter')

            # Resources carried by citizen
            citizen_inventory = get_citizen_inventory_details(tables, citizen_username)
            resources_being_carried = [
                {"ResourceId": item["ResourceId"], "Amount": item["Amount"]}
                for item in citizen_inventory if item.get("ResourceId") and item.get("Amount", 0) > 0
            ]
            activity_payload["Resources"] = json.dumps(resources_being_carried) if resources_being_carried else "[]"

            activity_payload["Path"] = json.dumps(path_data.get('path', []))
            activity_payload["StartDate"] = effective_start_date_iso # Was start_date_iso_to_use
            # EndDate for goto_construction_site is arrival time, not including work_duration
            activity_payload["EndDate"] = path_data.get('timing', {}).get('endDate', (datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00")) + datetime.timedelta(minutes=30)).isoformat())
            activity_payload["Notes"] = f"🚶 Traveling to construction site {target_building_custom_id} to work. Contract: {custom_contract_id_str_for_goto}. Work will be {work_duration_minutes} mins."
            target_bldg_name = target_building_record['fields'].get('Name', target_building_record['fields'].get('Type', target_building_custom_id))
            activity_payload["Description"] = f"Traveling to construction site: {target_bldg_name}"
            
            details_payload["action_on_arrival"] = "construct_building"
            # Renamed for clarity when parsed by processor
            details_payload["work_duration_minutes_on_arrival"] = work_duration_minutes
            # Add target building ID for the construction phase to DetailsJSON
            details_payload["target_building_id_on_arrival"] = target_building_custom_id
            # ContractId is already part of the main activity_payload, so processor can get it from there.

            log.info(f"Creating 'goto_construction_site' for {citizen_username} to {target_building_custom_id} using ContractId: {custom_contract_id_str_for_goto}. Details for next phase: {details_payload}")

        else: 
            # For direct construct_building, contract_custom_id_or_airtable_id should be the custom string ID.
            activity_payload["ContractId"] = contract_custom_id_or_airtable_id
            activity_payload["ActivityId"] = f"construct_bld_{citizen_custom_id}_{uuid.uuid4()}"
            activity_payload["Type"] = "construct_building"
            # Field used by construct_building_processor
            activity_payload["BuildingToConstruct"] = target_building_custom_id
            activity_payload["WorkDurationMinutes"] = work_duration_minutes # Add to main payload
            activity_payload["FromBuilding"] = target_building_custom_id 
            activity_payload["ToBuilding"] = target_building_custom_id   
            activity_payload["Path"] = "[]" 
            activity_payload["StartDate"] = effective_start_date_iso # Was start_date_iso_to_use
            activity_payload["EndDate"] = effective_end_date_iso # Was calculated based on current_time_utc
            activity_payload["Notes"] = f"🛠️ Working on construction at site {target_building_custom_id} for {work_duration_minutes} minutes. Contract: {contract_custom_id_or_airtable_id}."
            target_bldg_name = target_building_record['fields'].get('Name', target_building_record['fields'].get('Type', target_building_custom_id))
            activity_payload["Description"] = f"Working on construction: {target_bldg_name}"

            # details_payload["work_duration_minutes"] is still useful if Notes are parsed for other reasons
            details_payload["work_duration_minutes"] = work_duration_minutes 
            
            log.info(f"Creating 'construct_building' directly for {citizen_username} at {target_building_custom_id} for contract {contract_custom_id_or_airtable_id}.")

        # Append details_payload to Notes
        if details_payload:
            current_notes = activity_payload.get("Notes", "") # Get existing notes
            details_json_str = json.dumps(details_payload)
            # Append the JSON string to the existing notes
            activity_payload["Notes"] = f"{current_notes}\nDetailsJSON: {details_json_str}".strip()
        
        # Ensure "Details" key is not sent
        if "Details" in activity_payload:
            del activity_payload["Details"]
            
        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created {activity_payload['Type']} activity: {created_activity['id']}")
            return created_activity
        else:
            log.error(f"Failed to create {activity_payload['Type']} activity in Airtable.") # Use activity_payload['Type']
            return None

    except Exception as e:
        # activity_type might not be defined if an error occurs before its assignment in the try block
        # So, use a generic message or activity_payload['Type'] if available.
        # For safety, let's use a generic message if activity_payload['Type'] might not exist.
        log_activity_type_for_error = activity_payload.get('Type', 'unknown construction-related')
        log.error(f"Error creating {log_activity_type_for_error} activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
