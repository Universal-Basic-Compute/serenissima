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
    "Nobili": ["canal_house"],
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
        
        # Sort by Wealth in descending order
        homeless_citizens.sort(key=lambda c: float(c['fields'].get('Wealth', 0) or 0), reverse=True)
        
        log.info(f"Found {len(homeless_citizens)} homeless citizens")
        return homeless_citizens
    except Exception as e:
        log.error(f"Error fetching homeless citizens: {e}")
        return []

def get_available_businesses(tables) -> List[Dict]:
    """Fetch available businesses, sorted by wages in descending order."""
    log.info("Fetching available businesses...")
    
    try:
        # Define housing types to exclude
        housing_types = ['canal_house', 'merchant_s_house', 'artisan_s_house', 'fisherman_s_cottage']
        
        # Create a formula to exclude housing types and find buildings without occupants
        housing_conditions = [f"{{Type}}='{housing_type}'" for housing_type in housing_types]
        formula = f"AND(NOT(OR({', '.join(housing_conditions)})), OR({{Occupant}} = '', {{Occupant}} = BLANK()))"
        
        available_businesses = tables['buildings'].all(formula=formula)
        log.info(f"Found {len(available_businesses)} available businesses")
        
        # Sort by Wages in descending order
        available_businesses.sort(key=lambda b: float(b['fields'].get('Wages', 0) or 0), reverse=True)
        
        return available_businesses
    except Exception as e:
        log.error(f"Error fetching available businesses: {e}")
        return []

def create_notification(tables, user: str, content: str, details: Dict) -> None:
    """Create a notification for a user."""
    try:
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_mobility",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "User": user
        })
        
        log.info(f"Created notification for user {user}")
    except Exception as e:
        log.error(f"Error creating notification: {e}")

def assign_citizen_to_business(tables, citizen: Dict, business: Dict) -> bool:
    """Assign a citizen to a business and update both records."""
    citizen_id = citizen['id']
    business_id = business['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    business_name = business['fields'].get('Name', business_id)
    
    log.info(f"Assigning {citizen_name} to {business_name}")
    
    try:
        # Update business record with new occupant
        tables['buildings'].update(business_id, {
            'Occupant': citizen_id,
            'Status': 'active'
        })
        
        # Get business owner
        business_owner = business['fields'].get('Owner', '')
        
        # Create a notification for the business owner
        if business_owner:
            create_notification(
                tables,
                business_owner,
                f"{citizen_name} now works in your business {business_name}",
                {
                    "citizen_id": citizen_id,
                    "citizen_name": citizen_name,
                    "business_id": business_id,
                    "business_name": business_name,
                    "event_type": "job_assignment"
                }
            )
        
        log.info(f"Successfully assigned {citizen_name} to {business_name}")
        return True
    except Exception as e:
        log.error(f"Error assigning citizen to business: {e}")
        return False

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

def get_unemployed_citizens(tables) -> List[Dict]:
    """Fetch citizens without jobs, sorted by wealth in descending order."""
    log.info("Fetching unemployed citizens...")
    
    try:
        # Get all citizens
        all_citizens = tables['citizens'].all()
        
        # Get all buildings with occupants that are businesses (not housing)
        business_types = ['workshop', 'market-stall', 'tavern', 'warehouse', 'dock']
        type_conditions = [f"{{Type}}='{business_type}'" for business_type in business_types]
        business_formula = f"AND(OR({', '.join(type_conditions)}), NOT(OR({{Occupant}} = '', {{Occupant}} = BLANK())))"
        
        occupied_businesses = tables['buildings'].all(formula=business_formula)
        
        # Extract the occupant IDs
        employed_citizen_ids = [building['fields'].get('Occupant') for building in occupied_businesses 
                               if building['fields'].get('Occupant')]
        
        # Filter citizens to find those who are not occupants of any business
        unemployed_citizens = [citizen for citizen in all_citizens 
                              if citizen['id'] not in employed_citizen_ids]
        
        # Sort by Wealth in descending order
        unemployed_citizens.sort(key=lambda c: float(c['fields'].get('Wealth', 0) or 0), reverse=True)
        
        log.info(f"Found {len(unemployed_citizens)} unemployed citizens")
        return unemployed_citizens
    except Exception as e:
        log.error(f"Error fetching unemployed citizens: {e}")
        return []

def assign_jobs_to_citizens(dry_run: bool = False):
    """Main function to assign jobs to unemployed citizens."""
    log.info(f"Starting job assignment process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    unemployed_citizens = get_unemployed_citizens(tables)
    
    if not unemployed_citizens:
        log.info("No unemployed citizens found. Job assignment process complete.")
        return
    
    available_businesses = get_available_businesses(tables)
    
    if not available_businesses:
        log.info("No available businesses found. Job assignment process complete.")
        return
    
    assigned_count = 0
    failed_count = 0
    
    # Track assignments by business type
    assignments_by_type = {}
    
    # Process each unemployed citizen
    for citizen in unemployed_citizens:
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        log.info(f"Processing citizen: {citizen_name}")
        
        # Stop if we've run out of available businesses
        if not available_businesses:
            log.info("No more available businesses. Stopping job assignment process.")
            break
        
        # Get the highest-paying available business
        business = available_businesses.pop(0)  # Remove from list to prevent double assignment
        business_name = business['fields'].get('Name', business['id'])
        business_type = business['fields'].get('Type', 'unknown')
        
        # Track assignments by business type
        if business_type not in assignments_by_type:
            assignments_by_type[business_type] = 0
        
        if dry_run:
            log.info(f"[DRY RUN] Would assign {citizen_name} to {business_name}")
            assigned_count += 1
            assignments_by_type[business_type] += 1
        else:
            success = assign_citizen_to_business(tables, citizen, business)
            if success:
                assigned_count += 1
                assignments_by_type[business_type] += 1
            else:
                failed_count += 1
                # Put the business back in the list if assignment failed
                available_businesses.append(business)
    
    log.info(f"Job assignment process complete. Assigned: {assigned_count}, Failed: {failed_count}")
    
    # Create a summary of assignments by business type
    assignment_summary = {
        "total": assigned_count,
        "by_business_type": assignments_by_type
    }
    
    # Create a notification for the admin user with the assignment summary
    if assigned_count > 0 and not dry_run:
        create_admin_summary(tables, assignment_summary)

def create_admin_summary(tables, assignment_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"Job assignment report: {assignment_summary['total']} citizens assigned to businesses"
        
        # Create detailed information
        details = {
            "event_type": "job_assignment_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_assigned": assignment_summary['total'],
            "by_business_type": assignment_summary.get('by_business_type', {}),
            "message": f"Job assignment process complete. {assignment_summary['total']} citizens were assigned to businesses."
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "job_assignment_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "User": "NLR"  # Admin user
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assign jobs to unemployed citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    assign_jobs_to_citizens(dry_run=args.dry_run)
