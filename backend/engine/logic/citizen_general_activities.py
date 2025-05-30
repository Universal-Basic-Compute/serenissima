import logging
import json
import datetime
import time
import requests # Should be used by helpers, not directly here unless for specific API calls not in helpers
import pytz
import uuid
import re
import random # For _fetch_and_assign_random_starting_position if it were here
from collections import defaultdict
from typing import Dict, List, Optional, Any, Tuple # Added Tuple
from pyairtable import Table
from dateutil import parser as dateutil_parser # Import for parsing dates

# Import helpers from the utils module
from backend.engine.utils.activity_helpers import (
    LogColors,
    _escape_airtable_value,
    _has_recent_failed_activity_for_contract,
    _get_building_position_coords,
    _calculate_distance_meters,
    is_nighttime as is_nighttime_helper, # General nighttime, less used now
    is_rest_time_for_class,
    is_work_time, # Updated from is_work_time_for_class
    is_leisure_time_for_class,
    SOCIAL_CLASS_SCHEDULES, # Import the schedule dictionary
    BUILDING_TYPE_WORK_SCHEDULES, # Import building specific schedules
    get_path_between_points,
    get_citizen_current_load,
    get_citizen_effective_carry_capacity,
    CITIZEN_CARRY_CAPACITY, # Import constant for carry capacity
    get_relationship_trust_score,
    get_closest_inn,
    get_citizen_inventory_details, # New import
    get_citizen_workplace,
    get_citizen_home,
    get_building_type_info, # Will use this from helpers
    get_building_resources, # Will use this from helpers
    can_produce_output,     # Will use this from helpers
    find_path_between_buildings, # Will use this from helpers
    get_citizen_contracts,  # Will use this from helpers
    # get_idle_citizens, # Not used by process_citizen_activity directly
    _fetch_and_assign_random_starting_position, # Already using from helpers
    get_building_storage_details, # Added import
    VENICE_TIMEZONE # Import VENICE_TIMEZONE
)

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
    try_create_secure_warehouse_activity,
    try_create_check_business_status_activity, # Import new creator
    # Import new storage activity creators
    try_create_deliver_to_storage_activity,
    try_create_fetch_from_storage_activity,
    try_create_fishing_activity, # Import new creator
    # try_create_fetch_from_galley_activity is not used by process_citizen_activity
)
# Import the specific processor function
from backend.engine.activity_processors import process_goto_work as process_goto_work_fn
from backend.engine.logic.porter_activities import process_porter_activity # Added import
from backend.engine.logic.forestieri_activities import (
    process_forestieri_night_activity,
    process_forestieri_daytime_activity,
    process_forestieri_departure_check # Import new function
)
from backend.engine.logic.construction_logic import handle_construction_worker_activity # Import new handler

# Import get_building_record and get_citizen_record from activity_helpers
from backend.engine.utils.activity_helpers import get_building_record, get_citizen_record

log = logging.getLogger(__name__)

# Module-level constants
IDLE_ACTIVITY_DURATION_HOURS = 1
SOCIAL_CLASS_VALUE = {"Nobili": 4, "Cittadini": 3, "Popolani": 2, "Facchini": 1, "Forestieri": 2}
TAVERN_MEAL_COST_ESTIMATE = 10  # Ducats
FOOD_SHOPPING_COST_ESTIMATE = 15 # Ducats, for 1-2 units of basic food
FOOD_RESOURCE_TYPES_FOR_EATING = ["bread", "fish", "preserved_fish", "fruit", "vegetables", "cheese", "olive_oil", "wine"] # Expanded list
NIGHT_END_HOUR_FOR_STAY = 6
STORAGE_FULL_THRESHOLD = 0.80

# Module-level helper functions for logging display names
def _get_bldg_display_name_module(tables: Dict[str, Table], bldg_record: Optional[Dict], default_id: Optional[str] = None) -> str:
    if bldg_record and bldg_record.get('fields'):
        name = bldg_record['fields'].get('Name')
        b_id = bldg_record['fields'].get('BuildingId', bldg_record.get('id', 'Unknown ID'))
        b_type = bldg_record['fields'].get('Type', 'Unknown Type')
        if name:
            return f"'{name}' ({b_type}, ID: {b_id})"
        return f"{b_type} (ID: {b_id})"
    if default_id:
        b_rec = get_building_record(tables, default_id)
        if b_rec:
            return _get_bldg_display_name_module(tables, b_rec)
        return f"Building (ID: {default_id})"
    return "an unknown building"

def _get_res_display_name_module(res_id: str, resource_definitions_dict: Dict) -> str:
    return resource_definitions_dict.get(res_id, {}).get('name', res_id)

# --- Helper for Water Graph Data ---
_water_graph_cache: Optional[Dict] = None
_water_graph_last_fetch_time: Optional[datetime.datetime] = None
_WATER_GRAPH_CACHE_TTL_SECONDS = 300 # Cache for 5 minutes

def _get_water_graph_data(api_base_url: str) -> Optional[Dict]:
    """Fetches water graph data from the API, with caching."""
    global _water_graph_cache, _water_graph_last_fetch_time
    
    now = datetime.datetime.now(pytz.UTC)
    if _water_graph_cache and _water_graph_last_fetch_time and \
       (now - _water_graph_last_fetch_time).total_seconds() < _WATER_GRAPH_CACHE_TTL_SECONDS:
        log.info("Using cached water graph data.")
        return _water_graph_cache

    try:
        url = f"{api_base_url}/api/get-water-graph" # Assuming this endpoint exists
        log.info(f"Fetching water graph data from API: {url}")
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and isinstance(data.get("waterGraph"), dict):
            _water_graph_cache = data["waterGraph"]
            _water_graph_last_fetch_time = now
            log.info(f"Successfully fetched and cached water graph data. Found {len(_water_graph_cache.get('waterPoints', []))} water points.")
            return _water_graph_cache
        log.error(f"API error fetching water graph: {data.get('error', 'Unknown error')}")
        return None
    except Exception as e:
        log.error(f"Exception fetching water graph data: {e}")
        return None

def _find_closest_fishable_water_point(
    citizen_position: Dict[str, float], 
    api_base_url: str,
    transport_api_url: str
) -> Tuple[Optional[str], Optional[Dict[str, float]], Optional[Dict]]:
    """Finds the closest water point with hasFish=true and returns its ID, position, and path data."""
    water_graph = _get_water_graph_data(api_base_url)
    if not water_graph or not water_graph.get("waterPoints"):
        log.warning("No water graph data or water points available for fishing.")
        return None, None, None

    fishable_points = [wp for wp in water_graph["waterPoints"] if wp.get("hasFish")]
    if not fishable_points:
        log.info("No water points with fish found.")
        return None, None, None

    closest_point_record = None
    min_distance = float('inf')

    for point_data in fishable_points:
        # Correctly access nested position data
        position_field = point_data.get("position")
        if not position_field or not isinstance(position_field, dict):
            log.warning(f"Water point {point_data.get('id', 'Unknown ID')} missing or invalid 'position' field. Skipping.")
            continue
            
        try:
            point_lat = float(position_field.get("lat", 0.0))
            point_lng = float(position_field.get("lng", 0.0))
        except (ValueError, TypeError):
            log.warning(f"Water point {point_data.get('id', 'Unknown ID')} has invalid lat/lng in position field: {position_field}. Skipping.")
            continue

        point_pos = {"lat": point_lat, "lng": point_lng}
        # Check for (0,0) might not be necessary if API guarantees valid coords for fishable points,
        # but as a safeguard if 0,0 is an invalid location:
        if point_lat == 0.0 and point_lng == 0.0: 
            log.debug(f"Water point {point_data.get('id', 'Unknown ID')} has coordinates (0,0). Skipping if this is considered invalid.")
            # Depending on game logic, (0,0) might be a valid sea point or an error indicator.
            # If it's an error, 'continue' here. For now, assume it could be valid.
            # continue 

        distance = _calculate_distance_meters(citizen_position, point_pos)
        if distance < min_distance:
            min_distance = distance
            closest_point_record = point_data
    
    if closest_point_record:
        # Correctly access nested position data for the chosen point
        closest_point_position_field = closest_point_record.get("position")
        if not closest_point_position_field or not isinstance(closest_point_position_field, dict):
            log.error(f"Selected closest fishable point {closest_point_record.get('id', 'Unknown ID')} has invalid position data. Cannot proceed.")
            return None, None, None
        
        try:
            closest_lat = float(closest_point_position_field.get("lat"))
            closest_lng = float(closest_point_position_field.get("lng"))
        except (ValueError, TypeError, AttributeError): # AttributeError if .get() returns non-dict
            log.error(f"Selected closest fishable point {closest_point_record.get('id', 'Unknown ID')} has invalid lat/lng in position: {closest_point_position_field}. Cannot proceed.")
            return None, None, None

        closest_point_id = closest_point_record.get("id", f"wp_{closest_lat}_{closest_lng}")
        closest_point_pos = {"lat": closest_lat, "lng": closest_lng}
        
        path_to_point = get_path_between_points(citizen_position, closest_point_pos, transport_api_url)
        if path_to_point and path_to_point.get("success"):
            log.info(f"Closest fishable water point: {closest_point_id} at {min_distance:.2f}m.")
            return closest_point_id, closest_point_pos, path_to_point
        else:
            log.warning(f"Found closest fishable point {closest_point_id}, but pathfinding failed.")
            return None, None, None
            
    log.info("Could not find a suitable (reachable) fishable water point.")
    return None, None, None

# --- Activity Handler Functions ---

def _handle_emergency_fishing(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 4: Handles emergency fishing if citizen is Facchini, starving, and it's not rest time."""
    if citizen_social_class != "Facchini": # Only Facchini do emergency fishing for now
        return False
    if is_rest_time_for_class(citizen_social_class, now_venice_dt): # No fishing during rest
        return False

    ate_at_str = citizen_record['fields'].get('AteAt')
    is_starving = True # Assume starving if no AteAt or very old
    if ate_at_str:
        try:
            ate_at_dt = dateutil_parser.isoparse(ate_at_str.replace('Z', '+00:00'))
            if ate_at_dt.tzinfo is None: ate_at_dt = pytz.UTC.localize(ate_at_dt)
            if (now_utc_dt - ate_at_dt) <= datetime.timedelta(hours=24): # More than 24 hours
                is_starving = False
        except ValueError: pass # Invalid date format, assume starving
    
    if not is_starving:
        return False

    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Pêche Urgence] {citizen_name} n'a pas de position. Impossible de pêcher.{LogColors.ENDC}")
        return False

    log.info(f"{LogColors.OKCYAN}[Pêche Urgence] {citizen_name} est affamé(e) et vit dans un fisherman_s_cottage. Recherche d'un lieu de pêche.{LogColors.ENDC}")
    
    target_wp_id, target_wp_pos, path_data = _find_closest_fishable_water_point(citizen_position, api_base_url, transport_api_url)

    if target_wp_id and path_data:
        if try_create_fishing_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            target_wp_id, path_data, now_utc_dt, activity_type="emergency_fishing"
        ):
            log.info(f"{LogColors.OKGREEN}[Pêche Urgence] {citizen_name}: Activité 'emergency_fishing' créée vers {target_wp_id}.{LogColors.ENDC}")
            return True
    return False

def _handle_leave_venice(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 1: Handles Forestieri departure."""
    if citizen_social_class != "Forestieri":
        return False

    # Forestieri departure logic might be complex, involving duration of stay, objectives, etc.
    # For now, let's assume a simplified condition or delegate to a specific Forestieri handler.
    # This handler is high priority, so it should be relatively certain.
    # The existing process_forestieri_departure_check can be used here.
    if not process_forestieri_departure_check(tables, citizen_record, now_utc_dt):
        return False

    log.info(f"{LogColors.OKCYAN}[Départ] Forestiero {citizen_name}: Conditions de départ remplies.{LogColors.ENDC}")

    # Find nearest public_dock as exit point
    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Pas de position pour trouver un quai de départ.{LogColors.ENDC}")
        return False

    public_docks = tables['buildings'].all(formula="{Type}='public_dock'")
    if not public_docks:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Aucun quai public trouvé pour le départ.{LogColors.ENDC}")
        return False

    closest_dock_record = None
    min_dist_to_dock = float('inf')
    for dock in public_docks:
        dock_pos = _get_building_position_coords(dock)
        if dock_pos:
            dist = _calculate_distance_meters(citizen_position, dock_pos)
            if dist < min_dist_to_dock:
                min_dist_to_dock = dist
                closest_dock_record = dock
    
    if not closest_dock_record:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Aucun quai public avec position valide trouvé.{LogColors.ENDC}")
        return False

    exit_point_custom_id = closest_dock_record['fields'].get('BuildingId')
    exit_point_pos = _get_building_position_coords(closest_dock_record)
    exit_point_name_display = _get_bldg_display_name_module(tables, closest_dock_record)

    if not exit_point_custom_id or not exit_point_pos:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Quai de départ {exit_point_name_display} n'a pas d'ID ou de position.{LogColors.ENDC}")
        return False

    path_to_exit_data = get_path_between_points(citizen_position, exit_point_pos, transport_api_url)
    if not (path_to_exit_data and path_to_exit_data.get('success')):
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Impossible de trouver un chemin vers le quai de départ {exit_point_name_display}.{LogColors.ENDC}")
        return False
    
    # For now, assume no galley to delete for simplicity. This can be added later.
    from backend.engine.activity_creators.leave_venice_activity_creator import try_create as try_create_leave_venice_activity
    if try_create_leave_venice_activity(
        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
        exit_point_custom_id, path_to_exit_data, None, now_utc_dt
    ):
        log.info(f"{LogColors.OKGREEN}[Départ] Citoyen {citizen_name}: Activité 'leave_venice' créée via {exit_point_name_display}.{LogColors.ENDC}")
        return True
    return False


def _handle_eat_from_inventory(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 2: Handles eating from inventory if hungry and it's leisure time or a meal break."""
    if not citizen_record['is_hungry']: return False
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        # Could add more nuanced checks, e.g., if it's a designated meal break within work hours
        return False

    log.info(f"{LogColors.OKCYAN}[Faim - Inventaire] Citoyen {citizen_name} ({citizen_social_class}): Est affamé et en période de loisirs. Vérification de l'inventaire.{LogColors.ENDC}")
    # food_resource_types = ["bread", "fish", "preserved_fish"] # Replaced by constant
    for food_type_id in FOOD_RESOURCE_TYPES_FOR_EATING:
        food_name = _get_res_display_name_module(food_type_id, resource_defs)
        formula = (f"AND({{AssetType}}='citizen', {{Asset}}='{_escape_airtable_value(citizen_username)}', "
                   f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type_id)}')")
        try:
            inventory_food = tables['resources'].all(formula=formula, max_records=1)
            if inventory_food and float(inventory_food[0]['fields'].get('Count', 0)) >= 1.0:
                if try_create_eat_from_inventory_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, food_type_id, 1.0, current_time_utc=now_utc_dt, resource_defs=resource_defs):
                    log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_from_inventory' créée pour '{food_name}'.{LogColors.ENDC}")
                    return True
        except Exception as e_inv_food:
            log.error(f"{LogColors.FAIL}[Faim] Citoyen {citizen_name}: Erreur vérification inventaire pour '{food_name}': {e_inv_food}{LogColors.ENDC}")
    return False

def _handle_eat_at_home_or_goto(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 3: Handles eating at home or going home to eat if hungry and it's leisure time."""
    if not citizen_record['is_hungry']: return False
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return False

    home_record = get_citizen_home(tables, citizen_username)
    if not home_record: return False

    log.info(f"{LogColors.OKCYAN}[Faim - Maison] Citoyen {citizen_name} ({citizen_social_class}): Affamé et en période de loisirs. Vérification domicile.{LogColors.ENDC}")
    home_name_display = _get_bldg_display_name_module(tables, home_record)
    home_position = _get_building_position_coords(home_record)
    home_building_id = home_record['fields'].get('BuildingId', home_record['id'])
    
    is_at_home = (citizen_position and home_position and _calculate_distance_meters(citizen_position, home_position) < 20)

    # food_resource_types = ["bread", "fish", "preserved_fish"] # Replaced by constant
    food_type_at_home_id = None
    food_at_home_name = "nourriture inconnue"
    for food_type_id in FOOD_RESOURCE_TYPES_FOR_EATING:
        formula_home = (f"AND({{AssetType}}='building', {{Asset}}='{_escape_airtable_value(home_building_id)}', "
                        f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type_id)}')")
        try:
            home_food = tables['resources'].all(formula=formula_home, max_records=1)
            if home_food and float(home_food[0]['fields'].get('Count', 0)) >= 1.0:
                food_type_at_home_id = food_type_id
                food_at_home_name = _get_res_display_name_module(food_type_id, resource_defs)
                break
        except Exception as e_home_food:
            log.error(f"{LogColors.FAIL}[Faim] Citoyen {citizen_name}: Erreur vérification nourriture à {home_name_display}: {e_home_food}{LogColors.ENDC}")

    if not food_type_at_home_id: return False # No food at home

    path_data_for_eat = None
    if not is_at_home:
        if not citizen_position or not home_position: return False # Cannot pathfind
        path_data_for_eat = get_path_between_points(citizen_position, home_position, transport_api_url)
        if not (path_data_for_eat and path_data_for_eat.get('success')): return False # Pathfinding failed

    if try_create_eat_at_home_activity(
        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
        home_building_id, food_type_at_home_id, 1.0, is_at_home, path_data_for_eat,
        current_time_utc=now_utc_dt, resource_defs=resource_defs
    ):
        activity_type_created = "eat_at_home" if is_at_home else "goto_home"
        log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité '{activity_type_created}' créée pour manger '{food_at_home_name}' à {home_name_display}.{LogColors.ENDC}")
        return True
    return False

def _handle_eat_at_tavern_or_goto(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 6: Handles eating at tavern or going to tavern to eat if hungry and it's leisure time."""
    if not citizen_record['is_hungry']: return False
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return False
    if not citizen_position: return False
    
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    if citizen_ducats < TAVERN_MEAL_COST_ESTIMATE: return False

    log.info(f"{LogColors.OKCYAN}[Faim - Taverne] Citoyen {citizen_name} ({citizen_social_class}): Affamé et en période de loisirs. Recherche taverne.{LogColors.ENDC}")
    closest_tavern_record = get_closest_inn(tables, citizen_position) # Inn also serves as tavern
    if not closest_tavern_record: return False

    tavern_name_display = _get_bldg_display_name_module(tables, closest_tavern_record)
    tavern_pos = _get_building_position_coords(closest_tavern_record)
    tavern_custom_id = closest_tavern_record['fields'].get('BuildingId', closest_tavern_record['id'])
    if not tavern_pos or not tavern_custom_id: return False

    # Check if tavern sells food (simplified check)
    tavern_sells_food = False
    # food_resource_types = ["bread", "fish", "preserved_fish"] # Replaced by constant
    for food_type_id_check in FOOD_RESOURCE_TYPES_FOR_EATING:
        formula_food_contract = (
            f"AND({{Type}}='public_sell', {{SellerBuilding}}='{_escape_airtable_value(tavern_custom_id)}', "
            f"{{ResourceType}}='{_escape_airtable_value(food_type_id_check)}', {{TargetAmount}}>0, "
            f"{{EndAt}}>'{now_utc_dt.isoformat()}', {{CreatedAt}}<='{now_utc_dt.isoformat()}' )"
        )
        try:
            if tables['contracts'].all(formula=formula_food_contract, max_records=1):
                tavern_sells_food = True; break
        except Exception: pass # Ignore errors in this simplified check for now
    
    if not tavern_sells_food: return False

    is_at_tavern = _calculate_distance_meters(citizen_position, tavern_pos) < 20
    if is_at_tavern:
        if try_create_eat_at_tavern_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, tavern_custom_id, current_time_utc=now_utc_dt, resource_defs=resource_defs):
            log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_at_tavern' créée à {tavern_name_display}.{LogColors.ENDC}")
            return True
    else:
        path_to_tavern = get_path_between_points(citizen_position, tavern_pos, transport_api_url)
        if path_to_tavern and path_to_tavern.get('success'):
            if try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, tavern_custom_id, path_to_tavern, current_time_utc=now_utc_dt):
                log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'travel_to_inn' (vers taverne) créée vers {tavern_name_display}.{LogColors.ENDC}")
                return True
    return False

def _handle_deposit_inventory_at_work(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 10: Handles depositing full inventory at work if it's work time or just before/after."""
    workplace_record_for_deposit = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    workplace_type_for_deposit = workplace_record_for_deposit['fields'].get('Type') if workplace_record_for_deposit else None

    # Allow depositing even slightly outside work hours if inventory is full.
    if not (is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type_for_deposit) or \
            is_leisure_time_for_class(citizen_social_class, now_venice_dt)): # Allow during leisure too if near work
        # More precise: check if current time is "close" to work time.
        # For now, allowing during leisure is a simple proxy.
        pass # Let it proceed if inventory is full, even if not strictly work time.

    current_load = get_citizen_current_load(tables, citizen_username)
    citizen_max_capacity = get_citizen_effective_carry_capacity(citizen_record)
    if current_load <= (citizen_max_capacity * 0.7): return False

    log.info(f"{LogColors.OKCYAN}[Inventaire Plein] Citoyen {citizen_name} ({citizen_social_class}): Inventaire >70% plein. Vérification lieu de travail.{LogColors.ENDC}")
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record: return False

    workplace_name_display = _get_bldg_display_name_module(tables, workplace_record)
    workplace_pos = _get_building_position_coords(workplace_record)
    workplace_custom_id_val = workplace_record['fields'].get('BuildingId', workplace_record['id'])
    if not citizen_position or not workplace_pos: return False

    is_at_workplace = _calculate_distance_meters(citizen_position, workplace_pos) < 20
    if not is_at_workplace:
        path_to_work = get_path_between_points(citizen_position, workplace_pos, transport_api_url)
        if path_to_work and path_to_work.get('success'):
            if try_create_goto_work_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                workplace_custom_id_val, path_to_work,
                get_citizen_home(tables, citizen_username), resource_defs, False, citizen_position_str_val, now_utc_dt
            ):
                log.info(f"{LogColors.OKGREEN}[Inventaire Plein] Citoyen {citizen_name}: Activité 'goto_work' créée vers {workplace_name_display} pour dépôt.{LogColors.ENDC}")
                return True
    else: # Is at workplace
        mock_activity_record = {'id': f"mock_deposit_{citizen_airtable_id}", 'fields': {'ActivityId': f"mock_deposit_{uuid.uuid4()}", 'Citizen': citizen_username, 'ToBuilding': workplace_custom_id_val}}
        # Call process_goto_work_fn to attempt the deposit.
        # This function itself doesn't create a new activity record in Airtable.
        # It performs an action (deposit) based on the mock activity.
        deposit_successful = process_goto_work_fn(tables, mock_activity_record, building_type_defs, resource_defs)
        
        if deposit_successful:
            log.info(f"{LogColors.OKGREEN}[Inventaire Plein] Citoyen {citizen_name}: Dépôt direct à {workplace_name_display} réussi (ou rien à déposer).{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}[Inventaire Plein] Citoyen {citizen_name}: Tentative de dépôt direct à {workplace_name_display} échouée (ex: pas d'espace).{LogColors.ENDC}")
            
        # Regardless of deposit success/failure, this handler did not create a *new* activity record.
        # Return False to allow other handlers (e.g., production, idle) to be evaluated for this citizen.
        return False
    # If we created a goto_work activity (because not at workplace), the return True from that path is correct.
    # If we reach here, it means no goto_work activity was created (e.g. pathfinding failed or already at work but deposit logic returned False from above).
    return False

def _handle_check_business_status(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 12: Handles checking business status if manager and not checked recently, during work/leisure time."""
    # For checking business status, the "workplace_type" isn't directly the one the citizen is *at* for work,
    # but rather the type of business they are managing. We assume class leisure hours are sufficient for this.
    # Or, if they are at a specific business they manage, its hours could be relevant.
    # For simplicity, we'll use class work/leisure for now.
    # If a more specific check is needed, the business_type would be passed to is_work_time.
    if not (is_work_time(citizen_social_class, now_venice_dt) or \
            is_leisure_time_for_class(citizen_social_class, now_venice_dt)):
        return False # Only check during active hours

    # Find buildings RunBy this citizen that are businesses
    try:
        businesses_run_by_citizen = tables['buildings'].all(
            formula=f"AND({{RunBy}}='{_escape_airtable_value(citizen_username)}', {{Category}}='business')"
        )
    except Exception as e_fetch_biz:
        log.error(f"{LogColors.FAIL}[Vérif. Business] Erreur récupération des entreprises pour {citizen_name}: {e_fetch_biz}{LogColors.ENDC}")
        return False

    if not businesses_run_by_citizen:
        return False # Not running any businesses

    for business in businesses_run_by_citizen:
        business_custom_id = business['fields'].get('BuildingId')
        business_name_display = _get_bldg_display_name_module(tables, business)
        checked_at_str = business['fields'].get('CheckedAt')
        needs_check = True

        if checked_at_str:
            try:
                checked_at_dt = datetime.datetime.fromisoformat(checked_at_str.replace("Z", "+00:00"))
                if checked_at_dt.tzinfo is None: # Ensure timezone aware
                    checked_at_dt = pytz.UTC.localize(checked_at_dt)
                
                # Check if last check was within the last 23 hours (giving a 1-hour buffer before 24h penalty)
                if (now_utc_dt - checked_at_dt) < datetime.timedelta(hours=23):
                    needs_check = False
            except ValueError:
                log.warning(f"{LogColors.WARNING}[Vérif. Business] Format de date invalide pour CheckedAt ({checked_at_str}) pour {business_name_display}. Supposition : vérification nécessaire.{LogColors.ENDC}")
        
        if needs_check:
            log.info(f"{LogColors.OKCYAN}[Vérif. Business] {business_name_display} (géré par {citizen_name}) nécessite une vérification (Dernière vérif.: {checked_at_str or 'Jamais'}).{LogColors.ENDC}")
            
            path_to_business = None
            if not citizen_position: # Should not happen if position assignment worked
                log.warning(f"{LogColors.WARNING}[Vérif. Business] {citizen_name} n'a pas de position. Impossible de créer l'activité de vérification.{LogColors.ENDC}")
                continue

            business_pos = _get_building_position_coords(business)
            if not business_pos:
                log.warning(f"{LogColors.WARNING}[Vérif. Business] {business_name_display} n'a pas de position. Impossible de créer l'activité de vérification.{LogColors.ENDC}")
                continue

            if _calculate_distance_meters(citizen_position, business_pos) > 20: # If not already at the business
                path_to_business = get_path_between_points(citizen_position, business_pos, transport_api_url)
                if not (path_to_business and path_to_business.get('success')):
                    log.warning(f"{LogColors.WARNING}[Vérif. Business] Impossible de trouver un chemin vers {business_name_display} pour {citizen_name}.{LogColors.ENDC}")
                    continue # Try next business or fail for this citizen this cycle

            if try_create_check_business_status_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                business_custom_id, path_to_business, now_utc_dt
            ):
                log.info(f"{LogColors.OKGREEN}[Vérif. Business] Activité 'check_business_status' créée pour {citizen_name} vers {business_name_display}.{LogColors.ENDC}")
                return True # One check activity per cycle is enough
    return False


def _handle_night_shelter(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 15: Handles finding night shelter (home or inn) if it's rest time."""
    if not is_rest_time_for_class(citizen_social_class, now_venice_dt):
        return False
    if not citizen_position: return False

    log.info(f"{LogColors.OKCYAN}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Période de repos. Évaluation abri.{LogColors.ENDC}")
    is_forestieri = citizen_social_class == "Forestieri"

    # Calculate end time for rest based on class schedule
    # Get the 'rest' periods for the citizen's social class
    schedule = SOCIAL_CLASS_SCHEDULES.get(citizen_social_class, {})
    rest_periods = schedule.get("rest", [])
    if not rest_periods:
        log.error(f"No rest periods defined for {citizen_social_class}. Cannot calculate rest end time.")
        # Fallback to a generic 6 AM end time if schedule is missing, though this shouldn't happen.
        venice_now_for_rest_fallback = now_utc_dt.astimezone(VENICE_TIMEZONE)
        if venice_now_for_rest_fallback.hour < NIGHT_END_HOUR_FOR_STAY:
             end_time_venice_rest = venice_now_for_rest_fallback.replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
        else:
             end_time_venice_rest = (venice_now_for_rest_fallback + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
    else:
        # Determine the end of the current or upcoming rest period
        # This logic assumes rest periods are sorted and handles overnight.
        # For simplicity, find the next rest end hour after current time.
        current_hour_venice = now_venice_dt.hour
        end_hour_of_current_rest_period = -1

        for start_h, end_h in rest_periods:
            if start_h <= end_h: # Same day
                if start_h <= current_hour_venice < end_h:
                    end_hour_of_current_rest_period = end_h
                    break
            else: # Overnight
                if current_hour_venice >= start_h: # Currently in the first part of overnight rest
                    end_hour_of_current_rest_period = end_h # End hour is on the next day
                    break
                elif current_hour_venice < end_h: # Currently in the second part of overnight rest
                    end_hour_of_current_rest_period = end_h
                    break
        
        if end_hour_of_current_rest_period == -1: # Should not happen if is_rest_time_for_class was true
            log.warning(f"Could not determine current rest period end for {citizen_name}. Defaulting end time.")
            end_time_venice_rest = (now_venice_dt + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0) # Default 1h rest
        else:
            # If the end_hour is for "next day" (e.g. rest is 22-06, current is 23, end_hour is 6)
            # or if current_hour is already past the start of a period that ends on the same day.
            target_date = now_venice_dt
            # If current hour is in an overnight period that started "yesterday" (e.g. current 01:00, period 22-06)
            # OR if current hour is in a period that started today and ends "tomorrow" (e.g. current 23:00, period 22-06)
            # and the end_hour_of_current_rest_period is less than current_hour_venice (meaning it's next day's hour)
            # This logic needs to be robust for all cases.
            # Simpler: if end_hour < current_hour (and it's an overnight block), it's next day.
            # Or if it's a normal block, it's same day.
            
            # Find the specific (start, end) block we are in or about to be in.
            chosen_rest_block_end_hour = -1
            is_overnight_block_ending_next_day = False

            for start_h, end_h in rest_periods:
                if start_h <= end_h: # Same day block
                    if start_h <= current_hour_venice < end_h:
                        chosen_rest_block_end_hour = end_h
                        break
                else: # Overnight block (e.g. 22 to 06)
                    if current_hour_venice >= start_h: # e.g. current 23:00, block 22-06
                        chosen_rest_block_end_hour = end_h
                        is_overnight_block_ending_next_day = True
                        break
                    elif current_hour_venice < end_h: # e.g. current 01:00, block 22-06
                        chosen_rest_block_end_hour = end_h
                        break
            
            if chosen_rest_block_end_hour != -1:
                end_time_venice_rest = now_venice_dt.replace(hour=chosen_rest_block_end_hour, minute=0, second=0, microsecond=0)
                if is_overnight_block_ending_next_day and chosen_rest_block_end_hour <= current_hour_venice : # e.g. current 23, end_hour 06
                    end_time_venice_rest += datetime.timedelta(days=1)
                # If current time is already past the calculated end time for today (e.g. current 07:00, end_hour 06:00 from a 22-06 block)
                # this means we are past the rest period. This case should ideally be caught by is_rest_time_for_class.
                # However, if is_rest_time_for_class was true, and we are here, it means we are *in* a rest period.
            else: # Fallback, should not be reached if is_rest_time_for_class is accurate
                log.error(f"Logic error determining rest end time for {citizen_name}. Defaulting.")
                end_time_venice_rest = (now_venice_dt + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

    stay_end_time_utc_iso = end_time_venice_rest.astimezone(pytz.UTC).isoformat()

    if not is_forestieri: # Resident logic
        home_record = get_citizen_home(tables, citizen_username)
        if not home_record: # Homeless resident
            log.info(f"{LogColors.WARNING}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Sans domicile. Recherche d'une auberge.{LogColors.ENDC}")
        else: # Resident with a home
            home_name_display = _get_bldg_display_name_module(tables, home_record)
            home_pos = _get_building_position_coords(home_record)
            home_custom_id_val = home_record['fields'].get('BuildingId', home_record['id'])
            if not home_pos or not home_custom_id_val: return False

            if _calculate_distance_meters(citizen_position, home_pos) < 20: # Is at home
                if try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, home_custom_id_val, "home", stay_end_time_utc_iso, now_utc_dt):
                    log.info(f"{LogColors.OKGREEN}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Activité 'rest' (maison) créée à {home_name_display}.{LogColors.ENDC}")
                    return True
            else: # Not at home, go home
                path_to_home = get_path_between_points(citizen_position, home_pos, transport_api_url)
                if path_to_home and path_to_home.get('success'):
                    if try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, home_custom_id_val, path_to_home, now_utc_dt):
                        log.info(f"{LogColors.OKGREEN}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Activité 'goto_home' créée vers {home_name_display}.{LogColors.ENDC}")
                        return True
            return False # Failed to rest or go home for resident with home

    # Forestieri or Homeless Resident logic (Inn) - This part is reached if is_forestieri is true, OR if resident is homeless
    log.info(f"{LogColors.OKCYAN}[Repos] Citoyen {citizen_name} ({citizen_social_class} - {'Forestieri' if is_forestieri else 'Résident sans abri'}): Recherche d'une auberge.{LogColors.ENDC}")
    closest_inn_record = get_closest_inn(tables, citizen_position)
    if not closest_inn_record: return False

    inn_name_display = _get_bldg_display_name_module(tables, closest_inn_record)
    inn_pos = _get_building_position_coords(closest_inn_record)
    inn_custom_id_val = closest_inn_record['fields'].get('BuildingId', closest_inn_record['id'])
    if not inn_pos or not inn_custom_id_val: return False

    if _calculate_distance_meters(citizen_position, inn_pos) < 20: # Is at inn
        if try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, inn_custom_id_val, "inn", stay_end_time_utc_iso, now_utc_dt):
            log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'rest' (auberge) créée à {inn_name_display}.{LogColors.ENDC}")
            return True
    else: # Not at inn, go to inn
        path_to_inn = get_path_between_points(citizen_position, inn_pos, transport_api_url)
        if path_to_inn and path_to_inn.get('success'):
            if try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, inn_custom_id_val, path_to_inn, now_utc_dt):
                log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'travel_to_inn' créée vers {inn_name_display}.{LogColors.ENDC}")
                return True
    return False

def _handle_shop_for_food_at_retail(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 20 (was 5): Handles shopping for food at retail_food if hungry, has home, and it's leisure time."""
    # This is now a lower priority than general work/production, happens during leisure.
    if not citizen_record['is_hungry']: return False
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return False
    if not citizen_position: return False

    home_record = get_citizen_home(tables, citizen_username)
    if not home_record:
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture Détail] Citoyen {citizen_name} ({citizen_social_class}): Sans domicile.{LogColors.ENDC}")
        return False
    
    home_custom_id = home_record['fields'].get('BuildingId')
    if not home_custom_id: return False

    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    if citizen_ducats < FOOD_SHOPPING_COST_ESTIMATE: # Estimate for 1-2 units of food
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Citoyen {citizen_name}: Pas assez de Ducats ({citizen_ducats:.2f}) pour acheter de la nourriture (Estimation: {FOOD_SHOPPING_COST_ESTIMATE}).{LogColors.ENDC}")
        return False

    log.info(f"{LogColors.OKCYAN}[Achat Nourriture] Citoyen {citizen_name}: Affamé, a un domicile et des Ducats. Recherche de magasins d'alimentation.{LogColors.ENDC}")

    citizen_social_class = citizen_record['fields'].get('SocialClass', 'Facchini') # Default to Facchini
    citizen_tier = SOCIAL_CLASS_VALUE.get(citizen_social_class, 1) # Default to tier 1

    try:
        retail_food_buildings = tables['buildings'].all(formula="AND({SubCategory}='retail_food', {IsConstructed}=TRUE())")
    except Exception as e_fetch_shops:
        log.error(f"{LogColors.FAIL}[Achat Nourriture] Erreur récupération des magasins 'retail_food': {e_fetch_shops}{LogColors.ENDC}")
        return False

    if not retail_food_buildings:
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Aucun magasin 'retail_food' trouvé.{LogColors.ENDC}")
        return False

    best_deal_info = None 
    best_tier_priority_score = float('inf') # Lower is better for tier priority (0 is perfect match)
    best_secondary_score = -float('inf')    # Higher is better for price * distance

    for shop_rec in retail_food_buildings:
        shop_pos = _get_building_position_coords(shop_rec)
        shop_custom_id_val = shop_rec['fields'].get('BuildingId')
        shop_custom_id: Optional[str] = None # Renommé pour éviter confusion avec la variable finale

        temp_val_for_id = shop_custom_id_val
        # Tentative de dérouler une potentielle structure imbriquée (liste/tuple dans liste/tuple)
        if isinstance(temp_val_for_id, (list, tuple)):
            if temp_val_for_id: # Si la liste/tuple externe n'est pas vide
                temp_val_for_id = temp_val_for_id[0] # Prendre le premier élément
            else:
                log.warning(f"{LogColors.WARNING}[Achat Nourriture] BuildingId (externe) pour le magasin {shop_rec.get('id', 'Unknown ID')} est une liste/tuple vide. Ignoré.{LogColors.ENDC}")
                continue
        
        # Vérifier à nouveau si l'élément interne est une liste/tuple
        if isinstance(temp_val_for_id, (list, tuple)):
            if temp_val_for_id: # Si la liste/tuple interne n'est pas vide
                temp_val_for_id = temp_val_for_id[0] # Prendre le premier élément de la structure interne
            else:
                log.warning(f"{LogColors.WARNING}[Achat Nourriture] BuildingId (interne) pour le magasin {shop_rec.get('id', 'Unknown ID')} est une liste/tuple vide. Ignoré.{LogColors.ENDC}")
                continue
        
        # À ce stade, temp_val_for_id devrait être la valeur ID brute ou None
        if temp_val_for_id is not None:
            shop_custom_id = str(temp_val_for_id) # Convertir en chaîne
        else:
            log.warning(f"{LogColors.WARNING}[Achat Nourriture] BuildingId pour le magasin {shop_rec.get('id', 'Unknown ID')} est None ou est devenu None après traitement. Ignoré.{LogColors.ENDC}")
            continue

        # Vérification finale après traitement de shop_custom_id
        if not shop_pos or not shop_custom_id:
            log.warning(f"{LogColors.WARNING}[Achat Nourriture] Position ou ID de magasin invalide après traitement pour {shop_rec.get('id', 'Unknown ID')}. shop_custom_id: {shop_custom_id}. Ignoré.{LogColors.ENDC}")
            continue

        distance_to_shop = _calculate_distance_meters(citizen_position, shop_pos)
        if distance_to_shop == float('inf'): continue

        # Simplified Airtable query: fetch all contracts for the shop
        # The shop_custom_id is already validated as a string.
        # Use SEARCH and ARRAYJOIN for SellerBuilding to handle cases where it might be a list/tuple in Airtable.
        formula_shop_contracts = f"SEARCH('${_escape_airtable_value(shop_custom_id)}', ARRAYJOIN({{SellerBuilding}}))"
        
        try:
            all_shop_contracts = tables['contracts'].all(formula=formula_shop_contracts)
        except Exception as e_fetch_all_shop_contracts:
            log.error(f"{LogColors.FAIL}[Achat Nourriture] Erreur récupération des contrats pour le magasin {shop_custom_id}: {e_fetch_all_shop_contracts}{LogColors.ENDC}")
            continue # Try next shop

        for food_type_id in FOOD_RESOURCE_TYPES_FOR_EATING:
            candidate_contracts_for_food_type = []
            for contract_rec in all_shop_contracts:
                fields = contract_rec.get('fields', {})
                
                # Python-side filtering
                if fields.get('Type') != 'public_sell': continue
                if fields.get('ResourceType') != food_type_id: continue
                if float(fields.get('TargetAmount', 0)) <= 0: continue

                created_at_str = fields.get('CreatedAt')
                end_at_str = fields.get('EndAt')
                if not created_at_str or not end_at_str: continue

                try:
                    created_at_dt = dateutil_parser.isoparse(created_at_str)
                    end_at_dt = dateutil_parser.isoparse(end_at_str)
                    if created_at_dt.tzinfo is None: created_at_dt = pytz.utc.localize(created_at_dt)
                    if end_at_dt.tzinfo is None: end_at_dt = pytz.utc.localize(end_at_dt)

                    if not (created_at_dt <= now_utc_dt <= end_at_dt):
                        continue # Contract not active
                except Exception as e_date_parse:
                    log.warning(f"Could not parse dates for contract {fields.get('ContractId', 'N/A')}: {e_date_parse}")
                    continue
                
                candidate_contracts_for_food_type.append(contract_rec)

            if not candidate_contracts_for_food_type:
                continue

            # Sort candidates by price (ascending)
            candidate_contracts_for_food_type.sort(key=lambda c: float(c.get('fields', {}).get('PricePerResource', float('inf'))))
            
            if candidate_contracts_for_food_type:
                best_contract_for_this_food_at_shop = candidate_contracts_for_food_type[0]
                price = float(best_contract_for_this_food_at_shop.get('fields', {}).get('PricePerResource', float('inf')))
                if price == float('inf'): continue

                resource_tier_from_def = resource_defs.get(food_type_id, {}).get('tier')
                try:
                    resource_tier = int(resource_tier_from_def) if resource_tier_from_def is not None else 99
                except ValueError:
                    resource_tier = 99
                
                current_tier_priority = abs(resource_tier - citizen_tier)
                current_secondary_score = price * distance_to_shop if distance_to_shop != float('inf') else -float('inf')

                is_better_deal = False
                if current_tier_priority < best_tier_priority_score:
                    is_better_deal = True
                elif current_tier_priority == best_tier_priority_score:
                    if current_secondary_score > best_secondary_score:
                        is_better_deal = True
                
                if is_better_deal:
                    path_to_shop = get_path_between_points(citizen_position, shop_pos, transport_api_url)
                    if path_to_shop and path_to_shop.get('success'):
                        best_tier_priority_score = current_tier_priority
                        best_secondary_score = current_secondary_score
                        best_deal_info = {
                            "contract_rec": best_contract_for_this_food_at_shop, "shop_rec": shop_rec, 
                            "food_type_id": food_type_id, "price": price, 
                            "path_to_shop": path_to_shop,
                            "tier_priority_debug": current_tier_priority, 
                            "secondary_score_debug": current_secondary_score 
                        }
    
    if best_deal_info:
        shop_display_name = _get_bldg_display_name_module(tables, best_deal_info["shop_rec"])
        shop_custom_id_for_activity = best_deal_info["shop_rec"]['fields'].get('BuildingId')
        food_display_name = _get_res_display_name_module(best_deal_info["food_type_id"], resource_defs)
        price_for_this_meal = best_deal_info['price']

        log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Meilleure offre trouvée: {food_display_name} à {shop_display_name} pour {price_for_this_meal:.2f} Ducats (Priorité Tier: {best_deal_info['tier_priority_debug']}, Score Sec: {best_deal_info['secondary_score_debug']:.2f}).{LogColors.ENDC}")

        if citizen_ducats < price_for_this_meal: # Check against the actual price of the chosen food
            log.info(f"{LogColors.WARNING}[Achat Nourriture] Pas assez de Ducats ({citizen_ducats:.2f}) pour acheter {food_display_name} à {price_for_this_meal:.2f} Ducats.{LogColors.ENDC}")
            return False
        
        # Determine if citizen is at the shop
        is_at_shop = False
        if citizen_position and best_deal_info["shop_rec"]:
            shop_pos_for_check = _get_building_position_coords(best_deal_info["shop_rec"])
            if shop_pos_for_check and _calculate_distance_meters(citizen_position, shop_pos_for_check) < 20:
                is_at_shop = True
        
        if is_at_shop:
            log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Citoyen {citizen_name} est déjà à {shop_display_name}. Création de l'activité 'eat_at_tavern'.{LogColors.ENDC}")
            # Prepare details for the eat_at_tavern activity
            activity_details = {
                "is_retail_purchase": True,
                "food_resource_id": best_deal_info["food_type_id"],
                "price": price_for_this_meal,
                "original_contract_id": best_deal_info["contract_rec"]['fields'].get('ContractId', best_deal_info["contract_rec"]['id'])
            }
            if try_create_eat_at_tavern_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
                shop_custom_id_for_activity, # Use shop ID as tavern ID
                now_utc_dt, resource_defs,
                details_payload=activity_details # Pass the details
            ):
                log.info(f"{LogColors.OKGREEN}[Achat Nourriture] Citoyen {citizen_name}: Activité 'eat_at_tavern' (au magasin) créée pour {food_display_name} avec détails.{LogColors.ENDC}")
                return True
        else:
            log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Citoyen {citizen_name} n'est pas à {shop_display_name}. Création de l'activité 'travel_to_inn'.{LogColors.ENDC}")
            # Path to shop is in best_deal_info["path_to_shop"]
            if try_create_travel_to_inn_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                shop_custom_id_for_activity, # Use shop ID as inn ID
                best_deal_info["path_to_shop"], # This path was from citizen's current location to the shop
                now_utc_dt
            ):
                log.info(f"{LogColors.OKGREEN}[Achat Nourriture] Citoyen {citizen_name}: Activité 'travel_to_inn' (vers magasin) créée pour aller manger {food_display_name}.{LogColors.ENDC}")
                return True
    else:
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Aucune offre de nourriture appropriée trouvée pour {citizen_name} selon les critères de priorité.{LogColors.ENDC}")
        
    return False

def _handle_fishing(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 32: Handles regular fishing if citizen is Facchini, it's work time, and they are a fisherman."""
    if citizen_social_class != "Facchini":
        return False
    # Fishing is a generic Facchini task, not tied to a specific building type's hours, so use class schedule.
    if not is_work_time(citizen_social_class, now_venice_dt): # Pass no workplace_type
        return False
        
    home_record = get_citizen_home(tables, citizen_username) # Fishermen live in fisherman's cottages
    if not (home_record and home_record['fields'].get('Type') == 'fisherman_s_cottage'):
        return False # Not a fisherman (based on home type)

    # Check if they have a formal "Workplace" record. If so, they should do that job.
    # This fishing is for those Facchini in fisherman's cottages without other assigned work.
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if workplace_record:
        return False # Has other work

    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Pêche Régulière] {citizen_name} n'a pas de position. Impossible de pêcher.{LogColors.ENDC}")
        return False

    log.info(f"{LogColors.OKCYAN}[Pêche Régulière] {citizen_name} (Facchini pêcheur sans autre travail) en période de travail. Recherche lieu de pêche.{LogColors.ENDC}")
    
    target_wp_id, target_wp_pos, path_data = _find_closest_fishable_water_point(citizen_position, api_base_url, transport_api_url)

    if target_wp_id and path_data:
        if try_create_fishing_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            target_wp_id, path_data, now_utc_dt, activity_type="fishing"
        ):
            log.info(f"{LogColors.OKGREEN}[Pêche] {citizen_name}: Activité 'fishing' créée vers {target_wp_id}.{LogColors.ENDC}")
            return True
    else:
        log.info(f"{LogColors.OKBLUE}[Pêche] {citizen_name}: Aucun lieu de pêche accessible trouvé.{LogColors.ENDC}")
        
    return False


# --- Placeholder for new handler functions ---

def _handle_construction_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 30: Handles construction related tasks if it's work time."""
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record or workplace_record['fields'].get('SubCategory') != 'construction':
        return False
    
    workplace_type = workplace_record['fields'].get('Type') # e.g., "construction_workshop"
    if not is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type):
        return False

    workplace_pos = _get_building_position_coords(workplace_record)
    if not citizen_position or not workplace_pos or _calculate_distance_meters(citizen_position, workplace_pos) > 20:
        log.info(f"{LogColors.OKBLUE}[Construction] Citoyen {citizen_name} ({citizen_social_class}) n'est pas à son atelier. Pas de tâche de construction.{LogColors.ENDC}")
        return False
    
    log.info(f"{LogColors.OKCYAN}[Construction] Citoyen {citizen_name} ({citizen_social_class}) est à son atelier. Délégation à handle_construction_worker_activity.{LogColors.ENDC}")
    # handle_construction_worker_activity expects the citizen record and workplace record.
    # It also needs building_type_defs, resource_defs, time, and api_urls.
    if handle_construction_worker_activity(
        tables, citizen_record, workplace_record,
        building_type_defs, resource_defs, 
        now_venice_dt, now_utc_dt, 
        transport_api_url, api_base_url
    ):
        log.info(f"{LogColors.OKGREEN}[Construction] Citoyen {citizen_name}: Tâche de construction créée/gérée.{LogColors.ENDC}")
        return True
    return False

def _handle_production_and_general_work_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 31: Handles production, restocking for general workplaces if it's work time."""
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record:
        return False

    workplace_type = workplace_record['fields'].get('Type')
    if not is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type):
        return False
        
    # Nobili do not "work" in this sense, their activities are handled by leisure.
    # The is_work_time function already handles Nobili for class-based schedules.
    # If a Nobili were to work at a building with specific hours (e.g. as an employee), 
    # is_work_time would use those building hours.
    # However, the general assumption is Nobili don't take up "jobs" like this.
    # If social_class is Nobili AND it fell back to class schedule, is_work_time returns False.
    # If it used building schedule, it could be True. We might need an explicit Nobili check here
    # if we want to prevent them from doing production even if a building they own has hours.
    # For now, relying on is_work_time's Nobili logic for class schedules.
    if citizen_social_class == "Nobili" and not BUILDING_TYPE_WORK_SCHEDULES.get(workplace_type):
         return False # Explicitly prevent Nobili if falling back to class schedule (which is_work_time handles)

    workplace_category = workplace_record['fields'].get('Category', '').lower()
    workplace_subcategory = workplace_record['fields'].get('SubCategory', '').lower()
    workplace_type = workplace_record['fields'].get('Type', '')
    workplace_custom_id = workplace_record['fields'].get('BuildingId')
    workplace_operator = workplace_record['fields'].get('RunBy') or workplace_record['fields'].get('Owner')


    # This handler is for general business/production, not construction or porter guilds
    if workplace_category != 'business' or workplace_subcategory in ['construction', 'porter_guild_hall', 'storage']: # Exclude storage as well for now
        return False
    
    if not citizen_position: return False # Needs position to evaluate being at work
    workplace_pos = _get_building_position_coords(workplace_record)
    if not workplace_pos or _calculate_distance_meters(citizen_position, workplace_pos) > 20:
        return False # Not at workplace

    log.info(f"{LogColors.OKCYAN}[Travail Général] Citoyen {citizen_name} à {workplace_custom_id} ({workplace_type}). Évaluation des tâches.{LogColors.ENDC}")

    building_type_def = get_building_type_info(workplace_type, building_type_defs)
    if not building_type_def or 'productionInformation' not in building_type_def:
        log.info(f"Pas d'information de production pour {workplace_type}. Impossible de produire ou réapprovisionner.")
        return False
    
    prod_info = building_type_def['productionInformation']
    recipes = prod_info.get('Arti', []) if isinstance(prod_info, dict) else [] # Ensure prod_info is dict
    storage_capacity = float(prod_info.get('storageCapacity', 0))
    
    # 1. Try to produce
    if recipes:
        current_workplace_stock_map = get_building_resources(tables, workplace_custom_id) # Fetches {res_id: count}
        for recipe_idx, recipe_def in enumerate(recipes):
            if not isinstance(recipe_def, dict): continue # Skip if recipe_def is not a dict
            
            can_produce_this_recipe = True
            if not recipe_def.get('inputs'): # Recipe with no inputs (e.g. research)
                 pass # can_produce_this_recipe remains true
            else:
                for input_res, input_qty_needed in recipe_def.get('inputs', {}).items():
                    if current_workplace_stock_map.get(input_res, 0.0) < float(input_qty_needed):
                        can_produce_this_recipe = False; break
            
            if can_produce_this_recipe:
                # Check output space
                output_total_volume = sum(float(qty) for qty in recipe_def.get('outputs', {}).values())
                current_total_stock_volume = sum(current_workplace_stock_map.values())
                # Approximate available space check
                if storage_capacity == 0 or (storage_capacity - current_total_stock_volume + sum(float(qty) for qty in recipe_def.get('inputs', {}).values())) >= output_total_volume:
                    if try_create_production_activity(tables, citizen_airtable_id, citizen_custom_id, citizen_username, workplace_custom_id, recipe_def, now_utc_dt):
                        log.info(f"{LogColors.OKGREEN}[Travail Général] Citoyen {citizen_name} a commencé la production à {workplace_custom_id}.{LogColors.ENDC}")
                        return True
                else:
                    log.info(f"Pas assez d'espace de stockage à {workplace_custom_id} pour la sortie de la recette {recipe_idx}.")

    # 2. Try to restock inputs for production
    if recipes: # Only try to restock if there are recipes
        current_workplace_stock_map_for_restock = get_building_resources(tables, workplace_custom_id) # Re-fetch or use above
        
        # Determine needed resources based on recipes and current stock
        # This is a simplified needs assessment. A more complex one would look at target stock levels.
        for recipe_def_restock in recipes:
            if not isinstance(recipe_def_restock, dict): continue
            for input_res_id, input_qty_needed_val in recipe_def_restock.get('inputs', {}).items():
                input_qty_needed = float(input_qty_needed_val)
                current_stock_of_input = current_workplace_stock_map_for_restock.get(input_res_id, 0.0)
                if current_stock_of_input < input_qty_needed:
                    needed_amount = input_qty_needed - current_stock_of_input
                    res_name_display = _get_res_display_name_module(input_res_id, resource_defs)
                    log.info(f"{LogColors.OKBLUE}[Travail Général] {workplace_custom_id} a besoin de {needed_amount:.2f} de {res_name_display} pour la production.{LogColors.ENDC}")

                    # Attempt to acquire needed_amount of input_res_id for workplace_custom_id, operated by workplace_operator

                    # Prio 1: Fetch from dedicated storage contract (storage_query)
                    storage_query_contracts = tables['contracts'].all(
                        formula=f"AND({{Type}}='storage_query', {{Buyer}}='{_escape_airtable_value(workplace_operator)}', {{BuyerBuilding}}='{_escape_airtable_value(workplace_custom_id)}', {{ResourceType}}='{_escape_airtable_value(input_res_id)}', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
                    )
                    if storage_query_contracts:
                        sq_contract = storage_query_contracts[0]
                        storage_facility_id = sq_contract['fields'].get('SellerBuilding')
                        if storage_facility_id:
                            storage_facility_record = get_building_record(tables, storage_facility_id)
                            if storage_facility_record:
                                _, facility_stock_map = get_building_storage_details(tables, storage_facility_id, workplace_operator)
                                actual_stored_amount = float(facility_stock_map.get(input_res_id, 0.0))
                                amount_to_fetch_from_storage = min(needed_amount, actual_stored_amount)
                                amount_to_fetch_from_storage = float(f"{amount_to_fetch_from_storage:.4f}")
                                if amount_to_fetch_from_storage >= 0.1:
                                    log.info(f"    [Travail Général] Trouvé {actual_stored_amount:.2f} de {res_name_display} dans l'entrepôt {storage_facility_id}. Va chercher {amount_to_fetch_from_storage:.2f}.")
                                    storage_facility_pos = _get_building_position_coords(storage_facility_record)
                                    if citizen_position and storage_facility_pos: # Citizen is at workplace
                                        path_to_storage = get_path_between_points(citizen_position, storage_facility_pos, transport_api_url)
                                        if path_to_storage and path_to_storage.get('success'):
                                            goto_notes = f"Aller à l'entrepôt {storage_facility_id} pour chercher {amount_to_fetch_from_storage:.2f} {res_name_display} pour l'atelier {workplace_custom_id}."
                                            fetch_details = {
                                                "action_on_arrival": "fetch_from_storage",
                                                "original_workplace_id": workplace_custom_id,
                                                "storage_query_contract_id": sq_contract['fields'].get('ContractId', sq_contract['id']),
                                                "resources_to_fetch": [{"ResourceId": input_res_id, "Amount": amount_to_fetch_from_storage}]
                                            }
                                            if try_create_goto_work_activity(
                                                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                                                storage_facility_id, path_to_storage,
                                                None, resource_defs, False, citizen_position_str_val, now_utc_dt,
                                                custom_notes=goto_notes, activity_type="goto_building_for_storage_fetch", details_payload=fetch_details
                                            ):
                                                log.info(f"      [Travail Général] Activité 'goto_building_for_storage_fetch' créée vers {storage_facility_id}.")
                                                return True
                    
                    # Prio 2: Fetch via recurrent contract
                    recurrent_contracts = get_citizen_contracts(tables, workplace_operator)
                    for contract_rec in recurrent_contracts:
                        if contract_rec['fields'].get('ResourceType') == input_res_id and contract_rec['fields'].get('BuyerBuilding') == workplace_custom_id:
                            from_bldg_id_rec = contract_rec['fields'].get('SellerBuilding')
                            if not from_bldg_id_rec: continue
                            from_bldg_rec_rec = get_building_record(tables, from_bldg_id_rec)
                            if not from_bldg_rec_rec: continue
                            
                            amount_rec_contract = float(contract_rec['fields'].get('TargetAmount', 0) or 0)
                            amount_to_fetch_rec = min(needed_amount, amount_rec_contract)
                            
                            seller_rec = contract_rec['fields'].get('Seller')
                            if not seller_rec: continue
                            _, source_stock_rec = get_building_storage_details(tables, from_bldg_id_rec, seller_rec)
                            
                            if source_stock_rec.get(input_res_id, 0.0) >= amount_to_fetch_rec and amount_to_fetch_rec > 0.01:
                                contract_custom_id_rec_str = contract_rec['fields'].get('ContractId', contract_rec['id'])
                                if _has_recent_failed_activity_for_contract(tables, 'fetch_resource', contract_custom_id_rec_str): continue
                                
                                log.info(f"    [Travail Général] Tentative de récupération via contrat récurrent {contract_custom_id_rec_str} depuis {from_bldg_id_rec} pour {res_name_display}.")
                                path_src_rec = get_path_between_points(citizen_position, _get_building_position_coords(from_bldg_rec_rec), transport_api_url)
                                if path_src_rec and path_src_rec.get('success'):
                                    if try_create_resource_fetching_activity(
                                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                                        contract_custom_id_rec_str, from_bldg_id_rec, workplace_custom_id,
                                        input_res_id, amount_to_fetch_rec, path_src_rec, now_utc_dt, resource_defs
                                    ):
                                        log.info(f"      [Travail Général] Activité 'fetch_resource' créée pour contrat récurrent {contract_custom_id_rec_str}.")
                                        return True
                    
                    # Prio 3: Buy from public sell contract
                    public_sell_formula = f"AND({{Type}}='public_sell', {{ResourceType}}='{_escape_airtable_value(input_res_id)}', {{EndAt}}>'{now_utc_dt.isoformat()}', {{TargetAmount}}>0)"
                    all_public_sell_for_res = tables['contracts'].all(formula=public_sell_formula, sort=['PricePerResource']) # Tri ascendant par PricePerResource
                    for contract_ps in all_public_sell_for_res:
                        seller_bldg_id_ps = contract_ps['fields'].get('SellerBuilding')
                        if not seller_bldg_id_ps: continue
                        seller_bldg_rec_ps = get_building_record(tables, seller_bldg_id_ps)
                        if not seller_bldg_rec_ps: continue

                        price_ps = float(contract_ps['fields'].get('PricePerResource', 0))
                        available_ps = float(contract_ps['fields'].get('TargetAmount', 0))
                        seller_ps = contract_ps['fields'].get('Seller')
                        if not seller_ps: continue

                        buyer_rec_ps = get_citizen_record(tables, workplace_operator) # Workplace operator is the buyer
                        if not buyer_rec_ps: continue
                        ducats_ps = float(buyer_rec_ps['fields'].get('Ducats', 0))
                        
                        max_affordable_ps = (ducats_ps / price_ps) if price_ps > 0 else float('inf')
                        amount_to_buy_ps = min(needed_amount, available_ps, max_affordable_ps)
                        amount_to_buy_ps = float(f"{amount_to_buy_ps:.4f}")

                        if amount_to_buy_ps >= 0.1:
                            _, source_stock_ps = get_building_storage_details(tables, seller_bldg_id_ps, seller_ps)
                            if source_stock_ps.get(input_res_id, 0.0) >= amount_to_buy_ps:
                                contract_custom_id_ps_str = contract_ps['fields'].get('ContractId', contract_ps['id'])
                                if _has_recent_failed_activity_for_contract(tables, 'fetch_resource', contract_custom_id_ps_str): continue
                                
                                log.info(f"    [Travail Général] Tentative d'achat via contrat public {contract_custom_id_ps_str} depuis {seller_bldg_id_ps} pour {res_name_display}.")
                                path_seller_ps = get_path_between_points(citizen_position, _get_building_position_coords(seller_bldg_rec_ps), transport_api_url)
                                if path_seller_ps and path_seller_ps.get('success'):
                                    if try_create_resource_fetching_activity(
                                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                                        contract_custom_id_ps_str, seller_bldg_id_ps, workplace_custom_id,
                                        input_res_id, amount_to_buy_ps, path_seller_ps, now_utc_dt, resource_defs
                                    ):
                                        log.info(f"      [Travail Général] Activité 'fetch_resource' créée pour contrat public {contract_custom_id_ps_str}.")
                                        return True
                    
                    # Prio 4: Generic fetch_resource (fallback)
                    log.info(f"    [Travail Général] Aucune source contractuelle trouvée pour {res_name_display}. Tentative de récupération générique.")
                    if try_create_resource_fetching_activity(
                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                        None, None, workplace_custom_id, input_res_id, 
                        min(needed_amount, 10.0), # Fetch needed or up to 10 units
                        None, now_utc_dt, resource_defs
                    ):
                        log.info(f"{LogColors.OKGREEN}[Travail Général] Citoyen {citizen_name} va chercher {res_name_display} pour {workplace_custom_id} (générique).{LogColors.ENDC}")
                        return True
                    # If one fetch is initiated, return True for this cycle.
    
    # 3. Try to deliver excess output to storage
    current_workplace_total_load, current_workplace_stock_map_for_delivery = get_building_storage_details(tables, workplace_custom_id, workplace_operator)
    if storage_capacity > 0 and (current_workplace_total_load / storage_capacity) > STORAGE_FULL_THRESHOLD:
        log.info(f"{LogColors.OKCYAN}[Travail Général] {workplace_custom_id} est >{STORAGE_FULL_THRESHOLD*100:.0f}% plein. Vérification des contrats de stockage.{LogColors.ENDC}")
        # Iterate through current_workplace_stock_map_for_delivery
        for res_id_to_deliver, amount_at_workplace in current_workplace_stock_map_for_delivery.items():
            if amount_at_workplace <= 0.1: continue
            
            # Find storage_query contract for this resource, operator, and workplace
            storage_query_contracts = tables['contracts'].all(
                formula=f"AND({{Type}}='storage_query', {{Buyer}}='{_escape_airtable_value(workplace_operator)}', {{BuyerBuilding}}='{_escape_airtable_value(workplace_custom_id)}', {{ResourceType}}='{_escape_airtable_value(res_id_to_deliver)}', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
            )
            if storage_query_contracts:
                sq_contract = storage_query_contracts[0]
                storage_facility_id = sq_contract['fields'].get('SellerBuilding') # This is the ToBuilding for deliver_to_storage
                if storage_facility_id:
                    storage_facility_record = get_building_record(tables, storage_facility_id)
                    if storage_facility_record:
                        # Check capacity at storage facility for this resource under this contract
                        _, facility_stock_map = get_building_storage_details(tables, storage_facility_id, workplace_operator)
                        current_stored_in_facility = facility_stock_map.get(res_id_to_deliver, 0.0)
                        contracted_capacity = float(sq_contract['fields'].get('TargetAmount', 0))
                        remaining_facility_capacity_for_contract = contracted_capacity - current_stored_in_facility

                        if remaining_facility_capacity_for_contract > 0.1:
                            amount_to_deliver = min(amount_at_workplace * 0.5, # Deliver up to 50% of stock
                                                    get_citizen_effective_carry_capacity(citizen_record) - get_citizen_current_load(tables, citizen_username),
                                                    remaining_facility_capacity_for_contract)
                            amount_to_deliver = float(f"{amount_to_deliver:.4f}")

                            if amount_to_deliver >= 0.1:
                                storage_facility_pos = _get_building_position_coords(storage_facility_record)
                                if citizen_position and storage_facility_pos:
                                    path_to_storage = get_path_between_points(citizen_position, storage_facility_pos, transport_api_url)
                                    if path_to_storage and path_to_storage.get('success'):
                                        if try_create_deliver_to_storage_activity(
                                            tables, citizen_record, workplace_record, storage_facility_record,
                                            [{"ResourceId": res_id_to_deliver, "Amount": amount_to_deliver}],
                                            sq_contract['fields'].get('ContractId', sq_contract['id']),
                                            path_to_storage, now_utc_dt
                                        ):
                                            log.info(f"{LogColors.OKGREEN}[Travail Général] Citoyen {citizen_name} va livrer {amount_to_deliver:.2f} de {res_id_to_deliver} à l'entrepôt {storage_facility_id}.{LogColors.ENDC}")
                                            return True
    return False


def _handle_forestieri_daytime_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 40: Handles Forestieri specific activities (work/leisure) based on their schedule."""
    if citizen_social_class != "Forestieri":
        return False
    
    workplace_record_forestieri = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    workplace_type_forestieri = workplace_record_forestieri['fields'].get('Type') if workplace_record_forestieri else None

    if is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type_forestieri):
        # Forestieri "work" could be specific tasks or managing their affairs.
        # For now, let's assume if they have a workplace, they go there.
        # Otherwise, they might engage in trade-related leisure or specific Forestieri tasks.
        # This part can be expanded with specific Forestieri work logic.
        # If they have a workplace record (e.g. a rented stall or office):
        workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
        if workplace_record:
            if not citizen_position: return False
            workplace_pos = _get_building_position_coords(workplace_record)
            if not workplace_pos: return False
            if _calculate_distance_meters(citizen_position, workplace_pos) > 20: # Not at workplace
                 # Create goto_work for Forestieri to their specific workplace
                path_to_work = get_path_between_points(citizen_position, workplace_pos, transport_api_url)
                if path_to_work and path_to_work.get('success'):
                    workplace_custom_id_val = workplace_record['fields'].get('BuildingId')
                    if try_create_goto_work_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, workplace_custom_id_val, path_to_work, None, resource_defs, False, citizen_position_str, now_utc_dt):
                        log.info(f"{LogColors.OKGREEN}[Forestieri Travail] Forestiero {citizen_name} va à son lieu de travail {workplace_custom_id_val}.{LogColors.ENDC}")
                        return True
            else: # At workplace
                # Placeholder for Forestieri-specific work/production at their workplace
                log.info(f"{LogColors.OKBLUE}[Forestieri Travail] Forestiero {citizen_name} est à son lieu de travail. Logique de travail spécifique à implémenter.{LogColors.ENDC}")
                # Could try production if applicable, or a specific "manage_trade" activity.
                # For now, if at workplace during work time, let it fall through to idle if no specific task.
                pass # Fall through to allow other non-work leisure if no specific work task here
        # If no workplace, they engage in leisure during their "work" hours.
        # Fall through to general leisure logic.

    if is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        log.info(f"{LogColors.OKCYAN}[Forestieri Loisirs] Forestiero {citizen_name}: Période de loisirs. Évaluation des tâches.{LogColors.ENDC}")
        if process_forestieri_daytime_activity( # This function handles general Forestieri leisure
            tables, citizen_record, citizen_position, now_utc_dt, resource_defs, building_type_defs, transport_api_url, IDLE_ACTIVITY_DURATION_HOURS
        ):
            return True
    return False


def _handle_shopping_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 50: Handles personal shopping tasks if it's leisure time."""
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return False
    # Nobili have a lot of leisure time, shopping is a key activity for them.
    # Other classes also shop during their leisure.

    current_load = get_citizen_current_load(tables, citizen_username)
    max_capacity = get_citizen_effective_carry_capacity(citizen_record)
    if current_load >= max_capacity * 0.9:
        return False 
    
    home_record = get_citizen_home(tables, citizen_username)
    # Forestieri might shop even without a permanent "home" record in Venice, goods go to inventory.
    if not home_record and citizen_social_class != "Forestieri":
         log.info(f"{LogColors.OKBLUE}[Shopping] Citoyen {citizen_name} ({citizen_social_class}): Pas de domicile, ne peut pas faire d'achats (sauf Forestieri).{LogColors.ENDC}")
         return False

    log.info(f"{LogColors.OKCYAN}[Shopping] Citoyen {citizen_name} ({citizen_social_class}): Période de loisirs, évaluation shopping.{LogColors.ENDC}")
    
    # citizen_social_class is now a parameter
    citizen_max_tier_access = SOCIAL_CLASS_VALUE.get(citizen_social_class, 1)
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    remaining_capacity = max_capacity - current_load

    # Simplified: find any public_sell contract for a resource the citizen can afford and carry, within their tier.
    shoppable_resources_ids = [res_id for res_id, res_data in resource_defs.items() 
                               if int(res_data.get('tier', 0) or 0) <= citizen_max_tier_access and int(res_data.get('tier', 0) or 0) > 0]
    if not shoppable_resources_ids: return False

    # Randomly pick a resource type to shop for to add variety
    random.shuffle(shoppable_resources_ids)

    for res_id_to_buy in shoppable_resources_ids:
        active_sell_contracts_formula = f"AND({{Type}}='public_sell', {{ResourceType}}='{_escape_airtable_value(res_id_to_buy)}', {{EndAt}}>'{now_utc_dt.isoformat()}', {{TargetAmount}}>0)"
        try:
            sell_contracts = tables['contracts'].all(formula=active_sell_contracts_formula, sort=[('PricePerResource', 'asc')]) # Cheaper first
            if not sell_contracts: continue

            for contract_rec in sell_contracts:
                seller_building_id = contract_rec['fields'].get('SellerBuilding')
                if not seller_building_id: continue
                
                seller_building_rec = get_building_record(tables, seller_building_id)
                if not seller_building_rec: continue

                price_per_unit = float(contract_rec['fields'].get('PricePerResource', 0))
                contract_amount_available = float(contract_rec['fields'].get('TargetAmount', 0))
                if price_per_unit <= 0: continue

                max_affordable = citizen_ducats / price_per_unit
                amount_to_buy = min(remaining_capacity, contract_amount_available, max_affordable, 5.0) # Buy up to 5 units
                amount_to_buy = float(f"{amount_to_buy:.4f}")

                if amount_to_buy >= 0.1:
                    if not citizen_position: continue # Need citizen position for path
                    seller_pos = _get_building_position_coords(seller_building_rec)
                    if not seller_pos: continue

                    path_to_seller = get_path_between_points(citizen_position, seller_pos, transport_api_url)
                    if path_to_seller and path_to_seller.get('success'):
                        home_custom_id_for_delivery = home_record['fields'].get('BuildingId')
                        contract_custom_id_for_sell = contract_rec['fields'].get('ContractId', contract_rec['id'])
                        # If homeless, home_custom_id_for_delivery will be None.
                        # The fetch_resource activity will handle this by putting items in inventory,
                        # and the processor will correctly assign ownership to the citizen.
                        if try_create_resource_fetching_activity(
                            tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                            contract_custom_id_for_sell, seller_building_id, 
                            home_custom_id_for_delivery, # This can be None for homeless
                            res_id_to_buy, amount_to_buy, path_to_seller, now_utc_dt, resource_defs
                        ):
                            log.info(f"{LogColors.OKGREEN}[Shopping] Citoyen {citizen_name}: Activité d'achat créée pour {res_id_to_buy}. Destination: {home_custom_id_for_delivery or 'Inventaire'}.{LogColors.ENDC}")
                            return True
            # If no suitable contract found for this resource_type, loop to next resource_type
        except Exception as e_shop:
            log.error(f"Erreur pendant le shopping pour {res_id_to_buy}: {e_shop}")
            continue # Try next resource
    return False


def _handle_porter_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 60: Handles Porter tasks if it's work time and they are at Guild Hall."""
    # Porters work at a 'porter_guild_hall'. Check work time for this specific building type.
    # We need to know if the citizen *is* a porter at a guild hall first.
    # This handler is called if the citizen is at their guild_hall.
    # So, we can assume workplace_type is 'porter_guild_hall' if this handler is reached appropriately.
    # The check for being at the guild hall is done before calling process_porter_activity.
    # For the time check here, we need the workplace_type if they have one.
    
    workplace_record_porter = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    workplace_type_porter = None
    is_porter_at_guild_hall = False

    if workplace_record_porter and workplace_record_porter['fields'].get('Type') == 'porter_guild_hall':
        workplace_type_porter = 'porter_guild_hall'
        # Check if citizen is physically at the guild hall
        guild_hall_pos = _get_building_position_coords(workplace_record_porter)
        if citizen_position and guild_hall_pos and _calculate_distance_meters(citizen_position, guild_hall_pos) < 20:
            is_porter_at_guild_hall = True

    if not is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type_porter):
        return False
    
    if not is_porter_at_guild_hall: # If not at guild hall, this handler shouldn't proceed.
        return False

    # The original logic for getting porter_guild_hall_operated can remain,
    # as process_porter_activity uses it.
    porter_guild_hall_operated = workplace_record_porter # Since we've established they work at one.
    try:
        # Assuming RunBy is the correct field for operator
        buildings_run_by_citizen = tables['buildings'].all(formula=f"AND({{RunBy}}='{_escape_airtable_value(citizen_username)}', {{Type}}='porter_guild_hall')")
        if buildings_run_by_citizen:
            porter_guild_hall_operated = buildings_run_by_citizen[0]
    except Exception as e_fetch_porter_hall:
        log.error(f"Erreur vérification si {citizen_username} opère un Porter Guild Hall: {e_fetch_porter_hall}")
        return False
        
    if not porter_guild_hall_operated: return False # Not a porter or doesn't operate a guild hall

    guild_hall_pos = _get_building_position_coords(porter_guild_hall_operated)
    if not citizen_position or not guild_hall_pos or _calculate_distance_meters(citizen_position, guild_hall_pos) > 20:
        return False # Not at their guild hall

    log.info(f"{LogColors.OKCYAN}[Porteur] Citoyen {citizen_name} est à son Porter Guild Hall. Délégation à process_porter_activity.{LogColors.ENDC}")
    # process_porter_activity needs now_venice_dt
    if process_porter_activity(
        tables, citizen_record, porter_guild_hall_operated, resource_defs, building_type_defs,
        now_venice_dt, transport_api_url, api_base_url
    ):
        return True # Activity created by porter logic
    return False

def _handle_general_goto_work(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 70: Handles general goto_work if it's work time, citizen has a workplace and is not there."""
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record: return False # No workplace, so no goto_work

    workplace_type = workplace_record['fields'].get('Type')
    if not is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type):
        return False # Not work time for this specific workplace or class

    # Nobili check is handled by is_work_time if it falls back to class schedule.
    # If a Nobili is an "employee" at a building with specific hours, is_work_time would use building hours.
    # To be absolutely sure Nobili don't get a goto_work from this general handler:
    if citizen_social_class == "Nobili" and not BUILDING_TYPE_WORK_SCHEDULES.get(workplace_type):
        return False

    if not citizen_position: return False
    workplace_pos = _get_building_position_coords(workplace_record)
    if not workplace_pos: return False

    if _calculate_distance_meters(citizen_position, workplace_pos) < 20:
        return False # Already at workplace

    log.info(f"{LogColors.OKCYAN}[Aller au Travail] Citoyen {citizen_name} ({citizen_social_class}) n'est pas à son lieu de travail. Création goto_work.{LogColors.ENDC}")
    path_to_work = get_path_between_points(citizen_position, workplace_pos, transport_api_url)
    if path_to_work and path_to_work.get('success'):
        workplace_custom_id_val = workplace_record['fields'].get('BuildingId')
        home_record = get_citizen_home(tables, citizen_username) # For food pickup logic
        is_at_home_val = False # Assume not at home unless checked
        if home_record and citizen_position:
            home_pos = _get_building_position_coords(home_record)
            if home_pos: is_at_home_val = _calculate_distance_meters(citizen_position, home_pos) < 20
        
        if try_create_goto_work_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            workplace_custom_id_val, path_to_work, home_record, resource_defs,
            is_at_home_val, citizen_position_str_val, now_utc_dt
        ):
            return True
    return False

# --- Main Activity Processing Function ---

def process_citizen_activity(
    tables: Dict[str, Table],
    citizen_record: Dict,
    # is_night: bool, # This will be determined internally based on class schedule
    resource_defs: Dict,
    building_type_defs: Dict,
    now_venice_dt: datetime.datetime,
    now_utc_dt: datetime.datetime,
    transport_api_url: str,
    api_base_url: str
) -> bool:
    """Process activity creation for a single citizen based on prioritized handlers."""
    
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_id = citizen_record['id']
    
    if not citizen_custom_id: log.error(f"Missing CitizenId: {citizen_airtable_id}"); return False
    if not citizen_username: citizen_username = citizen_custom_id # Fallback

    citizen_name = f"{citizen_record['fields'].get('FirstName', '')} {citizen_record['fields'].get('LastName', '')}".strip() or citizen_username
    citizen_social_class = citizen_record['fields'].get('SocialClass', 'Facchini') # Default if not set
    log.info(f"{LogColors.HEADER}Processing Citizen: {citizen_name} (ID: {citizen_custom_id}, User: {citizen_username}, Class: {citizen_social_class}){LogColors.ENDC}")

    citizen_position_str = citizen_record['fields'].get('Position')
    citizen_position: Optional[Dict[str, float]] = None
    try:
        if citizen_position_str: citizen_position = json.loads(citizen_position_str)
        if not citizen_position:
            point_str = citizen_record['fields'].get('Point')
            if point_str and isinstance(point_str, str):
                parts = point_str.split('_')
                if len(parts) >= 3: citizen_position = {"lat": float(parts[1]), "lng": float(parts[2])}
    except Exception: pass # Ignore parsing errors, will be handled

    if not citizen_position:
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_custom_id} has no position. Assigning random.{LogColors.ENDC}")
        citizen_position = _fetch_and_assign_random_starting_position(tables, citizen_record, api_base_url)
        if citizen_position: # Update citizen_position_str if new position assigned
            citizen_position_str = json.dumps(citizen_position)
        else:
            log.warning(f"{LogColors.WARNING}Failed to assign random position. Creating idle.{LogColors.ENDC}")
            # (Idle creation moved to end of function)

    # Determine hunger state once
    is_hungry = False
    ate_at_str = citizen_record['fields'].get('AteAt')
    if ate_at_str:
        try:
            ate_at_dt = datetime.datetime.fromisoformat(ate_at_str.replace('Z', '+00:00'))
            if ate_at_dt.tzinfo is None: ate_at_dt = pytz.UTC.localize(ate_at_dt)
            if (now_utc_dt - ate_at_dt) > datetime.timedelta(hours=12): is_hungry = True
        except ValueError: is_hungry = True 
    else: is_hungry = True
    citizen_record['is_hungry'] = is_hungry # Add to record for handlers

    # Define activity handlers in order of priority
    # Each handler function must accept all these parameters, including citizen_social_class.
    # The 'is_night' parameter is effectively replaced by class-specific time checks within handlers.
    handler_args = (
        tables, citizen_record, False, resource_defs, building_type_defs, # Passing False for old is_night, it's not used
        now_venice_dt, now_utc_dt, transport_api_url, api_base_url,
        citizen_position, citizen_custom_id, citizen_username, citizen_airtable_id, citizen_name, citizen_position_str,
        citizen_social_class # Pass social_class to handlers
    )

    # Re-prioritized handlers based on new time blocks and needs
    activity_handlers = [
        # Highest priority: Critical needs & specific roles
        (1, _handle_leave_venice, "Départ de Venise (Forestieri)"),
        (2, _handle_eat_from_inventory, "Manger depuis l'inventaire (si loisir/pause)"),
        (3, _handle_eat_at_home_or_goto, "Manger à la maison / Aller à la maison (si loisir/pause)"),
        (4, _handle_emergency_fishing, "Pêche d'urgence (Facchini affamé, pas en repos)"),
        (5, _handle_shop_for_food_at_retail, "Acheter nourriture au détail (si faim, loisir)"), # Moved up
        (6, _handle_eat_at_tavern_or_goto, "Manger à la taverne / Aller à la taverne (si loisir/pause)"),
        
        # Shelter / Rest is a primary driver based on time
        (15, _handle_night_shelter, "Abri nocturne / Repos (selon horaire de classe)"),

        # Work-related tasks, only during work hours
        (20, _handle_deposit_inventory_at_work, "Déposer inventaire plein au travail (si travail/proche)"), # Check if near work time
        (30, _handle_construction_tasks, "Tâches de construction (si travail)"),
        (31, _handle_production_and_general_work_tasks, "Production et tâches générales (si travail)"),
        (32, _handle_fishing, "Pêche régulière (Facchini pêcheur, si travail)"), # Regular fishing as work

        # Forestieri specific activities (can be work or leisure for them)
        (40, _handle_forestieri_daytime_tasks, "Tâches spécifiques Forestieri (selon leur horaire)"),

        # General tasks during leisure or work time if applicable
        (50, _handle_shopping_tasks, "Shopping personnel (si loisir)"), # General shopping
        (60, _handle_porter_tasks, "Tâches de porteur (si travail, au Guild Hall)"),
        (65, _handle_check_business_status, "Vérifier le statut de l'entreprise (si travail/loisir)"),
        
        # Movement to work if not already there and it's work time
        (70, _handle_general_goto_work, "Aller au travail (général, si heure de travail)"),
    ]

    for priority, handler_func, description in activity_handlers:
        log.info(f"{LogColors.OKBLUE}[Prio: {priority}] Citizen {citizen_name} ({citizen_social_class}): Evaluating '{description}'...{LogColors.ENDC}")
        try:
            if handler_func(*handler_args):
                log.info(f"{LogColors.OKGREEN}Citizen {citizen_name} ({citizen_social_class}): Activity created by '{description}'.{LogColors.ENDC}")
                return True
        except Exception as e_handler:
            log.error(f"{LogColors.FAIL}Citizen {citizen_name} ({citizen_social_class}): ERREUR dans handler '{description}': {e_handler}{LogColors.ENDC}")
            import traceback
            log.error(traceback.format_exc())
            # Continue to next handler if one fails, to not block all activity creation

    # Fallback logic if no activity was created by primary handlers
    log.info(f"{LogColors.OKBLUE}Citizen {citizen_name} ({citizen_social_class}): No specific activity from primary handlers. Evaluating fallback.{LogColors.ENDC}")

    workplace_record_fb = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    workplace_type_fb = workplace_record_fb['fields'].get('Type') if workplace_record_fb else None

    if is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type_fb):
        log.info(f"{LogColors.OKBLUE}Fallback for {citizen_name}: Is work time, but no work task. Creating 'idle'.{LogColors.ENDC}")
    elif is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        log.info(f"{LogColors.OKBLUE}Fallback for {citizen_name}: Is leisure time, but no leisure task. Creating 'idle'.{LogColors.ENDC}")
    else: # Not work time AND not leisure time. "Consider it rest".
        log.info(f"{LogColors.OKBLUE}Fallback for {citizen_name}: Not work or leisure. Attempting 'rest' via _handle_night_shelter.{LogColors.ENDC}")
        # _handle_night_shelter itself checks is_rest_time_for_class.
        # If it's not scheduled rest time, it will return False.
        if _handle_night_shelter(*handler_args): # Pass the same handler_args
            log.info(f"{LogColors.OKGREEN}Fallback for {citizen_name}: 'rest' activity successfully created by _handle_night_shelter.{LogColors.ENDC}")
            return True # Activity created by the fallback rest attempt
        else:
            log.info(f"{LogColors.OKBLUE}Fallback for {citizen_name}: _handle_night_shelter did not create a rest activity. Creating 'idle'.{LogColors.ENDC}")
    
    # If we reach here, it means we decided to create 'idle' or the fallback rest attempt failed.
    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
    try_create_idle_activity(
        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
        end_date_iso=idle_end_time_iso,
        reason_message="No specific tasks available after evaluating all priorities, or fallback rest attempt failed.",
        current_time_utc=now_utc_dt
    )
    return True
