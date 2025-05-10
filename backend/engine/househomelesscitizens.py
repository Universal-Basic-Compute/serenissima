#!/usr/bin/env python3
"""
Script to house homeless citizens in appropriate buildings based on their social class.

This script:
1. Fetches all citizens without homes
2. Sorts them by wealth (descending)
3. For each citizen, finds an appropriate building based on social class:
   - Patrician: canal_house
   - Cittadini: merchant_s_house
   - Popolani: artisan_s_house
   - Facchini: fisherman_s_cottage
4. Assigns the citizen to the building with the lowest rent
5. Updates the citizen's record with their new home
"""

import os
import sys
import logging
import argparse
import datetime
import json
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("house_homeless_citizens")

# Load environment variables
load_dotenv()

# Constants for building types by social class
BUILDING_PREFERENCES = {
    "Patrician": ["canal_house"],
    "Cittadini": ["merchant_s_house"],
    "Popolani": ["artisan_s_house"],
    "Facchini": ["fisherman_s_cottage"],
    # Fallback options for any social class
    "ANY": ["canal_house", "merchant_s_house", "artisan_s_house", "fisherman_s_cottage"]
}

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
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_homeless_citizens(tables) -> List[Dict]:
    """Fetch citizens without homes, sorted by wealth in descending order."""
    log.info("Fetching homeless citizens...")
    
    try:
        # Get citizens without a Home field or with empty Home field
        formula = "OR({Home} = '', {Home} = BLANK())"
        homeless_citizens = tables['citizens'].all(formula=formula)
        
        # Sort by Wealth in descending order
        homeless_citizens.sort(key=lambda c: float(c['fields'].get('Wealth', 0) or 0), reverse=True)
        
        log.info(f"Found {len(homeless_citizens)} homeless citizens")
        return homeless_citizens
    except Exception as e:
        log.error(f"Error fetching homeless citizens: {e}")
        return []

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

def assign_citizen_to_building(tables, citizen: Dict, building: Dict) -> bool:
    """Assign a citizen to a building and update both records."""
    citizen_id = citizen['id']
    building_id = building['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    building_name = building['fields'].get('Name', building_id)
    
    log.info(f"Assigning {citizen_name} to {building_name}")
    
    try:
        # Update citizen record with new home
        tables['citizens'].update(citizen_id, {
            'Home': building_id
        })
        
        # Update building record with new occupant
        tables['buildings'].update(building_id, {
            'Occupant': citizen_id
        })
        
        # Create a notification for the user
        try:
            # Check if we have a NOTIFICATIONS table in our tables dictionary
            if 'notifications' not in tables:
                # Initialize the NOTIFICATIONS table
                api_key = os.environ.get('AIRTABLE_API_KEY')
                base_id = os.environ.get('AIRTABLE_BASE_ID')
                tables['notifications'] = Table(api_key, base_id, 'NOTIFICATIONS')
                log.info("Initialized NOTIFICATIONS table")
            
            # Create notification content
            content = f"{citizen_name} has moved into {building_name}"
            details = {
                "citizen_id": citizen_id,
                "citizen_name": citizen_name,
                "building_id": building_id,
                "building_name": building_name,
                "building_type": building['fields'].get('Type', ''),
                "rent_amount": building['fields'].get('RentAmount', 0)
            }
            
            # Create the notification record
            tables['notifications'].create({
                "Type": "new_occupant",
                "Content": content,
                "Details": json.dumps(details),
                "CreatedAt": datetime.datetime.now().isoformat(),
                "ReadAt": None,  # Changed from IsRead: False to ReadAt: None
                "User": citizen_id  # Changed from RelatedUserId to User
            })
            
            log.info(f"Created notification for {citizen_name}")
        except Exception as notif_error:
            log.error(f"Error creating notification: {notif_error}")
            # Continue even if notification creation fails
        
        log.info(f"Successfully housed {citizen_name} in {building_name}")
        return True
    except Exception as e:
        log.error(f"Error assigning citizen to building: {e}")
        return False

def find_suitable_building(tables, citizen: Dict) -> Optional[Dict]:
    """Find a suitable building for a citizen based on their social class."""
    social_class = citizen['fields'].get('SocialClass', '')
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Finding suitable building for {citizen_name} (Social Class: {social_class})")
    
    # Get building preferences for this social class
    building_types = BUILDING_PREFERENCES.get(social_class, BUILDING_PREFERENCES["ANY"])
    
    # Try each building type in order of preference
    for building_type in building_types:
        buildings = get_available_buildings(tables, building_type)
        if buildings:
            # Return the first (lowest rent) building
            return buildings[0]
    
    # If no buildings found in preferred types, try any type as fallback
    if social_class != "ANY":
        log.info(f"No preferred buildings found for {citizen_name}, trying any available building")
        for building_type in BUILDING_PREFERENCES["ANY"]:
            if building_type not in building_types:  # Skip already checked types
                buildings = get_available_buildings(tables, building_type)
                if buildings:
                    return buildings[0]
    
    log.warning(f"No suitable building found for {citizen_name}")
    return None

def create_admin_notification(tables, housing_summary) -> None:
    """Create a notification for the admin user about the housing process."""
    try:
        # Create notification content with summary of all housed citizens
        content = f"Housing report: {housing_summary['total']} citizens housed"
        
        # Create detailed information about the housed citizens by building type
        details = {
            "event_type": "housing_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_housed": housing_summary['total'],
            "by_building_type": {
                "canal_house": housing_summary.get('canal_house', 0),
                "merchant_s_house": housing_summary.get('merchant_s_house', 0),
                "artisan_s_house": housing_summary.get('artisan_s_house', 0),
                "fisherman_s_cottage": housing_summary.get('fisherman_s_cottage', 0)
            },
            "message": f"Housing process complete. {housing_summary['total']} citizens were housed: {housing_summary.get('canal_house', 0)} in canal houses, {housing_summary.get('merchant_s_house', 0)} in merchant houses, {housing_summary.get('artisan_s_house', 0)} in artisan houses, and {housing_summary.get('fisherman_s_cottage', 0)} in fisherman cottages."
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "User": "NLR"  # Specific user to receive the notification
        })
        
        log.info(f"Created admin notification for user NLR with housing summary")
    except Exception as e:
        log.error(f"Error creating admin notification: {e}")

def house_homeless_citizens(dry_run: bool = False):
    """Main function to house homeless citizens."""
    log.info(f"Starting housing process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    homeless_citizens = get_homeless_citizens(tables)
    
    if not homeless_citizens:
        log.info("No homeless citizens found. Everyone is housed!")
        return
    
    housed_count = 0
    failed_count = 0
    
    # Track housing by building type
    housing_by_type = {
        "canal_house": 0,
        "merchant_s_house": 0,
        "artisan_s_house": 0,
        "fisherman_s_cottage": 0
    }
    
    for citizen in homeless_citizens:
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        log.info(f"Processing citizen: {citizen_name}")
        
        building = find_suitable_building(tables, citizen)
        
        if building:
            building_name = building['fields'].get('Name', building['id'])
            building_type = building['fields'].get('Type', 'unknown')
            
            if dry_run:
                log.info(f"[DRY RUN] Would house {citizen_name} in {building_name}")
                housed_count += 1
                # Track housing by building type
                if building_type in housing_by_type:
                    housing_by_type[building_type] += 1
            else:
                success = assign_citizen_to_building(tables, citizen, building)
                if success:
                    housed_count += 1
                    # Track housing by building type
                    if building_type in housing_by_type:
                        housing_by_type[building_type] += 1
                else:
                    failed_count += 1
        else:
            log.warning(f"Could not find suitable housing for {citizen_name}")
            failed_count += 1
    
    log.info(f"Housing process complete. Housed: {housed_count}, Failed: {failed_count}")
    
    # Create a summary of housing by building type
    housing_summary = {
        "total": housed_count,
        **housing_by_type
    }
    
    # Create a notification for the admin user with the housing summary
    if housed_count > 0 and not dry_run:
        create_admin_notification(tables, housing_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="House homeless citizens in appropriate buildings.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    house_homeless_citizens(dry_run=args.dry_run)
