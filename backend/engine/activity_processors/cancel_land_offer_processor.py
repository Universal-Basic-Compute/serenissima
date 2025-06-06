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

def process_cancel_land_offer_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'execute_cancel_land_offer' activity.
    - Validates the offer contract.
    - Verifies the citizen performing the action is the buyer/offerer.
    - Updates the offer contract status to 'cancelled'.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    activity_citizen_username = activity_fields.get('Citizen') # Canceller's username

    log.info(f"{LogColors.PROCESS}Processing 'execute_cancel_land_offer' activity {activity_guid} by canceller {activity_citizen_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes') # Changed Details to Notes
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes'.{LogColors.ENDC}") # Changed Details to Notes
            return False
        
        details = json.loads(notes_str) # Changed details_str to notes_str
        offer_contract_custom_id = details.get('offerContractId')
        # land_id_context = details.get('landId') # For context
        # canceller_username_from_details = details.get('cancellerUsername') # Should match activity performer

        if not offer_contract_custom_id:
            log.error(f"{LogColors.FAIL}Missing offerContractId in activity {activity_guid} notes: {details}{LogColors.ENDC}") # Changed details to notes
            return False

        # Get canceller citizen record (though username from activity is primary identifier)
        # canceller_citizen_record = get_citizen_record(tables, activity_citizen_username)
        # if not canceller_citizen_record:
        #     log.error(f"{LogColors.FAIL}Canceller citizen '{activity_citizen_username}' not found for activity {activity_guid}.{LogColors.ENDC}")
        #     return False
        canceller_username = activity_citizen_username # Confirmed

        # Get the land_offer contract
        offer_contract_record = get_contract_record(tables, offer_contract_custom_id)
        if not offer_contract_record:
            log.error(f"{LogColors.FAIL}Offer contract {offer_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        offer_contract_fields = offer_contract_record['fields']
        if offer_contract_fields.get('Type') != 'land_offer':
            log.error(f"{LogColors.FAIL}Contract {offer_contract_custom_id} is not a land_offer. Type: {offer_contract_fields.get('Type')}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        if offer_contract_fields.get('Status') != 'active':
            log.warning(f"{LogColors.WARNING}Offer contract {offer_contract_custom_id} is not 'active' (Status: {offer_contract_fields.get('Status')}). Assuming already cancelled or completed. Activity {activity_guid}.{LogColors.ENDC}")
            return True # Treat as success if already not active

        # Verify the canceller is the buyer/offerer (assuming 'Buyer' field stores username string)
        contract_buyer_username = offer_contract_fields.get('Buyer')
        if not contract_buyer_username or canceller_username != contract_buyer_username:
            log.error(f"{LogColors.FAIL}Citizen {canceller_username} is not the buyer/offerer ('{contract_buyer_username}') of offer {offer_contract_custom_id}. Cannot cancel. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Update offer contract status
        now_iso = datetime.now(timezone.utc).isoformat()
        update_payload = {
            "Status": "cancelled", 
            "Notes": f"Cancelled by offerer on {now_iso} via activity {activity_guid}."
            # UpdatedAt is handled by Airtable, so it's removed from the payload
        }
        tables['contracts'].update(offer_contract_record['id'], update_payload)
        log.info(f"{LogColors.SUCCESS}Offer contract {offer_contract_custom_id} status updated to 'cancelled'. Activity {activity_guid}.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_cancel_land_offer' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
