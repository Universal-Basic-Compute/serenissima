#!/usr/bin/env python3
"""
Automated Lease Price Adjustment script for La Serenissima.

This script allows AI citizens who own land to automatically adjust the LeasePrice
for buildings situated on their land, based on a specified strategy.
"""

import os
import sys
import json
import traceback
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
import requests # Already present
import pytz
import statistics

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
log = logging.getLogger("automated_adjust_leases")

load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

# Import VENICE_TIMEZONE, LogColors, and log_header from shared utils
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, LogColors, log_header

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
            "lands": base.table("LANDS"),
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

def get_ai_land_owners(tables: Dict[str, Table]) -> List[Dict]:
    """Get AI citizens who own land."""
    try:
        # Fetch all lands with an owner
        all_lands = tables["lands"].all(formula="NOT({Owner} = BLANK())", fields=["Owner"])
        if not all_lands:
            log.info("No lands with owners found.")
            return []

        land_owner_usernames = list(set([land['fields']['Owner'] for land in all_lands if 'Owner' in land['fields']]))
        if not land_owner_usernames:
            log.info("No unique land owner usernames found.")
            return []

        # Fetch AI citizens who are among these land owners
        formula_parts = [f"{{Username}}='{_escape_airtable_value(username)}'" for username in land_owner_usernames]
        formula = f"AND({{IsAI}}=1, {{InVenice}}=1, OR({', '.join(formula_parts)}))"
        
        ai_land_owners = tables["citizens"].all(formula=formula)
        log.info(f"Found {len(ai_land_owners)} AI land owners in Venice.")
        return ai_land_owners
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting AI land owners: {e}{LogColors.ENDC}")
        log.error(traceback.format_exc())
        return []

def get_lands_owned_by_citizen(tables: Dict[str, Table], owner_username: str) -> List[Dict]:
    """Get lands owned by a specific citizen."""
    try:
        formula = f"{{Owner}}='{_escape_airtable_value(owner_username)}'"
        lands = tables["lands"].all(formula=formula, fields=["LandId"])
        log.info(f"Found {len(lands)} lands owned by {owner_username}.") # Changed log level
        return lands
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting lands for {owner_username}: {e}{LogColors.ENDC}")
        return []

def get_buildings_on_land(tables: Dict[str, Table], land_id: str) -> List[Dict]:
    """Get buildings located on a specific land parcel."""
    try:
        formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
        # Fetch relevant fields for lease calculation, including Category
        buildings = tables["buildings"].all(formula=formula, fields=["BuildingId", "Type", "Category", "LandId", "LeasePrice", "RentPrice", "Owner"])
        log.info(f"Found {len(buildings)} buildings on land {land_id}.") # Changed log level
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting buildings on land {land_id}: {e}{LogColors.ENDC}")
        return []

def get_all_buildings_data(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all building records for market analysis."""
    try:
        # Fetch fields relevant for lease and rent price analysis
        all_buildings = tables["buildings"].all(fields=["BuildingId", "Type", "LandId", "LeasePrice", "RentPrice"])
        log.info(f"Fetched {len(all_buildings)} total buildings for market analysis.")
        return all_buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching all buildings data: {e}{LogColors.ENDC}")
        return []

def calculate_new_lease_price(
    building_record: Dict,
    ai_land_owner_username: str, # Not directly used in calculation but good for context
    strategy: str,
    all_buildings_data: List[Dict]
) -> Optional[float]:
    """Calculates a new lease price for a building on AI-owned land."""
    fields = building_record['fields']
    building_id_custom = fields.get('BuildingId', building_record['id'])
    building_type = fields.get('Type')
    land_id = fields.get('LandId')
    current_lease_price = float(fields.get('LeasePrice', 0.0) or 0.0)
    building_rent_price = float(fields.get('RentPrice', 0.0) or 0.0) # Rent building owner charges

    if not building_type or not land_id:
        log.warning(f"{LogColors.WARNING}Building {building_id_custom} missing Type or LandId. Cannot calculate lease price.{LogColors.ENDC}")
        return None

    # --- Market LeasePrice Analysis ---
    similar_type_lease_prices = []
    local_land_lease_prices = []

    for b_data in all_buildings_data:
        if b_data['id'] == building_record['id']: continue # Skip self
        b_fields = b_data['fields']
        if b_fields.get('LeasePrice') is not None:
            lease_p = float(b_fields.get('LeasePrice', 0.0) or 0.0)
            if b_fields.get('Type') == building_type:
                similar_type_lease_prices.append(lease_p)
            if b_fields.get('LandId') == land_id:
                local_land_lease_prices.append(lease_p)
    
    market_median_global_lease = statistics.median(similar_type_lease_prices) if similar_type_lease_prices else current_lease_price
    market_median_local_lease = statistics.median(local_land_lease_prices) if local_land_lease_prices else market_median_global_lease

    # --- RentPrice-based Target ---
    # Lease price should be a fraction of the rent the building owner can charge.
    # This fraction can be influenced by the strategy.
    rent_based_target_lease = 0.0
    if building_rent_price > 0:
        strategy_rent_fraction = {"low": 0.15, "standard": 0.25, "high": 0.35}
        fraction = strategy_rent_fraction.get(strategy, 0.25)
        rent_based_target_lease = building_rent_price * fraction
    else:
        # If building_rent_price is 0 (e.g., vacant, owner-occupied business),
        # rely more on market lease prices or a default minimum.
        # For now, let market prices dominate if rent is zero.
        rent_based_target_lease = market_median_local_lease * 0.2 # A small portion of local market as a fallback

    # --- Combine Factors ---
    # Weighted average: 30% global market, 40% local market, 30% rent-based target
    combined_lease_price = (market_median_global_lease * 0.3) + \
                           (market_median_local_lease * 0.4) + \
                           (rent_based_target_lease * 0.3)

    # --- Apply Strategy Multiplier to the combined value ---
    # This allows the AI to be more or less aggressive than the blended market/rent rate.
    strategy_multipliers = {"low": 0.90, "standard": 1.0, "high": 1.10}
    multiplier = strategy_multipliers.get(strategy, 1.0)
    new_lease_price = combined_lease_price * multiplier
    
    # --- Sanity Checks & Change Limits ---
    # 1. Lease price shouldn't generally exceed 50% of RentPrice if RentPrice is positive
    if building_rent_price > 0:
        new_lease_price = min(new_lease_price, building_rent_price * 0.50)

    # 2. Apply 5% change limit based on current_lease_price only if current_lease_price is positive.
    # If current_lease_price is 0, this limit should not prevent an increase.
    if current_lease_price > 0: 
        change_limit = current_lease_price * 0.05
        max_lease_after_strategy = current_lease_price + change_limit
        min_lease_after_strategy = current_lease_price - change_limit
        
        original_new_lease_before_cap = new_lease_price # For logging
        if new_lease_price > max_lease_after_strategy:
            new_lease_price = max_lease_after_strategy
            log.info(f"Lease for {building_id_custom} capped by +5% rule. Original: {original_new_lease_before_cap:.0f}, Capped: {new_lease_price:.0f} (Current: {current_lease_price:.0f})")
        elif new_lease_price < min_lease_after_strategy:
            new_lease_price = min_lease_after_strategy
            log.info(f"Lease for {building_id_custom} floored by -5% rule. Original: {original_new_lease_before_cap:.0f}, Floored: {new_lease_price:.0f} (Current: {current_lease_price:.0f})")
    # If current_lease_price is 0, new_lease_price is determined by market/rent/strategy without this 5% cap.

    # Ensure non-negative and round to nearest 5
    new_lease_price = max(0, round(new_lease_price / 5) * 5)

    # If after all calculations, new_lease_price is still 0, and current_lease_price was 0,
    # apply a minimum kickstart lease since we know it's a 'home' or 'business' category (checked by caller).
    if new_lease_price == 0 and current_lease_price == 0:
        min_lease_kickstart = 5.0 # Smallest possible lease after rounding
        log.info(f"Building {building_id_custom} (Type: {building_type}): Lease price calculated as 0 from a current of 0. Applying minimum kickstart lease of {min_lease_kickstart:.0f}.")
        new_lease_price = min_lease_kickstart
    
    log.debug(f"Building {building_id_custom} (Type: {building_type}, Land: {land_id}): "
             f"CurrentLease={current_lease_price:.0f}, BuildingRent={building_rent_price:.0f}, "
             f"MarketGlobalLease={market_median_global_lease:.0f}, MarketLocalLease={market_median_local_lease:.0f}, "
             f"RentBasedTarget={rent_based_target_lease:.0f}, CombinedBase={combined_lease_price:.0f}, "
             f"Strategy='{strategy}', NewLeasePrice={new_lease_price:.0f}")
    
    return float(new_lease_price)

# Removed update_building_lease_price function as its logic is now handled by 'adjust_building_lease_price' activity

def notify_building_owner_of_lease_change(
    tables: Dict[str, Table],
    building_owner_username: str,
    building_id_custom: str, # Custom BuildingId
    building_name: str, # Building Name
    land_id: str,
    ai_land_owner_username: str,
    old_lease_price: float, new_lease_price: float,
    dry_run: bool
):
    if not building_owner_username:
        log.warning(f"{LogColors.WARNING}No owner for building {building_id_custom}. Cannot send lease change notification.{LogColors.ENDC}")
        return

    building_display_name = building_name if building_name and building_name != building_id_custom else building_id_custom

    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would notify owner {building_owner_username} of building {building_display_name} ({building_id_custom}) about LeasePrice change from {old_lease_price:.2f} to {new_lease_price:.2f} by land owner {ai_land_owner_username} for land {land_id}.{LogColors.ENDC}")
        return

    content = (f"📜 Lease Price Update: The Lease Price for your building **{building_display_name}** on land **{land_id}** has been adjusted by the land owner, **{ai_land_owner_username}**. "
               f"The new lease price is **{new_lease_price:.2f} ⚜️ Ducats** per day (previously {old_lease_price:.2f} ⚜️ Ducats).")
    details = {
        "building_id": building_id_custom,
        "building_name": building_display_name,
        "land_id": land_id,
        "land_owner": ai_land_owner_username,
        "old_lease_price": old_lease_price,
        "new_lease_price": new_lease_price,
        "change_type": "lease_price_adjustment_automated"
    }
    try:
        tables["notifications"].create({
            "Citizen": building_owner_username, # Notify the Building Owner
            "Type": "lease_price_change",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}Sent notification to building owner {building_owner_username} for building {building_id_custom}.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to send lease price change notification to {building_owner_username}: {e}{LogColors.ENDC}")

def create_admin_summary_notification(tables: Dict[str, Table], results: List[Dict[str, Any]], dry_run: bool):
    if not results:
        log.info("No lease price adjustments made, skipping admin notification.")
        return

    if dry_run:
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would create admin summary for {len(results)} lease price adjustments.{LogColors.ENDC}")
        return

    summary_message = f"📜 **Automated Lease Price Adjustments Summary** ({datetime.now(VENICE_TIMEZONE).strftime('%Y-%m-%d %H:%M')}):\n"
    for res in results:
        building_display_admin = res.get('building_name', res['building_id']) # Use name if available
        summary_message += (f"- 👤 Land Owner: **{res['ai_land_owner']}**, 🏠 Building: **{building_display_admin}** (Type: {res['building_type']}) on Land: **{res['land_id']}**, "
                            f"Old Lease: {res['old_lease_price']:.0f} ⚜️, New Lease: **{res['new_lease_price']:.0f} ⚜️**, Strategy: {res['strategy']}\n")
    
    try:
        tables["notifications"].create({
            "Citizen": "ConsiglioDeiDieci",
            "Type": "admin_report_lease_adjust",
            "Content": summary_message[:1000], # Airtable text field limits
            "Details": json.dumps({"adjustments": results, "report_time": datetime.now(VENICE_TIMEZONE).isoformat()}),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        })
        log.info(f"{LogColors.OKGREEN}📜 Admin summary notification for lease prices created.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to create admin summary notification for lease prices: {e}{LogColors.ENDC}")

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
    except json.JSONDecodeError: # Ensure json is imported if this is used
        log_ref.error(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return False

# --- Main Processing Logic ---
def process_automated_lease_adjustments(strategy: str, dry_run: bool):
    log_header(f"Automated Lease Price Adjustment Process (Strategy: {strategy}, Dry Run: {dry_run})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables: return

    all_buildings_data = get_all_buildings_data(tables) # For market analysis
    ai_land_owners_list = get_ai_land_owners(tables)
    
    lease_adjustment_results = []
    total_ai_land_owners = len(ai_land_owners_list)
    log.info(f"Processing {total_ai_land_owners} AI land owners for lease price adjustments.")

    for i, ai_land_owner in enumerate(ai_land_owners_list):
        ai_username = ai_land_owner['fields'].get('Username')
        if not ai_username:
            log.warning(f"{LogColors.WARNING}AI land owner {ai_land_owner['id']} missing Username, skipping.{LogColors.ENDC}")
            continue

        log.info(f"\nProcessing AI Land Owner {i+1}/{total_ai_land_owners}: {ai_username}")
        lands_owned = get_lands_owned_by_citizen(tables, ai_username)

        if not lands_owned:
            log.info(f"AI Land Owner {ai_username} owns no lands. Skipping.")
            continue
        
        for land in lands_owned:
            land_id_custom = land['fields'].get('LandId', land['id'])
            log.debug(f"  Processing land {land_id_custom} owned by {ai_username}")
            buildings_on_this_land = get_buildings_on_land(tables, land_id_custom)

            for building_record in buildings_on_this_land:
                building_airtable_id = building_record['id']
                building_id_custom = building_record['fields'].get('BuildingId', building_airtable_id)
                building_name_custom = building_record['fields'].get('Name', building_id_custom) # Get building name
                building_owner_username = building_record['fields'].get('Owner')
                building_category = building_record['fields'].get('Category')
                
                # AI Land Owner should not adjust lease for buildings they themselves own on their land
                if building_owner_username == ai_username:
                    log.info(f"    Skipping building {building_id_custom} (Category: {building_category}) on land {land_id_custom} as it's owned by the land owner {ai_username}.") # Changed log level
                    continue
                
                # Only adjust lease for 'home' or 'business' category buildings
                if building_category not in ['home', 'business']:
                    log.info(f"    Skipping building {building_id_custom} (Category: {building_category}) on land {land_id_custom} as its category is not 'home' or 'business'.") # Changed log level
                    continue

                log.info(f"    Processing building {building_id_custom} (Category: {building_category}, Airtable ID: {building_airtable_id}) on land {land_id_custom} for AI {ai_username}") # Changed log level
                current_lease_price_val = float(building_record['fields'].get('LeasePrice', 0.0) or 0.0)
                building_type_str = building_record['fields'].get('Type')

                new_lease_price = calculate_new_lease_price(
                    building_record, ai_username, strategy, all_buildings_data
                )

                if new_lease_price is not None:
                    if abs(new_lease_price - current_lease_price_val) > 1.0: # Only update if changed meaningfully
                        activity_params = {
                            "buildingId": building_id_custom, # Pass custom BuildingId
                            "newLeasePrice": new_lease_price,
                            "strategy": strategy
                            # targetOfficeBuildingId is optional for the activity
                        }
                        if call_try_create_activity_api(ai_username, "adjust_building_lease_price", activity_params, dry_run, log):
                            lease_adjustment_results.append({
                                "ai_land_owner": ai_username,
                                "land_id": land_id_custom,
                                "building_id": building_id_custom,
                                "building_name": building_name_custom, # Add name for admin summary
                                "building_type": building_type_str,
                                "building_owner": building_owner_username,
                                "old_lease_price": current_lease_price_val,
                                "new_lease_price": new_lease_price,
                                "strategy": strategy
                            })
                            if building_owner_username: # Notify building owner
                                notify_building_owner_of_lease_change(
                                    tables, building_owner_username, building_id_custom, building_name_custom, land_id_custom,
                                    ai_username, current_lease_price_val, new_lease_price, dry_run
                                )
                    else:
                        log.info(f"    Building {building_name_custom} ({building_id_custom}): New lease price {new_lease_price:.0f} is too close to current {current_lease_price_val:.0f}. No change.{LogColors.ENDC}")
                else:
                    log.info(f"    Building {building_id_custom}: No new lease price calculated. Current lease price: {current_lease_price_val:.0f}{LogColors.ENDC}")

    create_admin_summary_notification(tables, lease_adjustment_results, dry_run)
    log.info(f"{LogColors.HEADER}Automated Lease Price Adjustment Process Completed.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automated Lease Price Adjustment for AI-owned lands.")
    parser.add_argument(
        "--strategy",
        type=str,
        choices=["low", "standard", "high"],
        default="standard",
        help="The lease price adjustment strategy to use (low, standard, high)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the script without making actual changes to Airtable."
    )
    args = parser.parse_args()

    process_automated_lease_adjustments(strategy=args.strategy, dry_run=args.dry_run)
