#!/usr/bin/env python3
"""
Pay Storage Contracts script for La Serenissima.

This script processes active 'storage_query' contracts and handles the daily
payments from the Buyer to the Seller for the rented storage capacity.
"""

import os
import sys
import json
import traceback
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Any
import requests # Not strictly needed for this script, but often included
from dotenv import load_dotenv
from pyairtable import Api, Table
import argparse
import logging
import math

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("paystoragecontracts")

# Load environment variables
# Ensure PROJECT_ROOT is correctly defined above.
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000") # Unused in this script
from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
PAYMENT_INTERVAL_HOURS = 23 # Process contracts not paid in the last 23 hours

from backend.engine.utils.activity_helpers import LogColors, log_header, _escape_airtable_value # Import log_header
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM # Import relationship helper

# --- Helper Functions ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if airtable_api_key: airtable_api_key = airtable_api_key.strip()
    if airtable_base_id: airtable_base_id = airtable_base_id.strip()

    if not airtable_api_key or not airtable_base_id:
        log.error(f"{LogColors.FAIL}Error: Airtable credentials not found.{LogColors.ENDC}")
        return None
    try:
        # custom_session = requests.Session() # Removed custom session
        # custom_session.trust_env = False    # Removed custom session configuration
        
        api = Api(airtable_api_key) # Instantiate Api, let it manage its own session
        # api.session = custom_session # Removed custom session assignment

        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "contracts": api.table(airtable_base_id, "CONTRACTS"),
            "transactions": api.table(airtable_base_id, "TRANSACTIONS"),
            "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
        }
        # Test connection (optional, but good practice)
        try:
            tables['citizens'].all(max_records=1)
            log.info(f"{LogColors.OKGREEN}Airtable connection initialized and tested successfully.{LogColors.ENDC}")
        except Exception as conn_e:
            log.error(f"{LogColors.FAIL}Airtable connection test failed: {conn_e}{LogColors.ENDC}")
            raise conn_e # Re-raise to be caught by the outer try-except
            
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        return None

# _escape_airtable_value is now imported

def get_citizen_record_by_username(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    """Fetches a citizen record by their username."""
    try:
        formula = f"{{Username}} = '{_escape_airtable_value(username)}'"
        records = tables["citizens"].all(formula=formula, max_records=1)
        if records:
            return records[0]
        log.warning(f"{LogColors.WARNING}Citizen with username '{username}' not found.{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching citizen '{username}': {e}{LogColors.ENDC}")
        return None

def update_citizen_ducats(tables: Dict[str, Table], citizen_id: str, amount_change: float, operation_log: str) -> bool:
    """Updates a citizen's Ducats balance."""
    try:
        citizen_record = tables["citizens"].get(citizen_id)
        if not citizen_record:
            log.error(f"{LogColors.FAIL}Citizen record {citizen_id} not found for ducat update.{LogColors.ENDC}")
            return False
        
        current_ducats = float(citizen_record['fields'].get('Ducats', 0.0))
        new_ducats = current_ducats + amount_change
        
        tables["citizens"].update(citizen_id, {'Ducats': new_ducats})
        log.info(f"{LogColors.OKGREEN}Ducats for citizen {citizen_record['fields'].get('Username', citizen_id)} ({operation_log}): {current_ducats:.2f} -> {new_ducats:.2f} (Change: {amount_change:.2f}){LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error updating ducats for citizen {citizen_id}: {e}{LogColors.ENDC}")
        return False

def create_transaction_record(
    tables: Dict[str, Table],
    transaction_type: str,
    asset_id: str, # ContractId for storage payments
    asset_type: str, # "contract_storage_fee"
    seller_username: str,
    buyer_username: str,
    price: float,
    notes_dict: Dict
) -> bool:
    """Creates a transaction record."""
    try:
        payload = {
            "Type": transaction_type,
            "Asset": asset_id,
            "AssetType": asset_type,
            "Seller": seller_username,
            "Buyer": buyer_username,
            "Price": price,
            "Notes": json.dumps(notes_dict),
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
            "ExecutedAt": datetime.now(VENICE_TIMEZONE).isoformat()
        }
        tables["transactions"].create(payload)
        log.info(f"{LogColors.OKGREEN}Created transaction: {transaction_type} for {asset_id}, Amount: {price:.2f}, Buyer: {buyer_username}, Seller: {seller_username}.{LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating transaction for {asset_id}: {e}{LogColors.ENDC}")
        return False

def create_notification(tables: Dict[str, Table], citizen_username: str, title: str, content: str, details: Optional[Dict] = None) -> bool:
    """Creates a notification for a citizen."""
    try:
        payload = {
            "Citizen": citizen_username,
            "Type": "storage_payment_issue", # Generic type for now
            "Title": f"⚠️ {title}" if "insufficient funds" in title.lower() else f"ℹ️ {title}",
            "Content": content, # Content already formatted with bold/emojis
            "Details": json.dumps(details) if details else None,
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(),
            "Status": "unread"
        }
        tables["notifications"].create(payload)
        log.info(f"{LogColors.OKCYAN}📬 Created notification for **{citizen_username}**: '{title}'.{LogColors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error creating notification for {citizen_username}: {e}{LogColors.ENDC}")
        return False

# --- Main Processing Logic ---

def process_storage_payments(dry_run: bool = False):
    log_header(f"Storage Contract Payment Processing (dry_run={dry_run})", LogColors.HEADER)

    tables = initialize_airtable()
    if not tables: return

    now_utc = datetime.now(pytz.UTC)
    threshold_time_utc = now_utc - timedelta(hours=PAYMENT_INTERVAL_HOURS)
    
    # Fetch active 'storage_query' contracts that haven't been processed recently
    # Airtable formula for date comparison: IS_BEFORE({LastExecutedAt}, DATETIME_PARSE('YYYY-MM-DDTHH:mm:ssZ'))
    # Or, if LastExecutedAt is blank: BLANK()
    formula = (f"AND({{Type}}='storage_query', {{Status}}='active', IS_BEFORE({{EndAt}}, '{now_utc.isoformat()}'), "
               f"OR(BLANK()={{LastExecutedAt}}, IS_BEFORE({{LastExecutedAt}}, '{threshold_time_utc.isoformat()}')))")

    try:
        contracts_to_process = tables["contracts"].all(formula=formula)
        log.info(f"Found {len(contracts_to_process)} 'storage_query' contracts due for payment.")
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching contracts due for payment: {e}{LogColors.ENDC}")
        return

    payments_processed = 0
    payments_failed_insufficient_funds = 0

    for contract_record in contracts_to_process:
        contract_airtable_id = contract_record['id']
        contract_fields = contract_record['fields']
        contract_custom_id = contract_fields.get('ContractId', contract_airtable_id)

        log.info(f"Processing payment for contract: {LogColors.OKBLUE}{contract_custom_id}{LogColors.ENDC}")

        buyer_username = contract_fields.get('Buyer')
        seller_username = contract_fields.get('Seller')
        target_amount = float(contract_fields.get('TargetAmount', 0.0))
        price_per_resource_daily = float(contract_fields.get('PricePerResource', 0.0))
        resource_type = contract_fields.get('ResourceType', 'UnknownResource')

        if not all([buyer_username, seller_username]) or target_amount <= 0 or price_per_resource_daily <= 0:
            log.warning(f"  Contract {contract_custom_id} has invalid data (Buyer/Seller/Amount/Price). Skipping.")
            continue

        daily_payment_amount = round(target_amount * price_per_resource_daily, 2)
        if daily_payment_amount <= 0:
            log.warning(f"  Calculated daily payment for {contract_custom_id} is zero or negative ({daily_payment_amount}). Skipping.")
            continue

        log.info(f"  Daily payment for {contract_custom_id}: {target_amount:.2f} units * {price_per_resource_daily:.2f} Ducats/unit = {daily_payment_amount:.2f} Ducats.")

        buyer_citizen_record = get_citizen_record_by_username(tables, buyer_username)
        seller_citizen_record = get_citizen_record_by_username(tables, seller_username)

        if not buyer_citizen_record or not seller_citizen_record:
            log.warning(f"  Buyer ({buyer_username}) or Seller ({seller_username}) not found for contract {contract_custom_id}. Skipping.")
            continue
        
        buyer_airtable_id = buyer_citizen_record['id']
        seller_airtable_id = seller_citizen_record['id']
        buyer_current_ducats = float(buyer_citizen_record['fields'].get('Ducats', 0.0))

        if buyer_current_ducats < daily_payment_amount:
            log.warning(f"  {LogColors.WARNING}Buyer {buyer_username} (Balance: {buyer_current_ducats:.2f}) has insufficient funds for payment of {daily_payment_amount:.2f} for contract {contract_custom_id}.{LogColors.ENDC}")
            payments_failed_insufficient_funds += 1
            if not dry_run:
                title_buyer = f"Storage Payment Due: {contract_custom_id}"
                content_buyer = (f"⚠️ Your daily payment of **{daily_payment_amount:.2f} ⚜️ Ducats** for storage contract **{contract_custom_id}** "
                                 f"(Resource: **{resource_type}**, Capacity: {target_amount}) could not be processed due to **insufficient funds**. "
                                 f"Please ensure you have enough Ducats. Storage Provider: **{seller_username}**.")
                create_notification(tables, buyer_username, title_buyer, content_buyer, {"contractId": contract_custom_id, "amountDue": daily_payment_amount})

                title_seller = f"Storage Payment Issue: {contract_custom_id}"
                content_seller = (f"⚠️ The daily payment of **{daily_payment_amount:.2f} ⚜️ Ducats** from **{buyer_username}** for storage contract **{contract_custom_id}** "
                                  f"(Resource: **{resource_type}**, Capacity: {target_amount}) could not be processed due to their **insufficient funds**.")
                create_notification(tables, seller_username, title_seller, content_seller, {"contractId": contract_custom_id, "amountDue": daily_payment_amount, "buyer": buyer_username})
            
            # Trust impact: Buyer failed to pay Seller for storage
            if buyer_username and seller_username:
                update_trust_score_for_activity(tables, buyer_username, seller_username, TRUST_SCORE_FAILURE_MEDIUM, "storage_payment", False, "buyer_insufficient_funds")
            # Do not update LastExecutedAt, so it will be retried.
            continue 

        if dry_run:
            log.info(f"  [DRY RUN] Would transfer {daily_payment_amount:.2f} Ducats from {buyer_username} to {seller_username} for contract {contract_custom_id}.")
            log.info(f"  [DRY RUN] Would create transaction record for this payment.")
            log.info(f"  [DRY RUN] Would update LastExecutedAt for contract {contract_custom_id} to {datetime.now(VENICE_TIMEZONE).isoformat()}.")
            payments_processed += 1
            continue

        # Perform actual transfers and updates
        payment_successful = True
        if not update_citizen_ducats(tables, buyer_airtable_id, -daily_payment_amount, f"Storage fee paid for {contract_custom_id}"):
            payment_successful = False
        if payment_successful and not update_citizen_ducats(tables, seller_airtable_id, daily_payment_amount, f"Storage fee received for {contract_custom_id}"):
            # Attempt to revert buyer's payment if seller update fails
            update_citizen_ducats(tables, buyer_airtable_id, daily_payment_amount, f"Reversal: Storage fee for {contract_custom_id} (seller update failed)")
            payment_successful = False
        
        if payment_successful:
            transaction_notes = {
                "contract_id": contract_custom_id,
                "resource_type": resource_type,
                "rented_capacity": target_amount,
                "daily_price_per_unit": price_per_resource_daily,
                "payment_type": "daily_storage_fee"
            }
            create_transaction_record(tables, "storage_fee_payment", contract_custom_id, "contract_storage_fee", seller_username, buyer_username, daily_payment_amount, transaction_notes)
            
            try:
                tables["contracts"].update(contract_airtable_id, {"LastExecutedAt": datetime.now(VENICE_TIMEZONE).isoformat()})
                log.info(f"  Updated LastExecutedAt for contract {contract_custom_id}.")
                payments_processed += 1
                # Trust impact: Successful storage payment
                if buyer_username and seller_username:
                    update_trust_score_for_activity(tables, buyer_username, seller_username, TRUST_SCORE_SUCCESS_MEDIUM, "storage_payment", True)
            except Exception as e_update_contract:
                log.error(f"  {LogColors.FAIL}Error updating LastExecutedAt for contract {contract_custom_id}: {e_update_contract}. Payment was made but contract may be re-processed.{LogColors.ENDC}")
                # This is a partial failure state. Ducats transferred, transaction logged, but contract might be paid again.
        else:
            log.error(f"  {LogColors.FAIL}Ducat transfer failed for contract {contract_custom_id}. No transaction or LastExecutedAt update.{LogColors.ENDC}")
            # Trust impact: Ducat transfer failure (system error, not insufficient funds which is handled above)
            if buyer_username and seller_username:
                update_trust_score_for_activity(tables, buyer_username, seller_username, TRUST_SCORE_FAILURE_MEDIUM, "storage_payment_processing", False, "system_error")
            # No specific count for this, as it's a failure within the attempt.
            # The insufficient funds counter is for pre-check failures.

    log.info(f"{LogColors.OKGREEN}Storage Contract Payment processing finished.{LogColors.ENDC}")
    log.info(f"Total payments processed (or simulated): {payments_processed}")
    log.info(f"Total payments skipped due to insufficient buyer funds: {payments_failed_insufficient_funds}")

# --- Main Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process daily payments for 'storage_query' contracts.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="If set, performs a dry run and does not save changes to Airtable."
    )
    args = parser.parse_args()

    process_storage_payments(dry_run=args.dry_run)
