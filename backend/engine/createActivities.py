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
import re # Added import for regular expressions
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
        citizen_airtable_record_id = citizen['id']
        citizen_custom_id = citizen['fields'].get('CitizenId') # For ActivityId generation if needed
        citizen_username = citizen['fields'].get('Username')

        if not citizen_username: # Fallback if username is somehow missing
            citizen_username = citizen_custom_id
        if not citizen_custom_id: # Should not happen if process_citizen_activity validates
             log.error(f"Missing CitizenId for citizen record {citizen_airtable_record_id}")
             return None
        if not citizen_username: # Should not happen
             log.error(f"Missing Username for citizen record {citizen_airtable_record_id}")
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
            log.info(f"Created resource fetching activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create resource fetching activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating resource fetching activity for {citizen_username}: {e}")
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
             log.error(f"Missing CitizenId for citizen record {citizen_airtable_record_id}")
             return None
        if not citizen_username: # Should not happen
             log.error(f"Missing Username for citizen record {citizen_airtable_record_id}")
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
            log.info(f"Created production activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create production activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating production activity for {citizen_username}: {e}")
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

def _escape_airtable_value(value: str) -> str:
    """Escapes single quotes for Airtable formulas."""
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

# Helper functions for position and distance
def _get_building_position_coords(building_record: Dict) -> Optional[Dict[str, float]]:
    """Extracts lat/lng coordinates from a building record's Position or Point field."""
    position = None
    if not building_record or 'fields' not in building_record:
        return None
    try:
        position_str = building_record['fields'].get('Position')
        if position_str and isinstance(position_str, str): # Ensure it's a string before parsing
            position = json.loads(position_str)
        
        if not position: # If Position field is empty or not valid JSON
            point_str = building_record['fields'].get('Point')
            if point_str and isinstance(point_str, str):
                parts = point_str.split('_')
                # Expecting format like "type_lat_lng" or "type_lat_lng_index"
                if len(parts) >= 3:
                    lat_str, lng_str = parts[1], parts[2]
                    # Validate that lat_str and lng_str can be converted to float
                    if all(s.replace('.', '', 1).replace('-', '', 1).isdigit() for s in [lat_str, lng_str]):
                        lat, lng = float(lat_str), float(lng_str)
                        position = {"lat": lat, "lng": lng}
                    else:
                        log.warning(f"Non-numeric lat/lng parts in Point field: {point_str} for building {building_record.get('id', 'N/A')}")
                else:
                    log.warning(f"Point field format not recognized for coordinate extraction: {point_str} for building {building_record.get('id', 'N/A')}")
            # else: Point field is also empty or not a string
    except (json.JSONDecodeError, TypeError, ValueError, IndexError) as e:
        building_id_log = building_record.get('id', 'N/A')
        log.warning(f"Could not parse position for building {building_id_log}: {e}. Position string: '{position_str}', Point string: '{building_record['fields'].get('Point')}'")
    
    if position and isinstance(position, dict) and 'lat' in position and 'lng' in position:
        return position
    return None

def _calculate_distance_meters(pos1: Optional[Dict[str, float]], pos2: Optional[Dict[str, float]]) -> float:
    """Calculate approximate distance in meters between two lat/lng points."""
    if not pos1 or not pos2 or 'lat' not in pos1 or 'lng' not in pos1 or 'lat' not in pos2 or 'lng' not in pos2:
        return float('inf')
    
    # Ensure lat/lng are floats
    try:
        lat1, lng1 = float(pos1['lat']), float(pos1['lng'])
        lat2, lng2 = float(pos2['lat']), float(pos2['lng'])
    except (ValueError, TypeError):
        log.warning(f"Invalid coordinate types for distance calculation: pos1={pos1}, pos2={pos2}")
        return float('inf')

    from math import sqrt, pow # Keep import local if not used elsewhere globally
    distance_degrees = sqrt(pow(lat1 - lat2, 2) + pow(lng1 - lng2, 2))
    return distance_degrees * 111000  # Rough approximation (1 degree ~ 111km)

def get_closest_inn(tables: Dict[str, Table], citizen_position: Dict[str, float]) -> Optional[Dict]:
    """Finds the closest building of type 'inn' to the citizen's position."""
    log.info(f"Searching for the closest inn to position: {citizen_position}")
    try:
        inns = tables['buildings'].all(formula="{Type}='inn'")
        if not inns:
            log.info("No inns found in the database.")
            return None

        closest_inn = None
        min_distance = float('inf')

        for inn_record in inns:
            inn_position = _get_building_position_coords(inn_record)
            if inn_position:
                distance = _calculate_distance_meters(citizen_position, inn_position)
                if distance < min_distance:
                    min_distance = distance
                    closest_inn = inn_record
            else:
                log.warning(f"Inn {inn_record.get('id')} has no valid position data.")
        
        if closest_inn:
            inn_id_log = closest_inn['fields'].get('BuildingId', closest_inn['id'])
            log.info(f"Closest inn found: {inn_id_log} at distance {min_distance:.2f}m.")
        else:
            log.info("No inns with valid positions found.")
        return closest_inn
    except Exception as e:
        log.error(f"Error finding closest inn: {e}")
        return None

def get_citizen_workplace(tables, citizen_id: str, citizen_username: str) -> Optional[Dict]:
    """Find the workplace building for a citizen."""
    log.info(f"Finding workplace for citizen {citizen_id} (Username: {citizen_username})")
    
    try:
        # Get buildings where this citizen is the occupant and the category is business
        formula = f"AND({{Occupant}}='{citizen_username}', {{Category}}='business')"
        
        workplaces = tables['buildings'].all(formula=formula)
        
        if workplaces:
            # Check if the workplace has a BuildingId
            building_id = workplaces[0]['fields'].get('BuildingId')
            if not building_id:
                log.warning(f"Workplace found for citizen {citizen_id} but missing BuildingId: {workplaces[0]['id']}")
            else:
                log.info(f"Found workplace for citizen {citizen_id}: {building_id}")
            return workplaces[0]
        else:
            log.info(f"No workplace found for citizen {citizen_id}")
            return None
    except Exception as e:
        log.error(f"Error finding workplace for citizen {citizen_id}: {e}")
        return None

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

def get_path_between_points(start_position: Dict, end_position: Dict) -> Optional[Dict]:
    """Get a path between two points using the transport API."""
    log.info(f"Getting path from {start_position} to {end_position}")
    
    try:
        # Call the transport API
        response = requests.post(
            TRANSPORT_API_URL,
            json={
                "startPoint": start_position,
                "endPoint": end_position,
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

# --- Removed create_stay_activity ---
# --- Removed create_goto_work_activity ---
# --- Removed create_goto_home_activity ---
# --- Removed create_travel_to_inn_activity ---
# --- Removed create_idle_activity ---
# --- Removed create_production_activity ---
# --- Removed create_resource_fetching_activity ---
# (Ensure all these function definitions are deleted from this file)

def create_goto_work_activity(tables, citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, workplace_id: str, path_data: Dict) -> Optional[Dict]:
    """Create a goto_work activity for a citizen."""
    log.info(f"Creating goto_work activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to workplace {workplace_id}")
    
    try:
        now = datetime.datetime.now(pytz.UTC)
        
        # Get timing information from path data
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            # If no end date provided, use a default duration
            end_time = now + datetime.timedelta(hours=1)
            end_date = end_time.isoformat()
        
        # Ensure path is a valid JSON string
        path_json = json.dumps(path_data.get('path', []))
        
        # Create the activity
        activity_payload = {
            "ActivityId": f"goto_work_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_work",
            "Citizen": citizen_username,
            "ToBuilding": workplace_id,  # This should be BuildingId
            "CreatedAt": now.isoformat(), # now is UTC
            "StartDate": start_date, # Assuming path_data provides UTC timestamps
            "EndDate": end_date,     # Assuming path_data provides UTC timestamps
            "Path": path_json,
            "Notes": "🏢 **Going to work**"
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created goto_work activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create goto_work activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating goto_work activity for {citizen_username}: {e}")
        return None

def create_goto_home_activity(tables, citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, home_id: str, path_data: Dict) -> Optional[Dict]:
    """Create a goto_home activity for a citizen."""
    log.info(f"Creating goto_home activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to home {home_id}")
    
    try:
        now = datetime.datetime.now(pytz.UTC)
        
        # Get timing information from path data
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            # If no end date provided, use a default duration
            end_time = now + datetime.timedelta(hours=1)
            end_date = end_time.isoformat()
        
        # Ensure path is a valid JSON string
        path_json = json.dumps(path_data.get('path', []))
        
        # Create the activity
        activity_payload = {
            "ActivityId": f"goto_home_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_home",
            "Citizen": citizen_username,
            "ToBuilding": home_id,  # This should be BuildingId
            "CreatedAt": now.isoformat(), # now is UTC
            "StartDate": start_date, # Assuming path_data provides UTC timestamps
            "EndDate": end_date,     # Assuming path_data provides UTC timestamps
            "Path": path_json,
            "Notes": "🏠 **Going home** for the night"
        }
        activity = tables['activities'].create(activity_payload)

        if activity and activity.get('id'):
            log.info(f"Created goto_home activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create goto_home activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating goto_home activity for {citizen_username}: {e}")
        return None

def create_travel_to_inn_activity(tables, citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, inn_id: str, path_data: Dict) -> Optional[Dict]:
    """Create a travel_to_inn activity for a citizen."""
    log.info(f"Creating travel_to_inn activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to inn {inn_id}")
    
    try:
        now = datetime.datetime.now(pytz.UTC)
        
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            end_time = now + datetime.timedelta(hours=1) # Default 1 hour travel
            end_date = end_time.isoformat()
        
        path_json = json.dumps(path_data.get('path', []))
        
        activity_payload = {
            "ActivityId": f"goto_inn_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_inn", # New activity type
            "Citizen": citizen_username,
            "ToBuilding": inn_id,
            "CreatedAt": now.isoformat(),
            "StartDate": start_date,
            "EndDate": end_date,
            "Path": path_json,
            "Notes": "🏨 **Going to an inn** for the night"
        }
        activity = tables['activities'].create(activity_payload)

        if activity and activity.get('id'):
            log.info(f"Created travel_to_inn activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create travel_to_inn activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating travel_to_inn activity for {citizen_username}: {e}")
        return None

def create_idle_activity(tables, citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str) -> Optional[Dict]:
    """Create an idle activity for a citizen."""
    log.info(f"Creating idle activity for citizen {citizen_username} (CustomID: {citizen_custom_id})")
    
    try:
        now = datetime.datetime.now(pytz.UTC)
        end_time = now + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)
        
        # Create the activity
        activity_payload = {
            "ActivityId": f"idle_{citizen_custom_id}_{int(time.time())}",
            "Type": "idle",
            "Citizen": citizen_username,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": "⏳ **Idle activity** due to failed path finding or no home"
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created idle activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create idle activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating idle activity for {citizen_username}: {e}")
        return None

def process_citizen_activity(tables, citizen: Dict, is_night: bool) -> bool:
    """Process activity creation for a single citizen."""
    # Get citizen identifiers
    citizen_custom_id = citizen['fields'].get('CitizenId') # The custom ID, e.g., ctz_...
    citizen_username = citizen['fields'].get('Username')   # The Username
    citizen_airtable_record_id = citizen['id']             # The Airtable record ID, e.g., rec...

    # Validate essential identifiers
    if not citizen_custom_id:
        log.error(f"Missing CitizenId in citizen record: {citizen_airtable_record_id}")
        return False
    if not citizen_username:
        log.warning(f"Citizen {citizen_custom_id} (Record ID: {citizen_airtable_record_id}) has no Username, using CitizenId as fallback for username.")
        citizen_username = citizen_custom_id
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    log.info(f"Processing activity for citizen {citizen_name} (CustomID: {citizen_custom_id}, Username: {citizen_username}, RecordID: {citizen_airtable_record_id})")
    
    now_utc_dt = datetime.datetime.now(pytz.UTC)

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
            log.warning(f"Could not parse AteAt timestamp '{ate_at_str}' for citizen {citizen_username}. Error: {ve}. Assuming hungry.")
            is_hungry = True 
    else: 
        log.info(f"Citizen {citizen_username} has no AteAt timestamp. Assuming hungry.")
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
                        log.info(f"Extracted position from Point field for citizen {citizen_custom_id}: {citizen_position}")
                    except (ValueError, IndexError):
                        log.warning(f"Failed to parse coordinates from Point field: {point_str}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"Invalid position data for citizen {citizen_custom_id}: {citizen['fields'].get('Position')} - Error: {str(e)}")
    
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
                        log.warning(f"Failed to parse coordinates from Point field: {point_str} for citizen {citizen_custom_id}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"Invalid position data for citizen {citizen_custom_id}: {citizen['fields'].get('Position')} - Error: {str(e)}")

    if is_hungry:
        log.info(f"Citizen {citizen_username} is hungry. Attempting to create eat activity.")
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
                    log.info(f"Found {food_type} in {citizen_username}'s inventory.")
                    if try_create_eat_from_inventory_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, food_type, 1.0):
                        return True # Activity created
            except Exception as e_inv_food:
                log.error(f"Error checking inventory food for {citizen_username}: {e_inv_food}")
        
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
                        break
                except Exception as e_home_food:
                    log.error(f"Error checking home food for {citizen_username} in {home_building_id}: {e_home_food}")
            
            if has_food_at_home and food_type_at_home:
                # Determine path_data only if not at home
                path_data_for_eat_sequence = None
                if not is_at_home:
                    if citizen_position and home_position:
                        log.info(f"Home {home_building_id} has {food_type_at_home}. Citizen {citizen_username} is not at home. Calculating path to home to eat.")
                        path_data_for_eat_sequence = get_path_between_points(citizen_position, home_position)
                        if not (path_data_for_eat_sequence and path_data_for_eat_sequence.get('success')):
                            log.warning(f"Path finding to home {home_building_id} failed for {citizen_username} to eat. Path data: {path_data_for_eat_sequence}")
                            # path_data_for_eat_sequence will be None or invalid, try_create_eat_at_home_activity should handle this
                    else:
                        log.warning(f"Citizen {citizen_username} not at home, but citizen_position or home_position is missing. Cannot pathfind to home to eat.")
                
                # Call the modified try_create_eat_at_home_activity
                # It will internally decide to create 'goto_home' or 'eat_at_home'
                activity_created = try_create_eat_at_home_activity(
                    tables,
                    citizen_custom_id,
                    citizen_username,
                    citizen_airtable_record_id,
                    home_airtable_id,          # Airtable Record ID for 'eat_at_home'
                    home_building_id,          # Custom BuildingId for 'goto_home'
                    food_type_at_home,
                    1.0,                       # Amount to eat
                    is_at_home,
                    path_data_for_eat_sequence # Path data, or None if at home or path failed
                )
                if activity_created:
                    log.info(f"Activity ({activity_created['fields'].get('Type')}) created for {citizen_username} regarding eating at home.")
                    return True # Activity (either goto_home or eat_at_home) created
                else:
                    log.warning(f"Failed to create any activity for {citizen_username} regarding eating at home {home_building_id}.")

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
                            log.info(f"Citizen {citizen_username} is at tavern {tavern_custom_id}. Creating eat_at_tavern activity.")
                            if try_create_eat_at_tavern_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, tavern_airtable_id):
                                return True
                        else: # Not at tavern, create goto_tavern
                            log.info(f"Citizen {citizen_username} not at tavern {tavern_custom_id}. Finding path to tavern.")
                            path_data = get_path_between_points(citizen_position, tavern_position_coords)
                            if path_data and path_data.get('success'):
                                # Create a generic goto_inn, assuming it can be used for taverns too
                                if try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, tavern_custom_id, path_data): # Pass custom BuildingId
                                    return True
                            else:
                                log.warning(f"Path finding to tavern {tavern_custom_id} failed for {citizen_username}.")
                    else:
                        log.warning(f"Closest tavern {tavern_custom_id} has no position data.")
                else:
                    log.info(f"No taverns found for {citizen_username} to eat at.")
            else:
                log.warning(f"Citizen {citizen_username} is hungry but has no position data to find a tavern.")
        else:
            log.info(f"Citizen {citizen_username} is hungry but has insufficient ducats ({citizen_ducats}) for a tavern meal.")

        log.warning(f"Citizen {citizen_username} is hungry but no eating option was successfully created. Proceeding to other activities.")
    
    # --- END HUNGER CHECK ---
    
    home_city = citizen['fields'].get('HomeCity') # Check if citizen is a visitor
    log.info(f"Citizen {citizen_username} HomeCity: '{home_city}'")

    if not citizen_position: # Re-check after hunger logic if position was needed but missing
        log.warning(f"Citizen {citizen_custom_id} has no position data, creating idle activity")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
        return True
    
    # If it's nighttime, handle nighttime activities
    if is_night:
        if home_city and home_city.strip(): # Visitor logic
            log.info(f"Citizen {citizen_username} is a visitor from {home_city}. Finding an inn.")
            closest_inn = get_closest_inn(tables, citizen_position)
            if closest_inn:
                inn_position_coords = _get_building_position_coords(closest_inn)
                inn_custom_id = closest_inn['fields'].get('BuildingId', closest_inn['id']) 
                inn_airtable_id = closest_inn['id'] # Airtable Record ID

                if inn_position_coords:
                    is_at_inn = _calculate_distance_meters(citizen_position, inn_position_coords) < 20
                    if is_at_inn:
                        log.info(f"Citizen {citizen_username} is already at inn {inn_custom_id}. Creating stay activity.")
                        venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE)
                        if venice_now.hour < NIGHT_END_HOUR:
                            end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                        else:
                            end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                        stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                        try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_airtable_id, stay_location_type="inn", end_time_utc_iso=stay_end_time_utc_iso) # Pass Airtable Record ID
                    else:
                        log.info(f"Citizen {citizen_username} is not at inn {inn_custom_id}. Finding path to inn.")
                        path_data = get_path_between_points(citizen_position, inn_position_coords)
                        if path_data and path_data.get('success'):
                            try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_airtable_id, path_data) # Pass Airtable Record ID
                        else:
                            log.warning(f"Path finding to inn {inn_custom_id} failed for {citizen_username}. Creating idle activity.")
                            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                else:
                    log.warning(f"Inn {closest_inn['id'] if closest_inn else 'N/A'} has no position data. Creating idle activity for {citizen_username}.")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
            else:
                log.warning(f"No inn found for visitor {citizen_username}. Creating idle activity.")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)

        else: # Resident logic
            log.info(f"Citizen {citizen_username} is a resident or HomeCity is not set. Finding home.")
            home = get_citizen_home(tables, citizen_custom_id)
            if not home:
                log.warning(f"Citizen {citizen_custom_id} has no home, creating idle activity")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                return True
            
            home_position = _get_building_position_coords(home)
            home_custom_id = home['fields'].get('BuildingId', home['id']) 
            home_airtable_id = home['id'] # Airtable Record ID

            if not home_position:
                log.warning(f"Home {home_custom_id} has no position data, creating idle for resident {citizen_custom_id}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                return True
            
            is_at_home = _calculate_distance_meters(citizen_position, home_position) < 20
            if is_at_home:
                venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE)
                if venice_now.hour < NIGHT_END_HOUR:
                    end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                else:
                    end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_airtable_id, stay_location_type="home", end_time_utc_iso=stay_end_time_utc_iso) # Pass Airtable Record ID
            else:
                path_data = get_path_between_points(citizen_position, home_position)
                if path_data and path_data.get('success'):
                    try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_airtable_id, path_data) # Pass Airtable Record ID
                else:
                    log.warning(f"Path finding to home failed for resident {citizen_custom_id}. Creating idle activity.")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
    else: 
        # Daytime activities
        workplace = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
        if workplace:
            workplace_position = _get_building_position_coords(workplace)
            workplace_custom_id = workplace['fields'].get('BuildingId', workplace['id']) 
            workplace_airtable_id = workplace['id'] # Airtable Record ID

            if not workplace_position:
                log.warning(f"Workplace {workplace_custom_id} has no position data, creating idle activity")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                return True
            
            is_at_workplace = _calculate_distance_meters(citizen_position, workplace_position) < 20
            if is_at_workplace:
                log.info(f"Citizen {citizen_custom_id} is at workplace {workplace_custom_id}. Checking for production/fetching.")
                building_type = workplace['fields'].get('Type')
                building_type_info = get_building_type_info(building_type)
                if building_type_info and 'productionInformation' in building_type_info:
                    production_info = building_type_info['productionInformation']
                    if 'Arti' in production_info and isinstance(production_info['Arti'], list):
                        recipes = production_info['Arti']
                        building_resources = get_building_resources(tables, workplace_custom_id) # Use custom ID
                        selected_recipe = next((r for r in recipes if can_produce_output(building_resources, r)), None)
                        if selected_recipe:
                            try_create_production_activity(tables, citizen_airtable_record_id, citizen_custom_id, citizen_username, workplace_airtable_id, selected_recipe) # Pass Airtable ID for building
                            return True
                
                contracts = get_citizen_contracts(tables, citizen_username) # Use username for contracts
                if contracts:
                    for contract in contracts:
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
                                        path_to_source = get_path_between_points(citizen_position, _get_building_position_coords(from_building_rec))
                                        if path_to_source and path_to_source.get('success'):
                                            try_create_resource_fetching_activity(
                                                tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                                                contract['id'], from_building_rec['id'], to_building_rec['id'], # Pass Airtable IDs
                                                resource_type_contract, amount_contract, path_to_source
                                            )
                                            return True
                log.info(f"No production or fetching for {citizen_custom_id} at {workplace_custom_id}. Creating idle.")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
            else: # Not at workplace
                path_data = get_path_between_points(citizen_position, workplace_position)
                if path_data and path_data.get('success'):
                    try_create_goto_work_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, workplace_airtable_id, path_data) # Pass Airtable Record ID
                else:
                    log.warning(f"Path to workplace {workplace_custom_id} failed for {citizen_custom_id}. Creating idle.")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
        else: # No workplace
            log.info(f"No workplace for citizen {citizen_username}. Creating idle activity.")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
    return True

def create_activities(dry_run: bool = False):
    """Main function to create activities for idle citizens."""
    log.info(f"Starting activity creation process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    now_utc_dt = datetime.datetime.now(pytz.UTC) # Define now_utc_dt here
    idle_citizens = get_idle_citizens(tables)
    
    if not idle_citizens:
        log.info("No idle citizens found. Activity creation process complete.")
        return
    
    # Check if it's nighttime in Venice
    night_time = is_nighttime()
    log.info(f"Current time in Venice: {'Night' if night_time else 'Day'}")
    
    # Process each idle citizen
    success_count = 0
    
    # Attempt to create final delivery activities for citizens at galleys first
    # This pool will be modified by process_final_deliveries_from_galley
    citizens_available_for_general_activities = list(idle_citizens) 
    if not dry_run:
        final_delivery_activities_created = process_final_deliveries_from_galley(tables, citizens_available_for_general_activities, now_utc_dt)
        success_count += final_delivery_activities_created

    # Then, attempt to assign citizens to fetch from galleys
    # This pool will be modified by process_galley_unloading_activities
    citizens_still_available_after_final_delivery = list(citizens_available_for_general_activities)
    if not dry_run:
        galley_fetch_activities_created = process_galley_unloading_activities(tables, citizens_still_available_after_final_delivery, now_utc_dt)
        success_count += galley_fetch_activities_created
    elif dry_run and idle_citizens: # If dry run, simulate checking for galley tasks
        log.info(f"[DRY RUN] Would check for merchant galleys with pending deliveries (fetch tasks).")
        log.info(f"[DRY RUN] Would check for citizens at galleys ready for final delivery tasks.")


    # Finally, process general activities for any remaining idle citizens
    citizens_for_general_processing = list(citizens_still_available_after_final_delivery) # Use the latest available pool
    log.info(f"Processing general activities for {len(citizens_for_general_processing)} remaining idle citizens.")

    for citizen_record in citizens_for_general_processing:
        if dry_run:
            # Avoid double counting if already simulated for galley tasks in dry_run
            if not (idle_citizens and galley_fetch_activities_created > 0): # Simplified check
                 log.info(f"[DRY RUN] Would create general activity for citizen {citizen_record['id']}")
                 success_count +=1 # Add to dry run success count
        else:
            activity_created_for_citizen = process_citizen_activity(tables, citizen_record, night_time)
            if activity_created_for_citizen:
                success_count += 1
    
    log.info(f"Activity creation process complete. Total activities created or simulated: {success_count} for {len(idle_citizens)} initially idle citizens.")


def process_final_deliveries_from_galley(tables: Dict[str, Table], citizens_pool: List[Dict], now_utc_dt: datetime.datetime) -> int:
    """
    Identifies citizens at galleys carrying resources from a fetch_from_galley activity
    and creates deliver_resource_batch activities to the final buyer.
    Modifies citizens_pool by removing citizens who are assigned a delivery.
    Returns the number of delivery activities created.
    """
    activities_created_count = 0
    citizens_assigned_delivery = []

    if not citizens_pool:
        return 0

    try:
        arrived_galleys = tables['buildings'].all(formula="AND({Type}='merchant_galley', {IsConstructed}=TRUE())")
        if not arrived_galleys:
            # log.info("No arrived merchant galleys found for final delivery processing.")
            return 0
        
        galley_locations_map = {
            galley['id']: (_get_building_position_coords(galley), galley['fields'].get('BuildingId'))
            for galley in arrived_galleys if _get_building_position_coords(galley) and galley['fields'].get('BuildingId')
        }
        if not galley_locations_map:
            log.info("No arrived galleys with valid positions found.")
            return 0

        for citizen_record in list(citizens_pool): # Iterate over a copy for safe removal
            citizen_username = citizen_record['fields'].get('Username')
            citizen_airtable_id = citizen_record['id']
            citizen_custom_id = citizen_record['fields'].get('CitizenId', citizen_username)
            citizen_pos_str = citizen_record['fields'].get('Position')
            
            if not citizen_pos_str or not citizen_username:
                continue
            
            try:
                citizen_current_pos = json.loads(citizen_pos_str)
            except json.JSONDecodeError:
                continue

            at_galley_airtable_id = None
            current_galley_custom_id = None

            for galley_aid, (galley_pos, galley_cid) in galley_locations_map.items():
                if _calculate_distance_meters(citizen_current_pos, galley_pos) < 20: # Citizen is at this galley
                    at_galley_airtable_id = galley_aid
                    current_galley_custom_id = galley_cid
                    break
            
            if not at_galley_airtable_id:
                continue # Citizen not at any known galley

            # Citizen is at a galley. Check resources they are carrying.
            # Resources are owned by the ultimate_buyer_username, Asset is citizen_username
            carried_res_formula = f"AND({{Asset}}='{_escape_airtable_value(citizen_username)}', {{AssetType}}='citizen')"
            
            try:
                carried_resources_records = tables['resources'].all(formula=carried_res_formula)
            except Exception as e_fetch_carried:
                log.error(f"Error fetching carried resources for {citizen_username} at galley: {e_fetch_carried}")
                continue

            resources_for_delivery_by_contract: Dict[str, List[Dict]] = defaultdict(list)
            contract_to_buyer_building_map: Dict[str, str] = {}

            for res_rec in carried_resources_records:
                notes = res_rec['fields'].get('Notes', '')
                match = re.search(r"Fetched for contract: (contract-[^\s]+)", notes)
                if match:
                    original_contract_id = match.group(1)
                    resources_for_delivery_by_contract[original_contract_id].append({
                        "ResourceId": res_rec['fields'].get('Type'),
                        "Amount": float(res_rec['fields'].get('Count', 0))
                    })
                    # Store buyer building if not already fetched for this contract
                    if original_contract_id not in contract_to_buyer_building_map:
                        original_contract_details = tables['contracts'].all(formula=f"{{ContractId}}='{_escape_airtable_value(original_contract_id)}'", max_records=1)
                        if original_contract_details:
                            buyer_building_custom_id = original_contract_details[0]['fields'].get('BuyerBuilding')
                            if buyer_building_custom_id:
                                contract_to_buyer_building_map[original_contract_id] = buyer_building_custom_id
                            else:
                                log.warning(f"Original contract {original_contract_id} does not have a BuyerBuilding. Cannot create final delivery.")
                        else:
                             log.warning(f"Could not fetch original contract details for {original_contract_id}. Cannot create final delivery.")


            if not resources_for_delivery_by_contract:
                # log.info(f"Citizen {citizen_username} at galley {current_galley_custom_id} but no resources marked 'Fetched for contract'.")
                continue

            # Create one deliver_resource_batch activity per original contract
            for original_contract_id, resources_list in resources_for_delivery_by_contract.items():
                if not resources_list: continue

                buyer_building_custom_id = contract_to_buyer_building_map.get(original_contract_id)
                if not buyer_building_custom_id:
                    log.warning(f"No BuyerBuilding found for contract {original_contract_id} for citizen {citizen_username}. Skipping this batch.")
                    continue

                buyer_building_record_list = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(buyer_building_custom_id)}'", max_records=1)
                if not buyer_building_record_list:
                    log.warning(f"BuyerBuilding {buyer_building_custom_id} for contract {original_contract_id} not found. Skipping delivery for {citizen_username}.")
                    continue
                
                buyer_building_record = buyer_building_record_list[0]
                buyer_building_airtable_id = buyer_building_record['id']
                buyer_building_pos = _get_building_position_coords(buyer_building_record)

                if not buyer_building_pos:
                    log.warning(f"BuyerBuilding {buyer_building_custom_id} has no position. Skipping delivery for {citizen_username}.")
                    continue

                path_to_buyer = get_path_between_points(citizen_current_pos, buyer_building_pos)
                if path_to_buyer and path_to_buyer.get('success'):
                    from .resource_fetching_activity_creator import try_create as try_create_deliver_batch_placeholder # Using this structure
                    
                    # We need a proper deliver_resource_batch creator or inline logic
                    # For now, adapting resource_fetching_activity_creator structure
                    # This should be a call to a dedicated deliver_resource_batch_creator if it existed
                    # Or inline the creation logic:
                    
                    activity_id_str_final = f"deliver_final_{citizen_custom_id}_{uuid.uuid4()}"
                    start_date_iso = path_to_buyer.get('timing', {}).get('startDate', now_utc_dt.isoformat())
                    end_date_iso = path_to_buyer.get('timing', {}).get('endDate')
                    if not end_date_iso:
                        end_date_iso = (now_utc_dt + datetime.timedelta(hours=1)).isoformat() # Default 1hr

                    final_delivery_payload = {
                        "ActivityId": activity_id_str_final,
                        "Type": "deliver_resource_batch",
                        "Citizen": citizen_username,
                        "FromBuilding": at_galley_airtable_id, # From the galley
                        "ToBuilding": buyer_building_airtable_id, # To the buyer's building
                        "Resources": json.dumps(resources_list),
                        "ContractId": original_contract_id, # CRITICAL: This is the Original Custom Contract ID
                        "Path": json.dumps(path_to_buyer.get('path', [])),
                        "Transporter": path_to_buyer.get('transporter'),
                        "CreatedAt": now_utc_dt.isoformat(),
                        "StartDate": start_date_iso,
                        "EndDate": end_date_iso,
                        "Priority": 9, # Priorité élevée pour la livraison finale
                        "Notes": f"🚢 Delivering resources from galley {current_galley_custom_id} to {buyer_building_custom_id} for contract {original_contract_id}."
                    }
                    try:
                        created_activity = tables['activities'].create(final_delivery_payload)
                        if created_activity and created_activity.get('id'):
                            log.info(f"Created final deliver_resource_batch activity {created_activity['id']} for {citizen_username} from galley {current_galley_custom_id} to {buyer_building_custom_id}.")
                            activities_created_count += 1
                            citizens_assigned_delivery.append(citizen_record) # Mark citizen as assigned
                            # Break from this citizen's resource processing for now, they have a task.
                            # More complex logic could batch multiple contract deliveries if path is similar.
                            break 
                        else:
                            log.error(f"Failed to create final deliver_resource_batch for {citizen_username}.")
                    except Exception as e_create_final:
                        log.error(f"Error creating final deliver_resource_batch for {citizen_username}: {e_create_final}")
                else:
                    log.warning(f"Pathfinding from galley {current_galley_custom_id} to buyer building {buyer_building_custom_id} failed for {citizen_username}.")
            
            if citizen_record in citizens_assigned_delivery and citizen_record in citizens_pool : # If assigned, remove from pool
                 citizens_pool.remove(citizen_record)


    except Exception as e:
        log.error(f"Error in process_final_deliveries_from_galley: {e}")
    
    log.info(f"Created {activities_created_count} final delivery activities from galleys.")
    return activities_created_count


def process_galley_unloading_activities(tables: Dict[str, Table], idle_citizens: List[Dict], now_utc_dt: datetime.datetime) -> int:
    """
    Identifies merchant galleys with pending deliveries and creates 'fetch_from_galley'
    activities for idle citizens to unload them.
    Returns the number of 'fetch_from_galley' activities created.
    """
    activities_created_count = 0
    if not idle_citizens:
        log.info("No idle citizens available to process galley unloading.")
        return 0

    try:
        # Only consider galleys that have "arrived" (IsConstructed = True)
        formula_galleys = "AND({Type}='merchant_galley', {PendingDeliveriesData}!='', {IsConstructed}=TRUE())"
        galleys_with_pending = tables['buildings'].all(formula=formula_galleys)
        log.info(f"Found {len(galleys_with_pending)} merchant galleys that have arrived and have PendingDeliveriesData.")

        available_citizens_pool = list(idle_citizens) # Make a mutable copy

        for galley_record in galleys_with_pending:
            if not available_citizens_pool:
                log.info("No more idle citizens available for further galley unloading tasks.")
                break

            galley_airtable_id = galley_record['id']
            galley_custom_id = galley_record['fields'].get('BuildingId')
            galley_position_str = galley_record['fields'].get('Position')
            pending_data_str = galley_record['fields'].get('PendingDeliveriesData', '[]')

            if not galley_custom_id or not galley_position_str:
                log.warning(f"Galley {galley_airtable_id} missing BuildingId or Position. Skipping.")
                continue
            
            try:
                galley_position = json.loads(galley_position_str)
                pending_deliveries = json.loads(pending_data_str)
            except json.JSONDecodeError:
                log.error(f"Could not parse Position or PendingDeliveriesData for galley {galley_custom_id}. Skipping.")
                continue

            if not pending_deliveries:
                # log.info(f"Galley {galley_custom_id} has no pending deliveries in its data. Skipping.")
                continue
            
            log.info(f"Processing galley {galley_custom_id} with {len(pending_deliveries)} items in PendingDeliveriesData.")

            for item_to_fetch in pending_deliveries:
                if not available_citizens_pool:
                    log.info(f"No more idle citizens for items in galley {galley_custom_id}.")
                    break # Break from items loop for this galley

                original_contract_id = item_to_fetch.get('contract_id')
                resource_type = item_to_fetch.get('resource_type')
                amount = float(item_to_fetch.get('amount', 0))

                if not all([original_contract_id, resource_type]) or amount <= 0:
                    log.warning(f"Invalid item in PendingDeliveriesData for galley {galley_custom_id}: {item_to_fetch}")
                    continue

                # Check if an active fetch_from_galley activity already exists for this specific item
                # This is a simplified check; a more robust check might involve a unique hash of the item.
                activity_exists_formula = (f"AND({{Type}}='fetch_from_galley', "
                                           f"{{FromBuilding}}='{galley_airtable_id}', "
                                           f"{{OriginalContractId}}='{_escape_airtable_value(original_contract_id)}', "
                                           f"{{ResourceId}}='{_escape_airtable_value(resource_type)}', "
                                           f"{{Status}}!='processed', {{Status}}!='failed')")
                try:
                    existing_activities = tables['activities'].all(formula=activity_exists_formula, max_records=1)
                    if existing_activities:
                        log.info(f"Active 'fetch_from_galley' already exists for contract {original_contract_id}, resource {resource_type} from galley {galley_custom_id}. Skipping.")
                        continue
                except Exception as e_check_existing:
                    log.error(f"Error checking for existing fetch_from_galley activities: {e_check_existing}")
                    # Proceed with caution or skip

                citizen_for_task = available_citizens_pool.pop(0) # Assign an idle citizen
                
                citizen_custom_id = citizen_for_task['fields'].get('CitizenId')
                citizen_username = citizen_for_task['fields'].get('Username', citizen_custom_id)
                citizen_airtable_id = citizen_for_task['id']
                
                citizen_current_pos_str = citizen_for_task['fields'].get('Position')
                citizen_current_pos = None
                if citizen_current_pos_str:
                    try:
                        citizen_current_pos = json.loads(citizen_current_pos_str)
                    except json.JSONDecodeError:
                        log.warning(f"Could not parse current position for citizen {citizen_username}. Cannot pathfind to galley.")
                        available_citizens_pool.append(citizen_for_task) # Put back if cannot pathfind
                        continue 
                
                if not citizen_current_pos: # If still no position
                    log.warning(f"Citizen {citizen_username} has no current position. Cannot pathfind to galley.")
                    available_citizens_pool.append(citizen_for_task) # Put back
                    continue

                path_to_galley = get_path_between_points(citizen_current_pos, galley_position)
                if path_to_galley and path_to_galley.get('success'):
                    activity_created = try_create_fetch_from_galley_activity(
                        tables,
                        citizen_airtable_id,
                        citizen_custom_id,
                        citizen_username,
                        galley_airtable_id,
                        galley_custom_id,
                        original_contract_id,
                        resource_type,
                        amount,
                        path_to_galley
                    )
                    if activity_created:
                        activities_created_count += 1
                        log.info(f"Created 'fetch_from_galley' for {citizen_username} to galley {galley_custom_id} for {amount} of {resource_type}.")
                        # The processor for fetch_from_galley should update PendingDeliveriesData on the galley.
                    else:
                        available_citizens_pool.append(citizen_for_task) # Put back if failed
                else:
                    log.warning(f"Pathfinding to galley {galley_custom_id} failed for citizen {citizen_username}. Item: {item_to_fetch}")
                    available_citizens_pool.append(citizen_for_task) # Put back

    except Exception as e:
        log.error(f"Error processing galley unloading activities: {e}")
    
    log.info(f"Created {activities_created_count} 'fetch_from_galley' activities.")
    return activities_created_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create activities for idle citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    create_activities(dry_run=args.dry_run)
