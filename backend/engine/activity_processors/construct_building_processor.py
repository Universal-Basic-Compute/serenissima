"""
Processor for 'construct_building' activities.
Handles decrementing ConstructionMinutesRemaining on the target building.
Marks building as constructed if minutes reach zero.
"""
import logging
import datetime
from typing import Dict, Any, Optional # Added Optional

log = logging.getLogger(__name__)

# Import necessary helpers
from backend.engine.utils.activity_helpers import get_building_record, LogColors, VENICE_TIMEZONE, _escape_airtable_value # Removed get_contract_record, added _escape_airtable_value
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_HIGH, TRUST_SCORE_FAILURE_MEDIUM, TRUST_SCORE_PROGRESS

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any] # Not directly used here but part of signature
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}🛠️ Processing 'construct_building' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username_log = activity_fields.get('Citizen') # For logging
    target_building_custom_id = activity_fields.get('BuildingToConstruct')
    work_duration_minutes_activity = int(activity_fields.get('WorkDurationMinutes', 0))
    # ContractId in the activity is the custom string ID for construction projects
    contract_custom_id_from_activity = activity_fields.get('ContractId') 

    if not all([target_building_custom_id, contract_custom_id_from_activity]) or work_duration_minutes_activity <= 0:
        log.error(f"Activity {activity_guid} missing crucial data (Target: {target_building_custom_id}, ContractCustomID: {contract_custom_id_from_activity}) or invalid work duration ({work_duration_minutes_activity}). Aborting.")
        return False

    # Fetch contract record using its custom ID
    contract_record_for_processing: Optional[Dict[str, Any]] = None
    try:
        formula = f"{{ContractId}} = '{_escape_airtable_value(contract_custom_id_from_activity)}'"
        contract_records_list = tables['contracts'].all(formula=formula, max_records=1)
        if not contract_records_list:
            log.error(f"Contract with custom ID '{contract_custom_id_from_activity}' not found for activity {activity_guid}.")
            # Trust impact: If contract is missing, it's a failure for the worker towards the (unknown) buyer.
            # This scenario is hard to attribute trust without contract details.
            return False
        contract_record_for_processing = contract_records_list[0]
    except Exception as e_contract_fetch:
        log.error(f"Error fetching contract by custom ID '{contract_custom_id_from_activity}': {e_contract_fetch}")
        return False
    
    if not contract_record_for_processing: # Should be caught by the list check, but as a safeguard
        log.error(f"Contract record for '{contract_custom_id_from_activity}' is None after fetch attempt. Activity {activity_guid}.")
        return False

    contract_airtable_id = contract_record_for_processing['id'] # Now we have the Airtable Record ID

    target_building_record = get_building_record(tables, target_building_custom_id)
    if not target_building_record:
        log.error(f"Target building {target_building_custom_id} for activity {activity_guid} not found.")
        return False
    
    target_building_airtable_id = target_building_record['id']
    target_building_name_log = target_building_record['fields'].get('Name', target_building_custom_id)

    try:
        current_minutes_remaining = float(target_building_record['fields'].get('ConstructionMinutesRemaining', 0))
        log.info(f"Building **{target_building_name_log}** ({target_building_custom_id}) has {current_minutes_remaining:.2f} construction minutes remaining before this activity.")

        new_minutes_remaining = current_minutes_remaining - work_duration_minutes_activity
        log.info(f"After {work_duration_minutes_activity} minutes of work by activity {activity_guid} (Worker: {citizen_username_log}), new remaining minutes for **{target_building_name_log}**: {new_minutes_remaining:.2f}.")

        if new_minutes_remaining <= 0:
            now_iso = datetime.datetime.now(VENICE_TIMEZONE).isoformat()
            building_update_payload = {
                'ConstructionMinutesRemaining': 0,
                'IsConstructed': True,
                'ConstructionDate': now_iso
            }
            tables['buildings'].update(target_building_airtable_id, building_update_payload)
            log.info(f"{LogColors.OKGREEN}🎉 Building **{target_building_name_log}** ({target_building_custom_id}) construction completed. Updated fields: {building_update_payload}{LogColors.ENDC}")

            # Update contract status - contract_record_for_processing is already fetched
            if contract_record_for_processing: # Should always be true if we reached here
                # contract_custom_id_from_activity is the custom ID used for logging
                tables['contracts'].update(contract_airtable_id, {'Status': 'completed'}) # Use Airtable ID for update
                log.info(f"{LogColors.OKGREEN}Construction contract **{contract_custom_id_from_activity}** (Airtable ID: {contract_airtable_id}) marked as 'completed'.{LogColors.ENDC}")
            # No else needed, as failure to fetch contract_record_for_processing would have returned False earlier.
                
            # This processor only updates the building and contract status.
            # Any subsequent activities should be created by activity creators.
        else:
            tables['buildings'].update(target_building_airtable_id, {'ConstructionMinutesRemaining': new_minutes_remaining})
            log.info(f"{LogColors.OKGREEN}Building **{target_building_name_log}** ({target_building_custom_id}) progress updated. {new_minutes_remaining:.2f} minutes remaining.{LogColors.ENDC}")

        # Citizen's position is updated by the main processActivities loop to ToBuilding,
        # which is the construction site for this activity type.
        
        # This processor only updates the construction progress.
        # Any subsequent construction activities should be created by activity creators.

        # Trust score updates
        # contract_record_for_processing is already fetched and contains the contract details.
        if contract_record_for_processing:
            contract_buyer_username = contract_record_for_processing['fields'].get('Buyer')
            if contract_buyer_username and citizen_username_log:
                if new_minutes_remaining <= 0: # Construction completed
                    update_trust_score_for_activity(tables, citizen_username_log, contract_buyer_username, TRUST_SCORE_SUCCESS_HIGH, "construction_completion", True, activity_record_for_kinos=activity_record)
                else: # Progress made
                    update_trust_score_for_activity(tables, citizen_username_log, contract_buyer_username, TRUST_SCORE_PROGRESS, "construction_progress", True, activity_record_for_kinos=activity_record)
        # No else needed for contract_record_for_processing due to earlier checks.
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'construct_building' activity {activity_guid}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        # Attempt to update trust score for failure if possible
        # contract_record_for_processing might be None if error occurred before its full validation,
        # but contract_custom_id_from_activity should be available.
        # We need the buyer from the contract for trust score.
        # If contract_record_for_processing was successfully fetched before the error:
        if contract_record_for_processing:
            contract_buyer_username_fail = contract_record_for_processing['fields'].get('Buyer')
            if contract_buyer_username_fail and citizen_username_log:
                 update_trust_score_for_activity(tables, citizen_username_log, contract_buyer_username_fail, TRUST_SCORE_FAILURE_MEDIUM, "construction_processing", False, "system_error", activity_record_for_kinos=activity_record)
        else:
            # If contract couldn't be fetched, we can't easily get the buyer for trust score.
            # This case is already handled by returning False earlier if contract fetch fails.
            # If the error is elsewhere, contract_record_for_processing should be populated.
            log.warning(f"Could not update trust score for failed construction activity {activity_guid} as contract details might be missing.")
        return False
