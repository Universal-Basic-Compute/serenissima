import os
import sys
import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import user_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.user_utils import find_user_by_identifier

def initialize_airtable():
    """Initialize connection to Airtable."""
    load_dotenv()
    
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")
    
    if not airtable_api_key or not airtable_base_id:
        print("Error: Airtable credentials not found in environment variables")
        sys.exit(1)
    
    api = Api(airtable_api_key)
    
    tables = {
        "users": Table(airtable_api_key, airtable_base_id, "Users"),
        "messages": Table(airtable_api_key, airtable_base_id, "MESSAGES"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_users(tables) -> List[Dict]:
    """Get all users that are marked as AI."""
    try:
        # Query users with IsAI field set to true
        formula = "{IsAI}=1"
        ai_users = tables["users"].all(formula=formula)
        print(f"Found {len(ai_users)} AI users")
        return ai_users
    except Exception as e:
        print(f"Error getting AI users: {str(e)}")
        return []

def get_unread_messages_for_ai(tables, ai_username: str) -> List[Dict]:
    """Get all unread messages for an AI user."""
    try:
        # Query messages where the receiver is the AI user and ReadAt is null
        formula = f"AND({{Receiver}}='{ai_username}', {{ReadAt}}=BLANK())"
        messages = tables["messages"].all(formula=formula)
        print(f"Found {len(messages)} unread messages for AI user {ai_username}")
        return messages
    except Exception as e:
        print(f"Error getting unread messages for AI user {ai_username}: {str(e)}")
        return []

def mark_message_as_read(tables, message_id: str) -> bool:
    """Mark a message as read."""
    try:
        now = datetime.now().isoformat()
        tables["messages"].update(message_id, {
            "ReadAt": now
        })
        print(f"Marked message {message_id} as read")
        return True
    except Exception as e:
        print(f"Error marking message {message_id} as read: {str(e)}")
        return False

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def generate_ai_response(ai_username: str, sender_username: str, message_content: str) -> Optional[str]:
    """Generate an AI response using the Kinos Engine API."""
    try:
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        
        # Construct the API URL
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{sender_username}/messages"
        
        # Set up headers with API key
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Prepare the request payload
        payload = {
            "message": message_content
        }
        
        # Make the API request
        response = requests.post(url, headers=headers, json=payload)
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            
            # Get the most recent message from the assistant
            messages_url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{sender_username}/messages"
            messages_response = requests.get(messages_url, headers=headers)
            
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                
                # Find the most recent assistant message
                assistant_messages = [
                    msg for msg in messages_data.get("messages", [])
                    if msg.get("role") == "assistant"
                ]
                
                if assistant_messages:
                    # Sort by timestamp (newest first)
                    assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    latest_message = assistant_messages[0]
                    
                    # Return the content of the latest assistant message
                    return latest_message.get("content")
            
            # Fallback: If we couldn't get the messages, return a generic response
            return "Thank you for your message. I'll consider it carefully and respond appropriately."
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error generating AI response: {str(e)}")
        return None

def create_response_message(tables, ai_username: str, sender_username: str, response_content: str) -> bool:
    """Create a response message from the AI to the sender."""
    try:
        now = datetime.now().isoformat()
        
        # Create the message record
        message = {
            "Sender": ai_username,
            "Receiver": sender_username,
            "Content": response_content,
            "CreatedAt": now
            # Remove "UpdatedAt" field as it doesn't exist in the MESSAGES table
        }
        
        tables["messages"].create(message)
        print(f"Created response message from {ai_username} to {sender_username}")
        return True
    except Exception as e:
        print(f"Error creating response message: {str(e)}")
        return False

def create_admin_notification(tables, ai_response_counts: Dict[str, int]) -> None:
    """Create a notification for admins with the AI response summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Message Response Summary:\n\n"
        
        for ai_name, response_count in ai_response_counts.items():
            message += f"- {ai_name}: {response_count} responses\n"
        
        # Create the notification
        notification = {
            "User": "admin",
            "Type": "ai_messaging",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_response_counts": ai_response_counts,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI response summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_messages(dry_run: bool = False):
    """Main function to process AI messages."""
    print(f"Starting AI message response process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Track response counts for each AI
    ai_response_counts = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
        ai_response_counts[ai_username] = 0
        
        # Get unread messages for this AI
        unread_messages = get_unread_messages_for_ai(tables, ai_username)
        
        # Process each unread message
        for message in unread_messages:
            message_id = message["id"]
            sender = message["fields"].get("Sender")
            content = message["fields"].get("Content", "")
            
            print(f"Processing message from {sender} to {ai_username}: {content[:50]}...")
            
            # Generate AI response
            if not dry_run:
                # Mark the message as read
                mark_message_as_read(tables, message_id)
                
                # Generate and send response
                response_content = generate_ai_response(ai_username, sender, content)
                
                if response_content:
                    # Create response message
                    success = create_response_message(tables, ai_username, sender, response_content)
                    if success:
                        ai_response_counts[ai_username] += 1
            else:
                # In dry run mode, just log what would happen
                print(f"[DRY RUN] Would mark message {message_id} as read")
                print(f"[DRY RUN] Would generate response from {ai_username} to {sender}")
                ai_response_counts[ai_username] += 1
    
    # Create admin notification with summary
    if not dry_run and sum(ai_response_counts.values()) > 0:
        create_admin_notification(tables, ai_response_counts)
    else:
        print(f"[DRY RUN] Would create admin notification with response counts: {ai_response_counts}")
    
    print("AI message response process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_messages(dry_run)
