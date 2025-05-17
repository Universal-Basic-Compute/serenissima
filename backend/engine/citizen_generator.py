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

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizen_generator")

# Load environment variables
load_dotenv()

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
            "https://kin-engine.ai/v2/blueprints/serenissima-ai/kins/ConsiglioDeiDieci/messages/channels/immigration",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {kinos_api_key}"
            },
            json={
                "content": prompt,
                "model": "claude-3-7-sonnet-latest",
                "mode": "creative",
                "addSystem": "You are a historical expert on Renaissance Venice (1400-1600) helping to create a citizen for a historically accurate economic simulation game called La Serenissima. Create 1 unique Venetian citizen of the Facchini social class (unskilled workers, servants, gondoliers, and the working poor) with historically accurate name, description, and characteristics. Your response MUST be a valid JSON object with EXACTLY this format:\n\n```json\n{\n  \"FirstName\": \"string\",\n  \"LastName\": \"string\",\n  \"Description\": \"string\",\n  \"ImagePrompt\": \"string\",\n  \"Ducats\": number\n}\n```\n\nDo not include any text before or after the JSON. The Ducats value should be between 10,000-100,000."
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
            json_match = re.search(r'({[\s\S]*?"FirstName"[\s\S]*?"LastName"[\s\S]*?"Description"[\s\S]*?"ImagePrompt"[\s\S]*?"Ducats"[\s\S]*?})', content)
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
