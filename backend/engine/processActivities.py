#!/usr/bin/env python3
"""
Process Concluded Activities script for La Serenissima.

This script:
1. Fetches all activities that are concluded (EndDate is in the past) and not yet processed.
2. For "deliver_resource_batch" activities:
   - Transfers resources from the delivery citizen (owned by "Italia") to the target building.
   - Checks storage capacity of the target building.
   - Updates or creates resource records in the target building for its operator/owner.
   - Processes financial transactions based on the original contracts in the batch.
3. Updates the activity status to "processed" or "failed".
"""

import os
import sys
import json
import logging
import argparse
import requests
import uuid
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

# Add the parent directory to the path to allow imports from app and other engine scripts
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pyairtable import Api, Table
from dotenv import load_dotenv

# Attempt to import helper functions from other engine scripts
try:
    from backend.engine.createimportactivities import get_building_types as get_building_type_definitions_from_api
    from backend.engine.createimportactivities import get_resource_types as get_resource_definitions_from_api
except ImportError:
    # Fallback if the script is run in a context where backend.engine is not directly importable
    # This might happen if script is run directly from its own directory without backend being a package
    print("Warning: Could not import helper functions directly. Ensure PYTHONPATH is set correctly or run as part of the application.")
    # Define placeholder functions or exit if these are critical
    def get_building_type_definitions_from_api():
        raise NotImplementedError("get_building_type_definitions_from_api is not available")
    def get_resource_definitions_from_api():
        raise NotImplementedError("get_resource_definitions_from_api is not available")


# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("process_activities")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        return None
    
    try:
        api = Api(api_key)
        return {
            'activities': Table(api_key, base_id, 'ACTIVITIES'),
            'resources': Table(api_key, base_id, 'RESOURCES'),
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'contracts': Table(api_key, base_id, 'CONTRACTS'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'problems': Table(api_key, base_id, 'PROBLEMS') # For logging issues
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        return None

def _escape_airtable_value(value: str) -> str:
    """Escapes single quotes for Airtable formulas."""
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def get_concluded_unprocessed_activities(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch activities that have ended and are not yet processed."""
    now_iso = datetime.now(timezone.utc).isoformat()
    formula = f"AND({{EndDate}} <= '{now_iso}', OR({{Status}} = BLANK(), {{Status}} != 'processed', {{Status}} != 'failed'))"
    try:
        activities = tables['activities'].all(formula=formula)
        log.info(f"Found {len(activities)} concluded and unprocessed activities.")
        return activities
    except Exception as e:
        log.error(f"Error fetching concluded unprocessed activities: {e}")
        return []

def get_citizen_record(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    """Fetches a citizen record by username."""
    formula = f"{{Username}} = '{_escape_airtable_value(username)}'"
    try:
        records = tables['citizens'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching citizen record for {username}: {e}")
        return None

def get_building_record(tables: Dict[str, Table], building_id: str) -> Optional[Dict]:
    """Fetches a building record by BuildingId."""
    formula = f"{{BuildingId}} = '{_escape_airtable_value(building_id)}'"
    try:
        records = tables['buildings'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching building record for {building_id}: {e}")
        return None

def get_contract_record(tables: Dict[str, Table], contract_id: str) -> Optional[Dict]:
    """Fetches a contract record by ContractId."""
    formula = f"{{ContractId}} = '{_escape_airtable_value(contract_id)}'"
    try:
        records = tables['contracts'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching contract record for {contract_id}: {e}")
        return None

def get_building_current_storage(tables: Dict[str, Table], building_id: str) -> float:
    """Calculates the total count of resources currently in a building."""
    formula = f"AND({{BuildingId}} = '{_escape_airtable_value(building_id)}', {{AssetType}} = 'building')"
    total_stored_volume = 0
    try:
        resources_in_building = tables['resources'].all(formula=formula)
        for resource in resources_in_building:
            total_stored_volume += float(resource['fields'].get('Count', 0))
        log.info(f"Building {building_id} currently stores {total_stored_volume} units of resources.")
    except Exception as e:
        log.error(f"Error calculating current storage for building {building_id}: {e}")
    return total_stored_volume

def process_deliver_resource_batch(
    tables: Dict[str, Table], 
    activity_record: Dict, 
    building_type_defs: Dict, 
    resource_defs: Dict
) -> bool:
    """Processes a 'deliver_resource_batch' activity."""
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'deliver_resource_batch' activity: {activity_guid}")

    resources_to_deliver_json = activity_fields.get('Resources')
    to_building_id = activity_fields.get('ToBuilding')
    delivery_person_username = activity_fields.get('Citizen') # This is Username

    if not all([resources_to_deliver_json, to_building_id, delivery_person_username]):
        log.error(f"Activity {activity_guid} is missing crucial data (Resources, ToBuilding, or Citizen).")
        return False

    try:
        resources_to_deliver = json.loads(resources_to_deliver_json)
    except json.JSONDecodeError:
        log.error(f"Failed to parse Resources JSON for activity {activity_guid}: {resources_to_deliver_json}")
        return False

    # Get delivery person's CitizenId (used as AssetId for import-tracking resources)
    delivery_person_citizen_record = get_citizen_record(tables, delivery_person_username)
    if not delivery_person_citizen_record:
        log.error(f"Delivery person (citizen) {delivery_person_username} not found for activity {activity_guid}.")
        return False
    delivery_person_citizen_id = delivery_person_citizen_record['fields'].get('CitizenId')
    if not delivery_person_citizen_id:
        log.error(f"Delivery person {delivery_person_username} is missing CitizenId field.")
        return False

    # Get destination building details
    dest_building_record = get_building_record(tables, to_building_id)
    if not dest_building_record:
        log.error(f"Destination building {to_building_id} not found for activity {activity_guid}.")
        return False
    
    dest_building_type_str = dest_building_record['fields'].get('Type')
    dest_building_def = building_type_defs.get(dest_building_type_str, {})
    storage_capacity = dest_building_def.get('productionInformation', {}).get('storageCapacity', 0)
    
    current_stored_volume = get_building_current_storage(tables, to_building_id)
    total_amount_to_deposit = sum(item.get('Amount', 0) for item in resources_to_deliver)

    if current_stored_volume + total_amount_to_deposit > storage_capacity:
        log.warning(f"Not enough storage in building {to_building_id} for activity {activity_guid}. "
                    f"Capacity: {storage_capacity}, Used: {current_stored_volume}, To Deposit: {total_amount_to_deposit}")
        # Potentially log a PROBLEM record here
        return False # Mark as failed, needs manual check or logic for partial delivery

    # Resource Transfer Logic
    target_owner_username = dest_building_record['fields'].get('RunBy') or dest_building_record['fields'].get('Owner')
    if not target_owner_username:
        log.error(f"Could not determine target owner for resources in building {to_building_id}.")
        return False

    all_resources_transferred = True
    for item in resources_to_deliver:
        resource_type_id = item.get('ResourceId')
        amount = float(item.get('Amount', 0))
        if not resource_type_id or amount <= 0:
            log.warning(f"Invalid resource item in activity {activity_guid}: {item}")
            continue

        # 1. Decrement/delete "import-tracking" resource
        tracking_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                f"{{AssetId}}='{_escape_airtable_value(delivery_person_citizen_id)}', "
                                f"{{AssetType}}='citizen', {{Owner}}='Italia')")
        try:
            tracking_resources = tables['resources'].all(formula=tracking_res_formula, max_records=1)
            if tracking_resources:
                tracking_res_record = tracking_resources[0]
                current_tracking_count = float(tracking_res_record['fields'].get('Count', 0))
                if current_tracking_count > amount:
                    tables['resources'].update(tracking_res_record['id'], {'Count': current_tracking_count - amount})
                else:
                    tables['resources'].delete(tracking_res_record['id'])
                log.info(f"Adjusted import-tracking resource {resource_type_id} for delivery citizen {delivery_person_username}.")
            else:
                log.warning(f"Import-tracking resource {resource_type_id} not found for delivery citizen {delivery_person_citizen_id}. This might indicate a prior issue.")
                # Continue to deposit, assuming resource magically appeared for delivery.
        except Exception as e_track:
            log.error(f"Error adjusting import-tracking resource {resource_type_id} for {delivery_person_username}: {e_track}")
            all_resources_transferred = False; break


        # 2. Deposit into ToBuilding
        building_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                f"{{BuildingId}}='{_escape_airtable_value(to_building_id)}', "
                                f"{{Owner}}='{_escape_airtable_value(target_owner_username)}')")
        try:
            existing_building_resources = tables['resources'].all(formula=building_res_formula, max_records=1)
            now_iso = datetime.now(timezone.utc).isoformat()
            if existing_building_resources:
                bres_record = existing_building_resources[0]
                new_count = float(bres_record['fields'].get('Count', 0)) + amount
                tables['resources'].update(bres_record['id'], {'Count': new_count, 'UpdatedAt': now_iso})
                log.info(f"Updated resource {resource_type_id} count in building {to_building_id} for {target_owner_username} to {new_count}.")
            else:
                res_def = resource_defs.get(resource_type_id, {})
                building_pos_str = dest_building_record['fields'].get('Position', '{}')
                
                new_resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    "Category": res_def.get('category', 'Unknown'),
                    "BuildingId": to_building_id,
                    "AssetId": to_building_id,
                    "AssetType": "building",
                    "Owner": target_owner_username,
                    "Count": amount,
                    "Position": building_pos_str, # Store building's position JSON string
                    "CreatedAt": now_iso,
                    "UpdatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload)
                log.info(f"Created new resource {resource_type_id} in building {to_building_id} for {target_owner_username}.")
        except Exception as e_deposit:
            log.error(f"Error depositing resource {resource_type_id} into {to_building_id}: {e_deposit}")
            all_resources_transferred = False; break
            
    if not all_resources_transferred:
        log.error(f"Resource transfer failed for activity {activity_guid}. Financial transactions will be skipped.")
        return False

    # Financial Exchange Logic
    notes = activity_fields.get('Notes', '')
    contract_ids_match = re.search(r"Involves Contract IDs: ([\w\s,-]+)", notes)
    if not contract_ids_match:
        log.error(f"Could not parse original Contract IDs from notes for activity {activity_guid}: {notes}")
        return False # Critical failure if we can't determine payment details
    
    original_contract_ids_str = contract_ids_match.group(1)
    original_contract_ids = [cid.strip() for cid in original_contract_ids_str.split(',')]

    all_financials_processed = True
    for original_contract_id in original_contract_ids:
        contract_record = get_contract_record(tables, original_contract_id)
        if not contract_record:
            log.warning(f"Original contract {original_contract_id} not found for activity {activity_guid}. Skipping its financial part.")
            all_financials_processed = False
            continue

        contract_fields = contract_record['fields']
        buyer_username = contract_fields.get('Buyer')
        seller_username = contract_fields.get('Seller') # Should be "Italia"
        price_per_resource = float(contract_fields.get('PricePerResource', 0))
        # HourlyAmount in the original contract is the amount for that specific part of the batch
        amount_for_this_contract_part = float(contract_fields.get('HourlyAmount', 0)) 
        
        if not buyer_username or not seller_username or price_per_resource <= 0 or amount_for_this_contract_part <= 0:
            log.warning(f"Contract {original_contract_id} has invalid financial details. Skipping.")
            all_financials_processed = False
            continue

        total_cost = price_per_resource * amount_for_this_contract_part

        buyer_citizen_rec = get_citizen_record(tables, buyer_username)
        seller_citizen_rec = get_citizen_record(tables, seller_username)

        if not buyer_citizen_rec or not seller_citizen_rec:
            log.warning(f"Buyer or Seller citizen record not found for contract {original_contract_id}. Skipping.")
            all_financials_processed = False
            continue
        
        try:
            buyer_ducats = float(buyer_citizen_rec['fields'].get('Ducats', 0))
            seller_ducats = float(seller_citizen_rec['fields'].get('Ducats', 0))

            tables['citizens'].update(buyer_citizen_rec['id'], {'Ducats': buyer_ducats - total_cost})
            tables['citizens'].update(seller_citizen_rec['id'], {'Ducats': seller_ducats + total_cost})

            transaction_payload = {
                "Type": "import_payment",
                "AssetType": "contract", # AssetType for transaction
                "AssetId": original_contract_id,
                "Seller": seller_username,
                "Buyer": buyer_username,
                "Price": total_cost,
                "Details": json.dumps({
                    "resource_type": contract_fields.get('ResourceType'),
                    "amount": amount_for_this_contract_part,
                    "price_per_unit": price_per_resource,
                    "activity_guid": activity_guid
                }),
                "CreatedAt": datetime.now(timezone.utc).isoformat(),
                "ExecutedAt": datetime.now(timezone.utc).isoformat()
            }
            tables['transactions'].create(transaction_payload)
            log.info(f"Processed financial transaction for contract {original_contract_id} (Activity: {activity_guid}). Cost: {total_cost}")
        except Exception as e_finance:
            log.error(f"Error processing financial transaction for contract {original_contract_id}: {e_finance}")
            all_financials_processed = False
            
    return all_financials_processed


def update_activity_status(tables: Dict[str, Table], activity_airtable_id: str, status: str):
    """Updates the status of an activity."""
    try:
        tables['activities'].update(activity_airtable_id, {'Status': status, 'UpdatedAt': datetime.now(timezone.utc).isoformat()})
        log.info(f"Updated activity {activity_airtable_id} status to '{status}'.")
    except Exception as e:
        log.error(f"Error updating status for activity {activity_airtable_id}: {e}")


def main(dry_run: bool = False):
    log.info(f"Starting Process Activities script (dry_run={dry_run})...")
    tables = initialize_airtable()
    if not tables:
        log.error("Failed to initialize Airtable. Exiting.")
        return

    # Fetch definitions once
    building_type_defs = get_building_type_definitions_from_api()
    resource_defs = get_resource_definitions_from_api()

    if not building_type_defs or not resource_defs:
        log.error("Failed to fetch building or resource definitions. Exiting.")
        return

    activities_to_process = get_concluded_unprocessed_activities(tables)
    if not activities_to_process:
        log.info("No activities to process.")
        return

    processed_count = 0
    failed_count = 0

    for activity_record in activities_to_process:
        activity_type = activity_record['fields'].get('Type')
        activity_id_airtable = activity_record['id']
        activity_guid = activity_record['fields'].get('ActivityId', activity_id_airtable)

        log.info(f"--- Processing activity {activity_guid} of type {activity_type} ---")
        
        success = False
        if dry_run:
            log.info(f"[DRY RUN] Would process activity {activity_guid} of type {activity_type}.")
            success = True # Simulate success for dry run
        else:
            if activity_type == "deliver_resource_batch":
                success = process_deliver_resource_batch(tables, activity_record, building_type_defs, resource_defs)
            # Add other activity type processing here
            # elif activity_type == "another_type":
            #     success = process_another_type(tables, activity_record, ...)
            else:
                log.warning(f"Unknown or unhandled activity type: {activity_type} for activity {activity_guid}. Marking as failed.")
                success = False # Mark as failed if type is unknown

        if success:
            update_activity_status(tables, activity_id_airtable, "processed")
            processed_count +=1
        else:
            update_activity_status(tables, activity_id_airtable, "failed")
            failed_count +=1
        
        log.info(f"--- Finished processing activity {activity_guid} ---")


    log.info(f"Process Activities script finished. Processed: {processed_count}, Failed: {failed_count}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process concluded activities in La Serenissima.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable.",
    )
    args = parser.parse_args()

    main(args.dry_run)
