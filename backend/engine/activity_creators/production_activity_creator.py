"""
Creator for 'production' activities.
"""
import logging
import datetime
import time
import json
import uuid # Already imported in createActivities, but good practice here too
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any], 
    citizen_airtable_id: str, # Airtable record ID of the citizen
    citizen_custom_id: str,   # Custom CitizenId (ctz_...)
    citizen_username: str,    # Username
    building_custom_id: str,  # Custom BuildingId of the building
    recipe: Dict,
    current_time_utc: datetime.datetime, # Added current_time_utc
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """Creates a production activity based on a recipe."""
    log.info(f"Attempting to create production activity for {citizen_username} at building {building_custom_id} with explicit start: {start_time_utc_iso}")
    
    try:
        inputs = recipe.get('inputs', {})
        outputs = recipe.get('outputs', {})
        craft_minutes = recipe.get('craftMinutes', 60)

        effective_start_dt: datetime.datetime
        if start_time_utc_iso:
            effective_start_dt = datetime.datetime.fromisoformat(start_time_utc_iso.replace("Z", "+00:00"))
            if effective_start_dt.tzinfo is None: effective_start_dt = pytz.UTC.localize(effective_start_dt)
        else:
            effective_start_dt = current_time_utc
        
        effective_start_date_iso = effective_start_dt.isoformat()
        effective_end_date_iso = (effective_start_dt + datetime.timedelta(minutes=craft_minutes)).isoformat()
        
        input_desc = ", ".join([f"**{amount:,.0f}** **{resource}**" for resource, amount in inputs.items()])
        output_desc = ", ".join([f"**{amount:,.0f}** **{resource}**" for resource, amount in outputs.items()])
        
        activity_id_str = f"produce_{citizen_custom_id}_{uuid.uuid4()}"
        
        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "production",
            "Citizen": citizen_username,
            "FromBuilding": building_custom_id, 
            "ToBuilding": building_custom_id,   
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Notes": f"⚒️ Producing {output_desc} from {input_desc}",
            "Description": f"Producing {output_desc}",
            "RecipeInputs": json.dumps(inputs),
            "RecipeOutputs": json.dumps(outputs),
            "RecipeCraftMinutes": craft_minutes, # Store the craft minutes for this recipe
            "Status": "created"
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created production activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create production activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating production activity for {citizen_username}: {e}")
        return None
