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
        return value.replace("'", "\\'")
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
            return data.get("polygons", {})
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
        
    canal_points = land_polygon_data.get('canalPoints', {})
    dock_canal_point_data = canal_points.get(dock_building_id) # dock_building_id is the key here

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
                    "Type": "merchant_galley",
                    "Owner": merchant_username,
                    "RunBy": merchant_username,
                    "Position": json.dumps(position_coords),
                    "Name": f"Merchant Galley for {merchant_username} at {galley_building_id}"
                }
            }

        galley_payload = {
            "BuildingId": galley_building_id,
            "Type": "merchant_galley",
            "Name": f"Merchant Galley for {merchant_username} at {galley_building_id}",
            "Owner": merchant_username,
            "RunBy": merchant_username, 
            "Position": json.dumps(position_coords),
            "Category": "Transport", # Assuming a category for such buildings
            "CreatedAt": datetime.now(timezone.utc).isoformat(),
            "IsConstructed": False, # Galley is "arriving"
            "ConstructionDate": None,    # Will be set after activity creation to simulate arrival time
            "PendingDeliveriesData": json.dumps([]), # Initialize with empty list
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
        now = datetime.now().isoformat()
        
        # Query contracts that are active and have no Seller assigned yet
        formula = f"AND({{CreatedAt}}<='{now}', {{EndAt}}>='{now}', {{Type}}='import', {{Seller}}=BLANK())"
        contracts = tables['contracts'].all(formula=formula)
        
        # Sort by CreatedAt
        contracts.sort(key=lambda x: x['fields'].get('CreatedAt', ''))
        
        log.info(f"Found {len(contracts)} active import contracts awaiting merchant assignment.")
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
                             original_contract_ids: List[str]) -> Optional[Dict]:
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

        # Conceptual start for a galley arriving from sea
        # This might need to be adjusted based on map boundaries or a fixed "sea entry point"
        start_position = {"lat": 45.40, "lng": 12.45} # Example: South-East of Venice in the lagoon
        
        galley_building_record = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(galley_building_id)}'", max_records=1)
        if not galley_building_record:
            log.error(f"Galley building {galley_building_id} not found for activity.")
            return None
        
        end_position_str = galley_building_record[0]['fields'].get('Position')
        if not end_position_str:
            log.error(f"Galley building {galley_building_id} has no Position data.")
            return None
        try:
            end_position = json.loads(end_position_str)
        except json.JSONDecodeError:
            log.error(f"Failed to parse Position JSON for galley {galley_building_id}: {end_position_str}")
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
                    "startDate": datetime.now(timezone.utc).isoformat(),
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
                "timing": {"startDate": datetime.now(timezone.utc).isoformat(),
                           "endDate": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(), # Assume 2 hours for simple path
                           "durationSeconds": 7200}
            }

        now_utc = datetime.now(timezone.utc)
        # Use duration from path_data if available, otherwise default
        travel_duration_seconds = path_data['timing'].get('durationSeconds', 7200) # Default 2 hours
        end_time_utc = now_utc + timedelta(seconds=travel_duration_seconds)
        
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
            "CreatedAt": now_utc.isoformat(),
            "StartDate": path_data['timing'].get('startDate', now_utc.isoformat()), # Use start date from path if available
            "EndDate": path_data['timing'].get('endDate', end_time_utc.isoformat()),   # Use end date from path if available
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
    all_active_import_contracts = get_active_contracts(tables)
    if not all_active_import_contracts:
        log.info("No active import contracts found, exiting.")
        return

    # Find the best public dock
    public_docks = get_public_docks(tables)
    if not public_docks:
        log.error("No public_docks found. Cannot determine galley location. Exiting.")
        return
    
    best_dock = select_best_dock(public_docks)
    if not best_dock:
        log.error("Could not select a best public_dock. Exiting.")
        return
        
    galley_water_coords = get_dock_water_coordinates(best_dock, polygons_data)
    if not galley_water_coords:
        log.error(f"Could not determine water coordinates for dock {best_dock['fields'].get('BuildingId', best_dock['id'])}. Exiting.")
        return
        
    galley_building_id = f"water_{galley_water_coords['lat']}_{galley_water_coords['lng']}"
    
    # Select a merchant for this import operation
    selected_merchant_record = select_import_merchant(tables)
    if not selected_merchant_record:
        log.error("No available merchant to handle imports. Exiting.")
        return
    selected_merchant_username = selected_merchant_record['fields'].get('Username')

    # Create or get the merchant galley building, owned by the selected merchant
    merchant_galley_building = create_or_get_merchant_galley(tables, galley_building_id, galley_water_coords, selected_merchant_username, dry_run)
    if not merchant_galley_building:
        log.error(f"Failed to create or get merchant galley building {galley_building_id} for merchant {selected_merchant_username}. Exiting.")
        return

    # Aggregate resources from contracts, respecting the 1000 unit cap for the galley
    # The galley's storageCapacity should ideally come from its building_type definition
    galley_capacity = 1000.0 
    # Try to get actual capacity from building_types
    galley_def = building_types.get("merchant_galley", {})
    if galley_def and galley_def.get('productionInformation') and 'storageCapacity' in galley_def['productionInformation']:
        galley_capacity = float(galley_def['productionInformation']['storageCapacity'])
        log.info(f"Merchant galley capacity set to: {galley_capacity} from definition.")
    else:
        log.warning(f"Merchant galley type definition or its storageCapacity not found. Defaulting to {galley_capacity}.")


    batched_resources_for_galley: List[Dict[str, Any]] = [] # For RESOURCES table: {'Type': str, 'Amount': float}
    final_galley_manifest_for_activity: List[Dict[str, Any]] = [] # For Activity.Resources: {'ResourceId': str, 'Amount': float}
    
    involved_original_contracts_info: List[Dict[str, Any]] = [] 
    # For transactions & notes: {'contract_id': str, 'buyer': str, 'resource_type': str, 'amount': float, 'cost': float, 'original_buyer_building': str}
    
    current_galley_load = 0.0
    processed_contract_airtable_ids = set()

    # Sort contracts by CreatedAt to process older ones first
    all_active_import_contracts.sort(key=lambda x: x['fields'].get('CreatedAt', ''))

    for contract_record in all_active_import_contracts:
        if current_galley_load >= galley_capacity:
            log.info(f"Galley reached capacity ({current_galley_load}/{galley_capacity}). Stopping contract aggregation for this run.")
            break

        fields = contract_record['fields']
        contract_airtable_id = contract_record['id']
        contract_custom_id = fields.get('ContractId', contract_airtable_id)
        buyer_username = fields.get('Buyer')
        resource_type = fields.get('ResourceType')
        hourly_amount = float(fields.get('HourlyAmount', 0))
        price_per_resource = float(fields.get('PricePerResource', 0))
        original_buyer_building_id = fields.get('BuyerBuilding') # Custom ID of final destination

        if not all([buyer_username, resource_type, original_buyer_building_id]) or hourly_amount <= 0 or price_per_resource < 0:
            log.warning(f"Contract {contract_custom_id} has invalid/missing data. Skipping.")
            continue

        amount_to_take_from_contract = hourly_amount
        if current_galley_load + hourly_amount > galley_capacity:
            amount_to_take_from_contract = galley_capacity - current_galley_load
            log.info(f"Contract {contract_custom_id} for {hourly_amount} {resource_type} exceeds galley capacity. Taking partial amount: {amount_to_take_from_contract}")
        
        if amount_to_take_from_contract <= 0.001: # Epsilon for float
            continue # No space left for this resource from this contract

        cost_for_this_part = price_per_resource * amount_to_take_from_contract
        
        # Check buyer balance before adding to batch
        buyer_balance = get_citizen_balance(tables, buyer_username)
        if buyer_balance < cost_for_this_part:
            log.warning(f"Buyer {buyer_username} has insufficient funds ({buyer_balance:,.2f}) for contract {contract_custom_id} part (cost: {cost_for_this_part:,.2f}). Skipping this contract for now.")
            continue # Skip this contract, try next one

        # Add to batch
        current_galley_load += amount_to_take_from_contract
        processed_contract_airtable_ids.add(contract_airtable_id)

        involved_original_contracts_info.append({
            'contract_id': contract_custom_id, # Store custom ID
            'buyer': buyer_username,
            'resource_type': resource_type,
            'amount': amount_to_take_from_contract,
            'cost': cost_for_this_part,
            'original_buyer_building': original_buyer_building_id
        })

        # Aggregate for galley's manifest (for activity and resource creation)
        found_in_batch = False
        for item in batched_resources_for_galley:
            if item['Type'] == resource_type:
                item['Amount'] += amount_to_take_from_contract
                found_in_batch = True
                break
        if not found_in_batch:
            batched_resources_for_galley.append({'Type': resource_type, 'Amount': amount_to_take_from_contract})

    if not involved_original_contracts_info:
        log.info("No contracts could be processed for the galley batch (due to capacity, funds, or no contracts). Exiting.")
        return

    # Prepare manifest for activity's "Resources" field
    final_galley_manifest_for_activity = [{'ResourceId': item['Type'], 'Amount': item['Amount']} for item in batched_resources_for_galley]
    
    log.info(f"Galley batch: {len(batched_resources_for_galley)} resource types, total volume: {current_galley_load:.2f}. Involving {len(involved_original_contracts_info)} contract parts.")

    if dry_run:
        log.info(f"🧪 **[DRY RUN]** Would process import batch for galley {galley_building_id} at {galley_water_coords}.")
        log.info(f"  [DRY RUN] Galley manifest: {json.dumps(final_galley_manifest_for_activity)}")
        for contract_info_dry_run in involved_original_contracts_info:
            # Payment is deferred, but original contract would be updated
            log.info(f"  [DRY RUN] Would update contract {contract_info_dry_run['contract_id']} with Seller={selected_merchant_username}, SellerBuilding={galley_building_id}, Transporter={selected_merchant_username}.")
        for res_item_dry_run in batched_resources_for_galley:
            log.info(f"  [DRY RUN] Would create/update resource {res_item_dry_run['Type']} (Amount: {res_item_dry_run['Amount']:.2f}) in galley {galley_building_id}, owned by {selected_merchant_username}.")
        log.info(f"  [DRY RUN] Would find/generate citizen and create one delivery activity to galley {galley_building_id} (acting for {selected_merchant_username}).")
        log.info(f"🚢 Import processing complete (DRY RUN).")
        return

    # --- Perform Actual Operations ---

    # --- Perform Actual Operations ---

    # 1. Update Original Contracts with Merchant Details
    # Only update contracts that were actually processed and included in this galley's batch.
    log.info(f"Updating {len(processed_contract_airtable_ids)} specific original contracts with merchant {selected_merchant_username} and galley {galley_building_id} as SellerBuilding.")
    for contract_airtable_id_to_update in processed_contract_airtable_ids:
        try:
            # Fetch the contract to get its custom ID for logging, if needed
            contract_record_for_log = tables['contracts'].get(contract_airtable_id_to_update)
            contract_custom_id_log = contract_record_for_log['fields'].get('ContractId', contract_airtable_id_to_update) if contract_record_for_log else contract_airtable_id_to_update
            
            update_payload_contract = {
                "Seller": selected_merchant_username,
                "SellerBuilding": galley_building_id, # Custom ID of the galley
                # "Transporter" field on the original contract remains NULL or as is.
                # It refers to the transporter from the galley to the buyer, not the merchant importing.
                "Status": "processing_by_merchant" 
            }
            tables['contracts'].update(contract_airtable_id_to_update, update_payload_contract)
            log.info(f"Updated contract {contract_custom_id_log} (Airtable ID: {contract_airtable_id_to_update}) with Seller='{selected_merchant_username}', SellerBuilding='{galley_building_id}'.")
        except Exception as e_update_contract:
            log.error(f"Error updating contract (Airtable ID: {contract_airtable_id_to_update}) with merchant details: {e_update_contract}")
            # Decide if this is critical enough to stop the whole batch. For now, log and continue.

    # 2. Create/Update Resources in the Galley Building (Owned by the selected merchant)
    galley_position_str = merchant_galley_building['fields'].get('Position', '{}')
    for res_item in batched_resources_for_galley:
        res_type_id = res_item['Type']
        res_amount = res_item['Amount']
        res_def = resource_types.get(res_type_id, {})
        
        # Resources in a building: Asset=BuildingId, AssetType='building', Owner=MerchantUsername
        formula = f"AND({{Type}}='{_escape_airtable_value(res_type_id)}', {{Asset}}='{_escape_airtable_value(galley_building_id)}', {{AssetType}}='building', {{Owner}}='{_escape_airtable_value(selected_merchant_username)}')"
        try:
            existing_galley_res = tables["resources"].all(formula=formula, max_records=1)
            if existing_galley_res:
                tables["resources"].update(existing_galley_res[0]["id"], {"Count": res_amount})
                log.info(f"Updated resource {res_type_id} (Amount: {res_amount:.2f}) in galley {galley_building_id} for merchant {selected_merchant_username}.")
            else:
                new_res_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": res_type_id,
                    "Name": res_def.get('name', res_type_id),
                    "Asset": galley_building_id,
                    "AssetType": "building",
                    "Owner": selected_merchant_username, # Owned by the selected merchant
                    "Count": res_amount,
                    "Position": galley_position_str, 
                    "CreatedAt": datetime.now(timezone.utc).isoformat()
                }
                tables["resources"].create(new_res_payload)
                log.info(f"Created resource {res_type_id} (Amount: {res_amount:.2f}) in galley {galley_building_id} for merchant {selected_merchant_username}.")
        except Exception as e_res_galley:
            log.error(f"Error creating/updating resource {res_type_id} in galley {galley_building_id} for merchant {selected_merchant_username}: {e_res_galley}. Stopping.")
            return

    # 3. Find/Generate Citizen for Galley Piloting Activity
    delivery_citizen = find_available_citizen(tables)
    if not delivery_citizen:
        log.info(f"No available citizen for galley delivery, generating new one.")
        delivery_citizen = generate_new_citizen(tables, dry_run=dry_run) # dry_run is False here
        if not delivery_citizen:
            log.error(f"Failed to generate new citizen for galley delivery. Stopping.")
            return
            
    try:
        tables['citizens'].update(delivery_citizen['id'], {"InVenice": True})
        log.info(f"Set InVenice=True for delivery citizen {delivery_citizen['fields'].get('Username')}.")
    except Exception as e_inv:
        log.error(f"Failed to set InVenice=True for citizen {delivery_citizen['fields'].get('Username')}: {e_inv}")
        # Continue, but this is an issue.

    # 4. Create Single Delivery Activity (Galley Piloting)
    original_contract_custom_ids_for_notes = [info['contract_id'] for info in involved_original_contracts_info]
    
    # Modify notes for the galley piloting activity
    piloting_activity_notes = (f"🚢 Piloting merchant galley (for merchant {selected_merchant_username}) "
                               f"with imported resources to {galley_building_id}. "
                               f"Original Contract IDs: {', '.join(original_contract_custom_ids_for_notes)}")

    # Call create_delivery_activity, ensuring the notes are updated
    # The create_delivery_activity function itself needs to be flexible with its notes or we update notes here.
    # For now, let's assume create_delivery_activity uses the passed notes.
    # We need to ensure the `create_delivery_activity` function uses the `original_contract_ids` parameter for the notes.
    # Let's adjust the call slightly if the function signature for notes is different.
    # The current signature is: create_delivery_activity(tables, citizen, galley_building_id, resources_in_galley_manifest, original_contract_ids)
    # The last parameter `original_contract_ids` is used in the notes string construction within that function.
    
    activity_created = create_delivery_activity(
        tables, 
        delivery_citizen, 
        galley_building_id, 
        final_galley_manifest_for_activity, 
        original_contract_custom_ids_for_notes # This list of IDs will be used in the notes
    )

    if activity_created:
        log.info(f"✅ Successfully created galley piloting activity {activity_created['id']} to {galley_building_id} (for merchant {selected_merchant_username}).")
        arrival_time_iso = activity_created['fields'].get('EndDate')

        # Update the galley's ConstructionDate and PendingDeliveriesData
        if arrival_time_iso and not dry_run:
            update_payload_for_galley = {
                "IsConstructed": False, 
                "ConstructionDate": arrival_time_iso, 
                "PendingDeliveriesData": json.dumps(involved_original_contracts_info)
                # Owner and RunBy are already set to the merchant during galley creation/retrieval
            }
            try:
                tables['buildings'].update(merchant_galley_building['id'], update_payload_for_galley)
                log.info(f"Updated galley {galley_building_id} (Airtable ID: {merchant_galley_building['id']}) with IsConstructed=False, ConstructionDate={arrival_time_iso}, and PendingDeliveriesData.")
            except Exception as e_update_galley:
                log.error(f"Error updating galley {galley_building_id} with arrival data: {e_update_galley}")
        elif dry_run:
            log.info(f"[DRY RUN] Would update galley {galley_building_id} with IsConstructed=False, ConstructionDate={arrival_time_iso}, and PendingDeliveriesData: {json.dumps(involved_original_contracts_info)}")

    else:
        log.error(f"Failed to create galley piloting activity to {galley_building_id} for merchant {selected_merchant_username}.")

    log.info(f"🚢 Import processing complete for merchant {selected_merchant_username}. Galley {galley_building_id} dispatch initiated.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process import contracts into a central galley.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--night", action="store_true", help="Process imports regardless of time of day")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_imports(dry_run=args.dry_run, night_mode=args.night)
