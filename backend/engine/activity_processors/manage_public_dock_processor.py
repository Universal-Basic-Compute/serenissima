"""
Processor for 'manage_public_dock' activities.
"""
import logging
import datetime
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import LogColors, VENICE_TIMEZONE, get_building_record, update_citizen_ducats
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_PROGRESS

log = logging.getLogger(__name__)

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], 
    resource_defs: Dict[str, Any],
    current_time_utc: datetime.datetime # Added current_time_utc
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.PROCESS}⚓ Processing 'manage_public_dock' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username = activity_fields.get('Citizen')
    dock_custom_id = activity_fields.get('FromBuilding') # Dock is FromBuilding

    if not all([citizen_username, dock_custom_id]):
        log.error(f"{LogColors.FAIL}Activity {activity_guid} missing crucial data (Citizen or FromBuilding). Aborting.{LogColors.ENDC}")
        return False

    dock_record = get_building_record(tables, dock_custom_id)
    if not dock_record:
        log.error(f"{LogColors.FAIL}Public dock {dock_custom_id} not found for activity {activity_guid}. Aborting.{LogColors.ENDC}")
        return False
    
    dock_name_log = dock_record['fields'].get('Name', dock_custom_id)
    dock_owner_username = dock_record['fields'].get('Owner')

    log.info(f"Citizen **{citizen_username}** finished managing dock **{dock_name_log}** ({dock_custom_id}).")

    # --- Potential future logic for the processor ---
    # 1. Calculate "fees collected" based on dock traffic or a fixed amount per hour.
    #    For now, let's assume a small fixed income for the management period.
    management_income = 10.0 # Example: 10 Ducats for the management period
    
    if dock_owner_username and management_income > 0:
        citizen_owner_record = tables['citizens'].all(formula=f"{{Username}}='{dock_owner_username}'", max_records=1)
        if citizen_owner_record:
            log.info(f"Attempting to add {management_income} Ducats to dock owner {dock_owner_username} for dock management by {citizen_username}.")
            update_citizen_ducats(
                tables,
                citizen_airtable_id=citizen_owner_record[0]['id'],
                amount_change=management_income,
                reason=f"Income from dock management at {dock_name_log} by {citizen_username}",
                related_asset_type="building",
                related_asset_id=dock_custom_id
            )
            # Trust between manager and owner (if different)
            if citizen_username != dock_owner_username:
                update_trust_score_for_activity(
                    tables, citizen_username, dock_owner_username, 
                    TRUST_SCORE_PROGRESS, "dock_management_completed", True, 
                    f"Managed dock {dock_name_log}", activity_record
                )
        else:
            log.warning(f"Dock owner {dock_owner_username} not found. Cannot credit management income.")
    
    # 2. Update dock's CheckedAt field (already done by creator, but could be re-done here if logic changes)
    # try:
    #     tables['buildings'].update(dock_record['id'], {'CheckedAt': datetime.datetime.now(VENICE_TIMEZONE).isoformat()})
    #     log.info(f"Re-confirmed CheckedAt for dock {dock_custom_id} upon processing management activity.")
    # except Exception as e_update_dock:
    #     log.error(f"Error updating CheckedAt for dock {dock_custom_id} during processing: {e_update_dock}")

    # 3. Generate notifications or other side effects (e.g., if many ships docked).

    # For now, the main outcome is that the activity is processed.
    log.info(f"{LogColors.SUCCESS}Successfully processed 'manage_public_dock' activity {activity_guid} for {citizen_username} at {dock_custom_id}.{LogColors.ENDC}")
    return True
