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
    from_building_custom_id: str,
    to_building_custom_id: str,
    resources_manifest: List[Dict[str, Any]], # e.g., [{"ResourceId": "wood", "Amount": 10}]
    contract_id_ref: Optional[str],
    transport_mode: str,
    path_data: Dict[str, Any], # Expected to contain 'path' (list of coords) and 'duration_hours'
    current_time_utc: datetime.datetime, # Ensure this is a datetime object
    notes: Optional[str] = None,
    priority: int = 5 # Default priority
) -> Optional[Dict[str, Any]]:
    """
    Attempts to create a 'deliver_resource_batch' activity.
    """
    activity_type = "deliver_resource_batch"

    if not all([citizen_username_actor, from_building_custom_id, to_building_custom_id, resources_manifest, path_data]):
        log.error(f"{LogColors.FAIL}Missing required parameters for {activity_type} for {citizen_username_actor}.{LogColors.ENDC}")
        return None

    # Validate path_data
    if not isinstance(path_data, dict) or 'duration_hours' not in path_data or 'path' not in path_data:
        log.error(f"{LogColors.FAIL}Invalid path_data for {activity_type}: {path_data}{LogColors.ENDC}")
        return None
        
    duration_hours = path_data.get('duration_hours', 1.0) # Default to 1 hour if not specified
    try:
        duration_hours = float(duration_hours)
    except ValueError:
        log.error(f"{LogColors.FAIL}Invalid duration_hours value: {duration_hours}. Must be a number.{LogColors.ENDC}")
        return None

    start_date_iso = current_time_utc.isoformat()
    duration_timedelta = datetime.timedelta(hours=duration_hours)
    end_date_iso = (current_time_utc + duration_timedelta).isoformat()

    details_payload = {
        "resources_manifest": resources_manifest,
        "original_contract_id": contract_id_ref,
        "from_building_id": from_building_custom_id, # For clarity in details
        "to_building_id": to_building_custom_id      # For clarity in details
    }
    details_json_str = json.dumps(details_payload)

    title = f"Deliver Batch to {to_building_custom_id}"
    description = f"Delivering {len(resources_manifest)} types of resources from {from_building_custom_id} to {to_building_custom_id}."
    
    # Construct a more informative thought if possible
    resource_summary = ", ".join([f"{item.get('Amount', 0)} {item.get('ResourceId', 'unknown')}" for item in resources_manifest[:2]])
    if len(resources_manifest) > 2:
        resource_summary += " and more"
    
    thought = f"I need to deliver {resource_summary} from {from_building_custom_id} to {to_building_custom_id}. This should take about {duration_hours:.1f} hours."

    log.info(f"{LogColors.OKBLUE}Creating '{activity_type}' for {citizen_username_actor}: {from_building_custom_id} -> {to_building_custom_id}. Manifest: {len(resources_manifest)} items.{LogColors.ENDC}")

    return create_activity_record(
        tables=tables,
        citizen_username=citizen_username_actor,
        activity_type=activity_type,
        start_date_iso=start_date_iso,
        end_date_iso=end_date_iso,
        from_building_id=from_building_custom_id,
        to_building_id=to_building_custom_id,
        path_json=json.dumps(path_data.get('path', [])),
        details_json=details_json_str,
        notes=notes,
        contract_id=contract_id_ref, # This might be the original contract ID for reference
        transporter_username=path_data.get('transporter'), # If path data includes transporter info
        title=title,
        description=description,
        thought=thought # Add the generated thought
        # Priority is not directly passed to create_activity_record, it's managed by the caller or defaults in Airtable
    )
