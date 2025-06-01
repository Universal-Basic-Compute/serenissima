"""
Processor for 'eat' activities.
Handles consumption of food from inventory, home, or tavern.
Updates citizen's 'AteAt' timestamp.
"""
import json
import logging
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, Optional, Any

# Import from activity_helpers to avoid circular imports
from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    _escape_airtable_value,
    VENICE_TIMEZONE, # Import VENICE_TIMEZONE if used for now_iso
    LogColors # Assuming LogColors might be useful here too
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM

log = logging.getLogger(__name__)

# Standard amount of "hunger" one meal satisfies, or a generic food unit.
# This could be more complex if different foods satisfy different hunger amounts.
FOOD_UNIT_CONSUMED = 1.0 
TAVERN_MEAL_COST = 10 # Ducats

def _update_citizen_ate_at(tables: Dict[str, Any], citizen_airtable_id: str, timestamp_iso: str) -> bool:
    """Helper to update AteAt for a citizen."""
    # VENICE_TIMEZONE should be defined in the calling function if timestamp_iso is generated there
    try:
        tables['citizens'].update(citizen_airtable_id, {
            'AteAt': timestamp_iso # Expecting timestamp_iso to be already in Venice time
        })
        return True
    except Exception as e:
        log.error(f"Error updating AteAt for citizen {citizen_airtable_id}: {e}")
        return False

def process_eat_from_inventory(
    tables: Dict[str, Any],
    activity_record: Dict,
    resource_defs: Dict # For food details if needed in future
) -> bool:
    """Processes an 'eat_from_inventory' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    
    food_resource_type_to_eat = None
    amount_to_eat = FOOD_UNIT_CONSUMED # Default

    resources_json_str = activity_fields.get('Resources')
    if resources_json_str:
        try:
            resources_list = json.loads(resources_json_str)
            if isinstance(resources_list, list) and len(resources_list) == 1:
                food_resource_type_to_eat = resources_list[0].get('ResourceId')
                amount_to_eat = float(resources_list[0].get('Amount', FOOD_UNIT_CONSUMED))
            else:
                log.error(f"Invalid format in Resources JSON for activity {activity_guid}: {resources_json_str}. Expected list with one item.")
                return False # Fail if Resources field is malformed
        except json.JSONDecodeError:
            log.error(f"Could not parse Resources JSON for activity {activity_guid}: {resources_json_str}")
            return False # Fail if JSON is invalid
    
    if not food_resource_type_to_eat:
        log.error(f"No food resource type specified in Resources field for 'eat_from_inventory' activity {activity_guid}.")
        return False

    log.info(f"Processing 'eat_from_inventory' ({activity_guid}) for {citizen_username}, attempting to eat {amount_to_eat} of {food_resource_type_to_eat}")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False
    
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()

    # Attempt to eat the specified food from inventory
    resource_formula = (f"AND({{AssetType}}='citizen', "
                        f"{{Asset}}='{_escape_airtable_value(citizen_username)}', "
                        f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                        f"{{Type}}='{_escape_airtable_value(food_resource_type_to_eat)}')")
    try:
        inventory_food_records = tables['resources'].all(formula=resource_formula, max_records=1)
        if inventory_food_records:
            food_record = inventory_food_records[0]
            current_inventory_amount = float(food_record['fields'].get('Count', 0))

            if current_inventory_amount >= amount_to_eat:
                new_amount = current_inventory_amount - amount_to_eat
                if new_amount > 0.001:
                    tables['resources'].update(food_record['id'], {'Count': new_amount})
                else:
                    tables['resources'].delete(food_record['id'])
                
                log.info(f"{LogColors.OKGREEN}Citizen {citizen_username} consumed {amount_to_eat} of {food_resource_type_to_eat} from inventory. New amount: {new_amount if new_amount > 0.001 else 0}{LogColors.ENDC}")
                return _update_citizen_ate_at(tables, citizen_record['id'], now_iso)
            else:
                log.warning(f"Not enough {food_resource_type_to_eat} ({current_inventory_amount}) in {citizen_username}'s inventory to eat {amount_to_eat}.")
                return False
        else:
            log.warning(f"Food {food_resource_type_to_eat} not found in {citizen_username}'s inventory for activity {activity_guid}.")
            return False
    
    except Exception as e_inv:
        log.error(f"Error processing 'eat_from_inventory' (inventory check) for {citizen_username} ({activity_guid}): {e_inv}")
        return False

    # Note: In the new architecture, we don't attempt to buy food at current location if inventory check fails.
    # This should be handled by a separate activity created by an activity creator, not by this processor.
    # The following code is removed as it creates a follow-up activity logic within the processor.
    
    # Note: All the fallback food purchase logic has been removed.
    # In the new architecture, if eating from inventory fails, the processor should simply return False.
    # A separate activity for buying food should be created by an activity creator, not by this processor.
    return False

def process_eat_at_home(
    tables: Dict[str, Any],
    activity_record: Dict,
    resource_defs: Dict
) -> bool:
    """Processes an 'eat_at_home' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    # FromBuilding in activity is now the custom BuildingId of the home
    home_building_custom_id_from_activity = activity_fields.get('FromBuilding') 
    food_resource_type = activity_fields.get('ResourceId')
    amount_to_eat = float(activity_fields.get('Amount', FOOD_UNIT_CONSUMED))

    log.info(f"Processing 'eat_at_home' ({activity_guid}) for {citizen_username} at {home_building_custom_id_from_activity}, eating {food_resource_type}")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False

    # Fetch home building record using its custom BuildingId from the activity
    home_building_record = get_building_record(tables, home_building_custom_id_from_activity)
    if not home_building_record:
        log.error(f"Home building with custom ID '{home_building_custom_id_from_activity}' not found for activity {activity_guid}.")
        return False
    
    # The custom ID from the activity is the one we use
    home_building_custom_id = home_building_custom_id_from_activity
    
    # Resource is identified by AssetType='building', Asset=home_building_custom_id, Owner=citizen_username, Type=food_resource_type
    resource_formula = (f"AND({{AssetType}}='building', "
                        f"{{Asset}}='{_escape_airtable_value(home_building_custom_id)}', "
                        f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                        f"{{Type}}='{_escape_airtable_value(food_resource_type)}')")
    try:
        food_records = tables['resources'].all(formula=resource_formula, max_records=1)
        if not food_records:
            log.warning(f"Food {food_resource_type} not found in home {home_building_custom_id} for {citizen_username} (activity {activity_guid}).")
            return False

        food_record = food_records[0]
        current_price = float(food_record['fields'].get('Count', 0))

        if current_price < amount_to_eat:
            log.warning(f"Not enough {food_resource_type} ({current_price}) in home {home_building_custom_id} to eat {amount_to_eat} for activity {activity_guid}.")
            amount_to_eat = current_price
            if amount_to_eat <= 0: return False

        new_amount = current_price - amount_to_eat
        from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()

        if new_amount > 0.001:
            tables['resources'].update(food_record['id'], {'Count': new_amount})
        else:
            tables['resources'].delete(food_record['id'])
        
        log.info(f"{LogColors.OKGREEN}Citizen {citizen_username} consumed {amount_to_eat} of {food_resource_type} at home {home_building_custom_id}. New amount: {new_amount if new_amount > 0.001 else 0}{LogColors.ENDC}")
        
        if _update_citizen_ate_at(tables, citizen_record['id'], now_iso):
            # Building UpdatedAt is handled by Airtable
            return True
        return False

    except Exception as e:
        log.error(f"Error processing 'eat_at_home' for {citizen_username} ({activity_guid}): {e}")
        return False

def process_eat_at_tavern(
    tables: Dict[str, Any],
    activity_record: Dict,
    resource_defs: Dict # Not used for tavern, but for signature consistency
) -> bool:
    """Processes an 'eat_at_tavern' activity."""
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    # FromBuilding in activity is now the custom BuildingId of the tavern
    tavern_building_custom_id_from_activity = activity_fields.get('FromBuilding')
    activity_details_str = activity_fields.get('Details')
    activity_details: Optional[Dict[str, Any]] = None
    if activity_details_str:
        try:
            activity_details = json.loads(activity_details_str)
        except json.JSONDecodeError:
            log.warning(f"Could not parse Details JSON for activity {activity_guid}: {activity_details_str}")

    log.info(f"Processing 'eat_at_tavern' ({activity_guid}) for {citizen_username} at {tavern_building_custom_id_from_activity}")

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found for activity {activity_guid}.")
        return False

    # Fetch tavern building record using its custom BuildingId from the activity
    tavern_record = get_building_record(tables, tavern_building_custom_id_from_activity)
    if not tavern_record:
        log.error(f"Tavern building with custom ID '{tavern_building_custom_id_from_activity}' not found for activity {activity_guid}.")
        return False
    
    # The custom ID from the activity is the one we use
    tavern_building_custom_id = tavern_building_custom_id_from_activity

    current_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    meal_cost = TAVERN_MEAL_COST
    food_resource_id_consumed = None
    original_sell_contract_id = None # Custom ID of the public_sell contract

    if activity_details and activity_details.get("is_retail_purchase"):
        food_resource_id_consumed = activity_details.get("food_resource_id")
        meal_cost = float(activity_details.get("price", TAVERN_MEAL_COST)) # Use price from details, fallback to default
        original_sell_contract_id = activity_details.get("original_contract_id")
        log.info(f"Retail purchase detected: Food={food_resource_id_consumed}, Price={meal_cost}, Contract={original_sell_contract_id}")

    if current_ducats < meal_cost:
        log.warning(f"Citizen {citizen_username} has insufficient Ducats ({current_ducats}) for meal (cost: {meal_cost}) for activity {activity_guid}.")
        # Trust: Citizen failed to pay Tavern Operator
        tavern_operator_for_trust = tavern_record['fields'].get('RunBy') or tavern_record['fields'].get('Owner')
        if citizen_username and tavern_operator_for_trust:
            update_trust_score_for_activity(tables, citizen_username, tavern_operator_for_trust, TRUST_SCORE_FAILURE_MEDIUM, "eat_at_tavern_payment", False, "insufficient_funds")
        return False
    
    try:
        new_ducats = current_ducats - meal_cost
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        
        tables['citizens'].update(citizen_record['id'], {'Ducats': new_ducats})
        log.info(f"{LogColors.OKGREEN}Citizen {citizen_username} paid {meal_cost:.2f} Ducats for a meal. New balance: {new_ducats:.2f}{LogColors.ENDC}")
        
        tavern_operator = tavern_record['fields'].get('RunBy') or tavern_record['fields'].get('Owner', "UnknownTavernOperator")
        
        transaction_type = "retail_food_purchase" if food_resource_id_consumed else "tavern_meal"
        transaction_notes = {
            "activity_guid": activity_guid,
            "location_id": tavern_building_custom_id
        }
        if food_resource_id_consumed:
            transaction_notes["food_resource_id"] = food_resource_id_consumed
            transaction_notes["original_sell_contract_id"] = original_sell_contract_id

        transaction_payload = {
            "Type": transaction_type,
            "AssetType": "building",
            "Asset": tavern_building_custom_id,
            "Seller": tavern_operator,
            "Buyer": citizen_username,
            "Price": meal_cost,
            "Notes": json.dumps(transaction_notes),
            "CreatedAt": now_iso,
            "ExecutedAt": now_iso
        }
        tables['transactions'].create(transaction_payload)
        log.info(f"{LogColors.OKGREEN}Created transaction record for {citizen_username}'s {transaction_type}.{LogColors.ENDC}")
        
        operator_record = get_citizen_record(tables, tavern_operator)
        if operator_record:
            operator_ducats = float(operator_record['fields'].get('Ducats', 0))
            tables['citizens'].update(operator_record['id'], {'Ducats': operator_ducats + meal_cost})
            log.info(f"{LogColors.OKGREEN}Credited operator {tavern_operator} with {meal_cost:.2f} Ducats.{LogColors.ENDC}")
        else:
            log.warning(f"Could not find operator {tavern_operator} to credit meal cost.")

        # If it was a retail purchase, decrement the public_sell contract
        if food_resource_id_consumed and original_sell_contract_id:
            contract_to_update = tables['contracts'].all(formula=f"{{ContractId}}='{_escape_airtable_value(original_sell_contract_id)}'", max_records=1)
            if contract_to_update:
                contract_record_airtable_id = contract_to_update[0]['id']
                current_target_amount = float(contract_to_update[0]['fields'].get('TargetAmount', 0))
                new_target_amount = current_target_amount - FOOD_UNIT_CONSUMED # Assume 1 unit consumed
                
                update_payload_contract = {'TargetAmount': new_target_amount}
                if new_target_amount <= 0:
                    update_payload_contract['Status'] = 'completed' # Or 'inactive'
                    log.info(f"Public_sell contract {original_sell_contract_id} for {food_resource_id_consumed} is now depleted. Setting status to completed.")
                
                tables['contracts'].update(contract_record_airtable_id, update_payload_contract)
                log.info(f"Decremented TargetAmount for public_sell contract {original_sell_contract_id} (Food: {food_resource_id_consumed}). New amount: {new_target_amount:.2f}")
            else:
                log.warning(f"Could not find original public_sell contract {original_sell_contract_id} to decrement for retail purchase.")

        if _update_citizen_ate_at(tables, citizen_record['id'], now_iso):
            # Trust: Successful meal purchase
            if citizen_username and tavern_operator: # tavern_operator defined earlier
                update_trust_score_for_activity(tables, citizen_username, tavern_operator, TRUST_SCORE_SUCCESS_MEDIUM, "eat_at_tavern_payment", True)
            return True
        return False # Failed to update AteAt
        
    except Exception as e:
        log.error(f"Error processing '{transaction_type}' for {citizen_username} ({activity_guid}): {e}")
        # Trust: System error during payment/processing
        tavern_operator_for_trust_error = tavern_record['fields'].get('RunBy') or tavern_record['fields'].get('Owner')
        if citizen_username and tavern_operator_for_trust_error:
            update_trust_score_for_activity(tables, citizen_username, tavern_operator_for_trust_error, TRUST_SCORE_FAILURE_MEDIUM, "eat_at_tavern_processing", False, "system_error")
        return False

# Main dispatcher for eat activities (if needed, or call specific processors directly)
def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, # Not used by eat processors but part of general signature
    resource_defs: Dict
) -> bool:
    activity_type = activity_record['fields'].get('Type')
    if activity_type == "eat_from_inventory":
        return process_eat_from_inventory(tables, activity_record, resource_defs)
    elif activity_type == "eat_at_home":
        return process_eat_at_home(tables, activity_record, resource_defs)
    elif activity_type == "eat_at_tavern":
        return process_eat_at_tavern(tables, activity_record, resource_defs)
    else:
        log.warning(f"Unknown eat activity type: {activity_type}")
        return False
