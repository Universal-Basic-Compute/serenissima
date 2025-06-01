"""
Processor for 'goto_construction_site' activities.
When the citizen arrives at the construction site, this processor
simply marks the activity as processed. The next activity in the chain
should have been created by the activity creator.
"""
import logging
from typing import Dict, Any

log = logging.getLogger(__name__)

from backend.engine.utils.activity_helpers import get_building_record, get_citizen_record, LogColors

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any] # Not directly used here but part of signature
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}🚶 Processing 'goto_construction_site' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username = activity_fields.get('Citizen')
    target_building_custom_id = activity_fields.get('BuildingToConstruct') # Stored by creator
    
    if not all([citizen_username, target_building_custom_id]):
        log.error(f"Activity {activity_guid} missing crucial data (Citizen or BuildingToConstruct). Aborting.")
        return False

    target_building_record_data = get_building_record(tables, target_building_custom_id)
    if not target_building_record_data:
        log.error(f"Target building {target_building_custom_id} not found for activity {activity_guid}. Aborting.")
        return False
    
    target_building_name_log = target_building_record_data['fields'].get('Name', target_building_custom_id)
    log.info(f"Citizen **{citizen_username}** arrived at site **{target_building_name_log}** ({target_building_custom_id}).")
    
    # The next activity in the chain (construct_building)
    # should have been created by the activity creator.
    # This processor simply marks the arrival at the construction site.
    
    log.info(f"{LogColors.OKGREEN}Successfully processed 'goto_construction_site' activity for {citizen_username} at {target_building_custom_id}.{LogColors.ENDC}")
    return True
