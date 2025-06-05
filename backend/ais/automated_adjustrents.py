#!/usr/bin/env python3
"""
Automated Rent Adjustment script for La Serenissima.

This script allows AI citizens to automatically adjust the RentPrice of buildings they own
based on a specified strategy (low, standard, high).
"""

import os
import sys
import json
import traceback
import argparse
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import requests
import pytz # For timezone handling if needed for notifications
import statistics # Importer le module statistics
import requests # Added for API calls
# import json # json is already imported

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
log = logging.getLogger("automated_adjust_rents")

load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
# VENICE_TIMEZONE is imported from activity_helpers

# Import LogColors, log_header and VENICE_TIMEZONE from shared utils
from backend.engine.utils.activity_helpers import LogColors, log_header, VENICE_TIMEZONE

# --- Airtable Initialization ---
def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Airtable credentials not found.{LogColors.ENDC}")
        return None
    try:
        api = Api(airtable_api_key)
        base = Base(api, airtable_base_id)
        return {
            "citizens": base.table("CITIZENS"),
            "buildings": base.table("BUILDINGS"),
            "lands": base.table("LANDS"), # Needed for LeasePrice context
            "notifications": base.table("NOTIFICATIONS"),
        }
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

# --- Helper Functions ---
def _escape_airtable_value(value: Any) -> str:
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def get_ai_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Get AI citizens who own buildings."""
    try:
        # Fetch AI citizens who are in Venice
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        log.info(f"Found {len(ai_citizens)} AI citizens in Venice.")
        return ai_citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting AI citizens: {e}{LogColors.ENDC}")
        return []

def get_citizen_owned_buildings(tables: Dict[str, Table], owner_username: str) -> List[Dict]:
    """Get buildings owned by a specific citizen."""
    try:
        formula = f"{{Owner}}='{_escape_airtable_value(owner_username)}'"
        buildings = tables["buildings"].all(formula=formula)
        log.info(f"Found {len(buildings)} buildings owned by {owner_username}.")
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting buildings for {owner_username}: {e}{LogColors.ENDC}")
        return []

def get_all_buildings_data(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all building records for market analysis."""
    try:
        all_buildings = tables["buildings"].all()
        log.info(f"Fetched {len(all_buildings)} total buildings for market analysis.")
        return all_buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching all buildings data: {e}{LogColors.ENDC}")
        return []
        
def get_building_type_definitions() -> Dict[str, Dict]:
    """Fetch building type definitions from the API."""
    try:
        url = f"{API_BASE_URL}/api/building-types"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "buildingTypes" in data:
            return {bt["type"]: bt for bt in data["buildingTypes"] if "type" in bt}
        log.error(f"{LogColors.FAIL}Failed to parse building type definitions from API.{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching building type definitions: {e}{LogColors.ENDC}")
        return {}

def get_land_record(tables: Dict[str, Table], land_id_value: str) -> Optional[Dict]:
    """Fetches a land record by its LandId field value."""
    if not land_id_value:
        return None
    try:
        formula = f"{{LandId}}='{_escape_airtable_value(land_id_value)}'"
        records = tables["lands"].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching land record for LandId {land_id_value}: {e}{LogColors.ENDC}")
        return None

def calculate_new_rent_price(
    building_record: Dict,
    ai_owner_username: str,
    strategy: str,
    all_buildings_data: List[Dict],
    building_type_defs: Dict[str, Dict],
    tables: Dict[str, Table]
) -> Optional[float]:
    """Calculates a new rent price based on strategy, costs, and market."""
    fields = building_record['fields']
    building_type = fields.get('Type')
    building_category = fields.get('Category', '').lower()
    building_district = fields.get('District')
    current_rent = float(fields.get('RentPrice', 0.0) or 0.0)
    building_id = fields.get('BuildingId', building_record['id'])

    if not building_type or not building_category:
        log.warning(f"{LogColors.WARNING}Building {building_id} missing Type or Category. Cannot calculate rent.{LogColors.ENDC}")
        return None

    # --- Costs for the AI Owner ---
    maintenance_cost = float(building_type_defs.get(building_type, {}).get('maintenanceCost', 0.0) or 0.0)
    
    # Lease AI pays for the land, if AI doesn't own the land the building is on
    building_lease_paid_by_ai = 0.0
    land_id_of_building = fields.get('LandId')
    if land_id_of_building:
        land_record = get_land_record(tables, land_id_of_building)
        if land_record and land_record['fields'].get('Owner') != ai_owner_username:
            # AI owns building but not land, so Building.LeasePrice is a cost
            building_lease_paid_by_ai = float(fields.get('LeasePrice', 0.0) or 0.0)

    total_fixed_costs = maintenance_cost + building_lease_paid_by_ai

    # --- Market Rent Analysis ---
    similar_buildings_rents = []
    for b_data in all_buildings_data:
        if b_data['id'] == building_record['id']: continue # Skip self
        if b_data['fields'].get('Type') == building_type and \
           b_data['fields'].get('District') == building_district and \
           b_data['fields'].get('RentPrice') is not None:
            similar_buildings_rents.append(float(b_data['fields'].get('RentPrice', 0.0) or 0.0))
    
    market_median_rent = statistics.median(similar_buildings_rents) if similar_buildings_rents else current_rent # Fallback to current if no market data

    # --- Base Rent Calculation ---
    base_rent = 0.0
    if building_category == 'home':
        # For homes, target a profit margin over costs, influenced by market
        profit_margin = 1.2 # 20% over fixed costs
        cost_plus_rent = total_fixed_costs * profit_margin
        base_rent = (cost_plus_rent * 0.5) + (market_median_rent * 0.5) # Blend of cost-plus and market
    
    elif building_category == 'business':
        building_income = float(fields.get('Income', 0.0) or 0.0) # Income generated by the business in this building
        building_wages = float(fields.get('Wages', 0.0) or 0.0)   # Wages paid by the business in this building
        run_by_username = fields.get('RunBy')

        if run_by_username and run_by_username != ai_owner_username:
            # AI owns building, someone else runs business. Rent is for the business operator.
            # Operator's profit before rent: BuildingIncome - BuildingWages - Maintenance (paid by AI owner) - LeasePaidByAI (paid by AI owner)
            # The operator effectively sees (BuildingIncome - BuildingWages) as their gross operational profit.
            # Rent should be a share of this.
            operator_gross_profit = building_income - building_wages
            # Target rent as a share of operator's gross profit, ensuring it covers AI's costs for the building
            target_rent_from_profit = max(total_fixed_costs * 1.1, operator_gross_profit * 0.3) # e.g., 30% of gross profit or 10% above AI's costs
            base_rent = (target_rent_from_profit * 0.7) + (market_median_rent * 0.3) # Blend
        else:
            # AI owns and runs the business, or it's a type not typically "rented" to another operator (e.g. warehouse for self)
            # If it's an Inn, it's like 'home' category for rent setting.
            if building_type == 'inn':
                 profit_margin = 1.2
                 cost_plus_rent = total_fixed_costs * profit_margin
                 base_rent = (cost_plus_rent * 0.5) + (market_median_rent * 0.5)
            else: # For other businesses run by AI owner, RentPrice might be 0 or for specific internal use.
                 log.info(f"Building {building_id} is a business run by owner {ai_owner_username} and not an Inn. Rent calculation may not apply or needs specific logic. Current rent: {current_rent}")
                 return None # Or return current_rent if no change intended for these types

    else: # Other categories (e.g., public_service, transport) might not have RentPrice in the same way
        log.info(f"Building {building_id} category '{building_category}' not 'home' or 'business'. Skipping rent adjustment.")
        return None

    # --- Apply Strategy ---
    strategy_multipliers = {"low": 0.9, "standard": 1.0, "high": 1.10}
    multiplier = strategy_multipliers.get(strategy, 1.0)
    new_rent = base_rent * multiplier

    # Apply 5% change limit based on current_rent
    if current_rent > 0:
        change_limit = current_rent * 0.05
        max_rent_after_strategy = current_rent + change_limit
        min_rent_after_strategy = current_rent - change_limit

        original_new_rent_before_cap = new_rent # For logging
        if new_rent > max_rent_after_strategy:
            new_rent = max_rent_after_strategy
            log.info(f"Rent for {building_id} capped by +5% rule. Original: {original_new_rent_before_cap:.0f}, Capped: {new_rent:.0f} (Current: {current_rent:.0f})")
        elif new_rent < min_rent_after_strategy:
            new_rent = min_rent_after_strategy
            log.info(f"Rent for {building_id} floored by -5% rule. Original: {original_new_rent_before_cap:.0f}, Floored: {new_rent:.0f} (Current: {current_rent:.0f})")
    # If current_rent is 0, new_rent is determined by strategy without this 5% cap.

    # Ensure rent is not negative and at least covers fixed costs if strategy isn't 'low'
    if strategy == "low":
        new_rent = max(total_fixed_costs * 0.95, new_rent) # For low, can be slightly below cost to attract tenant
    else:
        new_rent = max(total_fixed_costs * 1.05, new_rent) # Standard/High should cover costs + small margin

    new_rent = max(0, round(new_rent / 5) * 5) # Round to nearest 5, ensure non-negative

    log.debug(f"Building {building_id} (Type: {building_type}, Cat: {building_category}, District: {building_district}): "
             f"Costs={total_fixed_costs:.0f}, MarketMedian={market_median_rent:.0f}, BaseCalc={base_rent:.0f}, Strategy='{strategy}', NewRent={new_rent:.0f} (Current: {current_rent:.0f})")

    return float(new_rent)

# Removed update_building_rent function as its logic is now handled by 'adjust_building_rent_price' activity

def notify_occupant(
    tables: Dict[str, Table], 
    occupant_username: str, 
    building_id: str, # Custom BuildingId
    building_name: str, # Building Name
    ai_owner_username: str, 
    old_rent: float, new_rent: float, 
    dry_run: bool
):
    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would notify occupant {occupant_username} of building {building_name} ({building_id}) about rent change from {old_rent:.2f} to {new_rent:.2f} by {ai_owner_username}.{LogColors.ENDC}")
        return
    
    building_display_name = building_name if building_name and building_name != building_id else building_id

    content = (f"📢 Rent Adjustment: The rent for your dwelling/business at **{building_display_name}** has been adjusted by the owner, **{ai_owner_username}**. "
               f"The new rent is **{new_rent:.2f} ⚜️ Ducats** (previously {old_rent:.2f} ⚜️ Ducats).")
    details = {
        "building_id": building_id,
        "building_name": building_display_name,
        "owner": ai_owner_username,
        "old_rent": old_rent,
        "new_rent": new_rent,
        "change_type": "rent_adjustment_automated"
    }
    try:
        tables["notifications"].create({
            "Citizen": occupant_username,
            "Type": "rent_change",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}Sent notification to occupant {occupant_username} for building {building_id}.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to send notification to {occupant_username}: {e}{LogColors.ENDC}")

def create_admin_summary_notification(tables: Dict[str, Table], results: List[Dict[str, Any]], dry_run: bool):
    if not results:
        log.info("No rent adjustments made, skipping admin notification.")
        return

    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would create admin summary for {len(results)} rent adjustments.{LogColors.ENDC}")
        return

    summary_message = f"📊 **Automated Rent Adjustments Summary** ({datetime.now(VENICE_TIMEZONE).strftime('%Y-%m-%d %H:%M')}):\n"
    for res in results:
        building_display_admin = res.get('building_name', res['building_id']) # Use name if available for admin too
        summary_message += (f"- 👤 AI Owner: **{res['ai_owner']}**, 🏠 Building: **{building_display_admin}** (Type: {res['building_type']}), "
                            f"Old Rent: {res['old_rent']:.0f} ⚜️, New Rent: **{res['new_rent']:.0f} ⚜️**, Strategy: {res['strategy']}\n")
    
    try:
        tables["notifications"].create({
            "Citizen": "ConsiglioDeiDieci",
            "Type": "admin_report_rent_adjust",
            "Content": summary_message[:1000], # Airtable content limit
            "Details": json.dumps({"adjustments": results, "report_time": datetime.now(VENICE_TIMEZONE).isoformat()}),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}📊 Admin summary notification created.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to create admin summary notification: {e}{LogColors.ENDC}")

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
        return True

    api_url = f"{API_BASE_URL}/api/activities/try-create"
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
def process_automated_rent_adjustments(strategy: str, dry_run: bool):
    log_header(f"Automated Rent Adjustment Process (Strategy: {strategy}, Dry Run: {dry_run})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables: return

    building_type_defs = get_building_type_definitions()
    if not building_type_defs: return

    all_buildings_data = get_all_buildings_data(tables) # For market analysis
    ai_citizens = get_ai_citizens(tables)
    
    rent_adjustment_results = []
    total_ai_citizens_for_rent = len(ai_citizens)
    log.info(f"Processing {total_ai_citizens_for_rent} AI citizens for rent adjustments.")

    for i, ai_citizen in enumerate(ai_citizens):
        ai_username = ai_citizen['fields'].get('Username')
        if not ai_username:
            log.warning(f"{LogColors.WARNING}AI citizen {ai_citizen['id']} missing Username, skipping.{LogColors.ENDC}")
            continue

        log.info(f"\nProcessing AI {i+1}/{total_ai_citizens_for_rent}: {ai_username}")
        owned_buildings = get_citizen_owned_buildings(tables, ai_username)
        total_owned_buildings = len(owned_buildings)
        # log.info(f"AI {ai_username} owns {total_owned_buildings} buildings. Processing each...")

        for j, building in enumerate(owned_buildings):
            building_airtable_id = building['id']
            building_id_custom = building['fields'].get('BuildingId', building_airtable_id)
            building_name_custom = building['fields'].get('Name', building_id_custom) # Get building name
            # log.info(f"  Processing building {j+1}/{total_owned_buildings}: {building_id_custom} (Airtable ID: {building_airtable_id}) owned by AI {ai_username}")
            current_rent_price = float(building['fields'].get('RentPrice', 0.0) or 0.0)
            building_type_str = building['fields'].get('Type')

            # Skip if building type is not found in definitions (e.g. "wall", "bridge")
            if building_type_str not in building_type_defs:
                log.debug(f"Building {building_id_custom} (Type: {building_type_str}) not in type definitions or not rentable. Skipping.")
                continue
            
            # Skip if building category is 'public_service' or 'transport' as they aren't typically rented by AIs this way
            building_category_str = building['fields'].get('Category','').lower()
            if building_category_str in ['public_service', 'transport']:
                 log.info(f"Building {building_id_custom} (Category: {building_category_str}) is not typically rented out by AIs. Skipping.")
                 continue


            new_rent = calculate_new_rent_price(
                building, ai_username, strategy, all_buildings_data, building_type_defs, tables
            )

            if new_rent is not None:
                # Only update if new rent is different by a meaningful amount (e.g., > 1 Ducat)
                if abs(new_rent - current_rent_price) > 1.0:
                    # Replace direct update with try-create activity
                    activity_params = {
                        "buildingId": building_id_custom,
                        "newRentPrice": new_rent,
                        "strategy": strategy
                        # targetOfficeBuildingId is optional and not determined here
                    }
                    if call_try_create_activity_api(ai_username, "adjust_building_rent_price", activity_params, dry_run, log):
                        rent_adjustment_results.append({
                            "ai_owner": ai_username,
                            "building_id": building_id_custom,
                            "building_name": building_name_custom, # Add name for admin summary
                            "building_type": building_type_str,
                            "old_rent": current_rent_price,
                            "new_rent": new_rent,
                            "strategy": strategy
                        })
                        occupant_username = building['fields'].get('Occupant')
                        if occupant_username:
                            notify_occupant(tables, occupant_username, building_id_custom, building_name_custom, ai_username, current_rent_price, new_rent, dry_run)
                else:
                    log.info(f"Building {building_name_custom} ({building_id_custom}): New rent {new_rent:.0f} is too close to current {current_rent_price:.0f}. No change.{LogColors.ENDC}")
            else:
                log.info(f"Building {building_id_custom}: No new rent calculated (e.g. non-rentable type or error). Current rent: {current_rent_price:.0f}{LogColors.ENDC}")

    create_admin_summary_notification(tables, rent_adjustment_results, dry_run)
    log.info(f"{LogColors.HEADER}Automated Rent Adjustment Process Completed.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automated Rent Adjustment for AI citizens.")
    parser.add_argument(
        "--strategy",
        type=str,
        choices=["low", "standard", "high"],
        default="standard",
        help="The rent adjustment strategy to use (low, standard, high)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the script without making actual changes to Airtable."
    )
    args = parser.parse_args()

    process_automated_rent_adjustments(strategy=args.strategy, dry_run=args.dry_run)
