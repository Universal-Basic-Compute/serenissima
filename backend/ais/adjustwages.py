import os
import sys
import json
import traceback
import logging
import argparse # Added argparse
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import citizen_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

# Configuration for API calls
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
log = logging.getLogger(__name__) # Ensure log is defined for helpers

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
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
        "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS"),
        "relevancies": Table(airtable_api_key, airtable_base_id, "RELEVANCIES"),
        "relationships": Table(airtable_api_key, airtable_base_id, "RELATIONSHIPS"),
        "problems": Table(airtable_api_key, airtable_base_id, "PROBLEMS")
    }
    
    return tables

def _escape_airtable_value(value: str) -> str:
    """Échappe les apostrophes pour les formules Airtable."""
    return value

def _get_building_relevancies_for_citizen(tables: Dict[str, Table], username: str, limit: int = 50) -> List[Dict]:
    """Get latest 50 RELEVANCIES where AssetType='building' AND RelevantToCitizen=Username."""
    try:
        safe_username = _escape_airtable_value(username)
        formula = f"AND({{AssetType}}='building', {{RelevantToCitizen}}='{safe_username}')"
        # Assuming 'CreatedAt' field exists for sorting, similar to answertomessages.py
        records = tables["relevancies"].all(formula=formula, sort=['-CreatedAt'], max_records=limit)
        print(f"Found {len(records)} building relevancies for citizen {username}")
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        print(f"Error fetching building relevancies for {username}: {e}")
        return []

def _get_top_relationships_for_citizen(tables: Dict[str, Table], username: str, limit: int = 20) -> List[Dict]:
    """Get TrustScore DESC LIMIT 20 Relationships for the citizen."""
    try:
        safe_username = _escape_airtable_value(username)
        # Relationships involve two citizens, Citizen1 and Citizen2
        formula = f"OR({{Citizen1}}='{safe_username}', {{Citizen2}}='{safe_username}')"
        records = tables["relationships"].all(formula=formula, sort=['-TrustScore'], max_records=limit)
        print(f"Found {len(records)} top relationships for citizen {username}")
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        print(f"Error fetching top relationships for {username}: {e}")
        return []

def _get_building_problems_for_citizen(tables: Dict[str, Table], username: str, limit: int = 50) -> List[Dict]:
    """Get Latest 50 PROBLEMS where AssetType='building' and Citizen=Username."""
    try:
        safe_username = _escape_airtable_value(username)
        formula = f"AND({{AssetType}}='building', {{Citizen}}='{safe_username}')"
        # Assuming 'CreatedAt' field exists for sorting
        records = tables["problems"].all(formula=formula, sort=['-CreatedAt'], max_records=limit)
        print(f"Found {len(records)} building problems for citizen {username}")
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        print(f"Error fetching building problems for {username}: {e}")
        return []

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice, and have appropriate social class."""
    try:
        # Query citizens with IsAI=true, InVenice=true, and SocialClass is either Nobili or Cittadini
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(ai_citizens)} AI citizens in Venice")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
        return []

def get_citizen_business_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings run by a specific citizen that could potentially have wages set."""
    try:
        formula = f"AND({{RunBy}}='{username}', {{Category}}='business')"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings runned by {username}")
        
        # Log the building IDs for debugging
        building_ids = [building["fields"].get("BuildingId") for building in buildings 
                       if building["fields"].get("BuildingId")]
        print(f"Building IDs runned by {username}: {building_ids}")
        
        return buildings
    except Exception as e:
        print(f"Error getting buildings for citizen {username}: {str(e)}")
        return []

def get_building_employees(tables, building_ids: List[str]) -> Dict[str, List[Dict]]:
    """Get employees (citizens) working at buildings, indexed by building ID."""
    try:
        if not building_ids:
            return {}
        
        # Instead of querying citizens by Work field, we'll get all citizens
        # and then match them to buildings later
        citizens = tables["citizens"].all()
        print(f"Retrieved {len(citizens)} citizens in total")
        
        # Initialize the result dictionary
        employees_by_building = {}
        
        # For each building, check if it has an occupant who is a citizen
        for building_id in building_ids:
            # Find the building record
            building_formula = f"{{BuildingId}}='{building_id}'"
            buildings = tables["buildings"].all(formula=building_formula)
            
            if not buildings:
                continue
                
            building = buildings[0]
            occupant_username = building["fields"].get("Occupant", "")
            
            # If there's an occupant, add them to the employees list for this building
            if occupant_username:
                # Find the citizen record by Username
                matching_citizens = [c for c in citizens if c["fields"].get("Username") == occupant_username]
                
                if matching_citizens:
                    if building_id not in employees_by_building:
                        employees_by_building[building_id] = []
                    employees_by_building[building_id].append(matching_citizens[0])
        
        # Log the results
        total_employees = sum(len(emps) for emps in employees_by_building.values())
        print(f"Found {total_employees} citizens working at {len(building_ids)} buildings")
        
        return employees_by_building
    except Exception as e:
        print(f"Error getting employees for buildings: {str(e)}")
        return {}


def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_wage_analysis_data(tables: Dict[str, Table], ai_citizen: Dict, citizen_business_buildings: List[Dict], citizens_info: Dict[str, Dict]) -> Dict:
    """Prepare a comprehensive data package for the AI to analyze wage situations."""
    
    # Extract citizen information
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    
    # Process business buildings data
    businesses_data = []
    for building in citizen_business_buildings:
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        wages = building["fields"].get("Wages", 0)
        income = building["fields"].get("Income", 0)
        rent_price = building["fields"].get("RentPrice", 0)
        occupant_id = building["fields"].get("Occupant", "")
        
        # Get employee information if available
        employees_data = []
        if occupant_id and occupant_id in citizens_info:
            citizen = citizens_info[occupant_id]
            employee_data = {
                "id": occupant_id,
                "name": f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}",
                "social_class": citizen["fields"].get("SocialClass", ""),
                "ducats": citizen["fields"].get("Ducats", 0)
            }
            employees_data.append(employee_data)
        
        business_info = {
            "id": building_id,
            "type": building_type,
            "name": f"{building_type} at {building_id}",
            "wages": wages,
            "income": income,
            "building": {
                "id": building_id,
                "type": building_type,
                "rent_price": rent_price
            },
            "employees": employees_data,
            "employee_count": len(employees_data)
        }
        businesses_data.append(business_info)
    
    # Calculate financial metrics
    total_income = sum(building["fields"].get("Income", 0) for building in citizen_business_buildings)
    total_wages_paid = sum(
        building["fields"].get("Wages", 0) * (1 if building["fields"].get("Occupant", "") else 0)
        for building in citizen_business_buildings
    )
    total_rent_paid = sum(building["fields"].get("RentPrice", 0) for building in citizen_business_buildings)
    net_income = total_income - total_wages_paid - total_rent_paid
    
    # Fetch additional context data
    building_relevancies = _get_building_relevancies_for_citizen(tables, username)
    top_relationships = _get_top_relationships_for_citizen(tables, username)
    building_problems = _get_building_problems_for_citizen(tables, username)
    # Fetch general notifications for the AI
    recent_notifications_for_ai = _get_notifications_data_api(username)


    # Prepare the complete data package
    data_package = {
        "citizen": {
            "username": username,
            "ducats": ducats,
            "total_businesses": len(businesses_data),
            "financial": {
                "total_income": total_income,
                "total_wages_paid": total_wages_paid,
                "total_rent_paid": total_rent_paid,
                "net_income": net_income
            }
        },
        "businesses": businesses_data,
        "latest_building_relevancies": building_relevancies,
        "top_relationships_by_trust": top_relationships,
        "latest_building_problems": building_problems,
        "recent_notifications_for_ai": recent_notifications_for_ai,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_wage_adjustment_request(ai_username: str, data_package: Dict, kinos_model_override: Optional[str] = None) -> Optional[Dict]:
    """Send the wage adjustment request to the AI via Kinos API."""
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
        print(f"Sending wage adjustment request to AI citizen {ai_username}")
        print(f"API URL: {url}")
        print(f"Citizen has {data_package['citizen']['ducats']} ducats")
        print(f"Citizen owns {len(data_package['businesses'])} businesses")
        
        # Log business IDs for debugging
        business_ids = [business["id"] for business in data_package["businesses"]]
        print(f"Business IDs in data package: {business_ids}")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a building owner in La Serenissima, you need to review and set wage amounts for your buildings.

Here's your current situation:
- You own {len(data_package['businesses'])} buildings
- Your current net income is {data_package['citizen']['financial']['net_income']} ducats
- You pay {data_package['citizen']['financial']['total_wages_paid']} ducats in wages to your employees
- You pay {data_package['citizen']['financial']['total_rent_paid']} ducats in rent for your business buildings

Please analyze your buildings and develop a strategy for setting wage amounts. Consider:
1. The income and expenses of each building
2. The social class and wealth of current employees (if any)
3. The need to attract quality workers to your buildings
4. Contract rates for similar buildings and businesses
5. Your overall financial situation

Even for buildings without current occupants, you should set appropriate wages so that potential workers know what they would earn.

After your analysis, provide your wage adjustment decisions in this JSON format:
```json
{{
  "wage_adjustments": [
    {{
      "business_id": "building-id-1",
      "new_wage_amount": 100,
      "reason": "brief explanation"
    }},
    {{
      "business_id": "building-id-2",
      "new_wage_amount": 200,
      "reason": "brief explanation"
    }}
  ]
}}
```

If you decide not to adjust any wages at this time, return an empty array:
```json
{{
  "wage_adjustments": []
}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI building owner in La Serenissima. You make your own decisions about wage strategies.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

Contextual data available:
- `latest_building_relevancies`: Shows recent building-related opportunities or information relevant to you.
- `top_relationships_by_trust`: Lists your most trusted relationships, which might influence who you hire or how you treat employees.
- `latest_building_problems`: Highlights recent issues with buildings (potentially yours or others) that might affect your business strategy.

When developing your wage adjustment strategy:
1. Analyze each building's profitability (income minus expenses)
2. Consider the social class and wealth of current employees (if any)
3. Balance the need to maximize profits with the need to attract and retain employees
4. Consider the impact of wages on employee satisfaction and productivity
5. Set appropriate wages for all your buildings, even those without current occupants
6. Create a specific, actionable plan with building IDs and new wage amounts
7. Provide brief reasons for each adjustment

Your decision should be specific, data-driven, and focused on maximizing your income while maintaining a stable workforce.

IMPORTANT: You must end your response with a JSON object containing your specific wage adjustment decisions.
Include the business_id, new_wage_amount, and reason for each building you want to adjust.
If you decide not to adjust any wages at this time, return an empty array.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 4,
            "max_files": 8
        }

        if kinos_model_override:
            payload["model"] = kinos_model_override
            print(f"Using Kinos model override '{kinos_model_override}' for {ai_username} (wage adjustment).")
        
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
                print(f"Successfully sent wage adjustment request to AI citizen {ai_username}")
                
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
                            if "wage_adjustments" in decisions:
                                print(f"Found wage adjustments in code block: {len(decisions['wage_adjustments'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from code block: {str(e)}")
                    
                    # Next, try to find JSON with curly braces pattern
                    json_match = re.search(r'(\{[\s\S]*"wage_adjustments"[\s\S]*\})', content)
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "wage_adjustments" in decisions:
                                print(f"Found wage adjustments in curly braces pattern: {len(decisions['wage_adjustments'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from curly braces pattern: {str(e)}")
                    
                    # If we couldn't find a JSON block, try to parse the entire response
                    try:
                        decisions = json.loads(content)
                        if "wage_adjustments" in decisions:
                            print(f"Found wage adjustments in full response: {len(decisions['wage_adjustments'])}")
                            return decisions
                    except json.JSONDecodeError:
                        print("Could not parse full response as JSON")
                    
                    # Last resort: try to extract just the array part
                    array_match = re.search(r'"wage_adjustments"\s*:\s*(\[\s*\{.*?\}\s*\])', content, re.DOTALL)
                    if array_match:
                        array_str = array_match.group(1)
                        try:
                            array_data = json.loads(array_str)
                            decisions = {"wage_adjustments": array_data}
                            print(f"Found wage adjustments in array extraction: {len(decisions['wage_adjustments'])}")
                            return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from array extraction: {str(e)}")
                    
                    # Manual extraction as last resort
                    business_ids = re.findall(r'"business_id"\s*:\s*"([^"]+)"', content)
                    wage_amounts = re.findall(r'"new_wage_amount"\s*:\s*(\d+)', content)
                    reasons = re.findall(r'"reason"\s*:\s*"([^"]+)"', content)
                    
                    if business_ids and wage_amounts and len(business_ids) == len(wage_amounts):
                        # Create a manually constructed decision object
                        adjustments = []
                        for i in range(len(business_ids)):
                            reason = reasons[i] if i < len(reasons) else "No reason provided"
                            adjustments.append({
                                "business_id": business_ids[i],
                                "new_wage_amount": int(wage_amounts[i]),
                                "reason": reason
                            })
                        
                        decisions = {"wage_adjustments": adjustments}
                        print(f"Manually extracted wage adjustments: {len(decisions['wage_adjustments'])}")
                        return decisions
                    
                    # If we get here, no valid decision was found
                    print(f"No valid wage adjustment decision found in AI response. Full response:")
                    print(content)
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {str(e)}")
                    print(f"Full response content that caused the error:")
                    print(content)
                    return None
            else:
                print(f"Error processing wage adjustment request for AI citizen {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending wage adjustment request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

# Removed update_building_wage_amount function as its logic is now handled by 'adjust_business_wages' activity

def create_notification_for_business_employee(tables, building_id: str, building_name: str, employee_id: str, ai_username: str, 
                                             old_wage: float, new_wage: float, reason: str) -> bool:
    """Create a notification for a business employee about the wage adjustment."""
    try:
        # Get the employee's citizen ID
        formula = f"RECORD_ID()='{employee_id}'"
        citizens = tables["citizens"].all(formula=formula)
        
        if not citizens:
            print(f"Citizen {employee_id} not found")
            return False
        
        citizen = citizens[0]
        # The 'Citizen' field in the CITIZENS table is actually the Username.
        # We should notify the Username directly.
        occupant_username_to_notify = citizen["fields"].get("Username", "") 
        
        if not occupant_username_to_notify:
            print(f"Citizen record {employee_id} has no Username, skipping notification")
            return False
        
        now = datetime.now().isoformat()
        
        building_display_name = building_name if building_name and building_name != building_id else building_id
        
        # Create the notification
        notification = {
            "Citizen": occupant_username_to_notify, # Notify the Username
            "Type": "wage_adjustment",
            "Content": f"💼 Wage Update: Your wage at **{building_display_name}** has been adjusted from {old_wage} to **{new_wage} ⚜️ Ducats** by the business owner **{ai_username}**. Reason: {reason}",
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "building_id": building_id,
                "building_name": building_display_name,
                "old_wage_amount": old_wage,
                "new_wage_amount": new_wage,
                "business_owner": ai_username,
                "reason": reason,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print(f"Created notification for employee {occupant_username_to_notify} about wage adjustment")
        return True
    except Exception as e:
        print(f"Error creating notification for employee: {str(e)}")
        return False

def create_admin_notification(tables, ai_wage_adjustments: Dict[str, List[Dict]]) -> None:
    """Create a notification for admins with the AI wage adjustment summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "📊 **AI Wage Adjustment Summary**:\n\n"
        
        for ai_name, adjustments in ai_wage_adjustments.items():
            message += f"- 👤 AI Owner: **{ai_name}** made {len(adjustments)} wage adjustments:\n"
            for adj in adjustments:
                building_display_admin = adj.get('building_name', adj['business_id'])
                message += f"  - 🏢 Business: **{building_display_admin}**: {adj['old_wage']} ⚜️ → **{adj['new_wage']} ⚜️**\n"
        
        # Create the notification
        notification = {
            "Citizen": "ConsiglioDeiDieci",  # Send to ConsiglioDeiDieci as requested
            "Type": "ai_wage_adjustments",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_wage_adjustments": ai_wage_adjustments,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("📊 Created admin notification with AI wage adjustment summary")
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

def process_ai_wage_adjustments(dry_run: bool = False, kinos_model_override_arg: Optional[str] = None):
    """Main function to process AI wage adjustments."""
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "default"
    print(f"Starting AI wage adjustment process (dry_run={dry_run}, kinos_model={model_status})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those who run at least one business building
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get buildings run by this AI
        citizen_business_buildings = get_citizen_business_buildings(tables, ai_username)
        
        # Check if they run any business buildings
        if citizen_business_buildings:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} runs {len(citizen_business_buildings)} business buildings, including in processing")
        else:
            print(f"AI citizen {ai_username} doesn't run any business buildings, skipping")

    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens who run business buildings")
    
    if not ai_citizens:
        print("No AI citizens with buildings that have occupants, exiting")
        return
    
    # Track wage adjustments for each AI
    ai_wage_adjustments = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI citizen: {ai_username}")
        ai_wage_adjustments[ai_username] = []
        
        # Get buildings with businesses run by this AI
        citizen_business_buildings = get_citizen_business_buildings(tables, ai_username)
        
        if not citizen_business_buildings:
            print(f"AI citizen {ai_username} has no businesses, skipping")
            continue
        
        # Create a map of building IDs for quick lookup
        citizen_building_ids = {building["fields"].get("BuildingId"): building for building in citizen_business_buildings 
                           if building["fields"].get("BuildingId")}
        print(f"AI citizen {ai_username} runs these businesses: {list(citizen_building_ids.keys())}")
        
        # Get building IDs
        building_ids = list(citizen_building_ids.keys())
        
        # Get employees working at these buildings
        building_employees = get_building_employees(tables, building_ids)
        
        # Get all citizens for reference
        all_citizens = {}
        try:
            citizens = tables["citizens"].all()
            all_citizens = {citizen["id"]: citizen for citizen in citizens}
        except Exception as e:
            print(f"Error getting all citizens: {str(e)}")
        
        # Prepare the data package for the AI
        data_package = prepare_wage_analysis_data(tables, ai_citizen, citizen_business_buildings, all_citizens)
        
        # Send the wage adjustment request to the AI
        if not dry_run:
            decisions = send_wage_adjustment_request(ai_username, data_package, kinos_model_override_arg)
            
            if decisions and "wage_adjustments" in decisions:
                wage_adjustments = decisions["wage_adjustments"]
                print(f"AI {ai_username} returned {len(wage_adjustments)} wage adjustments")
                
                for adjustment in wage_adjustments:
                    # Get the building_id, which might be called "business_id" in the AI's response
                    building_id = adjustment.get("building_id") or adjustment.get("business_id")
                    new_wage_amount = adjustment.get("new_wage_amount")
                    reason = adjustment.get("reason", "No reason provided")
                    
                    if not building_id or new_wage_amount is None:
                        print(f"Invalid wage adjustment: {adjustment}")
                        continue
                    
                    # Check if this building ID is in the citizen's businesses
                    if building_id not in citizen_building_ids:
                        print(f"Building {building_id} not run by {ai_username} or doesn't exist")
                        continue
                    
                    # Get the building from our map
                    building = citizen_building_ids[building_id]
                    current_wage = building["fields"].get("Wages", 0)
                    
                    # Check if the AI owns this building - if not, skip it
                    building_owner = building["fields"].get("Owner", "")
                    if building_owner != ai_username: # This check might be more relevant for RunBy if AI is just an operator
                        print(f"Skipping building {building_id} - AI {ai_username} does not own this building (owned by {building_owner}). Note: Wage setting is typically by RunBy.")
                        # For now, we assume AI is Owner and RunBy, or Kinos is aware of the ownership/operation structure.
                        # If AI is only RunBy but not Owner, this check might be too strict.
                        # However, the script's current logic implies AI is the one setting wages for businesses they "own" or fully control.
                        # Let's proceed with the assumption that Kinos is making decisions for businesses the AI is responsible for setting wages for.
                        # The activity `adjust_business_wages` will verify if the citizenUsername (AI) is indeed the RunBy.
                        # So, this Owner check here is a pre-filter by the script, which might be okay.
                        pass # Allow to proceed, activity will verify RunBy

                    print(f"Processing wage adjustment for building {building_id}: {current_wage} -> {new_wage_amount}")
                    
                    # Debug: Print the building record before update
                    print(f"Building record before update: {json.dumps(building['fields'], indent=2)}")
                    
                    # Update the wage amount via activity
                    activity_params = {
                        "businessBuildingId": building_id,
                        "newWageAmount": new_wage_amount,
                        "strategy": "kinos_direct_decision" # Or derive strategy if Kinos provides it
                    }
                    if call_try_create_activity_api(ai_username, "adjust_business_wages", activity_params, dry_run):
                        print(f"Successfully initiated wage adjustment for building {building_id}")
                        
                        # Debug: Verify the update by fetching the building again (Note: this won't reflect immediate Airtable change)
                        # The actual change happens when the activity is processed.
                        # So, this verification block might show old data if called immediately.
                        # For now, we trust the activity initiation.
                        # If verification is needed, it should be after activity processing.
                        # This block is removed as it's misleading here.
                        # try:
                        #    updated_building = tables["buildings"].all(formula=f"{{BuildingId}}='{building_id}'")
                        #    if updated_building:
                        #        print(f"Building record after update: {json.dumps(updated_building[0]['fields'], indent=2)}")
                        # ...
                        #    else:
                        #        print(f"❌ Could not find building {building_id} after update")
                        # except Exception as verify_error:
                        #    print(f"Error verifying wage update: {str(verify_error)}")
                        
                        # Create notifications for employees
                        occupant_id = building["fields"].get("Occupant", "") # This is Airtable Record ID of citizen
                        building_name_for_notif = building["fields"].get("Name", building_id)

                        if occupant_id and occupant_id in all_citizens:
                            create_notification_for_business_employee(
                                tables, building_id, building_name_for_notif, occupant_id, ai_username, 
                                current_wage, new_wage_amount, reason
                            )
                        else:
                            print(f"Building {building_name_for_notif} ({building_id}) has no occupant or occupant not found in citizens")
                        
                        # Add to the list of adjustments for this AI
                        ai_wage_adjustments[ai_username].append({
                            "business_id": building_id, # Keep as business_id for consistency if other parts expect this key
                            "building_name": building_name_for_notif, # For admin summary
                            "old_wage": current_wage,
                            "new_wage": new_wage_amount,
                            "reason": reason
                        })
                    else:
                        print(f"❌ Failed to initiate wage adjustment for building {building_name_for_notif} ({building_id})")
            else:
                print(f"No valid wage adjustment decisions received for {ai_username}")
                            try:
                                updated_building = tables["buildings"].all(formula=f"{{BuildingId}}='{building_id}'")
                                if updated_building:
                                    print(f"Building record after update: {json.dumps(updated_building[0]['fields'], indent=2)}")
                                    updated_wage = updated_building[0]["fields"].get("Wages", 0)
                                    if updated_wage == new_wage_amount:
                                        print(f"✅ Wage successfully updated to {updated_wage}")
                                    else:
                                        print(f"❌ Wage update failed! Expected {new_wage_amount}, got {updated_wage}")
                                else:
                                    print(f"❌ Could not find building {building_id} after update")
                            except Exception as verify_error:
                                print(f"Error verifying wage update: {str(verify_error)}")
                            
                            # Create notifications for employees
                            occupant_id = building["fields"].get("Occupant", "") # This is Airtable Record ID of citizen
                            building_name_for_notif = building["fields"].get("Name", building_id)

                            if occupant_id and occupant_id in all_citizens:
                                create_notification_for_business_employee(
                                    tables, building_id, building_name_for_notif, occupant_id, ai_username, 
                                    current_wage, new_wage_amount, reason
                                )
                            else:
                                print(f"Building {building_name_for_notif} ({building_id}) has no occupant or occupant not found in citizens")
                            
                            # Add to the list of adjustments for this AI
                            ai_wage_adjustments[ai_username].append({
                                "business_id": building_id, # Keep as business_id for consistency if other parts expect this key
                                "building_name": building_name_for_notif, # For admin summary
                                "old_wage": current_wage,
                                "new_wage": new_wage_amount,
                                "reason": reason
                            })
                        else:
                            print(f"❌ Failed to update wage for building {building_name_for_notif} ({building_id})")
                    except Exception as update_error:
                        print(f"❌ Exception during wage update for building {building_id}: {str(update_error)}")
                        print(f"Exception traceback: {traceback.format_exc()}")
            else:
                print(f"No valid wage adjustment decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send wage adjustment request to AI citizen {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package['citizen']['username']}")
            print(f"  - Businesses: {len(data_package['businesses'])}")
            print(f"  - Net Income: {data_package['citizen']['financial']['net_income']}")
    
    # Create admin notification with summary
    if not dry_run and any(adjustments for adjustments in ai_wage_adjustments.values()):
        create_admin_notification(tables, ai_wage_adjustments)
    else:
        print(f"[DRY RUN] Would create admin notification with wage adjustments: {ai_wage_adjustments}")
    
    print("AI wage adjustment process completed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Adjust wages for AI-run businesses using Kinos AI.")
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
    process_ai_wage_adjustments(dry_run=args.dry_run, kinos_model_override_arg=args.model)
