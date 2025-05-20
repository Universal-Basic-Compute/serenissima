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

def get_all_building_owners(buildings_table) -> Optional[List[str]]:
    """Fetch all unique building owners from the BUILDINGS table."""
    if not buildings_table:
        log.error("BUILDINGS table not initialized. Cannot fetch building owners.")
        return None
    try:
        all_buildings = buildings_table.all(fields=['Owner'])
        owners = set()
        for record in all_buildings:
            if 'Owner' in record['fields'] and record['fields']['Owner']:
                owners.add(record['fields']['Owner'])
        log.info(f"Found {len(owners)} unique building owners.")
        return list(owners)
    except Exception as e:
        log.error(f"Error fetching building owners: {e}")
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
            payload = {"Citizen": username}
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
                current_payload = {"Citizen": owner_username}
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
        payload = {"Citizen": username if username else "all"} # This was correct
        log.info(f"Requesting land domination relevancy for: {payload['Citizen']}")

    elif relevancy_type == "housing":
        api_url = f"{base_url}/api/relevancies/housing"
        payload = {} # Global, Citizen is optional in the route
        if username: # Pass if provided, though route might ignore for global housing
            payload["Citizen"] = username 
        log.info("Requesting housing situation relevancy.")
        request_timeout = 60

    elif relevancy_type == "jobs":
        api_url = f"{base_url}/api/relevancies/jobs"
        payload = {} # Global
        if username:
            payload["Citizen"] = username
        log.info("Requesting job market situation relevancy.")
        request_timeout = 60

    elif relevancy_type == "building_ownership":
        api_url = f"{base_url}/api/relevancies/building-ownership"
        request_timeout = 60
        if username:
            # Single user building_ownership calculation
            payload = {"Citizen": username}
            log.info(f"Requesting building ownership relevancy for user: {username}")
        else:
            # All building_owners building_ownership calculation
            log.info("Requesting building ownership relevancy for all building owners.")
            # For "all building owners", we might need to fetch all citizens instead,
            # as the API processes based on the citizen provided.
            # Let's fetch all citizens from CITIZENS table for this "all" case.
            citizens_table = initialize_airtable_table('CITIZENS')
            all_citizens_records = citizens_table.all(fields=['Username'])
            all_citizen_usernames = [r['fields']['Username'] for r in all_citizens_records if 'Username' in r['fields']]


            if not all_citizen_usernames:
                create_admin_notification(notifications_table, "Building Ownership Relevancy Error", "Failed to fetch any citizens to process for building ownership.")
                return False
            
            log.info(f"Found {len(all_citizen_usernames)} citizens to process for building ownership relevancies.")

            for owner_username in all_citizen_usernames:
                import time
                time.sleep(1) # Small delay between API calls
                log.info(f"Processing building ownership for: {owner_username}")
                current_payload = {"Citizen": owner_username}
                
                try:
                    response = requests.post(api_url, json=current_payload, timeout=request_timeout)
                    if not response.ok:
                        error_message = f"API call failed for {owner_username} (building_ownership) with status {response.status_code}: {response.text}"
                        log.error(error_message)
                        multi_user_results.append(f"- {owner_username}: Error - {response.status_code}")
                        continue
                    data = response.json()
                    if not data.get('success'):
                        error_detail = data.get('error', 'Unknown API error')
                        log.error(f"API returned error for {owner_username} (building_ownership): {error_detail}")
                        multi_user_results.append(f"- {owner_username}: API Error - {error_detail}")
                        continue
                    
                    log.info(f"API response data for {owner_username} (building_ownership): {json.dumps(data, indent=2)}")

                    relevancies_created_count = 0
                    if 'relevancyScores' in data and isinstance(data.get('relevancyScores'), dict):
                         relevancies_created_count = len(data.get('relevancyScores', {}))
                    elif 'relevanciesSavedCount' in data: # Some routes might return this
                        relevancies_created_count = data.get('relevanciesSavedCount',0)
                    
                    if relevancies_created_count == 0:
                        log.info(f"No building ownership relevancies found or created for {owner_username} based on API response.")


                    multi_user_results.append(f"- {owner_username}: {relevancies_created_count} building ownership relevancies created.")
                except requests.exceptions.RequestException as e_req:
                    log.error(f"Request failed for {owner_username} (building_ownership): {e_req}")
                    multi_user_results.append(f"- {owner_username}: Request Error - {e_req}")
                except Exception as e_exc:
                    log.error(f"Unexpected error for {owner_username} (building_ownership): {e_exc}")
                    multi_user_results.append(f"- {owner_username}: Unexpected Error - {e_exc}")
            
            summary_title = "Building Ownership Relevancy Complete (All Citizens Processed)"
            summary_message = "Building ownership relevancy calculation process finished for all citizens.\n\nResults:\n" + "\n".join(multi_user_results)
            create_admin_notification(notifications_table, summary_title, summary_message)
            log.info("Finished processing building ownership relevancies for all citizens.")
            return True # Overall process completed

    elif relevancy_type == "building_operator":
        api_url = f"{base_url}/api/relevancies/building-operator"
        request_timeout = 60
        if username:
            payload = {"Citizen": username}
            log.info(f"Requesting building operator relevancy for user: {username}")
        else:
            log.info("Requesting building operator relevancy for all citizens.")
            citizens_table = initialize_airtable_table('CITIZENS')
            all_citizens_records = citizens_table.all(fields=['Username'])
            all_citizen_usernames = [r['fields']['Username'] for r in all_citizens_records if 'Username' in r['fields']]

            if not all_citizen_usernames:
                create_admin_notification(notifications_table, "Building Operator Relevancy Error", "Failed to fetch citizens.")
                return False
            
            log.info(f"Found {len(all_citizen_usernames)} citizens to process for building operator relevancies.")

            for citizen_username_loop in all_citizen_usernames:
                import time
                time.sleep(1)
                log.info(f"Processing building operator relevancy for: {citizen_username_loop}")
                current_payload = {"Citizen": citizen_username_loop}
                try:
                    response = requests.post(api_url, json=current_payload, timeout=request_timeout)
                    if not response.ok:
                        error_message = f"API call failed for {citizen_username_loop} (building_operator) with status {response.status_code}: {response.text}"
                        log.error(error_message)
                        multi_user_results.append(f"- {citizen_username_loop}: Error - {response.status_code}")
                        continue
                    data = response.json()
                    log.info(f"API response data for {citizen_username_loop} (building_operator): {json.dumps(data, indent=2)}")
                    if not data.get('success'):
                        error_detail = data.get('error', 'Unknown API error')
                        log.error(f"API returned error for {citizen_username_loop} (building_operator): {error_detail}")
                        multi_user_results.append(f"- {citizen_username_loop}: API Error - {error_detail}")
                        continue
                    
                    relevancies_created_count = data.get('relevanciesSavedCount', 0)
                    if relevancies_created_count == 0:
                         log.info(f"No building operator relevancies created for {citizen_username_loop} based on API response.")
                    multi_user_results.append(f"- {citizen_username_loop}: {relevancies_created_count} building operator relevancies created/saved.")
                except requests.exceptions.RequestException as e_req:
                    log.error(f"Request failed for {citizen_username_loop} (building_operator): {e_req}")
                    multi_user_results.append(f"- {citizen_username_loop}: Request Error - {e_req}")
                except Exception as e_exc:
                    log.error(f"Unexpected error for {citizen_username_loop} (building_operator): {e_exc}")
                    multi_user_results.append(f"- {citizen_username_loop}: Unexpected Error - {e_exc}")
            
            summary_title = "Building Operator Relevancy Complete (All Citizens Processed)"
            summary_message = "Building operator relevancy calculation process finished for all citizens.\n\nResults:\n" + "\n".join(multi_user_results)
            create_admin_notification(notifications_table, summary_title, summary_message)
            log.info("Finished processing building operator relevancies for all citizens.")
            return True

    elif relevancy_type == "building_occupant":
        api_url = f"{base_url}/api/relevancies/building-occupant"
        request_timeout = 60
        if username:
            payload = {"Citizen": username}
            log.info(f"Requesting building occupant relationship relevancy for user: {username}")
        else:
            log.info("Requesting building occupant relationship relevancy for all citizens.")
            citizens_table = initialize_airtable_table('CITIZENS')
            all_citizens_records = citizens_table.all(fields=['Username'])
            all_citizen_usernames = [r['fields']['Username'] for r in all_citizens_records if 'Username' in r['fields']]

            if not all_citizen_usernames:
                create_admin_notification(notifications_table, "Building Occupant Relevancy Error", "Failed to fetch citizens.")
                return False
            
            log.info(f"Found {len(all_citizen_usernames)} citizens to process for building occupant relevancies.")

            for citizen_username_loop in all_citizen_usernames:
                import time
                time.sleep(1)
                log.info(f"Processing building occupant relationship for: {citizen_username_loop}")
                current_payload = {"Citizen": citizen_username_loop}
                try:
                    response = requests.post(api_url, json=current_payload, timeout=request_timeout)
                    if not response.ok:
                        error_message = f"API call failed for {citizen_username_loop} (building_occupant) with status {response.status_code}: {response.text}"
                        log.error(error_message)
                        multi_user_results.append(f"- {citizen_username_loop}: Error - {response.status_code}")
                        continue
                    data = response.json()
                    log.info(f"API response data for {citizen_username_loop} (building_occupant): {json.dumps(data, indent=2)}")
                    if not data.get('success'):
                        error_detail = data.get('error', 'Unknown API error')
                        log.error(f"API returned error for {citizen_username_loop} (building_occupant): {error_detail}")
                        multi_user_results.append(f"- {citizen_username_loop}: API Error - {error_detail}")
                        continue
                    
                    relevancies_created_count = data.get('relevanciesSavedCount', 0)
                    if relevancies_created_count == 0:
                         log.info(f"No building occupant relevancies created for {citizen_username_loop} based on API response.")
                    multi_user_results.append(f"- {citizen_username_loop}: {relevancies_created_count} building occupant relevancies created/saved.")
                except requests.exceptions.RequestException as e_req:
                    log.error(f"Request failed for {citizen_username_loop} (building_occupant): {e_req}")
                    multi_user_results.append(f"- {citizen_username_loop}: Request Error - {e_req}")
                except Exception as e_exc:
                    log.error(f"Unexpected error for {citizen_username_loop} (building_occupant): {e_exc}")
                    multi_user_results.append(f"- {citizen_username_loop}: Unexpected Error - {e_exc}")
            
            summary_title = "Building Occupant Relevancy Complete (All Citizens Processed)"
            summary_message = "Building occupant relationship relevancy calculation process finished for all citizens.\n\nResults:\n" + "\n".join(multi_user_results)
            create_admin_notification(notifications_table, summary_title, summary_message)
            log.info("Finished processing building occupant relationship relevancies for all citizens.")
            return True

    elif relevancy_type == "same_land_neighbor":
        api_url = f"{base_url}/api/relevancies/same-land-neighbor"
        payload = {} # Global calculation, username not typically used for this one.
        if username: # If a username is passed, the API might support it for a specific view, but primary is global.
            payload["Citizen"] = username
            log.info(f"Requesting same land neighbor relevancy (context: {username}).")
        else:
            log.info("Requesting same land neighbor relevancy (global for all lands).")
        request_timeout = 180 # Might take longer if many lands/occupants
        # This type of relevancy is handled by its own API POST which saves one record per land group.
        # The multi_user_results logic is not directly applicable here in the same way as proximity for all landowners.
        # The API response will indicate success/failure and count of groups processed.

    elif relevancy_type == "guild_member":
        api_url = f"{base_url}/api/relevancies/guild-member"
        payload = {} # Global calculation
        if username: # Username not typically used but pass if provided
            payload["Citizen"] = username
            log.info(f"Requesting guild member relevancy (context: {username}).")
        else:
            log.info("Requesting guild member relevancy (global for all guilds).")
        request_timeout = 120 # Might take time if many guilds/members
        # API response will indicate success/failure and count of guilds processed.
        
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
        
        # Determine saved status based on API response
        api_saved_flag = data.get('saved', False)
        saved_status_message = "saved to Airtable" if api_saved_flag else "NOT saved to Airtable (or saving not applicable)"
        
        # Adjust how relevancies_created is determined based on typical API responses
        relevancies_created_count = 0
        if 'relevanciesSavedCount' in data: # Explicit count from API (domination route now returns this)
            relevancies_created_count = data['relevanciesSavedCount']
        elif 'relevanciesCreated' in data: # Explicit count from API (older routes might use this)
            relevancies_created_count = data['relevanciesCreated']
        elif 'relevancyScores' in data and isinstance(data['relevancyScores'], dict) and relevancy_type == "proximity": # Proximity
            relevancies_created_count = len(data['relevancyScores'])
        elif relevancy_type in ["housing", "jobs"] and data.get('success'): # Housing, Jobs create 1 global
            relevancies_created_count = 1 # These APIs save 1 global record
        elif relevancy_type == "domination" and not username and data.get('success'): # Global domination (now one per landowner)
             relevancies_created_count = data.get('relevanciesSavedCount', 0) # API returns count of landowners processed
        elif relevancy_type == "domination" and username and 'relevancyScores' in data and isinstance(data['relevancyScores'], dict): # Domination for specific user
            relevancies_created_count = len(data['relevancyScores']) # Number of other players' profiles saved to this user
        elif relevancy_type == "building_ownership" and username: # For specific user
            relevancies_created_count = data.get('relevanciesSavedCount', len(data.get('relevancyScores', {})))
        elif relevancy_type == "building_operator" and username: # For specific user
            relevancies_created_count = data.get('relevanciesSavedCount', len(data.get('relevancyScores', {})))
        elif relevancy_type == "building_occupant" and username: # For specific user
            relevancies_created_count = data.get('relevanciesSavedCount', len(data.get('relevancyScores', {})))
        elif relevancy_type == "same_land_neighbor": # Global calculation
            relevancies_created_count = data.get('relevanciesSavedCount', 0) # API returns count of land groups processed
        elif relevancy_type == "guild_member": # Global calculation
            relevancies_created_count = data.get('relevanciesSavedCount', 0) # API returns count of guilds processed


        notification_title = f"{relevancy_type.replace('_', ' ').capitalize()} Relevancy Calculation Complete"
        details_for_notification = [
            f"Successfully calculated {relevancy_type} relevancies.",
            f"API Save Status: {saved_status_message}.", # Use the more descriptive status
        ]
        
        target_user_info = username
        log_context_message = f"for citizen: {username}"

        if relevancy_type == "domination" and not username:
            target_user_info = "all (Global Landowner Profiles)"
            log_context_message = "for all (global landowner profiles)"
        elif relevancy_type == "building_ownership" and not username:
            target_user_info = "all citizens (Building Ownership)"
            log_context_message = "for all citizens (building ownership)"
        elif relevancy_type == "building_operator" and not username:
            target_user_info = "all citizens (Building Operator)"
            log_context_message = "for all citizens (building operator)"
        elif relevancy_type == "building_occupant" and not username:
            target_user_info = "all citizens (Building Occupant)"
            log_context_message = "for all citizens (building occupant)"
        elif relevancy_type in ["housing", "jobs"] and not username: # These are always global
            target_user_info = "all (Global Report)"
            log_context_message = f"for global {relevancy_type} context"
        elif relevancy_type == "same_land_neighbor" and not username:
            target_user_info = "all lands"
            log_context_message = "for all land communities"
        elif relevancy_type == "guild_member" and not username:
            target_user_info = "all guilds"
            log_context_message = "for all guild communities"
        elif not username and relevancy_type == "proximity": # Proximity for all landowners
             target_user_info = "all landowners"
             log_context_message = "for all landowners (proximity)"


        if target_user_info: # Will be true unless it's a type that doesn't take username and isn't global
            details_for_notification.append(f"Target: {target_user_info}")
        
        if 'ownedLandCount' in data: # Specific to proximity
             details_for_notification.append(f"Owned Land Count (for proximity target): {data.get('ownedLandCount')}")
        
        details_for_notification.append(f"Relevancy Records Saved/Processed by API: {relevancies_created_count}")

        if 'statistics' in data: # Specific to housing, jobs
            details_for_notification.append(f"Statistics: {json.dumps(data.get('statistics'), indent=2)}")
        
        if relevancy_type == "domination" and not username and 'detailedRelevancy' in data:
            top_landowners = sorted(data['detailedRelevancy'].items(), key=lambda item: item[1]['score'], reverse=True)[:5]
            summary = "\nTop 5 Dominant Landowners (from API response):\n" + "\n".join([f"- {item[1]['title'].replace('Land Domination: ', '')}: {item[1]['score']}" for item in top_landowners])
            details_for_notification.append(summary)

        create_admin_notification(notifications_table, notification_title, "\n".join(details_for_notification))
        log.info(f"Successfully processed {relevancy_type} relevancies {log_context_message}. API indicated saved: {api_saved_flag}.")
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
        choices=["proximity", "domination", "housing", "jobs", "building_ownership", "building_operator", "building_occupant", "same_land_neighbor", "guild_member"],
        help="The type of relevancy to calculate."
    )
    parser.add_argument(
        "--username", 
        help="Username of the citizen (optional for proximity, domination, building_ownership, building_operator, and building_occupant). If not provided for these types, runs for all relevant citizens/owners."
    )
    parser.add_argument(
        "--type_filter", 
        help="Type filter for proximity relevancy (e.g., 'connected', 'geographic')."
    )
    
    args = parser.parse_args()

    # Username is now optional for proximity, domination, and building_ownership.
    # No specific validation needed here for those types regarding username presence.

    success = calculate_specific_relevancy(
        relevancy_type=args.type,
        username=args.username,
        type_filter=args.type_filter
    )
    
    sys.exit(0 if success else 1)
