import os
import sys
from datetime import datetime, timedelta, timezone
import uuid
import logging
from dotenv import load_dotenv
from airtable import Airtable # Using airtable-python-wrapper

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

# Load environment variables from .env file
# Ensure you have a .env file in your project root or that environment variables are set
# Example .env content:
# AIRTABLE_API_KEY="your_api_key"
# AIRTABLE_BASE_ID="your_base_id"
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=dotenv_path)
if not os.getenv("AIRTABLE_API_KEY"): # Check if .env was loaded from default location if specific path failed
    load_dotenv()


# Airtable configuration
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
    log.error("Airtable API Key or Base ID not found. Please set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
    sys.exit(1)

# Airtable table names from your schema
LANDS_TABLE_NAME = "LANDS"
CONTRACTS_TABLE_NAME = "CONTRACTS"

# Constants for the script
SELLER_USERNAME = "ConsiglioDeiDieci"
PRICE_PER_BUILDING_POINT = 150000  # Ducats
LISTING_DURATION_DAYS = 30 # How long the listing will be active

def create_land_listings_for_consiglio():
    """
    Fetches lands owned by ConsiglioDeiDieci and creates public sell contracts (land_listing) for them.
    """
    try:
        airtable_lands = Airtable(AIRTABLE_BASE_ID, LANDS_TABLE_NAME, api_key=AIRTABLE_API_KEY)
        airtable_contracts = Airtable(AIRTABLE_BASE_ID, CONTRACTS_TABLE_NAME, api_key=AIRTABLE_API_KEY)

        log.info(f"Attempting to fetch lands owned by '{SELLER_USERNAME}'...")
        
        # Formula to find lands owned by the specified seller
        # Ensure field names match your Airtable schema exactly (case-sensitive)
        formula = f"{{Owner}} = '{SELLER_USERNAME}'"
        
        # Fields to retrieve from the LANDS table
        fields_to_retrieve = ['LandId', 'BuildingPointsCount', 'EnglishName', 'HistoricalName']
        
        lands_owned_by_seller = airtable_lands.get_all(formula=formula, fields=fields_to_retrieve)

        if not lands_owned_by_seller:
            log.info(f"No lands found owned by '{SELLER_USERNAME}'. No contracts will be created.")
            return

        log.info(f"Found {len(lands_owned_by_seller)} land(s) owned by '{SELLER_USERNAME}'. Processing...")

        contracts_created_count = 0
        for land_record in lands_owned_by_seller:
            land_airtable_id = land_record.get('id')
            land_fields = land_record.get('fields', {})
            
            land_id = land_fields.get('LandId')
            building_points = land_fields.get('BuildingPointsCount', 0) # Default to 0 if not present
            
            # Use EnglishName if available, otherwise HistoricalName, or fallback to LandId for display
            land_name_english = land_fields.get('EnglishName')
            land_name_historical = land_fields.get('HistoricalName')
            land_display_name = land_name_english or land_name_historical or f"Land {land_id}"

            if not land_id:
                log.warning(f"Skipping land record with Airtable ID '{land_airtable_id}' due to missing 'LandId' field.")
                continue

            # Check if an active listing already exists for this land by this seller
            # This helps prevent creating duplicate listings if the script is run multiple times.
            existing_listing_formula = f"AND({{Asset}} = '{land_id}', {{AssetType}} = 'land', {{Type}} = 'land_listing', {{Seller}} = '{SELLER_USERNAME}', {{Status}} = 'active')"
            existing_listings = airtable_contracts.get_all(formula=existing_listing_formula, max_records=1)
            if existing_listings:
                log.info(f"An active 'land_listing' contract already exists for land '{land_id}' by '{SELLER_USERNAME}'. Skipping.")
                continue

            # Calculate the price
            price = building_points * PRICE_PER_BUILDING_POINT

            if price <= 0:
                log.warning(f"Skipping land '{land_id}' (Name: '{land_display_name}') as calculated price is {price} Ducats (Building Points: {building_points}). A positive price is required.")
                continue

            now_utc = datetime.now(timezone.utc)
            timestamp_str = now_utc.strftime("%Y%m%d%H%M%S") # For ContractId uniqueness
            
            # Generate a unique ContractId based on schema suggestions
            contract_id = f"land_listing_{land_id}_{SELLER_USERNAME}_{timestamp_str}_{str(uuid.uuid4())[:8]}"
            
            title = f"Public Land Sale: {land_display_name}"
            description = (f"The {SELLER_USERNAME} offers the land parcel '{land_display_name}' (ID: {land_id}) for public sale. "
                           f"This parcel features {building_points} building point(s).")
            
            # Calculate the end date for the listing
            end_at_utc = now_utc + timedelta(days=LISTING_DURATION_DAYS)

            # Prepare data for the new contract record
            # Ensure all field names match your CONTRACTS table schema (case-sensitive)
            contract_data = {
                "ContractId": contract_id,
                "Type": "land_listing", # As per schema for new land sales
                "Seller": SELLER_USERNAME,
                "Asset": land_id,       # LandId of the parcel being sold
                "AssetType": "land",
                "PricePerResource": price, # This is the total price for the land
                "TargetAmount": 1,         # Typically 1 for a single land parcel
                "Status": "active",
                "Title": title,
                "Description": description,
                "Notes": f"Automatically generated listing. Building Points: {building_points}. Price per point: {PRICE_PER_BUILDING_POINT} Ducats.",
                "CreatedAt": now_utc.isoformat(), # Record creation timestamp
                "EndAt": end_at_utc.isoformat(),   # When the listing expires
                # 'UpdatedAt' is usually handled automatically by Airtable
            }

            try:
                log.info(f"Creating 'land_listing' contract for land '{land_id}' (Name: '{land_display_name}') with price {price} Ducats.")
                created_contract_record = airtable_contracts.insert(contract_data)
                log.info(f"Successfully created contract with Airtable ID '{created_contract_record['id']}' (Custom ContractId: '{contract_id}') for land '{land_id}'.")
                contracts_created_count += 1
            except Exception as e:
                log.error(f"Failed to create contract for land '{land_id}'. Error: {e}")
                log.debug(f"Contract data that failed: {contract_data}")

        log.info(f"Script finished. {contracts_created_count} new land listing contract(s) created.")

    except Exception as e:
        log.error(f"An unexpected error occurred during script execution: {e}", exc_info=True)

if __name__ == "__main__":
    log.info(f"Starting script to create land listings for lands owned by '{SELLER_USERNAME}'...")
    create_land_listings_for_consiglio()
    log.info("Script execution complete.")
