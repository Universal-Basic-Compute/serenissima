#!/usr/bin/env python3
"""
Generates a daily update for Venice based on recent citizen thoughts.

This script:
1. Fetches recent 'thought_log' messages from Airtable.
2. Sends these thoughts to the Kinos AI (ConsiglioDeiDieci kin).
3. Asks Kinos AI to generate a recap formatted as a Telegram message.
4. Sends the AI-generated recap to a specified Telegram chat.
"""

import os
import sys
import json
import argparse
import logging
import time
import re # Added for unescaping
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
from markdown_it import MarkdownIt # Added for Markdown to HTML conversion

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import shared utilities
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, _escape_airtable_value, LogColors

# Configuration
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

KINOS_API_KEY = os.getenv("KINOS_API_KEY")
KINOS_BLUEPRINT_ID = "serenissima-ai"
KINOS_KIN_ID = "ConsiglioDeiDieci"
KINOS_CHANNEL_ID = "dailyUpdates"

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = "-1002585507870" # Default chat ID, can be overridden

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("dailyUpdate")

# --- Airtable Initialization ---
def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initializes connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Airtable credentials not found in environment variables.{LogColors.ENDC}")
        return None
    try:
        api = Api(airtable_api_key)
        tables = {
            "messages": api.table(airtable_base_id, "MESSAGES"),
            # Add other tables if needed for context, though not directly requested for this script
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

# --- Telegram Notification Function ---
def send_telegram_notification(message: str, chat_id_override: Optional[str] = None):
    """Sends a message to a Telegram chat via a bot."""
    bot_token = TELEGRAM_BOT_TOKEN
    chat_id_to_use = chat_id_override or TELEGRAM_CHAT_ID

    if not bot_token or not chat_id_to_use:
        log.warning(f"{LogColors.WARNING}Telegram bot token or chat ID not configured. Cannot send notification.{LogColors.ENDC}")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    MAX_TELEGRAM_MESSAGE_LENGTH = 4000 
    if len(message) > MAX_TELEGRAM_MESSAGE_LENGTH:
        message = message[:MAX_TELEGRAM_MESSAGE_LENGTH - 200] + "\n\n[...Message truncated...]" 
        if message.count("```") % 2 != 0: # Ensure code blocks are closed if truncated
            message += "\n```"

    payload = {
        "chat_id": chat_id_to_use,
        "text": message,
        "parse_mode": "HTML" 
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        log.info(f"{LogColors.OKGREEN}Telegram notification sent successfully to chat ID {chat_id_to_use}.{LogColors.ENDC}")
        return True
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Failed to send Telegram notification to chat ID {chat_id_to_use}: {e}{LogColors.ENDC}")
        return False
    except Exception as e_gen:
        log.error(f"{LogColors.FAIL}An unexpected error occurred while sending Telegram notification to chat ID {chat_id_to_use}: {e_gen}{LogColors.ENDC}")
        return False

# --- Core Logic ---
def get_recent_thought_logs(tables: Dict[str, Table], hours_ago: int = 24) -> List[Dict[str, Any]]:
    """Fetches 'thought_log' messages created within the last `hours_ago`."""
    if "messages" not in tables:
        log.error(f"{LogColors.FAIL}Messages table not initialized.{LogColors.ENDC}")
        return []

    try:
        threshold_time_utc = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
        # Airtable's DATETIME_FORMAT for IS_AFTER comparison
        threshold_time_str = threshold_time_utc.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        formula = f"AND({{Type}}='thought_log', IS_AFTER({{CreatedAt}}, DATETIME_PARSE('{threshold_time_str}')))"
        
        log.info(f"{LogColors.OKBLUE}Fetching recent thought logs with formula: {formula}{LogColors.ENDC}")
        # Fetch relevant fields: Sender (Username) and Content
        thought_records = tables["messages"].all(formula=formula, fields=["Sender", "Content", "CreatedAt"])
        
        # Sort by CreatedAt to maintain chronological order for the AI context
        thought_records.sort(key=lambda r: r.get('fields', {}).get('CreatedAt', ''))

        log.info(f"{LogColors.OKGREEN}Found {len(thought_records)} recent thought logs.{LogColors.ENDC}")
        return [r['fields'] for r in thought_records] # Return list of fields dicts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching recent thought logs: {e}{LogColors.ENDC}")
        return []

def generate_daily_update_summary(thoughts: List[Dict[str, Any]]) -> Optional[str]:
    """Generates a daily update summary using Kinos AI based on provided thoughts."""
    if not KINOS_API_KEY:
        log.error(f"{LogColors.FAIL}Kinos API key not configured. Cannot generate daily update.{LogColors.ENDC}")
        return None # Return None if Kinos API key is missing
    if not thoughts:
        log.info(f"{LogColors.OKBLUE}No thoughts provided to Kinos AI. Skipping summary generation.{LogColors.ENDC}")
        default_markdown = "No specific citizen thoughts were logged recently. Venice rests, for now."
        # Simple HTML version for the default message
        default_html = f"<p>{default_markdown.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</p>"
        return {"html": default_html, "markdown": default_markdown}

    try:
        # Prepare thoughts for addSystem. Kinos expects a JSON string.
        # Format as "Citizen [Username] thought: [Content]"
        formatted_thoughts = [
            f"Citizen {thought.get('Sender', 'Unknown')} thought at {thought.get('CreatedAt', 'some time ago')}: {thought.get('Content', 'No content')}"
            for thought in thoughts
        ]
        add_system_context = {
            "recent_citizen_thoughts": formatted_thoughts,
            "current_venice_date": datetime.now(VENICE_TIMEZONE).strftime("%A, %B %d, %Y")
            # Removed telegram_markdownv2_formatting_rules from here
        }
        add_system_json = json.dumps(add_system_context)
        
        kinos_prompt = (
            "Based on the recent thoughts from various citizens of Venice provided in the 'addSystem' context, "
            "please generate an engaging daily update for the public. It will be displayed in Telegram, so keep it relatively short. "
            "The update should summarize the general mood, key events, or interesting developments in Venice, especially if they are developments from one day to the next. "
            "Structure your response as follows:[PARAGRAPHBREAK]"
            "1. Start with one short introductory paragraphs summarizing the overall events or key important points. Use [PARAGRAPHBREAK] to separate paragraph.[PARAGRAPHBREAK]"
            "2. Follow with a list of 3 to 5 bullet points highlighting specific notable events, observations, or citizen sentiments. Each bullet point should be concise. Use standard Markdown list syntax (e.g., `* Item 1` or `- Item 1`). Ensure each bullet point starts on a new line by using [LINEBREAK] before it if it's not already the start of a new paragraph.[PARAGRAPHBREAK]. Use bold, no emojis."
            "3. Conclude with a brief closing sentence, if appropriate.[PARAGRAPHBREAK]"
            "Format the entire response as a single Telegram message, suitable for public broadcast. "
            "Use standard Markdown for formatting (e.g., `*bold text*` or `**bold text**`, `_italic text_``, `~strikethrough~`).[PARAGRAPHBREAK]"
            "IMPORTANT FOR LINE BREAKS: For all single line breaks, you MUST use the exact tag [LINEBREAK]. For paragraph breaks (equivalent to a blank line), you MUST use the exact tag [PARAGRAPHBREAK]. Do NOT use literal newline characters like '\\n' in your output.[PARAGRAPHBREAK]"
            "Answer with ONLY the Telegram message content, no extra conversational text or explanations."
        )

        url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT_ID}/kins/{KINOS_KIN_ID}/channels/{KINOS_CHANNEL_ID}/messages"
        headers = {"Authorization": f"Bearer {KINOS_API_KEY}", "Content-Type": "application/json"}
        payload = {"message": kinos_prompt, "addSystem": add_system_json, "min_files": 2, "max_files": 5, "history_length": 10}

        log.info(f"{LogColors.OKBLUE}Sending request to Kinos AI for daily update summary...{LogColors.ENDC}")
        response = requests.post(url, headers=headers, json=payload, timeout=120) # Increased timeout for potentially long context

        if response.status_code not in [200, 201]:
            log.error(f"{LogColors.FAIL}Kinos AI API error (POST): {response.status_code} - {response.text[:500]}{LogColors.ENDC}")
            return None

        # Fetch the conversation history to get the assistant's reply
        history_response = requests.get(url, headers=headers, timeout=30)
        if history_response.status_code != 200:
            log.error(f"{LogColors.FAIL}Kinos AI API error (GET history): {history_response.status_code} - {history_response.text[:500]}{LogColors.ENDC}")
            return None
            
        messages_data = history_response.json()
        assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
        
        if not assistant_messages:
            log.warning(f"{LogColors.WARNING}No assistant messages found in Kinos history.{LogColors.ENDC}")
            return None
        
        # Sort by timestamp to get the latest, though usually the last one is the latest.
        assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        latest_ai_response_content = assistant_messages[0].get("content")
        
        if not latest_ai_response_content:
            log.warning(f"{LogColors.WARNING}Latest Kinos assistant message has no content.{LogColors.ENDC}")
            return None # Return None if Kinos response is empty
            
        log.info(f"{LogColors.OKGREEN}Received daily update summary from Kinos AI.{LogColors.ENDC}")
        # log.debug(f"Kinos AI Raw Response: {latest_ai_response_content}")
        
        # 1. Replace custom linebreak tags with actual newlines for the Markdown version
        processed_markdown = latest_ai_response_content.strip()
        processed_markdown = processed_markdown.replace('[PARAGRAPHBREAK]', '\n\n')
        processed_markdown = processed_markdown.replace('[LINEBREAK]', '\n')
        
        log.info(f"{LogColors.OKBLUE}Processed Kinos Markdown (with newlines): {processed_markdown[:200]}...{LogColors.ENDC}")

        # 2. Échapper les caractères HTML spéciaux provenant du texte de Kinos (pour la version HTML)
        # Ceci est fait AVANT d'ajouter nos propres balises HTML.
        escaped_text = processed_markdown.replace('&', '&amp;')
        escaped_text = escaped_text.replace('<', '&lt;')
        escaped_text = escaped_text.replace('>', '&gt;')

        # 3. Convertir le Markdown en HTML compatible avec Telegram en utilisant des regex
        # L'ordre des remplacements peut être important.
        
        # Blocs de code (gérés en premier pour protéger leur contenu)
        processed_html = re.sub(r'```python\r?\n(.*?)\r?\n```', r'<pre><code class="language-python">\1</code></pre>', escaped_text, flags=re.DOTALL)
        processed_html = re.sub(r'```\r?\n(.*?)\r?\n```', r'<pre>\1</pre>', processed_html, flags=re.DOTALL)

        # Code en ligne : `code` -> <code>code</code>
        processed_html = re.sub(r'`(.*?)`', r'<code>\1</code>', processed_html)
        
        # Gras : **text** -> <b>text</b> (doit être traité avant *text*)
        processed_html = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', processed_html)
        
        # Gras : *text* -> <b>text</b> 
        # (?<!\*) : non précédé par un astérisque (pour ne pas matcher le deuxième * de **)
        # \*(?=\S) : un astérisque suivi par un caractère non-espace
        # (.+?) : le contenu (au moins un caractère, non-gourmand)
        # (?<=\S)\* : un astérisque précédé par un caractère non-espace
        # (?!\*) : non suivi par un astérisque (pour ne pas matcher le premier * de **)
        processed_html = re.sub(r'(?<!\*)\*(?=\S)(.+?)(?<=\S)\*(?!\*)', r'<b>\1</b>', processed_html)

        # Italique : _text_ -> <i>text</i>
        processed_html = re.sub(r'\_(?=\S)(.+?)(?<=\S)\_', r'<i>\1</i>', processed_html)
        
        # Barré : ~text~ -> <s>text</s>
        processed_html = re.sub(r'\~(?=\S)(.+?)(?<=\S)\~', r'<s>\1</s>', processed_html)
        
        # Listes : (traitées après les formatages en ligne)
        # Convertir "* item" en "• item" (au début d'une ligne)
        processed_html = re.sub(r'^\* (.*)', r'• \1', processed_html, flags=re.MULTILINE)
        # Convertir "- item" en "• item" (au début d'une ligne)
        processed_html = re.sub(r'^\- (.*)', r'• \1', processed_html, flags=re.MULTILINE)
        
        # Les caractères \n pour les sauts de ligne sont déjà présents grâce au remplacement des [TAGS]
        # et ne sont pas modifiés par ces regex. Aucune balise <p> ou <ul>/<li> n'est introduite.
        
        log.info(f"{LogColors.OKGREEN}Converted Kinos response to Telegram-compatible HTML (with literal newlines): {processed_html[:200]}...{LogColors.ENDC}")
        return {"html": processed_html, "markdown": processed_markdown}

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos AI API request error: {e}{LogColors.ENDC}")
        return None # Return None on Kinos API error
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in generate_daily_update_summary: {e}{LogColors.ENDC}")
        return None # Return None on other errors

def process_daily_update(dry_run: bool = False):
    """Main function to generate and send the daily update."""
    log.info(f"{LogColors.HEADER}Starting Daily Update Process (dry_run={dry_run})...{LogColors.ENDC}")

    tables = initialize_airtable()
    if not tables:
        log.error(f"{LogColors.FAIL}Exiting due to Airtable initialization failure.{LogColors.ENDC}")
        return

    recent_thoughts = get_recent_thought_logs(tables)
    if not recent_thoughts and not dry_run: # If dry_run, proceed to simulate Kinos call
        log.info(f"{LogColors.OKBLUE}No recent thoughts to process. No daily update will be generated.{LogColors.ENDC}")
        # Optionally send a generic "quiet day" message
        # send_telegram_notification("A quiet day in Venice, no specific citizen thoughts to report.", TELEGRAM_CHAT_ID)
        return

    if dry_run:
        log.info(f"[DRY RUN] Would fetch {len(recent_thoughts)} recent thoughts.")
        log.info(f"[DRY RUN] Would send thoughts to Kinos AI ({KINOS_KIN_ID}) for summary generation.")
        simulated_summary = "This is a simulated daily update for Venice. Citizens are active and the canals are bustling."
        log.info(f"[DRY RUN] Simulated Kinos AI summary: {simulated_summary}")
        log.info(f"[DRY RUN] Would send summary to Telegram chat ID: {TELEGRAM_CHAT_ID}.")
        log.info(f"{LogColors.OKGREEN}[DRY RUN] Daily Update Process finished simulation.{LogColors.ENDC}")
        return

    daily_summary_data = generate_daily_update_summary(recent_thoughts)

    if daily_summary_data and daily_summary_data.get("html") and daily_summary_data.get("markdown") is not None:
        html_summary_for_telegram = daily_summary_data["html"]
        markdown_summary_for_airtable = daily_summary_data["markdown"]
        
        log.info(f"Daily Update HTML Summary for Telegram:\n{html_summary_for_telegram}")
        log.info(f"Daily Update Markdown Summary for Airtable:\n{markdown_summary_for_airtable}")
        
        # Save Markdown version to Airtable MESSAGES
        save_daily_update_to_messages(tables, markdown_summary_for_airtable)
        # Send HTML version to Telegram
        send_telegram_notification(html_summary_for_telegram, TELEGRAM_CHAT_ID)
    else:
        log.warning(f"{LogColors.WARNING}Failed to generate daily update summary from Kinos AI or data is incomplete.{LogColors.ENDC}")
        # Optionally send a fallback message
        fallback_html_message = "<p>The daily update from Venice could not be generated at this time.</p>"
        send_telegram_notification(fallback_html_message, TELEGRAM_CHAT_ID)

    log.info(f"{LogColors.OKGREEN}Daily Update Process finished.{LogColors.ENDC}")

def save_daily_update_to_messages(tables: Dict[str, Table], markdown_content: str):
    """Saves the daily update summary (Markdown version) to the MESSAGES table."""
    if "messages" not in tables:
        log.error(f"{LogColors.FAIL}Messages table not initialized. Cannot save daily update message.{LogColors.ENDC}")
        return False
    
    try:
        message_payload = {
            "Sender": KINOS_KIN_ID, # ConsiglioDeiDieci
            "Receiver": KINOS_KIN_ID, # ConsiglioDeiDieci
            "Content": markdown_content, # Save the Markdown content
            "Type": "daily_update", 
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
            "ReadAt": datetime.now(VENICE_TIMEZONE).isoformat() # Mark as read immediately
        }
        tables["messages"].create(message_payload)
        log.info(f"{LogColors.OKGREEN}Successfully saved daily update (Markdown) to MESSAGES table from {KINOS_KIN_ID} to self.{LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error saving daily update to MESSAGES table: {e}{LogColors.ENDC}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate and send a daily update for Venice based on citizen thoughts.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making Kinos API calls or sending Telegram messages."
    )
    args = parser.parse_args()

    process_daily_update(dry_run=args.dry_run)
