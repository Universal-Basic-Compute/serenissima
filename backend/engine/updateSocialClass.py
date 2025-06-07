#!/usr/bin/env python3
"""
Social Class Update script for La Serenissima.

This script:
1. Checks all citizens and updates their social class based on:
   - Entrepreneur status (citizens who run at least one building)
   - Daily income (citizens with >100000 Ducats daily income become Cittadini)
   - Influence (citizens with >10000 Influence become Nobili)
2. Ensures entrepreneurs are at least Popolani
3. Sends notifications to citizens whose social class has changed

Run this script daily to simulate social mobility in Venice.
"""

import os
import sys
import logging
import argparse
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
log = logging.getLogger("update_social_class")

# Load environment variables
load_dotenv()

# Social class hierarchy (in ascending order)
SOCIAL_CLASSES = ["Facchini", "Popolani", "Cittadini", "Nobili"]

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
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'lands': Table(api_key, base_id, 'LANDS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_entrepreneurs(tables) -> List[str]:
    """Fetch citizens who run at least one building."""
    log.info("Fetching entrepreneurs...")
    
    try:
        # Get all buildings with non-empty RunBy field
        formula = "NOT(OR({RunBy} = '', {RunBy} = BLANK()))"
        run_by_buildings = tables['buildings'].all(formula=formula)
        
        # Extract unique citizen IDs who run buildings
        entrepreneur_ids = set()
        for building in run_by_buildings:
            run_by = building['fields'].get('RunBy')
            if run_by:
                entrepreneur_ids.add(run_by)
        
        log.info(f"Found {len(entrepreneur_ids)} entrepreneurs running buildings")
        return list(entrepreneur_ids)
    except Exception as e:
        log.error(f"Error fetching entrepreneurs: {e}")
        return []

def get_business_building_owners(tables) -> List[str]:
    """Fetch citizens who own at least one business building."""
    log.info("Fetching business building owners...")
    
    try:
        # Get all buildings
        all_buildings = tables['buildings'].all()
        
        # Filter for business buildings with owners
        business_owner_ids = set()
        for building in all_buildings:
            # Check the Category field instead of Type
            building_category = building['fields'].get('Category', '').lower()
            owner = building['fields'].get('Owner')
            
            # Check if this is a business building category and has an owner
            if building_category == 'business' and owner:
                business_owner_ids.add(owner)
                log.debug(f"Found business building of category '{building_category}' owned by '{owner}'")
        
        log.info(f"Found {len(business_owner_ids)} citizens who own business buildings")
        return list(business_owner_ids)
    except Exception as e:
        log.error(f"Error fetching business building owners: {e}")
        return []

def get_land_users(tables) -> List[str]:
    """Fetch citizens who use at least one land plot."""
    log.info("Fetching land users...")
    
    try:
        # Get all lands with non-empty User field
        formula = "NOT(OR({User} = '', {User} = BLANK()))"
        lands = tables['lands'].all(formula=formula)
        
        # Extract unique citizen IDs who use lands
        land_user_ids = set()
        for land in lands:
            user = land['fields'].get('User')
            if user:
                land_user_ids.add(user)
        
        log.info(f"Found {len(land_user_ids)} citizens who use land")
        return list(land_user_ids)
    except Exception as e:
        log.error(f"Error fetching land users: {e}")
        return []

def get_all_citizens(tables) -> List[Dict]:
    """Fetch all citizens with their current social class, daily income, and influence."""
    log.info("Fetching all citizens...")
    
    try:
        all_citizens = tables['citizens'].all()
        log.info(f"Found {len(all_citizens)} citizens")
        return all_citizens
    except Exception as e:
        log.error(f"Error fetching citizens: {e}")
        return []

def create_notification(tables, citizen: str, content: str, details: Dict) -> None:
    """Create a notification for a citizen."""
    try:
        # Create the notification record
        tables['notifications'].create({
            "Type": "social_class_update",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": citizen
        })
        
        log.info(f"Created notification for citizen {citizen}")
    except Exception as e:
        log.error(f"Error creating notification: {e}")

def create_admin_summary(tables, update_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"🏛️ **Social Class Update Report**: **{update_summary['total_updated']}** citizens had their social class updated"
        
        # Create detailed information
        details = {
            "event_type": "social_class_update_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_citizens_checked": update_summary['total_checked'],
            "total_citizens_updated": update_summary['total_updated'],
            "updates_by_reason": {
                "entrepreneur": update_summary['by_reason']['entrepreneur'],
                "business_owner": update_summary['by_reason']['business_owner'],
                "land_user": update_summary['by_reason']['land_user'],
                "daily_income": update_summary['by_reason']['daily_income'],
                "influence": update_summary['by_reason']['influence']
            },
            "updates_by_class": {
                "to_Popolani": update_summary['by_class']['to_Popolani'],
                "to_Cittadini": update_summary['by_class']['to_Cittadini'],
                "to_Nobili": update_summary['by_class']['to_Nobili']
            }
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "social_class_update_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def update_social_class(dry_run: bool = False):
    """Main function to update citizens' social class."""
    log.info(f"Starting social class update process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    
    # Get all entrepreneurs (citizens who run at least one building)
    entrepreneur_ids = get_entrepreneurs(tables)
    log.info(f"Found {len(entrepreneur_ids)} entrepreneurs: {entrepreneur_ids}")
    
    # Get all business building owners
    business_owner_ids = get_business_building_owners(tables)
    log.info(f"Found {len(business_owner_ids)} business building owners: {business_owner_ids}")
    
    # Get all land users
    land_user_ids = get_land_users(tables)
    log.info(f"Found {len(land_user_ids)} land users: {land_user_ids}")
    
    # Get all citizens
    citizens = get_all_citizens(tables)
    
    log.info("Checking social classes of entrepreneurs and business owners...")
    
    # Get a list of all citizens who should be at least Popolani
    citizens_to_check = list(set(entrepreneur_ids + business_owner_ids))
    log.info(f"Found {len(citizens_to_check)} citizens who should be at least Popolani")
    
    # Get the current social class for each of these citizens
    for citizen_id in citizens_to_check:
        # Find the citizen in the list of all citizens by Username, not ID
        citizen = next((c for c in citizens if c['fields'].get('Username') == citizen_id), None)
        if citizen:
            current_social_class = citizen['fields'].get('SocialClass', '')
            log.info(f"Citizen {citizen_id} has social class: '{current_social_class}'")
            
            # Check if they need to be promoted
            if current_social_class in SOCIAL_CLASSES:
                current_index = SOCIAL_CLASSES.index(current_social_class)
                popolani_index = SOCIAL_CLASSES.index("Popolani")
                log.info(f"  Current class index: {current_index}, Popolani index: {popolani_index}")
                log.info(f"  Should be promoted: {current_index < popolani_index}")
            else:
                log.warning(f"  Invalid social class '{current_social_class}' for citizen {citizen_id}")
        else:
            log.warning(f"Could not find citizen {citizen_id} in the list of all citizens")
    
    log.info("Processing citizens for social class updates...")
    
    # Track update statistics
    update_summary = {
        "total_checked": len(citizens),
        "total_updated": 0,
        "by_reason": {
            "entrepreneur": 0,
            "business_owner": 0,
            "land_user": 0,
            "daily_income": 0,
            "influence": 0
        },
        "by_class": {
            "to_Popolani": 0,
            "to_Cittadini": 0,
            "to_Nobili": 0
        }
    }
    
    for citizen in citizens:
        citizen_id = citizen['id']
        username = citizen['fields'].get('Username', '')
        current_social_class = citizen['fields'].get('SocialClass', '')
        daily_income = float(citizen['fields'].get('DailyIncome', 0) or 0)
        influence = float(citizen['fields'].get('Influence', 0) or 0)
        
        # Skip if social class is not set
        if not current_social_class:
            log.warning(f"Citizen {username} has no social class set, skipping")
            continue
        
        # Skip if citizen is Forestieri or Artisti
        if current_social_class == "Forestieri" or current_social_class == "Artisti":
            log.info(f"Citizen {username} is {current_social_class}, skipping social class update.")
            continue
            
        # Determine new social class
        new_social_class = current_social_class
        update_reason = None
        
        # Check if citizen is an entrepreneur, business owner, or land user by Username
        is_entrepreneur = username in entrepreneur_ids
        is_business_owner = username in business_owner_ids
        is_land_user = username in land_user_ids
        
        # Add detailed logging for entrepreneurs, business owners, and land users
        if is_entrepreneur or is_business_owner or is_land_user:
            log.info(f"Processing citizen {citizen_id} - Current class: '{current_social_class}'")
            log.info(f"  Is entrepreneur: {is_entrepreneur}, Is business owner: {is_business_owner}, Is land user: {is_land_user}")
            log.info(f"  Daily income: {daily_income}, Influence: {influence}")
        
        try:
            # Check if the current social class is valid
            if current_social_class not in SOCIAL_CLASSES:
                log.warning(f"Citizen {citizen_id} has invalid social class '{current_social_class}', setting to lowest class")
                current_social_class = SOCIAL_CLASSES[0]  # Set to lowest class
                # Force an update since we're changing the class
                new_social_class = SOCIAL_CLASSES[0]
                update_reason = "invalid_class"
                log.info(f"  Setting invalid class to {new_social_class}")
            
            # Apply rules in order of precedence (highest to lowest)
            
            # Rule 1: Influence > 10000 -> Nobili
            if influence > 10000 and current_social_class != "Nobili":
                new_social_class = "Nobili"
                update_reason = "influence"
                log.info(f"  Promoting {citizen_id} to Nobili due to influence > 10000")
            
            # Rule 2: Daily Income > 100000 -> Cittadini (if not already Nobili)
            elif daily_income > 100000 and current_social_class not in ["Nobili", "Cittadini"]:
                new_social_class = "Cittadini"
                update_reason = "daily_income"
                log.info(f"  Promoting {citizen_id} to Cittadini due to daily income > 100000")
            
            # Rule 3: Land users must be at least Cittadini
            elif is_land_user:
                current_index = SOCIAL_CLASSES.index(current_social_class)
                cittadini_index = SOCIAL_CLASSES.index("Cittadini")
                
                log.info(f"  Land user check - Current index: {current_index}, Cittadini index: {cittadini_index}")
                
                if current_index < cittadini_index:
                    new_social_class = "Cittadini"
                    update_reason = "land_user"
                    log.info(f"  Promoting land user {citizen_id} from {current_social_class} to Cittadini")
                else:
                    log.info(f"  No promotion needed for land user {citizen_id}, already {current_social_class}")
            
            # Rule 4: Business building owners must be at least Popolani
            elif is_business_owner:
                current_index = SOCIAL_CLASSES.index(current_social_class)
                popolani_index = SOCIAL_CLASSES.index("Popolani")
                
                log.info(f"  Business owner check - Current index: {current_index}, Popolani index: {popolani_index}")
                
                if current_index < popolani_index:
                    new_social_class = "Popolani"
                    update_reason = "business_owner"
                    log.info(f"  Promoting business owner {citizen_id} from {current_social_class} to Popolani")
                else:
                    log.info(f"  No promotion needed for business owner {citizen_id}, already {current_social_class}")
            
            # Rule 4: Entrepreneurs must be at least Popolani
            elif is_entrepreneur:
                current_index = SOCIAL_CLASSES.index(current_social_class)
                popolani_index = SOCIAL_CLASSES.index("Popolani")
                
                log.info(f"  Entrepreneur check - Current index: {current_index}, Popolani index: {popolani_index}")
                
                if current_index < popolani_index:
                    new_social_class = "Popolani"
                    update_reason = "entrepreneur"
                    log.info(f"  Promoting entrepreneur {citizen_id} from {current_social_class} to Popolani")
                else:
                    log.info(f"  No promotion needed for entrepreneur {citizen_id}, already {current_social_class}")
        except ValueError as e:
            log.error(f"Error processing social class for citizen {citizen_id}: {e}")
            continue
            
        # Skip if no change
        if new_social_class == current_social_class:
            if is_entrepreneur or is_business_owner:
                log.info(f"  No change needed for {citizen_id}, already at appropriate class: {current_social_class}")
            continue
        
        # Log that we're going to update this citizen
        log.info(f"  WILL UPDATE {citizen_id} from {current_social_class} to {new_social_class} (reason: {update_reason})")
        
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        log.info(f"Updating {citizen_name} from {current_social_class} to {new_social_class} (reason: {update_reason})")
        
        if dry_run:
            log.info(f"[DRY RUN] Would update {citizen_name} to {new_social_class}")
            # Update statistics
            update_summary["total_updated"] += 1
            update_summary["by_reason"][update_reason] += 1
            update_summary["by_class"][f"to_{new_social_class}"] += 1
        else:
            try:
                # Update the citizen's social class
                log.info(f"  Calling Airtable API to update {citizen_id} to {new_social_class}")
                tables['citizens'].update(citizen_id, {
                    "SocialClass": new_social_class
                })
                log.info(f"  Airtable update completed successfully")
                
                # Create notification for the citizen
                content = f"🏛️ Your social status has been elevated to **{new_social_class}**!"
                details = {
                    "event_type": "social_class_update",
                    "previous_class": current_social_class,
                    "new_class": new_social_class,
                    "reason": update_reason,
                    "is_entrepreneur": is_entrepreneur,
                    "is_business_owner": is_business_owner,
                    "daily_income": daily_income,
                    "influence": influence
                }
                create_notification(tables, username, content, details)
                
                # Call updatecitizenDescriptionAndImage.py to update the citizen's description and image
                try:
                    # Get the path to the updatecitizenDescriptionAndImage.py script
                    script_dir = os.path.dirname(os.path.abspath(__file__))
                    update_script_path = os.path.join(script_dir, "..", "scripts", "updatecitizenDescriptionAndImage.py")
                    
                    if os.path.exists(update_script_path):
                        # Call the script to update the citizen's description and image
                        log.info(f"Calling updatecitizenDescriptionAndImage.py for citizen {username} after social class update")
                        result = subprocess.run(
                            [sys.executable, update_script_path, username],
                            capture_output=True,
                            text=True
                        )
                        
                        if result.returncode != 0:
                            log.warning(f"Error updating citizen description and image: {result.stderr}")
                        else:
                            log.info(f"Successfully updated description and image for citizen {username}")
                    else:
                        log.warning(f"Update script not found at: {update_script_path}")
                except Exception as e:
                    log.warning(f"Error calling updatecitizenDescriptionAndImage.py: {e}")
                    # Continue anyway as this is not critical
                
                # Update statistics
                update_summary["total_updated"] += 1
                update_summary["by_reason"][update_reason] += 1
                update_summary["by_class"][f"to_{new_social_class}"] += 1
                
                log.info(f"Successfully updated {citizen_name} to {new_social_class}")
            except Exception as e:
                log.error(f"Error updating social class for {citizen_name}: {e}")
    
    log.info(f"Social class update process complete. Updated: {update_summary['total_updated']} citizens")
    
    # Create a notification for the admin with the update summary
    if update_summary["total_updated"] > 0 and not dry_run:
        create_admin_summary(tables, update_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update citizens' social class based on entrepreneurship, income, and influence.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    update_social_class(dry_run=args.dry_run)
