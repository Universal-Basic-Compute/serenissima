#!/usr/bin/env python3
"""
Citizen Generator for La Serenissima.

This module provides functions to generate citizens with historically accurate
names, descriptions, and characteristics for Renaissance Venice.

It can be used by other scripts like immigration.py to create new citizens.
"""

import os
import sys
import logging
import random
import json
import datetime
import time
from typing import Dict, Optional, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizen_generator")

# Load environment variables
load_dotenv()

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        return None
    
    try:
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': Table(api_key, base_id, 'CITIZENS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        return None

def username_exists(tables, username: str) -> bool:
    """Check if a username already exists in the CITIZENS table."""
    try:
        # Query Airtable for citizens with this username
        matching_citizens = tables['citizens'].all(
            formula=f"{{Username}} = '{username}'",
            fields=["Username"]
        )
        
        # If any records are returned, the username exists
        return len(matching_citizens) > 0
    except Exception as e:
        log.error(f"Error checking if username exists: {e}")
        # If there's an error, assume it might exist to be safe
        return True

def generate_citizen(social_class: str) -> Optional[Dict[str, Any]]:
    """Generate a new citizen using Kinos Engine API.
    
    Args:
        social_class: Requested social class (will be ignored, always creates Facchini)
        
    Returns:
        A dictionary containing the citizen data, or None if generation failed
    """
    # Always use Facchini regardless of requested social class
    social_class = "Facchini"
    
    log.info(f"Generating a new citizen of social class: {social_class}")
    
    # Get Kinos API key from environment
    kinos_api_key = os.environ.get('KINOS_API_KEY')
    if not kinos_api_key:
        log.error("KINOS_API_KEY environment variable is not set")
        return None
    
    try:
        # Create a prompt for the Kinos Engine
        prompt = f"Please create a single citizen of the {social_class} social class for our game. The citizen should have a historically accurate Venetian name, description, and characteristics appropriate for Renaissance Venice (1400-1600)."
        
        # Call Kinos Engine API
        response = requests.post(
            "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/ConsiglioDeiDieci/messages/channels/immigration",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {kinos_api_key}"
            },
            json={
                "content": prompt,
                "model": "claude-3-7-sonnet-latest",
                "mode": "creative",
                "addSystem": "You are a historical expert on Renaissance Venice (1400-1600) helping to create a citizen for a historically accurate economic simulation game called La Serenissima. Create 1 unique Venetian citizen of the Facchini social class (unskilled workers, servants, gondoliers, and the working poor) with historically accurate name, description, and characteristics. Your response MUST be a valid JSON object with EXACTLY this format:\n\n```json\n{\n  \"FirstName\": \"string\",\n  \"LastName\": \"string\",\n  \"Username\": \"string\",\n  \"Personality\": \"string\",\n  \"CorePersonality\": [\"Positive Trait\", \"Negative Trait\", \"Core Motivation\"],\n  \"ImagePrompt\": \"string\",\n  \"Ducats\": number\n}\n```\n\nThe Username should be a realistic, human-like username that someone might choose based on their name or characteristics (like 'marco_polo' or 'gondolier42'). Make it lowercase with only letters, numbers and underscores. The CorePersonality should be an array of three strings: [Positive Trait, Negative Trait, Core Motivation], representing the citizen's strength (what they excel at), flaw (what limits them), and driver (what fundamentally motivates them). The Personality field should provide a textual description (2-3 sentences) elaborating on these three core traits, values, and temperament. Do not include any text before or after the JSON. The Ducats value should be between 10,000-100,000. Don't use the same names and tropes than the previous generations."
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Kinos Engine API: {response.status_code} {response.text}")
            return None
        
        # Extract the JSON from Kinos Engine's response
        content = response.json().get("content", "")
        
        # Find the JSON object in the response using a more robust approach
        try:
            # First try to parse the entire content as JSON
            citizen_data = json.loads(content)
        except json.JSONDecodeError:
            # If that fails, try to extract JSON using a more precise regex
            import re
            # Look for JSON object with the expected fields
            json_match = re.search(r'({[\s\S]*?"FirstName"[\s\S]*?"LastName"[\s\S]*?"Personality"[\s\S]*?"CorePersonality"[\s\S]*?"ImagePrompt"[\s\S]*?"Ducats"[\s\S]*?})', content)
            if not json_match:
                log.error(f"Could not extract JSON from Kinos Engine response: {content}")
                return None
            
            try:
                citizen_data = json.loads(json_match.group(1))
            except json.JSONDecodeError as e:
                log.error(f"Failed to parse extracted JSON: {e}")
                return None
        
        # Add required fields
        citizen_data["socialclass"] = social_class
        citizen_data["id"] = f"ctz_{int(time.time())}_{random.randint(1000, 9999)}"
        citizen_data["createdat"] = datetime.datetime.now().isoformat()
        
        # Convert any capitalized keys to lowercase
        lowercase_data = {}
        for key, value in citizen_data.items():
            lowercase_data[key.lower()] = value
        
        citizen_data = lowercase_data
        
        # Find a unique username if the generated one is taken
        if 'username' in citizen_data:
            base_username = citizen_data['username'].lower()
            # Initialize Airtable tables if not already done
            tables = initialize_airtable()
            
            if tables:
                # Check if username exists and modify if needed
                current_username = base_username
                counter = 1
                
                while username_exists(tables, current_username):
                    log.info(f"Username '{current_username}' already exists, trying alternative")
                    current_username = f"{base_username}{counter}"
                    counter += 1
                
                # Update the username in citizen_data
                citizen_data['username'] = current_username
                log.info(f"Final username: {current_username}")
            else:
                log.warning("Could not check for username uniqueness, using generated username as-is")
        else:
            # If no username was generated, create one from first and last name
            first = citizen_data.get('firstname', '').lower()
            last = citizen_data.get('lastname', '').lower()
            if first and last:
                citizen_data['username'] = f"{first}_{last}"
                log.info(f"Created username from name: {citizen_data['username']}")
        
        log.info(f"Successfully generated citizen: {citizen_data['firstname']} {citizen_data['lastname']}")
        return citizen_data
    except Exception as e:
        log.error(f"Error generating citizen: {e}")
        return None

def generate_citizen_batch(social_classes: Dict[str, int]) -> list:
    """Generate a batch of citizens based on specified social class distribution.
    
    Args:
        social_classes: Dictionary mapping social class names to counts
        
    Returns:
        List of generated citizen dictionaries
    """
    citizens = []
    
    for social_class, count in social_classes.items():
        log.info(f"Generating {count} citizens of class {social_class}")
        
        for i in range(count):
            citizen = generate_citizen(social_class)
            if citizen:
                citizens.append(citizen)
                # Add a small delay to avoid rate limiting
                time.sleep(1)
            else:
                log.warning(f"Failed to generate citizen {i+1} of class {social_class}")
    
    log.info(f"Successfully generated {len(citizens)} citizens")
    return citizens

if __name__ == "__main__":
    # This allows the module to be run directly for testing
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate citizens for La Serenissima")
    parser.add_argument("--nobili", type=int, default=0, help="Number of nobili to generate")
    parser.add_argument("--cittadini", type=int, default=0, help="Number of cittadini to generate")
    parser.add_argument("--popolani", type=int, default=0, help="Number of popolani to generate")
    parser.add_argument("--facchini", type=int, default=0, help="Number of facchini to generate")
    parser.add_argument("--output", type=str, help="Output JSON file path")
    
    args = parser.parse_args()
    
    social_classes = {
        "Nobili": args.nobili,
        "Cittadini": args.cittadini,
        "Popolani": args.popolani,
        "Facchini": args.facchini
    }
    
    # Filter out classes with zero count
    social_classes = {k: v for k, v in social_classes.items() if v > 0}
    
    if not social_classes:
        print("Please specify at least one social class to generate")
        sys.exit(1)
    
    citizens = generate_citizen_batch(social_classes)
    
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(citizens, f, indent=2)
        print(f"Saved {len(citizens)} citizens to {args.output}")
    else:
        print(json.dumps(citizens, indent=2))
