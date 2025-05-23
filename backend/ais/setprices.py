import os
import sys
import json
import traceback
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import citizen_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

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
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS"),
        "contracts": Table(airtable_api_key, airtable_base_id, "CONTRACTS") # Ajouter la table des contrats
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

def get_all_buildings(tables) -> List[Dict]:
    """Get all buildings from Airtable."""
    try:
        buildings = tables["buildings"].all()
        print(f"Found {len(buildings)} buildings in total")
        return buildings
    except Exception as e:
        print(f"Error getting all buildings: {str(e)}")
        return []

def get_building_definitions_from_api() -> Dict:
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

def get_building_public_sell_contracts(tables: Dict[str, Table], seller_username: str, seller_building_id: str) -> List[Dict]:
    """Get active public_sell contracts for a specific seller and building."""
    try:
        now = datetime.now().isoformat()
        # Assurer que les valeurs sont correctement échappées pour la formule Airtable
        safe_seller_username = seller_username.replace("'", "\\'")
        safe_seller_building_id = seller_building_id.replace("'", "\\'")
        
        formula = (f"AND({{Seller}}='{safe_seller_username}', "
                   f"{{SellerBuilding}}='{safe_seller_building_id}', "
                   f"{{Type}}='public_sell', "
                   f"{{CreatedAt}}<='{now}', "
                   f"{{EndAt}}>='{now}')")
        contracts = tables["contracts"].all(formula=formula)
        # print(f"Found {len(contracts)} active public_sell contracts for seller {seller_username}, building {seller_building_id}")
        return contracts
    except Exception as e:
        # print(f"Error getting public_sell contracts for seller {seller_username}, building {seller_building_id}: {str(e)}")
        return []

def get_all_active_public_sell_contracts(tables: Dict[str, Table]) -> List[Dict]:
    """Get all active public_sell contracts from all sellers."""
    try:
        now = datetime.now().isoformat()
        formula = f"AND({{Type}}='public_sell', {{CreatedAt}}<='{now}', {{EndAt}}>='{now}')"
        contracts = tables["contracts"].all(formula=formula)
        print(f"Found {len(contracts)} active public_sell contracts globally.")
        return contracts
    except Exception as e:
        print(f"Error getting all active public_sell contracts: {str(e)}")
        return []

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_price_setting_data(tables: Dict[str, Table], ai_citizen: Dict,
                              citizen_buildings: List[Dict],
                              building_definitions: Dict, resource_types: Dict,
                              all_buildings: List[Dict], # Add all_buildings for LandId lookup
                              all_active_public_sell_contracts: List[Dict] # Add all active public sell contracts
                              ) -> Dict:
    """Prepare a comprehensive data package for the AI to set resource prices."""
    
    # Create a mapping from BuildingId to LandId for all buildings
    building_id_to_land_id_map = {
        b["fields"].get("BuildingId"): b["fields"].get("LandId")
        for b in all_buildings if b["fields"].get("BuildingId") and b["fields"].get("LandId")
    }

    # Calculate global average prices for each resource type
    global_prices_by_resource: Dict[str, List[float]] = defaultdict(list)
    for contract in all_active_public_sell_contracts:
        res_type = contract["fields"].get("ResourceType")
        price = contract["fields"].get("PricePerResource")
        if res_type and price is not None:
            global_prices_by_resource[res_type].append(float(price))
    
    global_average_prices = {
        res: sum(prices) / len(prices) if prices else 0
        for res, prices in global_prices_by_resource.items()
    }
    
    # Extract citizen information
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    
    # Process buildings data
    buildings_data = []
    for building in citizen_buildings:
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        building_land_id = building["fields"].get("LandId") # Direct LandId string from building record
        
        # Get current prices from active public_sell contracts for this building and seller
        current_prices = {}
        active_sell_contracts = get_building_public_sell_contracts(tables, username, building_id)
        for contract in active_sell_contracts:
            resource_sold = contract["fields"].get("ResourceType")
            price_sold_at = contract["fields"].get("PricePerResource")
            if resource_sold and price_sold_at is not None:
                current_prices[resource_sold] = float(price_sold_at)
        
        # Get building definition to find production information
        building_def = building_definitions.get(building_type, {})
        production_info = building_def.get("productionInformation", {})
        
        # Extract outputs from production information
        outputs = []
        if production_info and isinstance(production_info, dict):
            # Check for Arti recipes
            arti_recipes = production_info.get("Arti", [])
            if arti_recipes and isinstance(arti_recipes, list):
                for recipe in arti_recipes:
                    if "outputs" in recipe and isinstance(recipe["outputs"], dict):
                        for output_id, quantity in recipe["outputs"].items():
                            if output_id not in outputs:
                                outputs.append(output_id)
            
            # Check for sells list
            sells_list = production_info.get("sells", [])
            if sells_list and isinstance(sells_list, list):
                for output_id in sells_list:
                    if output_id not in outputs:
                        outputs.append(output_id)
        
        # Calculate land-specific average prices for each resource type
        land_prices_by_resource: Dict[str, List[float]] = defaultdict(list)
        if building_land_id: # Only if the current AI's building has a LandId
            for contract in all_active_public_sell_contracts:
                seller_bldg_id_contract = contract["fields"].get("SellerBuilding")
                res_type_contract = contract["fields"].get("ResourceType")
                price_contract = contract["fields"].get("PricePerResource")

                if seller_bldg_id_contract and res_type_contract and price_contract is not None:
                    seller_bldg_land_id = building_id_to_land_id_map.get(seller_bldg_id_contract)
                    if seller_bldg_land_id == building_land_id:
                        land_prices_by_resource[res_type_contract].append(float(price_contract))
            
        land_average_prices = {
            res: sum(prices) / len(prices) if prices else 0
            for res, prices in land_prices_by_resource.items()
        }

        # Get resource information for each output
        output_resources = []
        for output_id in outputs:
            resource_info_def = resource_types.get(output_id, {})
            # current_price is now derived from active_sell_contracts for this specific building
            current_price_for_building = current_prices.get(output_id, 0) 
            import_price_def = resource_info_def.get("importPrice", 0)
            
            output_resources.append({
                "id": output_id,
                "name": resource_info_def.get("name", output_id),
                "category": resource_info_def.get("category", "Unknown"),
                "description": resource_info_def.get("description", ""),
                "importPrice": import_price_def,
                "currentPriceInThisBuilding": current_price_for_building,
                "globalAverageSellPrice": global_average_prices.get(output_id, 0),
                "landAverageSellPrice": land_average_prices.get(output_id, 0) if building_land_id else 0
            })
        
        # Only include buildings that have outputs
        if output_resources:
            building_info = {
                "id": building_id,
                "type": building_type,
                "name": building_def.get("name", building_type),
                "description": building_def.get("shortDescription", ""),
                "outputs": output_resources
            }
            buildings_data.append(building_info)
    
    # Prepare the complete data package
    data_package = {
        "citizen": {
            "username": username,
            "ducats": ducats,
            "total_buildings": len(buildings_data)
        },
        "buildings": buildings_data,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_price_setting_request(ai_username: str, data_package: Dict) -> Optional[Dict]:
    """Send the price setting request to the AI via Kinos API."""
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
        print(f"Sending price setting request to AI citizen {ai_username}")
        print(f"API URL: {url}")
        print(f"Citizen has {len(data_package['buildings'])} buildings with outputs")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a building owner in La Serenissima, you need to set prices for the resources produced in your buildings.

Here's your current situation:
- You own {len(data_package['buildings'])} buildings that produce resources
- Each building can produce different types of resources
- You need to set a competitive price for each resource

Please analyze the provided data and set appropriate prices for ALL SELLABLE resources in EACH of your buildings. Consider:
1. `importPrice`: The cost to import the resource. Selling below this is usually a loss unless inputs are very cheap.
2. `currentPriceInThisBuilding`: The price you are currently charging for this resource in this specific building.
3. `globalAverageSellPrice`: The average price this resource is sold for across all public sell contracts in Venice.
4. `landAverageSellPrice`: The average price this resource is sold for by buildings on the SAME LAND PARCEL as this building. This indicates very local competition.
5. The demand for different resource types (you may need to infer this or it might be provided in other data).
6. Competitive pricing strategies to maximize your profits. You might price slightly below averages to sell more, or above if you believe your location or stock offers an advantage.

After your analysis, provide your price decisions in this JSON format:
```json
{{
  "price_settings": [
    {{
      "building_id": "building-id-1",
      "resource_prices": {{
        "resource1": 10,
        "resource2": 200
      }},
      "reasoning": "brief explanation"
    }},
    {{
      "building_id": "building-id-2",
      "resource_prices": {{
        "resource3": 15,
        "resource4": 250
      }},
      "reasoning": "brief explanation"
    }}
  ]
}}
```

If you decide not to change any prices at this time, return an empty array:
```json
{{
  "price_settings": []
}}
```
"""
        
        # Create system instructions with the detailed data
        system_instructions = f"""
You are {ai_username}, an AI building owner in La Serenissima. You make your own decisions about pricing strategies.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your pricing strategy:
1. Analyze each resource's `importPrice` as a baseline.
2. Compare your `currentPriceInThisBuilding` with `globalAverageSellPrice` and `landAverageSellPrice`.
3. If your price is much higher than averages, you might not sell. If much lower, you might be losing profit.
4. Use `landAverageSellPrice` to understand immediate local competition.
5. Use `globalAverageSellPrice` for broader market understanding.
6. Consider setting prices slightly below the relevant average(s) to be competitive, or slightly above if your costs are high or you perceive high demand.
7. For rare or high-demand resources, you might set prices closer to or even above import price if market conditions support it.
8. Balance between maximizing profit and ensuring your goods will sell.
9. Consider the location and type of each building when setting prices.
10. Create a specific, actionable plan with building IDs and resource prices.
11. Provide brief reasoning for your pricing decisions, referencing the provided price points.

Your decision should be specific, data-driven, and focused on maximizing your income through strategic pricing.

IMPORTANT: You must end your response with a JSON object containing your specific price settings.
Include the building_id, resource_prices (a dictionary mapping resource IDs to prices), and reasoning for each building.
If you decide not to change any prices at this time, return an empty array.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 4,
            "max_files": 8,
            "max_tokens": 25000  
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
                print(f"Successfully sent price setting request to AI citizen {ai_username}")
                
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
                            if "price_settings" in decisions:
                                print(f"Found price settings in code block: {len(decisions['price_settings'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from code block: {str(e)}")
                    
                    # Next, try to find JSON with curly braces pattern
                    json_match = re.search(r'(\{[\s\S]*"price_settings"[\s\S]*\})', content)
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "price_settings" in decisions:
                                print(f"Found price settings in curly braces pattern: {len(decisions['price_settings'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from curly braces pattern: {str(e)}")
                    
                    # If we couldn't find a JSON block, try to parse the entire response
                    try:
                        decisions = json.loads(content)
                        if "price_settings" in decisions:
                            print(f"Found price settings in full response: {len(decisions['price_settings'])}")
                            return decisions
                    except json.JSONDecodeError:
                        print("Could not parse full response as JSON")
                    
                    # Last resort: try to extract just the array part
                    array_match = re.search(r'"price_settings"\s*:\s*(\[\s*\{.*?\}\s*\])', content, re.DOTALL)
                    if array_match:
                        array_str = array_match.group(1)
                        try:
                            array_data = json.loads(array_str)
                            decisions = {"price_settings": array_data}
                            print(f"Found price settings in array extraction: {len(decisions['price_settings'])}")
                            return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from array extraction: {str(e)}")
                    
                    # If we get here, no valid decision was found
                    print(f"No valid price setting decision found in AI response. Full response:")
                    print(content)
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {str(e)}")
                    print(f"Full response content that caused the error:")
                    print(content)
                    return None
            else:
                print(f"Error processing price setting request for AI citizen {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending price setting request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

def update_building_prices(tables, building_id: str, resource_prices: Dict[str, float], reasoning: str) -> bool:
    """Update the prices for resources in a building."""
    try:
        # Find the building record
        formula = f"{{BuildingId}}='{building_id}'"
        buildings = tables["buildings"].all(formula=formula)
        
        if not buildings:
            print(f"Building {building_id} not found")
            return False
        
        building = buildings[0]
        
        # Get existing Notes if any
        existing_notes = {}
        if "Notes" in building["fields"]:
            try:
                existing_notes = json.loads(building["fields"]["Notes"])
                if not isinstance(existing_notes, dict):
                    existing_notes = {}
            except json.JSONDecodeError:
                # If Notes isn't valid JSON, start with an empty dict
                existing_notes = {}
        
        # Add or update the PriceReasoning field in the Notes
        existing_notes["PriceReasoning"] = reasoning
        
        # Update the Prices field with the new resource prices
        tables["buildings"].update(building["id"], {
            "Prices": json.dumps(resource_prices),
            "Notes": json.dumps(existing_notes)
        })
        
        print(f"Updated prices for building {building_id} with {len(resource_prices)} resource prices")
        print(f"New prices: {json.dumps(resource_prices)}")
        return True
    except Exception as e:
        print(f"Error updating prices for building {building_id}: {str(e)}")
        return False

def create_admin_notification(tables, ai_price_settings: Dict[str, List[Dict]]) -> None:
    """Create a notification for admins with the AI price setting summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Price Setting Summary:\n\n"
        
        for ai_name, settings in ai_price_settings.items():
            message += f"- {ai_name}: {len(settings)} buildings with price updates\n"
            for setting in settings:
                building_id = setting.get("building_id", "unknown")
                resource_count = len(setting.get("resource_prices", {}))
                message += f"  * Building {building_id}: {resource_count} resources priced\n"
        
        # Create the notification
        notification = {
            "Citizen": "ConsiglioDeiDieci",  # Send to ConsiglioDeiDieci as requested
            "Type": "ai_price_settings",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_price_settings": ai_price_settings,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI price setting summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_price_settings(dry_run: bool = False):
    """Main function to process AI price settings."""
    print(f"Starting AI price setting process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Get building definitions
    building_definitions = get_building_definitions_from_api()
    if not building_definitions:
        print("No building definitions found, exiting")
        return

    # Get all buildings for LandId mapping
    all_buildings = get_all_buildings(tables)
    if not all_buildings:
        print("No buildings found for LandId mapping, exiting")
        return

    # Get all active public sell contracts for market price analysis
    all_active_public_sell_contracts = get_all_active_public_sell_contracts(tables)
    # It's okay if this is empty, averages will be 0.
    
    # Filter AI citizens to only those who own buildings that can sell resources
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Check if any building can sell resources
        has_sellable_building = False
        for building in citizen_buildings:
            building_type = building["fields"].get("Type", "")
            building_def = building_definitions.get(building_type, {})
            production_info = building_def.get("productionInformation", {})
            
            if production_info and isinstance(production_info, dict):
                sells = production_info.get("sells", [])
                if sells:
                    has_sellable_building = True
                    break
                    
        if has_sellable_building:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} has buildings that can sell resources, including in processing")
        else:
            print(f"AI citizen {ai_username} has no buildings that can sell resources, skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with buildings that can sell resources")
    
    if not ai_citizens:
        print("No AI citizens with buildings that can sell resources, exiting")
        return
    
    # Get building definitions
    building_definitions = get_building_definitions_from_api()
    if not building_definitions:
        print("No building definitions found, exiting")
        return
    
    # Get resource types
    resource_types = get_resource_types_from_api()
    if not resource_types:
        print("No resource types found, exiting")
        return
    
    # Track price settings for each AI
    ai_price_settings = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI citizen: {ai_username}")
        ai_price_settings[ai_username] = []
        
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        if not citizen_buildings:
            print(f"AI citizen {ai_username} has no buildings, skipping")
            continue
        
        # Prepare the data package for the AI
        data_package = prepare_price_setting_data(
            tables, ai_citizen, citizen_buildings, 
            building_definitions, resource_types,
            all_buildings, all_active_public_sell_contracts # Pass new data
        )
        
        # Check if there are any buildings with outputs
        if not data_package["buildings"]:
            print(f"AI citizen {ai_username} has no buildings with outputs, skipping")
            continue
        
        # Send the price setting request to the AI
        if not dry_run:
            decisions = send_price_setting_request(ai_username, data_package)
            
            if decisions and "price_settings" in decisions:
                price_settings = decisions["price_settings"]
                
                for setting in price_settings:
                    building_id = setting.get("building_id")
                    resource_prices = setting.get("resource_prices", {})
                    reasoning = setting.get("reasoning", "No reasoning provided")
                    
                    if not building_id or not resource_prices:
                        print(f"Invalid price setting: {setting}")
                        continue
                    
                    # Update the building prices
                    success = update_building_prices(tables, building_id, resource_prices, reasoning)
                    
                    if success:
                        # Add to the list of settings for this AI
                        ai_price_settings[ai_username].append({
                            "building_id": building_id,
                            "resource_prices": resource_prices,
                            "reasoning": reasoning
                        })
            else:
                print(f"No valid price setting decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send price setting request to AI citizen {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package['citizen']['username']}")
            print(f"  - Buildings with outputs: {len(data_package['buildings'])}")
            
            # Log some sample buildings and their outputs
            for i, building in enumerate(data_package['buildings'][:3]):  # Show up to 3 buildings
                print(f"  - Building {i+1}: {building['type']} ({building['id']})")
                print(f"    Outputs: {', '.join([output['id'] for output in building['outputs']])}")
            
            if len(data_package['buildings']) > 3:
                print(f"    ... and {len(data_package['buildings']) - 3} more buildings")
    
    # Create admin notification with summary
    if not dry_run and any(settings for settings in ai_price_settings.values()):
        create_admin_notification(tables, ai_price_settings)
    else:
        print(f"[DRY RUN] Would create admin notification with price settings: {ai_price_settings}")
    
    print("AI price setting process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_price_settings(dry_run)
