"""
Processor for 'goto_construction_site' activities.
When the citizen arrives at the construction site, this processor
marks the activity as processed. If 'Notes' indicate a follow-up action
like 'construct_building', it creates that activity.
"""
import logging
import json
import datetime
import pytz # For timezone handling if needed by creator
from typing import Dict, Any, Optional

log = logging.getLogger(__name__)

from backend.engine.utils.activity_helpers import get_building_record, get_citizen_record, LogColors
from backend.engine.activity_creators.construct_building_creator import try_create_construct_building_activity

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], 
    resource_defs: Dict[str, Any],
    current_time_utc: datetime.datetime # Added current_time_utc
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}🚶 Processing 'goto_construction_site' activity: {activity_guid}{LogColors.ENDC}")

    citizen_username = activity_fields.get('Citizen')
    # For 'goto_construction_site', 'ToBuilding' is the construction site.
    arrival_site_custom_id = activity_fields.get('ToBuilding') 
    
    if not all([citizen_username, arrival_site_custom_id]):
        log.error(f"Activity {activity_guid} missing crucial data (Citizen or ToBuilding). Aborting.")
        return False

    arrival_site_record_data = get_building_record(tables, arrival_site_custom_id)
    if not arrival_site_record_data:
        log.error(f"Arrival site {arrival_site_custom_id} not found for activity {activity_guid}. Aborting.")
        return False
    
    arrival_site_name_log = arrival_site_record_data['fields'].get('Name', arrival_site_custom_id)
    log.info(f"Citizen **{citizen_username}** arrived at site **{arrival_site_name_log}** ({arrival_site_custom_id}).")
    
    # Check Notes for DetailsJSON and action_on_arrival
    notes_field = activity_fields.get('Notes', '')
    details_json_str: Optional[str] = None
    if "\nDetailsJSON: " in notes_field:
        try:
            details_json_str = notes_field.split("\nDetailsJSON: ", 1)[1]
        except IndexError:
            log.warning(f"Could not extract DetailsJSON string part from notes for activity {activity_guid}.")

    if details_json_str:
        try:
            details = json.loads(details_json_str)
            log.info(f"Parsed DetailsJSON for activity {activity_guid}: {details}")

            if details.get("action_on_arrival") == "construct_building":
                log.info(f"Action on arrival for {activity_guid} is 'construct_building'. Creating follow-up activity.")
                
                work_duration_on_arrival = details.get("work_duration_minutes_on_arrival")
                # This is the building to actually perform construction on. Should match arrival_site_custom_id.
                target_building_id_for_construction_phase = details.get("target_building_id_on_arrival")
                # ContractId for the construction project is taken from the current goto_construction_site activity
                contract_id_for_construction_phase = activity_fields.get('ContractId')

                if not all([work_duration_on_arrival, target_building_id_for_construction_phase, contract_id_for_construction_phase]):
                    log.error(f"Missing data in DetailsJSON for 'construct_building' follow-up: work_duration={work_duration_on_arrival}, target_building_id={target_building_id_for_construction_phase}, contract_id={contract_id_for_construction_phase}. Activity: {activity_guid}")
                else:
                    citizen_record_data = get_citizen_record(tables, citizen_username)
                    # target_building_record_for_construction should be the same as arrival_site_record_data
                    target_building_record_for_construction = get_building_record(tables, target_building_id_for_construction_phase)

                    if citizen_record_data and target_building_record_for_construction:
                        log.info(f"Creating 'construct_building' activity for {citizen_username} at {target_building_id_for_construction_phase} for {work_duration_on_arrival} minutes. Contract: {contract_id_for_construction_phase}.")
                        
                        created_follow_up_activity = try_create_construct_building_activity(
                            tables=tables,
                            citizen_record=citizen_record_data,
                            target_building_record=target_building_record_for_construction,
                            work_duration_minutes=int(work_duration_on_arrival),
                            contract_custom_id_or_airtable_id=contract_id_for_construction_phase,
                            path_data=None, # Citizen has arrived, no path needed for the work activity
                            current_time_utc=current_time_utc,
                            start_time_utc_iso=current_time_utc.isoformat() # Work starts now
                        )
                        if created_follow_up_activity:
                            log.info(f"Successfully created follow-up 'construct_building' activity {created_follow_up_activity['id']} for original activity {activity_guid}.")
                        else:
                            log.error(f"Failed to create follow-up 'construct_building' activity for original activity {activity_guid}.")
                    else:
                        log.error(f"Could not fetch citizen record ({citizen_username}) or target building record ({target_building_id_for_construction_phase}) for follow-up activity. Original activity: {activity_guid}")
            else:
                log.info(f"No 'construct_building' action specified in DetailsJSON for activity {activity_guid}, or action is '{details.get('action_on_arrival')}'. No follow-up created by this processor.")

        except json.JSONDecodeError:
            log.warning(f"Could not parse DetailsJSON in Notes for activity {activity_guid}: '{details_json_str}'")
    else:
        log.info(f"No DetailsJSON found in Notes for activity {activity_guid}. No follow-up action taken by processor.")
    
    log.info(f"{LogColors.OKGREEN}Successfully processed 'goto_construction_site' activity {activity_guid} for {citizen_username} at {arrival_site_custom_id}.{LogColors.ENDC}")
    return True
