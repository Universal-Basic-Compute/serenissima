import logging
import json
from datetime import datetime, timezone

from backend.engine.utils.activity_helpers import LogColors, get_citizen_record
from backend.engine.utils.notification_helpers import create_notification

log = logging.getLogger(__name__)

def process_finalize_update_citizen_profile_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'finalize_update_citizen_profile' activity.
    - Reads profile update data from activity Notes.
    - Updates the citizen's record in the CITIZENS table.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen')

    log.info(f"{LogColors.PROCESS}Processing 'finalize_update_citizen_profile' activity {activity_guid} by {citizen_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes')
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes'.{LogColors.ENDC}")
            return False
        
        profile_update_data = json.loads(notes_str)
        
        citizen_airtable_id = profile_update_data.pop("citizenAirtableId", None) # Get and remove Airtable ID
        if not citizen_airtable_id:
            # Fallback: try to get citizen record by username if Airtable ID wasn't in notes
            citizen_record_for_update = get_citizen_record(tables, citizen_username)
            if not citizen_record_for_update:
                log.error(f"{LogColors.FAIL}Citizen {citizen_username} not found for profile update. Activity {activity_guid}.{LogColors.ENDC}")
                return False
            citizen_airtable_id = citizen_record_for_update['id']

        if not profile_update_data: # No actual fields to update
            log.warning(f"{LogColors.WARNING}No profile fields to update for citizen {citizen_username} in activity {activity_guid}.{LogColors.ENDC}")
            return True # Consider it success as there's nothing to do

        # Map frontend keys to Airtable field names if necessary
        airtable_field_map = {
            "firstName": "FirstName",
            "lastName": "LastName",
            "familyMotto": "FamilyMotto",
            "coatOfArmsImageUrl": "CoatOfArmsImageUrl", # Note: This might be handled differently (e.g., file upload then URL)
            "telegramUserId": "TelegramUserId",
            "color": "Color",
            "secondaryColor": "SecondaryColor",
            "description": "Description", # Assuming 'description' from frontend maps to 'Description' in Airtable
            "corePersonality": "CorePersonality", # Assuming this is a JSON string
            "preferences": "Preferences", # Assuming this is a JSON string
            "homeCity": "HomeCity" # For Forestieri
        }
        
        fields_to_update_airtable = {}
        for key, value in profile_update_data.items():
            airtable_key = airtable_field_map.get(key)
            if airtable_key:
                # Special handling for CorePersonality and Preferences if they are expected as JSON strings
                if airtable_key in ["CorePersonality", "Preferences"] and not isinstance(value, str):
                    try:
                        fields_to_update_airtable[airtable_key] = json.dumps(value)
                    except TypeError:
                        log.warning(f"Could not JSON-serialize {key} for citizen {citizen_username}. Value: {value}. Skipping this field.")
                        continue
                else:
                    fields_to_update_airtable[airtable_key] = value
            else:
                log.warning(f"Unknown profile field '{key}' received for citizen {citizen_username}. Skipping.")

        if not fields_to_update_airtable:
            log.warning(f"{LogColors.WARNING}No valid Airtable fields to update for citizen {citizen_username} after mapping. Activity {activity_guid}.{LogColors.ENDC}")
            return True

        # Add UpdatedAt timestamp
        fields_to_update_airtable["UpdatedAt"] = datetime.now(timezone.utc).isoformat()

        tables['citizens'].update(citizen_airtable_id, fields_to_update_airtable)
        log.info(f"{LogColors.SUCCESS}Successfully updated profile for citizen {citizen_username} (ID: {citizen_airtable_id}). Fields: {list(fields_to_update_airtable.keys())}. Activity {activity_guid}.{LogColors.ENDC}")
        
        create_notification(
            tables, 
            citizen_username, 
            "profile_updated", 
            "Your citizen profile has been successfully updated.", 
            {"updatedFields": list(fields_to_update_airtable.keys())}
        )
            
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_update_citizen_profile' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
