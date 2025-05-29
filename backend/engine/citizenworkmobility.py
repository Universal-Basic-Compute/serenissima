#!/usr/bin/env python3
"""
Citizen Work Mobility script for La Serenissima.

This script:
1. Checks all employed citizens
2. Based on social class, determines if they look for better-paying jobs:
   - Nobili: 5% chance
   - Cittadini: 10% chance
   - Popolani: 15% chance
   - Facchini: 20% chance
3. If they decide to look, finds available businesses with wages above a threshold:
   - Nobili: 15% higher
   - Cittadini: 12% higher
   - Popolani: 10% higher
   - Facchini: 8% higher
4. Moves citizens to better-paying jobs if found
5. Sends notifications to relevant parties

Run this script daily to simulate job mobility in Venice.
"""

import os
import sys
import logging
import argparse
import random
import json
import datetime
from typing import Dict, List, Optional, Any, Tuple
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizen_work_mobility")

# Load environment variables
load_dotenv()

# Constants for mobility chances by social class
MOBILITY_CHANCE = {
    "Nobili": 0.05,  # 5% chance
    "Cittadini": 0.10,  # 10% chance
    "Popolani": 0.15,   # 15% chance
    "Facchini": 0.20    # 20% chance
}

# Constants for wage increase thresholds by social class
WAGE_INCREASE_THRESHOLD = {
    "Nobili": 0.15,  # 15% higher
    "Cittadini": 0.12,  # 12% higher
    "Popolani": 0.10,  # 10% higher
    "Facchini": 0.08    # 8% higher
}

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
            'businesses': Table(api_key, base_id, 'BUSINESSES'), # Note: This table might not exist if 'BUILDINGS' is used for businesses
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS')
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

def get_entrepreneurs_and_their_businesses(tables) -> tuple[List[Dict], Dict[str, List[Dict]]]:
    """Fetch entrepreneurs (citizens who run at least one building) and their businesses."""
    log.info("Fetching entrepreneurs and their businesses...")
    
    try:
        # Get all buildings with non-empty RunBy field and Category='business'
        formula = "AND(NOT(OR({RunBy} = '', {RunBy} = BLANK())), {Category}='business')"
        run_by_buildings = tables['buildings'].all(formula=formula)
        
        # Group buildings by the citizen who runs them
        entrepreneur_businesses = {}
        for building in run_by_buildings:
            run_by = building['fields'].get('RunBy')
            if run_by:
                if run_by not in entrepreneur_businesses:
                    entrepreneur_businesses[run_by] = []
                entrepreneur_businesses[run_by].append(building)
        
        # Get the entrepreneur citizens by Username, not ID
        entrepreneur_usernames = list(entrepreneur_businesses.keys())
        entrepreneurs = []
        
        if entrepreneur_usernames:
            # Create a formula to get these citizens by Username, ensuring they are InVenice and not Forestieri
            username_conditions_str = ', '.join([f"{{Username}}='{username}'" for username in entrepreneur_usernames])
            formula = f"AND(OR({username_conditions_str}), {{InVenice}}=TRUE(), {{SocialClass}}!='Forestieri')"
            entrepreneurs = tables['citizens'].all(formula=formula)
        
        log.info(f"Found {len(entrepreneurs)} entrepreneurs (InVenice, non-Forestieri) running {len(run_by_buildings)} businesses")
        return entrepreneurs, entrepreneur_businesses
    except Exception as e:
        log.error(f"Error fetching entrepreneurs: {e}")
        return [], {}

def get_employed_citizens(tables) -> List[Dict]:
    """Fetch citizens who have jobs."""
    log.info("Fetching employed citizens...")
    
    try:
        # Get buildings with non-empty Occupant field that are businesses (not housing)
        # We'll need to filter for business-type buildings
        formula = "NOT(OR({Occupant} = '', {Occupant} = BLANK()))"
        occupied_buildings = tables['buildings'].all(formula=formula)
        
        # Extract the occupant usernames
        citizen_usernames = [building['fields'].get('Occupant') for building in occupied_buildings if building['fields'].get('Occupant')]
        
        # If no citizens are employed, return empty list
        if not citizen_usernames:
            log.info("No employed citizens found")
            return []
        
        # Create a formula to get these citizens by Username, ensuring they are InVenice and not Forestieri
        citizen_conditions_str = ', '.join([f"{{Username}}='{username}'" for username in citizen_usernames])
        formula = f"AND(OR({citizen_conditions_str}), {{InVenice}}=TRUE(), {{SocialClass}}!='Forestieri')"
        
        employed_citizens = tables['citizens'].all(formula=formula)
        
        log.info(f"Found {len(employed_citizens)} employed citizens (InVenice, non-Forestieri) to consider for work mobility.")
        
        # Add the building information to each citizen for easier processing
        for citizen in employed_citizens:
            # Find the building this citizen works at using Username
            citizen_username = citizen['fields'].get('Username', '')
            for building in occupied_buildings:
                if building['fields'].get('Occupant') == citizen_username:
                    # Add building info to the citizen record
                    citizen['current_business'] = building
                    break
        
        log.info(f"Found {len(employed_citizens)} employed citizens")
        return employed_citizens
    except Exception as e:
        log.error(f"Error fetching employed citizens: {e}")
        return []

def get_business_details(tables, business_id: str) -> Optional[Dict]:
    """Get details of a specific business."""
    try:
        business = tables['buildings'].get(business_id)
        return business
    except Exception as e:
        log.error(f"Error fetching business {business_id}: {e}")
        return None

def get_available_businesses(tables) -> List[Dict]:
    """Fetch available businesses, sorted by wages in descending order."""
    log.info("Fetching available businesses...")
    
    try:
        # Create a formula to find buildings with Category='business' that don't have occupants
        formula = "AND({Category}='business', OR({Occupant} = '', {Occupant}= BLANK()))"

        available_businesses = tables['buildings'].all(formula=formula)
        log.info(f"Found {len(available_businesses)} available businesses")

        # Sort by Wages in descending order
        available_businesses.sort(key=lambda b: float(b['fields'].get('Wages', 0) or 0), reverse=True)

        return available_businesses
    except Exception as e:
        log.error(f"Error fetching available businesses: {e}")
        return []

def move_citizen_to_new_job(tables, citizen: Dict, old_business: Dict, new_business: Dict) -> bool:
    """Move a citizen from one job to another."""
    citizen_id = citizen['id']
    old_business_id = old_business['id']
    new_business_id = new_business['id']
    
    # Get the citizen's username for updating the Occupant field
    citizen_username = citizen['fields'].get('Username', '')
    if not citizen_username:
        log.error(f"Citizen {citizen_id} has no Username, cannot move to new job")
        return False
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    old_business_name = old_business['fields'].get('Name', old_business_id)
    new_business_name = new_business['fields'].get('Name', new_business_id)
    
    log.info(f"Moving {citizen_name} from {old_business_name} to {new_business_name}")
    
    try:
        # Update old business record to remove occupant
        tables['buildings'].update(old_business_id, {
            'Occupant': ""
        })
        
        # Update new business record with new occupant (using Username)
        tables['buildings'].update(new_business_id, {
            'Occupant': citizen_username
        })
        
        log.info(f"Successfully moved {citizen_name} to {new_business_name}")
        return True
    except Exception as e:
        log.error(f"Error moving citizen to new job: {e}")
        return False

def create_notification(tables, citizen: str, content: str, details: Dict) -> None:
    """Create a notification for a citizen."""
    try:
        # Create the notification record
        tables['notifications'].create({
            "Type": "work_mobility",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": citizen
        })
        
        log.info(f"Created notification for citizen {citizen}")
    except Exception as e:
        log.error(f"Error creating notification: {e}")

def send_notifications(tables, citizen: Dict, old_business: Dict, new_business: Dict) -> None:
    """Send notifications to old employer, new employer, and admin."""
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    old_business_name = old_business['fields'].get('Name', old_business['id'])
    new_business_name = new_business['fields'].get('Name', new_business['id'])
    
    old_wages = old_business['fields'].get('Wages', 0)
    new_wages = new_business['fields'].get('Wages', 0)
    
    # Get business owners
    old_owner = old_business['fields'].get('Owner', 'Unknown')
    new_owner = new_business['fields'].get('Owner', 'Unknown')
    
    # Notification for old employer
    if old_owner and old_owner != 'Unknown':
        content = f"🏢 **{citizen_name}** has left your business **{old_business_name}** for a better-paying position"
        details = {
            "event_type": "employee_left",
            "citizen_id": citizen['id'],
            "citizen_name": citizen_name,
            "business_id": old_business['id'],
            "business_name": old_business_name,
            "wages": old_wages
        }
        create_notification(tables, old_owner, content, details)
    
    # Notification for new employer
    if new_owner and new_owner != 'Unknown':
        content = f"🎉 **{citizen_name}** has joined your business **{new_business_name}**"
        details = {
            "event_type": "employee_joined",
            "citizen_id": citizen['id'],
            "citizen_name": citizen_name,
            "business_id": new_business['id'],
            "business_name": new_business_name,
            "wages": new_wages
        }
        create_notification(tables, new_owner, content, details)
    
    # Notification for citizen
    wage_increase = new_wages - old_wages
    formatted_increase = f"{wage_increase:,.0f}"
    content = f"💼 You have moved from **{old_business_name}** to **{new_business_name}**, earning **{formatted_increase}** more ⚜️ Ducats in wages"
    details = {
        "event_type": "job_changed",
        "old_business_id": old_business['id'],
        "old_business_name": old_business_name,
        "new_business_id": new_business['id'],
        "new_business_name": new_business_name,
        "old_wages": old_wages,
        "new_wages": new_wages,
        "increase": new_wages - old_wages
    }
    create_notification(tables, citizen['id'], content, details)

def create_admin_summary(tables, mobility_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"📊 **Work Mobility Report**: **{mobility_summary['total_moved']}** citizens moved to better-paying jobs"
        
        # Create detailed information
        details = {
            "event_type": "work_mobility_summary",
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
            "average_wage_increase": mobility_summary['total_wage_increase'] / mobility_summary['total_moved'] if mobility_summary['total_moved'] > 0 else 0
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "work_mobility_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def process_work_mobility(dry_run: bool = False):
    """Main function to process work mobility."""
    log.info(f"Starting work mobility process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    employed_citizens = get_employed_citizens(tables)
    
    if not employed_citizens:
        log.info("No employed citizens found. Mobility process complete.")
        return
    
    # Get entrepreneurs and their businesses
    entrepreneurs, entrepreneur_businesses = get_entrepreneurs_and_their_businesses(tables)
    
    # Create a set of entrepreneur usernames for quick lookup
    entrepreneur_usernames = {entrepreneur['fields'].get('Username', '') for entrepreneur in entrepreneurs}
    
    # Sort citizens by wealth in ascending order (lower wealth citizens have more incentive to move)
    employed_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0))
    log.info(f"Sorted {len(employed_citizens)} citizens by wealth in ascending order")
    
    # Get available businesses
    available_businesses = get_available_businesses(tables)
    
    if not available_businesses:
        log.info("No available businesses found. Mobility process complete.")
        return
    
    # Track mobility statistics
    mobility_summary = {
        "total_checked": 0,
        "total_looking": 0,
        "total_moved": 0,
        "total_wage_increase": 0,
        "by_class": {
            "Nobili": {"checked": 0, "looking": 0, "moved": 0},
            "Cittadini": {"checked": 0, "looking": 0, "moved": 0},
            "Popolani": {"checked": 0, "looking": 0, "moved": 0},
            "Facchini": {"checked": 0, "looking": 0, "moved": 0}
        }
    }
    
    for citizen in employed_citizens:
        citizen_id = citizen['id']
        citizen_username = citizen['fields'].get('Username', '')
        social_class = citizen['fields'].get('SocialClass', '')
        
        # Check if this citizen is an entrepreneur by Username
        is_entrepreneur = citizen_username in entrepreneur_usernames
        
        # Get current business from the attached building info
        current_business = citizen.get('current_business')
        if not current_business:
            citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            log.warning(f"Citizen {citizen_name} has no current business information despite being in employed list")
            continue
        
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        
        # Skip if social class is unknown or not in our mobility table
        if not social_class or social_class not in MOBILITY_CHANCE:
            log.warning(f"Citizen {citizen_name} has unknown social class: {social_class}")
            continue
        
        # Track that we checked this citizen
        mobility_summary["total_checked"] += 1
        mobility_summary["by_class"][social_class]["checked"] += 1
        
        # Determine if citizen looks for new job based on social class
        mobility_chance = MOBILITY_CHANCE.get(social_class, 0.0)
        is_looking = random.random() < mobility_chance
        
        if not is_looking:
            log.info(f"Citizen {citizen_name} is not looking for a new job")
            continue
        
        # Track that this citizen is looking
        mobility_summary["total_looking"] += 1
        mobility_summary["by_class"][social_class]["looking"] += 1
        
        log.info(f"Citizen {citizen_name} is looking for a better-paying job")
        
        # Get current wages
        current_wages = float(current_business['fields'].get('Wages', 0) or 0)
        if current_wages <= 0:
            log.warning(f"Current business {current_business['id']} has invalid wages: {current_wages}")
            continue
        
        # Calculate minimum wages for new job
        wage_threshold = WAGE_INCREASE_THRESHOLD.get(social_class, 0.0)
        min_new_wages = current_wages * (1 + wage_threshold)
        
        log.info(f"Citizen {citizen_name} is looking for wages above {min_new_wages} (current: {current_wages})")
        
        # Find available businesses with wages above threshold
        if is_entrepreneur:
            # For entrepreneurs, only consider their own businesses
            own_businesses = entrepreneur_businesses.get(citizen_username, [])
            
            # Filter to available businesses (not occupied by someone else)
            available_own_businesses = [
                b for b in own_businesses 
                if not b['fields'].get('Occupant') or b['fields'].get('Occupant') == ""
            ]
            
            # Filter to businesses with wages above threshold
            suitable_businesses = [
                b for b in available_own_businesses 
                if float(b['fields'].get('Wages', 0) or 0) > min_new_wages
            ]
        else:
            # For regular citizens, use the original logic
            suitable_businesses = [
                b for b in available_businesses 
                if float(b['fields'].get('Wages', 0) or 0) > min_new_wages
            ]
        
        # Sort by wages (descending)
        suitable_businesses.sort(key=lambda b: float(b['fields'].get('Wages', 0) or 0), reverse=True)
        
        if not suitable_businesses:
            log.info(f"No suitable better-paying jobs found for {citizen_name}")
            continue
        
        # Get the highest-paying suitable business
        new_business = suitable_businesses[0]
        new_wages = float(new_business['fields'].get('Wages', 0) or 0)
        
        log.info(f"Found better-paying job for {citizen_name}: {new_business['fields'].get('Name', new_business['id'])} with wages {new_wages}")
        
        if dry_run:
            log.info(f"[DRY RUN] Would move {citizen_name} to {new_business['fields'].get('Name', new_business['id'])}")
            # Update statistics
            mobility_summary["total_moved"] += 1
            mobility_summary["by_class"][social_class]["moved"] += 1
            mobility_summary["total_wage_increase"] += (new_wages - current_wages)
        else:
            # Move the citizen to the new job
            success = move_citizen_to_new_job(tables, citizen, current_business, new_business)
            
            if success:
                # Send notifications
                send_notifications(tables, citizen, current_business, new_business)
                
                # Update statistics
                mobility_summary["total_moved"] += 1
                mobility_summary["by_class"][social_class]["moved"] += 1
                mobility_summary["total_wage_increase"] += (new_wages - current_wages)
                
                # Remove the business from available list
                available_businesses.remove(new_business)
    
    log.info(f"Work mobility process complete. Checked: {mobility_summary['total_checked']}, Looking: {mobility_summary['total_looking']}, Moved: {mobility_summary['total_moved']}")
    
    # Create a notification for the admin citizen with the mobility summary
    if mobility_summary["total_moved"] > 0 and not dry_run:
        create_admin_summary(tables, mobility_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process work mobility for citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_work_mobility(dry_run=args.dry_run)
