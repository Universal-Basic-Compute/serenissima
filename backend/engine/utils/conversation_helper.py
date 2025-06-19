import os
import sys
import json
import logging
import time
import re
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple, Union

import requests
from pyairtable import Table
from dotenv import load_dotenv

# Add project root to sys.path if this script is run directly or for broader imports
PROJECT_ROOT_CONV_HELPER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if PROJECT_ROOT_CONV_HELPER not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_CONV_HELPER)

try:
    from backend.engine.utils.activity_helpers import (
        LogColors, _escape_airtable_value, VENICE_TIMEZONE, get_citizen_record,
        get_relationship_trust_score, # Re-using this, though it only returns score. We need full record.
        clean_thought_content # Added import for clean_thought_content
    )
    from backend.engine.utils.relationship_helpers import update_trust_score_for_activity # Added import
    from backend.engine.utils.mood_helper import get_citizen_mood # Import the mood helper
except ImportError:
    # Fallbacks if run in a context where backend.engine.utils is not directly available
    # This is primarily for robustness; ideally, imports should work.
    class LogColors: HEADER = OKBLUE = OKCYAN = OKGREEN = WARNING = FAIL = ENDC = BOLD = LIGHTBLUE = PINK = "" # type: ignore
    def _escape_airtable_value(value: Any) -> str: return str(value).replace("'", "\\'") # type: ignore
    import pytz
    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    def get_citizen_record(tables, username): return None # type: ignore # Placeholder
    def get_relationship_trust_score(tables, u1, u2): return 0.0 # type: ignore # Placeholder
    def clean_thought_content(tables, content): return content # type: ignore # Placeholder for clean_thought_content
    def get_citizen_mood(ledger_data): return {"complex_mood": "neutral", "intensity": 5} # type: ignore # Placeholder

# Load environment variables from the project root .env file
dotenv_path = os.path.join(PROJECT_ROOT_CONV_HELPER, '.env')
load_dotenv(dotenv_path)

log = logging.getLogger(__name__)

# KinOS Configuration (should match Compagno.tsx and autonomouslyRun.py where applicable)
KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2'
KINOS_BLUEPRINT_ID = 'serenissima-ai' # From autonomouslyRun.py
DEFAULT_TIMEOUT_SECONDS = 300 # Increased timeout for KinOS calls to 5 minutes

# --- Helper Functions (adapted from autonomouslyRun.py and Compagno.tsx) ---

def _ch_get_descriptive_building_name(building_record_fields: Dict[str, Any]) -> str:
    """
    Generates a descriptive name for a building for use in prompts.
    Prioritizes Name, then non-coordinate BuildingId, then Type, then generic.
    """
    name_from_field = building_record_fields.get('Name')
    custom_id = building_record_fields.get('BuildingId')

    if name_from_field:
        return name_from_field
    
    if custom_id:
        # Heuristic for coordinate-like ID (e.g., "building_lat_lng" or "type_lat_lng_idx")
        # A simple check: contains at least two underscores and at least one dot.
        is_coordinate_like_id = (custom_id.count('_') >= 2 and '.' in custom_id)
        
        if is_coordinate_like_id:
            building_type = building_record_fields.get('Type')
            if building_type:
                readable_type = building_type.replace('_', ' ')
                return f"a {readable_type}" # e.g., "a canal house"
            else:
                return "an unnamed building" # Fallback if type is also missing
        else:
            # Custom ID is not coordinate-like, assume it's a meaningful ID
            return custom_id 
            
    # Fallback if no Name and no BuildingId (or BuildingId was coordinate-like without Type)
    building_type_fallback = building_record_fields.get('Type')
    if building_type_fallback:
        return f"a {building_type_fallback.replace('_', ' ')}"
        
    return "an unspecified location"

def get_kinos_model_for_social_class(username: Optional[str], social_class: Optional[str]) -> str:
    """Determines the KinOS model. Defaults to 'local' unless it's NLR."""
    if username == 'NLR': # Special case for NLR
        log.info(f"User '{username}' is NLR. Using KinOS model 'gemini-2.5-pro-preview-06-05'.")
        return 'gemini-2.5-pro-preview-06-05'
    
    # For all other users, default to 'local'
    log.info(f"User '{username}' (Social Class: {social_class}) is not NLR. Defaulting KinOS model to 'local'.")
    return 'local'

def make_api_get_request_helper(endpoint: str, api_base_url: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Simplified helper to make GET requests to the game API."""
    url = f"{api_base_url}{endpoint}"
    try:
        log.debug(f"Making helper GET request to: {url} with params: {params}")
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', '')
        if 'text/markdown' in content_type:
            log.debug(f"Helper GET to {url} returned Markdown. Returning text.")
            return response.text # Return Markdown string
        elif 'application/json' in content_type:
            try:
                return response.json()
            except json.JSONDecodeError as e_json_inner:
                log.error(f"Failed to decode JSON from helper GET {url} (Content-Type was application/json): {e_json_inner}")
                return {"error": "Failed to decode JSON response", "raw_text": response.text}
        else:
            log.warning(f"Unexpected Content-Type '{content_type}' from helper GET {url}. Returning raw text.")
            return response.text

    except requests.exceptions.RequestException as e:
        log.error(f"Helper GET request to {url} failed: {e}")
        return {"error": f"API request failed: {str(e)}"}
    except Exception as e_gen: # Catch any other unexpected error during processing
        log.error(f"Unexpected error in make_api_get_request_helper for {url}: {e_gen}")
        return {"error": f"Unexpected error: {str(e_gen)}"}


def get_citizen_ledger(username: str, api_base_url: str) -> Optional[Union[str, Dict]]:
    """
    Fetches the ledger for a citizen.
    Returns Markdown string if successful and content is Markdown.
    Returns the 'data' part of JSON if successful and content is JSON.
    Returns None or an error dictionary on failure.
    """
    log.info(f"Fetching ledger for {username}...")
    response_content = make_api_get_request_helper(f"/api/get-ledger?citizenUsername={username}", api_base_url)

    if isinstance(response_content, str): # Markdown response or raw text fallback
        # Assume if it's a string, it's the intended Markdown ledger
        # (or an error string from make_api_get_request_helper if it couldn't determine content type)
        # A simple check for "error" key might not be enough if the string itself is an error message.
        # For now, we trust that if it's a string, it's the Markdown.
        return response_content
    
    if isinstance(response_content, dict):
        if response_content.get("success"): # This implies it was a JSON response originally
            return response_content.get("data")
        else: # It's an error dictionary from make_api_get_request_helper or the API itself
            log.warning(f"Failed to fetch ledger for {username}: {response_content.get('error', 'Unknown error')}")
            return response_content # Return the error dict
            
    log.warning(f"Unexpected type or structure from make_api_get_request_helper for {username}: {type(response_content)}")
    return None


def get_citizen_problems_list(username: str, api_base_url: str) -> List[Dict]:
    """Fetches active problems for a citizen."""
    log.info(f"Fetching problems for {username}...")
    response = make_api_get_request_helper(f"/api/problems?Citizen={username}&Status=active", api_base_url)
    if response and response.get("success") and isinstance(response.get("problems"), list):
        return response.get("problems")
    log.warning(f"Failed to fetch problems for {username}: {response.get('error') if response else 'No response'}")
    return []

def get_relationship_details(tables: Dict[str, Table], username1: str, username2: str) -> Optional[Dict]:
    """Fetches the full relationship record between two citizens."""
    if not username1 or not username2: return None
    user1_ordered, user2_ordered = sorted([username1, username2])
    formula = f"AND({{Citizen1}}='{_escape_airtable_value(user1_ordered)}', {{Citizen2}}='{_escape_airtable_value(user2_ordered)}')"
    try:
        relationships = tables['relationships'].all(formula=formula, max_records=1)
        if relationships:
            return relationships[0]['fields']
    except Exception as e:
        log.error(f"Error fetching relationship for {user1_ordered}-{user2_ordered}: {e}")
    return None

def get_conversation_history(tables: Dict[str, Table], channel_name: Any, limit: int = 5) -> List[Dict]: # Changed type hint for channel_name to Any for robustness check
    """Fetches the last few messages for a given channel."""
    # Ensure channel_name is definitely a string before use
    try:
        str_channel_name = str(channel_name)
    except Exception as e_str:
        log.error(f"Error converting channel_name to string: {e_str}. Type: {type(channel_name)}")
        # If channel_name is a dict, try to extract a usable identifier
        if isinstance(channel_name, dict) and ('id' in channel_name or 'name' in channel_name):
            str_channel_name = str(channel_name.get('id', channel_name.get('name', 'unknown_channel')))
            log.info(f"Extracted channel identifier from dict: {str_channel_name}")
        else:
            log.error(f"Could not extract usable channel name from: {repr(channel_name)[:100]}")
            return []  # Return empty list if we can't get a usable channel name
    
    log.info(f"Fetching conversation history for channel {str_channel_name} (limit {limit})...")
    try:
        # Assuming 'Channel' field exists in MESSAGES table
        messages = tables['messages'].all(
            formula=f"{{Channel}}='{_escape_airtable_value(str_channel_name)}'",
            sort=['-CreatedAt'], # Get latest messages first
            max_records=limit
        )
        # Messages are fetched latest first, so reverse to get chronological order for the prompt
        return [msg['fields'] for msg in reversed(messages)]
    except Exception as e:
        log.error(f"Error fetching conversation history for channel {str_channel_name}: {e}")
        # Add specific logging if the error is the one reported
        if isinstance(e, AttributeError) and "'tuple' object has no attribute 'startswith'" in str(e):
            log.error(f"Type of original channel_name parameter was: {type(channel_name)}")
        elif isinstance(e, AttributeError) and "'dict' object has no attribute 'startswith'" in str(e):
            log.error(f"Dict channel_name issue: {repr(channel_name)[:100]}")
    return []

def persist_message(
    tables: Dict[str, Table],
    sender_username: str,
    receiver_username: str,
    content: str,
    message_type: str,
    channel_name: str,
    kinos_message_id: Optional[str] = None,
    target_citizen_username: Optional[str] = None,  # Nouveau paramètre pour stocker la cible
    read_at: Optional[str] = None  # Parameter to mark message as read immediately
) -> Optional[Dict]:
    """Persists a message to the Airtable MESSAGES table."""
    
    thinking_content: Optional[str] = None
    content_for_processing = content # Use a temporary variable for content processing

    if isinstance(content_for_processing, str): # Ensure content is a string before regex
        # Step 1: Extract <think> content
        think_match = re.search(r"<think>(.*?)</think>", content_for_processing, flags=re.DOTALL)
        if think_match:
            thinking_content = think_match.group(1).strip()
            # Remove the first <think> block for further processing of the main content
            # This ensures if there are multiple, only the first is captured as "Thinking"
            # and all are removed from the main content.
            # content_for_processing = content_for_processing.replace(think_match.group(0), "", 1).strip() # Remove only the first match
        
        # Step 2: Remove all <think> tags from the content that will be stored in "Content" field
        cleaned_content_think_tags = re.sub(r"<think>.*?</think>", "", content_for_processing, flags=re.DOTALL).strip()
        if not cleaned_content_think_tags and content_for_processing: # If cleaning resulted in empty string but original had content
            log.warning(f"Message content from {sender_username} to {receiver_username} (type: {message_type}) became empty after removing <think> tags. Original: '{content_for_processing[:100]}...'")
        
        # Step 3: Apply full cleaning for AI generated types to the content for "Content" field
        ai_generated_message_types = [
            "message_ai_augmented",
            "encounter_reflection",
            "conversation_opener",
            "reaction_auto",
            "ai_initiative_reasoning",
            "kinos_daily_reflection",       # For rest_processor
            "kinos_theater_reflection",     # For attend_theater_performance_processor
            "kinos_public_bath_reflection", # For use_public_bath_processor
            "ai_context_summary"            # For local model's attention pre-prompt summary
        ]
        if message_type in ai_generated_message_types:
            log.info(f"Nettoyage complet du contenu du message de type '{message_type}' de {sender_username} à {receiver_username}.")
            # clean_thought_content is imported at the top of the file
            fully_cleaned_content = clean_thought_content(tables, cleaned_content_think_tags)
            if fully_cleaned_content != cleaned_content_think_tags:
                log.info(f"Contenu après nettoyage <think> (extrait): '{cleaned_content_think_tags[:100]}...'")
                log.info(f"Contenu après nettoyage complet (extrait): '{fully_cleaned_content[:100]}...'")
            cleaned_content_final = fully_cleaned_content
        else:
            # For non-AI generated types (or types not explicitly listed), only <think> tag removal is applied
            cleaned_content_final = cleaned_content_think_tags
    else: # If content was not a string
        cleaned_content_final = content_for_processing


    payload = {
        "Sender": sender_username,
        "Receiver": receiver_username,
        # "Thinking" field will be added conditionally below
        "Content": cleaned_content_final, # Use fully cleaned content for the "Content" field
        "Type": message_type,
        "Channel": channel_name,
        "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
    }

    if thinking_content is not None:
        payload["Thinking"] = thinking_content # Add the extracted thinking content

    # Use provided read_at if available, otherwise set ReadAt for self-messages
    if read_at:
        payload["ReadAt"] = read_at
        log.info(f"Message marked as read with provided timestamp: {read_at}")
    elif sender_username == receiver_username:
        payload["ReadAt"] = datetime.now(VENICE_TIMEZONE).isoformat()
        log.info(f"Message from {sender_username} to self. Setting ReadAt to current time.")
    # Else, "ReadAt" will be null initially for the receiver

    # Préparer les données pour le champ Notes
    notes_data = {}
    
    # Ajouter kinos_message_id si présent
    if kinos_message_id:
        notes_data["kinos_message_id"] = kinos_message_id
    
    # Ajouter targetCitizen si présent
    if target_citizen_username:
        notes_data["targetCitizen"] = target_citizen_username
        log.info(f"Storing targetCitizen '{target_citizen_username}' in message Notes")
    
    # Ajouter le champ Notes seulement si nous avons des données à stocker
    if notes_data:
        payload["Notes"] = json.dumps(notes_data)

    try:
        # Log payload without sensitive details if necessary, or just key fields
        log_payload_summary = {k: (v[:50] + '...' if isinstance(v, str) and len(v) > 50 else v) for k, v in payload.items()}
        log.info(f"Persisting message from {sender_username} to {receiver_username} in channel {channel_name}. Payload summary: {json.dumps(log_payload_summary)}")
        created_record = tables['messages'].create(payload)
        log.info(f"Message persisted with Airtable ID: {created_record['id']}")
        return created_record
    except Exception as e:
        log.error(f"Failed to persist message from {sender_username} to {receiver_username}: {e}")
    return None


def make_kinos_channel_call(
    kinos_api_key: str,
    speaker_username: str, # This is the 'kin_id' for the KinOS API call
    channel_name: str,
    prompt: str,
    add_system_data: Optional[Dict] = None,
    kinos_model_override: Optional[str] = None,
    tables: Optional[Dict[str, Table]] = None  # Added tables parameter for clean_thought_content
) -> Optional[str]: # Returns the AI's message content string or None
    """Makes a call to a specific KinOS Engine citizen-to-citizen channel."""
    kinos_url = f"{KINOS_API_CHANNEL_BASE_URL}/blueprints/{KINOS_BLUEPRINT_ID}/kins/{speaker_username}/channels/{channel_name}/messages"
    headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
    
    # Clean the prompt if it's AI-generated
    cleaned_prompt = clean_thought_content(tables, prompt) if tables else prompt
    
    payload: Dict[str, Any] = {"content": cleaned_prompt} # Changed "message" to "content" as per Compagno.tsx
    if add_system_data:
        try:
            payload["ledger"] = json.dumps(add_system_data)
        except TypeError as te:
            log.error(f"Error serializing ledger data for KinOS channel call: {te}. Sending without ledger.")
    
    if kinos_model_override:
        payload["model"] = kinos_model_override
        log.info(f"Using KinOS model override '{kinos_model_override}' for channel call by {speaker_username}.")

    max_retries = 3
    initial_wait_time = 2  # seconds
    backoff_factor = 2

    for attempt in range(max_retries):
        try:
            log.info(f"Sending request to KinOS channel {channel_name} for speaker {speaker_username} (Attempt {attempt + 1}/{max_retries})...")
            log.info(f"{LogColors.LIGHTBLUE}KinOS Channel Prompt for {speaker_username} to {channel_name}:\n{cleaned_prompt}{LogColors.ENDC}")
            if add_system_data:
                log.debug(f"KinOS Channel ledger keys: {list(add_system_data.keys())}")
                
            print(f"\n\n===== KINOS API CALL DETAILS =====")
            print(f"Speaker: {speaker_username}, Channel: {channel_name}")
            print(f"URL: {kinos_url}")
            print(f"Model Override: {kinos_model_override}")
            print(f"Payload Content: {cleaned_prompt}")
            print(f"Payload ledger Keys: {list(add_system_data.keys()) if add_system_data else 'None'}")
            print(f"Tables object provided: {tables is not None}")
            print(f"================================\n\n")

            response = requests.post(kinos_url, headers=headers, json=payload, timeout=DEFAULT_TIMEOUT_SECONDS)
            response.raise_for_status() # Raises HTTPError for 4xx/5xx responses
            
            kinos_response_data = response.json()
            ai_message_content = kinos_response_data.get("content")
            
            if ai_message_content:
                log.info(f"Received KinOS response from channel {channel_name} for speaker {speaker_username}. Length: {len(ai_message_content)}")
                log.info(f"{LogColors.LIGHTBLUE}Full KinOS raw response content from channel call by {speaker_username} to {channel_name}:\n{ai_message_content}{LogColors.ENDC}")
                
                print(f"\n\n===== KINOS API RESPONSE =====")
                print(f"Response Length: {len(ai_message_content)}")
                print(f"Response Content: {ai_message_content}")
                print(f"=============================\n\n")
                
                return ai_message_content
            else:
                log.warning(f"KinOS response from channel {channel_name} for {speaker_username} missing 'content'. Response: {kinos_response_data}")
                
                print(f"\n\n===== KINOS API ERROR RESPONSE =====")
                print(f"Error: Missing 'content' in response")
                print(f"Response Data: {kinos_response_data}")
                print(f"==================================\n\n")
                
                return None # Non-retryable application-level issue

        except requests.exceptions.HTTPError as e_http:
            if e_http.response.status_code >= 500 or e_http.response.status_code == 429:
                log.warning(f"KinOS API channel HTTP error for {speaker_username} to {channel_name} (Status: {e_http.response.status_code}): {e_http}. Retrying...")
                
                print(f"\n\n===== KINOS API HTTP ERROR (RETRYABLE) =====")
                print(f"Status Code: {e_http.response.status_code}")
                print(f"Error: {e_http}")
                print(f"Attempt: {attempt + 1}/{max_retries}")
                print(f"==========================================\n\n")
                
                if attempt < max_retries - 1:
                    wait_time = initial_wait_time * (backoff_factor ** attempt)
                    log.info(f"Waiting {wait_time} seconds before next retry...")
                    time.sleep(wait_time)
                    continue
                else:
                    log.error(f"Max retries reached for KinOS channel API for {speaker_username} to {channel_name}. Last error: {e_http}")
                    return None
            else: # Non-retryable HTTP error
                log.error(f"Non-retryable KinOS API channel HTTP error for {speaker_username} to {channel_name}: {e_http}", exc_info=True)
                
                print(f"\n\n===== KINOS API HTTP ERROR (NON-RETRYABLE) =====")
                print(f"Status Code: {e_http.response.status_code}")
                print(f"Error: {e_http}")
                print(f"Response Text: {e_http.response.text[:500] if hasattr(e_http, 'response') and e_http.response is not None else 'N/A'}")
                print(f"==============================================\n\n")
                
                if hasattr(e_http, 'response') and e_http.response is not None:
                    log.error(f"KinOS error response content: {e_http.response.text[:500]}")
                return None
        except requests.exceptions.RequestException as e_req: # Catches network errors, timeouts
            log.warning(f"KinOS API channel request error for {speaker_username} to {channel_name}: {e_req}. Retrying...")
            
            print(f"\n\n===== KINOS API REQUEST ERROR =====")
            print(f"Error: {e_req}")
            print(f"Attempt: {attempt + 1}/{max_retries}")
            print(f"=================================\n\n")
            
            if attempt < max_retries - 1:
                wait_time = initial_wait_time * (backoff_factor ** attempt)
                log.info(f"Waiting {wait_time} seconds before next retry...")
                time.sleep(wait_time)
                continue
            else:
                log.error(f"Max retries reached for KinOS channel API (request error) for {speaker_username} to {channel_name}. Last error: {e_req}")
                return None
        except json.JSONDecodeError as e_json: # If response is not JSON after a 2xx status
            log.error(f"Error decoding KinOS channel JSON response for {speaker_username} to {channel_name}: {e_json}. Response text: {response.text[:200] if 'response' in locals() and hasattr(response, 'text') else 'N/A'}")
            
            print(f"\n\n===== KINOS API JSON DECODE ERROR =====")
            print(f"Error: {e_json}")
            print(f"Response Text: {response.text[:200] if 'response' in locals() and hasattr(response, 'text') else 'N/A'}")
            print(f"======================================\n\n")
            
            return None # Non-retryable
        except Exception as e_gen:
            log.error(f"Unexpected error in make_kinos_channel_call for {speaker_username} to {channel_name}: {e_gen}", exc_info=True)
            
            print(f"\n\n===== KINOS API UNEXPECTED ERROR =====")
            print(f"Error: {e_gen}")
            print(f"======================================\n\n")
            
            return None # Non-retryable
            
    return None # Should be unreachable

def _call_kinos_analysis_api(
    kinos_api_key: str,
    kin_username: str, # The Kin performing the analysis
    message_prompt: str,
    add_system_data: Optional[Dict] = None,
    model_override: Optional[str] = None,
    min_files: int = 4, # Default from docs
    max_files: int = 8  # Default from docs
) -> Optional[str]: # Returns the analysis response content string or None
    """Makes a call to the KinOS Engine /analysis endpoint."""
    analysis_url = f"{KINOS_API_CHANNEL_BASE_URL}/blueprints/{KINOS_BLUEPRINT_ID}/kins/{kin_username}/analysis"
    headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
    
    payload: Dict[str, Any] = {
        "message": message_prompt,
        "min_files": min_files,
        "max_files": max_files,
        "stream": False # Non-streaming for direct JSON response
    }
    
    if add_system_data:
        try:
            payload["ledger"] = json.dumps(add_system_data)
        except TypeError as te:
            log.error(f"Error serializing ledger data for KinOS analysis call: {te}. Sending without ledger.")
    
    if model_override:
        payload["model"] = model_override
        log.info(f"Using KinOS model override '{model_override}' for analysis call by {kin_username}.")
    else:
        pass # Rely on KinOS default if not specified

    max_retries = 3
    initial_wait_time = 2  # seconds
    backoff_factor = 2

    for attempt in range(max_retries):
        try:
            log.info(f"Sending request to KinOS analysis for kin {kin_username} (Attempt {attempt + 1}/{max_retries})...")
            log.info(f"{LogColors.LIGHTBLUE}KinOS Analysis Prompt for {kin_username}:\n{message_prompt}{LogColors.ENDC}")
            if add_system_data:
                log.debug(f"KinOS Analysis ledger keys: {list(add_system_data.keys())}")

            response = requests.post(analysis_url, headers=headers, json=payload, timeout=DEFAULT_TIMEOUT_SECONDS)
            response.raise_for_status()  # Raises HTTPError for 4xx/5xx responses
            
            analysis_response_data = response.json()
            
            if analysis_response_data.get("status") == "completed" and "response" in analysis_response_data:
                ai_response_content = analysis_response_data.get("response")
                log.info(f"Received KinOS analysis response for kin {kin_username}. Length: {len(ai_response_content) if ai_response_content else 0}")
                log.info(f"{LogColors.LIGHTBLUE}Full KinOS raw analysis response content for {kin_username}:\n{ai_response_content}{LogColors.ENDC}")
                return ai_response_content
            else:
                log.warning(f"KinOS analysis response for {kin_username} not 'completed' or missing 'response'. Status: {analysis_response_data.get('status')}, Response: {analysis_response_data}")
                return None # Non-retryable application-level issue

        except requests.exceptions.HTTPError as e_http:
            # Retry on 5xx server errors or 429 (Too Many Requests)
            if e_http.response.status_code >= 500 or e_http.response.status_code == 429:
                log.warning(f"KinOS API analysis HTTP error for {kin_username} (Status: {e_http.response.status_code}): {e_http}. Retrying...")
                if attempt < max_retries - 1:
                    wait_time = initial_wait_time * (backoff_factor ** attempt)
                    log.info(f"Waiting {wait_time} seconds before next retry...")
                    time.sleep(wait_time)
                    continue
                else:
                    log.error(f"Max retries reached for KinOS analysis API for {kin_username}. Last error: {e_http}")
                    return None
            else: # Non-retryable HTTP error (e.g., 400, 401, 403, 404)
                log.error(f"Non-retryable KinOS API analysis HTTP error for {kin_username}: {e_http}", exc_info=True)
                if hasattr(e_http, 'response') and e_http.response is not None:
                    log.error(f"KinOS error response content: {e_http.response.text[:500]}")
                return None
        except requests.exceptions.RequestException as e_req: # Catches network errors, timeouts
            log.warning(f"KinOS API analysis request error for {kin_username}: {e_req}. Retrying...")
            if attempt < max_retries - 1:
                wait_time = initial_wait_time * (backoff_factor ** attempt)
                log.info(f"Waiting {wait_time} seconds before next retry...")
                time.sleep(wait_time)
                continue
            else:
                log.error(f"Max retries reached for KinOS analysis API (request error) for {kin_username}. Last error: {e_req}")
                return None
        except json.JSONDecodeError as e_json: # If response is not JSON after a 2xx status
            log.error(f"Error decoding KinOS analysis JSON response for {kin_username}: {e_json}. Response text: {response.text[:200] if 'response' in locals() and hasattr(response, 'text') else 'N/A'}")
            return None # Non-retryable if successful status but bad JSON
        except Exception as e_gen:
            log.error(f"Unexpected error in _call_kinos_analysis_api for {kin_username}: {e_gen}", exc_info=True)
            return None # Non-retryable for other unexpected errors
    
    return None # Should be unreachable if loop completes, but as a fallback

# --- Main Conversation Turn Generator ---

def generate_conversation_turn(
    tables: Dict[str, Table],
    kinos_api_key: str,
    speaker_username: str,
    listener_username: str, # For reflection, this is the citizen being observed; for opener, the one being spoken to
    api_base_url: str,
    kinos_model_override: Optional[str] = None,
    max_history_messages: int = 5,
    interaction_mode: str = "conversation", # "conversation", "reflection", or "conversation_opener"
    message: Optional[str] = None, # Optional message to send directly for "conversation_opener"
    target_citizen_username_for_trust_impact: Optional[str] = None, # For 3-way trust impact
    process_reply: bool = True, # Whether to generate a reply from the listener
    add_message: Optional[Dict[str, Any]] = None # Additional message data to include in ledger
) -> Optional[Dict]:
    """
    Generates one turn of a conversation, an internal reflection, or a conversation opener.
    If 'message' is provided and interaction_mode is 'conversation_opener', it sends that message directly.
    Optionally, can assess trust impact on a third citizen mentioned in the conversation.
    Persists the generated/provided message/reflection and returns its Airtable record.
    """
    if interaction_mode == "reflection":
        log.info(f"Generating internal reflection for {speaker_username} about {listener_username}.")
    elif interaction_mode == "conversation_opener":
        if message:
            log.info(f"Sending provided message as conversation opener from {speaker_username} to {listener_username}.")
        else:
            log.info(f"Generating conversation opener from {speaker_username} to {listener_username}.")
    else: # conversation
        log.info(f"Generating conversation turn: Speaker: {speaker_username}, Listener: {listener_username}")

    # 1. Get Speaker and Listener (observed/spoken-to citizen) profiles
    log.info(f"Fetching profiles for conversation between {speaker_username} (speaker) and {listener_username} (listener)")
    
    # Vérifier que tables contient bien la table 'citizens'
    if 'citizens' not in tables:
        log.error(f"Table 'citizens' not found in tables dictionary. Available tables: {list(tables.keys())}")
        return None
    
    # Vérifier que la table citizens est bien initialisée
    if tables['citizens'] is None:
        log.error(f"Table 'citizens' is None in tables dictionary")
        return None
    
    # Ajouter plus de logs pour le débogage
    log.info(f"Attempting to get citizen record for speaker: {speaker_username}")
    speaker_profile_record = get_citizen_record(tables, speaker_username)
    if not speaker_profile_record:
        log.error(f"Could not find profile for speaker: {speaker_username}")
        # Essayer de lister quelques citoyens pour vérifier que la table fonctionne
        try:
            sample_citizens = tables['citizens'].all(max_records=10)
            if sample_citizens:
                sample_usernames = [c['fields'].get('Username', 'Unknown') for c in sample_citizens]
                log.info(f"Sample citizens in database: {sample_usernames}")
                
                # Vérifier si le citoyen recherché est dans les échantillons
                if speaker_username in sample_usernames:
                    log.warning(f"Citizen {speaker_username} found in sample but not by get_citizen_record. Trying direct lookup.")
                    # Recherche directe par correspondance dans les échantillons
                    for citizen in sample_citizens:
                        if citizen['fields'].get('Username') == speaker_username:
                            log.info(f"Found {speaker_username} directly in sample citizens. Using this record.")
                            speaker_profile_record = citizen
                            break
                
                if not speaker_profile_record:
                    # Essayer une recherche directe dans la table complète
                    log.warning(f"Trying full table scan for {speaker_username}")
                    all_citizens = tables['citizens'].all(max_records=100)
                    for citizen in all_citizens:
                        if citizen['fields'].get('Username') == speaker_username:
                            log.info(f"Found {speaker_username} in full table scan. Using this record.")
                            speaker_profile_record = citizen
                            break
                
                if speaker_profile_record:
                    # Si on a trouvé le citoyen par une méthode alternative, continuer
                    log.info(f"Successfully recovered profile for {speaker_username} using alternative method.")
                else:
                    # Si toujours pas trouvé, abandonner
                    log.error(f"Could not find profile for {speaker_username} even with alternative methods.")
                    return None
            else:
                log.warning("No citizens found in database when sampling")
                return None
        except Exception as e:
            log.error(f"Error when trying to sample citizens: {e}")
            return None
        
    log.info(f"Attempting to get citizen record for listener: {listener_username}")
    listener_profile_record = get_citizen_record(tables, listener_username)
    if not listener_profile_record:
        log.error(f"Could not find profile for listener: {listener_username}")
        # Essayer de lister quelques citoyens pour vérifier que la table fonctionne
        try:
            # Utiliser les échantillons déjà récupérés si disponibles
            if 'sample_citizens' in locals() and sample_citizens:
                sample_usernames = [c['fields'].get('Username', 'Unknown') for c in sample_citizens]
                
                # Vérifier si le citoyen recherché est dans les échantillons
                if listener_username in sample_usernames:
                    log.warning(f"Citizen {listener_username} found in sample but not by get_citizen_record. Trying direct lookup.")
                    # Recherche directe par correspondance dans les échantillons
                    for citizen in sample_citizens:
                        if citizen['fields'].get('Username') == listener_username:
                            log.info(f"Found {listener_username} directly in sample citizens. Using this record.")
                            listener_profile_record = citizen
                            break
            
            if not listener_profile_record:
                # Essayer une recherche directe dans la table complète
                log.warning(f"Trying full table scan for {listener_username}")
                all_citizens = tables['citizens'].all(max_records=100)
                for citizen in all_citizens:
                    if citizen['fields'].get('Username') == listener_username:
                        log.info(f"Found {listener_username} in full table scan. Using this record.")
                        listener_profile_record = citizen
                        break
            
            if listener_profile_record:
                # Si on a trouvé le citoyen par une méthode alternative, continuer
                log.info(f"Successfully recovered profile for {listener_username} using alternative method.")
            else:
                # Si toujours pas trouvé, abandonner
                log.error(f"Could not find profile for {listener_username} even with alternative methods.")
                return None
        except Exception as e:
            log.error(f"Error when trying to find listener profile: {e}")
            return None
    
    speaker_profile = speaker_profile_record['fields']
    listener_profile = listener_profile_record['fields']
    
    speaker_social_class = speaker_profile.get('SocialClass')
    # speaker_current_point_id = speaker_profile.get('Point') # No longer primary way to determine location
    # listener_current_point_id = listener_profile.get('Point')

    location_description_for_prompt: str = "in the streets of Venice" # Default

    speaker_pos_str = speaker_profile.get('Position')
    listener_pos_str = listener_profile.get('Position')

    if speaker_pos_str and listener_pos_str:
        try:
            speaker_coords = json.loads(speaker_pos_str)
            listener_coords = json.loads(listener_pos_str)
            
            # Find building at speaker's coords
            from backend.engine.utils.activity_helpers import get_closest_building_to_position # Local import
            
            speaker_building_rec = get_closest_building_to_position(tables, speaker_coords, max_distance_meters=10)
            
            if speaker_building_rec:
                current_speaker_building_id = speaker_building_rec['fields'].get('BuildingId')
                listener_building_rec = get_closest_building_to_position(tables, listener_coords, max_distance_meters=10)
                
                if listener_building_rec and listener_building_rec['fields'].get('BuildingId') == current_speaker_building_id:
                    # Both in the same building
                    descriptive_name = _ch_get_descriptive_building_name(speaker_building_rec['fields'])
                    location_description_for_prompt = f"in {descriptive_name}"
                    log.info(f"Speaker and Listener are both in building: {descriptive_name} (Custom ID: {current_speaker_building_id or 'N/A'})")
                else:
                    # Speaker is in a building, listener is elsewhere
                    descriptive_name = _ch_get_descriptive_building_name(speaker_building_rec['fields'])
                    location_description_for_prompt = f"near {descriptive_name}"
                    log.info(f"Speaker is in {descriptive_name} (Custom ID: {current_speaker_building_id or 'N/A'}), Listener is elsewhere. Defaulting to 'near {descriptive_name}'.")
            # If speaker_building_rec is None, they are not in/near a building, so default "in the streets" is fine.
            
        except Exception as e_shared_bldg:
            log.warning(f"Could not determine shared building due to error: {e_shared_bldg}. Defaulting location to 'in the streets of Venice'.")
    else:
        log.info("Speaker or Listener position string is missing. Defaulting location to 'in the streets of Venice'.")

    # 2. Determine KinOS channel name
    channel_name = "_".join(sorted([speaker_username, listener_username]))

    # 3. Fetch context data for ledger
    speaker_ledger = get_citizen_ledger(speaker_username, api_base_url) or {}
    
    # Get the speaker's mood based on their ledger data
    speaker_mood_info = {}
    try:
        if isinstance(speaker_ledger, dict):
            # Use the mood helper directly
            speaker_mood_info = get_citizen_mood(speaker_ledger)
            log.info(f"Calculated mood for {speaker_username}: {speaker_mood_info.get('complex_mood')} (intensity: {speaker_mood_info.get('intensity')})")
        else:
            log.warning(f"Could not calculate mood for {speaker_username}: ledger is not a dictionary")
    except Exception as e_mood:
        log.error(f"Error calculating mood for {speaker_username}: {e_mood}")
        speaker_mood_info = {"complex_mood": "neutral", "intensity": 5}  # Default fallback
    
    add_system_payload = {
        "speaker_profile": {
            "username": speaker_profile.get("Username"),
            "firstName": speaker_profile.get("FirstName"),
            "lastName": speaker_profile.get("LastName"),
            "socialClass": speaker_profile.get("SocialClass"),
            "mood": speaker_mood_info.get("complex_mood", "neutral"),
            "mood_intensity": speaker_mood_info.get("intensity", 5),
            "mood_description": speaker_mood_info.get("mood_description", "")
        },
        "listener_profile": {
            "username": listener_profile.get("Username"),
            "firstName": listener_profile.get("FirstName"),
            "lastName": listener_profile.get("LastName"),
            "socialClass": listener_profile.get("SocialClass")
        },
        "speaker_ledger": speaker_ledger,
        "speaker_problems": get_citizen_problems_list(speaker_username, api_base_url),
        "listener_problems": get_citizen_problems_list(listener_username, api_base_url),
        "relationship_details": get_relationship_details(tables, speaker_username, listener_username) or {},
        "conversation_history": get_conversation_history(tables, channel_name, limit=max_history_messages)
    }
    
    # Add additional message data if provided
    if add_message:
        add_system_payload["additional_message_data"] = add_message
        log.info(f"Including additional message data in ledger payload: {list(add_message.keys())}")

    # 4. Construct KinOS prompt
    # location_description_for_prompt is now set above.
    location_context = f"You are both currently {location_description_for_prompt}. "

    if interaction_mode == "reflection":
        # Get mood-specific guidance
        mood = add_system_payload["speaker_profile"]["mood"]
        mood_intensity = add_system_payload["speaker_profile"]["mood_intensity"]
        mood_description = add_system_payload["speaker_profile"].get("mood_description", "")
        
        mood_guidance = f"Your current mood is {mood} (intensity: {mood_intensity}/10)."
        if mood_description:
            mood_guidance += f" {mood_description}."
        mood_guidance += " Let this influence your thoughts and observations."
        
        system_explanation = (
            f"[SYSTEM]You are {speaker_profile.get('FirstName', speaker_username)}, a {speaker_profile.get('SocialClass', 'citizen')} of Venice. "
            f"{location_context}You have noticed {listener_profile.get('FirstName', listener_username)} (Social Class: {listener_profile.get('SocialClass', 'unknown')}) is also here. "
            f"{mood_guidance} "
            f"Review your knowledge in your Ledger (including `availableStratagems` and active stratagems, problems, your relationship with them, their problems, and any recent direct conversation history). "
            f"What are your internal thoughts or observations about their presence and this encounter? Consider any opportunities, risks, or social implications. Could a **Stratagem** be relevant here (either one you are running, one targeting you, or one you might propose)? "
            f"Your response should be your internal monologue or reflection in plain text in English, not direct speech to them. "
            f"Keep it focused on potential gameplay impact or character development.[/SYSTEM]\n\n"
        )
        prompt = system_explanation + f"{speaker_profile.get('FirstName', speaker_username)}'s internal thoughts about {listener_profile.get('FirstName', listener_username)}: "
    elif interaction_mode == "conversation_opener":
        # Get mood-specific guidance
        mood = add_system_payload["speaker_profile"]["mood"]
        mood_intensity = add_system_payload["speaker_profile"]["mood_intensity"]
        mood_description = add_system_payload["speaker_profile"].get("mood_description", "")
        
        mood_guidance = f"Your current mood is {mood} (intensity: {mood_intensity}/10)."
        if mood_description:
            mood_guidance += f" {mood_description}."
        mood_guidance += " Let this influence your tone and approach."
        
        system_explanation = (
            f"[SYSTEM]You are {speaker_profile.get('FirstName', speaker_username)}, a {speaker_profile.get('SocialClass', 'citizen')} of Venice. "
            f"{location_context}You see {listener_profile.get('FirstName', listener_username)} (Social Class: {listener_profile.get('SocialClass', 'unknown')}) here. "
            f"{mood_guidance} "
            f"Review your knowledge in your Ledger (including `availableStratagems` and active stratagems, problems, your relationship with them, their problems, and any recent direct conversation history). "
            f"What would you say to them to continue the conversation? Your opening could be related to a shared interest, a problem, an opportunity, latest reports or gossips, or perhaps a **Stratagem** you wish to discuss or propose. "
            f"Your response should be direct speech TO {listener_profile.get('FirstName', listener_username)}, in plain text in English. "
            f"Keep it concise, in character, and relevant to your current situation or relationship.[/SYSTEM]\n\n"
        )
        # No conversation history for an opener
        prompt = system_explanation + f"{speaker_profile.get('FirstName', speaker_username)} (you) to {listener_profile.get('FirstName', listener_username)}: "
    else: # "conversation" mode (replying in an existing conversation)
        # Get mood-specific guidance
        mood = add_system_payload["speaker_profile"]["mood"]
        mood_intensity = add_system_payload["speaker_profile"]["mood_intensity"]
        mood_description = add_system_payload["speaker_profile"].get("mood_description", "")
        
        mood_guidance = f"Your current mood is {mood} (intensity: {mood_intensity}/10)."
        if mood_description:
            mood_guidance += f" {mood_description}."
        mood_guidance += " Let this influence your tone and response."
        
        system_explanation = (
            f"[SYSTEM]You are {speaker_profile.get('FirstName', speaker_username)}, a {speaker_profile.get('SocialClass', 'citizen')} of Venice. "
            f"You are currently in conversation with {listener_profile.get('FirstName', listener_username)}. {location_context}"
            f"{mood_guidance} "
            f"Review your knowledge in your Ledger (including `availableStratagems` and active stratagems, problems, relationship, listener's problems, and recent conversation histories, plus this `system_guidance`). "
            f"Continue the conversation naturally in plain text in English, keeping your persona and objectives in mind. If strategic elements arise, remember that **Stratagems** are a key way to interact with the world. Your response should be direct speech.[/SYSTEM]\n\n"
        )
        add_system_payload["system_guidance"] = system_explanation
        
        if add_system_payload["conversation_history"]:
            last_message = add_system_payload["conversation_history"][-1]
            prompt = last_message.get("Content", "An error occurred, I did not receive your last message. Could you repeat?") # Fallback if Content is missing
            if not prompt: # If Content was empty string
                 prompt = "Your previous message was empty. What do you mean?"
        else:
            log.warning(f"Conversation mode for {speaker_username} to {listener_username} but no conversation history found. Using generic prompt.")
            prompt = "Continue the conversation." # Generic prompt if history is empty

    # 5. Determine KinOS model
    effective_kinos_model = kinos_model_override or get_kinos_model_for_social_class(speaker_username, speaker_social_class)

    # --- NEW LOGIC for local model pre-processing ---
    final_add_system_data = add_system_payload # By default, use the full ledger

    ai_message_content: Optional[str] = None

    if interaction_mode == "conversation_opener" and message is not None:
        ai_message_content = message
        log.info(f"Using provided message for conversation_opener: '{message[:100]}...'")
    else:
        ai_message_content = make_kinos_channel_call(
            kinos_api_key,
            speaker_username, # speaker_username is the kin_id
            channel_name,
            prompt, # The original prompt for the conversation
            final_add_system_data, # This is either the full package or the summary
            effective_kinos_model
        )

        if not ai_message_content:
            log.error(f"KinOS failed to generate a message for {speaker_username} to {listener_username}.")
            return None

    # 7. Persist message/reflection
    message_receiver = listener_username # Default for conversation and opener
    message_type_to_persist = "message_ai_augmented" # Default for conversation and opener
    
    if interaction_mode == "reflection":
        message_receiver = speaker_username # Reflection is "to self"
        message_type_to_persist = "encounter_reflection"
        log.info(f"Persisting reflection from {speaker_username} about {listener_username} (to self).")
    elif interaction_mode == "conversation_opener":
        # Receiver is listener_username, type is still message_ai_augmented or a new "opener" type
        message_type_to_persist = "conversation_opener" # Or keep as message_ai_augmented
        log.info(f"Persisting conversation opener from {speaker_username} to {listener_username}.")
    
    persisted_message_record = persist_message(
        tables,
        sender_username=speaker_username,
        receiver_username=message_receiver,
        content=ai_message_content,
        message_type=message_type_to_persist,
        channel_name=channel_name, # Channel remains the pair for context, type differentiates
        target_citizen_username=target_citizen_username_for_trust_impact  # Passer la cible pour stockage dans Notes
    )

    if persisted_message_record:
        if interaction_mode == "reflection":
            log.info(f"Successfully generated and persisted reflection from {speaker_username} about {listener_username}.")
            return persisted_message_record # Return the full Airtable record for reflections
        elif interaction_mode in ["conversation_opener", "conversation"]:
            if interaction_mode == "conversation_opener":
                log.info(f"Successfully generated and persisted conversation opener from {speaker_username} to {listener_username}.")
            else: # conversation
                log.info(f"Successfully generated and persisted conversation turn from {speaker_username}.")
            
            # Process reply if requested (default is True)
            listener_reply_record = None
            if process_reply and interaction_mode in ["conversation_opener", "conversation"]:
                log.info(f"Generating reply from {listener_username} to {speaker_username}...")
                
                # Generate the reply by swapping speaker and listener
                listener_reply_record = generate_conversation_turn(
                    tables=tables,
                    kinos_api_key=kinos_api_key,
                    speaker_username=listener_username,  # Listener becomes speaker
                    listener_username=speaker_username,  # Speaker becomes listener
                    api_base_url=api_base_url,
                    kinos_model_override=kinos_model_override,
                    max_history_messages=max_history_messages,
                    interaction_mode="conversation",  # Always use conversation mode for replies
                    message=None,  # No direct message for replies
                    target_citizen_username_for_trust_impact=target_citizen_username_for_trust_impact,
                    process_reply=False  # Prevent infinite recursion
                )
                
                if not listener_reply_record:
                    log.warning(f"Failed to generate reply from {listener_username} to {speaker_username}.")
            
            # --- Trust Impact Analysis via KinOS ---
            # Only perform trust analysis after we have both the message and reply
            log.info(f"Attempting trust impact analysis for {listener_username} regarding message from {speaker_username}.")
            
            listener_ledger = get_citizen_ledger(listener_username, api_base_url)
            listener_profile_for_analysis = get_citizen_record(tables, listener_username)
            listener_social_class_for_analysis = listener_profile_for_analysis['fields'].get('SocialClass') if listener_profile_for_analysis else None
            model_for_listener_analysis = get_kinos_model_for_social_class(listener_username, listener_social_class_for_analysis)

            # Include the reply in the analysis if available
            reply_content = ""
            if listener_reply_record and 'fields' in listener_reply_record:
                reply_content = listener_reply_record['fields'].get('Content', '')
                
            analysis_prompt_parts = [
                f"You are {listener_profile.get('FirstName', listener_username)}. You received the following message from {speaker_profile.get('FirstName', speaker_username)}: '{ai_message_content}'. ",
            ]
            
            if reply_content:
                analysis_prompt_parts.append(f"You replied with: '{reply_content}'. ")
                
            analysis_prompt_parts.append(f"Consider your personality, your relationship with {speaker_profile.get('FirstName', speaker_username)}, and all information in your ledger. ")
            
            json_format_parts = [
                f"\"trustChangeForListener\": <value_listener>"
            ]

            if target_citizen_username_for_trust_impact and target_citizen_username_for_trust_impact != listener_username:
                target_profile_record = get_citizen_record(tables, target_citizen_username_for_trust_impact)
                if not target_profile_record:
                    log.warning(f"Could not find profile for trust impact target: {target_citizen_username_for_trust_impact}. Using username as display name.")
                    target_display_name = target_citizen_username_for_trust_impact
                else:
                    target_display_name = target_profile_record['fields'].get('FirstName', target_citizen_username_for_trust_impact)
                
                analysis_prompt_parts.append(
                    f"This message also discusses or implies something about {target_display_name}."
                    f"--> Based on the message content and your understanding of {target_display_name}, "
                    f"how does this message impact YOUR trust in {target_display_name}? "
                )
                json_format_parts.append(f"\"trustChangeForTarget\": <value_target>")
                analysis_prompt_parts.append(
                    f"Assess the impact on your trust in {speaker_profile.get('FirstName', speaker_username)} AND your trust in {target_display_name} (value_target). "
                    f"Both values should be integers between -5 and +5."
                )
            else:
                analysis_prompt_parts.append(
                    f"how does this message impact your trust in {speaker_profile.get('FirstName', speaker_username)}? "
                    f"The value should be an integer between -5 and +5."
                )

            analysis_prompt_parts.append(f"Please respond ONLY with a JSON object in the format: {{{', '.join(json_format_parts)}}}.")
            analysis_prompt = "".join(analysis_prompt_parts)
            
            analysis_response_str = _call_kinos_analysis_api(
                kinos_api_key,
                listener_username, # The Kin performing the analysis
                analysis_prompt,
                listener_ledger if isinstance(listener_ledger, dict) else {"error": "Listener ledger not available or invalid"}, # Their own ledger as context
                model_for_listener_analysis
            )
            
            trust_change_for_listener = 0.0
            trust_change_for_target = 0.0

            if analysis_response_str:
                cleaned_analysis_response_str = analysis_response_str.strip()
                if cleaned_analysis_response_str.startswith("```json"):
                    cleaned_analysis_response_str = cleaned_analysis_response_str[len("```json"):]
                if cleaned_analysis_response_str.startswith("```"):
                    cleaned_analysis_response_str = cleaned_analysis_response_str[len("```"):]
                if cleaned_analysis_response_str.endswith("```"):
                    cleaned_analysis_response_str = cleaned_analysis_response_str[:-len("```")]
                cleaned_analysis_response_str = cleaned_analysis_response_str.strip()

                try:
                    analysis_json = json.loads(cleaned_analysis_response_str)
                    
                    # Impact on listener's trust in speaker
                    extracted_change_listener = analysis_json.get("trustChangeForListener")
                    if isinstance(extracted_change_listener, (int, float)):
                        trust_change_for_listener = float(max(-5.0, min(5.0, extracted_change_listener)))
                        log.info(f"Trust impact analysis for {listener_username} on {speaker_username} (speaker): AI assessed change = {trust_change_for_listener} (original: {extracted_change_listener})")
                    else:
                        log.warning(f"Trust impact on listener: 'trustChangeForListener' key missing or invalid in JSON: '{cleaned_analysis_response_str}'. Using default.")

                    # Impact on listener's trust in target_citizen (if applicable)
                    if target_citizen_username_for_trust_impact and target_citizen_username_for_trust_impact != listener_username:
                        extracted_change_target = analysis_json.get("trustChangeForTarget")
                        if isinstance(extracted_change_target, (int, float)):
                            trust_change_for_target = float(max(-5.0, min(5.0, extracted_change_target)))
                            log.info(f"Trust impact analysis for {listener_username} on {target_citizen_username_for_trust_impact} (target): AI assessed change = {trust_change_for_target} (original: {extracted_change_target})")
                        else:
                            log.warning(f"Trust impact on target: 'trustChangeForTarget' key missing or invalid in JSON: '{cleaned_analysis_response_str}'. Using default.")
                
                except json.JSONDecodeError:
                    log.warning(f"Trust impact analysis: Failed to parse JSON response: '{cleaned_analysis_response_str[:100]}...'. Original: '{analysis_response_str[:100]}...'. Using default impacts.")
            else:
                log.warning(f"Trust impact analysis: No response from KinOS analysis API. Using default impacts.")

            # Update trust score for listener towards speaker
            if trust_change_for_listener != 0.0:
                update_trust_score_for_activity(
                    tables, listener_username, speaker_username, trust_change_for_listener,
                    activity_type_for_notes="conversation_trust_shift_speaker", success=True,
                    notes_detail=f"AI_impact_on_{listener_username}_by_msg_from_{speaker_username}. Msg: {ai_message_content[:20]}...",
                    activity_record_for_kinos=None
                )
                # Colorized log for trust score update
                color_code = LogColors.OKGREEN if trust_change_for_listener > 0 else LogColors.WARNING
                log.info(f"{color_code}Trust score between {listener_username} and {speaker_username} updated by {trust_change_for_listener}.{LogColors.ENDC}")
                
                # Save trust impact details in the message Notes
                if persisted_message_record and 'id' in persisted_message_record:
                    try:
                        message_id = persisted_message_record['id']
                        current_notes = persisted_message_record.get('fields', {}).get('Notes', '{}')
                        trust_impact_data = {
                            "trustImpact": {
                                "listener_to_speaker": trust_change_for_listener
                            }
                        }
                        
                        # Merge with existing Notes if it's valid JSON
                        try:
                            if current_notes:
                                existing_data = json.loads(current_notes)
                                if isinstance(existing_data, dict):
                                    existing_data.update(trust_impact_data)
                                    trust_impact_data = existing_data
                        except json.JSONDecodeError:
                            # If existing Notes is not valid JSON, just use the new data
                            pass
                            
                        tables['messages'].update(message_id, {
                            'Notes': json.dumps(trust_impact_data)
                        })
                        log.info(f"Updated message {message_id} Notes with trust impact data")
                    except Exception as e_notes:
                        log.warning(f"Failed to update message Notes with trust impact: {e_notes}")

            # Update trust score for listener towards target_citizen_username_for_trust_impact
            if target_citizen_username_for_trust_impact and target_citizen_username_for_trust_impact != listener_username and trust_change_for_target != 0.0:
                update_trust_score_for_activity(
                    tables, listener_username, target_citizen_username_for_trust_impact, trust_change_for_target,
                    activity_type_for_notes="conversation_trust_shift_target", success=True,
                    notes_detail=f"AI_impact_on_{listener_username}_re_{target_citizen_username_for_trust_impact}_due_to_msg_from_{speaker_username}. Msg: {ai_message_content[:20]}...",
                    activity_record_for_kinos=None
                )
                # Colorized log for trust score update
                color_code = LogColors.OKGREEN if trust_change_for_target > 0 else LogColors.WARNING
                log.info(f"{color_code}Trust score between {listener_username} and {target_citizen_username_for_trust_impact} updated by {trust_change_for_target}.{LogColors.ENDC}")
                
                # Add target trust impact to the message Notes if we already updated it
                if persisted_message_record and 'id' in persisted_message_record:
                    try:
                        message_id = persisted_message_record['id']
                        current_notes = persisted_message_record.get('fields', {}).get('Notes', '{}')
                        
                        # Try to parse existing Notes
                        try:
                            existing_data = json.loads(current_notes) if current_notes else {}
                            if not isinstance(existing_data, dict):
                                existing_data = {}
                        except json.JSONDecodeError:
                            existing_data = {}
                        
                        # Add or update the trustImpact section
                        if 'trustImpact' not in existing_data:
                            existing_data['trustImpact'] = {}
                        
                        existing_data['trustImpact']['listener_to_target'] = trust_change_for_target
                        existing_data['trustImpact']['target_username'] = target_citizen_username_for_trust_impact
                        
                        tables['messages'].update(message_id, {
                            'Notes': json.dumps(existing_data)
                        })
                        log.info(f"Updated message {message_id} Notes with target trust impact data")
                    except Exception as e_target_notes:
                        log.warning(f"Failed to update message Notes with target trust impact: {e_target_notes}")
            # --- End Trust Impact Analysis ---
            
            # Return the original message record (not the reply)
            return persisted_message_record
    else:
        log.error(f"Failed to persist KinOS message from {speaker_username}.")
        return None


if __name__ == '__main__':
    # Example Usage (requires .env to be set up correctly)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    log.info("Conversation Helper - Example Usage")

    kinos_key = os.getenv("KINOS_API_KEY")
    airtable_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base = os.getenv("AIRTABLE_BASE_ID")
    next_public_base_url = os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000")

    if not all([kinos_key, airtable_key, airtable_base]):
        log.error("Missing KINOS_API_KEY, AIRTABLE_API_KEY, or AIRTABLE_BASE_ID in .env file.")
        sys.exit(1)

    try:
        api = requests.Session() # Dummy session for type hint, not used by pyairtable directly
        airtable_api_instance = Table(airtable_key, airtable_base, "MESSAGES", api=api).api # Get Api instance
        
        example_tables = {
            'citizens': airtable_api_instance.table(airtable_base, 'CITIZENS'),
            'messages': airtable_api_instance.table(airtable_base, 'MESSAGES'),
            'relationships': airtable_api_instance.table(airtable_base, 'RELATIONSHIPS'),
            'problems': airtable_api_instance.table(airtable_base, 'PROBLEMS'), # Assuming PROBLEMS table exists
        }
        log.info("Airtable tables initialized for example.")
    except Exception as e:
        log.error(f"Failed to initialize Airtable for example: {e}")
        sys.exit(1)

    # --- Define citizens for the conversation ---
    # Replace with actual usernames from your Airtable
    citizen1_test_username = "NLR"  # Example: The AI that will speak
    citizen2_test_username = "BasstheWhale" # Example: The AI that will listen this turn
    
    log.info(f"Attempting to generate conversation turn: {citizen1_test_username} (speaker) to {citizen2_test_username} (listener)")

    # Generate a turn
    new_message_record = generate_conversation_turn(
        tables=example_tables,
        kinos_api_key=kinos_key,
        speaker_username=citizen1_test_username,
        listener_username=citizen2_test_username,
        api_base_url=next_public_base_url,
        interaction_mode="conversation_opener", # Explicitly "conversation_opener" for this example
        # message="Hello there, this is a direct message!", # Example of sending a direct message
        # kinos_model_override="local" # Optional: force a model
    )

    if new_message_record:
        log.info(f"Conversation turn/opener/reflection generated and saved. Message ID: {new_message_record.get('id')}")
        log.info(f"Content: {new_message_record.get('fields', {}).get('Content')}")
    else:
        log.error("Failed to generate conversation turn.")

    # Example for the other citizen to reply (swap speaker and listener)
    # log.info(f"\nAttempting to generate reply: {citizen2_test_username} (speaker) to {citizen1_test_username} (listener)")
    # reply_message_record = generate_conversation_turn(
    #     tables=example_tables,
    #     kinos_api_key=kinos_key,
    #     speaker_username=citizen2_test_username,
    #     listener_username=citizen1_test_username,
    #     api_base_url=next_public_base_url
    # )
    # if reply_message_record:
    #     log.info(f"Reply generated and saved. Message ID: {reply_message_record.get('id')}")
    #     log.info(f"Content: {reply_message_record.get('fields', {}).get('Content')}")
    # else:
    #     log.error("Failed to generate reply.")

    # Example for reflection
    # log.info(f"\nAttempting to generate reflection: {citizen1_test_username} about {citizen2_test_username}")
    # reflection_message_record = generate_conversation_turn(
    #     tables=example_tables,
    #     kinos_api_key=kinos_key,
    #     speaker_username=citizen1_test_username,
    #     listener_username=citizen2_test_username,
    #     api_base_url=next_public_base_url,
    #     interaction_mode="reflection"
    # )
    # if reflection_message_record:
    #     log.info(f"Reflection generated and saved. Message ID: {reflection_message_record.get('id')}")
    #     log.info(f"Content: {reflection_message_record.get('fields', {}).get('Content')}")
    # else:
    #     log.error("Failed to generate reflection.")
