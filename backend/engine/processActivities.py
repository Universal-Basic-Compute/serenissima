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
   - Identifies all resources owned by the citizen (AssetType='citizen', Owner=CitizenUsername, AssetId=CitizenCustomId).
   - Checks storage capacity of the citizen's home.
   - Transfers these resources from the citizen's personal inventory to their home building.
   - The resources in the home building remain owned by the citizen.
4. For "goto_work" activities:
   - Identifies resources carried by the citizen (`AssetType`='citizen', `AssetId`=CitizenCustomId) that are owned by the operator (`RunBy`) of the workplace.
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
    from backend.engine.activity_processors.deliver_resource_batch_processor import process as process_deliver_resource_batch_fn
    from backend.engine.activity_processors.goto_home_processor import process as process_goto_home_fn
    from backend.engine.activity_processors.goto_work_processor import process as process_goto_work_fn
    from backend.engine.activity_processors.production_processor import process as process_production_fn
    from backend.engine.activity_processors.fetch_resource_processor import process as process_fetch_resource_fn
except ImportError:
    # Fallback if the script is run in a context where backend.engine is not directly importable
    # This might happen if script is run directly from its own directory without backend being a package
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

def get_building_current_storage(tables: Dict[str, Table], building_id: str) -> float:
    """Calculates the total count of resources currently in a building."""
    formula = f"AND({{BuildingId}} = '{_escape_airtable_value(building_id)}', {{AssetType}} = 'building')"
    total_stored_volume = 0
    try:
        resources_in_building = tables['resources'].all(formula=formula)
        for resource in resources_in_building:
            total_stored_volume += float(resource['fields'].get('Count', 0))
        log.info(f"Building {building_id} currently stores {total_stored_volume} units of resources.")
    except Exception as e:
        log.error(f"Error calculating current storage for building {building_id}: {e}")
    return total_stored_volume

# Removed process_deliver_resource_batch function from here. It's now in its own module.

def update_activity_status(tables: Dict[str, Table], activity_airtable_id: str, status: str):
    """Updates the status of an activity."""
    try:
        tables['activities'].update(activity_airtable_id, {'Status': status, 'UpdatedAt': datetime.now(timezone.utc).isoformat()})
        log.info(f"Updated activity {activity_airtable_id} status to '{status}'.")
    except Exception as e:
        log.error(f"Error updating status for activity {activity_airtable_id}: {e}")


def main(dry_run: bool = False):
    log.info(f"Starting Process Activities script (dry_run={dry_run})...")

    # Define a dictionary to map activity types to their processor functions
    ACTIVITY_PROCESSORS = {
        "deliver_resource_batch": process_deliver_resource_batch_fn,
        "goto_home": process_goto_home_fn,
        "goto_work": process_goto_work_fn,
        "production": process_production_fn,
        "fetch_resource": process_fetch_resource_fn,
        # Add other activity type processors here as they are created
        # "another_activity_type": process_another_activity_type_fn,
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

            # Update citizen's position and UpdatedAt if ToBuilding is present,
            # UNLESS the activity type handles its own position update (e.g., fetch_resource)
            if activity_type != 'fetch_resource':
                to_building_airtable_id = activity_record['fields'].get('ToBuilding')
                citizen_username = activity_record['fields'].get('Citizen')

                if to_building_airtable_id and citizen_username and not dry_run:
                    try:
                        building_record_for_pos = tables['buildings'].get(to_building_airtable_id)
                        citizen_record_for_pos = get_citizen_record(tables, citizen_username)

                        if building_record_for_pos and citizen_record_for_pos:
                            # All logic depending on building_record_for_pos and citizen_record_for_pos being valid goes here
                            building_position_str = building_record_for_pos['fields'].get('Position')
                            building_custom_id = building_record_for_pos['fields'].get('BuildingId') # We still get it for logging
                        
                            if building_position_str:
                                update_payload = {
                                    'Position': building_position_str,
                                    # 'CurrentBuildingId': building_custom_id, # Field does not exist
                                    'UpdatedAt': datetime.now(timezone.utc).isoformat()
                                }
                                tables['citizens'].update(citizen_record_for_pos['id'], update_payload)
                                log.info(f"Updated citizen {citizen_username} Position to {building_position_str} (Building: {building_custom_id}) and UpdatedAt.")
                            else:
                                log_msg = f"Building {to_building_airtable_id}"
                                if building_custom_id: # Safely use building_custom_id
                                    log_msg += f" (Custom ID: {building_custom_id})"
                                log_msg += f" is missing Position. Cannot update citizen {citizen_username} position."
                                log.warning(log_msg)
                        else: # This else corresponds to: if building_record_for_pos and citizen_record_for_pos:
                            if not building_record_for_pos:
                                log.warning(f"Target building {to_building_airtable_id} not found. Cannot update citizen {citizen_username} position.")
                            # This check is important if building_record_for_pos was True, but citizen_record_for_pos was False.
                            # Or if both were False, this will also log.
                            if not citizen_record_for_pos: 
                                log.warning(f"Citizen {citizen_username} not found. Cannot update citizen position.")
                except Exception as e_update_pos:
                    log.error(f"Error updating citizen {citizen_username} position after activity {activity_guid}: {e_update_pos}")
            elif dry_run and to_building_airtable_id and citizen_username:
                log.info(f"[DRY RUN] Would update citizen {citizen_username} position based on ToBuilding {to_building_airtable_id}.")

        else:
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
