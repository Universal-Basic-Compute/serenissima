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
    """Generate a new citizen of the specified social class using Claude API.
    
    Args:
        social_class: One of 'Nobili', 'Cittadini', 'Popolani', or 'Facchini'
        
    Returns:
        A dictionary containing the citizen data, or None if generation failed
    """
    log.info(f"Generating a new citizen of social class: {social_class}")
    
    # Get Claude API key from environment
    claude_api_key = os.environ.get('CLAUDE_API_KEY')
    if not claude_api_key:
        log.error("CLAUDE_API_KEY environment variable is not set")
        return None
    
    try:
        # Create a system prompt for Claude
        system_prompt = f"""You are a historical expert on Renaissance Venice (1400-1600) helping to create a citizen for a historically accurate economic simulation game called La Serenissima.

TASK:
Create 1 unique Venetian citizen of the {social_class} social class with historically accurate name, description, and characteristics.

SOCIAL CLASS INFORMATION:
- Nobili: The noble families who control Venice's government. Wealthy, politically powerful, and often involved in long-distance trade.
- Cittadini: Wealthy non-noble citizens, including successful merchants, professionals, and high-ranking bureaucrats.
- Popolani: Common citizens including craftsmen, shopkeepers, and skilled workers.
- Facchini: Unskilled workers, servants, gondoliers, and the working poor.

For the citizen, provide:
1. FirstName - Historically accurate Venetian first name
2. LastName - Historically accurate Venetian family name (ensure nobili have notable Venetian noble family names)
3. Description - One sentence about personality, traits, and remarkable things about this person
4. ImagePrompt - A detailed prompt for generating an image of this person, including physical appearance, clothing appropriate to their social class, and setting
5. Wealth - Approximate wealth in Ducats, appropriate to their social class:
   - Nobili: 5,000-50,000 ducats
   - Cittadini: 1,000-5,000 ducats
   - Popolani: 100-1,000 ducats
   - Facchini: 10-100 ducats

FORMAT:
Return the data as a valid JSON object with the fields listed above.
"""

        citizen_prompt = f"Please create a single citizen of the {social_class} social class for our game. Return ONLY a valid JSON object with no additional text."
        
        # Call Claude API
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": claude_api_key,
                "anthropic-version": "2023-06-01"
            },
            json={
                "model": "claude-3-7-sonnet-latest",
                "max_tokens": 1000,
                "system": system_prompt,
                "messages": [
                    {
                        "role": "citizen",
                        "content": citizen_prompt
                    }
                ]
            }
        )
        
        if response.status_code != 200:
            log.error(f"Error from Claude API: {response.status_code} {response.text}")
            return None
        
        # Extract the JSON from Claude's response
        content = response.json()["content"][0]["text"]
        
        # Find the JSON object in the response
        import re
        json_match = re.search(r'({[\s\S]*})', content)
        if not json_match:
            log.error(f"Could not extract JSON from Claude response: {content}")
            return None
        
        citizen_data = json.loads(json_match.group(1))
        
        # Add required fields
        citizen_data["socialclass"] = social_class
        citizen_data["id"] = f"ctz_{int(time.time())}_{random.randint(1000, 9999)}"
        citizen_data["createdat"] = datetime.datetime.now().isoformat()
        
        # Convert any capitalized keys to lowercase
        lowercase_data = {}
        for key, value in citizen_data.items():
            lowercase_data[key.lower()] = value
        
        citizen_data = lowercase_data
        
        log.info(f"Successfully generated citizen: {citizen_data['FirstName']} {citizen_data['LastName']}")
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
