"""
Creator for 'fetch_resource' activities.
"""
import logging
import datetime
import time
import json
import uuid # Already imported in createActivities, but good practice here too
import pytz # For timezone handling
from typing import Dict, Optional, Any

# Import helper functions
from backend.engine.utils.activity_helpers import (
    _get_building_position_coords, 
    calculate_haversine_distance_meters,
    VENICE_TIMEZONE, # Import VENICE_TIMEZONE
    get_building_record, # Import helper
    get_building_storage_details # Import for stock checking
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_airtable_id: str, # Airtable record ID of the citizen
    citizen_custom_id: str,   # Custom CitizenId (ctz_...)
    citizen_username: str,    # Username
    contract_custom_id: Optional[str],# Custom ContractId string of the contract
    from_building_custom_id: Optional[str], # Custom BuildingId of the source building
    to_building_custom_id: Optional[str],   # Custom BuildingId of the destination building, now optional
    resource_type_id: str, # Renamed for clarity
    amount: float,
    path_data: Optional[Dict], # Path data from transport API
    current_time_utc: datetime.datetime, # Added current_time_utc
    resource_defs: Dict[str, Any], # Added resource_defs
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a resource fetching activity based on a contract."""
    
    original_from_building_id = from_building_custom_id # Keep original for logging if needed
    final_from_building_custom_id = original_from_building_id

    if original_from_building_id is None:
        log.info(f"from_building_custom_id is None for {citizen_username}. Attempting to find and validate a nearby building as source.")
        determined_nearby_source_id = None
        try:
            citizen_record = tables['citizens'].get(citizen_airtable_id)
            if citizen_record and citizen_record['fields'].get('Position'):
                citizen_pos_str = citizen_record['fields']['Position']
                citizen_position = json.loads(citizen_pos_str)
                
                if citizen_position and 'lat' in citizen_position and 'lng' in citizen_position:
                    all_buildings = tables['buildings'].all() # Consider optimizing if too many buildings
                    # Find the closest building
                    min_dist = float('inf')
                    closest_building_candidate_id = None
                    for building_rec_iter in all_buildings:
                        building_pos_iter = _get_building_position_coords(building_rec_iter)
                        if building_pos_iter:
                            distance_iter = calculate_haversine_distance_meters(
                                citizen_position['lat'], citizen_position['lng'],
                                building_pos_iter['lat'], building_pos_iter['lng']
                            )
                            if distance_iter < min_dist:
                                min_dist = distance_iter
                                closest_building_candidate_id = building_rec_iter['fields'].get('BuildingId')
                    
                    if closest_building_candidate_id:
                        log.info(f"Closest building candidate for {citizen_username} is {closest_building_candidate_id} at {min_dist:.2f}m.")
                        # Now check stock at this closest_building_candidate_id
                        source_building_record = get_building_record(tables, closest_building_candidate_id)
                        if source_building_record:
                            source_owner_username = source_building_record['fields'].get('RunBy') or source_building_record['fields'].get('Owner')
                            if source_owner_username:
                                _, owner_specific_stock_map = get_building_storage_details(tables, closest_building_candidate_id, source_owner_username)
                                stock_of_needed_resource = owner_specific_stock_map.get(resource_type_id, 0.0)
                                
                                if stock_of_needed_resource >= amount:
                                    log.info(f"Sufficient stock ({stock_of_needed_resource:.2f}) of {resource_type_id} found at determined source {closest_building_candidate_id} (Owner: {source_owner_username}) for requested amount {amount:.2f}.")
                                    determined_nearby_source_id = closest_building_candidate_id
                                else:
                                    log.warning(f"Insufficient stock ({stock_of_needed_resource:.2f}) of {resource_type_id} at determined source {closest_building_candidate_id} (Owner: {source_owner_username}) for requested amount {amount:.2f}. Cannot create fetch activity.")
                                    return None # Stock insufficient
                            else:
                                log.warning(f"Determined source building {closest_building_candidate_id} has no owner/operator. Cannot verify stock.")
                                return None # No owner
                        else:
                            log.warning(f"Could not fetch record for determined source building {closest_building_candidate_id}.")
                            return None # Building record not found
                    else:
                        log.info(f"No nearby building found for {citizen_username} at {citizen_position}.")
                        return None # No nearby building
                else:
                    log.warning(f"Citizen {citizen_username} has no valid position data: {citizen_pos_str}. Cannot find nearby building.")
                    return None # Invalid citizen position
            else:
                log.warning(f"Citizen record not found or no position for {citizen_username} ({citizen_airtable_id}). Cannot find nearby building.")
                return None # Citizen record issue
        except Exception as e_nearby:
            log.error(f"Error trying to find and validate nearby building for {citizen_username}: {e_nearby}")
            return None # Error during dynamic source determination
        
        final_from_building_custom_id = determined_nearby_source_id
    
    if final_from_building_custom_id is None and original_from_building_id is None:
        # This means original was None, and dynamic determination failed (no nearby, no stock, etc.)
        log.warning(f"Could not determine a valid source building for {citizen_username} to fetch {resource_type_id}. Aborting fetch_resource creation.")
        return None
    
    # If to_building_custom_id is None, it implies the citizen is fetching for their own inventory (e.g., homeless)
    destination_log_name = to_building_custom_id if to_building_custom_id else "inventaire personnel"
    log.info(f"Attempting to create resource fetching activity for {citizen_username} from {final_from_building_custom_id or 'unknown source'} to {destination_log_name} with explicit start: {start_time_utc_iso}")

    try:
        effective_start_dt: datetime.datetime
        effective_end_dt: datetime.datetime
        current_path_points = []
        current_transporter = None

        if start_time_utc_iso:
            effective_start_dt = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if effective_start_dt.tzinfo is None: effective_start_dt = pytz.UTC.localize(effective_start_dt)
        else:
            effective_start_dt = current_time_utc # Default to now if no explicit start

        if final_from_building_custom_id and to_building_custom_id and final_from_building_custom_id == to_building_custom_id:
            log.info(f"FromBuilding and ToBuilding are the same ({final_from_building_custom_id}). Setting travel time to 1 minute for {citizen_username}.")
            effective_end_dt = effective_start_dt + datetime.timedelta(minutes=1)
        elif path_data and path_data.get('timing', {}).get('durationSeconds') is not None:
            duration_seconds = path_data['timing']['durationSeconds']
            effective_end_dt = effective_start_dt + datetime.timedelta(seconds=duration_seconds)
            current_path_points = path_data.get('path', [])
            current_transporter = path_data.get('transporter')
        else: # No path_data or no duration, use default travel time
            log.warning(f"Path data is None or lacks duration for fetch_resource activity for {citizen_username}. Using default travel time.")
            effective_end_dt = effective_start_dt + datetime.timedelta(minutes=30) # Default 30 mins

        activity_id_str = f"fetch_{citizen_custom_id}_{uuid.uuid4()}"
        
        from_building_name = final_from_building_custom_id if final_from_building_custom_id else "an unknown location"
        # to_building_name = to_building_custom_id # Assuming to_building_custom_id is always provided
        to_building_name_for_log = to_building_custom_id if to_building_custom_id else "inventaire personnel"


        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_resource",
            "Citizen": citizen_username,
            # "ContractId": contract_custom_id, # Will be set conditionally below
            "FromBuilding": final_from_building_custom_id, 
            "ToBuilding": to_building_custom_id,   
            "CreatedAt": effective_start_dt.isoformat(),
            "StartDate": effective_start_dt.isoformat(),
            "EndDate": effective_end_dt.isoformat(),
            "Path": json.dumps(current_path_points), 
            "Transporter": current_transporter, 
        }
        resource_name_display = resource_defs.get(resource_type_id, {}).get('name', resource_type_id)
        from_bldg_rec = get_building_record(tables, final_from_building_custom_id) if final_from_building_custom_id else None
        from_bldg_name_display = from_bldg_rec['fields'].get('Name', from_bldg_rec['fields'].get('Type', final_from_building_custom_id)) if from_bldg_rec else (from_building_name if from_building_name != "unknown source" else "an unknown location")
        
        to_bldg_name_display = "inventaire personnel"
        if to_building_custom_id:
            to_bldg_rec = get_building_record(tables, to_building_custom_id)
            to_bldg_name_display = to_bldg_rec['fields'].get('Name', to_bldg_rec['fields'].get('Type', to_building_custom_id)) if to_bldg_rec else to_building_custom_id
        
        activity_payload["Notes"] = f"🚚 Fetching **{amount:,.0f}** units of **{resource_name_display}** from **{from_bldg_name_display}** to **{to_bldg_name_display}**"
        activity_payload["Description"] = f"Fetching {amount:,.0f} {resource_name_display} from {from_bldg_name_display} to {to_bldg_name_display}"
        activity_payload["Status"] = "created"

        if contract_custom_id: # Changed from contract_airtable_id
            activity_payload["ContractId"] = contract_custom_id # Use the custom ID
        else:
            # If no contract, store resource details in 'Resources' field
            activity_payload["Resources"] = json.dumps([{"ResourceId": resource_type_id, "Amount": amount}])
            activity_payload["Notes"] += " (Internal workshop restocking)"
            # Ensure the "Details" field is not added if it's None or empty,
            # as it causes UNKNOWN_FIELD_NAME errors with Airtable.
            # If "Details" was intended for non-contract fetches, its content should be
            # stored in "Notes" or another existing field.
            if "Details" in activity_payload and not activity_payload.get("Details"):
                del activity_payload["Details"]

        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created resource fetching activity: {activity['id']}")
            # Citizen's UpdatedAt is automatically handled by Airtable when other fields are updated.
            return activity
        else:
            log.error(f"Failed to create resource fetching activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating resource fetching activity for {citizen_username}: {e}")
        return None
