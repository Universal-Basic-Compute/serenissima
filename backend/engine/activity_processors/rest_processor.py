import logging
import json
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    LogColors,
    get_citizen_record,
    clean_thought_content
)
from backend.engine.utils.process_helper import (
    create_process,
    PROCESS_TYPE_DAILY_REFLECTION
)

log = logging.getLogger(__name__)

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    messagesing_type_defs: Dict[str, Any], # Not directly used here but part of signature
    resource_defs: Dict[str, Any],      # Not directly used here but part of signature
    api_base_url: Optional[str] = None
) -> bool:
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')
    
    # 'Notes' might contain details about the rest location (e.g., home, inn)
    # but for the reflection, we primarily need the citizen's context.
    notes_str = activity_fields.get('Notes') 
    activity_details = {}
    if notes_str:
        try:
            activity_details = json.loads(notes_str)
        except json.JSONDecodeError:
            log.warning(f"Could not parse Notes JSON for rest activity {activity_guid}: {notes_str}")
            # Continue, as notes are not critical for basic rest processing + KinOS reflection

    log.info(f"{LogColors.ACTIVITY}😴 Processing 'rest' activity: {activity_guid} for {citizen_username}. Queueing daily reflection.{LogColors.ENDC}")

    citizen_airtable_record = get_citizen_record(tables, citizen_username)
    if not citizen_airtable_record:
        log.error(f"{LogColors.FAIL}Citizen {citizen_username} not found for rest activity {activity_guid}. Aborting KinOS reflection.{LogColors.ENDC}")
        # Still return True as the 'rest' activity itself is considered processed by time passing.
        return True 

    # Create a process for daily reflection instead of generating it directly
    process_details = {
        "activity_id": activity_record['id'],
        "activity_guid": activity_guid,
        "activity_details": activity_details
    }
    
    # Commenting out reflection call
    """
    # Check if 'processes' table exists before creating process
    from backend.engine.utils.process_helper import is_processes_table_available
    
    if not is_processes_table_available(tables):
        log.error(f"{LogColors.FAIL}Cannot create daily reflection process for {citizen_username} - 'processes' table not available or is not properly initialized.{LogColors.ENDC}")
        log.info(f"{LogColors.WARNING}Attempting to reinitialize tables to get a working processes table...{LogColors.ENDC}")
        
        # Try to reinitialize the tables
        try:
            from backend.engine.utils.activity_helpers import get_tables
            new_tables = get_tables()
            if is_processes_table_available(new_tables):
                log.info(f"{LogColors.OKGREEN}Successfully reinitialized tables and found working 'processes' table. Attempting to create process with new tables.{LogColors.ENDC}")
                # Include api_base_url in process_details
                if api_base_url:
                    process_details["api_base_url"] = api_base_url
                
                process_record = create_process(
                    tables=new_tables,
                    process_type=PROCESS_TYPE_DAILY_REFLECTION,
                    citizen_username=citizen_username,
                    priority=5,  # Medium priority
                    details=process_details
                )
                if process_record:
                    log.info(f"{LogColors.OKGREEN}Successfully created daily reflection process for {citizen_username} after table reinitialization.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}Failed to create daily reflection process for {citizen_username} even after table reinitialization.{LogColors.ENDC}")
            else:
                log.error(f"{LogColors.FAIL}Failed to get working 'processes' table even after reinitialization. Process creation failed.{LogColors.ENDC}")
        except Exception as e_reinit:
            log.error(f"{LogColors.FAIL}Error reinitializing tables: {e_reinit}{LogColors.ENDC}")
    else:
        try:
            # Include api_base_url in process_details
            if api_base_url:
                process_details["api_base_url"] = api_base_url
            
            process_record = create_process(
                tables=tables,
                process_type=PROCESS_TYPE_DAILY_REFLECTION,
                citizen_username=citizen_username,
                priority=5,  # Medium priority
                details=process_details
            )
            if process_record:
                log.info(f"{LogColors.OKGREEN}Successfully created daily reflection process for {citizen_username}.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Failed to create daily reflection process for {citizen_username}.{LogColors.ENDC}")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error creating daily reflection process for {citizen_username}: {e}{LogColors.ENDC}")
    """
    log.info(f"{LogColors.OKGREEN}Daily reflection disabled for {citizen_username}.{LogColors.ENDC}")

    # The 'rest' activity itself is considered successful by its completion.
    # KinOS reflection is an add-on that will be processed asynchronously.
    return True
