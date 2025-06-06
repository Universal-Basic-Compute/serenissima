# This file makes the 'utils' directory a Python package.
# It can also be used to expose commonly used utilities at the package level.

from .activity_helpers import (
    LogColors, 
    _escape_airtable_value, 
    _has_recent_failed_activity_for_contract,
    _get_building_position_coords,
    _calculate_distance_meters,
    calculate_haversine_distance_meters,
    is_nighttime,
    is_rest_time_for_class,
    is_work_time,
    is_leisure_time_for_class,
    SOCIAL_CLASS_SCHEDULES,
    BUILDING_TYPE_WORK_SCHEDULES,
    is_docks_open_time,
    get_path_between_points,
    get_citizen_current_load,
    get_citizen_effective_carry_capacity,
    CITIZEN_CARRY_CAPACITY,
    DEFAULT_CITIZEN_CARRY_CAPACITY,
    get_closest_food_provider,
    get_closest_building_of_type,
    get_citizen_workplace,
    get_citizen_home,
    get_citizen_businesses_run,
    get_building_type_info,
    get_building_resources,
    get_building_storage_details,
    get_citizen_inventory_details,
    can_produce_output,
    find_path_between_buildings,
    find_path_between_buildings_or_coords,
    get_citizen_contracts,
    get_idle_citizens,
    _fetch_and_assign_random_starting_position,
    get_building_record,
    get_citizen_record,
    get_contract_record,
    get_land_record,
    get_relationship_trust_score,
    get_closest_building_to_position,
    extract_details_from_notes,
    update_resource_count,
    create_activity_record,
    update_citizen_ducats,
    log_header,
    VENICE_TIMEZONE,
    get_venice_time_now,
    get_building_types_from_api,
    get_resource_types_from_api,
    dateutil_parser
)

from .relationship_helpers import (
    update_trust_score_for_activity
    # Les constantes TRUST_SCORE_* ne sont plus réexportées ici pour éviter les cycles d'import.
    # Les modules qui en ont besoin devront les importer directement depuis .relationship_helpers.
)

from .conversation_helper import (
    generate_conversation_turn
)

# You can choose to expose specific functions or classes at the package level
# For example:
# from .some_module import some_function
# __all__ = ['some_function', 'LogColors', 'generate_conversation_turn', ...] # If you want to control `from .utils import *`
