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
3. Updates the activity status to "processed" or "failed".
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
            processed_count +=1
        else:
            update_activity_status(tables, activity_id_airtable, "failed")
            failed_count +=1
        
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
