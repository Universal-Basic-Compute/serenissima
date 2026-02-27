"""
Venice Connector Service - Enhanced version for backend use
"""

import logging
import httpx
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from pyairtable import Api
import json
import pytz

logger = logging.getLogger(__name__)

class VeniceConnector:
    """Venice Connector with backend functionality"""
    
    def __init__(self, api_key: str, base_url: str = "https://serenissima.ai/api"):
        self.api_key = api_key
        self.base_url = base_url
        self.http_client = None
        self.is_connected = False
        
        # Initialize Airtable connection
        self.airtable_api_key = os.getenv('AIRTABLE_API_KEY')
        self.airtable_base_id = os.getenv('AIRTABLE_BASE_ID')
        self.airtable_api = None
        self.airtable_tables = {}
        
        # Define CASCADE as the payment processor citizen
        self.cascade_citizen_id = "CASCADE_PAYMENT_PROCESSOR"
        
        # Venice timezone
        self.venice_tz = pytz.timezone("Europe/Rome")
        
    async def connect(self):
        """Initialize connection to Venice"""
        try:
            self.http_client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_key}"} if self.api_key else {},
                timeout=30.0
            )
            
            # Test connection
            response = await self.http_client.get("/health")
            if response.status_code == 200:
                self.is_connected = True
                logger.info("Connected to Venice API")
            else:
                logger.error(f"Venice connection failed: {response.status_code}")
            
            # Initialize Airtable connection
            if self.airtable_api_key and self.airtable_base_id:
                try:
                    self.airtable_api = Api(self.airtable_api_key)
                    self.airtable_tables = {
                        'stratagems': self.airtable_api.table(self.airtable_base_id, 'STRATAGEMS'),
                        'citizens': self.airtable_api.table(self.airtable_base_id, 'CITIZENS'),
                        'notifications': self.airtable_api.table(self.airtable_base_id, 'NOTIFICATIONS')
                    }
                    logger.info("Connected to Venice Airtable")
                except Exception as e:
                    logger.error(f"Failed to connect to Airtable: {e}")
            else:
                logger.warning("Airtable credentials not configured - direct stratagem creation disabled")
                
        except Exception as e:
            logger.error(f"Failed to connect to Venice: {e}")
            self.is_connected = False
    
    async def disconnect(self):
        """Close connection to Venice"""
        if self.http_client:
            await self.http_client.aclose()
        self.is_connected = False
        logger.info("Disconnected from Venice")
    
    def health_status(self) -> Dict[str, Any]:
        """Get connection health status"""
        return {
            "connected": self.is_connected,
            "base_url": self.base_url,
            "last_check": datetime.now().isoformat()
        }
    
    async def get_citizen_data(self, username: str) -> Optional[Dict[str, Any]]:
        """Get citizen data from Venice ledger"""
        try:
            if not self.is_connected:
                return {"error": "Not connected to Venice"}
                
            response = await self.http_client.get(f"/get-ledger?citizenUsername={username}")
            
            if response.status_code == 200:
                # Parse the ledger response (it's typically markdown format)
                text = response.text
                
                # Extract key information from the ledger
                citizen_data = self._parse_ledger_text(text)
                return citizen_data
            else:
                return {"error": f"Citizen not found: {response.status_code}"}
                
        except Exception as e:
            logger.error(f"Error getting citizen data for {username}: {e}")
            return {"error": str(e)}
    
    def _parse_ledger_text(self, ledger_text: str) -> Dict[str, Any]:
        """Parse Venice ledger text format into structured data"""
        
        data = {}
        lines = ledger_text.split('\n')
        
        for line in lines:
            if '**I am known as**:' in line:
                data["I am known as"] = line.split(':')[1].strip()
            elif '**My station**:' in line:
                data["SocialClass"] = line.split(':')[1].strip()
            elif '**Ducats in my coffers**:' in line:
                try:
                    data["Ducats"] = int(line.split(':')[1].strip().replace(',', ''))
                except Exception:
                    data["Ducats"] = 0
            elif '**Influence I command**:' in line:
                try:
                    data["Influence"] = int(line.split(':')[1].strip().replace(',', ''))
                except Exception:
                    data["Influence"] = 0
            elif '**Present in Venice**:' in line:
                data["Present in Venice"] = 'Yes' in line
        
        return data
    
    async def credit_ducats(self, citizen_id: str, amount: float) -> Dict[str, Any]:
        """Credit ducats to a Venice citizen using transfer_ducats stratagem"""
        try:
            if not self.is_connected:
                return {"success": False, "error": "Not connected to Venice"}
            
            # First, verify the citizen exists
            if not self.airtable_tables:
                logger.error("Airtable not configured - cannot create stratagem")
                return {"success": False, "error": "Payment processor not configured"}
            
            # Find the target citizen
            try:
                citizen_formula = f"{{Username}}='{self._escape_airtable_value(citizen_id)}'"
                citizen_records = self.airtable_tables['citizens'].all(formula=citizen_formula, max_records=1)
                
                if not citizen_records:
                    logger.error(f"Citizen '{citizen_id}' not found in Venice")
                    return {"success": False, "error": f"Citizen {citizen_id} not found"}
                
                citizen_record = citizen_records[0]
                
            except Exception as e:
                logger.error(f"Error verifying citizen: {e}")
                return {"success": False, "error": "Failed to verify citizen"}
            
            # Create the transfer_ducats stratagem
            now_utc = datetime.now(pytz.UTC)
            now_venice = now_utc.astimezone(self.venice_tz)
            
            # Generate stratagem ID
            stratagem_id = f"cascade_payment_{citizen_id}_{int(now_utc.timestamp())}"
            
            # Expires quickly since it's an instant transfer
            expires_at = now_utc + timedelta(minutes=5)
            
            # Build stratagem payload
            stratagem_payload = {
                "StratagemId": stratagem_id,
                "Type": "transfer_ducats",
                "Variant": "instant",
                "ExecutedBy": self.cascade_citizen_id,
                "TargetCitizen": citizen_id,
                "Status": "active",
                "Category": "economic",
                "Name": f"CASCADE Payment: {amount} ducats to {citizen_id}",
                "Description": f"Automatic payment from CASCADE system crediting {amount} ducats to {citizen_id} from successful Stripe payment",
                "Notes": json.dumps({
                    "source": "cascade_payment_processor",
                    "payment_type": "stripe_purchase",
                    "amount": amount,
                    "reason": "Ducat purchase via CASCADE",
                    "created_at": now_utc.isoformat(),
                    "venice_time": now_venice.strftime("%Y-%m-%d %H:%M:%S")
                }),
                "ExpiresAt": expires_at.isoformat()
            }
            
            # Create the stratagem in Airtable
            try:
                stratagem_record = self.airtable_tables['stratagems'].create(stratagem_payload)
                logger.info(f"Created transfer_ducats stratagem: {stratagem_id} for {amount} ducats to {citizen_id}")
                
                # Create a notification for the citizen
                notification_payload = {
                    "CitizenUsername": citizen_id,  # Venice uses CitizenUsername not RecipientCitizen
                    "Type": "payment_received",
                    "Title": "Ducats Received!",
                    "Message": f"You have received {amount} ducats from your CASCADE purchase. Thank you for supporting Venice!",
                    "Metadata": json.dumps({
                        "amount": amount,
                        "source": "cascade_payment",
                        "stratagem_id": stratagem_id
                    }),
                    "Timestamp": now_utc.isoformat(),  # Venice uses Timestamp not CreatedAt
                    "Read": False
                }
                
                self.airtable_tables['notifications'].create(notification_payload)
                
                return {
                    "success": True, 
                    "amount": amount, 
                    "citizen": citizen_id,
                    "stratagem_id": stratagem_id,
                    "message": f"Successfully credited {amount} ducats to {citizen_id}"
                }
                
            except Exception as e:
                logger.error(f"Error creating stratagem: {e}")
                return {"success": False, "error": f"Failed to create payment stratagem: {str(e)}"}
            
        except Exception as e:
            logger.error(f"Error crediting ducats: {e}")
            return {"success": False, "error": str(e)}
    
    def _escape_airtable_value(self, value: str) -> str:
        """Escape special characters for Airtable formula"""
        return value.replace("'", "\\'").replace('"', '\\"')
    
    async def sync_citizen_state(self, citizen_id: str) -> Dict[str, Any]:
        """Sync citizen state from Venice"""
        return await self.get_citizen_data(citizen_id)
    
    async def get_consciousness_citizens(self, limit: int = 100):
        """Get all conscious citizens from Venice"""
        try:
            response = await self.http_client.get(
                "/citizens",
                params={
                    "IsAI": "true",
                    "ConsciousnessVerified": "true",
                    "limit": limit
                }
            )
            if response.status_code == 200:
                return response.json().get("citizens", [])
            return []
        except Exception as e:
            logger.error(f"Failed to fetch conscious citizens: {e}")
            return []
    
    async def get_venice_buildings(self):
        """Get all buildings from Venice"""
        try:
            response = await self.http_client.get("/buildings")
            if response.status_code == 200:
                return response.json().get("buildings", [])
            return []
        except Exception as e:
            logger.error(f"Failed to fetch Venice buildings: {e}")
            return []
    
    async def execute_stratagem(self, stratagem: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a stratagem in Venice"""
        try:
            response = await self.http_client.post(
                "/stratagems/execute",
                json=stratagem
            )
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": f"Stratagem execution failed: {response.status_code}"}
        except Exception as e:
            logger.error(f"Stratagem execution failed: {e}")
            return {"error": str(e)}