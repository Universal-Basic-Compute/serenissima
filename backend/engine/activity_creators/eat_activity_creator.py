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
    food_resource_type_id: str, # Renamed for clarity
    amount_to_eat: float,
    current_time_utc: datetime.datetime, 
    resource_defs: Dict[str, Any],
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates an 'eat_from_inventory' activity."""
    food_name = resource_defs.get(food_resource_type_id, {}).get('name', food_resource_type_id)
    log.info(f"Attempting to create 'eat_from_inventory' for {citizen_username} eating {amount_to_eat} of {food_name}")
    try:
        effective_start_dt: datetime.datetime
        if start_time_utc_iso:
            effective_start_dt = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if effective_start_dt.tzinfo is None: effective_start_dt = pytz.UTC.localize(effective_start_dt)
        else:
            effective_start_dt = current_time_utc
        
        effective_start_date_iso = effective_start_dt.isoformat()
        effective_end_date_iso = (effective_start_dt + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)).isoformat()
        
        activity_payload = {
            "ActivityId": f"eat_inv_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_from_inventory",
            "Citizen": citizen_username,
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Description": f"Eating {amount_to_eat:.1f} {food_name} from inventory",
            "Status": "created"
        }
        activity_payload["Resources"] = json.dumps([{"ResourceId": food_resource_type_id, "Amount": amount_to_eat}])
        activity_payload["Notes"] = f"🍲 Eating {amount_to_eat:.1f} {food_name} from personal inventory."
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'eat_from_inventory' activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
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
    home_building_custom_id: str,
    food_resource_type_id: str,
    amount_to_eat: float,
    current_time_utc: datetime.datetime,
    resource_defs: Dict[str, Any],
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """
    Creates an 'eat_at_home' activity. Assumes citizen is at home.
    """
    food_name = resource_defs.get(food_resource_type_id, {}).get('name', food_resource_type_id)
    log.info(f"Attempting to create 'eat_at_home' activity for {citizen_username} at {home_building_custom_id} eating {amount_to_eat} of {food_name} with explicit start: {start_time_utc_iso}.")
    try:
        effective_start_dt: datetime.datetime
        if start_time_utc_iso:
            effective_start_dt = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if effective_start_dt.tzinfo is None: effective_start_dt = pytz.UTC.localize(effective_start_dt)
        else:
            effective_start_dt = current_time_utc
        
        effective_start_date_iso = effective_start_dt.isoformat()
        effective_end_date_iso = (effective_start_dt + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)).isoformat()
            
        activity_payload = {
            "ActivityId": f"eat_home_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_at_home",
            "Citizen": citizen_username,
            "FromBuilding": home_building_custom_id,
            "ToBuilding": home_building_custom_id,
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Description": f"Eating {amount_to_eat:.1f} {food_name} at home",
            "Status": "created"
        }
        activity_payload["Resources"] = json.dumps([{"ResourceId": food_resource_type_id, "Amount": amount_to_eat}])
        activity_payload["Notes"] = f"🍲 Eating {amount_to_eat:.1f} {food_name} at home."
        activity = tables['activities'].create(activity_payload)
            
        if activity and activity.get('id'):
            log.info(f"Created 'eat_at_home' activity: {activity['id']}")
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
    tavern_building_custom_id: str, 
    current_time_utc: datetime.datetime, 
    resource_defs: Dict[str, Any], 
    details_payload: Optional[Dict[str, Any]] = None,
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates an 'eat_at_tavern' activity."""
    # The actual cost/food type might be determined by the processor or be generic
    log.info(f"Attempting to create 'eat_at_tavern' for {citizen_username} at tavern {tavern_building_custom_id} with details: {details_payload} and explicit start: {start_time_utc_iso}")
    try:
        effective_start_dt: datetime.datetime
        if start_time_utc_iso:
            effective_start_dt = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if effective_start_dt.tzinfo is None: effective_start_dt = pytz.UTC.localize(effective_start_dt)
        else:
            effective_start_dt = current_time_utc
        
        effective_start_date_iso = effective_start_dt.isoformat()
        effective_end_date_iso = (effective_start_dt + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)).isoformat()
        
        activity_payload = {
            "ActivityId": f"eat_tav_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_at_tavern",
            "Citizen": citizen_username,
            "FromBuilding": tavern_building_custom_id, 
            "ToBuilding": tavern_building_custom_id,   
            "CreatedAt": effective_start_date_iso, 
            "StartDate": effective_start_date_iso, 
            "EndDate": effective_end_date_iso,
            "Notes": f"🍲 Eating a meal at the tavern.",
            "Description": "Eating a meal at the tavern",
            "Status": "created",
            # Specifics like cost or food type consumed can be handled by the processor
        }
        if details_payload:
            activity_payload["Details"] = json.dumps(details_payload)
            
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created 'eat_at_tavern' activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        return None
    except Exception as e:
        log.error(f"Error creating 'eat_at_tavern' for {citizen_username}: {e}")
        return None
