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

def detect_homeless_problems(base_url: str) -> Dict:
    """Detect homeless citizens for all citizens."""
    try:
        log.info(f"Detecting homeless citizens for all citizens")
        api_url = f"{base_url}/api/problems/homeless"
        log.info(f"Calling API: {api_url}")
        
        response = requests.post(api_url, json={}, timeout=180) # Empty JSON body, increased timeout
        log.info(f"API response status for homeless detection: {response.status_code}")
        
        if not response.ok:
            log.error(f"Homeless API call failed with status {response.status_code}: {response.text}")
            return {"success": False, "error": f"API error: {response.status_code} - {response.text}", "problemCount": 0, "savedCount": 0, "problems": {}}
        
        data = response.json()
        log.info(f"Homeless API response: success={data.get('success')}, problemCount={data.get('problemCount')}, savedCount={data.get('savedCount')}")
        return data
    except Exception as e:
        log.error(f"Error detecting homeless problems: {e}")
        return {"success": False, "error": str(e), "problemCount": 0, "savedCount": 0, "problems": {}}

def detect_workless_problems(base_url: str) -> Dict:
    """Detect workless citizens for all citizens."""
    try:
        log.info(f"Detecting workless citizens for all citizens")
        api_url = f"{base_url}/api/problems/workless"
        log.info(f"Calling API: {api_url}")
        
        response = requests.post(api_url, json={}, timeout=180) # Empty JSON body, increased timeout
        log.info(f"API response status for workless detection: {response.status_code}")
        
        if not response.ok:
            log.error(f"Workless API call failed with status {response.status_code}: {response.text}")
            return {"success": False, "error": f"API error: {response.status_code} - {response.text}", "problemCount": 0, "savedCount": 0, "problems": {}}
        
        data = response.json()
        log.info(f"Workless API response: success={data.get('success')}, problemCount={data.get('problemCount')}, savedCount={data.get('savedCount')}")
        return data
    except Exception as e:
        log.error(f"Error detecting workless problems: {e}")
        return {"success": False, "error": str(e), "problemCount": 0, "savedCount": 0, "problems": {}}

def detect_problems():
    """Detect various problems for citizens and lands."""
    try:
        tables = initialize_airtable()
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")

        total_problems_detected = 0
        total_problems_saved = 0
        all_problem_details_summary = [] # To store summary lines for notification

        # 1. Detect homeless citizens
        log.info("--- Detecting Homeless Citizens ---")
        homeless_data = detect_homeless_problems(base_url)
        if homeless_data.get('success'):
            count = homeless_data.get('problemCount', 0)
            saved_count = homeless_data.get('savedCount', 0)
            total_problems_detected += count
            total_problems_saved += saved_count
            all_problem_details_summary.append(f"- Homeless Citizens: {count} detected, {saved_count} saved.")
            
            problems_by_citizen_homeless = {}
            for problem_id, problem in homeless_data.get('problems', {}).items(): # Ensure 'problems' key exists
                citizen = problem.get('citizen', 'Unknown')
                problems_by_citizen_homeless[citizen] = problems_by_citizen_homeless.get(citizen, 0) + 1
            if problems_by_citizen_homeless:
                 all_problem_details_summary.append("  Affected citizens (Homeless): " + ", ".join([f"{c}({num})" for c, num in problems_by_citizen_homeless.items()]))
        else:
            log.error(f"Homeless detection failed: {homeless_data.get('error')}")
            all_problem_details_summary.append(f"- Homeless Citizens: Detection Error - {homeless_data.get('error', 'Unknown')}")

        # 2. Detect workless citizens
        log.info("--- Detecting Workless Citizens ---")
        workless_data = detect_workless_problems(base_url)
        if workless_data.get('success'):
            count = workless_data.get('problemCount', 0)
            saved_count = workless_data.get('savedCount', 0)
            total_problems_detected += count
            total_problems_saved += saved_count
            all_problem_details_summary.append(f"- Workless Citizens: {count} detected, {saved_count} saved.")

            problems_by_citizen_workless = {}
            for problem_id, problem in workless_data.get('problems', {}).items(): # Ensure 'problems' key exists
                citizen = problem.get('citizen', 'Unknown')
                problems_by_citizen_workless[citizen] = problems_by_citizen_workless.get(citizen, 0) + 1
            if problems_by_citizen_workless:
                 all_problem_details_summary.append("  Affected citizens (Workless): " + ", ".join([f"{c}({num})" for c, num in problems_by_citizen_workless.items()]))
        else:
            log.error(f"Workless detection failed: {workless_data.get('error')}")
            all_problem_details_summary.append(f"- Workless Citizens: Detection Error - {workless_data.get('error', 'Unknown')}")

        # 3. Detect vacant buildings (homes/businesses)
        log.info("--- Detecting Vacant Buildings ---")
        vacant_buildings_api_url = f"{base_url}/api/problems/vacant-buildings"
        log.info(f"Calling API: {vacant_buildings_api_url} for all owners")
        vacant_buildings_response = requests.post(vacant_buildings_api_url, json={}, timeout=180)
        log.info(f"Vacant Buildings API response status: {vacant_buildings_response.status_code}")

        if vacant_buildings_response.ok:
            vacant_data = vacant_buildings_response.json()
            log.info(f"Vacant Buildings API response: success={vacant_data.get('success')}, problemCount={vacant_data.get('problemCount')}")
            if vacant_data.get('success'):
                count = vacant_data.get('problemCount', 0)
                saved_count = vacant_data.get('savedCount', 0)
                total_problems_detected += count
                total_problems_saved += saved_count
                all_problem_details_summary.append(f"- Vacant Buildings: {count} detected, {saved_count} saved.")
                
                problems_by_citizen_vacant = {}
                for problem_id, problem in vacant_data.get('problems', {}).items():
                    citizen = problem.get('citizen', 'Unknown')
                    problems_by_citizen_vacant[citizen] = problems_by_citizen_vacant.get(citizen, 0) + 1
                if problems_by_citizen_vacant:
                    all_problem_details_summary.append("  Affected owners (Vacant Buildings): " + ", ".join([f"{c}({num})" for c, num in problems_by_citizen_vacant.items()]))
            else:
                log.error(f"Vacant Buildings API returned error: {vacant_data.get('error')}")
                all_problem_details_summary.append(f"- Vacant Buildings: API Error - {vacant_data.get('error', 'Unknown')}")
        else:
            log.error(f"Vacant Buildings API call failed: {vacant_buildings_response.status_code} - {vacant_buildings_response.text}")
            all_problem_details_summary.append(f"- Vacant Buildings: API Call Failed ({vacant_buildings_response.status_code})")

        # 4. Detect business buildings with no active contracts
        log.info("--- Detecting Business Buildings with No Active Contracts ---")
        no_contracts_api_url = f"{base_url}/api/problems/no-active-contracts"
        log.info(f"Calling API: {no_contracts_api_url} for all relevant business buildings/owners")
        no_contracts_response = requests.post(no_contracts_api_url, json={}, timeout=180)
        log.info(f"No Active Contracts API response status: {no_contracts_response.status_code}")

        if no_contracts_response.ok:
            no_contracts_data = no_contracts_response.json()
            log.info(f"No Active Contracts API response: success={no_contracts_data.get('success')}, problemCount={no_contracts_data.get('problemCount')}")
            if no_contracts_data.get('success'):
                count = no_contracts_data.get('problemCount', 0)
                saved_count = no_contracts_data.get('savedCount', 0)
                total_problems_detected += count
                total_problems_saved += saved_count
                all_problem_details_summary.append(f"- No Active Contracts (Businesses): {count} detected, {saved_count} saved.")
                
                problems_by_citizen_no_contracts = {}
                for problem_id, problem in no_contracts_data.get('problems', {}).items():
                    citizen = problem.get('citizen', 'Unknown')
                    problems_by_citizen_no_contracts[citizen] = problems_by_citizen_no_contracts.get(citizen, 0) + 1
                if problems_by_citizen_no_contracts:
                    all_problem_details_summary.append("  Affected owners (No Active Contracts): " + ", ".join([f"{c}({num})" for c, num in problems_by_citizen_no_contracts.items()]))
            else:
                log.error(f"No Active Contracts API returned error: {no_contracts_data.get('error')}")
                all_problem_details_summary.append(f"- No Active Contracts (Businesses): API Error - {no_contracts_data.get('error', 'Unknown')}")
        else:
            log.error(f"No Active Contracts API call failed: {no_contracts_response.status_code} - {no_contracts_response.text}")
            all_problem_details_summary.append(f"- No Active Contracts (Businesses): API Call Failed ({no_contracts_response.status_code})")
        
        # Create admin notification
        details_text = "\n".join(all_problem_details_summary)
        notification_title = "Daily Problem Detection Summary"
        notification_message = (
            f"Problem detection process completed.\n\n"
            f"Total Problems Detected: {total_problems_detected}\n"
            f"Total Problems Saved to Airtable: {total_problems_saved}\n\n"
            f"Breakdown:\n{details_text}"
        )
        
        notification_created = create_admin_notification(tables, notification_title, notification_message)
        if notification_created:
            log.info("Created admin notification with comprehensive detection results.")
        else:
            log.warning("Failed to create admin notification for problem detection.")
            
        return True

    except Exception as e:
        log.error(f"Error in detect_problems main function: {e}")
        try:
            tables = initialize_airtable() # Ensure tables is initialized for error notification
            create_admin_notification(
                tables,
                "Problem Detection Script Error",
                f"An critical error occurred in the problem detection script: {str(e)}"
            )
        except Exception as notif_e:
            log.error(f"Could not create critical error notification: {notif_e}")
        return False

if __name__ == "__main__":
    success = detect_problems()
    sys.exit(0 if success else 1)
