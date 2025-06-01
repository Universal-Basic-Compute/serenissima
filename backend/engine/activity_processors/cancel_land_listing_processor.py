import os
import sys
import logging
import json
from datetime import datetime, timezone

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import (
    LogColors, get_citizen_record, get_contract_record, VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

def process_cancel_land_listing_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'execute_cancel_land_listing' activity.
    - Validates the listing contract.
    - Verifies the citizen performing the action is the seller.
    - Updates the listing contract status to 'cancelled'.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    activity_citizen_username = activity_fields.get('Citizen') # Canceller's username

    log.info(f"{LogColors.PROCESS}Processing 'execute_cancel_land_listing' activity {activity_guid} by canceller {activity_citizen_username}.{LogColors.ENDC}")

    try:
        details_str = activity_fields.get('Details')
        if not details_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details'.{LogColors.ENDC}")
            return False
        
        details = json.loads(details_str)
        listing_contract_custom_id = details.get('listingContractId')
        # land_id_context = details.get('landId') # For context, not strictly needed for cancellation logic
        # canceller_username_from_details = details.get('cancellerUsername') # Should match activity performer

        if not listing_contract_custom_id:
            log.error(f"{LogColors.FAIL}Missing listingContractId in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        # Get canceller citizen record (though username from activity is primary identifier)
        # canceller_citizen_record = get_citizen_record(tables, activity_citizen_username)
        # if not canceller_citizen_record:
        #     log.error(f"{LogColors.FAIL}Canceller citizen '{activity_citizen_username}' not found for activity {activity_guid}.{LogColors.ENDC}")
        #     return False
        canceller_username = activity_citizen_username # Confirmed

        # Get the land_listing contract
        listing_contract_record = get_contract_record(tables, listing_contract_custom_id)
        if not listing_contract_record:
            log.error(f"{LogColors.FAIL}Listing contract {listing_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        listing_contract_fields = listing_contract_record['fields']
        if listing_contract_fields.get('Type') != 'land_listing':
            log.error(f"{LogColors.FAIL}Contract {listing_contract_custom_id} is not a land_listing. Type: {listing_contract_fields.get('Type')}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        if listing_contract_fields.get('Status') != 'active':
            log.warning(f"{LogColors.WARNING}Listing contract {listing_contract_custom_id} is not 'active' (Status: {listing_contract_fields.get('Status')}). Assuming already cancelled or completed. Activity {activity_guid}.{LogColors.ENDC}")
            return True # Treat as success if already not active

        # Verify the canceller is the seller (assuming 'Seller' field stores username string)
        contract_seller_username = listing_contract_fields.get('Seller')
        if not contract_seller_username or canceller_username != contract_seller_username:
            log.error(f"{LogColors.FAIL}Citizen {canceller_username} is not the seller ('{contract_seller_username}') of listing {listing_contract_custom_id}. Cannot cancel. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Update listing contract status
        now_iso = datetime.now(timezone.utc).isoformat()
        tables['contracts'].update(listing_contract_record['id'], {"Status": "cancelled", "UpdatedAt": now_iso, "Notes": f"Cancelled by seller on {now_iso} via activity {activity_guid}."})
        log.info(f"{LogColors.SUCCESS}Listing contract {listing_contract_custom_id} status updated to 'cancelled'. Activity {activity_guid}.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_cancel_land_listing' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
