#!/usr/bin/env python3
"""
Process Concluded Activities script for La Serenissima.

This script:
1. Fetches all activities that are concluded (EndDate is in the past) and not yet processed.
2. For "deliver_resource_batch" activities:
   - Transfers resources from the delivery citizen (owned by "Italia") to the target building.
   - Checks storage capacity of the target building.
   - Updates or creates resource records in the target building for its operator/owner.
   - Processes financial transactions based on the original contracts in the batch.
3. For "goto_home" activities:
   - Identifies all resources owned by the citizen (AssetType='citizen', Owner=CitizenUsername, Asset=CitizenCustomId).
   - Checks storage capacity of the citizen's home.
   - Transfers these resources from the citizen's personal inventory to their home building.
   - The resources in the home building remain owned by the citizen.
4. For "goto_work" activities:
   - Identifies resources carried by the citizen (`AssetType`='citizen', `Asset`=CitizenCustomId) that are owned by the operator (`RunBy`) of the workplace.
   - Checks storage capacity of the workplace.
   - If space allows, transfers these resources from the citizen's personal inventory to the workplace building.
   - The resources in the workplace building become owned by the workplace operator.
5. For "production" activities:
   - Retrieves the `RecipeInputs` and `RecipeOutputs` from the activity.
   - Verifies if the production building (identified by `FromBuilding`) has sufficient input resources owned by the building operator.
   - Verifies if the building has enough storage capacity for the output resources after inputs are consumed.
   - If both checks pass:
     - Consumes (decrements/deletes) the input resources from the building's inventory.
     - Produces (increments/creates) the output resources in the building's inventory, owned by the operator.
6. For "fetch_resource" activities (upon arrival at `FromBuilding` - the source):
   - Determines the actual amount of resource to pick up based on:
     - Amount specified in the contract/activity.
     - Stock available at `FromBuilding` (owned by the building's operator/seller).
     - Citizen's remaining carrying capacity (max 10 units total).
     - Buyer's (from contract) available Ducats to pay for the resources.
   - If a positive amount can be fetched:
     - Processes financial transaction: Buyer pays Seller.
     - Decrements resource stock from `FromBuilding`.
     - Adds resource to the citizen's personal inventory. The resource on the citizen is marked as owned by the `Buyer` from the contract.
   - Updates the citizen's `Position` to be at the `FromBuilding`.
7. Updates the activity status to "processed" or "failed". If processed successfully:
   - For most activities with a `ToBuilding` destination, the citizen's `Position` (coordinates) and `UpdatedAt` fields are updated to reflect their new location.
   - For `fetch_resource` activities, the processor itself handles updating the citizen's position to the `FromBuilding` (pickup location), so the generic update is skipped.
"""

import os
import sys
import json
import logging
import argparse
import requests
import uuid
import re
import math # Added for Haversine distance
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

# Add the parent directory to the path to allow imports from app and other engine scripts
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pyairtable import Api, Table
from dotenv import load_dotenv

# Attempt to import helper functions from other engine scripts
try:
    from backend.engine.createimportactivities import get_building_types as get_building_type_definitions_from_api
    from backend.engine.createimportactivities import get_resource_types as get_resource_definitions_from_api
    # Import processors
    from backend.engine.activity_processors import (
        process_deliver_resource_batch as process_deliver_resource_batch_fn,
        process_goto_home as process_goto_home_fn,
        process_goto_work as process_goto_work_fn,
        process_production as process_production_fn,
        process_fetch_resource as process_fetch_resource_fn,
        process_eat as process_eat_fn 
    )
except ImportError:
    # Fallback if the script is run in a context where backend.engine is not directly importable
    print("Warning: Could not import helper functions directly. Ensure PYTHONPATH is set correctly or run as part of the application.")
    # Define placeholder functions or exit if these are critical
    def get_building_type_definitions_from_api():
        raise NotImplementedError("get_building_type_definitions_from_api is not available")
    def get_resource_definitions_from_api():
        raise NotImplementedError("get_resource_definitions_from_api is not available")


# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_activities")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        return None
    
    try:
        api = Api(api_key)
        return {
            'activities': Table(api_key, base_id, 'ACTIVITIES'),
            'resources': Table(api_key, base_id, 'RESOURCES'),
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'contracts': Table(api_key, base_id, 'CONTRACTS'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'problems': Table(api_key, base_id, 'PROBLEMS') # For logging issues
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        return None

def _escape_airtable_value(value: str) -> str:
    """Escapes single quotes for Airtable formulas."""
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def get_concluded_unprocessed_activities(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch activities that have ended and are not yet processed."""
    now_iso = datetime.now(timezone.utc).isoformat()
    formula = f"AND({{EndDate}} <= '{now_iso}', OR({{Status}} = BLANK(), {{Status}} != 'processed', {{Status}} != 'failed'))"
    try:
        activities = tables['activities'].all(formula=formula)
        log.info(f"Found {len(activities)} concluded and unprocessed activities.")
        return activities
    except Exception as e:
        log.error(f"Error fetching concluded unprocessed activities: {e}")
        return []

def get_citizen_record(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    """Fetches a citizen record by username."""
    formula = f"{{Username}} = '{_escape_airtable_value(username)}'"
    try:
        records = tables['citizens'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching citizen record for {username}: {e}")
        return None

def get_building_record(tables: Dict[str, Table], building_id: str) -> Optional[Dict]:
    """Fetches a building record by BuildingId."""
    formula = f"{{BuildingId}} = '{_escape_airtable_value(building_id)}'"
    try:
        records = tables['buildings'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching building record for {building_id}: {e}")
        return None

def get_contract_record(tables: Dict[str, Table], contract_id: str) -> Optional[Dict]:
    """Fetches a contract record by ContractId."""
    formula = f"{{ContractId}} = '{_escape_airtable_value(contract_id)}'"
    try:
        records = tables['contracts'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching contract record for {contract_id}: {e}")
        return None

def get_building_current_storage(tables: Dict[str, Table], building_custom_id: str) -> float:
    """Calculates the total count of resources currently in a building."""
    # Assumes Asset field stores BuildingId for AssetType='building'
    formula = f"AND({{Asset}} = '{_escape_airtable_value(building_custom_id)}', {{AssetType}} = 'building')"
    total_stored_volume = 0
    try:
        resources_in_building = tables['resources'].all(formula=formula)
        for resource in resources_in_building:
            total_stored_volume += float(resource['fields'].get('Count', 0))
        log.info(f"Building {building_custom_id} currently stores {total_stored_volume} units of resources.")
    except Exception as e:
        log.error(f"Error calculating current storage for building {building_custom_id}: {e}")
    return total_stored_volume

# Removed process_deliver_resource_batch function from here. It's now in its own module.

def update_activity_status(tables: Dict[str, Table], activity_airtable_id: str, status: str):
    """Updates the status of an activity."""
    try:
        tables['activities'].update(activity_airtable_id, {'Status': status})
        log.info(f"Updated activity {activity_airtable_id} status to '{status}'.")
    except Exception as e:
        log.error(f"Error updating status for activity {activity_airtable_id}: {e}")

def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in kilometers between two lat/lng points using Haversine formula."""
    R = 6371  # Earth radius in kilometers

    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    a = math.sin(dLat / 2) * math.sin(dLat / 2) + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * \
        math.sin(dLon / 2) * math.sin(dLon / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return distance

def calculate_gondola_travel_details(path_json_string: Optional[str]) -> tuple[float, float]:
    """
    Calculates the total distance traveled by gondola and the associated fee.
    Fee is 10 base + 5 per km.
    Returns (total_gondola_distance_km, fee).
    """
    if not path_json_string:
        return 0.0, 0.0

    try:
        path_points = json.loads(path_json_string)
    except json.JSONDecodeError:
        log.error(f"Failed to parse path JSON: {path_json_string}")
        return 0.0, 0.0

    if not isinstance(path_points, list) or len(path_points) < 2:
        return 0.0, 0.0

    total_gondola_distance_km = 0.0
    for i in range(len(path_points) - 1):
        p1 = path_points[i]
        p2 = path_points[i+1]

        if isinstance(p1, dict) and p1.get("transportMode") == "gondola":
            try:
                lat1, lon1 = float(p1.get("lat", 0.0)), float(p1.get("lng", 0.0))
                lat2, lon2 = float(p2.get("lat", 0.0)), float(p2.get("lng", 0.0))
                if lat1 != 0.0 or lon1 != 0.0 or lat2 != 0.0 or lon2 != 0.0: # Avoid calculating for zero coords
                    segment_distance = _haversine_distance(lat1, lon1, lat2, lon2)
                    total_gondola_distance_km += segment_distance
            except (TypeError, ValueError) as e:
                log.warning(f"Could not parse coordinates for path segment: {p1} to {p2}. Error: {e}")
                continue
    
    fee = 0.0
    if total_gondola_distance_km > 0:
        fee = 10 + (5 * total_gondola_distance_km)
        log.info(f"Calculated gondola travel: Distance={total_gondola_distance_km:.2f} km, Fee={fee:.2f} Ducats.")
    
    return total_gondola_distance_km, fee


def main(dry_run: bool = False):
    log.info(f"Starting Process Activities script (dry_run={dry_run})...")

    # Define a dictionary to map activity types to their processor functions
    ACTIVITY_PROCESSORS = {
        "deliver_resource_batch": process_deliver_resource_batch_fn,
        "goto_home": process_goto_home_fn,
        "goto_work": process_goto_work_fn,
        "production": process_production_fn,
        "fetch_resource": process_fetch_resource_fn,
        "eat_from_inventory": process_eat_fn, # Dispatch to generic eat processor
        "eat_at_home": process_eat_fn,        # Dispatch to generic eat processor
        "eat_at_tavern": process_eat_fn,      # Dispatch to generic eat processor
        # Add other activity type processors here as they are created
    }

    tables = initialize_airtable()
    if not tables:
        log.error("Failed to initialize Airtable. Exiting.")
        return

    # Fetch definitions once
    building_type_defs = get_building_type_definitions_from_api()
    resource_defs = get_resource_definitions_from_api()

    if not building_type_defs or not resource_defs:
        log.error("Failed to fetch building or resource definitions. Exiting.")
        return

    activities_to_process = get_concluded_unprocessed_activities(tables)
    if not activities_to_process:
        log.info("No activities to process.")
        return

    processed_count = 0
    failed_count = 0

    for activity_record in activities_to_process:
        activity_type = activity_record['fields'].get('Type')
        activity_id_airtable = activity_record['id']
        activity_guid = activity_record['fields'].get('ActivityId', activity_id_airtable)

        log.info(f"--- Processing activity {activity_guid} of type {activity_type} ---")
        
        success = False
        if dry_run:
            log.info(f"[DRY RUN] Would process activity {activity_guid} of type {activity_type}.")
            if activity_type in ACTIVITY_PROCESSORS:
                log.info(f"[DRY RUN] Processor for {activity_type} exists.")
                success = True # Simulate success for dry run if processor exists
            else:
                log.warning(f"[DRY RUN] No processor found for activity type: {activity_type} for activity {activity_guid}. Would mark as failed.")
                success = False
        else:
            if activity_type in ACTIVITY_PROCESSORS:
                processor_func = ACTIVITY_PROCESSORS[activity_type]
                try:
                    success = processor_func(tables, activity_record, building_type_defs, resource_defs)
                except Exception as e_process:
                    log.error(f"Error processing activity {activity_guid} of type {activity_type}: {e_process}")
                    import traceback
                    log.error(traceback.format_exc())
                    success = False
            else:
                log.warning(f"No processor found for activity type: {activity_type} for activity {activity_guid}. Marking as failed.")
                success = False

        if success:
            update_activity_status(tables, activity_id_airtable, "processed")
            processed_count += 1

            # Gondola Fee Processing
            activity_path_json = activity_record['fields'].get('Path')
            citizen_username_for_fee = activity_record['fields'].get('Citizen')
            activity_custom_id_for_fee = activity_record['fields'].get('ActivityId', activity_id_airtable)
            transporter_username = activity_record['fields'].get('Transporter') # Get the transporter from activity

            if activity_path_json and citizen_username_for_fee and not dry_run:
                gondola_distance_km, gondola_fee = calculate_gondola_travel_details(activity_path_json)
                if gondola_fee > 0:
                    traveler_citizen_record = get_citizen_record(tables, citizen_username_for_fee)
                    
                    fee_recipient_username = "ConsiglioDeiDieci" # Default recipient
                    if transporter_username and transporter_username != "ConsiglioDeiDieci":
                        # Check if this transporter is a valid citizen
                        transporter_citizen_record_check = get_citizen_record(tables, transporter_username)
                        if transporter_citizen_record_check:
                            fee_recipient_username = transporter_username
                            log.info(f"Gondola fee for activity {activity_guid} will go to transporter: {transporter_username}")
                        else:
                            log.warning(f"Transporter {transporter_username} specified in activity {activity_guid} not found. Fee defaults to ConsiglioDeiDieci.")
                    
                    fee_recipient_record = get_citizen_record(tables, fee_recipient_username)

                    if traveler_citizen_record and fee_recipient_record:
                        traveler_ducats = float(traveler_citizen_record['fields'].get('Ducats', 0))
                        if traveler_ducats >= gondola_fee:
                            recipient_ducats = float(fee_recipient_record['fields'].get('Ducats', 0))
                            now_iso_fee = datetime.now(timezone.utc).isoformat()

                            tables['citizens'].update(traveler_citizen_record['id'], {'Ducats': traveler_ducats - gondola_fee})
                            tables['citizens'].update(fee_recipient_record['id'], {'Ducats': recipient_ducats + gondola_fee})
                            
                            transaction_payload = {
                                "Type": "gondola_fee",
                                "AssetType": "transport_activity",
                                "Asset": activity_custom_id_for_fee,
                                "Seller": fee_recipient_username, # Recipient of the fee
                                "Buyer": citizen_username_for_fee,  # Payer of the fee
                                "Price": gondola_fee,
                                "Details": json.dumps({
                                    "activity_guid": activity_guid,
                                    "distance_km": round(gondola_distance_km, 2),
                                    "path_preview": activity_path_json[:100] + "..." if activity_path_json else "",
                                    "original_transporter_field": transporter_username # Log what was in the Transporter field
                                }),
                                "CreatedAt": now_iso_fee,
                                "ExecutedAt": now_iso_fee
                            }
                            tables['transactions'].create(transaction_payload)
                            log.info(f"Citizen {citizen_username_for_fee} paid {gondola_fee:.2f} Ducats gondola fee to {fee_recipient_username} for activity {activity_guid}. Distance: {gondola_distance_km:.2f} km.")
                        else:
                            log.warning(f"Citizen {citizen_username_for_fee} has insufficient Ducats ({traveler_ducats:.2f}) for gondola fee ({gondola_fee:.2f}) for activity {activity_guid}.")
                            # Consider creating a problem or debt record here in the future
                    else:
                        if not traveler_citizen_record: log.error(f"Traveler citizen {citizen_username_for_fee} not found for gondola fee.")
                        if not fee_recipient_record: log.error(f"Fee recipient citizen {fee_recipient_username} not found for gondola fee.")
            elif dry_run and activity_path_json and citizen_username_for_fee:
                 gondola_distance_km, gondola_fee = calculate_gondola_travel_details(activity_path_json)
                 if gondola_fee > 0:
                    fee_recipient_username_dry_run = transporter_username if transporter_username and transporter_username != "ConsiglioDeiDieci" else "ConsiglioDeiDieci"
                    # In a dry run, we can't confirm if transporter_username is a valid citizen, so we assume it would be if not Consiglio.
                    log.info(f"[DRY RUN] Would process gondola fee of {gondola_fee:.2f} Ducats for citizen {citizen_username_for_fee} to {fee_recipient_username_dry_run} for activity {activity_guid} (Distance: {gondola_distance_km:.2f} km).")


            # Update citizen's position and UpdatedAt if ToBuilding is present,
            # UNLESS the activity type handles its own position update (e.g., fetch_resource)
            # or if the activity doesn't involve changing location (e.g. eat_from_inventory, eat_at_home, eat_at_tavern if already there)
            no_pos_update_types = ['fetch_resource', 'eat_from_inventory', 'eat_at_home', 'eat_at_tavern', 'production', 'rest', 'idle']
            if activity_type not in no_pos_update_types:
                to_building_airtable_id = activity_record['fields'].get('ToBuilding') # This is Airtable Record ID
                citizen_username_for_pos = activity_record['fields'].get('Citizen')

                if to_building_airtable_id and citizen_username_for_pos and not dry_run:
                    try:
                        # building_record_for_pos is fetched using Airtable Record ID
                        building_record_for_pos = tables['buildings'].get(to_building_airtable_id)
                        citizen_record_for_pos = get_citizen_record(tables, citizen_username_for_pos)

                        if building_record_for_pos and citizen_record_for_pos:
                            building_position_str = building_record_for_pos['fields'].get('Position')
                            # building_custom_id_for_log = building_record_for_pos['fields'].get('BuildingId') # For logging
                        
                            if building_position_str:
                                update_payload = {
                                    'Position': building_position_str
                                }
                                tables['citizens'].update(citizen_record_for_pos['id'], update_payload)
                                log.info(f"Updated citizen {citizen_username_for_pos} Position to {building_position_str} (Building Airtable ID: {to_building_airtable_id}).")
                            else:
                                log.warning(f"Building {to_building_airtable_id} is missing Position. Cannot update citizen {citizen_username_for_pos} position.")
                        else: 
                            if not building_record_for_pos:
                                log.warning(f"Target building (Airtable ID: {to_building_airtable_id}) not found. Cannot update citizen {citizen_username_for_pos} position.")
                            if not citizen_record_for_pos: 
                                log.warning(f"Citizen {citizen_username_for_pos} not found. Cannot update citizen position.")
                    except Exception as e_update_pos:
                        log.error(f"Error updating citizen {citizen_username_for_pos} position after activity {activity_guid}: {e_update_pos}")
            elif dry_run and activity_type not in no_pos_update_types:
                to_building_airtable_id_dry = activity_record['fields'].get('ToBuilding')
                citizen_username_dry = activity_record['fields'].get('Citizen')
                if to_building_airtable_id_dry and citizen_username_dry:
                    log.info(f"[DRY RUN] Would update citizen {citizen_username_dry} position based on ToBuilding (Airtable ID: {to_building_airtable_id_dry}).")

        else: # if not success
            update_activity_status(tables, activity_id_airtable, "failed")
            failed_count += 1
        
        log.info(f"--- Finished processing activity {activity_guid} ---")


    log.info(f"Process Activities script finished. Processed: {processed_count}, Failed: {failed_count}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process concluded activities in La Serenissima.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable.",
    )
    args = parser.parse_args()

    main(args.dry_run)
