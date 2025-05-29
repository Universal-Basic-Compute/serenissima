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
    current_time_utc: datetime.datetime, # Added current_time_utc
    resource_defs: Dict[str, Any] # Added resource_defs
) -> Optional[Dict]:
    """Creates an 'eat_from_inventory' activity."""
    food_name = resource_defs.get(food_resource_type_id, {}).get('name', food_resource_type_id)
    log.info(f"Attempting to create 'eat_from_inventory' for {citizen_username} eating {amount_to_eat} of {food_name}")
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
        end_time_utc = current_time_utc + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)
        
        activity_payload = {
            "ActivityId": f"eat_inv_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_from_inventory",
            "Citizen": citizen_username,
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": current_time_utc.isoformat(), # Use current_time_utc
            "EndDate": end_time_utc.isoformat(),
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
    # home_building_airtable_id is no longer needed if we consistently use custom_id
    home_building_custom_id: str,   # Custom BuildingId (bld_...) of the home
    food_resource_type_id: str, # Renamed for clarity
    amount_to_eat: float,
    is_at_home: bool,
    path_data_to_home: Optional[Dict],
    current_time_utc: datetime.datetime, # Added current_time_utc
    resource_defs: Dict[str, Any] # Added resource_defs
) -> Optional[Dict]:
    """
    Creates an 'eat_at_home' activity if the citizen is already at home,
    or a 'goto_home' activity if the citizen is not at home but needs to go there to eat.
    """
    from .goto_home_activity_creator import try_create as try_create_goto_home_activity

    if is_at_home:
        food_name = resource_defs.get(food_resource_type_id, {}).get('name', food_resource_type_id)
        log.info(f"Citizen {citizen_username} is at home. Attempting to create 'eat_at_home' activity at {home_building_custom_id} eating {amount_to_eat} of {food_name}.")
        try:
            # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
            # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
            end_time_utc = current_time_utc + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES)
            
            activity_payload = {
                "ActivityId": f"eat_home_{citizen_custom_id}_{int(time.time())}",
                "Type": "eat_at_home",
                "Citizen": citizen_username,
                "FromBuilding": home_building_custom_id, # Use custom BuildingId
                "ToBuilding": home_building_custom_id,   # Use custom BuildingId
                "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
                "StartDate": current_time_utc.isoformat(), # Use current_time_utc
                "EndDate": end_time_utc.isoformat(),
                "Description": f"Eating {amount_to_eat:.1f} {food_name} at home",
                "Status": "created"
            }
            activity_payload["Resources"] = json.dumps([{"ResourceId": food_resource_type_id, "Amount": amount_to_eat}])
            activity_payload["Notes"] = f"🍲 Eating {amount_to_eat:.1f} {food_name} at home."
            activity = tables['activities'].create(activity_payload)
            
            if activity and activity.get('id'):
                log.info(f"Created 'eat_at_home' activity: {activity['id']}")
                # Citizen UpdatedAt is handled by Airtable
                return activity
            return None
        except Exception as e:
            log.error(f"Error creating 'eat_at_home' for {citizen_username}: {e}")
            return None
    else:
        # Citizen is not at home, create 'goto_home' activity
        food_name = resource_defs.get(food_resource_type_id, {}).get('name', food_resource_type_id)
        log.info(f"Citizen {citizen_username} is not at home. Attempting to create 'goto_home' to eat {food_name}.")
        if path_data_to_home and path_data_to_home.get('success'):
            # try_create_goto_home_activity now expects the custom building ID for home_custom_id
            return try_create_goto_home_activity(
                tables,
                citizen_custom_id,
                citizen_username,
                citizen_airtable_id,
                home_building_custom_id, # Pass custom BuildingId
                path_data_to_home,
                current_time_utc, # Pass current_time_utc to goto_home creator
                # resource_defs is not directly used by goto_home, but passed for consistency if eat_at_home needs it for pathing decisions in future
            )
        else:
            log.warning(f"Path data to home for {citizen_username} is invalid or missing. Cannot create 'goto_home' to eat.")
            return None

def try_create_eat_at_tavern_activity(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    tavern_building_custom_id: str, # Changed to custom BuildingId
    current_time_utc: datetime.datetime, # Added current_time_utc
    resource_defs: Dict[str, Any], # Added resource_defs (though not used for generic meal description yet)
    details_payload: Optional[Dict[str, Any]] = None # Added details_payload
) -> Optional[Dict]:
    """Creates an 'eat_at_tavern' activity."""
    # The actual cost/food type might be determined by the processor or be generic
    log.info(f"Attempting to create 'eat_at_tavern' for {citizen_username} at tavern {tavern_building_custom_id} with details: {details_payload}")
    try:
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
        end_time_utc = current_time_utc + datetime.timedelta(minutes=EAT_ACTIVITY_DURATION_MINUTES) # Eating duration
        
        activity_payload = {
            "ActivityId": f"eat_tav_{citizen_custom_id}_{int(time.time())}",
            "Type": "eat_at_tavern",
            "Citizen": citizen_username,
            "FromBuilding": tavern_building_custom_id, # Use custom BuildingId
            "ToBuilding": tavern_building_custom_id,   # Use custom BuildingId
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": current_time_utc.isoformat(), # Use current_time_utc
            "EndDate": end_time_utc.isoformat(),
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
