#!/usr/bin/env python3
"""
Update the 'size' parameter in building JSON files.

This script iterates through building definition files and updates or adds
a 'size' field with an integer value based on a predefined mapping.
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, Any
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
log = logging.getLogger("updateBuildingSizes")

# Data paths
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings"

# Mapping of building type to integer size
BUILDING_SIZES_MAP: Dict[str, int] = {
    "apothecary": 1,
    "armory": 2,
    "arsenal_gate": 4,
    "arsenal_workshop": 4,
    "artisan_s_house": 1,
    "art_academy": 2,
    "bakery": 1,
    "blacksmith": 1,
    "boat_workshop": 1,
    "bottega": 1,
    "bridge": 1,
    "broker_s_office": 1,
    "butcher_shop": 1,
    "canal_house": 1,
    "canal_maintenance_office": 1,
    "cargo_landing": 2,
    "chapel": 1,
    "cistern": 1,
    "city_gate": 2,
    "clocktower": 1,
    "confectionery": 1,
    "courthouse": 3,
    "customs_house": 3,
    "dairy": 1,
    "defensive_bastion": 3,
    "doge_s_palace": 4,
    "dye_works": 1,
    "eastern_merchant_house": 2,
    "fisherman_s_cottage": 1,
    "flood_control_station": 2,
    "fondaco_dei_tedeschi": 4,
    "glassblower_workshop": 1,
    "glass_foundry": 2,
    "glass_import_house": 2,
    "goldsmith_workshop": 1,
    "gondola_station": 1,
    "granary": 2,
    "grand_canal_palace": 3,
    "guard_post": 1,
    "guild_hall": 3,
    "harbor_chain_tower": 2,
    "hidden_workshop": 1,
    "hospital": 3,
    "inn": 1,
    "luxury_bakery": 1,
    "luxury_showroom": 1,
    "market_stall": 1,
    "masons_lodge": 1,
    "master_builders_workshop": 2,
    "merceria": 1,
    "merchant_galley": 1,
    "merchant_s_house": 1,
    "metal_import_warehouse": 2,
    "mint": 2,
    "naval_administration_office": 3,
    "navigation_school": 2,
    "nobili_palazzo": 1,
    "oil_press": 1,
    "paper_mill": 1,
    "parish_church": 3,
    "porter_guild_hall": 1,
    "printing_house": 1,
    "prison": 2,
    "private_dock": 1,
    "public_archives": 2,
    "public_bath": 1,
    "public_dock": 1,
    "public_well": 1,
    "quarantine_station": 3,
    "rialto_bridge": 4,
    "secure_vault": 1,
    "shipyard": 2,
    "silk_conditioning_house": 1,
    "small_warehouse": 1,
    "smuggler_s_den": 1,
    "soap_workshop": 1,
    "spice_merchant_shop": 1,
    "spice_warehouse": 2,
    "spy_safehouse": 1,
    "st__mark_s_basilica": 4,
    "textile_import_house": 2,
    "theater": 3,
    "timber_yard": 2,
    "town_hall": 2,
    "vegetable_market": 1,
    "watchtower": 1,
    "weapons_smith": 1,
    "weighing_station": 1,
    "wine_cellar": 1
}

class LogColors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'
    BOLD = '\033[1m'

def process_building_files(base_dir: Path, building_sizes_map: Dict[str, int], dry_run: bool) -> int:
    """
    Scans building files, updates the 'size' field, and saves if not dry_run.
    Returns the count of modified files.
    """
    modified_files_count = 0
    all_files = list(base_dir.rglob('*.json'))
    total_files_to_scan = len(all_files)
    log.info(f"Scanning {total_files_to_scan} building JSON files in {base_dir} for size updates...")

    for i, file_path in enumerate(all_files):
        # log.info(f"  Processing file {i+1}/{total_files_to_scan}: {file_path.name}")
        try:
            building_type = file_path.stem
            
            new_size_value = building_sizes_map.get(building_type)

            if new_size_value is None:
                log.warning(f"{LogColors.WARNING}Building type '{building_type}' ({file_path.name}) not found in BUILDING_SIZES_MAP. Skipping.{LogColors.ENDC}")
                continue

            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            made_change = False
            current_size_value = data.get("size")

            if current_size_value != new_size_value:
                log_message_intro = f"Building: {LogColors.OKBLUE}{building_type}{LogColors.ENDC} ({file_path.name})"
                if "size" in data:
                    log.info(
                        f"{log_message_intro}\n"
                        f"  Updating 'size': from '{current_size_value}' -> {new_size_value}"
                    )
                else:
                    log.info(
                        f"{log_message_intro}\n"
                        f"  Adding 'size': {new_size_value}"
                    )
                data["size"] = new_size_value
                made_change = True
            else:
                log.debug(f"Building: {building_type} ({file_path.name}) - 'size' is already {new_size_value}. No change needed.")


            if made_change:
                if not dry_run:
                    try:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                        log.info(f"  {LogColors.OKGREEN}Successfully updated file: {file_path}{LogColors.ENDC}")
                        modified_files_count += 1
                    except Exception as e:
                        log.error(f"{LogColors.FAIL}  Failed to update file {file_path}: {e}{LogColors.ENDC}")
                else:
                    log.info(f"  [DRY RUN] Would update file: {file_path}")
                    modified_files_count += 1 # Count files that would be touched
            
        except json.JSONDecodeError:
            log.error(f"{LogColors.FAIL}Error decoding JSON from file: {file_path}{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error processing file {file_path}: {e}{LogColors.ENDC}")
            
    if dry_run:
        log.info(f"\nTotal files that would be modified: {modified_files_count}")
    else:
        log.info(f"\nTotal files modified: {modified_files_count}")
    return modified_files_count

# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Update 'size' parameter in building JSON files.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to files. If not set, changes will be applied."
    )
    args = parser.parse_args()

    log.info(f"Starting building 'size' update (Dry Run: {args.dry_run})...")
    
    if not BUILDINGS_DATA_DIR.exists() or not BUILDINGS_DATA_DIR.is_dir():
        log.error(f"{LogColors.FAIL}Buildings data directory not found: {BUILDINGS_DATA_DIR}{LogColors.ENDC}")
        return

    process_building_files(BUILDINGS_DATA_DIR, BUILDING_SIZES_MAP, args.dry_run)

    log.info(f"{LogColors.OKGREEN}Building 'size' update script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
