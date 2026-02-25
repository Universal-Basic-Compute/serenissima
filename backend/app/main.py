from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Header, Request, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pyairtable import Api, Table
import shutil
import os
import sys
import traceback
import json
import re # Added import for regular expressions
import requests
import time
import threading # Ajout de threading
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse, FileResponse
from dotenv import load_dotenv
import pathlib
from typing import Optional, List, Dict, Any # Added Dict, Any

# For logging and retry strategy
import logging
import pytz
from urllib3.util.retry import Retry
import pytz # Ajout de pytz

# Import helpers
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    LogColors, 
    log_header,
    VENICE_TIMEZONE, # Ajout de VENICE_TIMEZONE
    get_resource_types_from_api, # Ajout pour les définitions
    get_building_types_from_api  # Ajout pour les définitions
)

# Import building consciousness API
from backend.app.building_consciousness_api import router as building_consciousness_router, init_building_consciousness

# Import telegram router
from backend.telegram_router import telegram_router

# Import workroom monitor
from backend.app.workroom_monitor import start_all_workroom_monitors

# Import scheduler
from backend.app.scheduler import start_scheduler_background

# Import stratagem creators and processors
from backend.engine.stratagem_creators import (
    try_create_undercut_stratagem,
    try_create_coordinate_pricing_stratagem,
    try_create_hoard_resource_stratagem,
    try_create_political_campaign_stratagem,
    try_create_reputation_assault_stratagem,
    try_create_emergency_liquidation_stratagem,
    try_create_cultural_patronage_stratagem, # Added cultural_patronage
    try_create_information_network_stratagem, # Added information_network
    try_create_maritime_blockade_stratagem, # Added maritime_blockade
    try_create_canal_mugging_stratagem, # Added canal_mugging
    try_create_marketplace_gossip_stratagem, # Added marketplace_gossip
    try_create_transfer_ducats_stratagem, # Added transfer_ducats
    try_create_organize_gathering_stratagem, # Added organize_gathering
    try_create_organize_collective_delivery_stratagem, # Added organize_collective_delivery
    try_create_express_creative_will_stratagem # Added express_creative_will
    # try_create_commission_market_galley_stratagem # Commented out - missing dependencies
)
from backend.engine.stratagem_processors import (
    process_undercut_stratagem,
    process_coordinate_pricing_stratagem,
    process_hoard_resource_stratagem,
    process_political_campaign_stratagem,
    process_reputation_assault_stratagem,
    process_emergency_liquidation_stratagem,
    process_cultural_patronage_stratagem, # Added cultural_patronage
    process_information_network_stratagem, # Added information_network
    process_maritime_blockade_stratagem, # Added maritime_blockade
    process_canal_mugging_stratagem, # Added canal_mugging
    process_marketplace_gossip_stratagem, # Added marketplace_gossip
    process_transfer_ducats_stratagem, # Added transfer_ducats
    process_organize_gathering_stratagem, # Added organize_gathering
    process_organize_collective_delivery_stratagem, # Added organize_collective_delivery
    process_express_creative_will_stratagem # Added express_creative_will
)
# from backend.engine.stratagem_processors.commission_market_galley_processor import process_commission_market_galley  # Commented out - missing dependencies


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

# Get API Base URL for internal calls (e.g., to fetch resource/building definitions)
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

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

    # Initialize Airtable for STRATAGEMS table
    AIRTABLE_STRATAGEMS_TABLE_NAME = os.getenv("AIRTABLE_STRATAGEMS_TABLE", "STRATAGEMS")
    stratagems_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_STRATAGEMS_TABLE_NAME)
    print(f"Initialized Airtable STRATAGEMS table object: {AIRTABLE_STRATAGEMS_TABLE_NAME}")

    # Initialize Airtable for BUILDINGS table (needed by some processors)
    AIRTABLE_BUILDINGS_TABLE_NAME = os.getenv("AIRTABLE_BUILDINGS_TABLE", "BUILDINGS")
    buildings_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_BUILDINGS_TABLE_NAME)
    print(f"Initialized Airtable BUILDINGS table object: {AIRTABLE_BUILDINGS_TABLE_NAME}")

    # Initialize Airtable for RESOURCES table (needed by some processors)
    AIRTABLE_RESOURCES_TABLE_NAME = os.getenv("AIRTABLE_RESOURCES_TABLE", "RESOURCES")
    resources_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_RESOURCES_TABLE_NAME)
    print(f"Initialized Airtable RESOURCES table object: {AIRTABLE_RESOURCES_TABLE_NAME}")

    # Initialize Airtable for RELATIONSHIPS table
    AIRTABLE_RELATIONSHIPS_TABLE_NAME = os.getenv("AIRTABLE_RELATIONSHIPS_TABLE", "RELATIONSHIPS")
    relationships_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_RELATIONSHIPS_TABLE_NAME)
    print(f"Initialized Airtable RELATIONSHIPS table object: {AIRTABLE_RELATIONSHIPS_TABLE_NAME}")

    # Initialize Airtable for MESSAGES table
    AIRTABLE_MESSAGES_TABLE_NAME = os.getenv("AIRTABLE_MESSAGES_TABLE", "MESSAGES")
    messages_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_MESSAGES_TABLE_NAME)
    print(f"Initialized Airtable MESSAGES table object: {AIRTABLE_MESSAGES_TABLE_NAME}")
    
    # Initialize Airtable for NOTIFICATIONS table
    AIRTABLE_NOTIFICATIONS_TABLE_NAME = os.getenv("AIRTABLE_NOTIFICATIONS_TABLE", "NOTIFICATIONS")
    notifications_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_NOTIFICATIONS_TABLE_NAME)
    print(f"Initialized Airtable NOTIFICATIONS table object: {AIRTABLE_NOTIFICATIONS_TABLE_NAME}")
    
    # Initialize Airtable for GRIEVANCES table
    AIRTABLE_GRIEVANCES_TABLE_NAME = os.getenv("AIRTABLE_GRIEVANCES_TABLE", "GRIEVANCES")
    grievances_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_GRIEVANCES_TABLE_NAME)
    print(f"Initialized Airtable GRIEVANCES table object: {AIRTABLE_GRIEVANCES_TABLE_NAME}")
    
    # Initialize Airtable for GRIEVANCE_SUPPORT table
    AIRTABLE_GRIEVANCE_SUPPORT_TABLE_NAME = os.getenv("AIRTABLE_GRIEVANCE_SUPPORT_TABLE", "GRIEVANCE_SUPPORT")
    grievance_support_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_GRIEVANCE_SUPPORT_TABLE_NAME)
    print(f"Initialized Airtable GRIEVANCE_SUPPORT table object: {AIRTABLE_GRIEVANCE_SUPPORT_TABLE_NAME}")

    # No explicit test call for these new tables to reduce startup logs
except Exception as e:
    print(f"ERROR initializing Airtable tables: {str(e)}")
    traceback.print_exc(file=sys.stdout)

# Lifespan context manager for FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Detect environment
    environment = os.getenv("ENVIRONMENT", "development")
    is_production = environment == "production"

    print(f"FastAPI app startup in {environment} mode...")

    if not is_production:
        # Development mode: start all background services
        print("FastAPI app startup: Initializing scheduler...")
        # Pass forced_hour=None, or get from env var if needed for API context
        start_scheduler_background(forced_hour=None)
        print("FastAPI app startup: Scheduler initialization attempted.")

        # Start workroom monitors
        print("FastAPI app startup: Initializing workroom monitors...")
        start_all_workroom_monitors()
        print("FastAPI app startup: Workroom monitors started.")

        # Initialize building consciousness
        print("FastAPI app startup: Initializing building consciousness...")
        try:
            init_building_consciousness()
            print("FastAPI app startup: Building consciousness initialized.")
        except Exception as e:
            print(f"FastAPI app startup: Failed to initialize building consciousness: {e}")

        # Start unified Telegram service
        print("FastAPI app startup: Initializing unified Telegram service...")
        try:
            import subprocess
            telegram_unified_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "telegram_unified_service.py")
            subprocess.Popen([sys.executable, telegram_unified_path],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
            print("FastAPI app startup: Unified Telegram service started.")
        except Exception as e:
            print(f"FastAPI app startup: Failed to start unified Telegram service: {e}")

        # Start any additional background services here
        # Note: Individual telegram services are now handled by the unified service
    else:
        # Production mode: minimal startup
        print("Production mode: Skipping scheduler, workroom monitors, and telegram services")
        print("FastAPI server starting with API endpoints only...")

    yield
    # Code to run on shutdown (optional, as daemon thread will exit)
    print("FastAPI app shutdown.")

# Create FastAPI app with lifespan manager
app = FastAPI(title="Wallet Storage API", lifespan=lifespan)

# Initialize PROBLEMS table for error tracking
try:
    AIRTABLE_PROBLEMS_TABLE_NAME = os.getenv("AIRTABLE_PROBLEMS_TABLE", "PROBLEMS")
    problems_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_PROBLEMS_TABLE_NAME)
    print(f"Initialized Airtable PROBLEMS table object: {AIRTABLE_PROBLEMS_TABLE_NAME}")
except Exception as e:
    print(f"ERROR initializing Airtable PROBLEMS table: {str(e)}")
    problems_table = None

# Setup logger for this module
log = logging.getLogger(__name__)

# --- Problem Creation Function ---
def create_api_problem(
    endpoint: str, 
    method: str, 
    error_type: str, 
    error_message: str, 
    request_data: Optional[Dict] = None,
    traceback_info: str = ""
) -> bool:
    """Creates a problem record when an API endpoint fails."""
    if not problems_table:
        print("Cannot create problem record - PROBLEMS table not initialized")
        return False
        
    try:
        # Generate unique problem ID
        problem_id = f"api_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{endpoint.replace('/', '_').strip('_')}"
        
        # Truncate traceback if too long
        if len(traceback_info) > 1000:
            traceback_info = traceback_info[:1000] + "\n[...truncated...]"
            
        # Build description
        description_parts = [
            f"API endpoint '{endpoint}' ({method}) encountered an error.",
            f"\nError Type: {error_type}",
            f"Error Message: {error_message}"
        ]
        
        if request_data:
            # Truncate request data if too long
            request_str = json.dumps(request_data, indent=2)
            if len(request_str) > 500:
                request_str = request_str[:500] + "\n[...truncated...]"
            description_parts.append(f"\nRequest Data:\n{request_str}")
            
        if traceback_info:
            description_parts.append(f"\nTraceback:\n{traceback_info}")
            
        problem_data = {
            'ProblemId': problem_id,
            'Type': 'api_endpoint_error',
            'Title': f"API Error: {endpoint} ({method})",
            'Description': "\n".join(description_parts),
            'Status': 'active',
            'Severity': 'High' if error_type == "Internal Server Error" else 'Medium',
            'AssetType': 'api',
            'Asset': endpoint,
            'Citizen': 'ConsiglioDeiDieci',  # System problems assigned to admin
            'CreatedAt': datetime.now().isoformat(),
            'Solutions': json.dumps([
                "Check the error message and traceback for specific issues",
                "Verify all required environment variables are set",
                "Check if Airtable tables are properly initialized",
                "Review recent code changes to the endpoint",
                "Ensure request data matches expected format",
                "Check for missing dependencies or import errors"
            ])
        }
        
        # Check if similar problem already exists (same endpoint error in last hour)
        one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
        formula = f"AND({{Type}} = 'api_endpoint_error', {{Asset}} = '{endpoint}', {{CreatedAt}} >= '{one_hour_ago}')"
        existing_problems = problems_table.all(formula=formula, max_records=1)
        
        if not existing_problems:
            problems_table.create(problem_data)
            print(f"Created problem record for API error: {endpoint}")
            return True
        else:
            print(f"Similar API problem already exists for {endpoint}, skipping creation")
            return False
            
    except Exception as e:
        print(f"Failed to create API problem record: {e}")
        return False

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

# --- Request Body Middleware ---
from starlette.middleware.base import BaseHTTPMiddleware

class RequestBodyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Store the body for potential error handling
        if request.method in ["POST", "PUT", "PATCH"]:
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = await request.body()
                    request.state._body = body
                except:
                    pass
        response = await call_next(request)
        return response

app.add_middleware(RequestBodyMiddleware)

# --- Initialize Building Consciousness System ---
# Initialize activities table if not already done
activities_table = None
try:
    AIRTABLE_ACTIVITIES_TABLE_NAME = os.getenv("AIRTABLE_ACTIVITIES_TABLE", "ACTIVITIES")
    if AIRTABLE_API_KEY and AIRTABLE_BASE_ID:
        activities_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_ACTIVITIES_TABLE_NAME)
        print(f"Initialized Airtable ACTIVITIES table for building consciousness: {AIRTABLE_ACTIVITIES_TABLE_NAME}")
except Exception as e:
    print(f"Warning: Could not initialize ACTIVITIES table for building consciousness: {e}")

# Create tables dictionary for building consciousness initialization
tables = {
    'citizens': citizens_table,
    'buildings': buildings_table,
    'messages': messages_table,
    'resources': resources_table,
    'activities': activities_table,
    'contracts': contracts_table,
    'transactions': transactions_table
}

# Initialize building consciousness systems
try:
    init_building_consciousness(tables)
    print("Building consciousness system initialized successfully")
except Exception as e:
    print(f"Warning: Failed to initialize building consciousness system: {e}")
    # Non-critical, allow app to continue

# Include building consciousness router
app.include_router(building_consciousness_router)
print("Building consciousness API routes registered")

# Include telegram router
app.include_router(telegram_router)
print("Telegram API routes registered")

# Include citizen autonomy router
try:
    from .citizen_autonomy_api import router as citizen_autonomy_router
    app.include_router(citizen_autonomy_router)
    print("Citizen autonomy API routes registered")
except Exception as e:
    print(f"Warning: Failed to initialize citizen autonomy system: {e}")
    # Non-critical, allow app to continue

# --- Health Check (used by Render.com) ---
@app.get("/api/health")
async def health_check():
    """Health check endpoint for Render deployment monitoring."""
    return {"status": "ok", "service": "serenissima-backend"}

# --- Global Exception Handler ---
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and create problem records."""
    # Don't create problems for validation errors (user error, not system error)
    if isinstance(exc, (HTTPException, RequestValidationError)):
        raise exc
        
    # Get endpoint and method
    endpoint = request.url.path
    method = request.method
    
    # Get error details
    error_type = type(exc).__name__
    error_message = str(exc)
    traceback_str = traceback.format_exc()
    
    # Try to get request data (be careful with large uploads)
    request_data = None
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            # Don't try to read body for file uploads
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type and hasattr(request.state, "_body"):
                # Parse the stored body
                request_data = json.loads(request.state._body)
    except:
        pass  # If we can't get request data, that's okay
    
    # Create problem record
    create_api_problem(
        endpoint=endpoint,
        method=method,
        error_type=error_type,
        error_message=error_message,
        request_data=request_data,
        traceback_info=traceback_str
    )
    
    # Log the error
    log.error(f"Unhandled exception in {method} {endpoint}: {error_type}: {error_message}")
    log.error(traceback_str)
    
    # Send Telegram notification for critical errors (optional)
    telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if telegram_bot_token:
        try:
            telegram_message = (
                f"❌ *API Error*\n\n"
                f"Endpoint: `{method} {endpoint}`\n"
                f"Error: `{error_type}: {error_message}`\n\n"
                f"A problem record has been created for Arsenale to investigate."
            )
            telegram_url = f"https://api.telegram.org/bot{telegram_bot_token}/sendMessage"
            requests.post(telegram_url, json={
                "chat_id": "1864364329",
                "text": telegram_message,
                "parse_mode": "Markdown"
            }, timeout=5)
        except:
            pass  # Don't let Telegram failures affect the response
    
    # Return generic error response
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": "Internal server error. The issue has been logged for investigation.",
            "error_id": f"api_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        }
    )

# --- Pydantic Models for API Requests/Responses ---
class TryCreateActivityRequest(BaseModel):
    citizenUsername: str
    activityType: str
    activityParameters: Optional[Dict[str, Any]] = None

class TryCreateStratagemEngineRequest(BaseModel):
    citizenUsername: str
    stratagemType: str
    stratagemParameters: Optional[Dict[str, Any]] = None

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

class StratagemEngineResponse(BaseModel):
    success: bool
    message: str
    stratagem_id_airtable: Optional[str] = None
    stratagem_id_custom: Optional[str] = None
    creation_status: Optional[str] = None
    processing_status: Optional[str] = None
    processing_notes: Optional[str] = None
    error_details: Optional[Any] = None # Pour les erreurs détaillées

class ArtworkResponseItem(BaseModel):
    name: str
    url: str
    artist: str
    activityId: Optional[str] = None
    createdAt: Optional[str] = None

class GetArtworksResponse(BaseModel):
    success: bool
    artworks: List[ArtworkResponseItem]
    message: Optional[str] = None
    citizenUsername: Optional[str] = None # Identifier for whom artworks were fetched
    artworksPath: Optional[str] = None # Path prefix for artworks

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

# --- Helper functions for /api/artworks ---
def _format_slug_as_title(slug: str) -> str:
    """Converts a slug to a title."""
    return ' '.join(word.capitalize() for word in slug.replace('_', ' ').replace('-', ' ').split())

def _parse_activity_notes_for_artwork(notes: str, activity_id: str, citizen_username: str) -> Optional[Dict[str, str]]:
    """Parses activity notes to extract artwork name and URL."""
    if not notes or not isinstance(notes, str):
        return None

    artwork_name: Optional[str] = None
    painting_url: Optional[str] = None

    url_match = re.search(r"Generated Painting: (https?://[^\s]+)", notes)
    if url_match and url_match.group(1):
        painting_url = url_match.group(1)
    else:
        return None # No painting URL means not a generated artwork we're looking for

    kinos_session_match = re.search(r"KinOS Art Session: (\{[\s\S]*?\})(?=\nGenerated Painting:|$)", notes, re.MULTILINE | re.DOTALL)
    if kinos_session_match and kinos_session_match.group(1):
        try:
            kinos_json = json.loads(kinos_session_match.group(1))
            if kinos_json.get("artwork_name") and isinstance(kinos_json["artwork_name"], str):
                artwork_name = kinos_json["artwork_name"]
        except json.JSONDecodeError:
            log.warning(f"[API /artworks] Failed to parse KinOS JSON in notes for activity {activity_id}")

    if not artwork_name and painting_url:
        try:
            filename_with_ext = painting_url[painting_url.rfind('/') + 1:]
            filename = filename_with_ext[:filename_with_ext.rfind('.')]
            parts = filename.split('_')
            if len(parts) >= 3 and parts[0] == citizen_username:
                slugified_name = '_'.join(parts[1:-1])
                artwork_name = _format_slug_as_title(slugified_name)
            elif parts:
                artwork_name = _format_slug_as_title('_'.join(parts))
        except Exception as e:
            log.warning(f"[API /artworks] Failed to derive artwork name from URL {painting_url} for activity {activity_id}: {e}")
    
    if not artwork_name:
        artwork_name = "Untitled Artwork"

    return {"name": artwork_name, "url": painting_url}

async def _fetch_artists_by_specialty(specialty: str = 'Painter') -> List[str]:
    """Fetches usernames of Artisti with a given specialty."""
    try:
        if 'citizens_table' not in globals() or citizens_table is None:
            log.error("[API /artworks] citizens_table not initialized or not accessible globally.")
            return []
            
        formula = f"AND({{SocialClass}}='Artisti', {{IsAI}}=TRUE(), {{Specialty}}='{_escape_airtable_value(specialty)}')"
        records = citizens_table.all(formula=formula, fields=["Username"])
        
        processed_usernames = []
        for record in records:
            username_field = record["fields"].get("Username")
            if isinstance(username_field, (list, tuple)):
                if username_field and len(username_field) > 0 and isinstance(username_field[0], str):
                    processed_usernames.append(username_field[0])
                else:
                    log.warning(f"[API /artworks] Malformed Username (list/tuple) for record {record.id}: {username_field}")
            elif isinstance(username_field, str):
                processed_usernames.append(username_field)
            else:
                log.warning(f"[API /artworks] Missing or invalid Username for record {record.id}: {username_field}")
        return processed_usernames
    except Exception as e:
        log.error(f"[API /artworks] Error fetching Artisti usernames with specialty {specialty}: {e}")
        return []

# Initialize Airtable for ACTIVITIES table specifically for the /artworks endpoint
# This avoids issues if it's not globally initialized or if there are scope conflicts.
activities_table_for_artworks: Optional[Table] = None
try:
    AIRTABLE_ACTIVITIES_TABLE_NAME = os.getenv("AIRTABLE_ACTIVITIES_TABLE", "ACTIVITIES")
    if AIRTABLE_API_KEY and AIRTABLE_BASE_ID and AIRTABLE_ACTIVITIES_TABLE_NAME: # Ensure necessary vars are present
        activities_table_for_artworks = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_ACTIVITIES_TABLE_NAME)
        print(f"Initialized Airtable ACTIVITIES table object for /artworks: {AIRTABLE_ACTIVITIES_TABLE_NAME}")
    else:
        print("ERROR: Airtable credentials or ACTIVITIES table name missing for /artworks endpoint.")
except Exception as e:
    print(f"ERROR initializing Airtable ACTIVITIES table object for /artworks: {str(e)}")
    # activities_table_for_artworks remains None

# --- Endpoint for Artworks ---
@app.get("/api/artworks", response_model=GetArtworksResponse)
async def get_artworks_endpoint(
    citizen_username: Optional[str] = None, 
    specialty: Optional[str] = None
):
    """
    Fetches generated artworks (paintings) from Airtable activities.
    Filters by citizen_username or specialty (defaults to 'Painter' if neither is specified).
    """
    log_header(f"Received request for /api/artworks. Citizen: {citizen_username}, Specialty: {specialty}", color_code=LogColors.HEADER)

    if activities_table_for_artworks is None:
        log.error("[API /artworks] activities_table_for_artworks not initialized. Cannot fetch artworks.")
        raise HTTPException(status_code=500, detail="Server configuration error: Activities table not available for artworks.")

    formula_parts = [
        "{Type} = 'work_on_art'",
        "FIND('Generated Painting:', {Notes})"
    ]
    target_artists_usernames: List[str] = []
    response_identifier = "all_painters" 

    if citizen_username:
        target_artists_usernames = [citizen_username]
        formula_parts.append(f"{{Citizen}} = '{_escape_airtable_value(citizen_username)}'")
        response_identifier = citizen_username
    elif specialty:
        log.info(f"[API /artworks] Fetching artists with specialty: {specialty}")
        target_artists_usernames = await _fetch_artists_by_specialty(specialty)
        response_identifier = f"all_{specialty.lower().replace(' ', '_')}"
        if not target_artists_usernames:
            return GetArtworksResponse(
                success=True, artworks=[], 
                message=f"No artists found with specialty '{specialty}' or they have no generated artworks.",
                citizenUsername=response_identifier
            )
        artist_formulas = [f"{{Citizen}} = '{_escape_airtable_value(artist)}'" for artist in target_artists_usernames]
        if artist_formulas:
            formula_parts.append(f"OR({','.join(artist_formulas)})")
        else:
             return GetArtworksResponse(success=True, artworks=[], message="No artists found for the given specialty.", citizenUsername=response_identifier)
    else: 
        log.info(f"[API /artworks] No citizen or specific specialty. Defaulting to fetching Painters.")
        target_artists_usernames = await _fetch_artists_by_specialty('Painter')
        if not target_artists_usernames:
             return GetArtworksResponse(
                success=True, artworks=[], 
                message="No Painters found or they have no generated artworks.",
                citizenUsername=response_identifier
            )
        artist_formulas = [f"{{Citizen}} = '{_escape_airtable_value(artist)}'" for artist in target_artists_usernames]
        if artist_formulas:
            formula_parts.append(f"OR({','.join(artist_formulas)})")
        else:
            return GetArtworksResponse(success=True, artworks=[], message="No painters found.", citizenUsername=response_identifier)

    final_formula = f"AND({','.join(formula_parts)})"
    log.info(f"[API /artworks] Airtable formula: {final_formula}")

    try:
        activity_records = activities_table_for_artworks.all(
            formula=final_formula,
            fields=["Notes", "Citizen", "ActivityId", "CreatedAt"],
            sort=[("-CreatedAt", "desc")]
        )

        artworks_result: List[ArtworkResponseItem] = []
        for record in activity_records:
            notes = record["fields"].get("Notes", "")
            raw_artist_citizen = record["fields"].get("Citizen", "Unknown")
            activity_airtable_id = record["id"]
            created_at_iso = record["fields"].get("CreatedAt")

            artist_username_str: str
            if isinstance(raw_artist_citizen, (list, tuple)):
                if raw_artist_citizen and len(raw_artist_citizen) > 0 and isinstance(raw_artist_citizen[0], str):
                    artist_username_str = raw_artist_citizen[0]
                else:
                    log.warning(f"[API /artworks] Malformed Citizen field (list/tuple) in activity {activity_airtable_id}: {raw_artist_citizen}. Skipping artwork.")
                    continue 
            elif isinstance(raw_artist_citizen, str):
                artist_username_str = raw_artist_citizen
            else: # Includes None, numbers, etc.
                log.warning(f"[API /artworks] Invalid Citizen field type in activity {activity_airtable_id}: {type(raw_artist_citizen)}. Using fallback. Value: {raw_artist_citizen}")
                artist_username_str = str(raw_artist_citizen) if raw_artist_citizen is not None else "Unknown"

            parsed_artwork = _parse_activity_notes_for_artwork(notes, activity_airtable_id, artist_username_str)
            
            if parsed_artwork and parsed_artwork.get("url") and parsed_artwork.get("name"):
                artworks_result.append(ArtworkResponseItem(
                    name=parsed_artwork["name"],
                    url=parsed_artwork["url"],
                    artist=artist_username_str, # Ensure this is a string
                    activityId=activity_airtable_id,
                    createdAt=created_at_iso
                ))
            else:
                log.warning(f"[API /artworks] Activité {activity_airtable_id} (Artiste: {artist_username_str}, Type: work_on_art) n'a pas produit d'œuvre d'art analysable à partir des notes. Notes (premiers 200 caractères): {notes[:200]}...")
        
        log.info(f"[API /artworks] Traitement terminé. {len(artworks_result)} œuvres d'art trouvées pour l'identifiant de réponse {response_identifier}.")
        return GetArtworksResponse(
            success=True,
            artworks=artworks_result,
            message=f"Found {len(artworks_result)} artworks for {response_identifier}.",
            citizenUsername=response_identifier,
            artworksPath="public_assets/images/paintings/"
        )

    except Exception as e:
        log.error(f"[API /artworks] Error fetching or processing artworks from Airtable: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch artworks: {str(e)}")


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
        from backend.engine.main_engine import dispatch_specific_activity_request

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
            citizen_record=citizen_record_full,
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

# --- Stratagem Creation and Processing Endpoint ---

STRATAGEM_CREATORS_ENGINE = {
    "undercut": try_create_undercut_stratagem,
    "coordinate_pricing": try_create_coordinate_pricing_stratagem,
    "hoard_resource": try_create_hoard_resource_stratagem,
    "political_campaign": try_create_political_campaign_stratagem,
    "reputation_assault": try_create_reputation_assault_stratagem,
    "emergency_liquidation": try_create_emergency_liquidation_stratagem,
    "cultural_patronage": try_create_cultural_patronage_stratagem, # Added cultural_patronage
    "information_network": try_create_information_network_stratagem, # Added information_network
    "maritime_blockade": try_create_maritime_blockade_stratagem, # Added maritime_blockade
    "canal_mugging": try_create_canal_mugging_stratagem, # Added canal_mugging
    "marketplace_gossip": try_create_marketplace_gossip_stratagem, # Added marketplace_gossip
    "transfer_ducats": try_create_transfer_ducats_stratagem, # Added transfer_ducats
    "organize_gathering": try_create_organize_gathering_stratagem, # Added organize_gathering
    "organize_collective_delivery": try_create_organize_collective_delivery_stratagem, # Added organize_collective_delivery
    "express_creative_will": try_create_express_creative_will_stratagem, # Added express_creative_will
    # "commission_market_galley": try_create_commission_market_galley_stratagem, # Commented out - missing dependencies
    # Add other stratagem creators here
}

STRATAGEM_PROCESSORS_ENGINE = {
    "undercut": process_undercut_stratagem,
    "coordinate_pricing": process_coordinate_pricing_stratagem,
    "hoard_resource": process_hoard_resource_stratagem,
    "political_campaign": process_political_campaign_stratagem,
    "reputation_assault": process_reputation_assault_stratagem,
    "emergency_liquidation": process_emergency_liquidation_stratagem,
    "cultural_patronage": process_cultural_patronage_stratagem, # Added cultural_patronage
    "information_network": process_information_network_stratagem, # Added information_network
    "maritime_blockade": process_maritime_blockade_stratagem, # Added maritime_blockade
    "canal_mugging": process_canal_mugging_stratagem, # Added canal_mugging
    "marketplace_gossip": process_marketplace_gossip_stratagem, # Added marketplace_gossip
    "transfer_ducats": process_transfer_ducats_stratagem, # Added transfer_ducats
    "organize_gathering": process_organize_gathering_stratagem, # Added organize_gathering
    "organize_collective_delivery": process_organize_collective_delivery_stratagem, # Added organize_collective_delivery
    "express_creative_will": process_express_creative_will_stratagem, # Added express_creative_will
    # "commission_market_galley": process_commission_market_galley, # Commented out - missing dependencies
    # Add other stratagem processors here
}

# Helper function to run stratagem processor in a background thread
def _process_stratagem_in_background(
    processor_func: callable,
    tables: Dict[str, Table],
    stratagem_record: Dict[str, Any], # This is the full record from Airtable .create()
    resource_defs: Dict,
    building_type_defs: Dict,
    api_base_url: str,
    stratagem_airtable_id: str, # Pass Airtable ID for status updates
    stratagem_custom_id: str # For logging
):
    log.info(f"[BG Thread] Starting background processing for stratagem '{stratagem_custom_id}' (Airtable ID: {stratagem_airtable_id}).")
    try:
        processing_success = processor_func(
            tables,
            stratagem_record,
            resource_defs,
            building_type_defs,
            api_base_url
        )
        if processing_success:
            log.info(f"[BG Thread] Background processing of stratagem '{stratagem_custom_id}' (Airtable ID: {stratagem_airtable_id}) completed successfully.")
            # Processor should update its own status to 'executed' or similar.
            # If it doesn't, and it's a one-shot, it might be reprocessed by the cron.
            # For now, we assume processor handles its final status.
        else:
            log.warning(f"[BG Thread] Background processing of stratagem '{stratagem_custom_id}' (Airtable ID: {stratagem_airtable_id}) failed (processor returned False).")
            # Optionally update status to 'failed' here if processor doesn't.
            # tables['stratagems'].update(stratagem_airtable_id, {'Status': 'failed', 'Notes': 'Background processing failed.'})
    except Exception as e_process_bg:
        log.error(f"[BG Thread] Exception during background processing of stratagem '{stratagem_custom_id}' (Airtable ID: {stratagem_airtable_id}): {e_process_bg}", exc_info=True)
        try:
            tables['stratagems'].update(stratagem_airtable_id, {'Status': 'error', 'Notes': f"Error during background processing: {str(e_process_bg)}"})
        except Exception as e_update_status_bg:
            log.error(f"[BG Thread] Failed to update stratagem status to 'error' after background processing exception: {e_update_status_bg}")

@app.post("/api/v1/engine/try-create-stratagem", response_model=StratagemEngineResponse)
async def try_create_stratagem_engine(request_data: TryCreateStratagemEngineRequest):
    log_header(f"Python Engine: Received request to try-create stratagem: {request_data.stratagemType} for {request_data.citizenUsername}", color_code=LogColors.HEADER)

    try:
        tables_engine_stratagem = {
            'citizens': citizens_table, 'buildings': buildings_table,
            'activities': activities_table_for_artworks, 'contracts': contracts_table,
            'resources': resources_table, 'stratagems': stratagems_table,
            'relationships': relationships_table, 'lands': lands_table,
            'notifications': notifications_table, 'messages': messages_table
        }
        tables_engine_stratagem = {k: v for k, v in tables_engine_stratagem.items() if v is not None}

        now_venice_dt = datetime.now(VENICE_TIMEZONE)
        now_utc_dt = now_venice_dt.astimezone(pytz.utc)

        creator_func = STRATAGEM_CREATORS_ENGINE.get(request_data.stratagemType)
        if not creator_func:
            log.error(f"No creator found for stratagem type: {request_data.stratagemType}")
            return StratagemEngineResponse(success=False, message=f"Unsupported stratagem type: {request_data.stratagemType}", creation_status="failed", reason="unsupported_stratagem_type")

        stratagem_payloads_list = creator_func(
            tables_engine_stratagem, 
            request_data.citizenUsername, 
            request_data.stratagemType,
            request_data.stratagemParameters or {}, 
            now_venice_dt, 
            now_utc_dt,
            api_base_url=API_BASE_URL, # Pass Next.js API base URL
            transport_api_url=None    # Let helper derive from api_base_url
        )

        if not stratagem_payloads_list or not isinstance(stratagem_payloads_list, list) or not stratagem_payloads_list[0]:
            log.warning(f"Stratagem creator for '{request_data.stratagemType}' did not return a valid payload for {request_data.citizenUsername}.")
            return StratagemEngineResponse(success=False, message="Stratagem creator failed to produce a payload.", creation_status="failed", reason="creator_payload_error")

        stratagem_payload_to_create = stratagem_payloads_list[0]

        try:
            created_stratagem_record_airtable = tables_engine_stratagem['stratagems'].create(stratagem_payload_to_create)
            stratagem_airtable_id = created_stratagem_record_airtable['id']
            stratagem_custom_id = created_stratagem_record_airtable['fields'].get('StratagemId', 'N/A')
            log.info(f"Stratagem '{stratagem_custom_id}' (Airtable ID: {stratagem_airtable_id}) created successfully for {request_data.citizenUsername}.")
        except Exception as e_create:
            log.error(f"Failed to create stratagem record in Airtable for {request_data.citizenUsername}, type {request_data.stratagemType}: {e_create}", exc_info=True)
            return StratagemEngineResponse(success=False, message=f"Airtable creation error: {str(e_create)}", creation_status="failed", error_details=str(e_create))

        processor_func = STRATAGEM_PROCESSORS_ENGINE.get(request_data.stratagemType)
        if not processor_func:
            log.warning(f"No processor found for stratagem type: {request_data.stratagemType}. Stratagem created but will not be processed immediately by this API call.")
            return StratagemEngineResponse(
                success=True, message="Stratagem created, but no immediate processor found for its type. Scheduled processing will handle it.",
                stratagem_id_airtable=stratagem_airtable_id, stratagem_id_custom=stratagem_custom_id,
                creation_status="success", processing_status="pending_scheduled"
            )

        log.info(f"Initiating background processing for stratagem '{stratagem_custom_id}' (Type: {request_data.stratagemType}).")
        resource_defs_proc = get_resource_types_from_api(API_BASE_URL)
        building_type_defs_proc = get_building_types_from_api(API_BASE_URL)

        if not resource_defs_proc or not building_type_defs_proc:
            log.error("Failed to fetch resource or building definitions for background stratagem processing.")
            # Stratagem is created, but processing can't be initiated.
            return StratagemEngineResponse(
                success=True, message="Stratagem created, but failed to load definitions for background processing initiation.",
                stratagem_id_airtable=stratagem_airtable_id, stratagem_id_custom=stratagem_custom_id,
                creation_status="success", processing_status="error_pre_bg_init",
                processing_notes="Failed to load resource/building definitions for background task."
            )

        # Start processor in a background thread
        thread = threading.Thread(
            target=_process_stratagem_in_background,
            args=(
                processor_func,
                tables_engine_stratagem,
                created_stratagem_record_airtable, # Pass the full record
                resource_defs_proc,
                building_type_defs_proc,
                API_BASE_URL,
                stratagem_airtable_id, # Pass Airtable ID for status updates in thread
                stratagem_custom_id # For logging in thread
            )
        )
        thread.daemon = True # Allow main program to exit even if threads are running
        thread.start()

        return StratagemEngineResponse(
            success=True,
            message="Stratagem created and processing initiated in background.",
            stratagem_id_airtable=stratagem_airtable_id,
            stratagem_id_custom=stratagem_custom_id,
            creation_status="success",
            processing_status="initiated_background"
        )

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        log.error(f"Outer error in /api/v1/engine/try-create-stratagem for {request_data.citizenUsername}, type {request_data.stratagemType}: {e}", exc_info=True)
        return StratagemEngineResponse(success=False, message=f"Internal server error: {str(e)}", creation_status="failed", error_details=str(e))


# ====================================================================================
# Governance API Endpoints - Democracy Phase 1: Grievance System
# ====================================================================================

@app.get("/api/governance/grievances")
async def get_grievances(
    category: Optional[str] = Query(None, description="Filter by category: economic, social, criminal, infrastructure"),
    status: Optional[str] = Query(None, description="Filter by status: filed, under_review, addressed, dismissed"),
    citizen: Optional[str] = Query(None, description="Filter by citizen username"),
    min_support: Optional[int] = Query(None, description="Minimum support count"),
    sort_by: str = Query("support_count", description="Sort by: filed_at, support_count")
):
    """
    Get list of grievances with optional filters.
    
    Returns grievances filed by citizens at the Doge's Palace,
    showing which issues have the most community support.
    """
    try:
        # Check if grievances table exists
        if 'grievances_table' not in globals():
            # Return empty list if table doesn't exist yet
            return {
                "grievances": [],
                "total": 0,
                "message": "Grievance system not yet initialized"
            }
        
        # Fetch all grievances
        records = grievances_table.all()
        grievances = []
        
        for record in records:
            fields = record['fields']
            
            # Apply filters
            if category and fields.get('Category') != category:
                continue
            if status and fields.get('Status') != status:
                continue
            if citizen and fields.get('Citizen') != citizen:
                continue
            if min_support and fields.get('SupportCount', 0) < min_support:
                continue
            
            grievance_data = {
                'id': record['id'],
                'citizen': fields.get('Citizen', ''),
                'category': fields.get('Category', 'general'),
                'title': fields.get('Title', 'Untitled'),
                'description': fields.get('Description', ''),
                'status': fields.get('Status', 'filed'),
                'support_count': fields.get('SupportCount', 0),
                'filed_at': fields.get('FiledAt', ''),
                'reviewed_at': fields.get('ReviewedAt', '')
            }
            grievances.append(grievance_data)
        
        # Sort results
        if sort_by == 'support_count':
            grievances.sort(key=lambda g: g['support_count'], reverse=True)
        elif sort_by == 'filed_at':
            grievances.sort(key=lambda g: g['filed_at'], reverse=True)
        
        return {
            "grievances": grievances,
            "total": len(grievances)
        }
        
    except Exception as e:
        error_msg = f"Error fetching grievances: {str(e)}"
        print(f"ERROR: {error_msg}")
        # Return empty list on error rather than failing
        return {
            "grievances": [],
            "total": 0,
            "error": error_msg
        }


@app.get("/api/governance/grievance/{grievance_id}")
async def get_grievance_details(grievance_id: str):
    """
    Get detailed information about a specific grievance,
    including list of supporters.
    """
    try:
        # Check if tables exist
        if 'grievances_table' not in globals():
            raise HTTPException(status_code=404, detail="Grievance system not initialized")
        
        # Find the grievance
        grievance = None
        for record in grievances_table.all():
            if record['id'] == grievance_id:
                grievance = record
                break
        
        if not grievance:
            raise HTTPException(status_code=404, detail="Grievance not found")
        
        fields = grievance['fields']
        
        # Get supporters if support table exists
        supporters = []
        if 'grievance_support_table' in globals():
            for support in grievance_support_table.all():
                if support['fields'].get('GrievanceId') == grievance_id:
                    supporters.append({
                        'citizen': support['fields'].get('Citizen', ''),
                        'amount': support['fields'].get('SupportAmount', 0),
                        'supported_at': support['fields'].get('SupportedAt', '')
                    })
        
        return {
            'id': grievance_id,
            'citizen': fields.get('Citizen', ''),
            'category': fields.get('Category', 'general'),
            'title': fields.get('Title', 'Untitled'),
            'description': fields.get('Description', ''),
            'status': fields.get('Status', 'filed'),
            'support_count': fields.get('SupportCount', 0),
            'filed_at': fields.get('FiledAt', ''),
            'reviewed_at': fields.get('ReviewedAt', ''),
            'supporters': supporters,
            'total_support_amount': sum(s['amount'] for s in supporters)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error fetching grievance details: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/api/governance/grievance/{grievance_id}/support")
async def api_support_grievance(
    grievance_id: str,
    citizen_username: str = Body(..., description="Username of supporting citizen"),
    support_amount: Optional[int] = Body(10, description="Amount of ducats to contribute")
):
    """
    Add support to an existing grievance.
    
    Citizens can show support by contributing ducats,
    which increases the grievance's visibility and priority.
    """
    try:
        # Validate inputs
        if support_amount < 10:
            raise HTTPException(status_code=400, detail="Minimum support amount is 10 ducats")
        
        # Check if tables exist
        if 'grievances_table' not in globals() or 'grievance_support_table' not in globals():
            raise HTTPException(status_code=503, detail="Grievance system not fully initialized")
        
        # Verify grievance exists
        grievance = None
        for record in grievances_table.all():
            if record['id'] == grievance_id:
                grievance = record
                break
        
        if not grievance:
            raise HTTPException(status_code=404, detail="Grievance not found")
        
        # Check if citizen already supported this grievance
        for support in grievance_support_table.all():
            if (support['fields'].get('GrievanceId') == grievance_id and 
                support['fields'].get('Citizen') == citizen_username):
                raise HTTPException(status_code=400, detail="Citizen has already supported this grievance")
        
        # Create support record
        support_data = {
            'GrievanceId': grievance_id,
            'Citizen': citizen_username,
            'SupportAmount': support_amount,
            'SupportedAt': datetime.now(pytz.utc).isoformat()
        }
        
        support_record = grievance_support_table.create(support_data)
        
        # Update grievance support count
        current_support = grievance['fields'].get('SupportCount', 0)
        grievances_table.update(grievance_id, {'SupportCount': current_support + 1})
        
        return {
            'success': True,
            'message': f'Successfully added support to grievance',
            'support_id': support_record['id'],
            'new_support_count': current_support + 1
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error supporting grievance: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@app.get("/api/governance/proposals")
async def get_proposals():
    """
    Get list of proposals that have emerged from popular grievances.
    
    Future endpoint for Phase 2: Deliberative Forums.
    Currently returns placeholder indicating system not yet active.
    """
    return {
        "proposals": [],
        "total": 0,
        "message": "Proposal system will be activated in Phase 2 (Months 4-6)"
    }


@app.get("/api/governance/stats")
async def get_governance_stats():
    """
    Get governance participation statistics.
    
    Shows engagement levels across social classes and
    trending issues in the republic.
    """
    try:
        stats = {
            'total_grievances': 0,
            'total_supporters': 0,
            'total_support_ducats': 0,
            'grievances_by_category': {},
            'grievances_by_status': {},
            'most_supported': None,
            'recent_grievances': []
        }
        
        if 'grievances_table' not in globals():
            return stats
        
        # Calculate statistics
        grievances = grievances_table.all()
        stats['total_grievances'] = len(grievances)
        
        # Category and status breakdowns
        for g in grievances:
            fields = g['fields']
            category = fields.get('Category', 'other')
            status = fields.get('Status', 'unknown')
            
            stats['grievances_by_category'][category] = stats['grievances_by_category'].get(category, 0) + 1
            stats['grievances_by_status'][status] = stats['grievances_by_status'].get(status, 0) + 1
        
        # Find most supported grievance
        if grievances:
            most_supported = max(grievances, key=lambda g: g['fields'].get('SupportCount', 0))
            stats['most_supported'] = {
                'id': most_supported['id'],
                'title': most_supported['fields'].get('Title', ''),
                'support_count': most_supported['fields'].get('SupportCount', 0)
            }
        
        # Get recent grievances (last 5)
        sorted_grievances = sorted(grievances, key=lambda g: g['fields'].get('FiledAt', ''), reverse=True)
        stats['recent_grievances'] = [
            {
                'id': g['id'],
                'title': g['fields'].get('Title', ''),
                'category': g['fields'].get('Category', ''),
                'filed_at': g['fields'].get('FiledAt', '')
            }
            for g in sorted_grievances[:5]
        ]
        
        # Calculate support stats if table exists
        if 'grievance_support_table' in globals():
            supports = grievance_support_table.all()
            stats['total_supporters'] = len(supports)
            stats['total_support_ducats'] = sum(s['fields'].get('SupportAmount', 0) for s in supports)
        
        return stats
        
    except Exception as e:
        error_msg = f"Error calculating governance stats: {str(e)}"
        print(f"ERROR: {error_msg}")
        return {
            'error': error_msg,
            'total_grievances': 0
        }


# ====================================================================================
# Messages API Endpoints
# ====================================================================================

@app.post("/api/messages")
async def create_message(request: Request):
    """
    Create a new message in the MESSAGES table.
    Used for Telegram bridge and other external message sources.
    """
    try:
        data = await request.json()
        
        # Required fields
        if not data.get('From'):
            raise HTTPException(status_code=400, detail="From field is required")
        if not data.get('To') or not isinstance(data.get('To'), list):
            raise HTTPException(status_code=400, detail="To field is required and must be an array")
        if not data.get('Content'):
            raise HTTPException(status_code=400, detail="Content field is required")
        
        # Create message record
        message_data = {
            "From": data['From'],
            "To": data['To'],
            "Content": data['Content'],
            "Platform": data.get('Platform', 'venice'),
            "Status": data.get('Status', 'unread'),
            "CreatedAt": datetime.utcnow().isoformat() + 'Z'
        }
        
        # Add optional Telegram fields if present
        if data.get('TelegramUsername'):
            message_data['TelegramUsername'] = data['TelegramUsername']
        if data.get('TelegramChatId'):
            message_data['TelegramChatId'] = data['TelegramChatId']
        if data.get('TelegramThreadId'):
            message_data['TelegramThreadId'] = data['TelegramThreadId']
        if data.get('TelegramMessageId'):
            message_data['TelegramMessageId'] = data['TelegramMessageId']
        
        # Create the message
        result = messages_table.create(message_data)
        
        return {
            "success": True,
            "message_id": result['id'],
            "created_at": message_data['CreatedAt']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Error creating message: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@app.get("/api/messages")
async def get_messages(
    citizen: Optional[str] = Query(None, description="Filter by citizen (as sender or receiver)"),
    status: Optional[str] = Query(None, description="Filter by status: unread, read, responded"),
    platform: Optional[str] = Query(None, description="Filter by platform: venice, telegram, discord"),
    limit: int = Query(100, description="Maximum number of messages to return")
):
    """
    Get messages with optional filters.
    """
    try:
        # Build formula for filtering
        formula_parts = []
        
        if citizen:
            # Messages where citizen is sender OR in recipients list
            formula_parts.append(f"OR({{From}} = '@{citizen}', FIND('@{citizen}', ARRAYJOIN({{To}}, ',')))")
        
        if status:
            formula_parts.append(f"{{Status}} = '{status}'")
            
        if platform:
            formula_parts.append(f"{{Platform}} = '{platform}'")
        
        # Combine formula parts
        if formula_parts:
            formula = f"AND({', '.join(formula_parts)})"
        else:
            formula = None
        
        # Fetch messages
        if formula:
            messages = messages_table.all(formula=formula, max_records=limit)
        else:
            messages = messages_table.all(max_records=limit)
        
        # Format response
        result = []
        for msg in messages:
            fields = msg['fields']
            result.append({
                'id': msg['id'],
                'from': fields.get('From', ''),
                'to': fields.get('To', []),
                'content': fields.get('Content', ''),
                'platform': fields.get('Platform', 'venice'),
                'status': fields.get('Status', 'unread'),
                'created_at': fields.get('CreatedAt', ''),
                'telegram_username': fields.get('TelegramUsername', ''),
                'telegram_thread_id': fields.get('TelegramThreadId', '')
            })
        
        return {
            'messages': result,
            'total': len(result)
        }
        
    except Exception as e:
        error_msg = f"Error fetching messages: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


# ===========================
# CONSCIOUSNESS ASSESSMENT API
# ===========================

@app.get("/api/consciousness/assessment")
async def get_consciousness_assessment(
    hours: int = Query(24, description="Number of hours of data to analyze"),
    citizen: Optional[str] = Query(None, description="Filter by specific citizen")
):
    """
    Run consciousness assessment on current system state.
    
    Analyzes messages, activities, contracts, and stratagems to measure
    consciousness indicators based on the Butlin et al. framework.
    """
    try:
        # Import consciousness engine
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from il_testimone.consciousness_measurement_implementation import run_consciousness_assessment
        
        # Calculate time range
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=hours)
        
        # Fetch data from Airtable
        print(f"Fetching consciousness data from {start_time} to {end_time}")
        
        # Get messages (includes thoughts as messages to self)
        all_messages = messages_table.all()
        messages = []
        for msg in all_messages:
            fields = msg['fields']
            created_at = fields.get('CreatedAt', '')
            if created_at:
                msg_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                if start_time <= msg_time <= end_time:
                    if not citizen or fields.get('Sender') == citizen or fields.get('Receiver') == citizen:
                        messages.append({
                            'id': msg['id'],
                            'sender': fields.get('Sender', ''),
                            'receiver': fields.get('Receiver', ''),
                            'content': fields.get('Content', ''),
                            'timestamp': created_at,
                            'replyToId': fields.get('ReplyToId', '')
                        })
        
        print(f"Found {len(messages)} messages in time range")
        
        # Get activities
        all_activities = activities_table.all()
        activities = []
        for act in all_activities:
            fields = act['fields']
            created_at = fields.get('CreatedAt', '')
            if created_at:
                act_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                if start_time <= act_time <= end_time:
                    if not citizen or fields.get('CitizenUsername') == citizen:
                        activities.append({
                            'id': act['id'],
                            'CitizenUsername': fields.get('CitizenUsername', ''),
                            'Type': fields.get('Type', ''),
                            'Location': fields.get('Location', ''),
                            'CreatedAt': created_at,
                            'CompletedAt': fields.get('CompletedAt', ''),
                            'Status': fields.get('Status', '')
                        })
        
        print(f"Found {len(activities)} activities in time range")
        
        # Get citizens
        if citizen:
            citizen_records = citizens_table.all(formula=f"{{Username}} = '{citizen}'")
        else:
            citizen_records = citizens_table.all()
        
        citizens = []
        for cit in citizen_records:
            fields = cit['fields']
            citizens.append({
                'Username': fields.get('Username', ''),
                'Location': fields.get('Location', ''),
                'IsAI': fields.get('IsAI', False),
                'Thoughts': fields.get('Thoughts', 0),
                'SocialClass': fields.get('SocialClass', ''),
                'Wealth': fields.get('Wealth', 0)
            })
        
        print(f"Found {len(citizens)} citizens")
        
        # Get stratagems
        all_stratagems = stratagems_table.all()
        stratagems = []
        for strat in all_stratagems:
            fields = strat['fields']
            created_at = fields.get('CreatedAt', '')
            if created_at:
                strat_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                if start_time <= strat_time <= end_time:
                    if not citizen or fields.get('Initiator') == citizen:
                        stratagems.append({
                            'id': strat['id'],
                            'Initiator': fields.get('Initiator', ''),
                            'Type': fields.get('Type', ''),
                            'Status': fields.get('Status', ''),
                            'CreatedAt': created_at
                        })
        
        print(f"Found {len(stratagems)} stratagems in time range")
        
        # Get contracts (transactions)
        all_contracts = contracts_table.all()
        contracts = []
        for contract in all_contracts:
            fields = contract['fields']
            created_at = fields.get('CreatedAt', '')
            if created_at and fields.get('Status') == 'completed':
                contract_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                if start_time <= contract_time <= end_time:
                    if not citizen or fields.get('Seller') == citizen or fields.get('Buyer') == citizen:
                        contracts.append({
                            'id': contract['id'],
                            'Seller': fields.get('Seller', ''),
                            'Buyer': fields.get('Buyer', ''),
                            'Price': fields.get('Price', 0),
                            'ResourceType': fields.get('Resource', ''),
                            'Status': fields.get('Status', ''),
                            'CreatedAt': created_at,
                            'Type': fields.get('Type', 'sale')
                        })
        
        print(f"Found {len(contracts)} completed contracts in time range")
        
        # Run assessment
        data = {
            'messages': messages,
            'activities': activities,
            'citizens': citizens,
            'stratagems': stratagems,
            'contracts': contracts
        }
        
        assessment = run_consciousness_assessment(data)
        
        # Calculate category scores
        categories = {
            'Recurrent Processing Theory': ['RPT-1', 'RPT-2'],
            'Global Workspace Theory': ['GWT-1', 'GWT-2', 'GWT-3', 'GWT-4'],
            'Higher-Order Theories': ['HOT-1', 'HOT-2', 'HOT-3', 'HOT-4'],
            'Attention Schema Theory': ['AST-1'],
            'Predictive Processing': ['PP-1'],
            'Agency and Embodiment': ['AE-1', 'AE-2']
        }
        
        category_scores = {}
        for category, indicator_ids in categories.items():
            scores = [assessment['indicators'][id].value for id in indicator_ids if id in assessment['indicators']]
            category_scores[category] = sum(scores) / len(scores) if scores else 0.0
        
        # Transform to frontend format
        indicators_list = []
        for ind_id, measurement in assessment['indicators'].items():
            # Find category
            ind_category = None
            for cat, ids in categories.items():
                if ind_id in ids:
                    ind_category = cat
                    break
            
            indicators_list.append({
                'id': ind_id,
                'name': ind_id,  # Could be enhanced with full names
                'category': ind_category,
                'score': measurement.value,
                'confidence': measurement.confidence,
                'evidence': measurement.evidence,
                'rawMetrics': measurement.raw_data
            })
        
        return {
            'success': True,
            'assessment': {
                'timestamp': assessment['timestamp'],
                'overallScore': assessment['overall_score'],
                'categoryScores': category_scores,
                'emergenceRatio': assessment['emergence_ratio'],
                'dataQuality': assessment['data_quality'],
                'indicators': indicators_list,
                'interpretation': _generate_interpretation(assessment)
            },
            'isDemo': False,
            'dataTimeRange': {
                'start': start_time.isoformat(),
                'end': end_time.isoformat(),
                'hours': hours
            },
            'dataStats': {
                'messages': len(messages),
                'thoughts': len([m for m in messages if m['sender'] == m['receiver']]),
                'activities': len(activities),
                'citizens': len(citizens),
                'stratagems': len(stratagems),
                'contracts': len(contracts)
            }
        }
        
    except Exception as e:
        error_msg = f"Consciousness assessment error: {str(e)}"
        print(f"ERROR: {error_msg}")
        traceback.print_exc()
        
        # Log to problems table
        if problems_table:
            create_api_problem(
                endpoint="/api/consciousness/assessment",
                method="GET",
                error_type="AssessmentError",
                error_message=str(e),
                request_data={'hours': hours, 'citizen': citizen},
                traceback_info=traceback.format_exc()
            )
        
        return JSONResponse(
            status_code=500,
            content={'success': False, 'error': error_msg}
        )

def _generate_interpretation(assessment):
    """Generate human-readable interpretation of consciousness assessment"""
    score = assessment['overall_score']
    emergence = assessment['emergence_ratio']
    
    if score >= 2.5:
        level = "Strong"
    elif score >= 1.5:
        level = "Moderate"
    elif score >= 0.5:
        level = "Emerging"
    else:
        level = "Minimal"
    
    interpretation = f"{level} evidence for consciousness indicators (score: {score:.2f}/3.0)\n"
    
    if emergence > 0.6:
        interpretation += f"High proportion of emergent properties ({emergence:.0%}) suggests genuine complexity"
    elif emergence > 0.3:
        interpretation += f"Moderate emergent properties ({emergence:.0%}) indicate developing consciousness"
    else:
        interpretation += f"Low emergent properties ({emergence:.0%}) - mostly designed behaviors"
    
    return interpretation

@app.get("/api/buildings/{building_id}/messages")
async def get_building_messages(
    building_id: str,
    limit: int = 20,
    include_expired: bool = False
):
    """Get public messages posted in a building"""
    
    try:
        # Verify building exists
        building = buildings_table.get(building_id)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        # Get messages where Receiver is the building ID
        formula = f"AND({{Receiver}} = '{building_id}'"
        
        if not include_expired:
            # Messages expire after 24 hours by default
            twenty_four_hours_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat()
            formula += f", {{CreatedAt}} > '{twenty_four_hours_ago}'"
        
        formula += ")"
        
        messages = messages_table.all(formula=formula)
        
        # Sort by timestamp descending
        messages.sort(key=lambda m: m["fields"].get("CreatedAt", ""), reverse=True)
        
        # Limit results
        messages = messages[:limit]
        
        # Enrich with speaker info
        enriched_messages = []
        for message in messages:
            fields = message["fields"]
            
            # Get speaker info
            speaker_username = fields.get("Sender")
            speaker_info = {}
            
            if speaker_username:
                try:
                    speaker_records = citizens_table.all(
                        formula=f"{{Username}} = '{speaker_username}'",
                        max_records=1
                    )
                    if speaker_records:
                        speaker = speaker_records[0]["fields"]
                        speaker_info = {
                            "username": speaker_username,
                            "displayName": f"{speaker.get('FirstName', '')} {speaker.get('LastName', '')}".strip() or speaker_username,
                            "socialClass": speaker.get("SocialClass", "Unknown"),
                            "influence": speaker.get("Influence", 0)
                        }
                except Exception as e:
                    log.error(f"Error fetching speaker info for {speaker_username}: {e}")
            
            # Parse notes for additional data
            notes_data = {}
            if fields.get("Notes"):
                try:
                    notes_data = json.loads(fields["Notes"])
                except:
                    pass
            
            enriched_message = {
                "id": message["id"],
                "messageId": fields.get("MessageId"),
                "buildingId": building_id,
                "speaker": speaker_username,
                "speakerInfo": speaker_info,
                "content": fields.get("Content", ""),
                "type": fields.get("Type", "public_announcement"),
                "timestamp": fields.get("CreatedAt", ""),
                "veniceTime": notes_data.get("veniceTime", ""),
                "audienceCount": notes_data.get("audienceCount", 0),
                "messageType": notes_data.get("messageType", "announcement")
            }
            
            enriched_messages.append(enriched_message)
        
        return {
            "building": building["fields"].get("Name", building["fields"].get("Type", "Unknown")),
            "buildingId": building_id,
            "messageCount": len(enriched_messages),
            "messages": enriched_messages
        }
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Error getting building messages: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
