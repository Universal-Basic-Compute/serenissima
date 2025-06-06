import os
import sys
import json
import traceback
import argparse # Added argparse
import re # Added import for re module
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

import logging # Added logging

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.citizen_utils import find_citizen_by_identifier
from backend.engine.utils.activity_helpers import LogColors, log_header
from backend.engine.dailyUpdate import send_telegram_notification as send_telegram_notification_from_daily_update
# LogColors and log_header will be imported from activity_helpers

# Configuration for API calls
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
log = logging.getLogger(__name__) # Ensure log is defined for helpers

def _get_citizen_data_api(username: str) -> Optional[Dict]:
    """Fetches citizen data via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/citizens/{username}"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and data.get("citizen"):
            return data["citizen"]
        log.warning(f"Failed to get citizen data for {username} from API: {data.get('error')}")
        return None
    except requests.exceptions.RequestException as e:
        log.error(f"API request error fetching citizen data for {username}: {e}")
        return None
    except json.JSONDecodeError:
        log.error(f"JSON decode error fetching citizen data for {username}. Response: {response.text[:200]}")
        return None

def _get_notifications_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches recent notifications for a citizen via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/notifications"
        payload = {"citizen": username, "limit": limit}
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "notifications" in data:
            return data["notifications"]
        log.warning(f"Failed to get notifications for {username} from API: {data.get('error')}")
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"API request error fetching notifications for {username}: {e}")
        return []
    except json.JSONDecodeError:
        log.error(f"JSON decode error fetching notifications for {username}. Response: {response.text[:200]}")
        return []

def _get_relevancies_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches recent relevancies for a citizen via the Next.js API (where AI is relevantToCitizen)."""
    try:
        url = f"{BASE_URL}/api/relevancies?relevantToCitizen={username}&limit={limit}&excludeAll=true"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "relevancies" in data:
            return data["relevancies"]
        log.warning(f"Failed to get relevancies for {username} from API: {data.get('error')}")
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"API request error fetching relevancies for {username}: {e}")
        return []
    except json.JSONDecodeError:
        log.error(f"JSON decode error fetching relevancies for {username}. Response: {response.text[:200]}")
        return []

def _get_problems_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches active problems for a citizen via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/problems?citizen={username}&status=active&limit={limit}"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "problems" in data:
            return data["problems"]
        log.warning(f"Failed to get problems for {username} from API: {data.get('error')}")
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"API request error fetching problems for {username}: {e}")
        return []
    except json.JSONDecodeError:
        log.error(f"JSON decode error fetching problems for {username}. Response: {response.text[:200]}")
        return []

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
        "lands": Table(airtable_api_key, airtable_base_id, "LANDS"),
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

# This first definition of process_ai_lease_adjustments will be removed.
# The complete one is defined later and will be moved up.

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

def get_citizen_lands(tables, username: str) -> List[Dict]:
    """Get all lands owned by a specific citizen."""
    try:
        # Query lands where the citizen is the owner
        formula = f"{{Owner}}='{username}'"
        lands = tables["lands"].all(formula=formula)
        print(f"Found {len(lands)} lands owned by {username}")
        return lands
    except Exception as e:
        print(f"Error getting lands for citizen {username}: {str(e)}")
        return []

def get_citizen_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings owned by a specific citizen."""
    try:
        # Query buildings where the citizen is the owner
        formula = f"{{Owner}}='{username}'"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings owned by {username}")
        return buildings
    except Exception as e:
        print(f"Error getting buildings for citizen {username}: {str(e)}")
        return []

def get_all_buildings_on_lands(tables, land_ids: List[str]) -> List[Dict]:
    """Get all buildings on specific lands."""
    try:
        if not land_ids:
            return []
            
        # Create a formula to query buildings on these lands
        land_conditions = [f"{{LandId}}='{land_id}'" for land_id in land_ids]
        formula = f"OR({', '.join(land_conditions)})"
        
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings on {len(land_ids)} lands")
        return buildings
    except Exception as e:
        print(f"Error getting buildings on lands: {str(e)}")
        return []

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_lease_analysis_data(ai_citizen: Dict, citizen_lands: List[Dict], citizen_buildings: List[Dict], buildings_on_lands: List[Dict]) -> Dict:
    """Prepare a comprehensive data package for the AI to analyze lease situations."""
    
    # Extract citizen information
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    
    # Process lands data
    lands_data = []
    for land in citizen_lands:
        land_info = {
            "id": land["fields"].get("LandId", ""),
            "historical_name": land["fields"].get("HistoricalName", ""),
            "english_name": land["fields"].get("EnglishName", ""),
            "last_income": land["fields"].get("LastIncome", 0),
            "building_points_count": land["fields"].get("BuildingPointsCount", 0),
            "has_water_access": land["fields"].get("HasWaterAccess", False),
            "district": land["fields"].get("District", "")
        }
        lands_data.append(land_info)
    
    # Process buildings data (owned by the AI)
    buildings_data = []
    for building in citizen_buildings:
        building_info = {
            "id": building["fields"].get("BuildingId", ""),
            "type": building["fields"].get("Type", ""),
            "land_id": building["fields"].get("LandId", ""),
            "lease_price": building["fields"].get("LeasePrice", 0),
            "income": building["fields"].get("Income", 0),
            "maintenance_cost": building["fields"].get("MaintenanceCost", 0),
            "owner": building["fields"].get("Owner", "")
        }
        buildings_data.append(building_info)
    
    # Process buildings on AI's lands (potentially owned by others)
    buildings_on_ai_lands = []
    for building in buildings_on_lands:
        building_info = {
            "id": building["fields"].get("BuildingId", ""),
            "type": building["fields"].get("Type", ""),
            "land_id": building["fields"].get("LandId", ""),
            "lease_price": building["fields"].get("LeasePrice", 0),
            "income": building["fields"].get("Income", 0),
            "maintenance_cost": building["fields"].get("MaintenanceCost", 0),
            "owner": building["fields"].get("Owner", "")
        }
        buildings_on_ai_lands.append(building_info)
    
    # Calculate financial metrics
    total_income = sum(building["fields"].get("Income", 0) for building in citizen_buildings)
    total_maintenance = sum(building["fields"].get("MaintenanceCost", 0) for building in citizen_buildings)
    total_lease_paid = sum(building["fields"].get("LeasePrice", 0) for building in citizen_buildings)
    total_lease_received = sum(building["fields"].get("LeasePrice", 0) for building in buildings_on_lands 
                              if building["fields"].get("Owner", "") != username)
    net_income = total_income - total_maintenance - total_lease_paid + total_lease_received

    # Fetch additional context data
    ai_citizen_profile_api = _get_citizen_data_api(username) # Full profile from API
    recent_notifications_for_ai = _get_notifications_data_api(username)
    recent_relevancies_for_ai = _get_relevancies_data_api(username)
    recent_problems_for_ai = _get_problems_data_api(username)
    
    # Prepare the complete data package
    data_package = {
        "ai_citizen_profile": ai_citizen_profile_api or {"username": username, "ducats": ducats}, # Fallback if API fails
        "citizen_financial_summary": { # Keep existing financial summary separate for clarity
            "username": username, # Redundant but keeps structure
            "ducats": ducats, # Redundant
            "total_lands": len(lands_data),
            "total_buildings": len(buildings_data),
            "financial": {
                "total_income": total_income,
                "total_maintenance": total_maintenance,
                "total_lease_paid": total_lease_paid,
                "total_lease_received": total_lease_received,
                "net_income": net_income
            }
        },
        "lands": lands_data,
        "buildings_owned_by_ai": buildings_data, # Renamed for clarity
        "buildings_on_ai_lands_potentially_others": buildings_on_ai_lands, # Renamed for clarity
        "recent_notifications_for_ai": recent_notifications_for_ai,
        "recent_relevancies_for_ai": recent_relevancies_for_ai,
        "recent_problems_for_ai": recent_problems_for_ai,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_lease_adjustment_request(ai_username: str, data_package: Dict, kinos_model_override: Optional[str] = None) -> Optional[Dict]:
    """Send the lease adjustment request to the AI via Kinos API."""
    try:
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        
        # Construct the API URL
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/messages"
        
        # Set up headers with API key
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Log the API request details
        print(f"Sending lease adjustment request to AI citizen {ai_username}")
        print(f"API URL: {url}")
        print(f"Citizen has {data_package['citizen']['ducats']} ducats")
        print(f"Citizen owns {len(data_package['lands'])} lands and {len(data_package['buildings'])} buildings")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a landowner and building owner in La Serenissima, you need to review and adjust the lease amounts for your buildings.

Here's your current situation:
- You own {len(data_package['buildings'])} buildings
- You own {len(data_package['lands'])} lands
- Your current net income is {data_package['citizen']['financial']['net_income']} ducats
- You pay {data_package['citizen']['financial']['total_lease_paid']} ducats in leases to other landowners
- You receive {data_package['citizen']['financial']['total_lease_received']} ducats in leases from buildings on your lands

Please analyze your lease situation and develop a strategy for adjusting lease amounts for your buildings. Consider:
1. The income and maintenance costs of each building
2. The location and value of the land each building is on
3. Contract rates for similar buildings
4. Your overall financial situation

After your analysis, provide your lease adjustment decisions in this JSON format:
```json
{{
  "lease_adjustments": [
    {{
      "building_id": "building-id-1",
      "new_lease_price": 100,
      "reason": "brief explanation"
    }},
    {{
      "building_id": "building-id-2",
      "new_lease_price": 200,
      "reason": "brief explanation"
    }}
  ]
}}
```

If you decide not to adjust any leases at this time, return an empty array:
```json
{{
  "lease_adjustments": []
}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI landowner and building owner in La Serenissima. You make your own decisions about lease strategies.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your lease adjustment strategy:
1. Analyze each building's profitability (income minus maintenance and current lease)
2. Consider fair contract rates for different building types in different districts
3. For buildings on others' lands, ensure lease amounts are reasonable compared to the building's income
4. For buildings on your own lands, you may want to set lower lease amounts to maximize your overall profit
5. Create a specific, actionable plan with building IDs and new lease amounts
6. Provide brief reasons for each adjustment

Your decision should be specific, data-driven, and focused on maximizing your income while maintaining fair relationships with other landowners.

IMPORTANT: You must end your response with a JSON object containing your specific lease adjustment decisions.
Include the building_id, new_lease_price, and reason for each building you want to adjust.
If you decide not to adjust any leases at this time, return an empty array.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 5,
            "max_files": 15
        }

        if kinos_model_override:
            payload["model"] = kinos_model_override
            print(f"Using Kinos model override '{kinos_model_override}' for {ai_username} (lease adjustment).")
        
        # Make the API request
        print(f"Making API request to Kinos for {ai_username}...")
        response = requests.post(url, headers=headers, json=payload)
        
        # Log the API response details
        print(f"API response status code: {response.status_code}")
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            
            print(f"API response status: {status}")
            
            if status == "completed":
                print(f"Successfully sent lease adjustment request to AI citizen {ai_username}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                
                # Log the entire response for debugging
                print(f"FULL AI RESPONSE DATA FROM {ai_username}:")
                print("="*80)
                try:
                    print(json.dumps(response_data, indent=2, ensure_ascii=False))
                except Exception as e_json_dump:
                    print(f"Could not dump response_data as JSON: {e_json_dump}. Raw response_data: {response_data}")
                print("="*80)
                
                # content is response_data.get('response', '')
                print(f"AI {ai_username} response content length: {len(content)} characters")
                print(f"AI {ai_username} response preview: {content[:200]}...")
                
                # Try to extract the JSON decision from the response
                try:
                    # Look for JSON block in the response - try multiple patterns
                    import re
                    
                    # First try to find JSON in code blocks
                    json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                    
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "lease_adjustments" in decisions:
                                print(f"Found lease adjustments in code block: {len(decisions['lease_adjustments'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from code block: {str(e)}")
                    
                    # Next, try to find JSON with curly braces pattern
                    json_match = re.search(r'(\{[\s\S]*"lease_adjustments"[\s\S]*\})', content)
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "lease_adjustments" in decisions:
                                print(f"Found lease adjustments in curly braces pattern: {len(decisions['lease_adjustments'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from curly braces pattern: {str(e)}")
                    
                    # If we couldn't find a JSON block, try to parse the entire response
                    try:
                        decisions = json.loads(content)
                        if "lease_adjustments" in decisions:
                            print(f"Found lease adjustments in full response: {len(decisions['lease_adjustments'])}")
                            return decisions
                    except json.JSONDecodeError:
                        print("Could not parse full response as JSON")
                    
                    # Last resort: try to extract just the array part
                    array_match = re.search(r'"lease_adjustments"\s*:\s*(\[\s*\{.*?\}\s*\])', content, re.DOTALL)
                    if array_match:
                        array_str = array_match.group(1)
                        try:
                            array_data = json.loads(array_str)
                            decisions = {"lease_adjustments": array_data}
                            print(f"Found lease adjustments in array extraction: {len(decisions['lease_adjustments'])}")
                            return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from array extraction: {str(e)}")
                    
                    # Manual extraction as last resort
                    building_ids = re.findall(r'"building_id"\s*:\s*"([^"]+)"', content)
                    lease_prices = re.findall(r'"new_lease_price"\s*:\s*(\d+)', content)
                    reasons = re.findall(r'"reason"\s*:\s*"([^"]+)"', content)
                    
                    if building_ids and lease_prices and len(building_ids) == len(lease_prices):
                        # Create a manually constructed decision object
                        adjustments = []
                        for i in range(len(building_ids)):
                            reason = reasons[i] if i < len(reasons) else "No reason provided"
                            adjustments.append({
                                "building_id": building_ids[i],
                                "new_lease_price": int(lease_prices[i]),
                                "reason": reason
                            })
                        
                        decisions = {"lease_adjustments": adjustments}
                        print(f"Manually extracted lease adjustments: {len(decisions['lease_adjustments'])}")
                        return decisions
                    
                    # If we get here, no valid decision was found
                    print(f"No valid lease adjustment decision found in AI response. Full response:")
                    print(content)
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {str(e)}")
                    print(f"Full response content that caused the error:")
                    print(content)
                    return None
            else:
                print(f"Error processing lease adjustment request for AI citizen {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending lease adjustment request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

# Removed update_building_lease_price function as its logic is now handled by 'adjust_building_lease_price' activity

def create_notification_for_building_owner(tables, building_id: str, building_name: str, owner: str, ai_username: str, 
                                          old_lease: float, new_lease: float, reason: str) -> bool:
    """Create a notification for the building owner about the lease adjustment."""
    try:
        now = datetime.now().isoformat()
        building_display_name = building_name if building_name and building_name != building_id else building_id
        
        # Create the notification
        notification = {
            "Citizen": owner,
            "Type": "lease_adjustment",
            "Content": f"📜 Lease Update: The lease for your building **{building_display_name}** has been adjusted from {old_lease} to **{new_lease} ⚜️ Ducats** by the land owner **{ai_username}**. Reason: {reason}",
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "building_id": building_id,
                "building_name": building_display_name,
                "old_lease_price": old_lease,
                "new_lease_price": new_lease,
                "land_owner": ai_username,
                "reason": reason,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print(f"Created notification for building owner {owner} about lease adjustment")
        return True
    except Exception as e:
        print(f"Error creating notification for building owner: {str(e)}")
        return False

def create_admin_notification(tables, ai_lease_adjustments: Dict[str, List[Dict]]) -> None:
    """Create a notification for admins with the AI lease adjustment summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "📜 **AI Lease Adjustment Summary**:\n\n"
        
        for ai_name, adjustments in ai_lease_adjustments.items():
            message += f"- 👤 AI Land Owner: **{ai_name}** made {len(adjustments)} lease adjustments:\n"
            for adj in adjustments:
                building_display_admin = adj.get('building_name', adj['building_id'])
                message += f"  - 🏠 Building: **{building_display_admin}**: {adj['old_lease']} ⚜️ → **{adj['new_lease']} ⚜️**\n"
        
        # Create the notification
        notification = {
            "Citizen": "ConsiglioDeiDieci",  # Send to ConsiglioDeiDieci as requested
            "Type": "ai_lease_adjustments",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_lease_adjustments": ai_lease_adjustments,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("📜 Created admin notification with AI lease adjustment summary (Airtable)")

        # Also send a Telegram notification
        try:
            # We use the same 'message' content that was prepared for the Airtable notification
            # The send_telegram_notification_from_daily_update function might have its own formatting or target chat_id.
            # For simplicity, we send the already formatted message.
            # Markdown in Telegram is a bit different from Airtable's.
            # Basic Markdown like **bold** and *italic* might work.
            # Convert Airtable's **bold** to Telegram's *bold* if necessary, or keep as is.
            # Telegram uses *bold* or __bold__. Airtable uses **bold**.
            # Let's try sending the message as is first.
            # If specific formatting is needed, the message string might need adjustment.
            telegram_message_content = message # Use the message formatted for Airtable
            
            # Replace Airtable's **bold** with Telegram's *bold*
            telegram_message_content_tg_formatted = telegram_message_content.replace("⚜️", "Ducats") # Replace emoji if problematic
            telegram_message_content_tg_formatted = re.sub(r'\*\*(.*?)\*\*', r'*\1*', telegram_message_content_tg_formatted)


            if send_telegram_notification_from_daily_update(telegram_message_content_tg_formatted):
                print("📢 Successfully sent Telegram notification for AI lease adjustments.")
            else:
                print("⚠️ Failed to send Telegram notification for AI lease adjustments.")
        except Exception as e_tg:
            print(f"Error sending Telegram notification: {str(e_tg)}")

    except Exception as e:
        print(f"Error creating admin notification (Airtable): {str(e)}")

# --- API Call Helper ---
# Note: This script uses print for logging, so log_ref.info/error will become print.
# Consider standardizing logging if this script is to be maintained alongside others.
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool
    # log_ref: Any # Using print instead of a logger object here
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        print(f"[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}")
        return True

    # API_BASE_URL needs to be defined or accessible in this scope.
    # Assuming BASE_URL defined at the top of the script is intended for this.
    api_url = f"{BASE_URL}/api/activities/try-create"
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        if response_data.get("success"):
            print(f"Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 print(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            print(f"API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"API request failed for activity '{activity_type}' for {citizen_username}: {e}")
        return False
    except json.JSONDecodeError:
        print(f"Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}")
        return False

# This is the new location for the complete process_ai_lease_adjustments function
def process_ai_lease_adjustments(dry_run: bool = False, kinos_model_override_arg: Optional[str] = None):
    """Main function to process AI lease adjustments."""
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "default"
    log_header(f"AI Lease Adjustment Process (dry_run={dry_run}, kinos_model={model_status})", LogColors.HEADER)
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those whose lands have buildings owned by others
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get lands owned by this AI
        citizen_lands = get_citizen_lands(tables, ai_username)
        
        # Get land IDs
        land_ids = [land["fields"].get("LandId") for land in citizen_lands if land["fields"].get("LandId")]
        
        # Get buildings on these lands
        buildings_on_lands = get_all_buildings_on_lands(tables, land_ids)
        
        # Check if any buildings on these lands are owned by others
        has_others_buildings = False
        for building in buildings_on_lands:
            building_owner = building["fields"].get("Owner", "")
            if building_owner and building_owner != ai_username:
                has_others_buildings = True
                break
                
        if has_others_buildings:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} has lands with buildings owned by others, including in processing")
        else:
            print(f"AI citizen {ai_username} has no lands with buildings owned by others, skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with lands that have buildings owned by others")
    
    if not ai_citizens:
        print("No AI citizens with lands that have buildings owned by others, exiting")
        return
    
    # Track lease adjustments for each AI
    ai_lease_adjustments = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI citizen: {ai_username}")
        ai_lease_adjustments[ai_username] = []
        
        # Get lands owned by this AI
        citizen_lands = get_citizen_lands(tables, ai_username)
        
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Get all buildings on lands owned by this AI
        land_ids = [land["fields"].get("LandId") for land in citizen_lands if land["fields"].get("LandId")]
        buildings_on_lands = get_all_buildings_on_lands(tables, land_ids)
        
        # Prepare the data package for the AI
        data_package = prepare_lease_analysis_data(ai_citizen, citizen_lands, citizen_buildings, buildings_on_lands)
        
        # Send the lease adjustment request to the AI
        if not dry_run:
            decisions = send_lease_adjustment_request(ai_username, data_package, kinos_model_override_arg)
            
            if decisions and "lease_adjustments" in decisions:
                lease_adjustments = decisions["lease_adjustments"]
                
                for adjustment in lease_adjustments:
                    building_id = adjustment.get("building_id")
                    new_lease_price = adjustment.get("new_lease_price")
                    reason = adjustment.get("reason", "No reason provided")
                    
                    if not building_id or new_lease_price is None:
                        print(f"Invalid lease adjustment: {adjustment}")
                        continue
                    
                    # Find the building to get current lease amount and owner
                    building_formula = f"{{BuildingId}}='{building_id}'"
                    buildings = tables["buildings"].all(formula=building_formula)
                    
                    if not buildings:
                        print(f"Building {building_id} not found")
                        continue
                    
                    building = buildings[0]
                    current_lease = building["fields"].get("LeasePrice", 0)
                    building_owner = building["fields"].get("Owner", "")
                    
                    # Find the building to get current lease amount and land ID
                    # This re-fetch is redundant if building_formula was correct, but safe.
                    # building_formula = f"{{BuildingId}}='{building_id}'" 
                    # buildings = tables["buildings"].all(formula=building_formula)
                    # if not buildings: continue # Should not happen if first fetch worked
                    # building = buildings[0]
                    # current_lease = building["fields"].get("LeasePrice", 0)
                    # building_owner = building["fields"].get("Owner", "")
                    land_id = building["fields"].get("LandId", "")
                    
                    # Check if the building is on a land owned by the AI
                    if not land_id:
                        print(f"Building {building_id} has no land ID, skipping")
                        continue
                    
                    # Find the land to check ownership
                    land_formula = f"{{LandId}}='{land_id}'"
                    lands = tables["lands"].all(formula=land_formula)
                    
                    if not lands:
                        print(f"Land {land_id} not found for building {building_id}, skipping")
                        continue
                    
                    land = lands[0]
                    land_owner = land["fields"].get("Owner", "")
                    
                    # Check if the AI owns this land - if not, skip it
                    if land_owner != ai_username:
                        print(f"Skipping building {building_id} - AI {ai_username} does not own the land {land_id} (owned by {land_owner})")
                        continue
                    
                    # Update the lease amount via activity
                    activity_params = {
                        "buildingId": building_id, # Pass custom BuildingId
                        "newLeasePrice": new_lease_price,
                        "strategy": "kinos_direct_decision" # Or derive strategy if Kinos provides it
                    }
                    if call_try_create_activity_api(ai_username, "adjust_building_lease_price", activity_params, dry_run):
                        building_name_for_notif = building["fields"].get("Name", building_id)
                        # Create notification for building owner if different from AI
                        if building_owner and building_owner != ai_username:
                            create_notification_for_building_owner(
                                tables, building_id, building_name_for_notif, building_owner, ai_username, 
                                current_lease, new_lease_price, reason
                            )
                        
                        # Add to the list of adjustments for this AI
                        ai_lease_adjustments[ai_username].append({
                            "building_id": building_id,
                            "building_name": building_name_for_notif, # For admin summary
                            "old_lease": current_lease,
                            "new_lease": new_lease_price,
                            "reason": reason
                        })
            else:
                print(f"No valid lease adjustment decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send lease adjustment request to AI citizen {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package.get('ai_citizen_profile', {}).get('username', 'N/A')}") # Adjusted access
            print(f"  - Lands: {len(data_package.get('lands', []))}")
            print(f"  - Buildings Owned: {len(data_package.get('buildings_owned_by_ai', []))}")
            print(f"  - Buildings on AI Lands: {len(data_package.get('buildings_on_ai_lands_potentially_others', []))}")
            print(f"  - Net Income: {data_package.get('citizen_financial_summary', {}).get('financial', {}).get('net_income', 'N/A')}") # Adjusted access
    
    # Create admin notification with summary
    if not dry_run and any(adjustments for adjustments in ai_lease_adjustments.values()):
        create_admin_notification(tables, ai_lease_adjustments)
    elif dry_run: # Ensure this log appears in dry_run too
        print(f"[DRY RUN] Would create admin notification with lease adjustments: {ai_lease_adjustments}")
    
    print("AI lease adjustment process completed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Adjust lease prices for AI-owned lands using Kinos AI.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the script without making actual changes to Airtable or Kinos."
    )
    parser.add_argument(
        "--model",
        type=str,
        help="Specify a Kinos model override (e.g., 'local', 'gpt-4-turbo')."
    )
    args = parser.parse_args()
    
    # Run the process
    process_ai_lease_adjustments(dry_run=args.dry_run, kinos_model_override_arg=args.model)

# The following definition of process_ai_lease_adjustments is the correct one and will be moved earlier.
# This SEARCH/REPLACE block effectively deletes this misplaced definition.
# The actual function content will be inserted where the old, simpler definition was.
