from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pyairtable import Api, Table
import os
import sys
import traceback
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
    email: str = None

# Define response models
class WalletResponse(BaseModel):
    id: str
    wallet_address: str
    compute_amount: float = None
    user_name: str = None
    email: str = None

# Add these new models
class LandRequest(BaseModel):
    land_id: str
    wallet_address: str
    historical_name: str = None
    english_name: str = None
    description: str = None

class LandResponse(BaseModel):
    id: str
    land_id: str
    wallet_address: str
    historical_name: str = None
    english_name: str = None
    description: str = None

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
            # Return existing record
            record = existing_records[0]
            print(f"Found existing wallet record: {record['id']}")
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "compute_amount": record["fields"].get("ComputeAmount", 0),
                "user_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None)
            }
        
        # Create new record
        fields = {
            "Wallet": wallet_data.wallet_address
        }
        
        if wallet_data.compute_amount is not None:
            fields["ComputeAmount"] = wallet_data.compute_amount
            
        if wallet_data.user_name:
            fields["Username"] = wallet_data.user_name
            
        if wallet_data.email:
            fields["Email"] = wallet_data.email
        
        print(f"Creating new wallet record with fields: {fields}")
        record = users_table.create(fields)
        print(f"Created new wallet record: {record['id']}")
        
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "compute_amount": record["fields"].get("ComputeAmount", 0),
            "user_name": record["fields"].get("Username", None),
            "email": record["fields"].get("Email", None)
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
            "email": record["fields"].get("Email", None)
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
                "email": updated_record["fields"].get("Email", None)
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
                "email": record["fields"].get("Email", None)
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
    
    if not land_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
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
                "wallet_address": record["fields"].get("Wallet", ""),
                "historical_name": record["fields"].get("HistoricalName", None),
                "english_name": record["fields"].get("EnglishName", None),
                "description": record["fields"].get("Description", None)
            }
        
        # Create new record
        fields = {
            "LandId": land_data.land_id,
            "Wallet": land_data.wallet_address
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
