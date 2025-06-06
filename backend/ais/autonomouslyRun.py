#!/usr/bin/env python3
"""
Autonomously Run script for La Serenissima.

This script enables AI citizens to interact with the game's API in a three-step
process using the Kinos Engine:
1. Gather Data: AI decides on a GET API call to make.
2. Elaborate Strategy & Define Actions: AI analyzes data and defines POST API calls.
3. Note Results & Plan Next Steps: AI reflects on outcomes and plans.
"""

import os
import sys
import json
import re # Import the re module
import random # Import the random module
import traceback
import argparse
import logging
import demjson3 # Import demjson3
import time
from datetime import datetime
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
from urllib3.util.retry import Retry # Added import for Retry

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import shared utilities if available, e.g., for VENICE_TIMEZONE
try:
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, _escape_airtable_value, log_header
except ImportError:
    # Fallback if utils are not found or script is run standalone
    import pytz
    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    def _escape_airtable_value(value: Any) -> str:
        if isinstance(value, str):
            return value.replace("'", "\\'")
        return str(value)

# Configuration
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
API_BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
KINOS_API_KEY_ENV_VAR = "KINOS_API_KEY"
KINOS_BLUEPRINT_ID = "serenissima-ai"
KINOS_CHANNEL_AUTONOMOUS_RUN = "autonomous_run" # Kinos channel for this process

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("autonomouslyRun")

class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    LIGHTBLUE = '\033[94m' # For Kinos prompts/responses
    PINK = '\033[95m' # For API responses

CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE = [
    # Information Gathering (GET)
    "GET /api/citizens/{YourUsername} - Get your own citizen details.",
    "GET /api/citizens?SocialClass=...&IsAI=true - Find other citizens (filter by SocialClass, IsAI, etc.).",
    "GET /api/buildings?Owner={YourUsername} - List buildings you own.",
    "GET /api/buildings?Type=...&IsConstructed=true - Find specific types of constructed buildings.",
    "GET /api/lands?Owner={YourUsername} - List lands you own.",
    "GET /api/resources/counts?owner={YourUsername} - Check your resource inventory counts.",
    "GET /api/resources?AssetType=building&Asset={BuildingId} - List resources in a specific building.",
    "GET /api/contracts?Seller={YourUsername}&Type=public_sell&Status=active - List your active sell contracts.",
    "GET /api/contracts?ResourceType=...&Type=public_sell&Status=active - Find active public sell contracts for a resource.",
    "GET /api/contracts?Buyer={YourUsername}&Type=import&Status=active - List your active import contracts.",
    "GET /api/problems?Citizen={YourUsername}&Status=active - Check your active problems.",
    "GET /api/relevancies?RelevantToCitizen={YourUsername}&Category=opportunity - Check opportunities relevant to you.",
    "GET /api/activities?citizenId={YourUsername}&limit=5 - Get your 5 most recent activities.",
    "GET /api/building-types - Get definitions of all building types (costs, production, etc.). - Important before any POST /buildings request!",
    "GET /api/resource-types - Get definitions of all resource types (import price, category, etc.).- Important before any request involving resources!",
    "GET /api/activities?citizenId={YourUsername}&ongoing=true - Get your currently active activities.",
    
    # Utility for common GET requests
    "POST /api/try-read - Execute a predefined GET request. Body: {requestType, parameters: {username?, buildingId?, ...}} (Consult compendium_of_simplified_reads for details)",

    # Initiating ALL Endeavors (Activities & Strategic Actions)
    "POST /api/activities/try-create - PRIMARY METHOD TO TAKE ACTION. Request the game engine to initiate an endeavor. Body: {citizenUsername, activityType, activityParameters (optional)}. The engine will create the necessary activity records. Consult 'guide_to_decreeing_undertakings' (activities.md) for available 'activityType's and their 'activityParameters'. Example: `activityType: \"eat\"` will attempt sustenance from inventory, then home, then tavern.",
    
    # Direct Activity Creation (Advanced - use if ALL details are known and try-create is not suitable)
    "POST /api/actions/create-activity - Directly create a detailed activity record. Body: {citizenUsername, activityType, title, description, thought, activityDetails, notes (optional)}. Consult 'guide_to_decreeing_undertakings' (activities.md) for activity details."

    # Direct POST endpoints like /api/contracts, /api/messages/send, /api/buildings are DEPRECATED for AI use.
    # Use /api/activities/try-create with the appropriate activityType instead.
]

CONCISE_AIRTABLE_SCHEMA_FIELD_LIST = {
    "CITIZENS": [
        "CitizenId", "Username", "FirstName", "LastName", "SocialClass", "Ducats", "IsAI", "InVenice", 
        "Position", "Point", "HomeCity", "AteAt", "Description", "CorePersonality", "ImagePrompt", 
        "ImageUrl", "LastActiveAt", "CoatOfArmsImageUrl", "Color", "SecondaryColor", "GuildId", 
        "Preferences", "FamilyMotto", "CoatOfArms", "Wallet", "TelegramUserId", "DailyIncome", 
        "DailyTurnover", "WeeklyIncome", "WeeklyTurnover", "MonthlyIncome", "MonthlyTurnover", 
        "Influence", "CarryCapacityOverride", "CreatedAt", "UpdatedAt"
    ],
    "BUILDINGS": [
        "BuildingId", "Name", "Type", "Category", "SubCategory", "LandId", "Position", "Point", 
        "Rotation", "Owner", "RunBy", "Occupant", "LeasePrice", "RentPrice", "Wages", 
        "IsConstructed", "ConstructionDate", "ConstructionMinutesRemaining", "Variant", "Notes", 
        "CheckedAt", "CreatedAt", "UpdatedAt"
    ],
    "RESOURCES": [
        "ResourceId", "Type", "Name", "Asset", "AssetType", "Owner", "Count", "Position", 
        "ConsumedAt", "Notes", "CreatedAt", "UpdatedAt"
    ],
    "CONTRACTS": [
        "ContractId", "Type", "Buyer", "Seller", "ResourceType", "ServiceFeePerUnit", "Transporter", 
        "BuyerBuilding", "SellerBuilding", "Title", "Description", "TargetAmount", "PricePerResource", 
        "Priority", "Status", "Notes", "Asset", "AssetType", "LastExecutedAt", "CreatedAt", "EndAt", 
        "UpdatedAt"
    ],
    "ACTIVITIES": [
        "ActivityId", "Type", "Citizen", "FromBuilding", "ToBuilding", "ContractId", "ResourceId", 
        "Amount", "Resources", "TransportMode", "Path", "Transporter", "Status", "Title", 
        "Description", "Thought", "Notes", "Details", "Priority", "CreatedAt", "StartDate", 
        "EndDate", "UpdatedAt"
    ],
    "LANDS": [
        "LandId", "HistoricalName", "EnglishName", "Owner", "LastIncome", "BuildingPointsCount", "District"
    ],
    "MESSAGES": [
        "MessageId", "Sender", "Receiver", "Content", "Type", "ReadAt", "CreatedAt", "UpdatedAt"
    ],
    "PROBLEMS": [
        "Citizen", "AssetType", "Asset", "Type", "Description", "Status", "Severity", "Position", 
        "Location", "Title", "Solutions", "Notes", "CreatedAt", "ResolvedAt", "UpdatedAt"
    ],
    "RELEVANCIES": [
        "RelevancyId", "Asset", "AssetType", "Category", "Type", "TargetCitizen", "RelevantToCitizen", 
        "Score", "TimeHorizon", "Title", "Description", "Notes", "Status", "CreatedAt", "UpdatedAt"
    ]
}

# Import colorama for log_header
try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True) # Initialize colorama and autoreset styles
    colorama_available = True
except ImportError:
    colorama_available = False
    # Define dummy Fore and Style if colorama is not available
    class Fore:
        CYAN = ''
        MAGENTA = '' # Used in new log_header
        YELLOW = '' # Used for dry_run
    class Style:
        BRIGHT = ''
        RESET_ALL = '' # Autoreset handles this, but keep for compatibility

# log_header is now imported from activity_helpers

# --- Helper function to count entities in API response ---

def _get_entity_count_from_response(response_json: Any) -> Optional[int]:
    """Tries to determine the number of main entities in an API JSON response."""
    if isinstance(response_json, list):
        return len(response_json)
    if isinstance(response_json, dict):
        # Prioritized keys for common list responses based on API reference
        list_keys = [
            "citizens", "buildings", "lands", "contracts", "activities", 
            "thoughts", "problems", "relevancies", "notifications", "messages", 
            "loans", "guilds", "members", "decrees", "transactions", 
            "polygons", "bridges", "docks", "buildingTypes", "resourceTypes",
            "landRents", "landGroups", "incomeData", "tracks", "files", 
            "waterPoints", "globalResourceCounts", "playerResourceCounts"
            # "resources" is often a direct list, handled by the isinstance(list) check.
        ]
        for key in list_keys:
            if key in response_json and isinstance(response_json[key], list):
                return len(response_json[key])
        
        # Specific nested structures
        if "waterGraph" in response_json and isinstance(response_json["waterGraph"], dict):
            if "waterEdges" in response_json["waterGraph"] and isinstance(response_json["waterGraph"]["waterEdges"], list):
                return len(response_json["waterGraph"]["waterEdges"])
            if "waterPoints" in response_json["waterGraph"] and isinstance(response_json["waterGraph"]["waterPoints"], list):
                return len(response_json["waterGraph"]["waterPoints"])

        # Generic fallback: if any top-level value is a list (and not common metadata/status keys)
        # This is a broader check and might catch unexpected lists.
        for key, value in response_json.items():
            if isinstance(value, list) and key.lower() not in ["success", "error", "details", "message", "errors", "warnings"]:
                log.debug(f"Found a list under a generic key '{key}' for entity count.")
                return len(value)
    return None

# --- Airtable and API Key Initialization ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initializes connection to Airtable."""
    env_api_key = os.getenv("AIRTABLE_API_KEY")
    env_base_id = os.getenv("AIRTABLE_BASE_ID")

    airtable_api_key: Optional[str] = None
    if isinstance(env_api_key, str):
        airtable_api_key = env_api_key.strip()
        if not airtable_api_key: # Was empty or all whitespace
            airtable_api_key = None
    elif env_api_key is not None: # Not a string and not None (e.g. if dotenv somehow loaded it as another type)
        log.warning(f"{LogColors.WARNING}AIRTABLE_API_KEY from environment is of unexpected type: {type(env_api_key)}. Treating as not set.{LogColors.ENDC}")

    processed_base_id: Optional[str] = None
    if isinstance(env_base_id, str):
        processed_base_id = env_base_id.strip()
        if not processed_base_id: # Was empty or all whitespace
            processed_base_id = None
    elif env_base_id is not None: # Not a string and not None
        log.warning(f"{LogColors.WARNING}AIRTABLE_BASE_ID from environment is of unexpected type: {type(env_base_id)}. Treating as not set.{LogColors.ENDC}")

    if not airtable_api_key:
        log.error(f"{LogColors.FAIL}Airtable API Key is missing or invalid. Please check AIRTABLE_API_KEY environment variable.{LogColors.ENDC}")
        return None
    if not processed_base_id:
        log.error(f"{LogColors.FAIL}Airtable Base ID is missing or invalid. Please check AIRTABLE_BASE_ID environment variable.{LogColors.ENDC}")
        return None
        
    try:
        # Configure a custom retry strategy
        retry_strategy = Retry(
            total=5,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE", "POST"]
        )
        api = Api(airtable_api_key, retry_strategy=retry_strategy)
        tables = {
            "citizens": api.table(processed_base_id, "CITIZENS"),
            "messages": api.table(processed_base_id, "MESSAGES"),
            "notifications": api.table(processed_base_id, "NOTIFICATIONS"),
            "buildings": api.table(processed_base_id, "BUILDINGS"),
            "lands": api.table(processed_base_id, "LANDS"),
            "resources": api.table(processed_base_id, "RESOURCES"),
            "contracts": api.table(processed_base_id, "CONTRACTS"),
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable with API Key '{str(airtable_api_key)[:7]}...' and Base ID '{str(processed_base_id)[:7]}...': {e}{LogColors.ENDC}", exc_info=True)
        return None

def get_kinos_api_key() -> Optional[str]:
    """Retrieves the Kinos API key from environment variables."""
    api_key = os.getenv(KINOS_API_KEY_ENV_VAR)
    if not api_key:
        log.error(f"{LogColors.FAIL}Kinos API key ({KINOS_API_KEY_ENV_VAR}) not found.{LogColors.ENDC}")
    return api_key

def _get_latest_daily_update(tables: Dict[str, Table]) -> Optional[str]:
    """Fetches the content of the latest 'daily_update' message."""
    try:
        # Assuming 'ConsiglioDeiDieci' is the sender of daily_updates
        records = tables["messages"].all(
            formula="AND({Type}='daily_update', {Sender}='ConsiglioDeiDieci')",
            sort=[("CreatedAt", "desc")],
            max_records=1
        )
        if records:
            return records[0].get("fields", {}).get("Content")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching latest daily update: {e}{LogColors.ENDC}")
        return None

# --- AI Citizen Fetching ---

def get_ai_citizens_for_autonomous_run(
    tables: Dict[str, Table], 
    specific_username: Optional[str] = None,
    social_classes_to_include: Optional[List[str]] = None
) -> List[Dict]:
    """Fetches AI citizens eligible for autonomous run, filtered by username or social classes."""
    try:
        base_formula_parts = ["{IsAI}=1", "{InVenice}=1"]
        
        if specific_username:
            base_formula_parts.append(f"{{Username}}='{_escape_airtable_value(specific_username)}'")
            log.info(f"{LogColors.OKBLUE}Fetching specific AI citizen for autonomous run: {specific_username}{LogColors.ENDC}")
        else:
            effective_social_classes = []
            if social_classes_to_include and len(social_classes_to_include) > 0:
                effective_social_classes = social_classes_to_include
                log.info(f"{LogColors.OKBLUE}Fetching AI citizens of specified social classes: {', '.join(effective_social_classes)}{LogColors.ENDC}")
            else:
                # Default to Nobili, Cittadini, Forestieri if no specific citizen and no specific classes are requested
                effective_social_classes = ['Nobili', 'Cittadini', 'Forestieri']
                log.info(f"{LogColors.OKBLUE}Fetching all eligible AI citizens (Default: Nobili, Cittadini, Forestieri) for autonomous run.{LogColors.ENDC}")

            if effective_social_classes:
                class_conditions = [f"{{SocialClass}}='{_escape_airtable_value(sc)}'" for sc in effective_social_classes]
                if len(class_conditions) == 1:
                    social_class_filter = class_conditions[0]
                else:
                    social_class_filter = "OR(" + ", ".join(class_conditions) + ")"
                base_formula_parts.append(social_class_filter)
            else:
                # This case should ideally not be reached if logic is correct (defaults apply if list is empty)
                # but if it does, it means no social class filter, fetching all AI in Venice.
                log.warning(f"{LogColors.WARNING}No specific social classes provided and default did not apply. Fetching all AI citizens in Venice.{LogColors.ENDC}")

        formula = "AND(" + ", ".join(base_formula_parts) + ")"
        citizens = tables["citizens"].all(formula=formula)
        
        if not citizens:
            log.warning(f"{LogColors.WARNING}No AI citizens found matching criteria: {formula}{LogColors.ENDC}")
        else:
            log.info(f"{LogColors.OKGREEN}Found {len(citizens)} AI citizen(s) for autonomous run.{LogColors.ENDC}")
        return citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching AI citizens: {e}{LogColors.ENDC}", exc_info=True)
        return []

# --- API Interaction Helpers ---

DEFAULT_TIMEOUT_GET = 300  # seconds (5 minutes)
DEFAULT_TIMEOUT_POST = 45 # seconds
MAX_RETRIES = 2 # Number of retries (so 2 retries means 3 attempts total)
RETRY_DELAY_SECONDS = 3

def make_api_get_request(endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Makes a GET request to the game API with retries."""
    url = f"{API_BASE_URL}{endpoint}"
    last_exception = None
    
    for attempt in range(MAX_RETRIES + 1):
        try:
            log.info(f"{LogColors.OKBLUE}Making API GET request to: {LogColors.BOLD}{url}{LogColors.ENDC}{LogColors.OKBLUE} with params: {params} (Attempt {attempt + 1}/{MAX_RETRIES + 1}){LogColors.ENDC}")
            response = requests.get(url, params=params, timeout=DEFAULT_TIMEOUT_GET)
            response.raise_for_status()
            response_json = response.json()
            
            entity_count = _get_entity_count_from_response(response_json)
            count_message = f" Fetched {entity_count} entities." if entity_count is not None else ""
            
            log.info(f"{LogColors.OKGREEN}API GET request to {LogColors.BOLD}{url}{LogColors.ENDC}{LogColors.OKGREEN} successful.{count_message}{LogColors.ENDC}")
            log.debug(f"{LogColors.PINK}Full response from GET {url}:\n{json.dumps(response_json, indent=2)}{LogColors.ENDC}")
            return response_json
        except requests.exceptions.RequestException as e:
            last_exception = e
            log.warning(f"{LogColors.WARNING}API GET request to {LogColors.BOLD}{url}{LogColors.ENDC}{LogColors.WARNING} failed on attempt {attempt + 1}: {e}{LogColors.ENDC}")
            if attempt < MAX_RETRIES:
                log.info(f"{LogColors.OKBLUE}Retrying in {RETRY_DELAY_SECONDS} seconds...{LogColors.ENDC}")
                time.sleep(RETRY_DELAY_SECONDS)
            else:
                log.error(f"{LogColors.FAIL}API GET request to {url} failed after {MAX_RETRIES + 1} attempts: {last_exception}{LogColors.ENDC}", exc_info=True)
        except json.JSONDecodeError as e_json:
            last_exception = e_json
            log.error(f"{LogColors.FAIL}Failed to decode JSON response from GET {url} on attempt {attempt + 1}: {e_json}{LogColors.ENDC}", exc_info=True)
            # Typically, JSON decode errors are not retried unless the server might return transient malformed JSON.
            # For now, we'll break on JSON decode error.
            break 
            
    return None

def _get_latest_activity_api(citizen_username: str) -> Optional[Dict]:
    """Fetches the latest activity for a citizen via the Next.js API."""
    try:
        # Construct params for the GET request
        # Sorting by EndDate descending and limiting to 1 should give the most current or last completed activity.
        # We also want to ensure we get activities that might be ongoing (EndDate in future or null)
        # or just completed. The `ongoing=true` param in /api/activities handles complex time-based filtering.
        # However, for "latest", we might just want the one with the most recent EndDate or StartDate if EndDate is null.
        # The /api/activities endpoint sorts by EndDate desc by default.
        # Changed "citizenId" to "Citizen" to match user preference/correction.
        params = {
            "Citizen": citizen_username,
            "limit": 1,
            # No specific status filter here, let the default sorting by EndDate give the "latest"
            # The API sorts by EndDate desc, so this should give the most recently ended or current one.
        }
        log.info(f"{LogColors.OKBLUE}Fetching latest activity for {citizen_username} with params: {params}{LogColors.ENDC}")
        
        response_data = make_api_get_request("/api/activities", params=params) # Use existing helper

        if response_data and response_data.get("success") and "activities" in response_data:
            activities = response_data["activities"]
            if activities and isinstance(activities, list) and len(activities) > 0:
                log.info(f"{LogColors.OKGREEN}Successfully fetched latest activity for {citizen_username}.{LogColors.ENDC}")
                return activities[0] # Return the first (and only) activity
            else:
                log.info(f"{LogColors.OKBLUE}No activities found for {citizen_username} when fetching latest.{LogColors.ENDC}")
                return None
        else:
            log.warning(f"{LogColors.WARNING}Failed to get latest activity for {citizen_username} from API: {response_data.get('error') if response_data else 'No response'}{LogColors.ENDC}")
            return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Exception fetching latest activity for {citizen_username}: {e}{LogColors.ENDC}", exc_info=True)
        return None


def make_api_post_request(endpoint: str, body: Optional[Dict] = None) -> Optional[Dict]:
    """Makes a POST request to the game API with retries."""
    url = f"{API_BASE_URL}{endpoint}"
    # log_body_snippet = json.dumps(body, indent=2)[:200] + "..." if body else "None" # Original snippet logging
    full_body_log = json.dumps(body, indent=2) if body else "None"
    last_exception = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            # Log the full body if log level is DEBUG or lower, otherwise log a snippet.
            if log.isEnabledFor(logging.DEBUG):
                log.info(f"{LogColors.OKBLUE}Making API POST request to: {LogColors.BOLD}{url}{LogColors.ENDC}{LogColors.OKBLUE} with full body (Attempt {attempt + 1}/{MAX_RETRIES + 1}){LogColors.ENDC}")
                log.debug(f"{LogColors.LIGHTBLUE}POST Body to {url}: {full_body_log}{LogColors.ENDC}")
            else:
                log_body_snippet_for_info = json.dumps(body, indent=2)[:200] + "..." if body else "None"
                log.info(f"{LogColors.OKBLUE}Making API POST request to: {LogColors.BOLD}{url}{LogColors.ENDC}{LogColors.OKBLUE} with body: {log_body_snippet_for_info} (Attempt {attempt + 1}/{MAX_RETRIES + 1}){LogColors.ENDC}")

            response = requests.post(url, json=body, timeout=DEFAULT_TIMEOUT_POST)
            response.raise_for_status()
            
            if response.content:
                response_json = response.json()
                log.info(f"{LogColors.OKGREEN}API POST request to {url} successful.{LogColors.ENDC}")
                log.debug(f"{LogColors.PINK}Response from POST {url}: {json.dumps(response_json, indent=2)}{LogColors.ENDC}")
                return response_json
            
            log.info(f"{LogColors.OKGREEN}API POST request to {url} successful (Status: {response.status_code}, No content returned).{LogColors.ENDC}")
            return {"status_code": response.status_code, "success": True, "message": "POST successful, no content returned."}
        except requests.exceptions.RequestException as e:
            last_exception = e
            log.warning(f"{LogColors.WARNING}API POST request to {url} failed on attempt {attempt + 1}: {e}{LogColors.ENDC}")
            if attempt < MAX_RETRIES:
                log.info(f"Retrying in {RETRY_DELAY_SECONDS} seconds...")
                time.sleep(RETRY_DELAY_SECONDS)
            else:
                log.error(f"{LogColors.FAIL}API POST request to {url} failed after {MAX_RETRIES + 1} attempts: {last_exception}{LogColors.ENDC}", exc_info=True)
        except json.JSONDecodeError as e_json:
            last_exception = e_json
            log.error(f"{LogColors.FAIL}Failed to decode JSON response from POST {url} on attempt {attempt + 1}: {e_json}{LogColors.ENDC}", exc_info=True)
            # Break on JSON decode error for POST as well.
            break
            
    # If all retries fail, return an error structure
    return {"success": False, "error": str(last_exception) if last_exception else "Unknown error after retries"}


# --- Kinos Interaction Helper ---

def make_kinos_call(
    kinos_api_key: str,
    ai_username: str,
    prompt: str,
    add_system_data: Optional[Dict] = None,
    kinos_model_override: Optional[str] = None
) -> Optional[Dict]:
    """Generic function to make a call to the Kinos Engine."""
    # Updated to send to the main kin channel, not a specific sub-channel
    kinos_url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT_ID}/kins/{ai_username}/messages"
    headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
    
    payload: Dict[str, Any] = {
        "message": prompt,
        "min_files": 2, # Add min_files
        "max_files": 5  # Add max_files
    }
    if add_system_data:
        try:
            payload["addSystem"] = json.dumps(add_system_data)
        except TypeError as te:
            log.error(f"{LogColors.FAIL}Error serializing addSystem data for Kinos: {te}. Sending without addSystem.{LogColors.ENDC}")
            # Optionally, remove addSystem or send a simplified version
            # For now, we'll let it proceed without addSystem if serialization fails.
            if "addSystem" in payload: del payload["addSystem"]


    if kinos_model_override:
        payload["model"] = kinos_model_override
        log.info(f"{LogColors.OKBLUE}Using Kinos model override '{kinos_model_override}' for {ai_username}.{LogColors.ENDC}")

    try:
        log.info(f"{LogColors.OKBLUE}Sending request to Kinos for {LogColors.BOLD}{ai_username}{LogColors.ENDC}{LogColors.OKBLUE} on main channel...{LogColors.ENDC}")
        log.debug(f"{LogColors.LIGHTBLUE}Kinos Prompt for {ai_username}: {prompt[:200]}...{LogColors.ENDC}")
        if add_system_data:
            log.debug(f"{LogColors.LIGHTBLUE}Kinos addSystem keys for {ai_username}: {list(add_system_data.keys())}{LogColors.ENDC}")

        # Increased timeout to 10 minutes (600 seconds)
        response = requests.post(kinos_url, headers=headers, json=payload, timeout=600) 
        response.raise_for_status()

        # Fetch the latest assistant message from history
        history_response = requests.get(kinos_url, headers=headers, timeout=60) # Increased history timeout as well
        history_response.raise_for_status()
        messages_data = history_response.json()
        
        assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
        if not assistant_messages:
            log.warning(f"{LogColors.WARNING}No assistant messages found in Kinos history for {ai_username}. Full history response: {messages_data}{LogColors.ENDC}")
            return None
        
        assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        latest_ai_response_content = assistant_messages[0].get("content")

        if not latest_ai_response_content:
            log.warning(f"{LogColors.WARNING}Latest Kinos assistant message for {ai_username} has no content. Message object: {assistant_messages[0]}{LogColors.ENDC}")
            return None
        
        log.info(f"{LogColors.OKGREEN}Received Kinos response for {LogColors.BOLD}{ai_username}{LogColors.ENDC}{LogColors.OKGREEN}. Length: {len(latest_ai_response_content)}{LogColors.ENDC}")
        # Log full raw response at INFO level
        log.info(f"{LogColors.LIGHTBLUE}Full Kinos raw response content for {ai_username}:\n{latest_ai_response_content}{LogColors.ENDC}")

        # Remove content within <think>...</think> tags
        cleaned_for_think_tags = re.sub(r"<think>.*?</think>", "", latest_ai_response_content, flags=re.DOTALL)
        if cleaned_for_think_tags != latest_ai_response_content:
            log.info(f"{LogColors.OKBLUE}Removed <think>...</think> content. New length: {len(cleaned_for_think_tags)}. Cleaned content snippet for parsing: {cleaned_for_think_tags[:300]}...{LogColors.ENDC}")
        
        content_to_parse = cleaned_for_think_tags.strip() # Use the cleaned content for parsing

        parsed_response = None
        parsing_method_used = "none"
        parsing_error_info = None # To store info if an earlier parsing attempt failed

        def _pre_clean_json_candidate(json_candidate_str: str) -> str:
            """
            Cleans a JSON candidate string by:
            1. Removing JavaScript-style comments (// and /* */).
            2. Converting Python-style True/False/None to JSON-style true/false/null.
            """
            s = json_candidate_str

            # Remove single-line comments (//...)
            s = re.sub(r"//.*", "", s)
            # Remove multi-line comments (/*...*/)
            s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL) # DOTALL makes . match newlines

            # Replace : True, : False, : None ensuring space after colon
            s = re.sub(r':\s*True\b', ': true', s)
            s = re.sub(r':\s*False\b', ': false', s)
            s = re.sub(r':\s*None\b', ': null', s)
            # Replace standalone True, False, None (e.g., in arrays)
            s = re.sub(r'\bTrue\b', 'true', s)
            s = re.sub(r'\bFalse\b', 'false', s)
            s = re.sub(r'\bNone\b', 'null', s)
            
            if s != json_candidate_str:
                log.debug(f"Pre-cleaned JSON (comments, True/False/None) for {ai_username}. Original snippet: {json_candidate_str[:100]}..., Cleaned snippet: {s[:100]}...")
            return s

        def _clean_json_string(json_str: str) -> str:
            """Removes trailing commas from arrays and objects."""
            cleaned_str = re.sub(r",\s*([\}\]])", r"\1", json_str)
            if cleaned_str != json_str:
                log.debug(f"Cleaned JSON string (trailing commas) for {ai_username}. Original snippet: {json_str[:100]}..., Cleaned snippet: {cleaned_str[:100]}...")
            return cleaned_str

        # Attempt 1: Direct JSON parse
        try:
            pre_cleaned_direct_content = _pre_clean_json_candidate(content_to_parse) # Use content_to_parse
            cleaned_direct_content = _clean_json_string(pre_cleaned_direct_content)
            parsed_response = json.loads(cleaned_direct_content)
            parsing_method_used = "direct_cleaned"
            log.debug(f"{LogColors.LIGHTBLUE}Kinos response for {ai_username} parsed as direct (pre-cleaned & cleaned) JSON.{LogColors.ENDC}")
        except json.JSONDecodeError:
            parsing_error_info = "Direct JSON parse (pre-cleaned & cleaned) failed. "
            log.warning(f"{LogColors.WARNING}Kinos response for {ai_username} is not direct JSON. {parsing_error_info}Attempting markdown extraction.{LogColors.ENDC}")
            
            # Attempt 2: Extract last JSON block from markdown
            json_matches = list(re.finditer(r"```json\s*([\s\S]*?)\s*```", content_to_parse, re.MULTILINE)) # Use content_to_parse
            if json_matches:
                last_json_match = json_matches[-1]
                json_str_markdown_raw = last_json_match.group(1).strip()
                pre_cleaned_markdown = _pre_clean_json_candidate(json_str_markdown_raw)
                json_str_markdown_cleaned = _clean_json_string(pre_cleaned_markdown)
                try:
                    parsed_response = json.loads(json_str_markdown_cleaned)
                    parsing_method_used = "markdown_cleaned"
                    log.info(f"{LogColors.OKGREEN}Successfully extracted and parsed (pre-cleaned & cleaned) last JSON block from Kinos markdown for {ai_username}.{LogColors.ENDC}")
                except json.JSONDecodeError as e_markdown:
                    parsing_error_info += f"Markdown JSON block parse (pre-cleaned & cleaned) failed (Error: {e_markdown}). "
                    log.warning(f"{LogColors.WARNING}Failed to parse extracted (pre-cleaned & cleaned) JSON from markdown for {ai_username}. Error: {e_markdown}. Block: {json_str_markdown_cleaned[:200]}... {parsing_error_info}Attempting substring extraction.{LogColors.ENDC}")
            else:
                parsing_error_info += "No markdown JSON block found. "
                log.info(f"{LogColors.OKBLUE}No JSON block found in Kinos markdown for {ai_username}. {parsing_error_info}Attempting substring extraction.{LogColors.ENDC}")

            if not parsed_response: # If direct and markdown parse failed
                # Attempt 3: If </think> tag exists, parse JSON after it
                # This step might be redundant now that <think> tags are removed upfront,
                # but keeping it as a fallback if the initial removal was incomplete or if other tags appear.
                think_tag_end_str = "</think>" # Or any other problematic tag
                think_tag_index = content_to_parse.find(think_tag_end_str) # Use content_to_parse
                if think_tag_index != -1:
                    log.info(f"{LogColors.OKBLUE}Found '{think_tag_end_str}' tag (even after initial clean). Attempting to parse JSON after it for {ai_username}.{LogColors.ENDC}")
                    content_after_think = content_to_parse[think_tag_index + len(think_tag_end_str):]
                    
                    first_brace_after_think = content_after_think.find('{')
                    last_brace_after_think = content_after_think.rfind('}')

                    if first_brace_after_think != -1 and last_brace_after_think != -1 and last_brace_after_think > first_brace_after_think:
                        json_str_after_think_raw = content_after_think[first_brace_after_think : last_brace_after_think + 1]
                        pre_cleaned_after_think = _pre_clean_json_candidate(json_str_after_think_raw)
                        json_str_after_think_cleaned = _clean_json_string(pre_cleaned_after_think)
                        try:
                            parsed_response = json.loads(json_str_after_think_cleaned)
                            parsing_method_used = "after_think_tag_substring_cleaned"
                            log.info(f"{LogColors.OKGREEN}Successfully parsed (pre-cleaned & cleaned) JSON substring after '{think_tag_end_str}' tag for {ai_username}.{LogColors.ENDC}")
                        except json.JSONDecodeError as e_after_think:
                            parsing_error_info += f"JSON after '{think_tag_end_str}' tag parse (pre-cleaned & cleaned) failed (Error: {e_after_think}). "
                            log.warning(f"{LogColors.WARNING}Failed to parse JSON substring after '{think_tag_end_str}' tag for {ai_username}. Error: {e_after_think}. Substring: {json_str_after_think_cleaned[:200]}... {parsing_error_info}Attempting general substring extraction.{LogColors.ENDC}")
                    else:
                        parsing_error_info += f"No valid JSON structure found after '{think_tag_end_str}' tag. "
                        log.info(f"{LogColors.OKBLUE}No JSON structure found after '{think_tag_end_str}' tag for {ai_username}. {parsing_error_info}Attempting general substring extraction.{LogColors.ENDC}")
                else:
                    # This is expected if the initial <think> removal worked.
                    # parsing_error_info += f"No '{think_tag_end_str}' tag found. " # Avoid adding this if initial clean was successful
                    log.info(f"{LogColors.OKBLUE}No further '{think_tag_end_str}' tag found for {ai_username}. {parsing_error_info or ''}Attempting general substring extraction.{LogColors.ENDC}")

            if not parsed_response: # If direct, markdown, and after_think_tag parse failed
                # Attempt 4: Find first '{' and last '}' in the (potentially cleaned) response
                log.info(f"{LogColors.OKBLUE}Attempting general substring extraction for {ai_username} as a last resort.{LogColors.ENDC}")
                first_brace_idx = content_to_parse.find('{') # Use content_to_parse
                last_brace_idx = content_to_parse.rfind('}') # Use content_to_parse
                if first_brace_idx != -1 and last_brace_idx != -1 and last_brace_idx > first_brace_idx:
                    potential_json_str_raw = content_to_parse[first_brace_idx : last_brace_idx+1] # Use content_to_parse
                    pre_cleaned_substring = _pre_clean_json_candidate(potential_json_str_raw)
                    potential_json_str_cleaned = _clean_json_string(pre_cleaned_substring)
                    try:
                        parsed_response = json.loads(potential_json_str_cleaned)
                        parsing_method_used = "general_substring_cleaned"
                        log.info(f"{LogColors.OKGREEN}Successfully parsed (pre-cleaned & cleaned) general JSON substring for {ai_username}.{LogColors.ENDC}")
                    except json.JSONDecodeError as e_substring:
                        parsing_error_info += f"General substring JSON parse (pre-cleaned & cleaned) failed (Error: {e_substring} at pos {e_substring.pos}). "
                        # Log context around the error position
                        error_context_start = max(0, e_substring.pos - 30)
                        error_context_end = min(len(potential_json_str_cleaned), e_substring.pos + 30)
                        error_snippet = potential_json_str_cleaned[error_context_start:error_context_end]
                        pointer_str = ' ' * (e_substring.pos - error_context_start) + '^'
                        log.warning(f"{LogColors.WARNING}Failed to parse (pre-cleaned & cleaned) general JSON substring for {ai_username}. Error context:\n{error_snippet}\n{pointer_str}{LogColors.ENDC}")
                        parsing_error_info += f"General substring JSON parse (pre-cleaned & cleaned) failed (Error: {e_substring}). " # Ensure parsing_error_info is updated
                else:
                    parsing_error_info += "No suitable general JSON-like substring found. "
                    log.warning(f"{LogColors.WARNING}No suitable general JSON-like substring found for {ai_username}.{LogColors.ENDC}")

            if not parsed_response: # If general substring also failed, try demjson3 on the cleaned general substring
                log.info(f"{LogColors.OKBLUE}Attempting demjson3 parse for {ai_username} as a final resort on the general substring.{LogColors.ENDC}")
                if first_brace_idx != -1 and last_brace_idx != -1 and last_brace_idx > first_brace_idx:
                    # Use potential_json_str_cleaned which is the result of _pre_clean_json_candidate and _clean_json_string
                    try:
                        parsed_response = demjson3.decode(potential_json_str_cleaned)
                        parsing_method_used = "demjson3_on_general_substring"
                        log.info(f"{LogColors.OKGREEN}Successfully parsed with demjson3 on general substring for {ai_username}.{LogColors.ENDC}")
                    except demjson3.JSONDecodeError as e_demjson_substring:
                        parsing_error_info += f"demjson3 on general substring failed (Error: {e_demjson_substring}). "
                        log.warning(f"{LogColors.WARNING}demjson3 parse on general substring failed for {ai_username}: {e_demjson_substring}{LogColors.ENDC}")
                else: # No general substring was found to even try demjson3 on
                    parsing_error_info += "No general substring available for demjson3 attempt. "
                    log.warning(f"{LogColors.WARNING}No general substring was identified to attempt demjson3 parsing for {ai_username}.{LogColors.ENDC}")

            # Attempt 5: Further fallbacks if all above failed
            if not parsed_response:
                pre_cleaned_full_content = _pre_clean_json_candidate(content_to_parse) # content_to_parse is Kinos output after <think> removal

                # Strategy 5a: Try demjson3 on the *entire* pre-cleaned content
                # This is useful if the general substring extraction was too aggressive.
                # Only try if pre_cleaned_full_content is different from potential_json_str_cleaned (which was already tried with demjson3)
                if pre_cleaned_full_content != potential_json_str_cleaned:
                    log.info(f"{LogColors.OKBLUE}Attempting demjson3 parse on the *entire pre-cleaned* Kinos response for {ai_username}.{LogColors.ENDC}")
                    try:
                        parsed_response = demjson3.decode(pre_cleaned_full_content)
                        parsing_method_used = "demjson3_on_full_pre_cleaned_content"
                        log.info(f"{LogColors.OKGREEN}Successfully parsed with demjson3 on the *entire pre-cleaned* Kinos response for {ai_username}.{LogColors.ENDC}")
                    except demjson3.JSONDecodeError as e_demjson_full:
                        parsing_error_info += f"demjson3 on full pre-cleaned content failed (Error: {e_demjson_full}). "
                        log.warning(f"{LogColors.WARNING}demjson3 parse on full pre-cleaned content failed for {ai_username}: {e_demjson_full}{LogColors.ENDC}")
                elif potential_json_str_cleaned: # Check if potential_json_str_cleaned was actually available for the previous demjson3 attempt
                    log.info(f"{LogColors.OKBLUE}Full pre-cleaned content is same as general substring already tried with demjson3. Skipping redundant demjson3 parse on full content.{LogColors.ENDC}")
                else: # This case means potential_json_str_cleaned was empty/None, so pre_cleaned_full_content is the first candidate for demjson3 on full content
                    log.info(f"{LogColors.OKBLUE}General substring was not found. Attempting demjson3 parse on the *entire pre-cleaned* Kinos response for {ai_username}.{LogColors.ENDC}")
                    try:
                        parsed_response = demjson3.decode(pre_cleaned_full_content)
                        parsing_method_used = "demjson3_on_full_pre_cleaned_content_as_first_demjson_attempt"
                        log.info(f"{LogColors.OKGREEN}Successfully parsed with demjson3 on the *entire pre-cleaned* Kinos response for {ai_username}.{LogColors.ENDC}")
                    except demjson3.JSONDecodeError as e_demjson_full_alt:
                        parsing_error_info += f"demjson3 on full pre-cleaned content (alt path) failed (Error: {e_demjson_full_alt}). "
                        log.warning(f"{LogColors.WARNING}demjson3 parse on full pre-cleaned content (alt path) failed for {ai_username}: {e_demjson_full_alt}{LogColors.ENDC}")


                # Strategy 5b: Regex-based reconstruction of "actions" and "reflection"
                if not parsed_response:
                    log.info(f"{LogColors.OKBLUE}Attempting regex-based extraction of 'actions' and 'reflection' for {ai_username} from full pre-cleaned content.{LogColors.ENDC}")
                    actions_match = re.search(r'"actions"\s*:\s*(\[.*?\])', pre_cleaned_full_content, re.DOTALL)
                    reflection_match = re.search(r'"reflection"\s*:\s*("((?:\\.|[^"\\])*)")', pre_cleaned_full_content, re.DOTALL) # Improved reflection string capture

                    extracted_kv_parts = []
                    if actions_match:
                        actions_str_candidate = actions_match.group(1)
                        # Basic validation for array structure
                        if actions_str_candidate.startswith('[') and actions_str_candidate.endswith(']'):
                            extracted_kv_parts.append(f'"actions": {actions_str_candidate}')
                            log.debug(f"Regex extracted 'actions' part for {ai_username}")
                        else:
                            log.warning(f"Regex found 'actions' but content '{actions_str_candidate[:50]}...' doesn't look like an array for {ai_username}")
                    
                    if reflection_match:
                        reflection_str_candidate = reflection_match.group(1) # This is the quoted string "..."
                        # Basic validation for string structure
                        if reflection_str_candidate.startswith('"') and reflection_str_candidate.endswith('"'):
                            extracted_kv_parts.append(f'"reflection": {reflection_str_candidate}')
                            log.debug(f"Regex extracted 'reflection' part for {ai_username}")
                        else:
                             log.warning(f"Regex found 'reflection' but content '{reflection_str_candidate[:50]}...' doesn't look like a JSON string for {ai_username}")

                    if extracted_kv_parts:
                        reconstructed_json_str = "{" + ", ".join(extracted_kv_parts) + "}"
                        log.info(f"{LogColors.OKBLUE}Reconstructed JSON string for {ai_username}: {reconstructed_json_str[:200]}...{LogColors.ENDC}")
                        try:
                            parsed_response = demjson3.decode(reconstructed_json_str)
                            parsing_method_used = "regex_reconstruction_demjson3"
                            log.info(f"{LogColors.OKGREEN}Successfully parsed regex-reconstructed JSON with demjson3 for {ai_username}.{LogColors.ENDC}")
                        except demjson3.JSONDecodeError as e_reconstruct_demjson:
                            parsing_error_info += f"Regex reconstruction (demjson3) failed (Error: {e_reconstruct_demjson}). "
                            log.warning(f"{LogColors.WARNING}Failed to parse regex-reconstructed JSON with demjson3 for {ai_username}: {e_reconstruct_demjson}. Trying strict json.loads.{LogColors.ENDC}")
                            try:
                                parsed_response = json.loads(reconstructed_json_str) # Strict parse as a final fallback for this reconstruction
                                parsing_method_used = "regex_reconstruction_jsonloads"
                                log.info(f"{LogColors.OKGREEN}Successfully parsed regex-reconstructed JSON with json.loads for {ai_username}.{LogColors.ENDC}")
                            except json.JSONDecodeError as e_reconstruct_json:
                                parsing_error_info += f"Regex reconstruction (json.loads) failed (Error: {e_reconstruct_json}). "
                                log.warning(f"{LogColors.WARNING}Failed to parse regex-reconstructed JSON with json.loads for {ai_username}: {e_reconstruct_json}{LogColors.ENDC}")
                    else:
                        log.info(f"{LogColors.OKBLUE}Could not extract 'actions' or 'reflection' via regex for {ai_username} for reconstruction.{LogColors.ENDC}")
                        parsing_error_info += "Regex extraction of actions/reflection found nothing for reconstruction. "
        
        if parsed_response:
            log.info(f"{LogColors.LIGHTBLUE}Full Kinos parsed JSON response for {ai_username} (method: {parsing_method_used}):\n{json.dumps(parsed_response, indent=2)}{LogColors.ENDC}")
            if parsing_error_info and parsing_method_used != "direct_cleaned" and parsing_method_used != "direct_original": # Add info if a fallback method succeeded
                parsed_response["parsing_info"] = f"Successfully parsed using {parsing_method_used} method after prior attempts failed. ({parsing_error_info.strip()})"
            return parsed_response
        else: # All parsing attempts failed
            log.warning(f"{LogColors.WARNING}All JSON parsing attempts failed for Kinos response for {LogColors.BOLD}{ai_username}{LogColors.ENDC}{LogColors.WARNING}. Treating entire (think-tag-cleaned) response as reflection. Final error summary: {parsing_error_info}{LogColors.ENDC}")
            return {
                "actions": [], 
                "reflection": content_to_parse, # The full raw content, after <think> tag removal
                "error_parsing_json": True, 
                "error_message": f"Failed to parse JSON from Kinos response after multiple attempts. Details: {parsing_error_info.strip() if parsing_error_info else 'Unknown parsing error after cleaning.'}"
            }

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos API request error for {ai_username}: {e}{LogColors.ENDC}", exc_info=True)
        if hasattr(e, 'response') and e.response is not None:
            log.error(f"{LogColors.FAIL}Kinos error response content: {e.response.text[:500]}{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in make_kinos_call for {ai_username}: {e}{LogColors.ENDC}", exc_info=True)
        return None

# --- API Call Helper for try-create ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> Optional[Dict]: # Returns the API response or None on failure
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        log_ref.info(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return {"success": True, "message": "[DRY RUN] Simulated try-create activity success."}

    api_url = f"{API_BASE_URL}/api/activities/try-create" # API_BASE_URL is global
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    last_exception_try_create = None
    for attempt in range(MAX_RETRIES + 1): # MAX_RETRIES is global
        try:
            log_ref.info(f"{LogColors.OKBLUE}Making API POST request to: {LogColors.BOLD}{api_url}{LogColors.ENDC}{LogColors.OKBLUE} for try-create (Attempt {attempt + 1}/{MAX_RETRIES + 1}){LogColors.ENDC}")
            log_ref.debug(f"{LogColors.LIGHTBLUE}Full payload for try-create:\n{json.dumps(payload, indent=2)}{LogColors.ENDC}")
            
            response = requests.post(api_url, headers=headers, json=payload, timeout=DEFAULT_TIMEOUT_POST) # DEFAULT_TIMEOUT_POST is global
            response.raise_for_status()
            response_json = response.json() # Assuming response is always JSON if successful
            
            if response_json.get("success"):
                log_ref.info(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {LogColors.BOLD}{citizen_username}{LogColors.ENDC}{LogColors.OKGREEN} via API. Response: {response_json.get('message', 'OK')}{LogColors.ENDC}")
                activity_info = response_json.get("activity") or (response_json.get("activities")[0] if isinstance(response_json.get("activities"), list) and response_json.get("activities") else None)
                if activity_info and activity_info.get("id"): # activity_info is already a dict (fields)
                    log_ref.info(f"  Activity ID (Airtable Record ID): {activity_info['id']}")
                log_ref.debug(f"{LogColors.PINK}Full response from try-create for {activity_type} / {citizen_username}:\n{json.dumps(response_json, indent=2)}{LogColors.ENDC}")
            else:
                log_ref.error(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {LogColors.BOLD}{citizen_username}{LogColors.ENDC}{LogColors.FAIL} failed: {response_json.get('error', 'Unknown error')}{LogColors.ENDC}")
                log_ref.debug(f"{LogColors.FAIL}Full error response from try-create for {activity_type} / {citizen_username}:\n{json.dumps(response_json, indent=2)}{LogColors.ENDC}")
            return response_json # Return the full response

        except requests.exceptions.RequestException as e:
            last_exception_try_create = e
            log_ref.warning(f"{LogColors.WARNING}API POST request to {LogColors.BOLD}{api_url}{LogColors.ENDC}{LogColors.WARNING} (try-create) failed on attempt {attempt + 1}: {e}{LogColors.ENDC}")
            if attempt < MAX_RETRIES:
                log_ref.info(f"{LogColors.OKBLUE}Retrying in {RETRY_DELAY_SECONDS} seconds...{LogColors.ENDC}")
                time.sleep(RETRY_DELAY_SECONDS) # RETRY_DELAY_SECONDS is global
            else: # This is the final attempt that failed
                detailed_error_log_message = str(last_exception_try_create)
                if isinstance(last_exception_try_create, requests.exceptions.HTTPError) and last_exception_try_create.response is not None:
                    try:
                        api_error_details_for_log = last_exception_try_create.response.json()
                        detailed_error_log_message += f" - API Response: {json.dumps(api_error_details_for_log)}"
                    except json.JSONDecodeError:
                        detailed_error_log_message += f" - API Response (text): {last_exception_try_create.response.text[:200]}" # Log snippet of text if not JSON
                log_ref.error(f"{LogColors.FAIL}API POST request to {LogColors.BOLD}{api_url}{LogColors.ENDC}{LogColors.FAIL} (try-create) failed after {MAX_RETRIES + 1} attempts: {detailed_error_log_message}{LogColors.ENDC}", exc_info=True)
        except json.JSONDecodeError as e_json: # This handles JSON decode errors for successful (2xx) responses
            last_exception_try_create = e_json
            response_text_snippet = response.text[:500] if response and hasattr(response, 'text') else "[No response text available]"
            log_ref.error(f"{LogColors.FAIL}Failed to decode JSON response from POST {LogColors.BOLD}{api_url}{LogColors.ENDC}{LogColors.FAIL} (try-create) on attempt {attempt + 1} (Status: {response.status_code if response else 'N/A'}). Error: {e_json}. Response text snippet: {response_text_snippet}{LogColors.ENDC}", exc_info=True)
            break # Stop retrying if successful status but bad JSON
            
    # After the loop, if we haven't returned success, construct the error payload
    error_payload = {"success": False}
    if last_exception_try_create:
        error_payload["error"] = str(last_exception_try_create)
        if isinstance(last_exception_try_create, requests.exceptions.HTTPError) and last_exception_try_create.response is not None:
            error_payload["api_status_code"] = last_exception_try_create.response.status_code
            try:
                api_response_json = last_exception_try_create.response.json()
                error_payload["api_message"] = api_response_json.get("message")
                error_payload["api_reason"] = api_response_json.get("reason")
                error_payload["api_activity_details_on_error"] = api_response_json.get("activity") # if present in error
                # Add any other fields from the API's error response you want to capture
                if "details" in api_response_json: error_payload["api_error_details"] = api_response_json["details"]
            except json.JSONDecodeError:
                error_payload["api_response_text"] = last_exception_try_create.response.text[:500] # First 500 chars if not JSON
    else:
        error_payload["error"] = "Unknown error after retries for try-create (last_exception_try_create was None)"
        
    return error_payload


# --- Thought Cleaning Function (adapted from generatethoughts.py) ---

def clean_thought_content(tables: Dict[str, Table], thought_content: str) -> str:
    """Cleans thought content by replacing custom IDs with readable names."""
    if not thought_content or not tables: # Added check for tables
        return thought_content if thought_content else ""

    cleaned_content = thought_content
    id_cache = {} # Cache for looked-up names

    # Regex to find patterns like building_id, land_id, polygon-id etc.
    id_pattern = re.compile(r'\b(building|land|citizen|resource|contract)_([a-zA-Z0-9_.\-]+)\b|\b(polygon-([0-9]+))\b')

    for match in id_pattern.finditer(thought_content):
        if match.group(1): # Matches building_, land_, citizen_, resource_, contract_
            full_id = match.group(0)
            id_type = match.group(1).lower()
            specific_id_part = match.group(2)
        elif match.group(3): # Matches polygon-
            full_id = match.group(3) 
            id_type = "polygon"
            specific_id_part = match.group(4) 
        else:
            continue

        if full_id in id_cache:
            readable_name = id_cache[full_id]
            if readable_name: 
                cleaned_content = cleaned_content.replace(full_id, readable_name)
            continue

        readable_name = None
        try:
            if id_type == "building":
                record = tables.get("buildings", {}).first(formula=f"{{BuildingId}}='{_escape_airtable_value(full_id)}'")
                if record and record.get("fields", {}).get("Name"):
                    readable_name = record["fields"]["Name"]
            elif id_type == "land": 
                record = tables.get("lands", {}).first(formula=f"{{LandId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("HistoricalName") or record.get("fields", {}).get("EnglishName")
            elif id_type == "polygon": 
                record = tables.get("lands", {}).first(formula=f"{{LandId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("HistoricalName") or record.get("fields", {}).get("EnglishName")
            elif id_type == "citizen": 
                record = tables.get("citizens", {}).first(formula=f"{{Username}}='{_escape_airtable_value(specific_id_part)}'")
                if record:
                    fname = record.get("fields", {}).get("FirstName", "")
                    lname = record.get("fields", {}).get("LastName", "")
                    readable_name = f"{fname} {lname}".strip() if fname or lname else specific_id_part
            elif id_type == "resource": 
                record = tables.get("resources", {}).first(formula=f"{{ResourceId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("Name") or record.get("fields", {}).get("Type")
            elif id_type == "contract":
                record = tables.get("contracts", {}).first(formula=f"{{ContractId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("Title") or f"Contract ({specific_id_part[:10]}...)"

            if readable_name:
                log.debug(f"Replacing ID '{full_id}' with '{readable_name}' in reflection.")
                cleaned_content = cleaned_content.replace(full_id, f"'{readable_name}'") 
                id_cache[full_id] = f"'{readable_name}'"
            else:
                id_cache[full_id] = None 
        except Exception as e:
            log.error(f"Error looking up ID {full_id} for reflection cleaning: {e}")
            id_cache[full_id] = None

    # Step 2: Remove sentences containing technical keywords
    technical_keywords = [
        "gemini ", "api", "argument", "auth", "aws", "azure", "backend", "branch", "bug", "cache", "ci/cd",
        "cli", "cloud", "code", "commit", "component", "container", "cookie", "cpu", "css",
        "data model", "database", "debug", "deployment", "devops", "dns", "docker", "endpoint",
        "error", "exception", "exploit", "firewall", "frontend", "function", "gcp", "git",
        "github", "gitlab", "gpu", "graphql", "gui", "hdd", "html", "http", "https",
        "interface", "ios", "ip", "javascript", "jira", "json", "jwt", "kernel", "kubernetes",
        "lambda", "linux", "local", "log", "logging", "macos", "malware", "method", "microservice",
        "module", "network request", "next.js", "node.js", "oauth", "object", "os", "parameter",
        "patch", "payload", "phishing", "pixel", "plugin", "protocol", "pull request", "python",
        "query", "ram", "react", "release", "remote", "repository", "request", "response", "rest",
        "routing", "runtime", "script", "sdk", "server", "serverless", "session", "shell", "sla",
        "slo", "software", "source code", "sql", "ssd", "ssl", "stacktrace", "staging", "sysadmin",
        "tcp", "template", "terminal", "test", "thread", "ticket", "tls", "token", "typescript",
        "udp", "ui", "unit test", "upload", "url", "user interface", "ux", "variable", "version",
        "virtualization", "vm", "vpn", "vulnerability", "web", "websocket", "windows", "xml", "yaml"
    ]
    
    # Split content into sentences. This regex tries to handle various sentence terminators.
    sentences = re.split(r'(?<=[.!?])\s+', cleaned_content)
    
    filtered_sentences = []
    for sentence in sentences:
        if not any(keyword.lower() in sentence.lower() for keyword in technical_keywords):
            filtered_sentences.append(sentence)
        else:
            log.debug(f"Removing sentence due to technical keyword: '{sentence[:50]}...'")
            
    cleaned_content = " ".join(filtered_sentences)

    return cleaned_content

# Global variable to store Airtable schema content
AIRTABLE_SCHEMA_CONTENT = ""

# Global variable to store API Reference content (raw and extracted)
RAW_API_REFERENCE_CONTENT = ""
API_REFERENCE_EXTRACTED_TEXT = ""

# Global variable to store Activity Creation Reference content
ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT = ""

# Global variable to store Reads Reference content
RAW_READS_REFERENCE_CONTENT = ""
READS_REFERENCE_EXTRACTED_TEXT = ""


def extract_text_from_activity_reference(tsx_content: str) -> str:
    """
    Extracts key textual information from the ActivityReference.tsx content.
    Focuses on activity types, descriptions, activityDetails structure, and prerequisites.
    """
    if not tsx_content:
        return "Activity Reference content not available."

    extracted_activities = []
    
    # Regex to find sections for each activity type
    # It looks for <section ... id="<some_id>"> blocks
    section_pattern = re.compile(
        r'<section id="([^"]+)"[^>]*>.*?<h3[^>]*><code>(.*?)</code></h3>.*?<p[^>]*>(.*?)</p>.*?<h4[^>]*><code>activityDetails</code> Structure:</h4>.*?<pre[^>]*>(\{.*?\})</pre>(.*?)<\/section>',
        re.DOTALL | re.IGNORECASE
    )

    for match in section_pattern.finditer(tsx_content):
        # section_id = match.group(1).strip() # e.g., "rest", "idle"
        activity_type = match.group(2).strip() # e.g., "rest"
        description = match.group(3).strip()
        activity_details_json_str = match.group(4).strip()
        remaining_section_content = match.group(5)

        # Clean up description and details_json_str from any HTML tags if necessary (basic cleaning)
        description = re.sub(r'<[^>]+>', '', description)
        # The pre block content is already a string literal of JSON, so direct use is fine.

        prerequisites_text = ""
        prereq_match = re.search(r'<p[^>]*><strong>Prerequisites:</strong>(.*?)</p>', remaining_section_content, re.DOTALL | re.IGNORECASE)
        if prereq_match:
            prerequisites_text = re.sub(r'<[^>]+>', '', prereq_match.group(1)).strip()

        activity_info = (
            f"Activity Type: `{activity_type}`\n"
            f"Description: {description}\n"
            f"ActivityDetails Structure:\n```json\n{activity_details_json_str}\n```\n"
        )
        if prerequisites_text:
            activity_info += f"Prerequisites: {prerequisites_text}\n"
        
        extracted_activities.append(activity_info)

    if not extracted_activities:
        # Fallback for general payload if specific activities not extracted
        general_payload_match = re.search(r'<section id="general-payload".*?<pre[^>]*>(\{.*?\})</pre>', tsx_content, re.DOTALL | re.IGNORECASE)
        if general_payload_match:
            general_payload_json = general_payload_match.group(1).strip()
            extracted_activities.append(f"General Request Payload for POST /api/actions/create-activity:\n```json\n{general_payload_json}\n```\n")
        else:
            return "Could not extract structured Activity Reference details. Raw content might be too complex."

    return "\n\n---\n\n".join(extracted_activities)


def extract_text_from_api_reference(html_content: str) -> str:
    """
    Extracts key textual information from the ApiReference.tsx content.
    This is a simplified extraction and might need refinement.
    """
    if not html_content:
        return "API Reference content not available."

    extracted_sections = []
    
    # Regex to find endpoint blocks (h3 for path, then subsequent relevant divs)
    # This is a very basic regex and might need to be much more sophisticated
    # or replaced with a proper HTML/JSX parser for robustness.
    endpoint_blocks = re.finditer(
        r'<h3.*?>(GET|POST|PATCH|DELETE)\s*([^\s<]+)</h3>\s*<p.*?>(.*?)</p>(.*?)(?=<h3|<section id="error-handling"|<section id="pagination"|<footer)', 
        html_content, 
        re.DOTALL | re.IGNORECASE
    )

    for block in endpoint_blocks:
        method = block.group(1).strip()
        path = block.group(2).strip()
        description = block.group(3).strip()
        details_html = block.group(4)

        section_text = f"Endpoint: {method} {path}\nDescription: {description}\n"

        # Extract Query Parameters
        query_params_match = re.search(r'<h4[^>]*>Query Parameters</h4>.*?<ul.*?>(.*?)</ul>', details_html, re.DOTALL | re.IGNORECASE)
        if query_params_match:
            params_list_html = query_params_match.group(1)
            params = re.findall(r'<li><code>(.*?)</code>(.*?)</li>', params_list_html, re.DOTALL | re.IGNORECASE)
            if params:
                section_text += "Query Parameters:\n"
                for param_name, param_desc in params:
                    param_desc_clean = re.sub(r'<.*?>', '', param_desc).strip()
                    section_text += f"  - {param_name.strip()}: {param_desc_clean}\n"
        
        # Extract Request Body
        req_body_match = re.search(r'<h4[^>]*>Request Body</h4>.*?<pre.*?>(.*?)</pre>', details_html, re.DOTALL | re.IGNORECASE)
        if req_body_match:
            body_example = req_body_match.group(1).strip()
            body_example_clean = re.sub(r'<.*?>', '', body_example) # Basic tag stripping
            section_text += f"Request Body Example:\n```json\n{body_example_clean}\n```\n"

        # Extract Response
        response_match = re.search(r'<h4[^>]*>Response</h4>.*?<pre.*?>(.*?)</pre>', details_html, re.DOTALL | re.IGNORECASE)
        if response_match:
            response_example = response_match.group(1).strip()
            response_example_clean = re.sub(r'<.*?>', '', response_example) # Basic tag stripping
            section_text += f"Response Example:\n```json\n{response_example_clean}\n```\n"
            
        extracted_sections.append(section_text)

    if not extracted_sections:
        return "Could not extract structured API details. Raw content might be too complex for simple regex."

    return "\n\n---\n\n".join(extracted_sections)


def load_api_reference_content():
    """Loads and extracts text from ApiReference.tsx."""
    global RAW_API_REFERENCE_CONTENT, API_REFERENCE_EXTRACTED_TEXT
    try:
        ref_file_path = os.path.join(PROJECT_ROOT, "components", "Documentation", "ApiReference.tsx")
        if os.path.exists(ref_file_path):
            with open(ref_file_path, "r", encoding="utf-8") as f:
                RAW_API_REFERENCE_CONTENT = f.read() # Store raw content
            log.info(f"{LogColors.OKGREEN}Successfully loaded raw API Reference content.{LogColors.ENDC}")
            # Now extract text from the raw content
            API_REFERENCE_EXTRACTED_TEXT = extract_text_from_api_reference(RAW_API_REFERENCE_CONTENT)
            if "Could not extract" not in API_REFERENCE_EXTRACTED_TEXT and API_REFERENCE_EXTRACTED_TEXT != "API Reference content not available.":
                 log.info(f"{LogColors.OKGREEN}Successfully extracted text from API Reference. Length: {len(API_REFERENCE_EXTRACTED_TEXT)}{LogColors.ENDC}")
            else:
                 log.warning(f"{LogColors.WARNING}Extraction from API Reference might have issues: {API_REFERENCE_EXTRACTED_TEXT[:100]}...{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}API Reference file not found at {ref_file_path}. Proceeding without it.{LogColors.ENDC}")
            RAW_API_REFERENCE_CONTENT = "API Reference file not found."
            API_REFERENCE_EXTRACTED_TEXT = "API Reference file not found."
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error loading or extracting API Reference content: {e}{LogColors.ENDC}", exc_info=True)
        RAW_API_REFERENCE_CONTENT = "Error loading API Reference."
        API_REFERENCE_EXTRACTED_TEXT = "Error loading API Reference."

def load_activity_reference_content():
    """Loads content from backend/docs/activities.md."""
    global ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT
    try:
        ref_file_path = os.path.join(PROJECT_ROOT, "backend", "docs", "activities.md")
        if os.path.exists(ref_file_path):
            with open(ref_file_path, "r", encoding="utf-8") as f:
                ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT = f.read()
            log.info(f"{LogColors.OKGREEN}Successfully loaded Activity Creation Reference (activities.md). Length: {len(ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT)}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Activity Creation Reference file (activities.md) not found at {ref_file_path}. Proceeding without it.{LogColors.ENDC}")
            ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT = "Activity Creation Reference file (activities.md) not found."
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error loading Activity Creation Reference content (activities.md): {e}{LogColors.ENDC}", exc_info=True)
        ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT = "Error loading Activity Creation Reference (activities.md)."

def extract_text_from_reads_reference(tsx_content: str) -> str:
    """
    Extracts key textual information from the ReadsReference.tsx content.
    Focuses on request types, descriptions, parameters, and underlying APIs.
    """
    if not tsx_content:
        return "Reads Reference content not available."

    extracted_sections = []

    # General intro for /api/try-read
    intro_match = re.search(r'<h1.*?Reads Reference.*?</h1>\s*<p.*?>(.*?)</p>\s*<p.*?Note for AI Agents:(.*?)</p>', tsx_content, re.DOTALL | re.IGNORECASE)
    if intro_match:
        intro_desc = re.sub(r'<[^>]+>', '', intro_match.group(1)).strip()
        intro_note = re.sub(r'<[^>]+>', '', intro_match.group(2)).strip()
        extracted_sections.append(f"Simplified Reads Endpoint (POST /api/try-read):\nDescription: {intro_desc}\nNote for AI Agents: {intro_note}\n")

    # Regex to find sections for each request type
    request_type_pattern = re.compile(
        r'<section key="([^"]+)"[^>]*>.*?<h3[^>]*><code>(.*?)</code>(?:.*?<span[^>]*>alias: <code>(.*?)</code></span>)?</h3>.*?<p[^>]*class="text-sm mb-3">(.*?)</p>.*?<p[^>]*class="text-xs text-gray-500 mb-3">.*?Calls: <code>(.*?)</code>.*?</p>(.*?)<\/section>',
        re.DOTALL | re.IGNORECASE
    )

    for match in request_type_pattern.finditer(tsx_content):
        req_type_key = match.group(1).strip() # key attribute, e.g., get_my_profile
        req_type_name = match.group(2).strip() # name in <code>
        alias = match.group(3).strip() if match.group(3) else None
        description = re.sub(r'<[^>]+>', '', match.group(4).strip())
        underlying_api = match.group(5).strip()
        parameters_html_content = match.group(6)

        section_text = f"Request Type: `{req_type_name}`\n"
        if alias:
            section_text += f"Alias: `{alias}`\n"
        section_text += f"Description: {description}\n"
        section_text += f"Underlying API Call: `{underlying_api}`\n"

        params_list_match = re.search(r'<ul.*?>(.*?)</ul>', parameters_html_content, re.DOTALL | re.IGNORECASE)
        if params_list_match:
            params_list_html = params_list_match.group(1)
            params = re.findall(r'<li><code>(.*?)</code>\s*\(<code>(.*?)</code>\)\s*-\s*(<strong>Required</strong>|Optional)\.\s*(.*?)</li>', params_list_html, re.DOTALL | re.IGNORECASE)
            if params:
                section_text += "Parameters:\n"
                for param_name, param_type, param_req, param_desc in params:
                    section_text += f"  - `{param_name.strip()}` ({param_type.strip()}): {param_req.strip()}. {param_desc.strip()}\n"
            else: # No parameters listed in <ul>
                 no_params_text_match = re.search(r'<p[^>]*>No parameters required.*?</p>', parameters_html_content, re.DOTALL | re.IGNORECASE)
                 if no_params_text_match:
                     section_text += "Parameters: None required.\n"

        extracted_sections.append(section_text)
    
    if not extracted_sections:
        return "Could not extract structured Reads Reference details. Raw content might be too complex for simple regex."

    return "\n\n---\n\n".join(extracted_sections)

def load_reads_reference_content():
    """Loads and extracts text from ReadsReference.tsx."""
    global RAW_READS_REFERENCE_CONTENT, READS_REFERENCE_EXTRACTED_TEXT
    try:
        ref_file_path = os.path.join(PROJECT_ROOT, "components", "Documentation", "ReadsReference.tsx")
        if os.path.exists(ref_file_path):
            with open(ref_file_path, "r", encoding="utf-8") as f:
                RAW_READS_REFERENCE_CONTENT = f.read()
            log.info(f"{LogColors.OKGREEN}Successfully loaded raw Reads Reference content.{LogColors.ENDC}")
            READS_REFERENCE_EXTRACTED_TEXT = extract_text_from_reads_reference(RAW_READS_REFERENCE_CONTENT)
            if "Could not extract" not in READS_REFERENCE_EXTRACTED_TEXT and READS_REFERENCE_EXTRACTED_TEXT != "Reads Reference content not available.":
                 log.info(f"{LogColors.OKGREEN}Successfully extracted text from Reads Reference. Length: {len(READS_REFERENCE_EXTRACTED_TEXT)}{LogColors.ENDC}")
            else:
                 log.warning(f"{LogColors.WARNING}Extraction from Reads Reference might have issues: {READS_REFERENCE_EXTRACTED_TEXT[:100]}...{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Reads Reference file not found at {ref_file_path}. Proceeding without it.{LogColors.ENDC}")
            RAW_READS_REFERENCE_CONTENT = "Reads Reference file not found."
            READS_REFERENCE_EXTRACTED_TEXT = "Reads Reference file not found."
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error loading or extracting Reads Reference content: {e}{LogColors.ENDC}", exc_info=True)
        RAW_READS_REFERENCE_CONTENT = "Error loading Reads Reference."
        READS_REFERENCE_EXTRACTED_TEXT = "Error loading Reads Reference."

def load_airtable_schema_content():
    """Loads the content of airtable_schema.md."""
    global AIRTABLE_SCHEMA_CONTENT
    try:
        schema_file_path = os.path.join(PROJECT_ROOT, "backend", "docs", "airtable_schema.md")
        if os.path.exists(schema_file_path):
            with open(schema_file_path, "r", encoding="utf-8") as f:
                AIRTABLE_SCHEMA_CONTENT = f.read()
            log.info(f"{LogColors.OKGREEN}Successfully loaded Airtable schema content.{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Airtable schema file not found at {schema_file_path}. Proceeding without it.{LogColors.ENDC}")
            AIRTABLE_SCHEMA_CONTENT = "Airtable schema file not found."
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error loading Airtable schema content: {e}{LogColors.ENDC}", exc_info=True)
        AIRTABLE_SCHEMA_CONTENT = "Error loading Airtable schema."


# --- API Documentation Summary ---
# This should be a more structured and concise summary of relevant API endpoints.
# For now, we'll pass the base URL and rely on the AI's knowledge or a very specific prompt.
API_DOCUMENTATION_SUMMARY = {
    "base_url": API_BASE_URL,
    "notes": (
        "You are an AI citizen interacting with the La Serenissima API. Key guidelines:\n"
        "1.  **Initiate Endeavors (Activities & Actions) via `/api/activities/try-create`**: This is your primary method to start any endeavor. Provide `activityType` (e.g., 'rest', 'bid_on_land', 'send_message', 'eat') and `activityParameters`. The game engine will create the necessary activity records. For example, `activityType: \"eat\"` will attempt sustenance from inventory, then home, then tavern. Consult `backend/docs/activities.md` and `backend/docs/actions.md` for `activityType`s and their parameters.\n"
        "2.  **Simplified GETs via `/api/try-read`**: For common information gathering, use `POST /api/try-read`. Consult the `compendium_of_missive_details` (ReadsReference.tsx extract) in `addSystem` for available `requestType` values and their `parameters`.\n"
        "3.  **Dynamic GET Filtering**: For direct GET requests to list endpoints (e.g., /api/buildings, /api/citizens, /api/contracts), you can filter results by providing Airtable field names as query parameters (e.g., `/api/buildings?Owner=NLR&Category=business`). Airtable fields are PascalCase (see `backend/docs/airtable_schema.md`).\n"
        "4.  **Direct Activity Creation via `/api/actions/create-activity`**: Use this if you have *all* details for a specific activity record, including title, description, thought, and fully structured `activityDetails`.\n"
        "5.  **POST/PATCH Request Body Keys**: For `/api/activities/try-create`, the `activityParameters` in the body often use `camelCase` or specific names defined by the activity (consult `activities.md`). For `/api/try-read`, parameters are also typically `camelCase`. Direct calls to other POST/PATCH endpoints are generally deprecated for AI use.\n"
        "6.  **Airtable Schema**: Refer to `backend/docs/airtable_schema.md` (available in `addSystem.overview_of_city_records_structure` for non-local models) for exact Airtable field names.\n"
        "7.  **Focus**: Make informed decisions. Choose API calls that provide relevant data for your objectives.\n"
        "8.  **Latest Activity**: Your most recent activity details are in `addSystem.intelligence_briefing.lastActivity`."
    ),
    "example_get_endpoints": [ # These are examples of direct GETs, distinct from /api/try-read
        "/api/citizens/{YourUsername}",
        "/api/citizens?SocialClass=Popolani&IsAI=true", # Filtered list of AI Popolani citizens
        "/api/buildings?Owner={YourUsername}&Category=business", # Your business buildings
        "/api/buildings?Type=market_stall&IsConstructed=true", # All constructed market stalls
        "/api/lands?Owner={YourUsername}&District=San Polo", # Your lands in San Polo
        "/api/resources/counts?owner={YourUsername}", # Your resource counts (specific endpoint)
        "/api/activities?citizenId={YourUsername}&ongoing=true", # Your currently active activities
        # Note: Querying contracts directly is possible, but actions on contracts should be via /api/activities/try-create.
        "/api/contracts?Seller={YourUsername}&Type=public_sell&Status=active", 
        "/api/contracts?ResourceType=wood&Type=public_sell&Status=active", 
        "/api/problems?Citizen={YourUsername}&Status=active", # Your active problems
        "/api/relevancies?RelevantToCitizen={YourUsername}&Category=opportunity&Score=>50" # High-score opportunities for you
    ],
    "example_post_endpoints": [ # AI should STRONGLY prefer /api/activities/try-create for actions.
        "/api/activities/try-create", # PREFERRED METHOD FOR ALL ACTIONS. Body: {"citizenUsername": "...", "activityType": "...", "activityParameters": {...}}. Consult activities.md for types and params.
        "/api/try-read", # Utility for common GETs. Body: {"requestType": "type", "parameters": {...}}
        "/api/actions/create-activity" # ADVANCED: For direct creation of a fully detailed activity. Body keys: citizenUsername, activityType, title, description, thought, activityDetails, notes (optional)
        # Direct POSTs to /api/contracts, /api/messages/send, /api/buildings are DEPRECATED for AI use.
    ]
}

# --- Main Processing Logic ---

def autonomously_run_ai_citizen(
    tables: Dict[str, Table],
    kinos_api_key: str,
    ai_citizen_record: Dict,
    dry_run: bool = False,
    kinos_model_override: Optional[str] = None,
    user_message: Optional[str] = None, # New parameter
    add_system_prompt_text: Optional[str] = None # New parameter for system prompt addition
):
    """Manages the 3-step autonomous run for a single AI citizen."""
    ai_username = ai_citizen_record["fields"].get("Username")
    ai_display_name = ai_citizen_record["fields"].get("FirstName", ai_username)
    if not ai_username:
        log.warning(f"{LogColors.WARNING}AI citizen record {ai_citizen_record['id']} missing Username. Skipping.{LogColors.ENDC}")
        return

    log_header(f"Starting Autonomous Run for {ai_username} ({ai_display_name})", color_code=Fore.MAGENTA if colorama_available else '')

    # Step 1: Gather Data
    log.info(f"{LogColors.OKCYAN}--- Step 1: Gather Data for {ai_username} ---{LogColors.ENDC}")
    latest_activity_data = _get_latest_activity_api(ai_username)
    latest_daily_update_content = _get_latest_daily_update(tables)

    prompt_step1_context_elements_guided = [
        "your personal ledger (`addSystem.personal_ledger`)",
        "the registry of available missives (API endpoints, `addSystem.available_missives_summary`)",
        "the structure of the city's records (Airtable fields, `addSystem.city_records_structure`)",
        "your most recent undertaking (`addSystem.latest_undertaking`)"
    ]
    if user_message:
        prompt_step1_context_elements_guided.append(f"a missive requiring your attention (`{user_message}`)")

    prompt_step1_context_mention_guided = f"Consult {', '.join(prompt_step1_context_elements_guided[:-1])}{' and ' if len(prompt_step1_context_elements_guided) > 1 else ''}{prompt_step1_context_elements_guided[-1]}."

    prompt_step1_base = (
        f"You are {ai_display_name}, a discerning citizen of La Serenissima. Your current objective is to assess your standing and identify emerging prospects. "
        f"Official channels for information are accessible via {API_BASE_URL}. {prompt_step1_context_mention_guided} "
    )
    
    prompt_step1 = prompt_step1_base + (
        "Determine which single official channel (GET API endpoint) you wish to consult to gather initial intelligence pertinent to your ambitions (e.g., your holdings, market conditions, current predicaments). "
        "For inquiries (query parameters), you may use `camelCase` (e.g., `owner`, `resourceType`). "
        "Respond with your directive in JSON format: `{\"endpoint\": \"/api/your/choice\", \"params\": {\"paramName\": \"value\"}}` or `{\"endpoint\": \"/api/your/choice\"}` if no specific inquiry. "
        "Select a channel that offers a comprehensive overview or addresses an immediate concern."
    )
    if add_system_prompt_text:
        prompt_step1 += f"\n\nIMPORTANT SYSTEM NOTE: {add_system_prompt_text}"

    add_system_step1 = {
        "available_missives_summary": CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE,
        "city_records_structure": CONCISE_AIRTABLE_SCHEMA_FIELD_LIST,
        "current_venice_time": datetime.now(VENICE_TIMEZONE).isoformat(),
        "personal_ledger": ai_citizen_record["fields"],
        "latest_undertaking": latest_activity_data or {},
        "latest_city_dispatch": latest_daily_update_content or "No recent city dispatch available."
    }
    if user_message:
        add_system_step1["user_provided_message"] = user_message
    
    kinos_response_step1 = None
    if not dry_run:
        kinos_response_step1 = make_kinos_call(kinos_api_key, ai_username, prompt_step1, add_system_step1, kinos_model_override)

    api_get_request_details = None
    if kinos_response_step1 and isinstance(kinos_response_step1, dict) and "endpoint" in kinos_response_step1:
        api_get_request_details = kinos_response_step1
        log.info(f"{LogColors.OKGREEN}AI {ai_username} decided to call GET: {LogColors.BOLD}{api_get_request_details['endpoint']}{LogColors.ENDC}{LogColors.OKGREEN} with params: {api_get_request_details.get('params')}{LogColors.ENDC}")
    elif dry_run:
        log.info(f"{Fore.YELLOW}[DRY RUN] AI {ai_username} would decide on a GET API call.{Style.RESET_ALL}")
        # Simulate a common GET call for dry run
        api_get_request_details = {"endpoint": f"/api/citizens/{ai_username}"}
    else:
        # The warning for non-JSON response is now handled inside make_kinos_call.
        # This log will capture cases where the response was None or not a dict with "endpoint".
        log.warning(f"{LogColors.WARNING}Failed to get a valid GET API decision structure from Kinos for {ai_username}. Kinos response object: {kinos_response_step1}{LogColors.ENDC}")
        log_header(f"Autonomous Run for {ai_username} ({ai_display_name}) INTERRUPTED after Step 1", color_code=Fore.RED if colorama_available else '')
        return # End process for this AI if step 1 fails

    api_get_response_data = None
    if api_get_request_details:
        endpoint = api_get_request_details["endpoint"]
        params = api_get_request_details.get("params")
        if not dry_run:
            api_get_response_data = make_api_get_request(endpoint, params)
            if api_get_response_data:
                log.info(f"{LogColors.OKGREEN}Successfully received data from GET {endpoint} for {ai_username}.{LogColors.ENDC}")
            else:
                log.warning(f"{LogColors.WARNING}Failed to get data from GET {endpoint} for {ai_username}. AI will proceed with no data.{LogColors.ENDC}")
                api_get_response_data = {"error": f"Failed to fetch data from {endpoint}"} # Provide error structure for AI
        else:
            log.info(f"{Fore.YELLOW}[DRY RUN] Would make GET request to {endpoint} with params {params} for {ai_username}.{Style.RESET_ALL}")
            api_get_response_data = {"dry_run_data": f"Simulated response from GET {endpoint}"}


    # Step 2: Elaborate Strategy & Define Actions
    log.info(f"{LogColors.OKCYAN}--- Step 2: Elaborate Strategy & Define Actions for {ai_username} ---{LogColors.ENDC}")
    prompt_step2_context_mention_guided = "Based on these reports, your personal ledger (`addSystem.personal_ledger`), your overarching ambitions, the registry of available missives (API endpoints, `addSystem.available_missives_summary`), and the structure of the city's records (Airtable fields, `addSystem.city_records_structure`),"
        
    prompt_step2 = (
        f"You are {ai_display_name}. Your personal ledger is in `addSystem.personal_ledger`. You previously requested reports via official channels (GET API). "
        f"The findings were (or simulated/error report if previous step failed/dry_run): \n```json\n{json.dumps(api_get_response_data, indent=2)}\n```\n"
        f"{prompt_step2_context_mention_guided} devise your strategy and decree your next actions. "
        "When specifying the `body` for issuing decrees (POST requests), you may use `camelCase` for keys (e.g., `sender`, `resourceType`, `targetAmount`). The Doge's scribes (the server) will transcribe them appropriately for the city's records. "
        "Respond with your directives in JSON format: `{\"strategy_summary\": \"Your brief strategy...\", \"actions\": [{\"method\": \"POST\", \"endpoint\": \"/api/activities/try-create\", \"body\": {\"citizenUsername\": \"YourUsername\", \"activityType\": \"your_chosen_activity_or_action\", \"activityParameters\": {...}}}, {\"method\": \"GET\", ...}]}`. "
        "If no actions are warranted at this time, return `{\"strategy_summary\": \"Observation...\", \"actions\": []}`. "
        "Prioritize using `/api/activities/try-create` for initiating endeavors."
    )
    if add_system_prompt_text:
        prompt_step2 += f"\n\nIMPORTANT SYSTEM NOTE: {add_system_prompt_text}"

    add_system_step2 = {
        "available_missives_summary": CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE,
        "city_records_structure": CONCISE_AIRTABLE_SCHEMA_FIELD_LIST,
        "previous_get_response": api_get_response_data, # "previous_reports" might be better
        "personal_ledger": ai_citizen_record["fields"],
        "latest_city_dispatch": latest_daily_update_content or "No recent city dispatch available."
    }

    kinos_response_step2 = None
    if not dry_run:
        kinos_response_step2 = make_kinos_call(kinos_api_key, ai_username, prompt_step2, add_system_step2, kinos_model_override)

    api_post_actions = []
    strategy_summary = "No strategy formulated."
    if kinos_response_step2 and isinstance(kinos_response_step2, dict):
        strategy_summary = kinos_response_step2.get("strategy_summary", strategy_summary)
        if "actions" in kinos_response_step2 and isinstance(kinos_response_step2["actions"], list):
            api_post_actions = kinos_response_step2["actions"]
            log.info(f"{LogColors.OKGREEN}AI {ai_username} strategy: {LogColors.BOLD}{strategy_summary}{LogColors.ENDC}")
            log.info(f"{LogColors.OKGREEN}AI {ai_username} decided on {len(api_post_actions)} POST actions.{LogColors.ENDC}")
            if api_post_actions: log.debug(f"{LogColors.LIGHTBLUE}Actions: {json.dumps(api_post_actions, indent=2)}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}AI {ai_username} response for Step 2 did not contain a valid 'actions' list. Strategy: {strategy_summary}{LogColors.ENDC}")
    elif dry_run:
        strategy_summary = "[DRY RUN] AI would formulate a strategy."
        log.info(f"{Fore.YELLOW}{strategy_summary}{Style.RESET_ALL}")
        log.info(f"{Fore.YELLOW}[DRY RUN] AI {ai_username} would decide on POST API calls.{Style.RESET_ALL}")
        # api_post_actions = [{"method": "POST", "endpoint": "/api/messages/send", "body": {"sender": ai_username, "receiver": "ConsiglioDeiDieci", "content": "[DRY RUN] Reporting for duty."}}]
    else:
        log.warning(f"{LogColors.WARNING}Failed to get valid strategy/actions from Kinos for {ai_username} in Step 2. Response: {kinos_response_step2}{LogColors.ENDC}")
        # Continue to step 3 with no actions taken

    api_post_responses_summary = []
    if api_post_actions:
        log.info(f"{LogColors.OKBLUE}Executing {len(api_post_actions)} POST action(s) for {ai_username}...{LogColors.ENDC}")
        for i, action in enumerate(api_post_actions):
            if isinstance(action, dict) and action.get("method") == "POST" and "endpoint" in action:
                endpoint = action["endpoint"]
                body = action.get("body")
                log.info(f"{LogColors.OKBLUE}--- Executing POST action {i+1}/{len(api_post_actions)} for {ai_username}: {LogColors.BOLD}{endpoint}{LogColors.ENDC}{LogColors.OKBLUE} ---{LogColors.ENDC}")
                
                post_response = None
                if not dry_run:
                    post_response = make_api_post_request(endpoint, body)
                    if post_response and post_response.get("success"):
                        log.info(f"{LogColors.OKGREEN}POST to {endpoint} for {ai_username} successful.{LogColors.ENDC}")
                    else:
                        log.warning(f"{LogColors.WARNING}POST to {endpoint} for {ai_username} failed or had no success flag. Response: {post_response}{LogColors.ENDC}")
                else:
                    log.info(f"{Fore.YELLOW}[DRY RUN] Would make POST request to {endpoint} with body {json.dumps(body, indent=2)[:100]}... for {ai_username}.{Style.RESET_ALL}")
                    post_response = {"dry_run_post_response": f"Simulated response from POST {endpoint}", "success": True}
                
                api_post_responses_summary.append({
                    "action_endpoint": endpoint,
                    "action_body_snippet": json.dumps(body, indent=2)[:200] + "..." if body else "None",
                    "response_summary": json.dumps(post_response, indent=2)[:200] + "..." if post_response else "None"
                })
            else:
                log.warning(f"{LogColors.WARNING}Invalid action format from Kinos for {ai_username}: {action}{LogColors.ENDC}")
                api_post_responses_summary.append({"error": "Invalid action format", "action_details": action})
    else:
        log.info(f"{LogColors.OKBLUE}No POST actions defined by {ai_username} in Step 2.{LogColors.ENDC}")

    # Step 3: Note Results & Plan Next Steps
    log.info(f"{LogColors.OKCYAN}--- Step 3: Note Results & Plan Next Steps for {ai_username} ---{LogColors.ENDC}")
    prompt_step3_context_mention_guided = "Reflect on these outcomes, considering your personal ledger (`addSystem.personal_ledger`), the registry of available missives (API endpoints, `addSystem.available_missives_summary`), and the structure of the city's records (Airtable fields, `addSystem.city_records_structure`) (all in `addSystem`)"

    prompt_step3 = (
        f"You are {ai_display_name}. Your personal ledger is in `addSystem.personal_ledger`. Your strategy was: '{strategy_summary}'. "
        f"Your decreed actions (POST requests) resulted in (or simulated results if dry_run/failed): \n```json\n{json.dumps(api_post_responses_summary, indent=2)}\n```\n"
        f"{prompt_step3_context_mention_guided}. What wisdom have you gained? What are your key observations or intentions for your next period of independent endeavor? "
        "Respond with a concise summary for your records (max 3-4 sentences)."
    )
    if add_system_prompt_text:
        prompt_step3 += f"\n\nIMPORTANT SYSTEM NOTE: {add_system_prompt_text}"

    add_system_step3 = {
        "available_missives_summary": CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE,
        "city_records_structure": CONCISE_AIRTABLE_SCHEMA_FIELD_LIST,
        "post_actions_summary": api_post_responses_summary, # "outcomes_of_decrees" might be better
        "personal_ledger": ai_citizen_record["fields"],
        "latest_city_dispatch": latest_daily_update_content or "No recent city dispatch available."
    }

    kinos_response_step3 = None
    if not dry_run:
        kinos_response_step3 = make_kinos_call(kinos_api_key, ai_username, prompt_step3, add_system_step3, kinos_model_override)

    ai_reflection = "No reflection generated."
    if kinos_response_step3 and isinstance(kinos_response_step3, dict) and "reflection_text" in kinos_response_step3:
        ai_reflection = kinos_response_step3["reflection_text"]
        log.info(f"{LogColors.OKGREEN}AI {ai_username} raw reflection: {LogColors.BOLD}{ai_reflection}{LogColors.ENDC}")
        
        cleaned_reflection = ai_reflection # Default to raw if cleaning fails or no tables
        if tables: # Ensure tables object is available
            cleaned_reflection = clean_thought_content(tables, ai_reflection)
            log.info(f"{LogColors.OKBLUE}AI {ai_username} cleaned reflection: {LogColors.BOLD}{cleaned_reflection}{LogColors.ENDC}")

        # Store reflection as a message to self
        if not dry_run and tables and cleaned_reflection.strip(): # Check if cleaned_reflection is not empty
            try:
                tables["messages"].create({
                    "Sender": ai_username,
                    "Receiver": ai_username,
                    "Content": f"Autonomous Run Reflection:\nStrategy: {strategy_summary}\nReflection: {cleaned_reflection}",
                    "Type": "autonomous_run_log",
                    "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
                    "ReadAt": datetime.now(VENICE_TIMEZONE).isoformat() # Mark as read for self-log
                })
                log.info(f"{LogColors.OKGREEN}Stored cleaned reflection for {ai_username}.{LogColors.ENDC}")
            except Exception as e_msg:
                log.error(f"{LogColors.FAIL}Failed to store reflection message for {ai_username}: {e_msg}{LogColors.ENDC}", exc_info=True)
        elif not cleaned_reflection.strip():
            log.info(f"{LogColors.OKBLUE}Cleaned reflection for {ai_username} is empty. Skipping message creation.{LogColors.ENDC}")
    elif dry_run:
        ai_reflection = "[DRY RUN] AI would generate a reflection."
        log.info(f"{Fore.YELLOW}{ai_reflection}{Style.RESET_ALL}")
        if tables: log.info(f"{Fore.YELLOW}[DRY RUN] Would store reflection for {ai_username}.{Style.RESET_ALL}")
    else:
        log.warning(f"{LogColors.WARNING}Failed to get valid reflection from Kinos for {ai_username} in Step 3. Response: {kinos_response_step3}{LogColors.ENDC}")

    log_header(f"Autonomous Run for {ai_username} ({ai_display_name}) COMPLETED", color_code=Fore.MAGENTA if colorama_available else '')


def autonomously_run_ai_citizen_unguided(
    tables: Dict[str, Table],
    kinos_api_key: str,
    ai_citizen_record: Dict,
    dry_run: bool = False,
    kinos_model_override: Optional[str] = None,
    user_message: Optional[str] = None, # New parameter
    add_system_prompt_text: Optional[str] = None # New parameter for system prompt addition
):
    """Manages the unguided autonomous run for a single AI citizen."""
    ai_username = ai_citizen_record["fields"].get("Username")
    ai_display_name = ai_citizen_record["fields"].get("FirstName", ai_username)
    if not ai_username:
        log.warning(f"{LogColors.WARNING}AI citizen record {ai_citizen_record['id']} missing Username. Skipping.{LogColors.ENDC}")
        return

    log_header(f"Starting UNGUIDED Autonomous Run for {ai_username} ({ai_display_name})", color_code=Fore.MAGENTA if colorama_available else '')

    previous_api_results: List[Dict] = []
    iteration_count = 0
    max_iterations = 10 # Max 10 API calls per citizen per unguided run cycle

    while iteration_count < max_iterations:
        iteration_count += 1
        log.info(f"{LogColors.OKCYAN}--- Unguided Iteration {iteration_count} for {ai_username} ---{LogColors.ENDC}")

        # Fetch the comprehensive data package at the start of each iteration (or less frequently if desired)
        initial_data_package = None
        if not dry_run:
            log.info(f"{LogColors.OKBLUE}Fetching initial data package for {ai_username}...{LogColors.ENDC}")
            initial_data_package = make_api_get_request(f"/api/get-data-package?citizenUsername={ai_username}")
            if not initial_data_package or not initial_data_package.get("success"):
                log.warning(f"{LogColors.WARNING}Failed to fetch initial data package for {ai_username}. Proceeding with limited context. Error: {initial_data_package.get('error') if initial_data_package else 'No response'}{LogColors.ENDC}")
                initial_data_package = {"error": "Failed to fetch initial data package"} # Provide error structure
        else:
            log.info(f"{Fore.YELLOW}[DRY RUN] Would fetch initial data package for {ai_username}.{Style.RESET_ALL}")
            initial_data_package = {"dry_run_data": "Simulated initial data package"}
        
        # latest_activity_data_unguided = _get_latest_activity_api(ai_username) # Now part of initial_data_package
        latest_daily_update_content_unguided = _get_latest_daily_update(tables)

        prompt_intro = f"You are {ai_display_name}, a citizen of La Serenissima, navigating the complexities of 15th-century Venetian life. Your objective is to act autonomously and strategically to advance your interests. "
        
        prompt_context_elements = [
            "your intelligence briefing (`addSystem.intelligence_briefing`), which contains your personal details, recent undertakings, owned lands and buildings, and available construction sites",
            "the latest city dispatch (Daily Update, `addSystem.latest_city_dispatch`)",
            "a summary of available missives (API endpoints, `addSystem.summary_of_available_missives`)", # General API structure notes
            "the compendium of simplified read missives (`POST /api/try-read` details, `addSystem.compendium_of_simplified_reads`)", # Specifics for /api/try-read
            "the guide to decreeing undertakings (Activity Creation Reference, `addSystem.guide_to_decreeing_undertakings`)",
        ]
        if not (kinos_model_override and kinos_model_override.lower() == 'local'):
            prompt_context_elements.append("an overview of the city's records structure (Airtable schema, `addSystem.overview_of_city_records_structure`)")
        if previous_api_results:
            prompt_context_elements.append("the outcomes of your prior actions (`addSystem.outcomes_of_prior_actions`)")
        if user_message and iteration_count == 1:
            prompt_context_elements.append("a missive requiring your attention (`addSystem.user_missive`)")
            
        prompt_context_review = f"Consult your current intelligence in `addSystem` ({', '.join(prompt_context_elements)}). "

        prompt_action_guidance = (
            "Determine your course of action. Your actions may include:\n"
            "1. Dispatching couriers (GET requests) to any official channel (API endpoint) to gather further intelligence.\n"
            "2. Issuing decrees (POST requests) to any official channel (API endpoint) to enact general measures.\n"
            "3. Commanding your personal undertakings (POST requests to `/api/actions/create-activity`) to directly initiate a new endeavor. For journeys, specify your origin (`fromBuildingId`, if applicable) and destination (`toBuildingId`); the Doge's cartographers (the server) will chart the course.\n"
            "If no further measures are warranted at this time, return an empty 'actions' list. "
            "Record your overall reasoning or reflections on this period of activity in the 'reflection' field for your private annals. "
            "Respond with your directives in JSON format (with no comments, ensure it is valid): "
            "`{\"actions\": [{\"reflection\": \"Your reflections...\", \"method\": \"POST\", \"endpoint\": \"/api/activities/try-create\", \"body\": {\"citizenUsername\": \"YourUsername\", \"activityType\": \"your_chosen_activity_or_action\", \"activityParameters\": {...}}}, {\"method\": \"GET\", ...}]}`\n"
            "When initiating endeavors via `/api/activities/try-create`, the `body` should contain `citizenUsername`, `activityType` (e.g., 'rest', 'bid_on_land'), and `activityParameters` specific to that type. "
            "If you have *all* details for a specific activity record, you can use `/api/actions/create-activity` with its full payload (title, description, thought, activityDetails). "
            "The 'reflection' in your main Kinos response is for your overarching thoughts on this period."
        )
        
        current_prompt = prompt_intro + prompt_context_review
        if previous_api_results: 
             current_prompt += f"Considering the outcomes of your prior actions and your current intelligence, what is your next decree or inquiry? "
        current_prompt += prompt_action_guidance

        if add_system_prompt_text:
            current_prompt += f"\n\nIMPORTANT SYSTEM NOTE: {add_system_prompt_text}"

        add_system_data = {
            "intelligence_briefing": initial_data_package.get("data") if initial_data_package and initial_data_package.get("success") else initial_data_package,
            "summary_of_available_missives": API_DOCUMENTATION_SUMMARY, # General API notes
            "compendium_of_simplified_reads": READS_REFERENCE_EXTRACTED_TEXT, # Specifics for /api/try-read
            "guide_to_decreeing_undertakings": ACTIVITY_CREATION_REFERENCE_EXTRACTED_TEXT, 
            "current_venice_time": datetime.now(VENICE_TIMEZONE).isoformat(),
            "latest_city_dispatch": latest_daily_update_content_unguided or "No recent city dispatch available.",
            "outcomes_of_prior_actions": previous_api_results,
            "previous_kinos_response_parsing_error": None # Placeholder
        }
        if not (kinos_model_override and kinos_model_override.lower() == 'local'):
            add_system_data["overview_of_city_records_structure"] = AIRTABLE_SCHEMA_CONTENT
        if user_message and iteration_count == 1:
            add_system_data["user_missive"] = user_message
        
        # Check if the previous Kinos response had a parsing error
        # Note: This logic attempts to find a Kinos parsing error flag within the *game API response* stored from the previous turn.
        # This is likely a logical misdirection, as game API responses wouldn't typically contain Kinos's internal parsing error flags.
        # However, the fix below addresses the immediate AttributeError.
        if previous_api_results and isinstance(previous_api_results[-1], dict):
            last_action_result = previous_api_results[-1]
            # Use (last_action_result.get("response") or {}) to ensure we have a dict for the next .get()
            response_field_from_last_action = last_action_result.get("response") or {}
            
            if response_field_from_last_action.get("error_parsing_json"):
                add_system_data["previous_kinos_response_parsing_error"] = {
                    "message": response_field_from_last_action.get("error_message", "Unknown parsing error."),
                    "raw_content_snippet": response_field_from_last_action.get("reflection", "")[:200] + "..."
                }
                log.warning(f"{LogColors.WARNING}Informing Kinos about previous JSON parsing error for {ai_username} (Note: logic checks game API response).{LogColors.ENDC}")
        
        # The following 'elif' block for previous_api_results[-1] being a list is highly suspect given how
        # previous_api_results is constructed (list of dicts). It's likely dead code or based on a
        # misunderstanding of the data structure. If it were to be hit, it would need a similar safe access pattern.
        # For now, focusing on the primary 'dict' case that caused the traceback.
        elif previous_api_results and isinstance(previous_api_results[-1], list) and previous_api_results[-1]:
            log.warning(f"{LogColors.WARNING}Unexpected list structure for previous_api_results[-1]. This 'elif' block might be problematic.{LogColors.ENDC}")
            last_result_item_from_list = previous_api_results[-1][0] 
            if isinstance(last_result_item_from_list, dict):
                response_field_from_list_item = last_result_item_from_list.get("response") or {}
                if response_field_from_list_item.get("error_parsing_json"):
                    add_system_data["previous_kinos_response_parsing_error"] = {
                        "message": response_field_from_list_item.get("error_message", "Unknown parsing error."),
                        "raw_content_snippet": response_field_from_list_item.get("reflection", "")[:200] + "..."
                    }
                    log.warning(f"{LogColors.WARNING}Informing Kinos about previous JSON parsing error for {ai_username} (found in list item, logic checks game API response).{LogColors.ENDC}")


        kinos_response = None
        if not dry_run:
            kinos_response = make_kinos_call(kinos_api_key, ai_username, current_prompt, add_system_data, kinos_model_override)
        else:
            log.info(f"{Fore.YELLOW}[DRY RUN] AI {ai_username} (Unguided Iteration {iteration_count}) would be prompted.{Style.RESET_ALL}")
            if iteration_count == 1:
                 kinos_response = {"actions": [{"method": "GET", "endpoint": f"/api/citizens/{ai_username}", "params": {}}], "reflection": "[DRY RUN] Initial check of own status."}
            else:
                kinos_response = {"actions": [], "reflection": "[DRY RUN] No further actions planned."}

        if not kinos_response or not isinstance(kinos_response, dict):
            log.warning(f"{LogColors.WARNING}Failed to get a valid response from Kinos for {ai_username} in unguided mode (Iteration {iteration_count}). Ending run.{LogColors.ENDC}")
            break

        ai_reflection = kinos_response.get("reflection", "No reflection provided.")
        # Log snippet at INFO level
        log.info(f"{LogColors.OKGREEN}AI {ai_username} (Unguided Iteration {iteration_count}) Raw Reflection: {LogColors.BOLD}{ai_reflection[:200]}{'...' if len(ai_reflection) > 200 else ''}{LogColors.ENDC}")
        # Log full content at DEBUG level
        log.debug(f"{LogColors.LIGHTBLUE}AI {ai_username} (Unguided Iteration {iteration_count}) Full Raw Reflection: {ai_reflection}{LogColors.ENDC}")
        
        cleaned_reflection_unguided = ai_reflection # Default to raw
        if tables: # Ensure tables object is available
            cleaned_reflection_unguided = clean_thought_content(tables, ai_reflection)
            # Log snippet of cleaned reflection at INFO level
            log.info(f"{LogColors.OKBLUE}AI {ai_username} (Unguided Iteration {iteration_count}) Cleaned Reflection: {LogColors.BOLD}{cleaned_reflection_unguided[:200]}{'...' if len(cleaned_reflection_unguided) > 200 else ''}{LogColors.ENDC}")
            # Log full cleaned reflection at DEBUG level
            log.debug(f"{LogColors.LIGHTBLUE}AI {ai_username} (Unguided Iteration {iteration_count}) Full Cleaned Reflection: {cleaned_reflection_unguided}{LogColors.ENDC}")

        if not dry_run and tables and cleaned_reflection_unguided.strip() and cleaned_reflection_unguided.strip().lower() != "no reflection provided.":
             try:
                tables["messages"].create({
                    "Sender": ai_username, "Receiver": ai_username,
                    "Content": cleaned_reflection_unguided, # Store cleaned reflection text
                    "Type": "unguided_run_log", "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
                    "ReadAt": datetime.now(VENICE_TIMEZONE).isoformat()
                })
                log.info(f"{LogColors.OKGREEN}Stored unguided reflection for {ai_username}.{LogColors.ENDC}")
             except Exception as e_msg:
                log.error(f"{LogColors.FAIL}Failed to store unguided reflection message for {ai_username}: {e_msg}{LogColors.ENDC}", exc_info=True)
        elif not cleaned_reflection_unguided.strip():
            log.info(f"{LogColors.OKBLUE}Cleaned unguided reflection for {ai_username} is empty. Skipping message creation.{LogColors.ENDC}")
        elif cleaned_reflection_unguided.strip().lower() == "no reflection provided.":
            log.info(f"{LogColors.OKBLUE}AI {ai_username} provided 'no reflection provided.'. Skipping message creation.{LogColors.ENDC}")


        api_actions = kinos_response.get("actions")
        if not api_actions or not isinstance(api_actions, list) or len(api_actions) == 0:
            log.info(f"{LogColors.OKBLUE}AI {ai_username} provided no further actions in Iteration {iteration_count}. Ending unguided run.{LogColors.ENDC}")
            break
        
        log.info(f"{LogColors.OKBLUE}AI {ai_username} decided on {len(api_actions)} actions in Unguided Iteration {iteration_count}.{LogColors.ENDC}")
        if api_actions:
            for idx, act_log in enumerate(api_actions):
                log_method = act_log.get("method", "N/A")
                log_endpoint = act_log.get("endpoint", "N/A")
                log_body_snippet = ""
                if log_method.upper() == "POST" and act_log.get("body"):
                    body_content = act_log.get("body")
                    activity_type_log = body_content.get("activityType", "N/A") if isinstance(body_content, dict) else "N/A"
                    log_body_snippet = f" (Type: {activity_type_log})"
                log.info(f"  Action {idx+1}: {log_method} {log_endpoint}{log_body_snippet}")

        current_iteration_results = []
        for i, action in enumerate(api_actions):
            action_method = action.get("method", "").upper()
            action_endpoint = action.get("endpoint")
            action_params = action.get("params")
            action_body = action.get("body")

            if not action_endpoint:
                log.warning(f"{LogColors.WARNING}Invalid action (missing endpoint) from Kinos for {ai_username}: {action}{LogColors.ENDC}")
                current_iteration_results.append({"action_details": action, "error": "Missing endpoint", "success": False})
                continue

            log.info(f"{LogColors.OKBLUE}--- Executing Unguided Action {i+1}/{len(api_actions)} for {ai_username}: {action_method} {action_endpoint} ---{LogColors.ENDC}")
            
            action_response_data = None
            if not dry_run:
                if action_method == "GET":
                    action_response_data = make_api_get_request(action_endpoint, action_params)
                elif action_method == "POST":
                    # Check if this POST is intended for /api/activities/try-create
                    if action_endpoint == "/api/activities/try-create" and action_body and "citizenUsername" in action_body and "activityType" in action_body:
                        log.info(f"{LogColors.OKBLUE}AI chose to use /api/activities/try-create. Routing through dedicated helper.{LogColors.ENDC}")
                        # Ensure citizenUsername from body matches current AI, or log warning
                        if action_body["citizenUsername"] != ai_username:
                            log.warning(f"{LogColors.WARNING}AI {ai_username} requested try-create for {action_body['citizenUsername']}. Proceeding, but this might be unintended.{LogColors.ENDC}")
                        
                        action_response_data = call_try_create_activity_api(
                            action_body["citizenUsername"], # Use username from AI's decision
                            action_body["activityType"],
                            action_body.get("activityParameters", {}),
                            dry_run, # Will be false here
                            log 
                        )
                    elif action_endpoint == "/api/actions/create-activity" and action_body and "citizenUsername" in action_body and "activityType" in action_body:
                        log.info(f"{LogColors.OKBLUE}AI chose to use /api/actions/create-activity. Proceeding with direct POST (this is for fully detailed single activities).{LogColors.ENDC}")
                        action_response_data = make_api_post_request(action_endpoint, action_body)
                    
                    # --- Intercept direct POST to /api/contracts ---
                    elif action_endpoint == "/api/contracts":
                        log.info(f"{LogColors.OKBLUE}AI attempting POST /api/contracts. Converting to try-create activity.{LogColors.ENDC}")
                        contract_type = action_body.get("type")
                        activity_type_contracts = None
                        activity_params_contracts = {}

                        if contract_type == "public_sell":
                            activity_type_contracts = "manage_public_sell_contract"
                            activity_params_contracts = {
                                "contractId_to_create_if_new": action_body.get("contractId"), # Kinos might provide a deterministic ID
                                "resourceType": action_body.get("resourceType"),
                                "pricePerResource": action_body.get("pricePerResource"),
                                "targetAmount": action_body.get("targetAmount", 0.0), # Default to 0.0 as per some existing logic
                                "sellerBuildingId": action_body.get("sellerBuilding"),
                                "title": action_body.get("title"), # AI should provide these if not using auto-gen
                                "description": action_body.get("description"),
                                "notes": action_body.get("notes") # Pass as dict if possible, or string
                            }
                        elif contract_type == "import":
                            activity_type_contracts = "manage_import_contract"
                            activity_params_contracts = {
                                "contractId_to_create_if_new": action_body.get("contractId"),
                                "resourceType": action_body.get("resourceType"),
                                "targetAmount": action_body.get("targetAmount"),
                                "pricePerResource": action_body.get("pricePerResource"),
                                "buyerBuildingId": action_body.get("buyerBuilding"),
                                "title": action_body.get("title"),
                                "description": action_body.get("description"),
                                "notes": action_body.get("notes")
                            }
                        # Add more contract type mappings here (markup_buy, storage_query, etc.)
                        # Example for markup_buy:
                        elif contract_type == "markup_buy":
                            activity_type_contracts = "manage_markup_buy_contract"
                            activity_params_contracts = {
                                "contractId_to_create_if_new": action_body.get("contractId"),
                                "resourceType": action_body.get("resourceType"),
                                "targetAmount": action_body.get("targetAmount"),
                                "maxPricePerResource": action_body.get("pricePerResource"), # Assuming pricePerResource from Kinos is maxPrice
                                "buyerBuildingId": action_body.get("buyerBuilding"),
                                "sellerBuildingId": action_body.get("sellerBuilding"),
                                "sellerUsername": action_body.get("seller"),
                                "title": action_body.get("title"),
                                "description": action_body.get("description"),
                                "notes": action_body.get("notes")
                            }
                        # Example for land_sale_offer (bidding on land)
                        elif contract_type == "land_sale_offer":
                            activity_type_contracts = "bid_on_land"
                            activity_params_contracts = {
                                "landId": action_body.get("resourceType"), # LandId is in ResourceType for land_sale_offer
                                "bidAmount": action_body.get("pricePerResource") # Bid amount is in PricePerResource
                                # targetOfficeBuildingId is optional for bid_on_land
                            }
                        
                        if activity_type_contracts:
                            action_response_data = call_try_create_activity_api(
                                ai_username, # The AI is initiating this action for itself
                                activity_type_contracts,
                                activity_params_contracts,
                                dry_run, # Will be false here
                                log
                            )
                        else:
                            log.warning(f"{LogColors.WARNING}Unsupported contract type '{contract_type}' for POST /api/contracts by {ai_username}. Action not taken.{LogColors.ENDC}")
                            action_response_data = {"error": f"Unsupported contract type for /api/contracts: {contract_type}", "success": False}
                    
                    # --- Intercept direct POST to /api/messages/send ---
                    elif action_endpoint == "/api/messages/send":
                        log.info(f"{LogColors.OKBLUE}AI attempting POST /api/messages/send. Converting to try-create send_message activity.{LogColors.ENDC}")
                        activity_params_message = {
                            "receiverUsername": action_body.get("receiver"),
                            "content": action_body.get("content"),
                            "messageType": action_body.get("type", "message") # Default to "message"
                        }
                        # Sender for the activity is ai_username
                        action_response_data = call_try_create_activity_api(
                            ai_username,
                            "send_message",
                            activity_params_message,
                            dry_run, # Will be false here
                            log
                        )

                    # --- Intercept direct POST to /api/buildings (construction) ---
                    elif action_endpoint == "/api/buildings":
                        log.info(f"{LogColors.OKBLUE}AI attempting POST /api/buildings. Converting to try-create initiate_building_project activity.{LogColors.ENDC}")
                        # Expected body for POST /api/buildings: { type, landId, point (string "polygon-id_bp_0" or {lat,lng}), owner, runBy, ... }
                        # Activity params for initiate_building_project: { landId, buildingTypeDefinition, pointDetails: {pointId, lat, lng}, builderContractDetails (optional) }
                        
                        point_details_param = {}
                        point_from_body = action_body.get("point")
                        if isinstance(point_from_body, str): # e.g., "polygon-123_bp_0"
                            point_details_param["pointId"] = point_from_body
                            # Lat/Lng might need to be resolved by the activity creator if only pointId is given
                        elif isinstance(point_from_body, dict) and "lat" in point_from_body and "lng" in point_from_body:
                            point_details_param["lat"] = point_from_body["lat"]
                            point_details_param["lng"] = point_from_body["lng"]
                            point_details_param["pointId"] = point_from_body.get("id") # if available

                        activity_params_build = {
                            "landId": action_body.get("landId"),
                            "buildingTypeDefinition": action_body.get("type"), # 'type' from body maps to 'buildingTypeDefinition'
                            "pointDetails": point_details_param
                            # builderContractDetails can be added if AI specifies a builder and contractValue
                        }
                        # Initiator is ai_username
                        action_response_data = call_try_create_activity_api(
                            ai_username,
                            "initiate_building_project",
                            activity_params_build,
                            dry_run, # Will be false here
                            log
                        )
                    else:
                        log.warning(f"{LogColors.WARNING}AI {ai_username} attempted unhandled POST to {action_endpoint}. This action will NOT be performed. Please use /api/activities/try-create.{LogColors.ENDC}")
                        action_response_data = {"error": f"Direct POST to {action_endpoint} is not allowed for AI. Use /api/activities/try-create.", "success": False}
                else: # Method not GET or POST
                    log.warning(f"{LogColors.WARNING}Unsupported action method '{action_method}' from Kinos for {ai_username}.{LogColors.ENDC}")
                    action_response_data = {"error": f"Unsupported method: {action_method}", "success": False}
            else: # dry_run is true
                if action_endpoint == "/api/activities/try-create" and action_body and "citizenUsername" in action_body and "activityType" in action_body:
                    # Simulate call_try_create_activity_api for dry run consistency
                    action_response_data = call_try_create_activity_api(
                        action_body["citizenUsername"],
                        action_body["activityType"],
                        action_body.get("activityParameters", {}),
                        dry_run, # Will be true here
                        log
                    )
                else:
                    log.info(f"{Fore.YELLOW}[DRY RUN] Would make {action_method} request to {action_endpoint} for {ai_username}.{Style.RESET_ALL}")
                    action_response_data = {"dry_run_response": f"Simulated response from {action_method} {action_endpoint}", "success": True}
            
            # Store a summary and the full response for the AI's next context
            current_iteration_results.append({
                "method": action_method,
                "endpoint": action_endpoint,
                "params_sent": action_params, # Store what was sent
                "body_sent": action_body,     # Store what was sent
                "response": action_response_data # Store the full response
            })
        
        previous_api_results = current_iteration_results

    if iteration_count >= max_iterations:
        log.warning(f"{LogColors.WARNING}Unguided run for {ai_username} reached max iterations ({max_iterations}). Ending.{LogColors.ENDC}")

    log_header(f"Unguided Autonomous Run for {ai_username} ({ai_display_name}) COMPLETED", color_code=Fore.MAGENTA if colorama_available else '')


def process_all_ai_autonomously(
    dry_run: bool = False,
    specific_citizen_username: Optional[str] = None,
    kinos_model_override: Optional[str] = None,
    unguided_mode: bool = False,
    user_message: Optional[str] = None,
    social_classes_cli_args: Optional[List[str]] = None,
    add_system_prompt_text: Optional[str] = None # New parameter
):
    """Main function to process autonomous runs for AI citizens."""
    run_mode = "DRY RUN" if dry_run else "LIVE RUN"
    if unguided_mode:
        run_mode += " (Unguided)"
    
    log_header(f"Initializing Autonomous AI Process ({run_mode})", color_code=Fore.CYAN if colorama_available else '')

    load_airtable_schema_content()
    if unguided_mode:
        # load_api_reference_content() # No longer primary for unguided's compendium
        load_reads_reference_content() # Load the ReadsReference content
        load_activity_reference_content() 

    tables = initialize_airtable()
    kinos_api_key = get_kinos_api_key()

    if not tables or not kinos_api_key:
        log.error(f"{LogColors.FAIL}Exiting due to missing Airtable connection or Kinos API key.{LogColors.ENDC}")
        return

    if specific_citizen_username:
        # Process only the specified citizen
        log_header(f"Processing specific citizen: {specific_citizen_username}", color_code=Fore.CYAN if colorama_available else '')
        ai_citizens_to_process = get_ai_citizens_for_autonomous_run(tables, specific_citizen_username, None) # Social class args ignored for specific citizen
        if not ai_citizens_to_process:
            log.warning(f"{LogColors.WARNING}Specific citizen {specific_citizen_username} not found or not eligible. Exiting.{LogColors.ENDC}")
            return
        
        ai_citizen_record = ai_citizens_to_process[0]
        start_time_citizen = time.time()
        if unguided_mode:
            autonomously_run_ai_citizen_unguided(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message, add_system_prompt_text)
        else:
            autonomously_run_ai_citizen(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message, add_system_prompt_text)
        end_time_citizen = time.time()
        log.info(f"{LogColors.OKBLUE}Time taken for {ai_citizen_record['fields'].get('Username', 'Unknown AI')}: {end_time_citizen - start_time_citizen:.2f} seconds.{LogColors.ENDC}")
        log_header(f"Autonomous AI Process Finished for {specific_citizen_username}.", color_code=Fore.CYAN if colorama_available else '')
        # Admin notification for single run
        if not dry_run:
            try:
                admin_summary = f"Autonomous AI Run process completed for specific citizen: {specific_citizen_username}."
                tables["notifications"].create({
                    "Citizen": "ConsiglioDeiDieci", "Type": "admin_report_autonomous_run",
                    "Content": admin_summary, "Status": "unread",
                    "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
                })
                log.info(f"{LogColors.OKGREEN}Admin summary notification created.{LogColors.ENDC}")
            except Exception as e_admin_notif:
                log.error(f"{LogColors.FAIL}Failed to create admin summary notification: {e_admin_notif}{LogColors.ENDC}", exc_info=True)
        return # End after processing specific citizen

    # Infinite loop for processing all eligible citizens
    log_header("Starting INFINITE LOOP for Autonomous AI Processing (Nobili, Cittadini, Forestieri)", color_code=Fore.MAGENTA if colorama_available else '')
    main_loop_count = 0
    while True:
        main_loop_count += 1
        log_header(f"Main Loop Iteration: {main_loop_count}", color_code=Fore.CYAN if colorama_available else '')
        
        ai_citizens_to_process = get_ai_citizens_for_autonomous_run(tables, None, social_classes_cli_args)
        if not ai_citizens_to_process:
            log.warning(f"{LogColors.WARNING}No eligible AI citizens found in this iteration based on specified classes or default. Waiting before retry.{LogColors.ENDC}")
            time.sleep(60) # Wait a minute if no one is found
            continue

        random.shuffle(ai_citizens_to_process) # Randomize order of processing
        log.info(f"Processing {len(ai_citizens_to_process)} AI citizens in random order for this iteration.")

        processed_in_this_loop = 0
        loop_start_time = time.time()

        for ai_citizen_record in ai_citizens_to_process:
            start_time_citizen = time.time()
            if unguided_mode:
                autonomously_run_ai_citizen_unguided(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message, add_system_prompt_text)
            else: # Should ideally not be reached in infinite loop mode without unguided, but for safety:
                autonomously_run_ai_citizen(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message, add_system_prompt_text)
            
            end_time_citizen = time.time()
            log.info(f"{LogColors.OKBLUE}Time taken for {ai_citizen_record['fields'].get('Username', 'Unknown AI')}: {end_time_citizen - start_time_citizen:.2f} seconds.{LogColors.ENDC}")
            processed_in_this_loop += 1
            
            # Small delay between citizens within the same loop iteration
            if processed_in_this_loop < len(ai_citizens_to_process):
                log.info(f"{LogColors.OKBLUE}Pausing for 2 seconds before next AI...{LogColors.ENDC}")
                time.sleep(2)
        
        loop_end_time = time.time()
        loop_duration = loop_end_time - loop_start_time
        log_header(f"Main Loop Iteration {main_loop_count} Finished. Processed {processed_in_this_loop} AI citizen(s) in {loop_duration:.2f} seconds.", color_code=Fore.CYAN if colorama_available else '')

        # Admin Notification for the loop iteration
        if not dry_run and processed_in_this_loop > 0:
            try:
                admin_summary_loop = f"Autonomous AI Run Loop Iteration {main_loop_count} completed. Processed {processed_in_this_loop} AI citizen(s)."
                tables["notifications"].create({
                    "Citizen": "ConsiglioDeiDieci", "Type": "admin_report_autonomous_run_loop",
                    "Content": admin_summary_loop, "Status": "unread",
                    "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat()
                })
                log.info(f"{LogColors.OKGREEN}Admin summary notification for loop iteration created.{LogColors.ENDC}")
            except Exception as e_admin_notif_loop:
                log.error(f"{LogColors.FAIL}Failed to create admin summary notification for loop: {e_admin_notif_loop}{LogColors.ENDC}", exc_info=True)

        log.info(f"{LogColors.OKBLUE}Waiting for 60 seconds before starting next main loop iteration...{LogColors.ENDC}")
        time.sleep(60) # Wait before starting the next full loop
    
    # Admin notification logic for the overall process (if specific citizen was run)
    # is handled after the specific citizen processing block.
    # For the infinite loop, notifications are per-iteration.

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run autonomous decision-making cycles for AI citizens in La Serenissima.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making Kinos API calls or actual game API POST requests."
    )
    parser.add_argument(
        "--citizen",
        type=str,
        help="Process a specific AI citizen by username."
    )
    parser.add_argument(
        "--model",
        type=str,
        default="local", # Default to local model
        help="Specify a Kinos model override (e.g., 'local', 'gemini-2.5-flash-preview-05-20', 'gpt-4-turbo'). Default: local."
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Shortcut for --model local."
    )
    parser.add_argument(
        "--guided",
        action="store_true",
        help="Run in the original 3-step guided mode."
    )
    parser.add_argument(
        "--unguided",
        action="store_true",
        help="Run in unguided mode (default), where the AI makes a series of API calls in a loop."
    )
    parser.add_argument(
        "--addMessage",
        type=str,
        help="An additional message to include in the context for the AI's first Kinos call."
    )
    parser.add_argument(
        "--addSystem",
        type=str,
        help="Text to append to the end of the system prompt for Kinos calls."
    )
    # Arguments for social class filtering
    parser.add_argument("--nobili", action="store_true", help="Include Nobili class AI citizens.")
    parser.add_argument("--cittadini", action="store_true", help="Include Cittadini class AI citizens.")
    parser.add_argument("--forestieri", action="store_true", help="Include Forestieri class AI citizens.")
    parser.add_argument("--popolani", action="store_true", help="Include Popolani class AI citizens.")
    parser.add_argument("--facchini", action="store_true", help="Include Facchini class AI citizens.")
    
    args = parser.parse_args()

    kinos_model_to_use = args.model
    if args.local:
        if kinos_model_to_use and kinos_model_to_use.lower() != 'local':
            log.warning(f"{LogColors.WARNING}Both --local and --model {kinos_model_to_use} were specified. --local takes precedence, using 'local' model.{LogColors.ENDC}")
        kinos_model_to_use = 'local'
    
    
    # Determine mode: unguided is default unless --guided is specified.
    # If both --guided and --unguided are somehow passed, --guided takes precedence.
    run_unguided_mode = True
    if args.guided:
        run_unguided_mode = False
    elif args.unguided: # Explicitly asking for unguided (which is default anyway)
        run_unguided_mode = True

    # Collect specified social classes
    social_classes_from_args = []
    if args.nobili: social_classes_from_args.append('Nobili')
    if args.cittadini: social_classes_from_args.append('Cittadini')
    if args.forestieri: social_classes_from_args.append('Forestieri')
    if args.popolani: social_classes_from_args.append('Popolani')
    if args.facchini: social_classes_from_args.append('Facchini')
        
    process_all_ai_autonomously(
        dry_run=args.dry_run,
        specific_citizen_username=args.citizen,
        kinos_model_override=kinos_model_to_use,
        unguided_mode=run_unguided_mode,
        user_message=args.addMessage, # Pass the new message
        social_classes_cli_args=social_classes_from_args if social_classes_from_args else None,
        add_system_prompt_text=args.addSystem # Pass the new system prompt text
    )
