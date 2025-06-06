import logging
import json
from datetime import datetime, timedelta
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
    get_closest_food_provider, # Import the new function
    get_closest_building_of_type, # Import for finding specific building types like "inn"
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
    try_create_initiate_building_project_activity, # Import new creator for building projects
    try_create_fetch_from_storage_activity,
    try_create_fishing_activity, # Import new creator
    try_create_manage_public_dock_activity, # Import new creator
    # try_create_fetch_from_galley_activity is not used by process_citizen_activity
)
from backend.engine.activity_creators.send_message_creator import try_create as try_create_send_message_chain # Import for send_message
from backend.engine.activity_creators.manage_public_storage_offer_creator import try_create as try_create_manage_public_storage_offer_chain

# Import the specific processor function

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
_water_graph_last_fetch_time: Optional[datetime] = None
_WATER_GRAPH_CACHE_TTL_SECONDS = 300 # Cache for 5 minutes

def _get_water_graph_data(api_base_url: str) -> Optional[Dict]:
    """Fetches water graph data from the API, with caching."""
    global _water_graph_cache, _water_graph_last_fetch_time
    
    now = datetime.now(pytz.UTC)
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
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> Optional[Dict]:
    """Prio 4: Handles emergency fishing if citizen is Facchini, starving, and it's not rest time."""
    if citizen_social_class != "Facchini": # Only Facchini do emergency fishing for now
        return None
    if is_rest_time_for_class(citizen_social_class, now_venice_dt): # No fishing during rest
        return None

    ate_at_str = citizen_record['fields'].get('AteAt')
    is_starving = True # Assume starving if no AteAt or very old
    if ate_at_str:
        try:
            ate_at_dt = dateutil_parser.isoparse(ate_at_str.replace('Z', '+00:00'))
            if ate_at_dt.tzinfo is None: ate_at_dt = pytz.UTC.localize(ate_at_dt)
            if (now_utc_dt - ate_at_dt) <= timedelta(hours=24): # More than 24 hours
                is_starving = False
        except ValueError: pass # Invalid date format, assume starving
    
    if not is_starving:
        return None

    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Pêche Urgence] {citizen_name} n'a pas de position. Impossible de pêcher.{LogColors.ENDC}")
        return None

    log.info(f"{LogColors.OKCYAN}[Pêche Urgence] {citizen_name} est affamé(e) et vit dans un fisherman_s_cottage. Recherche d'un lieu de pêche.{LogColors.ENDC}")
    
    target_wp_id, target_wp_pos, path_data = _find_closest_fishable_water_point(citizen_position, api_base_url, transport_api_url)

    if target_wp_id and path_data:
        activity_record = try_create_fishing_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            target_wp_id, path_data, now_utc_dt, activity_type="emergency_fishing"
        )
        if activity_record:
            log.info(f"{LogColors.OKGREEN}[Pêche Urgence] {citizen_name}: Activité 'emergency_fishing' créée vers {target_wp_id}.{LogColors.ENDC}")
            return activity_record
    return None

def _handle_leave_venice(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> bool:
    """Prio 1: Handles Forestieri departure."""
    if citizen_social_class != "Forestieri":
        return None # Changed from False

    # Forestieri departure logic might be complex, involving duration of stay, objectives, etc.
    # For now, let's assume a simplified condition or delegate to a specific Forestieri handler.
    # This handler is high priority, so it should be relatively certain.
    # The existing process_forestieri_departure_check can be used here.
    # It requires: tables, citizen_record, citizen_position, now_utc_dt, transport_api_url, IDLE_ACTIVITY_DURATION_HOURS
    if not process_forestieri_departure_check(tables, citizen_record, citizen_position, now_utc_dt, transport_api_url, IDLE_ACTIVITY_DURATION_HOURS):
        return None # Changed from False

    log.info(f"{LogColors.OKCYAN}[Départ] Forestiero {citizen_name}: Conditions de départ remplies.{LogColors.ENDC}")

    # Find nearest public_dock as exit point
    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Pas de position pour trouver un quai de départ.{LogColors.ENDC}")
        return None # Changed from False

    public_docks = tables['buildings'].all(formula="{Type}='public_dock'")
    if not public_docks:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Aucun quai public trouvé pour le départ.{LogColors.ENDC}")
        return None # Changed from False

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
        return None # Changed from False

    exit_point_custom_id = closest_dock_record['fields'].get('BuildingId')
    exit_point_pos = _get_building_position_coords(closest_dock_record)
    exit_point_name_display = _get_bldg_display_name_module(tables, closest_dock_record)

    if not exit_point_custom_id or not exit_point_pos:
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Quai de départ {exit_point_name_display} n'a pas d'ID ou de position.{LogColors.ENDC}")
        return None # Changed from False

    path_to_exit_data = get_path_between_points(citizen_position, exit_point_pos, transport_api_url)
    if not (path_to_exit_data and path_to_exit_data.get('success')):
        log.warning(f"{LogColors.WARNING}[Départ] Citoyen {citizen_name}: Impossible de trouver un chemin vers le quai de départ {exit_point_name_display}.{LogColors.ENDC}")
        return None # Changed from False
    
    # For now, assume no galley to delete for simplicity. This can be added later.
    from backend.engine.activity_creators.leave_venice_activity_creator import try_create as try_create_leave_venice_activity
    activity_record = try_create_leave_venice_activity( # Capture record
        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
        exit_point_custom_id, path_to_exit_data, None, now_utc_dt
    )
    if activity_record:
        log.info(f"{LogColors.OKGREEN}[Départ] Citoyen {citizen_name}: Activité 'leave_venice' créée via {exit_point_name_display}.{LogColors.ENDC}")
    return activity_record # Return record or None


def _handle_eat_from_inventory(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str 
) -> Optional[Dict]:
    """Prio 2: Handles eating from inventory if hungry and it's leisure time or a meal break."""
    if not citizen_record['is_hungry']: return None
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return None

    log.info(f"{LogColors.OKCYAN}[Faim - Inventaire] Citoyen {citizen_name} ({citizen_social_class}): Est affamé et en période de loisirs. Vérification de l'inventaire.{LogColors.ENDC}")
    for food_type_id in FOOD_RESOURCE_TYPES_FOR_EATING:
        food_name = _get_res_display_name_module(food_type_id, resource_defs)
        formula = (f"AND({{AssetType}}='citizen', {{Asset}}='{_escape_airtable_value(citizen_username)}', "
                   f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type_id)}')")
        try:
            inventory_food = tables['resources'].all(formula=formula, max_records=1)
            if inventory_food and float(inventory_food[0]['fields'].get('Count', 0)) >= 1.0:
                # Pass now_utc_dt as current_time_utc, and None for start_time_utc_iso for immediate start
                activity_record = try_create_eat_from_inventory_activity(
                    tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
                    food_type_id, 1.0, 
                    current_time_utc=now_utc_dt, 
                    resource_defs=resource_defs,
                    start_time_utc_iso=None # Explicitly None for immediate start
                )
                if activity_record:
                    log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_from_inventory' créée pour '{food_name}'.{LogColors.ENDC}")
                    return activity_record
        except Exception as e_inv_food:
            log.error(f"{LogColors.FAIL}[Faim] Citoyen {citizen_name}: Erreur vérification inventaire pour '{food_name}': {e_inv_food}{LogColors.ENDC}")
    return None

def _handle_eat_at_home_or_goto(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str 
) -> Optional[Dict]:
    """Prio 3: Handles eating at home or going home to eat if hungry and it's leisure time."""
    if not citizen_record['is_hungry']: return None
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return None

    home_record = get_citizen_home(tables, citizen_username)
    if not home_record: return None

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

    if not food_type_at_home_id: return None # No food at home

    if is_at_home:
        # Create eat_at_home directly
        eat_activity = try_create_eat_at_home_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            home_building_id, food_type_at_home_id, 1.0,
            current_time_utc=now_utc_dt, resource_defs=resource_defs,
            start_time_utc_iso=None # Immediate start
        )
        if eat_activity:
            log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_at_home' créée pour manger '{food_at_home_name}' à {home_name_display}.{LogColors.ENDC}")
        return eat_activity
    else:
        # Create goto_home, then chain eat_at_home
        if not citizen_position or not home_position: return None # Cannot pathfind
        
        path_to_home = get_path_between_points(citizen_position, home_position, transport_api_url)
        if not (path_to_home and path_to_home.get('success')): return None # Pathfinding failed

        goto_home_activity = try_create_goto_home_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            home_building_id, path_to_home, current_time_utc=now_utc_dt
            # start_time_utc_iso is None for immediate start of travel
        )
        if goto_home_activity:
            log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'goto_home' créée vers {home_name_display} pour manger.{LogColors.ENDC}")
            # Chain eat_at_home activity
            next_start_time_iso = goto_home_activity['fields']['EndDate']
            eat_activity_chained = try_create_eat_at_home_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                home_building_id, food_type_at_home_id, 1.0,
                current_time_utc=now_utc_dt, # current_time_utc is for fallback if start_time_utc_iso is None
                resource_defs=resource_defs,
                start_time_utc_iso=next_start_time_iso
            )
            if eat_activity_chained:
                log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_at_home' chaînée après 'goto_home', début à {next_start_time_iso}.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}[Faim] Citoyen {citizen_name}: Échec de la création de 'eat_at_home' chaînée après 'goto_home'.{LogColors.ENDC}")
            return goto_home_activity # Return the first activity of the chain
        return None # Failed to create goto_home

def _handle_eat_at_tavern_or_goto(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str 
) -> Optional[Dict]:
    """Prio 6: Handles eating at tavern or going to tavern to eat if hungry and it's leisure time."""
    if not citizen_record['is_hungry']: return None
    if not is_leisure_time_for_class(citizen_social_class, now_venice_dt):
        return None
    if not citizen_position: return None

    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    if citizen_ducats < TAVERN_MEAL_COST_ESTIMATE: return None # TAVERN_MEAL_COST_ESTIMATE can be a generic food provider cost estimate

    log.info(f"{LogColors.OKCYAN}[Faim - Fournisseur Externe] Citoyen {citizen_name} ({citizen_social_class}): Affamé et en période de loisirs. Recherche fournisseur de nourriture.{LogColors.ENDC}")
    closest_food_provider_record = get_closest_food_provider(tables, citizen_position)
    if not closest_food_provider_record: return None

    provider_name_display = _get_bldg_display_name_module(tables, closest_food_provider_record)
    provider_pos = _get_building_position_coords(closest_food_provider_record)
    provider_custom_id = closest_food_provider_record['fields'].get('BuildingId', closest_food_provider_record['id'])
    if not provider_pos or not provider_custom_id: return None

    # Check if food provider sells food
    provider_sells_food = False
    # food_resource_types = ["bread", "fish", "preserved_fish"] # Replaced by constant
    for food_type_id_check in FOOD_RESOURCE_TYPES_FOR_EATING:
        formula_food_contract = (
            f"AND({{Type}}='public_sell', {{SellerBuilding}}='{_escape_airtable_value(provider_custom_id)}', "
            f"{{ResourceType}}='{_escape_airtable_value(food_type_id_check)}', {{TargetAmount}}>0, "
            f"{{EndAt}}>'{now_utc_dt.isoformat()}', {{CreatedAt}}<='{now_utc_dt.isoformat()}' )"
        )
        try:
            if tables['contracts'].all(formula=formula_food_contract, max_records=1):
                provider_sells_food = True; break
        except Exception: pass # Ignore errors in this simplified check for now
    
    if not provider_sells_food: return None

    is_at_provider = _calculate_distance_meters(citizen_position, provider_pos) < 20
    
    if is_at_provider:
        # Use eat_at_tavern_activity creator, but it's generic enough for any food provider
        eat_activity = try_create_eat_at_tavern_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
            provider_custom_id, current_time_utc=now_utc_dt, resource_defs=resource_defs,
            start_time_utc_iso=None # Immediate start
        )
        if eat_activity:
            log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_at_provider' (eat_at_tavern) créée à {provider_name_display}.{LogColors.ENDC}")
        return eat_activity
    else:
        path_to_provider = get_path_between_points(citizen_position, provider_pos, transport_api_url)
        if not (path_to_provider and path_to_provider.get('success')): return None

        # Use travel_to_inn_activity creator, but it's generic enough for any food provider
        goto_provider_activity = try_create_travel_to_inn_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
            provider_custom_id, path_to_provider, current_time_utc=now_utc_dt
            # start_time_utc_iso is None for immediate start of travel
        )
        if goto_provider_activity:
            log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'travel_to_food_provider' (travel_to_inn) créée vers {provider_name_display}.{LogColors.ENDC}")
            next_start_time_iso = goto_provider_activity['fields']['EndDate']
            eat_activity_chained = try_create_eat_at_tavern_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                provider_custom_id, current_time_utc=now_utc_dt, resource_defs=resource_defs,
                start_time_utc_iso=next_start_time_iso
            )
            if eat_activity_chained:
                log.info(f"{LogColors.OKGREEN}[Faim] Citoyen {citizen_name}: Activité 'eat_at_provider' (eat_at_tavern) chaînée après 'travel_to_food_provider', début à {next_start_time_iso}.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}[Faim] Citoyen {citizen_name}: Échec de la création de 'eat_at_provider' (eat_at_tavern) chaînée.{LogColors.ENDC}")
            return goto_provider_activity # Return the first activity of the chain
        return None # Failed to create travel_to_inn

def _handle_deposit_inventory_at_work(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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
                checked_at_dt = datetime.fromisoformat(checked_at_str.replace("Z", "+00:00"))
                if checked_at_dt.tzinfo is None: # Ensure timezone aware
                    checked_at_dt = pytz.UTC.localize(checked_at_dt)
                
                # Check if last check was within the last 23 hours (giving a 1-hour buffer before 24h penalty)
                if (now_utc_dt - checked_at_dt) < timedelta(hours=23):
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
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str 
) -> Optional[Dict]:
    """Prio 15: Handles finding night shelter (home or inn) if it's rest time."""
    if not is_rest_time_for_class(citizen_social_class, now_venice_dt):
        return None
    if not citizen_position: return None

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
             end_time_venice_rest = (venice_now_for_rest_fallback + timedelta(days=1)).replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
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
            end_time_venice_rest = (now_venice_dt + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0) # Default 1h rest
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
            is_overnight_block_ending_next_day = False # Correctly indicates if the chosen block itself is overnight

            for start_h, end_h in rest_periods:
                current_block_is_overnight = (start_h > end_h)
                if not current_block_is_overnight: # Same day block
                    if start_h <= current_hour_venice < end_h:
                        chosen_rest_block_end_hour = end_h
                        is_overnight_block_ending_next_day = False # This chosen block is not overnight
                        break
                else: # Overnight block (e.g. 22 to 06)
                    if current_hour_venice >= start_h: # e.g. current 23:00, in block 22-06
                        chosen_rest_block_end_hour = end_h
                        is_overnight_block_ending_next_day = True # This chosen block is overnight
                        break
                    elif current_hour_venice < end_h: # e.g. current 01:00, in block 22-06 (started prev day)
                        chosen_rest_block_end_hour = end_h
                        is_overnight_block_ending_next_day = True # This chosen block is overnight
                        break
            
            if chosen_rest_block_end_hour != -1:
                # Handle end_hour being 24 (midnight of the next day)
                actual_end_hour_for_replace = chosen_rest_block_end_hour
                add_day_for_midnight_24 = False
                if chosen_rest_block_end_hour == 24:
                    actual_end_hour_for_replace = 0
                    add_day_for_midnight_24 = True

                end_time_venice_rest = now_venice_dt.replace(hour=actual_end_hour_for_replace, minute=0, second=0, microsecond=0)
                
                if add_day_for_midnight_24:
                    end_time_venice_rest += timedelta(days=1)
                # For overnight blocks like (22, 6), if current time is 23:00, chosen_rest_block_end_hour is 6.
                # actual_end_hour_for_replace is 6. is_overnight_block_ending_next_day is True.
                # 6 <= 23 is true, so we add a day.
                elif is_overnight_block_ending_next_day and actual_end_hour_for_replace <= current_hour_venice:
                    end_time_venice_rest += timedelta(days=1)
                # If current time is already past the calculated end time for today (e.g. current 07:00, end_hour 06:00 from a 22-06 block)
                # this means we are past the rest period. This case should ideally be caught by is_rest_time_for_class.
                # However, if is_rest_time_for_class was true, and we are here, it means we are *in* a rest period.
            else: # Fallback, should not be reached if is_rest_time_for_class is accurate
                log.error(f"Logic error determining rest end time for {citizen_name}. Defaulting.")
                end_time_venice_rest = (now_venice_dt + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

    stay_end_time_utc_iso = end_time_venice_rest.astimezone(pytz.UTC).isoformat()

    if not is_forestieri: # Resident logic
        home_record = get_citizen_home(tables, citizen_username)
        if not home_record: # Homeless resident
            log.info(f"{LogColors.WARNING}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Sans domicile. Recherche d'une auberge.{LogColors.ENDC}")
        else: # Resident with a home
            home_name_display = _get_bldg_display_name_module(tables, home_record)
            home_pos = _get_building_position_coords(home_record)
            home_custom_id_val = home_record['fields'].get('BuildingId', home_record['id'])
            if not home_pos or not home_custom_id_val: return None

            if _calculate_distance_meters(citizen_position, home_pos) < 20: # Is at home
                stay_activity = try_create_stay_activity(
                    tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
                    home_custom_id_val, "home", stay_end_time_utc_iso, now_utc_dt, start_time_utc_iso=None
                )
                if stay_activity:
                    log.info(f"{LogColors.OKGREEN}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Activité 'rest' (maison) créée à {home_name_display}.{LogColors.ENDC}")
                return stay_activity
            else: # Not at home, go home then rest
                path_to_home = get_path_between_points(citizen_position, home_pos, transport_api_url)
                if not (path_to_home and path_to_home.get('success')): return None
                
                goto_home_activity = try_create_goto_home_activity(
                    tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
                    home_custom_id_val, path_to_home, now_utc_dt # start_time_utc_iso is None for goto_home
                )
                if goto_home_activity:
                    log.info(f"{LogColors.OKGREEN}[Repos] Citoyen {citizen_name} ({citizen_social_class}): Activité 'goto_home' créée vers {home_name_display}.{LogColors.ENDC}")
                    next_start_time_iso = goto_home_activity['fields']['EndDate']
                    stay_activity_chained = try_create_stay_activity(
                        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                        home_custom_id_val, "home", stay_end_time_utc_iso, now_utc_dt, 
                        start_time_utc_iso=next_start_time_iso
                    )
                    if stay_activity_chained:
                        log.info(f"{LogColors.OKGREEN}[Repos] Citoyen {citizen_name}: Activité 'rest' (maison) chaînée après 'goto_home', début à {next_start_time_iso}.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}[Repos] Citoyen {citizen_name}: Échec de la création de 'rest' (maison) chaînée.{LogColors.ENDC}")
                    return goto_home_activity # Return first activity of chain
                return None # Failed to create goto_home
            return None # Failed to rest or go home for resident with home

    # Forestieri or Homeless Resident logic (Inn)
    log.info(f"{LogColors.OKCYAN}[Repos] Citoyen {citizen_name} ({citizen_social_class} - {'Forestieri' if is_forestieri else 'Résident sans abri'}): Recherche d'une auberge.{LogColors.ENDC}")
    closest_inn_record = get_closest_building_of_type(tables, citizen_position, "inn")
    if not closest_inn_record: return None

    inn_name_display = _get_bldg_display_name_module(tables, closest_inn_record)
    inn_pos = _get_building_position_coords(closest_inn_record)
    inn_custom_id_val = closest_inn_record['fields'].get('BuildingId', closest_inn_record['id'])
    if not inn_pos or not inn_custom_id_val: return None

    if _calculate_distance_meters(citizen_position, inn_pos) < 20: # Is at inn
        stay_activity_inn = try_create_stay_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
            inn_custom_id_val, "inn", stay_end_time_utc_iso, now_utc_dt, start_time_utc_iso=None
        )
        if stay_activity_inn:
            log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'rest' (auberge) créée à {inn_name_display}.{LogColors.ENDC}")
        return stay_activity_inn
    else: # Not at inn, go to inn then rest
        path_to_inn = get_path_between_points(citizen_position, inn_pos, transport_api_url)
        if not (path_to_inn and path_to_inn.get('success')): return None
        
        goto_inn_activity = try_create_travel_to_inn_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id, 
            inn_custom_id_val, path_to_inn, now_utc_dt # start_time_utc_iso is None for travel_to_inn
        )
        if goto_inn_activity:
            log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'travel_to_inn' créée vers {inn_name_display}.{LogColors.ENDC}")
            next_start_time_iso = goto_inn_activity['fields']['EndDate']
            stay_activity_inn_chained = try_create_stay_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                inn_custom_id_val, "inn", stay_end_time_utc_iso, now_utc_dt,
                start_time_utc_iso=next_start_time_iso
            )
            if stay_activity_inn_chained:
                log.info(f"{LogColors.OKGREEN}[Nuit] Citoyen {citizen_name}: Activité 'rest' (auberge) chaînée après 'travel_to_inn', début à {next_start_time_iso}.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}[Nuit] Citoyen {citizen_name}: Échec de la création de 'rest' (auberge) chaînée.{LogColors.ENDC}")
            return goto_inn_activity # Return first activity of chain
        return None # Failed to create travel_to_inn
    return None

def _handle_shop_for_food_at_retail(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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
    # For shopping, having a home is not strictly necessary if they can store in inventory,
    # but the current logic delivers to home. We can adjust this if needed.
    # For now, let's keep the home requirement for this specific handler.
    if not home_record:
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture Détail] Citoyen {citizen_name} ({citizen_social_class}): Sans domicile. Cette logique d'achat livre à domicile.{LogColors.ENDC}")
        return False
    
    home_custom_id = home_record['fields'].get('BuildingId')
    if not home_custom_id: return False # Should not happen if home_record is valid

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
            # The travel_to_inn creator is generic enough for any destination.
            # The subsequent 'eat_at_tavern' activity will handle the purchase logic.
            # We need to ensure the 'eat_at_tavern' activity knows this is a retail purchase.
            # This can be done by adding details to the 'goto_location' (travel_to_inn) activity,
            # which are then passed to the chained 'eat_at_tavern' activity.
            
            # For now, the existing travel_to_inn and eat_at_tavern creators are used.
            # The eat_at_tavern processor will need to be aware of retail purchases if different logic applies.
            # The current eat_at_tavern creator doesn't take specific food item details, it assumes a generic meal.
            # This might need adjustment if we want them to buy a *specific* item from the shop.
            # For now, let's assume they go to the shop and the 'eat_at_tavern' activity implies buying *something* there.

            goto_activity = try_create_travel_to_inn_activity( # This creates a 'goto_location'
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                shop_custom_id_for_activity, 
                best_deal_info["path_to_shop"], 
                now_utc_dt
            )
            if goto_activity:
                log.info(f"{LogColors.OKGREEN}[Achat Nourriture] Citoyen {citizen_name}: Activité 'goto_location' (vers magasin {shop_display_name}) créée pour acheter et manger {food_display_name}.{LogColors.ENDC}")
                # Chain the 'eat_at_tavern' activity to occur upon arrival
                next_start_time_iso = goto_activity['fields']['EndDate']
                eat_activity_details = {
                    "is_retail_purchase": True,
                    "food_resource_id": best_deal_info["food_type_id"],
                    "price": price_for_this_meal,
                    "original_contract_id": best_deal_info["contract_rec"]['fields'].get('ContractId', best_deal_info["contract_rec"]['id'])
                }
                chained_eat_activity = try_create_eat_at_tavern_activity(
                    tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                    shop_custom_id_for_activity, # Target building is the shop
                    now_utc_dt, resource_defs,
                    start_time_utc_iso=next_start_time_iso,
                    details_payload=eat_activity_details # Pass purchase details
                )
                if chained_eat_activity:
                    log.info(f"{LogColors.OKGREEN}[Achat Nourriture] Activité 'eat_at_provider' (eat_at_tavern) chaînée pour {food_display_name} à {shop_display_name}, début à {next_start_time_iso}.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}[Achat Nourriture] Échec de la création de 'eat_at_provider' (eat_at_tavern) chaînée.{LogColors.ENDC}")
                return True # Return True as the initial travel activity was created
    else:
        log.info(f"{LogColors.OKBLUE}[Achat Nourriture] Aucune offre de nourriture appropriée trouvée pour {citizen_name} selon les critères de priorité.{LogColors.ENDC}")
        
    return False

def _handle_fishing(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str # Added social_class
) -> Optional[Dict]:
    """Prio 32: Handles regular fishing if citizen is Facchini, it's work time, and they are a fisherman."""
    if citizen_social_class != "Facchini":
        return None
    # Fishing is a generic Facchini task, not tied to a specific building type's hours, so use class schedule.
    if not is_work_time(citizen_social_class, now_venice_dt): # Pass no workplace_type
        return None
        
    home_record = get_citizen_home(tables, citizen_username) # Fishermen live in fisherman's cottages
    if not (home_record and home_record['fields'].get('Type') == 'fisherman_s_cottage'):
        return None # Not a fisherman (based on home type)

    # Check if they have a formal "Workplace" record. If so, they should do that job.
    # This fishing is for those Facchini in fisherman's cottages without other assigned work.
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if workplace_record:
        return None # Has other work

    if not citizen_position:
        log.warning(f"{LogColors.WARNING}[Pêche Régulière] {citizen_name} n'a pas de position. Impossible de pêcher.{LogColors.ENDC}")
        return None

    log.info(f"{LogColors.OKCYAN}[Pêche Régulière] {citizen_name} (Facchini pêcheur sans autre travail) en période de travail. Recherche lieu de pêche.{LogColors.ENDC}")
    
    target_wp_id, target_wp_pos, path_data = _find_closest_fishable_water_point(citizen_position, api_base_url, transport_api_url)

    if target_wp_id and path_data:
        activity_record = try_create_fishing_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            target_wp_id, path_data, now_utc_dt, activity_type="fishing"
        )
        if activity_record:
            log.info(f"{LogColors.OKGREEN}[Pêche] {citizen_name}: Activité 'fishing' créée vers {target_wp_id}.{LogColors.ENDC}")
            return activity_record
    else:
        log.info(f"{LogColors.OKBLUE}[Pêche] {citizen_name}: Aucun lieu de pêche accessible trouvé.{LogColors.ENDC}")
        
    return None


# --- Placeholder for new handler functions ---

def _handle_construction_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str],
    citizen_social_class: str 
) -> Optional[Dict]:
    """
    Prio 31: Handles production, restocking for general workplaces if it's work time.
    Phases à implémenter :
    1. Production directe : créer et retourner l’activité production si possible.
    2. Réapprovisionnement : si ressources manquantes, créer une activité de fetch (storage_fetch ou fetch_resource),
       puis chaîner la production en lui passant son EndDate à start_time_utc_iso.
    3. Livraison surplus : si stockage plein et contrat storage_query, créer deliver_to_storage et retourner l’activité.
    """
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record:
        return None

    workplace_type = workplace_record['fields'].get('Type')
    if not is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type):
        return None
        
    if citizen_social_class == "Nobili" and not BUILDING_TYPE_WORK_SCHEDULES.get(workplace_type):
         return None 

    workplace_category = workplace_record['fields'].get('Category', '').lower()
    workplace_subcategory = workplace_record['fields'].get('SubCategory', '').lower()
    workplace_type = workplace_record['fields'].get('Type', '')
    workplace_custom_id = workplace_record['fields'].get('BuildingId')
    workplace_operator = workplace_record['fields'].get('RunBy') or workplace_record['fields'].get('Owner')


    # This handler is for general business/production, not construction or porter guilds
    if workplace_category != 'business' or workplace_subcategory in ['construction', 'porter_guild_hall', 'storage']: 
        return None
    
    if not citizen_position: return None 
    workplace_pos = _get_building_position_coords(workplace_record)
    if not workplace_pos or _calculate_distance_meters(citizen_position, workplace_pos) > 20:
        # If not at workplace, this handler won't create a goto_work. That's handled by _handle_general_goto_work.
        return None 

    log.info(f"{LogColors.OKCYAN}[Travail Général] Citoyen {citizen_name} à {workplace_custom_id} ({workplace_type}). Évaluation des tâches.{LogColors.ENDC}")

    building_type_def = get_building_type_info(workplace_type, building_type_defs)
    if not building_type_def or 'productionInformation' not in building_type_def:
        log.info(f"Pas d'information de production pour {workplace_type}. Impossible de produire ou réapprovisionner.")
        return None
    
    prod_info = building_type_def['productionInformation']
    recipes = prod_info.get('Arti', []) if isinstance(prod_info, dict) else [] 
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
                    # Create production activity with immediate start
                    production_activity = try_create_production_activity(
                        tables, citizen_airtable_id, citizen_custom_id, citizen_username, 
                        workplace_custom_id, recipe_def, now_utc_dt, start_time_utc_iso=None
                    )
                    if production_activity:
                        log.info(f"{LogColors.OKGREEN}[Travail Général] Citoyen {citizen_name} a commencé la production à {workplace_custom_id}.{LogColors.ENDC}")
                        return production_activity # Return the created activity
                else:
                    log.info(f"Pas assez d'espace de stockage à {workplace_custom_id} pour la sortie de la recette {recipe_idx}.")

    # 2. Try to restock inputs for production
    # This section will create a travel activity (fetch/goto) and then chain a production activity.
    if recipes: 
        current_workplace_stock_map_for_restock = get_building_resources(tables, workplace_custom_id)
        for recipe_def_restock in recipes:
            if not isinstance(recipe_def_restock, dict): continue
            for input_res_id, input_qty_needed_val in recipe_def_restock.get('inputs', {}).items():
                input_qty_needed = float(input_qty_needed_val)
                current_stock_of_input = current_workplace_stock_map_for_restock.get(input_res_id, 0.0)
                if current_stock_of_input < input_qty_needed:
                    needed_amount = input_qty_needed - current_stock_of_input
                    res_name_display = _get_res_display_name_module(input_res_id, resource_defs)
                    log.info(f"{LogColors.OKBLUE}[Travail Général] {workplace_custom_id} a besoin de {needed_amount:.2f} de {res_name_display} pour la production.{LogColors.ENDC}")

                    first_fetch_activity: Optional[Dict] = None
                    
                    # Prio 1: Fetch from dedicated storage contract (storage_query)
                    # ... (existing logic to find sq_contract, storage_facility_record, etc.)
                    # If found and path_to_storage exists:
                    #     first_fetch_activity = try_create_goto_work_activity(...)
                    #     if first_fetch_activity: break # Break from inner loop (inputs for this recipe)
                    # if first_fetch_activity: break # Break from outer loop (recipes)
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
                                    if citizen_position and storage_facility_pos:
                                        path_to_storage = get_path_between_points(citizen_position, storage_facility_pos, transport_api_url)
                                        if path_to_storage and path_to_storage.get('success'):
                                            goto_notes = f"Aller à l'entrepôt {storage_facility_id} pour chercher {amount_to_fetch_from_storage:.2f} {res_name_display} pour l'atelier {workplace_custom_id}."
                                            fetch_details = {
                                                "action_on_arrival": "fetch_from_storage",
                                                "original_workplace_id": workplace_custom_id,
                                                "storage_query_contract_id": sq_contract['fields'].get('ContractId', sq_contract['id']),
                                                "resources_to_fetch": [{"ResourceId": input_res_id, "Amount": amount_to_fetch_from_storage}]
                                            }
                                            first_fetch_activity = try_create_goto_work_activity(
                                                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                                                storage_facility_id, path_to_storage,
                                                None, resource_defs, False, citizen_position_str_val, now_utc_dt,
                                                custom_notes=goto_notes, activity_type="goto_building_for_storage_fetch", 
                                                details_payload=fetch_details, start_time_utc_iso=None # Immediate start for travel
                                            )
                                            if first_fetch_activity:
                                                log.info(f"      [Travail Général] Activité 'goto_building_for_storage_fetch' créée vers {storage_facility_id}.")
                                                break # Found a way to get this input, break from inputs loop
                    if first_fetch_activity: break # Break from recipes loop

                    # Prio 2: Fetch via recurrent contract
                    # ... (existing logic to find contract_rec, from_bldg_rec_rec, etc.)
                    # If found and path_src_rec exists:
                    #     first_fetch_activity = try_create_resource_fetching_activity(...)
                    #     if first_fetch_activity: break
                    # if first_fetch_activity: break
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
                                    first_fetch_activity = try_create_resource_fetching_activity(
                                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                                        contract_custom_id_rec_str, from_bldg_id_rec, workplace_custom_id,
                                        input_res_id, amount_to_fetch_rec, path_src_rec, now_utc_dt, resource_defs, start_time_utc_iso=None
                                    )
                                    if first_fetch_activity:
                                        log.info(f"      [Travail Général] Activité 'fetch_resource' créée pour contrat récurrent {contract_custom_id_rec_str}.")
                                        break 
                    if first_fetch_activity: break

                    # Prio 3: Buy from public sell contract
                    # ... (existing logic to find contract_ps, seller_bldg_rec_ps, etc.)
                    # If found and path_seller_ps exists:
                    #     first_fetch_activity = try_create_resource_fetching_activity(...)
                    #     if first_fetch_activity: break
                    # if first_fetch_activity: break
                    public_sell_formula = f"AND({{Type}}='public_sell', {{ResourceType}}='{_escape_airtable_value(input_res_id)}', {{EndAt}}>'{now_utc_dt.isoformat()}', {{TargetAmount}}>0)"
                    all_public_sell_for_res = tables['contracts'].all(formula=public_sell_formula, sort=['PricePerResource'])
                    for contract_ps in all_public_sell_for_res:
                        seller_bldg_id_ps = contract_ps['fields'].get('SellerBuilding')
                        if not seller_bldg_id_ps: continue
                        seller_bldg_rec_ps = get_building_record(tables, seller_bldg_id_ps)
                        if not seller_bldg_rec_ps: continue
                        price_ps = float(contract_ps['fields'].get('PricePerResource', 0))
                        available_ps = float(contract_ps['fields'].get('TargetAmount', 0))
                        seller_ps = contract_ps['fields'].get('Seller')
                        if not seller_ps: continue
                        buyer_rec_ps = get_citizen_record(tables, workplace_operator)
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
                                    first_fetch_activity = try_create_resource_fetching_activity(
                                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                                        contract_custom_id_ps_str, seller_bldg_id_ps, workplace_custom_id,
                                        input_res_id, amount_to_buy_ps, path_seller_ps, now_utc_dt, resource_defs, start_time_utc_iso=None
                                    )
                                    if first_fetch_activity:
                                        log.info(f"      [Travail Général] Activité 'fetch_resource' créée pour contrat public {contract_custom_id_ps_str}.")
                                        break
                    if first_fetch_activity: break
                    
                    # Prio 4: Generic fetch_resource (fallback)
                    # ... (existing logic)
                    # If successful:
                    #     first_fetch_activity = try_create_resource_fetching_activity(...)
                    #     if first_fetch_activity: break
                    # if first_fetch_activity: break
                    log.info(f"    [Travail Général] Aucune source contractuelle trouvée pour {res_name_display}. Tentative de récupération générique.")
                    first_fetch_activity = try_create_resource_fetching_activity(
                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                        None, None, workplace_custom_id, input_res_id, 
                        min(needed_amount, 10.0), 
                        None, now_utc_dt, resource_defs, start_time_utc_iso=None
                    )
                    if first_fetch_activity:
                        log.info(f"{LogColors.OKGREEN}[Travail Général] Citoyen {citizen_name} va chercher {res_name_display} pour {workplace_custom_id} (générique).{LogColors.ENDC}")
                        break
            if first_fetch_activity: break # Break from recipes loop if a fetch was initiated for any input

        if first_fetch_activity:
            # Chain production activity after the fetch
            # The EndDate of fetch_resource is arrival at workplace.
            # The EndDate of goto_building_for_storage_fetch is arrival at storage.
            # We need to ensure the chained production starts *after* arrival back at the workplace.
            # This requires the fetch activity processor to potentially create the production activity,
            # OR for the fetch activity to have a "final destination" field.
            # For now, let's assume the fetch activity's EndDate is arrival at the workplace.
            # This is a simplification and might need refinement.
            # The recipe_def_restock here is the one for which we initiated the fetch.
            
            # IMPORTANT: The current fetch_resource and goto_building_for_storage_fetch activities
            # have their EndDate as arrival at the *source* or *storage*.
            # We need a way to chain the production *after* returning to the workplace.
            # This might require a new activity type like "return_to_workplace_with_goods"
            # or modifying the fetch processors to create the production activity.
            # For this refactor, we will assume the fetch activity's EndDate is arrival back at the workplace.
            # This is a temporary simplification.
            
            # Find the recipe that triggered this fetch.
            recipe_to_chain = None
            for r_def in recipes:
                if input_res_id in r_def.get('inputs', {}):
                    recipe_to_chain = r_def
                    break
            
            if recipe_to_chain:
                next_start_time_iso = first_fetch_activity['fields']['EndDate']
                chained_production = try_create_production_activity(
                    tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                    workplace_custom_id, recipe_to_chain, now_utc_dt, # now_utc_dt is for fallback
                    start_time_utc_iso=next_start_time_iso
                )
                if chained_production:
                    log.info(f"{LogColors.OKGREEN}[Travail Général] Production chaînée après récupération de {res_name_display}, début à {next_start_time_iso}.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}[Travail Général] Échec de la création de production chaînée après récupération de {res_name_display}.{LogColors.ENDC}")
            return first_fetch_activity # Return the first activity of the chain

    # 3. Try to deliver excess output to storage
    # This creates a 'deliver_to_storage' activity and does not chain anything after it.
    current_workplace_total_load, current_workplace_stock_map_for_delivery = get_building_storage_details(tables, workplace_custom_id, workplace_operator)
    if storage_capacity > 0 and (current_workplace_total_load / storage_capacity) > STORAGE_FULL_THRESHOLD:
        log.info(f"{LogColors.OKCYAN}[Travail Général] {workplace_custom_id} est >{STORAGE_FULL_THRESHOLD*100:.0f}% plein. Vérification des contrats de stockage.{LogColors.ENDC}")
        for res_id_to_deliver, amount_at_workplace in current_workplace_stock_map_for_delivery.items():
            if amount_at_workplace <= 0.1: continue
            storage_query_contracts = tables['contracts'].all(
                formula=f"AND({{Type}}='storage_query', {{Buyer}}='{_escape_airtable_value(workplace_operator)}', {{BuyerBuilding}}='{_escape_airtable_value(workplace_custom_id)}', {{ResourceType}}='{_escape_airtable_value(res_id_to_deliver)}', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
            )
            if storage_query_contracts:
                sq_contract = storage_query_contracts[0]
                storage_facility_id = sq_contract['fields'].get('SellerBuilding')
                if storage_facility_id:
                    storage_facility_record = get_building_record(tables, storage_facility_id)
                    if storage_facility_record:
                        _, facility_stock_map = get_building_storage_details(tables, storage_facility_id, workplace_operator)
                        current_stored_in_facility = facility_stock_map.get(res_id_to_deliver, 0.0)
                        contracted_capacity = float(sq_contract['fields'].get('TargetAmount', 0))
                        remaining_facility_capacity_for_contract = contracted_capacity - current_stored_in_facility
                        if remaining_facility_capacity_for_contract > 0.1:
                            amount_to_deliver = min(amount_at_workplace * 0.5, 
                                                    get_citizen_effective_carry_capacity(citizen_record) - get_citizen_current_load(tables, citizen_username),
                                                    remaining_facility_capacity_for_contract)
                            amount_to_deliver = float(f"{amount_to_deliver:.4f}")
                            if amount_to_deliver >= 0.1:
                                storage_facility_pos = _get_building_position_coords(storage_facility_record)
                                if citizen_position and storage_facility_pos:
                                    path_to_storage = get_path_between_points(citizen_position, storage_facility_pos, transport_api_url)
                                    if path_to_storage and path_to_storage.get('success'):
                                        deliver_activity = try_create_deliver_to_storage_activity(
                                            tables, citizen_record, workplace_record, storage_facility_record,
                                            [{"ResourceId": res_id_to_deliver, "Amount": amount_to_deliver}],
                                            sq_contract['fields'].get('ContractId', sq_contract['id']),
                                            path_to_storage, now_utc_dt, start_time_utc_iso=None # Immediate start for delivery
                                        )
                                        if deliver_activity:
                                            log.info(f"{LogColors.OKGREEN}[Travail Général] Citoyen {citizen_name} va livrer {amount_to_deliver:.2f} de {res_id_to_deliver} à l'entrepôt {storage_facility_id}.{LogColors.ENDC}")
                                            return deliver_activity # Return the delivery activity
    return None # No activity created by this handler this cycle


def _handle_forestieri_daytime_tasks(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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
    # Homeless citizens can also shop, goods go to their inventory.
    # if not home_record and citizen_social_class != "Forestieri":
    #      log.info(f"{LogColors.OKBLUE}[Shopping] Citoyen {citizen_name} ({citizen_social_class}): Pas de domicile, ne peut pas faire d'achats (sauf Forestieri).{LogColors.ENDC}")
    #      return False

    log.info(f"{LogColors.OKCYAN}[Achat Nourriture] Citoyen {citizen_name}: Affamé et a des Ducats. Recherche de magasins d'alimentation. Domicile: {'Oui' if home_record else 'Non'}.{LogColors.ENDC}")
    
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
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
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

def _handle_manage_public_dock(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 66: Handles managing a public dock if the citizen runs one and it needs attention."""
    if not (is_work_time(citizen_social_class, now_venice_dt) or is_leisure_time_for_class(citizen_social_class, now_venice_dt)):
        return None # Only manage docks during active hours

    try:
        docks_run_by_citizen = tables['buildings'].all(
            formula=f"AND({{RunBy}}='{_escape_airtable_value(citizen_username)}', {{Type}}='public_dock')"
        )
    except Exception as e_fetch_docks:
        log.error(f"{LogColors.FAIL}[Gestion Quai Public] Erreur récupération des quais pour {citizen_name}: {e_fetch_docks}{LogColors.ENDC}")
        return None

    if not docks_run_by_citizen:
        return None

    for dock_record in docks_run_by_citizen:
        dock_custom_id_val = dock_record['fields'].get('BuildingId')
        dock_name_display = _get_bldg_display_name_module(tables, dock_record)
        checked_at_str = dock_record['fields'].get('CheckedAt')
        needs_management = True
        MANAGEMENT_DURATION_HOURS = 2.0 # Duration of the management activity

        if checked_at_str:
            try:
                checked_at_dt = datetime.fromisoformat(checked_at_str.replace("Z", "+00:00"))
                if checked_at_dt.tzinfo is None: checked_at_dt = pytz.UTC.localize(checked_at_dt)
                if (now_utc_dt - checked_at_dt) < timedelta(hours=12): # Manage if not checked in last 12 hours
                    needs_management = False
            except ValueError:
                log.warning(f"{LogColors.WARNING}[Gestion Quai Public] Format de date invalide pour CheckedAt ({checked_at_str}) pour {dock_name_display}. Supposition : gestion nécessaire.{LogColors.ENDC}")

        if needs_management:
            log.info(f"{LogColors.OKCYAN}[Gestion Quai Public] {dock_name_display} (géré par {citizen_name}) nécessite une gestion (Dernière vérif.: {checked_at_str or 'Jamais'}).{LogColors.ENDC}")

            if not citizen_position:
                log.warning(f"{LogColors.WARNING}[Gestion Quai Public] {citizen_name} n'a pas de position. Impossible de créer l'activité de gestion.{LogColors.ENDC}")
                continue

            dock_pos = _get_building_position_coords(dock_record)
            if not dock_pos:
                log.warning(f"{LogColors.WARNING}[Gestion Quai Public] {dock_name_display} n'a pas de position. Impossible de créer l'activité de gestion.{LogColors.ENDC}")
                continue

            if _calculate_distance_meters(citizen_position, dock_pos) > 20: # If not already at the dock
                path_to_dock = get_path_between_points(citizen_position, dock_pos, transport_api_url)
                if not (path_to_dock and path_to_dock.get('success')):
                    log.warning(f"{LogColors.WARNING}[Gestion Quai Public] Impossible de trouver un chemin vers {dock_name_display} pour {citizen_name}.{LogColors.ENDC}")
                    continue

                # Create goto_location activity first
                goto_notes = f"Se rendant à {dock_name_display} pour gérer les opérations."
                action_details = {
                    "action_on_arrival": "manage_public_dock",
                    "duration_hours_on_arrival": MANAGEMENT_DURATION_HOURS,
                    "target_dock_id_on_arrival": dock_custom_id_val
                }
                from backend.engine.activity_creators.goto_location_creator import try_create as try_create_goto_location_activity
                
                goto_activity = try_create_goto_location_activity(
                    tables=tables,
                    citizen_record=citizen_record,
                    destination_building_id=dock_custom_id_val,
                    path_data=path_to_dock,
                    current_time_utc=now_utc_dt,
                    notes=goto_notes,
                    details_payload=action_details,
                    start_time_utc_iso=None # Immediate start for travel
                )
                if goto_activity:
                    log.info(f"{LogColors.OKGREEN}[Gestion Quai Public] Activité 'goto_location' créée pour {citizen_name} vers {dock_name_display}.{LogColors.ENDC}")
                    # The manage_public_dock activity will be chained by the goto_location processor.
                    return goto_activity # Return the first activity of the chain
            else: # Already at the dock
                manage_activity = try_create_manage_public_dock_activity(
                    tables=tables,
                    citizen_record=citizen_record,
                    public_dock_record=dock_record,
                    duration_hours=MANAGEMENT_DURATION_HOURS,
                    current_time_utc=now_utc_dt,
                    start_time_utc_iso=None # Immediate start
                )
                if manage_activity:
                    log.info(f"{LogColors.OKGREEN}[Gestion Quai Public] Activité 'manage_public_dock' créée directement pour {citizen_name} à {dock_name_display}.{LogColors.ENDC}")
                    return manage_activity
    return None


def _handle_general_goto_work(
    tables: Dict[str, Table], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str_val: Optional[str],
    citizen_social_class: str 
) -> Optional[Dict]:
    """Prio 70: Handles general goto_work if it's work time, citizen has a workplace and is not there."""
    workplace_record = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    if not workplace_record: return None 

    workplace_type = workplace_record['fields'].get('Type')
    if not is_work_time(citizen_social_class, now_venice_dt, workplace_type=workplace_type):
        return None 

    if citizen_social_class == "Nobili" and not BUILDING_TYPE_WORK_SCHEDULES.get(workplace_type):
        return None 

    if not citizen_position: return None 
    workplace_pos = _get_building_position_coords(workplace_record)
    if not workplace_pos: return None 

    if _calculate_distance_meters(citizen_position, workplace_pos) < 20:
        return None # Already at workplace

    log.info(f"{LogColors.OKCYAN}[Aller au Travail] Citoyen {citizen_name} ({citizen_social_class}) n'est pas à son lieu de travail. Création goto_work.{LogColors.ENDC}")
    path_to_work = get_path_between_points(citizen_position, workplace_pos, transport_api_url)
    if path_to_work and path_to_work.get('success'):
        workplace_custom_id_val = workplace_record['fields'].get('BuildingId')
        home_record = get_citizen_home(tables, citizen_username) 
        is_at_home_val = False 
        if home_record and citizen_position:
            home_pos = _get_building_position_coords(home_record)
            if home_pos: is_at_home_val = _calculate_distance_meters(citizen_position, home_pos) < 20
        
        # Create goto_work activity, no chaining from this handler.
        # start_time_utc_iso is None for immediate start.
        activity_record = try_create_goto_work_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            workplace_custom_id_val, path_to_work, home_record, resource_defs,
            is_at_home_val, citizen_position_str_val, now_utc_dt, start_time_utc_iso=None
        )
        return activity_record 
    return None 

# --- Dispatcher for Specific Activity Requests ---
def dispatch_specific_activity_request(
    tables: Dict[str, Table],
    citizen_record_full: Dict, # Full Airtable record for the citizen
    activity_type: str,
    activity_parameters: Optional[Dict[str, Any]],
    resource_defs: Dict,
    building_type_defs: Dict,
    transport_api_url: str,
    api_base_url: str
) -> Dict[str, Any]: # Return type remains Dict, but content will change slightly
    # Get current time in UTC and Venice timezone
    now_utc_dt = datetime.now(pytz.UTC)
    now_venice_dt = now_utc_dt.astimezone(VENICE_TIMEZONE)
    """
    Attempts to create a specific activity for a citizen based on activity_type and parameters.
    This will now orchestrate chains of activities if necessary.
    Returns a dictionary with success status, message, and optionally the first activity of a chain.
    """
    # Extract common citizen details
    original_activity_type = activity_type # Keep original for logging if redirected
    citizen_custom_id = citizen_record_full['fields'].get('CitizenId')
    citizen_username = citizen_record_full['fields'].get('Username')
    citizen_airtable_id = citizen_record_full['id']
    citizen_name = f"{citizen_record_full['fields'].get('FirstName', '')} {citizen_record_full['fields'].get('LastName', '')}".strip() or citizen_username
    citizen_social_class = citizen_record_full['fields'].get('SocialClass', 'Facchini')
    
    citizen_position_str = citizen_record_full['fields'].get('Position')
    citizen_position: Optional[Dict[str, float]] = None
    try:
        if citizen_position_str: citizen_position = json.loads(citizen_position_str)
    except Exception: pass

    if not citizen_position: # Fallback if position is missing or invalid
        log.warning(f"Citizen {citizen_username} has no valid position. Attempting to assign random for specific activity.")
        citizen_position = _fetch_and_assign_random_starting_position(tables, citizen_record_full, api_base_url)
        if citizen_position:
            citizen_position_str = json.dumps(citizen_position)
        else:
            return {"success": False, "message": "Citizen has no position and failed to assign one.", "activity": None, "reason": "missing_position"}

    # Prepare is_hungry state for eat handlers
    is_hungry = False
    ate_at_str = citizen_record_full['fields'].get('AteAt')
    if ate_at_str:
        try:
            ate_at_dt = dateutil_parser.isoparse(ate_at_str.replace('Z', '+00:00'))
            if ate_at_dt.tzinfo is None: ate_at_dt = pytz.UTC.localize(ate_at_dt)
            if (now_utc_dt - ate_at_dt) > timedelta(hours=12): is_hungry = True
        except ValueError: is_hungry = True 
    else: is_hungry = True
    citizen_record_full['is_hungry'] = is_hungry # Modify a copy if concerned about side effects, or pass as arg

    # Common arguments for handler functions
    handler_args = (
        tables, citizen_record_full, False, resource_defs, building_type_defs, # False for deprecated is_night
        now_venice_dt, now_utc_dt, transport_api_url, api_base_url,
        citizen_position, citizen_custom_id, citizen_username, citizen_airtable_id, 
        citizen_name, citizen_position_str, citizen_social_class
    )
    
    first_activity_of_chain: Optional[Dict] = None # Will store the first activity created
    strategy_applied = "default_order" # For logging/messaging
    params = activity_parameters or {}

    # --- Handle specific activity_type requests ---
    # Each block should set first_activity_of_chain if successful.

    # Redirect make_offer_for_land to bid_on_land
    if activity_type == "make_offer_for_land":
        log.info(f"Redirecting activityType 'make_offer_for_land' to 'bid_on_land' for citizen {citizen_username}.")
        activity_type = "bid_on_land"

    if activity_type == "eat_from_inventory":
        log.info(f"Dispatching to _handle_eat_from_inventory for {citizen_name}.")
        if not is_hungry:
            return {"success": False, "message": f"{citizen_name} is not hungry.", "activity": None, "reason": "not_hungry"}
        first_activity_of_chain = _handle_eat_from_inventory(*handler_args)
        if first_activity_of_chain:
            return {"success": True, "message": f"Eating from inventory endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields']['Type']}.", "activity": first_activity_of_chain['fields']}
        else:
            return {"success": False, "message": f"Could not initiate eating from inventory for {citizen_name}.", "activity": None, "reason": "no_food_in_inventory_or_error"}

    elif activity_type == "eat_at_home":
        log.info(f"Dispatching to _handle_eat_at_home_or_goto for {citizen_name}.")
        if not is_hungry:
            return {"success": False, "message": f"{citizen_name} is not hungry.", "activity": None, "reason": "not_hungry"}
        first_activity_of_chain = _handle_eat_at_home_or_goto(*handler_args)
        if first_activity_of_chain:
            return {"success": True, "message": f"Eating at home endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields']['Type']}.", "activity": first_activity_of_chain['fields']}
        else:
            return {"success": False, "message": f"Could not initiate eating at home for {citizen_name}.", "activity": None, "reason": "no_food_at_home_or_path_issue"}

    elif activity_type == "eat_at_tavern":
        log.info(f"Dispatching to _handle_eat_at_tavern_or_goto for {citizen_name}.")
        if not is_hungry:
            return {"success": False, "message": f"{citizen_name} is not hungry.", "activity": None, "reason": "not_hungry"}
        first_activity_of_chain = _handle_eat_at_tavern_or_goto(*handler_args)
        if first_activity_of_chain:
            return {"success": True, "message": f"Eating at tavern endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields']['Type']}.", "activity": first_activity_of_chain['fields']}
        else:
            return {"success": False, "message": f"Could not initiate eating at tavern for {citizen_name}.", "activity": None, "reason": "no_tavern_found_or_funds_issue"}
            
    elif activity_type == "eat": # Generic "eat" with strategy
        strategy = params.get("strategy", "default_order")
        strategy_applied = strategy

        if not is_hungry:
             return {"success": False, "message": f"{citizen_name} is not hungry.", "activity": None, "reason": "not_hungry"}

        if strategy == "inventory":
            first_activity_of_chain = _handle_eat_from_inventory(*handler_args)
        elif strategy == "home":
            first_activity_of_chain = _handle_eat_at_home_or_goto(*handler_args)
        elif strategy == "tavern":
            first_activity_of_chain = _handle_eat_at_tavern_or_goto(*handler_args)
        else: # Default order if no specific strategy or unknown
            first_activity_of_chain = _handle_eat_from_inventory(*handler_args)
            if not first_activity_of_chain:
                first_activity_of_chain = _handle_eat_at_home_or_goto(*handler_args)
            if not first_activity_of_chain:
                first_activity_of_chain = _handle_eat_at_tavern_or_goto(*handler_args)
        
        if first_activity_of_chain:
            return {"success": True, "message": f"Eating endeavor initiated for {citizen_name} (strategy: {strategy_applied}). First activity: {first_activity_of_chain['fields']['Type']}.", "activity": first_activity_of_chain['fields']}
        else:
            return {"success": False, "message": f"Could not initiate eating endeavor for {citizen_name} (strategy: {strategy_applied}).", "activity": None, "reason": "no_eating_option_found"}

    elif activity_type == "leave_venice":
        # _handle_leave_venice should already create the necessary chain (e.g., goto_dock then leave_venice)
        # and return the first activity of that chain.
        first_activity_of_chain = _handle_leave_venice(*handler_args)
        if first_activity_of_chain:
            return {"success": True, "message": f"Leave Venice endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields']['Type']}.", "activity": first_activity_of_chain['fields']}
        else:
            return {"success": False, "message": f"Could not initiate 'leave_venice' endeavor for {citizen_name}.", "activity": None, "reason": "conditions_not_met_or_pathfinding_failed"}

    elif activity_type == "seek_shelter": # Example for a new high-level endeavor
        # _handle_night_shelter creates chains (e.g. goto_home then rest)
        first_activity_of_chain = _handle_night_shelter(*handler_args)
        if first_activity_of_chain:
            return {"success": True, "message": f"Seek shelter endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields']['Type']}.", "activity": first_activity_of_chain['fields']}
        else:
            return {"success": False, "message": f"Could not find or initiate shelter endeavor for {citizen_name}.", "activity": None, "reason": "no_shelter_option_found"}

    elif activity_type == "fetch_resource":
        log.info(f"Dispatching to resource_fetching_activity_creator for {citizen_name} with params: {activity_parameters}")
        # Parameters for try_create_resource_fetching_activity:
        # tables, citizen_airtable_id, citizen_custom_id, citizen_username,
        # contract_custom_id, from_building_custom_id, to_building_custom_id,
        # resource_type_id, amount, path_data, current_time_utc, resource_defs, start_time_utc_iso
        
        # Extract parameters from activity_parameters
        contract_id_param = params.get("contractId") # This is the custom ContractId string
        from_building_id_param = params.get("fromBuildingId")
        to_building_id_param = params.get("toBuildingId") # Can be None
        resource_type_id_param = params.get("resourceTypeId")
        amount_param = float(params.get("amount", 0.0))
        
        # Path data is tricky here. If the AI requests a fetch_resource, it implies the citizen
        # might need to travel to the from_building first.
        # The resource_fetching_activity_creator expects path_data from current location to from_building.
        # For orchestrated creation, we might need to calculate this path here if not provided.
        # For now, assume path_data might be None or provided if AI is smart.
        # If path_data is None, the creator might assume citizen is already at from_building or handle it.
        # Let's assume for now that if AI calls this, it's for an immediate fetch from a known location,
        # or the creator handles finding the source if from_building_id_param is None.

        path_data_param = params.get("pathData") # Optional: AI might provide pre-calculated path

        if not resource_type_id_param or amount_param <= 0:
            return {"success": False, "message": "Missing resourceTypeId or invalid amount for fetch_resource.", "activity": None, "reason": "missing_fetch_parameters"}

        # The resource_fetching_activity_creator.try_create function is imported as try_create_resource_fetching_activity
        first_activity_of_chain = try_create_resource_fetching_activity(
            tables=tables,
            citizen_airtable_id=citizen_airtable_id,
            citizen_custom_id=citizen_custom_id,
            citizen_username=citizen_username,
            contract_custom_id=contract_id_param,
            from_building_custom_id=from_building_id_param,
            to_building_custom_id=to_building_id_param,
            resource_type_id=resource_type_id_param,
            amount=amount_param,
            path_data=path_data_param, # Pass path_data if provided
            current_time_utc=now_utc_dt,
            resource_defs=resource_defs,
            start_time_utc_iso=params.get("startTimeUtcIso") # Allow explicit start time
        )
        if first_activity_of_chain and isinstance(first_activity_of_chain, dict) and 'fields' in first_activity_of_chain:
            return {"success": True, "message": f"Fetch resource endeavor initiated for {citizen_name}. Activity: {first_activity_of_chain['fields'].get('Type', 'N/A')}.", "activity": first_activity_of_chain['fields']}
        else:
            log.warning(f"resource_fetching_activity_creator did not return a valid activity record for {citizen_name}. Returned: {first_activity_of_chain}")
            return {"success": False, "message": f"Could not initiate 'fetch_resource' endeavor for {citizen_name}.", "activity": None, "reason": "fetch_resource_creation_failed"}
            
    # TODO: Add more handlers for other high-level activityTypes like "work_at_business", "shop_for_item", etc.
    # These would involve:
    # 1. Checking prerequisites (e.g., has workplace, has money).
    # 2. Determining if travel is needed.
    # 3. Calling appropriate activity creators in sequence.
    # Example: "work_at_business"
    # elif activity_type == "work_at_business":
    #     workplace_rec = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
    #     if not workplace_rec:
    #         return {"success": False, "message": f"{citizen_name} has no workplace.", "activity": None, "reason": "no_workplace"}
    #     
    #     workplace_pos = _get_building_position_coords(workplace_rec)
    #     is_at_work = citizen_position and workplace_pos and _calculate_distance_meters(citizen_position, workplace_pos) < 20
    #
    #     if is_at_work:
    #         # Directly try to create a production/work task
    #         # This might call a sub-handler like _handle_production_and_general_work_tasks
    #         # which itself needs to return the first activity of a potential chain.
    #         first_activity_of_chain = _handle_production_and_general_work_tasks(*handler_args) # Assuming it's adapted
    #     else:
    #         # Create goto_work, then chain production/work
    #         path_to_work = get_path_between_points(citizen_position, workplace_pos, transport_api_url)
    #         if path_to_work and path_to_work.get('success'):
    #             first_activity_of_chain = try_create_goto_work_activity(...) # Create goto_work
    #             if first_activity_of_chain:
    #                 # Chain the actual work activity (e.g., production)
    #                 # next_work_start_time = first_activity_of_chain['fields']['EndDate']
    #                 # Call try_create_production_activity with start_time_utc_iso = next_work_start_time
    #                 pass # Placeholder for chaining logic
    #     # ... return based on first_activity_of_chain ...

    elif activity_type == "initiate_building_project":
        log.info(f"Dispatching to initiate_building_project_creator for {citizen_name} with params: {activity_parameters}")
        # The initiate_building_project_creator.try_create might return an Airtable record directly,
        # OR a dict like {'success': True, 'activity_fields': {...}}
        creator_response = try_create_initiate_building_project_activity(
            tables,
            citizen_record_full,
            activity_parameters if activity_parameters is not None else {},
            resource_defs,
            building_type_defs,
            now_venice_dt,
            now_utc_dt,
            transport_api_url,
            api_base_url
        )

        activity_fields_to_return = None
        # Default success message, might be overridden by creator's message
        success_message = f"Initiate building project endeavor initiated for {citizen_name}."

        if creator_response and isinstance(creator_response, dict):
            if 'fields' in creator_response: # Case 1: Creator returned an Airtable record {id: ..., fields: ...}
                activity_fields_to_return = creator_response['fields']
                # Append activity type to message if available
                success_message = f"Initiate building project endeavor initiated for {citizen_name}. First activity: {activity_fields_to_return.get('Type', 'N/A')}."
            elif creator_response.get('success') is True and 'activity_fields' in creator_response and isinstance(creator_response['activity_fields'], dict):
                # Case 2: Creator returned {'success': True, 'activity_fields': {...}}
                activity_fields_to_return = creator_response['activity_fields']
                success_message = creator_response.get('message', success_message)
                # Ensure the message reflects the actual activity type if available and not already in creator's message
                activity_type_from_fields = activity_fields_to_return.get('Type', 'N/A')
                if activity_type_from_fields not in success_message: # Avoid duplicating if creator message already has it
                    success_message += f" First activity: {activity_type_from_fields}."
            elif creator_response.get('success') is True and 'activity' in creator_response and isinstance(creator_response['activity'], dict):
                # Case 3: Creator returned {'success': True, 'activity': {...activity_fields...}}
                activity_fields_to_return = creator_response['activity']
                success_message = creator_response.get('message', success_message)
                activity_type_from_fields = activity_fields_to_return.get('Type', 'N/A')
                if activity_type_from_fields not in success_message:
                    success_message += f" First activity: {activity_type_from_fields}."


        if activity_fields_to_return:
            return {"success": True, "message": success_message, "activity": activity_fields_to_return}
        else:
            log.warning(f"initiate_building_project_creator did not return a valid activity record or expected success structure for {citizen_name}. Returned: {creator_response}")
            failure_message = f"Could not initiate 'initiate_building_project' endeavor for {citizen_name}."
            reason = "initiate_building_project_creation_failed_or_invalid_response"
            # If creator returned a dict with success=False and a message/reason, use that
            if isinstance(creator_response, dict) and creator_response.get('success') is False:
                failure_message = creator_response.get('message', failure_message)
                reason = creator_response.get('reason', reason)
            return {"success": False, "message": failure_message, "activity": None, "reason": reason}

    elif activity_type == "send_message":
        log.info(f"Dispatching to send_message_creator for {citizen_name} with params: {activity_parameters}")
        # The send_message_creator.try_create expects `tables`, `citizen_record`, and `details` (which are activityParameters)
        # It will now return the first activity record of the chain, or None.
        first_activity_of_chain = try_create_send_message_chain(
            tables, 
            citizen_record_full, 
            activity_parameters if activity_parameters is not None else {} # Ensure details is a dict
        )
        if first_activity_of_chain and isinstance(first_activity_of_chain, dict) and 'fields' in first_activity_of_chain:
            return {"success": True, "message": f"Send message endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields'].get('Type', 'N/A')}.", "activity": first_activity_of_chain['fields']}
        else:
            log.warning(f"send_message_creator did not return a valid activity record for {citizen_name}. Returned: {first_activity_of_chain}")
            return {"success": False, "message": f"Could not initiate 'send_message' endeavor for {citizen_name}.", "activity": None, "reason": "send_message_creation_failed"}

    elif activity_type == "manage_public_storage_offer":
        log.info(f"Dispatching to manage_public_storage_offer_creator for {citizen_name} with params: {activity_parameters}")
        first_activity_of_chain = try_create_manage_public_storage_offer_chain(
            tables, citizen_record_full, activity_parameters or {},
            resource_defs, building_type_defs,
            now_venice_dt, now_utc_dt,
            transport_api_url, api_base_url
        )
        if first_activity_of_chain and isinstance(first_activity_of_chain, dict) and 'fields' in first_activity_of_chain:
            return {"success": True, "message": f"Manage public storage offer endeavor initiated for {citizen_name}. First activity: {first_activity_of_chain['fields'].get('Type', 'N/A')}.", "activity": first_activity_of_chain['fields']}
        else:
            log.warning(f"manage_public_storage_offer_creator did not return a valid activity record for {citizen_name}. Returned: {first_activity_of_chain}")
            return {"success": False, "message": f"Could not initiate 'manage_public_storage_offer' endeavor for {citizen_name}.", "activity": None, "reason": "manage_public_storage_offer_creation_failed"}

    elif activity_type == "bid_on_land":
        log.info(f"Dispatching to make_offer_for_land_creator (aliased for bid_on_land) for {citizen_name} (original type: {original_activity_type}) with params: {activity_parameters}")
        # Use make_offer_for_land_creator as bid_on_land_activity_creator was removed and functionality merged.
        from backend.engine.activity_creators.make_offer_for_land_creator import try_create as try_create_bid_on_land_chain
        # The try_create function from make_offer_for_land_creator will be used.
        activities_to_create_payloads = try_create_bid_on_land_chain(
            tables,
            citizen_record_full,
            activity_type, # Pass the actual activity_type
            activity_parameters if activity_parameters is not None else {},
            now_venice_dt, # Pass now_venice_dt
            now_utc_dt,    # Pass now_utc_dt
            transport_api_url, # Pass transport_api_url
            api_base_url       # Pass api_base_url
        )
        
        created_airtable_records = []
        if activities_to_create_payloads and isinstance(activities_to_create_payloads, list):
            for activity_payload in activities_to_create_payloads:
                if not isinstance(activity_payload, dict):
                    log.error(f"{LogColors.FAIL}Creator for {activity_type} returned non-dict item in list: {activity_payload}{LogColors.ENDC}")
                    return {"success": False, "message": f"Internal error: activity creator for {original_activity_type} returned invalid payload.", "activity": None, "reason": "invalid_creator_payload"}
                try:
                    # Ensure essential fields are present if not set by creator
                    if 'ActivityId' not in activity_payload or not activity_payload['ActivityId']:
                         activity_payload['ActivityId'] = f"{activity_payload.get('Type', 'unknown').lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
                    if 'Citizen' not in activity_payload:
                         activity_payload['Citizen'] = citizen_username
                    if 'Status' not in activity_payload:
                         activity_payload['Status'] = 'created'
                    if 'CreatedAt' not in activity_payload:
                         activity_payload['CreatedAt'] = now_utc_dt.isoformat()
                    # UpdatedAt is handled by Airtable, remove if present
                    if 'UpdatedAt' in activity_payload:
                        del activity_payload['UpdatedAt']

                    created_record = tables['activities'].create(activity_payload)
                    created_airtable_records.append(created_record)
                    log.info(f"{LogColors.SUCCESS}Successfully created activity {created_record['fields'].get('ActivityId')} of type {created_record['fields'].get('Type')} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e:
                    log.error(f"{LogColors.FAIL}Failed to create activity in Airtable for {citizen_username}. Payload: {json.dumps(activity_payload, indent=2)}. Error: {e}{LogColors.ENDC}")
                    return {"success": False, "message": f"Error creating activity chain for {original_activity_type}: {e}", "activity": None, "reason": "airtable_creation_error"}
        
        if created_airtable_records:
            first_created_activity_fields = created_airtable_records[0]['fields']
            message = f"Bid on land endeavor (originally {original_activity_type}) initiated for {citizen_name}. First activity: {first_created_activity_fields.get('Type', 'N/A')}."
            return {"success": True, "message": message, "activity": first_created_activity_fields}
        else:
            log.warning(f"{LogColors.WARNING}Activity creator for '{original_activity_type}' did not return any activities to create for {citizen_name}.{LogColors.ENDC}")
            return {"success": False, "message": f"Could not initiate '{original_activity_type}' endeavor for {citizen_name}.", "activity": None, "reason": f"{original_activity_type}_creation_failed_no_payloads"}

    elif activity_type == "buy_listed_land":
        log.info(f"Dispatching to buy_listed_land_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.buy_listed_land_creator import try_create as try_create_buy_listed_land_activity
        
        activities_chain = try_create_buy_listed_land_activity(
            tables,
            citizen_record_full,
            activity_type,
            activity_parameters if activity_parameters is not None else {},
            now_venice_dt,
            now_utc_dt,
            transport_api_url,
            api_base_url
        )
        
        created_airtable_records = []
        if activities_chain and isinstance(activities_chain, list): # Renamed activities_to_create_payloads to activities_chain to match existing code
            for activity_payload in activities_chain:
                if not isinstance(activity_payload, dict):
                    log.error(f"{LogColors.FAIL}Creator for {activity_type} returned non-dict item in list: {activity_payload}{LogColors.ENDC}")
                    return {"success": False, "message": f"Internal error: activity creator for {original_activity_type} returned invalid payload.", "activity": None, "reason": "invalid_creator_payload"}
                try:
                    # Ensure essential fields are present if not set by creator
                    if 'ActivityId' not in activity_payload or not activity_payload['ActivityId']:
                         activity_payload['ActivityId'] = f"{activity_payload.get('Type', 'unknown').lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
                    if 'Citizen' not in activity_payload:
                         activity_payload['Citizen'] = citizen_username
                    if 'Status' not in activity_payload:
                         activity_payload['Status'] = 'created'
                    if 'CreatedAt' not in activity_payload:
                         activity_payload['CreatedAt'] = now_utc_dt.isoformat()
                    if 'UpdatedAt' in activity_payload: # Ensure UpdatedAt is not sent
                        del activity_payload['UpdatedAt']

                    created_record = tables['activities'].create(activity_payload)
                    created_airtable_records.append(created_record)
                    log.info(f"{LogColors.SUCCESS}Successfully created activity {created_record['fields'].get('ActivityId')} of type {created_record['fields'].get('Type')} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e:
                    log.error(f"{LogColors.FAIL}Failed to create activity in Airtable for {citizen_username}. Payload: {json.dumps(activity_payload, indent=2)}. Error: {e}{LogColors.ENDC}")
                    return {"success": False, "message": f"Error creating activity chain for {original_activity_type}: {e}", "activity": None, "reason": "airtable_creation_error"}
        
        if created_airtable_records:
            first_created_activity_fields = created_airtable_records[0]['fields']
            message = f"Buy listed land endeavor (originally {original_activity_type}) initiated for {citizen_name}. First activity: {first_created_activity_fields.get('Type', 'N/A')}."
            return {"success": True, "message": message, "activity": first_created_activity_fields}
        else:
            log.warning(f"{LogColors.WARNING}Activity creator for '{original_activity_type}' did not return any activities to create for {citizen_name}. Returned: {activities_chain}{LogColors.ENDC}")
            return {"success": False, "message": f"Could not initiate '{original_activity_type}' endeavor for {citizen_name}.", "activity": None, "reason": f"{original_activity_type}_creation_failed_no_payloads"}

    elif activity_type == "list_land_for_sale":
        log.info(f"Dispatching to list_land_for_sale_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.list_land_for_sale_creator import try_create as try_create_list_land_for_sale_activity
        
        activities_to_create_payloads = try_create_list_land_for_sale_activity(
            tables, citizen_record_full, activity_type, 
            activity_parameters or {}, 
            now_venice_dt, now_utc_dt, 
            transport_api_url, api_base_url
        )
        
        created_airtable_records = []
        if activities_to_create_payloads and isinstance(activities_to_create_payloads, list):
            for activity_payload in activities_to_create_payloads:
                if not isinstance(activity_payload, dict):
                    log.error(f"{LogColors.FAIL}Creator for {activity_type} returned non-dict item in list: {activity_payload}{LogColors.ENDC}")
                    return {"success": False, "message": f"Internal error: activity creator for {original_activity_type} returned invalid payload.", "activity": None, "reason": "invalid_creator_payload"}
                try:
                    # Ensure essential fields are present if not set by creator
                    if 'ActivityId' not in activity_payload or not activity_payload['ActivityId']:
                         activity_payload['ActivityId'] = f"{activity_payload.get('Type', 'unknown').lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
                    if 'Citizen' not in activity_payload:
                         activity_payload['Citizen'] = citizen_username
                    if 'Status' not in activity_payload:
                         activity_payload['Status'] = 'created'
                    if 'CreatedAt' not in activity_payload:
                         activity_payload['CreatedAt'] = now_utc_dt.isoformat()
                    if 'UpdatedAt' in activity_payload: # Ensure UpdatedAt is not sent
                        del activity_payload['UpdatedAt']

                    created_record = tables['activities'].create(activity_payload)
                    created_airtable_records.append(created_record)
                    log.info(f"{LogColors.SUCCESS}Successfully created activity {created_record['fields'].get('ActivityId')} of type {created_record['fields'].get('Type')} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e:
                    log.error(f"{LogColors.FAIL}Failed to create activity in Airtable for {citizen_username}. Payload: {json.dumps(activity_payload, indent=2)}. Error: {e}{LogColors.ENDC}")
                    return {"success": False, "message": f"Error creating activity chain for {original_activity_type}: {e}", "activity": None, "reason": "airtable_creation_error"}
        
        if created_airtable_records:
            first_created_activity_fields = created_airtable_records[0]['fields']
            message = f"List land for sale endeavor (originally {original_activity_type}) initiated for {citizen_name}. First activity: {first_created_activity_fields.get('Type', 'N/A')}."
            return {"success": True, "message": message, "activity": first_created_activity_fields}
        else:
            log.warning(f"{LogColors.WARNING}Activity creator for '{original_activity_type}' did not return any activities to create for {citizen_name}. Returned: {activities_to_create_payloads}{LogColors.ENDC}")
            return {"success": False, "message": f"Could not initiate '{original_activity_type}' endeavor for {citizen_name}.", "activity": None, "reason": f"{original_activity_type}_creation_failed_no_payloads"}

    elif activity_type == "accept_land_offer":
        log.info(f"Dispatching to accept_land_offer_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.accept_land_offer_creator import try_create as try_create_accept_land_offer_activity
        activities_chain = try_create_accept_land_offer_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Accept land offer endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"accept_land_offer_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'accept_land_offer'.", "activity": None, "reason": "accept_land_offer_creation_failed"}

    elif activity_type == "cancel_land_listing":
        log.info(f"Dispatching to cancel_land_listing_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.cancel_land_listing_creator import try_create as try_create_cancel_land_listing_activity
        activities_chain = try_create_cancel_land_listing_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Cancel land listing endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"cancel_land_listing_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'cancel_land_listing'.", "activity": None, "reason": "cancel_land_listing_creation_failed"}

    elif activity_type == "cancel_land_offer":
        log.info(f"Dispatching to cancel_land_offer_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.cancel_land_offer_creator import try_create as try_create_cancel_land_offer_activity
        
        activities_to_create_payloads = try_create_cancel_land_offer_activity(
            tables, citizen_record_full, activity_type, 
            activity_parameters or {}, 
            now_venice_dt, now_utc_dt, 
            transport_api_url, api_base_url
        )
        
        created_airtable_records = []
        if activities_to_create_payloads and isinstance(activities_to_create_payloads, list):
            for activity_payload in activities_to_create_payloads:
                if not isinstance(activity_payload, dict):
                    log.error(f"{LogColors.FAIL}Creator for {activity_type} returned non-dict item in list: {activity_payload}{LogColors.ENDC}")
                    return {"success": False, "message": f"Internal error: activity creator for {original_activity_type} returned invalid payload.", "activity": None, "reason": "invalid_creator_payload"}
                try:
                    # Ensure essential fields are present if not set by creator
                    if 'ActivityId' not in activity_payload or not activity_payload['ActivityId']:
                         activity_payload['ActivityId'] = f"{activity_payload.get('Type', 'unknown').lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
                    if 'Citizen' not in activity_payload:
                         activity_payload['Citizen'] = citizen_username
                    if 'Status' not in activity_payload:
                         activity_payload['Status'] = 'created'
                    if 'CreatedAt' not in activity_payload:
                         activity_payload['CreatedAt'] = now_utc_dt.isoformat()
                    if 'UpdatedAt' in activity_payload: # Ensure UpdatedAt is not sent
                        del activity_payload['UpdatedAt']

                    created_record = tables['activities'].create(activity_payload)
                    created_airtable_records.append(created_record)
                    log.info(f"{LogColors.SUCCESS}Successfully created activity {created_record['fields'].get('ActivityId')} of type {created_record['fields'].get('Type')} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e:
                    log.error(f"{LogColors.FAIL}Failed to create activity in Airtable for {citizen_username}. Payload: {json.dumps(activity_payload, indent=2)}. Error: {e}{LogColors.ENDC}")
                    return {"success": False, "message": f"Error creating activity chain for {original_activity_type}: {e}", "activity": None, "reason": "airtable_creation_error"}
        
        if created_airtable_records:
            first_created_activity_fields = created_airtable_records[0]['fields']
            message = f"Cancel land offer endeavor (originally {original_activity_type}) initiated for {citizen_name}. First activity: {first_created_activity_fields.get('Type', 'N/A')}."
            return {"success": True, "message": message, "activity": first_created_activity_fields}
        else:
            log.warning(f"{LogColors.WARNING}Activity creator for '{original_activity_type}' did not return any activities to create for {citizen_name}.{LogColors.ENDC}")
            return {"success": False, "message": f"Could not initiate '{original_activity_type}' endeavor for {citizen_name}.", "activity": None, "reason": f"{original_activity_type}_creation_failed_no_payloads"}

    elif activity_type == "adjust_land_lease_price":
        log.info(f"Dispatching to adjust_land_lease_price_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.adjust_land_lease_price_creator import try_create as try_create_adjust_land_lease_price_activity
        activities_chain = try_create_adjust_land_lease_price_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Adjust land lease price endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"adjust_land_lease_price_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'adjust_land_lease_price'.", "activity": None, "reason": "adjust_land_lease_price_creation_failed"}
            
    elif activity_type == "adjust_building_rent_price":
        log.info(f"Dispatching to adjust_building_rent_price_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.adjust_building_rent_price_creator import try_create as try_create_adjust_building_rent_price_activity
        activities_chain = try_create_adjust_building_rent_price_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Adjust building rent price endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"adjust_building_rent_price_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'adjust_building_rent_price'.", "activity": None, "reason": "adjust_building_rent_price_creation_failed"}

    elif activity_type == "adjust_building_lease_price":
        log.info(f"Dispatching to adjust_building_lease_price_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.adjust_building_lease_price_creator import try_create as try_create_adjust_building_lease_price_activity
        activities_chain = try_create_adjust_building_lease_price_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Adjust building lease price endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"adjust_building_lease_price_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'adjust_building_lease_price'.", "activity": None, "reason": "adjust_building_lease_price_creation_failed"}

    elif activity_type == "bid_on_building":
        log.info(f"Dispatching to bid_on_building_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.bid_on_building_activity_creator import try_create as try_create_bid_on_building_activity
        activities_chain = try_create_bid_on_building_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Bid on building endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"bid_on_building_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'bid_on_building'.", "activity": None, "reason": "bid_on_building_creation_failed"}

    elif activity_type == "manage_public_sell_contract":
        log.info(f"Dispatching to manage_public_sell_contract_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_public_sell_contract_creator import try_create as try_create_manage_public_sell_contract_activity
        
        activity_payloads = try_create_manage_public_sell_contract_activity(
            tables, citizen_record_full, activity_type, 
            activity_parameters or {}, resource_defs, building_type_defs, 
            now_venice_dt, now_utc_dt, transport_api_url, api_base_url
        )

        if not activity_payloads: # Creator returns None or empty list on failure/no action
            log.warning(f"manage_public_sell_contract_creator for {citizen_name} returned no activity payloads.")
            return {"success": False, "message": "No public sell contract activities were generated by the creator.", "activity": None, "reason": "no_activities_generated_by_creator"}

        created_airtable_records = []
        for activity_payload in activity_payloads:
            if not isinstance(activity_payload, dict):
                log.error(f"{LogColors.FAIL}Creator for {activity_type} returned non-dict item in list: {activity_payload}{LogColors.ENDC}")
                return {"success": False, "message": f"Internal error: activity creator for {original_activity_type} returned invalid payload.", "activity": None, "reason": "invalid_creator_payload"}
            try:
                if 'ActivityId' not in activity_payload or not activity_payload['ActivityId']:
                     activity_payload['ActivityId'] = f"{activity_payload.get('Type', 'unknown').lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
                if 'Citizen' not in activity_payload: activity_payload['Citizen'] = citizen_username
                if 'Status' not in activity_payload: activity_payload['Status'] = 'created'
                if 'CreatedAt' not in activity_payload: activity_payload['CreatedAt'] = now_utc_dt.isoformat()
                if 'UpdatedAt' in activity_payload: del activity_payload['UpdatedAt']

                created_record = tables['activities'].create(activity_payload)
                created_airtable_records.append(created_record)
                log.info(f"{LogColors.SUCCESS}Successfully created activity {created_record['fields'].get('ActivityId')} of type {created_record['fields'].get('Type')} for {citizen_username}.{LogColors.ENDC}")
            except Exception as e:
                log.error(f"{LogColors.FAIL}Failed to create activity in Airtable for {citizen_username}. Payload: {json.dumps(activity_payload, indent=2)}. Error: {e}{LogColors.ENDC}")
                return {"success": False, "message": f"Error creating activity chain for {original_activity_type}: {e}", "activity": None, "reason": "airtable_creation_error"}
        
        if created_airtable_records:
            first_created_activity_fields = created_airtable_records[0]['fields']
            message = f"Manage public sell contract endeavor initiated for {citizen_name}. First activity: {first_created_activity_fields.get('Type', 'N/A')}."
            return {"success": True, "message": message, "activity": first_created_activity_fields}
        else: # Should be caught by "if not activity_payloads" earlier
            log.warning(f"manage_public_sell_contract_creator for {citizen_name} returned an empty list of payloads after processing.")
            return {"success": False, "message": "Could not initiate 'manage_public_sell_contract'.", "activity": None, "reason": "manage_public_sell_contract_creation_failed_empty_payloads"}

    elif activity_type == "manage_import_contract":
        log.info(f"Dispatching to manage_import_contract_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_import_contract_creator import try_create as try_create_manage_import_contract_activity
        
        activities_chain_or_error = try_create_manage_import_contract_activity(
            tables, citizen_record_full, activity_type, 
            activity_parameters or {}, resource_defs, building_type_defs, 
            now_venice_dt, now_utc_dt, transport_api_url, api_base_url
        )

        if isinstance(activities_chain_or_error, dict) and not activities_chain_or_error.get("success", True):
            # Error dictionary returned by the creator
            log.warning(f"manage_import_contract_creator for {citizen_name} failed: {activities_chain_or_error.get('message')}")
            return {
                "success": False,
                "message": activities_chain_or_error.get("message", "Could not initiate 'manage_import_contract' due to creator error."),
                "activity": None,
                "reason": activities_chain_or_error.get("reason", "manage_import_contract_creation_failed_from_creator")
            }
        elif isinstance(activities_chain_or_error, list):
            activity_payloads = activities_chain_or_error
            if not activity_payloads:
                log.warning(f"manage_import_contract_creator for {citizen_name} returned no activity payloads.")
                return {"success": False, "message": "No import contract activities were generated by the creator.", "activity": None, "reason": "no_activities_generated_by_creator"}

            created_airtable_records = []
            for activity_payload in activity_payloads:
                if not isinstance(activity_payload, dict):
                    log.error(f"{LogColors.FAIL}Creator for {activity_type} returned non-dict item in list: {activity_payload}{LogColors.ENDC}")
                    return {"success": False, "message": f"Internal error: activity creator for {original_activity_type} returned invalid payload.", "activity": None, "reason": "invalid_creator_payload"}
                try:
                    if 'ActivityId' not in activity_payload or not activity_payload['ActivityId']:
                         activity_payload['ActivityId'] = f"{activity_payload.get('Type', 'unknown').lower().replace('_', '-')}-{citizen_username.lower()}-{uuid.uuid4().hex[:8]}"
                    if 'Citizen' not in activity_payload: activity_payload['Citizen'] = citizen_username
                    if 'Status' not in activity_payload: activity_payload['Status'] = 'created'
                    if 'CreatedAt' not in activity_payload: activity_payload['CreatedAt'] = now_utc_dt.isoformat()
                    if 'UpdatedAt' in activity_payload: del activity_payload['UpdatedAt']

                    created_record = tables['activities'].create(activity_payload)
                    created_airtable_records.append(created_record)
                    log.info(f"{LogColors.SUCCESS}Successfully created activity {created_record['fields'].get('ActivityId')} of type {created_record['fields'].get('Type')} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e:
                    log.error(f"{LogColors.FAIL}Failed to create activity in Airtable for {citizen_username}. Payload: {json.dumps(activity_payload, indent=2)}. Error: {e}{LogColors.ENDC}")
                    return {"success": False, "message": f"Error creating activity chain for {original_activity_type}: {e}", "activity": None, "reason": "airtable_creation_error"}
            
            if created_airtable_records:
                first_created_activity_fields = created_airtable_records[0]['fields']
                message = f"Manage import contract endeavor initiated for {citizen_name}. First activity: {first_created_activity_fields.get('Type', 'N/A')}."
                return {"success": True, "message": message, "activity": first_created_activity_fields}
            else: # Should be caught by "if not activity_payloads" earlier
                log.warning(f"manage_import_contract_creator for {citizen_name} returned an empty list of payloads after processing.")
                return {"success": False, "message": "Could not initiate 'manage_import_contract'.", "activity": None, "reason": "manage_import_contract_creation_failed_empty_payloads"}
        else: # Unexpected return type from creator
            log.error(f"manage_import_contract_creator for {citizen_name} returned unexpected data type: {type(activities_chain_or_error)}. Expected list or error dict.")
            return {"success": False, "message": "Internal error: Unexpected response from import contract creator.", "activity": None, "reason": "unexpected_creator_response"}

    elif activity_type == "manage_public_import_contract":
        log.info(f"Dispatching to manage_public_import_contract_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_public_import_contract_creator import try_create as try_create_manage_public_import_contract_activity
        activities_chain = try_create_manage_public_import_contract_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, resource_defs, building_type_defs, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Manage public import contract endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"manage_public_import_contract_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'manage_public_import_contract'.", "activity": None, "reason": "manage_public_import_contract_creation_failed"}

    elif activity_type == "manage_logistics_service_contract":
        log.info(f"Dispatching to manage_logistics_service_contract_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_logistics_service_contract_creator import try_create as try_create_manage_logistics_service_contract_activity
        activities_chain = try_create_manage_logistics_service_contract_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, resource_defs, building_type_defs, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Manage logistics service contract endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"manage_logistics_service_contract_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'manage_logistics_service_contract'.", "activity": None, "reason": "manage_logistics_service_contract_creation_failed"}

    elif activity_type == "adjust_business_wages":
        log.info(f"Dispatching to adjust_business_wages_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.adjust_business_wages_creator import try_create as try_create_adjust_business_wages_activity
        activities_chain = try_create_adjust_business_wages_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Adjust business wages endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"adjust_business_wages_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'adjust_business_wages'.", "activity": None, "reason": "adjust_business_wages_creation_failed"}

    elif activity_type == "change_business_manager":
        log.info(f"Dispatching to change_business_manager_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.change_business_manager_creator import try_create as try_create_change_business_manager_activity
        activities_chain = try_create_change_business_manager_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Change business manager endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"change_business_manager_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'change_business_manager'.", "activity": None, "reason": "change_business_manager_creation_failed"}

    elif activity_type == "request_loan":
        log.info(f"Dispatching to request_loan_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.request_loan_creator import try_create as try_create_request_loan_activity
        activities_chain = try_create_request_loan_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Request loan endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"request_loan_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'request_loan'.", "activity": None, "reason": "request_loan_creation_failed"}

    elif activity_type == "offer_loan":
        log.info(f"Dispatching to offer_loan_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.offer_loan_creator import try_create as try_create_offer_loan_activity
        activities_chain = try_create_offer_loan_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Offer loan endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"offer_loan_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'offer_loan'.", "activity": None, "reason": "offer_loan_creation_failed"}

    elif activity_type == "manage_guild_membership":
        log.info(f"Dispatching to manage_guild_membership_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_guild_membership_creator import try_create as try_create_manage_guild_membership_activity
        activities_chain = try_create_manage_guild_membership_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Manage guild membership endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"manage_guild_membership_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'manage_guild_membership'.", "activity": None, "reason": "manage_guild_membership_creation_failed"}

    elif activity_type == "buy_available_land":
        log.info(f"Dispatching to buy_available_land_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.buy_available_land_creator import try_create as try_create_buy_available_land_activity
        activities_chain = try_create_buy_available_land_activity(
            tables, citizen_record_full, activity_type, activity_parameters or {}, 
            now_venice_dt, now_utc_dt, transport_api_url, api_base_url
        )
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Buy available land endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"buy_available_land_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'buy_available_land'.", "activity": None, "reason": "buy_available_land_creation_failed"}

    elif activity_type == "respond_to_building_bid":
        log.info(f"Dispatching to respond_to_building_bid_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.respond_to_building_bid_creator import try_create as try_create_respond_to_building_bid_activity
        activities_chain = try_create_respond_to_building_bid_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Respond to building bid endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"respond_to_building_bid_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'respond_to_building_bid'.", "activity": None, "reason": "respond_to_building_bid_creation_failed"}

    elif activity_type == "withdraw_building_bid":
        log.info(f"Dispatching to withdraw_building_bid_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.withdraw_building_bid_creator import try_create as try_create_withdraw_building_bid_activity
        activities_chain = try_create_withdraw_building_bid_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Withdraw building bid endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"withdraw_building_bid_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'withdraw_building_bid'.", "activity": None, "reason": "withdraw_building_bid_creation_failed"}

    elif activity_type == "manage_markup_buy_contract":
        log.info(f"Dispatching to manage_markup_buy_contract_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_markup_buy_contract_creator import try_create as try_create_manage_markup_buy_contract_activity
        activities_chain = try_create_manage_markup_buy_contract_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, resource_defs, building_type_defs, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Manage markup buy contract endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"manage_markup_buy_contract_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'manage_markup_buy_contract'.", "activity": None, "reason": "manage_markup_buy_contract_creation_failed"}

    elif activity_type == "manage_storage_query_contract":
        log.info(f"Dispatching to manage_storage_query_contract_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.manage_storage_query_contract_creator import try_create as try_create_manage_storage_query_contract_activity
        activities_chain = try_create_manage_storage_query_contract_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, resource_defs, building_type_defs, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Manage storage query contract endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"manage_storage_query_contract_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'manage_storage_query_contract'.", "activity": None, "reason": "manage_storage_query_contract_creation_failed"}

    elif activity_type == "update_citizen_profile":
        log.info(f"Dispatching to update_citizen_profile_creator for {citizen_name} with params: {activity_parameters}")
        from backend.engine.activity_creators.update_citizen_profile_creator import try_create as try_create_update_citizen_profile_activity
        activities_chain = try_create_update_citizen_profile_activity(tables, citizen_record_full, activity_type, activity_parameters or {}, now_venice_dt, now_utc_dt, transport_api_url, api_base_url)
        first_activity_of_chain_fields = activities_chain[0] if activities_chain else None
        if first_activity_of_chain_fields and isinstance(first_activity_of_chain_fields, dict) and 'ActivityId' in first_activity_of_chain_fields:
            return {"success": True, "message": f"Update citizen profile endeavor initiated. First activity: {first_activity_of_chain_fields.get('Type', 'N/A')}.", "activity": first_activity_of_chain_fields}
        else:
            log.warning(f"update_citizen_profile_creator did not return valid activity. Returned: {activities_chain}")
            return {"success": False, "message": "Could not initiate 'update_citizen_profile'.", "activity": None, "reason": "update_citizen_profile_creation_failed"}
    
    # Add other activity_type handlers here as needed, for example:
    # elif activity_type == "manage_public_sell_contract":
    #     # Import and call its specific creator function
    #     # from backend.engine.activity_creators.manage_public_sell_contract_creator import try_create as try_create_manage_public_sell_chain
    #     # first_activity_of_chain = try_create_manage_public_sell_chain(...)
    #     # ... handle response ...
    #     pass

    else: # Fallback for unsupported or not-yet-implemented high-level types
        supported_orchestrated_types = [
            'eat', 'eat_from_inventory', 'eat_at_home', 'eat_at_tavern', 
            'leave_venice', 'seek_shelter', 'fetch_resource', # Added fetch_resource
            'initiate_building_project', 
            'send_message', 'manage_public_storage_offer', 'bid_on_land',
            'buy_listed_land', 'buy_available_land', # Added buy_available_land
            'list_land_for_sale', 'accept_land_offer', 'cancel_land_listing', 'cancel_land_offer',
            'adjust_land_lease_price', 'adjust_building_rent_price', 'adjust_building_lease_price',
            'bid_on_building', 'manage_public_sell_contract', 'manage_import_contract',
            'manage_public_import_contract', 'manage_logistics_service_contract',
            'adjust_business_wages', 'change_business_manager', 'request_loan', 'offer_loan',
            'manage_guild_membership',
            'respond_to_building_bid', 'withdraw_building_bid', # Added new
            'manage_markup_buy_contract', 'manage_storage_query_contract', # Added new
            'update_citizen_profile' # Added new
            # Add other explicitly handled types here as they are implemented in this dispatcher
        ]
        # Use original_activity_type in the error message if it was redirected
        error_activity_type_display = original_activity_type if original_activity_type != activity_type else activity_type
        
        error_message = (f"Activity type '{error_activity_type_display}' is not supported for orchestrated creation by the Python engine yet. "
                         f"Supported types are: {', '.join(supported_orchestrated_types)}.")
        if original_activity_type != activity_type:
            error_message += f" (Note: '{original_activity_type}' was redirected to '{activity_type}' which is also currently unhandled or failed). "

        return {"success": False, "message": error_message, "activity": None, "reason": "unsupported_orchestrated_activity_type"}


# --- Main Activity Processing Function ---

def process_citizen_activity(
    tables: Dict[str, Table],
    citizen_record: Dict,
    # is_night: bool, # This will be determined internally based on class schedule
    resource_defs: Dict,
    building_type_defs: Dict,
    now_venice_dt: datetime,
    now_utc_dt: datetime,
    transport_api_url: str,
    api_base_url: str
) -> Optional[Dict]:
    """Process activity creation for a single citizen based on prioritized handlers."""
    
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_id = citizen_record['id']
    
    if not citizen_custom_id: log.error(f"Missing CitizenId: {citizen_airtable_id}"); return None # Return None
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
        if citizen_position: 
            citizen_position_str = json.dumps(citizen_position)
        else: # Failed to assign random position
            log.warning(f"{LogColors.WARNING}Failed to assign random position for {citizen_name}. Cannot proceed with activity creation.{LogColors.ENDC}")
            # Create an immediate idle activity if position assignment fails critically
            idle_end_time_iso_critical = (now_utc_dt + timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            return try_create_idle_activity(
                tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                end_date_iso=idle_end_time_iso_critical,
                reason_message="Critical: Failed to determine or assign citizen position.",
                current_time_utc=now_utc_dt, start_time_utc_iso=None
            )

    # Determine hunger state once
    is_hungry = False
    ate_at_str = citizen_record['fields'].get('AteAt')
    if ate_at_str:
        try:
            ate_at_dt = datetime.fromisoformat(ate_at_str.replace('Z', '+00:00'))
            if ate_at_dt.tzinfo is None: ate_at_dt = pytz.UTC.localize(ate_at_dt)
            if (now_utc_dt - ate_at_dt) > timedelta(hours=12): is_hungry = True
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
        (66, _handle_manage_public_dock, "Gérer le quai public (si travail/loisir et nécessaire)"),
        
        # Movement to work if not already there and it's work time
        (70, _handle_general_goto_work, "Aller au travail (général, si heure de travail)"),
    ]

    for priority, handler_func, description in activity_handlers:
        log.info(f"{LogColors.OKBLUE}[Prio: {priority}] Citizen {citizen_name} ({citizen_social_class}): Evaluating '{description}'...{LogColors.ENDC}")
        try:
            created_activity_record = handler_func(*handler_args)
            if created_activity_record: # Handler returns the activity record or None
                activity_id = created_activity_record['fields'].get('ActivityId', created_activity_record['id']) if isinstance(created_activity_record, dict) else "unknown"
                log.info(f"{LogColors.OKGREEN}Citizen {citizen_name} ({citizen_social_class}): Activity/chain created by '{description}'. First activity: {activity_id}{LogColors.ENDC}")
                return created_activity_record # Return the first activity of the chain
        except Exception as e_handler:
            log.error(f"{LogColors.FAIL}Citizen {citizen_name} ({citizen_social_class}): ERREUR dans handler '{description}': {e_handler}{LogColors.ENDC}")
            import traceback
            log.error(traceback.format_exc())

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
        # If it's not scheduled rest time, it will return None.
        fallback_rest_activity = _handle_night_shelter(*handler_args) # Pass the same handler_args
        if fallback_rest_activity:
            log.info(f"{LogColors.OKGREEN}Fallback for {citizen_name}: 'rest' activity/chain successfully created by _handle_night_shelter.{LogColors.ENDC}")
            return fallback_rest_activity # Activity/chain created by the fallback rest attempt
        else:
            log.info(f"{LogColors.OKBLUE}Fallback for {citizen_name}: _handle_night_shelter did not create a rest activity/chain. Creating 'idle'.{LogColors.ENDC}")
    
    # If we reach here, it means we decided to create 'idle' or the fallback rest attempt failed.
    idle_end_time_iso = (now_utc_dt + timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
    # Pass None for start_time_utc_iso for immediate start
    return try_create_idle_activity(
        tables, citizen_custom_id, citizen_username, citizen_airtable_id,
        end_date_iso=idle_end_time_iso,
        reason_message="No specific tasks available after evaluating all priorities, or fallback rest attempt failed.",
        current_time_utc=now_utc_dt, start_time_utc_iso=None
    )
