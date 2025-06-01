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
    LogColors, get_citizen_record, get_land_record, get_contract_record, VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

def process_buy_listed_land_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'execute_buy_listed_land' activity.
    - Validates the listing contract.
    - Verifies buyer funds.
    - Transfers land ownership.
    - Transfers ducats.
    - Updates contract status.
    - Creates a transaction record.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    buyer_airtable_id = activity_fields.get('Citizen')[0] # Citizen performing the activity (buyer)

    log.info(f"{LogColors.PROCESS}Processing 'execute_buy_listed_land' activity {activity_guid} by buyer Airtable ID {buyer_airtable_id}.{LogColors.ENDC}")

    try:
        details_str = activity_fields.get('Details')
        if not details_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details'.{LogColors.ENDC}")
            return False
        
        details = json.loads(details_str)
        listing_contract_custom_id = details.get('listingContractId')
        land_id_being_bought = details.get('landId')
        purchase_price = float(details.get('price'))
        # buyer_username_from_details = details.get('buyerUsername') # Should match activity performer

        if not listing_contract_custom_id or not land_id_being_bought or purchase_price is None:
            log.error(f"{LogColors.FAIL}Missing listingContractId, landId, or price in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        # Get buyer citizen record
        buyer_citizen_record = tables['citizens'].get(buyer_airtable_id)
        if not buyer_citizen_record:
            log.error(f"{LogColors.FAIL}Buyer citizen (Airtable ID: {buyer_airtable_id}) not found for activity {activity_guid}.{LogColors.ENDC}")
            return False
        buyer_username = buyer_citizen_record['fields'].get('Username')

        # Get the land_listing contract
        listing_contract_record = get_contract_record(tables, listing_contract_custom_id)
        if not listing_contract_record:
            log.error(f"{LogColors.FAIL}Listing contract {listing_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        listing_contract_fields = listing_contract_record['fields']
        if listing_contract_fields.get('Type') != 'land_listing' or listing_contract_fields.get('Status') != 'active':
            log.error(f"{LogColors.FAIL}Contract {listing_contract_custom_id} is not an active land_listing. Status: {listing_contract_fields.get('Status')}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        if listing_contract_fields.get('Asset') != land_id_being_bought:
            log.error(f"{LogColors.FAIL}Listing contract {listing_contract_custom_id} is for asset {listing_contract_fields.get('Asset')}, not {land_id_being_bought}. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        contract_price = float(listing_contract_fields.get('PricePerResource', -1))
        if contract_price != purchase_price:
            log.error(f"{LogColors.FAIL}Price mismatch for listing {listing_contract_custom_id}. Activity price: {purchase_price}, Contract price: {contract_price}. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Get seller details from contract
        seller_airtable_id_list = listing_contract_fields.get('Seller')
        if not seller_airtable_id_list or not isinstance(seller_airtable_id_list, list) or len(seller_airtable_id_list) == 0:
            log.error(f"{LogColors.FAIL}Listing contract {listing_contract_custom_id} has no Seller. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        seller_airtable_id = seller_airtable_id_list[0]
        seller_citizen_record = tables['citizens'].get(seller_airtable_id)
        if not seller_citizen_record:
            log.error(f"{LogColors.FAIL}Seller citizen (Airtable ID: {seller_airtable_id}) from listing contract {listing_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        seller_username = seller_citizen_record['fields'].get('Username')
        
        # Verify land exists (owner check is implicit as seller listed it)
        land_record = get_land_record(tables, land_id_being_bought)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_being_bought} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        # Financial transaction
        seller_ducats = float(seller_citizen_record['fields'].get('Ducats', 0))
        buyer_ducats = float(buyer_citizen_record['fields'].get('Ducats', 0))

        if buyer_ducats < purchase_price:
            log.error(f"{LogColors.FAIL}Buyer {buyer_username} has insufficient funds ({buyer_ducats}) for purchase price ({purchase_price}). Activity {activity_guid}.{LogColors.ENDC}")
            # Optionally, mark listing as failed or just fail the activity
            return False

        tables['citizens'].update(seller_airtable_id, {'Ducats': seller_ducats + purchase_price})
        tables['citizens'].update(buyer_airtable_id, {'Ducats': buyer_ducats - purchase_price})
        log.info(f"{LogColors.PROCESS}Transferred {purchase_price} ducats from buyer {buyer_username} to seller {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")

        # Transfer land ownership
        tables['lands'].update(land_record['id'], {'Owner': [buyer_airtable_id]}) # Link to buyer's citizen record
        log.info(f"{LogColors.PROCESS}Transferred ownership of land {land_id_being_bought} to buyer {buyer_username}. Activity {activity_guid}.{LogColors.ENDC}")

        # Update listing contract status
        now_iso = datetime.now(timezone.utc).isoformat()
        tables['contracts'].update(listing_contract_record['id'], {"Status": "completed", "Buyer": [buyer_airtable_id], "UpdatedAt": now_iso, "Notes": f"Completed: Land bought by {buyer_username} on {now_iso}."})
        log.info(f"{LogColors.PROCESS}Listing contract {listing_contract_custom_id} status updated to 'completed'. Activity {activity_guid}.{LogColors.ENDC}")

        # Create transaction record
        transaction_payload = {
            "Type": "land_sale_from_listing",
            "AssetType": "land",
            "Asset": land_id_being_bought,
            "Seller": seller_username, # Username
            "Buyer": buyer_username,   # Username
            "Price": purchase_price,
            "Notes": json.dumps({"listing_contract_id": listing_contract_custom_id, "activity_guid": activity_guid}),
            "CreatedAt": now_iso,
            "ExecutedAt": now_iso
        }
        tables['transactions'].create(transaction_payload)
        log.info(f"{LogColors.SUCCESS}Land sale transaction recorded for land {land_id_being_bought}. Activity {activity_guid}.{LogColors.ENDC}")

        # Optional: Cancel other active offers for this land made by the buyer or others
        # Example: Cancel active 'land_offer' by the buyer for this land
        buyer_offers_formula = f"AND({{Asset}}='{land_id_being_bought}', {{AssetType}}='land', {{Type}}='land_offer', {{BuyerUsername}}='{buyer_username}', {{Status}}='active')"
        buyer_offers = tables['contracts'].all(formula=buyer_offers_formula)
        for offer in buyer_offers:
            tables['contracts'].update(offer['id'], {"Status": "cancelled", "Notes": f"Cancelled: Buyer {buyer_username} purchased land {land_id_being_bought} via listing."})
            log.info(f"{LogColors.PROCESS}Cancelled buyer's active offer {offer['fields'].get('ContractId')} for land {land_id_being_bought}.{LogColors.ENDC}")

        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_buy_listed_land' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
