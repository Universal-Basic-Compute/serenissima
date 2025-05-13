#!/usr/bin/env python3
"""
Generate images for buildings using the Ideogram API.

This script:
1. Scans the data/buildings directory and subfolders for building JSON files
2. Generates images using the Ideogram API based on building descriptions
3. Saves the images to the public/images/buildings directory
4. Organizes images by building category and subcategory
"""

import os
import sys
import logging
import argparse
import json
import time
import requests
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv
from pathlib import Path

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("generate_building_images")

# Load environment variables
load_dotenv()

# Constants
BUILDINGS_DATA_DIR = os.path.join(os.getcwd(), 'data', 'buildings')
BUILDINGS_IMAGE_DIR = os.path.join(os.getcwd(), 'public', 'images', 'buildings')

def scan_building_files() -> List[Dict[str, Any]]:
    """Scan the buildings directory for JSON files and load their contents."""
    log.info(f"Scanning for building files in {BUILDINGS_DATA_DIR}")
    
    buildings = []
    
    # Walk through all subdirectories
    for root, dirs, files in os.walk(BUILDINGS_DATA_DIR):
        for file in files:
            if file.endswith('.json'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, BUILDINGS_DATA_DIR)
                
                # Skip index files and other non-building files in the root directory
                if os.path.dirname(relative_path) == '' and file.lower() in ['index.json', 'readme.json', 'metadata.json']:
                    log.info(f"Skipping non-building file: {file}")
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        building_data = json.load(f)
                    
                    # Validate that this is actually a building file
                    if not isinstance(building_data, dict):
                        log.warning(f"Skipping {file_path}: Not a valid building JSON object")
                        continue
                    
                    # Skip files that don't have a name or type - likely not buildings
                    if 'name' not in building_data and 'type' not in building_data:
                        log.warning(f"Skipping {file_path}: Not a building (missing name and type)")
                        continue
                    
                    # Add file path information
                    building_data['_file_path'] = file_path
                    building_data['_relative_path'] = relative_path
                    building_data['_file_name'] = file
                    
                    # Extract category and subcategory from path
                    path_parts = relative_path.split(os.sep)
                    
                    # Only process files that are in a category directory
                    if len(path_parts) >= 2:
                        building_data['_category_dir'] = path_parts[0]
                        building_data['_subcategory_dir'] = path_parts[1] if len(path_parts) > 2 else None
                    else:
                        # Skip files in the root directory - they're not properly categorized buildings
                        log.warning(f"Skipping {file_path}: Not in a category directory")
                        continue
                    
                    # Ensure the building has at least a name
                    if 'name' not in building_data:
                        # Use the filename as the name
                        building_data['name'] = os.path.splitext(file)[0].replace('_', ' ').title()
                        log.warning(f"Building in {file_path} has no name, using filename: {building_data['name']}")
                    
                    buildings.append(building_data)
                    log.info(f"Loaded building: {building_data.get('name', file)} from {relative_path}")
                except json.JSONDecodeError as e:
                    log.error(f"Error parsing JSON in {file_path}: {e}")
                except Exception as e:
                    log.error(f"Error loading building file {file_path}: {e}")
    
    log.info(f"Found {len(buildings)} building files")
    return buildings

def create_image_prompt(building: Dict[str, Any]) -> str:
    """Create a detailed prompt for image generation based on building data."""
    # Extract key information
    name = building.get('name', 'Unknown Building')
    category = building.get('category', building.get('_category_dir', 'Unknown'))
    subcategory = building.get('subcategory', building.get('_subcategory_dir', ''))
    description = building.get('fullDescription', building.get('shortDescription', ''))
    completed_prompt = building.get('completedBuilding3DPrompt', '')
    
    # Create a base prompt
    base_prompt = f"A realistic detailed illustration of a {name}, a {category} building in 15th century Venice."
    
    # If we have minimal information, add some generic details based on the name
    if not description and not completed_prompt:
        base_prompt += f" This is a historical Venetian {name.lower()} with characteristic Renaissance architecture."
        base_prompt += " The building features typical Venetian Gothic elements like pointed arches, ornate windows, and decorative facades."
        base_prompt += " It stands along a canal with gondolas nearby, surrounded by other period-appropriate structures."
    
    # Add subcategory if available
    if subcategory:
        base_prompt += f" This is part of the {subcategory} subcategory."
    
    # Add description if available
    if description:
        base_prompt += f" {description}"
    
    # Add the 3D prompt if available
    if completed_prompt:
        base_prompt += f" {completed_prompt}"
    
    # Add style guidelines
    style_guidelines = (
        "Realistic Renaissance architectural style with historically accurate details. "
        "Venetian Gothic architectural elements with Byzantine influences. "
        "Natural lighting with warm Mediterranean sunlight. "
        "Include characteristic Venetian elements like canals, bridges, or gondolas where appropriate. "
        "Rich, warm color palette with terracotta, ochre, and Venetian red tones. "
        "Detailed textures showing weathered stone, brick, and plaster. "
        "Square format image with clear visibility of the building. "
        "--ar 1:1"
    )
    
    # Combine everything
    full_prompt = f"{base_prompt} {style_guidelines}"
    
    return full_prompt

def generate_image(prompt: str, output_path: str) -> bool:
    """Generate image using Ideogram API and save to the specified path."""
    log.info(f"Generating image for: {output_path}")
    log.debug(f"Using prompt: {prompt[:100]}...")
    
    # Get Ideogram API key from environment
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return False
    
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
                "rendering_speed": "DEFAULT"
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API: {response.status_code} {response.text}")
            return False
        
        # Extract image URL from response
        result = response.json()
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            log.error("No image URL in response")
            return False
        
        # Download the image
        image_response = requests.get(image_url, stream=True)
        if not image_response.ok:
            log.error(f"Failed to download image: {image_response.status_code} {image_response.reason}")
            return False
        
        # Ensure the directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save the image
        with open(output_path, 'wb') as f:
            for chunk in image_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        log.info(f"Successfully saved image to {output_path}")
        return True
    except Exception as e:
        log.error(f"Error generating image: {e}")
        return False

def process_building(building: Dict[str, Any], force_regenerate: bool = False) -> bool:
    """Process a single building to generate its image."""
    # Extract building information
    name = building.get('name', 'unknown')
    category = building.get('category', building.get('_category_dir', 'unknown')).lower()
    subcategory = building.get('subcategory', building.get('_subcategory_dir', '')).lower()
    
    # Create a safe filename from the building name
    safe_name = name.lower().replace(' ', '_').replace("'", '').replace('"', '')
    
    # Determine the output directory structure
    # Always use category/subcategory structure
    if subcategory:
        output_dir = os.path.join(BUILDINGS_IMAGE_DIR, category, subcategory)
    else:
        # If no subcategory, use just the category
        output_dir = os.path.join(BUILDINGS_IMAGE_DIR, category)
    
    # Create the output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Determine the output file path
    output_path = os.path.join(output_dir, f"{safe_name}.jpg")
    
    # Check if the image already exists
    if os.path.exists(output_path) and not force_regenerate:
        log.info(f"Image already exists for {name}, skipping. Use --force to regenerate.")
        return True
    
    # Create the prompt
    prompt = create_image_prompt(building)
    
    # Generate the image
    success = generate_image(prompt, output_path)
    
    # Also save a copy with the building ID if available
    building_id = building.get('id')
    if building_id and success:
        id_output_path = os.path.join(BUILDINGS_IMAGE_DIR, f"{building_id}.jpg")
        try:
            # Copy the file
            with open(output_path, 'rb') as src, open(id_output_path, 'wb') as dst:
                dst.write(src.read())
            log.info(f"Created ID-based copy at {id_output_path}")
        except Exception as e:
            log.error(f"Error creating ID-based copy: {e}")
    
    return success

def main():
    """Main function to generate building images."""
    parser = argparse.ArgumentParser(description="Generate images for buildings")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of images to generate (0 for unlimited)")
    parser.add_argument("--force", action="store_true", help="Force regeneration of existing images")
    parser.add_argument("--category", help="Only process buildings in this category")
    parser.add_argument("--subcategory", help="Only process buildings in this subcategory")
    parser.add_argument("--building", help="Only process a specific building by name")
    
    args = parser.parse_args()
    
    # Ensure the base output directory exists
    os.makedirs(BUILDINGS_IMAGE_DIR, exist_ok=True)
    
    # Scan for building files
    buildings = scan_building_files()
    
    if not buildings:
        log.error("No building files found. Exiting.")
        return
    
    # Filter buildings based on command-line arguments
    if args.category:
        category_lower = args.category.lower()
        buildings = [b for b in buildings if 
                    b.get('category', '').lower() == category_lower or 
                    b.get('_category_dir', '').lower() == category_lower]
        log.info(f"Filtered to {len(buildings)} buildings in category '{args.category}'")
    
    if args.subcategory:
        subcategory_lower = args.subcategory.lower()
        buildings = [b for b in buildings if 
                    b.get('subcategory', '').lower() == subcategory_lower or 
                    b.get('_subcategory_dir', '').lower() == subcategory_lower]
        log.info(f"Filtered to {len(buildings)} buildings in subcategory '{args.subcategory}'")
    
    if args.building:
        building_name_lower = args.building.lower()
        buildings = [b for b in buildings if b.get('name', '').lower() == building_name_lower]
        log.info(f"Filtered to {len(buildings)} buildings with name '{args.building}'")
    
    if not buildings:
        log.error("No buildings match the specified filters. Exiting.")
        return
    
    # Process buildings
    processed_count = 0
    success_count = 0
    
    for building in buildings:
        # Check if we've reached the limit
        if args.limit > 0 and processed_count >= args.limit:
            log.info(f"Reached limit of {args.limit} images. Stopping.")
            break
        
        name = building.get('name', f"Building {processed_count+1}")
        log.info(f"Processing building {processed_count+1}/{len(buildings)}: {name}")
        
        # Process the building
        success = process_building(building, args.force)
        
        if success:
            success_count += 1
        
        processed_count += 1
        
        # Add a delay to avoid rate limiting
        if processed_count < len(buildings) and processed_count < args.limit:
            time.sleep(3)
    
    log.info(f"Generated {success_count} images out of {processed_count} processed buildings")

if __name__ == "__main__":
    main()
