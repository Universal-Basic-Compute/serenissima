import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings,
    get_building_record,
    get_citizen_record,
    get_citizen_home,
    get_citizen_workplace
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Create the complete manage_guild_membership activity chain:
    1. A goto_location activity for travel to the guild hall or town hall
    2. A perform_guild_membership_action activity to execute the membership action
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    guild_id = details.get('guildId')
    membership_action = details.get('membershipAction')  # "join", "leave", "accept_invite"
    guild_hall_building_id = details.get('guildHallBuildingId')  # Optional specific guild hall
    
    # Validate required parameters
    if not (guild_id and membership_action):
        log.error(f"Missing required details for manage_guild_membership: guildId or membershipAction")
        return False
    
    # Validate membership_action
    valid_actions = ["join", "leave", "accept_invite"]
    if membership_action not in valid_actions:
        log.error(f"Invalid membershipAction: {membership_action}. Must be one of {valid_actions}")
        return False

    sender = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get current citizen position to determine path
    sender_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if sender_position_str:
        try:
            current_position = json.loads(sender_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse sender position: {sender_position_str}")
            return False
    
    # Determine the destination (guild hall or town hall)
    destination_building_id = None
    
    # If a specific guild hall was provided, use it
    if guild_hall_building_id:
        guild_hall_record = get_building_record(tables, guild_hall_building_id)
        if guild_hall_record:
            destination_building_id = guild_hall_building_id
            log.info(f"Using specified guild hall: {destination_building_id}")
        else:
            log.warning(f"Specified guild hall {guild_hall_building_id} not found. Will try to find a suitable guild hall.")
    
    # If no valid destination yet, try to find the guild hall for this guild
    if not destination_building_id:
        # Query for guild halls associated with this guild
        formula = f"AND({{Type}}='guild_hall', {{GuildId}}='{_escape_airtable_value(guild_id)}')"
        guild_halls = tables['buildings'].all(formula=formula)
        
        if guild_halls:
            # Use the first guild hall found
            destination_building_id = guild_halls[0]['fields'].get('BuildingId')
            log.info(f"Found guild hall for guild {guild_id}: {destination_building_id}")
        else:
            # If no guild hall found, use a town hall
            formula = "{{Type}}='town_hall'"
            town_halls = tables['buildings'].all(formula=formula)
            
            if town_halls:
                # Use the first town hall found
                destination_building_id = town_halls[0]['fields'].get('BuildingId')
                log.info(f"No guild hall found for guild {guild_id}. Using town hall: {destination_building_id}")
            else:
                log.error(f"Could not find a guild hall for guild {guild_id} or any town hall")
                return False
    
    # Get the guild record to include in the activity details
    formula = f"{{GuildId}}='{_escape_airtable_value(guild_id)}'"
    guild_records = tables['guilds'].all(formula=formula, max_records=1)
    
    if not guild_records:
        log.error(f"Guild {guild_id} not found")
        return False
    
    guild_record = guild_records[0]
    guild_name = guild_record['fields'].get('GuildName', 'Unknown Guild')
    entry_fee = guild_record['fields'].get('EntryFee', 0)
    
    # Calculate path to destination
    destination_building_record = get_building_record(tables, destination_building_id)
    if not destination_building_record:
        log.error(f"Could not find building record for {destination_building_id}")
        return False
    
    path_data = find_path_between_buildings(None, destination_building_record, current_position=current_position)
    
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to destination")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_guild_{sender}_{guild_id}_{ts}"
    action_activity_id = f"perform_guild_membership_action_{sender}_{guild_id}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate membership action activity times (15 minutes after arrival)
    action_start_date = travel_end_date  # Start immediately after arrival
    action_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Store guild membership details in the Details field for the processor to use
    details_json = json.dumps({
        "guildId": guild_id,
        "guildName": guild_name,
        "membershipAction": membership_action,
        "entryFee": entry_fee
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": sender,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": destination_building_id,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "guildId": guild_id,
            "guildName": guild_name,
            "membershipAction": membership_action,
            "entryFee": entry_fee,
            "activityType": "manage_guild_membership",
            "nextStep": "perform_guild_membership_action"
        }),
        "Status": "created",
        "Title": f"Traveling to {guild_name} guild hall",
        "Description": f"Traveling to {destination_building_id} to {membership_action} the {guild_name}",
        "Notes": f"First step of manage_guild_membership process. Will be followed by perform_guild_membership_action activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 40  # Medium priority for guild activities
    }
    
    # 2. Create perform_guild_membership_action activity (to be executed after arrival)
    action_payload = {
        "ActivityId": action_activity_id,
        "Type": "perform_guild_membership_action",
        "Citizen": sender,
        "FromBuilding": destination_building_id,
        "ToBuilding": destination_building_id,
        "Details": details_json,
        "Status": "created",
        "Title": f"{membership_action.replace('_', ' ').title()} {guild_name}",
        "Description": f"Performing {membership_action.replace('_', ' ')} action for {guild_name} guild",
        "Notes": f"Second step of manage_guild_membership process. Will update guild membership status.",
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": action_start_date,  # But starts after the goto activity ends
        "EndDate": action_end_date,
        "Priority": 40  # Medium priority for guild activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(action_payload)
        
        log.info(f"Created complete manage_guild_membership activity chain for citizen {sender} to {membership_action} guild {guild_id}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. perform_guild_membership_action activity {action_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create manage_guild_membership activity chain: {e}")
        return False
