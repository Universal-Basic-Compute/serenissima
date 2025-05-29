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
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any

# Add the project root to sys.path to allow imports from backend.engine
# Corrected sys.path manipulation:
# os.path.dirname(__file__) -> backend/engine
# os.path.join(..., '..') -> backend/engine/.. -> backend
# os.path.join(..., '..', '..') -> backend/engine/../../ -> serenissima (project root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

from pyairtable import Api, Table
from dotenv import load_dotenv

# Import shared utilities
from backend.engine.utils.activity_helpers import (
    get_building_record,
    get_citizen_record,
    get_contract_record,
    get_building_current_storage,
    _escape_airtable_value,
    calculate_haversine_distance_meters,
    LogColors, # Import LogColors
    VENICE_TIMEZONE # Import VENICE_TIMEZONE
)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_activities")

# Placeholder for activities that are processed by expiring or simple state change
def process_placeholder_activity_fn(tables, activity_record, building_type_defs, resource_defs):
    activity_guid = activity_record['fields'].get('ActivityId', activity_record['id'])
    activity_type = activity_record['fields'].get('Type')
    log.info(f"{LogColors.OKCYAN}Activity {activity_guid} (type: {activity_type}) processed by placeholder (e.g., expired or simple state change).{LogColors.ENDC}")
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
        process_fetch_from_galley as process_fetch_from_galley_fn,
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
        process_fishing_activity as process_fishing_activity_fn # Import new processor
)
# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

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
        # custom_session = requests.Session() # Removed custom session creation
        # custom_session.trust_env = False    # Removed custom session configuration

        api = Api(api_key) # Instantiate Api, let it create and manage its own session
        # api.session = custom_session # Removed custom session assignment

        # Construct Table instances using api.table()
        tables = {
            'activities': api.table(base_id, 'ACTIVITIES'),
            'resources': api.table(base_id, 'RESOURCES'),
            'citizens': api.table(base_id, 'CITIZENS'),
            'buildings': api.table(base_id, 'BUILDINGS'),
            'contracts': api.table(base_id, 'CONTRACTS'),
            'transactions': api.table(base_id, 'TRANSACTIONS'),
            'problems': api.table(base_id, 'PROBLEMS'),
            'relationships': api.table(base_id, 'RELATIONSHIPS') # Ajout de la table RELATIONSHIPS
        }

        # Test connection with one primary table (e.g., citizens)
        log.info(f"{LogColors.OKBLUE}Testing Airtable connection by fetching one record from CITIZENS table...{LogColors.ENDC}")
        try:
            # Ensure api_key is not None before attempting the call
            if not api_key:
                 raise ValueError("API key is None, cannot test connection.")
            tables['citizens'].all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection successful.{LogColors.ENDC}")
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed for CITIZENS table: {conn_e}{LogColors.ENDC}")
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
        
    now_iso_utc = now_utc_for_check.isoformat() # Convert to UTC string for Airtable
    
    base_formula = f"AND({{EndDate}} <= '{now_iso_utc}', NOT(OR({{Status}} = 'processed', {{Status}} = 'failed')))"
    
    if target_citizen_username:
        citizen_filter = f"{{Citizen}} = '{_escape_airtable_value(target_citizen_username)}'"
        formula = f"AND({base_formula}, {citizen_filter})"
        log.info(f"{LogColors.OKBLUE}Fetching concluded and unprocessed activities for citizen: {target_citizen_username}.{LogColors.ENDC}")
    else:
        formula = base_formula
        log.info(f"{LogColors.OKBLUE}Fetching all concluded and unprocessed activities.{LogColors.ENDC}")
        
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

    now_iso_utc_for_check = now_utc_for_check.isoformat()
    
    # Check for merchant galleys specifically, using ConstructionDate as the arrival time
    formula = f"AND({{Type}}='merchant_galley', {{IsConstructed}}=FALSE(), {{ConstructionDate}}<='{now_iso_utc_for_check}')"
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

def main(dry_run: bool = False, target_citizen_username: Optional[str] = None, forced_venice_hour_override: Optional[int] = None):
    if target_citizen_username:
        log.info(f"{LogColors.OKCYAN}Starting Process Activities script for citizen '{target_citizen_username}' (dry_run={dry_run})...{LogColors.ENDC}")
    else:
        log.info(f"{LogColors.OKCYAN}Starting Process Activities script for all citizens (dry_run={dry_run})...{LogColors.ENDC}")

    forced_utc_datetime_for_check: Optional[datetime] = None
    if forced_venice_hour_override is not None:
        current_time_real_venice = datetime.now(VENICE_TIMEZONE)
        # Apply the forced Venice hour, keeping real minutes/seconds
        effective_forced_venice_datetime = current_time_real_venice.replace(hour=forced_venice_hour_override)
        
        # Convert this effective Venice time to UTC
        forced_utc_datetime_for_check = effective_forced_venice_datetime.astimezone(timezone.utc)
        
        log.info(f"{LogColors.WARNING}Received forced Venice hour {forced_venice_hour_override}. Effective Venice time for check: {effective_forced_venice_datetime.isoformat()}. Corresponding UTC time for activity check: {forced_utc_datetime_for_check.isoformat()}.{LogColors.ENDC}")

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
        "fetch_from_galley": process_fetch_from_galley_fn,
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
        "idle": process_placeholder_activity_fn,
        "rest": process_placeholder_activity_fn,
    }

    tables = initialize_airtable()
    if not tables:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable. Exiting.{LogColors.ENDC}")
        return

    # Process building arrivals (e.g., galleys)
    # Pass the forced_utc_datetime_for_check to process_building_arrivals as well
    process_building_arrivals(tables, dry_run, forced_utc_datetime_override=forced_utc_datetime_for_check)

    # Fetch definitions once
    building_type_defs = get_building_type_definitions_from_api()
    resource_defs = get_resource_definitions_from_api()

    if not building_type_defs or not resource_defs:
        log.error(f"{LogColors.FAIL}Failed to fetch building or resource definitions. Exiting.{LogColors.ENDC}")
        return

    activities_to_process = get_concluded_unprocessed_activities(tables, target_citizen_username, forced_utc_datetime_for_check)
    if not activities_to_process:
        if target_citizen_username:
            log.info(f"{LogColors.OKBLUE}No concluded, unprocessed activities found for citizen '{target_citizen_username}'.{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKBLUE}No activities to process.{LogColors.ENDC}")
        return

    processed_count = 0
    failed_count = 0

    for activity_record in activities_to_process:
        activity_type = activity_record['fields'].get('Type')
        activity_id_airtable = activity_record['id']
        activity_guid = activity_record['fields'].get('ActivityId', activity_id_airtable)

        log.info(f"{LogColors.HEADER}--- Processing activity {activity_guid} of type {activity_type} ---{LogColors.ENDC}")
        
        success = False
        if dry_run:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Would process activity {activity_guid} of type {activity_type}.{LogColors.ENDC}")
            if activity_type in ACTIVITY_PROCESSORS:
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Processor for {activity_type} exists.{LogColors.ENDC}")
                success = True # Simulate success for dry run if processor exists
            else:
                log.warning(f"{LogColors.WARNING}[DRY RUN] No processor found for activity type: {activity_type} for activity {activity_guid}. Would mark as failed.{LogColors.ENDC}")
                success = False
        else:
            if activity_type in ACTIVITY_PROCESSORS:
                processor_func = ACTIVITY_PROCESSORS[activity_type]
                try:
                    success = processor_func(tables, activity_record, building_type_defs, resource_defs)
                except Exception as e_process:
                    log.error(f"{LogColors.FAIL}Error processing activity {activity_guid} of type {activity_type}: {e_process}{LogColors.ENDC}")
                    import traceback
                    log.error(traceback.format_exc())
                    success = False
            else:
                log.warning(f"{LogColors.WARNING}No processor found for activity type: {activity_type} for activity {activity_guid}. Marking as failed.{LogColors.ENDC}")
                success = False

        if success:
            update_activity_status(tables, activity_id_airtable, "processed")
            processed_count += 1
        else: # if not success
            update_activity_status(tables, activity_id_airtable, "failed")
            failed_count += 1
        
        # Gondola Fee Processing - Moved outside the if/else success block
        activity_path_json = activity_record['fields'].get('Path')
        citizen_username_for_fee = activity_record['fields'].get('Citizen')
        activity_custom_id_for_fee = activity_record['fields'].get('ActivityId', activity_id_airtable)
        transporter_username = activity_record['fields'].get('Transporter') # Get the transporter from activity

        if activity_path_json and citizen_username_for_fee and not dry_run:
            gondola_distance_km, gondola_fee = calculate_gondola_travel_details(activity_path_json)
            if gondola_fee > 0:
                traveler_citizen_record = get_citizen_record(tables, citizen_username_for_fee)
                
                fee_recipient_username = "ConsiglioDeiDieci" # Default recipient
                determined_recipient_from_transporter_field = False

                if transporter_username and transporter_username != "ConsiglioDeiDieci":
                    transporter_citizen_record_check = get_citizen_record(tables, transporter_username)
                    if transporter_citizen_record_check:
                        fee_recipient_username = transporter_username
                        determined_recipient_from_transporter_field = True
                        log.info(f"{LogColors.OKBLUE}Gondola fee for activity {activity_guid} initially assigned to Transporter field value (citizen): {transporter_username}{LogColors.ENDC}")
                    # else: Transporter field is not a known citizen, will try path or default to Consiglio

                if not determined_recipient_from_transporter_field:
                    # Try to find recipient from path if Transporter field didn't yield one (or was Consiglio/empty/invalid)
                    log.info(f"{LogColors.OKBLUE}Transporter field for activity {activity_guid} did not yield a specific recipient (value: {transporter_username}). Checking path for public_dock operator.{LogColors.ENDC}")
                    try:
                        path_points = json.loads(activity_path_json) if activity_path_json else []
                        for point in path_points:
                            if point.get("type") == "dock" and point.get("nodeId"):
                                dock_building_id = point.get("nodeId")
                                dock_record = get_building_record(tables, dock_building_id) # Fetches by BuildingId (custom ID)
                                if dock_record and dock_record['fields'].get('Type') == 'public_dock':
                                    run_by_user = dock_record['fields'].get('RunBy')
                                    if run_by_user and run_by_user != "ConsiglioDeiDieci": # Ensure RunBy is not Consiglio itself
                                        run_by_citizen_check = get_citizen_record(tables, run_by_user)
                                        if run_by_citizen_check:
                                            fee_recipient_username = run_by_user
                                            log.info(f"{LogColors.OKBLUE}Gondola fee for activity {activity_guid} reassigned to RunBy ({run_by_user}) of public_dock {dock_building_id} found in path.{LogColors.ENDC}")
                                            break # Found a valid recipient from path
                                        else:
                                            log.warning(f"{LogColors.WARNING}RunBy user {run_by_user} for public_dock {dock_building_id} (from path) not found. Checking next dock in path.{LogColors.ENDC}")
                                    # else: Dock has no RunBy or RunBy is Consiglio, check next dock
                                # else: Not a public_dock, or dock not found, check next point
                    except json.JSONDecodeError:
                        log.error(f"{LogColors.FAIL}Failed to parse activity path JSON for activity {activity_guid} while checking for dock operator: {activity_path_json}{LogColors.ENDC}")
                    
                    if fee_recipient_username == "ConsiglioDeiDieci" and transporter_username and transporter_username != "ConsiglioDeiDieci":
                        # This case means Transporter field had a value, it wasn't a valid citizen, and no path dock operator was found.
                        log.warning(f"{LogColors.WARNING}Transporter {transporter_username} in activity {activity_guid} was not a valid citizen, and no public_dock operator found in path. Fee defaults to ConsiglioDeiDieci.{LogColors.ENDC}")
                
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
                            "Buyer": citizen_username_for_fee,  # Payer of the fee
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
                        log.info(f"{LogColors.OKGREEN}Citizen {citizen_username_for_fee} paid {gondola_fee:.2f} Ducats gondola fee to {fee_recipient_username} for activity {activity_guid}. Distance: {gondola_distance_km:.2f} km.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}Citizen {citizen_username_for_fee} has insufficient Ducats ({traveler_ducats:.2f}) for gondola fee ({gondola_fee:.2f}) for activity {activity_guid}.{LogColors.ENDC}")
                        # Consider creating a problem or debt record here in the future
                else:
                    if not traveler_citizen_record: log.error(f"{LogColors.FAIL}Traveler citizen {citizen_username_for_fee} not found for gondola fee.{LogColors.ENDC}")
                    if not fee_recipient_record: log.error(f"{LogColors.FAIL}Fee recipient citizen {fee_recipient_username} not found for gondola fee.{LogColors.ENDC}")
        elif dry_run and activity_path_json and citizen_username_for_fee:
             gondola_distance_km, gondola_fee = calculate_gondola_travel_details(activity_path_json)
             if gondola_fee > 0:
                fee_recipient_username_dry_run = transporter_username if transporter_username and transporter_username != "ConsiglioDeiDieci" else "ConsiglioDeiDieci"
                # In a dry run, we can't confirm if transporter_username is a valid citizen, so we assume it would be if not Consiglio.
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Would process gondola fee of {gondola_fee:.2f} Ducats for citizen {citizen_username_for_fee} to {fee_recipient_username_dry_run} for activity {activity_guid} (Distance: {gondola_distance_km:.2f} km).{LogColors.ENDC}")

        # Update citizen's position and UpdatedAt if ToBuilding is present,
        # UNLESS the activity type handles its own position update (e.g., fetch_resource, fetch_from_galley, fishing)
        # or if the activity doesn't involve changing location (e.g. eat_from_inventory, eat_at_home, eat_at_tavern if already there)
        # This block is now outside the if/else success block.
        no_pos_update_types = [
            'fetch_resource', 'fetch_from_galley', 
            'eat_from_inventory', 'eat_at_home', 'eat_at_tavern', 
            'production', 'rest', 'idle',
            'fishing', 'emergency_fishing' # Fishing processor handles its own position update
        ]
        
        # Define VENICE_TIMEZONE for potential UpdatedAt override, though Airtable usually handles it.
        # from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # VENICE_TIMEZONE already imported above

        if activity_type not in no_pos_update_types:
            # ToBuilding field now stores the custom BuildingId
            to_building_custom_id = activity_record['fields'].get('ToBuilding') 
            citizen_username_for_pos = activity_record['fields'].get('Citizen')

            if to_building_custom_id and citizen_username_for_pos and not dry_run:
                try:
                    # Fetch building record using its custom BuildingId
                    building_record_for_pos = get_building_record(tables, to_building_custom_id)
                    citizen_record_for_pos = get_citizen_record(tables, citizen_username_for_pos)

                    if building_record_for_pos and citizen_record_for_pos:
                        building_position_str = building_record_for_pos['fields'].get('Position')
                        
                        # If Position field is empty, try to parse from BuildingId or Point
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
                            update_payload = {
                                'Position': building_position_str
                                # 'UpdatedAt' is automatically handled by Airtable on record update
                            }
                            tables['citizens'].update(citizen_record_for_pos['id'], update_payload)
                            log.info(f"{LogColors.OKGREEN}Updated citizen {citizen_username_for_pos} Position to {building_position_str} (Building Custom ID: {to_building_custom_id}).{LogColors.ENDC}")
                        else:
                            log.warning(f"{LogColors.WARNING}Building {to_building_custom_id} is missing a parsable Position, BuildingId, or Point. Cannot update citizen {citizen_username_for_pos} position.{LogColors.ENDC}")
                    else: 
                        if not building_record_for_pos:
                            log.warning(f"{LogColors.WARNING}Target building (Custom ID: {to_building_custom_id}) not found. Cannot update citizen {citizen_username_for_pos} position.{LogColors.ENDC}")
                        if not citizen_record_for_pos: 
                            log.warning(f"{LogColors.WARNING}Citizen {citizen_username_for_pos} not found. Cannot update citizen position.{LogColors.ENDC}")
                except Exception as e_update_pos:
                    log.error(f"{LogColors.FAIL}Error updating citizen {citizen_username_for_pos} position after activity {activity_guid}: {e_update_pos}{LogColors.ENDC}")
        elif dry_run and activity_type not in no_pos_update_types:
            to_building_custom_id_dry = activity_record['fields'].get('ToBuilding')
            citizen_username_dry = activity_record['fields'].get('Citizen')
            if to_building_custom_id_dry and citizen_username_dry:
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Would update citizen {citizen_username_dry} position based on ToBuilding (Custom ID: {to_building_custom_id_dry}).{LogColors.ENDC}")
        
        log.info(f"{LogColors.HEADER}--- Finished processing activity {activity_guid} ---{LogColors.ENDC}")

    summary_color = LogColors.OKGREEN if failed_count == 0 else LogColors.WARNING if processed_count > 0 else LogColors.FAIL
    log.info(f"{summary_color}Process Activities script finished. Processed: {processed_count}, Failed: {failed_count}.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process concluded activities in La Serenissima.")
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
    args = parser.parse_args()

    main(args.dry_run, args.citizen, forced_venice_hour_override=args.hour)
