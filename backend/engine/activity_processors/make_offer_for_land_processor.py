import os
import sys
import logging
import json
from datetime import datetime, timezone
import uuid

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import (
    LogColors,
    get_citizen_record,
    get_land_record,
    VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

def process_make_offer_for_land_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'finalize_make_offer_for_land' activity.
    Creates a new 'land_offer' contract.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    activity_citizen_username = activity_fields.get('Citizen') # Username string

    log.info(f"{LogColors.PROCESS}Processing 'finalize_make_offer_for_land' activity {activity_guid} for citizen {activity_citizen_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes') # Changed from 'Details' to 'Notes'
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes' (expected JSON details here).{LogColors.ENDC}")
            return False
        
        details = json.loads(notes_str) # Parse from notes_str
        land_id_for_offer = details.get('landId')
        offer_price = details.get('offerPrice')
        buyer_username = details.get('buyerUsername') # Citizen making the offer
        target_seller_username = details.get('targetSellerUsername') # Optional: current owner

        if not land_id_for_offer or offer_price is None or not buyer_username:
            log.error(f"{LogColors.FAIL}Missing landId, offerPrice, or buyerUsername in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        if activity_citizen_username != buyer_username:
            log.error(f"{LogColors.FAIL}Citizen mismatch for activity {activity_guid}. Activity by {activity_citizen_username}, details specify buyer {buyer_username}.{LogColors.ENDC}")
            return False
        
        buyer_citizen_record = get_citizen_record(tables, buyer_username) # Fetch by username

        land_record = get_land_record(tables, land_id_for_offer)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_for_offer} not found for offer by {buyer_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        land_name = land_record['fields'].get('HistoricalName', land_id_for_offer)

        # Check if buyer already has an active offer for this land
        # Assuming 'Buyer' field in CONTRACTS stores the username directly
        existing_offer_formula = f"AND({{Asset}}='{land_id_for_offer}', {{AssetType}}='land', {{Type}}='land_offer', {{Buyer}}='{buyer_username}', {{Status}}='active')"
        existing_offers = tables['contracts'].all(formula=existing_offer_formula)
        if existing_offers:
            log.warning(f"{LogColors.WARNING}Citizen {buyer_username} already has an active offer for land {land_id_for_offer}. Activity {activity_guid}. Skipping new offer.{LogColors.ENDC}")
            return True # Treat as success

        # No need to fetch seller_airtable_id_list if 'Seller' field stores username directly
        
        # Check buyer's funds (optional, for logging or soft validation)
        buyer_ducats = float(buyer_citizen_record['fields'].get('Ducats', 0)) if buyer_citizen_record else 0
        if buyer_ducats < float(offer_price):
            log.warning(f"{LogColors.WARNING}Buyer {buyer_username} has insufficient funds ({buyer_ducats}) for offer price ({offer_price}). Offer will be created but may not be fulfillable. Activity {activity_guid}.{LogColors.ENDC}")

        contract_id = f"land_offer_{land_id_for_offer}_{buyer_username}_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        contract_payload = {
            "ContractId": contract_id,
            "Type": "land_offer",
            "Buyer": buyer_username, 
            "Asset": land_id_for_offer,
            "AssetType": "land",
            "PricePerResource": float(offer_price),
            "TargetAmount": 1,
            "Status": "active",
            "Title": f"Offer for Land: {land_name} by {buyer_username}",
            "Description": f"{buyer_username} offers to buy land {land_name} (ID: {land_id_for_offer}) for {offer_price} ducats.",
            "CreatedAt": now_iso,
            # "UpdatedAt": now_iso, # Removed UpdatedAt
            # Buyer field stores the username directly
            # Optional: EndAt for offer expiration
        }
        if target_seller_username: # If a specific seller is targeted
            # Assuming 'Seller' field also stores username directly
            contract_payload["Seller"] = target_seller_username
        # If no target_seller_username, the Seller field might be left null or handled as per game logic for speculative offers

        # Ensure UpdatedAt is not in the payload if it was somehow added
        if "UpdatedAt" in contract_payload:
            del contract_payload["UpdatedAt"]

        new_contract = tables['contracts'].create(contract_payload)
        log.info(f"{LogColors.SUCCESS}Successfully created land offer contract {new_contract['id']} (Custom ID: {contract_id}) for land {land_id_for_offer} by {buyer_username} at {offer_price} ducats. Activity {activity_guid}.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_make_offer_for_land' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
