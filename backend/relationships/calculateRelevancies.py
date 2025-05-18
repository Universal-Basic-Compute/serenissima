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

import json
import traceback

def calculate_land_domination_relevancies(base_url: str) -> Dict:
    """Calculate land domination relevancies for all citizens."""
    try:
        log.info("Calculating land domination relevancies")
        
        # Use the domination endpoint
        api_url = f"{base_url}/api/relevancies/domination"
        log.info(f"Calling API: {api_url}")
        
        # Make a POST request to the domination endpoint
        # This will calculate and save domination relevancies for all citizens
        response = requests.post(
            api_url,
            json={},  # Empty payload as the endpoint handles all citizens
            timeout=120
        )
        
        log.info(f"Domination API response status: {response.status_code}")
        
        if not response.ok:
            log.error(f"Domination API call failed with status {response.status_code}: {response.text}")
            return {
                "success": False,
                "error": f"API error: {response.status_code} - {response.text}"
            }
        
        # Parse the response
        data = response.json()
        
        # Log a summary of the response
        log.info(f"Domination API response: success={data.get('success')}, relevancyScores count={len(data.get('relevancyScores', {}))}")
        
        if not data.get('success'):
            log.error(f"Domination API returned error: {data.get('error')}")
            return {
                "success": False,
                "error": data.get('error', 'Unknown error')
            }
        
        # Return the results
        return {
            "success": True,
            "relevanciesCreated": len(data.get('relevancyScores', {})),
            "saved": data.get('saved', False)
        }
    except Exception as e:
        log.error(f"Error calculating land domination relevancies: {e}")
        log.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

def calculate_relevancies_for_ai(username: str, base_url: str, type_filter: Optional[str] = None) -> Dict:
    """Calculate relevancies for a specific citizen with optional type filter."""
    try:
        log.info(f"Calculating relevancies for citizen: {username}" + 
                (f" with type filter: {type_filter}" if type_filter else ""))
        
        # Use the new proximity endpoint
        api_url = f"{base_url}/api/relevancies/proximity"
        log.info(f"Calling API: {api_url} for citizen: {username}")
        
        # Prepare the request payload
        payload = {
            "aiUsername": username  # Keep the parameter name for compatibility
        }
        
        # Add type filter if provided
        if type_filter:
            payload["typeFilter"] = type_filter
        
        response = requests.post(
            api_url,
            json=payload,
            timeout=120  # Increased timeout for larger calculations
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
        log.info(f"API response for {username}: success={data.get('success')}, ownedLandCount={data.get('ownedLandCount')}, relevancyScores count={len(data.get('relevancyScores', {}))}")
        
        if not data.get('success'):
            log.error(f"API returned error for {username}: {data.get('error')}")
            return {
                "success": False,
                "error": data.get('error', 'Unknown error')
            }
        
        # Return the results
        return {
            "success": True,
            "ownedLandCount": data.get('ownedLandCount', 0),
            "relevanciesCreated": len(data.get('relevancyScores', {})),
            "saved": data.get('saved', False)
        }
    except Exception as e:
        log.error(f"Error calculating relevancies for {username}: {e}")
        log.error(traceback.format_exc())  # Print the full traceback
        return {
            "success": False,
            "error": str(e)
        }

def calculate_relevancies(type_filter: Optional[str] = None) -> bool:
    """Calculate relevancy scores for all citizens who own lands."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get the base URL from environment or use default
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")
        
        if type_filter:
            log.info(f"Using type filter: {type_filter}")
        
        # Get all citizens
        citizen_usernames = get_citizens_with_lands(tables)
        
        if not citizen_usernames:
            log.info("No citizens found, nothing to do")
            return True
        
        # Process each citizen individually to avoid timeouts
        results = {}
        total_relevancies = 0
        
        for username in citizen_usernames:
            # Add a small delay between requests to avoid rate limiting
            if results:  # Skip delay for the first request
                time.sleep(2)
            
            result = calculate_relevancies_for_ai(username, base_url, type_filter)
            results[username] = result
            
            if result.get('success'):
                total_relevancies += result.get('relevanciesCreated', 0)
                log.info(f"Successfully calculated {result.get('relevanciesCreated', 0)} relevancies for {username}")
                
                # Check if relevancies were saved to Airtable
                if result.get('saved', False):
                    log.info(f"Relevancies for {username} were saved to Airtable")
                else:
                    log.warning(f"Relevancies for {username} were calculated but NOT saved to Airtable")
            else:
                log.error(f"Failed to calculate relevancies for {username}: {result.get('error')}")
        
        # Calculate global land domination relevancies
        log.info("Calculating global land domination relevancies")
        domination_result = calculate_land_domination_relevancies(base_url)
        
        if domination_result.get('success'):
            total_relevancies += domination_result.get('relevanciesCreated', 0)
            log.info(f"Successfully calculated {domination_result.get('relevanciesCreated', 0)} land domination relevancies")
        else:
            log.error(f"Failed to calculate land domination relevancies: {domination_result.get('error')}")
        
        # Create a detailed message for the notification
        details = []
        for citizen, result in results.items():
            if not result.get('success'):
                details.append(f"- {citizen}: Error - {result.get('error', 'Unknown error')}")
            else:
                saved_status = "saved to Airtable" if result.get('saved', False) else "NOT saved to Airtable"
                details.append(f"- {citizen}: {result.get('relevanciesCreated', 0)} relevancies created (owns {result.get('ownedLandCount', 0)} lands) - {saved_status}")
        
        # Add domination relevancies to the details
        if domination_result.get('success'):
            details.append(f"- Global land domination relevancies: {domination_result.get('relevanciesCreated', 0)} created")
        else:
            details.append(f"- Global land domination relevancies: Error - {domination_result.get('error', 'Unknown error')}")
        
        details_text = "\n".join(details)
        
        # Create an admin notification with the results
        notification_created = create_admin_notification(
            tables,
            "Relevancy Calculation Complete",
            f"Calculated relevancies for {len(citizen_usernames)} citizens.\n"
            f"Created {total_relevancies} relevancy records (including land domination relevancies).\n\n"
            f"Details:\n{details_text}"
        )
        
        if notification_created:
            log.info("Created admin notification with calculation results")
        else:
            log.warning("Failed to create admin notification")
        
        return True
    
    except Exception as e:
        log.error(f"Error calculating relevancies: {e}")
        log.error(traceback.format_exc())  # Print the full traceback
        
        # Try to create an admin notification about the error
        try:
            tables = initialize_airtable()
            create_admin_notification(
                tables,
                "Relevancy Calculation Error",
                f"An error occurred while calculating relevancies: {str(e)}\n\n{traceback.format_exc()}"
            )
        except:
            log.error("Could not create error notification")
        
        return False

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Calculate relevancy scores for AI citizens")
    parser.add_argument("--type", help="Filter relevancies by type (e.g., 'connected', 'geographic')")
    
    args = parser.parse_args()
    
    success = calculate_relevancies(type_filter=args.type)
    sys.exit(0 if success else 1)
