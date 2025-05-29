#!/usr/bin/env python3
"""
Calculate housing relevancies for La Serenissima.

This script:
1. Calls the housing relevancy API endpoint
2. Creates a global relevancy for the housing situation
3. Logs the results

It can be run directly or imported and used by other scripts.
"""

import os
import sys
import logging
import requests
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
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
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
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

def calculate_housing_relevancies() -> bool:
    """Calculate housing relevancy scores."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get the base URL from environment or use default
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")
        
        # Call the housing relevancy API
        api_url = f"{base_url}/api/relevancies/housing"
        log.info(f"Calling API: {api_url}")
        
        response = requests.post(
            api_url,
            json={},  # Empty payload to calculate for all citizens
            timeout=60
        )
        
        if not response.ok:
            log.error(f"API call failed with status {response.status_code}: {response.text}")
            create_admin_notification(
                tables,
                "Housing Relevancy Calculation Error",
                f"Failed to calculate housing relevancies: API error {response.status_code}"
            )
            return False
        
        # Parse the response
        data = response.json()
        
        if not data.get('success'):
            log.error(f"API returned error: {data.get('error')}")
            create_admin_notification(
                tables,
                "Housing Relevancy Calculation Error",
                f"Failed to calculate housing relevancies: {data.get('error')}"
            )
            return False
        
        # Get statistics from the response
        stats = data.get('statistics', {})
        homelessness_by_social_class = stats.get('homelessnessBySocialClass', {}) # Récupérer les détails
        
        # Create an admin notification with the results
        notification_message = (
            f"Housing Relevancy Calculation Complete\n\n"
            f"**Current Statistics:**\n"
            f"- Homeless Citizens: {stats.get('homelessCount', 'N/A')} ({stats.get('homelessRate', 'N/A')}% of population)\n"
            f"- Vacant Homes: {stats.get('vacantCount', 'N/A')} ({stats.get('vacancyRate', 'N/A')}% vacancy rate)\n"
            f"- Total Citizens: {stats.get('totalCitizens', 'N/A')}\n"
            f"- Total Homes: {stats.get('totalHomes', 'N/A')}\n"
        )

        if homelessness_by_social_class:
            notification_message += "\n**Homelessness by Social Class:**\n"
            for social_class, class_stats in homelessness_by_social_class.items():
                notification_message += f"- {social_class}: {class_stats.get('homeless', 0)} / {class_stats.get('total', 0)} homeless\n"
        
        notification_message += (
            f"\nGlobal Housing Relevancy Score: {data.get('housingRelevancy', {}).get('score', 'N/A')}\n"
            f"Status: {data.get('housingRelevancy', {}).get('status', 'N/A')}\n"
            f"Time Horizon: {data.get('housingRelevancy', {}).get('timeHorizon', 'N/A')}"
        )
        
        create_admin_notification(
            tables,
            "Housing Relevancy Calculation Complete",
            notification_message
        )
        
        log.info("Successfully calculated housing relevancies")
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
