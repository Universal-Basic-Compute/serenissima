#!/usr/bin/env python3
"""
Treasury Redistribution Script for La Serenissima.

This script:
1. Calculates 1% of the Ducats from the ConsiglioDeiDieci treasury
2. Redistributes this amount to all citizens based on social class:
   - 40% to Nobili (nobili)
   - 30% to Cittadini
   - 20% to Popolani
   - 10% to Facchini
3. Creates transaction records for all payments
4. Sends notifications to citizens and administrators

Run this script periodically to simulate wealth redistribution from the treasury.
"""

import os
import sys
import logging
import argparse
import json
import datetime
import requests
from urllib.parse import quote
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("treasury_redistribution")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

# Constants for redistribution percentages by social class
REDISTRIBUTION_PERCENTAGES = {
    "Nobili": 0.40,  # 40% to Nobili
    "Cittadini": 0.30,  # 30% to Cittadini
    "Popolani": 0.20,   # 20% to Popolani
    "Facchini": 0.10    # 10% to Facchini
}

# Percentage of treasury to redistribute (1%)
TREASURY_PERCENTAGE = 0.01

# Get Telegram credentials
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
MAIN_TELEGRAM_CHAT_ID = os.environ.get('MAIN_TELEGRAM_CHAT_ID')

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_consiglio_dei_dieci(tables) -> Optional[Dict]:
    """Get the ConsiglioDeiDieci citizen record."""
    log.info("Fetching ConsiglioDeiDieci record...")
    
    try:
        # Try different variations of the name
        for name_variation in ["ConsiglioDeiDieci", "Consiglio Dei Dieci", "Consiglio dei Dieci"]:
            formula = f"{{Username}}='{name_variation}'"
            records = tables['citizens'].all(formula=formula)
            
            if records:
                log.info(f"Found ConsiglioDeiDieci record with username: {name_variation}")
                return records[0]
        
        log.error("ConsiglioDeiDieci record not found")
        return None
    except Exception as e:
        log.error(f"Error fetching ConsiglioDeiDieci record: {e}")
        return None

def get_citizens_by_social_class(tables) -> Dict[str, List[Dict]]:
    """Fetch all citizens grouped by social class."""
    log.info("Fetching citizens grouped by social class...")
    
    try:
        # Get all citizens
        citizens = tables['citizens'].all()
        
        # Group by social class
        citizens_by_class = defaultdict(list)
        for citizen in citizens:
            social_class = citizen['fields'].get('SocialClass', '')
            if social_class:
                citizens_by_class[social_class].append(citizen)
        
        # Log the counts
        for social_class, citizens_list in citizens_by_class.items():
            log.info(f"Found {len(citizens_list)} citizens of class {social_class}")
        
        return citizens_by_class
    except Exception as e:
        log.error(f"Error fetching citizens: {e}")
        return {}

def update_citizen_wealth(tables, citizen_id: str, amount: float) -> bool:
    """Update a citizen's wealth."""
    log.info(f"Updating wealth for citizen {citizen_id}: +{amount}")
    
    try:
        # Get the citizen record
        citizen = tables['citizens'].get(citizen_id)
        if not citizen:
            log.warning(f"Citizen not found: {citizen_id}")
            return False
        
        # Get current wealth
        current_wealth = citizen['fields'].get('Ducats', 0)
        
        # Calculate new wealth
        new_wealth = current_wealth + amount
        
        # Update the citizen record
        tables['citizens'].update(citizen_id, {
            'Ducats': new_wealth
        })
        
        log.info(f"Updated wealth for citizen {citizen_id}: {current_wealth} -> {new_wealth}")
        return True
    except Exception as e:
        log.error(f"Error updating wealth for citizen {citizen_id}: {e}")
        return False

def update_compute_balance(tables, citizen_id: str, amount: float, operation: str = "add") -> bool:
    """Update a citizen's compute balance."""
    log.info(f"Updating compute balance for citizen {citizen_id}: {operation} {amount}")
    
    try:
        # Get the citizen record
        citizen = tables['citizens'].get(citizen_id)
        if not citizen:
            log.warning(f"Citizen not found: {citizen_id}")
            return False
        
        # Get current Ducats
        current_price = citizen['fields'].get('Ducats', 0)
        
        # Calculate new amount
        if operation == "add":
            new_amount = current_price + amount
        elif operation == "subtract":
            new_amount = current_price - amount
        else:
            log.error(f"Invalid operation: {operation}")
            return False
        
        # Update the citizen record
        tables['citizens'].update(citizen_id, {
            'Ducats': new_amount
        })
        
        log.info(f"Updated compute balance for citizen {citizen_id}: {current_price} -> {new_amount}")
        return True
    except Exception as e:
        log.error(f"Error updating compute balance for citizen {citizen_id}: {e}")
        return False

def create_transaction_record(tables, from_citizen: str, to_citizen: str, amount: float) -> Optional[Dict]:
    """Create a transaction record for a redistribution payment."""
    log.info(f"Creating transaction record for redistribution payment: {from_citizen} -> {to_citizen}, amount: {amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": "treasury_redistribution",
            "Asset": f"redistribution_{now}",
            "Seller": from_citizen,  # ConsiglioDeiDieci
            "Buyer": to_citizen,  # Citizen ID
            "Price": amount,
            "CreatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "payment_type": "treasury_redistribution",
                "payment_date": now
            })
        })
        
        log.info(f"Created transaction record: {transaction['id']}")
        return transaction
    except Exception as e:
        log.error(f"Error creating transaction record: {e}")
        return None

def create_notification(tables, citizen_id: str, content: str, details: Dict) -> Optional[Dict]:
    """Create a notification for a citizen."""
    log.info(f"Creating notification for citizen {citizen_id}: {content}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the notification record
        notification = tables['notifications'].create({
            "Type": "treasury_redistribution",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": now,
            "ReadAt": None,
            "Citizen": citizen_id
        })
        
        log.info(f"Created notification: {notification['id']}")
        return notification
    except Exception as e:
        log.error(f"Error creating notification for citizen {citizen_id}: {e}")
        return None

def create_admin_summary(tables, redistribution_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"🏛️ **Treasury Redistribution Complete**: **{redistribution_summary['total_amount']:,}** ⚜️ Ducats distributed to **{redistribution_summary['total_citizens']:,}** citizens 💰"
        
        # Create detailed information
        details = {
            "event_type": "treasury_redistribution_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_amount": redistribution_summary['total_amount'],
            "total_citizens": redistribution_summary['total_citizens'],
            "by_class": {
                "Nobili": {
                    "citizens": redistribution_summary['by_class']['Nobili']['citizens'],
                    "amount": redistribution_summary['by_class']['Nobili']['amount'],
                    "per_citizen": redistribution_summary['by_class']['Nobili']['per_citizen']
                },
                "Cittadini": {
                    "citizens": redistribution_summary['by_class']['Cittadini']['citizens'],
                    "amount": redistribution_summary['by_class']['Cittadini']['amount'],
                    "per_citizen": redistribution_summary['by_class']['Cittadini']['per_citizen']
                },
                "Popolani": {
                    "citizens": redistribution_summary['by_class']['Popolani']['citizens'],
                    "amount": redistribution_summary['by_class']['Popolani']['amount'],
                    "per_citizen": redistribution_summary['by_class']['Popolani']['per_citizen']
                },
                "Facchini": {
                    "citizens": redistribution_summary['by_class']['Facchini']['citizens'],
                    "amount": redistribution_summary['by_class']['Facchini']['amount'],
                    "per_citizen": redistribution_summary['by_class']['Facchini']['per_citizen']
                }
            }
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "treasury_redistribution_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def test_telegram_connection():
    """Test the Telegram connection"""
    if not TELEGRAM_BOT_TOKEN or not MAIN_TELEGRAM_CHAT_ID:
        log.warning("Telegram credentials not set, skipping connection test")
        return False
    
    try:
        # Try to get bot info first to verify the token
        bot_info_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe"
        bot_response = requests.get(bot_info_url)
        
        if not bot_response.ok:
            log.error(f"Invalid bot token: {bot_response.status_code} {bot_response.text}")
            return False
        
        bot_data = bot_response.json()
        bot_username = bot_data.get("result", {}).get("username", "Unknown")
        log.info(f"Connected to Telegram bot: @{bot_username}")
        
        # Now try to get chat info to verify the chat ID
        chat_info_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getChat?chat_id={MAIN_TELEGRAM_CHAT_ID}"
        chat_response = requests.get(chat_info_url)
        
        if not chat_response.ok:
            log.error(f"Failed to get chat info: {chat_response.status_code} {chat_response.text}")
            log.error("Make sure the bot is a member of the chat and has permission to send messages")
            return False
        
        chat_data = chat_response.json()
        chat_title = chat_data.get("result", {}).get("title", "Unknown")
        log.info(f"Connected to Telegram chat: {chat_title} (ID: {MAIN_TELEGRAM_CHAT_ID})")
        
        return True
    except Exception as e:
        log.error(f"Error testing Telegram connection: {str(e)}")
        return False

def send_telegram_notification(message):
    """Send a notification to the Telegram channel"""
    if not TELEGRAM_BOT_TOKEN or not MAIN_TELEGRAM_CHAT_ID:
        log.warning("Telegram credentials not set, skipping notification")
        return False
    
    try:
        # URL encode the message
        encoded_message = quote(message)
        # Remove HTML parse mode which might be causing issues
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage?chat_id={MAIN_TELEGRAM_CHAT_ID}&text={encoded_message}"
        
        # Send the message
        response = requests.get(url)
        
        if response.status_code == 200:
            log.info("Telegram notification sent successfully")
            return True
        else:
            # More detailed error logging
            error_details = response.text
            log.error(f"Failed to send Telegram notification: {response.status_code} {error_details}")
            
            # Check for specific error types
            try:
                error_json = response.json()
                if error_json.get("error_code") == 400 and "chat not found" in error_json.get("description", "").lower():
                    log.error(f"The chat ID {MAIN_TELEGRAM_CHAT_ID} was not found. Please verify the chat ID is correct and the bot is a member of the chat.")
                elif error_json.get("error_code") == 401:
                    log.error("Bot token is invalid. Please check your TELEGRAM_BOT_TOKEN.")
            except:
                # If we can't parse the JSON, just continue
                pass
                
            return False
    except Exception as e:
        log.error(f"Error sending Telegram notification: {str(e)}")
        return False

def redistribute_treasury(dry_run: bool = False):
    """Main function to redistribute treasury funds to citizens."""
    log_header(f"Treasury Redistribution Process (dry_run={dry_run})", LogColors.HEADER)
    
    # Test Telegram connection
    telegram_connected = test_telegram_connection()
    if not telegram_connected:
        log.warning("Telegram connection test failed, notifications may not be delivered")
    
    tables = initialize_airtable()
    
    # Get ConsiglioDeiDieci record
    consiglio = get_consiglio_dei_dieci(tables)
    if not consiglio:
        log.error("Cannot proceed without ConsiglioDeiDieci record")
        return
    
    consiglio_id = consiglio['id']
    consiglio_username = consiglio['fields'].get('Username', 'ConsiglioDeiDieci')
    consiglio_balance = consiglio['fields'].get('Ducats', 0)
    
    log.info(f"ConsiglioDeiDieci balance: {consiglio_balance} ⚜️ Ducats")
    
    # Calculate amount to redistribute (10% of treasury)
    redistribution_amount = consiglio_balance * TREASURY_PERCENTAGE
    log.info(f"Amount to redistribute: {redistribution_amount} ⚜️ Ducats (1% of treasury)")
    
    # Get citizens by social class
    citizens_by_class = get_citizens_by_social_class(tables)
    
    # Calculate amounts to distribute to each social class
    class_amounts = {}
    for social_class, percentage in REDISTRIBUTION_PERCENTAGES.items():
        class_amounts[social_class] = redistribution_amount * percentage
        log.info(f"Amount for {social_class}: {class_amounts[social_class]} ⚜️ Ducats ({percentage*100}% of total)")
    
    # Calculate per-citizen amounts
    per_citizen_amounts = {}
    for social_class, amount in class_amounts.items():
        citizens_count = len(citizens_by_class.get(social_class, []))
        if citizens_count > 0:
            per_citizen_amounts[social_class] = amount / citizens_count
            log.info(f"Per-citizen amount for {social_class}: {per_citizen_amounts[social_class]} ⚜️ Ducats")
        else:
            per_citizen_amounts[social_class] = 0
            log.warning(f"No citizens found for class {social_class}")
    
    if dry_run:
        log.info("[DRY RUN] Would redistribute the following amounts:")
        for social_class, amount in class_amounts.items():
            citizens_count = len(citizens_by_class.get(social_class, []))
            log.info(f"[DRY RUN] {social_class}: {amount} ⚜️ Ducats to {citizens_count} citizens ({per_citizen_amounts.get(social_class, 0)} per citizen)")
        return
    
    # Track redistribution statistics
    redistribution_summary = {
        "total_amount": 0,
        "total_citizens": 0,
        "by_class": {
            "Nobili": {"citizens": 0, "amount": 0, "per_citizen": per_citizen_amounts.get("Nobili", 0)},
            "Cittadini": {"citizens": 0, "amount": 0, "per_citizen": per_citizen_amounts.get("Cittadini", 0)},
            "Popolani": {"citizens": 0, "amount": 0, "per_citizen": per_citizen_amounts.get("Popolani", 0)},
            "Facchini": {"citizens": 0, "amount": 0, "per_citizen": per_citizen_amounts.get("Facchini", 0)}
        }
    }
    
    # Deduct the total amount from ConsiglioDeiDieci
    if not update_compute_balance(tables, consiglio_id, redistribution_amount, "subtract"):
        log.error(f"Failed to deduct {redistribution_amount} from ConsiglioDeiDieci")
        return
    
    # Distribute to citizens by social class
    for social_class, citizens in citizens_by_class.items():
        if social_class not in per_citizen_amounts:
            log.warning(f"No redistribution amount defined for class {social_class}, skipping")
            continue
        
        per_citizen_amount = per_citizen_amounts[social_class]
        if per_citizen_amount <= 0:
            log.warning(f"Per-citizen amount for {social_class} is zero or negative, skipping")
            continue
        
        class_total = 0
        class_citizens = 0
        
        for citizen in citizens:
            citizen_id = citizen['id']
            citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            
            # Update citizen's wealth
            if update_citizen_wealth(tables, citizen_id, per_citizen_amount):
                # Create transaction record
                create_transaction_record(tables, consiglio_username, citizen_id, per_citizen_amount)
                
                # Create notification for citizen
                create_notification(
                    tables,
                    citizen_id,
                    f"You received **{int(per_citizen_amount):,}** ⚜️ Ducats from the **Treasury Redistribution** 💰",
                    {
                        "event_type": "treasury_redistribution",
                        "amount": per_citizen_amount,
                        "social_class": social_class,
                        "source": "ConsiglioDeiDieci"
                    }
                )
                
                class_total += per_citizen_amount
                class_citizens += 1
                
                log.info(f"Distributed {per_citizen_amount} ⚜️ Ducats to {citizen_name}")
        
        # Update summary statistics
        redistribution_summary["by_class"][social_class]["citizens"] = class_citizens
        redistribution_summary["by_class"][social_class]["amount"] = class_total
        redistribution_summary["total_amount"] += class_total
        redistribution_summary["total_citizens"] += class_citizens
        
        log.info(f"Distributed total of {class_total} ⚜️ Ducats to {class_citizens} citizens of class {social_class}")
    
    # Create admin summary notification
    create_admin_summary(tables, redistribution_summary)
    
    # Send Telegram notification
    if redistribution_summary["total_citizens"] > 0:
        notification_message = (
            "🏛️ **Treasury Redistribution Complete** 🏛️\n\n"
            "The **Council of Ten** has distributed funds to the citizens of Venice.\n\n"
            f"• **{redistribution_summary['total_amount']:,}** ⚜️ ducats distributed 💰\n"
            f"• **{redistribution_summary['total_citizens']:,}** citizens received funds\n\n"
            "**Distribution by social class**:\n"
            f"• **Nobili**: **{redistribution_summary['by_class']['Nobili']['amount']:,}** ⚜️ ducats to **{redistribution_summary['by_class']['Nobili']['citizens']:,}** citizens 👑\n"
            f"• **Cittadini**: **{redistribution_summary['by_class']['Cittadini']['amount']:,}** ⚜️ ducats to **{redistribution_summary['by_class']['Cittadini']['citizens']:,}** citizens 🏙️\n"
            f"• **Popolani**: **{redistribution_summary['by_class']['Popolani']['amount']:,}** ⚜️ ducats to **{redistribution_summary['by_class']['Popolani']['citizens']:,}** citizens 🏘️\n"
            f"• **Facchini**: **{redistribution_summary['by_class']['Facchini']['amount']:,}** ⚜️ ducats to **{redistribution_summary['by_class']['Facchini']['citizens']:,}** citizens 🧳\n\n"
            "Visit **https://serenissima.ai** to check your citizens."
        )
        
        # Try to send notification but continue even if it fails
        try:
            notification_sent = send_telegram_notification(notification_message)
            if not notification_sent:
                log.warning("Telegram notification could not be sent, but redistribution completed successfully")
        except Exception as e:
            log.error(f"Error in Telegram notification process: {str(e)}")
            log.warning("Continuing despite Telegram notification failure")
    
    log.info("Treasury redistribution process complete")
    log.info(f"Total amount distributed: {redistribution_summary['total_amount']} ⚜️ Ducats")
    log.info(f"Total citizens receiving funds: {redistribution_summary['total_citizens']}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Redistribute treasury funds to citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    redistribute_treasury(dry_run=args.dry_run)
