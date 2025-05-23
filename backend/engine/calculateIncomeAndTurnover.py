import os
import sys
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv, find_dotenv
from pyairtable import Api, Table

# Load environment variables from .env file in the project root
# This assumes the script might be run from different working directories
try:
    dotenv_path = find_dotenv(raise_error_if_not_found=True, usecwd=True)
    load_dotenv(dotenv_path)
    print(f"Loaded .env file from: {dotenv_path}")
except IOError:
    # Fallback for environments where .env might be in a parent directory (e.g. running from backend/engine)
    try:
        dotenv_path = find_dotenv(raise_error_if_not_found=True, usecwd=False) # Search parent directories
        load_dotenv(dotenv_path)
        print(f"Loaded .env file from parent: {dotenv_path}")
    except IOError:
        print("Error: .env file not found. Please ensure it's in the project root or a parent directory.")
        sys.exit(1)


# Airtable Configuration
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_CITIZENS_TABLE_NAME = os.getenv("AIRTABLE_CITIZENS_TABLE", "CITIZENS")
AIRTABLE_TRANSACTIONS_TABLE_NAME = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS")

if not all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID]):
    print("Error: Airtable API Key or Base ID not configured in .env file.")
    sys.exit(1)

api = Api(AIRTABLE_API_KEY)
citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_CITIZENS_TABLE_NAME)
transactions_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TRANSACTIONS_TABLE_NAME)

def parse_timestamp(timestamp_str):
    """Safely parse Airtable timestamp string to timezone-aware datetime object."""
    if not timestamp_str:
        return None
    try:
        # Handle timestamps with 'Z' (UTC)
        if timestamp_str.endswith('Z'):
            timestamp_str = timestamp_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(timestamp_str)
        # Ensure datetime is timezone-aware (assume UTC if naive)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        print(f"Warning: Could not parse timestamp: {timestamp_str}")
        return None

def calculate_citizen_financials():
    """
    Calculates daily, weekly, and monthly income and turnover for all citizens
    and updates their records in Airtable.
    """
    print("Starting calculation of citizen financials...")

    # 1. Fetch all citizens and create lookup maps
    print(f"Fetching citizens from '{AIRTABLE_CITIZENS_TABLE_NAME}'...")
    all_citizens_data = citizens_table.all()
    
    citizen_info = {} # {airtable_record_id: {'Username': '...', 'Wallet': '...'}}
    username_to_record_id = {}
    wallet_to_record_id = {}

    for citizen_record in all_citizens_data:
        record_id = citizen_record['id']
        fields = citizen_record['fields']
        username = fields.get('Username')
        wallet = fields.get('Wallet')
        
        citizen_info[record_id] = {
            'Username': username,
            'Wallet': wallet,
            # Initialize financial fields
            'DailyIncome': 0.0, 'DailyTurnover': 0.0,
            'WeeklyIncome': 0.0, 'WeeklyTurnover': 0.0,
            'MonthlyIncome': 0.0, 'MonthlyTurnover': 0.0,
        }
        if username:
            username_to_record_id[username.lower()] = record_id
        if wallet:
            wallet_to_record_id[wallet.lower()] = record_id
    
    print(f"Fetched {len(citizen_info)} citizens.")

    # 2. Fetch all transactions
    print(f"Fetching transactions from '{AIRTABLE_TRANSACTIONS_TABLE_NAME}'...")
    all_transactions = transactions_table.all()
    print(f"Fetched {len(all_transactions)} transactions.")

    # 3. Define time windows
    now = datetime.now(timezone.utc)
    last_24_hours = now - timedelta(days=1)
    last_7_days = now - timedelta(days=7)
    last_30_days = now - timedelta(days=30)

    # 4. Process transactions
    print("Processing transactions...")
    for tx_record in all_transactions:
        tx_fields = tx_record['fields']
        executed_at_str = tx_fields.get('ExecutedAt')
        
        if not executed_at_str:
            continue # Skip transactions without an execution date

        executed_at = parse_timestamp(executed_at_str)
        if not executed_at:
            continue

        price = tx_fields.get('Price', 0.0)
        if not isinstance(price, (int, float)) or price <= 0:
            continue

        tx_type = tx_fields.get('Type', '').lower()
        seller_identifier = tx_fields.get('Seller', '').lower()
        buyer_identifier = tx_fields.get('Buyer', '').lower()
        notes_str = tx_fields.get('Notes', '{}')
        
        try:
            notes_data = json.loads(notes_str) if isinstance(notes_str, str) else {}
        except json.JSONDecodeError:
            notes_data = {}

        # Determine seller and buyer record IDs
        seller_record_id = username_to_record_id.get(seller_identifier) or \
                           wallet_to_record_id.get(seller_identifier)
        
        buyer_record_id = username_to_record_id.get(buyer_identifier) or \
                          wallet_to_record_id.get(buyer_identifier)

        # Income/Turnover logic
        income_recipient_id = None
        turnover_payer_id = None

        if tx_type == 'transfer_log': # Land sale, resource sale etc.
            income_recipient_id = seller_record_id
            turnover_payer_id = buyer_record_id
        elif tx_type == 'deposit': # e.g., from Treasury
            income_recipient_id = buyer_record_id
        elif tx_type == 'inject': # e.g., to Treasury
            turnover_payer_id = seller_record_id
        elif tx_type == 'transfer': # Direct transfer between citizens from Notes
            from_wallet = notes_data.get('from_wallet', '').lower()
            to_wallet = notes_data.get('to_wallet', '').lower()
            if from_wallet:
                turnover_payer_id = username_to_record_id.get(from_wallet) or \
                                    wallet_to_record_id.get(from_wallet)
            if to_wallet:
                income_recipient_id = username_to_record_id.get(to_wallet) or \
                                      wallet_to_record_id.get(to_wallet)
        elif tx_type == 'loan' and notes_data.get('operation') == 'loan_disbursement': # Loan disbursement
             income_recipient_id = buyer_record_id # Buyer is the borrower receiving funds
        # Add other transaction types as needed, e.g., loan_payment
        # elif tx_type == 'loan_payment':
        #     borrower_identifier = notes_data.get('borrower', '').lower() # Assuming borrower is in notes
        #     turnover_payer_id = username_to_record_id.get(borrower_identifier) or \
        #                         wallet_to_record_id.get(borrower_identifier)


        # Update financials based on time windows
        time_windows = []
        if executed_at >= last_24_hours:
            time_windows.append("Daily")
        if executed_at >= last_7_days:
            time_windows.append("Weekly")
        if executed_at >= last_30_days:
            time_windows.append("Monthly")

        for window_prefix in time_windows:
            if income_recipient_id and income_recipient_id in citizen_info:
                citizen_info[income_recipient_id][f'{window_prefix}Income'] += price
            if turnover_payer_id and turnover_payer_id in citizen_info:
                citizen_info[turnover_payer_id][f'{window_prefix}Turnover'] += price
    
    print("Transaction processing complete.")

    # 5. Prepare records for Airtable update
    updates = []
    for record_id, financials in citizen_info.items():
        update_payload = {
            'id': record_id,
            'fields': {
                'DailyIncome': round(financials['DailyIncome'], 2),
                'DailyTurnover': round(financials['DailyTurnover'], 2),
                'WeeklyIncome': round(financials['WeeklyIncome'], 2),
                'WeeklyTurnover': round(financials['WeeklyTurnover'], 2),
                'MonthlyIncome': round(financials['MonthlyIncome'], 2),
                'MonthlyTurnover': round(financials['MonthlyTurnover'], 2),
            }
        }
        updates.append(update_payload)

    # 6. Batch update Airtable
    if updates:
        print(f"Updating {len(updates)} citizen records in Airtable...")
        try:
            # Pyairtable's batch_update handles splitting into chunks of 10 automatically
            citizens_table.batch_update(updates)
            print("Airtable update successful.")
        except Exception as e:
            print(f"Error updating Airtable: {e}")
            # Optionally, print details of records that failed if possible
            # For example, log 'updates' or parts of it.
    else:
        print("No updates to send to Airtable.")

    print("Citizen financial calculation finished.")

if __name__ == "__main__":
    calculate_citizen_financials()
