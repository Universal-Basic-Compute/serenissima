#!/usr/bin/env python3
"""
Automated Adjust Storage Queries Contracts script for La Serenissima.

This script identifies business buildings run by AI that are over 90% storage capacity.
For these buildings, it attempts to find public_storage contracts from other facilities
to offload resources and bring their storage utilization back to 50%.
It then creates or updates 'storage_query' contracts to secure this external storage.
"""

import os
import sys
import json
import traceback
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Any, Tuple
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
import argparse
import logging
import math
import uuid

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("automated_adjuststoragequeriescontracts")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, LogColors, log_header # Import LogColors and log_header
CONTRACT_DURATION_MONTHS = 1 # New contracts will be valid for this many months
STORAGE_TARGET_PERCENTAGE = 0.50 # Target 50% storage utilization
STORAGE_THRESHOLD_PERCENTAGE = 0.90 # Trigger if storage is over 90%

# LogColors is now imported from activity_helpers

# --- Helper Functions ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Error: Airtable credentials not found.{LogColors.ENDC}")
        return None
    try:
        session = requests.Session()
        session.trust_env = False
        api = Api(airtable_api_key)
        api.session = session # Set the session on the Api object

        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "buildings": api.table(airtable_base_id, "BUILDINGS"),
            "contracts": api.table(airtable_base_id, "CONTRACTS"),
            "resources": api.table(airtable_base_id, "RESOURCES"),
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

from backend.engine.utils.activity_helpers import _escape_airtable_value, _get_building_position_coords, calculate_haversine_distance_meters

def get_ai_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Get all citizens that are marked as AI and are in Venice."""
    try:
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        log.info(f"Found {len(ai_citizens)} AI citizens in Venice.")
        return ai_citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error getting AI citizens: {e}{LogColors.ENDC}")
        return []

def get_building_types_from_api() -> Dict[str, Dict]:
    """Get information about different building types from the API."""
    try:
        url = f"{API_BASE_URL}/api/building-types"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "buildingTypes" in data:
            defs = {}
            for bt in data["buildingTypes"]:
                if "type" in bt:
                    defs[bt["type"]] = {
                        "type": bt["type"],
                        "name": bt.get("name"),
                        "consumeTier": bt.get("consumeTier"),
                        "buildTier": bt.get("buildTier"),
                        "tier": bt.get("tier"),
                        "productionInformation": bt.get("productionInformation", {}),
                        # Inclure d'autres champs si nécessaire
                    }
            return defs
        log.error(f"{LogColors.FAIL}Unexpected API response for building types: {data}{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception fetching building types: {e}{LogColors.ENDC}")
        return {}

def get_resource_types_from_api() -> Dict[str, Dict]:
    """Get information about different resource types from the API."""
    try:
        url = f"{API_BASE_URL}/api/resource-types"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "resourceTypes" in data:
            return {rt["id"]: rt for rt in data["resourceTypes"] if "id" in rt}
        log.error(f"{LogColors.FAIL}Unexpected API response for resource types: {data}{LogColors.ENDC}")
        return {}
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception fetching resource types: {e}{LogColors.ENDC}")
        return {}

# Import get_building_storage_details from activity_helpers
from backend.engine.utils.activity_helpers import get_building_storage_details

def get_buildings_run_by_ai_with_category(tables: Dict[str, Table], username: str, category: str) -> List[Dict]:
    """Fetches buildings run by a specific AI citizen and matching a category."""
    try:
        formula = f"AND({{RunBy}}='{_escape_airtable_value(username)}', {{Category}}='{_escape_airtable_value(category)}')"
        buildings = tables["buildings"].all(formula=formula)
        log.debug(f"Found {len(buildings)} '{category}' buildings run by {username}.")
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching '{category}' buildings for {username}: {e}{LogColors.ENDC}")
        return []

def get_active_public_storage_contracts(tables: Dict[str, Table], resource_type_id: str) -> List[Dict]:
    """Fetches active 'public_storage' contracts for a specific resource type."""
    now_iso = datetime.now(VENICE_TIMEZONE).isoformat()
    formula = (f"AND({{Type}}='public_storage', {{ResourceType}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{Status}}='active', IS_AFTER({{EndAt}}, '{now_iso}'))")
    try:
        contracts = tables["contracts"].all(formula=formula)
        log.debug(f"Found {len(contracts)} active 'public_storage' contracts for resource {resource_type_id}.")
        return contracts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching 'public_storage' contracts for {resource_type_id}: {e}{LogColors.ENDC}")
        return []

def _get_building_position_coords(building_record: Dict) -> Optional[Dict[str, float]]:
    """Extracts lat/lng coordinates from a building record's Position or Point field."""
    # This is a simplified version. A more robust one would exist in a shared util.
    if not building_record or 'fields' not in building_record: return None
    pos_str = building_record['fields'].get('Position')
    if pos_str:
        try: return json.loads(pos_str)
        except: pass
    point_str = building_record['fields'].get('Point')
    if point_str and isinstance(point_str, str):
        parts = point_str.split('_')
        if len(parts) >= 3:
            try: return {"lat": float(parts[1]), "lng": float(parts[2])}
            except: pass
    return None

def calculate_haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# --- Main Processing Logic ---

def terminate_empty_storage_query_contracts(tables: Dict[str, Table], dry_run: bool = False) -> int:
    """
    Finds active 'storage_query' contracts where the BuyerBuilding no longer holds
    the specified ResourceType and terminates them.
    """
    log_header(f"Terminating Empty 'storage_query' Contracts (dry_run={dry_run})", LogColors.HEADER)
    terminated_count = 0
    now_iso = datetime.now(VENICE_TIMEZONE).isoformat()

    try:
        active_query_contracts_formula = f"AND({{Type}}='storage_query', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
        active_query_contracts = tables["contracts"].all(formula=active_query_contracts_formula)
        log.info(f"Found {len(active_query_contracts)} active 'storage_query' contracts to check.")

        for contract in active_query_contracts:
            contract_fields = contract['fields']
            contract_id_airtable = contract['id']
            contract_id_custom = contract_fields.get('ContractId', contract_id_airtable)
            buyer_building_id = contract_fields.get('BuyerBuilding')
            resource_type = contract_fields.get('ResourceType')
            buyer_username = contract_fields.get('Buyer')

            if not all([buyer_building_id, resource_type, buyer_username]):
                log.warning(f"  Contract {contract_id_custom} missing BuyerBuilding, ResourceType, or Buyer. Skipping termination check.")
                continue

            # Check stock of this specific resource in the buyer's building
            # We can reuse get_building_storage_details and check the specific resource
            _, resources_in_buyer_building = get_building_storage_details(tables, buyer_building_id, buyer_username)
            stock_of_resource = resources_in_buyer_building.get(resource_type, 0.0)

            log.debug(f"  Checking contract {contract_id_custom}: BuyerBuilding {buyer_building_id}, Resource {resource_type}, Buyer {buyer_username}. Current stock of resource: {stock_of_resource:.2f}")

            if stock_of_resource <= 0.01: # Using a small epsilon for float comparison
                log.info(f"  Contract {contract_id_custom} for resource {resource_type} in {buyer_building_id} (Buyer: {buyer_username}) has zero stock. Terminating.")
                if not dry_run:
                    try:
                        update_payload = {
                            "Status": "ended_by_ai",
                            "EndAt": now_iso,
                            "Notes": f"{contract_fields.get('Notes', '')}\nTerminated by script: resource stock at BuyerBuilding is zero."
                        }
                        tables["contracts"].update(contract_id_airtable, update_payload)
                        log.info(f"    {LogColors.OKCYAN}Terminated contract {contract_id_custom}.{LogColors.ENDC}")
                        terminated_count += 1
                    except Exception as e_terminate:
                        log.error(f"    {LogColors.FAIL}Failed to terminate contract {contract_id_custom}: {e_terminate}{LogColors.ENDC}")
                else:
                    log.info(f"    [DRY RUN] Would terminate contract {contract_id_custom}.")
                    terminated_count += 1
            # else:
                # log.debug(f"  Contract {contract_id_custom} still has stock ({stock_of_resource:.2f} of {resource_type}). Not terminating.")

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error during termination of empty storage_query contracts: {e}{LogColors.ENDC}")
        log.error(traceback.format_exc())
    
    log.info(f"Finished terminating empty 'storage_query' contracts. Terminated: {terminated_count}")
    return terminated_count

def process_storage_queries(dry_run: bool = False):
    log_header(f"Storage Query Contract Adjustment (dry_run={dry_run})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables: return

    # Terminate empty contracts first
    terminate_empty_storage_query_contracts(tables, dry_run=dry_run)
    # Proceed with the rest of the logic

    building_type_defs = get_building_types_from_api()
    if not building_type_defs:
        log.error(f"{LogColors.FAIL}Failed to get building type definitions. Aborting.{LogColors.ENDC}")
        return
    
    resource_type_defs = get_resource_types_from_api() # Optional, for names

    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        log.info("No AI citizens found. Exiting.")
        return

    total_contracts_managed = 0

    for citizen in ai_citizens:
        ai_username = citizen["fields"].get("Username")
        ai_social_class = citizen["fields"].get("SocialClass")

        if not ai_username: continue

        if ai_social_class == 'Nobili':
            log.info(f"AI citizen {ai_username} is Nobili. Skipping storage query contract adjustment for businesses they might RunBy.")
            continue

        log.info(f"Processing AI citizen: {LogColors.OKBLUE}{ai_username}{LogColors.ENDC}")
        business_buildings = get_buildings_run_by_ai_with_category(tables, ai_username, "business")

        for biz_building_record in business_buildings:
            biz_building_id = biz_building_record["fields"].get("BuildingId")
            biz_building_type_str = biz_building_record["fields"].get("Type")
            biz_building_name = biz_building_record["fields"].get("Name", biz_building_id)

            if not biz_building_id or not biz_building_type_str:
                log.warning(f"  Business building {biz_building_record['id']} missing BuildingId or Type. Skipping.")
                continue

            biz_type_def = building_type_defs.get(biz_building_type_str)
            if not biz_type_def:
                log.warning(f"  Definition for building type '{biz_building_type_str}' (Building: {biz_building_id}) not found. Skipping.")
                continue
            
            total_storage_capacity = float(biz_type_def.get("productionInformation", {}).get("storageCapacity", 0.0))
            if total_storage_capacity <= 0:
                log.debug(f"  Business {biz_building_name} has no storage capacity. Skipping.")
                continue

            current_volume, resources_in_biz_building = get_building_storage_details(tables, biz_building_id, ai_username)
            
            utilization = (current_volume / total_storage_capacity) if total_storage_capacity > 0 else float('inf')
            log.info(f"  Business {biz_building_name}: Capacity={total_storage_capacity:.0f}, CurrentVolume={current_volume:.0f} (Utilization: {utilization:.2%})")

            if utilization < STORAGE_THRESHOLD_PERCENTAGE:
                log.debug(f"  Storage utilization for {biz_building_name} is below threshold. No action needed.")
                continue
            
            target_volume_after_offload = STORAGE_TARGET_PERCENTAGE * total_storage_capacity
            volume_to_offload_total = current_volume - target_volume_after_offload
            log.info(f"  {biz_building_name} needs to offload {volume_to_offload_total:.2f} units to reach {STORAGE_TARGET_PERCENTAGE:.0%} utilization.")

            # Sort resources by amount, largest first, to prioritize offloading abundant items
            sorted_resources_to_consider = sorted(resources_in_biz_building.items(), key=lambda item: item[1], reverse=True)

            for resource_id, amount_of_this_resource_in_biz_building_initial in sorted_resources_to_consider:
                if volume_to_offload_total <= 0:
                    log.info(f"  Target offload volume reached for {biz_building_name} globally. Stopping resource iteration.")
                    break
                
                remaining_amount_of_this_resource_to_offload = amount_of_this_resource_in_biz_building_initial
                log.info(f"    Considering offloading resource: {resource_id} (Currently {remaining_amount_of_this_resource_to_offload:.2f} units in building, need to offload up to {volume_to_offload_total:.2f} total volume)")
                
                public_storage_offers = get_active_public_storage_contracts(tables, resource_id)
                if not public_storage_offers:
                    log.info(f"    No public_storage offers found for {resource_id}.")
                    continue

                scored_offers = []
                biz_building_pos = _get_building_position_coords(biz_building_record)

                for offer_contract in public_storage_offers:
                    storage_facility_id = offer_contract["fields"].get("SellerBuilding")
                    if not storage_facility_id: continue
                    
                    storage_facility_record_list = tables["buildings"].all(formula=f"{{BuildingId}}='{_escape_airtable_value(storage_facility_id)}'")
                    if not storage_facility_record_list:
                        log.warning(f"      Storage facility {storage_facility_id} for offer {offer_contract['id']} not found.")
                        continue
                    storage_facility_record = storage_facility_record_list[0]
                    storage_facility_pos = _get_building_position_coords(storage_facility_record)
                    
                    if not biz_building_pos or not storage_facility_pos:
                        log.warning(f"      Missing position for business or storage facility. Cannot calculate score for offer {offer_contract['id']}.")
                        continue

                    distance = calculate_haversine_distance_meters(biz_building_pos["lat"], biz_building_pos["lng"], storage_facility_pos["lat"], storage_facility_pos["lng"])
                    price = float(offer_contract["fields"].get("PricePerResource", float('inf')))
                    score = price * price * (distance + 1)
                    
                    scored_offers.append({
                        "score": score, "contract_record": offer_contract, 
                        "storage_facility_record": storage_facility_record, "distance": distance, "price": price
                    })
                
                if not scored_offers:
                    log.info(f"    No scorable public_storage offers for {resource_id} (e.g., missing positions).")
                    continue
                
                scored_offers.sort(key=lambda x: x["score"])
                
                for offer_info in scored_offers:
                    if volume_to_offload_total <= 0:
                        log.info(f"      Target offload volume reached globally for {biz_building_name}. Stopping for this resource offer.")
                        break
                    if remaining_amount_of_this_resource_to_offload <= 0:
                        log.info(f"      All of resource {resource_id} has been accounted for offloading from {biz_building_name}. Stopping for this resource offer.")
                        break

                    log.info(f"      Considering public_storage offer {offer_info['contract_record']['id']} (Score: {offer_info['score']:.2f}) for {resource_id}")

                    max_can_offload_this_resource_this_contract = min(remaining_amount_of_this_resource_to_offload, volume_to_offload_total)
                    storage_contract_capacity = float(offer_info["contract_record"]["fields"].get("TargetAmount", 0.0))
                    actual_target_amount_for_query = min(max_can_offload_this_resource_this_contract, storage_contract_capacity)
                    actual_target_amount_for_query = math.floor(actual_target_amount_for_query)

                    if actual_target_amount_for_query <= 0:
                        log.info(f"        Calculated TargetAmount for {resource_id} with this offer is <= 0. Trying next offer.")
                        continue

                    query_contract_id = f"storage_query_{biz_building_id}_{resource_id}_{uuid.uuid4().hex[:8]}"
                    seller_storage_operator = offer_info["storage_facility_record"]["fields"].get("RunBy")
                    if not seller_storage_operator:
                        log.warning(f"        Storage facility {offer_info['storage_facility_record']['fields'].get('BuildingId')} has no operator. Cannot create query contract with this offer.")
                        continue

                    now = datetime.now(VENICE_TIMEZONE)
                    end_at = now + timedelta(days=30 * CONTRACT_DURATION_MONTHS)

                    res_name_log = resource_type_defs.get(resource_id, {}).get("name", resource_id)
                    title = f"Store {actual_target_amount_for_query:.0f} {res_name_log} for {biz_building_name}"
                    description = (f"Automated query to store {actual_target_amount_for_query:.0f} units of {res_name_log} "
                                   f"from {biz_building_name} at {offer_info['storage_facility_record']['fields'].get('Name', offer_info['storage_facility_record']['fields'].get('BuildingId'))}. "
                                   f"Based on public_storage offer {offer_info['contract_record']['fields'].get('ContractId', offer_info['contract_record']['id'])}.")
                    notes_payload = {
                        "source_public_storage_contract_id": offer_info['contract_record']['fields'].get('ContractId', offer_info['contract_record']['id']),
                        "price_from_offer": offer_info['price'],
                        "distance_to_storage_m": round(offer_info['distance'], 2),
                        "created_by_script": "automated_adjuststoragequeriescontracts.py"
                    }

                    activity_params = {
                        "contractId_to_create_if_new": query_contract_id, # Pass the deterministically generated ID
                        "resourceType": resource_id,
                        "amountNeeded": actual_target_amount_for_query,
                        "durationDays": CONTRACT_DURATION_MONTHS * 30, # Approximate days
                        "buyerBuildingId": biz_building_id,
                        "pricePerResource": offer_info["price"], # Price from the source public_storage offer
                        "sellerBuildingId": offer_info["storage_facility_record"]["fields"].get("BuildingId"),
                        "sellerUsername": seller_storage_operator,
                        "title": title,
                        "description": description,
                        "notes": notes_payload # Pass as dict, API will handle JSON stringification if needed by creator
                    }
                    
                    # Use ai_username (which is biz_runner_username) for the activity initiation
                    if call_try_create_activity_api(ai_username, "manage_storage_query_contract", activity_params, dry_run, log):
                        log.info(f"        Successfully initiated 'manage_storage_query_contract' for {actual_target_amount_for_query:.0f} of {res_name_log} from {biz_building_name} to {offer_info['storage_facility_record']['fields'].get('Name', offer_info['storage_facility_record']['fields'].get('BuildingId'))}.")
                        total_contracts_managed +=1
                        volume_to_offload_total -= actual_target_amount_for_query
                        remaining_amount_of_this_resource_to_offload -= actual_target_amount_for_query
                    else:
                        log.error(f"        {LogColors.FAIL}Failed to initiate 'manage_storage_query_contract' for {query_contract_id} for {res_name_log}.{LogColors.ENDC}")
                        # Consider if traceback.format_exc() is still needed here or if call_try_create_activity_api logs enough.
                        # For now, let's assume the helper's logging is sufficient. If errors persist, re-add:
                        # log.error(traceback.format_exc())

    log.info(f"{LogColors.OKGREEN}Storage Query Contract Adjustment process finished.{LogColors.ENDC}")
    log.info(f"Total 'storage_query' contracts created or updated (or simulated): {total_contracts_managed}")

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        log_ref.info(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return True # Simulate success for dry run

    api_url = f"{API_BASE_URL}/api/activities/try-create"
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        if response_data.get("success"):
            log_ref.info(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{LogColors.ENDC}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 log_ref.info(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            log_ref.error(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        log_ref.error(f"{LogColors.FAIL}API request failed for activity '{activity_type}' for {citizen_username}: {e}{LogColors.ENDC}")
        return False
    except json.JSONDecodeError:
        log_ref.error(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return False

def process_storage_queries(dry_run: bool = False):
    log.info(f"{LogColors.HEADER}Starting Storage Query Contract Adjustment (dry_run={dry_run})...{LogColors.ENDC}")

    tables = initialize_airtable()
    if not tables: return

    # Terminate empty contracts first
    terminate_empty_storage_query_contracts(tables, dry_run=dry_run)
    # Proceed with the rest of the logic

    building_type_defs = get_building_types_from_api()
    if not building_type_defs:
        log.error(f"{LogColors.FAIL}Failed to get building type definitions. Aborting.{LogColors.ENDC}")
        return
    
    resource_type_defs = get_resource_types_from_api() # Optional, for names

    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        log.info("No AI citizens found. Exiting.")
        return

    total_contracts_managed = 0

    for citizen in ai_citizens:
        ai_username = citizen["fields"].get("Username")
        ai_social_class = citizen["fields"].get("SocialClass")

        if not ai_username: continue

        if ai_social_class == 'Nobili':
            log.info(f"AI citizen {ai_username} is Nobili. Skipping storage query contract adjustment for businesses they might RunBy.")
            continue

        log.info(f"Processing AI citizen: {LogColors.OKBLUE}{ai_username}{LogColors.ENDC}")
        business_buildings = get_buildings_run_by_ai_with_category(tables, ai_username, "business")

        for biz_building_record in business_buildings:
            biz_building_id = biz_building_record["fields"].get("BuildingId")
            biz_building_type_str = biz_building_record["fields"].get("Type")
            biz_building_name = biz_building_record["fields"].get("Name", biz_building_id)

            if not biz_building_id or not biz_building_type_str:
                log.warning(f"  Business building {biz_building_record['id']} missing BuildingId or Type. Skipping.")
                continue

            biz_type_def = building_type_defs.get(biz_building_type_str)
            if not biz_type_def:
                log.warning(f"  Definition for building type '{biz_building_type_str}' (Building: {biz_building_id}) not found. Skipping.")
                continue
            
            total_storage_capacity = float(biz_type_def.get("productionInformation", {}).get("storageCapacity", 0.0))
            if total_storage_capacity <= 0:
                log.debug(f"  Business {biz_building_name} has no storage capacity. Skipping.")
                continue

            current_volume, resources_in_biz_building = get_building_storage_details(tables, biz_building_id, ai_username)
            
            utilization = (current_volume / total_storage_capacity) if total_storage_capacity > 0 else float('inf')
            log.info(f"  Business {biz_building_name}: Capacity={total_storage_capacity:.0f}, CurrentVolume={current_volume:.0f} (Utilization: {utilization:.2%})")

            if utilization < STORAGE_THRESHOLD_PERCENTAGE:
                log.debug(f"  Storage utilization for {biz_building_name} is below threshold. No action needed.")
                continue
            
            target_volume_after_offload = STORAGE_TARGET_PERCENTAGE * total_storage_capacity
            volume_to_offload_total = current_volume - target_volume_after_offload
            log.info(f"  {biz_building_name} needs to offload {volume_to_offload_total:.2f} units to reach {STORAGE_TARGET_PERCENTAGE:.0%} utilization.")

            # Sort resources by amount, largest first, to prioritize offloading abundant items
            sorted_resources_to_consider = sorted(resources_in_biz_building.items(), key=lambda item: item[1], reverse=True)

            for resource_id, amount_of_this_resource_in_biz_building_initial in sorted_resources_to_consider:
                if volume_to_offload_total <= 0:
                    log.info(f"  Target offload volume reached for {biz_building_name} globally. Stopping resource iteration.")
                    break
                
                remaining_amount_of_this_resource_to_offload = amount_of_this_resource_in_biz_building_initial
                log.info(f"    Considering offloading resource: {resource_id} (Currently {remaining_amount_of_this_resource_to_offload:.2f} units in building, need to offload up to {volume_to_offload_total:.2f} total volume)")
                
                public_storage_offers = get_active_public_storage_contracts(tables, resource_id)
                if not public_storage_offers:
                    log.info(f"    No public_storage offers found for {resource_id}.")
                    continue

                scored_offers = []
                biz_building_pos = _get_building_position_coords(biz_building_record)

                for offer_contract in public_storage_offers:
                    storage_facility_id = offer_contract["fields"].get("SellerBuilding")
                    if not storage_facility_id: continue
                    
                    storage_facility_record_list = tables["buildings"].all(formula=f"{{BuildingId}}='{_escape_airtable_value(storage_facility_id)}'")
                    if not storage_facility_record_list:
                        log.warning(f"      Storage facility {storage_facility_id} for offer {offer_contract['id']} not found.")
                        continue
                    storage_facility_record = storage_facility_record_list[0]
                    storage_facility_pos = _get_building_position_coords(storage_facility_record)
                    
                    if not biz_building_pos or not storage_facility_pos:
                        log.warning(f"      Missing position for business or storage facility. Cannot calculate score for offer {offer_contract['id']}.")
                        continue

                    distance = calculate_haversine_distance_meters(biz_building_pos["lat"], biz_building_pos["lng"], storage_facility_pos["lat"], storage_facility_pos["lng"])
                    price = float(offer_contract["fields"].get("PricePerResource", float('inf')))
                    score = price * price * (distance + 1)
                    
                    scored_offers.append({
                        "score": score, "contract_record": offer_contract, 
                        "storage_facility_record": storage_facility_record, "distance": distance, "price": price
                    })
                
                if not scored_offers:
                    log.info(f"    No scorable public_storage offers for {resource_id} (e.g., missing positions).")
                    continue
                
                scored_offers.sort(key=lambda x: x["score"])
                
                for offer_info in scored_offers:
                    if volume_to_offload_total <= 0:
                        log.info(f"      Target offload volume reached globally for {biz_building_name}. Stopping for this resource offer.")
                        break
                    if remaining_amount_of_this_resource_to_offload <= 0:
                        log.info(f"      All of resource {resource_id} has been accounted for offloading from {biz_building_name}. Stopping for this resource offer.")
                        break

                    log.info(f"      Considering public_storage offer {offer_info['contract_record']['id']} (Score: {offer_info['score']:.2f}) for {resource_id}")

                    max_can_offload_this_resource_this_contract = min(remaining_amount_of_this_resource_to_offload, volume_to_offload_total)
                    storage_contract_capacity = float(offer_info["contract_record"]["fields"].get("TargetAmount", 0.0))
                    actual_target_amount_for_query = min(max_can_offload_this_resource_this_contract, storage_contract_capacity)
                    actual_target_amount_for_query = math.floor(actual_target_amount_for_query)

                    if actual_target_amount_for_query <= 0:
                        log.info(f"        Calculated TargetAmount for {resource_id} with this offer is <= 0. Trying next offer.")
                        continue

                    query_contract_id = f"storage_query_{biz_building_id}_{resource_id}_{uuid.uuid4().hex[:8]}"
                    seller_storage_operator = offer_info["storage_facility_record"]["fields"].get("RunBy")
                    if not seller_storage_operator:
                        log.warning(f"        Storage facility {offer_info['storage_facility_record']['fields'].get('BuildingId')} has no operator. Cannot create query contract with this offer.")
                        continue

                    now = datetime.now(VENICE_TIMEZONE)
                    end_at = now + timedelta(days=30 * CONTRACT_DURATION_MONTHS)

                    res_name_log = resource_type_defs.get(resource_id, {}).get("name", resource_id)
                    title = f"Store {actual_target_amount_for_query:.0f} {res_name_log} for {biz_building_name}"
                    description = (f"Automated query to store {actual_target_amount_for_query:.0f} units of {res_name_log} "
                                   f"from {biz_building_name} at {offer_info['storage_facility_record']['fields'].get('Name', offer_info['storage_facility_record']['fields'].get('BuildingId'))}. "
                                   f"Based on public_storage offer {offer_info['contract_record']['fields'].get('ContractId', offer_info['contract_record']['id'])}.")
                    notes_payload = {
                        "source_public_storage_contract_id": offer_info['contract_record']['fields'].get('ContractId', offer_info['contract_record']['id']),
                        "price_from_offer": offer_info['price'],
                        "distance_to_storage_m": round(offer_info['distance'], 2),
                        "created_by_script": "automated_adjuststoragequeriescontracts.py"
                    }

                    activity_params = {
                        "contractId_to_create_if_new": query_contract_id, # Pass the deterministically generated ID
                        "resourceType": resource_id,
                        "amountNeeded": actual_target_amount_for_query,
                        "durationDays": CONTRACT_DURATION_MONTHS * 30, # Approximate days
                        "buyerBuildingId": biz_building_id,
                        "pricePerResource": offer_info["price"], # Price from the source public_storage offer
                        "sellerBuildingId": offer_info["storage_facility_record"]["fields"].get("BuildingId"),
                        "sellerUsername": seller_storage_operator,
                        "title": title,
                        "description": description,
                        "notes": notes_payload # Pass as dict, API will handle JSON stringification if needed by creator
                    }
                    
                    # Use ai_username (which is biz_runner_username) for the activity initiation
                    if call_try_create_activity_api(ai_username, "manage_storage_query_contract", activity_params, dry_run, log):
                        log.info(f"        Successfully initiated 'manage_storage_query_contract' for {actual_target_amount_for_query:.0f} of {res_name_log} from {biz_building_name} to {offer_info['storage_facility_record']['fields'].get('Name', offer_info['storage_facility_record']['fields'].get('BuildingId'))}.")
                        total_contracts_managed +=1
                        volume_to_offload_total -= actual_target_amount_for_query
                        remaining_amount_of_this_resource_to_offload -= actual_target_amount_for_query
                    else:
                        log.error(f"        {LogColors.FAIL}Failed to initiate 'manage_storage_query_contract' for {query_contract_id} for {res_name_log}.{LogColors.ENDC}")
                        # Consider if traceback.format_exc() is still needed here or if call_try_create_activity_api logs enough.
                        # For now, let's assume the helper's logging is sufficient. If errors persist, re-add:
                        # log.error(traceback.format_exc())

    log.info(f"{LogColors.OKGREEN}Storage Query Contract Adjustment process finished.{LogColors.ENDC}")
    log.info(f"Total 'storage_query' contracts created or updated (or simulated): {total_contracts_managed}")

# --- Main Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automate creation/update of 'storage_query' contracts for AI businesses.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to Airtable."
    )
    args = parser.parse_args()

    process_storage_queries(dry_run=args.dry_run)
