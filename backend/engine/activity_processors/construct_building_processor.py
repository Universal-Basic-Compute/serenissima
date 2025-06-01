"""
Processor for 'construct_building' activities.
Handles decrementing ConstructionMinutesRemaining on the target building.
Marks building as constructed if minutes reach zero.
"""
import logging
import datetime
from typing import Dict, Any

log = logging.getLogger(__name__)

# Import necessary helpers
from backend.engine.utils.activity_helpers import get_building_record, LogColors, VENICE_TIMEZONE, get_contract_record
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
    contract_airtable_id = activity_fields.get('ContractId') # This is Airtable Record ID

    if not all([target_building_custom_id, contract_airtable_id]) or work_duration_minutes_activity <= 0:
        log.error(f"Activity {activity_guid} missing crucial data or invalid work duration. Aborting.")
        return False

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

            # Update contract status
            contract_record = tables['contracts'].get(contract_airtable_id)
            if contract_record:
                contract_custom_id_log = contract_record['fields'].get('ContractId', contract_airtable_id)
                tables['contracts'].update(contract_airtable_id, {'Status': 'completed'})
                log.info(f"{LogColors.OKGREEN}Construction contract **{contract_custom_id_log}** marked as 'completed'.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Could not find contract (Airtable ID: {contract_airtable_id}) to mark as completed for building {target_building_name_log}.{LogColors.ENDC}")
                
            # Note: This processor only updates the building and contract status and does not create follow-up activities.
            # Any subsequent activities should be created by activity creators, not processors.
        else:
            tables['buildings'].update(target_building_airtable_id, {'ConstructionMinutesRemaining': new_minutes_remaining})
            log.info(f"{LogColors.OKGREEN}Building **{target_building_name_log}** ({target_building_custom_id}) progress updated. {new_minutes_remaining:.2f} minutes remaining.{LogColors.ENDC}")

        # Citizen's position is updated by the main processActivities loop to ToBuilding,
        # which is the construction site for this activity type.
        
        # Note: This processor only updates the construction progress and does not create follow-up activities.
        # Any subsequent construction activities should be created by activity creators, not processors.

        # Trust score updates
        # contract_airtable_id is the Airtable Record ID. We need the contract to get the Buyer.
        # The processor already fetches contract_record if construction is completed.
        # Let's fetch it regardless to get the buyer for trust score.
        contract_record_for_trust = tables['contracts'].get(contract_airtable_id)
        if contract_record_for_trust:
            contract_buyer_username = contract_record_for_trust['fields'].get('Buyer')
            if contract_buyer_username and citizen_username_log:
                if new_minutes_remaining <= 0: # Construction completed
                    update_trust_score_for_activity(tables, citizen_username_log, contract_buyer_username, TRUST_SCORE_SUCCESS_HIGH, "construction_completion", True)
                else: # Progress made
                    update_trust_score_for_activity(tables, citizen_username_log, contract_buyer_username, TRUST_SCORE_PROGRESS, "construction_progress", True)
        else:
            log.warning(f"{LogColors.WARNING}Could not fetch contract {contract_airtable_id} for trust score update in construct_building.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'construct_building' activity {activity_guid}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        # Attempt to update trust score for failure if possible
        contract_record_for_trust_fail = tables['contracts'].get(contract_airtable_id)
        if contract_record_for_trust_fail:
            contract_buyer_username_fail = contract_record_for_trust_fail['fields'].get('Buyer')
            if contract_buyer_username_fail and citizen_username_log:
                 update_trust_score_for_activity(tables, citizen_username_log, contract_buyer_username_fail, TRUST_SCORE_FAILURE_MEDIUM, "construction_processing", False, "system_error")
        return False
