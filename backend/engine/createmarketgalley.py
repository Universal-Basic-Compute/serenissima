#!/usr/bin/env python3
"""
Create Market Galley script for La Serenissima.

This script creates a new merchant_galley, populates it with random resources
(optionally filtered by category), creates public_sell contracts for these resources,
and then creates a delivery activity for a Forestieri to pilot the galley to a public dock.
"""

import os
import sys
import argparse
import json
import logging
import random
import uuid
import math
from datetime import datetime, timedelta, timezone # Added timezone for timezone.utc
import pytz
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
from typing import Dict, List, Optional, Any

# Add project root to sys.path for consistent imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import utility functions from activity_helpers
from backend.engine.utils.activity_helpers import (
    LogColors,
    log_header, # Import log_header
    VENICE_TIMEZONE,
    _escape_airtable_value,
    get_resource_types_from_api,
    get_building_types_from_api, # For galley capacity
    calculate_haversine_distance_meters,
    get_citizen_record # For checking merchant/forestiero validity
)
# Import the specific activity creator
from backend.engine.activity_creators.deliver_resource_batch_activity_creator import try_create as try_create_deliver_resource_batch_activity


# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("create_market_galley")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

DEFAULT_RESOURCE_MIN_AMOUNT = 50
DEFAULT_RESOURCE_MAX_AMOUNT = 200
DEFAULT_PRICE_MARKUP_FACTOR = 1.15 # 15% markup over importPrice
GALLEY_DEPARTURE_BASE_LAT = 45.40 + 0.01
GALLEY_DEPARTURE_BASE_LNG = 12.45 - 0.02
GALLEY_PROXIMITY_THRESHOLD_METERS = 100 # Min distance between new galley and existing ones

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    if not api_key or not base_id:
        log.error(f"{LogColors.FAIL}Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID.{LogColors.ENDC}")
        return None
    try:
        api = Api(api_key)
        tables = {
            'contracts': api.table(base_id, 'CONTRACTS'),
            'resources': api.table(base_id, 'RESOURCES'),
            'citizens': api.table(base_id, 'CITIZENS'),
            'buildings': api.table(base_id, 'BUILDINGS'),
            'activities': api.table(base_id, 'ACTIVITIES'),
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection successful.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

def get_polygons_data() -> Optional[Dict]:
    """Fetches polygon data from the /api/get-polygons endpoint."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        url = f"{api_base_url}/api/get-polygons"
        log.info(f"Fetching polygon data from API: {url}")
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            polygons_list = data.get("polygons")
            if isinstance(polygons_list, list):
                return {poly.get('id'): poly for poly in polygons_list if poly and poly.get('id')}
            log.warning(f"Polygons data from API is not a list. Type: {type(polygons_list)}")
            return {}
        log.error(f"API error fetching polygons: {data.get('error', 'Unknown error')}")
        return None
    except Exception as e:
        log.error(f"Exception fetching polygon data: {e}")
        return None

def get_public_docks(tables: Dict[str, Table]) -> List[Dict]:
    """Fetches all buildings of type 'public_dock'."""
    try:
        return tables['buildings'].all(formula="{Type} = 'public_dock'")
    except Exception as e:
        log.error(f"Error fetching public_docks: {e}")
        return []

def get_dock_canal_point_data(dock_record: Dict, polygons_data: Dict) -> Optional[Dict]:
    """Extracts the full canalPoint object for a given dock using polygon data."""
    if not dock_record or not polygons_data: return None
    dock_building_id = dock_record['fields'].get('BuildingId')
    dock_land_id = dock_record['fields'].get('LandId')
    if not dock_building_id or not dock_land_id: return None
    land_polygon_data = polygons_data.get(dock_land_id)
    if not land_polygon_data: return None
    canal_points_list = land_polygon_data.get('canalPoints', [])
    if isinstance(canal_points_list, list):
        for point_data in canal_points_list:
            if isinstance(point_data, dict) and point_data.get('id') == dock_building_id:
                if (isinstance(point_data.get('edge'), dict) and 'lat' in point_data['edge'] and
                    isinstance(point_data.get('water'), dict) and 'lat' in point_data['water']):
                    return point_data
    return None

def get_existing_merchant_galleys(tables: Dict[str, Table]) -> List[Dict]:
    """Fetches all existing merchant_galley buildings and their positions."""
    try:
        return tables['buildings'].all(formula="{Type} = 'merchant_galley'", fields=["BuildingId", "Position"])
    except Exception as e:
        log.error(f"Error fetching existing merchant_galleys: {e}")
        return []

def select_galley_merchant(tables: Dict[str, Table]) -> Optional[Dict]:
    """Selects an available AI merchant (Forestieri, Ducats > 1M) for the galley."""
    try:
        formula = "AND({SocialClass}='Forestieri', {Ducats}>1000000, {IsAI}=1)"
        potential_merchants = tables['citizens'].all(formula=formula)
        if not potential_merchants:
            log.warning("No suitable AI merchants (Forestieri, Ducats > 1M) found for galley.")
            return None
        selected_merchant = random.choice(potential_merchants)
        log.info(f"Selected merchant {selected_merchant['fields'].get('Username')} for market galley.")
        return selected_merchant
    except Exception as e:
        log.error(f"Error selecting galley merchant: {e}")
        return None

def create_or_get_merchant_galley(
    tables: Dict[str, Table],
    galley_building_id: str,
    dock_canal_point: Dict[str, Any],
    merchant_username: str,
    current_venice_time: datetime,
    args: argparse.Namespace, # Added args
    dry_run: bool = False
) -> Optional[Dict]:
    """Creates or gets the temporary merchant galley building."""
    formula = f"{{BuildingId}} = '{_escape_airtable_value(galley_building_id)}'"
    try:
        existing_galleys = tables['buildings'].all(formula=formula, max_records=1)
        if existing_galleys:
            return existing_galleys[0]

        point_occupancy_formula = f"{{Point}} = '{_escape_airtable_value(galley_building_id)}'"
        if tables['buildings'].all(formula=point_occupancy_formula, max_records=1):
            log.warning(f"Point '{galley_building_id}' is already occupied. Cannot create galley.")
            return None

        water_coords = dock_canal_point.get('water', {})
        position_coords = {'lat': float(water_coords.get('lat',0)), 'lng': float(water_coords.get('lng',0))}
        rotation_rad = 0.0
        edge_coords = dock_canal_point.get('edge')
        if edge_coords and water_coords:
            try:
                delta_y = float(water_coords['lat']) - float(edge_coords['lat'])
                delta_x = float(water_coords['lng']) - float(edge_coords['lng'])
                if not (delta_x == 0 and delta_y == 0):
                    rotation_rad = math.atan2(delta_y, delta_x) + (math.pi / 2)
            except Exception: pass

        galley_name_suffix = "Market Galley"
        galley_subcategory = "retail_goods" # Default
        if args.food:
            galley_name_suffix = "Food Galley"
            galley_subcategory = "retail_food"
        elif args.goods:
            galley_name_suffix = "Goods Galley"
            galley_subcategory = "retail_goods"
        elif args.construction:
            galley_name_suffix = "Construction Galley"
            galley_subcategory = "wholesale_construction" # Or a suitable existing one like "industrial_goods"

        galley_name = f"Floating Market - {galley_name_suffix} ({merchant_username})"

        if dry_run:
            log.info(f"[DRY RUN] Would create merchant_galley: {galley_building_id} (Name: {galley_name}, SubCategory: {galley_subcategory}) at {position_coords}")
            return {"id": "dry_run_galley_id", "fields": {"BuildingId": galley_building_id, "Type": "merchant_galley", "Name": galley_name, "SubCategory": galley_subcategory}}

        payload = {
            "BuildingId": galley_building_id, "Type": "merchant_galley",
            "Name": galley_name,
            "Owner": merchant_username, "RunBy": merchant_username, "Occupant": merchant_username,
            "Point": galley_building_id, "Position": json.dumps(position_coords), "Rotation": rotation_rad,
            "Category": "business", "SubCategory": galley_subcategory,
            "CreatedAt": current_venice_time.isoformat(),
            "IsConstructed": False, "ConstructionDate": None, # Will be set by activity EndDate
            "ConstructionMinutesRemaining": 0,
        }
        created_galley = tables['buildings'].create(payload)
        log.info(f"Created new merchant_galley: {galley_building_id} (Name: {galley_name}, SubCategory: {galley_subcategory}, ID: {created_galley['id']})")
        return created_galley
    except Exception as e:
        log.error(f"Error creating/getting merchant_galley {galley_building_id}: {e}")
        return None

def select_delivery_forestiero(tables: Dict[str, Table]) -> Optional[Dict]:
    """Selects an available AI Forestieri citizen not currently in Venice for delivery."""
    try:
        formula = "AND({SocialClass}='Forestieri', {IsAI}=1, OR({InVenice}=FALSE(), {InVenice}=BLANK()))"
        potential_citizens = tables['citizens'].all(formula=formula)
        if not potential_citizens:
            log.warning("No suitable AI Forestieri (not in Venice) found for delivery task.")
            return None
        selected_citizen = random.choice(potential_citizens)
        log.info(f"Selected Forestieri {selected_citizen['fields'].get('Username')} for galley delivery.")
        return selected_citizen
    except Exception as e:
        log.error(f"Error selecting delivery Forestieri: {e}")
        return None

def create_galley_delivery_activity(
    tables: Dict[str, Table],
    delivery_citizen_username: str,
    galley_building_id: str, # Custom ID of the galley
    galley_manifest_for_activity: List[Dict[str, Any]], # [{"ResourceId": ..., "Amount": ...}]
    current_venice_time: datetime,
    start_position_override: Dict[str, float], # Randomized sea point
    galley_target_dock_point_str: str # The Point string of the galley (water_lat_lng_var)
) -> Optional[Dict]:
    """Creates the deliver_resource_batch activity for the galley using the new creator."""
    try:
        galley_building_record_list = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(galley_building_id)}'", max_records=1)
        if not galley_building_record_list:
            log.error(f"Galley building {galley_building_id} not found for activity.")
            return None
        galley_building_record = galley_building_record_list[0]

        end_position_str = galley_building_record['fields'].get('Position')
        if not end_position_str:
            log.error(f"Galley {galley_building_id} has no Position field.")
            return None
        end_position = json.loads(end_position_str)

        path_data = None
        try:
            api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
            url = f"{api_base_url}/api/transport"
            response = requests.post(
                url,
                json={
                    "startPoint": start_position_override, "endPoint": end_position,
                    "startDate": current_venice_time.isoformat(), "pathfindingMode": "water_only"
                }, timeout=15
            )
            response.raise_for_status()
            path_data = response.json()
            if not path_data.get('success'):
                log.warning(f"Transport API call for galley path was not successful: {path_data.get('error')}")
                path_data = None
        except Exception as e_api:
            log.error(f"Error calling transport API for galley path: {e_api}")

        if not path_data or not path_data.get('path'):
            log.warning(f"Path finding for galley to {galley_building_id} failed. Using simplified path data for creator.")
            # The creator might handle this better or require valid path_data.
            # For now, we'll pass what we have, or a simplified version if pathfinding failed.
            path_data = { # Simplified path_data if API failed
                "path": [start_position_override, end_position],
                "timing": {"startDate": current_venice_time.isoformat(),
                           "endDate": (current_venice_time + timedelta(hours=random.uniform(1.5, 3.0))).isoformat(),
                           "durationSeconds": int(random.uniform(1.5, 3.0) * 3600)
                          },
                "success": False, # Indicate pathfinding might have failed
                "transporter": "merchant_galley" # Default transporter
            }
        
        resource_summary_note = ", ".join([f"{r['Amount']:.0f} {r['ResourceId']}" for r in galley_manifest_for_activity[:3]])
        if len(galley_manifest_for_activity) > 3: resource_summary_note += "..."
        
        notes_for_activity = f"Piloting market galley with various goods ({resource_summary_note}) to dock at {galley_target_dock_point_str}."

        # Convert current_venice_time to UTC for the creator function
        now_utc_dt = current_venice_time.astimezone(timezone.utc)

        activity_record = try_create_deliver_resource_batch_activity(
            tables=tables,
            citizen_username_actor=delivery_citizen_username,
            from_building_custom_id=None, # From sea
            to_building_custom_id=galley_building_id,
            resources_manifest=galley_manifest_for_activity,
            contract_id_ref=galley_building_id, # Using galley's ID as a reference
            transport_mode="merchant_galley",
            path_data=path_data, # Pass the obtained path_data
            current_time_utc=now_utc_dt,
            notes=notes_for_activity,
            priority=9 # Default priority for such deliveries
        )

        if activity_record:
            log.info(f"Created market galley delivery activity: {activity_record['id']} to {galley_building_id} via new creator.")
        return activity_record
    except Exception as e:
        log.error(f"Error in create_galley_delivery_activity (refactored): {e}")
        return None

def main_process_market_galley(args: argparse.Namespace):
    """Main function to create a market galley."""
    log_header(f"Market Galley Creation (dry_run={args.dry_run}, food_only={args.food}, goods_only={args.goods}, construction_only={args.construction}, hour_override={args.hour})", LogColors.HEADER)

    now_venice_dt_real = datetime.now(VENICE_TIMEZONE)
    if args.hour is not None:
        now_venice_dt = now_venice_dt_real.replace(hour=args.hour)
        log.info(f"{LogColors.WARNING}Using FORCED Venice hour: {args.hour}. Effective time: {now_venice_dt.isoformat()}{LogColors.ENDC}")
    else:
        now_venice_dt = now_venice_dt_real

    tables = initialize_airtable()
    if not tables: return

    resource_type_defs = get_resource_types_from_api()
    if not resource_type_defs: log.error("Failed to get resource type definitions."); return

    building_type_defs = get_building_types_from_api()
    if not building_type_defs: log.error("Failed to get building type definitions."); return

    polygons_data = get_polygons_data()
    if not polygons_data: log.error("Failed to get polygon data."); return

    available_public_docks = get_public_docks(tables)
    if not available_public_docks: log.error("No public_docks found."); return
    random.shuffle(available_public_docks)

    # Filter resources
    candidate_resources = []
    construction_material_ids = [
        "stone", "limestone", "marble", "cut_stone", 
        "clay", "bricks", 
        "mortar", 
        "building_materials", 
        "timber"
    ]

    for res_id, res_def in resource_type_defs.items():
        if args.food:
            if res_def.get('subCategory', '').lower() == 'food':
                candidate_resources.append(res_def)
        elif args.goods:
            # Exclude food and specific construction materials if --goods is chosen alone
            if res_def.get('category', '').lower() != 'food' and res_id not in construction_material_ids:
                candidate_resources.append(res_def)
        elif args.construction:
            if res_id in construction_material_ids:
                candidate_resources.append(res_def)
        else: # No filter, consider all (original behavior)
            candidate_resources.append(res_def)

    if not candidate_resources:
        log.warning("No candidate resources found after filtering. Exiting.")
        return

    # Select merchant for the galley
    galley_merchant_record = select_galley_merchant(tables)
    if not galley_merchant_record: log.error("No suitable merchant found for the galley."); return
    galley_merchant_username = galley_merchant_record['fields']['Username']

    # Select a dock and create galley
    existing_galleys = get_existing_merchant_galleys(tables)
    existing_galley_positions = [json.loads(g['fields']['Position']) for g in existing_galleys if g['fields'].get('Position')]

    selected_dock_record = None
    selected_dock_canal_point = None
    galley_building_id_counter = int(datetime.now().timestamp()) % 1000 # Simple variation counter

    for dock_attempt in range(len(available_public_docks) * 2): # Try each dock, then try again with new counter
        candidate_dock = available_public_docks[dock_attempt % len(available_public_docks)]
        temp_canal_point = get_dock_canal_point_data(candidate_dock, polygons_data)
        if not temp_canal_point or not temp_canal_point.get('water'): continue

        is_too_close = any(
            calculate_haversine_distance_meters(
                float(temp_canal_point['water']['lat']), float(temp_canal_point['water']['lng']),
                float(ex_g_pos['lat']), float(ex_g_pos['lng'])
            ) < GALLEY_PROXIMITY_THRESHOLD_METERS
            for ex_g_pos in existing_galley_positions
        )
        if not is_too_close:
            selected_dock_record = candidate_dock
            selected_dock_canal_point = temp_canal_point
            break
        if dock_attempt >= len(available_public_docks) -1: # After trying all docks once
            galley_building_id_counter +=1 # Increment counter if all were too close, try again
            log.info(f"All docks too close, incrementing galley ID counter to {galley_building_id_counter} and retrying dock selection.")


    if not selected_dock_record or not selected_dock_canal_point:
        log.error("Could not find a suitable dock (not too close to existing galleys)."); return

    galley_water_coords = selected_dock_canal_point['water']
    market_galley_id = f"marketgalley_{galley_water_coords['lat']}_{galley_water_coords['lng']}_{galley_building_id_counter}"

    market_galley_building = create_or_get_merchant_galley(tables, market_galley_id, selected_dock_canal_point, galley_merchant_username, now_venice_dt, args, args.dry_run)
    if not market_galley_building: log.error(f"Failed to create market galley {market_galley_id}."); return

    # Populate galley
    galley_capacity = float(building_type_defs.get("merchant_galley", {}).get("productionInformation", {}).get("storageCapacity", 1000.0))
    current_galley_load = 0.0
    galley_manifest_resources = [] # For activity
    created_contracts_count = 0

    random.shuffle(candidate_resources) # Shuffle to get varied resources if capacity is limited

    for res_def in candidate_resources:
        if current_galley_load >= galley_capacity: break
        res_id = res_def['id']
        res_name = res_def.get('name', res_id)
        res_import_price = float(res_def.get('importPrice', 0))
        if res_import_price <= 0:
            log.warning(f"Resource {res_name} has no valid import price. Skipping for market galley.")
            continue

        amount_to_add = random.randint(DEFAULT_RESOURCE_MIN_AMOUNT, DEFAULT_RESOURCE_MAX_AMOUNT)
        if current_galley_load + amount_to_add > galley_capacity:
            amount_to_add = galley_capacity - current_galley_load
        if amount_to_add < 1: continue # Don't add tiny amounts

        galley_manifest_resources.append({"ResourceId": res_id, "Amount": float(amount_to_add)})
        current_galley_load += amount_to_add

        if not args.dry_run:
            try:
                resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}", "Type": res_id, "Name": res_name,
                    "Asset": market_galley_id, "AssetType": "building", "Owner": galley_merchant_username,
                    "Count": float(amount_to_add), "CreatedAt": now_venice_dt.isoformat()
                }
                tables['resources'].create(resource_payload)
                log.info(f"Added {amount_to_add} of {res_name} to market galley {market_galley_id}.")

                # Create public_sell contract
                contract_price = round(res_import_price * DEFAULT_PRICE_MARKUP_FACTOR, 2)
                public_sell_contract_id = f"contract-public-sell-{galley_merchant_username}-{market_galley_id}-{res_id}"
                contract_payload = {
                    "ContractId": public_sell_contract_id, "Type": "public_sell",
                    "Seller": galley_merchant_username, "Buyer": "public",
                    "ResourceType": res_id, "SellerBuilding": market_galley_id,
                    "TargetAmount": float(amount_to_add), "PricePerResource": contract_price,
                    "Status": "active", "Priority": 5,
                    "CreatedAt": now_venice_dt.isoformat(),
                    "EndAt": (now_venice_dt + timedelta(days=7)).isoformat(),
                    "Notes": json.dumps({"reasoning": "Market Galley initial stock.", "created_by_script": "createmarketgalley.py"})
                }
                tables['contracts'].create(contract_payload)
                log.info(f"Created public_sell contract {public_sell_contract_id} for {res_name} at {contract_price} Ducats.")
                created_contracts_count += 1
            except Exception as e:
                log.error(f"Error processing resource {res_name} or its contract for galley: {e}")
        else:
            log.info(f"[DRY RUN] Would add {amount_to_add} of {res_name} to market galley {market_galley_id}.")
            contract_price = round(res_import_price * DEFAULT_PRICE_MARKUP_FACTOR, 2)
            log.info(f"[DRY RUN] Would create public_sell contract for {res_name} at {contract_price} Ducats.")
            created_contracts_count +=1


    if not galley_manifest_resources:
        log.warning("No resources added to the market galley. Exiting.")
        # Consider deleting the empty galley if created, or handle this state.
        return

    # Create delivery activity
    delivery_forestiero_record = select_delivery_forestiero(tables)
    if not delivery_forestiero_record: log.error("No Forestieri found to pilot the market galley."); return
    delivery_forestiero_username = delivery_forestiero_record['fields']['Username']

    if not args.dry_run:
        try:
            tables['citizens'].update(delivery_forestiero_record['id'], {"InVenice": True})
        except Exception as e: log.error(f"Failed to set InVenice for {delivery_forestiero_username}: {e}")

    departure_point = {
        "lat": round(GALLEY_DEPARTURE_BASE_LAT + random.uniform(-0.015, 0.015), 6),
        "lng": round(GALLEY_DEPARTURE_BASE_LNG + random.uniform(-0.025, 0.025), 6)
    }

    delivery_activity = create_galley_delivery_activity(
        tables, delivery_forestiero_username, market_galley_id, galley_manifest_resources,
        now_venice_dt, departure_point, market_galley_id # market_galley_id is also its Point string
    )

    if delivery_activity and not args.dry_run:
        arrival_time_iso = delivery_activity['fields'].get('EndDate')
        if arrival_time_iso:
            try:
                tables['buildings'].update(market_galley_building['id'], {"ConstructionDate": arrival_time_iso})
                log.info(f"Updated market galley {market_galley_id} with arrival time: {arrival_time_iso}")
            except Exception as e:
                log.error(f"Error updating market galley {market_galley_id} with arrival time: {e}")
    elif args.dry_run and delivery_forestiero_record: # Simulate activity creation for log
         log.info(f"[DRY RUN] Would create delivery activity for {delivery_forestiero_username} to pilot galley {market_galley_id}.")
         log.info(f"[DRY RUN] Galley manifest for activity: {len(galley_manifest_resources)} items, total load {current_galley_load:.2f}.")


    log.info(f"{LogColors.OKGREEN}Market Galley Creation process finished. Galley ID: {market_galley_id}. Resources added: {len(galley_manifest_resources)}. Contracts created: {created_contracts_count}.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a market galley with random resources and public_sell contracts.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without making Airtable changes.")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging.")
    parser.add_argument("--food", action="store_true", help="Only include food resources (subCategory 'food').")
    parser.add_argument("--goods", action="store_true", help="Only include non-food, non-construction resources.")
    parser.add_argument("--construction", action="store_true", help="Only include specified construction materials.")
    parser.add_argument("--hour", type=int, choices=range(24), metavar="[0-23]", help="Force current hour in Venice time (0-23).")

    args = parser.parse_args()

    active_mode_flags = sum([args.food, args.goods, args.construction])
    if active_mode_flags > 1:
        log.error("Cannot use --food, --goods, and --construction simultaneously. Choose one or none (for all resources).")
        sys.exit(1)

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    else:
        logging.getLogger().setLevel(logging.INFO)

    main_process_market_galley(args)
