#!/usr/bin/env python3
"""
Script to collect building maintenance costs from owners and transfer to ConsiglioDeiDieci.
This script should be run on a regular schedule (daily).
"""

import os
import json
import logging
import sys
import argparse
from datetime import datetime
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
MAINT_SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT_MAINT = os.path.abspath(os.path.join(MAINT_SCRIPT_DIR, '..', '..'))
if PROJECT_ROOT_MAINT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_MAINT)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("maintenance_collection.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("maintenance_collector")

# Airtable credentials
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
AIRTABLE_BUILDINGS_TABLE = os.getenv("AIRTABLE_BUILDINGS_TABLE", "BUILDINGS")
AIRTABLE_CITIZENS_TABLE = os.getenv("AIRTABLE_CITIZENS_TABLE", "Citizens")
AIRTABLE_NOTIFICATIONS_TABLE = os.getenv("AIRTABLE_NOTIFICATIONS_TABLE", "NOTIFICATIONS")

# Initialize Airtable
airtable = Api(AIRTABLE_API_KEY)
buildings_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_BUILDINGS_TABLE)
citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_CITIZENS_TABLE)
notifications_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_NOTIFICATIONS_TABLE)

# ConsiglioDeiDieci citizen ID
CONSIGLIO_CITIZEN_ID = "ConsiglioDeiDieci"

# Building data directory
BUILDINGS_DATA_DIR = os.getenv("BUILDINGS_DATA_DIR", "../data/buildings")


def load_building_data(building_type):
    """Load building data from JSON file to get maintenance cost."""
    try:
        # Search for the building JSON file in the data directory
        for root, dirs, files in os.walk(BUILDINGS_DATA_DIR):
            for file in files:
                if file.lower() == f"{building_type.lower()}.json":
                    file_path = os.path.join(root, file)
                    with open(file_path, 'r', encoding='utf-8') as f:
                        building_data = json.load(f)
                        return building_data
        
        logger.warning(f"Building data file not found for type: {building_type}")
        return None
    except Exception as e:
        logger.error(f"Error loading building data for {building_type}: {str(e)}")
        return None


def get_all_buildings():
    """Fetch all buildings directly from Airtable."""
    try:
        records = buildings_table.all()
        buildings = []
        
        for record in records:
            building = {
                "id": record.get("id"),
                "type": record.get("fields", {}).get("Type"),
                "owner": record.get("fields", {}).get("Citizen"),
                "land_id": record.get("fields", {}).get("Land")
            }
            buildings.append(building)
            
        logger.info(f"Successfully fetched {len(buildings)} buildings from Airtable")
        return buildings
    except Exception as e:
        logger.error(f"Error fetching buildings from Airtable: {str(e)}")
        return []


def get_citizen_balance(citizen_id):
    """Get current balance for a citizen directly from Airtable."""
    try:
        # First try to find by username
        formula = f"{{Username}}='{citizen_id}'"
        records = citizens_table.all(formula=formula)
        
        # If not found, try by wallet address
        if not records:
            formula = f"{{Wallet}}='{citizen_id}'"
            records = citizens_table.all(formula=formula)
        
        if records:
            return records[0].get("fields", {}).get("Ducats", 0)
        else:
            logger.warning(f"Citizen not found: {citizen_id}")
            return 0
    except Exception as e:
        logger.error(f"Error fetching balance for citizen {citizen_id}: {str(e)}")
        return 0


def update_citizen_balance(citizen_id, amount, description):
    """Update citizen balance directly in Airtable."""
    try:
        # First try to find by username
        formula = f"{{Username}}='{citizen_id}'"
        records = citizens_table.all(formula=formula)
        
        # If not found, try by wallet address
        if not records:
            formula = f"{{Wallet}}='{citizen_id}'"
            records = citizens_table.all(formula=formula)
        
        if not records:
            logger.warning(f"Citizen not found: {citizen_id}")
            return False
        
        citizen_record = records[0]
        current_balance = citizen_record.get("fields", {}).get("Ducats", 0)
        new_balance = current_balance + amount
        
        # Update the citizen's balance
        citizens_table.update(citizen_record["id"], {"Ducats": new_balance})
        
        logger.info(f"Updated balance for {citizen_id}: {current_balance} -> {new_balance} ({description})")
        return True
    except Exception as e:
        logger.error(f"Error updating balance for citizen {citizen_id}: {str(e)}")
        return False


def send_admin_notification(recipient_id, total_collected, buildings_processed, buildings_with_errors):
    """Send an admin notification with maintenance collection summary directly to Airtable."""
    try:
        notification_data = {
            "Recipient": recipient_id,
            "Title": "🏛️ Building Maintenance Collection Summary",
            "Message": f"Daily maintenance collection complete. Collected **{total_collected:,}** 💰 ducats from **{buildings_processed:,}** 🏠 buildings. **{buildings_with_errors:,}** buildings had errors.",
            "Type": "admin",
            "Priority": "normal",
            "Data": json.dumps({
                "total_collected": total_collected,
                "buildings_processed": buildings_processed,
                "buildings_with_errors": buildings_with_errors,
                "timestamp": datetime.now().isoformat()
            }),
            "CreatedAt": datetime.now().isoformat(),
            "IsRead": False
        }
        
        notification_record = notifications_table.create(notification_data)
        logger.info(f"Successfully sent admin notification to {recipient_id}")
        return True
    except Exception as e:
        logger.error(f"Error sending admin notification to {recipient_id}: {str(e)}")
        return False


def collect_maintenance_costs(dry_run: bool = False): # Added dry_run parameter to match call
    """Main function to collect maintenance costs from all building owners."""
    log_header(f"Building Maintenance Collection (dry_run={dry_run})", LogColors.HEADER)
    
    # Get all buildings
    buildings = get_all_buildings()
    logger.info(f"Found {len(buildings)} buildings to process")
    
    # Track total maintenance collected
    total_maintenance_collected = 0
    buildings_processed = 0
    buildings_with_errors = 0
    
    # Process each building
    for building in buildings:
        try:
            building_type = building.get("type")
            owner_id = building.get("owner")
            building_id = building.get("id")
            
            if not building_type or not owner_id or not building_id:
                logger.warning(f"Skipping building with missing data: {building}")
                continue
            
            # Load building data to get maintenance cost
            building_data = load_building_data(building_type)
            if not building_data or "maintenanceCost" not in building_data:
                logger.warning(f"No maintenance cost found for building type: {building_type}")
                continue
            
            maintenance_cost = building_data["maintenanceCost"]
            
            # Skip if maintenance cost is 0
            if maintenance_cost <= 0:
                logger.info(f"Building {building_id} ({building_type}) has no maintenance cost")
                buildings_processed += 1
                continue
            
            # Get owner's current balance
            owner_balance = get_citizen_balance(owner_id)
            
            # Check if owner has enough funds
            if owner_balance < maintenance_cost:
                logger.warning(f"Owner {owner_id} has insufficient funds for maintenance of building {building_id}")
                # Create notification for owner about insufficient funds
                insufficient_funds_message = f"⚠️ **Insufficient Funds**: You don't have enough ducats to pay the **{maintenance_cost:,}** 💰 maintenance cost for your **{building_type}** (ID: **{building_id}**)."
                # TODO: Implement consequences for non-payment (building degradation, etc.)
                continue
            
            # Deduct maintenance cost from owner
            deduction_description = f"🔧 Maintenance cost for **{building_type}** (ID: **{building_id}**)"
            if update_citizen_balance(owner_id, -maintenance_cost, deduction_description):
                # Add maintenance cost to ConsiglioDeiDieci
                transfer_description = f"💰 Maintenance fee collected from **{owner_id}** for **{building_type}** (ID: **{building_id}**)"
                if update_citizen_balance(CONSIGLIO_CITIZEN_ID, maintenance_cost, transfer_description):
                    logger.info(f"Successfully collected {maintenance_cost} ducats from {owner_id} for building {building_id}")
                    total_maintenance_collected += maintenance_cost
                    buildings_processed += 1
                else:
                    logger.error(f"Failed to transfer maintenance cost to {CONSIGLIO_CITIZEN_ID}")
                    buildings_with_errors += 1
            else:
                logger.error(f"Failed to deduct maintenance cost from {owner_id}")
                buildings_with_errors += 1
                
        except Exception as e:
            logger.error(f"Error processing building {building.get('id', 'unknown')}: {str(e)}")
            buildings_with_errors += 1
    
    # Log summary
    logger.info(f"Maintenance collection complete. Processed {buildings_processed} buildings.")
    logger.info(f"Total maintenance collected: {total_maintenance_collected} ducats")
    logger.info(f"Buildings with errors: {buildings_with_errors}")
    
    # Send admin notification to ConsiglioDeiDieci
    send_admin_notification("ConsiglioDeiDieci", total_maintenance_collected, buildings_processed, buildings_with_errors)
    
    return {
        "total_collected": total_maintenance_collected,
        "buildings_processed": buildings_processed,
        "buildings_with_errors": buildings_with_errors
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Collect building maintenance costs.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    # Add other arguments if needed, e.g., --verbose
    args = parser.parse_args()

    collect_maintenance_costs(dry_run=args.dry_run)
