#!/usr/bin/env python3
"""
Calculate housing situation relevancies for all citizens.

This script:
1. Calls the housing relevancy API endpoint
2. Creates relevancies for all citizens based on housing situation
3. Creates an admin notification with the results

It can be run directly or imported and used by other scripts.
"""

import os
import sys
import logging
import requests
import json
from datetime import datetime
from typing import Dict, List, Optional
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("calculate_housing_relevancies")

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
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS')
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
            'CreatedAt': datetime.now().isoformat()
        })
        return True
    except Exception as e:
        log.error(f"Failed to create admin notification: {e}")
        return False

def calculate_housing_relevancies() -> bool:
    """Calculate housing situation relevancies for all citizens."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get the base URL from environment or use default
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")
        
        # Use the housing endpoint
        api_url = f"{base_url}/api/relevancies/housing"
        log.info(f"Calling API: {api_url}")
        
        # Make a POST request to the housing endpoint
        # This will calculate and save housing relevancies for all citizens
        response = requests.post(
            api_url,
            json={},  # Empty payload to calculate for all citizens
            timeout=60
        )
        
        log.info(f"Housing API response status: {response.status_code}")
        
        if not response.ok:
            log.error(f"Housing API call failed with status {response.status_code}: {response.text}")
            create_admin_notification(
                tables,
                "Housing Relevancy Calculation Error",
                f"Failed to calculate housing relevancies: API error {response.status_code}\n\n{response.text}"
            )
            return False
        
        # Parse the response
        data = response.json()
        
        # Log a summary of the response
        log.info(f"Housing API response: success={data.get('success')}, statistics={data.get('statistics', {})}")
        
        if not data.get('success'):
            log.error(f"Housing API returned error: {data.get('error')}")
            create_admin_notification(
                tables,
                "Housing Relevancy Calculation Error",
                f"Failed to calculate housing relevancies: {data.get('error', 'Unknown error')}"
            )
            return False
        
        # Create an admin notification with the results
        stats = data.get('statistics', {})
        notification_created = create_admin_notification(
            tables,
            "Housing Relevancy Calculation Complete",
            f"Housing situation relevancies have been calculated and saved.\n\n"
            f"Current Housing Statistics:\n"
            f"- Homeless citizens: {stats.get('homelessCount', 'N/A')}\n"
            f"- Vacant homes: {stats.get('vacantCount', 'N/A')}\n"
            f"- Total citizens: {stats.get('totalCitizens', 'N/A')}\n"
            f"- Total homes: {stats.get('totalHomes', 'N/A')}\n"
            f"- Homelessness rate: {stats.get('homelessRate', 'N/A')}%\n"
            f"- Vacancy rate: {stats.get('vacancyRate', 'N/A')}%\n\n"
            f"Relevancy score: {data.get('housingRelevancy', {}).get('score', 'N/A')}\n"
            f"Status: {data.get('housingRelevancy', {}).get('status', 'N/A')}\n"
            f"Time horizon: {data.get('housingRelevancy', {}).get('timeHorizon', 'N/A')}"
        )
        
        if notification_created:
            log.info("Created admin notification with housing relevancy results")
        else:
            log.warning("Failed to create admin notification")
        
        return True
    
    except Exception as e:
        log.error(f"Error calculating housing relevancies: {e}")
        
        # Try to create an admin notification about the error
        try:
            tables = initialize_airtable()
            create_admin_notification(
                tables,
                "Housing Relevancy Calculation Error",
                f"An error occurred while calculating housing relevancies: {str(e)}"
            )
        except:
            log.error("Could not create error notification")
        
        return False

if __name__ == "__main__":
    success = calculate_housing_relevancies()
    sys.exit(0 if success else 1)
