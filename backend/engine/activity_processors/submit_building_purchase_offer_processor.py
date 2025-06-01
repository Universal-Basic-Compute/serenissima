import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    _escape_airtable_value,
    VENICE_TIMEZONE,
    get_citizen_record,
    get_building_record,
    LogColors
)

log = logging.getLogger(__name__)

DEFAULT_BID_EXPIRATION_DAYS = 7
BID_REGISTRATION_FEE_PERCENTAGE = 0.005 # 0.5% of bid amount
MINIMUM_BID_REGISTRATION_FEE = 10 # Ducats

def process_submit_building_purchase_offer_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any, # Not used by this processor, but part of signature
    resource_defs: Any      # Not used by this processor, but part of signature
) -> bool:
    """
    Processes the 'submit_building_purchase_offer' activity.
    This involves:
    1. Validating details from the activity.
    2. Checking if the bidder has enough funds for the registration fee.
    3. Deducting the registration fee from the bidder.
    4. Paying the fee to the operator of the office where the bid is submitted.
    5. Creating a 'building_bid' contract record.
    """
    fields = activity_record.get('fields', {})
    activity_guid = fields.get('ActivityId', activity_record.get('id'))
    citizen_username = fields.get('Citizen') # The bidder
    
    # The office where the bid is being submitted. Citizen is currently at this FromBuilding.
    submission_office_building_id = fields.get('FromBuilding') 

    details_str = fields.get('Details')
    if not details_str:
        log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details' JSON.{LogColors.ENDC}")
        return False
    try:
        details = json.loads(details_str)
    except json.JSONDecodeError as e:
        log.error(f"{LogColors.FAIL}Failed to parse 'Details' JSON for activity {activity_guid}: {e}. Details: {details_str}{LogColors.ENDC}")
        return False

    building_id_to_bid_on = details.get('buildingIdToBidOn')
    bid_amount_str = details.get('bidAmount') # Bid amount might be string or number
    
    # targetOfficeBuildingId from details should match submission_office_building_id from activity fields
    # This is mostly for cross-checking or if the processor needs it explicitly from details.
    target_office_id_from_details = details.get('targetOfficeBuildingId')
    if target_office_id_from_details != submission_office_building_id:
        log.warning(f"{LogColors.WARNING}Mismatch between submission office from activity fields ({submission_office_building_id}) "
                    f"and targetOfficeBuildingId from details ({target_office_id_from_details}) for activity {activity_guid}. "
                    f"Using submission_office_building_id: {submission_office_building_id}.{LogColors.ENDC}")

    if not all([citizen_username, building_id_to_bid_on, bid_amount_str, submission_office_building_id]):
        log.error(f"{LogColors.FAIL}Missing critical information for activity {activity_guid}: "
                  f"citizen={citizen_username}, building_id_to_bid_on={building_id_to_bid_on}, "
                  f"bid_amount_str={bid_amount_str}, submission_office_id={submission_office_building_id}.{LogColors.ENDC}")
        return False

    try:
        bid_amount = float(bid_amount_str)
        if bid_amount <= 0:
            raise ValueError("Bid amount must be positive.")
    except ValueError as e:
        log.error(f"{LogColors.FAIL}Invalid bid amount '{bid_amount_str}' for activity {activity_guid}: {e}{LogColors.ENDC}")
        return False

    # --- Fee Calculation and Payment ---
    registration_fee = max(MINIMUM_BID_REGISTRATION_FEE, bid_amount * BID_REGISTRATION_FEE_PERCENTAGE)

    bidder_record = get_citizen_record(tables, citizen_username)
    if not bidder_record:
        log.error(f"{LogColors.FAIL}Bidder citizen {citizen_username} not found for activity {activity_guid}.{LogColors.ENDC}")
        return False
    
    bidder_ducats = float(bidder_record['fields'].get('Ducats', 0))
    if bidder_ducats < registration_fee:
        log.error(f"{LogColors.FAIL}Bidder {citizen_username} has insufficient funds ({bidder_ducats} Ducats) "
                  f"for registration fee of {registration_fee:.2f} Ducats. Activity {activity_guid}.{LogColors.ENDC}")
        return False

    submission_office_operator_username = "ConsiglioDeiDieci" # Default fee recipient
    submission_office_record = get_building_record(tables, submission_office_building_id)
    if submission_office_record:
        op_user = submission_office_record['fields'].get('RunBy')
        if op_user:
            submission_office_operator_username = op_user
    else:
        log.warning(f"{LogColors.WARNING}Submission office building {submission_office_building_id} not found. Fee will default to ConsiglioDeiDieci. Activity {activity_guid}.{LogColors.ENDC}")

    fee_recipient_record = get_citizen_record(tables, submission_office_operator_username)
    if not fee_recipient_record:
        log.warning(f"{LogColors.WARNING}Fee recipient (office operator) {submission_office_operator_username} not found. Fee payment might fail or be misdirected. Activity {activity_guid}.{LogColors.ENDC}")
        # Depending on policy, this could be a failure or fee goes to a default treasury.
        # For now, let's assume ConsiglioDeiDieci always exists or fee is lost if operator not found.
        if submission_office_operator_username != "ConsiglioDeiDieci": # If it was a specific operator that wasn't found
             log.error(f"{LogColors.FAIL}Specific fee recipient {submission_office_operator_username} not found. Cannot process fee. Activity {activity_guid}.{LogColors.ENDC}")
             return False


    # --- Create Contract ---
    # ContractId: building_bid_BUILDINGID_BUYERNAME_TIMESTAMP
    contract_id = f"building_bid_{_escape_airtable_value(building_id_to_bid_on)}_{_escape_airtable_value(citizen_username)}_{int(datetime.now(timezone.utc).timestamp())}"
    now_utc_iso = datetime.now(timezone.utc).isoformat()
    expiration_date_iso = (datetime.now(timezone.utc) + timedelta(days=DEFAULT_BID_EXPIRATION_DAYS)).isoformat()

    target_building_record = get_building_record(tables, building_id_to_bid_on)
    target_building_name = target_building_record['fields'].get('Name', building_id_to_bid_on) if target_building_record else building_id_to_bid_on

    contract_payload = {
        "ContractId": contract_id,
        "Type": "building_bid",
        "Buyer": citizen_username, # The bidder
        "Asset": building_id_to_bid_on,
        "AssetType": "building",
        "PricePerResource": bid_amount, # This is the total bid amount for the building
        "TargetAmount": 1, # Represents the single building asset
        "Status": "active",
        "CreatedAt": now_utc_iso,
        "EndAt": expiration_date_iso, # Bid expires
        "Title": f"Bid for Building: {target_building_name}",
        "Description": f"{citizen_username} offers {bid_amount:.2f} Ducats for building {target_building_name} (ID: {building_id_to_bid_on}). Submitted at {submission_office_record['fields'].get('Name', submission_office_building_id) if submission_office_record else submission_office_building_id}.",
        "Notes": json.dumps({
            "submission_office_id": submission_office_building_id,
            "registration_fee_paid": registration_fee
        })
        # Seller field is typically left empty on a bid contract until it's accepted.
    }

    try:
        # 1. Deduct fee from bidder
        tables["citizens"].update(bidder_record['id'], {'Ducats': bidder_ducats - registration_fee})
        log.info(f"{LogColors.OKBLUE}Deducted {registration_fee:.2f} Ducats from {citizen_username} for bid registration. Activity {activity_guid}.{LogColors.ENDC}")

        # 2. Add fee to submission office operator (if found)
        if fee_recipient_record:
            recipient_ducats = float(fee_recipient_record['fields'].get('Ducats', 0))
            tables["citizens"].update(fee_recipient_record['id'], {'Ducats': recipient_ducats + registration_fee})
            log.info(f"{LogColors.OKBLUE}Paid {registration_fee:.2f} Ducats to {submission_office_operator_username} (office operator). Activity {activity_guid}.{LogColors.ENDC}")
        else:
            # This case should ideally be handled by the check above, but as a fallback:
            log.warning(f"{LogColors.WARNING}Could not find record for fee recipient {submission_office_operator_username}. Registration fee of {registration_fee:.2f} Ducats is effectively lost or held by system. Activity {activity_guid}.{LogColors.ENDC}")


        # 3. Record the transaction for the fee
        transaction_payload = {
            "Type": "building_bid_registration_fee",
            "AssetType": "contract_submission", # Or "building_bid_contract"
            "Asset": contract_id, # Link to the bid contract being created
            "Seller": submission_office_operator_username, # Entity receiving the fee
            "Buyer": citizen_username, # Entity paying the fee
            "Price": registration_fee,
            "Notes": json.dumps({
                "activity_guid": activity_guid,
                "building_id_bid_on": building_id_to_bid_on,
                "bid_amount": bid_amount,
                "submission_office_id": submission_office_building_id
            }),
            "CreatedAt": now_utc_iso,
            "ExecutedAt": now_utc_iso
        }
        tables["transactions"].create(transaction_payload)
        log.info(f"{LogColors.OKBLUE}Recorded transaction for bid registration fee. Activity {activity_guid}.{LogColors.ENDC}")

        # 4. Create the actual bid contract
        tables["contracts"].create(contract_payload)
        log.info(f"{LogColors.OKGREEN}Successfully created 'building_bid' contract {contract_id} by {citizen_username} for building {building_id_to_bid_on}. Activity {activity_guid}.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error during financial transactions or contract creation for activity {activity_guid}: {e}{LogColors.ENDC}")
        # Consider rollback or compensating transactions if partial updates occurred.
        # For now, log error and return False.
        import traceback
        log.error(traceback.format_exc())
        return False
