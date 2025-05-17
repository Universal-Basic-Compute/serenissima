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
            'citizens': Table(api_key, base_id, 'CITIZENS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def fetch_citizens_needing_images(tables) -> List[Dict]:
    """Fetch citizens from Airtable that need images."""
    log.info("Fetching citizens from Airtable that need images...")
    
    try:
        # Get citizens without an ImageUrl field or with empty ImageUrl field
        formula = "OR({ImageUrl} = '', {ImageUrl} = BLANK())"
        citizens = tables['citizens'].all(formula=formula)
        
        log.info(f"Found {len(citizens)} citizens needing images")
        return citizens
    except Exception as e:
        log.error(f"Error fetching citizens needing images: {e}")
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
    
    # Add photorealistic quality directive
    enhanced_prompt += " Photorealistic quality, highly detailed facial features, historically accurate."
    
    return enhanced_prompt

def update_airtable_image_url(tables, citizen_id: str, image_url: str) -> bool:
    """Update Airtable with image URL."""
    log.info(f"Updating Airtable record for citizen {citizen_id} with image URL: {image_url}")
    
    try:
        # Update the record with the new image URL
        tables['citizens'].update(citizen_id, {
            "ImageUrl": image_url
        })
        
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

def process_citizen(tables, citizen: Dict) -> bool:
    """Process a single citizen to generate an image."""
    citizen_id = citizen['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Processing citizen: {citizen_name} (ID: {citizen_id})")
    
    # Get the image prompt
    image_prompt = citizen['fields'].get('ImagePrompt', '')
    if not image_prompt:
        log.warning(f"No image prompt for citizen {citizen_id}")
        return False
    
    # Enhance the prompt
    enhanced_prompt = enhance_image_prompt(citizen)
    
    # Generate the image
    image_url = generate_image(enhanced_prompt, citizen_id)
    if not image_url:
        log.warning(f"Failed to generate image for citizen {citizen_id}")
        return False
    
    # Update Airtable with the image URL
    success = update_airtable_image_url(tables, citizen_id, image_url)
    
    return success

def process_specific_citizen(tables, citizen_id: str, image_prompt: str) -> bool:
    """Process a specific citizen with the given ID and prompt."""
    log.info(f"Processing specific citizen: {citizen_id}")
    
    if not image_prompt:
        log.warning(f"No image prompt provided for citizen {citizen_id}")
        return False
    
    # Generate the image
    image_url = generate_image(image_prompt, citizen_id)
    if not image_url:
        log.warning(f"Failed to generate image for citizen {citizen_id}")
        return False
    
    # Update Airtable with the image URL
    success = update_airtable_image_url(tables, citizen_id, image_url)
    
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
                
                success = process_specific_citizen(tables, citizen_id, citizen_data.get('imagePrompt', ''))
                log.info(f"Processed citizen {citizen_id} with result: {'success' if success else 'failed'}")
                return
            except Exception as e:
                log.error(f"Error processing citizen from temp file: {e}")
        
        log.error(f"No temp file found for citizen {citizen_id}")
        return
    
    # Normal flow - fetch citizens from Airtable
    citizens = fetch_citizens_needing_images(tables)
    
    if not citizens:
        log.info("No citizens found that need images. Exiting.")
        return
    
    log.info(f"Found {len(citizens)} citizens that need images")
    
    updated_count = 0
    processed_count = 0
    
    for i, citizen in enumerate(citizens):
        # Stop if we've reached the limit (if specified)
        if limit > 0 and processed_count >= limit:
            log.info(f"Reached limit of {limit} images, stopping.")
            break
        
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        log.info(f"Generating image for citizen {i+1}/{len(citizens)}: {citizen_name}")
        
        success = process_citizen(tables, citizen)
        
        if success:
            updated_count += 1
        
        processed_count += 1
        
        # Add a delay to avoid rate limiting
        time.sleep(3)
    
    log.info(f"Generated images for {updated_count} citizens out of {processed_count} processed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate images for citizens")
    parser.add_argument("limit", nargs="?", type=int, default=0, help="Maximum number of images to generate (0 for unlimited)")
    parser.add_argument("--citizen-id", help="Generate image for a specific citizen ID")
    
    args = parser.parse_args()
    
    generate_citizen_images(args.limit)
