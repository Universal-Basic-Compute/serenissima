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

# Load environment variables
load_dotenv()

# Get API keys
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") # Changed from CLAUDE_API_KEY
IDEOGRAM_API_KEY = os.getenv("IDEOGRAM_API_KEY")

if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not set in environment variables")
    sys.exit(1)

if not IDEOGRAM_API_KEY:
    print("Error: IDEOGRAM_API_KEY not set in environment variables")
    sys.exit(1)

# Configure Gemini client
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-2.5-pro-preview-03-25') # Specify the model without 'gemini/' prefix

# Directory paths
TECH_TREE_DIR = Path("components/Knowledge")
IMAGES_DIR = Path("public/images/tech-tree")
PROGRESS_FILE = Path("data/tech_tree_image_generation_progress.json")
ERROR_LOG = Path("data/tech_tree_image_generation_errors.json")

# Ensure directories exist
def ensure_directories_exist():
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)

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
                    'image': node['image'].strip("'\"") if 'image' in node else "/images/tech-tree/" + node['id'].strip("'\"") + ".jpg"
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

# Download image from URL
async def download_image(node, image_url):
    node_id = node['id']
    image_path = IMAGES_DIR / f"{node_id}.jpg"
    
    try:
        print(f"Downloading image for {node_id} to {image_path}")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(image_url) as response:
                if response.status != 200:
                    print(f"Error downloading image for {node_id}: HTTP {response.status}")
                    log_error(node_id, 'image_download', f"HTTP {response.status}")
                    return None
                
                # Save the image
                with open(image_path, 'wb') as f:
                    f.write(await response.read())
        
        print(f"Successfully downloaded image for {node_id}")
        return str(image_path)
    except Exception as error:
        print(f"Error downloading image for {node_id}: {error}")
        log_error(node_id, 'image_download', error)
        return None

# Process a batch of nodes
async def process_node_batch(nodes):
    processed_ids = []
    
    for node in nodes:
        node_id = node['id']
        print(f"\n=== Processing node: {node_id} ===")
        
        # Check if image already exists
        image_path = IMAGES_DIR / f"{node_id}.jpg"
        if image_path.exists():
            print(f"Image already exists for {node_id}, skipping...")
            processed_ids.append(node_id)
            continue
        
        # Generate prompt
        prompt = await generate_image_prompt(node)
        if not prompt:
            print(f"Failed to generate prompt for {node_id}, skipping...")
            continue
        
        # Generate image
        image_url = await generate_image(node, prompt)
        if not image_url:
            print(f"Failed to generate image for {node_id}, skipping...")
            continue
        
        # Download image
        downloaded_path = await download_image(node, image_url)
        if not downloaded_path:
            print(f"Failed to download image for {node_id}, skipping...")
            continue
        
        print(f"=== Completed processing for {node_id} ===\n")
        processed_ids.append(node_id)
        
        # Add a small delay between nodes to avoid rate limiting
        await asyncio.sleep(2)
    
    return processed_ids

# Main function
async def main():
    try:
        print("Starting tech tree image generation...")
        
        # Ensure directories exist
        ensure_directories_exist()
        
        # Extract tech tree nodes
        all_nodes = extract_tech_tree_nodes()
        
        # Load progress
        processed_node_ids = load_progress()
        
        # Filter nodes that don't have images yet and weren't processed before
        nodes_to_process = [
            node for node in all_nodes
            if not (IMAGES_DIR / f"{node['id']}.jpg").exists()
            and node['id'] not in processed_node_ids
        ]
        
        print(f"Found {len(nodes_to_process)} nodes that need images")
        
        # Process nodes in batches of 3
        batch_size = 3
        for i in range(0, len(nodes_to_process), batch_size):
            batch = nodes_to_process[i:i+batch_size]
            print(f"\n=== Processing batch {i//batch_size + 1}/{(len(nodes_to_process) + batch_size - 1)//batch_size} ===\n")
            
            processed_batch = await process_node_batch(batch)
            
            # Save progress after each batch
            processed_node_ids.extend(processed_batch)
            save_progress(processed_node_ids)
            
            # Add a delay between batches to avoid overwhelming the API
            if i + batch_size < len(nodes_to_process):
                print("Waiting 30 seconds before processing next batch...")
                await asyncio.sleep(30)
        
        print("\n=== Tech tree image generation completed ===")
        
    except Exception as error:
        print(f"Error in main function: {error}")
        log_error("main", "main_function", error)
        sys.exit(1)

# Run the main function
if __name__ == "__main__":
    asyncio.run(main())
