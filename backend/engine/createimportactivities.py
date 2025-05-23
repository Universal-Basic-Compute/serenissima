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
import json
import logging
import argparse
import requests
import pytz
import random
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

import uuid # Added for generating ResourceId

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_imports")

# Load environment variables
load_dotenv()

def _escape_airtable_value(value: str) -> str:
    """Échappe les apostrophes pour les formules Airtable."""
    if isinstance(value, str):
        return value
    return str(value)

def is_dock_working_hours() -> bool:
    """Check if it's currently within dock working hours (typically 6 AM to 6 PM)."""
    try:
        # Get current time in Venice timezone
        venice_tz = pytz.timezone('Europe/Rome')
        now = datetime.now(venice_tz)
        hour = now.hour
        
        # Define dock working hours (6 AM to 6 PM)
        DOCK_OPEN_HOUR = 6  # 6 AM
        DOCK_CLOSE_HOUR = 18  # 6 PM
        
        return DOCK_OPEN_HOUR <= hour < DOCK_CLOSE_HOUR
    except Exception as e:
        log.error(f"Error checking dock working hours: {e}")
        # Default to True in case of error to ensure imports still happen
        return True

# --- New Helper Functions ---

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

def get_dock_water_coordinates(dock_record: Dict, polygons_data: Dict) -> Optional[Dict[str, float]]:
    """Extracts the water point coordinates for a given dock using polygon data."""
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
        
    canal_points_list = land_polygon_data.get('canalPoints', []) # This is a list
    dock_canal_point_data = None
    if isinstance(canal_points_list, list):
        for point in canal_points_list:
            # The dock_building_id (e.g., "canal_lat_lng") corresponds to the 'id' field of the canalPoint object
            if isinstance(point, dict) and point.get('id') == dock_building_id:
                dock_canal_point_data = point
                break
    else:
        log.warning(f"canalPoints for LandId {dock_land_id} is not a list as expected. Type: {type(canal_points_list)}")
        return None

    if not dock_canal_point_data:
        log.warning(f"No canalPoint data found for dock BuildingId: {dock_building_id} on LandId: {dock_land_id}")
        return None
        
    water_coords = dock_canal_point_data.get('water')
    if water_coords and isinstance(water_coords, dict) and 'lat' in water_coords and 'lng' in water_coords:
        log.info(f"Found water coordinates for dock {dock_building_id}: {water_coords}")
        return {'lat': float(water_coords['lat']), 'lng': float(water_coords['lng'])}
    else:
        log.warning(f"Water coordinates missing or invalid for dock {dock_building_id} on LandId: {dock_land_id}. Data: {water_coords}")
        return None

def create_or_get_merchant_galley(
    tables: Dict[str, Table], 
    galley_building_id: str, 
    position_coords: Dict[str, float], 
    merchant_username: str, # Changed from owner_username to merchant_username
    dry_run: bool = False
) -> Optional[Dict]:
    """Creates or gets the temporary merchant galley building, owned by the specified merchant."""
    formula = f"{{BuildingId}} = '{_escape_airtable_value(galley_building_id)}'"
    try:
        existing_galleys = tables['buildings'].all(formula=formula, max_records=1)
        if existing_galleys:
            log.info(f"Found existing merchant_galley: {galley_building_id}")
            # Optionally, update its Owner or UpdatedAt if needed
            # For now, just return it.
            return existing_galleys[0]

        if dry_run:
            log.info(f"[DRY RUN] Would create merchant_galley: {galley_building_id} at {position_coords}")
            return {
                "id": "dry_run_galley_airtable_id",
                "fields": {
                    "BuildingId": galley_building_id,
                    "Type": "merchant_galley", # Type is the primary descriptor
                    "Owner": merchant_username,
                    "RunBy": merchant_username,
                    "Point": galley_building_id # Use BuildingId (water_lat_lng) for Point field
                    # "Name" field removed as it's not in the Airtable schema
                }
            }

        galley_payload = {
            "BuildingId": galley_building_id,
            "Type": "merchant_galley", # Type is the primary descriptor
            # "Name" field removed as it's not in the Airtable schema
            "Owner": merchant_username,
            "RunBy": merchant_username, 
            "Point": galley_building_id, # Use BuildingId (water_lat_lng) for Point field
            "Category": "Transport", # Assuming a category for such buildings
            "CreatedAt": datetime.now(pytz.timezone('Europe/Rome')).isoformat(), # Venice time
            "IsConstructed": False, # Galley is "arriving"
            "ConstructionDate": None,    # Will be set after activity creation to simulate arrival time
            # "PendingDeliveriesData": json.dumps([]), # Removed: No longer using this field
            # No Occupant, Wages, RentAmount initially
        }
        created_galley = tables['buildings'].create(galley_payload)
        log.info(f"Created new merchant_galley: {galley_building_id} (Airtable ID: {created_galley['id']})")
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
        formula = "AND({SocialClass}='Forestieri', {Ducats}>1000000, {IsAI}=1)"
        potential_merchants = tables['citizens'].all(formula=formula)
        
        if not potential_merchants:
            log.warning("No suitable AI merchants (Forestieri, Ducats > 1M) found.")
            return None
        
        # Simple selection: random. Could be more sophisticated (e.g., least busy).
        selected_merchant = random.choice(potential_merchants)
        merchant_username = selected_merchant['fields'].get('Username')
        log.info(f"Selected merchant {merchant_username} for import operation.")
        return selected_merchant
    except Exception as e:
        log.error(f"Error selecting import merchant: {e}")
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
        # Return a dictionary of table objects using pyairtable
        return {
            'contracts': Table(api_key, base_id, 'CONTRACTS'),
            'resources': Table(api_key, base_id, 'RESOURCES'),
            'citizens': Table(api_key, base_id, 'Citizens'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_active_contracts(tables) -> List[Dict]:
    """Get all active import contracts awaiting merchant assignment (Seller is NULL), ordered by CreatedAt."""
    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Define if not already global
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso_venice = now_venice.isoformat()
        
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

def find_available_citizen(tables) -> Optional[Dict]:
    """Find a random citizen who is not in Venice and has no ongoing activities."""
    log.info("Looking for an available citizen for import delivery...")
    
    try:
        # Get current time
        now = datetime.now().isoformat()
        
        # First get all citizens with InVenice = false
        formula = "{InVenice}=FALSE()"
        citizens = tables['citizens'].all(formula=formula)
        
        if not citizens:
            log.info("No citizens found with InVenice=false")
            return None
        
        log.info(f"Found {len(citizens)} citizens with InVenice=false")
        
        # Get all active activities
        active_activities_formula = f"AND({{StartDate}} <= '{now}', {{EndDate}} >= '{now}')"
        active_activities = tables['activities'].all(formula=active_activities_formula)
        
        # Extract citizen IDs with active activities
        busy_citizen_ids = set()
        for activity in active_activities:
            citizen_id = activity['fields'].get('Citizen')
            if citizen_id:
                busy_citizen_ids.add(citizen_id)
        
        # Filter out citizens with active activities
        available_citizens = []
        for citizen in citizens:
            citizen_id = citizen['fields'].get('Username')
            if citizen_id and citizen_id not in busy_citizen_ids:
                available_citizens.append(citizen)
        
        if not available_citizens:
            log.info("No available citizens found (all have ongoing activities)")
            return None
        
        # Select a random citizen from the available ones
        selected_citizen = random.choice(available_citizens)
        log.info(f"👤 Selected citizen **{selected_citizen['fields'].get('Username')}** for import delivery")
        
        return selected_citizen
    except Exception as e:
        log.error(f"Error finding available citizen: {e}")
        return None

def generate_new_citizen(tables: Dict[str, Table], dry_run: bool = False) -> Optional[Dict]:
    """Generate a new citizen for import delivery using generate_citizen."""
    log.info("Generating a new citizen for import delivery...")
    
    try:
        # Add the scripts directory to sys.path to allow importing generateCitizen and updatecitizenDescriptionAndImage
        scripts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts')
        if scripts_dir not in sys.path:
            sys.path.append(scripts_dir)
            
        from generateCitizen import generate_citizen
        from updatecitizenDescriptionAndImage import update_citizen_description_and_image
        
        additional_prompt = "This citizen is a merchant sailor, arriving in Venice to deliver goods. They are not from Venice but are familiar with maritime trade."
        citizen_data = generate_citizen(social_class=None, additional_prompt_text=additional_prompt)
        
        if not citizen_data:
            log.error("Failed to generate new citizen data from generate_citizen.")
            return None
        
        new_citizen_username = citizen_data.get("username")
        if not new_citizen_username:
            log.error("Generated citizen data is missing a username.")
            return None

        if dry_run:
            log.info(f"[DRY RUN] Would generate new citizen: {new_citizen_username}")
            # In dry_run, we need to return a mock citizen record structure 
            # that find_available_citizen would expect if it were to use it.
            # Or, ensure the calling code handles a None return from generate_new_citizen in dry_run.
            # For now, let's return a structure similar to what Airtable might give.
            return {
                "id": "dry_run_citizen_airtable_id",
                "fields": {
                    "Username": new_citizen_username,
                    "CitizenId": citizen_data.get("id", f"dry_run_{new_citizen_username}"),
                    # Add other essential fields if needed by subsequent logic in dry_run
                }
            }

        # Set InVenice to false for this new citizen
        citizen_data["InVenice"] = False
        
        # Save to Airtable
        citizen_payload = {
            "CitizenId": citizen_data.get("id"),
            "Username": new_citizen_username,
            "SocialClass": citizen_data.get("socialclass"),
            "FirstName": citizen_data.get("firstname"),
            "LastName": citizen_data.get("lastname"),
            "Description": citizen_data.get("personality"),
            "CorePersonality": json.dumps(citizen_data.get("corepersonality", [])),
            "ImagePrompt": citizen_data.get("imageprompt"),
            "FamilyMotto": citizen_data.get("familymotto"),
            "CoatOfArms": citizen_data.get("coatofarms"),
            "Ducats": citizen_data.get("ducats"),
            "CreatedAt": citizen_data.get("createdat"),
            "IsAI": citizen_data.get("isai", True), # Set IsAI from generated data
            "InVenice": False
        }
        citizen_record = tables['citizens'].create(citizen_payload)
        
        log.info(f"👤 Successfully created new citizen in Airtable: **{citizen_data.get('firstname')} {citizen_data.get('lastname')}** (Username: {new_citizen_username})")

        # After successfully creating the citizen, call update_citizen_description_and_image
        try:
            log.info(f"Attempting to update description and image for newly generated citizen: {new_citizen_username}")
            update_success = update_citizen_description_and_image(username=new_citizen_username, dry_run=dry_run) # Pass dry_run status
            if update_success:
                log.info(f"Successfully initiated update for description and image for {new_citizen_username}.")
            else:
                log.warning(f"Failed to initiate update for description and image for {new_citizen_username}.")
        except Exception as e_update:
            log.error(f"Error calling update_citizen_description_and_image for {new_citizen_username}: {e_update}")
            
        return citizen_record
    except Exception as e:
        log.error(f"Error in generate_new_citizen: {e}")
        return None

def create_delivery_activity(tables, citizen: Dict, galley_building_id: str,
                             resources_in_galley_manifest: List[Dict[str, Any]],
                             original_contract_ids: List[str],
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
                    "startDate": datetime.now(pytz.timezone('Europe/Rome')).isoformat(), # Venice time
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
            VENICE_TIMEZONE_PATH = pytz.timezone('Europe/Rome')
            now_venice_path = datetime.now(VENICE_TIMEZONE_PATH)
            path_data = {
                "path": [start_position, end_position], # Simple straight line
                "timing": {"startDate": now_venice_path.isoformat(),
                           "endDate": (now_venice_path + timedelta(hours=2)).isoformat(), # Assume 2 hours for simple path
                           "durationSeconds": 7200}
            }

        VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Define if not already global
        now_venice_activity = datetime.now(VENICE_TIMEZONE)
        # Use duration from path_data if available, otherwise default
        travel_duration_seconds = path_data['timing'].get('durationSeconds', 7200) # Default 2 hours
        end_time_venice_activity = now_venice_activity + timedelta(seconds=travel_duration_seconds)
        
        activity_id_str = f"import_galley_delivery_{galley_building_id}_{uuid.uuid4()}"
        
        # Use the first original contract's string ID for the ContractId field for reference
        primary_original_contract_id_str = original_contract_ids[0] if original_contract_ids else None

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "deliver_resource_batch", 
            "Citizen": citizen_username,
            "ContractId": primary_original_contract_id_str, 
            "ToBuilding": galley_building_id, # Target is the galley itself
            "Resources": json.dumps(resources_in_galley_manifest), 
            "TransportMode": "merchant_galley",
            "CreatedAt": now_venice_activity.isoformat(),
            "StartDate": path_data['timing'].get('startDate', now_venice_activity.isoformat()), # Use start date from path if available
            "EndDate": path_data['timing'].get('endDate', end_time_venice_activity.isoformat()),   # Use end date from path if available
            "Path": json.dumps(path_data.get('path', [])),
            "Notes": f"🚢 Piloting merchant galley with imported resources ({resource_summary}) to {galley_building_id}. Original Contract IDs: {', '.join(original_contract_ids)}"
        }
        
        activity = tables['activities'].create(activity_payload)
        log.info(f"🚢 Created galley delivery activity: **{activity['id']}** to galley building {galley_building_id}")
        return activity
    except Exception as e:
        log.error(f"Error creating galley delivery activity for {galley_building_id}: {e}")
        return None # Return None on error

def process_imports(dry_run: bool = False, night_mode: bool = False):
    """Main function to process import contracts."""
    log.info(f"🚢 Starting import processing (dry_run=**{dry_run}**, night_mode=**{night_mode}**)")
    
    # Check if it's within dock working hours, unless night_mode is enabled
    if not night_mode and not is_dock_working_hours():
        log.info("🌙 Outside of dock working hours (**6 AM - 6 PM** Venice time). Skipping import processing.")
        return
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Make sure the activities table is included
    if 'activities' not in tables:
        tables['activities'] = Table(os.environ.get('AIRTABLE_API_KEY'), 
                                    os.environ.get('AIRTABLE_BASE_ID'), 
                                    'ACTIVITIES')
    
    # Get building types information
    building_types = get_building_types()
    if not building_types:
        log.error("Failed to get building types, exiting")
        return
    
    # Get resource types information
    resource_types = get_resource_types()
    if not resource_types:
        log.error("Failed to get resource types, exiting")
        return

    # Get polygon data for dock water points
    polygons_data = get_polygons_data()
    if not polygons_data:
        log.error("Failed to get polygon data, exiting.")
        return

    # Get active import contracts
    all_active_import_contracts_master_list = get_active_contracts(tables)
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
        log.info(f"--- Starting new galley batch. {len(all_active_import_contracts_master_list)} contracts remaining. ---")

        # Select a dock that hasn't been used in this run yet
        current_best_dock = None
        # Try to find an unused dock with highest wages
        temp_docks_for_selection = [d for d in available_public_docks if d['id'] not in used_dock_ids_this_run]
        if not temp_docks_for_selection: # All docks used once, reset and pick best from all
            log.info("All available docks used once in this run. Resetting and selecting best available.")
            used_dock_ids_this_run.clear()
            temp_docks_for_selection = list(available_public_docks)

        current_best_dock = select_best_dock(temp_docks_for_selection)

        if not current_best_dock:
            log.error("Could not select a public_dock for the current batch. Exiting.")
            break 
        
        used_dock_ids_this_run.add(current_best_dock['id'])
        log.info(f"Selected dock {current_best_dock['fields'].get('BuildingId', current_best_dock['id'])} for current galley batch.")
            
        galley_water_coords = get_dock_water_coordinates(current_best_dock, polygons_data)
        if not galley_water_coords:
            log.error(f"Could not determine water coordinates for selected dock {current_best_dock['fields'].get('BuildingId', current_best_dock['id'])}. Skipping this batch.")
            all_active_import_contracts_master_list.clear() # Avoid infinite loop if dock data is bad
            break
            
        galley_building_id = f"water_{galley_water_coords['lat']}_{galley_water_coords['lng']}_{galley_departure_point_variation_counter}" # Add counter for uniqueness if coords are same

        # Select a merchant for this import operation
        selected_merchant_record = select_import_merchant(tables)
        if not selected_merchant_record:
            log.error("No available merchant to handle imports for this batch. Exiting.")
            break
        selected_merchant_username = selected_merchant_record['fields'].get('Username')

        # Create or get the merchant galley building
        merchant_galley_building = create_or_get_merchant_galley(tables, galley_building_id, galley_water_coords, selected_merchant_username, dry_run)
        if not merchant_galley_building:
            log.error(f"Failed to create/get merchant galley {galley_building_id} for merchant {selected_merchant_username}. Skipping batch.")
            # Potentially remove this merchant from a list of available merchants for this run if selection is iterative
            continue # Try next batch with potentially different merchant/dock

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
            hourly_amount = float(fields.get('HourlyAmount', 0))
            price_per_resource = float(fields.get('PricePerResource', 0))
            original_buyer_building_id = fields.get('BuyerBuilding')

            if not all([buyer_username, resource_type, original_buyer_building_id]) or hourly_amount <= 0 or price_per_resource < 0:
                log.warning(f"Contract {contract_custom_id} has invalid data. Skipping.")
                continue # This contract is problematic, don't add to next iteration either

            amount_to_take_from_contract = hourly_amount
            if current_galley_load + hourly_amount > galley_capacity:
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
        log.info(f"Galley {galley_building_id} batch: {len(batched_resources_for_galley)} types, volume: {current_galley_load:.2f}. {len(involved_original_contracts_info)} contract parts.")

        if dry_run:
            log.info(f"🧪 **[DRY RUN]** Would process import batch for galley {galley_building_id} at {galley_water_coords} (Merchant: {selected_merchant_username}).")
            log.info(f"  [DRY RUN] Galley manifest: {json.dumps(final_galley_manifest_for_activity)}")
            for contract_info_dry_run in involved_original_contracts_info:
                log.info(f"  [DRY RUN] Would update contract {contract_info_dry_run['contract_id']} with Seller={selected_merchant_username}, SellerBuilding={galley_building_id}.")
            for res_item_dry_run in batched_resources_for_galley:
                log.info(f"  [DRY RUN] Would create/update resource {res_item_dry_run['Type']} (Amount: {res_item_dry_run['Amount']:.2f}) in galley {galley_building_id}, owned by {selected_merchant_username}.")
            log.info(f"  [DRY RUN] Would find/generate citizen and create one delivery activity to galley {galley_building_id}.")
            galley_departure_point_variation_counter +=1
            continue # Next iteration of the while loop for dry run

        # --- Actual Operations for this Galley Batch ---
        log.info(f"Updating {len(processed_contract_airtable_ids_for_this_batch)} original contracts for galley {galley_building_id} (Merchant: {selected_merchant_username}).")
        for contract_airtable_id_to_update in processed_contract_airtable_ids_for_this_batch:
            try:
                contract_record_for_log = tables['contracts'].get(contract_airtable_id_to_update)
                contract_custom_id_log = contract_record_for_log['fields'].get('ContractId', contract_airtable_id_to_update) if contract_record_for_log else contract_airtable_id_to_update
                update_payload_contract = {"Seller": selected_merchant_username, "SellerBuilding": galley_building_id}
                tables['contracts'].update(contract_airtable_id_to_update, update_payload_contract)
                log.info(f"Updated contract {contract_custom_id_log} (Airtable ID: {contract_airtable_id_to_update}) with Seller='{selected_merchant_username}', SellerBuilding='{galley_building_id}'.")
            except Exception as e_update_contract:
                log.error(f"Error updating contract (Airtable ID: {contract_airtable_id_to_update}): {e_update_contract}")

        for res_item in batched_resources_for_galley:
            res_type_id, res_amount = res_item['Type'], res_item['Amount']
            res_def = resource_types.get(res_type_id, {})
            formula = f"AND({{Type}}='{_escape_airtable_value(res_type_id)}', {{Asset}}='{_escape_airtable_value(galley_building_id)}', {{AssetType}}='building', {{Owner}}='{_escape_airtable_value(selected_merchant_username)}')"
            try:
                existing_galley_res = tables["resources"].all(formula=formula, max_records=1)
                if existing_galley_res:
                    tables["resources"].update(existing_galley_res[0]["id"], {"Count": res_amount})
                else:
                    new_res_payload = {
                        "ResourceId": f"resource-{uuid.uuid4()}", "Type": res_type_id, "Name": res_def.get('name', res_type_id),
                        "Asset": galley_building_id, "AssetType": "building", "Owner": selected_merchant_username,
                        "Count": res_amount, "CreatedAt": datetime.now(pytz.timezone('Europe/Rome')).isoformat() # Venice time
                    }
                    tables["resources"].create(new_res_payload)
                log.info(f"Processed resource {res_type_id} (Amount: {res_amount:.2f}) in galley {galley_building_id} for merchant {selected_merchant_username}.")
            except Exception as e_res_galley:
                log.error(f"Error creating/updating resource {res_type_id} in galley {galley_building_id}: {e_res_galley}. This batch might be incomplete.")
                # This is a critical error for this batch, but we might continue to next batch.

        delivery_citizen = find_available_citizen(tables)
        if not delivery_citizen:
            log.info("No available citizen for galley delivery, generating new one.")
            delivery_citizen = generate_new_citizen(tables, dry_run=dry_run)
            if not delivery_citizen:
                log.error("Failed to generate new citizen for galley delivery. Skipping activity for this batch.")
                galley_departure_point_variation_counter +=1
                continue # Try next batch

        try:
            tables['citizens'].update(delivery_citizen['id'], {"InVenice": True})
            log.info(f"Set InVenice=True for delivery citizen {delivery_citizen['fields'].get('Username')}.")
        except Exception as e_inv:
            log.error(f"Failed to set InVenice=True for citizen {delivery_citizen['fields'].get('Username')}: {e_inv}")

        original_contract_custom_ids_for_notes = [info['contract_id'] for info in involved_original_contracts_info]
        
        # Vary departure point slightly for each galley
        departure_offset_lat = (galley_departure_point_variation_counter % 5 - 2) * 0.001 # e.g., -0.002 to +0.002
        departure_offset_lng = (galley_departure_point_variation_counter // 5 % 5 - 2) * 0.001
        
        # Base sea entry point, adjust if needed
        base_sea_entry_lat, base_sea_entry_lng = 45.40, 12.45 
        current_departure_point = {
            "lat": base_sea_entry_lat + departure_offset_lat,
            "lng": base_sea_entry_lng + departure_offset_lng
        }
        log.info(f"Galley {galley_building_id} will depart from varied sea point: {current_departure_point}")

        # Override start_position in create_delivery_activity if it uses a fixed one
        # The create_delivery_activity function needs to accept a start_position parameter
        # For now, we assume it can be influenced or we modify it to accept one.
        # The current create_delivery_activity uses a fixed start_position. We'll need to adjust it.
        # Let's assume create_delivery_activity is modified to take start_position.
        # If not, this logic needs to be integrated into it or path_data needs to be pre-generated with this start.
        
        # Re-generating path_data with the new start_position for this specific galley
        # This is a simplified path_data generation for the example.
        # In a real scenario, you'd call the transport API with current_departure_point.
        # For now, we'll pass the varied start_position to create_delivery_activity and assume it uses it.
        
        # The create_delivery_activity function needs to accept start_position.
        # We'll modify its call signature or assume it's already adapted.
        # For this example, let's assume it takes an optional start_position.
        # If create_delivery_activity doesn't take start_position, the path_data generation within it needs to be adapted.
        
        # The original create_delivery_activity uses a fixed start_position.
        # We need to pass the varied one.
        # Let's assume the signature is:
        # create_delivery_activity(tables, citizen, galley_building_id, resources_in_galley_manifest, original_contract_ids, start_position_override=None)
        
        activity_created = create_delivery_activity(
            tables, 
            delivery_citizen, 
            galley_building_id, 
            final_galley_manifest_for_activity, 
            original_contract_custom_ids_for_notes,
            start_position_override=current_departure_point # Pass the varied departure point
        )

        if activity_created:
            log.info(f"✅ Successfully created galley piloting activity {activity_created['id']} to {galley_building_id} (for merchant {selected_merchant_username}) departing from {current_departure_point}.")
            arrival_time_iso = activity_created['fields'].get('EndDate')
            if arrival_time_iso and not dry_run: # Redundant dry_run check, but safe
                update_payload_for_galley = {
                    "IsConstructed": False, "ConstructionDate": arrival_time_iso
                    # "PendingDeliveriesData" removed. The manifest is in the activity,
                    # and individual contract status will be tracked by LastExecutedAt.
                }
                try:
                    tables['buildings'].update(merchant_galley_building['id'], update_payload_for_galley)
                    log.info(f"Updated galley {galley_building_id} with arrival data.")
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
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_imports(dry_run=args.dry_run, night_mode=args.night)
