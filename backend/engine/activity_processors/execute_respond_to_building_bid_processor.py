import logging
import json
from datetime import datetime, timezone

from backend.engine.utils.activity_helpers import (
    LogColors, get_citizen_record, get_contract_record, get_building_record,
    VENICE_TIMEZONE, log_header
)
# Import create_notification from the new notification_helpers module
from backend.engine.utils.notification_helpers import create_notification
from backend.app.citizen_utils import update_compute_balance

log = logging.getLogger(__name__)

def process_execute_respond_to_building_bid_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'execute_respond_to_building_bid' activity.
    - Validates the bid contract and citizen.
    - If accepted: transfers funds, updates building ownership, updates contract status.
    - If refused: updates contract status.
    - Creates notifications.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    owner_username = activity_fields.get('Citizen') # Building owner responding

    log_header(f"Execute Respond to Building Bid: {owner_username}", LogColors.HEADER)
    log.info(f"{LogColors.PROCESS}Processing 'execute_respond_to_building_bid' activity {activity_guid} by owner {owner_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes')
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes'.{LogColors.ENDC}")
            return False
        
        details = json.loads(notes_str)
        building_bid_contract_id = details.get('buildingBidContractId')
        response_action = details.get('response') # "accepted" or "refused"

        if not building_bid_contract_id or not response_action:
            log.error(f"{LogColors.FAIL}Missing buildingBidContractId or response in activity {activity_guid} notes: {details}{LogColors.ENDC}")
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
        
        if bid_contract_fields.get('Status') != 'active':
            log.warning(f"{LogColors.WARNING}Building bid contract {building_bid_contract_id} is not 'active' (Status: {bid_contract_fields.get('Status')}). Assuming already processed. Activity {activity_guid}.{LogColors.ENDC}")
            return True 

        contract_seller_username = bid_contract_fields.get('Seller')
        if contract_seller_username != owner_username:
            log.error(f"{LogColors.FAIL}Citizen {owner_username} is not the seller ({contract_seller_username}) of building bid {building_bid_contract_id}. Cannot process response.{LogColors.ENDC}")
            return False

        bidder_username = bid_contract_fields.get('Buyer')
        building_id_custom = bid_contract_fields.get('Asset') # Custom BuildingId
        bid_price = float(bid_contract_fields.get('PricePerResource', 0))

        if not bidder_username or not building_id_custom or bid_price <= 0:
            log.error(f"{LogColors.FAIL}Invalid building bid contract {building_bid_contract_id}: missing bidder, building ID, or valid price.{LogColors.ENDC}")
            return False

        now_iso = datetime.now(timezone.utc).isoformat()
        building_record_to_update = get_building_record(tables, building_id_custom)
        if not building_record_to_update:
            log.error(f"{LogColors.FAIL}Building {building_id_custom} (from contract {building_bid_contract_id}) not found.{LogColors.ENDC}")
            return False

        if response_action == "accepted":
            log.info(f"{LogColors.PROCESS}Bid {building_bid_contract_id} accepted by {owner_username}. Processing sale of {building_id_custom} to {bidder_username} for {bid_price} Ducats.{LogColors.ENDC}")

            # 1. Check bidder's funds and owner's building
            bidder_citizen_record = get_citizen_record(tables, bidder_username)
            owner_citizen_record = get_citizen_record(tables, owner_username)

            if not bidder_citizen_record or not owner_citizen_record:
                log.error(f"{LogColors.FAIL}Bidder or Owner citizen record not found for contract {building_bid_contract_id}.{LogColors.ENDC}")
                return False

            bidder_ducats = float(bidder_citizen_record['fields'].get('Ducats', 0))
            if bidder_ducats < bid_price:
                log.error(f"{LogColors.FAIL}Bidder {bidder_username} has insufficient funds ({bidder_ducats}) for bid {bid_price} on contract {building_bid_contract_id}.{LogColors.ENDC}")
                # Update contract to failed or let it expire? For now, fail the activity.
                tables['contracts'].update(bid_contract_record['id'], {"Status": "failed_insufficient_funds", "UpdatedAt": now_iso})
                notification_details_failure = {"contractId": building_bid_contract_id, "buildingId": building_id_custom}
                create_notification(tables, bidder_username, "building_bid_failed_funds", f"Your bid for {building_id_custom} failed due to insufficient funds.", details=notification_details_failure)
                create_notification(tables, owner_username, "building_bid_failed_buyer_funds", f"The bid from {bidder_username} for your building {building_id_custom} failed; they had insufficient funds.", details=notification_details_failure)
                return False # Activity fails, contract status updated

            # 2. Transfer Ducats
            update_compute_balance(tables, bidder_citizen_record['id'], -bid_price, "building_purchase_payment", building_bid_contract_id)
            update_compute_balance(tables, owner_citizen_record['id'], bid_price, "building_sale_proceeds", building_bid_contract_id)
            log.info(f"{LogColors.SUCCESS}Transferred {bid_price} Ducats from {bidder_username} to {owner_username} for building {building_id_custom}.{LogColors.ENDC}")

            # 3. Update Building Ownership
            tables['buildings'].update(building_record_to_update['id'], {"Owner": bidder_username, "UpdatedAt": now_iso})
            log.info(f"{LogColors.SUCCESS}Building {building_id_custom} ownership transferred to {bidder_username}.{LogColors.ENDC}")

            # 4. Update Contract Status
            tables['contracts'].update(bid_contract_record['id'], {"Status": "executed", "ExecutedAt": now_iso, "UpdatedAt": now_iso})
            log.info(f"{LogColors.SUCCESS}Building bid contract {building_bid_contract_id} status updated to 'executed'.{LogColors.ENDC}")

            # 5. Notifications
            notification_details_success = {"contractId": building_bid_contract_id, "buildingId": building_id_custom}
            create_notification(tables, bidder_username, "building_purchase_successful", f"Your bid for {building_id_custom} was accepted! You are now the owner.", details=notification_details_success)
            create_notification(tables, owner_username, "building_sale_successful", f"You accepted the bid from {bidder_username} for your building {building_id_custom}. The sale is complete.", details=notification_details_success)

        elif response_action == "refused":
            log.info(f"{LogColors.PROCESS}Bid {building_bid_contract_id} refused by {owner_username}.{LogColors.ENDC}")
            tables['contracts'].update(bid_contract_record['id'], {"Status": "refused_by_seller", "UpdatedAt": now_iso})
            log.info(f"{LogColors.SUCCESS}Building bid contract {building_bid_contract_id} status updated to 'refused_by_seller'.{LogColors.ENDC}")
            
            notification_details_refusal = {"contractId": building_bid_contract_id, "buildingId": building_id_custom}
            create_notification(tables, bidder_username, "building_bid_refused", f"Your bid for {building_id_custom} was refused by the owner.", details=notification_details_refusal)
            create_notification(tables, owner_username, "building_bid_response_sent", f"You refused the bid from {bidder_username} for your building {building_id_custom}.", details=notification_details_refusal)
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_respond_to_building_bid' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
