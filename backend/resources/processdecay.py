#!/usr/bin/env python3
"""
Script to process resource decay.
Fetches resource type definitions including lifetimeHours and consumptionHours
and prepares for decay processing.
"""

import os
import sys
import json
import logging
import argparse
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv
from pyairtable import Api, Table # Added Table

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_decay")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
RESOURCES_TABLE_NAME = "RESOURCES"

def initialize_airtable() -> Optional[Table]:
    """Initialize connection to Airtable and return the resources table."""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error("Airtable API Key or Base ID not found in environment variables.")
        return None
    try:
        api = Api(AIRTABLE_API_KEY)
        resources_table = api.table(AIRTABLE_BASE_ID, RESOURCES_TABLE_NAME)
        log.info(f"Successfully connected to Airtable base {AIRTABLE_BASE_ID}, table {RESOURCES_TABLE_NAME}.")
        return resources_table
    except Exception as e:
        log.error(f"Error initializing Airtable connection: {e}")
        return None

def get_resource_type_definitions() -> List[Dict[str, Any]]:
    """Fetch all resource type definitions from the API."""
    url = f"{API_BASE_URL}/api/resource-types"
    log.info(f"Fetching resource type definitions from {url}...")
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for HTTP errors
        data = response.json()
        if data.get("success") and "resourceTypes" in data:
            resource_types = data["resourceTypes"]
            log.info(f"Successfully fetched {len(resource_types)} resource type definitions.")
            return resource_types
        else:
            log.error(f"Failed to fetch resource types. API response: {data}")
            return []
    except requests.exceptions.RequestException as e:
        log.error(f"Error fetching resource types from API: {e}")
        return []
    except json.JSONDecodeError as e:
        log.error(f"Error decoding JSON response from API: {e}")
        return []

def main(dry_run: bool = False):
    """Main function to process resource decay."""
    log.info(f"Starting resource decay processing (dry_run={dry_run})...")

    resources_table = initialize_airtable()
    if not resources_table:
        log.error("Failed to initialize Airtable. Exiting.")
        return

    resource_definitions = get_resource_type_definitions()
    if not resource_definitions:
        log.warning("No resource definitions found. Exiting.")
        return

    now_utc = datetime.now(timezone.utc)
    decayed_count_total = 0

    for resource_def in resource_definitions:
        res_type_id = resource_def.get("id")
        res_name = resource_def.get("name")
        lifetime_hours = resource_def.get("lifetimeHours")

        if lifetime_hours is None or not isinstance(lifetime_hours, (int, float)) or lifetime_hours <= 0:
            # log.debug(f"Resource type '{res_name}' (ID: {res_type_id}) has no valid lifetimeHours. Skipping decay processing for it.")
            continue

        log.info(f"Processing decay for resource type: '{res_name}' (ID: {res_type_id}) with lifetime: {lifetime_hours} hours.")
        
        try:
            # Fetch all resource instances of this type
            # Assuming 'Type' field in RESOURCES table matches res_type_id
            formula = f"{{Type}} = '{res_type_id}'"
            resource_instances = resources_table.all(formula=formula)
            log.info(f"Found {len(resource_instances)} instances of '{res_name}'.")

            decayed_this_type = 0
            for instance in resource_instances:
                instance_id_airtable = instance['id']
                instance_custom_id = instance['fields'].get('ResourceId', instance_id_airtable)
                created_at_str = instance['fields'].get('CreatedAt')

                if not created_at_str:
                    log.warning(f"Resource instance {instance_custom_id} (Airtable ID: {instance_id_airtable}) is missing 'CreatedAt' field. Skipping.")
                    continue
                
                try:
                    # Airtable dates are usually ISO format and can be assumed to be UTC
                    # If they are naive, parse them as UTC
                    created_at_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                    if created_at_dt.tzinfo is None:
                        created_at_dt = created_at_dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    log.error(f"Could not parse 'CreatedAt' date '{created_at_str}' for resource instance {instance_custom_id}. Skipping.")
                    continue

                expiration_time = created_at_dt + timedelta(hours=lifetime_hours)

                if now_utc > expiration_time:
                    log.info(f"Resource instance {instance_custom_id} (Type: {res_type_id}) created at {created_at_dt.isoformat()} has expired (expiration: {expiration_time.isoformat()}).")
                    if not dry_run:
                        try:
                            resources_table.delete(instance_id_airtable)
                            log.info(f"Deleted expired resource instance {instance_custom_id} (Airtable ID: {instance_id_airtable}).")
                            decayed_this_type += 1
                        except Exception as e_delete:
                            log.error(f"Failed to delete resource instance {instance_custom_id} (Airtable ID: {instance_id_airtable}): {e_delete}")
                    else:
                        log.info(f"[DRY RUN] Would delete expired resource instance {instance_custom_id} (Airtable ID: {instance_id_airtable}).")
                        decayed_this_type += 1
            
            if decayed_this_type > 0:
                log.info(f"Processed {decayed_this_type} expired instances for resource type '{res_name}'.")
                decayed_count_total += decayed_this_type

        except Exception as e_fetch:
            log.error(f"Error fetching or processing instances for resource type '{res_name}': {e_fetch}")

    if dry_run:
        log.info(f"[DRY RUN] Resource decay processing finished. Would have decayed {decayed_count_total} resource instances.")
    else:
        log.info(f"Resource decay processing finished. Decayed {decayed_count_total} resource instances.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process resource decay based on lifetime hours.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes.",
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
