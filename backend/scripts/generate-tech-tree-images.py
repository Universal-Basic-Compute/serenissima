import os
import sys
import json
import time
import requests
import asyncio
import aiohttp
import google.generativeai as genai # Import Gemini client
from dotenv import load_dotenv
from pathlib import Path
import argparse # Added
import tempfile # Added
from typing import Optional, Dict # Added for type hinting
import requests # Added for upload_file_to_backend
import os # Added for getenv in upload_file_to_backend and main
import sys # Added for sys.exit

# --- BEGIN COPIED HELPER FUNCTION ---
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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") 
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY")
# Backend URL and Upload API Key will be parsed in main()

if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not set in environment variables")
    sys.exit(1)

if not IDEOGRAM_API_KEY:
    print("Error: IDEOGRAM_API_KEY not set in environment variables")
    sys.exit(1)

# Configure Gemini client
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-1.5-pro-latest') # Updated model

# Directory paths
TECH_TREE_DIR = Path("components/Knowledge")
# IMAGES_DIR is no longer needed for final storage, as images are uploaded.
# The path "publichttps://backend.serenissima.ai/public_assets/images/knowledge/tech-tree" was incorrect.
# We will use "images/knowledge/tech-tree" as the destination_folder_on_server for uploads.
DATA_DIR_FOR_LOGS = Path("data") # Parent for progress and error files
PROGRESS_FILE = DATA_DIR_FOR_LOGS / "tech_tree_image_generation_progress.json"
ERROR_LOG = DATA_DIR_FOR_LOGS / "tech_tree_image_generation_errors.json"

# Ensure directories exist
def ensure_directories_exist():
    # IMAGES_DIR.mkdir(parents=True, exist_ok=True) # No longer creating local public/images/tech-tree
    DATA_DIR_FOR_LOGS.mkdir(parents=True, exist_ok=True) # For progress and error logs
    # TECH_TREE_DIR is for reading, should exist.
    TECH_TREE_DIR.mkdir(parents=True, exist_ok=True) 

# Function to save progress
def save_progress(processed_nodes):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(processed_nodes, f, indent=2)
    print(f"Progress saved: {len(processed_nodes)} nodes processed")

# Function to load progress
def load_progress():
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, 'r') as f:
                progress = json.load(f)
            print(f"Loaded progress: {len(progress)} nodes already processed")
            return progress
        except Exception as error:
            print(f"Error loading progress file: {error}")
            return []
    return []

# Function to log errors
def log_error(node_id, stage, error):
    errors = []
    if ERROR_LOG.exists():
        try:
            with open(ERROR_LOG, 'r') as f:
                errors = json.load(f)
        except Exception as e:
            print(f"Error reading error log: {e}")
    
    errors.append({
        "node": node_id,
        "stage": stage,
        "error": str(error),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    })
    
    with open(ERROR_LOG, 'w') as f:
        json.dump(errors, f, indent=2)
    print(f"Error logged for {node_id} at {stage} stage")

# Extract tech tree nodes from TechTree.tsx
def extract_tech_tree_nodes():
    try:
        tech_tree_path = TECH_TREE_DIR / "TechTree.tsx"
        
        if not tech_tree_path.exists():
            print(f"Error: Tech tree file not found at {tech_tree_path}")
            sys.exit(1)
            
        with open(tech_tree_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the techNodes array in the file
        start_marker = "const techNodes: TechNode[] = ["
        end_marker = "];"
        
        start_index = content.find(start_marker)
        if start_index == -1:
            print("Error: Could not find tech nodes array in the file")
            sys.exit(1)
            
        start_index += len(start_marker)
        end_index = content.find(end_marker, start_index)
        
        if end_index == -1:
            print("Error: Could not find end of tech nodes array")
            sys.exit(1)
            
        nodes_content = content[start_index:end_index].strip()
        
        # Parse the nodes content
        nodes = []
        current_node = {}
        in_node = False
        
        for line in nodes_content.split('\n'):
            line = line.strip()
            
            if line.startswith('{'):
                current_node = {}
                in_node = True
                continue
                
            if line.startswith('},'):
                if in_node and current_node:
                    nodes.append(current_node)
                current_node = {}
                in_node = False
                continue
                
            if in_node and ':' in line:
                key, value = line.split(':', 1)
                key = key.strip().strip('"\'')
                value = value.strip()
                
                # Remove trailing comma if present
                if value.endswith(','):
                    value = value[:-1]
                    
                # Clean up string values
                if value.startswith('"') or value.startswith("'"):
                    value = value.strip('"\'')
                    
                current_node[key] = value
        
        # Process the extracted nodes to get a clean list
        clean_nodes = []
        for node in nodes:
            if 'id' in node and 'title' in node and 'description' in node:
                clean_nodes.append({
                    'id': node['id'].strip("'\""),
                    'title': node['title'].strip("'\""),
                    'description': node['description'].strip("'\""),
                    'image': node['image'].strip("'\"") if 'image' in node else "https://backend.serenissima.ai/public_assets/images/knowledge/tech-tree/" + node['id'].strip("'\"") + ".jpg"
                })
        
        print(f"Extracted {len(clean_nodes)} tech tree nodes")
        return clean_nodes
        
    except Exception as error:
        print(f"Error extracting tech tree nodes: {error}")
        sys.exit(1)

# Generate prompt for tech tree image using Claude
async def generate_image_prompt(node):
    try:
        node_id = node['id']
        node_title = node['title']
        node_description = node['description']
        
        print(f"Generating prompt for node: {node_title} using Gemini")
        
        # Create prompt for Gemini
        # Gemini API prefers a direct instruction style.
        # The system prompt concept is handled differently, often by initial instructions or few-shot examples if needed.
        # For this use case, a direct, detailed prompt should work.
        
        full_prompt_for_gemini = f"""
        You are an expert in creating detailed prompts for AI image generation. 
        Your task is to create a prompt for generating a square image for a tech tree node in a Renaissance Venice game.
        The image should be simple enough to be recognizable at small sizes but detailed enough to be visually interesting.
        Focus on creating a prompt that will generate a single, centered object or scene on a clean background.
        The style should be consistent with Renaissance Venice aesthetics - think of paintings, architecture, and artifacts from 15th-16th century Venice.

        Please create an image generation prompt for a tech tree node representing this concept:
        
        Node Title: {node_title}
        Node Description: {node_description}
        
        The image generation prompt you create should:
        1. Describe a single, centered scene or object representing this concept.
        2. Include details about colors, textures, and lighting appropriate for Renaissance Venice.
        3. Be optimized for a square image (intended for 128x128 pixels, so the core subject must be clear).
        4. Have a consistent Renaissance Venetian aesthetic (15th-16th century).
        5. Be detailed but recognizable at small sizes.
        6. Include some architectural or period-appropriate elements that relate to the concept.
        
        Return ONLY the image generation prompt text, nothing else. Do not include explanations, notes, or any conversational filler.
        """
        
        # Call Gemini API
        # Note: Gemini's `generate_content` can be async if used with `await gemini_model.generate_content_async(full_prompt_for_gemini)`
        # However, since this function `generate_image_prompt` is already async, we can use the async version.
        # If the surrounding structure doesn't support async here, use `gemini_model.generate_content(full_prompt_for_gemini)`
        
        response = await gemini_model.generate_content_async(full_prompt_for_gemini) # Using async version
        
        # Extract the prompt from Gemini's response
        # Gemini's response structure might be response.text or response.parts[0].text depending on configuration
        # For simple text generation, response.text is common.
        image_prompt = response.text.strip()
        print(f"Generated prompt for {node_title} using Gemini: {image_prompt[:100]}...")
        
        return image_prompt
    except Exception as error:
        print(f"Error generating prompt for {node['id']} using Gemini: {error}")
        log_error(node['id'], 'prompt_generation', error)
        return None

# Generate image using Ideogram API
async def generate_image(node, prompt):
    node_id = node['id']
    try:
        print(f"Generating image for {node_id} using Ideogram API")
        
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
                    log_error(node_id, 'ideogram_api', f"Status {response.status}: {error_text}")
                    return None
                
                result = await response.json()
        
        # Extract the image URL from the response
        image_url = result.get("data", [{}])[0].get("url", "")
        
        if not image_url:
            print(f"No image URL in response for {node_id}")
            log_error(node_id, 'ideogram_api', "No image URL in response")
            return None
        
        print(f"Successfully generated image for {node_id}")
        return image_url
    except Exception as error:
        print(f"Error generating image for {node_id}: {error}")
        log_error(node_id, 'ideogram_api', error)
        return None

# Download image from URL, upload it
async def download_and_upload_tech_image(node, image_url: str, backend_api_url: str, backend_api_key: str) -> Optional[str]:
    node_id = node['id']
    # We expect .jpg for tech tree images based on existing paths
    filename_on_server = f"{node_id}.jpg" 
    
    try:
        print(f"Downloading image for tech node {node_id} from {image_url}")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as response:
                if response.status != 200:
                    print(f"Error downloading image for {node_id}: HTTP {response.status}")
                    log_error(node_id, 'image_download', f"HTTP {response.status}")
                    return None
                
                image_content = await response.read()

        # Save to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            tmp_file.write(image_content)
            tmp_file_path = tmp_file.name
        
        print(f"Successfully downloaded image for {node_id} to temporary file {tmp_file_path}")

        # Upload the temporary file to the backend
        # The destination folder on the server will be "images/tech-tree"
        public_url = upload_file_to_backend(
            local_file_path=tmp_file_path,
            filename_on_server=filename_on_server,
            destination_folder_on_server="images/tech-tree", # Standardized path
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
            print(f"Image for {node_id} uploaded. Public URL: {public_url}")
            # This script doesn't update a data file, so we just return the URL for logging/confirmation
            return public_url 
        else:
            log_error(node_id, 'image_upload', "Failed to upload image to backend.")
            return None

    except Exception as error:
        print(f"Error downloading/uploading image for {node_id}: {error}")
        log_error(node_id, 'image_download_upload', error)
        return None

# Process a batch of nodes
async def process_node_batch(nodes, backend_api_url: str, backend_api_key: str):
    processed_ids_in_batch = []
    
    for node in nodes:
        node_id = node['id']
        print(f"\n=== Processing node: {node_id} ===")
        
        # We rely on the progress file to skip already processed nodes.
        # The check for image_path.exists() is removed.
        
        # Generate prompt
        prompt = await generate_image_prompt(node)
        if not prompt:
            print(f"Failed to generate prompt for {node_id}, skipping...")
            continue
        
        # Generate image URL from Ideogram
        ideogram_image_url = await generate_image(node, prompt)
        if not ideogram_image_url:
            print(f"Failed to generate image URL for {node_id}, skipping...")
            continue
        
        # Download image from Ideogram, upload to backend
        public_image_url = await download_and_upload_tech_image(node, ideogram_image_url, backend_api_url, backend_api_key)
        if not public_image_url:
            print(f"Failed to download/upload image for {node_id}, skipping...")
            continue
        
        print(f"=== Completed processing for {node_id} (URL: {public_image_url}) ===\n")
        processed_ids_in_batch.append(node_id)
        
        # Add a small delay between nodes to avoid rate limiting
        await asyncio.sleep(5) # Increased delay
    
    return processed_ids_in_batch

# Main function
async def main(args): # Added args parameter
    try:
        print("Starting tech tree image generation...")
        
        # Ensure directories exist (for logs)
        ensure_directories_exist()
        
        # Extract tech tree nodes
        all_nodes = extract_tech_tree_nodes()
        
        # Load progress
        processed_node_ids = load_progress()
        
        # Filter nodes that haven't been processed yet
        nodes_to_process = [
            node for node in all_nodes
            if node['id'] not in processed_node_ids
        ]
        
        print(f"Found {len(nodes_to_process)} nodes that need images (based on progress file).")

        if not nodes_to_process:
            print("No new tech tree nodes to process.")
            return
        
        # Process nodes in batches
        batch_size = args.batch_size
        for i in range(0, len(nodes_to_process), batch_size):
            batch = nodes_to_process[i:i+batch_size]
            print(f"\n=== Processing batch {i//batch_size + 1}/{(len(nodes_to_process) + batch_size - 1)//batch_size} ===\n")
            
            successfully_processed_in_batch = await process_node_batch(batch, args.api_url, args.api_key)
            
            # Save progress after each batch
            processed_node_ids.extend(successfully_processed_in_batch)
            save_progress(processed_node_ids)
            
            # Add a delay between batches to avoid overwhelming the API
            if i + batch_size < len(nodes_to_process):
                print(f"Waiting {args.batch_delay} seconds before processing next batch...")
                await asyncio.sleep(args.batch_delay)
        
        print("\n=== Tech tree image generation completed ===")
        
    except Exception as error:
        print(f"Error in main function: {error}")
        log_error("main", "main_function", error)
        sys.exit(1)

# Run the main function
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate images for tech tree nodes and upload them.")
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
        default=2, # Reduced default batch size
        help="Number of tech tree nodes to process in each batch."
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
