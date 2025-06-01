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
    citizen_airtable_id = activity_fields.get('Citizen')[0]

    log.info(f"{LogColors.PROCESS}Processing 'finalize_make_offer_for_land' activity {activity_guid} for citizen Airtable ID {citizen_airtable_id}.{LogColors.ENDC}")

    try:
        details_str = activity_fields.get('Details')
        if not details_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details'.{LogColors.ENDC}")
            return False
        
        details = json.loads(details_str)
        land_id_for_offer = details.get('landId')
        offer_price = details.get('offerPrice')
        buyer_username = details.get('buyerUsername') # Citizen making the offer
        target_seller_username = details.get('targetSellerUsername') # Optional: current owner

        if not land_id_for_offer or offer_price is None or not buyer_username:
            log.error(f"{LogColors.FAIL}Missing landId, offerPrice, or buyerUsername in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        buyer_citizen_record = tables['citizens'].get(citizen_airtable_id)
        if not buyer_citizen_record or buyer_citizen_record['fields'].get('Username') != buyer_username:
            log.error(f"{LogColors.FAIL}Citizen mismatch for activity {activity_guid}. Activity by {buyer_citizen_record['fields'].get('Username') if buyer_citizen_record else 'Unknown'}, details specify buyer {buyer_username}.{LogColors.ENDC}")
            return False

        land_record = get_land_record(tables, land_id_for_offer)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_for_offer} not found for offer by {buyer_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        land_name = land_record['fields'].get('HistoricalName', land_id_for_offer)

        # Check if buyer already has an active offer for this land
        existing_offer_formula = f"AND({{Asset}}='{land_id_for_offer}', {{AssetType}}='land', {{Type}}='land_offer', {{BuyerUsername}}='{buyer_username}', {{Status}}='active')"
        existing_offers = tables['contracts'].all(formula=existing_offer_formula)
        if existing_offers:
            log.warning(f"{LogColors.WARNING}Citizen {buyer_username} already has an active offer for land {land_id_for_offer}. Activity {activity_guid}. Skipping new offer.{LogColors.ENDC}")
            return True # Treat as success

        # Determine Seller (linked record ID) if target_seller_username is provided
        seller_airtable_id_list = None
        if target_seller_username:
            seller_citizen_record = get_citizen_record(tables, target_seller_username)
            if seller_citizen_record:
                seller_airtable_id_list = [seller_citizen_record['id']]
            else:
                log.warning(f"{LogColors.WARNING}Target seller {target_seller_username} not found. Offer will be speculative or for unowned land if applicable. Activity {activity_guid}.{LogColors.ENDC}")
        
        # Check buyer's funds (optional, for logging or soft validation)
        buyer_ducats = float(buyer_citizen_record['fields'].get('Ducats', 0))
        if buyer_ducats < float(offer_price):
            log.warning(f"{LogColors.WARNING}Buyer {buyer_username} has insufficient funds ({buyer_ducats}) for offer price ({offer_price}). Offer will be created but may not be fulfillable. Activity {activity_guid}.{LogColors.ENDC}")

        contract_id = f"land_offer_{land_id_for_offer}_{buyer_username}_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        contract_payload = {
            "ContractId": contract_id,
            "Type": "land_offer",
            "Buyer": [citizen_airtable_id], # Link to buyer's citizen record ID
            "Asset": land_id_for_offer,
            "AssetType": "land",
            "PricePerResource": float(offer_price),
            "TargetAmount": 1,
            "Status": "active",
            "Title": f"Offer for Land: {land_name} by {buyer_username}",
            "Description": f"{buyer_username} offers to buy land {land_name} (ID: {land_id_for_offer}) for {offer_price} ducats.",
            "CreatedAt": now_iso,
            "UpdatedAt": now_iso,
            # Optional: EndAt for offer expiration
        }
        if seller_airtable_id_list:
            contract_payload["Seller"] = seller_airtable_id_list
        
        # Add BuyerUsername for easier querying if your schema supports it
        # contract_payload["BuyerUsername"] = buyer_username 

        new_contract = tables['contracts'].create(contract_payload)
        log.info(f"{LogColors.SUCCESS}Successfully created land offer contract {new_contract['id']} (Custom ID: {contract_id}) for land {land_id_for_offer} by {buyer_username} at {offer_price} ducats. Activity {activity_guid}.{LogColors.ENDC}")
        
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_make_offer_for_land' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
