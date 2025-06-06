#!/usr/bin/env python3
"""
Daily Loan Payments script for La Serenissima.

This script:
1. Fetches all active loans from the LOANS table
2. For each active loan:
   - Deducts the payment amount from the borrower's compute balance
   - Adds the payment amount to the lender's compute balance
   - Updates the loan's remaining balance
   - Marks the loan as "paid" if the remaining balance reaches zero
3. Creates transaction records for each payment
4. Creates notifications for borrowers and lenders

Run this script daily to process loan payments.
"""

import os
import sys
import logging
import argparse
import json
import datetime
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("daily_loan_payments")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
LOAN_SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT_LOAN = os.path.abspath(os.path.join(LOAN_SCRIPT_DIR, '..', '..'))
if PROJECT_ROOT_LOAN not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_LOAN)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

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
            'loans': Table(api_key, base_id, 'LOANS'),
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_active_loans(tables) -> List[Dict]:
    """Fetch all active loans from Airtable."""
    log.info("Fetching active loans...")
    
    try:
        # Get loans with status "active"
        formula = "{Status}='active'"
        active_loans = tables['loans'].all(formula=formula)
        
        log.info(f"Found {len(active_loans)} active loans")
        return active_loans
    except Exception as e:
        log.error(f"Error fetching active loans: {e}")
        return []

def find_citizen_by_identifier(tables, identifier: str) -> Optional[Dict]:
    """Find a citizen by username or wallet address."""
    log.info(f"Looking up citizen: {identifier}")
    
    try:
        # First try to find by username
        formula = f"{{Username}}='{identifier}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if citizens:
            log.info(f"Found citizen by username: {identifier}")
            return citizens[0]
        
        # If not found, try by wallet address
        formula = f"{{Wallet}}='{identifier}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if citizens:
            log.info(f"Found citizen by wallet address: {identifier}")
            return citizens[0]
        
        # Special case for ConsiglioDeiDieci - try alternative spellings
        if identifier == "ConsiglioDeiDieci":
            # Try with different variations
            for variation in ["Consiglio Dei Dieci", "Consiglio dei Dieci", "ConsiglioDeidieci"]:
                formula = f"{{Username}}='{variation}'"
                citizens = tables['citizens'].all(formula=formula)
                if citizens:
                    log.info(f"Found citizen by alternative spelling: {variation}")
                    return citizens[0]
        
        log.warning(f"Citizen not found: {identifier}")
        return None
    except Exception as e:
        log.error(f"Error finding citizen {identifier}: {e}")
        return None

def update_compute_balance(tables, citizen_id: str, amount: float, operation: str = "add") -> Optional[Dict]:
    """Update a citizen's compute balance."""
    log.info(f"Updating compute balance for citizen {citizen_id}: {operation} {amount}")
    
    try:
        # Get the citizen record
        citizen = tables['citizens'].get(citizen_id)
        if not citizen:
            log.warning(f"Citizen not found: {citizen_id}")
            return None
        
        # Get current Ducats
        current_price = citizen['fields'].get('Ducats', 0)
        
        # Calculate new amount
        if operation == "add":
            new_amount = current_price + amount
        elif operation == "subtract":
            new_amount = current_price - amount
        else:
            log.error(f"Invalid operation: {operation}")
            return None
        
        # Update the citizen record
        updated_citizen = tables['citizens'].update(citizen_id, {
            'Ducats': new_amount
        })
        
        log.info(f"Updated compute balance for citizen {citizen_id}: {current_price} -> {new_amount}")
        return updated_citizen
    except Exception as e:
        log.error(f"Error updating compute balance for citizen {citizen_id}: {e}")
        return None

def create_transaction_record(tables, loan: Dict, payment_amount: float) -> Optional[Dict]:
    """Create a transaction record for a loan payment."""
    loan_id = loan['id']
    borrower = loan['fields'].get('Borrower', '')
    lender = loan['fields'].get('Lender', '')
    
    log.info(f"Creating transaction record for loan {loan_id}: {borrower} -> {lender}, amount: {payment_amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": "loan_payment",
            "Asset": "compute_token",
            "Seller": borrower,  # Borrower is the seller (paying)
            "Buyer": lender,     # Lender is the buyer (receiving)
            "Price": payment_amount,
            "CreatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "loan_id": loan_id,
                "payment_type": "scheduled",
                "remaining_balance": loan['fields'].get('RemainingBalance', 0) - payment_amount
            })
        })
        
        log.info(f"Created transaction record: {transaction['id']}")
        return transaction
    except Exception as e:
        log.error(f"Error creating transaction record for loan {loan_id}: {e}")
        return None

def create_notification(tables, citizen: str, content: str, details: Dict) -> Optional[Dict]:
    """Create a notification for a citizen."""
    log.info(f"Creating notification for citizen {citizen}: {content}")
    
    # Skip notification if citizen is empty or None
    if not citizen:
        log.warning(f"Cannot create notification: citizen is empty")
        return None
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the notification record
        notification = tables['notifications'].create({
            "Type": "loan_payment",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": now,
            "ReadAt": None,
            "Citizen": citizen
        })
        
        log.info(f"Created notification: {notification['id']}")
        return notification
    except Exception as e:
        log.error(f"Error creating notification for citizen {citizen}: {e}")
        return None

def process_loan_payment(tables, loan: Dict, dry_run: bool = False) -> bool:
    """Process a payment for a single loan."""
    loan_id = loan['id']
    loan_name = loan['fields'].get('Name', loan_id)
    borrower = loan['fields'].get('Borrower', '')
    lender = loan['fields'].get('Lender', '')
    payment_amount = loan['fields'].get('PaymentAmount', 0)
    remaining_balance = loan['fields'].get('RemainingBalance', 0)
    
    log.info(f"Processing payment for loan {loan_name} (ID: {loan_id})")
    log.info(f"  Borrower: {borrower}, Lender: {lender}")
    log.info(f"  Payment Amount: {payment_amount}, Remaining Balance: {remaining_balance}")
    
    # Skip if any required field is missing
    if not borrower or not lender or not payment_amount or remaining_balance is None:
        log.warning(f"Loan {loan_id} is missing required fields, skipping")
        return False
    
    # Adjust payment amount if it's more than the remaining balance
    if payment_amount > remaining_balance:
        log.info(f"Payment amount {payment_amount} is greater than remaining balance {remaining_balance}, adjusting")
        payment_amount = remaining_balance
    
    # Skip if payment amount is zero
    if payment_amount <= 0:
        log.warning(f"Payment amount for loan {loan_id} is zero or negative, skipping")
        return False
    
    if dry_run:
        log.info(f"[DRY RUN] Would process payment of {payment_amount} for loan {loan_id}")
        log.info(f"[DRY RUN] Would update remaining balance from {remaining_balance} to {remaining_balance - payment_amount}")
        return True
    
    # Find borrower and lender records
    borrower_record = find_citizen_by_identifier(tables, borrower)
    lender_record = find_citizen_by_identifier(tables, lender)
    
    if not borrower_record:
        log.warning(f"Borrower {borrower} not found, skipping payment")
        return False
    
    if not lender_record:
        log.warning(f"Lender {lender} not found, skipping payment")
        return False
    
    # Handle case where borrower or lender is not found
    if not borrower_record:
        log.warning(f"Borrower {borrower} not found, skipping payment")
        
        # Still notify lender about the issue if lender exists
        if lender_record:
            create_notification(
                tables,
                lender,
                f"⚠️ Loan payment from **{borrower}** could not be processed: **borrower account not found**",
                {
                    "loan_id": loan_id,
                    "loan_name": loan_name,
                    "payment_amount": payment_amount,
                    "remaining_balance": remaining_balance,
                    "borrower": borrower,
                    "event_type": "payment_error",
                    "error_type": "borrower_not_found"
                }
            )
        return False
    
    if not lender_record:
        log.warning(f"Lender {lender} not found, skipping payment")
        
        # Still notify borrower about the issue
        create_notification(
            tables,
            borrower,
            f"⚠️ Your loan payment of **{payment_amount:,} ⚜️ Ducats** could not be processed: **lender account not found**",
            {
                "loan_id": loan_id,
                "loan_name": loan_name,
                "payment_amount": payment_amount,
                "remaining_balance": remaining_balance,
                "lender": lender,
                "event_type": "payment_error",
                "error_type": "lender_not_found"
            }
        )
        return False
    
    # Check if borrower has enough compute
    borrower_compute = borrower_record['fields'].get('Ducats', 0)
    if borrower_compute < payment_amount:
        log.warning(f"Borrower {borrower} has insufficient compute balance: {borrower_compute} < {payment_amount}")
        
        # Create notification about insufficient funds for borrower
        create_notification(
            tables,
            borrower,
            f"⚠️ **Insufficient funds** for loan payment of **{int(payment_amount):,} ⚜️ Ducats**. Please add funds to your account to avoid penalties.",
            {
                "loan_id": loan_id,
                "loan_name": loan_name,
                "payment_amount": payment_amount,
                "available_balance": borrower_compute,
                "remaining_balance": remaining_balance,
                "event_type": "payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        
        # Also notify lender about the missed payment
        create_notification(
            tables,
            lender,
            f"💸 Loan payment of **{int(payment_amount):,} ⚜️ Ducats** from **{borrower}** failed due to **insufficient funds**",
            {
                "loan_id": loan_id,
                "loan_name": loan_name,
                "payment_amount": payment_amount,
                "borrower": borrower,
                "borrower_balance": borrower_compute,
                "remaining_balance": remaining_balance,
                "event_type": "payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        
        return False
    
    # Process the payment
    # 1. Deduct from borrower
    update_compute_balance(tables, borrower_record['id'], payment_amount, "subtract")
    
    # 2. Add to lender
    update_compute_balance(tables, lender_record['id'], payment_amount, "add")
    
    # 3. Create transaction record
    create_transaction_record(tables, loan, payment_amount)
    
    # 4. Update loan record
    new_balance = remaining_balance - payment_amount
    now = datetime.datetime.now().isoformat()
    
    # Determine if this is the final payment
    is_final_payment = new_balance <= 0
    new_status = "paid" if is_final_payment else "active"
    
    # Update loan record
    updated_loan = tables['loans'].update(loan_id, {
        "RemainingBalance": new_balance,
        "Status": new_status,
        "Notes": f"{loan['fields'].get('Notes', '')}\nPayment of {payment_amount} made on {now}"
    })
    
    log.info(f"Updated loan {loan_id}: remaining balance {remaining_balance} -> {new_balance}, status: {new_status}")
    
    # 5. Create notifications
    # For borrower
    borrower_notification_content = f"💰 Loan payment of **{int(payment_amount):,} ⚜️ Ducats** processed"
    if is_final_payment:
        borrower_notification_content += ". Your loan has been **fully repaid**! 🎉 Congratulations!"
    else:
        borrower_notification_content += f". Remaining balance: **{int(new_balance):,} ⚜️ Ducats**"
    
    create_notification(
        tables,
        borrower,
        borrower_notification_content,
        {
            "loan_id": loan_id,
            "loan_name": loan_name,
            "payment_amount": payment_amount,
            "remaining_balance": new_balance,
            "is_final_payment": is_final_payment,
            "event_type": "payment_processed",
            "lender": lender
        }
    )
    
    # For lender
    lender_notification_content = f"💰 Received loan payment of **{int(payment_amount):,} ⚜️ Ducats** from **{borrower}**"
    if is_final_payment:
        lender_notification_content += ". The loan has been **fully repaid**! 🎉"
    else:
        lender_notification_content += f". Remaining balance: **{int(new_balance):,} ⚜️ Ducats**"
    
    create_notification(
        tables,
        lender,
        lender_notification_content,
        {
            "loan_id": loan_id,
            "loan_name": loan_name,
            "payment_amount": payment_amount,
            "remaining_balance": new_balance,
            "borrower": borrower,
            "is_final_payment": is_final_payment,
            "event_type": "payment_received"
        }
    )
    
    return True

def create_admin_summary(tables, payment_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"📊 **Daily Loan Payments Report**: **{payment_summary['successful']}** successful, **{payment_summary['failed']}** failed, total: **{int(payment_summary['total_amount']):,} ⚜️ Ducats**"
        
        # Create detailed information
        details = {
            "event_type": "loan_payment_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "successful_payments": payment_summary['successful'],
            "failed_payments": payment_summary['failed'],
            "total_amount": payment_summary['total_amount'],
            "loans_paid_off": payment_summary['loans_paid_off']
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "loan_payment_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def process_daily_loan_payments(dry_run: bool = False):
    """Main function to process daily loan payments."""
    log_header(f"Daily Loan Payments Process (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    active_loans = get_active_loans(tables)
    
    if not active_loans:
        log.info("No active loans found. Payment process complete.")
        return
    
    # Track payment statistics
    payment_summary = {
        "successful": 0,
        "failed": 0,
        "total_amount": 0,
        "loans_paid_off": 0
    }
    
    for loan in active_loans:
        loan_id = loan['id']
        payment_amount = loan['fields'].get('PaymentAmount', 0)
        remaining_balance = loan['fields'].get('RemainingBalance', 0)
        
        # Adjust payment amount if it's more than the remaining balance
        if payment_amount > remaining_balance:
            payment_amount = remaining_balance
        
        # Process the payment
        success = process_loan_payment(tables, loan, dry_run)
        
        if success:
            payment_summary["successful"] += 1
            payment_summary["total_amount"] += payment_amount
            
            # Check if loan was paid off
            if payment_amount >= remaining_balance:
                payment_summary["loans_paid_off"] += 1
        else:
            payment_summary["failed"] += 1
    
    log.info(f"Daily loan payments complete. Successful: {payment_summary['successful']}, Failed: {payment_summary['failed']}")
    log.info(f"Total amount processed: {payment_summary['total_amount']}, Loans paid off: {payment_summary['loans_paid_off']}")
    
    # Create admin summary notification
    if not dry_run and (payment_summary["successful"] > 0 or payment_summary["failed"] > 0):
        create_admin_summary(tables, payment_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process daily loan payments.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_daily_loan_payments(dry_run=args.dry_run)
