#!/usr/bin/env python3
import os
import sys
# Add the project root to sys.path to allow imports from backend.engine
# os.path.dirname(__file__) -> backend/engine
# os.path.join(..., '..') -> backend/engine/.. -> backend
# os.path.join(..., '..', '..') -> backend/engine/../../ -> serenissima (project root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

"""
Create Activities script for La Serenissima.

This script:
1. Fetches all idle citizens
2. Determines the current time in Venice
3. Based on time and citizen location:
   - If nighttime and citizen is at home: create "rest" activity
   - If nighttime and citizen is not at home: create "goto_home" activity
   - If daytime and citizen has work: check for production or resource fetching
   - If transport API fails: create "idle" activity for one hour

Run this script periodically to keep citizens engaged in activities.
"""

import os
import sys
import logging
import argparse
import json
import datetime
import time
import requests
import pytz
import uuid
import re # Added import for regular expressions
import random # Added for selecting random building point
from collections import defaultdict
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table

# Import activity creators
from backend.engine.activity_creators import (
    try_create_stay_activity,
    try_create_goto_work_activity,
    try_create_goto_home_activity,
    try_create_travel_to_inn_activity,
    try_create_idle_activity,
    try_create_production_activity,
    try_create_resource_fetching_activity,
    try_create_eat_from_inventory_activity,
    try_create_eat_at_home_activity,
    try_create_eat_at_tavern_activity,
    try_create_fetch_from_galley_activity # Import new creator
)
from dotenv import load_dotenv

# Import helpers from the new module
from backend.engine.utils.activity_helpers import (
    LogColors,
    _escape_airtable_value,
    _has_recent_failed_activity_for_contract,
    _get_building_position_coords,
    _calculate_distance_meters,
    is_nighttime as is_nighttime_helper, 
    is_shopping_time as is_shopping_time_helper, 
    get_path_between_points as get_path_between_points_helper,
    get_citizen_current_load,
    get_closest_inn,
    get_citizen_workplace,
    get_citizen_home,
    get_building_type_info,
    get_building_resources,
    can_produce_output,
    find_path_between_buildings,
    get_citizen_contracts,
    get_idle_citizens,
    _fetch_and_assign_random_starting_position
)
# Import galley activity processing functions
from backend.engine.logic.galley_activities import (
    process_final_deliveries_from_galley,
    process_galley_unloading_activities
)
# Import general citizen activity processing function
from backend.engine.logic.citizen_general_activities import process_citizen_activity

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("create_activities")

# Attempt to import helper functions from other engine scripts
try:
    from backend.engine.createimportactivities import get_resource_types as get_resource_definitions_from_api
    from backend.engine.processActivities import get_building_record # Import get_building_record
except ImportError:
    log.warning(f"{LogColors.WARNING}Could not import get_resource_definitions_from_api or get_building_record directly.{LogColors.ENDC}")
    def get_resource_definitions_from_api():
        raise NotImplementedError("get_resource_definitions_from_api is not available")
    def get_building_record(tables, building_id_custom: str): # Add a fallback definition
        raise NotImplementedError("get_building_record is not available")


# Load environment variables
load_dotenv()

# Constants
TRANSPORT_API_URL = os.getenv("TRANSPORT_API_URL", "http://localhost:3000/api/transport")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000") # Define API_BASE_URL
VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
NIGHT_START_HOUR = 22  # 10 PM
NIGHT_END_HOUR = 6     # 6 AM
SHOPPING_START_HOUR = 17 # 5 PM
SHOPPING_END_HOUR = 20   # 8 PM
IDLE_ACTIVITY_DURATION_HOURS = 1
CITIZEN_CARRY_CAPACITY = 10.0
SOCIAL_CLASS_VALUE = {"Nobili": 4, "Cittadini": 3, "Popolani": 2, "Facchini": 1, "Forestieri": 2}


def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error(f"{LogColors.FAIL}Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.{LogColors.ENDC}")
        sys.exit(1)
    
    try:
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'activities': Table(api_key, base_id, 'ACTIVITIES'),
            'contracts': Table(api_key, base_id, 'CONTRACTS'),
            'resources': Table(api_key, base_id, 'RESOURCES')
        }
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        sys.exit(1)

def get_citizen_contracts(tables, citizen_id: str) -> List[Dict]:
    """Get all active contracts where the citizen is the buyer, sorted by priority."""
    log.info(f"{LogColors.OKBLUE}Fetching contracts for citizen {citizen_id}{LogColors.ENDC}")
    
    try:
        # Get current time in Venice timezone
        VENICE_TIMEZONE_CONTRACTS = pytz.timezone('Europe/Rome')
        now_venice_contracts = datetime.datetime.now(VENICE_TIMEZONE_CONTRACTS)
        now_iso_venice = now_venice_contracts.isoformat()
        
        # Query contracts where the citizen is the buyer, type is 'recurrent', and the contract is active.
        # Exclude 'import' contracts as they are handled by galley logic.
        formula = f"AND({{Buyer}}='{_escape_airtable_value(citizen_id)}', {{Type}}='recurrent', {{CreatedAt}}<='{now_iso_venice}', {{EndAt}}>='{now_iso_venice}')"
        contracts = tables['contracts'].all(formula=formula)
        
        # Sort by Priority in descending order
        contracts.sort(key=lambda x: int(x['fields'].get('Priority', 0) or 0), reverse=True)
        
        log.info(f"{LogColors.OKGREEN}Found {len(contracts)} active contracts for citizen {citizen_id}{LogColors.ENDC}")
        return contracts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting contracts for citizen {citizen_id}: {e}{LogColors.ENDC}")
        return []

def get_building_type_info(building_type: str) -> Optional[Dict]:
    """Get building type information from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/building-types"
        
        log.info(f"{LogColors.OKBLUE}Fetching building type info for {building_type} from API: {url}{LogColors.ENDC}")
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and "buildingTypes" in data:
                building_types = data["buildingTypes"]
                
                # Find the specific building type
                for bt in building_types:
                    if bt.get("type") == building_type:
                        log.info(f"{LogColors.OKGREEN}Found building type info for {building_type}{LogColors.ENDC}")
                        return bt
                
                log.warning(f"{LogColors.WARNING}Building type {building_type} not found in API response{LogColors.ENDC}")
                return None
            else:
                log.error(f"{LogColors.FAIL}Unexpected API response format: {data}{LogColors.ENDC}")
                return None
        else:
            log.error(f"{LogColors.FAIL}Error fetching building types from API: {response.status_code} - {response.text}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception fetching building type info: {str(e)}{LogColors.ENDC}")
        return None

def get_building_resources(tables, building_id: str) -> Dict[str, float]:
    """Get all resources in a building, returned as a dictionary of resource_type -> count."""
    try:
        # Resources associated with a building now use Asset and AssetType
        escaped_building_id = _escape_airtable_value(building_id)
        formula = f"AND({{Asset}}='{escaped_building_id}', {{AssetType}}='building')"
        resources = tables['resources'].all(formula=formula)
        
        # Convert to dictionary for easier lookup
        resource_dict = {}
        for resource in resources:
            resource_type = resource['fields'].get('Type', '')
            count = float(resource['fields'].get('Count', 0) or 0)
            resource_dict[resource_type] = count
        
        log.info(f"{LogColors.OKGREEN}Found {len(resources)} resources in building {building_id}{LogColors.ENDC}")
        return resource_dict
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting resources for building {building_id}: {e}{LogColors.ENDC}")
        return {}

def can_produce_output(resources: Dict[str, float], recipe: Dict) -> bool:
    """Check if there are enough resources to produce the output according to the recipe."""
    if not recipe or 'inputs' not in recipe:
        return False
    
    for input_type, input_amount in recipe['inputs'].items():
        if input_type not in resources or resources[input_type] < input_amount:
            return False
    
    return True

def find_path_between_buildings(from_building: Dict, to_building: Dict) -> Optional[Dict]:
    """Find a path between two buildings using the transport API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Extract positions from buildings
        from_position = None
        to_position = None
        
        try:
            # First try to get position from the Position field
            from_position_str = from_building['fields'].get('Position')
            to_position_str = to_building['fields'].get('Position')
            
            if from_position_str:
                from_position = json.loads(from_position_str)
            if to_position_str:
                to_position = json.loads(to_position_str)
            
            # If Position is missing or invalid, try to extract from Point field
            if not from_position:
                from_point_str = from_building['fields'].get('Point')
                if from_point_str and isinstance(from_point_str, str):
                    parts = from_point_str.split('_')
                    if len(parts) >= 3:
                        try:
                            lat = float(parts[1])
                            lng = float(parts[2])
                            from_position = {"lat": lat, "lng": lng}
                            log.info(f"{LogColors.OKBLUE}Extracted position from Point field for building {from_building['fields'].get('BuildingId', from_building['id'])}: {from_position}{LogColors.ENDC}")
                        except (ValueError, IndexError):
                            log.warning(f"{LogColors.WARNING}Failed to parse coordinates from Point field: {from_point_str}{LogColors.ENDC}")
            
            if not to_position:
                to_point_str = to_building['fields'].get('Point')
                if to_point_str and isinstance(to_point_str, str):
                    parts = to_point_str.split('_')
                    if len(parts) >= 3:
                        try:
                            lat = float(parts[1])
                            lng = float(parts[2])
                            to_position = {"lat": lat, "lng": lng}
                            log.info(f"{LogColors.OKBLUE}Extracted position from Point field for building {to_building['fields'].get('BuildingId', to_building['id'])}: {to_position}{LogColors.ENDC}")
                        except (ValueError, IndexError):
                            log.warning(f"{LogColors.WARNING}Failed to parse coordinates from Point field: {to_point_str}{LogColors.ENDC}")
        except (json.JSONDecodeError, TypeError) as e:
            log.warning(f"{LogColors.WARNING}Invalid position data for buildings: {e}{LogColors.ENDC}")
            return None
        
        if not from_position or not to_position:
            log.warning(f"{LogColors.WARNING}Missing position data for buildings{LogColors.ENDC}")
            return None
        
        # Construct the API URL
        url = f"{api_base_url}/api/transport"
        
        log.info(f"{LogColors.OKBLUE}Finding path between buildings using API: {url}{LogColors.ENDC}")
        
        # Make the API request
        response = requests.post(
            url,
            json={
                "startPoint": from_position,
                "endPoint": to_position,
                "startDate": datetime.datetime.now().isoformat()
            }
        )
        
        # Check if the request was successful
        if response.status_code == 200:
            data = response.json()
            
            if data.get("success") and "path" in data:
                log.info(f"{LogColors.OKGREEN}Found path between buildings with {len(data['path'])} points{LogColors.ENDC}")
                return data
            else:
                log.warning(f"{LogColors.WARNING}No path found between buildings: {data.get('error', 'Unknown error')}{LogColors.ENDC}")
                return None
        else:
            log.error(f"{LogColors.FAIL}Error finding path between buildings: {response.status_code} - {response.text}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception finding path between buildings: {str(e)}{LogColors.ENDC}")
        return None

def create_resource_fetching_activity(tables, citizen: Dict, contract: Dict, from_building: Dict, to_building: Dict, path: Dict) -> Optional[Dict]:
    """Create a resource fetching activity based on a contract."""
    try:
        citizen_airtable_record_id = citizen['id']
        citizen_custom_id = citizen['fields'].get('CitizenId') # For ActivityId generation if needed
        citizen_username = citizen['fields'].get('Username')

        if not citizen_username: # Fallback if username is somehow missing
            citizen_username = citizen_custom_id
        if not citizen_custom_id: # Should not happen if process_citizen_activity validates
             log.error(f"{LogColors.FAIL}Missing CitizenId for citizen record {citizen_airtable_record_id}{LogColors.ENDC}")
             return None
        if not citizen_username: # Should not happen
             log.error(f"{LogColors.FAIL}Missing Username for citizen record {citizen_airtable_record_id}{LogColors.ENDC}")
             return None

        contract_id = contract['id']
        from_building_id = from_building['id']
        to_building_id = to_building['id']
        resource_type = contract['fields'].get('ResourceType', '')
        amount = float(contract['fields'].get('Amount', 0) or 0)
        
        now = datetime.datetime.now()
        
        # Calculate travel time based on path
        travel_time_minutes = 30  # Default 30 minutes if no timing info
        
        if 'timing' in path and 'durationSeconds' in path['timing']:
            travel_time_minutes = path['timing']['durationSeconds'] / 60
        
        # Calculate end time
        end_time = now + datetime.timedelta(minutes=travel_time_minutes)
        
        # Create the activity
        activity_id_str = f"fetch_{citizen_custom_id}_{uuid.uuid4()}" # Use custom_id for activity string
        
        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_resource",
            "Citizen": citizen_username, # Username for Citizen field
            "ContractId": contract_id,
            "FromBuilding": from_building_id,
            "ToBuilding": to_building_id,
            "ResourceId": resource_type,
            "Amount": amount,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Path": json.dumps(path.get('path', [])),
            "Notes": f"🚚 Fetching **{amount:,.0f}** units of **{resource_type}** from **{from_building['fields'].get('Name', from_building_id)}** to **{to_building['fields'].get('Name', to_building_id)}**"
        }
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"{LogColors.OKGREEN}Created resource fetching activity: {activity['id']}{LogColors.ENDC}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"{LogColors.FAIL}Failed to create resource fetching activity for {citizen_username}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating resource fetching activity for {citizen_username}: {e}{LogColors.ENDC}")
        return None

def create_production_activity(tables, citizen: Dict, building: Dict, recipe: Dict) -> Optional[Dict]:
    """Create a production activity based on a recipe."""
    try:
        citizen_airtable_record_id = citizen['id']
        citizen_custom_id = citizen['fields'].get('CitizenId') # For ActivityId generation if needed
        citizen_username = citizen['fields'].get('Username')

        if not citizen_username: # Fallback if username is somehow missing
            citizen_username = citizen_custom_id
        if not citizen_custom_id: # Should not happen if process_citizen_activity validates
             log.error(f"{LogColors.FAIL}Missing CitizenId for citizen record {citizen_airtable_record_id}{LogColors.ENDC}")
             return None
        if not citizen_username: # Should not happen
             log.error(f"{LogColors.FAIL}Missing Username for citizen record {citizen_airtable_record_id}{LogColors.ENDC}")
             return None

        building_id = building['id']
        
        # Extract recipe details
        inputs = recipe.get('inputs', {})
        outputs = recipe.get('outputs', {})
        craft_minutes = recipe.get('craftMinutes', 60)  # Default to 60 minutes if not specified
        
        now = datetime.datetime.now()
        end_time = now + datetime.timedelta(minutes=craft_minutes)
        
        # Create a description of the production
        input_desc = ", ".join([f"**{amount:,.0f}** **{resource}**" for resource, amount in inputs.items()])
        output_desc = ", ".join([f"**{amount:,.0f}** **{resource}**" for resource, amount in outputs.items()])
        
        # Create the activity
        activity_id_str = f"produce_{citizen_custom_id}_{uuid.uuid4()}" # Use custom_id for activity string
        
        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "production",
            "Citizen": citizen_username, # Username for Citizen field
            "FromBuilding": building_id,
            "ToBuilding": building_id,  # Same building for production
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": f"⚒️ Producing {output_desc} from {input_desc}",
            "RecipeInputs": json.dumps(inputs),
            "RecipeOutputs": json.dumps(outputs)
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"{LogColors.OKGREEN}Created production activity: {activity['id']}{LogColors.ENDC}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"{LogColors.FAIL}Failed to create production activity for {citizen_username}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating production activity for {citizen_username}: {e}{LogColors.ENDC}")
        return None

def get_idle_citizens(tables) -> List[Dict]:
    """Fetch all citizens who are currently idle (no active activities)."""
    log.info(f"{LogColors.OKBLUE}Fetching idle citizens...{LogColors.ENDC}")
    
    try:
        # First, get all citizens
        all_citizens = tables['citizens'].all()
        log.info(f"{LogColors.OKBLUE}Found {len(all_citizens)} total citizens{LogColors.ENDC}")
        
        # Then, get all active activities
        now_utc = datetime.datetime.now(pytz.UTC) # Use UTC for consistent time comparison
        now_iso_utc = now_utc.isoformat()

        active_activities_formula = f"AND({{StartDate}} <= '{now_iso_utc}', {{EndDate}} >= '{now_iso_utc}')" # Compare with UTC time
        active_activities = tables['activities'].all(formula=active_activities_formula)
        
        # Extract citizen Usernames with active activities
        busy_citizen_usernames = set()
        for activity in active_activities:
            # The 'Citizen' field in ACTIVITIES table stores the Username
            username = activity['fields'].get('Citizen') 
            if username:
                busy_citizen_usernames.add(username)
        
        # Filter out citizens with active activities using Username
        idle_citizens = []
        for citizen_record in all_citizens:
            username = citizen_record['fields'].get('Username')
            # Ensure citizen has a username and is not in the busy set
            if username and username not in busy_citizen_usernames:
                idle_citizens.append(citizen_record)
        
        log.info(f"{LogColors.OKGREEN}Found {len(idle_citizens)} idle citizens (after checking Usernames against active activities){LogColors.ENDC}")
        return idle_citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching idle citizens: {e}{LogColors.ENDC}")
        return []

# Removed create_resource_fetching_activity and create_production_activity as they are imported.

# _escape_airtable_value, _has_recent_failed_activity_for_contract, 
# _get_building_position_coords, _calculate_distance_meters,
# get_citizen_current_load, get_closest_inn, get_citizen_workplace, get_citizen_home,
# get_building_type_info, get_building_resources, can_produce_output,
# find_path_between_buildings, get_citizen_contracts, get_idle_citizens,
# _fetch_and_assign_random_starting_position, is_nighttime_helper, is_shopping_time_helper,
# get_path_between_points_helper are now in activity_helpers.py

# --- Removed create_stay_activity ---
# --- Removed create_goto_work_activity ---
# --- Removed create_goto_home_activity ---
# --- Removed create_travel_to_inn_activity ---
# --- Removed create_idle_activity ---
# --- Removed create_production_activity ---
# --- Removed create_resource_fetching_activity ---
# (Ensure all these function definitions are deleted from this file)

# The following functions were identified as unused or duplicated by imported versions:
# create_goto_work_activity, create_goto_home_activity, create_travel_to_inn_activity, create_idle_activity.
# Their definitions have been removed.

# Function process_citizen_activity has been moved to backend.engine.logic.citizen_general_activities

def create_activities(dry_run: bool = False, target_citizen_username: Optional[str] = None):
    """Main function to create activities for idle citizens."""
    if target_citizen_username:
        log.info(f"{LogColors.HEADER}Starting activity creation process for citizen '{target_citizen_username}' (dry_run: {dry_run}){LogColors.ENDC}")
    else:
        log.info(f"{LogColors.HEADER}Starting activity creation process for all idle citizens (dry_run: {dry_run}){LogColors.ENDC}")
    
    tables = initialize_airtable()
    now_utc_dt = datetime.datetime.now(pytz.UTC) # Define now_utc_dt here
    now_venice_dt = datetime.datetime.now(VENICE_TIMEZONE) # Define now_venice_dt here
    
    # Fetch resource definitions once
    resource_defs = get_resource_definitions_from_api()
    if not resource_defs:
        log.error(f"{LogColors.FAIL}Failed to fetch resource definitions. Exiting activity creation.{LogColors.ENDC}")
        return

    citizens_to_process_list = []
    if target_citizen_username:
        # Fetch the specific citizen
        formula = f"{{Username}} = '{_escape_airtable_value(target_citizen_username)}'"
        try:
            target_citizen_records = tables['citizens'].all(formula=formula, max_records=1)
            if not target_citizen_records:
                log.error(f"{LogColors.FAIL}Citizen '{target_citizen_username}' not found.{LogColors.ENDC}")
                return
            target_citizen_record = target_citizen_records[0]

            # Check if this citizen is idle
            now_iso_utc = datetime.datetime.now(pytz.UTC).isoformat()
            activity_formula = f"AND({{Citizen}}='{_escape_airtable_value(target_citizen_username)}', {{StartDate}} <= '{now_iso_utc}', {{EndDate}} >= '{now_iso_utc}')"
            active_activities = tables['activities'].all(formula=activity_formula, max_records=1)
            
            if active_activities:
                log.info(f"{LogColors.OKBLUE}Citizen '{target_citizen_username}' already has an active activity. No new activity will be created.{LogColors.ENDC}")
                return # Citizen is busy
            else:
                log.info(f"{LogColors.OKGREEN}Citizen '{target_citizen_username}' is idle. Proceeding to create activity.{LogColors.ENDC}")
                citizens_to_process_list = [target_citizen_record]
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error fetching or checking status for citizen '{target_citizen_username}': {e}{LogColors.ENDC}")
            return
    else:
        citizens_to_process_list = get_idle_citizens(tables) # Existing logic for all idle citizens
    
    if not citizens_to_process_list:
        log.info(f"{LogColors.OKBLUE}No idle citizens to process.{LogColors.ENDC}")
        return
    
    # Check if it's nighttime in Venice
    night_time = is_nighttime_helper(now_venice_dt)
    log.info(f"{LogColors.OKBLUE}Current time in Venice: {'Night' if night_time else 'Day'}{LogColors.ENDC}")
    
    # Process each idle citizen
    success_count = 0
    
    # Attempt to create final delivery activities for citizens at galleys first
    # Start with the full list of citizens to process. This list will be modified by the processing functions.
    citizens_remaining_idle = list(citizens_to_process_list) 

    if not dry_run:
        # Attempt final deliveries first
        if citizens_remaining_idle: # Check if there's anyone to process
            final_delivery_activities_created = process_final_deliveries_from_galley(tables, citizens_remaining_idle, now_venice_dt, TRANSPORT_API_URL)
            success_count += final_delivery_activities_created
            # citizens_remaining_idle is modified in place by process_final_deliveries_from_galley

        # Then, attempt galley unloading for citizens still idle
        if citizens_remaining_idle: # Check if there's anyone left
            galley_fetch_activities_created = process_galley_unloading_activities(tables, citizens_remaining_idle, now_venice_dt, TRANSPORT_API_URL)
            success_count += galley_fetch_activities_created
            # citizens_remaining_idle is modified in place by process_galley_unloading_activities
    
    elif dry_run and citizens_to_process_list: # Dry run logging
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would check for citizens at galleys ready for final delivery tasks.{LogColors.ENDC}")
        log.info(f"{LogColors.OKCYAN}[DRY RUN] Would check for merchant galleys with pending deliveries (fetch tasks).{LogColors.ENDC}")
        # Note: success_count for dry_run in galley tasks isn't explicitly added here,
        # as the functions themselves aren't run to return a count.
        # The main loop's dry_run success_count will cover citizens considered for general activities.

    # Finally, process general activities for any citizens still idle
    # If dry_run, citizens_remaining_idle will be the original list unless target_citizen_username was handled by a (simulated) galley task.
    # If not dry_run, it will be those not assigned galley tasks.
    
    citizens_to_process_general = []
    if citizens_remaining_idle:
        if target_citizen_username:
            # Check if the target citizen is still in the list of idle citizens
            target_still_idle = any(c['fields'].get('Username') == target_citizen_username for c in citizens_remaining_idle)
            if dry_run:
                if target_still_idle:
                    log.info(f"{LogColors.OKCYAN}[DRY RUN] Target citizen {target_citizen_username} would be considered for general activity if not assigned a (simulated) galley task.{LogColors.ENDC}")
                    citizens_to_process_general = [c for c in citizens_remaining_idle if c['fields'].get('Username') == target_citizen_username]
                # else: target was not in initial list or dry run implies they might have gotten a galley task.
            elif not dry_run: # Actual run
                if target_still_idle:
                    log.info(f"{LogColors.OKBLUE}Processing general activity for target citizen: {target_citizen_username} (was not assigned a galley task).{LogColors.ENDC}")
                    citizens_to_process_general = [c for c in citizens_remaining_idle if c['fields'].get('Username') == target_citizen_username]
                else:
                    log.info(f"{LogColors.OKBLUE}Target citizen {target_citizen_username} was assigned a galley task or is no longer idle. Skipping general activity processing for them.{LogColors.ENDC}")
                    # citizens_to_process_general remains empty
        else: # General run (not targeted)
            log.info(f"{LogColors.OKBLUE}Processing general activities for {len(citizens_remaining_idle)} remaining idle citizens.{LogColors.ENDC}")
            citizens_to_process_general = citizens_remaining_idle

        for citizen_record in citizens_to_process_general: # Iterate over the correctly filtered list
            if dry_run:
                 # For dry_run with target_citizen_username, specific log is handled above.
                 # This logs for general dry_run or if target is in citizens_to_process_general.
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Would create general activity for citizen {citizen_record['fields'].get('Username', citizen_record['id'])}{LogColors.ENDC}")
                success_count +=1 
            else:
                # No need for the 'if target_citizen_username and ... != target_citizen_username:' check
                # because citizens_to_process_general is already filtered.
                # Pass additional required arguments
                activity_created_for_citizen = process_citizen_activity(
                    tables, citizen_record, night_time, resource_defs,
                    now_venice_dt, now_utc_dt, TRANSPORT_API_URL, API_BASE_URL
                )
                if activity_created_for_citizen:
                    success_count += 1
    
    total_citizens_considered = len(citizens_to_process_list)
    summary_color = LogColors.OKGREEN if success_count >= total_citizens_considered and total_citizens_considered > 0 else LogColors.WARNING if success_count > 0 else LogColors.FAIL
    log.info(f"{summary_color}Activity creation process complete. Total activities created or simulated: {success_count} for {total_citizens_considered} citizen(s) considered.{LogColors.ENDC}")

# Functions process_final_deliveries_from_galley and process_galley_unloading_activities
# have been moved to backend/engine/logic/galley_activities.py

def _fetch_and_assign_random_starting_position(tables: Dict[str, Table], citizen_record: Dict) -> Optional[Dict[str, float]]:
    """
    Fetches polygon data, selects a random buildingPoint, assigns it to the citizen,
    and updates their record in Airtable.
    Returns the new position {lat, lng} or None.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId', citizen_record['id'])
    log.info(f"{LogColors.OKBLUE}Attempting to fetch random building point for citizen {citizen_custom_id}.{LogColors.ENDC}")

    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000") # Use API_BASE_URL
        polygons_url = f"{api_base_url}/api/get-polygons"
        response = requests.get(polygons_url)
        response.raise_for_status()
        data = response.json()

        if not data.get("success") or not data.get("polygons"):
            log.error(f"{LogColors.FAIL}Failed to fetch or parse polygons data from {polygons_url}. Response: {data}{LogColors.ENDC}")
            return None

        all_building_points = []
        for polygon in data["polygons"]:
            if "buildingPoints" in polygon and isinstance(polygon["buildingPoints"], list):
                all_building_points.extend(polygon["buildingPoints"])
        
        if not all_building_points:
            log.warning(f"{LogColors.WARNING}No buildingPoints found in polygons data from {polygons_url}.{LogColors.ENDC}")
            return None

        random_point = random.choice(all_building_points)
        
        if "lat" in random_point and "lng" in random_point:
            new_position_coords = {
                "lat": float(random_point["lat"]),
                "lng": float(random_point["lng"])
            }
            new_position_str = json.dumps(new_position_coords)

            # Update citizen record in Airtable
            try:
                tables['citizens'].update(citizen_record['id'], {'Position': new_position_str})
                log.info(f"{LogColors.OKGREEN}Successfully updated citizen {citizen_custom_id} (Airtable ID: {citizen_record['id']}) with new random position: {new_position_str}{LogColors.ENDC}")
                return new_position_coords
            except Exception as e_update:
                log.error(f"{LogColors.FAIL}Failed to update citizen {citizen_custom_id} position in Airtable: {e_update}{LogColors.ENDC}")
                return None
        else:
            log.warning(f"{LogColors.WARNING}Selected random building point is missing lat/lng: {random_point}{LogColors.ENDC}")
            return None

    except requests.exceptions.RequestException as e_req:
        log.error(f"{LogColors.FAIL}Request error fetching polygons for random position: {e_req}{LogColors.ENDC}")
        return None
    except json.JSONDecodeError as e_json:
        log.error(f"{LogColors.FAIL}JSON decode error fetching polygons for random position: {e_json}{LogColors.ENDC}")
        return None
    except Exception as e_general:
        log.error(f"{LogColors.FAIL}General error fetching or assigning random position for {citizen_custom_id}: {e_general}{LogColors.ENDC}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create activities for idle citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--citizen", type=str, help="Process activities for a specific citizen by username.")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    create_activities(dry_run=args.dry_run, target_citizen_username=args.citizen)
