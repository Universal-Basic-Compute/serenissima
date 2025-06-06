#!/usr/bin/env python3
"""
Lease Distribution Script for La Serenissima.

This script:
1. For each land, finds all buildings on that land
2. For each building, transfers the LeasePrice from the building owner to the land owner
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
import requests
from urllib.parse import quote
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from pyairtable import Api, Table
from dotenv import load_dotenv

# Base tax rate for lease payments (20%)
BASE_TAX_RATE = 0.20
# Maximum tax rate for undeveloped land (50%)
MAX_TAX_RATE = 0.50

# Get Telegram credentials
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
MAIN_TELEGRAM_CHAT_ID = os.environ.get('MAIN_TELEGRAM_CHAT_ID')

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("distribute_leases")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
SCRIPT_DIR_LEASES = os.path.dirname(__file__)
PROJECT_ROOT_LEASES = os.path.abspath(os.path.join(SCRIPT_DIR_LEASES, '..', '..'))
if PROJECT_ROOT_LEASES not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_LEASES)

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
            'lands': Table(api_key, base_id, 'LANDS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'citizens': Table(api_key, base_id, 'Citizens'),
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
        # Get lands that have a Owner field (owner)
        formula = "NOT(OR({Owner} = '', {Owner} = BLANK()))"
        lands = tables['lands'].all(formula=formula)
        
        log.info(f"Found {len(lands)} lands with owners")
        return lands
    except Exception as e:
        log.error(f"Error fetching lands: {e}")
        return []

def get_buildings_on_land(tables, land_id: str, land_record: Dict) -> List[Dict]:
    """Fetch all buildings on a specific land."""
    # Get the LandId from the land record
    land_id_value = land_record['fields'].get('LandId', '')
    if not land_id_value:
        log.warning(f"Land {land_id} has no LandId field, skipping")
        return []
    
    log.info(f"Fetching buildings on land {land_id} (LandId: {land_id_value})...")
    
    try:
        # Use the LandId field to query buildings - improved formula with better error handling
        formula = f"AND({{Land}}='{land_id_value}', NOT({{Citizen}} = BLANK()))"
        
        # First try with the formula that requires LeasePrice
        try:
            buildings = tables['buildings'].all(formula=f"AND({formula}, NOT({{LeasePrice}} = BLANK()))")
            log.info(f"Found {len(buildings)} buildings with lease amounts on land {land_id}")
            return buildings
        except Exception as e:
            log.warning(f"Error with specific formula, trying more general query: {e}")
            
            # If that fails, try a more general query
            buildings = tables['buildings'].all(formula=formula)
            
            # Filter buildings with lease amounts manually
            buildings_with_lease = [b for b in buildings if b['fields'].get('LeasePrice')]
            log.info(f"Found {len(buildings_with_lease)} buildings with lease amounts on land {land_id} (after filtering)")
            return buildings_with_lease
            
    except Exception as e:
        log.error(f"Error fetching buildings on land {land_id}: {e}")
        # Add more detailed error logging
        if hasattr(e, 'response') and e.response:
            log.error(f"Response status: {e.response.status_code}")
            log.error(f"Response content: {e.response.text}")
        return []

def find_citizen_by_identifier(tables, identifier: str) -> Optional[Dict]:
    """Find a citizen by username or wallet address."""
    log.info(f"Looking up citizen: {identifier}")
    
    # Handle known special cases
    if identifier == "ConsiglioDeiDieci":
        # Try different variations of the name
        variations = ["ConsiglioDeiDieci", "Consiglio Dei Dieci", "Consiglio dei Dieci"]
        for variation in variations:
            try:
                formula = f"{{Username}}='{variation}'"
                citizens = tables['citizens'].all(formula=formula)
                if citizens:
                    log.info(f"Found citizen by special case variation: {variation}")
                    return citizens[0]
            except Exception:
                continue
    
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
            if new_amount < 0:
                log.warning(f"Citizen {citizen_id} has insufficient funds: {current_price} < {amount}")
                return None
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

def create_transaction_record(tables, from_citizen: str, to_citizen: str, amount: float, land_id: str, building_id: str) -> Optional[Dict]:
    """Create a transaction record for a lease payment."""
    log.info(f"Creating transaction record for lease payment: {from_citizen} -> {to_citizen}, amount: {amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": "lease_payment",
            "Asset": f"lease_{land_id}_{building_id}",
            "Seller": from_citizen,  # Building owner is the seller (paying)
            "Buyer": to_citizen,     # Land owner is the buyer (receiving)
            "Price": amount,
            "CreatedAt": now,
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
            "Type": "lease_payment",
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

def calculate_tax_rate(land: Dict) -> float:
    """Calculate the tax rate based on land development.
    
    The tax rate varies from 20% to 50% based on the ratio of actual buildings
    to building points on the land. More developed land (higher ratio) gets a lower tax rate.
    """
    # Get building points count
    building_points_count = land['fields'].get('BuildingPointsCount', 0)
    if not building_points_count or building_points_count <= 0:
        # If no building points data, use maximum tax rate
        return MAX_TAX_RATE
    
    # Get actual buildings count (if available)
    buildings_count = land['fields'].get('BuildingsCount', 0)
    if not buildings_count:
        # Try to estimate from other fields if available
        buildings_count = 1  # Default to at least 1 building
    
    # Calculate development ratio (buildings / building points)
    # Capped at 1.0 to ensure ratio doesn't exceed 100%
    development_ratio = min(float(buildings_count) / float(building_points_count), 1.0)
    
    # Calculate tax rate: scales from MAX_TAX_RATE to BASE_TAX_RATE as development increases
    tax_rate = MAX_TAX_RATE - (development_ratio * (MAX_TAX_RATE - BASE_TAX_RATE))
    
    # Ensure tax rate stays within bounds
    tax_rate = max(BASE_TAX_RATE, min(tax_rate, MAX_TAX_RATE))
    
    log.info(f"Land development: {buildings_count}/{building_points_count} buildings = {development_ratio:.2f} ratio")
    log.info(f"Calculated tax rate: {tax_rate:.2%}")
    
    return tax_rate

def process_lease_payment(tables, land: Dict, building: Dict, dry_run: bool = False) -> Tuple[bool, float, float]:
    """Process a lease payment from a building owner to a land owner."""
    land_id = land['id']
    land_name = land['fields'].get('HistoricalName', land['fields'].get('EnglishName', land_id))
    land_owner = land['fields'].get('Citizen', '')
    
    building_id = building['id']
    building_name = building['fields'].get('Name', building_id)
    building_type = building['fields'].get('Type', 'unknown')
    building_owner = building['fields'].get('Citizen', '')
    
    # Safely convert lease amount to float
    try:
        lease_price_raw = building['fields'].get('LeasePrice', 0)
        lease_price = float(lease_price_raw) if lease_price_raw else 0
    except (ValueError, TypeError):
        log.warning(f"Invalid lease amount for building {building_id}: {building['fields'].get('LeasePrice')}, defaulting to 0")
        lease_price = 0
    
    log.info(f"Processing lease payment for building {building_name} on land {land_name}")
    log.info(f"  Building Owner: {building_owner}, Land Owner: {land_owner}")
    log.info(f"  Lease Amount: {lease_price}")
    
    # Skip if any required field is missing
    if not land_owner or not building_owner or lease_price <= 0:
        log.warning(f"Missing required fields for lease payment, skipping")
        return False, 0, 0
    
    # Skip if building owner and land owner are the same
    if building_owner == land_owner:
        log.info(f"Building owner and land owner are the same ({building_owner}), skipping payment")
        return True, 0, 0  # Return True but 0 amount as this is not an error
    
    # Calculate variable tax rate based on land development
    tax_rate = calculate_tax_rate(land)
    
    # Calculate tax amount based on variable tax rate
    tax_amount = lease_price * tax_rate
    # Calculate net amount after tax
    net_amount = lease_price - tax_amount
    
    log.info(f"Lease amount: {lease_price}, Tax ({tax_rate:.2%}): {tax_amount}, Net to land owner: {net_amount}")
    
    if dry_run:
        log.info(f"[DRY RUN] Would transfer {net_amount} ⚜️ Ducats from {building_owner} to {land_owner}")
        log.info(f"[DRY RUN] Would transfer {tax_amount} ⚜️ Ducats from {building_owner} to ConsiglioDeiDieci (tax)")
        return True, net_amount, tax_amount
    
    # Find citizen records
    building_owner_record = find_citizen_by_identifier(tables, building_owner)
    land_owner_record = find_citizen_by_identifier(tables, land_owner)
    consiglio_record = find_citizen_by_identifier(tables, "ConsiglioDeiDieci")
    
    if not building_owner_record:
        log.warning(f"Building owner {building_owner} not found, skipping payment")
        return False, 0, 0
    
    if not land_owner_record:
        log.warning(f"Land owner {land_owner} not found, skipping payment")
        return False, 0, 0
    
    if not consiglio_record:
        log.warning(f"ConsiglioDeiDieci not found, skipping tax collection")
        return False, 0, 0
    
    # Check if building owner has enough funds
    building_owner_balance = building_owner_record['fields'].get('Ducats', 0)
    if building_owner_balance < lease_price:
        log.warning(f"Building owner {building_owner} has insufficient funds: {building_owner_balance} < {lease_price}")
        
        # Get development ratio for this land
        building_points_count = land['fields'].get('BuildingPointsCount', 0)
        buildings_count = land['fields'].get('BuildingsCount', 0)
        development_ratio = min(float(buildings_count) / float(building_points_count), 1.0) if building_points_count > 0 else 0
        
        # Create notification about insufficient funds
        create_notification(
            tables,
            building_owner,
            f"❌ **Insufficient funds** for lease payment of **{int(lease_price):,} ⚜️ Ducats** for your building **{building_name}** on **{land_name}**",
            {
                "land_id": land_id,
                "land_name": land_name,
                "building_id": building_id,
                "building_name": building_name,
                "building_type": building_type,
                "lease_price": lease_price,
                "tax_amount": tax_amount,
                "tax_rate": f"{tax_rate:.2%}",
                "development_ratio": development_ratio,
                "net_amount": net_amount,
                "available_balance": building_owner_balance,
                "event_type": "lease_payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        
        # Also notify land owner about the missed payment
        create_notification(
            tables,
            land_owner,
            f"❌ **Missed lease payment** of **{int(net_amount):,} ⚜️ Ducats** from **{building_owner}** for building **{building_name}** on your land **{land_name}**",
            {
                "land_id": land_id,
                "land_name": land_name,
                "building_id": building_id,
                "building_name": building_name,
                "building_type": building_type,
                "lease_price": lease_price,
                "tax_amount": tax_amount,
                "tax_rate": f"{tax_rate:.2%}",
                "development_ratio": development_ratio,
                "net_amount": net_amount,
                "building_owner": building_owner,
                "event_type": "lease_payment_failed",
                "error_type": "insufficient_funds"
            }
        )
        # Trust impact: Building Owner failed to pay Land Owner
        if building_owner and land_owner: # land_owner is defined earlier in the function
            update_trust_score_for_activity(tables, building_owner, land_owner, TRUST_SCORE_FAILURE_MEDIUM, "lease_payment", False, "building_owner_insufficient_funds")
        
        return False, 0, 0
    
    # Process the payment
    # 1. Deduct full amount from building owner
    update_compute_balance(tables, building_owner_record['id'], lease_price, "subtract")
    
    # 2. Add net amount to land owner
    update_compute_balance(tables, land_owner_record['id'], net_amount, "add")
    
    # 3. Add tax amount to ConsiglioDeiDieci
    update_compute_balance(tables, consiglio_record['id'], tax_amount, "add")
    
    # 4. Create transaction record for land owner payment
    create_transaction_record(tables, building_owner, land_owner, net_amount, land_id, building_id)
    
    # 5. Create transaction record for tax payment
    create_tax_transaction_record(tables, building_owner, "ConsiglioDeiDieci", tax_amount, land_id, building_id, tax_rate)

    # Trust impact: Successful lease payment from Building Owner to Land Owner
    if building_owner and land_owner:
        update_trust_score_for_activity(tables, building_owner, land_owner, TRUST_SCORE_SUCCESS_MEDIUM, "lease_payment", True)
    
    log.info(f"Successfully processed lease payment: {net_amount} to {land_owner}, {tax_amount} tax to ConsiglioDeiDieci")
    
    return True, net_amount, tax_amount

def create_tax_transaction_record(tables, from_citizen: str, to_citizen: str, amount: float, land_id: str, building_id: str, tax_rate: float) -> Optional[Dict]:
    """Create a transaction record for a lease tax payment."""
    log.info(f"Creating tax transaction record: {from_citizen} -> {to_citizen}, amount: {amount}")
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the transaction record
        transaction = tables['transactions'].create({
            "Type": "lease_tax",
            "Asset": f"tax_{land_id}_{building_id}",
            "Seller": from_citizen,  # Building owner is the seller (paying)
            "Buyer": to_citizen,     # ConsiglioDeiDieci is the buyer (receiving)
            "Price": amount,
            "CreatedAt": now,
            "ExecutedAt": now,
            "Notes": json.dumps({
                "land_id": land_id,
                "building_id": building_id,
                "payment_type": "lease_tax",
                "tax_rate": f"{tax_rate * 100:.2f}%",
                "payment_date": now
            })
        })
        
        log.info(f"Created tax transaction record: {transaction['id']}")
        return transaction
    except Exception as e:
        log.error(f"Error creating tax transaction record: {e}")
        return None

def create_land_owner_summary(tables, land_owner: str, land_name: str, buildings_data: List[Dict], total_amount: float) -> None:
    """Create a summary notification for a land owner about all lease payments received."""
    if not buildings_data:
        return
    
    # Calculate average tax rate for this land
    total_tax = sum(building.get("tax_amount", 0) for building in buildings_data)
    total_lease = sum(building.get("lease_price", 0) for building in buildings_data)
    avg_tax_rate = (total_tax / total_lease) * 100 if total_lease > 0 else 0
    
    # Get development rate from the first building's data (should be the same for all buildings on this land)
    development_rate = buildings_data[0].get("development_rate", 0) * 100 if buildings_data else 0
    
    content = f"💰 You received **{int(total_amount):,} ⚜️ Ducats** in lease payments for your land **{land_name}** (after **{avg_tax_rate:.1f}%** republican tax, development rate: **{development_rate:.1f}%**)."
    
    details = {
        "land_name": land_name,
        "total_amount": total_amount,
        "buildings_count": len(buildings_data),
        "buildings": buildings_data,
        "tax_rate": f"{avg_tax_rate:.1f}%",
        "development_rate": f"{development_rate:.1f}%",
        "event_type": "lease_payments_received"
    }
    
    create_notification(tables, land_owner, content, details)

def create_building_owner_summary(tables, building_owner: str, buildings_data: List[Dict], total_amount: float, total_tax: float) -> None:
    """Create a summary notification for a building owner about all lease payments made."""
    if not buildings_data:
        return
    
    # Calculate average tax rate
    total_lease = total_amount + total_tax
    avg_tax_rate = (total_tax / total_lease) * 100 if total_lease > 0 else 0
    
    # Calculate average development rate across all lands
    development_rates = [building.get("development_rate", 0) * 100 for building in buildings_data if "development_rate" in building]
    avg_development_rate = sum(development_rates) / len(development_rates) if development_rates else 0
    
    content = f"🏠 You paid **{int(total_amount + total_tax):,} ⚜️ Ducats** in lease payments for your **{len(buildings_data)}** buildings (**{int(total_amount):,}** to land owners, **{int(total_tax):,}** in republican tax at **{avg_tax_rate:.1f}%** rate, avg development: **{avg_development_rate:.1f}%**)."
    
    details = {
        "total_amount": total_amount,
        "total_tax": total_tax,
        "total_paid": total_amount + total_tax,
        "buildings_count": len(buildings_data),
        "buildings": buildings_data,
        "avg_tax_rate": f"{avg_tax_rate:.1f}%",
        "avg_development_rate": f"{avg_development_rate:.1f}%",
        "event_type": "lease_payments_made"
    }
    
    create_notification(tables, building_owner, content, details)

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
        # Use the proper API endpoint with JSON payload instead of URL parameters
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        
        # Prepare the payload as JSON
        payload = {
            "chat_id": MAIN_TELEGRAM_CHAT_ID,
            "text": message
        }
        
        # Send the message with a proper JSON payload
        response = requests.post(url, json=payload)
        
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

def create_admin_summary(tables, lease_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"🏛️ **Lease distribution complete**: **{lease_summary['successful']}** payments processed, total: **{int(lease_summary['total_amount']):,} ⚜️ Ducats** to land owners, **{int(lease_summary['total_tax']):,} ⚜️ Ducats** in tax revenue."
        
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
            "total_tax": lease_summary['total_tax'],
            "tax_rate": "variable (20-50%)",
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
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def distribute_leases(dry_run: bool = False):
    """Main function to distribute lease payments from building owners to land owners."""
    log_header(f"Lease Distribution Process (dry_run={dry_run})", LogColors.HEADER)
    
    # Test Telegram connection
    telegram_connected = test_telegram_connection()
    if not telegram_connected:
        log.warning("Telegram connection test failed, notifications may not be delivered")
    
    try:
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
            "total_tax": 0,  # Add tracking for total tax collected
            "by_land_owner": defaultdict(float),      # Total received by each land owner
            "by_building_owner": defaultdict(float),  # Total paid by each building owner
            "by_building_owner_tax": defaultdict(float),  # Total tax paid by each building owner
            "land_owner_buildings": defaultdict(list),  # Buildings data for each land owner
            "building_owner_lands": defaultdict(list),   # Lands data for each building owner
            "land_income": {}  # Track income per land
        }
        
        for land in lands:
            try:
                land_id = land['id']
                land_name = land['fields'].get('HistoricalName', land['fields'].get('EnglishName', land_id))
                land_owner = land['fields'].get('Owner', '')
            
                log.info(f"Processing land {land_name} (ID: {land_id}) owned by {land_owner}")
            
                # Skip if no owner
                if not land_owner:
                    log.warning(f"Land {land_id} has no owner, skipping")
                    continue
                
                # Get buildings on this land, passing the land record
                buildings = get_buildings_on_land(tables, land_id, land)
                
                if not buildings:
                    log.info(f"No buildings with lease amounts found on land {land_id}")
                    continue
                
                # Track lease payments for this land
                land_total = 0
                land_buildings_data = []
                
                for building in buildings:
                    try:
                        # Process the lease payment - now returns net amount and tax amount
                        success, net_amount, tax_amount = process_lease_payment(tables, land, building, dry_run)
                        
                        if success:
                            if net_amount > 0 or tax_amount > 0:  # Only count if actual payment was made
                                lease_summary["successful"] += 1
                                lease_summary["total_amount"] += net_amount
                                lease_summary["total_tax"] += tax_amount
                                lease_summary["by_land_owner"][land_owner] += net_amount
                                
                                # Get building owner safely
                                building_owner = building['fields'].get('Citizen', '')
                                if building_owner:
                                    lease_summary["by_building_owner"][building_owner] -= (net_amount + tax_amount)
                                    lease_summary["by_building_owner_tax"][building_owner] += tax_amount
                                
                                land_total += net_amount
                                
                                # Add building data for land owner notification
                                building_id = building['id']
                                building_name = building['fields'].get('Name', building_id)
                                building_type = building['fields'].get('Type', 'unknown')
                                
                                # Safely get lease amount
                                try:
                                    lease_price = float(building['fields'].get('LeasePrice', 0))
                                except (ValueError, TypeError):
                                    lease_price = 0
                                
                                # Calculate development ratio for this land
                                building_points_count = land['fields'].get('BuildingPointsCount', 0)
                                buildings_count = land['fields'].get('BuildingsCount', 0)
                                development_ratio = min(float(buildings_count) / float(building_points_count), 1.0) if building_points_count > 0 else 0
                                
                                # Calculate tax rate for this land
                                calculated_tax_rate = calculate_tax_rate(land)
                                
                                land_buildings_data.append({
                                    "building_id": building_id,
                                    "building_name": building_name,
                                    "building_type": building_type,
                                    "building_owner": building_owner,
                                    "lease_price": lease_price,
                                    "net_amount": net_amount,
                                    "tax_amount": tax_amount,
                                    "tax_rate": calculated_tax_rate,
                                    "development_rate": development_ratio
                                })
                                
                                # Add land data for building owner notification
                                if building_owner:
                                    lease_summary["building_owner_lands"][building_owner].append({
                                        "land_id": land_id,
                                        "land_name": land_name,
                                        "land_owner": land_owner,
                                        "building_id": building_id,
                                        "building_name": building_name,
                                        "building_type": building_type,
                                        "lease_price": lease_price,
                                        "net_amount": net_amount,
                                        "tax_amount": tax_amount,
                                        "tax_rate": calculated_tax_rate,
                                        "development_rate": development_ratio
                                    })
                        else:
                            lease_summary["failed"] += 1
                    except Exception as building_error:
                        log.error(f"Error processing building {building.get('id', 'unknown')}: {building_error}")
                        lease_summary["failed"] += 1
                
                # Track the total income for this land
                lease_summary["land_income"][land_id] = land_total
                
                # Update the LastIncome field in the LANDS table, even in dry-run mode
                try:
                    if land_total > 0:
                        log.info(f"{'[DRY RUN] Would update' if dry_run else 'Updating'} LastIncome for land {land_id} to {land_total}")
                        tables['lands'].update(land_id, {
                            "LastIncome": land_total
                        })
                except Exception as update_error:
                    log.error(f"Error updating LastIncome for land {land_id}: {update_error}")
                
                # Add buildings data for this land to the summary
                if land_buildings_data:
                    lease_summary["land_owner_buildings"][land_owner].extend(land_buildings_data)
            except Exception as land_error:
                log.error(f"Error processing land {land.get('id', 'unknown')}: {land_error}")
                continue
    
        log.info(f"Lease distribution process complete. Successful: {lease_summary['successful']}, Failed: {lease_summary['failed']}")
        log.info(f"Total amount to land owners: {lease_summary['total_amount']}, Total tax collected: {lease_summary['total_tax']}")
        
        # Create notifications for land owners
        if not dry_run:
            try:
                for land_owner, buildings_data in lease_summary["land_owner_buildings"].items():
                    total_received = lease_summary["by_land_owner"][land_owner]
                    # Group buildings by land
                    lands_data = {}
                    for building in buildings_data:
                        land_id = next((land['id'] for land in lands if land['fields'].get('Citizen') == land_owner), None)
                        if land_id:
                            land_name = next((land['fields'].get('HistoricalName', land['fields'].get('EnglishName', land_id)) 
                                            for land in lands if land['id'] == land_id), land_id)
                            if land_name not in lands_data:
                                lands_data[land_name] = {"buildings": [], "total": 0}
                            lands_data[land_name]["buildings"].append(building)
                            lands_data[land_name]["total"] += building.get("net_amount", 0)
                    
                    # Create a notification for each land
                    for land_name, data in lands_data.items():
                        create_land_owner_summary(tables, land_owner, land_name, data["buildings"], data["total"])
                
                # Create notifications for building owners
                for building_owner, lands_data in lease_summary["building_owner_lands"].items():
                    total_paid = -lease_summary["by_building_owner"].get(building_owner, 0)
                    total_tax = lease_summary["by_building_owner_tax"].get(building_owner, 0)
                    create_building_owner_summary(tables, building_owner, lands_data, total_paid - total_tax, total_tax)
                
                # Create admin summary notification
                create_admin_summary(tables, lease_summary)
                
                # Send Telegram notification
                if lease_summary["successful"] > 0:
                    # Calculate average payment
                    avg_payment = lease_summary["total_amount"] / lease_summary["successful"] if lease_summary["successful"] > 0 else 0
                    
                    notification_message = (
                        "🏛️ **Daily Lease Distribution Complete** 🏛️\n\n"
                        "The **Vigesima Variabilis** tax has been collected on all lease payments.\n\n"
                        f"• **{lease_summary['successful']}** lease payments processed\n"
                        f"• **{int(lease_summary['total_amount']):,} ⚜️ ducats** to land owners\n"
                        f"• **{int(lease_summary['total_tax']):,} ⚜️ ducats** in tax revenue\n"
                        f"• **{int(avg_payment):,} ⚜️ ducats** per lease on average\n\n"
                        "Visit **https://serenissima.ai** to check your properties."
                    )
                    
                    # Try to send notification but continue even if it fails
                    try:
                        notification_sent = send_telegram_notification(notification_message)
                        if not notification_sent:
                            log.warning("Telegram notification could not be sent, but lease distribution completed successfully")
                    except Exception as e:
                        log.error(f"Error in Telegram notification process: {str(e)}")
                        log.warning("Continuing despite Telegram notification failure")
            except Exception as notification_error:
                log.error(f"Error creating notifications: {notification_error}")
    except Exception as e:
        log.error(f"Error in lease distribution process: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Distribute lease payments from building owners to land owners.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    distribute_leases(dry_run=args.dry_run)
