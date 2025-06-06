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
import random # Added for prompt variation
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
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, _escape_airtable_value, LogColors, log_header
from colorama import Fore, Style # Added for consistent logging with scheduler

# Configuration
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

KINOS_API_KEY = os.getenv("KINOS_API_KEY")
KINOS_BLUEPRINT_ID = "serenissima-ai"
KINOS_KIN_ID = "ConsiglioDeiDieci"
KINOS_CHANNEL_ID = "dailyUpdates"

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = "1864364329" # Changed to match scheduler.py

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
        # Match scheduler's logging style for this part
        print(f"{Fore.YELLOW}⚠ Telegram bot token or chat ID not configured in dailyUpdate.py. Cannot send notification.{Style.RESET_ALL}")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    MAX_TELEGRAM_MESSAGE_LENGTH = 4000 
    if len(message) > MAX_TELEGRAM_MESSAGE_LENGTH:
        message = message[:MAX_TELEGRAM_MESSAGE_LENGTH - 200] + "\n\n[...Message truncated...]" 
        # Ensure Markdown code blocks are closed if truncated
        if message.count("```") % 2 != 0: 
            message += "\n```"
        # Ensure bold/italic markers are balanced if truncated (simple check)
        if message.count("*") % 2 != 0:
            message += "*"
        if message.count("_") % 2 != 0:
            message += "_"

    payload = {
        "chat_id": chat_id_to_use,
        "text": message, # This will be Markdown
        "parse_mode": "Markdown" # Changed from HTML to Markdown
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()  # Raise an exception for HTTP errors
        # Match scheduler's logging style
        print(f"{Fore.GREEN}✓ Telegram notification sent successfully from dailyUpdate.py to chat ID {chat_id_to_use}.{Style.RESET_ALL}")
        return True
    except requests.exceptions.RequestException as e:
        # Match scheduler's logging style
        print(f"{Fore.RED}✗ Failed to send Telegram notification from dailyUpdate.py to chat ID {chat_id_to_use}: {e}{Style.RESET_ALL}")
        return False
    except Exception as e_gen:
        # Match scheduler's logging style
        print(f"{Fore.RED}✗ An unexpected error occurred in dailyUpdate.py while sending Telegram notification to chat ID {chat_id_to_use}: {e_gen}{Style.RESET_ALL}")
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
        
        formula = f"IS_AFTER({{CreatedAt}}, DATETIME_PARSE('{threshold_time_str}'))"
        
        log.info(f"{LogColors.OKBLUE}Fetching recent messages with formula: {formula}{LogColors.ENDC}")
        # Fetch relevant fields: Sender (Username) and Content
        thought_records = tables["messages"].all(formula=formula, fields=["Sender", "Content", "CreatedAt"])
        
        # Sort by CreatedAt to maintain chronological order for the AI context
        thought_records.sort(key=lambda r: r.get('fields', {}).get('CreatedAt', ''))

        log.info(f"{LogColors.OKGREEN}Found {len(thought_records)} recent messages.{LogColors.ENDC}")
        return [r['fields'] for r in thought_records] # Return list of fields dicts
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching recent messages: {e}{LogColors.ENDC}")
        return []

def generate_daily_update_summary(thoughts: List[Dict[str, Any]]) -> Optional[str]:
    """Generates a daily update summary using Kinos AI based on provided messages & thoughts."""
    if not KINOS_API_KEY:
        log.error(f"{LogColors.FAIL}Kinos API key not configured. Cannot generate daily update.{LogColors.ENDC}")
        return None # Return None if Kinos API key is missing
    if not thoughts:
        log.info(f"{LogColors.OKBLUE}No thoughts provided to Kinos AI. Skipping summary generation.{LogColors.ENDC}")
        default_markdown = "No specific citizen thoughts were logged recently. Venice rests, for now."
        return {"telegram_markdown": default_markdown, "airtable_markdown": default_markdown}

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

        # Define multiple prompt templates
        prompt_templates = [
            ( # Template 1: Narrative Style
                "From the recent citizen dialogues and events in 'addSystem', weave a short, engaging narrative or descriptive piece for the Venetian public. "
                "This will be shared on Telegram, so keep it concise. Capture the city's atmosphere, a key development, or an interesting anecdote. "
                "Structure:[PARAGRAPHBREAK]"
                " - One or two main paragraphs forming a cohesive story or observation. Use [PARAGRAPHBREAK] between paragraphs.[PARAGRAPHBREAK]"
                " - Optionally, a brief concluding sentence or thought. Use [PARAGRAPHBREAK] before it.[PARAGRAPHBREAK]"
                "Emphasize key names or events using bold Markdown (`*text*` or `**text**`). Avoid emojis. "
                "The entire output must be a single Telegram-ready message. Use Markdown for italics (`_text_`) and strikethrough (`~text~`) if appropriate.[PARAGRAPHBREAK]"
                "CRITICAL FOR FORMATTING: Use [LINEBREAK] for single line breaks within a paragraph if absolutely necessary (prefer flowing text). Use [PARAGRAPHBREAK] for paragraph breaks (equivalent to a blank line). Do NOT use literal newline characters like '\\n'.[PARAGRAPHBREAK]"
                "Provide ONLY the Telegram message content, without any surrounding explanations or conversational text."
            ),
            ( # Template 2: Categorized Highlights (e.g., Good News, Concerns, Market Buzz)
                "Analyze the citizen thoughts and events provided in 'addSystem'. Produce a categorized daily summary for the Venetian public, suitable for Telegram (keep it brief). "
                "Highlight key positive developments, notable concerns, and perhaps some market buzz or interesting rumors. "
                "Format as follows:[PARAGRAPHBREAK]"
                " - A very short overall introductory sentence. [PARAGRAPHBREAK]"
                " - *Good Tidings:* (or similar positive category title in bold) Briefly describe 1-2 positive events or sentiments. Use [LINEBREAK] between distinct points if needed within this section. [PARAGRAPHBREAK]"
                " - *Points of Concern:* (or similar concern-focused category title in bold) Briefly mention 1-2 notable worries or negative developments. Use [LINEBREAK] if needed. [PARAGRAPHBREAK]"
                " - *Whispers on the Rialto:* (or similar market/rumor category title in bold) Share 1-2 intriguing pieces of news or observations. Use [LINEBREAK] if needed. [PARAGRAPHBREAK]"
                " - Optionally, a brief closing statement. [PARAGRAPHBREAK]"
                "Use bold Markdown (`*text*` or `**text**`) for category titles and key details. Avoid emojis. "
                "The response should be a single message for Telegram. Use Markdown for italics (`_text_`) and strikethrough (`~text~`) sparingly.[PARAGRAPHBREAK]"
                "MANDATORY FOR FORMATTING: Use [LINEBREAK] for single line breaks. Use [PARAGRAPHBREAK] for paragraph breaks. Avoid literal newlines ('\\n').[PARAGRAPHBREAK]"
                "Respond with ONLY the Telegram message content."
            ),
            ( # Template 3: Town Crier / Proclamation Style
                "Review the citizen communications and events in 'addSystem'. Compose a series of short, impactful announcements for Venice, as if delivered by a town crier. Designed for Telegram (short and direct). "
                "Focus on 2-4 most significant pieces of news or decrees. "
                "Your report structure:[PARAGRAPHBREAK]"
                "  - Start with a brief, attention-grabbing opening like *Hear ye, hear ye!* or *News from the Doge's Palace!* (in bold/italics). [PARAGRAPHBREAK]"
                "  - Present each piece of news as a separate, concise announcement (1-2 sentences each). Use [PARAGRAPHBREAK] between announcements.[PARAGRAPHBREAK]"
                "  - Use bold Markdown (`*text*` or `**text**`) for emphasis on key subjects or outcomes. No emojis.[PARAGRAPHBREAK]"
                "  - Conclude with a short, formal closing if appropriate, like *So decreed!* or *Spread the word!*. [PARAGRAPHBREAK]"
                "The entire response must be formatted as one Telegram message. Use Markdown for italics (`_text_`) and strikethrough (`~text~`) if suitable.[PARAGRAPHBREAK]"
                "ESSENTIAL FOR FORMATTING: Use [LINEBREAK] for any single line breaks needed within an announcement. Use [PARAGRAPHBREAK] for breaks between announcements or major sections. Do not use actual newline characters.[PARAGRAPHBREAK]"
                "Output ONLY the message content, no additional commentary or conversational fluff."
            ),
            ( # Template 4: Q&A Style (Implied Questions)
                "Based on the recent activities and thoughts in 'addSystem', generate a daily update for the public in a Q&A format. "
                "Imagine citizens are asking about key developments. Keep it concise for Telegram. "
                "Structure:[PARAGRAPHBREAK]"
                " - *What's the talk of the town?* [LINEBREAK] Briefly answer with the main theme or event. [PARAGRAPHBREAK]"
                " - *Any notable achievements or progress?* [LINEBREAK] Highlight 1-2 positive developments. [PARAGRAPHBREAK]"
                " - *Are there any new worries for Venetians?* [LINEBREAK] Mention 1-2 concerns or challenges. [PARAGRAPHBREAK]"
                " - *What might the future hold?* [LINEBREAK] A brief, forward-looking statement or a lingering question. [PARAGRAPHBREAK]"
                "Use bold Markdown (`*text*` or `**text**`) for the questions and key parts of the answers. Avoid emojis. "
                "The entire output must be a single Telegram-ready message. Use Markdown for italics (`_text_`) and strikethrough (`~text~`) if appropriate.[PARAGRAPHBREAK]"
                "CRITICAL FOR FORMATTING: Use [LINEBREAK] for single line breaks (e.g., between question and answer). Use [PARAGRAPHBREAK] for breaks between Q&A pairs. Do NOT use literal newline characters like '\\n'.[PARAGRAPHBREAK]"
                "Provide ONLY the Telegram message content, without any surrounding explanations."
            ),
            ( # Template 5: Classic Bulletin with Title
                "Based on the citizen insights from 'addSystem', compile a classic daily bulletin for the Venetian populace. This is for Telegram, so keep it concise. "
                "The bulletin should cover the general mood, significant events, or interesting developments. "
                "Format your response as follows:[PARAGRAPHBREAK]"
                "1. Start with a catchy *Title* for the bulletin (e.g., *Venice Daily Chronicle*, *Rialto Report*). Use bold Markdown. [PARAGRAPHBREAK]"
                "2. Follow with a short introductory paragraph (1-2 sentences) summarizing the day's essence. Use [PARAGRAPHBREAK].[PARAGRAPHBREAK]"
                "3. Present a list of 3 to 5 bullet points highlighting specific notable events, observations, or citizen sentiments. Each bullet should be concise. Use standard Markdown list syntax (e.g., `* Item 1` or `- Item 1`). Ensure each bullet point starts on a new line by using [LINEBREAK] if it's not already the start of a new paragraph. Use bold for emphasis within bullets; avoid emojis.[PARAGRAPHBREAK]"
                "4. Conclude with a brief closing sentence or a forward-looking thought. [PARAGRAPHBREAK]"
                "The entire output must be a single Telegram-ready message. Use Markdown for formatting (bold: `*text*` or `**text**`; italics: `_text_`; strikethrough: `~text~`).[PARAGRAPHBREAK]"
                "IMPORTANT FOR LINE BREAKS: Use [LINEBREAK] for all single line breaks. Use [PARAGRAPHBREAK] for paragraph breaks (blank lines). Do NOT use literal newline characters like '\\n'.[PARAGRAPHBREAK]"
                "Answer with ONLY the Telegram message content, no extra conversational text or explanations."
            )
        ]
        
        # Randomly select a prompt template
        kinos_prompt = random.choice(prompt_templates)

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
        
        # Replace custom linebreak tags with actual newlines for the Markdown version
        final_markdown_content = latest_ai_response_content.strip()
        final_markdown_content = final_markdown_content.replace('[PARAGRAPHBREAK]', '\n\n')
        final_markdown_content = final_markdown_content.replace('[LINEBREAK]', '\n')
        
        log.info(f"{LogColors.OKGREEN}Final Kinos Markdown for Telegram & Airtable: {final_markdown_content[:200]}...{LogColors.ENDC}")
        
        # HTML conversion is removed. We will send Markdown to Telegram.
        return {"telegram_markdown": final_markdown_content, "airtable_markdown": final_markdown_content}

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos AI API request error: {e}{LogColors.ENDC}")
        return None # Return None on Kinos API error
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in generate_daily_update_summary: {e}{LogColors.ENDC}")
        return None # Return None on other errors

def process_daily_update(dry_run: bool = False):
    """Main function to generate and send the daily update."""
    log_header(f"Daily Update Process (dry_run={dry_run})", LogColors.HEADER)

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

    if daily_summary_data and daily_summary_data.get("telegram_markdown") is not None and daily_summary_data.get("airtable_markdown") is not None:
        markdown_for_telegram = daily_summary_data["telegram_markdown"]
        markdown_for_airtable = daily_summary_data["airtable_markdown"]
        
        log.info(f"Daily Update Markdown Summary for Telegram:\n{markdown_for_telegram}")
        log.info(f"Daily Update Markdown Summary for Airtable:\n{markdown_for_airtable}")
        
        # Save Markdown version to Airtable MESSAGES
        save_daily_update_to_messages(tables, markdown_for_airtable)
        # Send Markdown version to Telegram
        send_telegram_notification(markdown_for_telegram, TELEGRAM_CHAT_ID)
    else:
        log.warning(f"{LogColors.WARNING}Failed to generate daily update summary from Kinos AI or data is incomplete.{LogColors.ENDC}")
        # Optionally send a fallback message
        fallback_markdown_message = "The daily update from Venice could not be generated at this time."
        send_telegram_notification(fallback_markdown_message, TELEGRAM_CHAT_ID)

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
