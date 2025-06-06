#!/usr/bin/env python3
"""
Daily Rent Payments script for La Serenissima.

This script:
1. Processes housing rent payments:
   - For each building with an occupant, transfers RentPrice from the citizen to the building owner
2. Processes business rent payments:
   - For each business with a building, transfers RentPrice from the business owner to the building owner
   - Only if the business owner is different from the building owner
3. Creates transaction records for each payment
4. Creates notifications for all parties involved
5. Generates an admin summary

Run this script daily to process rent payments.
"""

import os
import sys
import logging
import argparse
import json
import datetime
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("daily_rent_payments")

# Load environment variables
load_dotenv()

# Add the project root to sys.path to allow imports from backend.engine
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM # Import relationship helper

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
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'businesses': Table(api_key, base_id, 'BUSINESSES'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'relationships': Table(api_key, base_id, 'RELATIONSHIPS') # Ajout de la table RELATIONSHIPS
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_buildings_with_occupants(tables) -> List[Dict]:
    """Fetch all buildings with occupants and rent amounts."""
    log.info("Fetching buildings with occupants...")
    
    try:
        # Get buildings with non-empty Occupant field, RentPrice, and Category='home'
        formula = "AND({Category}='home', NOT(OR({Occupant} = '', {Occupant} = BLANK())), NOT(OR({RentPrice} = '', {RentPrice} = BLANK(), {RentPrice} = 0)))"
        buildings = tables['buildings'].all(formula=formula)
        
        log.info(f"Found {len(buildings)} buildings with occupants and rent amounts")
        return buildings
    except Exception as e:
        log.error(f"Error fetching buildings with occupants: {e}")
        return []

# Function removed as we no longer process business rent payments

def find_citizen_by_identifier(tables, username: str) -> Optional[Dict]:
    """Find a citizen by username."""
    log.info(f"Looking up citizen: {username}")
    
    try:
        # Find by username
        formula = f"{{Username}}='{username}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if citizens:
            log.info(f"Found citizen by username: {username}")
            return citizens[0]
        
        # Special case for ConsiglioDeiDieci - try alternative spellings
        if username == "ConsiglioDeiDieci":
            # Try with different variations
            for variation in ["Consiglio Dei Dieci", "Consiglio dei Dieci", "ConsiglioDeidieci"]:
                formula = f"{{Username}}='{variation}'"
                citizens = tables['citizens'].all(formula=formula)
                if citizens:
                    log.info(f"Found citizen by alternative spelling: {variation}")
                    return citizens[0]
        
        log.warning(f"Citizen not found: {username}")
        return None
    except Exception as e:
        log.error(f"Error finding citizen {username}: {e}")
        return None

def update_ducats_balance(tables, citizen_id: str, amount: float, operation: str = "add") -> Optional[Dict]:
    """Update a citizen's Ducats balance."""
    log.info(f"Updating Ducats balance for citizen {citizen_id}: {operation} {amount}")
    
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
        
        log.info(f"Updated Ducats balance for citizen {citizen_id}: {current_price} -> {new_amount}")
        return updated_citizen
    except Exception as e:
        log.error(f"Error updating Ducats balance for citizen {citizen_id}: {e}")
        return None

def create_transaction_record(tables, from_citizen: str, to_citizen: str, amount: float, 
                             building_id: str, payment_type: str, details: Dict = None) -> Optional[Dict]:
    """Create a transaction record for a rent payment."""
    log.info(f"Creating transaction record for {payment_type} payment: {from_citizen} -> {to_citizen}, amount: {amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create transaction notes with details
        notes = {
            "building_id": building_id,
            "payment_type": payment_type,
            "payment_date": now
        }
        
        # Add any additional details
        if details:
            notes.update(details)
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": payment_type,
            "Asset": building_id,  # Use the BuildingId directly as the Asset
            "Seller": from_citizen,  # Tenant/Business owner is the seller (paying)
            "Buyer": to_citizen,     # Building owner is the buyer (receiving)
            "Price": amount,
            "CreatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps(notes)
        })
        
        log.info(f"Created transaction record: {transaction['id']}")
        return transaction
    except Exception as e:
        log.error(f"Error creating transaction record: {e}")
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
            "Type": "rent_payment",
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

def process_housing_rent(tables, building: Dict, dry_run: bool = False) -> Tuple[bool, float]:
    """Process a housing rent payment from a citizen to a building owner."""
    building_id = building['id']
    building_name = building['fields'].get('Name', building_id)
    building_owner = building['fields'].get('Owner', '')
    occupant_username = building['fields'].get('Occupant', '')  # This is Occupant's Username
    
    # Safely convert rent amount to float
    try:
        rent_price_raw = building['fields'].get('RentPrice', 0)
        rent_price = float(rent_price_raw) if rent_price_raw else 0
    except (ValueError, TypeError):
        log.warning(f"Invalid rent amount for building {building_id}: {building['fields'].get('RentPrice')}, defaulting to 0")
        rent_price = 0
    
    log.info(f"Processing housing rent payment for building {building_name}")
    log.info(f"  Building Owner: {building_owner}, Occupant: {occupant_username}")
    log.info(f"  Rent Amount: {rent_price}")
    
    # Skip if any required field is missing
    if not building_owner or not occupant_username or rent_price <= 0:
        log.warning(f"Missing required fields for rent payment, skipping")
        return False, 0
    
    # Skip if building owner and occupant are the same
    if building_owner == occupant_username:
        log.info(f"Building owner and occupant are the same ({building_owner}), skipping payment")
        return True, 0  # Return True but 0 amount as this is not an error
    
    if dry_run:
        log.info(f"[DRY RUN] Would transfer {rent_price} ⚜️ Ducats from {occupant_username} to {building_owner}")
        return True, rent_price
    
    # Find occupant citizen record
    occupant_record = find_citizen_by_identifier(tables, occupant_username)
    if not occupant_record:
        log.warning(f"Occupant {occupant_username} not found, skipping payment")
        return False, 0
    
    citizen_name = f"{occupant_record['fields'].get('FirstName', '')} {occupant_record['fields'].get('LastName', '')}"
    citizen_ducats = occupant_record['fields'].get('Ducats', 0)
    
    log.info(f"Citizen: {citizen_name}, Ducats: {citizen_ducats}")
    
    # Find building owner citizen record
    building_owner_record = find_citizen_by_identifier(tables, building_owner)
    if not building_owner_record:
        log.warning(f"Building owner {building_owner} not found, skipping payment")
        return False, 0
    
    # Check if citizen has enough wealth
    if citizen_ducats < rent_price:
        log.warning(f"Citizen {citizen_name} has insufficient wealth: {citizen_ducats} < {rent_price}")
        
        # Create notification about insufficient funds
        create_notification(
            tables,
            building_owner,
            f"⚠️ Rent Payment Failed: Your tenant **{citizen_name}** could not pay **{int(rent_price):,} ⚜️ Ducats** for **{building_name}** due to insufficient funds. 💸",
            {
                "building_id": building_id,
                "building_name": building_name,
                "rent_price": rent_price,
                "citizen_username": occupant_username,
                "citizen_name": citizen_name,
                "citizen_ducats": citizen_ducats,
                "event_type": "rent_payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        # Trust impact: Occupant failed to pay Building Owner
        if occupant_username and building_owner:
            update_trust_score_for_activity(tables, occupant_username, building_owner, TRUST_SCORE_FAILURE_MEDIUM, "housing_rent_payment", False, "occupant_insufficient_funds")
        
        return False, 0
    
    # Process the payment
    # 1. Deduct from occupant's Ducats balance
    update_ducats_balance(tables, occupant_record['id'], rent_price, "subtract")
    
    # 2. Add to building owner's Ducats balance
    update_ducats_balance(tables, building_owner_record['id'], rent_price, "add")
    
    # 3. Create transaction record
    create_transaction_record(
        tables, 
        occupant_username, 
        building_owner, 
        rent_price, 
        building_id, 
        "housing_rent",
        {
            "citizen_username": occupant_username,
            "citizen_name": citizen_name,
            "building_type": building['fields'].get('Type', 'unknown')
        }
    )
    
    # 4. Create notifications
    # For citizen (as a notification in their name) - Landlord notification will be summarized later
    create_notification(
        tables,
        occupant_username,
        f"✅ Rent Paid: You paid **{int(rent_price):,} ⚜️ Ducats** to **{building_owner}** for **{building_name}**.",
        {
            "building_id": building_id,
            "building_name": building_name,
            "rent_price": rent_price,
            "building_owner": building_owner,
            "event_type": "rent_payment_made"
        }
    )

    # Trust impact: Successful rent payment
    if occupant_username and building_owner:
        update_trust_score_for_activity(tables, occupant_username, building_owner, TRUST_SCORE_SUCCESS_MEDIUM, "housing_rent_payment", True)
    
    log.info(f"Successfully processed housing rent payment: {rent_price} from {citizen_name} to {building_owner}")
    # Return more details for aggregated landlord notification
    return True, rent_price, building_owner, occupant_username, citizen_name, building_name

# Function removed as we no longer process business rent payments

def create_admin_summary(tables, rent_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"🏛️ **Daily Rent Payments Report** 📜\nHousing Rents: **{rent_summary['housing']['successful']:,}** successful, **{rent_summary['housing']['failed']:,}** failed.\nTotal Housing Rent Collected: **{int(rent_summary['housing']['total_amount']):,}** ⚜️ Ducats."
        
        # Create detailed information
        details = {
            "event_type": "rent_payment_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "housing_payments": {
                "successful": rent_summary['housing']['successful'],
                "failed": rent_summary['housing']['failed'],
                "total_amount": rent_summary['housing']['total_amount']
            },
            "top_landlords": rent_summary['top_landlords'],
            "total_amount": rent_summary['housing']['total_amount']
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "rent_payment_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def process_daily_rent_payments(dry_run: bool = False):
    """Main function to process daily rent payments."""
    log_header(f"Daily Rent Payments Process (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    
    # Process housing rent payments
    buildings = get_buildings_with_occupants(tables)
    
    # Track payment statistics
    rent_summary = {
        "housing": {
            "successful": 0,
            "failed": 0,
            "total_amount": 0
        },
        "by_landlord": defaultdict(float),
        "top_landlords": []
    }
    
    # Process housing rent payments
    log.info("Processing housing rent payments...")
    landlord_payment_details = defaultdict(list)

    for building in buildings:
        # success, amount = process_housing_rent(tables, building, dry_run)
        # process_housing_rent now returns: success, amount, building_owner, occupant_username, citizen_name, building_name
        result = process_housing_rent(tables, building, dry_run)
        success = result[0]
        amount = result[1]
        
        if success:
            if amount > 0:  # Only count if actual payment was made
                rent_summary["housing"]["successful"] += 1
                rent_summary["housing"]["total_amount"] += amount
                
                building_owner = result[2]
                occupant_username = result[3] # Not directly used here, but available
                citizen_name = result[4] # Occupant's display name
                building_name = result[5]

                if building_owner:
                    rent_summary["by_landlord"][building_owner] += amount
                    landlord_payment_details[building_owner].append({
                        "occupant_name": citizen_name,
                        "building_name": building_name,
                        "amount": amount
                    })
        else:
            rent_summary["housing"]["failed"] += 1
    
    # Get top landlords for admin summary
    top_landlords = sorted(rent_summary["by_landlord"].items(), key=lambda x: x[1], reverse=True)[:5]
    rent_summary["top_landlords"] = [{"owner": owner, "amount": amount} for owner, amount in top_landlords]
    
    # Create summary notifications for landlords
    if not dry_run:
        for landlord_username, payments in landlord_payment_details.items():
            if not payments:
                continue

            total_received_by_landlord = sum(p['amount'] for p in payments)
            summary_content = f"📬 **Rent Received Summary** 📬\nYou received a total of **{int(total_received_by_landlord):,} ⚜️ Ducats** from your properties today.\n\nDetails:\n"
            summary_details_list = []

            for payment in payments:
                summary_content += f"- ✅ **{int(payment['amount']):,} ⚜️** from **{payment['occupant_name']}** for **{payment['building_name']}**.\n"
                summary_details_list.append({
                    "occupant_name": payment['occupant_name'],
                    "building_name": payment['building_name'],
                    "amount": payment['amount']
                })
            
            create_notification(
                tables,
                landlord_username,
                summary_content, # Content is the formatted string
                { # Details is a structured object
                    "event_type": "landlord_rent_summary",
                    "total_received": total_received_by_landlord,
                    "payments": summary_details_list
                }
            )
    elif dry_run and landlord_payment_details:
        log.info("[DRY RUN] Would send summary notifications to landlords:")
        for landlord_username, payments in landlord_payment_details.items():
            if payments:
                total_received_by_landlord = sum(p['amount'] for p in payments)
                log.info(f"  - To: {landlord_username}, Total: {total_received_by_landlord}, Payments: {len(payments)}")


    log.info(f"Daily rent payments complete.")
    log.info(f"Housing: Successful: {rent_summary['housing']['successful']}, Failed: {rent_summary['housing']['failed']}, Total: {rent_summary['housing']['total_amount']}")
    
    # Create admin summary notification
    if not dry_run and rent_summary["housing"]["successful"] > 0:
        create_admin_summary(tables, rent_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process daily rent payments.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_daily_rent_payments(dry_run=args.dry_run)
