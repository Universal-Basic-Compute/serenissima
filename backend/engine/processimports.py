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
from datetime import datetime, time
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
        building_operator = building['fields'].get('RanBy')
        
        # If the building has a RanBy field, use that person as the buyer instead
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
        
        # 1. Transfer money from buyer to seller (Italia/Treasury)
        # Update buyer's balance
        formula = f"{{Username}}='{buyer}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if not citizens:
            log.warning(f"Citizen {buyer} not found")
            return False
        
        citizen_id = citizens[0]['id']
        new_balance = buyer_balance - total_cost
        
        tables['citizens'].update(citizen_id, {
            'Ducats': new_balance
        })
        
        log.info(f"Updated {buyer}'s balance from {buyer_balance} to {new_balance}")
        
        # 2. Create a transaction record
        now = datetime.now().isoformat()
        
        transaction = {
            "Type": "import",
            "AssetId": resource_type,
            "Seller": "Italia",
            "Buyer": buyer,
            "Price": total_cost,
            "CreatedAt": now,
            "UpdatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "contract_id": contract_id,
                "resource_type": resource_type,
                "amount": import_amount,
                "price_per_unit": price_per_resource,
                "building_id": buyer_building_id
            })
        }
        
        tables['transactions'].create(transaction)
        log.info(f"Created transaction record for import of {hourly_amount} {resource_type}")
        
        # 3. Create or update resource record
        
        # Check if resource already exists in the building
        existing_resource = None
        for resource in building_resources:
            if resource['fields'].get('Type') == resource_type:
                existing_resource = resource
                break
        
        if existing_resource:
            # Update existing resource
            current_count = float(existing_resource['fields'].get('Count', 0))
            new_count = current_count + import_amount
            
            tables['resources'].update(existing_resource['id'], {
                'Count': new_count,
                'UpdatedAt': now
            })
            
            log.info(f"Updated resource {resource_type} count from {current_count} to {new_count}")
        else:
            # Create new resource record
            import uuid
            resource_id = f"resource-{uuid.uuid4()}"
            
            resource_data = {
                "ResourceId": resource_id,
                "Type": resource_type,
                "Name": resource_def.get('name', resource_type),
                "Category": resource_def.get('category', 'Uncategorized'),
                "Count": import_amount,
                "BuildingId": buyer_building_id,
                "Owner": buyer,
                "CreatedAt": now,
                "UpdatedAt": now
            }
            
            tables['resources'].create(resource_data)
            log.info(f"Created new resource record for {import_amount} {resource_type}")
        
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
