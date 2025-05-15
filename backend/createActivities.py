#!/usr/bin/env python3
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
from collections import defaultdict
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("create_activities")

# Load environment variables
load_dotenv()

# Constants
TRANSPORT_API_URL = "http://localhost:3000/api/transport"
VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
NIGHT_START_HOUR = 22  # 10 PM
NIGHT_END_HOUR = 6     # 6 AM
IDLE_ACTIVITY_DURATION_HOURS = 1

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
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'activities': Table(api_key, base_id, 'ACTIVITIES'),
            'contracts': Table(api_key, base_id, 'CONTRACTS'),
            'resources': Table(api_key, base_id, 'RESOURCES')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_citizen_contracts(tables, citizen_id: str) -> List[Dict]:
    """Get all active contracts where the citizen is the buyer, sorted by priority."""
    log.info(f"Fetching contracts for citizen {citizen_id}")
    
    try:
        # Get current time
        now = datetime.datetime.now().isoformat()
        
        # Query contracts where the citizen is the buyer, type is recurrent, and the contract is active
        formula = f"AND({{Buyer}}='{citizen_id}', {{Type}}='recurrent', {{CreatedAt}}<='{now}', {{EndAt}}>='{now}')"
        contracts = tables['contracts'].all(formula=formula)
        
        # Sort by Priority in descending order
        contracts.sort(key=lambda x: int(x['fields'].get('Priority', 0) or 0), reverse=True)
        
        log.info(f"Found {len(contracts)} active contracts for citizen {citizen_id}")
        return contracts
    except Exception as e:
        log.error(f"Error getting contracts for citizen {citizen_id}: {e}")
        return []

def get_building_type_info(building_type: str) -> Optional[Dict]:
    """Get building type information from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/building-types"
        
        log.info(f"Fetching building type info for {building_type} from API: {url}")
        
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
                        log.info(f"Found building type info for {building_type}")
                        return bt
                
                log.warning(f"Building type {building_type} not found in API response")
                return None
            else:
                log.error(f"Unexpected API response format: {data}")
                return None
        else:
            log.error(f"Error fetching building types from API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log.error(f"Exception fetching building type info: {str(e)}")
        return None

def get_building_resources(tables, building_id: str) -> Dict[str, float]:
    """Get all resources in a building, returned as a dictionary of resource_type -> count."""
    try:
        formula = f"{{BuildingId}}='{building_id}'"
        resources = tables['resources'].all(formula=formula)
        
        # Convert to dictionary for easier lookup
        resource_dict = {}
        for resource in resources:
            resource_type = resource['fields'].get('Type', '')
            count = float(resource['fields'].get('Count', 0) or 0)
            resource_dict[resource_type] = count
        
        log.info(f"Found {len(resources)} resources in building {building_id}")
        return resource_dict
    except Exception as e:
        log.error(f"Error getting resources for building {building_id}: {e}")
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
                            log.info(f"Extracted position from Point field for building {from_building['fields'].get('BuildingId', from_building['id'])}: {from_position}")
                        except (ValueError, IndexError):
                            log.warning(f"Failed to parse coordinates from Point field: {from_point_str}")
            
            if not to_position:
                to_point_str = to_building['fields'].get('Point')
                if to_point_str and isinstance(to_point_str, str):
                    parts = to_point_str.split('_')
                    if len(parts) >= 3:
                        try:
                            lat = float(parts[1])
                            lng = float(parts[2])
                            to_position = {"lat": lat, "lng": lng}
                            log.info(f"Extracted position from Point field for building {to_building['fields'].get('BuildingId', to_building['id'])}: {to_position}")
                        except (ValueError, IndexError):
                            log.warning(f"Failed to parse coordinates from Point field: {to_point_str}")
        except (json.JSONDecodeError, TypeError) as e:
            log.warning(f"Invalid position data for buildings: {e}")
            return None
        
        if not from_position or not to_position:
            log.warning(f"Missing position data for buildings")
            return None
        
        # Construct the API URL
        url = f"{api_base_url}/api/transport"
        
        log.info(f"Finding path between buildings using API: {url}")
        
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
                log.info(f"Found path between buildings with {len(data['path'])} points")
                return data
            else:
                log.warning(f"No path found between buildings: {data.get('error', 'Unknown error')}")
                return None
        else:
            log.error(f"Error finding path between buildings: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log.error(f"Exception finding path between buildings: {str(e)}")
        return None

def create_resource_fetching_activity(tables, citizen: Dict, contract: Dict, from_building: Dict, to_building: Dict, path: Dict) -> Optional[Dict]:
    """Create a resource fetching activity based on a contract."""
    try:
        # Always use CitizenId from fields, not the Airtable record ID
        citizen_id = citizen['fields'].get('CitizenId')
        
        # If CitizenId is missing, log an error and return
        if not citizen_id:
            log.error(f"Missing CitizenId in citizen record: {citizen['id']}")
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
        activity_id = f"fetch_{citizen_id}_{uuid.uuid4()}"
        
        activity = tables['activities'].create({
            "ActivityId": activity_id,
            "Type": "fetch_resource",
            "CitizenId": citizen_id,
            "ContractId": contract_id,
            "FromBuilding": from_building_id,
            "ToBuilding": to_building_id,
            "ResourceId": resource_type,
            "Amount": amount,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Path": json.dumps(path.get('path', [])),
            "Notes": f"Fetching {amount} units of {resource_type} from {from_building['fields'].get('Name', from_building_id)} to {to_building['fields'].get('Name', to_building_id)}"
        })
        
        log.info(f"Created resource fetching activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating resource fetching activity: {e}")
        return None

def create_production_activity(tables, citizen: Dict, building: Dict, recipe: Dict) -> Optional[Dict]:
    """Create a production activity based on a recipe."""
    try:
        # Always use CitizenId from fields, not the Airtable record ID
        citizen_id = citizen['fields'].get('CitizenId')
        
        # If CitizenId is missing, log an error and return
        if not citizen_id:
            log.error(f"Missing CitizenId in citizen record: {citizen['id']}")
            return None
        
        building_id = building['id']
        
        # Extract recipe details
        inputs = recipe.get('inputs', {})
        outputs = recipe.get('outputs', {})
        craft_minutes = recipe.get('craftMinutes', 60)  # Default to 60 minutes if not specified
        
        now = datetime.datetime.now()
        end_time = now + datetime.timedelta(minutes=craft_minutes)
        
        # Create a description of the production
        input_desc = ", ".join([f"{amount} {resource}" for resource, amount in inputs.items()])
        output_desc = ", ".join([f"{amount} {resource}" for resource, amount in outputs.items()])
        
        # Create the activity
        activity_id = f"produce_{citizen_id}_{uuid.uuid4()}"
        
        activity = tables['activities'].create({
            "ActivityId": activity_id,
            "Type": "production",
            "CitizenId": citizen_id,
            "FromBuilding": building_id,
            "ToBuilding": building_id,  # Same building for production
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": f"Producing {output_desc} from {input_desc}",
            "RecipeInputs": json.dumps(inputs),
            "RecipeOutputs": json.dumps(outputs)
        })
        
        log.info(f"Created production activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating production activity: {e}")
        return None

def get_idle_citizens(tables) -> List[Dict]:
    """Fetch all citizens who are currently idle (no active activities)."""
    log.info("Fetching idle citizens...")
    
    try:
        # First, get all citizens
        all_citizens = tables['citizens'].all()
        log.info(f"Found {len(all_citizens)} total citizens")
        
        # Then, get all active activities
        now = datetime.datetime.now().isoformat()
        active_activities_formula = f"AND({{StartDate}} <= '{now}', {{EndDate}} >= '{now}')"
        active_activities = tables['activities'].all(formula=active_activities_formula)
        
        # Extract citizen IDs with active activities - use CitizenId field
        busy_citizen_ids = set()
        for activity in active_activities:
            citizen_id = activity['fields'].get('CitizenId')
            if citizen_id:
                busy_citizen_ids.add(citizen_id)
        
        # Filter out citizens with active activities using CitizenId
        idle_citizens = []
        for citizen in all_citizens:
            citizen_id = citizen['fields'].get('CitizenId')
            if citizen_id and citizen_id not in busy_citizen_ids:
                idle_citizens.append(citizen)
        
        log.info(f"Found {len(idle_citizens)} idle citizens")
        return idle_citizens
    except Exception as e:
        log.error(f"Error fetching idle citizens: {e}")
        return []

def get_citizen_home(tables, citizen_id: str) -> Optional[Dict]:
    """Find the home building for a citizen."""
    log.info(f"Finding home for citizen {citizen_id}")
    
    try:
        
        # Get buildings where this citizen is the occupant and the type is a housing type
        housing_types = ['canal_house', 'merchant_s_house', 'artisan_s_house', 'fisherman_s_cottage']
        type_conditions = [f"{{Type}}='{housing_type}'" for housing_type in housing_types]
        formula = f"AND({{Occupant}}='{citizen_id}', OR({', '.join(type_conditions)}))"
        
        homes = tables['buildings'].all(formula=formula)
        
        if homes:
            # Check if the home has a BuildingId
            building_id = homes[0]['fields'].get('BuildingId')
            if not building_id:
                log.warning(f"Home found for citizen {citizen_id} but missing BuildingId: {homes[0]['id']}")
            else:
                log.info(f"Found home for citizen {citizen_id}: {building_id}")
            return homes[0]
        else:
            log.warning(f"No home found for citizen {citizen_id}")
            return None
    except Exception as e:
        log.error(f"Error finding home for citizen {citizen_id}: {e}")
        return None

def is_nighttime() -> bool:
    """Check if it's currently nighttime in Venice."""
    now = datetime.datetime.now(VENICE_TIMEZONE)
    hour = now.hour
    
    return hour >= NIGHT_START_HOUR or hour < NIGHT_END_HOUR

def get_path_to_home(citizen_position: Dict, home_position: Dict) -> Optional[Dict]:
    """Get a path from the citizen's current position to their home using the transport API."""
    log.info(f"Getting path from {citizen_position} to {home_position}")
    
    try:
        # Call the transport API
        response = requests.post(
            TRANSPORT_API_URL,
            json={
                "startPoint": citizen_position,
                "endPoint": home_position,
                "startDate": datetime.datetime.now().isoformat()
            }
        )
        
        if response.status_code != 200:
            log.error(f"Transport API error: {response.status_code} {response.text}")
            return None
        
        result = response.json()
        
        if not result.get('success'):
            log.error(f"Transport API returned error: {result.get('error')}")
            return None
        
        return result
    except Exception as e:
        log.error(f"Error calling transport API: {e}")
        return None

def create_rest_activity(tables, citizen_id: str, home_id: str) -> Optional[Dict]:
    """Create a rest activity for a citizen at their home."""
    log.info(f"Creating rest activity for citizen {citizen_id} at home {home_id}")
    
    try:
        # Check if citizen_id is valid
        if not citizen_id:
            log.error("Missing CitizenId for rest activity")
            return None
            
        now = datetime.datetime.now()
        
        # Calculate end time (next morning at 6 AM)
        venice_now = now.astimezone(VENICE_TIMEZONE)
        
        # If it's before 6 AM, end time is 6 AM today
        # If it's after 6 AM, end time is 6 AM tomorrow
        if venice_now.hour < NIGHT_END_HOUR:
            end_time = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
        else:
            tomorrow = venice_now + datetime.timedelta(days=1)
            end_time = tomorrow.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
        
        # Convert back to UTC for storage
        end_time_utc = end_time.astimezone(pytz.UTC)
        
        # Create the activity
        activity = tables['activities'].create({
            "ActivityId": f"rest_{citizen_id}_{int(time.time())}",
            "Type": "rest",
            "CitizenId": citizen_id,
            "FromBuilding": home_id,  # This should be BuildingId
            "ToBuilding": home_id,    # This should be BuildingId
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time_utc.isoformat(),
            "Notes": "Resting at home for the night"
        })
        
        log.info(f"Created rest activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating rest activity: {e}")
        return None

def create_goto_home_activity(tables, citizen_id: str, home_id: str, path_data: Dict) -> Optional[Dict]:
    """Create a goto_home activity for a citizen."""
    log.info(f"Creating goto_home activity for citizen {citizen_id} to home {home_id}")
    
    try:
        # Check if citizen_id is valid
        if not citizen_id:
            log.error("Missing CitizenId for goto_home activity")
            return None
            
        now = datetime.datetime.now()
        
        # Get timing information from path data
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            # If no end date provided, use a default duration
            end_time = now + datetime.timedelta(hours=1)
            end_date = end_time.isoformat()
        
        # Create the activity
        activity = tables['activities'].create({
            "ActivityId": f"goto_home_{citizen_id}_{int(time.time())}",
            "Type": "goto_home",
            "CitizenId": citizen_id,  # This should be the CitizenId, not the Airtable record ID
            "ToBuilding": home_id,  # This should be BuildingId
            "CreatedAt": now.isoformat(),
            "StartDate": start_date,
            "EndDate": end_date,
            "Path": json.dumps(path_data.get('path', [])),
            "Notes": "Going home for the night"
        })
        
        log.info(f"Created goto_home activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating goto_home activity: {e}")
        return None

def create_idle_activity(tables, citizen_id: str) -> Optional[Dict]:
    """Create an idle activity for a citizen."""
    log.info(f"Creating idle activity for citizen {citizen_id}")
    
    try:
        # Check if citizen_id is valid
        if not citizen_id:
            log.error("Missing CitizenId for idle activity")
            return None
            
        now = datetime.datetime.now()
        end_time = now + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)
        
        # Create the activity
        activity = tables['activities'].create({
            "ActivityId": f"idle_{citizen_id}_{int(time.time())}",
            "Type": "idle",
            "CitizenId": citizen_id,  # This should be the CitizenId, not the Airtable record ID
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": "Idle activity due to failed path finding or no home"
        })
        
        log.info(f"Created idle activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating idle activity: {e}")
        return None

def process_citizen_activity(tables, citizen: Dict, is_night: bool) -> bool:
    """Process activity creation for a single citizen."""
    # Always use CitizenId from fields, not the Airtable record ID
    citizen_id = citizen['fields'].get('CitizenId')
    
    # If CitizenId is missing, log an error and return
    if not citizen_id:
        log.error(f"Missing CitizenId in citizen record: {citizen['id']}")
        return False
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Processing activity for citizen {citizen_name} (ID: {citizen_id})")
    
    # Get citizen's position
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
                        log.info(f"Extracted position from Point field for citizen {citizen_id}: {citizen_position}")
                    except (ValueError, IndexError):
                        log.warning(f"Failed to parse coordinates from Point field: {point_str}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"Invalid position data for citizen {citizen_id}: {citizen['fields'].get('Position')} - Error: {str(e)}")
    
    if not citizen_position:
        log.warning(f"Citizen {citizen_id} has no position data, creating idle activity")
        create_idle_activity(tables, citizen_id)
        return True
    
    # If it's nighttime, handle nighttime activities
    if is_night:
        # Find citizen's home
        home = get_citizen_home(tables, citizen_id)
        
        if not home:
            log.warning(f"Citizen {citizen_id} has no home, creating idle activity")
            create_idle_activity(tables, citizen_id)
            return True
        
        # Get home position
        home_position = None
        try:
            # First try to get position from the Position field
            position_str = home['fields'].get('Position')
            if position_str:
                home_position = json.loads(position_str)
            
            # If Position is missing or invalid, try to extract from Point field
            if not home_position:
                point_str = home['fields'].get('Point')
                if point_str and isinstance(point_str, str):
                    # Parse the Point field which has format like "building_45.437908_12.337258"
                    parts = point_str.split('_')
                    if len(parts) >= 3:
                        try:
                            lat = float(parts[1])
                            lng = float(parts[2])
                            home_position = {"lat": lat, "lng": lng}
                            log.info(f"Extracted position from Point field for home {home['fields'].get('BuildingId', home['id'])}: {home_position}")
                        except (ValueError, IndexError):
                            log.warning(f"Failed to parse coordinates from Point field: {point_str}")
        except (json.JSONDecodeError, TypeError) as e:
            log.warning(f"Invalid position data for home {home['fields'].get('BuildingId', home['id'])}: {home['fields'].get('Position')} - Error: {str(e)}")
        
        if not home_position:
            log.warning(f"Home {home['fields'].get('BuildingId', home['id'])} has no position data, creating idle activity")
            create_idle_activity(tables, citizen_id)
            return True
        
        # Check if citizen is already at home
        # Simple check: if positions are close enough (within 50 meters)
        is_at_home = False
        try:
            # Calculate distance between points
            from math import sqrt, pow
            distance = sqrt(pow(citizen_position['lat'] - home_position['lat'], 2) + 
                           pow(citizen_position['lng'] - home_position['lng'], 2))
            
            # Convert to approximate meters (very rough approximation)
            distance_meters = distance * 111000  # 1 degree is roughly 111 km at the equator
            
            is_at_home = distance_meters < 50  # Within 50 meters
        except (KeyError, TypeError):
            log.warning(f"Error calculating distance for citizen {citizen_id}")
        
        if is_at_home:
            # Citizen is at home, create rest activity
            # Use BuildingId instead of Airtable record ID
            home_building_id = home['fields'].get('BuildingId', home['id'])
            create_rest_activity(tables, citizen_id, home_building_id)
        else:
            # Citizen needs to go home, get path
            path_data = get_path_to_home(citizen_position, home_position)
            
            if path_data and path_data.get('success'):
                # Create goto_home activity
                # Use BuildingId instead of Airtable record ID
                home_building_id = home['fields'].get('BuildingId', home['id'])
                create_goto_home_activity(tables, citizen_id, home_building_id, path_data)
            else:
                # Path finding failed, create idle activity
                create_idle_activity(tables, citizen_id)
    else:
        # Daytime activities - check for work, production, or resource fetching
        
        # Check if citizen has a work building
        work_building_id = citizen['fields'].get('Work')
        
        if work_building_id:
            # Get the work building
            # First try to find by BuildingId
            formula = f"{{BuildingId}}='{work_building_id}'"
            work_buildings = tables['buildings'].all(formula=formula)
            
            # If not found, try by Airtable record ID as fallback
            if not work_buildings:
                formula = f"RECORD_ID()='{work_building_id}'"
                work_buildings = tables['buildings'].all(formula=formula)
                if work_buildings:
                    log.warning(f"Found work building by record ID instead of BuildingId: {work_building_id}")
            
            if work_buildings:
                work_building = work_buildings[0]
                building_type = work_building['fields'].get('Type')
                
                # Use BuildingId for logging
                building_id = work_building['fields'].get('BuildingId', work_building['id'])
                
                # Get building type information
                building_type_info = get_building_type_info(building_type)
                
                if building_type_info and 'productionInformation' in building_type_info:
                    production_info = building_type_info['productionInformation']
                    
                    # Check if there are Arti recipes
                    if 'Arti' in production_info and isinstance(production_info['Arti'], list):
                        recipes = production_info['Arti']
                        
                        # Get current resources in the building
                        building_resources = get_building_resources(tables, work_building_id)
                        
                        # Check if any recipe can be produced
                        can_produce = False
                        selected_recipe = None
                        
                        for recipe in recipes:
                            if can_produce_output(building_resources, recipe):
                                can_produce = True
                                selected_recipe = recipe
                                break
                        
                        if can_produce and selected_recipe:
                            # Create production activity
                            create_production_activity(tables, citizen, work_building, selected_recipe)
                            return True
                        else:
                            # Not enough resources for production, check contracts
                            contracts = get_citizen_contracts(tables, citizen_id)
                            
                            if contracts:
                                # Process contracts in priority order
                                for contract in contracts:
                                    # Get source and destination buildings
                                    from_building_id = contract['fields'].get('SellerBuilding')
                                    to_building_id = contract['fields'].get('BuyerBuilding')
                                    
                                    if from_building_id and to_building_id:
                                        # Get building details - try by BuildingId first
                                        from_formula = f"{{BuildingId}}='{from_building_id}'"
                                        to_formula = f"{{BuildingId}}='{to_building_id}'"
                                        
                                        from_buildings = tables['buildings'].all(formula=from_formula)
                                        to_buildings = tables['buildings'].all(formula=to_formula)
                                        
                                        # If not found, try by Airtable record ID as fallback
                                        if not from_buildings:
                                            from_formula = f"RECORD_ID()='{from_building_id}'"
                                            from_buildings = tables['buildings'].all(formula=from_formula)
                                            if from_buildings:
                                                log.warning(f"Found seller building by record ID instead of BuildingId: {from_building_id}")
                                        
                                        if not to_buildings:
                                            to_formula = f"RECORD_ID()='{to_building_id}'"
                                            to_buildings = tables['buildings'].all(formula=to_formula)
                                            if to_buildings:
                                                log.warning(f"Found buyer building by record ID instead of BuildingId: {to_building_id}")
                                        
                                        if from_buildings and to_buildings:
                                            from_building = from_buildings[0]
                                            to_building = to_buildings[0]
                                            
                                            # Check if source building has enough resources
                                            resource_type = contract['fields'].get('ResourceType')
                                            amount = float(contract['fields'].get('Amount', 0) or 0)
                                            
                                            source_resources = get_building_resources(tables, from_building_id)
                                            
                                            if resource_type in source_resources and source_resources[resource_type] >= amount:
                                                # Find path between buildings
                                                path = find_path_between_buildings(from_building, to_building)
                                                
                                                if path:
                                                    # Create resource fetching activity
                                                    create_resource_fetching_activity(
                                                        tables, citizen, contract, from_building, to_building, path
                                                    )
                                                    return True
                            
                            # If we get here, no contracts could be executed
                            log.info(f"No viable contracts for citizen {citizen_id}, creating idle activity")
                            create_idle_activity(tables, citizen_id)
                            return True
                    else:
                        # No Arti recipes, create idle activity
                        log.info(f"No Arti recipes for building type {building_type}, creating idle activity")
                        create_idle_activity(tables, citizen_id)
                        return True
                else:
                    # No production information, create idle activity
                    log.info(f"No production information for building type {building_type}, creating idle activity")
                    create_idle_activity(tables, citizen_id)
                    return True
            else:
                # Work building not found, create idle activity
                log.warning(f"Work building {work_building_id} not found for citizen {citizen_id}, creating idle activity")
                create_idle_activity(tables, citizen_id)
                return True
        else:
            # No work building, create idle activity
            log.info(f"Citizen {citizen_id} has no work building, creating idle activity")
            create_idle_activity(tables, citizen_id)
            return True
    
    return True

def create_activities(dry_run: bool = False):
    """Main function to create activities for idle citizens."""
    log.info(f"Starting activity creation process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    idle_citizens = get_idle_citizens(tables)
    
    if not idle_citizens:
        log.info("No idle citizens found. Activity creation process complete.")
        return
    
    # Check if it's nighttime in Venice
    night_time = is_nighttime()
    log.info(f"Current time in Venice: {'Night' if night_time else 'Day'}")
    
    # Process each idle citizen
    success_count = 0
    for citizen in idle_citizens:
        if dry_run:
            log.info(f"[DRY RUN] Would create activity for citizen {citizen['id']}")
            success_count += 1
        else:
            if process_citizen_activity(tables, citizen, night_time):
                success_count += 1
    
    log.info(f"Activity creation process complete. Created activities for {success_count} out of {len(idle_citizens)} idle citizens")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create activities for idle citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    create_activities(dry_run=args.dry_run)
