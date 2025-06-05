import logging
import json
from datetime import datetime, timezone

# Import get_citizen_record and get_contract_record from activity_helpers
from backend.engine.utils.activity_helpers import (
    LogColors, get_citizen_record, get_contract_record
)
# Import create_notification from the new notification_helpers module
from backend.engine.utils.notification_helpers import create_notification

log = logging.getLogger(__name__)

def process_execute_withdraw_building_bid_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'execute_withdraw_building_bid' activity.
    - Validates the bid contract.
    - Verifies the citizen performing the action is the buyer/bidder.
    - Updates the bid contract status to 'withdrawn_by_buyer'.
    - Creates notifications.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    bidder_username = activity_fields.get('Citizen') # Bidder withdrawing the bid

    log.info(f"{LogColors.PROCESS}Processing 'execute_withdraw_building_bid' activity {activity_guid} by bidder {bidder_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes')
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes'.{LogColors.ENDC}")
            return False
        
        details = json.loads(notes_str)
        building_bid_contract_id = details.get('buildingBidContractId')

        if not building_bid_contract_id:
            log.error(f"{LogColors.FAIL}Missing buildingBidContractId in activity {activity_guid} notes: {details}{LogColors.ENDC}")
            return False

        # Get the building bid contract
        bid_contract_record = get_contract_record(tables, building_bid_contract_id)
        if not bid_contract_record:
            log.error(f"{LogColors.FAIL}Building bid contract {building_bid_contract_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        bid_contract_fields = bid_contract_record['fields']
        if bid_contract_fields.get('Type') != 'building_bid':
            log.error(f"{LogColors.FAIL}Contract {building_bid_contract_id} is not a building_bid. Type: {bid_contract_fields.get('Type')}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        if bid_contract_fields.get('Status') != 'active': # Or other statuses from which withdrawal is allowed
            log.warning(f"{LogColors.WARNING}Building bid contract {building_bid_contract_id} is not 'active' (Status: {bid_contract_fields.get('Status')}). Assuming already processed or cannot be withdrawn. Activity {activity_guid}.{LogColors.ENDC}")
            return True 

        contract_buyer_username = bid_contract_fields.get('Buyer')
        if contract_buyer_username != bidder_username:
            log.error(f"{LogColors.FAIL}Citizen {bidder_username} is not the buyer/bidder ({contract_buyer_username}) of building bid {building_bid_contract_id}. Cannot process withdrawal.{LogColors.ENDC}")
            return False

        contract_seller_username = bid_contract_fields.get('Seller')
        building_id_custom = bid_contract_fields.get('Asset')

        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Update Contract Status
        tables['contracts'].update(bid_contract_record['id'], {"Status": "withdrawn_by_buyer", "UpdatedAt": now_iso})
        log.info(f"{LogColors.SUCCESS}Building bid contract {building_bid_contract_id} status updated to 'withdrawn_by_buyer'.{LogColors.ENDC}")

        # Notifications
        notification_details = {"contractId": building_bid_contract_id, "buildingId": building_id_custom}
        
        if contract_seller_username: # Notify seller if there is one
            create_notification(
                tables, 
                contract_seller_username, 
                "building_bid_withdrawn", 
                f"The bid from {bidder_username} for your building {building_id_custom} has been withdrawn.", 
                details=notification_details
            )
        
        create_notification(
            tables, 
            bidder_username, 
            "building_bid_withdrawal_confirmed", 
            f"Your bid for building {building_id_custom} has been successfully withdrawn.", 
            details=notification_details
        )
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_withdraw_building_bid' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
