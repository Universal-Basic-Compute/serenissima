import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_send_message_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the send_message chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the receiver's location or meeting place (no action needed)
    2. deliver_message_interaction - Process the message delivery and create the message record
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for {activity_type}: {e}")
        return False
    
    # Handle goto_location activity (first step in chain)
    if activity_type == "goto_location" and details.get("activityType") == "send_message":
        # No need to create the deliver_message_interaction activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the location to deliver a message to {details.get('receiverUsername')}.")
        log.info(f"The deliver_message_interaction activity should already be scheduled to start after this activity.")
        return True
    
    # Handle deliver_message_interaction activity (second step in chain)
    elif activity_type == "deliver_message_interaction":
        return _process_message_delivery(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in send_message processor: {activity_type}")
        return False

def _process_message_delivery(
    tables: Dict[str, Any],
    message_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Process the message delivery when the deliver_message_interaction activity is executed."""
    fields = message_activity.get('fields', {})
    sender = fields.get('Citizen')
    receiver_username = details.get('receiverUsername')
    content = details.get('content')
    message_type = details.get('messageType', 'personal')
    
    if not (sender and receiver_username and content):
        log.error(f"Missing data for message delivery: sender={sender}, receiver={receiver_username}, content={'present' if content else 'missing'}")
        return False
    
    # Verify the receiver exists
    receiver_formula = f"{{Username}}='{_escape_airtable_value(receiver_username)}'"
    receiver_records = tables["citizens"].all(formula=receiver_formula, max_records=1)
    
    if not receiver_records:
        log.error(f"Receiver {receiver_username} not found")
        return False
    
    try:
        # 1. Create the message record
        message_id = f"msg_{sender}_{receiver_username}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        message_fields = {
            "MessageId": message_id,
            "Sender": sender,
            "Receiver": receiver_username,
            "Content": content,
            "Type": message_type,
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        tables["messages"].create(message_fields)
        
        # 2. Check if a relationship exists between sender and receiver
        relationship_formula = f"OR(AND({{Citizen1}}='{_escape_airtable_value(sender)}', {{Citizen2}}='{_escape_airtable_value(receiver_username)}'), AND({{Citizen1}}='{_escape_airtable_value(receiver_username)}', {{Citizen2}}='{_escape_airtable_value(sender)}'))"
        relationship_records = tables["relationships"].all(formula=relationship_formula, max_records=1)
        
        if relationship_records:
            # Update existing relationship
            relationship_record = relationship_records[0]
            relationship_id = relationship_record['id']
            
            # Update LastInteraction and potentially strengthen the relationship
            current_strength = float(relationship_record['fields'].get('StrengthScore', 0))
            new_strength = min(100, current_strength + 2)  # Increment by 2, max 100
            
            tables["relationships"].update(relationship_id, {
                'LastInteraction': datetime.utcnow().isoformat(),
                'StrengthScore': new_strength
            })
            
            log.info(f"Updated relationship between {sender} and {receiver_username}. New strength: {new_strength}")
        else:
            # Create new relationship
            # Ensure citizens are in alphabetical order for Citizen1 and Citizen2
            if sender < receiver_username:
                citizen1 = sender
                citizen2 = receiver_username
            else:
                citizen1 = receiver_username
                citizen2 = sender
            
            relationship_id = f"rel_{citizen1}_{citizen2}"
            
            relationship_fields = {
                "RelationshipId": relationship_id,
                "Citizen1": citizen1,
                "Citizen2": citizen2,
                "Title": "Acquaintance",  # Default relationship type
                "Description": f"Initial contact established when {sender} sent a message to {receiver_username}.",
                "LastInteraction": datetime.utcnow().isoformat(),
                "Tier": 1,  # Initial tier
                "Status": "active",
                "StrengthScore": 10,  # Initial strength
                "TrustScore": 5,  # Initial trust
                "CreatedAt": datetime.utcnow().isoformat()
            }
            
            tables["relationships"].create(relationship_fields)
            
            log.info(f"Created new relationship between {sender} and {receiver_username}")
        
        # 3. Create a notification for the receiver
        notification_fields = {
            "Citizen": receiver_username,
            "Type": "message_received",
            "Content": f"You have received a {message_type} message from {sender}.",
            "Details": json.dumps({
                "messageId": message_id,
                "sender": sender,
                "messageType": message_type,
                "preview": content[:50] + ("..." if len(content) > 50 else "")
            }),
            "Asset": message_id,
            "AssetType": "message",
            "Status": "unread",
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully delivered message from {sender} to {receiver_username}")
        log.info(f"Created message record with ID: {message_id}")
        
        return True
    except Exception as e:
        log.error(f"Failed to process message delivery: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
