"""
Processor for 'production' activities.
Consumes input resources and produces output resources based on the
activity's recipe, if inputs are available and storage capacity permits.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any

# Import utility functions from activity_helpers to avoid circular imports
from backend.engine.utils.activity_helpers import (
    get_building_record,
    get_citizen_record,
    _escape_airtable_value,
    VENICE_TIMEZONE, # Assuming VENICE_TIMEZONE might be used
    LogColors      # Assuming LogColors might be used
)

log = logging.getLogger(__name__)

# Removed _get_building_by_airtable_id as we'll use get_building_record

def get_specific_building_resource(
    tables: Dict[str, Any], 
    building_custom_id: str, 
    resource_type_id: str, 
    owner_username: str
) -> Optional[Dict]:
    """Fetches a specific resource type from a building for a specific owner."""
    formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{Asset}}='{_escape_airtable_value(building_custom_id)}', " # Asset -> Asset
               f"{{AssetType}}='building', "
               f"{{Owner}}='{_escape_airtable_value(owner_username)}')")
    try:
        records = tables['resources'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching resource {resource_type_id} for building {building_custom_id}, owner {owner_username}: {e}")
        return None

def get_all_building_resources(
    tables: Dict[str, Any], 
    building_custom_id: str
) -> List[Dict]:
    """Fetches all resource records for a specific building (summing across owners if necessary, but usually one operator)."""
    # This simplified version assumes we sum all resources in the building regardless of specific owner for capacity check.
    # Or, more accurately, it should be for the operator.
    formula = (f"AND({{Asset}}='{_escape_airtable_value(building_custom_id)}', " # Asset -> Asset
               f"{{AssetType}}='building')")
    try:
        records = tables['resources'].all(formula=formula)
        return records
    except Exception as e:
        log.error(f"Error fetching all resources for building {building_custom_id}: {e}")
        return []


def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, 
    resource_defs: Dict
) -> bool:
    """Processes a 'production' activity."""
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'production' activity: {activity_guid}")

    # FromBuilding in activity is now the custom BuildingId
    building_custom_id_from_activity = activity_fields.get('FromBuilding') 
    recipe_inputs_json = activity_fields.get('RecipeInputs')
    recipe_outputs_json = activity_fields.get('RecipeOutputs')

    if not all([building_custom_id_from_activity, recipe_inputs_json, recipe_outputs_json]):
        log.error(f"Activity {activity_guid} is missing Building (custom ID), RecipeInputs, or RecipeOutputs.")
        return False

    try:
        recipe_inputs = json.loads(recipe_inputs_json)
        recipe_outputs = json.loads(recipe_outputs_json)
    except json.JSONDecodeError:
        log.error(f"Failed to parse RecipeInputs or RecipeOutputs JSON for activity {activity_guid}.")
        return False

    # Fetch production building record using its custom BuildingId from the activity
    prod_building_record = get_building_record(tables, building_custom_id_from_activity)
    if not prod_building_record:
        log.error(f"Production building with custom ID '{building_custom_id_from_activity}' not found for activity {activity_guid}.")
        return False
    
    # The custom ID from the activity is the one we use
    building_custom_id = building_custom_id_from_activity

    operator_username = prod_building_record['fields'].get('RunBy') or prod_building_record['fields'].get('Owner')
    if not operator_username:
        log.error(f"Could not determine operator/owner for production building {building_custom_id}.")
        return False

    # 1. Input Check
    input_resources_sufficient = True
    total_input_volume_to_consume = 0
    for res_type, req_amount_float in recipe_inputs.items():
        req_amount = float(req_amount_float)
        total_input_volume_to_consume += req_amount
        input_res_record = get_specific_building_resource(tables, building_custom_id, res_type, operator_username)
        if not input_res_record or float(input_res_record['fields'].get('Count', 0)) < req_amount:
            log.warning(f"Insufficient input resource {res_type} for activity {activity_guid} in building {building_custom_id}. "
                        f"Required: {req_amount}, Available: {input_res_record['fields'].get('Count', 0) if input_res_record else 0}")
            input_resources_sufficient = False
            break
    
    if not input_resources_sufficient:
        return False # Production cannot proceed

    # 2. Output Storage Check
    prod_building_type_str = prod_building_record['fields'].get('Type')
    prod_building_def = building_type_defs.get(prod_building_type_str, {})
    storage_capacity = float(prod_building_def.get('productionInformation', {}).get('storageCapacity', 0))

    current_building_resources_list = get_all_building_resources(tables, building_custom_id)
    current_total_stored_volume = sum(float(r['fields'].get('Count', 0)) for r in current_building_resources_list)
    
    total_output_volume_to_produce = sum(float(amount) for amount in recipe_outputs.values())

    expected_volume_after_production = current_total_stored_volume - total_input_volume_to_consume + total_output_volume_to_produce
    
    if expected_volume_after_production > storage_capacity:
        log.warning(f"Insufficient storage capacity in building {building_custom_id} for outputs of activity {activity_guid}. "
                    f"Current: {current_total_stored_volume}, Inputs: {total_input_volume_to_consume}, Outputs: {total_output_volume_to_produce}, "
                    f"Expected: {expected_volume_after_production}, Capacity: {storage_capacity}")
        return False # Not enough space for outputs

    # 3. Process Production
    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()

    # Consume Inputs
    for res_type, req_amount_float in recipe_inputs.items():
        req_amount = float(req_amount_float)
        input_res_record = get_specific_building_resource(tables, building_custom_id, res_type, operator_username)
        # We already checked for existence and sufficient amount
        current_count = float(input_res_record['fields'].get('Count', 0))
        new_count = current_count - req_amount
        
        try:
            if new_count > 0.001: # Using a small epsilon for float comparison
                tables['resources'].update(input_res_record['id'], {'Count': new_count, 'ConsumedAt': now_iso}) # Add ConsumedAt
                log.info(f"{LogColors.OKGREEN}Consumed {req_amount} of {res_type} from {building_custom_id}. New count: {new_count}{LogColors.ENDC}")
            else:
                tables['resources'].delete(input_res_record['id'])
                log.info(f"{LogColors.OKGREEN}Consumed all {current_count} of {res_type} from {building_custom_id} (removed record).{LogColors.ENDC}")
        except Exception as e_consume:
            log.error(f"Error consuming input {res_type} for activity {activity_guid}: {e_consume}")
            return False # Partial consumption is problematic, fail the operation

    # Produce Outputs

    # Calculate production ratio based on actual activity duration vs recipe's craft minutes
    # Also apply penalties for homelessness, hunger, and business not being checked.
    production_penalty_modifier = 1.0
    operator_citizen_record = get_citizen_record(tables, operator_username)
    activity_end_dt_for_check = datetime.datetime.fromisoformat(activity_fields.get('EndDate').replace("Z", "+00:00"))
    if activity_end_dt_for_check.tzinfo is None:
        activity_end_dt_for_check = pytz.UTC.localize(activity_end_dt_for_check)


    if operator_citizen_record:
        # Check for homelessness
        home_building_links = operator_citizen_record['fields'].get('HomeBuilding')
        if not home_building_links or len(home_building_links) == 0:
            log.info(f"Operator {operator_username} is homeless. Applying 50% production penalty.")
            production_penalty_modifier *= 0.5

        # Check for hunger
        ate_at_str = operator_citizen_record['fields'].get('AteAt')
        activity_end_date_str = activity_fields.get('EndDate')
        if ate_at_str and activity_end_date_str:
            try:
                ate_at_dt = datetime.fromisoformat(ate_at_str)
                activity_end_dt = datetime.fromisoformat(activity_end_date_str)
                
                # Ensure timezone awareness (assume UTC if naive)
                if ate_at_dt.tzinfo is None:
                    ate_at_dt = ate_at_dt.replace(tzinfo=timezone.utc)
                if activity_end_dt.tzinfo is None:
                    activity_end_dt = activity_end_dt.replace(tzinfo=timezone.utc)

                if (activity_end_dt - ate_at_dt).total_seconds() > 24 * 3600:
                    log.info(f"Operator {operator_username} has not eaten in over 24 hours (AteAt: {ate_at_str}). Applying 50% production penalty.")
                    production_penalty_modifier *= 0.5
            except ValueError:
                log.warning(f"Could not parse AteAt timestamp '{ate_at_str}' for operator {operator_username}.")
        elif not ate_at_str:
            # If AteAt is not set, consider them hungry as a default penalty, or log and skip.
            # For now, let's assume hungry if not set, to encourage this data point.
            log.info(f"Operator {operator_username} AteAt timestamp is not set. Applying 50% production penalty for hunger.")
            production_penalty_modifier *= 0.5
    else:
        log.warning(f"Could not fetch citizen record for operator {operator_username}. Cannot apply penalties for homelessness/hunger.")

    # Check business status (CheckedAt)
    checked_at_str = prod_building_record['fields'].get('CheckedAt')
    if checked_at_str:
        try:
            checked_at_dt = datetime.datetime.fromisoformat(checked_at_str.replace("Z", "+00:00"))
            if checked_at_dt.tzinfo is None: # Ensure timezone aware
                checked_at_dt = pytz.UTC.localize(checked_at_dt)
            
            # Check if 'CheckedAt' is older than 24 hours from the activity's EndDate
            if (activity_end_dt_for_check - checked_at_dt) > datetime.timedelta(hours=24):
                log.warning(f"Business {building_custom_id} (Operator: {operator_username}) not checked in over 24 hours (CheckedAt: {checked_at_str}). Applying 50% production penalty.")
                production_penalty_modifier *= 0.5
        except ValueError:
            log.warning(f"Could not parse CheckedAt timestamp '{checked_at_str}' for building {building_custom_id}. Assuming penalty.")
            production_penalty_modifier *= 0.5 # Penalize if date is invalid
    else:
        # If CheckedAt is not set at all, apply penalty
        log.warning(f"Business {building_custom_id} (Operator: {operator_username}) has no 'CheckedAt' timestamp. Applying 50% production penalty.")
        production_penalty_modifier *= 0.5
        
    duration_based_ratio = 1.0  # Default to full production if duration calculation fails
    recipe_craft_minutes_val = activity_fields.get('RecipeCraftMinutes')

    if recipe_craft_minutes_val is not None:
        try:
            recipe_duration_minutes = float(recipe_craft_minutes_val)
            if recipe_duration_minutes > 0:
                start_date_str = activity_fields.get('StartDate')
                end_date_str = activity_fields.get('EndDate')

                if start_date_str and end_date_str:
                    start_dt = datetime.fromisoformat(start_date_str)
                    end_dt = datetime.fromisoformat(end_date_str)
                    
                    # Ensure they are timezone-aware (assuming UTC if naive, though creator should make them aware)
                    if start_dt.tzinfo is None: start_dt = start_dt.replace(tzinfo=timezone.utc)
                    if end_dt.tzinfo is None: end_dt = end_dt.replace(tzinfo=timezone.utc)

                    actual_duration_seconds = (end_dt - start_dt).total_seconds()
                    actual_duration_minutes = actual_duration_seconds / 60.0
                    
                    if actual_duration_minutes < 0: actual_duration_minutes = 0.0 # Safety for negative duration

                    duration_based_ratio = actual_duration_minutes / recipe_duration_minutes
                    # log.info already includes duration_based_ratio effectively through production_ratio log later
                else:
                    log.warning(f"Activity {activity_guid} missing StartDate or EndDate. Assuming full duration-based ratio.")
            else:
                log.warning(f"RecipeCraftMinutes is {recipe_duration_minutes} for activity {activity_guid}. Assuming full duration-based ratio.")
        except ValueError:
            log.warning(f"Invalid RecipeCraftMinutes value '{recipe_craft_minutes_val}' for activity {activity_guid}. Assuming full duration-based ratio.")
    else:
        log.info(f"RecipeCraftMinutes not found for activity {activity_guid}. Assuming full duration-based ratio (old behavior).")

    # Apply penalties to the duration-based ratio
    production_ratio = duration_based_ratio * production_penalty_modifier
    production_ratio = min(1.0, max(0.0, production_ratio)) # Clamp final ratio

    log.info(f"Activity {activity_guid}: DurationRatio={duration_based_ratio:.4f}, PenaltyMod={production_penalty_modifier:.4f}, FinalProdRatio={production_ratio:.4f}")

    for res_type, base_produced_amount_str in recipe_outputs.items():
        base_produced_amount = float(base_produced_amount_str)
        final_produced_amount = base_produced_amount * production_ratio

        if final_produced_amount <= 0.00001: # Effectively zero or negligible
            log.info(f"Calculated produced amount for {res_type} is negligible ({final_produced_amount:.4f}) due to ratio {production_ratio:.4f}. Skipping output.")
            continue

        output_res_record = get_specific_building_resource(tables, building_custom_id, res_type, operator_username)
        
        try:
            if output_res_record:
                current_count = float(output_res_record['fields'].get('Count', 0))
                new_count = current_count + final_produced_amount
                tables['resources'].update(output_res_record['id'], {'Count': new_count})
                log.info(f"{LogColors.OKGREEN}Produced {final_produced_amount:.4f} of {res_type} in {building_custom_id} (updated existing). New count: {new_count:.4f}{LogColors.ENDC}")
            else:
                res_def = resource_defs.get(res_type, {})
                building_pos_str = prod_building_record['fields'].get('Position', '{}')
                
                new_resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": res_type,
                    "Name": res_def.get('name', res_type),
                    # "Category": res_def.get('category', 'Unknown'), # Removed Category
                    "BuildingId": building_custom_id, # Custom BuildingId
                    "Asset": building_custom_id,      # Asset field stores BuildingId for AssetType='building'
                    "AssetType": "building",
                    "Owner": operator_username,
                    "Count": final_produced_amount,
                    "Position": building_pos_str,
                    "CreatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload)
                log.info(f"{LogColors.OKGREEN}Produced {final_produced_amount:.4f} of {res_type} in {building_custom_id} (created new).{LogColors.ENDC}")
        except Exception as e_produce:
            log.error(f"Error producing output {res_type} for activity {activity_guid}: {e_produce}")
            # Consider rollback or error handling for partial production
            return False

    log.info(f"{LogColors.OKGREEN}Successfully processed 'production' activity {activity_guid} for building {building_custom_id}.{LogColors.ENDC}")
    
    # Building UpdatedAt is handled by Airtable
    return True
