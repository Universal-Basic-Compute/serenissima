import os
import sys
import json
import traceback
from datetime import datetime, timedelta
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
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
        "resources": Table(airtable_api_key, airtable_base_id, "RESOURCES"),
        "contracts": Table(airtable_api_key, airtable_base_id, "CONTRACTS"),
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
                
                # Transform the data into a dictionary keyed by building type
                building_defs = {}
                for building in building_types:
                    if "type" in building:
                        building_defs[building["type"]] = building
                
                return building_defs
            else:
                print(f"Unexpected API response format: {response_data}")
                return {}
        else:
            print(f"Error fetching building types from API: {response.status_code} - {response.text}")
            return {}
    except Exception as e:
        print(f"Exception fetching building types from API: {str(e)}")
        return {}

def get_resource_types_from_api() -> Dict:
    """Get information about different resource types from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/resource-types"
        
        print(f"Fetching resource types from API: {url}")
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if the response has the expected structure
            if "success" in response_data and response_data["success"] and "resourceTypes" in response_data:
                resource_types = response_data["resourceTypes"]
                print(f"Successfully fetched {len(resource_types)} resource types from API")
                
                # Transform the data into a dictionary keyed by resource id
                resource_defs = {}
                for resource in resource_types:
                    if "id" in resource:
                        resource_defs[resource["id"]] = resource
                
                return resource_defs
            else:
                print(f"Unexpected API response format: {response_data}")
                return {}
        else:
            print(f"Error fetching resource types from API: {response.status_code} - {response.text}")
            return {}
    except Exception as e:
        print(f"Exception fetching resource types from API: {str(e)}")
        return {}

def get_user_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings run by a specific user."""
    try:
        # Query buildings where the user is running the building
        formula = f"{{RanBy}}='{username}'"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings run by {username}")
        return buildings
    except Exception as e:
        print(f"Error getting buildings for user {username}: {str(e)}")
        return []

def get_user_resources(tables, username: str) -> List[Dict]:
    """Get all resources owned by a specific user."""
    try:
        # Query resources where the user is the owner
        formula = f"{{Owner}}='{username}'"
        resources = tables["resources"].all(formula=formula)
        print(f"Found {len(resources)} resources owned by {username}")
        return resources
    except Exception as e:
        print(f"Error getting resources for user {username}: {str(e)}")
        return []

def get_user_active_contracts(tables, username: str) -> List[Dict]:
    """Get all active contracts where the user is the seller."""
    try:
        # Get current time
        now = datetime.now().isoformat()
        
        # Query contracts where the user is the seller and the contract is active (between CreatedAt and EndAt)
        formula = f"AND({{Seller}}='{username}', {{CreatedAt}}<='{now}', {{EndAt}}>='{now}')"
        contracts = tables["contracts"].all(formula=formula)
        print(f"Found {len(contracts)} active contracts where {username} is the seller")
        return contracts
    except Exception as e:
        print(f"Error getting contracts for user {username}: {str(e)}")
        return []

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_public_sell_strategy_data(
    ai_user: Dict, 
    user_buildings: List[Dict], 
    user_resources: List[Dict],
    user_active_contracts: List[Dict],
    building_types: Dict, 
    resource_types: Dict
) -> Dict:
    """Prepare a comprehensive data package for the AI to make public sell decisions."""
    
    # Extract user information
    username = ai_user["fields"].get("Username", "")
    ducats = ai_user["fields"].get("Ducats", 0)
    
    # Find buildings that can sell resources
    sellable_buildings = []
    for building in user_buildings:
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        
        # Check if this building type can sell resources
        building_def = building_types.get(building_type, {})
        production_info = building_def.get("productionInformation", {})
        
        if production_info and isinstance(production_info, dict):
            sells = production_info.get("sells", [])
            
            # Only include buildings that can sell resources
            if sells:
                sellable_buildings.append({
                    "id": building_id,
                    "type": building_type,
                    "name": building_def.get("name", building_type),
                    "sells": sells
                })
    
    # Process user resources
    resources_by_type = {}
    for resource in user_resources:
        resource_type = resource["fields"].get("Type", "")
        count = resource["fields"].get("Count", 0)
        building_id = resource["fields"].get("BuildingId", "")
        
        # Create a unique key for each resource type and building combination
        key = f"{resource_type}_{building_id}" if building_id else resource_type
        
        if key not in resources_by_type:
            resources_by_type[key] = {
                "type": resource_type,
                "building_id": building_id,
                "count": 0
            }
        
        resources_by_type[key]["count"] += count
    
    # Process existing public sell contracts
    existing_contracts = []
    for contract in user_active_contracts:
        if contract["fields"].get("Type") == "public_sell":
            existing_contracts.append({
                "id": contract["fields"].get("ContractId", ""),
                "resource_type": contract["fields"].get("ResourceType", ""),
                "seller_building": contract["fields"].get("SellerBuilding", ""),
                "hourly_amount": contract["fields"].get("hourlyAmount", 0),
                "price": contract["fields"].get("PricePerResource", 0),
                "created_at": contract["fields"].get("CreatedAt", ""),
                "end_at": contract["fields"].get("EndAt", "")
            })
    
    # Get resource type information
    resource_info = {}
    for resource_id, resource in resource_types.items():
        resource_info[resource_id] = {
            "id": resource_id,
            "name": resource.get("name", resource_id),
            "category": resource.get("category", "Unknown"),
            "import_price": resource.get("importPrice", 0)
        }
    
    # Prepare the complete data package
    data_package = {
        "user": {
            "username": username,
            "ducats": ducats,
            "total_buildings": len(user_buildings),
            "sellable_buildings": len(sellable_buildings)
        },
        "sellable_buildings": sellable_buildings,
        "resources": list(resources_by_type.values()),
        "resource_info": resource_info,
        "existing_contracts": existing_contracts,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_public_sell_strategy_request(ai_username: str, data_package: Dict) -> Optional[Dict]:
    """Send the public sell strategy request to the AI via Kinos API."""
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
        print(f"Sending public sell strategy request to AI user {ai_username}")
        print(f"API URL: {url}")
        print(f"User has {data_package['user']['ducats']} ducats")
        print(f"User has {data_package['user']['sellable_buildings']} buildings that can sell resources")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a merchant in La Serenissima, you need to decide which resources to sell publicly.

Here's your current situation:
- You run {data_package['user']['sellable_buildings']} buildings that can sell resources
- You have {len(data_package['resources'])} different resource stockpiles
- You currently have {len(data_package['existing_contracts'])} active public sell contracts

Please analyze your buildings and resources to develop a strategy for public selling. Consider:
1. Which resources each building can sell
2. Your current resource stockpiles
3. The import prices and market value of different resources
4. Your existing public sell contracts

After your analysis, provide your decisions in this JSON format:
```json
{{
  "contracts_to_create": [
    {{
      "building_id": "building-id-1",
      "resource_type": "resource-type-1",
      "hourly_amount": 10,
      "price_per_resource": 15,
      "reason": "brief explanation"
    }}
  ],
  "contracts_to_end": [
    {{
      "contract_id": "contract-id-1",
      "reason": "brief explanation"
    }}
  ]
}}
```

If you decide not to make any changes, return empty arrays:
```json
{{
  "contracts_to_create": [],
  "contracts_to_end": []
}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI merchant in La Serenissima. You make your own decisions about which resources to sell publicly.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your public sell strategy:
1. Analyze which buildings can sell which resources (check the "sells" array for each building)
2. Consider your current resource stockpiles and production capacity
3. Set prices that are competitive but profitable (typically 1.2-1.5x the import price)
4. Balance the hourly sell amounts based on your resource availability
5. Consider ending contracts for resources you no longer wish to sell
6. Create a specific, actionable plan with building IDs and resource types

Your decision should be specific, data-driven, and focused on optimizing your market presence.

IMPORTANT: You must end your response with a JSON object containing your specific public sell decisions.
Include both contracts_to_create and contracts_to_end arrays with the required information for each.
If you decide not to make any changes, return empty arrays.
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
                print(f"Successfully sent public sell strategy request to AI user {ai_username}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                
                # Log the entire response for debugging
                print(f"FULL AI RESPONSE FROM {ai_username}:")
                print("="*80)
                print(content)
                print("="*80)
                
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
                            if "contracts_to_create" in decisions and "contracts_to_end" in decisions:
                                print(f"Found public sell decisions in code block: {len(decisions['contracts_to_create'])} to create, {len(decisions['contracts_to_end'])} to end")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from code block: {str(e)}")
                    
                    # Next, try to find JSON with curly braces pattern
                    json_match = re.search(r'(\{[\s\S]*"contracts_to_create"[\s\S]*"contracts_to_end"[\s\S]*\})', content)
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "contracts_to_create" in decisions and "contracts_to_end" in decisions:
                                print(f"Found public sell decisions in curly braces pattern: {len(decisions['contracts_to_create'])} to create, {len(decisions['contracts_to_end'])} to end")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from curly braces pattern: {str(e)}")
                    
                    # If we couldn't find a JSON block, try to parse the entire response
                    try:
                        decisions = json.loads(content)
                        if "contracts_to_create" in decisions and "contracts_to_end" in decisions:
                            print(f"Found public sell decisions in full response: {len(decisions['contracts_to_create'])} to create, {len(decisions['contracts_to_end'])} to end")
                            return decisions
                    except json.JSONDecodeError:
                        print("Could not parse full response as JSON")
                    
                    # If we get here, no valid decision was found
                    print(f"No valid public sell decision found in AI response. Full response:")
                    print(content)
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {str(e)}")
                    print(f"Full response content that caused the error:")
                    print(content)
                    return None
            else:
                print(f"Error processing public sell strategy request for AI user {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending public sell strategy request to AI user {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

def validate_create_contract_decision(
    decision: Dict, 
    sellable_buildings: List[Dict], 
    resource_types: Dict,
    user_resources: List[Dict]
) -> bool:
    """Validate that a contract creation decision is valid."""
    building_id = decision.get("building_id")
    resource_type = decision.get("resource_type")
    hourly_amount = decision.get("hourly_amount")
    price_per_resource = decision.get("price_per_resource")
    
    # Check if all required fields are present
    if not building_id or not resource_type or hourly_amount is None or price_per_resource is None:
        print(f"Invalid contract creation decision: missing required fields - {decision}")
        return False
    
    # Check if hourly_amount is a positive number
    try:
        hourly_amount_float = float(hourly_amount)
        if hourly_amount_float <= 0:
            print(f"Invalid hourly amount: {hourly_amount} must be positive")
            return False
    except (ValueError, TypeError):
        print(f"Invalid hourly amount: {hourly_amount} is not a number")
        return False
    
    # Check if price_per_resource is a positive number
    try:
        price_float = float(price_per_resource)
        if price_float <= 0:
            print(f"Invalid price: {price_per_resource} must be positive")
            return False
    except (ValueError, TypeError):
        print(f"Invalid price: {price_per_resource} is not a number")
        return False
    
    # Check if the building exists and can sell this resource
    building_found = False
    for building in sellable_buildings:
        if building["id"] == building_id:
            building_found = True
            # Check if the building can sell this resource type
            if resource_type not in building["sells"]:
                print(f"Building {building_id} cannot sell resource {resource_type}")
                return False
            break
    
    if not building_found:
        print(f"Building {building_id} not found or cannot sell resources")
        return False
    
    # Check if the resource type exists
    if resource_type not in resource_types:
        print(f"Resource type {resource_type} not found")
        return False
    
    # Check if the user has this resource type
    has_resource = False
    for resource in user_resources:
        if resource["fields"].get("Type") == resource_type:
            has_resource = True
            break
    
    if not has_resource:
        print(f"User does not have any resources of type {resource_type}")
        return False
    
    return True

def validate_end_contract_decision(
    decision: Dict,
    existing_contracts: List[Dict]
) -> bool:
    """Validate that a contract ending decision is valid."""
    contract_id = decision.get("contract_id")
    
    # Check if contract_id is present
    if not contract_id:
        print(f"Invalid contract ending decision: missing contract_id - {decision}")
        return False
    
    # Check if the contract exists
    contract_found = False
    for contract in existing_contracts:
        if contract["id"] == contract_id:
            contract_found = True
            break
    
    if not contract_found:
        print(f"Contract {contract_id} not found in existing contracts")
        return False
    
    return True

def create_public_sell_contract(
    tables, 
    ai_username: str, 
    decision: Dict, 
    resource_types: Dict
) -> bool:
    """Create a new public sell contract based on the AI's decision."""
    try:
        building_id = decision["building_id"]
        resource_type = decision["resource_type"]
        hourly_amount = float(decision["hourly_amount"])
        price_per_resource = float(decision["price_per_resource"])
        reason = decision.get("reason", "No reason provided")
        
        now = datetime.now().isoformat()
        end_date = (datetime.now() + timedelta(hours=24)).isoformat()  # Contract ends in 24 hours
        
        # Create a new contract
        import uuid
        contract_id = f"contract-{uuid.uuid4()}"
        
        new_contract = {
            "ContractId": contract_id,
            "Seller": ai_username,
            "Buyer": "public",  # Public contract
            "Type": "public_sell",
            "ResourceType": resource_type,
            "SellerBuilding": building_id,
            "BuyerBuilding": None,
            "hourlyAmount": hourly_amount,
            "PricePerResource": price_per_resource,
            "Priority": 1,  # Default priority
            "CreatedAt": now,
            "EndAt": end_date,
            "Notes": json.dumps({
                "reason": reason,
                "created_by": "AI Public Sell Strategy",
                "created_at": now
            })
        }
        
        tables["contracts"].create(new_contract)
        
        print(f"Created new public sell contract for {resource_type} from building {building_id}: {hourly_amount} units/hour at {price_per_resource} ducats each")
        
        return True
    except Exception as e:
        print(f"Error creating public sell contract: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def end_public_sell_contract(
    tables, 
    contract_id: str,
    reason: str
) -> bool:
    """End an existing public sell contract based on the AI's decision."""
    try:
        # Find the contract in Airtable
        formula = f"{{ContractId}}='{contract_id}'"
        contracts = tables["contracts"].all(formula=formula)
        
        if not contracts:
            print(f"Contract {contract_id} not found in Airtable")
            return False
        
        # Get the Airtable record ID
        record_id = contracts[0]["id"]
        
        # Update the contract to end it now
        now = datetime.now().isoformat()
        
        updated_contract = tables["contracts"].update(record_id, {
            "EndAt": now,
            "Notes": json.dumps({
                "reason": reason,
                "ended_by": "AI Public Sell Strategy",
                "ended_at": now
            })
        })
        
        print(f"Ended public sell contract {contract_id}")
        
        return True
    except Exception as e:
        print(f"Error ending public sell contract: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def create_admin_notification(tables, ai_sell_results: Dict[str, Dict]) -> None:
    """Create a notification for admins with the AI public sell strategy results."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Public Sell Strategy Results:\n\n"
        
        for ai_name, results in ai_sell_results.items():
            created_count = results.get("created", 0)
            ended_count = results.get("ended", 0)
            
            message += f"- {ai_name}: Created {created_count} contracts, Ended {ended_count} contracts\n"
            
            # Add details about the created contracts
            if "created_contracts" in results and results["created_contracts"]:
                message += "  Created Contracts:\n"
                for contract in results["created_contracts"]:
                    message += f"    * Building {contract['building_id']}: {contract['hourly_amount']} {contract['resource_type']}/hour at {contract['price_per_resource']} ducats\n"
            
            # Add details about the ended contracts
            if "ended_contracts" in results and results["ended_contracts"]:
                message += "  Ended Contracts:\n"
                for contract in results["ended_contracts"]:
                    message += f"    * Contract {contract['contract_id']}: {contract['reason']}\n"
        
        # Create the notification
        notification = {
            "User": "NLR",  # Send to NLR as requested
            "Type": "ai_public_sell_strategy",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_sell_results": ai_sell_results,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI public sell strategy results")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_public_sell_strategies(dry_run: bool = False):
    """Main function to process AI public sell strategies."""
    print(f"Starting AI public sell strategy process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get building types information
    building_types = get_building_types_from_api()
    if not building_types:
        print("Failed to get building types, exiting")
        return
    
    # Get resource types information
    resource_types = get_resource_types_from_api()
    if not resource_types:
        print("Failed to get resource types, exiting")
        return
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Track sell results for each AI
    ai_sell_results = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
        ai_sell_results[ai_username] = {
            "created": 0,
            "ended": 0,
            "created_contracts": [],
            "ended_contracts": []
        }
        
        # Get buildings run by this AI
        user_buildings = get_user_buildings(tables, ai_username)
        
        # Get resources owned by this AI
        user_resources = get_user_resources(tables, ai_username)
        
        # Get existing active contracts where this AI is the seller
        user_active_contracts = get_user_active_contracts(tables, ai_username)
        
        # Prepare the data package for the AI
        data_package = prepare_public_sell_strategy_data(
            ai_user, 
            user_buildings, 
            user_resources,
            user_active_contracts,
            building_types, 
            resource_types
        )
        
        # Find buildings that can sell resources
        sellable_buildings = data_package["sellable_buildings"]
        
        if not sellable_buildings:
            print(f"AI user {ai_username} has no buildings that can sell resources, skipping")
            continue
        
        # Send the public sell strategy request to the AI
        if not dry_run:
            decisions = send_public_sell_strategy_request(ai_username, data_package)
            
            if decisions:
                # Process contracts to create
                if "contracts_to_create" in decisions and decisions["contracts_to_create"]:
                    for decision in decisions["contracts_to_create"]:
                        # Validate the contract creation decision
                        if validate_create_contract_decision(decision, sellable_buildings, resource_types, user_resources):
                            # Create the public sell contract
                            success = create_public_sell_contract(
                                tables, 
                                ai_username, 
                                decision, 
                                resource_types
                            )
                            
                            if success:
                                ai_sell_results[ai_username]["created"] += 1
                                ai_sell_results[ai_username]["created_contracts"].append({
                                    "building_id": decision["building_id"],
                                    "resource_type": decision["resource_type"],
                                    "hourly_amount": decision["hourly_amount"],
                                    "price_per_resource": decision["price_per_resource"]
                                })
                
                # Process contracts to end
                if "contracts_to_end" in decisions and decisions["contracts_to_end"]:
                    for decision in decisions["contracts_to_end"]:
                        # Validate the contract ending decision
                        if validate_end_contract_decision(decision, user_active_contracts):
                            # End the public sell contract
                            success = end_public_sell_contract(
                                tables, 
                                decision["contract_id"],
                                decision.get("reason", "No reason provided")
                            )
                            
                            if success:
                                ai_sell_results[ai_username]["ended"] += 1
                                ai_sell_results[ai_username]["ended_contracts"].append({
                                    "contract_id": decision["contract_id"],
                                    "reason": decision.get("reason", "No reason provided")
                                })
            else:
                print(f"No valid public sell decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send public sell strategy request to AI user {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - User: {data_package['user']['username']}")
            print(f"  - Sellable buildings: {len(sellable_buildings)}")
            print(f"  - Resources: {len(data_package['resources'])}")
            print(f"  - Existing contracts: {len(data_package['existing_contracts'])}")
    
    # Create admin notification with summary
    if not dry_run and any(results["created"] > 0 or results["ended"] > 0 for results in ai_sell_results.values()):
        create_admin_notification(tables, ai_sell_results)
    else:
        print(f"[DRY RUN] Would create admin notification with sell results: {ai_sell_results}")
    
    print("AI public sell strategy process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_public_sell_strategies(dry_run)
