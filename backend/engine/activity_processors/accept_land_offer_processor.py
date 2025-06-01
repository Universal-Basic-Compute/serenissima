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
    activity_citizen_username = activity_fields.get('Citizen') # Seller's username

    log.info(f"{LogColors.PROCESS}Processing 'execute_accept_land_offer' activity {activity_guid} by seller {activity_citizen_username}.{LogColors.ENDC}")

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
        seller_citizen_record = get_citizen_record(tables, activity_citizen_username)
        if not seller_citizen_record:
            log.error(f"{LogColors.FAIL}Seller citizen '{activity_citizen_username}' not found for activity {activity_guid}.{LogColors.ENDC}")
            return False
        seller_airtable_id = seller_citizen_record['id'] # For updating Ducats
        seller_username = activity_citizen_username # Confirmed

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

        # Get buyer details from contract (assuming 'Buyer' field stores username string)
        buyer_username_from_contract = offer_contract_fields.get('Buyer')
        if not buyer_username_from_contract:
            log.error(f"{LogColors.FAIL}Offer contract {offer_contract_custom_id} has no Buyer username. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        buyer_citizen_record = get_citizen_record(tables, buyer_username_from_contract)
        if not buyer_citizen_record:
            log.error(f"{LogColors.FAIL}Buyer citizen '{buyer_username_from_contract}' from offer contract {offer_contract_custom_id} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        buyer_airtable_id = buyer_citizen_record['id'] # Get Airtable ID for updates
        buyer_username = buyer_citizen_record['fields'].get('Username') # Confirm username

        # Verify land ownership
        land_record = get_land_record(tables, land_id_being_sold)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_being_sold} not found. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        # Assuming 'Owner' field in LANDS stores the username directly
        current_land_owner_username = land_record['fields'].get('Owner')
        if not current_land_owner_username or current_land_owner_username != seller_username:
            log.error(f"{LogColors.FAIL}Seller {seller_username} does not own land {land_id_being_sold}. Current owner: {current_land_owner_username or 'None'}. Activity {activity_guid}.{LogColors.ENDC}")
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

        # Transfer land ownership (store username string)
        tables['lands'].update(land_record['id'], {'Owner': buyer_username}) 
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
        # Assuming 'Seller' field in CONTRACTS stores the username directly
        seller_listing_formula = f"AND({{Asset}}='{land_id_being_sold}', {{AssetType}}='land', {{Type}}='land_listing', {{Seller}}='{seller_username}', {{Status}}='active')"
        seller_listings = tables['contracts'].all(formula=seller_listing_formula)
        for listing in seller_listings:
            tables['contracts'].update(listing['id'], {"Status": "cancelled", "Notes": f"Cancelled: Land {land_id_being_sold} sold via offer {offer_contract_custom_id}."})
            log.info(f"{LogColors.PROCESS}Cancelled active listing {listing['fields'].get('ContractId')} by {seller_username} for land {land_id_being_sold}.{LogColors.ENDC}")

        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'execute_accept_land_offer' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
