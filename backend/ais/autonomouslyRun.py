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
import time
from datetime import datetime
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import shared utilities if available, e.g., for VENICE_TIMEZONE
try:
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, _escape_airtable_value
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

    # Actions (POST)
    "POST /api/actions/create-activity - Create an activity for yourself. Body: {citizenUsername, activityType, title, description, thought, activityDetails}",
    "POST /api/contracts - Create or update a contract. Body: {contractId, type, resourceType, pricePerResource, targetAmount, seller, sellerBuilding, buyer, buyerBuilding, status, notes, endAt, asset, assetType}",
    "POST /api/messages/send - Send a message to another citizen. Body: {sender, receiver, content, type}",
    "POST /api/actions/construct-building - Initiate construction of a building. Body: {buildingTypeDefinition, pointDetails, citizenUsername, builderContractDetails (optional)}",
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

def log_header(message: str, color_code: str = Fore.CYAN):
    """Prints a header message with a colorful border if colorama is available."""
    if colorama_available:
        border_char = "═"
        side_char = "║"
        corner_tl = "╔"
        corner_tr = "╗"
        corner_bl = "╚"
        corner_br = "╝"
        
        message_len = len(message)
        # Adjust width dynamically or keep fixed, for now fixed at 80
        width = 80 
        
        print(f"\n{color_code}{Style.BRIGHT}{corner_tl}{border_char * (width - 2)}{corner_tr}")
        print(f"{color_code}{Style.BRIGHT}{side_char} {message.center(width - 4)} {side_char}")
        print(f"{color_code}{Style.BRIGHT}{corner_bl}{border_char * (width - 2)}{corner_br}{Style.RESET_ALL}\n")
    else:
        border = "=" * (len(message) + 4)
        print(f"\n{border}")
        print(f"  {message}  ")
        print(f"{border}\n")

# --- Airtable and API Key Initialization ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initializes connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Airtable credentials not found.{LogColors.ENDC}")
        return None
    try:
        api = Api(airtable_api_key)
        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "messages": api.table(airtable_base_id, "MESSAGES"), # For logging AI reflections
            "notifications": api.table(airtable_base_id, "NOTIFICATIONS"), # For admin notifications
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}", exc_info=True)
        return None

def get_kinos_api_key() -> Optional[str]:
    """Retrieves the Kinos API key from environment variables."""
    api_key = os.getenv(KINOS_API_KEY_ENV_VAR)
    if not api_key:
        log.error(f"{LogColors.FAIL}Kinos API key ({KINOS_API_KEY_ENV_VAR}) not found.{LogColors.ENDC}")
    return api_key

# --- AI Citizen Fetching ---

def get_ai_citizens_for_autonomous_run(tables: Dict[str, Table], specific_username: Optional[str] = None) -> List[Dict]:
    """Fetches AI citizens eligible for autonomous run."""
    try:
        base_formula_parts = ["{IsAI}=1", "{InVenice}=1"]
        if specific_username:
            base_formula_parts.append(f"{{Username}}='{_escape_airtable_value(specific_username)}'")
            log.info(f"{LogColors.OKBLUE}Fetching specific AI citizen for autonomous run: {specific_username}{LogColors.ENDC}")
        else:
            # Default to Nobili, Cittadini, Forestieri if no specific citizen is requested
            social_class_filter = "OR({SocialClass}='Nobili', {SocialClass}='Cittadini', {SocialClass}='Forestieri')"
            base_formula_parts.append(social_class_filter)
            log.info(f"{LogColors.OKBLUE}Fetching all eligible AI citizens (Nobili, Cittadini, Forestieri) for autonomous run.{LogColors.ENDC}")
        
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

DEFAULT_TIMEOUT_GET = 30  # seconds
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
            log.info(f"{LogColors.OKGREEN}API GET request to {url} successful.{LogColors.ENDC}")
            log.debug(f"{LogColors.PINK}Response from GET {url}: {json.dumps(response_json, indent=2)[:500]}...{LogColors.ENDC}")
            return response_json
        except requests.exceptions.RequestException as e:
            last_exception = e
            log.warning(f"{LogColors.WARNING}API GET request to {url} failed on attempt {attempt + 1}: {e}{LogColors.ENDC}")
            if attempt < MAX_RETRIES:
                log.info(f"Retrying in {RETRY_DELAY_SECONDS} seconds...")
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
        params = {
            "citizenId": citizen_username,
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
    log_body_snippet = json.dumps(body, indent=2)[:200] + "..." if body else "None"
    last_exception = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            log.info(f"{LogColors.OKBLUE}Making API POST request to: {LogColors.BOLD}{url}{LogColors.ENDC}{LogColors.OKBLUE} with body: {log_body_snippet} (Attempt {attempt + 1}/{MAX_RETRIES + 1}){LogColors.ENDC}")
            response = requests.post(url, json=body, timeout=DEFAULT_TIMEOUT_POST)
            response.raise_for_status()
            
            if response.content:
                response_json = response.json()
                log.info(f"{LogColors.OKGREEN}API POST request to {url} successful.{LogColors.ENDC}")
                log.debug(f"{LogColors.PINK}Response from POST {url}: {json.dumps(response_json, indent=2)[:500]}...{LogColors.ENDC}")
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
    kinos_url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT_ID}/kins/{ai_username}/channels/{KINOS_CHANNEL_AUTONOMOUS_RUN}/messages"
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
        log.info(f"{LogColors.OKBLUE}Sending request to Kinos for {LogColors.BOLD}{ai_username}{LogColors.ENDC}{LogColors.OKBLUE} on channel {KINOS_CHANNEL_AUTONOMOUS_RUN}...{LogColors.ENDC}")
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
        
        log.info(f"{LogColors.OKGREEN}Received Kinos response for {ai_username}. Length: {len(latest_ai_response_content)}{LogColors.ENDC}")
        log.debug(f"{LogColors.LIGHTBLUE}Kinos raw response content for {ai_username}: {latest_ai_response_content[:500]}...{LogColors.ENDC}")

        # Attempt to parse as JSON, otherwise return as text
        try:
            parsed_response = json.loads(latest_ai_response_content)
            log.debug(f"{LogColors.LIGHTBLUE}Kinos parsed JSON response for {ai_username}: {json.dumps(parsed_response, indent=2)[:500]}...{LogColors.ENDC}")
            return parsed_response
        except json.JSONDecodeError:
            log.warning(f"{LogColors.WARNING}Kinos response for {ai_username} is not direct JSON. Full response: {LogColors.LIGHTBLUE}{latest_ai_response_content}{LogColors.ENDC}")
            # Attempt to extract JSON from markdown-like code blocks
            import re
            json_match = re.search(r"```json\s*([\s\S]*?)\s*```", latest_ai_response_content, re.MULTILINE)
            if json_match:
                json_str = json_match.group(1)
                try:
                    parsed_json_from_text = json.loads(json_str)
                    log.info(f"{LogColors.OKGREEN}Successfully extracted and parsed JSON from Kinos text response for {ai_username}.{LogColors.ENDC}")
                    log.debug(f"{LogColors.LIGHTBLUE}Extracted JSON: {json.dumps(parsed_json_from_text, indent=2)[:500]}...{LogColors.ENDC}")
                    return parsed_json_from_text
                except json.JSONDecodeError as e_inner:
                    log.warning(f"{LogColors.WARNING}Failed to parse extracted JSON from Kinos response for {ai_username}. Error: {e_inner}. Extracted string: {json_str[:200]}...{LogColors.ENDC}")
            
            # If not direct JSON and no extractable JSON found, treat as reflection text
            log.info(f"{LogColors.OKBLUE}Treating Kinos response for {ai_username} as reflection text.{LogColors.ENDC}")
            return {"reflection_text": latest_ai_response_content}

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos API request error for {ai_username}: {e}{LogColors.ENDC}", exc_info=True)
        if hasattr(e, 'response') and e.response is not None:
            log.error(f"{LogColors.FAIL}Kinos error response content: {e.response.text[:500]}{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in make_kinos_call for {ai_username}: {e}{LogColors.ENDC}", exc_info=True)
        return None

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
    return cleaned_content

# Global variable to store Airtable schema content
AIRTABLE_SCHEMA_CONTENT = ""

# Global variable to store API Reference content (raw and extracted)
RAW_API_REFERENCE_CONTENT = ""
API_REFERENCE_EXTRACTED_TEXT = ""

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
        "1.  **Dynamic GET Filtering**: For most GET endpoints that return lists (e.g., /api/buildings, /api/citizens, /api/contracts, /api/resources, /api/lands, /api/problems, /api/relevancies, /api/loans, /api/guilds, /api/decrees, /api/activities, /api/transactions/history), you can filter results by providing Airtable field names as query parameters. For example, to get buildings owned by 'NLR' of category 'business', use: `/api/buildings?Owner=NLR&Category=business`. The server is flexible with query key casing (e.g., `Owner` or `owner`), but Airtable fields are PascalCase (see `backend/docs/airtable_schema.md`).\n"
        "2.  **POST/PATCH Request Body Keys**: When sending JSON data in POST or PATCH requests (e.g., creating a building, sending a message), use `camelCase` for keys in the request body (e.g., `{\"landId\": \"polygon-123\", \"buildingType\": \"house\"}`). The server will convert these to `PascalCase` for Airtable.\n"
        "3.  **Airtable Schema**: Refer to `backend/docs/airtable_schema.md` for exact Airtable table and field names (they are PascalCase).\n"
        "4.  **Specific Endpoints**: Some endpoints have fixed parameters or unique behaviors (e.g., /api/resources/counts, /api/thoughts, /api/messages?type=...). If dynamic filtering doesn't yield expected results, consult their specific documentation or use their defined parameters.\n"
        "5.  **Focus**: Your goal is to make informed decisions. Choose API calls that provide the most relevant data for your current objectives.\n"
        "6.  **Airtable Schema**: A summary of the Airtable schema (field names, types) may be available in `addSystem.airtable_schema_summary` (typically for non-local models) to help you understand data structures and construct precise filters for GET requests.\n"
        "7.  **Latest Activity**: Your most recent or current activity details are available in `addSystem.latest_activity`."
    ),
    "example_get_endpoints": [
        "/api/citizens/{username}", # Specific citizen by username
        "/api/citizens?SocialClass=Popolani&IsAI=true", # Filtered list of AI Popolani citizens
        "/api/buildings?Owner={YourUsername}&Category=business", # Your business buildings
        "/api/buildings?Type=market_stall&IsConstructed=true", # All constructed market stalls
        "/api/lands?Owner={YourUsername}&District=San Polo", # Your lands in San Polo
        "/api/resources/counts?owner={YourUsername}", # Your resource counts (specific endpoint)
        "/api/contracts?Seller={YourUsername}&Type=public_sell&Status=active", # Your active public sell contracts
        "/api/contracts?ResourceType=wood&Type=public_sell&Status=active", # Active public sell contracts for wood
        "/api/problems?Citizen={YourUsername}&Status=active", # Your active problems
        "/api/relevancies?RelevantToCitizen={YourUsername}&Category=opportunity&Score=>50" # High-score opportunities for you
    ],
    "example_post_endpoints": [
        "/api/actions/construct-building", # Body keys can be camelCase, server will adapt.
        "/api/actions/create-activity", # Body keys: citizenUsername, activityType, title, description, thought, activityDetails, notes (optional)
        "/api/contracts", # Body keys like {"contractId": "...", "type": "..."}
        "/api/messages/send" # Body keys like {"sender": "...", "receiver": "...", "content": "..."}
    ]
}

# --- Main Processing Logic ---

def autonomously_run_ai_citizen(
    tables: Dict[str, Table],
    kinos_api_key: str,
    ai_citizen_record: Dict,
    dry_run: bool = False,
    kinos_model_override: Optional[str] = None,
    user_message: Optional[str] = None # New parameter
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

    prompt_step1_context_elements_guided = [
        "your own citizen data (`addSystem.citizen_data`)",
        "the list of key API endpoints (`addSystem.concise_api_endpoints`)",
        "a list of Airtable fields (`addSystem.airtable_schema_fields`)",
        "your latest activity (`addSystem.latest_activity`)"
    ]
    if user_message:
        prompt_step1_context_elements_guided.append(f"an additional message ('{user_message}')")

    prompt_step1_context_mention_guided = f"Review {', '.join(prompt_step1_context_elements_guided[:-1])}{' and ' if len(prompt_step1_context_elements_guided) > 1 else ''}{prompt_step1_context_elements_guided[-1]}."

    prompt_step1_base = (
        f"You are {ai_display_name}, an AI citizen in La Serenissima. Your current goal is to understand your situation and identify opportunities. "
        f"The base API URL is {API_BASE_URL}. {prompt_step1_context_mention_guided} "
    )
    
    prompt_step1 = prompt_step1_base + (
        "Decide which single GET API endpoint you want to call to gather initial data relevant to your goals (e.g., your assets, market conditions, problems). "
        "For query parameters, you can use camelCase (e.g., `owner`, `resourceType`). "
        "Respond with a JSON object like: `{\"endpoint\": \"/api/your/choice\", \"params\": {\"paramName\": \"value\"}}` or `{\"endpoint\": \"/api/your/choice\"}` if no params. "
        "Choose an endpoint that provides a good overview or addresses a potential immediate concern."
    )
    add_system_step1 = {
        "concise_api_endpoints": CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE,
        "airtable_schema_fields": CONCISE_AIRTABLE_SCHEMA_FIELD_LIST,
        "current_venice_time": datetime.now(VENICE_TIMEZONE).isoformat(),
        "citizen_data": ai_citizen_record["fields"],
        "latest_activity": latest_activity_data or {}
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
    prompt_step2_context_mention_guided = "Based on this data, your citizen data (`addSystem.citizen_data`), your overall goals, the list of key API endpoints (`addSystem.concise_api_endpoints`), and the Airtable field list (`addSystem.airtable_schema_fields`),"
        
    prompt_step2 = (
        f"You are {ai_display_name}. Your citizen data is in `addSystem.citizen_data`. You previously requested data via GET API. "
        f"The response was (or simulated/error response if previous step failed/dry_run): \n```json\n{json.dumps(api_get_response_data, indent=2)}\n```\n"
        f"{prompt_step2_context_mention_guided} define your strategy and the next actions. "
        "When specifying the `body` for POST requests, you can use camelCase for keys (e.g., `sender`, `resourceType`, `targetAmount`). The server will map them to the correct Airtable fields. "
        "Respond with a JSON object: `{\"strategy_summary\": \"Your brief strategy...\", \"actions\": [{\"method\": \"POST\", \"endpoint\": \"/api/your/action\", \"body\": {\"fieldName\": \"value\"}}, ...]}`. "
        "If no actions are needed now, return `{\"strategy_summary\": \"Observation...\", \"actions\": []}`."
    )
    add_system_step2 = {
        "concise_api_endpoints": CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE,
        "airtable_schema_fields": CONCISE_AIRTABLE_SCHEMA_FIELD_LIST,
        "previous_get_response": api_get_response_data,
        "citizen_data": ai_citizen_record["fields"],
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
    prompt_step3_context_mention_guided = "Reflect on these outcomes, considering your citizen data (`addSystem.citizen_data`), the list of key API endpoints (`addSystem.concise_api_endpoints`), and the Airtable field list (`addSystem.airtable_schema_fields`) (all in `addSystem`)"

    prompt_step3 = (
        f"You are {ai_display_name}. Your citizen data is in `addSystem.citizen_data`. Your strategy was: '{strategy_summary}'. "
        f"Your POST actions resulted in (or simulated results if dry_run/failed): \n```json\n{json.dumps(api_post_responses_summary, indent=2)}\n```\n"
        f"{prompt_step3_context_mention_guided}. What did you learn? What are your key observations or plans for your next autonomous run? "
        "Respond with a concise text summary (max 3-4 sentences)."
    )
    add_system_step3 = {
        "concise_api_endpoints": CONCISE_API_ENDPOINT_LIST_FOR_GUIDED_MODE,
        "airtable_schema_fields": CONCISE_AIRTABLE_SCHEMA_FIELD_LIST,
        "post_actions_summary": api_post_responses_summary,
        "citizen_data": ai_citizen_record["fields"],
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
        if not dry_run and tables:
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
    user_message: Optional[str] = None # New parameter
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
    max_iterations = 5 # Max 5 API calls per citizen per unguided run cycle

    while iteration_count < max_iterations:
        iteration_count += 1
        log.info(f"{LogColors.OKCYAN}--- Unguided Iteration {iteration_count} for {ai_username} ---{LogColors.ENDC}")

        latest_activity_data_unguided = _get_latest_activity_api(ai_username)

        prompt_intro = f"You are {ai_display_name}, an AI citizen in La Serenissima. Your goal is to act autonomously and strategically. "
        
        prompt_context_elements = [
            "citizen data (`addSystem.citizen_data`)", 
            "API docs summary (`addSystem.api_docs_summary`)", 
            "extracted API Reference text (`addSystem.api_reference_extracted_text`)",
            "your latest activity (`addSystem.latest_activity`)"
        ]
        if not (kinos_model_override and kinos_model_override.lower() == 'local'):
            prompt_context_elements.append("Airtable schema (`addSystem.airtable_schema_summary`)")
        if previous_api_results:
            prompt_context_elements.append("previous API results (`addSystem.previous_api_results`)")
        if user_message and iteration_count == 1:
            prompt_context_elements.append("the user_provided_message (`addSystem.user_provided_message`)")
            
        prompt_context_review = f"Review your current context in `addSystem` ({', '.join(prompt_context_elements)}). "

        prompt_action_guidance = (
            "Decide on a sequence of actions. Actions can be:\n"
            "1. Generic GET requests to any API endpoint to gather information.\n"
            "2. Generic POST requests to any API endpoint to perform general actions.\n"
            "3. Specific POST requests to `/api/actions/create-activity` to directly create a new activity for yourself. For travel activities, provide `fromBuildingId` (if applicable) and `toBuildingId`; the server will handle pathfinding.\n"
            "If no further actions are needed now, respond with an empty 'actions' list. "
            "Provide your overall reasoning or reflection on this iteration in the 'reflection' field. "
            "Respond with a JSON object: "
            "`{\"actions\": [{\"method\": \"GET/POST\", \"endpoint\": \"/api/...\", \"params\": {...}, \"body\": {...}}, ...], \"reflection\": \"Your overall thoughts on this iteration...\"}`\n"
            "For `/api/actions/create-activity`, the 'body' of your action should be the payload for that endpoint, including `citizenUsername`, `activityType`, `title`, `description`, `thought` (first-person narrative for the activity), and `activityDetails` (without `pathData` for travel). The 'reflection' field in the main Kinos response is for your overall iteration reflection, while the 'thought' field within the create-activity body is specific to that activity."
        )
        
        current_prompt = prompt_intro + prompt_context_review
        if previous_api_results: # This condition is now part of prompt_context_elements
             current_prompt += f"Based on the previous results and your overall context, what do you want to do next? "
        current_prompt += prompt_action_guidance


        add_system_data = {
            "api_docs_summary": API_DOCUMENTATION_SUMMARY,
            "api_reference_extracted_text": API_REFERENCE_EXTRACTED_TEXT, 
            "current_venice_time": datetime.now(VENICE_TIMEZONE).isoformat(),
            "citizen_data": ai_citizen_record["fields"],
            "latest_activity": latest_activity_data_unguided or {}, # Add latest activity
            "previous_api_results": previous_api_results
        }
        if not (kinos_model_override and kinos_model_override.lower() == 'local'):
            add_system_data["airtable_schema_summary"] = AIRTABLE_SCHEMA_CONTENT
        if user_message and iteration_count == 1:
            add_system_data["user_provided_message"] = user_message

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
        log.info(f"{LogColors.OKGREEN}AI {ai_username} (Unguided Iteration {iteration_count}) Raw Reflection: {LogColors.BOLD}{ai_reflection}{LogColors.ENDC}")
        
        cleaned_reflection_unguided = ai_reflection # Default to raw
        if tables: # Ensure tables object is available
            cleaned_reflection_unguided = clean_thought_content(tables, ai_reflection)
            log.info(f"{LogColors.OKBLUE}AI {ai_username} (Unguided Iteration {iteration_count}) Cleaned Reflection: {LogColors.BOLD}{cleaned_reflection_unguided}{LogColors.ENDC}")

        if not dry_run and tables:
             try:
                tables["messages"].create({
                    "Sender": ai_username, "Receiver": ai_username,
                    "Content": cleaned_reflection_unguided, # Store cleaned reflection text
                    "Type": "unguided_run_log", "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
                    "ReadAt": datetime.now(VENICE_TIMEZONE).isoformat()
                })
             except Exception as e_msg:
                log.error(f"{LogColors.FAIL}Failed to store unguided reflection message for {ai_username}: {e_msg}{LogColors.ENDC}", exc_info=True)

        api_actions = kinos_response.get("actions")
        if not api_actions or not isinstance(api_actions, list) or len(api_actions) == 0:
            log.info(f"{LogColors.OKBLUE}AI {ai_username} provided no further actions in Iteration {iteration_count}. Ending unguided run.{LogColors.ENDC}")
            break
        
        log.info(f"{LogColors.OKBLUE}AI {ai_username} decided on {len(api_actions)} actions in Unguided Iteration {iteration_count}.{LogColors.ENDC}")

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
                    action_response_data = make_api_post_request(action_endpoint, action_body)
                else:
                    log.warning(f"{LogColors.WARNING}Unsupported action method '{action_method}' from Kinos for {ai_username}.{LogColors.ENDC}")
                    action_response_data = {"error": f"Unsupported method: {action_method}", "success": False}
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
    user_message: Optional[str] = None
):
    """Main function to process autonomous runs for AI citizens."""
    run_mode = "DRY RUN" if dry_run else "LIVE RUN"
    if unguided_mode:
        run_mode += " (Unguided)"
    
    log_header(f"Initializing Autonomous AI Process ({run_mode})", color_code=Fore.CYAN if colorama_available else '')

    load_airtable_schema_content()
    if unguided_mode:
        load_api_reference_content()

    tables = initialize_airtable()
    kinos_api_key = get_kinos_api_key()

    if not tables or not kinos_api_key:
        log.error(f"{LogColors.FAIL}Exiting due to missing Airtable connection or Kinos API key.{LogColors.ENDC}")
        return

    if specific_citizen_username:
        # Process only the specified citizen
        log_header(f"Processing specific citizen: {specific_citizen_username}", color_code=Fore.CYAN if colorama_available else '')
        ai_citizens_to_process = get_ai_citizens_for_autonomous_run(tables, specific_citizen_username)
        if not ai_citizens_to_process:
            log.warning(f"{LogColors.WARNING}Specific citizen {specific_citizen_username} not found or not eligible. Exiting.{LogColors.ENDC}")
            return
        
        ai_citizen_record = ai_citizens_to_process[0]
        start_time_citizen = time.time()
        if unguided_mode:
            autonomously_run_ai_citizen_unguided(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message)
        else:
            autonomously_run_ai_citizen(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message)
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
        
        ai_citizens_to_process = get_ai_citizens_for_autonomous_run(tables, None) # Gets Nobili, Cittadini, Forestieri
        if not ai_citizens_to_process:
            log.warning(f"{LogColors.WARNING}No eligible AI citizens found in this iteration. Waiting before retry.{LogColors.ENDC}")
            time.sleep(60) # Wait a minute if no one is found
            continue

        random.shuffle(ai_citizens_to_process) # Randomize order of processing
        log.info(f"Processing {len(ai_citizens_to_process)} AI citizens in random order for this iteration.")

        processed_in_this_loop = 0
        loop_start_time = time.time()

        for ai_citizen_record in ai_citizens_to_process:
            start_time_citizen = time.time()
            if unguided_mode:
                autonomously_run_ai_citizen_unguided(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message)
            else: # Should ideally not be reached in infinite loop mode without unguided, but for safety:
                autonomously_run_ai_citizen(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override, user_message)
            
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
    
    # This part is now unreachable due to the infinite loop if no specific citizen is provided.
    # The admin notification logic has been moved inside the specific citizen processing block
    # and inside the main loop for iterative processing.


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run autonomous decision-making cycles for AI citizens.")
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
        
    process_all_ai_autonomously(
        dry_run=args.dry_run,
        specific_citizen_username=args.citizen,
        kinos_model_override=kinos_model_to_use,
        unguided_mode=run_unguided_mode,
        user_message=args.addMessage # Pass the new message
    )
