from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pyairtable import Api, Table
import shutil
import os
import sys
import traceback
import json
import requests
import time
from datetime import datetime
from fastapi.responses import JSONResponse, FileResponse
from dotenv import load_dotenv
import pathlib
from typing import Optional, List, Dict, Any # Added Dict, Any

# For logging and retry strategy
import logging
import pytz
from urllib3.util.retry import Retry
# from colorama import Fore, Style # No longer needed here directly

# Import helpers
from backend.engine.utils.activity_helpers import _escape_airtable_value, LogColors, log_header # Added log_header

# Add the current directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from citizen_utils import find_citizen_by_identifier, update_compute_balance, transfer_compute

# Load environment variables
load_dotenv()

# Import the specific scheduler function for background execution
from app.scheduler import start_scheduler_background 
from contextlib import asynccontextmanager

# Get API key for image generation
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY", "")

# Get Airtable credentials
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_CITIZENS_TABLE = os.getenv("AIRTABLE_CITIZENS_TABLE", "Citizens")  # Default to "Citizens" if not set

# Print debug info
print(f"Airtable API Key: {'Set' if AIRTABLE_API_KEY else 'Not set'}")
print(f"Airtable Base ID: {'Set' if AIRTABLE_BASE_ID else 'Not set'}")
print(f"Airtable Citizens Table: {AIRTABLE_CITIZENS_TABLE}")

# Check if credentials are set
if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID or not AIRTABLE_CITIZENS_TABLE:
    print("ERROR: Airtable credentials are not properly set in .env file")
    print("Please make sure AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_CITIZENS_TABLE are set")

# Initialize Airtable with error handling
try:
    airtable = Api(AIRTABLE_API_KEY)
    citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_CITIZENS_TABLE)
    # Test the connection with the primary CITIZENS table
    print("Testing Airtable connection with CITIZENS table...")
    test_records = citizens_table.all(limit=1) # This will raise an exception if connection fails
    print(f"Airtable connection successful. CITIZENS table test found {len(test_records)} record(s).")
except Exception as e:
    print(f"ERROR initializing Airtable or testing CITIZENS table: {str(e)}")
    traceback.print_exc(file=sys.stdout)
    # Depending on severity, you might want to exit or prevent app startup
    # For now, it will continue and other table initializations might also log errors.

# Initialize Airtable for LANDS table
AIRTABLE_LANDS_TABLE = os.getenv("AIRTABLE_LANDS_TABLE", "LANDS")
try:
    lands_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_LANDS_TABLE)
    print(f"Initialized Airtable LANDS table object: {AIRTABLE_LANDS_TABLE}")
except Exception as e:
    print(f"ERROR initializing Airtable LANDS table object: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Initialize Airtable for TRANSACTIONS table
AIRTABLE_TRANSACTIONS_TABLE = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS")
try:
    transactions_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TRANSACTIONS_TABLE)
    print(f"Initialized Airtable TRANSACTIONS table object: {AIRTABLE_TRANSACTIONS_TABLE}")
except Exception as e:
    print(f"ERROR initializing Airtable TRANSACTIONS table object: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Initialize Airtable for CONTRACTS table
AIRTABLE_CONTRACTS_TABLE_NAME = os.getenv("AIRTABLE_CONTRACTS_TABLE", "CONTRACTS")
try:
    contracts_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_CONTRACTS_TABLE_NAME)
    print(f"Initialized Airtable CONTRACTS table object: {AIRTABLE_CONTRACTS_TABLE_NAME}")
    # No explicit test call for this table to reduce startup logs
except Exception as e:
    print(f"ERROR initializing Airtable CONTRACTS table object: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Lifespan context manager for FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Code to run on startup
    print("FastAPI app startup: Initializing scheduler...")
    # Pass forced_hour=None, or get from env var if needed for API context
    start_scheduler_background(forced_hour=None) 
    print("FastAPI app startup: Scheduler initialization attempted.")
    yield
    # Code to run on shutdown (optional, as daemon thread will exit)
    print("FastAPI app shutdown.")

# Create FastAPI app with lifespan manager
app = FastAPI(title="Wallet Storage API", lifespan=lifespan)

# Setup logger for this module
log = logging.getLogger(__name__)

# Define log_header function (or import if it's moved to a central utility)
# For now, defining it here if it's specific to main.py's direct use
# If it's meant to be globally available, it should be in a shared utils module
# and imported. Given the previous context, it was in citizen_general_activities.py
# but activity_helpers.py is more suitable for such a utility.
# Let's assume it's NOT in activity_helpers.py for now and define a simple one.
# If it IS in activity_helpers.py, the import above should be:
# from backend.engine.utils.activity_helpers import _escape_airtable_value, LogColors, log_header

# log_header is now imported from activity_helpers.py

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://api.serenissima.ai", "https://serenissima.ai", "https://ideogram.ai"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models for API Requests/Responses ---
class TryCreateActivityRequest(BaseModel):
    citizenUsername: str
    activityType: str
    activityParameters: Optional[Dict[str, Any]] = None

class ActivityResponseItem(BaseModel): # Structure of an activity field for response
    ActivityId: Optional[str] = None
    Type: Optional[str] = None
    Citizen: Optional[str] = None
    FromBuilding: Optional[str] = None
    ToBuilding: Optional[str] = None
    ContractId: Optional[str] = None
    Resources: Optional[str] = None # JSON string
    TransportMode: Optional[str] = None
    Path: Optional[str] = None # JSON string
    Transporter: Optional[str] = None
    Status: Optional[str] = None
    Title: Optional[str] = None
    Description: Optional[str] = None
    Thought: Optional[str] = None
    Notes: Optional[str] = None # JSON string or simple text
    # Details: Optional[str] = None # JSON string - Replaced by Notes
    Priority: Optional[int] = None
    CreatedAt: Optional[str] = None
    StartDate: Optional[str] = None
    EndDate: Optional[str] = None
    # Add other fields from Airtable ACTIVITIES table as needed

class TryCreateActivityResponse(BaseModel):
    success: bool
    message: str
    activity: Optional[ActivityResponseItem] = None # This will be the 'fields' part of the Airtable record
    reason: Optional[str] = None


# Define request models
class WalletRequest(BaseModel):
    wallet_address: str
    ducats: float = None
    citizen_name: str = None
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
    ducats: float = None
    citizen_name: str = None
    first_name: str = None  # Add this field
    last_name: str = None   # Add this field
    email: str = None
    family_coat_of_arms: str = None
    family_motto: str = None
    coat_of_arms_image: str = None

# Add these new models
class LandRequest(BaseModel):
    land_id: str
    citizen: str = None
    wallet_address: str = None  # Keep for backward compatibility
    historical_name: str = None
    english_name: str = None
    description: str = None

class LandResponse(BaseModel):
    id: str
    land_id: str
    citizen: str = None
    wallet_address: str = None  # Keep for backward compatibility
    historical_name: str = None
    english_name: str = None
    description: str = None

class TransactionRequest(BaseModel):
    type: str  # 'land', 'bridge', etc.
    asset: str
    seller: str
    buyer: str = None
    price: float
    historical_name: str = None
    english_name: str = None
    description: str = None

class TransactionResponse(BaseModel):
    id: str
    type: str
    asset: str
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

# Variable d'environnement pour le chemin du disque persistant
# Exemple de valeur sur Render: /var/data/serenissima_assets
PERSISTENT_ASSETS_PATH_ENV = os.getenv("PERSISTENT_ASSETS_PATH")
# Clé API pour sécuriser le téléversement d'assets
UPLOAD_API_KEY_ENV = os.getenv("UPLOAD_API_KEY")

@app.get("/public_assets/{asset_path:path}")
async def serve_public_asset(asset_path: str):
    if not PERSISTENT_ASSETS_PATH_ENV:
        print("ERREUR CRITIQUE: La variable d'environnement PERSISTENT_ASSETS_PATH n'est pas définie pour le backend.")
        raise HTTPException(status_code=500, detail="Configuration du serveur incorrecte pour les assets.")

    base_path = pathlib.Path(PERSISTENT_ASSETS_PATH_ENV)
    # Nettoyer et normaliser le chemin demandé pour la sécurité
    # Empêche les chemins comme "../../../etc/passwd"
    # asset_path vient de l'URL, il faut donc être prudent.
    # pathlib.Path.joinpath() ne permet pas de sortir du répertoire de base si le chemin de base est absolu
    # et que les composants suivants ne sont pas absolus.
    # Cependant, une double vérification est toujours une bonne pratique.

    # Construire le chemin complet
    file_path = base_path.joinpath(asset_path).resolve()

    # Vérification de sécurité : s'assurer que le chemin résolu est toujours DANS le répertoire de base.
    if not file_path.is_relative_to(base_path.resolve()):
        print(f"Tentative de traversée de répertoire bloquée : {asset_path}")
        raise HTTPException(status_code=403, detail="Accès interdit.")

    if not file_path.exists() or not file_path.is_file():
        print(f"Asset non trouvé : {file_path}")
        raise HTTPException(status_code=404, detail="Asset non trouvé.")

    # FileResponse gère automatiquement le Content-Type basé sur l'extension du fichier.
    return FileResponse(path=file_path)

@app.post("/api/upload-asset")
async def upload_asset(
    file: UploadFile = File(...),
    destination_path: str = Form(""), # Chemin relatif optionnel dans le dossier des assets
    x_upload_api_key: Optional[str] = Header(None) # Clé API pour l'authentification
):
    if not PERSISTENT_ASSETS_PATH_ENV:
        print("ERREUR CRITIQUE: PERSISTENT_ASSETS_PATH n'est pas défini. Téléversement impossible.")
        raise HTTPException(status_code=500, detail="Configuration du serveur incorrecte pour le téléversement.")

    if not UPLOAD_API_KEY_ENV:
        print("ERREUR CRITIQUE: UPLOAD_API_KEY n'est pas défini. Le téléversement est désactivé.")
        raise HTTPException(status_code=503, detail="Service de téléversement non configuré.")

    if not x_upload_api_key or x_upload_api_key != UPLOAD_API_KEY_ENV:
        print(f"Tentative de téléversement non autorisée. Clé API fournie: '{x_upload_api_key}'")
        raise HTTPException(status_code=401, detail="Non autorisé.")

    try:
        # Nettoyer destination_path pour la sécurité
        # Empêcher les chemins absolus ou les traversées de répertoire
        # Normalise le chemin et supprime les ".." et "." initiaux.
        # path.normpath ne garantit pas à lui seul contre la traversée si le chemin est malveillant.
        # La vérification .is_relative_to est la plus importante.
        
        # S'assurer que destination_path est relatif et ne tente pas de sortir.
        # On ne veut pas que destination_path commence par '/' ou contienne '..' de manière à sortir.
        # pathlib.Path gère bien cela lors de la jonction si le chemin de base est absolu.
        
        # On s'assure que destination_path ne commence pas par des slashes pour éviter qu'il soit traité comme absolu.
        clean_destination_path_str = destination_path.lstrip('/')
        # On s'assure qu'il n'y a pas de ".." pour remonter.
        if ".." in pathlib.Path(clean_destination_path_str).parts:
            raise HTTPException(status_code=400, detail="Chemin de destination invalide (contient '..').")

        base_assets_path = pathlib.Path(PERSISTENT_ASSETS_PATH_ENV)
        
        # Construire le chemin de destination final
        # Si clean_destination_path_str est vide, le fichier sera à la racine de base_assets_path
        # Sinon, il sera dans le sous-dossier.
        final_dir_path = base_assets_path.joinpath(clean_destination_path_str).resolve()
        
        # Vérification de sécurité cruciale : le répertoire final doit être DANS le répertoire des assets.
        if not final_dir_path.is_relative_to(base_assets_path.resolve()):
            print(f"Tentative de traversée de répertoire bloquée pour le téléversement : {destination_path}")
            raise HTTPException(status_code=400, detail="Chemin de destination invalide.")

        # Créer les répertoires parents si nécessaire
        final_dir_path.mkdir(parents=True, exist_ok=True)
        
        # Chemin complet du fichier, y compris le nom du fichier.
        file_location = final_dir_path / file.filename
        
        # Vérification supplémentaire que file_location est toujours dans base_assets_path
        if not file_location.resolve().is_relative_to(base_assets_path.resolve()):
            print(f"Tentative de traversée de répertoire bloquée pour le nom de fichier : {file.filename}")
            raise HTTPException(status_code=400, detail="Nom de fichier invalide.")

        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
        
        # Construire le chemin relatif pour la réponse, par rapport à PERSISTENT_ASSETS_PATH_ENV
        relative_file_path = file_location.relative_to(base_assets_path)
        
        print(f"Fichier '{file.filename}' téléversé avec succès vers '{file_location}'")
        return {
            "success": True,
            "filename": file.filename,
            "saved_path": str(file_location),
            "relative_path": str(relative_file_path), # Chemin relatif pour l'accès via /public_assets/
            "content_type": file.content_type
        }
    except HTTPException:
        raise # Redéclenche les HTTPException déjà levées
    except Exception as e:
        error_msg = f"Échec du téléversement du fichier '{file.filename}': {str(e)}"
        print(f"ERREUR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

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
        existing_records = citizens_table.all(formula=formula)
        
        # If not found and we have a username, try username match
        if not existing_records and wallet_data.citizen_name:
            formula = f"{{Username}}='{wallet_data.citizen_name}'"
            print(f"Searching for username with formula: {formula}")
            existing_records = citizens_table.all(formula=formula)
        
        if existing_records:
            # Update existing record with new data
            record = existing_records[0]
            print(f"Found existing wallet record: {record['id']}")
            
            # Create update fields dictionary
            update_fields = {}
            
            if wallet_data.ducats is not None:
                update_fields["Ducats"] = wallet_data.ducats
                
            if wallet_data.citizen_name:
                update_fields["Username"] = wallet_data.citizen_name
                
            if wallet_data.first_name:
                update_fields["FirstName"] = wallet_data.first_name
                
            if wallet_data.last_name:
                update_fields["LastName"] = wallet_data.last_name
                
            if wallet_data.email:
                update_fields["Email"] = wallet_data.email
                
            if wallet_data.family_coat_of_arms:
                update_fields["CoatOfArms"] = wallet_data.family_coat_of_arms
                
            if wallet_data.family_motto:
                update_fields["FamilyMotto"] = wallet_data.family_motto
                
            # CoatOfArmsImageUrl is no longer stored in Airtable.
            # The path is constructed dynamically by the frontend.
            # The coat_of_arms_image field in the request might be used by /api/generate-coat-of-arms if it's a prompt.
                
            # Always update color field if provided, even if null/empty
            if wallet_data.color is not None:
                update_fields["Color"] = wallet_data.color
            
            # Only update if there are fields to update
            if update_fields:
                print(f"Updating wallet record with fields: {update_fields}")
                record = citizens_table.update(record["id"], update_fields)
                print(f"Updated wallet record: {record['id']}")
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "ducats": record["fields"].get("Ducats", 0),
                "citizen_name": record["fields"].get("Username", None),
                "first_name": record["fields"].get("FirstName", None),
                "last_name": record["fields"].get("LastName", None),
                "email": record["fields"].get("Email", None),
                "family_coat_of_arms": record["fields"].get("CoatOfArms", None),
                "family_motto": record["fields"].get("FamilyMotto", None),
                # CoatOfArmsImageUrl is no longer stored in Airtable.
                "color": record["fields"].get("Color", "#8B4513")
            }
        
        # Create new record
        fields = {
            "Wallet": wallet_data.wallet_address
        }
        
        if wallet_data.ducats is not None:
            fields["Ducats"] = wallet_data.ducats
            
        if wallet_data.citizen_name:
            fields["Username"] = wallet_data.citizen_name
            
        if wallet_data.first_name:
            fields["FirstName"] = wallet_data.first_name
            
        if wallet_data.last_name:
            fields["LastName"] = wallet_data.last_name
            
        if wallet_data.email:
            fields["Email"] = wallet_data.email
            
        if wallet_data.family_coat_of_arms:
            fields["CoatOfArms"] = wallet_data.family_coat_of_arms
            
        if wallet_data.family_motto:
            fields["FamilyMotto"] = wallet_data.family_motto
            
        if wallet_data.coat_of_arms_image:
            fields["CoatOfArmsImageUrl"] = wallet_data.coat_of_arms_image
        
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
        record = citizens_table.create(fields)
        print(f"Created new wallet record: {record['id']}")
        
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "ducats": record["fields"].get("Ducats", 0),
            "citizen_name": record["fields"].get("Username", None),
            "first_name": record["fields"].get("FirstName", None),
            "last_name": record["fields"].get("LastName", None),
            "email": record["fields"].get("Email", None),
            "family_coat_of_arms": record["fields"].get("CoatOfArms", None),
            "family_motto": record["fields"].get("FamilyMotto", None),
            "coat_of_arms_image": record["fields"].get("CoatOfArmsImageUrl", None),
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
        all_citizens = citizens_table.all()
        matching_records = [
            record for record in all_citizens 
            if record["fields"].get("Wallet", "").lower() == normalized_address or
               record["fields"].get("Username", "").lower() == normalized_address
        ]
        
        if not matching_records:
            raise HTTPException(status_code=404, detail="Wallet or citizen not found")
        
        record = matching_records[0]
        print(f"Found citizen record: {record['id']}")
        return {
            "id": record["id"],
            "wallet_address": record["fields"].get("Wallet", ""),
            "ducats": record["fields"].get("Ducats", 0),
            "citizen_name": record["fields"].get("Username", None),
            "first_name": record["fields"].get("FirstName", None),
            "last_name": record["fields"].get("LastName", None),
            "email": record["fields"].get("Email", None),
            "family_coat_of_arms": record["fields"].get("CoatOfArms", None),
            "family_motto": record["fields"].get("FamilyMotto", None),
            "coat_of_arms_image": record["fields"].get("CoatOfArmsImageUrl", None)
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
    
    if wallet_data.ducats is None or wallet_data.ducats <= 0:
        raise HTTPException(status_code=400, detail="Ducats must be greater than 0")
    
    try:
        # Normalize the wallet address to lowercase for case-insensitive comparison
        normalized_address = wallet_data.wallet_address.lower()
        
        # Get all citizens and find matching record
        all_citizens = citizens_table.all()
        matching_records = [
            record for record in all_citizens 
            if record["fields"].get("Wallet", "").lower() == normalized_address or
               record["fields"].get("Username", "").lower() == normalized_address
        ]
        
        # Log the incoming amount for debugging
        print(f"Received compute transfer request: {wallet_data.ducats} COMPUTE")
        
        # Use the full amount without any conversion
        transfer_amount = wallet_data.ducats
        
        if matching_records:
            # Update existing record
            record = matching_records[0]
            current_price = record["fields"].get("Ducats", 0)
            new_amount = current_price + transfer_amount
            
            print(f"Updating wallet {record['id']} Ducats from {current_price} to {new_amount}")
            updated_record = citizens_table.update(record["id"], {
                "Ducats": new_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "Asset": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.now().isoformat(),
                    "UpdatedAt": datetime.now().isoformat(),
                    "ExecutedAt": datetime.now().isoformat(),
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
                "ducats": updated_record["fields"].get("Ducats", 0),
                "citizen_name": updated_record["fields"].get("Username", None),
                "email": updated_record["fields"].get("Email", None),
                "family_motto": updated_record["fields"].get("FamilyMotto", None)
                # CoatOfArmsImageUrl is no longer stored in Airtable.
            }
        else:
            # Create new record
            print(f"Creating new wallet record with Ducats {transfer_amount}")
            record = citizens_table.create({
                "Wallet": wallet_data.wallet_address,
                "Ducats": transfer_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "Asset": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.now().isoformat(),
                    "UpdatedAt": datetime.now().isoformat(),
                    "ExecutedAt": datetime.now().isoformat(),
                    "Notes": json.dumps({
                        "operation": "deposit",
                        "method": "direct",
                        "new_citizen": True
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "ducats": record["fields"].get("Ducats", 0),
                "citizen_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None),
                "family_motto": record["fields"].get("FamilyMotto", None)
                # CoatOfArmsImageUrl is no longer stored in Airtable.
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
    
    if wallet_data.ducats is None or wallet_data.ducats <= 0:
        raise HTTPException(status_code=400, detail="Ducats must be greater than 0")
    
    try:
        # Check if wallet exists
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = citizens_table.all(formula=formula)
        
        if not existing_records:
            raise HTTPException(status_code=404, detail="Wallet not found")
        
        # Get current Ducats
        record = existing_records[0]
        current_price = record["fields"].get("Ducats", 0)
        
        # Check if citizen has enough compute to withdraw
        if current_price < wallet_data.ducats:
            raise HTTPException(status_code=400, detail="Insufficient compute balance")
        
        # Calculate new amount
        new_amount = current_price - wallet_data.ducats
        
        # Update the record
        print(f"Withdrawing {wallet_data.ducats} compute from wallet {record['id']}")
        print(f"Updating Ducats from {current_price} to {new_amount}")
        
        updated_record = citizens_table.update(record["id"], {
            "Ducats": new_amount
        })
        
        return {
            "id": updated_record["id"],
            "wallet_address": updated_record["fields"].get("Wallet", ""),
            "ducats": updated_record["fields"].get("Ducats", 0),
            "citizen_name": updated_record["fields"].get("Username", None),
            "email": updated_record["fields"].get("Email", None),
            "family_motto": updated_record["fields"].get("FamilyMotto", None),
            "coat_of_arms_image": updated_record["fields"].get("CoatOfArmsImageUrl", None)
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
    
    # Handle either citizen or wallet_address
    owner = land_data.citizen or land_data.wallet_address
    if not owner:
        raise HTTPException(status_code=400, detail="Citizen or wallet_address is required")
    
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
                "citizen": record["fields"].get("Citizen", ""),
                "wallet_address": record["fields"].get("Wallet", ""),
                "historical_name": record["fields"].get("HistoricalName", None),
                "english_name": record["fields"].get("EnglishName", None),
                "description": record["fields"].get("Description", None)
            }
        
        # Create new record
        fields = {
            "LandId": land_data.land_id,
            "Citizen": owner,
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
            "citizen": record["fields"].get("Citizen", ""),
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
            "citizen": record["fields"].get("Citizen", ""),
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
            owner = fields.get('Citizen', '')
            
            # If we have an owner, try to get their username
            owner_username = owner
            if owner:
                # Look up the citizen to get their username
                citizen_formula = f"{{Wallet}}='{owner}'"
                citizen_records = citizens_table.all(formula=citizen_formula)
                if citizen_records:
                    owner_username = citizen_records[0]['fields'].get('Username', owner)
            
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
    """Get all lands with their owners from Airtable (basic version without citizen lookups)."""
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
                'owner': fields.get('Citizen', '')  # Just return the raw owner value
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
        # Convert owner to username if it's a wallet address
        owner_username = data["owner"]
        if data["owner"].startswith("0x") or len(data["owner"]) > 30:
            # Look up the username for this wallet
            owner_records = citizens_table.all(formula=f"{{Wallet}}='{data['owner']}'")
            if owner_records:
                owner_username = owner_records[0]["fields"].get("Username", data["owner"])
                print(f"Converted owner wallet {data['owner']} to username {owner_username}")
            else:
                print(f"Could not find username for wallet {data['owner']}, using wallet as username")
        
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
                "Citizen": owner_username,  # Use username instead of wallet address
                "Wallet": data.get("wallet", data["owner"])  # Keep wallet for reference
            })
            
            return {
                "id": updated_record["id"],
                "land_id": updated_record["fields"].get("LandId", ""),
                "citizen": updated_record["fields"].get("Citizen", ""),
                "wallet_address": updated_record["fields"].get("Wallet", ""),
                "historical_name": updated_record["fields"].get("HistoricalName", None),
                "english_name": updated_record["fields"].get("EnglishName", None),
                "description": updated_record["fields"].get("Description", None)
            }
        else:
            # Create new record
            fields = {
                "LandId": land_id,
                "Citizen": owner_username,  # Use username instead of wallet address
                "Wallet": data.get("wallet", data["owner"])  # Keep wallet for reference
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
                "citizen": record["fields"].get("Citizen", ""),
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
                "Citizen": data["owner"],
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
                "Citizen": data["owner"],
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
    
    if not transaction_data.asset:
        raise HTTPException(status_code=400, detail="Asset ID is required")
    
    if not transaction_data.seller:
        raise HTTPException(status_code=400, detail="Seller is required")
    
    if not transaction_data.price or transaction_data.price <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than 0")

    try:
        seller_username = transaction_data.seller
        if transaction_data.seller.startswith("0x") or len(transaction_data.seller) > 30:
            seller_records = citizens_table.all(formula=f"{{Wallet}}='{transaction_data.seller}'")
            if seller_records:
                seller_username = seller_records[0]["fields"].get("Username", transaction_data.seller)
                print(f"Converted seller wallet {transaction_data.seller} to username {seller_username}")
            else:
                print(f"Could not find username for wallet {transaction_data.seller}, using wallet as username")

        now = datetime.now().isoformat()
        land_details_json = None
        if transaction_data.type == "land":
            land_details = {}
            if transaction_data.historical_name:
                land_details["historical_name"] = transaction_data.historical_name
            if transaction_data.english_name:
                land_details["english_name"] = transaction_data.english_name
            if transaction_data.description:
                land_details["description"] = transaction_data.description
            if land_details:
                land_details_json = json.dumps(land_details)

        if transaction_data.type == "land":
            # Create a CONTRACT for land sale
            formula = f"AND({{ResourceType}}='{transaction_data.asset}', {{Type}}='land_sale', {{Seller}}='{seller_username}', {{Status}}='available')"
            print(f"Searching for existing land sale contract with formula: {formula}")
            existing_records = contracts_table.all(formula=formula)

            if existing_records:
                record = existing_records[0]
                print(f"Found existing land sale contract: {record['id']}")
                # Potentially update if price changes, or just return existing. For now, return existing.
                notes_data = json.loads(record["fields"].get("Notes", "{}"))
                return {
                    "id": record["id"],
                    "type": record["fields"].get("Type", "land_sale"), # Should be land_sale
                    "asset": record["fields"].get("ResourceType", ""), # LandId
                    "seller": record["fields"].get("Seller", ""),
                    "buyer": record["fields"].get("Buyer", None),
                    "price": record["fields"].get("PricePerResource", 0),
                    "historical_name": notes_data.get("historical_name"),
                    "english_name": notes_data.get("english_name"),
                    "description": notes_data.get("description"),
                    "created_at": record["fields"].get("CreatedAt", ""),
                    "updated_at": record["fields"].get("UpdatedAt", ""),
                    "executed_at": record["fields"].get("ExecutedAt", None)
                }

            fields = {
                "Type": "land_sale",
                "ResourceType": transaction_data.asset, # LandId
                "Seller": seller_username,
                "PricePerResource": transaction_data.price,
                "Amount": 1,
                "Status": "available",
                "CreatedAt": now,
                "UpdatedAt": now
            }
            if land_details_json:
                fields["Notes"] = land_details_json
            
            print(f"Creating new land sale contract with fields: {fields}")
            record = contracts_table.create(fields)
            print(f"Created new land sale contract: {record['id']}")
            
            return {
                "id": record["id"],
                "type": "land_sale",
                "asset": fields.get("ResourceType"),
                "seller": fields.get("Seller"),
                "buyer": None,
                "price": fields.get("PricePerResource"),
                "historical_name": transaction_data.historical_name,
                "english_name": transaction_data.english_name,
                "description": transaction_data.description,
                "created_at": fields.get("CreatedAt"),
                "updated_at": fields.get("UpdatedAt"),
                "executed_at": None
            }
        else:
            # Existing logic for other transaction types (non-land)
            formula = f"AND({{Asset}}='{transaction_data.asset}', {{Type}}='{transaction_data.type}', {{ExecutedAt}}=BLANK())"
            print(f"Searching for existing transaction with formula: {formula}")
            existing_records = transactions_table.all(formula=formula)

            if existing_records:
                record = existing_records[0]
                # ... (return existing transaction - this part is unchanged)
                print(f"Found existing transaction record: {record['id']}")
                return {
                    "id": record["id"],
                    "type": record["fields"].get("Type", ""),
                    "asset": record["fields"].get("Asset", ""),
                    "seller": record["fields"].get("Seller", ""),
                    "buyer": record["fields"].get("Buyer", None),
                    "price": record["fields"].get("Price", 0),
                    "historical_name": None, # Or parse from Notes if applicable
                    "english_name": None,
                    "description": None,
                    "created_at": record["fields"].get("CreatedAt", ""),
                    "updated_at": record["fields"].get("UpdatedAt", ""),
                    "executed_at": record["fields"].get("ExecutedAt", None)
                }

            fields = {
                "Type": transaction_data.type,
                "Asset": transaction_data.asset,
                "Seller": seller_username,
                "Price": transaction_data.price,
                "CreatedAt": now,
                "UpdatedAt": now
            }
            if transaction_data.buyer:
                buyer_username = transaction_data.buyer
                if transaction_data.buyer.startswith("0x") or len(transaction_data.buyer) > 30:
                    buyer_records = citizens_table.all(formula=f"{{Wallet}}='{transaction_data.buyer}'")
                    if buyer_records:
                        buyer_username = buyer_records[0]["fields"].get("Username", transaction_data.buyer)
                    # ... (rest of buyer conversion)
                fields["Buyer"] = buyer_username
            
            # Notes for non-land transactions (if any)
            # if land_details_json: fields["Notes"] = land_details_json # This was inside land block

            print(f"Creating new transaction record with fields: {fields}")
            record = transactions_table.create(fields)
            print(f"Created new transaction record: {record['id']}")
            return {
                "id": record["id"],
                "type": record["fields"].get("Type", ""),
                "asset": record["fields"].get("Asset", ""),
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
        error_msg = f"Failed to create transaction/contract: {str(e)}"
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
        
        # Create a formula that checks all possible ID formats for ResourceType
        id_conditions = [f"{{ResourceType}}='{pid}'" for pid in possible_ids]
        
        # Search in contracts_table for available land sales
        formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land_sale', {{Status}}='available')"
        
        print(f"Searching for land sale contract with formula: {formula}")
        records = contracts_table.all(formula=formula)
        
        if not records:
            # Try a more lenient search if no "available" contract is found (e.g., pending, executed)
            lenient_formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land_sale')"
            print(f"No active land sale contract found. Trying more lenient search: {lenient_formula}")
            records = contracts_table.all(formula=lenient_formula, sort=[('-CreatedAt')]) # Get the latest if multiple
            
            if not records:
                print(f"No land sale contract found for land {land_id}")
                raise HTTPException(status_code=404, detail="Contract not found for this land")

        record = records[0] # Take the first one (latest if sorted)
        print(f"Found land sale contract: {record['id']}")
        
        notes_data = {}
        if "Notes" in record["fields"]:
            try:
                notes_data = json.loads(record["fields"].get("Notes", "{}"))
            except json.JSONDecodeError:
                pass # Ignore if Notes isn't valid JSON
        
        return {
            "id": record["id"],
            "type": record["fields"].get("Type", "land_sale"),
            "asset": record["fields"].get("ResourceType", ""), # LandId
            "seller": record["fields"].get("Seller", ""),
            "buyer": record["fields"].get("Buyer", None),
            "price": record["fields"].get("PricePerResource", 0),
            "historical_name": notes_data.get("historical_name"),
            "english_name": notes_data.get("english_name"),
            "description": notes_data.get("description"),
            "created_at": record["fields"].get("CreatedAt", ""),
            "updated_at": record["fields"].get("UpdatedAt", ""),
            "executed_at": record["fields"].get("ExecutedAt", None) # Or map from Status='executed'
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
    """Get all active land sale contracts"""
    
    try:
        # Fetch available land sale contracts
        formula = "AND({Type}='land_sale', {Status}='available')"
        print(f"Fetching all active land sale contracts with formula: {formula}")
        records = contracts_table.all(formula=formula, sort=[('-CreatedAt')])
        
        contracts_response = []
        for record in records:
            notes_data = {}
            if "Notes" in record["fields"]:
                try:
                    notes_data = json.loads(record["fields"].get("Notes", "{}"))
                except json.JSONDecodeError:
                    pass
            
            contracts_response.append({
                "id": record["id"],
                "type": record["fields"].get("Type", "land_sale"),
                "asset": record["fields"].get("ResourceType", ""), # LandId
                "seller": record["fields"].get("Seller", ""),
                "buyer": record["fields"].get("Buyer", None),
                "price": record["fields"].get("PricePerResource", 0),
                "historical_name": notes_data.get("historical_name"),
                "english_name": notes_data.get("english_name"),
                "description": notes_data.get("description"),
                "created_at": record["fields"].get("CreatedAt", ""),
                "updated_at": record["fields"].get("UpdatedAt", ""),
                "executed_at": record["fields"].get("ExecutedAt", None)
            })
        
        print(f"Found {len(contracts_response)} active land sale contracts")
        return contracts_response
    except Exception as e:
        error_msg = f"Failed to get land sale contracts: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/transactions/land/{land_id}")
async def get_land_transactions(land_id: str):
    """Get all transactions for a land (both incoming and outgoing offers)"""
    # The problematic docstring and the first try block have been removed.
    # The following try block is now the main one for this function.
    try:
        possible_ids = [
            land_id,
            f"polygon-{land_id}" if not land_id.startswith("polygon-") else land_id,
            land_id.replace("polygon-", "") if land_id.startswith("polygon-") else land_id
        ]
        
        id_conditions = [f"{{ResourceType}}='{pid}'" for pid in possible_ids]
        # Fetch 'available' or 'pending_execution' land sale contracts
        formula = f"AND(OR({', '.join(id_conditions)}), {{Type}}='land_sale', OR({{Status}}='available', {{Status}}='pending_execution'))"
        
        print(f"Searching for land sale contracts with formula: {formula}")
        records = contracts_table.all(formula=formula, sort=[('-CreatedAt')])
        
        if not records:
            return [] # No contracts found
        
        contracts_response = []
        for record in records:
            notes_data = {}
            if "Notes" in record["fields"]:
                try:
                    notes_data = json.loads(record["fields"].get("Notes", "{}"))
                except json.JSONDecodeError:
                    pass
            
            contracts_response.append({
                "id": record["id"],
                "type": record["fields"].get("Type", "land_sale"),
                "asset": record["fields"].get("ResourceType", ""), # LandId
                "seller": record["fields"].get("Seller", ""),
                "buyer": record["fields"].get("Buyer", None),
                "price": record["fields"].get("PricePerResource", 0),
                "historical_name": notes_data.get("historical_name"),
                "english_name": notes_data.get("english_name"),
                "description": notes_data.get("description"),
                "created_at": record["fields"].get("CreatedAt", ""),
                "updated_at": record["fields"].get("UpdatedAt", ""),
                "executed_at": record["fields"].get("ExecutedAt", None)
            })
        
        print(f"Found {len(contracts_response)} land sale contracts for land {land_id}")
        return contracts_response
    except Exception as e:
        error_msg = f"Failed to get land sale contracts: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/transaction/{transaction_id}/execute")
async def execute_transaction(transaction_id: str, data: dict):
    """Execute a transaction by setting the buyer and executed_at timestamp"""
    
    if not data.get("buyer"):
        raise HTTPException(status_code=400, detail="Buyer is required")
    
    try:
        # Get the contract record
        record = contracts_table.get(transaction_id) # transaction_id is now ContractId
        if not record:
            raise HTTPException(status_code=404, detail="Contract not found")

        contract_type = record["fields"].get("Type")
        contract_status = record["fields"].get("Status")

        # Check if contract is already executed or not available for execution
        if contract_status == "executed":
            raise HTTPException(status_code=400, detail="Contract already executed")
        if contract_status != "available" and contract_status != "pending_execution": # Allow pending_execution if that's a state
            raise HTTPException(status_code=400, detail=f"Contract not in a state to be executed (Status: {contract_status})")

        # Get the seller and price from the contract
        seller = record["fields"].get("Seller", "")
        price = record["fields"].get("PricePerResource", 0) # Price from PricePerResource
        buyer = data["buyer"]
        
        # Always use usernames for buyer and seller
        # First, check if the buyer is a wallet address and convert to username if needed
        buyer_username = buyer
        if buyer.startswith("0x") or len(buyer) > 30:  # Simple check for wallet address
            # Look up the username for this wallet
            buyer_records = citizens_table.all(formula=f"{{Wallet}}='{buyer}'")
            if buyer_records:
                buyer_username = buyer_records[0]["fields"].get("Username", buyer)
                print(f"Converted buyer wallet {buyer} to username {buyer_username}")
            else:
                print(f"Could not find username for wallet {buyer}, using wallet as username")
        
        # Same for seller
        seller_username = seller
        if seller.startswith("0x") or len(seller) > 30:
            seller_records = citizens_table.all(formula=f"{{Wallet}}='{seller}'")
            if seller_records:
                seller_username = seller_records[0]["fields"].get("Username", seller)
                print(f"Converted seller wallet {seller} to username {seller_username}")
            else:
                print(f"Could not find username for wallet {seller}, using wallet as username")
        
        # Transfer the price from buyer to seller first to ensure funds are available
        if price > 0 and seller_username and buyer_username:
            try:
                # Find buyer record by username
                buyer_records = citizens_table.all(formula=f"{{Username}}='{buyer_username}'")
                if not buyer_records:
                    raise HTTPException(status_code=404, detail=f"Buyer not found: {buyer_username}")
                
                buyer_record = buyer_records[0]
                buyer_compute = buyer_record["fields"].get("Ducats", 0)
                
                # Check if buyer has enough compute
                if buyer_compute < price:
                    raise HTTPException(status_code=400, detail=f"Buyer does not have enough compute. Required: {price}, Available: {buyer_compute}")
                
                # Find seller record by username
                seller_records = citizens_table.all(formula=f"{{Username}}='{seller_username}'")
                if not seller_records:
                    raise HTTPException(status_code=404, detail=f"Seller not found: {seller_username}")
                
                seller_record = seller_records[0]
                seller_compute = seller_record["fields"].get("Ducats", 0)
                
                print(f"Transferring {price} compute from {buyer_username} (balance: {buyer_compute}) to {seller_username} (balance: {seller_compute})")
                
                # Create a transaction log entry before making changes
                transaction_log = {
                    "transaction_id": transaction_id,
                    "buyer": buyer_username,
                    "seller": seller_username,
                    "price": price,
                    "buyer_before": buyer_compute,
                    "seller_before": seller_compute,
                    "buyer_after": buyer_compute - price,
                    "seller_after": seller_compute + price,
                    "timestamp": datetime.now().isoformat(),
                    "status": "pending"
                }
                
                # Update buyer's Ducats
                citizens_table.update(buyer_record["id"], {"Ducats": buyer_compute - price})
                
                # Update seller's Ducats
                citizens_table.update(seller_record["id"], {"Ducats": seller_compute + price})
                
                transaction_log["status"] = "completed"
                
                # Add transaction log (can still use transactions_table for logs or a dedicated log table)
                try:
                    transactions_table.create({ # Or a new logging mechanism
                        "Type": "transfer_log", # Differentiate from main transactions
                        "Asset": "compute_token_for_land_sale",
                        "Seller": seller_username, # Person receiving ducats
                        "Buyer": buyer_username, # Person paying ducats
                        "Price": price,
                        "CreatedAt": datetime.now().isoformat(),
                        "ExecutedAt": datetime.now().isoformat(),
                        "Notes": json.dumps(transaction_log)
                    })
                except Exception as tx_log_error:
                    print(f"Warning: Failed to create transaction log for compute transfer: {str(tx_log_error)}")
                
                print(f"Transfer complete. New balances - Buyer: {buyer_compute - price}, Seller: {seller_compute + price}")
            except Exception as balance_error:
                print(f"ERROR updating compute balances: {str(balance_error)}")
                traceback.print_exc(file=sys.stdout)
                # Potentially create a failed transaction log here as well
                # For now, we'll let the overall transaction fail if compute transfer is critical
                raise HTTPException(status_code=500, detail=f"Failed to transfer compute: {str(balance_error)}")
            
            print(f"Transferred {price} compute from {buyer_username} to {seller_username}")

        # Update the land ownership if it's a land sale contract
        if contract_type == "land_sale" and record["fields"].get("ResourceType"):
            land_id_from_contract = record["fields"].get("ResourceType") # This is the LandId
            print(f"Updating land ownership for asset {land_id_from_contract} to {buyer_username}")
            
            try:
                land_formula = f"{{LandId}}='{land_id_from_contract}'"
                land_records = lands_table.all(formula=land_formula)
                
                if land_records:
                    land_airtable_record = land_records[0]
                    lands_table.update(land_airtable_record["id"], {"Owner": buyer_username}) # Changed "Citizen" to "Owner"
                    print(f"Updated land owner in Airtable to {buyer_username} in field 'Owner'.")
                else:
                    print(f"Land record not found for {land_id_from_contract}, creating new record.")
                    lands_table.create({"LandId": land_id_from_contract, "Owner": buyer_username}) # Changed "Citizen" to "Owner"
                    print(f"Created new land record with owner {buyer_username} in field 'Owner'.")
            except Exception as land_error:
                print(f"ERROR updating land ownership in Airtable: {str(land_error)}")
                traceback.print_exc(file=sys.stdout)
                # Decide if this is a fatal error for the transaction
                raise HTTPException(status_code=500, detail=f"Failed to update land ownership: {str(land_error)}")

        # Update the contract with buyer, executed_at timestamp, and status
        now = datetime.now().isoformat()
        updated_contract_record = contracts_table.update(transaction_id, { # transaction_id is ContractId
            "Buyer": buyer_username,
            "ExecutedAt": now,
            "Status": "executed",
            "UpdatedAt": now
        })
        
        notes_data = {}
        if "Notes" in updated_contract_record["fields"]:
            try:
                notes_data = json.loads(updated_contract_record["fields"].get("Notes", "{}"))
            except json.JSONDecodeError:
                pass

        return {
            "id": updated_contract_record["id"],
            "type": updated_contract_record["fields"].get("Type", ""),
            "asset": updated_contract_record["fields"].get("ResourceType", ""), # LandId
            "seller": updated_contract_record["fields"].get("Seller", ""),
            "buyer": updated_contract_record["fields"].get("Buyer", None),
            "price": updated_contract_record["fields"].get("PricePerResource", 0),
            "historical_name": notes_data.get("historical_name"),
            "english_name": notes_data.get("english_name"),
            "description": notes_data.get("description"),
            "created_at": updated_contract_record["fields"].get("CreatedAt", ""),
            "updated_at": updated_contract_record["fields"].get("UpdatedAt", ""),
            "executed_at": updated_contract_record["fields"].get("ExecutedAt", None)
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
    """Generate a coat of arms image based on description and save it to public folder"""
    
    if not data.get("description"):
        raise HTTPException(status_code=400, detail="Description is required")
    
    username = data.get("username", "anonymous")
    
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
        
        # Download the image directly to avoid CORS issues
        print(f"Downloading image from Ideogram URL: {image_url}")
        image_response = requests.get(image_url, stream=True)
        if not image_response.ok:
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": f"Failed to download image: {image_response.status_code} {image_response.reason}"}
            )
        
        # Sanitize username for filename
        import re
        sanitized_username = re.sub(r'[^a-zA-Z0-9_-]', '_', username)
        # Use username as filename for consistency, typically .png for coat of arms
        filename = f"{sanitized_username}.png" 
        
        if not PERSISTENT_ASSETS_PATH_ENV:
            print("CRITICAL ERROR: PERSISTENT_ASSETS_PATH is not set. Cannot save generated coat of arms.")
            raise HTTPException(status_code=500, detail="Server configuration error: Asset storage path not set.")

        # Create directory if it doesn't exist, using persistent path
        coat_of_arms_dir = pathlib.Path(PERSISTENT_ASSETS_PATH_ENV).joinpath("images", "coat-of-arms")
        coat_of_arms_dir.mkdir(parents=True, exist_ok=True)
        
        # Save the image to the persistent public assets folder
        file_path = coat_of_arms_dir / filename
        print(f"Saving coat of arms image to: {file_path}")
        with open(file_path, 'wb') as f:
            for chunk in image_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Return the relative path for frontend use (relative to /public_assets/)
        # The frontend will prepend https://backend.serenissima.ai/public_assets
        relative_path_for_frontend = f"/images/coat-of-arms/{filename}"
        print(f"Returning relative path for frontend: {relative_path_for_frontend}")
        
        return {
            "success": True,
            "image_url_ideogram": image_url,  # Original URL from Ideogram for reference
            "local_image_url": relative_path_for_frontend,  # Path for frontend to construct full URL
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
    
    if wallet_data.ducats is None or wallet_data.ducats <= 0:
        raise HTTPException(status_code=400, detail="Ducats must be greater than 0")
    
    try:
        # Check if wallet exists - try multiple search approaches
        existing_records = None
        
        # First try exact wallet match
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = citizens_table.all(formula=formula)
        
        # If not found, try username match
        if not existing_records:
            formula = f"{{Username}}='{wallet_data.wallet_address}'"
            print(f"Searching for username with formula: {formula}")
            existing_records = citizens_table.all(formula=formula)
        
        # Log the incoming amount for debugging
        print(f"Received compute transfer request: {wallet_data.ducats} COMPUTE")
        
        # Use the full amount without any conversion
        transfer_amount = wallet_data.ducats
        
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
            current_price = record["fields"].get("Ducats", 0)
            new_amount = current_price + transfer_amount
            
            print(f"Updating wallet {record['id']} Ducats from {current_price} to {new_amount}")
            updated_record = citizens_table.update(record["id"], {
                "Ducats": new_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "Asset": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.now().isoformat(),
                    "UpdatedAt": datetime.now().isoformat(),
                    "ExecutedAt": datetime.now().isoformat(),
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
                "ducats": updated_record["fields"].get("Ducats", 0),
                "citizen_name": updated_record["fields"].get("Username", None),
                "email": updated_record["fields"].get("Email", None),
                "family_motto": updated_record["fields"].get("FamilyMotto", None),
                # CoatOfArmsImageUrl is no longer stored in Airtable.
                "transaction_signature": signature,
                "block_time": transfer_result.get("blockTime")
            }
        else:
            # Create new record
            print(f"Creating new wallet record with Ducats {transfer_amount}")
            record = citizens_table.create({
                "Wallet": wallet_data.wallet_address,
                "Ducats": transfer_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "deposit",
                    "Asset": "compute_token",
                    "Seller": "Treasury",
                    "Buyer": wallet_data.wallet_address,
                    "Price": transfer_amount,
                    "CreatedAt": datetime.now().isoformat(),
                    "UpdatedAt": datetime.now().isoformat(),
                    "ExecutedAt": datetime.now().isoformat(),
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
                "ducats": record["fields"].get("Ducats", 0),
                "citizen_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None),
                "family_motto": record["fields"].get("FamilyMotto", None),
                # CoatOfArmsImageUrl is no longer stored in Airtable.
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

# Add a new endpoint for direct transfers between citizens
@app.post("/api/transfer-compute-between-citizens")
async def transfer_compute_between_citizens(data: dict):
    """Transfer compute directly between two citizens"""
    
    if not data.get("from_wallet"):
        raise HTTPException(status_code=400, detail="Sender wallet address is required")
    
    if not data.get("to_wallet"):
        raise HTTPException(status_code=400, detail="Recipient wallet address is required")
    
    if not data.get("ducats") or data.get("ducats") <= 0:
        raise HTTPException(status_code=400, detail="Ducats must be greater than 0")
    
    try:
        # Use the utility function to handle the transfer
        from_wallet = data["from_wallet"]
        to_wallet = data["to_wallet"]
        amount = data["ducats"]
        
        # Perform the transfer
        from_record, to_record = transfer_compute(citizens_table, from_wallet, to_wallet, amount)
        
        # Log the transaction
        try:
            transaction_record = transactions_table.create({
                "Type": "transfer",
                "Asset": "compute_token",
                "Seller": to_wallet,  # Recipient is the "seller" in this context
                "Buyer": from_wallet,  # Sender is the "buyer" in this context
                "Price": amount,
                "CreatedAt": datetime.now().isoformat(),
                "UpdatedAt": datetime.now().isoformat(),
                "ExecutedAt": datetime.now().isoformat(),
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
            "from_balance": from_record["fields"].get("Ducats", 0),
            "to_balance": to_record["fields"].get("Ducats", 0)
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
    
    if wallet_data.ducats is None or wallet_data.ducats <= 0:
        raise HTTPException(status_code=400, detail="Ducats must be greater than 0")
    
    try:
        # Check if citizen has any active loans
        try:
            # Get loans for this citizen
            loans_formula = f"{{Borrower}}='{wallet_data.wallet_address}' AND {{Status}}='active'"
            active_loans = loans_table.all(formula=loans_formula)
            
            if active_loans and len(active_loans) > 0:
                raise HTTPException(
                    status_code=400, 
                    detail="You must repay all active loans before withdrawing compute. This is required by the Venetian Banking Guild."
                )
        except Exception as loan_error:
            print(f"Warning: Error checking citizen loans: {str(loan_error)}")
            # Continue with withdrawal if we can't check loans to avoid blocking citizens
        # Check if wallet exists - try multiple search approaches
        existing_records = None
        
        # First try exact wallet match
        formula = f"{{Wallet}}='{wallet_data.wallet_address}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = citizens_table.all(formula=formula)
        
        # If not found, try username match
        if not existing_records:
            formula = f"{{Username}}='{wallet_data.wallet_address}'"
            print(f"Searching for username with formula: {formula}")
            existing_records = citizens_table.all(formula=formula)
        
        if not existing_records:
            raise HTTPException(status_code=404, detail="Wallet not found")
        
        # Get current Ducats
        record = existing_records[0]
        current_price = record["fields"].get("Ducats", 0)
        
        # Check if citizen has enough compute to withdraw
        if current_price < wallet_data.ducats:
            raise HTTPException(status_code=400, detail="Insufficient compute balance")
        
        # Calculate new amount
        new_amount = current_price - wallet_data.ducats
        
        # Call the Node.js script to perform the Solana transfer
        import subprocess
        import json
        import time
        import base64
        
        # Create a message for the citizen to sign (in a real app)
        message = f"Authorize withdrawal of {wallet_data.ducats} COMPUTE tokens at {time.time()}"
        message_b64 = base64.b64encode(message.encode()).decode()
        
        # Create a temporary JSON file with the withdrawal details
        transfer_data = {
            "citizen": wallet_data.wallet_address,
            "amount": wallet_data.ducats,
            "message": message,
            # In a real app, the frontend would provide this signature
            # "signature": citizen_signature_from_frontend
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
            # for the frontend to have the citizen sign it
            serialized_tx = transfer_result.get("serializedTransaction")
            
            if transfer_result.get("status") == "pending_signature":
                # In a real app, we would wait for the frontend to submit the signed transaction
                # For now, we'll simulate a successful transaction
                signature = "simulated_" + base64.b64encode(os.urandom(32)).decode()
                
                # Update the record in Airtable
                print(f"Withdrawing {wallet_data.ducats} compute from wallet {record['id']}")
                print(f"Updating Ducats from {current_price} to {new_amount}")
                
                updated_record = citizens_table.update(record["id"], {
                    "Ducats": new_amount
                })
                
                return {
                    "id": updated_record["id"],
                    "wallet_address": updated_record["fields"].get("Wallet", ""),
                    "ducats": updated_record["fields"].get("Ducats", 0),
                    "citizen_name": updated_record["fields"].get("Username", None),
                    "email": updated_record["fields"].get("Email", None),
                    "family_motto": updated_record["fields"].get("FamilyMotto", None),
                    # CoatOfArmsImageUrl is no longer stored in Airtable.
                    "transaction_signature": signature,
                    "transaction_details": {
                        "from_wallet": wallet_data.wallet_address,
                        "to_wallet": "Treasury",
                        "amount": wallet_data.ducats,
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
        print(f"Withdrawing {wallet_data.ducats} compute from wallet {record['id']}")
        print(f"Updating Ducats from {current_price} to {new_amount}")
        
        updated_record = citizens_table.update(record["id"], {
            "Ducats": new_amount
        })
        
        return {
            "id": updated_record["id"],
            "wallet_address": updated_record["fields"].get("Wallet", ""),
            "ducats": updated_record["fields"].get("Ducats", 0),
            "citizen_name": updated_record["fields"].get("Username", None),
            "email": updated_record["fields"].get("Email", None),
            "family_motto": updated_record["fields"].get("FamilyMotto", None),
            "coat_of_arms_image": updated_record["fields"].get("CoatOfArmsImageUrl", None),
            "transaction_signature": signature,
            "transaction_details": {
                "from_wallet": wallet_data.wallet_address,
                "to_wallet": "Treasury",
                "amount": wallet_data.ducats,
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

@app.get("/api/citizens/coat-of-arms")
async def get_citizens_coat_of_arms():
    """Get all citizens with their coat of arms images"""
    
    try:
        print("Fetching all citizens with coat of arms images...")
        # Fetch all records from the CITIZENS table
        records = citizens_table.all(fields=['Username', 'FirstName', 'LastName']) # Only fetch necessary fields
        
        # Format the response
        citizens_with_coat_of_arms_info = []
        
        if not PERSISTENT_ASSETS_PATH_ENV:
            print("WARNING: PERSISTENT_ASSETS_PATH_ENV is not set. Cannot check for coat of arms files.")
            # Return all citizens but indicate that coat of arms status is unknown
            for record in records:
                fields = record['fields']
                citizens_with_coat_of_arms_info.append({
                    'username': fields.get('Username', ''),
                    'firstName': fields.get('FirstName', ''),
                    'lastName': fields.get('LastName', ''),
                    'hasCustomCoatOfArms': False, # Assume false if path not set
                    'coatOfArmsPath': f"/images/coat-of-arms/{fields.get('Username', 'default')}.png" # Default path
                })
            return {"success": True, "citizens": citizens_with_coat_of_arms_info, "warning": "Asset path not configured, coat of arms status may be inaccurate."}

        base_coat_of_arms_dir = pathlib.Path(PERSISTENT_ASSETS_PATH_ENV).joinpath("images", "coat-of-arms")

        for record in records:
            fields = record['fields']
            username = fields.get('Username')
            if not username:
                continue

            # Construct the expected filename, e.g., NLR.png
            # Ensure username is sanitized if it can contain special characters, though typically it shouldn't.
            # For simplicity, assuming username is safe for filenames here.
            coat_of_arms_filename = f"{username}.png"
            custom_coat_of_arms_file_path = base_coat_of_arms_dir / coat_of_arms_filename
            
            has_custom_coat_of_arms = custom_coat_of_arms_file_path.exists()
            
            citizens_with_coat_of_arms_info.append({
                'username': username,
                'firstName': fields.get('FirstName', ''),
                'lastName': fields.get('LastName', ''),
                'hasCustomCoatOfArms': has_custom_coat_of_arms,
                'coatOfArmsPath': f"/images/coat-of-arms/{coat_of_arms_filename}" # Relative path for frontend
            })
        
        print(f"Processed {len(citizens_with_coat_of_arms_info)} citizens for coat of arms info.")
        return {"success": True, "citizens": citizens_with_coat_of_arms_info}
    except Exception as e:
        error_msg = f"Error fetching citizens coat of arms: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/citizens")
async def get_citizens():
    """Get all citizens with their data"""
    
    try:
        print("Fetching all citizens from Airtable...")
        # Fetch all records from the CITIZENS table
        records = citizens_table.all()
        
        # Format the response
        citizens = []
        for record in records:
            fields = record['fields']
            citizen_data = {
                'citizen_name': fields.get('Username', ''),
                'first_name': fields.get('FirstName', ''),
                'last_name': fields.get('LastName', ''),
                'wallet_address': fields.get('Wallet', ''),
                'ducats': fields.get('Ducats', 0),
                'family_motto': fields.get('FamilyMotto', '')
                # coat_of_arms_image is removed as CoatOfArmsImageUrl is no longer stored
            }
            citizens.append(citizen_data)
        
        print(f"Found {len(citizens)} citizen records")
        return citizens
    except Exception as e:
        error_msg = f"Error fetching citizens: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/cron-status")
async def cron_status():
    """Check if the income distribution cron job is set up"""
    try:
        # Run crontab -l to check if our job is there
        import subprocess
        result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
        
        if result.returncode != 0:
            return {"status": "error", "message": "Failed to check crontab", "error": result.stderr}
        
        # Check if our job is in the crontab
        if "distributeIncome.py" in result.stdout:
            return {"status": "ok", "message": "Income distribution cron job is set up", "crontab": result.stdout}
        else:
            return {"status": "warning", "message": "Income distribution cron job not found", "crontab": result.stdout}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/trigger-income-distribution")
async def trigger_income_distribution():
    """Manually trigger income distribution"""
    try:
        # Import the distribute_income function
        import sys
        import os
        
        # Add the backend directory to the Python path
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        
        # Import the distribute_income function
        from distributeIncome import distribute_income
        
        # Run the distribution
        distribute_income()
        
        return {"status": "success", "message": "Income distribution triggered successfully"}
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}

@app.post("/api/transaction/{transaction_id}/cancel")
async def cancel_transaction(transaction_id: str, data: dict):
    """Cancel a transaction"""
    
    if not data.get("seller"): # Seller identifier (username or wallet)
        raise HTTPException(status_code=400, detail="Seller is required for cancellation")
    
    try:
        # Get the contract record
        record = contracts_table.get(transaction_id) # transaction_id is ContractId
        if not record:
            raise HTTPException(status_code=404, detail="Contract not found")

        contract_type = record["fields"].get("Type")
        contract_status = record["fields"].get("Status")
        contract_seller = record["fields"].get("Seller")

        # For land sales, only the original seller can cancel an "available" contract
        if contract_type == "land_sale":
            if contract_status != "available":
                raise HTTPException(status_code=400, detail=f"Land sale contract cannot be cancelled (Status: {contract_status})")

            # Normalize seller from request and contract for comparison
            request_seller_normalized = data["seller"].lower()
            contract_seller_normalized = contract_seller.lower()
            
            # Also check against wallet if username is stored in contract_seller
            seller_wallet = None
            seller_username_in_contract = None

            # Attempt to find citizen by contract_seller to get both username and wallet
            # This logic assumes contract_seller might be username or wallet
            # A more robust way is to always store a consistent identifier (e.g. username)
            # and then fetch wallet if needed, or vice-versa.
            # For now, we'll try to match against the stored seller field directly.
            # If contract_seller is a wallet, it should match. If it's a username, it should match.
            
            # A simpler check: if the provided seller identifier (data["seller"]) matches the contract's seller field
            if request_seller_normalized != contract_seller_normalized:
                 # If direct match fails, try to resolve if one is username and other is wallet
                seller_citizen_record = find_citizen_by_identifier(citizens_table, contract_seller)
                request_seller_citizen_record = find_citizen_by_identifier(citizens_table, data["seller"])

                match_found = False
                if seller_citizen_record and request_seller_citizen_record:
                    if seller_citizen_record['id'] == request_seller_citizen_record['id']:
                        match_found = True
                
                if not match_found:
                    print(f"Seller mismatch: Request seller '{data['seller']}' vs Contract seller '{contract_seller}'")
                    raise HTTPException(status_code=403, detail="Only the original seller can cancel this land sale contract.")

            # Update contract status to "cancelled" or delete
            # contracts_table.update(transaction_id, {"Status": "cancelled", "UpdatedAt": datetime.datetime.now().isoformat()})
            contracts_table.delete(transaction_id) # Current behavior is delete
            print(f"Land sale contract {transaction_id} cancelled by seller {data['seller']}")
            return {"success": True, "message": "Land sale contract cancelled successfully"}
        else:
            # Fallback to old transaction logic if not a land_sale contract (or handle other contract types)
            # This part assumes non-land transactions are still in transactions_table
            # If all transactions move to contracts, this else block needs adjustment
            original_transaction_record = transactions_table.get(transaction_id)
            if not original_transaction_record:
                 raise HTTPException(status_code=404, detail="Transaction not found in transactions_table either.")

            if original_transaction_record["fields"].get("ExecutedAt"):
                raise HTTPException(status_code=400, detail="Transaction already executed")
            if original_transaction_record["fields"].get("Seller") != data["seller"]:
                raise HTTPException(status_code=403, detail="Only the seller can cancel this transaction")
            
            transactions_table.delete(transaction_id)
            return {"success": True, "message": "Transaction cancelled successfully"}

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to cancel transaction: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

# Initialize Airtable for LOANS table
AIRTABLE_LOANS_TABLE = os.getenv("AIRTABLE_LOANS_TABLE", "LOANS")
try:
    loans_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_LOANS_TABLE)
    print(f"Initialized Airtable LOANS table: {AIRTABLE_LOANS_TABLE}")
    
    # No explicit test call for this table to reduce startup logs
    print(f"LOANS_TABLE object initialized: {loans_table is not None}")
except Exception as e:
    print(f"ERROR initializing Airtable LOANS table object: {str(e)}")
    traceback.print_exc(file=sys.stdout)

@app.get("/api/loans/available")
async def get_available_loans():
    """Get all available loans"""
    try:
        formula = "OR({Status}='available', {Status}='template')"
        print(f"Backend: Fetching available loans with formula: {formula}")
        records = loans_table.all(formula=formula)
        
        print(f"Backend: Found {len(records)} available loan records")
        
        loans = []
        for record in records:
            loan_data = {
                "id": record["id"],
                "name": record["fields"].get("Name", ""),
                "borrower": record["fields"].get("Borrower", ""),
                "lender": record["fields"].get("Lender", ""),
                "status": record["fields"].get("Status", ""),
                "principalAmount": record["fields"].get("PrincipalAmount", 0),
                "interestRate": record["fields"].get("InterestRate", 0),
                "termDays": record["fields"].get("TermDays", 0),
                "paymentAmount": record["fields"].get("PaymentAmount", 0),
                "remainingBalance": record["fields"].get("RemainingBalance", 0),
                "createdAt": record["fields"].get("CreatedAt", ""),
                "updatedAt": record["fields"].get("UpdatedAt", ""),
                "finalPaymentDate": record["fields"].get("FinalPaymentDate", ""),
                "requirementsText": record["fields"].get("RequirementsText", ""),
                "applicationText": record["fields"].get("ApplicationText", ""),
                "loanPurpose": record["fields"].get("LoanPurpose", ""),
                "notes": record["fields"].get("Notes", "")
            }
            loans.append(loan_data)
            print(f"Backend: Added loan: {loan_data['name']} with ID {loan_data['id']}")
        
        print(f"Backend: Returning {len(loans)} available loans")
        return loans
    except Exception as e:
        error_msg = f"Failed to get available loans: {str(e)}"
        print(f"Backend ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/api/loans/test")
async def test_loans_endpoint():
    """Test endpoint to verify loans API is working"""
    return {"status": "ok", "message": "Loans API is working"}

@app.get("/api/loans/citizen/{citizen_id}")
async def get_citizen_loans(citizen_id: str):
    """Get loans for a specific citizen"""
    try:
        formula = f"{{Borrower}}='{citizen_id}'"
        print(f"Backend: Fetching loans for citizen with formula: {formula}")
        records = loans_table.all(formula=formula)
        
        print(f"Backend: Found {len(records)} loan records for citizen {citizen_id}")
        
        loans = []
        for record in records:
            loan_data = {
                "id": record["id"],
                "name": record["fields"].get("Name", ""),
                "borrower": record["fields"].get("Borrower", ""),
                "lender": record["fields"].get("Lender", ""),
                "status": record["fields"].get("Status", ""),
                "principalAmount": record["fields"].get("PrincipalAmount", 0),
                "interestRate": record["fields"].get("InterestRate", 0),
                "termDays": record["fields"].get("TermDays", 0),
                "paymentAmount": record["fields"].get("PaymentAmount", 0),
                "remainingBalance": record["fields"].get("RemainingBalance", 0),
                "createdAt": record["fields"].get("CreatedAt", ""),
                "updatedAt": record["fields"].get("UpdatedAt", ""),
                "finalPaymentDate": record["fields"].get("FinalPaymentDate", ""),
                "requirementsText": record["fields"].get("RequirementsText", ""),
                "applicationText": record["fields"].get("ApplicationText", ""),
                "loanPurpose": record["fields"].get("LoanPurpose", ""),
                "notes": record["fields"].get("Notes", "")
            }
            loans.append(loan_data)
            print(f"Backend: Added citizen loan: {loan_data['name']} with ID {loan_data['id']}")
        
        print(f"Backend: Returning {len(loans)} loans for citizen {citizen_id}")
        return loans
    except Exception as e:
        error_msg = f"Failed to get citizen loans: {str(e)}"
        print(f"Backend ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/loans/apply")
async def apply_for_loan(loan_application: dict):
    """Apply for a loan"""
    if not loan_application.get("borrower"):
        raise HTTPException(status_code=400, detail="Borrower is required")
    
    if not loan_application.get("principalAmount") or loan_application.get("principalAmount") <= 0:
        raise HTTPException(status_code=400, detail="Principal amount must be greater than 0")
    
    # Convert wallet address to username if needed
    borrower = loan_application.get("borrower")
    borrower_username = borrower
    
    # Check if borrower is a wallet address and convert to username if needed
    if borrower and (borrower.startswith("0x") or len(borrower) > 30):
        # Look up the username for this wallet
        borrower_records = citizens_table.all(formula=f"{{Wallet}}='{borrower}'")
        if borrower_records:
            borrower_username = borrower_records[0]["fields"].get("Username", borrower)
            print(f"Converted borrower wallet {borrower} to username {borrower_username}")
        else:
            print(f"Could not find username for wallet {borrower}, using wallet as username")
    
    try:
        # If loanId is provided, get the loan details
        loan_id = loan_application.get("loanId")
        if loan_id:
            loan_record = loans_table.get(loan_id)
            if not loan_record:
                raise HTTPException(status_code=404, detail="Loan not found")
            
            # Check if this is a template loan and if the borrower is eligible for immediate approval
            is_template_loan = loan_record["fields"].get("Status") == "template"
            borrower = loan_application.get("borrower")
            
            # Check if borrower has any existing loans
            borrower_has_loans = False
            if borrower:
                existing_loans_formula = f"{{Borrower}}='{borrower}'"
                existing_loans = loans_table.all(formula=existing_loans_formula)
                borrower_has_loans = len(existing_loans) > 0
            
            # Special case: If this is a template loan and borrower has no other loans,
            # immediately approve and transfer funds
            if is_template_loan and not borrower_has_loans:
                now = datetime.now().isoformat()
                
                # Calculate payment details
                principal = loan_application.get("principalAmount")
                interest_rate = loan_record["fields"].get("InterestRate", 0)
                term_days = loan_record["fields"].get("TermDays", 0)
                
                # Simple interest calculation
                interest_decimal = interest_rate / 100
                total_interest = principal * interest_decimal * (term_days / 365)
                total_payment = principal + total_interest
                
                # Get the lender (usually Treasury for template loans)
                lender = loan_record["fields"].get("Lender", "Treasury")
                
                # Create a new loan record instead of updating the template
                new_loan = {
                    "Name": f"Official Loan - {borrower_username}",
                    "Borrower": borrower_username,
                    "Lender": lender,
                    "Status": "active",  # Set to active immediately
                    "Type": "official",  # Mark as an official loan
                    "PrincipalAmount": principal,
                    "RemainingBalance": principal,
                    "InterestRate": interest_rate,
                    "TermDays": term_days,
                    "PaymentAmount": total_payment / term_days,  # Daily payment
                    "ApplicationText": loan_application.get("applicationText", ""),
                    "LoanPurpose": loan_application.get("loanPurpose", ""),
                    "CreatedAt": now,
                    "UpdatedAt": now,
                    "ApprovedAt": now,  # Add approval timestamp
                    "TemplateId": loan_id  # Reference to the original template
                }
                
                # Create the new loan record
                new_loan_record = loans_table.create(new_loan)
                
                # Transfer funds from lender to borrower
                try:
                    # Find borrower record
                    borrower_records = citizens_table.all(formula=f"{{Wallet}}='{borrower}'")
                    if not borrower_records:
                        borrower_records = citizens_table.all(formula=f"{{Username}}='{borrower_username}'")
                    
                    if borrower_records:
                        borrower_record = borrower_records[0]
                        current_compute = borrower_record["fields"].get("Ducats", 0)
                        
                        # Update borrower's compute balance
                        citizens_table.update(borrower_record["id"], {
                            "Ducats": current_compute + principal
                        })
                        
                        print(f"Transferred {principal} compute to borrower {borrower}")
                        
                        # Create transaction record
                        transactions_table.create({
                            "Type": "loan",
                            "Asset": "compute_token",
                            "Seller": lender,
                            "Buyer": borrower,
                            "Price": principal,
                            "CreatedAt": now,
                            "UpdatedAt": now,
                            "ExecutedAt": now,
                            "Notes": json.dumps({
                                "operation": "loan_disbursement",
                                "loan_id": new_loan_record["id"],
                                "interest_rate": interest_rate,
                                "term_days": term_days
                            })
                        })
                    else:
                        print(f"Warning: Borrower {borrower} not found, but loan approved anyway")
                except Exception as transfer_error:
                    print(f"Warning: Error transferring funds, but loan approved: {str(transfer_error)}")
                    # Continue execution even if transfer fails
                
                return {
                    "id": new_loan_record["id"],
                    "name": new_loan_record["fields"].get("Name", ""),
                    "borrower": new_loan_record["fields"].get("Borrower", ""),
                    "lender": new_loan_record["fields"].get("Lender", ""),
                    "status": new_loan_record["fields"].get("Status", ""),
                    "principalAmount": new_loan_record["fields"].get("PrincipalAmount", 0),
                    "interestRate": new_loan_record["fields"].get("InterestRate", 0),
                    "termDays": new_loan_record["fields"].get("TermDays", 0),
                    "paymentAmount": new_loan_record["fields"].get("PaymentAmount", 0),
                    "remainingBalance": new_loan_record["fields"].get("RemainingBalance", 0),
                    "createdAt": new_loan_record["fields"].get("CreatedAt", ""),
                    "updatedAt": new_loan_record["fields"].get("UpdatedAt", ""),
                    "finalPaymentDate": new_loan_record["fields"].get("FinalPaymentDate", ""),
                    "requirementsText": new_loan_record["fields"].get("RequirementsText", ""),
                    "applicationText": new_loan_record["fields"].get("ApplicationText", ""),
                    "loanPurpose": new_loan_record["fields"].get("LoanPurpose", ""),
                    "notes": new_loan_record["fields"].get("Notes", ""),
                    "autoApproved": True  # Flag to indicate this was auto-approved
                }
            
            # Regular flow for non-template loans or borrowers with existing loans
            # Check if loan is available
            if loan_record["fields"].get("Status") != "available" and loan_record["fields"].get("Status") != "template":
                raise HTTPException(status_code=400, detail="Loan is not available")
            
            # Update the loan with borrower information
            now = datetime.now().isoformat()
            
            # Calculate payment details
            principal = loan_application.get("principalAmount")
            interest_rate = loan_record["fields"].get("InterestRate", 0)
            term_days = loan_record["fields"].get("TermDays", 0)
            
            # Simple interest calculation
            interest_decimal = interest_rate / 100
            total_interest = principal * interest_decimal * (term_days / 365)
            total_payment = principal + total_interest
            
            # For template loans, create a new loan record instead of updating the template
            if loan_record["fields"].get("Status") == "template":
                # Create a new loan record
                new_loan = {
                    "Name": f"Loan Application - {borrower_username}",
                    "Borrower": borrower_username,
                    "Lender": loan_record["fields"].get("Lender", "Treasury"),
                    "Status": "pending",
                    "Type": "official",  # Mark as an official loan
                    "PrincipalAmount": principal,
                    "RemainingBalance": principal,
                    "InterestRate": interest_rate,
                    "TermDays": term_days,
                    "PaymentAmount": total_payment / term_days,  # Daily payment
                    "ApplicationText": loan_application.get("applicationText", ""),
                    "LoanPurpose": loan_application.get("loanPurpose", ""),
                    "CreatedAt": now,
                    "UpdatedAt": now,
                    "TemplateId": loan_id  # Reference to the original template
                }
                
                # Create the new loan record
                new_loan_record = loans_table.create(new_loan)
                
                return {
                    "id": new_loan_record["id"],
                    "name": new_loan_record["fields"].get("Name", ""),
                    "borrower": new_loan_record["fields"].get("Borrower", ""),
                    "lender": new_loan_record["fields"].get("Lender", ""),
                    "status": new_loan_record["fields"].get("Status", ""),
                    "principalAmount": new_loan_record["fields"].get("PrincipalAmount", 0),
                    "interestRate": new_loan_record["fields"].get("InterestRate", 0),
                    "termDays": new_loan_record["fields"].get("TermDays", 0),
                    "paymentAmount": new_loan_record["fields"].get("PaymentAmount", 0),
                    "remainingBalance": new_loan_record["fields"].get("RemainingBalance", 0),
                    "createdAt": new_loan_record["fields"].get("CreatedAt", ""),
                    "updatedAt": new_loan_record["fields"].get("UpdatedAt", ""),
                    "finalPaymentDate": new_loan_record["fields"].get("FinalPaymentDate", ""),
                    "requirementsText": new_loan_record["fields"].get("RequirementsText", ""),
                    "applicationText": new_loan_record["fields"].get("ApplicationText", ""),
                    "loanPurpose": new_loan_record["fields"].get("LoanPurpose", ""),
                    "notes": new_loan_record["fields"].get("Notes", "")
                }
            else:
                # For non-template loans, update the existing loan record
                updated_record = loans_table.update(loan_id, {
                    "Borrower": borrower_username,
                    "Status": "pending",
                    "PrincipalAmount": principal,
                    "RemainingBalance": principal,
                    "PaymentAmount": total_payment / term_days,  # Daily payment
                    "ApplicationText": loan_application.get("applicationText", ""),
                    "LoanPurpose": loan_application.get("loanPurpose", ""),
                    "UpdatedAt": now
                })
                
                return {
                    "id": updated_record["id"],
                    "name": updated_record["fields"].get("Name", ""),
                    "borrower": updated_record["fields"].get("Borrower", ""),
                    "lender": updated_record["fields"].get("Lender", ""),
                    "status": updated_record["fields"].get("Status", ""),
                    "principalAmount": updated_record["fields"].get("PrincipalAmount", 0),
                    "interestRate": updated_record["fields"].get("InterestRate", 0),
                    "termDays": updated_record["fields"].get("TermDays", 0),
                    "paymentAmount": updated_record["fields"].get("PaymentAmount", 0),
                    "remainingBalance": updated_record["fields"].get("RemainingBalance", 0),
                    "createdAt": updated_record["fields"].get("CreatedAt", ""),
                    "updatedAt": updated_record["fields"].get("UpdatedAt", ""),
                    "finalPaymentDate": updated_record["fields"].get("FinalPaymentDate", ""),
                    "requirementsText": updated_record["fields"].get("RequirementsText", ""),
                    "applicationText": updated_record["fields"].get("ApplicationText", ""),
                    "loanPurpose": updated_record["fields"].get("LoanPurpose", ""),
                    "notes": updated_record["fields"].get("Notes", "")
                }
        else:
            # Create a new loan application
            now = datetime.now().isoformat()
            
            # Create the loan record
            record = loans_table.create({
                "Name": f"Loan Application - {borrower_username}",
                "Borrower": borrower_username,
                "Status": "pending",
                "Type": "custom",  # Mark as a custom loan
                "PrincipalAmount": loan_application.get("principalAmount"),
                "RemainingBalance": loan_application.get("principalAmount"),
                "ApplicationText": loan_application.get("applicationText", ""),
                "LoanPurpose": loan_application.get("loanPurpose", ""),
                "CreatedAt": now,
                "UpdatedAt": now
            })
            
            return {
                "id": record["id"],
                "name": record["fields"].get("Name", ""),
                "borrower": record["fields"].get("Borrower", ""),
                "lender": record["fields"].get("Lender", ""),
                "status": record["fields"].get("Status", ""),
                "principalAmount": record["fields"].get("PrincipalAmount", 0),
                "interestRate": record["fields"].get("InterestRate", 0),
                "termDays": record["fields"].get("TermDays", 0),
                "paymentAmount": record["fields"].get("PaymentAmount", 0),
                "remainingBalance": record["fields"].get("RemainingBalance", 0),
                "createdAt": record["fields"].get("CreatedAt", ""),
                "updatedAt": record["fields"].get("UpdatedAt", ""),
                "finalPaymentDate": record["fields"].get("FinalPaymentDate", ""),
                "requirementsText": record["fields"].get("RequirementsText", ""),
                "applicationText": record["fields"].get("ApplicationText", ""),
                "loanPurpose": record["fields"].get("LoanPurpose", ""),
                "notes": record["fields"].get("Notes", "")
            }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to apply for loan: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/loans/{loan_id}/payment")
async def make_loan_payment(loan_id: str, payment_data: dict):
    """Make a payment on a loan"""
    if not payment_data.get("amount") or payment_data.get("amount") <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    
    try:
        # Get the loan record
        loan_record = loans_table.get(loan_id)
        if not loan_record:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        # Check if loan is active
        if loan_record["fields"].get("Status") != "active":
            raise HTTPException(status_code=400, detail="Loan is not active")
        
        # Get current remaining balance
        remaining_balance = loan_record["fields"].get("RemainingBalance", 0)
        
        # Check if payment amount is valid
        payment_amount = payment_data.get("amount")
        if payment_amount > remaining_balance:
            payment_amount = remaining_balance  # Cap at remaining balance
        
        # Calculate new remaining balance
        new_balance = remaining_balance - payment_amount
        
        # Update loan status if paid off
        status = "paid" if new_balance <= 0 else "active"
        
        # Update the loan record
        now = datetime.now().isoformat()
        updated_record = loans_table.update(loan_id, {
            "RemainingBalance": new_balance,
            "Status": status,
            "UpdatedAt": now,
            "Notes": f"{loan_record['fields'].get('Notes', '')}\nPayment of {payment_amount} made on {now}"
        })
        
        # If the loan is from Treasury, update the borrower's compute balance
        if loan_record["fields"].get("Lender") == "Treasury":
            try:
                borrower = loan_record["fields"].get("Borrower")
                if borrower:
                    # Find the borrower record
                    borrower_records = citizens_table.all(formula=f"{{Wallet}}='{borrower}'")
                    if borrower_records:
                        borrower_record = borrower_records[0]
                        current_compute = borrower_record["fields"].get("Ducats", 0)
                        
                        # Deduct payment from compute balance
                        citizens_table.update(borrower_record["id"], {
                            "Ducats": current_compute - payment_amount
                        })
                        
                        print(f"Updated borrower {borrower} compute balance: {current_compute} -> {current_compute - payment_amount}")
            except Exception as compute_error:
                print(f"WARNING: Failed to update borrower compute balance: {str(compute_error)}")
                # Continue execution even if compute update fails
        
        return {
            "id": updated_record["id"],
            "name": updated_record["fields"].get("Name", ""),
            "borrower": updated_record["fields"].get("Borrower", ""),
            "lender": updated_record["fields"].get("Lender", ""),
            "status": updated_record["fields"].get("Status", ""),
            "principalAmount": updated_record["fields"].get("PrincipalAmount", 0),
            "interestRate": updated_record["fields"].get("InterestRate", 0),
            "termDays": updated_record["fields"].get("TermDays", 0),
            "paymentAmount": updated_record["fields"].get("PaymentAmount", 0),
            "remainingBalance": updated_record["fields"].get("RemainingBalance", 0),
            "createdAt": updated_record["fields"].get("CreatedAt", ""),
            "updatedAt": updated_record["fields"].get("UpdatedAt", ""),
            "finalPaymentDate": updated_record["fields"].get("FinalPaymentDate", ""),
            "requirementsText": updated_record["fields"].get("RequirementsText", ""),
            "applicationText": updated_record["fields"].get("ApplicationText", ""),
            "loanPurpose": updated_record["fields"].get("LoanPurpose", ""),
            "notes": updated_record["fields"].get("Notes", "")
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to make loan payment: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/loans/create")
async def create_loan_offer(loan_offer: dict):
    """Create a loan offer"""
    if not loan_offer.get("lender"):
        raise HTTPException(status_code=400, detail="Lender is required")
    
    if not loan_offer.get("principalAmount") or loan_offer.get("principalAmount") <= 0:
        raise HTTPException(status_code=400, detail="Principal amount must be greater than 0")
    
    if not loan_offer.get("interestRate") or loan_offer.get("interestRate") < 0:
        raise HTTPException(status_code=400, detail="Interest rate must be non-negative")
    
    if not loan_offer.get("termDays") or loan_offer.get("termDays") <= 0:
        raise HTTPException(status_code=400, detail="Term days must be greater than 0")
    
    try:
        # Create the loan offer
        now = datetime.now().isoformat()
        
        # Calculate final payment date
        final_payment_date = (datetime.now() + datetime.timedelta(days=loan_offer.get("termDays"))).isoformat()
        
        # Create the loan record
        record = loans_table.create({
            "Name": loan_offer.get("name", f"Loan Offer - {loan_offer.get('lender')}"),
            "Lender": loan_offer.get("lender"),
            "Status": "available",
            "PrincipalAmount": loan_offer.get("principalAmount"),
            "InterestRate": loan_offer.get("interestRate"),
            "TermDays": loan_offer.get("termDays"),
            "RequirementsText": loan_offer.get("requirementsText", ""),
            "LoanPurpose": loan_offer.get("loanPurpose", ""),
            "CreatedAt": now,
            "UpdatedAt": now,
            "FinalPaymentDate": final_payment_date
        })
        
        return {
            "id": record["id"],
            "name": record["fields"].get("Name", ""),
            "borrower": record["fields"].get("Borrower", ""),
            "lender": record["fields"].get("Lender", ""),
            "status": record["fields"].get("Status", ""),
            "principalAmount": record["fields"].get("PrincipalAmount", 0),
            "interestRate": record["fields"].get("InterestRate", 0),
            "termDays": record["fields"].get("TermDays", 0),
            "paymentAmount": record["fields"].get("PaymentAmount", 0),
            "remainingBalance": record["fields"].get("RemainingBalance", 0),
            "createdAt": record["fields"].get("CreatedAt", ""),
            "updatedAt": record["fields"].get("UpdatedAt", ""),
            "finalPaymentDate": record["fields"].get("FinalPaymentDate", ""),
            "requirementsText": record["fields"].get("RequirementsText", ""),
            "applicationText": record["fields"].get("ApplicationText", ""),
            "loanPurpose": record["fields"].get("LoanPurpose", ""),
            "notes": record["fields"].get("Notes", "")
        }
    except Exception as e:
        error_msg = f"Failed to create loan offer: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)
    
@app.post("/api/inject-compute-complete")
async def inject_compute_complete(data: dict):
    """Update the database after a successful compute injection"""
    
    if not data.get("wallet_address"):
        raise HTTPException(status_code=400, detail="Wallet address is required")
    
    if not data.get("ducats") or data.get("ducats") <= 0:
        raise HTTPException(status_code=400, detail="Ducats must be greater than 0")
    
    if not data.get("transaction_signature"):
        raise HTTPException(status_code=400, detail="Transaction signature is required")
    
    try:
        # Check if wallet exists - try multiple search approaches
        existing_records = None
        
        # First try exact wallet match
        formula = f"{{Wallet}}='{data['wallet_address']}'"
        print(f"Searching for wallet with formula: {formula}")
        existing_records = citizens_table.all(formula=formula)
        
        # If not found, try username match
        if not existing_records:
            formula = f"{{Username}}='{data['wallet_address']}'"
            print(f"Searching for username with formula: {formula}")
            existing_records = citizens_table.all(formula=formula)
        
        # Log the incoming amount for debugging
        print(f"Received compute injection completion: {data['ducats']} COMPUTE")
        
        # Use the full amount without any conversion
        transfer_amount = data["ducats"]
        
        if existing_records:
            # Update existing record
            record = existing_records[0]
            current_price = record["fields"].get("Ducats", 0)
            new_amount = current_price + transfer_amount
            
            print(f"Updating wallet {record['id']} Ducats from {current_price} to {new_amount}")
            updated_record = citizens_table.update(record["id"], {
                "Ducats": new_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "inject",
                    "Asset": "compute_token",
                    "Seller": data["wallet_address"],
                    "Buyer": "Treasury",
                    "Price": transfer_amount,
                    "CreatedAt": datetime.now().isoformat(),
                    "UpdatedAt": datetime.now().isoformat(),
                    "ExecutedAt": datetime.now().isoformat(),
                    "Notes": json.dumps({
                        "operation": "inject",
                        "method": "solana",
                        "status": "completed",
                        "transaction_signature": data["transaction_signature"]
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
            
            return {
                "id": updated_record["id"],
                "wallet_address": updated_record["fields"].get("Wallet", ""),
                "ducats": updated_record["fields"].get("Ducats", 0),
                "citizen_name": updated_record["fields"].get("Username", None),
                "email": updated_record["fields"].get("Email", None),
                "family_motto": updated_record["fields"].get("FamilyMotto", None),
                # CoatOfArmsImageUrl is no longer stored in Airtable.
                "transaction_signature": data["transaction_signature"]
            }
        else:
            # Create new record
            print(f"Creating new wallet record with Ducats {transfer_amount}")
            record = citizens_table.create({
                "Wallet": data["wallet_address"],
                "Ducats": transfer_amount
            })
            
            # Add transaction record to TRANSACTIONS table
            try:
                transaction_record = transactions_table.create({
                    "Type": "inject",
                    "Asset": "compute_token",
                    "Seller": data["wallet_address"],
                    "Buyer": "Treasury",
                    "Price": transfer_amount,
                    "CreatedAt": datetime.datetime.now().isoformat(),
                    "UpdatedAt": datetime.datetime.now().isoformat(),
                    "ExecutedAt": datetime.datetime.now().isoformat(),
                    "Notes": json.dumps({
                        "operation": "inject",
                        "method": "solana",
                        "status": "completed",
                        "transaction_signature": data["transaction_signature"]
                    })
                })
                print(f"Created transaction record: {transaction_record['id']}")
            except Exception as tx_error:
                print(f"Warning: Failed to create transaction record: {str(tx_error)}")
            
            return {
                "id": record["id"],
                "wallet_address": record["fields"].get("Wallet", ""),
                "ducats": record["fields"].get("Ducats", 0),
                "citizen_name": record["fields"].get("Username", None),
                "email": record["fields"].get("Email", None),
                "family_motto": record["fields"].get("FamilyMotto", None),
                # CoatOfArmsImageUrl is no longer stored in Airtable.
                "transaction_signature": data["transaction_signature"]
            }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to complete compute injection: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc(file=sys.stdout)
        raise HTTPException(status_code=500, detail=error_msg)

# --- New Endpoint for Specific Activity Creation ---
@app.post("/api/v1/engine/try-create-activity", response_model=TryCreateActivityResponse)
async def try_create_activity_endpoint(request_data: TryCreateActivityRequest):
    """
    Attempts to create a specific activity for a citizen.
    Delegates logic to the game engine.
    """
    log_header(f"Received request to try-create activity: {request_data.activityType} for {request_data.citizenUsername}", color_code=LogColors.HEADER)
    
    try:
        # Initialize Airtable tables (consider moving to a dependency injection pattern for larger apps)
        # For now, direct initialization is fine.
        airtable_api_key_engine = os.getenv("AIRTABLE_API_KEY")
        airtable_base_id_engine = os.getenv("AIRTABLE_BASE_ID")
        if not airtable_api_key_engine or not airtable_base_id_engine:
            raise HTTPException(status_code=500, detail="Airtable not configured on server.")

        retry_strategy = Retry(total=3, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
        api_engine = Api(airtable_api_key_engine, retry_strategy=retry_strategy)
        tables_engine = {
            'citizens': api_engine.table(airtable_base_id_engine, 'CITIZENS'),
            'buildings': api_engine.table(airtable_base_id_engine, 'BUILDINGS'),
            'activities': api_engine.table(airtable_base_id_engine, 'ACTIVITIES'),
            'contracts': api_engine.table(airtable_base_id_engine, 'CONTRACTS'),
            'resources': api_engine.table(airtable_base_id_engine, 'RESOURCES'),
            'relationships': api_engine.table(airtable_base_id_engine, 'RELATIONSHIPS'),
            'lands': api_engine.table(airtable_base_id_engine, 'LANDS') # Assurer que la table LANDS est initialisée avec la clé 'lands'
        }

        # Import necessary functions from the engine
        from backend.engine.utils.activity_helpers import (
            get_resource_types_from_api, 
            get_building_types_from_api,
            VENICE_TIMEZONE # Import VENICE_TIMEZONE
        )
        from backend.engine.logic.citizen_general_activities import dispatch_specific_activity_request

        # Fetch citizen record
        citizen_record_list = tables_engine['citizens'].all(formula=f"{{Username}}='{_escape_airtable_value(request_data.citizenUsername)}'", max_records=1)
        if not citizen_record_list:
            return JSONResponse(status_code=404, content={"success": False, "message": f"Citizen '{request_data.citizenUsername}' not found.", "activity": None, "reason": "citizen_not_found"})
        citizen_record_full = citizen_record_list[0]

        # Fetch definitions (these could be cached globally in a real app)
        resource_defs = get_resource_types_from_api()
        building_type_defs = get_building_types_from_api()
        if not resource_defs or not building_type_defs:
             return JSONResponse(status_code=503, content={"success": False, "message": "Failed to load resource or building definitions from API.", "activity": None, "reason": "definitions_load_failed"})


        # Call the dispatcher
        result = dispatch_specific_activity_request(
            tables=tables_engine,
            citizen_record_full=citizen_record_full,
            activity_type=request_data.activityType,
            activity_parameters=request_data.activityParameters,
            resource_defs=resource_defs,
            building_type_defs=building_type_defs,
            transport_api_url=os.getenv("TRANSPORT_API_URL", "http://localhost:3000/api/transport"),
            api_base_url=os.getenv("API_BASE_URL", "http://localhost:3000")
        )
        
        # The result from dispatch_specific_activity_request should match TryCreateActivityResponse structure
        return JSONResponse(status_code=200 if result["success"] else 400, content=result)

    except HTTPException as http_exc:
        # Re-raise HTTPException to let FastAPI handle it
        raise http_exc
    except Exception as e:
        log.error(f"Error in /api/v1/engine/try-create-activity for {request_data.citizenUsername}, type {request_data.activityType}: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"success": False, "message": f"Internal server error: {str(e)}", "activity": None, "reason": "internal_server_error"})


# The scheduler is now started via the lifespan event manager above.
# The direct call to start_scheduler() is removed.

@app.get("/api/list-music-files")
async def list_music_files_endpoint():
    """
    Lists all MP3 files in the configured music directory on the backend.
    The music directory is determined by PERSISTENT_ASSETS_PATH_ENV + '/music'.
    """
    if not PERSISTENT_ASSETS_PATH_ENV:
        print("CRITICAL ERROR: PERSISTENT_ASSETS_PATH environment variable is not set for the backend.")
        # Log to console, but also return a clear error to the caller
        raise HTTPException(status_code=500, detail="Server configuration error: Asset path not set.")

    music_dir_on_backend = pathlib.Path(PERSISTENT_ASSETS_PATH_ENV).joinpath("music")
    
    if not music_dir_on_backend.exists() or not music_dir_on_backend.is_dir():
        print(f"Music directory not found on backend: {music_dir_on_backend}")
        # If the directory is expected but not found, this could be an error.
        # For robustness, let's return success with an empty list if it's just empty or missing.
        return JSONResponse(content={"success": True, "files": []})

    try:
        files: List[str] = [
            f.name for f in music_dir_on_backend.iterdir() 
            if f.is_file() and f.name.lower().endswith('.mp3')
        ]
        print(f"Found {len(files)} music files in {music_dir_on_backend}: {files}")
        return JSONResponse(content={"success": True, "files": files})
    except Exception as e:
        print(f"Error listing music files on backend from {music_dir_on_backend}: {e}")
        traceback.print_exc(file=sys.stdout) # Log full traceback for backend debugging
        raise HTTPException(status_code=500, detail=f"Failed to list music files: {str(e)}")
