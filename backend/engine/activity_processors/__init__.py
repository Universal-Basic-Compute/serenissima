# This file makes the 'activity_processors' directory a Python package.
from .deliver_resource_batch_processor import process as process_deliver_resource_batch
from .goto_home_processor import process as process_goto_home
from .goto_work_processor import process as process_goto_work
from .production_processor import process as process_production
from .fetch_resource_processor import process as process_fetch_resource
from .eat_processor import process as process_eat # Generic dispatcher for eat activities
from .fetch_from_galley_processor import process as process_fetch_from_galley
from .leave_venice_processor import process as process_leave_venice
from .deliver_construction_materials_processor import process as process_deliver_construction_materials
from .construct_building_processor import process as process_construct_building
from .goto_construction_site_processor import process as process_goto_construction_site
from .deliver_to_storage_processor import process as process_deliver_to_storage
from .fetch_from_storage_processor import process as process_fetch_from_storage
from .goto_building_for_storage_fetch_processor import process as process_goto_building_for_storage_fetch
from .fetch_for_logistics_client_processor import process as process_fetch_for_logistics_client
from .check_business_status_processor import process as process_check_business_status
from .fishing_processor import process_fishing_activity # New fishing activity processor
# Add other processors here as they are created
