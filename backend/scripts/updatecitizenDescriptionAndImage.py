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
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'relevancies': Table(api_key, base_id, 'RELEVANCIES')  # Add the RELEVANCIES table
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
        
        # NEW: Get relevancies where this citizen is the target
        try:
            # Get API base URL from environment variables, with a default fallback
            api_base_url = os.environ.get('API_BASE_URL', 'http://localhost:3000')
        
            # Construct the API URL with the targetCitizen parameter
            url = f"{api_base_url}/api/relevancies?targetCitizen={username}"
        
            log.info(f"Fetching relevancies for {username} from API: {url}")
        
            # Make the API request
            response = requests.get(url)
        
            # Check if the request was successful
            if response.ok:
                data = response.json()
            
                # Check if the response has the expected structure
                if "success" in data and data["success"] and "relevancies" in data:
                    relevancies = data["relevancies"]
                    log.info(f"Found {len(relevancies)} relevancies where {username} is the target")
                else:
                    log.warning(f"Unexpected API response format: {data}")
                    relevancies = []
            else:
                log.warning(f"Failed to fetch relevancies from API: {response.status_code} {response.text}")
                relevancies = []
        except Exception as e:
            log.warning(f"Error fetching relevancies for {username}: {e}")
            relevancies = []  # Use empty list if there's an error
        
        # Compile all information
        citizen_info = {
            "citizen": citizen,
            "owned_buildings": owned_buildings,
            "run_buildings": run_buildings,
            "current_workplace": current_workplace,
            "recent_resources": resources,
            "recent_activities": recent_activities,
            "recent_notifications": recent_notifications,
            "relevancies": relevancies  # Use the data directly from the API
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
        username = citizen['fields'].get('Username', '')

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
        
        Based on your history, activities, and current status as {first_name} {last_name} ({username}), a {social_class} who {workplace_info}, YOU choose:
        
        1. Your new 'Personality' (a textual description, 2-3 sentences) which elaborates on your core traits, values, temperament, and notable flaws, reflecting your experiences, aspirations, achievements, family background, and daily habits.
        
        2. Your 'CorePersonality' as an array of three specific strings: [Positive Trait, Negative Trait, Core Motivation]. This should follow the framework:
           - Positive Trait: A strength, what you excel at (e.g., "Meticulous", "Disciplined", "Observant").
           - Negative Trait: A flaw, what limits you (e.g., "Calculating", "Rigid", "Secretive").
           - Core Motivation: A driver, what fundamentally motivates you (e.g., "Security-driven", "Stability-oriented", "Independence-focused").
           Each trait should be a single descriptive word or a very short phrase.

        3. A family motto that reflects your values and aspirations (if you don't already have one).

        4. A coat of arms description (if you don't already have one) that:
           - Is historically appropriate for your social class.
           - Includes symbolic elements that represent your profession, values, and family history.
           - Follows heraldic conventions of Renaissance Venice.
           - Uses colors and symbols that reflect your status and aspirations.
        
        5. A detailed image prompt for Ideogram that will generate a portrait of YOU that:
           - Accurately reflects your social class ({social_class}) with appropriate status symbols.
           - Shows period-appropriate clothing and accessories for your specific profession.
           - Captures your personality traits mentioned in the 'Personality' description and 'CorePersonality' array.
           - Features authentic Renaissance Venetian style, architecture, and setting.
           - Includes appropriate lighting (Rembrandt-style for higher classes, natural light for lower).
           - Uses a color palette appropriate to your social standing.
           - Incorporates symbols of your trade or profession.
           - Shows facial features and expression that reflect your character.
        
        Your current textual description (Personality): {current_description}
        
        Please return your response in JSON format with these fields: "Personality", "CorePersonality", "familyMotto", "coatOfArms", and "imagePrompt".
        """
        
        # Prepare system context with all the citizen data
        system_context = {
            "citizen_data": {
                "name": f"{first_name} {last_name}",
                "social_class": social_class,
                "current_description": current_description,
                "ducats": citizen['fields'].get('Ducats', 0),
                "influence": citizen['fields'].get('Influence', 0),
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
            ],
            "relevancies": [  # Add the relevancies to the system context
                {
                    "asset": r.get('Asset', ''),
                    "asset_type": r.get('AssetType', ''),
                    "category": r.get('Category', ''),
                    "type": r.get('Type', ''),
                    "relevant_to_citizen": r.get('RelevantToCitizen', ''),
                    "score": r.get('Score', 0),
                    "title": r.get('Title', ''),
                    "description": r.get('Description', ''),
                    "time_horizon": r.get('TimeHorizon', ''),
                    "status": r.get('Status', ''),
                    "created_at": r.get('CreatedAt', '')
                } for r in citizen_info["relevancies"]
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
                "model": "claude-sonnet-4-20250514",
                "mode": "creative",
                "addSystem": f"You are a historical expert on Renaissance Venice (1400-1600) helping to update a citizen profile for a historically accurate economic simulation game called La Serenissima. You have access to the following information about the citizen: {system_context_str}. For the 'CorePersonality' array, ensure the Negative Trait is a significant character flaw or vice realistic for Renaissance Venice (e.g., pride, greed, cunning, jealousy, impatience, vanity, stubbornness). Your response MUST be a valid JSON object with EXACTLY this format:\n\n```json\n{{\n  \"Personality\": \"string\",\n  \"CorePersonality\": [\"string\", \"string\", \"string\"],\n  \"familyMotto\": \"string\",\n  \"coatOfArms\": \"string\",\n  \"imagePrompt\": \"string\"\n}}\n```\n\nDo not include any text before or after the JSON."
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Kinos Engine API: {response.status_code} {response.text}")
            return None
        
        # Extract the JSON from Kinos Engine's response
        response_text = response.json().get("response", "")
        
        # Find the JSON object in the response using a more robust approach
        try:
            # First try to parse the entire content as JSON
            result_data = json.loads(response_text)
            log.info("Successfully parsed entire response as JSON")
        except json.JSONDecodeError:
            # Log the full response for debugging
            log.error(f"Could not parse entire response as JSON. Full response: {response_text}")
            
            # Find the first { and last } in the content
            first_brace = response_text.find('{')
            last_brace = response_text.rfind('}')
            
            if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                # Extract the JSON string
                json_str = response_text[first_brace:last_brace+1]
                
                # Remove comments (both // and /* */ style)
                import re
                # Remove // comments
                json_str = re.sub(r'//.*?$', '', json_str, flags=re.MULTILINE)
                # Remove /* */ comments
                json_str = re.sub(r'/\*.*?\*/', '', json_str, flags=re.DOTALL)
                
                # Remove any trailing commas before closing braces or brackets (common JSON error)
                json_str = re.sub(r',\s*}', '}', json_str)
                json_str = re.sub(r',\s*]', ']', json_str)
                
                try:
                    result_data = json.loads(json_str)
                    log.info("Successfully parsed JSON after cleaning")
                except json.JSONDecodeError as e:
                    log.error(f"Failed to parse JSON after cleaning: {e}")
                    
                    # Try a more aggressive approach - manually extract each field
                    try:
                        # Extract each field using regex
                        # For CorePersonality, we expect an array, so regex needs to be more careful or use json.loads on substring
                        personality_match = re.search(r'"Personality"\s*:\s*"(.*?)"(?=,\s*"CorePersonality")', json_str, re.DOTALL)
                        if not personality_match: # Fallback if CorePersonality is not next
                            personality_match = re.search(r'"Personality"\s*:\s*"(.*?)"(?=,|})', json_str, re.DOTALL)

                        core_personality_str_match = re.search(r'"CorePersonality"\s*:\s*(\[.*?\])', json_str, re.DOTALL)
                        core_array = []
                        if core_personality_str_match:
                            try:
                                core_array = json.loads(core_personality_str_match.group(1))
                            except json.JSONDecodeError:
                                log.warning("Could not parse CorePersonality array from regex match.")
                        
                        # Special handling for family motto which might contain quotes
                        motto_start = json_str.find('"familyMotto"')
                        if motto_start != -1:
                            motto_colon = json_str.find(':', motto_start)
                            motto_value_start = json_str.find('"', motto_colon) + 1
                            # Find the next field or closing brace
                            next_field = json_str.find('",', motto_value_start)
                            if next_field == -1:
                                next_field = json_str.find('"}', motto_value_start)
                            motto_value = json_str[motto_value_start:next_field]
                        else:
                            motto_value = ""
                        
                        coat_match = re.search(r'"coatOfArms"\s*:\s*"(.*?)"(?=,|})', json_str, re.DOTALL)
                        img_match = re.search(r'"imagePrompt"\s*:\s*"(.*?)"(?=,|})', json_str, re.DOTALL)
                        
                        # Create a new JSON object with the extracted values
                        result_data = {
                            "Personality": personality_match.group(1).strip() if personality_match else "",
                            "CorePersonality": core_array,
                            "familyMotto": motto_value,
                            "coatOfArms": coat_match.group(1).strip() if coat_match else "",
                            "imagePrompt": img_match.group(1).strip() if img_match else ""
                        }
                        
                        log.info("Successfully extracted JSON fields manually")
                    except Exception as ex:
                        log.error(f"Failed to extract JSON fields manually: {ex}")
                        return None
            else:
                log.error(f"Could not find JSON object markers in response: {response_text}")
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
                "rendering_speed": "DEFAULT",
                "model":"V_3"
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
        
        # Save the image to the public folder using the username directly
        # No need to look up the username - citizen_id is already the username
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

def generate_coat_of_arms_image(prompt: str, username: str) -> Optional[str]:
    """Generate coat of arms image using Ideogram API."""
    log.info(f"Generating coat of arms for {username}: {prompt[:100]}...")
    
    # Get Ideogram API key from environment
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None
    
    # Enhance the prompt for better coat of arms generation
    enhanced_prompt = f"A heraldic coat of arms shield with the following description: {prompt}. Renaissance Venetian style, detailed, ornate, historically accurate, centered composition, on a transparent background."
    
    try:
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
                "rendering_speed": "DEFAULT",
                "model":"V_3"
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API for coat of arms: {response.status_code} {response.text}")
            return None
        
        # Extract image URL from response
        result = response.json()
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            log.error("No coat of arms image URL in response")
            return None
        
        # Download the image
        image_response = requests.get(image_url, stream=True)
        if not image_response.ok:
            log.error(f"Failed to download coat of arms image: {image_response.status_code} {image_response.reason}")
            return None
        
        # Ensure the coat of arms directory exists
        coat_of_arms_dir = os.path.join(os.getcwd(), 'public', 'coat-of-arms')
        os.makedirs(coat_of_arms_dir, exist_ok=True)
        
        # Save the image to the coat of arms folder using the username
        image_path = os.path.join(coat_of_arms_dir, f"{username}.png")
        with open(image_path, 'wb') as f:
            for chunk in image_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        log.info(f"Generated and saved coat of arms for {username}")
        
        # Create the public URL path
        public_image_url = f"/coat-of-arms/{username}.png"
        
        return public_image_url
    except Exception as e:
        log.error(f"Error generating coat of arms for {username}: {e}")
        return None

def update_citizen_record(tables, username: str, personality_text: str, core_personality_array: list, family_motto: str, coat_of_arms: str, image_prompt: str, image_url: str, coat_of_arms_url: str = None) -> bool:
    """Update the citizen record with new personality, core personality array, family motto, coat of arms, image prompt, and image URLs."""
    log.info(f"Updating citizen record for {username}")
    
    try:
        # Get citizen record
        formula = f"{{Username}}='{username}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if not citizens:
            log.error(f"Citizen not found: {username}")
            return False
        
        citizen = citizens[0]
        
        # Check which fields are empty for conditional updates
        current_family_motto = citizen['fields'].get('FamilyMotto', '')
        current_coat_of_arms = citizen['fields'].get('CoatOfArms', '')
        
        # Prepare update data
        update_data = {
            "Description": personality_text,  # Airtable's "Description" field gets the new "Personality" text
            "CorePersonality": json.dumps(core_personality_array) if core_personality_array else None, # Store array as JSON string
            "ImagePrompt": image_prompt,
            "ImageUrl": image_url
        }
        
        # Only update FamilyMotto if it's empty and a new one is provided
        if not current_family_motto and family_motto:
            log.info(f"FamilyMotto is empty, updating with new value: {family_motto}")
            update_data["FamilyMotto"] = family_motto
        
        # Only update CoatOfArms if it's empty and a new one is provided
        if not current_coat_of_arms and coat_of_arms:
            log.info(f"CoatOfArms is empty, updating with new value: {coat_of_arms[:50]}...")
            update_data["CoatOfArms"] = coat_of_arms
            
            # If we have a coat of arms URL and a new coat of arms description, update the image URL
            if coat_of_arms_url:
                log.info(f"Updating CoatOfArmsImageUrl with: {coat_of_arms_url}")
                update_data["CoatOfArmsImageUrl"] = coat_of_arms_url
        
        # Update the citizen record
        tables['citizens'].update(citizen['id'], update_data)
        
        log.info(f"Successfully updated citizen record for {username}")
        return True
    except Exception as e:
        log.error(f"Error updating citizen record: {e}")
        return False

def create_notification(tables, username: str, old_personality_text: str, new_personality_text: str) -> bool:
    """Create a notification about the updated personality description and image."""
    log.info(f"Creating notification for citizen {username}")
    
    try:
        # Create notification content
        content = "🖼️ Your citizen profile has been updated with a new **personality description** and **portrait** reflecting your recent **activities**, **achievements**, and **status** in Venice."
        
        # Extract a brief summary of changes
        summary = "🔄 Your **portrait** and **personality description** have been updated to better reflect your current **status** and **history** in Venice."
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "profile_update",
            "Content": content,
            "Details": json.dumps({
                "event_type": "profile_update",
                "old_personality": old_personality_text,
                "new_personality": new_personality_text,
                "summary": summary,
                "reason": "✨ Your character has **evolved** through your experiences in **Venice**",
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
    
    new_personality_text = result.get("Personality", "")
    new_core_personality_array = result.get("CorePersonality", []) # This is now an array
    new_family_motto = result.get("familyMotto", "")
    new_coat_of_arms = result.get("coatOfArms", "")
    new_image_prompt = result.get("imagePrompt", "")
    
    if dry_run:
        log.info(f"[DRY RUN] Would update citizen {username} with:")
        log.info(f"[DRY RUN] New Personality (textual): {new_personality_text}")
        log.info(f"[DRY RUN] New CorePersonality (array): {new_core_personality_array}")
        log.info(f"[DRY RUN] New family motto: {new_family_motto}")
        log.info(f"[DRY RUN] New coat of arms: {new_coat_of_arms}")
        log.info(f"[DRY RUN] New image prompt: {new_image_prompt}")
        return True
    
    # Generate new image - use username directly for the image file
    image_url = generate_image(new_image_prompt, username)
    if not image_url:
        log.error(f"Failed to generate image for citizen {username}")
        # Continue anyway, as we can still update the description
    
    # Generate coat of arms image if we have a description and the citizen doesn't already have one
    coat_of_arms_url = None
    if new_coat_of_arms and not citizen_info["citizen"]['fields'].get('CoatOfArmsImageUrl'):
        coat_of_arms_url = generate_coat_of_arms_image(new_coat_of_arms, username)
        if not coat_of_arms_url:
            log.warning(f"Failed to generate coat of arms image for citizen {username}")
            # Continue anyway, as we can still update the other fields
    
    # Update citizen record
    old_personality_text = citizen_info["citizen"]['fields'].get('Description', '') # Old "Description" is old "Personality"
    success = update_citizen_record(
        tables, 
        username, 
        new_personality_text, 
        new_core_personality_array, 
        new_family_motto, 
        new_coat_of_arms, 
        new_image_prompt, 
        image_url or "", 
        coat_of_arms_url
    )
    if not success:
        log.error(f"Failed to update citizen record for {username}")
        return False
    
    # Create notification
    create_notification(tables, username, old_personality_text, new_personality_text)
    
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
