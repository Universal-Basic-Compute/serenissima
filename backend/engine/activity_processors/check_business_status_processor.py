"""
Processor for 'check_business_status' activities.
Updates the 'CheckedAt' timestamp of the business building.
"""
import logging
import datetime
from typing import Dict, Any

from backend.engine.utils.activity_helpers import get_building_record, VENICE_TIMEZONE, LogColors

log = logging.getLogger(__name__)

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any] # Not directly used here but part of signature
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}Processing 'check_business_status' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username = activity_fields.get('Citizen') # For logging
    business_building_custom_id = activity_fields.get('ToBuilding') # Citizen arrived here

    if not business_building_custom_id:
        log.error(f"Activity {activity_guid} missing ToBuilding (business ID). Aborting.")
        return False

    business_building_record = get_building_record(tables, business_building_custom_id)
    if not business_building_record:
        log.error(f"Business building {business_building_custom_id} for activity {activity_guid} not found.")
        return False
    
    business_building_airtable_id = business_building_record['id']

    try:
        now_iso_venice = datetime.datetime.now(VENICE_TIMEZONE).isoformat()
        update_payload = {'CheckedAt': now_iso_venice}
        
        tables['buildings'].update(business_building_airtable_id, update_payload)
        log.info(f"{LogColors.OKGREEN}Business {business_building_custom_id} status checked by {citizen_username}. Updated 'CheckedAt' to {now_iso_venice}.{LogColors.ENDC}")
        
        # Citizen's position is updated by the main processActivities loop to ToBuilding.
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'check_business_status' activity {activity_guid} for building {business_building_custom_id}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return False
