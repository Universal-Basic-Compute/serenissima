import os
import sys
import json
import traceback
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

from app.citizen_utils import find_citizen_by_identifier
from backend.engine.utils.activity_helpers import log_header, LogColors

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
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
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

def get_citizen_info(tables, citizen_ids: List[str]) -> Dict[str, Dict]:
    """Get information about citizens by their IDs."""
    try:
        if not citizen_ids:
            return {}
            
        # Create a formula to query citizens by ID
        citizen_conditions = [f"RECORD_ID()='{citizen_id}'" for citizen_id in citizen_ids]
        formula = f"OR({', '.join(citizen_conditions)})"
        
        citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(citizens)} citizens from {len(citizen_ids)} IDs")
        
        # Index citizens by ID
        citizens_by_id = {citizen["id"]: citizen for citizen in citizens}
        return citizens_by_id
    except Exception as e:
        print(f"Error getting citizen info: {str(e)}")
        return {}

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_rent_analysis_data(ai_citizen: Dict, citizen_buildings: List[Dict], citizens_info: Dict[str, Dict]) -> Dict:
    """Prepare a comprehensive data package for the AI to analyze rent situations."""
    
    # Extract citizen information
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    
    # Process buildings data
    buildings_data = []
    for building in citizen_buildings:
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        rent_price = building["fields"].get("RentPrice", 0)
        occupant_id = building["fields"].get("Occupant", "")
        
        # Get occupant information if available
        occupant_data = None
        if occupant_id and occupant_id in citizens_info:
            citizen = citizens_info[occupant_id]
            occupant_data = {
                "id": citizen["id"],
                "name": f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}",
                "social_class": citizen["fields"].get("SocialClass", ""),
                "ducats": citizen["fields"].get("Ducats", 0),
                "work": citizen["fields"].get("Work", "")
            }
        
        building_info = {
            "id": building_id,
            "type": building_type,
            "rent_price": rent_price,
            "income": building["fields"].get("Income", 0),
            "maintenance_cost": building["fields"].get("MaintenanceCost", 0),
            "occupant": occupant_data,
            "is_occupied": occupant_id != ""
        }
        buildings_data.append(building_info)
    
    # Calculate financial metrics
    total_income = sum(building["fields"].get("Income", 0) for building in citizen_buildings)
    total_maintenance = sum(building["fields"].get("MaintenanceCost", 0) for building in citizen_buildings)
    total_rent_received = sum(building["fields"].get("RentPrice", 0) for building in citizen_buildings 
                             if building["fields"].get("Occupant", ""))
    net_income = total_income - total_maintenance + total_rent_received

    # Fetch additional context data
    ai_citizen_profile_api = _get_citizen_data_api(username) # Full profile from API
    recent_notifications_for_ai = _get_notifications_data_api(username)
    recent_relevancies_for_ai = _get_relevancies_data_api(username)
    recent_problems_for_ai = _get_problems_data_api(username)
    
    # Prepare the complete data package
    data_package = {
        "ai_citizen_profile": ai_citizen_profile_api or {"username": username, "ducats": ducats}, # Fallback if API fails
        "citizen_financial_summary": { # Keep existing financial summary separate
            "username": username,
            "ducats": ducats,
            "total_buildings": len(buildings_data),
            "financial": {
                "total_income": total_income,
                "total_maintenance": total_maintenance,
                "total_rent_received": total_rent_received,
                "net_income": net_income
            }
        },
        "buildings_owned_by_ai": buildings_data, # Renamed for clarity
        "recent_notifications_for_ai": recent_notifications_for_ai,
        "recent_relevancies_for_ai": recent_relevancies_for_ai,
        "recent_problems_for_ai": recent_problems_for_ai,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_rent_adjustment_request(ai_username: str, data_package: Dict) -> Optional[Dict]:
    """Send the rent adjustment request to the AI via Kinos API."""
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
        print(f"Sending rent adjustment request to AI citizen {ai_username}")
        print(f"API URL: {url}")
        print(f"Citizen has {data_package['citizen']['ducats']} ducats")
        print(f"Citizen owns {len(data_package['buildings'])} buildings")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a building owner in La Serenissima, you need to review and adjust the rent amounts for your buildings.

Here's your current situation:
- You own {len(data_package['buildings'])} buildings
- Your current net income is {data_package['citizen']['financial']['net_income']} ducats
- You receive {data_package['citizen']['financial']['total_rent_received']} ducats in rent from your buildings

Please analyze your rent situation and develop a strategy for adjusting rent amounts for your buildings. Consider:
1. The income and maintenance costs of each building
2. The occupancy status of each building
3. The social class and wealth of current occupants
4. Contract rates for similar buildings
5. Your overall financial situation

After your analysis, provide your rent adjustment decisions in this JSON format:
```json
{{
  "rent_adjustments": [
    {{
      "building_id": "building-id-1",
      "new_rent_price": 1000,
      "reason": "brief explanation"
    }},
    {{
      "building_id": "building-id-2",
      "new_rent_price": 2000,
      "reason": "brief explanation"
    }}
  ]
}}
```

If you decide not to adjust any rents at this time, return an empty array:
```json
{{
  "rent_adjustments": []
}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI building owner in La Serenissima. You make your own decisions about rent strategies.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your rent adjustment strategy:
1. Analyze each building's profitability (income minus maintenance)
2. Consider the social class and wealth of current occupants
3. For occupied buildings, ensure rent amounts are reasonable compared to occupant wealth
4. For vacant buildings, consider lowering rent to attract occupants
5. Create a specific, actionable plan with building IDs and new rent amounts
6. Provide brief reasons for each adjustment

Your decision should be specific, data-driven, and focused on maximizing your income while maintaining reasonable occupancy rates.

IMPORTANT: You must end your response with a JSON object containing your specific rent adjustment decisions.
Include the building_id, new_rent_price, and reason for each building you want to adjust.
If you decide not to adjust any rents at this time, return an empty array.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 5,
            "max_files": 15
        }
        
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
                print(f"Successfully sent rent adjustment request to AI citizen {ai_username}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                
                # Log the entire response for debugging
                print(f"FULL AI RESPONSE FROM {ai_username}:")
                print("="*80)
                print(content)
                print("="*80)
                
                print(f"AI {ai_username} response length: {len(content)} characters")
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
                            if "rent_adjustments" in decisions:
                                print(f"Found rent adjustments in code block: {len(decisions['rent_adjustments'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from code block: {str(e)}")
                    
                    # Next, try to find JSON with curly braces pattern
                    json_match = re.search(r'(\{[\s\S]*"rent_adjustments"[\s\S]*\})', content)
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "rent_adjustments" in decisions:
                                print(f"Found rent adjustments in curly braces pattern: {len(decisions['rent_adjustments'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from curly braces pattern: {str(e)}")
                    
                    # If we couldn't find a JSON block, try to parse the entire response
                    try:
                        decisions = json.loads(content)
                        if "rent_adjustments" in decisions:
                            print(f"Found rent adjustments in full response: {len(decisions['rent_adjustments'])}")
                            return decisions
                    except json.JSONDecodeError:
                        print("Could not parse full response as JSON")
                    
                    # Last resort: try to extract just the array part
                    array_match = re.search(r'"rent_adjustments"\s*:\s*(\[\s*\{.*?\}\s*\])', content, re.DOTALL)
                    if array_match:
                        array_str = array_match.group(1)
                        try:
                            array_data = json.loads(array_str)
                            decisions = {"rent_adjustments": array_data}
                            print(f"Found rent adjustments in array extraction: {len(decisions['rent_adjustments'])}")
                            return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from array extraction: {str(e)}")
                    
                    # Manual extraction as last resort
                    building_ids = re.findall(r'"building_id"\s*:\s*"([^"]+)"', content)
                    rent_prices = re.findall(r'"new_rent_price"\s*:\s*(\d+)', content)
                    reasons = re.findall(r'"reason"\s*:\s*"([^"]+)"', content)
                    
                    if building_ids and rent_prices and len(building_ids) == len(rent_prices):
                        # Create a manually constructed decision object
                        adjustments = []
                        for i in range(len(building_ids)):
                            reason = reasons[i] if i < len(reasons) else "No reason provided"
                            adjustments.append({
                                "building_id": building_ids[i],
                                "new_rent_price": int(rent_prices[i]),
                                "reason": reason
                            })
                        
                        decisions = {"rent_adjustments": adjustments}
                        print(f"Manually extracted rent adjustments: {len(decisions['rent_adjustments'])}")
                        return decisions
                    
                    # If we get here, no valid decision was found
                    print(f"No valid rent adjustment decision found in AI response. Full response:")
                    print(content)
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {str(e)}")
                    print(f"Full response content that caused the error:")
                    print(content)
                    return None
            else:
                print(f"Error processing rent adjustment request for AI citizen {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending rent adjustment request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

# Removed update_building_rent_price function as its logic is now handled by 'adjust_building_rent_price' activity

def create_notification_for_building_occupant(tables, building_id: str, building_name: str, occupant: str, ai_username: str, 
                                             old_rent: float, new_rent: float, reason: str) -> bool:
    """Create a notification for the building occupant about the rent adjustment."""
    try:
        now = datetime.now().isoformat()
        building_display_name = building_name if building_name and building_name != building_id else building_id
        
        # Create the notification
        notification = {
            "Citizen": occupant, # Occupant is already the Username
            "Type": "rent_adjustment",
            "Content": f"🏠 Rent Update: The rent for your building **{building_display_name}** has been adjusted from {old_rent} to **{new_rent} ⚜️ Ducats** by the owner **{ai_username}**. Reason: {reason}",
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "building_id": building_id,
                "building_name": building_display_name,
                "old_rent_price": old_rent,
                "new_rent_price": new_rent,
                "building_owner": ai_username,
                "reason": reason,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print(f"Created notification for building occupant {occupant} about rent adjustment")
        return True
    except Exception as e:
        print(f"Error creating notification for building occupant: {str(e)}")
        return False

def create_admin_notification(tables, ai_rent_adjustments: Dict[str, List[Dict]]) -> None:
    """Create a notification for admins with the AI rent adjustment summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "📊 **AI Rent Adjustment Summary**:\n\n"
        
        for ai_name, adjustments in ai_rent_adjustments.items():
            message += f"- 👤 AI Owner: **{ai_name}** made {len(adjustments)} rent adjustments:\n"
            for adj in adjustments:
                building_display_admin = adj.get('building_name', adj['building_id'])
                message += f"  - 🏠 Building: **{building_display_admin}**: {adj['old_rent']} ⚜️ → **{adj['new_rent']} ⚜️**\n"
        
        # Create the notification
        notification = {
            "Citizen": "ConsiglioDeiDieci",  # Send to ConsiglioDeiDieci as requested
            "Type": "ai_rent_adjustments",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_rent_adjustments": ai_rent_adjustments,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("📊 Created admin notification with AI rent adjustment summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        print(f"[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}")
        return True

    api_url = f"{BASE_URL}/api/activities/try-create" # BASE_URL is defined at the top
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

def process_ai_rent_adjustments(dry_run: bool = False):
    """Main function to process AI rent adjustments."""
    log_header(f"AI Rent Adjustment Process (dry_run={dry_run})", LogColors.HEADER)
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those who own at least one building that can be rented out
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Check if the citizen owns any buildings
        if citizen_buildings:
            # Check if any building is rentable (has a Type that can be rented)
            has_rentable_building = False
            for building in citizen_buildings:
                building_type = building["fields"].get("Type", "")
                # Most building types can be rented out, so we'll include all buildings
                # except for specific types that can't be rented
                non_rentable_types = ["bridge", "wall", "gate"]
                if building_type and building_type not in non_rentable_types:
                    has_rentable_building = True
                    break
                    
            if has_rentable_building:
                filtered_ai_citizens.append(ai_citizen)
                print(f"AI citizen {ai_username} has buildings that can be rented out, including in processing")
            else:
                print(f"AI citizen {ai_username} has no buildings that can be rented out, skipping")
        else:
            print(f"AI citizen {ai_username} has no buildings, skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with buildings that can be rented out")
    
    if not ai_citizens:
        print("No AI citizens with buildings that can be rented out, exiting")
        return
    
    # Track rent adjustments for each AI
    ai_rent_adjustments = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI citizen: {ai_username}")
        ai_rent_adjustments[ai_username] = []
        
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        if not citizen_buildings:
            print(f"AI citizen {ai_username} has no buildings, skipping")
            continue
        
        # Get occupant IDs from buildings
        occupant_ids = []
        for building in citizen_buildings:
            occupant_id = building["fields"].get("Occupant")
            if occupant_id:
                occupant_ids.append(occupant_id)
        
        # Get citizen information for occupants
        citizens_info = get_citizen_info(tables, occupant_ids)
        
        # Prepare the data package for the AI
        data_package = prepare_rent_analysis_data(ai_citizen, citizen_buildings, citizens_info)
        
        # Send the rent adjustment request to the AI
        if not dry_run:
            decisions = send_rent_adjustment_request(ai_username, data_package)
            
            if decisions and "rent_adjustments" in decisions:
                rent_adjustments = decisions["rent_adjustments"]
                
                for adjustment in rent_adjustments:
                    building_id = adjustment.get("building_id")
                    new_rent_price = adjustment.get("new_rent_price")
                    reason = adjustment.get("reason", "No reason provided")
                    
                    if not building_id or new_rent_price is None:
                        print(f"Invalid rent adjustment: {adjustment}")
                        continue
                    
                    # Find the building to get current rent amount and occupant
                    building_formula = f"{{BuildingId}}='{building_id}'"
                    buildings = tables["buildings"].all(formula=building_formula)
                    
                    if not buildings:
                        print(f"Building {building_id} not found")
                        continue
                    
                    building = buildings[0]
                    current_rent = building["fields"].get("RentPrice", 0)
                    occupant_id = building["fields"].get("Occupant", "")
                    
                    # Check if the AI owns this building - if not, skip it
                    building_owner = building["fields"].get("Owner", "")
                    if building_owner != ai_username:
                        print(f"Skipping building {building_id} - AI {ai_username} does not own this building (owned by {building_owner})")
                        continue
                    
                    # Update the rent amount via activity
                    activity_params = {
                        "buildingId": building_id,
                        "newRentPrice": new_rent_price,
                        "strategy": "kinos_direct_decision" # Or derive strategy if Kinos provides it
                    }
                    if call_try_create_activity_api(ai_username, "adjust_building_rent_price", activity_params, dry_run):
                        # Create notification for occupant if there is one
                        building_name_for_notif = building["fields"].get("Name", building_id)
                        if occupant_id: # occupant_id is Airtable Record ID
                            # Get the occupant's username from citizens_info (which is indexed by Airtable Record ID)
                            if occupant_id in citizens_info:
                                citizen_occupant_record = citizens_info[occupant_id]
                                occupant_username_to_notify = citizen_occupant_record["fields"].get("Username", "")
                                if occupant_username_to_notify:
                                    create_notification_for_building_occupant(
                                        tables, building_id, building_name_for_notif, occupant_username_to_notify, ai_username, 
                                        current_rent, new_rent_price, reason
                                    )
                                else:
                                    print(f"Occupant record {occupant_id} for building {building_name_for_notif} has no Username.")
                            else:
                                print(f"Occupant record {occupant_id} not found in citizens_info for building {building_name_for_notif}.")
                        
                        # Add to the list of adjustments for this AI
                        ai_rent_adjustments[ai_username].append({
                            "building_id": building_id,
                            "building_name": building_name_for_notif, # For admin summary
                            "old_rent": current_rent,
                            "new_rent": new_rent_price,
                            "reason": reason
                        })
            else:
                print(f"No valid rent adjustment decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send rent adjustment request to AI citizen {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package['citizen']['username']}")
            print(f"  - Buildings: {len(data_package['buildings'])}")
            print(f"  - Net Income: {data_package['citizen']['financial']['net_income']}")
    
    # Create admin notification with summary
    if not dry_run and any(adjustments for adjustments in ai_rent_adjustments.values()):
        create_admin_notification(tables, ai_rent_adjustments)
    else:
        print(f"[DRY RUN] Would create admin notification with rent adjustments: {ai_rent_adjustments}")
    
    print("AI rent adjustment process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_rent_adjustments(dry_run)
