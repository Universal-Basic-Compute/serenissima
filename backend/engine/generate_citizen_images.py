#!/usr/bin/env python3
"""
Generate images for citizens using the Ideogram API.

This script:
1. Fetches citizens from Airtable that need images
2. Generates images using the Ideogram API
3. Saves the images to the public/images/citizens directory
4. Updates the citizen records in Airtable with the image URLs

It can be run directly or imported and used by other scripts.
"""

import os
import sys
import logging
import argparse
import json
import time
import requests
import subprocess
import re
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("generate_citizen_images")

# Load environment variables
load_dotenv()

# Constants
CITIZENS_IMAGE_DIR = os.path.join(os.getcwd(), 'public', 'images', 'citizens')
COAT_OF_ARMS_DIR = os.path.join(os.getcwd(), 'public', 'coat-of-arms')

# Ensure the images directory exists
os.makedirs(CITIZENS_IMAGE_DIR, exist_ok=True)
# Ensure the coat of arms directory exists
os.makedirs(COAT_OF_ARMS_DIR, exist_ok=True)

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
            'citizens': Table(api_key, base_id, 'CITIZENS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def fetch_citizens_needing_images(tables) -> List[Dict]:
    """Fetch citizens from Airtable that need images or coat of arms."""
    log.info("Fetching citizens from Airtable that need images or coat of arms...")
    
    try:
        # Get citizens without an ImageUrl field or with empty ImageUrl field
        # OR citizens with CoatOfArms but no CoatOfArmsImageUrl
        formula = "OR(OR({ImageUrl} = '', {ImageUrl} = BLANK()), AND(NOT({CoatOfArms} = ''), OR({CoatOfArmsImageUrl} = '', {CoatOfArmsImageUrl} = BLANK())))"
        citizens = tables['citizens'].all(formula=formula)
        
        log.info(f"Found {len(citizens)} citizens needing images or coat of arms")
        return citizens
    except Exception as e:
        log.error(f"Error fetching citizens needing images or coat of arms: {e}")
        return []

def enhance_image_prompt(citizen: Dict) -> str:
    """Enhance image prompt with style guidelines based on social class."""
    base_prompt = citizen['fields'].get('ImagePrompt', '')
    
    # Add style guidelines based on social class
    social_class = citizen['fields'].get('SocialClass', '')
    
    style_addition = ''
    
    if social_class == 'Nobili':
        style_addition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with Rembrandt lighting. Rich color palette with deep reds and gold tones. Ornate clothing with fine details. Aristocratic bearing and confident expression. Venetian palazzo background with marble columns.'
    elif social_class == 'Cittadini':
        style_addition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with warm Rembrandt lighting. Warm amber tones. Quality clothing with some decorative elements. Intelligent and dignified expression. Venetian merchant office or study background.'
    elif social_class == 'Popolani':
        style_addition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with directional lighting. Muted earth tones. Practical, well-made clothing. Hardworking and capable expression. Workshop or marketplace background with tools of their trade.'
    elif social_class in ['Facchini', 'Laborer']:
        style_addition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with natural lighting. Subdued color palette. Simple, functional clothing. Weather-worn features with determined expression. Venetian docks or working environment background.'
    else:
        style_addition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with balanced lighting. Clothing and setting appropriate to their profession in Renaissance Venice.'
    
    # Add citizen's name and profession if available
    first_name = citizen['fields'].get('FirstName', '')
    last_name = citizen['fields'].get('LastName', '')
    
    # Combine original prompt with style guidelines
    enhanced_prompt = f"{base_prompt} {style_addition}"
    
    # Add quality directive: colored illustration style
    enhanced_prompt += " Detailed colored illustration style, highly detailed facial features, historically accurate."
    
    return enhanced_prompt

def update_airtable_image_url(tables, citizen_id: str, image_url: str, coat_of_arms_url: Optional[str] = None) -> bool:
    """Update Airtable with image URL and coat of arms URL if provided."""
    log.info(f"Updating Airtable record for citizen {citizen_id} with image URL: {image_url}")
    
    try:
        # Prepare update data
        update_data = {"ImageUrl": image_url}
        
        # Add coat of arms URL if provided
        if coat_of_arms_url:
            update_data["CoatOfArmsImageUrl"] = coat_of_arms_url
            log.info(f"Also updating coat of arms image URL: {coat_of_arms_url}")
        
        # Update the record
        tables['citizens'].update(citizen_id, update_data)
        
        log.info(f"Successfully updated Airtable record for citizen {citizen_id}")
        return True
    except Exception as e:
        log.error(f"Error updating Airtable record for citizen {citizen_id}: {e}")
        return False

def generate_image(prompt: str, citizen_id: str) -> Optional[str]:
    """Generate image using Ideogram API."""
    log.info(f"Sending prompt to Ideogram API: {prompt[:100]}...")
    
    # Get Ideogram API key from environment
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None
    
    try:
        # Call the Ideogram API
        response = requests.post(
            "https://api.ideogram.ai/v1/ideogram-v3/generate",
            headers={
                "Api-Key": ideogram_api_key,
                "Content-Type": "application/json"
            },
            json={
                "prompt": prompt,
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

def generate_coat_of_arms_image(description: str, username: str) -> Optional[str]:
    """Generate coat of arms image using Ideogram API."""
    if not description:
        log.warning(f"No coat of arms description for {username}")
        return None
        
    log.info(f"Generating coat of arms for {username}: {description[:100]}...")
    
    # Get Ideogram API key from environment
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None
    
    # Enhance the prompt for better coat of arms generation
    enhanced_prompt = f"A heraldic coat of arms shield with the following description: {description}. Renaissance Venetian style, detailed, ornate, historically accurate, centered composition, on a transparent background."
    
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
        
        # Save the image to the coat of arms folder using the username
        image_path = os.path.join(COAT_OF_ARMS_DIR, f"{username}.png")
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

def process_citizen(tables, citizen: Dict) -> bool:
    """Process a single citizen to generate an image and coat of arms."""
    citizen_id = citizen['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Processing citizen: {citizen_name} (ID: {citizen_id})")
    
    # Get the image prompt
    image_prompt = citizen['fields'].get('ImagePrompt', '')
    
    # If no image prompt is available, call updatecitizenDescriptionAndImage.py
    if not image_prompt:
        log.info(f"No image prompt for citizen {citizen_id}, calling updatecitizenDescriptionAndImage.py")
        
        try:
            # Get the citizen's username
            citizen_username = citizen['fields'].get('Username', citizen_id)
            
            # Get the path to the updatecitizenDescriptionAndImage.py script
            script_dir = os.path.dirname(os.path.abspath(__file__))
            update_script_path = os.path.join(script_dir, "..", "scripts", "updatecitizenDescriptionAndImage.py")
            
            if not os.path.exists(update_script_path):
                log.error(f"Update script not found at: {update_script_path}")
                return False
            
            # Call the script to generate description and image
            result = subprocess.run(
                [sys.executable, update_script_path, citizen_username],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                log.error(f"Error running updatecitizenDescriptionAndImage.py: {result.stderr}")
                return False
            
            log.info(f"Successfully generated description and image for citizen {citizen_username}")
            return True
        except Exception as e:
            log.error(f"Error calling updatecitizenDescriptionAndImage.py: {e}")
            return False
    
    # If we have an image prompt, continue with the normal flow
    # Enhance the prompt
    enhanced_prompt = enhance_image_prompt(citizen)
    
    # Get the citizen's username
    citizen_username = citizen['fields'].get('Username', citizen_id)
    
    # Generate the image
    image_url = generate_image(enhanced_prompt, citizen_username)
    if not image_url:
        log.warning(f"Failed to generate image for citizen {citizen_username}")
        return False
    
    # Check if we need to generate a coat of arms
    coat_of_arms_description = citizen['fields'].get('CoatOfArms', '')
    coat_of_arms_url = None
    
    if coat_of_arms_description:
        coat_of_arms_url = generate_coat_of_arms_image(coat_of_arms_description, citizen_username)
        if not coat_of_arms_url:
            log.warning(f"Failed to generate coat of arms for citizen {citizen_username}")
            # Continue anyway, as we still have the portrait image
    
    # Update Airtable with the image URL and coat of arms URL
    success = update_airtable_image_url(tables, citizen_id, image_url, coat_of_arms_url)
    
    return success

def process_specific_citizen(tables, citizen_id: str, image_prompt: str, coat_of_arms_description: str = None) -> bool:
    """Process a specific citizen with the given ID, prompt, and coat of arms description."""
    log.info(f"Processing specific citizen: {citizen_id}")
    
    if not image_prompt:
        log.warning(f"No image prompt provided for citizen {citizen_id}")
        return False
    
    # Generate the image - citizen_id should be the username here
    image_url = generate_image(image_prompt, citizen_id)
    if not image_url:
        log.warning(f"Failed to generate image for citizen {citizen_id}")
        return False
    
    # Generate coat of arms if description is provided
    coat_of_arms_url = None
    if coat_of_arms_description:
        coat_of_arms_url = generate_coat_of_arms_image(coat_of_arms_description, citizen_id)
        if not coat_of_arms_url:
            log.warning(f"Failed to generate coat of arms for citizen {citizen_id}")
            # Continue anyway, as we still have the portrait image
    
    # Update Airtable with the image URL and coat of arms URL
    success = update_airtable_image_url(tables, citizen_id, image_url, coat_of_arms_url)
    
    return success

def generate_citizen_images(limit: int = 0):
    """Generate images for citizens that need them."""
    tables = initialize_airtable()
    
    # Check if we're processing a specific citizen from command line
    if len(sys.argv) > 2 and sys.argv[1] == '--citizen-id':
        citizen_id = sys.argv[2]
        
        # Check if we have a temp file with citizen data
        if os.path.exists('temp_citizen_image.json'):
            try:
                with open('temp_citizen_image.json', 'r') as f:
                    citizen_data = json.load(f)
                
                success = process_specific_citizen(
                    tables, 
                    citizen_id, 
                    citizen_data.get('imagePrompt', ''),
                    citizen_data.get('coatOfArms', '')
                )
                log.info(f"Processed citizen {citizen_id} with result: {'success' if success else 'failed'}")
                return
            except Exception as e:
                log.error(f"Error processing citizen from temp file: {e}")
        
        log.error(f"No temp file found for citizen {citizen_id}")
        return
    
    # Normal flow - fetch citizens from Airtable
    citizens = fetch_citizens_needing_images(tables)
    
    if not citizens:
        log.info("No citizens found that need images or coat of arms. Exiting.")
        return
    
    log.info(f"Found {len(citizens)} citizens that need images or coat of arms")
    
    updated_count = 0
    processed_count = 0
    
    for i, citizen in enumerate(citizens):
        # Stop if we've reached the limit (if specified)
        if limit > 0 and processed_count >= limit:
            log.info(f"Reached limit of {limit} images, stopping.")
            break
        
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        log.info(f"Processing citizen {i+1}/{len(citizens)}: {citizen_name}")
        
        success = process_citizen(tables, citizen)
        
        if success:
            updated_count += 1
        
        processed_count += 1
        
        # Add a delay to avoid rate limiting
        time.sleep(3)
    
    log.info(f"Processed {updated_count} citizens out of {processed_count} processed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate images for citizens")
    parser.add_argument("limit", nargs="?", type=int, default=0, help="Maximum number of images to generate (0 for unlimited)")
    parser.add_argument("--citizen-id", help="Generate image for a specific citizen ID")
    
    args = parser.parse_args()
    
    generate_citizen_images(args.limit)
