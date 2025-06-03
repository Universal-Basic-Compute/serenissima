"""
Processor for 'fetch_resource' activities.
Handles the pickup of resources by a citizen from a source building based on a contract.
The citizen buys the resources on behalf of the contract's buyer.
"""
import json
import logging
import math # Added import
import uuid
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any

# Import utility functions from activity_helpers to avoid circular imports
from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    get_contract_record,
    _escape_airtable_value,
    LogColors,
    get_citizen_effective_carry_capacity, # Gets max capacity for a specific citizen
    DEFAULT_CITIZEN_CARRY_CAPACITY, # Fallback if needed, though helper is preferred
    VENICE_TIMEZONE # Assuming VENICE_TIMEZONE might be used
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM

log = logging.getLogger(__name__)

# CITIZEN_STORAGE_CAPACITY = 10.0 # Replaced by get_citizen_effective_carry_capacity

# Moved get_building_record_by_airtable_id to be a local helper or imported if shared
def _get_building_by_airtable_id(tables: Dict[str, Any], airtable_record_id: str) -> Optional[Dict]:
    """Fetches a building record by its Airtable Record ID."""
    try:
        building_record = tables['buildings'].get(airtable_record_id)
        if building_record:
            return building_record
        log.warning(f"Building record with Airtable ID {airtable_record_id} not found.")
        return None
    except Exception as e:
        log.error(f"Error fetching building record by Airtable ID {airtable_record_id}: {e}")
        return None

def get_citizen_current_load(tables: Dict[str, Any], citizen_username: str) -> float:
    """Calculates the total count of resources currently carried by a citizen."""
    # Assumes Asset field stores Username for AssetType='citizen'
    formula = f"AND({{Asset}}='{_escape_airtable_value(citizen_username)}', {{AssetType}}='citizen')"
    current_load = 0.0
    try:
        resources_carried = tables['resources'].all(formula=formula)
        for resource in resources_carried:
            current_load += float(resource['fields'].get('Count', 0))
        log.info(f"Citizen {citizen_username} is currently carrying {current_load} units of resources.")
    except Exception as e:
        log.error(f"Error calculating current load for citizen {citizen_username}: {e}")
    return current_load

def get_source_building_resource_stock(
    tables: Dict[str, Any], 
    building_custom_id: str, 
    resource_type_id: str, 
    owner_username: str
) -> float:
    """Gets the stock of a specific resource type in a building owned by a specific user."""
    formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{Asset}}='{_escape_airtable_value(building_custom_id)}', "
               f"{{AssetType}}='building', "
               f"{{Owner}}='{_escape_airtable_value(owner_username)}')")
    try:
        records = tables['resources'].all(formula=formula, max_records=1)
        if records:
            return float(records[0]['fields'].get('Count', 0))
        return 0.0
    except Exception as e:
        log.error(f"Error fetching stock for resource {resource_type_id} in building {building_custom_id} for owner {owner_username}: {e}")
        return 0.0

def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, # Not directly used here but part of signature
    resource_defs: Dict
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'fetch_resource' activity: {activity_guid}")

    carrier_username = activity_fields.get('Citizen')
    # ContractId in activity is now the custom ContractId string
    contract_custom_id_from_activity = activity_fields.get('ContractId')
    # FromBuilding in activity is now the custom BuildingId of the source building
    from_building_custom_id_from_activity = activity_fields.get('FromBuilding')
    
    # --- Determine resource type and amount ---
    contract_record = None
    contract_fields = {}
    resource_id_to_fetch = None
    desired_amount_to_fetch = 0.0

    if contract_custom_id_from_activity:
        try:
            formula = f"{{ContractId}} = '{_escape_airtable_value(contract_custom_id_from_activity)}'"
            contract_records = tables['contracts'].all(formula=formula, max_records=1)
            if not contract_records:
                log.error(f"Contract with custom ID '{contract_custom_id_from_activity}' not found for activity {activity_guid}.")
                return False
            contract_record = contract_records[0]
            contract_fields = contract_record['fields']
            resource_id_to_fetch = contract_fields.get('ResourceType')
            desired_amount_to_fetch = float(contract_fields.get('TargetAmount', 0))
            log.info(f"Activity {activity_guid} is linked to contract '{contract_custom_id_from_activity}'. Resource: {resource_id_to_fetch}, Amount: {desired_amount_to_fetch}")
        except Exception as e_contract_fetch:
            log.error(f"Error fetching contract by custom ID '{contract_custom_id_from_activity}': {e_contract_fetch}")
            return False
    else:
        # No ContractId, try to get resource info from the 'Resources' field
        resources_str = activity_fields.get('Resources')
        if resources_str:
            try:
                resources_list = json.loads(resources_str)
                if isinstance(resources_list, list) and len(resources_list) > 0:
                    # Assuming the first item in the list is the one we care about for non-contract fetches
                    resource_item = resources_list[0]
                    resource_id_to_fetch = resource_item.get('ResourceId')
                    desired_amount_to_fetch = float(resource_item.get('Amount', 0))
                    log.info(f"Activity {activity_guid} has no contract. Fetched from Resources field: Resource: {resource_id_to_fetch}, Amount: {desired_amount_to_fetch}")
                else:
                    log.error(f"Activity {activity_guid} 'Resources' field is not a valid list or is empty: {resources_str}")
                    return False
            except (json.JSONDecodeError, TypeError, ValueError, IndexError) as e_resources:
                log.error(f"Error parsing Resources field for activity {activity_guid}: {resources_str}. Error: {e_resources}")
                return False
        else:
            log.error(f"Activity {activity_guid} is missing ContractId and has no Resources field for resource info.")
            return False

    if not all([carrier_username, from_building_custom_id_from_activity, resource_id_to_fetch, desired_amount_to_fetch > 0]):
        log.error(f"Activity {activity_guid} is missing crucial data (Carrier: {carrier_username}, FromBuilding: {from_building_custom_id_from_activity}, Resource: {resource_id_to_fetch}, Amount: {desired_amount_to_fetch}). Contract Custom ID was: {contract_custom_id_from_activity}")
        return False

    # 1. Fetch records
    carrier_citizen_record = get_citizen_record(tables, carrier_username)
    if not carrier_citizen_record:
        log.error(f"Carrier citizen {carrier_username} not found for activity {activity_guid}.")
        return False
    # carrier_custom_id = carrier_citizen_record['fields'].get('CitizenId') # Still useful for logging if needed
    carrier_airtable_id = carrier_citizen_record['id']
    # Username (carrier_username) is now the primary key for Asset field for citizen resources

    # contract_record is already fetched using contract_custom_id_from_activity if it was present.
    # If contract_custom_id_from_activity was None, contract_record will be None.
    # destination_building_for_fetch_activity_custom_id is the ToBuilding from the activity, can be None.
    
    buyer_username_from_contract = None
    seller_username_from_contract = None # Seller from the contract (if direct contract)
    price_per_resource = 0.0

    if contract_record: # contract_record is guaranteed to be valid here due to earlier checks if it's not None
        contract_fields = contract_record['fields']
        buyer_username_from_contract = contract_fields.get('Buyer')
        seller_username_from_contract = contract_fields.get('Seller')
        price_per_resource = float(contract_fields.get('PricePerResource', 0))

    effective_buyer_username = None
    destination_building_for_fetch_activity_custom_id = activity_fields.get('ToBuilding')

    # Determine effective_buyer_username
    if contract_record:
        buyer_username_from_contract = contract_fields.get('Buyer')
        seller_username_from_contract = contract_fields.get('Seller') # Seller from the contract
        price_per_resource = float(contract_fields.get('PricePerResource', 0))

        if buyer_username_from_contract and buyer_username_from_contract.lower() == 'public':
            # Public sell contract
            if destination_building_for_fetch_activity_custom_id:
                # Citizen is fetching for a specific building
                destination_building_record = get_building_record(tables, destination_building_for_fetch_activity_custom_id)
                if not destination_building_record:
                    log.error(f"ToBuilding {destination_building_for_fetch_activity_custom_id} from activity {activity_guid} not found. Cannot determine effective buyer for public_sell.")
                    return False
                effective_buyer_username = destination_building_record['fields'].get('RunBy') or destination_building_record['fields'].get('Owner')
                log.info(f"Public sell contract. Effective buyer is operator of ToBuilding ({destination_building_for_fetch_activity_custom_id}): {effective_buyer_username}")
            else:
                # Citizen is fetching for themselves (e.g., homeless person buying food)
                effective_buyer_username = carrier_username
                log.info(f"Public sell contract with no ToBuilding. Effective buyer is the carrier: {carrier_username}")
        else:
            # Direct contract: buyer is from the contract
            effective_buyer_username = buyer_username_from_contract
            log.info(f"Direct contract. Effective buyer is from contract: {effective_buyer_username}")
    else:
        # No contract specified (e.g., internal workshop fetch, or citizen fetching for self without a formal contract in activity)
        price_per_resource = 0.0 # No contract, so price is effectively 0 for this transaction logic, or handled by other means
        if destination_building_for_fetch_activity_custom_id:
            # Fetching for a specific building (e.g., workshop restocking from a public source without a direct contract in activity)
            destination_building_record = get_building_record(tables, destination_building_for_fetch_activity_custom_id)
            if not destination_building_record:
                log.error(f"ToBuilding {destination_building_for_fetch_activity_custom_id} from activity {activity_guid} not found. Cannot determine effective buyer for non-contract fetch.")
                return False
            effective_buyer_username = destination_building_record['fields'].get('RunBy') or destination_building_record['fields'].get('Owner')
            log.info(f"No contract. Effective buyer is operator of ToBuilding ({destination_building_for_fetch_activity_custom_id}): {effective_buyer_username}")
        else:
            # Fetching for self, no contract, no specific ToBuilding (e.g. homeless buying food and it goes to inventory)
            effective_buyer_username = carrier_username
            log.info(f"No contract and no ToBuilding. Effective buyer is the carrier: {carrier_username}")

    if not effective_buyer_username:
        log.error(f"Could not determine effective buyer for activity {activity_guid}. Fallback.")
        return False

    # Fetch source building record using its custom BuildingId from the activity
    from_building_record = get_building_record(tables, from_building_custom_id_from_activity)
    if not from_building_record:
        log.error(f"Source building with custom ID '{from_building_custom_id_from_activity}' not found.")
        return False
    
    # The custom ID from the activity is the one we use
    from_building_custom_id = from_building_custom_id_from_activity
    from_building_operator = from_building_record['fields'].get('RunBy') or from_building_record['fields'].get('Owner')
    from_building_position_str = from_building_record['fields'].get('Position', '{}')

    # Effective seller is always the operator of the FromBuilding
    effective_seller_username = from_building_operator
    if not effective_seller_username:
        log.error(f"Source building {from_building_custom_id} has no operator/owner to act as seller.")
        return False

    buyer_citizen_record = get_citizen_record(tables, effective_buyer_username) # Use effective_buyer_username
    seller_citizen_record = get_citizen_record(tables, effective_seller_username)

    if not buyer_citizen_record:
        log.error(f"Effective buyer citizen {effective_buyer_username} not found.")
        return False
    if not seller_citizen_record:
        log.error(f"Seller citizen {effective_seller_username} not found.")
        return False

    buyer_ducats = float(buyer_citizen_record['fields'].get('Ducats', 0))
    seller_ducats = float(seller_citizen_record['fields'].get('Ducats', 0)) # For crediting

    # 2. Calculate capacity and availability
    carrier_current_load = get_citizen_current_load(tables, carrier_username) # Use username
    # Fetch carrier_citizen_record if not already available (it is, as carrier_citizen_record)
    fetcher_max_capacity = get_citizen_effective_carry_capacity(carrier_citizen_record)
    carrier_remaining_capacity = max(0, fetcher_max_capacity - carrier_current_load)

    raw_stock_at_source = get_source_building_resource_stock(tables, from_building_custom_id, resource_id_to_fetch, effective_seller_username)
    effective_stock_at_source = math.floor(raw_stock_at_source)
    log.info(f"Stock at source for {resource_id_to_fetch} in {from_building_custom_id}: Raw={raw_stock_at_source}, Effective (floor)={effective_stock_at_source}")

    # 3. Determine actual amount to purchase
    amount_to_purchase = desired_amount_to_fetch
    if amount_to_purchase > effective_stock_at_source:
        log.info(f"Desired amount {desired_amount_to_fetch} of {resource_id_to_fetch} exceeds effective stock {effective_stock_at_source} at {from_building_custom_id}. Limiting to effective stock.")
        amount_to_purchase = effective_stock_at_source
    
    if amount_to_purchase > carrier_remaining_capacity:
        log.info(f"Amount {amount_to_purchase} of {resource_id_to_fetch} exceeds carrier {carrier_username} capacity {carrier_remaining_capacity} (Max: {fetcher_max_capacity}, Current Load: {carrier_current_load}). Limiting to capacity.")
        amount_to_purchase = carrier_remaining_capacity

    max_affordable_by_buyer = (buyer_ducats / price_per_resource) if price_per_resource > 0 else float('inf')
    if amount_to_purchase > max_affordable_by_buyer:
        log.info(f"Amount {amount_to_purchase} of {resource_id_to_fetch} exceeds buyer {effective_buyer_username} affordability ({max_affordable_by_buyer}). Limiting to affordable.")
        amount_to_purchase = max_affordable_by_buyer
    
    amount_to_purchase = float(f"{amount_to_purchase:.4f}") # Standardize precision

    if amount_to_purchase <= 0.001: # Use epsilon for float comparison
        log.info(f"Calculated amount to purchase for {resource_id_to_fetch} is {amount_to_purchase}. Nothing to fetch for activity {activity_guid}.")
        # Update carrier's position to FromBuilding as they arrived there
        try:
            tables['citizens'].update(carrier_airtable_id, {
                'Position': from_building_position_str,
            })
            log.info(f"Updated carrier {carrier_username} position to {from_building_custom_id} ({from_building_position_str}) as part of fetch (no items).")
        except Exception as e_pos_update:
            log.error(f"Error updating carrier {carrier_username} position: {e_pos_update}")
            # Trust impact: If carrier fails to arrive (position update fails), it's a failure for the buyer.
            if carrier_username and effective_buyer_username:
                 update_trust_score_for_activity(tables, carrier_username, effective_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_arrival", False, "position_update_failed")
            return False # Position update is critical for flow
        
        # If nothing to purchase due to stock, capacity, or affordability, it's a failure for the involved parties.
        # This needs careful attribution.
        # If due to stock: effective_buyer vs effective_seller
        # If due to carrier capacity: carrier vs effective_buyer
        # If due to buyer funds: effective_buyer vs effective_seller
        # For simplicity now, if amount_to_purchase is 0 due to any of these, let's consider it a general fetch failure.
        if desired_amount_to_fetch > 0: # Only penalize if they actually wanted something
            if carrier_username and effective_buyer_username: # Carrier failed the buyer
                # Ensure carrier and buyer are different before updating trust
                if carrier_username != effective_buyer_username:
                    update_trust_score_for_activity(tables, carrier_username, effective_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_pickup", False, "nothing_to_pickup")
                else:
                    log.info(f"Skipping trust update for fetch_pickup: carrier ({carrier_username}) and effective_buyer ({effective_buyer_username}) are the same.")
            
            if effective_buyer_username and effective_seller_username: # Buyer couldn't get from seller
                # Ensure buyer and seller are different before updating trust
                if effective_buyer_username != effective_seller_username:
                    update_trust_score_for_activity(tables, effective_buyer_username, effective_seller_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_purchase", False, "nothing_to_pickup")
                else:
                    log.info(f"Skipping trust update for fetch_purchase: effective_buyer ({effective_buyer_username}) and effective_seller ({effective_seller_username}) are the same.")
        
        # Note: In the new architecture, we don't create follow-up activities here.
        # The activity creator should have already created the entire chain.
        return True

    # 4. Perform Transactions
    # VENICE_TIMEZONE is imported from activity_helpers
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()
    total_cost = amount_to_purchase * price_per_resource

    try:
        # Financial transaction
        tables['citizens'].update(buyer_citizen_record['id'], {'Ducats': buyer_ducats - total_cost})
        tables['citizens'].update(seller_citizen_record['id'], {'Ducats': seller_ducats + total_cost})
        log.info(f"Transferred {total_cost} ducats from buyer {effective_buyer_username} to seller {effective_seller_username}.")

        transaction_payload = {
            "Type": "resource_purchase_on_fetch",
            "AssetType": "contract" if contract_record else "internal_transfer",
            "Asset": contract_custom_id_from_activity if contract_record else f"internal_{from_building_custom_id}_to_{destination_building_for_fetch_activity_custom_id or 'inventory'}",
            "Seller": effective_seller_username,
            "Buyer": effective_buyer_username,
            "Price": total_cost, # Will be 0 if no contract or price is 0
            "Notes": json.dumps({
                "resource_type": resource_id_to_fetch,
                "amount": amount_to_purchase,
                "price_per_unit": price_per_resource,
                "carrier_citizen": carrier_username,
                "source_building": from_building_custom_id,
                "activity_guid": activity_guid
            }),
            "CreatedAt": now_iso,
            "ExecutedAt": now_iso
        }
        tables['transactions'].create(transaction_payload)
        log.info(f"{LogColors.OKGREEN}Created transaction record for fetch activity {activity_guid}.{LogColors.ENDC}")

        # Decrement resource from source building
        source_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_id_to_fetch)}', "
                              f"{{Asset}}='{_escape_airtable_value(from_building_custom_id)}', " # Asset -> Asset
                              f"{{AssetType}}='building', "
                              f"{{Owner}}='{_escape_airtable_value(effective_seller_username)}')")
        source_res_records = tables['resources'].all(formula=source_res_formula, max_records=1)
        if source_res_records:
            source_res_record = source_res_records[0]
            new_source_count = float(source_res_record['fields'].get('Count', 0)) - amount_to_purchase
            if new_source_count > 0.001:
                tables['resources'].update(source_res_record['id'], {'Count': new_source_count})
            else:
                tables['resources'].delete(source_res_record['id'])
            log.info(f"{LogColors.OKGREEN}Decremented {amount_to_purchase} of {resource_id_to_fetch} from building {from_building_custom_id}.{LogColors.ENDC}")
        else:
            log.error(f"Resource {resource_id_to_fetch} vanished from source {from_building_custom_id} before decrement. Critical error.")
            return False # Data consistency issue

        # Add resource to carrier citizen's inventory
        carrier_res_formula = (f"AND({{Type}}='{_escape_airtable_value(resource_id_to_fetch)}', "
                               f"{{Asset}}='{_escape_airtable_value(carrier_username)}', " # Asset -> Asset, use Username
                               f"{{AssetType}}='citizen', "
                               f"{{Owner}}='{_escape_airtable_value(effective_buyer_username)}')") # Owned by the effective_buyer_username
        existing_carrier_res = tables['resources'].all(formula=carrier_res_formula, max_records=1)
        res_def_details = resource_defs.get(resource_id_to_fetch, {})

        if existing_carrier_res:
            carrier_res_record = existing_carrier_res[0]
            new_carrier_count = float(carrier_res_record['fields'].get('Count', 0)) + amount_to_purchase
            tables['resources'].update(carrier_res_record['id'], {'Count': new_carrier_count})
            log.info(f"{LogColors.OKGREEN}Updated {resource_id_to_fetch} for carrier {carrier_username} to {new_carrier_count} (owned by {effective_buyer_username}).{LogColors.ENDC}")
        else:
            new_carrier_res_payload = {
                "ResourceId": f"resource-{uuid.uuid4()}",
                "Type": resource_id_to_fetch,
                "Name": res_def_details.get('name', resource_id_to_fetch),
                # "Category": res_def_details.get('category', 'Unknown'), # Removed Category
                "Asset": carrier_username, # Asset -> Asset, use Username
                "AssetType": "citizen",
                "Owner": effective_buyer_username, # Resources on citizen are owned by the effective_buyer_username
                "Count": amount_to_purchase,
                # "Position": from_building_position_str, # Citizen is at FromBuilding - REMOVED
                "CreatedAt": now_iso
            }
            tables['resources'].create(new_carrier_res_payload)
            log.info(f"{LogColors.OKGREEN}Created {amount_to_purchase} of {resource_id_to_fetch} for carrier {carrier_username} (owned by {effective_buyer_username}).{LogColors.ENDC}")

        # Update carrier's position to FromBuilding
        tables['citizens'].update(carrier_airtable_id, {
            'Position': from_building_position_str
        })
        log.info(f"{LogColors.OKGREEN}Updated carrier {carrier_username} position to {from_building_custom_id} ({from_building_position_str}).{LogColors.ENDC}")

        # Trust impact: Successful fetch and payment
        if carrier_username and effective_buyer_username: # Carrier succeeded for buyer
            update_trust_score_for_activity(tables, carrier_username, effective_buyer_username, TRUST_SCORE_SUCCESS_SIMPLE, "fetch_pickup", True) # Pickup is simple success
        if effective_buyer_username and effective_seller_username: # Buyer successfully paid seller
            update_trust_score_for_activity(tables, effective_buyer_username, effective_seller_username, TRUST_SCORE_SUCCESS_MEDIUM, "fetch_purchase", True) # Payment is medium

    except Exception as e_process:
        log.error(f"Error during transaction processing for activity {activity_guid}: {e_process}")
        import traceback
        log.error(traceback.format_exc())
        # Trust impact: Transaction processing error
        if carrier_username and effective_buyer_username: # Carrier part
            update_trust_score_for_activity(tables, carrier_username, effective_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_processing", False, "system_error_carrier")
        if effective_buyer_username and effective_seller_username: # Payment part
            update_trust_score_for_activity(tables, effective_buyer_username, effective_seller_username, TRUST_SCORE_FAILURE_MEDIUM, "fetch_processing", False, "system_error_payment")
        return False

    # Update activity notes if amount fetched is different from desired
    if abs(amount_to_purchase - desired_amount_to_fetch) > 0.001:
        original_notes = activity_fields.get('Notes', '')
        updated_notes = f"{original_notes} (Picked up {amount_to_purchase:.2f} instead of {desired_amount_to_fetch:.2f} due to limitations)."
        try:
            tables['activities'].update(activity_id_airtable, {'Notes': updated_notes})
        except Exception as e_notes:
            log.warning(f"Failed to update notes for activity {activity_guid}: {e_notes}")
            
    log.info(f"{LogColors.OKGREEN}Successfully processed 'fetch_resource' activity {activity_guid}. Fetched {amount_to_purchase} of {resource_id_to_fetch}.{LogColors.ENDC}")
    
    # Note: In the new architecture, we don't create follow-up activities here.
    # The activity creator should have already created the entire chain.
    # Building UpdatedAt is handled by Airtable
    return True
