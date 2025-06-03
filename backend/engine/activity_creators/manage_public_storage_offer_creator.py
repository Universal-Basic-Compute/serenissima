import logging
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    VENICE_TIMEZONE,
    get_building_record,
    get_citizen_record,
    find_path_between_buildings_or_coords,
    create_activity_record, # Using the generic helper
    get_closest_building_of_type # To find a town_hall if not specified
)

log = logging.getLogger(__name__)

DEFAULT_OFFICE_TYPE = "town_hall" # Default place to register storage contracts

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    activity_params: Dict[str, Any],
    # resource_defs and building_type_defs are part of standard signature but might not be used directly here
    resource_defs: Dict[str, Any], 
    building_type_defs: Dict[str, Any],
    now_venice_dt: datetime, # Current Venice time
    now_utc_dt: datetime,    # Current UTC time
    transport_api_url: str,
    api_base_url: str
) -> Optional[Dict[str, Any]]: # Return the created activity record or None
    """
    Creates a chain of activities for managing a public storage offer.
    1. goto_location to an office building (e.g., town_hall).
    2. register_public_storage_offer activity at the office.
    """
    citizen_username = citizen_record['fields'].get('Username')
    
    # Extract necessary parameters for the contract
    contract_id_to_manage = activity_params.get('contractId_to_create_if_new') # This is the custom ContractId
    seller_building_id = activity_params.get('sellerBuildingId') # The storage building
    resource_type = activity_params.get('resourceType')
    capacity_offered = activity_params.get('capacityOffered')
    price_per_unit_per_day = activity_params.get('pricePerUnitPerDay')
    pricing_strategy = activity_params.get('pricingStrategy')
    title = activity_params.get('title')
    description = activity_params.get('description')
    contract_notes_payload = activity_params.get('notes') # This is a dict from the caller

    if not all([citizen_username, seller_building_id, resource_type, title, description,
                contract_id_to_manage, capacity_offered is not None, price_per_unit_per_day is not None, pricing_strategy]):
        log.error(f"Missing required parameters for manage_public_storage_offer for {citizen_username}. Params: {activity_params}")
        return None

    # Determine the target office building
    target_office_building_id = activity_params.get('targetOfficeBuildingId')
    target_office_record = None

    current_citizen_pos_str = citizen_record['fields'].get('Position')
    current_citizen_pos_coords: Optional[Dict[str, float]] = None
    if current_citizen_pos_str:
        try:
            current_citizen_pos_coords = json.loads(current_citizen_pos_str)
        except json.JSONDecodeError:
            log.warning(f"Could not parse current position for {citizen_username}: {current_citizen_pos_str}")
            # If no current position, pathfinding might fail or use a default.

    if target_office_building_id:
        target_office_record = get_building_record(tables, target_office_building_id)
        if not target_office_record:
            log.warning(f"Specified targetOfficeBuildingId {target_office_building_id} not found. Will search for default.")
            target_office_building_id = None # Reset to find default

    if not target_office_building_id:
        if not current_citizen_pos_coords:
            log.error(f"Cannot find default office for {citizen_username} without current position.")
            return None
        log.info(f"No targetOfficeBuildingId provided for {citizen_username}, finding closest '{DEFAULT_OFFICE_TYPE}'.")
        target_office_record = get_closest_building_of_type(tables, current_citizen_pos_coords, DEFAULT_OFFICE_TYPE)
        if target_office_record:
            target_office_building_id = target_office_record['fields'].get('BuildingId')
        else:
            log.error(f"Could not find any '{DEFAULT_OFFICE_TYPE}' for {citizen_username} to register storage offer.")
            return None
    
    if not target_office_record: # Should be set if target_office_building_id is valid
        target_office_record = get_building_record(tables, target_office_building_id)
        if not target_office_record:
             log.error(f"Target office building {target_office_building_id} could not be resolved. Cannot create activity chain.")
             return None


    # --- 1. Create goto_location activity to the office ---
    start_location_for_path = current_citizen_pos_coords # Path from current position
    if not start_location_for_path:
        # Fallback: if citizen has no position, assume they start at their seller_building_id (storage)
        storage_building_rec = get_building_record(tables, seller_building_id)
        if storage_building_rec:
            start_location_for_path = storage_building_rec # Pass full record
        else:
            log.error(f"Cannot determine start location for pathfinding for {citizen_username} (no current pos, and sellerBuildingId {seller_building_id} not found).")
            return None
            
    path_to_office_data = find_path_between_buildings_or_coords(
        start_location_for_path,
        target_office_record, # Pass full record of the office
        api_base_url,
        transport_api_url=transport_api_url
    )

    if not path_to_office_data or not path_to_office_data.get('success') or not path_to_office_data.get('path'):
        log.error(f"Pathfinding failed for {citizen_username} to office {target_office_building_id}.")
        return None

    travel_duration_seconds = path_to_office_data.get('timing', {}).get('durationSeconds', 1800) # Default 30 min
    
    # Timings for the chain
    # now_utc_dt is the current time this creator is called
    goto_office_start_utc = now_utc_dt
    goto_office_end_utc = goto_office_start_utc + timedelta(seconds=travel_duration_seconds)

    register_offer_start_utc = goto_office_end_utc
    register_offer_duration_seconds = 900 # 15 minutes to register contract
    register_offer_end_utc = register_offer_start_utc + timedelta(seconds=register_offer_duration_seconds)

    # Details for the final register_public_storage_offer activity
    # This will be stored in the 'Notes' of the preceding goto_location activity
    # and then copied to the 'Notes' of the register_public_storage_offer activity itself.
    register_activity_details = {
        "contractId_to_manage": contract_id_to_manage, # Custom ContractId
        "sellerBuildingId": seller_building_id,
        "resourceType": resource_type,
        "capacityOffered": capacity_offered,
        "pricePerUnitPerDay": price_per_unit_per_day,
        "pricingStrategy": pricing_strategy,
        "title": title,
        "description": description,
        "contractNotes": contract_notes_payload, # The dict of notes for the contract itself
        "targetOfficeBuildingId": target_office_building_id # Where registration happens
    }

    # Notes for the goto_location activity
    goto_notes = {
        "activityType": "manage_public_storage_offer", # The overall endeavor
        "nextStep": "register_public_storage_offer",   # The type of the next activity in chain
        "nextActivityDetails": register_activity_details # Pass all necessary info for the next step
    }

    first_activity_record = create_activity_record(
        tables=tables,
        citizen_username=citizen_username,
        activity_type="goto_location",
        start_date_iso=goto_office_start_utc.isoformat(),
        end_date_iso=goto_office_end_utc.isoformat(),
        to_building_id=target_office_building_id,
        path_json=json.dumps(path_to_office_data.get('path', [])),
        notes=json.dumps(goto_notes), # Store the chain details here
        title=f"Travel to {target_office_record['fields'].get('Name', target_office_building_id)} to manage storage offer"
    )

    if not first_activity_record:
        log.error(f"Failed to create goto_location activity for {citizen_username} to manage storage offer.")
        return None

    # --- 2. Create register_public_storage_offer activity ---
    # This activity starts after the goto_location ends.
    # Its 'Notes' will be the register_activity_details.
    second_activity_record = create_activity_record(
        tables=tables,
        citizen_username=citizen_username,
        activity_type="register_public_storage_offer",
        start_date_iso=register_offer_start_utc.isoformat(),
        end_date_iso=register_offer_end_utc.isoformat(),
        from_building_id=target_office_building_id, # Citizen is at the office
        notes=json.dumps(register_activity_details), # All contract details for the processor
        title=f"Registering storage offer for {resource_type}"
    )

    if not second_activity_record:
        log.error(f"Failed to create register_public_storage_offer activity for {citizen_username}. The goto_location activity {first_activity_record['fields']['ActivityId']} was created but the chain is incomplete.")
        # Potentially delete the first_activity_record here if atomicity is critical,
        # or rely on a cleanup process for orphaned activities.
        # For now, return None, indicating overall failure.
        return None
        
    log.info(f"Successfully created activity chain for {citizen_username} to manage public storage offer. First activity: {first_activity_record['fields']['ActivityId']}")
    return first_activity_record # Return the first activity of the chain
