import os
import sys
import json
import traceback
import logging
import argparse # Added argparse
import random # Added for 10% chance
from datetime import datetime, timedelta
import pytz # Added for Venice timezone
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Base, Table # Added Base

# Add the parent directory to the path to import citizen_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

log = logging.getLogger(__name__) # Initialize logger

# Configuration for API calls (ensure BASE_URL is defined if not already)
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

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

def initialize_airtable():
    """Initialize connection to Airtable."""
    load_dotenv()
    
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID") # Corrected Env Var
    
    if not airtable_api_key or not airtable_base_id:
        print("Error: Airtable credentials not found in environment variables")
        sys.exit(1)
    
    api = Api(airtable_api_key)
    base = Base(api, airtable_base_id) # Create a Base object
    
    tables = {
        "citizens": base.table("CITIZENS"),
        "buildings": base.table("BUILDINGS"),
        "resources": base.table("RESOURCES"),
        "contracts": base.table("CONTRACTS"),
        "notifications": base.table("NOTIFICATIONS"),
        "problems": base.table("PROBLEMS"),
        "relationships": base.table("RELATIONSHIPS") # Ajout de la table RELATIONSHIPS
    }
    
    return tables

def _escape_airtable_value(value: str) -> str:
    """Échappe les apostrophes pour les formules Airtable."""
    if isinstance(value, str):
        return value.replace("'", "\\'")
    return str(value)

def _get_citizen_building_problems(tables: Dict[str, Table], username: str, limit: int = 100) -> List[Dict]:
    """Get latest PROBLEMS where AssetType='building' AND Citizen=Username via API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        params = {
            "citizen": username,
            "assetType": "building",
            "status": "active", # Ou selon les besoins
            "limit": str(limit)
        }
        api_url = f"{api_base_url}/api/problems"
        response = requests.get(api_url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "problems" in data:
            # L'API /api/problems retourne déjà les champs nécessaires, pas besoin de 'fields' imbriqué
            print(f"Récupéré {len(data['problems'])} problèmes de bâtiment pour {username} via API.")
            return data["problems"]
        else:
            print(f"L'API a échoué à récupérer les problèmes de bâtiment pour {username}: {data.get('error', 'Erreur inconnue')}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête API lors de la récupération des problèmes de bâtiment pour {username}: {e}")
        return []
    except Exception as e:
        print(f"Erreur lors de la récupération des problèmes de bâtiment pour {username} via API: {e}")
        return []

def _get_general_building_problems(tables: Dict[str, Table], limit: int = 100) -> List[Dict]:
    """Get latest PROBLEMS where AssetType='building' for any citizen via API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        params = {
            "assetType": "building",
            "status": "active", # Ou selon les besoins
            "limit": str(limit)
        }
        api_url = f"{api_base_url}/api/problems"
        response = requests.get(api_url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "problems" in data:
            print(f"Récupéré {len(data['problems'])} problèmes généraux de bâtiment via API.")
            return data["problems"]
        else:
            print(f"L'API a échoué à récupérer les problèmes généraux de bâtiment: {data.get('error', 'Erreur inconnue')}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête API lors de la récupération des problèmes généraux de bâtiment: {e}")
        return []
    except Exception as e:
        print(f"Erreur lors de la récupération des problèmes généraux de bâtiment via API: {e}")
        return []

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice."""
    try:
        # Query citizens with IsAI=true, InVenice=true
        # Corrected formula: added closing parenthesis.
        # If IsAI and InVenice are boolean fields, AND({IsAI}=TRUE(), {InVenice}=TRUE()) might be more robust.
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

def get_citizen_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings run by by a specific citizen."""
    try:
        # Query buildings where the citizen is running the business
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

def get_citizen_contracts(tables, username: str) -> List[Dict]:
    """Get all contracts where the citizen is the buyer."""
    try:
        # Get current time
        now = datetime.now().isoformat()
        
        # Query contracts where the citizen is the buyer and the contract is active
        # Utiliser l'API /api/contracts
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        params = {"username": username, "scope": "userNonPublic"} # Pour obtenir les contrats non publics de l'utilisateur
        api_url = f"{api_base_url}/api/contracts"
        
        response = requests.get(api_url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        if data.get("success") and "contracts" in data:
            # Filtrer pour ne garder que les contrats actifs si l'API ne le fait pas déjà
            # L'API /api/contracts devrait idéalement retourner des contrats actifs
            # Pour l'instant, on suppose que l'API retourne les contrats pertinents.
            # Si un filtrage supplémentaire par date est nécessaire, il faudrait le faire ici.
            active_contracts = [
                c for c in data["contracts"] 
                # Exemple de filtrage par date si nécessaire :
                # if c.get("createdAt") <= now and c.get("endAt") >= now
            ]
            print(f"Trouvé {len(active_contracts)} contrats actifs où {username} est l'acheteur via API.")
            return active_contracts
        else:
            print(f"L'API a échoué à récupérer les contrats pour {username}: {data.get('error', 'Erreur inconnue')}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête API lors de la récupération des contrats pour {username}: {e}")
        return []
    except Exception as e:
        print(f"Erreur lors de la récupération des contrats pour {username} via API: {e}")
        return []

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_import_strategy_data(
    tables: Dict[str, Table], # Added tables parameter
    ai_citizen: Dict, 
    citizen_buildings: List[Dict], 
    citizen_resources: List[Dict],
    citizen_contracts: List[Dict],
    building_types: Dict, 
    resource_types: Dict
) -> Dict:
    """Prepare a comprehensive data package for the AI to make import decisions."""
    
    # Extract citizen information
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    
    # Find buildings that can import resources (must be 'business' category)
    importable_buildings = []
    for building in citizen_buildings:
        building_id = building["fields"].get("BuildingId", "")
        building_type = building["fields"].get("Type", "")
        building_category = building["fields"].get("Category", "").lower()

        # Only consider 'business' category buildings for import capabilities
        if building_category != 'business':
            continue
            
        # Check if this building type can import resources
        building_def = building_types.get(building_type, {})
        can_import = building_def.get("canImport", False)
        
        if can_import:
            # Get the list of resources this building can store
            stores = []
            production_info = building_def.get("productionInformation", {})
            
            if production_info and isinstance(production_info, dict):
                stores = production_info.get("stores", [])
            
            # Only include buildings that can store resources
            if stores:
                importable_buildings.append({
                    "id": building_id,
                    "type": building_type,
                    "name": building_def.get("name", building_type),
                    "stores": stores
                })
    
    # Process citizen resources and current stock in importable buildings
    resources_by_type_total_owned = {} # Total owned by citizen across all locations
    stock_in_importable_buildings = {} # Key: building_id, Value: {resource_id: stock_count}

    for resource_record in citizen_resources: # These are all resources owned by the AI
        res_type = resource_record["fields"].get("Type", "")
        res_count = float(resource_record["fields"].get("Count", 0))
        
        if res_type not in resources_by_type_total_owned:
            resources_by_type_total_owned[res_type] = 0
        resources_by_type_total_owned[res_type] += res_count

        # Check if this resource is in one of the AI's importable buildings
        asset_id = resource_record["fields"].get("Asset") # This is the BuildingId
        asset_type = resource_record["fields"].get("AssetType")
        
        if asset_type == 'building' and asset_id:
            # Check if this building is one of the AI's importable buildings
            is_importable_building_for_ai = any(bldg_info["id"] == asset_id for bldg_info in importable_buildings)
            if is_importable_building_for_ai:
                if asset_id not in stock_in_importable_buildings:
                    stock_in_importable_buildings[asset_id] = {}
                stock_in_importable_buildings[asset_id][res_type] = stock_in_importable_buildings[asset_id].get(res_type, 0) + res_count

    # Add current stock information to importable_buildings data
    for bldg_info in importable_buildings:
        bldg_id = bldg_info["id"]
        bldg_info["current_stock"] = {}
        if bldg_id in stock_in_importable_buildings:
            for res_id_stored in bldg_info["stores"]:
                bldg_info["current_stock"][res_id_stored] = stock_in_importable_buildings[bldg_id].get(res_id_stored, 0.0)
        else: # No stock records for this building, assume 0 for all storable resources
            for res_id_stored in bldg_info["stores"]:
                 bldg_info["current_stock"][res_id_stored] = 0.0


    # Process existing import contracts
    existing_contracts = []
    for contract in citizen_contracts:
        # Assuming API returns camelCased fields directly
        if contract.get("type") == "import":  # Only include import contracts
            existing_contracts.append({
                "id": contract.get("contractId", ""),
                "resource_type": contract.get("resourceType", ""),
                "buyer_building": contract.get("buyerBuilding", ""),
                "target_amount": contract.get("targetAmount", 0),
                "price": contract.get("pricePerResource", 0) # Assuming API returns pricePerResource
            })
    
    # Get resource type information
    resource_info = {}
    for resource_id, resource in resource_types.items():
        resource_info[resource_id] = {
            "id": resource_id,
            "name": resource.get("name", resource_id),
            "category": resource.get("category", "Unknown"),
            "import_price": resource.get("importPrice", 0),
            "current_price": resources_by_type_total_owned.get(resource_id, 0) # Corrected variable name
        }
    
    # Fetch citizen-specific building problems
    citizen_building_problems = _get_citizen_building_problems(tables, username)
    # Fetch general building problems
    general_building_problems = _get_general_building_problems(tables)
    # Fetch general notifications and relevancies for the AI
    recent_notifications_for_ai = _get_notifications_data_api(username)
    recent_relevancies_for_ai = _get_relevancies_data_api(username)

    # Prepare the complete data package
    data_package = {
        "citizen": {
            "username": username,
            "ducats": ducats,
            "total_buildings": len(citizen_buildings),
            "importable_buildings": len(importable_buildings)
        },
        "importable_buildings": importable_buildings, # Now includes current_stock per resource
        "resources_total_owned_summary": resources_by_type_total_owned, # Renamed for clarity
        "resource_info": resource_info, # Contains importPrice etc.
        "existing_contracts": existing_contracts,
        "latest_citizen_building_problems": citizen_building_problems,
        "latest_general_building_problems": general_building_problems,
        "recent_notifications_for_ai": recent_notifications_for_ai,
        "recent_relevancies_for_ai": recent_relevancies_for_ai,
        "timestamp": datetime.now(pytz.timezone('Europe/Rome')).isoformat()
    }
    
    return data_package

def send_import_strategy_request(ai_username: str, data_package: Dict, kinos_model_override: Optional[str] = None) -> Optional[Dict]:
    """Send the import strategy request to the AI via Kinos API."""
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
        print(f"Sending import strategy request to AI citizen {ai_username}")
        print(f"API URL: {url}")
        print(f"Citizen has {data_package['citizen']['ducats']} ducats")
        print(f"Citizen has {data_package['citizen']['importable_buildings']} buildings that can import resources")
        
        # Create a detailed prompt that addresses the AI directly as the decision-maker
        prompt = f"""
As a business manager in La Serenissima, you need to decide on your resource import strategy.

Here's your current situation:
- You own {data_package['citizen']['importable_buildings']} buildings that can import resources
- You have {data_package['citizen']['ducats']} ducats available
- You currently have {len(data_package['existing_contracts'])} import contracts

Please analyze your buildings and develop a strategy for importing resources. Consider:
1. Which resources each building can store
2. The import prices of different resources
3. Your current resource stockpiles
4. Your overall financial situation

After your analysis, provide your import decisions in this JSON format:
```json
{{
  "import_decisions": [
    {{
      "building_id": "building-id-1",
      "resource_type": "resource-type-1",
      "target_amount": 10,
      "reason": "brief explanation"
    }},
    {{
      "building_id": "building-id-2",
      "resource_type": "resource-type-2",
      "target_amount": 5,
      "reason": "brief explanation"
    }}
  ]
}}
```

If you decide not to set up any imports at this time, return an empty array:
```json
{{
  "import_decisions": []
}}
```
"""
        
        # Function to clean data for JSON serialization
        def clean_for_json(obj):
            """Clean an object to ensure it can be properly serialized to JSON."""
            if isinstance(obj, str):
                # Replace or remove control characters
                return ''.join(c if ord(c) >= 32 or c in '\n\r\t' else ' ' for c in obj)
            elif isinstance(obj, dict):
                return {clean_for_json(k): clean_for_json(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_for_json(item) for item in obj]
            else:
                return obj
        
        # Clean the data package and serialize it properly
        cleaned_data = clean_for_json(data_package)
        serialized_data = json.dumps(cleaned_data, indent=2, ensure_ascii=True)
        
        # Create system instructions with the cleaned, serialized data
        system_instructions = f"""
You are {ai_username}, an AI business manager in La Serenissima. You make your own decisions about resource import strategies.

Here is the complete data about your current situation:
{serialized_data}

Contextual data available:
- `latest_citizen_building_problems`: Shows recent building-related problems specifically affecting you (e.g., your building lacks resources, is vacant, etc.). This can highlight urgent needs for imports.
- `latest_general_building_problems`: Shows recent building-related problems affecting any citizen. This can give you insights into broader market demands or shortages that you might capitalize on or need to prepare for.

When developing your import strategy:
1. Analyze which buildings can import which resources (check the "stores" array for each building)
2. Consider the import prices of different resources
3. Prioritize resources that you need for production or that have high value
4. Balance the hourly import amounts based on your financial capacity
5. Create a specific, actionable plan with building IDs and resource types
6. Provide brief reasons for each import decision

Your decision should be specific, data-driven, and focused on optimizing your resource management.

IMPORTANT: You must end your response with a JSON object containing your specific import decisions.
Include the building_id, resource_type, target_amount, and reason for each import you want to set up.
If you decide not to set up any imports at this time, return an empty array.
Make sure the building type can store the resource.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 5,
            "max_files": 15
        }

        if kinos_model_override:
            payload["model"] = kinos_model_override
            print(f"Using Kinos model override '{kinos_model_override}' for {ai_username} (import strategy).")
        
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
                print(f"Successfully sent import strategy request to AI citizen {ai_username}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                
                # Log the entire response for debugging
                print(f"FULL AI RESPONSE FROM {ai_username}:")
                print("="*80)
                print(content)
                print("="*80)
                
                print(f"AI {ai_username} response length: {len(content)} characters")
                print(f"AI {ai_username} response preview: {content[:5000]}...")
                
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
                            if "import_decisions" in decisions:
                                print(f"Found import decisions in code block: {len(decisions['import_decisions'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from code block: {str(e)}")
                    
                    # Next, try to find JSON with curly braces pattern
                    json_match = re.search(r'(\{[\s\S]*"import_decisions"[\s\S]*\})', content)
                    if json_match:
                        json_str = json_match.group(1)
                        try:
                            decisions = json.loads(json_str)
                            if "import_decisions" in decisions:
                                print(f"Found import decisions in curly braces pattern: {len(decisions['import_decisions'])}")
                                return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from curly braces pattern: {str(e)}")
                    
                    # If we couldn't find a JSON block, try to parse the entire response
                    try:
                        decisions = json.loads(content)
                        if "import_decisions" in decisions:
                            print(f"Found import decisions in full response: {len(decisions['import_decisions'])}")
                            return decisions
                    except json.JSONDecodeError:
                        print("Could not parse full response as JSON")
                    
                    # Last resort: try to extract just the array part
                    array_match = re.search(r'"import_decisions"\s*:\s*(\[\s*\{.*?\}\s*\])', content, re.DOTALL)
                    if array_match:
                        array_str = array_match.group(1)
                        try:
                            array_data = json.loads(array_str)
                            decisions = {"import_decisions": array_data}
                            print(f"Found import decisions in array extraction: {len(decisions['import_decisions'])}")
                            return decisions
                        except json.JSONDecodeError as e:
                            print(f"Error parsing JSON from array extraction: {str(e)}")
                    
                    # Manual extraction as last resort
                    building_ids = re.findall(r'"building_id"\s*:\s*"([^"]+)"', content)
                    resource_types = re.findall(r'"resource_type"\s*:\s*"([^"]+)"', content)
                    target_amounts = re.findall(r'"target_amount"\s*:\s*(\d+)', content)
                    reasons = re.findall(r'"reason"\s*:\s*"([^"]+)"', content)
                    
                    if building_ids and resource_types and target_amounts and len(building_ids) == len(resource_types) == len(target_amounts):
                        # Create a manually constructed decision object
                        import_decisions = []
                        for i in range(len(building_ids)):
                            reason = reasons[i] if i < len(reasons) else "No reason provided"
                            import_decisions.append({
                                "building_id": building_ids[i],
                                "resource_type": resource_types[i],
                                "target_amount": int(target_amounts[i]),
                                "reason": reason
                            })
                        
                        decisions = {"import_decisions": import_decisions}
                        print(f"Manually extracted import decisions: {len(decisions['import_decisions'])}")
                        return decisions
                    
                    # If we get here, no valid decision was found
                    print(f"No valid import decision found in AI response. Full response:")
                    print(content)
                    return None
                except Exception as e:
                    print(f"Error extracting decision from AI response: {str(e)}")
                    print(f"Full response content that caused the error:")
                    print(content)
                    return None
            else:
                print(f"Error processing import strategy request for AI citizen {ai_username}: {response_data}")
                return None
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error sending import strategy request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return None

def validate_import_decision(
    decision: Dict, 
    importable_buildings: List[Dict], 
    resource_types: Dict
) -> bool:
    """Validate that an import decision is valid."""
    building_id = decision.get("building_id")
    resource_type = decision.get("resource_type")
    target_amount = decision.get("target_amount")
    
    # Check if all required fields are present
    if not building_id or not resource_type or decision.get("target_stock_level") is None: # Check decision for target_stock_level
        print(f"Invalid import decision: missing required fields - {decision}")
        return False
    
    # Check if target_stock_level is a non-negative number
    try:
        target_stock_level_val = decision.get("target_stock_level") # Get from decision
        target_stock_level_float = float(target_stock_level_val)
        if target_stock_level_float < 0:
            print(f"Invalid target_stock_level: {target_stock_level_val} must be non-negative")
            return False
    except (ValueError, TypeError):
        print(f"Invalid target_stock_level: {decision.get('target_stock_level')} is not a number") # Use decision.get here too
        return False
    
    # Check if the building exists and can import resources
    building_found = False
    for building in importable_buildings:
        if building["id"] == building_id:
            building_found = True
            # Check if the building can store this resource type
            if resource_type not in building["stores"]:
                print(f"Building {building_id} cannot store resource {resource_type}")
                return False
            break
    
    if not building_found:
        print(f"Building {building_id} not found or cannot import resources")
        return False
    
    # Check if the resource type exists
    if resource_type not in resource_types:
        print(f"Resource type {resource_type} not found")
        return False
    
    return True

def create_or_update_import_contract(
    tables: Dict[str, Table], # Removed duplicate, kept the typed one
    ai_username: str, 
    decision: Dict, 
    resource_types: Dict,
    importable_buildings_data_for_stock_check: List[Dict] # To get current stock for the specific building
) -> bool:
    """Create or update an import contract based on the AI's decision using a deterministic ContractId and TargetAmount."""
    try:
        building_id = decision["building_id"]
        resource_type = decision["resource_type"]
        target_stock_level = float(decision["target_stock_level"]) # AI now provides target_stock_level
        reason = decision.get("reason", "No reason provided")
        
        # Get the import price for this resource
        import_price = resource_types.get(resource_type, {}).get("importPrice", 0)
        if import_price <= 0:
            print(f"Resource {resource_type} has invalid import price {import_price}. Cannot create/update import contract.")
            return False

        # Find current stock for this specific building and resource
        current_stock = 0.0
        building_data_for_stock = next((b for b in importable_buildings_data_for_stock_check if b["id"] == building_id), None)
        if building_data_for_stock and "current_stock" in building_data_for_stock:
            current_stock = building_data_for_stock["current_stock"].get(resource_type, 0.0)
        else:
            # Fallback: query directly if not found in pre-fetched data (should ideally be there)
            # This requires a helper like get_building_resource_stock from automated_adjustimports.py
            # For now, assume it's in importable_buildings_data_for_stock_check or log a warning.
            log.warning(f"Could not find pre-fetched stock for {resource_type} in {building_id}. Assuming 0 for calculation.")
            # To implement direct fetch:
            # from .automated_adjustimports import get_building_resource_stock # (Adjust import path if needed)
            # current_stock = get_building_resource_stock(tables, building_id, resource_type, ai_username)


        amount_to_request_in_contract = target_stock_level - current_stock
        amount_to_request_in_contract = round(amount_to_request_in_contract, 2)

        if amount_to_request_in_contract <= 0:
            print(f"No import needed for {resource_type} in {building_id} for {ai_username}. Target: {target_stock_level}, Current: {current_stock}. Amount to request: {amount_to_request_in_contract}")
            # If an existing contract for this combo exists, we might want to end it if amount_to_request is <= 0.
            # For now, just don't create/update if no amount is needed.
            # Consider adding logic to end existing contract if target is met or exceeded.
            return False # No contract created/updated as none needed

        # Generate deterministic ContractId
        # Format: contract-import-{BUYER_BUILDING_ID}-{RESOURCE_TYPE}
        # Ensure building_id and resource_type are sanitized for use in an ID if necessary (e.g., no spaces, special chars)
        # For now, assuming they are simple strings/IDs.
        custom_contract_id = f"contract-import-{building_id}-{resource_type}"
    
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        # Contract ends in 1 month
        end_date_venice = now_venice + timedelta(days=30) 
        end_date_iso = end_date_venice.isoformat()

        # Check if a contract with this custom_contract_id already exists
        existing_contract_record = None
        try:
            formula = f"{{ContractId}}='{_escape_airtable_value(custom_contract_id)}'"
            records = tables["contracts"].all(formula=formula, max_records=1)
            if records:
                existing_contract_record = records[0]
        except Exception as e:
            print(f"Error checking for existing contract {custom_contract_id}: {e}")
            # Proceed as if not found, or handle error more gracefully

        if existing_contract_record:
            # Update the existing contract
            airtable_record_id = existing_contract_record["id"]
            
            # For imports, Seller and Transporter are set by createimportactivities.py
            # If we are updating, we might be just changing amount/price, keep existing Seller if any.
            # However, if this script is the *origin* of the import need, Seller should be blank.
            # Let's assume for now that if it's an "import" type, Seller is initially NULL.
            update_fields = {
                "TargetAmount": amount_to_request_in_contract, # Use calculated amount
                "PricePerResource": import_price,
                "EndAt": end_date_iso, # Refresh EndAt (Venice time ISO)
                "Notes": json.dumps({
                    "reason": reason,
                    "updated_by": "AI Import Strategy",
                    "updated_at": now_iso, # Venice time ISO
                    "previous_ContractId_logic": "deterministic_overwrite"
                })
            }
            # If it's an import contract being managed here, ensure Seller related fields are nullified
            # if this script is meant to reset them for later merchant assignment.
            # This part is tricky: if an AI is *adjusting* an existing import contract already assigned to a merchant,
            # we wouldn't want to nullify the Seller.
            # Let's assume this script primarily *creates* the need, so Seller is initially NULL.
            # If the contract type is 'import', we ensure Seller fields are not set by this script.
            # They will be set by createimportactivities.py when a merchant is assigned.
            # This means if an existing import contract is found, we only update amount/price/enddate.
            # If it's a *new* import contract, Seller fields are omitted.

            # Only update existing contract with a 10% chance
            if random.random() < 0.1:
                print(f"Updating existing import contract {custom_contract_id} for {resource_type} at building {building_id}: TargetAmount={amount_to_request_in_contract} units. Seller/Transporter to be assigned.") # Use amount_to_request_in_contract
                tables["contracts"].update(airtable_record_id, update_fields)
            else:
                print(f"Skipped updating existing import contract {custom_contract_id} for {resource_type} at building {building_id} due to 10% chance rule.")

        else:
            # Create a new contract
            new_contract_data = {
                "ContractId": custom_contract_id, # Use the deterministic ID
                "Type": "import", # Explicitly set Type to 'import'
                "Buyer": ai_username,
                "Seller": None, # Seller will be assigned by createimportactivities
                "ResourceType": resource_type,
                "Transporter": None, # Transporter will be assigned by createimportactivities
                "BuyerBuilding": building_id,
                "SellerBuilding": None, # SellerBuilding will be the galley, assigned by createimportactivities
                "TargetAmount": amount_to_request_in_contract, # Use TargetAmount
                "PricePerResource": import_price,
                "Priority": 1,  # Default priority
                "CreatedAt": now_iso, # Venice time ISO
                "EndAt": end_date_iso, # Venice time ISO
                "Notes": json.dumps({
                    "reason": reason,
                    "created_by": "AI Import Strategy",
                    "created_at": now_iso, # Venice time ISO
                    "ContractId_logic": "deterministic",
                    "target_stock_level_decision": target_stock_level,
                    "current_stock_at_decision": current_stock
                })
            }
            tables["contracts"].create(new_contract_data)
            print(f"Created new import contract {custom_contract_id} for {resource_type} at building {building_id}: TargetAmount={amount_to_request_in_contract}")
        
        return True
    except Exception as e_contract:
        print(f"Error creating/updating import contract {decision.get('building_id', 'N/A')}-{decision.get('resource_type', 'N/A')}: {str(e_contract)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def create_admin_notification(tables, ai_import_results: Dict[str, Dict]) -> None:
    """Create a notification for admins with the AI import strategy results."""
    try:
        VENICE_TIMEZONE = pytz.timezone('Europe/Rome')
        now_venice = datetime.now(VENICE_TIMEZONE)
        now_iso = now_venice.isoformat()
        
        # Create a summary message
        message = "AI Import Strategy Results:\n\n"
        
        for ai_name, results in ai_import_results.items():
            success_count = results.get("success", 0)
            failure_count = results.get("failure", 0)
            total_count = success_count + failure_count
            
            message += f"- {ai_name}: {success_count} successful imports out of {total_count} decisions\n"
            
            # Add details about the imports
            if "imports" in results and results["imports"]:
                message += "  Imports:\n"
                for imp in results["imports"]:
                    message += f"    * Building {imp['building_id']}: {imp['target_stock_level']} (target) of {imp['resource_type']}\n"
        
        # Create the notification
        notification = {
            "Citizen": "ConsiglioDeiDieci",  # Send to ConsiglioDeiDieci as requested
            "Type": "ai_import_strategy",
            "Content": message,
            "CreatedAt": now_iso,
            "ReadAt": None,
            "Asset": "system_report",
            "AssetType": "report",
            "Details": json.dumps({
                "ai_import_results": ai_import_results,
                "timestamp": now_iso
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI import strategy results")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_import_strategies(dry_run: bool = False):
    """Main function to process AI import strategies."""
    print(f"Starting AI import strategy process (dry_run={dry_run})")
    
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
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those who own buildings that can import resources
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Check if any building can import resources
        has_importable_building = False
        for building in citizen_buildings:
            building_type = building["fields"].get("Type", "")
            building_def = building_types.get(building_type, {})
            can_import = building_def.get("canImport", False)
            
            if can_import:
                has_importable_building = True
                break
                
        # Also check if the citizen has enough ducats (minimum 10,000)
        ducats = ai_citizen["fields"].get("Ducats", 0)
        has_enough_ducats = ducats >= 10000
        
        if has_importable_building and has_enough_ducats:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} has buildings that can import resources and {ducats} ducats, including in processing")
        else:
            if not has_importable_building:
                print(f"AI citizen {ai_username} has no buildings that can import resources, skipping")
            if not has_enough_ducats:
                print(f"AI citizen {ai_username} has insufficient ducats ({ducats}), skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with buildings that can import resources and sufficient ducats")
    
    if not ai_citizens:
        print("No AI citizens with buildings that can import resources and sufficient ducats, exiting")
        return
    
    # Track import results for each AI
    ai_import_results = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        # print(f"Processing AI citizen: {ai_username}")
        ai_import_results[ai_username] = {
            "success": 0,
            "failure": 0,
            "imports": []
        }
        
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Get resources owned by this AI
        citizen_resources = get_citizen_resources(tables, ai_username)
        
        # Get existing contracts where this AI is the buyer
        citizen_contracts = get_citizen_contracts(tables, ai_username)
        
        # Prepare the data package for the AI
        data_package = prepare_import_strategy_data(
            tables, # Pass tables object
            ai_citizen, 
            citizen_buildings, 
            citizen_resources,
            citizen_contracts,
            building_types, 
            resource_types
        )
        
        # Find buildings that can import resources
        importable_buildings = data_package["importable_buildings"]
        
        if not importable_buildings:
            print(f"AI citizen {ai_username} has no buildings that can import resources, skipping")
            continue
        
        # Send the import strategy request to the AI
        if not dry_run:
            decisions = send_import_strategy_request(ai_username, data_package)
            
            if decisions and "import_decisions" in decisions:
                import_decisions = decisions["import_decisions"]
                
                for decision in import_decisions:
                    # Validate the import decision
                    if validate_import_decision(decision, importable_buildings, resource_types): # Validation needs to check target_stock_level
                        # Create or update the import contract
                        success = create_or_update_import_contract(
                            tables, 
                            ai_username, 
                            decision, 
                            resource_types,
                            data_package["importable_buildings"] # Pass for stock check
                        )
                        
                        if success: # This now means a contract was created/updated because amount_to_request > 0
                            ai_import_results[ai_username]["success"] += 1
                            ai_import_results[ai_username]["imports"].append({
                                "building_id": decision["building_id"],
                                "resource_type": decision["resource_type"],
                                "target_stock_level": decision["target_stock_level"] # Log target_stock_level
                            })
                        # If success is False, it means either an error or no import was needed.
                        # We only count explicit failures if validate_import_decision fails.
                        # If create_or_update returns False because amount_to_request <=0, it's not a "failure" of the AI's decision.
                    else:
                        ai_import_results[ai_username]["failure"] += 1
            else:
                print(f"No valid import decisions received for {ai_username}")
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send import strategy request to AI citizen {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package['citizen']['username']}")
            print(f"  - Importable buildings: {len(importable_buildings)}")
            print(f"  - Resources: {len(data_package['resources'])}")
            print(f"  - Existing contracts: {len(data_package['existing_contracts'])}")
    
    # Create admin notification with summary
    if not dry_run and any(results["success"] > 0 for results in ai_import_results.values()):
        create_admin_notification(tables, ai_import_results)
    else:
        print(f"[DRY RUN] Would create admin notification with import results: {ai_import_results}")
    
    print("AI import strategy process completed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Adjust import strategies for AI citizens using Kinos AI.")
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
    process_ai_import_strategies(dry_run=args.dry_run, kinos_model_override_arg=args.model)

# Add kinos_model_override_arg to process_ai_import_strategies definition
def process_ai_import_strategies(dry_run: bool = False, kinos_model_override_arg: Optional[str] = None):
    """Main function to process AI import strategies."""
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "default"
    print(f"Starting AI import strategy process (dry_run={dry_run}, kinos_model={model_status})")
    
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
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those who own buildings that can import resources
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
            
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Check if any building can import resources
        has_importable_building = False
        for building in citizen_buildings:
            building_type = building["fields"].get("Type", "")
            building_def = building_types.get(building_type, {})
            can_import = building_def.get("canImport", False)
            
            if can_import:
                has_importable_building = True
                break
                
        # Also check if the citizen has enough ducats (minimum 10,000)
        ducats = ai_citizen["fields"].get("Ducats", 0)
        has_enough_ducats = ducats >= 10000
        
        if has_importable_building and has_enough_ducats:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} has buildings that can import resources and {ducats} ducats, including in processing")
        else:
            if not has_importable_building:
                print(f"AI citizen {ai_username} has no buildings that can import resources, skipping")
            if not has_enough_ducats:
                print(f"AI citizen {ai_username} has insufficient ducats ({ducats}), skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with buildings that can import resources and sufficient ducats")
    
    if not ai_citizens:
        print("No AI citizens with buildings that can import resources and sufficient ducats, exiting")
        return
    
    # Track import results for each AI
    ai_import_results = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            continue
        
        # print(f"Processing AI citizen: {ai_username}")
        ai_import_results[ai_username] = {
            "success": 0,
            "failure": 0,
            "imports": []
        }
        
        # Get buildings owned by this AI
        citizen_buildings = get_citizen_buildings(tables, ai_username)
        
        # Get resources owned by this AI
        citizen_resources = get_citizen_resources(tables, ai_username)
        
        # Get existing contracts where this AI is the buyer
        citizen_contracts = get_citizen_contracts(tables, ai_username)
        
        # Prepare the data package for the AI
        data_package = prepare_import_strategy_data(
            tables, # Pass tables object
            ai_citizen, 
            citizen_buildings, 
            citizen_resources,
            citizen_contracts,
            building_types, 
            resource_types
        )
        
        # Find buildings that can import resources
        importable_buildings = data_package["importable_buildings"]
        
        if not importable_buildings:
            print(f"AI citizen {ai_username} has no buildings that can import resources, skipping")
            continue
        
        # Send the import strategy request to the AI
        if not dry_run:
            decisions = send_import_strategy_request(ai_username, data_package, kinos_model_override_arg)
            
            if decisions and "import_decisions" in decisions:
                import_decisions = decisions["import_decisions"]
