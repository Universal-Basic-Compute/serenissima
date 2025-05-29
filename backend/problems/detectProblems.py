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
        tables_to_init = {
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS'),
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'problems': Table(api_key, base_id, 'PROBLEMS') # Ensure PROBLEMS table is initialized
        }
        log.info(f"Initialized Airtable tables: {list(tables_to_init.keys())}")
        return tables_to_init
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

def delete_all_problems(problems_table: Table) -> int:
    """Deletes all records from the PROBLEMS table."""
    log.info("--- Deleting all existing problems ---")
    deleted_count = 0
    try:
        all_problem_records = problems_table.all() # Fetch all records, Airtable ID is included by default
        if not all_problem_records:
            log.info("No existing problems found to delete.")
            return 0

        problem_ids_to_delete = [record['id'] for record in all_problem_records]
        count = len(problem_ids_to_delete)
        log.info(f"Found {count} existing problems to delete.")

        if problem_ids_to_delete:
            # The pyairtable library handles batching internally for batch_delete.
            problems_table.batch_delete(problem_ids_to_delete)
            log.info(f"Successfully deleted {count} existing problems.")
            deleted_count = count
        
    except Exception as e:
        log.error(f"Error deleting existing problems: {e}")
        # Depending on desired behavior, could re-raise or just log
    return deleted_count

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
        if not tables or 'problems' not in tables:
            log.error("Failed to initialize Airtable tables, including PROBLEMS table. Aborting problem detection.")
            return False
            
        base_url = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
        log.info(f"Using base URL: {base_url}")

        # Delete all existing problems before starting detection
        problems_table = tables['problems']
        num_problems_deleted_at_start = delete_all_problems(problems_table)
        log.info(f"Deleted {num_problems_deleted_at_start} pre-existing problems from the PROBLEMS table.")

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

        # 4. Detect hungry citizens
        log.info("--- Detecting Hungry Citizens ---")
        hungry_api_url = f"{base_url}/api/problems/hungry"
        log.info(f"Calling API: {hungry_api_url} for all citizens")
        hungry_response = requests.post(hungry_api_url, json={}, timeout=180)
        log.info(f"Hungry API response status: {hungry_response.status_code}")

        if hungry_response.ok:
            hungry_data = hungry_response.json()
            log.info(f"Hungry API response: success={hungry_data.get('success')}, problemCount={hungry_data.get('problemCount')}")
            if hungry_data.get('success'):
                count = hungry_data.get('problemCount', 0)
                saved_count = hungry_data.get('savedCount', 0)
                total_problems_detected += count
                total_problems_saved += saved_count
                all_problem_details_summary.append(f"- Hungry Citizens & Impacts: {count} detected, {saved_count} saved.")
                
                problems_by_citizen_hungry = {}
                for problem_id, problem in hungry_data.get('problems', {}).items():
                    citizen = problem.get('citizen', 'Unknown')
                    problems_by_citizen_hungry[citizen] = problems_by_citizen_hungry.get(citizen, 0) + 1
                if problems_by_citizen_hungry:
                    all_problem_details_summary.append("  Affected citizens (Hungry/Impact): " + ", ".join([f"{c}({num})" for c, num in problems_by_citizen_hungry.items()]))
            else:
                log.error(f"Hungry API returned error: {hungry_data.get('error')}")
                all_problem_details_summary.append(f"- Hungry Citizens & Impacts: API Error - {hungry_data.get('error', 'Unknown')}")
        else:
            log.error(f"Hungry API call failed: {hungry_response.status_code} - {hungry_response.text}")
            all_problem_details_summary.append(f"- Hungry Citizens & Impacts: API Call Failed ({hungry_response.status_code})")
        
        # 5. Detect business buildings with no active contracts
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

        # 6. Detect Zero Rent Amount Buildings
        log.info("--- Detecting Zero Rent Amount Buildings ---")
        zero_rent_api_url = f"{base_url}/api/problems/zero-rent-amount"
        log.info(f"Calling API: {zero_rent_api_url} for all relevant buildings/owners")
        zero_rent_response = requests.post(zero_rent_api_url, json={}, timeout=180)
        log.info(f"Zero Rent Amount API response status: {zero_rent_response.status_code}")

        if zero_rent_response.ok:
            zero_rent_data = zero_rent_response.json()
            log.info(f"Zero Rent Amount API response: success={zero_rent_data.get('success')}, problemCount={zero_rent_data.get('problemCount')}")
            if zero_rent_data.get('success'):
                count = zero_rent_data.get('problemCount', 0)
                saved_count = zero_rent_data.get('savedCount', 0)
                total_problems_detected += count
                total_problems_saved += saved_count
                all_problem_details_summary.append(f"- Zero Rent Buildings: {count} detected, {saved_count} saved.")
                
                problems_by_citizen_zero_rent = {}
                for problem_id, problem in zero_rent_data.get('problems', {}).items(): # Ensure 'problems' key exists
                    citizen = problem.get('citizen', 'Unknown')
                    problems_by_citizen_zero_rent[citizen] = problems_by_citizen_zero_rent.get(citizen, 0) + 1
                if problems_by_citizen_zero_rent:
                    all_problem_details_summary.append("  Affected owners (Zero Rent): " + ", ".join([f"{c}({num})" for c, num in problems_by_citizen_zero_rent.items()]))
            else:
                log.error(f"Zero Rent Amount API returned error: {zero_rent_data.get('error')}")
                all_problem_details_summary.append(f"- Zero Rent Buildings: API Error - {zero_rent_data.get('error', 'Unknown')}")
        else:
            log.error(f"Zero Rent Amount API call failed: {zero_rent_response.status_code} - {zero_rent_response.text}")
            all_problem_details_summary.append(f"- Zero Rent Buildings: API Call Failed ({zero_rent_response.status_code})")

        # 7. Detect Zero Wages for Businesses
        log.info("--- Detecting Zero Wages for Businesses ---")
        zero_wages_api_url = f"{base_url}/api/problems/zero-wages-business"
        log.info(f"Calling API: {zero_wages_api_url} for all relevant business operators")
        zero_wages_response = requests.post(zero_wages_api_url, json={}, timeout=180)
        log.info(f"Zero Wages Business API response status: {zero_wages_response.status_code}")

        if zero_wages_response.ok:
            zero_wages_data = zero_wages_response.json()
            log.info(f"Zero Wages Business API response: success={zero_wages_data.get('success')}, problemCount={zero_wages_data.get('problemCount')}")
            if zero_wages_data.get('success'):
                count = zero_wages_data.get('problemCount', 0)
                saved_count = zero_wages_data.get('savedCount', 0)
                total_problems_detected += count
                total_problems_saved += saved_count
                all_problem_details_summary.append(f"- Zero Wages (Businesses): {count} detected, {saved_count} saved.")
                
                problems_by_operator_zero_wages = {}
                for problem_id, problem in zero_wages_data.get('problems', {}).items():
                    operator = problem.get('citizen', 'Unknown') # 'citizen' field holds the RunBy
                    problems_by_operator_zero_wages[operator] = problems_by_operator_zero_wages.get(operator, 0) + 1
                if problems_by_operator_zero_wages:
                    all_problem_details_summary.append("  Affected operators (Zero Wages): " + ", ".join([f"{c}({num})" for c, num in problems_by_operator_zero_wages.items()]))
            else:
                log.error(f"Zero Wages Business API returned error: {zero_wages_data.get('error')}")
                all_problem_details_summary.append(f"- Zero Wages (Businesses): API Error - {zero_wages_data.get('error', 'Unknown')}")
        else:
            log.error(f"Zero Wages Business API call failed: {zero_wages_response.status_code} - {zero_wages_response.text}")
            all_problem_details_summary.append(f"- Zero Wages (Businesses): API Call Failed ({zero_wages_response.status_code})")
        
        # Create admin notification
        details_text = "\n".join(all_problem_details_summary)
        notification_title = "Daily Problem Detection Summary"
        notification_message = (
            f"Problem detection process completed.\n"
            f"Previously existing problems deleted: {num_problems_deleted_at_start}\n\n"
            f"Total New Problems Detected: {total_problems_detected}\n"
            f"Total New Problems Saved to Airtable: {total_problems_saved}\n\n"
            f"Breakdown of New Problems:\n{details_text}"
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
