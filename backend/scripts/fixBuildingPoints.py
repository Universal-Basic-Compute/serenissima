# backend/scripts/fixBuildingPoints.py

import os
import sys
import logging
import argparse
import json
import datetime
import time
import requests
from math import radians, sin, cos, sqrt, atan2
from typing import Dict, List, Optional, Any, Set, Tuple
from pathlib import Path # Added import

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from pyairtable import Api, Table
from dotenv import load_dotenv

# --- Configuration ---
# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("fixBuildingPoints")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
AIRTABLE_API_KEY = os.environ.get('AIRTABLE_API_KEY')
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID')
BUILDINGS_TABLE_NAME = 'BUILDINGS'
CITIZENS_TABLE_NAME = 'CITIZENS' # Added for CITIZENS table
BUILDINGS_DATA_DIR = Path(PROJECT_ROOT) / "data" / "buildings" # Added for local definitions

# --- Helper Classes & Functions ---

class LogColors: # Minimal LogColors for script output
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'

def _escape_airtable_value(value: Any) -> str:
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def initialize_airtable() -> Optional[Dict[str, Table]]:
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error(f"{LogColors.FAIL}Airtable API Key or Base ID not configured.{LogColors.ENDC}")
        return None
    try:
        api = Api(AIRTABLE_API_KEY)
        tables_to_return: Dict[str, Table] = {}

        # Initialize BUILDINGS table
        log.info(f"{LogColors.OKBLUE}Initializing Airtable table: {BUILDINGS_TABLE_NAME}...{LogColors.ENDC}")
        buildings_table = api.table(AIRTABLE_BASE_ID, BUILDINGS_TABLE_NAME)
        try:
            buildings_table.all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection successful for {BUILDINGS_TABLE_NAME}.{LogColors.ENDC}")
            tables_to_return['BUILDINGS'] = buildings_table
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed for {BUILDINGS_TABLE_NAME} table: {conn_e}{LogColors.ENDC}")
            raise conn_e 

        # Initialize CITIZENS table
        log.info(f"{LogColors.OKBLUE}Initializing Airtable table: {CITIZENS_TABLE_NAME}...{LogColors.ENDC}")
        citizens_table = api.table(AIRTABLE_BASE_ID, CITIZENS_TABLE_NAME)
        try:
            citizens_table.all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection successful for {CITIZENS_TABLE_NAME}.{LogColors.ENDC}")
            tables_to_return['CITIZENS'] = citizens_table
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed for {CITIZENS_TABLE_NAME} table: {conn_e}{LogColors.ENDC}")
            raise conn_e

        return tables_to_return
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable tables or connection test failed: {e}{LogColors.ENDC}")
        return None

def get_all_buildings(buildings_table: Table) -> List[Dict]:
    log.info("Fetching all buildings from Airtable...")
    try:
        buildings = buildings_table.all()
        log.info(f"Fetched {len(buildings)} buildings.")
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching buildings: {e}{LogColors.ENDC}")
        return []

def get_building_type_definitions() -> Dict[str, Dict]:
    log.info("Fetching building type definitions from API...")
    try:
        url = f"{API_BASE_URL}/api/building-types"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "buildingTypes" in data:
            defs = {bt['type']: bt for bt in data['buildingTypes']}
            log.info(f"Fetched {len(defs)} building type definitions.")
            return defs
        log.error(f"{LogColors.FAIL}Failed to parse building type definitions from API response.{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching building type definitions: {e}{LogColors.ENDC}")
        return {}

def load_local_building_definitions(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all building JSON files from data/buildings."""
    defs = {}
    log.info(f"Loading local building definitions from {base_dir}...")
    if not base_dir.is_dir():
        log.error(f"{LogColors.FAIL}Local building definitions directory not found: {base_dir}{LogColors.ENDC}")
        return {}
        
    for file_path in base_dir.rglob('*.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            building_type_id = file_path.stem # building_type_id is filename without .json
            defs[building_type_id] = data # Store the whole data
        except Exception as e:
            log.error(f"Error loading local building definition {file_path}: {e}")
    log.info(f"Loaded {len(defs)} local building definitions.")
    return defs

def get_polygons_data() -> List[Dict]:
    log.info("Fetching polygons data from API...")
    try:
        url = f"{API_BASE_URL}/api/get-polygons"
        response = requests.get(url)
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

def extract_point_details(point_str: Optional[str]) -> Optional[Tuple[str, float, float, Optional[str]]]:
    if not point_str or not isinstance(point_str, str):
        return None
    parts = point_str.split('_')
    if len(parts) < 3: # Must have at least type_lat_lng
        log.warning(f"{LogColors.WARNING}Point string '{point_str}' has too few parts to parse.{LogColors.ENDC}")
        return None
    try:
        point_type = parts[0]
        lat = float(parts[1])
        lng = float(parts[2])
        index_str = parts[3] if len(parts) > 3 else None
        return point_type, lat, lng, index_str
    except ValueError:
        log.warning(f"{LogColors.WARNING}Could not parse lat/lng from point string: {point_str}{LogColors.ENDC}")
        return None

def is_point_type_correct_for_building(building_type_str: str, point_type_str: str, building_type_defs: Dict[str, Dict]) -> bool:
    if building_type_str not in building_type_defs:
        log.warning(f"{LogColors.WARNING}Building type '{building_type_str}' not found in definitions.{LogColors.ENDC}")
        return False # Cannot verify

    definition = building_type_defs[building_type_str]
    correct_point_type = definition.get('pointType')
    if not correct_point_type or not isinstance(correct_point_type, str):
        log.warning(f"{LogColors.WARNING}pointType for '{building_type_str}' is missing, empty, or not a string: {correct_point_type}{LogColors.ENDC}")
        return False
    return point_type_str == correct_point_type

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371  # Radius of Earth in kilometers
    rad_lat1 = radians(lat1)
    rad_lon1 = radians(lon1)
    rad_lat2 = radians(lat2)
    rad_lon2 = radians(lon2)
    dlon = rad_lon2 - rad_lon1
    dlat = rad_lat2 - rad_lat1
    a = sin(dlat / 2)**2 + cos(rad_lat1) * cos(rad_lat2) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    distance = R * c * 1000 # in meters
    return distance

def _resolve_point_id_to_coords_local(point_id_str: str) -> Optional[Dict[str, float]]:
    """
    Resolves a single point ID string to latitude and longitude.
    Uses extract_point_details internally.
    """
    details = extract_point_details(point_id_str)
    if details:
        _, lat, lng, _ = details
        return {"lat": lat, "lng": lng}
    log.warning(f"{LogColors.WARNING}Could not resolve point ID '{point_id_str}' to coordinates using extract_point_details.{LogColors.ENDC}")
    return None

def find_closest_unoccupied_point(
    current_building_type: str,
    current_building_pos: Tuple[float, float],
    all_polygons_data: List[Dict],
    occupied_points_set: Set[str],
    building_type_defs: Dict[str, Dict]
) -> Optional[Tuple[str, Dict[str, float]]]:
    
    target_point_type_str = building_type_defs.get(current_building_type, {}).get('pointType')
    if not target_point_type_str or not isinstance(target_point_type_str, str):
        log.warning(f"{LogColors.WARNING}No valid pointType defined for building type '{current_building_type}'. Cannot find new point. Value: {target_point_type_str}{LogColors.ENDC}")
        return None

    min_distance = float('inf')
    best_point_str = None
    best_point_coords = None

    # Determine the correct list of points to search based on the target_point_type_str
    points_list_key_map = {
        "building": "buildingPoints", # Assuming "building" is the type string for general building points
        "land": "buildingPoints",     # Or "land" if that's used
        "canal": "canalPoints",
        "bridge": "bridgePoints"
    }
    points_list_key = points_list_key_map.get(target_point_type_str)

    if not points_list_key:
        log.warning(f"{LogColors.WARNING}Unknown target_point_type_str '{target_point_type_str}' for building type '{current_building_type}'. Cannot determine which points list to search.{LogColors.ENDC}")
        return None

    log.info(f"Searching for unoccupied points in '{points_list_key}' for building type '{current_building_type}' requiring point type '{target_point_type_str}'.")

    for polygon in all_polygons_data:
        points_to_check = polygon.get(points_list_key, [])
        for point_data in points_to_check:
            point_id_str = point_data.get('id')
            
            if not point_id_str:
                continue

            if point_id_str not in occupied_points_set:
                current_point_lat_lng = None
                try:
                    if points_list_key == "buildingPoints":
                        if 'lat' in point_data and 'lng' in point_data:
                            current_point_lat_lng = (float(point_data['lat']), float(point_data['lng']))
                    elif points_list_key in ["canalPoints", "bridgePoints"]:
                        if 'edge' in point_data and 'lat' in point_data['edge'] and 'lng' in point_data['edge']:
                            current_point_lat_lng = (float(point_data['edge']['lat']), float(point_data['edge']['lng']))
                    
                    if current_point_lat_lng:
                        bp_lat, bp_lng = current_point_lat_lng
                        distance = calculate_distance(current_building_pos[0], current_building_pos[1], bp_lat, bp_lng)
                        if distance < min_distance:
                            min_distance = distance
                            best_point_str = point_id_str
                            best_point_coords = {"lat": bp_lat, "lng": bp_lng}
                    else:
                        log.debug(f"Point {point_id_str} from {points_list_key} in polygon {polygon.get('id')} missing coordinate data: {point_data}")

                except (ValueError, TypeError, KeyError) as e:
                    log.warning(f"{LogColors.WARNING}Error processing point {point_id_str} from {points_list_key}: {e}{LogColors.ENDC}")
                    continue
            # else: point is occupied

    if best_point_str and best_point_coords:
        log.info(f"Found closest unoccupied point '{best_point_str}' (type derived from list: '{target_point_type_str}') for building type '{current_building_type}' at distance {min_distance:.2f}m.")
        return best_point_str, best_point_coords

    log.warning(f"{LogColors.WARNING}No suitable unoccupied point found for building type '{current_building_type}' with required point type '{target_point_type_str}'.{LogColors.ENDC}")
    return None

def find_N_closest_unoccupied_points(
    primary_coords: Tuple[float, float],
    num_needed: int,
    target_point_type: str, # e.g. 'building', 'canal'
    land_id: str,
    all_polygons_data: List[Dict], # This is from /api/get-polygons
    points_to_exclude: Set[str], # Points to exclude from search (globally occupied + already in this building)
    building_name_for_log: str
) -> List[str]:
    """Finds N closest, unoccupied points of a specific type on a given land, excluding specified points."""
    # log.info(f"      Attempting to find {num_needed} points of type '{target_point_type}' on land '{land_id}' for '{building_name_for_log}', excluding {len(points_to_exclude)} points.")
    
    candidate_points_with_dist: List[Tuple[float, str]] = [] # (distance, point_id_str)

    target_polygon = next((poly for poly in all_polygons_data if poly.get("id") == land_id), None)
    if not target_polygon:
        log.warning(f"{LogColors.WARNING}Polygon data for land '{land_id}' not found. Cannot find additional points for {building_name_for_log}.{LogColors.ENDC}")
        return []

    points_list_key_map = {
        "building": "buildingPoints", "land": "buildingPoints", # "land" is often used as pointType for buildingPoints
        "canal": "canalPoints", "bridge": "bridgePoints"
    }
    points_list_key = points_list_key_map.get(target_point_type)
    if not points_list_key:
        log.warning(f"{LogColors.WARNING}Unknown target_point_type '{target_point_type}' for {building_name_for_log}. Cannot determine points list.{LogColors.ENDC}")
        return []

    points_to_search = target_polygon.get(points_list_key, [])
    # log.info(f"      Searching in list '{points_list_key}' of land '{land_id}', which has {len(points_to_search)} points.")
    if not isinstance(points_to_search, list):
        log.warning(f"{LogColors.WARNING}Points list '{points_list_key}' for land '{land_id}' is not a list. Cannot find additional points for {building_name_for_log}.{LogColors.ENDC}")
        return []

    found_potential_points_count = 0
    for point_data in points_to_search:
        point_id_str = point_data.get('id')
        if not point_id_str:
            log.debug(f"        Skipping point data with no 'id': {point_data}")
            continue
        
        if point_id_str in points_to_exclude:
            log.debug(f"        Point '{point_id_str}' is in points_to_exclude. Skipping.")
            continue

        point_coords_dict = None
        try:
            if points_list_key == "buildingPoints":
                if 'lat' in point_data and 'lng' in point_data:
                    point_coords_dict = {'lat': float(point_data['lat']), 'lng': float(point_data['lng'])}
            elif points_list_key in ["canalPoints", "bridgePoints"]:
                if 'edge' in point_data and isinstance(point_data['edge'], dict) and \
                   'lat' in point_data['edge'] and 'lng' in point_data['edge']:
                    point_coords_dict = {'lat': float(point_data['edge']['lat']), 'lng': float(point_data['edge']['lng'])}
        except (ValueError, TypeError):
            log.warning(f"{LogColors.WARNING}Could not parse coordinates for point {point_id_str} on land {land_id}. Skipping.{LogColors.ENDC}")
            continue
        
        if point_coords_dict:
            dist = calculate_distance(primary_coords[0], primary_coords[1], point_coords_dict['lat'], point_coords_dict['lng'])
            candidate_points_with_dist.append((dist, point_id_str))
            found_potential_points_count +=1
            log.debug(f"        Found potential candidate point '{point_id_str}' at distance {dist:.2f}.")
        else:
            log.debug(f"Could not get coordinates for point {point_id_str} on land {land_id} for {building_name_for_log}.")
    
    # log.info(f"      Found {found_potential_points_count} potential, non-excluded points of type '{target_point_type}' on land '{land_id}'.")
    candidate_points_with_dist.sort(key=lambda x: x[0])

    selected_ids: List[str] = []
    for dist_val, point_id in candidate_points_with_dist:
        if len(selected_ids) < num_needed:
            selected_ids.append(point_id)
            # log.info(f"      Selected additional point '{point_id}' (distance: {dist_val:.2f}).")
        else:
            break
    
    if len(selected_ids) < num_needed:
        log.warning(f"      Could only select {len(selected_ids)} of {num_needed} required additional points for {building_name_for_log}.")
            
    return selected_ids

def update_building_in_airtable(
    buildings_table: Table,
    building_airtable_id: str,
    updates: Dict[str, Any],
    dry_run: bool
) -> bool:
    log.info(f"Preparing to update building {building_airtable_id} with: {updates}")
    if dry_run:
        log.info(f"{LogColors.OKBLUE}[DRY RUN] Would update building {building_airtable_id}.{LogColors.ENDC}")
        return True
    try:
        buildings_table.update(building_airtable_id, updates)
        log.info(f"{LogColors.OKGREEN}Successfully updated building {building_airtable_id}.{LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to update building {building_airtable_id}: {e}{LogColors.ENDC}")
        return False

# --- Main Processing Functions ---

def fix_type_mismatches(
    buildings_table: Table,
    all_buildings: List[Dict],
    building_type_defs: Dict[str, Dict],
    all_polygons_data: List[Dict],
    occupied_points_set: Set[str],
    dry_run: bool
) -> int:
    log.info("\n--- Fixing Type Mismatches ---")
    fixed_count = 0
    total_buildings_for_type_fix = len(all_buildings)
    log.info(f"Checking {total_buildings_for_type_fix} buildings for point type mismatches.")
    for i, building in enumerate(all_buildings): # Iterate over the mutable list
        building_airtable_id = building['id']
        building_fields = building['fields']
        # log.info(f"  Checking type mismatch for building {i+1}/{total_buildings_for_type_fix}: {building_airtable_id} ({building_fields.get('Name', 'N/A')})")
        current_point_str = building_fields.get('Point')
        building_type_str = building_fields.get('Type')
        building_name = building_fields.get('Name', building_airtable_id)

        if not current_point_str or not building_type_str:
            log.warning(f"{LogColors.WARNING}Building {building_name} missing Point or Type. Skipping type check.{LogColors.ENDC}")
            continue

        point_details = extract_point_details(current_point_str)
        if not point_details:
            log.warning(f"{LogColors.WARNING}Building {building_name} has invalid Point string '{current_point_str}'. Skipping type check.{LogColors.ENDC}")
            continue

        point_type_from_point_field, p_lat, p_lng, _ = point_details

        if not is_point_type_correct_for_building(building_type_str, point_type_from_point_field, building_type_defs):
            log.warning(f"{LogColors.WARNING}Building {building_name} (Type: {building_type_str}) is on incorrect Point type '{point_type_from_point_field}' (Point: {current_point_str}). Attempting to move.{LogColors.ENDC}")

            current_pos_tuple = (p_lat, p_lng)
            new_point_info = find_closest_unoccupied_point(
                building_type_str, current_pos_tuple, all_polygons_data, occupied_points_set, building_type_defs
            )

            if new_point_info:
                new_point_id_str, new_point_coords_dict = new_point_info
                updates = {
                    "Point": new_point_id_str,
                    "Position": json.dumps(new_point_coords_dict)
                }
                if update_building_in_airtable(buildings_table, building_airtable_id, updates, dry_run):
                    if current_point_str in occupied_points_set : # Check before removing
                         occupied_points_set.remove(current_point_str)
                    occupied_points_set.add(new_point_id_str)
                    building['fields']['Point'] = new_point_id_str
                    building['fields']['Position'] = json.dumps(new_point_coords_dict)
                    fixed_count += 1
            else:
                log.error(f"{LogColors.FAIL}Could not find a new location for building {building_name}. It remains on incorrect point type.{LogColors.ENDC}")
        else:
            log.info(f"Building {building_name} (Type: {building_type_str}) on correct Point type '{point_type_from_point_field}'.")

    log.info(f"Type mismatch fixing complete. Moved {fixed_count} buildings.")
    return fixed_count

def fix_duplicate_points(
    buildings_table: Table,
    all_buildings: List[Dict], # This list might have been modified by fix_type_mismatches
    building_type_defs: Dict[str, Dict],
    all_polygons_data: List[Dict],
    occupied_points_set: Set[str],
    dry_run: bool
) -> int:
    log.info("\n--- Fixing Duplicate Points ---")
    fixed_count = 0
    points_map: Dict[str, List[Dict]] = {}
    total_buildings_for_duplicate_check = len(all_buildings)
    log.info(f"Building points map for {total_buildings_for_duplicate_check} buildings to check for duplicates.")

    # Rebuild points_map based on current state of all_buildings
    for i, building_item in enumerate(all_buildings):
        # log.debug(f"  Mapping point for building {i+1}/{total_buildings_for_duplicate_check}: {building_item['id']}")
        point_str = building_item['fields'].get('Point')
        if point_str:
            if point_str not in points_map:
                points_map[point_str] = []
            points_map[point_str].append(building_item)

    for point_str_key, duplicate_buildings_list in points_map.items():
        if len(duplicate_buildings_list) > 1:
            log.warning(f"{LogColors.WARNING}Point '{point_str_key}' is used by {len(duplicate_buildings_list)} buildings. Attempting to move duplicates.{LogColors.ENDC}")

            # Sort by CreatedAt. If 'CreatedAt' is missing, use Airtable record ID as a proxy (newer IDs are typically later).
            # Airtable's default createdTime is not directly in fields.
            def sort_key(b_item):
                created_at_val = b_item['fields'].get('CreatedAt')
                if created_at_val:
                    try:
                        # Attempt to parse if it's a full ISO string, otherwise treat as sortable string
                        return datetime.datetime.fromisoformat(created_at_val.replace('Z', '+00:00'))
                    except ValueError:
                        return created_at_val # Fallback to string sort if not ISO
                return b_item['id'] # Fallback to Airtable ID

            duplicate_buildings_list.sort(key=sort_key, reverse=True)

            # Keep the oldest one (last in sorted list after reverse=True), move the rest (earlier in list)
            for i in range(len(duplicate_buildings_list) - 1):
                building_to_move = duplicate_buildings_list[i]
                building_airtable_id = building_to_move['id']
                building_fields = building_to_move['fields']
                building_type_str = building_fields.get('Type')
                building_name = building_fields.get('Name', building_airtable_id)

                log.info(f"Moving building {building_name} (ID: {building_airtable_id}, a duplicate at {point_str_key}).")

                current_point_details = extract_point_details(point_str_key) # Use point_str_key from the map
                if not current_point_details or not building_type_str:
                    log.error(f"{LogColors.FAIL}Cannot move building {building_name}: missing type or invalid current point. Skipping.{LogColors.ENDC}")
                    continue

                _, p_lat, p_lng, _ = current_point_details
                current_pos_tuple = (p_lat, p_lng)

                new_point_info = find_closest_unoccupied_point(
                    building_type_str, current_pos_tuple, all_polygons_data, occupied_points_set, building_type_defs
                )

                if new_point_info:
                    new_point_id_str, new_point_coords_dict = new_point_info
                    updates = {
                        "Point": new_point_id_str,
                        "Position": json.dumps(new_point_coords_dict)
                    }
                    if update_building_in_airtable(buildings_table, building_airtable_id, updates, dry_run):
                        # The original point_str_key is still occupied by the "oldest" building.
                        # Only add the new point to occupied_points_set.
                        occupied_points_set.add(new_point_id_str)
                        building_to_move['fields']['Point'] = new_point_id_str
                        building_to_move['fields']['Position'] = json.dumps(new_point_coords_dict)
                        fixed_count += 1
                else:
                    log.error(f"{LogColors.FAIL}Could not find a new location for duplicate building {building_name}. It remains on a shared point.{LogColors.ENDC}")

    log.info(f"Duplicate point fixing complete. Moved {fixed_count} buildings.")
    return fixed_count

def set_building_id_from_point(
    buildings_table: Table,
    all_buildings: List[Dict], # This list reflects all prior modifications
    dry_run: bool
) -> int:
    log.info("\n--- Setting BuildingId from Point ---")
    updated_count = 0
    total_buildings_for_id_set = len(all_buildings)
    log.info(f"Processing {total_buildings_for_id_set} buildings to set BuildingId from Point.")
    for i, building in enumerate(all_buildings):
        building_airtable_id = building['id']
        building_fields = building['fields']
        # log.info(f"  Setting BuildingId for building {i+1}/{total_buildings_for_id_set}: {building_airtable_id} ({building_fields.get('Name', 'N/A')})")
        current_point_str = building_fields.get('Point')
        current_building_id_str = building_fields.get('BuildingId')
        building_name = building_fields.get('Name', building_airtable_id)

        if not current_point_str:
            log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}) has no Point value. Cannot set BuildingId.{LogColors.ENDC}")
            continue

        expected_building_id_str = current_point_str # Default to the raw string

        # Try to parse Point as a JSON array
        try:
            point_data = json.loads(current_point_str)
            if isinstance(point_data, list) and point_data:
                # If it's a list and not empty, use the first element
                first_point_id = point_data[0]
                if isinstance(first_point_id, str):
                    expected_building_id_str = first_point_id
                    log.info(f"Building {building_name} (ID: {building_airtable_id}): Point is an array. Using first element '{expected_building_id_str}' for BuildingId.")
                else:
                    log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): First element of Point array '{current_point_str}' is not a string. Using raw Point string for BuildingId.{LogColors.ENDC}")
            # If json.loads results in a non-list (e.g. a string that was valid JSON like "\"string_id\""),
            # or an empty list, expected_building_id_str remains current_point_str.
        except json.JSONDecodeError:
            # Not a JSON string, so current_point_str is treated as a single ID.
            # expected_building_id_str is already current_point_str.
            pass
        except TypeError:
             log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): Point field '{current_point_str}' is not a string. Cannot process for BuildingId.{LogColors.ENDC}")
             continue


        if current_building_id_str != expected_building_id_str:
            log.info(f"Building {building_name} (ID: {building_airtable_id}): Setting BuildingId to '{expected_building_id_str}' (was '{current_building_id_str}'). Original Point field: '{current_point_str}'.")
            if update_building_in_airtable(buildings_table, building_airtable_id, {"BuildingId": expected_building_id_str}, dry_run):
                building['fields']['BuildingId'] = expected_building_id_str # Update in-memory record
                updated_count += 1
        else:
            log.info(f"Building {building_name} (ID: {building_airtable_id}): BuildingId ('{current_building_id_str}') already matches expected BuildingId ('{expected_building_id_str}') derived from Point ('{current_point_str}'). No update needed.")

    log.info(f"Setting BuildingId from Point complete. Updated {updated_count} buildings.")
    return updated_count

def fix_point_count_mismatches(
    buildings_table: Table,
    all_buildings: List[Dict],
    building_type_defs: Dict[str, Dict],
    all_polygons_data: List[Dict],
    occupied_points_set: Set[str], # Mutable set, represents globally occupied points
    dry_run: bool
) -> int:
    log.info("\n--- Fixing Point Count Mismatches ---")
    fixed_count = 0
    updates_to_batch: List[Dict[str, Any]] = []
    total_buildings_for_count_fix = len(all_buildings)
    log.info(f"Checking {total_buildings_for_count_fix} buildings for point count mismatches.")

    for i, building_record in enumerate(all_buildings):
        building_airtable_id = building_record['id']
        building_fields = building_record['fields']
        # log.info(f"  Checking point count for building {i+1}/{total_buildings_for_count_fix}: {building_airtable_id} ({building_fields.get('Name', 'N/A')})")
        building_name = building_fields.get('Name', building_airtable_id)
        building_type_str = building_fields.get('Type')
        current_point_field_val = building_fields.get('Point')

        if not building_type_str or not current_point_field_val:
            log.debug(f"Building {building_name} missing Type or Point. Skipping point count check.")
            continue

        building_def = building_type_defs.get(building_type_str)
        if not building_def:
            log.warning(f"{LogColors.WARNING}Building type '{building_type_str}' for {building_name} not found in definitions. Skipping point count check.{LogColors.ENDC}")
            continue

        expected_size = int(building_def.get('size', 1))
        required_point_type = building_def.get('pointType', 'building')
        
        current_points_list: List[str] = []
        is_currently_array = False
        if isinstance(current_point_field_val, str):
            if current_point_field_val.startswith('[') and current_point_field_val.endswith(']'):
                try:
                    parsed_list = json.loads(current_point_field_val)
                    if isinstance(parsed_list, list) and all(isinstance(p, str) for p in parsed_list):
                        current_points_list = parsed_list
                        is_currently_array = True
                    else:
                        log.warning(f"{LogColors.WARNING}Building {building_name} Point field '{current_point_field_val}' parsed to non-list-of-strings. Treating as single point.{LogColors.ENDC}")
                        current_points_list = [current_point_field_val] if current_point_field_val else []
                except json.JSONDecodeError:
                    current_points_list = [current_point_field_val]
            else: 
                current_points_list = [current_point_field_val]
        elif isinstance(current_point_field_val, list) and all(isinstance(p, str) for p in current_point_field_val): # Should not happen
            current_points_list = current_point_field_val
            is_currently_array = True
        else:
            log.warning(f"{LogColors.WARNING}Building {building_name} has unexpected Point field type: {type(current_point_field_val)}. Skipping.{LogColors.ENDC}")
            continue
        
        if not current_points_list:
            log.warning(f"{LogColors.WARNING}Building {building_name} resulted in empty current_points_list from '{current_point_field_val}'. Skipping.{LogColors.ENDC}")
            continue

        current_size = len(current_points_list)
        primary_point_id = current_points_list[0]

        if current_size == expected_size:
            if expected_size == 1 and is_currently_array:
                log.info(f"Building {building_name} (Size 1) has Point as array '{current_point_field_val}'. Correcting to single string '{primary_point_id}'.")
                updates_to_batch.append({"id": building_airtable_id, "fields": {"Point": primary_point_id}})
                building_fields['Point'] = primary_point_id
                fixed_count += 1
            elif expected_size > 1 and not is_currently_array:
                log.info(f"Building {building_name} (Size {expected_size}) has Point as single string '{current_point_field_val}'. Correcting to JSON array.")
                updates_to_batch.append({"id": building_airtable_id, "fields": {"Point": json.dumps(current_points_list)}})
                building_fields['Point'] = json.dumps(current_points_list)
                fixed_count += 1
            else:
                log.info(f"Building {building_name} (Type: {building_type_str}) has correct point count ({current_size}) and format.")
            continue

        log.info(f"Building {building_name} (Type: {building_type_str}): Current points {current_size}, Expected size {expected_size}. Mismatch detected.")
        new_point_value_for_airtable: Optional[str] = None
        points_to_remove_from_global_occupied: Set[str] = set()
        points_to_add_to_global_occupied: Set[str] = set()

        if expected_size == 1:
            new_point_value_for_airtable = primary_point_id
            points_to_remove_from_global_occupied.update(current_points_list[1:])
            log.info(f"  Reducing to 1 point. New Point: '{new_point_value_for_airtable}'. To remove from occupied: {points_to_remove_from_global_occupied}")
        
        elif expected_size > 1:
            building_actual_land_id = building_fields.get('LandId')
            if not building_actual_land_id:
                log.error(f"{LogColors.FAIL}Building {building_name} is missing 'LandId'. Cannot manage points. Skipping.{LogColors.ENDC}")
                continue

            primary_point_details = extract_point_details(primary_point_id)
            if not primary_point_details:
                log.error(f"{LogColors.FAIL}Could not parse primary point ID '{primary_point_id}' for {building_name}. Skipping.{LogColors.ENDC}")
                continue
            primary_coords = (primary_point_details[1], primary_point_details[2])

            if current_size < expected_size:
                num_additional_needed = expected_size - current_size
                log.info(f"  Needs {num_additional_needed} more points.")
                
                points_to_exclude_for_search = occupied_points_set.union(set(current_points_list))
                
                additional_points_found_ids = find_N_closest_unoccupied_points(
                    primary_coords, num_additional_needed, required_point_type,
                    building_actual_land_id, all_polygons_data,
                    points_to_exclude_for_search, building_name
                )
                
                if len(additional_points_found_ids) < num_additional_needed:
                    log.warning(f"  {LogColors.WARNING}Found only {len(additional_points_found_ids)} of {num_additional_needed} new points for {building_name}.{LogColors.ENDC}")

                # Tentatively form the list of all points
                final_point_list = current_points_list + additional_points_found_ids
                
                if len(final_point_list) >= expected_size:
                    points_to_use = final_point_list[:expected_size]
                    new_point_value_for_airtable = json.dumps(points_to_use)
                    # Identify points that are truly new and part of the final list to be used
                    actually_added_new_points = [p for p in points_to_use if p in additional_points_found_ids]
                    points_to_add_to_global_occupied.update(actually_added_new_points)
                    log.info(f"  Expanding points. New list: {new_point_value_for_airtable}. Points added to occupied set for this building: {points_to_add_to_global_occupied}")
                else:
                    log.error(f"  {LogColors.FAIL}Building {building_name} (expected size {expected_size}) could not be fully expanded. "
                              f"Started with {len(current_points_list)} points, found {len(additional_points_found_ids)} additional. "
                              f"Total {len(final_point_list)} is less than required. Original Point: '{current_point_field_val}'. Skipping update for this building.{LogColors.ENDC}")
                    # new_point_value_for_airtable remains None, so no update will be batched.
                    # points_to_add_to_global_occupied will not be updated with additional_points_found_ids from this failed attempt.

            elif current_size > expected_size:
                log.info(f"  Needs to reduce points from {current_size} to {expected_size}.")
                points_to_keep = current_points_list[:expected_size]
                points_to_remove_from_global_occupied.update(current_points_list[expected_size:])
                new_point_value_for_airtable = json.dumps(points_to_keep)
                log.info(f"  Reducing points. New list: {new_point_value_for_airtable}. To remove from occupied: {points_to_remove_from_global_occupied}")

        if new_point_value_for_airtable is not None:
            updates_to_batch.append({"id": building_airtable_id, "fields": {"Point": new_point_value_for_airtable}})
            building_fields['Point'] = new_point_value_for_airtable
            
            for p_rem in points_to_remove_from_global_occupied:
                if p_rem in occupied_points_set: occupied_points_set.remove(p_rem)
            for p_add in points_to_add_to_global_occupied:
                occupied_points_set.add(p_add)
            fixed_count += 1
    
    if updates_to_batch:
        log.info(f"Found {len(updates_to_batch)} buildings for point count/format adjustment.")
        if not dry_run:
            try:
                for i in range(0, len(updates_to_batch), 10):
                    batch = updates_to_batch[i:i+10]
                    buildings_table.batch_update(batch)
                    log.info(f"  Successfully updated batch of {len(batch)} records for point counts/formats.")
            except Exception as e:
                log.error(f"{LogColors.FAIL}Error during Airtable batch update for point counts/formats: {e}{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}[DRY RUN] Would have updated {len(updates_to_batch)} records for point counts/formats.{LogColors.ENDC}")
            for upd in updates_to_batch:
                log.info(f"  [DRY RUN] Building {upd['id']} -> Point: {upd['fields']['Point']}")

    log.info(f"Point count/format mismatch fixing complete. Adjusted {fixed_count} buildings.")
    return fixed_count

# --- Main Execution ---
def main(dry_run: bool):
    log.info(f"Starting Building Points Fix script (dry_run: {dry_run})...")

    initialized_tables = initialize_airtable()
    if not initialized_tables:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable tables. Aborting.{LogColors.ENDC}")
        return

    buildings_table = initialized_tables.get('BUILDINGS')
    citizens_table = initialized_tables.get('CITIZENS') # Used for name computation

    if not buildings_table:
        log.error(f"{LogColors.FAIL}BUILDINGS table could not be initialized. Aborting.{LogColors.ENDC}")
        return
        
    all_buildings_raw = get_all_buildings(buildings_table)
    if not all_buildings_raw:
        log.info("No buildings found to process.")
        return

    # Load API building type definitions (might be used for other fields than size/pointType)
    api_building_type_defs = get_building_type_definitions()
    # Load LOCAL building type definitions (primary source for size and pointType)
    local_building_definitions = load_local_building_definitions(BUILDINGS_DATA_DIR)

    if not local_building_definitions: # Changed check to local_building_definitions
        log.error(f"{LogColors.FAIL}Could not load LOCAL building type definitions. Aborting.{LogColors.ENDC}")
        return

    all_polygons_data = get_polygons_data()
    if not all_polygons_data:
        log.error(f"{LogColors.FAIL}Could not load polygons data. Aborting.{LogColors.ENDC}")
        return

    # Create a deep enough copy for in-memory updates if 'fields' is also modified.
    # A shallow copy of the list is fine, but if building['fields'] is modified, it affects the original.
    # For this script, we are modifying building['fields']['Point'], etc.
    all_buildings_processed = [
        {'id': b['id'], 'createdTime': b['createdTime'], 'fields': b['fields'].copy()}
        for b in all_buildings_raw
    ]

    occupied_points_set: Set[str] = set()
    for building_data in all_buildings_processed:
        point_field = building_data['fields'].get('Point')
        if not point_field:
            continue
        
        if isinstance(point_field, str):
            if point_field.startswith('[') and point_field.endswith(']'):
                try:
                    point_list = json.loads(point_field)
                    if isinstance(point_list, list):
                        for p_id in point_list:
                            if isinstance(p_id, str): # Ensure elements are strings
                                occupied_points_set.add(p_id)
                            else:
                                log.warning(f"{LogColors.WARNING}Non-string element '{p_id}' found in parsed Point list for building {building_data['id']}. Skipping this element.{LogColors.ENDC}")
                    else: # Parsed to something other than a list
                        log.warning(f"{LogColors.WARNING}Point field for building {building_data['id']} looked like a list but parsed to {type(point_list)}: '{point_field}'. Treating as single occupied point.{LogColors.ENDC}")
                        occupied_points_set.add(point_field) 
                except json.JSONDecodeError:
                    log.warning(f"{LogColors.WARNING}Failed to parse Point field as JSON list for building {building_data['id']}: '{point_field}'. Treating as single occupied point.{LogColors.ENDC}")
                    occupied_points_set.add(point_field) 
            else: # Plain string, not array-like
                occupied_points_set.add(point_field)
        elif isinstance(point_field, list): # Should ideally not happen if Airtable field is Text
             log.warning(f"{LogColors.WARNING}Building {building_data['id']} has Point field as actual list, not string: {point_field}. Processing elements.{LogColors.ENDC}")
             for p_id_item in point_field:
                if isinstance(p_id_item, str):
                    occupied_points_set.add(p_id_item)
                else:
                    log.warning(f"{LogColors.WARNING}Non-string element '{p_id_item}' found in Point list for building {building_data['id']}. Skipping.{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Building {building_data['id']} has unexpected Point field type: {type(point_field)}. Value: '{point_field}'. Skipping for occupied set.{LogColors.ENDC}")

    log.info(f"Initial unique occupied logical Point IDs: {len(occupied_points_set)}")

    # Step 1: Fix Type Mismatches
    # Pass local_building_definitions for reliable pointType
    fix_type_mismatches(buildings_table, all_buildings_processed, local_building_definitions, all_polygons_data, occupied_points_set, dry_run)

    # Step 2: Fix Duplicate Points (using the potentially updated all_buildings_processed list and occupied_points_set)
    # Pass local_building_definitions for reliable pointType
    fix_duplicate_points(buildings_table, all_buildings_processed, local_building_definitions, all_polygons_data, occupied_points_set, dry_run)

    # Step 3: Fix Point Count Mismatches (NEW STEP)
    # Pass local_building_definitions for reliable size and pointType
    fix_point_count_mismatches(buildings_table, all_buildings_processed, local_building_definitions, all_polygons_data, occupied_points_set, dry_run)

    # Step 4: Set BuildingId from Point (using the final state of all_buildings_processed)
    set_building_id_from_point(buildings_table, all_buildings_processed, dry_run)

    # Step 5: Ensure Position field is set from Point field
    set_position_from_point(buildings_table, all_buildings_processed, dry_run)

    # Step 6: Ensure RunBy is set from Owner if RunBy is null
    set_runby_from_owner_if_null(buildings_table, all_buildings_processed, dry_run)

    # Step 7: Compute and set missing building names
    # Ensure citizens_table (obtained from initialized_tables earlier) is available for fetching names
    if not citizens_table and not dry_run: # Only critical if not dry_run and CITIZENS table was expected for name computation
        log.warning(f"{LogColors.WARNING}CITIZENS table not available (or not initialized successfully). Name computation for some buildings (e.g., galleys) might be incomplete.{LogColors.ENDC}")
        # Proceeding, as compute_and_set_missing_names handles citizens_table being None.
    
    compute_and_set_missing_names(buildings_table, citizens_table, all_buildings_processed, api_building_type_defs, all_polygons_data, dry_run)

    # Step 8: Set Wages to 0 for home category buildings
    set_wages_to_zero_for_homes(buildings_table, all_buildings_processed, dry_run)

    log.info(f"{LogColors.OKGREEN}Building Points Fix script finished.{LogColors.ENDC}")

def set_wages_to_zero_for_homes(
    buildings_table: Table,
    all_buildings: List[Dict],
    dry_run: bool
) -> int:
    log.info("\n--- Setting Wages to 0 for Home Category Buildings ---")
    updated_count = 0
    updates_to_batch: List[Dict[str, Any]] = []

    for building_record in all_buildings:
        building_airtable_id = building_record['id']
        building_fields = building_record['fields']
        building_category = building_fields.get('Category')
        current_wages = building_fields.get('Wages') # Wages might be None or a number

        if building_category == 'home':
            # Check if Wages is not already 0 or None (or effectively zero)
            # We want to set it to 0 if it's anything else.
            # If Wages is None, we might still want to explicitly set it to 0 if the schema expects a number.
            # For simplicity, if it's 'home', set Wages to 0 unless it's already 0.
            if current_wages is None or float(current_wages or 0) != 0:
                log.info(f"Building {building_fields.get('Name', building_airtable_id)} (Category: home) has Wages: {current_wages}. Setting to 0.")
                updates_to_batch.append({"id": building_airtable_id, "fields": {"Wages": 0}})
                building_fields['Wages'] = 0 # Update in-memory record
                updated_count +=1
            else:
                log.debug(f"Building {building_fields.get('Name', building_airtable_id)} (Category: home) already has Wages set to 0 or None. Skipping.")
    
    if updates_to_batch:
        log.info(f"Found {len(updates_to_batch)} home buildings requiring Wages update to 0.")
        if not dry_run:
            try:
                for i in range(0, len(updates_to_batch), 10): # Airtable batch limit is 10
                    batch = updates_to_batch[i:i+10]
                    buildings_table.batch_update(batch)
                    log.info(f"  Successfully updated batch of {len(batch)} home building Wages to 0.")
            except Exception as e:
                log.error(f"{LogColors.FAIL}Error during Airtable batch update for home building Wages: {e}{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}[DRY RUN] Would have updated {len(updates_to_batch)} home building Wages to 0.{LogColors.ENDC}")
            for upd in updates_to_batch:
                log.info(f"  [DRY RUN] Building {upd['id']} -> Wages: {upd['fields']['Wages']}")
    else:
        log.info("No home buildings found requiring Wages update to 0.")

    log.info(f"Setting Wages to 0 for home buildings complete. {'Would have updated' if dry_run and updates_to_batch else 'Updated'} {updated_count} buildings.")
    return updated_count

def set_runby_from_owner_if_null(
    buildings_table: Table,
    all_buildings: List[Dict], # This list reflects all prior modifications
    dry_run: bool
) -> int:
    log.info("\n--- Setting RunBy from Owner if RunBy is Null ---")
    updated_count = 0
    total_buildings_for_runby_fix = len(all_buildings)
    log.info(f"Processing {total_buildings_for_runby_fix} buildings to set RunBy from Owner if null.")
    for i, building in enumerate(all_buildings):
        building_airtable_id = building['id']
        building_fields = building['fields']
        # log.info(f"  Checking RunBy for building {i+1}/{total_buildings_for_runby_fix}: {building_airtable_id} ({building_fields.get('Name', 'N/A')})")
        current_run_by = building_fields.get('RunBy')
        current_owner = building_fields.get('Owner')
        building_name = building_fields.get('Name', building_airtable_id)

        if not current_run_by: # Checks for None or empty string
            if current_owner:
                log.info(f"Building {building_name} (ID: {building_airtable_id}): RunBy is null/empty. Setting RunBy to Owner '{current_owner}'.")
                if update_building_in_airtable(buildings_table, building_airtable_id, {"RunBy": current_owner}, dry_run):
                    building['fields']['RunBy'] = current_owner # Update in-memory record
                    updated_count += 1
            else:
                log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): RunBy is null/empty, but Owner is also null/empty. Cannot set RunBy.{LogColors.ENDC}")
        else:
            log.debug(f"Building {building_name} (ID: {building_airtable_id}): RunBy ('{current_run_by}') is already set. No update needed.")
            
    log.info(f"Setting RunBy from Owner complete. Updated {updated_count} buildings.")
    return updated_count

def set_position_from_point(
    buildings_table: Table,
    all_buildings: List[Dict], # This list reflects all prior modifications
    dry_run: bool
) -> int:
    log.info("\n--- Setting Position from Point ---")
    updated_count = 0
    total_buildings_for_position_fix = len(all_buildings)
    log.info(f"Processing {total_buildings_for_position_fix} buildings to set Position from Point.")
    for i, building in enumerate(all_buildings):
        building_airtable_id = building['id']
        building_fields = building['fields']
        # log.info(f"  Setting Position for building {i+1}/{total_buildings_for_position_fix}: {building_airtable_id} ({building_fields.get('Name', 'N/A')})")
        current_point_str = building_fields.get('Point')
        current_position_str = building_fields.get('Position')
        building_name = building_fields.get('Name', building_airtable_id)

        if not current_point_str:
            log.debug(f"Building {building_name} (ID: {building_airtable_id}) has no Point value. Skipping Position update.")
            continue

        expected_position_coords: Optional[Dict[str, float]] = None

        # Attempt to parse Point as a JSON array of point IDs
        try:
            point_data = json.loads(current_point_str)
            if isinstance(point_data, list) and \
               all(isinstance(pid, str) for pid in point_data) and \
               2 <= len(point_data) <= 4: # Consistent with API logic for 2-4 points for centroid

                resolved_coords_list: List[Dict[str, float]] = []
                all_ids_resolved_successfully = True
                for point_id_str_in_array in point_data:
                    coords = _resolve_point_id_to_coords_local(point_id_str_in_array)
                    if coords:
                        resolved_coords_list.append(coords)
                    else:
                        all_ids_resolved_successfully = False
                        log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): Could not resolve point ID '{point_id_str_in_array}' within Point array '{current_point_str}'. Cannot calculate centroid.{LogColors.ENDC}")
                        break 
                
                if all_ids_resolved_successfully and resolved_coords_list: # Should be true if len(point_data) >= 2
                    sum_lat = sum(c['lat'] for c in resolved_coords_list)
                    sum_lng = sum(c['lng'] for c in resolved_coords_list)
                    expected_position_coords = {
                        "lat": sum_lat / len(resolved_coords_list),
                        "lng": sum_lng / len(resolved_coords_list)
                    }
                    log.info(f"Building {building_name} (ID: {building_airtable_id}): Calculated centroid {expected_position_coords} from Point array '{current_point_str}'.")
            # If not a list of 2-4 strings, it might be a single point ID string or invalid JSON that's not a list.
            # The 'else' for this if or if json.loads resulted in non-list will fall through.
        except json.JSONDecodeError:
            # Not a JSON string, assume it's a single point ID to be parsed by extract_point_details
            pass 
        except TypeError: # Handles cases where current_point_str might be non-string (e.g. None already caught, but defensive)
            log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): Point field '{current_point_str}' is not a string. Cannot process.{LogColors.ENDC}")
            continue


        if expected_position_coords is None: # If not set by array logic, try as single point ID
            point_details_single = extract_point_details(current_point_str)
            if point_details_single:
                _, p_lat, p_lng, _ = point_details_single
                expected_position_coords = {"lat": p_lat, "lng": p_lng}
                # log.info(f"Building {building_name} (ID: {building_airtable_id}): Parsed single Point ID '{current_point_str}' to coords {expected_position_coords}.") # Can be noisy
            else:
                log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): Point field '{current_point_str}' is not a valid JSON array of 2-4 IDs nor a parseable single Point ID. Cannot determine expected Position.{LogColors.ENDC}")
                continue # Skip this building for Position update

        # This check should be redundant if the continue above is hit, but as a safeguard:
        if not expected_position_coords:
            log.error(f"{LogColors.FAIL}Building {building_name} (ID: {building_airtable_id}): Logic error, expected_position_coords is None after processing Point '{current_point_str}'. Skipping.{LogColors.ENDC}")
            continue
            
        expected_position_str = json.dumps(expected_position_coords)
        needs_update = False

        if not current_position_str:
            log.info(f"Building {building_name} (ID: {building_airtable_id}): Position field is missing. Setting from Point '{current_point_str}' to '{expected_position_str}'.")
            needs_update = True
        else:
            try:
                current_position_coords_parsed = json.loads(current_position_str)
                if not (isinstance(current_position_coords_parsed, dict) and
                        'lat' in current_position_coords_parsed and 'lng' in current_position_coords_parsed and
                        abs(current_position_coords_parsed['lat'] - expected_position_coords['lat']) < 1e-6 and
                        abs(current_position_coords_parsed['lng'] - expected_position_coords['lng']) < 1e-6):
                    log.info(f"Building {building_name} (ID: {building_airtable_id}): Current Position '{current_position_str}' does not match expected Position '{expected_position_str}' derived from Point '{current_point_str}'. Updating Position.")
                    needs_update = True
                # else: Position already matches expected.
            except json.JSONDecodeError:
                log.warning(f"{LogColors.WARNING}Building {building_name} (ID: {building_airtable_id}): Position field '{current_position_str}' is not valid JSON. Updating from Point '{current_point_str}' to '{expected_position_str}'.{LogColors.ENDC}")
                needs_update = True
        
        if needs_update:
            if update_building_in_airtable(buildings_table, building_airtable_id, {"Position": expected_position_str}, dry_run):
                building['fields']['Position'] = expected_position_str # Update in-memory record
                updated_count += 1
        elif not needs_update and current_position_str: # Only log if it wasn't missing and didn't need update
             log.info(f"Building {building_name} (ID: {building_airtable_id}): Position ('{current_position_str}') already matches expected derived from Point ('{current_point_str}'). No update needed.")

    log.info(f"Setting Position from Point complete. Updated {updated_count} buildings.")
    return updated_count

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fix building points, types, and duplicates in Airtable.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable."
    )
    args = parser.parse_args()

    # main(args.dry_run) # Call to main moved after function definitions

def compute_and_set_missing_names(
    buildings_table: Table,
    citizens_table: Optional[Table], # Added citizens_table parameter
    all_buildings: List[Dict],
    building_type_api_defs: Dict[str, Dict], # Definitions from /api/building-types for display names
    all_polygons_data: List[Dict],
    dry_run: bool
) -> int:
    log.info("\n--- Computing and Setting Missing Building Names ---")
    updated_count = 0
    updates_to_batch: List[Dict[str, Any]] = []

    for building_record in all_buildings:
        building_airtable_id = building_record['id']
        building_fields = building_record['fields']
        current_name = building_fields.get('Name')

        if current_name and current_name.strip(): # Skip if name already exists and is not empty
            log.debug(f"Building {building_fields.get('BuildingId', building_airtable_id)} already has a name: '{current_name}'. Skipping.")
            continue

        building_type_str = building_fields.get('Type')
        current_point_field_val = building_fields.get('Point')

        if not building_type_str or not current_point_field_val:
            log.warning(f"{LogColors.WARNING}Building {building_airtable_id} missing Type or Point. Cannot compute name.{LogColors.ENDC}")
            continue

        building_type_info = building_type_api_defs.get(building_type_str)
        if not building_type_info:
            log.warning(f"{LogColors.WARNING}Definition for building type '{building_type_str}' not found in API definitions. Cannot compute name for {building_airtable_id}.{LogColors.ENDC}")
            continue
        
        building_type_display_name = building_type_info.get('name', building_type_str) # Fallback to type_str

        primary_point_id_str = None
        if isinstance(current_point_field_val, str):
            if current_point_field_val.startswith('[') and current_point_field_val.endswith(']'):
                try:
                    parsed_list = json.loads(current_point_field_val)
                    if isinstance(parsed_list, list) and parsed_list and isinstance(parsed_list[0], str):
                        primary_point_id_str = parsed_list[0]
                    else:
                        log.warning(f"{LogColors.WARNING}Building {building_airtable_id} Point field '{current_point_field_val}' parsed to non-list-of-strings or empty. Cannot determine primary point.{LogColors.ENDC}")
                        continue
                except json.JSONDecodeError:
                    primary_point_id_str = current_point_field_val # Treat as single ID if not valid JSON array
            else:
                primary_point_id_str = current_point_field_val
        else:
            log.warning(f"{LogColors.WARNING}Building {building_airtable_id} has unexpected Point field type: {type(current_point_field_val)}. Cannot compute name.{LogColors.ENDC}")
            continue
        
        if not primary_point_id_str:
            log.warning(f"{LogColors.WARNING}Could not determine primary point ID for building {building_airtable_id} from Point field '{current_point_field_val}'. Cannot compute name.{LogColors.ENDC}")
            continue

        point_details = extract_point_details(primary_point_id_str)
        if not point_details:
            log.warning(f"{LogColors.WARNING}Could not parse details from primary point ID '{primary_point_id_str}' for building {building_airtable_id}. Cannot compute name.{LogColors.ENDC}")
            continue

        point_type_prefix, _, _, _ = point_details
        location_name_for_building = "Unknown Location"
        found_location_name = False

        points_list_key_map = {
            "building": "buildingPoints", "land": "buildingPoints",
            "canal": "canalPoints", "bridge": "bridgePoints"
        }
        points_list_key = points_list_key_map.get(point_type_prefix)

        if points_list_key:
            for polygon in all_polygons_data:
                points_to_search = polygon.get(points_list_key, [])
                if not isinstance(points_to_search, list): continue

                original_point_data = next((p for p in points_to_search if isinstance(p, dict) and p.get('id') == primary_point_id_str), None)
                
                if original_point_data:
                    if points_list_key == "buildingPoints":
                        location_name_for_building = original_point_data.get("streetName", primary_point_id_str)
                    elif points_list_key == "canalPoints":
                        location_name_for_building = original_point_data.get("historicalName") or original_point_data.get("englishName", primary_point_id_str)
                    elif points_list_key == "bridgePoints":
                        if 'connection' in original_point_data and isinstance(original_point_data['connection'], dict):
                            location_name_for_building = original_point_data['connection'].get("historicalName") or original_point_data['connection'].get("englishName", primary_point_id_str)
                        else: # Fallback if connection object is missing for a bridgePoint
                            location_name_for_building = primary_point_id_str
                    else: # Should not happen given points_list_key_map
                        location_name_for_building = primary_point_id_str
                    found_location_name = True
                    break
            if not found_location_name:
                 log.warning(f"{LogColors.WARNING}Could not find point ID '{primary_point_id_str}' (type prefix: {point_type_prefix}) in any polygon's '{points_list_key}' list for building {building_airtable_id}. Using point ID as location name.{LogColors.ENDC}")
                 location_name_for_building = primary_point_id_str # Fallback
        else:
            log.warning(f"{LogColors.WARNING}Unknown point type prefix '{point_type_prefix}' for point '{primary_point_id_str}' of building {building_airtable_id}. Using point ID as location name.{LogColors.ENDC}")
            location_name_for_building = primary_point_id_str # Fallback

        if building_type_str == "merchant_galley":
            run_by_username = building_fields.get('RunBy') or building_fields.get('Owner')
            operator_display_name = run_by_username # Fallback to username
            if run_by_username and citizens_table:
                try:
                    operator_record = citizens_table.all(formula=f"{{Username}}='{_escape_airtable_value(run_by_username)}'", max_records=1)
                    if operator_record:
                        op_fields = operator_record[0]['fields']
                        op_first_name = op_fields.get("FirstName", "")
                        op_last_name = op_fields.get("LastName", "")
                        full_name = f"{op_first_name} {op_last_name}".strip()
                        if full_name:
                            operator_display_name = full_name
                    else:
                        log.warning(f"Could not find citizen record for RunBy/Owner '{run_by_username}' of galley {building_fields.get('BuildingId', building_airtable_id)}.")
                except Exception as e_fetch_op:
                    log.error(f"Error fetching citizen record for RunBy/Owner '{run_by_username}': {e_fetch_op}")
            elif not citizens_table and not dry_run:
                 log.warning(f"CITIZENS table not available, cannot fetch full name for RunBy/Owner '{run_by_username}' of galley. Using username.")

            computed_building_name = f"Merchant Galley run by {operator_display_name or 'Unknown Operator'}"
        else:
            computed_building_name = f"{building_type_display_name} at {location_name_for_building}"
            
        log.info(f"Building {building_fields.get('BuildingId', building_airtable_id)}: Computed Name = '{computed_building_name}'")
        
        updates_to_batch.append({"id": building_airtable_id, "fields": {"Name": computed_building_name}})
        building_fields['Name'] = computed_building_name # Update in-memory record

    if updates_to_batch:
        log.info(f"Found {len(updates_to_batch)} buildings requiring name computation.")
        if not dry_run:
            try:
                for i in range(0, len(updates_to_batch), 10): # Airtable batch limit is 10
                    batch = updates_to_batch[i:i+10]
                    buildings_table.batch_update(batch)
                    log.info(f"  Successfully updated batch of {len(batch)} building names.")
                    updated_count += len(batch)
            except Exception as e:
                log.error(f"{LogColors.FAIL}Error during Airtable batch update for building names: {e}{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}[DRY RUN] Would have updated {len(updates_to_batch)} building names.{LogColors.ENDC}")
            for upd in updates_to_batch:
                log.info(f"  [DRY RUN] Building {upd['id']} -> Name: {upd['fields']['Name']}")
            updated_count = len(updates_to_batch) # Count simulated updates

    log.info(f"Building name computation complete. {'Would have updated' if dry_run else 'Updated'} {updated_count} building names.")
    return updated_count

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fix building points, types, and duplicates in Airtable.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable."
    )
    args = parser.parse_args()

    main(args.dry_run)
