#!/usr/bin/env python3
"""
Income Distribution Script
- Distributes simulated income from lands to their owners
- Transfers COMPUTE tokens from ConsiglioDeiDieci to land owners
- Runs daily via cron job
"""

import os
import sys
import json
import logging
import datetime
import requests
from urllib.parse import quote
from dotenv import load_dotenv
from pyairtable import Api, Table

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("income_distribution.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger("income_distributor")

# Load environment variables
load_dotenv()

# Get Airtable credentials
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_USERS_TABLE = os.getenv("AIRTABLE_USERS_TABLE", "Users")
AIRTABLE_LANDS_TABLE = os.getenv("AIRTABLE_LANDS_TABLE", "LANDS")
AIRTABLE_TRANSACTIONS_TABLE = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS")

# Get Telegram credentials
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
MAIN_TELEGRAM_CHAT_ID = os.getenv("MAIN_TELEGRAM_CHAT_ID")

# Check if credentials are set
if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
    log.error("Airtable credentials are not properly set in .env file")
    sys.exit(1)

def initialize_airtable():
    """Initialize Airtable connections"""
    try:
        airtable = Api(AIRTABLE_API_KEY)
        
        # Use the recommended approach instead of direct Table constructor
        users_table = airtable.table(AIRTABLE_BASE_ID, AIRTABLE_USERS_TABLE)
        lands_table = airtable.table(AIRTABLE_BASE_ID, AIRTABLE_LANDS_TABLE)
        transactions_table = airtable.table(AIRTABLE_BASE_ID, AIRTABLE_TRANSACTIONS_TABLE)
        
        # Test the connection
        log.info("Testing Airtable connection...")
        test_records = users_table.all(limit=1)
        log.info(f"Airtable connection successful. Found {len(test_records)} test records.")
        
        return users_table, lands_table, transactions_table
    except Exception as e:
        log.error(f"ERROR initializing Airtable: {str(e)}")
        sys.exit(1)

def get_consiglio_dei_dieci(users_table):
    """Get the ConsiglioDeiDieci user record"""
    try:
        formula = "{Username}='ConsiglioDeiDieci'"
        records = users_table.all(formula=formula)
        
        if not records:
            log.error("ConsiglioDeiDieci user not found")
            return None
        
        return records[0]
    except Exception as e:
        log.error(f"Error getting ConsiglioDeiDieci: {str(e)}")
        return None

def get_lands_with_income(lands_table):
    """Get all lands with simulated income"""
    try:
        # Get all lands
        lands = lands_table.all()
        
        # Filter lands with simulated income
        lands_with_income = []
        for land in lands:
            # Check if land has SimulatedIncome field directly
            if "SimulatedIncome" in land["fields"]:
                income = land["fields"]["SimulatedIncome"]
                if income and income > 0:
                    lands_with_income.append({
                        "id": land["id"],
                        "land_id": land["fields"].get("LandId", ""),
                        "owner": land["fields"].get("User", ""),
                        "income": income,
                        "historical_name": land["fields"].get("HistoricalName", "")
                    })
        
        log.info(f"Found {len(lands_with_income)} lands with simulated income")
        return lands_with_income
    except Exception as e:
        log.error(f"Error getting lands with income: {str(e)}")
        return []

def find_user_by_identifier(users_table, identifier):
    """Find a user by username or wallet address"""
    if not identifier:
        return None
    
    try:
        # First try by username
        formula = f"{{Username}}='{identifier}'"
        records = users_table.all(formula=formula)
        
        if records:
            return records[0]
        
        # Then try by wallet address
        formula = f"{{Wallet}}='{identifier}'"
        records = users_table.all(formula=formula)
        
        if records:
            return records[0]
        
        return None
    except Exception as e:
        log.error(f"Error finding user {identifier}: {str(e)}")
        return None

def update_compute_balance(users_table, user_id, amount, operation="add"):
    """Update a user's compute balance"""
    try:
        # Get current user record
        user_record = users_table.get(user_id)
        
        if not user_record:
            log.error(f"User record {user_id} not found")
            return False
        
        # Get current compute amount
        current_amount = user_record["fields"].get("ComputeAmount", 0)
        
        # Calculate new amount
        if operation == "add":
            new_amount = current_amount + amount
        elif operation == "subtract":
            new_amount = current_amount - amount
            if new_amount < 0:
                log.warning(f"Compute balance would go negative for user {user_id}. Setting to 0.")
                new_amount = 0
        else:
            log.error(f"Invalid operation: {operation}")
            return False
        
        # Update the record
        users_table.update(user_id, {"ComputeAmount": new_amount})
        log.info(f"Updated compute balance for user {user_id} from {current_amount} to {new_amount}")
        
        return True
    except Exception as e:
        log.error(f"Error updating compute balance for user {user_id}: {str(e)}")
        return False

def create_transaction_record(transactions_table, from_user, to_user, amount, land_id, land_name):
    """Create a transaction record for income distribution"""
    try:
        now = datetime.datetime.now().isoformat()
        
        transaction = {
            "Type": "income",
            "AssetId": land_id,
            "Seller": from_user,  # ConsiglioDeiDieci
            "Buyer": to_user,     # Land owner
            "Price": amount,
            "CreatedAt": now,
            "UpdatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "operation": "income_distribution",
                "land_id": land_id,
                "land_name": land_name,
                "distribution_date": now
            })
        }
        
        record = transactions_table.create(transaction)
        log.info(f"Created transaction record {record['id']} for {amount} COMPUTE from {from_user} to {to_user}")
        
        return record
    except Exception as e:
        log.error(f"Error creating transaction record: {str(e)}")
        return None

def send_telegram_notification(message):
    """Send a notification to the Telegram channel"""
    if not TELEGRAM_BOT_TOKEN or not MAIN_TELEGRAM_CHAT_ID:
        log.warning("Telegram credentials not set, skipping notification")
        return False
    
    try:
        # URL encode the message
        encoded_message = quote(message)
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage?chat_id={MAIN_TELEGRAM_CHAT_ID}&text={encoded_message}&parse_mode=HTML"
        
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

def distribute_income():
    """Main function to distribute income from lands to owners"""
    log.info("Starting income distribution process")
    
    # Add debug notification at the beginning
    try:
        log.info("Sending debug notification to Telegram")
        notification_message = (
            "🏛️ Income Distribution Debug 🏛️\n\n"
            "The income distribution script has started running."
        )
        send_telegram_notification(notification_message)
    except Exception as e:
        log.error(f"Error sending debug notification: {str(e)}")
        # Continue with the script even if notification fails
    
    # Initialize Airtable
    users_table, lands_table, transactions_table = initialize_airtable()
    
    # Get ConsiglioDeiDieci user
    consiglio = get_consiglio_dei_dieci(users_table)
    if not consiglio:
        log.error("Cannot proceed without ConsiglioDeiDieci user")
        return
    
    consiglio_id = consiglio["id"]
    consiglio_username = consiglio["fields"].get("Username", "ConsiglioDeiDieci")
    consiglio_balance = consiglio["fields"].get("ComputeAmount", 0)
    
    log.info(f"ConsiglioDeiDieci balance: {consiglio_balance} COMPUTE")
    
    # Get lands with income
    lands_with_income = get_lands_with_income(lands_table)
    
    # Calculate total income to distribute
    total_income = sum(land["income"] for land in lands_with_income)
    log.info(f"Total income to distribute: {total_income} COMPUTE")
    
    # Check if ConsiglioDeiDieci has enough balance
    if consiglio_balance < total_income:
        log.error(f"ConsiglioDeiDieci does not have enough balance ({consiglio_balance}) to distribute income ({total_income})")
        return
    
    # Track distribution statistics
    successful_distributions = 0
    failed_distributions = 0
    total_distributed = 0
    
    # Distribute income to each land owner
    for land in lands_with_income:
        owner_identifier = land["owner"]
        income_amount = land["income"]
        land_id = land["land_id"]
        land_name = land["historical_name"] or land_id
        
        log.info(f"Processing land {land_id} ({land_name}) with income {income_amount} for owner {owner_identifier}")
        
        # Skip if no owner
        if not owner_identifier:
            log.warning(f"Land {land_id} has no owner, skipping")
            failed_distributions += 1
            continue
        
        # Find owner user record
        owner = find_user_by_identifier(users_table, owner_identifier)
        if not owner:
            log.warning(f"Owner {owner_identifier} not found, skipping")
            failed_distributions += 1
            continue
        
        owner_id = owner["id"]
        owner_username = owner["fields"].get("Username", owner_identifier)
        
        # Subtract from ConsiglioDeiDieci
        if not update_compute_balance(users_table, consiglio_id, income_amount, "subtract"):
            log.error(f"Failed to subtract {income_amount} from ConsiglioDeiDieci")
            failed_distributions += 1
            continue
        
        # Add to owner
        if not update_compute_balance(users_table, owner_id, income_amount, "add"):
            log.error(f"Failed to add {income_amount} to {owner_username}, reverting ConsiglioDeiDieci balance")
            # Revert ConsiglioDeiDieci balance
            update_compute_balance(users_table, consiglio_id, income_amount, "add")
            failed_distributions += 1
            continue
        
        # Create transaction record
        transaction = create_transaction_record(
            transactions_table, 
            consiglio_username, 
            owner_username, 
            income_amount, 
            land_id, 
            land_name
        )
        
        if transaction:
            log.info(f"Successfully distributed {income_amount} COMPUTE to {owner_username} for land {land_id}")
            successful_distributions += 1
            total_distributed += income_amount
        else:
            log.warning(f"Transaction record creation failed for {land_id}")
            # We don't revert the balance here since the money was actually transferred
    
    # Send Telegram notification
    if successful_distributions > 0:
        # Calculate average distribution
        average_distribution = total_distributed / successful_distributions
        
        notification_message = (
            "🏛️ Daily Income Distribution Complete 🏛️\n\n"
            "The Council of Ten has distributed today's income to the noble houses of Venice.\n\n"
            f"• {successful_distributions} properties received income\n"
            f"• {total_distributed:,} ⚜️ ducats distributed\n"
            f"• {average_distribution:,.0f} ⚜️ ducats per property on average\n\n"
            "Visit https://serenissima.ai to check your properties."
        )
        
        # Try to send notification but continue even if it fails
        try:
            notification_sent = send_telegram_notification(notification_message)
            if not notification_sent:
                log.warning("Telegram notification could not be sent, but income distribution completed successfully")
        except Exception as e:
            log.error(f"Error in Telegram notification process: {str(e)}")
            log.warning("Continuing despite Telegram notification failure")
    
    # Log summary
    log.info("Income distribution completed")
    log.info(f"Successful distributions: {successful_distributions}")
    log.info(f"Failed distributions: {failed_distributions}")
    log.info(f"Total COMPUTE distributed: {total_distributed}")

if __name__ == "__main__":
    try:
        distribute_income()
    except Exception as e:
        log.error(f"Unhandled exception in income distribution: {str(e)}")
        sys.exit(1)
