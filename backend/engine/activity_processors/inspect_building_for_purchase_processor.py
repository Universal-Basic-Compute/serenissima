import logging
import json # Added import
from typing import Dict, Any

from backend.engine.utils.activity_helpers import LogColors

log = logging.getLogger(__name__)

def process_inspect_building_for_purchase_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any, # Not used by this processor, but part of signature
    resource_defs: Any      # Not used by this processor, but part of signature
) -> bool:
    """
    Processes the 'inspect_building_for_purchase' activity.
    Currently, this is a placeholder activity in the chain.
    It signifies that the citizen has spent time inspecting the building.
    No direct state changes occur from this activity alone, but it's a necessary step.
    """
    fields = activity_record.get('fields', {})
    activity_guid = fields.get('ActivityId', activity_record.get('id'))
    citizen_username = fields.get('Citizen')
    building_id_inspected = fields.get('FromBuilding') # Citizen is at this building

    details_str = fields.get('Details')
    details = {}
    if details_str:
        try:
            details = json.loads(details_str)
        except json.JSONDecodeError:
            log.warning(f"{LogColors.WARNING}Could not parse Details JSON for activity {activity_guid}: {details_str}{LogColors.ENDC}")

    building_id_to_bid_on = details.get('buildingIdToBidOn', building_id_inspected) # Fallback to FromBuilding

    log.info(
        f"{LogColors.OKGREEN}Processing 'inspect_building_for_purchase' for citizen {citizen_username} "
        f"at building {building_id_inspected} (target bid: {building_id_to_bid_on}). Activity ID: {activity_guid}.{LogColors.ENDC}"
    )
    log.info(f"{LogColors.OKBLUE}  Citizen {citizen_username} has completed inspection of building {building_id_to_bid_on}. "
             f"Next activity in chain should be travel to official office.{LogColors.ENDC}")

    # This activity primarily serves as a time block and a logical step in the chain.
    # Future enhancements could include:
    # - AI citizen updating internal knowledge about the building.
    # - Generating a small "inspection report" thought for the citizen.
    # - Minor chance of discovering something that might alter bid decision (though this is complex).

    return True # Always successful as it's a placeholder/time-block activity.
