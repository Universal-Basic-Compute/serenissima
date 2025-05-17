#!/usr/bin/env python3
"""
Citizen Housing Mobility script for La Serenissima.

This script:
1. Checks all housed citizens
2. Based on social class, determines if they look for cheaper housing:
   - Nobili: 10% chance
   - Cittadini: 20% chance
   - Popolani: 30% chance
   - Facchini: 40% chance
3. If they decide to look, finds available housing of the appropriate type with rent below a threshold:
   - Nobili: 12% cheaper
   - Cittadini: 8% cheaper
   - Popolani: 6% cheaper
   - Facchini: 4% cheaper
4. Moves citizens to cheaper housing if found
5. Sends notifications to relevant parties

Run this script daily to simulate housing mobility in Venice.
"""

import os
import sys
import logging
import argparse
import random
import json
import datetime
import subprocess
from typing import Dict, List, Optional, Any, Tuple
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizen_housing_mobility")

# Load environment variables
load_dotenv()

# Constants for mobility chances by social class
MOBILITY_CHANCE = {
    "Nobili": 0.10,  # 10% chance
    "Cittadini": 0.20,  # 20% chance
    "Popolani": 0.30,   # 30% chance
    "Facchini": 0.40    # 40% chance
}

# Constants for rent reduction thresholds by social class
RENT_REDUCTION_THRESHOLD = {
    "Nobili": 0.12,  # 12% cheaper
    "Cittadini": 0.08,  # 8% cheaper
    "Popolani": 0.06,   # 6% cheaper
    "Facchini": 0.04    # 4% cheaper
}

# Constants for building types by social class (same as in househomelesscitizens.py)
BUILDING_PREFERENCES = {
    "Nobili": ["canal_house"],
    "Cittadini": ["merchant_s_house"],
    "Popolani": ["artisan_s_house"],
    "Facchini": ["fisherman_s_cottage"]
}

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        # Use the new recommended way to initialize tables
        api = Api(api_key)
        base = api.base(base_id)
        
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': base.table('CITIZENS'),
            'buildings': base.table('BUILDINGS'),
            'notifications': base.table('NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_housed_citizens(tables) -> List[Dict]:
    """Fetch citizens who have homes."""
    log.info("Fetching housed citizens...")
    
    try:
        # Get buildings with non-empty Occupant field
        formula = "NOT(OR({Occupant} = '', {Occupant} = BLANK()))"
        occupied_buildings = tables['buildings'].all(formula=formula)
        
        # Extract the occupant IDs
        citizen_ids = [building['fields'].get('Occupant') for building in occupied_buildings if building['fields'].get('Occupant')]
        
        # If no citizens are housed, return empty list
        if not citizen_ids:
            log.info("No housed citizens found")
            return []
        
        # Create a formula to get these citizens
        citizen_conditions = [f"RECORD_ID()='{citizen_id}'" for citizen_id in citizen_ids]
        formula = f"OR({', '.join(citizen_conditions)})"
        
        housed_citizens = tables['citizens'].all(formula=formula)
        
        # Add the building information to each citizen for easier processing
        for citizen in housed_citizens:
            # Find the building this citizen occupies
            for building in occupied_buildings:
                if building['fields'].get('Occupant') == citizen['id']:
                    # Add building info to the citizen record
                    citizen['current_building'] = building
                    break
        
        log.info(f"Found {len(housed_citizens)} housed citizens")
        return housed_citizens
    except Exception as e:
        log.error(f"Error fetching housed citizens: {e}")
        return []

def get_building_details(tables, building_id: str) -> Optional[Dict]:
    """Get details of a specific building."""
    try:
        building = tables['buildings'].get(building_id)
        return building
    except Exception as e:
        log.error(f"Error fetching building {building_id}: {e}")
        return None

def get_available_buildings(tables, building_type: str) -> List[Dict]:
    """Fetch available buildings of a specific type, sorted by rent in ascending order."""
    log.info(f"Fetching available buildings of type: {building_type}")
    
    try:
        # Get buildings of the specified type that are not already occupied
        formula = f"AND({{Type}} = '{building_type}', OR({{Occupant}} = '', {{Occupant}} = BLANK()))"
        buildings = tables['buildings'].all(formula=formula)
        
        # Sort by RentAmount in ascending order
        buildings.sort(key=lambda b: float(b['fields'].get('RentAmount', 0) or 0))
        
        log.info(f"Found {len(buildings)} available buildings of type {building_type}")
        return buildings
    except Exception as e:
        log.error(f"Error fetching buildings of type {building_type}: {e}")
        return []

def move_citizen_to_new_building(tables, citizen: Dict, old_building: Dict, new_building: Dict) -> bool:
    """Move a citizen from one building to another."""
    citizen_id = citizen['id']
    old_building_id = old_building['id']
    new_building_id = new_building['id']
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    old_building_name = old_building['fields'].get('Name', old_building_id)
    new_building_name = new_building['fields'].get('Name', new_building_id)
    
    log.info(f"Moving {citizen_name} from {old_building_name} to {new_building_name}")
    
    try:
        # Update old building record to remove occupant
        tables['buildings'].update(old_building_id, {
            'Occupant': ""
        })
        
        # Update new building record with new occupant
        tables['buildings'].update(new_building_id, {
            'Occupant': citizen_id
        })
        
        # Call updatecitizenDescriptionAndImage.py to update the citizen's description and image
        try:
            # Get the citizen's username
            citizen_username = citizen['fields'].get('Username', citizen_id)
            
            # Get the path to the updatecitizenDescriptionAndImage.py script
            script_dir = os.path.dirname(os.path.abspath(__file__))
            update_script_path = os.path.join(script_dir, "..", "scripts", "updatecitizenDescriptionAndImage.py")
            
            if os.path.exists(update_script_path):
                # Call the script to update the citizen's description and image
                log.info(f"Calling updatecitizenDescriptionAndImage.py for citizen {citizen_username} after housing move")
                result = subprocess.run(
                    [sys.executable, update_script_path, citizen_username],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode != 0:
                    log.warning(f"Error updating citizen description and image: {result.stderr}")
                else:
                    log.info(f"Successfully updated description and image for citizen {citizen_username}")
            else:
                log.warning(f"Update script not found at: {update_script_path}")
        except Exception as e:
            log.warning(f"Error calling updatecitizenDescriptionAndImage.py: {e}")
            # Continue anyway as this is not critical
        
        log.info(f"Successfully moved {citizen_name} to {new_building_name}")
        return True
    except Exception as e:
        log.error(f"Error moving citizen to new building: {e}")
        return False

def create_notification(tables, citizen: str, content: str, details: Dict) -> None:
    """Create a notification for a citizen."""
    try:
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_mobility",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": citizen
        })
        
        log.info(f"Created notification for citizen {citizen}")
    except Exception as e:
        log.error(f"Error creating notification: {e}")

def send_notifications(tables, citizen: Dict, old_building: Dict, new_building: Dict) -> None:
    """Send notifications to old landlord, new landlord, and admin."""
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    old_building_name = old_building['fields'].get('Name', old_building['id'])
    new_building_name = new_building['fields'].get('Name', new_building['id'])
    
    old_rent = old_building['fields'].get('RentAmount', 0)
    new_rent = new_building['fields'].get('RentAmount', 0)
    
    # Get landlords (building owners)
    old_landlord = old_building['fields'].get('Citizen', 'Unknown')
    new_landlord = new_building['fields'].get('Citizen', 'Unknown')
    
    # Notification for old landlord
    if old_landlord and old_landlord != 'Unknown':
        content = f"{citizen_name} has moved out of your property {old_building_name}"
        details = {
            "event_type": "tenant_moved_out",
            "citizen_id": citizen['id'],
            "citizen_name": citizen_name,
            "building_id": old_building['id'],
            "building_name": old_building_name,
            "rent_amount": old_rent
        }
        create_notification(tables, old_landlord, content, details)
    
    # Notification for new landlord
    if new_landlord and new_landlord != 'Unknown':
        content = f"{citizen_name} has moved into your property {new_building_name}"
        details = {
            "event_type": "tenant_moved_in",
            "citizen_id": citizen['id'],
            "citizen_name": citizen_name,
            "building_id": new_building['id'],
            "building_name": new_building_name,
            "rent_amount": new_rent
        }
        create_notification(tables, new_landlord, content, details)
    
    # Notification for citizen
    content = f"You have moved from {old_building_name} to {new_building_name}, saving {old_rent - new_rent} ⚜️ Ducats in rent"
    details = {
        "event_type": "housing_changed",
        "old_building_id": old_building['id'],
        "old_building_name": old_building_name,
        "new_building_id": new_building['id'],
        "new_building_name": new_building_name,
        "old_rent": old_rent,
        "new_rent": new_rent,
        "savings": old_rent - new_rent
    }
    create_notification(tables, citizen['id'], content, details)

def create_admin_summary(tables, mobility_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"Housing mobility report: {mobility_summary['total_moved']} citizens moved to cheaper housing"
        
        # Create detailed information
        details = {
            "event_type": "housing_mobility_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_citizens_checked": mobility_summary['total_checked'],
            "total_citizens_looking": mobility_summary['total_looking'],
            "total_citizens_moved": mobility_summary['total_moved'],
            "by_social_class": {
                "Nobili": {
                    "checked": mobility_summary['by_class'].get('Nobili', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Nobili', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Nobili', {}).get('moved', 0)
                },
                "Cittadini": {
                    "checked": mobility_summary['by_class'].get('Cittadini', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Cittadini', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Cittadini', {}).get('moved', 0)
                },
                "Popolani": {
                    "checked": mobility_summary['by_class'].get('Popolani', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Popolani', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Popolani', {}).get('moved', 0)
                },
                "Facchini": {
                    "checked": mobility_summary['by_class'].get('Facchini', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Facchini', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Facchini', {}).get('moved', 0)
                }
            },
            "average_savings": mobility_summary['total_savings'] / mobility_summary['total_moved'] if mobility_summary['total_moved'] > 0 else 0
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_mobility_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def process_housing_mobility(dry_run: bool = False):
    """Main function to process housing mobility."""
    log.info(f"Starting housing mobility process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    housed_citizens = get_housed_citizens(tables)
    
    if not housed_citizens:
        log.info("No housed citizens found. Mobility process complete.")
        return
    
    # Sort citizens by wealth in ascending order
    housed_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0))
    log.info(f"Sorted {len(housed_citizens)} citizens by wealth in ascending order")
    
    # Track mobility statistics
    mobility_summary = {
        "total_checked": 0,
        "total_looking": 0,
        "total_moved": 0,
        "total_savings": 0,
        "by_class": {
            "Nobili": {"checked": 0, "looking": 0, "moved": 0},
            "Cittadini": {"checked": 0, "looking": 0, "moved": 0},
            "Popolani": {"checked": 0, "looking": 0, "moved": 0},
            "Facchini": {"checked": 0, "looking": 0, "moved": 0}
        }
    }
    
    for citizen in housed_citizens:
        citizen_id = citizen['id']
        social_class = citizen['fields'].get('SocialClass', '')
        
        # Get current building from the attached building info
        current_building = citizen.get('current_building')
        if not current_building:
            citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            log.warning(f"Citizen {citizen_name} has no current building information despite being in housed list")
            continue
        
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        
        # Skip if social class is unknown or not in our mobility table
        if not social_class or social_class not in MOBILITY_CHANCE:
            log.warning(f"Citizen {citizen_name} has unknown social class: {social_class}")
            continue
        
        # Track that we checked this citizen
        mobility_summary["total_checked"] += 1
        mobility_summary["by_class"][social_class]["checked"] += 1
        
        # Determine if citizen looks for new housing based on social class
        mobility_chance = MOBILITY_CHANCE.get(social_class, 0.0)
        is_looking = random.random() < mobility_chance
        
        if not is_looking:
            log.info(f"Citizen {citizen_name} is not looking for new housing")
            continue
        
        # Track that this citizen is looking
        mobility_summary["total_looking"] += 1
        mobility_summary["by_class"][social_class]["looking"] += 1
        
        log.info(f"Citizen {citizen_name} is looking for cheaper housing")
        
        # Get current rent
        current_rent = float(current_building['fields'].get('RentAmount', 0) or 0)
        if current_rent <= 0:
            log.warning(f"Current building {current_building['id']} has invalid rent: {current_rent}")
            continue
        
        # Calculate maximum rent for new housing
        rent_threshold = RENT_REDUCTION_THRESHOLD.get(social_class, 0.0)
        max_new_rent = current_rent * (1 - rent_threshold)
        
        log.info(f"Citizen {citizen_name} is looking for rent below {max_new_rent} (current: {current_rent})")
        
        # Get building preferences for this social class
        building_types = BUILDING_PREFERENCES.get(social_class, [])
        if not building_types:
            log.warning(f"No building preferences for social class: {social_class}")
            continue
        
        # Find available buildings of the right type with rent below threshold
        suitable_buildings = []
        for building_type in building_types:
            available_buildings = get_available_buildings(tables, building_type)
            
            # Filter for buildings with rent below threshold
            cheaper_buildings = [
                b for b in available_buildings 
                if float(b['fields'].get('RentAmount', 0) or 0) < max_new_rent
            ]
            
            suitable_buildings.extend(cheaper_buildings)
        
        # Sort by rent (ascending)
        suitable_buildings.sort(key=lambda b: float(b['fields'].get('RentAmount', 0) or 0))
        
        if not suitable_buildings:
            log.info(f"No suitable cheaper housing found for {citizen_name}")
            continue
        
        # Get the cheapest suitable building
        new_building = suitable_buildings[0]
        new_rent = float(new_building['fields'].get('RentAmount', 0) or 0)
        
        log.info(f"Found cheaper housing for {citizen_name}: {new_building['fields'].get('Name', new_building['id'])} with rent {new_rent}")
        
        if dry_run:
            log.info(f"[DRY RUN] Would move {citizen_name} to {new_building['fields'].get('Name', new_building['id'])}")
            # Update statistics
            mobility_summary["total_moved"] += 1
            mobility_summary["by_class"][social_class]["moved"] += 1
            mobility_summary["total_savings"] += (current_rent - new_rent)
        else:
            # Move the citizen to the new building
            success = move_citizen_to_new_building(tables, citizen, current_building, new_building)
            
            if success:
                # Send notifications
                send_notifications(tables, citizen, current_building, new_building)
                
                # Update statistics
                mobility_summary["total_moved"] += 1
                mobility_summary["by_class"][social_class]["moved"] += 1
                mobility_summary["total_savings"] += (current_rent - new_rent)
    
    log.info(f"Housing mobility process complete. Checked: {mobility_summary['total_checked']}, Looking: {mobility_summary['total_looking']}, Moved: {mobility_summary['total_moved']}")
    
    # Create a notification for the admin citizen with the mobility summary
    if mobility_summary["total_moved"] > 0 and not dry_run:
        create_admin_summary(tables, mobility_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process housing mobility for citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_housing_mobility(dry_run=args.dry_run)
