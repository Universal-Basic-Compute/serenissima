#!/usr/bin/env python3
"""
Process Imports script for La Serenissima.

This script:
1. Fetches all active import contracts (between CreatedAt and EndAt)
2. For each contract, ordered by CreatedAt:
   - Verifies the buyer has enough money
   - Checks if there's storage space left in the buyer's building
   - Transfers the money from buyer to seller
   - Creates a resource record for the imported goods

Run this script hourly to process resource imports.
"""

import os
import sys
import argparse # Added for command-line arguments
# Add the project root to sys.path to allow imports from backend.engine
# os.path.dirname(__file__) -> backend/engine
# os.path.join(..., '..') -> backend/engine/.. -> backend
# os.path.join(..., '..', '..') -> backend/engine/../../ -> serenissima (project root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import json
import logging
import argparse
import requests
import pytz
import random
import uuid
import math # Importer le module math
from datetime import datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv
from backend.engine.utils.activity_helpers import (
    VENICE_TIMEZONE, 
    calculate_haversine_distance_meters,
    get_building_types_from_api, # Import new helper
    get_resource_types_from_api,  # Import new helper
    LogColors, # Import LogColors
    log_header # Import log_header
)

import uuid # Added for generating ResourceId

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_imports")

# LogColors is now imported from activity_helpers

# Load environment variables
load_dotenv()

# --- Airtable Helper Functions ---
def get_existing_merchant_galleys(tables: Dict[str, Table]) -> List[Dict]:
    """Fetches all existing merchant_galley buildings and their positions."""
    try:
        formula = "{Type} = 'merchant_galley'"
        # Fetch fields needed for position and identification
        fields_to_fetch = ["BuildingId", "Position", "Point"] # Point might be useful for debugging
        galleys = tables['buildings'].all(formula=formula, fields=fields_to_fetch)
        log.info(f"Found {len(galleys)} existing merchant_galley buildings.")
        return galleys
    except Exception as e:
        log.error(f"Error fetching existing merchant_galleys: {e}")
        return []

def _escape_airtable_value(value: str) -> str:
    """Échappe les apostrophes pour les formules Airtable."""
    if isinstance(value, str):
        return value
    return str(value)

def is_dock_working_hours(current_venice_time: datetime) -> bool:
    """Check if it's currently within dock working hours (typically 6 AM to 6 PM) based on provided Venice time."""
    try:
        hour = current_venice_time.hour
        
        # Define dock working hours (6 AM to 6 PM)
        DOCK_OPEN_HOUR = 6  # 6 AM
        DOCK_CLOSE_HOUR = 18  # 6 PM
        
        return DOCK_OPEN_HOUR <= hour < DOCK_CLOSE_HOUR
    except Exception as e:
        log.error(f"Error checking dock working hours: {e}")
        # Default to True in case of error to ensure imports still happen
        return True

# --- New Helper Functions ---

# Removed local get_building_types and get_resource_types, will use helpers

def get_polygons_data() -> Optional[Dict]:
    """Fetches polygon data from the /api/get-polygons endpoint."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        url = f"{api_base_url}/api/get-polygons"
        log.info(f"Fetching polygon data from API: {url}")
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            log.info(f"Successfully fetched polygon data (version: {data.get('version')}).")
            polygons_list = data.get("polygons")
            if isinstance(polygons_list, list):
                # Transform the list of polygon objects into a dictionary keyed by polygon ID (LandId)
                polygons_dict = {
                    poly.get('id'): poly 
                    for poly in polygons_list 
                    if poly and isinstance(poly, dict) and poly.get('id')
                }
                log.info(f"Transformed polygon list into a dictionary with {len(polygons_dict)} entries.")
                return polygons_dict
            else:
                log.warning(f"Polygons data from API is not a list as expected. Received: {type(polygons_list)}")
                return {} # Return empty dict if structure is not as expected
        else:
            log.error(f"API error when fetching polygons: {data.get('error', 'Unknown error')}")
            return None
    except requests.exceptions.RequestException as e:
        log.error(f"Request exception fetching polygon data: {e}")
        return None
    except json.JSONDecodeError as e:
        log.error(f"JSON decode error fetching polygon data: {e}")
        return None

def get_public_docks(tables: Dict[str, Table]) -> List[Dict]:
    """Fetches all buildings of type 'public_dock'."""
    try:
        formula = "{Type} = 'public_dock'"
        docks = tables['buildings'].all(formula=formula)
        log.info(f"Found {len(docks)} public_dock buildings.")
        return docks
    except Exception as e:
        log.error(f"Error fetching public_docks: {e}")
        return []

def select_best_dock(docks: List[Dict]) -> Optional[Dict]:
    """Selects the public_dock with the highest 'Wages'."""
    if not docks:
        return None
    
    best_dock = None
    max_wages = -1.0 

    for dock in docks:
        wages = float(dock['fields'].get('Wages', 0) or 0) # Ensure wages is float, default to 0
        if wages > max_wages:
            max_wages = wages
            best_dock = dock
            
    if best_dock:
        log.info(f"Selected best public_dock: {best_dock['fields'].get('BuildingId', best_dock['id'])} with Wages: {max_wages}")
    else:
        # If no dock has wages > 0, pick the first one as a fallback
        best_dock = docks[0] if docks else None
        if best_dock:
            log.warning(f"No public_dock with positive wages found. Fallback to first dock: {best_dock['fields'].get('BuildingId', best_dock['id'])}")
        else:
            log.warning("No public_docks found to select from.")
            
    return best_dock

# Removed get_building_types() and get_resource_types() local definitions.
# They are now imported from activity_helpers as get_building_types_from_api and get_resource_types_from_api.

def get_dock_canal_point_data(dock_record: Dict, polygons_data: Dict) -> Optional[Dict]:
    """Extracts the full canalPoint object for a given dock using polygon data."""
    if not dock_record or not polygons_data:
        return None
        
    dock_building_id = dock_record['fields'].get('BuildingId') # This is the nodeID for canalPoints
    dock_land_id = dock_record['fields'].get('LandId') # LandId of the dock

    if not dock_building_id or not dock_land_id:
        log.warning(f"Dock {dock_record.get('id')} is missing BuildingId or LandId.")
        return None

    land_polygon_data = polygons_data.get(dock_land_id)
    if not land_polygon_data:
        log.warning(f"No polygon data found for LandId: {dock_land_id}")
        return None
        
    canal_points_list = land_polygon_data.get('canalPoints', [])
    if isinstance(canal_points_list, list):
        for point_data in canal_points_list:
            if isinstance(point_data, dict) and point_data.get('id') == dock_building_id:
                # Validate that the point_data contains 'edge' and 'water' with lat/lng
                if (isinstance(point_data.get('edge'), dict) and 
                    'lat' in point_data['edge'] and 'lng' in point_data['edge'] and
                    isinstance(point_data.get('water'), dict) and 
                    'lat' in point_data['water'] and 'lng' in point_data['water']):
                    log.info(f"Found valid canalPoint data for dock {dock_building_id}: {point_data}")
                    return point_data
                else:
                    log.warning(f"CanalPoint data for dock {dock_building_id} is missing or has invalid edge/water structure: {point_data}")
                    return None # Invalid structure
        log.warning(f"No matching canalPoint data found for dock BuildingId: {dock_building_id} on LandId: {dock_land_id}")
        return None
    else:
        log.warning(f"canalPoints for LandId {dock_land_id} is not a list as expected. Type: {type(canal_points_list)}")
        return None

def create_or_get_merchant_galley(
    tables: Dict[str, Table], 
    galley_building_id: str, 
    dock_canal_point: Dict[str, Any], # Changed from position_coords to the full canalPoint object
    merchant_username: str,
    current_venice_time: datetime, # Added current_venice_time
    dry_run: bool = False
) -> Optional[Dict]:
    """Creates or gets the temporary merchant galley building, owned by the specified merchant."""
    formula = f"{{BuildingId}} = '{_escape_airtable_value(galley_building_id)}'"
    try:
        existing_galleys_by_building_id = tables['buildings'].all(formula=formula, max_records=1)
        if existing_galleys_by_building_id:
            log.info(f"Found existing merchant_galley by BuildingId: {galley_building_id}")
            # This galley already exists with the correct BuildingId. Its Point should also match.
            return existing_galleys_by_building_id[0]

        # If no building with this BuildingId exists, check if any OTHER building is using this Point.
        # The galley_building_id is what we intend to use for BOTH BuildingId and Point of the new galley.
        point_occupancy_formula = f"{{Point}} = '{_escape_airtable_value(galley_building_id)}'"
        buildings_at_this_point = tables['buildings'].all(formula=point_occupancy_formula, max_records=1)
        if buildings_at_this_point:
            # A building (which is NOT our target galley because it wasn't found by BuildingId)
            # is already using this Point string. This is a conflict.
            occupying_building_id = buildings_at_this_point[0]['fields'].get('BuildingId', buildings_at_this_point[0]['id'])
            log.warning(f"{LogColors.WARNING}Point '{galley_building_id}' is already occupied by another building (BuildingId: {occupying_building_id}). Cannot create new galley here.{LogColors.ENDC}")
            return None # Indicate failure to create/get due to point conflict

        # If we reach here, no building has this BuildingId, and no other building has this Point. Safe to create.
        # Extract water coordinates for position and ID construction
        water_coords = dock_canal_point.get('water', {})
        position_coords_for_galley = {'lat': float(water_coords.get('lat',0)), 'lng': float(water_coords.get('lng',0))}

        if dry_run:
            log.info(f"[DRY RUN] Would create merchant_galley: {galley_building_id} at {position_coords_for_galley}")
            return {
                "id": "dry_run_galley_airtable_id",
                "fields": {
                    "BuildingId": galley_building_id,
                    "Type": "merchant_galley",
                    "Owner": merchant_username,
                    "RunBy": merchant_username,
                    "Point": galley_building_id,
                    "Rotation": 0 # Placeholder rotation for dry run
                }
            }
        
        # Calculate rotation
        rotation_rad = 0.0 # Default rotation
        edge_coords = dock_canal_point.get('edge')
        if edge_coords and water_coords:
            try:
                edge_lat, edge_lng = float(edge_coords['lat']), float(edge_coords['lng'])
                water_lat, water_lng = float(water_coords['lat']), float(water_coords['lng'])
                
                delta_y = water_lat - edge_lat
                delta_x = water_lng - edge_lng
                
                if delta_x == 0 and delta_y == 0: # Points are identical, no specific orientation
                    rotation_rad = 0.0
                else:
                    angle_to_water = math.atan2(delta_y, delta_x)
                    rotation_rad = angle_to_water + (math.pi / 2) # Perpendicular
                    # Normalize to [0, 2*pi) if needed, though atan2 range is [-pi, pi]
                    # rotation_rad = rotation_rad % (2 * math.pi) 
                    # if rotation_rad < 0: rotation_rad += (2 * math.pi)
                log.info(f"Calculated rotation for galley {galley_building_id}: {rotation_rad:.4f} radians.")
            except (TypeError, ValueError) as e_rot:
                log.warning(f"Could not calculate rotation for galley {galley_building_id} due to coordinate error: {e_rot}. Defaulting to 0.")
                rotation_rad = 0.0
        else:
            log.warning(f"Missing edge or water coordinates in dock_canal_point for galley {galley_building_id}. Defaulting rotation to 0.")


        galley_payload = {
            "BuildingId": galley_building_id,
            "Type": "merchant_galley",
            "Owner": merchant_username,
            "RunBy": merchant_username,
            "Occupant": merchant_username, # Set Occupant to the merchant
            "Point": galley_building_id, 
            "Position": json.dumps(position_coords_for_galley), # Store explicit position
            "Rotation": rotation_rad, # Store calculated rotation
            "Category": "transport",
            "CreatedAt": current_venice_time.isoformat(), # Use passed current_venice_time
            "IsConstructed": False,
            "ConstructionDate": None,
        }
        created_galley = tables['buildings'].create(galley_payload)
        log.info(f"{LogColors.OKGREEN}Created new merchant_galley: {galley_building_id} (Airtable ID: {created_galley['id']}) with Rotation: {rotation_rad:.4f}{LogColors.ENDC}")
        return created_galley
    except Exception as e:
        log.error(f"Error creating/getting merchant_galley {galley_building_id}: {e}")
        return None

def get_citizen_record(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    """Fetches a citizen record by username."""
    formula = f"{{Username}} = '{_escape_airtable_value(username)}'"
    try:
        records = tables['citizens'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching citizen record for {username}: {e}")
        return None

def select_import_merchant(tables: Dict[str, Table]) -> Optional[Dict]:
    """Selects an available AI merchant (Forestieri, Ducats > 1M) for an import operation."""
    log.info("Selecting an import merchant...")
    try:
        # Assuming IsAI is a boolean field (1 for true)
        # Ensure only Forestieri are selected for this role.
        formula = "AND({SocialClass}='Forestieri', {Ducats}>1000000, {IsAI}=1)"
        potential_merchants = tables['citizens'].all(formula=formula)
        
        if not potential_merchants:
            log.warning("No suitable AI merchants (Forestieri, Ducats > 1M) found.")
            return None
        
        # Simple selection: random. Could be more sophisticated (e.g., least busy).
        selected_merchant = random.choice(potential_merchants)
        merchant_username = selected_merchant['fields'].get('Username')
        log.info(f"{LogColors.OKGREEN}Selected merchant {merchant_username} for import operation.{LogColors.ENDC}")
        return selected_merchant
    except Exception as e:
        log.error(f"Error selecting import merchant: {e}")
        return None

def select_delivery_forestiero(tables: Dict[str, Table]) -> Optional[Dict]:
    """Selects an available AI Forestieri citizen not currently in Venice for a delivery task."""
    log.info("Selecting an AI Forestieri for delivery task...")
    try:
        # Find AI Forestieri not currently in Venice
        formula = "AND({SocialClass}='Forestieri', {IsAI}=1, OR({InVenice}=FALSE(), {InVenice}=BLANK()))"
        potential_citizens = tables['citizens'].all(formula=formula)
        
        if not potential_citizens:
            log.warning("No suitable AI Forestieri (not in Venice) found for delivery task.")
            return None
        
        # Simple selection: random.
        selected_citizen = random.choice(potential_citizens)
        citizen_username = selected_citizen['fields'].get('Username')
        log.info(f"{LogColors.OKGREEN}Selected Forestieri {citizen_username} for delivery task.{LogColors.ENDC}")
        return selected_citizen
    except Exception as e:
        log.error(f"Error selecting delivery Forestieri: {e}")
        return None

# --- End of New Helper Functions ---

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        # session = requests.Session() # Removed custom session
        # session.trust_env = False    # Removed custom session configuration
        api = Api(api_key) # Let Api manage its own session
        # api.session = session # Removed custom session assignment

        tables = {
            'contracts': api.table(base_id, 'CONTRACTS'),
            'resources': api.table(base_id, 'RESOURCES'),
            'citizens': api.table(base_id, 'CITIZENS'),
            'buildings': api.table(base_id, 'BUILDINGS'),
            'transactions': api.table(base_id, 'TRANSACTIONS'),
            'activities': api.table(base_id, 'ACTIVITIES'),
            'relationships': api.table(base_id, 'RELATIONSHIPS') # Ajout de la table RELATIONSHIPS
        }

        # Test connection with one primary table (e.g., citizens)
        log.info("Testing Airtable connection by fetching one record from CITIZENS table...")
        try:
            tables['citizens'].all(max_records=1)
            log.info("Airtable connection successful.")
        except Exception as conn_e:
            log.error(f"Airtable connection test failed for CITIZENS table: {conn_e}")
            raise conn_e
        
        return tables
    except Exception as e:
        log.error(f"Failed to initialize Airtable or connection test failed: {e}")
        sys.exit(1)

def get_active_contracts(tables: Dict[str, Table], current_venice_time: datetime) -> List[Dict]:
    """Get all active import contracts awaiting merchant assignment (Seller is NULL), ordered by CreatedAt, based on provided Venice time."""
    try:
        now_iso_venice = current_venice_time.isoformat()
        
        # Query all active import contracts, regardless of current Seller
        formula = f"AND({{CreatedAt}}<='{now_iso_venice}', {{EndAt}}>='{now_iso_venice}', {{Type}}='import')"
        contracts = tables['contracts'].all(formula=formula)
        
        # Sort by CreatedAt
        contracts.sort(key=lambda x: x['fields'].get('CreatedAt', ''))
        
        log.info(f"Found {len(contracts)} active import contracts (any seller).")
        return contracts
    except Exception as e:
        log.error(f"Error getting active import contracts: {e}")
        return []

def get_building_types() -> Dict:
    """Get building types information from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/building-types"
        
        log.info(f"Fetching building types from API: {url}")
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and "buildingTypes" in data:
                building_types = data["buildingTypes"]
                log.info(f"Successfully fetched {len(building_types)} building types from API")
                
                # Transform the data into a dictionary keyed by building type
                building_defs = {}
                for building in building_types:
                    if "type" in building:
                        building_defs[building["type"]] = building
                
                return building_defs
            else:
                log.error(f"Unexpected API response format: {data}")
                return {}
        else:
            log.error(f"Error fetching building types from API: {response.status_code} - {response.text}")
            return {}
    except Exception as e:
        log.error(f"Exception fetching building types from API: {str(e)}")
        return {}

def get_resource_types() -> Dict:
    """Get resource types information from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/resource-types"
        
        log.info(f"Fetching resource types from API: {url}")
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and "resourceTypes" in data:
                resource_types = data["resourceTypes"]
                log.info(f"Successfully fetched {len(resource_types)} resource types from API")
                
                # Transform the data into a dictionary keyed by resource id
                resource_defs = {}
                for resource in resource_types:
                    if "id" in resource:
                        resource_defs[resource["id"]] = resource
                
                return resource_defs
            else:
                log.error(f"Unexpected API response format: {data}")
                return {}
        else:
            log.error(f"Error fetching resource types from API: {response.status_code} - {response.text}")
            return {}
    except Exception as e:
        log.error(f"Exception fetching resource types from API: {str(e)}")
        return {}

def get_building_resources(tables, building_id: str) -> List[Dict]:
    """Get all resources stored in a specific building."""
    try:
        # Resources associated with a building now use Asset and AssetType
        escaped_building_id = _escape_airtable_value(building_id)
        formula = f"AND({{Asset}}='{escaped_building_id}', {{AssetType}}='building')"
        resources = tables['resources'].all(formula=formula)
        log.info(f"Found {len(resources)} resources in building {building_id} (via Asset/AssetType)")
        return resources
    except Exception as e:
        log.error(f"Error getting resources for building {building_id}: {e}")
        return []

def get_building_current_storage(tables: Dict[str, Table], building_custom_id: str) -> float:
    """Calculates the total count of resources currently in a building."""
    formula = f"AND({{Asset}} = '{_escape_airtable_value(building_custom_id)}', {{AssetType}} = 'building')"
    total_stored_volume = 0
    try:
        resources_in_building = tables['resources'].all(formula=formula)
        for resource in resources_in_building:
            total_stored_volume += float(resource['fields'].get('Count', 0))
        log.info(f"Building {building_custom_id} currently stores {total_stored_volume} units of resources.")
    except Exception as e:
        log.error(f"Error calculating current storage for building {building_custom_id}: {e}")
    return total_stored_volume
    
def get_citizen_balance(tables, username: str) -> float:
    """Get the compute balance for a citizen."""
    try:
        formula = f"{{Username}}='{username}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if citizens:
            balance = citizens[0]['fields'].get('Ducats', 0)
            log.info(f"👤 Citizen **{username}** has balance: **{balance:,.2f}** ducats")
            return float(balance)
        else:
            log.warning(f"Citizen {username} not found")
            return 0
    except Exception as e:
        log.error(f"Error getting balance for citizen {username}: {e}")
        return 0

def get_building_info(tables, building_id: str) -> Optional[Dict]:
    """Get information about a specific building."""
    try:
        formula = f"{{BuildingId}}='{building_id}'"
        buildings = tables['buildings'].all(formula=formula)
        
        if buildings:
            log.info(f"Found building {building_id}")
            return buildings[0]
        else:
            log.warning(f"Building {building_id} not found")
            return None
    except Exception as e:
        log.error(f"Error getting building {building_id}: {e}")
        return None

def create_delivery_activity(tables, citizen: Dict, galley_building_id: str,
                             resources_in_galley_manifest: List[Dict[str, Any]],
                             original_contract_ids: List[str],
                             current_venice_time: datetime, # Added current_venice_time
                             start_position_override: Optional[Dict[str, float]] = None) -> Optional[Dict]:
    """Create a single delivery activity for the merchant galley."""
    if not resources_in_galley_manifest or not galley_building_id:
        log.warning(f"No resources or galley_building_id to create activity for galley {galley_building_id}")
        return None

    resource_summary = ", ".join([f"{r['Amount']:.1f} {r['ResourceId']}" for r in resources_in_galley_manifest])
    log.info(f"Creating delivery activity for galley {galley_building_id} with resources: {resource_summary}")

    try:
        citizen_username = citizen['fields'].get('Username')
        if not citizen_username:
            log.error("Missing Username in citizen record for galley delivery activity")
            return None

        # Use provided start_position_override or default
        start_position = start_position_override if start_position_override else {"lat": 45.40, "lng": 12.45}
        log.info(f"Galley delivery activity for {galley_building_id} will use start_position: {start_position}")
        
        galley_building_record = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(galley_building_id)}'", max_records=1)
        if not galley_building_record:
            log.error(f"Galley building {galley_building_id} not found for activity.")
            return None
        
        # Merchant galleys store their location in the 'Point' field as "water_lat_lng"
        point_str = galley_building_record[0]['fields'].get('Point')
        end_position = None
        if point_str and isinstance(point_str, str) and point_str.startswith("water_"):
            parts = point_str.split('_')
            # The format can be water_lat_lng_variationCounter, so parts[1] is lat, parts[2] is lng
            if len(parts) >= 3: 
                try:
                    lat = float(parts[1])
                    lng = float(parts[2])
                    end_position = {"lat": lat, "lng": lng}
                    log.info(f"Parsed end_position {end_position} from Point field '{point_str}' for galley {galley_building_id}.")
                except ValueError:
                    log.error(f"Could not parse lat/lng from Point field '{point_str}' for galley {galley_building_id}.")
            else:
                log.error(f"Point field '{point_str}' for galley {galley_building_id} not in expected water_lat_lng format.")
        else:
            log.error(f"Galley building {galley_building_id} has no valid 'Point' data (expected 'water_lat_lng' format). Point field value: {point_str}")
            return None
        
        if not end_position: # Should be redundant if logic above is correct, but as a safeguard
            log.error(f"Failed to determine end_position for galley {galley_building_id}.")
            return None

        path_data = None
        try:
            api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
            url = f"{api_base_url}/api/transport"
            # Pathfinding mode for ships might be 'water_only' or a specific mode for ships
            response = requests.post(
                url,
                json={
                    "startPoint": start_position, "endPoint": end_position,
                    "startDate": current_venice_time.isoformat(), # Use passed current_venice_time
                    "pathfindingMode": "water_only" # Explicitly use water_only for ship
                }
            )
            if response.status_code == 200:
                path_data = response.json()
                if not path_data.get('success'): 
                    log.warning(f"Transport API call for galley path was not successful: {path_data.get('error')}")
                    path_data = None
            else:
                log.warning(f"Transport API error for galley path: {response.status_code} - {response.text}")
        except Exception as e_api:
            log.error(f"Error calling transport API for galley path: {e_api}")

        if not path_data or not path_data.get('path'):
            log.warning(f"Path finding for galley to {galley_building_id} failed. Creating simple path.")
            path_data = {
                "path": [start_position, end_position], # Simple straight line
                "timing": {"startDate": current_venice_time.isoformat(), # Use passed current_venice_time
                           "endDate": (current_venice_time + timedelta(hours=2)).isoformat(), # Assume 2 hours for simple path
                           "durationSeconds": 7200}
            }

        # Use duration from path_data if available, otherwise default
        travel_duration_seconds = path_data['timing'].get('durationSeconds', 7200) # Default 2 hours
        end_time_venice_activity = current_venice_time + timedelta(seconds=travel_duration_seconds) # Use passed current_venice_time
        
        activity_id_str = f"import_galley_delivery_{galley_building_id}_{uuid.uuid4()}"
        
        # Use the first original contract's string ID for the ContractId field for reference
        primary_original_contract_id_str = original_contract_ids[0] if original_contract_ids else None

        # Prepare and potentially truncate Path JSON
        path_list_for_json = path_data.get('path', [])
        path_json_string = json.dumps(path_list_for_json)
        MAX_PATH_LENGTH = 90000 # Airtable long text field limit is around 100k

        if len(path_json_string) > MAX_PATH_LENGTH:
            log.warning(f"Path JSON string for activity to {galley_building_id} is too long ({len(path_json_string)} chars). Attempting to truncate.")
            # Truncate by removing points from the middle to preserve start and end
            temp_path_list = list(path_list_for_json) # Work on a copy
            while len(json.dumps(temp_path_list)) > MAX_PATH_LENGTH and len(temp_path_list) > 2:
                temp_path_list.pop(len(temp_path_list) // 2)
            path_json_string = json.dumps(temp_path_list)
            
            if len(path_json_string) > MAX_PATH_LENGTH: # If still too long
                log.error(f"Path for activity to {galley_building_id} still too long ({len(path_json_string)} chars) after attempting to truncate points. Storing empty path as last resort.")
                path_json_string = json.dumps([]) 
        
        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "deliver_resource_batch", 
            "Citizen": citizen_username,
            "ContractId": primary_original_contract_id_str, 
            "ToBuilding": galley_building_id, # Target is the galley itself
            "Resources": json.dumps(resources_in_galley_manifest), 
            "TransportMode": "merchant_galley",
            "CreatedAt": current_venice_time.isoformat(), # Use passed current_venice_time
            "StartDate": path_data['timing'].get('startDate', current_venice_time.isoformat()), # Use start date from path if available
            "EndDate": path_data['timing'].get('endDate', end_time_venice_activity.isoformat()),   # Use end date from path if available
            "Path": path_json_string, # Use potentially truncated path_json_string
            "Status": "created", # Set status to created
            "Notes": f"🚢 Piloting merchant galley with imported resources ({resource_summary}) to {galley_building_id}. Original Contract IDs: {', '.join(original_contract_ids)}"
        }
        
        activity = tables['activities'].create(activity_payload)
        log.info(f"{LogColors.OKGREEN}🚢 Created galley delivery activity: **{activity['id']}** to galley building {galley_building_id}{LogColors.ENDC}")
        return activity
    except Exception as e:
        log.error(f"Error creating galley delivery activity for {galley_building_id}: {e}")
        return None # Return None on error

def process_imports(dry_run: bool = False, night_mode: bool = False, forced_hour_override: Optional[int] = None):
    """Main function to process import contracts."""
    log_header(f"Import Processing (dry_run={dry_run}, night_mode={night_mode}, forced_hour={forced_hour_override})", LogColors.HEADER)

    # Determine current Venice time, potentially overridden
    now_venice_dt_real = datetime.now(VENICE_TIMEZONE)
    if forced_hour_override is not None:
        log.info(f"{LogColors.WARNING}Overriding current Venice hour to {forced_hour_override} due to --hour argument. Minutes/seconds will be from real time.{LogColors.ENDC}")
        now_venice_dt = now_venice_dt_real.replace(hour=forced_hour_override)
    else:
        now_venice_dt = now_venice_dt_real
    
    log.info(f"Effective Venice time for this run: {now_venice_dt.isoformat()}")

    # Check if it's within dock working hours, unless night_mode is enabled
    if not night_mode and not is_dock_working_hours(now_venice_dt): # Pass now_venice_dt
        log.info("🌙 Outside of dock working hours (**6 AM - 6 PM** Venice time). Skipping import processing.")
        return
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # The 'activities' table is already initialized correctly in initialize_airtable().
    # This fallback is redundant and uses a deprecated pattern.
    # if 'activities' not in tables:
    #     tables['activities'] = Table(os.environ.get('AIRTABLE_API_KEY'), 
    #                                 os.environ.get('AIRTABLE_BASE_ID'), 
    #                                 'ACTIVITIES')
    
    # Get building types information
    building_types = get_building_types_from_api() # Use helper
    if not building_types:
        log.error("Failed to get building types, exiting")
        return
    
    # Get resource types information
    resource_types = get_resource_types_from_api() # Use helper
    if not resource_types:
        log.error("Failed to get resource types, exiting")
        return

    # Get polygon data for dock water points
    polygons_data = get_polygons_data()
    if not polygons_data:
        log.error("Failed to get polygon data, exiting.")
        return

    # Fetch existing merchant galleys and parse their positions
    existing_galleys_records = get_existing_merchant_galleys(tables)
    existing_galley_positions = []
    for galley_rec in existing_galleys_records:
        pos_str = galley_rec['fields'].get('Position')
        if pos_str:
            try:
                pos_json = json.loads(pos_str)
                if isinstance(pos_json, dict) and 'lat' in pos_json and 'lng' in pos_json:
                    existing_galley_positions.append({'lat': float(pos_json['lat']), 'lng': float(pos_json['lng'])})
            except (json.JSONDecodeError, TypeError, ValueError) as e_parse:
                log.warning(f"Could not parse Position for existing galley {galley_rec.get('id', 'N/A')}: {pos_str}. Error: {e_parse}")

    # Get active import contracts
    all_active_import_contracts_master_list = get_active_contracts(tables, now_venice_dt) # Pass now_venice_dt
    if not all_active_import_contracts_master_list:
        log.info("No active import contracts found, exiting.")
        return

    # Sort contracts by CreatedAt to process older ones first
    all_active_import_contracts_master_list.sort(key=lambda x: x['fields'].get('CreatedAt', ''))
    
    deferred_contract_ids_this_run = set() # Track contracts deferred in this run due to buyer funds

    available_public_docks = get_public_docks(tables)
    if not available_public_docks:
        log.error("No public_docks found. Cannot determine galley location. Exiting.")
        return
    
    # Shuffle docks to vary selection if multiple are "best" or equally good
    random.shuffle(available_public_docks)
    
    # Keep track of used docks in this run to avoid reusing the same one immediately
    used_dock_ids_this_run = set()
    galley_departure_point_variation_counter = 0

    while all_active_import_contracts_master_list:
        # log.info(f"--- Starting new galley batch. {len(all_active_import_contracts_master_list)} contracts remaining. ---")

        # Dock selection logic with proximity check
        current_best_dock = None
        selected_dock_canal_point = None
        
        # Prepare a list of docks to try, not yet used or marked as too close in this run
        potential_docks_for_batch = [d for d in available_public_docks if d['id'] not in used_dock_ids_this_run]

        if not potential_docks_for_batch:
            log.info("All available docks tried or deemed too close in this run. Resetting used docks list.")
            used_dock_ids_this_run.clear()
            potential_docks_for_batch = list(available_public_docks) # Try all again

        # Sort potential docks by Wages (descending) to try "better" ones first
        potential_docks_for_batch.sort(key=lambda d: float(d['fields'].get('Wages', 0) or 0), reverse=True)

        for candidate_dock in potential_docks_for_batch:
            dock_canal_point_object_candidate = get_dock_canal_point_data(candidate_dock, polygons_data)
            
            if not dock_canal_point_object_candidate or not dock_canal_point_object_candidate.get('water'):
                log.warning(f"Dock {candidate_dock['id']} has no valid water point data. Marking as tried.")
                used_dock_ids_this_run.add(candidate_dock['id'])
                continue

            dock_water_coords = dock_canal_point_object_candidate['water']
            is_too_close = False
            for galley_pos in existing_galley_positions:
                try:
                    distance = calculate_haversine_distance_meters(float(dock_water_coords['lat']), float(dock_water_coords['lng']), 
                                                                   float(galley_pos['lat']), float(galley_pos['lng']))
                    if distance < 100: # 100 meters proximity threshold
                        # log.info(f"Dock {candidate_dock['id']} water point ({dock_water_coords['lat']},{dock_water_coords['lng']}) is too close ({distance:.2f}m) to an existing galley at ({galley_pos['lat']},{galley_pos['lng']}).")
                        is_too_close = True
                        break
                except (TypeError, ValueError) as e_dist:
                    log.warning(f"Could not calculate distance for dock {candidate_dock['id']} water point or galley_pos {galley_pos}. Error: {e_dist}")
                    is_too_close = True # Treat as too close if error
                    break
            
            if not is_too_close:
                current_best_dock = candidate_dock
                selected_dock_canal_point = dock_canal_point_object_candidate
                log.info(f"Selected dock {current_best_dock['fields'].get('BuildingId', current_best_dock['id'])} for current galley batch.")
                break # Found a suitable dock
            else:
                used_dock_ids_this_run.add(candidate_dock['id']) # Mark as tried and too close

        if not current_best_dock or not selected_dock_canal_point:
            log.error("Could not select a suitable public_dock (not too close to existing galleys) for the current batch. Exiting import processing for this run.")
            break # Exit the main while loop, no suitable dock found for any more batches

        used_dock_ids_this_run.add(current_best_dock['id']) # Mark the chosen dock as used for this run
        
        # Use the validated selected_dock_canal_point for galley_building_id generation
        galley_water_coords_for_id = selected_dock_canal_point['water']
        galley_building_id = f"water_{galley_water_coords_for_id['lat']}_{galley_water_coords_for_id['lng']}_{galley_departure_point_variation_counter}"

        # Select a merchant for this import operation
        # This merchant is the owner of the galley and resources within it.
        galley_owner_merchant_record = select_import_merchant(tables) # This selects a wealthy Forestieri AI
        if not galley_owner_merchant_record:
            log.error("No available AI merchant (Forestieri, >1M Ducats) to own the galley and its resources for this batch. Exiting.")
            break
        galley_owner_username = galley_owner_merchant_record['fields'].get('Username')

        # Create or get the merchant galley building, owned by the selected merchant
        # Pass the full selected_dock_canal_point to create_or_get_merchant_galley
        merchant_galley_building = create_or_get_merchant_galley(tables, galley_building_id, selected_dock_canal_point, galley_owner_username, now_venice_dt, dry_run) # Pass now_venice_dt
        if not merchant_galley_building:
            log.error(f"Failed to create/get merchant galley {galley_building_id} for merchant {galley_owner_username} (possibly point occupied or other error). Skipping batch.")
            galley_departure_point_variation_counter +=1 # Increment to try a new point variation next time
            continue # Try next batch with potentially different merchant/dock OR different variation counter

        galley_capacity = 1000.0
        galley_def = building_types.get("merchant_galley", {})
        if galley_def and galley_def.get('productionInformation') and 'storageCapacity' in galley_def['productionInformation']:
            galley_capacity = float(galley_def['productionInformation']['storageCapacity'])
        log.info(f"Merchant galley {galley_building_id} capacity: {galley_capacity}")

        batched_resources_for_galley: List[Dict[str, Any]] = []
        final_galley_manifest_for_activity: List[Dict[str, Any]] = []
        involved_original_contracts_info: List[Dict[str, Any]] = []
        current_galley_load = 0.0
        processed_contract_airtable_ids_for_this_batch = set()
        contracts_for_next_iteration = []

        for contract_record in all_active_import_contracts_master_list:
            if current_galley_load >= galley_capacity:
                contracts_for_next_iteration.append(contract_record) # Save for next galley
                continue

            fields = contract_record['fields']
            contract_airtable_id = contract_record['id']
            contract_custom_id = fields.get('ContractId', contract_airtable_id)
            buyer_username = fields.get('Buyer')
            resource_type = fields.get('ResourceType')
            target_amount = float(fields.get('TargetAmount', 0))
            price_per_resource = float(fields.get('PricePerResource', 0))
            original_buyer_building_id = fields.get('BuyerBuilding')

            if not all([buyer_username, resource_type, original_buyer_building_id]) or target_amount <= 0 or price_per_resource < 0:
                log.warning(f"Contract {contract_custom_id} has invalid data. Skipping.")
                continue # This contract is problematic, don't add to next iteration either

            amount_to_take_from_contract = target_amount
            if current_galley_load + target_amount > galley_capacity:
                amount_to_take_from_contract = galley_capacity - current_galley_load
            
            if amount_to_take_from_contract <= 0.001:
                contracts_for_next_iteration.append(contract_record) # No space, save for next galley
                continue

            cost_for_this_part = price_per_resource * amount_to_take_from_contract
            buyer_balance = get_citizen_balance(tables, buyer_username)
            if buyer_balance < cost_for_this_part:
                if contract_airtable_id in deferred_contract_ids_this_run:
                    log.warning(f"Buyer {buyer_username} (Balance: {buyer_balance:,.2f}) still insufficient for contract {contract_custom_id} (Cost: {cost_for_this_part:.2f}). Contract previously deferred. Dropping for this script run.")
                    # Do NOT add to contracts_for_next_iteration to prevent infinite loop
                else:
                    log.warning(f"Buyer {buyer_username} (Balance: {buyer_balance:,.2f}) insufficient for contract {contract_custom_id} part (Cost: {cost_for_this_part:.2f}). Saving for later this run.")
                    contracts_for_next_iteration.append(contract_record) # Save for next galley (buyer might get funds)
                    deferred_contract_ids_this_run.add(contract_airtable_id)
                continue # to next contract in the current batch

            current_galley_load += amount_to_take_from_contract
            processed_contract_airtable_ids_for_this_batch.add(contract_airtable_id)
            involved_original_contracts_info.append({
                'contract_id': contract_custom_id, 'buyer': buyer_username, 'resource_type': resource_type,
                'amount': amount_to_take_from_contract, 'cost': cost_for_this_part,
                'original_buyer_building': original_buyer_building_id
            })

            found_in_batch = False
            for item in batched_resources_for_galley:
                if item['Type'] == resource_type:
                    item['Amount'] += amount_to_take_from_contract
                    found_in_batch = True; break
            if not found_in_batch:
                batched_resources_for_galley.append({'Type': resource_type, 'Amount': amount_to_take_from_contract})
        
        all_active_import_contracts_master_list = contracts_for_next_iteration # Update list for next loop

        if not involved_original_contracts_info:
            log.info(f"No contracts processed for galley {galley_building_id} in this batch. Moving to next batch or finishing.")
            if not all_active_import_contracts_master_list: # If no more contracts for future batches
                break # Exit the while loop
            else:
                galley_departure_point_variation_counter +=1 # Increment for next potential galley
                continue # Try to form another batch

        final_galley_manifest_for_activity = [{'ResourceId': item['Type'], 'Amount': item['Amount']} for item in batched_resources_for_galley]
        # log.info(f"Galley {galley_building_id} batch: {len(batched_resources_for_galley)} types, volume: {current_galley_load:.2f}. {len(involved_original_contracts_info)} contract parts.")

        if dry_run:
            log.info(f"🧪 **[DRY RUN]** Would process import batch for galley {galley_building_id} at {selected_dock_canal_point.get('water')} (Galley Owner Merchant: {galley_owner_username}).")
            # log.info(f"  [DRY RUN] Galley manifest: {json.dumps(final_galley_manifest_for_activity)}")
            # for contract_info_dry_run in involved_original_contracts_info:
                # log.info(f"  [DRY RUN] Would update contract {contract_info_dry_run['contract_id']} with Seller={galley_owner_username}, SellerBuilding={galley_building_id}.")
            # for res_item_dry_run in batched_resources_for_galley:
                # log.info(f"  [DRY RUN] Would create/update resource {res_item_dry_run['Type']} (Amount: {res_item_dry_run['Amount']:.2f}) in galley {galley_building_id}, owned by {galley_owner_username}.")
            # log.info(f"  [DRY RUN] Would select an existing Forestieri and create one delivery activity to galley {galley_building_id}.") # Corrected log message
            galley_departure_point_variation_counter +=1
            continue # Next iteration of the while loop for dry run

        # --- Actual Operations for this Galley Batch ---
        # log.info(f"Updating {len(processed_contract_airtable_ids_for_this_batch)} original contracts for galley {galley_building_id} (Galley Owner Merchant: {galley_owner_username}).") # Corrected variable
        for contract_airtable_id_to_update in processed_contract_airtable_ids_for_this_batch:
            try:
                contract_record_for_log = tables['contracts'].get(contract_airtable_id_to_update)
                contract_custom_id_log = contract_record_for_log['fields'].get('ContractId', contract_airtable_id_to_update) if contract_record_for_log else contract_airtable_id_to_update
                update_payload_contract = {"Seller": galley_owner_username, "SellerBuilding": galley_building_id} # Corrected variable
                tables['contracts'].update(contract_airtable_id_to_update, update_payload_contract)
                # log.info(f"{LogColors.OKGREEN}Updated contract {contract_custom_id_log} (Airtable ID: {contract_airtable_id_to_update}) with Seller='{galley_owner_username}', SellerBuilding='{galley_building_id}'.{LogColors.ENDC}") # Corrected variable
            except Exception as e_update_contract:
                log.error(f"Error updating contract (Airtable ID: {contract_airtable_id_to_update}): {e_update_contract}")

        for res_item in batched_resources_for_galley:
            res_type_id, res_amount = res_item['Type'], res_item['Amount']
            res_def = resource_types.get(res_type_id, {})
            formula = f"AND({{Type}}='{_escape_airtable_value(res_type_id)}', {{Asset}}='{_escape_airtable_value(galley_building_id)}', {{AssetType}}='building', {{Owner}}='{_escape_airtable_value(galley_owner_username)}')"
            try:
                existing_galley_res = tables["resources"].all(formula=formula, max_records=1)
                if existing_galley_res:
                    tables["resources"].update(existing_galley_res[0]["id"], {"Count": res_amount})
                else:
                    new_res_payload = {
                        "ResourceId": f"resource-{uuid.uuid4()}", "Type": res_type_id, "Name": res_def.get('name', res_type_id),
                        "Asset": galley_building_id, "AssetType": "building", "Owner": galley_owner_username,
                        "Count": res_amount, "CreatedAt": now_venice_dt.isoformat() # Use now_venice_dt
                    }
                    tables["resources"].create(new_res_payload)
                # log.info(f"{LogColors.OKGREEN}Processed resource {res_type_id} (Amount: {res_amount:.2f}) in galley {galley_building_id} for merchant {galley_owner_username}.{LogColors.ENDC}")
            except Exception as e_res_galley:
                log.error(f"Error creating/updating resource {res_type_id} in galley {galley_building_id}: {e_res_galley}. This batch might be incomplete.")
                # This is a critical error for this batch, but we might continue to next batch.

        # Select an existing Forestieri to pilot the galley
        delivery_citizen = select_delivery_forestiero(tables)
        if not delivery_citizen:
            log.warning("No available Forestieri to pilot the galley for this batch. Skipping activity creation.")
            galley_departure_point_variation_counter +=1
            continue # Try next batch

        # Set the selected Forestieri to InVenice = True
        if not dry_run:
            try:
                tables['citizens'].update(delivery_citizen['id'], {"InVenice": True})
                log.info(f"{LogColors.OKGREEN}Set InVenice=True for delivery Forestieri {delivery_citizen['fields'].get('Username')}.{LogColors.ENDC}")
            except Exception as e_inv:
                log.error(f"Failed to set InVenice=True for Forestieri {delivery_citizen['fields'].get('Username')}: {e_inv}")
        else:
            log.info(f"[DRY RUN] Would set InVenice=True for delivery Forestieri {delivery_citizen['fields'].get('Username')}.")


        original_contract_custom_ids_for_notes = [info['contract_id'] for info in involved_original_contracts_info]
        
        # Define a base sea entry point, shifted slightly North and West
        # Original base: 45.40, 12.45
        # Shift North (increase lat), Shift West (decrease lng)
        base_sea_entry_lat = 45.40 + 0.01  # Shifted North: e.g., 45.41
        base_sea_entry_lng = 12.45 - 0.02  # Shifted West: e.g., 12.43

        # Generate more random offsets for departure point
        # Latitude random offset (e.g., +/- 0.015 around the new base)
        random_lat_offset = random.uniform(-0.015, 0.015)
        # Longitude random offset (e.g., +/- 0.025 around the new base, wider spread)
        random_lng_offset = random.uniform(-0.025, 0.025)
        
        current_departure_point = {
            "lat": round(base_sea_entry_lat + random_lat_offset, 6), # round to 6 decimal places
            "lng": round(base_sea_entry_lng + random_lng_offset, 6)
        }
        log.info(f"Galley {galley_building_id} will depart from randomized sea point: {current_departure_point}")
        
        activity_created = create_delivery_activity(
            tables, 
            delivery_citizen, 
            galley_building_id, 
            final_galley_manifest_for_activity, 
            original_contract_custom_ids_for_notes,
            now_venice_dt, # Pass now_venice_dt
            start_position_override=current_departure_point # Pass the randomized departure point
        )

        if activity_created:
            log.info(f"✅ Successfully created galley piloting activity {activity_created['id']} to {galley_building_id} (piloted by {delivery_citizen['fields'].get('Username')}, galley owned by {galley_owner_username}) departing from {current_departure_point}.")
            arrival_time_iso = activity_created['fields'].get('EndDate')
            if arrival_time_iso and not dry_run: # Redundant dry_run check, but safe
                update_payload_for_galley = {
                    "IsConstructed": False, "ConstructionDate": arrival_time_iso
                    # "PendingDeliveriesData" removed. The manifest is in the activity,
                    # and individual contract status will be tracked by LastExecutedAt.
                }
                try:
                    tables['buildings'].update(merchant_galley_building['id'], update_payload_for_galley)
                    log.info(f"{LogColors.OKGREEN}Updated galley {galley_building_id} with arrival data.{LogColors.ENDC}")
                except Exception as e_update_galley:
                    log.error(f"Error updating galley {galley_building_id} with arrival data: {e_update_galley}")
        else:
            log.error(f"Failed to create galley piloting activity for {galley_building_id}.")
        
        galley_departure_point_variation_counter +=1 # Increment for next galley's departure point

    log.info(f"🚢 Import processing complete. All contracts processed or remaining contracts list is empty.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process import contracts into a central galley.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--night", action="store_true", help="Process imports regardless of time of day")
    parser.add_argument(
        "--hour",
        type=int,
        choices=range(24),
        metavar="[0-23]",
        help="Force the script to operate as if it's this hour in Venice time (0-23). Date and minutes/seconds remain current."
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_imports(dry_run=args.dry_run, night_mode=args.night, forced_hour_override=args.hour)
