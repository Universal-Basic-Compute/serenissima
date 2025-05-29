#!/usr/bin/env python3
"""
Analyzes profitability of building Arti (recipes) for La Serenissima.

This script iterates through all building definitions, and for each "Arti" (recipe)
found in their productionInformation, it calculates:
- Total cost of input resources (based on importPrice).
- Total value of output resources (based on importPrice).
- Markup (Output Value - Input Cost).
- Markup per hour (Markup / Craft Time).

It logs these details and highlights (in color) any Arti that uses resources
for which an importPrice cannot be found.

The script can also modify the building JSON files:
- For buildings not in the 'business' category, it will clear their Arti list.
- For 'business' buildings:
    - It will remove inputs from Arti recipes if the resource's importPrice is
      not found or if the quantity is invalid.
    - It will attempt to adjust input quantities to meet a target markup percentage
      (25% for 'processed_materials' outputs, 50% for 'finished_goods' outputs).
      Inputs will be integers, with a minimum of 1.
These modifications are controlled by the --dry-run flag.
"""

import os
import sys
import json
import logging
import argparse # Added for --dry-run
from typing import Dict, Any, List, Optional
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
log = logging.getLogger("analyzeBuildingArti")

# Data paths
RESOURCES_DATA_DIR = Path(PROJECT_ROOT) / "data" / "resources"
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings"

class LogColors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'
    BOLD = '\033[1m'
    CYAN = '\033[96m'

# --- Helper Functions (adapted from existing scripts) ---

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
                # Ensure importPrice exists, even if 0, for consistent access
                data['importPrice'] = 0.0 
                log.debug(f"Resource {resource_id} missing importPrice, defaulted to 0.0 for internal consistency.")

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
            # Use .get to safely access importPrice, defaulting if key is missing (though load_resource_definitions_from_files tries to ensure it)
            price_val = details["data"].get("importPrice")
            if price_val is None: # Should not happen if load_resource_definitions_from_files ensures it
                log.warning(f"{LogColors.WARNING}Resource {res_id} has no 'importPrice' field after loading. Defaulting to 0.0.{LogColors.ENDC}")
                prices[res_id] = 0.0
            else:
                prices[res_id] = float(price_val)
        except (ValueError, TypeError):
            log.error(f"{LogColors.FAIL}Invalid importPrice for resource {res_id} ('{details['data'].get('importPrice')}'). Defaulting to 0.0.{LogColors.ENDC}")
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
            
            if "name" not in data: # Basic check for a valid building file
                 log.warning(f"{LogColors.WARNING}Building file {file_path} is missing 'name'. Skipping.{LogColors.ENDC}")
                 continue

            building_defs[building_id] = {
                "path": str(file_path),
                "data": data,
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading building file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(building_defs)} building definitions.")
    return building_defs

# --- Arti Processing Function ---
def process_building_arti(
    building_id: str,
    building_data: Dict[str, Any], # Will be modified in-place
    resource_import_prices: Dict[str, float],
    all_resource_definitions: Dict[str, Dict[str, Any]], # For category lookup
    all_arti_metrics: List[Dict[str, Any]] # List to store metrics for all Arti
):
    """
    Analyzes and logs the profitability of each Arti recipe for a single building.
    Modifies the building_data in-place by:
    1. Removing inputs with no import price or invalid quantities.
    2. Adjusting input quantities to meet a target markup percentage based on output category.
    """
    prod_info = building_data.get("productionInformation")
    if not prod_info or not isinstance(prod_info, dict):
        log.info(f"  No valid productionInformation found for {building_id}. Skipping Arti processing.")
        return

    arti_list = prod_info.get("Arti")
    if not isinstance(arti_list, list):
        log.info(f"  No Arti list found or invalid format in productionInformation for {building_id}. Skipping Arti processing.")
        return
    
    if not arti_list:
        log.info(f"  No Arti defined for {building_id}.")
        return

    for i, arti_recipe in enumerate(arti_list):
        arti_label = f"Arti #{i+1}"
        log.info(f"  Analyzing {LogColors.OKCYAN}{arti_label}{LogColors.ENDC}:")

        # --- Initializations ---
        inputs_field = arti_recipe.get("inputs")
        outputs_field = arti_recipe.get("outputs", {})
        craft_minutes_val = arti_recipe.get("craftMinutes")
        
        inputs_modified_this_pass = False # Tracks if inputs are changed in current processing pass

        if not isinstance(outputs_field, dict):
            log.warning(f"    {LogColors.WARNING}{arti_label} has malformed 'outputs' (not a dictionary). Output value calculation might be incorrect. Skipping markup adjustment.{LogColors.ENDC}")
            outputs_field = {} 
        
        # --- 1. Clean Inputs (remove those with no price or invalid quantity) ---
        if not isinstance(inputs_field, dict):
            log.warning(f"    {LogColors.WARNING}{arti_label} has malformed or missing 'inputs' (expected a dictionary). Skipping input processing for this Arti.{LogColors.ENDC}")
            inputs_dict = {} # Ensure it's a dict for safe processing later
        else:
            inputs_dict = inputs_field # Direct reference for modification
            log.info(f"    {LogColors.BOLD}Phase 1: Cleaning Inputs (removing items with no price or invalid qty from JSON):{LogColors.ENDC}")
            
            items_to_process = list(inputs_dict.items()) # Iterate over a copy for safe removal
            for resource_id, quantity_any in items_to_process:
                try:
                    quantity_float = float(quantity_any)
                    if quantity_float < 0: raise ValueError("Quantity cannot be negative")
                except (ValueError, TypeError):
                    log.warning(f"      - {resource_id}: Invalid quantity '{quantity_any}'. {LogColors.WARNING}REMOVING this input.{LogColors.ENDC}")
                    if resource_id in inputs_dict: del inputs_dict[resource_id]; inputs_modified_this_pass = True
                    continue

                price = resource_import_prices.get(resource_id)
                if price is None:
                    log.warning(f"      - {resource_id} (Qty: {quantity_float}): {LogColors.FAIL}IMPORT PRICE NOT FOUND. REMOVING this input.{LogColors.ENDC}")
                    if resource_id in inputs_dict: del inputs_dict[resource_id]; inputs_modified_this_pass = True
                else:
                    log.info(f"      - {resource_id} (Qty: {quantity_float} @ {price:.2f} each): Kept for now.")
        
        if inputs_modified_this_pass:
            log.warning(f"    {LogColors.WARNING}Note: Some inputs were removed from this Arti's definition due to missing prices or invalid quantities.{LogColors.ENDC}")

        # --- 2. Calculate Output Value ---
        total_output_value = 0.0
        any_output_resource_price_missing = False
        primary_output_id_for_arti: Optional[str] = next(iter(outputs_field), None) # For metrics

        log.info(f"    {LogColors.BOLD}Phase 2: Calculating Total Output Value:{LogColors.ENDC}")
        if not outputs_field:
            log.info(f"      (No outputs defined - this recipe produces nothing of known value)")
        for resource_id, quantity_any in outputs_field.items():
            try:
                quantity = float(quantity_any)
                if quantity < 0: raise ValueError("Quantity cannot be negative")
            except (ValueError, TypeError):
                log.warning(f"      - {resource_id}: Invalid quantity '{quantity_any}' in outputs. Skipping for value calculation.")
                continue
            price = resource_import_prices.get(resource_id)
            if price is None:
                log.warning(f"      - {resource_id} (Qty: {quantity}): {LogColors.FAIL}OUTPUT IMPORT PRICE NOT FOUND (cannot determine value accurately){LogColors.ENDC}")
                any_output_resource_price_missing = True
            else:
                value = quantity * price
                total_output_value += value
                log.info(f"      - {resource_id} (Qty: {quantity} @ {price:.2f} each): {value:.2f} Ducats")
        log.info(f"    Total Output Value (based on importPrices): {total_output_value:.2f} Ducats")
        if any_output_resource_price_missing:
             log.warning(f"    {LogColors.WARNING}Note: Total output value calculation is affected by missing import prices for some output resources.{LogColors.ENDC}")

        # --- 3. Adjust Input Quantities for Target Markup ---
        log.info(f"    {LogColors.BOLD}Phase 3: Adjusting Input Quantities for Target Markup:{LogColors.ENDC}")
        target_markup_percentage = None
        if not outputs_field:
            log.info("      No outputs defined. Skipping markup-based input adjustment.")
        else:
            primary_output_id = next(iter(outputs_field), None)
            if not primary_output_id: # Should be caught by `if not outputs_field`
                 log.info("      Primary output ID not found. Skipping markup-based input adjustment.")
            else:
                primary_output_def = all_resource_definitions.get(primary_output_id)
                if not primary_output_def or "data" not in primary_output_def:
                    log.warning(f"      Definition for primary output '{primary_output_id}' not found. Skipping markup adjustment.")
                else:
                    output_category = primary_output_def["data"].get("category")
                    if output_category == "processed_materials": target_markup_percentage = 25.0
                    elif output_category == "finished_goods": target_markup_percentage = 50.0
                    else:
                        log.info(f"      Primary output '{primary_output_id}' category ('{output_category}') not targeted for markup adjustment. Skipping.")
        
        if target_markup_percentage is not None and inputs_dict: # Only if target is set and there are inputs to adjust
            log.info(f"      Targeting {target_markup_percentage}% markup for output category '{output_category}'.")
            if total_output_value <= 0:
                log.warning(f"      Total output value is {total_output_value:.2f}. Cannot target markup. Setting input quantities to 1.")
                for res_id_key in list(inputs_dict.keys()): # Iterate over keys if dict might change
                    if inputs_dict[res_id_key] != 1: inputs_modified_this_pass = True
                    inputs_dict[res_id_key] = 1
            else:
                target_input_cost = total_output_value / (1 + target_markup_percentage / 100.0)
                log.info(f"      Target Input Cost for {target_markup_percentage}% markup: {target_input_cost:.2f} Ducats.")

                if target_input_cost <= 0:
                    log.warning(f"      Calculated Target Input Cost ({target_input_cost:.2f}) is zero or negative. Setting input quantities to 1.")
                    for res_id_key in list(inputs_dict.keys()):
                        if inputs_dict[res_id_key] != 1: inputs_modified_this_pass = True
                        inputs_dict[res_id_key] = 1
                else:
                    # Prepare for adjustment: ensure all current inputs are at least 1 and get their prices
                    current_adjusted_inputs = {} # res_id -> new_qty
                    cost_at_min_qty = 0.0
                    priced_inputs_for_distribution = {} # res_id -> price, for those with price > 0

                    for res_id, current_qty_val in inputs_dict.items():
                        price = resource_import_prices.get(res_id, 0.0) # Should exist if survived cleaning
                        current_adjusted_inputs[res_id] = int(max(1, round(float(current_qty_val)))) # Ensure current are int and >=1
                        if price > 0:
                            cost_at_min_qty += price # Cost of 1 unit of this priced input
                            priced_inputs_for_distribution[res_id] = price
                    
                    if not priced_inputs_for_distribution:
                        log.warning("      No inputs with positive price found for proportional adjustment. Quantities set to 1 or current if unpriced.")
                        for res_id_key in list(inputs_dict.keys()): # Ensure all are at least 1
                            new_val = int(max(1, round(float(inputs_dict[res_id_key]))))
                            if inputs_dict[res_id_key] != new_val: inputs_modified_this_pass = True
                            inputs_dict[res_id_key] = new_val
                    elif cost_at_min_qty >= target_input_cost:
                        log.info(f"      Cost with all priced inputs at quantity 1 ({cost_at_min_qty:.2f}) already meets/exceeds target input cost ({target_input_cost:.2f}). Setting priced inputs to 1.")
                        for res_id_key_priced in priced_inputs_for_distribution:
                            if inputs_dict[res_id_key_priced] != 1:
                                inputs_dict[res_id_key_priced] = 1
                                inputs_modified_this_pass = True
                        # Ensure unpriced inputs are also at least 1 (should be from Phase 1)
                        for res_id_key_unpriced in list(inputs_dict.keys()):
                            if res_id_key_unpriced not in priced_inputs_for_distribution:
                                current_val = inputs_dict[res_id_key_unpriced]
                                new_val = int(max(1, round(float(current_val))))
                                if current_val != new_val:
                                    inputs_dict[res_id_key_unpriced] = new_val
                                    inputs_modified_this_pass = True
                    else: # cost_at_min_qty < target_input_cost, and priced_inputs_for_distribution is not empty
                        log.info(f"      Attempting greedy quantity adjustment to reach target input cost of {target_input_cost:.2f} Ducats.")
                        
                        # Initialize current_total_cost: set priced inputs to Qty 1, sum their costs. Unpriced inputs cost 0.
                        current_total_cost = 0.0
                        for res_id_key_init in list(inputs_dict.keys()):
                            price_val_init = resource_import_prices.get(res_id_key_init, 0.0)
                            if price_val_init > 0: # Priced input
                                if inputs_dict[res_id_key_init] != 1:
                                    inputs_dict[res_id_key_init] = 1
                                    inputs_modified_this_pass = True # Changed if original was not 1
                                current_total_cost += price_val_init # Cost of one unit
                            # else: Unpriced input. Quantity already >=1 from Phase 1. Cost contribution is 0.
                        
                        log.info(f"      Initial cost for greedy adjustment (all priced inputs at Qty 1): {current_total_cost:.2f} Ducats.")

                        MAX_GREEDY_ITERATIONS = 500 # Safety break for the loop
                        for iteration in range(MAX_GREEDY_ITERATIONS):
                            initial_diff_from_target_this_iter = abs(current_total_cost - target_input_cost)
                            
                            candidate_increments = [] # Stores (potential_next_diff, price_of_item, res_id)

                            for res_id_candidate, price_candidate in priced_inputs_for_distribution.items():
                                potential_next_total_cost = current_total_cost + price_candidate
                                potential_next_diff = abs(potential_next_total_cost - target_input_cost)
                                candidate_increments.append((potential_next_diff, price_candidate, res_id_candidate))
                            
                            if not candidate_increments: # Should not happen if priced_inputs_for_distribution is not empty
                                log.warning("      No candidate inputs for greedy increment. Stopping.")
                                break

                            # Sort candidates: primary key diff (asc), secondary key price (asc for tie-breaking)
                            candidate_increments.sort() 
                            
                            best_potential_diff, _, best_input_to_increment = candidate_increments[0]

                            if best_potential_diff < initial_diff_from_target_this_iter:
                                # Incrementing this input gets us closer to the target cost
                                inputs_dict[best_input_to_increment] += 1
                                current_total_cost += priced_inputs_for_distribution[best_input_to_increment]
                                inputs_modified_this_pass = True
                                log.info(f"        Greedy iter {iteration+1}: Incremented '{best_input_to_increment}'. New Qty: {inputs_dict[best_input_to_increment]}. New Total Cost: {current_total_cost:.2f}. Diff from target: {best_potential_diff:.2f}")
                            else:
                                # No single increment improves the cost further
                                log.info(f"        Greedy iter {iteration+1}: No further improvement found (current diff: {initial_diff_from_target_this_iter:.2f}, best next diff: {best_potential_diff:.2f}). Stopping greedy adjustment.")
                                break
                        else: # Loop finished due to MAX_GREEDY_ITERATIONS
                            log.warning(f"        Greedy adjustment reached max iterations ({MAX_GREEDY_ITERATIONS}). Final cost: {current_total_cost:.2f}")
        elif not inputs_dict:
            log.info("      No inputs remaining after cleaning (or no priced inputs for adjustment). Skipping markup adjustment.")
        else: # target_markup_percentage was None
            log.info("      No target markup applicable. Input quantities not adjusted by this phase.")


        # --- 4. Recalculate Final Input Cost & Log Metrics ---
        log.info(f"    {LogColors.BOLD}Phase 4: Final Metrics Calculation:{LogColors.ENDC}")
        final_total_input_cost = 0.0
        if not inputs_dict:
            log.info("      No inputs to calculate final cost.")
        else:
            for res_id, quantity_val in inputs_dict.items():
                price = resource_import_prices.get(res_id, 0.0) # Price should exist if it survived cleaning
                cost = float(quantity_val) * price
                final_total_input_cost += cost
                log.info(f"      - Final Input: {res_id} (Qty: {quantity_val} @ {price:.2f} each): {cost:.2f} Ducats")
        log.info(f"    {LogColors.BOLD}Final Total Input Cost:{LogColors.ENDC} {final_total_input_cost:.2f} Ducats")

        # Log final markup
        final_markup = total_output_value - final_total_input_cost
        final_markup_percentage_actual = 0.0
        if final_total_input_cost > 0:
            final_markup_percentage_actual = (final_markup / final_total_input_cost) * 100.0
        
        markup_color = LogColors.OKGREEN if final_markup > 0 else LogColors.FAIL if final_markup < 0 else LogColors.WARNING
        log.info(f"    {LogColors.BOLD}Final Markup (Output Value - Input Cost):{LogColors.ENDC} {markup_color}{final_markup:.2f} Ducats{LogColors.ENDC}")
        log.info(f"    {LogColors.BOLD}Final Actual Markup Percentage:{LogColors.ENDC} {markup_color}{final_markup_percentage_actual:.2f}%{LogColors.ENDC}")
        if target_markup_percentage is not None:
            log.info(f"    (Target Markup Percentage was: {target_markup_percentage:.2f}%)")

        # Calculate Markup per Hour and per Day (using final_markup)
        markup_per_hour: Optional[float] = None
        markup_per_day: Optional[float] = None
        craft_minutes_for_calc: Optional[float] = None

        if craft_minutes_val is None:
            log.warning(f"    {LogColors.WARNING}craftMinutes not defined for {arti_label}. Cannot calculate markup per hour/day.{LogColors.ENDC}")
            log.info(f"    {LogColors.BOLD}Markup per Hour:{LogColors.ENDC} N/A")
            log.info(f"    {LogColors.BOLD}Markup per Day:{LogColors.ENDC} N/A")
        elif not isinstance(craft_minutes_val, (int, float)) or float(craft_minutes_val) <= 0:
            log.warning(f"    {LogColors.WARNING}Invalid craftMinutes ('{craft_minutes_val}') for {arti_label}. Must be a positive number. Cannot calculate markup per hour/day.{LogColors.ENDC}")
            log.info(f"    {LogColors.BOLD}Markup per Hour:{LogColors.ENDC} N/A")
            log.info(f"    {LogColors.BOLD}Markup per Day:{LogColors.ENDC} N/A")
        else:
            craft_minutes_for_calc = float(craft_minutes_val)
            markup_per_hour = (final_markup / craft_minutes_for_calc) * 60.0
            markup_per_day = markup_per_hour * 24.0 # 24 hours in a day
            
            markup_rate_color = LogColors.OKGREEN if markup_per_hour > 0 else LogColors.FAIL if markup_per_hour < 0 else LogColors.WARNING
            log.info(f"    {LogColors.BOLD}Craft Minutes:{LogColors.ENDC} {craft_minutes_for_calc}")
            log.info(f"    {LogColors.BOLD}Markup per Hour:{LogColors.ENDC} {markup_rate_color}{markup_per_hour:.2f} Ducats/hour{LogColors.ENDC}")
            log.info(f"    {LogColors.BOLD}Markup per Day:{LogColors.ENDC} {markup_rate_color}{markup_per_day:.2f} Ducats/day{LogColors.ENDC}")

        # Store metrics for this Arti
        all_arti_metrics.append({
            "building_id": building_id,
            "arti_label": arti_label,
            "primary_output_id": primary_output_id_for_arti,
            "final_input_cost_ducats": round(final_total_input_cost, 2),
            "total_output_value_ducats": round(total_output_value, 2),
            "final_markup_ducats": round(final_markup, 2),
            "final_markup_percentage": round(final_markup_percentage_actual, 2),
            "craft_minutes": craft_minutes_for_calc, # Can be None
            "markup_per_hour_ducats": round(markup_per_hour, 2) if markup_per_hour is not None else None,
            "markup_per_day_ducats": round(markup_per_day, 2) if markup_per_day is not None else None,
        })
        
        log.info("    " + "-" * 30) # Separator for Arti recipes
    log.info("-" * 40) # Separator for buildings


# --- File Saving Function ---
def save_modified_building_files(
    modified_buildings_map: Dict[str, Dict[str, Any]], # path -> data
    dry_run: bool
) -> int:
    """Saves the modified building data back to their JSON files."""
    updated_files_count = 0
    
    log.info(f"\n{LogColors.BOLD}--- Saving Modified Building Files ({'DRY RUN' if dry_run else 'APPLYING CHANGES'}) ---{LogColors.ENDC}")

    if not modified_buildings_map:
        log.info("No building Arti sections were modified, so no files to save.")
        return 0

    for file_path_str, building_data_to_save in modified_buildings_map.items():
        if not dry_run:
            try:
                with open(file_path_str, 'w', encoding='utf-8') as f:
                    json.dump(building_data_to_save, f, indent=2, ensure_ascii=False)
                log.info(f"  {LogColors.OKGREEN}Successfully updated Arti in file: {file_path_str}{LogColors.ENDC}")
                updated_files_count += 1
            except Exception as e:
                log.error(f"{LogColors.FAIL}  Failed to update file {file_path_str}: {e}{LogColors.ENDC}")
        else:
            log.info(f"  [DRY RUN] Would update Arti in file: {file_path_str}")
            # For dry run, we count it as it was marked for modification.
            updated_files_count +=1 
            
    if dry_run:
        log.info(f"Total files that would have Arti updated: {updated_files_count}")
    else:
        log.info(f"Total files with Arti updated: {updated_files_count}")
    return updated_files_count

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Analyzes and optionally modifies building Arti recipes in JSON files.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to files. If not set, changes will be applied."
    )
    args = parser.parse_args()

    log.info(f"{LogColors.BOLD}Starting Building Arti Analysis and Modification (Dry Run: {args.dry_run})...{LogColors.ENDC}")

    # Load all resource definitions first to get categories and prices
    all_resource_definitions = load_resource_definitions_from_files(RESOURCES_DATA_DIR)
    if not all_resource_definitions:
        log.error(f"{LogColors.FAIL}No resource definitions loaded. Critical for analysis/modification. Aborting.{LogColors.ENDC}")
        return

    # Derive import prices from all_resource_definitions
    resource_import_prices: Dict[str, float] = {}
    for res_id, details in all_resource_definitions.items():
        try:
            price_val = details["data"].get("importPrice")
            # Ensure importPrice exists, even if 0, for consistent access (already handled in load_resource_definitions_from_files)
            resource_import_prices[res_id] = float(price_val if price_val is not None else 0.0)
        except (ValueError, TypeError):
            log.error(f"{LogColors.FAIL}Invalid importPrice for resource {res_id} ('{details['data'].get('importPrice')}'). Defaulting to 0.0.{LogColors.ENDC}")
            resource_import_prices[res_id] = 0.0
    log.info(f"Extracted import prices for {len(resource_import_prices)} resources for Arti analysis.")


    all_building_definitions = load_building_definitions_from_files(BUILDINGS_DATA_DIR)
    if not all_building_definitions:
        log.error(f"{LogColors.FAIL}No building definitions loaded. Aborting.{LogColors.ENDC}")
        return
    
    modified_building_data_map: Dict[str, Dict[str, Any]] = {} # path -> data for saving
    all_arti_metrics_collected: List[Dict[str, Any]] = [] # To store metrics from all Arti

    log.info(f"\n{LogColors.BOLD}--- Processing Buildings for Arti Modification and Analysis ---{LogColors.ENDC}")
    for building_id, details in all_building_definitions.items():
        building_data = details["data"] # This is a reference, modifications will persist in all_building_definitions
        file_path = details["path"]
        
        # Capture Arti state before any modification for this building
        original_arti_json = json.dumps(building_data.get("productionInformation", {}).get("Arti", []))
        
        log.info(f"Processing Building: {LogColors.OKBLUE}{building_id}{LogColors.ENDC} (Category: {building_data.get('category', 'N/A')})")

        if building_data.get("category") != "business":
            prod_info = building_data.get("productionInformation")
            if prod_info and isinstance(prod_info.get("Arti"), list) and prod_info["Arti"]:
                log.warning(f"  Building '{building_id}' is not 'business'. {LogColors.WARNING}CLEARING its Arti list in JSON.{LogColors.ENDC}")
                prod_info["Arti"] = []
            else:
                log.info(f"  Building '{building_id}' is not 'business'. Its Arti list is already empty or not present. No changes to Arti.")
        else: # Business category
            process_building_arti(
                building_id,
                building_data, # Modified in-place
                resource_import_prices,
                all_resource_definitions,
                all_arti_metrics_collected # Pass the list to collect metrics
            )
        
        # Check if Arti section actually changed for this building (by comparing JSON strings)
        current_arti_json = json.dumps(building_data.get("productionInformation", {}).get("Arti", []))
        if original_arti_json != current_arti_json:
            modified_building_data_map[file_path] = building_data # Add to map for saving
            log.info(f"  {LogColors.OKCYAN}Building '{building_id}' Arti section was modified and marked for saving.{LogColors.ENDC}")
        else:
            log.info(f"  Building '{building_id}' Arti section remains unchanged.")
        log.info("-" * 40)


    if modified_building_data_map:
        save_modified_building_files(modified_building_data_map, args.dry_run)
    else:
        log.info("No building Arti sections were modified across all processed buildings.")

    log.info(f"\n{LogColors.BOLD}--- Collected Arti Metrics ---{LogColors.ENDC}")
    if all_arti_metrics_collected:
        # Pretty print the JSON array of collected metrics
        print(json.dumps(all_arti_metrics_collected, indent=2))
    else:
        log.info("No Arti metrics were collected (e.g., no business buildings with Arti).")

    log.info(f"{LogColors.OKGREEN}{LogColors.BOLD}Building Arti Analysis and Modification script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
