#!/usr/bin/env python3
"""
Update Citizen Positions script for La Serenissima.

This script:
1. Fetches all citizens with active activities that have paths
2. Calculates their current positions along those paths based on:
   - Activity start/end times
   - Path coordinates
   - Current time
3. Updates the Position field in the CITIZENS table

Run this script every 5 minutes to keep citizen positions updated.
"""

import os
import sys
import json
import logging
import argparse
import datetime
import time
import math
from typing import Dict, List, Optional, Any, Tuple
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("update_citizen_positions")

# Load environment variables
load_dotenv()

# Add project root to sys.path for backend imports
# This script is in backend/engine, so root is two levels up.
POS_SCRIPT_DIR = os.path.dirname(__file__)
PROJECT_ROOT_POS = os.path.abspath(os.path.join(POS_SCRIPT_DIR, '..', '..'))
if PROJECT_ROOT_POS not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_POS)

from backend.engine.utils.activity_helpers import LogColors, log_header # Import shared LogColors and log_header

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
            'activities': Table(api_key, base_id, 'ACTIVITIES'),
            'buildings': Table(api_key, base_id, 'BUILDINGS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_active_activities(tables) -> List[Dict]:
    """Get all active activities with paths."""
    try:
        now = datetime.datetime.now().isoformat()
        
        # Query activities that are active (between StartDate and EndDate) and have a Path
        formula = f"AND({{StartDate}}<='{now}', {{EndDate}}>='{now}', NOT({{Path}} = ''), NOT({{Path}} = BLANK()))"
        activities = tables['activities'].all(formula=formula)
        
        log.info(f"Found **{len(activities)}** active activities with paths 🛣️")
        return activities
    except Exception as e:
        log.error(f"Error getting active activities: {e}")
        return []

def get_citizen_info(tables, citizen_id: str) -> Optional[Dict]:
    """Get information about a specific citizen."""
    try:
        formula = f"{{CitizenId}}='{citizen_id}'"
        citizens = tables['citizens'].all(formula=formula)
        
        if citizens:
            log.info(f"Found citizen **{citizen_id}** 👤")
            return citizens[0]
        else:
            log.warning(f"Citizen {citizen_id} not found")
            return None
    except Exception as e:
        log.error(f"Error getting citizen {citizen_id}: {e}")
        return None

def get_building_position(tables, building_id: str) -> Optional[Dict]:
    """Get the position of a specific building."""
    try:
        formula = f"{{BuildingId}}='{building_id}'"
        buildings = tables['buildings'].all(formula=formula)
        
        if not buildings:
            log.warning(f"Building {building_id} not found")
            return None
        
        building = buildings[0]
        
        # Try to get position from the Position field
        position_str = building['fields'].get('Position')
        if position_str:
            try:
                position = json.loads(position_str)
                if 'lat' in position and 'lng' in position:
                    return position
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Try to extract from Point field
        point_str = building['fields'].get('Point')
        if point_str and isinstance(point_str, str):
            # Parse the Point field which has format like "building_45.437908_12.337258"
            parts = point_str.split('_')
            if len(parts) >= 3:
                try:
                    lat = float(parts[1])
                    lng = float(parts[2])
                    return {"lat": lat, "lng": lng}
                except (ValueError, IndexError):
                    log.warning(f"Failed to parse coordinates from Point field: {point_str}")
        
        log.warning(f"Building {building_id} has no valid position data")
        return None
    except Exception as e:
        log.error(f"Error getting building position for {building_id}: {e}")
        return None

def calculate_distance(point1: Dict, point2: Dict) -> float:
    """Calculate distance between two lat/lng points in meters."""
    # Haversine formula
    R = 6371000  # Earth radius in meters
    
    lat1 = math.radians(point1['lat'])
    lng1 = math.radians(point1['lng'])
    lat2 = math.radians(point2['lat'])
    lng2 = math.radians(point2['lng'])
    
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_position_along_path(path: List[Dict], progress: float) -> Dict:
    """Calculate position along a path based on progress (0.0 to 1.0)."""
    if not path or len(path) < 2:
        return path[0] if path else {"lat": 0, "lng": 0}
    
    # Calculate total path length
    total_distance = 0
    segments = []
    
    for i in range(len(path) - 1):
        distance = calculate_distance(path[i], path[i+1])
        segments.append({
            "start": total_distance,
            "end": total_distance + distance,
            "distance": distance,
            "index": i
        })
        total_distance += distance
    
    # Find the segment where the progress falls
    target_distance = progress * total_distance
    segment = next((s for s in segments if s["start"] <= target_distance <= s["end"]), segments[0])
    
    # Calculate position within the segment
    segment_progress = 0
    if segment["distance"] > 0:
        segment_progress = (target_distance - segment["start"]) / segment["distance"]
    
    segment_index = segment["index"]
    p1 = path[segment_index]
    p2 = path[segment_index + 1]
    
    # Interpolate between the two points
    return {
        "lat": p1["lat"] + (p2["lat"] - p1["lat"]) * segment_progress,
        "lng": p1["lng"] + (p2["lng"] - p1["lng"]) * segment_progress
    }

def calculate_current_position(activity: Dict) -> Optional[Dict]:
    """Calculate the current position of a citizen based on their activity path."""
    try:
        # Parse the path
        path_str = activity['fields'].get('Path')
        if not path_str:
            return None
        
        path = json.loads(path_str) if isinstance(path_str, str) else path_str
        
        if not path or not isinstance(path, list) or len(path) < 2:
            log.warning(f"Invalid path for activity {activity['id']}")
            return None
        
        # Validate each point in the path
        valid_path = []
        for point in path:
            if isinstance(point, dict) and 'lat' in point and 'lng' in point:
                valid_path.append(point)
        
        if len(valid_path) < 2:
            log.warning(f"Insufficient valid points in path for activity {activity['id']}")
            return None
        
        # Get start and end times
        start_time_str = activity['fields'].get('StartDate')
        end_time_str = activity['fields'].get('EndDate')
        
        if not start_time_str or not end_time_str:
            log.warning(f"Missing start or end time for activity {activity['id']}")
            return None
        
        # Parse times
        start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        end_time = datetime.datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
        current_time = datetime.datetime.now(datetime.timezone.utc)
        
        # Calculate progress (0.0 to 1.0)
        total_duration = (end_time - start_time).total_seconds()
        elapsed_time = (current_time - start_time).total_seconds()
        
        if total_duration <= 0:
            log.warning(f"Invalid duration for activity {activity['id']}")
            return None
        
        progress = min(1.0, max(0.0, elapsed_time / total_duration))
        
        # Calculate position along the path
        return calculate_position_along_path(valid_path, progress)
    except Exception as e:
        log.error(f"Error calculating position for activity {activity['id']}: {e}")
        return None

def update_citizen_position(tables, citizen_id: str, position: Dict) -> bool:
    """Update the position of a citizen in the database."""
    try:
        # Get the citizen record
        citizen = get_citizen_info(tables, citizen_id)
        if not citizen:
            return False
        
        # Update the position
        tables['citizens'].update(citizen['id'], {
            'Position': json.dumps(position),
            'Point': f"citizen_{position['lat']}_{position['lng']}"
        })
        
        log.info(f"Updated position for citizen **{citizen_id}** 📍: {position}")
        return True
    except Exception as e:
        log.error(f"Error updating position for citizen {citizen_id}: {e}")
        return False

def update_citizen_positions(dry_run: bool = False):
    """Main function to update citizen positions."""
    log_header(f"Update Citizen Positions (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    activities = get_active_activities(tables)
    
    if not activities:
        log.info("ℹ️ No active activities with paths found")
        return
    
    # Group activities by citizen
    citizen_activities = {}
    for activity in activities:
        citizen_id = activity['fields'].get('CitizenId')
        if not citizen_id:
            continue
        
        if citizen_id not in citizen_activities:
            citizen_activities[citizen_id] = []
        
        citizen_activities[citizen_id].append(activity)
    
    log.info(f"Found activities for **{len(citizen_activities)}** citizens 👥")
    
    # Update positions for each citizen
    success_count = 0
    for citizen_id, activities in citizen_activities.items():
        # Sort activities by end date (most recent first)
        activities.sort(key=lambda a: a['fields'].get('EndDate', ''), reverse=True)
        
        # Use the most recent activity to calculate position
        activity = activities[0]
        position = calculate_current_position(activity)
        
        if not position:
            log.warning(f"Could not calculate position for citizen {citizen_id}")
            continue
        
        if dry_run:
            log.info(f"🔍 [DRY RUN] Would update position for citizen **{citizen_id}**: {position}")
            success_count += 1
        else:
            if update_citizen_position(tables, citizen_id, position):
                success_count += 1
    
    log.info(f"✅ Position update complete. Successfully updated **{success_count}** out of **{len(citizen_activities)}** citizens")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update citizen positions.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    update_citizen_positions(dry_run=args.dry_run)
