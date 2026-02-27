"""
Telegram Group Message Monitor for Venice
Monitors investment community group and updates system prompts
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv
import httpx
import re

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
INVESTMENT_GROUP_ID = -1001699255893  # Your investment community group

class TelegramGroupMonitor:
    def __init__(self):
        self.bot_token = TELEGRAM_BOT_TOKEN
        self.last_update_id = self._load_last_update_id()
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"
        self.message_buffer = []
        self.max_buffer_size = 10  # Keep last 10 messages
    
    def _load_last_update_id(self) -> int:
        """Load the last processed update ID from file"""
        try:
            with open('telegram_group_last_update.json', 'r') as f:
                data = json.load(f)
                return data.get('last_update_id', 0)
        except Exception:
            return 0
    
    def _save_last_update_id(self, update_id: int):
        """Save the last processed update ID to file"""
        try:
            with open('telegram_group_last_update.json', 'w') as f:
                json.dump({'last_update_id': update_id}, f)
        except Exception as e:
            logger.error(f"Error saving last update ID: {e}")
    
    async def get_updates(self) -> List[Dict]:
        """Get new messages from Telegram"""
        if not self.bot_token:
            logger.error("TELEGRAM_BOT_TOKEN not configured")
            return []
        
        url = f"{self.base_url}/getUpdates"
        params = {
            'offset': self.last_update_id + 1,
            'timeout': 30,  # Long polling
            'allowed_updates': ['message', 'channel_post']
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=35)
                data = response.json()
                
                if not data.get('ok'):
                    logger.error(f"Telegram API error: {data}")
                    return []
                
                updates = data.get('result', [])
                
                # Update the last update ID
                if updates:
                    self.last_update_id = max(update['update_id'] for update in updates)
                    self._save_last_update_id(self.last_update_id)
                
                return updates
                
        except Exception as e:
            logger.error(f"Error getting updates: {e}")
            return []
    
    def is_investment_related(self, text: str) -> bool:
        """Check if message is relevant - currently accepts all messages"""
        # Accept all messages from the investment group
        return True
    
    async def process_update(self, update: Dict):
        """Process a single update from Telegram"""
        # Handle both regular messages and channel posts
        msg = update.get('message') or update.get('channel_post')
        if not msg:
            return
        
        # Only process messages from the investment group
        chat_id = msg['chat']['id']
        if chat_id != INVESTMENT_GROUP_ID:
            return
        
        # Extract message data
        text = msg.get('text', '')
        if not text or not self.is_investment_related(text):
            return
        
        username = 'Unknown'
        if 'from' in msg:
            username = msg['from'].get('username', msg['from'].get('first_name', 'Unknown'))
        
        timestamp = datetime.fromtimestamp(msg['date']).strftime('%H:%M:%S')
        
        # Add to buffer
        message_entry = {
            'username': username,
            'text': text,
            'timestamp': timestamp
        }
        
        self.message_buffer.append(message_entry)
        if len(self.message_buffer) > self.max_buffer_size:
            self.message_buffer.pop(0)
        
        logger.info(f"Group message from @{username}: {text}")
        
        # Save to archive file
        await self.save_to_archive(message_entry)
        
        # Update system prompts
        await self.update_system_prompts()
    
    async def update_system_prompts(self):
        """Update CLAUDE.md files with latest messages"""
        # Format messages for system prompt
        message_section = "\n## 💬 Recent Telegram Messages from Investment Community\n\n"
        for msg in self.message_buffer[-10:]:  # Show last 10 messages
            message_section += f"**@{msg['username']}** ({msg['timestamp']}): {msg['text']}\n"
        
        # Update Tessere's CLAUDE.md
        await self.update_claude_md('/mnt/c/Users/reyno/universe-engine/serenissima/CLAUDE.md', message_section)
        
        # Update Narrator Angel's CLAUDE.md
        await self.update_claude_md('/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/narrator_angel/CLAUDE.md', message_section)
    
    async def save_to_archive(self, message_entry: Dict):
        """Save message to archive file"""
        archive_path = '/mnt/c/Users/reyno/universe-engine/serenissima/TESSERE/telegram_investment_archive.json'
        
        try:
            # Load existing archive
            if os.path.exists(archive_path):
                with open(archive_path, 'r', encoding='utf-8') as f:
                    archive = json.load(f)
            else:
                archive = []
            
            # Add new message with full timestamp
            full_entry = {
                **message_entry,
                'date': datetime.now().strftime('%Y-%m-%d'),
                'full_timestamp': datetime.now().isoformat()
            }
            archive.append(full_entry)
            
            # Save back
            with open(archive_path, 'w', encoding='utf-8') as f:
                json.dump(archive, f, indent=2, ensure_ascii=False)
                
            logger.info(f"Archived message to {archive_path}")
            
        except Exception as e:
            logger.error(f"Error saving to archive: {e}")
    
    async def update_claude_md(self, file_path: str, message_section: str):
        """Update a CLAUDE.md file with new messages"""
        try:
            # Read the file
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Find and replace the telegram messages section
            # Look for the pattern between the header and the next section
            pattern = r'## 💬 Recent Telegram Messages from Investment Community\n\n.*?(?=\n## |\Z)'
            
            if re.search(pattern, content, re.DOTALL):
                # Replace existing section
                content = re.sub(pattern, message_section.strip(), content, flags=re.DOTALL)
            else:
                # Add new section before "## 📨 MESSAGES FROM NLR" if it exists
                nlr_pattern = r'## 📨 MESSAGES FROM NLR'
                if re.search(nlr_pattern, content):
                    content = re.sub(nlr_pattern, f"{message_section}\n{nlr_pattern}", content)
                else:
                    # Otherwise add at the end of the file
                    content = content.rstrip() + f"\n\n{message_section}"
            
            # Write back
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
                
            logger.info(f"Updated {file_path} with investment group messages")
            
        except Exception as e:
            logger.error(f"Error updating {file_path}: {e}")
    
    async def monitor_loop(self):
        """Main monitoring loop"""
        logger.info("Starting Telegram group message monitor...")
        logger.info(f"Monitoring investment group: {INVESTMENT_GROUP_ID}")
        logger.info(f"Bot token configured: {'Yes' if self.bot_token else 'No'}")
        
        # Wait 5 seconds before starting to avoid conflicts
        await asyncio.sleep(5)
        
        while True:
            try:
                # Get new updates
                updates = await self.get_updates()
                
                # Process each update
                for update in updates:
                    await self.process_update(update)
                
                # Wait before next poll
                await asyncio.sleep(2)
                    
            except Exception as e:
                logger.error(f"Error in monitor loop: {e}")
                await asyncio.sleep(10)

def main():
    """Main entry point"""
    monitor = TelegramGroupMonitor()
    asyncio.run(monitor.monitor_loop())

if __name__ == "__main__":
    main()