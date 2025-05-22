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
from datetime import datetime
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_decay")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

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

    resource_definitions = get_resource_type_definitions()

    if not resource_definitions:
        log.warning("No resource definitions found. Exiting.")
        return

    log.info("Resource Definitions with Lifetime and Consumption Hours:")
    for resource_def in resource_definitions:
        res_id = resource_def.get("id")
        res_name = resource_def.get("name")
        lifetime_hours = resource_def.get("lifetimeHours")
        consumption_hours = resource_def.get("consumptionHours")

        log.info(
            f"Resource: ID='{res_id}', Name='{res_name}', "
            f"LifetimeHours={lifetime_hours}, ConsumptionHours={consumption_hours}"
        )

        if not dry_run:
            # Placeholder for actual decay logic:
            # 1. Fetch all existing resource instances of this type from Airtable RESOURCES table.
            # 2. For each instance, check its CreatedAt or UpdatedAt timestamp.
            # 3. If lifetimeHours is not null and (now - timestamp) > lifetimeHours,
            #    mark for decay or reduce count.
            # 4. If consumptionHours is relevant for a specific context (e.g., citizen consumption),
            #    that logic would be handled elsewhere or triggered by other events.
            #    This script focuses on passive decay based on lifetime.
            pass
        else:
            # log.info(f"[DRY RUN] Would process decay for resource ID '{res_id}'.")
            pass
            
    if dry_run:
        log.info("[DRY RUN] No actual changes were made.")
    else:
        # log.info("Actual decay processing would happen here.")
        pass


    log.info("Resource decay processing finished.")

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
