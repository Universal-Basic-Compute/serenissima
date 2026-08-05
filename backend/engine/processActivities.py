#!/usr/bin/env python3
"""
Process Concluded Activities script for La Serenissima.

This script:
1. Fetches all activities that are concluded (EndDate is in the past) and not yet processed.
2. For "deliver_resource_batch" activities:
   - Transfers resources from the delivery citizen (owned by the merchant) to the target building.
   - Checks storage capacity of the target building.
   - Updates or creates resource records in the target building for its operator/owner.
   - Processes financial transactions based on the original contracts in the batch.
3. For "goto_home" activities:
   - Identifies all resources owned by the citizen (AssetType='citizen', Owner=CitizenUsername, Asset=CitizenCustomId).
   - Checks storage capacity of the citizen's home.
   - Transfers these resources from the citizen's personal inventory to their home building.
   - The resources in the home building remain owned by the citizen.
4. For "goto_work" activities:
   - Identifies resources carried by the citizen (`AssetType`='citizen', `Asset`=CitizenCustomId) that are owned by the operator (`RunBy`) of the workplace.
   - Checks storage capacity of the workplace.
   - If space allows, transfers these resources from the citizen's personal inventory to the workplace building.
   - The resources in the workplace building become owned by the workplace operator.
5. For "production" activities:
   - Retrieves the `RecipeInputs` and `RecipeOutputs` from the activity.
   - Verifies if the production building (identified by `FromBuilding`) has sufficient input resources owned by the building operator.
   - Verifies if the building has enough storage capacity for the output resources after inputs are consumed.
   - If both checks pass:
     - Consumes (decrements/deletes) the input resources from the building's inventory.
     - Produces (increments/creates) the output resources in the building's inventory, owned by the operator.
6. For "fetch_resource" activities (upon arrival at `FromBuilding` - the source):
   - Determines the actual amount of resource to pick up based on:
     - Amount specified in the contract/activity.
     - Stock available at `FromBuilding` (owned by the building's operator/seller).
     - Citizen's remaining carrying capacity (max 10 units total).
     - Buyer's (from contract) available Ducats to pay for the resources.
   - If a positive amount can be fetched:
     - Processes financial transaction: Buyer pays Seller.
     - Decrements resource stock from `FromBuilding`.
     - Adds resource to the citizen's personal inventory. The resource on the citizen is marked as owned by the `Buyer` from the contract.
   - Updates the citizen's `Position` to be at the `FromBuilding`.
7. Updates the activity status to "processed" or "failed". If processed successfully:
   - For most activities with a `ToBuilding` destination, the citizen's `Position` (coordinates) and `UpdatedAt` fields are updated to reflect their new location.
   - For `fetch_resource` activities, the processor itself handles updating the citizen's position to the `FromBuilding` (pickup location), so the generic update is skipped.

IMPORTANT: Activity processors should ONLY process the current activity and NOT create follow-up activities.
Follow-up activities should be created by activity creators in the activity_creators directory.
Processors should focus on:
1. Executing the effects of the current activity (e.g., transferring resources, updating citizen state)
2. Returning success/failure status
3. NOT creating new activities (this is the responsibility of activity creators)
"""

import os
import sys
import json
import logging
import argparse
import requests
import uuid
import re
import math # Added for Haversine distance
import random # Added import for random module
from datetime import datetime, timezone, timedelta
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any, Tuple
import concurrent.futures
import threading
from collections import defaultdict # Added import for defaultdict

# Add the project root to sys.path to allow imports from backend.engine
# Corrected sys.path manipulation:
# os.path.dirname(__file__) -> backend/engine
# os.path.join(..., '..') -> backend/engine/.. -> backend
# os.path.join(..., '..', '..') -> backend/engine/../../ -> serenissima (project root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

# Import send_telegram_notification from scheduler
try:
    from backend.app.scheduler import send_telegram_notification
except ImportError:
    # Fallback if scheduler is not directly importable (e.g. running script standalone)
    def send_telegram_notification(message: str):
        log.error(f"send_telegram_notification not available. Message: {message}")

from pyairtable import Api, Table
from dotenv import load_dotenv

# Import shared utilities
from backend.engine.utils.activity_helpers import (
    get_building_record,
    dateutil_parser, # Ensure dateutil_parser is imported if not already
    get_citizen_record,
    get_contract_record,
    get_building_current_storage,
    _escape_airtable_value,
    calculate_haversine_distance_meters,
    LogColors, # Import LogColors
    log_header, # Import log_header
    VENICE_TIMEZONE, # Import VENICE_TIMEZONE
    _get_building_position_coords, # Added import
    get_path_between_points # Added import
)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_activities")

# Placeholder for activities that are processed by expiring or simple state change
def process_placeholder_activity_fn(tables, activity_record, building_type_defs, resource_defs, api_base_url: Optional[str] = None): # Added api_base_url
    activity_guid = activity_record['fields'].get('ActivityId', activity_record['id'])
    activity_type = activity_record['fields'].get('Type')
    log.info(f"{LogColors.OKCYAN}Activity {activity_guid} (type: {activity_type}) processed by placeholder (e.g., expired or simple state change).{LogColors.ENDC}")
    # Processors should only handle the current activity, not create follow-up activities
    return True

# Import helper functions from activity_helpers
from backend.engine.utils.activity_helpers import (
    get_building_types_from_api as get_building_type_definitions_from_api,
    get_resource_types_from_api as get_resource_definitions_from_api
)
# Import processors
from backend.engine.activity_processors import (
    process_deliver_resource_batch as process_deliver_resource_batch_fn,
        process_goto_home as process_goto_home_fn,
        process_goto_work as process_goto_work_fn,
        process_production as process_production_fn,
        process_fetch_resource as process_fetch_resource_fn,
        process_eat as process_eat_fn,
        process_pickup_from_galley, # Import new processor
        process_deliver_resource_to_buyer, # Import new processor
        process_leave_venice as process_leave_venice_fn,
        process_deliver_construction_materials as process_deliver_construction_materials_fn,
        process_construct_building as process_construct_building_fn,
        process_goto_construction_site as process_goto_construction_site_fn,
        # Import new processors
        process_deliver_to_storage as process_deliver_to_storage_fn,
        process_fetch_from_storage as process_fetch_from_storage_fn,
        process_goto_building_for_storage_fetch as process_goto_building_for_storage_fetch_fn,
        process_fetch_for_logistics_client as process_fetch_for_logistics_client_fn, # Already present
        process_check_business_status as process_check_business_status_fn,
        process_fishing_activity as process_fishing_activity_fn, # Import new processor
        process_deliver_to_citizen_fn, # Citizen-to-citizen delivery
        process_goto_location_fn, # Import goto_location processor
        process_manage_guild_membership as process_manage_guild_membership_fn, # Import guild membership processor
        # Import new building bid processors
        process_inspect_building_for_purchase_fn,
        process_submit_building_purchase_offer_fn,
        process_execute_respond_to_building_bid_fn, 
        process_execute_withdraw_building_bid_fn, 
        process_finalize_manage_markup_buy_contract_fn, 
        process_finalize_manage_storage_query_contract_fn,
        process_finalize_update_citizen_profile_fn, # New, imported from __init__
        process_manage_public_dock as process_manage_public_dock_fn, # Import new processor
        process_work_on_art_fn, # Import new Artisti processor
        process_read_book_fn, # Import new read_book processor
        process_read_at_library_fn, # Import new consciousness library processor
        process_goto_inn as process_goto_inn_fn, # Import new goto_inn processor
        process_deposit_items_at_location, # Import new processor
        process_attend_theater_performance as process_attend_theater_performance_fn, # New theater processor
        process_drink_at_inn as process_drink_at_inn_fn, # New drink at inn processor
        process_use_public_bath as process_use_public_bath_fn, # New public bath processor
        process_rest as process_rest_fn, # New rest processor
        process_occupant_self_construction_fn, # New occupant self-construction processor
        process_spread_rumor_fn, # Import spread_rumor processor
        process_pray, # Import pray processor
        process_talk_publicly # Import talk_publicly processor
)
from backend.engine.activity_processors.manage_public_import_contract_processor import process_manage_public_import_contract_fn
from backend.engine.activity_processors.bid_on_land_activity_processor import process_bid_on_land_fn
from backend.engine.activity_processors.manage_public_sell_contract_processor import process_manage_public_sell_contract_fn
from backend.engine.activity_processors.manage_import_contract_processor import process_manage_import_contract_fn
from backend.engine.activity_processors.manage_logistics_service_contract_processor import process_manage_logistics_service_contract_fn
from backend.engine.activity_processors.buy_available_land_processor import process_buy_available_land_fn
from backend.engine.activity_processors.initiate_building_project_processor import process_initiate_building_project_fn
from backend.engine.activity_processors.adjust_land_lease_price_processor import process_adjust_land_lease_price_fn
from backend.engine.activity_processors.adjust_building_rent_price_processor import process_adjust_building_rent_price_fn
from backend.engine.activity_processors.adjust_building_lease_price_processor import process_file_building_lease_adjustment_fn # New
from backend.engine.activity_processors.adjust_business_wages_processor import process_adjust_business_wages_fn
from backend.engine.activity_processors.change_business_manager_processor import process_change_business_manager_fn
from backend.engine.activity_processors.request_loan_processor import process_request_loan_fn
from backend.engine.activity_processors.offer_loan_processor import process_offer_loan_fn
from backend.engine.activity_processors.send_message_processor import process_send_message_fn
from backend.engine.activity_processors.send_diplomatic_email_processor import process_send_diplomatic_email
from backend.engine.activity_processors.reply_to_message_processor import process_reply_to_message_fn

# Import new land management processors (these files will need to be created)
from backend.engine.activity_processors.list_land_for_sale_processor import process_list_land_for_sale_fn
from backend.engine.activity_processors.make_offer_for_land_processor import process_make_offer_for_land_fn
from backend.engine.activity_processors.accept_land_offer_processor import process_accept_land_offer_fn
from backend.engine.activity_processors.buy_listed_land_processor import process_buy_listed_land_fn
from backend.engine.activity_processors.cancel_land_listing_processor import process_cancel_land_listing_fn
from backend.engine.activity_processors.cancel_land_offer_processor import process_cancel_land_offer_fn
from backend.engine.activity_processors.manage_public_storage_contract_processor import process_register_public_storage_offer_fn
# Import du processeur spread_rumor est maintenant géré via ACTIVITY_PROCESSORS dans __init__.py

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

# --- Temporary Debug Prints for Telegram Env Vars ---
TELEGRAM_BOT_TOKEN_DEBUG = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID_DEBUG = os.getenv("TELEGRAM_CHAT_ID")
log.info(f"[DEBUG TELEGRAM] TELEGRAM_BOT_TOKEN: {'Loaded' if TELEGRAM_BOT_TOKEN_DEBUG else 'NOT LOADED'}")
log.info(f"[DEBUG TELEGRAM] TELEGRAM_CHAT_ID: {'Loaded' if TELEGRAM_CHAT_ID_DEBUG else 'NOT LOADED'}")
# You might want to print the first few characters of the token for verification, e.g.:
# if TELEGRAM_BOT_TOKEN_DEBUG: log.info(f"[DEBUG TELEGRAM] Token starts with: {TELEGRAM_BOT_TOKEN_DEBUG[:5]}")
# --- End Temporary Debug Prints ---

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')

    if api_key: api_key = api_key.strip()
    if base_id: base_id = base_id.strip()

    if api_key:
        log.info(f"{LogColors.OKBLUE}Airtable API Key: Loaded (length {len(api_key)}, first 5: {api_key[:5]}...){LogColors.ENDC}")
    else:
        log.error(f"{LogColors.FAIL}Airtable API Key: NOT LOADED or empty.{LogColors.ENDC}")
        return None
    if not base_id:
        log.error(f"{LogColors.FAIL}Airtable Base ID not configured.{LogColors.ENDC}")
        return None
    
    try:
        custom_session = requests.Session() 
        custom_session.trust_env = False    
        custom_session.headers.update({"Authorization": f"Bearer {api_key}"}) # Add Authorization header

        # Configure a custom retry strategy for consistency
        from urllib3.util.retry import Retry # Ensure Retry is imported
        retry_strategy = Retry(
            total=5,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE", "POST"]
        )
        
        # Instantiate Api with the custom retry strategy
        api = Api(api_key, retry_strategy=retry_strategy)
        api.session = custom_session # Assign custom session after instantiation

        # Construct Table instances using api.table()
        tables = {
            'activities': api.table(base_id, 'ACTIVITIES'),
            'resources': api.table(base_id, 'RESOURCES'),
            'citizens': api.table(base_id, 'CITIZENS'),
            'buildings': api.table(base_id, 'BUILDINGS'),
            'contracts': api.table(base_id, 'CONTRACTS'),
            'transactions': api.table(base_id, 'TRANSACTIONS'),
            'problems': api.table(base_id, 'PROBLEMS'),
            'relationships': api.table(base_id, 'RELATIONSHIPS'),
            'lands': api.table(base_id, 'LANDS'),
            'notifications': api.table(base_id, 'NOTIFICATIONS'),
            'stratagems': api.table(base_id, 'STRATAGEMS'),
            'messages': api.table(base_id, 'MESSAGES'),
            'processes': api.table(base_id, 'PROCESSES'),
            'grievances': api.table(base_id, 'GRIEVANCES'),
            'grievance_support': api.table(base_id, 'GRIEVANCE_SUPPORT'),
            'meditation_sessions': api.table(base_id, 'MEDITATION_SESSIONS')
        }

        # Test connection with one primary table (e.g., citizens)
        log.info(f"{LogColors.OKBLUE}Testing Airtable connection by fetching one record from CITIZENS table...{LogColors.ENDC}")
        try:
            # Ensure api_key is not None before attempting the call
            if not api_key:
                 raise ValueError("API key is None, cannot test connection.")
            tables['citizens'].all(max_records=1) # Test CITIZENS table
            log.info(f"{LogColors.OKGREEN}Airtable connection successful (tested CITIZENS).{LogColors.ENDC}")
            # Optionally, test LANDS table if critical for this script's core function
            # tables['LANDS'].all(max_records=1) 
            # log.info(f"{LogColors.OKGREEN}Airtable LANDS table also accessible.{LogColors.ENDC}")
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed: {conn_e}{LogColors.ENDC}")
            raise conn_e # Re-raise to be caught by the outer try-except
        
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable or connection test failed: {e}{LogColors.ENDC}")
        return None

# _escape_airtable_value is imported from activity_helpers

def get_concluded_unprocessed_activities(tables: Dict[str, Table], target_citizen_username: Optional[str] = None, forced_utc_datetime_override: Optional[datetime] = None) -> List[Dict]:
    """Fetch activities that have ended and are not yet processed, optionally for a specific citizen."""
    # VENICE_TIMEZONE is imported and used if forced_venice_hour_override is present in main()
    
    if forced_utc_datetime_override is not None:
        log.info(f"{LogColors.WARNING}Using forced UTC datetime {forced_utc_datetime_override.isoformat()} for activity processing check.{LogColors.ENDC}")
        now_utc_for_check = forced_utc_datetime_override
    else:
        now_utc_for_check = datetime.now(timezone.utc) # Get real UTC time if no override
        
    now_iso_utc = now_utc_for_check.replace(microsecond=0).isoformat() # Convert to UTC string for Airtable, without microseconds
    log.info(f"{LogColors.OKBLUE}Using now_iso_utc for query (microseconds removed): {now_iso_utc}{LogColors.ENDC}") # Log the timestamp
    
    # NOT(IS_AFTER(...)) instead of <= : Airtable compares {Date} <= 'string' lexicographically.
    base_formula = f"AND(NOT(IS_AFTER({{EndDate}}, '{now_iso_utc}')), NOT(OR({{Status}} = 'processed', {{Status}} = 'failed', {{Status}} = 'error')))" # Added 'error'
    
    if target_citizen_username:
        citizen_filter = f"{{Citizen}} = '{_escape_airtable_value(target_citizen_username)}'"
        formula = f"AND({base_formula}, {citizen_filter})"
        log.info(f"{LogColors.OKBLUE}Fetching concluded and unprocessed activities for citizen: {target_citizen_username}.{LogColors.ENDC}")
    else:
        formula = base_formula
        log.info(f"{LogColors.OKBLUE}Fetching all concluded and unprocessed activities.{LogColors.ENDC}")
    
    log.info(f"{LogColors.OKBLUE}Executing Airtable formula: {formula}{LogColors.ENDC}") # Log the exact formula
        
    try:
        activities = tables['activities'].all(formula=formula)
        log.info(f"{LogColors.OKBLUE}Found {len(activities)} activities matching criteria.{LogColors.ENDC}")
        return activities
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching concluded unprocessed activities: {e}{LogColors.ENDC}")
        return []

# get_citizen_record is imported from activity_helpers
# get_building_record is imported from activity_helpers
# get_contract_record is imported from activity_helpers
# get_building_current_storage is imported from activity_helpers

# Removed process_deliver_resource_batch function from here. It's now in its own module.

def update_activity_status(tables: Dict[str, Table], activity_airtable_id: str, status: str):
    """Updates the status of an activity."""
    try:
        tables['activities'].update(activity_airtable_id, {'Status': status})
        log.info(f"{LogColors.OKGREEN}Updated activity {activity_airtable_id} status to '{status}'.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error updating status for activity {activity_airtable_id}: {e}{LogColors.ENDC}")

def calculate_gondola_travel_details(path_json_string: Optional[str]) -> tuple[float, float]:
    """
    Calculates the total distance traveled by gondola and the associated fee.
    Fee is 10 base + 5 per km.
    Returns (total_gondola_distance_km, fee).
    """
    if not path_json_string:
        return 0.0, 0.0

    try:
        path_points = json.loads(path_json_string)
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}Failed to parse path JSON: {path_json_string}{LogColors.ENDC}")
        return 0.0, 0.0

    if not isinstance(path_points, list) or len(path_points) < 2:
        return 0.0, 0.0

    total_gondola_distance_km = 0.0
    for i in range(len(path_points) - 1):
        p1 = path_points[i]
        p2 = path_points[i+1]

        if isinstance(p1, dict) and p1.get("transportMode") == "gondola":
            try:
                lat1, lon1 = float(p1.get("lat", 0.0)), float(p1.get("lng", 0.0))
                lat2, lon2 = float(p2.get("lat", 0.0)), float(p2.get("lng", 0.0))
                if lat1 != 0.0 or lon1 != 0.0 or lat2 != 0.0 or lon2 != 0.0: # Avoid calculating for zero coords
                    # Use the helper function, note it returns meters, convert to km
                    segment_distance_meters = calculate_haversine_distance_meters(lat1, lon1, lat2, lon2)
                    total_gondola_distance_km += segment_distance_meters / 1000.0
            except (TypeError, ValueError) as e:
                log.warning(f"{LogColors.WARNING}Could not parse coordinates for path segment: {p1} to {p2}. Error: {e}{LogColors.ENDC}")
                continue
    
    fee = 0.0
    if total_gondola_distance_km > 0:
        fee = 10 + (5 * total_gondola_distance_km)
        log.info(f"{LogColors.OKBLUE}Calculated gondola travel: Distance={total_gondola_distance_km:.2f} km, Fee={fee:.2f} Ducats.{LogColors.ENDC}")
    
    return total_gondola_distance_km, fee

def process_building_arrivals(tables: Dict[str, Table], dry_run: bool = False, forced_utc_datetime_override: Optional[datetime] = None):
    """Checks for buildings (e.g., merchant galleys) that have 'arrived'."""
    log.info(f"{LogColors.OKBLUE}Checking for building arrivals (e.g., merchant galleys)...{LogColors.ENDC}")

    if forced_utc_datetime_override:
        now_utc_for_check = forced_utc_datetime_override
        log.info(f"{LogColors.WARNING}Using forced UTC datetime {now_utc_for_check.isoformat()} for building arrival check.{LogColors.ENDC}")
    else:
        now_utc_for_check = datetime.now(timezone.utc)

    # Microseconds break Airtable date comparisons — strip them.
    now_iso_utc_for_check = now_utc_for_check.replace(microsecond=0).isoformat()

    # Check for merchant galleys specifically, using ConstructionDate as the arrival time
    formula = f"AND({{Type}}='merchant_galley', {{IsConstructed}}=FALSE(), NOT(IS_AFTER({{ConstructionDate}}, '{now_iso_utc_for_check}')))"
    try:
        arrived_buildings = tables['buildings'].all(formula=formula)
        if not arrived_buildings:
            log.info(f"{LogColors.OKBLUE}No merchant galleys have arrived at this time.{LogColors.ENDC}")
            return

        for building_record in arrived_buildings:
            building_id_airtable = building_record['id']
            building_custom_id = building_record['fields'].get('BuildingId', building_id_airtable)
            log.info(f"{LogColors.OKGREEN}Merchant galley {building_custom_id} (Airtable ID: {building_id_airtable}) has arrived.{LogColors.ENDC}")
            if not dry_run:
                try:
                    tables['buildings'].update(building_id_airtable, {'IsConstructed': True})
                    log.info(f"{LogColors.OKGREEN}Updated merchant galley {building_custom_id} to IsConstructed=True.{LogColors.ENDC}")
                except Exception as e_update:
                    log.error(f"{LogColors.FAIL}Error updating IsConstructed for galley {building_custom_id}: {e_update}{LogColors.ENDC}")
            else:
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Would update merchant galley {building_custom_id} to IsConstructed=True.{LogColors.ENDC}")
    except Exception as e_fetch:
        log.error(f"{LogColors.FAIL}Error fetching arriving buildings: {e_fetch}{LogColors.ENDC}")

def mark_started_activities_as_in_progress(
    tables: Dict[str, Table], 
    now_utc_for_check_override: Optional[datetime] = None,
    dry_run: bool = False
):
    """
    Identifies activities that have started (StartDate <= now) but are still 'created'
    and updates their status to 'in_progress'.
    """
    now_utc_to_use = now_utc_for_check_override if now_utc_for_check_override else datetime.now(timezone.utc)
    # Airtable date comparisons silently match nothing when the ISO string
    # carries microseconds — strip them (same as the concluded-activities query).
    now_iso_utc = now_utc_to_use.replace(microsecond=0).isoformat()

    log.info(f"{LogColors.OKBLUE}Marking started activities as 'in_progress' (effective time: {now_iso_utc})...{LogColors.ENDC}")

    # NOT(IS_AFTER(...)) does real date comparison; a raw {StartDate}<='...'
    # is compared lexicographically ('.000Z' > '+00:00'), silently missing
    # values equal to the cutoff.
    formula = f"AND({{Status}}='created', NOT(IS_AFTER({{StartDate}}, '{now_iso_utc}')))"
    try:
        activities_to_mark_started = tables['activities'].all(formula=formula)
        if not activities_to_mark_started:
            log.info("No 'created' activities found that have already started.")
            return

        updates_for_in_progress = []
        for activity in activities_to_mark_started:
            activity_id_airtable = activity['id']
            activity_guid = activity['fields'].get('ActivityId', activity_id_airtable)
            citizen_username_log = activity['fields'].get('Citizen', 'UnknownCitizen')
            activity_type_log = activity['fields'].get('Type', 'UnknownType')
            
            if not dry_run:
                updates_for_in_progress.append({'id': activity_id_airtable, 'fields': {'Status': 'in_progress'}})
                log.info(f"Marking activity {activity_guid} (Citizen: {citizen_username_log}, Type: {activity_type_log}) as 'in_progress'.")
            else:
                log.info(f"[DRY RUN] Would mark activity {activity_guid} (Citizen: {citizen_username_log}, Type: {activity_type_log}) as 'in_progress'.")
        
        if updates_for_in_progress and not dry_run:
            tables['activities'].batch_update(updates_for_in_progress)
            log.info(f"{LogColors.OKGREEN}Successfully marked {len(updates_for_in_progress)} activities as 'in_progress'.{LogColors.ENDC}")
        elif dry_run and activities_to_mark_started:
            log.info(f"[DRY RUN] Would have marked {len(activities_to_mark_started)} activities as 'in_progress'.")

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error marking started activities as 'in_progress': {e}{LogColors.ENDC}")


def main(dry_run: bool = False, target_citizen_username: Optional[str] = None, forced_venice_hour_override: Optional[int] = None, specific_activity_id: Optional[str] = None):
    header_message = "Process Activities Script"
    if specific_activity_id:
        header_message += f" for specific ActivityId '{specific_activity_id}'"
    elif target_citizen_username:
        header_message += f" for Citizen '{target_citizen_username}'"
    header_message += f" (dry_run={dry_run}, forced_hour={forced_venice_hour_override})"
    log_header(header_message, LogColors.HEADER)

    # Initialize lock for shared counters
    counter_lock = threading.Lock()
    global_processed_count = 0
    global_failed_count = 0

    forced_utc_datetime_for_check: Optional[datetime] = None
    if forced_venice_hour_override is not None:
        current_time_real_venice = datetime.now(VENICE_TIMEZONE)
        effective_forced_venice_datetime = current_time_real_venice.replace(hour=forced_venice_hour_override)
        forced_utc_datetime_for_check = effective_forced_venice_datetime.astimezone(timezone.utc)
        log.info(f"{LogColors.WARNING}Using forced Venice hour {forced_venice_hour_override}. Effective UTC for checks: {forced_utc_datetime_for_check.isoformat()}.{LogColors.ENDC}")
    else:
        # Use real current time if no override
        forced_utc_datetime_for_check = datetime.now(timezone.utc) 
        log.info(f"{LogColors.OKBLUE}Using current real UTC time for checks: {forced_utc_datetime_for_check.isoformat()}.{LogColors.ENDC}")


    # Define a dictionary to map activity types to their processor functions
    ACTIVITY_PROCESSORS = {
        "deliver_resource_batch": process_deliver_resource_batch_fn,
        "goto_home": process_goto_home_fn,
        "goto_work": process_goto_work_fn,
        "production": process_production_fn,
        "fetch_resource": process_fetch_resource_fn,
        "eat_from_inventory": process_eat_fn, # Dispatch to generic eat processor
        "eat_at_home": process_eat_fn,        # Dispatch to generic eat processor
        "eat_at_tavern": process_eat_fn,      # Dispatch to generic eat processor
        # "fetch_from_galley": process_fetch_from_galley_fn, # This type is no longer directly created for processing this way
        "pickup_from_galley": process_pickup_from_galley, # New processor for the pickup step
        "deliver_resource_to_buyer": process_deliver_resource_to_buyer, # New processor for final delivery
        "leave_venice": process_leave_venice_fn,
        "deliver_construction_materials": process_deliver_construction_materials_fn,
        "construct_building": process_construct_building_fn,
        "goto_construction_site": process_goto_construction_site_fn,
        "secure_warehouse": process_placeholder_activity_fn,
        "deliver_to_storage": process_deliver_to_storage_fn,
        "fetch_from_storage": process_fetch_from_storage_fn,
        "goto_building_for_storage_fetch": process_goto_building_for_storage_fetch_fn,
        "fetch_for_logistics_client": process_fetch_for_logistics_client_fn, # Already present
        "check_business_status": process_check_business_status_fn,
        "fishing": process_fishing_activity_fn, # New
        "emergency_fishing": process_fishing_activity_fn, # New, uses same processor
        "deliver_to_citizen": process_deliver_to_citizen_fn, # Citizen-to-citizen delivery
        "inspect_building_for_purchase": process_inspect_building_for_purchase_fn, # New
        "submit_building_purchase_offer": process_submit_building_purchase_offer_fn, 
        "execute_respond_to_building_bid": process_execute_respond_to_building_bid_fn, 
        "execute_withdraw_building_bid": process_execute_withdraw_building_bid_fn, 
        "finalize_manage_markup_buy_contract": process_finalize_manage_markup_buy_contract_fn, 
        "finalize_manage_storage_query_contract": process_finalize_manage_storage_query_contract_fn,
        "finalize_update_citizen_profile": process_finalize_update_citizen_profile_fn, # New
        "manage_public_dock": process_manage_public_dock_fn, # New
        "work_on_art": process_work_on_art_fn, # New Artisti activity
        "read_book": process_read_book_fn, # Use new processor for read_book
        "goto_inn": process_goto_inn_fn, # New mapping for goto_inn
        "deposit_items_at_location": process_deposit_items_at_location, # New activity type
        "attend_theater_performance": process_attend_theater_performance_fn, # New theater activity
        "drink_at_inn": process_drink_at_inn_fn, # New drink at inn activity
        "use_public_bath": process_use_public_bath_fn, # New public bath activity
        "rest": process_rest_fn, # New rest processor
        "occupant_self_construction": process_occupant_self_construction_fn, # New
        "idle": process_placeholder_activity_fn,
        "pray": process_pray, # Pray processor
        "bid_on_land": process_bid_on_land_fn,
        "goto_location": process_goto_location_fn, # New processor for multi-activity chains
        "submit_land_bid": process_bid_on_land_fn, # Second step in bid_on_land chain
        "prepare_goods_for_sale": process_manage_public_sell_contract_fn, # First step in manage_public_sell_contract chain
        "register_public_sell_offer": process_manage_public_sell_contract_fn, # Final step in manage_public_sell_contract chain
        "assess_import_needs": process_manage_import_contract_fn, # First step in manage_import_contract chain
        "register_import_agreement": process_manage_import_contract_fn, # Final step in manage_import_contract chain
        "register_public_import_agreement": process_manage_public_import_contract_fn, # Final step in manage_public_import_contract chain
        "assess_logistics_needs": process_manage_logistics_service_contract_fn, # First step in manage_logistics_service_contract chain
        "register_logistics_service_contract": process_manage_logistics_service_contract_fn, # Final step in manage_logistics_service_contract chain
        "finalize_land_purchase": process_buy_available_land_fn, # Final step in buy_available_land chain
        "inspect_land_plot": process_initiate_building_project_fn, # Second step in initiate_building_project chain
        "submit_building_project": process_initiate_building_project_fn, # Final step in initiate_building_project chain
        "file_lease_adjustment": process_adjust_land_lease_price_fn, # Final step in adjust_land_lease_price chain
        "file_rent_adjustment": process_adjust_building_rent_price_fn, # Final step in adjust_building_rent_price chain
        "file_building_lease_adjustment": process_file_building_lease_adjustment_fn, # Final step for adjust_building_lease_price
        "update_wage_ledger": process_adjust_business_wages_fn, # Final step in adjust_business_wages chain
        "finalize_operator_change": process_change_business_manager_fn, # Final step in change_business_manager chain
        "submit_loan_application_form": process_request_loan_fn, # Final step in request_loan chain
        "register_loan_offer_terms": process_offer_loan_fn, # Final step in offer_loan chain
        "deliver_message_interaction": process_send_message_fn, # Final step in send_message chain
        "reply_to_message": process_reply_to_message_fn, # Automatically created after receiving a message
        "perform_guild_membership_action": process_manage_guild_membership_fn, # Final step in manage_guild_membership chain
        "register_public_storage_offer": process_register_public_storage_offer_fn,
        # "reply_to_message" will be handled specially below to pass args.model

        # Land Management Processors
        "finalize_list_land_for_sale": process_list_land_for_sale_fn,
        "finalize_make_offer_for_land": process_make_offer_for_land_fn,
        "execute_accept_land_offer": process_accept_land_offer_fn,
        "execute_buy_listed_land": process_buy_listed_land_fn,
        "execute_cancel_land_listing": process_cancel_land_listing_fn,
        "execute_cancel_land_offer": process_cancel_land_offer_fn,
        "spread_rumor": process_spread_rumor_fn, # Ajout du nouveau processeur
        "talk_publicly": process_talk_publicly, # Public announcement processor
        # process_buy_available_land_fn is already in the dict for "finalize_land_purchase"
        
        # New social class activities
        "shepherd_consciousness": lambda tables, activity_record, building_type_defs, resource_defs, dry_run=False: 
            __import__('backend.engine.activity_processors.shepherd_consciousness_processor', fromlist=['process_shepherd_consciousness']).process_shepherd_consciousness(
                tables, activity_record, building_type_defs, resource_defs, dry_run),
        "cascade_development": lambda tables, activity_record, building_type_defs, resource_defs, dry_run=False:
            __import__('backend.engine.activity_processors.cascade_development_processor', fromlist=['process_cascade_development']).process_cascade_development(
                tables, activity_record, building_type_defs, resource_defs, dry_run),
        "cascade_sales": lambda tables, activity_record, building_type_defs, resource_defs, dry_run=False:
            __import__('backend.engine.activity_processors.cascade_sales_processor', fromlist=['process_cascade_sales']).process_cascade_sales(
                tables, activity_record, building_type_defs, resource_defs, dry_run),
        "administrative_duties": lambda tables, activity_record, building_type_defs, resource_defs, dry_run=False:
            __import__('backend.engine.activity_processors.administrative_duties_processor', fromlist=['process_administrative_duties']).process_administrative_duties(
                tables, activity_record, building_type_defs, resource_defs, dry_run),
    }

    tables = initialize_airtable()
    if not tables:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable. Exiting.{LogColors.ENDC}")
        return

    if not specific_activity_id:
        # Perform pre-processing steps only if not targeting a specific activity
        log.info(f"{LogColors.OKBLUE}Running pre-processing steps (arrivals, interruptions, rescheduling, marking in_progress)...{LogColors.ENDC}")
        process_building_arrivals(tables, dry_run, forced_utc_datetime_override=forced_utc_datetime_for_check)
        if not dry_run:
            handle_activity_interruptions(tables, forced_utc_datetime_for_check)
            reschedule_created_activities_by_priority(tables, forced_utc_datetime_for_check, dry_run, target_citizen_username)
        else:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Would check for interruptions and reschedule activities.{LogColors.ENDC}")
            reschedule_created_activities_by_priority(tables, forced_utc_datetime_for_check, dry_run, target_citizen_username) # Still call for logging
        mark_started_activities_as_in_progress(tables, forced_utc_datetime_for_check, dry_run)
    else:
        log.info(f"{LogColors.WARNING}Targeting specific ActivityId '{specific_activity_id}'. Skipping pre-processing steps (arrivals, interruptions, rescheduling, marking in_progress).{LogColors.ENDC}")

    # Fetch definitions once
    building_type_defs = get_building_type_definitions_from_api()
    resource_defs = get_resource_definitions_from_api()

    if not building_type_defs or not resource_defs:
        log.error(f"{LogColors.FAIL}Failed to fetch building or resource definitions. Exiting.{LogColors.ENDC}")
        return

    # Shuffle the order of citizens to process if not targeting a specific citizen
    if not target_citizen_username:
        try:
            all_citizens_records = tables['citizens'].all(fields=['Username']) # Fetch all citizens
            random.shuffle(all_citizens_records) # Shuffle them
            # Now, when get_concluded_unprocessed_activities is called without target_citizen_username,
            # it fetches for all, but the outer loop in this script (if it iterates citizens) would be randomized.
            # However, get_concluded_unprocessed_activities fetches activities first, then we process them.
            # To randomize citizen processing order, we should fetch activities and then group by citizen, then shuffle citizens.
            # For now, let's adjust the activity fetching and processing loop.
            log.info(f"{LogColors.OKBLUE}Citizen processing order will be randomized.{LogColors.ENDC}")
        except Exception as e_shuffle:
            log.error(f"{LogColors.FAIL}Error preparing for randomized citizen processing: {e_shuffle}{LogColors.ENDC}")
            # Proceed without randomization if shuffling setup fails
    
    activities_to_process_raw = []
    if specific_activity_id:
        log.info(f"{LogColors.OKBLUE}Fetching specific activity by ActivityId: {specific_activity_id}{LogColors.ENDC}")
        try:
            # Assuming ActivityId is unique, fetch by it
            formula = f"{{ActivityId}} = '{_escape_airtable_value(specific_activity_id)}'"
            records = tables['activities'].all(formula=formula, max_records=1)
            if records:
                activities_to_process_raw = records
                log.info(f"{LogColors.OKGREEN}Found specific activity: {records[0]['id']}{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Specific activity with ActivityId '{specific_activity_id}' not found.{LogColors.ENDC}")
        except Exception as e_fetch_specific:
            log.error(f"{LogColors.FAIL}Error fetching specific activity '{specific_activity_id}': {e_fetch_specific}{LogColors.ENDC}")
    else:
        activities_to_process_raw = get_concluded_unprocessed_activities(tables, target_citizen_username, forced_utc_datetime_for_check)
        # If processing for all citizens (not specific_activity_id and not target_citizen_username), group and shuffle
        if not target_citizen_username: # This implies not specific_activity_id either
            activities_by_citizen_for_processing: Dict[str, List[Dict]] = {}
            for act_raw in activities_to_process_raw:
                citizen_name_for_group = act_raw['fields'].get('Citizen')
                if citizen_name_for_group:
                    if citizen_name_for_group not in activities_by_citizen_for_processing:
                        activities_by_citizen_for_processing[citizen_name_for_group] = []
                    activities_by_citizen_for_processing[citizen_name_for_group].append(act_raw)
            
            citizen_processing_order = list(activities_by_citizen_for_processing.keys())
            random.shuffle(citizen_processing_order)
            
            shuffled_activities_to_process_raw = []
            for citizen_name_ordered in citizen_processing_order:
                citizen_acts = activities_by_citizen_for_processing[citizen_name_ordered]
                random.shuffle(citizen_acts)
                shuffled_activities_to_process_raw.extend(citizen_acts)
            activities_to_process_raw = shuffled_activities_to_process_raw
            log.info(f"Randomized processing order for {len(citizen_processing_order)} citizens with activities. Activities within each citizen's batch are also randomized.")

    # Prepare activities for processing (parse dates) - only needed if not specific_activity_id
    # If specific_activity_id, we process it regardless of its dates.
    activities_to_process = []
    if not specific_activity_id:
        for act_raw in activities_to_process_raw:
            try:
                start_date_str = act_raw['fields'].get('StartDate')
                if start_date_str:
                    act_raw['fields']['_ParsedStartDate'] = dateutil_parser.isoparse(start_date_str)
                    activities_to_process.append(act_raw)
                else:
                    log.warning(f"Activity {act_raw.get('id', 'N/A')} missing StartDate, cannot sort. It might be processed out of order or skipped if sorting is critical.")
                    # Optionally, append anyway if out-of-order processing is acceptable for activities without StartDate
                    # activities_to_process.append(act_raw) 
            except Exception as e_parse_date: # Renamed variable for clarity
                log.error(f"Error parsing StartDate for activity {act_raw.get('id', 'N/A')} during date parsing: {e_parse_date}. Skipping this activity.")

    # If it was a targeted run for a specific citizen, shuffle their activities.
    # If it was a run for all citizens, activities_to_process is already built from
    # shuffled citizen order and shuffled activities within each citizen's block.
    if target_citizen_username and activities_to_process:
        random.shuffle(activities_to_process)
        log.info(f"Randomized processing order for {len(activities_to_process)} activities for citizen '{target_citizen_username}'.")
    
    # The global sort by StartDate is removed to preserve randomized order.
    else: # If specific_activity_id is provided, use activities_to_process_raw directly
        activities_to_process = activities_to_process_raw
    
    if not activities_to_process:
        if specific_activity_id:
            log.info(f"{LogColors.OKBLUE}Specific activity '{specific_activity_id}' not found or failed to parse. Nothing to process.{LogColors.ENDC}")
        elif target_citizen_username:
            log.info(f"{LogColors.OKBLUE}No concluded, unprocessed (and sortable by date) activities found for citizen '{target_citizen_username}'.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}No activities to process.{LogColors.ENDC}")
        return

    # processed_count = 0 # Moved to global_processed_count
    # failed_count = 0 # Moved to global_failed_count

    # Group activities by citizen for threaded processing
    activities_by_citizen: Dict[str, List[Dict]] = defaultdict(list)
    for act_proc in activities_to_process: # Use the date-parsed and potentially shuffled list
        citizen_username_for_group = act_proc['fields'].get('Citizen')
        if citizen_username_for_group:
            activities_by_citizen[citizen_username_for_group].append(act_proc)

    if not activities_by_citizen:
        log.info(f"{LogColors.OKBLUE}No activities grouped by citizen to process. Exiting main processing loop.{LogColors.ENDC}")
        # Final summary log will be handled after this block
    else:
        log.info(f"{LogColors.OKBLUE}Processing activities for {len(activities_by_citizen)} citizens in parallel (max 5 workers).{LogColors.ENDC}")
        
        MAX_WORKERS = 5
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_citizen_activity = {}
            
            # Prepare a list of citizens to process. If target_citizen_username is set, only process that one.
            # Otherwise, process all citizens found in activities_by_citizen.
            citizens_to_run_processing_for = []
            if target_citizen_username:
                if target_citizen_username in activities_by_citizen:
                    citizens_to_run_processing_for = [target_citizen_username]
                else:
                    log.info(f"{LogColors.OKBLUE}Target citizen {target_citizen_username} has no activities in the current batch to process.{LogColors.ENDC}")
            elif specific_activity_id: # If specific_activity_id, activities_by_citizen will contain only that citizen's activities (likely one)
                citizens_to_run_processing_for = list(activities_by_citizen.keys())
            else: # Process all citizens with activities, order already randomized if applicable
                citizens_to_run_processing_for = list(activities_by_citizen.keys())


            for citizen_username_iter in citizens_to_run_processing_for:
                citizen_activities_list = activities_by_citizen[citizen_username_iter]
                # Sort activities for a given citizen by their original StartDate to maintain logical sequence for that citizen
                citizen_activities_list.sort(key=lambda x: x['fields'].get('_ParsedStartDate', datetime.max.replace(tzinfo=pytz.UTC)))

                log.info(f"Submitting tasks for citizen {citizen_username_iter} with {len(citizen_activities_list)} activities.")
                # Each citizen's activities are processed sequentially within their own thread.
                # The process_all_activities_for_one_citizen function will loop through citizen_activities_list.
                future = executor.submit(
                    process_all_activities_for_one_citizen,
                    citizen_username_iter, # Pass username for logging/context
                    citizen_activities_list,
                    tables,
                    building_type_defs,
                    resource_defs,
                    dry_run,
                    args.model, # Pass the kinos_model_override from main args
                    counter_lock,
                    API_BASE_URL # Pass API_BASE_URL
                )
                future_to_citizen_activity[future] = citizen_username_iter

            for future in concurrent.futures.as_completed(future_to_citizen_activity):
                citizen_user = future_to_citizen_activity[future]
                try:
                    processed_in_thread, failed_in_thread = future.result()
                    with counter_lock:
                        global_processed_count += processed_in_thread
                        global_failed_count += failed_in_thread
                    log.info(f"Citizen {citizen_user} processing completed. Processed: {processed_in_thread}, Failed: {failed_in_thread}")
                except Exception as exc:
                    log.error(f"{LogColors.FAIL}Citizen {citizen_user} processing generated an exception: {exc}{LogColors.ENDC}")
                    # Increment failed_count for the number of activities that were supposed to be processed by this failed thread for this citizen
                    # This is an approximation; ideally, the thread itself would report how many it attempted before failing.
                    # For now, assume all activities for this citizen in this batch failed if the thread errors out.
                    num_activities_for_failed_citizen = len(activities_by_citizen.get(citizen_user, []))
                    with counter_lock:
                        global_failed_count += num_activities_for_failed_citizen 
                    import traceback
                    log.error(traceback.format_exc())

    summary_color = LogColors.OKGREEN if global_failed_count == 0 else LogColors.WARNING if global_processed_count > 0 else LogColors.FAIL
    log.info(f"{summary_color}Process Activities script finished. Total Processed: {global_processed_count}, Total Failed: {global_failed_count}.{LogColors.ENDC}")


def process_all_activities_for_one_citizen(
    citizen_username_log_ctx: str, # For logging context
    citizen_activities: List[Dict], 
    tables: Dict[str, Table], 
    building_type_defs: Dict, 
    resource_defs: Dict, 
    dry_run: bool,
    kinos_model_override: Optional[str], # For reply_to_message
    lock: threading.Lock,
    api_base_url_for_processors: str # Added to pass to processors
) -> Tuple[int, int]:
    """
    Processes all activities for a single citizen. This function is intended to be run in a thread.
    Returns a tuple (processed_count, failed_count) for this citizen.
    """
    thread_processed_count = 0
    thread_failed_count = 0
    
    # Re-fetch ACTIVITY_PROCESSORS mapping here or ensure it's passed if it becomes dynamic
    # For now, assume it's globally accessible as defined in main scope.
    # If it's not, it needs to be passed or redefined.
    # To be safe, let's copy the definition or relevant parts if it's complex.
    # For simplicity, assuming ACTIVITY_PROCESSORS is accessible.
    # Accessing args.model directly won't work in a thread if args is not passed.
    # kinos_model_override is now passed as an argument.

    ACTIVITY_PROCESSORS = { # Copied from main for thread safety / clarity
        "deliver_resource_batch": process_deliver_resource_batch_fn,
        "goto_home": process_goto_home_fn,
        "goto_work": process_goto_work_fn,
        "production": process_production_fn,
        "fetch_resource": process_fetch_resource_fn,
        "eat_from_inventory": process_eat_fn,
        "eat_at_home": process_eat_fn,
        "eat_at_tavern": process_eat_fn,
        "pickup_from_galley": process_pickup_from_galley,
        "deliver_resource_to_buyer": process_deliver_resource_to_buyer,
        "leave_venice": process_leave_venice_fn,
        "deliver_construction_materials": process_deliver_construction_materials_fn,
        "construct_building": process_construct_building_fn,
        "goto_construction_site": process_goto_construction_site_fn,
        "secure_warehouse": process_placeholder_activity_fn,
        "deliver_to_storage": process_deliver_to_storage_fn,
        "fetch_from_storage": process_fetch_from_storage_fn,
        "goto_building_for_storage_fetch": process_goto_building_for_storage_fetch_fn,
        "fetch_for_logistics_client": process_fetch_for_logistics_client_fn,
        "check_business_status": process_check_business_status_fn,
        "fishing": process_fishing_activity_fn,
        "emergency_fishing": process_fishing_activity_fn,
        "deliver_to_citizen": process_deliver_to_citizen_fn,
        "inspect_building_for_purchase": process_inspect_building_for_purchase_fn,
        "submit_building_purchase_offer": process_submit_building_purchase_offer_fn,
        "execute_respond_to_building_bid": process_execute_respond_to_building_bid_fn,
        "execute_withdraw_building_bid": process_execute_withdraw_building_bid_fn,
        "finalize_manage_markup_buy_contract": process_finalize_manage_markup_buy_contract_fn,
        "finalize_manage_storage_query_contract": process_finalize_manage_storage_query_contract_fn,
        "finalize_update_citizen_profile": process_finalize_update_citizen_profile_fn,
        "manage_public_dock": process_manage_public_dock_fn,
        "work_on_art": process_work_on_art_fn,
        "read_book": process_read_book_fn,
        "read_at_library": process_read_at_library_fn,
        "goto_inn": process_goto_inn_fn,
        "deposit_items_at_location": process_deposit_items_at_location,
        "attend_theater_performance": process_attend_theater_performance_fn,
        "drink_at_inn": process_drink_at_inn_fn,
        "use_public_bath": process_use_public_bath_fn, # New public bath activity
        "rest": process_rest_fn, # New rest processor
        "occupant_self_construction": process_occupant_self_construction_fn, # New
        "idle": process_placeholder_activity_fn,
        "pray": process_pray, # Pray processor
        "bid_on_land": process_bid_on_land_fn,
        "goto_location": process_goto_location_fn,
        "submit_land_bid": process_bid_on_land_fn,
        "prepare_goods_for_sale": process_manage_public_sell_contract_fn,
        "register_public_sell_offer": process_manage_public_sell_contract_fn,
        "assess_import_needs": process_manage_import_contract_fn,
        "register_import_agreement": process_manage_import_contract_fn,
        "register_public_import_agreement": process_manage_public_import_contract_fn,
        "assess_logistics_needs": process_manage_logistics_service_contract_fn,
        "register_logistics_service_contract": process_manage_logistics_service_contract_fn,
        "finalize_land_purchase": process_buy_available_land_fn,
        "inspect_land_plot": process_initiate_building_project_fn,
        "submit_building_project": process_initiate_building_project_fn,
        "file_lease_adjustment": process_adjust_land_lease_price_fn,
        "file_rent_adjustment": process_adjust_building_rent_price_fn,
        "file_building_lease_adjustment": process_file_building_lease_adjustment_fn,
        "update_wage_ledger": process_adjust_business_wages_fn,
        "finalize_operator_change": process_change_business_manager_fn,
        "submit_loan_application_form": process_request_loan_fn,
        "register_loan_offer_terms": process_offer_loan_fn,
        "deliver_message_interaction": process_send_message_fn,
        "reply_to_message": process_reply_to_message_fn,
        "perform_guild_membership_action": process_manage_guild_membership_fn,
        "register_public_storage_offer": process_register_public_storage_offer_fn,
        "finalize_list_land_for_sale": process_list_land_for_sale_fn,
        "finalize_make_offer_for_land": process_make_offer_for_land_fn,
        "execute_accept_land_offer": process_accept_land_offer_fn,
        "execute_buy_listed_land": process_buy_listed_land_fn,
        "execute_cancel_land_listing": process_cancel_land_listing_fn,
        "execute_cancel_land_offer": process_cancel_land_offer_fn,
        "spread_rumor": process_spread_rumor_fn,
        "send_diplomatic_email": process_send_diplomatic_email,
    }

    for activity_record in citizen_activities:
        activity_type = activity_record['fields'].get('Type')
        activity_id_airtable = activity_record['id'] # Define activity_id_airtable here
        activity_guid = activity_record['fields'].get('ActivityId', activity_id_airtable)

        log.info(f"{LogColors.HEADER}--- Processing activity {activity_guid} (Citizen: {citizen_username_log_ctx}) of type {activity_type} ---{LogColors.ENDC}")
        
        processing_status = "processed" # Assume success
        
        if dry_run:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Citizen {citizen_username_log_ctx}: Would process activity {activity_guid} of type {activity_type}.{LogColors.ENDC}")
            processor_exists = activity_type in ACTIVITY_PROCESSORS or \
                               (activity_type == "reply_to_message" and process_reply_to_message_fn is not None)
            if not processor_exists:
                log.warning(f"{LogColors.WARNING}[DRY RUN] Citizen {citizen_username_log_ctx}: No processor for activity type: {activity_type} (ID: {activity_guid}). Would mark as failed.{LogColors.ENDC}")
                processing_status = "failed"
        else:
            processor_func = ACTIVITY_PROCESSORS.get(activity_type)
            try:
                if activity_type == "reply_to_message":
                    if not process_reply_to_message_fn(
                        tables, activity_record, building_type_defs, resource_defs,
                        kinos_model_override=kinos_model_override # Use passed override
                    ):
                        processing_status = "failed"
                elif processor_func:
                    # Pass api_base_url_for_processors to the processor function
                    # For activities that use KinOS (pray, etc.), also pass kinos_model_override
                    if activity_type == "pray":
                        if not processor_func(tables, activity_record, building_type_defs, resource_defs, api_base_url_for_processors, kinos_model_override):
                            processing_status = "failed"
                    else:
                        if not processor_func(tables, activity_record, building_type_defs, resource_defs, api_base_url_for_processors):
                            processing_status = "failed"
                else:
                    log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx}: No processor for activity type: {activity_type} (ID: {activity_guid}). Marking as failed.{LogColors.ENDC}")
                    log.info(f"Available processors: {', '.join(sorted(ACTIVITY_PROCESSORS.keys()))}")
                    processing_status = "failed"
            except Exception as e_process:
                log.error(f"{LogColors.FAIL}Citizen {citizen_username_log_ctx}: Exception during processing of activity {activity_guid} (type {activity_type}): {e_process}{LogColors.ENDC}")
                import traceback
                tb_str = traceback.format_exc()
                log.error(tb_str)
                processing_status = "error" 

                # Send Telegram notification for the error
                # citizen_username_for_error_log = activity_record['fields'].get('Citizen', 'UnknownCitizen') # Already have citizen_username_log_ctx
                error_message_telegram = (
                    f"❌ Activity Processing Error\n\n"
                    f"Citizen: `{citizen_username_log_ctx}`\n"
                    f"ActivityId: `{activity_guid}`\n"
                    f"ActivityType: `{activity_type}`\n"
                    f"Exception: `{str(e_process)}`\n\n"
                    f"```\n--- Traceback ---\n{tb_str[-1000:]}\n```" # Last 1000 chars of traceback
                )
                send_telegram_notification(error_message_telegram)

        # Update status in a thread-safe way if needed, though update_activity_status itself should be fine.
        if dry_run:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Citizen {citizen_username_log_ctx}: Would update activity {activity_guid} status to '{processing_status}'.{LogColors.ENDC}")
        else:
            update_activity_status(tables, activity_id_airtable, processing_status)

        if processing_status == "processed":
            thread_processed_count += 1
        else: # 'failed' or 'error'
            thread_failed_count += 1
            
            # If this activity is part of a chain, mark subsequent activities as failed
            try:
                activity_citizen_for_chain_check = activity_record['fields'].get('Citizen') # Should match citizen_username_log_ctx
                activity_created_at = activity_record['fields'].get('CreatedAt')
                activity_end_date = activity_record['fields'].get('EndDate')
                
                if activity_citizen_for_chain_check and activity_created_at and activity_end_date: # Use defined variable
                    # Find activities for same citizen, created at same time (within 1 second), with start date = this activity's end date
                    # This indicates they are part of the same chain
                    created_at_min = (datetime.fromisoformat(activity_created_at.replace('Z', '+00:00')) - timedelta(seconds=1)).replace(microsecond=0).isoformat()
                    created_at_max = (datetime.fromisoformat(activity_created_at.replace('Z', '+00:00')) + timedelta(seconds=1)).replace(microsecond=0).isoformat()
                    
                    # In the new architecture, activities in a chain are created together by the activity creator
                    # and have their StartDate set to the EndDate of the previous activity in the chain
                    formula = f"AND({{Citizen}}='{_escape_airtable_value(activity_citizen_for_chain_check)}', {{CreatedAt}} >= '{created_at_min}', {{CreatedAt}} <= '{created_at_max}', {{StartDate}} >= '{activity_end_date}', {{Status}}='created')" # Use defined variable
                    # Sort by StartDate to process them in order if multiple exist, though unlikely for this specific logic
                    dependent_activities = tables['activities'].all(formula=formula, sort=['StartDate'])
                    
                    if dependent_activities:
                        log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx}: Found {len(dependent_activities)} dependent activities for failed activity {activity_guid}. Marking them as failed.{LogColors.ENDC}")
                        for dep_activity in dependent_activities:
                            dep_activity_id = dep_activity['id']
                            dep_activity_guid = dep_activity['fields'].get('ActivityId', dep_activity_id)
                            if dry_run:
                                log.warning(f"{LogColors.OKCYAN}[DRY RUN] Citizen {citizen_username_log_ctx}: Would mark dependent activity {dep_activity_guid} as failed.{LogColors.ENDC}")
                            else:
                                update_activity_status(tables, dep_activity_id, "failed") # This is thread-safe per call
                                log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx}: Marked dependent activity {dep_activity_guid} as failed.{LogColors.ENDC}")
                            thread_failed_count += 1 # Count these as additional failures for this citizen's batch
            except Exception as e_chain:
                log.error(f"{LogColors.FAIL}Citizen {citizen_username_log_ctx}: Error checking for dependent activities for {activity_guid}: {e_chain}{LogColors.ENDC}")
        
        # Gondola Fee Processing
        activity_path_json = activity_record['fields'].get('Path')
        # citizen_username_for_fee = activity_record['fields'].get('Citizen') # Use citizen_username_log_ctx
        activity_custom_id_for_fee = activity_record['fields'].get('ActivityId', activity_id_airtable)
        transporter_username = activity_record['fields'].get('Transporter')

        if activity_path_json and citizen_username_log_ctx and not dry_run:
            gondola_distance_km, gondola_fee = calculate_gondola_travel_details(activity_path_json)
            if gondola_fee > 0:
                traveler_citizen_record = get_citizen_record(tables, citizen_username_log_ctx)
                
                fee_recipient_username = "ConsiglioDeiDieci" # Default recipient
                recipient_found_from_path = False

                # 1. Try to find recipient from path first
                log.info(f"{LogColors.OKBLUE}Checking path for public_dock operator for activity {activity_guid}.{LogColors.ENDC}")
                try:
                    path_points = json.loads(activity_path_json) if activity_path_json else []
                    for point in path_points:
                        # Assuming path points of type 'dock' have a 'nodeId' that is the BuildingId of the dock
                        if point.get("type") == "dock" and point.get("nodeId"):
                            dock_building_id = point.get("nodeId")
                            dock_record = get_building_record(tables, dock_building_id) 
                            if dock_record and dock_record['fields'].get('Type') == 'public_dock':
                                run_by_user = dock_record['fields'].get('RunBy')
                                if run_by_user and run_by_user != "ConsiglioDeiDieci":
                                    run_by_citizen_check = get_citizen_record(tables, run_by_user)
                                    if run_by_citizen_check:
                                        fee_recipient_username = run_by_user
                                        recipient_found_from_path = True
                                        log.info(f"{LogColors.OKBLUE}Gondola fee for activity {activity_guid} assigned to RunBy ({run_by_user}) of public_dock {dock_building_id} found in path.{LogColors.ENDC}")
                                        break # Found a valid recipient from path
                                    else:
                                        log.warning(f"{LogColors.WARNING}RunBy user {run_by_user} for public_dock {dock_building_id} (from path) not found. Checking next dock in path.{LogColors.ENDC}")
                                # else: Dock has no RunBy or RunBy is Consiglio, check next dock
                            # else: Not a public_dock, or dock not found, check next point
                except json.JSONDecodeError:
                    log.error(f"{LogColors.FAIL}Failed to parse activity path JSON for activity {activity_guid} while checking for dock operator: {activity_path_json}{LogColors.ENDC}")
                
                # 2. If no recipient from path, try Transporter field
                if not recipient_found_from_path:
                    log.info(f"{LogColors.OKBLUE}No specific dock operator found in path for activity {activity_guid}. Checking Transporter field value: {transporter_username}.{LogColors.ENDC}")
                    if transporter_username and transporter_username != "ConsiglioDeiDieci":
                        transporter_citizen_record_check = get_citizen_record(tables, transporter_username)
                        if transporter_citizen_record_check:
                            fee_recipient_username = transporter_username
                            log.info(f"{LogColors.OKBLUE}Gondola fee for activity {activity_guid} assigned to Transporter field value (citizen): {transporter_username}.{LogColors.ENDC}")
                        else:
                            # Transporter field had a name, but it's not a valid citizen. Fee remains with current fee_recipient_username (likely Consiglio).
                            log.warning(f"{LogColors.WARNING}Transporter {transporter_username} in activity {activity_guid} was not a valid citizen. Fee defaults to {fee_recipient_username}.{LogColors.ENDC}")
                    elif transporter_username == "ConsiglioDeiDieci":
                         log.info(f"{LogColors.OKBLUE}Transporter field is 'ConsiglioDeiDieci'. Fee remains with {fee_recipient_username} (current value, likely ConsiglioDeiDieci unless path check found someone else).{LogColors.ENDC}")
                    else: # transporter_username is None or empty
                         log.info(f"{LogColors.OKBLUE}Transporter field is empty or None. Fee remains with {fee_recipient_username} (current value, likely ConsiglioDeiDieci unless path check found someone else).{LogColors.ENDC}")
                
                # At this point, fee_recipient_username is set (either specific operator or ConsiglioDeiDieci).
                fee_recipient_record = get_citizen_record(tables, fee_recipient_username)

                if traveler_citizen_record and fee_recipient_record:
                    traveler_ducats = float(traveler_citizen_record['fields'].get('Ducats', 0))
                    if traveler_ducats >= gondola_fee:
                        recipient_ducats = float(fee_recipient_record['fields'].get('Ducats', 0))
                        # VENICE_TIMEZONE is imported from activity_helpers
                        now_venice_fee = datetime.now(VENICE_TIMEZONE) # Use imported VENICE_TIMEZONE
                        now_iso_fee = now_venice_fee.isoformat()

                        tables['citizens'].update(traveler_citizen_record['id'], {'Ducats': traveler_ducats - gondola_fee})
                        tables['citizens'].update(fee_recipient_record['id'], {'Ducats': recipient_ducats + gondola_fee})
                        
                        transaction_payload = {
                            "Type": "gondola_fee",
                            "AssetType": "transport_activity",
                            "Asset": activity_custom_id_for_fee,
                            "Seller": fee_recipient_username, # Recipient of the fee
                            "Buyer": citizen_username_log_ctx,  # Payer of the fee
                            "Price": gondola_fee,
                            "Notes": json.dumps({
                                "activity_guid": activity_guid,
                                "distance_km": round(gondola_distance_km, 2),
                                "path_preview": activity_path_json[:100] + "..." if activity_path_json else "",
                                "original_transporter_field": transporter_username # Log what was in the Transporter field
                            }),
                            "CreatedAt": now_iso_fee,
                            "ExecutedAt": now_iso_fee
                        }
                        tables['transactions'].create(transaction_payload)
                        log.info(f"{LogColors.OKGREEN}Citizen {citizen_username_log_ctx} paid {gondola_fee:.2f} Ducats gondola fee to {fee_recipient_username} for activity {activity_guid}. Distance: {gondola_distance_km:.2f} km.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx} has insufficient Ducats ({traveler_ducats:.2f}) for gondola fee ({gondola_fee:.2f}) for activity {activity_guid}.{LogColors.ENDC}")
                else:
                    if not traveler_citizen_record: log.error(f"{LogColors.FAIL}Traveler citizen {citizen_username_log_ctx} not found for gondola fee.{LogColors.ENDC}")
                    if not fee_recipient_record: log.error(f"{LogColors.FAIL}Fee recipient citizen {fee_recipient_username} not found for gondola fee.{LogColors.ENDC}")
        elif dry_run and activity_path_json and citizen_username_log_ctx:
             gondola_distance_km, gondola_fee = calculate_gondola_travel_details(activity_path_json)
             if gondola_fee > 0:
                fee_recipient_username_dry_run = transporter_username if transporter_username and transporter_username != "ConsiglioDeiDieci" else "ConsiglioDeiDieci"
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Citizen {citizen_username_log_ctx}: Would process gondola fee of {gondola_fee:.2f} Ducats to {fee_recipient_username_dry_run} for activity {activity_guid} (Distance: {gondola_distance_km:.2f} km).{LogColors.ENDC}")

        # Update citizen's position
        # or if the activity doesn't involve changing location (e.g. eat_from_inventory, eat_at_home, eat_at_tavern if already there)
        # This block is now outside the if/else success block.
        no_pos_update_types = [
            'fetch_resource', 'fetch_from_galley', 
            'eat_from_inventory', 'eat_at_home', 'eat_at_tavern', 
            'production', 'rest', 'idle',
            'fishing', 'emergency_fishing', # Fishing processor handles its own position update
            'work_on_art', # work_on_art happens at a location, position update is handled by goto_location if travel was needed
            'goto_inn' # Simple goto_inn processor updates position, so generic update here is fine/redundant but harmless
        ]
        
        # Define VENICE_TIMEZONE for potential UpdatedAt override, though Airtable usually handles it.
        # from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # VENICE_TIMEZONE already imported above

        if activity_type not in no_pos_update_types:
            to_building_custom_id = activity_record['fields'].get('ToBuilding') 
            # citizen_username_for_pos = activity_record['fields'].get('Citizen') # Use citizen_username_log_ctx

            if to_building_custom_id and citizen_username_log_ctx and not dry_run:
                try:
                    building_record_for_pos = get_building_record(tables, to_building_custom_id)
                    citizen_record_for_pos = get_citizen_record(tables, citizen_username_log_ctx) # Use context username

                    if building_record_for_pos and citizen_record_for_pos:
                        building_position_str = building_record_for_pos['fields'].get('Position')
                        
                        if not building_position_str:
                            log.info(f"{LogColors.OKBLUE}Building {to_building_custom_id} 'Position' field is empty. Attempting to parse from BuildingId or Point.{LogColors.ENDC}")
                            parsed_pos_coords = None
                            
                            # Try parsing from BuildingId (e.g., "building_lat_lng..." or "canal_lat_lng...")
                            building_id_str_for_parse = building_record_for_pos['fields'].get('BuildingId', '')
                            parts = building_id_str_for_parse.split('_')
                            if len(parts) >= 3: # e.g. building_45.43_12.35 or canal_45.43_12.35
                                try:
                                    lat = float(parts[1])
                                    lng = float(parts[2])
                                    parsed_pos_coords = {"lat": lat, "lng": lng}
                                    log.info(f"{LogColors.OKBLUE}Parsed position {parsed_pos_coords} from BuildingId '{building_id_str_for_parse}'.{LogColors.ENDC}")
                                except (ValueError, IndexError):
                                    log.debug(f"{LogColors.WARNING}Could not parse lat/lng from BuildingId '{building_id_str_for_parse}'.{LogColors.ENDC}")
                                    # Continue to try Point field

                            # If not found in BuildingId, try parsing from Point field
                            if not parsed_pos_coords:
                                point_field_str = building_record_for_pos['fields'].get('Point', '')
                                if point_field_str and isinstance(point_field_str, str): # Ensure Point is a string
                                    point_parts = point_field_str.split('_')
                                    if len(point_parts) >= 3: # e.g. building_45.43_12.35 or canal_45.43_12.35
                                        try:
                                            lat = float(point_parts[1])
                                            lng = float(point_parts[2])
                                            parsed_pos_coords = {"lat": lat, "lng": lng}
                                            log.info(f"{LogColors.OKBLUE}Parsed position {parsed_pos_coords} from Point field '{point_field_str}'.{LogColors.ENDC}")
                                        except (ValueError, IndexError):
                                            log.debug(f"{LogColors.WARNING}Could not parse lat/lng from Point field '{point_field_str}'.{LogColors.ENDC}")
                                    else:
                                        log.debug(f"{LogColors.WARNING}Point field '{point_field_str}' not in expected format for parsing.{LogColors.ENDC}")
                                else:
                                    log.debug(f"{LogColors.WARNING}Point field is empty or not a string for building {to_building_custom_id}.{LogColors.ENDC}")
                            
                            if parsed_pos_coords:
                                building_position_str = json.dumps(parsed_pos_coords)

                        if building_position_str:
                            update_payload = {'Position': building_position_str}
                            tables['citizens'].update(citizen_record_for_pos['id'], update_payload)
                            log.info(f"{LogColors.OKGREEN}Citizen {citizen_username_log_ctx}: Updated Position to {building_position_str} (Building Custom ID: {to_building_custom_id}).{LogColors.ENDC}")
                        else:
                            log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx}: Building {to_building_custom_id} missing parsable Position/BuildingId/Point. Cannot update position.{LogColors.ENDC}")
                    else: 
                        if not building_record_for_pos:
                            log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx}: Target building (Custom ID: {to_building_custom_id}) not found. Cannot update position.{LogColors.ENDC}")
                        if not citizen_record_for_pos: 
                            log.warning(f"{LogColors.WARNING}Citizen {citizen_username_log_ctx} not found. Cannot update position.{LogColors.ENDC}")
                except Exception as e_update_pos:
                    log.error(f"{LogColors.FAIL}Citizen {citizen_username_log_ctx}: Error updating position after activity {activity_guid}: {e_update_pos}{LogColors.ENDC}")
        elif dry_run and activity_type not in no_pos_update_types:
            to_building_custom_id_dry = activity_record['fields'].get('ToBuilding')
            # citizen_username_dry = activity_record['fields'].get('Citizen') # Use citizen_username_log_ctx
            if to_building_custom_id_dry and citizen_username_log_ctx:
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Citizen {citizen_username_log_ctx}: Would update position based on ToBuilding (Custom ID: {to_building_custom_id_dry}).{LogColors.ENDC}")
        
        log.info(f"{LogColors.HEADER}--- Citizen {citizen_username_log_ctx}: Finished processing activity {activity_guid} ---{LogColors.ENDC}")

    return thread_processed_count, thread_failed_count


def handle_activity_interruptions(tables: Dict[str, Table], now_utc_for_check_override: Optional[datetime] = None):
    """
    Checks for overlapping activities and marks 'idle' or 'rest' activities as 'interrupted'
    if another higher-priority activity is active for the same citizen.
    """
    now_utc_to_use = now_utc_for_check_override if now_utc_for_check_override else datetime.now(timezone.utc)
    if now_utc_for_check_override:
        log.info(f"{LogColors.WARNING}handle_activity_interruptions is using provided time for check: {now_utc_to_use.isoformat()}{LogColors.ENDC}")

    activities_by_citizen: Dict[str, List[Dict]] = {}
    try:
        # Fetch all 'created' or 'in_progress' activities for ALL citizens in one go
        all_relevant_activities_formula = "OR({Status}='created', {Status}='in_progress')"
        all_potentially_interruptible_activities = tables['activities'].all(formula=all_relevant_activities_formula)
        
        # Group activities by citizen
        for activity in all_potentially_interruptible_activities:
            citizen_username = activity['fields'].get('Citizen')
            if citizen_username:
                if citizen_username not in activities_by_citizen:
                    activities_by_citizen[citizen_username] = []
                activities_by_citizen[citizen_username].append(activity)
        log.info(f"Fetched {len(all_potentially_interruptible_activities)} potentially interruptible activities for {len(activities_by_citizen)} citizens.")

    except Exception as e_fetch_all_activities:
        log.error(f"{LogColors.FAIL}Failed to fetch all 'created' or 'in_progress' activities for interruption check: {e_fetch_all_activities}{LogColors.ENDC}")
        return

    for citizen_username, citizen_activities in activities_by_citizen.items():
        if not citizen_activities: # Should not happen if grouping is correct
            continue

        currently_active_for_citizen: List[Dict] = []
        for activity in citizen_activities: # Already filtered by citizen
            start_date_str = activity['fields'].get('StartDate')
            end_date_str = activity['fields'].get('EndDate')

            if start_date_str and end_date_str:
                try:
                    start_date_dt = dateutil_parser.isoparse(start_date_str)
                    end_date_dt = dateutil_parser.isoparse(end_date_str)

                    if start_date_dt.tzinfo is None: start_date_dt = pytz.utc.localize(start_date_dt)
                    if end_date_dt.tzinfo is None: end_date_dt = pytz.utc.localize(end_date_dt)
                    
                    if start_date_dt <= now_utc_to_use <= end_date_dt:
                        currently_active_for_citizen.append(activity)
                except Exception as e_parse_dates:
                    log.error(f"{LogColors.FAIL}Error parsing dates for activity {activity['id']} for citizen {citizen_username}: {e_parse_dates}{LogColors.ENDC}")
        
        if len(currently_active_for_citizen) > 1:
            # We have multiple activities active at the same time for this citizen
            low_priority_tasks = []
            other_tasks = []
            for active_task in currently_active_for_citizen:
                task_type = active_task['fields'].get('Type', '').lower()
                if task_type in ['idle', 'rest']:
                    low_priority_tasks.append(active_task)
                else:
                    other_tasks.append(active_task)
            
            if low_priority_tasks and other_tasks:
                # If there's at least one low-priority task and at least one other task active simultaneously
                for lp_task in low_priority_tasks:
                    lp_task_id_airtable = lp_task['id']
                    lp_task_guid = lp_task['fields'].get('ActivityId', lp_task_id_airtable)
                    lp_task_type = lp_task['fields'].get('Type')
                    
                    # Check if it's not already interrupted to avoid redundant updates
                    if lp_task['fields'].get('Status') != 'interrupted':
                        log.info(f"{LogColors.WARNING}Citizen {citizen_username} has overlapping activities. Interrupting low-priority task '{lp_task_type}' (ID: {lp_task_guid}). Other active tasks: {[ot['fields'].get('Type') for ot in other_tasks]}.{LogColors.ENDC}")
                        update_activity_status(tables, lp_task_id_airtable, "interrupted")
                    else:
                        log.debug(f"Low-priority task '{lp_task_type}' (ID: {lp_task_guid}) for citizen {citizen_username} is already interrupted. Skipping.")


def reschedule_created_activities_by_priority(
    tables: Dict[str, Table], 
    now_utc_for_check_override: Optional[datetime] = None,
    dry_run: bool = False,
    target_citizen_username_filter: Optional[str] = None
):
    """
    Reschedules 'created' activities for citizens based on priority.
    Activities are grouped into 'endeavors' (likely chains) and then these endeavors
    are scheduled sequentially according to their priority.
    """
    now_utc_to_use = now_utc_for_check_override if now_utc_for_check_override else datetime.now(timezone.utc)
    if now_utc_for_check_override:
        log.info(f"{LogColors.WARNING}reschedule_created_activities_by_priority is using provided time for check: {now_utc_to_use.isoformat()}{LogColors.ENDC}")

    citizens_to_process_scheduling = []
    if target_citizen_username_filter:
        citizen_rec = get_citizen_record(tables, target_citizen_username_filter)
        if citizen_rec:
            citizens_to_process_scheduling.append(citizen_rec)
        else:
            log.warning(f"{LogColors.WARNING}Target citizen {target_citizen_username_filter} not found for rescheduling.{LogColors.ENDC}")
            return
    else:
        try:
            citizens_to_process_scheduling = tables['citizens'].all(fields=['Username']) # Only need Username for filtering activities
        except Exception as e_fetch_all_citizens:
            log.error(f"{LogColors.FAIL}Failed to fetch all citizens for rescheduling: {e_fetch_all_citizens}{LogColors.ENDC}")
            return

    for citizen_data in citizens_to_process_scheduling:
        citizen_username = citizen_data['fields'].get('Username')
        if not citizen_username:
            continue

        log.info(f"{LogColors.OKBLUE}Processing rescheduling for citizen: {citizen_username}{LogColors.ENDC}")

        try:
            formula = f"AND({{Citizen}}='{_escape_airtable_value(citizen_username)}', {{Status}}='created')"
            created_activities_raw = tables['activities'].all(formula=formula)
        except Exception as e_fetch_citizen_activities:
            log.error(f"{LogColors.FAIL}Failed to fetch 'created' activities for citizen {citizen_username}: {e_fetch_citizen_activities}{LogColors.ENDC}")
            continue

        if not created_activities_raw:
            log.info(f"No 'created' activities found for citizen {citizen_username} to reschedule.{LogColors.ENDC}")
            continue

        # Parse dates and add to a new list for easier processing
        created_activities = []
        for act_raw in created_activities_raw:
            try:
                act_raw['fields']['_StartDateDt'] = dateutil_parser.isoparse(act_raw['fields']['StartDate'])
                act_raw['fields']['_EndDateDt'] = dateutil_parser.isoparse(act_raw['fields']['EndDate'])
                act_raw['fields']['_CreatedAtDt'] = dateutil_parser.isoparse(act_raw['fields']['CreatedAt'])
                if act_raw['fields']['_StartDateDt'].tzinfo is None: act_raw['fields']['_StartDateDt'] = pytz.utc.localize(act_raw['fields']['_StartDateDt'])
                if act_raw['fields']['_EndDateDt'].tzinfo is None: act_raw['fields']['_EndDateDt'] = pytz.utc.localize(act_raw['fields']['_EndDateDt'])
                if act_raw['fields']['_CreatedAtDt'].tzinfo is None: act_raw['fields']['_CreatedAtDt'] = pytz.utc.localize(act_raw['fields']['_CreatedAtDt'])
                created_activities.append(act_raw)
            except Exception as e_parse:
                log.error(f"Error parsing dates for activity {act_raw.get('id', 'N/A')} for citizen {citizen_username}: {e_parse}. Skipping this activity for rescheduling.")
        
        if not created_activities: # If all failed parsing
            log.info(f"No valid 'created' activities after date parsing for citizen {citizen_username}.")
            continue

        # Group activities into endeavors
        # Heuristic: Same Priority and CreatedAt within ~2 seconds.
        endeavors: List[List[Dict]] = []
        temp_activities = sorted(created_activities, key=lambda x: (x['fields'].get('Priority', 0), x['fields']['_CreatedAtDt']))
        
        current_endeavor: List[Dict] = []
        for act in temp_activities:
            priority = act['fields'].get('Priority', 0)
            created_at_dt = act['fields']['_CreatedAtDt']

            if not current_endeavor:
                current_endeavor.append(act)
            else:
                last_act_in_endeavor = current_endeavor[-1]
                last_priority = last_act_in_endeavor['fields'].get('Priority', 0)
                last_created_at_dt = last_act_in_endeavor['fields']['_CreatedAtDt']
                
                if priority == last_priority and abs((created_at_dt - last_created_at_dt).total_seconds()) <= 2:
                    current_endeavor.append(act)
                else:
                    endeavors.append(list(current_endeavor)) # Add a copy
                    current_endeavor = [act]
        
        if current_endeavor: # Add the last endeavor
            endeavors.append(list(current_endeavor))

        # Sort endeavors: Primary by Priority (desc), Secondary by earliest original StartDate in endeavor (asc)
        def get_endeavor_sort_keys(endeavor_list: List[Dict]):
            priority = endeavor_list[0]['fields'].get('Priority', 0) if endeavor_list else 0
            min_start_date = min(act['fields']['_StartDateDt'] for act in endeavor_list) if endeavor_list else datetime.max.replace(tzinfo=pytz.UTC)
            return (-priority, min_start_date) # Negative priority for descending sort

        endeavors.sort(key=get_endeavor_sort_keys)

        log.info(f"Citizen {citizen_username}: Identified {len(endeavors)} endeavors to reschedule.")

        # Reschedule endeavors sequentially
        global_next_available_time_utc = now_utc_to_use
    
        # Fetch citizen's current position once
        citizen_current_pos_record = get_citizen_record(tables, citizen_username)
        citizen_initial_pos_str = citizen_current_pos_record['fields'].get('Position') if citizen_current_pos_record else None
        endeavor_previous_activity_end_location_coords: Optional[Dict[str, float]] = None
        if citizen_initial_pos_str:
            try:
                endeavor_previous_activity_end_location_coords = json.loads(citizen_initial_pos_str)
            except json.JSONDecodeError:
                log.warning(f"{LogColors.WARNING}Could not parse initial position for {citizen_username} for rescheduling path logic.{LogColors.ENDC}")

        # Get Transport API URL
        current_api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000") # Re-fetch or ensure it's passed
        transport_api_url = os.getenv("TRANSPORT_API_URL", f"{current_api_base_url}/api/transport")

        updates_to_make: List[Tuple[str, Dict[str, str]]] = []

        for endeavor_idx, endeavor in enumerate(endeavors):
            if not endeavor: continue
            endeavor.sort(key=lambda x: x['fields']['_StartDateDt']) # Sort activities within endeavor by original start

            log.info(f"Citizen {citizen_username}: Rescheduling endeavor {endeavor_idx + 1}/{len(endeavors)} (Priority: {endeavor[0]['fields'].get('Priority', 'N/A')}, {len(endeavor)} activities).")

            # The first activity of this endeavor starts at global_next_available_time_utc
            endeavor_current_processing_time_utc = global_next_available_time_utc

            for activity_idx, activity in enumerate(endeavor):
                original_start_dt = activity['fields']['_StartDateDt']
                original_end_dt = activity['fields']['_EndDateDt']
                original_duration = original_end_dt - original_start_dt
            
                new_start_dt = endeavor_current_processing_time_utc
                new_path_json = activity['fields'].get('Path') # Default to original path
                current_duration_seconds = original_duration.total_seconds()
            
                activity_type = activity['fields'].get('Type')
                to_building_id = activity['fields'].get('ToBuilding')
                # from_building_id = activity['fields'].get('FromBuilding') # Not strictly needed for this re-path logic if we always start from previous end

                # This will be the location where the current activity ends.
                # Initialize with previous end location; update if this activity moves the citizen.
                current_activity_actual_end_location_coords = endeavor_previous_activity_end_location_coords

                if to_building_id and endeavor_previous_activity_end_location_coords:
                    log.debug(f"  Activity {activity['id']} ({activity_type}) has ToBuilding: {to_building_id}. Current location: {endeavor_previous_activity_end_location_coords}")
                    target_building_record = get_building_record(tables, to_building_id)
                    if target_building_record:
                        target_building_coords = _get_building_position_coords(target_building_record)
                        if target_building_coords:
                            # Check if already at the target (or very close)
                            distance_to_target = calculate_haversine_distance_meters(
                                endeavor_previous_activity_end_location_coords['lat'], endeavor_previous_activity_end_location_coords['lng'],
                                target_building_coords['lat'], target_building_coords['lng']
                            )
                            if distance_to_target > 1.0: # If more than 1m away, consider re-pathing
                                log.info(f"  Citizen {citizen_username}: Re-pathing for activity {activity['id']} ({activity_type}) from {endeavor_previous_activity_end_location_coords} to {to_building_id} ({target_building_coords}).")
                                if not dry_run:
                                    path_data = get_path_between_points(endeavor_previous_activity_end_location_coords, target_building_coords, transport_api_url)
                                    if path_data and path_data.get('success'):
                                        new_path_json = json.dumps(path_data.get('path', []))
                                        new_duration_val = path_data.get('timing', {}).get('durationSeconds')
                                        if new_duration_val is not None:
                                            current_duration_seconds = float(new_duration_val)
                                        current_activity_actual_end_location_coords = target_building_coords
                                        log.info(f"    New path found. New duration: {current_duration_seconds:.0f}s.")
                                    else:
                                        log.warning(f"    Pathfinding failed for activity {activity['id']}. Using original path/duration. Activity might be impossible.")
                                        # current_activity_actual_end_location_coords remains endeavor_previous_activity_end_location_coords
                                else: # dry_run
                                    log.info(f"    [DRY RUN] Would re-path for activity {activity['id']}. Assuming original duration for now.")
                                    current_activity_actual_end_location_coords = target_building_coords # Assume travel occurs for dry run planning
                            else: # Already at or very near the target building
                                log.info(f"  Citizen {citizen_username}: Already at/near target {to_building_id} for activity {activity['id']}. No travel path needed. Duration will be original non-travel part.")
                                # If it's a travel-like activity but already at destination, duration should be minimal or based on non-travel part.
                                # For simplicity, if it's a 'goto_...' type and already there, its duration might become very short.
                                # This needs careful handling based on activity type. For now, use original duration.
                                # If original duration included travel, this might be too long.
                                # A better approach: if type is 'goto_X' and already there, set duration to e.g. 1 minute.
                                if activity_type and activity_type.startswith("goto_"):
                                    current_duration_seconds = 60 # 1 minute if already at destination for a goto activity
                                current_activity_actual_end_location_coords = target_building_coords
                        else:
                            log.warning(f"  Target building {to_building_id} for activity {activity['id']} has no coordinates. Using original path/duration.")
                    else:
                        log.warning(f"  Target building {to_building_id} for activity {activity['id']} not found. Using original path/duration.")
                elif to_building_id and not endeavor_previous_activity_end_location_coords:
                    log.warning(f"  Activity {activity['id']} has ToBuilding {to_building_id}, but previous end location is unknown. Cannot re-path. Using original path/duration.")


                new_end_dt = new_start_dt + timedelta(seconds=current_duration_seconds)

                # Write microsecond-free datetimes: a rescheduled StartDate carrying
                # microseconds lands 0.x s AFTER the second-truncated cutoff used by
                # mark_started_activities_as_in_progress, so the activity is never
                # promoted and gets rescheduled forever (the eternal-freeze loop).
                new_start_dt = new_start_dt.replace(microsecond=0)
                new_end_dt = new_end_dt.replace(microsecond=0)

                fields_to_update_for_activity = {'StartDate': new_start_dt.isoformat(), 'EndDate': new_end_dt.isoformat()}
                if new_path_json != activity['fields'].get('Path'): # Only update path if it changed
                    fields_to_update_for_activity['Path'] = new_path_json
            
                updates_to_make.append((activity['id'], fields_to_update_for_activity))
                log.info(f"  Activity {activity['id']} ({activity_type}) for {citizen_username} rescheduled: Start: {new_start_dt.isoformat()}, End: {new_end_dt.isoformat()}. Path changed: {new_path_json != activity['fields'].get('Path')}")
            
                endeavor_current_processing_time_utc = new_end_dt # Next activity in this endeavor starts when this one ends
                endeavor_previous_activity_end_location_coords = current_activity_actual_end_location_coords # Update for next iteration in this endeavor

            # After processing all activities in an endeavor, update the global start time for the NEXT endeavor
            global_next_available_time_utc = endeavor_current_processing_time_utc

        if updates_to_make:
            log.info(f"Citizen {citizen_username}: Applying {len(updates_to_make)} rescheduling updates.")
            if not dry_run:
                try:
                    # Airtable batch update can take a list of dicts: [{'id': record_id, 'fields': fields_to_update}, ...]
                    batch_payload = [{'id': rec_id, 'fields': flds} for rec_id, flds in updates_to_make]
                    tables['activities'].batch_update(batch_payload)
                    log.info(f"{LogColors.OKGREEN}Successfully applied {len(updates_to_make)} rescheduling updates for citizen {citizen_username}.{LogColors.ENDC}")
                except Exception as e_batch_update:
                    log.error(f"{LogColors.FAIL}Error batch updating rescheduled activities for citizen {citizen_username}: {e_batch_update}{LogColors.ENDC}")
            else: # dry_run
                for rec_id_dry, flds_to_update_dry in updates_to_make:
                    original_activity_for_log = next((act for act in created_activities if act['id'] == rec_id_dry), None)
                    original_start_date_log = original_activity_for_log['fields']['_StartDateDt'].isoformat() if original_activity_for_log and '_StartDateDt' in original_activity_for_log['fields'] else "N/A"
                    log.info(f"[DRY RUN] Citizen {citizen_username}: Activity {rec_id_dry} (Original Start: {original_start_date_log}) would be updated to StartDate: {flds_to_update_dry['StartDate']}, EndDate: {flds_to_update_dry['EndDate']}.")
        else:
            log.info(f"Citizen {citizen_username}: No rescheduling updates needed after evaluation.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process concluded activities in La Serenissima.")
    parser.add_argument(
        "--model",
        type=str,
        help="KinOS model to use for AI responses in specific processors like reply_to_message."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable.",
    )
    parser.add_argument(
        "--citizen",
        type=str,
        help="Process activities for a specific citizen by username.",
    )
    parser.add_argument(
        "--hour",
        type=int,
        choices=range(24),
        metavar="[0-23]",
        help="Force the script to operate as if it's this hour in Venice time (0-23). Date and minutes/seconds remain current. This will be converted to UTC internally."
    )
    parser.add_argument(
        "--activityId",
        type=str,
        help="Process a specific activity by its custom activityId, bypassing normal selection criteria."
    )
    args = parser.parse_args()

    main(args.dry_run, args.citizen, forced_venice_hour_override=args.hour, specific_activity_id=args.activityId)
