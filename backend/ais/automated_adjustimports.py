#!/usr/bin/env python3
"""
Automated Adjust Imports script for La Serenissima.

This script automatically creates import contracts for AI citizens based on rules:
- Identifies AI citizens and their import-capable buildings.
- For each storable resource in such buildings, if no active import contract exists,
  it creates one with a default TargetAmount and PricePerResource based on importPrice.
"""

import os
import sys
import json
import traceback
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Base, Table
import argparse
import logging
import math # Importer le module math
import random # Importer le module random

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("automated_adjust_imports")

# Load environment variables
# Ensure PROJECT_ROOT is defined before this, or define it here if it's the first use.
# Assuming PROJECT_ROOT is correctly defined above.
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, LogColors, log_header # Import log_header

# DESIRED_STOCK_VALUE_TARGET = 1000.0 # Removed global constant
# New constants for dynamic calculation
AI_DUCAT_PERCENTAGE_FOR_STOCK = 0.10 # 10% of AI's ducats allocated to stock value
MAX_DESIRED_STOCK_VALUE_PER_BUILDING_PER_RESOURCE_TYPE = 7500.0 # Cap per resource type in a building
MIN_DESIRED_STOCK_VALUE_PER_BUILDING_PER_RESOURCE_TYPE = 500.0  # Floor if AI has some funds

# Import API fetching functions from activity_helpers
from backend.engine.utils.activity_helpers import (
    get_building_types_from_api,
    get_resource_types_from_api
)

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if airtable_api_key: airtable_api_key = airtable_api_key.strip()
    if airtable_base_id: airtable_base_id = airtable_base_id.strip()

    # DEBUG: Print a portion of the loaded credentials
    if airtable_api_key:
        log.info(f"DEBUG: API Key (first 5, last 5 chars): '{airtable_api_key[:5]}...{airtable_api_key[-5:]}' Length: {len(airtable_api_key)}")
    else:
        log.info("DEBUG: AIRTABLE_API_KEY is not loaded or is empty.")
    if airtable_base_id:
        log.info(f"DEBUG: Base ID: '{airtable_base_id}'")
    else:
        log.info("DEBUG: AIRTABLE_BASE_ID is not loaded or is empty.")

    if not airtable_api_key or not airtable_base_id:
        log.error("Error: Airtable credentials not found in environment variables")
        return None

    try:
        # custom_session = requests.Session() # Removed custom session creation
        # # custom_session.trust_env = False # Removed this line
        
        api = Api(airtable_api_key) # Instantiate Api, let it create and manage its own session
        # api.session = custom_session # Removed custom session assignment

        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "buildings": api.table(airtable_base_id, "BUILDINGS"),
            "contracts": api.table(airtable_base_id, "CONTRACTS"),
            "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
            "resources": api.table(airtable_base_id, "RESOURCES")
        }

        # Test connection with one primary table (e.g., citizens)
        log.info(f"{LogColors.OKBLUE}Testing Airtable connection by fetching one record from CITIZENS table...{LogColors.ENDC}")
        try:
            tables['citizens'].all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection successful.{LogColors.ENDC}")
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed for CITIZENS table: {conn_e}{LogColors.ENDC}")
            raise conn_e

        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable or connection test failed: {e}{LogColors.ENDC}")
        return None

from backend.engine.utils.activity_helpers import _escape_airtable_value # Import _escape_airtable_value

def get_ai_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Get all citizens that are marked as AI and are in Venice."""
    try:
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        log.info(f"Found {len(ai_citizens)} AI citizens in Venice")
        return ai_citizens
    except Exception as e:
        log.error(f"Error getting AI citizens: {str(e)}")
        return []

# Removed local get_building_types_from_api and get_resource_types_from_api
# They are now imported from activity_helpers.

def get_citizen_buildings(tables: Dict[str, Table], username: str) -> List[Dict]:
    """Get all buildings run by a specific citizen."""
    try:
        formula = f"{{RunBy}}='{_escape_airtable_value(username)}'"
        buildings = tables["buildings"].all(formula=formula)
        log.info(f"Found {len(buildings)} buildings run by {username}")
        return buildings
    except Exception as e:
        log.error(f"Error getting buildings for citizen {username}: {str(e)}")
        return []

def get_building_resource_stock(
    tables: Dict[str, Table],
    building_custom_id: str,
    resource_type_id: str,
    owner_username: str
) -> float:
    """Gets the current stock of a specific resource in a building for a given owner."""
    formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{Asset}}='{_escape_airtable_value(building_custom_id)}', "
               f"{{AssetType}}='building', "
               f"{{Owner}}='{_escape_airtable_value(owner_username)}')")
    try:
        records = tables['resources'].all(formula=formula, max_records=1)
        if records:
            return float(records[0]['fields'].get('Count', 0))
        return 0.0
    except Exception as e:
        log.error(f"Error fetching stock for resource {resource_type_id} in building {building_custom_id} for owner {owner_username}: {e}")
        return 0.0

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    # API_BASE_URL is defined globally in this script.
    if dry_run:
        log_ref.info(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return True # Simulate success for dry run

    api_url = f"{API_BASE_URL}/api/activities/try-create"
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        # This script already imports requests
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

def check_existing_import_contract(
    tables: Dict[str, Table],
    buyer_username: str,
    buyer_building_id: str,
    resource_type: str
) -> bool:
    """Checks if an active import contract already exists for the given parameters."""
    try:
        # ContractId is deterministic: contract-import-{BUYER_BUILDING_ID}-{RESOURCE_TYPE}
        deterministic_contract_id = f"contract-import-{buyer_building_id}-{resource_type}"
        
        formula = f"AND({{ContractId}}='{_escape_airtable_value(deterministic_contract_id)}', {{Type}}='import', {{Buyer}}='{_escape_airtable_value(buyer_username)}', {{BuyerBuilding}}='{_escape_airtable_value(buyer_building_id)}', {{ResourceType}}='{_escape_airtable_value(resource_type)}', {{EndAt}}>NOW())"
        
        existing_contracts = tables["contracts"].all(formula=formula, max_records=1)
        if existing_contracts:
            log.info(f"Active import contract {deterministic_contract_id} already exists for {buyer_username}, building {buyer_building_id}, resource {resource_type}.")
            return True
        return False
    except Exception as e:
        log.error(f"Error checking existing import contract for {buyer_building_id}, {resource_type}: {e}")
        return False # Assume not found on error to allow potential creation

def create_automated_import_contract(
    tables: Dict[str, Table],
    ai_username: str,
    building_id: str, # Custom BuildingId
    resource_type: str,
    import_price: float,
    desired_stock_value_for_this_resource: float, # New parameter
    dry_run: bool = False
) -> bool:
    """Creates an automated import contract with TargetAmount based on current stock and a dynamic desired stock value."""
    try:
        custom_contract_id = f"contract-import-{building_id}-{resource_type}"
        
        # VENICE_TIMEZONE is already imported
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        # end_date_venice = now_venice + timedelta(weeks=1) # Contract ends in 1 week # Duration handled by activity
        # end_date_iso = end_date_venice.isoformat()

        desired_total_stock_units = 0
        if import_price > 0:
            desired_total_stock_units = math.ceil(desired_stock_value_for_this_resource / import_price)
        else:
            log.warning(f"Import price for {resource_type} is {import_price}. Setting desired total stock units to a default (e.g., 10 units).")
            desired_total_stock_units = 10

        current_stock = get_building_resource_stock(tables, building_id, resource_type, ai_username)
        amount_to_request_in_contract = desired_total_stock_units - current_stock
        amount_to_request_in_contract = round(amount_to_request_in_contract, 2)

        if amount_to_request_in_contract < 1.0:
            if amount_to_request_in_contract > 0:
                log.info(f"Calculated TargetAmount for {resource_type} in {building_id} for {ai_username} is {amount_to_request_in_contract:.2f} (less than 1). Setting to 0, skipping contract.")
            amount_to_request_in_contract = 0.0
            
        if amount_to_request_in_contract <= 0:
            log.info(f"No import needed for {resource_type} in {building_id} for {ai_username}. Desired: {desired_total_stock_units}, Current: {current_stock}. Amount to request: {amount_to_request_in_contract}")
            return False

        log.info(f"For {resource_type} in {building_id} (Owner: {ai_username}): Desired total stock: {desired_total_stock_units:.2f} units (Target Value: ~{desired_stock_value_for_this_resource:.2f} Ducats). Current stock: {current_stock:.2f}. Amount to request in contract: {amount_to_request_in_contract:.2f}")

        # Prepare activity parameters
        activity_notes = {
            "reason": "Automated import contract creation for AI citizen.",
            "created_by": "automated_adjust_imports.py",
            "created_at": now_iso,
            "ContractId_logic": "deterministic"
        }
        activity_params = {
            "contractId_to_create_if_new": custom_contract_id,
            "resourceType": resource_type,
            "targetAmount": amount_to_request_in_contract,
            "pricePerResource": import_price,
            "buyerBuildingId": building_id,
            "title": f"Import {amount_to_request_in_contract:.0f} {resource_type} for {building_id}",
            "description": f"Automated import contract for {resource_type} to building {building_id}.",
            "notes": activity_notes
        }

        if dry_run:
            # Log what would be sent to call_try_create_activity_api
            log.info(f"[DRY RUN] Would attempt to initiate 'manage_import_contract' for {ai_username} with params: {json.dumps(activity_params)}")
            # Simulate the call for dry run logging consistency
            return call_try_create_activity_api(ai_username, "manage_import_contract", activity_params, dry_run, log)

        if call_try_create_activity_api(ai_username, "manage_import_contract", activity_params, dry_run, log):
            log.info(f"{LogColors.OKGREEN}Successfully initiated 'manage_import_contract' for {custom_contract_id} for {ai_username}, building {building_id}, resource {resource_type}{LogColors.ENDC}")
            return True
        else:
            log.error(f"{LogColors.FAIL}Failed to initiate 'manage_import_contract' for {custom_contract_id}.{LogColors.ENDC}")
            return False
            
    except Exception as e:
        log.error(f"Error preparing to initiate import contract for {building_id}, {resource_type}: {e}")
        log.error(traceback.format_exc())
        return False

def process_automated_imports(dry_run: bool = False, specific_buyer_building_id: Optional[str] = None):
    """Main function to process automated import contract creation."""
    header_message = "Automated Import Adjustment Process"
    if specific_buyer_building_id:
        header_message += f" for specific building {specific_buyer_building_id}"
    header_message += f" (dry_run={dry_run})"
    log_header(header_message, LogColors.HEADER)

    tables = initialize_airtable()
    if not tables:
        return

    building_type_defs = get_building_types_from_api()
    if not building_type_defs:
        log.error("Failed to get building type definitions, exiting.")
        return

    resource_type_defs = get_resource_types_from_api()
    if not resource_type_defs:
        log.error("Failed to get resource type definitions, exiting.")
        return

    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        log.info("No AI citizens found to process.")
        return

    contracts_created_count = 0
    contracts_skipped_count = 0
    total_ai_for_imports = len(ai_citizens)
    log.info(f"Processing {total_ai_for_imports} AI citizens for automated imports.")

    for i, citizen in enumerate(ai_citizens):
        ai_username = citizen["fields"].get("Username")
        ai_ducats = float(citizen["fields"].get("Ducats", 0.0))

        if not ai_username:
            log.warning(f"AI citizen {citizen['id']} missing Username, skipping.")
            continue

        # log.info(f"Processing AI citizen {i+1}/{total_ai_for_imports}: {ai_username} (Ducats: {ai_ducats:.2f})")
        all_citizen_run_buildings = get_citizen_buildings(tables, ai_username)
        
        buildings_to_process_for_this_ai = []
        if specific_buyer_building_id:
            # If a specific building is targeted, find it among the AI's run buildings
            found_specific_building = False
            for b_run in all_citizen_run_buildings:
                if b_run["fields"].get("BuildingId") == specific_buyer_building_id:
                    # Check if this specific building is eligible
                    b_type_str_spec = b_run["fields"].get("Type")
                    b_category_spec = b_run["fields"].get("Category", "").lower()
                    b_def_spec = building_type_defs.get(b_type_str_spec)
                    if b_category_spec == 'business' and b_def_spec and b_def_spec.get("canImport", False):
                        buildings_to_process_for_this_ai.append(b_run)
                        found_specific_building = True
                        log.info(f"Targeted building {specific_buyer_building_id} is run by {ai_username} and is eligible.")
                    else:
                        log.warning(f"Targeted building {specific_buyer_building_id} is run by {ai_username} but is not an eligible importing business building. Skipping for this AI.")
                    break 
            if not found_specific_building:
                log.info(f"Targeted building {specific_buyer_building_id} is not run by AI {ai_username}. Skipping for this AI.")
                continue # Skip to the next AI citizen if the specific building is not theirs
        else:
            # If no specific building, process all eligible buildings for this AI
            for b_run in all_citizen_run_buildings:
                b_type_str = b_run["fields"].get("Type")
                b_category = b_run["fields"].get("Category", "").lower()
                b_def = building_type_defs.get(b_type_str)
                if b_category == 'business' and b_def and b_def.get("canImport", False):
                    buildings_to_process_for_this_ai.append(b_run)
        
        num_eligible_buildings = len(buildings_to_process_for_this_ai)
        dynamic_desired_stock_value_per_building_per_resource = 0.0

        if num_eligible_buildings > 0 and ai_ducats > 0:
            calculated_value = (ai_ducats * AI_DUCAT_PERCENTAGE_FOR_STOCK) / num_eligible_buildings
            dynamic_desired_stock_value_per_building_per_resource = min(calculated_value, MAX_DESIRED_STOCK_VALUE_PER_BUILDING_PER_RESOURCE_TYPE)
            if ai_ducats > 1000: # Only apply floor if AI has a reasonable amount of money
                 dynamic_desired_stock_value_per_building_per_resource = max(dynamic_desired_stock_value_per_building_per_resource, MIN_DESIRED_STOCK_VALUE_PER_BUILDING_PER_RESOURCE_TYPE)
            log.debug(f"AI {ai_username}: {num_eligible_buildings} eligible importing business buildings. Dynamic desired stock value per resource type per building: {dynamic_desired_stock_value_per_building_per_resource:.2f} Ducats.")
        elif num_eligible_buildings == 0:
            log.debug(f"AI {ai_username} runs no eligible importing business buildings (or the specified one was not eligible/theirs). Skipping import contract creation for this AI.")
            continue # Skip to next AI if no eligible buildings
        else: # No ducats or other edge case
            log.debug(f"AI {ai_username} has {ai_ducats:.2f} Ducats or {num_eligible_buildings} eligible buildings. Desired stock value will be 0, likely no imports.")
            # dynamic_desired_stock_value_per_building_per_resource remains 0.0

        for building in buildings_to_process_for_this_ai: # Iterate only eligible buildings for this AI
            building_custom_id = building["fields"].get("BuildingId")
            building_name_log = building["fields"].get("Name", building_custom_id) # Get building name for logging
            building_type_str = building["fields"].get("Type") # Already known to be import-capable business
            building_def = building_type_defs.get(building_type_str) # Should exist

            storable_resources = building_def.get("productionInformation", {}).get("stores", [])
            if not storable_resources:
                log.debug(f"Building {building_name_log} ({building_custom_id}, type: {building_type_str}) has no storable resources defined, skipping.")
                continue

            # log.info(f"Processing building {building_name_log} ({building_custom_id}, RunBy: {ai_username}, Type: {building_type_str}). Storable resources: {storable_resources}")

            for resource_id in storable_resources:
                resource_def = resource_type_defs.get(resource_id)
                if not resource_def:
                    log.warning(f"Resource definition for '{resource_id}' not found, skipping for building {building_name_log} ({building_custom_id}).")
                    continue
                
                import_price = resource_def.get("importPrice")
                if import_price is None or float(import_price) <= 0:
                    log.warning(f"Resource '{resource_id}' has no valid importPrice ({import_price}), skipping for building {building_name_log} ({building_custom_id}).")
                    continue
                
                import_price_float = float(import_price)

                existing_contract_found = check_existing_import_contract(tables, ai_username, building_custom_id, resource_id)
                should_create_or_update = False

                if not existing_contract_found:
                    should_create_or_update = True
                    log.info(f"No active import contract found for {resource_id} in {building_name_log} ({building_custom_id}). Will attempt to create.")
                else: # Existing contract found
                    if random.random() < 0.1: # 10% chance to update
                        should_create_or_update = True
                        log.info(f"Active import contract found for {resource_id} in {building_name_log} ({building_custom_id}). Attempting update (10% chance).")
                    else:
                        log.info(f"Active import contract found for {resource_id} in {building_name_log} ({building_custom_id}). Skipping update (90% chance).")
                        contracts_skipped_count += 1
                
                if should_create_or_update:
                    # create_automated_import_contract now returns True if an activity was successfully initiated, False otherwise (e.g. amount_to_request <=0)
                    activity_initiated = create_automated_import_contract(
                        tables, ai_username, building_custom_id, resource_id, 
                        import_price_float, dynamic_desired_stock_value_per_building_per_resource,
                        dry_run=dry_run
                    )
                    if activity_initiated:
                        contracts_created_count += 1 # This counter now means "activity initiated for creation or update"
                    # If activity_initiated is False, it means create_automated_import_contract decided not to proceed (e.g., amount_to_request <= 0)
                    # In this case, it's effectively skipped, which is fine.
    
    log.info(f"Automated import adjustment process completed. Activities initiated for contract creation/update: {contracts_created_count}, Contracts skipped (existing and no update attempt or not needed): {contracts_skipped_count}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automated import contract creation for AI citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes to Airtable.")
    parser.add_argument("--buyerBuilding", type=str, help="Specify a single BuyerBuilding custom ID to process for its AI owner.")
    args = parser.parse_args()

    process_automated_imports(dry_run=args.dry_run, specific_buyer_building_id=args.buyerBuilding)
