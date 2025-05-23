import logging
import json
import datetime
import requests
import pytz
from typing import Dict, List, Optional, Any
from pyairtable import Table # Assuming Table might be needed by some helpers

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

VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Common timezone

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
        # Airtable formula to check if EndDate of a failed activity is within the last 'hours_ago'
        # DATEADD(NOW(), -hours_ago, 'hours') calculates the time 'hours_ago' from now.
        # IS_AFTER({EndDate}, ...) checks if EndDate is more recent than that time.
        time_check_formula = f"IS_AFTER({{EndDate}}, DATEADD(NOW(), -{hours_ago}, 'hours'))"
        
        formula = (f"AND({{Type}}='{_escape_airtable_value(activity_type_to_check)}', "
                   f"{{ContractId}}='{_escape_airtable_value(contract_id_in_activity_table)}', "
                   f"{{Status}}='failed', "
                   f"{time_check_formula})")
        
        recently_failed_activities = tables['activities'].all(formula=formula, max_records=1)
        if recently_failed_activities:
            log.info(f"{LogColors.WARNING}Found recently failed '{activity_type_to_check}' activity for ContractId '{contract_id_in_activity_table}' within the last {hours_ago} hours. Skipping recreation.{LogColors.ENDC}")
            return True
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
                    # Validate that lat_str and lng_str can be converted to float
                    if all(s.replace('.', '', 1).replace('-', '', 1).isdigit() for s in [lat_str, lng_str]):
                        lat, lng = float(lat_str), float(lng_str)
                        position = {"lat": lat, "lng": lng}
                    else:
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

def get_citizen_home(tables: Dict[str, Table], citizen_custom_id: str) -> Optional[Dict]:
    """Find the home building for a citizen."""
    log.info(f"{LogColors.OKBLUE}Finding home for citizen {citizen_custom_id}{LogColors.ENDC}")
    
    try:
        
        # Get buildings where this citizen is the occupant and the type is a housing type
        housing_types = ['canal_house', 'merchant_s_house', 'artisan_s_house', 'fisherman_s_cottage']
        type_conditions = [f"{{Type}}='{housing_type}'" for housing_type in housing_types]
        formula = f"AND({{Occupant}}='{_escape_airtable_value(citizen_custom_id)}', OR({', '.join(type_conditions)}))"
        
        homes = tables['buildings'].all(formula=formula)
        
        if homes:
            # Check if the home has a BuildingId
            building_id = homes[0]['fields'].get('BuildingId')
            if not building_id:
                log.warning(f"{LogColors.WARNING}Home found for citizen {citizen_custom_id} but missing BuildingId: {homes[0]['id']}{LogColors.ENDC}")
            else:
                log.info(f"{LogColors.OKGREEN}Found home for citizen {citizen_custom_id}: {building_id}{LogColors.ENDC}")
            return homes[0]
        else:
            log.warning(f"{LogColors.WARNING}No home found for citizen {citizen_custom_id}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding home for citizen {citizen_custom_id}: {e}{LogColors.ENDC}")
        return None

def get_building_type_info(building_type: str, api_base_url: str) -> Optional[Dict]:
    """Get building type information from the API."""
    try:
        url = f"{api_base_url}/api/building-types"
        log.info(f"{LogColors.OKBLUE}Fetching building type info for {building_type} from API: {url}{LogColors.ENDC}")
        response = requests.get(url)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and "buildingTypes" in data:
                building_types = data["buildingTypes"]
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
    log.info(f"{LogColors.OKBLUE}Fetching contracts for citizen {citizen_id}{LogColors.ENDC}")
    
    try:
        now_venice_contracts = datetime.datetime.now(VENICE_TIMEZONE)
        now_iso_venice = now_venice_contracts.isoformat()
        
        formula = f"AND({{Buyer}}='{_escape_airtable_value(citizen_id)}', {{Type}}='recurrent', {{CreatedAt}}<='{now_iso_venice}', {{EndAt}}>='{now_iso_venice}')"
        contracts = tables['contracts'].all(formula=formula)
        
        contracts.sort(key=lambda x: int(x['fields'].get('Priority', 0) or 0), reverse=True)
        
        log.info(f"{LogColors.OKGREEN}Found {len(contracts)} active contracts for citizen {citizen_id}{LogColors.ENDC}")
        return contracts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting contracts for citizen {citizen_id}: {e}{LogColors.ENDC}")
        return []

def get_idle_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all citizens who are currently idle (no active activities)."""
    log.info(f"{LogColors.OKBLUE}Fetching idle citizens...{LogColors.ENDC}")
    
    try:
        all_citizens = tables['citizens'].all()
        log.info(f"{LogColors.OKBLUE}Found {len(all_citizens)} total citizens{LogColors.ENDC}")
        
        now_iso_utc = datetime.datetime.now(pytz.UTC).isoformat()
        active_activities_formula = f"AND({{StartDate}} <= '{now_iso_utc}', {{EndDate}} >= '{now_iso_utc}')"
        active_activities = tables['activities'].all(formula=active_activities_formula)
        
        busy_citizen_usernames = set()
        for activity in active_activities:
            username = activity['fields'].get('Citizen') 
            if username:
                busy_citizen_usernames.add(username)
        
        idle_citizens = []
        for citizen_record in all_citizens:
            username = citizen_record['fields'].get('Username')
            if username and username not in busy_citizen_usernames:
                idle_citizens.append(citizen_record)
        
        log.info(f"{LogColors.OKGREEN}Found {len(idle_citizens)} idle citizens (after checking Usernames against active activities){LogColors.ENDC}")
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
