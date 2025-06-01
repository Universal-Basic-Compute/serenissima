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

def process_accept_land_offer_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'execute_accept_land_offer' activity.
    - Validates the offer contract.
    - Verifies seller ownership.
    - Transfers land ownership.
    - Transfers ducats.
    - Updates contract statuses.
    - Creates a transaction record.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    seller_airtable_id = activity_fields.get('Citizen')[0] # Citizen performing the activity (seller)

    log.info(f"{LogColors.PROCESS}Processing 'execute_accept_land_offer' activity {activity_guid} by seller Airtable ID {seller_airtable_id}.{LogColors.ENDC}")

    try:
        details_str = activity_fields.get('Details')
        if not details_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details'.{LogColors.ENDC}")
            return False
        
        details = json.loads(details_str)
        offer_contract_custom_id = details.get('offerContractId')
        land_id_being_sold = details.get('landId')
        # seller_username_from_details = details.get('sellerUsername') # Should match activity performer

        if not offer_contract_custom_id or not land_id_being_sold:
            log.error(f"{LogColors.FAIL}Missing offerContractId or landId in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        # Get seller citizen record
        seller_citizen_record = tables['citizens'].get(seller_airtable_id)
        if not seller_citizen_record:
            log.error(f"{LogColors.FAIL}Seller citizen (Airtable ID: {seller_airtable_id}) not found for activity {activity_guid}.{LogColors.ENDC}")
            return False
        seller_username = seller_citizen_record['fields'].get('Username')

        # Get the land_offer contract
        offer_contract_record = get_contract_record(tables, offer_contract_custom_id)
        if not offer_contract_record:
            log.error(f"{LogColors.FAIL}Offer contract {offer_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        offer_contract_fields = offer_contract_record['fields']
        if offer_contract_fields.get('Type') != 'land_offer' or offer_contract_fields.get('Status') != 'active':
            log.error(f"{LogColors.FAIL}Contract {offer_contract_custom_id} is not an active land_offer. Status: {offer_contract_fields.get('Status')}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        if offer_contract_fields.get('Asset') != land_id_being_sold:
            log.error(f"{LogColors.FAIL}Offer contract {offer_contract_custom_id} is for asset {offer_contract_fields.get('Asset')}, not {land_id_being_sold}. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Get buyer details from contract
        buyer_airtable_id_list = offer_contract_fields.get('Buyer')
        if not buyer_airtable_id_list or not isinstance(buyer_airtable_id_list, list) or len(buyer_airtable_id_list) == 0:
            log.error(f"{LogColors.FAIL}Offer contract {offer_contract_custom_id} has no Buyer. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        buyer_airtable_id = buyer_airtable_id_list[0]
        buyer_citizen_record = tables['citizens'].get(buyer_airtable_id)
        if not buyer_citizen_record:
            log.error(f"{LogColors.FAIL}Buyer citizen (Airtable ID: {buyer_airtable_id}) from offer contract {offer_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        buyer_username = buyer_citizen_record['fields'].get('Username')
        
        # Verify land ownership
        land_record = get_land_record(tables, land_id_being_sold)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_being_sold} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        current_owner_airtable_id_list = land_record['fields'].get('Owner')
        if not current_owner_airtable_id_list or seller_airtable_id not in current_owner_airtable_id_list:
            current_owner_username_display = "Unknown/None"
            if current_owner_airtable_id_list:
                owner_rec_temp = tables['citizens'].get(current_owner_airtable_id_list[0])
                if owner_rec_temp: current_owner_username_display = owner_rec_temp['fields'].get('Username', 'Unknown ID')
            
            log.error(f"{LogColors.FAIL}Seller {seller_username} (Airtable ID: {seller_airtable_id}) does not own land {land_id_being_sold}. Current owner: {current_owner_username_display}. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Financial transaction
        sale_price = float(offer_contract_fields.get('PricePerResource', 0))
        seller_ducats = float(seller_citizen_record['fields'].get('Ducats', 0))
        buyer_ducats = float(buyer_citizen_record['fields'].get('Ducats', 0))

        if buyer_ducats < sale_price:
            log.error(f"{LogColors.FAIL}Buyer {buyer_username} has insufficient funds ({buyer_ducats}) for purchase price ({sale_price}). Activity {activity_guid}.{LogColors.ENDC}")
            # Optionally, mark offer as failed due to insufficient funds
            tables['contracts'].update(offer_contract_record['id'], {"Status": "failed", "Notes": f"Failed: Buyer insufficient funds at time of acceptance. Buyer had {buyer_ducats}, needed {sale_price}."})
            return False

        tables['citizens'].update(seller_airtable_id, {'Ducats': seller_ducats + sale_price})
        tables['citizens'].update(buyer_airtable_id, {'Ducats': buyer_ducats - sale_price})
        log.info(f"{LogColors.PROCESS}Transferred {sale_price} ducats from buyer {buyer_username} to seller {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")

        # Transfer land ownership
        tables['lands'].update(land_record['id'], {'Owner': [buyer_airtable_id]}) # Link to buyer's citizen record
        log.info(f"{LogColors.PROCESS}Transferred ownership of land {land_id_being_sold} to buyer {buyer_username}. Activity {activity_guid}.{LogColors.ENDC}")

        # Update offer contract status
        now_iso = datetime.now(timezone.utc).isoformat()
        tables['contracts'].update(offer_contract_record['id'], {"Status": "completed", "UpdatedAt": now_iso, "Notes": f"Completed: Offer accepted by {seller_username} on {now_iso}."})
        log.info(f"{LogColors.PROCESS}Offer contract {offer_contract_custom_id} status updated to 'completed'. Activity {activity_guid}.{LogColors.ENDC}")

        # Create transaction record
        transaction_payload = {
            "Type": "land_sale_from_offer",
            "AssetType": "land",
            "Asset": land_id_being_sold,
            "Seller": seller_username, # Username
            "Buyer": buyer_username,   # Username
            "Price": sale_price,
            "Notes": json.dumps({"accepted_offer_contract_id": offer_contract_custom_id, "activity_guid": activity_guid}),
            "CreatedAt": now_iso,
            "ExecutedAt": now_iso
        }
        tables['transactions'].create(transaction_payload)
        log.info(f"{LogColors.SUCCESS}Land sale transaction recorded for land {land_id_being_sold}. Activity {activity_guid}.{LogColors.ENDC}")

        # Optional: Cancel other active offers/listings for this land
        # Example: Cancel other 'land_offer' for this land
        other_offers_formula = f"AND({{Asset}}='{land_id_being_sold}', {{AssetType}}='land', {{Type}}='land_offer', {{Status}}='active', NOT({{ContractId}}='{offer_contract_custom_id}'))"
        other_offers = tables['contracts'].all(formula=other_offers_formula)
        for other_offer in other_offers:
            tables['contracts'].update(other_offer['id'], {"Status": "cancelled", "Notes": f"Cancelled: Land {land_id_being_sold} sold via offer {offer_contract_custom_id}."})
            log.info(f"{LogColors.PROCESS}Cancelled other active offer {other_offer['fields'].get('ContractId')} for land {land_id_being_sold}.{LogColors.ENDC}")
        
        # Example: Cancel active 'land_listing' by the seller for this land
        seller_listing_formula = f"AND({{Asset}}='{land_id_being_sold}', {{AssetType}}='land', {{Type}}='land_listing', {{SellerUsername}}='{seller_username}', {{Status}}='active')"
        seller_listings = tables['contracts'].all(formula=seller_listing_formula)
        for listing in seller_listings:
            tables['contracts'].update(listing['id'], {"Status": "cancelled", "Notes": f"Cancelled: Land {land_id_being_sold} sold via offer {offer_contract_custom_id}."})
            log.info(f"{LogColors.PROCESS}Cancelled active listing {listing['fields'].get('ContractId')} by {seller_username} for land {land_id_being_sold}.{LogColors.ENDC}")

        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_accept_land_offer' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
