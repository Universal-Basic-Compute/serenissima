#!/usr/bin/env python3
"""
Update Citizen Description and Image script for La Serenissima.

This script:
1. Fetches comprehensive data about a citizen:
   - Basic citizen information
   - Buildings they own or run
   - Recent resources they've handled
   - Recent activities they've participated in
   - Recent notifications they've received
2. Sends this data to the Kinos Engine API to generate:
   - A new, more accurate description based on their history
   - A new image prompt reflecting their current status
3. Generates a new image using Ideogram
4. Updates the citizen record in Airtable

Run this script when a citizen experiences major life events:
- When changing social class
- When changing jobs
- When achieving significant milestones
"""

import os
import sys
import logging
import argparse
import json
import datetime
import time
import requests
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("update_citizen_description_image")

# Load environment variables
load_dotenv()

# Constants
CITIZENS_IMAGE_DIR = os.path.join(os.getcwd(), 'public', 'images', 'citizens')

# Ensure the images directory exists
os.makedirs(CITIZENS_IMAGE_DIR, exist_ok=True)

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
            'resources': Table(api_key, base_id, 'RESOURCES'),
            'activities': Table(api_key, base_id, 'ACTIVITIES'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_citizen_info(tables, username: str) -> Optional[Dict]:
    """Get comprehensive information about a citizen."""
    log.info(f"Fetching information for citizen: {username}")
    
    try:
        # Get citizen record
        formula = f"{{Username}}='{username}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if not citizens:
            log.error(f"Citizen not found: {username}")
            return None
        
        citizen = citizens[0]
        log.info(f"Found citizen: {citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}")
        
        # Get buildings owned by this citizen
        owned_buildings_formula = f"{{Owner}}='{username}'"
        owned_buildings = tables['buildings'].all(formula=owned_buildings_formula)
        log.info(f"Found {len(owned_buildings)} buildings owned by {username}")
        
        # Get buildings run by this citizen
        run_buildings_formula = f"{{RunBy}}='{username}'"
        run_buildings = tables['buildings'].all(formula=run_buildings_formula)
        log.info(f"Found {len(run_buildings)} buildings run by {username}")
        
        # Get current workplace (building where citizen is the occupant and type is business)
        workplace_formula = f"AND({{Occupant}}='{username}', {{Category}}='business')"
        workplaces = tables['buildings'].all(formula=workplace_formula)
        current_workplace = workplaces[0] if workplaces else None
        if current_workplace:
            log.info(f"Found current workplace: {current_workplace['fields'].get('Name', '')} ({current_workplace['fields'].get('Type', '')})")
        
        # Get recent resources handled by this citizen
        # This is a simplification - in reality, we'd need to look at resource transactions
        # For now, we'll just get resources in buildings they own or run
        resources = []
        building_ids = []
        
        for building in owned_buildings + run_buildings:
            building_id = building['fields'].get('BuildingId')
            if building_id:
                building_ids.append(building_id)
        
        if building_ids:
            for building_id in building_ids:
                resources_formula = f"{{BuildingId}}='{building_id}'"
                building_resources = tables['resources'].all(formula=resources_formula)
                resources.extend(building_resources[:10])  # Limit to 10 resources per building
        
        log.info(f"Found {len(resources)} recent resources handled by {username}")
        
        # Get recent activities
        activities_formula = f"{{Citizen}}='{username}'"
        activities = tables['activities'].all(formula=activities_formula)
        # Sort by most recent first and limit to 25
        activities.sort(key=lambda x: x['fields'].get('CreatedAt', ''), reverse=True)
        recent_activities = activities[:25]
        log.info(f"Found {len(recent_activities)} recent activities for {username}")
        
        # Get recent notifications
        notifications_formula = f"{{Citizen}}='{username}'"
        notifications = tables['notifications'].all(formula=notifications_formula)
        # Sort by most recent first and limit to 50
        notifications.sort(key=lambda x: x['fields'].get('CreatedAt', ''), reverse=True)
        recent_notifications = notifications[:50]
        log.info(f"Found {len(recent_notifications)} recent notifications for {username}")
        
        # Compile all information
        citizen_info = {
            "citizen": citizen,
            "owned_buildings": owned_buildings,
            "run_buildings": run_buildings,
            "current_workplace": current_workplace,
            "recent_resources": resources,
            "recent_activities": recent_activities,
            "recent_notifications": recent_notifications
        }
        
        return citizen_info
    except Exception as e:
        log.error(f"Error fetching citizen information: {e}")
        return None

def generate_description_and_image_prompt(username: str, citizen_info: Dict) -> Optional[Dict]:
    """Generate a new description and image prompt using Kinos Engine API."""
    log.info(f"Generating new description and image prompt for citizen: {username}")
    
    # Get Kinos API key from environment
    kinos_api_key = os.environ.get('KINOS_API_KEY')
    if not kinos_api_key:
        log.error("KINOS_API_KEY environment variable is not set")
        return None
    
    try:
        # Extract key information for the prompt
        citizen = citizen_info["citizen"]
        first_name = citizen['fields'].get('FirstName', '')
        last_name = citizen['fields'].get('LastName', '')
        social_class = citizen['fields'].get('SocialClass', '')
        current_description = citizen['fields'].get('Description', '')
        
        # Get current workplace information
        workplace_info = "unemployed"
        if citizen_info["current_workplace"]:
            workplace = citizen_info["current_workplace"]
            workplace_name = workplace['fields'].get('Name', '')
            workplace_type = workplace['fields'].get('Type', '')
            workplace_info = f"works at {workplace_name} ({workplace_type})"
        
        # Create a prompt for the Kinos Engine
        prompt = f"""
        After experiencing significant events and changes in your life in Venice, it's time to update your description and appearance to better reflect who you've become.
        
        Based on your history, activities, and current status as {first_name} {last_name}, a {social_class} who {workplace_info}, YOU choose:
        
        1. YOUR new detailed and historically accurate description, including:
           - YOUR personality traits that have developed through your experiences
           - YOUR work ethic and skills demonstrated through your job history
           - YOUR social connections and relationships with other citizens
           - YOUR aspirations and motivations that align with your economic activities
           - Notable achievements or events from YOUR history in Venice
           - YOUR family background appropriate to your social class
           - YOUR daily routines and habits
        
        2. A detailed image prompt for Ideogram that will generate a portrait of YOU that:
           - Accurately reflects YOUR social class ({social_class}) with appropriate status symbols
           - Shows period-appropriate clothing and accessories for YOUR specific profession
           - Captures YOUR personality traits mentioned in the description
           - Features authentic Renaissance Venetian style, architecture, and setting
           - Includes appropriate lighting (Rembrandt-style for higher classes, natural light for lower)
           - Uses a color palette appropriate to YOUR social standing
           - Incorporates symbols of YOUR trade or profession
           - Shows facial features and expression that reflect YOUR character
        
        Your current description: {current_description}
        
        Please return your response in JSON format with two fields: "description" and "imagePrompt".
        """
        
        # Prepare system context with all the citizen data
        system_context = {
            "citizen_data": {
                "name": f"{first_name} {last_name}",
                "social_class": social_class,
                "current_description": current_description,
                "ducats": citizen['fields'].get('Ducats', 0),
                "prestige": citizen['fields'].get('Prestige', 0),
                "created_at": citizen['fields'].get('CreatedAt', '')
            },
            "buildings": {
                "owned": [
                    {
                        "name": b['fields'].get('Name', ''),
                        "type": b['fields'].get('Type', ''),
                        "category": b['fields'].get('Category', '')
                    } for b in citizen_info["owned_buildings"]
                ],
                "run": [
                    {
                        "name": b['fields'].get('Name', ''),
                        "type": b['fields'].get('Type', ''),
                        "category": b['fields'].get('Category', '')
                    } for b in citizen_info["run_buildings"]
                ],
                "workplace": None if not citizen_info["current_workplace"] else {
                    "name": citizen_info["current_workplace"]['fields'].get('Name', ''),
                    "type": citizen_info["current_workplace"]['fields'].get('Type', ''),
                    "category": citizen_info["current_workplace"]['fields'].get('Category', '')
                }
            },
            "activities": [
                {
                    "type": a['fields'].get('Type', ''),
                    "notes": a['fields'].get('Notes', ''),
                    "created_at": a['fields'].get('CreatedAt', '')
                } for a in citizen_info["recent_activities"]
            ],
            "notifications": [
                {
                    "type": n['fields'].get('Type', ''),
                    "content": n['fields'].get('Content', ''),
                    "created_at": n['fields'].get('CreatedAt', '')
                } for n in citizen_info["recent_notifications"]
            ],
            "resources": [
                {
                    "type": r['fields'].get('Type', ''),
                    "count": r['fields'].get('Count', 0)
                } for r in citizen_info["recent_resources"]
            ]
        }
        
        # Convert system context to string
        system_context_str = json.dumps(system_context)
        
        # Call Kinos Engine API
        response = requests.post(
            f"https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/{username}/messages",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {kinos_api_key}"
            },
            json={
                "content": prompt,
                "model": "claude-3-7-sonnet-latest",
                "mode": "creative",
                "addSystem": f"You are a historical expert on Renaissance Venice (1400-1600) helping to update a citizen profile for a historically accurate economic simulation game called La Serenissima. You have access to the following information about the citizen: {system_context_str}. Your response MUST be a valid JSON object with EXACTLY this format:\n\n```json\n{{\n  \"description\": \"string\",\n  \"imagePrompt\": \"string\"\n}}\n```\n\nDo not include any text before or after the JSON."
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Kinos Engine API: {response.status_code} {response.text}")
            return None
        
        # Extract the JSON from Kinos Engine's response
        content = response.json().get("content", "")
        
        # Find the JSON object in the response using a more robust approach
        try:
            # First try to parse the entire content as JSON
            result_data = json.loads(content)
        except json.JSONDecodeError:
            # If that fails, extract from first { to last }
            import re
            # Find the first { and last } in the content
            first_brace = content.find('{')
            last_brace = content.rfind('}')
            
            if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                json_str = content[first_brace:last_brace+1]
                try:
                    result_data = json.loads(json_str)
                    log.info(f"Successfully extracted JSON using first-to-last brace method")
                except json.JSONDecodeError as e:
                    log.error(f"Failed to parse extracted JSON: {e}")
                    log.error(f"Extracted content: {json_str}")
                    return None
            else:
                log.error(f"Could not extract JSON from Kinos Engine response: {content}")
                return None
        
        log.info(f"Successfully generated new description and image prompt for {username}")
        return result_data
    except Exception as e:
        log.error(f"Error generating description and image prompt: {e}")
        return None

def generate_image(prompt: str, citizen_id: str) -> Optional[str]:
    """Generate image using Ideogram API."""
    log.info(f"Sending prompt to Ideogram API: {prompt[:100]}...")
    
    # Get Ideogram API key from environment
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None
    
    try:
        # Enhance the prompt with additional styling guidance
        enhanced_prompt = f"{prompt} Renaissance portrait style with realistic details. 3/4 view portrait composition with dramatic lighting. Historically accurate Venetian setting and clothing details. Photorealistic quality, high detail."
        
        # Call the Ideogram API
        response = requests.post(
            "https://api.ideogram.ai/v1/ideogram-v3/generate",
            headers={
                "Api-Key": ideogram_api_key,
                "Content-Type": "application/json"
            },
            json={
                "prompt": enhanced_prompt,
                "style_type": "REALISTIC",
                "rendering_speed": "DEFAULT"
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API: {response.status_code} {response.text}")
            return None
        
        # Extract image URL from response
        result = response.json()
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            log.error("No image URL in response")
            return None
        
        # Download the image
        image_response = requests.get(image_url, stream=True)
        if not image_response.ok:
            log.error(f"Failed to download image: {image_response.status_code} {image_response.reason}")
            return None
        
        # Save the image to the public folder
        image_path = os.path.join(CITIZENS_IMAGE_DIR, f"{citizen_id}.jpg")
        with open(image_path, 'wb') as f:
            for chunk in image_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        log.info(f"Generated and saved image for citizen {citizen_id}")
        
        # Create the public URL path
        public_image_url = f"/images/citizens/{citizen_id}.jpg"
        
        return public_image_url
    except Exception as e:
        log.error(f"Error generating image for citizen {citizen_id}: {e}")
        return None

def update_citizen_record(tables, username: str, description: str, image_prompt: str, image_url: str) -> bool:
    """Update the citizen record with new description, image prompt, and image URL."""
    log.info(f"Updating citizen record for {username}")
    
    try:
        # Get citizen record
        formula = f"{{Username}}='{username}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if not citizens:
            log.error(f"Citizen not found: {username}")
            return False
        
        citizen = citizens[0]
        
        # Update the citizen record
        tables['citizens'].update(citizen['id'], {
            "Description": description,
            "ImagePrompt": image_prompt,
            "ImageUrl": image_url
        })
        
        log.info(f"Successfully updated citizen record for {username}")
        return True
    except Exception as e:
        log.error(f"Error updating citizen record: {e}")
        return False

def create_notification(tables, username: str, old_description: str, new_description: str) -> bool:
    """Create a notification about the updated description and image."""
    log.info(f"Creating notification for citizen {username}")
    
    try:
        # Create notification content
        content = "Your citizen profile has been updated with a new description and portrait reflecting your recent activities, achievements, and status in Venice."
        
        # Extract a brief summary of changes by comparing old and new descriptions
        summary = "Your portrait and description have been updated to better reflect your current status and history in Venice."
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "profile_update",
            "Content": content,
            "Details": json.dumps({
                "event_type": "profile_update",
                "old_description": old_description,
                "new_description": new_description,
                "summary": summary,
                "reason": "Your character has evolved through your experiences in Venice",
                "timestamp": datetime.datetime.now().isoformat()
            }),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": username
        })
        
        log.info(f"Created notification for citizen {username}")
        return True
    except Exception as e:
        log.error(f"Error creating notification: {e}")
        return False

def update_citizen_description_and_image(username: str, dry_run: bool = False):
    """Main function to update a citizen's description and image."""
    log.info(f"Starting update process for citizen {username} (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    
    # Get comprehensive information about the citizen
    citizen_info = get_citizen_info(tables, username)
    if not citizen_info:
        log.error(f"Failed to get information for citizen {username}")
        return False
    
    # Generate new description and image prompt
    result = generate_description_and_image_prompt(username, citizen_info)
    if not result:
        log.error(f"Failed to generate description and image prompt for citizen {username}")
        return False
    
    new_description = result.get("description", "")
    new_image_prompt = result.get("imagePrompt", "")
    
    if dry_run:
        log.info(f"[DRY RUN] Would update citizen {username} with:")
        log.info(f"[DRY RUN] New description: {new_description}")
        log.info(f"[DRY RUN] New image prompt: {new_image_prompt}")
        return True
    
    # Generate new image
    citizen_id = citizen_info["citizen"]['fields'].get('CitizenId')
    if not citizen_id:
        log.warning(f"Citizen {username} has no CitizenId, using Username instead")
        citizen_id = username
        
    image_url = generate_image(new_image_prompt, citizen_id)
    if not image_url:
        log.error(f"Failed to generate image for citizen {username}")
        # Continue anyway, as we can still update the description
    
    # Update citizen record
    old_description = citizen_info["citizen"]['fields'].get('Description', '')
    success = update_citizen_record(tables, username, new_description, new_image_prompt, image_url or "")
    if not success:
        log.error(f"Failed to update citizen record for {username}")
        return False
    
    # Create notification
    create_notification(tables, username, old_description, new_description)
    
    log.info(f"Successfully updated description and image for citizen {username}")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update a citizen's description and image based on their history and current status.")
    parser.add_argument("username", help="Username of the citizen to update")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    update_citizen_description_and_image(args.username, args.dry_run)
