#!/usr/bin/env python3
"""
Automated Adjust Public Storage Contracts script for La Serenissima.

This script creates or updates "public_storage" contracts for AI citizens
who own/run storage buildings. For each storable resource in such buildings,
it creates three contracts (low, standard, high price) offering storage capacity.
"""

import os
import sys
import json
import traceback
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
import argparse
import logging
import math

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("automated_adjustpublicstoragecontracts")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, LogColors, log_header # Import LogColors and log_header
CONTRACT_DURATION_WEEKS = 1 # New contracts will be valid for this many weeks

# Price tier multipliers based on importPrice (per unit per day)
PRICE_TIER_MULTIPLIERS = {
    "low": 0.01,
    "standard": 0.02,
    "high": 0.03,
}
DEFAULT_PRICING_TIERS = ["standard"] # Default if --pricing is not provided
DEFAULT_STORAGE_CAPACITY_PER_RESOURCE_TYPE = 100 # Fallback if calculation fails

# LogColors is now imported from activity_helpers

# --- Helper Functions ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Error: Airtable credentials not found in environment variables.{LogColors.ENDC}")
        return None

    try:
        # session = requests.Session() # Removed custom session
        # session.trust_env = False    # Removed custom session configuration
        api = Api(airtable_api_key) # Let Api manage its own session
        # api.session = session # Removed custom session assignment

        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "buildings": api.table(airtable_base_id, "BUILDINGS"),
            "contracts": api.table(airtable_base_id, "CONTRACTS"),
            "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

from backend.engine.utils.activity_helpers import _escape_airtable_value # Import _escape_airtable_value

# Import API fetching functions from activity_helpers
from backend.engine.utils.activity_helpers import (
    get_building_types_from_api,
    get_resource_types_from_api
)

# Removed local get_building_types_from_api and get_resource_types_from_api

def get_storage_buildings(tables: Dict[str, Table]) -> List[Dict]:
    """Fetches all buildings with SubCategory 'storage'."""
    try:
        formula = "{SubCategory} = 'storage'"
        storage_buildings = tables["buildings"].all(formula=formula)
        log.info(f"Found {len(storage_buildings)} storage buildings.")
        return storage_buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching storage buildings: {e}{LogColors.ENDC}")
        return []

def get_resource_name(resource_id: str, resource_type_defs: Dict[str, Dict]) -> str:
    """Gets the human-readable name of a resource."""
    return resource_type_defs.get(resource_id, {}).get("name", resource_id)

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        log_ref.info(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return True # Simulate success for dry run

    api_url = f"{API_BASE_URL}/api/activities/try-create" # API_BASE_URL is global
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        if response_data.get("success"):
            log_ref.info(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{LogColors.ENDC}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 log_ref.info(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            log_ref.error(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        log_ref.error(f"{LogColors.FAIL}API request failed for activity '{activity_type}' for {citizen_username}: {e}{LogColors.ENDC}")
        return False
    except json.JSONDecodeError:
        log_ref.error(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return False

# --- Main Processing Logic ---

def process_public_storage_contracts(dry_run: bool = False, pricing_tiers_str: Optional[str] = None):
    selected_tiers = DEFAULT_PRICING_TIERS
    if pricing_tiers_str:
        selected_tiers = [tier.strip().lower() for tier in pricing_tiers_str.split(',') if tier.strip()]
        # Validate selected_tiers against PRICE_TIER_MULTIPLIERS keys
        valid_tiers = [tier for tier in selected_tiers if tier in PRICE_TIER_MULTIPLIERS]
        if len(valid_tiers) != len(selected_tiers):
            invalid_tiers = [tier for tier in selected_tiers if tier not in PRICE_TIER_MULTIPLIERS]
            log.warning(f"{LogColors.WARNING}Invalid pricing tiers specified: {invalid_tiers}. Using valid ones: {valid_tiers} or default if none valid.{LogColors.ENDC}")
            selected_tiers = valid_tiers
        if not selected_tiers: # If all specified tiers were invalid or string was empty
            log.warning(f"{LogColors.WARNING}No valid pricing tiers provided. Defaulting to: {DEFAULT_PRICING_TIERS}{LogColors.ENDC}")
            selected_tiers = DEFAULT_PRICING_TIERS
    
    log_header(f"Public Storage Contract Adjustment Process (dry_run={dry_run}, pricing_tiers={selected_tiers})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables:
        return

    building_type_defs = get_building_types_from_api()
    if not building_type_defs:
        log.error(f"{LogColors.FAIL}Failed to get building type definitions. Aborting.{LogColors.ENDC}")
        return

    resource_type_defs = get_resource_types_from_api()
    if not resource_type_defs:
        log.error(f"{LogColors.FAIL}Failed to get resource type definitions. Aborting.{LogColors.ENDC}")
        return

    storage_buildings = get_storage_buildings(tables)
    if not storage_buildings:
        log.info("No storage buildings found. Exiting.")
        return

    total_contracts_managed = 0 # Counts created or updated

    for building_record in storage_buildings:
        building_fields = building_record['fields']
        seller_building_id = building_fields.get('BuildingId')
        building_type_str = building_fields.get('Type')
        seller_username = building_fields.get('RunBy')
        building_name = building_fields.get('Name', seller_building_id)

        if not all([seller_building_id, building_type_str, seller_username]):
            log.warning(f"Storage building {building_record['id']} is missing BuildingId, Type, or RunBy. Skipping.")
            continue

        log.info(f"Processing storage building: {LogColors.OKBLUE}{building_name} ({seller_building_id}){LogColors.ENDC}, RunBy: {seller_username}")

        building_def = building_type_defs.get(building_type_str)
        if not building_def:
            log.warning(f"  Definition for building type '{building_type_str}' not found. Skipping.")
            continue

        prod_info = building_def.get('productionInformation', {})
        storable_resources = prod_info.get('stores', [])
        total_storage_capacity = float(prod_info.get('storageCapacity', 0))

        if not storable_resources:
            log.info(f"  Building {building_name} has no storable resources defined. Skipping.")
            continue
        if total_storage_capacity <= 0:
            log.info(f"  Building {building_name} has no storage capacity ({total_storage_capacity}). Skipping.")
            continue

        capacity_per_resource_type = DEFAULT_STORAGE_CAPACITY_PER_RESOURCE_TYPE
        if len(storable_resources) > 0 :
            # Multiply the calculated capacity per resource type by 5
            capacity_per_resource_type = math.floor(total_storage_capacity / len(storable_resources)) * 5
        
        if capacity_per_resource_type <=0:
            log.warning(f"  Calculated capacity per resource type for {building_name} is <=0 ({capacity_per_resource_type}). Using default {DEFAULT_STORAGE_CAPACITY_PER_RESOURCE_TYPE}.")
            capacity_per_resource_type = DEFAULT_STORAGE_CAPACITY_PER_RESOURCE_TYPE


        log.info(f"  Total capacity: {total_storage_capacity}, Storable types: {len(storable_resources)}, Capacity per type: {capacity_per_resource_type}")

        for resource_id in storable_resources:
            resource_def = resource_type_defs.get(resource_id)
            if not resource_def:
                log.warning(f"    Resource definition for '{resource_id}' not found. Skipping.")
                continue

            import_price = float(resource_def.get('importPrice', 0))
            if import_price <= 0:
                log.warning(f"    Resource '{resource_id}' has invalid importPrice ({import_price}). Skipping contract creation for this resource.")
                continue
            
            resource_name_log = get_resource_name(resource_id, resource_type_defs)
            
            # The contract_id is now unique per building and resource, not per tier.
            # If multiple tiers are processed, the last one will overwrite the contract details.
            contract_id = f"public_storage_{seller_building_id}_{resource_id}"

            for tier_name in selected_tiers: # Iterate over selected tiers from command line
                multiplier = PRICE_TIER_MULTIPLIERS.get(tier_name)
                if multiplier is None:
                    log.warning(f"    Unknown pricing tier '{tier_name}' requested. Skipping this tier for resource {resource_id}.")
                    continue

                price_per_unit_capacity_daily = round(import_price * multiplier, 2)
                if price_per_unit_capacity_daily < 0.01: # Ensure a minimum price
                    price_per_unit_capacity_daily = 0.01
                
                now = datetime.now(VENICE_TIMEZONE)
                end_at = now + timedelta(weeks=CONTRACT_DURATION_WEEKS)

                # Title no longer includes tier_name as ContractId is unique per resource
                title = f"Store {resource_name_log}"
                description = (f"Rent storage space for {resource_name_log} at {building_name}. "
                               f"Price: {price_per_unit_capacity_daily} Ducats per unit per day. "
                               f"Capacity offered: {capacity_per_resource_type} units.")
                notes_payload = {
                    "price_tier": tier_name, # Still useful to know how the current price was derived
                    "calculation_basis": f"{multiplier*100}% of importPrice ({import_price}) per day",
                    "original_import_price": import_price,
                    "daily_rate_per_unit": price_per_unit_capacity_daily,
                    "offered_capacity_units": capacity_per_resource_type,
                    "created_by_script": "automated_adjustpublicstoragecontracts.py"
                }

                contract_payload = {
                    "ContractId": contract_id,
                    "Type": "public_storage",
                    "Seller": seller_username,
                    "SellerBuilding": seller_building_id,
                    "ResourceType": resource_id,
                    "PricePerResource": price_per_unit_capacity_daily, # Interpreted as price per unit capacity per day
                    "TargetAmount": capacity_per_resource_type, # Capacity offered
                    "Status": "active",
                    "Priority": 5, 
                    "CreatedAt": now.isoformat(),
                    "EndAt": end_at.isoformat(),
                    "Title": title,
                    "Description": description,
                    "Notes": json.dumps(notes_payload)
                    # Buyer, BuyerBuilding, Transporter are null for this offer type
                }

                activity_params = {
                    "contractId_to_create_if_new": contract_id, # For activity to find/create
                    "sellerBuildingId": seller_building_id,
                    "resourceType": resource_id,
                    "capacityOffered": capacity_per_resource_type,
                    "pricePerUnitPerDay": price_per_unit_capacity_daily,
                    "pricingStrategy": tier_name,
                    "title": title,
                    "description": description,
                    "notes": notes_payload # Pass as dict
                    # durationDays can be derived by activity creator from CONTRACT_DURATION_WEEKS
                }
                
                # Check if contract exists to adjust counting logic for total_contracts_managed
                # This check is outside the dry_run block because it's needed for both.
                existing_contract_record = tables["contracts"].all(formula=f"{{ContractId}}='{_escape_airtable_value(contract_id)}'", max_records=1)

                if call_try_create_activity_api(seller_username, "manage_public_storage_offer", activity_params, dry_run, log):
                    # Increment total_contracts_managed only once per unique contract_id managed in this run
                    if not existing_contract_record: # If it was a creation
                        total_contracts_managed += 1
                    elif existing_contract_record and tier_name == selected_tiers[0]: # If it was an update, count only for the first tier processed
                        total_contracts_managed += 1
                    log.info(f"    Successfully initiated 'manage_public_storage_offer' for {contract_id} (Resource: {resource_name_log}, Tier: {tier_name}).")
                else:
                    log.error(f"    {LogColors.FAIL}Failed to initiate 'manage_public_storage_offer' for {contract_id} (Resource: {resource_name_log}, Tier: {tier_name}).{LogColors.ENDC}")

    log.info(f"{LogColors.OKGREEN}Public Storage Contract Adjustment process finished.{LogColors.ENDC}")
    log.info(f"Total contracts created or updated (or simulated): {total_contracts_managed}")

# --- Main Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automate creation/update of 'public_storage' contracts.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to Airtable."
    )
    parser.add_argument(
        "--pricing",
        type=str,
        default="standard", # Default to "standard" if not provided
        help="Comma-separated list of pricing tiers to process (e.g., 'low,standard,high'). Valid tiers: low, standard, high. Defaults to 'standard'."
    )
    args = parser.parse_args()

    process_public_storage_contracts(dry_run=args.dry_run, pricing_tiers_str=args.pricing)
