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

# Load environment variables
load_dotenv()

# Get API keys
CLAUDE_API_KEY = os.getenv("ANTHROPIC_API_KEY")
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY")

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
ICONS_DIR = Path("public/images/resources")
PROGRESS_FILE = Path("data/resource_icon_generation_progress.json")
ERROR_LOG = Path("data/resource_icon_generation_errors.json")

# Ensure directories exist
def ensure_directories_exist():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    RESOURCES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Create parent directory for progress and error files
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)

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

# Download icon from URL
async def download_icon(resource, image_url):
    resource_id = resource.get('id', 'unknown')
    icon_path = ICONS_DIR / f"{resource_id}.png"
    
    try:
        print(f"Downloading icon for {resource_id} to {icon_path}")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as response:
                if response.status != 200:
                    print(f"Error downloading icon for {resource_id}: HTTP {response.status}")
                    log_error(resource_id, 'icon_download', f"HTTP {response.status}")
                    return None
                
                # Save the image
                with open(icon_path, 'wb') as f:
                    f.write(await response.read())
        
        print(f"Successfully downloaded icon for {resource_id}")
        return str(icon_path)
    except Exception as error:
        print(f"Error downloading icon for {resource_id}: {error}")
        log_error(resource_id, 'icon_download', error)
        return None

# Update resource file with icon path
def update_resource_file(resource, icon_path):
    resource_id = resource.get('id', 'unknown')
    file_path = resource.get('file_path')
    
    if not file_path:
        print(f"No file path for resource {resource_id}")
        log_error(resource_id, 'update_file', "No file path")
        return False
    
    try:
        # Read the current file
        with open(file_path, 'r') as f:
            resource_data = json.load(f)
        
        # Update the icon path - use the new path format
        relative_path = f"/images/resources/{resource_id}.png"
        resource_data['icon'] = relative_path
        
        # Write back to the file
        with open(file_path, 'w') as f:
            json.dump(resource_data, f, indent=2)
        
        print(f"Updated resource file for {resource_id} with icon path: {relative_path}")
        return True
    except Exception as error:
        print(f"Error updating resource file for {resource_id}: {error}")
        log_error(resource_id, 'update_file', error)
        return False

# Process a batch of resources
async def process_resource_batch(resources):
    tasks = []
    
    for resource in resources:
        resource_id = resource.get('id', 'unknown')
        print(f"\n=== Processing resource: {resource_id} ===")
        
        # Check if icon already exists
        icon_path = ICONS_DIR / f"{resource_id}.png"
        if icon_path.exists():
            print(f"Icon already exists for {resource_id}, skipping...")
            continue
        
        # Generate prompt
        prompt = await generate_icon_prompt(resource)
        if not prompt:
            print(f"Failed to generate prompt for {resource_id}, skipping...")
            continue
        
        # Generate icon
        image_url = await generate_icon(resource, prompt)
        if not image_url:
            print(f"Failed to generate icon for {resource_id}, skipping...")
            continue
        
        # Download icon
        downloaded_path = await download_icon(resource, image_url)
        if not downloaded_path:
            print(f"Failed to download icon for {resource_id}, skipping...")
            continue
        
        # Update resource file
        update_success = update_resource_file(resource, downloaded_path)
        if not update_success:
            print(f"Failed to update resource file for {resource_id}")
        
        print(f"=== Completed processing for {resource_id} ===\n")
        
        # Add a small delay between resources to avoid rate limiting
        await asyncio.sleep(2)
    
    return [resource.get('id', 'unknown') for resource in resources]

# Main function
async def main():
    try:
        print("Starting resource icon generation...")
        
        # Ensure directories exist
        ensure_directories_exist()
        
        # Load all resources
        all_resources = load_all_resources()
        
        # Load progress
        processed_resource_ids = load_progress()
        
        # Filter resources that don't have icons yet and weren't processed before
        resources_to_process = [
            resource for resource in all_resources
            if not (ICONS_DIR / f"{resource.get('id', 'unknown')}.png").exists()
            and resource.get('id', 'unknown') not in processed_resource_ids
        ]
        
        print(f"Found {len(resources_to_process)} resources that need icons")
        
        # Process resources in batches of 4
        batch_size = 4
        for i in range(0, len(resources_to_process), batch_size):
            batch = resources_to_process[i:i+batch_size]
            print(f"\n=== Processing batch {i//batch_size + 1}/{(len(resources_to_process) + batch_size - 1)//batch_size} ===\n")
            
            processed_batch = await process_resource_batch(batch)
            
            # Save progress after each batch
            processed_resource_ids.extend(processed_batch)
            save_progress(processed_resource_ids)
            
            # Add a delay between batches to avoid overwhelming the API
            if i + batch_size < len(resources_to_process):
                print("Waiting 30 seconds before processing next batch...")
                await asyncio.sleep(30)
        
        print("\n=== Resource icon generation completed ===")
        
    except Exception as error:
        print(f"Error in main function: {error}")
        log_error("main", "main_function", error)
        sys.exit(1)

# Run the main function
if __name__ == "__main__":
    asyncio.run(main())
