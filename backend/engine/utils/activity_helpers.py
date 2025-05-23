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
        # Airtable formula to check if UpdatedAt is within the last 'hours_ago'
        # DATEADD(NOW(), -hours_ago, 'hours') calculates the time 'hours_ago' from now.
        # IS_AFTER({UpdatedAt}, ...) checks if UpdatedAt is more recent than that time.
        time_check_formula = f"IS_AFTER({{UpdatedAt}}, DATEADD(NOW(), -{hours_ago}, 'hours'))"
        
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
