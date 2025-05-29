import logging
import json # Ajout de l'import manquant
import requests # Ajout de l'import requests
from typing import Dict, Any, List, Optional
from pyairtable import Table # pyright: ignore [reportMissingTypeStubs]

# Importation des types et fonctions nécessaires
from backend.engine.utils.activity_helpers import get_building_type_info # Importation ajoutée
# from backend.engine.activity_creators import ...

log = logging.getLogger(__name__)

# Import LogColors from the central utility
from backend.engine.utils.activity_helpers import LogColors

def handle_construction_worker_activity(
    tables: Dict[str, Table],
    citizen_record: Dict[str, Any],
    workplace_record: Dict[str, Any], # Le bâtiment de type "construction" où travaille le citoyen
    building_type_defs: Dict[str, Any], # Définitions globales des types de bâtiments
    resource_defs: Dict[str, Any], # Définitions globales des types de ressources
    now_venice_dt: Any, # datetime.datetime object
    now_utc_dt: Any, # datetime.datetime object
    transport_api_url: str,
    api_base_url: str
) -> bool:
    """
    Gère la logique d'activité pour un citoyen travaillant dans un bâtiment de construction.
    Retourne True si une activité a été créée, False sinon.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_id = citizen_record['id']
    citizen_position_str = citizen_record['fields'].get('Position')
    citizen_position = json.loads(citizen_position_str) if citizen_position_str else None
    
    workplace_custom_id = workplace_record['fields'].get('BuildingId')
    workplace_operator_username = workplace_record['fields'].get('RunBy') or workplace_record['fields'].get('Owner')
    workplace_position_str = workplace_record['fields'].get('Position', '{}') # Get as string
    workplace_position = json.loads(workplace_position_str) # Parse

    # Import necessary helpers and creators locally to avoid circular dependencies at module level
    from backend.engine.utils.activity_helpers import (
        get_building_record, get_path_between_points,
        _escape_airtable_value, get_citizen_current_load, CITIZEN_CARRY_CAPACITY,
        update_resource_count,
        _calculate_distance_meters,
        get_building_storage_details,
        _get_building_position_coords, # Added missing import
        get_citizen_contracts,         # Added missing import
        _has_recent_failed_activity_for_contract, # Added missing import
        get_citizen_record             # Added missing import
    )
    from backend.engine.activity_creators import (
        try_create_deliver_construction_materials_activity, 
        try_create_construct_building_activity, 
        try_create_resource_fetching_activity, 
        try_create_idle_activity,
        try_create_goto_work_activity # Added missing import
    )
    import datetime # Ensure datetime is available

    log.info(f"{LogColors.OKCYAN}Construction worker {citizen_username} at {workplace_custom_id} (Op: {workplace_operator_username}). Evaluating tasks.{LogColors.ENDC}")

    # --- Helper function for processing active construction contracts ---
    def _try_process_active_construction_contracts() -> bool:
        construction_contracts_formula = f"AND({{Type}}='construction_project', {{SellerBuilding}}='{_escape_airtable_value(workplace_custom_id)}', {{Status}}!='completed', {{Status}}!='failed')"
        active_construction_contracts = tables['contracts'].all(formula=construction_contracts_formula, sort=['CreatedAt'])

        if not active_construction_contracts:
            log.info(f"No active construction contracts for {workplace_custom_id}.")
        else:
            log.info(f"Found {len(active_construction_contracts)} active construction contracts for {workplace_custom_id}.")

        for contract in active_construction_contracts:
            contract_id_airtable = contract['id']
            contract_custom_id = contract['fields'].get('ContractId', contract_id_airtable)
            target_building_custom_id = contract['fields'].get('BuyerBuilding')
            log.info(f"  Processing contract {contract_custom_id} for target building {target_building_custom_id}.")

            target_building_record = get_building_record(tables, target_building_custom_id)
            if not target_building_record:
                log.warning(f"    Target building {target_building_custom_id} for contract {contract_custom_id} not found. Skipping contract.")
                continue
            
            if target_building_record['fields'].get('IsConstructed'):
                log.info(f"    Target building {target_building_custom_id} is already constructed. Marking contract {contract_custom_id} as completed if not already.")
                if contract['fields'].get('Status') != 'completed':
                    tables['contracts'].update(contract_id_airtable, {'Status': 'completed'})
                continue

            target_building_type_str = target_building_record['fields'].get('Type')
            target_building_def = get_building_type_info(target_building_type_str, building_type_defs)
            if not target_building_def:
                log.error(f"    Could not get building definition for target type {target_building_type_str} from pre-fetched definitions. Skipping contract {contract_custom_id}.")
                continue

            construction_costs_dict = {}
            try:
                resources_url = f"{api_base_url}/api/building-resources/{target_building_custom_id}"
                log.info(f"    Fetching construction costs from: {resources_url}")
                response = requests.get(resources_url, timeout=10)
                response.raise_for_status()
                building_resources_data = response.json()
                if building_resources_data.get("success") and building_resources_data.get("constructionCosts"):
                    construction_costs_dict = building_resources_data["constructionCosts"]
                    log.info(f"    Successfully fetched construction costs for {target_building_custom_id}: {construction_costs_dict}")
                else:
                    log.error(f"    Failed to fetch construction costs from API or 'constructionCosts' field missing for {target_building_custom_id}. Response: {building_resources_data}")
            except requests.exceptions.RequestException as e_req:
                log.error(f"    RequestException fetching construction costs for {target_building_custom_id}: {e_req}")
            except json.JSONDecodeError as e_json:
                log.error(f"    JSONDecodeError parsing construction costs for {target_building_custom_id}: {e_json}")
            except Exception as e_costs:
                log.error(f"    Unexpected error fetching construction costs for {target_building_custom_id}: {e_costs}")
            
            if not construction_costs_dict:
                log.warning(f"    Construction costs for {target_building_custom_id} are empty or could not be fetched. Assuming no material costs. This might be an error.")

            required_materials = {k: v for k, v in construction_costs_dict.items() if k != 'ducats'}
            log.info(f"    Contract {contract_custom_id}: Required materials for {target_building_type_str} (from API): {required_materials}")
            
            target_building_owner_username = contract['fields'].get('Buyer')
            if not target_building_owner_username:
                log.warning(f"    Contract {contract_custom_id} is missing Buyer (owner of target site). Cannot determine site inventory owner. Skipping.")
                continue
            _, site_inventory = get_building_storage_details(tables, target_building_custom_id, target_building_owner_username)
            log.info(f"    Contract {contract_custom_id}: Site inventory at {target_building_custom_id} (Owner: {target_building_owner_username}): {site_inventory}")
            
            materials_to_deliver_to_site: List[Dict[str, Any]] = []
            all_materials_on_site = True

            if not required_materials:
                log.info(f"    Contract {contract_custom_id}: No materials listed in constructionCosts for {target_building_type_str}. Assuming all (zero) materials are on site.")
            else:
                for material, needed_qty_from_def in required_materials.items():
                    needed_qty = float(needed_qty_from_def)
                    on_site_qty = float(site_inventory.get(material, 0.0))
                    
                    log.info(f"      Checking material: {material}. Needed: {needed_qty}, On-site: {on_site_qty}")

                    if on_site_qty < needed_qty:
                        all_materials_on_site = False
                        materials_to_deliver_to_site.append({"type": material, "amount": needed_qty - on_site_qty})
            
            if not all_materials_on_site:
                log.info(f"    Materials needed at site {target_building_custom_id}: {materials_to_deliver_to_site}")
                _, workshop_inventory = get_building_storage_details(tables, workplace_custom_id, workplace_operator_username)
                deliverable_from_workshop: List[Dict[str, Any]] = []
                materials_to_fetch_for_workshop: List[str] = []

                for item_needed_at_site in materials_to_deliver_to_site:
                    mat_type = item_needed_at_site['type']
                    mat_amount_needed_at_site = item_needed_at_site['amount']
                    
                    workshop_has_qty = workshop_inventory.get(mat_type, 0.0)
                    if workshop_has_qty > 0:
                        qty_to_take_from_workshop = min(workshop_has_qty, mat_amount_needed_at_site)
                        deliverable_from_workshop.append({"type": mat_type, "amount": qty_to_take_from_workshop})
                    else:
                        materials_to_fetch_for_workshop.append(mat_type)
                
                if deliverable_from_workshop:
                    log.info(f"    Workshop {workplace_custom_id} has materials to deliver: {deliverable_from_workshop}")
                    citizen_load = get_citizen_current_load(tables, citizen_username)
                    remaining_capacity = CITIZEN_CARRY_CAPACITY - citizen_load
                    actual_resources_to_carry: List[Dict[str, Any]] = []
                    total_volume_to_carry = 0.0

                    for item in deliverable_from_workshop:
                        if remaining_capacity <= 0: break
                        mat_type_to_pickup = item['type']
                        amount_available_in_workshop = item['amount']
                        amount_citizen_can_take_of_this_item = min(amount_available_in_workshop, remaining_capacity)
                        
                        if amount_citizen_can_take_of_this_item > 0:
                            if workshop_inventory.get(mat_type_to_pickup, 0.0) >= amount_citizen_can_take_of_this_item:
                                if not update_resource_count(tables, workplace_custom_id, 'building', workplace_operator_username, mat_type_to_pickup, -amount_citizen_can_take_of_this_item, resource_defs):
                                    log.error(f"      Failed to decrement {mat_type_to_pickup} from workshop {workplace_custom_id}. Skipping.")
                                    continue
                                log.info(f"      Decremented {amount_citizen_can_take_of_this_item:.2f} of {mat_type_to_pickup} from workshop {workplace_custom_id}.")
                            else:
                                log.error(f"      Insufficient stock of {mat_type_to_pickup} in workshop {workplace_custom_id} for pickup. Skipping.")
                                continue

                            if not update_resource_count(tables, citizen_username, 'citizen', workplace_operator_username, mat_type_to_pickup, amount_citizen_can_take_of_this_item, resource_defs, now_iso=now_utc_dt.isoformat()):
                                log.error(f"      Failed to add {mat_type_to_pickup} to citizen {citizen_username}. Skipping.")
                                update_resource_count(tables, workplace_custom_id, 'building', workplace_operator_username, mat_type_to_pickup, amount_citizen_can_take_of_this_item, resource_defs) # Rollback
                                continue
                            log.info(f"      Added {amount_citizen_can_take_of_this_item:.2f} of {mat_type_to_pickup} to citizen {citizen_username}.")
                            
                            actual_resources_to_carry.append({"type": mat_type_to_pickup, "amount": amount_citizen_can_take_of_this_item})
                            remaining_capacity -= amount_citizen_can_take_of_this_item
                            total_volume_to_carry += amount_citizen_can_take_of_this_item
                        
                    if actual_resources_to_carry:
                        log.info(f"    Citizen {citizen_username} will carry {total_volume_to_carry:.2f} units: {actual_resources_to_carry}")
                        target_building_position_str = target_building_record['fields'].get('Position', '{}')
                        target_building_position = json.loads(target_building_position_str)
                        
                        if not citizen_position or not target_building_position:
                            log.warning("    Missing citizen or target building position for delivery. Skipping.")
                            continue
                        
                        path_to_site = get_path_between_points(citizen_position, target_building_position, transport_api_url)
                        if path_to_site and path_to_site.get('success'):
                            if try_create_deliver_construction_materials_activity(
                                tables, citizen_record, workplace_record, target_building_record,
                                actual_resources_to_carry, contract_custom_id, path_to_site # Utiliser contract_custom_id
                            ):
                                log.info(f"      Created deliver_construction_materials activity for {citizen_username} to {target_building_custom_id}.")
                                return True
                        else:
                            log.warning(f"    Pathfinding to site {target_building_custom_id} failed for delivery. Skipping.")
                    else:
                        log.info(f"    Citizen {citizen_username} cannot carry any materials for delivery at this time.")
                    continue

                elif materials_to_fetch_for_workshop:
                    material_to_fetch_now = materials_to_fetch_for_workshop[0]
                    log.info(f"    Workshop {workplace_custom_id} needs to fetch {material_to_fetch_now} for project {contract_custom_id}.")
                    if try_create_resource_fetching_activity(
                        tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                        contract_custom_id, None, workplace_custom_id, material_to_fetch_now,
                        10.0, None, current_time_utc=now_utc_dt, resource_defs=resource_defs
                    ):
                        log.info(f"      Created fetch_resource activity for {citizen_username} to bring {material_to_fetch_now} to workshop {workplace_custom_id}.")
                        return True
                    continue

            else: # All materials are on site
                log.info(f"    All materials are on site {target_building_custom_id}.")
                construction_minutes_remaining = float(target_building_record['fields'].get('ConstructionMinutesRemaining', 0))
                if construction_minutes_remaining > 0:
                    log.info(f"    Site {target_building_custom_id} has {construction_minutes_remaining} construction minutes remaining.")
                    target_building_position_str = target_building_record['fields'].get('Position', '{}')
                    target_building_position = json.loads(target_building_position_str) if target_building_position_str else None

                    if not citizen_position or not target_building_position:
                        log.warning("    Missing citizen or target building position for construction. Skipping.")
                        continue
                    
                    work_duration_this_activity = 60
                    path_data_for_construction = None

                    distance_to_site = _calculate_distance_meters(citizen_position, target_building_position)
                    if distance_to_site > 20:
                        log.info(f"    Citizen {citizen_username} is not at site {target_building_custom_id} (Distance: {distance_to_site:.2f}m). Pathfinding...")
                        path_data_for_construction = get_path_between_points(citizen_position, target_building_position, transport_api_url)
                        if not (path_data_for_construction and path_data_for_construction.get('success')):
                            log.warning(f"    Pathfinding to site {target_building_custom_id} failed for construction. Skipping.")
                            continue
                    else:
                        log.info(f"    Citizen {citizen_username} is already at site {target_building_custom_id}. No pathfinding needed.")
                    
                    if try_create_construct_building_activity(
                        tables, citizen_record, target_building_record,
                        work_duration_this_activity, contract_custom_id, path_data_for_construction, # Utiliser contract_custom_id
                        current_time_utc=now_utc_dt
                    ):
                        return True
                    continue
                else:
                    log.info(f"    Site {target_building_custom_id} construction already complete. Marking contract completed.")
                    if contract['fields'].get('Status') != 'completed':
                         tables['contracts'].update(contract_id_airtable, {'Status': 'completed'})
                    continue
        return False # No activity created from construction contracts
    
    # --- Attempt to process active construction contracts ---
    if _try_process_active_construction_contracts():
        return True # Activity created related to a construction contract

    # --- If no contract task, check general workshop restocking needs ---
    log.info(f"No construction contract tasks for {citizen_username}. Checking workshop ({workplace_custom_id}) general restocking.")
    workplace_def = get_building_type_info(workplace_record['fields'].get('Type'), building_type_defs)

    # --- Helper function for workshop restocking ---
    def _try_workshop_restocking() -> bool:
        if not (workplace_def and 'productionInformation' in workplace_def and 'stores' in workplace_def['productionInformation']):
            return False

        workshop_stores_list = workplace_def['productionInformation']['stores']
        if not isinstance(workshop_stores_list, list): # Ensure it's a list
            log.warning(f"Workshop {workplace_custom_id} 'stores' definition is not a list: {workshop_stores_list}. Skipping restocking.")
            return False
            
        current_workshop_load, workshop_inventory = get_building_storage_details(tables, workplace_custom_id, workplace_operator_username)
        storage_capacity = float(workplace_def['productionInformation'].get('storageCapacity', 0))

        for stored_material_type_id in workshop_stores_list:
            desired_stock_level = 50.0  # Arbitrary desired stock level for each storable material
            current_stock = float(workshop_inventory.get(stored_material_type_id, 0.0))
            needed_at_workshop = desired_stock_level - current_stock
            material_name_display = resource_defs.get(stored_material_type_id, {}).get('name', stored_material_type_id)

            if needed_at_workshop <= 0.1: # If workshop has enough or more
                continue

            if (storage_capacity - current_workshop_load) < needed_at_workshop : # Not enough space for desired amount
                log.info(f"  Workshop {workplace_custom_id} needs {material_name_display}, but not enough space (Need: {needed_at_workshop:.2f}, Free: {storage_capacity - current_workshop_load:.2f}).")
                continue

            log.info(f"  Workshop {workplace_custom_id} is low on {material_name_display} (has {current_stock:.2f}, wants {desired_stock_level:.2f}, needs {needed_at_workshop:.2f}). Attempting to acquire.")

            # Priority 1: Fetch from dedicated storage contract
            storage_query_contracts = tables['contracts'].all(
                formula=f"AND({{Type}}='storage_query', {{Buyer}}='{_escape_airtable_value(workplace_operator_username)}', {{BuyerBuilding}}='{_escape_airtable_value(workplace_custom_id)}', {{ResourceType}}='{_escape_airtable_value(stored_material_type_id)}', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
            )
            if storage_query_contracts:
                sq_contract = storage_query_contracts[0]
                storage_facility_id = sq_contract['fields'].get('SellerBuilding')
                if storage_facility_id:
                    storage_facility_record = get_building_record(tables, storage_facility_id)
                    if storage_facility_record:
                        _, facility_stock_map = get_building_storage_details(tables, storage_facility_id, workplace_operator_username)
                        actual_stored_amount = float(facility_stock_map.get(stored_material_type_id, 0.0))
                        
                        if actual_stored_amount > 0:
                            amount_to_fetch_from_storage = min(needed_at_workshop, actual_stored_amount)
                            amount_to_fetch_from_storage = float(f"{amount_to_fetch_from_storage:.4f}") # Precision
                            if amount_to_fetch_from_storage >= 0.1:
                                log.info(f"    Found {actual_stored_amount:.2f} of {material_name_display} in storage {storage_facility_id}. Will fetch {amount_to_fetch_from_storage:.2f}.")
                                storage_facility_pos = _get_building_position_coords(storage_facility_record)
                                if citizen_position and storage_facility_pos: # Citizen is at workshop
                                    path_to_storage = get_path_between_points(citizen_position, storage_facility_pos, transport_api_url)
                                    if path_to_storage and path_to_storage.get('success'):
                                        goto_notes = f"Going to storage {storage_facility_id} to fetch {amount_to_fetch_from_storage:.2f} {material_name_display} for workshop {workplace_custom_id}."
                                        fetch_details = {
                                            "action_on_arrival": "fetch_from_storage",
                                            "original_workplace_id": workplace_custom_id,
                                            "storage_query_contract_id": sq_contract['fields'].get('ContractId', sq_contract['id']), # Utiliser ContractId personnalisé
                                            "resources_to_fetch": [{"ResourceId": stored_material_type_id, "Amount": amount_to_fetch_from_storage}]
                                        }
                                        if try_create_goto_work_activity(
                                            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
                                            storage_facility_id, path_to_storage,
                                            citizen_home_record=None, resource_definitions=resource_defs, is_at_home=False, citizen_current_position_str=json.dumps(citizen_position),
                                            current_time_utc=now_utc_dt, custom_notes=goto_notes,
                                            activity_type="goto_building_for_storage_fetch", details_payload=fetch_details
                                        ):
                                            log.info(f"      Created 'goto_building_for_storage_fetch' to {storage_facility_id}.")
                                            return True
            
            # Priority 2: Fetch via recurrent contract
            recurrent_contracts = get_citizen_contracts(tables, workplace_operator_username) # Fetches 'recurrent'
            for contract_rec in recurrent_contracts:
                if contract_rec['fields'].get('ResourceType') == stored_material_type_id and contract_rec['fields'].get('BuyerBuilding') == workplace_custom_id:
                    from_building_id_recurrent = contract_rec['fields'].get('SellerBuilding')
                    if not from_building_id_recurrent: continue
                    from_building_rec_recurrent = get_building_record(tables, from_building_id_recurrent)
                    if not from_building_rec_recurrent: continue
                    
                    amount_recurrent = float(contract_rec['fields'].get('TargetAmount', 0) or 0)
                    amount_to_fetch_recurrent = min(needed_at_workshop, amount_recurrent)
                    
                    contract_seller_username_rec = contract_rec['fields'].get('Seller')
                    if not contract_seller_username_rec: continue
                    _, source_stock_map_rec = get_building_storage_details(tables, from_building_id_recurrent, contract_seller_username_rec)

                    if source_stock_map_rec.get(stored_material_type_id, 0.0) >= amount_to_fetch_recurrent and amount_to_fetch_recurrent > 0.01:
                        contract_custom_id_rec = contract_rec['fields'].get('ContractId', contract_rec['id'])
                        if _has_recent_failed_activity_for_contract(tables, 'fetch_resource', contract_custom_id_rec): continue
                        
                        log.info(f"    Attempting fetch via recurrent contract {contract_custom_id_rec} from {from_building_id_recurrent} for {material_name_display}.")
                        path_to_source_rec = get_path_between_points(citizen_position, _get_building_position_coords(from_building_rec_recurrent), transport_api_url)
                        if path_to_source_rec and path_to_source_rec.get('success'):
                            if try_create_resource_fetching_activity(
                                tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                                contract_custom_id_rec, from_building_id_recurrent, workplace_custom_id,
                                stored_material_type_id, amount_to_fetch_recurrent, path_to_source_rec,
                                current_time_utc=now_utc_dt, resource_defs=resource_defs
                            ):
                                log.info(f"      Created fetch_resource for recurrent contract {contract_custom_id_rec}.")
                                return True
            
            # Priority 3: Buy from public sell contract
            public_sell_formula = f"AND({{Type}}='public_sell', {{ResourceType}}='{_escape_airtable_value(stored_material_type_id)}', {{EndAt}}>'{now_utc_dt.isoformat()}', {{TargetAmount}}>0)"
            all_public_sell_for_res = tables['contracts'].all(formula=public_sell_formula)
            all_public_sell_for_res.sort(key=lambda c: float(c['fields'].get('PricePerResource', float('inf')))) # Sort by price

            for contract_ps in all_public_sell_for_res:
                seller_building_id_ps = contract_ps['fields'].get('SellerBuilding')
                if not seller_building_id_ps: continue
                seller_building_rec_ps = get_building_record(tables, seller_building_id_ps)
                if not seller_building_rec_ps: continue

                price_per_unit_ps = float(contract_ps['fields'].get('PricePerResource', 0))
                contract_amount_available_ps = float(contract_ps['fields'].get('TargetAmount', 0))
                contract_seller_username_ps = contract_ps['fields'].get('Seller')
                if not contract_seller_username_ps: continue

                # Buyer is the workshop operator
                buyer_record_for_ps = get_citizen_record(tables, workplace_operator_username)
                if not buyer_record_for_ps: continue # Should not happen if operator is valid
                buyer_ducats_ps = float(buyer_record_for_ps['fields'].get('Ducats', 0))
                
                max_affordable_units_ps = (buyer_ducats_ps / price_per_unit_ps) if price_per_unit_ps > 0 else float('inf')
                amount_to_buy_ps = min(needed_at_workshop, contract_amount_available_ps, max_affordable_units_ps)
                amount_to_buy_ps = float(f"{amount_to_buy_ps:.4f}")

                if amount_to_buy_ps >= 0.1:
                    _, source_stock_map_ps = get_building_storage_details(tables, seller_building_id_ps, contract_seller_username_ps)
                    if source_stock_map_ps.get(stored_material_type_id, 0.0) >= amount_to_buy_ps:
                        contract_custom_id_ps = contract_ps['fields'].get('ContractId', contract_ps['id'])
                        if _has_recent_failed_activity_for_contract(tables, 'fetch_resource', contract_custom_id_ps): continue

                        log.info(f"    Attempting to buy via public sell {contract_custom_id_ps} from {seller_building_id_ps} for {material_name_display}.")
                        path_to_seller_ps = get_path_between_points(citizen_position, _get_building_position_coords(seller_building_rec_ps), transport_api_url)
                        if path_to_seller_ps and path_to_seller_ps.get('success'):
                            if try_create_resource_fetching_activity(
                                tables, citizen_airtable_id, citizen_custom_id, citizen_username, # Citizen is the fetcher
                                contract_custom_id_ps, seller_building_id_ps, workplace_custom_id, # ToBuilding is workshop
                                stored_material_type_id, amount_to_buy_ps, path_to_seller_ps,
                                current_time_utc=now_utc_dt, resource_defs=resource_defs
                            ):
                                log.info(f"      Created fetch_resource for public sell contract {contract_custom_id_ps}.")
                                return True
            
            # Priority 4: Generic fetch (current fallback behavior)
            log.info(f"    No specific contracts found for {material_name_display}. Attempting generic fetch.")
            amount_for_generic_fetch = min(needed_at_workshop, 10.0) # Fetch a smaller, arbitrary amount
            if try_create_resource_fetching_activity(
                tables, citizen_airtable_id, citizen_custom_id, citizen_username,
                None, None, workplace_custom_id, stored_material_type_id, amount_for_generic_fetch, None,
                current_time_utc=now_utc_dt, resource_defs=resource_defs
            ):
                log.info(f"      Created generic fetch_resource activity for {material_name_display}.")
                return True
            
            log.info(f"    Could not create any restocking activity for {material_name_display} for workshop {workplace_custom_id}.")
            # If one material cannot be restocked, we might still want to try the next one.
            # However, for simplicity, if one attempt is made (even if it fails to create), we might return.
            # The current loop structure will try the next material if no activity was created for the current one.

        return False # No restocking activity created

    # --- Attempt workshop restocking ---
    if _try_workshop_restocking():
        return True

    # --- If nothing else, idle ---
    log.info(f"No specific construction or restocking tasks for {citizen_username} at {workplace_custom_id}. Creating idle activity.")
    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=1)).isoformat()
    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, end_date_iso=idle_end_time_iso, reason_message="Awaiting construction tasks or supplies at workshop.")
    return True
