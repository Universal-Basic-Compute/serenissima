#!/usr/bin/env python3
"""
Generates strategic thoughts for AI citizens using the Kinos Engine.

This script iterates through AI citizens, gathers contextual data,
prompts the Kinos AI to generate a paragraph of thoughts and select a single actionable thought,
then extracts and logs this chosen thought.
"""

import os
import sys
import json
import re
import argparse
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Base, Table

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import shared utilities
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, _escape_airtable_value, get_venice_time_now

# Configuration
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
KINOS_BLUEPRINT_ID = "serenissima-ai"
KINOS_CHANNEL_THOUGHTS = "thoughts"

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("generatethoughts")

class LogColors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# --- Airtable and API Key Initialization ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initializes connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Airtable credentials not found in environment variables.{LogColors.ENDC}")
        return None
    try:
        api = Api(airtable_api_key)
        base = Base(api, airtable_base_id)
        tables = {
            "citizens": base.table("CITIZENS"),
            "notifications": base.table("NOTIFICATIONS"),
            "messages": base.table("MESSAGES"),
            "buildings": base.table("BUILDINGS"),
            "lands": base.table("LANDS"),
            "resources": base.table("RESOURCES"),
            "contracts": base.table("CONTRACTS")
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized with all required tables.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

def get_kinos_api_key() -> Optional[str]:
    """Retrieves the Kinos API key from environment variables."""
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        log.error(f"{LogColors.FAIL}Kinos API key (KINOS_API_KEY) not found in environment variables.{LogColors.ENDC}")
    return api_key

# --- Context Data Fetching Functions (via Next.js API) ---

def _get_citizen_data_api(username: str) -> Optional[Dict]:
    """Fetches citizen data via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/citizens/{username}"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and data.get("citizen"):
            return data["citizen"]
        log.warning(f"{LogColors.WARNING}Failed to get citizen data for {username} from API: {data.get('error')}{LogColors.ENDC}")
        return None
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API request error fetching citizen data for {username}: {e}{LogColors.ENDC}")
        return None
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}JSON decode error fetching citizen data for {username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return None


def _get_notifications_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches recent notifications for a citizen via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/notifications"
        payload = {"citizen": username, "limit": limit} # API likely handles sorting and default limit
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "notifications" in data:
            return data["notifications"]
        log.warning(f"{LogColors.WARNING}Failed to get notifications for {username} from API: {data.get('error')}{LogColors.ENDC}")
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API request error fetching notifications for {username}: {e}{LogColors.ENDC}")
        return []
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}JSON decode error fetching notifications for {username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return []

def _get_relevancies_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches recent relevancies for a citizen via the Next.js API."""
    try:
        # Fetch relevancies where the AI is the 'relevantToCitizen'
        url = f"{BASE_URL}/api/relevancies?relevantToCitizen={username}&limit={limit}&excludeAll=true"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "relevancies" in data:
            return data["relevancies"]
        log.warning(f"{LogColors.WARNING}Failed to get relevancies for {username} from API: {data.get('error')}{LogColors.ENDC}")
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API request error fetching relevancies for {username}: {e}{LogColors.ENDC}")
        return []
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}JSON decode error fetching relevancies for {username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return []

def _get_problems_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches active problems for a citizen via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/problems?citizen={username}&status=active&limit={limit}"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "problems" in data:
            return data["problems"]
        log.warning(f"{LogColors.WARNING}Failed to get problems for {username} from API: {data.get('error')}{LogColors.ENDC}")
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}API request error fetching problems for {username}: {e}{LogColors.ENDC}")
        return []
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}JSON decode error fetching problems for {username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return []

# --- Citizen and Thought Generation ---

def get_citizens_for_thought_generation(
    tables: Dict[str, Table],
    specific_username: Optional[str] = None,
    only_ais: bool = False,
    only_humans: bool = False
) -> List[Dict]:
    """
    Fetches citizens from Airtable for thought generation.
    - Optionally filtered by a specific username (includes Facchini if that user is Facchini).
    - If only_ais: fetches AIs, EXCLUDING Facchini.
    - If only_humans: fetches Humans active in the last 7 days, INCLUDING Facchini.
    - If no specific filter (default): fetches AIs (EXCLUDING Facchini) AND Humans (active in last 7 days, INCLUDING Facchini).
    """
    try:
        formula_parts = ["{InVenice}=1"]
        description_string = "in Venice"

        if specific_username:
            escaped_username = _escape_airtable_value(specific_username)
            formula_parts.append(f"{{Username}}='{escaped_username}'")
            description_string += f", username is {escaped_username}"
            # Facchini included if they are the specific user
        elif only_ais:
            formula_parts.append("{IsAI}=1")
            formula_parts.append("{SocialClass}!='Facchini'") # Exclude Facchini for AIs
            description_string += ", are AIs (excluding Facchini)"
        elif only_humans:
            formula_parts.append("(OR({IsAI}=0, {IsAI}=BLANK()))")
            seven_days_ago_venice = (get_venice_time_now() - timedelta(days=7)).isoformat()
            formula_parts.append(f"IS_AFTER({{LastActiveAt}}, DATETIME_PARSE('{seven_days_ago_venice}'))")
            description_string += ", are humans active in the last 7 days (including Facchini)"
            # Facchini included for humans
        else: # Default case: AIs (excluding Facchini) OR Humans (active in last 7 days, including Facchini)
            seven_days_ago_venice = (get_venice_time_now() - timedelta(days=7)).isoformat()
            ai_condition = "AND({IsAI}=1, {SocialClass}!='Facchini')"
            # Use .format() to avoid f-string parsing issues with literal braces
            human_condition_template = "AND(OR({IsAI}=0, {IsAI}=BLANK()), IS_AFTER({LastActiveAt}, DATETIME_PARSE('{}')))"
            human_condition = human_condition_template.format(seven_days_ago_venice)
            
            # Combined condition: OR(ai_condition, human_condition)
            # This will be ANDed with the initial {InVenice}=1
            formula_parts.append(f"OR({ai_condition}, {human_condition})")
            description_string += ", AIs (excluding Facchini) OR active Humans (including Facchini, last 7 days)"

        final_formula = "AND(" + ", ".join(formula_parts) + ")"
        log.info(f"{LogColors.OKBLUE}Fetching citizens for thought generation ({description_string}) with formula: {final_formula}{LogColors.ENDC}")

        # Fetch necessary fields for context and identification
        fields = [
            "Username", "FirstName", "LastName", "SocialClass", "Ducats",
            "Description", "CorePersonality", "IsAI", "LastActiveAt"
        ]
        citizens_for_thoughts = tables["citizens"].all(formula=final_formula, fields=fields)

        log.info(f"{LogColors.OKGREEN}Found {len(citizens_for_thoughts)} citizens matching criteria.{LogColors.ENDC}")
        return citizens_for_thoughts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching citizens for thought generation: {e}{LogColors.ENDC}")
        return []

def generate_ai_thought(kinos_api_key: str, ai_username: str, ai_display_name: str, context_data: Dict) -> Optional[str]:
    """Generates an AI thought using the Kinos Engine API."""
    try:
        add_system_json = json.dumps(context_data)
        
        kinos_prompt = (
            f"You are {ai_display_name}, an AI citizen of Venice. You are currently reflecting on your goals, your economic situation, your relationships, and any pressing needs or problems you face.\n"
            "Your task is to:\n"
            "1. First, write a paragraph outlining various strategic thoughts. These thoughts should be based on the detailed context provided in 'addSystem'. For example, consider:\n"
            "    - Strategic and Goal-Oriented Thoughts: What are your long-term objectives? What steps can you take?\n"
            "    - Economic Evaluation / Decision-Making Cues: How is your financial situation? What economic opportunities or threats do you see?\n"
            "    - Relationship-Driven Economic Thoughts: How do your relationships influence your economic decisions or offer opportunities?\n"
            "    - Needs-Driven Economic Actions (linked to Problems): What problems are you facing (e.g., lack of resources, housing issues) and what economic actions could solve them?\n"
            "    - Activity-Related Intentions: What activities are you considering undertaking?\n"
            "   Feel free to deviate from this template and think about things relevant to YOUR specific situation. Ensure that the thought are grounded in the data given, related to the gameplay, and your position as an economic agent in the city. They should be interesting, and help you improve your position.\n\n"
            "Your task is to:\n"
            "Write a FULL PARAGRAPH outlining various strategic thoughts based on the detailed context provided in 'addSystem'. This paragraph should be a comprehensive reflection of your current strategic thinking. The entire paragraph you generate will be recorded.\n\n"
            "IMPORTANT: Ensure your response is a well-reasoned paragraph of thoughts. No specific formatting (like bolding) is required for extraction, as the whole paragraph is the output.\n\n"
            "--- Context ('addSystem' details) ---\n"
            "- 'ai_citizen_profile': Your detailed profile.\n"
            "- 'recent_notifications_for_ai': News/events relevant to you.\n"
            "- 'recent_relevancies_for_ai': Specific items of relevance to you.\n"
            "- 'recent_problems_for_ai': Your current problems.\n\n"
            "--- Your Response ---\n"
        )

        url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT_ID}/kins/{ai_username}/channels/{KINOS_CHANNEL_THOUGHTS}/messages"
        headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
        payload = {"message": kinos_prompt, "addSystem": add_system_json}

        log.info(f"{LogColors.OKBLUE}Sending thought generation request to Kinos for {ai_username}...{LogColors.ENDC}")
        response = requests.post(url, headers=headers, json=payload, timeout=90) # Increased timeout

        if response.status_code not in [200, 201]:
            log.error(f"{LogColors.FAIL}Kinos API error for {ai_username} (POST): {response.status_code} - {response.text[:500]}{LogColors.ENDC}")
            return None

        # Fetch the conversation history to get the assistant's reply
        history_response = requests.get(url, headers=headers, timeout=30)
        if history_response.status_code != 200:
            log.error(f"{LogColors.FAIL}Kinos API error for {ai_username} (GET history): {history_response.status_code} - {history_response.text[:500]}{LogColors.ENDC}")
            return None
            
        messages_data = history_response.json()
        assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
        if not assistant_messages:
            log.warning(f"{LogColors.WARNING}No assistant messages found in Kinos history for {ai_username}.{LogColors.ENDC}")
            return None
        
        assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        latest_ai_response_content = assistant_messages[0].get("content")
        
        if not latest_ai_response_content:
            log.warning(f"{LogColors.WARNING}Latest assistant message for {ai_username} has no content.{LogColors.ENDC}")
            return None
            
        log.info(f"{LogColors.OKGREEN}Received Kinos response for {ai_username}. Length: {len(latest_ai_response_content)}{LogColors.ENDC}")
        # log.debug(f"Kinos raw response for {ai_username}: {latest_ai_response_content[:1000]}...") # Log snippet
        return latest_ai_response_content

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos API request error for {ai_username}: {e}{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in generate_ai_thought for {ai_username}: {e}{LogColors.ENDC}")
        return None

# Removed extract_bold_thought_from_response function

# --- Thought Cleaning and Message Creation ---

def clean_thought_content(tables: Dict[str, Table], thought_content: str) -> str:
    """Cleans thought content by replacing custom IDs with readable names."""
    if not thought_content:
        return ""

    cleaned_content = thought_content
    id_cache = {} # Cache for looked-up names

    # Regex to find patterns like building_id, land_id, polygon-id etc.
    # It captures the type (building, land, citizen, resource, contract, polygon) and the actual ID part.
    # For "polygon-", the ID part includes the hyphen and numbers.
    id_pattern = re.compile(r'\b(building|land|citizen|resource|contract)_([a-zA-Z0-9_.\-]+)\b|\b(polygon-([0-9]+))\b')

    for match in id_pattern.finditer(thought_content):
        if match.group(1): # Matches building_, land_, citizen_, resource_, contract_
            full_id = match.group(0)
            id_type = match.group(1).lower()
            specific_id_part = match.group(2)
        elif match.group(3): # Matches polygon-
            full_id = match.group(3) # e.g., "polygon-1746056541940"
            id_type = "polygon"
            specific_id_part = match.group(4) # e.g., "1746056541940"
        else:
            continue # Should not happen with the current regex

        if full_id in id_cache:
            readable_name = id_cache[full_id]
            if readable_name: # Only replace if a name was found
                cleaned_content = cleaned_content.replace(full_id, readable_name)
            continue

        readable_name = None
        try:
            if id_type == "building":
                # Assuming BuildingId in Airtable is the full specific_id_part or that the prefix is part of it.
                # The schema says BuildingId is custom, e.g., "Type_lat_lng" or "building_lat_lng_index".
                # We'll search by the full_id as BuildingId.
                record = tables["buildings"].first(formula=f"{{BuildingId}}='{_escape_airtable_value(full_id)}'")
                if record and record.get("fields", {}).get("Name"):
                    readable_name = record["fields"]["Name"]
            elif id_type == "land": # Handles "land_..." type IDs
                record = tables["lands"].first(formula=f"{{LandId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("HistoricalName") or record.get("fields", {}).get("EnglishName")
            elif id_type == "polygon": # Handles "polygon-..." type IDs
                # Here, full_id is "polygon-12345"
                record = tables["lands"].first(formula=f"{{LandId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("HistoricalName") or record.get("fields", {}).get("EnglishName")
            elif id_type == "citizen": # This implies an ID like "citizen_username"
                # We need to extract the username part if the ID is "citizen_username"
                # For now, let's assume specific_id_part is the username for "citizen_" prefix
                record = tables["citizens"].first(formula=f"{{Username}}='{_escape_airtable_value(specific_id_part)}'")
                if record:
                    fname = record.get("fields", {}).get("FirstName", "")
                    lname = record.get("fields", {}).get("LastName", "")
                    readable_name = f"{fname} {lname}".strip() if fname or lname else specific_id_part
            elif id_type == "resource": # This implies an ID like "resource_uuid" or "resource_type"
                # If it's a ResourceId (instance)
                record = tables["resources"].first(formula=f"{{ResourceId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("Name") or record.get("fields", {}).get("Type")
                else: # If it might be a resource type string directly (e.g. "timber" not "resource_timber_id")
                      # This part is tricky as the regex targets "resource_..."
                      # For now, this branch might not be hit often by the current regex.
                    pass
            elif id_type == "contract":
                record = tables["contracts"].first(formula=f"{{ContractId}}='{_escape_airtable_value(full_id)}'")
                if record:
                    readable_name = record.get("fields", {}).get("Title") or f"Contract ({specific_id_part[:10]}...)"


            if readable_name:
                log.info(f"Replaced ID '{full_id}' with '{readable_name}'")
                cleaned_content = cleaned_content.replace(full_id, f"'{readable_name}'") # Add quotes for clarity
                id_cache[full_id] = f"'{readable_name}'"
            else:
                log.warning(f"Could not find readable name for ID '{full_id}' (type: {id_type})")
                id_cache[full_id] = None # Cache that it wasn't found

        except Exception as e:
            log.error(f"Error looking up ID {full_id}: {e}")
            id_cache[full_id] = None

    return cleaned_content


def create_self_thought_message(tables: Dict[str, Table], citizen_username: str, thought_content: str) -> bool:
    """Creates a message from the citizen to themselves with the thought content."""
    try:
        message_payload = {
            "Sender": citizen_username,
            "Receiver": citizen_username, # Message to self
            "Content": thought_content,
            "Type": "thought_log", # A specific type for these self-messages
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
            "ReadAt": datetime.now(VENICE_TIMEZONE).isoformat() # Mark as read immediately
        }
        tables["messages"].create(message_payload)
        log.info(f"{LogColors.OKGREEN}Created self-thought message for {citizen_username}.{LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating self-thought message for {citizen_username}: {e}{LogColors.ENDC}")
        return False

# --- Admin Notification ---

def create_admin_notification(tables: Dict[str, Table], thoughts_summary: Dict[str, Any]) -> None:
    """Creates an admin notification with the thought generation summary."""
    try:
        content = f"Citizen Thought Generation Summary ({datetime.now(VENICE_TIMEZONE).strftime('%Y-%m-%d %H:%M')}):\n" # Changed title
        content += f"Citizens Processed: {thoughts_summary['processed_citizen_count']}\n" # Changed key here
        content += f"Thoughts Successfully Generated: {thoughts_summary['thoughts_generated_count']}\n\n"
        
        for ai_user, data in thoughts_summary.get("details", {}).items():
            status = "Generated" if data['thought_generated'] else "Failed/No Thought"
            content += f"- {ai_user}: {status}\n"
            if data.get('full_thought_content_preview'): # Changed from extracted_thought
                content += f"  Thought Preview: {data['full_thought_content_preview']}...\n" # Show a preview

        notification_payload = {
            "Citizen": "ConsiglioDeiDieci", # Or a dedicated admin user
            "Type": "ai_thought_generation",
            "Content": content,
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
            "Details": json.dumps(thoughts_summary)
        }
        tables["notifications"].create(notification_payload)
        log.info(f"{LogColors.OKGREEN}Admin notification for AI thought generation created.{LogColors.ENDC}")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating admin notification: {e}{LogColors.ENDC}")

# --- Main Processing Function ---

def process_ai_thoughts(
    dry_run: bool = False,
    specific_citizen_username: Optional[str] = None,
    only_ais: bool = False,
    only_humans: bool = False
):
    """Main function to process AI thought generation."""
    filter_desc = "all eligible"
    if specific_citizen_username:
        filter_desc = f"citizen={specific_citizen_username}"
    elif only_ais:
        filter_desc = "only AIs"
    elif only_humans:
        filter_desc = "only active humans"

    log.info(f"{LogColors.HEADER}Starting Citizen Thought Generation Process (dry_run={dry_run}, filter={filter_desc})...{LogColors.ENDC}")

    tables = initialize_airtable()
    kinos_api_key = get_kinos_api_key()

    if not tables or not kinos_api_key:
        log.error(f"{LogColors.FAIL}Exiting due to missing Airtable connection or Kinos API key.{LogColors.ENDC}")
        return

    citizens_to_process = get_citizens_for_thought_generation(
        tables,
        specific_username=specific_citizen_username,
        only_ais=only_ais,
        only_humans=only_humans
    )
    if not citizens_to_process:
        log.info(f"{LogColors.OKBLUE}No citizens found to process for thought generation with the current filters.{LogColors.ENDC}")
        return

    thoughts_summary = {
        "processed_citizen_count": 0, # Renamed from processed_ai_count
        "thoughts_generated_count": 0,
        "details": {}
    }

    for citizen_record in citizens_to_process:
        citizen_username = citizen_record["fields"].get("Username")
        citizen_display_name = citizen_record["fields"].get("FirstName", citizen_username)
        is_ai_citizen = citizen_record["fields"].get("IsAI", False) # Check if this citizen is an AI

        if not citizen_username:
            log.warning(f"{LogColors.WARNING}Skipping citizen record {citizen_record['id']} due to missing Username.{LogColors.ENDC}")
            continue

        log.info(f"{LogColors.OKCYAN}--- Processing Citizen: {citizen_username} ({citizen_display_name}) ---{LogColors.ENDC}")
        thoughts_summary["processed_citizen_count"] += 1
        thoughts_summary["details"][citizen_username] = {"thought_generated": False, "full_thought_content_preview": None, "is_ai": is_ai_citizen}

        # Gather context (using ai_username for Kinos kin, but context is for citizen_username)
        # Kinos kin is effectively the "persona" or "voice" being used.
        # If we want human players to also have Kinos-generated thoughts, they'd need a Kinos kin.
        # For now, let's assume only AI citizens have Kinos kins for thought generation.
        # If a human player is processed, we might skip Kinos or use a generic "human_player" kin.
        # For simplicity, this example will proceed as if all processed citizens can use Kinos.
        # The prompt itself refers to "You are {ai_display_name}, an AI citizen..."
        # This needs to be conditional if humans are to generate thoughts via Kinos.
        # For now, let's assume the prompt is fine and Kinos can handle it, or we only run this for AI.
        # The request is to "include the humans", so we will proceed.
        # The prompt in generate_ai_thought uses ai_display_name, which is fine.

        profile_for_context = _get_citizen_data_api(citizen_username)
        notifications = _get_notifications_data_api(citizen_username)
        relevancies = _get_relevancies_data_api(citizen_username)
        problems = _get_problems_data_api(citizen_username)

        context_data = {
            "ai_citizen_profile": profile_for_context or {}, # Using "ai_citizen_profile" as key for Kinos
            "recent_notifications_for_ai": notifications,
            "recent_relevancies_for_ai": relevancies, # Renamed for Kinos context key
            "recent_problems_for_ai": problems,
            "telegram_markdownv2_formatting_rules": """To use this mode, pass MarkdownV2 in the parse_mode field. Use the following syntax in your message:

*bold \\*text*
_italic \\*text_
__underline__
~strikethrough~
||spoiler||
*bold _italic bold ~italic bold strikethrough ||italic bold strikethrough spoiler||~ __underline italic bold___ bold*
[inline URL](http://www.example.com/)
[inline mention of a user](tg://user?id=123456789)
![👍](tg://emoji?id=5368324170671202286)
`inline fixed-width code`
```
pre-formatted fixed-width code block
```
```python
pre-formatted fixed-width code block written in the Python programming language
```
>Block quotation started
>Block quotation continued
>Block quotation continued
>Block quotation continued
>The last line of the block quotation
**>The expandable block quotation started right after the previous block quotation
>It is separated from the previous block quotation by an empty bold entity
>Expandable block quotation continued
>Hidden by default part of the expandable block quotation started
>Expandable block quotation continued
>The last line of the expandable block quotation with the expandability mark||
Please note:

Any character with code between 1 and 126 inclusively can be escaped anywhere with a preceding '\\' character, in which case it is treated as an ordinary character and not a part of the markup. This implies that '\\' character usually must be escaped with a preceding '\\' character.
Inside pre and code entities, all '`' and '\\' characters must be escaped with a preceding '\\' character.
Inside the (...) part of the inline link and custom emoji definition, all ')' and '\\' must be escaped with a preceding '\\' character.
In all other places characters '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!' must be escaped with the preceding character '\\'.
In case of ambiguity between italic and underline entities __ is always greadily treated from left to right as beginning or end of an underline entity, so instead of ___italic underline___ use ___italic underline_**__, adding an empty bold entity as a separator.
A valid emoji must be provided as an alternative value for the custom emoji. The emoji will be shown instead of the custom emoji in places where a custom emoji cannot be displayed (e.g., system notifications) or if the message is forwarded by a non-premium user. It is recommended to use the emoji from the emoji field of the custom emoji sticker.
Custom emoji entities can only be used by bots that purchased additional usernames on Fragment.
"""
        }

        if dry_run:
            log.info(f"[DRY RUN] Would generate thought for {citizen_username}.")
            log.debug(f"[DRY RUN] Context for {citizen_username}: {json.dumps(context_data, indent=2)[:500]}...")
            thoughts_summary["details"][citizen_username]["thought_generated"] = True
            thoughts_summary["thoughts_generated_count"] += 1
            time.sleep(0.1)
            continue

        # Use citizen_username for the Kinos kin parameter
        kinos_response_content = generate_ai_thought(kinos_api_key, citizen_username, citizen_display_name, context_data)
        
        if kinos_response_content:
            log.info(f"{LogColors.OKGREEN}Generated full thought process for {citizen_username}. Length: {len(kinos_response_content)}{LogColors.ENDC}")
            
            cleaned_thought = clean_thought_content(tables, kinos_response_content)
            log.info(f"{LogColors.OKBLUE}Cleaned thought for {citizen_username}: {cleaned_thought[:150].replace(chr(10), ' ')}...{LogColors.ENDC}")

            thoughts_summary["details"][citizen_username]["thought_generated"] = True
            thoughts_summary["details"][citizen_username]["full_thought_content_preview"] = cleaned_thought[:150].replace('\n', ' ')
            thoughts_summary["thoughts_generated_count"] += 1
            
            if not dry_run:
                create_self_thought_message(tables, citizen_username, cleaned_thought)
            else: # This branch won't be hit due to outer dry_run check, but kept for logical structure
                log.info(f"[DRY RUN] Would create self-thought message for {citizen_username} with cleaned content.")
        else:
            log.warning(f"{LogColors.WARNING}Failed to generate thought for {citizen_username}.{LogColors.ENDC}")
        
        time.sleep(1)

    log.info(f"{LogColors.HEADER}--- Citizen Thought Generation Summary ---{LogColors.ENDC}")
    log.info(f"Citizens Processed: {thoughts_summary['processed_citizen_count']}")
    log.info(f"Thoughts Successfully Generated: {thoughts_summary['thoughts_generated_count']}")
    for user, data in thoughts_summary["details"].items():
        status = "Generated" if data['thought_generated'] else "Failed/No Thought"
        citizen_type = "(AI)" if data.get('is_ai') else "(Human)"
        log.info(f"- {user} {citizen_type}: {status}")
        if data.get('full_thought_content_preview'):
            log.info(f"  Thought Preview: {data['full_thought_content_preview']}...")

    if not dry_run and thoughts_summary["processed_citizen_count"] > 0: # Changed from processed_ai_count
        create_admin_notification(tables, thoughts_summary)

    log.info(f"{LogColors.OKGREEN}Citizen Thought Generation Process finished.{LogColors.ENDC}")

# --- Main Execution ---

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate strategic thoughts for citizens.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--citizen",
        type=str,
        help="Process thoughts for a specific citizen by username."
    )
    group.add_argument(
        "--ais",
        action="store_true",
        help="Process thoughts only for AI citizens."
    )
    group.add_argument(
        "--humans",
        action="store_true",
        help="Process thoughts only for human citizens active in the last 7 days (excluding Facchini)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making Kinos API calls or writing to Airtable."
    )
    args = parser.parse_args()

    process_ai_thoughts(
        dry_run=args.dry_run,
        specific_citizen_username=args.citizen,
        only_ais=args.ais,
        only_humans=args.humans
    )
