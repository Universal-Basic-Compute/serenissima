"""
Processor for 'deliver_resource_batch' activities.
"""
import json
import logging
import re
import uuid
import os # Added import for os.getenv
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any

# To import utility functions from processActivities.py, we assume it's in the parent of this package.
# This might require adjustments based on how Python's path is configured when running.
# A cleaner way would be to move shared utilities to a common module.
from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    get_contract_record,
    get_building_current_storage,
    _escape_airtable_value,
    get_building_storage_details, # Added import
    _get_building_position_coords, # Added import
    get_path_between_points # Added import
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM

log = logging.getLogger(__name__)

# VENICE_TIMEZONE for consistent timestamping in notes
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Use imported VENICE_TIMEZONE
from backend.engine.utils.activity_helpers import LogColors # Import LogColors

def _update_activity_notes_with_failure_reason(tables: Dict[str, Any], activity_airtable_id: str, failure_reason: str):
    """Appends a failure reason to the activity's Notes field."""
    try:
        activity_to_update = tables['activities'].get(activity_airtable_id)
        if not activity_to_update:
            log.error(f"Could not find activity {activity_airtable_id} to update notes with failure reason.")
            return

        existing_notes = activity_to_update['fields'].get('Notes', '')
        timestamp = datetime.now(VENICE_TIMEZONE).strftime("%Y-%m-%d %H:%M:%S %Z") # Use VENICE_TIMEZONE
        new_note_entry = f"\n[FAILURE - {timestamp}] {failure_reason}"
        
        updated_notes = existing_notes + new_note_entry
        tables['activities'].update(activity_airtable_id, {'Notes': updated_notes})
        log.info(f"Appended failure reason to notes for activity {activity_airtable_id}: {failure_reason}")
    except Exception as e:
        log.error(f"Error updating notes for activity {activity_airtable_id}: {e}")

def process(
    tables: Dict[str, Any], # Using Any for Table type for simplicity here
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
        err_msg = "Activity is missing crucial data (Resources, ToBuilding, or Citizen)."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    try:
        resources_to_deliver = json.loads(resources_to_deliver_json)
    except json.JSONDecodeError:
        err_msg = f"Failed to parse Resources JSON: {resources_to_deliver_json}"
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    delivery_person_citizen_record = get_citizen_record(tables, delivery_person_username)
    if not delivery_person_citizen_record:
        err_msg = f"Delivery person (citizen) {delivery_person_username} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    # delivery_person_citizen_id (custom ctz_ id) is not directly used in resource query with Asset field.
    # Username (delivery_person_username) will be used for the Asset field.

    dest_building_record = get_building_record(tables, to_building_id)
    if not dest_building_record:
        err_msg = f"Destination building {to_building_id} not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    
    dest_building_type_str = dest_building_record['fields'].get('Type')

    # Check if the destination is a merchant galley
    if dest_building_type_str == "merchant_galley":
        log.info(f"Activity {activity_guid} is delivering to merchant_galley {to_building_id}. "
                 f"This signifies the galley's arrival. No resource transfer or financial processing needed here.")
        # The citizen's position will be updated by the main loop in processActivities.py
        # Resources are already considered "in" the galley, owned by the merchant.
        # Financials are deferred.
        return True # Activity is successfully processed.

    # Proceed with normal delivery logic if not a merchant_galley
    dest_building_def = building_type_defs.get(dest_building_type_str, {})
    storage_capacity = dest_building_def.get('productionInformation', {}).get('storageCapacity', 0)
    
    current_stored_volume = get_building_current_storage(tables, to_building_id)
    total_amount_to_deposit = sum(item.get('Amount', 0) for item in resources_to_deliver)

    # Determine target owner based on commercialStorage flag
    building_owner_from_record = dest_building_record['fields'].get('Owner') # Owner of the building itself
    building_operator_from_record = dest_building_record['fields'].get('RunBy') # Operator of the building
    has_commercial_storage = dest_building_def.get('commercialStorage', False)

    # Get the original contract to find the ultimate buyer if needed
    original_contract_custom_id_for_ownership = activity_fields.get('ContractId')
    ultimate_buyer_from_contract = None
    if original_contract_custom_id_for_ownership:
        contract_details_for_ownership = get_contract_record(tables, original_contract_custom_id_for_ownership)
        if contract_details_for_ownership:
            ultimate_buyer_from_contract = contract_details_for_ownership['fields'].get('Buyer')
        else:
            log.warning(f"Could not retrieve original contract {original_contract_custom_id_for_ownership} to determine ultimate buyer for ownership.")

    target_owner_username = None
    if has_commercial_storage and building_operator_from_record:
        target_owner_username = building_operator_from_record
        log.info(f"Building {to_building_id} has commercialStorage=true. Resources will be owned by operator: {building_operator_from_record}.")
    elif ultimate_buyer_from_contract:
        target_owner_username = ultimate_buyer_from_contract
        log.info(f"Building {to_building_id} does not have commercialStorage or no operator. Resources will be owned by original contract buyer: {ultimate_buyer_from_contract}.")
    else:
        # Fallback if ultimate_buyer_from_contract couldn't be determined, though this should be rare for deliveries.
        # Using building_owner_from_record as a last resort if no other owner can be identified.
        target_owner_username = building_owner_from_record 
        log.warning(f"Could not determine specific resource owner (operator or contract buyer). Defaulting to building owner: {building_owner_from_record} for building {to_building_id}.")

    if not target_owner_username:
        err_msg = (f"Could not determine target owner for resources in building {to_building_id}. "
                   f"OriginalContractBuyer: {ultimate_buyer_from_contract}, BuildingOperator: {building_operator_from_record}, "
                   f"BuildingOwner: {building_owner_from_record}, CommercialStorage: {has_commercial_storage}.")
        log.error(err_msg)
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    if current_stored_volume + total_amount_to_deposit > storage_capacity:
        err_msg = (f"Not enough storage in building {to_building_id}. "
                   f"Capacity: {storage_capacity}, Used: {current_stored_volume}, To Deposit: {total_amount_to_deposit}")
        log.warning(f"{err_msg} Activity: {activity_guid}")
        
        # --- Attempt to divert to alternative storage ---
        # Before diversion logic, if the primary delivery fails due to storage, penalize trust
        # This requires knowing who the intended recipient/payer was for this specific delivery leg.
        # The target_owner_username is the recipient of goods.
        # The payer_username (RunBy of BuyerBuilding) is involved with the seller_username (merchant).
        # For a simple storage failure at destination, the delivery_person failed to deliver to target_owner.
        if target_owner_username and delivery_person_username:
             update_trust_score_for_activity(tables, delivery_person_username, target_owner_username, TRUST_SCORE_FAILURE_SIMPLE, "delivery_storage", False, "destination_full")
        
        log.info(f"Attempting to divert resources for activity {activity_guid} due to full destination {to_building_id}.")
        
        # delivery_person_citizen_record is the citizen performing the delivery
        # dest_building_record is the current location (the full building)
        # target_owner_username is the intended owner of the goods being delivered
        
        diverted_an_item = False
        resources_remaining_with_citizen = list(resources_to_deliver) # Copy to modify

        for i, item_to_potentially_divert in enumerate(list(resources_to_deliver)): # Iterate over a copy for safe removal
            resource_id_to_divert = item_to_potentially_divert.get('ResourceId')
            amount_carried_of_this_item = float(item_to_potentially_divert.get('Amount', 0))

            if not resource_id_to_divert or amount_carried_of_this_item <= 0:
                continue

            log.info(f"  Checking storage options for {amount_carried_of_this_item} of {resource_id_to_divert} (owner: {target_owner_username}).")

            # Find storage_query contracts for the target_owner_username and this resource_type
            storage_contracts_formula = (
                f"AND({{Type}}='storage_query', {{Buyer}}='{_escape_airtable_value(target_owner_username)}', "
                f"{{ResourceType}}='{_escape_airtable_value(resource_id_to_divert)}', {{Status}}='active', IS_BEFORE(NOW(), {{EndAt}}))"
            )
            try:
                active_storage_contracts = tables['contracts'].all(formula=storage_contracts_formula, sort=[('Priority', 'desc')])
                if not active_storage_contracts:
                    log.info(f"    No active 'storage_query' contracts found for {target_owner_username} for resource {resource_id_to_divert}.")
                    continue

                for storage_contract in active_storage_contracts:
                    storage_facility_id = storage_contract['fields'].get('SellerBuilding')
                    contracted_capacity_for_resource = float(storage_contract['fields'].get('TargetAmount', 0.0))
                    
                    if not storage_facility_id: continue

                    storage_facility_record = get_building_record(tables, storage_facility_id)
                    if not storage_facility_record: continue

                    # Check current stored amount of this resource by this owner in this facility
                    _, resources_in_facility_map = get_building_storage_details(tables, storage_facility_id, target_owner_username)
                    current_stored_this_res_in_facility = resources_in_facility_map.get(resource_id_to_divert, 0.0)
                    
                    remaining_contract_capacity = contracted_capacity_for_resource - current_stored_this_res_in_facility
                    amount_that_can_be_diverted = min(amount_carried_of_this_item, remaining_contract_capacity)
                    amount_that_can_be_diverted = float(f"{amount_that_can_be_diverted:.4f}")

                    if amount_that_can_be_diverted >= 0.01:
                        storage_facility_pos = _get_building_position_coords(storage_facility_record)
                        current_citizen_location_pos = _get_building_position_coords(dest_building_record) # Citizen is at the full ToBuilding

                        if current_citizen_location_pos and storage_facility_pos:
                            transport_api_url = os.getenv("TRANSPORT_API_URL", "http://localhost:3000/api/transport")
                            path_to_alt_storage = get_path_between_points(current_citizen_location_pos, storage_facility_pos, transport_api_url)

                            if path_to_alt_storage and path_to_alt_storage.get('success'):
                                from backend.engine.activity_creators import try_create_deliver_to_storage_activity
                                if try_create_deliver_to_storage_activity(
                                    tables, delivery_person_citizen_record, None, storage_facility_record,
                                    [{"ResourceId": resource_id_to_divert, "Amount": amount_that_can_be_diverted}],
                                    storage_contract['id'], path_to_alt_storage, source_is_citizen_inventory=True
                                ):
                                    log.info(f"    {LogColors.OKCYAN}Successfully created diversion 'deliver_to_storage' activity for {amount_that_can_be_diverted} of {resource_id_to_divert} to {storage_facility_id}.{LogColors.ENDC}")
                                    
                                    # Adjust resources_remaining_with_citizen
                                    for item_in_transit in resources_remaining_with_citizen:
                                        if item_in_transit.get("ResourceId") == resource_id_to_divert:
                                            item_in_transit["Amount"] -= amount_that_can_be_diverted
                                            if item_in_transit["Amount"] < 0.01:
                                                resources_remaining_with_citizen.remove(item_in_transit)
                                            break
                                    diverted_an_item = True
                                    break # Break from storage_contract loop, successfully diverted this item type
                            else:
                                log.warning(f"      Pathfinding to alternative storage {storage_facility_id} failed.")
                        else:
                            log.warning(f"      Missing position data for current location or alternative storage {storage_facility_id}.")
                    else:
                        log.info(f"    Not enough contract capacity ({remaining_contract_capacity:.2f}) or amount to divert ({amount_that_can_be_diverted:.2f}) is too small for {resource_id_to_divert} at {storage_facility_id}.")
                
                if diverted_an_item:
                    break # Break from the outer resources_to_deliver loop as we've handled one item type

            except Exception as e_storage_check:
                log.error(f"    Error checking storage contracts for {resource_id_to_divert}: {e_storage_check}")
        
        # After attempting diversion
        if diverted_an_item:
            # Add remaining (non-diverted) items to the citizen's personal inventory
            # Owner of these items in personal inventory will be the delivery_person_username
            for remaining_item in resources_remaining_with_citizen:
                res_id = remaining_item.get("ResourceId")
                res_amount = float(remaining_item.get("Amount", 0))
                if res_id and res_amount >= 0.01:
                    citizen_inv_formula = f"AND({{Type}}='{_escape_airtable_value(res_id)}', {{Asset}}='{_escape_airtable_value(delivery_person_username)}', {{AssetType}}='citizen', {{Owner}}='{_escape_airtable_value(delivery_person_username)}')"
                    try:
                        existing_inv_records = tables['resources'].all(formula=citizen_inv_formula, max_records=1)
                        res_def_notes = resource_defs.get(res_id, {})
                        if existing_inv_records:
                            rec_id = existing_inv_records[0]['id']
                            new_count = float(existing_inv_records[0]['fields'].get('Count', 0)) + res_amount
                            tables['resources'].update(rec_id, {'Count': new_count})
                        else:
                            tables['resources'].create({
                                "ResourceId": f"res_inv_{uuid.uuid4()}", "Type": res_id,
                                "Name": res_def_notes.get('name', res_id),
                                "Asset": delivery_person_username, "AssetType": "citizen",
                                "Owner": delivery_person_username, "Count": res_amount,
                                "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
                                "Notes": f"Returned to inventory after failed delivery attempt (Activity: {activity_guid})"
                            })
                        log.info(f"  Added/Updated {res_amount} of {res_id} to {delivery_person_username}'s personal inventory.")
                    except Exception as e_inv_add:
                        log.error(f"  Error adding remaining item {res_id} to {delivery_person_username}'s inventory: {e_inv_add}")
            
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"{err_msg} Some items diverted to alternative storage. Others returned to citizen inventory.")
            return False # Original activity failed, but a diversion was attempted/made.
        else:
            # No item could be diverted, fail as before
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg + " No alternative storage found or usable.")
            return False

    # If we reach here, it means there is enough storage in the primary destination, or diversion was not attempted/successful.
    # The target_owner_username is already defined if we passed the initial checks or the diversion logic.

    all_resources_transferred = True
    
    # VENICE_TIMEZONE is already imported
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()

    for item in resources_to_deliver:
        resource_type_id = item.get('ResourceId')
        amount = float(item.get('Amount', 0))
        if not resource_type_id or amount <= 0:
            log.warning(f"Invalid resource item in activity {activity_guid}: {item}")
            continue

        # For citizen-carried resources (AssetType='citizen'), Asset field uses Username.
        # The Owner should be the merchant who is the Seller in the original contract.
        original_contract_id_for_owner = activity_fields.get('ContractId') # This is the Original Custom Contract ID
        contract_for_owner_details = get_contract_record(tables, original_contract_id_for_owner)
        
        if not contract_for_owner_details:
            err_msg = f"Cannot determine resource owner: Original contract {original_contract_id_for_owner} not found."
            log.error(f"{err_msg} Activity: {activity_guid}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            all_resources_transferred = False; break
        
        merchant_owner_username = contract_for_owner_details['fields'].get('Seller')
        if not merchant_owner_username:
            err_msg = f"Cannot determine resource owner: Original contract {original_contract_id_for_owner} has no Seller."
            log.error(f"{err_msg} Activity: {activity_guid}")
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            all_resources_transferred = False; break

        tracking_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                f"{{Asset}}='{_escape_airtable_value(delivery_person_username)}', "
                                f"{{AssetType}}='citizen', {{Owner}}='{_escape_airtable_value(merchant_owner_username)}')")
        try:
            tracking_resources = tables['resources'].all(formula=tracking_res_formula, max_records=1)
            if tracking_resources:
                tracking_res_record = tracking_resources[0]
                current_tracking_count = float(tracking_res_record['fields'].get('Count', 0))
                if current_tracking_count > amount: # Assuming amount is what's being delivered from this tracking stock
                    tables['resources'].update(tracking_res_record['id'], {'Count': current_tracking_count - amount})
                else: # Delivered all or more than was tracked (or exactly tracked amount)
                    tables['resources'].delete(tracking_res_record['id'])
                log.info(f"{LogColors.OKGREEN}Adjusted import-tracking resource {resource_type_id} for delivery citizen {delivery_person_username}.{LogColors.ENDC}")
            else:
                log.warning(f"Import-tracking resource {resource_type_id} not found for delivery citizen {delivery_person_username} (Owner: {merchant_owner_username}). This might indicate a prior issue or that the resource was already fully delivered/consumed from tracking stock.")
        except Exception as e_track:
            err_msg = f"Error adjusting import-tracking resource {resource_type_id} for {delivery_person_username}: {e_track}"
            log.error(err_msg)
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            all_resources_transferred = False; break

        # For building resources (AssetType='building'), Asset field uses BuildingId.
        # The Owner is the target_owner_username (RunBy or Owner of the building).
        # BuildingId field is also present for convenience.
        building_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
                                f"{{Asset}}='{_escape_airtable_value(to_building_id)}', " # Asset -> Asset
                                f"{{AssetType}}='building', "
                                f"{{Owner}}='{_escape_airtable_value(target_owner_username)}')")
        try:
            existing_building_resources = tables['resources'].all(formula=building_res_formula, max_records=1)
            # now_iso is already defined as Venice time ISO string
            if existing_building_resources:
                bres_record = existing_building_resources[0]
                new_count = float(bres_record['fields'].get('Count', 0)) + amount
                tables['resources'].update(bres_record['id'], {'Count': new_count})
                log.info(f"{LogColors.OKGREEN}Updated resource {resource_type_id} count in building {to_building_id} for {target_owner_username} to {new_count}.{LogColors.ENDC}")
            else:
                res_def = resource_defs.get(resource_type_id, {})
                building_pos_str = dest_building_record['fields'].get('Position', '{}')
                
                new_resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": resource_type_id,
                    "Name": res_def.get('name', resource_type_id),
                    # "Category": res_def.get('category', 'Unknown'), # Removed Category
                    "Asset": to_building_id,      # Asset field stores BuildingId (custom ID) for AssetType='building'
                    "AssetType": "building",
                    "Owner": target_owner_username,
                    "Count": amount,
                    # "Position": building_pos_str, # REMOVED
                    "CreatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload)
                log.info(f"{LogColors.OKGREEN}Created new resource {resource_type_id} in building {to_building_id} for {target_owner_username}.{LogColors.ENDC}")
        except Exception as e_deposit:
            err_msg = f"Error depositing resource {resource_type_id} into {to_building_id}: {e_deposit}"
            log.error(err_msg)
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            all_resources_transferred = False; break
            
    if not all_resources_transferred:
        # The specific error causing this was already logged and noted.
        log.error(f"Resource transfer failed for activity {activity_guid}. Financial transactions will be skipped.")
        # No need to call _update_activity_notes_with_failure_reason here as it was called at the point of specific failure.
        return False

    # Financial processing for the final delivery leg
    original_contract_custom_id = activity_fields.get('ContractId') # This should be the Original Custom Contract ID

    if not original_contract_custom_id:
        err_msg = "Activity is missing ContractId (expected Original Custom Contract ID) for financial processing."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    contract_record = get_contract_record(tables, original_contract_custom_id) # Fetches by custom ContractId
    if not contract_record:
        err_msg = f"Original contract {original_contract_custom_id} not found for financial processing."
        log.warning(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    contract_fields = contract_record['fields']
    seller_username = contract_fields.get('Seller') # The Seller is the merchant from the contract
    buyer_building_custom_id = contract_fields.get('BuyerBuilding')

    if not seller_username:
        err_msg = f"Contract {original_contract_custom_id} is missing a Seller."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    if not buyer_building_custom_id:
        err_msg = f"Contract {original_contract_custom_id} is missing BuyerBuilding."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    buyer_building_record = get_building_record(tables, buyer_building_custom_id)
    if not buyer_building_record:
        err_msg = f"BuyerBuilding {buyer_building_custom_id} (from contract {original_contract_custom_id}) not found."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    payer_username = buyer_building_record['fields'].get('RunBy') # This is the RunBy's Username
    if not payer_username:
        err_msg = f"BuyerBuilding {buyer_building_custom_id} (from contract {original_contract_custom_id}) has no RunBy."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False

    price_per_resource = float(contract_fields.get('PricePerResource', 0))
    
    # Calculate total cost based on actual resources delivered in THIS batch
    total_cost_for_this_delivery = 0
    delivered_items_details = []
    for item_delivered in resources_to_deliver: # resources_to_deliver is from activity_fields.get('Resources')
        res_type = item_delivered.get('ResourceId')
        amount_delivered = float(item_delivered.get('Amount', 0))
        
        if contract_fields.get('ResourceType') == res_type:
            total_cost_for_this_delivery += price_per_resource * amount_delivered
            delivered_items_details.append({"resource": res_type, "amount": amount_delivered, "cost_part": price_per_resource * amount_delivered})
        else:
            log.warning(f"Resource {res_type} in delivery batch for activity {activity_guid} does not match contract {original_contract_custom_id}'s resource type {contract_fields.get('ResourceType')}. This item's cost not included.")

    if total_cost_for_this_delivery <= 0:
        log.warning(f"Total cost for delivery in activity {activity_guid} is zero or negative. No payment processed. Items: {delivered_items_details}")
        return True

    payer_citizen_rec = get_citizen_record(tables, payer_username) # Payer is the RunBy
    merchant_citizen_rec = get_citizen_record(tables, seller_username) 
    italia_citizen_rec = get_citizen_record(tables, "Italia")

    if not payer_citizen_rec or not merchant_citizen_rec:
        err_msg = f"Payer (RunBy: {payer_username}) or Merchant ({seller_username}) citizen record not found for contract {original_contract_custom_id}."
        log.warning(f"{err_msg} Skipping payment. Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    if not italia_citizen_rec:
        err_msg = f"System citizen 'Italia' not found. Cannot process cost of goods for contract {original_contract_custom_id}."
        log.error(f"{err_msg} Activity: {activity_guid}")
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        return False
    
    try:
        payer_ducats = float(payer_citizen_rec['fields'].get('Ducats', 0))
        merchant_ducats_initial = float(merchant_citizen_rec['fields'].get('Ducats', 0))
        italia_ducats_initial = float(italia_citizen_rec['fields'].get('Ducats', 0))

        if payer_ducats < total_cost_for_this_delivery:
            err_msg = f"Payer (RunBy: {payer_username}) has insufficient funds ({payer_ducats:.2f}) for import payment ({total_cost_for_this_delivery:.2f}) for contract {original_contract_custom_id}."
            log.error(err_msg)
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
            # Trust impact: Payer failed to pay Seller
            if payer_username and seller_username:
                update_trust_score_for_activity(tables, payer_username, seller_username, TRUST_SCORE_FAILURE_MEDIUM, "payment", False, "insufficient_funds")
            return False

        # Calculate shares
        italia_share = total_cost_for_this_delivery * 0.5
        merchant_profit = total_cost_for_this_delivery - italia_share

        # Transaction 1: Payer (RunBy) pays Merchant full amount
        tables['citizens'].update(payer_citizen_rec['id'], {'Ducats': payer_ducats - total_cost_for_this_delivery})
        tables['citizens'].update(merchant_citizen_rec['id'], {'Ducats': merchant_ducats_initial + total_cost_for_this_delivery})
        log.info(f"{LogColors.OKGREEN}Payer (RunBy: {payer_username}) paid {total_cost_for_this_delivery:.2f} to Merchant {seller_username}.{LogColors.ENDC}")

        transaction_payload_buyer_to_merchant = {
            "Type": "import_payment_final",
            "AssetType": "contract",
            "Asset": original_contract_custom_id,
            "Seller": seller_username, # Merchant
            "Buyer": payer_username,   # Payer is the Occupant
            "Price": total_cost_for_this_delivery,
            "Notes": json.dumps({
                "delivered_items": delivered_items_details,
                "original_contract_resource_type": contract_fields.get('ResourceType'),
                "price_per_unit_contract": price_per_resource,
                "activity_guid": activity_guid,
                "note": "Full payment from building RunBy to merchant."
            }),
            "CreatedAt": now_iso, # Venice time ISO string
            "ExecutedAt": now_iso # Venice time ISO string
        }
        tables['transactions'].create(transaction_payload_buyer_to_merchant)
        log.info(f"{LogColors.OKGREEN}Created transaction: Payer (RunBy: {payer_username}) to Merchant {seller_username} for {total_cost_for_this_delivery:.2f} (Contract: {original_contract_custom_id}).{LogColors.ENDC}")

        # Transaction 2: Merchant pays "Italia" for cost of goods
        merchant_ducats_after_sale = merchant_ducats_initial + total_cost_for_this_delivery
        
        tables['citizens'].update(merchant_citizen_rec['id'], {'Ducats': merchant_ducats_after_sale - italia_share})
        tables['citizens'].update(italia_citizen_rec['id'], {'Ducats': italia_ducats_initial + italia_share})
        log.info(f"{LogColors.OKGREEN}Merchant {seller_username} paid {italia_share:.2f} to Italia (cost of goods).{LogColors.ENDC}")
        
        transaction_payload_merchant_to_italia = {
            "Type": "import_cost_of_goods",
            "AssetType": "contract_revenue_share",
            "Asset": original_contract_custom_id,
            "Seller": "Italia", 
            "Buyer": seller_username, # Merchant is "buying" from Italia
            "Price": italia_share,
            "Notes": json.dumps({
                "original_payer_runby": payer_username, # Log the actual payer (RunBy)
                "total_sale_price_to_payer": total_cost_for_this_delivery,
                "merchant_profit": merchant_profit,
                "activity_guid": activity_guid,
                "note": "Merchant's payment to Italia for cost of imported goods."
            }),
            "CreatedAt": now_iso, # Venice time ISO string
            "ExecutedAt": now_iso # Venice time ISO string
        }
        tables['transactions'].create(transaction_payload_merchant_to_italia)
        log.info(f"{LogColors.OKGREEN}Created transaction: Merchant {seller_username} to Italia for {italia_share:.2f} (Contract: {original_contract_custom_id}).{LogColors.ENDC}")

        # Trust impact: Successful payment from Payer to Seller
        if payer_username and seller_username:
            update_trust_score_for_activity(tables, payer_username, seller_username, TRUST_SCORE_SUCCESS_MEDIUM, "payment", True, "import_final")
        # Trust impact: Successful delivery by delivery_person to target_owner
        if delivery_person_username and target_owner_username: # target_owner_username determined earlier
            update_trust_score_for_activity(tables, delivery_person_username, target_owner_username, TRUST_SCORE_SUCCESS_SIMPLE, "delivery_goods", True) # Delivery itself is simple success

    except Exception as e_finance:
        err_msg = f"Error processing financial split for contract {original_contract_custom_id} (Payer RunBy: {payer_username}): {e_finance}"
        log.error(err_msg)
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, err_msg)
        # Trust impact: Financial processing error could affect Payer <-> Seller
        if payer_username and seller_username:
            update_trust_score_for_activity(tables, payer_username, seller_username, TRUST_SCORE_FAILURE_MEDIUM, "payment_processing", False, "system_error")
        return False 
    
    # Building UpdatedAt is handled by Airtable
    return True
