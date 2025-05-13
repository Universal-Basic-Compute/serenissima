#!/usr/bin/env python3
"""
Script to collect building maintenance costs from owners and transfer to ConsiglioDeiDieci.
This script should be run on a regular schedule (e.g., daily or weekly).
"""

import os
import json
import logging
import sys
from datetime import datetime
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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

# API endpoints and auth
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000/api")
API_KEY = os.getenv("API_KEY")

# ConsiglioDeiDieci user ID
CONSIGLIO_USER_ID = "ConsiglioDeiDieci"

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
    """Fetch all buildings from the API."""
    try:
        response = requests.get(f"{API_BASE_URL}/buildings", headers={"Authorization": f"Bearer {API_KEY}"})
        response.raise_for_status()
        return response.json().get("buildings", [])
    except Exception as e:
        logger.error(f"Error fetching buildings: {str(e)}")
        return []


def get_user_balance(user_id):
    """Get current balance for a user."""
    try:
        response = requests.get(f"{API_BASE_URL}/users/{user_id}/balance", headers={"Authorization": f"Bearer {API_KEY}"})
        response.raise_for_status()
        return response.json().get("balance", 0)
    except Exception as e:
        logger.error(f"Error fetching balance for user {user_id}: {str(e)}")
        return 0


def update_user_balance(user_id, amount, description):
    """Update user balance."""
    try:
        payload = {
            "amount": amount,
            "description": description,
            "timestamp": datetime.now().isoformat()
        }
        response = requests.post(
            f"{API_BASE_URL}/users/{user_id}/transactions", 
            json=payload,
            headers={"Authorization": f"Bearer {API_KEY}"}
        )
        response.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Error updating balance for user {user_id}: {str(e)}")
        return False


def send_admin_notification(recipient_id, total_collected, buildings_processed, buildings_with_errors):
    """Send an admin notification with maintenance collection summary."""
    try:
        notification_payload = {
            "recipient": recipient_id,
            "title": "Building Maintenance Collection Summary",
            "message": f"Daily maintenance collection complete. Collected {total_collected} ducats from {buildings_processed} buildings. {buildings_with_errors} buildings had errors.",
            "type": "admin",
            "priority": "normal",
            "data": {
                "total_collected": total_collected,
                "buildings_processed": buildings_processed,
                "buildings_with_errors": buildings_with_errors,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        response = requests.post(
            f"{API_BASE_URL}/notifications", 
            json=notification_payload,
            headers={"Authorization": f"Bearer {API_KEY}"}
        )
        response.raise_for_status()
        logger.info(f"Successfully sent admin notification to {recipient_id}")
        return True
    except Exception as e:
        logger.error(f"Error sending admin notification to {recipient_id}: {str(e)}")
        return False


def collect_maintenance_costs():
    """Main function to collect maintenance costs from all building owners."""
    logger.info("Starting maintenance cost collection process")
    
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
            owner_balance = get_user_balance(owner_id)
            
            # Check if owner has enough funds
            if owner_balance < maintenance_cost:
                logger.warning(f"Owner {owner_id} has insufficient funds for maintenance of building {building_id}")
                # TODO: Implement consequences for non-payment (building degradation, etc.)
                continue
            
            # Deduct maintenance cost from owner
            deduction_description = f"Maintenance cost for {building_type} (ID: {building_id})"
            if update_user_balance(owner_id, -maintenance_cost, deduction_description):
                # Add maintenance cost to ConsiglioDeiDieci
                transfer_description = f"Maintenance fee collected from {owner_id} for {building_type} (ID: {building_id})"
                if update_user_balance(CONSIGLIO_USER_ID, maintenance_cost, transfer_description):
                    logger.info(f"Successfully collected {maintenance_cost} ducats from {owner_id} for building {building_id}")
                    total_maintenance_collected += maintenance_cost
                    buildings_processed += 1
                else:
                    logger.error(f"Failed to transfer maintenance cost to {CONSIGLIO_USER_ID}")
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
    
    # Send admin notification to NLR
    send_admin_notification("NLR", total_maintenance_collected, buildings_processed, buildings_with_errors)
    
    return {
        "total_collected": total_maintenance_collected,
        "buildings_processed": buildings_processed,
        "buildings_with_errors": buildings_with_errors
    }


if __name__ == "__main__":
    collect_maintenance_costs()
