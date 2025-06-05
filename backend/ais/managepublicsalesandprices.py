import os
import sys
import json
import traceback
import argparse # Added argparse
from collections import defaultdict # Added from setprices.py
from datetime import datetime, timedelta
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
from pprint import pformat # Added for pretty printing data
import textwrap # Added for text wrapping in logs
import logging # Added to define log

# colorama initialization is handled by log_header or globally
# Setup logging
log = logging.getLogger(__name__)
logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO').upper(), 
                    format='%(asctime)s - %(levelname)s - %(module)s - %(message)s',
                    stream=sys.stdout)

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.engine.utils.activity_helpers import log_header, LogColors, Fore, Style # Import shared log_header, LogColors, and colorama elements if needed by other log functions

# Configuration for API calls
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
# log is already defined in this script.

def _get_notifications_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches recent notifications for a citizen via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/notifications" # BASE_URL is defined in the script
        payload = {"citizen": username, "limit": limit}
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "notifications" in data:
            return data["notifications"]
        log.warning(f"Failed to get notifications for {username} from API: {data.get('error')}") # Uses script's log
        return []
    except requests.exceptions.RequestException as e:
        log.error(f"API request error fetching notifications for {username}: {e}") # Uses script's log
        return []
    except json.JSONDecodeError:
        log.error(f"JSON decode error fetching notifications for {username}. Response: {response.text[:200]}") # Uses script's log
        return []

# Add the parent directory to the path to import citizen_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

# Logging functions (similar to buildbuildings.py)
def log_data(label, data, indent=2):
    """Pretty print data with a label."""
    print(f"{Fore.MAGENTA}{label}:{Style.RESET_ALL}")
    formatted_data = pformat(data, indent=indent, width=100)
    indented_data = textwrap.indent(formatted_data, ' ' * indent)
    print(indented_data)

def _escape_airtable_value(value: str) -> str:
    """Échappe les apostrophes pour les formules Airtable."""
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value) # Ensure it's a string if not already

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
        "resources": Table(airtable_api_key, airtable_base_id, "RESOURCES"),
        "contracts": Table(airtable_api_key, airtable_base_id, "CONTRACTS"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice."""
    try:
        # Query citizens with IsAI=true, InVenice=true
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(ai_citizens)} AI citizens in Venice")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
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
                
                building_defs = {}
                for building in building_types:
                    if "type" in building:
                        building_defs[building["type"]] = {
                            "type": building["type"],
                            "name": building.get("name"),
                            "consumeTier": building.get("consumeTier"),
                            "buildTier": building.get("buildTier"),
                            "tier": building.get("tier"),
                            "productionInformation": building.get("productionInformation", {}),
                            # Inclure d'autres champs si nécessaire
                        }
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

def get_citizen_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings run by a specific citizen."""
    try:
        # Query buildings where the citizen is running the building
        formula = f"{{RunBy}}='{username}'"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} buildings run by {username}")
        return buildings
    except Exception as e:
        print(f"Error getting buildings for citizen {username}: {str(e)}")
        return []

def get_citizen_resources(tables, username: str) -> List[Dict]:
    """Get all resources owned by a specific citizen."""
    try:
        # Query resources where the citizen is the owner
        formula = f"{{Owner}}='{username}'"
        resources = tables["resources"].all(formula=formula)
        print(f"Found {len(resources)} resources owned by {username}")
        return resources
    except Exception as e:
        print(f"Error getting resources for citizen {username}: {str(e)}")
        return []

def get_citizen_active_contracts(tables, username: str) -> List[Dict]:
    """Get all active contracts where the citizen is the seller."""
    try:
        # Get current time in Venice timezone
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso_venice = now_venice.isoformat()
        
        # Query contracts where the citizen is the seller and the contract is active (between CreatedAt and EndAt)
        formula = f"AND({{Seller}}='{username}', {{CreatedAt}}<='{now_iso_venice}', {{EndAt}}>='{now_iso_venice}')"
        contracts = tables["contracts"].all(formula=formula)
        print(f"Found {len(contracts)} active contracts where {username} is the seller")
        return contracts
    except Exception as e:
        print(f"Error getting contracts for citizen {username}: {str(e)}")
        return []

def get_recent_public_sell_contracts(tables, username: str, limit: int = 100) -> List[Dict]:
    """Get recent public_sell contracts from other players to analyze contract prices."""
    try:
        # Get current time
        now = datetime.now().isoformat()
        
        # Query contracts where:
        # 1. Type is public_sell
        # 2. Seller is not the current AI citizen
        # 3. Contract is active (between CreatedAt and EndAt)
        formula = f"AND({{Type}}='public_sell', {{Seller}}!='{username}', {{CreatedAt}}<='{now}', {{EndAt}}>='{now}')"
        
        # Get the contracts and sort by created date descending
        contracts = tables["contracts"].all(formula=formula)
        
        # Sort by CreatedAt descending and limit to the specified number
        sorted_contracts = sorted(
            contracts, 
            key=lambda x: x["fields"].get("CreatedAt", ""), 
            reverse=True
        )[:limit]
        
        print(f"Found {len(sorted_contracts)} recent public_sell contracts from other players (limited to {limit})")
        
        # Transform into a more usable format
        contract_contracts = []
        for contract in sorted_contracts:
            contract_contracts.append({
                "id": contract["fields"].get("ContractId", ""),
                "seller": contract["fields"].get("Seller", ""),
                "resource_type": contract["fields"].get("ResourceType", ""),
                "target_amount": contract["fields"].get("targetAmount", 0),
                "price_per_resource": contract["fields"].get("PricePerResource", 0),
                "created_at": contract["fields"].get("CreatedAt", "")
            })
        
        return contract_contracts
    except Exception as e:
        print(f"Error getting recent public_sell contracts: {str(e)}")
        return []

# --- Functions integrated from setprices.py ---
def get_all_buildings(tables) -> List[Dict]:
    """Get all buildings from Airtable."""
    try:
        buildings = tables["buildings"].all()
        print(f"Found {len(buildings)} buildings in total")
        return buildings
    except Exception as e:
        print(f"Error getting all buildings: {str(e)}")
        return []

def get_citizen_relevancies_from_api(username: str, limit: int = 100) -> List[Dict]:
    """Get the latest relevancies for a citizen from the API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        url = f"{api_base_url}/api/relevancies?relevantToCitizen={username}&limit={limit}"
        print(f"Fetching relevancies for {username} from API: {url}")
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and "relevancies" in data:
                relevancies = data["relevancies"]
                print(f"Successfully fetched {len(relevancies)} relevancies for {username}.")
                return relevancies
            else:
                print(f"Unexpected API response format for relevancies: {data}")
                return []
        else:
            print(f"Error fetching relevancies from API: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        print(f"Exception fetching relevancies from API for {username}: {str(e)}")
        return []

def get_citizen_problems_from_api(username: str, limit: int = 100) -> List[Dict]:
    """Get the latest active problems for a citizen from the API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        url = f"{api_base_url}/api/problems?citizen={username}&status=active&limit={limit}&sort=-createdAt"
        print(f"Fetching problems for {username} from API: {url}")
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                problems = data
                print(f"Successfully fetched {len(problems)} problems for {username}.")
                return problems
            else:
                if data.get("success") and "problems" in data:
                    problems = data["problems"]
                    print(f"Successfully fetched {len(problems)} problems for {username} (wrapped structure).")
                    return problems
                print(f"Unexpected API response format for problems: {data}")
                return []
        else:
            print(f"Error fetching problems from API: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        print(f"Exception fetching problems from API for {username}: {str(e)}")
        return []

def get_all_active_public_sell_contracts(tables: Dict[str, Table]) -> List[Dict]:
    """Get all active public_sell contracts from all sellers."""
    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso_venice = now_venice.isoformat()
        formula = f"AND({{Type}}='public_sell', {{CreatedAt}}<='{now_iso_venice}', {{EndAt}}>='{now_iso_venice}')"
        contracts = tables["contracts"].all(formula=formula)
        print(f"Found {len(contracts)} active public_sell contracts globally.")
        return contracts
    except Exception as e:
        print(f"Error getting all active public_sell contracts: {str(e)}")
        return []
# --- End of functions integrated from setprices.py ---

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_sales_and_price_strategy_data(
    tables: Dict[str, Table],
    ai_citizen: Dict,
    citizen_buildings: List[Dict],
    citizen_resources: List[Dict],
    citizen_active_contracts: List[Dict], # Active contracts for this AI
    all_active_public_sell_contracts: List[Dict], # All public sell contracts for market analysis
    all_buildings: List[Dict], # All buildings for LandId mapping
    building_types: Dict,
    resource_types: Dict
) -> Dict:
    """Prepare a comprehensive data package for the AI to make public sell and pricing decisions."""
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)

    # Create a mapping from BuildingId to LandId for all buildings
    building_id_to_land_id_map = {
        b["fields"].get("BuildingId"): b["fields"].get("LandId")
        for b in all_buildings if b["fields"].get("BuildingId") and b["fields"].get("LandId")
    }

    # Calculate global average prices for each resource type from all_active_public_sell_contracts
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

    # Fetch latest relevancies and problems for the citizen
    latest_relevancies = get_citizen_relevancies_from_api(username)
    latest_problems = get_citizen_problems_from_api(username)
    # Fetch general notifications for the AI
    recent_notifications_for_ai = _get_notifications_data_api(username)

    # Process buildings data for the AI citizen
    sellable_buildings_data = []
    for building in citizen_buildings: # These are buildings run by the AI
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        building_land_id = building["fields"].get("LandId") # Direct LandId string from building record
        
        building_def = building_types.get(building_type, {})
        production_info = building_def.get("productionInformation", {})
        
        # Determine sellable resources for this building
        sellable_resource_ids = []
        if production_info and isinstance(production_info, dict):
            # Check for Arti recipes outputs
            arti_recipes = production_info.get("Arti", [])
            if arti_recipes and isinstance(arti_recipes, list):
                for recipe in arti_recipes:
                    if "outputs" in recipe and isinstance(recipe["outputs"], dict):
                        for output_id in recipe["outputs"].keys():
                            if output_id not in sellable_resource_ids:
                                sellable_resource_ids.append(output_id)
            # Check for 'sells' list
            sells_list = production_info.get("sells", [])
            if sells_list and isinstance(sells_list, list):
                for sell_id in sells_list:
                    if sell_id not in sellable_resource_ids:
                        sellable_resource_ids.append(sell_id)
        
        if not sellable_resource_ids:
            continue # This building cannot sell anything or has no defined outputs/sells

        # Get current prices from active public_sell contracts for THIS building and THIS AI
        current_prices_in_this_building = {}
        # citizen_active_contracts are already filtered for this AI as seller
        for contract in citizen_active_contracts: 
            if contract["fields"].get("SellerBuilding") == building_id and contract["fields"].get("Type") == "public_sell":
                resource_sold = contract["fields"].get("ResourceType")
                price_sold_at = contract["fields"].get("PricePerResource")
                if resource_sold and price_sold_at is not None:
                    current_prices_in_this_building[resource_sold] = float(price_sold_at)
        
        # Calculate land-specific average prices for each resource type
        land_prices_by_resource: Dict[str, List[float]] = defaultdict(list)
        if building_land_id:
            for contract_market in all_active_public_sell_contracts: # Iterate all market contracts
                seller_bldg_id_contract = contract_market["fields"].get("SellerBuilding")
                res_type_contract = contract_market["fields"].get("ResourceType")
                price_contract = contract_market["fields"].get("PricePerResource")

                if seller_bldg_id_contract and res_type_contract and price_contract is not None:
                    seller_bldg_land_id = building_id_to_land_id_map.get(seller_bldg_id_contract)
                    if seller_bldg_land_id == building_land_id: # If on the same land parcel
                        land_prices_by_resource[res_type_contract].append(float(price_contract))
            
        land_average_prices = {
            res: sum(prices) / len(prices) if prices else 0
            for res, prices in land_prices_by_resource.items()
        }

        # Prepare resource details for sellable resources from this building
        output_resources_details = []
        for res_id in sellable_resource_ids:
            resource_info_def = resource_types.get(res_id, {})
            output_resources_details.append({
                "id": res_id,
                "name": resource_info_def.get("name", res_id),
                "category": resource_info_def.get("category", "Unknown"),
                "importPrice": resource_info_def.get("importPrice", 0),
                "currentPriceInThisBuilding": current_prices_in_this_building.get(res_id, 0), # Price AI is currently asking
                "globalAverageSellPrice": global_average_prices.get(res_id, 0),
                "landAverageSellPrice": land_average_prices.get(res_id, 0) if building_land_id else 0
            })
        
        sellable_buildings_data.append({
            "id": building_id,
            "type": building_type,
            "name": building_def.get("name", building_type),
            "sellable_resources": output_resources_details # List of resources this building can sell with price info
        })

    # Process citizen's existing public sell contracts (for the "contracts_to_end" decision)
    existing_ai_public_sell_contracts = []
    for contract in citizen_active_contracts:
        if contract["fields"].get("Type") == "public_sell":
            existing_ai_public_sell_contracts.append({
                "contract_id": contract["fields"].get("ContractId", contract["id"]), # Use ContractId if available
                "resource_type": contract["fields"].get("ResourceType", ""),
                "seller_building": contract["fields"].get("SellerBuilding", ""),
                "target_amount": contract["fields"].get("TargetAmount", 0), # Corrected field name
                "price_per_resource": contract["fields"].get("PricePerResource", 0),
                "end_at": contract["fields"].get("EndAt", "")
            })
            
    # Resources owned by the citizen (summary by type, not by building for this overview)
    citizen_owned_resources_summary = defaultdict(float)
    for resource in citizen_resources: # citizen_resources are all resources owned by AI
        res_type = resource["fields"].get("Type")
        count = float(resource["fields"].get("Count", 0))
        if res_type:
            citizen_owned_resources_summary[res_type] += count

    data_package = {
        "citizen": {
            "username": username,
            "ducats": ducats,
            "total_buildings_run": len(citizen_buildings), # Buildings AI runs
            "sellable_buildings_count": len(sellable_buildings_data)
        },
        "sellable_buildings_with_market_data": sellable_buildings_data,
        "citizen_owned_resources_summary": dict(citizen_owned_resources_summary),
        "existing_ai_public_sell_contracts": existing_ai_public_sell_contracts,
        "recent_notifications_for_ai": recent_notifications_for_ai,
        "latest_relevancies": latest_relevancies[:10], # Limit for brevity
        "latest_problems": latest_problems[:10],     # Limit for brevity
        "timestamp": datetime.now(pytz.timezone('Europe/Rome')).isoformat()
    }
    return data_package

def send_sales_and_price_strategy_request(ai_username: str, data_package: Dict, kinos_model_override: Optional[str] = None) -> Optional[Dict]:
    """Send the combined sales and price strategy request to the AI via Kinos API."""
    try:
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/messages"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

        print(f"Sending combined sales and price strategy request to AI citizen {ai_username}")
        print(f"Citizen has {data_package['citizen']['sellable_buildings_count']} buildings that can sell resources.")

        prompt = f"""
As a merchant in La Serenissima, you need to decide which resources to sell publicly, at what price, and in what quantity. You also need to manage your existing public sell contracts.

Here's your current situation:
- You run {data_package['citizen']['sellable_buildings_count']} buildings that can sell resources.
- You have various resource stockpiles (see `citizen_owned_resources_summary`).
- You currently have {len(data_package['existing_ai_public_sell_contracts'])} active public sell contracts.
- Market data (average prices, import prices) for resources your buildings can sell is provided in `sellable_buildings_with_market_data`.
- Recent relevancies and problems affecting you are in `latest_relevancies` and `latest_problems`.

Please analyze your buildings, resources, market data, and existing contracts to develop a comprehensive sales and pricing strategy.

Your decisions should be provided in this JSON format:
```json
{{
  "contracts_to_create_or_update": [
    {{
      "building_id": "building_id_1",      // Custom BuildingId (e.g., bld_...)
      "resource_type": "resource_type_1",  // Resource ID (e.g., wood, iron_ore)
      "price_per_resource": 150.75,        // Desired selling price
      "target_amount": 20.0,               // Desired hourly amount to sell
      "reasoning": "brief explanation for this specific decision"
    }}
    // ... more entries for other resources/buildings you want to actively sell
  ],
  "contracts_to_end": [
    {{
      "contract_id": "contract-public-sell-...", // Deterministic ContractId of an existing contract
      "reason": "brief explanation for ending this contract"
    }}
    // ... more entries for contracts you want to explicitly end
  ]
}}
```

If you decide not to make any changes (no new/updated sales, no contracts to end), return empty arrays for both.

Consider the following when making your decisions:
1.  For each resource your buildings can sell (see `sellable_buildings_with_market_data.[].sellable_resources`):
    *   Compare its `importPrice` with `globalAverageSellPrice` and `landAverageSellPrice`.
    *   Review your `currentPriceInThisBuilding`.
    *   Decide on a new `price_per_resource`. A common strategy is 1.2x to 1.5x `importPrice`, or slightly below market averages to be competitive.
    *   Decide on an `target_amount` to sell, considering your `citizen_owned_resources_summary`. Don't offer to sell more than you can sustain.
    *   If you want to sell a resource from a building, include it in `contracts_to_create_or_update`. This will either create a new public sell contract or update an existing one for that specific building-resource pair.
2.  Review your `existing_ai_public_sell_contracts`. If any are no longer strategic (e.g., price too low, resource needed internally, want to stop selling it), add its `contract_id` to `contracts_to_end`.
3.  Use `latest_relevancies` and `latest_problems` to inform your strategy (e.g., if a problem indicates a shortage of a resource you produce, you might increase its price).

Your goal is to optimize your public sales for profitability and resource management.
"""
        def clean_for_json(obj):
            if isinstance(obj, str):
                return ''.join(c if ord(c) >= 32 or c in '\n\r\t' else ' ' for c in obj)
            elif isinstance(obj, dict):
                return {clean_for_json(k): clean_for_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_for_json(item) for item in obj]
            else:
                return obj

        cleaned_data = clean_for_json(data_package)
        serialized_data = json.dumps(cleaned_data, indent=2, ensure_ascii=True)

        system_instructions = f"""
You are {ai_username}, an AI merchant in La Serenissima. You make your own decisions about your public sales and pricing strategy.

Here is the complete data about your current situation:
{serialized_data}

IMPORTANT: You must end your response with a JSON object containing your specific decisions in the format specified in the prompt (`contracts_to_create_or_update` and `contracts_to_end`).
Provide reasoning for each decision.
If you decide not to make any changes, return empty arrays for both lists.
"""
        payload = {
            "message": prompt, # Kinos v2 uses "message" not "content"
            "addSystem": system_instructions,
            "min_files": 5, # Adjusted based on typical Kinos usage
            "max_files": 15, # Adjusted
            "max_tokens": 30000 # Increased token limit for potentially complex data
        }

        if kinos_model_override:
            payload["model"] = kinos_model_override
            print(f"Using Kinos model override '{kinos_model_override}' for {ai_username} (sales & pricing).")

        print(f"Making API request to Kinos for {ai_username} (Sales & Pricing)...")
        response = requests.post(url, headers=headers, json=payload)
        print(f"API response status code: {response.status_code}")

        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            print(f"API response status: {status}")

            if status == "completed":
                content = response_data.get('response', '')
                print(f"Successfully received sales & pricing strategy from AI citizen {ai_username}")
                print(f"\nCOMPLETE AI RESPONSE FROM {ai_username} (Sales & Pricing):\n{'='*80}\n{content}\n{'='*80}\n")
                
                try:
                    import re
                    json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', content, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(1)
                    else: # If no markdown block, try to parse the whole content if it looks like JSON
                        if content.strip().startswith("{") and content.strip().endswith("}"):
                             json_str = content
                        else: # Try to find the JSON object if it's embedded
                            json_match_direct = re.search(r'(\{[\s\S]*"contracts_to_create_or_update"[\s\S]*"contracts_to_end"[\s\S]*\})', content)
                            if json_match_direct:
                                json_str = json_match_direct.group(1)
                            else:
                                print("No JSON block found in AI response.")
                                return None
                                
                    decisions = json.loads(json_str)
                    if "contracts_to_create_or_update" in decisions and "contracts_to_end" in decisions:
                        print(f"Parsed decisions: {len(decisions['contracts_to_create_or_update'])} to create/update, {len(decisions['contracts_to_end'])} to end.")
                        return decisions
                    else:
                        print("Parsed JSON, but missing expected keys ('contracts_to_create_or_update', 'contracts_to_end').")
                        return None
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON from AI response: {e}. Response content was:\n{content}")
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {e}. Full response:\n{content}")
                    return None
            else:
                print(f"Error processing sales & pricing strategy request for AI citizen {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending sales & pricing strategy request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

def validate_create_or_update_contract_decision(
    decision: Dict,
    sellable_buildings_data: List[Dict], # This is data_package["sellable_buildings_with_market_data"]
    resource_types_definitions: Dict # This is the global resource_types from API
) -> bool:
    """Validate that a contract creation/update decision is valid."""
    building_id = decision.get("building_id")
    resource_type = decision.get("resource_type")
    target_amount = decision.get("target_amount")
    price_per_resource = decision.get("price_per_resource")

    if not all([building_id, resource_type, target_amount is not None, price_per_resource is not None]):
        print(f"Invalid decision: missing required fields - {decision}")
        return False

    try:
        if float(target_amount) <= 0:
            print(f"Invalid target_amount: {target_amount} must be positive.")
            return False
        if float(price_per_resource) <= 0:
            print(f"Invalid price_per_resource: {price_per_resource} must be positive.")
            return False
    except (ValueError, TypeError):
        print(f"Invalid numeric value for target_amount or price_per_resource: {decision}")
        return False

    # Check if the building exists for the AI and can sell this resource
    target_building_info = next((b for b in sellable_buildings_data if b["id"] == building_id), None)
    if not target_building_info:
        print(f"Building {building_id} not found in AI's sellable buildings or cannot sell specified resource.")
        return False
    
    can_sell_resource = any(r["id"] == resource_type for r in target_building_info.get("sellable_resources", []))
    if not can_sell_resource:
        print(f"Building {building_id} is not configured to sell resource {resource_type}.")
        return False

    if resource_type not in resource_types_definitions:
        print(f"Resource type {resource_type} definition not found.")
        return False
        
    # Further checks like citizen having enough stock could be added if `citizen_owned_resources_summary` was more granular
    # For now, this basic validation is fine. The AI is instructed to consider stock.
    return True


def validate_end_contract_decision(
    decision: Dict,
    existing_ai_public_sell_contracts: List[Dict] # This is data_package["existing_ai_public_sell_contracts"]
) -> bool:
    """Validate that a contract ending decision is valid."""
    contract_id_to_end = decision.get("contract_id")
    if not contract_id_to_end:
        print(f"Invalid contract ending decision: missing contract_id - {decision}")
        return False
    
    contract_found = any(c["contract_id"] == contract_id_to_end for c in existing_ai_public_sell_contracts)
    if not contract_found:
        print(f"Contract {contract_id_to_end} not found in AI's existing public sell contracts.")
        return False
    return True

def create_or_update_public_sell_contract_from_decision(
    tables: Dict[str, Table],
    ai_username: str,
    decision: Dict, # A single item from "contracts_to_create_or_update"
    resource_definitions: Dict # Global resource definitions for names etc.
) -> bool:
    """Create or update a public sell contract based on the AI's decision using a deterministic ContractId."""
    try:
        building_id = decision["building_id"] # Custom BuildingId
        resource_type = decision["resource_type"]
        target_amount = float(decision["target_amount"])
        price_per_resource = float(decision["price_per_resource"])
        reasoning = decision.get("reasoning", "AI decision.") # Use "reasoning" from AI
        
        # Deterministic ContractId: contract-public-sell-{SELLER_USERNAME}-{SELLER_BUILDING_ID}-{RESOURCE_TYPE}
        # This ensures one active public sell contract per resource, per building, per AI.
        custom_contract_id = f"contract-public-sell-{ai_username}-{building_id}-{resource_type}"
        
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        # Public sell contracts are set for 47 hours as per existing logic
        end_date_venice = now_venice + timedelta(hours=47)
        end_date_iso = end_date_venice.isoformat()

        existing_contract_record = None
        try:
            formula = f"{{ContractId}}='{_escape_airtable_value(custom_contract_id)}'"
            records = tables["contracts"].all(formula=formula, max_records=1)
            if records:
                existing_contract_record = records[0]
        except Exception as e_check:
            print(f"Error checking for existing public sell contract {custom_contract_id}: {e_check}")

        contract_notes = json.dumps({
            "reasoning": reasoning,
            "managed_by_script": "managepublicsalesandprices.py",
            "timestamp": now_iso
        })

        if existing_contract_record:
            airtable_record_id = existing_contract_record["id"]
            update_fields = {
                "TargetAmount": 0.0, # Changed to 0.0 as per request
                "PricePerResource": price_per_resource,
                "EndAt": end_date_iso, # Refresh EndAt
                "Notes": contract_notes
            }
            tables["contracts"].update(airtable_record_id, update_fields)
            print(f"Updated public sell contract {custom_contract_id} for {resource_type} from building {building_id}: Airtable.TargetAmount=0.0 (AI decision was Amount={target_amount}), Price={price_per_resource}")
        else:
            resource_name = resource_definitions.get(resource_type, {}).get("name", resource_type)
            new_contract_data = {
                "ContractId": custom_contract_id,
                "Seller": ai_username,
                "Buyer": "public",
                "Type": "public_sell",
                "ResourceType": resource_type,
                # "Transporter": "public", # Removed as per request
                "SellerBuilding": building_id, # Custom BuildingId
                "BuyerBuilding": None,
                "TargetAmount": 0.0, # Changed to 0.0 as per request
                "PricePerResource": price_per_resource,
                "Priority": 1,
                "CreatedAt": now_iso,
                "EndAt": end_date_iso,
                "Notes": contract_notes
            }
            tables["contracts"].create(new_contract_data)
            print(f"Created new public sell contract {custom_contract_id} for {resource_type} (Name: {resource_name}) from building {building_id}: Airtable.TargetAmount=0.0 (AI decision was Amount={target_amount}), Price={price_per_resource}")
        return True
    except Exception as e:
        print(f"Error creating/updating public sell contract for building {decision.get('building_id', 'N/A')}, resource {decision.get('resource_type', 'N/A')}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def end_public_sell_contract( # Renamed from original for clarity, functionality is similar
    tables: Dict[str, Table], 
    contract_custom_id_to_end: str, # Expecting the deterministic ContractId
    reason: str
) -> bool:
    """End an existing public sell contract by setting its EndAt to now."""
    try:
        formula = f"{{ContractId}}='{_escape_airtable_value(contract_custom_id_to_end)}'"
        contracts_to_end = tables["contracts"].all(formula=formula, max_records=1)
        
        if not contracts_to_end:
            print(f"Contract with ContractId '{contract_custom_id_to_end}' not found in Airtable for ending.")
            return False
        
        record_id = contracts_to_end[0]["id"]
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        
        # Preserve existing notes if possible, or append to them
        existing_notes_str = contracts_to_end[0]["fields"].get("Notes", "{}")
        try:
            existing_notes_dict = json.loads(existing_notes_str)
        except json.JSONDecodeError:
            existing_notes_dict = {"original_notes": existing_notes_str}
        
        updated_notes_dict = {
            **existing_notes_dict,
            "ending_reason": reason,
            "ended_by_script": "managepublicsalesandprices.py",
            "ended_at_timestamp": now_iso
        }

        tables["contracts"].update(record_id, {
            "EndAt": now_iso, # Set EndAt to now to effectively end it
            "Status": "ended_by_ai", # Optional: update status
            "Notes": json.dumps(updated_notes_dict)
        })
        print(f"Ended public sell contract {contract_custom_id_to_end}.")
        
        return True
    except Exception as e:
        print(f"Error ending public sell contract: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def create_admin_notification(tables: Dict[str, Table], ai_sales_and_price_results: Dict[str, Dict]) -> None:
    """Create a notification for admins with the AI sales and price strategy results."""
    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        message = "AI Public Sales & Pricing Strategy Results:\n\n"

        for ai_name, results in ai_sales_and_price_results.items():
            created_updated_count = results.get("created_updated", 0)
            ended_count = results.get("ended", 0)
            message += f"- {ai_name}: Created/Updated {created_updated_count} contracts, Ended {ended_count} contracts\n"

            if "created_updated_contracts" in results and results["created_updated_contracts"]:
                message += "  Created/Updated Contracts:\n"
                for contract_info in results["created_updated_contracts"]:
                    message += (f"    * Bldg {contract_info['building_id']}: {contract_info['resource_type']} "
                                f"@ {contract_info['price_per_resource']:.2f} Ducats, {contract_info['target_amount']:.1f}/hr. "
                                f"Reason: {contract_info.get('reasoning', 'N/A')}\n")
            
            if "ended_contracts" in results and results["ended_contracts"]:
                message += "  Ended Contracts:\n"
                for contract_info in results["ended_contracts"]:
                    message += f"    * Contract {contract_info['contract_id']}. Reason: {contract_info.get('reason', 'N/A')}\n"
        
        notification_payload = {
            "Citizen": "ConsiglioDeiDieci",
            "Type": "ai_sales_pricing_strategy", # New type
            "Content": message,
            "CreatedAt": now_iso,
            "ReadAt": None, # Mark as unread
            "Asset": "system_report",
            "AssetType": "report",
            "Details": json.dumps({
                "ai_sales_and_price_results": ai_sales_and_price_results,
                "timestamp": now_iso
            })
        }
        tables["notifications"].create(notification_payload)
        print("Created admin notification with AI sales & pricing strategy results.")
    except Exception as e:
        print(f"Error creating admin notification for sales & pricing: {str(e)}")

def process_ai_sales_and_price_strategies(dry_run: bool = False):
    """Main function to process AI public sales and pricing strategies."""
    script_name = "AI Public Sales & Pricing Strategy"
    print(f"Starting {script_name} process (dry_run={dry_run})")
    
    tables = initialize_airtable()
    building_definitions = get_building_types_from_api() # Renamed for clarity from building_types
    if not building_definitions:
        print("Failed to get building definitions, exiting.")
        return
    
    resource_types_definitions = get_resource_types_from_api() # Renamed for clarity
    if not resource_types_definitions:
        print("Failed to get resource type definitions, exiting.")
        return

    all_buildings_records = get_all_buildings(tables) # For LandId mapping
    if not all_buildings_records:
        print("No buildings found for LandId mapping, exiting.")
        return

    all_market_contracts = get_all_active_public_sell_contracts(tables) # For market analysis

    ai_citizens_records = get_ai_citizens(tables)
    if not ai_citizens_records:
        print("No AI citizens found, exiting.")
        return
    
    # Filter AI citizens (similar to existing logic, ensuring they can sell)
    # This filtering can be refined within the loop or beforehand if performance is an issue.
    # For now, let's assume the prepare_..._data function handles non-sellable scenarios gracefully.

    ai_strategy_results = {} # To store results for admin notification
    total_ai_for_sales = len(ai_citizens_records)
    print(f"Processing {total_ai_for_sales} AI citizens for sales & pricing strategies.")

    for i, ai_citizen_record in enumerate(ai_citizens_records):
        ai_username = ai_citizen_record["fields"].get("Username")
        ai_social_class = ai_citizen_record["fields"].get("SocialClass")

        if not ai_username:
            # print(f"Skipping AI citizen at index {i} due to missing Username.")
            continue

        if ai_social_class == 'Nobili':
            print(f"Skipping AI citizen {ai_username} (Nobili) for Kinos-driven sales & pricing strategy for businesses they might RunBy.")
            continue
        
        # print(f"Processing AI citizen {i+1}/{total_ai_for_sales}: {ai_username} for sales & pricing strategy.")
        ai_strategy_results[ai_username] = {
            "created_updated": 0,
            "ended": 0,
            "created_updated_contracts": [],
            "ended_contracts": []
        }
        
        citizen_buildings_records = get_citizen_buildings(tables, ai_username) # Buildings AI runs
        citizen_resources_records = get_citizen_resources(tables, ai_username) # Resources AI owns
        citizen_active_contracts_records = get_citizen_active_contracts(tables, ai_username) # AI's active sell contracts

        data_package = prepare_sales_and_price_strategy_data(
            tables,
            ai_citizen_record,
            citizen_buildings_records,
            citizen_resources_records,
            citizen_active_contracts_records,
            all_market_contracts,
            all_buildings_records,
            building_definitions,
            resource_types_definitions
        )
        
        if not data_package["sellable_buildings_with_market_data"]:
            print(f"AI citizen {ai_username} has no buildings that can currently sell resources, skipping Kinos call.")
            continue
        
        # log_data(f"Data package prepared for {ai_username}", data_package) # Log the prepared data package

        if dry_run:
            print(f"[DRY RUN] Would send sales & pricing strategy request to AI citizen {ai_username}.")
            print(f"[DRY RUN] Data package summary for {ai_username}:")
            print(f"  - Sellable buildings with market data: {len(data_package['sellable_buildings_with_market_data'])}")
            print(f"  - Existing public sell contracts: {len(data_package['existing_ai_public_sell_contracts'])}")
            continue

        decisions = send_sales_and_price_strategy_request(ai_username, data_package)
        
        if decisions:
            # Process contracts to create or update
            if "contracts_to_create_or_update" in decisions:
                for decision_item in decisions["contracts_to_create_or_update"]:
                    if validate_create_or_update_contract_decision(decision_item, data_package["sellable_buildings_with_market_data"], resource_types_definitions):
                        success = create_or_update_public_sell_contract_from_decision(
                            tables,
                            ai_username,
                            decision_item,
                            resource_types_definitions
                        )
                        if success:
                            ai_strategy_results[ai_username]["created_updated"] += 1
                            ai_strategy_results[ai_username]["created_updated_contracts"].append(decision_item)
            
            # Process contracts to end
            if "contracts_to_end" in decisions:
                for decision_item in decisions["contracts_to_end"]:
                    if validate_end_contract_decision(decision_item, data_package["existing_ai_public_sell_contracts"]):
                        success = end_public_sell_contract(
                            tables,
                            decision_item["contract_id"],
                            decision_item.get("reason", "AI decision to end contract.")
                        )
                        if success:
                            ai_strategy_results[ai_username]["ended"] += 1
                            ai_strategy_results[ai_username]["ended_contracts"].append(decision_item)
        else:
            print(f"No valid sales & pricing decisions received for {ai_username}.")
            
    if not dry_run and any(results["created_updated"] > 0 or results["ended"] > 0 for results in ai_strategy_results.values()):
        create_admin_notification(tables, ai_strategy_results)
    elif dry_run:
        print(f"[DRY RUN] Would create admin notification with sales & pricing results if any actions were taken.")
    
    print(f"{script_name} process completed.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage public sales and prices for AI citizens using Kinos AI.")
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
    process_ai_sales_and_price_strategies(dry_run=args.dry_run, kinos_model_override_arg=args.model)

# Update process_ai_sales_and_price_strategies definition
def process_ai_sales_and_price_strategies(dry_run: bool = False, kinos_model_override_arg: Optional[str] = None):
    """Main function to process AI public sales and pricing strategies."""
    script_name = "AI Public Sales & Pricing Strategy"
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "default"
    log_header(f"{script_name} Process (dry_run={dry_run}, kinos_model={model_status})", LogColors.HEADER)
    
    tables = initialize_airtable()
    building_definitions = get_building_types_from_api() # Renamed for clarity from building_types
    if not building_definitions:
        print("Failed to get building definitions, exiting.")
        return
    
    resource_types_definitions = get_resource_types_from_api() # Renamed for clarity
    if not resource_types_definitions:
        print("Failed to get resource type definitions, exiting.")
        return

    all_buildings_records = get_all_buildings(tables) # For LandId mapping
    if not all_buildings_records:
        print("No buildings found for LandId mapping, exiting.")
        return

    all_market_contracts = get_all_active_public_sell_contracts(tables) # For market analysis

    ai_citizens_records = get_ai_citizens(tables)
    if not ai_citizens_records:
        print("No AI citizens found, exiting.")
        return
    
    # Filter AI citizens (similar to existing logic, ensuring they can sell)
    # This filtering can be refined within the loop or beforehand if performance is an issue.
    # For now, let's assume the prepare_..._data function handles non-sellable scenarios gracefully.

    ai_strategy_results = {} # To store results for admin notification
    total_ai_for_sales = len(ai_citizens_records)
    print(f"Processing {total_ai_for_sales} AI citizens for sales & pricing strategies.")

    for i, ai_citizen_record in enumerate(ai_citizens_records):
        ai_username = ai_citizen_record["fields"].get("Username")
        ai_social_class = ai_citizen_record["fields"].get("SocialClass")

        if not ai_username:
            # print(f"Skipping AI citizen at index {i} due to missing Username.")
            continue

        if ai_social_class == 'Nobili':
            print(f"Skipping AI citizen {ai_username} (Nobili) for Kinos-driven sales & pricing strategy for businesses they might RunBy.")
            continue
        
        # print(f"Processing AI citizen {i+1}/{total_ai_for_sales}: {ai_username} for sales & pricing strategy.")
        ai_strategy_results[ai_username] = {
            "created_updated": 0,
            "ended": 0,
            "created_updated_contracts": [],
            "ended_contracts": []
        }
        
        citizen_buildings_records = get_citizen_buildings(tables, ai_username) # Buildings AI runs
        citizen_resources_records = get_citizen_resources(tables, ai_username) # Resources AI owns
        citizen_active_contracts_records = get_citizen_active_contracts(tables, ai_username) # AI's active sell contracts

        data_package = prepare_sales_and_price_strategy_data(
            tables,
            ai_citizen_record,
            citizen_buildings_records,
            citizen_resources_records,
            citizen_active_contracts_records,
            all_market_contracts,
            all_buildings_records,
            building_definitions,
            resource_types_definitions
        )
        
        if not data_package["sellable_buildings_with_market_data"]:
            print(f"AI citizen {ai_username} has no buildings that can currently sell resources, skipping Kinos call.")
            continue
        
        # log_data(f"Data package prepared for {ai_username}", data_package) # Log the prepared data package

        if dry_run:
            print(f"[DRY RUN] Would send sales & pricing strategy request to AI citizen {ai_username}.")
            print(f"[DRY RUN] Data package summary for {ai_username}:")
            print(f"  - Sellable buildings with market data: {len(data_package['sellable_buildings_with_market_data'])}")
            print(f"  - Existing public sell contracts: {len(data_package['existing_ai_public_sell_contracts'])}")
            continue

        decisions = send_sales_and_price_strategy_request(ai_username, data_package, kinos_model_override_arg)
        
        if decisions:
            # Process contracts to create or update
            if "contracts_to_create_or_update" in decisions:
                for decision_item in decisions["contracts_to_create_or_update"]:
                    if validate_create_or_update_contract_decision(decision_item, data_package["sellable_buildings_with_market_data"], resource_types_definitions):
                        success = create_or_update_public_sell_contract_from_decision(
                            tables,
                            ai_username,
                            decision_item,
                            resource_types_definitions
                        )
                        if success:
                            ai_strategy_results[ai_username]["created_updated"] += 1
                            ai_strategy_results[ai_username]["created_updated_contracts"].append(decision_item)
            
            # Process contracts to end
            if "contracts_to_end" in decisions:
                for decision_item in decisions["contracts_to_end"]:
                    if validate_end_contract_decision(decision_item, data_package["existing_ai_public_sell_contracts"]):
                        success = end_public_sell_contract(
                            tables,
                            decision_item["contract_id"],
                            decision_item.get("reason", "AI decision to end contract.")
                        )
                        if success:
                            ai_strategy_results[ai_username]["ended"] += 1
                            ai_strategy_results[ai_username]["ended_contracts"].append(decision_item)
        else:
            print(f"No valid sales & pricing decisions received for {ai_username}.")
            
    if not dry_run and any(results["created_updated"] > 0 or results["ended"] > 0 for results in ai_strategy_results.values()):
        create_admin_notification(tables, ai_strategy_results)
    elif dry_run:
        print(f"[DRY RUN] Would create admin notification with sales & pricing results if any actions were taken.")
    
    print(f"{script_name} process completed.")
