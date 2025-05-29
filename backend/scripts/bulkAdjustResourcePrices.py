#!/usr/bin/env python3
"""
Bulk Adjust Resource Prices script for La Serenissima.

This script multiplies the importPrice of all resources by a given factor.
It can then optionally call the calibrateImportPrices.py script to further
refine prices based on the new baseline costs.
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import subprocess

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
log = logging.getLogger("bulkAdjustResourcePrices")

# Data paths
RESOURCES_DATA_DIR = Path(PROJECT_ROOT) / "data" / "resources"
CALIBRATE_SCRIPT_PATH = Path(PROJECT_ROOT) / "backend" / "scripts" / "calibrateImportPrices.py"

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
            
            if 'importPrice' not in data: # Ensure importPrice exists
                data['importPrice'] = 0.0 
                log.warning(f"{LogColors.WARNING}Resource {resource_id} missing importPrice, defaulted to 0.0.{LogColors.ENDC}")

            resource_defs[resource_id] = {
                "path": str(file_path),
                "data": data,
                "original_import_price": float(data.get('importPrice', 0.0))
            }
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error loading resource file {file_path}: {e}{LogColors.ENDC}")
    log.info(f"Loaded {len(resource_defs)} resource definitions from files.")
    return resource_defs

def apply_price_multiplier(
    resource_definitions: Dict[str, Dict[str, Any]],
    multiplier: float
) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
    """Applies the multiplier to the importPrice of all resources."""
    log.info(f"\n{LogColors.BOLD}--- Applying Multiplier ({multiplier}x) to All Resource Import Prices ---{LogColors.ENDC}")
    changed_resources_summary = []
    total_resources_to_process_prices = len(resource_definitions)
    log.info(f"Applying multiplier to {total_resources_to_process_prices} resource definitions.")

    for i, (res_id, res_details) in enumerate(resource_definitions.items()):
        # log.debug(f"  Processing resource {i+1}/{total_resources_to_process_prices}: {res_id}")
        original_price = res_details["original_import_price"]
        try:
            new_price = round(original_price * multiplier, 2)
            res_details["data"]["importPrice"] = new_price # Modify in place

            if abs(new_price - original_price) > 0.01 or (original_price == 0 and new_price != 0):
                log_msg = (f"Resource: {LogColors.OKBLUE}{res_id}{LogColors.ENDC} - "
                           f"Original ImportPrice: {original_price:.2f}, "
                           f"Multiplied ImportPrice: {LogColors.OKGREEN}{new_price:.2f}{LogColors.ENDC}")
                log.info(log_msg)
                changed_resources_summary.append(log_msg)
            else:
                log.debug(f"Resource: {res_id} - Price unchanged after multiplication ({original_price:.2f} -> {new_price:.2f}).")

        except TypeError:
            log.error(f"{LogColors.FAIL}Could not multiply price for resource {res_id}. Original price: '{original_price}'. Skipping.{LogColors.ENDC}")
            # Keep original data if error
            res_details["data"]["importPrice"] = original_price


    log.info(f"Multiplier application complete. {len(changed_resources_summary)} prices were changed.")
    return resource_definitions, changed_resources_summary

def save_modified_resource_files(
    resource_definitions: Dict[str, Dict[str, Any]],
    dry_run: bool
) -> int:
    """Saves the modified resource data back to their JSON files."""
    updated_files_count = 0
    
    log.info(f"\n{LogColors.BOLD}--- Saving Modified Resource Files ({'DRY RUN' if dry_run else 'APPLYING CHANGES'}) ---{LogColors.ENDC}")

    for resource_id, res_details in resource_definitions.items():
        file_path_str = res_details["path"]
        resource_data_to_save = res_details["data"] # This now contains the multiplied price

        # We only need to save if the price actually changed from what was loaded.
        # The apply_price_multiplier function already logged individual changes.
        # Here we just write out all files if not dry_run.

        if not dry_run:
            try:
                with open(file_path_str, 'w', encoding='utf-8') as f:
                    json.dump(resource_data_to_save, f, indent=2, ensure_ascii=False)
                # log.info(f"  Successfully updated file: {file_path_str}") # Logged by apply_price_multiplier
                updated_files_count += 1
            except Exception as e:
                log.error(f"{LogColors.FAIL}  Failed to update file {file_path_str}: {e}{LogColors.ENDC}")
        else:
            # Log which files would be updated if it's a dry run
            # This is mainly for confirmation, individual price changes were logged before.
            if abs(resource_data_to_save.get("importPrice", 0.0) - res_details["original_import_price"]) > 0.01 \
               or (res_details["original_import_price"] == 0 and resource_data_to_save.get("importPrice", 0.0) != 0):
                log.info(f"  [DRY RUN] Would update file: {file_path_str} with new importPrice: {resource_data_to_save.get('importPrice', 0.0):.2f}")
                updated_files_count +=1
            
    if dry_run:
        log.info(f"Total files that would be updated by initial multiplication: {updated_files_count}")
    else:
        log.info(f"Total files updated by initial multiplication: {updated_files_count}")
    return updated_files_count

def run_calibrate_import_prices_script(apply_changes_to_calibration: bool):
    """Runs the calibrateImportPrices.py script as a subprocess."""
    log.info(f"\n{LogColors.BOLD}--- Running calibrateImportPrices.py Script ---{LogColors.ENDC}")
    
    command = [sys.executable, str(CALIBRATE_SCRIPT_PATH)]
    if apply_changes_to_calibration:
        command.append("--force")
        log.info("Calling calibrateImportPrices.py with --force...")
    else:
        command.append("--dry-run")
        log.info("Calling calibrateImportPrices.py with --dry-run...")

    try:
        # Using Popen to stream output in real-time
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, universal_newlines=True)
        
        if process.stdout:
            for line in iter(process.stdout.readline, ''):
                # Prepend a marker to distinguish calibrateImportPrices output
                log.info(f"[CalibrateScript] {line.strip()}")
            process.stdout.close()
        
        return_code = process.wait()
        if return_code == 0:
            log.info(f"{LogColors.OKGREEN}calibrateImportPrices.py finished successfully.{LogColors.ENDC}")
        else:
            log.error(f"{LogColors.FAIL}calibrateImportPrices.py failed with return code {return_code}.{LogColors.ENDC}")
    except FileNotFoundError:
        log.error(f"{LogColors.FAIL}calibrateImportPrices.py script not found at {CALIBRATE_SCRIPT_PATH}.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error running calibrateImportPrices.py: {e}{LogColors.ENDC}")

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Bulk adjust resource import prices and then run calibration.")
    parser.add_argument(
        "--multiplier",
        type=float,
        required=True,
        help="Factor to multiply all existing importPrices by (e.g., 30.0)."
    )
    parser.add_argument(
        "--apply-changes",
        action="store_true",
        help="If set, saves the initial multiplied prices to files AND runs calibrateImportPrices.py with --force. Otherwise, all operations are dry runs."
    )
    args = parser.parse_args()

    is_dry_run_mode = not args.apply_changes

    log.info(f"Starting Bulk Resource Price Adjustment (Multiplier: {args.multiplier}, Apply Changes: {args.apply_changes})...")

    resource_definitions = load_resource_definitions_from_files(RESOURCES_DATA_DIR)
    if not resource_definitions:
        log.error(f"{LogColors.FAIL}No resource definitions loaded. Aborting.{LogColors.ENDC}")
        return

    modified_resource_definitions, _ = apply_price_multiplier(resource_definitions, args.multiplier)
    
    save_modified_resource_files(modified_resource_definitions, dry_run=is_dry_run_mode)
    
    # Run the calibration script
    run_calibrate_import_prices_script(apply_changes_to_calibration=args.apply_changes)

    log.info(f"{LogColors.OKGREEN}Bulk Resource Price Adjustment script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
