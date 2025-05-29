#!/usr/bin/env python3
"""
Calibrate Import Prices script for La Serenissima.

This script recalculates the importPrice for processed_materials and finished_goods
based on their production costs derived from Arti recipes.
Production Cost = Sum of (input_quantity * input_importPrice) + Estimated Labor Cost
New Import Price = Production Cost * (1 + PROFIT_MARGIN)

The script operates iteratively to resolve dependencies between resources.
It reads resource definitions from data/resources/ and building type definitions
(for Arti recipes) from the API.

It can perform a dry run to show proposed changes or apply them directly to
the resource JSON files.
"""

import os
import sys
import json
import logging
import argparse
import requests
from typing import Dict, List, Optional, Any, Tuple, Set
from pathlib import Path
import math

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
log = logging.getLogger("calibrateImportPrices")

# Constants for calculation
ESTIMATED_LABOR_COST_PER_CRAFT_HOUR = 30.0  # Ducats per hour of crafting
PROFIT_MARGIN = 0.20  # 20% profit margin

# API endpoint for building types
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

# Data paths
RESOURCES_DATA_DIR = Path(PROJECT_ROOT) / "data" / "resources"

class LogColors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'
    BOLD = '\033[1m'

# --- Helper Functions ---

def load_resource_definitions_from_files(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all resource JSON files from the specified base directory."""
    resource_defs = {}
    log.info(f"Scanning for resource JSON files in {base_dir}...")
    for file_path in base_dir.rglob('*.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            resource_id = file_path.stem # Filename without extension is the ID
            if "id" in data and data["id"] != resource_id:
                log.warning(f"{LogColors.WARNING}Resource ID in file {file_path} ('{data['id']}') does not match filename ('{resource_id}'). Using filename as ID.{LogColors.ENDC}")
            
            # Ensure importPrice is a float
            if 'importPrice' in data:
                try:
                    data['importPrice'] = float(data['importPrice'])
                except (ValueError, TypeError):
                    log.warning(f"{LogColors.WARNING}Invalid importPrice '{data['importPrice']}' in {file_path}. Setting to 0.0 for calculation.{LogColors.ENDC}")
                    data['importPrice'] = 0.0
            else:
                data['importPrice'] = 0.0 # Default if missing

            resource_defs[resource_id] = {
                "path": str(file_path),
                "data": data,
                "original_import_price": data['importPrice'] # Store original for comparison
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading resource file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(resource_defs)} resource definitions from files.")
    return resource_defs

def get_building_type_definitions_from_api() -> Dict[str, Dict[str, Any]]:
    """Fetches building type definitions from the API."""
    url = f"{API_BASE_URL}/api/building-types"
    log.info(f"Fetching building type definitions from API: {url}")
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "buildingTypes" in data:
            building_types_list = data["buildingTypes"]
            # Key by building type string (e.g., "armory")
            defs = {bt["type"]: bt for bt in building_types_list if "type" in bt}
            log.info(f"Successfully fetched {len(defs)} building type definitions from API.")
            return defs
        else:
            log.error(f"{LogColors.FAIL}API error fetching building types: {data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return {}
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Request exception fetching building types: {e}{LogColors.ENDC}")
        return {}
    except json.JSONDecodeError as e:
        log.error(f"{LogColors.FAIL}JSON decode error fetching building types: {e}{LogColors.ENDC}")
        return {}

def find_recipes_for_output(output_resource_id: str, building_type_defs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Finds all Arti recipes that produce the given output_resource_id."""
    producing_recipes = []
    for building_type, building_def in building_type_defs.items():
        prod_info = building_def.get("productionInformation", {})
        if isinstance(prod_info, dict):
            arti_recipes = prod_info.get("Arti", [])
            if isinstance(arti_recipes, list):
                for recipe in arti_recipes:
                    if isinstance(recipe, dict) and isinstance(recipe.get("outputs"), dict):
                        if output_resource_id in recipe["outputs"]:
                            # Add building_type to recipe for context if needed later
                            recipe_copy = recipe.copy()
                            recipe_copy['_source_building_type'] = building_type
                            producing_recipes.append(recipe_copy)
    return producing_recipes

# --- Main Calibration Logic ---

def calibrate_prices(
    resource_definitions: Dict[str, Dict[str, Any]], # Values are dicts like {"path": ..., "data": ...}
    building_type_definitions: Dict[str, Dict[str, Any]]
) -> Dict[str, float]:
    """
    Iteratively calculates new import prices based on production costs.
    Returns a dictionary of {resource_id: new_import_price}.
    """
    calculated_prices: Dict[str, float] = {}
    max_passes = 10  # To prevent infinite loops in case of complex dependencies or errors
    
    # Initialize calculated_prices with importPrices of raw_materials or non-calibratable items
    for res_id, res_details in resource_definitions.items():
        category = res_details["data"].get("category", "").lower()
        if category == "raw_materials":
            calculated_prices[res_id] = res_details["data"].get("importPrice", 0.0)
            log.debug(f"Initialized raw material {res_id} with price {calculated_prices[res_id]}")

    log.info(f"Starting calibration with {len(calculated_prices)} pre-set (raw material) prices.")

    for pass_num in range(max_passes):
        prices_updated_in_this_pass = False
        log.info(f"{LogColors.BOLD}--- Starting Calibration Pass {pass_num + 1} ---{LogColors.ENDC}")

        for resource_id, resource_details in resource_definitions.items():
            if resource_id in calculated_prices: # Already processed or is a raw material
                continue

            resource_category = resource_details["data"].get("category", "").lower()
            if resource_category not in ["processed_materials", "finished_goods"]:
                # Not a category we calibrate based on production; use its existing import price
                # if not already set (e.g. if it wasn't a raw material)
                if resource_id not in calculated_prices:
                    calculated_prices[resource_id] = resource_details["data"].get("importPrice", 0.0)
                    log.debug(f"Using existing importPrice for non-calibratable resource {resource_id}: {calculated_prices[resource_id]}")
                continue

            recipes = find_recipes_for_output(resource_id, building_type_definitions)
            if not recipes:
                log.debug(f"No recipes found to produce {resource_id} (Category: {resource_category}). Using its current importPrice if not already set.")
                if resource_id not in calculated_prices:
                     calculated_prices[resource_id] = resource_details["data"].get("importPrice", 0.0)
                continue

            min_production_cost_for_resource = float('inf')
            recipe_used_for_min_cost = None

            for recipe in recipes:
                inputs_data = recipe.get("inputs", {})
                outputs_data = recipe.get("outputs", {})
                craft_minutes = float(recipe.get("craftMinutes", 0))
                
                if not inputs_data or not outputs_data or resource_id not in outputs_data:
                    continue # Should not happen if find_recipes_for_output is correct

                current_recipe_total_input_cost = 0.0
                all_inputs_have_known_prices = True

                for input_res_id, input_qty_needed_any in inputs_data.items():
                    input_qty_needed = float(input_qty_needed_any)
                    if input_res_id not in calculated_prices:
                        # Price of this input is not yet known in this pass
                        all_inputs_have_known_prices = False
                        log.debug(f"  Recipe for {resource_id} (in {recipe['_source_building_type']}): Input {input_res_id} price not yet calculated. Skipping this recipe in this pass.")
                        break
                    current_recipe_total_input_cost += input_qty_needed * calculated_prices[input_res_id]
                
                if all_inputs_have_known_prices:
                    output_quantity_of_this_resource = float(outputs_data[resource_id])
                    if output_quantity_of_this_resource <= 0:
                        log.warning(f"{LogColors.WARNING}Recipe for {resource_id} in {recipe['_source_building_type']} has zero or negative output quantity for this resource. Skipping recipe.{LogColors.ENDC}")
                        continue

                    labor_cost_for_recipe_execution = (craft_minutes / 60.0) * ESTIMATED_LABOR_COST_PER_CRAFT_HOUR
                    labor_cost_per_unit_output = labor_cost_for_recipe_execution / output_quantity_of_this_resource
                    
                    material_cost_per_unit_output = current_recipe_total_input_cost / output_quantity_of_this_resource
                    
                    current_recipe_production_cost = material_cost_per_unit_output + labor_cost_per_unit_output
                    
                    log.debug(f"  Recipe for {resource_id} (in {recipe['_source_building_type']}): InputsCost/unit={material_cost_per_unit_output:.2f}, LaborCost/unit={labor_cost_per_unit_output:.2f}, TotalProdCost/unit={current_recipe_production_cost:.2f}")

                    if current_recipe_production_cost < min_production_cost_for_resource:
                        min_production_cost_for_resource = current_recipe_production_cost
                        recipe_used_for_min_cost = recipe
            
            if recipe_used_for_min_cost: # A valid production cost was found
                new_calculated_import_price = round(min_production_cost_for_resource * (1 + PROFIT_MARGIN), 2)
                
                if resource_id not in calculated_prices or abs(calculated_prices[resource_id] - new_calculated_import_price) > 0.01:
                    log.info(f"Updating price for {LogColors.OKBLUE}{resource_id}{LogColors.ENDC}: Old/Current Est. Price: {calculated_prices.get(resource_id, 'N/A')}, "
                             f"Min Prod Cost (via {recipe_used_for_min_cost['_source_building_type']}): {min_production_cost_for_resource:.2f}, "
                             f"New Calibrated Import Price: {LogColors.OKGREEN}{new_calculated_import_price:.2f}{LogColors.ENDC}")
                    calculated_prices[resource_id] = new_calculated_import_price
                    prices_updated_in_this_pass = True
            # else: no recipe could be fully costed in this pass for this resource

        if not prices_updated_in_this_pass:
            log.info(f"{LogColors.OKGREEN}Calibration converged in pass {pass_num + 1}. No more price updates.{LogColors.ENDC}")
            break
        elif pass_num == max_passes - 1:
            log.warning(f"{LogColors.WARNING}Reached max_passes ({max_passes}). Calibration may not have fully converged for all items.{LogColors.ENDC}")

    return calculated_prices

def update_resource_files(
    resource_definitions: Dict[str, Dict[str, Any]], # Original defs with paths
    calibrated_prices: Dict[str, float],
    dry_run: bool
) -> Tuple[int, List[str]]:
    """Updates the importPrice in the resource JSON files."""
    updated_files_count = 0
    changed_resources_summary = []

    for resource_id, new_price in calibrated_prices.items():
        if resource_id not in resource_definitions:
            log.warning(f"{LogColors.WARNING}Resource ID {resource_id} from calibration not found in original definitions. Skipping file update.{LogColors.ENDC}")
            continue

        res_details = resource_definitions[resource_id]
        original_price = res_details["original_import_price"] # Use the stored original price
        
        # Only update if price has meaningfully changed
        if abs(new_price - original_price) > 0.01:
            file_path_str = res_details["path"]
            resource_data = res_details["data"] # This is the dict loaded from JSON

            log_msg = (f"Resource: {LogColors.OKBLUE}{resource_id}{LogColors.ENDC} (Category: {resource_data.get('category', 'N/A')}) - "
                       f"Original ImportPrice: {original_price:.2f}, "
                       f"New Calibrated ImportPrice: {LogColors.OKGREEN}{new_price:.2f}{LogColors.ENDC}")
            
            changed_resources_summary.append(log_msg)

            if not dry_run:
                try:
                    # Update the price in the loaded data
                    resource_data['importPrice'] = new_price 
                    
                    # Write back to the file
                    with open(file_path_str, 'w', encoding='utf-8') as f:
                        json.dump(resource_data, f, indent=2, ensure_ascii=False)
                    log.info(f"  Successfully updated file: {file_path_str}")
                    updated_files_count += 1
                except Exception as e:
                    log.error(f"{LogColors.FAIL}  Failed to update file {file_path_str}: {e}{LogColors.ENDC}")
            else:
                log.info(f"  [DRY RUN] Would update file: {file_path_str}")
                updated_files_count +=1 # Count as if updated for dry run summary

    log.info(f"\n--- Summary of Changes ({'DRY RUN' if dry_run else 'APPLIED'}) ---")
    if changed_resources_summary:
        for summary_line in changed_resources_summary:
            log.info(summary_line)
    else:
        log.info("No import prices were changed.")
    log.info(f"Total files {'would be' if dry_run else 'were'} updated: {updated_files_count}")
    return updated_files_count, changed_resources_summary

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Calibrate import prices for processed goods based on production costs.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show proposed changes without modifying files."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Actually modify the resource JSON files. Use with caution."
    )
    args = parser.parse_args()

    if not args.dry_run and not args.force:
        log.info("Please specify either --dry-run to see proposed changes or --force to apply them.")
        log.info("Example: python backend/scripts/calibrateImportPrices.py --dry-run")
        log.info("Example: python backend/scripts/calibrateImportPrices.py --force")
        return

    log.info(f"Starting Import Price Calibration (Dry Run: {args.dry_run}, Force Apply: {args.force})...")

    resource_defs = load_resource_definitions_from_files(RESOURCES_DATA_DIR)
    if not resource_defs:
        log.error(f"{LogColors.FAIL}No resource definitions loaded. Aborting.{LogColors.ENDC}")
        return

    building_type_defs = get_building_type_definitions_from_api()
    if not building_type_defs:
        log.error(f"{LogColors.FAIL}No building type definitions loaded from API. Aborting.{LogColors.ENDC}")
        return

    calibrated_prices = calibrate_prices(resource_defs, building_type_defs)
    
    if calibrated_prices:
        update_resource_files(resource_defs, calibrated_prices, dry_run=(not args.force))
    else:
        log.info("No prices were calibrated.")

    log.info(f"{LogColors.OKGREEN}Import Price Calibration script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
