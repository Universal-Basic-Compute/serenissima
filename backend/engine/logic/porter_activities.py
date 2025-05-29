"""
Logic for Porter Guild Hall citizens.
Porters find profitable logistics_service_request contracts and execute them
by fetching resources from public sellers and delivering to the client's building.
"""
import logging
import json
import datetime
import uuid # For activity ID generation if needed by creators directly
import pytz # For timezone calculations if needed by idle activity
from typing import Dict, List, Optional, Any

from backend.engine.utils.activity_helpers import (
    LogColors, _escape_airtable_value, get_building_record,
    get_citizen_record, get_building_storage_details,
    get_path_between_points, get_citizen_effective_carry_capacity,
    get_citizen_current_load, VENICE_TIMEZONE
)
from backend.engine.activity_creators import (
    try_create_fetch_for_logistics_client_activity,
    try_create_idle_activity
)

log = logging.getLogger(__name__)

# Constants
PORTER_IDLE_DURATION_HOURS = 1

def get_least_stored_resource(
    tables: Dict[str, Any],
    client_building_record: Dict[str, Any],
    client_username: str,
    building_type_defs: Dict[str, Any],
    resource_defs: Dict[str, Any]
) -> Optional[str]:
    """
    Determines the resource type that is "least stored" in the client's building.
    Considers resources defined in the building's 'stores' list.
    Returns the resource_id string or None.
    """
    client_building_id = client_building_record['fields'].get('BuildingId')
    client_building_type = client_building_record['fields'].get('Type')
    
    type_def = building_type_defs.get(client_building_type)
    if not type_def or 'productionInformation' not in type_def or 'stores' not in type_def['productionInformation']:
        log.warning(f"Building type {client_building_type} for {client_building_id} has no 'stores' definition. Cannot determine least stored.")
        return None

    storable_resource_ids = type_def['productionInformation']['stores']
    if not storable_resource_ids:
        log.info(f"Building {client_building_id} has an empty 'stores' list. No specific resources to prioritize.")
        return None

    _, current_inventory_map = get_building_storage_details(tables, client_building_id, client_username)

    least_stock_amount = float('inf')
    least_stocked_resource_id = None

    # Prioritize resources the building is designed to store but currently has zero of.
    for res_id in storable_resource_ids:
        if res_id not in resource_defs: # Skip if resource definition is missing
            log.warning(f"Resource definition for '{res_id}' (storable in {client_building_id}) not found. Skipping.")
            continue
        
        current_stock = current_inventory_map.get(res_id, 0.0)
        if current_stock == 0.0:
            log.info(f"Resource {res_id} has 0 stock in {client_building_id}. Prioritizing.")
            return res_id # Found a resource with zero stock from the 'stores' list

    # If all storable resources have some stock, find the one with the minimum stock.
    for res_id in storable_resource_ids:
        if res_id not in resource_defs: continue # Already logged warning above
        
        current_stock = current_inventory_map.get(res_id, 0.0)
        if current_stock < least_stock_amount:
            least_stock_amount = current_stock
            least_stocked_resource_id = res_id
            
    if least_stocked_resource_id:
        log.info(f"Least stored resource in {client_building_id} (from 'stores' list) is {least_stocked_resource_id} with {least_stock_amount:.2f} units.")
    else:
        log.info(f"Could not determine a least stored resource for {client_building_id} from its 'stores' list.")
        
    return least_stocked_resource_id


def process_porter_activity(
    tables: Dict[str, Any],
    porter_citizen_record: Dict[str, Any],
    porter_guild_hall_record: Dict[str, Any],
    resource_defs: Dict[str, Any],
    building_type_defs: Dict[str, Any],
    now_venice_dt: datetime.datetime,
    transport_api_url: str,
    api_base_url: str # For other API calls if needed by helpers
) -> bool:
    """
    Main logic for a Porter Guild Hall operator.
    Finds a logistics_service_request and attempts to fulfill it.
    """
    porter_username = porter_citizen_record['fields'].get('Username')
    porter_custom_id = porter_citizen_record['fields'].get('CitizenId')
    porter_airtable_id = porter_citizen_record['id']
    guild_hall_id = porter_guild_hall_record['fields'].get('BuildingId')

    log.info(f"{LogColors.HEADER}Porter {porter_username} at {guild_hall_id} starting logistics check.{LogColors.ENDC}")

    # 1. Find active logistics_service_request contracts for this Porter Guild Hall
    formula_logistics_contracts = (
        f"AND({{Type}}='logistics_service_request', "
        f"{{Seller}}='{_escape_airtable_value(porter_username)}', "
        f"{{SellerBuilding}}='{_escape_airtable_value(guild_hall_id)}', "
        f"{{Status}}='active', "
        f"IS_BEFORE(NOW(), {{EndAt}}))"
    )
    try:
        active_logistics_contracts = tables['contracts'].all(formula=formula_logistics_contracts, sort=[('-Priority', 'desc'), ('CreatedAt', 'asc')])
    except Exception as e:
        log.error(f"Error fetching logistics contracts for Porter {porter_username}: {e}")
        return False # Error in fetching, don't create idle yet, maybe retry later

    if not active_logistics_contracts:
        log.info(f"No active logistics_service_request contracts for Porter {porter_username} at {guild_hall_id}.")
        # Create idle activity if no contracts
        idle_end_time_iso = (now_venice_dt + datetime.timedelta(hours=PORTER_IDLE_DURATION_HOURS)).astimezone(pytz.UTC).isoformat()
        try_create_idle_activity(tables, porter_custom_id, porter_username, porter_airtable_id, end_date_iso=idle_end_time_iso, reason_message="No active logistics contracts.")
        return True # Idle activity created or attempted

    log.info(f"Found {len(active_logistics_contracts)} active logistics contracts for Porter {porter_username}.")

    # 2. Iterate through contracts to find a fulfillable one
    for logistics_contract in active_logistics_contracts:
        logistics_contract_custom_id = logistics_contract['fields'].get('ContractId', logistics_contract['id'])
        client_username = logistics_contract['fields'].get('Buyer')
        client_target_building_id = logistics_contract['fields'].get('BuyerBuilding')
        service_fee = float(logistics_contract['fields'].get('ServiceFeePerUnit', 0.0))

        if not client_username or not client_target_building_id or service_fee <= 0:
            log.warning(f"Logistics contract {logistics_contract_custom_id} has invalid data. Skipping.")
            continue

        log.info(f"Evaluating logistics contract {logistics_contract_custom_id} for client {client_username}, target building {client_target_building_id}.")

        client_target_building_record = get_building_record(tables, client_target_building_id)
        if not client_target_building_record:
            log.warning(f"Client's target building {client_target_building_id} not found. Skipping contract {logistics_contract_custom_id}.")
            continue

        # 3. Determine resource to fetch (least stored in client's target building)
        resource_to_fetch_id = get_least_stored_resource(tables, client_target_building_record, client_username, building_type_defs, resource_defs)
        if not resource_to_fetch_id:
            log.info(f"Could not determine a resource to fetch for client building {client_target_building_id}. Skipping contract {logistics_contract_custom_id}.")
            continue
        
        log.info(f"Determined resource to fetch for {client_target_building_id}: {resource_to_fetch_id}.")

        # 4. Find a public_sell contract for this resource
        #    Score by price and distance (Porter is at Guild Hall initially)
        public_sell_formula = f"AND({{Type}}='public_sell', {{ResourceType}}='{_escape_airtable_value(resource_to_fetch_id)}', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}), {{TargetAmount}} > 0)"
        try:
            available_sell_contracts = tables['contracts'].all(formula=public_sell_formula)
        except Exception as e:
            log.error(f"Error fetching public_sell contracts for {resource_to_fetch_id}: {e}")
            continue # Try next logistics contract

        if not available_sell_contracts:
            log.info(f"No public_sell contracts found for resource {resource_to_fetch_id}. Skipping for contract {logistics_contract_custom_id}.")
            continue

        best_source_contract = None
        best_score = float('inf')
        path_to_best_source = None # Path from Guild Hall to source
        
        porter_current_pos_record = get_building_record(tables, guild_hall_id) # Porter starts at Guild Hall
        porter_current_pos_str = porter_current_pos_record['fields'].get('Position') if porter_current_pos_record else None
        porter_current_pos = json.loads(porter_current_pos_str) if porter_current_pos_str else None


        for sell_contract in available_sell_contracts:
            source_building_id = sell_contract['fields'].get('SellerBuilding')
            price = float(sell_contract['fields'].get('PricePerResource', float('inf')))
            
            source_building_record = get_building_record(tables, source_building_id)
            if not source_building_record or not porter_current_pos: continue

            source_pos_str = source_building_record['fields'].get('Position')
            if not source_pos_str: continue
            source_pos = json.loads(source_pos_str)

            # Simple scoring: price. Distance can be complex if pathfinding for each.
            # For now, let's just use price. A better score would include path cost/time.
            # Pathfinding from Guild Hall to Source
            current_path_to_source = get_path_between_points(porter_current_pos, source_pos, transport_api_url)
            if not (current_path_to_source and current_path_to_source.get('success')):
                log.warning(f"Could not find path from Guild Hall {guild_hall_id} to source {source_building_id}. Skipping this source.")
                continue
            
            # Duration in hours for scoring, default to 1 hour if not available
            duration_seconds = current_path_to_source.get('timing', {}).get('durationSeconds', 3600)
            duration_hours = duration_seconds / 3600.0
            
            # Score: lower is better. Considers price and time to reach source.
            # Adjust score to prefer closer sources if prices are similar.
            score = price + (duration_hours * 5) # Arbitrary time cost factor

            if score < best_score:
                best_score = score
                best_source_contract = sell_contract
                path_to_best_source = current_path_to_source
        
        if not best_source_contract or not path_to_best_source:
            log.info(f"No suitable public_sell contract found (or path failed) for {resource_to_fetch_id} for contract {logistics_contract_custom_id}.")
            continue # Try next logistics contract

        # 5. Calculate amount to fetch
        porter_max_carry = get_citizen_effective_carry_capacity(porter_citizen_record)
        # Porter is at Guild Hall, assumed empty inventory for this task
        porter_remaining_carry = porter_max_carry 
        
        amount_available_at_source = float(best_source_contract['fields'].get('TargetAmount', 0.0))
        
        # Client funds check
        client_record = get_citizen_record(tables, client_username)
        if not client_record:
            log.warning(f"Client {client_username} for contract {logistics_contract_custom_id} not found. Skipping.")
            continue
        client_ducats = float(client_record['fields'].get('Ducats', 0.0))
        price_of_goods = float(best_source_contract['fields'].get('PricePerResource', float('inf')))
        
        max_affordable_by_client = client_ducats / price_of_goods if price_of_goods > 0 else float('inf')

        amount_to_fetch = min(porter_remaining_carry, amount_available_at_source, max_affordable_by_client)
        amount_to_fetch = float(f"{amount_to_fetch:.4f}")


        if amount_to_fetch < 0.1: # Minimum practical amount
            log.info(f"Calculated amount to fetch for {resource_to_fetch_id} is too small ({amount_to_fetch:.2f}). Skipping for contract {logistics_contract_custom_id}.")
            continue

        # 6. Create 'fetch_for_logistics_client' activity
        # The path needs to be: Porter (GuildHall) -> Source -> Client Target Building
        # path_to_best_source is GuildHall -> Source.
        # We need Source -> Client Target Building.
        
        source_building_id_for_path = best_source_contract['fields'].get('SellerBuilding')
        source_building_rec_for_path = get_building_record(tables, source_building_id_for_path)
        source_pos_for_path_str = source_building_rec_for_path['fields'].get('Position') if source_building_rec_for_path else None
        source_pos_for_path = json.loads(source_pos_for_path_str) if source_pos_for_path_str else None
        
        client_target_pos_str = client_target_building_record['fields'].get('Position')
        client_target_pos = json.loads(client_target_pos_str) if client_target_pos_str else None

        if not source_pos_for_path or not client_target_pos:
            log.warning(f"Missing position data for source or client target building. Cannot create full path. Skipping contract {logistics_contract_custom_id}.")
            continue

        path_source_to_client = get_path_between_points(source_pos_for_path, client_target_pos, transport_api_url)
        if not (path_source_to_client and path_source_to_client.get('success')):
            log.warning(f"Could not find path from source {source_building_id_for_path} to client target {client_target_building_id}. Skipping contract {logistics_contract_custom_id}.")
            continue
            
        # Combine paths and timings
        full_path_points = path_to_best_source['path'] + path_source_to_client['path'][1:] # Avoid duplicating source point
        total_duration_seconds = path_to_best_source['timing']['durationSeconds'] + path_source_to_client['timing']['durationSeconds']
        
        # StartDate is from path_to_best_source (porter leaving guild hall)
        # EndDate needs to be calculated based on total_duration_seconds
        start_date_dt = datetime.datetime.fromisoformat(path_to_best_source['timing']['startDate'].replace("Z", "+00:00"))
        full_trip_end_date_dt = start_date_dt + datetime.timedelta(seconds=total_duration_seconds)

        full_path_data = {
            "path": full_path_points,
            "timing": {
                "startDate": path_to_best_source['timing']['startDate'],
                "endDate": full_trip_end_date_dt.isoformat(),
                "durationSeconds": total_duration_seconds
            },
            "transporter": path_to_best_source.get('transporter') # Assume transporter is consistent or primarily for first leg
        }

        activity_created = try_create_fetch_for_logistics_client_activity(
            tables=tables,
            porter_citizen_custom_id=porter_custom_id,
            porter_username=porter_username,
            source_building_custom_id=best_source_contract['fields'].get('SellerBuilding'),
            public_sell_contract_custom_id=best_source_contract['fields'].get('ContractId', best_source_contract['id']), # Utiliser ContractId personnalisé
            client_target_building_custom_id=client_target_building_id,
            logistics_service_contract_custom_id=logistics_contract_custom_id,
            ultimate_buyer_username=client_username,
            service_fee_per_unit=service_fee,
            resource_to_fetch_id=resource_to_fetch_id,
            amount_to_fetch=amount_to_fetch,
            path_data=full_path_data,
            current_time_venice=now_venice_dt # current_time_venice is start of this whole process
        )

        if activity_created:
            log.info(f"{LogColors.OKGREEN}Porter {porter_username} assigned 'fetch_for_logistics_client' for contract {logistics_contract_custom_id}.{LogColors.ENDC}")
            return True # Successfully created an activity for this porter

    # If loop finishes without creating an activity for any contract
    log.info(f"Porter {porter_username} could not find a suitable logistics task this cycle.")
    idle_end_time_iso = (now_venice_dt + datetime.timedelta(hours=PORTER_IDLE_DURATION_HOURS)).astimezone(pytz.UTC).isoformat()
    try_create_idle_activity(tables, porter_custom_id, porter_username, porter_airtable_id, end_date_iso=idle_end_time_iso, reason_message="No suitable logistics task found after checking all contracts.")
    return True
