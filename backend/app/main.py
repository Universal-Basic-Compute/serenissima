from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pyairtable import Api, Table
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get Airtable credentials
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_USERS_TABLE = os.getenv("AIRTABLE_USERS_TABLE")

# Initialize Airtable
airtable = Api(AIRTABLE_API_KEY)
users_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_USERS_TABLE)

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

@app.get("/")
def read_root():
    return {"message": "Wallet Storage API is running"}

@app.post("/api/wallet", response_model=WalletResponse)
async def store_wallet(wallet_data: WalletRequest):
    """Store a wallet address in Airtable"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    # Check if wallet already exists
    existing_records = users_table.all(formula=f"{{Wallet}}='{wallet_data.wallet_address}'")
    
    if existing_records:
        # Return existing record
        record = existing_records[0]
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "compute_amount": record["fields"].get("ComputeAmount", 0),
            "user_name": record["fields"].get("Name", None),
            "email": record["fields"].get("Email", None)
        }
    
    # Create new record
    fields = {
        "Wallet": wallet_data.wallet_address
    }
    
    if wallet_data.compute_amount is not None:
        fields["ComputeAmount"] = wallet_data.compute_amount
        
    if wallet_data.user_name:
        fields["Name"] = wallet_data.user_name
        
    if wallet_data.email:
        fields["Email"] = wallet_data.email
    
    try:
        record = users_table.create(fields)
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "compute_amount": record["fields"].get("ComputeAmount", 0),
            "user_name": record["fields"].get("Name", None),
            "email": record["fields"].get("Email", None)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store wallet: {str(e)}")

@app.get("/api/wallet/{wallet_address}")
async def get_wallet(wallet_address: str):
    """Get wallet information from Airtable"""
    
    records = users_table.all(formula=f"{{Wallet}}='{wallet_address}'")
    
    if not records:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    record = records[0]
    return {
        "id": record["id"],
        "wallet_address": record["fields"].get("Wallet", ""),
        "compute_amount": record["fields"].get("ComputeAmount", 0),
        "user_name": record["fields"].get("Name", None),
        "email": record["fields"].get("Email", None)
    }

@app.post("/api/invest-compute")
async def invest_compute(wallet_data: WalletRequest):
    """Invest compute resources for a wallet"""
    
    if not wallet_data.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if wallet_data.compute_amount is None or wallet_data.compute_amount <= 0:
        raise HTTPException(status_code=400, detail="Compute amount must be greater than 0")
    
    # Check if wallet exists
    existing_records = users_table.all(formula=f"{{Wallet}}='{wallet_data.wallet_address}'")
    
    try:
        if existing_records:
            # Update existing record
            record = existing_records[0]
            current_amount = record["fields"].get("ComputeAmount", 0)
            new_amount = current_amount + wallet_data.compute_amount
            
            updated_record = users_table.update(record["id"], {
                "ComputeAmount": new_amount
            })
            
            return {
                "id": updated_record["id"],
                "wallet_address": updated_record["fields"].get("Wallet", ""),
                "compute_amount": updated_record["fields"].get("ComputeAmount", 0),
                "user_name": updated_record["fields"].get("Name", None),
                "email": updated_record["fields"].get("Email", None)
            }
        else:
            # Create new record
            record = users_table.create({
                "Wallet": wallet_data.wallet_address,
                "ComputeAmount": wallet_data.compute_amount
            })
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "compute_amount": record["fields"].get("ComputeAmount", 0),
                "user_name": record["fields"].get("Name", None),
                "email": record["fields"].get("Email", None)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to invest compute: {str(e)}")
