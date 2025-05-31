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

# Import colorama for log_header
try:
    from colorama import Fore, Style
    colorama_available = True
except ImportError:
    colorama_available = False
    # Define dummy Fore and Style if colorama is not available
    class Fore:
        CYAN = ''
    class Style:
        BRIGHT = ''
        RESET_ALL = ''

def log_header(message: str):
    """Prints a header message with a colorful border if colorama is available."""
    if colorama_available:
        border = "=" * 80
        print(f"\n{Fore.CYAN}{border}")
        print(f"{Fore.CYAN}{Style.BRIGHT}{message.center(80)}")
        print(f"{Fore.CYAN}{border}{Style.RESET_ALL}\n")
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
            "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
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
        # Example: Fetch AI citizens who are in Venice and not Nobili (as Nobili might have different Kinos logic)
        base_formula_parts = ["{IsAI}=1", "{InVenice}=1", "NOT({SocialClass}='Nobili')"]
        if specific_username:
            base_formula_parts.append(f"{{Username}}='{_escape_airtable_value(specific_username)}'")
            log.info(f"Fetching specific AI citizen for autonomous run: {specific_username}")
        else:
            log.info("Fetching all eligible AI citizens for autonomous run.")
        
        formula = "AND(" + ", ".join(base_formula_parts) + ")"
        citizens = tables["citizens"].all(formula=formula)
        
        if not citizens:
            log.warning(f"{LogColors.WARNING}No AI citizens found matching criteria.{LogColors.ENDC}")
        else:
            log.info(f"Found {len(citizens)} AI citizen(s) for autonomous run.")
        return citizens
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching AI citizens: {e}{LogColors.ENDC}")
        return []

# --- API Interaction Helpers ---

def make_api_get_request(endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Makes a GET request to the game API."""
    url = f"{API_BASE_URL}{endpoint}"
    try:
        log.info(f"Making GET request to: {url} with params: {params}")
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API GET request to {url} failed: {e}{LogColors.ENDC}")
        return None
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}Failed to decode JSON response from GET {url}{LogColors.ENDC}")
        return None

def make_api_post_request(endpoint: str, body: Optional[Dict] = None) -> Optional[Dict]:
    """Makes a POST request to the game API."""
    url = f"{API_BASE_URL}{endpoint}"
    try:
        log.info(f"Making POST request to: {url} with body: {body}")
        response = requests.post(url, json=body, timeout=30)
        response.raise_for_status()
        # Some POST requests might not return JSON (e.g., 204 No Content)
        if response.content:
            return response.json()
        return {"status_code": response.status_code, "success": True, "message": "POST successful, no content returned."}
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API POST request to {url} failed: {e}{LogColors.ENDC}")
        return {"success": False, "error": str(e)}
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}Failed to decode JSON response from POST {url}{LogColors.ENDC}")
        return {"success": False, "error": "JSONDecodeError"}

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
    
    payload: Dict[str, Any] = {"message": prompt}
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
        log.info(f"Using Kinos model override '{kinos_model_override}' for {ai_username}.")

    try:
        log.info(f"Sending request to Kinos for {ai_username} on channel {KINOS_CHANNEL_AUTONOMOUS_RUN}...")
        # log.debug(f"Kinos Payload (excluding addSystem if large): { {k:v for k,v in payload.items() if k != 'addSystem'} }")
        # if "addSystem" in payload: log.debug(f"Kinos addSystem keys: {add_system_data.keys() if add_system_data else 'None'}")


        response = requests.post(kinos_url, headers=headers, json=payload, timeout=120) # Increased timeout
        response.raise_for_status()

        # Fetch the latest assistant message from history
        history_response = requests.get(kinos_url, headers=headers, timeout=30)
        history_response.raise_for_status()
        messages_data = history_response.json()
        
        assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
        if not assistant_messages:
            log.warning(f"{LogColors.WARNING}No assistant messages found in Kinos history for {ai_username}.{LogColors.ENDC}")
            return None
        
        assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        latest_ai_response_content = assistant_messages[0].get("content")

        if not latest_ai_response_content:
            log.warning(f"{LogColors.WARNING}Latest Kinos assistant message for {ai_username} has no content.{LogColors.ENDC}")
            return None
        
        log.info(f"{LogColors.OKGREEN}Received Kinos response for {ai_username}. Length: {len(latest_ai_response_content)}{LogColors.ENDC}")
        # log.debug(f"Kinos raw response content for {ai_username}: {latest_ai_response_content[:500]}...")

        # Attempt to parse as JSON, otherwise return as text
        try:
            return json.loads(latest_ai_response_content)
        except json.JSONDecodeError:
            # If it's not JSON, it might be the textual reflection from step 3
            return {"reflection_text": latest_ai_response_content}

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos API request error for {ai_username}: {e}{LogColors.ENDC}")
        if hasattr(e, 'response') and e.response is not None:
            log.error(f"Kinos error response: {e.response.text[:500]}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in make_kinos_call for {ai_username}: {e}{LogColors.ENDC}")
        return None

# --- API Documentation Summary ---
# This should be a more structured and concise summary of relevant API endpoints.
# For now, we'll pass the base URL and rely on the AI's knowledge or a very specific prompt.
API_DOCUMENTATION_SUMMARY = {
    "base_url": API_BASE_URL,
    "notes": "Refer to the full API documentation for details on endpoints, parameters, and request/response formats.",
    "example_get_endpoints": [
        "/api/citizens/{username}",
        "/api/buildings?owner={username}",
        "/api/lands?owner={username}",
        "/api/resources/counts?owner={username}",
        "/api/contracts?username={username}&scope=userNonPublic", # For AI's own contracts
        "/api/contracts?resourceType={resource_id}&type=public_sell", # For market prices
        "/api/problems?citizen={username}&status=active",
        "/api/relevancies?relevantToCitizen={username}"
    ],
    "example_post_endpoints": [
        "/api/actions/construct-building", # Complex body
        "/api/contracts/create", # For creating various contract types
        "/api/messages/send"
        # Add more relevant POST endpoints AI might use
    ]
}

# --- Main Processing Logic ---

def autonomously_run_ai_citizen(
    tables: Dict[str, Table],
    kinos_api_key: str,
    ai_citizen_record: Dict,
    dry_run: bool = False,
    kinos_model_override: Optional[str] = None
):
    """Manages the 3-step autonomous run for a single AI citizen."""
    ai_username = ai_citizen_record["fields"].get("Username")
    ai_display_name = ai_citizen_record["fields"].get("FirstName", ai_username)
    if not ai_username:
        log.warning(f"AI citizen record {ai_citizen_record['id']} missing Username. Skipping.")
        return

    log.info(f"{LogColors.HEADER}--- Starting Autonomous Run for {ai_username} ({ai_display_name}) ---{LogColors.ENDC}")

    # Step 1: Gather Data
    log.info(f"{LogColors.OKCYAN}Step 1: Gather Data for {ai_username}{LogColors.ENDC}")
    prompt_step1 = (
        f"You are {ai_display_name}, an AI citizen in Serenissima. Your current goal is to understand your situation and identify opportunities. "
        f"The base API URL is {API_BASE_URL}. Review the API documentation summary provided in `addSystem.api_docs`. "
        "Decide which single GET API endpoint you want to call to gather initial data relevant to your goals (e.g., your assets, market conditions, problems). "
        "Respond with a JSON object like: `{\"endpoint\": \"/api/your/choice\", \"params\": {\"key\": \"value\"}}` or `{\"endpoint\": \"/api/your/choice\"}` if no params. "
        "Choose an endpoint that provides a good overview or addresses a potential immediate concern."
    )
    add_system_step1 = {"api_docs": API_DOCUMENTATION_SUMMARY, "current_venice_time": datetime.now(VENICE_TIMEZONE).isoformat()}
    
    kinos_response_step1 = None
    if not dry_run:
        kinos_response_step1 = make_kinos_call(kinos_api_key, ai_username, prompt_step1, add_system_step1, kinos_model_override)

    api_get_request_details = None
    if kinos_response_step1 and isinstance(kinos_response_step1, dict) and "endpoint" in kinos_response_step1:
        api_get_request_details = kinos_response_step1
        log.info(f"AI {ai_username} decided to call GET: {api_get_request_details}")
    elif dry_run:
        log.info(f"[DRY RUN] AI {ai_username} would decide on a GET API call.")
        # Simulate a common GET call for dry run
        api_get_request_details = {"endpoint": f"/api/citizens/{ai_username}"}
    else:
        log.warning(f"Failed to get valid GET API decision from Kinos for {ai_username}. Response: {kinos_response_step1}")
        return # End process for this AI if step 1 fails

    api_get_response_data = None
    if api_get_request_details:
        endpoint = api_get_request_details["endpoint"]
        params = api_get_request_details.get("params")
        if not dry_run:
            api_get_response_data = make_api_get_request(endpoint, params)
            if api_get_response_data:
                log.info(f"Successfully received data from GET {endpoint} for {ai_username}.")
                # log.debug(f"GET Response data for {ai_username}: {json.dumps(api_get_response_data, indent=2)[:1000]}...") # Log snippet
            else:
                log.warning(f"Failed to get data from GET {endpoint} for {ai_username}.")
                # Potentially end here or allow AI to react to the failure in step 2
        else:
            log.info(f"[DRY RUN] Would make GET request to {endpoint} with params {params} for {ai_username}.")
            api_get_response_data = {"dry_run_data": f"Simulated response from GET {endpoint}"}


    # Step 2: Elaborate Strategy & Define Actions
    log.info(f"{LogColors.OKCYAN}Step 2: Elaborate Strategy & Define Actions for {ai_username}{LogColors.ENDC}")
    prompt_step2 = (
        f"You are {ai_display_name}. You previously requested data via GET API. "
        f"The response was (or simulated response if previous step failed/dry_run): \n```json\n{json.dumps(api_get_response_data, indent=2)}\n```\n"
        "Based on this data, your overall goals, and the API documentation in `addSystem.api_docs`, define your strategy and the next actions. "
        "Respond with a JSON object: `{\"strategy_summary\": \"Your brief strategy...\", \"actions\": [{\"method\": \"POST\", \"endpoint\": \"/api/your/action\", \"body\": {...}}, ...]}`. "
        "If no actions are needed now, return `{\"strategy_summary\": \"Observation...\", \"actions\": []}`."
    )
    add_system_step2 = {"api_docs": API_DOCUMENTATION_SUMMARY, "previous_get_response": api_get_response_data}

    kinos_response_step2 = None
    if not dry_run:
        kinos_response_step2 = make_kinos_call(kinos_api_key, ai_username, prompt_step2, add_system_step2, kinos_model_override)

    api_post_actions = []
    strategy_summary = "No strategy formulated."
    if kinos_response_step2 and isinstance(kinos_response_step2, dict):
        strategy_summary = kinos_response_step2.get("strategy_summary", strategy_summary)
        if "actions" in kinos_response_step2 and isinstance(kinos_response_step2["actions"], list):
            api_post_actions = kinos_response_step2["actions"]
            log.info(f"AI {ai_username} strategy: {strategy_summary}")
            log.info(f"AI {ai_username} decided on {len(api_post_actions)} POST actions.")
        else:
            log.warning(f"AI {ai_username} response for Step 2 did not contain a valid 'actions' list. Strategy: {strategy_summary}")
    elif dry_run:
        strategy_summary = "[DRY RUN] AI would formulate a strategy."
        log.info(strategy_summary)
        log.info(f"[DRY RUN] AI {ai_username} would decide on POST API calls.")
        # Simulate a common POST call for dry run
        # api_post_actions = [{"method": "POST", "endpoint": "/api/messages/send", "body": {"sender": ai_username, "receiver": "ConsiglioDeiDieci", "content": "Reporting for duty."}}]
    else:
        log.warning(f"Failed to get valid strategy/actions from Kinos for {ai_username} in Step 2. Response: {kinos_response_step2}")
        # Continue to step 3 with no actions taken

    api_post_responses_summary = []
    if api_post_actions:
        for i, action in enumerate(api_post_actions):
            if isinstance(action, dict) and action.get("method") == "POST" and "endpoint" in action:
                endpoint = action["endpoint"]
                body = action.get("body")
                log.info(f"Executing POST action {i+1}/{len(api_post_actions)} for {ai_username}: {endpoint}")
                
                post_response = None
                if not dry_run:
                    post_response = make_api_post_request(endpoint, body)
                    if post_response and post_response.get("success"):
                        log.info(f"POST to {endpoint} for {ai_username} successful.")
                    else:
                        log.warning(f"POST to {endpoint} for {ai_username} failed or had no success flag. Response: {post_response}")
                else:
                    log.info(f"[DRY RUN] Would make POST request to {endpoint} with body {body} for {ai_username}.")
                    post_response = {"dry_run_post_response": f"Simulated response from POST {endpoint}", "success": True}
                
                api_post_responses_summary.append({
                    "action_endpoint": endpoint,
                    "action_body": body, # Be mindful of logging sensitive data from body if any
                    "response": post_response
                })
            else:
                log.warning(f"Invalid action format from Kinos for {ai_username}: {action}")
                api_post_responses_summary.append({"error": "Invalid action format", "action_details": action})
    else:
        log.info(f"No POST actions defined by {ai_username} in Step 2.")

    # Step 3: Note Results & Plan Next Steps
    log.info(f"{LogColors.OKCYAN}Step 3: Note Results & Plan Next Steps for {ai_username}{LogColors.ENDC}")
    prompt_step3 = (
        f"You are {ai_display_name}. Your strategy was: '{strategy_summary}'. "
        f"Your POST actions resulted in (or simulated results if dry_run/failed): \n```json\n{json.dumps(api_post_responses_summary, indent=2)}\n```\n"
        "Reflect on these outcomes. What did you learn? What are your key observations or plans for your next autonomous run? "
        "Respond with a concise text summary (max 3-4 sentences)."
    )
    add_system_step3 = {"api_docs": API_DOCUMENTATION_SUMMARY, "post_actions_summary": api_post_responses_summary}

    kinos_response_step3 = None
    if not dry_run:
        kinos_response_step3 = make_kinos_call(kinos_api_key, ai_username, prompt_step3, add_system_step3, kinos_model_override)

    ai_reflection = "No reflection generated."
    if kinos_response_step3 and isinstance(kinos_response_step3, dict) and "reflection_text" in kinos_response_step3:
        ai_reflection = kinos_response_step3["reflection_text"]
        log.info(f"AI {ai_username} reflection: {ai_reflection}")
        # Store reflection as a message to self
        if not dry_run and tables:
            try:
                tables["messages"].create({
                    "Sender": ai_username,
                    "Receiver": ai_username,
                    "Content": f"Autonomous Run Reflection:\nStrategy: {strategy_summary}\nReflection: {ai_reflection}",
                    "Type": "autonomous_run_log",
                    "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
                    "ReadAt": datetime.now(VENICE_TIMEZONE).isoformat()
                })
                log.info(f"Stored reflection for {ai_username}.")
            except Exception as e_msg:
                log.error(f"Failed to store reflection message for {ai_username}: {e_msg}")
    elif dry_run:
        ai_reflection = "[DRY RUN] AI would generate a reflection."
        log.info(ai_reflection)
        if tables: log.info(f"[DRY RUN] Would store reflection for {ai_username}.")
    else:
        log.warning(f"Failed to get valid reflection from Kinos for {ai_username} in Step 3. Response: {kinos_response_step3}")

    log.info(f"{LogColors.HEADER}--- Autonomous Run for {ai_username} ({ai_display_name}) COMPLETED ---{LogColors.ENDC}\n")


def process_all_ai_autonomously(
    dry_run: bool = False,
    specific_citizen_username: Optional[str] = None,
    kinos_model_override: Optional[str] = None
):
    """Main function to process autonomous runs for AI citizens."""
    log_header(f"Starting Autonomous AI Run Process (dry_run={dry_run}, citizen={specific_citizen_username or 'all'})")

    tables = initialize_airtable()
    kinos_api_key = get_kinos_api_key()

    if not tables or not kinos_api_key:
        log.error(f"{LogColors.FAIL}Exiting due to missing Airtable connection or Kinos API key.{LogColors.ENDC}")
        return

    ai_citizens_to_process = get_ai_citizens_for_autonomous_run(tables, specific_citizen_username)
    if not ai_citizens_to_process:
        return # Message already logged

    processed_count = 0
    for ai_citizen_record in ai_citizens_to_process:
        autonomously_run_ai_citizen(tables, kinos_api_key, ai_citizen_record, dry_run, kinos_model_override)
        processed_count += 1
        if specific_citizen_username: # If processing a specific citizen, break after one.
            break
        time.sleep(2) # Small delay between processing AIs to avoid overwhelming Kinos/API

    log_header(f"Autonomous AI Run Process Finished. Processed {processed_count} AI citizen(s).")
    
    # Admin Notification
    if not dry_run and tables and processed_count > 0:
        try:
            admin_summary = f"Autonomous AI Run process completed. Processed {processed_count} AI citizen(s)."
            if specific_citizen_username:
                admin_summary += f" (Specifically processed: {specific_citizen_username})"
            
            tables["notifications"].create({
                "Citizen": "ConsiglioDeiDieci",
                "Type": "admin_report_autonomous_run",
                "Content": admin_summary,
                "Status": "unread",
                "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat() + "Z"
            })
            log.info("Admin summary notification created for Autonomous Run.")
        except Exception as e_admin_notif:
            log.error(f"Failed to create admin summary notification: {e_admin_notif}")


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
        help="Specify a Kinos model override (e.g., 'local', 'gpt-4-turbo')."
    )
    args = parser.parse_args()

    process_all_ai_autonomously(
        dry_run=args.dry_run,
        specific_citizen_username=args.citizen,
        kinos_model_override=args.model
    )
