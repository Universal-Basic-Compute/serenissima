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
from datetime import datetime, time, timedelta
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_imports")

# Load environment variables
load_dotenv()

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
    """Get all active import contracts ordered by CreatedAt."""
    try:
        now = datetime.now().isoformat()
        
        # Query contracts that are active (between CreatedAt and EndAt) and are import contracts (Seller = "Italia")
        formula = f"AND({{CreatedAt}}<='{now}', {{EndAt}}>='{now}', {{Seller}}='Italia')"
        contracts = tables['contracts'].all(formula=formula)
        
        # Sort by CreatedAt
        contracts.sort(key=lambda x: x['fields'].get('CreatedAt', ''))
        
        log.info(f"Found {len(contracts)} active import contracts")
        return contracts
    except Exception as e:
        log.error(f"Error getting active contracts: {e}")
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
        formula = f"{{BuildingId}}='{building_id}'"
        resources = tables['resources'].all(formula=formula)
        log.info(f"Found {len(resources)} resources in building {building_id}")
        return resources
    except Exception as e:
        log.error(f"Error getting resources for building {building_id}: {e}")
        return []

def get_citizen_balance(tables, username: str) -> float:
    """Get the compute balance for a citizen."""
    try:
        formula = f"{{Username}}='{username}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if citizens:
            balance = citizens[0]['fields'].get('Ducats', 0)
            log.info(f"Citizen {username} has balance: {balance}")
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
        log.info(f"Selected citizen {selected_citizen['fields'].get('Username')} for import delivery")
        
        return selected_citizen
    except Exception as e:
        log.error(f"Error finding available citizen: {e}")
        return None

def generate_new_citizen(tables) -> Optional[Dict]:
    """Generate a new citizen for import delivery using citizen_generator."""
    log.info("Generating a new citizen for import delivery...")
    
    try:
        # Import the citizen_generator module
        from citizen_generator import generate_citizen
        
        # Generate a new citizen (using Popolani as default class for delivery personnel)
        citizen_data = generate_citizen("Popolani")
        if not citizen_data:
            log.error("Failed to generate new citizen")
            return None
        
        # Set InVenice to false for this new citizen
        citizen_data["InVenice"] = False
        
        # Save to Airtable
        citizen_record = tables['citizens'].create({
            "CitizenId": citizen_data["id"],
            "Username": citizen_data["id"],  # Use ID as username
            "SocialClass": citizen_data["socialclass"],
            "FirstName": citizen_data["firstname"],
            "LastName": citizen_data["lastname"],
            "Description": citizen_data["description"],
            "ImagePrompt": citizen_data["imageprompt"],
            "Ducats": citizen_data["ducats"],
            "CreatedAt": citizen_data["createdat"],
            "InVenice": False
        })
        
        log.info(f"Successfully created new citizen for import delivery: {citizen_data['firstname']} {citizen_data['lastname']}")
        return citizen_record
    except Exception as e:
        log.error(f"Error generating new citizen: {e}")
        return None

def create_delivery_activity(tables, citizen: Dict, contract: Dict, resource_type: str, 
                            amount: float, buyer_building_id: str) -> Optional[Dict]:
    """Create a delivery activity for importing resources."""
    log.info(f"Creating delivery activity for {amount} units of {resource_type}")
    
    try:
        # Get citizen ID (Username)
        citizen_id = citizen['fields'].get('Username')
        if not citizen_id:
            log.error("Missing Username in citizen record")
            return None
        
        # Fixed starting position at the edge of the map
        start_position = {"lat": 45.43015357142857, "lng": 12.390025}
        
        # Get the destination building
        building = None
        try:
            formula = f"{{BuildingId}}='{buyer_building_id}'"
            buildings = tables['buildings'].all(formula=formula)
            if buildings:
                building = buildings[0]
            else:
                log.warning(f"Building {buyer_building_id} not found")
                return None
        except Exception as e:
            log.error(f"Error fetching building {buyer_building_id}: {e}")
            return None
        
        # Get building position
        end_position = None
        try:
            position_str = building['fields'].get('Position')
            if position_str:
                end_position = json.loads(position_str)
            
            # If Position is missing, try to extract from Point field
            if not end_position:
                point_str = building['fields'].get('Point')
                if point_str and isinstance(point_str, str):
                    parts = point_str.split('_')
                    if len(parts) >= 3:
                        try:
                            lat = float(parts[1])
                            lng = float(parts[2])
                            end_position = {"lat": lat, "lng": lng}
                        except (ValueError, IndexError):
                            log.warning(f"Failed to parse coordinates from Point field: {point_str}")
        except Exception as e:
            log.warning(f"Error parsing building position: {e}")
            
        if not end_position:
            log.warning(f"No position found for building {buyer_building_id}")
            return None
        
        # Get path from transport API
        path_data = None
        try:
            # Get API base URL from environment variables, with a default fallback
            api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
            
            # Construct the API URL
            url = f"{api_base_url}/api/transport"
            
            # Make the API request
            response = requests.post(
                url,
                json={
                    "startPoint": start_position,
                    "endPoint": end_position,
                    "startDate": datetime.now().isoformat()
                }
            )
            
            if response.status_code == 200:
                path_data = response.json()
                if not path_data.get('success'):
                    log.warning(f"Transport API returned error: {path_data.get('error')}")
                    path_data = None
            else:
                log.warning(f"Transport API error: {response.status_code}")
        except Exception as e:
            log.error(f"Error calling transport API: {e}")
        
        # If path finding failed, create a simple straight line path
        if not path_data or not path_data.get('path'):
            log.warning("Path finding failed, creating simple path")
            path_data = {
                "path": [start_position, end_position],
                "timing": {
                    "startDate": datetime.now().isoformat(),
                    "endDate": (datetime.now() + timedelta(hours=1)).isoformat(),
                    "durationSeconds": 3600
                }
            }
        
        # Create the activity
        now = datetime.now()
        
        # Calculate travel time based on path
        travel_time_minutes = 60  # Default 60 minutes if no timing info
        
        if 'timing' in path_data and 'durationSeconds' in path_data['timing']:
            travel_time_minutes = path_data['timing']['durationSeconds'] / 60
        
        # Calculate end time
        end_time = now + timedelta(minutes=travel_time_minutes)
        
        # Create the activity
        activity_id = f"import_{uuid.uuid4()}"
        
        activity = tables['activities'].create({
            "ActivityId": activity_id,
            "Type": "deliver_resource",
            "Citizen": citizen_id,
            "ContractId": contract['id'],
            "ToBuilding": buyer_building_id,
            "ResourceId": resource_type,
            "Amount": amount,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Path": json.dumps(path_data.get('path', [])),
            "Notes": f"Delivering {amount} units of {resource_type} from Italia to {building['fields'].get('Name', buyer_building_id)}"
        })
        
        log.info(f"Created delivery activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating delivery activity: {e}")
        return None

def process_import_contract(tables, contract: Dict, building_types: Dict, resource_types: Dict) -> bool:
    """Process a single import contract."""
    try:
        contract_id = contract['id']
        fields = contract['fields']
        
        buyer = fields.get('Buyer')
        resource_type = fields.get('ResourceType')
        buyer_building_id = fields.get('BuyerBuilding')
        hourly_amount = float(fields.get('hourlyAmount', 0))
        price_per_resource = float(fields.get('PricePerResource', 0))
        
        # Since we're running hourly, use the exact hourly amount
        import_amount = hourly_amount
        
        log.info(f"Processing import contract {contract_id} for {buyer}: {import_amount} {resource_type} at {price_per_resource} per unit")
        
        # Skip if any required field is missing
        if not buyer or not resource_type or not buyer_building_id or import_amount <= 0:
            log.warning(f"Skipping contract {contract_id} due to missing required fields")
            return False
        
        # Get building information
        building = get_building_info(tables, buyer_building_id)
        if not building:
            log.warning(f"Building {buyer_building_id} not found")
            return False
        
        # Check if the building is run by someone (business)
        building_operator = building['fields'].get('RunBy')
        
        # If the building has a RunBy field, use that person as the buyer instead
        # This handles cases where the business operator is different from the building owner
        if building_operator and building_operator != buyer:
            log.info(f"Building {buyer_building_id} is run by {building_operator}, using as buyer instead of {buyer}")
            buyer = building_operator
        
        # Get buyer's balance
        buyer_balance = get_citizen_balance(tables, buyer)
        
        # Calculate total cost
        total_cost = import_amount * price_per_resource
        
        # Check if buyer has enough money
        if buyer_balance < total_cost:
            log.warning(f"Buyer {buyer} has insufficient funds ({buyer_balance}) for import cost ({total_cost})")
            return False
        
        building_type = building['fields'].get('Type')
        
        # Get building type definition
        building_def = building_types.get(building_type)
        if not building_def:
            log.warning(f"Building type {building_type} definition not found")
            return False
        
        # Get storage capacity
        storage_capacity = 0
        if building_def.get('productionInformation') and 'storageCapacity' in building_def['productionInformation']:
            storage_capacity = building_def['productionInformation']['storageCapacity']
        else:
            log.warning(f"Building type {building_type} has no storage capacity defined")
            return False
        
        # Get current resources in the building
        building_resources = get_building_resources(tables, buyer_building_id)
        
        # Calculate total resources currently stored
        total_stored = sum(float(resource['fields'].get('Count', 0)) for resource in building_resources)
        
        # Check if there's enough storage space
        if total_stored + import_amount > storage_capacity:
            log.warning(f"Building {buyer_building_id} has insufficient storage space (used: {total_stored}, capacity: {storage_capacity}, needed: {import_amount})")
            return False
        
        # Get resource type information
        resource_def = resource_types.get(resource_type)
        if not resource_def:
            log.warning(f"Resource type {resource_type} definition not found")
            return False
        
        # All checks passed, proceed with the import
        
        # 3. Find or generate a citizen for delivery
        delivery_citizen = find_available_citizen(tables)
        
        if not delivery_citizen:
            log.info("No available citizens found, generating a new one")
            delivery_citizen = generate_new_citizen(tables)
            
            if not delivery_citizen:
                log.error("Failed to generate a new citizen for delivery")
                return False
        
        # 4. Create a delivery activity instead of directly creating/updating resources
        activity = create_delivery_activity(
            tables, 
            delivery_citizen, 
            contract, 
            resource_type, 
            import_amount, 
            buyer_building_id
        )
        
        if not activity:
            log.error("Failed to create delivery activity")
            return False
        
        log.info(f"Successfully created delivery activity for {import_amount} {resource_type}")
        
        # Note: We don't process payment or close the contract here
        # The payment and contract update will happen when the delivery activity is completed
        return True
    except Exception as e:
        log.error(f"Error processing import contract {contract.get('id', 'unknown')}: {e}")
        return False

def process_imports(dry_run: bool = False, night_mode: bool = False):
    """Main function to process import contracts."""
    log.info(f"Starting import processing (dry_run={dry_run}, night_mode={night_mode})")
    
    # Check if it's within dock working hours, unless night_mode is enabled
    if not night_mode and not is_dock_working_hours():
        log.info("Outside of dock working hours (6 AM - 6 PM Venice time). Skipping import processing.")
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
    
    # Get active import contracts
    contracts = get_active_contracts(tables)
    
    if not contracts:
        log.info("No active import contracts found, exiting")
        return
    
    # Process each contract
    success_count = 0
    for contract in contracts:
        if dry_run:
            log.info(f"[DRY RUN] Would process contract {contract['id']}")
            success_count += 1
        else:
            if process_import_contract(tables, contract, building_types, resource_types):
                success_count += 1
    
    log.info(f"Import processing complete. Successfully processed {success_count} out of {len(contracts)} contracts")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process import contracts.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--night", action="store_true", help="Process imports regardless of time of day")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_imports(dry_run=args.dry_run, night_mode=args.night)
