#!/usr/bin/env python3
"""
Citizen Job Assignment script for La Serenissima.

This script:
1. Finds all citizens without jobs (Work field is empty)
2. Sorts them by wealth in descending order
3. For each citizen, finds an available business (not already taken by another worker)
4. Assigns the citizen to the business with the highest wages
5. Sets the business status to active
6. Sends notifications to the business owners

Run this script daily to assign jobs to unemployed citizens.
"""

import os
import sys
import logging
import argparse
import json
import datetime
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizens_get_jobs")

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
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'businesses': Table(api_key, base_id, 'BUSINESSES'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

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

def get_available_businesses(tables) -> List[Dict]:
    """Fetch available businesses, sorted by wages in descending order."""
    log.info("Fetching available businesses...")
    
    try:
        # First, get all businesses
        all_businesses = tables['businesses'].all()
        log.info(f"Fetched {len(all_businesses)} total businesses")
        
        # Then, get all citizens with jobs
        employed_citizens = tables['citizens'].all(formula="NOT(OR({Work} = '', {Work} = BLANK()))")
        log.info(f"Found {len(employed_citizens)} employed citizens")
        
        # Extract the business IDs that are already taken
        taken_business_ids = set()
        for citizen in employed_citizens:
            if 'Work' in citizen['fields'] and citizen['fields']['Work']:
                taken_business_ids.add(citizen['fields']['Work'])
        
        log.info(f"Found {len(taken_business_ids)} businesses that are already taken")
        
        # Filter out businesses that are already taken
        available_businesses = [b for b in all_businesses if b['id'] not in taken_business_ids]
        
        # Sort by Wages in descending order
        available_businesses.sort(key=lambda b: float(b['fields'].get('Wages', 0) or 0), reverse=True)
        
        log.info(f"Found {len(available_businesses)} available businesses")
        return available_businesses
    except Exception as e:
        log.error(f"Error fetching available businesses: {e}")
        return []

def assign_citizen_to_business(tables, citizen: Dict, business: Dict) -> bool:
    """Assign a citizen to a business and update both records."""
    citizen_id = citizen['id']
    business_id = business['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    business_name = business['fields'].get('Name', business_id)
    
    log.info(f"Assigning {citizen_name} to {business_name}")
    
    try:
        # Update citizen record with new job
        tables['citizens'].update(citizen_id, {
            'Work': business_id
        })
        
        # Update business record with status to active
        # Note: Removed the 'Worker' field as it doesn't exist in the BUSINESSES table
        tables['businesses'].update(business_id, {
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
            "Type": "job_assignment",
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
            "by_business_type": assignment_summary['by_business_type'],
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

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assign jobs to unemployed citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    assign_jobs_to_citizens(dry_run=args.dry_run)
