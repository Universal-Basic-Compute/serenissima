#!/usr/bin/env python3
"""
Automated Wage Adjustment script for La Serenissima.

This script allows AI citizens who run businesses to automatically adjust the Wages
offered for jobs in those business buildings, based on a specified strategy.
"""

import os
import sys
import json
import traceback
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
import requests
import pytz
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
log = logging.getLogger("automated_adjust_wages")

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
    """Get AI citizens who might run businesses."""
    try:
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        log.info(f"Found {len(ai_citizens)} AI citizens in Venice.")
        return ai_citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting AI citizens: {e}{LogColors.ENDC}")
        return []

def get_businesses_run_by_citizen(tables: Dict[str, Table], run_by_username: str) -> List[Dict]:
    """Get business buildings run by a specific citizen."""
    try:
        formula = f"AND({{RunBy}}='{_escape_airtable_value(run_by_username)}', {{Category}}='business')"
        buildings = tables["buildings"].all(formula=formula)
        log.info(f"Found {len(buildings)} businesses run by {run_by_username}.")
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting businesses for {run_by_username}: {e}{LogColors.ENDC}")
        return []

def get_all_business_buildings_data(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all business building records for market wage analysis."""
    try:
        all_businesses = tables["buildings"].all(formula="{Category}='business'")
        log.info(f"Fetched {len(all_businesses)} total business buildings for market analysis.")
        return all_businesses
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching all business buildings data: {e}{LogColors.ENDC}")
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

def get_citizen_record(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    """Fetches a citizen record by username."""
    if not username: return None
    try:
        formula = f"{{Username}}='{_escape_airtable_value(username)}'"
        records = tables["citizens"].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching citizen {username}: {e}{LogColors.ENDC}")
        return None

def calculate_new_wage(
    business_building_record: Dict,
    ai_operator_username: str,
    strategy: str,
    all_businesses_data: List[Dict],
    building_type_defs: Dict[str, Dict],
    tables: Dict[str, Table] # To fetch occupant details
) -> Optional[float]:
    """Calculates a new wage for a business building."""
    fields = business_building_record['fields']
    building_type = fields.get('Type')
    building_district = fields.get('District')
    current_wages = float(fields.get('Wages', 0.0) or 0.0)
    building_id = fields.get('BuildingId', business_building_record['id'])
    building_income = float(fields.get('Income', 0.0) or 0.0)
    # RentPrice is a cost to the business operator (RunBy) if they don't own the building
    rent_cost_for_business = 0.0
    building_owner_username = fields.get('Owner')
    if building_owner_username != ai_operator_username: # AI runs it but doesn't own it
        rent_cost_for_business = float(fields.get('RentPrice', 0.0) or 0.0)

    occupant_username = fields.get('Occupant') # Current worker

    if not building_type:
        log.warning(f"{LogColors.WARNING}Business {building_id} missing Type. Cannot calculate wage.{LogColors.ENDC}")
        return None

    building_def = building_type_defs.get(building_type, {})
    # Maintenance is paid by Owner, not RunBy, so not a direct cost for wage setting by RunBy, but influences overall viability.
    # maintenance_cost = float(building_def.get('maintenanceCost', 0.0) or 0.0)
    
    # --- Market Wage Analysis ---
    similar_businesses_wages = []
    for b_data in all_businesses_data:
        if b_data['id'] == business_building_record['id']: continue
        if b_data['fields'].get('Type') == building_type and \
           b_data['fields'].get('District') == building_district and \
           b_data['fields'].get('Wages') is not None:
            similar_businesses_wages.append(float(b_data['fields'].get('Wages', 0.0) or 0.0))
    
    market_median_wage = statistics.median(similar_businesses_wages) if similar_businesses_wages else current_wages

    # --- Baseline Wage & Profitability ---
    # A simple baseline: aim for wages to be a certain percentage of (Income - Rent)
    # This is the profit available to the business operator before paying wages.
    profit_before_wages = building_income - rent_cost_for_business
    
    # Target wage as a percentage of this profit, e.g., 30-50%
    # This needs to be balanced with market wages.
    # Ensure this component is not negative if profit_before_wages is negative.
    target_wage_from_profit = max(0, profit_before_wages * 0.4) # Example: 40% share for labor

    # Base wage calculation: blend of profit-based and market-based
    base_wage = (target_wage_from_profit * 0.5) + (market_median_wage * 0.5)

    # --- Occupancy Factor & Social Class ---
    expected_worker_social_class_str = building_def.get('jobRole', {}).get('socialClass') # e.g., "Popolani"
    # Define base wage expectations by social class (example values)
    social_class_wage_expectation = {
        "Nobili": 4500,      # 150 * 30
        "Cittadini": 3000,   # 100 * 30
        "Popolani": 2100,    # 70 * 30
        "Facchini": 1500,    # 50 * 30
        "Forestieri": 1800   # 60 * 30
    }
    # Default expectation if class not found, also multiplied
    default_expectation_for_unknown_class = 50 * 30 
    expected_wage_by_class = social_class_wage_expectation.get(expected_worker_social_class_str, default_expectation_for_unknown_class)

    if occupant_username:
        occupant_record = get_citizen_record(tables, occupant_username)
        if occupant_record:
            occupant_social_class = occupant_record['fields'].get('SocialClass', 'Facchini')
            # If occupied, slightly adjust base_wage towards the expectation of the current occupant's class
            current_occupant_wage_expectation = social_class_wage_expectation.get(occupant_social_class, default_expectation_for_unknown_class)
            base_wage = (base_wage * 0.8) + (current_occupant_wage_expectation * 0.2)
        else: # Occupied, but can't fetch occupant details, use building's expected class
            base_wage = (base_wage * 0.8) + (expected_wage_by_class * 0.2)
    else: # Unoccupied, use building's expected class more strongly
        base_wage = (base_wage * 0.7) + (expected_wage_by_class * 0.3)


    # --- Apply Strategy ---
    strategy_multipliers = {"low": 0.85, "standard": 1.0, "high": 1.15} # Adjusted multipliers for wages
    multiplier = strategy_multipliers.get(strategy, 1.0)
    new_wage = base_wage * multiplier

    # Apply 5% change limit based on current_wages only if current_wages is positive.
    # If current_wages is 0, this limit should not prevent an increase.
    if current_wages > 0: 
        change_limit = current_wages * 0.05
        max_wage_after_strategy = current_wages + change_limit
        min_wage_after_strategy = current_wages - change_limit
        
        original_new_wage_before_cap = new_wage # For logging
        if new_wage > max_wage_after_strategy:
            new_wage = max_wage_after_strategy
            log.info(f"Wage for {building_id} capped by +5% rule. Original: {original_new_wage_before_cap:.0f}, Capped: {new_wage:.0f} (Current: {current_wages:.0f})")
        elif new_wage < min_wage_after_strategy:
            new_wage = min_wage_after_strategy
            log.info(f"Wage for {building_id} floored by -5% rule. Original: {original_new_wage_before_cap:.0f}, Floored: {new_wage:.0f} (Current: {current_wages:.0f})")
    # If current_wages is 0, new_wage is determined by other factors and strategy without this 5% cap.

    # Sanity checks:
    # Apply profit-based caps only if the business is profitable before wages.
    if profit_before_wages > 0:
        if strategy == "low":
            # Cap low wages to be at most 50% of profit_before_wages
            # This allows the operator to retain more profit with a low wage strategy.
            new_wage = min(new_wage, profit_before_wages * 0.5) 
        elif strategy == "standard":
            # Cap standard wages to be at most 70% of profit_before_wages
            # This ensures the operator retains at least 30% of pre-wage profit.
            max_sustainable_wage_if_profitable = profit_before_wages * 0.7
            new_wage = min(new_wage, max_sustainable_wage_if_profitable)
        # For 'high' strategy, no cap based on current profitability is applied here.
        # The AI operator might choose to pay high wages even if it means lower profit or a loss,
        # e.g., to attract critical talent or during a growth phase.
    # If profit_before_wages <= 0, new_wage is primarily determined by market/social factors
    # and the strategy multiplier. The operator accepts the resulting loss.
    
    new_wage = max(0, round(new_wage / 5) * 5) # Round to nearest 5, ensure non-negative

    log.debug(f"Business {building_id} (Type: {building_type}, District: {building_district}): "
             f"Income={building_income:.0f}, RentCost={rent_cost_for_business:.0f}, ProfitBeforeWages={profit_before_wages:.0f}, "
             f"MarketMedianWage={market_median_wage:.0f}, ExpectedClassWage={expected_wage_by_class:.0f}, BaseCalc={base_wage:.0f}, "
             f"Strategy='{strategy}', NewWage={new_wage:.0f} (Current: {current_wages:.0f})")
    
    # If new wage is very low (e.g. < 20 * 30 = 750) and building is unoccupied, might set to a minimum attractive wage
    minimum_attractive_wage = 25 * 30 # Adjust this minimum as well
    if not occupant_username and new_wage < minimum_attractive_wage:
        log.debug(f"Calculated new wage {new_wage} for unoccupied {building_id} is low. Setting to minimum attractive wage ({minimum_attractive_wage}).")
        new_wage = float(minimum_attractive_wage)

    return float(new_wage)

# Removed update_building_wage function as its logic is now handled by 'adjust_business_wages' activity

def notify_occupant_of_wage_change(
    tables: Dict[str, Table], 
    occupant_username: str, 
    building_id: str, # Custom BuildingId
    building_name: str, # Building Name
    ai_operator_username: str, 
    old_wage: float, new_wage: float, 
    dry_run: bool
):
    if not occupant_username: return

    building_display_name = building_name if building_name and building_name != building_id else building_id

    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would notify occupant {occupant_username} of business {building_display_name} ({building_id}) about wage change from {old_wage:.2f} to {new_wage:.2f} by operator {ai_operator_username}.{LogColors.ENDC}")
        return

    content = (f"💼 Wage Update: The wages for your job at **{building_display_name}** have been adjusted by the operator, **{ai_operator_username}**. "
               f"The new wage is **{new_wage:.2f} ⚜️ Ducats** per day (previously {old_wage:.2f} ⚜️ Ducats).")
    details = {
        "building_id": building_id,
        "building_name": building_display_name,
        "operator": ai_operator_username,
        "old_wage": old_wage,
        "new_wage": new_wage,
        "change_type": "wage_adjustment_automated"
    }
    try:
        tables["notifications"].create({
            "Citizen": occupant_username, # Notify the Occupant (worker)
            "Type": "wage_change",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}Sent notification to occupant {occupant_username} for business {building_id}.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to send wage change notification to {occupant_username}: {e}{LogColors.ENDC}")

def create_admin_summary_notification(tables: Dict[str, Table], results: List[Dict[str, Any]], dry_run: bool):
    if not results:
        log.info("No wage adjustments made, skipping admin notification.")
        return

    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would create admin summary for {len(results)} wage adjustments.{LogColors.ENDC}")
        return

    summary_message = f"📊 **Automated Wage Adjustments Summary** ({datetime.now(VENICE_TIMEZONE).strftime('%Y-%m-%d %H:%M')}):\n"
    for res in results:
        building_display_admin = res.get('building_name', res['building_id']) # Use name if available for admin
        summary_message += (f"- 👤 AI Operator: **{res['ai_operator']}**, 🏢 Business: **{building_display_admin}** (Type: {res['building_type']}), "
                            f"Old Wage: {res['old_wage']:.0f} ⚜️, New Wage: **{res['new_wage']:.0f} ⚜️**, Strategy: {res['strategy']}\n")
    
    try:
        tables["notifications"].create({
            "Citizen": "ConsiglioDeiDieci",
            "Type": "admin_report_wage_adjust",
            "Content": summary_message[:1000],
            "Details": json.dumps({"adjustments": results, "report_time": datetime.now(VENICE_TIMEZONE).isoformat()}),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}📊 Admin summary notification for wages created.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to create admin summary notification for wages: {e}{LogColors.ENDC}")

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
def process_automated_wage_adjustments(strategy: str, dry_run: bool):
    log_header(f"Automated Wage Adjustment Process (Strategy: {strategy}, Dry Run: {dry_run})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables: return

    building_type_defs = get_building_type_definitions()
    if not building_type_defs: return

    all_businesses_data = get_all_business_buildings_data(tables) # For market analysis
    ai_citizens = get_ai_citizens(tables)
    
    wage_adjustment_results = []
    total_ai_citizens = len(ai_citizens)
    log.info(f"Processing {total_ai_citizens} AI citizens for wage adjustments.")

    for i, ai_citizen_operator in enumerate(ai_citizens):
        ai_username = ai_citizen_operator['fields'].get('Username')
        if not ai_username:
            log.warning(f"{LogColors.WARNING}AI citizen {ai_citizen_operator['id']} missing Username, skipping.{LogColors.ENDC}")
            continue

        log.info(f"\nProcessing AI Operator {i+1}/{total_ai_citizens}: {ai_username}")
        businesses_run = get_businesses_run_by_citizen(tables, ai_username)

        if not businesses_run:
            log.info(f"AI Operator {ai_username} runs no businesses. Skipping.")
            continue
            
        total_businesses_for_ai = len(businesses_run)
        log.info(f"AI Operator {ai_username} runs {total_businesses_for_ai} businesses. Processing each...")

        for j, business_building in enumerate(businesses_run):
            building_airtable_id = business_building['id']
            building_id_custom = business_building['fields'].get('BuildingId', building_airtable_id)
            building_name_custom = business_building['fields'].get('Name', building_id_custom) # Get building name
            log.info(f"  Processing business {j+1}/{total_businesses_for_ai}: {building_name_custom} ({building_id_custom}) (Airtable ID: {building_airtable_id}) for AI {ai_username}")
            current_wage_price = float(business_building['fields'].get('Wages', 0.0) or 0.0)
            building_type_str = business_building['fields'].get('Type')

            if building_type_str not in building_type_defs:
                log.info(f"  Skipping business {building_id_custom} (Type: {building_type_str}) as its type is not in definitions. Skipping wage adjustment.")
                continue
                
            new_wage = calculate_new_wage(
                business_building, ai_username, strategy, all_businesses_data, building_type_defs, tables
            )

            if new_wage is not None:
                if abs(new_wage - current_wage_price) > 1.0: # Only update if changed meaningfully
                    activity_params = {
                        "businessBuildingId": building_id_custom,
                        "newWageAmount": new_wage,
                        "strategy": strategy
                    }
                    if call_try_create_activity_api(ai_username, "adjust_business_wages", activity_params, dry_run, log):
                        wage_adjustment_results.append({
                            "ai_operator": ai_username,
                            "building_id": building_id_custom,
                            "building_name": building_name_custom, # Add name for admin summary
                            "building_type": building_type_str,
                            "old_wage": current_wage_price,
                            "new_wage": new_wage,
                            "strategy": strategy
                        })
                        occupant_username = business_building['fields'].get('Occupant')
                        if occupant_username: # Notify current occupant if any
                            notify_occupant_of_wage_change(tables, occupant_username, building_id_custom, building_name_custom, ai_username, current_wage_price, new_wage, dry_run)
                else:
                    log.info(f"Business {building_name_custom} ({building_id_custom}): New wage {new_wage:.0f} is too close to current {current_wage_price:.0f}. No change.{LogColors.ENDC}")
            else:
                log.info(f"Business {building_id_custom}: No new wage calculated. Current wage: {current_wage_price:.0f}{LogColors.ENDC}")

    create_admin_summary_notification(tables, wage_adjustment_results, dry_run)
    log.info(f"{LogColors.HEADER}Automated Wage Adjustment Process Completed.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automated Wage Adjustment for AI-run businesses.")
    parser.add_argument(
        "--strategy",
        type=str,
        choices=["low", "standard", "high"],
        default="standard",
        help="The wage adjustment strategy to use (low, standard, high)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the script without making actual changes to Airtable."
    )
    args = parser.parse_args()

    process_automated_wage_adjustments(strategy=args.strategy, dry_run=args.dry_run)
