"""
Processor for 'fetch_from_galley' activities.
Handles a citizen picking up resources from a merchant_galley.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Any

# Assuming shared utilities are accessible, e.g., from processActivities or a common util module
# For now, let's define necessary local helpers or assume they'd be imported.
# from backend.engine.processActivities import get_citizen_record, _escape_airtable_value, get_building_record_by_airtable_id
# For simplicity, we'll define local versions or simplified logic if not directly available.
# from backend.engine.processActivities import get_citizen_record, _escape_airtable_value, get_building_record_by_airtable_id
# For simplicity, we'll define local versions or simplified logic if not directly available.
# Import utility functions from activity_helpers to avoid circular imports
from backend.engine.utils.activity_helpers import (
    get_citizen_record as get_citizen_record_global,
    get_building_record,
    _escape_airtable_value, # Assuming this might be needed by local helpers if any remain
    VENICE_TIMEZONE,      # Assuming VENICE_TIMEZONE might be used
    LogColors             # Assuming LogColors might be used
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE

log = logging.getLogger(__name__)

CITIZEN_STORAGE_CAPACITY = 10.0 # Standard citizen carrying capacity

def _fail_activity_with_note(
    tables: Dict[str, Any], 
    activity_airtable_id: str, 
    activity_guid: str, 
    original_notes: str, 
    reason_message: str
) -> bool:
    """Updates activity notes with a failure reason and logs the error."""
    error_note = f"ÉCHEC: {reason_message}"
    updated_notes = f"{original_notes}\n{error_note}" if original_notes else error_note
    log.error(f"Activité {activity_guid} échouée: {reason_message}")
    try:
        tables['activities'].update(activity_airtable_id, {'Notes': updated_notes})
        log.info(f"Notes mises à jour pour l'activité échouée {activity_guid}.")
    except Exception as e_update_notes:
        log.error(f"Erreur lors de la mise à jour des notes pour l'activité échouée {activity_guid}: {e_update_notes}")
    return False

def _get_citizen_record_local(tables: Dict[str, Any], username: str) -> Optional[Dict]:
    # This function can be replaced by get_citizen_record_global if its logic is identical
    # For now, keeping it to ensure no unintended changes if get_citizen_record_global has subtle differences.
    # Escape single quotes in username for Airtable formula
    safe_username_for_formula = username # Assuming username is already safe or _escape_airtable_value is used by caller
    formula = f"{{Username}} = '{safe_username_for_formula}'"
    try:
        records = tables['citizens'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error fetching citizen {username}: {e}")
        return None

# _get_building_by_airtable_id_local is no longer needed as we fetch by custom ID.

def get_citizen_current_load_local(tables: Dict[str, Any], citizen_username: str) -> float:
    # Assuming _escape_airtable_value is available or username is pre-sanitized
    formula = f"AND({{Asset}}='{citizen_username}', {{AssetType}}='citizen')"
    current_load = 0.0
    try:
        resources_carried = tables['resources'].all(formula=formula)
        for resource in resources_carried:
            current_load += float(resource['fields'].get('Count', 0))
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error calculating load for {citizen_username}: {e}")
    return current_load

def get_resource_stock_in_galley(
    tables: Dict[str, Any], 
    galley_custom_id: str, 
    resource_type_id: str,
    galley_owner_username: str # Added galley owner
) -> Optional[Dict]:
    """Gets the specific resource record from the galley, owned by the specified galley_owner_username."""
    formula = (f"AND({{Type}}='{resource_type_id}', "
               f"{{Asset}}='{galley_custom_id}', "
               f"{{AssetType}}='building', "
               f"{{Owner}}='{galley_owner_username}')") # Use galley_owner_username
    try:
        records = tables['resources'].all(formula=formula, max_records=1)
        return records[0] if records else None
    except Exception as e:
        log.error(f"[fetch_from_galley_proc] Error fetching stock for {resource_type_id} in galley {galley_custom_id}: {e}")
        return None

def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, # For storage capacity if needed, not directly used here
    resource_defs: Dict      # For resource names, etc.
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"Processing 'fetch_from_galley' activity: {activity_guid}")

    carrier_username = activity_fields.get('Citizen')
    # FromBuilding in activity is now the custom BuildingId of the galley
    galley_custom_id_from_activity = activity_fields.get('FromBuilding')
    # The custom ID string of the original import contract is stored in the 'ContractId' field of the activity
    original_contract_custom_id = activity_fields.get('ContractId')
    
    # ResourceId and Amount are now inside the 'Resources' JSON field
    resources_json_str = activity_fields.get('Resources')
    resource_id_to_fetch = None
    amount_to_fetch_from_contract = 0.0
    if resources_json_str:
        try:
            resources_list = json.loads(resources_json_str)
            if isinstance(resources_list, list) and len(resources_list) == 1:
                resource_id_to_fetch = resources_list[0].get('ResourceId')
                amount_to_fetch_from_contract = float(resources_list[0].get('Amount', 0))
        except json.JSONDecodeError:
            reason = f"JSON invalide dans le champ Resources: {resources_json_str}"
            return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
            
    # Amount specified by the original contract part (now parsed from Resources field)

    if not all([carrier_username, galley_custom_id_from_activity, original_contract_custom_id, resource_id_to_fetch, amount_to_fetch_from_contract > 0]):
        missing_data_elements = []
        if not carrier_username: missing_data_elements.append("Citizen")
        if not galley_custom_id_from_activity: missing_data_elements.append("FromBuilding (ID personnalisé)")
        if not original_contract_custom_id: missing_data_elements.append("ContractId")
        if not resource_id_to_fetch: missing_data_elements.append("ResourceId (depuis Resources JSON)")
        if not (amount_to_fetch_from_contract > 0): missing_data_elements.append("Amount (depuis Resources JSON, doit être > 0)")
        reason = f"Données cruciales manquantes: {', '.join(missing_data_elements)}."
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)

    # 1. Fetch records
    carrier_citizen_record = _get_citizen_record_local(tables, carrier_username) # or get_citizen_record_global
    if not carrier_citizen_record:
        reason = f"Citoyen transporteur {carrier_username} non trouvé."
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
    carrier_airtable_id = carrier_citizen_record['id']

    # Fetch galley building record using its custom BuildingId from the activity
    galley_building_record = get_building_record(tables, galley_custom_id_from_activity)
    if not galley_building_record:
        reason = f"Bâtiment galère (ID personnalisé: {galley_custom_id_from_activity}) non trouvé."
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
    
    # The custom ID from the activity is the one we use
    galley_custom_id = galley_custom_id_from_activity 
    galley_position_str = galley_building_record['fields'].get('Position', '{}')
    # galley_airtable_id is still useful if we need to update the galley record itself, e.g. its PendingDeliveriesData
    galley_airtable_id_for_updates = galley_building_record['id']


    if not galley_custom_id: # Should not happen if get_building_record succeeded and returned a valid record
        reason = f"Bâtiment galère avec ID personnalisé {galley_custom_id_from_activity} manque le champ BuildingId interne."
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)

    # Fetch original contract to determine the ultimate buyer
    # Assuming OriginalContractId in activity is the custom ContractId string
    original_contract_record = None
    try:
        formula_contract = f"{{ContractId}} = '{original_contract_custom_id}'"
        contracts_found = tables['contracts'].all(formula=formula_contract, max_records=1)
        if contracts_found:
            original_contract_record = contracts_found[0]
        else:
            reason = f"Contrat original {original_contract_custom_id} non trouvé."
            return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
    except Exception as e_orig_contract:
        reason = f"Erreur lors de la récupération du contrat original {original_contract_custom_id}: {e_orig_contract}"
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
    
    ultimate_buyer_username = original_contract_record['fields'].get('Buyer')
    if not ultimate_buyer_username:
        reason = f"Contrat original {original_contract_custom_id} manque l'Acheteur (Buyer)."
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)

    # 2. Calculate capacity and availability
    carrier_current_load = get_citizen_current_load_local(tables, carrier_username)
    carrier_remaining_capacity = max(0, CITIZEN_STORAGE_CAPACITY - carrier_current_load)

    galley_owner_username = galley_building_record['fields'].get('Owner') # Get the merchant who owns the galley
    if not galley_owner_username:
        reason = f"Galère {galley_custom_id} n'a pas de propriétaire. Impossible de déterminer la propriété des ressources."
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)

    galley_resource_record = get_resource_stock_in_galley(tables, galley_custom_id, resource_id_to_fetch, galley_owner_username)
    if not galley_resource_record:
        reason = f"Ressource {resource_id_to_fetch} non trouvée dans la galère {galley_custom_id} (appartenant à {galley_owner_username})."
        # This is a warning in logs but should fail the activity if resource isn't there.
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
    
    stock_in_galley = float(galley_resource_record['fields'].get('Count', 0))

    # 3. Determine actual amount to pick up
    actual_amount_to_pickup = amount_to_fetch_from_contract # Start with the amount for this contract part
    
    if actual_amount_to_pickup > stock_in_galley:
        log.warning(f"[fetch_from_galley_proc] Requested {actual_amount_to_pickup} of {resource_id_to_fetch} but only {stock_in_galley} in galley {galley_custom_id}. Limiting.")
        actual_amount_to_pickup = stock_in_galley
    
    if actual_amount_to_pickup > carrier_remaining_capacity:
        log.warning(f"[fetch_from_galley_proc] Amount {actual_amount_to_pickup} of {resource_id_to_fetch} exceeds carrier {carrier_username} capacity {carrier_remaining_capacity}. Limiting.")
        actual_amount_to_pickup = carrier_remaining_capacity
    
    actual_amount_to_pickup = float(f"{actual_amount_to_pickup:.4f}") # Standardize precision

    if actual_amount_to_pickup <= 0:
        log.info(f"[fetch_from_galley_proc] Calculated amount to pick up for {resource_id_to_fetch} is {actual_amount_to_pickup}. Nothing to fetch.")
        # Update carrier's position to Galley as they arrived there
        try:
            tables['citizens'].update(carrier_airtable_id, {'Position': galley_position_str})
            log.info(f"[fetch_from_galley_proc] Updated carrier {carrier_username} position to galley {galley_custom_id} ({galley_position_str}).")
        except Exception as e_pos_update:
            reason = f"Erreur lors de la mise à jour de la position du transporteur {carrier_username}: {e_pos_update}"
            # Trust: Carrier failed to arrive for ultimate_buyer
            if carrier_username and ultimate_buyer_username:
                update_trust_score_for_activity(tables, carrier_username, ultimate_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_galley_arrival", False, "position_update_failed")
            return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
        
        # If nothing to pick up due to stock/capacity, it's a failure.
        if amount_to_fetch_from_contract > 0: # Only if they intended to pick something up
            # Trust: Carrier failed to get goods for ultimate_buyer
            if carrier_username and ultimate_buyer_username:
                update_trust_score_for_activity(tables, carrier_username, ultimate_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_galley_pickup", False, "nothing_to_pickup")
            # Trust: Galley owner didn't have goods for ultimate_buyer
            if ultimate_buyer_username and galley_owner_username:
                update_trust_score_for_activity(tables, ultimate_buyer_username, galley_owner_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_galley_stock", False, "galley_empty")
        
        success_note = f"Arrivé à la galère {galley_custom_id}, mais rien à ramasser (quantité calculée: {actual_amount_to_pickup})."
        try:
            tables['activities'].update(activity_id_airtable, {'Notes': f"{activity_fields.get('Notes', '')}\nINFO: {success_note}"})
        except Exception: pass
        return True 

    # 4. Perform Resource Transfers
    # VENICE_TIMEZONE is imported from activity_helpers
    now_venice = datetime.now(VENICE_TIMEZONE)
    now_iso = now_venice.isoformat()
    try:
        # Decrement resource from galley
        new_galley_stock = stock_in_galley - actual_amount_to_pickup
        if new_galley_stock > 0.001:
            tables['resources'].update(galley_resource_record['id'], {'Count': new_galley_stock})
        else:
            tables['resources'].delete(galley_resource_record['id'])
        log.info(f"{LogColors.OKGREEN}[fetch_from_galley_proc] Decremented {actual_amount_to_pickup} of {resource_id_to_fetch} from galley {galley_custom_id}.{LogColors.ENDC}")

        # Add resource to carrier citizen's inventory, owned by the ultimate_buyer_username
        carrier_res_formula = (f"AND({{Type}}='{resource_id_to_fetch}', "
                               f"{{Asset}}='{carrier_username}', "
                               f"{{AssetType}}='citizen', "
                               f"{{Owner}}='{ultimate_buyer_username}')")
        existing_carrier_res = tables['resources'].all(formula=carrier_res_formula, max_records=1)
        res_def_details = resource_defs.get(resource_id_to_fetch, {})

        if existing_carrier_res:
            carrier_res_record_id = existing_carrier_res[0]['id']
            new_carrier_count = float(existing_carrier_res[0]['fields'].get('Count', 0)) + actual_amount_to_pickup
            tables['resources'].update(carrier_res_record_id, {'Count': new_carrier_count})
            log.info(f"{LogColors.OKGREEN}[fetch_from_galley_proc] Updated {resource_id_to_fetch} for carrier {carrier_username} to {new_carrier_count} (owned by {ultimate_buyer_username}).{LogColors.ENDC}")
        else:
            new_carrier_res_payload = {
                "ResourceId": f"resource-{uuid.uuid4()}",
                "Type": resource_id_to_fetch,
                "Name": res_def_details.get('name', resource_id_to_fetch),
                "Asset": carrier_username,
                "AssetType": "citizen",
                "Owner": ultimate_buyer_username, # Resources on citizen are owned by the ultimate buyer from the contract
                "Count": actual_amount_to_pickup,
                # "Position": galley_position_str, # Citizen is at the galley - REMOVED
                "CreatedAt": now_iso,
                "Notes": f"Fetched for contract: {original_contract_custom_id}" # Store original contract ID
            }
            tables['resources'].create(new_carrier_res_payload)
            log.info(f"{LogColors.OKGREEN}[fetch_from_galley_proc] Created {actual_amount_to_pickup} of {resource_id_to_fetch} for carrier {carrier_username} (owned by ultimate buyer {ultimate_buyer_username}), linked to contract {original_contract_custom_id}.{LogColors.ENDC}")

        # Update carrier's position to Galley
        tables['citizens'].update(carrier_airtable_id, {'Position': galley_position_str})
        log.info(f"{LogColors.OKGREEN}[fetch_from_galley_proc] Updated carrier {carrier_username} position to galley {galley_custom_id} ({galley_position_str}).{LogColors.ENDC}")

        # Update the original import contract to mark this fetch as completed
        if original_contract_record and original_contract_record.get('id'):
            try:
                tables['contracts'].update(original_contract_record['id'], {'LastExecutedAt': now_iso})
                log.info(f"{LogColors.OKGREEN}[fetch_from_galley_proc] Marked original import contract {original_contract_custom_id} (Airtable ID: {original_contract_record['id']}) as fetched by setting LastExecutedAt.{LogColors.ENDC}")
            except Exception as e_update_contract:
                log.error(f"[fetch_from_galley_proc] Error updating LastExecutedAt for contract {original_contract_custom_id}: {e_update_contract}")
                # This is a significant issue, but the resource transfer has happened.
                # Depending on desired atomicity, might return False or just log. For now, log and proceed.
        else:
            log.warning(f"[fetch_from_galley_proc] Original contract record for {original_contract_custom_id} not available to update LastExecutedAt.")

        # Trust impact: Successful fetch
        if carrier_username and ultimate_buyer_username:
            update_trust_score_for_activity(tables, carrier_username, ultimate_buyer_username, TRUST_SCORE_SUCCESS_SIMPLE, "fetch_galley_pickup", True)
        if ultimate_buyer_username and galley_owner_username:
            update_trust_score_for_activity(tables, ultimate_buyer_username, galley_owner_username, TRUST_SCORE_SUCCESS_SIMPLE, "fetch_galley_stock", True)

    except Exception as e_process:
        reason = f"Erreur lors du traitement des transactions pour l'activité {activity_guid}: {e_process}"
        # Trust impact: Processing error
        if carrier_username and ultimate_buyer_username:
            update_trust_score_for_activity(tables, carrier_username, ultimate_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_galley_processing", False, "system_error")
        if ultimate_buyer_username and galley_owner_username:
            update_trust_score_for_activity(tables, ultimate_buyer_username, galley_owner_username, TRUST_SCORE_FAILURE_SIMPLE, "fetch_galley_processing", False, "system_error")
        return _fail_activity_with_note(tables, activity_id_airtable, activity_guid, activity_fields.get('Notes', ''), reason)
            
    log.info(f"{LogColors.OKGREEN}Successfully processed 'fetch_from_galley' activity {activity_guid}. Picked up {actual_amount_to_pickup} of {resource_id_to_fetch}.{LogColors.ENDC}")
    
    # Note: In the new architecture, we don't create follow-up activities here.
    # The activity creator should have already created the entire chain.
    return True
