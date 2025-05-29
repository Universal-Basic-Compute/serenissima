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
log = logging.getLogger("generate_building_images")

# Load environment variables
load_dotenv()

# Constants
BUILDINGS_DATA_DIR = os.path.join(os.getcwd(), 'data', 'buildings')
# BUILDINGS_IMAGE_DIR is no longer the final destination for images.
# We will upload to "images/buildings" on the server.

# Global variables for API URL and Key, to be set in main()
BACKEND_API_URL_GLOBAL = DEFAULT_FASTAPI_URL
UPLOAD_API_KEY_GLOBAL = None

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

def generate_and_upload_image(prompt: str, base_filename: str) -> Optional[str]:
    """
    Generate image using Ideogram API, download to temp, upload to backend, and return public URL.
    """
    global BACKEND_API_URL_GLOBAL, UPLOAD_API_KEY_GLOBAL

    log.info(f"Generating image for base filename: {base_filename}")
    log.info(f"PROMPT: {prompt}")
    
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set")
        return None # Changed from False to None for consistency
    
    if not UPLOAD_API_KEY_GLOBAL:
        log.error("UPLOAD_API_KEY_GLOBAL not set. Cannot upload image.")
        return None

    try:
        response = requests.post(
            "https://api.ideogram.ai/v1/ideogram-v3/generate", # Assuming v3 is desired
            headers={"Api-Key": ideogram_api_key, "Content-Type": "application/json"},
            json={"prompt": prompt, "style_type": "REALISTIC", "rendering_speed": "DEFAULT", "model": "V_3"}
        )
        
        if response.status_code != 200:
            log.error(f"Error from Ideogram API: {response.status_code} {response.text}")
            return None
        
        result = response.json()
        image_url_from_ideogram = result.get("data", [{}])[0].get("url")
        
        if not image_url_from_ideogram:
            log.error("No image URL in Ideogram response")
            return None
        
        log.info(f"Image URL received from Ideogram: {image_url_from_ideogram}")

        # Determine file extension from URL
        parsed_url = urlparse(image_url_from_ideogram)
        original_extension = Path(parsed_url.path).suffix.lower() or ".png"
        if original_extension not in ['.png', '.jpg', '.jpeg']:
            log.warning(f"Invalid extension '{original_extension}', defaulting to .png")
            original_extension = ".png"
        
        filename_on_server = f"{base_filename}{original_extension}"

        # Download the image to a temporary file
        image_response = requests.get(image_url_from_ideogram, stream=True)
        if not image_response.ok:
            log.error(f"Failed to download image from Ideogram: {image_response.status_code}")
            return None
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=original_extension) as tmp_file:
            for chunk in image_response.iter_content(chunk_size=8192):
                tmp_file.write(chunk)
            tmp_file_path = tmp_file.name
        
        log.info(f"Image downloaded to temporary file: {tmp_file_path}")

        # Upload the temporary file
        public_url = upload_file_to_backend(
            local_file_path=tmp_file_path,
            filename_on_server=filename_on_server,
            destination_folder_on_server="images/buildings",
            api_url=BACKEND_API_URL_GLOBAL,
            api_key=UPLOAD_API_KEY_GLOBAL
        )
        
        try:
            os.remove(tmp_file_path)
            log.info(f"Removed temporary file: {tmp_file_path}")
        except OSError as e:
            log.error(f"Error removing temporary file {tmp_file_path}: {e}")

        if public_url:
            log.info(f"Successfully generated and uploaded image for {base_filename}. URL: {public_url}")
        else:
            log.error(f"Failed to upload image for {base_filename} to backend.")
        
        return public_url

    except Exception as e:
        log.error(f"Error generating/uploading image for {base_filename}: {e}")
        return None

def process_building(building: Dict[str, Any], force_regenerate: bool = False) -> bool:
    """Process a single building to generate and upload its image."""
    name = building.get('name', 'unknown_building')
    safe_name = name.lower().replace(' ', '_').replace("'", "").replace('"', '') # Simplified safe name
    
    # This script doesn't store the URL back into a data file.
    # It relies on the frontend constructing the URL based on convention.
    # So, we just need to ensure the image is uploaded.
    # The `force_regenerate` logic might need to check if the image exists on the *server*,
    # which is harder. For now, if `force_regenerate` is true, it will always try.
    # If not forcing, and we had a way to check server existence, we could skip.
    # Let's assume for now that if not `force_regenerate`, we might skip based on local progress or a marker.
    # However, the original script checked local existence. Since we're uploading, this check is less relevant.
    # We'll rely on a progress tracking mechanism if skipping is desired without `force_regenerate`.
    # For simplicity now, let's assume it tries to generate if not explicitly told to skip by other means (e.g. limit).

    prompt = create_image_prompt(building)
    public_image_url = generate_and_upload_image(prompt, safe_name)
    
    if not public_image_url:
        log.error(f"Failed to generate and upload image for {name} (base: {safe_name})")
        return False
    
    # If building ID or type are different, we might want to create aliases or symlinks on the server.
    # The current upload API doesn't support this directly.
    # For now, we'll just upload using `safe_name`.
    # The frontend will need to consistently use this `safe_name` based URL.
    
    return True

def main(cli_args): # Renamed args to cli_args to avoid conflict
    """Main function to generate building images."""
    global BACKEND_API_URL_GLOBAL, UPLOAD_API_KEY_GLOBAL
    BACKEND_API_URL_GLOBAL = cli_args.api_url
    UPLOAD_API_KEY_GLOBAL = cli_args.api_key

    if not UPLOAD_API_KEY_GLOBAL:
        log.error("Upload API key is required. Set UPLOAD_API_KEY or use --api_key.")
        sys.exit(1)
    if not BACKEND_API_URL_GLOBAL:
        log.error("FastAPI backend URL is required. Set FASTAPI_BACKEND_URL or use --api_url.")
        sys.exit(1)

    # Ensure the base output directory for logs/progress exists if needed
    # os.makedirs(BUILDINGS_IMAGE_DIR, exist_ok=True) # Not creating local image dir
    
    # Scan for building files
    buildings = scan_building_files()
    
    if not buildings:
        log.error("No building files found. Exiting.")
        return
    
    # Filter buildings based on command-line arguments
    if cli_args.building:
        building_name_lower = cli_args.building.lower()
        buildings = [b for b in buildings if 
                    b.get('name', '').lower() == building_name_lower or
                    b.get('type', '').lower() == building_name_lower]
        log.info(f"Filtered to {len(buildings)} buildings with name or type '{cli_args.building}'")
    
    if not buildings:
        log.error("No buildings match the specified filters. Exiting.")
        return
    
    # Process buildings
    processed_count = 0
    success_count = 0
    
    for building_data in buildings: # Renamed building to building_data to avoid conflict
        # Check if we've reached the limit
        if cli_args.limit > 0 and processed_count >= cli_args.limit:
            log.info(f"Reached limit of {cli_args.limit} images. Stopping.")
            break
        
        name = building_data.get('name', f"Building {processed_count+1}")
        log.info(f"Processing building {processed_count+1}/{len(buildings)}: {name}")
        
        # Process the building
        success = process_building(building_data, cli_args.force)
        
        if success:
            success_count += 1
        
        processed_count += 1
        
        # Add a delay to avoid rate limiting
        if processed_count < len(buildings) and (cli_args.limit == 0 or processed_count < cli_args.limit) :
            time.sleep(cli_args.delay_seconds) # Use configurable delay
    
    log.info(f"Attempted to generate and upload {success_count} images out of {processed_count} processed buildings")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate images for buildings and upload them.")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of images to generate (0 for unlimited)")
    parser.add_argument("--force", action="store_true", help="Force regeneration (currently ignored as server-side check is complex)")
    parser.add_argument("--building", help="Only process a specific building by name or type")
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
    parser.add_argument(
        "--delay_seconds",
        type=int,
        default=10, # Increased default delay
        help="Delay in seconds between processing each building image."
    )
    
    args_parsed = parser.parse_args()
    main(args_parsed)
