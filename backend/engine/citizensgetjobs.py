#!/usr/bin/env python3
"""
Citizen Job Assignment script for La Serenissima.

This script:
1. Finds all citizens without jobs (Work field is empty)
2. Sorts them by wealth in descending order
3. For each citizen, finds an available business (not already taken by another worker)
4. Assigns the citizen to the business with the highest wages
5. Sets the business status to active
6. Sends notifications to the business owners

Run this script daily to assign jobs to unemployed citizens.
"""

import os
import sys
import logging
import argparse
import json
import datetime
import subprocess
import requests # Added import for requests
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizens_get_jobs")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
ENGINE_SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT_JOBS = os.path.abspath(os.path.join(ENGINE_SCRIPT_DIR, '..', '..'))
if PROJECT_ROOT_JOBS not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_JOBS)

from backend.engine.utils.activity_helpers import LogColors, log_header, _escape_airtable_value # Import shared LogColors, log_header and _escape_airtable_value

# _escape_airtable_value is now imported

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        tables = {
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
        
        # Test connection with one primary table (e.g., citizens)
        log.info("Testing Airtable connection by fetching one record from CITIZENS table...")
        try:
            tables['citizens'].all(max_records=1)
            log.info("Airtable connection successful.")
        except Exception as conn_e:
            log.error(f"Airtable connection test failed for CITIZENS table: {conn_e}")
            raise conn_e
        
        return tables
    except Exception as e:
        log.error(f"Failed to initialize Airtable or connection test failed: {e}")
        sys.exit(1)

def get_entrepreneurs_and_their_businesses(tables) -> tuple[List[Dict], Dict[str, List[Dict]]]:
    """Fetch entrepreneurs (citizens who run at least one building) and their businesses."""
    log.info("Fetching entrepreneurs and their businesses...")
    
    try:
        # Step 1: Fetch all buildings from the API
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        buildings_api_url = f"{api_base_url}/api/buildings"
        all_buildings_from_api = []
        try:
            response = requests.get(buildings_api_url, timeout=30)
            response.raise_for_status()
            api_data = response.json()
            if isinstance(api_data, dict) and api_data.get("buildings"): # As per /api/buildings structure
                 all_buildings_from_api = api_data["buildings"]
            elif isinstance(api_data, list): # Fallback if it directly returns a list
                 all_buildings_from_api = api_data
            else:
                log.error(f"Unexpected response format from {buildings_api_url}: {api_data}")
                return [], {}
            log.info(f"Fetched {len(all_buildings_from_api)} buildings from API.")
        except requests.exceptions.RequestException as e_req:
            log.error(f"Error fetching buildings from API {buildings_api_url}: {e_req}")
            return [], {}
        except json.JSONDecodeError as e_json:
            log.error(f"Error decoding JSON from API {buildings_api_url}: {e_json}")
            return [], {}

        # Step 2: Filter buildings: must have 'runBy' and 'category' == 'business'
        # API returns fields in camelCase, e.g., 'runBy', 'category'
        run_by_buildings_filtered = []
        for building_api_obj in all_buildings_from_api:
            run_by = building_api_obj.get('runBy')
            category = building_api_obj.get('category')
            if run_by and category == 'business':
                run_by_buildings_filtered.append(building_api_obj)
        
        log.info(f"Found {len(run_by_buildings_filtered)} buildings run by someone and categorized as business.")

        # Step 3: Group buildings by the citizen who runs them
        entrepreneur_businesses: Dict[str, List[Dict]] = {}
        for building_api_obj in run_by_buildings_filtered:
            run_by_username = building_api_obj.get('runBy') # This is the username
            if run_by_username:
                if run_by_username not in entrepreneur_businesses:
                    entrepreneur_businesses[run_by_username] = []
                # Store the API building object. Downstream code needs to be aware of the new structure.
                # The API object is a dict with camelCased keys, not an Airtable record.
                entrepreneur_businesses[run_by_username].append(building_api_obj)
        
        # Step 4: Get the entrepreneur citizens by Username from Airtable (this part remains)
        entrepreneur_usernames = list(entrepreneur_businesses.keys())
        entrepreneurs: List[Dict] = []
        
        if entrepreneur_usernames:
            # Create a formula to get these citizens by Username AND ensure they are InVenice
            escaped_usernames = [_escape_airtable_value(username) for username in entrepreneur_usernames]
            username_conditions = [f"{{Username}}='{username}'" for username in escaped_usernames]
            # Combine username check with InVenice check
            formula = f"AND(OR({', '.join(username_conditions)}), {{InVenice}}=TRUE())"
            potential_entrepreneurs = tables['citizens'].all(formula=formula)
            
            # Filter out 'Forestieri'
            entrepreneurs = [
                e for e in potential_entrepreneurs 
                if e['fields'].get('SocialClass') != 'Forestieri'
            ]
            
            log.info(f"Found {len(potential_entrepreneurs)} potential entrepreneurs in Venice. After filtering out 'Forestieri', {len(entrepreneurs)} remain.")
        
        log.info(f"Found {len(entrepreneurs)} entrepreneurs in Venice (excluding Forestieri) running {len(run_by_buildings_filtered)} businesses.")
        return entrepreneurs, entrepreneur_businesses
    except Exception as e:
        log.error(f"Error fetching entrepreneurs and their businesses: {e}")
        return [], {}

def get_unemployed_citizens(tables) -> List[Dict]:
    """Fetch citizens without jobs, sorted by wealth in descending order."""
    log.info("Fetching unemployed citizens...")
    
    try:
        # Get all citizens who are in Venice
        all_citizens_in_venice_formula = "{InVenice}=TRUE()"
        all_citizens = tables['citizens'].all(formula=all_citizens_in_venice_formula)
        log.info(f"Found {len(all_citizens)} citizens in Venice.")
        
        # Fetch all buildings from the API to determine employment status
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        buildings_api_url = f"{api_base_url}/api/buildings"
        all_buildings_from_api = []
        try:
            response = requests.get(buildings_api_url, timeout=30)
            response.raise_for_status()
            api_data = response.json()
            if isinstance(api_data, dict) and api_data.get("buildings"):
                 all_buildings_from_api = api_data["buildings"]
            elif isinstance(api_data, list):
                 all_buildings_from_api = api_data
            else:
                log.error(f"Unexpected response format from {buildings_api_url} for employment check: {api_data}")
                return [] # Cannot determine employment without building data
            log.info(f"Fetched {len(all_buildings_from_api)} buildings from API for employment check.")
        except Exception as e_api_buildings:
            log.error(f"Error fetching buildings from API for employment check: {e_api_buildings}")
            return []

        # Filter for occupied businesses (API returns camelCase: 'category', 'occupant')
        occupied_businesses_api = [
            b for b in all_buildings_from_api 
            if b.get('category') == 'business' and b.get('occupant')
        ]
        
        # Extract the occupant usernames (API returns 'occupant' which should be Username)
        employed_citizen_usernames = {b.get('occupant') for b in occupied_businesses_api if b.get('occupant')}
        
        # Filter citizens to find those whose Username is not in the employed_citizen_usernames set
        # AND whose SocialClass is not 'Forestieri'
        unemployed_citizens_potential = [
            citizen for citizen in all_citizens 
            if citizen['fields'].get('Username') not in employed_citizen_usernames
        ]
        
        unemployed_citizens = [
            citizen for citizen in unemployed_citizens_potential
            if citizen['fields'].get('SocialClass') not in ['Forestieri', 'Nobili']
        ]
        
        log.info(f"Found {len(unemployed_citizens_potential)} citizens not currently employed. After filtering out 'Forestieri' and 'Nobili', {len(unemployed_citizens)} are eligible for job assignment.")
        
        # Sort by Ducats in descending order
        unemployed_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0), reverse=True)
        
        log.info(f"Found {len(unemployed_citizens)} unemployed citizens (excluding Forestieri) eligible for jobs.")
        return unemployed_citizens
    except Exception as e:
        log.error(f"Error fetching unemployed citizens: {e}")
        return []

def get_available_businesses(tables) -> List[Dict]:
    """Fetch available businesses, sorted by wages in descending order, excluding those RunBy Nobili."""
    log.info("Fetching available businesses...")

    try:
        # Fetch all citizens to identify Nobili
        all_citizens_records = tables['citizens'].all(fields=['Username', 'SocialClass'])
        nobili_usernames = {
            citizen['fields'].get('Username') 
            for citizen in all_citizens_records 
            if citizen['fields'].get('SocialClass') == 'Nobili' and citizen['fields'].get('Username')
        }
        log.info(f"Identified {len(nobili_usernames)} Nobili citizens. Businesses run by them will be excluded.")

        # Fetch all buildings from the API
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        buildings_api_url = f"{api_base_url}/api/buildings"
        all_buildings_from_api = []
        try:
            response = requests.get(buildings_api_url, timeout=30)
            response.raise_for_status()
            api_data = response.json()
            if isinstance(api_data, dict) and api_data.get("buildings"):
                 all_buildings_from_api = api_data["buildings"]
            elif isinstance(api_data, list):
                 all_buildings_from_api = api_data
            else:
                log.error(f"Unexpected response format from {buildings_api_url} for available businesses: {api_data}")
                return []
            log.info(f"Fetched {len(all_buildings_from_api)} buildings from API for available businesses check.")
        except Exception as e_api_buildings:
            log.error(f"Error fetching buildings from API for available businesses check: {e_api_buildings}")
            return []

        # Filter for available businesses:
        # 1. category='business'
        # 2. no occupant
        # 3. not RunBy a Nobili
        available_businesses_api_filtered = []
        for b_api in all_buildings_from_api:
            if b_api.get('category') == 'business' and \
               not b_api.get('occupant') and \
               b_api.get('runBy') not in nobili_usernames:
                available_businesses_api_filtered.append(b_api)
            elif b_api.get('category') == 'business' and \
                 not b_api.get('occupant') and \
                 b_api.get('runBy') in nobili_usernames:
                log.debug(f"Excluding business {b_api.get('id', 'N/A')} as it is RunBy Nobili {b_api.get('runBy')}")

        log.info(f"Found {len(available_businesses_api_filtered)} available businesses from API data (after excluding those RunBy Nobili).")

        # Sort by Wages in descending order (API field is 'wages')
        available_businesses_api_filtered.sort(key=lambda b: float(b.get('wages', 0) or 0), reverse=True)
        
        # The function expects a list of Airtable-like records if downstream code uses ['id'] or ['fields'].
        # The API returns dicts directly. If assign_citizen_to_business expects Airtable record structure,
        # this might need adjustment or assign_citizen_to_business needs to handle API dict structure.
        # For now, returning the list of API dicts.
        return available_businesses_api_filtered
    except Exception as e:
        log.error(f"Error fetching available businesses: {e}")
        return []

def assign_citizen_to_business(tables, citizen: Dict, business: Dict, noupdate: bool = False) -> bool:
    """Assign a citizen to a business and update both records."""
    # Use the Username field instead of the CitizenId field
    citizen_id = citizen['fields'].get('CitizenId', citizen['id']) # From Airtable citizen record
    citizen_username = citizen['fields'].get('Username', '')      # From Airtable citizen record
    
    # 'business' is now an API dict, not an Airtable record.
    # It should have an 'id' field which is the custom BuildingId (e.g., "bld_...").
    # To update in Airtable, we need the Airtable record ID.
    # This requires fetching the Airtable record for the building using its custom ID.
    
    building_custom_id = business.get('id') # This is the custom BuildingId from API
    if not building_custom_id:
        log.error(f"Business object from API is missing 'id' (custom BuildingId): {business}")
        return False

    # Fetch the Airtable record for this building to get its Airtable ID for update
    building_airtable_record = None
    try:
        formula = f"{{BuildingId}} = '{_escape_airtable_value(building_custom_id)}'"
        records = tables['buildings'].all(formula=formula, max_records=1)
        if records:
            building_airtable_record = records[0]
        else:
            log.error(f"Could not find Airtable record for building with custom ID {building_custom_id}")
            return False
    except Exception as e_fetch_bldg:
        log.error(f"Error fetching Airtable record for building {building_custom_id}: {e_fetch_bldg}")
        return False

    building_airtable_id = building_airtable_record['id'] # Airtable's own record ID
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    building_name = business.get('name', building_custom_id) # Use 'name' from API dict
    
    log.info(f"Assigning {citizen_name} to {building_name} (Custom ID: {building_custom_id}, Airtable ID: {building_airtable_id})")
    
    try:
        # Update building record in Airtable using its Airtable ID
        tables['buildings'].update(building_airtable_id, {
            'Occupant': citizen_username  # Use Username as Occupant
        })
        
        # Get building operator (RunBy) or owner if RunBy is not set (API fields are 'runBy', 'owner')
        building_operator = business.get('runBy') or business.get('owner', '')
        
        # Create a notification for the building operator
        if building_operator:
            create_notification(
                tables,
                building_operator, # Send notification to the operator
                f"🏢 **{citizen_name}** now works in your building **{building_name}**",
                {
                    "citizen_id": citizen_id,
                    "citizen_name": citizen_name,
                    "building_id": building_custom_id, # Use building_custom_id
                    "building_name": building_name,
                    "event_type": "job_assignment"
                }
            )
        
        # Call updatecitizenDescriptionAndImage.py to update the citizen's description and image
        if not noupdate:
            try:
                # Get the path to the updatecitizenDescriptionAndImage.py script
                script_dir = os.path.dirname(os.path.abspath(__file__))
                update_script_path = os.path.join(script_dir, "..", "scripts", "updatecitizenDescriptionAndImage.py")
                
                if os.path.exists(update_script_path):
                    # Call the script to update the citizen's description and image
                    log.info(f"Calling updatecitizenDescriptionAndImage.py for citizen {citizen_username} after job assignment")
                    result = subprocess.run(
                        [sys.executable, update_script_path, citizen_username],
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode != 0:
                        log.warning(f"Error updating citizen description and image: {result.stderr}")
                    else:
                        log.info(f"Successfully updated description and image for citizen {citizen_username}")
                else:
                    log.warning(f"Update script not found at: {update_script_path}")
            except Exception as e:
                log.warning(f"Error calling updatecitizenDescriptionAndImage.py: {e}")
                # Continue anyway as this is not critical
        
        log.info(f"Successfully assigned {citizen_name} to {building_name}")
        return True
    except Exception as e:
        log.error(f"Error assigning citizen to building: {e}")
        return False

def create_notification(tables, citizen: str, content: str, details: Dict) -> Optional[Dict]:
    """Create a notification for a citizen."""
    log.info(f"Creating notification for citizen {citizen}: {content}")
    
    # Skip notification if citizen is empty or None
    if not citizen:
        log.warning(f"Cannot create notification: citizen is empty")
        return None
    
    try:
        now = datetime.datetime.now().isoformat()
        
        # Create the notification record
        notification = tables['notifications'].create({
            "Type": "job_assignment",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": now,
            "ReadAt": None,
            "Citizen": citizen
        })
        
        log.info(f"Created notification: {notification['id']}")
        return notification
    except Exception as e:
        log.error(f"Error creating notification for citizen {citizen}: {e}")
        return None

def create_admin_summary(tables, assignment_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"📊 **Job Assignment Report**: **{assignment_summary['total']}** citizens assigned to businesses"
        
        # Create detailed information
        details = {
            "event_type": "job_assignment_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_assigned": assignment_summary['total'],
            "by_business_type": assignment_summary['by_business_type'],
            "message": f"✅ Job assignment process complete. **{assignment_summary['total']}** citizens were assigned to businesses."
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "job_assignment_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def assign_jobs_to_citizens(dry_run: bool = False, noupdate: bool = False):
    """Main function to assign jobs to unemployed citizens."""
    log_header(f"Job Assignment Process (dry_run={dry_run}, noupdate_desc_img={noupdate})", LogColors.HEADER)
    
    tables = initialize_airtable()
    unemployed_citizens = get_unemployed_citizens(tables)
    
    if not unemployed_citizens:
        log.info("No unemployed citizens found. Job assignment process complete.")
        return
    
    available_businesses = get_available_businesses(tables)
    
    if not available_businesses:
        log.info("No available businesses found. Job assignment process complete.")
        return
    
    assigned_count = 0
    failed_count = 0
    
    # Track assignments by business type
    assignments_by_type = {}
    
    # Get entrepreneurs and their businesses
    entrepreneurs, entrepreneur_businesses = get_entrepreneurs_and_their_businesses(tables)
    
    # Get all occupied businesses from API to check if entrepreneurs are already employed
    api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
    buildings_api_url = f"{api_base_url}/api/buildings"
    all_buildings_from_api_for_entrepreneur_check = []
    try:
        response = requests.get(buildings_api_url, timeout=30)
        response.raise_for_status()
        api_data = response.json()
        if isinstance(api_data, dict) and api_data.get("buildings"):
             all_buildings_from_api_for_entrepreneur_check = api_data["buildings"]
        elif isinstance(api_data, list):
             all_buildings_from_api_for_entrepreneur_check = api_data
        else:
            log.error(f"Unexpected response format from {buildings_api_url} for entrepreneur employment check: {api_data}")
            # Continue without this check if API fails, might assign an already employed entrepreneur
    except Exception as e_api_buildings_ent:
        log.error(f"Error fetching buildings from API for entrepreneur employment check: {e_api_buildings_ent}")

    # Create a set of already employed entrepreneurs (Username) for faster lookup
    # Only consider occupants of 'business' category buildings as employed
    already_employed_entrepreneurs = set()
    for building_api_obj in all_buildings_from_api_for_entrepreneur_check: # Renamed variable for clarity
        if building_api_obj.get('category') == 'business':
            occupant_username = building_api_obj.get('occupant') # API returns 'occupant' as Username
            if occupant_username:
                already_employed_entrepreneurs.add(occupant_username)
    
    log.info(f"Identified {len(already_employed_entrepreneurs)} entrepreneurs already employed in a business.")
    # Process entrepreneurs first
    log.info("Processing entrepreneurs first for their unoccupied businesses...")
    for entrepreneur in entrepreneurs:
        citizen_username = entrepreneur['fields'].get('Username', '')
        citizen_name = f"{entrepreneur['fields'].get('FirstName', '')} {entrepreneur['fields'].get('LastName', '')}"
        social_class = entrepreneur['fields'].get('SocialClass', '')

        if social_class == 'Nobili':
            log.info(f"Entrepreneur {citizen_name} ({citizen_username}) is Nobili, will not be assigned as Occupant.")
            already_employed_entrepreneurs.add(citizen_username)
            continue

        if citizen_username in already_employed_entrepreneurs:
            log.info(f"Entrepreneur {citizen_name} ({citizen_username}) is already employed or processed, skipping first pass.")
            continue

        their_businesses_api_dicts = entrepreneur_businesses.get(citizen_username, [])
        available_own_businesses_api_dicts = [
            b_api for b_api in their_businesses_api_dicts if not b_api.get('occupant')
        ]

        if not available_own_businesses_api_dicts:
            log.info(f"Entrepreneur {citizen_name} ({citizen_username}) has no available (unoccupied) businesses to work at.")
            continue

        available_own_businesses_api_dicts.sort(key=lambda b_api: float(b_api.get('wages', 0) or 0), reverse=True)
        best_business_api_dict = available_own_businesses_api_dicts[0]
        best_business_name = best_business_api_dict.get('name', best_business_api_dict.get('id'))

        if dry_run:
            log.info(f"[DRY RUN] Would assign entrepreneur {citizen_name} ({citizen_username}) to their own business {best_business_name}")
            assigned_count += 1
            business_type = best_business_api_dict.get('type', 'unknown')
            assignments_by_type[business_type] = assignments_by_type.get(business_type, 0) + 1
            already_employed_entrepreneurs.add(citizen_username) # Mark as employed for dry run
        else:
            success = assign_citizen_to_business(tables, entrepreneur, best_business_api_dict, noupdate)
            if success:
                assigned_count += 1
                business_type = best_business_api_dict.get('type', 'unknown')
                assignments_by_type[business_type] = assignments_by_type.get(business_type, 0) + 1
                already_employed_entrepreneurs.add(citizen_username)
                best_business_custom_id = best_business_api_dict.get('id')
                available_businesses = [b_api for b_api in available_businesses if b_api.get('id') != best_business_custom_id]
                log.info(f"Entrepreneur {citizen_name} ({citizen_username}) assigned to their vacant business {best_business_name}.")
            else:
                log.error(f"Failed to assign entrepreneur {citizen_name} ({citizen_username}) to their vacant business {best_business_name}.")
                failed_count += 1
    
    log.info("Second pass for entrepreneurs: if still unemployed, consider taking over an occupied business they run.")
    for entrepreneur in entrepreneurs:
        citizen_username = entrepreneur['fields'].get('Username', '')
        citizen_name = f"{entrepreneur['fields'].get('FirstName', '')} {entrepreneur['fields'].get('LastName', '')}"

        if citizen_username in already_employed_entrepreneurs: # Check if already employed (initially or in first pass)
            continue

        log.info(f"Entrepreneur {citizen_name} ({citizen_username}) is still unemployed. Checking their occupied businesses...")
        their_businesses_api_dicts = entrepreneur_businesses.get(citizen_username, [])
        
        occupied_own_businesses = [
            b_api for b_api in their_businesses_api_dicts if b_api.get('occupant')
        ]

        if not occupied_own_businesses:
            log.info(f"Entrepreneur {citizen_name} ({citizen_username}) has no occupied businesses to take over.")
            continue

        # Strategy: take over the first occupied business found.
        business_to_take_over_api_dict = occupied_own_businesses[0]
        ejected_occupant_username = business_to_take_over_api_dict.get('occupant')
        business_to_take_over_custom_id = business_to_take_over_api_dict.get('id')
        business_to_take_over_name = business_to_take_over_api_dict.get('name', business_to_take_over_custom_id)

        log.info(f"Entrepreneur {citizen_name} ({citizen_username}) will attempt to take over their business {business_to_take_over_name} (ID: {business_to_take_over_custom_id}), ejecting current occupant {ejected_occupant_username}.")

        if dry_run:
            log.info(f"[DRY RUN] Would eject {ejected_occupant_username} from {business_to_take_over_name}.")
            log.info(f"[DRY RUN] Would assign entrepreneur {citizen_name} ({citizen_username}) to their business {business_to_take_over_name}.")
            assigned_count += 1
            business_type = business_to_take_over_api_dict.get('type', 'unknown')
            assignments_by_type[business_type] = assignments_by_type.get(business_type, 0) + 1
            already_employed_entrepreneurs.add(citizen_username) 
        else:
            building_airtable_record = None
            try:
                formula = f"{{BuildingId}} = '{_escape_airtable_value(business_to_take_over_custom_id)}'"
                records = tables['buildings'].all(formula=formula, max_records=1)
                if records:
                    building_airtable_record = records[0]
                else:
                    log.error(f"Could not find Airtable record for business {business_to_take_over_custom_id} to eject occupant.")
                    failed_count +=1
                    continue 
            except Exception as e_fetch_bldg:
                log.error(f"Error fetching Airtable record for business {business_to_take_over_custom_id}: {e_fetch_bldg}")
                failed_count +=1
                continue
            
            building_airtable_id = building_airtable_record['id']

            try:
                tables['buildings'].update(building_airtable_id, {'Occupant': None}) 
                log.info(f"Ejected {ejected_occupant_username} from {business_to_take_over_name}.")
                
                create_notification(
                    tables,
                    ejected_occupant_username, # Send to the ejected occupant
                    f"You have been unassigned from your role at **{business_to_take_over_name}** as the owner, {citizen_name}, has taken over operations.",
                    {
                        "event_type": "job_ejection",
                        "building_id": business_to_take_over_custom_id,
                        "building_name": business_to_take_over_name,
                        "new_operator_taking_role": citizen_name # Clarify who is taking the role
                    }
                )
            except Exception as e_eject:
                log.error(f"Error ejecting {ejected_occupant_username} from {business_to_take_over_name}: {e_eject}")
                failed_count +=1
                continue

            success = assign_citizen_to_business(tables, entrepreneur, business_to_take_over_api_dict, noupdate)
            if success:
                log.info(f"Successfully assigned entrepreneur {citizen_name} ({citizen_username}) to their business {business_to_take_over_name} after ejecting previous occupant.")
                assigned_count += 1
                business_type = business_to_take_over_api_dict.get('type', 'unknown')
                assignments_by_type[business_type] = assignments_by_type.get(business_type, 0) + 1
                already_employed_entrepreneurs.add(citizen_username)
            else:
                log.error(f"Failed to assign entrepreneur {citizen_name} ({citizen_username}) to {business_to_take_over_name} after ejection. The business might remain vacant.")
                failed_count += 1
            
    # Process each unemployed citizen from the general pool
    log.info("Processing general pool of unemployed citizens...")
    for citizen in unemployed_citizens:
        citizen_username = citizen['fields'].get('Username', '')
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
                
        # Skip if this citizen is an entrepreneur who was already assigned or was already employed
        if citizen_username in already_employed_entrepreneurs:
            log.info(f"Skipping citizen {citizen_name} ({citizen_username}) as they are an entrepreneur already assigned/employed or Nobili.")
            continue
                
        log.info(f"Processing citizen from general pool: {citizen_name} ({citizen_username})")
                
        # Check if this citizen is already employed (might have been missed in the initial filtering or became employed through other means)
        # This check is somewhat redundant if already_employed_entrepreneurs is comprehensive, but good for safety.
        # Re-fetch current employment status for this specific citizen if there's doubt.
        # For now, relying on already_employed_entrepreneurs.
        # if citizen_username in already_employed_entrepreneurs: # This is already checked above
        #     log.info(f"Citizen {citizen_name} is already employed elsewhere, skipping")
        #     continue
            
        # Stop if we've run out of available businesses
        if not available_businesses:
            log.info("No more available businesses for the general pool. Stopping job assignment process.")
            break
        
        # Get the highest-paying available business (API dict)
        business_api_dict = available_businesses.pop(0)  # Remove from list to prevent double assignment
        business_name = business_api_dict.get('name', business_api_dict.get('id')) # API fields
        business_type = business_api_dict.get('type', 'unknown') # API field
        
        # Track assignments by business type
        if business_type not in assignments_by_type:
            assignments_by_type[business_type] = 0
        
        if dry_run:
            log.info(f"[DRY RUN] Would assign {citizen_name} to {business_name}")
            assigned_count += 1
            assignments_by_type[business_type] += 1
        else:
            # assign_citizen_to_business now expects an API dict for 'business'
            success = assign_citizen_to_business(tables, citizen, business_api_dict, noupdate)
            if success:
                assigned_count += 1
                assignments_by_type[business_type] += 1
            else:
                failed_count += 1
                # Put the business back in the list if assignment failed
                available_businesses.append(business_api_dict) # Use business_api_dict
    
    log.info(f"Job assignment process complete. Assigned: {assigned_count}, Failed: {failed_count}")
    
    # Create a summary of assignments by business type
    assignment_summary = {
        "total": assigned_count,
        "by_business_type": assignments_by_type
    }
    
    # Create a notification for the admin citizen with the assignment summary
    if assigned_count > 0 and not dry_run:
        create_admin_summary(tables, assignment_summary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assign jobs to unemployed citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--noupdate", action="store_true", help="Skip updating citizen descriptions and images")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    assign_jobs_to_citizens(dry_run=args.dry_run, noupdate=args.noupdate)
