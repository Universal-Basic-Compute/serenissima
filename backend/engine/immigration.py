#!/usr/bin/env python3
"""
Immigration script for La Serenissima.

This script:
1. Checks for vacant housing buildings (canal_house, merchant_s_house, artisan_s_house, fisherman_s_cottage)
2. For each vacant building, there's a 20% chance it will attract a new citizen
3. Generates a new citizen of the appropriate social class based on the building type
4. Calls the citizen image generation script
5. The househomelesscitizens.py script will then take care of housing the new citizens

Run this script periodically to simulate immigration to Venice.
"""

import os
import sys
import logging
import argparse
import random
import json
import subprocess
import datetime
import time
import requests
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
# Note: IMMIGRATION_SCRIPT_DIR and PROJECT_ROOT_IMMIGRATION are already defined below,
# but the sys.path modification needs to happen *before* the backend imports.
# We'll use a common pattern here.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, '..', '..'))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Import our citizen generator module
from backend.scripts.generateCitizen import generate_citizen

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("immigration")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
IMMIGRATION_SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT_IMMIGRATION = os.path.abspath(os.path.join(IMMIGRATION_SCRIPT_DIR, '..', '..'))
if PROJECT_ROOT_IMMIGRATION not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_IMMIGRATION)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

# Constants for building types and their corresponding social classes
BUILDING_TO_SOCIAL_CLASS = {
    "canal_house": "Nobili",
    "merchant_s_house": "Cittadini",
    "artisan_s_house": "Popolani",
    "fisherman_s_cottage": "Facchini"  # Using Facchini as equivalent to Laborer
}

# Chance of a vacant building attracting a citizen (20%)
IMMIGRATION_CHANCE = 0.20

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

def get_polygon_centers():
    """Fetch polygon centers from the API to use as positions for new citizens."""
    try:
        # Fetch polygon data from the API
        response = requests.get('http://localhost:3000/api/get-polygons')
        if response.status_code != 200:
            log.error(f"Failed to fetch polygons: HTTP {response.status_code}")
            return []
        
        data = response.json()
        if not data.get('polygons'):
            log.error("No polygons found in API response")
            return []
        
        # Extract all polygon centers
        centers = []
        for polygon in data['polygons']:
            if polygon.get('center'):
                centers.append(polygon['center'])
            elif polygon.get('centroid'):
                centers.append(polygon['centroid'])
        
        log.info(f"Found {len(centers)} polygon centers for citizen positions")
        return centers
    except Exception as e:
        log.error(f"Error fetching polygon centers: {e}")
        return []

def get_vacant_housing_buildings(tables) -> List[Dict]:
    """Fetch vacant housing buildings from Airtable."""
    log.info("Fetching vacant housing buildings...")
    
    try:
        # Get buildings that are housing types and have no occupant
        housing_types = list(BUILDING_TO_SOCIAL_CLASS.keys())
        
        # Create a formula to find vacant housing buildings
        type_conditions = []
        for building_type in housing_types:
            type_conditions.append(f"{{Type}}='{building_type}'")
        
        formula = f"AND(OR({','.join(type_conditions)}), OR({{Occupant}}='', {{Occupant}}=BLANK()), {{IsConstructed}}=TRUE())"
        
        vacant_buildings = tables['buildings'].all(formula=formula)
        
        log.info(f"Found {len(vacant_buildings)} vacant housing buildings")
        return vacant_buildings
    except Exception as e:
        log.error(f"Error fetching vacant housing buildings: {e}")
        return []

def save_citizen_to_airtable(tables, citizen: Dict, polygon_centers: list) -> Optional[Dict]:
    """Save a citizen to Airtable."""
    log.info(f"Saving citizen to Airtable: {citizen['FirstName']} {citizen['LastName']}")
    
    try:
        # Select a random polygon center for the citizen's position
        position = None
        if polygon_centers:
            position = random.choice(polygon_centers)
            log.info(f"Assigned position {position} to citizen {citizen['id']}")
        else:
            # If no polygon centers available, create a random position in Venice
            position = {
                "lat": 45.4371 + random.uniform(-0.01, 0.01),
                "lng": 12.3326 + random.uniform(-0.01, 0.01)
            }
            log.info(f"Created random position for citizen {citizen['id']}: {position}")
        
        # Create the citizen record
        record = tables['citizens'].create({
            "CitizenId": citizen["id"],
            "SocialClass": citizen["socialclass"],
            "FirstName": citizen["firstname"],
            "LastName": citizen["lastname"],
            "Description": citizen["description"],
            "ImagePrompt": citizen["imageprompt"],
            "Ducats": citizen["ducats"],
            "CreatedAt": citizen["createdat"],
            "Position": json.dumps(position)  # Ensure position is always provided as JSON string
        })
        
        log.info(f"Successfully saved citizen to Airtable with ID: {record['id']}")
        return record
    except Exception as e:
        log.error(f"Error saving citizen to Airtable: {e}")
        return None

def generate_citizen_image(citizen_id: str, image_prompt: str) -> bool:
    """Generate an image for the citizen using the generate_citizen_images.py script."""
    log.info(f"Generating image for citizen {citizen_id}")
    
    try:
        # Create a temporary file with the citizen data
        temp_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_citizen_image.json")
        with open(temp_file_path, "w") as f:
            json.dump({
                "id": citizen_id,
                "imagePrompt": image_prompt
            }, f)
        
        # Get the absolute path to the generate_citizen_images.py script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        image_script_path = os.path.join(script_dir, "generate_citizen_images.py")
        
        if not os.path.exists(image_script_path):
            log.error(f"Image generation script not found at: {image_script_path}")
            return False
        
        # Import the generate_citizen_images module
        try:
            # First try to import directly
            sys.path.append(script_dir)
            from generate_citizen_images import process_specific_citizen, initialize_airtable
            
            # Initialize Airtable
            tables = initialize_airtable()
            
            # Process the citizen
            success = process_specific_citizen(tables, citizen_id, image_prompt)
            
            log.info(f"Generated image for citizen {citizen_id} with result: {success}")
            return success
        except ImportError as ie:
            # Fall back to subprocess if import fails
            log.info(f"ImportError: {ie}. Falling back to subprocess for image generation")
            
            # Call the Python script to generate the image with absolute path
            result = subprocess.run(
                [sys.executable, image_script_path, "--citizen-id", citizen_id],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                log.error(f"Error generating citizen image: {result.stderr}")
                return False
            
            log.info(f"Successfully generated image for citizen {citizen_id}")
            return True
    except Exception as e:
        log.error(f"Error generating citizen image: {e}")
        return False
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

def create_immigration_notification(tables, citizen: Dict, building: Dict) -> None:
    """Create a notification about the new immigrant."""
    try:
        citizen_name = f"{citizen['firstname']} {citizen['lastname']}"
        building_name = building['fields'].get('Name', building['id'])
        building_type = building['fields'].get('Type', 'unknown')
        
        # Create notification content
        content = f"🏙️ A new citizen, **{citizen_name}**, has arrived in Venice seeking housing"
        details = {
            "citizen_id": citizen["id"],
            "citizen_name": citizen_name,
            "social_class": citizen["socialclass"],
            "building_type": building_type,
            "building_name": building_name,
            "event_type": "immigration"
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "immigration",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin notification
        })
        
        log.info(f"Created immigration notification for {citizen_name}")
    except Exception as e:
        log.error(f"Error creating immigration notification: {e}")

def create_admin_notification(tables, immigration_summary) -> None:
    """Create a notification for the admin citizen about the immigration process."""
    try:
        # Create notification content with summary of all immigrants
        content = f"🏙️ **Immigration Report**: **{immigration_summary['total']}** new citizens arrived in Venice"
        
        # Create detailed information about the immigrants by social class
        details = {
            "event_type": "immigration_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_immigrants": immigration_summary['total'],
            "by_class": {
                "Nobili": immigration_summary.get('Nobili', 0),
                "Cittadini": immigration_summary.get('Cittadini', 0),
                "Popolani": immigration_summary.get('Popolani', 0),
                "Facchini": immigration_summary.get('Facchini', 0)
            },
            "message": f"🏙️ New citizens have arrived in Venice seeking housing: **{immigration_summary.get('Nobili', 0)}** 👑 **Nobili**, **{immigration_summary.get('Cittadini', 0)}** 🧠 **Cittadini**, **{immigration_summary.get('Popolani', 0)}** 🛠️ **Popolani**, and **{immigration_summary.get('Facchini', 0)}** 💪 **Facchini**."
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "immigration_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Specific citizen to receive the notification
        })
        
        log.info(f"Created admin notification for citizen ConsiglioDeiDieci with immigration summary")
    except Exception as e:
        log.error(f"Error creating admin notification: {e}")

def process_immigration(dry_run: bool = False):
    """Main function to process immigration."""
    log_header(f"Immigration Process (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    vacant_buildings = get_vacant_housing_buildings(tables)
    
    if not vacant_buildings:
        log.info("No vacant housing buildings found. Immigration process complete.")
        return
    
    # Fetch polygon centers once for all citizens
    polygon_centers = get_polygon_centers()
    if not polygon_centers:
        log.warning("Could not fetch polygon centers, citizens will not have positions")
    
    immigration_count = 0
    # Track immigrants by social class
    immigration_by_class = {
        "Nobili": 0,
        "Cittadini": 0,
        "Popolani": 0,
        "Facchini": 0
    }
    
    for building in vacant_buildings:
        # 20% chance of immigration for each vacant building
        if random.random() > IMMIGRATION_CHANCE:
            continue
        
        building_type = building['fields'].get('Type')
        if not building_type or building_type not in BUILDING_TO_SOCIAL_CLASS:
            log.warning(f"Building {building['id']} has unknown type: {building_type}")
            continue
        
        social_class = BUILDING_TO_SOCIAL_CLASS[building_type]
        log.info(f"Building {building['id']} of type {building_type} will attract a {social_class}")
        
        if dry_run:
            log.info(f"[DRY RUN] Would generate a new {social_class} citizen for building {building['id']}")
            immigration_count += 1
            immigration_by_class[social_class] += 1
            continue
        
        # Generate a new citizen using our imported module
        citizen = generate_citizen(social_class)
        if not citizen:
            log.warning(f"Failed to generate citizen for building {building['id']}")
            continue
        
        # Save the citizen to Airtable with a random polygon center position
        citizen_record = save_citizen_to_airtable(tables, citizen, polygon_centers)
        if not citizen_record:
            log.warning(f"Failed to save citizen {citizen['FirstName']} {citizen['LastName']} to Airtable")
            continue
        
        # Generate an image for the citizen
        image_generated = generate_citizen_image(citizen["id"], citizen["ImagePrompt"])
        if not image_generated:
            log.warning(f"Failed to generate image for citizen {citizen['id']}, continuing without image")
            # Continue anyway, as this is not critical
        
        # Create a notification about the new immigrant
        create_immigration_notification(tables, citizen, building)
        
        immigration_count += 1
        immigration_by_class[social_class] += 1
        
        # Add a delay to avoid rate limiting
        time.sleep(2)
    
    log.info(f"Immigration process complete. {immigration_count} new citizens immigrated to Venice.")
    
    # Create a summary of immigration by social class
    immigration_summary = {
        "total": immigration_count,
        **immigration_by_class
    }
    
    # Create a notification for the admin citizen with the immigration summary
    if immigration_count > 0 and not dry_run:
        create_admin_notification(tables, immigration_summary)
        
        # Run the househomelesscitizens.py script to house the new citizens
        log.info("Running househomelesscitizens.py to house the new citizens...")
        try:
            # Change the path to use the correct location
            # Use the current file's directory to determine the correct path
            script_dir = os.path.dirname(os.path.abspath(__file__))
            househomeless_script = os.path.join(script_dir, "househomelesscitizens.py")
            
            # Check if the script exists before trying to run it
            if os.path.exists(househomeless_script):
                # Use sys.executable to ensure we use the same Python interpreter
                result = subprocess.run(
                    [sys.executable, househomeless_script],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode != 0:
                    log.error(f"Error running househomelesscitizens.py: {result.stderr}")
                else:
                    log.info("Successfully ran househomelesscitizens.py")
            else:
                log.warning(f"Househomeless script not found at {househomeless_script}, skipping automatic housing")
                log.info("New citizens will remain homeless until the next scheduled housing run")
        except Exception as e:
            log.error(f"Error running househomelesscitizens.py: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process immigration to Venice.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--force-rate", type=float, help="Force a specific immigration rate (0.0-1.0)")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Override immigration chance if specified
    if args.force_rate is not None:
        if 0.0 <= args.force_rate <= 1.0:
            IMMIGRATION_CHANCE = args.force_rate
            log.info(f"Immigration chance set to {IMMIGRATION_CHANCE}")
        else:
            log.warning(f"Invalid immigration rate {args.force_rate}, must be between 0.0 and 1.0")
    
    process_immigration(dry_run=args.dry_run)
