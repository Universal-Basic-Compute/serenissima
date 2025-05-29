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
    is_nighttime as is_nighttime_helper,
    is_shopping_time as is_shopping_time_helper,
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 4: Handles emergency fishing if citizen lives in fisherman's cottage and is starving."""
    home_record = get_citizen_home(tables, citizen_username)
    if not (home_record and home_record['fields'].get('Type') == 'fisherman_s_cottage'):
        return False # Not a fisherman

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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 1: Handles Forestieri departure."""
    if not citizen_record['fields'].get('HomeCity') or not citizen_record['fields'].get('HomeCity', '').strip():
        return False # Not a Forestieri or HomeCity not set

    trust_score_consiglio = get_relationship_trust_score(tables, citizen_username, "ConsiglioDeiDieci")
    departure_condition_met = trust_score_consiglio < -50 # Example condition

    if not departure_condition_met:
        return False

    log.info(f"{LogColors.OKCYAN}[Départ] Citoyen {citizen_name}: Conditions de départ remplies (score de confiance: {trust_score_consiglio}).{LogColors.ENDC}")

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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 2: Handles eating from inventory if hungry."""
    if not citizen_record['is_hungry']: return False # is_hungry flag set by main function

    log.info(f"{LogColors.OKCYAN}[Faim] Citoyen {citizen_name}: Est affamé. Vérification de l'inventaire.{LogColors.ENDC}")
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 3 & 4: Handles eating at home or going home to eat if hungry."""
    if not citizen_record['is_hungry']: return False

    home_record = get_citizen_home(tables, citizen_username)
    if not home_record: return False

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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 5 & 6: Handles eating at tavern or going to tavern to eat if hungry."""
    if not citizen_record['is_hungry']: return False
    if not citizen_position: return False # Need position to find tavern
    
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    if citizen_ducats < TAVERN_MEAL_COST_ESTIMATE: return False

    closest_tavern_record = get_closest_inn(tables, citizen_position)
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str]
) -> bool:
    """Prio 10 & 11: Handles depositing full inventory at work."""
    current_load = get_citizen_current_load(tables, citizen_username)
    citizen_max_capacity = get_citizen_effective_carry_capacity(citizen_record)
    if current_load <= (citizen_max_capacity * 0.7): return False

    log.info(f"{LogColors.OKCYAN}[Inventaire Plein] Citoyen {citizen_name}: Inventaire >70% plein. Vérification lieu de travail.{LogColors.ENDC}")
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 12: Handles checking business status if manager and not checked recently."""
    if is_night: # Managers usually check during the day
        return False

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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 15-18: Handles finding night shelter (home or inn)."""
    if not is_night: return False
    if not citizen_position: return False # Need position

    log.info(f"{LogColors.OKCYAN}[Nuit] Citoyen {citizen_name}: Il fait nuit. Évaluation abri.{LogColors.ENDC}")
    home_city = citizen_record['fields'].get('HomeCity')
    is_forestieri = home_city and home_city.strip()

    # Calculate end time for rest (next 6 AM Venice time)
    venice_now_for_rest = now_utc_dt.astimezone(VENICE_TIMEZONE)
    if venice_now_for_rest.hour < NIGHT_END_HOUR_FOR_STAY:
        end_time_venice_rest = venice_now_for_rest.replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
    else:
        end_time_venice_rest = (venice_now_for_rest + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
    stay_end_time_utc_iso = end_time_venice_rest.astimezone(pytz.UTC).isoformat()

    if not is_forestieri: # Resident logic
        home_record = get_citizen_home(tables, citizen_username)
        if not home_record: # Homeless resident
            log.info(f"{LogColors.WARNING}[Nuit] Citoyen {citizen_name} (résident): Sans domicile. Recherche d'une auberge.{LogColors.ENDC}")
            # Fall through to inn logic for homeless resident
        else:
            home_name_display = _get_bldg_display_name_module(tables, home_record)
            home_pos = _get_building_position_coords(home_record)
            home_custom_id_val = home_record['fields'].get('BuildingId', home_record['id'])
            if not home_pos or not home_custom_id_val: return False # Home data invalid

            if _calculate_distance_meters(citizen_position, home_pos) < 20: # Is at home
                if try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, home_custom_id_val, "home", stay_end_time_utc_iso, now_utc_dt):
                    log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'rest' (maison) créée à {home_name_display}.{LogColors.ENDC}")
                    return True
            else: # Not at home, go home
                path_to_home = get_path_between_points(citizen_position, home_pos, transport_api_url)
                if path_to_home and path_to_home.get('success'):
                    if try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, home_custom_id_val, path_to_home, now_utc_dt):
                        log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'goto_home' créée vers {home_name_display}.{LogColors.ENDC}")
                        return True
            return False # Failed to rest or go home

    # Forestieri or Homeless Resident logic (Inn)
    # This part is reached if is_forestieri is true, or if resident is homeless
    log.info(f"{LogColors.OKCYAN}[Nuit] Citoyen {citizen_name} ({'Forestieri' if is_forestieri else 'Résident sans abri'}): Recherche d'une auberge.{LogColors.ENDC}")
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 5 (new): Handles shopping for food at retail_food buildings if hungry and has a home."""
    if not citizen_record['is_hungry']: return False
    if not citizen_position: return False # Need current position to find shops

    home_record = get_citizen_home(tables, citizen_username)
    if not home_record:
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Citoyen {citizen_name}: Sans domicile, ne peut pas acheter de nourriture à emporter.{LogColors.ENDC}")
        return False
    
    home_custom_id = home_record['fields'].get('BuildingId')
    if not home_custom_id: return False # Home needs a valid ID

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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 80: Handles regular fishing if citizen lives in fisherman's cottage and has no other work."""
    # This handler runs if no higher priority tasks (work, urgent needs) are found.
    # It's a fallback productive activity for fishermen.
    
    home_record = get_citizen_home(tables, citizen_username)
    if not (home_record and home_record['fields'].get('Type') == 'fisherman_s_cottage'):
        return False # Not a fisherman

    # Optional: Add conditions like not being too full of fish already, or time of day.
    # For now, assume they will fish if idle and a fisherman.

    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Pêche] {citizen_name} n'a pas de position. Impossible de pêcher.{LogColors.ENDC}")
        return False

    log.info(f"{LogColors.OKCYAN}[Pêche] {citizen_name} (pêcheur) est inoccupé(e). Recherche d'un lieu de pêche.{LogColors.ENDC}")
    
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 20-23: Handles construction related tasks."""
    if is_night: # Construction usually not at night
        return False

    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record or workplace_record['fields'].get('SubCategory') != 'construction':
        return False # Not at a construction workplace or no workplace

    # Citizen must be at the construction workshop to initiate construction logic
    workplace_pos = _get_building_position_coords(workplace_record)
    if not citizen_position or not workplace_pos or _calculate_distance_meters(citizen_position, workplace_pos) > 20:
        # If not at construction workshop, a general goto_work (lower priority) might handle it,
        # or a specific goto_construction_site if that's a distinct state.
        # For now, construction_logic expects the worker to be at their workshop.
        log.info(f"{LogColors.OKBLUE}[Construction] Citoyen {citizen_name} n'est pas à son atelier de construction. La logique de construction ne sera pas déclenchée par ce handler.{LogColors.ENDC}")
        return False
    
    log.info(f"{LogColors.OKCYAN}[Construction] Citoyen {citizen_name} est à son atelier de construction. Délégation à handle_construction_worker_activity.{LogColors.ENDC}")
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str]
) -> bool:
    """Prio 30-35: Handles production, restocking for general workplaces."""
    if is_night: # Productive work usually not at night
        return False

    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record:
        return False # No workplace

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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 40: Handles Forestieri daytime activities."""
    if is_night or not (citizen_record['fields'].get('HomeCity') and citizen_record['fields'].get('HomeCity', '').strip()):
        return False # Not daytime or not a Forestieri

    log.info(f"{LogColors.OKCYAN}[Forestieri Jour] Citoyen {citizen_name}: Évaluation des tâches de jour.{LogColors.ENDC}")
    if process_forestieri_daytime_activity(
        tables, citizen_record, citizen_position, now_utc_dt, resource_defs, building_type_defs, transport_api_url, IDLE_ACTIVITY_DURATION_HOURS
    ):
        return True
    return False

def _handle_shopping_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str]
) -> bool:
    """Prio 50: Handles personal shopping tasks."""
    if is_night or not is_shopping_time_helper(now_venice_dt):
        return False

    current_load = get_citizen_current_load(tables, citizen_username)
    max_capacity = get_citizen_effective_carry_capacity(citizen_record)
    if current_load >= max_capacity * 0.9: # If inventory is nearly full
        return False 
    
    home_record = get_citizen_home(tables, citizen_username)
    if not home_record: return False # Needs a home to deliver to

    log.info(f"{LogColors.OKCYAN}[Shopping] Citoyen {citizen_name}: C'est l'heure du shopping.{LogColors.ENDC}")
    
    citizen_social_class = citizen_record['fields'].get('SocialClass', 'Facchini')
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
                        if try_create_resource_fetching_activity(
                            tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                            contract_custom_id_for_sell, seller_building_id, home_custom_id_for_delivery,
                            res_id_to_buy, amount_to_buy, path_to_seller, now_utc_dt, resource_defs
                        ):
                            log.info(f"{LogColors.OKGREEN}[Shopping] Citoyen {citizen_name}: Activité d'achat créée pour {res_id_to_buy}.{LogColors.ENDC}")
                            return True
            # If no suitable contract found for this resource_type, loop to next resource_type
        except Exception as e_shop:
            log.error(f"Erreur pendant le shopping pour {res_id_to_buy}: {e_shop}")
            continue # Try next resource
    return False


def _handle_porter_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime.datetime, now_utc_dt: datetime.datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str]
) -> bool:
    """Prio 60: Handles Porter tasks if at Guild Hall."""
    if is_night: return False

    # Check if citizen operates a Porter Guild Hall
    porter_guild_hall_operated = None
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
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str]
) -> bool:
    """Prio 70: Handles general goto_work if citizen has a workplace and is not there."""
    if is_night: return False # Usually no work at night unless specific job

    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record: return False # No workplace

    if not citizen_position: return False # Needs position
    workplace_pos = _get_building_position_coords(workplace_record)
    if not workplace_pos: return False # Workplace has no position

    if _calculate_distance_meters(citizen_position, workplace_pos) < 20:
        return False # Already at workplace

    log.info(f"{LogColors.OKCYAN}[Aller au Travail] Citoyen {citizen_name} n'est pas à son lieu de travail. Création goto_work.{LogColors.ENDC}")
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
    citizen_record: Dict, # Renamed from citizen to citizen_record for clarity
    is_night: bool, 
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
    log.info(f"{LogColors.HEADER}Processing Citizen: {citizen_name} (ID: {citizen_custom_id}, User: {citizen_username}){LogColors.ENDC}")

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
    # Each handler function must accept all these parameters.
    handler_args = (
        tables, citizen_record, is_night, resource_defs, building_type_defs,
        now_venice_dt, now_utc_dt, transport_api_url, api_base_url,
        citizen_position, citizen_custom_id, citizen_username, citizen_airtable_id, citizen_name, citizen_position_str
    )

    activity_handlers = [
        (1, _handle_leave_venice, "Départ de Venise (Forestieri)"), # Prio 1
        (2, _handle_eat_from_inventory, "Manger depuis l'inventaire"), # Prio 2
        (3, _handle_eat_at_home_or_goto, "Manger à la maison / Aller à la maison pour manger"), # Prio 3
        (4, _handle_emergency_fishing, "Pêche d'urgence (faim critique)"), # Prio 4 (Nouveau)
        (5, _handle_shop_for_food_at_retail, "Acheter de la nourriture au détail"), # Prio 5 (anciennement 5)
        (6, _handle_eat_at_tavern_or_goto, "Manger à la taverne / Aller à la taverne pour manger"), # Prio 6 & 7 (anciennement 6 & 7)
        (10, _handle_deposit_inventory_at_work, "Déposer inventaire plein au travail"), # Prio 10 & 11
        (12, _handle_check_business_status, "Vérifier le statut de l'entreprise"), # Prio 12
        (15, _handle_night_shelter, "Abri nocturne (maison/auberge)"), # Prio 15-18
        (20, _handle_construction_tasks, "Tâches de construction"), # Prio 20-23
        (30, _handle_production_and_general_work_tasks, "Production et tâches générales de travail"), # Prio 30-35
        (40, _handle_forestieri_daytime_tasks, "Tâches de jour (Forestieri)"), # Prio 40
        (50, _handle_shopping_tasks, "Shopping personnel"), # Prio 50
        (60, _handle_porter_tasks, "Tâches de porteur (au Guild Hall)"), # Prio 60
        (70, _handle_general_goto_work, "Aller au travail (général)"), # Prio 70
        (80, _handle_fishing, "Pêche (activité par défaut pour pêcheur)"), # Prio 80 (Nouveau)
    ]

    for priority, handler_func, description in activity_handlers:
        log.info(f"{LogColors.OKBLUE}[Prio: {priority}] Citizen {citizen_name}: Evaluating '{description}'...{LogColors.ENDC}")
        if handler_func(*handler_args):
            log.info(f"{LogColors.OKGREEN}Citizen {citizen_name}: Activity created by '{description}'.{LogColors.ENDC}")
            return True

    # Fallback: If no activity was created by any handler
    log.info(f"{LogColors.OKBLUE}Citizen {citizen_name}: No specific activity created. Creating 'idle' activity.{LogColors.ENDC}")
    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
    try_create_idle_activity(
        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
        end_date_iso=idle_end_time_iso,
        reason_message="No specific tasks available after evaluating all priorities.",
        current_time_utc=now_utc_dt
    )
    return True
