#!/usr/bin/env python3
"""
Daily Wage Payments script for La Serenissima.

This script:
1. Finds all citizens with jobs (Work field is not empty)
2. For each citizen, gets their workplace (business)
3. Transfers the Wages amount from the business owner to the citizen
4. Creates transaction records for each payment
5. Sends a summary notification to the administrator

Run this script daily to process wage payments from business owners to workers.
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
log = logging.getLogger("daily_wages")

# Load environment variables
load_dotenv()

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
            'businesses': Table(api_key, base_id, 'BUSINESSES'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_employed_citizens(tables) -> List[Dict]:
    """Fetch citizens with jobs."""
    log.info("Fetching employed citizens...")
    
    try:
        # Get citizens with a non-empty Work field
        formula = "NOT(OR({Work} = '', {Work} = BLANK()))"
        employed_citizens = tables['citizens'].all(formula=formula)
        
        log.info(f"Found {len(employed_citizens)} employed citizens")
        return employed_citizens
    except Exception as e:
        log.error(f"Error fetching employed citizens: {e}")
        return []

def get_business_details(tables, business_id: str) -> Optional[Dict]:
    """Get details of a specific business."""
    try:
        business = tables['businesses'].get(business_id)
        return business
    except Exception as e:
        log.error(f"Error fetching business {business_id}: {e}")
        return None

def find_citizen_by_identifier(tables, identifier: str) -> Optional[Dict]:
    """Find a citizen by username or wallet address."""
    log.info(f"Looking up citizen: {identifier}")
    
    # Handle known misspellings
    if identifier == "ConsiglioDeiDieci":
        identifier = "ConsiglioDeiDieci"
        log.info(f"Corrected misspelled identifier from ConsiglioDeiDieci to {identifier}")
    
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
        current_amount = citizen['fields'].get('Ducats', 0)
        
        # Calculate new amount
        if operation == "add":
            new_amount = current_amount + amount
        elif operation == "subtract":
            new_amount = current_amount - amount
        else:
            log.error(f"Invalid operation: {operation}")
            return None
        
        # Update the citizen record
        updated_citizen = tables['citizens'].update(citizen_id, {
            'Ducats': new_amount
        })
        
        log.info(f"Updated compute balance for citizen {citizen_id}: {current_amount} -> {new_amount}")
        return updated_citizen
    except Exception as e:
        log.error(f"Error updating compute balance for citizen {citizen_id}: {e}")
        return None

def update_citizen_wealth(tables, citizen_id: str, amount: float) -> Optional[Dict]:
    """Update a citizen's wealth."""
    log.info(f"Updating wealth for citizen {citizen_id}: +{amount}")
    
    try:
        # Get the citizen record
        citizen = tables['citizens'].get(citizen_id)
        if not citizen:
            log.warning(f"Citizen not found: {citizen_id}")
            return None
        
        # Get current wealth
        current_wealth = citizen['fields'].get('Ducats', 0)
        
        # Calculate new wealth
        new_wealth = current_wealth + amount
        
        # Update the citizen record
        updated_citizen = tables['citizens'].update(citizen_id, {
            'Ducats': new_wealth
        })
        
        log.info(f"Updated wealth for citizen {citizen_id}: {current_wealth} -> {new_wealth}")
        return updated_citizen
    except Exception as e:
        log.error(f"Error updating wealth for citizen {citizen_id}: {e}")
        return None

def create_transaction_record(tables, from_citizen: str, to_citizen: str, amount: float, business_id: str) -> Optional[Dict]:
    """Create a transaction record for a wage payment."""
    log.info(f"Creating transaction record for wage payment: {from_citizen} -> {to_citizen}, amount: {amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": "wage_payment",
            "AssetId": f"wage_{business_id}_{now}",
            "Seller": from_citizen,  # Business owner is the seller (paying)
            "Buyer": to_citizen,     # Citizen is the buyer (receiving)
            "Price": amount,
            "CreatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "business_id": business_id,
                "payment_type": "wage",
                "payment_date": now
            })
        })
        
        log.info(f"Created transaction record: {transaction['id']}")
        return transaction
    except Exception as e:
        log.error(f"Error creating transaction record: {e}")
        return None

def create_admin_summary(tables, wage_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"💰 **Daily Wage Payments** processed: **{wage_summary['successful']}** successful, **{wage_summary['failed']}** failed, total: **{int(wage_summary['total_amount']):,}** ⚜️ Ducats"
        
        # Create detailed information
        details = {
            "event_type": "wage_payment_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "successful_payments": wage_summary['successful'],
            "failed_payments": wage_summary['failed'],
            "total_amount": wage_summary['total_amount'],
            "top_employers": wage_summary['top_employers'],
            "top_earners": wage_summary['top_earners']
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "wage_payment_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def process_wage_payment(tables, citizen: Dict, dry_run: bool = False) -> tuple[bool, float]:
    """Process a wage payment from a business owner to a citizen."""
    citizen_id = citizen['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    business_id = citizen['fields'].get('Work', '')
    
    log.info(f"Processing wage payment for citizen {citizen_name}")
    
    # Skip if no business
    if not business_id:
        log.warning(f"Citizen {citizen_id} has no Work field, skipping")
        return False, 0
    
    # Get business details
    business = get_business_details(tables, business_id)
    if not business:
        log.warning(f"Business {business_id} not found, skipping payment for citizen {citizen_id}")
        return False, 0
    
    business_name = business['fields'].get('Name', business_id)
    business_owner = business['fields'].get('Owner', '')
    
    # Safely convert wages to float
    try:
        wages_raw = business['fields'].get('Wages', 0)
        wages = float(wages_raw) if wages_raw else 0
    except (ValueError, TypeError):
        log.warning(f"Invalid wages for business {business_id}: {business['fields'].get('Wages')}, defaulting to 0")
        wages = 0
    
    log.info(f"  Business: {business_name}, Owner: {business_owner}")
    log.info(f"  Wages: {wages}")
    
    # Skip if any required field is missing
    if not business_owner or wages <= 0:
        log.warning(f"Missing required fields for wage payment, skipping")
        return False, 0
    
    if dry_run:
        log.info(f"[DRY RUN] Would transfer {wages} ⚜️ Ducats from {business_owner} to {citizen_name}")
        return True, wages
    
    # Find citizen records
    business_owner_record = find_citizen_by_identifier(tables, business_owner)
    
    if not business_owner_record:
        log.warning(f"Business owner {business_owner} not found, skipping payment")
        return False, 0
    
    # Check if business owner has enough funds
    business_owner_balance = business_owner_record['fields'].get('Ducats', 0)
    if business_owner_balance < wages:
        log.warning(f"Business owner {business_owner} has insufficient funds: {business_owner_balance} < {wages}")
        return False, 0
    
    # Process the payment
    # 1. Deduct from business owner
    update_compute_balance(tables, business_owner_record['id'], wages, "subtract")
    
    # 2. Update citizen's wealth
    update_citizen_wealth(tables, citizen_id, wages)
    
    # 3. Create transaction record
    create_transaction_record(tables, business_owner, citizen_id, wages, business_id)
    
    log.info(f"Successfully processed wage payment: {wages} from {business_owner} to {citizen_name}")
    return True, wages

def process_daily_wages(dry_run: bool = False):
    """Main function to process daily wage payments."""
    log.info(f"Starting daily wage payments process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    employed_citizens = get_employed_citizens(tables)
    
    if not employed_citizens:
        log.info("No employed citizens found. Wage payment process complete.")
        return
    
    # Track payment statistics
    wage_summary = {
        "successful": 0,
        "failed": 0,
        "total_amount": 0,
        "by_employer": {},  # Track payments by employer
        "by_citizen": {},   # Track payments by citizen
        "top_employers": [],
        "top_earners": []
    }
    
    for citizen in employed_citizens:
        success, amount = process_wage_payment(tables, citizen, dry_run)
        
        if success:
            wage_summary["successful"] += 1
            wage_summary["total_amount"] += amount
            
            # Track by employer
            business_id = citizen['fields'].get('Work', '')
            if business_id:
                business = get_business_details(tables, business_id)
                if business:
                    business_owner = business['fields'].get('Owner', '')
                    if business_owner:
                        if business_owner not in wage_summary["by_employer"]:
                            wage_summary["by_employer"][business_owner] = 0
                        wage_summary["by_employer"][business_owner] += amount
            
            # Track by citizen
            citizen_id = citizen['id']
            citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            wage_summary["by_citizen"][citizen_name] = amount
        else:
            wage_summary["failed"] += 1
    
    # Get top employers and earners
    top_employers = sorted(wage_summary["by_employer"].items(), key=lambda x: x[1], reverse=True)[:5]
    wage_summary["top_employers"] = [{"owner": owner, "amount": amount} for owner, amount in top_employers]
    
    top_earners = sorted(wage_summary["by_citizen"].items(), key=lambda x: x[1], reverse=True)[:5]
    wage_summary["top_earners"] = [{"citizen": citizen, "amount": amount} for citizen, amount in top_earners]
    
    log.info(f"Daily wage payments complete. Successful: {wage_summary['successful']}, Failed: {wage_summary['failed']}")
    log.info(f"Total amount processed: {wage_summary['total_amount']}")
    
    # Create admin summary notification
    if not dry_run and (wage_summary["successful"] > 0 or wage_summary["failed"] > 0):
        create_admin_summary(tables, wage_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process daily wage payments.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_daily_wages(dry_run=args.dry_run)
