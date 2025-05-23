"""
Creator for 'eat' activities.
"""
import logging
import datetime
import time
import json
import uuid
import pytz 
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

EAT_ACTIVITY_DURATION_MINUTES = 30 # Default duration for eating

def try_create_eat_from_inventory_activity(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    food_resource_type: str,
    amount_to_eat: float
) -> Optional[Dict]:
    """Creates an 'eat_from_inventory' activity."""
    log.info(f"Attempting to create 'eat_from_inventory' for {citizen_username} eating {amount_to_eat} of {food_resource_type}")
    try:
        now = datetime.datetime.now(pytz.UTC)
        end_time = now + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)
        
        activity_payload = {
            "ActivityId": f"eat_inv_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_from_inventory",
            "Citizen": citizen_username,
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": f"🍲 Eating {amount_to_eat:.1f} {food_resource_type} from personal inventory.",
            "ResourceId": food_resource_type, # What is being eaten
            "Amount": amount_to_eat          # How much is being eaten
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'eat_from_inventory' activity: {activity['id']}")
            # Update citizen's UpdatedAt
            tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': now.isoformat()})
            return activity
        return None
    except Exception as e:
        log.error(f"Error creating 'eat_from_inventory' for {citizen_username}: {e}")
        return None

def try_create_eat_at_home_activity(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    home_building_airtable_id: str, # Airtable Record ID of the home
    food_resource_type: str,
    amount_to_eat: float
) -> Optional[Dict]:
    """Creates an 'eat_at_home' activity."""
    log.info(f"Attempting to create 'eat_at_home' for {citizen_username} at home {home_building_airtable_id} eating {amount_to_eat} of {food_resource_type}")
    try:
        now = datetime.datetime.now(pytz.UTC)
        end_time = now + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)
        
        activity_payload = {
            "ActivityId": f"eat_home_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_at_home",
            "Citizen": citizen_username,
            "FromBuilding": home_building_airtable_id, # Location of eating
            "ToBuilding": home_building_airtable_id,   # Stays in the same building
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": f"🍲 Eating {amount_to_eat:.1f} {food_resource_type} at home.",
            "ResourceId": food_resource_type,
            "Amount": amount_to_eat
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'eat_at_home' activity: {activity['id']}")
            tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': now.isoformat()})
            return activity
        return None
    except Exception as e:
        log.error(f"Error creating 'eat_at_home' for {citizen_username}: {e}")
        return None

def try_create_eat_at_tavern_activity(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    tavern_building_airtable_id: str # Airtable Record ID of the tavern
) -> Optional[Dict]:
    """Creates an 'eat_at_tavern' activity."""
    # The actual cost/food type might be determined by the processor or be generic
    log.info(f"Attempting to create 'eat_at_tavern' for {citizen_username} at tavern {tavern_building_airtable_id}")
    try:
        now = datetime.datetime.now(pytz.UTC)
        end_time = now + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES) # Eating duration
        
        activity_payload = {
            "ActivityId": f"eat_tav_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_at_tavern",
            "Citizen": citizen_username,
            "FromBuilding": tavern_building_airtable_id, # Location of eating
            "ToBuilding": tavern_building_airtable_id,   # Stays in the same building
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Notes": f"🍲 Eating a meal at the tavern."
            # Specifics like cost or food type consumed can be handled by the processor
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'eat_at_tavern' activity: {activity['id']}")
            tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': now.isoformat()})
            return activity
        return None
    except Exception as e:
        log.error(f"Error creating 'eat_at_tavern' for {citizen_username}: {e}")
        return None
