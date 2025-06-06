#!/usr/bin/env python3
"""
Clean Old Table Records script for La Serenissima.

This script removes old records from specified Airtable tables:
- ACTIVITIES: records older than 4 days.
- NOTIFICATIONS: records older than 2 weeks (14 days).
- RELEVANCIES: records older than 1 week (7 days).
- PROBLEMS: records older than 2 weeks (14 days).

The script uses the 'CreatedAt' field for determining the age of records.
"""

import os
import sys
import logging
import argparse
import requests # Added import for requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from pyairtable import Api, Table
from dotenv import load_dotenv

# --- Configuration ---

from backend.engine.utils.activity_helpers import _escape_airtable_value, LogColors, log_header # Import LogColors and log_header

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("cleanTables")

load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

AIRTABLE_API_KEY = os.environ.get('AIRTABLE_API_KEY')
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID')

# Table names
ACTIVITIES_TABLE_NAME = 'ACTIVITIES'
NOTIFICATIONS_TABLE_NAME = 'NOTIFICATIONS'
RELEVANCIES_TABLE_NAME = 'RELEVANCIES'
PROBLEMS_TABLE_NAME = 'PROBLEMS'
CONTRACTS_TABLE_NAME = 'CONTRACTS' # Added
BUILDINGS_TABLE_NAME = 'BUILDINGS' # Added
RESOURCES_TABLE_NAME = 'RESOURCES' # Added

from backend.engine.utils.activity_helpers import LogColors

TABLE_CONFIGS = {
    ACTIVITIES_TABLE_NAME: {"time_value_to_keep": 4, "time_unit_to_keep": "days", "field_to_check": "CreatedAt"},
    NOTIFICATIONS_TABLE_NAME: {"time_value_to_keep": 14, "time_unit_to_keep": "days", "field_to_check": "CreatedAt"},
    RELEVANCIES_TABLE_NAME: {"time_value_to_keep": 7, "time_unit_to_keep": "days", "field_to_check": "CreatedAt"},
    PROBLEMS_TABLE_NAME: {"time_value_to_keep": 14, "time_unit_to_keep": "days", "field_to_check": "CreatedAt"},
    CONTRACTS_TABLE_NAME: {"time_value_to_keep": 24, "time_unit_to_keep": "hours", "field_to_check": "EndAt"},
}

# --- Helper Functions ---

def initialize_airtable_tables() -> Optional[Dict[str, Table]]:
    # Strip potential whitespace from module-level constants
    api_key_cleaned = AIRTABLE_API_KEY.strip() if AIRTABLE_API_KEY else None
    base_id_cleaned = AIRTABLE_BASE_ID.strip() if AIRTABLE_BASE_ID else None

    if not api_key_cleaned or not base_id_cleaned:
        log.error(f"{LogColors.FAIL}Airtable API Key or Base ID not configured (or empty after strip).{LogColors.ENDC}")
        return None
    try:
        tables_to_init = list(TABLE_CONFIGS.keys())
        # Ensure BUILDINGS, RESOURCES, and CITIZENS tables are initialized
        if BUILDINGS_TABLE_NAME not in tables_to_init:
            tables_to_init.append(BUILDINGS_TABLE_NAME)
        if RESOURCES_TABLE_NAME not in tables_to_init:
            tables_to_init.append(RESOURCES_TABLE_NAME)
        # Add CITIZENS table for updating InVenice status
        CITIZENS_TABLE_NAME = 'CITIZENS' # Define if not already globally defined
        if CITIZENS_TABLE_NAME not in tables_to_init:
            tables_to_init.append(CITIZENS_TABLE_NAME)

        # custom_session = requests.Session() # Removed custom session
        # custom_session.trust_env = False    # Removed custom session configuration
        
        api = Api(api_key_cleaned) # Instantiate Api with cleaned key, let it manage its own session
        # api.session = custom_session # Removed custom session assignment

        tables = {}
        for table_name in tables_to_init:
            tables[table_name] = api.table(base_id_cleaned, table_name) # Use cleaned base_id
        
        # Test connection with one table (can be any initialized table)
        test_table_name = tables_to_init[0]
        log.info(f"{LogColors.OKBLUE}Testing Airtable connection by fetching one record from {test_table_name} table...{LogColors.ENDC}")
        try:
            tables[test_table_name].all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection successful for {test_table_name}.{LogColors.ENDC}")
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed for {test_table_name} table: {conn_e}{LogColors.ENDC}")
            raise conn_e # Re-raise to be caught by the outer try-except
        
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable tables: {e}{LogColors.ENDC}")
        return None

# LogColors is now imported from activity_helpers

def delete_old_records(
    table_object: Table,
    table_name: str,
    time_value_to_keep: int,
    time_unit_to_keep: str, # "days" or "hours"
    date_field: str,
    dry_run: bool
) -> int:
    """Deletes records from the given table older than `time_value_to_keep` `time_unit_to_keep`."""
    log.info(f"{LogColors.HEADER}--- Cleaning table: {table_name} (keeping last {time_value_to_keep} {time_unit_to_keep}) ---{LogColors.ENDC}")
    
    # Airtable's NOW() is UTC. Date fields are also typically UTC.
    # We want to delete records where DateField < (NOW() - time_value_to_keep time_unit_to_keep)
    # Formula: IS_BEFORE({DateField}, DATEADD(NOW(), -{time_value_to_keep}, '{time_unit_to_keep}'))
    formula = f"IS_BEFORE({{{date_field}}}, DATEADD(NOW(), -{time_value_to_keep}, '{time_unit_to_keep}'))"
    
    log.info(f"Using formula: {formula}")
    
    records_to_delete_ids = []
    try:
        old_records = table_object.all(formula=formula) # Fetch all fields, will include 'id'
        
        if not old_records:
            log.info(f"No records older than {time_value_to_keep} {time_unit_to_keep} found in {table_name}.")
            return 0
            
        records_to_delete_ids = [record['id'] for record in old_records]
        count = len(records_to_delete_ids)
        log.info(f"Found {count} records to delete from {table_name}.")

        if dry_run:
            log.info(f"{LogColors.OKCYAN}[DRY RUN] Would delete {count} records from {table_name}.{LogColors.ENDC}")
            return count
        
        if records_to_delete_ids:
            # Airtable's batch_delete can handle up to 10 records per request.
            # The pyairtable library handles batching internally.
            table_object.batch_delete(records_to_delete_ids)
            log.info(f"{LogColors.OKGREEN}Successfully deleted {count} records from {table_name}.{LogColors.ENDC}")
            return count
        
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing table {table_name}: {e}{LogColors.ENDC}")
        # Log which records failed if possible, though batch_delete might not give per-record status easily
        if records_to_delete_ids:
            log.error(f"Failed during deletion of {len(records_to_delete_ids)} records. Some might have been deleted.")
    
    return 0 # Should ideally return number actually deleted if error occurs mid-batch

def clean_merchant_galleys(
    tables: Dict[str, Table], # Add tables dictionary as an argument
    buildings_table: Table,
    resources_table: Table,
    dry_run: bool
) -> int:
    """Deletes orphaned or stuck merchant galleys."""
    log.info(f"{LogColors.HEADER}--- Cleaning Merchant Galleys ---{LogColors.ENDC}")
    galleys_deleted_count = 0
    galleys_checked_count = 0
    galleys_skipped_recent_arrival = 0
    galleys_skipped_due_to_recent_arrival_time = 0 # Renamed for clarity
    # galleys_skipped_has_resources is no longer relevant for the 12-hour rule
    galleys_skipped_no_construction_date_for_stuck_check = 0 # Renamed for clarity
    galleys_skipped_no_arrival_timestamp_for_overstay_check = 0 # Renamed for clarity
    galleys_owner_updated_count = 0
    galleys_resources_deleted_count = 0
    
    try:
        # Ensure CITIZENS table is available
        citizens_table = tables.get('CITIZENS')
        if not citizens_table and not dry_run:
            log.error(f"{LogColors.FAIL}CITIZENS table not initialized. Cannot update owner InVenice status.{LogColors.ENDC}")
            # Depending on strictness, might want to return or raise error.
            # For now, will proceed but log errors if owner update fails.

        all_galleys = buildings_table.all(formula="{Type}='merchant_galley'")
        log.info(f"Found {len(all_galleys)} merchant_galley records to check.")
        
        galleys_to_delete_ids = []
        from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
        now_venice = datetime.now(VENICE_TIMEZONE) # Use VENICE_TIMEZONE for local calculations if needed
        now_utc = now_venice.astimezone(timezone.utc) # Convert to UTC for comparison with Airtable
        
        # Time thresholds
        stuck_threshold_utc = now_utc - timedelta(days=2) # For galleys not yet arrived
        overstay_threshold_utc = now_utc - timedelta(hours=12) # For galleys that have arrived

        for galley in all_galleys:
            galleys_checked_count += 1
            galley_id_airtable = galley['id']
            galley_fields = galley['fields']
            galley_building_id_custom = galley_fields.get('BuildingId', galley_id_airtable)
            is_constructed = galley_fields.get('IsConstructed', False)
            construction_date_str = galley_fields.get('ConstructionDate') # Expected arrival or actual arrival time
            updated_at_str = galley_fields.get('UpdatedAt') # Airtable's own field

            # Condition 1: Stuck before arrival (remains same, uses 2-day threshold)
            if not is_constructed:
                if construction_date_str:
                    try:
                        arrival_date_utc = datetime.fromisoformat(construction_date_str.replace('Z', '+00:00')).astimezone(timezone.utc)
                        if arrival_date_utc < stuck_threshold_utc:
                            log.info(f"  [MARK DELETE - STUCK] Galley {galley_building_id_custom} (ID: {galley_id_airtable}) is stuck (not constructed, arrival {arrival_date_utc.isoformat()} > 2 days ago).")
                            galleys_to_delete_ids.append(galley_id_airtable)
                            continue 
                        else:
                            log.debug(f"  [SKIP STUCK] Galley {galley_building_id_custom} not stuck (arrival date {arrival_date_utc.isoformat()} is recent).")
                            galleys_skipped_recent_arrival += 1
                    except ValueError:
                        log.warning(f"  [SKIP STUCK] Could not parse ConstructionDate '{construction_date_str}' for galley {galley_building_id_custom}. Skipping stuck check.")
                else:
                    log.debug(f"  [SKIP STUCK] Galley {galley_building_id_custom} not constructed but has no ConstructionDate. Skipping stuck check.")
                    galleys_skipped_no_construction_date_for_stuck_check += 1
            
            # Condition 2: Arrived and overstaying (12-hour rule based on arrival time)
            # This condition applies only if the galley is constructed and not already marked for deletion by Condition 1.
            if galley_id_airtable not in galleys_to_delete_ids and is_constructed:
                # For the overstay rule, we rely on ConstructionDate, which should be set when IsConstructed becomes true.
                # This date represents the galley's arrival time.
                timestamp_to_check_str = construction_date_str # Use ConstructionDate (arrival time)
                timestamp_field_name_for_log = "ConstructionDate (arrival time)"
                
                if timestamp_to_check_str:
                    try:
                        arrival_time_utc = datetime.fromisoformat(timestamp_to_check_str.replace('Z', '+00:00')).astimezone(timezone.utc)
                        if arrival_time_utc < overstay_threshold_utc: # If arrival time is older than 12 hours ago
                            log.info(f"  [MARK DELETE - OVERSTAY] Galley {galley_building_id_custom} (ID: {galley_id_airtable}) overstaying (constructed, {timestamp_field_name_for_log} {arrival_time_utc.isoformat()} > 12 hours ago).")
                            
                            # Perform pre-deletion steps
                            galley_owner_username = galley_fields.get('Owner')
                            if galley_owner_username and citizens_table:
                                if not dry_run:
                                    try:
                                        owner_records = citizens_table.all(formula=f"{{Username}}='{_escape_airtable_value(galley_owner_username)}'", max_records=1)
                                        if owner_records:
                                            citizens_table.update(owner_records[0]['id'], {"InVenice": False})
                                            log.info(f"    Set InVenice=False for owner {galley_owner_username}.")
                                            galleys_owner_updated_count += 1
                                        else:
                                            log.warning(f"    Owner {galley_owner_username} not found. Cannot update InVenice status.")
                                    except Exception as e_owner_update:
                                        log.error(f"    Error updating InVenice for owner {galley_owner_username}: {e_owner_update}")
                                else: # dry_run
                                    log.info(f"    [DRY RUN] Would set InVenice=False for owner {galley_owner_username}.")
                                    galleys_owner_updated_count += 1
                            elif not citizens_table and not dry_run:
                                log.warning(f"    CITIZENS table not available, cannot update InVenice for owner {galley_owner_username}.")
                            
                            # Delete resources in the galley
                            resources_in_galley_formula = f"AND({{Asset}}='{_escape_airtable_value(galley_building_id_custom)}', {{AssetType}}='building')"
                            try:
                                resources_to_delete = resources_table.all(formula=resources_in_galley_formula)
                                if resources_to_delete:
                                    resource_ids_to_delete = [r['id'] for r in resources_to_delete]
                                    if not dry_run:
                                        resources_table.batch_delete(resource_ids_to_delete)
                                        log.info(f"    Deleted {len(resource_ids_to_delete)} resource stacks from galley {galley_building_id_custom}.")
                                    else:
                                        log.info(f"    [DRY RUN] Would delete {len(resource_ids_to_delete)} resource stacks from galley {galley_building_id_custom}.")
                                    galleys_resources_deleted_count += len(resource_ids_to_delete)
                                else:
                                    log.info(f"    No resources found in galley {galley_building_id_custom} to delete.")
                            except Exception as e_res_delete:
                                log.error(f"    Error deleting resources from galley {galley_building_id_custom}: {e_res_delete}")

                            galleys_to_delete_ids.append(galley_id_airtable)
                            continue # Move to next galley
                        else: # Not overstaying based on ConstructionDate (arrival time)
                            log.debug(f"  [SKIP OVERSTAY] Galley {galley_building_id_custom} not overstaying (arrived recently: {timestamp_field_name_for_log} {arrival_time_utc.isoformat()}).")
                            galleys_skipped_due_to_recent_arrival_time += 1
                    except ValueError:
                        log.warning(f"  [SKIP OVERSTAY] Could not parse {timestamp_field_name_for_log} '{timestamp_to_check_str}' for galley {galley_building_id_custom}. Skipping overstay check.")
                else: # No ConstructionDate to check against for an already constructed galley
                    log.info(f"  [MARK DELETE - MISSING ARRIVAL TIMESTAMP] Galley {galley_building_id_custom} (ID: {galley_id_airtable}) is constructed but has no {timestamp_field_name_for_log}. Marking for deletion.")
                    
                    # Perform pre-deletion steps (similar to OVERSTAY logic)
                    galley_owner_username = galley_fields.get('Owner')
                    if galley_owner_username and citizens_table:
                        if not dry_run:
                            try:
                                owner_records = citizens_table.all(formula=f"{{Username}}='{_escape_airtable_value(galley_owner_username)}'", max_records=1)
                                if owner_records:
                                    citizens_table.update(owner_records[0]['id'], {"InVenice": False})
                                    log.info(f"    Set InVenice=False for owner {galley_owner_username}.")
                                    galleys_owner_updated_count += 1
                                else:
                                    log.warning(f"    Owner {galley_owner_username} not found. Cannot update InVenice status.")
                            except Exception as e_owner_update:
                                log.error(f"    Error updating InVenice for owner {galley_owner_username}: {e_owner_update}")
                        else: # dry_run
                            log.info(f"    [DRY RUN] Would set InVenice=False for owner {galley_owner_username}.")
                            galleys_owner_updated_count += 1
                    elif not citizens_table and not dry_run:
                        log.warning(f"    CITIZENS table not available, cannot update InVenice for owner {galley_owner_username}.")
                    
                    # Delete resources in the galley
                    resources_in_galley_formula = f"AND({{Asset}}='{_escape_airtable_value(galley_building_id_custom)}', {{AssetType}}='building')"
                    try:
                        resources_to_delete = resources_table.all(formula=resources_in_galley_formula)
                        if resources_to_delete:
                            resource_ids_to_delete = [r['id'] for r in resources_to_delete]
                            if not dry_run:
                                resources_table.batch_delete(resource_ids_to_delete)
                                log.info(f"    Deleted {len(resource_ids_to_delete)} resource stacks from galley {galley_building_id_custom}.")
                            else:
                                log.info(f"    [DRY RUN] Would delete {len(resource_ids_to_delete)} resource stacks from galley {galley_building_id_custom}.")
                            galleys_resources_deleted_count += len(resource_ids_to_delete)
                        else:
                            log.info(f"    No resources found in galley {galley_building_id_custom} to delete.")
                    except Exception as e_res_delete:
                        log.error(f"    Error deleting resources from galley {galley_building_id_custom}: {e_res_delete}")

                    galleys_to_delete_ids.append(galley_id_airtable)
                    # galleys_skipped_no_arrival_timestamp_for_overstay_check is no longer incremented here
        
        if galleys_to_delete_ids:
            unique_galleys_to_delete_ids = list(set(galleys_to_delete_ids)) # Ensure uniqueness
            count = len(unique_galleys_to_delete_ids)
            log.info(f"Identified {count} unique merchant galleys for deletion based on criteria.")
            if dry_run:
                log.info(f"{LogColors.OKCYAN}[DRY RUN] Would delete {count} merchant galleys.{LogColors.ENDC}")
                for gid in unique_galleys_to_delete_ids: log.info(f"  [DRY RUN] - Galley Airtable ID: {gid}")
                # Return value for dry_run should reflect galleys that *would* be deleted
                return count 
            
            buildings_table.batch_delete(unique_galleys_to_delete_ids)
            log.info(f"{LogColors.OKGREEN}Successfully deleted {count} merchant galleys.{LogColors.ENDC}")
            return count # Return actual count of deleted galleys
        else:
            log.info(f"No merchant galleys met deletion criteria out of {galleys_checked_count} checked.")
            log.info(f"  Skipped (recent arrival/not stuck): {galleys_skipped_recent_arrival}")
            log.info(f"  Skipped (arrived recently/not overstaying): {galleys_skipped_due_to_recent_arrival_time}")
            log.info(f"  Skipped (no ConstructionDate for stuck check): {galleys_skipped_no_construction_date_for_stuck_check}")
            log.info(f"  Skipped (no arrival timestamp for overstay check): {galleys_skipped_no_arrival_timestamp_for_overstay_check}")
            log.info(f"  Owners updated to InVenice=False: {galleys_owner_updated_count}")
            log.info(f"  Resource stacks deleted from galleys: {galleys_resources_deleted_count}")
            return 0

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing merchant galleys: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return 0


# --- Main Execution ---
def main(dry_run: bool):
    log_header(f"Table Cleaning Script (dry_run={dry_run})", LogColors.HEADER)

    tables = initialize_airtable_tables()
    if not tables:
        return

    total_deleted_count = 0
    # Process date-based deletions first
    for table_name, config in TABLE_CONFIGS.items():
        if table_name in tables: # Check if table was initialized
            if table_name not in [BUILDINGS_TABLE_NAME, RESOURCES_TABLE_NAME]: # Don't run generic date deletion on these
                deleted_in_table = delete_old_records(
                    tables[table_name],
                    table_name,
                    config["time_value_to_keep"],
                    config["time_unit_to_keep"],
                    config["field_to_check"],
                    dry_run
                )
                total_deleted_count += deleted_in_table
        else:
            log.warning(f"{LogColors.WARNING}Table {table_name} (from TABLE_CONFIGS) not initialized. Skipping date-based cleanup for it.{LogColors.ENDC}")
            
    # Process merchant galley cleanup
    galleys_deleted_or_would_be_deleted = 0
    if BUILDINGS_TABLE_NAME in tables and RESOURCES_TABLE_NAME in tables and 'CITIZENS' in tables:
        galleys_deleted_or_would_be_deleted = clean_merchant_galleys(
            tables, # Pass the full tables dictionary
            tables[BUILDINGS_TABLE_NAME],
            tables[RESOURCES_TABLE_NAME],
            dry_run
        )
        # The clean_merchant_galleys function now logs its own summary details.
        log.info(f"{LogColors.OKCYAN}Merchant galleys {'would be ' if dry_run else ''}deleted in this run: {galleys_deleted_or_would_be_deleted}.{LogColors.ENDC}")
    else:
        log.warning(f"{LogColors.WARNING}Buildings or Resources table not initialized. Skipping merchant galley cleanup.{LogColors.ENDC}")

    summary_color = LogColors.OKGREEN if (total_deleted_count > 0 or galleys_deleted_or_would_be_deleted > 0) else LogColors.OKBLUE
    log.info(f"{summary_color}Table Cleaning script finished.{LogColors.ENDC}")
    log.info(f"  Date-based records {'would be ' if dry_run else ''}deleted: {total_deleted_count}.")
    log.info(f"  Merchant galleys {'would be ' if dry_run else ''}deleted: {galleys_deleted_or_would_be_deleted}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean old records from specified Airtable tables.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable."
    )
    args = parser.parse_args()

    main(args.dry_run)
