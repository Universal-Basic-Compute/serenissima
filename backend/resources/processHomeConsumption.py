#!/usr/bin/env python3
"""
Script to process resource consumption in homes.
For each occupied home, it checks resources owned by the occupant and stored in the home.
It then consumes these resources based on their 'consumptionHours'.
"""

import os
import sys
import json
import logging
import argparse
import math # Added import
import requests
from datetime import datetime, timedelta, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv
from pyairtable import Api, Table

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_home_consumption")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
BUILDINGS_TABLE_NAME = "BUILDINGS"
RESOURCES_TABLE_NAME = "RESOURCES"
CITIZENS_TABLE_NAME = "CITIZENS" # Added for fetching citizen details if needed

def _escape_airtable_value(value: str) -> str:
    """Escapes single quotes for Airtable formulas."""
    if isinstance(value, str):
        return value
    return str(value)

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable and return table objects."""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error("Airtable API Key or Base ID not found in environment variables.")
        return None
    try:
        api = Api(AIRTABLE_API_KEY)
        tables = {
            BUILDINGS_TABLE_NAME: api.table(AIRTABLE_BASE_ID, BUILDINGS_TABLE_NAME),
            RESOURCES_TABLE_NAME: api.table(AIRTABLE_BASE_ID, RESOURCES_TABLE_NAME),
            CITIZENS_TABLE_NAME: api.table(AIRTABLE_BASE_ID, CITIZENS_TABLE_NAME),
        }
        log.info(f"Successfully connected to Airtable base {AIRTABLE_BASE_ID}.")
        return tables
    except Exception as e:
        log.error(f"Error initializing Airtable connection: {e}")
        return None

def get_resource_type_definitions() -> Dict[str, Dict[str, Any]]:
    """Fetch all resource type definitions from the API and return as a dict keyed by resource id."""
    url = f"{API_BASE_URL}/api/resource-types"
    log.info(f"Fetching resource type definitions from {url}...")
    definitions = {}
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "resourceTypes" in data:
            resource_types_list = data["resourceTypes"]
            for res_type in resource_types_list:
                if 'id' in res_type:
                    definitions[res_type['id']] = res_type
            log.info(f"Successfully fetched and processed {len(definitions)} resource type definitions.")
            return definitions
        else:
            log.error(f"Failed to fetch resource types. API response: {data}")
            return {}
    except requests.exceptions.RequestException as e:
        log.error(f"Error fetching resource types from API: {e}")
        return {}
    except json.JSONDecodeError as e:
        log.error(f"Error decoding JSON response from API: {e}")
        return {}

def get_home_buildings(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all buildings categorized as 'Home'."""
    log.info("Fetching home buildings...")
    try:
        home_buildings = tables[BUILDINGS_TABLE_NAME].all(formula="{Category} = 'Home'")
        log.info(f"Found {len(home_buildings)} home buildings.")
        return home_buildings
    except Exception as e:
        log.error(f"Error fetching home buildings: {e}")
        return []

def get_resources_in_home_for_occupant(tables: Dict[str, Table], building_custom_id: str, occupant_username: str) -> List[Dict]:
    """Fetch resources stored in a specific home building and owned by the occupant."""
    log.info(f"Fetching resources in building '{building_custom_id}' for occupant '{occupant_username}'...")
    # For building resources, Asset field stores BuildingId
    formula = f"AND({{Asset}}='{_escape_airtable_value(building_custom_id)}', {{AssetType}}='building', {{Owner}}='{_escape_airtable_value(occupant_username)}')"
    try:
        resources = tables[RESOURCES_TABLE_NAME].all(formula=formula)
        log.info(f"Found {len(resources)} resources for occupant '{occupant_username}' in building '{building_custom_id}'.")
        return resources
    except Exception as e:
        log.error(f"Error fetching resources for building '{building_custom_id}', occupant '{occupant_username}': {e}")
        return []

def main(dry_run: bool = False):
    """Main function to process home resource consumption."""
    log.info(f"Starting home resource consumption processing (dry_run={dry_run})...")

    tables = initialize_airtable()
    if not tables:
        log.error("Failed to initialize Airtable. Exiting.")
        return

    resource_definitions = get_resource_type_definitions()
    if not resource_definitions:
        log.warning("No resource definitions found. Exiting.")
        return

    home_buildings = get_home_buildings(tables)
    if not home_buildings:
        log.info("No home buildings found. Exiting.")
        return

    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    now_venice = datetime.now(VENICE_TIMEZONE) # Use Venice time for 'ConsumedAt'
    now_utc = datetime.now(timezone.utc) # Keep UTC for age calculation if timestamps are UTC
    total_consumed_count = 0
    processed_homes = 0

    for home_building in home_buildings:
        building_fields = home_building['fields']
        building_custom_id = building_fields.get('BuildingId')
        occupant_username_link = building_fields.get('Occupant') # This is Airtable Link

        if not building_custom_id:
            log.warning(f"Home building Airtable ID {home_building['id']} is missing 'BuildingId'. Skipping.")
            continue
        
        if not occupant_username_link:
            log.info(f"Home building '{building_custom_id}' has no occupant. Skipping.")
            continue
        
        actual_occupant_username = None
        # In Airtable, a linked record field (even single link) returns a list of record IDs.
        if isinstance(occupant_username_link, list) and len(occupant_username_link) > 0:
            try:
                occupant_record_id = occupant_username_link[0] # Take the first linked record
                occupant_citizen_record = tables[CITIZENS_TABLE_NAME].get(occupant_record_id)
                if occupant_citizen_record:
                    actual_occupant_username = occupant_citizen_record['fields'].get('Username')
                else:
                    log.warning(f"Could not fetch citizen record for occupant ID {occupant_record_id} in home {building_custom_id}.")
            except Exception as e_fetch_occ:
                log.error(f"Error fetching occupant details for home {building_custom_id}: {e_fetch_occ}")
        # If Occupant was directly a username string (less common for linked fields but to be safe)
        elif isinstance(occupant_username_link, str):
             actual_occupant_username = occupant_username_link

        if not actual_occupant_username:
            log.warning(f"Could not determine occupant username for home {building_custom_id}. Skipping.")
            continue
            
        log.info(f"Processing home: {building_custom_id}, Occupant: {actual_occupant_username}")
        processed_homes += 1

        resources_to_consume = get_resources_in_home_for_occupant(tables, building_custom_id, actual_occupant_username)

        for resource_instance in resources_to_consume:
            instance_id_airtable = resource_instance['id']
            instance_fields = resource_instance['fields']
            resource_type_id = instance_fields.get('Type')
            current_count = float(instance_fields.get('Count', 0))
            
            resource_def = resource_definitions.get(resource_type_id)
            if not resource_def:
                log.warning(f"No definition found for resource type '{resource_type_id}' in instance {instance_id_airtable}. Skipping.")
                continue

            consumption_hours = resource_def.get('consumptionHours')
            if consumption_hours is None or not isinstance(consumption_hours, (int, float)) or consumption_hours <= 0:
                continue

            last_consumed_at_str = instance_fields.get('ConsumedAt') or instance_fields.get('UpdatedAt') or instance_fields.get('CreatedAt')
            if not last_consumed_at_str:
                log.warning(f"Resource instance {instance_id_airtable} (Type: {resource_type_id}) is missing consumption/update/creation timestamp. Skipping.")
                continue
            
            try:
                # Ensure the timestamp string is correctly formatted for fromisoformat
                # It expects ISO 8601 format, e.g., "YYYY-MM-DDTHH:MM:SS.ffffff[+HH:MM|-HH:MM|Z]"
                # Airtable's DATETIME_FORMAT usually includes 'Z' for UTC.
                if last_consumed_at_str.endswith('Z'):
                    last_consumed_dt = datetime.fromisoformat(last_consumed_at_str[:-1] + "+00:00")
                else:
                    last_consumed_dt = datetime.fromisoformat(last_consumed_at_str)
                
                if last_consumed_dt.tzinfo is None:
                    last_consumed_dt = last_consumed_dt.replace(tzinfo=timezone.utc)
            except ValueError as ve:
                log.error(f"Could not parse timestamp '{last_consumed_at_str}' for resource instance {instance_id_airtable}. Error: {ve}. Skipping.")
                continue

            hours_passed = (now_utc - last_consumed_dt).total_seconds() / 3600
            if hours_passed < 0: hours_passed = 0 

            units_to_consume = int(hours_passed // consumption_hours) # Number of consumption cycles

            if units_to_consume > 0:
                # Consider only the whole units available for consumption
                available_whole_units = math.floor(current_count)
                actual_units_consumed = min(units_to_consume, available_whole_units)
                
                if actual_units_consumed > 0:
                    # Subtract the integer amount consumed from the potentially fractional current_count
                    new_count = current_count - actual_units_consumed 
                    log_message = (f"Occupant {actual_occupant_username} in home {building_custom_id} "
                                   f"consumes {actual_units_consumed:.2f} unit(s) of {resource_type_id}. "
                                   f"Old count: {current_count:.2f}, New count: {new_count:.2f}.")

                    if not dry_run:
                        try:
                            update_payload = {"ConsumedAt": now_venice.isoformat()} # Use Venice time ISO string
                            if new_count > 0.001: 
                                update_payload["Count"] = new_count
                                tables[RESOURCES_TABLE_NAME].update(instance_id_airtable, update_payload)
                            else:
                                tables[RESOURCES_TABLE_NAME].delete(instance_id_airtable)
                                log_message += " (Resource depleted and removed)."
                            
                            log.info(log_message)
                            total_consumed_count += actual_units_consumed
                        except Exception as e_update:
                            log.error(f"Failed to update resource instance {instance_id_airtable}: {e_update}")
                    else:
                        log.info(f"[DRY RUN] {log_message}")
                        total_consumed_count += actual_units_consumed
    
    log_summary = (f"Home resource consumption processing finished. "
                   f"Processed {processed_homes} homes. "
                   f"{'Would have consumed' if dry_run else 'Consumed'} {total_consumed_count:.2f} resource units in total.")
    log.info(log_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process resource consumption in homes.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging."
    )
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG) 
        log.setLevel(logging.DEBUG) 

    main(dry_run=args.dry_run)
