"""
Telegram Bot Poller for Local Development
Polls Telegram for new messages instead of using webhooks
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List
from dotenv import load_dotenv
import httpx

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# Import the router
from telegram_router import TelegramRouter

class TelegramPoller:
    def __init__(self):
        self.bot_token = TELEGRAM_BOT_TOKEN
        self.router = TelegramRouter()
        self.last_update_id = self._load_last_update_id()
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"
    
    def _load_last_update_id(self) -> int:
        """Load the last processed update ID from file"""
        try:
            with open('telegram_direct_last_update.json', 'r') as f:
                data = json.load(f)
                return data.get('last_update_id', 0)
        except Exception:
            return 0
    
    def _save_last_update_id(self, update_id: int):
        """Save the last processed update ID to file"""
        try:
            with open('telegram_direct_last_update.json', 'w') as f:
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
            'allowed_updates': ['message']
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
    
    async def process_update(self, update: Dict):
        """Process a single update from Telegram"""
        if 'message' not in update:
            return
        
        msg = update['message']
        
        # Skip group messages (negative chat IDs are groups/channels)
        chat_id = msg['chat']['id']
        if chat_id < 0:
            logger.info(f"Skipping group message from chat {chat_id}")
            return
        
        # Extract message data
        telegram_message = {
            'telegram_id': str(msg['from']['id']),
            'username': msg['from'].get('username', 'Unknown'),
            'message': msg.get('text', ''),
            'chat_id': chat_id,
            'message_id': msg['message_id']
        }
        
        # Log the incoming message
        logger.info(f"Received message from @{telegram_message['username']}: {telegram_message['message']}")
        
        # Route the message
        try:
            result = await self.router.route_message(telegram_message)
            logger.info(f"Message routed: {result}")
        except Exception as e:
            logger.error(f"Error routing message: {e}")
    
    async def delete_webhook(self):
        """Delete any existing webhook to enable polling"""
        url = f"{self.base_url}/deleteWebhook"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url)
                data = response.json()
                
                if data.get('ok'):
                    logger.info("Webhook deleted successfully")
                else:
                    logger.warning(f"Failed to delete webhook: {data}")
        except Exception as e:
            logger.error(f"Error deleting webhook: {e}")
    
    async def poll_loop(self):
        """Main polling loop"""
        # First, delete any existing webhook
        await self.delete_webhook()
        
        logger.info("Starting Telegram polling...")
        logger.info(f"Bot token configured: {'Yes' if self.bot_token else 'No'}")
        
        while True:
            try:
                # Get new updates
                updates = await self.get_updates()
                
                # Process each update
                for update in updates:
                    await self.process_update(update)
                
                # Small delay to avoid hitting rate limits
                if not updates:
                    await asyncio.sleep(1)
                    
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")
                await asyncio.sleep(5)

def main():
    """Main entry point"""
    poller = TelegramPoller()
    asyncio.run(poller.poll_loop())

if __name__ == "__main__":
    main()