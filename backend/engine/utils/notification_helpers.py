import logging
import json
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from pyairtable import Table

# Import utility for escaping values if needed, though not directly used here for simple fields
# from .activity_helpers import _escape_airtable_value 

log = logging.getLogger(__name__)

def create_notification(
    tables: Dict[str, Table],
    citizen_username: str,
    notification_type: str,
    content: str,
    details: Optional[Dict[str, Any]] = None,
    asset_id: Optional[str] = None,
    asset_type: Optional[str] = None,
    notes: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Creates a new notification record in the NOTIFICATIONS Airtable table.

    Args:
        tables: Dictionary of Airtable Table objects.
        citizen_username: The username of the citizen to receive the notification.
        notification_type: The type of notification (e.g., 'rent_change', 'contract_accepted').
        content: The main content/message of the notification.
        details: Optional dictionary of structured data for the notification. Will be JSON stringified.
        asset_id: Optional ID of an asset related to the notification (e.g., BuildingId, ContractId).
        asset_type: Optional type of the related asset (e.g., 'building', 'contract').
        notes: Optional additional notes for the notification.

    Returns:
        The created Airtable record for the notification, or None if creation failed.
    """
    if 'notifications' not in tables:
        log.error("Notifications table not found in provided tables dictionary.")
        return None

    notifications_table = tables['notifications']
    
    notification_data = {
        "Citizen": citizen_username,
        "Type": notification_type,
        "Content": content,
        "Status": "unread", # Default status for new notifications
        "CreatedAt": datetime.now(timezone.utc).isoformat(),
        # UpdatedAt is usually handled automatically by Airtable
    }

    if details is not None:
        try:
            notification_data["Details"] = json.dumps(details)
        except TypeError as e:
            log.error(f"Failed to serialize 'details' to JSON for notification: {e}. Details: {details}")
            # Optionally, store as string or skip
            notification_data["Details"] = str(details) 

    if asset_id:
        notification_data["Asset"] = asset_id
    if asset_type:
        notification_data["AssetType"] = asset_type
    if notes:
        notification_data["Notes"] = notes

    try:
        log.info(f"Creating notification for {citizen_username} of type {notification_type} with content: {content[:50]}...")
        created_record = notifications_table.create(notification_data)
        log.info(f"Successfully created notification (ID: {created_record['id']}) for {citizen_username}.")
        return created_record
    except Exception as e:
        log.error(f"Failed to create notification for {citizen_username}: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None

# Example usage (for testing purposes, not part of the module's direct functionality):
# if __name__ == '__main__':
#     # This block would require Airtable API key and Base ID to be configured
#     # and a way to initialize the 'tables' dictionary.
#     # For now, it's commented out as it's not directly executable without setup.
#     # from pyairtable import Api
#     # import os
#     # load_dotenv() # Assuming .env file is in project root
#     # AIRTABLE_API_KEY_TEST = os.getenv("AIRTABLE_API_KEY")
#     # AIRTABLE_BASE_ID_TEST = os.getenv("AIRTABLE_BASE_ID")
#     # if AIRTABLE_API_KEY_TEST and AIRTABLE_BASE_ID_TEST:
#     #     test_api = Api(AIRTABLE_API_KEY_TEST)
#     #     test_tables = {'notifications': test_api.table(AIRTABLE_BASE_ID_TEST, 'NOTIFICATIONS')}
#     #     create_notification(
#     #         test_tables,
#     #         "TestCitizen",
#     #         "test_notification",
#     #         "This is a test notification from notification_helpers.py.",
#     #         details={"key": "value", "number": 123},
#     #         asset_id="test_asset_123",
#     #         asset_type="test_asset_type"
#     #     )
#     pass
