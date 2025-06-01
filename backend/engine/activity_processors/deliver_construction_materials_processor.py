"""
Processor for 'deliver_construction_materials' activities.
Handles the transfer of construction materials from the citizen's inventory
to the construction site's inventory.
"""
import logging
import json
from typing import Dict, Any, List

log = logging.getLogger(__name__)

# Import necessary helpers
from backend.engine.utils.activity_helpers import get_building_record, get_citizen_record, get_contract_record, _escape_airtable_value, LogColors
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_PROGRESS

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any]
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}🚚 Processing 'deliver_construction_materials' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username = activity_fields.get('Citizen')
    # from_building_custom_id = activity_fields.get('FromBuilding') # Workshop
    to_building_custom_id = activity_fields.get('ToBuilding')     # Construction Site
    contract_custom_id_from_activity = activity_fields.get('ContractId') # This is now the custom ContractId
    resources_to_deliver_json = activity_fields.get('ResourcesToDeliver')

    if not all([citizen_username, to_building_custom_id, contract_custom_id_from_activity, resources_to_deliver_json]):
        log.error(f"Activity {activity_guid} missing crucial data. Aborting.")
        return False

    try:
        resources_to_deliver_list = json.loads(resources_to_deliver_json)
    except json.JSONDecodeError:
        log.error(f"Failed to parse ResourcesToDeliver JSON for activity {activity_guid}: {resources_to_deliver_json}")
        return False

    # Import additional necessary helpers
    from backend.engine.utils.activity_helpers import get_resource_record, update_resource_count, create_resource_record, VENICE_TIMEZONE
    import datetime

    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"{LogColors.FAIL}Citizen {citizen_username} not found for activity {activity_guid}. Aborting.{LogColors.ENDC}")
        return False

    site_building_record = get_building_record(tables, to_building_custom_id)
    if not site_building_record:
        log.error(f"{LogColors.FAIL}Construction site {to_building_custom_id} not found for activity {activity_guid}. Aborting.{LogColors.ENDC}")
        return False
    site_building_airtable_id = site_building_record['id']

    contract_record = get_contract_record(tables, contract_custom_id_from_activity) # Use helper for custom ID
    if not contract_record:
        log.error(f"{LogColors.FAIL}Contract {contract_custom_id_from_activity} not found for activity {activity_guid}. Aborting.{LogColors.ENDC}")
        return False
    
    contract_buyer_username = contract_record['fields'].get('Buyer') # The one who ordered the construction
    if not contract_buyer_username:
        log.error(f"{LogColors.FAIL}Contract {contract_custom_id_from_activity} has no Buyer. Cannot determine owner of delivered materials. Aborting.{LogColors.ENDC}")
        return False
    
    site_name_log = site_building_record['fields'].get('Name', to_building_custom_id)
    log.info(f"Processing delivery for **{citizen_username}** to site **{site_name_log}** ({to_building_custom_id}) (Owner: **{contract_buyer_username}**).")

    all_transfers_successful = True
    materials_actually_delivered_summary = []

    for res_item in resources_to_deliver_list:
        res_type = res_item['type']
        res_amount_to_deliver = float(res_item['amount'])

        if res_amount_to_deliver <= 0:
            continue

        # 1. Verify and decrement from citizen's inventory
        # Resources carried by citizen are owned by the workshop operator (Seller of construction_project contract)
        # OR, if fetched directly by citizen for this task, could be owned by citizen or workshop operator.
        # For simplicity, assume resources are in citizen's inventory and owned by them or workshop operator.
        # The key is that they are *on* the citizen.
        
        # Find resource on citizen (Asset=citizen_username, AssetType='citizen').
        # The Owner of these resources on the citizen should be the workshop operator.
        # For construction delivery, the citizen acts as a courier for the workshop.
        workshop_operator_username = contract_record['fields'].get('Seller') # Seller of construction_project is workshop op
        if not workshop_operator_username:
            log.error(f"{LogColors.FAIL}Contract {contract_custom_id_from_activity} has no Seller (workshop operator). Cannot verify ownership of materials on citizen. Aborting this resource.{LogColors.ENDC}")
            all_transfers_successful = False; continue

        citizen_resource_formula = (f"AND({{Asset}}='{_escape_airtable_value(citizen_username)}', "
                                  f"{{AssetType}}='citizen', "
                                  f"{{Type}}='{_escape_airtable_value(res_type)}', "
                                  f"{{Owner}}='{_escape_airtable_value(workshop_operator_username)}')")
        
        citizen_res_records_owned_by_workshop = tables['resources'].all(formula=citizen_resource_formula)
        
        total_on_citizen_owned_by_workshop = sum(float(rec['fields'].get('Count', 0)) for rec in citizen_res_records_owned_by_workshop)

        if total_on_citizen_owned_by_workshop < res_amount_to_deliver:
            log.warning(f"{LogColors.WARNING}Citizen {citizen_username} does not have enough {res_type} ({res_amount_to_deliver:.2f} needed) owned by workshop {workshop_operator_username} (has {total_on_citizen_owned_by_workshop:.2f}). Skipping this resource.{LogColors.ENDC}")
            all_transfers_successful = False
            continue

        # Decrement from citizen's inventory (owned by workshop operator)
        amount_left_to_decrement = res_amount_to_deliver
        for res_stack_on_citizen in sorted(citizen_res_records_owned_by_workshop, key=lambda r: float(r['fields'].get('Count', 0))): # Smallest first
            if amount_left_to_decrement <= 0: break

            stack_count = float(res_stack_on_citizen['fields'].get('Count', 0))
            decrement_from_this_stack = min(stack_count, amount_left_to_decrement)

            if not update_resource_count(tables, res_stack_on_citizen['id'], -decrement_from_this_stack, "decrement"):
                log.error(f"{LogColors.FAIL}Failed to decrement {decrement_from_this_stack:.2f} of {res_type} from citizen {citizen_username}'s stack {res_stack_on_citizen['id']}. Aborting this resource.{LogColors.ENDC}")
                all_transfers_successful = False
                amount_left_to_decrement = -1 # Signal error to break outer loop or handle
                break 
            amount_left_to_decrement -= decrement_from_this_stack
        
        if amount_left_to_decrement > 0.001: # If loop finished but still couldn't decrement enough (should not happen if total check was correct)
            log.error(f"{LogColors.FAIL}Logic error: Could not decrement full amount of {res_type} from {citizen_username} despite initial check. Remaining to decrement: {amount_left_to_decrement:.2f}. Aborting this resource.{LogColors.ENDC}")
            all_transfers_successful = False; continue
        elif amount_left_to_decrement < -0.001: # Error signaled from inner loop
             all_transfers_successful = False; continue


        log.info(f"🛍️ Decremented **{res_amount_to_deliver:.2f}** of **{res_type}** from **{citizen_username}**'s inventory (owned by **{workshop_operator_username}**).")

        # 2. Increment in site_building_record's inventory, owned by contract_buyer_username
        site_resource_record = get_resource_record(tables, to_building_custom_id, 'building', res_type, contract_buyer_username)
        if site_resource_record:
            if not update_resource_count(tables, site_resource_record['id'], res_amount_to_deliver, "increment"):
                log.error(f"{LogColors.FAIL}Failed to increment {res_type} in site {site_name_log} ({to_building_custom_id}). Aborting this resource.{LogColors.ENDC}")
                all_transfers_successful = False; continue
        else:
            res_def_details = resource_defs.get(res_type, {})
            if not create_resource_record(
                tables, res_type, res_def_details.get('name', res_type),
                to_building_custom_id, 'building', contract_buyer_username,
                res_amount_to_deliver, site_building_record['fields'].get('Position')
            ):
                log.error(f"{LogColors.FAIL}Failed to create {res_type} in site {site_name_log} ({to_building_custom_id}). Aborting this resource.{LogColors.ENDC}")
                all_transfers_successful = False; continue
        
        log.info(f"📦 Incremented **{res_amount_to_deliver}** of **{res_type}** in site **{site_name_log}** ({to_building_custom_id}) (owned by **{contract_buyer_username}**).")
        materials_actually_delivered_summary.append(f"**{res_amount_to_deliver}** **{res_type}**")

    # Import get_building_resources if not already imported (it should be via activity_helpers)
    from backend.engine.utils.activity_helpers import get_building_resources

    # 5. Update contract notes or status
    if materials_actually_delivered_summary:
        delivery_summary_str = ", ".join(materials_actually_delivered_summary)
        now_iso = datetime.datetime.now(VENICE_TIMEZONE).isoformat()
            
        # Handle contract notes
        current_notes_str = contract_record['fields'].get('Notes', '{}')
        notes_data = {}
        try:
            notes_data = json.loads(current_notes_str)
            if not isinstance(notes_data, dict): # If it's not a dict, start fresh
                notes_data = {"previous_notes_malformed": current_notes_str}
        except json.JSONDecodeError:
            # If notes are not valid JSON, preserve them and start a new structure
            notes_data = {"previous_notes_raw": current_notes_str}
            
        if "delivery_log" not in notes_data or not isinstance(notes_data.get("delivery_log"), list):
            notes_data["delivery_log"] = []
            
        new_log_entry = f"[{now_iso}] Delivered by {citizen_username}: {delivery_summary_str}."
        notes_data["delivery_log"].append(new_log_entry)
            
        updated_notes_json = json.dumps(notes_data, indent=2) # Store with indentation for readability
            
        contract_update_payload = {'Notes': updated_notes_json}
            
        # Check if all materials are now on site
        # constructionCosts should be stored in notes_data by the contract creator
        construction_costs_from_notes = notes_data.get('constructionCosts') 
            
        if construction_costs_from_notes and isinstance(construction_costs_from_notes, dict):
            required_materials_for_project = {
                k: float(v) for k, v in construction_costs_from_notes.items() if k != 'ducats' and isinstance(v, (int, float))
            }
            site_inventory_after_delivery = get_building_resources(tables, to_building_custom_id) # Re-fetch inventory
                
            all_materials_now_on_site = True
            if not required_materials_for_project: # If constructionCosts is empty (e.g. only ducats)
                 log.info(f"Contract {contract_custom_id_from_activity} has no material costs defined in notes. Assuming materials delivered.")
            else:
                for material_type, needed_qty in required_materials_for_project.items():
                    if site_inventory_after_delivery.get(material_type, 0.0) < needed_qty:
                        all_materials_now_on_site = False
                        log.info(f"Site {to_building_custom_id} still needs {needed_qty - site_inventory_after_delivery.get(material_type, 0.0):.2f} of {material_type}.")
                        break
                
            if all_materials_now_on_site:
                log.info(f"{LogColors.OKGREEN}All required materials for contract {contract_custom_id_from_activity} are now on site {to_building_custom_id}.{LogColors.ENDC}")
                current_contract_status = contract_record['fields'].get('Status')
                if current_contract_status == 'pending_materials':
                    contract_update_payload['Status'] = 'materials_delivered' 
                    log.info(f"Updating contract {contract_custom_id_from_activity} status from '{current_contract_status}' to 'materials_delivered'.")
                    # This processor only updates the contract status.
                    # Any subsequent construction activities should be created by activity creators.
                elif current_contract_status != 'materials_delivered' and current_contract_status != 'completed' and current_contract_status != 'construction_in_progress':
                    # If it's some other status but all materials are there, maybe it should also be materials_delivered
                    log.info(f"Contract {contract_custom_id_from_activity} status is '{current_contract_status}'. All materials delivered. Consider if status update is needed.")

        else:
            log.warning(f"Could not find 'constructionCosts' in contract notes for {contract_custom_id_from_activity} or it's not a dict. Cannot check if all materials are delivered. Notes content: {current_notes_str}")

        tables['contracts'].update(contract_record['id'], contract_update_payload) # Update by Airtable record ID
        log.info(f"Updated contract {contract_custom_id_from_activity} notes and potentially status.")

    # 6. Citizen's position is updated by the main processActivities loop to ToBuilding.

    # Trust score updates
    if contract_buyer_username and citizen_username: # citizen_username is the deliverer (workshop operator)
        if all_transfers_successful and materials_actually_delivered_summary: # Some materials delivered successfully
            # If status became 'materials_delivered', it's a bigger success
            if contract_update_payload.get('Status') == 'materials_delivered':
                 update_trust_score_for_activity(tables, citizen_username, contract_buyer_username, TRUST_SCORE_SUCCESS_MEDIUM, "construction_material_delivery", True, "all_materials_on_site")
            else: # Partial but successful delivery
                 update_trust_score_for_activity(tables, citizen_username, contract_buyer_username, TRUST_SCORE_SUCCESS_SIMPLE, "construction_material_delivery", True, "partial_delivery")
        elif not all_transfers_successful and materials_actually_delivered_summary: # Some delivered, some failed
            update_trust_score_for_activity(tables, citizen_username, contract_buyer_username, TRUST_SCORE_PROGRESS, "construction_material_delivery", False, "partial_failure_some_delivered")
        elif not all_transfers_successful and not materials_actually_delivered_summary: # Complete failure to deliver anything requested
            update_trust_score_for_activity(tables, citizen_username, contract_buyer_username, TRUST_SCORE_FAILURE_SIMPLE, "construction_material_delivery", False, "complete_failure")

    return all_transfers_successful
