import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple
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

def get_all_buildings(tables) -> List[Dict]:
    """Get all buildings from Airtable."""
    try:
        buildings = tables["buildings"].all()
        print(f"Found {len(buildings)} buildings in total")
        return buildings
    except Exception as e:
        print(f"Error getting buildings: {str(e)}")
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

def get_building_types_info() -> Dict:
    """Get information about different building types and their income potential."""
    # This could be loaded from a JSON file or database in the future
    return {
        "house": {
            "income": 10,
            "maintenance": 2,
            "description": "Basic housing for citizens"
        },
        "workshop": {
            "income": 25,
            "maintenance": 5,
            "description": "Small production facility for crafts and goods"
        },
        "market-stall": {
            "income": 15,
            "maintenance": 3,
            "description": "Small commercial space for selling goods"
        },
        "warehouse": {
            "income": 20,
            "maintenance": 4,
            "description": "Storage facility for goods and resources"
        },
        "tavern": {
            "income": 30,
            "maintenance": 6,
            "description": "Establishment for food, drink, and socializing"
        },
        "dock": {
            "income": 40,
            "maintenance": 8,
            "description": "Maritime facility for loading/unloading ships"
        },
        "church": {
            "income": 15,
            "maintenance": 10,
            "description": "Religious building that provides community benefits"
        },
        "palace": {
            "income": 50,
            "maintenance": 15,
            "description": "Prestigious building for nobility and governance"
        }
    }

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_ai_building_strategy(ai_user: Dict, user_lands: List[Dict], user_buildings: List[Dict], all_buildings: List[Dict]) -> Dict:
    """Prepare a comprehensive data package for the AI to make building decisions."""
    
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
    
    # Process buildings data
    buildings_data = []
    for building in user_buildings:
        building_info = {
            "id": building["fields"].get("BuildingId", ""),
            "type": building["fields"].get("Type", ""),
            "land_id": building["fields"].get("LandId", ""),
            "position": building["fields"].get("Position", ""),
            "income": building["fields"].get("Income", 0),
            "maintenance_cost": building["fields"].get("MaintenanceCost", 0)
        }
        buildings_data.append(building_info)
    
    # Get building types information
    building_types = get_building_types_info()
    
    # Create a summary of buildings by type
    building_summary = {}
    for building in user_buildings:
        building_type = building["fields"].get("Type", "unknown")
        if building_type not in building_summary:
            building_summary[building_type] = 0
        building_summary[building_type] += 1
    
    # Calculate financial metrics
    total_income = sum(building["fields"].get("Income", 0) for building in user_buildings)
    total_maintenance = sum(building["fields"].get("MaintenanceCost", 0) for building in user_buildings)
    net_income = total_income - total_maintenance
    
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
                "net_income": net_income
            },
            "building_summary": building_summary
        },
        "lands": lands_data,
        "buildings": buildings_data,
        "building_types": building_types,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_building_strategy_request(ai_username: str, data_package: Dict) -> bool:
    """Send the building strategy request to the AI via Kinos API."""
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
        
        # Create a detailed prompt for the AI
        prompt = f"""
I need your help to develop a building strategy for maximizing income in La Serenissima.

Here is my current situation:
- I own {len(data_package['lands'])} lands
- I have {len(data_package['buildings'])} buildings
- My current net income is {data_package['user']['financial']['net_income']} ducats
- I have {data_package['user']['ducats']} ducats available

Please analyze the data provided and help me:
1. Evaluate my current building portfolio
2. Identify opportunities for new buildings that would maximize income
3. Suggest specific building types and locations based on my lands
4. Create a prioritized building plan that considers my available ducats

Focus on maximizing income while maintaining a sustainable maintenance cost.
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are advising {ai_username}, an AI landowner in La Serenissima, on building strategy.

Here is the complete data about their current situation:
{json.dumps(data_package, indent=2)}

When developing your building strategy recommendations:
1. Analyze which lands have the most building potential (consider building points and water access)
2. Evaluate which building types would generate the most income based on their situation
3. Consider the maintenance costs of different building types
4. Prioritize buildings that have the best income-to-maintenance ratio
5. Create a specific, actionable plan with building types and target lands
6. Consider the available ducats when making recommendations

Your advice should be specific, data-driven, and focused on maximizing income.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 5,
            "max_files": 15
        }
        
        # Make the API request
        response = requests.post(url, headers=headers, json=payload)
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            
            if status == "completed":
                print(f"Successfully sent building strategy request to AI user {ai_username}")
                return True
            else:
                print(f"Error processing building strategy request for AI user {ai_username}: {response_data}")
                return False
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error sending building strategy request to AI user {ai_username}: {str(e)}")
        return False

def create_admin_notification(tables, ai_strategy_results: Dict[str, bool]) -> None:
    """Create a notification for admins with the AI building strategy results."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Building Strategy Results:\n\n"
        
        for ai_name, success in ai_strategy_results.items():
            status = "SUCCESS" if success else "FAILED"
            message += f"- {ai_name}: {status}\n"
        
        # Create the notification
        notification = {
            "User": "admin",
            "Type": "ai_building_strategy",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_strategy_results": ai_strategy_results,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI building strategy results")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_building_strategies(dry_run: bool = False):
    """Main function to process AI building strategies."""
    print(f"Starting AI building strategy process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Get all buildings for reference
    all_buildings = get_all_buildings(tables)
    
    # Track results for each AI
    ai_strategy_results = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
        
        # Get lands owned by this AI
        user_lands = get_user_lands(tables, ai_username)
        
        # Get buildings owned by this AI
        user_buildings = get_user_buildings(tables, ai_username)
        
        # Prepare the data package for the AI
        data_package = prepare_ai_building_strategy(ai_user, user_lands, user_buildings, all_buildings)
        
        # Send the building strategy request to the AI
        if not dry_run:
            success = send_building_strategy_request(ai_username, data_package)
            ai_strategy_results[ai_username] = success
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send building strategy request to AI user {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - User: {data_package['user']['username']}")
            print(f"  - Lands: {len(data_package['lands'])}")
            print(f"  - Buildings: {len(data_package['buildings'])}")
            print(f"  - Net Income: {data_package['user']['financial']['net_income']}")
            ai_strategy_results[ai_username] = True
    
    # Create admin notification with summary
    if not dry_run and ai_strategy_results:
        create_admin_notification(tables, ai_strategy_results)
    else:
        print(f"[DRY RUN] Would create admin notification with strategy results: {ai_strategy_results}")
    
    print("AI building strategy process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_building_strategies(dry_run)
