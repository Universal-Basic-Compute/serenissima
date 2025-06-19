import logging
import json
import os
import requests
import threading
from typing import Dict, Any, Optional

from backend.engine.utils.activity_helpers import LogColors, VENICE_TIMEZONE # Keep VENICE_TIMEZONE if used for logging timestamps

log = logging.getLogger(__name__)

# KinOS constants
KINOS_API_URL = "https://api.kinos-engine.ai" # Always use production KinOS API
KINOS_BLUEPRINT = "serenissima-ai"
KINOS_API_KEY = os.getenv("KINOS_API_KEY")

def _get_artwork_content_from_kinos(citizen_username: str, artwork_path: str) -> Optional[str]:
    """Fetches the content of a specific artwork file from KinOS."""
    if not KINOS_API_KEY:
        log.error(f"  [Thread: {threading.get_ident()}] KINOS_API_KEY not set. Cannot fetch artwork content.")
        return None
    
    # The KinOS path for content is relative to the kin's root.
    # artwork_path from get-artworks is already the full path like "AI-memories/art/file.md"
    kinos_file_content_url = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{citizen_username}/files/{artwork_path}"
    
    log.info(f"  [Thread: {threading.get_ident()}] Fetching artwork content for {citizen_username} from KinOS: {kinos_file_content_url}")
    try:
        response = requests.get(
            kinos_file_content_url,
            headers={'Authorization': f'Bearer {KINOS_API_KEY}'},
            timeout=20
        )
        response.raise_for_status()
        # KinOS /files/{path} endpoint returns the raw file content directly
        return response.text
    except requests.exceptions.RequestException as e:
        log.error(f"  [Thread: {threading.get_ident()}] Error fetching artwork content '{artwork_path}' for {citizen_username} from KinOS: {e}")
        if hasattr(e, 'response') and e.response is not None:
            log.error(f"  [Thread: {threading.get_ident()}] KinOS response (artwork content): {e.response.text[:200]}")
        return None
    except Exception as e_gen:
        log.error(f"  [Thread: {threading.get_ident()}] Unexpected error fetching artwork content '{artwork_path}' for {citizen_username}: {e_gen}")
        return None


def _call_kinos_build_for_reading_async(
    kinos_build_url: str,
    kinos_payload: Dict[str, Any],
    tables: Dict[str, Any],
    activity_id_airtable: str,
    activity_guid_log: str,
    original_activity_notes_dict: Dict[str, Any], # Pass parsed notes
    citizen_username_log: str
):
    """
    Makes the KinOS /build API call for reading reflection and updates activity notes.
    This function is intended to be run in a separate thread.
    """
    log.info(f"  [Thread: {threading.get_ident()}] Calling KinOS /build for reading reflection by {citizen_username_log} at {kinos_build_url}")
    try:
        kinos_response = requests.post(kinos_build_url, json=kinos_payload, timeout=120) # Increased timeout
        kinos_response.raise_for_status()
        
        kinos_response_data = kinos_response.json()
        log.info(f"  [Thread: {threading.get_ident()}] KinOS /build (reading) response for {citizen_username_log}: Status: {kinos_response_data.get('status')}, Response: {kinos_response_data.get('response')}")
        
        # Update the original notes dictionary with the KinOS reflection
        original_activity_notes_dict['kinos_reflection'] = kinos_response_data.get('response', "No reflection content from KinOS.")
        original_activity_notes_dict['kinos_reflection_status'] = kinos_response_data.get('status', 'unknown')
        
        new_notes_json = json.dumps(original_activity_notes_dict)

        try:
            tables['activities'].update(activity_id_airtable, {'Notes': new_notes_json})
            log.info(f"  [Thread: {threading.get_ident()}] Updated activity notes with KinOS reading reflection for {activity_guid_log}.")
        except Exception as e_airtable_update:
            log.error(f"  [Thread: {threading.get_ident()}] Error updating Airtable notes for activity {activity_guid_log} (reading reflection): {e_airtable_update}")
            
    except requests.exceptions.RequestException as e_kinos:
        log.error(f"  [Thread: {threading.get_ident()}] Error calling KinOS /build (reading) for {citizen_username_log}: {e_kinos}")
    except json.JSONDecodeError as e_json_kinos:
        kinos_response_text_preview = kinos_response.text[:200] if 'kinos_response' in locals() and hasattr(kinos_response, 'text') else 'N/A'
        log.error(f"  [Thread: {threading.get_ident()}] Error decoding KinOS /build (reading) JSON response for {citizen_username_log}: {e_json_kinos}. Response text: {kinos_response_text_preview}")
    except Exception as e_thread:
        log.error(f"  [Thread: {threading.get_ident()}] Unexpected error in KinOS call thread for reading reflection by {citizen_username_log}: {e_thread}")


def process_read_book_fn(
    tables: Dict[str, Any], 
    activity_record: Dict[str, Any], 
    building_type_defs: Dict[str, Any], 
    resource_defs: Dict[str, Any],
    api_base_url: Optional[str] = None # Added api_base_url
) -> bool:
    """
    Processes a 'read_book' activity.
    This involves calling the KinOS /build endpoint asynchronously to simulate the citizen reflecting on the book.
    """
    activity_id_airtable = activity_record['id']
    activity_guid = activity_record['fields'].get('ActivityId', activity_id_airtable)
    citizen_username = activity_record['fields'].get('Citizen')
    
    # Use passed api_base_url or fallback to environment variable
    current_api_base_url = api_base_url or os.getenv("API_BASE_URL", "http://localhost:3000")

    notes_str = activity_record['fields'].get('Notes', '{}')
    try:
        notes_dict = json.loads(notes_str)
    except json.JSONDecodeError:
        log.warning(f"{LogColors.WARNING}[Read Book Proc] Activity {activity_guid} has invalid JSON in Notes: {notes_str}. Cannot process KinOS reflection.{LogColors.ENDC}")
        return True # Mark as processed to avoid re-processing, but KinOS part is skipped.

    book_title = notes_dict.get('book_title', 'an unknown book')
    book_kinos_path = notes_dict.get('book_kinos_path') # This should be set by production_processor if book has artwork
    
    log.info(f"{LogColors.PROCESS}Processing 'read_book' activity {activity_guid} for citizen {citizen_username} reading '{book_title}'.{LogColors.ENDC}")

    if not KINOS_API_KEY:
        log.error(f"{LogColors.FAIL}KINOS_API_KEY not set. Cannot trigger KinOS reflection for 'read_book' activity {activity_guid}.{LogColors.ENDC}")
        return True # Mark as processed, KinOS part skipped.

    try:
        # 1. Fetch citizen's ledger for KinOS addSystem
        ledger_url = f"{current_api_base_url}/api/get-ledger?citizenUsername={citizen_username}"
        ledger_json_str = None
        try:
            ledger_response = requests.get(ledger_url, timeout=15)
            if ledger_response.ok:
                ledger_data = ledger_response.json()
                if ledger_data.get("success"):
                    ledger_json_str = json.dumps(ledger_data.get("data"))
                    log.info(f"  Successfully fetched ledger for {citizen_username} for reading reflection.")
                else:
                    log.warning(f"  Failed to fetch ledger for {citizen_username} (reading): {ledger_data.get('error')}")
            else:
                log.warning(f"  HTTP error fetching ledger for {citizen_username} (reading): {ledger_response.status_code}")
        except requests.exceptions.RequestException as e_pkg:
            log.error(f"  Error fetching ledger for {citizen_username} (reading): {e_pkg}")
        except json.JSONDecodeError as e_json_pkg:
            log.error(f"  Error decoding ledger JSON for {citizen_username} (reading): {e_json_pkg}")

        # 2. Fetch artwork content if path is available
        artwork_content_for_kinos = None
        if book_kinos_path:
            log.info(f"  Book has KinOS path: {book_kinos_path}. Attempting to fetch content.")
            artwork_content_for_kinos = _get_artwork_content_from_kinos(citizen_username, book_kinos_path)
            if artwork_content_for_kinos:
                log.info(f"  Successfully fetched content for artwork '{book_title}' from KinOS path {book_kinos_path}.")
            else:
                log.warning(f"  Failed to fetch content for artwork '{book_title}' from KinOS path {book_kinos_path}. Proceeding without book content in add System.")
        else:
            log.info(f"  Book '{book_title}' does not have a specific KinOS path in activity notes. Reflection will be more general.")

        # 3. Construct KinOS /build request
        kinos_build_url = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{citizen_username}/messages"
        
        # Updated KinOS prompt to reflect new addSystem structure
        kinos_prompt = (
            f"You are {citizen_username}, a citizen of Renaissance Venice. You have just spent some time reading a book titled '{book_title}'. "
            f"The book's content (if available) and your personal data are provided in your Ledger under `book_context` and `ledger` respectively.\n\n"
            f"Reflect on what you have read. Consider the following:\n"
            f"- What were the main ideas or themes of the book (see content)?\n"
            f"- Did anything in the book particularly resonate with you, challenge your views, or inspire you?\n"
            f"- How might the insights or knowledge gained from this book influence your thoughts, decisions, or actions in the near future regarding your life, work, relationships, or ambitions in Venice (refer to your Ledger)?\n\n"
            f"Your reflection should be personal and introspective. Use your current situation, goals, and personality (detailed in your Ledger) to contextualize your thoughts on the book."
        )
        
        # Initialize the structured addSystem payload
        structured_add_system_payload: Dict[str, Any] = {
            "ledger": None,
            "book_context": {
                "title": book_title,
                "content": "Content not available or this is a generic book." # Default content
            }
        }
        if ledger_json_str:
            try:
                structured_add_system_payload["ledger"] = json.loads(ledger_json_str)
            except json.JSONDecodeError:
                log.error("  Failed to parse ledger_json_str for ledger. ledger will be incomplete.")
                structured_add_system_payload["ledger"] = {"error_parsing_ledger": True, "status": "unavailable"}
        else:
            structured_add_system_payload["ledger"] = {"status": "unavailable_no_ledger_fetched"}

        if artwork_content_for_kinos:
            structured_add_system_payload["book_context"]["content"] = artwork_content_for_kinos
        
        kinos_payload_dict: Dict[str, Any] = {
            "message": kinos_prompt,
            "model": "local", # Or choose model based on citizen class/task
            "addSystem": json.dumps(structured_add_system_payload) # Stringify the new structured payload
        }
        
        # 4. Start KinOS call in a new thread
        log.info(f"  Initiating asynchronous KinOS /build call for reading reflection by {citizen_username} to {kinos_build_url}")
        
        kinos_thread = threading.Thread(
            target=_call_kinos_build_for_reading_async,
            args=(kinos_build_url, kinos_payload_dict, tables, activity_id_airtable, activity_guid, notes_dict, citizen_username)
        )
        kinos_thread.start()
        
        log.info(f"  KinOS /build call for reading reflection by {citizen_username} started in background thread {kinos_thread.ident}.")

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error during 'read_book' processing setup for {activity_guid}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return False # Failure in setting up the async call

    log.info(f"{LogColors.SUCCESS}Successfully initiated asynchronous KinOS reflection for 'read_book' activity {activity_guid}.{LogColors.ENDC}")
    return True # The main processing is considered successful if the async KinOS call is initiated.
