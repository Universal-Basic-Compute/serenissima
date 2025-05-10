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
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("immigration")

# Load environment variables
load_dotenv()

# Constants for building types and their corresponding social classes
BUILDING_TO_SOCIAL_CLASS = {
    "canal_house": "Patrician",
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
        
        formula = f"AND(OR({','.join(type_conditions)}), OR({{Occupant}}='', {{Occupant}}=BLANK()))"
        
        vacant_buildings = tables['buildings'].all(formula=formula)
        
        log.info(f"Found {len(vacant_buildings)} vacant housing buildings")
        return vacant_buildings
    except Exception as e:
        log.error(f"Error fetching vacant housing buildings: {e}")
        return []

def generate_citizen(social_class: str) -> Dict:
    """Generate a new citizen of the specified social class using Claude API."""
    log.info(f"Generating a new citizen of social class: {social_class}")
    
    # Get Claude API key from environment
    claude_api_key = os.environ.get('CLAUDE_API_KEY')
    if not claude_api_key:
        log.error("CLAUDE_API_KEY environment variable is not set")
        return None
    
    try:
        import requests
        
        # Create a system prompt for Claude
        system_prompt = f"""You are a historical expert on Renaissance Venice (1400-1600) helping to create a citizen for a historically accurate economic simulation game called La Serenissima.

TASK:
Create 1 unique Venetian citizen of the {social_class} social class with historically accurate name, description, and characteristics.

SOCIAL CLASS INFORMATION:
- Patrician: The noble families who control Venice's government. Wealthy, politically powerful, and often involved in long-distance trade.
- Cittadini: Wealthy non-noble citizens, including successful merchants, professionals, and high-ranking bureaucrats.
- Popolani: Common citizens including craftsmen, shopkeepers, and skilled workers.
- Facchini: Unskilled workers, servants, gondoliers, and the working poor.

For the citizen, provide:
1. FirstName - Historically accurate Venetian first name
2. LastName - Historically accurate Venetian family name (ensure patricians have notable Venetian noble family names)
3. Description - One sentence about personality, traits, and remarkable things about this person
4. ImagePrompt - A detailed prompt for generating an image of this person, including physical appearance, clothing appropriate to their social class, and setting
5. Wealth - Approximate wealth in Ducats, appropriate to their social class:
   - Patrician: 5,000-50,000 ducats
   - Cittadini: 1,000-5,000 ducats
   - Popolani: 100-1,000 ducats
   - Facchini: 10-100 ducats

FORMAT:
Return the data as a valid JSON object with the fields listed above.
"""

        user_prompt = f"Please create a single citizen of the {social_class} social class for our game. Return ONLY a valid JSON object with no additional text."
        
        # Call Claude API
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": claude_api_key,
                "anthropic-version": "2023-06-01"
            },
            json={
                "model": "claude-3-7-sonnet-latest",
                "max_tokens": 1000,
                "system": system_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ]
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Claude API: {response.status_code} {response.text}")
            return None
        
        # Extract the JSON from Claude's response
        content = response.json()["content"][0]["text"]
        
        # Find the JSON object in the response
        import re
        json_match = re.search(r'({[\s\S]*})', content)
        if not json_match:
            log.error(f"Could not extract JSON from Claude response: {content}")
            return None
        
        citizen_data = json.loads(json_match.group(1))
        
        # Add required fields
        citizen_data["SocialClass"] = social_class
        citizen_data["id"] = f"ctz_{int(time.time())}_{random.randint(1000, 9999)}"
        citizen_data["CreatedAt"] = datetime.datetime.now().isoformat()
        
        log.info(f"Successfully generated citizen: {citizen_data['FirstName']} {citizen_data['LastName']}")
        return citizen_data
    except Exception as e:
        log.error(f"Error generating citizen: {e}")
        return None

def save_citizen_to_airtable(tables, citizen: Dict) -> Optional[Dict]:
    """Save a citizen to Airtable."""
    log.info(f"Saving citizen to Airtable: {citizen['FirstName']} {citizen['LastName']}")
    
    try:
        # Create the citizen record
        record = tables['citizens'].create({
            "CitizenId": citizen["id"],
            "SocialClass": citizen["SocialClass"],
            "FirstName": citizen["FirstName"],
            "LastName": citizen["LastName"],
            "Description": citizen["Description"],
            "ImagePrompt": citizen["ImagePrompt"],
            "Wealth": citizen["Wealth"],
            "CreatedAt": citizen["CreatedAt"]
        })
        
        log.info(f"Successfully saved citizen to Airtable with ID: {record['id']}")
        return record
    except Exception as e:
        log.error(f"Error saving citizen to Airtable: {e}")
        return None

def generate_citizen_image(citizen_id: str, image_prompt: str) -> bool:
    """Generate an image for the citizen using the generateCitizenImages.ts script."""
    log.info(f"Generating image for citizen {citizen_id}")
    
    try:
        # Create a temporary file with the citizen data
        with open("temp_citizen_image.json", "w") as f:
            json.dump({
                "id": citizen_id,
                "imagePrompt": image_prompt
            }, f)
        
        # Call the Node.js script to generate the image
        result = subprocess.run(
            ["node", "scripts/generateCitizenImages.js", "1", "--citizen-id", citizen_id],
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
        if os.path.exists("temp_citizen_image.json"):
            os.remove("temp_citizen_image.json")

def create_immigration_notification(tables, citizen: Dict, building: Dict) -> None:
    """Create a notification about the new immigrant."""
    try:
        citizen_name = f"{citizen['FirstName']} {citizen['LastName']}"
        building_name = building['fields'].get('Name', building['id'])
        building_type = building['fields'].get('Type', 'unknown')
        
        # Create notification content
        content = f"A new citizen, {citizen_name}, has arrived in Venice seeking housing"
        details = {
            "citizen_id": citizen["id"],
            "citizen_name": citizen_name,
            "social_class": citizen["SocialClass"],
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
            "User": "system"  # System notification
        })
        
        log.info(f"Created immigration notification for {citizen_name}")
    except Exception as e:
        log.error(f"Error creating immigration notification: {e}")

def process_immigration(dry_run: bool = False):
    """Main function to process immigration."""
    log.info(f"Starting immigration process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    vacant_buildings = get_vacant_housing_buildings(tables)
    
    if not vacant_buildings:
        log.info("No vacant housing buildings found. Immigration process complete.")
        return
    
    immigration_count = 0
    
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
            continue
        
        # Generate a new citizen
        citizen = generate_citizen(social_class)
        if not citizen:
            log.warning(f"Failed to generate citizen for building {building['id']}")
            continue
        
        # Save the citizen to Airtable
        citizen_record = save_citizen_to_airtable(tables, citizen)
        if not citizen_record:
            log.warning(f"Failed to save citizen {citizen['FirstName']} {citizen['LastName']} to Airtable")
            continue
        
        # Generate an image for the citizen
        image_generated = generate_citizen_image(citizen["id"], citizen["ImagePrompt"])
        if not image_generated:
            log.warning(f"Failed to generate image for citizen {citizen['id']}")
            # Continue anyway, as this is not critical
        
        # Create a notification about the new immigrant
        create_immigration_notification(tables, citizen, building)
        
        immigration_count += 1
        
        # Add a delay to avoid rate limiting
        time.sleep(2)
    
    log.info(f"Immigration process complete. {immigration_count} new citizens immigrated to Venice.")
    
    if immigration_count > 0 and not dry_run:
        # Run the househomelesscitizens.py script to house the new citizens
        log.info("Running househomelesscitizens.py to house the new citizens...")
        try:
            result = subprocess.run(
                ["python", "engine/househomelesscitizens.py"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                log.error(f"Error running househomelesscitizens.py: {result.stderr}")
            else:
                log.info("Successfully ran househomelesscitizens.py")
        except Exception as e:
            log.error(f"Error running househomelesscitizens.py: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process immigration to Venice.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_immigration(dry_run=args.dry_run)
