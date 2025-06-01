import logging
import json
import requests
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

# Kinos API configuration
KINOS_API_URL = os.getenv("KINOS_API_URL", "https://api.kinos-engine.ai")
KINOS_BLUEPRINT = os.getenv("KINOS_BLUEPRINT", "serenissima-ai")
KINOS_MODEL = os.getenv("KINOS_MODEL", "gemini/gemini-2.5-pro-preview-03-25")

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
    
    # Generate a reply using Kinos API
    reply_content = generate_reply_with_kinos(citizen, receiver_username, original_content)
    if not reply_content:
        # Fallback to a simple reply if Kinos API fails
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
        
        # 4. Add the message to the Kinos channel for the receiver
        add_message_to_kinos_channel(receiver_username, citizen, reply_content)
        
        log.info(f"Successfully delivered reply from {citizen} to {receiver_username}")
        log.info(f"Created reply message record with ID: {reply_message_id}")
        
        return True
    except Exception as e:
        log.error(f"Failed to process message reply: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False

def generate_reply_with_kinos(replier_username: str, sender_username: str, original_message: str) -> Optional[str]:
    """
    Generate a reply using the Kinos API.
    
    Args:
        replier_username: The username of the citizen replying to the message
        sender_username: The username of the original sender
        original_message: The content of the original message
    
    Returns:
        The generated reply content or None if the API call fails
    """
    try:
        endpoint = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{replier_username}/channels/{sender_username}/messages"
        
        payload = {
            "content": original_message,
            "model": KINOS_MODEL,
            "history_length": 25,
            "mode": "creative",
            "addSystem": f"You are {replier_username}, a citizen of La Serenissima, responding to a message from {sender_username}. Respond in character, keeping your reply concise and relevant to the message."
        }
        
        log.info(f"Calling Kinos API to generate reply from {replier_username} to {sender_username}")
        response = requests.post(endpoint, json=payload)
        
        if response.status_code == 200:
            response_data = response.json()
            reply_content = response_data.get("content", "")
            
            # Unescape HTML entities if present
            import html
            reply_content = html.unescape(reply_content)
            
            log.info(f"Successfully generated reply with Kinos API")
            return reply_content
        else:
            log.error(f"Failed to generate reply with Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log.error(f"Error calling Kinos API: {e}")
        return None

def add_message_to_kinos_channel(receiver_username: str, sender_username: str, message_content: str) -> bool:
    """
    Add the message to the Kinos channel to keep the AI's conversation history up to date.
    
    Args:
        receiver_username: The username of the message receiver
        sender_username: The username of the message sender
        message_content: The content of the message
    
    Returns:
        True if successful, False otherwise
    """
    try:
        endpoint = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{receiver_username}/channels/{sender_username}/add-message"
        
        payload = {
            "message": message_content,
            "role": "user",
            "metadata": {
                "source": "serenissima_game",
                "tags": ["in_game_message"]
            }
        }
        
        log.info(f"Adding message to Kinos channel for {receiver_username}")
        response = requests.post(endpoint, json=payload)
        
        if response.status_code == 200:
            log.info(f"Successfully added message to Kinos channel")
            return True
        else:
            log.error(f"Failed to add message to Kinos channel: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        log.error(f"Error adding message to Kinos channel: {e}")
        return False
