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
    current_time_utc: datetime.datetime # Added current_time_utc
) -> Optional[Dict]:
    """Creates a production activity based on a recipe."""
    log.info(f"Attempting to create production activity for {citizen_username} at building {building_custom_id}")
    
    try:
        inputs = recipe.get('inputs', {})
        outputs = recipe.get('outputs', {})
        craft_minutes = recipe.get('craftMinutes', 60)
        
        # VENICE_TIMEZONE = pytz.timezone('Europe/Rome') # Not needed if using current_time_utc
        # now_venice = datetime.datetime.now(VENICE_TIMEZONE) # Replaced by current_time_utc
        end_time_utc = current_time_utc + datetime.timedelta(minutes=craft_minutes)
        
        input_desc = ", ".join([f"**{amount:,.0f}** **{resource}**" for resource, amount in inputs.items()])
        output_desc = ", ".join([f"**{amount:,.0f}** **{resource}**" for resource, amount in outputs.items()])
        
        activity_id_str = f"produce_{citizen_custom_id}_{uuid.uuid4()}"
        
        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "production",
            "Citizen": citizen_username,
            "FromBuilding": building_custom_id, # Use custom BuildingId
            "ToBuilding": building_custom_id,   # Same building for production
            "CreatedAt": current_time_utc.isoformat(), # Use current_time_utc
            "StartDate": current_time_utc.isoformat(), # Use current_time_utc
            "EndDate": end_time_utc.isoformat(),
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
