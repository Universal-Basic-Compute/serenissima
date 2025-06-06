import os
import sys
import json
import argparse
from datetime import datetime
from typing import Dict, List, Optional
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.citizen_utils import find_citizen_by_identifier # Correction du chemin d'importation
from backend.engine.utils.activity_helpers import log_header, LogColors

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
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice, and have appropriate social class."""
    try:
        # Query citizens with IsAI=true, InVenice=true, and SocialClass is either Nobili or Cittadini
        formula = "AND({IsAI}=1, {InVenice}=1, OR({SocialClass}='Nobili', {SocialClass}='Cittadini'))"
        ai_citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(ai_citizens)} AI citizens in Venice with Nobili or Cittadini social class")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
        return []

def get_unread_notifications_for_ai(tables, ai_username: str) -> List[Dict]:
    """Get all unread notifications for an AI citizen."""
    try:
        # Query notifications where the citizen is the AI citizen and ReadAt is null
        formula = f"AND({{Citizen}}='{ai_username}', {{ReadAt}}=BLANK())"
        notifications = tables["notifications"].all(formula=formula)
        print(f"Found {len(notifications)} unread notifications for AI citizen {ai_username}")
        return notifications
    except Exception as e:
        print(f"Error getting unread notifications for AI citizen {ai_username}: {str(e)}")
        return []

def mark_notifications_as_read(tables, notification_ids: List[str]) -> bool:
    """Mark multiple notifications as read."""
    try:
        now = datetime.now().isoformat()
        for notification_id in notification_ids:
            tables["notifications"].update(notification_id, {
                "ReadAt": now
            })
        print(f"Marked {len(notification_ids)} notifications as read")
        return True
    except Exception as e:
        print(f"Error marking notifications as read: {str(e)}")
        return False

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def _get_kinos_model_for_citizen(social_class: Optional[str]) -> str:
    """Determines the Kinos model based on social class."""
    if not social_class:
        return "local" # Default model if social class is unknown
    
    s_class_lower = social_class.lower()
    if s_class_lower == "nobili":
        return "gemini-2.5-pro-preview-05-06"
    elif s_class_lower in ["cittadini", "forestieri"]:
        return "gemini-2.5-flash-preview-05-20"
    elif s_class_lower in ["popolani", "facchini"]:
        return "local"
    else: # Default for any other unlisted social class
        return "local"

def send_notifications_to_ai(ai_citizen_record: Dict, notifications: List[Dict], kinos_model_override: Optional[str] = None) -> bool:
    """Send notifications to an AI citizen using the Kinos Engine API."""
    try:
        ai_username = ai_citizen_record["fields"].get("Username")
        if not ai_username:
            print("Error: AI citizen record missing Username in send_notifications_to_ai.")
            return False

        if not notifications:
            print(f"No notifications to send to AI citizen {ai_username}")
            return True
        
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        
        # Construct the API URL for the build endpoint
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/build"
        
        # Set up headers with API key
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Format notifications into a readable message
        notification_message = f"📜 **Latest Notifications from La Serenissima** 📜\n\n"
        
        for i, notification in enumerate(notifications, 1):
            notification_type = notification["fields"].get("Type", "general")
            content = notification["fields"].get("Content", "No content")
            created_at = notification["fields"].get("CreatedAt", "")
            
            # Format the date for better readability
            try:
                date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                formatted_date = date_obj.strftime("%B %d, %Y at %H:%M")
            except:
                formatted_date = created_at
            
            notification_message += f"**{i}. [{notification_type.upper()}]** - _{formatted_date}_\n{content}\n\n"
        
        # Add instructions for the AI to process these notifications
        notification_message += "ℹ️ Please process these notifications and update your understanding of recent events in La Serenissima."
        
        # Prepare the request payload
        payload = {
            "message": notification_message,
            "addSystem": "These notifications represent recent events in La Serenissima that affect you. Use this information to update your knowledge about your properties, finances, and the city's current state.",
            "min_files": 5,
            "max_files": 15
        }

        actual_model_to_use = kinos_model_override
        if not actual_model_to_use:
            ai_social_class = ai_citizen_record["fields"].get("SocialClass")
            actual_model_to_use = _get_kinos_model_for_citizen(ai_social_class)
        
        if actual_model_to_use:
            payload["model"] = actual_model_to_use
            print(f"Using Kinos model '{actual_model_to_use}' for {ai_username} (notification processing).")
        else:
            # This case should ideally not be reached if _get_kinos_model_for_citizen has a fallback
            print(f"Warning: No Kinos model override and could not determine model from social class for {ai_username}. Using Kinos default for /build endpoint.")
        
        # Make the API request
        response = requests.post(url, headers=headers, json=payload)
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            
            if status == "completed":
                print(f"Successfully sent {len(notifications)} notifications to AI citizen {ai_username}")
                return True
            else:
                print(f"Error processing notifications for AI citizen {ai_username}: {response_data}")
                return False
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error sending notifications to AI citizen {ai_username}: {str(e)}")
        return False

def create_admin_notification(tables, ai_notification_counts: Dict[str, int]) -> None:
    """Create a notification for admins with the AI notification processing summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "📊 **AI Notification Processing Summary** 📊\n\n"
        
        for ai_name, notification_count in ai_notification_counts.items():
            message += f"- 👤 **{ai_name}**: {notification_count} notifications processed\n"
        
        # Create the notification
        notification = {
            "Citizen": "admin",
            "Type": "ai_notifications",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_notification_counts": ai_notification_counts,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI notification processing summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_notifications(dry_run: bool = False, kinos_model_override_arg: Optional[str] = None):
    """Main function to process AI notifications."""
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "class-based"
    log_header(f"AI Notification Processing (dry_run={dry_run}, kinos_model_selection={model_status})", LogColors.HEADER)
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those with unread notifications
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get unread notifications for this AI
        unread_notifications = get_unread_notifications_for_ai(tables, ai_username)
        
        if unread_notifications:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} has {len(unread_notifications)} unread notifications, including in processing")
        else:
            print(f"AI citizen {ai_username} has no unread notifications, skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with unread notifications")
    
    if not ai_citizens:
        print("No AI citizens with unread notifications, exiting")
        return
    
    # Track notification counts for each AI
    ai_notification_counts = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing notifications for AI citizen: {ai_username}")
        
        # Get unread notifications for this AI
        unread_notifications = get_unread_notifications_for_ai(tables, ai_username)
        
        if not unread_notifications:
            print(f"No unread notifications for AI citizen {ai_username}")
            ai_notification_counts[ai_username] = 0
            continue
        
        ai_notification_counts[ai_username] = len(unread_notifications)
        
        # Process notifications
        if not dry_run:
            # Send notifications to AI, passing the full citizen record and model override
            success = send_notifications_to_ai(ai_citizen, unread_notifications, kinos_model_override_arg)
            
            if success:
                # Mark notifications as read
                notification_ids = [notification["id"] for notification in unread_notifications]
                mark_notifications_as_read(tables, notification_ids)
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send {len(unread_notifications)} notifications to AI citizen {ai_username}")
            print(f"[DRY RUN] Would mark {len(unread_notifications)} notifications as read")
    
    # Create admin notification with summary
    if not dry_run and sum(ai_notification_counts.values()) > 0:
        create_admin_notification(tables, ai_notification_counts)
    else:
        print(f"[DRY RUN] Would create admin notification with notification counts: {ai_notification_counts}")
    
    print("AI notification processing completed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process unread notifications for AI citizens using Kinos AI.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the script without making actual changes to Airtable or Kinos."
    )
    parser.add_argument(
        "--model",
        type=str,
        help="Specify a Kinos model override (e.g., 'local', 'gemini-2.5-pro-preview-05-06')."
    )
    args = parser.parse_args()
    
    # Run the process
    process_ai_notifications(dry_run=args.dry_run, kinos_model_override_arg=args.model)
