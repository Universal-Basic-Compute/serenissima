"""
Activity Creator for 'deliver_resource_batch'.

This creator is responsible for setting up the 'deliver_resource_batch' activity,
which typically involves a citizen delivering a set of resources from a source
(like a galley) to a final destination building (buyer's building).
"""

import logging
import datetime
import json
from typing import Dict, Any, List, Optional
from backend.engine.utils.activity_helpers import (
    create_activity_record,
    LogColors
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_username_actor: str,
    from_building_custom_id: Optional[str], # Made optional
    to_building_custom_id: str,
    resources_manifest: List[Dict[str, Any]], # e.g., [{"ResourceId": "wood", "Amount": 10}]
    contract_id_ref: Optional[str],
    transport_mode: str,
    path_data: Dict[str, Any], # Expected to contain 'path', and 'timing' with 'startDate', 'endDate', 'durationSeconds'
    current_time_utc: datetime.datetime, # Ensure this is a datetime object
    notes: Optional[str] = None,
    priority: int = 5 # Default priority
) -> Optional[Dict[str, Any]]:
    """
    Attempts to create a 'deliver_resource_batch' activity.
    """
    activity_type = "deliver_resource_batch"

    # Validate required parameters (from_building_custom_id is now optional)
    if not all([citizen_username_actor, to_building_custom_id, resources_manifest, path_data]):
        log.error(f"{LogColors.FAIL}Missing required parameters (excluding from_building_id) for {activity_type} for {citizen_username_actor}.{LogColors.ENDC}")
        return None

    # Validate path_data structure and content
    path_timing = path_data.get('timing')
    if not (isinstance(path_data, dict) and 
            isinstance(path_timing, dict) and
            path_timing.get('startDate') and 
            path_timing.get('endDate') and
            path_timing.get('durationSeconds') is not None and
            path_data.get('path') is not None):
        log.error(f"{LogColors.FAIL}Invalid or incomplete path_data structure for {activity_type}: {path_data}{LogColors.ENDC}")
        return None
        
    start_date_iso = path_timing['startDate']
    end_date_iso = path_timing['endDate']
    duration_seconds = float(path_timing['durationSeconds'])
    duration_hours = duration_seconds / 3600.0

    # Prepare the JSON string for the 'Resources' field directly
    resources_manifest_json_str = json.dumps(resources_manifest)

    # Prepare the details payload for the 'Notes' field (excluding resources_manifest)
    details_for_notes_payload = {
        "original_contract_id": contract_id_ref,
        "from_building_id": from_building_custom_id,
        "to_building_id": to_building_custom_id
    }
    details_for_notes_json_str = json.dumps(details_for_notes_payload)

    from_location_display = from_building_custom_id if from_building_custom_id else "origin point"
    title = f"Deliver Batch to {to_building_custom_id}"
    description = f"Delivering {len(resources_manifest)} types of resources from {from_location_display} to {to_building_custom_id}."
    
    resource_summary = ", ".join([f"{item.get('Amount', 0)} {item.get('ResourceId', 'unknown')}" for item in resources_manifest[:2]])
    if len(resources_manifest) > 2:
        resource_summary += " and more"
    
    thought = f"I need to deliver {resource_summary} from {from_location_display} to {to_building_custom_id}. This should take about {duration_hours:.1f} hours."

    log.info(f"{LogColors.OKBLUE}Creating '{activity_type}' for {citizen_username_actor}: {from_location_display} -> {to_building_custom_id}. Manifest: {len(resources_manifest)} items.{LogColors.ENDC}")

    return create_activity_record(
        tables=tables,
        citizen_username=citizen_username_actor,
        activity_type=activity_type,
        start_date_iso=start_date_iso, # Use startDate from path_data.timing
        end_date_iso=end_date_iso,     # Use endDate from path_data.timing
        from_building_id=from_building_custom_id, # Can be None
        to_building_id=to_building_custom_id,
        path_json=json.dumps(path_data.get('path', [])),
        resources_json_payload=resources_manifest_json_str, # Pass the manifest to the new parameter
        details_json=details_for_notes_json_str, # Pass the remaining details to Notes
        notes=notes, # Original notes parameter, if any, will be overridden by details_json if details_json is not None
        contract_id=contract_id_ref,
        transporter_username=path_data.get('transporter'),
        title=title,
        description=description,
        thought=thought,
        priority_override=priority # Pass priority to create_activity_record
    )
