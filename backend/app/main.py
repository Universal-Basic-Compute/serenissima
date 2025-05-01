from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pyairtable import Api, Table
import os
import sys
import traceback
import datetime
import json
import requests
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key for image generation
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY", "")

# Get Airtable credentials
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_USERS_TABLE = os.getenv("AIRTABLE_USERS_TABLE", "Users")  # Default to "Users" if not set

# Print debug info
print(f"Airtable API Key: {'Set' if AIRTABLE_API_KEY else 'Not set'}")
print(f"Airtable Base ID: {'Set' if AIRTABLE_BASE_ID else 'Not set'}")
print(f"Airtable Users Table: {AIRTABLE_USERS_TABLE}")

# Check if credentials are set
if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID or not AIRTABLE_USERS_TABLE:
    print("ERROR: Airtable credentials are not properly set in .env file")
    print("Please make sure AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_USERS_TABLE are set")

# Initialize Airtable with error handling
try:
    airtable = Api(AIRTABLE_API_KEY)
    users_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_USERS_TABLE)
    # Test the connection
    print("Testing Airtable connection...")
    # Just get one record to test (limit=1)
    test_records = users_table.all(limit=1)
    print(f"Airtable connection successful. Found {len(test_records)} test records.")
except Exception as e:
    print(f"ERROR initializing Airtable: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Initialize Airtable for LANDS table
AIRTABLE_LANDS_TABLE = os.getenv("AIRTABLE_LANDS_TABLE", "LANDS")
try:
    lands_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_LANDS_TABLE)
    print(f"Initialized Airtable LANDS table: {AIRTABLE_LANDS_TABLE}")
except Exception as e:
    print(f"ERROR initializing Airtable LANDS table: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Initialize Airtable for TRANSACTIONS table
AIRTABLE_TRANSACTIONS_TABLE = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS")
try:
    transactions_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TRANSACTIONS_TABLE)
    print(f"Initialized Airtable TRANSACTIONS table: {AIRTABLE_TRANSACTIONS_TABLE}")
except Exception as e:
    print(f"ERROR initializing Airtable TRANSACTIONS table: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Create FastAPI app
app = FastAPI(title="Wallet Storage API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request models
class WalletRequest(BaseModel):
    wallet_address: str
    compute_amount: float = None
    user_name: str = None
    first_name: str = None  # Add this field
    last_name: str = None   # Add this field
    email: str = None
    family_coat_of_arms: str = None
    family_motto: str = None
    coat_of_arms_image: str = None

# Define response models
class WalletResponse(BaseModel):
    id: str
    wallet_address: str
    compute_amount: float = None
    user_name: str = None
    first_name: str = None  # Add this field
    last_name: str = None   # Add this field
    email: str = None
    family_coat_of_arms: str = None
    family_motto: str = None
    coat_of_arms_image: str = None

# Add these new models
class LandRequest(BaseModel):
    land_id: str
    user: str = None
    wallet_address: str = None  # Keep for backward compatibility
    historical_name: str = None
    english_name: str = None
    description: str = None

class LandResponse(BaseModel):
    id: str
    land_id: str
    user: str = None
    wallet_address: str = None  # Keep for backward compatibility
    historical_name: str = None
    english_name: str = None
    description: str = None

class TransactionRequest(BaseModel):
    type: str  # 'land', 'bridge', etc.
    asset_id: str
    seller: str
    buyer: str = None
    price: float
    historical_name: str = None
    english_name: str = None
    description: str = None

class TransactionResponse(BaseModel):
    id: str
    type: str
    asset_id: str
    seller: str
    buyer: str = None
    price: float
    historical_name: str = None
    english_name: str = None
    description: str = None
    created_at: str
    updated_at: str
    executed_at: str = None

@app.get("/")
def read_root():
    return {"message": "Wallet Storage API is running"}

@app.post("/api/wallet", response_model=WalletResponse)
async def store_wallet(wallet_data: WalletRequest):
    """Store a wallet address in Airtable"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    try:
        # Check if wallet already exists
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = users_table.all(formula=formula)
        
        if existing_records:
            # Update existing record with new data
            record = existing_records[0]
            print(f"Found existing wallet record: {record['id']}")
            
            # Create update fields dictionary
            update_fields = {}
            
            if wallet_data.compute_amount is not None:
                update_fields["ComputeAmount"] = wallet_data.compute_amount
                
            if wallet_data.user_name:
                update_fields["Username"] = wallet_data.user_name
                
            if wallet_data.first_name:
                update_fields["FirstName"] = wallet_data.first_name
                
            if wallet_data.last_name:
                update_fields["LastName"] = wallet_data.last_name
                
            if wallet_data.email:
                update_fields["Email"] = wallet_data.email
                
            if wallet_data.family_coat_of_arms:
                update_fields["FamilyCoatOfArms"] = wallet_data.family_coat_of_arms
                
            if wallet_data.family_motto:
                update_fields["FamilyMotto"] = wallet_data.family_motto
                
            if wallet_data.coat_of_arms_image:
                update_fields["CoatOfArmsImage"] = wallet_data.coat_of_arms_image
            
            # Only update if there are fields to update
            if update_fields:
                print(f"Updating wallet record with fields: {update_fields}")
                record = users_table.update(record["id"], update_fields)
                print(f"Updated wallet record: {record['id']}")
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "compute_amount": record["fields"].get("ComputeAmount", 0),
                "user_name": record["fields"].get("Username", None),
                "first_name": record["fields"].get("FirstName", None),
                "last_name": record["fields"].get("LastName", None),
                "email": record["fields"].get("Email", None),
                "family_coat_of_arms": record["fields"].get("FamilyCoatOfArms", None),
                "family_motto": record["fields"].get("FamilyMotto", None),
                "coat_of_arms_image": record["fields"].get("CoatOfArmsImage", None)
            }
        
        # Create new record
        fields = {
            "Wallet": wallet_data.wallet_address
        }
        
        if wallet_data.compute_amount is not None:
            fields["ComputeAmount"] = wallet_data.compute_amount
            
        if wallet_data.user_name:
            fields["Username"] = wallet_data.user_name
            
        if wallet_data.first_name:
            fields["FirstName"] = wallet_data.first_name
            
        if wallet_data.last_name:
            fields["LastName"] = wallet_data.last_name
            
        if wallet_data.email:
            fields["Email"] = wallet_data.email
            
        if wallet_data.family_coat_of_arms:
            fields["FamilyCoatOfArms"] = wallet_data.family_coat_of_arms
            
        if wallet_data.family_motto:
            fields["FamilyMotto"] = wallet_data.family_motto
            
        if wallet_data.coat_of_arms_image:
            fields["CoatOfArmsImage"] = wallet_data.coat_of_arms_image
        
        print(f"Creating new wallet record with fields: {fields}")
        # Print the actual values for debugging
        print(f"First Name: '{wallet_data.first_name}'")
        print(f"Last Name: '{wallet_data.last_name}'")
        print(f"Family Coat of Arms: '{wallet_data.family_coat_of_arms}'")
        print(f"Family Motto: '{wallet_data.family_motto}'")
        print(f"Coat of Arms Image URL length: {len(wallet_data.coat_of_arms_image or '')}")
        record = users_table.create(fields)
        print(f"Created new wallet record: {record['id']}")
        
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "compute_amount": record["fields"].get("ComputeAmount", 0),
            "user_name": record["fields"].get("Username", None),
            "first_name": record["fields"].get("FirstName", None),
            "last_name": record["fields"].get("LastName", None),
            "email": record["fields"].get("Email", None),
            "family_coat_of_arms": record["fields"].get("FamilyCoatOfArms", None),
            "family_motto": record["fields"].get("FamilyMotto", None),
            "coat_of_arms_image": record["fields"].get("CoatOfArmsImage", None)
        }
    except Exception as e:
        error_msg = f"Failed to store wallet: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/wallet/{wallet_address}")
async def get_wallet(wallet_address: str):
    """Get wallet information from Airtable"""
    
    try:
        formula = f"{{Wallet}}='{wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        records = users_table.all(formula=formula)
        
        if not records:
            raise HTTPException(status_code=404, detail="Wallet not found")
        
        record = records[0]
        print(f"Found wallet record: {record['id']}")
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "compute_amount": record["fields"].get("ComputeAmount", 0),
            "user_name": record["fields"].get("Username", None),
            "first_name": record["fields"].get("FirstName", None),
            "last_name": record["fields"].get("LastName", None),
            "email": record["fields"].get("Email", None),
            "family_coat_of_arms": record["fields"].get("FamilyCoatOfArms", None),
            "family_motto": record["fields"].get("FamilyMotto", None),
            "coat_of_arms_image": record["fields"].get("CoatOfArmsImage", None)
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get wallet: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/invest-compute")
async def invest_compute(wallet_data: WalletRequest):
    """Invest compute resources for a wallet"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if wallet_data.compute_amount is None or wallet_data.compute_amount <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    try:
        # Check if wallet exists
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = users_table.all(formula=formula)
        
        if existing_records:
            # Update existing record
            record = existing_records[0]
            current_amount = record["fields"].get("ComputeAmount", 0)
            new_amount = current_amount + wallet_data.compute_amount
            
            print(f"Updating wallet {record['id']} compute amount from {current_amount} to {new_amount}")
            updated_record = users_table.update(record["id"], {
                "ComputeAmount": new_amount
            })
            
            return {
                "id": updated_record["id"],
                "wallet_address": updated_record["fields"].get("Wallet", ""),
                "compute_amount": updated_record["fields"].get("ComputeAmount", 0),
                "user_name": updated_record["fields"].get("Username", None),
                "email": updated_record["fields"].get("Email", None),
                "family_motto": updated_record["fields"].get("FamilyMotto", None),
                "coat_of_arms_image": updated_record["fields"].get("CoatOfArmsImage", None)
            }
        else:
            # Create new record
            print(f"Creating new wallet record with compute amount {wallet_data.compute_amount}")
            record = users_table.create({
                "Wallet": wallet_data.wallet_address,
                "ComputeAmount": wallet_data.compute_amount
            })
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "compute_amount": record["fields"].get("ComputeAmount", 0),
                "user_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None),
                "family_motto": record["fields"].get("FamilyMotto", None)
            }
    except Exception as e:
        error_msg = f"Failed to invest compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/land", response_model=LandResponse)
async def create_land(land_data: LandRequest):
    """Create a land record in Airtable"""
    
    if not land_data.land_id:
        raise HTTPException(status_code=400, detail="Land ID is required")
    
    # Handle either user or wallet_address
    owner = land_data.user or land_data.wallet_address
    if not owner:
        raise HTTPException(status_code=400, detail="User or wallet_address is required")
    
    try:
        # Check if land already exists
        formula = f"{{LandId}}='{land_data.land_id}'"
        print(f"Searching for land with formula: {formula}")
        existing_records = lands_table.all(formula=formula)
        
        if existing_records:
            # Return existing record
            record = existing_records[0]
            print(f"Found existing land record: {record['id']}")
            return {
                "id": record["id"],
                "land_id": record["fields"].get("LandId", ""),
                "user": record["fields"].get("User", ""),
                "wallet_address": record["fields"].get("Wallet", ""),
                "historical_name": record["fields"].get("HistoricalName", None),
                "english_name": record["fields"].get("EnglishName", None),
                "description": record["fields"].get("Description", None)
            }
        
        # Create new record
        fields = {
            "LandId": land_data.land_id,
            "User": owner
        }
        
        if land_data.historical_name:
            fields["HistoricalName"] = land_data.historical_name
            
        if land_data.english_name:
            fields["EnglishName"] = land_data.english_name
            
        if land_data.description:
            fields["Description"] = land_data.description
        
        print(f"Creating new land record with fields: {fields}")
        record = lands_table.create(fields)
        print(f"Created new land record: {record['id']}")
        
        return {
            "id": record["id"],
            "land_id": record["fields"].get("LandId", ""),
            "user": record["fields"].get("User", ""),
            "wallet_address": record["fields"].get("Wallet", ""),
            "historical_name": record["fields"].get("HistoricalName", None),
            "english_name": record["fields"].get("EnglishName", None),
            "description": record["fields"].get("Description", None)
        }
    except Exception as e:
        error_msg = f"Failed to create land record: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/land/{land_id}")
async def get_land(land_id: str):
    """Get land information from Airtable"""
    
    try:
        formula = f"{{LandId}}='{land_id}'"
        print(f"Searching for land with formula: {formula}")
        records = lands_table.all(formula=formula)
        
        if not records:
            raise HTTPException(status_code=404, detail="Land not found")
        
        record = records[0]
        print(f"Found land record: {record['id']}")
        return {
            "id": record["id"],
            "land_id": record["fields"].get("LandId", ""),
            "user": record["fields"].get("User", ""),
            "wallet_address": record["fields"].get("Wallet", ""),
            "historical_name": record["fields"].get("HistoricalName", None),
            "english_name": record["fields"].get("EnglishName", None),
            "description": record["fields"].get("Description", None)
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get land: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/lands")
async def get_lands():
    """Get all lands with their owners from Airtable."""
    try:
        print("Fetching all lands from Airtable...")
        # Fetch all records from the LANDS table
        records = lands_table.all()
        
        # Format the response
        lands = []
        for record in records:
            fields = record['fields']
            land_data = {
                'id': fields.get('LandId', ''),
                'owner': fields.get('User', ''),  # Use User field instead of Wallet
                'historicalName': fields.get('HistoricalName', ''),
                'englishName': fields.get('EnglishName', ''),
                'description': fields.get('Description', '')
            }
            lands.append(land_data)
        
        print(f"Found {len(lands)} land records")
        return lands
    except Exception as e:
        error_msg = f"Error fetching lands: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.delete("/api/land/{land_id}")
async def delete_land(land_id: str):
    """Delete a land record from Airtable"""
    
    try:
        # Check if land exists
        formula = f"{{LandId}}='{land_id}'"
        print(f"Searching for land with formula: {formula}")
        existing_records = lands_table.all(formula=formula)
        
        if not existing_records:
            raise HTTPException(status_code=404, detail="Land not found")
        
        # Delete the record
        record = existing_records[0]
        print(f"Deleting land record: {record['id']}")
        lands_table.delete(record['id'])
        
        return {"success": True, "message": f"Land {land_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to delete land: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/transaction", response_model=TransactionResponse)
async def create_transaction(transaction_data: TransactionRequest):
    """Create a transaction record in Airtable"""
    
    if not transaction_data.type:
        raise HTTPException(status_code=400, detail="Transaction type is required")
    
    if not transaction_data.asset_id:
        raise HTTPException(status_code=400, detail="Asset ID is required")
    
    if not transaction_data.seller:
        raise HTTPException(status_code=400, detail="Seller is required")
    
    if not transaction_data.price or transaction_data.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than 0")
    
    try:
        # Check if transaction already exists for this asset
        formula = f"AND({{AssetId}}='{transaction_data.asset_id}', {{Type}}='{transaction_data.type}', {{ExecutedAt}}=BLANK())"
        print(f"Searching for existing transaction with formula: {formula}")
        existing_records = transactions_table.all(formula=formula)
        
        if existing_records:
            # Return existing record
            record = existing_records[0]
            print(f"Found existing transaction record: {record['id']}")
            return {
                "id": record["id"],
                "type": record["fields"].get("Type", ""),
                "asset_id": record["fields"].get("AssetId", ""),
                "seller": record["fields"].get("Seller", ""),
                "buyer": record["fields"].get("Buyer", None),
                "price": record["fields"].get("Price", 0),
                "historical_name": None,
                "english_name": None,
                "description": None,
                "created_at": record["fields"].get("CreatedAt", ""),
                "updated_at": record["fields"].get("UpdatedAt", ""),
                "executed_at": record["fields"].get("ExecutedAt", None)
            }
        
        # Create new record
        now = datetime.datetime.now().isoformat()
        
        fields = {
            "Type": transaction_data.type,
            "AssetId": transaction_data.asset_id,
            "Seller": transaction_data.seller,
            "Price": transaction_data.price,
            "CreatedAt": now,
            "UpdatedAt": now
        }
        
        if transaction_data.buyer:
            fields["Buyer"] = transaction_data.buyer
            
        # Store land details as JSON in Notes field if this is a land transaction
        if transaction_data.type == "land":
            land_details = {}
            if transaction_data.historical_name:
                land_details["historical_name"] = transaction_data.historical_name
            if transaction_data.english_name:
                land_details["english_name"] = transaction_data.english_name
            if transaction_data.description:
                land_details["description"] = transaction_data.description
                
            if land_details:
                fields["Notes"] = json.dumps(land_details)
        
        print(f"Creating new transaction record with fields: {fields}")
        record = transactions_table.create(fields)
        print(f"Created new transaction record: {record['id']}")
        
        return {
            "id": record["id"],
            "type": record["fields"].get("Type", ""),
            "asset_id": record["fields"].get("AssetId", ""),
            "seller": record["fields"].get("Seller", ""),
            "buyer": record["fields"].get("Buyer", None),
            "price": record["fields"].get("Price", 0),
            "historical_name": None,
            "english_name": None,
            "description": None,
            "created_at": record["fields"].get("CreatedAt", ""),
            "updated_at": record["fields"].get("UpdatedAt", ""),
            "executed_at": record["fields"].get("ExecutedAt", None)
        }
    except Exception as e:
        error_msg = f"Failed to create transaction record: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/transaction/land/{land_id}")
async def get_land_transaction(land_id: str):
    """Get transaction information for a land"""
    
    try:
        # Try different formats of the land ID
        possible_ids = [
            land_id,
            f"polygon-{land_id}" if not land_id.startswith("polygon-") else land_id,
            land_id.replace("polygon-", "") if land_id.startswith("polygon-") else land_id
        ]
        
        # Create a formula that checks all possible ID formats
        id_conditions = [f"{{AssetId}}='{id}'" for id in possible_ids]
        formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land', {{ExecutedAt}}=BLANK())"
        
        print(f"Searching for land transaction with formula: {formula}")
        records = transactions_table.all(formula=formula)
        
        if not records:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        record = records[0]
        print(f"Found transaction record: {record['id']}")
        
        # Extract land details from Notes field if available
        historical_name = None
        english_name = None
        description = None
        
        if "Notes" in record["fields"]:
            try:
                land_details = json.loads(record["fields"].get("Notes", "{}"))
                historical_name = land_details.get("historical_name")
                english_name = land_details.get("english_name")
                description = land_details.get("description")
            except json.JSONDecodeError:
                # If Notes isn't valid JSON, just ignore it
                pass
        
        return {
            "id": record["id"],
            "type": record["fields"].get("Type", ""),
            "asset_id": record["fields"].get("AssetId", ""),
            "seller": record["fields"].get("Seller", ""),
            "buyer": record["fields"].get("Buyer", None),
            "price": record["fields"].get("Price", 0),
            "historical_name": historical_name,
            "english_name": english_name,
            "description": description,
            "created_at": record["fields"].get("CreatedAt", ""),
            "updated_at": record["fields"].get("UpdatedAt", ""),
            "executed_at": record["fields"].get("ExecutedAt", None)
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get transaction: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/transactions")
async def get_transactions():
    """Get all active transactions"""
    
    try:
        formula = "{{ExecutedAt}}=BLANK()"
        print(f"Fetching all active transactions with formula: {formula}")
        records = transactions_table.all(formula=formula)
        
        transactions = []
        for record in records:
            # Extract land details from Notes field if available
            historical_name = None
            english_name = None
            description = None
            
            if "Notes" in record["fields"]:
                try:
                    land_details = json.loads(record["fields"].get("Notes", "{}"))
                    historical_name = land_details.get("historical_name")
                    english_name = land_details.get("english_name")
                    description = land_details.get("description")
                except json.JSONDecodeError:
                    # If Notes isn't valid JSON, just ignore it
                    pass
            
            transactions.append({
                "id": record["id"],
                "type": record["fields"].get("Type", ""),
                "asset_id": record["fields"].get("AssetId", ""),
                "seller": record["fields"].get("Seller", ""),
                "buyer": record["fields"].get("Buyer", None),
                "price": record["fields"].get("Price", 0),
                "historical_name": historical_name,
                "english_name": english_name,
                "description": description,
                "created_at": record["fields"].get("CreatedAt", ""),
                "updated_at": record["fields"].get("UpdatedAt", ""),
                "executed_at": record["fields"].get("ExecutedAt", None)
            })
        
        print(f"Found {len(transactions)} active transactions")
        return transactions
    except Exception as e:
        error_msg = f"Failed to get transactions: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/transactions/land/{land_id}")
async def get_land_transactions(land_id: str):
    """Get all transactions for a land (both incoming and outgoing offers)"""
    
    try:
        # Try different formats of the land ID
        possible_ids = [
            land_id,
            f"polygon-{land_id}" if not land_id.startswith("polygon-") else land_id,
            land_id.replace("polygon-", "") if land_id.startswith("polygon-") else land_id
        ]
        
        # Create a formula that checks all possible ID formats
        id_conditions = [f"{{AssetId}}='{id}'" for id in possible_ids]
        formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land', {{ExecutedAt}}=BLANK())"
        
        print(f"Searching for land transactions with formula: {formula}")
        records = transactions_table.all(formula=formula)
        
        if not records:
            # No transactions found
            return []
        
        transactions = []
        for record in records:
            # Extract land details from Notes field if available
            historical_name = None
            english_name = None
            description = None
            
            if "Notes" in record["fields"]:
                try:
                    land_details = json.loads(record["fields"].get("Notes", "{}"))
                    historical_name = land_details.get("historical_name")
                    english_name = land_details.get("english_name")
                    description = land_details.get("description")
                except json.JSONDecodeError:
                    # If Notes isn't valid JSON, just ignore it
                    pass
            
            transactions.append({
                "id": record["id"],
                "type": record["fields"].get("Type", ""),
                "asset_id": record["fields"].get("AssetId", ""),
                "seller": record["fields"].get("Seller", ""),
                "buyer": record["fields"].get("Buyer", None),
                "price": record["fields"].get("Price", 0),
                "historical_name": historical_name,
                "english_name": english_name,
                "description": description,
                "created_at": record["fields"].get("CreatedAt", ""),
                "updated_at": record["fields"].get("UpdatedAt", ""),
                "executed_at": record["fields"].get("ExecutedAt", None)
            })
        
        print(f"Found {len(transactions)} transactions for land {land_id}")
        return transactions
    except Exception as e:
        error_msg = f"Failed to get land transactions: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/transaction/{transaction_id}/execute")
async def execute_transaction(transaction_id: str, data: dict):
    """Execute a transaction by setting the buyer and executed_at timestamp"""
    
    if not data.get("buyer"):
        raise HTTPException(status_code=400, detail="Buyer is required")
    
    try:
        # Get the transaction record
        record = transactions_table.get(transaction_id)
        if not record:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        # Check if transaction is already executed
        if record["fields"].get("ExecutedAt"):
            raise HTTPException(status_code=400, detail="Transaction already executed")
        
        # Update the transaction with buyer and executed_at
        now = datetime.datetime.now().isoformat()
        updated_record = transactions_table.update(transaction_id, {
            "Buyer": data["buyer"],
            "ExecutedAt": now,
            "UpdatedAt": now
        })
        
        # Update the land ownership
        asset_id = record["fields"].get("AssetId")
        asset_type = record["fields"].get("Type")
        
        if asset_type == "land":
            # Get the land record
            formula = f"{{LandId}}='{asset_id}'"
            land_records = lands_table.all(formula=formula)
            
            if land_records:
                # Update the land owner
                land_record = land_records[0]
                lands_table.update(land_record["id"], {
                    "Wallet": data["buyer"]
                })
            else:
                # Create a new land record
                land_fields = {
                    "LandId": asset_id,
                    "Wallet": data["buyer"]
                }
                
                # Extract land details from Notes field if available
                if "Notes" in record["fields"]:
                    try:
                        land_details = json.loads(record["fields"].get("Notes", "{}"))
                        if "historical_name" in land_details:
                            land_fields["HistoricalName"] = land_details["historical_name"]
                        if "english_name" in land_details:
                            land_fields["EnglishName"] = land_details["english_name"]
                        if "description" in land_details:
                            land_fields["Description"] = land_details["description"]
                    except json.JSONDecodeError:
                        # If Notes isn't valid JSON, just ignore it
                        pass
                
                lands_table.create(land_fields)
        
        return {
            "id": updated_record["id"],
            "type": updated_record["fields"].get("Type", ""),
            "asset_id": updated_record["fields"].get("AssetId", ""),
            "seller": updated_record["fields"].get("Seller", ""),
            "buyer": updated_record["fields"].get("Buyer", None),
            "price": updated_record["fields"].get("Price", 0),
            "historical_name": updated_record["fields"].get("HistoricalName", None),
            "english_name": updated_record["fields"].get("EnglishName", None),
            "description": updated_record["fields"].get("Description", None),
            "created_at": updated_record["fields"].get("CreatedAt", ""),
            "updated_at": updated_record["fields"].get("UpdatedAt", ""),
            "executed_at": updated_record["fields"].get("ExecutedAt", None)
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to execute transaction: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/generate-coat-of-arms")
async def generate_coat_of_arms(data: dict):
    """Generate a coat of arms image based on description"""
    
    if not data.get("description"):
        raise HTTPException(status_code=400, detail="Description is required")
    
    ideogram_api_key = os.getenv("IDEOGRAM_API_KEY", "")
    
    if not ideogram_api_key:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Ideogram API key not configured"}
        )
    
    try:
        # Create a prompt for the image generation
        prompt = f"Create a detailed 15th century Venetian coat of arms with these elements: {data['description']}. Style: historical, realistic, detailed heraldry, Renaissance Venetian style, gold leaf accents, rich colors."
        
        # Call the Ideogram API with the correct endpoint and parameters
        response = requests.post(
            "https://api.ideogram.ai/generate",
            headers={
                "Api-Key": ideogram_api_key,
                "Content-Type": "application/json"
            },
            json={
                "image_request": {
                    "prompt": prompt,
                    "aspect_ratio": "ASPECT_1_1",
                    "model": "V_2A",
                    "style_type": "REALISTIC",
                    "magic_prompt_option": "AUTO"
                }
            }
        )
        
        if not response.ok:
            print(f"Error from Ideogram API: {response.status_code} {response.text}")
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": f"Failed to generate image: {response.text}"}
            )
        
        # Parse the response to get the image URL
        result = response.json()
        
        # Extract the image URL from the response
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": "No image URL in response"}
            )
        
        # Return the image URL
        return {
            "success": True,
            "image_url": image_url,
            "prompt": prompt
        }
    except Exception as e:
        error_msg = f"Failed to generate coat of arms: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": error_msg}
        )

@app.post("/api/transaction/{transaction_id}/cancel")
async def cancel_transaction(transaction_id: str, data: dict):
    """Cancel a transaction"""
    
    if not data.get("seller"):
        raise HTTPException(status_code=400, detail="Seller is required")
    
    try:
        # Get the transaction record
        record = transactions_table.get(transaction_id)
        if not record:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        # Check if transaction is already executed
        if record["fields"].get("ExecutedAt"):
            raise HTTPException(status_code=400, detail="Transaction already executed")
        
        # Check if the seller is the one who created the transaction
        if record["fields"].get("Seller") != data["seller"]:
            raise HTTPException(status_code=403, detail="Only the seller can cancel this transaction")
        
        # Delete the transaction
        transactions_table.delete(transaction_id)
        
        return {"success": True, "message": "Transaction cancelled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to cancel transaction: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)
