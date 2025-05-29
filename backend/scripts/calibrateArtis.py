#!/usr/bin/env python3
"""
Calibrate Arti Recipe Inputs script for La Serenissima.

This script adjusts the input quantities in Arti recipes for specific finished goods.
The input quantities are multiplied by a complexityMultiplier associated with the
output resource, effectively increasing the material cost for complex items.
The complexityMultiplier is rounded to the nearest integer before application.

It reads building type definitions directly from data/buildings/ JSON files and
can perform a dry run or apply changes directly.
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, List, Optional, Any
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
log = logging.getLogger("calibrateArtis")

# Data paths
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings"

class LogColors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'
    BOLD = '\033[1m'

# Multiplicateurs de complexité pour certains produits finis.
# Ces multiplicateurs seront arrondis et appliqués aux quantités des inputs des recettes.
COMPLEXITY_MULTIPLIERS = {
    "merchant_galley": 135.0,
    "war_galley": 90.0,
    "gondola": 19.7,
    "small_boats": 15.3,
    "jewelry": 4.6,
    "luxury_silk_garments": 2.9,
    "venetian_lace": 3.2,
    "fine_glassware": 3.0,
    "weapons": 2.9,
    "books": 1.9,
    "maps": 2.5,
    "smuggler_maps": 3.3,
    "blackmail_evidence": 2.0,
    "disguise_materials": 2.7,
    "forgery_tools": 2.7,
    "porter_equipment": 1.4,
    "soap": 1.7,
    "spiced_wine": 1.5,
}

# --- Helper Functions ---

def load_building_type_definitions_from_files(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all building type JSON files from the specified base directory."""
    building_type_defs = {}
    log.info(f"Scanning for building type JSON files in {base_dir}...")
    for file_path in base_dir.rglob('*.json'): # Iterate recursively
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Use filename (without .json) as the building type ID
            building_type_id = file_path.stem
            
            # Store the path along with the data for saving later
            building_type_defs[building_type_id] = {
                "path": str(file_path),
                "data": data
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading building type file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(building_type_defs)} building type definitions from files.")
    return building_type_defs

# --- Main Calibration Logic ---

def calibrate_arti_recipes(
    building_type_definitions: Dict[str, Dict[str, Any]] # Values are dicts like {"path": ..., "data": ...}
) -> Dict[str, Dict[str, Any]]:
    """
    Adjusts input quantities in Arti recipes based on COMPLEXITY_MULTIPLIERS.
    Modifies the 'data' part of building_type_definitions in place.
    Returns the modified building_type_definitions.
    """
    changed_recipes_summary = []

    for building_type_id, bt_details in building_type_definitions.items():
        building_data = bt_details["data"]
        prod_info = building_data.get("productionInformation", {})
        
        if not isinstance(prod_info, dict):
            continue
            
        arti_recipes = prod_info.get("Arti", [])
        if not isinstance(arti_recipes, list):
            continue

        recipes_changed_in_this_building = False
        for recipe_index, recipe in enumerate(arti_recipes):
            if not isinstance(recipe, dict) or not isinstance(recipe.get("outputs"), dict) or not isinstance(recipe.get("inputs"), dict):
                continue

            # Consider the first output as the primary product for complexity scaling
            # This is a simplification; a recipe might produce multiple complex items.
            outputs_dict = recipe["outputs"]
            if not outputs_dict:
                continue
            
            primary_output_id = next(iter(outputs_dict), None) # Get first key (output resource ID)
            if not primary_output_id:
                continue

            if primary_output_id in COMPLEXITY_MULTIPLIERS:
                multiplier = COMPLEXITY_MULTIPLIERS[primary_output_id]
                rounded_multiplier = int(round(multiplier)) # Round to nearest integer

                if rounded_multiplier <= 1: # No significant change or reduction, skip
                    log.debug(f"Multiplier for {primary_output_id} is {rounded_multiplier} (from {multiplier}). Skipping input adjustment for this recipe in {building_type_id}.")
                    continue

                log.info(f"Building Type: {LogColors.OKBLUE}{building_type_id}{LogColors.ENDC}, Recipe for: {LogColors.OKBLUE}{primary_output_id}{LogColors.ENDC} (Multiplier: {multiplier} -> Rounded: {rounded_multiplier})")
                
                original_inputs_str = json.dumps(recipe["inputs"])
                new_inputs = {}
                for input_res_id, input_qty in recipe["inputs"].items():
                    try:
                        original_qty = float(input_qty)
                        new_qty = original_qty * rounded_multiplier
                        # Keep as float if original was float, or int if it becomes whole number
                        new_inputs[input_res_id] = int(new_qty) if new_qty.is_integer() else round(new_qty, 2)
                    except ValueError:
                        log.warning(f"{LogColors.WARNING}Could not parse input quantity '{input_qty}' for {input_res_id} in {building_type_id}. Skipping this input.{LogColors.ENDC}")
                        new_inputs[input_res_id] = input_qty # Keep original if unparseable

                recipe["inputs"] = new_inputs
                recipes_changed_in_this_building = True
                change_info = (f"  - Recipe for {primary_output_id} in {building_type_id}: Inputs changed from {original_inputs_str} to {json.dumps(new_inputs)}")
                log.info(change_info)
                changed_recipes_summary.append(change_info)
        
        if recipes_changed_in_this_building:
            # Update the 'Arti' list in the main building_data dictionary
            prod_info["Arti"] = arti_recipes 
            building_data["productionInformation"] = prod_info
            # bt_details["data"] is already a reference to building_data, so it's updated.

    if changed_recipes_summary:
        log.info(f"\n{LogColors.BOLD}--- Summary of Arti Recipe Changes ---{LogColors.ENDC}")
        for summary_line in changed_recipes_summary:
            log.info(summary_line)
    else:
        log.info("No Arti recipes were modified based on complexity multipliers.")
        
    return building_type_definitions


def save_modified_building_type_files(
    modified_building_type_definitions: Dict[str, Dict[str, Any]],
    dry_run: bool
) -> int:
    """Saves the modified building type data back to their JSON files."""
    updated_files_count = 0
    
    if dry_run:
        log.info(f"\n{LogColors.OKBLUE}[DRY RUN] Would update files for building types with modified Arti recipes.{LogColors.ENDC}")
        # Count how many would be updated
        for bt_id, bt_details in modified_building_type_definitions.items():
            # A simple check: if we have a path and data, assume it might be written.
            # A more precise check would involve comparing original vs modified data.
            # For now, if it's in the dict, assume it's a candidate for writing.
            if "path" in bt_details and "data" in bt_details:
                 # This doesn't actually check if data changed, just that it was processed.
                 # The calibrate_arti_recipes function logs actual changes.
                 # We rely on the fact that only modified data structures are passed or that
                 # the calling logic ensures only changed items are saved.
                 # For this script, calibrate_arti_recipes modifies in place.
                 log.info(f"  [DRY RUN] Would write changes to: {bt_details['path']}")
                 updated_files_count +=1
        log.info(f"[DRY RUN] Total files that would be written: {updated_files_count}")
        return updated_files_count

    log.info(f"\n{LogColors.BOLD}--- Saving Modified Building Type Files ---{LogColors.ENDC}")
    for building_type_id, details in modified_building_type_definitions.items():
        file_path_str = details["path"]
        data_to_save = details["data"]
        try:
            with open(file_path_str, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f, indent=2, ensure_ascii=False)
            log.info(f"{LogColors.OKGREEN}Successfully updated file: {file_path_str}{LogColors.ENDC}")
            updated_files_count += 1
        except Exception as e:
            log.error(f"{LogColors.FAIL}Failed to update file {file_path_str}: {e}{LogColors.ENDC}")
            
    log.info(f"Total files updated: {updated_files_count}")
    return updated_files_count

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Calibrate Arti recipe inputs based on complexity multipliers.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show proposed changes without modifying building type JSON files."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Actually modify the building type JSON files. Use with caution."
    )
    args = parser.parse_args()

    if not args.dry_run and not args.force:
        log.info("Please specify either --dry-run to see proposed changes or --force to apply them.")
        log.info("Example: python backend/scripts/calibrateArtis.py --dry-run")
        log.info("Example: python backend/scripts/calibrateArtis.py --force")
        return

    log.info(f"Starting Arti Recipe Input Calibration (Dry Run: {args.dry_run}, Force Apply: {args.force})...")

    building_type_defs = load_building_type_definitions_from_files(BUILDINGS_DATA_DIR)
    if not building_type_defs:
        log.error(f"{LogColors.FAIL}No building type definitions loaded. Aborting.{LogColors.ENDC}")
        return

    modified_defs = calibrate_arti_recipes(building_type_defs)
    
    if modified_defs: # Check if there's anything to save
        save_modified_building_type_files(modified_defs, dry_run=(not args.force))
    else:
        log.info("No building type definitions were modified or available to save.")

    log.info(f"{LogColors.OKGREEN}Arti Recipe Input Calibration script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
