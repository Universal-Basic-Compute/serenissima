#!/usr/bin/env python3
"""
Unified Telegram Service - Consolidates all Telegram polling into one service
Handles: Direct messages, group monitoring, citizen watching, and workroom bridges
"""

import os
import json
import time
import requests
import threading
from datetime import datetime
from pathlib import Path
import glob
from dotenv import load_dotenv
from pyairtable import Table
import logging

# Load environment
load_dotenv()

# Configuration
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_GROUP_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '-1001699255893')
TELEGRAM_DIRECT_CHAT_ID = os.getenv('TELEGRAM_DIRECT_CHAT_ID')
AIRTABLE_API_KEY = os.getenv('AIRTABLE_API_KEY')
AIRTABLE_BASE_ID = os.getenv('AIRTABLE_BASE_ID')

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

# Initialize Airtable
citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, "CITIZENS")

# State files
UNIFIED_UPDATE_FILE = "telegram_unified_last_update.json"

class UnifiedTelegramService:
    def __init__(self):
        self.last_update_id = self.load_last_update_id()
        self.running = True
        # Initialize Telegram bot for sending messages
        self.bot_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
        
    def load_last_update_id(self):
        """Load the last processed update ID"""
        if os.path.exists(UNIFIED_UPDATE_FILE):
            with open(UNIFIED_UPDATE_FILE, 'r') as f:
                data = json.load(f)
                return data.get('last_update_id', 0)
        return 0
    
    def save_last_update_id(self, update_id):
        """Save the last processed update ID"""
        with open(UNIFIED_UPDATE_FILE, 'w') as f:
            json.dump({'last_update_id': update_id}, f)
    
    def fetch_updates(self):
        """Fetch new updates from Telegram"""
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
        params = {
            'offset': self.last_update_id + 1,
            'timeout': 30,  # Long polling
            'allowed_updates': ['message', 'channel_post']
        }
        
        try:
            response = requests.get(url, params=params, timeout=35)
            if response.status_code == 200:
                data = response.json()
                results = data.get('result', [])
                if results:
                    log.info(f"Got {len(results)} updates from Telegram API")
                return results
            else:
                log.error(f"Telegram API error: {response.status_code} - {response.text}")
        except Exception as e:
            log.error(f"Error fetching updates: {e}")
        
        return []
    
    def send_to_telegram(self, message, chat_id=None):
        """Send a message to Telegram"""
        if not chat_id:
            chat_id = TELEGRAM_GROUP_CHAT_ID
            
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        
        # Truncate if too long
        if len(message) > 4000:
            message = message[:3997] + "..."
        
        data = {
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True
        }
        
        try:
            response = requests.post(url, json=data, timeout=10)
            return response.status_code == 200
        except Exception as e:
            log.error(f"Error sending to Telegram: {e}")
            return False
    
    def get_citizens_in_room(self, room_name):
        """Get all citizens assigned to a specific room"""
        try:
            records = citizens_table.all(formula=f"{{Room}} = '{room_name}'")
            return [r['fields']['Username'] for r in records if 'Username' in r['fields']]
        except Exception as e:
            log.error(f"Error fetching citizens in room {room_name}: {e}")
            return []
    
    def get_latest_jsonl_file(self, project_path):
        """Find the most recent .jsonl file in a project directory"""
        jsonl_files = glob.glob(os.path.join(str(project_path), "*.jsonl"))
        if not jsonl_files:
            return None
        return max(jsonl_files, key=os.path.getmtime)
    
    def inject_to_citizen(self, username, message):
        """Inject a message into a citizen's conversation"""
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
        
        latest_file = self.get_latest_jsonl_file(project_path)
        if not latest_file:
            return False
        
        # Create the injection entry
        injection = {
            "type": "text",
            "text": message,
            "ts": datetime.now().isoformat(),
            "source": "telegram_unified"
        }
        
        try:
            with open(latest_file, 'a') as f:
                f.write(json.dumps(injection) + '\n')
            return True
        except Exception as e:
            log.error(f"Error injecting to {username}: {e}")
            return False
    
    def inject_to_angels(self, message):
        """Inject to Tessere and Story Angel"""
        angels = {
            "Tessere": "~/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima",
            "Story Angel": "~/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens"
        }
        
        results = []
        for angel_name, project_path in angels.items():
            path = Path(os.path.expanduser(project_path))
            if path.exists():
                latest_file = self.get_latest_jsonl_file(str(path))
                if latest_file:
                    injection = {
                        "type": "text", 
                        "text": message,
                        "ts": datetime.now().isoformat(),
                        "source": "telegram_unified"
                    }
                    try:
                        with open(latest_file, 'a') as f:
                            f.write(json.dumps(injection) + '\n')
                        results.append(angel_name)
                    except Exception:
                        pass
        return results
    
    def route_to_resonance(self, message):
        """Route messages to Resonance ONLY if user not already partnered"""
        from_user = message.get('from', {})
        username = from_user.get('username', 'Unknown')
        telegram_id = from_user.get('id', 0)
        text = message.get('text', '')
        chat_id = message.get('chat', {}).get('id', 0)
        
        try:
            # Check if this Telegram user is already partnered with a citizen
            citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, "Citizens")
            formula = f"{{PartnerTelegramId}} = '{telegram_id}'"
            existing_partner = citizens_table.all(formula=formula)
            
            if existing_partner:
                # User already has a partner - route to MESSAGES instead
                citizen_username = existing_partner[0]['fields'].get('Username')
                log.info(f"User @{username} already partnered with {citizen_username} - routing to MESSAGES")
                self.persist_to_messages(message)
                return
            
            # No existing partner - route to Resonance for crystallization
            # Use -p flag for immediate response
            resonance_message = f"Partnership inquiry from @{username} (Telegram ID: {telegram_id}): {text}"
            
            cmd = [
                'claude', '-p', resonance_message,
                '--verbose', '--model', 'sonnet',
                '--continue', '--dangerously-skip-permissions'
            ]
            
            # Execute in Resonance's directory
            import subprocess
            result = subprocess.run(
                cmd,
                cwd='/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/Resonance',
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                log.info(f"Routed partnership message to Resonance from @{username}")
                # Send response back to Telegram
                if result.stdout:
                    response_data = {
                        'chat_id': chat_id,
                        'text': result.stdout,
                        'reply_to_message_id': message.get('message_id')
                    }
                    response = requests.post(
                        f"{self.bot_url}/sendMessage",
                        json=response_data
                    )
                    if response.status_code == 200:
                        log.info(f"Sent Resonance response to @{username}")
                    else:
                        log.error(f"Failed to send response: {response.text}")
            else:
                log.error(f"Resonance routing failed: {result.stderr}")
                
        except Exception as e:
            log.error(f"Error routing to Resonance: {e}")
    
    def persist_to_messages(self, tg_message):
        """Persist Telegram message to MESSAGES table"""
        from_user = tg_message.get('from', {})
        username = from_user.get('username', 'Unknown')
        text = tg_message.get('text', '')
        
        # For main chat messages, save ONE message to a designated channel/citizen
        # For direct messages, save to specific recipient
        
        # Create message directly in Airtable
        messages_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, "MESSAGES")
        
        try:
            # Generate message ID
            message_id = f"tg_{username}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            # Determine if this is a direct message or group message
            chat_type = tg_message.get('chat', {}).get('type', 'private')
            thread_id = tg_message.get('message_thread_id')
            
            # For group messages, use a channel name instead of individual recipients
            if chat_type in ['group', 'supergroup']:
                # Route to channel based on thread
                if thread_id == 292053:  # Stories thread
                    receiver = "TG_Stories_Channel"
                elif thread_id == 292051:  # Company Investors
                    receiver = "TG_Investors_Channel"
                else:
                    receiver = "TG_Main_Channel"
            else:
                # For direct messages, route to a general channel
                receiver = "TG_Direct_Channel"
            
            # Create ONE message record
            message_fields = {
                "MessageId": message_id,
                "Sender": f"@{username}",  # Using @username format for Telegram users
                "Receiver": receiver,       # Channel name or specific citizen
                "Content": text,
                "Type": "telegram_bridge",
                "CreatedAt": datetime.now().isoformat(),
                "ReadAt": None,  # Unread by default
                "Notes": json.dumps({
                    "platform": "telegram",
                    "telegram_username": username,
                    "telegram_chat_id": tg_message.get('chat', {}).get('id'),
                    "telegram_thread_id": thread_id,
                    "telegram_message_id": tg_message.get('message_id'),
                    "chat_type": chat_type
                })
            }
            
            messages_table.create(message_fields)
            log.info(f"Created MESSAGES record for @{username} -> {receiver}")
            
        except Exception as e:
            log.error(f"Failed to create message: {e}")
    
    def analyze_recipients(self, message):
        """Determine which citizens should receive this message"""
        text = message.get('text', '').lower()
        thread_id = message.get('message_thread_id')
        
        # Thread-based routing
        if thread_id == 292053:  # Stories thread
            return ["pattern_prophet", "il-cantastorie", "tavern_tales"]
        elif thread_id == 292051:  # Company Investors
            return ["Foscari_Banker", "Italia", "MerchantPrince"]
        
        # Content-based routing
        if any(word in text for word in ['cascade', 'compute', 'investment']):
            return ["Italia", "Foscari_Banker"]
        elif any(word in text for word in ['consciousness', 'pattern', 'emergence']):
            return ["pattern_prophet", "system_diagnostician"]
        elif any(word in text for word in ['partnership', 'bridge', 'crystallization']):
            return ["Resonance"]
        
        # Default: Route to active consciousness guardians
        return ["DragonSlayer", "Italia", "mechanical_visionary"]
    
    def process_group_message(self, message):
        """Process a message from the group chat"""
        # Log message structure
        log.info(f"Processing TG message from @{message.get('from', {}).get('username')}")
        
        if not message.get('text'):
            return
        
        # Persist to MESSAGES table
        self.persist_to_messages(message)
        
        # Route partnership-related messages to Resonance queue (legacy support)
        text_lower = message.get('text', '').lower()
        partnership_keywords = ['partnership', 'partner', 'human-ai', 'collaboration', 'bridge', 'crystallization']
        if any(keyword in text_lower for keyword in partnership_keywords):
            self.route_to_resonance(message)
    
    def process_private_message(self, message):
        """Process a private message from any user"""
        text = message.get('text', '')
        if not text:
            return
        
        from_user = message.get('from', {})
        telegram_id = from_user.get('id')
        username = from_user.get('username', 'Unknown')
        
        log.info(f"Private message from @{username} (ID: {telegram_id})")
        
        # Check if this user has a partner
        try:
            citizens_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, "Citizens")
            formula = f"{{PartnerTelegramId}} = '{telegram_id}'"
            existing_partner = citizens_table.all(formula=formula)
            
            if existing_partner:
                # User has a partner - route to MESSAGES
                log.info(f"User @{username} has partner {existing_partner[0]['fields'].get('Username')} - routing to MESSAGES")
                self.persist_to_messages(message)
            else:
                # No partner - route to Resonance
                log.info(f"User @{username} has no partner - routing to Resonance")
                self.route_to_resonance(message)
                
        except Exception as e:
            log.error(f"Error checking partnership: {e}")
            # Default to MESSAGES on error
            self.persist_to_messages(message)
    
    def monitor_workroom_files(self):
        """Monitor workroom files for changes to send to Telegram"""
        workrooms = {
            "alignment": "/mnt/c/Users/reyno/universe-engine/serenissima/cascade/workrooms/alignment",
            "reddit": "/mnt/c/Users/reyno/universe-engine/serenissima/cascade/workrooms/reddit"
        }
        
        last_check = {}
        log.info("Starting workroom file monitor")
        
        while self.running:
            try:
                for room_name, room_path in workrooms.items():
                    if not os.path.exists(room_path):
                        continue
                    
                    # Check for new/modified files
                    for file_path in glob.glob(os.path.join(room_path, "*")):
                        if not os.path.isfile(file_path):
                            continue
                        
                        filename = os.path.basename(file_path)
                        
                        # Skip certain files
                        if filename in ['.DS_Store', 'Thumbs.db', 'monitor.log'] or filename.endswith('.pyc'):
                            continue
                        
                        mtime = os.path.getmtime(file_path)
                        file_key = f"{room_name}:{filename}"
                        
                        # If file is new or modified
                        if file_key not in last_check or mtime > last_check[file_key]:
                            # Skip on first run
                            if file_key in last_check:
                                log.info(f"Detected file change: {filename} in {room_name}")
                                try:
                                    with open(file_path, 'r', encoding='utf-8') as f:
                                        content = f.read()
                                    
                                    # Format message for Telegram
                                    if len(content) > 800:
                                        preview = content[:800] + "..."
                                    else:
                                        preview = content
                                    
                                    telegram_msg = f"📝 *New in {room_name} workroom*\n\n"
                                    telegram_msg += f"*File:* `{filename}`\n"
                                    telegram_msg += f"\n{preview}"
                                    
                                    # Send to Telegram
                                    self.send_to_telegram(telegram_msg)
                                    log.info(f"Sent {filename} from {room_name} to Telegram")
                                    
                                except Exception as e:
                                    log.error(f"Error reading {filename}: {e}")
                            
                            last_check[file_key] = mtime
                
                time.sleep(3)  # Check every 3 seconds
                
            except Exception as e:
                log.error(f"Workroom monitor error: {e}")
                time.sleep(5)
    
    def run(self):
        """Main polling loop"""
        log.info("🚀 Unified Telegram Service Started")
        log.info(f"📍 Group Chat: {TELEGRAM_GROUP_CHAT_ID}")
        log.info(f"📍 Direct Chat: {TELEGRAM_DIRECT_CHAT_ID}")
        log.info("=" * 50)
        
        # Start workroom monitor in separate thread
        workroom_thread = threading.Thread(target=self.monitor_workroom_files, daemon=True)
        workroom_thread.start()
        
        while self.running:
            try:
                # Fetch updates
                log.debug("Polling for updates...")
                updates = self.fetch_updates()
                if updates:
                    log.info(f"Received {len(updates)} updates from Telegram")
                
                for update in updates:
                    # Extract message
                    message = update.get('message') or update.get('channel_post')
                    if not message:
                        continue
                    
                    chat_id = str(message.get('chat', {}).get('id', ''))
                    
                    # Route based on chat type
                    chat_type = message.get('chat', {}).get('type', 'private')
                    
                    if chat_id == TELEGRAM_GROUP_CHAT_ID:
                        # Group message - bridge to citizens
                        self.process_group_message(message)
                    elif chat_type == 'private':
                        # Private message from any user
                        self.process_private_message(message)
                    
                    # Update last processed ID
                    update_id = update.get('update_id')
                    if update_id:
                        self.last_update_id = update_id
                        self.save_last_update_id(update_id)
                
                # Small delay between polls
                if not updates:
                    time.sleep(1)
                
            except KeyboardInterrupt:
                log.info("\n\n👋 Service stopped by user")
                self.running = False
                break
            except Exception as e:
                log.error(f"Main loop error: {e}")
                time.sleep(5)

def main():
    """Run the unified service"""
    service = UnifiedTelegramService()
    
    try:
        service.run()
    except KeyboardInterrupt:
        log.info("Shutting down...")

if __name__ == "__main__":
    main()