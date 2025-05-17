#!/usr/bin/env python3
"""
Social Class Update script for La Serenissima.

This script:
1. Checks all citizens and updates their social class based on:
   - Entrepreneur status (citizens who run at least one building)
   - Daily income (citizens with >100000 Ducats daily income become Cittadini)
   - Prestige (citizens with >10000 Prestige become Nobili)
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
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
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
        # Define business building types (excluding housing)
        business_types = ['workshop', 'market-stall', 'tavern', 'warehouse', 'dock', 'factory', 'shop']
        
        # Create a formula to find business buildings
        type_conditions = [f"{{Type}}='{business_type}'" for business_type in business_types]
        formula = f"AND(OR({', '.join(type_conditions)}), NOT(OR({{Owner}} = '', {{Owner}} = BLANK())))"
        
        business_buildings = tables['buildings'].all(formula=formula)
        
        # Extract unique citizen IDs who own business buildings
        business_owner_ids = set()
        for building in business_buildings:
            owner = building['fields'].get('Owner')
            if owner:
                business_owner_ids.add(owner)
        
        log.info(f"Found {len(business_owner_ids)} citizens who own business buildings")
        return list(business_owner_ids)
    except Exception as e:
        log.error(f"Error fetching business building owners: {e}")
        return []

def get_all_citizens(tables) -> List[Dict]:
    """Fetch all citizens with their current social class, daily income, and prestige."""
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
        content = f"Social class update report: {update_summary['total_updated']} citizens had their social class updated"
        
        # Create detailed information
        details = {
            "event_type": "social_class_update_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_citizens_checked": update_summary['total_checked'],
            "total_citizens_updated": update_summary['total_updated'],
            "updates_by_reason": {
                "entrepreneur": update_summary['by_reason']['entrepreneur'],
                "business_owner": update_summary['by_reason']['business_owner'],
                "daily_income": update_summary['by_reason']['daily_income'],
                "prestige": update_summary['by_reason']['prestige']
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
    
    # Get all citizens
    citizens = get_all_citizens(tables)
    
    # Track update statistics
    update_summary = {
        "total_checked": len(citizens),
        "total_updated": 0,
        "by_reason": {
            "entrepreneur": 0,
            "business_owner": 0,
            "daily_income": 0,
            "prestige": 0
        },
        "by_class": {
            "to_Popolani": 0,
            "to_Cittadini": 0,
            "to_Nobili": 0
        }
    }
    
    for citizen in citizens:
        citizen_id = citizen['id']
        current_social_class = citizen['fields'].get('SocialClass', '')
        daily_income = float(citizen['fields'].get('DailyIncome', 0) or 0)
        prestige = float(citizen['fields'].get('Prestige', 0) or 0)
        
        # Skip if social class is not set
        if not current_social_class:
            log.warning(f"Citizen {citizen_id} has no social class set, skipping")
            continue
        
        # Determine new social class
        new_social_class = current_social_class
        update_reason = None
        
        # Check if citizen is an entrepreneur or business owner
        is_entrepreneur = citizen_id in entrepreneur_ids
        is_business_owner = citizen_id in business_owner_ids
        
        # Add debug logging for entrepreneurs
        if is_entrepreneur:
            log.info(f"Processing entrepreneur {citizen_id} with current class '{current_social_class}'")
        
        try:
            # Check if the current social class is valid
            if current_social_class not in SOCIAL_CLASSES:
                log.warning(f"Citizen {citizen_id} has invalid social class '{current_social_class}', setting to lowest class")
                current_social_class = SOCIAL_CLASSES[0]  # Set to lowest class
                
            # Apply rules in order of precedence (highest to lowest)
            
            # Rule 1: Prestige > 10000 -> Nobili
            if prestige > 10000 and current_social_class != "Nobili":
                new_social_class = "Nobili"
                update_reason = "prestige"
            
            # Rule 2: Daily Income > 100000 -> Cittadini (if not already Nobili)
            elif daily_income > 100000 and current_social_class not in ["Nobili", "Cittadini"]:
                new_social_class = "Cittadini"
                update_reason = "daily_income"
            
            # Rule 3: Business building owners must be at least Popolani
            elif is_business_owner:
                current_index = SOCIAL_CLASSES.index(current_social_class)
                popolani_index = SOCIAL_CLASSES.index("Popolani")
                if current_index < popolani_index:
                    new_social_class = "Popolani"
                    update_reason = "business_owner"
                    log.info(f"Promoting business owner {citizen_id} from {current_social_class} to Popolani")
            
            # Rule 4: Entrepreneurs must be at least Popolani
            elif is_entrepreneur:
                current_index = SOCIAL_CLASSES.index(current_social_class)
                popolani_index = SOCIAL_CLASSES.index("Popolani")
                if current_index < popolani_index:
                    new_social_class = "Popolani"
                    update_reason = "entrepreneur"
                    log.info(f"Promoting entrepreneur {citizen_id} from {current_social_class} to Popolani")
        except ValueError as e:
            log.error(f"Error processing social class for citizen {citizen_id}: {e}")
            continue
            
        # Skip if no change
        if new_social_class == current_social_class:
            continue
        
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
                tables['citizens'].update(citizen_id, {
                    "SocialClass": new_social_class
                })
                
                # Create notification for the citizen
                content = f"Your social status has been elevated to {new_social_class}!"
                details = {
                    "event_type": "social_class_update",
                    "previous_class": current_social_class,
                    "new_class": new_social_class,
                    "reason": update_reason,
                    "is_entrepreneur": is_entrepreneur,
                    "is_business_owner": is_business_owner,
                    "daily_income": daily_income,
                    "prestige": prestige
                }
                create_notification(tables, citizen_id, content, details)
                
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
    parser = argparse.ArgumentParser(description="Update citizens' social class based on entrepreneurship, income, and prestige.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    update_social_class(dry_run=args.dry_run)
