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
log = logging.getLogger("generate_guild_images")

# Load environment variables
load_dotenv()

# Constants for backend upload
DEFAULT_FASTAPI_URL = "http://localhost:8000" # Fallback, should be set in .env

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        return None
    
    try:
        api = Api(api_key)
        tables = {
            'guilds': api.table(base_id, 'GUILDS'),
        }
        log.info("Successfully initialized Airtable connection.")
        return tables
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        return None

def get_guilds(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all guilds from Airtable."""
    try:
        guilds_table = tables['guilds']
        all_guilds = guilds_table.all()
        log.info(f"Fetched {len(all_guilds)} guilds from Airtable.")
        return all_guilds
    except Exception as e:
        log.error(f"Error fetching guilds: {e}")
        return []

def generate_image_with_ideogram(prompt: str, aspect_ratio: str, guild_identifier_for_filename: str, image_type: str, guild_name_for_logging: str) -> Optional[str]:
    """
    Generate an image using Ideogram API.
    image_type: "emblem" or "banner"
    """
    log.info(f"Generating {image_type} for guild {guild_name_for_logging} (File ID: {guild_identifier_for_filename}) with aspect ratio {aspect_ratio}. Prompt: {prompt[:100]}...")
    
    ideogram_api_key = os.environ.get('IDEOGRAM_API_KEY')
    fastapi_url = os.environ.get('FASTAPI_BACKEND_URL', DEFAULT_FASTAPI_URL)
    upload_api_key = os.environ.get('UPLOAD_API_KEY')

    if not ideogram_api_key:
        log.error("IDEOGRAM_API_KEY environment variable is not set.")
        return None
    if not fastapi_url: # Should not happen with default
        log.error("FASTAPI_BACKEND_URL environment variable is not set.")
        return None
    if not upload_api_key:
        log.error("UPLOAD_API_KEY environment variable is not set for backend uploads.")
        return None

    # Add aspect ratio guidance to the prompt
    full_prompt = f"{prompt}, {aspect_ratio} aspect ratio, realistic, historically accurate."
    if image_type == "emblem":
        full_prompt = f"A heraldic emblem or sigil representing a guild in Venice XV century. {prompt}. Centered, iconic, {aspect_ratio} aspect ratio"
    elif image_type == "banner":
        full_prompt = f"A wide banner or flag for a guild in Venice XV century. {prompt}. Landscape orientation, {aspect_ratio} aspect ratio, detailed, epic."

    try:
        log.debug(f"Full prompt for Ideogram ({guild_name_for_logging} - {image_type}): {full_prompt}")
        
        payload = {
            "prompt": full_prompt,
            "aspect_ratio": aspect_ratio,  # Pass aspect_ratio to the API
            "style_type": "REALISTIC",
            "rendering_speed": "DEFAULT",
            "model": "V_3"
        }
        log.debug(f"Ideogram API payload: {json.dumps(payload)}")

        response = requests.post(
            "https://api.ideogram.ai/v1/ideogram-v3/generate", # Assuming v3, adjust if needed
            headers={
                "Api-Key": ideogram_api_key,
                "Content-Type": "application/json"
            },
            json=payload
        )
        response.raise_for_status() # Raise an exception for HTTP errors

        result = response.json()
        image_url = result.get("data", [{}])[0].get("url")

        if not image_url:
            log.error(f"No image URL in Ideogram response for guild {guild_name_for_logging} (File ID: {guild_identifier_for_filename}, Type: {image_type}).")
            return None

        # Download the image
        image_response = requests.get(image_url, stream=True)
        image_response.raise_for_status()

        # Save to a temporary file first
        import tempfile
        file_extension = "png" # Standardize on PNG
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as tmp_file:
            for chunk in image_response.iter_content(chunk_size=8192):
                tmp_file.write(chunk)
            temp_file_path = tmp_file.name
        
        log.info(f"Downloaded {image_type} for guild {guild_name_for_logging} to temporary file {temp_file_path}")

        # Determine destination path for backend upload
        destination_folder_on_server = f"images/guilds/{image_type}s" # e.g., images/guilds/emblems
        target_filename_on_server = f"{guild_identifier_for_filename}.{file_extension}"

        # Upload the temporary file to the backend
        uploaded_relative_path = upload_file_to_backend(
            fastapi_url,
            upload_api_key,
            temp_file_path,
            destination_folder_on_server,
            target_filename_on_server
        )
        
        # Clean up temporary file
        try:
            os.remove(temp_file_path)
            log.debug(f"Removed temporary file: {temp_file_path}")
        except OSError as e_remove:
            log.error(f"Error removing temporary file {temp_file_path}: {e_remove}")

        if uploaded_relative_path:
            # Construct the public URL based on the backend's serving path
            # The backend serves from /public_assets/ + relative_path
            public_image_url = f"/public_assets/{uploaded_relative_path.lstrip('/')}"
            log.info(f"Successfully uploaded {image_type} for {guild_name_for_logging}. Public URL: {public_image_url}")
            return public_image_url
        else:
            log.error(f"Failed to upload {image_type} for {guild_name_for_logging} to backend.")
            return None

    except requests.exceptions.RequestException as e:
        log.error(f"Error during Ideogram API call or download for guild {guild_name_for_logging} (File ID: {guild_identifier_for_filename}, Type: {image_type}): {e}")
    except KeyError:
        log.error(f"Unexpected response structure from Ideogram API for guild {guild_name_for_logging} (File ID: {guild_identifier_for_filename}, Type: {image_type}).")
    except Exception as e:
        log.error(f"Error generating or saving {image_type} for guild {guild_name_for_logging} (File ID: {guild_identifier_for_filename}): {e}")
    
    return None

def upload_file_to_backend(
    api_url: str, 
    api_key: str, 
    file_path: str, 
    destination_server_path: str, # e.g., "images/guilds/emblems"
    target_filename: str # e.g., "guild_id.png"
) -> Optional[str]:
    """
    Uploads a file to the backend's /api/upload-asset endpoint.
    Returns the relative path of the uploaded file on success, None otherwise.
    """
    upload_endpoint = f"{api_url.rstrip('/')}/api/upload-asset"
    
    try:
        with open(file_path, 'rb') as f:
            # The 'files' dict structure is {'file': (filename_on_server, file_object, content_type)}
            # The 'destination_path' in data is the folder on the server.
            files = {'file': (target_filename, f)} 
            data = {'destination_path': destination_server_path}
            headers = {'X-Upload-Api-Key': api_key}
            
            log.info(f"Uploading '{file_path}' as '{target_filename}' to '{destination_server_path}' on {upload_endpoint}...")
            response = requests.post(upload_endpoint, files=files, data=data, headers=headers, timeout=60)
            
            if response.status_code == 200:
                response_data = response.json()
                saved_relative_path = response_data.get('relative_path')
                log.info(f"Success: {file_path} uploaded. Backend relative path: {saved_relative_path}")
                return saved_relative_path 
            else:
                log.error(f"Failed to upload {file_path}. Status: {response.status_code}, Response: {response.text}")
                return None
    except requests.exceptions.RequestException as e:
        log.error(f"Request error during upload of {file_path}: {e}")
        return None
    except IOError as e:
        log.error(f"IO error reading {file_path}: {e}")
        return None
    except Exception as e:
        log.error(f"Unexpected error during upload of {file_path}: {e}")
        return None

def update_guild_record(tables: Dict[str, Table], guild_record_id: str, field_name: str, new_value: str) -> bool:
    """Update a specific field in a guild's Airtable record."""
    try:
        guilds_table = tables['guilds']
        guilds_table.update(guild_record_id, {field_name: new_value})
        log.info(f"Updated guild {guild_record_id}: set {field_name} to {new_value}")
        return True
    except Exception as e:
        log.error(f"Error updating guild {guild_record_id} field {field_name}: {e}")
        return False

def process_guild_images(dry_run: bool = False):
    """Main function to process guild emblems and banners."""
    log.info(f"Starting guild image generation process (Dry Run: {dry_run})")

    tables = initialize_airtable()
    if not tables:
        return

    guilds = get_guilds(tables)
    if not guilds:
        log.info("No guilds found to process.")
        return

    for guild in guilds:
        guild_record_id = guild['id'] # Airtable record ID
        guild_fields = guild['fields']
        guild_name = guild_fields.get('GuildName', guild_record_id)
        
        # Get the GuildId field value to use for filenames
        guild_id_for_filename = guild_fields.get('GuildId')

        log.info(f"\nProcessing guild: {guild_name} (Record ID: {guild_record_id}, File ID: {guild_id_for_filename})")

        if not guild_id_for_filename:
            log.error(f"Guild '{guild_name}' (Record ID: {guild_record_id}) is missing the 'GuildId' field. Skipping image generation.")
            continue

        # Process Guild Emblem
        emblem_prompt = guild_fields.get('GuildEmblem')
        if emblem_prompt and not emblem_prompt.startswith('/'):
            log.info(f"GuildEmblem for {guild_name} is a prompt: '{emblem_prompt[:50]}...'")
            if not dry_run:
                new_emblem_url = generate_image_with_ideogram(emblem_prompt, "1x1", guild_id_for_filename, "emblem", guild_name)
                if new_emblem_url:
                    update_guild_record(tables, guild_record_id, 'GuildEmblem', new_emblem_url)
                else:
                    log.error(f"Failed to generate emblem for {guild_name}.")
            else:
                log.info(f"[DRY RUN] Would generate emblem for {guild_name} with prompt: {emblem_prompt}")
                log.info(f"[DRY RUN] Would save to public/images/guilds/emblems/{guild_id_for_filename}.png")
                log.info(f"[DRY RUN] Would update GuildEmblem field in record {guild_record_id} to /images/guilds/emblems/{guild_id_for_filename}.png")
        elif emblem_prompt and emblem_prompt.startswith('/'):
            log.info(f"GuildEmblem for {guild_name} is already a path: {emblem_prompt}. Skipping.")
        else:
            log.info(f"No GuildEmblem prompt for {guild_name}. Skipping emblem.")

        # Process Guild Banner
        banner_prompt = guild_fields.get('GuildBanner')
        if banner_prompt and not banner_prompt.startswith('/'):
            log.info(f"GuildBanner for {guild_name} is a prompt: '{banner_prompt[:50]}...'")
            if not dry_run:
                new_banner_url = generate_image_with_ideogram(banner_prompt, "16x9", guild_id_for_filename, "banner", guild_name)
                if new_banner_url:
                    update_guild_record(tables, guild_record_id, 'GuildBanner', new_banner_url)
                else:
                    log.error(f"Failed to generate banner for {guild_name}.")
            else:
                log.info(f"[DRY RUN] Would generate banner for {guild_name} with prompt: {banner_prompt}")
                log.info(f"[DRY RUN] Would save to public/images/guilds/banners/{guild_id_for_filename}.png")
                log.info(f"[DRY RUN] Would update GuildBanner field in record {guild_record_id} to /images/guilds/banners/{guild_id_for_filename}.png")
        elif banner_prompt and banner_prompt.startswith('/'):
            log.info(f"GuildBanner for {guild_name} is already a path: {banner_prompt}. Skipping.")
        else:
            log.info(f"No GuildBanner prompt for {guild_name}. Skipping banner.")
            
    log.info("Guild image generation process finished.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate emblems and banners for guilds.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable or saving files.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging."
    )
    args = parser.parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    process_guild_images(args.dry_run)
