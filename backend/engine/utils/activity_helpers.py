import logging
import json
import uuid # Added import for uuid module
import re # Added import for re module
import datetime
import requests
import pytz
import math # Added for Haversine distance
import os # Added import for os module
import textwrap # For log_header
from colorama import Fore, Style # For log_header
from typing import Dict, List, Optional, Any, Tuple, Union # Added Tuple and Union
from pyairtable import Table # Import Table for type hinting
from dateutil import parser as dateutil_parser # For robust date parsing

log = logging.getLogger(__name__)

# Define ANSI color codes for logging
class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    LIGHTBLUE = '\033[94m' # Alias pour OKBLUE, utilisé pour la sortie Kinos
    OKCYAN = '\033[96m'
    ACTIVITY = '\033[96m'  # Ajout de la couleur ACTIVITY, identique à OKCYAN
    PROCESS = '\033[96m'  # Ajout de la couleur PROCESS, identique à OKCYAN/ACTIVITY/INFO
    CYAN = '\033[96m'     # Alias pour OKCYAN
    INFO = '\033[96m'     # Alias pour OKCYAN/ACTIVITY
    OKGREEN = '\033[92m'
    SUCCESS = '\033[92m'  # Alias pour OKGREEN
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ERROR = '\033[91m'    # Alias pour FAIL
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
        log.error(f"{LogColors.FAIL}RequestException fetching building types from API ({url}): {e_req}{LogColors.ENDC}")
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
        log.error(f"{LogColors.FAIL}RequestException fetching resource types from API ({url}): {e_req}{LogColors.ENDC}")
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

def get_contract_record(tables: Dict[str, Table], contract_id_input: str) -> Optional[Dict]:
    """
    Fetches a contract record by its Airtable Record ID or custom ContractId field.
    """
    if not contract_id_input or not isinstance(contract_id_input, str):
        log.warning(f"{LogColors.WARNING}Invalid contract_id_input provided to get_contract_record: {contract_id_input}{LogColors.ENDC}")
        return None

    try:
        # Check if it looks like an Airtable Record ID (typically 'rec' followed by 14 alphanumeric chars, total 17)
        if contract_id_input.startswith("rec") and len(contract_id_input) == 17:
            log.debug(f"Attempting to fetch contract by Airtable Record ID: {contract_id_input}")
            record = tables['contracts'].get(contract_id_input)
            if record:
                return record
            else:
                # It looked like an Airtable ID but wasn't found.
                # This could be an error, or it might be a custom ContractId that happens to start with "rec".
                # For safety, we can fall through to try fetching by custom ContractId field.
                log.warning(f"{LogColors.WARNING}Contract with Airtable Record ID '{contract_id_input}' not found. Will attempt lookup by custom ContractId field.{LogColors.ENDC}")
        
        # If not an Airtable Record ID, or if lookup by Record ID failed, try by custom ContractId field
        log.debug(f"Attempting to fetch contract by custom ContractId field: {contract_id_input}")
        formula = f"{{ContractId}} = '{_escape_airtable_value(contract_id_input)}'"
        records = tables['contracts'].all(formula=formula, max_records=1)
        if records:
            return records[0]
        else:
            # Log warning only if it wasn't an Airtable ID pattern that failed above
            if not (contract_id_input.startswith("rec") and len(contract_id_input) == 17):
                 log.warning(f"{LogColors.WARNING}Contract with custom ContractId '{contract_id_input}' not found.{LogColors.ENDC}")
            return None
            
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching contract record for ID '{contract_id_input}': {e}{LogColors.ENDC}")
        return None

def get_land_record(tables: Dict[str, Table], land_id_value: str) -> Optional[Dict]:
    """Fetches a land record by its LandId."""
    # Ensure land_id_value is a string, as it's used in the formula.
    if not isinstance(land_id_value, str):
        log.warning(f"{LogColors.WARNING}get_land_record received non-string land_id_value: {land_id_value} (type: {type(land_id_value)}). Attempting to cast to string.{LogColors.ENDC}")
        land_id_value = str(land_id_value)

    formula = f"{{LandId}} = '{_escape_airtable_value(land_id_value)}'"
    try:
        # Utiliser la clé 'lands' (minuscule) pour accéder à la table des terrains.
        records = tables['lands'].all(formula=formula, max_records=1)
        if records:
            return records[0]
        else:
            log.warning(f"{LogColors.WARNING}Land record with LandId '{land_id_value}' not found.{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching land record for LandId '{land_id_value}': {e}{LogColors.ENDC}")
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

# SOCIAL_CLASS_SCHEDULES defines periods for rest, work, and leisure.
# Each period is a list of (start_hour, end_hour) tuples. end_hour is exclusive.
# If end_hour < start_hour, it means the period crosses midnight (e.g., 22 to 6).
SOCIAL_CLASS_SCHEDULES = {
    "Facchini": { # Journaliers
        "rest": [(21, 24), (0, 5)],  # 21h-5h (8 heures)
        "work": [(5, 12), (13, 19)], # 5h-12h, 13h-19h (13 heures)
        "leisure": [(12, 13), (19, 21)] # 12h-13h, 19h-21h (3 heures)
    },
    "Popolani": { # Artisans
        "rest": [(22, 24), (0, 6)],  # 22h-6h (8 heures)
        "work": [(6, 12), (14, 18)], # 6h-12h, 14h-18h (10 heures)
        "leisure": [(12, 14), (18, 22)] # 12h-14h, 18h-22h (6 heures)
    },
    "Cittadini": { # Marchands
        "rest": [(23, 24), (0, 6)],  # 23h-6h (7 heures)
        "work": [(7, 12), (14, 17)], # 7h-12h, 14h-17h (8 heures)
        "leisure": [(6, 7), (12, 14), (17, 23)] # 6h-7h, 12h-14h, 17h-23h (9 heures)
    },
    "Nobili": { # Nobles
        "rest": [(0, 8)],            # 0h-8h (8 heures)
        "work": [],                  # No specific "work" blocks, managed during leisure
        "leisure": [(8, 24)]         # 8h-0h (reste du temps, 16 heures)
    },
    "Forestieri": { # Marchands Étrangers
        "rest": [(23, 24), (0, 5)],  # 23h-5h (6 heures)
        "work": [(6, 12), (13, 20)], # 6h-12h, 13h-20h (13 heures)
        "leisure": [(5, 6), (12, 13), (20, 23)] # 5h-6h, 12h-13h, 20h-23h (4 heures)
    }
}

def _is_time_in_ranges(current_hour: int, time_ranges: List[Tuple[int, int]]) -> bool:
    """Helper function to check if the current hour falls within any of the time ranges."""
    if not time_ranges:
        return False
    for start_hour, end_hour in time_ranges:
        if start_hour <= end_hour: # Normal range (e.g., 9 to 17)
            if start_hour <= current_hour < end_hour:
                return True
        else: # Overnight range (e.g., 22 to 6)
            if current_hour >= start_hour or current_hour < end_hour:
                return True
    return False

def is_rest_time_for_class(social_class: str, current_venice_time: datetime.datetime) -> bool:
    """Checks if it's rest time for the given social class."""
    schedule = SOCIAL_CLASS_SCHEDULES.get(social_class)
    if not schedule:
        log.warning(f"No schedule found for social class: {social_class}. Defaulting to general nighttime.")
        return is_nighttime(current_venice_time) # Fallback to general night
    return _is_time_in_ranges(current_venice_time.hour, schedule.get("rest", []))

# BUILDING_TYPE_WORK_SCHEDULES defines specific work periods for certain building types.
# Structure: {"building_type": {"work": [(start, end), ...]}}
# These override social class work hours if a citizen works at such a building.
BUILDING_TYPE_WORK_SCHEDULES = {
    "inn": { # Auberge
        "work": [(18, 24), (0, 2)]  # 18h - 02h
    },
    "bakery": { # Boulangerie
        "work": [(3, 11)] # 03h - 11h
    },
    "tavern": { # Taverne (peut avoir des horaires similaires à l'auberge ou différents)
        "work": [(17, 24), (0, 1)] # 17h - 01h
    },
    "smugglers_den": { # Repaire de contrebandiers
        "work": [(22, 24), (0, 6)]  # 22h - 06h (travail de nuit)
    },
    "cargo_landing": { # Zone de déchargement de marchandises (peut-être plus actif le soir/nuit)
        "work": [(18, 24), (0, 4)]  # 18h - 04h
    },
    "theater": { # Théâtre (principalement en soirée)
        "work": [(17, 23)] # 17h - 23h
    },
    "hidden_workshop": { # Atelier clandestin (horaires inhabituels pour éviter la détection)
        "work": [(1, 7), (20, 24)] # 01h - 07h et 20h - 00h
    },
    "spy_safehouse": { # Planque d'espion (activité nocturne)
        "work": [(23, 24), (0, 5)] # 23h - 05h
    }
    # Ajoutez d'autres types de bâtiments avec horaires spécifiques ici
    # Exemple:
    # "shipyard": { # Chantier naval
    #     "work": [(7, 12), (13, 18)]
    # },
}

def is_work_time(
    social_class: str, 
    current_venice_time: datetime.datetime, 
    workplace_type: Optional[str] = None
) -> bool:
    """
    Checks if it's work time, considering building-specific schedules first,
    then falling back to social class schedules.
    """
    # Check for building-specific work hours first
    if workplace_type:
        building_schedule = BUILDING_TYPE_WORK_SCHEDULES.get(workplace_type)
        if building_schedule and "work" in building_schedule:
            # log.debug(f"Using specific work hours for building type: {workplace_type}")
            return _is_time_in_ranges(current_venice_time.hour, building_schedule["work"])

    # Fallback to social class work hours
    # log.debug(f"No specific schedule for workplace type '{workplace_type}' or type not provided. Using social class '{social_class}' schedule.")
    class_schedule = SOCIAL_CLASS_SCHEDULES.get(social_class)
    if not class_schedule:
        log.warning(f"No schedule found for social class: {social_class}. Defaulting to false (no work time).")
        return False
    
    # Nobili have no specific work blocks from their class schedule; their "work" is part of leisure.
    # This check remains to prevent Nobili from "working" based on their class schedule.
    # If a Nobili were to be an "employee" at a building with specific hours, 
    # the building_schedule check above would apply.
    if social_class == "Nobili":
        return False # Nobili do not follow class-based work schedules.
        
    return _is_time_in_ranges(current_venice_time.hour, class_schedule.get("work", []))

def is_leisure_time_for_class(social_class: str, current_venice_time: datetime.datetime) -> bool:
    """Checks if it's leisure/consumption time for the given social class."""
    schedule = SOCIAL_CLASS_SCHEDULES.get(social_class)
    if not schedule:
        log.warning(f"No schedule found for social class: {social_class}. Defaulting to false (no leisure time).")
        return False
    return _is_time_in_ranges(current_venice_time.hour, schedule.get("leisure", []))

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

def get_closest_food_provider(tables: Dict[str, Table], citizen_position: Dict[str, float]) -> Optional[Dict]:
    """
    Finds the closest building that provides food (inn, tavern, or retail_food shop)
    to the citizen's position.
    """
    log.info(f"{LogColors.OKBLUE}Searching for the closest food provider (inn, tavern, retail_food) to position: {citizen_position}{LogColors.ENDC}")
    try:
        # Formula to find inns, taverns, or constructed retail_food shops
        formula = "AND(OR({Type}='inn', {Type}='tavern', {SubCategory}='retail_food'), {IsConstructed}=TRUE())"
        food_providers = tables['buildings'].all(formula=formula)
        
        if not food_providers:
            log.info(f"{LogColors.OKBLUE}No inns, taverns, or retail_food shops found in the database.{LogColors.ENDC}")
            return None

        closest_provider = None
        min_distance = float('inf')

        for provider_record in food_providers:
            provider_position = _get_building_position_coords(provider_record)
            if provider_position:
                distance = _calculate_distance_meters(citizen_position, provider_position)
                if distance < min_distance:
                    min_distance = distance
                    closest_provider = provider_record
            else:
                log.warning(f"{LogColors.WARNING}Food provider {provider_record.get('id')} has no valid position data.{LogColors.ENDC}")
        
        if closest_provider:
            provider_id_log = closest_provider['fields'].get('BuildingId', closest_provider['id'])
            provider_type_log = closest_provider['fields'].get('Type', 'N/A')
            provider_subcategory_log = closest_provider['fields'].get('SubCategory', 'N/A')
            log.info(f"{LogColors.OKGREEN}Closest food provider found: {provider_id_log} (Type: {provider_type_log}, SubCat: {provider_subcategory_log}) at distance {min_distance:.2f}m.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}No food providers with valid positions found.{LogColors.ENDC}")
        return closest_provider
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding closest food provider: {e}{LogColors.ENDC}")
        return None

def get_closest_building_of_type(
    tables: Dict[str, Table], 
    reference_position: Dict[str, float], 
    building_type: str,
    max_distance_meters: Optional[float] = None # Optional max distance
) -> Optional[Dict]:
    """
    Finds the closest building of a specific type to the reference_position.
    Optionally filters by maximum distance.
    """
    log.info(f"{LogColors.OKBLUE}Searching for the closest '{building_type}' to position: {reference_position}{LogColors.ENDC}")
    try:
        # Attempt to convert max_distance_meters to float if it's a string or other unexpected type
        max_distance_meters_internal = max_distance_meters # Use a new variable for the converted value
        if isinstance(max_distance_meters, str):
            try:
                max_distance_meters_internal = float(max_distance_meters)
                log.warning(f"{LogColors.WARNING}max_distance_meters was a string '{max_distance_meters}', converted to float {max_distance_meters_internal}. Consider fixing the caller.{LogColors.ENDC}")
            except ValueError:
                log.error(f"{LogColors.FAIL}max_distance_meters string '{max_distance_meters}' could not be converted to float. Ignoring max_distance_meters constraint.{LogColors.ENDC}")
                max_distance_meters_internal = None
        elif max_distance_meters is not None and not isinstance(max_distance_meters, (int, float)):
            log.error(f"{LogColors.FAIL}max_distance_meters has unexpected type {type(max_distance_meters)} ('{max_distance_meters}'). Ignoring max_distance_meters constraint.{LogColors.ENDC}")
            max_distance_meters_internal = None
        
        # Filter by type directly in the formula for efficiency
        formula = f"{{Type}}='{_escape_airtable_value(building_type)}'"
        buildings_of_type = tables['buildings'].all(formula=formula)
        
        if not buildings_of_type:
            log.info(f"{LogColors.OKBLUE}No buildings of type '{building_type}' found.{LogColors.ENDC}")
            return None

        closest_building = None
        min_distance = float('inf')

        for building_record in buildings_of_type:
            building_position = _get_building_position_coords(building_record)
            if building_position:
                distance = _calculate_distance_meters(reference_position, building_position)
                if distance < min_distance:
                    if max_distance_meters_internal is None or distance <= max_distance_meters_internal:
                        min_distance = distance
                        closest_building = building_record
            else:
                log.warning(f"{LogColors.WARNING}Building {building_record.get('id')} of type '{building_type}' has no valid position data.{LogColors.ENDC}")
        
        if closest_building:
            building_id_log = closest_building['fields'].get('BuildingId', closest_building['id'])
            log.info(f"{LogColors.OKGREEN}Closest '{building_type}' found: {building_id_log} at distance {min_distance:.2f}m.{LogColors.ENDC}")
            if max_distance_meters_internal is not None and min_distance > max_distance_meters_internal:
                log.info(f"{LogColors.OKBLUE}However, it exceeds the max distance of {max_distance_meters_internal}m.{LogColors.ENDC}")
                return None # Exceeds max distance
        else:
            log.info(f"{LogColors.OKBLUE}No buildings of type '{building_type}' with valid positions found (or none within max_distance if specified).{LogColors.ENDC}")
        return closest_building
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding closest building of type '{building_type}': {e}{LogColors.ENDC}")
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

def get_citizen_businesses_run(tables: Dict[str, Table], citizen_username: str) -> List[Dict]:
    """Fetches all business buildings run by a specific citizen."""
    log.info(f"{LogColors.OKBLUE}Finding businesses run by citizen {citizen_username}{LogColors.ENDC}")
    try:
        formula = f"AND({{RunBy}}='{_escape_airtable_value(citizen_username)}', {{Category}}='business')"
        businesses = tables['buildings'].all(formula=formula)
        if businesses:
            log.info(f"{LogColors.OKGREEN}Found {len(businesses)} businesses run by {citizen_username}.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}No businesses found run by {citizen_username}.{LogColors.ENDC}")
        return businesses
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error finding businesses run by citizen {citizen_username}: {e}{LogColors.ENDC}")
        return []

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

def find_path_between_buildings_or_coords(
    start_location: Union[Dict[str, Any], Dict[str, float]], # Can be building record or {lat, lng}
    end_location: Union[Dict[str, Any], Dict[str, float]],   # Can be building record or {lat, lng}
    api_base_url: str,
    transport_api_url: Optional[str] = None # Allow specific transport API URL override
) -> Optional[Dict]:
    """
    Finds a path between two locations, which can be building records or coordinate dictionaries.
    Uses the transport API.
    """
    start_pos_coords: Optional[Dict[str, float]] = None
    end_pos_coords: Optional[Dict[str, float]] = None

    # Determine start coordinates
    if isinstance(start_location, dict) and 'lat' in start_location and 'lng' in start_location:
        start_pos_coords = start_location
    elif isinstance(start_location, dict) and 'fields' in start_location: # Assume building record
        start_pos_coords = _get_building_position_coords(start_location)
    else:
        log.warning(f"{LogColors.WARNING}Invalid start_location type for pathfinding: {type(start_location)}{LogColors.ENDC}")
        return None

    # Determine end coordinates
    if isinstance(end_location, dict) and 'lat' in end_location and 'lng' in end_location:
        end_pos_coords = end_location
    elif isinstance(end_location, dict) and 'fields' in end_location: # Assume building record
        end_pos_coords = _get_building_position_coords(end_location)
    else:
        log.warning(f"{LogColors.WARNING}Invalid end_location type for pathfinding: {type(end_location)}{LogColors.ENDC}")
        return None

    if not start_pos_coords or not end_pos_coords:
        log.warning(f"{LogColors.WARNING}Missing position data for pathfinding. Start: {start_pos_coords}, End: {end_pos_coords}{LogColors.ENDC}")
        return None

    final_transport_api_url = transport_api_url or f"{api_base_url}/api/transport"
    log.info(f"{LogColors.OKBLUE}Finding path between locations using API: {final_transport_api_url}{LogColors.ENDC}")
    log.debug(f"Pathfinding from: {start_pos_coords} to: {end_pos_coords}")

    try:
        response = requests.post(
            final_transport_api_url,
            json={
                "startPoint": start_pos_coords,
                "endPoint": end_pos_coords,
                "startDate": datetime.datetime.now(pytz.UTC).isoformat()
            }
        )
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        
        data = response.json()
        if data.get("success") and "path" in data:
            log.info(f"{LogColors.OKGREEN}Found path with {len(data['path'])} points.{LogColors.ENDC}")
            # Add duration_minutes if durationSeconds is available from the transport API
            if isinstance(data.get("timing"), dict) and "durationSeconds" in data["timing"]:
                try:
                    duration_seconds = float(data["timing"]["durationSeconds"])
                    # Round up to the nearest whole minute
                    data["duration_minutes"] = math.ceil(duration_seconds / 60.0) 
                    log.info(f"{LogColors.OKBLUE}Calculated duration_minutes: {data['duration_minutes']} from durationSeconds: {duration_seconds}{LogColors.ENDC}")
                except (ValueError, TypeError) as e_dur_parse:
                    log.warning(f"{LogColors.WARNING}Could not parse durationSeconds '{data['timing']['durationSeconds']}' to calculate duration_minutes: {e_dur_parse}{LogColors.ENDC}")
            return data
        else:
            log.warning(f"{LogColors.WARNING}No path found or API error: {data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return None
    except requests.exceptions.RequestException as e_req:
        log.error(f"{LogColors.FAIL}RequestException finding path: {e_req}{LogColors.ENDC}")
        return None
    except json.JSONDecodeError as e_json:
        log.error(f"{LogColors.FAIL}JSONDecodeError finding path: {e_json}. Response text: {response.text[:200]}{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception finding path: {str(e)}{LogColors.ENDC}", exc_info=True)
        return None

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

def get_idle_citizens(tables: Dict[str, Table], now_utc_for_check_override: Optional[datetime.datetime] = None) -> List[Dict]: # Ajout du paramètre
    """Fetch all citizens who are currently idle (no active activities)."""
    log.info(f"{LogColors.OKBLUE}Fetching idle citizens...{LogColors.ENDC}")
    
    try:
        all_citizens = tables['citizens'].all()
        log.info(f"{LogColors.OKBLUE}Found {len(all_citizens)} total citizens.{LogColors.ENDC}")
        
        # Fetch all activities not yet in a terminal state ('processed' or 'failed')
        non_terminal_activities_formula = "NOT(OR({Status} = 'processed', {Status} = 'failed'))"
        all_potentially_active_activities = tables['activities'].all(formula=non_terminal_activities_formula)
        
        # Utiliser l'override si fourni, sinon l'heure actuelle réelle
        now_utc_to_use = now_utc_for_check_override if now_utc_for_check_override else datetime.datetime.now(pytz.utc)
        if now_utc_for_check_override:
            log.info(f"{LogColors.WARNING}get_idle_citizens is using provided time for check: {now_utc_to_use.isoformat()}{LogColors.ENDC}")

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
                    
                    # If an activity exists with status 'created' or 'in_progress', the citizen is considered busy.
                    # The previous check (start_date_dt <= now_utc_to_use <= end_date_dt) was too narrow,
                    # as it only considered activities active *right now*.
                    busy_citizen_usernames.add(citizen_username_from_activity)
                except Exception as e_parse_activity_dates: # Date parsing is no longer strictly needed here for this check
                    log.error(f"{LogColors.FAIL}Error parsing dates for activity {activity.get('id', 'N/A')}: {e_parse_activity_dates}{LogColors.ENDC}")
        
        idle_citizens = []
        for citizen_record in all_citizens:
            username = citizen_record['fields'].get('Username')
            # Check if 'IsAI' is true for the citizen record before adding to idle_citizens
            # This ensures only AI citizens are processed by createActivities if that's the intent.
            # However, get_idle_citizens is generic. The filtering by IsAI should happen in the caller if needed.
            # For now, we keep the original logic: if a citizen has no non-terminal activities, they are idle.
            if username and username not in busy_citizen_usernames:
                idle_citizens.append(citizen_record)
        
        log.info(f"{LogColors.OKGREEN}Found {len(idle_citizens)} idle citizens (citizens with no 'created' or 'in_progress' activities, using time: {now_utc_to_use.isoformat()}).{LogColors.ENDC}")
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

def get_building_record(tables: Dict[str, Table], building_id_input: Union[str, List[str], Tuple[str, ...]]) -> Optional[Dict]:
    """
    Fetches a building record by its custom BuildingId.
    Handles cases where building_id_input might be a string, or a list/tuple containing a single string ID
    (common for linked/lookup fields from Airtable).
    """
    actual_building_id_str: Optional[str] = None
    if isinstance(building_id_input, str):
        actual_building_id_str = building_id_input
    elif isinstance(building_id_input, (list, tuple)):
        if building_id_input and len(building_id_input) == 1 and isinstance(building_id_input[0], str):
            actual_building_id_str = building_id_input[0]
            # log.debug(f"get_building_record received list/tuple {building_id_input}, using first element: '{actual_building_id_str}'.")
        elif not building_id_input:
             log.warning(f"{LogColors.WARNING}get_building_record received an empty list/tuple for building_id_input.{LogColors.ENDC}")
             return None
        else:
            log.error(f"{LogColors.FAIL}get_building_record received list/tuple but first element is not a string or list/tuple has multiple elements: {building_id_input}{LogColors.ENDC}")
            return None
    else:
        # Attempt to cast to string as a last resort if it's some other type that can be stringified.
        try:
            actual_building_id_str = str(building_id_input)
            log.warning(f"{LogColors.WARNING}get_building_record received unexpected type {type(building_id_input)}, value: {building_id_input}. Cast to string: '{actual_building_id_str}'. This might lead to lookup issues if not a valid BuildingId.{LogColors.ENDC}")
        except Exception as e_str_conv:
            log.error(f"{LogColors.FAIL}get_building_record received uncastable type {type(building_id_input)} for building_id_input: {building_id_input}. Error: {e_str_conv}{LogColors.ENDC}")
            return None

    if not actual_building_id_str: # Should be caught by earlier checks, but as a safeguard
        log.error(f"{LogColors.FAIL}Could not determine a valid string BuildingId from input: {building_id_input}{LogColors.ENDC}")
        return None

    formula = f"{{BuildingId}} = '{_escape_airtable_value(actual_building_id_str)}'"
    try:
        records = tables['buildings'].all(formula=formula, max_records=1)
        if records:
            return records[0]
        else:
            # Do not log warning here if actual_building_id_str was a result of str(list/tuple) as it's expected to fail.
            # Only log if it was originally a string or a successfully extracted string from list/tuple.
            if isinstance(building_id_input, str) or \
               (isinstance(building_id_input, (list, tuple)) and building_id_input and isinstance(building_id_input[0], str)):
                log.warning(f"{LogColors.WARNING}Building with BuildingId '{actual_building_id_str}' not found (original input: {building_id_input}).{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching building record for BuildingId '{actual_building_id_str}' (original input: {building_id_input}): {e}{LogColors.ENDC}")
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

def create_activity_record(
    tables: Dict[str, Table],
    citizen_username: str,
    activity_type: str,
    start_date_iso: str,
    end_date_iso: str,
    from_building_id: Optional[str] = None,
    to_building_id: Optional[str] = None,
    path_json: Optional[str] = None,
    details_json: Optional[str] = None,
    notes: Optional[str] = None,
    contract_id: Optional[str] = None, # Custom ContractId, not Airtable record ID
    transporter_username: Optional[str] = None, # Username of the transporter, if any
    title: Optional[str] = None, # Optional title for the activity
    description: Optional[str] = None, # Optional description
    thought: Optional[str] = None, # Optional thought from the citizen
    priority_override: Optional[int] = None, # Optional priority for the activity
    resources_json_payload: Optional[str] = None # New parameter for the Resources field
) -> Optional[Dict]:
    """Creates a new activity record in Airtable."""
    activity_guid = f"{activity_type.lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
    
    payload = {
        "ActivityId": activity_guid,
        "Citizen": citizen_username,
        "Type": activity_type,
        "StartDate": start_date_iso,
        "EndDate": end_date_iso,
        "Status": "created" # Default status for new activities
    }
    if from_building_id: payload["FromBuilding"] = from_building_id
    if to_building_id: payload["ToBuilding"] = to_building_id
    if path_json: payload["Path"] = path_json
    if details_json: payload["Notes"] = details_json # Changed Details to Notes
    elif notes: payload["Notes"] = notes # Use simple notes if no details_json
    if contract_id: payload["ContractId"] = contract_id
    if transporter_username: payload["Transporter"] = transporter_username
    if resources_json_payload: payload["Resources"] = resources_json_payload # Populate Resources field
    if title: payload["Title"] = title
    if description: payload["Description"] = description
    if thought: payload["Thought"] = thought
    if priority_override is not None: payload["Priority"] = priority_override
    
    # Add CreatedAt timestamp
    payload["CreatedAt"] = datetime.datetime.now(VENICE_TIMEZONE).isoformat()
    # UpdatedAt is handled by Airtable, remove if present
    if "UpdatedAt" in payload:
        del payload["UpdatedAt"]

    try:
        # Check if an activity with this ActivityId already exists
        existing_activity_formula = f"{{ActivityId}}='{_escape_airtable_value(activity_guid)}'"
        existing_records = tables['activities'].all(formula=existing_activity_formula, max_records=1)

        if existing_records:
            existing_record = existing_records[0]
            log.info(f"{LogColors.OKBLUE}Activity {activity_guid} already exists (Airtable ID: {existing_record['id']}). Updating it for {citizen_username} of type {activity_type}.{LogColors.ENDC}")
            
            # Prepare update payload: remove ActivityId and CreatedAt, as these should not change.
            # UpdatedAt is handled automatically by Airtable.
            update_payload = payload.copy()
            del update_payload["ActivityId"] # Cannot update the primary field this way, and it's for matching
            if "CreatedAt" in update_payload:
                 del update_payload["CreatedAt"] # Do not change original creation timestamp

            log.debug(f"Update payload: {json.dumps(update_payload, indent=2)}")
            updated_activity_record = tables['activities'].update(existing_record['id'], update_payload)
            log.info(f"{LogColors.OKGREEN}Successfully updated activity {activity_guid} (Airtable ID: {updated_activity_record['id']}).{LogColors.ENDC}")
            return updated_activity_record
        else:
            # Create new activity if it doesn't exist
            log.info(f"{LogColors.OKBLUE}Creating new activity: {activity_guid} for {citizen_username} of type {activity_type}{LogColors.ENDC}")
            log.debug(f"Activity payload: {json.dumps(payload, indent=2)}")
            new_activity_record = tables['activities'].create(payload)
            log.info(f"{LogColors.OKGREEN}Successfully created activity {activity_guid} (Airtable ID: {new_activity_record['id']}).{LogColors.ENDC}")
            return new_activity_record
            
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating/updating activity {activity_guid} for {citizen_username}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return None

def update_citizen_ducats(
    tables: Dict[str, Table],
    citizen_airtable_id: str,
    amount_change: float,
    reason: str,
    related_asset_type: Optional[str] = None,
    related_asset_id: Optional[str] = None
) -> bool:
    """
    Updates a citizen's Ducats and creates a transaction record.
    Returns True on success, False on failure.
    """
    if not citizen_airtable_id:
        log.error(f"{LogColors.FAIL}Citizen Airtable ID is required to update ducats.{LogColors.ENDC}")
        return False

    try:
        citizen_record = tables['citizens'].get(citizen_airtable_id)
        if not citizen_record:
            log.error(f"{LogColors.FAIL}Citizen with Airtable ID {citizen_airtable_id} not found. Cannot update ducats.{LogColors.ENDC}")
            return False

        current_ducats = float(citizen_record['fields'].get('Ducats', 0.0))
        new_ducats = current_ducats + amount_change
        
        citizen_username = citizen_record['fields'].get('Username', citizen_airtable_id) # For logging and transaction

        if new_ducats < 0 and amount_change < 0: # Check only if spending leads to negative
            log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has insufficient ducats ({current_ducats:.2f}) for transaction of {amount_change:.2f}. Required: {abs(amount_change):.2f}.{LogColors.ENDC}")
            # Optionally, create a problem record here
            return False # Transaction fails if it would result in negative balance from spending

        tables['citizens'].update(citizen_airtable_id, {'Ducats': new_ducats})
        log.info(f"{LogColors.OKGREEN}Updated ducats for citizen {citizen_username} (ID: {citizen_airtable_id}). Old: {current_ducats:.2f}, Change: {amount_change:.2f}, New: {new_ducats:.2f}. Reason: {reason}{LogColors.ENDC}")

        # Create transaction record
        transaction_type = "expense" if amount_change < 0 else "income"
        if "fee" in reason.lower():
            transaction_type = "fee_payment"
        elif "wage" in reason.lower():
            transaction_type = "wage_payment"
        elif "rent" in reason.lower():
            transaction_type = "rent_payment"
        # Add more specific types as needed

        transaction_payload = {
            "Type": transaction_type,
            "Price": abs(amount_change), # Price is always positive
            "Notes": reason,
            "CreatedAt": datetime.datetime.now(VENICE_TIMEZONE).isoformat(),
            "ExecutedAt": datetime.datetime.now(VENICE_TIMEZONE).isoformat()
        }

        if amount_change < 0: # Citizen is paying
            transaction_payload["Buyer"] = "system_entity" # Or a specific entity if known
            transaction_payload["Seller"] = citizen_username
        else: # Citizen is receiving
            transaction_payload["Buyer"] = citizen_username
            transaction_payload["Seller"] = "system_entity" # Or a specific entity if known
        
        if related_asset_type:
            transaction_payload["AssetType"] = related_asset_type
        if related_asset_id:
            transaction_payload["Asset"] = related_asset_id
            
        tables['transactions'].create(transaction_payload)
        log.info(f"{LogColors.OKGREEN}Created transaction record for {citizen_username} (Type: {transaction_type}, Amount: {abs(amount_change):.2f}).{LogColors.ENDC}")
        
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error updating ducats for citizen ID {citizen_airtable_id}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return False

def log_header(message: str, color_code: str = Fore.CYAN):
    """Prints a header message with a colorful border if colorama is available."""
    # colorama_available check is implicit now, as Fore/Style would fail on import if not present
    border_char = "-"  # ASCII equivalent
    side_char = "|"    # ASCII equivalent
    corner_tl = "+"    # ASCII equivalent
    corner_tr = "+"    # ASCII equivalent
    corner_bl = "+"    # ASCII equivalent
    corner_br = "+"    # ASCII equivalent
    
    message_len = len(message)
    # Adjust width dynamically or keep fixed, for now fixed at 80
    width = 80 
    
    # Ensure Style.BRIGHT and Style.RESET_ALL are used correctly
    print(f"\n{color_code}{Style.BRIGHT}{corner_tl}{border_char * (width - 2)}{corner_tr}{Style.RESET_ALL}")
    print(f"{color_code}{Style.BRIGHT}{side_char} {message.center(width - 4)} {side_char}{Style.RESET_ALL}")
    print(f"{color_code}{Style.BRIGHT}{corner_bl}{border_char * (width - 2)}{corner_br}{Style.RESET_ALL}\n")
