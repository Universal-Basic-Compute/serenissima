#!/usr/bin/env python3
"""
Bulk Adjust Building Resource Quantities script for La Serenissima.

This script adjusts the quantities of construction resources for buildings.
The goal is to make the recalculated total construction cost (materials + wages + markup)
align more closely with the 'ducats' value currently specified in the building's
constructionCosts.

It calculates a multiplier for resource quantities based on the difference between
the target ducat price and the costs derived from wages and markup.
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, Optional, Any, Tuple
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
log = logging.getLogger("bulkAdjustBuildingResourceQuantities")

# Data paths
RESOURCES_DATA_DIR = Path(PROJECT_ROOT) / "data" / "resources"
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings"
DEFAULT_WAGE_RATE_PER_DAY = 2000.0  # Ducats per day of construction
DEFAULT_MARKUP_PERCENTAGE = 50.0 # Percentage markup on raw costs
MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24.0

# Add project root to sys.path
# ... (sys.path manipulation code remains here) ...

# Import LogColors from activity_helpers
from backend.engine.utils.activity_helpers import LogColors

# --- Helper Functions (adapted from bulkAdjustBuildingPrices.py) ---

def load_resource_definitions_from_files(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all resource JSON files from the specified base directory."""
    resource_defs = {}
    log.debug(f"Scanning for resource JSON files in {base_dir}...")
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
    log.info(f"Loaded {len(resource_defs)} resource definitions for price lookup.")
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
            
            if "name" not in data or "constructionCosts" not in data or "ducats" not in data.get("constructionCosts", {}):
                log.warning(f"{LogColors.WARNING}Building file {file_path} is missing 'name', 'constructionCosts', or 'ducats' in constructionCosts. Skipping.{LogColors.ENDC}")
                continue
            
            building_defs[building_id] = {
                "path": str(file_path),
                "data": data, # Keep the full data for modification
                "original_target_ducat_price": float(data["constructionCosts"]["ducats"])
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading building file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(building_defs)} building definitions.")
    return building_defs

def calculate_current_material_cost(
    building_id: str,
    construction_costs_dict: Dict[str, Any],
    resource_import_prices: Dict[str, float]
) -> float:
    """Calculates material cost based on current quantities."""
    material_cost = 0.0
    for resource_name, quantity in construction_costs_dict.items():
        if resource_name == "ducats":
            continue
        if not isinstance(quantity, (int, float)) or quantity < 0:
            log.warning(f"{LogColors.WARNING}Building {building_id} has invalid quantity '{quantity}' for resource '{resource_name}' in current costs. Skipping this resource in cost calculation.{LogColors.ENDC}")
            continue
        
        resource_price = resource_import_prices.get(resource_name)
        if resource_price is None:
            log.warning(f"{LogColors.WARNING}Building {building_id} uses resource '{resource_name}' which has no import price. Assuming 0 cost for this resource.{LogColors.ENDC}")
            resource_price = 0.0
        material_cost += float(quantity) * resource_price
    return round(material_cost, 2)

def calculate_wage_cost(
    building_id: str,
    building_data: Dict[str, Any],
    wage_rate_per_day: float
) -> float:
    """Calculates wage cost."""
    construction_time_ms = building_data.get("constructionTime")
    if construction_time_ms is None:
        log.warning(f"{LogColors.WARNING}Building {building_id} missing 'constructionTime'. Assuming 0 wage cost.{LogColors.ENDC}")
        return 0.0
    if not isinstance(construction_time_ms, (int, float)) or construction_time_ms < 0:
        log.warning(f"{LogColors.WARNING}Building {building_id} has invalid 'constructionTime': {construction_time_ms}. Assuming 0 wage cost.{LogColors.ENDC}")
        return 0.0
    
    construction_days = float(construction_time_ms) / MILLISECONDS_IN_DAY
    return round(construction_days * wage_rate_per_day, 2)

def process_and_adjust_building_quantities(
    building_definitions: Dict[str, Dict[str, Any]],
    resource_import_prices: Dict[str, float],
    wage_rate_per_day: float,
    markup_percentage: float
) -> Tuple[Dict[str, Dict[str, Any]], int]:
    """
    Processes buildings, calculates and applies resource quantity multipliers.
    Returns the modified definitions and count of buildings with changed quantities.
    """
    log.info(f"\n{LogColors.BOLD}--- Adjusting Building Resource Quantities ---{LogColors.ENDC}")
    log.info(f"Targeting current 'ducats' price with Wage Rate: {wage_rate_per_day}/day, Markup: {markup_percentage}%")
    
    changed_buildings_count = 0
    processed_building_definitions = {} # To store definitions with potentially modified quantities
    total_buildings_for_qty_adj = len(building_definitions)
    log.info(f"Adjusting resource quantities for {total_buildings_for_qty_adj} building definitions.")

    for i, (building_id, details) in enumerate(building_definitions.items()):
        # log.info(f"  Processing building {i+1}/{total_buildings_for_qty_adj} for quantity adjustment: {building_id}")
        building_data = details["data"]
        original_target_ducat_price = details["original_target_ducat_price"]
        current_construction_costs = building_data.get("constructionCosts", {})

        log.info(f"Processing Building: {LogColors.OKBLUE}{building_id}{LogColors.ENDC} (Target Ducats: {original_target_ducat_price:.2f})")

        current_mat_cost = calculate_current_material_cost(building_id, current_construction_costs, resource_import_prices)
        calculated_wage_cost = calculate_wage_cost(building_id, building_data, wage_rate_per_day)
        
        log.info(f"  Current Material Cost: {current_mat_cost:.2f}, Wage Cost: {calculated_wage_cost:.2f}")

        # Calculate the material cost needed to achieve the target ducat price
        target_total_raw_cost = original_target_ducat_price / (1 + markup_percentage / 100.0)
        target_material_cost = round(target_total_raw_cost - calculated_wage_cost, 2)
        log.info(f"  Target Raw Cost (for ducats target): {target_total_raw_cost:.2f} => Target Material Cost: {target_material_cost:.2f}")

        resource_quantity_multiplier: float
        if target_material_cost < 0:
            log.warning(f"  {LogColors.WARNING}Target material cost ({target_material_cost:.2f}) is negative for {building_id}. "
                        f"This means wage cost + markup ({calculated_wage_cost * (1 + markup_percentage / 100.0):.2f}) "
                        f"already exceeds target ducat price ({original_target_ducat_price:.2f}). "
                        f"Setting multiplier to 0 to minimize material costs.{LogColors.ENDC}")
            resource_quantity_multiplier = 0.0
        elif current_mat_cost == 0:
            if target_material_cost == 0:
                log.info(f"  {building_id} has no current material cost and target material cost is 0. No change to quantities.")
                resource_quantity_multiplier = 1.0
            else: # target_material_cost > 0
                log.warning(f"  {LogColors.WARNING}{building_id} has no current material cost, but target material cost is {target_material_cost:.2f}. "
                            f"Cannot calculate multiplier. Manual addition of base materials needed. Skipping quantity changes.{LogColors.ENDC}")
                resource_quantity_multiplier = 1.0 # No change
        else: # current_mat_cost > 0 and target_material_cost >= 0
            resource_quantity_multiplier = target_material_cost / current_mat_cost
            log.info(f"  Calculated Resource Quantity Multiplier: {resource_quantity_multiplier:.4f}")

        # Apply multiplier to resource quantities
        new_construction_costs = current_construction_costs.copy() # Start with a copy
        quantities_changed_for_this_building = False
        
        if abs(resource_quantity_multiplier - 1.0) > 1e-4 : # Only proceed if multiplier suggests a change
            for res_name, orig_qty_any in current_construction_costs.items():
                if res_name == "ducats":
                    continue
                
                try:
                    orig_qty = float(orig_qty_any)
                except (ValueError, TypeError):
                    log.warning(f"  Invalid original quantity '{orig_qty_any}' for {res_name} in {building_id}. Skipping this resource.")
                    continue

                new_qty_float = orig_qty * resource_quantity_multiplier

                if new_qty_float > 30:
                    # Round to the nearest 10 for quantities greater than 30
                    final_new_qty = int(round(new_qty_float / 10.0)) * 10
                    # Since new_qty_float > 30, final_new_qty will be at least 30 (e.g. 30.1 -> 30, 34.9 -> 30, 35.0 -> 40)
                elif new_qty_float > 0: # Covers 0 < new_qty_float <= 30
                    new_qty_int = int(round(new_qty_float))
                    # If it was a small positive that rounded to 0 (or negative, though less likely for positive input)
                    if new_qty_int <= 0: 
                        # Ensure quantity is at least 1 if it was originally > 0
                        final_new_qty = 1 if orig_qty > 0 else 0
                    else: # new_qty_int is positive
                        final_new_qty = new_qty_int
                else: # new_qty_float <= 0 (negative or zero)
                    final_new_qty = 0
                
                if final_new_qty != int(round(orig_qty)): # Check if quantity actually changed
                    log.info(f"    Resource {res_name}: Qty {orig_qty} -> {final_new_qty} (Multiplier: {resource_quantity_multiplier:.4f})")
                    new_construction_costs[res_name] = final_new_qty
                    quantities_changed_for_this_building = True
                else:
                    new_construction_costs[res_name] = int(round(orig_qty)) # Ensure it's an int if no change

        if quantities_changed_for_this_building:
            changed_buildings_count += 1
            details["data"]["constructionCosts"] = new_construction_costs # Update data in memory
        
        # Recalculate final ducat price with new quantities for verification
        final_recalculated_material_cost = calculate_current_material_cost(building_id, new_construction_costs, resource_import_prices)
        final_new_ducat_price = round((final_recalculated_material_cost + calculated_wage_cost) * (1 + markup_percentage / 100.0), 2)
        
        price_diff_color = LogColors.OKGREEN if abs(final_new_ducat_price - original_target_ducat_price) < 0.01 * original_target_ducat_price else LogColors.WARNING
        log.info(f"  New Calculated Material Cost: {final_recalculated_material_cost:.2f}")
        log.info(f"  {LogColors.BOLD}Final Recalculated Ducat Price: {price_diff_color}{final_new_ducat_price:.2f}{LogColors.ENDC} "
                 f"(Original Target: {original_target_ducat_price:.2f}, Diff: {price_diff_color}{final_new_ducat_price - original_target_ducat_price:+.2f}{LogColors.ENDC})\n")
        
        processed_building_definitions[building_id] = details # Store for saving

    log.info(f"Resource quantity adjustment complete. {changed_buildings_count} buildings had quantities changed in memory.")
    return processed_building_definitions, changed_buildings_count

def save_modified_building_files(
    building_definitions: Dict[str, Dict[str, Any]], # These are the processed definitions
    dry_run: bool
) -> int:
    """Saves the modified building data (with new quantities) back to their JSON files."""
    updated_files_count = 0
    
    log.info(f"\n{LogColors.BOLD}--- Saving Modified Building Files ({'DRY RUN' if dry_run else 'APPLYING CHANGES'}) ---{LogColors.ENDC}")

    for building_id, details in building_definitions.items():
        file_path_str = details["path"]
        # The 'data' in details should already be updated by process_and_adjust_building_quantities
        building_data_to_save = details["data"] 

        # To determine if we should log/save, we need to compare original constructionCosts (excluding ducats)
        # with the new ones. This is implicitly handled by whether quantities_changed_for_this_building was true.
        # For simplicity, if the file is in building_definitions from processing, we assume it might have changed.
        # A more robust check would compare old vs new quantities map.
        # However, the `changed_buildings_count` from processing gives us a good idea.

        # For dry run, we always log if it was processed. For actual save, we write.
        # The actual check if quantities changed is done during processing.
        # Here, we just need to know if it's a file that *could* have changed.

        # Let's refine: only save/log if quantities actually changed.
        # We need to reload original data to compare quantities if we don't store original quantities.
        # Simpler: if the `building_data_to_save` is different from what's on disk for constructionCosts (excluding ducats).
        # The current logic relies on `quantities_changed_for_this_building` which is local to the processing function.
        # We can re-evaluate if a save is needed by comparing the `constructionCosts` (excluding ducats)
        # of `building_data_to_save` with a freshly loaded version of the file.
        # Or, pass a flag from the processing function.

        # For now, let's assume if it's in the processed list and not dry_run, we save.
        # The log during processing already indicates changes.

        # A simple check: if the ducat price is the same, and constructionCosts dict is the same, no change.
        # But we are *not* changing ducat price here. We are changing resource quantities.
        # We need to check if the resource quantities in building_data_to_save["constructionCosts"]
        # are different from the original ones.
        # The `changed_buildings_count` from `process_and_adjust_building_quantities` tells us how many files *had* changes.
        # We can iterate through those.

        # The `building_definitions` passed here *are* the ones with modified data.
        # We need to compare `building_data_to_save["constructionCosts"]` with original.
        # Let's load original again for comparison to be safe for the save logic.
        
        try:
            with open(file_path_str, 'r', encoding='utf-8') as f_orig:
                original_data_on_disk = json.load(f_orig)
            original_costs_on_disk = original_data_on_disk.get("constructionCosts", {}).copy()
            current_costs_in_memory = building_data_to_save.get("constructionCosts", {}).copy()
            
            # Don't compare ducats field for quantity changes
            original_costs_on_disk.pop("ducats", None)
            current_costs_in_memory.pop("ducats", None)

            if original_costs_on_disk == current_costs_in_memory:
                log.debug(f"  [NO QUANTITY CHANGE] Building {building_id}. Skipping save.")
                continue
        except Exception: # If reading original fails, assume change and proceed
            pass


        if not dry_run:
            try:
                with open(file_path_str, 'w', encoding='utf-8') as f:
                    json.dump(building_data_to_save, f, indent=2, ensure_ascii=False)
                log.info(f"  {LogColors.OKGREEN}Successfully updated quantities in file: {file_path_str}{LogColors.ENDC}")
                updated_files_count += 1
            except Exception as e:
                log.error(f"{LogColors.FAIL}  Failed to update file {file_path_str}: {e}{LogColors.ENDC}")
        else:
            log.info(f"  [DRY RUN] Would update quantities in file: {file_path_str}")
            updated_files_count +=1 # Count files that would be touched
            
    if dry_run:
        log.info(f"Total files that would have quantities updated: {updated_files_count}")
    else:
        log.info(f"Total files with quantities updated: {updated_files_count}")
    return updated_files_count

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Bulk adjust building construction resource quantities.")
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
        help=f"Markup percentage used in the target calculation (default: {DEFAULT_MARKUP_PERCENTAGE}%)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to files. If not set, changes will be applied."
    )
    args = parser.parse_args()

    log.info(f"Starting Bulk Building Resource Quantity Adjustment (Dry Run: {args.dry_run})...")

    resource_import_prices = get_resource_import_prices(RESOURCES_DATA_DIR)
    if not resource_import_prices:
        log.error(f"{LogColors.FAIL}No resource import prices loaded. Aborting.{LogColors.ENDC}")
        return

    building_definitions = load_building_definitions_from_files(BUILDINGS_DATA_DIR)
    if not building_definitions:
        log.error(f"{LogColors.FAIL}No building definitions loaded. Aborting.{LogColors.ENDC}")
        return
    
    processed_definitions, _ = process_and_adjust_building_quantities(
        building_definitions,
        resource_import_prices,
        args.wage_rate_per_day,
        args.markup_percentage
    )
    
    save_modified_building_files(processed_definitions, dry_run=args.dry_run)

    log.info(f"{LogColors.OKGREEN}Bulk Building Resource Quantity Adjustment script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
