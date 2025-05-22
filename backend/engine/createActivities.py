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

# Import activity creators
from backend.engine.activity_creators.stay_activity_creator import try_create as try_create_stay_activity
from backend.engine.activity_creators.goto_work_activity_creator import try_create as try_create_goto_work_activity
from backend.engine.activity_creators.goto_home_activity_creator import try_create as try_create_goto_home_activity
from backend.engine.activity_creators.travel_to_inn_activity_creator import try_create as try_create_travel_to_inn_activity
from backend.engine.activity_creators.idle_activity_creator import try_create as try_create_idle_activity
from backend.engine.activity_creators.production_activity_creator import try_create as try_create_production_activity
from backend.engine.activity_creators.resource_fetching_activity_creator import try_create as try_create_resource_fetching_activity
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
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_record_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_record_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_record_id}: {e_update}")
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
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_record_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_record_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_record_id}: {e_update}")
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
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_id}: {e_update}")
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
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_id}: {e_update}")
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
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_id}: {e_update}")
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
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_id}: {e_update}")
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

    home_city = citizen['fields'].get('HomeCity') # Check if citizen is a visitor
    log.info(f"Citizen {citizen_username} HomeCity: '{home_city}'")

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
                        log.info(f"Extracted position from Point field for citizen {citizen_custom_id}: {citizen_position}")
                    except (ValueError, IndexError):
                        log.warning(f"Failed to parse coordinates from Point field: {point_str}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"Invalid position data for citizen {citizen_custom_id}: {citizen['fields'].get('Position')} - Error: {str(e)}")
    
    if not citizen_position:
        log.warning(f"Citizen {citizen_custom_id} has no position data, creating idle activity")
        create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id)
        return True
    
    # If it's nighttime, handle nighttime activities
    if is_night:
        if home_city and home_city.strip(): # Visitor logic: HomeCity is not null and not empty
            log.info(f"Citizen {citizen_username} is a visitor from {home_city}. Finding an inn.")
            closest_inn = get_closest_inn(tables, citizen_position)

            if closest_inn:
                inn_position_coords = _get_building_position_coords(closest_inn)
                if inn_position_coords:
                    is_at_inn = _calculate_distance_meters(citizen_position, inn_position_coords) < 20
                    inn_building_id = closest_inn['fields'].get('BuildingId', closest_inn['id'])

                    if is_at_inn:
                        log.info(f"Citizen {citizen_username} is already at inn {inn_building_id}. Creating stay activity.")
                        # Calculate end time for stay activity
                        now_utc = datetime.datetime.now(pytz.UTC)
                        venice_now = now_utc.astimezone(VENICE_TIMEZONE)
                        if venice_now.hour < NIGHT_END_HOUR:
                            end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                        else:
                            tomorrow_venice = venice_now + datetime.timedelta(days=1)
                            end_time_venice = tomorrow_venice.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                        stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                        try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_building_id, stay_location_type="inn", end_time_utc_iso=stay_end_time_utc_iso)
                    else:
                        log.info(f"Citizen {citizen_username} is not at inn {inn_building_id}. Finding path to inn.")
                        path_data = get_path_between_points(citizen_position, inn_position_coords)
                        if path_data and path_data.get('success'):
                            try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_building_id, path_data)
                        else:
                            log.warning(f"Path finding to inn {inn_building_id} failed for {citizen_username}. Creating idle activity.")
                            idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                else:
                    log.warning(f"Closest inn {closest_inn['id']} has no position data. Creating idle activity for {citizen_username}.")
                    idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
            else:
                log.warning(f"No inn found for visitor {citizen_username}. Creating idle activity.")
                idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
        else: # Resident logic (HomeCity is null or empty)
            log.info(f"Citizen {citizen_username} is a resident or HomeCity is not set. Finding home.")
            # Find citizen's home
            home = get_citizen_home(tables, citizen_custom_id) 
            
            if not home:
                log.warning(f"Citizen {citizen_custom_id} has no home, creating idle activity")
                idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                return True
            
            # Get home position
            home_position = _get_building_position_coords(home)
        
            if not home_position:
                log.warning(f"Home {home['fields'].get('BuildingId', home['id'])} has no position data, creating idle activity for resident {citizen_custom_id}")
                idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                return True
            
            # Check if citizen is already at home
            is_at_home = _calculate_distance_meters(citizen_position, home_position) < 20
            
            if is_at_home:
                # Citizen is at home, create rest activity
                home_building_id = home['fields'].get('BuildingId', home['id'])
                now_utc = datetime.datetime.now(pytz.UTC)
                venice_now = now_utc.astimezone(VENICE_TIMEZONE)
                if venice_now.hour < NIGHT_END_HOUR:
                    end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                else:
                    tomorrow_venice = venice_now + datetime.timedelta(days=1)
                    end_time_venice = tomorrow_venice.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
                stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_building_id, stay_location_type="home", end_time_utc_iso=stay_end_time_utc_iso)
            else:
                # Citizen needs to go home, get path
                path_data = get_path_between_points(citizen_position, home_position)
                
                if path_data and path_data.get('success'):
                    # Create goto_home activity
                    home_building_id = home['fields'].get('BuildingId', home['id'])
                    try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_building_id, path_data)
                else:
                    # Path finding failed, create idle activity
                    log.warning(f"Path finding to home failed for resident {citizen_custom_id}. Creating idle activity.")
                    idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
    else:
        # Daytime activities - FIRST check if citizen is at their workplace
        
        # Get citizen's workplace
            create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id)
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
            create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id)
            return True
        
        # Check if citizen is already at home
        # Simple check: if positions are close enough (within 20 meters)
        is_at_home = False
        try:
            # Calculate distance between points
            from math import sqrt, pow
            distance = sqrt(pow(citizen_position['lat'] - home_position['lat'], 2) + 
                           pow(citizen_position['lng'] - home_position['lng'], 2))
            
            # Convert to approximate meters (very rough approximation)
            distance_meters = distance * 111000  # 1 degree is roughly 111 km at the equator
            
            is_at_home = distance_meters < 20  # Within 20 meters
        except (KeyError, TypeError):
            log.warning(f"Error calculating distance for citizen {citizen_custom_id}")
        
        if is_at_home:
            # Citizen is at home, create rest activity
            home_building_id = home['fields'].get('BuildingId', home['id'])
            create_rest_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_building_id)
        else:
            # Citizen needs to go home, get path
            path_data = get_path_to_home(citizen_position, home_position)
            
            if path_data and path_data.get('success'):
                # Create goto_home activity
                home_building_id = home['fields'].get('BuildingId', home['id'])
                create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_building_id, path_data)
            else:
                # Path finding failed, create idle activity
                create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id)
    else:
        # Daytime activities - FIRST check if citizen is at their workplace
        
        # Get citizen's workplace
        workplace = get_citizen_workplace(tables, citizen_custom_id, citizen_username) # Assuming get_citizen_workplace uses custom CitizenId or Username
        
        if workplace:
            # Get workplace position
            workplace_position = _get_building_position_coords(workplace)
            
            if not workplace_position:
                log.warning(f"Workplace {workplace['fields'].get('BuildingId', workplace['id'])} has no position data, creating idle activity")
                idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                return True
            
            # Check if citizen is already at workplace
            is_at_workplace = _calculate_distance_meters(citizen_position, workplace_position) < 20
            
            if is_at_workplace:
                # Citizen is at workplace, proceed with normal work activities
                log.info(f"Citizen {citizen_custom_id} is at their workplace, creating work activity")
                
                # Continue with existing work activity logic
                building_type = workplace['fields'].get('Type')
                building_id = workplace['fields'].get('BuildingId', workplace['id'])
                
                log.info(f"Using work building: {building_id} (Type: {building_type})")
                
                # Get building type information
                building_type_info = get_building_type_info(building_type)
                
                if building_type_info and 'productionInformation' in building_type_info:
                    production_info = building_type_info['productionInformation']
                    
                    # Check if there are Arti recipes
                    if 'Arti' in production_info and isinstance(production_info['Arti'], list):
                        recipes = production_info['Arti']
                        
                        # Get current resources in the building
                        building_resources = get_building_resources(tables, building_id)
                        
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
                            # Pass citizen's airtable_id, custom_id, username, and workplace's airtable_id
                            try_create_production_activity(tables, citizen_airtable_record_id, citizen_custom_id, citizen_username, workplace['id'], selected_recipe)
                            return True
                        else:
                            # Not enough resources for production, check contracts
                            contracts = get_citizen_contracts(tables, citizen_custom_id) # get_citizen_contracts uses custom_id
                            
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
                                                    create_resource_fetching_activity( # citizen contains airtable_id
                                                        tables, citizen, contract, from_building, to_building, path
                                                    )
                                                    return True
                            
                            # If we get here, no contracts could be executed
                            log.info(f"No viable contracts for citizen {citizen_custom_id}, creating idle activity")
                            create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id)
                            return True
                    else:
                        # No Arti recipes, create idle activity
                        log.info(f"No Arti recipes for building type {building_type}, creating idle activity")
                        create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id)
                        return True
            else:
                # Citizen is not at workplace, create goto_work activity
                log.info(f"Citizen {citizen_custom_id} is not at their workplace, creating goto_work activity")
                
                # Get path to workplace
                path_data = get_path_between_points(citizen_position, workplace_position)
                
                if path_data and path_data.get('success'):
                    # Create goto_work activity
                    workplace_building_id = workplace['fields'].get('BuildingId', workplace['id'])
                    try_create_goto_work_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, workplace_building_id, path_data)
                    return True
                else:
                    # Path finding failed, create idle activity
                    log.warning(f"Failed to find path to workplace for citizen {citizen_custom_id}, creating idle activity")
                    idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                    return True
        else:
            # No workplace found, continue with existing logic for citizens without workplaces
            log.info(f"No workplace found for citizen {citizen_username}, checking for other activities")
            
            # Continue with the existing code for citizens without workplaces
            # NEW CODE: Check if citizen has a work building by looking up buildings where 
            # Occupant = CitizenUsername AND Category = business
            log.info(f"Looking for work buildings where Occupant={citizen_username} AND Category=business")
            
            # Build the formula for finding work buildings
            formula = f"AND({{Occupant}}='{citizen_username}', {{Category}}='business')"
            
            try:
                # Query for business buildings where this citizen is the occupant
                work_buildings = tables['buildings'].all(formula=formula)
                
                if work_buildings:
                    log.info(f"Found {len(work_buildings)} work buildings for citizen {citizen_username}")
                    
                    # Use the first work building found
                    work_building = work_buildings[0]
                    building_type = work_building['fields'].get('Type')
                    
                    # Use BuildingId for logging
                    building_id = work_building['fields'].get('BuildingId', work_building['id'])
                    
                    log.info(f"Using work building: {building_id} (Type: {building_type})")
                    
                    # Get building type information
                    building_type_info = get_building_type_info(building_type)
                    
                    if building_type_info and 'productionInformation' in building_type_info:
                        production_info = building_type_info['productionInformation']
                        
                        # Check if there are Arti recipes
                        if 'Arti' in production_info and isinstance(production_info['Arti'], list):
                            recipes = production_info['Arti']
                            
                            # Get current resources in the building
                            building_resources = get_building_resources(tables, building_id)
                            
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
                                try_create_production_activity(tables, citizen_airtable_record_id, citizen_custom_id, citizen_username, work_building['id'], selected_recipe)
                                return True
                            else:
                                # Not enough resources for production, check contracts
                                contracts = get_citizen_contracts(tables, citizen_custom_id) # get_citizen_contracts uses custom_id
                                
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
                                                from_building_rec_alt = from_buildings[0]
                                                to_building_rec_alt = to_buildings[0]
                                                
                                                resource_type_contract_alt = contract['fields'].get('ResourceType')
                                                amount_contract_alt = float(contract['fields'].get('Amount', 0) or 0)
                                                
                                                source_resources_contract_alt = get_building_resources(tables, from_building_id) # from_building_id is BuildingId
                                                
                                                if resource_type_contract_alt in source_resources_contract_alt and source_resources_contract_alt[resource_type_contract_alt] >= amount_contract_alt:
                                                    path_contract_alt = find_path_between_buildings(from_building_rec_alt, to_building_rec_alt)
                                                    
                                                    if path_contract_alt:
                                                        try_create_resource_fetching_activity(
                                                            tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                                                            contract['id'], from_building_rec_alt['id'], to_building_rec_alt['id'],
                                                            resource_type_contract_alt, amount_contract_alt, path_contract_alt
                                                        )
                                                        return True
                                
                                # If we get here, no contracts could be executed
                                log.info(f"No viable contracts for citizen {citizen_custom_id}, creating idle activity")
                                idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                                return True
                        else:
                            # No Arti recipes, create idle activity
                            log.info(f"No Arti recipes for building type {building_type}, creating idle activity")
                            idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                            return True
                    else:
                        # No production information, create idle activity
                        log.info(f"No production information for building type {building_type}, creating idle activity")
                        idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                        return True
                else:
                    # No work building found, create idle activity
                    log.info(f"No work buildings found for citizen {citizen_username}, creating idle activity")
                    idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
                    return True
            except Exception as e:
                log.error(f"Error finding work buildings for citizen {citizen_username}: {e}")
                idle_end_time_iso = (datetime.datetime.now(pytz.UTC) + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso)
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
