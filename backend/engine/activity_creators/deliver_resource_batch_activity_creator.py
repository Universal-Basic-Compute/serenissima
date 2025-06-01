"""
Activity Creator for 'deliver_resource_batch'.

This creator is responsible for setting up the 'deliver_resource_batch' activity,
which typically involves a citizen delivering a set of resources from a source
(like a galley) to a final destination building (buyer's building).
"""

import logging
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
    current_time_utc: Any, # datetime object
    notes: Optional[str] = None,
    priority: int = 5 # Default priority
) -> Optional[Dict[str, Any]]:
    """
    Attempts to create a 'deliver_resource_batch' activity.

    This is a stub implementation. It will log the attempt and return None,
    effectively preventing the activity from being created until proper logic is implemented.
    """
    activity_type = "deliver_resource_batch"
    log.info(f"{LogColors.WARNING}[STUB] Attempting to create '{activity_type}' activity for {citizen_username_actor} from {from_building_custom_id} to {to_building_custom_id}.{LogColors.ENDC}")
    log.info(f"{LogColors.WARNING}[STUB]   Manifest: {resources_manifest}, Contract: {contract_id_ref}, Mode: {transport_mode}{LogColors.ENDC}")
    log.info(f"{LogColors.WARNING}[STUB]   This creator is a STUB and will not create the activity.{LogColors.ENDC}")

    # To make this functional, you would typically:
    # 1. Validate inputs.
    # 2. Calculate StartDate and EndDate based on current_time_utc and path_data['duration_hours'].
    #    start_date_iso = current_time_utc.isoformat()
    #    duration = datetime.timedelta(hours=path_data.get('duration_hours', 1))
    #    end_date_iso = (current_time_utc + duration).isoformat()
    # 3. Prepare 'details_json' if needed, perhaps with the resources_manifest.
    #    details_payload = {"resources_manifest": resources_manifest, "original_contract_id": contract_id_ref}
    #    details_json_str = json.dumps(details_payload)
    # 4. Call create_activity_record.
    #
    # Example (commented out):
    # import datetime
    # import json
    #
    # start_date_iso = current_time_utc.isoformat()
    # duration_hours = path_data.get('duration_hours', 1.0) # Ensure float
    # duration_timedelta = datetime.timedelta(hours=duration_hours)
    # end_date_iso = (current_time_utc + duration_timedelta).isoformat()
    #
    # details_payload = {
    #     "resources_manifest": resources_manifest,
    #     "original_contract_id": contract_id_ref,
    #     "from_building_id": from_building_custom_id, # For clarity in details
    #     "to_building_id": to_building_custom_id      # For clarity in details
    # }
    # details_json_str = json.dumps(details_payload)
    #
    # title = f"Deliver Batch to {to_building_custom_id}"
    # description = f"Delivering {len(resources_manifest)} types of resources from {from_building_custom_id} to {to_building_custom_id}."
    #
    # return create_activity_record(
    #     tables=tables,
    #     citizen_username=citizen_username_actor,
    #     activity_type=activity_type,
    #     start_date_iso=start_date_iso,
    #     end_date_iso=end_date_iso,
    #     from_building_id=from_building_custom_id,
    #     to_building_id=to_building_custom_id,
    #     path_json=json.dumps(path_data.get('path', [])),
    #     details_json=details_json_str,
    #     notes=notes,
    #     contract_id=contract_id_ref, # This might be the original contract ID for reference
    #     transporter_username=path_data.get('transporter'), # If path data includes transporter info
    #     title=title,
    #     description=description
    # )
    
    return None # Stub returns None, so no activity is created.
