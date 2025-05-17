import os
import sys
import json
import traceback
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

def get_citizen_buildings(tables, citizenname: str) -> List[Dict]:
    """Get all buildings owned by a specific citizen."""
    try:
        # Query buildings where the citizen is the owner
        formula = f"{{Owner}}='{citizenname}'"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings owned by {citizenname}")
        return buildings
    except Exception as e:
        print(f"Error getting buildings for citizen {citizenname}: {str(e)}")
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

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_price_setting_data(ai_citizen: Dict, citizen_buildings: List[Dict], 
                              building_definitions: Dict, resource_types: Dict) -> Dict:
    """Prepare a comprehensive data package for the AI to set resource prices."""
    
    # Extract citizen information
    citizenname = ai_citizen["fields"].get("Citizenname", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    
    # Process buildings data
    buildings_data = []
    for building in citizen_buildings:
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        
        # Get current prices if they exist
        current_prices = {}
        if "Prices" in building["fields"]:
            try:
                current_prices = json.loads(building["fields"]["Prices"])
            except json.JSONDecodeError:
                current_prices = {}
        
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
        
        # Get resource information for each output
        output_resources = []
        for output_id in outputs:
            resource_info = resource_types.get(output_id, {})
            current_price = current_prices.get(output_id, 0)
            import_price = resource_info.get("importPrice", 0)
            
            output_resources.append({
                "id": output_id,
                "name": resource_info.get("name", output_id),
                "category": resource_info.get("category", "Unknown"),
                "description": resource_info.get("description", ""),
                "importPrice": import_price,
                "currentPrice": current_price
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
            "citizenname": citizenname,
            "ducats": ducats,
            "total_buildings": len(buildings_data)
        },
        "buildings": buildings_data,
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_price_setting_request(ai_citizenname: str, data_package: Dict) -> Optional[Dict]:
    """Send the price setting request to the AI via Kinos API."""
    try:
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        
        # Construct the API URL
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_citizenname}/messages"
        
        # Set up headers with API key
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Log the API request details
        print(f"Sending price setting request to AI citizen {ai_citizenname}")
        print(f"API URL: {url}")
        print(f"Citizen has {len(data_package['buildings'])} buildings with outputs")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a building owner in La Serenissima, you need to set prices for the resources produced in your buildings.

Here's your current situation:
- You own {len(data_package['buildings'])} buildings that produce resources
- Each building can produce different types of resources
- You need to set a competitive price for each resource

Please analyze the market and set appropriate prices for each resource in each of your buildings. Consider:
1. The import price of each resource (this is what merchants would pay to import it)
2. The current price you're charging (if any)
3. The demand for different resource types
4. Competitive pricing strategies to maximize your profits

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
You are {ai_citizenname}, an AI building owner in La Serenissima. You make your own decisions about pricing strategies.

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

When developing your pricing strategy:
1. Analyze each resource's import price as a reference point
2. Consider setting prices slightly below import price to be competitive
3. For rare or high-demand resources, you might set prices closer to or even above import price
4. Balance between maximizing profit and ensuring your goods will sell
5. Consider the location and type of each building when setting prices
6. Create a specific, actionable plan with building IDs and resource prices
7. Provide brief reasoning for your pricing decisions

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
        print(f"Making API request to Kinos for {ai_citizenname}...")
        response = requests.post(url, headers=headers, json=payload)
        
        # Log the API response details
        print(f"API response status code: {response.status_code}")
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            
            print(f"API response status: {status}")
            
            if status == "completed":
                print(f"Successfully sent price setting request to AI citizen {ai_citizenname}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                
                # Log the entire response for debugging
                print(f"FULL AI RESPONSE FROM {ai_citizenname}:")
                print("="*80)
                print(content)
                print("="*80)
                
                print(f"AI {ai_citizenname} response length: {len(content)} characters")
                print(f"AI {ai_citizenname} response preview: {content[:200]}...")
                
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
                print(f"Error processing price setting request for AI citizen {ai_citizenname}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending price setting request to AI citizen {ai_citizenname}: {str(e)}")
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
            "Citizen": "NLR",  # Send to NLR as requested
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
    
    # Get resource types
    resource_types = get_resource_types_from_api()
    if not resource_types:
        print("No resource types found, exiting")
        return
    
    # Track price settings for each AI
    ai_price_settings = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_citizenname = ai_citizen["fields"].get("Citizenname")
        if not ai_citizenname:
            continue
        
        print(f"Processing AI citizen: {ai_citizenname}")
        ai_price_settings[ai_citizenname] = []
        
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_citizenname)
        
        if not citizen_buildings:
            print(f"AI citizen {ai_citizenname} has no buildings, skipping")
            continue
        
        # Prepare the data package for the AI
        data_package = prepare_price_setting_data(ai_citizen, citizen_buildings, building_definitions, resource_types)
        
        # Check if there are any buildings with outputs
        if not data_package["buildings"]:
            print(f"AI citizen {ai_citizenname} has no buildings with outputs, skipping")
            continue
        
        # Send the price setting request to the AI
        if not dry_run:
            decisions = send_price_setting_request(ai_citizenname, data_package)
            
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
                        ai_price_settings[ai_citizenname].append({
                            "building_id": building_id,
                            "resource_prices": resource_prices,
                            "reasoning": reasoning
                        })
            else:
                print(f"No valid price setting decisions received for {ai_citizenname}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send price setting request to AI citizen {ai_citizenname}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package['citizen']['citizenname']}")
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
