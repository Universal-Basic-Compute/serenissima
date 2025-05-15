#!/usr/bin/env python3
"""
Create Activities script for La Serenissima.

This script:
1. Fetches all idle citizens
2. Determines the current time in Venice
3. Based on time and citizen location:
   - If nighttime and citizen is at home: create "rest" activity
   - If nighttime and citizen is not at home: create "goto_home" activity
   - If transport API fails: create "idle" activity for one hour

Run this script periodically to keep citizens engaged in activities.
"""

import os
import sys
import logging
import argparse
import json
import datetime
import time
import requests
import pytz
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("create_activities")

# Load environment variables
load_dotenv()

# Constants
TRANSPORT_API_URL = "http://localhost:3000/api/transport"
VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
NIGHT_START_HOUR = 22  # 10 PM
NIGHT_END_HOUR = 6     # 6 AM
IDLE_ACTIVITY_DURATION_HOURS = 1

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
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'activities': Table(api_key, base_id, 'ACTIVITIES')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_idle_citizens(tables) -> List[Dict]:
    """Fetch all citizens who are currently idle (no active activities)."""
    log.info("Fetching idle citizens...")
    
    try:
        # First, get all citizens
        all_citizens = tables['citizens'].all()
        log.info(f"Found {len(all_citizens)} total citizens")
        
        # Then, get all active activities
        now = datetime.datetime.now().isoformat()
        active_activities_formula = f"AND({{StartDate}} <= '{now}', {{EndDate}} >= '{now}')"
        active_activities = tables['activities'].all(formula=active_activities_formula)
        
        # Extract citizen IDs with active activities
        busy_citizen_ids = set()
        for activity in active_activities:
            citizen_id = activity['fields'].get('CitizenId')
            if citizen_id:
                busy_citizen_ids.add(citizen_id)
        
        # Filter out citizens with active activities
        idle_citizens = [citizen for citizen in all_citizens if citizen['id'] not in busy_citizen_ids]
        
        log.info(f"Found {len(idle_citizens)} idle citizens")
        return idle_citizens
    except Exception as e:
        log.error(f"Error fetching idle citizens: {e}")
        return []

def get_citizen_home(tables, citizen_id: str) -> Optional[Dict]:
    """Find the home building for a citizen."""
    log.info(f"Finding home for citizen {citizen_id}")
    
    try:
        # Get buildings where this citizen is the occupant and the type is a housing type
        housing_types = ['canal_house', 'merchant_s_house', 'artisan_s_house', 'fisherman_s_cottage']
        type_conditions = [f"{{Type}}='{housing_type}'" for housing_type in housing_types]
        formula = f"AND({{Occupant}}='{citizen_id}', OR({', '.join(type_conditions)}))"
        
        homes = tables['buildings'].all(formula=formula)
        
        if homes:
            log.info(f"Found home for citizen {citizen_id}: {homes[0]['id']}")
            return homes[0]
        else:
            log.warning(f"No home found for citizen {citizen_id}")
            return None
    except Exception as e:
        log.error(f"Error finding home for citizen {citizen_id}: {e}")
        return None

def is_nighttime() -> bool:
    """Check if it's currently nighttime in Venice."""
    now = datetime.datetime.now(VENICE_TIMEZONE)
    hour = now.hour
    
    return hour >= NIGHT_START_HOUR or hour < NIGHT_END_HOUR

def get_path_to_home(citizen_position: Dict, home_position: Dict) -> Optional[Dict]:
    """Get a path from the citizen's current position to their home using the transport API."""
    log.info(f"Getting path from {citizen_position} to {home_position}")
    
    try:
        # Call the transport API
        response = requests.post(
            TRANSPORT_API_URL,
            json={
                "startPoint": citizen_position,
                "endPoint": home_position,
                "startDate": datetime.datetime.now().isoformat()
            }
        )
        
        if response.status_code != 200:
            log.error(f"Transport API error: {response.status_code} {response.text}")
            return None
        
        result = response.json()
        
        if not result.get('success'):
            log.error(f"Transport API returned error: {result.get('error')}")
            return None
        
        return result
    except Exception as e:
        log.error(f"Error calling transport API: {e}")
        return None

def create_rest_activity(tables, citizen_id: str, home_id: str) -> Optional[Dict]:
    """Create a rest activity for a citizen at their home."""
    log.info(f"Creating rest activity for citizen {citizen_id} at home {home_id}")
    
    try:
        now = datetime.datetime.now()
        
        # Calculate end time (next morning at 6 AM)
        venice_now = now.astimezone(VENICE_TIMEZONE)
        
        # If it's before 6 AM, end time is 6 AM today
        # If it's after 6 AM, end time is 6 AM tomorrow
        if venice_now.hour < NIGHT_END_HOUR:
            end_time = venice_now.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
        else:
            tomorrow = venice_now + datetime.timedelta(days=1)
            end_time = tomorrow.replace(hour=NIGHT_END_HOUR, minute=0, second=0, microsecond=0)
        
        # Convert back to UTC for storage
        end_time_utc = end_time.astimezone(pytz.UTC)
        
        # Create the activity
        activity = tables['activities'].create({
            "ActivityId": f"rest_{citizen_id}_{int(time.time())}",
            "Type": "rest",
            "CitizenId": citizen_id,
            "FromBuilding": home_id,
            "ToBuilding": home_id,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time_utc.isoformat(),
            "Notes": "Resting at home for the night"
        })
        
        log.info(f"Created rest activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating rest activity: {e}")
        return None

def create_goto_home_activity(tables, citizen_id: str, home_id: str, path_data: Dict) -> Optional[Dict]:
    """Create a goto_home activity for a citizen."""
    log.info(f"Creating goto_home activity for citizen {citizen_id} to home {home_id}")
    
    try:
        now = datetime.datetime.now()
        
        # Get timing information from path data
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            # If no end date provided, use a default duration
            end_time = now + datetime.timedelta(hours=1)
            end_date = end_time.isoformat()
        
        # Create the activity
        activity = tables['activities'].create({
            "ActivityId": f"goto_home_{citizen_id}_{int(time.time())}",
            "Type": "goto_home",
            "CitizenId": citizen_id,
            "ToBuilding": home_id,
            "CreatedAt": now.isoformat(),
            "StartDate": start_date,
            "EndDate": end_date,
            "Path": json.dumps(path_data.get('path', [])),
            "Notes": "Going home for the night"
        })
        
        log.info(f"Created goto_home activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating goto_home activity: {e}")
        return None

def create_idle_activity(tables, citizen_id: str) -> Optional[Dict]:
    """Create an idle activity for a citizen."""
    log.info(f"Creating idle activity for citizen {citizen_id}")
    
    try:
        now = datetime.datetime.now()
        end_time = now + datetime.timedelta(hours=IDLE_ACTIVITY_DURATION_HOURS)
        
        # Create the activity
        activity = tables['activities'].create({
            "ActivityId": f"idle_{citizen_id}_{int(time.time())}",
            "Type": "idle",
            "CitizenId": citizen_id,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": "Idle activity due to failed path finding or no home"
        })
        
        log.info(f"Created idle activity: {activity['id']}")
        return activity
    except Exception as e:
        log.error(f"Error creating idle activity: {e}")
        return None

def process_citizen_activity(tables, citizen: Dict, is_night: bool) -> bool:
    """Process activity creation for a single citizen."""
    citizen_id = citizen['id']
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    
    log.info(f"Processing activity for citizen {citizen_name} (ID: {citizen_id})")
    
    # Get citizen's position
    citizen_position = None
    try:
        position_str = citizen['fields'].get('Position')
        if position_str:
            citizen_position = json.loads(position_str)
    except (json.JSONDecodeError, TypeError):
        log.warning(f"Invalid position data for citizen {citizen_id}: {citizen['fields'].get('Position')}")
    
    if not citizen_position:
        log.warning(f"Citizen {citizen_id} has no position data, creating idle activity")
        create_idle_activity(tables, citizen_id)
        return True
    
    # If it's nighttime, handle nighttime activities
    if is_night:
        # Find citizen's home
        home = get_citizen_home(tables, citizen_id)
        
        if not home:
            log.warning(f"Citizen {citizen_id} has no home, creating idle activity")
            create_idle_activity(tables, citizen_id)
            return True
        
        # Get home position
        home_position = None
        try:
            position_str = home['fields'].get('Position')
            if position_str:
                home_position = json.loads(position_str)
        except (json.JSONDecodeError, TypeError):
            log.warning(f"Invalid position data for home {home['id']}: {home['fields'].get('Position')}")
        
        if not home_position:
            log.warning(f"Home {home['id']} has no position data, creating idle activity")
            create_idle_activity(tables, citizen_id)
            return True
        
        # Check if citizen is already at home
        # Simple check: if positions are close enough (within 50 meters)
        is_at_home = False
        try:
            # Calculate distance between points
            from math import sqrt, pow
            distance = sqrt(pow(citizen_position['lat'] - home_position['lat'], 2) + 
                           pow(citizen_position['lng'] - home_position['lng'], 2))
            
            # Convert to approximate meters (very rough approximation)
            distance_meters = distance * 111000  # 1 degree is roughly 111 km at the equator
            
            is_at_home = distance_meters < 50  # Within 50 meters
        except (KeyError, TypeError):
            log.warning(f"Error calculating distance for citizen {citizen_id}")
        
        if is_at_home:
            # Citizen is at home, create rest activity
            create_rest_activity(tables, citizen_id, home['id'])
        else:
            # Citizen needs to go home, get path
            path_data = get_path_to_home(citizen_position, home_position)
            
            if path_data and path_data.get('success'):
                # Create goto_home activity
                create_goto_home_activity(tables, citizen_id, home['id'], path_data)
            else:
                # Path finding failed, create idle activity
                create_idle_activity(tables, citizen_id)
    else:
        # Daytime activities - for now, just create idle activities
        # This can be expanded later to include work, shopping, etc.
        create_idle_activity(tables, citizen_id)
    
    return True

def create_activities(dry_run: bool = False):
    """Main function to create activities for idle citizens."""
    log.info(f"Starting activity creation process (dry_run: {dry_run})")
    
    tables = initialize_airtable()
    idle_citizens = get_idle_citizens(tables)
    
    if not idle_citizens:
        log.info("No idle citizens found. Activity creation process complete.")
        return
    
    # Check if it's nighttime in Venice
    night_time = is_nighttime()
    log.info(f"Current time in Venice: {'Night' if night_time else 'Day'}")
    
    # Process each idle citizen
    success_count = 0
    for citizen in idle_citizens:
        if dry_run:
            log.info(f"[DRY RUN] Would create activity for citizen {citizen['id']}")
            success_count += 1
        else:
            if process_citizen_activity(tables, citizen, night_time):
                success_count += 1
    
    log.info(f"Activity creation process complete. Created activities for {success_count} out of {len(idle_citizens)} idle citizens")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create activities for idle citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    create_activities(dry_run=args.dry_run)
