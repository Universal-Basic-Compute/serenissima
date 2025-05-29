#!/usr/bin/env python3
"""
Bulk Adjust Building Construction Ducat Prices script for La Serenissima.

This script recalculates the ducat construction cost for buildings based on:
1. The sum of importPrices of their required resources.
2. An estimated wage cost based on constructionTime.
3. A configurable markup percentage applied to the total of materials and wages.

It reports the old vs. new ducat costs and the percentage change.
Changes can be applied to files or run in dry-run mode.
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("bulkAdjustBuildingPrices")

# Data paths
RESOURCES_DATA_DIR = Path(PROJECT_ROOT) / "data" / "resources"
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings"
DEFAULT_WAGE_RATE_PER_DAY = 2000.0  # Ducats per day of construction
DEFAULT_MARKUP_PERCENTAGE = 50.0 # Percentage to add on top of raw costs
MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24.0

from backend.engine.utils.activity_helpers import LogColors

# --- Helper Functions ---

def load_resource_definitions_from_files(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all resource JSON files from the specified base directory."""
    resource_defs = {}
    log.info(f"Scanning for resource JSON files in {base_dir}...")
    for file_path in base_dir.rglob('*.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            resource_id = file_path.stem
            if "id" in data and data["id"] != resource_id:
                log.warning(f"{LogColors.WARNING}Resource ID in file {file_path} ('{data['id']}') does not match filename ('{resource_id}'). Using filename as ID.{LogColors.ENDC}")
            
            if 'importPrice' not in data:
                data['importPrice'] = 0.0 
                log.warning(f"{LogColors.WARNING}Resource {resource_id} missing importPrice, defaulted to 0.0.{LogColors.ENDC}")

            resource_defs[resource_id] = {
                "path": str(file_path),
                "data": data,
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading resource file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(resource_defs)} resource definitions from files.")
    return resource_defs

def get_resource_import_prices(resources_dir: Path) -> Dict[str, float]:
    """Loads resource definitions and returns a map of resource_id to importPrice."""
    resource_definitions = load_resource_definitions_from_files(resources_dir)
    prices: Dict[str, float] = {}
    for res_id, details in resource_definitions.items():
        try:
            price = float(details["data"].get("importPrice", 0.0))
            prices[res_id] = price
        except (ValueError, TypeError):
            log.error(f"{LogColors.FAIL}Invalid importPrice for resource {res_id}. Defaulting to 0.0.{LogColors.ENDC}")
            prices[res_id] = 0.0
    log.info(f"Extracted import prices for {len(prices)} resources.")
    return prices

def load_building_definitions_from_files(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all building JSON files from the specified base directory."""
    building_defs = {}
    log.info(f"Scanning for building JSON files in {base_dir}...")
    for file_path in base_dir.rglob('*.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            building_id = file_path.stem
            
            if "name" not in data or "constructionCosts" not in data:
                log.warning(f"{LogColors.WARNING}Building file {file_path} is missing 'name' or 'constructionCosts'. Skipping.{LogColors.ENDC}")
                continue
            
            building_defs[building_id] = {
                "path": str(file_path),
                "data": data,
                "original_ducat_cost": float(data.get("constructionCosts", {}).get("ducats", 0.0))
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading building file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(building_defs)} building definitions.")
    return building_defs

def calculate_new_ducat_cost(
    building_id: str,
    building_data: Dict[str, Any],
    resource_import_prices: Dict[str, float],
    wage_rate_per_day: float,
    markup_percentage: float
) -> Optional[Tuple[float, float, float, float]]:
    """
    Calculates the new ducat cost for a building.
    Returns: (material_cost, wage_cost, total_raw_cost, new_ducat_price_marked_up) or None if error.
    """
    material_cost = 0.0
    
    current_construction_costs = building_data.get("constructionCosts")
    if not isinstance(current_construction_costs, dict):
        log.warning(f"{LogColors.WARNING}Building {building_id} has invalid or missing 'constructionCosts' dictionary. Skipping.{LogColors.ENDC}")
        return None

    for resource_name, quantity in current_construction_costs.items():
        if resource_name == "ducats":
            continue
        
        if not isinstance(quantity, (int, float)) or quantity < 0:
            log.warning(f"{LogColors.WARNING}Building {building_id} has invalid quantity '{quantity}' for resource '{resource_name}'. Skipping this resource.{LogColors.ENDC}")
            continue

        resource_price = resource_import_prices.get(resource_name)
        if resource_price is None:
            log.warning(f"{LogColors.WARNING}Building {building_id} uses resource '{resource_name}' which has no import price defined. Assuming 0 cost.{LogColors.ENDC}")
            resource_price = 0.0
        material_cost += float(quantity) * resource_price

    wage_cost = 0.0
    construction_time_ms = building_data.get("constructionTime")
    if construction_time_ms is None:
        log.warning(f"{LogColors.WARNING}Building {building_id} missing 'constructionTime'. Assuming 0 wage cost.{LogColors.ENDC}")
    elif not isinstance(construction_time_ms, (int, float)) or construction_time_ms < 0:
        log.warning(f"{LogColors.WARNING}Building {building_id} has invalid 'constructionTime': {construction_time_ms}. Assuming 0 wage cost.{LogColors.ENDC}")
    else:
        construction_days = float(construction_time_ms) / MILLISECONDS_IN_DAY
        wage_cost = round(construction_days * wage_rate_per_day, 2)
        
    total_raw_cost = round(material_cost + wage_cost, 2)
    new_ducat_price_marked_up = round(total_raw_cost * (1 + markup_percentage / 100.0), 2)

    return material_cost, wage_cost, total_raw_cost, new_ducat_price_marked_up

def process_and_update_buildings(
    building_definitions: Dict[str, Dict[str, Any]],
    resource_import_prices: Dict[str, float],
    wage_rate_per_day: float,
    markup_percentage: float
) -> Tuple[Dict[str, Dict[str, Any]], int]:
    """
    Processes buildings, calculates new costs, and updates definitions in memory.
    Returns the modified definitions and count of buildings with changed prices.
    """
    log.info(f"\n{LogColors.BOLD}--- Calculating New Building Ducat Costs (Wage Rate: {wage_rate_per_day}/day, Markup: {markup_percentage}%) ---{LogColors.ENDC}")
    changed_count = 0
    total_buildings_for_price_calc = len(building_definitions)
    log.info(f"Calculating new ducat costs for {total_buildings_for_price_calc} building definitions.")

    for i, (building_id, details) in enumerate(building_definitions.items()):
        # log.info(f"  Processing building {i+1}/{total_buildings_for_price_calc}: {building_id}")
        building_data = details["data"]
        original_ducat_cost = details["original_ducat_cost"]

        calc_results = calculate_new_ducat_cost(
            building_id, building_data, resource_import_prices, wage_rate_per_day, markup_percentage
        )

        if calc_results is None:
            continue

        material_cost, wage_cost, total_raw_cost, new_ducat_cost = calc_results
        
        if "constructionCosts" not in building_data or not isinstance(building_data["constructionCosts"], dict):
             building_data["constructionCosts"] = {}
        building_data["constructionCosts"]["ducats"] = new_ducat_cost
        details["new_ducat_cost"] = new_ducat_cost

        percentage_diff_str = "N/A"
        if original_ducat_cost != 0:
            percentage_diff = ((new_ducat_cost - original_ducat_cost) / original_ducat_cost) * 100
            percentage_diff_str = f"{percentage_diff:+.2f}%"
        elif new_ducat_cost > 0:
            percentage_diff_str = "+INF%"

        color = LogColors.ENDC
        if new_ducat_cost > original_ducat_cost:
            color = LogColors.FAIL
        elif new_ducat_cost < original_ducat_cost:
            color = LogColors.OKGREEN
        
        if abs(new_ducat_cost - original_ducat_cost) > 0.01:
            changed_count +=1

        log.info(
            f"Building: {LogColors.OKBLUE}{building_id}{LogColors.ENDC}\n"
            f"  Original Ducats: {original_ducat_cost:.2f}\n"
            f"  Calculated Materials Cost: {material_cost:.2f}\n"
            f"  Calculated Wages Cost: {wage_cost:.2f} (Time: {building_data.get('constructionTime', 0)/(MILLISECONDS_IN_DAY):.2f} days)\n"
            f"  Total Raw Cost (Materials + Wages): {total_raw_cost:.2f}\n"
            f"  {LogColors.BOLD}New Ducats (Raw + {markup_percentage}% markup): {color}{new_ducat_cost:.2f}{LogColors.ENDC}\n"
            f"  Percentage Difference: {color}{percentage_diff_str}{LogColors.ENDC}"
        )
        
    log.info(f"Price calculation complete. {changed_count} building ducat prices were changed in memory.")
    return building_definitions, changed_count

def save_modified_building_files(
    building_definitions: Dict[str, Dict[str, Any]],
    dry_run: bool
) -> int:
    """Saves the modified building data back to their JSON files."""
    updated_files_count = 0
    
    log.info(f"\n{LogColors.BOLD}--- Saving Modified Building Files ({'DRY RUN' if dry_run else 'APPLYING CHANGES'}) ---{LogColors.ENDC}")

    for building_id, details in building_definitions.items():
        file_path_str = details["path"]
        building_data_to_save = details["data"]
        original_ducat_cost = details["original_ducat_cost"]
        new_ducat_cost = building_data_to_save.get("constructionCosts", {}).get("ducats", 0.0)

        if abs(new_ducat_cost - original_ducat_cost) < 0.01 and original_ducat_cost == new_ducat_cost :
            log.debug(f"  [NO CHANGE] Building {building_id} ducat cost unchanged ({new_ducat_cost:.2f}). Skipping save.")
            continue

        if not dry_run:
            try:
                with open(file_path_str, 'w', encoding='utf-8') as f:
                    json.dump(building_data_to_save, f, indent=2, ensure_ascii=False)
                log.info(f"  {LogColors.OKGREEN}Successfully updated file: {file_path_str} (Ducats: {original_ducat_cost:.2f} -> {new_ducat_cost:.2f}){LogColors.ENDC}")
                updated_files_count += 1
            except Exception as e:
                log.error(f"{LogColors.FAIL}  Failed to update file {file_path_str}: {e}{LogColors.ENDC}")
        else:
            log.info(f"  [DRY RUN] Would update file: {file_path_str} (Ducats: {original_ducat_cost:.2f} -> {new_ducat_cost:.2f})")
            updated_files_count +=1
            
    if dry_run:
        log.info(f"Total files that would be updated: {updated_files_count}")
    else:
        log.info(f"Total files updated: {updated_files_count}")
    return updated_files_count

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Bulk adjust building construction ducat prices.")
    parser.add_argument(
        "--wage-rate-per-day",
        type=float,
        default=DEFAULT_WAGE_RATE_PER_DAY,
        help=f"Wage cost in ducats per day of constructionTime (default: {DEFAULT_WAGE_RATE_PER_DAY})."
    )
    parser.add_argument(
        "--markup-percentage",
        type=float,
        default=DEFAULT_MARKUP_PERCENTAGE,
        help=f"Markup percentage to add to the sum of material and wage costs (default: {DEFAULT_MARKUP_PERCENTAGE}%)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to files. If not set, changes will be applied."
    )
    args = parser.parse_args()

    is_dry_run_mode = args.dry_run

    log.info(f"Starting Bulk Building Price Adjustment (Wage Rate: {args.wage_rate_per_day}/day, Markup: {args.markup_percentage}%, Dry Run: {is_dry_run_mode})...")

    resource_import_prices = get_resource_import_prices(RESOURCES_DATA_DIR)
    if not resource_import_prices:
        log.error(f"{LogColors.FAIL}No resource import prices loaded. Aborting.{LogColors.ENDC}")
        return

    building_definitions = load_building_definitions_from_files(BUILDINGS_DATA_DIR)
    if not building_definitions:
        log.error(f"{LogColors.FAIL}No building definitions loaded. Aborting.{LogColors.ENDC}")
        return
    
    updated_building_definitions, _ = process_and_update_buildings(
        building_definitions,
        resource_import_prices,
        args.wage_rate_per_day,
        args.markup_percentage
    )
    
    save_modified_building_files(updated_building_definitions, dry_run=is_dry_run_mode)

    log.info(f"{LogColors.OKGREEN}Bulk Building Price Adjustment script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
