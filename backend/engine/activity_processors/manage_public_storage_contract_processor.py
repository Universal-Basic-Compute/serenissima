import logging
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import (
    _escape_airtable_value,
    VENICE_TIMEZONE,
    _escape_airtable_value,
    VENICE_TIMEZONE,
    get_building_record,
    get_citizen_record,
    update_citizen_ducats, # For fees
    # create_notification_record # Removed from here
)
from backend.engine.utils.notification_helpers import create_notification # Added import

log = logging.getLogger(__name__)

CONTRACT_REGISTRATION_FEE = 10 # Ducats, example fee

def process_register_public_storage_offer_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used, but part of standard signature
    resource_defs: Dict[str, Any]      # For resource names if needed in notifications
) -> bool:
    """
    Processes the 'register_public_storage_offer' activity.
    Creates or updates a 'public_storage' contract in Airtable.
    Deducts registration fees from the citizen.
    """
    fields = activity_record.get('fields', {})
    citizen_username = fields.get('Citizen')
    # The office where registration happens is fields.get('FromBuilding')
    office_building_id = fields.get('FromBuilding') 
    
    notes_str = fields.get('Notes')
    try:
        details = json.loads(notes_str) if notes_str else {}
    except json.JSONDecodeError as e:
        log.error(f"Error parsing Notes for register_public_storage_offer for {citizen_username}: {e}. Notes: {notes_str}")
        return False

    # Extract contract details from the activity's 'Notes' (which came from 'nextActivityDetails')
    contract_id_to_manage = details.get('contractId_to_manage') # Custom ContractId
    seller_building_id = details.get('sellerBuildingId')
    resource_type = details.get('resourceType')
    capacity_offered = details.get('capacityOffered')
    price_per_unit_per_day = details.get('pricePerUnitPerDay')
    # pricing_strategy = details.get('pricingStrategy') # For logging/notes if needed
    title = details.get('title')
    description = details.get('description')
    contract_notes_payload = details.get('contractNotes') # Dict of notes for the contract itself

    if not all([citizen_username, office_building_id, seller_building_id, resource_type, title, description,
                contract_id_to_manage, capacity_offered is not None, price_per_unit_per_day is not None]):
        log.error(f"Missing critical details in Notes for register_public_storage_offer for {citizen_username}. Details: {details}")
        return False

    # --- Fee Payment ---
    citizen_airtable_record = get_citizen_record(tables, citizen_username)
    if not citizen_airtable_record:
        log.error(f"Citizen {citizen_username} not found. Cannot process contract registration.")
        return False
    
    if not update_citizen_ducats(
        tables, 
        citizen_airtable_record['id'], 
        -CONTRACT_REGISTRATION_FEE,
        reason=f"Fee for registering public storage offer {contract_id_to_manage}",
        related_asset_type="contract",
        related_asset_id=contract_id_to_manage
    ):
        log.error(f"Citizen {citizen_username} failed to pay registration fee of {CONTRACT_REGISTRATION_FEE} Ducats for contract {contract_id_to_manage}.")
        # Create a problem or notification for the citizen about insufficient funds.
        create_notification( # Changed to create_notification
            tables, citizen_username, "insufficient_funds_for_fee",
            f"You could not pay the {CONTRACT_REGISTRATION_FEE} Ducat fee to register storage offer {contract_id_to_manage}.",
            asset_type="contract", asset_id=contract_id_to_manage,
            details_json=json.dumps({"fee_amount": CONTRACT_REGISTRATION_FEE, "contract_id": contract_id_to_manage})
        )
        return False # Stop processing if fee cannot be paid

    # --- Create or Update Contract ---
    now_utc = datetime.now(timezone.utc)
    # Duration is fixed by the calling script (automated_adjustpublicstoragecontracts.py)
    # For now, let's assume a default duration if not passed, e.g., 1 week (from that script)
    contract_duration_weeks = details.get("contractDurationWeeks", 1) # Default if not in details
    end_at_utc = now_utc + timedelta(weeks=contract_duration_weeks)

    contract_payload = {
        "ContractId": contract_id_to_manage,
        "Type": "public_storage",
        "Seller": citizen_username, # The citizen offering the storage
        "SellerBuilding": seller_building_id, # The storage building ID
        "ResourceType": resource_type,
        "PricePerResource": price_per_unit_per_day, # Interpreted as price per unit capacity per day
        "TargetAmount": capacity_offered, # Capacity offered in units
        "Status": "active",
        "Priority": 5, # Default priority
        "Title": title,
        "Description": description,
        "Notes": json.dumps(contract_notes_payload) if contract_notes_payload else None,
        "UpdatedAt": now_utc.isoformat()
        # Buyer, BuyerBuilding, Transporter are null for this offer type
    }

    try:
        # Check if contract already exists by ContractId
        existing_contracts = tables['contracts'].all(formula=f"{{ContractId}}='{_escape_airtable_value(contract_id_to_manage)}'")
        
        if existing_contracts:
            # Update existing contract
            contract_airtable_id = existing_contracts[0]['id']
            # Remove fields that should only be set on creation or are managed by Airtable
            payload_for_update = contract_payload.copy()
            # ContractId is the primary field for lookup, not for update payload directly via this method
            # CreatedAt should not be changed on update
            if "CreatedAt" in payload_for_update: del payload_for_update["CreatedAt"] 
            # EndAt might be extended or changed, so we keep it if present, or set it if new.
            # For updates, we might want specific logic if EndAt should be changed.
            # Here, we assume the EndAt from the original creation (if any) or a new one if this is effectively a re-listing.
            # The current payload_for_update will set UpdatedAt. If EndAt needs to be updated, it should be in contract_payload.
            # Let's ensure EndAt is also updated if the contract is being "refreshed".
            payload_for_update["EndAt"] = end_at_utc.isoformat()


            tables['contracts'].update(contract_airtable_id, payload_for_update)
            log.info(f"Updated existing public_storage contract {contract_id_to_manage} (Airtable ID: {contract_airtable_id}) by {citizen_username}.")
        else:
            # Create new contract
            contract_payload["CreatedAt"] = now_utc.isoformat()
            contract_payload["EndAt"] = end_at_utc.isoformat() # Set EndAt only for new contracts
            
            created_contract = tables['contracts'].create(contract_payload)
            log.info(f"Created new public_storage contract {contract_id_to_manage} (Airtable ID: {created_contract['id']}) by {citizen_username}.")
        
        return True
    except Exception as e:
        log.error(f"Error creating/updating public_storage contract {contract_id_to_manage} for {citizen_username}: {e}")
        import traceback
        log.error(traceback.format_exc())
        # Attempt to refund the fee if contract operation failed
        update_citizen_ducats(
            tables, 
            citizen_airtable_record['id'], 
            CONTRACT_REGISTRATION_FEE, # Refund
            reason=f"Refund for failed registration of storage offer {contract_id_to_manage}",
            related_asset_type="contract",
            related_asset_id=contract_id_to_manage
        )
        return False
