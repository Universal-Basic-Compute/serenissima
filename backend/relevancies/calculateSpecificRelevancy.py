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
from typing import Dict, Optional, List
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
def initialize_airtable_table(table_name: str):
    """Initialize Airtable connection for a specific table."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error(f"Missing Airtable credentials for {table_name}. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID.")
        return None
    
    try:
        return Table(api_key, base_id, table_name)
    except Exception as e:
        log.error(f"Failed to initialize Airtable table {table_name}: {e}")
        return None

def get_all_land_owners(lands_table) -> Optional[List[str]]:
    """Fetch all unique land owners from the LANDS table."""
    if not lands_table:
        log.error("LANDS table not initialized. Cannot fetch land owners.")
        return None
    try:
        all_lands = lands_table.all(fields=['Owner'])
        owners = set()
        for record in all_lands:
            if 'Owner' in record['fields'] and record['fields']['Owner']:
                owners.add(record['fields']['Owner'])
        log.info(f"Found {len(owners)} unique land owners.")
        return list(owners)
    except Exception as e:
        log.error(f"Error fetching land owners: {e}")
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
    notifications_table = initialize_airtable_table('NOTIFICATIONS')
    
    base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
    log.info(f"Using base URL: {base_url}")

    api_url = ""
    payload: Dict[str, any] = {}
    request_timeout = 120 # Default timeout
    multi_user_results = [] # For proximity with no username

    if relevancy_type == "proximity":
        api_url = f"{base_url}/api/relevancies/proximity"
        if username:
            # Single user proximity calculation
            payload = {"aiUsername": username}
            if type_filter:
                payload["typeFilter"] = type_filter
            log.info(f"Requesting proximity relevancy for user: {username}, filter: {type_filter or 'none'}")
        else:
            # All landowners proximity calculation
            log.info(f"Requesting proximity relevancy for all landowners, filter: {type_filter or 'none'}")
            lands_table = initialize_airtable_table('LANDS')
            land_owners = get_all_land_owners(lands_table)

            if land_owners is None:
                create_admin_notification(notifications_table, "Proximity Relevancy Error", "Failed to fetch landowners.")
                return False
            if not land_owners:
                create_admin_notification(notifications_table, "Proximity Relevancy Info", "No landowners found to process.")
                return True # No error, just nothing to do

            for owner_username in land_owners:
                import time
                time.sleep(1) # Small delay between API calls
                log.info(f"Processing proximity for landowner: {owner_username}")
                current_payload = {"aiUsername": owner_username}
                if type_filter:
                    current_payload["typeFilter"] = type_filter
                
                try:
                    response = requests.post(api_url, json=current_payload, timeout=request_timeout)
                    if not response.ok:
                        error_message = f"API call failed for {owner_username} with status {response.status_code}: {response.text}"
                        log.error(error_message)
                        multi_user_results.append(f"- {owner_username}: Error - {response.status_code}")
                        continue
                    data = response.json()
                    if not data.get('success'):
                        error_detail = data.get('error', 'Unknown API error')
                        log.error(f"API returned error for {owner_username}: {error_detail}")
                        multi_user_results.append(f"- {owner_username}: API Error - {error_detail}")
                        continue
                    
                    relevancies_created_count = data.get('relevanciesCreated', 0)
                    if isinstance(data.get('relevancyScores'), dict): # API returns relevancyScores as dict
                         relevancies_created_count = len(data.get('relevancyScores', {}))

                    multi_user_results.append(f"- {owner_username}: {relevancies_created_count} relevancies created.")
                except requests.exceptions.RequestException as e_req:
                    log.error(f"Request failed for {owner_username}: {e_req}")
                    multi_user_results.append(f"- {owner_username}: Request Error - {e_req}")
                except Exception as e_exc:
                    log.error(f"Unexpected error for {owner_username}: {e_exc}")
                    multi_user_results.append(f"- {owner_username}: Unexpected Error - {e_exc}")
            
            # All users processed (or attempted), create summary notification
            summary_title = "Proximity Relevancy Calculation Complete (All Landowners)"
            summary_message = "Proximity relevancy calculation process finished for all landowners.\n\nResults:\n" + "\n".join(multi_user_results)
            create_admin_notification(notifications_table, summary_title, summary_message)
            log.info("Finished processing proximity relevancies for all landowners.")
            return True # Overall process completed

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
        # This block is for single-user calls or non-proximity types
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

        # Success notification for single user or non-proximity types
        saved_status = "saved" if data.get('saved', False) else "NOT saved (or saving not applicable)"
        
        # Adjust how relevancies_created is determined based on typical API responses
        relevancies_created_count = 0
        if 'relevanciesSavedCount' in data: # Explicit count from API (domination route now returns this)
            relevancies_created_count = data['relevanciesSavedCount']
        elif 'relevanciesCreated' in data: # Explicit count from API (older routes might use this)
            relevancies_created_count = data['relevanciesCreated']
        elif 'relevancyScores' in data and isinstance(data['relevancyScores'], dict) and relevancy_type == "proximity": # Proximity
            relevancies_created_count = len(data['relevancyScores'])
        elif relevancy_type in ["housing", "jobs"] and data.get('success'): # Housing, Jobs create 1 global
            relevancies_created_count = 1
        elif relevancy_type == "domination" and not username and data.get('success'): # Global domination creates 1 record
             relevancies_created_count = 1 # The API returns relevanciesSavedCount = 1
        elif relevancy_type == "domination" and username and 'relevancyScores' in data and isinstance(data['relevancyScores'], dict): # Domination for specific user
            relevancies_created_count = len(data['relevancyScores'])


        notification_title = f"{relevancy_type.capitalize()} Relevancy Calculation Complete"
        details_for_notification = [
            f"Successfully calculated {relevancy_type} relevancies.",
            f"Status: {saved_status}.",
        ]
        
        target_user_info = username
        if relevancy_type == "domination" and not username:
            target_user_info = "all (Global Report)"
        elif not username and relevancy_type not in ["housing", "jobs"]: # e.g. proximity for all
             target_user_info = "all landowners"


        if target_user_info:
            details_for_notification.append(f"Target: {target_user_info}")
        
        if 'ownedLandCount' in data: # Specific to proximity
             details_for_notification.append(f"Owned Land Count (for proximity user): {data.get('ownedLandCount')}")
        
        details_for_notification.append(f"Relevancy Records Saved: {relevancies_created_count}")

        if 'statistics' in data: # Specific to housing, jobs
            details_for_notification.append(f"Statistics: {json.dumps(data.get('statistics'), indent=2)}")
        
        if relevancy_type == "domination" and not username and 'detailedRelevancy' in data:
            top_landowners = sorted(data['detailedRelevancy'].items(), key=lambda item: item[1]['score'], reverse=True)[:5]
            summary = "\nTop 5 Dominant Landowners:\n" + "\n".join([f"- {item[1]['title'].replace('Land Domination: ', '')}: {item[1]['score']}" for item in top_landowners])
            details_for_notification.append(summary)

        create_admin_notification(notifications_table, notification_title, "\n".join(details_for_notification))
        log.info(f"Successfully processed {relevancy_type} relevancies for {username or 'global context'}.")
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
        help="Username of the citizen (required for building_ownership; optional for proximity and domination). If not provided for proximity, runs for all landowners."
    )
    parser.add_argument(
        "--type_filter", 
        help="Type filter for proximity relevancy (e.g., 'connected', 'geographic')."
    )
    
    args = parser.parse_args()

    # Validate username requirement for certain types
    if args.type == "building_ownership" and not args.username:
        parser.error(f"--username is required for relevancy type '{args.type}'.")
    # Proximity username is now optional. Domination username is also optional.

    success = calculate_specific_relevancy(
        relevancy_type=args.type,
        username=args.username,
        type_filter=args.type_filter
    )
    
    sys.exit(0 if success else 1)
