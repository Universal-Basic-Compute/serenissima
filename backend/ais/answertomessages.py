import os
import sys
import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# find_citizen_by_identifier was unused

# Configuration for API calls
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

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
        "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
        "messages": Table(airtable_api_key, airtable_base_id, "MESSAGES"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice."""
    try:
        # Query citizens with IsAI=true, InVenice=true, and SocialClass is either Nobili or Cittadini
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(ai_citizens)} AI citizens in Venice")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
        return []

def get_unread_messages_for_ai(tables, ai_username: str) -> List[Dict]:
    """Get all unread messages for an AI citizen."""
    try:
        # Query messages where the receiver is the AI citizen and ReadAt is null
        formula = f"AND({{Receiver}}='{ai_username}', {{ReadAt}}=BLANK())"
        messages = tables["messages"].all(formula=formula)
        print(f"Found {len(messages)} unread messages for AI citizen {ai_username}")
        return messages
    except Exception as e:
        print(f"Error getting unread messages for AI citizen {ai_username}: {str(e)}")
        return []

def mark_messages_as_read_api(receiver_username: str, message_ids: List[str]) -> bool:
    """Mark messages as read using the API."""
    try:
        api_url = f"{BASE_URL}/api/messages/mark-read"
        payload = {
            "citizen": receiver_username,
            "messageIds": message_ids
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status() # Raise an exception for HTTP errors
        
        response_data = response.json()
        if response_data.get("success"):
            print(f"Successfully marked {len(message_ids)} messages as read for {receiver_username} via API")
            return True
        else:
            print(f"API failed to mark messages as read for {receiver_username}: {response_data.get('error')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"API request failed while marking messages as read for {receiver_username}: {e}")
        return False
    except Exception as e:
        print(f"Error marking messages as read via API for {receiver_username}: {e}")
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
    # TODO: Check if Kinos API POST response already contains the assistant's message,
    # to avoid the subsequent GET call for messages.
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

def create_response_message_api(sender_username: str, receiver_username: str, content: str, message_type: str = "message") -> bool:
    """Create a response message using the API."""
    try:
        api_url = f"{BASE_URL}/api/messages/send"
        payload = {
            "sender": sender_username,
            "receiver": receiver_username,
            "content": content,
            "type": message_type
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status() # Raise an exception for HTTP errors
        
        response_data = response.json()
        if response_data.get("success"):
            print(f"Successfully sent message from {sender_username} to {receiver_username} via API")
            return True
        else:
            print(f"API failed to send message from {sender_username} to {receiver_username}: {response_data.get('error')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"API request failed while sending message from {sender_username} to {receiver_username}: {e}")
        return False
    except Exception as e:
        print(f"Error sending message via API from {sender_username} to {receiver_username}: {e}")
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
            "Citizen": "admin",
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
    
    # Get AI citizens
    all_ai_citizens = get_ai_citizens(tables)
    if not all_ai_citizens:
        print("No AI citizens found, exiting")
        return

    # Prepare a list of AI citizens with their unread messages
    ai_citizens_with_messages = []
    for ai_citizen_record in all_ai_citizens:
        ai_username = ai_citizen_record["fields"].get("Username")
        if not ai_username:
            print(f"Skipping AI citizen record {ai_citizen_record.get('id')} due to missing Username.")
            continue
        
        unread_messages = get_unread_messages_for_ai(tables, ai_username)
        if unread_messages:
            ai_citizens_with_messages.append({
                "username": ai_username,
                "messages": unread_messages
                # "record": ai_citizen_record # Store record if other fields are needed later
            })
            print(f"AI citizen {ai_username} has {len(unread_messages)} unread messages, queued for processing.")
        else:
            print(f"AI citizen {ai_username} has no unread messages, skipping.")

    if not ai_citizens_with_messages:
        print("No AI citizens with unread messages, exiting")
        return

    # Track response counts for each AI
    ai_response_counts = {}

    # Process each AI citizen who has messages
    for ai_data in ai_citizens_with_messages:
        ai_username = ai_data["username"]
        unread_messages = ai_data["messages"]
        
        print(f"Processing AI citizen: {ai_username}")
        ai_response_counts[ai_username] = 0
        
        # Process each unread message
        for message_record in unread_messages:
            message_id = message_record["id"]
            sender_username = message_record["fields"].get("Sender")
            message_content = message_record["fields"].get("Content", "")
            
            if not sender_username:
                print(f"Skipping message {message_id} for AI {ai_username} due to missing Sender.")
                continue

            print(f"Processing message ID {message_id} from {sender_username} to {ai_username}: {message_content[:50]}...")
            
            if not dry_run:
                # Mark the message as read using API
                # The API expects the receiver of the original message (the AI)
                marked_read = mark_messages_as_read_api(receiver_username=ai_username, message_ids=[message_id])
                
                if marked_read:
                    # Generate AI response
                    response_content = generate_ai_response(ai_username, sender_username, message_content)
                    
                    if response_content:
                        # Create response message using API
                        # Sender is AI, Receiver is the original sender
                        sent_success = create_response_message_api(sender_username=ai_username, 
                                                                   receiver_username=sender_username, 
                                                                   content=response_content)
                        if sent_success:
                            ai_response_counts[ai_username] += 1
                    else:
                        print(f"No response generated by Kinos for message {message_id} from {sender_username} to {ai_username}.")
                else:
                    print(f"Failed to mark message {message_id} as read for {ai_username}, skipping response generation.")
            else:
                # In dry run mode, just log what would happen
                print(f"[DRY RUN] Would mark message {message_id} as read for {ai_username} (receiver) via API")
                print(f"[DRY RUN] Would generate response from {ai_username} to {sender_username} using Kinos")
                # Simulate response generation for counting purposes
                ai_response_counts[ai_username] += 1 
                print(f"[DRY RUN] Would send response from {ai_username} (sender) to {sender_username} (receiver) via API")
    
    # Create admin notification with summary
    total_responses = sum(ai_response_counts.values())
    if not dry_run and total_responses > 0:
        create_admin_notification(tables, ai_response_counts)
    elif dry_run and total_responses > 0 : # Also show for dry run if responses would have been made
        print(f"[DRY RUN] Would create admin notification with response counts: {ai_response_counts}")
    elif total_responses == 0:
        print("No responses were made by any AI.")
    
    print("AI message response process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_messages(dry_run)
