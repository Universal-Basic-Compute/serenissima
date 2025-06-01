#!/usr/bin/env python3
"""
Automated Public Sales and Price Management script for La Serenissima.

This script allows AI citizens to automatically create/update public_sell contracts
for resources their businesses can sell, based on a markup strategy applied to
the resource's importPrice.
"""

import os
import sys
import json
import traceback
import argparse
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Set
import requests
import pytz

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from dotenv import load_dotenv
from pyairtable import Api, Base, Table

# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("automated_manage_public_sales")

load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
VENICE_TIMEZONE = pytz.timezone('Europe/Rome')

class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

# Markup strategies: factor to multiply importPrice by (used as fallback or for non-produced items)
STRATEGY_IMPORT_PRICE_MARKUPS = {
    "low": 1.15, # Sell 15% above import price
    "standard": 1.30,
    "high": 1.50
}
# Profit margin strategies: factor to multiply calculated production cost by
STRATEGY_PRODUCTION_COST_MARGINS = {
    "low": 1.10,  # 10% profit margin over production cost
    "standard": 1.20, # 20% profit margin
    "high": 1.35   # 35% profit margin
}
DEFAULT_HOURLY_AMOUNT_TO_SELL = 5.0
ESTIMATED_LABOR_COST_PER_OUTPUT_UNIT = 15 # Ducats per unit of output, very rough estimate
CONTRACT_DURATION_HOURS = 47

# --- Airtable Initialization ---
def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Airtable credentials not found.{LogColors.ENDC}")
        return None
    try:
        # api = Api(airtable_api_key) # Not strictly needed
        # base = Base(api, airtable_base_id) # Not strictly needed
        tables = {
            "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
            "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
            "contracts": Table(airtable_api_key, airtable_base_id, "CONTRACTS"),
            "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS"),
            "resources": Table(airtable_api_key, airtable_base_id, "RESOURCES")
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

# --- Helper Functions ---
def _escape_airtable_value(value: Any) -> str:
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def get_ai_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Get AI citizens who are in Venice."""
    try:
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        log.info(f"Found {len(ai_citizens)} AI citizens in Venice.")
        return ai_citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting AI citizens: {e}{LogColors.ENDC}")
        return []

def get_citizen_run_businesses(tables: Dict[str, Table], run_by_username: str) -> List[Dict]:
    """Get business buildings run by a specific citizen."""
    try:
        formula = f"AND({{RunBy}}='{_escape_airtable_value(run_by_username)}', {{Category}}='business')"
        buildings = tables["buildings"].all(formula=formula)
        log.info(f"Found {len(buildings)} businesses run by {run_by_username}.")
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting businesses for {run_by_username}: {e}{LogColors.ENDC}")
        return []

def get_building_type_definitions() -> Dict[str, Dict]:
    """Fetch building type definitions from the API."""
    try:
        url = f"{API_BASE_URL}/api/building-types"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "buildingTypes" in data:
            defs = {}
            for bt in data["buildingTypes"]:
                if "type" in bt:
                    defs[bt["type"]] = {
                        "type": bt["type"],
                        "name": bt.get("name"),
                        "consumeTier": bt.get("consumeTier"),
                        "buildTier": bt.get("buildTier"),
                        "tier": bt.get("tier"),
                        "productionInformation": bt.get("productionInformation", {}),
                        # Inclure d'autres champs si nécessaire
                    }
            log.info(f"{LogColors.OKGREEN}Fetched {len(defs)} building type definitions.{LogColors.ENDC}")
            return defs
        log.error(f"{LogColors.FAIL}Failed to parse building type definitions from API.{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching building type definitions: {e}{LogColors.ENDC}")
        return {}

def get_resource_type_definitions() -> Dict[str, Dict]:
    """Fetch resource type definitions from the API."""
    try:
        url = f"{API_BASE_URL}/api/resource-types"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "resourceTypes" in data:
            defs = {rt["id"]: rt for rt in data["resourceTypes"] if "id" in rt}
            log.info(f"{LogColors.OKGREEN}Fetched {len(defs)} resource type definitions.{LogColors.ENDC}")
            return defs
        log.error(f"{LogColors.FAIL}Failed to parse resource type definitions from API.{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching resource type definitions: {e}{LogColors.ENDC}")
        return {}

def calculate_production_cost(
    resource_id_output: str,
    building_def: Dict,
    resource_type_defs: Dict[str, Dict]
) -> Optional[float]:
    """
    Calculates the production cost for a given output resource based on the first Arti recipe found.
    Cost = sum of (input_quantity * input_importPrice) + ESTIMATED_LABOR_COST_PER_OUTPUT_UNIT.
    Returns None if cost cannot be calculated (e.g., no recipe, missing import prices).
    """
    prod_info = building_def.get("productionInformation", {})
    if not isinstance(prod_info, dict):
        return None
        
    arti_recipes = prod_info.get("Arti", [])
    if not isinstance(arti_recipes, list):
        return None

    target_recipe = None
    for recipe in arti_recipes:
        if isinstance(recipe.get("outputs"), dict) and resource_id_output in recipe["outputs"]:
            target_recipe = recipe
            break # Use the first recipe found that produces this output

    if not target_recipe:
        log.debug(f"No Arti recipe found to produce {resource_id_output} in building type {building_def.get('type')}")
        return None

    inputs_cost = 0.0
    inputs_data = target_recipe.get("inputs", {})
    if not isinstance(inputs_data, dict):
        log.warning(f"Recipe for {resource_id_output} has invalid inputs data: {inputs_data}")
        return None

    for input_res_id, input_qty_needed in inputs_data.items():
        input_res_def = resource_type_defs.get(input_res_id)
        if not input_res_def:
            log.warning(f"Input resource {input_res_id} for {resource_id_output} not found in resource definitions. Cannot calculate cost.")
            return None
        
        input_import_price = input_res_def.get("importPrice")
        if input_import_price is None or float(input_import_price) <= 0:
            log.warning(f"Input resource {input_res_id} for {resource_id_output} has no valid importPrice ({input_import_price}). Cannot calculate cost.")
            return None
        
        inputs_cost += float(input_qty_needed) * float(input_import_price)

    # Assuming one unit of output from the recipe for simplicity of labor cost application
    # A more complex model could scale labor by craftMinutes or output quantity from recipe.
    total_production_cost = inputs_cost + ESTIMATED_LABOR_COST_PER_OUTPUT_UNIT
    log.info(f"Calculated production cost for {resource_id_output} (recipe in {building_def.get('type')}): Inputs={inputs_cost:.2f}, LaborEst={ESTIMATED_LABOR_COST_PER_OUTPUT_UNIT}, Total={total_production_cost:.2f}")
    return total_production_cost

def get_building_resource_stock(
    tables: Dict[str, Table], 
    building_custom_id: str, 
    resource_type_id: str, 
    owner_username: str # The operator (RunBy) of the business
) -> float:
    """Gets the stock of a specific resource type in a building owned/operated by a specific user."""
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

def create_or_update_public_sell_contract(
    tables: Dict[str, Table],
    seller_username: str,
    building_custom_id: str,
    resource_type_id: str,
    resource_name: str,
    price_per_resource: float,
    target_amount: float,
    dry_run: bool
) -> bool:
    """Creates or updates a public sell contract with a deterministic ContractId."""
    deterministic_contract_id = f"contract-public-sell-{seller_username}-{building_custom_id}-{resource_type_id}"
    
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()
    end_date_iso = (now_venice + timedelta(hours=CONTRACT_DURATION_HOURS)).isoformat()

    contract_fields = {
        "TargetAmount": 0.0, # Changed to 0.0 as per request
        "PricePerResource": price_per_resource,
        "EndAt": end_date_iso,
        "Notes": json.dumps({
            "reasoning": "Automated public sell contract management.",
            "managed_by_script": "automated_managepublicsalesandprices.py",
            "timestamp": now_iso
        })
    }

    # TargetAmount is now 0.0 as per request, title/desc will be set by activity
    title_for_activity = f"Public Sell: {target_amount:.0f}/hr {resource_name} from {building_custom_id}"
    description_for_activity = f"Automated public sell offer for {resource_name} from building {building_custom_id} by {seller_username}."

    activity_params = {
        "contractId_to_create_if_new": deterministic_contract_id,
        "resourceType": resource_type_id,
        "pricePerResource": price_per_resource,
        "targetAmount": 0.0, # As per request, actual amount logic in activity
        "sellerBuildingId": building_custom_id,
        "title": title_for_activity,
        "description": description_for_activity,
        "notes": json.loads(contract_fields["Notes"]) # Pass notes as dict
        # targetMarketBuildingId is optional for the activity
    }

    if call_try_create_activity_api(seller_username, "manage_public_sell_contract", activity_params, dry_run, log):
        log.info(f"Successfully initiated 'manage_public_sell_contract' for {deterministic_contract_id} for {resource_name}.")
        return True
    else:
        log.error(f"{LogColors.FAIL}Failed to initiate 'manage_public_sell_contract' for {deterministic_contract_id}.{LogColors.ENDC}")
        return False

def create_admin_summary_notification(tables: Dict[str, Table], results: List[Dict[str, Any]], dry_run: bool):
    if not results:
        log.info("No public sell contracts managed, skipping admin notification.")
        return

    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would create admin summary for {len(results)} public sell contract actions.{LogColors.ENDC}")
        return

    summary_message = f"Automated Public Sell Contract Management Summary ({datetime.now(VENICE_TIMEZONE).strftime('%Y-%m-%d %H:%M')}):\n"
    for res in results:
        building_display = res.get('building_name', res['building_id']) # Use name if available, else ID
        summary_message += (f"- AI: {res['ai_seller']}, Building: {building_display}, Resource: {res['resource_name']} ({res['resource_id']}), "
                            f"Price: {res['price']:.2f}, Amount: {res['amount']:.2f}/hr, Strategy: {res['strategy']}\n")
    
    try:
        tables["notifications"].create({
            "Citizen": "ConsiglioDeiDieci",
            "Type": "admin_report_auto_public_sell",
            "Content": summary_message[:1000],
            "Details": json.dumps({"managed_contracts": results, "report_time": datetime.now(VENICE_TIMEZONE).isoformat()}),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}Admin summary notification for public sales created.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to create admin summary notification for public sales: {e}{LogColors.ENDC}")

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
def process_automated_public_sales(strategy: str, dry_run: bool):
    log.info(f"{LogColors.HEADER}Starting Automated Public Sales & Price Management (Strategy: {strategy}, Dry Run: {dry_run}){LogColors.ENDC}")

    tables = initialize_airtable()
    if not tables: return

    building_type_defs = get_building_type_definitions()
    if not building_type_defs: return
    
    resource_type_defs = get_resource_type_definitions()
    if not resource_type_defs: return

    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        log.info("No AI citizens to process.")
        return
    
    # Get the appropriate markup/margin factors based on strategy
    import_price_markup_factor = STRATEGY_IMPORT_PRICE_MARKUPS.get(strategy, STRATEGY_IMPORT_PRICE_MARKUPS["standard"])
    production_cost_margin_factor = STRATEGY_PRODUCTION_COST_MARGINS.get(strategy, STRATEGY_PRODUCTION_COST_MARGINS["standard"])
    
    managed_contracts_summary = []

    for ai_citizen in ai_citizens:
        ai_username = ai_citizen['fields'].get('Username')
        ai_social_class = ai_citizen['fields'].get('SocialClass')

        if not ai_username:
            log.warning(f"{LogColors.WARNING}AI citizen {ai_citizen['id']} missing Username, skipping.{LogColors.ENDC}")
            continue

        if ai_social_class == 'Nobili':
            log.info(f"\n{LogColors.OKBLUE}AI citizen {ai_username} is Nobili. Skipping automated public sales management for businesses they might RunBy.{LogColors.ENDC}")
            continue

        log.info(f"\n{LogColors.OKCYAN}Processing AI Seller: {ai_username}{LogColors.ENDC}")
        run_businesses = get_citizen_run_businesses(tables, ai_username)

        for business_building in run_businesses:
            building_custom_id = business_building['fields'].get('BuildingId')
            building_type_str = business_building['fields'].get('Type')

            if not building_custom_id or not building_type_str:
                log.warning(f"{LogColors.WARNING}Business {business_building['id']} for AI {ai_username} missing BuildingId or Type, skipping.{LogColors.ENDC}")
                continue
            
            building_def = building_type_defs.get(building_type_str)
            if not building_def:
                log.warning(f"{LogColors.WARNING}Building type definition for '{building_type_str}' not found. Skipping business {building_custom_id}.{LogColors.ENDC}")
                continue

            sellable_resource_ids: Set[str] = set()
            prod_info = building_def.get("productionInformation", {})
            if isinstance(prod_info, dict):
                # From 'sells' list
                sells_list = prod_info.get("sells", [])
                if isinstance(sells_list, list):
                    for item_id in sells_list: sellable_resource_ids.add(item_id)
                
                # From 'Arti' recipes outputs
                arti_recipes = prod_info.get("Arti", [])
                if isinstance(arti_recipes, list):
                    for recipe in arti_recipes:
                        if isinstance(recipe.get("outputs"), dict):
                            for output_id in recipe["outputs"].keys():
                                sellable_resource_ids.add(output_id)
            
            if not sellable_resource_ids:
                log.info(f"Business {building_custom_id} (Type: {building_type_str}) has no defined sellable resources. Skipping.")
                continue

            log.info(f"Business {building_custom_id} (Type: {building_type_str}) can sell: {list(sellable_resource_ids)}.")

            for resource_id in sellable_resource_ids:
                resource_def = resource_type_defs.get(resource_id)
                if not resource_def:
                    log.warning(f"{LogColors.WARNING}Resource definition for '{resource_id}' not found. Skipping for business {building_custom_id}.{LogColors.ENDC}")
                    continue
                
                calculated_sell_price = None
                
                # Try to calculate price based on production cost first
                production_cost = calculate_production_cost(resource_id, building_def, resource_type_defs)
                
                if production_cost is not None:
                    calculated_sell_price = round(production_cost * production_cost_margin_factor, 2)
                    log.info(f"Resource {resource_id} (produced): ProdCost={production_cost:.2f}, MarginFactor={production_cost_margin_factor}, SellPrice={calculated_sell_price:.2f}")
                else:
                    # Fallback: if not producible by Arti or cost calc failed, use importPrice markup
                    import_price = resource_def.get("importPrice")
                    if import_price is not None and float(import_price) > 0:
                        import_price_float = float(import_price)
                        calculated_sell_price = round(import_price_float * import_price_markup_factor, 2)
                        log.info(f"Resource {resource_id} (not produced/cost error): ImportPrice={import_price_float:.2f}, MarkupFactor={import_price_markup_factor}, SellPrice={calculated_sell_price:.2f}")
                    else:
                        log.info(f"Resource '{resource_id}' has no valid importPrice ({import_price}) and no production cost. Cannot set automated public sell price. Skipping for business {building_custom_id}.")
                        continue
                
                if calculated_sell_price is None or calculated_sell_price <=0:
                    log.warning(f"Calculated sell price for {resource_id} is invalid ({calculated_sell_price}). Skipping.")
                    continue

                # Optional: Check stock before offering to sell
                # current_stock = get_building_resource_stock(tables, building_custom_id, resource_id, ai_username)
                # if current_stock < DEFAULT_HOURLY_AMOUNT_TO_SELL:
                #     log.info(f"Not enough stock of {resource_id} ({current_stock}) in {building_custom_id} to offer {DEFAULT_HOURLY_AMOUNT_TO_SELL}. Skipping contract creation.")
                #     continue

                if create_or_update_public_sell_contract(
                    tables, ai_username, building_custom_id, resource_id, 
                    resource_def.get("name", resource_id),
                    calculated_sell_price, DEFAULT_HOURLY_AMOUNT_TO_SELL, dry_run
                ):
                    building_name_for_summary = business_building['fields'].get('Name', building_custom_id) # Get building name
                    managed_contracts_summary.append({
                        "ai_seller": ai_username,
                        "building_id": building_custom_id,
                        "building_name": building_name_for_summary, # Add building name
                        "resource_id": resource_id,
                        "resource_name": resource_def.get("name", resource_id),
                        "price": calculated_sell_price,
                        "amount": DEFAULT_HOURLY_AMOUNT_TO_SELL,
                        "strategy": strategy
                    })
    
    create_admin_summary_notification(tables, managed_contracts_summary, dry_run)
    log.info(f"{LogColors.HEADER}Automated Public Sales & Price Management Process Completed.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automated public sales and price management for AI citizens.")
    parser.add_argument(
        "--strategy",
        type=str,
        choices=["low", "standard", "high"],
        default="standard",
        help="The pricing strategy to use (markup on importPrice)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the script without making actual changes to Airtable."
    )
    args = parser.parse_args()

    process_automated_public_sales(strategy=args.strategy, dry_run=args.dry_run)
