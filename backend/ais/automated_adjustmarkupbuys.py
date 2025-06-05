#!/usr/bin/env python3
"""
Automated Markup Buys script for La Serenissima.

This script identifies resources that business buildings sell but do not produce (markup resources).
It then finds the best "public_sell" contracts from storage facilities for these resources
and creates "markup_buy" contracts for the business buildings to procure them.
"""

import os
import sys
import json
import traceback
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
import argparse
import logging
import math

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("automated_adjustmarkupbuys")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
DEFAULT_MARKUP_BUY_TARGET_AMOUNT = 50.0 # Default amount for new markup_buy contracts
CONTRACT_DURATION_WEEKS = 1 # New contracts will be valid for this many weeks

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

# --- Helper Functions ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Error: Airtable credentials not found in environment variables.{LogColors.ENDC}")
        return None

    try:
        # session = requests.Session() # Removed custom session
        # session.trust_env = False    # Removed custom session configuration
        api = Api(airtable_api_key) # Let Api manage its own session
        # api.session = session # Removed custom session assignment

        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "buildings": api.table(airtable_base_id, "BUILDINGS"),
            "contracts": api.table(airtable_base_id, "CONTRACTS"),
            "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
            "resources": api.table(airtable_base_id, "RESOURCES")
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

# _escape_airtable_value is now imported from activity_helpers

# Import API fetching functions from activity_helpers
from backend.engine.utils.activity_helpers import get_building_types_from_api, _escape_airtable_value
# Removed local get_building_types_from_api
# _escape_airtable_value was defined locally, now imported

def get_resource_name(resource_id: str, resource_type_defs: Dict[str, Dict]) -> str:
    """Gets the human-readable name of a resource."""
    return resource_type_defs.get(resource_id, {}).get("name", resource_id)


def get_all_buildings_by_filter(tables: Dict[str, Table], category: Optional[str] = None, sub_category: Optional[str] = None) -> List[Dict]:
    """Fetches buildings, optionally filtered by category and/or subCategory."""
    filters = []
    if category:
        filters.append(f"{{Category}}='{_escape_airtable_value(category)}'")
    if sub_category:
        filters.append(f"{{SubCategory}}='{_escape_airtable_value(sub_category)}'")
    
    formula = "AND(" + ", ".join(filters) + ")" if filters else ""
    log_msg = f"Fetching buildings"
    if category: log_msg += f" with Category='{category}'"
    if sub_category: log_msg += f" and SubCategory='{sub_category}'"
    log.info(f"{LogColors.OKBLUE}{log_msg}{LogColors.ENDC}" + (f" (Formula: {formula})" if formula else f"{LogColors.OKBLUE} (all buildings){LogColors.ENDC}"))

    try:
        buildings = tables["buildings"].all(formula=formula)
        log.info(f"{LogColors.OKGREEN}Found {len(buildings)} buildings matching criteria.{LogColors.ENDC}")
        return buildings
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching buildings: {e}{LogColors.ENDC}")
        return []

def get_active_public_sell_contracts_from_buildings(tables: Dict[str, Table], seller_building_ids: List[str]) -> List[Dict]:
    """Fetches active 'public_sell' contracts where SellerBuilding is in the provided list."""
    if not seller_building_ids:
        return []

    # Create a formula part for ORing multiple SellerBuilding IDs
    seller_building_conditions = [f"{{SellerBuilding}}='{_escape_airtable_value(bid)}'" for bid in seller_building_ids]
    seller_building_formula_part = "OR(" + ", ".join(seller_building_conditions) + ")"
    
    # Use Airtable's NOW() function for current time in GMT, matching how EndAt is likely stored.
    formula = f"AND({{Type}}='public_sell', {{Status}}='active', IS_AFTER({{EndAt}}, NOW()), {seller_building_formula_part})"
    
    log.info(f"{LogColors.OKBLUE}Fetching active 'public_sell' contracts from {len(seller_building_ids)} storage buildings using formula: {formula}{LogColors.ENDC}")
    try:
        contracts = tables["contracts"].all(formula=formula)
        log.info(f"{LogColors.OKGREEN}Found {len(contracts)} active 'public_sell' contracts from specified storage buildings.{LogColors.ENDC}")
        return contracts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching 'public_sell' contracts: {e}{LogColors.ENDC}")
        return []

def _get_building_position_coords(building_record: Dict) -> Optional[Dict[str, float]]:
    """Extracts lat/lng coordinates from a building record's Position or Point field."""
    position = None
    if not building_record or 'fields' not in building_record:
        return None
    try:
        position_str = building_record['fields'].get('Position')
        if position_str and isinstance(position_str, str):
            position = json.loads(position_str)
        
        if not position:
            point_str = building_record['fields'].get('Point')
            if point_str and isinstance(point_str, str):
                # Handle single point string or JSON array of points
                if point_str.startswith('[') and point_str.endswith(']'):
                    try:
                        point_list = json.loads(point_str)
                        if isinstance(point_list, list) and point_list:
                            point_str = point_list[0] # Use the first point for position
                    except json.JSONDecodeError:
                        pass # Use point_str as is if not a valid JSON list

                parts = point_str.split('_')
                if len(parts) >= 3:
                    lat_str, lng_str = parts[1], parts[2]
                    if all(s.replace('.', '', 1).replace('-', '', 1).isdigit() for s in [lat_str, lng_str]):
                        position = {"lat": float(lat_str), "lng": float(lng_str)}
    except Exception as e:
        log.warning(f"{LogColors.WARNING}Could not parse position for building {building_record.get('id', 'N/A')}: {e}{LogColors.ENDC}")
    
    return position if isinstance(position, dict) and 'lat' in position and 'lng' in position else None

def calculate_haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in meters between two points on the earth."""
    R = 6371000  # Radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_distance_between_buildings(building1_record: Dict, building2_record: Dict) -> float:
    """Calculates Haversine distance in meters between two buildings."""
    pos1 = _get_building_position_coords(building1_record)
    pos2 = _get_building_position_coords(building2_record)

    if pos1 and pos2:
        try:
            # Utilise la fonction importée
            return calculate_haversine_distance_meters(pos1['lat'], pos1['lng'], pos2['lat'], pos2['lng'])
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error calculating Haversine distance: {e}. Pos1: {pos1}, Pos2: {pos2}{LogColors.ENDC}")
            return float('inf')
    log.warning(f"{LogColors.WARNING}Could not get positions for distance calculation between {building1_record.get('id')} and {building2_record.get('id')}{LogColors.ENDC}")
    return float('inf')

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    # API_BASE_URL is defined globally in this script.
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
        # This script already imports requests
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

# Les définitions locales de _get_building_position_coords et calculate_haversine_distance_meters sont supprimées
# car elles sont maintenant importées.

def get_building_resource_stock(
    tables: Dict[str, Table],
    building_custom_id: str,
    resource_type_id: str,
    owner_username: str # The RunBy of the storage facility
) -> float:
    """Gets the current stock of a specific resource in a building, owned by the specified owner."""
    if not all([building_custom_id, resource_type_id, owner_username]):
        log.warning(f"{LogColors.WARNING}Missing parameters for get_building_resource_stock: building_id={building_custom_id}, resource_id={resource_type_id}, owner={owner_username}{LogColors.ENDC}")
        return 0.0
        
    formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{Asset}}='{_escape_airtable_value(building_custom_id)}', "
               f"{{AssetType}}='building', "
               f"{{Owner}}='{_escape_airtable_value(owner_username)}')")
    try:
        records = tables['resources'].all(formula=formula, max_records=1)
        if records:
            stock_count = float(records[0]['fields'].get('Count', 0.0))
            log.debug(f"{LogColors.OKBLUE}Stock for resource {resource_type_id} in building {building_custom_id} (owner: {owner_username}): {stock_count}{LogColors.ENDC}")
            return stock_count
        log.debug(f"{LogColors.OKBLUE}No stock record found for resource {resource_type_id} in building {building_custom_id} (owner: {owner_username}).{LogColors.ENDC}")
        return 0.0
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching stock for resource {resource_type_id} in building {building_custom_id} for owner {owner_username}: {e}{LogColors.ENDC}")
        return 0.0

# --- Main Processing Logic ---

def process_automated_markup_buys(dry_run: bool = False):
    log_header(f"Automated Markup Buys Process (dry_run={dry_run})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables:
        return

    building_type_defs = get_building_types_from_api()
    if not building_type_defs:
        log.error(f"{LogColors.FAIL}Failed to get building type definitions. Aborting.{LogColors.ENDC}")
        return
    
    # Resource type defs not strictly needed for this script's core logic, but good for names if logging.
    # resource_type_defs = get_resource_types_from_api() # Optional

    business_buildings = get_all_buildings_by_filter(tables, category="business")
    storage_buildings = get_all_buildings_by_filter(tables, sub_category="storage")

    if not business_buildings:
        log.info("No business buildings found. Exiting.")
        return
    if not storage_buildings:
        log.info("No storage buildings found. Cannot source markup resources. Exiting.")
        return

    storage_building_ids = [b['fields'].get('BuildingId') for b in storage_buildings if b['fields'].get('BuildingId')]
    if not storage_building_ids:
        log.info(f"{LogColors.WARNING}No storage buildings with BuildingId found. Cannot source markup resources. Exiting.{LogColors.ENDC}")
        return
        
    active_sell_contracts_from_storage = get_active_public_sell_contracts_from_buildings(tables, storage_building_ids)
    if not active_sell_contracts_from_storage:
        log.info(f"{LogColors.WARNING}No active 'public_sell' contracts found from storage facilities. Exiting.{LogColors.ENDC}")
        return

    log.info(f"{LogColors.OKBLUE}Found {len(business_buildings)} business buildings and {len(active_sell_contracts_from_storage)} relevant 'public_sell' contracts.{LogColors.ENDC}")
    
    total_new_contracts_created = 0
    total_old_contracts_deleted = 0

    for biz_building_record in business_buildings:
        biz_building_fields = biz_building_record['fields']
        biz_building_id = biz_building_fields.get('BuildingId')
        biz_building_type = biz_building_fields.get('Type')
        biz_runner_username = biz_building_fields.get('RunBy') # Buyer for new contracts
        biz_building_name = biz_building_fields.get('Name', biz_building_id)

        if not all([biz_building_id, biz_building_type, biz_runner_username]):
            log.warning(f"{LogColors.WARNING}Business building {biz_building_record['id']} is missing BuildingId, Type, or RunBy. Skipping.{LogColors.ENDC}")
            continue

        biz_type_def = building_type_defs.get(biz_building_type)
        if not biz_type_def:
            log.warning(f"{LogColors.WARNING}Definition for building type '{biz_building_type}' (Building: {biz_building_id}) not found. Skipping.{LogColors.ENDC}")
            continue

        prod_info = biz_type_def.get('productionInformation', {})
        sells_list = prod_info.get('sells', [])
        arti_recipes = prod_info.get('Arti', [])
        
        produced_resources = set()
        for recipe in arti_recipes: # recipe is a dict
            outputs_field = recipe.get('outputs') # This can be a dict or a list

            if isinstance(outputs_field, dict):
                # Case 1: outputs is a dictionary like {"resource_id1": amount1, "resource_id2": amount2}
                for resource_id in outputs_field.keys():
                    if isinstance(resource_id, str): # Ensure key is a string
                        produced_resources.add(resource_id)
            elif isinstance(outputs_field, list):
                # Case 2: outputs is a list
                for output_item in outputs_field:
                    if isinstance(output_item, dict) and isinstance(output_item.get('type'), str):
                        # Subcase 2a: list of dictionaries like [{"type": "resource_id1", "amount": X}, ...]
                        produced_resources.add(output_item['type'])
                    elif isinstance(output_item, str):
                        # Subcase 2b: list of strings like ["resource_id1", "resource_id2", ...]
                        produced_resources.add(output_item)
            # If outputs_field is None or some other type, it's skipped.
        
        markup_resources_needed = [res_id for res_id in sells_list if res_id not in produced_resources]

        if not markup_resources_needed:
            log.debug(f"{LogColors.OKBLUE}Business {biz_building_id} ({biz_building_name}) has no markup resources to buy.{LogColors.ENDC}")
            continue

        log.info(f"{LogColors.OKCYAN}Business {biz_building_id} ({biz_building_name}) needs markup resources: {markup_resources_needed}{LogColors.ENDC}")

        for resource_type_needed in markup_resources_needed:
            potential_source_contracts = []
            for sell_contract in active_sell_contracts_from_storage:
                if sell_contract['fields'].get('ResourceType') == resource_type_needed:
                    seller_storage_building_id = sell_contract['fields'].get('SellerBuilding')
                    seller_storage_building_record = next((sb for sb in storage_buildings if sb['fields'].get('BuildingId') == seller_storage_building_id), None)
                    
                    if seller_storage_building_record:
                        seller_operator_username = seller_storage_building_record['fields'].get('RunBy')
                        if not seller_operator_username:
                            log.warning(f"{LogColors.WARNING}  Storage building {seller_storage_building_id} for contract {sell_contract['id']} has no 'RunBy' operator. Cannot verify stock. Skipping.{LogColors.ENDC}")
                            continue

                        current_stock = get_building_resource_stock(tables, seller_storage_building_id, resource_type_needed, seller_operator_username)
                    
                        if current_stock <= 0:
                            log.info(f"{LogColors.OKBLUE}  Storage building {seller_storage_building_id} (Operator: {seller_operator_username}) has no stock ({current_stock}) of {resource_type_needed} for contract {sell_contract['id']}. Skipping this source.{LogColors.ENDC}")
                            continue
                    
                        # Optional: Check if stock is sufficient for contract's TargetAmount, though not strictly required by prompt
                        # contract_target_amount = float(sell_contract['fields'].get('TargetAmount', 0))
                        # if current_stock < contract_target_amount:
                        #    log.warning(f"{LogColors.WARNING}  Stock for {resource_type_needed} in {seller_storage_building_id} ({current_stock}) is less than contract TargetAmount ({contract_target_amount}). Contract {sell_contract['id']}. Still considering if stock > 0.{LogColors.ENDC}")

                        log.debug(f"{LogColors.OKBLUE}  Storage building {seller_storage_building_id} has {current_stock} of {resource_type_needed}. Considering contract {sell_contract['id']}.{LogColors.ENDC}")
                        distance = calculate_distance_between_buildings(biz_building_record, seller_storage_building_record)
                        price = float(sell_contract['fields'].get('PricePerResource', float('inf')))
                        score = price * price * distance 
                        potential_source_contracts.append({
                            "score": score,
                            "contract_record": sell_contract,
                            "seller_building_record": seller_storage_building_record,
                            "distance": distance,
                            "price": price,
                            "available_stock_at_source": current_stock # Store for potential future use
                        })
            
            potential_source_contracts.sort(key=lambda x: x['score'])
            
            if not potential_source_contracts:
                log.info(f"{LogColors.OKBLUE}  No 'public_sell' contracts found for resource '{resource_type_needed}' for business {biz_building_id}.{LogColors.ENDC}")
                continue

            log.info(f"{LogColors.OKGREEN}  Found {len(potential_source_contracts)} potential sources for '{resource_type_needed}' for {biz_building_id}. Best score: {potential_source_contracts[0]['score']:.2f}{LogColors.ENDC}")

            # Delete existing markup_buy contracts for this business and resource
            old_contracts_to_delete_formula = f"AND(STARTS_WITH({{ContractId}}, 'markup_buy_{_escape_airtable_value(biz_building_id)}_{_escape_airtable_value(resource_type_needed)}_'), {{Type}}='markup_buy', {{BuyerBuilding}}='{_escape_airtable_value(biz_building_id)}', {{ResourceType}}='{_escape_airtable_value(resource_type_needed)}')"
            try:
                existing_markup_contracts = tables['contracts'].all(formula=old_contracts_to_delete_formula)
                if existing_markup_contracts:
                    if not dry_run:
                        record_ids_to_delete = [rec['id'] for rec in existing_markup_contracts]
                        tables['contracts'].batch_delete(record_ids_to_delete)
                        log.info(f"{LogColors.OKBLUE}    Deleted {len(existing_markup_contracts)} old 'markup_buy' contracts for {biz_building_id}, resource {resource_type_needed}.{LogColors.ENDC}")
                    else:
                        log.info(f"{LogColors.OKCYAN}    [DRY RUN] Would delete {len(existing_markup_contracts)} old 'markup_buy' contracts for {biz_building_id}, resource {resource_type_needed}.{LogColors.ENDC}")
                    total_old_contracts_deleted += len(existing_markup_contracts)
            except Exception as e_del:
                log.error(f"{LogColors.FAIL}    Error deleting old 'markup_buy' contracts for {biz_building_id}, {resource_type_needed}: {e_del}{LogColors.ENDC}")

            # Create new markup_buy contracts (top 3)
            contracts_this_resource_created = 0
            for rank, source_info in enumerate(potential_source_contracts[:3], 1):
                source_contract_record = source_info['contract_record']
                source_seller_building_record = source_info['seller_building_record']
                
                new_contract_id = f"markup_buy_{biz_building_id}_{resource_type_needed}_{rank}"
                
                seller_username = source_seller_building_record['fields'].get('RunBy') # RunBy of the storage facility
                if not seller_username:
                    log.warning(f"{LogColors.WARNING}    Storage facility {source_seller_building_record['fields'].get('BuildingId')} has no RunBy. Cannot create markup_buy contract. Source contract: {source_contract_record['id']}{LogColors.ENDC}")
                    continue

                now = datetime.now(VENICE_TIMEZONE)
                end_at = now + timedelta(weeks=CONTRACT_DURATION_WEEKS)
                
                # resource_name_for_log = get_resource_name(resource_type_needed, resource_type_defs) # Optional
                seller_building_name = source_seller_building_record['fields'].get('Name', source_seller_building_record['fields'].get('BuildingId'))

                payload = {
                    "ContractId": new_contract_id,
                    "Type": "markup_buy",
                    "Buyer": biz_runner_username,
                    "BuyerBuilding": biz_building_id,
                    "Seller": seller_username,
                    "SellerBuilding": source_seller_building_record['fields'].get('BuildingId'),
                    "ResourceType": resource_type_needed,
                    "PricePerResource": source_info['price'],
                    "TargetAmount": DEFAULT_MARKUP_BUY_TARGET_AMOUNT,
                    "Status": "active",
                    "Priority": 5, # Default priority
                    "CreatedAt": now.isoformat(),
                    "EndAt": end_at.isoformat(),
                    "Title": f"Markup Buy: {resource_type_needed} for {biz_building_name}",
                    "Description": f"Automated contract to buy {resource_type_needed} from {seller_building_name} (source contract: {source_contract_record['fields'].get('ContractId', source_contract_record['id'])}) for resale at {biz_building_name}.",
                    "Notes": json.dumps({
                        "source_public_sell_contract_id": source_contract_record['fields'].get('ContractId', source_contract_record['id']),
                        "source_price": source_info['price'],
                        "source_distance_m": round(source_info['distance'],2),
                        "calculated_score": round(source_info['score'],2),
                        "created_by_script": "automated_adjustmarkupbuys.py"
                    })
                } # This is the end of the payload dict definition

                activity_params = {
                    "contractId_to_create_if_new": new_contract_id,
                    "resourceType": resource_type_needed,
                    "targetAmount": DEFAULT_MARKUP_BUY_TARGET_AMOUNT,
                    "maxPricePerResource": source_info['price'],
                    "buyerBuildingId": biz_building_id,
                    "sellerBuildingId": source_seller_building_record['fields'].get('BuildingId'),
                    "sellerUsername": seller_username,
                    "title": payload["Title"], # Use title from original payload
                    "description": payload["Description"], # Use description from original payload
                    "notes": json.loads(payload["Notes"]) # Pass notes_payload dict directly
                }

                if call_try_create_activity_api(biz_runner_username, "manage_markup_buy_contract", activity_params, dry_run, log):
                    log.info(f"    Successfully initiated 'manage_markup_buy_contract' for {new_contract_id} (Rank {rank}, Score: {source_info['score']:.2f}).")
                    total_new_contracts_created += 1
                    contracts_this_resource_created +=1
                else:
                    log.error(f"    {LogColors.FAIL}Failed to initiate 'manage_markup_buy_contract' for {new_contract_id}.{LogColors.ENDC}")

            if contracts_this_resource_created < 3 and contracts_this_resource_created > 0:
                 log.info(f"{LogColors.OKBLUE}  Only initiated {contracts_this_resource_created} markup_buy contracts for {resource_type_needed} for {biz_building_id} (fewer than 3 sources available).{LogColors.ENDC}")
            elif contracts_this_resource_created == 0 and potential_source_contracts : # Had potential sources but failed to create any
                 log.warning(f"{LogColors.WARNING}  No markup_buy contracts were created for {resource_type_needed} for {biz_building_id} despite potential sources.{LogColors.ENDC}")


    log.info(f"{LogColors.OKGREEN}Automated Markup Buys process finished.{LogColors.ENDC}")
    log.info(f"{LogColors.OKBLUE}Total old 'markup_buy' contracts deleted/simulated deleted: {total_old_contracts_deleted}{LogColors.ENDC}")
    log.info(f"{LogColors.OKBLUE}Total new 'markup_buy' contracts created/simulated created: {total_new_contracts_created}{LogColors.ENDC}")

# --- Main Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automate creation of 'markup_buy' contracts for business buildings.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to Airtable."
    )
    args = parser.parse_args()

    process_automated_markup_buys(dry_run=args.dry_run)
