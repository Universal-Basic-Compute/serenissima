#!/usr/bin/env python3
"""
Expand Building Points for Multi-Size Buildings in Airtable.

This script identifies buildings in Airtable that, according to their local
JSON definitions (size > 1), require multiple building points.
For such buildings with a single string 'Point' field, it finds the closest
available and unoccupied building points on the same land parcel and updates
the 'Point' field in Airtable to be a JSON string list of point IDs
[primary_point, additional_point_1, ...].
"""

import os
import sys
import json
import logging
import argparse
import re
import math
from typing import Dict, Any, List, Optional, Set, Tuple, TypedDict
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from pyairtable import Api, Table
except ImportError:
    print("Error: pyairtable library not found. Please install it: pip install pyairtable")
    sys.exit(1)

import requests # Import requests
from dotenv import load_dotenv # Import load_dotenv

# Load environment variables from .env file
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")

# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("expandMultiSizeBuildingPoints")

# Environment Variables for Airtable
AIRTABLE_API_KEY = os.environ.get("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID") # Use the specific project Base ID consistently
AIRTABLE_BUILDINGS_TABLE_NAME = "BUILDINGS"

# Data paths
BUILDINGS_DATA_DIR = PROJECT_ROOT / "data" / "buildings"
POLYGONS_DATA_DIR = PROJECT_ROOT / "data" / "polygons"

# Point ID Regex: type_lat_lng_index_landid (index and landid are optional in the string)
# e.g., building_45.4375_12.3359_0_sestiere_1_area_1 OR canal_45.425700_12.330415
POINT_ID_REGEX = re.compile(r"^(building|canal|bridge)_([0-9.\-]+)_([0-9.\-]+)(?:_(\d+))?(?:_(.+))?$")

class LogColors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    OKBLUE = '\033[94m'
    BOLD = '\033[1m'
    CYAN = '\033[96m'

class ParsedPointID(TypedDict):
    type: str
    lat: float
    lng: float
    index: int  # Will default to 0 if not in point_id_str
    land_id_suffix: Optional[str] # Can be None if not in point_id_str
    original_id: str

class AvailablePolygonPoint(TypedDict):
    id: str
    lat: float
    lng: float
    land_id: str  # Matches the polygon file name / ID
    point_type: str # e.g. 'building', 'canal' from the point data itself

# --- Helper Functions ---

def parse_point_id_details(point_id_str: str) -> Optional[ParsedPointID]:
    """Parses a point ID string into its components."""
    if not isinstance(point_id_str, str):
        return None
    match = POINT_ID_REGEX.match(point_id_str)
    if not match:
        log.debug(f"Point ID '{point_id_str}' does not match regex POINT_ID_REGEX.")
        return None
    point_type, lat_str, lng_str, index_str, land_id_suffix_str = match.groups()
    try:
        parsed_index = 0 # Default index
        if index_str is not None:
            parsed_index = int(index_str)

        return {
            "type": point_type,
            "lat": float(lat_str),
            "lng": float(lng_str),
            "index": parsed_index,
            "land_id_suffix": land_id_suffix_str, # This can be None
            "original_id": point_id_str
        }
    except ValueError:
        log.error(f"Error parsing components from point ID '{point_id_str}'. Components: type='{point_type}', lat='{lat_str}', lng='{lng_str}', index='{index_str}', land_suffix='{land_id_suffix_str}'.")
        return None

def load_local_building_definitions(base_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Loads all building JSON files from data/buildings."""
    defs = {}
    log.info(f"Loading local building definitions from {base_dir}...")
    for file_path in base_dir.rglob('*.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            building_type_id = file_path.stem
            defs[building_type_id] = data
        except Exception as e:
            log.error(f"Error loading building definition {file_path}: {e}")
    log.info(f"Loaded {len(defs)} local building definitions.")
    return defs

def get_airtable_records(table: Table) -> List[Dict[str, Any]]:
    """Fetches all records from the given Airtable table."""
    log.info(f"Fetching records from Airtable table {table.name}...")
    try:
        records = table.all()
        log.info(f"Fetched {len(records)} records from {table.name}.")
        return records
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to fetch records from Airtable table {table.name}: {e}{LogColors.ENDC}")
        return []

def extract_occupied_points(airtable_buildings: List[Dict[str, Any]]) -> Set[str]:
    """Extracts all unique point IDs currently occupied by buildings in Airtable."""
    occupied = set()
    for record in airtable_buildings:
        point_field = record.get('fields', {}).get('Point')
        if not point_field:
            continue
        
        if isinstance(point_field, str):
            if point_field.startswith('[') and point_field.endswith(']'):
                try:
                    point_list = json.loads(point_field)
                    if isinstance(point_list, list):
                        for p_id in point_list:
                            if isinstance(p_id, str):
                                occupied.add(p_id)
                    else: # Not a list after parsing
                        occupied.add(point_field) # Treat as single string
                except json.JSONDecodeError:
                    occupied.add(point_field) # Treat as single string if parse fails
            else: # Plain string
                occupied.add(point_field)
        elif isinstance(point_field, list): # Should not happen if field is Text
             for p_id in point_field:
                if isinstance(p_id, str):
                    occupied.add(p_id)
    log.info(f"Extracted {len(occupied)} unique occupied points from Airtable buildings.")
    return occupied

def load_all_available_polygon_points() -> List[AvailablePolygonPoint]:
    """Loads all points from the /api/get-polygons endpoint."""
    all_points: List[AvailablePolygonPoint] = []
    api_url = f"{API_BASE_URL}/api/get-polygons?includePoints=true" # Ensure includePoints is true
    log.info(f"Loading available polygon points from API: {api_url}...")

    try:
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        api_data = response.json()

        if not api_data.get("success") or "polygons" not in api_data:
            log.error(f"API call to {api_url} did not return success or missing 'polygons' key. Response: {api_data}")
            return []

        polygons_from_api = api_data["polygons"]
        
        for polygon_feature in polygons_from_api:
            polygon_id = polygon_feature.get("id") # This is the LandId
            if not polygon_id:
                log.warning(f"Polygon feature missing 'id'. Skipping feature.") # Simplified log
                continue

            # Points are expected directly in polygon_feature as buildingPoints, canalPoints, etc.
            for point_array_key in ['buildingPoints', 'canalPoints', 'bridgePoints']:
                points_list = polygon_feature.get(point_array_key, []) # Get points list directly from polygon_feature
                
                current_list_point_type = None
                if point_array_key == 'buildingPoints':
                    current_list_point_type = 'building'
                elif point_array_key == 'canalPoints':
                    current_list_point_type = 'canal'
                elif point_array_key == 'bridgePoints':
                    current_list_point_type = 'bridge'
                
                if not current_list_point_type:
                    log.warning(f"Unknown point_array_key: {point_array_key} in polygon {polygon_id}. Skipping this key.")
                    continue

                if not isinstance(points_list, list):
                    log.warning(f"In polygon {polygon_id}, '{point_array_key}' is not a list. Skipping.")
                    continue

                for point_obj in points_list:
                    if not isinstance(point_obj, dict):
                        log.warning(f"In polygon {polygon_id}, found non-dict item in '{point_array_key}'. Skipping: {point_obj}")
                        continue

                    point_id_str = point_obj.get('id')
                    if not point_id_str:
                        log.warning(f"Point in polygon {polygon_id} (array {point_array_key}) missing 'id'. Skipping: {point_obj}")
                        continue

                    # Determine point type primarily from the array key
                    final_point_type = current_list_point_type
                    
                    # Optional: Validate if point_obj has its own 'type' and if it matches
                    type_in_obj = point_obj.get('type')
                    if type_in_obj and type_in_obj != final_point_type:
                        log.warning(f"Point {point_id_str} in array '{point_array_key}' has explicit type '{type_in_obj}' which differs from inferred type '{final_point_type}'. Using inferred type '{final_point_type}'.")

                    lat, lng = None, None
                    if point_array_key == 'buildingPoints':
                        lat, lng = point_obj.get('lat'), point_obj.get('lng')
                    elif point_array_key in ['canalPoints', 'bridgePoints']:
                        edge_data = point_obj.get('edge')
                        if isinstance(edge_data, dict):
                            lat, lng = edge_data.get('lat'), edge_data.get('lng')
                        else:
                            log.warning(f"Point {point_id_str} in {point_array_key} for polygon {polygon_id} missing 'edge' dictionary or 'edge' is not a dict. Skipping point.")
                            continue
                    
                    if lat is None or lng is None:
                        # Fallback to parsing from ID if lat/lng not found directly
                        # This might fail if API point IDs are simple (e.g. type_lat_lng) and regex expects complex format
                        parsed_details = parse_point_id_details(point_id_str)
                        if parsed_details and 'lat' in parsed_details and 'lng' in parsed_details:
                            lat, lng = parsed_details["lat"], parsed_details["lng"]
                            log.debug(f"Used lat/lng from parsed ID for {point_id_str}")
                        else:
                            log.warning(f"Could not get lat/lng directly or parse from point ID '{point_id_str}' in polygon {polygon_id} (array {point_array_key}). Skipping point.")
                            continue
                    
                    all_points.append({
                        "id": point_id_str,
                        "lat": float(lat),
                        "lng": float(lng),
                        "land_id": polygon_id, 
                        "point_type": final_point_type 
                    })
                    
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API request failed for {api_url}: {e}{LogColors.ENDC}")
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}Error decoding JSON response from {api_url}{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing data from {api_url}: {e}{LogColors.ENDC}")
            
    log.info(f"Loaded {len(all_points)} total points from API.")
    return all_points

def calculate_distance(coords1: Tuple[float, float], coords2: Tuple[float, float]) -> float:
    """Calculates Euclidean distance. For lat/lng, this is an approximation."""
    # For small areas, Euclidean distance on lat/lon can be a reasonable proxy for ranking.
    # For more accuracy over larger distances, Haversine formula would be needed.
    # math.dist requires Python 3.8+
    if hasattr(math, 'dist'):
        return math.dist(coords1, coords2)
    else: # Fallback for older Python
        return math.sqrt((coords1[0] - coords2[0])**2 + (coords1[1] - coords2[1])**2)


# --- Main Execution ---
def main():
    parser = argparse.ArgumentParser(description="Expand points for multi-size buildings in Airtable.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to Airtable."
    )
    args = parser.parse_args()

    # Ensure the correct, specific Airtable Base ID variable is checked
    if not AIRTABLE_API_KEY or not os.environ.get("AIRTABLE_BASE_ID"): # Check specific var
        log.error(f"{LogColors.FAIL}Airtable API key or AIRTABLE_BASE_ID not configured in environment variables.{LogColors.ENDC}")
        sys.exit(1)

    log.info(f"Starting building point expansion (Dry Run: {args.dry_run})...")

    api = Api(AIRTABLE_API_KEY)
    buildings_table = api.table(AIRTABLE_BASE_ID, AIRTABLE_BUILDINGS_TABLE_NAME)

    local_building_defs = load_local_building_definitions(BUILDINGS_DATA_DIR)
    airtable_buildings = get_airtable_records(buildings_table)
    
    # Initial set of occupied points
    # This set will be dynamically updated as we assign points in this script run
    # to prevent re-assigning the same newly-added point to multiple large buildings.
    occupied_points_master_set = extract_occupied_points(airtable_buildings)
    
    all_polygon_points = load_all_available_polygon_points() # Changed: No longer takes POLYGONS_DATA_DIR

    updates_for_airtable: List[Dict[str, Any]] = []
    total_airtable_buildings = len(airtable_buildings)
    log.info(f"Processing {total_airtable_buildings} buildings from Airtable for point expansion.")

    for i, record in enumerate(airtable_buildings):
        record_id = record['id']
        fields = record.get('fields', {})
        # log.info(f"  Checking building {i+1}/{total_airtable_buildings}: {record_id}")
        
        building_type_from_airtable = fields.get('Type')
        current_point_field_value = fields.get('Point')

        if not building_type_from_airtable or not current_point_field_value:
            log.debug(f"Building {record_id} missing Type or Point. Skipping.")
            continue

        # Check if Point field is already a list (JSON string or actual list)
        if isinstance(current_point_field_value, str) and \
           current_point_field_value.startswith('[') and \
           current_point_field_value.endswith(']'):
            try:
                # Verify it's a valid JSON list
                if isinstance(json.loads(current_point_field_value), list):
                    log.info(f"{LogColors.OKCYAN}Building {record_id} ({building_type_from_airtable}) Point field is already a JSON list: {current_point_field_value}. Skipping.{LogColors.ENDC}")
                    continue
            except json.JSONDecodeError:
                pass # Not a valid JSON list string, proceed

        if not isinstance(current_point_field_value, str):
            log.warning(f"{LogColors.WARNING}Building {record_id} ({building_type_from_airtable}) Point field is not a string: {type(current_point_field_value)}. Skipping.{LogColors.ENDC}")
            continue
        
        primary_point_id = current_point_field_value

        # Get the LandId from the building's record in Airtable - this is the authoritative land parcel ID
        building_actual_land_id = fields.get('LandId')
        if not building_actual_land_id:
            log.error(f"{LogColors.FAIL}Building {record_id} ({building_type_from_airtable}) is missing 'LandId' field in Airtable. Cannot determine its land parcel. Skipping.{LogColors.ENDC}")
            continue

        local_def = local_building_defs.get(building_type_from_airtable)
        if not local_def:
            log.warning(f"{LogColors.WARNING}Building type '{building_type_from_airtable}' (ID: {record_id}) not found in local definitions. Skipping.{LogColors.ENDC}")
            continue

        # Determine the required pointType for this building (e.g., 'building', 'canal', 'bridge')
        # This comes from the "pointType" attribute in the building's JSON definition.
        building_point_type_attr = local_def.get('pointType', 'building') # Default to 'building' if missing
            
        size = local_def.get('size', 1)
        if not isinstance(size, int) or size <= 1:
            log.debug(f"Building {record_id} ({building_type_from_airtable}) size is {size}. No additional points needed.")
            continue

        num_additional_points_needed = size - 1
        log.info(f"Processing Building: {LogColors.OKBLUE}{record_id} ({building_type_from_airtable}){LogColors.ENDC}, Size: {size}, Needs {num_additional_points_needed} additional points.")

        primary_point_details = parse_point_id_details(primary_point_id)
        if not primary_point_details:
            log.error(f"{LogColors.FAIL}Could not parse primary point ID string '{primary_point_id}' for building {record_id} (LandId: {building_actual_land_id}). Skipping.{LogColors.ENDC}")
            continue
        
        primary_coords = (primary_point_details['lat'], primary_point_details['lng'])
        # primary_land_id_suffix from point string is now less important: primary_point_details['land_id_suffix']

        # Filter available points: must match the building's required pointType, be on same land (using building_actual_land_id), and not occupied
        candidate_points_with_dist: List[Tuple[float, AvailablePolygonPoint]] = []
        for p_poly_point in all_polygon_points:
            if p_poly_point['id'] in occupied_points_master_set: # Check against master set of occupied points
                continue
            # Ensure the available point's type matches the building's required pointType
            if p_poly_point['point_type'] != building_point_type_attr:
                continue
            
            # Check if point is on the same land parcel using building_actual_land_id from Airtable
            if p_poly_point['land_id'] != building_actual_land_id:
                continue

            dist = calculate_distance(primary_coords, (p_poly_point['lat'], p_poly_point['lng']))
            candidate_points_with_dist.append((dist, p_poly_point))
        
        candidate_points_with_dist.sort(key=lambda x: x[0]) # Sort by distance

        selected_additional_points_ids: List[str] = []
        if not candidate_points_with_dist:
            log.warning(f"  {LogColors.WARNING}No available unoccupied '{building_point_type_attr}' points found on land '{building_actual_land_id}' for building {record_id}.{LogColors.ENDC}") # Use building_actual_land_id in log
        
        for _dist, point_to_add in candidate_points_with_dist:
            if len(selected_additional_points_ids) < num_additional_points_needed:
                if point_to_add['id'] not in occupied_points_master_set: # Double check, crucial
                    selected_additional_points_ids.append(point_to_add['id'])
                    occupied_points_master_set.add(point_to_add['id']) # Mark as occupied for this run
                else:
                    log.debug(f"  Point {point_to_add['id']} was concurrently marked occupied. Skipping.")
            else:
                break # Got enough points

        if len(selected_additional_points_ids) < num_additional_points_needed:
            log.warning(f"  {LogColors.WARNING}Building {record_id} needs {num_additional_points_needed} additional points, but only found and selected {len(selected_additional_points_ids)}.{LogColors.ENDC}")

        if selected_additional_points_ids:
            new_point_list = [primary_point_id] + selected_additional_points_ids
            new_point_value_for_airtable = json.dumps(new_point_list)
            
            updates_for_airtable.append({
                "id": record_id,
                "fields": {"Point": new_point_value_for_airtable}
            })
            log.info(f"  {LogColors.OKGREEN}Prepared update for {record_id}: Point -> {new_point_value_for_airtable}{LogColors.ENDC}")
        elif num_additional_points_needed > 0 : # Needed points but found none suitable
             log.info(f"  No suitable additional points selected for {record_id}.")


    if updates_for_airtable:
        log.info(f"\nFound {len(updates_for_airtable)} buildings to update.")
        if not args.dry_run:
            log.info(f"{LogColors.BOLD}Attempting to batch update Airtable...{LogColors.ENDC}")
            try:
                # Airtable batch_update can take max 10 records at a time
                for i in range(0, len(updates_for_airtable), 10):
                    batch = updates_for_airtable[i:i+10]
                    buildings_table.batch_update(batch)
                    log.info(f"  Successfully updated batch of {len(batch)} records.")
                log.info(f"{LogColors.OKGREEN}Airtable batch update completed for {len(updates_for_airtable)} records.{LogColors.ENDC}")
            except Exception as e:
                log.error(f"{LogColors.FAIL}Error during Airtable batch update: {e}{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Would have updated {len(updates_for_airtable)} records in Airtable.{LogColors.ENDC}")
    else:
        log.info("No buildings found requiring point expansion updates.")

    log.info(f"{LogColors.OKGREEN}Script finished.{LogColors.ENDC}")

if __name__ == "__main__":
    # Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in your environment
    # e.g. export AIRTABLE_API_KEY="keyXXXXXXXXXXXXXX"
    #      export AIRTABLE_BASE_ID="appXXXXXXXXXXXXXX"
    if not os.getenv("AIRTABLE_API_KEY") or not os.getenv("AIRTABLE_BASE_ID"): # Check specific var
        print(f"{LogColors.FAIL}Error: AIRTABLE_API_KEY and/or AIRTABLE_BASE_ID environment variables are not set.{LogColors.ENDC}")
        print("Please set them before running the script.")
        sys.exit(1)
    main()
