#!/usr/bin/env python3
import os
import sys
# Add the project root to sys.path to allow imports from backend.engine
# os.path.dirname(__file__) -> backend/engine
# os.path.join(..., '..') -> backend/engine/.. -> backend
# os.path.join(..., '..', '..') -> backend/engine/../../ -> serenissima (project root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

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
import requests # Already present, but good to confirm
import pytz
import uuid
import re # Added import for regular expressions
import random # Added for selecting random building point
from collections import defaultdict
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from urllib3.util.retry import Retry # Added import for Retry

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
    try_create_fetch_from_galley_activity # Import new creator
)
from dotenv import load_dotenv

# Import helpers from the new module
from backend.engine.utils.activity_helpers import (
    LogColors,
    _escape_airtable_value,
    _has_recent_failed_activity_for_contract,
    _get_building_position_coords,
    _calculate_distance_meters,
    is_nighttime as is_nighttime_helper,
    get_path_between_points,
    get_citizen_current_load,
    get_citizen_workplace,
    get_citizen_home,
    get_building_type_info,
    get_building_resources,
    can_produce_output,
    find_path_between_buildings,
    get_citizen_contracts,
    get_idle_citizens,
    _fetch_and_assign_random_starting_position,
    is_docks_open_time, # Import the new helper
    VENICE_TIMEZONE
)
# Import specific logic handlers
from backend.engine.logic.porter_activities import process_porter_activity # Already present
# Import galley activity processing functions
from backend.engine.logic.galley_activities import (
    process_final_deliveries_from_galley,
    process_galley_unloading_activities
)
# Import general citizen activity processing function
from backend.engine.logic.citizen_general_activities import process_citizen_activity # This import is fine

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("create_activities")

# Import helper functions from activity_helpers
from backend.engine.utils.activity_helpers import (
    get_resource_types_from_api as get_resource_definitions_from_api,
    get_building_types_from_api as get_building_type_definitions_from_api, # Added this import
    get_building_record # Import get_building_record from activity_helpers
)
# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

# Constants
TRANSPORT_API_URL = os.getenv("TRANSPORT_API_URL", "http://localhost:3000/api/transport")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000") # Define API_BASE_URL
# VENICE_TIMEZONE is imported from activity_helpers
# Other constants like NIGHT_START_HOUR etc. are managed in their respective logic files or helpers.

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')

    if api_key: api_key = api_key.strip()
    if base_id: base_id = base_id.strip()
    
    if not api_key or not base_id:
        log.error(f"{LogColors.FAIL}Missing Airtable credentials (or empty after strip). Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.{LogColors.ENDC}")
        sys.exit(1)
    
    try:
        # Create a requests session that doesn't trust environment proxy settings
        # custom_session = requests.Session() # Removed custom session creation
        # custom_session.trust_env = False    # Removed custom session configuration

        # Configure a custom retry strategy
        retry_strategy = Retry(
            total=5,  # Total number of retries
            backoff_factor=0.5,  # Base for exponential backoff (e.g., 0.5s, 1s, 2s, 4s)
            status_forcelist=[429, 500, 502, 503, 504],  # Status codes to retry on
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE", "POST"] # Ensure POST is retried
        )
        api = Api(api_key, retry_strategy=retry_strategy) # Instantiate Api with custom retry strategy
        # api.session = custom_session # Removed custom session assignment

        # Construct Table instances using api.table()
        return {
            'citizens': api.table(base_id, 'CITIZENS'),
            'buildings': api.table(base_id, 'BUILDINGS'),
            'activities': api.table(base_id, 'ACTIVITIES'),
            'contracts': api.table(base_id, 'CONTRACTS'),
            'resources': api.table(base_id, 'RESOURCES'),
            'relationships': api.table(base_id, 'RELATIONSHIPS') # Ajout de la table RELATIONSHIPS
        }
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        sys.exit(1)

# Removed local definitions of:
# get_citizen_contracts
# get_building_type_info
# get_building_resources
# can_produce_output
# find_path_between_buildings
# create_resource_fetching_activity (local version)
# create_production_activity (local version)
# get_idle_citizens (local version) - now imported from activity_helpers

# The comment block below is now outdated as the functions are imported from activity_creators
# or helpers.
# _escape_airtable_value, _has_recent_failed_activity_for_contract, 
# _get_building_position_coords, _calculate_distance_meters,
# get_citizen_current_load, get_closest_inn, get_citizen_workplace, get_citizen_home,
# get_building_type_info, get_building_resources, can_produce_output,
# find_path_between_buildings, get_citizen_contracts, get_idle_citizens,
# _fetch_and_assign_random_starting_position, is_nighttime_helper, is_shopping_time_helper,
# get_path_between_points_helper are now in activity_helpers.py

# Function process_citizen_activity has been moved to backend.engine.logic.citizen_general_activities

def create_activities(target_citizen_username: Optional[str] = None, forced_hour_override: Optional[int] = None):
    """Main function to create activities for idle citizens."""
    if target_citizen_username:
        log.info(f"{LogColors.HEADER}Starting activity creation process for citizen '{target_citizen_username}'{LogColors.ENDC}")
    else:
        log.info(f"{LogColors.HEADER}Starting activity creation process for all idle citizens{LogColors.ENDC}")
    
    tables = initialize_airtable()
    # VENICE_TIMEZONE is imported from activity_helpers
    now_venice_dt_real = datetime.datetime.now(VENICE_TIMEZONE)
    
    if forced_hour_override is not None:
        log.info(f"{LogColors.WARNING}Overriding current Venice hour to {forced_hour_override} due to --hour argument. Minutes/seconds will be from real time.{LogColors.ENDC}")
        now_venice_dt = now_venice_dt_real.replace(hour=forced_hour_override) # Keep real minutes/seconds
    else:
        now_venice_dt = now_venice_dt_real
        
    now_utc_dt = now_venice_dt.astimezone(pytz.UTC) # Define now_utc_dt based on (potentially overridden) now_venice_dt
    log.info(f"Effective Venice time for this run: {now_venice_dt.isoformat()}, UTC: {now_utc_dt.isoformat()}")

    # Fetch resource definitions once
    resource_defs = get_resource_definitions_from_api()
    if not resource_defs:
        log.error(f"{LogColors.FAIL}Failed to fetch resource definitions. Exiting activity creation.{LogColors.ENDC}")
        return
    
    # Fetch building type definitions once
    building_type_defs = get_building_type_definitions_from_api() # Add this line
    if not building_type_defs: # Add this check
        log.error(f"{LogColors.FAIL}Failed to fetch building type definitions. Exiting activity creation.{LogColors.ENDC}")
        return

    citizens_to_process_list = []
    if target_citizen_username:
        # Fetch the specific citizen
        formula = f"{{Username}} = '{_escape_airtable_value(target_citizen_username)}'"
        try:
            target_citizen_records = tables['citizens'].all(formula=formula, max_records=1)
            if not target_citizen_records:
                log.error(f"{LogColors.FAIL}Citizen '{target_citizen_username}' not found.{LogColors.ENDC}")
                return
            target_citizen_record = target_citizen_records[0]

            # Check if this citizen is idle
            # VENICE_TIMEZONE is imported
            # now_venice_for_target_check = datetime.datetime.now(VENICE_TIMEZONE) # NE PAS UTILISER L'HEURE REELLE ICI
            # now_iso_utc_for_target = now_venice_for_target_check.astimezone(pytz.UTC).isoformat()
            # now_iso_utc_for_target = now_utc_dt.isoformat() # <<<< UTILISER now_utc_dt (potentiellement forcé)
            # Stricter check: if citizen has ANY activity that is 'created' or 'in_progress', they are not idle.
            activity_formula = f"AND({{Citizen}}='{_escape_airtable_value(target_citizen_username)}', NOT(OR({{Status}} = 'processed', {{Status}} = 'failed')))"
            existing_activities = tables['activities'].all(formula=activity_formula, max_records=1)
            
            if existing_activities:
                log.info(f"{LogColors.OKBLUE}Citizen '{target_citizen_username}' already has a planned or ongoing activity. No new activity will be created by the general scheduler.{LogColors.ENDC}")
                return # Citizen is busy
            else:
                log.info(f"{LogColors.OKGREEN}Citizen '{target_citizen_username}' is idle (no 'created' or 'in_progress' activities). Proceeding to create activity.{LogColors.ENDC}")
                citizens_to_process_list = [target_citizen_record]
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error fetching or checking status for citizen '{target_citizen_username}': {e}{LogColors.ENDC}")
            return
    else:
        citizens_to_process_list = get_idle_citizens(tables, now_utc_dt) # <<<< Passer now_utc_dt ici
    
    if not citizens_to_process_list:
        log.info(f"{LogColors.OKBLUE}No idle citizens to process (checked with time {now_utc_dt.isoformat()}).{LogColors.ENDC}")
        return
    
    # Check if it's nighttime in Venice (for general logging, less critical for core logic now)
    # night_time = is_nighttime_helper(now_venice_dt) # This global night_time is less used by process_citizen_activity
    # log.info(f"{LogColors.OKBLUE}Current time in Venice: {'Night' if night_time else 'Day'}{LogColors.ENDC}") # Log based on general night
    log.info(f"{LogColors.OKBLUE}Determining citizen activities based on class-specific schedules.{LogColors.ENDC}")
    
    # Process each idle citizen
    success_count = 0
    
    # Start with the full list of citizens to process. This list will be modified by the processing functions.
    citizens_remaining_idle = list(citizens_to_process_list)
    
    # Process general activities for any citizens still idle
    citizens_processed_general_activity = set() # Keep track of citizens who got a general activity

    if citizens_remaining_idle:
        citizens_to_process_general = []
        if target_citizen_username:
            # Check if the target citizen is still in the list of idle citizens
            target_still_idle = any(c['fields'].get('Username') == target_citizen_username for c in citizens_remaining_idle)
            if target_still_idle:
                log.info(f"{LogColors.OKBLUE}Processing general activity for target citizen: {target_citizen_username}.{LogColors.ENDC}")
                citizens_to_process_general = [c for c in citizens_remaining_idle if c['fields'].get('Username') == target_citizen_username]
            else: 
                log.info(f"{LogColors.OKBLUE}Target citizen {target_citizen_username} is no longer idle. Skipping general activity processing for them.{LogColors.ENDC}")
        else: # General run (not targeted)
            log.info(f"{LogColors.OKBLUE}Processing general activities for {len(citizens_remaining_idle)} idle citizens.{LogColors.ENDC}")
            citizens_to_process_general = list(citizens_remaining_idle) 

        for citizen_record in citizens_to_process_general: 
            activity_created_for_this_citizen = False
            citizen_username_log = citizen_record['fields'].get('Username', citizen_record['id'])

            # General citizen activity processing (includes Porter logic if applicable)
            # Pass now_venice_dt and now_utc_dt. The is_night flag is no longer passed.
            activity_created_for_this_citizen = process_citizen_activity(
                tables, citizen_record, resource_defs, # Removed night_time
                building_type_defs,
                now_venice_dt, now_utc_dt, TRANSPORT_API_URL, API_BASE_URL
            )
            
            if activity_created_for_this_citizen:
                success_count += 1
                citizens_processed_general_activity.add(citizen_username_log)
                if citizen_record in citizens_remaining_idle: 
                    citizens_remaining_idle.remove(citizen_record)


    # Then, attempt galley-related activities for citizens who are STILL idle
    if citizens_remaining_idle:
        log.info(f"{LogColors.OKBLUE}Processing galley tasks for {len(citizens_remaining_idle)} citizens who did not receive a general activity.{LogColors.ENDC}")
        # Pass now_utc_dt to process_final_deliveries_from_galley
        final_delivery_activities_created = process_final_deliveries_from_galley(tables, citizens_remaining_idle, now_utc_dt, TRANSPORT_API_URL, resource_defs)
        success_count += final_delivery_activities_created
        
        if citizens_remaining_idle: # Re-check as citizens_remaining_idle is modified in-place
            if is_docks_open_time(now_venice_dt):
                log.info(f"{LogColors.OKBLUE}Docks are open. Attempting galley unloading tasks for {len(citizens_remaining_idle)} remaining citizens.{LogColors.ENDC}")
                # Pass now_utc_dt to process_galley_unloading_activities
                galley_fetch_activities_created = process_galley_unloading_activities(tables, citizens_remaining_idle, now_utc_dt, TRANSPORT_API_URL, resource_defs)
                success_count += galley_fetch_activities_created
            else:
                log.info(f"{LogColors.OKBLUE}Docks are closed. Skipping galley unloading tasks.{LogColors.ENDC}")
    else:
        log.info(f"{LogColors.OKBLUE}No citizens remaining idle after general activity processing for galley tasks.{LogColors.ENDC}")

    total_citizens_considered = len(citizens_to_process_list)
    summary_color = LogColors.OKGREEN if success_count >= total_citizens_considered and total_citizens_considered > 0 else LogColors.WARNING if success_count > 0 else LogColors.FAIL
    log.info(f"{summary_color}Activity creation process complete. Total activities created or simulated: {success_count} for {total_citizens_considered} citizen(s) considered.{LogColors.ENDC}")

# Functions process_final_deliveries_from_galley and process_galley_unloading_activities
# have been moved to backend/engine/logic/galley_activities.py

# _fetch_and_assign_random_starting_position is now imported from activity_helpers.py

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create activities for idle citizens.")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--citizen", type=str, help="Process activities for a specific citizen by username.")
    parser.add_argument(
        "--hour",
        type=int,
        choices=range(24),
        metavar="[0-23]",
        help="Force the script to operate as if it's this hour in Venice time (0-23). Date and minutes/seconds remain current."
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    create_activities(target_citizen_username=args.citizen, forced_hour_override=args.hour)
