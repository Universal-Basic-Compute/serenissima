import logging
import json
import datetime
import pytz
import uuid
from typing import Dict, List, Optional, Any
from pyairtable import Table

# Import helpers from the utils module
from backend.engine.utils.activity_helpers import (
    LogColors,
    _get_building_position_coords,
    _calculate_distance_meters,
    get_closest_building_of_type, # Changed from get_closest_inn
    get_path_between_points,
    get_citizen_current_load, # Added for daytime activity
    get_citizen_inventory_details, # For checking inventory when full
    get_building_type_info, # For checking storage capacity
    get_building_current_storage # For checking storage capacity
)
# Import activity creators
from backend.engine.activity_creators import (
    try_create_stay_activity,
    try_create_travel_to_inn_activity,
    try_create_resource_fetching_activity, # Added for daytime activity
    try_create_idle_activity,
    try_create_leave_venice_activity, # Import new creator
    try_create_deliver_to_storage_activity # For delivering full inventory
)
# Import get_building_record from activity_helpers
from backend.engine.utils.activity_helpers import get_building_record, _escape_airtable_value, CITIZEN_CARRY_CAPACITY # For querying activities and carry capacity


log = logging.getLogger(__name__)

def process_forestieri_night_activity(
    tables: Dict[str, Table],
    citizen_record: Dict, # Contains Username, CitizenId, id (Airtable record ID)
    citizen_position: Optional[Dict[str, float]],
    now_utc_dt: datetime.datetime,
    transport_api_url: str,
    IDLE_ACTIVITY_DURATION_HOURS: int,
    NIGHT_END_HOUR_FOR_STAY: int,
    VENICE_TIMEZONE: pytz.timezone
) -> bool:
    """
    Processes nighttime activities for Forestieri (visitors).
    Attempts to find an inn for them to stay or travel to.
    Returns True if an activity was created, False otherwise.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_record_id = citizen_record['id']
    citizen_name = f"{citizen_record['fields'].get('FirstName', '')} {citizen_record['fields'].get('LastName', '')}" # For logging
    in_venice = citizen_record['fields'].get('InVenice', False)

    if not in_venice:
        log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} (CustomID: {citizen_custom_id}) is not marked as InVenice. Skipping night activity.{LogColors.ENDC}")
        return False

    if not citizen_position: # Should have been handled before calling this, but as a safeguard
        log.warning(f"{LogColors.WARNING}Forestiero {citizen_name} (CustomID: {citizen_custom_id}) has no position. Creating idle activity.{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data for Forestiero at night.")
        return True

    log.info(f"{LogColors.OKCYAN}Processing nighttime activity for Forestiero: {citizen_name} (CustomID: {citizen_custom_id}). Finding an inn.{LogColors.ENDC}")
    closest_inn = get_closest_building_of_type(tables, citizen_position, "inn") # Use get_closest_building_of_type
    if closest_inn:
        inn_position_coords = _get_building_position_coords(closest_inn)
        inn_custom_id = closest_inn['fields'].get('BuildingId', closest_inn['id'])

        if inn_position_coords:
            is_at_inn = _calculate_distance_meters(citizen_position, inn_position_coords) < 20
            if is_at_inn:
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} is already at inn {inn_custom_id}. Creating stay activity.{LogColors.ENDC}")
                venice_now = now_utc_dt.astimezone(VENICE_TIMEZONE)
                if venice_now.hour < NIGHT_END_HOUR_FOR_STAY:
                    end_time_venice = venice_now.replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
                else:
                    end_time_venice = (venice_now + datetime.timedelta(days=1)).replace(hour=NIGHT_END_HOUR_FOR_STAY, minute=0, second=0, microsecond=0)
                stay_end_time_iso = end_time_venice.isoformat() # Pass Venice time ISO string
                if try_create_stay_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_custom_id, stay_location_type="inn", end_time_utc_iso=stay_end_time_iso):
                    return True
            else:
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} is not at inn {inn_custom_id}. Finding path to inn.{LogColors.ENDC}")
                path_data = get_path_between_points(citizen_position, inn_position_coords, transport_api_url)
                if path_data and path_data.get('success'):
                    if try_create_travel_to_inn_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, inn_custom_id, path_data):
                        return True
                else:
                    log.warning(f"{LogColors.WARNING}Path finding to inn {inn_custom_id} failed for Forestiero {citizen_name}. Creating idle activity.{LogColors.ENDC}")
                    idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                    try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to inn {inn_custom_id} failed.")
                    return True
        else:
            log.warning(f"{LogColors.WARNING}Inn {closest_inn.get('id', 'N/A')} has no position data. Creating idle activity for Forestiero {citizen_name}.{LogColors.ENDC}")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="Inn has no position data.")
            return True
    else:
        log.warning(f"{LogColors.WARNING}No inn found for Forestiero {citizen_name}. Creating idle activity.{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No inn found for visitor.")
        return True
    
    return False # Should not be reached if idle is created as fallback

def process_forestieri_daytime_activity(
    tables: Dict[str, Table],
    citizen_record: Dict, # Contains Username, CitizenId, id (Airtable record ID)
    citizen_position: Optional[Dict[str, float]],
    now_utc_dt: datetime.datetime,
    resource_defs: Dict, # Global resource definitions
    building_type_defs: Dict, # Added for storage capacity checks
    transport_api_url: str,
    # CITIZEN_CARRY_CAPACITY is now imported from activity_helpers
    IDLE_ACTIVITY_DURATION_HOURS: int
) -> bool:
    """
    Processes daytime activities for Forestieri (visitors), specifically resource acquisition.
    Attempts to find tier 1-4 resources to buy.
    Returns True if an activity was created, False otherwise.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_record_id = citizen_record['id']
    citizen_name = f"{citizen_record['fields'].get('FirstName', '')} {citizen_record['fields'].get('LastName', '')}" # For logging
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    in_venice = citizen_record['fields'].get('InVenice', False)

    if not in_venice:
        log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} (CustomID: {citizen_custom_id}) is not marked as InVenice. Skipping daytime activity.{LogColors.ENDC}")
        return False

    if not citizen_position: # Should have been handled before calling this
        log.warning(f"{LogColors.WARNING}Forestiero {citizen_name} (CustomID: {citizen_custom_id}) has no position for daytime activity. Creating idle.{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_record_id, end_date_iso=idle_end_time_iso, reason_message="No position data for Forestiero daytime activity.")
        return True

    current_load = get_citizen_current_load(tables, citizen_username)
    remaining_capacity = CITIZEN_CARRY_CAPACITY - current_load

    if remaining_capacity < 0.1: # Inventory is considered full
        log.info(f"{LogColors.WARNING}Forestiero {citizen_name}'s inventory is full. Checking options.{LogColors.ENDC}")
        
        citizen_inventory = get_citizen_inventory_details(tables, citizen_username)
        items_to_store = [item for item in citizen_inventory if item.get("Owner") == citizen_username and item.get("Amount", 0) > 0]

        if not items_to_store: # This means inventory is full. Forestiero should claim all items.
            log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name}'s inventory is full. Claiming ownership of all carried items.{LogColors.ENDC}")
            
            items_claimed_count = 0
            for item_record_inv in citizen_inventory: # citizen_inventory is the full list
                item_airtable_id = item_record_inv.get("AirtableRecordId")
                current_item_owner = item_record_inv.get("Owner")
                item_res_id_log = item_record_inv.get("ResourceId", "UnknownResource")
                item_amount_log = item_record_inv.get("Amount", 0)

                if item_airtable_id and current_item_owner != citizen_username:
                    try:
                        tables['resources'].update(item_airtable_id, {'Owner': citizen_username})
                        log.info(f"  Forestiero {citizen_name} claimed ownership of {item_amount_log:.2f} {item_res_id_log} (was owned by {current_item_owner}).")
                        items_claimed_count += 1
                        # Update local inventory record for subsequent logic
                        item_record_inv["Owner"] = citizen_username 
                    except Exception as e_claim:
                        log.error(f"  Failed to claim ownership of resource {item_airtable_id} for {citizen_name}: {e_claim}")
            
            if items_claimed_count > 0:
                log.info(f"Forestiero {citizen_name} claimed ownership of {items_claimed_count} item stacks.")
                # Re-filter items_to_store with updated ownership
                items_to_store = [item for item in citizen_inventory if item.get("Owner") == citizen_username and item.get("Amount", 0) > 0]

            if not items_to_store: # Still no items to store (e.g., all items were zero amount or errors occurred)
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name}'s inventory is full, but no items to store even after attempting to claim ownership. Creating idle.{LogColors.ENDC}")
                idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
                try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_record['id'], end_date_iso=idle_end_time_iso, reason_message="Inventory full, no items to store after ownership claim.")
                return True
        
        # Proceed with items_to_store (which are now all self-owned)
        # Option 1: Deposit to own merchant_galley if Forestiero is Occupant
        owned_galley_record = None
        try:
            # Check if this Forestiero is an Occupant of any merchant_galley
            galleys_occupied_by_forestiero = tables['buildings'].all(
                formula=f"AND({{Occupant}}='{_escape_airtable_value(citizen_username)}', {{Type}}='merchant_galley', {{IsConstructed}}=TRUE())"
            )
            if galleys_occupied_by_forestiero:
                owned_galley_record = galleys_occupied_by_forestiero[0] # Take the first one if multiple (should ideally be one)
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} is Occupant of merchant_galley {owned_galley_record['fields'].get('BuildingId')}. Attempting to deposit there.{LogColors.ENDC}")
        except Exception as e_galley_check:
            log.error(f"{LogColors.FAIL}Error checking for Forestiero's occupied galley: {e_galley_check}{LogColors.ENDC}")

        if owned_galley_record:
            galley_custom_id = owned_galley_record['fields'].get('BuildingId')
            galley_type_def = get_building_type_info(owned_galley_record['fields'].get('Type'), building_type_defs)
            galley_total_capacity = galley_type_def.get('productionInformation', {}).get('storageCapacity', 0) if galley_type_def else 0
            galley_current_load = get_building_current_storage(tables, galley_custom_id)
            galley_remaining_capacity = galley_total_capacity - galley_current_load

            items_to_deposit_in_galley = []
            volume_to_deposit_in_galley = 0.0
            for item in items_to_store:
                if volume_to_deposit_in_galley >= galley_remaining_capacity: break
                amount_can_deposit = min(item["Amount"], galley_remaining_capacity - volume_to_deposit_in_galley)
                if amount_can_deposit > 0.01:
                    items_to_deposit_in_galley.append({"ResourceId": item["ResourceId"], "Amount": amount_can_deposit})
                    volume_to_deposit_in_galley += amount_can_deposit
            
            if items_to_deposit_in_galley:
                galley_pos = _get_building_position_coords(owned_galley_record)
                if citizen_position and galley_pos:
                    path_to_galley = get_path_between_points(citizen_position, galley_pos, transport_api_url)
                    if path_to_galley and path_to_galley.get('success'):
                        if try_create_deliver_to_storage_activity(
                            tables, citizen_record, None, owned_galley_record, 
                            items_to_deposit_in_galley,
                            None, 
                            path_to_galley,
                            now_utc_dt,
                            source_is_citizen_inventory=True,
                            intended_owner_username_for_storage=citizen_username # Forestiero owns items in their galley
                        ):
                            log.info(f"{LogColors.OKGREEN}Forestiero {citizen_name} created 'deliver_to_storage' (to own galley) activity to {galley_custom_id} for {volume_to_deposit_in_galley:.2f} units.{LogColors.ENDC}")
                            return True
            else:
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name}'s galley {galley_custom_id} has no space or no items to deposit. Checking public storage.{LogColors.ENDC}")


        # Option 2: Fallback to public storage if no owned galley or deposit failed
        log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} did not deposit to own galley. Attempting to find public storage.{LogColors.ENDC}")
        public_storage_contracts_formula = f"AND({{Type}}='public_storage', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
        try:
            active_public_storage_contracts = tables['contracts'].all(formula=public_storage_contracts_formula, sort=['-Priority'])
            for storage_contract in active_public_storage_contracts:
                storage_facility_id_from_contract = storage_contract['fields'].get('SellerBuilding')
                contract_resource_type = storage_contract['fields'].get('ResourceType')

                if not storage_facility_id_from_contract:
                    log.warning(f"Contract {storage_contract['id']} is missing SellerBuilding. Skipping.")
                    continue

                storage_facility_record = None
                actual_id_for_log = "" # For logging the ID value that was processed

                if isinstance(storage_facility_id_from_contract, (list, tuple)):
                    if storage_facility_id_from_contract: # Not an empty list/tuple
                        linked_rec_id = storage_facility_id_from_contract[0]
                        actual_id_for_log = linked_rec_id
                        if isinstance(linked_rec_id, str) and linked_rec_id.startswith('rec'):
                            try:
                                storage_facility_record = tables['buildings'].get(linked_rec_id)
                                if storage_facility_record:
                                    log.info(f"Fetched storage facility by Airtable Rec ID {linked_rec_id} from SellerBuilding list/tuple for contract {storage_contract['id']}.")
                            except Exception as e_get_bldg:
                                log.error(f"Error fetching building by linked rec_id {linked_rec_id} (from contract {storage_contract['id']}): {e_get_bldg}")
                        else:
                            log.warning(f"SellerBuilding in contract {storage_contract['id']} is a list/tuple but content '{linked_rec_id}' is not a valid Airtable Rec ID.")
                    else: # Empty list/tuple
                        log.warning(f"SellerBuilding in contract {storage_contract['id']} is an empty list/tuple.")
                elif isinstance(storage_facility_id_from_contract, str):
                    actual_id_for_log = storage_facility_id_from_contract
                    if storage_facility_id_from_contract.startswith('rec'): # It's an Airtable record ID string
                        try:
                            storage_facility_record = tables['buildings'].get(storage_facility_id_from_contract)
                            if storage_facility_record:
                                 log.info(f"Fetched storage facility by Airtable Rec ID string {storage_facility_id_from_contract} from SellerBuilding for contract {storage_contract['id']}.")
                        except Exception as e_get_bldg_str:
                            log.error(f"Error fetching building by rec_id string {storage_facility_id_from_contract} (from contract {storage_contract['id']}): {e_get_bldg_str}")
                    else: # Assume it's a custom BuildingId string
                        storage_facility_record = get_building_record(tables, storage_facility_id_from_contract)
                        if storage_facility_record:
                            log.info(f"Fetched storage facility by custom BuildingId {storage_facility_id_from_contract} from SellerBuilding for contract {storage_contract['id']}.")
                else:
                    log.warning(f"SellerBuilding in contract {storage_contract['id']} has unexpected type: {type(storage_facility_id_from_contract)}. Value: {storage_facility_id_from_contract}")
                
                if not storage_facility_record:
                    log.warning(f"Could not get storage facility record from SellerBuilding value '{actual_id_for_log}' in contract {storage_contract['id']}. Skipping this contract.")
                    continue
                
                # Use storage_facility_record directly. If a custom ID is needed for logging or other functions:
                storage_facility_custom_id = storage_facility_record['fields'].get('BuildingId')
                if not storage_facility_custom_id:
                     log.warning(f"Storage facility {storage_facility_record['id']} (from contract {storage_contract['id']}) is missing a custom BuildingId field. Skipping.")
                     continue

                facility_type_def = get_building_type_info(storage_facility_record['fields'].get('Type'), building_type_defs)
                facility_total_capacity = facility_type_def.get('productionInformation', {}).get('storageCapacity', 0) if facility_type_def else 0
                facility_current_load = get_building_current_storage(tables, storage_facility_custom_id) # Use custom_id here
                facility_remaining_general_capacity = facility_total_capacity - facility_current_load

                if facility_remaining_general_capacity <= 0:
                    log.info(f"Public storage facility {storage_facility_custom_id} is full. Skipping.")
                    continue

                batch_for_this_facility = []
                total_volume_for_this_batch = 0.0
                for item_in_inv in items_to_store: # Use items_to_store (self-owned items)
                    if total_volume_for_this_batch >= facility_remaining_general_capacity: break
                    if contract_resource_type and item_in_inv["ResourceId"] != contract_resource_type: continue
                    amount_to_store_this_item = min(item_in_inv["Amount"], facility_remaining_general_capacity - total_volume_for_this_batch)
                    if amount_to_store_this_item > 0.01:
                        batch_for_this_facility.append({"ResourceId": item_in_inv["ResourceId"], "Amount": amount_to_store_this_item})
                        total_volume_for_this_batch += amount_to_store_this_item
                
                if batch_for_this_facility:
                    storage_facility_pos = _get_building_position_coords(storage_facility_record)
                    if citizen_position and storage_facility_pos:
                        path_to_storage = get_path_between_points(citizen_position, storage_facility_pos, transport_api_url)
                        if path_to_storage and path_to_storage.get('success'):
                            if try_create_deliver_to_storage_activity(
                                tables, citizen_record, None, storage_facility_record,
                                batch_for_this_facility,
                                storage_contract['fields'].get('ContractId', storage_contract['id']),
                                path_to_storage,
                                now_utc_dt,
                                source_is_citizen_inventory=True,
                                intended_owner_username_for_storage=citizen_username # Forestiero owns items in public storage
                            ):
                                log.info(f"{LogColors.OKGREEN}Forestiero {citizen_name} created 'deliver_to_storage' activity to public storage {storage_facility_custom_id} for {total_volume_for_this_batch:.2f} units.{LogColors.ENDC}")
                                return True
        except Exception as e_storage_find:
            log.error(f"{LogColors.FAIL}Error finding/processing public storage for Forestiero {citizen_name}: {e_storage_find}{LogColors.ENDC}")
            import traceback
            log.error(traceback.format_exc()) # Log full traceback for the error

        log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name}'s inventory is full, but no suitable storage (own galley or public) found or delivery failed. Creating idle activity.{LogColors.ENDC}")
        idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
        try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_record['id'], end_date_iso=idle_end_time_iso, reason_message="Inventory full, no suitable storage option found.")
        return True

    log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} has {remaining_capacity:.2f} inventory space. Looking for tier 1-4 resources to buy.{LogColors.ENDC}")
    target_tiers = [1, 2, 3, 4]
    
    shoppable_resources_by_tier = {
        res_id: res_data for res_id, res_data in resource_defs.items()
        if int(res_data.get('tier', 99) or 99) in target_tiers
    }

    if not shoppable_resources_by_tier:
        log.info(f"{LogColors.OKBLUE}No resources of tier 1-4 defined or available for Forestiero {citizen_name}.{LogColors.ENDC}")
        return False # No activity created

    active_sell_contracts_formula = f"AND({{Type}}='public_sell', {{EndAt}}>'{now_utc_dt.isoformat()}', {{CreatedAt}}<='{now_utc_dt.isoformat()}', {{TargetAmount}}>0)"
    try:
        all_public_sell_contracts = tables['contracts'].all(formula=active_sell_contracts_formula)
        
        potential_purchases = []
        for res_id_to_check in shoppable_resources_by_tier.keys():
            contracts_for_this_resource = [
                c for c in all_public_sell_contracts if c['fields'].get('ResourceType') == res_id_to_check
            ]
            if not contracts_for_this_resource:
                continue

            for contract_record in contracts_for_this_resource:
                seller_building_custom_id = contract_record['fields'].get('SellerBuilding')
                if not seller_building_custom_id: continue

                # We need get_building_record, assuming it's imported or available
                # from backend.engine.processActivities import get_building_record
                # For now, let's assume it's available in the scope or we add an import.
                # If not, this will fail. It's imported in citizen_general_activities.py.
                # Let's add it to this file's imports for clarity.
                seller_building_record = get_building_record(tables, seller_building_custom_id)
                if not seller_building_record: continue
                
                seller_building_pos = _get_building_position_coords(seller_building_record)
                if not seller_building_pos: continue # Seller building must have a position
                
                price_per_unit = float(contract_record['fields'].get('PricePerResource', 0))
                if price_per_unit <= 0: continue

                potential_purchases.append({
                    "resource_id": res_id_to_check,
                    "contract_record": contract_record,
                    "seller_building_record": seller_building_record,
                    "price_per_unit": price_per_unit
                })
        
        # Simple prioritization: iterate and take the first valid one. Could be random or sorted.
        for purchase_candidate in potential_purchases:
            contract_airtable_record = purchase_candidate['contract_record']
            seller_building_airtable_record = purchase_candidate['seller_building_record']
            resource_id_to_buy = purchase_candidate['resource_id']
            price_per_unit = purchase_candidate['price_per_unit']

            contract_amount_available = float(contract_airtable_record['fields'].get('TargetAmount', 0)) # Changed Amount to TargetAmount
            max_affordable_units = (citizen_ducats / price_per_unit) if price_per_unit > 0 else 0
            
            amount_to_buy = min(remaining_capacity, contract_amount_available, max_affordable_units)
            amount_to_buy = float(f"{amount_to_buy:.4f}")

            if amount_to_buy >= 0.1:
                seller_building_custom_id = seller_building_airtable_record['fields'].get('BuildingId')
                seller_building_pos = _get_building_position_coords(seller_building_airtable_record)

                if not seller_building_custom_id or not seller_building_pos:
                    log.warning(f"{LogColors.WARNING}Seller building {seller_building_airtable_record['id']} for Forestiero {citizen_name} is missing custom ID or position.{LogColors.ENDC}")
                    continue
                
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} considering buying {amount_to_buy:.2f} of {resource_id_to_buy} from {seller_building_custom_id}.{LogColors.ENDC}")
                path_to_seller = get_path_between_points(citizen_position, seller_building_pos, transport_api_url)
                
                if path_to_seller and path_to_seller.get('success'):
                    # For Forestieri, ToBuilding is the same as FromBuilding
                    if try_create_resource_fetching_activity(
                        tables, citizen_airtable_record_id, citizen_custom_id, citizen_username,
                        contract_airtable_record['fields'].get('ContractId', contract_airtable_record['id']), # Use custom ContractId
                        seller_building_custom_id, # FromBuilding
                        seller_building_custom_id, # ToBuilding is also FromBuilding
                        resource_id_to_buy, amount_to_buy, path_to_seller,
                        current_time_utc=now_utc_dt, # Pass current_time_utc
                        resource_defs=resource_defs  # Pass resource_defs
                    ):
                        log.info(f"{LogColors.OKGREEN}Daytime resource fetching activity created for Forestiero {citizen_name} to buy {resource_id_to_buy}.{LogColors.ENDC}")
                        return True
                else:
                    log.warning(f"{LogColors.WARNING}Path to seller {seller_building_custom_id} for {resource_id_to_buy} failed for Forestiero {citizen_name}.{LogColors.ENDC}")
            
        log.info(f"{LogColors.OKBLUE}No suitable daytime resource purchase found or path failed for Forestiero {citizen_name}.{LogColors.ENDC}")
    except Exception as e_day_shop_forestiero:
        log.error(f"{LogColors.FAIL}Error during Forestiero daytime resource shopping for {citizen_name}: {e_day_shop_forestiero}{LogColors.ENDC}")

    return False # No activity created

def process_forestieri_departure_check(
    tables: Dict[str, Table],
    citizen_record: Dict,
    citizen_position: Optional[Dict[str, float]],
    now_utc_dt: datetime.datetime,
    transport_api_url: str,
    IDLE_ACTIVITY_DURATION_HOURS: int
) -> bool:
    """
    Checks if a Forestiero should leave Venice.
    Conditions:
    1. In Venice for > 12 hours (Citizen.CreatedAt).
    2. Last activity ended > 12 hours ago.
    If so, creates a 'leave_venice' activity.
    Returns True if a departure-related activity was created, False otherwise.
    """
    citizen_custom_id = citizen_record['fields'].get('CitizenId')
    citizen_username = citizen_record['fields'].get('Username')
    citizen_airtable_id = citizen_record['id']
    citizen_name = f"{citizen_record['fields'].get('FirstName', '')} {citizen_record['fields'].get('LastName', '')}"
    in_venice = citizen_record['fields'].get('InVenice', False)

    if not in_venice:
        log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} (CustomID: {citizen_custom_id}) is not marked as InVenice. Skipping departure check.{LogColors.ENDC}")
        return False # Cannot leave if not in Venice

    log.info(f"{LogColors.OKCYAN}Checking departure conditions for Forestiero {citizen_name} (CustomID: {citizen_custom_id}).{LogColors.ENDC}")

    # Condition 1: In Venice for > 12 hours
    created_at_str = citizen_record['fields'].get('CreatedAt')
    if not created_at_str:
        log.warning(f"{LogColors.WARNING}Forestiero {citizen_name} has no CreatedAt timestamp. Cannot check departure.{LogColors.ENDC}")
        return False
    
    try:
        if created_at_str.endswith('Z'): # Handle 'Z' for UTC
            created_at_dt = datetime.datetime.fromisoformat(created_at_str[:-1] + "+00:00")
        else:
            created_at_dt = datetime.datetime.fromisoformat(created_at_str)
        
        if created_at_dt.tzinfo is None: # Assume UTC if no timezone
            created_at_dt = pytz.utc.localize(created_at_dt)
        
        if (now_utc_dt - created_at_dt) <= datetime.timedelta(hours=12):
            log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} in Venice for <= 12 hours. Not leaving yet.{LogColors.ENDC}")
            return False
    except ValueError:
        log.error(f"{LogColors.FAIL}Could not parse CreatedAt for {citizen_name}: {created_at_str}{LogColors.ENDC}")
        return False

    # Condition 2: Last activity ended > 12 hours ago (meaning they've been idle)
    try:
        # Get all activities for the citizen, ordered by EndDate descending
        activities_formula = f"{{Citizen}}='{_escape_airtable_value(citizen_username)}'"
        all_citizen_activities = tables['activities'].all(formula=activities_formula, sort=['-EndDate'])

        if not all_citizen_activities:
            # No activities ever? Could be a very new citizen or an issue.
            # If they've been here > 12h and no activities, they might be stuck.
            # For departure, this means they've been "idle" since arrival.
            log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} has no recorded activities. Assuming idle since arrival.{LogColors.ENDC}")
            # Proceed to departure logic if CreatedAt > 12h ago (checked above)
        else:
            last_activity_end_date_str = all_citizen_activities[0]['fields'].get('EndDate')
            if not last_activity_end_date_str:
                log.warning(f"{LogColors.WARNING}Forestiero {citizen_name}'s last activity has no EndDate. Cannot check departure.{LogColors.ENDC}")
                return False

            if last_activity_end_date_str.endswith('Z'):
                last_activity_end_date_dt = datetime.datetime.fromisoformat(last_activity_end_date_str[:-1] + "+00:00")
            else:
                last_activity_end_date_dt = datetime.datetime.fromisoformat(last_activity_end_date_str)

            if last_activity_end_date_dt.tzinfo is None:
                last_activity_end_date_dt = pytz.utc.localize(last_activity_end_date_dt)
            
            if (now_utc_dt - last_activity_end_date_dt) <= datetime.timedelta(hours=12):
                log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name}'s last activity ended <= 12 hours ago. Not leaving yet.{LogColors.ENDC}")
                return False
        
        log.info(f"{LogColors.OKGREEN}Forestiero {citizen_name} meets conditions for departure. Finding exit point.{LogColors.ENDC}")

        # Find a random public_dock as an exit point
        public_docks = tables['buildings'].all(formula="{Type}='public_dock'")
        if not public_docks:
            log.warning(f"{LogColors.WARNING}No public_docks found to use as exit points. Cannot create leave_venice activity.{LogColors.ENDC}")
            return False
        
        import random
        exit_point_building = random.choice(public_docks)
        exit_point_custom_id = exit_point_building['fields'].get('BuildingId')
        exit_point_position = _get_building_position_coords(exit_point_building)

        if not exit_point_custom_id or not exit_point_position:
            log.warning(f"{LogColors.WARNING}Selected exit point {exit_point_building['id']} missing BuildingId or Position.{LogColors.ENDC}")
            return False
        
        if not citizen_position:
            log.warning(f"{LogColors.WARNING}Forestiero {citizen_name} has no current position. Cannot pathfind to exit.{LogColors.ENDC}")
            # Create idle, as they are stuck but should leave.
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, end_date_iso=idle_end_time_iso, reason_message="Ready to leave but no position.")
            return True


        path_to_exit = get_path_between_points(citizen_position, exit_point_position, transport_api_url)
        if not (path_to_exit and path_to_exit.get('success')):
            log.warning(f"{LogColors.WARNING}Pathfinding to exit point {exit_point_custom_id} failed for {citizen_name}. Creating idle.{LogColors.ENDC}")
            idle_end_time_iso = (now_utc_dt + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)).isoformat()
            try_create_idle_activity(tables, citizen_custom_id, citizen_username, citizen_airtable_id, end_date_iso=idle_end_time_iso, reason_message=f"Pathfinding to exit {exit_point_custom_id} failed.")
            return True

        # Check if Forestiero owns a merchant_galley
        galley_to_delete_custom_id = None
        owned_galleys = tables['buildings'].all(formula=f"AND({{Owner}}='{_escape_airtable_value(citizen_username)}', {{Type}}='merchant_galley')")
        if owned_galleys:
            galley_to_delete_custom_id = owned_galleys[0]['fields'].get('BuildingId')
            log.info(f"{LogColors.OKBLUE}Forestiero {citizen_name} owns galley {galley_to_delete_custom_id}. It will be processed upon departure.{LogColors.ENDC}")

        if try_create_leave_venice_activity(
            tables, citizen_custom_id, citizen_username, citizen_airtable_id,
            exit_point_custom_id, path_to_exit, galley_to_delete_custom_id
        ):
            log.info(f"{LogColors.OKGREEN}Successfully created 'leave_venice' activity for {citizen_name}.{LogColors.ENDC}")
            return True
        
    except Exception as e_departure:
        log.error(f"{LogColors.FAIL}Error during departure check for Forestiero {citizen_name}: {e_departure}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())

    return False # Default to no activity created if errors or conditions not met
