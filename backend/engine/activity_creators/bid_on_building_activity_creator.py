import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    _escape_airtable_value,
    VENICE_TIMEZONE,
    find_path_between_buildings,
    get_building_record,
    get_citizen_record 
)

log = logging.getLogger(__name__)

DEFAULT_OFFICIAL_BUILDING_TYPES = ["courthouse", "town_hall"] # Types of buildings to use as official offices

def _get_default_official_building(tables: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Fetches a default official building (courthouse or town_hall)."""
    for building_type in DEFAULT_OFFICIAL_BUILDING_TYPES:
        try:
            # Formula to find a building of the specified type
            formula = f"{{Type}} = '{_escape_airtable_value(building_type)}'"
            records = tables["buildings"].all(formula=formula, max_records=1)
            if records:
                log.info(f"Found default official building of type '{building_type}': {records[0]['fields'].get('BuildingId')}")
                return records[0]
        except Exception as e:
            log.error(f"Error fetching default official building of type '{building_type}': {e}")
    log.warning("No default official building (courthouse, town_hall) found.")
    return None

def try_create(
    tables: Dict[str, Any],
    citizen_record_data: Dict[str, Any], # Changed from citizen_record to citizen_record_data
    details: Dict[str, Any]
) -> bool:
    """
    Creates the full chain of activities for bidding on a building:
    1. goto_location (to inspect buildingIdToBidOn)
    2. inspect_building_for_purchase
    3. goto_location (to targetOfficeBuildingId or default official building)
    4. submit_building_purchase_offer (creates the building_bid contract)
    """
    citizen_username = citizen_record_data['fields'].get('Username')
    if not citizen_username:
        log.error("Citizen username is missing from citizen_record_data.")
        return False

    building_id_to_bid_on = details.get('buildingIdToBidOn')
    bid_amount = details.get('bidAmount')
    # from_building_id is where the citizen starts the first travel from
    from_building_id = details.get('fromBuildingId') 
    # target_office_building_id is where the citizen goes to submit the bid
    target_office_building_id = details.get('targetOfficeBuildingId') 

    if not all([building_id_to_bid_on, bid_amount, from_building_id]):
        log.error(f"Missing required details for bid_on_building: buildingIdToBidOn, bidAmount, or fromBuildingId. Details: {details}")
        return False

    # Get citizen's current building record (from_building_id)
    # This is where the citizen is starting from.
    current_location_building_record = get_building_record(tables, from_building_id)
    if not current_location_building_record:
        log.error(f"Could not find current location building record for ID: {from_building_id}")
        return False

    # Get target building for inspection (building_id_to_bid_on)
    target_inspection_building_record = get_building_record(tables, building_id_to_bid_on)
    if not target_inspection_building_record:
        log.error(f"Could not find target building for inspection with ID: {building_id_to_bid_on}")
        return False

    # Determine the official building for submitting the bid
    official_building_record = None
    if target_office_building_id:
        official_building_record = get_building_record(tables, target_office_building_id)
        if not official_building_record:
            log.warning(f"Provided targetOfficeBuildingId '{target_office_building_id}' not found. Will try default.")
            official_building_record = _get_default_official_building(tables)
    else:
        official_building_record = _get_default_official_building(tables)

    if not official_building_record:
        log.error(f"Could not determine an official building (targetOfficeBuildingId or default) for submitting the bid.")
        return False
    
    official_building_id = official_building_record['fields'].get('BuildingId')


    ts_suffix = f"{_escape_airtable_value(citizen_username)}_{int(datetime.now(VENICE_TIMEZONE).timestamp())}"
    now_utc = datetime.now(timezone.utc)
    current_activity_end_time = now_utc

    activities_payloads = []

    # --- Activity 1: Travel to inspect the building ---
    path_to_inspection_site = find_path_between_buildings(current_location_building_record, target_inspection_building_record)
    if not path_to_inspection_site or not path_to_inspection_site.get('path'):
        log.error(f"Could not find path from {from_building_id} to inspection site {building_id_to_bid_on}")
        return False
    
    duration_to_inspection_seconds = path_to_inspection_site.get('timing', {}).get('durationSeconds', 1800) # Default 30 min
    
    goto_inspect_activity_id = f"goto_inspect_bld_{_escape_airtable_value(building_id_to_bid_on)}_{ts_suffix}"
    start_time_1 = current_activity_end_time
    end_time_1 = start_time_1 + timedelta(seconds=duration_to_inspection_seconds)
    
    activities_payloads.append({
        "ActivityId": goto_inspect_activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": from_building_id,
        "ToBuilding": building_id_to_bid_on,
        "Path": json.dumps(path_to_inspection_site.get('path', [])),
        "Details": json.dumps({
            "finalActivityType": "bid_on_building", 
            "nextStep": "inspect_building_for_purchase",
            "buildingIdToBidOn": building_id_to_bid_on,
            "bidAmount": bid_amount,
            "targetOfficeBuildingId": official_building_id
        }),
        "Status": "created",
        "Title": f"Travel to inspect building {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)}",
        "Description": f"Traveling to inspect {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)} before placing a bid.",
        "CreatedAt": now_utc.isoformat(),
        "StartDate": start_time_1.isoformat(),
        "EndDate": end_time_1.isoformat(),
        "Priority": 25 # Medium priority
    })
    current_activity_end_time = end_time_1

    # --- Activity 2: Inspect building ---
    inspect_activity_id = f"inspect_bld_{_escape_airtable_value(building_id_to_bid_on)}_{ts_suffix}"
    inspection_duration_minutes = 15 
    start_time_2 = current_activity_end_time
    end_time_2 = start_time_2 + timedelta(minutes=inspection_duration_minutes)

    activities_payloads.append({
        "ActivityId": inspect_activity_id,
        "Type": "inspect_building_for_purchase",
        "Citizen": citizen_username,
        "FromBuilding": building_id_to_bid_on, # Location of inspection
        "ToBuilding": building_id_to_bid_on,   # Stays at the same location
        "Details": json.dumps({
            "finalActivityType": "bid_on_building",
            "nextStep": "goto_official_office_for_bid",
            "buildingIdToBidOn": building_id_to_bid_on,
            "bidAmount": bid_amount,
            "targetOfficeBuildingId": official_building_id
        }),
        "Status": "created",
        "Title": f"Inspecting building {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)}",
        "Description": f"Performing an inspection of {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)}.",
        "CreatedAt": now_utc.isoformat(),
        "StartDate": start_time_2.isoformat(),
        "EndDate": end_time_2.isoformat(),
        "Priority": 25
    })
    current_activity_end_time = end_time_2

    # --- Activity 3: Travel to official building to submit bid ---
    path_to_official_building = find_path_between_buildings(target_inspection_building_record, official_building_record)
    if not path_to_official_building or not path_to_official_building.get('path'):
        log.error(f"Could not find path from inspection site {building_id_to_bid_on} to official building {official_building_id}")
        return False

    duration_to_official_seconds = path_to_official_building.get('timing', {}).get('durationSeconds', 1800) # Default 30 min

    goto_submit_activity_id = f"goto_submit_bid_bld_{_escape_airtable_value(building_id_to_bid_on)}_{ts_suffix}"
    start_time_3 = current_activity_end_time
    end_time_3 = start_time_3 + timedelta(seconds=duration_to_official_seconds)

    activities_payloads.append({
        "ActivityId": goto_submit_activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": building_id_to_bid_on, # From inspection site
        "ToBuilding": official_building_id,    # To official building
        "Path": json.dumps(path_to_official_building.get('path', [])),
        "Details": json.dumps({
            "finalActivityType": "bid_on_building",
            "nextStep": "submit_building_purchase_offer",
            "buildingIdToBidOn": building_id_to_bid_on,
            "bidAmount": bid_amount,
            "targetOfficeBuildingId": official_building_id # Redundant here but good for clarity
        }),
        "Status": "created",
        "Title": f"Travel to {official_building_record['fields'].get('Name', official_building_id)} to submit bid",
        "Description": f"Traveling to {official_building_record['fields'].get('Name', official_building_id)} to submit a bid for {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)}.",
        "CreatedAt": now_utc.isoformat(),
        "StartDate": start_time_3.isoformat(),
        "EndDate": end_time_3.isoformat(),
        "Priority": 25
    })
    current_activity_end_time = end_time_3

    # --- Activity 4: Submit building purchase offer ---
    submit_offer_activity_id = f"submit_offer_bld_{_escape_airtable_value(building_id_to_bid_on)}_{ts_suffix}"
    submission_duration_minutes = 15
    start_time_4 = current_activity_end_time
    end_time_4 = start_time_4 + timedelta(minutes=submission_duration_minutes)

    activities_payloads.append({
        "ActivityId": submit_offer_activity_id,
        "Type": "submit_building_purchase_offer",
        "Citizen": citizen_username,
        "FromBuilding": official_building_id, # At the official building
        "ToBuilding": official_building_id,   # Stays at the same location
        "Details": json.dumps({
            "buildingIdToBidOn": building_id_to_bid_on,
            "bidAmount": bid_amount,
            "targetOfficeBuildingId": official_building_id # Important for processor to know where fee is paid
        }),
        "Status": "created",
        "Title": f"Submitting bid for {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)}",
        "Description": f"Formally submitting a bid of {bid_amount} Ducats for building {target_inspection_building_record['fields'].get('Name', building_id_to_bid_on)} at {official_building_record['fields'].get('Name', official_building_id)}.",
        "CreatedAt": now_utc.isoformat(),
        "StartDate": start_time_4.isoformat(),
        "EndDate": end_time_4.isoformat(),
        "Priority": 25
    })

    try:
        created_activity_ids = []
        for payload in activities_payloads:
            tables["activities"].create(payload)
            created_activity_ids.append(payload["ActivityId"])
        
        log.info(f"Successfully created 'bid_on_building' activity chain for citizen {citizen_username} to bid on {building_id_to_bid_on}.")
        for i, act_id in enumerate(created_activity_ids):
            log.info(f"  Step {i+1}: {activities_payloads[i]['Type']} - {act_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create one or more activities in 'bid_on_building' chain: {e}")
        # Consider cleanup logic here if partial creation is problematic
        return False
