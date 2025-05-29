import os
import sys
import json
import time
import requests
import asyncio
import aiohttp
import anthropic
from dotenv import load_dotenv
from pathlib import Path
import argparse # Added for command-line arguments
import tempfile # For temporary file handling
from typing import Optional # Added for type hinting

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

# Load environment variables
load_dotenv()

# Get API keys
CLAUDE_API_KEY = os.getenv("ANTHROPIC_API_KEY")
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY")
# Args for backend URL and upload API key will be parsed in main()

if not CLAUDE_API_KEY:
    print("Error: ANTHROPIC_API_KEY not set in environment variables")
    sys.exit(1)

if not IDEOGRAM_API_KEY:
    print("Error: IDEOGRAM_API_KEY not set in environment variables")
    sys.exit(1)

# Initialize Claude client
claude = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

# Directory paths
RESOURCES_DIR = Path("data/resources")
# ICONS_DIR is no longer needed for final storage, but ensure its parent exists for progress/error logs
DATA_DIR_FOR_LOGS = Path("data") # Parent for progress and error files
PROGRESS_FILE = DATA_DIR_FOR_LOGS / "resource_icon_generation_progress.json"
ERROR_LOG = DATA_DIR_FOR_LOGS / "resource_icon_generation_errors.json"

# Ensure directories exist
def ensure_directories_exist():
    # ICONS_DIR.mkdir(parents=True, exist_ok=True) # No longer creating public/images/resources
    RESOURCES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR_FOR_LOGS.mkdir(parents=True, exist_ok=True) # Ensure 'data' dir exists

# Function to save progress
def save_progress(processed_resources):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(processed_resources, f, indent=2)
    print(f"Progress saved: {len(processed_resources)} resources processed")

# Function to load progress
def load_progress():
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, 'r') as f:
                progress = json.load(f)
            print(f"Loaded progress: {len(progress)} resources already processed")
            return progress
        except Exception as error:
            print(f"Error loading progress file: {error}")
            return []
    return []

# Function to log errors
def log_error(resource_id, stage, error):
    errors = []
    if ERROR_LOG.exists():
        try:
            with open(ERROR_LOG, 'r') as f:
                errors = json.load(f)
        except Exception as e:
            print(f"Error reading error log: {e}")
    
    errors.append({
        "resource": resource_id,
        "stage": stage,
        "error": str(error),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    })
    
    with open(ERROR_LOG, 'w') as f:
        json.dump(errors, f, indent=2)
    print(f"Error logged for {resource_id} at {stage} stage")

# Get all resource files from flat structure
def get_all_resource_files():
    resource_files = []
    
    # Check if the directory exists
    if not RESOURCES_DIR.exists():
        print(f"Resources directory not found at {RESOURCES_DIR}")
        return resource_files
    
    # In a flat structure, just get all JSON files directly
    for file in RESOURCES_DIR.glob('*.json'):
        resource_files.append(str(file))
    
    print(f"Found {len(resource_files)} resource files")
    return resource_files

# Load resources from all files
def load_all_resources():
    resource_files = get_all_resource_files()
    all_resources = []
    
    for file in resource_files:
        try:
            with open(file, 'r') as f:
                resource = json.load(f)
                # Add file path for later reference
                resource['file_path'] = file
                
                # If id is not present, use the filename without extension
                if 'id' not in resource:
                    filename = Path(file).stem
                    resource['id'] = filename
                    print(f"No id found in {file}, using filename: {filename}")
                
                all_resources.append(resource)
                print(f"Loaded resource: {resource.get('id', 'unknown')} from {file}")
        except Exception as error:
            print(f"Error loading resource from {file}: {error}")
    
    print(f"Loaded {len(all_resources)} resources in total")
    return all_resources

# Generate prompt for resource icon using Claude
async def generate_icon_prompt(resource):
    try:
        resource_id = resource.get('id', 'unknown')
        resource_name = resource.get('name', resource_id)
        category = resource.get('category', '')
        subCategory = resource.get('subCategory', '')
        description = resource.get('description', '')
        
        print(f"Generating prompt for resource: {resource_name}")
        
        # Create system prompt for Claude
        system_prompt = """
        You are an expert in creating detailed prompts for AI image generation. 
        Your task is to create a prompt for generating a small, detailed icon for a resource in a Renaissance Venice game.
        The icon should be simple enough to be recognizable at small sizes but detailed enough to be visually interesting.
        Focus on creating a prompt that will generate a single, centered object on a transparent background.
        The style should be consistent with Renaissance Venice aesthetics.
        """
        
        # Create citizen prompt with resource details
        citizen_prompt = f"""
        Please create an image generation prompt for an icon representing this resource:
        
        Resource Name: {resource_name}
        Category: {category}
        SubCategory: {subCategory}
        Description: {description}
        
        The prompt should:
        1. Describe a single, centered object representing this resource
        2. Include details about colors, textures, and lighting
        3. Specify that the icon should have a transparent background
        4. Be optimized for a small icon (256x256 pixels)
        5. Have a consistent Renaissance Venetian aesthetic
        6. Be detailed but recognizable at small sizes
        
        Return ONLY the prompt text, nothing else. Do not include explanations or notes.
        """
        
        # Call Claude API
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",  # Updated to the latest model
            max_tokens=1000,
            system=system_prompt,
            messages=[
                {"role": "citizen", "content": citizen_prompt}
            ]
        )
        
        # Extract the prompt from Claude's response
        icon_prompt = response.content[0].text.strip()
        print(f"Generated prompt for {resource_name}: {icon_prompt[:100]}...")
        
        return icon_prompt
    except Exception as error:
        print(f"Error generating prompt for {resource.get('id', 'unknown')}: {error}")
        log_error(resource.get('id', 'unknown'), 'prompt_generation', error)
        return None

# Generate icon using Ideogram API
async def generate_icon(resource, prompt):
    resource_id = resource.get('id', 'unknown')
    try:
        print(f"Generating icon for {resource_id} using Ideogram API")
        
        # Call the Ideogram API
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.ideogram.ai/generate",
                headers={
                    "Api-Key": IDEOGRAM_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "image_request": {
                        "prompt": prompt,
                        "aspect_ratio": "ASPECT_1_1",
                        "model": "V_2A",
                        "style_type": "REALISTIC",
                        "magic_prompt_option": "AUTO"
                    }
                }
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Error from Ideogram API: {response.status} {error_text}")
                    log_error(resource_id, 'ideogram_api', f"Status {response.status}: {error_text}")
                    return None
                
                result = await response.json()
        
        # Extract the image URL from the response
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            print(f"No image URL in response for {resource_id}")
            log_error(resource_id, 'ideogram_api', "No image URL in response")
            return None
        
        print(f"Successfully generated icon for {resource_id}")
        return image_url
    except Exception as error:
        print(f"Error generating icon for {resource_id}: {error}")
        log_error(resource_id, 'ideogram_api', error)
        return None

# Download icon from URL, upload it, and return the public URL
async def download_and_upload_icon(resource, image_url, backend_api_url: str, backend_api_key: str) -> Optional[str]:
    resource_id = resource.get('id', 'unknown')
    
    try:
        print(f"Downloading icon for {resource_id} from {image_url}")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as response:
                if response.status != 200:
                    print(f"Error downloading icon for {resource_id}: HTTP {response.status}")
                    log_error(resource_id, 'icon_download', f"HTTP {response.status}")
                    return None
                
                image_content = await response.read()

        # Save to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_file:
            tmp_file.write(image_content)
            tmp_file_path = tmp_file.name
        
        print(f"Successfully downloaded icon for {resource_id} to temporary file {tmp_file_path}")

        # Upload the temporary file to the backend
        # The filename on the server will be {resource_id}.png
        # The destination folder on the server will be "images/resources"
        public_url = upload_file_to_backend(
            local_file_path=tmp_file_path,
            filename_on_server=f"{resource_id}.png",
            destination_folder_on_server="images/resources",
            api_url=backend_api_url,
            api_key=backend_api_key
        )
        
        # Clean up the temporary file
        try:
            os.remove(tmp_file_path)
            print(f"Removed temporary file: {tmp_file_path}")
        except OSError as e:
            print(f"Error removing temporary file {tmp_file_path}: {e}")

        if public_url:
            print(f"Icon for {resource_id} uploaded. Public URL: {public_url}")
            return public_url
        else:
            log_error(resource_id, 'icon_upload', "Failed to upload icon to backend.")
            return None

    except Exception as error:
        print(f"Error downloading/uploading icon for {resource_id}: {error}")
        log_error(resource_id, 'icon_download_upload', error)
        return None

# Update resource file with icon URL
def update_resource_file_with_url(resource, icon_url: str):
    resource_id = resource.get('id', 'unknown')
    file_path_str = resource.get('file_path')
    
    if not file_path_str:
        print(f"No file path for resource {resource_id}")
        log_error(resource_id, 'update_file', "No file path")
        return False
    
    file_path = Path(file_path_str)
    if not file_path.exists():
        print(f"Resource file not found at {file_path} for resource {resource_id}")
        log_error(resource_id, 'update_file', f"File not found: {file_path}")
        return False

    try:
        # Read the current file
        with open(file_path, 'r') as f:
            resource_data = json.load(f)
        
        # Update the icon path with the full public URL
        resource_data['icon'] = icon_url 
        
        # Write back to the file
        with open(file_path, 'w') as f:
            json.dump(resource_data, f, indent=2)
        
        print(f"Updated resource file for {resource_id} with icon URL: {icon_url}")
        return True
    except Exception as error:
        print(f"Error updating resource file for {resource_id}: {error}")
        log_error(resource_id, 'update_file', error)
        return False

# Process a batch of resources
async def process_resource_batch(resources, backend_api_url: str, backend_api_key: str):
    processed_ids_in_batch = [] # Track successfully processed IDs in this batch
    
    for resource in resources:
        resource_id = resource.get('id', 'unknown')
        print(f"\n=== Processing resource: {resource_id} ===")
        
        # Check if icon already exists by checking the 'icon' field in the JSON file
        # This assumes that if 'icon' field has a URL, it's already processed.
        # A more robust check would be to see if the URL is valid or if a marker exists.
        # For now, we'll rely on the progress file.
        
        # Generate prompt
        prompt = await generate_icon_prompt(resource)
        if not prompt:
            print(f"Failed to generate prompt for {resource_id}, skipping...")
            continue
        
        # Generate icon URL from Ideogram
        ideogram_image_url = await generate_icon(resource, prompt)
        if not ideogram_image_url:
            print(f"Failed to generate icon URL for {resource_id}, skipping...")
            continue
        
        # Download icon from Ideogram, upload to backend, get public URL
        public_icon_url = await download_and_upload_icon(resource, ideogram_image_url, backend_api_url, backend_api_key)
        if not public_icon_url:
            print(f"Failed to download/upload icon for {resource_id}, skipping...")
            continue
        
        # Update resource file with the new public URL
        update_success = update_resource_file_with_url(resource, public_icon_url)
        if not update_success:
            print(f"Failed to update resource file for {resource_id}")
            # Continue to next resource, error already logged by update_resource_file_with_url
        
        print(f"=== Completed processing for {resource_id} ===\n")
        processed_ids_in_batch.append(resource_id) # Add to list of processed in this batch
        
        # Add a small delay between resources to avoid rate limiting
        await asyncio.sleep(5) # Increased delay
    
    return processed_ids_in_batch

# Main function
async def main(args): # Added args parameter
    try:
        print("Starting resource icon generation...")
        
        # Ensure directories exist (for logs)
        ensure_directories_exist()
        
        # Load all resources
        all_resources = load_all_resources()
        
        # Load progress
        processed_resource_ids = load_progress()
        
        # Filter resources that haven't been processed yet
        # The check for existing icon file is removed as we now rely on the progress file
        # and the 'icon' field in the JSON.
        resources_to_process = [
            resource for resource in all_resources
            if resource.get('id', 'unknown') not in processed_resource_ids
        ]
        
        print(f"Found {len(resources_to_process)} resources that need icons (based on progress file).")
        
        if not resources_to_process:
            print("No new resources to process.")
            return

        # Process resources in batches of 4
        batch_size = args.batch_size
        for i in range(0, len(resources_to_process), batch_size):
            batch = resources_to_process[i:i+batch_size]
            print(f"\n=== Processing batch {i//batch_size + 1}/{(len(resources_to_process) + batch_size - 1)//batch_size} ===\n")
            
            # Pass backend_api_url and backend_api_key to batch processing
            successfully_processed_in_batch = await process_resource_batch(batch, args.api_url, args.api_key)
            
            # Save progress after each batch
            processed_resource_ids.extend(successfully_processed_in_batch)
            save_progress(processed_resource_ids) # Save all accumulated processed IDs
            
            # Add a delay between batches to avoid overwhelming the API
            if i + batch_size < len(resources_to_process):
                print(f"Waiting {args.batch_delay} seconds before processing next batch...")
                await asyncio.sleep(args.batch_delay)
        
        print("\n=== Resource icon generation completed ===")
        
    except Exception as error:
        print(f"Error in main function: {error}")
        log_error("main", "main_function", error)
        sys.exit(1)

# Run the main function
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate icons for resources and upload them.")
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
        "--batch_size",
        type=int,
        default=2, # Reduced default batch size due to API rate limits
        help="Number of resources to process in each batch."
    )
    parser.add_argument(
        "--batch_delay",
        type=int,
        default=60, # Increased default delay
        help="Delay in seconds between processing batches."
    )
    args = parser.parse_args()

    if not args.api_key:
        print("Error: Upload API key is required. Set UPLOAD_API_KEY environment variable or use --api_key.")
        sys.exit(1)
    if not args.api_url:
        print("Error: FastAPI backend URL is required. Set FASTAPI_BACKEND_URL environment variable or use --api_url.")
        sys.exit(1)

    asyncio.run(main(args))
