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
from typing import Dict, List, Optional, Any
from pyairtable import Table

# Import helpers from the utils module
from backend.engine.utils.activity_helpers import (
    LogColors,
    _escape_airtable_value,
    _has_recent_failed_activity_for_contract,
    _get_building_position_coords,
    _calculate_distance_meters,
    is_nighttime as is_nighttime_helper, 
    is_shopping_time as is_shopping_time_helper, 
    get_path_between_points, # Corrected import name
    get_citizen_current_load,
    get_closest_inn,
    get_citizen_workplace,
    get_citizen_home,
    get_building_type_info,
    get_building_resources,
    can_produce_output,
    # find_path_between_buildings, # This helper might be redundant if get_path_between_points_helper is used
    get_citizen_contracts,
    # get_idle_citizens, # Not used by process_citizen_activity directly
    _fetch_and_assign_random_starting_position
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
    try_create_eat_at_tavern_activity
    # try_create_fetch_from_galley_activity is not used by process_citizen_activity
)

# Import from processActivities - ideally this would also be a helper
from backend.engine.processActivities import get_building_record

log = logging.getLogger(__name__) # Use the name of the current module

# Constants used by process_citizen_activity
IDLE_ACTIVITY_DURATION_HOURS = 1
CITIZEN_CARRY_CAPACITY = 10.0
SOCIAL_CLASS_VALUE = {"Nobili": 4, "Cittadini": 3, "Popolani": 2, "Facchini": 1, "Forestieri": 2}
TAVERN_MEAL_COST_ESTIMATE = 10 # Ducats
# VENICE_TIMEZONE, NIGHT_START_HOUR, NIGHT_END_HOUR, SHOPPING_START_HOUR, SHOPPING_END_HOUR
# are effectively handled by is_nighttime_helper and is_shopping_time_helper from activity_helpers.py
# However, NIGHT_END_HOUR is needed locally for stay duration calculation.
NIGHT_END_HOUR_FOR_STAY = 6 # Define locally if used for stay duration logic

def process_citizen_activity(
    tables: Dict[str, Table], 
    citizen: Dict, 
    is_night: bool, # This is pre-calculated night_time from createActivities
    resource_defs: Dict,
    now_venice_dt: datetime.datetime, # Pass current Venice time
    now_utc_dt: datetime.datetime,    # Pass current UTC time
    transport_api_url: str,
    api_base_url: str
) -> bool:
    """Process activity creation for a single citizen."""
    # Get citizen identifiers
    citizen_custom_id = citizen['fields'].get('CitizenId') # The custom ID, e.g., ctz_...
    citizen_username = citizen['fields'].get('Username')   # The Username
    citizen_airtable_record_id = citizen['id']             # The Airtable record ID, e.g., rec...

    # Validate essential identifiers
    if not citizen_custom_id:
        log.error(f"{LogColors.FAIL}Missing CitizenId in citizen record: {citizen_airtable_record_id}{LogColors.ENDC}")
        return False
    if not citizen_username:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_custom_id} (Record ID: {citizen_airtable_record_id}) has no Username, using CitizenId as fallback for username.{LogColors.ENDC}")
        citizen_username = citizen_custom_id
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    log.info(f"{LogColors.HEADER}Processing activity for citizen {citizen_name} (CustomID: {citizen_custom_id}, Username: {citizen_username}, RecordID: {citizen_airtable_record_id}){LogColors.ENDC}")
    
    # VENICE_TIMEZONE_PROC = pytz.timezone('Europe/Rome') # Not needed if now_venice_dt is passed
    # now_venice_dt = datetime.datetime.now(VENICE_TIMEZONE_PROC) # Use passed now_venice_dt
    # now_utc_dt = now_venice_dt.astimezone(pytz.UTC) # Use passed now_utc_dt

    # --- HIGH PRIORITY: HUNGER CHECK ---
    ate_at_str = citizen['fields'].get('AteAt')
    is_hungry = False
    if ate_at_str:
        try:
            if ate_at_str.endswith('Z'):
                 ate_at_dt = datetime.datetime.fromisoformat(ate_at_str[:-1] + "+00:00")
            else:
                ate_at_dt = datetime.datetime.fromisoformat(ate_at_str)

            if ate_at_dt.tzinfo is None: 
                ate_at_dt = ate_at_dt.replace(tzinfo=pytz.UTC)
            
            if (now_utc_dt - ate_at_dt) > datetime.timedelta(hours=12):
                is_hungry = True
        except ValueError as ve:
            log.warning(f"{LogColors.WARNING}Could not parse AteAt timestamp '{ate_at_str}' for citizen {citizen_username}. Error: {ve}. Assuming hungry.{LogColors.ENDC}")
            is_hungry = True 
    else: 
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no AteAt timestamp. Assuming hungry.{LogColors.ENDC}")
        is_hungry = True

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
                        log.warning(f"{LogColors.WARNING}Failed to parse coordinates from Point field: {point_str} for citizen {citizen_custom_id}{LogColors.ENDC}")
    except (json.JSONDecodeError, TypeError) as e:
        log.warning(f"{LogColors.WARNING}Invalid position data for citizen {citizen_custom_id}: {citizen['fields'].get('Position')} - Error: {str(e)}{LogColors.ENDC}")

    if not citizen_position:
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_custom_id} has no position. Attempting to assign a random starting position.{LogColors.ENDC}")
        new_position = _fetch_and_assign_random_starting_position(tables, citizen, api_base_url)
        if new_position:
            citizen_position = new_position
            log.info(f"{LogColors.OKGREEN}Assigned random starting position {citizen_position} to citizen {citizen_custom_id}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Failed to assign a random starting position to citizen {citizen_custom_id}. Creating idle activity.{LogColors.ENDC}")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data and failed to assign random position.")
            return True 

    if is_hungry:
        log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} is hungry. Attempting to create eat activity.{LogColors.ENDC}")
        food_resource_types = ["bread", "fish", "preserved_fish"] 

        for food_type in food_resource_types:
            formula = (f"AND({{AssetType}}='citizen', {{Asset}}='{_escape_airtable_value(citizen_username)}', "
                       f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type)}')")
            try:
                inventory_food = tables['resources'].all(formula=formula, max_records=1)
                if inventory_food and float(inventory_food[0]['fields'].get('Count', 0)) >= 1.0:
                    log.info(f"{LogColors.OKGREEN}Found {food_type} in {citizen_username}'s inventory. Attempting to create 'eat_from_inventory'.{LogColors.ENDC}")
                    if try_create_eat_from_inventory_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, food_type, 1.0):
                        log.info(f"{LogColors.OKGREEN}Successfully created 'eat_from_inventory' for {food_type}.{LogColors.ENDC}")
                        return True 
                    else:
                        log.warning(f"{LogColors.WARNING}Failed to create 'eat_from_inventory' for {food_type} despite being found.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}Food type {food_type} not found or insufficient in {citizen_username}'s inventory.{LogColors.ENDC}")
            except Exception as e_inv_food:
                log.error(f"{LogColors.FAIL}Error checking inventory food for {citizen_username}: {e_inv_food}{LogColors.ENDC}")
        
        log.info(f"{LogColors.OKBLUE}Finished checking inventory for food. Proceeding to check home.{LogColors.ENDC}")
        home = get_citizen_home(tables, citizen_custom_id) 
        home_position = _get_building_position_coords(home) if home else None
        is_at_home = (citizen_position and home_position and 
                      _calculate_distance_meters(citizen_position, home_position) < 20) if home else False

        if home:
            home_building_id = home['fields'].get('BuildingId', home['id']) 
            
            has_food_at_home = False
            food_type_at_home = None
            for food_type in food_resource_types:
                formula_home = (f"AND({{AssetType}}='building', {{Asset}}='{_escape_airtable_value(home_building_id)}', "
                                f"{{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='{_escape_airtable_value(food_type)}')")
                try:
                    home_food = tables['resources'].all(formula=formula_home, max_records=1)
                    if home_food and float(home_food[0]['fields'].get('Count', 0)) >= 1.0:
                        has_food_at_home = True
                        food_type_at_home = food_type
                        log.info(f"{LogColors.OKGREEN}Found {food_type_at_home} at home {home_building_id} for {citizen_username}.{LogColors.ENDC}")
                        break
                    else:
                        log.info(f"{LogColors.OKBLUE}Food type {food_type} not found or insufficient in home {home_building_id} for {citizen_username}.{LogColors.ENDC}")
                except Exception as e_home_food:
                    log.error(f"{LogColors.FAIL}Error checking home food for {citizen_username} in {home_building_id}: {e_home_food}{LogColors.ENDC}")
            
            if has_food_at_home and food_type_at_home:
                log.info(f"{LogColors.OKBLUE}Attempting to create activity to eat {food_type_at_home} at home {home_building_id}. Citizen is_at_home: {is_at_home}.{LogColors.ENDC}")
                path_data_for_eat_sequence = None
                if not is_at_home:
                    if citizen_position and home_position:
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not at home. Calculating path to home {home_building_id} to eat.{LogColors.ENDC}")
                        path_data_for_eat_sequence = get_path_between_points(citizen_position, home_position, transport_api_url) 
                        if not (path_data_for_eat_sequence and path_data_for_eat_sequence.get('success')):
                            log.warning(f"{LogColors.WARNING}Path finding to home {home_building_id} failed for {citizen_username} to eat. Path data: {path_data_for_eat_sequence}{LogColors.ENDC}")
                        else:
                            log.info(f"{LogColors.OKGREEN}Path to home {home_building_id} found for {citizen_username} to eat.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} not at home, but citizen_position or home_position is missing. Cannot pathfind to home to eat.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is already at home {home_building_id}. No pathfinding needed to eat at home.{LogColors.ENDC}")
                
                activity_created = try_create_eat_at_home_activity(
                    tables, citizen_custom_id, citizen_username, citizen_airtable_record_id,
                    home_building_id, food_type_at_home, 1.0, is_at_home, path_data_for_eat_sequence
                )
                if activity_created:
                    log.info(f"{LogColors.OKGREEN}Activity ({activity_created['fields'].get('Type')}) created for {citizen_username} regarding eating {food_type_at_home} at home.{LogColors.ENDC}")
                    return True 
                else:
                    log.warning(f"{LogColors.WARNING}Failed to create 'eat_at_home' or 'goto_home' (to eat) activity for {citizen_username} at {home_building_id}.{LogColors.ENDC}")
            else:
                log.info(f"{LogColors.OKBLUE}No food found at home {home_building_id} for {citizen_username}.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no home. Cannot eat at home.{LogColors.ENDC}")

        log.info(f"{LogColors.OKBLUE}Finished checking home for food. Proceeding to check taverns.{LogColors.ENDC}")
        citizen_ducats = float(citizen['fields'].get('Ducats', 0))
        if citizen_ducats >= TAVERN_MEAL_COST_ESTIMATE:
            if citizen_position: 
                closest_tavern = get_closest_inn(tables, citizen_position) 
                if closest_tavern:
                    tavern_position_coords = _get_building_position_coords(closest_tavern)
                    tavern_custom_id = closest_tavern['fields'].get('BuildingId', closest_tavern['id'])

                    if tavern_position_coords:
                        is_at_tavern = _calculate_distance_meters(citizen_position, tavern_position_coords) < 20
                        if is_at_tavern:
                            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is at tavern {tavern_custom_id}. Attempting to create 'eat_at_tavern' activity.{LogColors.ENDC}")
                            if try_create_eat_at_tavern_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, tavern_custom_id): 
                                log.info(f"{LogColors.OKGREEN}Successfully created 'eat_at_tavern' for {citizen_username} at {tavern_custom_id}.{LogColors.ENDC}")
                                return True
                            else:
                                log.warning(f"{LogColors.WARNING}Failed to create 'eat_at_tavern' for {citizen_username} at {tavern_custom_id} despite being there.{LogColors.ENDC}")
                        else: 
                            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} not at tavern {tavern_custom_id}. Finding path to tavern.{LogColors.ENDC}")
                            path_data = get_path_between_points(citizen_position, tavern_position_coords, transport_api_url) 
                            if path_data and path_data.get('success'):
                                log.info(f"{LogColors.OKGREEN}Path to tavern {tavern_custom_id} found. Attempting to create 'travel_to_inn' (for tavern).{LogColors.ENDC}")
                                if try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, tavern_custom_id, path_data): 
                                    log.info(f"{LogColors.OKGREEN}Successfully created 'travel_to_inn' (for tavern) for {citizen_username} to {tavern_custom_id}.{LogColors.ENDC}")
                                    return True
                                else:
                                    log.warning(f"{LogColors.WARNING}Failed to create 'travel_to_inn' (for tavern) for {citizen_username} to {tavern_custom_id}.{LogColors.ENDC}")
                            else:
                                log.warning(f"{LogColors.WARNING}Path finding to tavern {tavern_custom_id} failed for {citizen_username}.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}Closest tavern {tavern_custom_id} has no position data.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}No taverns found for {citizen_username} to eat at.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Citizen {citizen_username} is hungry but has no position data to find a tavern.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is hungry but has insufficient ducats ({citizen_ducats}) for a tavern meal (cost: {TAVERN_MEAL_COST_ESTIMATE}).{LogColors.ENDC}")

        log.warning(f"{LogColors.WARNING}Citizen {citizen_username} is hungry but no eating option was successfully created. Proceeding to other activities.{LogColors.ENDC}")
    else: 
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not hungry. Skipping hunger logic.{LogColors.ENDC}")
    
    if not citizen_position:
        log.warning(f"{LogColors.WARNING}Citizen {citizen_custom_id} still has no position data after hunger check. This might lead to issues for subsequent activities.{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data available after hunger check.")
        return True

    if not is_hungry and is_shopping_time_helper(now_venice_dt) and not is_night: 
        log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} - It's shopping time.{LogColors.ENDC}")
        current_load = get_citizen_current_load(tables, citizen_username)
        remaining_capacity = CITIZEN_CARRY_CAPACITY - current_load
        citizen_social_class = citizen['fields'].get('SocialClass', 'Facchini')
        citizen_max_tier_access = SOCIAL_CLASS_VALUE.get(citizen_social_class, 1)
        citizen_ducats = float(citizen['fields'].get('Ducats', 0))

        home = get_citizen_home(tables, citizen_custom_id) 

        if remaining_capacity <= 0.1: 
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username}'s inventory is full. Attempting to go home.{LogColors.ENDC}")
            if home:
                home_position = _get_building_position_coords(home)
                home_custom_id = home['fields'].get('BuildingId', home['id'])
                if citizen_position and home_position and _calculate_distance_meters(citizen_position, home_position) > 20:
                    path_to_home_for_deposit = get_path_between_points(citizen_position, home_position, transport_api_url) 
                    if path_to_home_for_deposit and path_to_home_for_deposit.get('success'):
                        if try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_custom_id, path_to_home_for_deposit):
                            return True 
                    else:
                        log.warning(f"{LogColors.WARNING}Path to home for deposit failed for {citizen_username}.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Citizen {citizen_username} inventory full but no home to deposit items.{LogColors.ENDC}")
        elif home: 
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has {remaining_capacity:.2f} inventory space. Looking for items to shop.{LogColors.ENDC}")
            potential_purchases = []
            
            shoppable_resources_defs = {
                res_id: res_data for res_id, res_data in resource_defs.items()
                if int(res_data.get('tier', 0) or 0) <= citizen_max_tier_access and int(res_data.get('tier', 0) or 0) > 0
            }
            log.debug(f"Citizen {citizen_username} (Class: {citizen_social_class}, MaxTier: {citizen_max_tier_access}) can shop for {len(shoppable_resources_defs)} resource types.")

            if shoppable_resources_defs:
                active_sell_contracts_formula = f"AND({{Type}}='public_sell', {{EndAt}}>'{now_utc_dt.isoformat()}', {{CreatedAt}}<='{now_utc_dt.isoformat()}', {{Amount}}>0)"
                try:
                    all_public_sell_contracts = tables['contracts'].all(formula=active_sell_contracts_formula)
                    log.debug(f"Found {len(all_public_sell_contracts)} active public_sell contracts.")

                    for res_id, res_data in shoppable_resources_defs.items():
                        contracts_for_this_resource = [
                            c for c in all_public_sell_contracts if c['fields'].get('ResourceType') == res_id
                        ]
                        if not contracts_for_this_resource:
                            continue

                        for contract_record in contracts_for_this_resource:
                            seller_building_custom_id = contract_record['fields'].get('SellerBuilding')
                            if not seller_building_custom_id: continue

                            seller_building_record = get_building_record(tables, seller_building_custom_id)
                            if not seller_building_record: continue
                            
                            seller_building_pos = _get_building_position_coords(seller_building_record)
                            if not citizen_position or not seller_building_pos: continue

                            distance = _calculate_distance_meters(citizen_position, seller_building_pos)
                            if distance == float('inf') or distance == 0: distance = 100000 
                            
                            import_price = float(res_data.get('importPrice', 0))
                            price_multiplier = 2.0 if res_data.get('subcategory') == 'food' else 1.0
                            priority_score = (import_price * price_multiplier) / distance

                            potential_purchases.append({
                                "score": priority_score, "resource_id": res_id,
                                "resource_name": res_data.get('name', res_id),
                                "contract_record": contract_record,
                                "seller_building_record": seller_building_record,
                                "distance": distance
                            })
                    
                    potential_purchases.sort(key=lambda x: x['score'], reverse=True)
                    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has {len(potential_purchases)} potential shopping items, sorted by priority.{LogColors.ENDC}")

                    for purchase_candidate in potential_purchases:
                        contract = purchase_candidate['contract_record']
                        seller_building = purchase_candidate['seller_building_record']
                        resource_id_to_buy = purchase_candidate['resource_id']
                        
                        price_per_unit = float(contract['fields'].get('PricePerResource', 0))
                        contract_amount_available = float(contract['fields'].get('Amount', 0))

                        if price_per_unit <= 0: continue

                        max_affordable_units = citizen_ducats / price_per_unit
                        
                        amount_to_buy = min(remaining_capacity, contract_amount_available, max_affordable_units)
                        amount_to_buy = float(f"{amount_to_buy:.4f}") 

                        if amount_to_buy >= 0.1: 
                            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} attempting to buy {amount_to_buy:.2f} of {resource_id_to_buy} from {seller_building['fields'].get('BuildingId')}.{LogColors.ENDC}")
                            seller_building_pos = _get_building_position_coords(seller_building) 
                            
                            path_to_seller = get_path_between_points(citizen_position, seller_building_pos, transport_api_url) 
                            if path_to_seller and path_to_seller.get('success'):
                                home_custom_id_for_delivery = home['fields'].get('BuildingId', home['id'])
                                if try_create_resource_fetching_activity(
                                    tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                                    contract['id'], seller_building['fields'].get('BuildingId'), 
                                    home_custom_id_for_delivery, resource_id_to_buy, amount_to_buy, path_to_seller
                                ):
                                    log.info(f"{LogColors.OKGREEN}Shopping activity (fetch_resource) created for {citizen_username} to buy {resource_id_to_buy}.{LogColors.ENDC}")
                                    return True 
                            else:
                                log.warning(f"{LogColors.WARNING}Path to seller {seller_building['fields'].get('BuildingId')} failed for {citizen_username}.{LogColors.ENDC}")
                        else:
                            log.debug(f"{LogColors.OKBLUE}Calculated amount_to_buy for {resource_id_to_buy} is too small ({amount_to_buy:.4f}). Skipping.{LogColors.ENDC}")
                except Exception as e_shop_contracts:
                    log.error(f"{LogColors.FAIL}Error during shopping contract processing for {citizen_username}: {e_shop_contracts}{LogColors.ENDC}")
            else: 
                log.info(f"{LogColors.OKBLUE}No shoppable resource definitions for {citizen_username} based on tier access.{LogColors.ENDC}")
        else: 
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no home, cannot determine 'ToBuilding' for shopping fetch. Skipping shopping.{LogColors.ENDC}")
            
        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} did not create a shopping activity this cycle.{LogColors.ENDC}")

    home_city = citizen['fields'].get('HomeCity') 
    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} HomeCity: '{home_city}'{LogColors.ENDC}")

    if not citizen_position: 
        log.warning(f"{LogColors.WARNING}Citizen {citizen_custom_id} has no position data, creating idle activity{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data available.")
        return True
    
    if is_night:
        log.info(f"{LogColors.OKCYAN}It is nighttime. Evaluating nighttime activities for {citizen_username}.{LogColors.ENDC}")
        if home_city and home_city.strip(): 
            log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} is a visitor from {home_city}. Finding an inn.{LogColors.ENDC}")
            closest_inn = get_closest_inn(tables, citizen_position)
            if closest_inn:
                inn_position_coords = _get_building_position_coords(closest_inn)
                inn_custom_id = closest_inn['fields'].get('BuildingId', closest_inn['id']) 

                if inn_position_coords:
                    is_at_inn = _calculate_distance_meters(citizen_position, inn_position_coords) < 20
                    if is_at_inn:
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is already at inn {inn_custom_id}. Creating stay activity.{LogColors.ENDC}")
                        venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE) # Use imported VENICE_TIMEZONE
                        if venice_now.hour < NIGHT_END_HOUR_FOR_STAY:
                            end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
                        else:
                            end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
                        stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                        try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_custom_id, stay_location_type="inn", end_time_utc_iso=stay_end_time_utc_iso) 
                    else:
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not at inn {inn_custom_id}. Finding path to inn.{LogColors.ENDC}")
                        path_data = get_path_between_points(citizen_position, inn_position_coords, transport_api_url) 
                        if path_data and path_data.get('success'):
                            try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_custom_id, path_data) 
                        else:
                            log.warning(f"{LogColors.WARNING}Path finding to inn {inn_custom_id} failed for {citizen_username}. Creating idle activity.{LogColors.ENDC}")
                            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to inn {inn_custom_id} failed.")
                else:
                    log.warning(f"{LogColors.WARNING}Inn {closest_inn['id'] if closest_inn else 'N/A'} has no position data. Creating idle activity for {citizen_username}.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Inn has no position data.")
            else:
                log.warning(f"{LogColors.WARNING}No inn found for visitor {citizen_username}. Creating idle activity.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No inn found for visitor.")

        else: 
            log.info(f"{LogColors.OKCYAN}Citizen {citizen_username} is a resident or HomeCity is not set. Evaluating home situation.{LogColors.ENDC}")
            home = get_citizen_home(tables, citizen_custom_id)
            if not home:
                log.warning(f"{LogColors.WARNING}Resident {citizen_custom_id} has no home, creating idle activity.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No home assigned.")
                return True
            
            home_position = _get_building_position_coords(home)
            home_custom_id = home['fields'].get('BuildingId', home['id']) 

            if not home_position:
                log.warning(f"{LogColors.WARNING}Home {home_custom_id} has no position data, creating idle for resident {citizen_custom_id}{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Home has no position data.")
                return True
            
            is_at_home = _calculate_distance_meters(citizen_position, home_position) < 20
            if is_at_home:
                venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE) # Use imported VENICE_TIMEZONE
                if venice_now.hour < NIGHT_END_HOUR_FOR_STAY:
                    end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
                else:
                    end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
                stay_end_time_utc_iso = end_time_venice.astimezone(pytz.UTC).isoformat()
                log.info(f"{LogColors.OKBLUE}Resident {citizen_username} is at home {home_custom_id}. Creating stay activity.{LogColors.ENDC}")
                try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_custom_id, stay_location_type="home", end_time_utc_iso=stay_end_time_utc_iso) 
            else:
                log.info(f"{LogColors.OKBLUE}Resident {citizen_username} is not at home {home_custom_id}. Finding path home.{LogColors.ENDC}")
                path_data = get_path_between_points(citizen_position, home_position, transport_api_url) 
                if path_data and path_data.get('success'):
                    log.info(f"{LogColors.OKGREEN}Path to home {home_custom_id} found. Creating 'goto_home' activity.{LogColors.ENDC}")
                    try_create_goto_home_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, home_custom_id, path_data) 
                else:
                    log.warning(f"{LogColors.WARNING}Path finding to home failed for resident {citizen_custom_id}. Creating idle activity.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to home {home_custom_id} failed.")
    else: 
        log.info(f"{LogColors.OKCYAN}It is daytime. Evaluating daytime activities for {citizen_username}.{LogColors.ENDC}")
        workplace = get_citizen_workplace(tables, citizen_custom_id, citizen_username)
        if workplace:
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has a workplace: {workplace['fields'].get('BuildingId', workplace['id'])}.{LogColors.ENDC}")
            workplace_position = _get_building_position_coords(workplace)
            workplace_custom_id = workplace['fields'].get('BuildingId', workplace['id']) 

            if not workplace_position:
                log.warning(f"{LogColors.WARNING}Workplace {workplace_custom_id} has no position data, creating idle activity{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Workplace has no position data.")
                return True
            
            is_at_workplace = _calculate_distance_meters(citizen_position, workplace_position) < 20
            if is_at_workplace: 
                log.info(f"{LogColors.OKBLUE}Citizen {citizen_custom_id} is at workplace {workplace_custom_id}. Checking for production/fetching.{LogColors.ENDC}")
                building_type = workplace['fields'].get('Type')
                building_type_info = get_building_type_info(building_type, api_base_url)
                if building_type_info and 'productionInformation' in building_type_info:
                    production_info = building_type_info['productionInformation']
                    if 'Arti' in production_info and isinstance(production_info['Arti'], list):
                        recipes = production_info['Arti']
                        building_resources = get_building_resources(tables, workplace_custom_id) 
                        selected_recipe = next((r for r in recipes if can_produce_output(building_resources, r)), None)
                        if selected_recipe:
                            try_create_production_activity(tables, citizen_airtable_record_id, citizen_custom_id, citizen_username, workplace_custom_id, selected_recipe) 
                            return True
                
                workplace_operator_username = workplace['fields'].get('RunBy')
                if not workplace_operator_username:
                    log.warning(f"{LogColors.WARNING}Workplace {workplace_custom_id} has no operator (RunBy). Cannot fetch contracts for it.{LogColors.ENDC}")
                else:
                    log.info(f"{LogColors.OKBLUE}Fetching contracts for workplace operator: {workplace_operator_username}{LogColors.ENDC}")
                    contracts = get_citizen_contracts(tables, workplace_operator_username) 
                    if contracts:
                        for contract in contracts:
                            if contract['fields'].get('BuyerBuilding') != workplace_custom_id:
                                log.debug(f"Skipping contract {contract['id']} for operator {workplace_operator_username} as its BuyerBuilding ({contract['fields'].get('BuyerBuilding')}) is not the current workplace ({workplace_custom_id}).")
                                continue

                            from_building_id_contract = contract['fields'].get('SellerBuilding') 
                            to_building_id_contract = contract['fields'].get('BuyerBuilding')   
                        
                            if from_building_id_contract and to_building_id_contract:
                                from_buildings_contract = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(from_building_id_contract)}'")
                                to_buildings_contract = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(to_building_id_contract)}'")

                                if from_buildings_contract and to_buildings_contract:
                                    from_building_rec = from_buildings_contract[0]
                                    to_building_rec = to_buildings_contract[0]
                                    resource_type_contract = contract['fields'].get('ResourceType')
                                    amount_contract = float(contract['fields'].get('HourlyAmount', 0) or 0) 
                                    
                                    source_resources_contract = get_building_resources(tables, from_building_id_contract) 
                                    if resource_type_contract in source_resources_contract and source_resources_contract[resource_type_contract] >= amount_contract and amount_contract > 0:
                                        if workplace_custom_id == from_building_id_contract: 
                                             log.info(f"Citizen {citizen_username} is already at source building {from_building_id_contract} for contract. This case needs review for fetch logic.")
                                        elif citizen_position and _get_building_position_coords(from_building_rec):
                                            if _has_recent_failed_activity_for_contract(tables, 'fetch_resource', contract['id']):
                                                log.info(f"{LogColors.OKBLUE}Skipping fetch_resource for contract {contract['id']} (Airtable ID) due to recent failure.{LogColors.ENDC}")
                                                continue 

                                            path_to_source = get_path_between_points(citizen_position, _get_building_position_coords(from_building_rec), transport_api_url) 
                                            if path_to_source and path_to_source.get('success'):
                                                from_building_custom_id_contract = from_building_rec['fields'].get('BuildingId')
                                                to_building_custom_id_contract = to_building_rec['fields'].get('BuildingId')
                                                if from_building_custom_id_contract and to_building_custom_id_contract:
                                                    if try_create_resource_fetching_activity(
                                                        tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                                                        contract['id'], from_building_custom_id_contract, to_building_custom_id_contract, 
                                                        resource_type_contract, amount_contract, path_to_source
                                                    ):
                                                        return True 
                                                else:
                                                    log.warning(f"{LogColors.WARNING}Missing custom BuildingId for contract buildings: From={from_building_custom_id_contract}, To={to_building_custom_id_contract}{LogColors.ENDC}")
                log.info(f"{LogColors.OKBLUE}No production or fetching tasks available for {citizen_custom_id} at workplace {workplace_custom_id}. Creating idle activity.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No production or fetching tasks available at workplace.")
            else: 
                log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} is not at workplace. Evaluating travel to work.{LogColors.ENDC}")
                home_for_departure_check = get_citizen_home(tables, citizen_custom_id) 
                is_at_home_for_work_departure = False
                citizen_pos_str_for_pickup = citizen['fields'].get('Position') 

                if home_for_departure_check and citizen_position:
                    home_pos_for_departure_check = _get_building_position_coords(home_for_departure_check)
                    if home_pos_for_departure_check:
                        is_at_home_for_work_departure = _calculate_distance_meters(citizen_position, home_pos_for_departure_check) < 20
                
                log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} needs to go to work. Is at home: {is_at_home_for_work_departure}.{LogColors.ENDC}")

                path_data = get_path_between_points(citizen_position, workplace_position, transport_api_url) 
                if path_data and path_data.get('success'):
                    try_create_goto_work_activity(
                        tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, 
                        workplace_custom_id, path_data, home_for_departure_check, 
                        resource_defs, is_at_home_for_work_departure, citizen_pos_str_for_pickup
                    )
                    log.info(f"{LogColors.OKGREEN}Created 'goto_work' activity for {citizen_username} to {workplace_custom_id}.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}Path to workplace {workplace_custom_id} failed for {citizen_custom_id}. Creating idle activity.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to workplace {workplace_custom_id} failed.")
        else: 
            log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} has no workplace. Creating idle activity.{LogColors.ENDC}")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No workplace assigned.")
    return True
