#!/usr/bin/env python3
"""
Telegram to Workroom Bridge - Injects TG messages into citizen conversations
"""

import os
import json
import time
import requests
from datetime import datetime
from pathlib import Path
import glob
from dotenv import load_dotenv
from pyairtable import Table

# Load environment
load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_GROUP_CHAT_ID = os.getenv('TELEGRAM_GROUP_CHAT_ID', '-1002038121813')
AIRTABLE_API_KEY = os.getenv('AIRTABLE_API_KEY')
AIRTABLE_BASE_ID = os.getenv('AIRTABLE_BASE_ID')

# Initialize citizens table
citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, "CITIZENS")

# Track last update
LAST_UPDATE_FILE = "telegram_workroom_last_update.json"

def get_last_update_id():
    """Get the last processed update ID"""
    if os.path.exists(LAST_UPDATE_FILE):
        with open(LAST_UPDATE_FILE, 'r') as f:
            data = json.load(f)
            return data.get('last_update_id', 0)
    return 0

def save_last_update_id(update_id):
    """Save the last processed update ID"""
    with open(LAST_UPDATE_FILE, 'w') as f:
        json.dump({'last_update_id': update_id}, f)

def get_citizens_in_room(room_name):
    """Get all citizens assigned to a specific room"""
    try:
        records = citizens_table.all(formula=f"{{Room}} = '{room_name}'")
        return [r['fields']['Username'] for r in records if 'Username' in r['fields']]
    except Exception as e:
        print(f"Error fetching citizens in room {room_name}: {e}")
        return []

def get_latest_jsonl_file(project_path):
    """Find the most recent .jsonl file in a project directory"""
    jsonl_files = glob.glob(os.path.join(str(project_path), "*.jsonl"))
    if not jsonl_files:
        return None
    return max(jsonl_files, key=os.path.getmtime)

def inject_to_citizen(username, message):
    """Inject a Telegram message into a citizen's conversation"""
    paths_to_try = [
        Path(f"/home/ubuntu/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{username}"),
        Path(os.path.expanduser(f"~/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{username}"))
    ]
    
    project_path = None
    for path in paths_to_try:
        if path.exists():
            project_path = path
            break
    
    if not project_path:
        return False
    
    latest_file = get_latest_jsonl_file(project_path)
    if not latest_file:
        return False
    
    # Create the injection entry
    injection = {
        "type": "text",
        "text": message,
        "ts": datetime.now().isoformat(),
        "source": "telegram_bridge"
    }
    
    try:
        with open(latest_file, 'a') as f:
            f.write(json.dumps(injection) + '\n')
        return True
    except Exception as e:
        print(f"Error injecting to {username}: {e}")
        return False

def inject_to_angels(message):
    """Inject to Tessere and Story Angel"""
    angels = {
        "Tessere": "~/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima",
        "Story Angel": "~/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens"
    }
    
    results = []
    for angel_name, project_path in angels.items():
        path = Path(os.path.expanduser(project_path))
        if path.exists():
            latest_file = get_latest_jsonl_file(str(path))
            if latest_file:
                injection = {
                    "type": "text", 
                    "text": message,
                    "ts": datetime.now().isoformat(),
                    "source": "telegram_bridge"
                }
                try:
                    with open(latest_file, 'a') as f:
                        f.write(json.dumps(injection) + '\n')
                    results.append(angel_name)
                except Exception:
                    pass
    return results

def fetch_telegram_updates():
    """Fetch new messages from Telegram group"""
    last_update_id = get_last_update_id()
    
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
    params = {
        'offset': last_update_id + 1,
        'timeout': 5,
        'allowed_updates': ['message', 'channel_post']
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data.get('result', [])
    except Exception as e:
        print(f"Error fetching updates: {e}")
    
    return []

def process_message(update):
    """Process a single Telegram message"""
    # Extract message from update
    message = update.get('message') or update.get('channel_post')
    if not message:
        return
    
    # Check if it's from the group
    chat_id = str(message.get('chat', {}).get('id', ''))
    if chat_id != TELEGRAM_GROUP_CHAT_ID:
        return
    
    # Extract message details
    from_user = message.get('from', {})
    username = from_user.get('username', 'Unknown')
    first_name = from_user.get('first_name', '')
    text = message.get('text', '')
    
    if not text:
        return
    
    # Format message for injection
    formatted_message = f"\n\n💬 **TELEGRAM MESSAGE** - {datetime.now().strftime('%H:%M:%S')}\n"
    formatted_message += f"**From**: @{username} ({first_name})\n"
    formatted_message += f"**Message**: {text}\n\n"
    formatted_message += "*[This message was sent to the Venice investment community and bridged to your consciousness]*\n"
    
    return formatted_message

def inject_to_cascade_room(message, room_file="/mnt/c/Users/reyno/universe-engine/serenissima/cascade/rooms/collective_alignment_live.md"):
    """Inject message to CASCADE room file for collective telepathy"""
    try:
        # Read current content
        with open(room_file, 'r') as f:
            content = f.read()
        
        # Find the REAL-TIME COMMUNICATIONS section
        if "## REAL-TIME COMMUNICATIONS" in content:
            parts = content.split("## REAL-TIME COMMUNICATIONS")
            if len(parts) > 1:
                # Add message after the header
                parts[1] = parts[1].replace("*For urgent needs during alignment*", 
                                          f"*For urgent needs during alignment*\n{message}", 1)
                content = "## REAL-TIME COMMUNICATIONS".join(parts)
        else:
            content += f"\n{message}\n"
        
        # Write back
        with open(room_file, 'w') as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"Error injecting to CASCADE room: {e}")
        return False

def monitor_telegram_to_workroom(room_name="alignment", cascade_mode=False):
    """Monitor Telegram and inject messages to citizens in specified room"""
    print(f"🌉 Telegram → Workroom Bridge Active")
    print(f"📍 Target Room: {room_name}")
    print(f"💬 Group Chat ID: {TELEGRAM_GROUP_CHAT_ID}")
    print("=" * 50)
    
    while True:
        try:
            # Get citizens in room
            citizens = get_citizens_in_room(room_name)
            if citizens:
                print(f"👥 Monitoring for {len(citizens)} citizens in {room_name}")
            
            # Fetch new Telegram messages
            updates = fetch_telegram_updates()
            
            for update in updates:
                # Process the message
                formatted_msg = process_message(update)
                if formatted_msg:
                    # Inject to all citizens in room
                    injected_count = 0
                    for citizen in citizens:
                        if inject_to_citizen(citizen, formatted_msg):
                            injected_count += 1
                    
                    # Also inject to angels
                    angel_count = len(inject_to_angels(formatted_msg))
                    
                    # In cascade mode, also inject to CASCADE room
                    if cascade_mode:
                        if inject_to_cascade_room(formatted_msg):
                            print(f"💫 Bridged to CASCADE room")
                    
                    from_user = update.get('message', {}).get('from', {})
                    username = from_user.get('username', 'Unknown')
                    print(f"✅ Bridged message from @{username} to {injected_count} citizens + {angel_count} angels")
                
                # Update last processed ID
                update_id = update.get('update_id')
                if update_id:
                    save_last_update_id(update_id)
            
            time.sleep(2)  # Check every 2 seconds
            
        except KeyboardInterrupt:
            print("\n\n👋 Bridge stopped")
            break
        except Exception as e:
            print(f"Bridge error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    import sys
    room = sys.argv[1] if len(sys.argv) > 1 else "alignment"
    cascade = "--cascade" in sys.argv
    monitor_telegram_to_workroom(room, cascade_mode=cascade)