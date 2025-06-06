#!/usr/bin/env python3
"""
Script to implement the decree that assigns public infrastructure buildings to land owners.

This script:
1. Finds all buildings of types: bridge, public_dock, canal_maintenance_office, cistern, public_well
2. For each building, determines which land it's located on
3. Sets the Citizen field of the building to match the land owner
4. Creates notifications for affected land owners

This implements the decree: "Land Owner Infrastructure Maintenance Responsibility"
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
log = logging.getLogger("affect_public_buildings")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine/decrees, so root is three levels up.
DECREE_SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT_DECREE = os.path.abspath(os.path.join(DECREE_SCRIPT_DIR, '..', '..', '..'))
if PROJECT_ROOT_DECREE not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DECREE)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

# Constants for building types affected by the decree
AFFECTED_BUILDING_TYPES = [
    "bridge", 
    "public_dock", 
    "canal_maintenance_office", 
    "cistern",
    "public_well"
]

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
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'lands': Table(api_key, base_id, 'LANDS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'decrees': Table(api_key, base_id, 'Decrees')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_decree_details(tables) -> Optional[Dict]:
    """Get the details of the infrastructure maintenance decree."""
    try:
        # Look for the decree with the specific ID or title
        formula = "OR({DecreeId}='decree-infrastructure-maintenance-001', {Title}='Land Owner Infrastructure Maintenance Responsibility')"
        decrees = tables['decrees'].all(formula=formula)
        
        if not decrees:
            log.warning("Infrastructure maintenance decree not found in Airtable")
            return None
        
        return decrees[0]
    except Exception as e:
        log.error(f"Error fetching decree details: {e}")
        return None

def get_affected_buildings(tables) -> List[Dict]:
    """Get all buildings of the affected types."""
    try:
        # Create a formula to find buildings of the affected types
        type_conditions = []
        for building_type in AFFECTED_BUILDING_TYPES:
            type_conditions.append(f"{{Type}}='{building_type}'")
        
        formula = f"OR({','.join(type_conditions)})"
        
        buildings = tables['buildings'].all(formula=formula)
        log.info(f"Found {len(buildings)} affected public buildings")
        return buildings
    except Exception as e:
        log.error(f"Error fetching affected buildings: {e}")
        return []

def get_land_owners(tables) -> Dict[str, str]:
    """Get a mapping of land IDs to their owners."""
    try:
        lands = tables['lands'].all()
        
        # Create a mapping of land IDs to owners (using Username)
        land_owners = {}
        for land in lands:
            land_id = land['fields'].get('LandId')
            owner = land['fields'].get('Owner')  # This should already be the Username
            
            if land_id and owner:
                land_owners[land_id] = owner
        
        log.info(f"Found {len(land_owners)} lands with owners")
        return land_owners
    except Exception as e:
        log.error(f"Error fetching land owners: {e}")
        return {}

def create_notification(tables, citizen: str, building_type: str, building_name: str, land_id: str) -> None:
    """Create a notification for a citizen about a building assignment."""
    try:
        # Get the land's historical name if available
        land_name = land_id  # Default to ID if name not found
        try:
            land_records = tables['lands'].all(formula=f"{{LandId}}='{land_id}'")
            if land_records and 'HistoricalName' in land_records[0]['fields']:
                land_name = land_records[0]['fields']['HistoricalName']
            elif land_records and 'EnglishName' in land_records[0]['fields']:
                land_name = land_records[0]['fields']['EnglishName']
        except Exception as land_error:
            log.warning(f"Error fetching land name: {land_error}")
            # Continue with land_id as the name
        
        # Create notification content
        # Add emoji based on building type
        emoji = "🏛️"  # Default emoji
        if "bridge" in building_type:
            emoji = "🌉"
        elif "dock" in building_type:
            emoji = "⚓"
        elif "canal" in building_type:
            emoji = "🚣"
        elif "cistern" in building_type or "well" in building_type:
            emoji = "💧"
            
        content = f"{emoji} **Decree Notice**: You are now responsible for maintaining the **{building_type}** on your land **{land_name}**"
        details = {
            "decree": "Land Owner Infrastructure Maintenance Responsibility",
            "building_type": building_type,
            "building_name": building_name,
            "land_id": land_id,
            "land_name": land_name,
            "event_type": "building_assignment"
        }
        
        # Create the notification record - use citizen username directly
        tables['notifications'].create({
            "Type": "decree_effect",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": citizen  # Use Username directly
        })
        
        log.info(f"Created notification for citizen {citizen} about {building_type} assignment on land {land_name}")
    except Exception as e:
        log.error(f"Error creating notification: {e}")

def assign_buildings_to_land_owners(dry_run: bool = False):
    """Main function to assign public buildings to land owners."""
    log_header(f"Public Building Assignment to Land Owners (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    
    # Get the decree details
    decree = get_decree_details(tables)
    if not decree:
        log.error("Cannot proceed without decree information")
        return
    
    log.info(f"Implementing decree: {decree['fields'].get('Title')}")
    
    # Get all affected buildings
    buildings = get_affected_buildings(tables)
    if not buildings:
        log.info("No affected buildings found")
        return
    
    # Get land owner mapping
    land_owners = get_land_owners(tables)
    if not land_owners:
        log.warning("No land owners found, cannot assign buildings")
        return
    
    # Track statistics
    assigned_count = 0
    failed_count = 0
    already_assigned_count = 0
    
    # Process each building
    for building in buildings:
        building_id = building['id']
        building_type = building['fields'].get('Type', 'unknown')
        building_name = building['fields'].get('Name', building_id)
        
        # Check for both 'Land' and 'land_id' fields
        land_id = building['fields'].get('Land') or building['fields'].get('land_id')
        
        # Get the current owner's username, not citizen ID
        current_owner = building['fields'].get('Owner')
        
        if not land_id:
            log.warning(f"Building {building_id} ({building_type}) has no Land field, skipping")
            failed_count += 1
            continue
        
        # Get the land owner's username
        land_owner = land_owners.get(land_id)
        if not land_owner:
            log.warning(f"No owner found for land {land_id}, skipping building {building_id}")
            failed_count += 1
            continue
        
        # Check if the building is already assigned to the correct owner
        if current_owner == land_owner:
            log.info(f"Building {building_id} ({building_type}) already assigned to {land_owner}, skipping")
            already_assigned_count += 1
            continue
        
        # Get land name for notification
        land_name = land_id  # Default to ID if name not found
        
        if dry_run:
            log.info(f"[DRY RUN] Would assign building {building_id} ({building_type}) to {land_owner}")
            assigned_count += 1
        else:
            try:
                # Update the building record with the land owner's username
                tables['buildings'].update(building_id, {
                    "Owner": land_owner  # Use Username directly
                })
                
                log.info(f"Assigned building {building_id} ({building_type}) to {land_owner}")
                
                # Create a notification for the land owner
                create_notification(tables, land_owner, building_type, building_name, land_id)
                
                assigned_count += 1
            except Exception as e:
                log.error(f"Error assigning building {building_id} to {land_owner}: {e}")
                failed_count += 1
    
    # Create a summary notification for the admin
    try:
        if not dry_run and assigned_count > 0:
            # Format numbers with commas
            formatted_assigned = f"{assigned_count:,}"
            
            summary_content = f"🏛️ **Decree Implementation Complete**: **{formatted_assigned}** public buildings assigned to land owners"
            summary_details = {
                "decree": "Land Owner Infrastructure Maintenance Responsibility",
                "assigned_count": assigned_count,
                "already_assigned_count": already_assigned_count,
                "failed_count": failed_count,
                "event_type": "decree_implementation_summary"
            }
            
            tables['notifications'].create({
                "Type": "decree_summary",
                "Content": summary_content,
                "Details": json.dumps(summary_details),
                "CreatedAt": datetime.datetime.now().isoformat(),
                "ReadAt": None,
                "Citizen": "ConsiglioDeiDieci"  # Admin citizen
            })
            
            log.info("Created summary notification for admin")
    except Exception as e:
        log.error(f"Error creating summary notification: {e}")
    
    log.info(f"Building assignment process complete. Assigned: {assigned_count}, Already assigned: {already_assigned_count}, Failed: {failed_count}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assign public buildings to land owners based on decree.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    assign_buildings_to_land_owners(dry_run=args.dry_run)
