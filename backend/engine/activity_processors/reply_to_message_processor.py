import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_reply_to_message_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process the reply_to_message activity.
    
    This processor handles the reply to a previously received message.
    The citizen is already at the location where they received the original message.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for reply_to_message: {e}")
        return False
    
    original_message_id = details.get('originalMessageId')
    receiver_username = details.get('receiverUsername')  # The original sender
    message_type = details.get('messageType', 'personal')
    
    if not (citizen and receiver_username and original_message_id):
        log.error(f"Missing data for reply: citizen={citizen}, receiver={receiver_username}, originalMessageId={original_message_id}")
        return False
    
    # Verify the receiver (original sender) exists
    receiver_formula = f"{{Username}}='{_escape_airtable_value(receiver_username)}'"
    receiver_records = tables["citizens"].all(formula=receiver_formula, max_records=1)
    
    if not receiver_records:
        log.error(f"Receiver {receiver_username} not found")
        return False
    
    # Get the original message to reference in the reply
    message_formula = f"{{MessageId}}='{_escape_airtable_value(original_message_id)}'"
    message_records = tables["messages"].all(formula=message_formula, max_records=1)
    
    if not message_records:
        log.error(f"Original message {original_message_id} not found")
        return False
    
    original_message = message_records[0]
    original_content = original_message['fields'].get('Content', '')
    
    # Generate a simple reply content based on the original message
    # In a real implementation, this would be provided by the user or AI
    reply_content = f"Thank you for your message. I am responding to: \"{original_content[:50]}...\""
    
    try:
        # 1. Create the reply message record
        reply_message_id = f"msg_{citizen}_{receiver_username}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        message_fields = {
            "MessageId": reply_message_id,
            "Sender": citizen,
            "Receiver": receiver_username,
            "Content": reply_content,
            "Type": message_type,
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        tables["messages"].create(message_fields)
        
        # 2. Update the relationship between sender and receiver
        relationship_formula = f"OR(AND({{Citizen1}}='{_escape_airtable_value(citizen)}', {{Citizen2}}='{_escape_airtable_value(receiver_username)}'), AND({{Citizen1}}='{_escape_airtable_value(receiver_username)}', {{Citizen2}}='{_escape_airtable_value(citizen)}'))"
        relationship_records = tables["relationships"].all(formula=relationship_formula, max_records=1)
        
        if relationship_records:
            # Update existing relationship
            relationship_record = relationship_records[0]
            relationship_id = relationship_record['id']
            
            # Update LastInteraction and potentially strengthen the relationship
            current_strength = float(relationship_record['fields'].get('StrengthScore', 0))
            new_strength = min(100, current_strength + 3)  # Increment by 3 for reply, max 100
            
            tables["relationships"].update(relationship_id, {
                'LastInteraction': datetime.utcnow().isoformat(),
                'StrengthScore': new_strength
            })
            
            log.info(f"Updated relationship between {citizen} and {receiver_username}. New strength: {new_strength}")
        
        # 3. Create a notification for the receiver (original sender)
        notification_fields = {
            "Citizen": receiver_username,
            "Type": "message_received",
            "Content": f"You have received a reply from {citizen} to your message.",
            "Details": json.dumps({
                "messageId": reply_message_id,
                "sender": citizen,
                "messageType": message_type,
                "originalMessageId": original_message_id,
                "preview": reply_content[:50] + ("..." if len(reply_content) > 50 else "")
            }),
            "Asset": reply_message_id,
            "AssetType": "message",
            "Status": "unread",
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully delivered reply from {citizen} to {receiver_username}")
        log.info(f"Created reply message record with ID: {reply_message_id}")
        
        return True
    except Exception as e:
        log.error(f"Failed to process message reply: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
