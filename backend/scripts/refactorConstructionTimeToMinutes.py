#!/usr/bin/env python3
"""
Refactor constructionTime (milliseconds) to constructionMinutes in building JSON files.
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, Any
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
log = logging.getLogger("refactorConstructionTime")

# Data paths
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings"
MILLISECONDS_TO_MINUTES_DIVISOR = 60000.0  # 1000 ms/sec * 60 sec/min

class LogColors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'
    BOLD = '\033[1m'

def process_building_files(base_dir: Path, dry_run: bool) -> int:
    """
    Scans building files, refactors constructionTime to constructionMinutes, and saves if not dry_run.
    Returns the count of modified files.
    """
    modified_files_count = 0
    log.info(f"Scanning building JSON files in {base_dir}...")

    for file_path in base_dir.rglob('*.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            building_id = file_path.stem
            made_change = False

            if "constructionTime" in data:
                original_time_ms = data["constructionTime"]
                if not isinstance(original_time_ms, (int, float)):
                    # log.warning(f"{LogColors.WARNING}Building {building_id} ({file_path.name}): 'constructionTime' is not a number ({original_time_ms}). Skipping.{LogColors.ENDC}")
                    continue

                new_time_minutes = int(round(float(original_time_ms) / MILLISECONDS_TO_MINUTES_DIVISOR))
                
                del data["constructionTime"]
                data["constructionMinutes"] = new_time_minutes
                made_change = True
                
                # log.info(
                #     f"Building: {LogColors.OKBLUE}{building_id}{LogColors.ENDC} ({file_path.name})\n"
                #     f"  Refactored: 'constructionTime' ({original_time_ms} ms) -> 'constructionMinutes' ({new_time_minutes} min)"
                # )

            if made_change:
                if not dry_run:
                    try:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                        # log.info(f"  {LogColors.OKGREEN}Successfully updated file: {file_path}{LogColors.ENDC}")
                        modified_files_count += 1
                    except Exception as e:
                        log.error(f"{LogColors.FAIL}  Failed to update file {file_path}: {e}{LogColors.ENDC}")
                else:
                    # log.info(f"  [DRY RUN] Would update file: {file_path}")
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
    parser = argparse.ArgumentParser(description="Refactor 'constructionTime' (ms) to 'constructionMinutes' in building JSON files.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to files. If not set, changes will be applied."
    )
    args = parser.parse_args()

    log.info(f"Starting 'constructionTime' to 'constructionMinutes' refactor (Dry Run: {args.dry_run})...")
    
    process_building_files(BUILDINGS_DATA_DIR, args.dry_run)

    log.info(f"{LogColors.OKGREEN}Refactor script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
