#!/usr/bin/env python3
"""
Calculate relevancy scores for AI citizens.

This script:
1. Calls the calculateRelevancies API with calculateAll=true
2. Logs the results
3. Creates an admin notification with the summary

It can be run directly or imported and used by other scripts.
"""

import os
import sys
import logging
import requests
import json
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("calculate_relevancies")

# Load environment variables
load_dotenv()

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        # Return a dictionary of table objects using pyairtable
        return {
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'citizens': Table(api_key, base_id, 'CITIZENS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def create_admin_notification(tables, title: str, message: str) -> bool:
    """Create an admin notification in Airtable."""
    try:
        tables['notifications'].create({
            'Content': title,  # Changed from 'Title' to 'Content'
            'Details': message,  # Changed from 'Message' to 'Details'
            'Type': 'admin',
            'Status': 'unread',
            'CreatedAt': datetime.now().isoformat()
        })
        return True
    except Exception as e:
        log.error(f"Failed to create admin notification: {e}")
        return False

def get_ai_citizens_with_lands(tables) -> List[str]:
    """Get a list of AI citizens who own lands."""
    try:
        # Get all AI citizens
        ai_citizens = tables['citizens'].all(
            formula="{IsAI} = TRUE()",
            fields=["Username"]
        )
        
        ai_usernames = [citizen['fields'].get('Username') for citizen in ai_citizens if 'Username' in citizen['fields']]
        
        if not ai_usernames:
            log.info("No AI citizens found")
            return []
        
        log.info(f"Found {len(ai_usernames)} AI citizens")
        return ai_usernames
    except Exception as e:
        log.error(f"Error getting AI citizens: {e}")
        return []

def calculate_relevancies_for_ai(ai_username: str, base_url: str) -> Dict:
    """Calculate relevancies for a specific AI citizen."""
    try:
        log.info(f"Calculating relevancies for AI: {ai_username}")
        
        # Make the API call
        api_url = f"{base_url}/api/calculateRelevancies"
        response = requests.post(
            api_url,
            json={"aiUsername": ai_username},
            timeout=120  # Increased timeout for larger calculations
        )
        
        if not response.ok:
            log.error(f"API call failed for {ai_username} with status {response.status_code}: {response.text}")
            return {
                "success": False,
                "error": f"API error: {response.status_code}"
            }
        
        # Parse the response
        data = response.json()
        
        if not data.get('success'):
            log.error(f"API returned error for {ai_username}: {data.get('error')}")
            return {
                "success": False,
                "error": data.get('error', 'Unknown error')
            }
        
        # Return the results
        return {
            "success": True,
            "ownedLandCount": data.get('ownedLandCount', 0),
            "relevanciesCreated": len(data.get('relevancyScores', {}))
        }
    except Exception as e:
        log.error(f"Error calculating relevancies for {ai_username}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

def calculate_relevancies() -> bool:
    """Calculate relevancy scores for all AI citizens who own lands."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get the base URL from environment or use default
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        
        # Get all AI citizens
        ai_usernames = get_ai_citizens_with_lands(tables)
        
        if not ai_usernames:
            log.info("No AI citizens found, nothing to do")
            return True
        
        # Process each AI citizen individually to avoid timeouts
        results = {}
        total_relevancies = 0
        
        for ai_username in ai_usernames:
            # Add a small delay between requests to avoid rate limiting
            if results:  # Skip delay for the first request
                time.sleep(2)
            
            result = calculate_relevancies_for_ai(ai_username, base_url)
            results[ai_username] = result
            
            if result.get('success'):
                total_relevancies += result.get('relevanciesCreated', 0)
        
        # Create a detailed message for the notification
        details = []
        for ai, result in results.items():
            if not result.get('success'):
                details.append(f"- {ai}: Error - {result.get('error', 'Unknown error')}")
            else:
                details.append(f"- {ai}: {result.get('relevanciesCreated', 0)} relevancies created (owns {result.get('ownedLandCount', 0)} lands)")
        
        details_text = "\n".join(details)
        
        # Create an admin notification with the results
        create_admin_notification(
            tables,
            "Relevancy Calculation Complete",
            f"Calculated relevancies for {len(ai_usernames)} AI citizens.\n"
            f"Created {total_relevancies} relevancy records.\n\n"
            f"Details:\n{details_text}"
        )
        
        return True
    
    except Exception as e:
        log.error(f"Error calculating relevancies: {e}")
        
        # Try to create an admin notification about the error
        try:
            tables = initialize_airtable()
            create_admin_notification(
                tables,
                "Relevancy Calculation Error",
                f"An error occurred while calculating relevancies: {str(e)}"
            )
        except:
            log.error("Could not create error notification")
        
        return False

if __name__ == "__main__":
    success = calculate_relevancies()
    sys.exit(0 if success else 1)
