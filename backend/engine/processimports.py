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

def create_delivery_activity(tables, citizen: Dict, buyer_building_id: str,
                             resources_to_deliver: List[Dict[str, Any]],
                             contract_ids: List[str]) -> Optional[Dict]:
    """Create a single delivery activity for all resources for a building."""
    if not resources_to_deliver or not contract_ids:
        log.warning(f"No resources or contract IDs to create activity for building {buyer_building_id}")
        return None

    total_items = sum(r['Amount'] for r in resources_to_deliver)
    resource_summary = ", ".join([f"{r['Amount']:.1f} {r['ResourceId']}" for r in resources_to_deliver])
    log.info(f"Creating delivery activity for {total_items} total units ({resource_summary}) to building {buyer_building_id}")

    try:
        citizen_username = citizen['fields'].get('Username')
        if not citizen_username:
            log.error("Missing Username in citizen record for delivery activity")
            return None

        start_position = {"lat": 45.43015357142857, "lng": 12.390025} # Fixed start

        building_record = get_building_info(tables, buyer_building_id)
        if not building_record:
            log.warning(f"Destination building {buyer_building_id} not found for activity.")
            return None
        
        end_position = None
        try:
            position_str = building_record['fields'].get('Position')
            if position_str:
                end_position = json.loads(position_str)
            if not end_position:
                point_str = building_record['fields'].get('Point')
                if point_str and isinstance(point_str, str):
                    parts = point_str.split('_')
                    if len(parts) >= 3:
                        lat, lng = float(parts[1]), float(parts[2])
                        end_position = {"lat": lat, "lng": lng}
        except Exception as e_pos:
            log.warning(f"Error parsing position for building {buyer_building_id}: {e_pos}")

        if not end_position:
            log.warning(f"No position found for building {buyer_building_id}, cannot create activity.")
            return None

        path_data = None
        try:
            api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
            url = f"{api_base_url}/api/transport"
            response = requests.post(
                url,
                json={
                    "startPoint": start_position, "endPoint": end_position,
                    "startDate": datetime.now().isoformat()
                }
            )
            if response.status_code == 200:
                path_data = response.json()
                if not path_data.get('success'): path_data = None
            else:
                log.warning(f"Transport API error: {response.status_code}")
        except Exception as e_api:
            log.error(f"Error calling transport API: {e_api}")

        if not path_data or not path_data.get('path'):
            log.warning("Path finding failed, creating simple path for activity.")
            path_data = {
                "path": [start_position, end_position],
                "timing": {"startDate": datetime.now().isoformat(),
                           "endDate": (datetime.now() + timedelta(hours=1)).isoformat(),
                           "durationSeconds": 3600}
            }

        now = datetime.now()
        travel_time_minutes = path_data['timing'].get('durationSeconds', 3600) / 60
        end_time = now + timedelta(minutes=travel_time_minutes)
        activity_id = f"import_batch_{buyer_building_id}_{uuid.uuid4()}"
        
        # Use the first contract's string ID for the ContractId field
        # All contract IDs will be in Notes.
        primary_contract_id_str = contract_ids[0] if contract_ids else None

        activity_payload = {
            "ActivityId": activity_id,
            "Type": "deliver_resource_batch", # New type for batched delivery
            "Citizen": citizen_username,
            "ContractId": primary_contract_id_str, # First contract ID
            "ToBuilding": buyer_building_id,
            "Resources": json.dumps(resources_to_deliver), # JSON string of resource list
            "TransportMethod": "merchant_galley", # Added TransportMethod
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Path": json.dumps(path_data.get('path', [])),
            "Notes": f"🚢 Delivering batch of resources ({resource_summary}) from Italia to {building_record['fields'].get('Name', buyer_building_id)}. Involves Contract IDs: {', '.join(contract_ids)}"
        }
        
        activity = tables['activities'].create(activity_payload)
        log.info(f"🚢 Created batch delivery activity: **{activity['id']}** for building {buyer_building_id}")
        return activity
    except Exception as e:
        log.error(f"Error creating batch delivery activity for {buyer_building_id}: {e}")
        return False

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
    
    # Get active import contracts
    contracts = get_active_contracts(tables)
    
    if not contracts:
        log.info("No active import contracts found, exiting")
        return
    
    # Group contracts by BuyerBuilding
    contracts_by_building: Dict[str, List[Dict]] = {}
    for contract_record in contracts:
        buyer_building_id = contract_record['fields'].get('BuyerBuilding')
        if buyer_building_id:
            if buyer_building_id not in contracts_by_building:
                contracts_by_building[buyer_building_id] = []
            contracts_by_building[buyer_building_id].append(contract_record)

    log.info(f"Grouped {len(contracts)} active contracts into {len(contracts_by_building)} building-specific import batches.")

    total_activities_created = 0
    processed_buildings_count = 0

    for buyer_building_id, building_contracts_list in contracts_by_building.items():
        processed_buildings_count += 1
        log.info(f"🏢 Processing import batch for building: **{buyer_building_id}** ({len(building_contracts_list)} contracts)")

        if not building_contracts_list:
            continue

        # Determine the effective buyer (first contract's buyer or building's RunBy)
        # This assumes all contracts for a building have the same intended buyer logic
        first_contract_fields = building_contracts_list[0]['fields']
        buyer_username = first_contract_fields.get('Buyer')
        
        building_info = get_building_info(tables, buyer_building_id)
        if not building_info:
            log.warning(f"Building {buyer_building_id} not found, skipping its contracts.")
            continue
        
        building_operator = building_info['fields'].get('RunBy')
        if building_operator and building_operator != buyer_username:
            log.info(f"Building {buyer_building_id} is run by {building_operator}, using as effective buyer.")
            buyer_username = building_operator
        
        if not buyer_username:
            log.warning(f"No valid buyer could be determined for building {buyer_building_id}, skipping.")
            continue

        # Consolidated checks
        total_cost_for_building = 0
        total_import_amount_for_building = 0
        aggregated_resources_for_activity: List[Dict[str, Any]] = []
        contract_ids_for_activity: List[str] = []

        for contract_record in building_contracts_list:
            fields = contract_record['fields']
            resource_type = fields.get('ResourceType')
            hourly_amount = float(fields.get('HourlyAmount', 0))
            price_per_resource = float(fields.get('PricePerResource', 0))
            contract_id_str = fields.get('ContractId') # Assuming ContractId field exists with the string ID

            if not resource_type or hourly_amount <= 0 or not contract_id_str:
                log.warning(f"Skipping invalid contract data for building {buyer_building_id}: {contract_record.get('id')}")
                continue

            total_cost_for_building += hourly_amount * price_per_resource
            total_import_amount_for_building += hourly_amount
            
            # Aggregate resources for the activity payload
            found_resource = False
            for res_agg in aggregated_resources_for_activity:
                if res_agg['ResourceId'] == resource_type:
                    res_agg['Amount'] += hourly_amount
                    found_resource = True
                    break
            if not found_resource:
                aggregated_resources_for_activity.append({'ResourceId': resource_type, 'Amount': hourly_amount})
            
            contract_ids_for_activity.append(contract_id_str)

        buyer_balance = get_citizen_balance(tables, buyer_username)
        if buyer_balance < total_cost_for_building:
            log.warning(f"Buyer {buyer_username} has insufficient funds ({buyer_balance:,.2f}) for total import cost ({total_cost_for_building:,.2f}) for building {buyer_building_id}.")
            continue

        building_type_str = building_info['fields'].get('Type')
        building_def = building_types.get(building_type_str)
        if not building_def or not building_def.get('productionInformation') or 'storageCapacity' not in building_def['productionInformation']:
            log.warning(f"Building type {building_type_str} for {buyer_building_id} has no storage capacity defined.")
            continue
        
        storage_capacity = building_def['productionInformation']['storageCapacity']
        current_stored_resources = get_building_resources(tables, buyer_building_id)
        total_stored_volume = sum(float(r['fields'].get('Count', 0)) for r in current_stored_resources)

        if total_stored_volume + total_import_amount_for_building > storage_capacity:
            log.warning(f"Building {buyer_building_id} insufficient storage (used: {total_stored_volume:.1f}, capacity: {storage_capacity:.1f}, needed for batch: {total_import_amount_for_building:.1f}).")
            continue
        
        log.info(f"Checks passed for building {buyer_building_id}. Aggregated {len(aggregated_resources_for_activity)} resource types.")

        if dry_run:
            log.info(f"🧪 **[DRY RUN]** Would process imports for building {buyer_building_id}.")
            for res_type_id in list(dict.fromkeys(r['ResourceId'] for r in aggregated_resources_for_activity)): # Unique resource types
                 log.info(f"  [DRY RUN] Would ensure import-tracking resource record for {res_type_id} in {buyer_building_id} for {buyer_username}.")
            log.info(f"  [DRY RUN] Would find/generate citizen and create one delivery activity for {buyer_building_id} with resources: {json.dumps(aggregated_resources_for_activity)} and contract IDs: {', '.join(contract_ids_for_activity)}.")
            total_activities_created +=1 # Simulate activity creation
            continue

        # Create/Update "import-tracking" RESOURCES records for all involved resource types
        all_resource_records_managed = True
        for resource_item in aggregated_resources_for_activity:
            resource_type_id = resource_item['ResourceId']
            try:
                resource_formula = f"AND({{Type}}='import', {{'Resource Type'}}='{_escape_airtable_value(resource_type_id)}', {{BuildingId}}='{_escape_airtable_value(buyer_building_id)}', {{Owner}}='{_escape_airtable_value(buyer_username)}')"
                existing_resources = tables["resources"].all(formula=resource_formula, max_records=1)
                
                current_time_iso = datetime.now().isoformat()
                resource_data_fields = {
                    "Type": "import", "Resource Type": resource_type_id,
                    "BuildingId": buyer_building_id, "Owner": buyer_username,
                    "Count": 0, "UpdatedAt": current_time_iso
                }
                if existing_resources:
                    tables["resources"].update(existing_resources[0]["id"], resource_data_fields)
                    log.info(f"Updated import-tracking resource record for {resource_type_id} in {buyer_building_id}.")
                else:
                    resource_data_fields["ResourceId"] = f"resource-{uuid.uuid4()}"
                    resource_data_fields["CreatedAt"] = current_time_iso
                    tables["resources"].create(resource_data_fields)
                    log.info(f"Created new import-tracking resource record for {resource_type_id} in {buyer_building_id}.")
            except Exception as e_res_track:
                log.error(f"Error managing import-tracking resource record for {resource_type_id} in {buyer_building_id}: {e_res_track}")
                all_resource_records_managed = False
                break # Stop processing this building if a tracking record fails
        
        if not all_resource_records_managed:
            continue

        # Find or generate a citizen for delivery
        delivery_citizen = find_available_citizen(tables)
        if not delivery_citizen:
            log.info(f"No available citizen for building {buyer_building_id}, generating new one.")
            delivery_citizen = generate_new_citizen(tables, dry_run=dry_run)
            if not delivery_citizen:
                log.error(f"Failed to generate new citizen for delivery to {buyer_building_id}.")
                continue
        
        # Create one delivery activity for the building
        activity_created = create_delivery_activity(
            tables, delivery_citizen, buyer_building_id,
            aggregated_resources_for_activity, contract_ids_for_activity
        )
        if activity_created:
            total_activities_created += 1
            log.info(f"✅ Successfully created delivery activity for building {buyer_building_id}.")
        else:
            log.error(f"Failed to create delivery activity for building {buyer_building_id}.")

    log.info(f"🚢 Import processing complete. Processed {processed_buildings_count} buildings. Created/Simulated {total_activities_created} delivery activities.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process import contracts.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--night", action="store_true", help="Process imports regardless of time of day")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_imports(dry_run=args.dry_run, night_mode=args.night)
