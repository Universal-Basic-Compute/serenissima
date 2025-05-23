"""
Creator for 'goto_work' activities.
"""
import logging
import datetime
import time
import json
import uuid # Added import
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

def _escape_airtable_value(value: str) -> str:
    """Escapes single quotes for Airtable formulas."""
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def try_create(
    tables: Dict[str, Any], 
    citizen_custom_id: str, 
    citizen_username: str, 
    citizen_airtable_id: str, 
    workplace_custom_id: str, # This is the custom BuildingId of the workplace
    path_data: Dict,
    citizen_home_record: Optional[Dict], # Airtable record of the citizen's home
    resource_definitions: Dict, # Global resource definitions
    is_at_home: bool, # Flag indicating if citizen is currently at home
    citizen_current_position_str: Optional[str] # Citizen's current position as JSON string
) -> Optional[Dict]:
    """Creates a goto_work activity for a citizen. If at home, may pick up food."""
    log.info(f"Attempting to create goto_work activity for citizen {citizen_username} (CustomID: {citizen_custom_id}) to workplace {workplace_custom_id}")

    # Logic to pick up food if at home
    if is_at_home and citizen_home_record and resource_definitions:
        home_building_custom_id = citizen_home_record['fields'].get('BuildingId')
        if home_building_custom_id:
            log.info(f"Citizen {citizen_username} is at home {home_building_custom_id}. Checking for food to take.")
            home_resources_formula = (f"AND({{AssetType}}='building', "
                                      f"{{Asset}}='{_escape_airtable_value(home_building_custom_id)}', "
                                      f"{{Owner}}='{_escape_airtable_value(citizen_username)}')")
            try:
                all_home_resources = tables['resources'].all(formula=home_resources_formula)
                available_food_at_home = []
                for res_rec in all_home_resources:
                    res_type = res_rec['fields'].get('Type')
                    res_count = float(res_rec['fields'].get('Count', 0))
                    res_def = resource_definitions.get(res_type)
                    if res_def and res_def.get('category') == 'food' and res_count >= 1.0:
                        available_food_at_home.append({
                            'record_id': res_rec['id'], # Airtable record ID of the resource stack in home
                            'type': res_type,
                            'name': res_def.get('name', res_type),
                            'tier': int(res_def.get('tier', 0) or 0), # Ensure tier is int, default 0
                            'count': res_count
                        })
                
                if available_food_at_home:
                    available_food_at_home.sort(key=lambda x: x['tier'], reverse=True)
                    food_to_take = available_food_at_home[0]
                    
                    log.info(f"Citizen {citizen_username} will take 1 unit of {food_to_take['name']} (Tier: {food_to_take['tier']}) from home.")

                    # Decrement from home
                    new_home_count = food_to_take['count'] - 1.0
                    if new_home_count > 0.001:
                        tables['resources'].update(food_to_take['record_id'], {'Count': new_home_count})
                    else:
                        tables['resources'].delete(food_to_take['record_id'])
                    log.info(f"Decremented 1 unit of {food_to_take['name']} from home {home_building_custom_id}. New count: {new_home_count if new_home_count > 0.001 else 0}.")

                    # Add to citizen's inventory
                    citizen_inv_food_formula = (f"AND({{AssetType}}='citizen', "
                                                f"{{Asset}}='{_escape_airtable_value(citizen_username)}', "
                                                f"{{Owner}}='{_escape_airtable_value(citizen_username)}', "
                                                f"{{Type}}='{_escape_airtable_value(food_to_take['type'])}')")
                    existing_inv_food = tables['resources'].all(formula=citizen_inv_food_formula, max_records=1)
                    now_iso_food = datetime.datetime.now(pytz.UTC).isoformat()
                    
                    position_for_new_resource = citizen_current_position_str if citizen_current_position_str else citizen_home_record['fields'].get('Position', '{}')

                    if existing_inv_food:
                        inv_food_record = existing_inv_food[0]
                        new_inv_count = float(inv_food_record['fields'].get('Count', 0)) + 1.0
                        tables['resources'].update(inv_food_record['id'], {'Count': new_inv_count})
                    else:
                        food_def_details = resource_definitions.get(food_to_take['type'], {})
                        new_inv_res_payload = {
                            "ResourceId": f"resource-{uuid.uuid4()}",
                            "Type": food_to_take['type'],
                            "Name": food_def_details.get('name', food_to_take['type']),
                            "Asset": citizen_username,
                            "AssetType": "citizen",
                            "Owner": citizen_username,
                            "Count": 1.0,
                            "Position": position_for_new_resource,
                            "CreatedAt": now_iso_food
                        }
                        tables['resources'].create(new_inv_res_payload)
                    log.info(f"Added 1 unit of {food_to_take['name']} to {citizen_username}'s inventory.")
                else:
                    log.info(f"No food available at home for {citizen_username} to take.")
            except Exception as e_food_pickup:
                log.error(f"Error during food pickup for {citizen_username} from home: {e_food_pickup}")
        else:
            log.info(f"Citizen {citizen_username} is at home, but home BuildingId is missing. Cannot pick up food.")
    elif not is_at_home:
        log.info(f"Citizen {citizen_username} is not at home. No food pickup attempt.")


    try:
        now = datetime.datetime.now(pytz.UTC)
        
        start_date = path_data.get('timing', {}).get('startDate', now.isoformat())
        end_date = path_data.get('timing', {}).get('endDate')
        
        if not end_date:
            end_time = now + datetime.timedelta(hours=1) # Default 1 hour travel
            end_date = end_time.isoformat()
        
        path_json = json.dumps(path_data.get('path', []))
        
        transporter = path_data.get('transporter') # Get transporter from path_data
        
        activity_payload = {
            "ActivityId": f"goto_work_{citizen_custom_id}_{int(time.time())}",
            "Type": "goto_work",
            "Citizen": citizen_username,
            "ToBuilding": workplace_custom_id, # Use custom BuildingId
            "CreatedAt": now.isoformat(),
            "StartDate": start_date,
            "EndDate": end_date,
            "Path": path_json,
            "Transporter": transporter, # Add Transporter field
            "Notes": "🏢 **Going to work**"
        }
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created goto_work activity: {activity['id']}")
            # Citizen UpdatedAt is handled by Airtable
            return activity
        else:
            log.error(f"Failed to create goto_work activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating goto_work activity for {citizen_username}: {e}")
        return None
