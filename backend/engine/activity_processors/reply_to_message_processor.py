import logging
import json
import requests
import os
import html
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List, Tuple
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

# Kinos API configuration
KINOS_API_URL = os.getenv("KINOS_API_URL", "https://api.kinos-engine.ai")
KINOS_BLUEPRINT = os.getenv("KINOS_BLUEPRINT", "serenissima-ai")
KINOS_MODEL = os.getenv("KINOS_MODEL", "gemini/gemini-2.5-pro-preview-03-25")
DEFAULT_CONVERSATION_LENGTH = int(os.getenv("DEFAULT_CONVERSATION_LENGTH", "3"))

def process_reply_to_message_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any,
    kinos_model_override: Optional[str] = None # New parameter
) -> bool:
    """
    Process the reply_to_message activity.
    
    This processor handles the reply to a previously received message.
    The citizen is already at the location where they received the original message.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    notes_str = fields.get('Notes') # Changed Details to Notes
    
    try:
        details = json.loads(notes_str) if notes_str else {} # Changed details_str to notes_str
    except Exception as e:
        log.error(f"Error parsing Notes for reply_to_message: {e}") # Changed Details to Notes
        return False
    
    original_message_id = details.get('originalMessageId')
    receiver_username = details.get('receiverUsername')  # The original sender
    message_type = details.get('messageType', 'personal')
    conversation_length = details.get('conversationLength', DEFAULT_CONVERSATION_LENGTH)
    
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
    
    # Generate a conversation with multiple exchanges using Kinos API
    final_reply_content = ""
    conversation_history = []
    
    if conversation_length > 1:
        log.info(f"Starting a conversation with {conversation_length} exchanges between {citizen} and {receiver_username}")
        # Pass kinos_model_override to conduct_conversation
        conversation_history = conduct_conversation(
            citizen, 
            receiver_username, 
            original_content, 
            conversation_length,
            kinos_model_override=kinos_model_override 
        )
        
        if conversation_history:
            # The last message in the conversation is the final reply
            final_reply_content = conversation_history[-1][1]  # (role, content) tuple
            
            # Add all intermediate messages to the channel history
            for i, (role, content) in enumerate(conversation_history[:-1]):
                # Skip the first message which is the original prompt
                if i == 0 and role == "user":
                    continue
                
                # Add intermediate messages to channel history
                if role == "assistant":
                    add_message_to_kinos_channel(
                        receiver_username, 
                        citizen, 
                        content, 
                        role="assistant", 
                        metadata={"intermediate": True}
                    )
                elif role == "user":
                    add_message_to_kinos_channel(
                        citizen,
                        receiver_username,
                        content,
                        role="user",
                        metadata={"intermediate": True}
                    )
    
    # If no conversation was conducted or it failed, generate a simple reply
    if not final_reply_content:
        final_reply_content = generate_reply_with_kinos(citizen, receiver_username, original_content)
    
    # If all API calls failed, use a fallback reply
    if not final_reply_content:
        final_reply_content = f"Thank you for your message. I am responding to: \"{original_content[:50]}...\""
    
    # Pass kinos_model_override to Kinos API calls if it's used directly here,
    # or ensure conduct_conversation and generate_reply_with_kinos accept and use it.
    # For now, assuming generate_reply_with_kinos and conduct_conversation will be updated
    # or that the global KINOS_MODEL is sufficient if no override.
    # If generate_reply_with_kinos is the main Kinos call point from this processor:
    if not conversation_history: # Only call if no conversation was made
        final_reply_content = generate_reply_with_kinos(
            citizen, 
            receiver_username, 
            original_content, 
            kinos_model_override=kinos_model_override # Pass it here
        )
        if not final_reply_content: # Fallback if even single reply fails
            final_reply_content = f"Thank you for your message. I am responding to: \"{original_content[:50]}...\""
    
    try:
        # 1. Create the reply message record
        reply_message_id = f"msg_{citizen}_{receiver_username}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        message_fields = {
            "MessageId": reply_message_id,
            "Sender": citizen,
            "Receiver": receiver_username,
            "Content": final_reply_content,
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
                "preview": final_reply_content[:50] + ("..." if len(final_reply_content) > 50 else ""),
                "conversationLength": conversation_length,
                "hadConversation": len(conversation_history) > 0
            }),
            "Asset": reply_message_id,
            "AssetType": "message",
            "Status": "unread",
            "CreatedAt": datetime.utcnow().isoformat()
        }
        
        tables["notifications"].create(notification_fields)
        
        # 4. Add the final message to the Kinos channel for the receiver
        add_message_to_kinos_channel(receiver_username, citizen, final_reply_content)
        
        log.info(f"Successfully delivered reply from {citizen} to {receiver_username}")
        log.info(f"Created reply message record with ID: {reply_message_id}")
        
        return True
    except Exception as e:
        log.error(f"Failed to process message reply: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False

def conduct_conversation(
    replier_username: str, 
    sender_username: str, 
    original_message: str, 
    max_exchanges: int,
    kinos_model_override: Optional[str] = None # Added model override
) -> List[Tuple[str, str]]:
    """
    Conduct a multi-turn conversation between the replier and sender.
    
    Args:
        replier_username: The username of the citizen replying to the message
        sender_username: The username of the original sender
        original_message: The content of the original message
        max_exchanges: Maximum number of message exchanges to simulate
    
    Returns:
        List of (role, content) tuples representing the conversation history
    """
    conversation_history = [("user", original_message)]
    
    try:
        # First response from the replier, passing model override
        first_reply = generate_reply_with_kinos(
            replier_username, 
            sender_username, 
            original_message,
            kinos_model_override=kinos_model_override
        )
        if not first_reply:
            log.error(f"Failed to generate first reply in conversation")
            return []
        
        conversation_history.append(("assistant", first_reply))
        
        # Continue the conversation for the specified number of exchanges
        for i in range(1, max_exchanges - 1):
            # Alternate between sender and replier
            if i % 2 == 1:  # Sender's turn
                # Generate a follow-up message from the sender, passing model override
                sender_message = generate_follow_up_message(
                    sender_username, 
                    replier_username, 
                    conversation_history,
                    kinos_model_override=kinos_model_override
                )
                if not sender_message:
                    log.error(f"Failed to generate sender message in conversation round {i}")
                    break
                
                conversation_history.append(("user", sender_message))
            else:  # Replier's turn
                # Generate a response from the replier, passing model override
                replier_message = generate_follow_up_message(
                    replier_username, 
                    sender_username, 
                    conversation_history,
                    kinos_model_override=kinos_model_override
                )
                if not replier_message:
                    log.error(f"Failed to generate replier message in conversation round {i}")
                    break
                
                conversation_history.append(("assistant", replier_message))
        
        # Ensure the conversation ends with the replier's message, passing model override
        if len(conversation_history) % 2 == 1:  # If last message was from sender
            final_reply = generate_follow_up_message(
                replier_username, 
                sender_username, 
                conversation_history,
                kinos_model_override=kinos_model_override
            )
            if final_reply:
                conversation_history.append(("assistant", final_reply))
        
        return conversation_history
    except Exception as e:
        log.error(f"Error conducting conversation: {e}")
        return conversation_history  # Return whatever we have so far

def generate_follow_up_message(
    speaker_username: str, 
    listener_username: str, 
    conversation_history: List[Tuple[str, str]],
    kinos_model_override: Optional[str] = None # Added model override
) -> Optional[str]:
    """
    Generate a follow-up message in a conversation based on the history.
    
    Args:
        speaker_username: The username of the citizen speaking next
        listener_username: The username of the citizen listening
        conversation_history: List of (role, content) tuples representing the conversation so far
    
    Returns:
        The generated message content or None if the API call fails
    """
    try:
        endpoint = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{speaker_username}/channels/{listener_username}/messages"
        
        # Format the conversation history for the API
        formatted_history = []
        for role, content in conversation_history:
            formatted_history.append({"role": role, "content": content})
        
        # Determine if this is the sender or replier speaking
        is_replier = conversation_history[0][1] != speaker_username  # First message is from sender
        
        system_prompt = f"You are {speaker_username}, a citizen of La Serenissima, in a conversation with {listener_username}. "
        if is_replier:
            system_prompt += "Continue the conversation naturally, responding to what was just said."
        else:
            system_prompt += "Continue the conversation naturally, asking follow-up questions or responding to what was just said."
        
        model_to_use_follow_up = kinos_model_override if kinos_model_override else KINOS_MODEL
        payload = {
            "content": "Please continue this conversation with a natural response.",
            "model": model_to_use_follow_up,
            "history_length": 25,
            "mode": "creative",
            "addSystem": system_prompt,
            "conversation": formatted_history
        }
        
        log.info(f"Generating follow-up message from {speaker_username} to {listener_username}")
        response = requests.post(endpoint, json=payload)
        
        if response.status_code == 200:
            response_data = response.json()
            message_content = response_data.get("content", "")
            
            # Unescape HTML entities if present
            message_content = html.unescape(message_content)
            
            log.info(f"Successfully generated follow-up message")
            return message_content
        else:
            log.error(f"Failed to generate follow-up message: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log.error(f"Error generating follow-up message: {e}")
        return None

def generate_reply_with_kinos(
    replier_username: str, 
    sender_username: str, 
    original_message: str,
    kinos_model_override: Optional[str] = None # Added model override
) -> Optional[str]:
    """
    Generate a reply using the Kinos API.
    
    Args:
        replier_username: The username of the citizen replying to the message
        sender_username: The username of the original sender
        original_message: The content of the original message
        kinos_model_override: Optional Kinos model string to override the default.
    
    Returns:
        The generated reply content or None if the API call fails
    """
    try:
        endpoint = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{replier_username}/channels/{sender_username}/messages"
        
        model_to_use_reply = kinos_model_override if kinos_model_override else KINOS_MODEL
        
        payload = {
            "content": original_message,
            "model": model_to_use_reply,
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
            reply_content = html.unescape(reply_content)
            
            log.info(f"Successfully generated reply with Kinos API")
            return reply_content
        else:
            log.error(f"Failed to generate reply with Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log.error(f"Error calling Kinos API: {e}")
        return None

def add_message_to_kinos_channel(
    receiver_username: str, 
    sender_username: str, 
    message_content: str,
    role: str = "user",
    metadata: Dict[str, Any] = None
) -> bool:
    """
    Add the message to the Kinos channel to keep the AI's conversation history up to date.
    
    Args:
        receiver_username: The username of the message receiver
        sender_username: The username of the message sender
        message_content: The content of the message
        role: The role of the message sender (user or assistant)
        metadata: Additional metadata for the message
    
    Returns:
        True if successful, False otherwise
    """
    try:
        endpoint = f"{KINOS_API_URL}/v2/blueprints/{KINOS_BLUEPRINT}/kins/{receiver_username}/channels/{sender_username}/add-message"
        
        default_metadata = {
            "source": "serenissima_game",
            "tags": ["in_game_message"]
        }
        
        if metadata:
            default_metadata.update(metadata)
        
        payload = {
            "message": message_content,
            "role": role,
            "metadata": default_metadata
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
