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
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
        "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
        "businesses": Table(airtable_api_key, airtable_base_id, "BUSINESSES"),
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

def get_user_businesses(tables, username: str) -> List[Dict]:
    """Get all businesses owned by a specific user."""
    try:
        # Query businesses where the user is the owner
        formula = f"{{Owner}}='{username}'"
        businesses = tables["businesses"].all(formula=formula)
        print(f"Found {len(businesses)} businesses owned by {username}")
        return businesses
    except Exception as e:
        print(f"Error getting businesses for user {username}: {str(e)}")
        return []

def get_business_buildings(tables, business_ids: List[str]) -> Dict[str, Dict]:
    """Get buildings associated with businesses, indexed by business ID."""
    try:
        if not business_ids:
            return {}
            
        # Create a formula to query buildings that have these businesses
        business_conditions = [f"{{Business}}='{business_id}'" for business_id in business_ids]
        formula = f"OR({', '.join(business_conditions)})"
        
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings for {len(business_ids)} businesses")
        
        # Index buildings by business ID
        buildings_by_business = {}
        for building in buildings:
            business_id = building["fields"].get("Business")
            if business_id:
                buildings_by_business[business_id] = building
        
        return buildings_by_business
    except Exception as e:
        print(f"Error getting buildings for businesses: {str(e)}")
        return {}

def get_business_employees(tables, business_ids: List[str]) -> Dict[str, List[Dict]]:
    """Get employees (citizens) working at businesses, indexed by business ID."""
    try:
        if not business_ids:
            return {}
            
        # Create a formula to query citizens working at these businesses
        business_conditions = [f"{{Work}}='{business_id}'" for business_id in business_ids]
        formula = f"OR({', '.join(business_conditions)})"
        
        citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(citizens)} citizens working at {len(business_ids)} businesses")
        
        # Index citizens by business ID
        employees_by_business = {}
        for citizen in citizens:
            business_id = citizen["fields"].get("Work")
            if business_id:
                if business_id not in employees_by_business:
                    employees_by_business[business_id] = []
                employees_by_business[business_id].append(citizen)
        
        return employees_by_business
    except Exception as e:
        print(f"Error getting employees for businesses: {str(e)}")
        return {}

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_wage_analysis_data(ai_user: Dict, user_businesses: List[Dict], 
                              business_buildings: Dict[str, Dict], 
                              business_employees: Dict[str, List[Dict]]) -> Dict:
    """Prepare a comprehensive data package for the AI to analyze wage situations."""
    
    # Extract user information
    username = ai_user["fields"].get("Username", "")
    ducats = ai_user["fields"].get("Ducats", 0)
    
    # Process businesses data
    businesses_data = []
    for business in user_businesses:
        business_id = business["fields"].get("BusinessId", "")
        business_type = business["fields"].get("Type", "")
        business_name = business["fields"].get("Name", "")
        wages = business["fields"].get("Wages", 0)
        income = business["fields"].get("Income", 0)
        
        # Get building information if available
        building_data = None
        if business_id in business_buildings:
            building = business_buildings[business_id]
            building_data = {
                "id": building["fields"].get("BuildingId", ""),
                "type": building["fields"].get("Type", ""),
                "rent_amount": building["fields"].get("RentAmount", 0)
            }
        
        # Get employee information if available
        employees_data = []
        if business_id in business_employees:
            for employee in business_employees[business_id]:
                employee_data = {
                    "id": employee["id"],
                    "name": f"{employee['fields'].get('FirstName', '')} {employee['fields'].get('LastName', '')}",
                    "social_class": employee["fields"].get("SocialClass", ""),
                    "wealth": employee["fields"].get("Wealth", 0)
                }
                employees_data.append(employee_data)
        
        business_info = {
            "id": business_id,
            "type": business_type,
            "name": business_name,
            "wages": wages,
            "income": income,
            "building": building_data,
            "employees": employees_data,
            "employee_count": len(employees_data)
        }
        businesses_data.append(business_info)
    
    # Calculate financial metrics
    total_income = sum(business["fields"].get("Income", 0) for business in user_businesses)
    total_wages_paid = sum(
        business["fields"].get("Wages", 0) * len(business_employees.get(business["fields"].get("BusinessId", ""), []))
        for business in user_businesses
    )
    total_rent_paid = sum(
        business_buildings.get(business["fields"].get("BusinessId", ""), {}).get("fields", {}).get("RentAmount", 0)
        for business in user_businesses
        if business["fields"].get("BusinessId", "") in business_buildings
    )
    net_income = total_income - total_wages_paid - total_rent_paid
    
    # Prepare the complete data package
    data_package = {
        "user": {
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
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_wage_adjustment_request(ai_username: str, data_package: Dict) -> Optional[Dict]:
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
        print(f"Sending wage adjustment request to AI user {ai_username}")
        print(f"API URL: {url}")
        print(f"User has {data_package['user']['ducats']} ducats")
        print(f"User owns {len(data_package['businesses'])} businesses")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a business owner in La Serenissima, you need to review and adjust the wage amounts for your businesses.

Here's your current situation:
- You own {len(data_package['businesses'])} businesses
- Your current net income is {data_package['user']['financial']['net_income']} ducats
- You pay {data_package['user']['financial']['total_wages_paid']} ducats in wages to your employees
- You pay {data_package['user']['financial']['total_rent_paid']} ducats in rent for your business buildings

Please analyze your wage situation and develop a strategy for adjusting wage amounts for your businesses. Consider:
1. The income and expenses of each business
2. The social class and wealth of current employees
3. The need to attract and retain quality workers
4. Market rates for similar businesses
5. Your overall financial situation

After your analysis, provide your wage adjustment decisions in this JSON format:
```json
{{
  "wage_adjustments": [
    {{
      "business_id": "business-id-1",
      "new_wage_amount": 100,
      "reason": "brief explanation"
    }},
    {{
      "business_id": "business-id-2",
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
You are {ai_username}, an AI business owner in La Serenissima. You make your own decisions about wage strategies.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your wage adjustment strategy:
1. Analyze each business's profitability (income minus expenses)
2. Consider the social class and wealth of current employees
3. Balance the need to maximize profits with the need to retain employees
4. Consider the impact of wages on employee satisfaction and productivity
5. Create a specific, actionable plan with business IDs and new wage amounts
6. Provide brief reasons for each adjustment

Your decision should be specific, data-driven, and focused on maximizing your income while maintaining a stable workforce.

IMPORTANT: You must end your response with a JSON object containing your specific wage adjustment decisions.
Include the business_id, new_wage_amount, and reason for each business you want to adjust.
If you decide not to adjust any wages at this time, return an empty array.
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
                print(f"Successfully sent wage adjustment request to AI user {ai_username}")
                
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
                print(f"Error processing wage adjustment request for AI user {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending wage adjustment request to AI user {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

def update_business_wage_amount(tables, business_id: str, new_wage_amount: float) -> bool:
    """Update the wage amount for a business."""
    try:
        # Find the business record
        formula = f"{{BusinessId}}='{business_id}'"
        businesses = tables["businesses"].all(formula=formula)
        
        if not businesses:
            print(f"Business {business_id} not found")
            return False
        
        business = businesses[0]
        current_wage = business["fields"].get("Wages", 0)
        
        # Update the wage amount
        tables["businesses"].update(business["id"], {
            "Wages": new_wage_amount
        })
        
        print(f"Updated wage amount for business {business_id} from {current_wage} to {new_wage_amount}")
        return True
    except Exception as e:
        print(f"Error updating wage amount for business {business_id}: {str(e)}")
        return False

def create_notification_for_business_employee(tables, business_id: str, employee_id: str, ai_username: str, 
                                             old_wage: float, new_wage: float, reason: str) -> bool:
    """Create a notification for a business employee about the wage adjustment."""
    try:
        # Get the employee's user ID
        formula = f"RECORD_ID()='{employee_id}'"
        citizens = tables["citizens"].all(formula=formula)
        
        if not citizens:
            print(f"Citizen {employee_id} not found")
            return False
        
        citizen = citizens[0]
        user_id = citizen["fields"].get("User", "")
        
        if not user_id:
            print(f"Citizen {employee_id} has no associated user, skipping notification")
            return False
        
        now = datetime.now().isoformat()
        
        # Get business name
        business_name = "your workplace"
        formula = f"{{BusinessId}}='{business_id}'"
        businesses = tables["businesses"].all(formula=formula)
        if businesses:
            business_name = businesses[0]["fields"].get("Name", "your workplace")
        
        # Create the notification
        notification = {
            "User": user_id,
            "Type": "wage_adjustment",
            "Content": f"Your wage at {business_name} has been adjusted from {old_wage} to {new_wage} ducats by the business owner {ai_username}. Reason: {reason}",
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "business_id": business_id,
                "business_name": business_name,
                "old_wage_amount": old_wage,
                "new_wage_amount": new_wage,
                "business_owner": ai_username,
                "reason": reason,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print(f"Created notification for employee {user_id} about wage adjustment")
        return True
    except Exception as e:
        print(f"Error creating notification for employee: {str(e)}")
        return False

def create_admin_notification(tables, ai_wage_adjustments: Dict[str, List[Dict]]) -> None:
    """Create a notification for admins with the AI wage adjustment summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Wage Adjustment Summary:\n\n"
        
        for ai_name, adjustments in ai_wage_adjustments.items():
            message += f"- {ai_name}: {len(adjustments)} wage adjustments\n"
            for adj in adjustments:
                message += f"  * Business {adj['business_id']}: {adj['old_wage']} → {adj['new_wage']} ducats\n"
        
        # Create the notification
        notification = {
            "User": "NLR",  # Send to NLR as requested
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
        print("Created admin notification with AI wage adjustment summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_wage_adjustments(dry_run: bool = False):
    """Main function to process AI wage adjustments."""
    print(f"Starting AI wage adjustment process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Track wage adjustments for each AI
    ai_wage_adjustments = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
        ai_wage_adjustments[ai_username] = []
        
        # Get businesses owned by this AI
        user_businesses = get_user_businesses(tables, ai_username)
        
        if not user_businesses:
            print(f"AI user {ai_username} has no businesses, skipping")
            continue
        
        # Get business IDs
        business_ids = [business["fields"].get("BusinessId") for business in user_businesses 
                       if business["fields"].get("BusinessId")]
        
        # Get buildings associated with these businesses
        business_buildings = get_business_buildings(tables, business_ids)
        
        # Get employees working at these businesses
        business_employees = get_business_employees(tables, business_ids)
        
        # Prepare the data package for the AI
        data_package = prepare_wage_analysis_data(ai_user, user_businesses, business_buildings, business_employees)
        
        # Send the wage adjustment request to the AI
        if not dry_run:
            decisions = send_wage_adjustment_request(ai_username, data_package)
            
            if decisions and "wage_adjustments" in decisions:
                wage_adjustments = decisions["wage_adjustments"]
                
                for adjustment in wage_adjustments:
                    business_id = adjustment.get("business_id")
                    new_wage_amount = adjustment.get("new_wage_amount")
                    reason = adjustment.get("reason", "No reason provided")
                    
                    if not business_id or new_wage_amount is None:
                        print(f"Invalid wage adjustment: {adjustment}")
                        continue
                    
                    # Find the business to get current wage amount
                    business_formula = f"{{BusinessId}}='{business_id}'"
                    businesses = tables["businesses"].all(formula=business_formula)
                    
                    if not businesses:
                        print(f"Business {business_id} not found")
                        continue
                    
                    business = businesses[0]
                    current_wage = business["fields"].get("Wages", 0)
                    
                    # Check if the AI owns this business - if not, skip it
                    business_owner = business["fields"].get("Owner", "")
                    if business_owner != ai_username:
                        print(f"Skipping business {business_id} - AI {ai_username} does not own this business (owned by {business_owner})")
                        continue
                    
                    # Update the wage amount
                    success = update_business_wage_amount(tables, business_id, new_wage_amount)
                    
                    if success:
                        # Create notifications for employees
                        if business_id in business_employees:
                            for employee in business_employees[business_id]:
                                create_notification_for_business_employee(
                                    tables, business_id, employee["id"], ai_username, 
                                    current_wage, new_wage_amount, reason
                                )
                        
                        # Add to the list of adjustments for this AI
                        ai_wage_adjustments[ai_username].append({
                            "business_id": business_id,
                            "old_wage": current_wage,
                            "new_wage": new_wage_amount,
                            "reason": reason
                        })
            else:
                print(f"No valid wage adjustment decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send wage adjustment request to AI user {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - User: {data_package['user']['username']}")
            print(f"  - Businesses: {len(data_package['businesses'])}")
            print(f"  - Net Income: {data_package['user']['financial']['net_income']}")
    
    # Create admin notification with summary
    if not dry_run and any(adjustments for adjustments in ai_wage_adjustments.values()):
        create_admin_notification(tables, ai_wage_adjustments)
    else:
        print(f"[DRY RUN] Would create admin notification with wage adjustments: {ai_wage_adjustments}")
    
    print("AI wage adjustment process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_wage_adjustments(dry_run)
