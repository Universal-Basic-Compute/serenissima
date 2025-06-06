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
# Add the project root to sys.path to allow imports from backend.engine
# os.path.dirname(__file__) -> backend/engine
# os.path.join(..., '..') -> backend/engine/.. -> backend
# os.path.join(..., '..', '..') -> backend/engine/../../ -> serenissima (project root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

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

# Import helper functions
from backend.engine.utils.activity_helpers import _escape_airtable_value, LogColors, log_header # Import log_header
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        tables = {
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
        
        # Test connection with one primary table (e.g., citizens)
        log.info("Testing Airtable connection by fetching one record from CITIZENS table...")
        try:
            tables['citizens'].all(max_records=1)
            log.info("Airtable connection successful.")
        except Exception as conn_e:
            log.error(f"Airtable connection test failed for CITIZENS table: {conn_e}")
            raise conn_e
        
        return tables
    except Exception as e:
        log.error(f"Failed to initialize Airtable or connection test failed: {e}")
        sys.exit(1)

def get_employed_citizens(tables) -> List[Dict]:
    """Fetch citizens with jobs."""
    log.info("Fetching employed citizens...")
    
    try:
        # Get all business buildings that have an occupant from the BUILDINGS table
        business_buildings_formula = "AND({Category}='business', NOT(OR({Occupant} = '', {Occupant} = BLANK())))"
        occupied_businesses = tables['buildings'].all(formula=business_buildings_formula) # Changed to tables['buildings']
        
        employed_occupant_usernames = {b['fields'].get('Occupant') for b in occupied_businesses if b['fields'].get('Occupant')}
        
        if not employed_occupant_usernames:
            log.info("No citizens found occupying business buildings.")
            return []
            
        # Fetch citizen records for these occupants
        username_conditions = [f"{{Username}}='{_escape_airtable_value(username)}'" for username in employed_occupant_usernames]
        citizens_formula = f"OR({', '.join(username_conditions)})"
        employed_citizens = tables['citizens'].all(formula=citizens_formula)
        
        log.info(f"Found {len(employed_citizens)} employed citizens based on business occupancy.")
        return employed_citizens
    except Exception as e:
        log.error(f"Error fetching employed citizens: {e}")
        return []

def get_business_details(tables, business_id: str) -> Optional[Dict]:
    """Get details of a specific business (building) by its Airtable Record ID."""
    try:
        business = tables['buildings'].get(business_id) # Changed to tables['buildings']
        return business
    except Exception as e:
        log.error(f"Error fetching business (building) by Airtable ID {business_id}: {e}")
        return None

def get_business_details_by_custom_id(tables, business_custom_id: str) -> Optional[Dict]:
    """Get details of a specific business (building) by its custom BuildingId."""
    try:
        formula = f"{{BuildingId}} = '{_escape_airtable_value(business_custom_id)}'"
        records = tables['buildings'].all(formula=formula, max_records=1) # Changed to tables['buildings']
        return records[0] if records else None
    except Exception as e:
        log.error(f"Error fetching business (building) by custom ID {business_custom_id}: {e}")
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
            "AssetType": "building",  # Set AssetType to 'building'
            "Asset": business_id, # Asset is the BuildingId (using renamed parameter)
            "Seller": from_citizen,  # Employer (RunBy) is the seller (paying)
            "Buyer": to_citizen,    # Worker (Username) is the buyer (receiving)
            "Price": amount,
            "CreatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "business_id": business_id, # Use renamed parameter
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
        content = f"💰 **Daily Wage Payments Report** 📜\nProcessed: **{wage_summary['successful']}** successful, **{wage_summary['failed']}** failed.\nTotal Wages Paid: **{int(wage_summary['total_amount']):,}** ⚜️ Ducats."
        
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
    citizen_airtable_id = citizen['id']
    citizen_username = citizen['fields'].get('Username')
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Processing wage payment for citizen {citizen_name} (Username: {citizen_username})")

    if not citizen_username:
        log.warning(f"Citizen {citizen_airtable_id} has no Username, skipping wage payment.")
        return False, 0

    # Find the business where this citizen is the Occupant from the BUILDINGS table
    business_formula = f"AND({{Category}}='business', {{Occupant}}='{_escape_airtable_value(citizen_username)}')"
    try:
        workplace_records = tables['buildings'].all(formula=business_formula, max_records=1) # Changed to tables['buildings']
        if not workplace_records:
            log.warning(f"No business (building) found where {citizen_username} is the Occupant. Skipping wage payment.")
            return False, 0
        business = workplace_records[0] # This is the Airtable record of the business
    except Exception as e_fetch_biz:
        log.error(f"Error fetching workplace for {citizen_username}: {e_fetch_biz}")
        return False, 0
    
    business_airtable_id = business['id'] # Airtable Record ID of the business
    business_custom_id = business['fields'].get('BuildingId', business_airtable_id) # Custom BuildingId
    business_name = business['fields'].get('Name', business_custom_id)
    employer_username = business['fields'].get('RunBy') # Wages are paid by the 'RunBy'
    
    if not employer_username:
        log.warning(f"Business {business_name} (ID: {business_custom_id}) has no 'RunBy' defined. Cannot process wage payment for {citizen_name}.")
        return False, 0
        
    # Safely convert wages to float
    try:
        wages_raw = business['fields'].get('Wages', 0)
        wages = float(wages_raw) if wages_raw else 0
    except (ValueError, TypeError):
        log.warning(f"Invalid wages for business {business_name}: {business['fields'].get('Wages')}, defaulting to 0")
        wages = 0
    
    log.info(f"  Business: {business_name}, RunBy (Employer): {employer_username}")
    log.info(f"  Wages: {wages}")
    
    # Skip if any required field is missing (employer_username is already checked)
    if wages <= 0:
        log.warning(f"Wages for business {business_name} are zero or negative, skipping payment.")
        return False, 0
    
    if dry_run:
        log.info(f"[DRY RUN] Would transfer {wages} ⚜️ Ducats from {employer_username} to {citizen_name}")
        return True, wages
    
    # Find employer citizen record
    employer_record = find_citizen_by_identifier(tables, employer_username)
    
    if not employer_record:
        log.warning(f"Employer {employer_username} (RunBy) not found, skipping payment for {citizen_name} at {business_name}")
        return False, 0
    
    # Check if employer has enough funds
    employer_balance = employer_record['fields'].get('Ducats', 0)
    if employer_balance < wages:
        log.warning(f"Employer {employer_username} has insufficient funds: {employer_balance} < {wages} for {citizen_name} at {business_name}")
        # Trust impact: Employer failed to pay Employee
        if employer_username and citizen_username:
            update_trust_score_for_activity(tables, employer_username, citizen_username, TRUST_SCORE_FAILURE_MEDIUM, "wage_payment", False, "employer_insufficient_funds")
        return False, 0

    # If the employer (RunBy) is the same as the employee (Occupant), no actual transaction or balance change is needed.
    if employer_username == citizen_username:
        log.info(f"Employer {employer_username} is the same as employee {citizen_username} for business {business_name}. Wage is considered paid internally. No transaction record created.")
        # The 'wealth' of the citizen effectively includes this wage already.
        # No Ducats transfer needed as it's the same person.
        return True, wages # Return success as the wage is "accounted for"

    # Process the payment
    # 1. Deduct from employer
    update_compute_balance(tables, employer_record['id'], wages, "subtract")
    
    # 2. Update citizen's wealth
    update_citizen_wealth(tables, citizen_airtable_id, wages)
    
    # 3. Create transaction record
    create_transaction_record(tables, employer_username, citizen_username, wages, business_custom_id)

    # Trust impact: Successful wage payment
    if employer_username and citizen_username:
        update_trust_score_for_activity(tables, employer_username, citizen_username, TRUST_SCORE_SUCCESS_MEDIUM, "wage_payment", True)
    
    log.info(f"{LogColors.OKGREEN}Successfully processed wage payment: {wages} from {employer_username} to {citizen_name}{LogColors.ENDC}")
    return True, wages

def process_daily_wages(dry_run: bool = False):
    """Main function to process daily wage payments."""
    log_header(f"Daily Wage Payments Process (dry_run={dry_run})", LogColors.HEADER)
    
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
            
            # Track by employer (business_owner is the RunBy or Owner username)
            # The 'business' object used in process_wage_payment is fetched based on the citizen's occupancy.
            # We need to re-fetch it here or pass more info from process_wage_payment if we want to use its details.
            # For simplicity, let's assume process_wage_payment returns enough info or we re-fetch.
            # Re-fetching for summary might be slow.
            # Let's assume 'business_owner' (employer username) is available from the context of the loop.
            # The 'business_owner' used in process_wage_payment is the correct one.
            # We need to ensure it's captured for the summary.
            # A better way would be for process_wage_payment to return the employer username.
            # For now, let's try to re-derive it (less efficient but works for now).
            
            citizen_username_for_summary = citizen['fields'].get('Username')
            if citizen_username_for_summary:
                biz_formula_summary = f"AND({{Category}}='business', {{Occupant}}='{_escape_airtable_value(citizen_username_for_summary)}')"
                workplaces_summary = tables['buildings'].all(formula=biz_formula_summary, max_records=1) # Changed to tables['buildings']
                if workplaces_summary:
                    employer_username = workplaces_summary[0]['fields'].get('RunBy') or workplaces_summary[0]['fields'].get('Owner', '')
                    if employer_username:
                        if employer_username not in wage_summary["by_employer"]:
                            wage_summary["by_employer"][employer_username] = 0
                        wage_summary["by_employer"][employer_username] += amount
            
            # Track by citizen
            citizen_name_for_summary = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            wage_summary["by_citizen"][citizen_name_for_summary] = amount
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
        log.info(f"{LogColors.OKGREEN}Admin summary notification for wages created.{LogColors.ENDC}") # Added from create_admin_summary

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process daily wage payments.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_daily_wages(dry_run=args.dry_run)
