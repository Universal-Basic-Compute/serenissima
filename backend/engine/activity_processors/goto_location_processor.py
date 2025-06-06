import logging
import json
from datetime import datetime
from typing import Dict, Any, Optional
from pyairtable import Table

log = logging.getLogger(__name__)

def process(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process a goto_location activity.
    
    This is a generic movement activity that can be used for various purposes.
    The specific purpose is determined by the Details field, which should contain
    an 'activityType' field indicating what this movement is for.
    
    Args:
        tables: Dictionary of Airtable tables
        activity_record: The activity record to process
        building_type_defs: Building type definitions
        resource_defs: Resource type definitions
        
    Returns:
        bool: True if the activity was processed successfully, False otherwise
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    citizen = fields.get('Citizen')
    to_building = fields.get('ToBuilding')
    path_str = fields.get('Path')
    notes_str = fields.get('Notes') # Changed Details to Notes
    
    if activity_type != "goto_location":
        log.error(f"Expected activity type 'goto_location', got '{activity_type}'")
        return False
    
    if not citizen:
        log.error("Missing citizen in goto_location activity")
        return False
    
    try:
        # Parse the path
        path = []
        if path_str and path_str.strip():
            try:
                parsed_path_candidate = json.loads(path_str)
                if isinstance(parsed_path_candidate, list):
                    path = parsed_path_candidate
                else:
                    log.warning(f"Path string for activity {fields.get('ActivityId', 'N/A')} (Citizen: {citizen}) did not parse to a list: '{path_str[:100]}...'. Using empty path.")
            except json.JSONDecodeError:
                log.warning(f"Could not parse Path as JSON for activity {fields.get('ActivityId', 'N/A')} (Citizen: {citizen}). Path: '{path_str[:100]}...'. Using empty path.")
        
        # Parse notes (details)
        details = {}
        if notes_str and notes_str.strip():
            try:
                parsed_details_candidate = json.loads(notes_str)
                if isinstance(parsed_details_candidate, dict):
                    details = parsed_details_candidate
                else:
                    log.warning(f"Parsed Notes (details) is not a dictionary for activity {fields.get('ActivityId', 'N/A')} (Citizen: {citizen}). Notes: '{notes_str[:100]}...'. Using empty details.")
                    # details remains {}
            except json.JSONDecodeError:
                log.warning(f"Could not parse Notes (details) as JSON for activity {fields.get('ActivityId', 'N/A')} (Citizen: {citizen}). Notes: '{notes_str[:100]}...'. Using empty details.")
                # details remains {}
        
        # Get the purpose of this movement
        purpose = details.get("activityType", "unknown") # 'details' here is the parsed JSON from 'Notes'
        
        # Update citizen position to the destination
        if path and len(path) > 0:
            # Get the last point in the path as the destination
            destination = path[-1]
            
            # Update citizen position
            citizen_formula = f"{{Username}}='{citizen}'"
            citizen_records = tables['citizens'].all(formula=citizen_formula, max_records=1)
            
            if citizen_records:
                citizen_record = citizen_records[0]
                tables['citizens'].update(citizen_record['id'], {
                    'Position': json.dumps(destination)
                })
                
                log.info(f"Updated position for citizen {citizen} to {destination}")
                
                # If there's a ToBuilding, update the citizen's Point field
                if to_building:
                    # For now, we don't set the Point field as it's not clear what it should be
                    # This would require knowing which specific point on the building the citizen is at
                    pass
                
                # Log the completion based on the purpose
                if purpose != "unknown":
                    log.info(f"Citizen {citizen} has arrived at destination for {purpose}")
                else:
                    log.info(f"Citizen {citizen} has arrived at destination")
                
                return True
            else:
                log.error(f"Citizen {citizen} not found")
                return False
        else:
            log.error(f"No valid path found in goto_location activity for citizen {citizen}")
            return False
    except Exception as e:
        log.error(f"Error processing goto_location activity for citizen {citizen}: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
