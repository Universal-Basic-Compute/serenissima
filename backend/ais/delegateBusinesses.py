#!/usr/bin/env python3
"""
Delegate Businesses script for La Serenissima.

This script identifies AI citizens running more than 10 businesses and delegates
the excess businesses (ordered by wages ascending) to other AI citizens
(ordered by Ducats descending), ensuring the new AI does not become overburdened.
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime
from typing import Dict, List, Optional, Any
import requests # Added for API calls
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add project root to sys.path for consistent imports
PROJECT_ROOT_DELEGATE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT_DELEGATE not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DELEGATE)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("delegate_businesses")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000") # Added API_BASE_URL

# Import LogColors and log_header from shared utils
from backend.engine.utils.activity_helpers import LogColors, log_header

BUSINESS_LIMIT_PER_AI = 10

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')

    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        return None

    try:
        api = Api(api_key)
        return {
            'citizens': api.table(base_id, 'CITIZENS'),
            'buildings': api.table(base_id, 'BUILDINGS'),
            'notifications': api.table(base_id, 'NOTIFICATIONS'),
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        return None

def get_all_ai_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all AI citizens, sorted by Ducats descending."""
    try:
        # Filter for IsAI = true and InVenice = true
        # Use sort=['-FieldName'] for compatibility with older pyairtable versions
        ai_citizens = tables['citizens'].all(formula="AND({IsAI}=1, {InVenice}=1)", sort=['-Ducats'])
        log.info(f"Fetched {len(ai_citizens)} AI citizens.")
        return ai_citizens
    except Exception as e:
        log.error(f"Error fetching AI citizens: {e}")
        return []

def get_all_businesses(tables: Dict[str, Table]) -> List[Dict]:
    """Fetch all buildings that are businesses, including their RunBy and Wages."""
    try:
        # Filter for Category = "business"
        businesses = tables['buildings'].all(formula="{Category} = 'business'")
        log.info(f"Fetched {len(businesses)} business buildings.")
        return businesses
    except Exception as e:
        log.error(f"Error fetching businesses: {e}")
        return []

def create_notification(tables: Dict[str, Table], citizen_username: str, title: str, content: str, details: Optional[Dict] = None):
    """Creates a notification for a citizen."""
    try:
        # Prepend the title to the content, as there's no dedicated title field.
        full_content = f"**{title}**: {content}" # Add bold to title
        
        notification_payload = {
            "Citizen": citizen_username,
            "Type": "business_delegation",
            # "Name" field removed as it caused UNKNOWN_FIELD_NAME error
            "Content": full_content,
            "CreatedAt": datetime.now().isoformat(),
            "Details": json.dumps(details) if details else None
        }
        tables['notifications'].create(notification_payload)
        log.info(f"📬 Created notification for {citizen_username}: {title}")
    except Exception as e:
        log.error(f"Error creating notification for {citizen_username}: {e}")

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str, # The citizen initiating the activity (e.g., current RunBy or system acting on their behalf)
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        log_ref.info(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return True # Simulate success for dry run

    api_url = f"{API_BASE_URL}/api/activities/try-create"
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        if response_data.get("success"):
            log_ref.info(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{LogColors.ENDC}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 log_ref.info(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            log_ref.error(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        log_ref.error(f"{LogColors.FAIL}API request failed for activity '{activity_type}' for {citizen_username}: {e}{LogColors.ENDC}")
        return False
    except json.JSONDecodeError:
        log_ref.error(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return False

def delegate_businesses_logic(tables: Dict[str, Table], dry_run: bool = False):
    """Main logic for delegating businesses."""
    # Header will be in the main() function that calls this
    ai_citizens = get_all_ai_citizens(tables)
    all_businesses = get_all_businesses(tables)

    if not ai_citizens or not all_businesses:
        log.info("No AI citizens or businesses found. Exiting.")
        return

    businesses_run_by_ai: Dict[str, List[Dict]] = {ai['fields'].get('Username'): [] for ai in ai_citizens}
    for business in all_businesses:
        run_by_username = business['fields'].get('RunBy')
        if run_by_username and run_by_username in businesses_run_by_ai:
            businesses_run_by_ai[run_by_username].append(business)

    overburdened_ais: List[Dict[str, Any]] = []
    for username, businesses in businesses_run_by_ai.items():
        if len(businesses) > BUSINESS_LIMIT_PER_AI:
            # Sort businesses by Wages ascending for delegation
            businesses_sorted_by_wages = sorted(businesses, key=lambda b: b['fields'].get('Wages', 0))
            overburdened_ais.append({
                'username': username,
                'businesses_to_delegate': businesses_sorted_by_wages[BUSINESS_LIMIT_PER_AI:],
                'current_business_count': len(businesses)
            })
    
    if not overburdened_ais:
        log.info("No AI citizens are running more than 10 businesses. No delegation needed.")
        return

    log.info(f"Found {len(overburdened_ais)} overburdened AIs.")

    # Potential delegatees are all AIs, ordered by Ducats (already sorted)
    # We need to track how many businesses each AI is currently running to avoid overburdening them.
    ai_business_counts = {ai['fields'].get('Username'): len(businesses_run_by_ai.get(ai['fields'].get('Username'), [])) for ai in ai_citizens}

    delegation_summary = []
    total_overburdened_ais = len(overburdened_ais)
    log.info(f"Processing {total_overburdened_ais} overburdened AIs for business delegation.")

    for i, overburdened_ai_info in enumerate(overburdened_ais):
        original_owner_username = overburdened_ai_info['username']
        log.info(f"Processing overburdened AI {i+1}/{total_overburdened_ais}: {original_owner_username}, who runs {overburdened_ai_info['current_business_count']} businesses and needs to delegate {len(overburdened_ai_info['businesses_to_delegate'])}.")
        
        num_businesses_to_delegate_for_this_ai = len(overburdened_ai_info['businesses_to_delegate'])
        for j, business_to_delegate in enumerate(overburdened_ai_info['businesses_to_delegate']):
            # log.info(f"  Attempting to delegate business {j+1}/{num_businesses_to_delegate_for_this_ai} for {original_owner_username}: {business_to_delegate['fields'].get('Name', business_to_delegate['id'])}")
            delegated_successfully = False
            business_id = business_to_delegate['id']
            business_name = business_to_delegate['fields'].get('Name', business_id)
            business_building_id = business_to_delegate['fields'].get('BuildingId', 'UnknownBuildingID')


            for delegatee_ai in ai_citizens:
                delegatee_username = delegatee_ai['fields'].get('Username')
                if delegatee_username == original_owner_username: # Cannot delegate to self
                    continue

                current_delegatee_business_count = ai_business_counts.get(delegatee_username, 0)
                if current_delegatee_business_count < BUSINESS_LIMIT_PER_AI:
                    log.info(f"Attempting to delegate business '{business_name}' (ID: {business_building_id}) from {original_owner_username} to {delegatee_username} (current businesses: {current_delegatee_business_count}).")
                    
                    activity_params = {
                        "businessBuildingId": business_building_id,
                        "newOperatorUsername": delegatee_username,
                        "ownerUsername": business_to_delegate['fields'].get('Owner'), # Actual owner of the building
                        "reason": f"Delegation from {original_owner_username} (overburdened) to {delegatee_username}.",
                        "operationType": "delegate"
                        # notes can be added by the activity creator/processor if needed
                    }

                    # Initiator is the original_owner_username (current RunBy)
                    if call_try_create_activity_api(original_owner_username, "change_business_manager", activity_params, dry_run, log):
                        log.info(f"Successfully initiated delegation of business '{business_name}' to {delegatee_username}.")
                        # Notifications will be handled by the activity processor.
                        
                        delegation_summary.append({
                            "from_ai": original_owner_username,
                            "to_ai": delegatee_username,
                            "business_name": business_name,
                            "business_id": business_building_id,
                            "action": "delegation_initiated" if not dry_run else "would_initiate_delegation"
                        })
                        
                        ai_business_counts[delegatee_username] = current_delegatee_business_count + 1
                        delegated_successfully = True
                        break # Move to the next business to delegate
                    else:
                        log.error(f"Failed to initiate delegation activity for business {business_id} to {delegatee_username}.")
                        # No continue here, if API call fails, we might still try another delegatee if the loop structure allows,
                        # but for now, this means this specific delegation attempt failed.
                        # The outer loop will try other businesses for the overburdened AI.
            
            if not delegated_successfully:
                log.warning(f"Could not find a suitable AI or failed to initiate delegation for business '{business_name}' (ID: {business_building_id}) from {original_owner_username}.")
                delegation_summary.append({
                    "from_ai": original_owner_username,
                    "to_ai": None,
                    "business_name": business_name,
                    "business_id": business_building_id,
                    "action": "delegation_failed_no_candidate"
                })

    if delegation_summary:
        log.info("Delegation process summary:")
        for item in delegation_summary:
            log.info(f"  - Business '{item['business_name']}' ({item['business_id']}): {item['action']} from {item['from_ai']} to {item['to_ai'] if item['to_ai'] else 'N/A'}")
        
        if not dry_run:
             create_notification(
                tables,
                "ConsiglioDeiDieci", # Admin/System user
                "📜 AI Business Delegation Report",
                f"Business delegation process completed. {len(delegation_summary)} actions taken/attempted. See details for specifics.",
                {"delegation_details": delegation_summary}
            )
    else:
        log.info("No businesses were eligible for delegation or no actions taken.")


def main():
    parser = argparse.ArgumentParser(description="Delegate businesses from overburdened AI citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run the script in dry-run mode without making changes.")
    args = parser.parse_args()

    log_header(f"Business Delegation Script (dry_run={args.dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    if not tables:
        log.error("Exiting due to Airtable initialization failure.")
        return

    delegate_businesses_logic(tables, args.dry_run)
    
    log.info("Business delegation script finished.")

if __name__ == "__main__":
    main()
