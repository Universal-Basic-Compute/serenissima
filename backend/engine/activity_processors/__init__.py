# This file makes the 'activity_processors' directory a Python package.
# IMPORTANT: Activity processors should ONLY process the current activity and NOT create follow-up activities.
# Follow-up activities should be created by activity creators in the activity_creators directory.
# Processors should focus on:
# 1. Executing the effects of the current activity (e.g., transferring resources, updating citizen state)
# 2. Returning success/failure status
# 3. NOT creating new activities (this is the responsibility of activity creators)
#
# In the new architecture:
# - Activity creators are responsible for creating chains of activities
# - Each activity in the chain is processed independently by its processor
# - Processors should not create new activities, even in response to failures
# - If an activity in a chain fails, the processor should mark it as failed
#   and the processActivities.py script will handle marking dependent activities as failed

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
from .inspect_building_for_purchase_processor import process_inspect_building_for_purchase_fn
from .submit_building_purchase_offer_processor import process_submit_building_purchase_offer_fn
from .send_message_processor import process_send_message_fn
from .goto_location_processor import process as process_goto_location
from .manage_guild_membership_processor import process_manage_guild_membership_fn as process_manage_guild_membership
from .execute_respond_to_building_bid_processor import process_execute_respond_to_building_bid_fn 
from .execute_withdraw_building_bid_processor import process_execute_withdraw_building_bid_fn 
from .finalize_manage_markup_buy_contract_processor import process_finalize_manage_markup_buy_contract_fn 
from .finalize_manage_storage_query_contract_processor import process_finalize_manage_storage_query_contract_fn
from .finalize_update_citizen_profile_processor import process_finalize_update_citizen_profile_fn # New
from .manage_public_dock_processor import process as process_manage_public_dock # Corrected import
# Add other processors here as they are created
