import os
import sys
import json
import traceback
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import user_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.user_utils import find_user_by_identifier

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
        "users": Table(airtable_api_key, airtable_base_id, "Users"),
        "lands": Table(airtable_api_key, airtable_base_id, "LANDS"),
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_users(tables) -> List[Dict]:
    """Get all users that are marked as AI."""
    try:
        # Query users with IsAI field set to true
        formula = "{IsAI}=1"
        ai_users = tables["users"].all(formula=formula)
        print(f"Found {len(ai_users)} AI users")
        return ai_users
    except Exception as e:
        print(f"Error getting AI users: {str(e)}")
        return []

def get_user_lands(tables, username: str) -> List[Dict]:
    """Get all lands owned by a specific user."""
    try:
        # Query lands where the user is the owner
        formula = f"{{User}}='{username}'"
        lands = tables["lands"].all(formula=formula)
        print(f"Found {len(lands)} lands owned by {username}")
        return lands
    except Exception as e:
        print(f"Error getting lands for user {username}: {str(e)}")
        return []

def get_user_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings owned by a specific user."""
    try:
        # Query buildings where the user is the owner
        formula = f"{{Owner}}='{username}'"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings owned by {username}")
        return buildings
    except Exception as e:
        print(f"Error getting buildings for user {username}: {str(e)}")
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

def prepare_lease_analysis_data(ai_user: Dict, user_lands: List[Dict], user_buildings: List[Dict], buildings_on_lands: List[Dict]) -> Dict:
    """Prepare a comprehensive data package for the AI to analyze lease situations."""
    
    # Extract user information
    username = ai_user["fields"].get("Username", "")
    ducats = ai_user["fields"].get("Ducats", 0)
    
    # Process lands data
    lands_data = []
    for land in user_lands:
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
    for building in user_buildings:
        building_info = {
            "id": building["fields"].get("BuildingId", ""),
            "type": building["fields"].get("Type", ""),
            "land_id": building["fields"].get("LandId", ""),
            "lease_amount": building["fields"].get("LeaseAmount", 0),
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
            "lease_amount": building["fields"].get("LeaseAmount", 0),
            "income": building["fields"].get("Income", 0),
            "maintenance_cost": building["fields"].get("MaintenanceCost", 0),
            "owner": building["fields"].get("Owner", "")
        }
        buildings_on_ai_lands.append(building_info)
    
    # Calculate financial metrics
    total_income = sum(building["fields"].get("Income", 0) for building in user_buildings)
    total_maintenance = sum(building["fields"].get("MaintenanceCost", 0) for building in user_buildings)
    total_lease_paid = sum(building["fields"].get("LeaseAmount", 0) for building in user_buildings)
    total_lease_received = sum(building["fields"].get("LeaseAmount", 0) for building in buildings_on_lands 
                              if building["fields"].get("Owner", "") != username)
    net_income = total_income - total_maintenance - total_lease_paid + total_lease_received
    
    # Prepare the complete data package
    data_package = {
        "user": {
            "username": username,
            "ducats": ducats,
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
        "buildings": buildings_data,
        "buildings_on_lands": buildings_on_ai_lands,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_lease_adjustment_request(ai_username: str, data_package: Dict) -> Optional[Dict]:
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
        print(f"Sending lease adjustment request to AI user {ai_username}")
        print(f"API URL: {url}")
        print(f"User has {data_package['user']['ducats']} ducats")
        print(f"User owns {len(data_package['lands'])} lands and {len(data_package['buildings'])} buildings")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a landowner and building owner in La Serenissima, you need to review and adjust the lease amounts for your buildings.

Here's your current situation:
- You own {len(data_package['buildings'])} buildings
- You own {len(data_package['lands'])} lands
- Your current net income is {data_package['user']['financial']['net_income']} ducats
- You pay {data_package['user']['financial']['total_lease_paid']} ducats in leases to other landowners
- You receive {data_package['user']['financial']['total_lease_received']} ducats in leases from buildings on your lands

Please analyze your lease situation and develop a strategy for adjusting lease amounts for your buildings. Consider:
1. The income and maintenance costs of each building
2. The location and value of the land each building is on
3. Market rates for similar buildings
4. Your overall financial situation

After your analysis, provide your lease adjustment decisions in this JSON format:
```json
{{
  "lease_adjustments": [
    {{
      "building_id": "building-id-1",
      "new_lease_amount": 100,
      "reason": "brief explanation"
    }},
    {{
      "building_id": "building-id-2",
      "new_lease_amount": 200,
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
2. Consider fair market rates for different building types in different districts
3. For buildings on others' lands, ensure lease amounts are reasonable compared to the building's income
4. For buildings on your own lands, you may want to set lower lease amounts to maximize your overall profit
5. Create a specific, actionable plan with building IDs and new lease amounts
6. Provide brief reasons for each adjustment

Your decision should be specific, data-driven, and focused on maximizing your income while maintaining fair relationships with other landowners.

IMPORTANT: You must end your response with a JSON object containing your specific lease adjustment decisions.
Include the building_id, new_lease_amount, and reason for each building you want to adjust.
If you decide not to adjust any leases at this time, return an empty array.
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
                print(f"Successfully sent lease adjustment request to AI user {ai_username}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
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
                    lease_amounts = re.findall(r'"new_lease_amount"\s*:\s*(\d+)', content)
                    reasons = re.findall(r'"reason"\s*:\s*"([^"]+)"', content)
                    
                    if building_ids and lease_amounts and len(building_ids) == len(lease_amounts):
                        # Create a manually constructed decision object
                        adjustments = []
                        for i in range(len(building_ids)):
                            reason = reasons[i] if i < len(reasons) else "No reason provided"
                            adjustments.append({
                                "building_id": building_ids[i],
                                "new_lease_amount": int(lease_amounts[i]),
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
                print(f"Error processing lease adjustment request for AI user {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending lease adjustment request to AI user {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

def update_building_lease_amount(tables, building_id: str, new_lease_amount: float) -> bool:
    """Update the lease amount for a building."""
    try:
        # Find the building record
        formula = f"{{BuildingId}}='{building_id}'"
        buildings = tables["buildings"].all(formula=formula)
        
        if not buildings:
            print(f"Building {building_id} not found")
            return False
        
        building = buildings[0]
        current_lease = building["fields"].get("LeaseAmount", 0)
        
        # Update the lease amount
        tables["buildings"].update(building["id"], {
            "LeaseAmount": new_lease_amount
        })
        
        print(f"Updated lease amount for building {building_id} from {current_lease} to {new_lease_amount}")
        return True
    except Exception as e:
        print(f"Error updating lease amount for building {building_id}: {str(e)}")
        return False

def create_notification_for_building_owner(tables, building_id: str, owner: str, ai_username: str, 
                                          old_lease: float, new_lease: float, reason: str) -> bool:
    """Create a notification for the land owner about the lease adjustment."""
    try:
        now = datetime.now().isoformat()
        
        # Create the notification
        notification = {
            "User": owner,
            "Type": "lease_adjustment",
            "Content": f"The lease amount for building {building_id} on your land has been adjusted from {old_lease} to {new_lease} ducats by the building owner {ai_username}. Reason: {reason}",
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "building_id": building_id,
                "old_lease_amount": old_lease,
                "new_lease_amount": new_lease,
                "building_owner": ai_username,
                "reason": reason,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print(f"Created notification for land owner {owner} about lease adjustment")
        return True
    except Exception as e:
        print(f"Error creating notification for building owner: {str(e)}")
        return False

def create_admin_notification(tables, ai_lease_adjustments: Dict[str, List[Dict]]) -> None:
    """Create a notification for admins with the AI lease adjustment summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Lease Adjustment Summary:\n\n"
        
        for ai_name, adjustments in ai_lease_adjustments.items():
            message += f"- {ai_name}: {len(adjustments)} lease adjustments\n"
            for adj in adjustments:
                message += f"  * Building {adj['building_id']}: {adj['old_lease']} → {adj['new_lease']} ducats\n"
        
        # Create the notification
        notification = {
            "User": "NLR",  # Send to NLR as requested
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
        print("Created admin notification with AI lease adjustment summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_lease_adjustments(dry_run: bool = False):
    """Main function to process AI lease adjustments."""
    print(f"Starting AI lease adjustment process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Track lease adjustments for each AI
    ai_lease_adjustments = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
        ai_lease_adjustments[ai_username] = []
        
        # Get lands owned by this AI
        user_lands = get_user_lands(tables, ai_username)
        
        # Get buildings owned by this AI
        user_buildings = get_user_buildings(tables, ai_username)
        
        # Get all buildings on lands owned by this AI
        land_ids = [land["fields"].get("LandId") for land in user_lands if land["fields"].get("LandId")]
        buildings_on_lands = get_all_buildings_on_lands(tables, land_ids)
        
        # Prepare the data package for the AI
        data_package = prepare_lease_analysis_data(ai_user, user_lands, user_buildings, buildings_on_lands)
        
        # Send the lease adjustment request to the AI
        if not dry_run:
            decisions = send_lease_adjustment_request(ai_username, data_package)
            
            if decisions and "lease_adjustments" in decisions:
                lease_adjustments = decisions["lease_adjustments"]
                
                for adjustment in lease_adjustments:
                    building_id = adjustment.get("building_id")
                    new_lease_amount = adjustment.get("new_lease_amount")
                    reason = adjustment.get("reason", "No reason provided")
                    
                    if not building_id or new_lease_amount is None:
                        print(f"Invalid lease adjustment: {adjustment}")
                        continue
                    
                    # Find the building to get current lease amount and owner
                    building_formula = f"{{BuildingId}}='{building_id}'"
                    buildings = tables["buildings"].all(formula=building_formula)
                    
                    if not buildings:
                        print(f"Building {building_id} not found")
                        continue
                    
                    building = buildings[0]
                    current_lease = building["fields"].get("LeaseAmount", 0)
                    building_owner = building["fields"].get("Owner", "")
                    
                    # Check if the AI owns this building - if not, skip it
                    if building_owner != ai_username:
                        print(f"Skipping building {building_id} - AI {ai_username} does not own this building (owned by {building_owner})")
                        continue
                    
                    # Update the lease amount
                    success = update_building_lease_amount(tables, building_id, new_lease_amount)
                    
                    if success:
                        # Create notification for land owner if different from AI
                        land_id = building["fields"].get("LandId", "")
                        if land_id:
                            # Find the land owner
                            land_formula = f"{{LandId}}='{land_id}'"
                            lands = tables["lands"].all(formula=land_formula)
                            if lands:
                                land_owner = lands[0]["fields"].get("User", "")
                                if land_owner and land_owner != ai_username:
                                    create_notification_for_building_owner(
                                        tables, building_id, land_owner, ai_username, 
                                        current_lease, new_lease_amount, reason
                                    )
                        
                        # Add to the list of adjustments for this AI
                        ai_lease_adjustments[ai_username].append({
                            "building_id": building_id,
                            "old_lease": current_lease,
                            "new_lease": new_lease_amount,
                            "reason": reason
                        })
            else:
                print(f"No valid lease adjustment decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send lease adjustment request to AI user {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - User: {data_package['user']['username']}")
            print(f"  - Lands: {len(data_package['lands'])}")
            print(f"  - Buildings: {len(data_package['buildings'])}")
            print(f"  - Buildings on lands: {len(data_package['buildings_on_lands'])}")
            print(f"  - Net Income: {data_package['user']['financial']['net_income']}")
    
    # Create admin notification with summary
    if not dry_run and any(adjustments for adjustments in ai_lease_adjustments.values()):
        create_admin_notification(tables, ai_lease_adjustments)
    else:
        print(f"[DRY RUN] Would create admin notification with lease adjustments: {ai_lease_adjustments}")
    
    print("AI lease adjustment process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_lease_adjustments(dry_run)
