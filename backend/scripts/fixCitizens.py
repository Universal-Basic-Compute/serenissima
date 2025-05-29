#!/usr/bin/env python3
"""
Script to verify and fix citizen assignments and data integrity.

Checks:
1. Citizens are in at most one home.
2. Citizens have at most one job.
3. Forestieri do not have jobs or homes in Venice.
4. Citizens (InVenice=True, non-Forestieri) have a valid position.
"""

import os
import sys
import json
import logging
import argparse
import random
import requests
from typing import Dict, List, Optional, Any, Set, Tuple
from datetime import datetime

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from pyairtable import Api, Table
from dotenv import load_dotenv

# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("fixCitizens")

load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
AIRTABLE_API_KEY = os.environ.get('AIRTABLE_API_KEY')
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID')
CITIZENS_TABLE_NAME = 'CITIZENS'
BUILDINGS_TABLE_NAME = 'BUILDINGS'

class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# --- Helper Functions ---

def _escape_airtable_value(value: Any) -> str:
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def initialize_airtable_tables() -> Optional[Dict[str, Table]]:
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error(f"{LogColors.FAIL}Airtable API Key or Base ID not configured.{LogColors.ENDC}")
        return None
    try:
        api = Api(AIRTABLE_API_KEY) # Keep if using api.table() style
        tables = {
            'citizens': Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, CITIZENS_TABLE_NAME),
            'buildings': Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, BUILDINGS_TABLE_NAME),
        }
        
        # Test connection with one primary table (e.g., citizens)
        log.info(f"{LogColors.OKBLUE}Testing Airtable connection by fetching one record from {CITIZENS_TABLE_NAME} table...{LogColors.ENDC}")
        try:
            tables['citizens'].all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection successful.{LogColors.ENDC}")
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed for {CITIZENS_TABLE_NAME} table: {conn_e}{LogColors.ENDC}")
            raise conn_e
        
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable or connection test failed: {e}{LogColors.ENDC}")
        return None

def get_all_records(table: Table, table_name_for_log: str) -> List[Dict]:
    log.info(f"Fetching all records from {table_name_for_log}...")
    try:
        records = table.all()
        log.info(f"Fetched {len(records)} records from {table_name_for_log}.")
        return records
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching records from {table_name_for_log}: {e}{LogColors.ENDC}")
        return []

def get_polygons_data() -> List[Dict]:
    log.info("Fetching polygons data from API...")
    try:
        url = f"{API_BASE_URL}/api/get-polygons"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "polygons" in data:
            log.info(f"Fetched {len(data['polygons'])} polygons.")
            return data['polygons']
        log.error(f"{LogColors.FAIL}Failed to parse polygons data from API response.{LogColors.ENDC}")
        return []
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching polygons data: {e}{LogColors.ENDC}")
        return []

def assign_random_position(tables: Dict[str, Table], citizen_record: Dict, polygons_data: List[Dict], dry_run: bool) -> bool:
    citizen_username = citizen_record['fields'].get('Username', citizen_record['id'])
    log.info(f"{LogColors.OKBLUE}Attempting to assign random position to citizen {citizen_username}.{LogColors.ENDC}")

    all_building_points = []
    for polygon in polygons_data:
        if "buildingPoints" in polygon and isinstance(polygon["buildingPoints"], list):
            all_building_points.extend(polygon["buildingPoints"])
    
    if not all_building_points:
        log.warning(f"{LogColors.WARNING}No buildingPoints found in polygons data. Cannot assign random position.{LogColors.ENDC}")
        return False

    random_point = random.choice(all_building_points)
    
    if "lat" in random_point and "lng" in random_point:
        new_position_coords = {
            "lat": float(random_point["lat"]),
            "lng": float(random_point["lng"])
        }
        new_position_str = json.dumps(new_position_coords)

        if dry_run:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Would update citizen {citizen_username} (Airtable ID: {citizen_record['id']}) with new random position: {new_position_str}{LogColors.ENDC}")
            return True
        try:
            tables['citizens'].update(citizen_record['id'], {'Position': new_position_str})
            log.info(f"{LogColors.OKGREEN}Successfully updated citizen {citizen_username} (Airtable ID: {citizen_record['id']}) with new random position: {new_position_str}{LogColors.ENDC}")
            return True
        except Exception as e_update:
            log.error(f"{LogColors.FAIL}Failed to update citizen {citizen_username} position in Airtable: {e_update}{LogColors.ENDC}")
            return False
    else:
        log.warning(f"{LogColors.WARNING}Selected random building point is missing lat/lng: {random_point}{LogColors.ENDC}")
        return False

# --- Fix Functions ---

def fix_multiple_occupancies(
    tables: Dict[str, Table],
    all_citizens: List[Dict],
    all_buildings: List[Dict],
    occupancy_type: str, # 'home' or 'business'
    sort_field: str, # 'RentPrice' for home, 'Wages' for business
    sort_reverse: bool, # False for RentPrice (lowest), True for Wages (highest)
    dry_run: bool
) -> int:
    log.info(f"\n{LogColors.HEADER}--- Fixing Multiple {occupancy_type.capitalize()} Occupancies ---{LogColors.ENDC}")
    fixed_count = 0
    
    citizen_occupancies: Dict[str, List[Dict]] = {} # Username -> List of building records

    for building in all_buildings:
        occupant_username = building['fields'].get('Occupant')
        category = building['fields'].get('Category')
        if occupant_username and category == occupancy_type:
            if occupant_username not in citizen_occupancies:
                citizen_occupancies[occupant_username] = []
            citizen_occupancies[occupant_username].append(building)

    for username, buildings_occupied in citizen_occupancies.items():
        if len(buildings_occupied) > 1:
            log.warning(f"{LogColors.WARNING}Citizen {username} occupies {len(buildings_occupied)} {occupancy_type}s. Attempting to fix.{LogColors.ENDC}")
            
            # Sort buildings: primary key is sort_field, secondary is CreatedAt (oldest first)
            buildings_occupied.sort(
                key=lambda b: (
                    float(b['fields'].get(sort_field, 0 if sort_reverse else float('inf')) or (0 if sort_reverse else float('inf'))),
                    b['fields'].get('CreatedAt', '') # Older CreatedAt is preferred
                ),
                reverse=sort_reverse
            )
            
            building_to_keep = buildings_occupied[0] # Keep the first one after sorting
            log.info(f"  Keeping citizen {username} in {occupancy_type} {building_to_keep['fields'].get('BuildingId', building_to_keep['id'])} ({sort_field}: {building_to_keep['fields'].get(sort_field, 'N/A')}).")

            for i in range(1, len(buildings_occupied)):
                building_to_vacate = buildings_occupied[i]
                building_id_vacate = building_to_vacate['fields'].get('BuildingId', building_to_vacate['id'])
                log.info(f"  Removing citizen {username} from {occupancy_type} {building_id_vacate}.")
                if not dry_run:
                    try:
                        tables['buildings'].update(building_to_vacate['id'], {'Occupant': None})
                        fixed_count += 1
                    except Exception as e:
                        log.error(f"{LogColors.FAIL}  Failed to update building {building_id_vacate}: {e}{LogColors.ENDC}")
                else:
                    fixed_count += 1 # Count as fixed in dry run
    
    log.info(f"Multiple {occupancy_type} occupancies fixing complete. Corrected {fixed_count} assignments.")
    return fixed_count

def fix_forestieri_assignments(
    tables: Dict[str, Table],
    all_citizens: List[Dict],
    all_buildings: List[Dict],
    dry_run: bool
) -> int:
    log.info(f"\n{LogColors.HEADER}--- Fixing Forestieri Assignments ---{LogColors.ENDC}")
    fixed_count = 0
    forestieri_usernames: Set[str] = set()

    for citizen in all_citizens:
        if citizen['fields'].get('SocialClass') == 'Forestieri':
            forestieri_usernames.add(citizen['fields'].get('Username', ''))
    
    if not forestieri_usernames:
        log.info("No Forestieri found.")
        return 0

    for building in all_buildings:
        occupant_username = building['fields'].get('Occupant')
        category = building['fields'].get('Category') # 'home' or 'business'
        if occupant_username and occupant_username in forestieri_usernames:
            building_id = building['fields'].get('BuildingId', building['id'])
            log.warning(f"{LogColors.WARNING}Forestiero {occupant_username} is Occupant of {category} building {building_id}. Removing.{LogColors.ENDC}")
            if not dry_run:
                try:
                    tables['buildings'].update(building['id'], {'Occupant': None})
                    fixed_count += 1
                except Exception as e:
                    log.error(f"{LogColors.FAIL}  Failed to update building {building_id}: {e}{LogColors.ENDC}")
            else:
                fixed_count += 1
    
    log.info(f"Forestieri assignment fixing complete. Corrected {fixed_count} assignments.")
    return fixed_count

def fix_missing_positions(
    tables: Dict[str, Table],
    all_citizens: List[Dict],
    polygons_data: List[Dict],
    dry_run: bool
) -> int:
    log.info(f"\n{LogColors.HEADER}--- Fixing Missing Citizen Positions ---{LogColors.ENDC}")
    fixed_count = 0
    
    if not polygons_data:
        log.error(f"{LogColors.FAIL}No polygons data available. Cannot assign random positions.{LogColors.ENDC}")
        return 0

    for citizen in all_citizens:
        citizen_username = citizen['fields'].get('Username', citizen['id'])
        in_venice = citizen['fields'].get('InVenice', False)
        social_class = citizen['fields'].get('SocialClass')
        
        # Skip if not InVenice or is Forestieri (Forestieri positions are managed differently)
        if not in_venice or social_class == 'Forestieri':
            continue

        position_str = citizen['fields'].get('Position')
        is_valid_position = False
        if position_str and isinstance(position_str, str):
            try:
                pos_data = json.loads(position_str)
                if isinstance(pos_data, dict) and 'lat' in pos_data and 'lng' in pos_data:
                    is_valid_position = True
            except json.JSONDecodeError:
                pass # Invalid JSON string

        if not is_valid_position:
            log.warning(f"{LogColors.WARNING}Citizen {citizen_username} (InVenice, non-Forestieri) has missing or invalid Position ('{position_str}'). Assigning random position.{LogColors.ENDC}")
            if assign_random_position(tables, citizen, polygons_data, dry_run):
                fixed_count += 1
    
    log.info(f"Missing position fixing complete. Assigned positions to {fixed_count} citizens.")
    return fixed_count

# --- Main Execution ---
def main(dry_run: bool):
    log.info(f"{LogColors.HEADER}Starting Citizen Data Fix script (dry_run: {dry_run})...{LogColors.ENDC}")

    tables = initialize_airtable_tables()
    if not tables:
        return

    all_citizens = get_all_records(tables['citizens'], CITIZENS_TABLE_NAME)
    all_buildings = get_all_records(tables['buildings'], BUILDINGS_TABLE_NAME)

    if not all_citizens:
        log.info("No citizens found to process.")
        return
    
    # Run fixes
    fix_multiple_occupancies(tables, all_citizens, all_buildings, 'home', 'RentPrice', False, dry_run)
    fix_multiple_occupancies(tables, all_citizens, all_buildings, 'business', 'Wages', True, dry_run)
    fix_forestieri_assignments(tables, all_citizens, all_buildings, dry_run)
    
    # For position fixing, we need polygon data
    polygons_data = get_polygons_data()
    fix_missing_positions(tables, all_citizens, polygons_data, dry_run)

    log.info(f"{LogColors.OKGREEN}Citizen Data Fix script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify and fix citizen assignments and data.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable."
    )
    # The --force flag is implicitly handled by not passing --dry-run
    args = parser.parse_args()

    main(args.dry_run)
