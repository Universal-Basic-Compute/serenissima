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
    # Citizen field in ACTIVITIES table now stores the username string
    activity_citizen_username = activity_fields.get('Citizen') 

    log.info(f"{LogColors.PROCESS}Processing 'finalize_list_land_for_sale' activity {activity_guid} for citizen {activity_citizen_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes') # Changed from 'Details' to 'Notes'
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes' field (expected JSON details here).{LogColors.ENDC}") # Changed Details to Notes
            return False
        
        details = json.loads(notes_str) # Parse from notes_str
        land_id_to_list = details.get('landId')
        price = details.get('price')
        seller_username = details.get('sellerUsername') # This should match the citizen performing the activity

        if not land_id_to_list or price is None or not seller_username:
            log.error(f"{LogColors.FAIL}Missing landId, price, or sellerUsername in activity {activity_guid} details: {details}{LogColors.ENDC}")
            return False

        # Verify the citizen performing the activity is indeed the sellerUsername from details
        if activity_citizen_username != seller_username:
            log.error(f"{LogColors.FAIL}Citizen mismatch for activity {activity_guid}. Activity by {activity_citizen_username}, details specify seller {seller_username}.{LogColors.ENDC}")
            return False

        # Verify the seller owns the land
        land_record = get_land_record(tables, land_id_to_list) # Fetches by LandId (custom ID)
        if not land_record:
            log.error(f"{LogColors.FAIL}Land {land_id_to_list} not found for listing by {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        # Assuming 'Owner' field in LANDS stores the username directly
        current_land_owner_username = land_record['fields'].get('Owner') 
        if not current_land_owner_username:
            log.error(f"{LogColors.FAIL}Land {land_id_to_list} has no owner. Cannot be listed by {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False
        
        if current_land_owner_username != seller_username:
            log.error(f"{LogColors.FAIL}Land {land_id_to_list} is owned by {current_land_owner_username}, not by {seller_username}. Activity {activity_guid}.{LogColors.ENDC}")
            return False

        # Check for existing active 'land_listing' by this seller for this land
        # Assuming 'Seller' field in CONTRACTS stores the username directly
        existing_listing_formula = f"AND({{Asset}}='{land_id_to_list}', {{AssetType}}='land', {{Type}}='land_listing', {{Seller}}='{seller_username}', {{Status}}='active')"
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
            "Seller": seller_username, # Directly use the username string
            # Buyer is null for listings
            "Asset": land_id_to_list, # Custom LandId
            "AssetType": "land",
            "PricePerResource": float(price), # Price for the land (TargetAmount is implicitly 1)
            "TargetAmount": 1, 
            "Status": "active",
            "Title": f"Listing for Land: {land_name}",
            "Description": f"Land parcel {land_name} (ID: {land_id_to_list}) offered for sale by {seller_username} for {price} ducats.",
            "CreatedAt": now_iso,
            # "UpdatedAt": now_iso, # Removed UpdatedAt
            # Seller field stores the username directly as per clarification
            # Optional: EndAt for listing expiration
        }
        
        # Ensure UpdatedAt is not in the payload if it was somehow added
        if "UpdatedAt" in contract_payload:
            del contract_payload["UpdatedAt"]
            
        new_contract = tables['contracts'].create(contract_payload)
        log.info(f"{LogColors.SUCCESS}Successfully created land listing contract {new_contract['id']} (Custom ID: {contract_id}) for land {land_id_to_list} by {seller_username} at {price} ducats. Activity {activity_guid}.{LogColors.ENDC}")
        
        # Optional: Create a notification for the seller or a public log
        # tables['notifications'].create({...})

        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_list_land_for_sale' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
