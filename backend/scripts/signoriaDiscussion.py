import os
import sys
import json
import re # Ajout de l'import re
import random # Ajout de l'import random
import requests
import argparse
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv
from pyairtable import Api as AirtableApi
from pyairtable import Table as AirtableTable

# Adjust sys.path to import utility modules
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

try:
    from backend.engine.utils.activity_helpers import LogColors
except ImportError:
    # Basic LogColors if import fails (e.g., script run standalone without PYTHONPATH)
    class LogColors:
        HEADER = '\033[95m'
        OKBLUE = '\033[94m'
        OKCYAN = '\033[96m'
        OKGREEN = '\033[92m'
        WARNING = '\033[93m'
        FAIL = '\033[91m'
        ENDC = '\033[0m'
        BOLD = '\033[1m'
        UNDERLINE = '\033[4m'

# --- Configuration ---
DEFAULT_KINOS_API_BASE_URL = "https://api.kinos-engine.ai"
DEFAULT_KINOS_BLUEPRINT_ID = "serenissima-ai"
SIGNORIA_CHANNEL_ID = "signoria"
DEFAULT_KINOS_MODEL = "local"

# --- Helper Functions ---

def initialize_airtable() -> Optional[Dict[str, AirtableTable]]:
    """Initializes connection to Airtable and returns table objects."""
    load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        print(f"{LogColors.FAIL}Error: Airtable API Key or Base ID not found in .env file.{LogColors.ENDC}")
        return None
    try:
        api = AirtableApi(airtable_api_key)
        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "messages": api.table(airtable_base_id, "MESSAGES"),
            "relationships": api.table(airtable_base_id, "RELATIONSHIPS"),
        }
        print(f"{LogColors.OKGREEN}Airtable connection initialized (Citizens, Messages, Relationships).{LogColors.ENDC}")
        return tables
    except Exception as e:
        print(f"{LogColors.FAIL}Error initializing Airtable: {e}{LogColors.ENDC}")
        return None

def get_kinos_api_key() -> Optional[str]:
    """Retrieves the Kinos API key from environment variables."""
    load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print(f"{LogColors.FAIL}Error: KINOS_API_KEY not found in .env file.{LogColors.ENDC}")
    return api_key

def _escape_airtable_value(value: Any) -> str:
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

# --- Kinos API Interaction ---
KINOS_ENGINE_API_BASE_URL = os.getenv("KINOS_ENGINE_API_BASE_URL", "https://api.kinos-engine.ai") # For Kinos Engine specific calls if any
NEXT_PUBLIC_BASE_URL = os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000") # For Next.js API calls like get-data-package

def _get_data_package_for_citizen(username: str) -> Optional[Dict]:
    """Fetches the data package for a citizen using the Next.js API."""
    try:
        # Use NEXT_PUBLIC_BASE_URL for this API call
        api_url = f"{NEXT_PUBLIC_BASE_URL}/api/get-data-package?citizenUsername={username}"
        print(f"  Fetching data package for {username} from {api_url}...")
        response = requests.get(api_url, timeout=45) # Increased timeout
        response.raise_for_status()
        
        data = response.json()
        # Assuming the API returns the package directly on success
        # If it's wrapped, e.g., {"success": true, "data": {...}}, adjust accordingly
        print(f"  Successfully fetched data package for {username}.")
        return data
    except requests.exceptions.RequestException as e:
        print(f"  {LogColors.FAIL}API Error fetching data package for {username}: {e}{LogColors.ENDC}")
        return None
    except json.JSONDecodeError:
        print(f"  {LogColors.FAIL}Failed to decode JSON response for data package of {username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return None
    except Exception as e:
        print(f"  {LogColors.FAIL}Unexpected error fetching data package for {username}: {e}{LogColors.ENDC}")
        return None

def _get_relationship_data(tables: Dict[str, AirtableTable], username1: str, username2: str) -> Optional[Dict[str, Any]]:
    """Fetches relationship data between two citizens from Airtable."""
    # Ensure usernames are ordered alphabetically for consistent querying
    # Airtable stores Citizen1 as the alphabetically first username.
    c1_escaped, c2_escaped = sorted([_escape_airtable_value(username1), _escape_airtable_value(username2)])
    
    formula = f"AND({{Citizen1}}='{c1_escaped}', {{Citizen2}}='{c2_escaped}')"
    try:
        records = tables["relationships"].all(formula=formula, max_records=1)
        if records:
            fields = records[0]['fields']
            # Return a dictionary with the relevant relationship fields
            return {
                "Citizen1": fields.get("Citizen1"), # This will be c1_escaped
                "Citizen2": fields.get("Citizen2"), # This will be c2_escaped
                "Title": fields.get("Title"),
                "StrengthScore": fields.get("StrengthScore"),
                "TrustScore": fields.get("TrustScore")
            }
        return None # No relationship record found
    except Exception as e:
        print(f"  {LogColors.FAIL}Error fetching relationship between {username1} and {username2}: {e}{LogColors.ENDC}")
        return None

def get_signoria_members(tables: Dict[str, AirtableTable], nlr_username: str = "NLR") -> List[Dict]:
    """Fetches citizens, determines Signoria (top 9 by influence + NLR), sorted by influence."""
    try:
        all_citizens_raw = tables["citizens"].all()
        all_citizens = [
            {
                "id": rec["id"],
                "username": rec["fields"].get("Username"),
                "influence": float(rec["fields"].get("Influence", 0.0) or 0.0), # Ensure float, default 0
                "fields": rec["fields"]  # Store all fields from Airtable
            }
            for rec in all_citizens_raw if rec["fields"].get("Username")
        ]

        # Sort by influence descending
        all_citizens.sort(key=lambda x: x["influence"], reverse=True)

        top_9 = all_citizens[:9]
        signoria_members = top_9[:] # Make a copy

        nlr_member_data = None
        nlr_in_top_9 = any(member["username"] == nlr_username for member in top_9)

        if not nlr_in_top_9:
            for citizen in all_citizens:
                if citizen["username"] == nlr_username:
                    nlr_member_data = citizen
                    break
            if nlr_member_data:
                signoria_members.append(nlr_member_data)
                # Re-sort if NLR was added and might disrupt order (though unlikely if top 9 is small)
                signoria_members.sort(key=lambda x: x["influence"], reverse=True)
            else:
                print(f"{LogColors.WARNING}Citizen {nlr_username} not found. Signoria will consist of top 9.{LogColors.ENDC}")
        
        # Ensure NLR is first if present, then sort by influence for the rest
        final_signoria = []
        nlr_found_for_final_list = False
        for member in signoria_members:
            if member["username"] == nlr_username:
                final_signoria.insert(0, member) # NLR always first
                nlr_found_for_final_list = True
                break
        
        # Add others, sorted by influence
        other_members = [m for m in signoria_members if m["username"] != nlr_username]
        other_members.sort(key=lambda x: x["influence"], reverse=True)
        final_signoria.extend(other_members)

        # If NLR was not in the initial signoria_members list (e.g. not in top 9 and not found separately)
        # This ensures if NLR was not found at all, we don't add a placeholder.
        if not nlr_found_for_final_list and nlr_member_data and nlr_username not in [m['username'] for m in final_signoria] :
             # This case should be rare if logic above is correct, but as a safeguard
             final_signoria.insert(0, nlr_member_data)


        print(f"{LogColors.OKCYAN}Signoria Members ({len(final_signoria)}):{LogColors.ENDC}")
        for i, member in enumerate(final_signoria):
            # Access FirstName and LastName from the 'fields' dictionary
            display_name = f"{member['fields'].get('FirstName', '')} {member['fields'].get('LastName', '')}".strip() or member['username']
            # Initial log before shuffling will show NLR first then by influence
            # print(f"  {i+1}. {display_name} (Influence: {member['influence']}) - Pre-shuffle order")

        # Randomize the talking order of the final list
        random.shuffle(final_signoria)
        print(f"{LogColors.OKCYAN}Signoria Members (Order of Speech Randomized - {len(final_signoria)}):{LogColors.ENDC}")
        for i, member in enumerate(final_signoria):
            display_name = f"{member['fields'].get('FirstName', '')} {member['fields'].get('LastName', '')}".strip() or member['username']
            print(f"  {i+1}. {display_name} (Influence: {member['influence']})")
            
        return final_signoria

    except Exception as e:
        print(f"{LogColors.FAIL}Error fetching or processing Signoria members: {e}{LogColors.ENDC}")
        return []

def add_message_to_kin_channel(
    kinos_api_key: str,
    kin_id: str,
    message_content: str,
    role: str = "user",
    metadata: Optional[Dict] = None,
    kinos_api_base_url: str = DEFAULT_KINOS_API_BASE_URL,
    blueprint_id: str = DEFAULT_KINOS_BLUEPRINT_ID
) -> bool:
    """Adds a message to a Kin's specific channel using Kinos API."""
    url = f"{kinos_api_base_url}/v2/blueprints/{blueprint_id}/kins/{kin_id}/channels/{SIGNORIA_CHANNEL_ID}/add-message"
    headers = {
        "Authorization": f"Bearer {kinos_api_key}",
        "Content-Type": "application/json"
    }
    payload = {"message": message_content, "role": role}
    if metadata:
        payload["metadata"] = metadata

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        resp_data = response.json()
        if resp_data.get("status") == "success":
            print(f"  {LogColors.OKGREEN}Added message to {kin_id}'s '{SIGNORIA_CHANNEL_ID}' channel.{LogColors.ENDC}")
            return True
        else:
            print(f"  {LogColors.FAIL}Failed to add message to {kin_id}'s channel: {resp_data.get('message')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"  {LogColors.FAIL}API Error adding message to {kin_id}'s channel: {e}{LogColors.ENDC}")
        return False

def send_message_to_kin_channel(
    kinos_api_key: str,
    kin_id: str,
    prompt_content: str,
    model: str = DEFAULT_KINOS_MODEL,
    add_system_content: Optional[str] = None, # New parameter for system context
    kinos_api_base_url: str = DEFAULT_KINOS_API_BASE_URL,
    blueprint_id: str = DEFAULT_KINOS_BLUEPRINT_ID
) -> Optional[str]:
    """Sends a message to a Kin's channel and gets a response using Kinos API."""
    url = f"{kinos_api_base_url}/v2/blueprints/{blueprint_id}/kins/{kin_id}/channels/{SIGNORIA_CHANNEL_ID}/messages"
    headers = {
        "Authorization": f"Bearer {kinos_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "content": prompt_content,
        "model": model,
    }
    if add_system_content:
        payload["addSystem"] = add_system_content
        print(f"  {LogColors.OKCYAN}Sending prompt to {kin_id} with system context (Model: {model})...{LogColors.ENDC}")
    else:
        print(f"  {LogColors.OKCYAN}Sending prompt to {kin_id} (Model: {model})...{LogColors.ENDC}")
    
    # For debugging the payload being sent
    # print(f"Payload for Kinos: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=300) # 5 min timeout for AI response
        response.raise_for_status()
        resp_data = response.json()
        if resp_data.get("status") == "completed" and "content" in resp_data:
            print(f"  {LogColors.OKGREEN}Received response from {kin_id}.{LogColors.ENDC}")
            content = resp_data["content"]
            
            # Supprimer les balises <think>...</think>
            content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
            
            # Remplacer les \\n littéraux par de vrais sauts de ligne
            content = content.replace('\\n', '\n')
            
            # Nettoyer les espaces en début/fin
            content = content.strip()
            
            # Supprimer les guillemets en début/fin si présents
            if content.startswith('"') and content.endswith('"'):
                content = content[1:-1].strip()
            
            return content
        else:
            print(f"  {LogColors.FAIL}Kinos API did not return a successful response or content for {kin_id}: {resp_data}{LogColors.ENDC}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"  {LogColors.FAIL}API Error sending message to {kin_id}'s channel: {e}{LogColors.ENDC}")
        return None
    except Exception as e:
        print(f"  {LogColors.FAIL}Unexpected error sending/receiving message for {kin_id}: {e}{LogColors.ENDC}")
        return None


def create_airtable_message_record(
    tables: Dict[str, AirtableTable],
    sender_username: str,
    receiver_username: str, # Special value like "SignoriaCouncil"
    content: str,
    message_type: str
) -> bool:
    """Creates a message record in Airtable."""
    try:
        message_id = f"sig_disc_{sender_username}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        created_at_iso = datetime.now(timezone.utc).isoformat()

        payload = {
            "MessageId": message_id,
            "Sender": sender_username,
            "Receiver": receiver_username,
            "Content": content,
            "Type": message_type,
            "CreatedAt": created_at_iso,
            "ReadAt": created_at_iso # Mark as read immediately for council messages
            # "UpdatedAt" is typically handled automatically by Airtable and should not be set manually.
        }
        tables["messages"].create(payload)
        print(f"  {LogColors.OKGREEN}Recorded message from {sender_username} to {receiver_username} in Airtable (ID: {message_id}).{LogColors.ENDC}")
        return True
    except Exception as e:
        print(f"  {LogColors.FAIL}Error creating Airtable message record for {sender_username}: {e}{LogColors.ENDC}")
        return False

def main(kinos_model: str, kinos_api_url: str, kinos_blueprint: str):
    """Main function to run the Signoria discussion script."""
    print(f"{LogColors.HEADER}--- Signoria Discussion Simulation ---{LogColors.ENDC}")

    airtable_tables = initialize_airtable()
    kinos_key = get_kinos_api_key()

    if not airtable_tables or not kinos_key:
        print(f"{LogColors.FAIL}Exiting due to missing Airtable or Kinos configuration.{LogColors.ENDC}")
        return

    signoria_members = get_signoria_members(airtable_tables)
    if not signoria_members:
        print(f"{LogColors.FAIL}No Signoria members found. Exiting.{LogColors.ENDC}")
        return

    print(f"\n{LogColors.BOLD}Starting discussion round...{LogColors.ENDC}")

    for speaker_info in signoria_members:
        speaker_username = speaker_info["username"]
        # Construct display_name from fields within speaker_info
        speaker_display_name = f"{speaker_info['fields'].get('FirstName', '')} {speaker_info['fields'].get('LastName', '')}".strip() or speaker_username
        
        print(f"\n{LogColors.HEADER}--- Next Speaker: {speaker_display_name} ({speaker_username}) ---{LogColors.ENDC}")

        # Doge's Comment
        try:
            doge_comment = input(f"{LogColors.OKBLUE}Doge's Comment (press Enter to skip): {LogColors.ENDC}")
            if doge_comment.strip():
                print(f"{LogColors.OKCYAN}Broadcasting Doge's comment to all Signoria members...{LogColors.ENDC}")
                doge_message_content = f"Doge's Comment: {doge_comment.strip()}"
                for member in signoria_members:
                    add_message_to_kin_channel(
                        kinos_key, member["username"], doge_message_content, role="system",
                        kinos_api_base_url=kinos_api_url, blueprint_id=kinos_blueprint
                    )
        except EOFError: # Handle Ctrl+D or piped input ending
            print(f"{LogColors.WARNING}\nEOF detected. Ending discussion.{LogColors.ENDC}")
            break
        except KeyboardInterrupt:
            print(f"{LogColors.WARNING}\nDiscussion interrupted by user. Exiting.{LogColors.ENDC}")
            break


        # Speaker's Turn
        prompt = (
            f"Signore/Signora {speaker_display_name}, the Signoria awaits your words. "
            f"What are your thoughts on the current situation in Venice, and what priorities do you suggest for the Republic's future?"
        )

        # Prepare system context for the Kinos API
        speaker_data_package = _get_data_package_for_citizen(speaker_username)
        current_speaker_profile_data = {
            "username": speaker_info["username"],
            "influence": speaker_info["influence"],
            "profile_fields": speaker_info["fields"], # Full profile fields
            "data_package": speaker_data_package # Data package for the current speaker
        }

        all_member_profiles_data = []
        for m in signoria_members:
            # Only include full profile fields, not the detailed data_package for non-speakers
            all_member_profiles_data.append({
                "username": m["username"],
                "influence": m["influence"],
                "profile_fields": m["fields"] # Full profile fields for all members
            })

        signoria_relationships_list = []
        member_usernames_for_rels = [m['username'] for m in signoria_members]
        for i in range(len(member_usernames_for_rels)):
            for j in range(i + 1, len(member_usernames_for_rels)):
                user1 = member_usernames_for_rels[i]
                user2 = member_usernames_for_rels[j]
                rel_data = _get_relationship_data(airtable_tables, user1, user2)
                if rel_data:
                    signoria_relationships_list.append(rel_data)
        
        system_context_data = {
            "discussion_context": (
                "You are a member of the Signoria, Venice's highest council, composed of 10 influential figures including yourself. "
                "You are currently in a formal discussion session. The Doge (human user) may provide comments between speakers. "
                "You are expected to speak thoughtfully on matters of state, considering your relationships with other members and the overall political climate. "
                "Your response should be concise and directly address the Doge's prompt.\n"
                "Contextual Data Guide:\n"
                "- 'current_speaker_profile': Your detailed profile, including your 'data_package' (inventory, buildings, etc.).\n"
                "- 'all_signoria_member_profiles': Profiles of all Signoria members present (does NOT include their detailed 'data_package' unless they are the current speaker).\n"
                "- 'signoria_relationships': Details on relationships between Signoria members."
            ),
            "current_speaker_profile": current_speaker_profile_data, # Includes data_package
            "all_signoria_member_profiles": all_member_profiles_data, # Does not include data_package for non-speakers
            "signoria_relationships": signoria_relationships_list
        }
        add_system_json = json.dumps(system_context_data)
        
        ai_response = send_message_to_kin_channel(
            kinos_key, 
            speaker_username, 
            prompt, 
            model=kinos_model,
            add_system_content=add_system_json, # Pass the system context
            kinos_api_base_url=kinos_api_url, 
            blueprint_id=kinos_blueprint
        )

        if ai_response:
            print(f"\n{LogColors.BOLD}{speaker_display_name} says:{LogColors.ENDC}\n{ai_response}\n")

            # Broadcast response to other members
            print(f"{LogColors.OKCYAN}Broadcasting {speaker_display_name}'s response to other Signoria members...{LogColors.ENDC}")
            broadcast_message_content = f"{speaker_display_name} says: {ai_response}"
            for member in signoria_members:
                if member["username"] != speaker_username:
                    add_message_to_kin_channel(
                        kinos_key, member["username"], broadcast_message_content, role="user",
                        metadata={"speaker_username": speaker_username},
                        kinos_api_base_url=kinos_api_url, blueprint_id=kinos_blueprint
                    )
            
            # Record response in Airtable
            create_airtable_message_record(
                airtable_tables,
                sender_username=speaker_username,
                receiver_username="SignoriaCouncil", # Special receiver
                content=ai_response,
                message_type="signoria_discussion_statement"
            )
        else:
            print(f"{LogColors.WARNING}{speaker_display_name} did not provide a response.{LogColors.ENDC}")
        
        try:
            if speaker_info != signoria_members[-1]: # Not the last speaker
                 input(f"{LogColors.OKBLUE}Press Enter to continue to the next speaker...{LogColors.ENDC}")
        except EOFError:
            print(f"{LogColors.WARNING}\nEOF detected. Ending discussion.{LogColors.ENDC}")
            break
        except KeyboardInterrupt:
            print(f"{LogColors.WARNING}\nDiscussion interrupted by user. Exiting.{LogColors.ENDC}")
            break


    print(f"\n{LogColors.HEADER}--- Signoria Discussion Ended ---{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Interactive Signoria Discussion Simulation Script.")
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_KINOS_MODEL,
        help=f"Kinos model to use for AI responses (default: {DEFAULT_KINOS_MODEL})."
    )
    parser.add_argument(
        "--kinos_url",
        type=str,
        default=os.getenv("KINOS_API_BASE_URL", DEFAULT_KINOS_API_BASE_URL),
        help=f"Kinos API base URL (default: {os.getenv('KINOS_API_BASE_URL', DEFAULT_KINOS_API_BASE_URL)})."
    )
    parser.add_argument(
        "--blueprint",
        type=str,
        default=os.getenv("KINOS_BLUEPRINT_ID", DEFAULT_KINOS_BLUEPRINT_ID),
        help=f"Kinos Blueprint ID (default: {os.getenv('KINOS_BLUEPRINT_ID', DEFAULT_KINOS_BLUEPRINT_ID)})."
    )
    args = parser.parse_args()

    main(kinos_model=args.model, kinos_api_url=args.kinos_url, kinos_blueprint=args.blueprint)
