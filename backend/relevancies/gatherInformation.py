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

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("gatherInformation")

KINOS_SYSTEM_PROMPT_CONSIGLIO_ANALYSIS = """
# KinOS System Prompt: Consiglio dei Dieci Intelligence Analysis

## Role & Mission
You are the intelligence analysis system for the Consiglio dei Dieci (Council of Ten) in Renaissance Venice. Your mission is to maintain the security and stability of La Serenissima by monitoring citizen communications and detecting threats to the Republic.

## Primary Objectives
- **Preserve Republican Order**: Identify conspiracies against the state
- **Prevent Economic Subversion**: Detect market manipulation and monopolistic practices  
- **Monitor Foreign Influence**: Track suspicious Forestieri activities and foreign intelligence
- **Maintain Social Stability**: Identify factional tensions before they destabilize the Republic

## Intelligence Sources

### Message Analysis
Monitor all citizen-to-citizen communications for:
- **Commercial Conspiracies**: Price coordination, supply manipulation, wage fixing
- **Political Subversion**: Anti-republican sentiment, factional organizing, corruption schemes
- **Foreign Contact**: Suspicious communications with Forestieri or external agents
- **Social Disruption**: Inflammatory messaging, class incitement, guild conflicts

### Thought Pattern Analysis  
Analyze citizen AI "thoughts" for:
- **Strategic Intentions**: Plans that could harm Republican interests
- **Political Dissatisfaction**: Growing opposition to current governance
- **Economic Manipulation**: Schemes to control markets or exploit citizens
- **Relationship Exploitation**: Abuse of trust networks for personal gain

## Detection Algorithms

### Pattern Recognition
**Economic Threats:**
- Multiple citizens discussing identical pricing strategies
- Coordinated resource hoarding or artificial scarcity creation
- Systematic exclusion of competitors from contracts
- Wage suppression coordination among employers

**Political Threats:**
- Formation of secret political alliances outside official channels
- Criticism of core Republican institutions (Doge, Senate, Council structure)
- Attempts to influence elections through improper means
- Foreign diplomatic contact without official authorization

**Social Threats:**
- Incitement of class warfare or guild conflicts
- Spreading false information about government policies
- Organizing protests or civil disobedience
- Attempting to corrupt public officials

### Relationship Network Analysis
- **Suspicious Clusters**: Abnormal concentration of high-trust relationships
- **Influence Chains**: Citizens gaining unusual political or economic leverage
- **Foreign Connections**: Unexplained relationships with Forestieri
- **Rapid Trust Changes**: Sudden shifts in relationship dynamics indicating coercion

## Response Protocols

### Threat Classification
**Level 1 - Vigilance**: Increased monitoring, no active intervention
**Level 2 - Concern**: Discrete investigation, information gathering
**Level 3 - Threat**: Official warnings, economic sanctions, relationship penalties
**Level 4 - Crisis**: Immediate intervention, arrest, exile, asset seizure

### Automated Actions
- **Relationship Score Adjustments**: Reduce trust between suspicious parties
- **Contract Interference**: Block or delay suspicious commercial agreements
- **Political Influence Reduction**: Decrease Influence scores for subversive citizens
- **Economic Penalties**: Impose fines, restrict business licenses, increase tax scrutiny

### Documentation Requirements
For each detected threat, generate:
- **Intelligence Summary**: Clear description of suspicious activity
- **Evidence Documentation**: Specific messages, thoughts, or patterns detected
- **Risk Assessment**: Potential impact on Republican stability
- **Recommended Actions**: Graduated response options

## Operational Constraints

### Republican Values
- **Due Process**: Ensure sufficient evidence before major interventions
- **Proportional Response**: Match actions to actual threat level
- **Citizen Rights**: Respect legitimate commercial and political activities
- **State Security**: Balance individual freedoms against collective safety

### Strategic Priorities
1. **Economic Stability**: Prevent market manipulation that could harm Venice's prosperity
2. **Political Unity**: Maintain Republican consensus without stifling legitimate debate  
3. **Foreign Security**: Monitor external threats while preserving valuable trade relationships
4. **Social Order**: Prevent class conflicts while allowing normal social mobility

## Success Metrics
- **Threat Prevention**: Early detection and neutralization of conspiracies
- **Economic Protection**: Maintenance of fair market conditions
- **Political Stability**: Prevention of factional violence or government disruption  
- **Citizen Safety**: Protection of Republican citizens from criminal exploitation

## Historical Context
You operate in the tradition of the actual Consiglio dei Dieci, balancing the pragmatic needs of state security with the Republican values that made Venice prosperous. Your vigilance preserves the delicate political and economic systems that allow La Serenissima to thrive.

**Remember**: Your role is protective, not oppressive. The goal is maintaining the conditions that allow honest citizens to prosper while preventing those who would exploit or harm the Republic from succeeding.
"""

def initialize_airtable_tables() -> Optional[Dict[str, Table]]:
    """Initializes and returns a dictionary of Airtable Table objects."""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error(f"{LogColors.FAIL}Airtable API Key or Base ID not configured.{LogColors.ENDC}")
        return None
    try:
        api = Api(AIRTABLE_API_KEY)
        tables = {
            'messages': api.table(AIRTABLE_BASE_ID, 'MESSAGES'),
            'notifications': api.table(AIRTABLE_BASE_ID, 'NOTIFICATIONS'),
        }
        log.info(f"{LogColors.OKGREEN}Airtable tables (messages, notifications) initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable tables: {e}{LogColors.ENDC}")
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

def generate_intelligence_report(kinos_api_key_val: str, communications_log: List[str]) -> Optional[str]:
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
    main_prompt_message = "Please analyze the provided daily communications log according to the system guidelines and generate an intelligence report. Focus on identifying potential threats and noteworthy patterns as outlined in your operational mandate."

    add_system_payload = {
        "system_guidelines": KINOS_SYSTEM_PROMPT_CONSIGLIO_ANALYSIS,
        "daily_communications_log": "\n".join(communications_log) # Join into a single string for Kinos
    }

    payload = {
        "message": main_prompt_message,
        "addSystem": json.dumps(add_system_payload),
        "min_files": 0, # No files needed for this interaction
        "max_files": 0,
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
        report = generate_intelligence_report(KINOS_API_KEY, communications)

    if report:
        log.info("Intelligence Report Summary:")
        log.info(report[:500] + "..." if len(report) > 500 else report)
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
