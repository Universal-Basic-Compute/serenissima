import os
import sys
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv # Removed find_dotenv
from pyairtable import Api, Table

# Determine the project root directory
# __file__ is backend/engine/calculateIncomeAndTurnover.py
# os.path.dirname(__file__) is backend/engine/
# os.path.join(..., '..') is backend/
# os.path.join(..., '..', '..') is the project root (serenissima/)
PROJECT_ROOT_CALC_FINANCIALS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Construct the path to the .env file
dotenv_path = os.path.join(PROJECT_ROOT_CALC_FINANCIALS, '.env')

# Load environment variables from the .env file
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    # print(f"Loaded .env file from: {dotenv_path}") # Keep this commented unless debugging .env loading
else:
    print(f"Error: .env file not found at {dotenv_path}. Please ensure it's in the project root.")
    # Attempt to load from environment variables directly as a fallback (e.g., in Render)
    print("Attempting to load credentials from environment variables directly.")
    # No explicit action needed here, os.getenv will pick them up if set in the environment

# Import LogColors and log_header from shared utils
# Add project root to sys.path for backend imports
if PROJECT_ROOT_CALC_FINANCIALS not in sys.path: # Ensure PROJECT_ROOT_CALC_FINANCIALS is defined if this script is run standalone
    sys.path.insert(0, PROJECT_ROOT_CALC_FINANCIALS)
from backend.engine.utils.activity_helpers import LogColors, log_header

# Airtable Configuration
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_CITIZENS_TABLE_NAME = os.getenv("AIRTABLE_CITIZENS_TABLE", "CITIZENS")
AIRTABLE_TRANSACTIONS_TABLE_NAME = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS")

if not all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID]):
    print("Error: Airtable API Key or Base ID not configured in .env file.")
    sys.exit(1)

api = Api(AIRTABLE_API_KEY)
citizens_table = api.table(AIRTABLE_BASE_ID, AIRTABLE_CITIZENS_TABLE_NAME)
transactions_table = api.table(AIRTABLE_BASE_ID, AIRTABLE_TRANSACTIONS_TABLE_NAME)

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
    log_header("Citizen Financials Calculation", LogColors.HEADER)

    # 1. Fetch all citizens and create lookup maps
    print(f"\n{LogColors.OKCYAN}--- Section 1: Fetching Citizen Data ---{LogColors.ENDC}")
    print(f"{LogColors.OKBLUE}Fetching citizens from table '{AIRTABLE_CITIZENS_TABLE_NAME}'...{LogColors.ENDC}")
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
    
    print(f"{LogColors.OKGREEN}[OK] Fetched {len(citizen_info)} citizens.{LogColors.ENDC}")

    # 2. Fetch all transactions
    print(f"\n{LogColors.OKCYAN}--- Section 2: Fetching Transaction Data ---{LogColors.ENDC}")
    print(f"{LogColors.OKBLUE}Fetching transactions from table '{AIRTABLE_TRANSACTIONS_TABLE_NAME}'...{LogColors.ENDC}")
    all_transactions = transactions_table.all()
    print(f"{LogColors.OKGREEN}[OK] Fetched {len(all_transactions)} transactions.{LogColors.ENDC}")

    # 3. Define time windows
    print(f"\n{LogColors.OKCYAN}--- Section 3: Defining Time Windows ---{LogColors.ENDC}")
    now = datetime.now(timezone.utc)
    last_24_hours = now - timedelta(days=1)
    last_7_days = now - timedelta(days=7)
    last_30_days = now - timedelta(days=30)
    print(f"{LogColors.OKBLUE}Current UTC time: {now.isoformat()}{LogColors.ENDC}")
    print(f"{LogColors.OKBLUE}24-hour window starts: {last_24_hours.isoformat()}{LogColors.ENDC}")
    print(f"{LogColors.OKBLUE}7-day window starts: {last_7_days.isoformat()}{LogColors.ENDC}")
    print(f"{LogColors.OKBLUE}30-day window starts: {last_30_days.isoformat()}{LogColors.ENDC}")

    # 4. Process transactions
    print(f"\n{LogColors.OKCYAN}--- Section 4: Processing Transactions ---{LogColors.ENDC}")
    processed_tx_count = 0
    skipped_tx_no_date = 0
    skipped_tx_no_price = 0
    unassigned_recipient_count = 0
    unassigned_payer_count = 0
    recipient_not_in_citizens_count = 0
    payer_not_in_citizens_count = 0

    for tx_record in all_transactions:
        tx_fields = tx_record['fields']
        executed_at_str = tx_fields.get('ExecutedAt')
        tx_id_log = tx_record.get('id', 'N/A')
        
        if not executed_at_str:
            # log.debug(f"Skipping transaction {tx_id_log}: missing 'ExecutedAt' date.")
            skipped_tx_no_date += 1
            continue 

        executed_at = parse_timestamp(executed_at_str)
        if not executed_at:
            # log.debug(f"Skipping transaction {tx_id_log}: could not parse 'ExecutedAt' date '{executed_at_str}'.")
            skipped_tx_no_date += 1
            continue

        price = tx_fields.get('Price', 0.0)
        if not isinstance(price, (int, float)) or price <= 0:
            # log.debug(f"Skipping transaction {tx_id_log}: invalid or zero price ({price}).")
            skipped_tx_no_price += 1
            continue
        
        processed_tx_count +=1
        tx_type = tx_fields.get('Type', 'unknown_type').lower()
        seller_identifier_raw = tx_fields.get('Seller', '')
        buyer_identifier_raw = tx_fields.get('Buyer', '')
        seller_identifier = seller_identifier_raw.lower() if isinstance(seller_identifier_raw, str) else ''
        buyer_identifier = buyer_identifier_raw.lower() if isinstance(buyer_identifier_raw, str) else ''
        notes_str = tx_fields.get('Notes', '{}')
        
        # print(f"{LogColors.OKBLUE}Processing Tx ID: {tx_id_log}, Type: {tx_type}, SellerRaw: '{seller_identifier_raw}', BuyerRaw: '{buyer_identifier_raw}', Price: {price}{LogColors.ENDC}")

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
            from_wallet_raw = notes_data.get('from_wallet', '')
            to_wallet_raw = notes_data.get('to_wallet', '')
            from_wallet = from_wallet_raw.lower() if isinstance(from_wallet_raw, str) else ''
            to_wallet = to_wallet_raw.lower() if isinstance(to_wallet_raw, str) else ''
            if from_wallet:
                turnover_payer_id = username_to_record_id.get(from_wallet) or \
                                    wallet_to_record_id.get(from_wallet)
            if to_wallet:
                income_recipient_id = username_to_record_id.get(to_wallet) or \
                                      wallet_to_record_id.get(to_wallet)
        elif tx_type == 'loan' and notes_data.get('operation') == 'loan_disbursement': # Loan disbursement
             income_recipient_id = buyer_record_id # Buyer is the borrower receiving funds
        elif tx_type == 'gondola_fee':
            income_recipient_id = seller_record_id # Seller is the recipient (gondolier/Consiglio)
            turnover_payer_id = buyer_record_id  # Buyer is the payer (traveler)
        elif tx_type == 'resource_purchase_on_fetch': # Buyer pays Seller
            income_recipient_id = seller_record_id
            turnover_payer_id = buyer_record_id
        elif tx_type == 'import_payment_final': # Buyer pays Seller (Merchant)
            income_recipient_id = seller_record_id
            turnover_payer_id = buyer_record_id
        elif tx_type == 'import_cost_of_goods': # Buyer (Merchant) pays Seller (Italia)
            income_recipient_id = seller_record_id # Italia
            turnover_payer_id = buyer_record_id  # Merchant
        elif tx_type == 'wage_payment': # Seller (Employer) pays Buyer (Employee)
            income_recipient_id = buyer_record_id
            turnover_payer_id = seller_record_id
        elif tx_type == 'rent_payment': # Buyer (Tenant) pays Seller (Landlord/BuildingOwner)
            income_recipient_id = seller_record_id
            turnover_payer_id = buyer_record_id
        elif tx_type == 'building_construction': # Buyer (Citizen) pays Seller (Consiglio)
            income_recipient_id = seller_record_id
            turnover_payer_id = buyer_record_id
        # Add other transaction types as needed

        # Log determined parties
        # log_detail_msg = f"  Tx {tx_id_log}: Type='{tx_type}', Seller='{seller_identifier}', Buyer='{buyer_identifier}'"
        # log_detail_msg += f" -> IncomeTo: {citizen_info[income_recipient_id]['Username'] if income_recipient_id and income_recipient_id in citizen_info else income_recipient_id}"
        # log_detail_msg += f", TurnoverFrom: {citizen_info[turnover_payer_id]['Username'] if turnover_payer_id and turnover_payer_id in citizen_info else turnover_payer_id}"
        # print(f"{LogColors.OKBLUE}{log_detail_msg}{LogColors.ENDC}")

        if not income_recipient_id and tx_type not in ['inject']: # Inject only has payer
            unassigned_recipient_count +=1
            # print(f"{LogColors.WARNING}  Tx {tx_id_log} (Type: {tx_type}): No income recipient identified.{LogColors.ENDC}")
        if not turnover_payer_id and tx_type not in ['deposit', 'loan_disbursement']: # Deposit/Loan Disbursement only has recipient
            unassigned_payer_count +=1
            # print(f"{LogColors.WARNING}  Tx {tx_id_log} (Type: {tx_type}): No turnover payer identified.{LogColors.ENDC}")

        # Update financials based on time windows
        time_windows = []
        if executed_at >= last_24_hours:
            time_windows.append("Daily")
        if executed_at >= last_7_days:
            time_windows.append("Weekly")
        if executed_at >= last_30_days:
            time_windows.append("Monthly")

        for window_prefix in time_windows:
            if income_recipient_id:
                if income_recipient_id in citizen_info:
                    citizen_info[income_recipient_id][f'{window_prefix}Income'] += price
                    # print(f"    Added {price:.2f} to {window_prefix}Income for {citizen_info[income_recipient_id].get('Username', income_recipient_id)}")
                else:
                    recipient_not_in_citizens_count +=1
                    # print(f"{LogColors.WARNING}    Tx {tx_id_log}: Income recipient ID '{income_recipient_id}' (from identifier '{seller_identifier_raw}' or notes) not in citizen_info.{LogColors.ENDC}")
            
            if turnover_payer_id:
                if turnover_payer_id in citizen_info:
                    citizen_info[turnover_payer_id][f'{window_prefix}Turnover'] += price
                    # print(f"    Added {price:.2f} to {window_prefix}Turnover for {citizen_info[turnover_payer_id].get('Username', turnover_payer_id)}")
                else:
                    payer_not_in_citizens_count +=1
                    # print(f"{LogColors.WARNING}    Tx {tx_id_log}: Turnover payer ID '{turnover_payer_id}' (from identifier '{buyer_identifier_raw}' or notes) not in citizen_info.{LogColors.ENDC}")
    
    print(f"{LogColors.OKGREEN}[OK] Transaction processing complete.{LogColors.ENDC}")
    print(f"{LogColors.OKBLUE}  Processed transactions: {processed_tx_count}{LogColors.ENDC}")
    if skipped_tx_no_date > 0:
        print(f"{LogColors.WARNING}  Skipped transactions (no/invalid date): {skipped_tx_no_date}{LogColors.ENDC}")
    if skipped_tx_no_price > 0:
        print(f"{LogColors.WARNING}  Skipped transactions (no/invalid price): {skipped_tx_no_price}{LogColors.ENDC}")
    if unassigned_recipient_count > 0:
        print(f"{LogColors.WARNING}  Transactions with no income recipient identified: {unassigned_recipient_count}{LogColors.ENDC}")
    if unassigned_payer_count > 0:
        print(f"{LogColors.WARNING}  Transactions with no turnover payer identified: {unassigned_payer_count}{LogColors.ENDC}")
    if recipient_not_in_citizens_count > 0:
        print(f"{LogColors.WARNING}  Income assignments to non-citizen entities: {recipient_not_in_citizens_count}{LogColors.ENDC}")
    if payer_not_in_citizens_count > 0:
        print(f"{LogColors.WARNING}  Turnover assignments from non-citizen entities: {payer_not_in_citizens_count}{LogColors.ENDC}")


    # 5. Prepare records for Airtable update
    print(f"\n{LogColors.OKCYAN}--- Section 5: Preparing Airtable Updates ---{LogColors.ENDC}")
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
        print(f"{LogColors.OKBLUE}Updating {len(updates)} citizen records in Airtable...{LogColors.ENDC}")
        try:
            # Pyairtable's batch_update handles splitting into chunks of 10 automatically
            citizens_table.batch_update(updates)
            print(f"{LogColors.OKGREEN}[OK] Airtable update successful.{LogColors.ENDC}")
        except Exception as e:
            print(f"{LogColors.FAIL}[FAIL] Error updating Airtable: {e}{LogColors.ENDC}")
            # Optionally, print details of records that failed if possible
            # For example, log 'updates' or parts of it.
    else:
        print(f"{LogColors.OKBLUE}No updates to send to Airtable.{LogColors.ENDC}")

    print(f"\n{LogColors.HEADER}==============================================================")
    print(f"=== Citizen Financial Calculation Finished ===")
    print(f"=============================================================={LogColors.ENDC}")

if __name__ == "__main__":
    calculate_citizen_financials()
