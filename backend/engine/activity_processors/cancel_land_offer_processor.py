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
    canceller_airtable_id = activity_fields.get('Citizen')[0] # Citizen performing the activity

    log.info(f"{LogColors.PROCESS}Processing 'execute_cancel_land_offer' activity {activity_guid} by canceller Airtable ID {canceller_airtable_id}.{LogColors.ENDC}")

    try:
        details_str = activity_fields.get('Details')
        if not details_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details'.{LogColors.ENDC}")
            return False
        
        details = json.loads(details_str)
        offer_contract_custom_id = details.get('offerContractId')
        # land_id_context = details.get('landId') # For context
        # canceller_username_from_details = details.get('cancellerUsername') # Should match activity performer

        if not offer_contract_custom_id:
            log.error(f"{LogColors.FAIL}Missing offerContractId in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        # Get canceller citizen record
        canceller_citizen_record = tables['citizens'].get(canceller_airtable_id)
        if not canceller_citizen_record:
            log.error(f"{LogColors.FAIL}Canceller citizen (Airtable ID: {canceller_airtable_id}) not found for activity {activity_guid}.{LogColors.ENDC}")
            return False
        # canceller_username = canceller_citizen_record['fields'].get('Username')

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

        # Verify the canceller is the buyer/offerer
        buyer_airtable_id_list = offer_contract_fields.get('Buyer')
        if not buyer_airtable_id_list or canceller_airtable_id not in buyer_airtable_id_list:
            log.error(f"{LogColors.FAIL}Citizen (Airtable ID: {canceller_airtable_id}) is not the buyer/offerer of offer {offer_contract_custom_id}. Buyer IDs: {buyer_airtable_id_list}. Cannot cancel. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Update offer contract status
        now_iso = datetime.now(timezone.utc).isoformat()
        tables['contracts'].update(offer_contract_record['id'], {"Status": "cancelled", "UpdatedAt": now_iso, "Notes": f"Cancelled by offerer on {now_iso} via activity {activity_guid}."})
        log.info(f"{LogColors.SUCCESS}Offer contract {offer_contract_custom_id} status updated to 'cancelled'. Activity {activity_guid}.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_cancel_land_offer' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
