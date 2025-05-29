#!/usr/bin/env python3
"""
Generate images for buildings using the Ideogram API.

This script:
1. Scans the data/buildings directory and subfolders for building JSON files
2. Generates images using the Ideogram API based on building descriptions
3. Saves the images to the public/images/buildings directory
4. Organizes images by building category and subCategory
"""

import os
import sys
import logging
import argparse
import json
import time
import requests
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse
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


def _fetch_prompt_from_kinos(building_data: Dict[str, Any]) -> Optional[str]:
    """
    Fetches a pre-generated or dynamically generated prompt from the Kinos service
    by sending a detailed message to a Kin.
    """
    # Kinos API configuration
    kinos_api_key = os.environ.get("KINOS_API_KEY")
    if not kinos_api_key:
        log.warning("KINOS_API_KEY not set. Cannot fetch prompt from Kinos.")
        return None

    kinos_api_base_url = os.environ.get("KINOS_API_BASE_URL", "https://api.kinos-engine.ai/v2")
    kinos_blueprint_id = os.environ.get("KINOS_BLUEPRINT_ID", "serenissima")
    kinos_kin_id = os.environ.get("KINOS_KIN_ID_PROMPT_GENERATION", "ConsiglioDeiDieci")
    kinos_channel_id = os.environ.get("KINOS_CHANNEL_ID_BUILDING_IMAGES", "ConsiglioDeiDieci_building_images")

    kinos_api_url = f"{kinos_api_base_url}/blueprints/{kinos_blueprint_id}/kins/{kinos_kin_id}/messages"

    # Construct the 'content' for the Kinos message
    content_lines = [
        "Please generate an Ideogram prompt for an image of a 15th-century Venetian building with the following details:",
        f"- Name: {building_data.get('name', 'N/A')}",
        f"- Category: {building_data.get('category', 'N/A')}",
    ]
    if building_data.get('subCategory'):
        content_lines.append(f"- SubCategory: {building_data.get('subCategory')}")
    if building_data.get('description'):
        content_lines.append(f"- Description: {building_data.get('description')}")
    if building_data.get('completed_building_3d_prompt'):
        content_lines.append(f"- Specific 3D Prompt Elements: {building_data.get('completed_building_3d_prompt')}")
    # The 'base_descriptive_prompt' is a summary and might be redundant if other fields are detailed enough.
    # Including it for completeness, Kinos can decide if it's useful.
    content_lines.append(f"- Base Descriptive Summary: {building_data.get('base_descriptive_prompt', 'N/A')}")
    content_lines.append("\nEnsure the generated Ideogram prompt follows the system instructions to create a visually distinct and UX-friendly image.")
    kinos_message_content = "\n".join(content_lines)

    # Construct the 'addSystem' instructions for Kinos
    add_system_instructions = """
You are an expert prompt engineer for the Ideogram image generation service.
Your task is to generate a concise, effective, and descriptive Ideogram prompt based on the provided building details.
The Ideogram prompt should:
1. Start with a clear subject, e.g., "A detailed colored illustration of a [Building Name], a [Category] building..."
2. Incorporate key architectural details from the 15th-century Venetian context.
3. Emphasize visual distinctiveness and a clear silhouette for game asset identification.
4. Specify "Detailed colored illustration style". Include "historically accurate details" and "natural lighting with warm Mediterranean sunlight". Textures should be "stylized yet recognizable (weathered stone, brick, plaster)" rather than strictly photorealistic.
5. Specify "Square format image" and always include "--ar 1:1".
6. If "Specific 3D Prompt Elements" are provided in the details, integrate their essence while maintaining overall stylistic consistency for UX, favoring the illustration style.
7. Tailor descriptive words and color palettes based on the building's category and name (e.g., residential, commercial, industrial, civic), fitting an illustrative style.
    - Residential: Venetian Gothic, ornate windows, balconies. Palazzos: grand facade, marble. Modest homes: terracotta, ochre.
    - Commercial: Functional, identifiable. Workshops: signs of craft, earthy tones. Markets: open-air, vibrant awnings. Warehouses: sturdy, practical, muted colors. Taverns: welcoming, warm wood.
    - Industrial: Robust, functional. Shipyards: slipways, timber. Furnaces: chimneys, glowing light, utilitarian greys.
    - Civic/Religious: Impressive, prominent. Churches: iconography, bell tower, Istrian stone, mosaics. Government: formal, imposing, symbols of state.
    - Infrastructure: Bridges: stone/wood, arch design. Docks: wooden/stone, mooring posts. Wells: ornate wellhead.
8. Ensure the Venetian setting is clear, mentioning canals or campos if not implied by the category.
9. The final Ideogram prompt should be a single, coherent paragraph.
Do not include any conversational preamble or postamble in your response. Only output the generated Ideogram prompt.
"""

    payload = {
        "content": kinos_message_content,
        "addSystem": add_system_instructions.strip(),
        "channel_id": kinos_channel_id,
        "history_length": 0 # No history needed for this type of direct prompt generation request
    }

    headers = {
        "Authorization": f"Bearer {kinos_api_key}",
        "Content-Type": "application/json"
    }

    try:
        log.info(f"Sending message to Kinos ({kinos_kin_id}) for {building_data.get('name')} at {kinos_api_url}")
        log.debug(f"Kinos payload: {json.dumps(payload, indent=2)}")
        response = requests.post(kinos_api_url, json=payload, headers=headers, timeout=30) # Increased timeout
        response.raise_for_status()  # Raise HTTPError for bad responses (4XX or 5XX)
        
        response_data = response.json()
        # The Kinos message response has "content" which should be the Ideogram prompt
        generated_prompt = response_data.get("content")

        if generated_prompt and isinstance(generated_prompt, str):
            log.info(f"Successfully received Ideogram prompt from Kinos for {building_data.get('name')}")
            return generated_prompt.strip()
        else:
            log.error(f"Kinos message response did not contain a valid 'content' string for {building_data.get('name')}. Response: {response_data}")
            return None
    except requests.exceptions.Timeout:
        log.error(f"Timeout calling Kinos API for {building_data.get('name')} at {kinos_api_url}")
        return None
    except requests.exceptions.RequestException as e:
        log.error(f"Error calling Kinos API for {building_data.get('name')} ({kinos_api_url}): {e}")
        return None
    except json.JSONDecodeError as e:
        log.error(f"Error decoding JSON response from Kinos for {building_data.get('name')}: {e}. Response text: {response.text[:500]}")
        return None
    except Exception as e:
        log.error(f"Unexpected error processing Kinos response for {building_data.get('name')}: {e}")
        return None

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
                    
                    # Extract type from filename if not present
                    if 'type' not in building_data:
                        building_data['type'] = os.path.splitext(file)[0]
                    
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
    subCategory = building.get('subCategory', building.get('_subCategory_dir', ''))
    description = building.get('fullDescription', building.get('shortDescription', ''))
    completed_prompt = building.get('completedBuilding3DPrompt', '')
    
    # Create a base prompt string that Kinos might use or ignore
    base_prompt_for_kinos = f"A {name}, a {category.lower()} building in 15th century Venice."
    if subCategory:
        base_prompt_for_kinos += f" This is a {subCategory.lower()} type of {category.lower()}."
    if description:
        base_prompt_for_kinos += f" {description}"
    if completed_prompt:
        base_prompt_for_kinos += f" {completed_prompt}"

    building_details_for_kinos = {
        "name": name,
        "category": category,
        "subCategory": subCategory,
        "description": description,
        "completed_building_3d_prompt": completed_prompt,
        "base_descriptive_prompt": base_prompt_for_kinos # Pass the constructed base description
        # Add any other fields from 'building' dict that Kinos might find useful
    }

    kinos_generated_prompt = _fetch_prompt_from_kinos(building_details_for_kinos)

    if kinos_generated_prompt:
        full_prompt = kinos_generated_prompt
        # Kinos is expected to return the full prompt, including aspect ratio etc.
        log.info(f"Using prompt from Kinos for {name}")
    else:
        log.warning(f"Failed to get prompt from Kinos for {name}. Falling back to basic prompt construction.")
        # Fallback: use base_prompt_for_kinos and generic style guidelines
        fallback_style_elements = [
            "Detailed colored illustration style",
            "clear silhouette for easy game asset identification",
            "stylized yet recognizable textures (weathered stone, brick, plaster)",
            "natural lighting with warm Mediterranean sunlight",
            "historically accurate details for 15th century Venice",
            "Square format image",
            "--ar 1:1"
        ]
        # Ensure Venetian context if not already present in base_prompt_for_kinos
        if not any(s in base_prompt_for_kinos.lower() for s in ["canal", "water", "gondola", "venice", "venetian"]):
             fallback_style_elements.append("The building is situated in a typical Venetian scene, possibly alongside a canal or in a bustling campo.")
        
        full_prompt = f"{base_prompt_for_kinos} {' '.join(fallback_style_elements)}"

    # Clean up extra spaces
    full_prompt = ' '.join(full_prompt.split())
    
    log.info(f"Final prompt for {name}: {full_prompt}")
    return full_prompt

def generate_image(prompt: str, base_filename: str, output_dir: str) -> Optional[str]:
    """
    Generate image using Ideogram API, save with correct extension, and return the full path.
    """
    log.info(f"Generating image for base filename: {base_filename} in dir: {output_dir}")
    
    # Log the full prompt to the console
    log.info(f"PROMPT: {prompt}")
    
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
                "rendering_speed": "DEFAULT",
                "model":"V_3"
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API: {response.status_code} {response.text}")
            return False
        
        # Log the full response for debugging
        log.info(f"Ideogram API response: {response.text[:1000]}...")
        
        # Extract image URL from response
        result = response.json()
        
        # Check if the expected data structure exists
        if "data" not in result or not result["data"] or "url" not in result["data"][0]:
            log.error(f"Unexpected response structure: {result}")
            return False
            
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            log.error("No image URL in response")
            return None
        
        log.info(f"Image URL received: {image_url}")

        # Determine file extension from URL
        parsed_url = urlparse(image_url)
        image_path_on_server = parsed_url.path
        original_extension = Path(image_path_on_server).suffix.lower() # .png, .jpg etc.
        
        if not original_extension or original_extension not in ['.png', '.jpg', '.jpeg']:
            log.warning(f"Could not determine a valid extension from image URL {image_url} (path: {image_path_on_server}, ext: '{original_extension}'), defaulting to .png")
            original_extension = ".png"

        # Ensure the output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        actual_output_path = os.path.join(output_dir, f"{base_filename}{original_extension}")
        
        # Download the image
        log.info(f"Downloading image from URL: {image_url}")
        image_response = requests.get(image_url, stream=True)
        
        if not image_response.ok:
            log.error(f"Failed to download image: {image_response.status_code} {image_response.reason}")
            return None
        
        # Save the image
        log.info(f"Saving image to {actual_output_path}")
        with open(actual_output_path, 'wb') as f:
            for chunk in image_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Verify the saved file
        if os.path.exists(actual_output_path):
            file_size = os.path.getsize(actual_output_path)
            log.info(f"Successfully saved image to {actual_output_path} (size: {file_size} bytes)")
            
            if file_size < 1000:  # Suspiciously small for an image
                log.warning(f"Warning: Saved file {actual_output_path} is very small ({file_size} bytes), might not be a valid image")
                # Save the response content for inspection
                with open(f"{actual_output_path}.response.json", 'w') as f: # Suffix before extension
                    f.write(response.text)
        else:
            log.error(f"Failed to save image to {actual_output_path}")
            return None
            
        return actual_output_path
    except Exception as e:
        log.error(f"Error generating image for {base_filename}: {e}")
        return None

def process_building(building: Dict[str, Any], force_regenerate: bool = False) -> bool:
    """Process a single building to generate its image."""
    # Extract building information
    name = building.get('name', 'unknown')
    building_type = building.get('type', name)
    
    # Create a safe filename from the building name
    safe_name = name.lower().replace(' ', '_').replace("'s", "s_").replace("'", '').replace('"', '')
    
    # Create a safe filename from the building type as fallback
    safe_type = building_type.lower().replace(' ', '_').replace("'s", "s_").replace("'", '').replace('"', '')
    
    # Use the building ID if available, otherwise use the safe name
    building_id = building.get('id', safe_name) # This is a filename stem
    
    # Check if image already exists (with common extensions)
    if not force_regenerate:
        possible_extensions = [".png", ".jpg", ".jpeg"]
        existing_image_path = None
        for ext in possible_extensions:
            potential_path = os.path.join(BUILDINGS_IMAGE_DIR, f"{safe_name}{ext}")
            if os.path.exists(potential_path):
                existing_image_path = potential_path
                break
        
        log.info(f"Checking if image exists for base name '{safe_name}': Path found: {existing_image_path}")
        
        if existing_image_path:
            log.info(f"Image {existing_image_path} already exists for {name}, skipping. Use --force to regenerate.")
            return True
            
    # Create the prompt
    prompt = create_image_prompt(building)
    
    # Generate the image, getting the full path of the saved image
    saved_image_full_path = generate_image(prompt, safe_name, BUILDINGS_IMAGE_DIR)
    
    if not saved_image_full_path:
        log.error(f"Failed to generate image for {name} (base: {safe_name})")
        return False

    # Extract the extension from the actually saved file
    _, saved_extension = os.path.splitext(saved_image_full_path)
    
    # Also save a copy with the building ID if available and different from safe_name
    if building_id and building_id != safe_name:
        id_output_path = os.path.join(BUILDINGS_IMAGE_DIR, f"{building_id}{saved_extension}")
        if saved_image_full_path != id_output_path: # Avoid copying to itself
            try:
                with open(saved_image_full_path, 'rb') as src, open(id_output_path, 'wb') as dst:
                    dst.write(src.read())
                log.info(f"Created ID-based copy at {id_output_path}")
            except Exception as e:
                log.error(f"Error creating ID-based copy for {building_id}: {e}")
    
    # Also save a copy with the building type if different from name
    if safe_type != safe_name:
        type_output_path = os.path.join(BUILDINGS_IMAGE_DIR, f"{safe_type}{saved_extension}")
        if saved_image_full_path != type_output_path: # Avoid copying to itself
            try:
                with open(saved_image_full_path, 'rb') as src, open(type_output_path, 'wb') as dst:
                    dst.write(src.read())
                log.info(f"Created type-based copy at {type_output_path}")
            except Exception as e:
                log.error(f"Error creating type-based copy for {safe_type}: {e}")
    
    return True

def main():
    """Main function to generate building images."""
    parser = argparse.ArgumentParser(description="Generate images for buildings")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of images to generate (0 for unlimited)")
    parser.add_argument("--force", action="store_true", help="Force regeneration of existing images")
    parser.add_argument("--building", help="Only process a specific building by name or type")
    
    args = parser.parse_args()
    
    # Ensure the base output directory exists
    os.makedirs(BUILDINGS_IMAGE_DIR, exist_ok=True)
    
    # Scan for building files
    buildings = scan_building_files()
    
    if not buildings:
        log.error("No building files found. Exiting.")
        return
    
    # Filter buildings based on command-line arguments
    if args.building:
        building_name_lower = args.building.lower()
        buildings = [b for b in buildings if 
                    b.get('name', '').lower() == building_name_lower or
                    b.get('type', '').lower() == building_name_lower]
        log.info(f"Filtered to {len(buildings)} buildings with name or type '{args.building}'")
    
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
