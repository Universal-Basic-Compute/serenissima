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
TRANSPORT_API_URL = "http://localhost:3000/api/transport"
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

def process_citizen_activity(tables, citizen: Dict, is_night: bool, resource_defs: Dict) -> bool:
    """Process activity creation for a single citizen."""
    # Get citizen identifiers
    citizen_custom_id = citizen['fields'].get('CitizenId') # The custom ID, e.g., ctz_...
    citizen_username = citizen['fields'].get('Username')   # The Username
    citizen_airtable_record_id = citizen['id']             # The Airtable record ID, e.g., rec...

    # Validate essential identifiers
    if not citizen_custom_id:
        log.error(f"{LogColors.FAIL}Missing CitizenId in citizen record: {citizen_airtable_record_id}{LogColors.ENDC}")
        return False
    if not citizen_username:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_custom_id} (Record ID: {citizen_airtable_record_id}) has no Username, using CitizenId as fallback for username.{LogColors.ENDC}")
        citizen_username = citizen_custom_id
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    log.info(f"{LogColors.HEADER}Processing activity for citizen {citizen_name} (CustomID: {citizen_custom_id}, Username: {citizen_username}, RecordID: {citizen_airtable_record_id}){LogColors.ENDC}")
    
    VENICE_TIMEZONE_PROC = pytz.timezone('Europe/Rome') # Define for this scope
    now_venice_dt = datetime.datetime.now(VENICE_TIMEZONE_PROC)
    now_utc_dt = now_venice_dt.astimezone(pytz.UTC) # Keep UTC for comparisons if AteAt is UTC

    # --- HIGH PRIORITY: HUNGER CHECK ---
    ate_at_str = citizen['fields'].get('AteAt')
    is_hungry = False
    if ate_at_str:
        try:
            # Ensure correct parsing of ISO format string, potentially with 'Z'
            if ate_at_str.endswith('Z'):
                 ate_at_dt = datetime.datetime.fromisoformat(ate_at_str[:-1] + "+00:00")
            else:
                ate_at_dt = datetime.datetime.fromisoformat(ate_at_str)

            if ate_at_dt.tzinfo is None: # If naive, assume UTC
                ate_at_dt = ate_at_dt.replace(tzinfo=pytz.UTC)
            
            if (now_utc_dt - ate_at_dt) > datetime.timedelta(hours=12):
                is_hungry = True
        except ValueError as ve:
            log.warning(f"{LogColors.WARNING}Could not parse AteAt timestamp '{ate_at_str}' for citizen {citizen_username}. Error: {ve}. Assuming hungry.{LogColors.ENDC}")
            is_hungry = True 
    else: 
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no AteAt timestamp. Assuming hungry.{LogColors.ENDC}")
        is_hungry = True

    # Get citizen's position - needed for hunger logic too
    citizen_position = None
    try:
        # First try to get position from the Position field
        position_str = citizen['fields'].get('Position')
        if position_str:
            citizen_position = json.loads(position_str)
        
        # If Position is missing or invalid, try to extract from Point field
        if not citizen_position:
            point_str = citizen['fields'].get('Point')
            if point_str and isinstance(point_str, str):
                # Parse the Point field which has format like "citizen_45.437908_12.337258"
                parts = point_str.split('_')
                if len(parts) >= 3:
                    try:
                        lat = float(parts[1])
                        lng = float(parts[2])
                        citizen_position = {"lat": lat, "lng": lng}
                        log.info(f"{LogColors.OKBLUE}Extracted position from Point field for citizen {citizen_custom_id}: {citizen_position}{LogColors.ENDC}")
                    except (ValueError, IndexError):
                        log.warning(f"{LogColors.WARNING}Failed to parse coordinates from Point field: {point_str}{LogColors.ENDC}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"{LogColors.WARNING}Invalid position data for citizen {citizen_custom_id}: {citizen['fields'].get('Position')} - Error: {str(e)}{LogColors.ENDC}")
    
    citizen_position = None
    try:
        position_str = citizen['fields'].get('Position')
        if position_str:
            citizen_position = json.loads(position_str)
        if not citizen_position:
            point_str = citizen['fields'].get('Point')
            if point_str and isinstance(point_str, str):
                parts = point_str.split('_')
                if len(parts) >= 3:
                    try:
                        lat = float(parts[1])
                        lng = float(parts[2])
                        citizen_position = {"lat": lat, "lng": lng}
                    except (ValueError, IndexError):
                        log.warning(f"{LogColors.WARNING}Failed to parse coordinates from Point field: {point_str} for citizen {citizen_custom_id}{LogColors.ENDC}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"{LogColors.WARNING}Invalid position data for citizen {citizen_custom_id}: {citizen['fields'].get('Position')} - Error: {str(e)}{LogColors.ENDC}")

    if not citizen_position:
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_custom_id} has no position. Attempting to assign a random starting position.{LogColors.ENDC}")
        # API_BASE_URL should be defined in the scope of create_activities or globally in this file
        api_base_url_for_random_pos = os.getenv("API_BASE_URL", "http://localhost:3000")
        new_position = _fetch_and_assign_random_starting_position(tables, citizen, api_base_url_for_random_pos)
        if new_position:
            citizen_position = new_position
            # Update the citizen record in Airtable with the new position string
            # The helper function _fetch_and_assign_random_starting_position already does this.
            log.info(f"{LogColors.OKGREEN}Assigned random starting position {citizen_position} to citizen {citizen_custom_id}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Failed to assign a random starting position to citizen {citizen_custom_id}. Creating idle activity.{LogColors.ENDC}")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data and failed to assign random position.")
            return True # Activity created (idle)

    if is_hungry:
        log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} is hungry. Attempting to create eat activity.{LogColors.ENDC}")
        food_resource_types = ["bread", "fish", "preserved_fish"] # Example food types
        # In a real scenario, get this from resource_defs by category 'food'

        # Option 1: Eat from inventory
        for food_type in food_resource_types:
            # Query RESOURCES: AssetType='citizen', Asset=citizen_username, Owner=citizen_username, Type=food_type
            formula = (f"AND({{AssetType}}='citizen', {{Asset}}='{_escape_airtable_value(citizen_username)}', "
                       f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type)}')")
            try:
                inventory_food = tables['resources'].all(formula=formula, max_records=1)
                if inventory_food and float(inventory_food[0]['fields'].get('Count', 0)) >= 1.0:
                    log.info(f"{LogColors.OKGREEN}Found {food_type} in {citizen_username}'s inventory. Attempting to create 'eat_from_inventory'.{LogColors.ENDC}")
                    if try_create_eat_from_inventory_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, food_type, 1.0):
                        log.info(f"{LogColors.OKGREEN}Successfully created 'eat_from_inventory' for {food_type}.{LogColors.ENDC}")
                        return True # Activity created
                    else:
                        log.warning(f"{LogColors.WARNING}Failed to create 'eat_from_inventory' for {food_type} despite being found.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}Food type {food_type} not found or insufficient in {citizen_username}'s inventory.{LogColors.ENDC}")
            except Exception as e_inv_food:
                log.error(f"{LogColors.FAIL}Error checking inventory food for {citizen_username}: {e_inv_food}{LogColors.ENDC}")
        
        log.info(f"{LogColors.OKBLUE}Finished checking inventory for food. Proceeding to check home.{LogColors.ENDC}")
        home = get_citizen_home(tables, citizen_custom_id) # Uses custom_id
        home_position = _get_building_position_coords(home) if home else None
        is_at_home = (citizen_position and home_position and 
                      _calculate_distance_meters(citizen_position, home_position) < 20) if home else False

        # Option 2: Eat at home
        if home:
            home_building_id = home['fields'].get('BuildingId', home['id']) # Custom ID
            home_airtable_id = home['id'] # Airtable Record ID
            
            has_food_at_home = False
            food_type_at_home = None
            for food_type in food_resource_types:
                # Query RESOURCES: AssetType='building', Asset=home_building_id, Owner=citizen_username, Type=food_type
                formula_home = (f"AND({{AssetType}}='building', {{Asset}}='{_escape_airtable_value(home_building_id)}', "
                                f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type)}')")
                try:
                    home_food = tables['resources'].all(formula=formula_home, max_records=1)
                    if home_food and float(home_food[0]['fields'].get('Count', 0)) >= 1.0:
                        has_food_at_home = True
                        food_type_at_home = food_type
                        log.info(f"{LogColors.OKGREEN}Found {food_type_at_home} at home {home_building_id} for {citizen_username}.{LogColors.ENDC}")
                        break
                    else:
                        log.info(f"{LogColors.OKBLUE}Food type {food_type} not found or insufficient in home {home_building_id} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e_home_food:
                    log.error(f"{LogColors.FAIL}Error checking home food for {citizen_username} in {home_building_id}: {e_home_food}{LogColors.ENDC}")
            
            if has_food_at_home and food_type_at_home:
                log.info(f"{LogColors.OKBLUE}Attempting to create activity to eat {food_type_at_home} at home {home_building_id}. Citizen is_at_home: {is_at_home}.{LogColors.ENDC}")
                # Determine path_data only if not at home
                path_data_for_eat_sequence = None
                if not is_at_home:
                    if citizen_position and home_position:
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not at home. Calculating path to home {home_building_id} to eat.{LogColors.ENDC}")
                        path_data_for_eat_sequence = get_path_between_points_helper(citizen_position, home_position, TRANSPORT_API_URL) 
                        if not (path_data_for_eat_sequence and path_data_for_eat_sequence.get('success')):
                            log.warning(f"{LogColors.WARNING}Path finding to home {home_building_id} failed for {citizen_username} to eat. Path data: {path_data_for_eat_sequence}{LogColors.ENDC}")
                            # path_data_for_eat_sequence will be None or invalid, try_create_eat_at_home_activity should handle this
                        else:
                            log.info(f"{LogColors.OKGREEN}Path to home {home_building_id} found for {citizen_username} to eat.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} not at home, but citizen_position or home_position is missing. Cannot pathfind to home to eat.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is already at home {home_building_id}. No pathfinding needed to eat at home.{LogColors.ENDC}")
                
                # Call the modified try_create_eat_at_home_activity
                # It will internally decide to create 'goto_home' or 'eat_at_home'
                activity_created = try_create_eat_at_home_activity(
                    tables,
                    citizen_custom_id,
                    citizen_username,
                    citizen_airtable_record_id,
                    # home_building_airtable_id, # No longer needed by creator if custom_id is primary
                    home_building_id,          # Custom BuildingId for 'eat_at_home' and 'goto_home'
                    food_type_at_home,
                    1.0,                       # Amount to eat
                    is_at_home,
                    path_data_for_eat_sequence # Path data, or None if at home or path failed
                )
                if activity_created:
                    log.info(f"{LogColors.OKGREEN}Activity ({activity_created['fields'].get('Type')}) created for {citizen_username} regarding eating {food_type_at_home} at home.{LogColors.ENDC}")
                    return True # Activity (either goto_home or eat_at_home) created
                else:
                    log.warning(f"{LogColors.WARNING}Failed to create 'eat_at_home' or 'goto_home' (to eat) activity for {citizen_username} at {home_building_id}.{LogColors.ENDC}")
            else:
                log.info(f"{LogColors.OKBLUE}No food found at home {home_building_id} for {citizen_username}.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no home. Cannot eat at home.{LogColors.ENDC}")

        log.info(f"{LogColors.OKBLUE}Finished checking home for food. Proceeding to check taverns.{LogColors.ENDC}")
        # Option 3: Eat at tavern (if citizen has enough ducats)
        citizen_ducats = float(citizen['fields'].get('Ducats', 0))
        TAVERN_MEAL_COST_ESTIMATE = 10 # Estimate, actual cost in processor
        if citizen_ducats >= TAVERN_MEAL_COST_ESTIMATE:
            if citizen_position: # Need citizen position to find closest tavern
                closest_tavern = get_closest_inn(tables, citizen_position) # Using get_closest_inn as a proxy for tavern
                if closest_tavern:
                    tavern_position_coords = _get_building_position_coords(closest_tavern)
                    tavern_airtable_id = closest_tavern['id']
                    tavern_custom_id = closest_tavern['fields'].get('BuildingId', tavern_airtable_id)

                    if tavern_position_coords:
                        is_at_tavern = _calculate_distance_meters(citizen_position, tavern_position_coords) < 20
                        if is_at_tavern:
                            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is at tavern {tavern_custom_id}. Attempting to create 'eat_at_tavern' activity.{LogColors.ENDC}")
                            if try_create_eat_at_tavern_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, tavern_custom_id): # Pass custom_id
                                log.info(f"{LogColors.OKGREEN}Successfully created 'eat_at_tavern' for {citizen_username} at {tavern_custom_id}.{LogColors.ENDC}")
                                return True
                            else:
                                log.warning(f"{LogColors.WARNING}Failed to create 'eat_at_tavern' for {citizen_username} at {tavern_custom_id} despite being there.{LogColors.ENDC}")
                        else: # Not at tavern, create goto_tavern
                            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} not at tavern {tavern_custom_id}. Finding path to tavern.{LogColors.ENDC}")
                            path_data = get_path_between_points_helper(citizen_position, tavern_position_coords, TRANSPORT_API_URL) 
                            if path_data and path_data.get('success'):
                                log.info(f"{LogColors.OKGREEN}Path to tavern {tavern_custom_id} found. Attempting to create 'travel_to_inn' (for tavern).{LogColors.ENDC}")
                                # Create a generic goto_inn, assuming it can be used for taverns too
                                # try_create_travel_to_inn_activity expects custom BuildingId for inn_id
                                if try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, tavern_custom_id, path_data): 
                                    log.info(f"{LogColors.OKGREEN}Successfully created 'travel_to_inn' (for tavern) for {citizen_username} to {tavern_custom_id}.{LogColors.ENDC}")
                                    return True
                                else:
                                    log.warning(f"{LogColors.WARNING}Failed to create 'travel_to_inn' (for tavern) for {citizen_username} to {tavern_custom_id}.{LogColors.ENDC}")
                            else:
                                log.warning(f"{LogColors.WARNING}Path finding to tavern {tavern_custom_id} failed for {citizen_username}.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}Closest tavern {tavern_custom_id} has no position data.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}No taverns found for {citizen_username} to eat at.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Citizen {citizen_username} is hungry but has no position data to find a tavern.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is hungry but has insufficient ducats ({citizen_ducats}) for a tavern meal (cost: {TAVERN_MEAL_COST_ESTIMATE}).{LogColors.ENDC}")

        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} is hungry but no eating option was successfully created. Proceeding to other activities.{LogColors.ENDC}")
    else: # Not hungry
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not hungry. Skipping hunger logic.{LogColors.ENDC}")
    
    # --- END HUNGER CHECK ---

    # Re-check citizen_position after hunger logic, as it might have been set if they went home to eat.
    # However, the primary assignment of random position happens before hunger check if initially null.
    # This re-check is more for ensuring subsequent logic has a position if one was determined during hunger resolution.
    if not citizen_position:
        # Attempt to re-fetch from citizen record if it was updated by an eat_at_home -> goto_home sequence.
        # This is a bit complex as process_citizen_activity doesn't re-fetch the whole citizen record mid-flow.
        # For now, we rely on the initial position check or the random assignment.
        # If still no position here, it means random assignment also failed or wasn't triggered appropriately.
        log.warning(f"{LogColors.WARNING}Citizen {citizen_custom_id} still has no position data after hunger check. This might lead to issues for subsequent activities.{LogColors.ENDC}")
        # Fallback to idle if absolutely no position can be determined.
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data available after hunger check.")
        return True


    # --- SHOPPING LOGIC ---
    # This comes after hunger, but before general night/day work/home logic.
    # It's a daytime/evening activity.
    if not is_hungry and is_shopping_time_helper(now_venice_dt) and not is_night: # Ensure not hungry, it's shopping time, and not deep night
        log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} - It's shopping time.{LogColors.ENDC}")
        current_load = get_citizen_current_load(tables, citizen_username)
        remaining_capacity = CITIZEN_CARRY_CAPACITY - current_load
        citizen_social_class = citizen['fields'].get('SocialClass', 'Facchini')
        citizen_max_tier_access = SOCIAL_CLASS_VALUE.get(citizen_social_class, 1)
        citizen_ducats = float(citizen['fields'].get('Ducats', 0))

        home = get_citizen_home(tables, citizen_custom_id) # For depositing or as ToBuilding

        if remaining_capacity <= 0.1: # Inventory is full (using a small epsilon)
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username}'s inventory is full. Attempting to go home.{LogColors.ENDC}")
            if home:
                home_position = _get_building_position_coords(home)
                home_custom_id = home['fields'].get('BuildingId', home['id'])
                if citizen_position and home_position and _calculate_distance_meters(citizen_position, home_position) > 20:
                    path_to_home_for_deposit = get_path_between_points_helper(citizen_position, home_position, TRANSPORT_API_URL) 
                    if path_to_home_for_deposit and path_to_home_for_deposit.get('success'):
                        if try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_custom_id, path_to_home_for_deposit):
                            return True # Activity created to go home and deposit
                    else:
                        log.warning(f"{LogColors.WARNING}Path to home for deposit failed for {citizen_username}.{LogColors.ENDC}")
                # If already at home, or path failed, they will likely become idle or rest if night.
            else:
                log.warning(f"{LogColors.WARNING}Citizen {citizen_username} inventory full but no home to deposit items.{LogColors.ENDC}")
        elif home: # Inventory has space, and citizen has a home (to use as ToBuilding)
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has {remaining_capacity:.2f} inventory space. Looking for items to shop.{LogColors.ENDC}")
            potential_purchases = []
            
            # Filter resource definitions by tier access
            shoppable_resources_defs = {
                res_id: res_data for res_id, res_data in resource_defs.items()
                if int(res_data.get('tier', 0) or 0) <= citizen_max_tier_access and int(res_data.get('tier', 0) or 0) > 0
            }
            log.debug(f"Citizen {citizen_username} (Class: {citizen_social_class}, MaxTier: {citizen_max_tier_access}) can shop for {len(shoppable_resources_defs)} resource types.")

            if shoppable_resources_defs:
                # Fetch active public_sell contracts
                active_sell_contracts_formula = f"AND({{Type}}='public_sell', {{EndAt}}>'{now_utc_dt.isoformat()}', {{CreatedAt}}<='{now_utc_dt.isoformat()}', {{Amount}}>0)"
                try:
                    all_public_sell_contracts = tables['contracts'].all(formula=active_sell_contracts_formula)
                    log.debug(f"Found {len(all_public_sell_contracts)} active public_sell contracts.")

                    for res_id, res_data in shoppable_resources_defs.items():
                        contracts_for_this_resource = [
                            c for c in all_public_sell_contracts if c['fields'].get('ResourceType') == res_id
                        ]
                        if not contracts_for_this_resource:
                            continue

                        for contract_record in contracts_for_this_resource:
                            seller_building_custom_id = contract_record['fields'].get('SellerBuilding')
                            if not seller_building_custom_id: continue

                            seller_building_record = get_building_record(tables, seller_building_custom_id)
                            if not seller_building_record: continue
                            
                            seller_building_pos = _get_building_position_coords(seller_building_record)
                            if not citizen_position or not seller_building_pos: continue

                            distance = _calculate_distance_meters(citizen_position, seller_building_pos)
                            if distance == float('inf') or distance == 0: distance = 100000 # Avoid division by zero, penalize far/same loc
                            
                            import_price = float(res_data.get('importPrice', 0))
                            price_multiplier = 2.0 if res_data.get('subcategory') == 'food' else 1.0
                            priority_score = (import_price * price_multiplier) / distance

                            potential_purchases.append({
                                "score": priority_score,
                                "resource_id": res_id,
                                "resource_name": res_data.get('name', res_id),
                                "contract_record": contract_record,
                                "seller_building_record": seller_building_record,
                                "distance": distance
                            })
                    
                    potential_purchases.sort(key=lambda x: x['score'], reverse=True)
                    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has {len(potential_purchases)} potential shopping items, sorted by priority.{LogColors.ENDC}")

                    for purchase_candidate in potential_purchases:
                        contract = purchase_candidate['contract_record']
                        seller_building = purchase_candidate['seller_building_record']
                        resource_id_to_buy = purchase_candidate['resource_id']
                        
                        price_per_unit = float(contract['fields'].get('PricePerResource', 0))
                        contract_amount_available = float(contract['fields'].get('Amount', 0))

                        if price_per_unit <= 0: continue

                        max_affordable_units = citizen_ducats / price_per_unit
                        
                        amount_to_buy = min(remaining_capacity, contract_amount_available, max_affordable_units)
                        amount_to_buy = float(f"{amount_to_buy:.4f}") # Standardize precision, ensure it's not too small

                        if amount_to_buy >= 0.1: # Buy at least 0.1 units
                            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} attempting to buy {amount_to_buy:.2f} of {resource_id_to_buy} from {seller_building['fields'].get('BuildingId')}.{LogColors.ENDC}")
                            seller_building_pos = _get_building_position_coords(seller_building) # Already fetched
                            
                            path_to_seller = get_path_between_points_helper(citizen_position, seller_building_pos, TRANSPORT_API_URL) 
                            if path_to_seller and path_to_seller.get('success'):
                                home_custom_id_for_delivery = home['fields'].get('BuildingId', home['id'])
                                # Create fetch_resource: citizen goes to seller, buys, item goes to inventory.
                                # ToBuilding is home, as that's the eventual destination.
                                if try_create_resource_fetching_activity(
                                    tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                                    contract['id'], # Airtable ID of the public_sell contract
                                    seller_building['fields'].get('BuildingId'), # Custom ID of seller building
                                    home_custom_id_for_delivery, # Custom ID of citizen's home
                                    resource_id_to_buy, amount_to_buy, path_to_seller
                                ):
                                    log.info(f"{LogColors.OKGREEN}Shopping activity (fetch_resource) created for {citizen_username} to buy {resource_id_to_buy}.{LogColors.ENDC}")
                                    return True # Shopping activity created
                            else:
                                log.warning(f"{LogColors.WARNING}Path to seller {seller_building['fields'].get('BuildingId')} failed for {citizen_username}.{LogColors.ENDC}")
                        else:
                            log.debug(f"{LogColors.OKBLUE}Calculated amount_to_buy for {resource_id_to_buy} is too small ({amount_to_buy:.4f}). Skipping.{LogColors.ENDC}")
                except Exception as e_shop_contracts:
                    log.error(f"{LogColors.FAIL}Error during shopping contract processing for {citizen_username}: {e_shop_contracts}{LogColors.ENDC}")
            else: # No shoppable resource definitions
                log.info(f"{LogColors.OKBLUE}No shoppable resource definitions for {citizen_username} based on tier access.{LogColors.ENDC}")
        else: # No home to use as ToBuilding
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no home, cannot determine 'ToBuilding' for shopping fetch. Skipping shopping.{LogColors.ENDC}")
            
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} did not create a shopping activity this cycle.{LogColors.ENDC}")
    # --- END SHOPPING LOGIC ---

    home_city = citizen['fields'].get('HomeCity') # Check if citizen is a visitor
    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} HomeCity: '{home_city}'{LogColors.ENDC}")

    if not citizen_position: # Re-check after hunger logic if position was needed but missing
        log.warning(f"{LogColors.WARNING}Citizen {citizen_custom_id} has no position data, creating idle activity{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data available.")
        return True
    
    # If it's nighttime, handle nighttime activities
    if is_night:
        log.info(f"{LogColors.OKCYAN}It is nighttime. Evaluating nighttime activities for {citizen_username}.{LogColors.ENDC}")
        if home_city and home_city.strip(): # Visitor logic
            log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} is a visitor from {home_city}. Finding an inn.{LogColors.ENDC}")
            closest_inn = get_closest_inn(tables, citizen_position)
            if closest_inn:
                inn_position_coords = _get_building_position_coords(closest_inn)
                inn_custom_id = closest_inn['fields'].get('BuildingId', closest_inn['id']) 
                inn_airtable_id = closest_inn['id'] # Airtable Record ID

                if inn_position_coords:
                    is_at_inn = _calculate_distance_meters(citizen_position, inn_position_coords) < 20
                    if is_at_inn:
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is already at inn {inn_custom_id}. Creating stay activity.{LogColors.ENDC}")
                        venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE)
                        if venice_now.hour < NIGHT_END_HOUR:
                            end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                        else:
                            end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                        stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                        try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_custom_id, stay_location_type="inn", end_time_utc_iso=stay_end_time_utc_iso) # Pass custom BuildingId
                    else:
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not at inn {inn_custom_id}. Finding path to inn.{LogColors.ENDC}")
                        path_data = get_path_between_points_helper(citizen_position, inn_position_coords, TRANSPORT_API_URL) 
                        if path_data and path_data.get('success'):
                            try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_custom_id, path_data) # Pass custom BuildingId
                        else:
                            log.warning(f"{LogColors.WARNING}Path finding to inn {inn_custom_id} failed for {citizen_username}. Creating idle activity.{LogColors.ENDC}")
                            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to inn {inn_custom_id} failed.")
                else:
                    log.warning(f"{LogColors.WARNING}Inn {closest_inn['id'] if closest_inn else 'N/A'} has no position data. Creating idle activity for {citizen_username}.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Inn has no position data.")
            else:
                log.warning(f"{LogColors.WARNING}No inn found for visitor {citizen_username}. Creating idle activity.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No inn found for visitor.")

        else: # Resident logic
            log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} is a resident or HomeCity is not set. Evaluating home situation.{LogColors.ENDC}")
            home = get_citizen_home(tables, citizen_custom_id)
            if not home:
                log.warning(f"{LogColors.WARNING}Resident {citizen_custom_id} has no home, creating idle activity.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No home assigned.")
                return True
            
            home_position = _get_building_position_coords(home)
            home_custom_id = home['fields'].get('BuildingId', home['id']) 
            home_airtable_id = home['id'] # Airtable Record ID

            if not home_position:
                log.warning(f"{LogColors.WARNING}Home {home_custom_id} has no position data, creating idle for resident {citizen_custom_id}{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Home has no position data.")
                return True
            
            is_at_home = _calculate_distance_meters(citizen_position, home_position) < 20
            if is_at_home:
                venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE)
                if venice_now.hour < NIGHT_END_HOUR:
                    end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                else:
                    end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                log.info(f"{LogColors.OKBLUE}Resident {citizen_username} is at home {home_custom_id}. Creating stay activity.{LogColors.ENDC}")
                try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_custom_id, stay_location_type="home", end_time_utc_iso=stay_end_time_utc_iso) # Pass custom BuildingId
            else:
                log.info(f"{LogColors.OKBLUE}Resident {citizen_username} is not at home {home_custom_id}. Finding path home.{LogColors.ENDC}")
                path_data = get_path_between_points_helper(citizen_position, home_position, TRANSPORT_API_URL) 
                if path_data and path_data.get('success'):
                    log.info(f"{LogColors.OKGREEN}Path to home {home_custom_id} found. Creating 'goto_home' activity.{LogColors.ENDC}")
                    try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_custom_id, path_data) # Pass custom BuildingId
                else:
                    log.warning(f"{LogColors.WARNING}Path finding to home failed for resident {citizen_custom_id}. Creating idle activity.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to home {home_custom_id} failed.")
    else: # Daytime
        log.info(f"{LogColors.OKCYAN}It is daytime. Evaluating daytime activities for {citizen_username}.{LogColors.ENDC}")
        # Daytime activities
        workplace = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
        if workplace:
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has a workplace: {workplace['fields'].get('BuildingId', workplace['id'])}.{LogColors.ENDC}")
            workplace_position = _get_building_position_coords(workplace)
            workplace_custom_id = workplace['fields'].get('BuildingId', workplace['id']) 
            workplace_airtable_id = workplace['id'] # Airtable Record ID

            if not workplace_position:
                log.warning(f"{LogColors.WARNING}Workplace {workplace_custom_id} has no position data, creating idle activity{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Workplace has no position data.")
                return True
            
            is_at_workplace = _calculate_distance_meters(citizen_position, workplace_position) < 20
            if is_at_workplace: # Citizen is at their workplace
                log.info(f"{LogColors.OKBLUE}Citizen {citizen_custom_id} is at workplace {workplace_custom_id}. Checking for production/fetching.{LogColors.ENDC}")
                building_type = workplace['fields'].get('Type')
                api_base_url_for_btype = os.getenv("API_BASE_URL", "http://localhost:3000")
                building_type_info = get_building_type_info(building_type, api_base_url_for_btype)
                if building_type_info and 'productionInformation' in building_type_info:
                    production_info = building_type_info['productionInformation']
                    if 'Arti' in production_info and isinstance(production_info['Arti'], list):
                        recipes = production_info['Arti']
                        building_resources = get_building_resources(tables, workplace_custom_id) # Use custom ID
                        selected_recipe = next((r for r in recipes if can_produce_output(building_resources, r)), None)
                        if selected_recipe:
                            try_create_production_activity(tables, citizen_airtable_record_id, citizen_custom_id, citizen_username, workplace_custom_id, selected_recipe) # Pass custom BuildingId
                            return True
                
                # Fetch contracts for the workplace operator (RunBy)
                workplace_operator_username = workplace['fields'].get('RunBy')
                if not workplace_operator_username:
                    log.warning(f"{LogColors.WARNING}Workplace {workplace_custom_id} has no operator (RunBy). Cannot fetch contracts for it.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}Fetching contracts for workplace operator: {workplace_operator_username}{LogColors.ENDC}")
                    contracts = get_citizen_contracts(tables, workplace_operator_username) # Use workplace operator's username
                    if contracts:
                        for contract in contracts:
                            # Ensure the contract's BuyerBuilding is this workplace
                            if contract['fields'].get('BuyerBuilding') != workplace_custom_id:
                                log.debug(f"Skipping contract {contract['id']} for operator {workplace_operator_username} as its BuyerBuilding ({contract['fields'].get('BuyerBuilding')}) is not the current workplace ({workplace_custom_id}).")
                                continue

                            from_building_id_contract = contract['fields'].get('SellerBuilding') # Custom ID
                        to_building_id_contract = contract['fields'].get('BuyerBuilding')   # Custom ID
                        
                        if from_building_id_contract and to_building_id_contract:
                            from_buildings_contract = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(from_building_id_contract)}'")
                            to_buildings_contract = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(to_building_id_contract)}'")

                            if from_buildings_contract and to_buildings_contract:
                                from_building_rec = from_buildings_contract[0]
                                to_building_rec = to_buildings_contract[0]
                                resource_type_contract = contract['fields'].get('ResourceType')
                                amount_contract = float(contract['fields'].get('HourlyAmount', 0) or 0) # Use HourlyAmount
                                
                                source_resources_contract = get_building_resources(tables, from_building_id_contract) # Use custom ID
                                if resource_type_contract in source_resources_contract and source_resources_contract[resource_type_contract] >= amount_contract and amount_contract > 0:
                                    # Citizen is at workplace (to_building_id_contract), needs to go to from_building_id_contract
                                    if workplace_custom_id == from_building_id_contract: # Already at source
                                         log.info(f"Citizen {citizen_username} is already at source building {from_building_id_contract} for contract. This case needs review for fetch logic.")
                                         # This might mean they should be delivering, not fetching, or the contract is misconfigured.
                                         # For now, let's assume they need to fetch from another building.
                                    elif citizen_position and _get_building_position_coords(from_building_rec):
                                        # Check for recent failures for this fetch_resource task
                                        # For fetch_resource, ContractId in ACTIVITIES is the Airtable Record ID of the contract
                                        if _has_recent_failed_activity_for_contract(tables, 'fetch_resource', contract['id']):
                                            log.info(f"{LogColors.OKBLUE}Skipping fetch_resource for contract {contract['id']} (Airtable ID) due to recent failure.{LogColors.ENDC}")
                                            continue # Skip this contract, try next one

                                        path_to_source = get_path_between_points_helper(citizen_position, _get_building_position_coords(from_building_rec), TRANSPORT_API_URL) 
                                        if path_to_source and path_to_source.get('success'):
                                            from_building_custom_id_contract = from_building_rec['fields'].get('BuildingId')
                                            to_building_custom_id_contract = to_building_rec['fields'].get('BuildingId')
                                            if from_building_custom_id_contract and to_building_custom_id_contract:
                                                if try_create_resource_fetching_activity(
                                                    tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                                                    contract['id'], from_building_custom_id_contract, to_building_custom_id_contract, # Pass custom BuildingIds
                                                    resource_type_contract, amount_contract, path_to_source
                                                ):
                                                    return True # Activity created
                                            else:
                                                log.warning(f"{LogColors.WARNING}Missing custom BuildingId for contract buildings: From={from_building_custom_id_contract}, To={to_building_custom_id_contract}{LogColors.ENDC}")
                log.info(f"{LogColors.OKBLUE}No production or fetching tasks available for {citizen_custom_id} at workplace {workplace_custom_id}. Creating idle activity.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No production or fetching tasks available at workplace.")
            else: # Not at workplace, needs to go to work
                log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not at workplace. Evaluating travel to work.{LogColors.ENDC}")
                # Check if citizen is at home before creating goto_work
                home_for_departure_check = get_citizen_home(tables, citizen_custom_id) # Re-fetch or use existing `home` if available
                is_at_home_for_work_departure = False
                citizen_pos_str_for_pickup = citizen['fields'].get('Position') # Current position as string

                if home_for_departure_check and citizen_position:
                    home_pos_for_departure_check = _get_building_position_coords(home_for_departure_check)
                    if home_pos_for_departure_check:
                        is_at_home_for_work_departure = _calculate_distance_meters(citizen_position, home_pos_for_departure_check) < 20
                
                log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} needs to go to work. Is at home: {is_at_home_for_work_departure}.{LogColors.ENDC}")

                path_data = get_path_between_points_helper(citizen_position, workplace_position, TRANSPORT_API_URL) 
                if path_data and path_data.get('success'):
                    try_create_goto_work_activity(
                        tables, 
                        citizen_custom_id, 
                        citizen_username, 
                        citizen_airtable_record_id, 
                        workplace_custom_id, # Pass custom BuildingId of workplace
                        path_data,
                        home_for_departure_check, # Pass home record
                        resource_defs,            # Pass global resource definitions
                        is_at_home_for_work_departure, # Pass is_at_home status
                        citizen_pos_str_for_pickup # Pass citizen's current position string
                    )
                    log.info(f"{LogColors.OKGREEN}Created 'goto_work' activity for {citizen_username} to {workplace_custom_id}.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}Path to workplace {workplace_custom_id} failed for {citizen_custom_id}. Creating idle activity.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to workplace {workplace_custom_id} failed.")
        else: # No workplace
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no workplace. Creating idle activity.{LogColors.ENDC}")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No workplace assigned.")
    return True

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
                activity_created_for_citizen = process_citizen_activity(tables, citizen_record, night_time, resource_defs)
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
