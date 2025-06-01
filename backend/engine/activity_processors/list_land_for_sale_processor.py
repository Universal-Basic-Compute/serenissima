import os
import sys
import logging
import json
from datetime import datetime, timezone
import uuid

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import (
    LogColors,
    get_citizen_record,
    get_land_record, # To verify ownership and get land details
    VENICE_TIMEZONE
)

log = logging.getLogger(__name__)

def process_list_land_for_sale_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'finalize_list_land_for_sale' activity.
    Creates a new 'land_listing' contract in the CONTRACTS table.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_airtable_id = activity_fields.get('Citizen')[0] # Assuming single link

    log.info(f"{LogColors.PROCESS}Processing 'finalize_list_land_for_sale' activity {activity_guid} for citizen Airtable ID {citizen_airtable_id}.{LogColors.ENDC}")

    try:
        details_str = activity_fields.get('Details')
        if not details_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Details' field.{LogColors.ENDC}")
            return False
        
        details = json.loads(details_str)
        land_id_to_list = details.get('landId')
        price = details.get('price')
        seller_username = details.get('sellerUsername') # This should match the citizen performing the activity

        if not land_id_to_list or price is None or not seller_username:
            log.error(f"{LogColors.FAIL}Missing landId, price, or sellerUsername in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        # Verify the citizen performing the activity is indeed the sellerUsername from details
        citizen_record = tables['citizens'].get(citizen_airtable_id)
        if not citizen_record or citizen_record['fields'].get('Username') != seller_username:
            log.error(f"{LogColors.FAIL}Citizen mismatch for activity {activity_guid}. Activity by {citizen_record['fields'].get('Username') if citizen_record else 'Unknown'}, details specify seller {seller_username}.{LogColors.ENDC}")
            return False

        # Verify the seller owns the land
        land_record = get_land_record(tables, land_id_to_list) # Fetches by LandId (custom ID)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_to_list} not found for listing by {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        current_owner_username = land_record['fields'].get('Owner') # This is a linked record ID to CITIZENS
        if not current_owner_username:
            log.error(f"{LogColors.FAIL}Land {land_id_to_list} has no owner. Cannot be listed by {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        # Fetch the owner's citizen record to get their Username
        owner_citizen_record = tables['citizens'].get(current_owner_username[0]) # Assuming single link
        if not owner_citizen_record or owner_citizen_record['fields'].get('Username') != seller_username:
            log.error(f"{LogColors.FAIL}Land {land_id_to_list} is owned by {owner_citizen_record['fields'].get('Username') if owner_citizen_record else 'Unknown'}, not by {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Check for existing active 'land_listing' by this seller for this land
        existing_listing_formula = f"AND({{Asset}}='{land_id_to_list}', {{AssetType}}='land', {{Type}}='land_listing', {{SellerUsername}}='{seller_username}', {{Status}}='active')"
        existing_listings = tables['contracts'].all(formula=existing_listing_formula)
        if existing_listings:
            log.warning(f"{LogColors.WARNING}Citizen {seller_username} already has an active listing for land {land_id_to_list}. Activity {activity_guid}. Skipping new listing.{LogColors.ENDC}")
            # Consider this a success as the desired state (land listed) is already met, or fail if duplicate listings are problematic.
            # For now, let's treat it as success to avoid repeated attempts.
            return True

        # Create the contract
        contract_id = f"land_listing_{land_id_to_list}_{seller_username}_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Get land name for title/description
        land_name = land_record['fields'].get('HistoricalName', land_id_to_list)

        contract_payload = {
            "ContractId": contract_id,
            "Type": "land_listing",
            "Seller": [citizen_airtable_id], # Link to citizen record ID
            # Buyer is null for listings
            "Asset": land_id_to_list, # Custom LandId
            "AssetType": "land",
            "PricePerResource": float(price), # Price for the land (TargetAmount is implicitly 1)
            "TargetAmount": 1, 
            "Status": "active",
            "Title": f"Listing for Land: {land_name}",
            "Description": f"Land parcel {land_name} (ID: {land_id_to_list}) offered for sale by {seller_username} for {price} ducats.",
            "CreatedAt": now_iso,
            "UpdatedAt": now_iso,
            # Optional: EndAt for listing expiration
        }
        
        # Add SellerUsername for easier querying if your schema supports it, or put in Notes
        # For now, assuming Seller (linked record) is sufficient. If you add SellerUsername to CONTRACTS:
        # contract_payload["SellerUsername"] = seller_username

        new_contract = tables['contracts'].create(contract_payload)
        log.info(f"{LogColors.SUCCESS}Successfully created land listing contract {new_contract['id']} (Custom ID: {contract_id}) for land {land_id_to_list} by {seller_username} at {price} ducats. Activity {activity_guid}.{LogColors.ENDC}")
        
        # Optional: Create a notification for the seller or a public log
        # tables['notifications'].create({...})

        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_list_land_for_sale' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
