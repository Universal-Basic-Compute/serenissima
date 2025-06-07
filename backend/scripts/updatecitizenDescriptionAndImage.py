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
import tempfile # Added

# --- BEGIN COPIED HELPER FUNCTION ---
# (The upload_file_to_backend function defined above will be inserted here)
# Default API URL, can be overridden by env var or arg
DEFAULT_FASTAPI_URL = "https://backend.serenissima.ai/"

def upload_file_to_backend(
    local_file_path: str,
    filename_on_server: str, # Explicit filename for the server
    destination_folder_on_server: str, # e.g., "images/resources" or "coat-of-arms"
    api_url: str,
    api_key: str
) -> Optional[str]:
    """
    Uploads a file to the backend /api/upload-asset endpoint.

    Args:
        local_file_path (str): The path to the local file to upload.
        filename_on_server (str): The desired filename for the asset on the server.
        destination_folder_on_server (str): The relative path of the folder on the server 
                                            within the persistent assets dir.
        api_url (str): The base URL of the FastAPI backend.
        api_key (str): The API key for the upload endpoint.

    Returns:
        Optional[str]: The full public URL of the uploaded asset from the backend,
                       or None if upload failed.
    """
    upload_endpoint = f"{api_url.rstrip('/')}/api/upload-asset"
    
    try:
        with open(local_file_path, 'rb') as f:
            # The 'file' field in files should contain the desired filename on the server
            files = {'file': (filename_on_server, f)}
            data = {'destination_path': destination_folder_on_server} 
            headers = {'X-Upload-Api-Key': api_key}
            
            print(f"Uploading '{local_file_path}' as '{filename_on_server}' to backend folder '{destination_folder_on_server}' via {upload_endpoint}...")
            response = requests.post(upload_endpoint, files=files, data=data, headers=headers, timeout=180) # Increased timeout
            
            if response.status_code == 200:
                response_data = response.json()
                if response_data.get("success") and response_data.get("relative_path"):
                    relative_backend_path = response_data["relative_path"]
                    # Construct the full public URL
                    full_public_url = f"{api_url.rstrip('/')}/public_assets/{relative_backend_path.lstrip('/')}"
                    print(f"Success: '{local_file_path}' uploaded. Public URL: '{full_public_url}'")
                    return full_public_url
                else:
                    print(f"Upload successful but response format unexpected: {response_data}")
                    return None
            else:
                print(f"Upload failed for {local_file_path}. Status: {response.status_code}, Response: {response.text}")
                return None
    except requests.exceptions.RequestException as e:
        print(f"Request error during upload of {local_file_path}: {e}")
        return None
    except IOError as e:
        print(f"IO error reading {local_file_path}: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error during upload of {local_file_path}: {e}")
        return None
# --- END COPIED HELPER FUNCTION ---

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("update_citizen_description_image")

# Load environment variables
load_dotenv()

# Constants for local paths are no longer needed for final storage.
# CITIZENS_IMAGE_DIR = os.path.join(os.getcwd(), 'public', 'images', 'citizens')
# os.makedirs(CITIZENS_IMAGE_DIR, exist_ok=True) # Not creating local public dirs

# Global vars for backend URL and API key, to be set in main()
BACKEND_API_URL_GLOBAL = DEFAULT_FASTAPI_URL
UPLOAD_API_KEY_GLOBAL = None


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
                # Corrected formula to use Asset and AssetType
                resources_formula = f"AND({{Asset}}='{building_id}', {{AssetType}}='building')"
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
                "model": "gemini-2.5-pro-preview-06-05",
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

def generate_and_upload_citizen_image(prompt: str, citizen_id_as_username: str) -> Optional[str]:
    """Generate citizen image using Ideogram, download to temp, upload to backend, return public URL."""
    global BACKEND_API_URL_GLOBAL, UPLOAD_API_KEY_GLOBAL
    log.info(f"Generating portrait for {citizen_id_as_username}: {prompt[:100]}...")
    
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None
    if not UPLOAD_API_KEY_GLOBAL:
        log.error("UPLOAD_API_KEY_GLOBAL not set. Cannot upload image.")
        return None
        
    try:
        enhanced_prompt = f"{prompt} Renaissance portrait style with realistic details. 3/4 view portrait composition with dramatic lighting. Historically accurate Venetian setting and clothing details. Photorealistic quality, high detail."
        response = requests.post(
            "https://api.ideogram.ai/v1/ideogram-v3/generate",
            headers={"Api-Key": ideogram_api_key, "Content-Type": "application/json"},
            json={"prompt": enhanced_prompt, "style_type": "REALISTIC", "rendering_speed": "DEFAULT", "model":"V_3"}
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API (citizen portrait): {response.status_code} {response.text}")
            return None
        
        result = response.json()
        image_url_from_ideogram = result.get("data", [{}])[0].get("url")
        if not image_url_from_ideogram:
            log.error("No image URL in Ideogram response for citizen portrait")
            return None
        
        image_response = requests.get(image_url_from_ideogram, stream=True)
        if not image_response.ok:
            log.error(f"Failed to download citizen portrait: {image_response.status_code}")
            return None
        
        # Save to a temporary file (assuming .jpg is appropriate for portraits)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            for chunk in image_response.iter_content(chunk_size=8192):
                tmp_file.write(chunk)
            tmp_file_path = tmp_file.name
        
        log.info(f"Citizen portrait downloaded to temporary file: {tmp_file_path}")

        public_url = upload_file_to_backend(
            local_file_path=tmp_file_path,
            filename_on_server=f"{citizen_id_as_username}.jpg", # Use username as filename
            destination_folder_on_server="images/citizens",
            api_url=BACKEND_API_URL_GLOBAL,
            api_key=UPLOAD_API_KEY_GLOBAL
        )
        
        try:
            os.remove(tmp_file_path)
        except OSError as e:
            log.error(f"Error removing temporary citizen portrait file {tmp_file_path}: {e}")

        return public_url
    except Exception as e:
        log.error(f"Error generating/uploading citizen portrait for {citizen_id_as_username}: {e}")
        return None

def generate_and_upload_coat_of_arms_image(prompt: str, username: str) -> Optional[str]:
    """Generate CoA image, download to temp, upload to backend, return public URL."""
    global BACKEND_API_URL_GLOBAL, UPLOAD_API_KEY_GLOBAL
    log.info(f"Generating coat of arms for {username}: {prompt[:100]}...")
    
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None
    if not UPLOAD_API_KEY_GLOBAL:
        log.error("UPLOAD_API_KEY_GLOBAL not set. Cannot upload image.")
        return None

    enhanced_prompt = f"A heraldic coat of arms shield with the following description: {prompt}. Renaissance Venetian style, detailed, ornate, historically accurate, centered composition, on a transparent background."
    
    try:
        response = requests.post(
            "https://api.ideogram.ai/v1/ideogram-v3/generate",
            headers={"Api-Key": ideogram_api_key, "Content-Type": "application/json"},
            json={"prompt": enhanced_prompt, "style_type": "REALISTIC", "rendering_speed": "DEFAULT", "model":"V_3"}
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API for coat of arms: {response.status_code} {response.text}")
            return None
        
        result = response.json()
        image_url_from_ideogram = result.get("data", [{}])[0].get("url")
        if not image_url_from_ideogram:
            log.error("No coat of arms image URL in Ideogram response")
            return None
        
        image_response = requests.get(image_url_from_ideogram, stream=True)
        if not image_response.ok:
            log.error(f"Failed to download coat of arms image: {image_response.status_code}")
            return None
        
        # Save to a temporary file (assuming .png for transparency)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_file:
            for chunk in image_response.iter_content(chunk_size=8192):
                tmp_file.write(chunk)
            tmp_file_path = tmp_file.name

        log.info(f"Coat of arms image downloaded to temporary file: {tmp_file_path}")

        public_url = upload_file_to_backend(
            local_file_path=tmp_file_path,
            filename_on_server=f"{username}.png", # Use username as filename
            destination_folder_on_server="images/coat-of-arms", # Server folder for CoAs
            api_url=BACKEND_API_URL_GLOBAL,
            api_key=UPLOAD_API_KEY_GLOBAL
        )
        
        try:
            os.remove(tmp_file_path)
        except OSError as e:
            log.error(f"Error removing temporary CoA file {tmp_file_path}: {e}")
            
        return public_url
    except Exception as e:
        log.error(f"Error generating/uploading coat of arms for {username}: {e}")
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
            "ImagePrompt": image_prompt
            # "ImageUrl": image_url # This field no longer exists in Airtable CITIZENS table
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
            # The field CoatOfArmsImageUrl no longer exists in Airtable.
            # The frontend constructs this URL dynamically: https://backend.serenissima.ai/public_assets/images/coat-of-arms/{username}.png
            # if coat_of_arms_url:
            #     log.info(f"Updating CoatOfArmsImageUrl with: {coat_of_arms_url}")
            #     update_data["CoatOfArmsImageUrl"] = coat_of_arms_url
        
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
    citizen_info = get_citizen_info(tables, username) # type: ignore
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
    
    # Generate new citizen portrait and upload it
    # The username is used as citizen_id for image naming.
    uploaded_citizen_image_url = generate_and_upload_citizen_image(new_image_prompt, username)
    if not uploaded_citizen_image_url:
        log.error(f"Failed to generate and upload citizen portrait for {username}")
        # Continue anyway, as we can still update the description and other fields
    
    # Generate coat of arms image and upload it, if needed
    uploaded_coat_of_arms_url = None
    # Check if a new CoA description was generated AND if the citizen doesn't already have a CoA image URL
    current_coa_image_url = citizen_info["citizen"]['fields'].get('CoatOfArmsImageUrl')
    if new_coat_of_arms and not current_coa_image_url:
        log.info(f"Attempting to generate and upload new Coat of Arms for {username} as current one is missing.")
        uploaded_coat_of_arms_url = generate_and_upload_coat_of_arms_image(new_coat_of_arms, username)
        if not uploaded_coat_of_arms_url:
            log.warning(f"Failed to generate and upload coat of arms image for citizen {username}")
            # Continue anyway
    elif new_coat_of_arms and current_coa_image_url:
        log.info(f"Citizen {username} already has a CoatOfArmsImageUrl. New CoA description was generated but image won't be updated by this script if URL exists.")
        # If you want to re-generate even if URL exists, remove `and not current_coa_image_url`
    
    # Update citizen record with new text and potentially new image URLs
    old_personality_text = citizen_info["citizen"]['fields'].get('Description', '')
    success = update_citizen_record(
        tables, # type: ignore
        username, 
        new_personality_text, 
        new_core_personality_array, 
        new_family_motto, 
        new_coat_of_arms, # This is the textual description of CoA
        new_image_prompt, 
        uploaded_citizen_image_url or citizen_info["citizen"]['fields'].get('ImageUrl', ''), # Use new if available, else old
        uploaded_coat_of_arms_url # This will be None if not generated/uploaded, or if citizen already had one
                                  # The update_citizen_record logic handles conditional update of CoatOfArmsImageUrl
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
    parser.add_argument(
        "--api_url",
        default=os.getenv("FASTAPI_BACKEND_URL", DEFAULT_FASTAPI_URL),
        help="FastAPI backend URL for uploading assets."
    )
    parser.add_argument(
        "--api_key",
        default=os.getenv("UPLOAD_API_KEY"),
        help="API key for the backend upload endpoint."
    )
    
    args = parser.parse_args()

    # Set global vars for API URL and Key
    BACKEND_API_URL_GLOBAL = args.api_url
    UPLOAD_API_KEY_GLOBAL = args.api_key

    if not UPLOAD_API_KEY_GLOBAL:
        log.error("Upload API key is required. Set UPLOAD_API_KEY environment variable or use --api_key.")
        sys.exit(1)
    if not BACKEND_API_URL_GLOBAL:
        log.error("FastAPI backend URL is required. Set FASTAPI_BACKEND_URL environment variable or use --api_url.")
        sys.exit(1)
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
        log.setLevel(logging.DEBUG) # Ensure this script's logger is also verbose
    
    update_citizen_description_and_image(args.username, args.dry_run)
