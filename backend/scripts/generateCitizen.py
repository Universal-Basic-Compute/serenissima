#!/usr/bin/env python3
"""
Citizen Generator for La Serenissima.

This module provides functions to generate citizens with historically accurate
names, descriptions, and characteristics for Renaissance Venice.

It can be used by other scripts like immigration.py to create new citizens.
"""

import os
import sys
import logging
from joinGuild import process_ai_guild_joining # Added import
import random
import json
import datetime
import time
from typing import Dict, Optional, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("generate_citizen")

# Load environment variables
# Add project root to sys.path for consistency if this script is run from elsewhere
PROJECT_ROOT_GEN_CITIZEN = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT_GEN_CITIZEN not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_GEN_CITIZEN)

# Load environment variables from the project root .env file
dotenv_path_gc = os.path.join(PROJECT_ROOT_GEN_CITIZEN, '.env')
if os.path.exists(dotenv_path_gc):
    load_dotenv(dotenv_path_gc)
    log.info(f"Attempted to load .env file from: {dotenv_path_gc}")
else:
    log.warning(f".env file not found at: {dotenv_path_gc}. Attempting default load_dotenv() which searches parent directories or relies on system env vars.")
    load_dotenv() # Attempt default load_dotenv behavior as a fallback

# Define a list of ~20 colors for citizen profiles
CITIZEN_COLORS = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF",
    "#FFC300", "#DAF7A6", "#581845", "#C70039", "#900C3F",
    "#FFBF00", "#FF7F50", "#DE3163", "#6495ED", "#40E0D0",
    "#CCCCFF", "#BDB76B", "#8A2BE2", "#D2691E", "#7FFF00"
]

def _get_random_venice_position() -> Optional[Dict[str, float]]:
    """Fetches polygon data and returns a random buildingPoint's lat/lng."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        polygons_url = f"{api_base_url}/api/get-polygons?essential=true" # Fetch essential data
        log.info(f"Fetching polygon data from: {polygons_url}")
        response = requests.get(polygons_url, timeout=15)
        response.raise_for_status()
        data = response.json()

        all_building_points = []
        if data.get("polygons") and isinstance(data["polygons"], list):
            for polygon in data["polygons"]:
                if polygon and isinstance(polygon.get("buildingPoints"), list):
                    for point in polygon["buildingPoints"]:
                        if isinstance(point, dict) and "lat" in point and "lng" in point:
                            all_building_points.append({"lat": float(point["lat"]), "lng": float(point["lng"])})
        
        if not all_building_points:
            log.warning("No building points found in polygon data.")
            return None
        
        selected_point = random.choice(all_building_points)
        log.info(f"Selected random building point for position: {selected_point}")
        return selected_point
    except requests.exceptions.RequestException as e:
        log.error(f"API request failed for polygon data: {e}")
        return None
    except Exception as e:
        log.error(f"Error getting random Venice position: {e}")
        return None
    
def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        return None
    
    try:
        api = Api(api_key)
        base = api.base(base_id)
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': base.table('CITIZENS')
            # Add other tables here if needed by this script directly
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        return None

def username_exists(tables, username: str) -> bool:
    """Check if a username already exists in the CITIZENS table."""
    try:
        # Query Airtable for citizens with this username
        matching_citizens = tables['citizens'].all(
            formula=f"{{Username}} = '{username}'",
            fields=["Username"]
        )
        
        # If any records are returned, the username exists
        return len(matching_citizens) > 0
    except Exception as e:
        log.error(f"Error checking if username exists: {e}")
        # If there's an error, assume it might exist to be safe
        return True

def generate_citizen(social_class: str, additional_prompt_text: Optional[str] = None, add_message: Optional[str] = None, add_message_file_content: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Generate a new citizen using Kinos Engine API.
    
    Args:
        social_class: Requested social class.
        additional_prompt_text: Optional text to append to the Kinos API prompt (from --add-prompt).
        add_message: Optional text to append to the Kinos API prompt (from --addMessage).
        add_message_file_content: Optional text from a file to append to the Kinos API prompt (from --addMessageFile).
        
    Returns:
        A dictionary containing the citizen data, or None if generation failed
    """
    # Social class is now determined by the caller (e.g., immigration.py)
    # social_class = "Facchini" # This line is removed to respect the passed argument
    
    log.info(f"Generating a new citizen of social class: {social_class}")
    if additional_prompt_text:
        log.info(f"Additional prompt text: {additional_prompt_text}")
    
    # Get Kinos API key from environment
    kinos_api_key = os.environ.get('KINOS_API_KEY')
    if not kinos_api_key:
        log.error("KINOS_API_KEY environment variable is not set or empty after loading .env")
        return None
    else:
        # Log a portion of the key for verification, but not the whole thing for security
        key_length = len(kinos_api_key)
        log.info(f"KINOS_API_KEY loaded. Starts with: '{kinos_api_key[:4]}...', Ends with: '...{kinos_api_key[-4:]}', Length: {key_length}")
    
    try:
        # Create a prompt for the Kinos Engine
        prompt = f"Please create a single citizen of the {social_class} social class for our game. The citizen should have a historically accurate Venetian name, description, and characteristics appropriate for Renaissance Venice (1400-1600)."
        
        if additional_prompt_text:
            prompt += f"\n\n{additional_prompt_text}"
        
        if add_message:
            prompt += f"\n\n{add_message}"
        
        if add_message_file_content:
            prompt += f"\n\n{add_message_file_content}"
            
        # Call Kinos Engine API
        response = requests.post(
            "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/ConsiglioDeiDieci/channels/immigration/messages",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {kinos_api_key}"
            },
            json={
                "content": prompt,
                "model": "gemini-2.5-pro-preview-06-05",
                "mode": "creative",
                "addSystem": f"You are a historical expert on Renaissance Venice (1400-1600) helping to create a citizen for a historically accurate economic simulation game called La Serenissima. Create 1 unique Venetian citizen of the {social_class} social class with historically accurate name, description, and characteristics. Your response MUST be a valid JSON object with EXACTLY this format:\n\n```json\n{{\n  \"FirstName\": \"string\",\n  \"LastName\": \"string\",\n  \"Username\": \"string\",\n  \"Personality\": \"string\",\n  \"CorePersonality\": [\"Positive Trait\", \"Negative Trait\", \"Core Motivation\"],\n  \"ImagePrompt\": \"string\",\n  \"Ducats\": number\n}}\n```\n\nThe Username should be a realistic, human-like username that someone might choose based on their name or characteristics (like 'marco_polo' or 'gondolier42'). Make it lowercase with only letters, numbers and underscores. The CorePersonality should be an array of three strings: [Positive Trait, Negative Trait, Core Motivation], representing the citizen's strength (what they excel at), flaw (what limits them), and driver (what fundamentally motivates them). The Personality field should provide a textual description (2-3 sentences) elaborating on these three core traits, values, and temperament. Do not include any text before or after the JSON. The Ducats value should be between 10,000-100,000. Don't use the same names and tropes than the previous generations."
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Kinos Engine API: {response.status_code} {response.text}")
            return None
        
        # Extract the JSON from Kinos Engine's response
        # First, ensure the response body itself is valid JSON
        try:
            kinos_response_payload = response.json()
        except json.JSONDecodeError as e_json_body:
            log.error(f"Kinos API returned 200 OK, but response body is not valid JSON. Error: {e_json_body}")
            log.error(f"Response text (first 500 chars): {response.text[:500]}")
            return None

        content = kinos_response_payload.get("content", "")
        if not content: # If content is empty string or None
            log.error("Kinos API returned 200 OK, but 'content' field is missing or empty in the JSON response.")
            log.debug(f"Full Kinos response JSON: {kinos_response_payload}")
            return None
            
        log.info(f"Raw Kinos response content:\n{content}")

        # Check for known error patterns within the 'content' string itself
        # This handles cases where Kinos might return 200 OK but embed an error message in the content field
        if "Error code: 401" in content and "authentication_error" in content:
            log.error(f"Kinos 'content' field indicates an authentication error (API key issue?): {content}")
            log.error("Please check your KINOS_API_KEY environment variable.")
            return None
        elif content.startswith("I apologize, but there was an API error:"): # General Kinos apology
            log.error(f"Kinos 'content' field indicates a general API error: {content}")
            return None
        
        # Add another check: if the content IS a JSON string that represents an error object
        # This handles cases where 'content' might be "{\"type\": \"error\", ...}"
        try:
            potential_error_obj = json.loads(content)
            if isinstance(potential_error_obj, dict) and potential_error_obj.get("type") == "error":
                log.error(f"Kinos 'content' field is a JSON object representing an error: {content}")
                return None
        except json.JSONDecodeError:
            # This is expected if 'content' is the actual citizen data JSON string, 
            # or a non-JSON error message not caught by the specific string checks above.
            # Proceed to attempt parsing 'content' as citizen data.
            pass

        citizen_data = None
        json_str_to_parse = None # Variable to hold the string we attempt to parse

        try:
            # Attempt 1: Try to parse the entire content as JSON (which is 'content' string from Kinos response)
            log.info("Attempting to parse entire Kinos response as JSON...")
            json_str_to_parse = content
            citizen_data = json.loads(json_str_to_parse)
            log.info("Successfully parsed entire response.")
        except json.JSONDecodeError as e1:
            log.warning(f"Could not parse entire Kinos response as JSON: {e1}. Trying to extract from code block...")
            # Attempt 2: Extract JSON from a markdown code block ```json ... ```
            import re
            match = re.search(r"```json\s*([\s\S]*?)\s*```", content, re.IGNORECASE) # Added IGNORECASE
            if match:
                json_str_to_parse = match.group(1).strip()
                log.info(f"Extracted from code block:\n{json_str_to_parse}")
                try:
                    citizen_data = json.loads(json_str_to_parse)
                    log.info("Successfully parsed from code block.")
                except json.JSONDecodeError as e2:
                    log.warning(f"Could not parse JSON from code block: {e2}. Trying to find first {{ and last }}...")
                    # Attempt 3: Find the first '{' and last '}' in the original content
                    start_index = content.find('{')
                    end_index = content.rfind('}')
                    if start_index != -1 and end_index != -1 and start_index < end_index:
                        json_str_to_parse = content[start_index : end_index + 1]
                        log.info(f"Extracted from first {{ and last }} (original content):\n{json_str_to_parse}")
                        try:
                            citizen_data = json.loads(json_str_to_parse)
                            log.info("Successfully parsed from first {{ and last }} (original content).")
                        except json.JSONDecodeError as e3:
                            log.error(f"Failed to parse JSON even from first {{ and last }}: {e3}")
                            log.error(f"Problematic JSON string (from braces):\n{json_str_to_parse}")
                            return None
                    else:
                        log.error(f"Could not find JSON object markers ({{...}}) in Kinos response: {content}")
                        return None
            else:
                # Attempt 3 (if no code block): Find the first '{' and last '}' in the original content
                log.warning("No JSON code block found. Trying to find first {{ and last }} in original content...")
                start_index = content.find('{')
                end_index = content.rfind('}')
                if start_index != -1 and end_index != -1 and start_index < end_index:
                    json_str_to_parse = content[start_index : end_index + 1]
                    log.info(f"Extracted from first {{ and last }} (original content):\n{json_str_to_parse}")
                    try:
                        citizen_data = json.loads(json_str_to_parse)
                        log.info("Successfully parsed from first {{ and last }} (original content).")
                    except json.JSONDecodeError as e3:
                        log.error(f"Failed to parse JSON from first {{ and last }} (original content): {e3}")
                        log.error(f"Problematic JSON string (from braces, original content):\n{json_str_to_parse}")
                        return None
                else:
                    log.error(f"Could not find JSON object markers ({{...}}) in Kinos response (original content): {content}")
                    return None
        
        if not citizen_data: # Should not happen if one of the attempts succeeded or returned None
            log.error("JSON parsing failed through all attempts.")
            return None

        # Add required fields
        citizen_data["socialclass"] = social_class
        citizen_data["id"] = f"ctz_{int(time.time())}_{random.randint(1000, 9999)}"
        citizen_data["createdat"] = datetime.datetime.now().isoformat()
        citizen_data["isai"] = True # Set IsAI to True

        # Select random primary and secondary colors
        primary_color = random.choice(CITIZEN_COLORS)
        secondary_color = random.choice([c for c in CITIZEN_COLORS if c != primary_color])
        
        citizen_data["color"] = primary_color
        citizen_data["secondarycolor"] = secondary_color
        
        # Convert any capitalized keys to lowercase
        lowercase_data = {}
        for key, value in citizen_data.items():
            lowercase_data[key.lower()] = value
        
        citizen_data = lowercase_data
        
        # Find a unique username if the generated one is taken
        if 'username' in citizen_data:
            base_username = citizen_data['username'].lower()
            # Initialize Airtable tables if not already done
            tables = initialize_airtable()
            
            if tables:
                # Check if username exists and modify if needed
                current_username = base_username
                counter = 1
                
                while username_exists(tables, current_username):
                    log.info(f"Username '{current_username}' already exists, trying alternative")
                    current_username = f"{base_username}{counter}"
                    counter += 1
                
                # Update the username in citizen_data
                citizen_data['username'] = current_username
                log.info(f"Final username: {current_username}")
            else:
                log.warning("Could not check for username uniqueness, using generated username as-is")
        else:
            # If no username was generated, create one from first and last name
            first = citizen_data.get('firstname', '').lower()
            last = citizen_data.get('lastname', '').lower()
            if first and last:
                citizen_data['username'] = f"{first}_{last}"
                log.info(f"Created username from name: {citizen_data['username']}")
        
        log.info(f"Successfully generated citizen: {citizen_data['firstname']} {citizen_data['lastname']}")
        return citizen_data
    except Exception as e:
        log.error(f"Error generating citizen: {e}")
        return None

def generate_citizen_batch(social_classes: Dict[str, int], additional_prompt_text: Optional[str] = None, add_message: Optional[str] = None, add_message_file_content: Optional[str] = None) -> list:
    """Generate a batch of citizens based on specified social class distribution.
    
    Args:
        social_classes: Dictionary mapping social class names to counts.
        additional_prompt_text: Optional text to append to the Kinos API prompt for each citizen (from --add-prompt).
        add_message: Optional text to append to the Kinos API prompt for each citizen (from --addMessage).
        add_message_file_content: Optional text from a file to append to the Kinos API prompt for each citizen (from --addMessageFile).
        
    Returns:
        List of generated citizen dictionaries
    """
    citizens = []
    
    for social_class, count in social_classes.items():
        log.info(f"Generating {count} citizens of class {social_class}")
        
        for i in range(count):
            citizen = generate_citizen(social_class, additional_prompt_text, add_message, add_message_file_content)
            if citizen:
                citizens.append(citizen)
                # Add a small delay to avoid rate limiting
                time.sleep(1)
            else:
                log.warning(f"Failed to generate citizen {i+1} of class {social_class}")
    
    log.info(f"Successfully generated {len(citizens)} citizens")
    return citizens

if __name__ == "__main__":
    # This allows the module to be run directly for testing
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate citizens for La Serenissima")
    parser.add_argument("--nobili", type=int, default=0, help="Number of nobili to generate")
    parser.add_argument("--cittadini", type=int, default=0, help="Number of cittadini to generate")
    parser.add_argument("--popolani", type=int, default=0, help="Number of popolani to generate")
    parser.add_argument("--facchini", type=int, default=0, help="Number of facchini to generate")
    parser.add_argument("--forestieri", type=int, default=0, help="Number of forestieri to generate")
    parser.add_argument("--artisti", type=int, default=0, help="Number of artisti to generate")
    parser.add_argument("--output", type=str, help="Output JSON file path")
    parser.add_argument("--add-prompt", type=str, help="Additional text to append to the generation prompt for Kinos API.")
    parser.add_argument("--addMessage", type=str, help="Another message to append to the Kinos generation prompt.")
    parser.add_argument("--addMessageFile", type=str, help="Path to a file containing a message to append to the Kinos generation prompt.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate the script execution without making any changes to Airtable.")
    
    args = parser.parse_args()

    add_message_file_content_main = None
    if args.addMessageFile:
        try:
            with open(args.addMessageFile, 'r', encoding='utf-8') as f:
                add_message_file_content_main = f.read()
            log.info(f"Successfully read content from --addMessageFile: {args.addMessageFile}")
        except FileNotFoundError:
            log.error(f"File specified by --addMessageFile not found: {args.addMessageFile}")
            # Optionally, exit or handle as a critical error
            # sys.exit(1) 
        except Exception as e:
            log.error(f"Error reading file {args.addMessageFile}: {e}")
            # Optionally, exit or handle as a critical error
            # sys.exit(1)
            
    social_classes = {
        "Nobili": args.nobili,
        "Cittadini": args.cittadini,
        "Popolani": args.popolani,
        "Facchini": args.facchini,
        "Forestieri": args.forestieri,
        "Artisti": args.artisti
    }
    
    # Filter out classes with zero count
    social_classes = {k: v for k, v in social_classes.items() if v > 0}
    
    if not social_classes:
        # If no social classes were specified via arguments, default to generating one Facchini
        print("No social class specified via arguments, defaulting to generating 1 Facchini.")
        social_classes = {"Facchini": 1}

    # Generate citizens first
    log.info(f"Requesting generation for social classes: {social_classes}")
    citizens = generate_citizen_batch(
        social_classes,
        args.add_prompt,
        args.addMessage,
        add_message_file_content_main # Pass the read content
    )

    # Now, process the generated citizens (save to Airtable, etc.) if not a dry run and if citizens were actually generated
    if not args.dry_run and citizens:
        log.info(f"Successfully generated {len(citizens)} citizen(s). Attempting to save to Airtable, update profiles, and link repositories...")
        tables = initialize_airtable()
        if not tables:
            log.error("Could not initialize Airtable. Skipping save, update, and repo linking.")
        else:
            try:
                # Import the update function here to avoid circular dependencies if any,
                # and to ensure it's only imported when needed.
                from updatecitizenDescriptionAndImage import update_citizen_description_and_image
                # Import the repo linking function - assuming linkrepos.py is in the same directory
                from linkrepos import link_repo_for_citizen
                
                for citizen_data in citizens:
                    log.info(f"Processing citizen {citizen_data.get('username')} for Airtable save.")
                    
                    # Prepare payload for Airtable (map to PascalCase)
                    # 'personality' from Kinos maps to 'Description' in Airtable
                    # 'corepersonality' from Kinos maps to 'CorePersonality' (JSON string)
                    airtable_payload = {
                        "CitizenId": citizen_data.get("username"), # Use the username
                        "Username": citizen_data.get("username"),
                        "SocialClass": citizen_data.get("socialclass"), # Already 'Facchini'
                        "FirstName": citizen_data.get("firstname"),
                        "LastName": citizen_data.get("lastname"),
                        "Description": citizen_data.get("personality"), 
                        "CorePersonality": json.dumps(citizen_data.get("corepersonality", [])),
                        "ImagePrompt": citizen_data.get("imageprompt"),
                        "Ducats": citizen_data.get("ducats"),
                        "CreatedAt": citizen_data.get("createdat"),
                        "IsAI": citizen_data.get("isai", True), # Set IsAI
                        "Color": citizen_data.get("color"), # Add Color
                        "SecondaryColor": citizen_data.get("secondarycolor"), # Add SecondaryColor
                        "InVenice": True # Citizens generated by this script are in Venice by default
                        # FamilyMotto and CoatOfArms will be generated by updatecitizenDescriptionAndImage
                    }

                    # Get and set a random position within Venice
                    random_position = _get_random_venice_position()
                    if random_position:
                        airtable_payload["Position"] = json.dumps(random_position)
                    else:
                        log.warning(f"Could not set random position for citizen {citizen_data.get('username')}.")
                    
                    try:
                        created_record = tables['citizens'].create(airtable_payload)
                        log.info(f"Successfully saved citizen {citizen_data.get('username')} to Airtable. Record ID: {created_record.get('id')}")
                        
                        # Attempt to have the newly created citizen join a guild
                        citizen_username_for_guild = citizen_data.get('username')
                        if citizen_username_for_guild:
                            log.info(f"Attempting guild joining process for new citizen: {citizen_username_for_guild}")
                            try:
                                process_ai_guild_joining(dry_run=args.dry_run, target_username=citizen_username_for_guild)
                                log.info(f"Guild joining process completed for {citizen_username_for_guild}.")
                            except Exception as e_guild:
                                log.error(f"Error during guild joining for {citizen_username_for_guild}: {e_guild}")
                        else:
                            log.warning("Cannot attempt guild joining, username not found in citizen_data.")

                        # Now call update_citizen_description_and_image
                        log.info(f"Attempting to update description and image for {citizen_data.get('username')}")
                        update_success = update_citizen_description_and_image(username=citizen_data.get('username'), dry_run=args.dry_run)
                        if update_success:
                            log.info(f"Successfully initiated update for description and image for {citizen_data.get('username')}.")
                        else:
                            log.warning(f"Failed to initiate update for description and image for {citizen_data.get('username')}.")

                        # After successful save and profile update initiation, link the repo
                        if citizen_data.get('username'):
                            log.info(f"Attempting to link repository for citizen: {citizen_data.get('username')}")
                            if link_repo_for_citizen(citizen_data.get('username')):
                                log.info(f"Repository linking process successful for {citizen_data.get('username')}.")
                            else:
                                log.warning(f"Repository linking process failed or was skipped for {citizen_data.get('username')}.")
                        else:
                            log.warning("Cannot link repository, username not found after saving citizen.")
                            
                    except Exception as e_save:
                        log.error(f"Failed to save citizen {citizen_data.get('username')} to Airtable: {e_save}")
                        
            except ImportError as e_import:
                log.error(f"Could not import a required module ('updatecitizenDescriptionAndImage' or '.linkrepos'). Make sure the scripts are accessible: {e_import}")
            except Exception as e_main_process:
                log.error(f"An error occurred during Airtable save, profile update, or repo linking process: {e_main_process}")
    elif args.dry_run:
        log.info("[DRY RUN] Simulation mode. Skipping Airtable save, profile update, and repository linking.")
        if citizens:
            log.info(f"[DRY RUN] Successfully generated {len(citizens)} citizen(s):")
            for c_idx, c_data in enumerate(citizens):
                log.info(f"[DRY RUN] Citizen {c_idx+1}: Username: {c_data.get('username', 'N/A')}, Name: {c_data.get('firstname', '')} {c_data.get('lastname', '')}")
        else:
            log.info("[DRY RUN] No citizens were generated by Kinos API, or the response was unparsable.")
    elif not citizens: # This condition means citizens list is empty AFTER attempting generation
        log.warning("The 'citizens' list is empty AFTER attempting generation. This usually means Kinos API failed to generate valid citizen data or the response could not be parsed. No Airtable operations will be performed.")
