import os
import sys
import json
import logging
import time
import re
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple

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
        get_relationship_trust_score # Re-using this, though it only returns score. We need full record.
    )
except ImportError:
    # Fallbacks if run in a context where backend.engine.utils is not directly available
    # This is primarily for robustness; ideally, imports should work.
    class LogColors: HEADER = OKBLUE = OKCYAN = OKGREEN = WARNING = FAIL = ENDC = BOLD = LIGHTBLUE = PINK = ""
    def _escape_airtable_value(value: Any) -> str: return str(value).replace("'", "\\'")
    import pytz
    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    def get_citizen_record(tables, username): return None # Placeholder
    def get_relationship_trust_score(tables, u1, u2): return 0.0 # Placeholder

# Load environment variables from the project root .env file
dotenv_path = os.path.join(PROJECT_ROOT_CONV_HELPER, '.env')
load_dotenv(dotenv_path)

log = logging.getLogger(__name__)

# Kinos Configuration (should match Compagno.tsx and autonomouslyRun.py where applicable)
KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2'
KINOS_BLUEPRINT_ID = 'serenissima-ai' # From autonomouslyRun.py
DEFAULT_TIMEOUT_SECONDS = 120 # Increased timeout for Kinos calls

# --- Helper Functions (adapted from autonomouslyRun.py and Compagno.tsx) ---

def get_kinos_model_for_social_class(username: Optional[str], social_class: Optional[str]) -> str:
    """Determines the Kinos model. Defaults to 'local' unless it's NLR."""
    if username == 'NLR': # Special case for NLR
        log.info(f"User '{username}' is NLR. Using Kinos model 'gemini-2.5-pro-preview-05-06'.")
        return 'gemini-2.5-pro-preview-05-06'
    
    # For all other users, default to 'local'
    log.info(f"User '{username}' (Social Class: {social_class}) is not NLR. Defaulting Kinos model to 'local'.")
    return 'local'

def make_api_get_request_helper(endpoint: str, api_base_url: str, params: Optional[Dict] = None) -> Optional[Dict]:
    """Simplified helper to make GET requests to the game API."""
    url = f"{api_base_url}{endpoint}"
    try:
        log.debug(f"Making helper GET request to: {url} with params: {params}")
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        log.error(f"Helper GET request to {url} failed: {e}")
    except json.JSONDecodeError as e_json:
        log.error(f"Failed to decode JSON from helper GET {url}: {e_json}")
    return None

def get_citizen_data_package(username: str, api_base_url: str) -> Optional[Dict]:
    """Fetches the full data package for a citizen."""
    log.info(f"Fetching data package for {username}...")
    response = make_api_get_request_helper(f"/api/get-data-package?citizenUsername={username}", api_base_url)
    if response and response.get("success"):
        return response.get("data")
    log.warning(f"Failed to fetch data package for {username}: {response.get('error') if response else 'No response'}")
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
    str_channel_name = str(channel_name)
    
    log.info(f"Fetching conversation history for channel {str_channel_name} (limit {limit})...")
    try:
        # Assuming 'Channel' field exists in MESSAGES table
        messages = tables['messages'].all(
            formula=f"{{Channel}}='{_escape_airtable_value(str_channel_name)}'",
            sort=[('-CreatedAt', 'desc')], # Get latest messages first
            max_records=limit
        )
        # Messages are fetched latest first, so reverse to get chronological order for the prompt
        return [msg['fields'] for msg in reversed(messages)]
    except Exception as e:
        log.error(f"Error fetching conversation history for channel {str_channel_name}: {e}")
        # Add specific logging if the error is the one reported
        if isinstance(e, AttributeError) and "'tuple' object has no attribute 'startswith'" in str(e):
            log.error(f"Type of original channel_name parameter was: {type(channel_name)}")
    return []

def persist_message(
    tables: Dict[str, Table],
    sender_username: str,
    receiver_username: str,
    content: str,
    message_type: str,
    channel_name: str,
    kinos_message_id: Optional[str] = None
) -> Optional[Dict]:
    """Persists a message to the Airtable MESSAGES table."""
    
    # Remove <think>...</think> tags from content before persisting
    cleaned_content = content
    if isinstance(content, str): # Ensure content is a string before regex
        cleaned_content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        if not cleaned_content and content: # If cleaning resulted in empty string but original had content
            log.warning(f"Message content from {sender_username} to {receiver_username} became empty after removing <think> tags. Original: '{content[:100]}...'")
            # Decide if an empty message should be stored or not. For now, let's store it if it was originally non-empty.
            # If you want to prevent storing empty messages after cleaning, you could return None here.
            # cleaned_content = "[Content removed due to <think> tags]" # Or some placeholder

    payload = {
        "Sender": sender_username,
        "Receiver": receiver_username,
        "Content": cleaned_content, # Use cleaned content
        "Type": message_type,
        "Channel": channel_name,
        "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
        # "ReadAt" will be null initially for the receiver
    }
    if kinos_message_id: # If Kinos provides a message ID, store it
        payload["Notes"] = json.dumps({"kinos_message_id": kinos_message_id})

    try:
        log.info(f"Persisting message from {sender_username} to {receiver_username} in channel {channel_name}.")
        created_record = tables['messages'].create(payload)
        log.info(f"Message persisted with Airtable ID: {created_record['id']}")
        return created_record
    except Exception as e:
        log.error(f"Failed to persist message from {sender_username} to {receiver_username}: {e}")
    return None


def make_kinos_channel_call(
    kinos_api_key: str,
    speaker_username: str, # This is the 'kin_id' for the Kinos API call
    channel_name: str,
    prompt: str,
    add_system_data: Optional[Dict] = None,
    kinos_model_override: Optional[str] = None
) -> Optional[str]: # Returns the AI's message content string or None
    """Makes a call to a specific Kinos Engine citizen-to-citizen channel."""
    kinos_url = f"{KINOS_API_CHANNEL_BASE_URL}/blueprints/{KINOS_BLUEPRINT_ID}/kins/{speaker_username}/channels/{channel_name}/messages"
    headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
    
    payload: Dict[str, Any] = {"content": prompt} # Changed "message" to "content" as per Compagno.tsx
    if add_system_data:
        try:
            payload["addSystem"] = json.dumps(add_system_data)
        except TypeError as te:
            log.error(f"Error serializing addSystem data for Kinos channel call: {te}. Sending without addSystem.")
    
    if kinos_model_override:
        payload["model"] = kinos_model_override
        log.info(f"Using Kinos model override '{kinos_model_override}' for channel call by {speaker_username}.")

    try:
        log.info(f"Sending request to Kinos channel {channel_name} for speaker {speaker_username}...")
        log.debug(f"Kinos Channel Prompt for {speaker_username} to {channel_name}: {prompt[:300]}...")
        if add_system_data:
            log.debug(f"Kinos Channel addSystem keys: {list(add_system_data.keys())}")

        response = requests.post(kinos_url, headers=headers, json=payload, timeout=DEFAULT_TIMEOUT_SECONDS)
        response.raise_for_status()
        
        # Kinos channel API directly returns the AI's message in the response to POST,
        # or we might need to fetch history if it works like the main kin endpoint.
        # Compagno.tsx suggests the POST response itself contains the message.
        kinos_response_data = response.json()

        # Expected structure from Compagno.tsx: { "message_id": "...", "content": "...", "role": "assistant", ... }
        # or { "id": "...", "content": "...", ... }
        ai_message_content = kinos_response_data.get("content")
        
        if ai_message_content:
            log.info(f"Received Kinos response from channel {channel_name} for speaker {speaker_username}. Length: {len(ai_message_content)}")
            # Log full raw response at INFO level
            log.info(f"{LogColors.LIGHTBLUE}Full Kinos raw response content from channel call by {speaker_username} to {channel_name}:\n{ai_message_content}{LogColors.ENDC}")
            return ai_message_content
        else:
            log.warning(f"Kinos response from channel {channel_name} for {speaker_username} missing 'content'. Response: {kinos_response_data}")
            return None

    except requests.exceptions.RequestException as e:
        log.error(f"Kinos API channel request error for {speaker_username} to {channel_name}: {e}", exc_info=True)
        if hasattr(e, 'response') and e.response is not None:
            log.error(f"Kinos error response content: {e.response.text[:500]}")
    except Exception as e:
        log.error(f"Error in make_kinos_channel_call for {speaker_username} to {channel_name}: {e}", exc_info=True)
    return None

# --- Main Conversation Turn Generator ---

def generate_conversation_turn(
    tables: Dict[str, Table],
    kinos_api_key: str,
    speaker_username: str,
    listener_username: str, # For reflection, this is the citizen being observed; for opener, the one being spoken to
    api_base_url: str,
    kinos_model_override: Optional[str] = None,
    max_history_messages: int = 5,
    interaction_mode: str = "conversation" # "conversation", "reflection", or "conversation_opener"
) -> Optional[Dict]:
    """
    Generates one turn of a conversation, an internal reflection, or a conversation opener.
    Persists the generated message/reflection and returns its Airtable record.
    """
    if interaction_mode == "reflection":
        log.info(f"Generating internal reflection for {speaker_username} about {listener_username}.")
    elif interaction_mode == "conversation_opener":
        log.info(f"Generating conversation opener from {speaker_username} to {listener_username}.")
    else: # conversation
        log.info(f"Generating conversation turn: Speaker: {speaker_username}, Listener: {listener_username}")

    # 1. Get Speaker and Listener (observed/spoken-to citizen) profiles
    speaker_profile_record = get_citizen_record(tables, speaker_username)
    listener_profile_record = get_citizen_record(tables, listener_username)

    if not speaker_profile_record or not listener_profile_record:
        log.error("Could not find profile for speaker or listener.")
        return None
    
    speaker_profile = speaker_profile_record['fields']
    listener_profile = listener_profile_record['fields']
    
    speaker_social_class = speaker_profile.get('SocialClass')
    speaker_current_point_id = speaker_profile.get('Point') # e.g., building_lat_lng_idx
    listener_current_point_id = listener_profile.get('Point')

    shared_building_name: Optional[str] = None
    shared_building_id: Optional[str] = None

    if speaker_current_point_id and speaker_current_point_id == listener_current_point_id:
        # Both are at the same point, try to get building details from this point ID
        # Assuming point ID might be the BuildingId or related to it.
        # A more robust way would be to parse BuildingId from Point if format is consistent,
        # or query buildings table by Point.
        # For now, let's assume Point ID can be used to fetch the building.
        # This might need adjustment based on how Point relates to BuildingId.
        # If Point is directly a BuildingId for single-point buildings:
        potential_building_id = speaker_current_point_id
        # A more robust lookup:
        # formula_building_at_point = f"OR({{Point}}='{_escape_airtable_value(speaker_current_point_id)}', CONTAINS({{Point}}, '{_escape_airtable_value(speaker_current_point_id)}'))"
        # For simplicity, if Point is often the BuildingId:
        
        # Attempt to fetch building by assuming Point might be the BuildingId
        # This is a simplification. A better approach would be to query buildings table
        # with a formula like CONTAINS({Point}, '{speaker_current_point_id}') if Point can be a list for larger buildings
        # or directly {Point} = '{speaker_current_point_id}' if it's always a single point ID.
        # For now, we'll try to use get_building_record with the point_id.
        # This assumes that for single-point buildings, Point might be the BuildingId.
        # Or, if Point is like "building_lat_lng_idx", and BuildingId is "building_lat_lng", this won't directly match.
        # A more reliable way is to fetch the building based on the citizen's current location if Point isn't directly the BuildingId.
        # Let's assume for now that if they are at the same Point, and that Point corresponds to a BuildingId:
        
        # We need a reliable way to get BuildingId from Point.
        # If Point is "building_lat_lng_idx", we need to find a building whose Point list contains this.
        # Or, if the citizen's Position is used, find the building at that position.
        # For now, let's try a direct lookup assuming Point might be a BuildingId for simple cases.
        # This part is tricky without knowing the exact relationship between Point and BuildingId.
        
        # Let's try to get the building by the speaker's Point field.
        # This assumes the Point field in CITIZENS refers to a BuildingId or a parsable building identifier.
        # A more robust solution would be to query the BUILDINGS table for a record where its Point field (or list of points)
        # matches the citizen's Point field.
        
        # Simplification: If Point is often the BuildingId for the building they are in.
        # This is a strong assumption.
        # A better way: Get speaker's current building based on their Position or a dedicated "CurrentBuilding" field if it existed.
        # For now, we'll try a direct lookup using the Point field as if it were a BuildingId.
        # This will likely fail if Point is not a direct BuildingId.
        
        # Let's refine: if speaker_current_point_id starts with "building_", it's likely a building point.
        # We need to find the building record that *contains* this point.
        # This is complex without iterating all buildings.
        # A simpler, but less accurate assumption: if their Point fields match AND start with "building_",
        # they are in *some* building together. We might not know its name without a proper lookup.

        # Let's assume `speaker_current_point_id` can be used with `get_building_record` if it's a BuildingId.
        # This is often NOT the case. `Point` in Citizen is usually more granular.
        # A better approach:
        # 1. Get speaker's position.
        # 2. Find building at that position.
        # 3. Check if listener is also at that building.

        speaker_pos_str = speaker_profile.get('Position')
        if speaker_pos_str:
            try:
                speaker_coords = json.loads(speaker_pos_str)
                # Find building at speaker's coords
                from backend.engine.utils.activity_helpers import get_closest_building_to_position # Local import
                current_building_rec = get_closest_building_to_position(tables, speaker_coords, max_distance_meters=10) # 10m tolerance

                if current_building_rec:
                    current_building_id = current_building_rec['fields'].get('BuildingId')
                    # Now check if listener is also at this building_id
                    listener_pos_str = listener_profile.get('Position')
                    if listener_pos_str:
                        listener_coords = json.loads(listener_pos_str)
                        listener_building_rec = get_closest_building_to_position(tables, listener_coords, max_distance_meters=10)
                        if listener_building_rec and listener_building_rec['fields'].get('BuildingId') == current_building_id:
                            shared_building_id = current_building_id
                            shared_building_name = current_building_rec['fields'].get('Name', current_building_id)
                            log.info(f"Speaker and Listener are both in building: {shared_building_name} (ID: {shared_building_id})")
            except Exception as e_shared_bldg:
                log.warning(f"Could not determine shared building: {e_shared_bldg}")

    # 2. Determine Kinos channel name
    channel_name = "_".join(sorted([speaker_username, listener_username]))

    # 3. Fetch context data for addSystem
    add_system_payload = {
        "speaker_profile": {
            "username": speaker_profile.get("Username"),
            "firstName": speaker_profile.get("FirstName"),
            "lastName": speaker_profile.get("LastName"),
            "socialClass": speaker_profile.get("SocialClass")
        },
        "listener_profile": {
            "username": listener_profile.get("Username"),
            "firstName": listener_profile.get("FirstName"),
            "lastName": listener_profile.get("LastName"),
            "socialClass": listener_profile.get("SocialClass")
        },
        "speaker_data_package": get_citizen_data_package(speaker_username, api_base_url) or {},
        "speaker_problems": get_citizen_problems_list(speaker_username, api_base_url),
        "listener_problems": get_citizen_problems_list(listener_username, api_base_url),
        "relationship_details": get_relationship_details(tables, speaker_username, listener_username) or {},
        "conversation_history": get_conversation_history(tables, channel_name, limit=max_history_messages)
    }

    # 4. Construct Kinos prompt
    location_context = ""
    if shared_building_name: # This implies they are in the same building
        location_context = f"You are both currently in {shared_building_name}. "
    elif speaker_current_point_id and listener_current_point_id and speaker_current_point_id == listener_current_point_id:
        # If point IDs match but building name couldn't be resolved, use a generic location.
        location_context = f"You are both currently at the same location (Point ID: {speaker_current_point_id}). "
    else: # Fallback if shared location is not confirmed (should ideally not happen if called from processEncounters correctly)
        location_context = ""


    if interaction_mode == "reflection":
        system_explanation = (
            f"[SYSTEM]You are {speaker_profile.get('FirstName', speaker_username)}, a {speaker_profile.get('SocialClass', 'citizen')} of Venice. "
            f"{location_context}You have noticed {listener_profile.get('FirstName', listener_username)} (Social Class: {listener_profile.get('SocialClass', 'unknown')}) is also here. "
            f"Review your knowledge in `addSystem` (your data package, problems, your relationship with them, their problems, and any recent direct conversation history with them). "
            f"What are your internal thoughts or observations about their presence and this encounter? Consider any opportunities, risks, or social implications. "
            f"Your response should be your internal monologue or reflection, not direct speech to them. "
            f"Keep it concise and focused on potential gameplay impact or character development.[/SYSTEM]\n\n"
        )
        prompt = system_explanation + f"{speaker_profile.get('FirstName', speaker_username)}'s internal thoughts about {listener_profile.get('FirstName', listener_username)}: "
    elif interaction_mode == "conversation_opener":
        system_explanation = (
            f"[SYSTEM]You are {speaker_profile.get('FirstName', speaker_username)}, a {speaker_profile.get('SocialClass', 'citizen')} of Venice. "
            f"{location_context}You see {listener_profile.get('FirstName', listener_username)} (Social Class: {listener_profile.get('SocialClass', 'unknown')}) here. "
            f"Review your knowledge in `addSystem` (your data package, problems, your relationship with them, their problems, and any recent direct conversation history with them). "
            f"What would you say to them to initiate a conversation or make an observation? "
            f"Your response should be direct speech TO {listener_profile.get('FirstName', listener_username)}. "
            f"Keep it concise, in character, and relevant to your current situation or relationship.[/SYSTEM]\n\n"
        )
        # No conversation history for an opener
        prompt = system_explanation + f"{speaker_profile.get('FirstName', speaker_username)} (you) to {listener_profile.get('FirstName', listener_username)}: "
    else: # "conversation" mode (replying in an existing conversation)
        system_explanation = (
            f"[SYSTEM]You are {speaker_profile.get('FirstName', speaker_username)}, a {speaker_profile.get('SocialClass', 'citizen')} of Venice. "
            f"You are currently in conversation with {listener_profile.get('FirstName', listener_username)}. {location_context}"
            f"Review your knowledge in `addSystem` (your data package, problems, relationship, listener's problems, and recent conversation history). "
            f"Answer naturally in English, keeping your persona and objectives in mind. Your response should be direct speech.[/SYSTEM]\n\n"
        )
        # History part for conversation mode
        history_prompt_part = ""
        if add_system_payload["conversation_history"]:
            history_prompt_part += "PREVIOUS MESSAGES IN THIS CONVERSATION (most recent last):\n"
            for msg_fields in add_system_payload["conversation_history"]: # Iterate over fields directly
                sender = msg_fields.get('Sender', 'Unknown')
                content = msg_fields.get('Content', '')
                history_prompt_part += f"{sender}: {content}\n"
            history_prompt_part += "\n"
        prompt = system_explanation + history_prompt_part + f"{speaker_profile.get('FirstName', speaker_username)} (you): "

    # 5. Determine Kinos model
    effective_kinos_model = kinos_model_override or get_kinos_model_for_social_class(speaker_username, speaker_social_class)

    # 6. Call Kinos Engine
    ai_message_content = make_kinos_channel_call(
        kinos_api_key,
        speaker_username, # speaker_username is the kin_id
        channel_name,
        prompt,
        add_system_payload,
        effective_kinos_model
    )

    if not ai_message_content:
        log.error(f"Kinos failed to generate a message for {speaker_username} to {listener_username}.")
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
        channel_name=channel_name # Channel remains the pair for context, type differentiates
    )

    if persisted_message_record:
        if interaction_mode == "reflection":
            log.info(f"Successfully generated and persisted reflection from {speaker_username} about {listener_username}.")
        elif interaction_mode == "conversation_opener":
            log.info(f"Successfully generated and persisted conversation opener from {speaker_username} to {listener_username}.")
        else: # conversation
            log.info(f"Successfully generated and persisted conversation turn from {speaker_username}.")
        return persisted_message_record # Return the full Airtable record
    else:
        log.error(f"Failed to persist Kinos message from {speaker_username}.")
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
        interaction_mode="conversation" # Explicitly "conversation" for this example
        # kinos_model_override="local" # Optional: force a model
    )

    if new_message_record:
        log.info(f"Conversation turn/reflection generated and saved. Message ID: {new_message_record.get('id')}")
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
