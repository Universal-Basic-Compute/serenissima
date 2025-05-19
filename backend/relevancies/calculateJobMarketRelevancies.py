#!/usr/bin/env python3
"""
Calculate job market relevancies for La Serenissima.

This script:
1. Calls the job market relevancy API endpoint
2. Creates a global relevancy for the job market situation
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
log = logging.getLogger("calculate_job_market_relevancies")

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

def calculate_job_market_relevancies() -> bool:
    """Calculate job market relevancy scores."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get the base URL from environment or use default
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")
        
        # Call the job market relevancy API
        api_url = f"{base_url}/api/relevancies/jobs"
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
                "Job Market Relevancy Calculation Error",
                f"Failed to calculate job market relevancies: API error {response.status_code}"
            )
            return False
        
        # Parse the response
        data = response.json()
        
        if not data.get('success'):
            log.error(f"API returned error: {data.get('error')}")
            create_admin_notification(
                tables,
                "Job Market Relevancy Calculation Error",
                f"Failed to calculate job market relevancies: {data.get('error')}"
            )
            return False
        
        # Get statistics from the response
        stats = data.get('statistics', {})
        
        # Create an admin notification with the results
        notification_message = (
            f"Job Market Relevancy Calculation Complete\n\n"
            f"**Current Statistics:**\n"
            f"- Unemployed Citizens: {stats.get('unemployedCount', 'N/A')} ({stats.get('unemploymentRate', 'N/A')}% of population)\n"
            f"- Vacant Jobs: {stats.get('vacantCount', 'N/A')} ({stats.get('vacancyRate', 'N/A')}% vacancy rate)\n"
            f"- Total Citizens: {stats.get('totalCitizens', 'N/A')}\n"
            f"- Total Jobs: {stats.get('totalJobs', 'N/A')}\n"
            f"- Average Wages for Vacant Positions: {stats.get('averageWages', 'N/A')} Ducats\n\n"
            f"Relevancy Score: {data.get('jobMarketRelevancy', {}).get('score', 'N/A')}\n"
            f"Status: {data.get('jobMarketRelevancy', {}).get('status', 'N/A')}\n"
            f"Time Horizon: {data.get('jobMarketRelevancy', {}).get('timeHorizon', 'N/A')}"
        )
        
        create_admin_notification(
            tables,
            "Job Market Relevancy Calculation Complete",
            notification_message
        )
        
        log.info("Successfully calculated job market relevancies")
        return True
    
    except Exception as e:
        log.error(f"Error calculating job market relevancies: {e}")
        
        # Try to create an admin notification about the error
        try:
            tables = initialize_airtable()
            create_admin_notification(
                tables,
                "Job Market Relevancy Calculation Error",
                f"An error occurred while calculating job market relevancies: {str(e)}"
            )
        except:
            log.error("Could not create error notification")
        
        return False

if __name__ == "__main__":
    success = calculate_job_market_relevancies()
    sys.exit(0 if success else 1)
