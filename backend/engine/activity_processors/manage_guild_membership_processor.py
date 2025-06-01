import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    get_building_record,
    get_citizen_record
)

log = logging.getLogger(__name__)

def process_manage_guild_membership_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the manage_guild_membership chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the guild hall or town hall (no action needed)
    2. perform_guild_membership_action - Process the guild membership action
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
    if activity_type == "goto_location" and details.get("activityType") == "manage_guild_membership":
        # No need to create the perform_guild_membership_action activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the location to perform guild membership action: {details.get('membershipAction')} for guild {details.get('guildName')}.")
        log.info(f"The perform_guild_membership_action activity should already be scheduled to start after this activity.")
        return True
    
    # Handle perform_guild_membership_action activity (second step in chain)
    elif activity_type == "perform_guild_membership_action":
        return _process_guild_membership_action(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in manage_guild_membership processor: {activity_type}")
        return False

def _process_guild_membership_action(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Process the guild membership action when the perform_guild_membership_action activity is executed."""
    fields = activity_record.get('fields', {})
    citizen_username = fields.get('Citizen')
    guild_id = details.get('guildId')
    guild_name = details.get('guildName', 'Unknown Guild')
    membership_action = details.get('membershipAction')
    entry_fee = details.get('entryFee', 0)
    
    if not (citizen_username and guild_id and membership_action):
        log.error(f"Missing data for guild membership action: citizen={citizen_username}, guild={guild_id}, action={membership_action}")
        return False
    
    # Get citizen record
    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"Citizen {citizen_username} not found")
        return False
    
    # Get guild record
    formula = f"{{GuildId}}='{_escape_airtable_value(guild_id)}'"
    guild_records = tables['guilds'].all(formula=formula, max_records=1)
    if not guild_records:
        log.error(f"Guild {guild_id} not found")
        return False
    
    guild_record = guild_records[0]
    guild_airtable_id = guild_record['id']
    
    # Check if citizen is already a member of this guild
    current_guild_id = citizen_record['fields'].get('GuildId')
    is_member = current_guild_id == guild_id
    
    # Process based on membership action
    if membership_action == "join":
        if is_member:
            log.info(f"Citizen {citizen_username} is already a member of guild {guild_name}")
            return True
        
        # Check if citizen has enough ducats for entry fee
        citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
        if citizen_ducats < entry_fee:
            log.error(f"Citizen {citizen_username} does not have enough ducats ({citizen_ducats}) to pay entry fee ({entry_fee}) for guild {guild_name}")
            
            # Create a notification for the citizen
            notification_fields = {
                "Citizen": citizen_username,
                "Type": "guild_membership_failed",
                "Content": f"You do not have enough ducats to join the {guild_name}. The entry fee is {entry_fee} ducats.",
                "Details": json.dumps({
                    "guildId": guild_id,
                    "guildName": guild_name,
                    "entryFee": entry_fee,
                    "currentDucats": citizen_ducats,
                    "reason": "insufficient_funds"
                }),
                "Asset": guild_id,
                "AssetType": "guild",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            
            tables["notifications"].create(notification_fields)
            return False
        
        try:
            # Update citizen record
            tables['citizens'].update(citizen_record['id'], {
                'GuildId': guild_id,
                'Ducats': citizen_ducats - entry_fee
            })
            
            # Update guild record if needed (e.g., increment member count if such field exists)
            # This is optional and depends on your guild schema
            
            # Create a transaction record for the entry fee
            transaction_fields = {
                "Type": "guild_entry_fee",
                "AssetType": "guild",
                "Asset": guild_id,
                "Seller": citizen_username,  # Citizen pays
                "Buyer": "ConsiglioDeiDieci",  # Guild/government receives
                "Price": entry_fee,
                "Notes": json.dumps({
                    "guildId": guild_id,
                    "guildName": guild_name,
                    "action": "join"
                }),
                "CreatedAt": datetime.utcnow().isoformat(),
                "ExecutedAt": datetime.utcnow().isoformat()
            }
            
            tables["transactions"].create(transaction_fields)
            
            # Create a notification for the citizen
            notification_fields = {
                "Citizen": citizen_username,
                "Type": "guild_membership_updated",
                "Content": f"You have successfully joined the {guild_name}. Welcome to the guild!",
                "Details": json.dumps({
                    "guildId": guild_id,
                    "guildName": guild_name,
                    "action": "join",
                    "entryFee": entry_fee
                }),
                "Asset": guild_id,
                "AssetType": "guild",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            
            tables["notifications"].create(notification_fields)
            
            log.info(f"Citizen {citizen_username} has successfully joined guild {guild_name}")
            return True
            
        except Exception as e:
            log.error(f"Failed to process join guild action: {e}")
            return False
            
    elif membership_action == "leave":
        if not is_member:
            log.info(f"Citizen {citizen_username} is not a member of guild {guild_name}")
            return True
        
        try:
            # Update citizen record
            tables['citizens'].update(citizen_record['id'], {
                'GuildId': None
            })
            
            # Update guild record if needed (e.g., decrement member count if such field exists)
            # This is optional and depends on your guild schema
            
            # Create a notification for the citizen
            notification_fields = {
                "Citizen": citizen_username,
                "Type": "guild_membership_updated",
                "Content": f"You have left the {guild_name}. Your membership has been terminated.",
                "Details": json.dumps({
                    "guildId": guild_id,
                    "guildName": guild_name,
                    "action": "leave"
                }),
                "Asset": guild_id,
                "AssetType": "guild",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            
            tables["notifications"].create(notification_fields)
            
            log.info(f"Citizen {citizen_username} has successfully left guild {guild_name}")
            return True
            
        except Exception as e:
            log.error(f"Failed to process leave guild action: {e}")
            return False
            
    elif membership_action == "accept_invite":
        # Check if there's a pending invitation
        formula = f"AND({{Type}}='guild_invitation', {{Citizen}}='{_escape_airtable_value(citizen_username)}', {{Asset}}='{_escape_airtable_value(guild_id)}', {{AssetType}}='guild', {{Status}}='unread')"
        invitation_records = tables['notifications'].all(formula=formula)
        
        if not invitation_records:
            log.error(f"No pending guild invitation found for citizen {citizen_username} to guild {guild_name}")
            
            # Create a notification for the citizen
            notification_fields = {
                "Citizen": citizen_username,
                "Type": "guild_membership_failed",
                "Content": f"You do not have a pending invitation to join the {guild_name}.",
                "Details": json.dumps({
                    "guildId": guild_id,
                    "guildName": guild_name,
                    "reason": "no_invitation"
                }),
                "Asset": guild_id,
                "AssetType": "guild",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            
            tables["notifications"].create(notification_fields)
            return False
        
        # Process the invitation acceptance similar to join, but without entry fee
        try:
            # Update citizen record
            tables['citizens'].update(citizen_record['id'], {
                'GuildId': guild_id
            })
            
            # Mark the invitation as read
            for invitation in invitation_records:
                tables['notifications'].update(invitation['id'], {
                    'Status': 'read',
                    'ReadAt': datetime.utcnow().isoformat()
                })
            
            # Create a notification for the citizen
            notification_fields = {
                "Citizen": citizen_username,
                "Type": "guild_membership_updated",
                "Content": f"You have accepted the invitation to join the {guild_name}. Welcome to the guild!",
                "Details": json.dumps({
                    "guildId": guild_id,
                    "guildName": guild_name,
                    "action": "accept_invite"
                }),
                "Asset": guild_id,
                "AssetType": "guild",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            
            tables["notifications"].create(notification_fields)
            
            log.info(f"Citizen {citizen_username} has successfully accepted invitation to guild {guild_name}")
            return True
            
        except Exception as e:
            log.error(f"Failed to process accept guild invitation action: {e}")
            return False
    
    else:
        log.error(f"Unknown membership action: {membership_action}")
        return False
