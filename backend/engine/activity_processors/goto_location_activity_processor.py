import logging
import json
from datetime import datetime
from typing import Dict, Any, Optional

log = logging.getLogger(__name__)

def process_goto_location_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process a goto_location activity.
    
    This is a generic travel activity processor that can be used as part of
    multi-activity chains. It checks the Details field for "activityType" and
    "nextStep" to determine if a specialized processor should handle the arrival.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    
    # If no details, just process as a simple travel activity
    if not details_str:
        log.info(f"Processed simple goto_location activity for citizen {citizen}")
        return True
    
    try:
        details = json.loads(details_str)
    except Exception as e:
        log.error(f"Error parsing Details for goto_location: {e}")
        return True  # Still mark as processed even if details parsing fails
    
    # Check if this is part of a multi-activity chain
    activity_type = details.get("activityType")
    next_step = details.get("nextStep")
    
    if activity_type and next_step:
        log.info(f"goto_location is part of a {activity_type} activity chain, next step: {next_step}")
        
        # Delegate to specialized processors based on activityType
        if activity_type == "bid_on_land" and next_step == "submit_land_bid":
            from backend.engine.activity_processors.bid_on_land_activity_processor import process_bid_on_land_fn
            return process_bid_on_land_fn(tables, activity_record, building_type_defs, resource_defs)
        
        # Add more specialized handlers here as needed
        # elif activity_type == "another_multi_step_activity":
        #     from backend.engine.activity_processors.another_processor import process_fn
        #     return process_fn(tables, activity_record, building_type_defs, resource_defs)
    
    # Default: just mark as processed
    log.info(f"Processed goto_location activity for citizen {citizen}")
    return True
