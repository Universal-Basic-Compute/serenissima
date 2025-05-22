"""
Processor for 'production' activities.
Consumes input resources and produces output resources based on the
activity's recipe, if inputs are available and storage capacity permits.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from backend.engine.processActivities import (
    get_building_record, # Already fetches by custom BuildingId, need one for Airtable ID
    _escape_airtable_value,
    # We'll need a way to get building by Airtable Record ID if not already available
    # For now, assuming `tables['buildings'].get(airtable_record_id)` works.
)

log = logging.getLogger(__name__)

def get_building_record_by_airtable_id(tables: Dict[str, Any], airtable_record_id: str) -> Optional[Dict]:
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

def get_specific_building_resource(
    tables: Dict[str, Any], 
    building_custom_id: str, 
    resource_type_id: str, 
    owner_username: str
) -> Optional[Dict]:
    """Fetches a specific resource type from a building for a specific owner."""
    formula = (f"AND({{Type}}='{_escape_airtable_value(resource_type_id)}', "
               f"{{AssetId}}='{_escape_airtable_value(building_custom_id)}', "
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
    formula = (f"AND({{AssetId}}='{_escape_airtable_value(building_custom_id)}', "
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

    building_airtable_id = activity_fields.get('FromBuilding') # Production happens at FromBuilding
    recipe_inputs_json = activity_fields.get('RecipeInputs')
    recipe_outputs_json = activity_fields.get('RecipeOutputs')

    if not all([building_airtable_id, recipe_inputs_json, recipe_outputs_json]):
        log.error(f"Activity {activity_guid} is missing Building, RecipeInputs, or RecipeOutputs.")
        return False

    try:
        recipe_inputs = json.loads(recipe_inputs_json)
        recipe_outputs = json.loads(recipe_outputs_json)
    except json.JSONDecodeError:
        log.error(f"Failed to parse RecipeInputs or RecipeOutputs JSON for activity {activity_guid}.")
        return False

    prod_building_record = get_building_record_by_airtable_id(tables, building_airtable_id)
    if not prod_building_record:
        log.error(f"Production building (Airtable ID: {building_airtable_id}) not found for activity {activity_guid}.")
        return False
    
    building_custom_id = prod_building_record['fields'].get('BuildingId')
    if not building_custom_id:
        log.error(f"Production building {building_airtable_id} is missing 'BuildingId' field.")
        return False

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
    now_iso = datetime.now(timezone.utc).isoformat()

    # Consume Inputs
    for res_type, req_amount_float in recipe_inputs.items():
        req_amount = float(req_amount_float)
        input_res_record = get_specific_building_resource(tables, building_custom_id, res_type, operator_username)
        # We already checked for existence and sufficient amount
        current_count = float(input_res_record['fields'].get('Count', 0))
        new_count = current_count - req_amount
        
        try:
            if new_count > 0.001: # Using a small epsilon for float comparison
                tables['resources'].update(input_res_record['id'], {'Count': new_count, 'UpdatedAt': now_iso})
                log.info(f"Consumed {req_amount} of {res_type} from {building_custom_id}. New count: {new_count}")
            else:
                tables['resources'].delete(input_res_record['id'])
                log.info(f"Consumed all {current_count} of {res_type} from {building_custom_id} (removed record).")
        except Exception as e_consume:
            log.error(f"Error consuming input {res_type} for activity {activity_guid}: {e_consume}")
            return False # Partial consumption is problematic, fail the operation

    # Produce Outputs
    for res_type, produced_amount_float in recipe_outputs.items():
        produced_amount = float(produced_amount_float)
        output_res_record = get_specific_building_resource(tables, building_custom_id, res_type, operator_username)
        
        try:
            if output_res_record:
                current_count = float(output_res_record['fields'].get('Count', 0))
                new_count = current_count + produced_amount
                tables['resources'].update(output_res_record['id'], {'Count': new_count, 'UpdatedAt': now_iso})
                log.info(f"Produced {produced_amount} of {res_type} in {building_custom_id} (updated existing). New count: {new_count}")
            else:
                res_def = resource_defs.get(res_type, {})
                building_pos_str = prod_building_record['fields'].get('Position', '{}')
                
                new_resource_payload = {
                    "ResourceId": f"resource-{uuid.uuid4()}",
                    "Type": res_type,
                    "Name": res_def.get('name', res_type),
                    "Category": res_def.get('category', 'Unknown'),
                    "BuildingId": building_custom_id,
                    "AssetId": building_custom_id,
                    "AssetType": "building",
                    "Owner": operator_username,
                    "Count": produced_amount,
                    "Position": building_pos_str,
                    "CreatedAt": now_iso,
                    "UpdatedAt": now_iso
                }
                tables['resources'].create(new_resource_payload)
                log.info(f"Produced {produced_amount} of {res_type} in {building_custom_id} (created new).")
        except Exception as e_produce:
            log.error(f"Error producing output {res_type} for activity {activity_guid}: {e_produce}")
            # Consider rollback or error handling for partial production
            return False

    log.info(f"Successfully processed 'production' activity {activity_guid} for building {building_custom_id}.")
    return True
