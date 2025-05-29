#!/usr/bin/env python3
"""
sync_coatofarms.py - Synchronize coat of arms images from production server to local development environment

This script:
1. Connects to the Airtable database to get all citizens
2. For each citizen with a coat of arms image, downloads the image from the production server
3. Saves the images to the local publichttps://backend.serenissima.ai/public/assets/images/coat-of-arms/ folder
4. Creates a mapping file for quick reference

Usage:
    python sync_coatofarms.py [--dry-run]

Options:
    --dry-run    Show what would be downloaded without actually downloading
"""

import os
import sys
import json
import argparse
import requests
import logging
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple

# Add this import for loading .env files
try:
    from dotenv import load_dotenv
    # Load environment variables from .env file
    load_dotenv()
except ImportError:
    print("Warning: python-dotenv not installed. Install with: pip install python-dotenv")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('sync_coatofarms.log')
    ]
)
log = logging.getLogger('sync_coatofarms')

# Constants
PRODUCTION_URL = "https://serenissima.ai"
LOCAL_STORAGE_PATH = Path("public/coat-of-arms")
MAPPING_FILE = LOCAL_STORAGE_PATH / "mapping.json"
MAX_WORKERS = 5  # Number of concurrent downloads

try:
    from pyairtable import Api
    from pyairtable.formulas import match
except ImportError:
    log.error("pyairtable package is required. Install it with: pip install pyairtable")
    sys.exit(1)

def get_airtable_api():
    """Initialize and return the Airtable API client"""
    api_key = os.environ.get("AIRTABLE_API_KEY")
    if not api_key:
        log.error("AIRTABLE_API_KEY environment variable is not set")
        sys.exit(1)
    
    return Api(api_key)

def get_citizens_from_airtable(api) -> List[Dict]:
    """Fetch all citizens from Airtable"""
    base_id = os.environ.get("AIRTABLE_BASE_ID")
    if not base_id:
        log.error("AIRTABLE_BASE_ID environment variable is not set")
        sys.exit(1)
    
    table_name = "CITIZENS"
    
    try:
        table = api.table(base_id, table_name)
        citizens = table.all()
        log.info(f"Retrieved {len(citizens)} citizens from Airtable")
        return citizens
    except Exception as e:
        log.error(f"Error fetching citizens from Airtable: {e}")
        sys.exit(1)

def extract_coat_of_arms_urls(citizens: List[Dict]) -> Dict[str, str]:
    """Extract coat of arms URLs from citizen records"""
    coat_of_arms_map = {}
    
    log.info(f"Examining {len(citizens)} citizens for coat of arms images")
    
    # Log the field names in the first citizen record to verify structure
    if citizens and len(citizens) > 0:
        log.info(f"First citizen record fields: {list(citizens[0].get('fields', {}).keys())}")
        # Print the entire first record for debugging
        log.info(f"First citizen record: {citizens[0]}")
    
    # Define all possible field names for coat of arms
    possible_field_names = [
        'CoatOfArmsImageUrl', 
        'coat_of_arms_image',
        'coatOfArmsImageUrl',
        'coat_of_arms',
        'coatOfArms',
        'coat_of_arms_url',
        'avatar',
        'profile_image'
    ]
    
    for citizen in citizens:
        fields = citizen.get('fields', {})
        username = fields.get('citizen_name')
        
        # If username is missing, try other possible field names
        if not username:
            username = fields.get('username') or fields.get('Username') or fields.get('name') or fields.get('Name')
        
        # If still no username, use wallet address or record ID
        if not username:
            username = fields.get('Wallet') or fields.get('wallet_address') or citizen.get('id', 'unknown')
            log.info(f"Using wallet or ID as username: {username}")
        
        # Try all possible field names for coat of arms
        coat_of_arms_url = None
        for field_name in possible_field_names:
            if field_name in fields and fields[field_name]:
                coat_of_arms_url = fields[field_name]
                log.info(f"Found coat of arms for citizen {username} in field '{field_name}': {coat_of_arms_url}")
                break
        
        if username and coat_of_arms_url:
            # Ensure the URL is absolute
            if not coat_of_arms_url.startswith(('http://', 'https://')):
                coat_of_arms_url = f"{PRODUCTION_URL}{coat_of_arms_url if coat_of_arms_url.startswith('/') else '/' + coat_of_arms_url}"
            
            coat_of_arms_map[username] = coat_of_arms_url
            log.info(f"Added coat of arms for {username}: {coat_of_arms_url}")
        elif username:
            log.info(f"Citizen {username} has no coat of arms image")
            # Log all fields for this citizen to help identify where the image might be
            log.info(f"All fields for {username}: {fields}")
    
    log.info(f"Found {len(coat_of_arms_map)} citizens with coat of arms images")
    return coat_of_arms_map

def download_image(url_info: Tuple[str, str, str], dry_run: bool = False) -> Optional[Dict]:
    """Download an image from a URL and save it locally"""
    username, url, filename = url_info
    
    if dry_run:
        log.info(f"[DRY RUN] Would download {url} for citizen {username} to {filename}")
        return {"username": username, "url": url, "local_path": str(filename), "success": True}
    
    try:
        # Check if file already exists
        if os.path.exists(filename):
            log.info(f"File already exists for {username}, replacing it: {filename}")
            # We'll continue and overwrite it
        
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        log.info(f"Downloaded {url} for citizen {username} to {filename}")
        return {"username": username, "url": url, "local_path": str(filename), "success": True}
    
    except Exception as e:
        log.error(f"Error downloading {url} for citizen {username}: {e}")
        return {"username": username, "url": url, "error": str(e), "success": False}

def sync_coat_of_arms(dry_run: bool = False):
    """Main function to synchronize coat of arms images"""
    # Create the local storage directory if it doesn't exist
    LOCAL_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
    
    # Get Airtable API client
    api = get_airtable_api()
    
    # Get citizens from Airtable
    citizens = get_citizens_from_airtable(api)
    
    # Extract coat of arms URLs
    coat_of_arms_map = extract_coat_of_arms_urls(citizens)
    
    # Prepare download tasks
    download_tasks = []
    mapping = {}
    
    for username, url in coat_of_arms_map.items():
        # Parse the URL to get the filename
        parsed_url = urlparse(url)
        path = parsed_url.path
        original_filename = os.path.basename(path)
        
        # Create a filename that includes the username for better organization
        # Use the original extension if available
        ext = os.path.splitext(original_filename)[1] or '.png'
        safe_username = username.replace(' ', '_').lower()
        filename = LOCAL_STORAGE_PATH / f"{safe_username}{ext}"
        
        # Add to download tasks
        download_tasks.append((username, url, filename))
        
        # Add to mapping
        mapping[username] = {
            "production_url": url,
            "local_path": f"https://backend.serenissima.ai/public/assets/images/coat-of-arms/{filename.name}"
        }
    
    # Download images in parallel
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_url = {
            executor.submit(download_image, task, dry_run): task[0]
            for task in download_tasks
        }
        
        for future in future_to_url:
            result = future.result()
            if result:
                results.append(result)
    
    # Save mapping file
    if not dry_run:
        with open(MAPPING_FILE, 'w') as f:
            json.dump(mapping, f, indent=2)
        log.info(f"Saved mapping file to {MAPPING_FILE}")
    
    # Print summary
    successful = sum(1 for r in results if r.get('success', False))
    failed = len(results) - successful
    
    log.info(f"Summary: {successful} images downloaded successfully, {failed} failed")
    
    if failed > 0:
        log.warning("Some downloads failed. Check the log for details.")
    
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Synchronize coat of arms images from production to local development")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be downloaded without actually downloading")
    args = parser.parse_args()
    
    log.info(f"Starting coat of arms synchronization {'(DRY RUN)' if args.dry_run else ''}")
    
    try:
        results = sync_coat_of_arms(args.dry_run)
        log.info("Coat of arms synchronization completed")
    except KeyboardInterrupt:
        log.info("Synchronization interrupted by citizen")
        sys.exit(1)
    except Exception as e:
        log.error(f"Synchronization failed: {e}")
        sys.exit(1)
