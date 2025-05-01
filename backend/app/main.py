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

# Add the current directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from user_utils import find_user_by_identifier, update_compute_balance, transfer_compute

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
    color: str = None

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
        # Check if wallet already exists - try multiple search approaches
        existing_records = None
        
        # First try exact wallet match
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = users_table.all(formula=formula)
        
        # If not found and we have a username, try username match
        if not existing_records and wallet_data.user_name:
            formula = f"{{Username}}='{wallet_data.user_name}'"
            print(f"Searching for username with formula: {formula}")
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
                
            # Always update color field if provided, even if null/empty
            if wallet_data.color is not None:
                update_fields["Color"] = wallet_data.color
            
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
                "coat_of_arms_image": record["fields"].get("CoatOfArmsImage", None),
                "color": record["fields"].get("Color", "#8B4513")
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
        
        # Always include color field if provided, even if null/empty
        if wallet_data.color is not None:
            fields["Color"] = wallet_data.color
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
            "coat_of_arms_image": record["fields"].get("CoatOfArmsImage", None),
            "color": record["fields"].get("Color", "#8B4513")
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
        # Normalize the wallet address to lowercase for case-insensitive comparison
        normalized_address = wallet_address.lower()
        
        # First try to find by wallet address (case insensitive)
        all_users = users_table.all()
        matching_records = [
            record for record in all_users 
            if record["fields"].get("Wallet", "").lower() == normalized_address or
               record["fields"].get("Username", "").lower() == normalized_address
        ]
        
        if not matching_records:
            raise HTTPException(status_code=404, detail="Wallet or user not found")
        
        record = matching_records[0]
        print(f"Found user record: {record['id']}")
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

@app.post("/api/transfer-compute")
async def transfer_compute_endpoint(wallet_data: WalletRequest):
    """Transfer compute resources for a wallet"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if wallet_data.compute_amount is None or wallet_data.compute_amount <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    try:
        # Normalize the wallet address to lowercase for case-insensitive comparison
        normalized_address = wallet_data.wallet_address.lower()
        
        # Get all users and find matching record
        all_users = users_table.all()
        matching_records = [
            record for record in all_users 
            if record["fields"].get("Wallet", "").lower() == normalized_address or
               record["fields"].get("Username", "").lower() == normalized_address
        ]
        
        # Log the incoming amount for debugging
        print(f"Received compute transfer request: {wallet_data.compute_amount} COMPUTE")
        
        # Use the full amount without any conversion
        transfer_amount = wallet_data.compute_amount
        
        if matching_records:
            # Update existing record
            record = matching_records[0]
            current_amount = record["fields"].get("ComputeAmount", 0)
            new_amount = current_amount + transfer_amount
            
            print(f"Updating wallet {record['id']} compute amount from {current_amount} to {new_amount}")
            updated_record = users_table.update(record["id"], {
                "ComputeAmount": new_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "AssetId": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.datetime.now().toISOString(),
                    "UpdatedAt": datetime.datetime.now().toISOString(),
                    "ExecutedAt": datetime.datetime.now().toISOString(),
                    "Notes": json.dumps({
                        "operation": "deposit",
                        "method": "direct"
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
            
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
            print(f"Creating new wallet record with compute amount {transfer_amount}")
            record = users_table.create({
                "Wallet": wallet_data.wallet_address,
                "ComputeAmount": transfer_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "AssetId": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.datetime.now().toISOString(),
                    "UpdatedAt": datetime.datetime.now().toISOString(),
                    "ExecutedAt": datetime.datetime.now().toISOString(),
                    "Notes": json.dumps({
                        "operation": "deposit",
                        "method": "direct",
                        "new_user": True
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "compute_amount": record["fields"].get("ComputeAmount", 0),
                "user_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None),
                "family_motto": record["fields"].get("FamilyMotto", None)
            }
    except Exception as e:
        error_msg = f"Failed to transfer compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/withdraw-compute")
async def withdraw_compute(wallet_data: WalletRequest):
    """Withdraw compute resources from a wallet"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if wallet_data.compute_amount is None or wallet_data.compute_amount <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    try:
        # Check if wallet exists
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = users_table.all(formula=formula)
        
        if not existing_records:
            raise HTTPException(status_code=404, detail="Wallet not found")
        
        # Get current compute amount
        record = existing_records[0]
        current_amount = record["fields"].get("ComputeAmount", 0)
        
        # Check if user has enough compute to withdraw
        if current_amount < wallet_data.compute_amount:
            raise HTTPException(status_code=400, detail="Insufficient compute balance")
        
        # Calculate new amount
        new_amount = current_amount - wallet_data.compute_amount
        
        # Update the record
        print(f"Withdrawing {wallet_data.compute_amount} compute from wallet {record['id']}")
        print(f"Updating compute amount from {current_amount} to {new_amount}")
        
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
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to withdraw compute: {str(e)}"
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
            "User": owner,
            "Wallet": owner  # Store in both fields for consistency
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
            owner = fields.get('User', '')
            
            # If we have an owner, try to get their username
            owner_username = owner
            if owner:
                # Look up the user to get their username
                user_formula = f"{{Wallet}}='{owner}'"
                user_records = users_table.all(formula=user_formula)
                if user_records:
                    owner_username = user_records[0]['fields'].get('Username', owner)
            
            land_data = {
                'id': fields.get('LandId', ''),
                'owner': owner_username,  # Use username instead of wallet address
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

@app.get("/api/lands/basic")
async def get_lands_basic():
    """Get all lands with their owners from Airtable (basic version without user lookups)."""
    try:
        print("Fetching basic land ownership data from Airtable...")
        
        # Fetch all records from the LANDS table
        records = lands_table.all()
        
        # Format the response with minimal data
        lands = []
        for record in records:
            fields = record['fields']
            land_data = {
                'id': fields.get('LandId', ''),
                'owner': fields.get('User', '')  # Just return the raw owner value
            }
            lands.append(land_data)
        
        print(f"Found {len(lands)} land records")
        return lands
    except Exception as e:
        error_msg = f"Error fetching basic land data: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/land/{land_id}/update-owner")
async def update_land_owner(land_id: str, data: dict):
    """Update the owner of a land record"""
    
    if not data.get("owner"):
        raise HTTPException(status_code=400, detail="Owner is required")
    
    try:
        # Check if land exists
        formula = f"{{LandId}}='{land_id}'"
        print(f"Searching for land with formula: {formula}")
        existing_records = lands_table.all(formula=formula)
        
        if existing_records:
            # Update existing record
            record = existing_records[0]
            print(f"Found existing land record: {record['id']}")
            
            # Update the owner
            updated_record = lands_table.update(record["id"], {
                "User": data["owner"],
                "Wallet": data.get("wallet", data["owner"])  # Use wallet if provided, otherwise use owner
            })
            
            return {
                "id": updated_record["id"],
                "land_id": updated_record["fields"].get("LandId", ""),
                "user": updated_record["fields"].get("User", ""),
                "wallet_address": updated_record["fields"].get("Wallet", ""),
                "historical_name": updated_record["fields"].get("HistoricalName", None),
                "english_name": updated_record["fields"].get("EnglishName", None),
                "description": updated_record["fields"].get("Description", None)
            }
        else:
            # Create new record
            fields = {
                "LandId": land_id,
                "User": data["owner"],
                "Wallet": data.get("wallet", data["owner"])  # Use wallet if provided, otherwise use owner
            }
            
            # Add optional fields if provided
            if data.get("historical_name"):
                fields["HistoricalName"] = data["historical_name"]
                
            if data.get("english_name"):
                fields["EnglishName"] = data["english_name"]
                
            if data.get("description"):
                fields["Description"] = data["description"]
            
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
        error_msg = f"Failed to update land owner: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/direct-land-update")
async def direct_land_update(data: dict):
    """Direct update of land ownership - simplified endpoint for emergency updates"""
    
    if not data.get("land_id"):
        raise HTTPException(status_code=400, detail="Land ID is required")
    
    if not data.get("owner"):
        raise HTTPException(status_code=400, detail="Owner is required")
    
    try:
        # Check if land exists
        formula = f"{{LandId}}='{data['land_id']}'"
        print(f"Searching for land with formula: {formula}")
        existing_records = lands_table.all(formula=formula)
        
        if existing_records:
            # Update existing record
            record = existing_records[0]
            print(f"Found existing land record: {record['id']}")
            
            # Update the owner
            updated_record = lands_table.update(record["id"], {
                "User": data["owner"],
                "Wallet": data.get("wallet", data["owner"])  # Use wallet if provided, otherwise use owner
            })
            
            return {
                "success": True,
                "message": f"Land {data['land_id']} owner updated to {data['owner']}",
                "id": updated_record["id"]
            }
        else:
            # Create new record
            fields = {
                "LandId": data["land_id"],
                "User": data["owner"],
                "Wallet": data.get("wallet", data["owner"])  # Use wallet if provided, otherwise use owner
            }
            
            print(f"Creating new land record with fields: {fields}")
            record = lands_table.create(fields)
            print(f"Created new land record: {record['id']}")
            
            return {
                "success": True,
                "message": f"Land {data['land_id']} record created with owner {data['owner']}",
                "id": record["id"]
            }
    except Exception as e:
        error_msg = f"Failed to update land owner: {str(e)}"
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
        
        # Log the possible IDs we're checking
        print(f"Checking possible land IDs: {possible_ids}")
        
        # Create a formula that checks all possible ID formats
        id_conditions = []
        for id in possible_ids:
            id_conditions.append(f"{{AssetId}}='{id}'")
        
        formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land', {{ExecutedAt}}=BLANK())"
        
        print(f"Searching for land transaction with formula: {formula}")
        records = transactions_table.all(formula=formula)
        
        if not records:
            # Try a more lenient search without the ExecutedAt condition
            lenient_formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land')"
            print(f"No active transaction found. Trying more lenient search: {lenient_formula}")
            records = transactions_table.all(formula=lenient_formula)
            
            if not records:
                print(f"No transaction found for land {land_id}")
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
        
        # Get the seller and price from the transaction
        seller = record["fields"].get("Seller", "")
        price = record["fields"].get("Price", 0)
        buyer = data["buyer"]
        
        # Normalize addresses for case-insensitive comparison
        normalized_buyer = buyer.lower()
        normalized_seller = seller.lower()
        
        # Transfer the price from buyer to seller first to ensure funds are available
        if price > 0 and seller and buyer:
            try:
                # Get all users for lookup
                all_users = users_table.all()
                
                # Find buyer record
                buyer_records = [
                    record for record in all_users 
                    if record["fields"].get("Wallet", "").lower() == normalized_buyer or
                       record["fields"].get("Username", "").lower() == normalized_buyer
                ]
                
                if not buyer_records:
                    raise HTTPException(status_code=404, detail=f"Buyer not found: {buyer}")
                
                buyer_record = buyer_records[0]
                buyer_compute = buyer_record["fields"].get("ComputeAmount", 0)
                
                # Check if buyer has enough compute
                if buyer_compute < price:
                    raise HTTPException(status_code=400, detail=f"Buyer does not have enough compute. Required: {price}, Available: {buyer_compute}")
                
                # Find seller record
                seller_records = [
                    record for record in all_users 
                    if record["fields"].get("Wallet", "").lower() == normalized_seller or
                       record["fields"].get("Username", "").lower() == normalized_seller
                ]
                
                if not seller_records:
                    raise HTTPException(status_code=404, detail=f"Seller not found: {seller}")
                
                seller_record = seller_records[0]
                seller_compute = seller_record["fields"].get("ComputeAmount", 0)
                
                print(f"Transferring {price} compute from {buyer} (balance: {buyer_compute}) to {seller} (balance: {seller_compute})")
                
                # Create a transaction log entry before making changes
                transaction_log = {
                    "transaction_id": transaction_id,
                    "buyer": buyer,
                    "seller": seller,
                    "price": price,
                    "buyer_before": buyer_compute,
                    "seller_before": seller_compute,
                    "buyer_after": buyer_compute - price,
                    "seller_after": seller_compute + price,
                    "timestamp": datetime.datetime.now().isoformat(),
                    "status": "pending"
                }
                
                # Update buyer's compute amount
                users_table.update(buyer_record["id"], {
                    "ComputeAmount": buyer_compute - price
                })
                
                # Update seller's compute amount
                users_table.update(seller_record["id"], {
                    "ComputeAmount": seller_compute + price
                })
                
                # Update transaction log status
                transaction_log["status"] = "completed"
                
                # Add transaction log to TRANSACTIONS table
                try:
                    transactions_table.create({
                        "Type": "transfer",
                        "AssetId": "compute_token",
                        "Seller": seller,
                        "Buyer": buyer,
                        "Price": price,
                        "CreatedAt": datetime.datetime.now().isoformat(),
                        "UpdatedAt": datetime.datetime.now().isoformat(),
                        "ExecutedAt": datetime.datetime.now().isoformat(),
                        "Notes": json.dumps(transaction_log)
                    })
                except Exception as tx_log_error:
                    print(f"Warning: Failed to create transaction log: {str(tx_log_error)}")
                
                print(f"Transfer complete. New balances - Buyer: {buyer_compute - price}, Seller: {seller_compute + price}")
            except Exception as balance_error:
                # Log the error but don't fail the transaction
                print(f"ERROR updating compute balances: {str(balance_error)}")
                traceback.print_exc(file=sys.stdout)
                
                # Create a record of the failed transaction for later reconciliation
                try:
                    failed_transaction = {
                        "transaction_id": transaction_id,
                        "buyer": buyer,
                        "seller": seller,
                        "price": price,
                        "error": str(balance_error),
                        "timestamp": datetime.datetime.now().isoformat(),
                        "type": "compute_transfer_error"
                    }
                    
                    # Add to TRANSACTIONS table as a failed transaction
                    transactions_table.create({
                        "Type": "error",
                        "AssetId": "compute_token",
                        "Seller": seller,
                        "Buyer": buyer,
                        "Price": price,
                        "CreatedAt": datetime.datetime.now().isoformat(),
                        "UpdatedAt": datetime.datetime.now().isoformat(),
                        "ExecutedAt": datetime.datetime.now().isoformat(),
                        "Notes": json.dumps(failed_transaction)
                    })
                    
                    print(f"Saved failed transaction record for later reconciliation")
                except Exception as record_error:
                    print(f"ERROR saving failed transaction record: {str(record_error)}")
                    traceback.print_exc(file=sys.stdout)
            
            print(f"Transferred {price} compute from {buyer} to {seller}")
        
        # Update the land ownership if it's a land transaction
        if record["fields"].get("Type") == "land" and record["fields"].get("AssetId"):
            land_id = record["fields"].get("AssetId")
            print(f"Updating land ownership for asset {land_id} to {buyer}")
            
            # Check if land exists in Airtable
            try:
                land_formula = f"{{LandId}}='{land_id}'"
                print(f"Searching for land with formula: {land_formula}")
                land_records = lands_table.all(formula=land_formula)
                
                if land_records:
                    # Update existing land record
                    land_record = land_records[0]
                    print(f"Found existing land record: {land_record['id']}")
                    
                    # Update the owner
                    lands_table.update(land_record["id"], {
                        "User": buyer,
                        "Wallet": buyer
                    })
                    print(f"Updated land owner in Airtable to {buyer}")
                else:
                    # Create new land record
                    print(f"Land record not found, creating new record for {land_id}")
                    lands_table.create({
                        "LandId": land_id,
                        "User": buyer,
                        "Wallet": buyer
                    })
                    print(f"Created new land record with owner {buyer}")
            except Exception as land_error:
                print(f"ERROR updating land ownership in Airtable: {str(land_error)}")
                traceback.print_exc(file=sys.stdout)
                # Continue execution even if land update fails
        
        # Update the transaction with buyer and executed_at timestamp
        now = datetime.datetime.now().isoformat()
        updated_record = transactions_table.update(transaction_id, {
            "Buyer": buyer,
            "ExecutedAt": now,
            "UpdatedAt": now
        })
        
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
        prompt = f"Create a perfectly centered heraldic asset of a detailed 15th century Venetian coat of arms with these elements: {data['description']}. The coat of arms should be centered in the frame with proper proportions. Style: historical, realistic, detailed heraldry, Renaissance Venetian style, gold leaf accents, rich colors, Quattrocento, Venetian Republic, Doge's Palace aesthetic, Byzantine influence, Gothic elements, XV century Italian heraldry. The image should be a clean, professional asset with the coat of arms as the central focus, not a photograph. Include a decorative shield shape with the heraldic elements properly arranged within it."
        
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

@app.post("/api/transfer-compute-solana")
async def transfer_compute_solana(wallet_data: WalletRequest):
    """Transfer compute resources for a wallet using Solana blockchain"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if wallet_data.compute_amount is None or wallet_data.compute_amount <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    try:
        # Check if wallet exists - try multiple search approaches
        existing_records = None
        
        # First try exact wallet match
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = users_table.all(formula=formula)
        
        # If not found, try username match
        if not existing_records:
            formula = f"{{Username}}='{wallet_data.wallet_address}'"
            print(f"Searching for username with formula: {formula}")
            existing_records = users_table.all(formula=formula)
        
        # Log the incoming amount for debugging
        print(f"Received compute transfer request: {wallet_data.compute_amount} COMPUTE")
        
        # Use the full amount without any conversion
        transfer_amount = wallet_data.compute_amount
        
        # Call the Node.js script to perform the Solana transfer
        import subprocess
        import json
        import time
        
        # Create a temporary JSON file with the transfer details
        transfer_data = {
            "recipient": wallet_data.wallet_address,
            "amount": transfer_amount,
            "timestamp": time.time()
        }
        
        with open("transfer_data.json", "w") as f:
            json.dump(transfer_data, f)
        
        # Call the Node.js script to perform the transfer with timeout
        try:
            result = subprocess.run(
                ["node", "scripts/transfer-compute.js"],
                capture_output=True,
                text=True,
                timeout=30  # 30 second timeout
            )
        except subprocess.TimeoutExpired:
            print("Solana transfer timed out after 30 seconds")
            raise HTTPException(status_code=504, detail="Solana transfer timed out")
        
        if result.returncode != 0:
            print(f"Error executing Solana transfer: {result.stderr}")
            error_detail = result.stderr or "Unknown error"
            if "Insufficient balance" in error_detail:
                raise HTTPException(status_code=400, detail="Insufficient treasury balance to complete transfer")
            raise HTTPException(status_code=500, detail=f"Failed to execute Solana transfer: {error_detail}")
        
        # Parse the result to get the transaction signature
        try:
            transfer_result = json.loads(result.stdout)
            
            if not transfer_result.get("success", False):
                error_msg = transfer_result.get("error", "Unknown error")
                error_code = transfer_result.get("errorCode", "UNKNOWN")
                
                if "Insufficient" in error_msg:
                    raise HTTPException(status_code=400, detail=f"Insufficient funds: {error_msg}")
                    
                raise HTTPException(status_code=500, detail=f"Transfer failed: {error_msg} (Code: {error_code})")
                
            signature = transfer_result.get("signature")
            print(f"Solana transfer successful: {signature}")
        except json.JSONDecodeError:
            print(f"Error parsing transfer result: {result.stdout}")
            raise HTTPException(status_code=500, detail="Failed to parse transfer result")
        
        if existing_records:
            # Update existing record
            record = existing_records[0]
            current_amount = record["fields"].get("ComputeAmount", 0)
            new_amount = current_amount + transfer_amount
            
            print(f"Updating wallet {record['id']} compute amount from {current_amount} to {new_amount}")
            updated_record = users_table.update(record["id"], {
                "ComputeAmount": new_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "AssetId": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.datetime.now().isoformat(),
                    "UpdatedAt": datetime.datetime.now().isoformat(),
                    "ExecutedAt": datetime.datetime.now().isoformat(),
                    "Notes": json.dumps({
                        "signature": signature,
                        "blockchain": "solana",
                        "token": "COMPUTE"
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
                # Continue even if transaction record creation fails
            
            return {
                "id": updated_record["id"],
                "wallet_address": updated_record["fields"].get("Wallet", ""),
                "compute_amount": updated_record["fields"].get("ComputeAmount", 0),
                "user_name": updated_record["fields"].get("Username", None),
                "email": updated_record["fields"].get("Email", None),
                "family_motto": updated_record["fields"].get("FamilyMotto", None),
                "coat_of_arms_image": updated_record["fields"].get("CoatOfArmsImage", None),
                "transaction_signature": signature,
                "block_time": transfer_result.get("blockTime")
            }
        else:
            # Create new record
            print(f"Creating new wallet record with compute amount {transfer_amount}")
            record = users_table.create({
                "Wallet": wallet_data.wallet_address,
                "ComputeAmount": transfer_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "AssetId": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.datetime.now().isoformat(),
                    "UpdatedAt": datetime.datetime.now().isoformat(),
                    "ExecutedAt": datetime.datetime.now().isoformat(),
                    "Notes": json.dumps({
                        "signature": signature,
                        "blockchain": "solana",
                        "token": "COMPUTE"
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
                # Continue even if transaction record creation fails
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "compute_amount": record["fields"].get("ComputeAmount", 0),
                "user_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None),
                "family_motto": record["fields"].get("FamilyMotto", None),
                "transaction_signature": signature,
                "block_time": transfer_result.get("blockTime")
            }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to transfer compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

# Add a new endpoint for direct transfers between users
@app.post("/api/transfer-compute-between-users")
async def transfer_compute_between_users(data: dict):
    """Transfer compute directly between two users"""
    
    if not data.get("from_wallet"):
        raise HTTPException(status_code=400, detail="Sender wallet address is required")
    
    if not data.get("to_wallet"):
        raise HTTPException(status_code=400, detail="Recipient wallet address is required")
    
    if not data.get("compute_amount") or data.get("compute_amount") <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    try:
        # Use the utility function to handle the transfer
        from_wallet = data["from_wallet"]
        to_wallet = data["to_wallet"]
        amount = data["compute_amount"]
        
        # Perform the transfer
        from_record, to_record = transfer_compute(users_table, from_wallet, to_wallet, amount)
        
        # Log the transaction
        try:
            transaction_record = transactions_table.create({
                "Type": "transfer",
                "AssetId": "compute_token",
                "Seller": to_wallet,  # Recipient is the "seller" in this context
                "Buyer": from_wallet,  # Sender is the "buyer" in this context
                "Price": amount,
                "CreatedAt": datetime.datetime.now().isoformat(),
                "UpdatedAt": datetime.datetime.now().isoformat(),
                "ExecutedAt": datetime.datetime.now().isoformat(),
                "Notes": json.dumps({
                    "operation": "direct_transfer",
                    "from_wallet": from_wallet,
                    "to_wallet": to_wallet,
                    "amount": amount
                })
            })
            print(f"Created transaction record: {transaction_record['id']}")
        except Exception as tx_error:
            print(f"Warning: Failed to create transaction record: {str(tx_error)}")
        
        return {
            "success": True,
            "from_wallet": from_wallet,
            "to_wallet": to_wallet,
            "amount": amount,
            "from_balance": from_record["fields"].get("ComputeAmount", 0),
            "to_balance": to_record["fields"].get("ComputeAmount", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to transfer compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/withdraw-compute-solana")
async def withdraw_compute_solana(wallet_data: WalletRequest):
    """Withdraw compute resources from a wallet using Solana blockchain"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if wallet_data.compute_amount is None or wallet_data.compute_amount <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    try:
        # Check if wallet exists - try multiple search approaches
        existing_records = None
        
        # First try exact wallet match
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = users_table.all(formula=formula)
        
        # If not found, try username match
        if not existing_records:
            formula = f"{{Username}}='{wallet_data.wallet_address}'"
            print(f"Searching for username with formula: {formula}")
            existing_records = users_table.all(formula=formula)
        
        if not existing_records:
            raise HTTPException(status_code=404, detail="Wallet not found")
        
        # Get current compute amount
        record = existing_records[0]
        current_amount = record["fields"].get("ComputeAmount", 0)
        
        # Check if user has enough compute to withdraw
        if current_amount < wallet_data.compute_amount:
            raise HTTPException(status_code=400, detail="Insufficient compute balance")
        
        # Calculate new amount
        new_amount = current_amount - wallet_data.compute_amount
        
        # Call the Node.js script to perform the Solana transfer
        import subprocess
        import json
        import time
        import base64
        
        # Create a message for the user to sign (in a real app)
        message = f"Authorize withdrawal of {wallet_data.compute_amount} COMPUTE tokens at {time.time()}"
        message_b64 = base64.b64encode(message.encode()).decode()
        
        # Create a temporary JSON file with the withdrawal details
        transfer_data = {
            "user": wallet_data.wallet_address,
            "amount": wallet_data.compute_amount,
            "message": message,
            # In a real app, the frontend would provide this signature
            # "signature": user_signature_from_frontend
        }
        
        with open("withdraw_data.json", "w") as f:
            json.dump(transfer_data, f)
        
        # Call the Node.js script to prepare the withdrawal transaction
        result = subprocess.run(
            ["node", "scripts/withdraw-compute.js"],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"Error preparing Solana withdrawal: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Failed to prepare Solana withdrawal: {result.stderr}")
        
        # Parse the result
        try:
            transfer_result = json.loads(result.stdout)
            
            if not transfer_result.get("success", False):
                error_msg = transfer_result.get("error", "Unknown error")
                raise HTTPException(status_code=400, detail=error_msg)
                
            # In a real application, we would return the serialized transaction
            # for the frontend to have the user sign it
            serialized_tx = transfer_result.get("serializedTransaction")
            
            if transfer_result.get("status") == "pending_signature":
                # In a real app, we would wait for the frontend to submit the signed transaction
                # For now, we'll simulate a successful transaction
                signature = "simulated_" + base64.b64encode(os.urandom(32)).decode()
                
                # Update the record in Airtable
                print(f"Withdrawing {wallet_data.compute_amount} compute from wallet {record['id']}")
                print(f"Updating compute amount from {current_amount} to {new_amount}")
                
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
                    "coat_of_arms_image": updated_record["fields"].get("CoatOfArmsImage", None),
                    "transaction_signature": signature,
                    "transaction_details": {
                        "from_wallet": wallet_data.wallet_address,
                        "to_wallet": "Treasury",
                        "amount": wallet_data.compute_amount,
                        "status": "completed",
                        "message": message,
                        "message_b64": message_b64,
                        # In a real app, this would be needed for the frontend
                        "serialized_transaction": serialized_tx
                    }
                }
            else:
                signature = transfer_result.get("signature")
                print(f"Solana withdrawal successful: {signature}")
            
        except json.JSONDecodeError:
            print(f"Error parsing withdrawal result: {result.stdout}")
            raise HTTPException(status_code=500, detail="Failed to parse withdrawal result")
        
        # Update the record
        print(f"Withdrawing {wallet_data.compute_amount} compute from wallet {record['id']}")
        print(f"Updating compute amount from {current_amount} to {new_amount}")
        
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
            "coat_of_arms_image": updated_record["fields"].get("CoatOfArmsImage", None),
            "transaction_signature": signature,
            "transaction_details": {
                "from_wallet": wallet_data.wallet_address,
                "to_wallet": "Treasury",
                "amount": wallet_data.compute_amount,
                "status": "completed"
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to withdraw compute: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/users/coat-of-arms")
async def get_users_coat_of_arms():
    """Get all users with their coat of arms images"""
    
    try:
        print("Fetching all users with coat of arms images...")
        # Fetch all records from the USERS table
        records = users_table.all()
        
        # Format the response
        users = []
        for record in records:
            fields = record['fields']
            if 'CoatOfArmsImage' in fields:
                user_data = {
                    'user_name': fields.get('Username', ''),
                    'first_name': fields.get('FirstName', ''),
                    'last_name': fields.get('LastName', ''),
                    'coat_of_arms_image': fields.get('CoatOfArmsImage', '')
                }
                users.append(user_data)
        
        print(f"Found {len(users)} users with coat of arms images")
        return {"success": True, "users": users}
    except Exception as e:
        error_msg = f"Error fetching users coat of arms: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/users")
async def get_users():
    """Get all users with their data"""
    
    try:
        print("Fetching all users from Airtable...")
        # Fetch all records from the USERS table
        records = users_table.all()
        
        # Format the response
        users = []
        for record in records:
            fields = record['fields']
            user_data = {
                'user_name': fields.get('Username', ''),
                'first_name': fields.get('FirstName', ''),
                'last_name': fields.get('LastName', ''),
                'wallet_address': fields.get('Wallet', ''),
                'compute_amount': fields.get('ComputeAmount', 0),
                'family_motto': fields.get('FamilyMotto', ''),
                'coat_of_arms_image': fields.get('CoatOfArmsImage', '')
            }
            users.append(user_data)
        
        print(f"Found {len(users)} user records")
        return users
    except Exception as e:
        error_msg = f"Error fetching users: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

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
