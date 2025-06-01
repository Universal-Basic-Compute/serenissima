"""
Creator for 'goto_work' activities.
"""
import logging
import datetime
import time
import json # Added for parsing citizen_current_position_str
import json
import uuid # Added import
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE # Import VENICE_TIMEZONE at the top

def try_create(
    tables: Dict[str, Any], 
    citizen_custom_id: str, 
    citizen_username: str, 
    citizen_airtable_id: str, 
    workplace_custom_id: str, # This is the custom BuildingId of the workplace
    path_data: Dict, # Expected to contain path and timing info
    citizen_home_record: Optional[Dict], # Airtable record of the citizen's home
    resource_definitions: Dict, # Global resource definitions
    is_at_home: bool, # Flag indicating if citizen is currently at home
    citizen_current_position_str: Optional[str], # Citizen's current position as JSON string
    current_time_utc: datetime.datetime,    # Added current_time_utc
    custom_notes: Optional[str] = None, # For custom notes
    activity_type: str = "goto_work", # Default to "goto_work", can be overridden
    details_payload: Optional[Dict] = None, # For structured details
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a travel activity (e.g., goto_work, goto_building_for_storage_fetch) for a citizen. If at home and going to work, may pick up food."""
    log.info(f"Attempting to create '{activity_type}' activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to destination {workplace_custom_id} with explicit start: {start_time_utc_iso}")

    # Logic to pick up food if at home (only if it's a standard 'goto_work')
    if activity_type == "goto_work" and is_at_home and citizen_home_record and resource_definitions:
        home_building_custom_id = citizen_home_record['fields'].get('BuildingId')
        if home_building_custom_id:
            log.info(f"Citizen {citizen_username} is at home {home_building_custom_id}. Checking for food to take.")
            home_resources_formula = (f"AND({{AssetType}}='building', "
                                      f"{{Asset}}='{_escape_airtable_value(home_building_custom_id)}', "
                                      f"{{Owner}}='{_escape_airtable_value(citizen_username)}')")
            try:
                all_home_resources = tables['resources'].all(formula=home_resources_formula)
                available_food_at_home = []
                for res_rec in all_home_resources:
                    res_type = res_rec['fields'].get('Type')
                    res_count = float(res_rec['fields'].get('Count', 0))
                    res_def = resource_definitions.get(res_type)
                    if res_def and res_def.get('category') == 'food' and res_count >= 1.0:
                        available_food_at_home.append({
                            'record_id': res_rec['id'], # Airtable record ID of the resource stack in home
                            'type': res_type,
                            'name': res_def.get('name', res_type),
                            'tier': int(res_def.get('tier', 0) or 0), # Ensure tier is int, default 0
                            'count': res_count
                        })
                
                if available_food_at_home:
                    available_food_at_home.sort(key=lambda x: x['tier'], reverse=True)
                    food_to_take = available_food_at_home[0]
                    
                    log.info(f"Citizen {citizen_username} will take 1 unit of {food_to_take['name']} (Tier: {food_to_take['tier']}) from home.")

                    # Decrement from home
                    new_home_count = food_to_take['count'] - 1.0
                    if new_home_count > 0.001:
                        tables['resources'].update(food_to_take['record_id'], {'Count': new_home_count})
                    else:
                        tables['resources'].delete(food_to_take['record_id'])
                    log.info(f"Decremented 1 unit of {food_to_take['name']} from home {home_building_custom_id}. New count: {new_home_count if new_home_count > 0.001 else 0}.")

                    # Add to citizen's inventory
                    citizen_inv_food_formula = (f"AND({{AssetType}}='citizen', "
                                                f"{{Asset}}='{_escape_airtable_value(citizen_username)}', "
                                                f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                                                f"{{Type}}='{_escape_airtable_value(food_to_take['type'])}')")
                    existing_inv_food = tables['resources'].all(formula=citizen_inv_food_formula, max_records=1)
                    
                    # Use current_time_utc for timestamping new/updated resources
                    now_iso_food_utc = current_time_utc.isoformat()
                    
                    position_for_new_resource = citizen_current_position_str if citizen_current_position_str else citizen_home_record['fields'].get('Position', '{}')

                    if existing_inv_food:
                        inv_food_record = existing_inv_food[0]
                        new_inv_count = float(inv_food_record['fields'].get('Count', 0)) + 1.0
                        # Update existing resource, Airtable handles UpdatedAt
                        tables['resources'].update(inv_food_record['id'], {'Count': new_inv_count})
                    else:
                        food_def_details = resource_definitions.get(food_to_take['type'], {})
                        new_inv_res_payload = {
                            "ResourceId": f"resource-{uuid.uuid4()}",
                            "Type": food_to_take['type'],
                            "Name": food_def_details.get('name', food_to_take['type']),
                            "Asset": citizen_username,
                            "AssetType": "citizen",
                            "Owner": citizen_username,
                            "Count": 1.0,
                            "Position": position_for_new_resource,
                            "CreatedAt": now_iso_food_utc # Use UTC timestamp
                        }
                        tables['resources'].create(new_inv_res_payload)
                    log.info(f"Added 1 unit of {food_to_take['name']} to {citizen_username}'s inventory.")
                else:
                    log.info(f"No food available at home for {citizen_username} to take.")
            except Exception as e_food_pickup:
                log.error(f"Error during food pickup for {citizen_username} from home: {e_food_pickup}")
        else:
            log.info(f"Citizen {citizen_username} is at home, but home BuildingId is missing. Cannot pick up food.")
    elif not is_at_home:
        log.info(f"Citizen {citizen_username} is not at home. No food pickup attempt.")

    from_building_custom_id = None
    if citizen_current_position_str:
        try:
            current_pos_coords = json.loads(citizen_current_position_str)
            if current_pos_coords and 'lat' in current_pos_coords and 'lng' in current_pos_coords:
                # Import the helper function dynamically or ensure it's available in scope
                from backend.engine.utils.activity_helpers import get_closest_building_to_position
                closest_building_record = get_closest_building_to_position(tables, current_pos_coords)
                if closest_building_record:
                    from_building_custom_id = closest_building_record['fields'].get('BuildingId')
                    log.info(f"Determined FromBuilding for goto_work: {from_building_custom_id} based on current position {current_pos_coords}")
            else:
                log.warning(f"Parsed citizen_current_position_str for {citizen_username} is invalid: {current_pos_coords}")
        except json.JSONDecodeError:
            log.warning(f"Could not parse citizen_current_position_str for {citizen_username}: {citizen_current_position_str}")
        except ImportError:
            log.error("Failed to import get_closest_building_to_position for FromBuilding determination.")
    else:
        log.info(f"citizen_current_position_str not provided for {citizen_username}, cannot determine FromBuilding precisely.")
        # Fallback: if at home, FromBuilding is home.
        if is_at_home and citizen_home_record:
            from_building_custom_id = citizen_home_record['fields'].get('BuildingId')
            log.info(f"Using home {from_building_custom_id} as FromBuilding for {citizen_username} as they are at home.")


    transport_mode = "walk" # Default
    path_points = path_data.get('path', [])
    if isinstance(path_points, list):
        for point in path_points:
            if isinstance(point, dict) and point.get('transportMode') == 'gondola':
                transport_mode = 'gondola'
                break 
    log.info(f"Determined TransportMode for {activity_type}: {transport_mode}") # Changed log to use activity_type

    # Define default priorities for various goto activities
    DEFAULT_PRIORITIES_FOR_GOTO = {
        "goto_work": 5,
        "goto_home": 6,
        "travel_to_inn": 4,
        "goto_building_for_storage_fetch": 7, # High priority for fetching from storage
        "goto_construction_site": 6,
        # Add other specific goto types if they use this creator and need non-default priority
    }
    selected_priority = DEFAULT_PRIORITIES_FOR_GOTO.get(activity_type, 5) # Default to 5 if not in map

    # Import get_building_record locally if not already available globally
    from backend.engine.utils.activity_helpers import get_building_record

    try:
        # Determine effective StartDate and EndDate
        effective_start_date_iso: str
        effective_end_date_iso: str

        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
            # If path_data exists and has duration, EndDate is StartDate + duration
            # Otherwise, it's a fixed duration from StartDate (e.g., if no travel, or travel time unknown)
            if path_data and path_data.get('timing', {}).get('durationSeconds') is not None:
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                duration_seconds = path_data['timing']['durationSeconds']
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(seconds=duration_seconds)).isoformat()
            else: # No path_data or no duration, assume a default travel/activity time (e.g. 1 hour)
                start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
                if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(hours=1)).isoformat()
        elif path_data and path_data.get('timing', {}).get('startDate') and path_data.get('timing', {}).get('endDate'):
            effective_start_date_iso = path_data['timing']['startDate']
            effective_end_date_iso = path_data['timing']['endDate']
        else: # Fallback to current_time_utc and default duration
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(hours=1)).isoformat() # Default 1 hour
        
        path_json = json.dumps(path_points) # Use path_points determined above
        
        transporter = path_data.get('transporter') 
        
        default_notes = f"🏢 **Going to {activity_type.replace('_', ' ')} at {workplace_custom_id}**"
        current_notes_content = custom_notes if custom_notes else default_notes

        if details_payload:
            try:
                details_json_str = json.dumps(details_payload)
                current_notes_content += f"\nDetailsJSON: {details_json_str}" # Standardized key
            except TypeError as e:
                log.error(f"Error serializing details_payload to JSON: {e}. Payload: {details_payload}")
                current_notes_content += f"\nDetailsJSON: [Error serializing details - {type(details_payload)}]"
        
        # Generate user-friendly description
        from_building_name_desc = "an unknown location"
        if from_building_custom_id:
            from_b_rec = get_building_record(tables, from_building_custom_id)
            if from_b_rec:
                from_building_name_desc = from_b_rec['fields'].get('Name') or from_b_rec['fields'].get('Type', from_building_custom_id)
            else:
                from_building_name_desc = from_building_custom_id # Fallback to ID if record not found

        to_building_name_desc = workplace_custom_id # Fallback to ID
        to_b_rec = get_building_record(tables, workplace_custom_id)
        if to_b_rec:
            to_building_name_desc = to_b_rec['fields'].get('Name') or to_b_rec['fields'].get('Type', workplace_custom_id)

        activity_description = f"Going from {from_building_name_desc} to {to_building_name_desc}."
        if activity_type == "goto_work":
            activity_description = f"Going to work at {to_building_name_desc}."
        elif activity_type == "goto_home":
            activity_description = f"Going home to {to_building_name_desc}."
        elif activity_type == "travel_to_inn":
             activity_description = f"Traveling to {to_building_name_desc} (Inn)."
        elif activity_type == "goto_building_for_storage_fetch":
            activity_description = f"Going to {to_building_name_desc} to fetch items for storage."
        elif activity_type == "goto_construction_site":
            activity_description = f"Going to construction site: {to_building_name_desc}."
        # Add more specific descriptions for other activity_types if needed

        activity_payload = {
            "ActivityId": f"{activity_type}_{citizen_custom_id}_{int(time.time())}",
            "Type": activity_type, # Use the provided activity_type
            "Citizen": citizen_username,
            "FromBuilding": from_building_custom_id,
            "ToBuilding": workplace_custom_id, 
            "TransportMode": transport_mode,
            "CreatedAt": effective_start_date_iso, # Use effective start date for CreatedAt as well
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Path": path_json,
            "Transporter": transporter, 
            "Notes": current_notes_content.strip(),
            "Description": activity_description, # Added user-friendly description
            "Priority": selected_priority, # Set the priority
            "Status": "created"
        }
        # Ensure "Details" key is not sent
        if "Details" in activity_payload:
            del activity_payload["Details"]

        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created '{activity_type}' activity: {activity['id']} from {from_building_custom_id or 'Unknown Location'} to {workplace_custom_id} via {transport_mode}")
            return activity
        else:
            log.error(f"Failed to create goto_work activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating goto_work activity for {citizen_username}: {e}")
        return None
