"""
Processor for 'check_business_status' activities.
Updates the 'CheckedAt' timestamp of the business building.
If issues are found (no worker, idle worker), it triggers autonomouslyRun.py for the manager.
"""
import logging
import datetime
import subprocess
import json
import os
import sys
from typing import Dict, Any, Optional
import pytz # For timezone.utc

# Determine project root for running autonomouslyRun.py
PROJECT_ROOT_CBS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from backend.engine.utils.activity_helpers import get_building_record, get_citizen_record, VENICE_TIMEZONE, LogColors, _escape_airtable_value, dateutil_parser
from backend.engine.utils import update_trust_score_for_activity
from backend.engine.utils.relationship_helpers import TRUST_SCORE_MINOR_POSITIVE, TRUST_SCORE_MINOR_NEGATIVE

log = logging.getLogger(__name__)

def _is_occupant_idle(tables: Dict[str, Any], occupant_username: str, now_utc: datetime.datetime) -> bool:
    """Checks if the occupant is effectively idle from a work perspective."""
    try:
        formula = f"AND({{Citizen}}='{_escape_airtable_value(occupant_username)}', OR({{Status}}='created', {{Status}}='in_progress'))"
        active_activities = tables['activities'].all(formula=formula)

        if not active_activities:
            log.info(f"Occupant {occupant_username} has no 'created' or 'in_progress' activities. Considered idle for work.")
            return True

        for activity in active_activities:
            activity_type = activity['fields'].get('Type', '').lower()
            # Check if the activity is currently happening
            start_date_str = activity['fields'].get('StartDate')
            end_date_str = activity['fields'].get('EndDate')
            
            if start_date_str and end_date_str:
                try:
                    start_date_dt = dateutil_parser.isoparse(start_date_str)
                    end_date_dt = dateutil_parser.isoparse(end_date_str)
                    if start_date_dt.tzinfo is None: start_date_dt = pytz.utc.localize(start_date_dt)
                    if end_date_dt.tzinfo is None: end_date_dt = pytz.utc.localize(end_date_dt)

                    if start_date_dt <= now_utc <= end_date_dt:
                        # Activity is currently ongoing
                        if activity_type not in ['idle', 'rest']:
                            log.info(f"Occupant {occupant_username} is currently performing '{activity_type}'. Not considered idle for work.")
                            return False # Found an active, non-idle/non-rest task
                except Exception as e_date:
                    log.warning(f"Could not parse dates for activity {activity['id']} of {occupant_username}: {e_date}")
        
        # If loop completes, all active tasks were idle or rest, or no tasks are currently ongoing
        log.info(f"Occupant {occupant_username}'s active tasks are only 'idle' or 'rest', or no tasks are currently ongoing. Considered idle for work.")
        return True
    except Exception as e:
        log.error(f"Error checking occupant {occupant_username} activities: {e}")
        return False # Assume not idle on error to be safe

def _trigger_autonomous_run_for_manager(manager_username: str, message: str):
    """Triggers autonomouslyRun.py for the manager with a specific message."""
    try:
        script_path = os.path.join(PROJECT_ROOT_CBS, "backend", "ais", "autonomouslyRun.py")
        command = [
            sys.executable, # Use the same python interpreter
            script_path,
            "--local", # Use local Kinos model for this automated trigger
            "--citizen", manager_username,
            "--addMessage", message
        ]
        log.info(f"Triggering autonomouslyRun for manager {manager_username} with message: '{message[:100]}...'")
        # Run non-blocking
        subprocess.Popen(command, cwd=PROJECT_ROOT_CBS)
    except Exception as e:
        log.error(f"Failed to trigger autonomouslyRun for manager {manager_username}: {e}")

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any] # Not directly used here but part of signature
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    log.info(f"{LogColors.OKBLUE}💼 Processing 'check_business_status' activity: {activity_guid}{LogColors.ENDC}")

    manager_username = activity_fields.get('Citizen') # This is the RunBy citizen
    business_building_custom_id = activity_fields.get('ToBuilding') # Citizen arrived here

    if not business_building_custom_id:
        log.error(f"Activity {activity_guid} missing ToBuilding (business ID). Aborting.")
        return False

    business_building_record = get_building_record(tables, business_building_custom_id)
    if not business_building_record:
        log.error(f"Business building {business_building_custom_id} for activity {activity_guid} not found.")
        return False
    
    business_building_airtable_id = business_building_record['id']
    business_name_log = business_building_record['fields'].get('Name', business_building_custom_id)

    try:
        now_utc = datetime.datetime.now(pytz.timezone('UTC'))
        now_iso_venice = datetime.datetime.now(VENICE_TIMEZONE).isoformat()
        update_payload = {'CheckedAt': now_iso_venice}
        
        tables['buildings'].update(business_building_airtable_id, update_payload)
        log.info(f"{LogColors.OKGREEN}Business **{business_name_log}** ({business_building_custom_id}) status checked by **{manager_username}**. Updated 'CheckedAt' to {now_iso_venice}.{LogColors.ENDC}")
        
        # Check Occupant status
        occupant_username = business_building_record['fields'].get('Occupant')
        
        if not occupant_username:
            message = (f"Attention: Your business '{business_name_log}' (ID: {business_building_custom_id}) "
                       f"currently has no worker assigned (Occupant field is empty). "
                       f"Consider assigning a worker or managing it yourself to ensure productivity.")
            log.warning(f"{LogColors.WARNING}No occupant found for business {business_name_log}. Triggering manager {manager_username}.{LogColors.ENDC}")
            _trigger_autonomous_run_for_manager(manager_username, message)
        else:
            occupant_record = get_citizen_record(tables, occupant_username)
            if not occupant_record:
                message = (f"Issue: The assigned occupant '{occupant_username}' for your business '{business_name_log}' (ID: {business_building_custom_id}) "
                           f"could not be found in the citizen records. Please verify the assignment.")
                log.warning(f"{LogColors.WARNING}Occupant {occupant_username} for business {business_name_log} not found. Triggering manager {manager_username}.{LogColors.ENDC}")
                _trigger_autonomous_run_for_manager(manager_username, message)
            elif _is_occupant_idle(tables, occupant_username, now_utc):
                message = (f"Observation: Your worker '{occupant_username}' at business '{business_name_log}' (ID: {business_building_custom_id}) "
                           f"appears to be idle. You may want to check if they have necessary resources, tasks, or if there's an issue preventing work.")
                log.info(f"{LogColors.OKBLUE}Occupant {occupant_username} at business {business_name_log} is idle. Triggering manager {manager_username}.{LogColors.ENDC}")
                _trigger_autonomous_run_for_manager(manager_username, message)
                # Case 2: Occupant is idle - decrease trust score
                update_trust_score_for_activity(
                    tables,
                    manager_username, # Citizen performing the check
                    occupant_username, # Worker being checked
                    TRUST_SCORE_MINOR_NEGATIVE, # Small negative impact
                    "check_business_status_worker_idle",
                    success=False, # Interaction perceived negatively by manager
                    notes_detail=f"Worker {occupant_username} found idle at {business_name_log}.",
                    activity_record_for_kinos=activity_record['fields']
                )
            else:
                log.info(f"{LogColors.OKGREEN}Worker {occupant_username} at business {business_name_log} is currently active. All seems fine.{LogColors.ENDC}")
                # Case 3: Everything's fine - increase trust score
                update_trust_score_for_activity(
                    tables,
                    manager_username, # Citizen performing the check
                    occupant_username, # Worker being checked
                    TRUST_SCORE_MINOR_POSITIVE, # Small positive impact
                    "check_business_status_worker_active",
                    success=True, # Interaction perceived positively by manager
                    notes_detail=f"Worker {occupant_username} found active at {business_name_log}.",
                    activity_record_for_kinos=activity_record['fields']
                )
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'check_business_status' activity {activity_guid} for building {business_building_custom_id}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return False
