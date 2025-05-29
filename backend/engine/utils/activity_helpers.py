import logging
import json
import uuid # Added import for uuid module
import re # Added import for re module
import datetime
import requests
import pytz
import math # Added for Haversine distance
import os # Added import for os module
from typing import Dict, List, Optional, Any, Tuple # Added Tuple
from pyairtable import Table # Import Table for type hinting
from dateutil import parser as dateutil_parser # For robust date parsing

log = logging.getLogger(__name__)

# Define ANSI color codes for logging
class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Leave it like this, it allow me to debug day activities at night

def get_venice_time_now() -> datetime.datetime:
    """Returns the current time in the VENICE_TIMEZONE."""
    return datetime.datetime.now(VENICE_TIMEZONE)

def _escape_airtable_value(value: Any) -> str: # Changed type hint for broader use
    """Escapes single quotes for Airtable formulas."""
    if isinstance(value, str):
        return value.replace("'", "\\'") # Échapper correctement les apostrophes
    return str(value)

def _has_recent_failed_activity_for_contract(
    tables: Dict[str, Table], 
    activity_type_to_check: str, 
    contract_id_in_activity_table: str, 
    hours_ago: int = 6
) -> bool:
    """
    Checks if there's a recently failed activity of a specific type for a given ContractId.
    The ContractId here is what's stored in the ACTIVITIES.ContractId field for that activity type.
    """
    try:
        # Simplified formula to fetch failed activities of the specified type and contract
        formula = (f"AND({{Type}}='{_escape_airtable_value(activity_type_to_check)}', "
                   f"{{ContractId}}='{_escape_airtable_value(contract_id_in_activity_table)}', "
                   f"{{Status}}='failed')")
        
        failed_activities = tables['activities'].all(formula=formula) # Fetch all matching, not just max_records=1
        
        if not failed_activities:
            return False

        now_utc = datetime.datetime.now(pytz.utc)
        threshold_time = now_utc - datetime.timedelta(hours=hours_ago)

        for activity in failed_activities:
            end_date_str = activity['fields'].get('EndDate')
            if end_date_str:
                try:
                    end_date_dt = dateutil_parser.isoparse(end_date_str)
                    if end_date_dt.tzinfo is None: # Ensure timezone aware
                        end_date_dt = pytz.utc.localize(end_date_dt)
                    
                    if end_date_dt > threshold_time:
                        log.info(f"{LogColors.WARNING}Found recently failed '{activity_type_to_check}' activity (ID: {activity['id']}) for ContractId '{contract_id_in_activity_table}' (ended at {end_date_str}, within last {hours_ago} hours). Skipping recreation.{LogColors.ENDC}")
                        return True
                except Exception as e_parse:
                    log.error(f"{LogColors.FAIL}Error parsing EndDate '{end_date_str}' for activity {activity['id']}: {e_parse}{LogColors.ENDC}")
        return False
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error checking for recent failed activities for type '{activity_type_to_check}', ContractId '{contract_id_in_activity_table}': {e}{LogColors.ENDC}")
        return False # Default to false to allow creation if check fails

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
                    try:
                        lat, lng = float(lat_str), float(lng_str)
                        position = {"lat": lat, "lng": lng}
                    except ValueError:
                        log.warning(f"{LogColors.WARNING}Non-numeric lat/lng parts in Point field: {point_str} for building {building_record.get('id', 'N/A')}{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}Point field format not recognized for coordinate extraction: {point_str} for building {building_record.get('id', 'N/A')}{LogColors.ENDC}")
            # else: Point field is also empty or not a string
    except (json.JSONDecodeError, TypeError, ValueError, IndexError) as e:
        building_id_log = building_record.get('id', 'N/A')
        position_str_log = building_record['fields'].get('Position', 'N/A_POS_STR') # Ensure it's a string for logging
        point_str_log = building_record['fields'].get('Point', 'N/A_POINT_STR') # Ensure it's a string for logging
        log.warning(f"{LogColors.WARNING}Could not parse position for building {building_id_log}: {e}. Position string: '{position_str_log}', Point string: '{point_str_log}'{LogColors.ENDC}")
    
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
        log.warning(f"{LogColors.WARNING}Invalid coordinate types for distance calculation: pos1={pos1}, pos2={pos2}{LogColors.ENDC}")
        return float('inf')

    from math import sqrt, pow # Keep import local if not used elsewhere globally
    distance_degrees = sqrt(pow(lat1 - lat2, 2) + pow(lng1 - lng2, 2))
    return distance_degrees * 111000  # Rough approximation (1 degree ~ 111km)

def calculate_haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in meters between two points on the earth."""
    R = 6371000  # Radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    return distance

CITIZEN_CARRY_CAPACITY = 10.0 # Max items a citizen can carry
DEFAULT_CITIZEN_CARRY_CAPACITY = CITIZEN_CARRY_CAPACITY # Default fallback capacity

def get_citizen_effective_carry_capacity(citizen_record: Dict[str, Any]) -> float:
    """Gets the effective carry capacity for a citizen, checking for an override."""
    if not citizen_record or 'fields' not in citizen_record:
        return DEFAULT_CITIZEN_CARRY_CAPACITY
    
    override_capacity_str = citizen_record['fields'].get('CarryCapacityOverride')
    if override_capacity_str is not None:
        try:
            # Ensure override_capacity_str is treated as string for float conversion,
            # as Airtable might return numbers directly for Number fields.
            override_capacity = float(str(override_capacity_str))
            if override_capacity > 0:
                # log.debug(f"Citizen {citizen_record['fields'].get('Username', citizen_record['id'])} using CarryCapacityOverride: {override_capacity}")
                return override_capacity
        except ValueError:
            log.warning(f"Invalid CarryCapacityOverride value '{override_capacity_str}' for citizen {citizen_record['fields'].get('Username', citizen_record['id'])}. Using default.")
            
    return DEFAULT_CITIZEN_CARRY_CAPACITY

def get_building_types_from_api(api_base_url: Optional[str] = None) -> Dict:
    """Get building types information from the API."""
    if api_base_url is None:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
    try:
        url = f"{api_base_url}/api/building-types"
        log.info(f"{LogColors.OKBLUE}Fetching building types from API: {url}{LogColors.ENDC}")
        response = requests.get(url, timeout=15) # Added timeout
        response.raise_for_status() # Raise an exception for HTTP errors
        data = response.json()
        
        if data.get("success") and "buildingTypes" in data:
            building_types = data["buildingTypes"]
            # Transform the data into a dictionary keyed by building type
            building_defs = {}
            for bt in building_types:
                if "type" in bt:
                    building_defs[bt["type"]] = {
                        "type": bt["type"],
                        "name": bt.get("name"),
                        "consumeTier": bt.get("consumeTier"), # Prioritaire
                        "buildTier": bt.get("buildTier"),   # Fallback 1
                        "tier": bt.get("tier"),             # Fallback 2
                        # Inclure d'autres champs nécessaires, par exemple productionInformation
                        "productionInformation": bt.get("productionInformation", {}),
                        "canImport": bt.get("canImport"),
                        # ... autres champs que vous pourriez utiliser de building_type_definitions
                    }
            log.info(f"{LogColors.OKGREEN}Successfully fetched {len(building_defs)} building types from API.{LogColors.ENDC}")
            return building_defs
        else:
            log.error(f"{LogColors.FAIL}Unexpected API response format for building types: {data}{LogColors.ENDC}")
            return {}
    except requests.exceptions.RequestException as e_req:
        log.error(f"{LogColors.FAIL}RequestException fetching building types from API: {e_req}{LogColors.ENDC}")
        return {}
    except json.JSONDecodeError as e_json:
        log.error(f"{LogColors.FAIL}JSONDecodeError fetching building types from API: {e_json}{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception fetching building types from API: {str(e)}{LogColors.ENDC}")
        return {}

def get_resource_types_from_api(api_base_url: Optional[str] = None) -> Dict:
    """Get resource types information from the API."""
    if api_base_url is None:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
    try:
        url = f"{api_base_url}/api/resource-types"
        log.info(f"{LogColors.OKBLUE}Fetching resource types from API: {url}{LogColors.ENDC}")
        response = requests.get(url, timeout=15) # Added timeout
        response.raise_for_status() # Raise an exception for HTTP errors
        data = response.json()
        
        if data.get("success") and "resourceTypes" in data:
            resource_types = data["resourceTypes"]
            # Transform the data into a dictionary keyed by resource id
            resource_defs = {res["id"]: res for res in resource_types if "id" in res}
            log.info(f"{LogColors.OKGREEN}Successfully fetched {len(resource_defs)} resource types from API.{LogColors.ENDC}")
            return resource_defs
        else:
            log.error(f"{LogColors.FAIL}Unexpected API response format for resource types: {data}{LogColors.ENDC}")
            return {}
    except requests.exceptions.RequestException as e_req:
        log.error(f"{LogColors.FAIL}RequestException fetching resource types from API: {e_req}{LogColors.ENDC}")
        return {}
    except json.JSONDecodeError as e_json:
        log.error(f"{LogColors.FAIL}JSONDecodeError fetching resource types from API: {e_json}{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception fetching resource types from API: {str(e)}{LogColors.ENDC}")
        return {}

def get_citizen_record(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    """Fetches a citizen record by username."""
    formula = f"{{Username}} = '{_escape_airtable_value(username)}'"
    try:
        records = tables['citizens'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching citizen record for {username}: {e}{LogColors.ENDC}")
        return None

def get_contract_record(tables: Dict[str, Table], contract_id: str) -> Optional[Dict]:
    """Fetches a contract record by ContractId."""
    # Assuming contract_id is the custom ContractId string, not Airtable record ID
    formula = f"{{ContractId}} = '{_escape_airtable_value(contract_id)}'"
    try:
        records = tables['contracts'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching contract record for {contract_id}: {e}{LogColors.ENDC}")
        return None

def get_building_current_storage(tables: Dict[str, Table], building_custom_id: str) -> float:
    """Calculates the total count of resources currently in a building."""
    formula = f"AND({{Asset}} = '{_escape_airtable_value(building_custom_id)}', {{AssetType}} = 'building')"
    total_stored_volume = 0.0 # Ensure it's a float
    try:
        resources_in_building = tables['resources'].all(formula=formula)
        for resource in resources_in_building:
            total_stored_volume += float(resource['fields'].get('Count', 0.0)) # Ensure count is float
        log.info(f"{LogColors.OKBLUE}Building {building_custom_id} currently stores {total_stored_volume} units of resources.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error calculating current storage for building {building_custom_id}: {e}{LogColors.ENDC}")
    return total_stored_volume

def is_nighttime(current_venice_time: Optional[datetime.datetime] = None) -> bool:
    """Check if it's currently nighttime in Venice."""
    # Constants for night hours, could be moved to a config if needed
    NIGHT_START_HOUR = 22  # 10 PM
    NIGHT_END_HOUR = 6     # 6 AM
    
    now = current_venice_time or datetime.datetime.now(VENICE_TIMEZONE)
    hour = now.hour
    
    return hour >= NIGHT_START_HOUR or hour < NIGHT_END_HOUR

def is_shopping_time(current_venice_time: Optional[datetime.datetime] = None) -> bool:
    """Check if it's currently shopping time in Venice (5 PM to 8 PM)."""
    # Constants for shopping hours
    SHOPPING_START_HOUR = 17 # 5 PM
    SHOPPING_END_HOUR = 20   # 8 PM

    now_venice = current_venice_time or datetime.datetime.now(VENICE_TIMEZONE)
    return SHOPPING_START_HOUR <= now_venice.hour < SHOPPING_END_HOUR

def is_docks_open_time(current_venice_time: Optional[datetime.datetime] = None) -> bool:
    """Check if it's currently docks opening hours in Venice (e.g., 6 AM to 6 PM)."""
    # Constants for docks opening hours
    DOCKS_OPEN_START_HOUR = 6  # 6 AM
    DOCKS_OPEN_END_HOUR = 18   # 6 PM

    now_venice = current_venice_time or datetime.datetime.now(VENICE_TIMEZONE)
    return DOCKS_OPEN_START_HOUR <= now_venice.hour < DOCKS_OPEN_END_HOUR

def get_path_between_points(start_position: Dict, end_position: Dict, transport_api_url: str) -> Optional[Dict]:
    """Get a path between two points using the transport API."""
    log.info(f"{LogColors.OKBLUE}Getting path from {start_position} to {end_position}{LogColors.ENDC}")
    
    try:
        # Call the transport API
        response = requests.post(
            transport_api_url, # Use passed URL
            json={
                "startPoint": start_position,
                "endPoint": end_position,
                "startDate": datetime.datetime.now(pytz.UTC).isoformat() # Send UTC start date
            }
        )
        
        if response.status_code != 200:
            log.error(f"{LogColors.FAIL}Transport API error: {response.status_code} {response.text}{LogColors.ENDC}")
            return None
        
        result = response.json()
        
        if not result.get('success'):
            log.error(f"{LogColors.FAIL}Transport API returned error: {result.get('error')}{LogColors.ENDC}")
            return None
        
        return result
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error calling transport API: {e}{LogColors.ENDC}")
        return None

def get_citizen_current_load(tables: Dict[str, Table], citizen_username: str) -> float:
    """Calculates the total count of resources currently carried by a citizen."""
    formula = f"AND({{Asset}}='{_escape_airtable_value(citizen_username)}', {{AssetType}}='citizen')"
    current_load = 0.0
    try:
        resources_carried = tables['resources'].all(formula=formula)
        for resource in resources_carried:
            current_load += float(resource['fields'].get('Count', 0))
        log.debug(f"{LogColors.OKBLUE}Citizen {citizen_username} current load: {current_load}{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error calculating current load for citizen {citizen_username}: {e}{LogColors.ENDC}")
    return current_load

def get_closest_inn(tables: Dict[str, Table], citizen_position: Dict[str, float]) -> Optional[Dict]:
    """Finds the closest building of type 'inn' to the citizen's position."""
    log.info(f"{LogColors.OKBLUE}Searching for the closest inn to position: {citizen_position}{LogColors.ENDC}")
    try:
        inns = tables['buildings'].all(formula="{Type}='inn'")
        if not inns:
            log.info(f"{LogColors.OKBLUE}No inns found in the database.{LogColors.ENDC}")
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
                log.warning(f"{LogColors.WARNING}Inn {inn_record.get('id')} has no valid position data.{LogColors.ENDC}")
        
        if closest_inn:
            inn_id_log = closest_inn['fields'].get('BuildingId', closest_inn['id'])
            log.info(f"{LogColors.OKGREEN}Closest inn found: {inn_id_log} at distance {min_distance:.2f}m.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}No inns with valid positions found.{LogColors.ENDC}")
        return closest_inn
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding closest inn: {e}{LogColors.ENDC}")
        return None

def get_citizen_workplace(tables: Dict[str, Table], citizen_custom_id: str, citizen_username: str) -> Optional[Dict]:
    """Find the workplace building for a citizen."""
    log.info(f"{LogColors.OKBLUE}Finding workplace for citizen {citizen_custom_id} (Username: {citizen_username}){LogColors.ENDC}")
    
    try:
        # Get buildings where this citizen is the occupant and the category is business
        formula = f"AND({{Occupant}}='{_escape_airtable_value(citizen_username)}', {{Category}}='business')"
        
        workplaces = tables['buildings'].all(formula=formula)
        
        if workplaces:
            # Check if the workplace has a BuildingId
            building_id = workplaces[0]['fields'].get('BuildingId')
            if not building_id:
                log.warning(f"{LogColors.WARNING}Workplace found for citizen {citizen_custom_id} but missing BuildingId: {workplaces[0]['id']}{LogColors.ENDC}")
            else:
                log.info(f"{LogColors.OKGREEN}Found workplace for citizen {citizen_custom_id}: {building_id}{LogColors.ENDC}")
            return workplaces[0]
        else:
            log.info(f"{LogColors.OKBLUE}No workplace found for citizen {citizen_custom_id}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding workplace for citizen {citizen_custom_id}: {e}{LogColors.ENDC}")
        return None

def get_citizen_home(tables: Dict[str, Table], citizen_username_for_occupant: str) -> Optional[Dict]:
    """Find the home building for a citizen using their username for the Occupant field."""
    log.info(f"{LogColors.OKBLUE}Finding home for citizen (occupant: {citizen_username_for_occupant}){LogColors.ENDC}")
    
    try:
        
        # Get buildings where this citizen is the occupant and the category is 'home'
        formula = f"AND({{Occupant}}='{_escape_airtable_value(citizen_username_for_occupant)}', {{Category}}='home')"
        
        homes = tables['buildings'].all(formula=formula)
        
        if homes:
            # Check if the home has a BuildingId
            building_id = homes[0]['fields'].get('BuildingId')
            home_display_name = homes[0]['fields'].get('Name', building_id or homes[0]['id'])
            if not building_id:
                log.warning(f"{LogColors.WARNING}Home found for citizen {citizen_username_for_occupant} but missing BuildingId: {homes[0]['id']}{LogColors.ENDC}")
            else:
                log.info(f"{LogColors.OKGREEN}Found home '{home_display_name}' for citizen {citizen_username_for_occupant}.{LogColors.ENDC}")
            return homes[0]
        else:
            log.warning(f"{LogColors.WARNING}No home found for citizen {citizen_username_for_occupant}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding home for citizen {citizen_username_for_occupant}: {e}{LogColors.ENDC}")
        return None

def get_building_type_info(building_type: str, building_type_definitions: Dict) -> Optional[Dict]:
    """Get building type information from a pre-fetched dictionary of definitions."""
    log.debug(f"Looking up building type info for '{building_type}' in pre-fetched definitions.")
    bt_info = building_type_definitions.get(building_type)
    if not bt_info:
        log.warning(f"{LogColors.WARNING}Building type '{building_type}' not found in pre-fetched definitions.{LogColors.ENDC}")
    return bt_info

def get_building_resources(tables: Dict[str, Table], building_id: str) -> Dict[str, float]:
    """Get all resources in a building, returned as a dictionary of resource_type -> count."""
    try:
        escaped_building_id = _escape_airtable_value(building_id)
        formula = f"AND({{Asset}}='{escaped_building_id}', {{AssetType}}='building')"
        resources = tables['resources'].all(formula=formula)
        
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

def find_path_between_buildings(from_building: Dict, to_building: Dict, api_base_url: str) -> Optional[Dict]:
    """Find a path between two buildings using the transport API."""
    try:
        from_position = _get_building_position_coords(from_building)
        to_position = _get_building_position_coords(to_building)
        
        if not from_position or not to_position:
            log.warning(f"{LogColors.WARNING}Missing position data for buildings in find_path_between_buildings{LogColors.ENDC}")
            return None
        
        url = f"{api_base_url}/api/transport"
        log.info(f"{LogColors.OKBLUE}Finding path between buildings using API: {url}{LogColors.ENDC}")
        
        response = requests.post(
            url,
            json={
                "startPoint": from_position,
                "endPoint": to_position,
                "startDate": datetime.datetime.now(pytz.UTC).isoformat()
            }
        )
        
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

def get_citizen_contracts(tables: Dict[str, Table], citizen_id: str) -> List[Dict]:
    """Get all active contracts where the citizen is the buyer, sorted by priority."""
    log.info(f"{LogColors.OKBLUE}Fetching recurrent contracts for citizen {citizen_id}{LogColors.ENDC}")
    
    try:
        # Simplified formula to get all recurrent contracts for the buyer
        formula = f"AND({{Buyer}}='{_escape_airtable_value(citizen_id)}', {{Type}}='recurrent')"
        all_recurrent_contracts = tables['contracts'].all(formula=formula)
        
        active_contracts = []
        now_venice_time_for_check = datetime.datetime.now(VENICE_TIMEZONE) # Current time in Venice

        for contract in all_recurrent_contracts:
            fields = contract['fields']
            created_at_str = fields.get('CreatedAt')
            end_at_str = fields.get('EndAt')

            if created_at_str and end_at_str:
                try:
                    created_at_dt = dateutil_parser.isoparse(created_at_str)
                    end_at_dt = dateutil_parser.isoparse(end_at_str)

                    # Ensure datetimes are timezone-aware (assume UTC if not specified, then convert to Venice for comparison)
                    if created_at_dt.tzinfo is None: created_at_dt = pytz.utc.localize(created_at_dt)
                    if end_at_dt.tzinfo is None: end_at_dt = pytz.utc.localize(end_at_dt)
                    
                    # Convert contract times to Venice timezone for comparison with now_venice_time_for_check
                    created_at_venice = created_at_dt.astimezone(VENICE_TIMEZONE)
                    end_at_venice = end_at_dt.astimezone(VENICE_TIMEZONE)

                    if created_at_venice <= now_venice_time_for_check <= end_at_venice:
                        active_contracts.append(contract)
                except Exception as e_parse:
                    log.error(f"{LogColors.FAIL}Error parsing dates for contract {contract.get('id', 'N/A')}: {e_parse}{LogColors.ENDC}")
            
        active_contracts.sort(key=lambda x: int(x['fields'].get('Priority', 0) or 0), reverse=True)
        
        log.info(f"{LogColors.OKGREEN}Found {len(active_contracts)} active recurrent contracts for citizen {citizen_id} after Python filtering.{LogColors.ENDC}")
        return active_contracts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting contracts for citizen {citizen_id}: {e}{LogColors.ENDC}")
        return []

def get_idle_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all citizens who are currently idle (no active activities)."""
    log.info(f"{LogColors.OKBLUE}Fetching idle citizens...{LogColors.ENDC}")
    
    try:
        all_citizens = tables['citizens'].all()
        log.info(f"{LogColors.OKBLUE}Found {len(all_citizens)} total citizens.{LogColors.ENDC}")
        
        # Fetch all activities not yet in a terminal state ('processed' or 'failed')
        non_terminal_activities_formula = "NOT(OR({Status} = 'processed', {Status} = 'failed'))"
        all_potentially_active_activities = tables['activities'].all(formula=non_terminal_activities_formula)
        
        now_utc_for_check = datetime.datetime.now(pytz.utc)
        busy_citizen_usernames = set()

        for activity in all_potentially_active_activities:
            fields = activity['fields']
            start_date_str = fields.get('StartDate')
            end_date_str = fields.get('EndDate')
            citizen_username_from_activity = fields.get('Citizen')

            if not citizen_username_from_activity: # Should not happen for valid activities
                continue

            if start_date_str and end_date_str:
                try:
                    start_date_dt = dateutil_parser.isoparse(start_date_str)
                    end_date_dt = dateutil_parser.isoparse(end_date_str)

                    if start_date_dt.tzinfo is None: start_date_dt = pytz.utc.localize(start_date_dt)
                    if end_date_dt.tzinfo is None: end_date_dt = pytz.utc.localize(end_date_dt)
                    
                    # Check if the current UTC time falls within the activity's StartDate and EndDate
                    if start_date_dt <= now_utc_for_check <= end_date_dt:
                        busy_citizen_usernames.add(citizen_username_from_activity)
                except Exception as e_parse_activity_dates:
                    log.error(f"{LogColors.FAIL}Error parsing dates for activity {activity.get('id', 'N/A')}: {e_parse_activity_dates}{LogColors.ENDC}")
        
        idle_citizens = []
        for citizen_record in all_citizens:
            username = citizen_record['fields'].get('Username')
            if username and username not in busy_citizen_usernames:
                idle_citizens.append(citizen_record)
        
        log.info(f"{LogColors.OKGREEN}Found {len(idle_citizens)} idle citizens (after Python date filtering of non-terminal activities).{LogColors.ENDC}")
        return idle_citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching idle citizens: {e}{LogColors.ENDC}")
        return []

def _fetch_and_assign_random_starting_position(tables: Dict[str, Table], citizen_record: Dict, api_base_url: str) -> Optional[Dict[str, float]]:
    """
    Fetches polygon data, selects a random buildingPoint, assigns it to the citizen,
    and updates their record in Airtable.
    Returns the new position {lat, lng} or None.
    """
    import random # Ensure random is imported here
    citizen_custom_id = citizen_record['fields'].get('CitizenId', citizen_record['id'])
    log.info(f"{LogColors.OKBLUE}Attempting to fetch random building point for citizen {citizen_custom_id}.{LogColors.ENDC}")

    try:
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

def get_building_record(tables: Dict[str, Table], building_id_custom: str) -> Optional[Dict]:
    """Fetches a building record by its custom BuildingId."""
    # Ensure building_id_custom is a string, as it's used in the formula.
    if not isinstance(building_id_custom, str):
        log.warning(f"{LogColors.WARNING}get_building_record received non-string building_id_custom: {building_id_custom} (type: {type(building_id_custom)}). Attempting to cast to string.{LogColors.ENDC}")
        building_id_custom = str(building_id_custom)

    formula = f"{{BuildingId}} = '{_escape_airtable_value(building_id_custom)}'"
    try:
        records = tables['buildings'].all(formula=formula, max_records=1)
        if records:
            return records[0]
        else:
            log.warning(f"{LogColors.WARNING}Building with BuildingId '{building_id_custom}' not found.{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching building record for BuildingId '{building_id_custom}': {e}{LogColors.ENDC}")
        return None

def get_relationship_trust_score(tables: Dict[str, Table], username1: str, username2: str) -> float:
    """
    Fetches the TrustScore from the RELATIONSHIPS table for two citizens.
    Returns 0.0 if no relationship is found or an error occurs.
    """
    if not username1 or not username2 or username1 == username2:
        return 0.0

    # Ensure usernames are ordered alphabetically for consistent querying
    # as Citizen1 is expected to be alphabetically before or equal to Citizen2
    user1_ordered, user2_ordered = sorted([username1, username2])

    formula = f"AND({{Citizen1}}='{_escape_airtable_value(user1_ordered)}', {{Citizen2}}='{_escape_airtable_value(user2_ordered)}')"
    try:
        relationships = tables['relationships'].all(formula=formula, max_records=1)
        if relationships:
            trust_score = float(relationships[0]['fields'].get('TrustScore', 0.0))
            log.info(f"Found relationship between {user1_ordered} and {user2_ordered}. TrustScore: {trust_score}")
            return trust_score
        else:
            log.info(f"No direct relationship found between {user1_ordered} and {user2_ordered}.")
            return 0.0
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching relationship trust score for {user1_ordered} and {user2_ordered}: {e}{LogColors.ENDC}")
        return 0.0

def get_closest_building_to_position(
    tables: Dict[str, Table], 
    position_coords: Dict[str, float], 
    max_distance_meters: float = 50.0
) -> Optional[Dict]:
    """
    Finds the closest building to a given position within a maximum distance.
    Returns the building record or None.
    """
    if not position_coords or 'lat' not in position_coords or 'lng' not in position_coords:
        log.warning(f"{LogColors.WARNING}Invalid position_coords provided to get_closest_building_to_position.{LogColors.ENDC}")
        return None

    closest_building_record = None
    min_distance = float('inf')

    try:
        all_buildings = tables['buildings'].all() # Consider filtering if performance becomes an issue
        if not all_buildings:
            log.info(f"{LogColors.OKBLUE}No buildings found in the database to check for closest.{LogColors.ENDC}")
            return None

        for building_record in all_buildings:
            building_pos = _get_building_position_coords(building_record)
            if building_pos:
                distance = _calculate_distance_meters(position_coords, building_pos)
                if distance < min_distance:
                    min_distance = distance
                    closest_building_record = building_record
        
        if closest_building_record and min_distance <= max_distance_meters:
            building_id_log = closest_building_record['fields'].get('BuildingId', closest_building_record['id'])
            log.info(f"{LogColors.OKGREEN}Closest building to {position_coords} is {building_id_log} at {min_distance:.2f}m (within {max_distance_meters}m limit).{LogColors.ENDC}")
            return closest_building_record
        elif closest_building_record: # Found a building, but it's too far
            building_id_log = closest_building_record['fields'].get('BuildingId', closest_building_record['id'])
            log.info(f"{LogColors.OKBLUE}Closest building {building_id_log} is at {min_distance:.2f}m, which exceeds the {max_distance_meters}m limit.{LogColors.ENDC}")
            return None
        else: # No building with valid position found or no buildings at all
            log.info(f"{LogColors.OKBLUE}No building found within {max_distance_meters}m of {position_coords}.{LogColors.ENDC}")
            return None
            
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding closest building to {position_coords}: {e}{LogColors.ENDC}")
        return None

def get_building_storage_details(
    tables: Dict[str, Table],
    building_custom_id: str,
    owner_username: str
) -> Tuple[float, Dict[str, float]]:
    """Gets total stored volume and a dict of resource_type -> amount for a building and owner."""
    total_volume = 0.0
    resources_map: Dict[str, float] = {}
    formula = (f"AND({{Asset}}='{_escape_airtable_value(building_custom_id)}', "
               f"{{AssetType}}='building', "
               f"{{Owner}}='{_escape_airtable_value(owner_username)}')")
    try:
        resource_records = tables["resources"].all(formula=formula)
        for record in resource_records:
            count = float(record['fields'].get('Count', 0.0))
            resource_type = record['fields'].get('Type')
            if resource_type:
                total_volume += count
                resources_map[resource_type] = resources_map.get(resource_type, 0.0) + count
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching storage details for {building_custom_id} (Owner: {owner_username}): {e}{LogColors.ENDC}")
    return total_volume, resources_map

def get_citizen_inventory_details(tables: Dict[str, Table], citizen_username: str) -> List[Dict[str, Any]]:
    """
    Fetches a detailed list of resources in a citizen's inventory.
    Each item in the list is a dict: {"ResourceId": type, "Amount": count, "Owner": owner_username, "AirtableRecordId": record_id}
    """
    inventory_details: List[Dict[str, Any]] = []
    formula = f"AND({{Asset}}='{_escape_airtable_value(citizen_username)}', {{AssetType}}='citizen')"
    try:
        resources_carried = tables['resources'].all(formula=formula)
        for resource_record in resources_carried:
            fields = resource_record['fields']
            inventory_details.append({
                "ResourceId": fields.get('Type'),
                "Amount": float(fields.get('Count', 0.0)),
                "Owner": fields.get('Owner'), # Owner of the resource stack
                "AirtableRecordId": resource_record['id'] # Airtable record ID of the resource stack
            })
        log.debug(f"Citizen {citizen_username} inventory details: {inventory_details}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching inventory details for citizen {citizen_username}: {e}{LogColors.ENDC}")
    return inventory_details

def extract_details_from_notes(notes_str: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Extracts a JSON object from a notes string that contains a line like 'DetailsJSON: {...}'.
    Returns the parsed JSON object or None if not found or parsing fails.
    """
    if not notes_str:
        return None
    
    # Regex to find "DetailsJSON: " followed by a JSON object
    # It handles cases where JSON might be on the same line or start on the next.
    # It assumes the JSON object is the last significant part of the string after "DetailsJSON: ".
    match = re.search(r"DetailsJSON:\s*(\{.*\}|\S+)$", notes_str, re.DOTALL | re.MULTILINE)
    if match:
        json_str_candidate = match.group(1)
        try:
            # Attempt to parse the candidate string as JSON
            details_data = json.loads(json_str_candidate)
            if isinstance(details_data, dict):
                return details_data
            else:
                # If it parsed but isn't a dict, it's not what we expect for structured details
                log.warning(f"Parsed 'DetailsJSON' content is not a dictionary: {type(details_data)}")
                return None
        except json.JSONDecodeError as e:
            # This can happen if the string after "DetailsJSON: " is not valid JSON
            # or if the regex captured something unintended.
            log.warning(f"Could not parse JSON from 'DetailsJSON' in notes. Content: '{json_str_candidate}'. Error: {e}")
            return None
    return None

def update_resource_count(
    tables: Dict[str, Table],
    asset_id: str,  # Custom ID of the asset (e.g., BuildingId or Citizen Username)
    asset_type: str,  # 'building' or 'citizen'
    owner_username: str,  # Username of the resource owner
    resource_type_id: str,
    amount_change: float,  # Positive to add, negative to remove
    resource_defs: Dict, # For fetching resource name
    now_iso: Optional[str] = None, # Optional current ISO timestamp for CreatedAt
    notes: Optional[str] = None # Optional notes for new resource records
) -> bool:
    """
    Updates the count of a specific resource for an asset and owner.
    Creates the resource record if it doesn't exist and amount_change is positive.
    Deletes the record if the count becomes zero or less.
    Returns True on success, False on failure.
    """
    if not all([asset_id, asset_type, owner_username, resource_type_id]):
        log.error(f"{LogColors.FAIL}Missing parameters for update_resource_count: asset_id={asset_id}, asset_type={asset_type}, owner={owner_username}, resource_type={resource_type_id}{LogColors.ENDC}")
        return False

    if now_iso is None:
        now_iso = datetime.datetime.now(VENICE_TIMEZONE).isoformat()

    log.debug(f"Updating resource {resource_type_id} for {asset_type} '{asset_id}' (Owner: {owner_username}) by {amount_change:.2f}")

    formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{Asset}}='{_escape_airtable_value(asset_id)}', "
               f"{{AssetType}}='{_escape_airtable_value(asset_type)}', "
               f"{{Owner}}='{_escape_airtable_value(owner_username)}')")
    try:
        existing_records = tables['resources'].all(formula=formula, max_records=1)
        
        if existing_records:
            record = existing_records[0]
            current_count = float(record['fields'].get('Count', 0.0))
            new_count = current_count + amount_change
            
            if new_count > 0.001: # Use a small epsilon for float comparison
                tables['resources'].update(record['id'], {'Count': new_count})
                log.info(f"{LogColors.OKGREEN}Updated {resource_type_id} for {asset_type} {asset_id} (Owner: {owner_username}). Old: {current_count:.2f}, New: {new_count:.2f}{LogColors.ENDC}")
            else:
                tables['resources'].delete(record['id'])
                log.info(f"{LogColors.OKGREEN}Removed {resource_type_id} for {asset_type} {asset_id} (Owner: {owner_username}) as count became <= 0.{LogColors.ENDC}")
        elif amount_change > 0.001: # Create new record only if adding resources
            res_def = resource_defs.get(resource_type_id, {})
            resource_name = res_def.get('name', resource_type_id)
            
            # Position is generally not set for resources directly, but inherited or context-dependent.
            # For simplicity, we won't set Position here unless specifically required.
            # If asset_type is 'building', position could be building's position.
            # If 'citizen', it's citizen's current position.
            # This function is generic, so we omit Position for now.

            payload = {
                "ResourceId": f"resource-{uuid.uuid4()}",
                "Type": resource_type_id,
                "Name": resource_name,
                "Asset": asset_id,
                "AssetType": asset_type,
                "Owner": owner_username,
                "Count": amount_change,
                "CreatedAt": now_iso
            }
            if notes:
                payload["Notes"] = notes

            tables['resources'].create(payload)
            log.info(f"{LogColors.OKGREEN}Created {amount_change:.2f} of {resource_type_id} for {asset_type} {asset_id} (Owner: {owner_username}).{LogColors.ENDC}")
        elif amount_change <= 0: # Trying to remove from a non-existent record
            log.warning(f"{LogColors.WARNING}Attempted to remove {abs(amount_change):.2f} of {resource_type_id} from {asset_type} {asset_id} (Owner: {owner_username}), but no record found.{LogColors.ENDC}")
            # This is not necessarily a failure of the function, but a no-op for removal.
            # If strict checking is needed, this could return False. For now, let's say it's "successful" as in "nothing to remove".

        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error updating resource {resource_type_id} for {asset_type} {asset_id} (Owner: {owner_username}): {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return False
