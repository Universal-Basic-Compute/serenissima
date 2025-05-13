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
        "users": Table(airtable_api_key, airtable_base_id, "USERS"),
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
        # Use "Owner" instead of "owner" for the field name
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
            "type": "house",
            "name": "House",
            "shortDescription": "Basic housing for citizens",
            "constructionCost": 5000
        },
        "workshop": {
            "type": "workshop",
            "name": "Workshop",
            "shortDescription": "Small production facility for crafts and goods",
            "constructionCost": 7500
        },
        "market-stall": {
            "type": "market-stall",
            "name": "Market Stall",
            "shortDescription": "Small commercial space for selling goods",
            "constructionCost": 3000
        },
        "warehouse": {
            "type": "warehouse",
            "name": "Warehouse",
            "shortDescription": "Storage facility for goods and resources",
            "constructionCost": 10000
        },
        "tavern": {
            "type": "tavern",
            "name": "Tavern",
            "shortDescription": "Establishment for food, drink, and socializing",
            "constructionCost": 8000
        },
        "dock": {
            "type": "dock",
            "name": "Dock",
            "shortDescription": "Maritime facility for loading/unloading ships",
            "constructionCost": 12000
        },
        "church": {
            "type": "church",
            "name": "Church",
            "shortDescription": "Religious building that provides community benefits",
            "constructionCost": 15000
        },
        "palace": {
            "type": "palace",
            "name": "Palace",
            "shortDescription": "Prestigious building for nobility and governance",
            "constructionCost": 25000
        }
    }

def get_building_types_from_api() -> Dict:
    """Get information about different building types from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/building-types"
        
        print(f"Fetching building types from API: {url}")
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if the response has the expected structure
            if "success" in response_data and response_data["success"] and "buildingTypes" in response_data:
                building_types = response_data["buildingTypes"]
                print(f"Successfully fetched {len(building_types)} building types from API")
                
                # Transform the data into the format we need - include type, name, shortDescription and constructionCosts.ducats
                transformed_types = {}
                for building in building_types:
                    if "type" in building and "name" in building:
                        building_type = building["type"]
                        
                        # Get construction costs if available
                        construction_costs = building.get("constructionCosts", {})
                        ducats_cost = construction_costs.get("ducats", 0) if construction_costs else 0
                        
                        # Create an entry for this building type with the required fields
                        transformed_types[building_type] = {
                            "type": building_type,
                            "name": building["name"],
                            "shortDescription": building.get("shortDescription", ""),
                            "constructionCost": ducats_cost
                        }
                
                return transformed_types
            else:
                print(f"Unexpected API response format: {response_data}")
                # Fall back to the hardcoded building types
                print("Using fallback building types data due to unexpected response format")
                return get_building_types_info()
        else:
            print(f"Error fetching building types from API: {response.status_code} - {response.text}")
            # Fall back to the hardcoded building types
            print("Using fallback building types data")
            return get_building_types_info()
    except Exception as e:
        print(f"Exception fetching building types from API: {str(e)}")
        # Fall back to the hardcoded building types
        print("Using fallback building types data due to exception")
        return get_building_types_info()

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
    
    # Get building types information from API
    building_types = get_building_types_from_api()
    
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

def send_building_strategy_request(ai_username: str, data_package: Dict) -> Optional[Dict]:
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
        
        # Log the API request details
        print(f"Sending building strategy request to AI user {ai_username}")
        print(f"API URL: {url}")
        print(f"User has {data_package['user']['ducats']} ducats")
        print(f"User owns {len(data_package['lands'])} lands and {len(data_package['buildings'])} buildings")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a landowner in La Serenissima, you need to decide on your next building investment.

Here's your current situation:
- You own {len(data_package['lands'])} lands
- You have {len(data_package['buildings'])} buildings
- Your current net income is {data_package['user']['financial']['net_income']} ducats
- You have {data_package['user']['ducats']} ducats available

What building would you like to construct next to maximize your income? Consider:
1. Your current building portfolio
2. Opportunities for new buildings that would increase your income
3. Which of your lands would be best for new construction
4. How to prioritize your building plan based on your available ducats

Focus on maximizing your income while maintaining sustainable maintenance costs.

After your analysis, provide your building decision in this JSON format:
```json
{{
  "building_type": "type-of-building-to-build",
  "land_id": "id-of-land-to-build-on",
  "reason": "brief explanation of why this building"
}}
```

If you decide not to build anything at this time, return an empty JSON object:
```json
{{}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI landowner in La Serenissima. You make your own decisions about building strategy.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your building strategy:
1. Analyze which of your lands have the most building potential (consider building points and water access)
2. Evaluate which building types would generate the most income for you
3. Consider the maintenance costs of different building types
4. Prioritize buildings that have the best income-to-maintenance ratio
5. Create a specific, actionable plan with building types and target lands
6. Consider your available ducats when making decisions

Your decision should be specific, data-driven, and focused on maximizing your income.

IMPORTANT: You must end your response with a JSON object containing your specific building decision.
If you decide to build something, include the building_type, land_id, and reason.
If you decide not to build anything at this time, return an empty JSON object.
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
            print(f"Full API response: {json.dumps(response_data)}")
            
            if status == "completed":
                print(f"Successfully sent building strategy request to AI user {ai_username}")
                
                # The response content is directly in the response_data
                content = response_data.get('content', '')
                print(f"AI {ai_username} response length: {len(content)} characters")
                print(f"AI {ai_username} response preview: {content[:200]}...")
                
                # Try to extract the JSON decision from the response
                try:
                    # Look for JSON block in the response
                    import re
                            json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
                            
                            if json_match:
                                json_str = json_match.group(1)
                                print(f"Found JSON in response: {json_str}")
                                
                                decision = json.loads(json_str)
                                
                                # Log the decision
                                print(f"AI {ai_username} decision: {json.dumps(decision)}")
                                
                                # If there's a building decision, return it
                                if decision and "building_type" in decision and "land_id" in decision:
                                    building_type = decision["building_type"]
                                    land_id = decision["land_id"]
                                    reason = decision.get("reason", "No reason provided")
                                    
                                    print(f"AI {ai_username} wants to build a {building_type} on land {land_id}")
                                    print(f"Reason: {reason}")
                                    
                                    # Return the decision
                                    return decision
                                else:
                                    print(f"AI {ai_username} decided not to build anything at this time")
                                    return {}
                            else:
                                print(f"No JSON decision found in AI response. Full response:")
                                print(content)
                                return None
                        except Exception as e:
                            print(f"Error extracting decision from AI response: {str(e)}")
                            print(f"Full response content that caused the error:")
                            print(content)
                            return None
                
                return None
            else:
                print(f"Error processing building strategy request for AI user {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending building strategy request to AI user {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

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

def get_polygon_data_for_user(username: str, user_lands: List[Dict]) -> List[Dict]:
    """Get polygon data for all lands owned by the user."""
    try:
        polygon_data = []
        
        # Get the data directory path
        data_dir = os.path.join(os.getcwd(), 'data')
        
        # For each land owned by the user, try to find the corresponding polygon file
        for land in user_lands:
            land_id = land["fields"].get("LandId", "")
            if not land_id:
                continue
            
            # Try to find the polygon file
            polygon_file_path = os.path.join(data_dir, f"{land_id}.json")
            if os.path.exists(polygon_file_path):
                try:
                    with open(polygon_file_path, 'r', encoding='utf-8') as f:
                        polygon = json.load(f)
                    
                    # Add the polygon to the list
                    polygon_data.append(polygon)
                    print(f"Found polygon data for land {land_id}")
                except Exception as e:
                    print(f"Error reading polygon file for land {land_id}: {str(e)}")
            else:
                print(f"Polygon file not found for land {land_id}")
        
        return polygon_data
    except Exception as e:
        print(f"Error getting polygon data for user {username}: {str(e)}")
        return []

def get_available_building_points(polygons: List[Dict], existing_buildings: List[Dict]) -> Dict[str, List[Dict]]:
    """Get available building points for each land, categorized by point type."""
    try:
        # Initialize result structure
        available_points = {
            "land": [],  # Regular building points
            "canal": [], # Points for docks
            "bridge": [] # Points for bridges
        }
        
        # Extract positions of existing buildings
        existing_positions = []
        for building in existing_buildings:
            position = building.get("position", None)
            if position:
                # Parse position if it's a string
                if isinstance(position, str):
                    try:
                        position = json.loads(position)
                    except:
                        continue
                
                # Add to existing positions if it has lat/lng
                if isinstance(position, dict) and "lat" in position and "lng" in position:
                    existing_positions.append({
                        "lat": position["lat"],
                        "lng": position["lng"]
                    })
        
        # Process each polygon
        for polygon in polygons:
            polygon_id = polygon.get("id", "unknown")
            
            # Process regular building points
            if "buildingPoints" in polygon and isinstance(polygon["buildingPoints"], list):
                for point in polygon["buildingPoints"]:
                    # Skip points without lat/lng
                    if not isinstance(point, dict) or "lat" not in point or "lng" not in point:
                        continue
                    
                    # Check if this point is already occupied
                    is_occupied = any(
                        abs(pos["lat"] - point["lat"]) < 0.0001 and 
                        abs(pos["lng"] - point["lng"]) < 0.0001 
                        for pos in existing_positions
                    )
                    
                    if not is_occupied:
                        # Add polygon ID to the point for reference
                        point_with_polygon = {
                            "lat": point["lat"],
                            "lng": point["lng"],
                            "polygon_id": polygon_id,
                            "point_type": "land"
                        }
                        available_points["land"].append(point_with_polygon)
            
            # Process canal points (for docks)
            if "canalPoints" in polygon and isinstance(polygon["canalPoints"], list):
                for point in polygon["canalPoints"]:
                    # Canal points usually have an "edge" property
                    if not isinstance(point, dict) or "edge" not in point:
                        continue
                    
                    edge = point["edge"]
                    if not isinstance(edge, dict) or "lat" not in edge or "lng" not in edge:
                        continue
                    
                    # Check if this point is already occupied
                    is_occupied = any(
                        abs(pos["lat"] - edge["lat"]) < 0.0001 and 
                        abs(pos["lng"] - edge["lng"]) < 0.0001 
                        for pos in existing_positions
                    )
                    
                    if not is_occupied:
                        # Add polygon ID to the point for reference
                        point_with_polygon = {
                            "lat": edge["lat"],
                            "lng": edge["lng"],
                            "polygon_id": polygon_id,
                            "point_type": "canal"
                        }
                        available_points["canal"].append(point_with_polygon)
            
            # Process bridge points
            if "bridgePoints" in polygon and isinstance(polygon["bridgePoints"], list):
                for point in polygon["bridgePoints"]:
                    # Bridge points usually have an "edge" property
                    if not isinstance(point, dict) or "edge" not in point:
                        continue
                    
                    edge = point["edge"]
                    if not isinstance(edge, dict) or "lat" not in edge or "lng" not in edge:
                        continue
                    
                    # Check if this point is already occupied
                    is_occupied = any(
                        abs(pos["lat"] - edge["lat"]) < 0.0001 and 
                        abs(pos["lng"] - edge["lng"]) < 0.0001 
                        for pos in existing_positions
                    )
                    
                    if not is_occupied:
                        # Add polygon ID to the point for reference
                        point_with_polygon = {
                            "lat": edge["lat"],
                            "lng": edge["lng"],
                            "polygon_id": polygon_id,
                            "point_type": "bridge"
                        }
                        available_points["bridge"].append(point_with_polygon)
        
        # Count available points
        total_points = sum(len(points) for points in available_points.values())
        print(f"Found {total_points} available building points:")
        print(f"  - Land points: {len(available_points['land'])}")
        print(f"  - Canal points: {len(available_points['canal'])}")
        print(f"  - Bridge points: {len(available_points['bridge'])}")
        
        return available_points
    except Exception as e:
        print(f"Error getting available building points: {str(e)}")
        return {"land": [], "canal": [], "bridge": []}

def send_building_placement_request(ai_username: str, decision: Dict, polygon_data: List[Dict], 
                                   available_points: Dict[str, List[Dict]], building_types: Dict) -> bool:
    """Send a second request to the AI to choose a specific point for building placement."""
    try:
        if not decision or "building_type" not in decision or "land_id" not in decision:
            print(f"No valid building decision from AI {ai_username}, skipping placement request")
            print(f"Decision data: {json.dumps(decision)}")
            return False
        
        building_type = decision["building_type"]
        land_id = decision["land_id"]
        
        print(f"Processing building placement for {ai_username}: {building_type} on land {land_id}")
        
        # Determine which point type is needed for this building
        point_type = "land"  # Default for most buildings
        if building_type == "dock":
            point_type = "canal"
        elif building_type == "bridge":
            point_type = "bridge"
        
        print(f"Building {building_type} requires point type: {point_type}")
        
        # Filter available points by land_id and point_type
        filtered_points = [
            point for point in available_points[point_type]
            if point["polygon_id"] == land_id
        ]
        
        print(f"Found {len(filtered_points)} available {point_type} points for land {land_id}")
        
        if not filtered_points:
            print(f"No available {point_type} points found for land {land_id}, cannot place {building_type}")
            print(f"Available points summary:")
            for pt_type, points in available_points.items():
                print(f"  - {pt_type}: {len(points)} points")
                land_counts = {}
                for pt in points:
                    land_id = pt.get("polygon_id", "unknown")
                    if land_id not in land_counts:
                        land_counts[land_id] = 0
                    land_counts[land_id] += 1
                print(f"    Points by land: {land_counts}")
            return False
        
        # Get building type details
        building_type_info = building_types.get(building_type, {
            "type": building_type,
            "name": building_type.capitalize(),
            "shortDescription": f"A {building_type}"
        })
        
        print(f"Building type info: {json.dumps(building_type_info)}")
        
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        
        # Construct the API URL
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/messages"
        
        # Set up headers with API key
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Create a detailed prompt for building placement
        prompt = f"""
You've decided to build a {building_type_info['name']} on land {land_id}.

Now you need to choose a specific location for this building. I've provided a list of available building points for this land.

Please select one of the available points by providing its index number from the list.

Respond with a JSON object containing your selection:
```json
{{
  "selected_point_index": 0,  // Replace with your chosen index
  "reason": "Brief explanation of why you chose this point"
}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI landowner in La Serenissima.

You previously decided to build a {building_type_info['name']} ({building_type}) on land {land_id}.

Here is information about the land:
{json.dumps([p for p in polygon_data if p.get("id") == land_id], indent=2)}

Here are the available building points for this land (for {point_type} type buildings):
{json.dumps(filtered_points, indent=2)}

There are {len(filtered_points)} available points. Choose the best location for your {building_type_info['name']} by selecting the index of one of these points (0 to {len(filtered_points)-1}).

Your response must be a JSON object with:
1. selected_point_index: The index of your chosen point (0 to {len(filtered_points)-1})
2. reason: A brief explanation of why you chose this location
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 5,
            "max_files": 15
        }
        
        # Make the API request
        print(f"Making building placement API request to Kinos for {ai_username}...")
        response = requests.post(url, headers=headers, json=payload)
        
        # Log the API response details
        print(f"Building placement API response status code: {response.status_code}")
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            
            print(f"Building placement API response status: {status}")
            
            if status == "completed":
                print(f"Successfully sent building placement request to AI user {ai_username}")
                
                # The response content is directly in the response_data
                content = response_data.get('content', '')
                print(f"AI {ai_username} placement response length: {len(content)} characters")
                print(f"AI {ai_username} placement response preview: {content[:200]}...")
                        
                        # Try to extract the JSON decision from the response
                        try:
                            content = latest_message.get('content', '')
                    # Look for JSON block in the response
                    import re
                            json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
                            
                            if json_match:
                                json_str = json_match.group(1)
                                print(f"Found JSON in placement response: {json_str}")
                                
                                placement_decision = json.loads(json_str)
                                
                                # Log the decision
                                print(f"AI {ai_username} placement decision: {json.dumps(placement_decision)}")
                                
                                # Check if the decision is valid
                                if "selected_point_index" in placement_decision:
                                    selected_index = placement_decision["selected_point_index"]
                                    
                                    # Validate the index
                                    if 0 <= selected_index < len(filtered_points):
                                        selected_point = filtered_points[selected_index]
                                        reason = placement_decision.get("reason", "No reason provided")
                                        
                                        print(f"AI {ai_username} selected point {selected_index} at position {selected_point['lat']}, {selected_point['lng']}")
                                        print(f"Reason: {reason}")
                                        
                                        # Now we need to create the building
                                        # 1. Get the construction cost for this building type
                                        construction_cost = building_type_info.get("constructionCost", 0)
                                        print(f"Construction cost for {building_type}: {construction_cost} ducats")
                                        
                                        # 2. Check if the user has enough ducats
                                        from app.user_utils import find_user_by_identifier
                                        
                                        # Get the tables from the function parameters
                                        tables = initialize_airtable()
                                        
                                        # Find the user record
                                        user_record = find_user_by_identifier(tables["users"], ai_username)
                                        if not user_record:
                                            print(f"User {ai_username} not found, cannot create building")
                                            return False
                                        
                                        user_ducats = user_record["fields"].get("Ducats", 0)
                                        print(f"User {ai_username} has {user_ducats} ducats")
                                        
                                        if user_ducats < construction_cost:
                                            print(f"User {ai_username} does not have enough ducats to build {building_type}. Required: {construction_cost}, Available: {user_ducats}")
                                            return False
                                        
                                        # 3. Transfer ducats from user to ConsiglioDeiDieci
                                        # Find ConsiglioDeiDieci record
                                        consiglio_records = tables["users"].all(formula="{Username}='ConsiglioDeiDieci'")
                                        if not consiglio_records:
                                            print("ConsiglioDeiDieci account not found, cannot transfer ducats")
                                            return False
                                        
                                        consiglio_record = consiglio_records[0]
                                        consiglio_ducats = consiglio_record["fields"].get("Ducats", 0)
                                        print(f"ConsiglioDeiDieci has {consiglio_ducats} ducats before transfer")
                                        
                                        # Update user's ducats
                                        print(f"Updating {ai_username}'s ducats from {user_ducats} to {user_ducats - construction_cost}")
                                        tables["users"].update(user_record["id"], {
                                            "Ducats": user_ducats - construction_cost
                                        })
                                        
                                        # Update ConsiglioDeiDieci's ducats
                                        print(f"Updating ConsiglioDeiDieci's ducats from {consiglio_ducats} to {consiglio_ducats + construction_cost}")
                                        tables["users"].update(consiglio_record["id"], {
                                            "Ducats": consiglio_ducats + construction_cost
                                        })
                                        
                                        print(f"Transferred {construction_cost} ducats from {ai_username} to ConsiglioDeiDieci")
                                        
                                        # 4. Create the building record
                                        # Generate a unique building ID
                                        import uuid
                                        building_id = f"building-{uuid.uuid4()}"
                                        
                                        # Format the position as a JSON string
                                        position_json = json.dumps({
                                            "lat": selected_point["lat"],
                                            "lng": selected_point["lng"]
                                        })
                                        
                                        # Create the building record
                                        building_record = {
                                            "BuildingId": building_id,
                                            "Type": building_type,
                                            "LandId": land_id,
                                            "LeaseAmount": 0,
                                            "Variant": "model",
                                            "Owner": ai_username,
                                            "Position": position_json,
                                            "RentAmount": 0,
                                            "CreatedAt": datetime.now().isoformat()
                                        }
                                        
                                        print(f"Creating building record: {json.dumps(building_record)}")
                                        
                                        # Add the building to Airtable
                                        try:
                                            new_building = tables["buildings"].create(building_record)
                                            print(f"Created new building: {building_id} of type {building_type} for {ai_username} on land {land_id}")
                                            print(f"Building record ID: {new_building['id']}")
                                        except Exception as building_error:
                                            print(f"Error creating building record: {str(building_error)}")
                                            print(f"Exception traceback: {traceback.format_exc()}")
                                            return False
                                        
                                        # 5. Create a notification for the user
                                        notification = {
                                            "User": ai_username,
                                            "Type": "building_created",
                                            "Content": f"You have successfully built a {building_type_info['name']} on your land {land_id} for {construction_cost} ducats.",
                                            "CreatedAt": datetime.now().isoformat(),
                                            "ReadAt": None,
                                            "Details": json.dumps({
                                                "building_id": building_id,
                                                "building_type": building_type,
                                                "land_id": land_id,
                                                "cost": construction_cost,
                                                "position": {
                                                    "lat": selected_point["lat"],
                                                    "lng": selected_point["lng"]
                                                }
                                            })
                                        }
                                        
                                        try:
                                            tables["notifications"].create(notification)
                                            print(f"Created notification for {ai_username} about new building")
                                        except Exception as notification_error:
                                            print(f"Error creating notification: {str(notification_error)}")
                                            # Continue even if notification creation fails
                                        
                                        return True
                                    else:
                                        print(f"Invalid point index {selected_index}, must be between 0 and {len(filtered_points)-1}")
                                else:
                                    print(f"No selected_point_index in placement decision")
                            else:
                                print(f"No JSON decision found in AI placement response. Full response:")
                                print(content)
                        except Exception as e:
                            print(f"Error extracting placement decision from AI response: {str(e)}")
                            print(f"Exception traceback: {traceback.format_exc()}")
                            print(f"Full response content that caused the error:")
                            print(content)
                return False
            else:
                print(f"Error processing building placement request for AI user {ai_username}: {response_data}")
                return False
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error sending building placement request to AI user {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def process_ai_building_strategies(dry_run: bool = False):
    """Main function to process AI building strategies."""
    print(f"Starting AI building strategy process (dry_run={dry_run})")
    
    # Import traceback for detailed error logging
    import traceback
    
    # Initialize Airtable connection
    try:
        tables = initialize_airtable()
        print("Successfully initialized Airtable connection")
    except Exception as e:
        print(f"Failed to initialize Airtable: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return
    
    # Get AI users
    try:
        ai_users = get_ai_users(tables)
        if not ai_users:
            print("No AI users found, exiting")
            return
        print(f"Successfully retrieved {len(ai_users)} AI users")
    except Exception as e:
        print(f"Failed to get AI users: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return
    
    # Get all buildings for reference
    try:
        all_buildings = get_all_buildings(tables)
        print(f"Successfully retrieved {len(all_buildings)} buildings")
    except Exception as e:
        print(f"Failed to get all buildings: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return
    
    # Track results for each AI
    ai_strategy_results = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            print("Skipping AI user with no username")
            continue
        
        print(f"\n{'='*80}")
        print(f"Processing AI user: {ai_username}")
        print(f"{'='*80}")
        
        try:
            # Get lands owned by this AI
            user_lands = get_user_lands(tables, ai_username)
            print(f"Retrieved {len(user_lands)} lands for {ai_username}")
            
            if not user_lands:
                print(f"AI user {ai_username} has no lands, skipping")
                ai_strategy_results[ai_username] = False
                continue
            
            # Get buildings owned by this AI
            user_buildings = get_user_buildings(tables, ai_username)
            print(f"Retrieved {len(user_buildings)} buildings for {ai_username}")
            
            # Get polygon data for this user's lands
            polygon_data = get_polygon_data_for_user(ai_username, user_lands)
            print(f"Retrieved polygon data for {len(polygon_data)} lands")
            
            # Get available building points
            available_points = get_available_building_points(polygon_data, user_buildings)
            
            # Check if there are any available building points
            total_points = sum(len(points) for points in available_points.values())
            print(f"Found {total_points} total available building points for {ai_username}")
            
            if total_points == 0:
                print(f"No available building points for AI user {ai_username}, skipping")
                ai_strategy_results[ai_username] = False
                continue
            
            # Prepare the data package for the AI
            data_package = prepare_ai_building_strategy(ai_user, user_lands, user_buildings, all_buildings)
            print(f"Prepared data package for {ai_username}")
            
            # Send the building strategy request to the AI
            if not dry_run:
                print(f"\n{'-'*80}")
                print(f"STEP 1: Get building decision for {ai_username}")
                print(f"{'-'*80}")
                
                # First call: Get building decision
                decision = send_building_strategy_request(ai_username, data_package)
                
                if decision is not None:
                    print(f"\n{'-'*80}")
                    print(f"STEP 2: Get placement decision for {ai_username}")
                    print(f"{'-'*80}")
                    
                    # Second call: Get placement decision
                    building_types = get_building_types_from_api()
                    placement_success = send_building_placement_request(
                        ai_username, 
                        decision, 
                        polygon_data, 
                        available_points,
                        building_types
                    )
                    
                    ai_strategy_results[ai_username] = placement_success
                    print(f"Building strategy for {ai_username} completed with result: {'SUCCESS' if placement_success else 'FAILED'}")
                else:
                    print(f"No valid building decision received for {ai_username}")
                    ai_strategy_results[ai_username] = False
            else:
                # In dry run mode, just log what would happen
                print(f"[DRY RUN] Would send building strategy request to AI user {ai_username}")
                print(f"[DRY RUN] Data package summary:")
                print(f"  - User: {data_package['user']['username']}")
                print(f"  - Lands: {len(data_package['lands'])}")
                print(f"  - Buildings: {len(data_package['buildings'])}")
                print(f"  - Net Income: {data_package['user']['financial']['net_income']}")
                print(f"  - Available building points: {total_points}")
                ai_strategy_results[ai_username] = True
        except Exception as e:
            print(f"Error processing AI user {ai_username}: {str(e)}")
            print(f"Exception traceback: {traceback.format_exc()}")
            ai_strategy_results[ai_username] = False
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send building strategy request to AI user {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - User: {data_package['user']['username']}")
            print(f"  - Lands: {len(data_package['lands'])}")
            print(f"  - Buildings: {len(data_package['buildings'])}")
            print(f"  - Net Income: {data_package['user']['financial']['net_income']}")
            print(f"  - Available building points: {total_points}")
            ai_strategy_results[ai_username] = True
    
    # Create admin notification with summary
    if not dry_run and ai_strategy_results:
        try:
            create_admin_notification(tables, ai_strategy_results)
            print("Created admin notification with AI building strategy results")
        except Exception as e:
            print(f"Error creating admin notification: {str(e)}")
            print(f"Exception traceback: {traceback.format_exc()}")
    else:
        print(f"[DRY RUN] Would create admin notification with strategy results: {ai_strategy_results}")
    
    # Print final summary
    print("\nAI Building Strategy Results Summary:")
    for ai_name, success in ai_strategy_results.items():
        status = "SUCCESS" if success else "FAILED"
        print(f"- {ai_name}: {status}")
    
    print("\nAI building strategy process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_building_strategies(dry_run)
