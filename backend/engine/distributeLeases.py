#!/usr/bin/env python3
"""
Lease Distribution Script for La Serenissima.

This script:
1. For each land, finds all buildings on that land
2. For each building, transfers the LeaseAmount from the building owner to the land owner
3. Creates notifications for both land owners and building owners
4. Generates an admin summary with statistics including top gainers and losers

Run this script daily to process lease payments between building owners and land owners.
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
log = logging.getLogger("distribute_leases")

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
            'lands': Table(api_key, base_id, 'LANDS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'users': Table(api_key, base_id, 'Users'),
            'transactions': Table(api_key, base_id, 'TRANSACTIONS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_all_lands(tables) -> List[Dict]:
    """Fetch all lands with owners."""
    log.info("Fetching all lands with owners...")
    
    try:
        # Get lands that have a User field (owner)
        formula = "NOT(OR({User} = '', {User} = BLANK()))"
        lands = tables['lands'].all(formula=formula)
        
        log.info(f"Found {len(lands)} lands with owners")
        return lands
    except Exception as e:
        log.error(f"Error fetching lands: {e}")
        return []

def get_buildings_on_land(tables, land_id: str) -> List[Dict]:
    """Fetch all buildings on a specific land."""
    log.info(f"Fetching buildings on land {land_id}...")
    
    try:
        # Get buildings on this land that have a User field (owner) and a LeaseAmount
        # Use the correct field name "Land" to query buildings
        formula = f"AND({{Land}}='{land_id}', NOT(OR({{User}} = '', {{User}} = BLANK())), NOT(OR({{LeaseAmount}} = '', {{LeaseAmount}} = BLANK()))))"
        buildings = tables['buildings'].all(formula=formula)
        
        log.info(f"Found {len(buildings)} buildings with lease amounts on land {land_id}")
        return buildings
    except Exception as e:
        log.error(f"Error fetching buildings on land {land_id}: {e}")
        return []

def find_user_by_identifier(tables, identifier: str) -> Optional[Dict]:
    """Find a user by username or wallet address."""
    log.info(f"Looking up user: {identifier}")
    
    try:
        # First try to find by username
        formula = f"{{Username}}='{identifier}'"
        users = tables['users'].all(formula=formula)
        
        if users:
            log.info(f"Found user by username: {identifier}")
            return users[0]
        
        # If not found, try by wallet address
        formula = f"{{Wallet}}='{identifier}'"
        users = tables['users'].all(formula=formula)
        
        if users:
            log.info(f"Found user by wallet address: {identifier}")
            return users[0]
        
        log.warning(f"User not found: {identifier}")
        return None
    except Exception as e:
        log.error(f"Error finding user {identifier}: {e}")
        return None

def update_compute_balance(tables, user_id: str, amount: float, operation: str = "add") -> Optional[Dict]:
    """Update a user's compute balance."""
    log.info(f"Updating compute balance for user {user_id}: {operation} {amount}")
    
    try:
        # Get the user record
        user = tables['users'].get(user_id)
        if not user:
            log.warning(f"User not found: {user_id}")
            return None
        
        # Get current compute amount
        current_amount = user['fields'].get('ComputeAmount', 0)
        
        # Calculate new amount
        if operation == "add":
            new_amount = current_amount + amount
        elif operation == "subtract":
            new_amount = current_amount - amount
            if new_amount < 0:
                log.warning(f"User {user_id} has insufficient funds: {current_amount} < {amount}")
                return None
        else:
            log.error(f"Invalid operation: {operation}")
            return None
        
        # Update the user record
        updated_user = tables['users'].update(user_id, {
            'ComputeAmount': new_amount
        })
        
        log.info(f"Updated compute balance for user {user_id}: {current_amount} -> {new_amount}")
        return updated_user
    except Exception as e:
        log.error(f"Error updating compute balance for user {user_id}: {e}")
        return None

def create_transaction_record(tables, from_user: str, to_user: str, amount: float, land_id: str, building_id: str) -> Optional[Dict]:
    """Create a transaction record for a lease payment."""
    log.info(f"Creating transaction record for lease payment: {from_user} -> {to_user}, amount: {amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": "lease_payment",
            "AssetId": f"lease_{land_id}_{building_id}",
            "Seller": from_user,  # Building owner is the seller (paying)
            "Buyer": to_user,     # Land owner is the buyer (receiving)
            "Price": amount,
            "CreatedAt": now,
            "UpdatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "land_id": land_id,
                "building_id": building_id,
                "payment_type": "lease",
                "payment_date": now
            })
        })
        
        log.info(f"Created transaction record: {transaction['id']}")
        return transaction
    except Exception as e:
        log.error(f"Error creating transaction record: {e}")
        return None

def create_notification(tables, user: str, content: str, details: Dict) -> Optional[Dict]:
    """Create a notification for a user."""
    log.info(f"Creating notification for user {user}: {content}")
    
    # Skip notification if user is empty or None
    if not user:
        log.warning(f"Cannot create notification: user is empty")
        return None
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the notification record
        notification = tables['notifications'].create({
            "Type": "lease_payment",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": now,
            "ReadAt": None,
            "User": user
        })
        
        log.info(f"Created notification: {notification['id']}")
        return notification
    except Exception as e:
        log.error(f"Error creating notification for user {user}: {e}")
        return None

def process_lease_payment(tables, land: Dict, building: Dict, dry_run: bool = False) -> Tuple[bool, float]:
    """Process a lease payment from a building owner to a land owner."""
    land_id = land['id']
    land_name = land['fields'].get('HistoricalName', land['fields'].get('EnglishName', land_id))
    land_owner = land['fields'].get('User', '')
    
    building_id = building['id']
    building_name = building['fields'].get('Name', building_id)
    building_type = building['fields'].get('Type', 'unknown')
    building_owner = building['fields'].get('User', '')
    lease_amount = float(building['fields'].get('LeaseAmount', 0))
    
    log.info(f"Processing lease payment for building {building_name} on land {land_name}")
    log.info(f"  Building Owner: {building_owner}, Land Owner: {land_owner}")
    log.info(f"  Lease Amount: {lease_amount}")
    
    # Skip if any required field is missing
    if not land_owner or not building_owner or lease_amount <= 0:
        log.warning(f"Missing required fields for lease payment, skipping")
        return False, 0
    
    # Skip if building owner and land owner are the same
    if building_owner == land_owner:
        log.info(f"Building owner and land owner are the same ({building_owner}), skipping payment")
        return True, 0  # Return True but 0 amount as this is not an error
    
    if dry_run:
        log.info(f"[DRY RUN] Would transfer {lease_amount} ⚜️ Ducats from {building_owner} to {land_owner}")
        return True, lease_amount
    
    # Find user records
    building_owner_record = find_user_by_identifier(tables, building_owner)
    land_owner_record = find_user_by_identifier(tables, land_owner)
    
    if not building_owner_record:
        log.warning(f"Building owner {building_owner} not found, skipping payment")
        return False, 0
    
    if not land_owner_record:
        log.warning(f"Land owner {land_owner} not found, skipping payment")
        return False, 0
    
    # Check if building owner has enough funds
    building_owner_balance = building_owner_record['fields'].get('ComputeAmount', 0)
    if building_owner_balance < lease_amount:
        log.warning(f"Building owner {building_owner} has insufficient funds: {building_owner_balance} < {lease_amount}")
        
        # Create notification about insufficient funds
        create_notification(
            tables,
            building_owner,
            f"Insufficient funds for lease payment of {int(lease_amount)} ⚜️ Ducats for your building {building_name} on {land_name}",
            {
                "land_id": land_id,
                "land_name": land_name,
                "building_id": building_id,
                "building_name": building_name,
                "building_type": building_type,
                "lease_amount": lease_amount,
                "available_balance": building_owner_balance,
                "event_type": "lease_payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        
        # Also notify land owner about the missed payment
        create_notification(
            tables,
            land_owner,
            f"Missed lease payment of {int(lease_amount)} ⚜️ Ducats from {building_owner} for building {building_name} on your land {land_name}",
            {
                "land_id": land_id,
                "land_name": land_name,
                "building_id": building_id,
                "building_name": building_name,
                "building_type": building_type,
                "lease_amount": lease_amount,
                "building_owner": building_owner,
                "event_type": "lease_payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        
        return False, 0
    
    # Process the payment
    # 1. Deduct from building owner
    update_compute_balance(tables, building_owner_record['id'], lease_amount, "subtract")
    
    # 2. Add to land owner
    update_compute_balance(tables, land_owner_record['id'], lease_amount, "add")
    
    # 3. Create transaction record
    create_transaction_record(tables, building_owner, land_owner, lease_amount, land_id, building_id)
    
    log.info(f"Successfully processed lease payment of {lease_amount} from {building_owner} to {land_owner}")
    
    return True, lease_amount

def create_land_owner_summary(tables, land_owner: str, land_name: str, buildings_data: List[Dict], total_amount: float) -> None:
    """Create a summary notification for a land owner about all lease payments received."""
    if not buildings_data:
        return
    
    content = f"You received {int(total_amount)} ⚜️ Ducats in lease payments for your land {land_name}"
    
    details = {
        "land_name": land_name,
        "total_amount": total_amount,
        "buildings_count": len(buildings_data),
        "buildings": buildings_data,
        "event_type": "lease_payments_received"
    }
    
    create_notification(tables, land_owner, content, details)

def create_building_owner_summary(tables, building_owner: str, buildings_data: List[Dict], total_amount: float) -> None:
    """Create a summary notification for a building owner about all lease payments made."""
    if not buildings_data:
        return
    
    content = f"You paid {int(total_amount)} ⚜️ Ducats in lease payments for your {len(buildings_data)} buildings"
    
    details = {
        "total_amount": total_amount,
        "buildings_count": len(buildings_data),
        "buildings": buildings_data,
        "event_type": "lease_payments_made"
    }
    
    create_notification(tables, building_owner, content, details)

def create_admin_summary(tables, lease_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"Lease distribution complete: {lease_summary['successful']} payments processed, total: {int(lease_summary['total_amount'])} ⚜️ Ducats"
        
        # Get top gainers and losers
        top_gainers = sorted(lease_summary['by_land_owner'].items(), key=lambda x: x[1], reverse=True)[:5]
        top_losers = sorted(lease_summary['by_building_owner'].items(), key=lambda x: x[1])[:5]
        
        # Create detailed information
        details = {
            "event_type": "lease_distribution_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "successful_payments": lease_summary['successful'],
            "failed_payments": lease_summary['failed'],
            "total_amount": lease_summary['total_amount'],
            "top_gainers": [{"owner": owner, "amount": amount} for owner, amount in top_gainers],
            "top_losers": [{"owner": owner, "amount": -amount} for owner, amount in top_losers]
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "lease_distribution_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "User": "NLR"  # Admin user
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def distribute_leases(dry_run: bool = False):
    """Main function to distribute lease payments from building owners to land owners."""
    log.info(f"Starting lease distribution process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    lands = get_all_lands(tables)
    
    if not lands:
        log.info("No lands with owners found. Lease distribution process complete.")
        return
    
    # Track lease payment statistics
    lease_summary = {
        "successful": 0,
        "failed": 0,
        "total_amount": 0,
        "by_land_owner": defaultdict(float),      # Total received by each land owner
        "by_building_owner": defaultdict(float),  # Total paid by each building owner
        "land_owner_buildings": defaultdict(list),  # Buildings data for each land owner
        "building_owner_lands": defaultdict(list)   # Lands data for each building owner
    }
    
    for land in lands:
        land_id = land['id']
        land_name = land['fields'].get('HistoricalName', land['fields'].get('EnglishName', land_id))
        land_owner = land['fields'].get('User', '')
        
        log.info(f"Processing land {land_name} (ID: {land_id}) owned by {land_owner}")
        
        # Skip if no owner
        if not land_owner:
            log.warning(f"Land {land_id} has no owner, skipping")
            continue
        
        # Get buildings on this land
        buildings = get_buildings_on_land(tables, land_id)
        
        if not buildings:
            log.info(f"No buildings with lease amounts found on land {land_id}")
            continue
        
        # Track lease payments for this land
        land_total = 0
        land_buildings_data = []
        
        for building in buildings:
            building_id = building['id']
            building_name = building['fields'].get('Name', building_id)
            building_type = building['fields'].get('Type', 'unknown')
            building_owner = building['fields'].get('User', '')
            lease_amount = float(building['fields'].get('LeaseAmount', 0))
            
            # Process the lease payment
            success, amount_paid = process_lease_payment(tables, land, building, dry_run)
            
            if success:
                if amount_paid > 0:  # Only count if actual payment was made (not when owner is the same)
                    lease_summary["successful"] += 1
                    lease_summary["total_amount"] += amount_paid
                    lease_summary["by_land_owner"][land_owner] += amount_paid
                    lease_summary["by_building_owner"][building_owner] -= amount_paid
                    land_total += amount_paid
                    
                    # Add building data for land owner notification
                    land_buildings_data.append({
                        "building_id": building_id,
                        "building_name": building_name,
                        "building_type": building_type,
                        "building_owner": building_owner,
                        "lease_amount": amount_paid
                    })
                    
                    # Add land data for building owner notification
                    lease_summary["building_owner_lands"][building_owner].append({
                        "land_id": land_id,
                        "land_name": land_name,
                        "land_owner": land_owner,
                        "building_id": building_id,
                        "building_name": building_name,
                        "building_type": building_type,
                        "lease_amount": amount_paid
                    })
            else:
                lease_summary["failed"] += 1
        
        # Add buildings data for this land to the summary
        if land_buildings_data:
            lease_summary["land_owner_buildings"][land_owner].extend(land_buildings_data)
    
    log.info(f"Lease distribution process complete. Successful: {lease_summary['successful']}, Failed: {lease_summary['failed']}")
    log.info(f"Total amount processed: {lease_summary['total_amount']}")
    
    # Create notifications for land owners
    if not dry_run:
        for land_owner, buildings_data in lease_summary["land_owner_buildings"].items():
            total_received = lease_summary["by_land_owner"][land_owner]
            # Group buildings by land
            lands_data = {}
            for building in buildings_data:
                land_id = next((land['id'] for land in lands if land['fields'].get('User') == land_owner), None)
                if land_id:
                    land_name = next((land['fields'].get('HistoricalName', land['fields'].get('EnglishName', land_id)) 
                                     for land in lands if land['id'] == land_id), land_id)
                    if land_name not in lands_data:
                        lands_data[land_name] = {"buildings": [], "total": 0}
                    lands_data[land_name]["buildings"].append(building)
                    lands_data[land_name]["total"] += building["lease_amount"]
            
            # Create a notification for each land
            for land_name, data in lands_data.items():
                create_land_owner_summary(tables, land_owner, land_name, data["buildings"], data["total"])
        
        # Create notifications for building owners
        for building_owner, lands_data in lease_summary["building_owner_lands"].items():
            total_paid = -lease_summary["by_building_owner"][building_owner]
            create_building_owner_summary(tables, building_owner, lands_data, total_paid)
        
        # Create admin summary notification
        create_admin_summary(tables, lease_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Distribute lease payments from building owners to land owners.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    distribute_leases(dry_run=args.dry_run)
