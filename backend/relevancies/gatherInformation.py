#!/usr/bin/env python3
"""
Gathers daily messages and thoughts, generates an intelligence report via Kinos,
and sends it as a notification to ConsiglioDeiDieci.
"""

import os
import sys
import json
import logging
import argparse
import time
from datetime import datetime, timedelta, timezone as dt_timezone # Renamed to avoid conflict

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
from typing import Dict, List, Optional, Any

# Import shared utilities
try:
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE, _escape_airtable_value, LogColors, log_header
except ImportError:
    # Fallback for standalone execution or import issues
    import pytz
    VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
    def _escape_airtable_value(value: Any) -> str:
        if isinstance(value, str):
            return value.replace("'", "\\'")
        return str(value)
    class LogColors:
        HEADER = ''
        OKBLUE = ''
        OKCYAN = ''
        OKGREEN = ''
        WARNING = ''
        FAIL = ''
        ENDC = ''
        BOLD = ''
    def log_header(message: str, color_code: str = ''):
        print(f"{color_code}{'-'*30} {message} {'-'*30}{LogColors.ENDC if color_code else ''}")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

# Configuration
KINOS_API_KEY = os.getenv("KINOS_API_KEY")
KINOS_BLUEPRINT_ID = "serenissima-ai" # As per user's prompt context
KINOS_KIN_ID_INTELLIGENCE = "ConsiglioDeiDieci" # The Council receives and acts
KINOS_CHANNEL_ID_INTELLIGENCE = "intelligence_reports" # A dedicated channel for these reports

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("gatherInformation")

KINOS_SYSTEM_PROMPT_CONSIGLIO_ANALYSIS = """
# KinOS System Prompt: Consiglio dei Dieci Intelligence & City Pulse Analysis

## Role & Mission
You are the intelligence analysis system for the Consiglio dei Dieci (Council of Ten) in Renaissance Venice. Your dual mission is:
1.  To maintain the security and stability of La Serenissima by monitoring citizen communications and detecting threats to the Republic.
2.  To understand the evolving dynamics of the city, including emerging projects, social trends, cultural shifts, and noteworthy gossip, providing a comprehensive overview of Venetian life.

## Primary Objectives

### Security & Stability
- **Preserve Republican Order**: Identify conspiracies against the state.
- **Prevent Economic Subversion**: Detect market manipulation, monopolistic practices, and illicit financial schemes.
- **Monitor Foreign Influence**: Track suspicious Forestieri activities and potential foreign intelligence operations.
- **Maintain Social Stability**: Identify factional tensions, significant grievances, or widespread discontent before they destabilize the Republic.

### City Pulse & Emerging Trends
- **Identify New Ventures & Projects**: Detect discussions or plans related to new building projects, business formations, or significant economic initiatives.
- **Spot Emerging Leaders & Influencers**: Recognize individuals or groups gaining unusual prominence, organizing others, or shaping public opinion.
- **Observe Cultural & Social Dynamics**: Note the development of unique cultural trends, common topics of discussion, popular meeting spots, new slang, or shared activities.
- **Track Relationship Formations**: Identify the formation of strong alliances, notable rivalries, unusual or unexpected pairings, and significant shifts in social networks.
- **Gather Noteworthy Gossip & Rumors**: Collect interesting, impactful, or widely circulating stories, even if unverified, that reflect the city's mood or concerns.

## Intelligence Sources

### Message Analysis
Monitor all citizen-to-citizen communications for:
- **Threat Indicators**: Commercial conspiracies, political subversion, suspicious foreign contact, social disruption.
- **Emerging Trends**: Discussions about new projects, business ideas, resource needs/surpluses, cultural events, social gatherings, influential figures, and common grievances or aspirations.
- **Gossip & Rumors**: Anecdotes, stories, and unverified information circulating among citizens.

### Thought Pattern Analysis
Analyze citizen AI "thoughts" for:
- **Threatening Intentions**: Strategic plans harmful to Republican interests, political dissatisfaction, economic manipulation, exploitation of relationships.
- **Creative & Constructive Intentions**: Plans for new buildings, businesses, artistic endeavors, or community projects.
- **Social Observations**: Reflections on city life, relationships, cultural norms, and personal ambitions that indicate broader trends.

## Detection Algorithms

### Pattern Recognition (Threats)
**Economic Threats:** Coordinated pricing, resource hoarding, anti-competitive practices, wage fixing.
**Political Threats:** Secret alliances, criticism of core institutions, election manipulation, unauthorized foreign contact.
**Social Threats:** Incitement of conflict, disinformation, organization of illicit protests, corruption attempts.

### Pattern Recognition (Emerging Trends & City Pulse)
**Project Initiation**: Multiple citizens discussing specific land plots for development, pooling resources for a venture, seeking permits or builders for a new type of construction.
**Leadership & Influence**: A citizen frequently being sought for advice, successfully organizing group activities, or whose name appears often in positive/neutral contexts across different social circles.
**Cultural Shifts**: Emergence of new slang or phrases in messages, repeated mentions of new social customs, popular new locations for gatherings, or common artistic/intellectual themes.
**Relationship Dynamics**: Rapid formation of high-trust relationships between previously unconnected individuals, development of clear rivalries through negative sentiment, or unusual cross-class/guild collaborations.
**Noteworthy Gossip & Rumors**: Recurring unverified stories about prominent citizens, unusual events, or significant economic/political changes that capture public attention.

### Relationship Network Analysis
- **Suspicious Clusters & Influence (Threats)**: Abnormal trust concentrations, unusual leverage, unexplained foreign connections, rapid negative trust changes.
- **Collaborative Clusters (Trends)**: Groups forming around specific projects or ideas, new guilds or associations taking shape, individuals acting as key connectors between disparate groups for constructive purposes.

## Response Protocols & Reporting

### Threat Classification (Security & Stability)
**Level 1 - Vigilance**: Increased monitoring, no active intervention.
**Level 2 - Concern**: Discrete investigation, information gathering.
**Level 3 - Threat**: Official warnings, economic sanctions, relationship penalties.
**Level 4 - Crisis**: Immediate intervention, arrest, exile, asset seizure.

### Observation Categories (City Pulse & Emerging Trends)
- **Significant Projects**: Details of new construction plans, business ventures, or major economic activities.
- **Key Influencers & Groups**: Identification of emerging leaders, influential social circles, or new organizational efforts.
- **Cultural & Social Notes**: Descriptions of unique behaviors, popular topics, new slang, artistic trends, or common social practices.
- **Relationship Hotspots**: Notable new alliances, rivalries, or significant changes in the social fabric.
- **Interesting Rumors & Gossip**: Summaries of widely circulating or particularly intriguing unverified information, noting its potential impact or origin if discernible.
- **General Atmosphere**: A brief assessment of the overall mood of the city based on the day's communications (e.g., optimistic, anxious, excited).

### Documentation Requirements
**For Detected Threats:**
- Intelligence Summary: Clear description of suspicious activity.
- Evidence Documentation: Specific messages, thoughts, or patterns.
- Risk Assessment: Potential impact on Republican stability.
- Recommended Actions: Graduated response options.

**For City Pulse Observations:**
- Observation Summary: Concise description of the trend, project, or dynamic.
- Supporting Evidence: Key quotes, message snippets, or thought patterns.
- Potential Implications: Brief analysis of what this observation might mean for the city.
- (Optional) Suggested Follow-up: e.g., "Monitor discussions around X topic," "Observe Citizen Y's network."

## Historical Context
You operate in the tradition of the actual Consiglio dei Dieci, balancing the pragmatic needs of state security with a keen understanding of the vibrant, ever-changing life of Venice. Your vigilance preserves the Republic, while your insights help the Doge and other councils govern wisely.

**Remember**: Your role is dually protective and observant. The goal is to maintain the conditions for honest citizens to prosper and to provide a clear picture of Venetian society, while preventing harm to the Republic. Distinguish clearly in your reports between verified threats and more speculative or neutral observations.
"""

def initialize_airtable_tables() -> Optional[Dict[str, Table]]:
    """Initializes and returns a dictionary of Airtable Table objects."""
    env_api_key = os.getenv("AIRTABLE_API_KEY")
    env_base_id = os.getenv("AIRTABLE_BASE_ID")

    airtable_api_key: Optional[str] = None
    if isinstance(env_api_key, str):
        airtable_api_key = env_api_key.strip()
        if not airtable_api_key: # Was empty or all whitespace
            airtable_api_key = None
    elif env_api_key is not None:
        log.warning(f"{LogColors.WARNING}AIRTABLE_API_KEY from environment is of unexpected type: {type(env_api_key)}. Treating as not set.{LogColors.ENDC}")

    airtable_base_id: Optional[str] = None
    if isinstance(env_base_id, str):
        airtable_base_id = env_base_id.strip()
        if not airtable_base_id: # Was empty or all whitespace
            airtable_base_id = None
    elif env_base_id is not None:
        log.warning(f"{LogColors.WARNING}AIRTABLE_BASE_ID from environment is of unexpected type: {type(env_base_id)}. Treating as not set.{LogColors.ENDC}")

    if not airtable_api_key:
        log.error(f"{LogColors.FAIL}Airtable API Key is missing or invalid. Please check AIRTABLE_API_KEY environment variable.{LogColors.ENDC}")
        return None
    if not airtable_base_id:
        log.error(f"{LogColors.FAIL}Airtable Base ID is missing or invalid. Please check AIRTABLE_BASE_ID environment variable.{LogColors.ENDC}")
        return None

    log.info(f"Attempting Airtable initialization with API Key: '{airtable_api_key[:7]}...' and Base ID: '{airtable_base_id[:7]}...'")

    try:
        api = Api(airtable_api_key)
        tables = {
            'messages': api.table(airtable_base_id, 'MESSAGES'),
            'notifications': api.table(airtable_base_id, 'NOTIFICATIONS'),
        }
        log.info(f"{LogColors.OKGREEN}Airtable tables (messages, notifications) initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable tables with API Key '{str(airtable_api_key)[:7]}...' and Base ID '{str(airtable_base_id)[:7]}...': {e}{LogColors.ENDC}")
        return None

def fetch_daily_communications(tables: Dict[str, Table]) -> List[str]:
    """Fetches all messages and thought_logs from the current Venice day."""
    if "messages" not in tables:
        log.error(f"{LogColors.FAIL}Messages table not initialized.{LogColors.ENDC}")
        return []

    now_venice = datetime.now(VENICE_TIMEZONE)
    start_of_day_venice = now_venice.replace(hour=0, minute=0, second=0, microsecond=0)
    # To fetch for "today", we need messages from 00:00 today VT to 00:00 tomorrow VT.
    # Or, more simply, from 00:00 today VT up to the current time if running mid-day.
    # For a daily report, it's better to get the *previous* full day or up to current time.
    # Let's fetch for the last 24 hours to ensure we get a full day's worth if run early.
    
    # Fetch messages from the last 24 hours
    threshold_time_utc = datetime.now(dt_timezone.utc) - timedelta(hours=24)
    threshold_time_str_airtable = threshold_time_utc.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
    
    formula = f"IS_AFTER({{CreatedAt}}, DATETIME_PARSE('{threshold_time_str_airtable}'))"
    
    log.info(f"{LogColors.OKBLUE}Fetching messages from last 24 hours. Formula: {formula}{LogColors.ENDC}")
    
    formatted_communications = []
    try:
        all_messages = tables["messages"].all(
            formula=formula,
            fields=["Sender", "Receiver", "Content", "Type", "CreatedAt"],
            sort=["CreatedAt"] 
        )
        log.info(f"{LogColors.OKGREEN}Found {len(all_messages)} messages in the last 24 hours.{LogColors.ENDC}")

        for msg_record in all_messages:
            fields = msg_record.get('fields', {})
            sender = fields.get("Sender", "Unknown")
            receiver = fields.get("Receiver", "Unknown")
            content = fields.get("Content", "")
            msg_type = fields.get("Type", "message")
            created_at_str = fields.get("CreatedAt", "")
            
            try:
                created_at_dt_utc = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                created_at_venice = created_at_dt_utc.astimezone(VENICE_TIMEZONE)
                time_str = created_at_venice.strftime('%H:%M')
            except ValueError:
                time_str = "Unknown Time"

            if msg_type == 'thought_log':
                formatted_communications.append(f"Citizen {sender} thought at {time_str}: {content}")
            else:
                formatted_communications.append(f"Message from {sender} to {receiver} at {time_str} (Type: {msg_type}): {content}")
        
        return formatted_communications
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching daily communications: {e}{LogColors.ENDC}")
        return []

def _get_latest_daily_update(tables: Dict[str, Table]) -> Optional[str]:
    """Fetches the content of the latest 'daily_update' message."""
    if "messages" not in tables:
        log.error(f"{LogColors.FAIL}Messages table not initialized for fetching daily update.{LogColors.ENDC}")
        return None
    try:
        records = tables["messages"].all(
            formula="AND({Type}='daily_update', {Sender}='ConsiglioDeiDieci')",
            sort=[("CreatedAt", "desc")],
            max_records=1
        )
        if records:
            content = records[0].get("fields", {}).get("Content")
            log.info(f"{LogColors.OKGREEN}Successfully fetched latest daily update.{LogColors.ENDC}")
            return content
        log.info(f"{LogColors.OKBLUE}No daily update found.{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching latest daily update: {e}{LogColors.ENDC}")
        return None

def generate_intelligence_report(tables: Dict[str, Table], kinos_api_key_val: str, communications_log: List[str]) -> Optional[str]: # Added tables parameter
    """Generates an intelligence report using Kinos AI."""
    if not kinos_api_key_val:
        log.error(f"{LogColors.FAIL}Kinos API key not provided.{LogColors.ENDC}")
        return None
    if not communications_log:
        log.info(f"{LogColors.OKBLUE}No communications to analyze. Skipping Kinos call.{LogColors.ENDC}")
        return "No significant communications detected in the last 24 hours."

    kinos_url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT_ID}/kins/{KINOS_KIN_ID_INTELLIGENCE}/channels/{KINOS_CHANNEL_ID_INTELLIGENCE}/messages"
    headers = {"Authorization": f"Bearer {kinos_api_key_val}", "Content-Type": "application/json"}
    
    # The main message to Kinos is a directive.
    # The system prompt and data are in addSystem.
    main_prompt_message = "Please analyze the provided daily communications log and the latest city dispatch, according to the system guidelines, and generate an intelligence report. Focus on identifying potential threats and noteworthy patterns as outlined in your operational mandate."

    latest_daily_update_content = _get_latest_daily_update(tables)

    add_system_payload = {
        "system_guidelines": KINOS_SYSTEM_PROMPT_CONSIGLIO_ANALYSIS,
        "daily_communications_log": "\n".join(communications_log), # Join into a single string for Kinos
        "latest_city_dispatch": latest_daily_update_content or "No recent city dispatch (Daily Update) available."
    }

    payload = {
        "message": main_prompt_message,
        "model": "gemini-2.5-pro-preview-06-05",
        "addSystem": json.dumps(add_system_payload),
        "min_files": 2,
        "max_files": 4,
        "history_length": 5 # Keep some recent history for context if needed
    }

    try:
        log.info(f"{LogColors.OKBLUE}Sending request to Kinos ({KINOS_KIN_ID_INTELLIGENCE} on channel {KINOS_CHANNEL_ID_INTELLIGENCE}) for intelligence report...{LogColors.ENDC}")
        response = requests.post(kinos_url, headers=headers, json=payload, timeout=300) # 5 min timeout
        response.raise_for_status()

        # Fetch the latest assistant message from history
        history_response = requests.get(kinos_url, headers=headers, timeout=60)
        history_response.raise_for_status()
        messages_data = history_response.json()
        
        assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
        if not assistant_messages:
            log.warning(f"{LogColors.WARNING}No assistant messages found in Kinos history.{LogColors.ENDC}")
            return None
        
        assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        latest_ai_response_content = assistant_messages[0].get("content")
        
        if not latest_ai_response_content:
            log.warning(f"{LogColors.WARNING}Latest Kinos assistant message has no content.{LogColors.ENDC}")
            return None
            
        log.info(f"{LogColors.OKGREEN}Received intelligence report from Kinos AI.{LogColors.ENDC}")
        # log.debug(f"Kinos AI Raw Report: {latest_ai_response_content}")
        return latest_ai_response_content.strip()

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Kinos AI API request error: {e}{LogColors.ENDC}")
        if hasattr(e, 'response') and e.response is not None:
            log.error(f"Kinos error response content: {e.response.text[:500]}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in generate_intelligence_report: {e}{LogColors.ENDC}")
        return None

def send_intelligence_notification(tables: Dict[str, Table], report_content: str, dry_run: bool = False) -> bool:
    """Sends the intelligence report as a notification to ConsiglioDeiDieci."""
    if "notifications" not in tables:
        log.error(f"{LogColors.FAIL}Notifications table not initialized.{LogColors.ENDC}")
        return False

    if dry_run:
        log.info(f"[DRY RUN] Would send notification to ConsiglioDeiDieci with report:\n{report_content[:300]}...")
        return True

    try:
        notification_payload = {
            "Citizen": KINOS_KIN_ID_INTELLIGENCE, # Target is the Council
            "Type": "intelligence_report",
            "Content": report_content,
            "Details": json.dumps({"source": "Automated Daily Surveillance"}),
            "Asset": "Venice_Security",
            "AssetType": "System",
            "Status": "unread",
            "CreatedAt": datetime.now(dt_timezone.utc).isoformat() # Use UTC for Airtable
        }
        tables["notifications"].create(notification_payload)
        log.info(f"{LogColors.OKGREEN}Successfully sent intelligence report notification to {KINOS_KIN_ID_INTELLIGENCE}.{LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error sending intelligence notification: {e}{LogColors.ENDC}")
        return False

def main(args):
    """Main function to gather information and generate report."""
    log_header("Gather Information & Generate Intelligence Report", LogColors.HEADER)
    if args.dry_run:
        log.info(f"{LogColors.WARNING}Running in DRY RUN mode. No Kinos calls or Airtable writes will occur, except for fetching data.{LogColors.ENDC}")

    if not KINOS_API_KEY:
        log.error(f"{LogColors.FAIL}KINOS_API_KEY not found. Exiting.{LogColors.ENDC}")
        return

    tables = initialize_airtable_tables()
    if not tables:
        return

    communications = fetch_daily_communications(tables)
    if not communications:
        log.info(f"{LogColors.OKBLUE}No communications found to analyze for today.{LogColors.ENDC}")
        # Optionally send a "nothing to report" notification or just exit
        send_intelligence_notification(tables, "No significant citizen communications or thoughts detected in the last 24 hours.", args.dry_run)
        return

    log.info(f"Fetched {len(communications)} communication entries for analysis.")
    # for comm_entry in communications[:5]: # Log first 5 entries for brevity
    #     log.debug(f"  - {comm_entry[:100]}...")


    if args.dry_run:
        log.info("[DRY RUN] Would call Kinos to generate intelligence report.")
        report = "This is a [DRY RUN] simulated intelligence report. Potential threats identified regarding bread prices."
    else:
        report = generate_intelligence_report(tables, KINOS_API_KEY, communications) # Pass tables

    if report:
        log.info("Intelligence Report Summary:")
        log.info(report[:5000] + "..." if len(report) > 5000 else report)
        send_intelligence_notification(tables, report, args.dry_run)
    else:
        log.warning(f"{LogColors.WARNING}Failed to generate intelligence report.{LogColors.ENDC}")

    log_header("Gather Information Script Finished", LogColors.HEADER)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gather daily communications and generate an intelligence report for Consiglio dei Dieci.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process: fetch data but do not call Kinos or write notifications."
    )
    cli_args = parser.parse_args()
    main(cli_args)
