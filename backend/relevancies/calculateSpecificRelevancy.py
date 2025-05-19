#!/usr/bin/env python3
"""
Calculate a specific type of relevancy score for La Serenissima.

This script:
1. Takes relevancy type and optional username/filters as arguments.
2. Calls the corresponding API endpoint to calculate and save relevancies.
3. Logs the results and creates an admin notification.
"""

import os
import sys
import logging
import requests
import json
from datetime import datetime
from typing import Dict, Optional
from pyairtable import Table
from dotenv import load_dotenv
import argparse
import traceback

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("calculate_specific_relevancy")

# Load environment variables
load_dotenv()

# --- Airtable Initialization and Notification ---
def initialize_airtable_notifications():
    """Initialize Airtable connection for notifications."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials for notifications. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID.")
        return None
    
    try:
        return Table(api_key, base_id, 'NOTIFICATIONS')
    except Exception as e:
        log.error(f"Failed to initialize Airtable notifications table: {e}")
        return None

def create_admin_notification(notifications_table, title: str, message: str) -> bool:
    """Create an admin notification in Airtable."""
    if not notifications_table:
        log.error("Notifications table not initialized. Cannot create admin notification.")
        return False
    try:
        notifications_table.create({
            'Content': title,
            'Details': message,
            'Type': 'admin',
            'Status': 'unread',
            'CreatedAt': datetime.now().isoformat(),
            'Citizen': 'ConsiglioDeiDieci' # Or a relevant system user
        })
        log.info(f"Admin notification created: {title}")
        return True
    except Exception as e:
        log.error(f"Failed to create admin notification: {e}")
        return False

# --- Main Calculation Logic ---
def calculate_specific_relevancy(
    relevancy_type: str, 
    username: Optional[str] = None, 
    type_filter: Optional[str] = None
) -> bool:
    """Calculate and save a specific type of relevancy."""
    notifications_table = initialize_airtable_notifications()
    
    base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
    log.info(f"Using base URL: {base_url}")

    api_url = ""
    payload: Dict[str, any] = {}
    request_timeout = 120 # Default timeout

    if relevancy_type == "proximity":
        if not username:
            log.error("Username is required for proximity relevancy.")
            create_admin_notification(notifications_table, "Proximity Relevancy Error", "Username not provided.")
            return False
        api_url = f"{base_url}/api/relevancies/proximity"
        payload = {"aiUsername": username}
        if type_filter:
            payload["typeFilter"] = type_filter
        log.info(f"Requesting proximity relevancy for user: {username}, filter: {type_filter or 'none'}")
    
    elif relevancy_type == "domination":
        api_url = f"{base_url}/api/relevancies/domination"
        # If username is provided, it's for a specific user. Otherwise, "all" for global.
        payload = {"aiUsername": username if username else "all"}
        log.info(f"Requesting land domination relevancy for: {payload['aiUsername']}")

    elif relevancy_type == "housing":
        api_url = f"{base_url}/api/relevancies/housing"
        payload = {} # Global, aiUsername is optional in the route
        if username: # Pass if provided, though route might ignore for global housing
            payload["aiUsername"] = username 
        log.info("Requesting housing situation relevancy.")
        request_timeout = 60

    elif relevancy_type == "jobs":
        api_url = f"{base_url}/api/relevancies/jobs"
        payload = {} # Global
        if username:
            payload["aiUsername"] = username
        log.info("Requesting job market situation relevancy.")
        request_timeout = 60

    elif relevancy_type == "building_ownership":
        if not username:
            log.error("Username is required for building ownership relevancy.")
            create_admin_notification(notifications_table, "Building Ownership Relevancy Error", "Username not provided.")
            return False
        api_url = f"{base_url}/api/relevancies/building-ownership"
        payload = {"aiUsername": username}
        log.info(f"Requesting building ownership relevancy for user: {username}")
        request_timeout = 60
        
    else:
        log.error(f"Unknown relevancy type: {relevancy_type}")
        create_admin_notification(notifications_table, "Relevancy Calculation Error", f"Unknown relevancy type: {relevancy_type}")
        return False

    try:
        log.info(f"Calling API: POST {api_url} with payload: {json.dumps(payload)}")
        response = requests.post(api_url, json=payload, timeout=request_timeout)
        
        log.info(f"API response status: {response.status_code}")
        if not response.ok:
            error_message = f"API call failed with status {response.status_code}: {response.text}"
            log.error(error_message)
            create_admin_notification(notifications_table, f"{relevancy_type.capitalize()} Relevancy Error", error_message)
            return False

        data = response.json()
        log.info(f"API response data: {json.dumps(data, indent=2)}")

        if not data.get('success'):
            error_detail = data.get('error', 'Unknown API error')
            log.error(f"API returned error: {error_detail}")
            create_admin_notification(notifications_table, f"{relevancy_type.capitalize()} Relevancy Error", f"API error: {error_detail}")
            return False

        # Success notification
        saved_status = "saved" if data.get('saved', False) else "NOT saved (or saving not applicable)"
        relevancies_created = data.get('relevanciesCreated', data.get('relevancyScores', {}))
        if isinstance(relevancies_created, dict): # if it's the scores dict
            relevancies_created = len(relevancies_created)
        
        notification_title = f"{relevancy_type.capitalize()} Relevancy Calculation Complete"
        notification_details = [
            f"Successfully calculated {relevancy_type} relevancies.",
            f"Status: {saved_status}.",
        ]
        if username:
            notification_details.append(f"User: {username}")
        if 'ownedLandCount' in data:
             notification_details.append(f"Owned Land Count: {data.get('ownedLandCount')}")
        if relevancies_created is not None:
            notification_details.append(f"Relevancies Processed/Created: {relevancies_created}")
        if 'statistics' in data:
            notification_details.append(f"Statistics: {json.dumps(data.get('statistics'), indent=2)}")
        
        create_admin_notification(notifications_table, notification_title, "\n".join(notification_details))
        log.info(f"Successfully processed {relevancy_type} relevancies.")
        return True

    except requests.exceptions.RequestException as e:
        error_msg = f"Request failed: {e}\n{traceback.format_exc()}"
        log.error(error_msg)
        create_admin_notification(notifications_table, f"{relevancy_type.capitalize()} Relevancy Error", f"Request exception: {e}")
        return False
    except Exception as e:
        error_msg = f"An unexpected error occurred: {e}\n{traceback.format_exc()}"
        log.error(error_msg)
        create_admin_notification(notifications_table, f"{relevancy_type.capitalize()} Relevancy Error", f"Unexpected error: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Calculate specific relevancy scores.")
    parser.add_argument(
        "--type", 
        required=True, 
        choices=["proximity", "domination", "housing", "jobs", "building_ownership"],
        help="The type of relevancy to calculate."
    )
    parser.add_argument(
        "--username", 
        help="Username of the citizen (required for proximity, building_ownership; optional for domination)."
    )
    parser.add_argument(
        "--type_filter", 
        help="Type filter for proximity relevancy (e.g., 'connected', 'geographic')."
    )
    
    args = parser.parse_args()

    # Validate username requirement for certain types
    if args.type in ["proximity", "building_ownership"] and not args.username:
        parser.error(f"--username is required for relevancy type '{args.type}'.")

    success = calculate_specific_relevancy(
        relevancy_type=args.type,
        username=args.username,
        type_filter=args.type_filter
    )
    
    sys.exit(0 if success else 1)
