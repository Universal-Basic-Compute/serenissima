#!/usr/bin/env python3
"""
Detect a specific type of problem for La Serenissima.

This script:
1. Takes problem type and optional username as arguments.
2. Calls the corresponding API endpoint to detect and save problems.
3. Logs the results and creates an admin notification.
"""

import os
import sys
import logging
import requests
import json
from datetime import datetime
from typing import Dict, Optional, List, Any
from pyairtable import Table
from dotenv import load_dotenv
import argparse
import traceback

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("detect_specific_problems")

# Load environment variables
load_dotenv()

# --- Airtable Initialization and Notification ---
def initialize_airtable_table(table_name: str) -> Optional[Table]:
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

def create_admin_notification(notifications_table: Optional[Table], title: str, message: str) -> bool:
    """Create an admin notification in Airtable."""
    if not notifications_table:
        log.error("Notifications table not initialized. Cannot create admin notification.")
        return False
    try:
        notifications_table.create({
            'Content': title,
            'Details': message,
            'Type': 'admin_problem_detection', # Differentiate from general admin notifications
            'Status': 'unread',
            'CreatedAt': datetime.now().isoformat(),
            'Citizen': 'ConsiglioDeiDieci' 
        })
        log.info(f"Admin notification created: {title}")
        return True
    except Exception as e:
        log.error(f"Failed to create admin notification: {e}")
        return False

# --- Main Detection Logic ---
def detect_specific_problems(
    problem_type: str, 
    username: Optional[str] = None
) -> bool:
    """Detect and save a specific type of problem."""
    notifications_table = initialize_airtable_table('NOTIFICATIONS')
    
    base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
    log.info(f"Using base URL: {base_url}")

    api_url_path_map = {
        "homeless": "/api/problems/homeless",
        "workless": "/api/problems/workless",
        "vacant_buildings": "/api/problems/vacant-buildings",
        "no_active_contracts": "/api/problems/no-active-contracts",
        "hungry": "/api/problems/hungry",
        "zero_rent_price": "/api/problems/zero-rent-amount",
        "zero_wages_business": "/api/problems/zero-wages-business", # Added zero_wages_business
    }

    if problem_type not in api_url_path_map:
        log.error(f"Unknown problem type: {problem_type}")
        create_admin_notification(notifications_table, "Problem Detection Error", f"Unknown problem type specified: {problem_type}")
        return False

    api_url = f"{base_url}{api_url_path_map[problem_type]}"
    payload: Dict[str, Any] = {}
    request_timeout = 180 # Default timeout, can be long for "all" operations

    if username:
        payload["username"] = username # The API routes expect 'username' in the body
        log_target_desc = f"user: {username}"
    else:
        log_target_desc = "all relevant entities"
        # For "all", an empty payload is sent to the API.

    log.info(f"Requesting '{problem_type}' problem detection for {log_target_desc}")

    try:
        log.info(f"Calling API: POST {api_url} with payload: {json.dumps(payload)}")
        response = requests.post(api_url, json=payload, timeout=request_timeout)
        
        log.info(f"API response status: {response.status_code}")
        if not response.ok:
            error_message = f"API call for '{problem_type}' failed for {log_target_desc} with status {response.status_code}: {response.text}"
            log.error(error_message)
            create_admin_notification(notifications_table, f"{problem_type.replace('_', ' ').capitalize()} Problem Detection Error", error_message)
            return False

        data = response.json()
        log.info(f"API response data: {json.dumps(data, indent=2)}")

        if not data.get('success'):
            error_detail = data.get('error', 'Unknown API error')
            log.error(f"API returned error for '{problem_type}' ({log_target_desc}): {error_detail}")
            create_admin_notification(notifications_table, f"{problem_type.replace('_', ' ').capitalize()} Problem Detection Error", f"API error: {error_detail}")
            return False

        # Success notification
        problem_count = data.get('problemCount', 0)
        saved_count = data.get('savedCount', 0)
        api_saved_flag = data.get('saved', False)
        
        processed_user_info = data.get('processedUser', username if username else 'all')

        notification_title = f"{problem_type.replace('_', ' ').capitalize()} Problem Detection Complete"
        details_for_notification = [
            f"Successfully detected '{problem_type}' problems.",
            f"Target: {processed_user_info}.",
            f"Problems Detected by API: {problem_count}.",
            f"Problems Saved to Airtable by API: {saved_count}.",
            f"API Save Operation Succeeded: {'Yes' if api_saved_flag else 'No'}.",
        ]
        
        # Add summary of affected citizens if problems were detected for "all"
        if not username and problem_count > 0 and isinstance(data.get('problems'), dict):
            affected_citizens = set()
            for problem_details in data['problems'].values():
                if 'citizen' in problem_details:
                    affected_citizens.add(problem_details['citizen'])
            if affected_citizens:
                details_for_notification.append(f"Affected Citizens ({len(affected_citizens)}): {', '.join(sorted(list(affected_citizens))[:10])}{'...' if len(affected_citizens) > 10 else ''}")


        create_admin_notification(notifications_table, notification_title, "\n".join(details_for_notification))
        log.info(f"Successfully processed '{problem_type}' problems for {log_target_desc}. Detected: {problem_count}, Saved: {saved_count}.")
        return True

    except requests.exceptions.RequestException as e:
        error_msg = f"Request failed for '{problem_type}' ({log_target_desc}): {e}\n{traceback.format_exc()}"
        log.error(error_msg)
        create_admin_notification(notifications_table, f"{problem_type.replace('_', ' ').capitalize()} Problem Detection Error", f"Request exception: {e}")
        return False
    except Exception as e:
        error_msg = f"An unexpected error occurred during '{problem_type}' detection for {log_target_desc}: {e}\n{traceback.format_exc()}"
        log.error(error_msg)
        create_admin_notification(notifications_table, f"{problem_type.replace('_', ' ').capitalize()} Problem Detection Error", f"Unexpected error: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Detect specific types of problems.")
    parser.add_argument(
        "--type", 
        required=True, 
        choices=["homeless", "workless", "vacant_buildings", "no_active_contracts", "hungry", "zero_rent_price", "zero_wages_business"],
        help="The type of problem to detect."
    )
    parser.add_argument(
        "--username", 
        help="Username of the citizen (optional). If not provided, runs for all relevant entities."
    )
    
    args = parser.parse_args()

    success = detect_specific_problems(
        problem_type=args.type,
        username=args.username
    )
    
    sys.exit(0 if success else 1)
