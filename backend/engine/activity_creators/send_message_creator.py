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
    Create the complete send_message activity chain:
    1. A goto_location activity for travel to the receiver's location or specified meeting place
    2. A deliver_message_interaction activity to deliver the message
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    receiver_username = details.get('receiverUsername')
    content = details.get('content')
    message_type = details.get('messageType', 'personal')
    target_building_id = details.get('targetBuildingId')  # Optional specific meeting place
    
    # Validate required parameters
    if not (receiver_username and content):
        log.error(f"Missing required details for send_message: receiverUsername or content")
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
    
    # Get receiver record to determine their position
    receiver_record = get_citizen_record(tables, receiver_username)
    if not receiver_record:
        log.error(f"Receiver {receiver_username} not found")
        return False
    
    # Determine the destination (receiver's location or specified meeting place)
    destination_building_id = None
    destination_type = None
    receiver_position = None
    
    # If a specific target building was provided, use it
    if target_building_id:
        target_building_record = get_building_record(tables, target_building_id)
        if target_building_record:
            destination_building_id = target_building_id
            destination_type = 'meeting_place'
            log.info(f"Using specified meeting place: {destination_building_id}")
        else:
            log.warning(f"Specified building {target_building_id} not found. Will try to find receiver's location.")
    
    # If no valid destination yet, try receiver's current location
    if not destination_building_id:
        receiver_position_str = receiver_record['fields'].get('Position')
        if receiver_position_str:
            try:
                receiver_position = json.loads(receiver_position_str)
                destination_type = 'receiver_location'
                log.info(f"Using receiver's current position as destination")
            except json.JSONDecodeError:
                log.error(f"Could not parse receiver position: {receiver_position_str}")
                # Continue to try other options
    
    # If still no destination, try receiver's workplace
    if not destination_building_id and not receiver_position:
        receiver_workplace = get_citizen_workplace(tables, receiver_username)
        if receiver_workplace:
            destination_building_id = receiver_workplace
            destination_type = 'receiver_workplace'
            log.info(f"Using receiver's workplace as destination: {destination_building_id}")
    
    # If still no destination, try receiver's home
    if not destination_building_id and not receiver_position:
        receiver_home = get_citizen_home(tables, receiver_username)
        if receiver_home:
            destination_building_id = receiver_home
            destination_type = 'receiver_home'
            log.info(f"Using receiver's home as destination: {destination_building_id}")
    
    # If still no valid destination, fail
    if not destination_building_id and not receiver_position:
        log.error(f"Could not determine a valid destination to meet receiver {receiver_username}")
        return False
    
    # Calculate path to destination
    path_data = None
    if destination_type != 'receiver_location':
        destination_building_record = get_building_record(tables, destination_building_id)
        if not destination_building_record:
            log.error(f"Could not find building record for {destination_building_id}")
            return False
        path_data = find_path_between_buildings(None, destination_building_record, current_position=current_position)
    else:
        # For receiver's current location, create a direct path
        if current_position and receiver_position:
            # Use a simplified path directly to the receiver's position
            path_data = {
                'path': [
                    {'lat': current_position['lat'], 'lng': current_position['lng']},
                    {'lat': receiver_position['lat'], 'lng': receiver_position['lng']}
                ],
                'timing': {'durationSeconds': 1200}  # Default 20 minutes for direct path
            }
    
    if not path_data or not path_data.get('path'):
        log.error(f"Could not find path to destination")
        return False
    
    # Create activity IDs
    goto_activity_id = f"goto_location_for_message_{sender}_{receiver_username}_{ts}"
    message_activity_id = f"deliver_message_interaction_{sender}_{receiver_username}_{ts}"
    
    now_utc = datetime.utcnow()
    travel_start_date = now_utc.isoformat()
    
    # Calculate travel end date based on path duration
    duration_seconds = path_data.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min if not specified
    travel_end_date = (now_utc + timedelta(seconds=duration_seconds)).isoformat()
    
    # Calculate message delivery activity times (10 minutes after arrival)
    message_start_date = travel_end_date  # Start immediately after arrival
    message_end_date = (datetime.fromisoformat(travel_end_date.replace('Z', '+00:00')) + timedelta(minutes=10)).isoformat()
    
    # Store message details in the Details field for the processor to use
    details_json = json.dumps({
        "receiverUsername": receiver_username,
        "content": content,
        "messageType": message_type
    })
    
    # 1. Create goto_location activity
    goto_payload = {
        "ActivityId": goto_activity_id,
        "Type": "goto_location",
        "Citizen": sender,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": destination_building_id if destination_type != 'receiver_location' else None,
        "Path": json.dumps(path_data.get('path', [])),
        "Details": json.dumps({
            "receiverUsername": receiver_username,
            "content": content,
            "messageType": message_type,
            "activityType": "send_message",
            "nextStep": "deliver_message_interaction"
        }),
        "Status": "created",
        "Title": f"Traveling to deliver a message to {receiver_username}",
        "Description": f"Traveling to meet {receiver_username} to deliver a {message_type} message",
        "Notes": f"First step of send_message process. Will be followed by deliver_message_interaction activity.",
        "CreatedAt": travel_start_date,
        "StartDate": travel_start_date,
        "EndDate": travel_end_date,
        "Priority": 30  # Medium priority for social activities
    }
    
    # 2. Create deliver_message_interaction activity (to be executed after arrival)
    message_payload = {
        "ActivityId": message_activity_id,
        "Type": "deliver_message_interaction",
        "Citizen": sender,
        "FromBuilding": destination_building_id if destination_type != 'receiver_location' else None,
        "ToBuilding": destination_building_id if destination_type != 'receiver_location' else None,
        "Details": details_json,
        "Status": "created",
        "Title": f"Delivering a message to {receiver_username}",
        "Description": f"Having a conversation with {receiver_username} to deliver a {message_type} message",
        "Notes": f"Second step of send_message process. Will create a message record and potentially update relationship.",
        "CreatedAt": travel_start_date,  # Created at the same time as the goto activity
        "StartDate": message_start_date,  # But starts after the goto activity ends
        "EndDate": message_end_date,
        "Priority": 30  # Medium priority for social activities
    }

    try:
        # Create both activities in sequence
        tables["activities"].create(goto_payload)
        tables["activities"].create(message_payload)
        
        log.info(f"Created complete send_message activity chain for citizen {sender} to {receiver_username}:")
        log.info(f"  1. goto_location activity {goto_activity_id}")
        log.info(f"  2. deliver_message_interaction activity {message_activity_id}")
        return True
    except Exception as e:
        log.error(f"Failed to create send_message activity chain: {e}")
        return False
