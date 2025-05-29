import os
import sys
import json
import uuid
import argparse
import time
from datetime import datetime
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
import colorama
from colorama import Fore, Style

# Initialize colorama
colorama.init(autoreset=True)

# Constants
OWNER_CITIZEN = "ConsiglioDeiDieci"
PUBLIC_WELL_TYPE = "public_well"
PUBLIC_WELL_CATEGORY = "passive" # Based on public_well.json
DOCK_TYPE = "public_dock" # Assuming 'dock' is the type for public docks
DOCK_CATEGORY = "business" # Based on typical dock category

# Logging functions
def log_header(message: str):
    border = "=" * 80
    print(f"\n{Fore.CYAN}{Style.BRIGHT}{border}")
    print(f"{Fore.CYAN}{Style.BRIGHT}{message.center(80)}")
    print(f"{Fore.CYAN}{Style.BRIGHT}{border}{Style.RESET_ALL}\n")

def log_info(message: str):
    print(f"{Fore.BLUE}[*] {message}{Style.RESET_ALL}")

def log_success(message: str):
    print(f"{Fore.GREEN}[+] {message}{Style.RESET_ALL}")

def log_warning(message: str):
    print(f"{Fore.YELLOW}[!] {message}{Style.RESET_ALL}")

def log_error(message: str):
    print(f"{Fore.RED}[-] {message}{Style.RESET_ALL}")

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    load_dotenv()
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log_error("Airtable credentials (AIRTABLE_API_KEY, AIRTABLE_BASE_ID) not found in environment variables.")
        return None

    try:
        api = Api(airtable_api_key)
        tables = {
            "lands": api.table(airtable_base_id, "LANDS"),
            "buildings": api.table(airtable_base_id, "BUILDINGS"),
        }
        log_success("Successfully initialized Airtable connection.")
        return tables
    except Exception as e:
        log_error(f"Failed to initialize Airtable: {e}")
        return None

def get_all_lands(tables: Dict[str, Table]) -> List[Dict[str, Any]]:
    """Fetch all land records from Airtable."""
    try:
        log_info("Fetching all lands from Airtable...")
        lands = tables["lands"].all(fields=["LandId", "HistoricalName"]) # Only fetch necessary fields
        log_success(f"Fetched {len(lands)} land records.")
        return lands
    except Exception as e:
        log_error(f"Error fetching lands: {e}")
        return []

def get_all_buildings_by_land(tables: Dict[str, Table]) -> Dict[str, List[Dict[str, Any]]]:
    """Fetch all building records and group them by LandId."""
    buildings_by_land = {}
    try:
        log_info("Fetching all buildings from Airtable...")
        # Removed "Position" from fields as it does not exist in the Airtable table
        all_buildings = tables["buildings"].all(fields=["LandId", "Type", "Point"])
        log_success(f"Fetched {len(all_buildings)} total building records.")
        for building_record in all_buildings:
            land_id = building_record.get("fields", {}).get("LandId")
            if land_id:
                if land_id not in buildings_by_land:
                    buildings_by_land[land_id] = []
                buildings_by_land[land_id].append(building_record["fields"])
        log_info(f"Grouped buildings by LandId for {len(buildings_by_land)} lands.")
    except Exception as e:
        log_error(f"Error fetching or grouping buildings: {e}")
    return buildings_by_land

def get_polygon_data_for_land(land_id: str) -> Optional[Dict[str, Any]]:
    """Fetch polygon data for a specific land ID from the API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        url = f"{api_base_url}/api/get-polygons?id={land_id}&essential=true"
        log_info(f"Fetching polygon data for land {land_id} from {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("polygons") and isinstance(data["polygons"], list) and len(data["polygons"]) > 0:
            log_success(f"Successfully fetched polygon data for land {land_id}.")
            return data["polygons"][0] # Return the first polygon object
        else:
            log_warning(f"No polygon data found for land {land_id} in API response or response format incorrect.")
            return None
    except requests.exceptions.RequestException as e:
        log_error(f"API request failed for polygon data of land {land_id}: {e}")
        return None
    except json.JSONDecodeError as e:
        log_error(f"Failed to decode JSON response for polygon data of land {land_id}: {e}")
        return None
    except Exception as e:
        log_error(f"An unexpected error occurred while fetching polygon data for land {land_id}: {e}")
        return None

def parse_point_string_to_coords(point_string: Optional[str]) -> Optional[Dict[str, float]]:
    """
    Parses a point string in the format 'type_lat_lng' or 'type_lat_lng_index'
    and returns a dictionary with lat and lng.
    Returns None if parsing fails.
    """
    if not point_string:
        return None
    parts = point_string.split('_')
    # We need at least 3 parts for type, lat, lng.
    if len(parts) >= 3:
        try:
            lat = float(parts[1])
            lng = float(parts[2])
            return {"lat": lat, "lng": lng}
        except ValueError:
            # Latitude or longitude are not valid floats
            log_warning(f"Could not parse lat/lng from point string: {point_string}")
            return None
    log_warning(f"Point string format not recognized for coordinate parsing: {point_string}")
    return None

def is_point_occupied(point_coords: Dict[str, float], point_id: Optional[str], existing_buildings_on_land: List[Dict[str, Any]]) -> bool:
    """Check if a given point (by coordinates or ID) is already occupied by an existing building."""
    for building in existing_buildings_on_land:
        existing_building_point_value = building.get("Point")

        # Check 1: Direct match of point_id (e.g., polygon point ID stored in building's "Point" field)
        if point_id and existing_building_point_value == point_id:
            log_info(f"Point ID {point_id} is occupied (direct match with existing building's Point field).")
            return True
        
        # Check 2: Coordinate comparison by parsing the existing building's "Point" field
        # This handles cases where "Point" field stores a string like "building_lat_lng"
        if existing_building_point_value:
            parsed_coords = parse_point_string_to_coords(existing_building_point_value)
            if parsed_coords:
                # Compare with a small tolerance for float precision
                if (abs(parsed_coords["lat"] - point_coords["lat"]) < 0.00001 and
                    abs(parsed_coords["lng"] - point_coords["lng"]) < 0.00001):
                    log_info(f"Point at {point_coords} is occupied (coordinate match with existing building's Point field: {existing_building_point_value}).")
                    return True
            # else: The point string was not in a parsable coordinate format, or was null.
            # This is fine, it just means this specific check didn't find a match.
            
    return False

def find_available_point(
    polygon_data: Dict[str, Any],
    point_category_key: str, # "buildingPoints" or "canalPoints"
    existing_buildings_on_land: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """Find the first available point of a specific category on a polygon."""
    points_list = polygon_data.get(point_category_key, [])
    if not points_list:
        log_info(f"No points found in category '{point_category_key}' for land {polygon_data.get('id')}")
        return None

    for point_data in points_list:
        point_id = point_data.get("id")
        coords = {}

        if point_category_key == "buildingPoints":
            if "lat" in point_data and "lng" in point_data:
                coords = {"lat": float(point_data["lat"]), "lng": float(point_data["lng"])}
            else:
                log_warning(f"Building point missing lat/lng: {point_data}")
                continue
        elif point_category_key == "canalPoints":
            edge = point_data.get("edge", {})
            if "lat" in edge and "lng" in edge:
                coords = {"lat": float(edge["lat"]), "lng": float(edge["lng"])}
            else:
                log_warning(f"Canal point 'edge' missing lat/lng: {point_data}")
                continue
        else:
            log_warning(f"Unknown point category key: {point_category_key}")
            return None

        if not is_point_occupied(coords, point_id, existing_buildings_on_land):
            log_success(f"Found available {point_category_key[:-1]} at {coords} (ID: {point_id})")
            return {"id": point_id, "lat": coords["lat"], "lng": coords["lng"]}
            
    log_info(f"No available points found in category '{point_category_key}' for land {polygon_data.get('id')}")
    return None

def create_building_record(
    tables: Dict[str, Table],
    owner: str,
    building_type: str,
    category: str,
    land_id: str,
    point_id: str,
    position: Dict[str, float],
    dry_run: bool = False
) -> bool:
    """Create a new building record in Airtable."""
    building_id_uuid = f"building-{uuid.uuid4()}"
    timestamp = datetime.now().isoformat()

    record_data = {
        "BuildingId": building_id_uuid,
        "Type": building_type,
        "Category": category,
        "LandId": land_id,
        "Owner": owner,
        "Point": f"{building_type}_{position['lat']}_{position['lng']}", # Format: type_latitude_longitude
        # "Position" field removed as it does not exist in Airtable and info is in "Point"
        "Variant": "model", # Default variant
        "Rotation": 0,      # Default rotation
        "LeasePrice": 0,
        "RentPrice": 0,
        "CreatedAt": timestamp,
        "UpdatedAt": timestamp,
        # "Occupant" can be left blank
    }

    log_info(f"Attempting to create '{building_type}' on land '{land_id}' at point '{point_id}' ({position['lat']},{position['lng']})")
    if dry_run:
        log_warning(f"[DRY RUN] Would create building: {record_data}")
        return True

    try:
        created_record = tables["buildings"].create(record_data)
        log_success(f"Successfully created '{building_type}' (Airtable ID: {created_record['id']}, BuildingId: {building_id_uuid}) on land '{land_id}'.")
        return True
    except Exception as e:
        log_error(f"Failed to create '{building_type}' on land '{land_id}': {e}")
        return False

def main(dry_run: bool):
    log_header(f"Automated Building Placement Script (Dry Run: {dry_run})")

    tables = initialize_airtable()
    if not tables:
        return

    all_lands = get_all_lands(tables)
    if not all_lands:
        log_warning("No lands found to process.")
        return

    all_buildings_by_land = get_all_buildings_by_land(tables)
    
    processed_lands = 0
    wells_created = 0
    docks_created = 0

    for land_record in all_lands:
        land_id = land_record.get("fields", {}).get("LandId")
        land_name = land_record.get("fields", {}).get("HistoricalName", land_id)
        processed_lands += 1
        log_info(f"\nProcessing Land: {land_name} (ID: {land_id}) [{processed_lands}/{len(all_lands)}]")

        if not land_id:
            log_warning(f"Skipping land record {land_record.get('id')} due to missing LandId.")
            continue

        existing_buildings_on_this_land = all_buildings_by_land.get(land_id, [])

        # 1. Check and create Public Well if needed
        has_well = any(b.get("Type") == PUBLIC_WELL_TYPE for b in existing_buildings_on_this_land)
        if has_well:
            log_info(f"Land {land_name} already has a '{PUBLIC_WELL_TYPE}'. Skipping well creation.")
        else:
            log_info(f"Land {land_name} does not have a '{PUBLIC_WELL_TYPE}'. Attempting to create one.")
            polygon_data = get_polygon_data_for_land(land_id)
            if polygon_data:
                available_building_point = find_available_point(polygon_data, "buildingPoints", existing_buildings_on_this_land)
                if available_building_point:
                    if create_building_record(
                        tables, OWNER_CITIZEN, PUBLIC_WELL_TYPE, PUBLIC_WELL_CATEGORY,
                        land_id, available_building_point["id"],
                        {"lat": available_building_point["lat"], "lng": available_building_point["lng"]},
                        dry_run
                    ):
                        wells_created += 1
                        # Add a placeholder to existing_buildings_on_this_land if not dry_run to prevent using the same point for a dock
                        if not dry_run:
                             existing_buildings_on_this_land.append({
                                "Type": PUBLIC_WELL_TYPE, 
                                "Point": available_building_point["id"] 
                                # "Position" field is not added here as it's not used for checking occupancy from existing_buildings_on_this_land
                            })
                else:
                    log_warning(f"No available building points found for '{PUBLIC_WELL_TYPE}' on land {land_name}.")
            else:
                log_warning(f"Could not retrieve polygon data for land {land_name}. Skipping well creation.")
        
        # Add a small delay to avoid hitting API rate limits if many lands are processed
        time.sleep(0.2)

        # 2. Check and create Public Dock if needed
        has_dock = any(b.get("Type") == DOCK_TYPE for b in existing_buildings_on_this_land)
        if has_dock:
            log_info(f"Land {land_name} already has a '{DOCK_TYPE}'. Skipping dock creation.")
        else:
            log_info(f"Land {land_name} does not have a '{DOCK_TYPE}'. Attempting to create one.")
            # Fetch polygon data again only if not fetched for the well (or if it failed)
            if 'polygon_data' not in locals() or not polygon_data or polygon_data.get('id') != land_id:
                 polygon_data = get_polygon_data_for_land(land_id)

            if polygon_data:
                if not polygon_data.get("HasWaterAccess", True): # Assume True if not present, but ideally API provides this
                    log_info(f"Land {land_name} does not have water access (or 'HasWaterAccess' is false/missing). Skipping dock creation.")
                else:
                    available_canal_point = find_available_point(polygon_data, "canalPoints", existing_buildings_on_this_land)
                    if available_canal_point:
                        if create_building_record(
                            tables, OWNER_CITIZEN, DOCK_TYPE, DOCK_CATEGORY,
                            land_id, available_canal_point["id"],
                            {"lat": available_canal_point["lat"], "lng": available_canal_point["lng"]},
                            dry_run
                        ):
                            docks_created += 1
                    else:
                        log_warning(f"No available canal points found for '{DOCK_TYPE}' on land {land_name}.")
            else:
                log_warning(f"Could not retrieve polygon data for land {land_name} (again). Skipping dock creation.")
        
        # Clear polygon_data for the next land to ensure it's re-fetched if needed
        if 'polygon_data' in locals():
            del polygon_data
        time.sleep(0.2) # API delay

    log_header("Script Execution Summary")
    log_success(f"Processed {processed_lands} lands.")
    log_success(f"Created {wells_created} '{PUBLIC_WELL_TYPE}' buildings.")
    log_success(f"Created {docks_created} '{DOCK_TYPE}' buildings.")
    if dry_run:
        log_warning("This was a DRY RUN. No actual changes were made to Airtable.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automatically place public wells and docks on lands that don't have them.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the script execution without making any changes to Airtable."
    )
    args = parser.parse_args()

    main(args.dry_run)
