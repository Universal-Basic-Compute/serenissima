#!/usr/bin/env python3
"""
Detect problems for citizens.

This script:
1. Calls the problems/no-buildings API for each citizen who owns lands
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
log = logging.getLogger("detect_problems")

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
            'Content': title,
            'Details': message,
            'Type': 'admin',
            'Status': 'unread',
            'CreatedAt': datetime.now().isoformat(),
            'Citizen': 'ConsiglioDeiDieci'
        })
        return True
    except Exception as e:
        log.error(f"Failed to create admin notification: {e}")
        return False

def get_citizens_with_lands(tables) -> List[str]:
    """Get a list of citizens who own lands."""
    try:
        # Get all citizens (not just AI citizens)
        citizens = tables['citizens'].all(
            fields=["Username"]
        )
        
        citizen_usernames = [citizen['fields'].get('Username') for citizen in citizens if 'Username' in citizen['fields']]
        
        if not citizen_usernames:
            log.info("No citizens found")
            return []
        
        log.info(f"Found {len(citizen_usernames)} citizens")
        return citizen_usernames
    except Exception as e:
        log.error(f"Error getting citizens: {e}")
        return []

def detect_no_buildings_problems(username: str, base_url: str) -> Dict:
    """Detect lands with no buildings for a specific citizen."""
    try:
        log.info(f"Detecting lands with no buildings for citizen: {username}")
        
        # Use the no-buildings endpoint
        api_url = f"{base_url}/api/problems/no-buildings"
        log.info(f"Calling API: {api_url} for citizen: {username}")
        
        # Make a POST request to the no-buildings endpoint
        response = requests.post(
            api_url,
            json={"username": username},
            timeout=60
        )
        
        log.info(f"API response status: {response.status_code}")
        
        if not response.ok:
            log.error(f"API call failed for {username} with status {response.status_code}: {response.text}")
            return {
                "success": False,
                "error": f"API error: {response.status_code} - {response.text}"
            }
        
        # Parse the response
        data = response.json()
        
        # Log a summary of the response
        log.info(f"API response for {username}: success={data.get('success')}, problemCount={data.get('problemCount')}")
        
        if not data.get('success'):
            log.error(f"API returned error for {username}: {data.get('error')}")
            return {
                "success": False,
                "error": data.get('error', 'Unknown error')
            }
        
        # Return the results
        return {
            "success": True,
            "problemCount": data.get('problemCount', 0),
            "saved": data.get('saved', False),
            "savedCount": data.get('savedCount', 0)
        }
    except Exception as e:
        log.error(f"Error detecting no buildings problems for {username}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

def detect_problems():
    """Detect problems for all lands."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get the base URL from environment or use default
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")
        
        # Process all lands (no username specified)
        log.info("Detecting lands with no buildings for all lands")
        
        # Call the no-buildings endpoint without a specific username
        api_url = f"{base_url}/api/problems/no-buildings"
        log.info(f"Calling API: {api_url} for all lands")
        
        # Make a POST request to the no-buildings endpoint
        response = requests.post(
            api_url,
            json={},  # Empty body to process all lands
            timeout=120  # Longer timeout for processing all lands
        )
        
        log.info(f"API response status: {response.status_code}")
        
        if not response.ok:
            log.error(f"API call failed with status {response.status_code}: {response.text}")
            
            # Create an admin notification about the error
            create_admin_notification(
                tables,
                "Problem Detection Error",
                f"API call failed with status {response.status_code}: {response.text}"
            )
            
            return False
        
        # Parse the response
        data = response.json()
        
        # Log a summary of the response
        log.info(f"API response: success={data.get('success')}, problemCount={data.get('problemCount')}")
        
        if not data.get('success'):
            log.error(f"API returned error: {data.get('error')}")
            
            # Create an admin notification about the error
            create_admin_notification(
                tables,
                "Problem Detection Error",
                f"API returned error: {data.get('error', 'Unknown error')}"
            )
            
            return False
        
        # Group problems by citizen for the notification
        problems_by_citizen = {}
        
        for problem_id, problem in data.get('problems', {}).items():
            citizen = problem.get('citizen', 'Unknown')
            
            if citizen not in problems_by_citizen:
                problems_by_citizen[citizen] = 0
            
            problems_by_citizen[citizen] += 1
        
        # Create a detailed message for the notification
        details = []
        
        for citizen, count in problems_by_citizen.items():
            details.append(f"- {citizen}: {count} problems detected")
        
        details_text = "\n".join(details)
        
        # Create an admin notification with the results
        notification_created = create_admin_notification(
            tables,
            "Problem Detection Complete",
            f"Detected {data.get('problemCount', 0)} problems across {len(problems_by_citizen)} citizens.\n\n"
            f"Details:\n{details_text}\n\n"
            f"Problems saved to Airtable: {data.get('saved', False)}\n"
            f"Number of problems saved: {data.get('savedCount', 0)}"
        )
        
        if notification_created:
            log.info("Created admin notification with detection results")
        else:
            log.warning("Failed to create admin notification")
        
        return True
    
    except Exception as e:
        log.error(f"Error detecting problems: {e}")
        
        # Try to create an admin notification about the error
        try:
            tables = initialize_airtable()
            create_admin_notification(
                tables,
                "Problem Detection Error",
                f"An error occurred while detecting problems: {str(e)}"
            )
        except:
            log.error("Could not create error notification")
        
        return False

if __name__ == "__main__":
    success = detect_problems()
    sys.exit(0 if success else 1)
