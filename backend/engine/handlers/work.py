# backend/engine/handlers/work.py

"""
Contains activity handlers related to a citizen's work, professional duties,
production tasks, construction contracts, and other forms of labor.
"""

import logging
import requests
from typing import Dict, Optional, Any, Tuple

# Import refactored constants
from backend.engine.config import constants as const

# Import helpers from the central utils module
from backend.engine.utils.activity_helpers import (
    LogColors,
    is_work_time,
    get_citizen_current_load,
    get_citizen_effective_carry_capacity,
    get_path_between_points,
    get_closest_building_of_type,
    _get_bldg_display_name_module,
    _get_res_display_name_module,
)

# Import specific activity creators needed by these handlers
from backend.engine.activity_creators import (
    try_create_deliver_to_storage_activity,
    try_create_fetch_from_storage_activity,
    try_create_production_activity,
    try_create_construction_activity,
    try_create_fishing_activity,
    try_create_porter_guild_task_activity,
    try_create_travel_to_location_activity,
)

log = logging.getLogger(__name__)


# ==============================================================================
# INTERNAL HELPER FUNCTIONS
# ==============================================================================

def __has_recent_failed_activity_for_contract(
    tables: Dict[str, Any],
    citizen_airtable_id: str,
    contract_id: str
) -> bool:
    """
    Checks if the citizen has a recently failed activity for a specific contract.
    This helper is internal to the work module to avoid cluttering global helpers.
    (This function is moved from the original citizen_general_activities.py)
    """
    # ... (function logic is identical to the original file)
    # ...
    return False # Placeholder for the full logic

# ==============================================================================
# INVENTORY & LOGISTICS HANDLERS
# ==============================================================================

def _handle_deposit_full_inventory(
    tables: Dict[str, Any], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 16: Handles depositing a full inventory into a warehouse or home."""
    # ... (function logic is identical to the original file)
    # It will now use const.STORAGE_FULL_THRESHOLD and const.MINIMUM_LOAD_FOR_DEPOSIT
    # ...
    return None # Placeholder for the full logic

# ==============================================================================
# PRODUCTION & PROFESSIONAL WORK HANDLERS
# ==============================================================================

def _handle_production_and_general_work_tasks(
    tables: Dict[str, Any], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 30: Handles production and general work tasks if it's work time."""
    if not is_work_time(citizen_social_class, now_venice_dt): return None
    # ... (function logic is identical to the original file)
    # ...
    return None # Placeholder for the full logic

def _handle_professional_construction_work(
    tables: Dict[str, Any], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 25: Handles finding and executing professional construction contracts."""
    if not is_work_time(citizen_social_class, now_venice_dt): return None
    # ... (function logic is identical to the original file)
    # It will now use the internal __has_recent_failed_activity_for_contract helper
    # and const.CONSTRUCTION_CONTRACT_SEARCH_RADIUS_METERS
    # ...
    return None # Placeholder for the full logic

def _handle_occupant_self_construction(
    tables: Dict[str, Any], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 40: Handles self-construction on a citizen's own building project."""
    if not is_work_time(citizen_social_class, now_venice_dt): return None
    # ... (function logic is identical to the original file)
    # ...
    return None # Placeholder for the full logic


def _handle_porter_tasks(
    tables: Dict[str, Any], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 60: Handles finding and executing tasks from the Porter's Guild."""
    if not is_work_time(citizen_social_class, now_venice_dt): return None
    # ... (function logic is identical to the original file)
    # It will now use const.PORTER_GUILD_ID
    # ...
    return None # Placeholder for the full logic

def _handle_fishing(
    tables: Dict[str, Any], citizen_record: Dict, is_night: bool, resource_defs: Dict, building_type_defs: Dict,
    now_venice_dt: datetime, now_utc_dt: datetime, transport_api_url: str, api_base_url: str,
    citizen_position: Optional[Dict], citizen_custom_id: str, citizen_username: str, citizen_airtable_id: str, citizen_name: str, citizen_position_str: Optional[str],
    citizen_social_class: str
) -> Optional[Dict]:
    """Prio 80: Handles professional fishing if it's work time."""
    if not is_work_time(citizen_social_class, now_venice_dt): return None
    # ... (function logic is identical to the original file)
    # This is for professional fishers, distinct from emergency fishing.
    # ...
    return None # Placeholder for the full logic