#!/usr/bin/env python3
"""
Script to house homeless citizens in appropriate buildings based on their social class.

This script:
1. Fetches all citizens without homes
2. Sorts them by wealth (descending)
3. For each citizen, finds an appropriate building based on social class:
   - Nobili: canal_house
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
    "Nobili": ["canal_house"],  # Keep preferences for sorting, but will filter by Category=home
    "Cittadini": ["merchant_s_house"],
    "Popolani": ["artisan_s_house"],
    "Facchini": ["fisherman_s_cottage"],
    # Fallback options for any social class
    "ANY": []  # Will be populated with all home buildings
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

def get_homeless_citizens(tables) -> List[Dict]:
    """Fetch citizens without homes, sorted by wealth in descending order."""
    log.info("Fetching homeless citizens...")
    
    try:
        # Get all citizens
        all_citizens = tables['citizens'].all()
        
        # Get all buildings with occupants
        formula = "NOT(OR({Occupant} = '', {Occupant} = BLANK()))"
        occupied_buildings = tables['buildings'].all(formula=formula)
        
        # Extract the occupant IDs
        occupied_citizen_ids = [building['fields'].get('Occupant') for building in occupied_buildings 
                               if building['fields'].get('Occupant')]
        
        # Filter citizens to find those who are not occupants of any building
        homeless_citizens = [citizen for citizen in all_citizens 
                            if citizen['id'] not in occupied_citizen_ids]
        
        # Sort by Ducats in descending order
        homeless_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0), reverse=True)
        
        log.info(f"Found {len(homeless_citizens)} homeless citizens")
        return homeless_citizens
    except Exception as e:
        log.error(f"Error fetching homeless citizens: {e}")
        return []

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

def get_available_buildings(tables, building_type: str = None) -> List[Dict]:
    """Fetch available buildings with Category=home, optionally filtered by type."""
    log.info(f"Fetching available home buildings{' of type: ' + building_type if building_type else ''}")
    
    try:
        # Base formula to get buildings with Category=home that are not already occupied
        if building_type:
            # If a specific type is requested, filter by both Category and Type
            formula = f"AND({{Category}} = 'home', {{Type}} = '{building_type}', OR({{Occupant}} = '', {{Occupant}} = BLANK()))"
        else:
            # Otherwise just filter by Category=home
            formula = "AND({Category} = 'home', OR({Occupant} = '', {Occupant} = BLANK()))"
            
        buildings = tables['buildings'].all(formula=formula)
        
        # Sort by RentAmount in ascending order
        buildings.sort(key=lambda b: float(b['fields'].get('RentAmount', 0) or 0))
        
        log.info(f"Found {len(buildings)} available home buildings{' of type ' + building_type if building_type else ''}")
        return buildings
    except Exception as e:
        log.error(f"Error fetching home buildings{' of type ' + building_type if building_type else ''}: {e}")
        return []

def find_suitable_building(tables, citizen: Dict) -> Optional[Dict]:
    """Find a suitable building for a citizen based on their social class."""
    social_class = citizen['fields'].get('SocialClass', '')
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Finding suitable building for {citizen_name} (Social Class: {social_class})")
    
    # First, try to find buildings of the preferred type for this social class
    building_types = BUILDING_PREFERENCES.get(social_class, [])
    
    # Try each building type in order of preference
    for building_type in building_types:
        buildings = get_available_buildings(tables, building_type)
        if buildings:
            # Return the first (lowest rent) building
            return buildings[0]
    
    # If no buildings found in preferred types, try any home building
    log.info(f"No preferred buildings found for {citizen_name}, trying any available home building")
    buildings = get_available_buildings(tables)
    
    if buildings:
        return buildings[0]
    
    log.warning(f"No suitable home building found for {citizen_name}")
    return None

def assign_citizen_to_building(tables, citizen: Dict, building: Dict) -> bool:
    """Assign a citizen to a building by updating the Occupant field and sending notifications."""
    try:
        citizen_id = citizen['id']
        # Get the citizen's username
        citizen_username = citizen['fields'].get('Username', '')
        
        # If username is missing, fall back to ID
        if not citizen_username:
            citizen_username = citizen_id
            
        building_id = building['id']
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        building_name = building['fields'].get('Name', building['fields'].get('Type', 'Unknown building'))
        
        log.info(f"Assigning {citizen_name} to {building_name}")
        
        # Update the building's Occupant field with the username instead of ID
        tables['buildings'].update(
            building_id,
            {
                'Occupant': citizen_username
            }
        )
        
        # Create notification for the citizen
        rent_amount = building['fields'].get('RentAmount', 0)
        notification_content = f"🏠 You have been assigned housing at **{building_name}**. Monthly rent: **{rent_amount:,}** 💰 Ducats."
        
        details = {
            "event_type": "housing_assignment",
            "building_id": building_id,
            "building_name": building_name,
            "rent_amount": rent_amount,
            "timestamp": datetime.datetime.now().isoformat()
        }
        
        create_notification(tables, citizen_id, notification_content, details)
        
        # If the building has a RunBy field, send notification to that citizen too
        ran_by_citizen = building['fields'].get('RunBy')
        if ran_by_citizen:
            manager_notification = f"🏠 **{citizen_name}** has been assigned to your building **{building_name}**."
            manager_details = {
                "event_type": "new_tenant",
                "citizen_id": citizen_id,
                "citizen_name": citizen_name,
                "building_id": building_id,
                "building_name": building_name,
                "timestamp": datetime.datetime.now().isoformat()
            }
            
            create_notification(tables, ran_by_citizen, manager_notification, manager_details)
            log.info(f"Sent notification to building manager {ran_by_citizen}")
        
        return True
    except Exception as e:
        log.error(f"Error assigning citizen to building: {e}")
        return False

def create_admin_notification(tables, housing_summary) -> None:
    """Create a notification for the admin citizen about the housing process."""
    try:
        # Create notification content with summary of all housed citizens
        content = f"🏠 **Housing Report**: {housing_summary['total']:,} citizens housed"
        
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
            "message": f"🏛️ **Housing process complete**. **{housing_summary['total']:,}** citizens were housed: **{housing_summary.get('canal_house', 0):,}** in canal houses, **{housing_summary.get('merchant_s_house', 0):,}** in merchant houses, **{housing_summary.get('artisan_s_house', 0):,}** in artisan houses, and **{housing_summary.get('fisherman_s_cottage', 0):,}** in fisherman cottages."
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Specific citizen to receive the notification
        })
        
        log.info(f"Created admin notification for citizen ConsiglioDeiDieci with housing summary")
    except Exception as e:
        log.error(f"Error creating admin notification: {e}")

def house_homeless_citizens(dry_run: bool = False):
    """Main function to house homeless citizens."""
    log.info("Starting housing process for homeless citizens")
    
    tables = initialize_airtable()
    homeless_citizens = get_homeless_citizens(tables)
    
    if not homeless_citizens:
        log.info("No homeless citizens found. Exiting.")
        return
    
    log.info(f"Found {len(homeless_citizens)} homeless citizens to house")
    
    # Initialize counters for housing summary
    housing_summary = {
        "total": 0
    }
    
    # FIRST PASS: Prioritize citizens who own buildings of Category 'home'
    log.info("First pass: Prioritizing citizens who own homes")
    
    # Get all buildings with Category 'home'
    try:
        home_buildings = tables['buildings'].all(
            formula="AND({Category} = 'home', OR({Occupant} = '', {Occupant} = BLANK()))"
        )
        log.info(f"Found {len(home_buildings)} unoccupied home buildings")
    except Exception as e:
        log.error(f"Error fetching home buildings: {e}")
        home_buildings = []
    
    # Create a map of owner username to their owned home buildings
    owner_home_map = {}
    for building in home_buildings:
        owner = building['fields'].get('Owner')
        if owner:
            if owner not in owner_home_map:
                owner_home_map[owner] = []
            owner_home_map[owner].append(building)
    
    # First, house citizens in their own buildings
    for citizen in homeless_citizens[:]:  # Create a copy to safely remove from original
        citizen_username = citizen['fields'].get('Username', '')
        
        # Skip if no username
        if not citizen_username:
            continue
        
        # Check if this citizen owns any home buildings
        if citizen_username in owner_home_map and owner_home_map[citizen_username]:
            # Get the first available home building owned by this citizen
            building = owner_home_map[citizen_username][0]
            
            citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            building_name = building['fields'].get('Name', building['fields'].get('Type', 'Unknown building'))
            
            log.info(f"Prioritizing {citizen_name} to live in their own building: {building_name}")
            
            if dry_run:
                log.info(f"[DRY RUN] Would assign {citizen_name} to their own building {building_name}")
            else:
                # Assign the citizen to their own building
                success = assign_citizen_to_building(tables, citizen, building)
                if success:
                    log.info(f"Successfully housed {citizen_name} in their own building {building_name}")
                    
                    # Update housing summary counters
                    housing_summary["total"] = housing_summary.get("total", 0) + 1
                    building_type = building['fields'].get('Type', 'unknown')
                    housing_summary[building_type] = housing_summary.get(building_type, 0) + 1
                    
                    # Remove this citizen from the homeless list
                    homeless_citizens.remove(citizen)
                    
                    # Remove this building from the owner's available buildings
                    owner_home_map[citizen_username].remove(building)
                else:
                    log.error(f"Failed to house {citizen_name} in their own building {building_name}")
    
    # SECOND PASS: Process remaining homeless citizens as before
    log.info(f"Second pass: Processing {len(homeless_citizens)} remaining homeless citizens")
    
    # Sort remaining homeless citizens by wealth (descending)
    homeless_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0), reverse=True)
    
    # Process each remaining homeless citizen
    for citizen in homeless_citizens:
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        social_class = citizen['fields'].get('SocialClass', '')
        
        log.info(f"Processing {citizen_name} ({social_class})")
        
        # Find a suitable building
        building = find_suitable_building(tables, citizen)
        
        if not building:
            log.warning(f"No suitable building found for {citizen_name}")
            continue
        
        building_type = building['fields'].get('Type', 'unknown')
        building_name = building['fields'].get('Name', building_type)
        
        # Update housing summary counters
        housing_summary["total"] = housing_summary.get("total", 0) + 1
        housing_summary[building_type] = housing_summary.get(building_type, 0) + 1
        
        if dry_run:
            log.info(f"[DRY RUN] Would assign {citizen_name} to {building_name}")
        else:
            # Assign the citizen to the building
            success = assign_citizen_to_building(tables, citizen, building)
            if success:
                log.info(f"Successfully housed {citizen_name} in {building_name}")
            else:
                log.error(f"Failed to house {citizen_name} in {building_name}")
    
    # Create admin notification with housing summary
    if housing_summary["total"] > 0 and not dry_run:
        create_admin_notification(tables, housing_summary)
    
    log.info(f"Housing process complete. {housing_summary['total']} citizens housed.")
    
    # Log detailed summary
    for building_type, count in housing_summary.items():
        if building_type != "total":
            log.info(f"  {building_type}: {count} citizens")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="House homeless citizens in appropriate buildings.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    house_homeless_citizens(dry_run=args.dry_run)
