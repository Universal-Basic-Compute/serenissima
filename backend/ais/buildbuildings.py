import os
import sys
import json
import traceback
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
import colorama
from colorama import Fore, Back, Style
from pprint import pformat
import textwrap
import argparse

# Initialize colorama
colorama.init(autoreset=True)

# Logging functions
def log_header(message):
    """Print a header message with a colorful border."""
    border = "=" * 80
    print(f"\n{Fore.CYAN}{border}")
    print(f"{Fore.CYAN}{Style.BRIGHT}{message.center(80)}")
    print(f"{Fore.CYAN}{border}{Style.RESET_ALL}\n")

def log_section(message):
    """Print a section header with a colorful border."""
    border = "-" * 80
    print(f"\n{Fore.YELLOW}{border}")
    print(f"{Fore.YELLOW}{Style.BRIGHT}{message.center(80)}")
    print(f"{Fore.YELLOW}{border}{Style.RESET_ALL}\n")

def log_success(message):
    """Print a success message."""
    print(f"{Fore.GREEN}✓ {message}{Style.RESET_ALL}")

def log_info(message):
    """Print an info message."""
    print(f"{Fore.BLUE}ℹ {message}{Style.RESET_ALL}")

def log_warning(message):
    """Print a warning message."""
    print(f"{Fore.YELLOW}⚠ {message}{Style.RESET_ALL}")

def log_error(message):
    """Print an error message."""
    print(f"{Fore.RED}✗ {message}{Style.RESET_ALL}")

def log_data(label, data, indent=2):
    """Pretty print data with a label."""
    print(f"{Fore.MAGENTA}{label}:{Style.RESET_ALL}")
    formatted_data = pformat(data, indent=indent, width=100)
    indented_data = textwrap.indent(formatted_data, ' ' * indent)
    print(indented_data)

def send_error_message_to_kinos_ai(ai_username: str, error_context: str, error_message: str, original_ai_response: Optional[str] = None):
    """Sends a system message to the Kinos AI about an error in processing its strategy."""
    try:
        api_key = get_kinos_api_key() # Assumes get_kinos_api_key() is defined in this module
        blueprint = "serenissima-ai"
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/add-message"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        system_message_content = (
            f"System Alert: There was an error processing your last strategy for '{error_context}'.\n"
            f"Error: {error_message}\n"
        )
        if original_ai_response:
            system_message_content += f"\nYour response that caused the error (first 500 chars):\n{original_ai_response[:500]}"

        payload = {
            "message": system_message_content,
            "role": "system", # Send as a system message
            "metadata": {
                "source": "backend_strategy_processor",
                "error_context": error_context,
                "error_details": error_message
            }
        }
        
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 200 or response.status_code == 201:
            log_success(f"Successfully sent error notification message to Kinos AI {ai_username} regarding {error_context}.")
        else:
            log_error(f"Failed to send error notification message to Kinos AI {ai_username}. Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        log_error(f"Exception while sending error message to Kinos AI {ai_username}: {e}")

def log_table(headers, rows):
    """Print data in a table format."""
    # Calculate column widths
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(cell)))
    
    # Print headers
    header_row = " | ".join(f"{h.ljust(col_widths[i])}" for i, h in enumerate(headers))
    separator = "-+-".join("-" * w for w in col_widths)
    print(f"{Fore.CYAN}{header_row}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{separator}{Style.RESET_ALL}")
    
    # Print rows
    for row in rows:
        row_str = " | ".join(f"{str(cell).ljust(col_widths[i])}" for i, cell in enumerate(row))
        print(row_str)

def get_allowed_building_tiers(social_class: str) -> List[int]:
    """Determine which building tiers an AI can construct based on their social class."""
    if social_class == 'Nobili':
        return [1, 2, 3, 4]  # Nobili can build all tiers
    elif social_class == 'Cittadini':
        return [1, 2, 3]  # Cittadini can build tiers 1-3
    elif social_class == 'Popolani':
        return [1, 2]  # Popolani can build tiers 1-2
    else:  # Facchini or any other class
        return [1]  # Facchini can only build tier 1

def filter_building_types_by_social_class(building_types: Dict, allowed_tiers: List[int]) -> Dict:
    """Filter building types to only include those allowed for the AI's social class."""
    filtered_types = {}
    
    for building_type, data in building_types.items():
        # Get the tier for this building type
        tier = get_building_tier(building_type, building_types)
        
        # Only include building types that are within the allowed tiers
        if tier in allowed_tiers:
            filtered_types[building_type] = data
    
    return filtered_types

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
        "citizens": api.table(airtable_base_id, "CITIZENS"),
        "lands": api.table(airtable_base_id, "LANDS"),
        "buildings": api.table(airtable_base_id, "BUILDINGS"),
        "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
        "relevancies": api.table(airtable_base_id, "RELEVANCIES"),
        "problems": api.table(airtable_base_id, "PROBLEMS")
    }
    
    return tables

def _escape_airtable_value(value: str) -> str:
    """Échappe les apostrophes pour les formules Airtable."""
    return value

def _get_citizen_problems(tables: Dict[str, Table], username: str, limit: int = 50) -> List[Dict]:
    """Get latest 50 PROBLEMS where Citizen=Username."""
    try:
        safe_username = _escape_airtable_value(username)
        formula = f"{{Citizen}}='{safe_username}'"
        # Assuming 'CreatedAt' field exists for sorting
        records = tables["problems"].all(formula=formula, sort=['-CreatedAt'], max_records=limit)
        log_info(f"Found {len(records)} problems for citizen {username}")
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        log_error(f"Error fetching problems for {username}: {e}")
        return []

def get_ai_citizens(tables, citizen_username_arg: Optional[str] = None) -> List[Dict]:
    """Get AI citizens, optionally filtered by a specific username."""
    try:
        base_formula = "AND({IsAI}=1, {InVenice}=1, {Ducats}>=250000)"
        if citizen_username_arg:
            # Ensure username is properly escaped for the formula
            safe_username = citizen_username_arg
            formula = f"AND({base_formula}, {{Username}}='{safe_username}')"
            log_info(f"Fetching specific AI citizen: {citizen_username_arg}")
        else:
            formula = base_formula
            log_info("Fetching all eligible AI citizens.")

        ai_citizens = tables["citizens"].all(formula=formula)
        
        if citizen_username_arg and not ai_citizens:
            log_warning(f"AI citizen '{citizen_username_arg}' not found or does not meet criteria.")
        elif not ai_citizens:
            log_warning("No AI citizens found meeting the criteria.")
        else:
            log_success(f"Found {len(ai_citizens)} AI citizen(s) matching criteria.")
        return ai_citizens
    except Exception as e:
        log_error(f"Error getting AI citizens: {str(e)}")
        return []

def get_citizen_lands(tables, username: str, target_land_id: Optional[str] = None) -> List[Dict]:
    """Get lands for the AI to consider: a specific land if target_land_id is provided, otherwise all lands."""
    try:
        if target_land_id:
            # Ensure LandId is properly escaped for the formula
            safe_land_id = target_land_id
            formula = f"{{LandId}} = '{safe_land_id}'"
            lands = tables["lands"].all(formula=formula, max_records=1)
            if lands:
                log_info(f"Fetched specific land {target_land_id} for {username} to consider.")
            else:
                log_warning(f"Specific land {target_land_id} not found.")
            return lands
        else:
            # AI considers all lands if no specific land is targeted
            all_lands = tables["lands"].all()
            log_info(f"Returning {len(all_lands)} total lands for {username} to consider for building.")
            return all_lands
    except Exception as e:
        log_error(f"Error getting lands for citizen {username}: {str(e)}")
        return []

def get_all_buildings(tables) -> List[Dict]:
    """Get all buildings from Airtable."""
    try:
        buildings = tables["buildings"].all()
        log_info(f"Found {len(buildings)} buildings in total")
        return buildings
    except Exception as e:
        log_error(f"Error getting buildings: {str(e)}")
        return []

def get_citizen_buildings(tables, username: str) -> List[Dict]:
    """Get all buildings owned by a specific citizen."""
    try:
        # Query buildings where the citizen is the owner
        # Use "Owner" instead of "owner" for the field name
        formula = f"{{Owner}}='{username}'"
        buildings = tables["buildings"].all(formula=formula)
        log_info(f"Found {len(buildings)} buildings owned by {username}")
        return buildings
    except Exception as e:
        log_error(f"Error getting buildings for citizen {username}: {str(e)}")
        return []

def get_citizen_relevancies(username: str) -> List[Dict]:
    """Get relevancies for a specific citizen using the API endpoint."""
    try:
        log_info(f"Fetching relevancies for citizen {username} from API")
        
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        
        # Construct the API URL with the relevantToCitizen parameter
        url = f"{api_base_url}/api/relevancies?relevantToCitizen={username}"
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if the response has the expected structure
            if "success" in response_data and response_data["success"] and "relevancies" in response_data:
                relevancies = response_data["relevancies"]
                log_info(f"Retrieved {len(relevancies)} relevancies for {username}")
                return relevancies
            else:
                log_warning(f"Unexpected API response format: {response_data}")
                return []
        else:
            log_error(f"Error fetching relevancies from API: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        log_error(f"Error getting relevancies for citizen {username}: {str(e)}")
        return []

def get_relevancies_for_target_citizen(username: str) -> List[Dict]:
    """Get relevancies where the citizen is the target."""
    try:
        log_info(f"Fetching relevancies where {username} is the target from API")
        
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        
        # Construct the API URL with the targetCitizen parameter
        url = f"{api_base_url}/api/relevancies?targetCitizen={username}"
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if the response has the expected structure
            if "success" in response_data and response_data["success"] and "relevancies" in response_data:
                relevancies = response_data["relevancies"]
                log_info(f"Retrieved {len(relevancies)} relevancies where {username} is the target")
                return relevancies
            else:
                log_warning(f"Unexpected API response format: {response_data}")
                return []
        else:
            log_error(f"Error fetching relevancies from API: {response.status_code} - {response.text}")
            return []
    except Exception as e:
        log_error(f"Error getting relevancies for target citizen {username}: {str(e)}")
        return []

def get_building_tier(building_type: str, building_types_data: Dict) -> int: # Renamed building_types to building_types_data for clarity
    """Determine the buildTier of a building type."""
    # Check if the buildTier is explicitly defined in the building_types_data
    # The building_types_data passed here is the global dict fetched from API
    if building_type in building_types_data and building_types_data[building_type].get("buildTier") is not None:
        return int(building_types_data[building_type]["buildTier"])
    
    # Fallback to 'tier' if 'buildTier' is not present (for backward compatibility or other uses of 'tier')
    if building_type in building_types_data and building_types_data[building_type].get("tier") is not None:
        log_warning(f"Building type '{building_type}' using fallback 'tier' field instead of 'buildTier'. Tier: {building_types_data[building_type]['tier']}")
        return int(building_types_data[building_type]["tier"])

    # Default tiers based on building type if not specified in the API data
    # This mapping might be outdated if the API is the source of truth for tiers.
    tier_mapping = {
        # Tier 5 (Nobili only)
        "doge_palace": 5, "basilica": 5, "arsenal_gate": 5, "grand_canal_palace": 5,
        "procuratie": 5, "ducal_chapel": 5, "state_archives": 5, "senate_hall": 5,
        
        # Tier 4 (Nobili only)
        "mint": 4, "arsenal": 4, "customs_house": 4, "grand_theater": 4,
        "admiralty": 4, "treasury": 4, "council_chamber": 4, "embassy": 4,
        "magistrate": 4, "naval_academy": 4, "opera_house": 4,
        
        # Tier 3 (Cittadini and above)
        "fondaco": 3, "shipyard": 3, "eastern_merchant_house": 3, "bank": 3,
        "trading_house": 3, "counting_house": 3, "merchant_guild": 3, "spice_warehouse": 3,
        "silk_exchange": 3, "glass_factory": 3, "printing_press": 3, "apothecary": 3,
        
        # Tier 2 (Popolani and above)
        "bottega": 2, "glassblower": 2, "merceria": 2, "canal_house": 2,
        "artisan_workshop": 2, "sculptor_studio": 2, "goldsmith": 2, "lace_maker": 2,
        "mask_maker": 2, "weaver": 2, "carpenter": 2, "stonemason": 2, "painter_studio": 2,
        
        # Tier 1 (All classes)
        "market_stall": 1, "fisherman_cottage": 1, "blacksmith": 1, "bakery": 1,
        "dock": 1, "bridge": 1, "workshop": 1, "tavern": 1, "gondola_station": 1,
        "small_shop": 1, "fishmonger": 1, "butcher": 1, "cobbler": 1, "tailor": 1,
        "barber": 1, "inn": 1, "laundry": 1, "water_well": 1, "vegetable_garden": 1
    }
    
    # Check if the building type is in our mapping
    if building_type.lower() in tier_mapping:
        return tier_mapping[building_type.lower()]
    
    # If not found in the API data or local mapping, default to a restrictive tier or handle as error.
    # Defaulting to a high tier (e.g., 5) makes it unbuildable by most if data is missing.
    # Defaulting to a low tier (e.g., 1) might be too permissive.
    # For now, let's keep the original fallback mapping if API data is incomplete.
    tier_mapping = {
        # Tier 5 (Nobili only)
        "doge_palace": 5, "basilica": 5, "arsenal_gate": 5, "grand_canal_palace": 5,
        "procuratie": 5, "ducal_chapel": 5, "state_archives": 5, "senate_hall": 5,
        
        # Tier 4 (Nobili only)
        "mint": 4, "arsenal": 4, "customs_house": 4, "grand_theater": 4,
        "admiralty": 4, "treasury": 4, "council_chamber": 4, "embassy": 4,
        "magistrate": 4, "naval_academy": 4, "opera_house": 4,
        
        # Tier 3 (Cittadini and above)
        "fondaco": 3, "shipyard": 3, "eastern_merchant_house": 3, "bank": 3,
        "trading_house": 3, "counting_house": 3, "merchant_guild": 3, "spice_warehouse": 3,
        "silk_exchange": 3, "glass_factory": 3, "printing_press": 3, "apothecary": 3,
        
        # Tier 2 (Popolani and above)
        "bottega": 2, "glassblower": 2, "merceria": 2, "canal_house": 2,
        "artisan_workshop": 2, "sculptor_studio": 2, "goldsmith": 2, "lace_maker": 2,
        "mask_maker": 2, "weaver": 2, "carpenter": 2, "stonemason": 2, "painter_studio": 2,
        
        # Tier 1 (All classes)
        "market_stall": 1, "fisherman_cottage": 1, "blacksmith": 1, "bakery": 1,
        "dock": 1, "bridge": 1, "workshop": 1, "tavern": 1, "gondola_station": 1,
        "small_shop": 1, "fishmonger": 1, "butcher": 1, "cobbler": 1, "tailor": 1,
        "barber": 1, "inn": 1, "laundry": 1, "water_well": 1, "vegetable_garden": 1
    }
    if building_type.lower() in tier_mapping:
        log_warning(f"Building type '{building_type}' buildTier/tier not found in API data, using fallback mapping. Tier: {tier_mapping[building_type.lower()]}")
        return tier_mapping[building_type.lower()]

    log_warning(f"Building type '{building_type}' buildTier/tier not found in API or fallback mapping, defaulting to tier 1 (permissive).")
    return 1

def get_building_types_from_api() -> Dict:
    """Get information about different building types from the API."""
    try:
        # Get API base URL from environment variables, with a default fallback
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        
        # Construct the API URL
        url = f"{api_base_url}/api/building-types"
        
        log_info(f"Fetching building types from API: {url}")
        
        # Make the API request
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if the response has the expected structure
            if "success" in response_data and response_data["success"] and "buildingTypes" in response_data:
                building_types = response_data["buildingTypes"]
                log_success(f"Successfully fetched {len(building_types)} building types from API")
                
                # Transform the data into the format we need - include type, name, tier, and constructionCosts.ducats
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
                            "constructionCost": ducats_cost,
                            "buildTier": building.get("buildTier"), # Prefer buildTier
                            "tier": building.get("tier"), # Keep tier for other potential uses or fallback
                            "category": building.get("category", "business")  # Include the category field
                        }
                
                return transformed_types
            else:
                log_warning(f"Unexpected API response format: {response_data}")
                # Return empty dictionary instead of undefined 'error'
                log_warning("Using empty dictionary due to unexpected response format")
                return {}
        else:
            log_error(f"Error fetching building types from API: {response.status_code} - {response.text}")
            # Return empty dictionary instead of undefined 'error'
            log_warning("Using empty dictionary due to API error")
            return {}
    except Exception as e:
        log_error(f"Exception fetching building types from API: {str(e)}")
        # Return empty dictionary instead of undefined 'error'
        log_warning("Using empty dictionary due to exception")
        return {}

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def prepare_ai_building_strategy(tables: Dict[str, Table], ai_citizen: Dict, citizen_lands: List[Dict], citizen_buildings: List[Dict], all_buildings: List[Dict]) -> Dict:
    """Prepare a comprehensive data package for the AI to make building decisions."""
    
    # Extract citizen information
    username = ai_citizen["fields"].get("Username", "")
    ducats = ai_citizen["fields"].get("Ducats", 0)
    social_class = ai_citizen["fields"].get("SocialClass", "Facchini")  # Default to lowest class if not specified
    
    # Add the additional citizen fields
    description = ai_citizen["fields"].get("Description", "")
    core_personality = ai_citizen["fields"].get("CorePersonality", "")
    image_prompt = ai_citizen["fields"].get("ImagePrompt", "")
    family_motto = ai_citizen["fields"].get("FamilyMotto", "")
    coat_of_arms = ai_citizen["fields"].get("CoatOfArms", "")
    
    # Determine allowed building tiers based on social class
    allowed_tiers = get_allowed_building_tiers(social_class)
    
    # Process lands data
    lands_data = []
    for land in citizen_lands:
        # Get all buildings on this land (not just owned by the AI)
        buildings_on_land = [b for b in all_buildings if b["fields"].get("LandId") == land["fields"].get("LandId")]
        
        land_info = {
            "id": land["fields"].get("LandId", ""),
            "historical_name": land["fields"].get("HistoricalName", ""),
            "english_name": land["fields"].get("EnglishName", ""),
            "last_income": land["fields"].get("LastIncome", 0),
            "building_points_count": land["fields"].get("BuildingPointsCount", 0),
            "has_water_access": land["fields"].get("HasWaterAccess", False),
            "district": land["fields"].get("District", ""),
            "existing_buildings": [
                {
                    "id": b["fields"].get("BuildingId", ""),
                    "type": b["fields"].get("Type", ""),
                    "owner": b["fields"].get("Owner", ""),
                    "income": b["fields"].get("Income", 0),
                    "maintenance_cost": b["fields"].get("MaintenanceCost", 0)
                }
                for b in buildings_on_land
            ]
        }
        lands_data.append(land_info)
    
    # Process buildings data
    buildings_data = []
    for building in citizen_buildings:
        building_info = {
            "id": building["fields"].get("BuildingId", ""),
            "type": building["fields"].get("Type", ""),
            "land_id": building["fields"].get("LandId", ""),
            "position": building["fields"].get("Position", ""),
            "income": building["fields"].get("Income", 0),
            "maintenance_cost": building["fields"].get("MaintenanceCost", 0)
        }
        buildings_data.append(building_info)
    
    # Get relevancies for this citizen from the API
    relevancies = get_citizen_relevancies(username)
    
    # Process relevancies data
    relevancies_data = []
    for relevancy in relevancies:
        relevancy_info = {
            "asset": relevancy.get("asset", ""),
            "asset_type": relevancy.get("assetType", ""),
            "category": relevancy.get("category", ""),
            "type": relevancy.get("type", ""),
            "target_citizen": relevancy.get("targetCitizen", ""),
            "score": relevancy.get("score", 0),
            "time_horizon": relevancy.get("timeHorizon", ""),
            "title": relevancy.get("title", ""),
            "description": relevancy.get("description", ""),
            "status": relevancy.get("status", ""),
            "created_at": relevancy.get("createdAt", "")
        }
        relevancies_data.append(relevancy_info)
    
    # Get relevancies where this citizen is the target
    target_relevancies = get_relevancies_for_target_citizen(username)
    
    # Process target relevancies data
    target_relevancies_data = []
    for relevancy in target_relevancies:
        relevancy_info = {
            "asset": relevancy.get("asset", ""),
            "asset_type": relevancy.get("assetType", ""),
            "category": relevancy.get("category", ""),
            "type": relevancy.get("type", ""),
            "relevant_to_citizen": relevancy.get("relevantToCitizen", ""),
            "score": relevancy.get("score", 0),
            "time_horizon": relevancy.get("timeHorizon", ""),
            "title": relevancy.get("title", ""),
            "description": relevancy.get("description", ""),
            "status": relevancy.get("status", ""),
            "created_at": relevancy.get("createdAt", "")
        }
        target_relevancies_data.append(relevancy_info)
    
    # Get building types information from API
    all_building_types = get_building_types_from_api()
    
    # Filter building types based on social class
    building_types = filter_building_types_by_social_class(all_building_types, allowed_tiers)

    # Get latest problems for the citizen
    latest_citizen_problems = _get_citizen_problems(tables, username)
    
    log_info(f"Filtered building types for {username} ({social_class}): {len(building_types)} of {len(all_building_types)} types available")
    
    # Create a summary of buildings by type
    building_summary = {}
    for building in citizen_buildings:
        building_type = building["fields"].get("Type", "unknown")
        if building_type not in building_summary:
            building_summary[building_type] = 0
        building_summary[building_type] += 1
        
    # Log building summary as a table if there are any buildings
    if building_summary:
        log_section("Building Summary")
        headers = ["Building Type", "Count"]
        rows = [[building_type, count] for building_type, count in building_summary.items()]
        log_table(headers, rows)
    
    # Calculate financial metrics
    total_income = sum(building["fields"].get("Income", 0) for building in citizen_buildings)
    total_maintenance = sum(building["fields"].get("MaintenanceCost", 0) for building in citizen_buildings)
    net_income = total_income - total_maintenance
    
    # Prepare the complete data package
    data_package = {
        "citizen": {
            "username": username,
            "ducats": ducats,
            "social_class": social_class,
            "description": description,  # Add description
            "core_personality": core_personality,  # Add core personality
            "image_prompt": image_prompt,  # Add image prompt
            "family_motto": family_motto,  # Add family motto
            "coat_of_arms": coat_of_arms,  # Add coat of arms
            "allowed_building_tiers": allowed_tiers,
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
        "relevancies": relevancies_data,  # Add the relevancies data
        "target_relevancies": target_relevancies_data,  # Add the target relevancies data
        "latest_citizen_problems": latest_citizen_problems, # Add latest problems for the citizen
        "building_types": building_types,  # Now contains only the filtered building types
        "timestamp": datetime.now().isoformat()
    }
    
    return data_package

def send_building_strategy_request(ai_username: str, data_package: Dict, target_land_id: Optional[str] = None) -> Optional[Dict]:
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
        log_info(f"Sending building strategy request to AI citizen {ai_username}")
        log_info(f"API URL: {url}")
        log_info(f"Citizen has {data_package['citizen']['ducats']} ducats")
        log_info(f"Citizen has access to {len(data_package['lands'])} land(s) and {len(data_package['buildings'])} buildings")

        if target_land_id:
            log_info(f"AI is considering building on pre-selected land: {target_land_id}")
            prompt = f"""
As a citizen in La Serenissima with social class {data_package['citizen']['social_class']}, you are considering building on a specific land: **{target_land_id}**.
Your task is to decide **what type of building** to construct on this land.

Here's your current situation:
- You have {data_package['citizen']['ducats']} ducats available.
- The land {target_land_id} has {data_package['lands'][0]['building_points_count'] if data_package['lands'] else 'N/A'} building points.
- Existing buildings on this land: {len(data_package['lands'][0]['existing_buildings']) if data_package['lands'] else 'N/A'}.

When making your decision, carefully consider:
1. Your current building portfolio and financial situation.
2. EXISTING BUILDINGS on land {target_land_id} - aim for complementary structures.
3. Supply chains and resource flows - build structures that work well with existing ones.
4. Opportunities for new buildings that would increase your income.
5. The rent amounts of existing buildings on this land.

Focus on maximizing your income while maintaining sustainable maintenance costs.

After your analysis, provide your building decision in this JSON format:
```json
{{
  "building_type": "type_of_building_to_build",
  "reason": "brief explanation of why this building type on this land"
}}
```

If you decide not to build anything at this time (e.g., no suitable building type or insufficient funds), return an empty JSON object:
```json
{{}}
```
"""
        else:
            prompt = f"""
As a citizen in La Serenissima with social class {data_package['citizen']['social_class']}, you need to decide on your next building investment.

Here's your current situation:
- You are considering {len(data_package['lands'])} land(s).
- You have {len(data_package['buildings'])} buildings.
- Your current net income is {data_package['citizen']['financial']['net_income']} ducats.
- You have {data_package['citizen']['ducats']} ducats available.

When making your decision, carefully consider:
1. Your current building portfolio.
2. EXISTING BUILDINGS on each land (not just yours) - aim for complementary structures.
3. Supply chains and resource flows - build structures that work together efficiently.
4. Opportunities for new buildings that would increase your income.
5. Which lands would be best for new construction (you can build on any land, not just ones you own).
6. The rent amounts of existing buildings on potential lands.
7. How to prioritize your building plan based on your available ducats.

Focus on maximizing your income while maintaining sustainable maintenance costs. Consider building diversity and how new buildings will complement existing structures.

After your analysis, provide your building decision in this JSON format:
```json
{{
  "building_type": "type_of_building_to_build",
  "land_id": "id_of_land_to_build_on",
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
You are {ai_username}, an AI citizen in La Serenissima. You make your own decisions about building strategy.
{"You are focusing on land " + target_land_id + "." if target_land_id else ""}

Here is the complete data about your current situation:
{json.dumps(data_package, indent=2)}

Your social class is {data_package['citizen']['social_class']}, which means you can only construct buildings of tiers {', '.join(map(str, data_package['citizen']['allowed_building_tiers']))}.
The building_types section only includes buildings that you are allowed to construct based on your social class.

Contextual data available:
- `latest_citizen_problems`: Lists the 50 most recent problems you are facing (e.g., homelessness, worklessness, vacant properties). This can help you prioritize building types that solve these problems.

IMPORTANT: For each land, carefully review the "existing_buildings" field to see what structures are already present. 
When deciding where to build and what to build:
1. Avoid redundancy - don't build the same type of building if similar ones already exist on the land
2. Look for complementary buildings - choose buildings that work well with existing structures
3. Consider the economic ecosystem - different building types can support each other
4. Balance the building types across the land - diverse buildings create a more resilient economy
5. Analyze supply chains - build structures that can provide resources to or consume resources from existing buildings
6. Consider resource flows - ensure efficient movement of resources between your buildings

The relevancies section contains important information about lands and citizens that are relevant to you. 
These relevancies indicate:
- Lands that are geographically close to your properties
- Lands that are connected to your properties by bridges
- Other citizens who own significant amounts of land
- Strategic opportunities for expansion

The target_relevancies section contains information about how other citizens view you:
- These are relevancies where you are the target
- They indicate how important you are to other citizens
- They can help you understand your position in the Venetian economy and society

When developing your building strategy:
1. Analyze which lands have the most building potential (consider building points and water access)
2. Evaluate which building types would generate the most income for you
3. Consider the maintenance costs of different building types
4. Prioritize buildings that have the best income-to-maintenance ratio
5. Create a specific, actionable plan with building types and target lands
6. Consider your available ducats when making decisions
7. Take into account the relevancies to make strategic building decisions
8. You can build on any land, not just lands you own
9. Consider the rent amounts of existing buildings on potential lands
10. Consider how your building decisions might affect your relationships with other citizens
11. Evaluate how new buildings will fit into existing supply chains and resource networks

Your decision should be specific, data-driven, and focused on maximizing your income.

IMPORTANT: You must end your response with a JSON object containing your specific building decision.
If you decide to build something, include the building_type, land_id, and reason.
If you decide not to build anything at this time, return an empty JSON object.
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 4,
            "max_files": 8
        }
        
        # Make the API request
        log_info(f"Making API request to Kinos for {ai_username}...")
        response = requests.post(url, headers=headers, json=payload)
        
        # Log the API response details
        log_info(f"API response status code: {response.status_code}")
        
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
            
            log_info(f"API response status: {status}")
            
            # Log the full response data in a readable format
            log_data(f"Full API response for {ai_username}", response_data)
            
            if status == "completed":
                log_success(f"Successfully sent building strategy request to AI citizen {ai_username}")
                
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                log_info(f"AI {ai_username} response length: {len(content)} characters")
                
                # Log the full AI response
                log_section(f"AI {ai_username} Full Response")
                print(content)
                print("\n" + "=" * 80 + "\n")
                
                # Try to extract the JSON decision from the response
                try:
                    # Find the first opening brace and the last closing brace
                    start_index = content.find('{')
                    end_index = content.rfind('}')
                    
                    if start_index != -1 and end_index != -1 and start_index < end_index:
                        # Extract the JSON content
                        json_content = content[start_index:end_index+1]
                        
                        # Clean the content (remove any markdown code block markers)
                        json_content = json_content.replace('```json', '').replace('```', '')
                        
                        log_info(f"Extracted JSON content: {json_content}")
                        
                        # Parse the JSON
                        decision = json.loads(json_content)
                        
                        # Check if we have the required fields
                        if "building_type" in decision:
                            building_type = decision["building_type"]
                            reason = decision.get("reason", "No reason provided")
                            
                            if target_land_id:
                                # If land_id was pre-selected, AI only returns building_type and reason
                                final_decision = {
                                    "building_type": building_type,
                                    "land_id": target_land_id,
                                    "reason": reason
                                }
                                log_data(f"AI {ai_username} decision (land pre-selected)", final_decision)
                                log_success(f"AI {ai_username} wants to build a {building_type} on pre-selected land {target_land_id}")
                                log_info(f"Reason: {reason}")
                                return final_decision
                            elif "land_id" in decision:
                                # If AI selected the land
                                land_id_from_ai = decision["land_id"]
                                final_decision = {
                                    "building_type": building_type,
                                    "land_id": land_id_from_ai,
                                    "reason": reason
                                }
                                log_data(f"AI {ai_username} decision (AI selected land)", final_decision)
                                log_success(f"AI {ai_username} wants to build a {building_type} on land {land_id_from_ai}")
                                log_info(f"Reason: {reason}")
                                return final_decision
                            else:
                                log_warning(f"AI response for {ai_username} provided 'building_type' but was missing 'land_id' (and no land was pre-selected).")
                                return None
                        elif not decision: # Empty JSON object {} means AI decided not to build
                            log_info(f"AI {ai_username} decided not to build anything at this time (empty JSON response).")
                            return None
                    
                    # If we get here, no valid decision was found
                    log_warning(f"No valid building decision found in AI response for {ai_username}.")
                    return None
                except Exception as e:
                    log_error(f"Error extracting decision from AI response for {ai_username}: {str(e)}")
                    log_error(f"Full response content that caused the error for {ai_username}:\n{content}")
                    send_error_message_to_kinos_ai(ai_username, "building_strategy_parsing", str(e), content)
                    return None
            else:
                log_error(f"Error processing building strategy request for AI citizen {ai_username}: {response_data}")
                send_error_message_to_kinos_ai(ai_username, "building_strategy_api_error", f"Kinos API status: {status}, Response: {json.dumps(response_data)}")
                return None
        else:
            log_error(f"Error from Kinos API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log_error(f"Error sending building strategy request to AI citizen {ai_username}: {str(e)}")
        log_error(f"Exception traceback: {traceback.format_exc()}")
        send_error_message_to_kinos_ai(ai_username, "building_strategy_exception", str(e))
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
            "Citizen": "admin",
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

def get_polygon_data_for_citizen(username: str, citizen_lands: List[Dict]) -> List[Dict]:
    """Get polygon data for all lands owned by the citizen."""
    try:
        polygon_data = []
        
        # Get land IDs from citizen lands
        land_ids = [land["fields"].get("LandId", "") for land in citizen_lands if land["fields"].get("LandId")]
        
        if not land_ids:
            log_info(f"No land IDs found for citizen {username}")
            return []
        
        # Fetch polygon data from API
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        log_info(f"Fetching polygon data from API: {api_base_url}/api/get-polygons")
        
        response = requests.get(f"{api_base_url}/api/get-polygons?essential=true")
        
        if response.status_code != 200:
            log_error(f"Failed to fetch polygons from API: {response.status_code} {response.text}")
            return []
        
        api_data = response.json()
        
        if 'polygons' not in api_data or not isinstance(api_data['polygons'], list):
            log_error(f"Invalid response format from API: {api_data}")
            return []
        
        # Create a map of polygon IDs to polygon data
        polygon_map = {polygon['id']: polygon for polygon in api_data['polygons'] if 'id' in polygon}
        
        # Match land IDs with polygon data
        for land_id in land_ids:
            if land_id in polygon_map:
                polygon_data.append(polygon_map[land_id])
                # log_success(f"Found polygon data for land {land_id}")
            else:
                log_warning(f"Polygon data not found for land {land_id}")
        
        log_info(f"Retrieved polygon data for {len(polygon_data)} lands")
        return polygon_data
    except Exception as e:
        log_error(f"Error getting polygon data for citizen {username}: {str(e)}")
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
                        # Add polygon ID and point ID to the point for reference
                        point_with_polygon = {
                            "lat": point["lat"],
                            "lng": point["lng"],
                            "polygon_id": polygon_id,
                            "point_type": "land",
                            "id": point.get("id", f"point-{point['lat']}-{point['lng']}")
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
                        # Add polygon ID and point ID to the point for reference
                        point_with_polygon = {
                            "lat": edge["lat"],
                            "lng": edge["lng"],
                            "polygon_id": polygon_id,
                            "point_type": "canal",
                            "id": point.get("id", f"canal-{edge['lat']}-{edge['lng']}")
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
                        # Add polygon ID and point ID to the point for reference
                        point_with_polygon = {
                            "lat": edge["lat"],
                            "lng": edge["lng"],
                            "polygon_id": polygon_id,
                            "point_type": "bridge",
                            "id": point.get("id", f"bridge-{edge['lat']}-{edge['lng']}")
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
                                   available_points: Dict[str, List[Dict]], building_types: Dict,
                                   tables=None, citizen_relevancies=None, target_land_id_arg: Optional[str] = None) -> bool:
    """Send a second request to the AI to choose a specific point for building placement."""
    try:
        if not decision or not decision.get("building_type") or not decision.get("land_id"):
            log_warning(f"No valid building decision from AI {ai_username} (or missing building_type/land_id), skipping placement request.")
            log_data("Received decision object", decision)
            return False
        
        building_type = decision["building_type"]
        land_id = decision["land_id"]
        
        print(f"Processing building placement for {ai_username}: {building_type} on land {land_id}")
        
        # Verify the AI can build this type of building based on social class
        if tables:
            try:
                # Get the AI's social class by calling the API instead of using find_citizen_by_identifier
                api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
                citizen_url = f"{api_base_url}/api/citizens/{ai_username}"
                
                log_info(f"Fetching citizen data from API: {citizen_url}")
                response = requests.get(citizen_url)
                
                if response.status_code != 200:
                    log_error(f"Failed to fetch citizen data: {response.status_code} {response.text}")
                    return False
                
                citizen_data = response.json()
                
                if not citizen_data.get("success"):
                    log_error(f"API returned error: {citizen_data.get('error', 'Unknown error')}")
                    return False
                
                citizen_record = citizen_data.get("citizen")
                if not citizen_record:
                    log_error(f"Citizen {ai_username} not found in API response")
                    return False
                
                social_class = citizen_record.get("socialClass", "Facchini")
                allowed_tiers = get_allowed_building_tiers(social_class)
                building_tier = get_building_tier(building_type, building_types)
                
                if building_tier not in allowed_tiers:
                    log_error(f"AI {ai_username} with social class {social_class} cannot build {building_type} (tier {building_tier})")
                    log_error(f"Allowed tiers for {social_class}: {allowed_tiers}")
                    return False
                
                log_success(f"Building tier {building_tier} is allowed for {ai_username} with social class {social_class}")
            except Exception as e:
                log_error(f"Error verifying social class restrictions: {str(e)}")
                log_error(f"Exception traceback: {traceback.format_exc()}")
                # Continue even if verification fails
        
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
        
        # NEW: Get existing buildings on this land
        existing_buildings_on_land = []
        if tables:
            try:
                buildings_formula = f"{{LandId}} = '{land_id}'"
                land_buildings = tables["buildings"].all(formula=buildings_formula)
                
                for building in land_buildings:
                    existing_buildings_on_land.append({
                        "id": building.get("fields", {}).get("BuildingId", ""),
                        "type": building.get("fields", {}).get("Type", ""),
                        "owner": building.get("fields", {}).get("Owner", ""),
                        "position": building.get("fields", {}).get("Position", ""),
                        "notes": building.get("fields", {}).get("Notes", "")
                    })
                
                print(f"Found {len(existing_buildings_on_land)} existing buildings on land {land_id}")
            except Exception as e:
                print(f"Error fetching existing buildings on land: {str(e)}")
        
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
        
        # Create system instructions with the detailed data including relevancies and existing buildings
        system_instructions = f"""
You are {ai_username}, an AI citizen in La Serenissima.

You previously decided to build a {building_type_info['name']} ({building_type}) on land {land_id}.

Here is information about the land:
{json.dumps([p for p in polygon_data if p.get("id") == land_id], indent=2)}

Here are the existing buildings on this land:
{json.dumps(existing_buildings_on_land, indent=2)}

Here are the available building points for this land (for {point_type} type buildings):
{json.dumps(filtered_points, indent=2)}

"""

        # Add relevancies if provided
        if citizen_relevancies:
            system_instructions += f"""
Here are relevancies that might influence your decision:
{json.dumps(citizen_relevancies, indent=2)}
"""
            
        # Get and add target relevancies
        target_relevancies = get_relevancies_for_target_citizen(ai_username)
        if target_relevancies:
            system_instructions += f"""
Here are relevancies where you are the target:
{json.dumps(target_relevancies, indent=2)}
"""

        system_instructions += f"""
There are {len(filtered_points)} available points. Choose the best location for your {building_type_info['name']} by selecting the index of one of these points (0 to {len(filtered_points)-1}).

When choosing a location, consider:
1. Proximity to other buildings of similar type
2. Rent amounts of existing buildings on this land
3. Strategic positioning for maximum visibility and income
4. How your building placement might affect your relationships with other citizens

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
        log_info(f"Making building placement API request to Kinos for {ai_username}...")
        response = requests.post(url, headers=headers, json=payload)
                
        # Log the API response details
        log_info(f"Building placement API response status code: {response.status_code}")
                
        # Check if the request was successful
        if response.status_code == 200 or response.status_code == 201:
            response_data = response.json()
            status = response_data.get("status")
                    
            log_info(f"Building placement API response status: {status}")
                    
            if status == "completed":
                log_success(f"Successfully sent building placement request to AI citizen {ai_username}")
                        
                # The response content is in the response field of response_data
                content = response_data.get('response', '')
                log_info(f"AI {ai_username} placement response length: {len(content)} characters")
                        
                # Log the full AI response
                log_section(f"AI {ai_username} Full Placement Response")
                print(content)
                print("\n" + "=" * 80 + "\n")
                
                # Try to extract the JSON decision from the response
                try:
                    # Find the first opening brace and the last closing brace
                    start_index = content.find('{')
                    end_index = content.rfind('}')
                    
                    if start_index != -1 and end_index != -1 and start_index < end_index:
                        # Extract the JSON content
                        json_content = content[start_index:end_index+1]
                        
                        # Clean the content (remove any markdown code block markers)
                        json_content = json_content.replace('```json', '').replace('```', '')
                        
                        log_info(f"Extracted JSON content: {json_content}")
                        
                        # Parse the JSON
                        placement_decision = json.loads(json_content)
                        
                        # Check if we have the required fields
                        if "selected_point_index" in placement_decision:
                            selected_index = placement_decision["selected_point_index"]
                            reason = placement_decision.get("reason", "No reason provided")
                            
                            print(f"AI {ai_username} placement decision: {json.dumps(placement_decision)}")
                            
                            # Validate the index
                            if 0 <= selected_index < len(filtered_points):
                                selected_point = filtered_points[selected_index]
                                
                                log_success(f"AI {ai_username} selected point {selected_index} at position {selected_point['lat']}, {selected_point['lng']}")
                                log_info(f"Reason: {reason}")
                                
                                # Now we need to create the building
                                # 1. Get the construction cost for this building type
                                construction_cost = building_type_info.get("constructionCost", 0)
                                log_info(f"Construction cost for {building_type}: {construction_cost} ducats")
                                
                                # 2. Check if the citizen has enough ducats
                                # Get the tables from the function parameters
                                tables = initialize_airtable()
                                
                                # Get citizen data from API
                                api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
                                citizen_url = f"{api_base_url}/api/citizens/{ai_username}"
                                
                                log_info(f"Fetching citizen data from API: {citizen_url}")
                                response = requests.get(citizen_url)
                                
                                if response.status_code != 200:
                                    log_error(f"Failed to fetch citizen data: {response.status_code} {response.text}")
                                    return False
                                
                                citizen_data = response.json()
                                
                                if not citizen_data.get("success"):
                                    log_error(f"API returned error: {citizen_data.get('error', 'Unknown error')}")
                                    return False
                                
                                citizen_record = citizen_data.get("citizen")
                                if not citizen_record:
                                    log_error(f"Citizen {ai_username} not found in API response")
                                    return False
                                
                                citizen_ducats = citizen_record.get("ducats", 0)
                                log_info(f"Citizen {ai_username} has {citizen_ducats} ducats")
                                
                                if citizen_ducats < construction_cost:
                                    log_error(f"Citizen {ai_username} does not have enough ducats to build {building_type}. Required: {construction_cost}, Available: {citizen_ducats}")
                                    return False
                                
                                # 3. Transfer ducats from citizen to ConsiglioDeiDieci
                                # Find ConsiglioDeiDieci record
                                consiglio_records = tables["citizens"].all(formula="{Username}='ConsiglioDeiDieci'")
                                if not consiglio_records:
                                    print("ConsiglioDeiDieci account not found, cannot transfer ducats")
                                    return False
                                
                                consiglio_record = consiglio_records[0]
                                consiglio_ducats = consiglio_record["fields"].get("Ducats", 0)
                                log_info(f"ConsiglioDeiDieci has {consiglio_ducats} ducats before transfer")
                                
                                # Look up the citizen's record ID from Airtable using Username
                                citizen_records = tables["citizens"].all(formula=f"{{Username}}='{ai_username}'")
                                if not citizen_records:
                                    log_error(f"Could not find Airtable record for citizen {ai_username}")
                                    return False
                                
                                citizen_airtable_id = citizen_records[0]["id"]
                                log_info(f"Found Airtable record ID for {ai_username}: {citizen_airtable_id}")
                                
                                # Update citizen's ducats using the Airtable record ID
                                log_info(f"Updating {ai_username}'s ducats from {citizen_ducats} to {citizen_ducats - construction_cost}")
                                tables["citizens"].update(citizen_airtable_id, {
                                    "Ducats": citizen_ducats - construction_cost
                                })
                                
                                # Get ConsiglioDeiDieci's Airtable record ID
                                consiglio_airtable_id = consiglio_record["id"]
                                log_info(f"Found Airtable record ID for ConsiglioDeiDieci: {consiglio_airtable_id}")
                                
                                # Update ConsiglioDeiDieci's ducats
                                log_info(f"Updating ConsiglioDeiDieci's ducats from {consiglio_ducats} to {consiglio_ducats + construction_cost}")
                                tables["citizens"].update(consiglio_airtable_id, {
                                    "Ducats": consiglio_ducats + construction_cost
                                })
                                
                                # 4. Create the building record
                                # Generate a unique building ID
                                import uuid
                                building_id = f"building-{uuid.uuid4()}"
                                
                                # Create a transaction record for the payment
                                try:
                                    # Get the API key and base ID from environment variables
                                    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
                                    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")
                                    
                                    # Create the transactions table directly
                                    transactions_table = Table(airtable_api_key, airtable_base_id, "TRANSACTIONS")
                                    
                                    transaction_record = {
                                        "Type": "building_construction",
                                        "Asset": building_id,
                                        "Seller": "ConsiglioDeiDieci",
                                        "Buyer": ai_username,
                                        "Price": construction_cost,
                                        "CreatedAt": datetime.now().isoformat(),
                                        "ExecutedAt": datetime.now().isoformat(),
                                        "Notes": f"Payment for {building_type} construction"
                                    }
                                    
                                    transactions_table.create(transaction_record)
                                    log_success(f"Created transaction record for {construction_cost} ducats payment from {ai_username} to ConsiglioDeiDieci")
                                except Exception as transaction_error:
                                    log_error(f"Error creating transaction record: {str(transaction_error)}")
                                    # Continue even if transaction record creation fails
                                
                                log_success(f"Transferred {construction_cost} ducats from {ai_username} to ConsiglioDeiDieci")
                                
                                # Generate a point ID if not present
                                point_id = selected_point.get("id", f"point-{selected_point['lat']}-{selected_point['lng']}")
                                
                                # Get the category from building type info
                                # Default to "business" if category is not specified in the API response
                                building_category = building_type_info.get("category", "unknown")
                                
                                # Create the building record
                                building_record = {
                                    "BuildingId": building_id,
                                    "Type": building_type,
                                    "LandId": land_id,
                                    "LeaseAmount": 0,
                                    "Variant": "model",
                                    "Owner": ai_username,
                                    "Point": point_id,
                                    "Category": building_category,  # Add the Category field
                                    # Store position data in Notes field instead
                                    "Notes": json.dumps({"position": {"lat": selected_point["lat"], "lng": selected_point["lng"]}}),
                                    "RentAmount": 0,
                                    "CreatedAt": datetime.now().isoformat()
                                }
                                
                                log_data("Creating building record", building_record)
                                
                                # Add the building to Airtable
                                try:
                                    new_building = tables["buildings"].create(building_record)
                                    log_success(f"Created new building: {building_id} of type {building_type} for {ai_username} on land {land_id}")
                                    log_info(f"Building record ID: {new_building['id']}")
                                except Exception as building_error:
                                    log_error(f"Error creating building record: {str(building_error)}")
                                    log_error(f"Exception traceback: {traceback.format_exc()}")
                                    return False
                                
                                # 5. Create a notification for the citizen
                                notification = {
                                    "Citizen": ai_username,
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
                                    log_success(f"Created notification for {ai_username} about new building")
                                except Exception as notification_error:
                                    log_error(f"Error creating notification: {str(notification_error)}")
                                    # Continue even if notification creation fails
                                
                                # 6. Create a notification for the land owner if different from the building owner
                                if land_id and ai_username:
                                    # Get the land owner
                                    land_owner = None
                                    # Fetch the land record directly from Airtable
                                    land_records = tables["lands"].all(
                                        formula=f"{{LandId}} = '{land_id}'"
                                    )
                                    if land_records:
                                        land_owner = land_records[0]["fields"].get("Owner")
                                    
                                    # If land owner is different from building owner, notify them
                                    if land_owner and land_owner != ai_username:
                                        land_owner_notification = {
                                            "Citizen": land_owner,
                                            "Type": "building_created",
                                            "Content": f"{ai_username} has built a {building_type_info['name']} on your land {land_id}. Please set a wage for this building.",
                                            "CreatedAt": datetime.now().isoformat(),
                                            "ReadAt": None,
                                            "Details": json.dumps({
                                                "building_id": building_id,
                                                "building_type": building_type,
                                                "land_id": land_id,
                                                "owner": ai_username,
                                                "action_required": "set_wage"
                                            })
                                        }
                                        
                                        try:
                                            tables["notifications"].create(land_owner_notification)
                                            log_success(f"Created notification for land owner {land_owner} about new building requiring wage setting")
                                        except Exception as notification_error:
                                            log_error(f"Error creating notification for land owner: {str(notification_error)}")
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
                print(f"Error processing building placement request for AI citizen {ai_username}: {response_data}")
                return False
        else:
            print(f"Error from Kinos API: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error sending building placement request to AI citizen {ai_username}: {str(e)}")
        print(f"Exception traceback: {traceback.format_exc()}")
        return False

def process_ai_building_strategies(dry_run: bool = False, citizen_username_arg: Optional[str] = None, target_land_id_arg: Optional[str] = None):
    """Main function to process AI building strategies."""
    log_header(f"AI Building Strategy Process (dry_run={dry_run}, citizen={citizen_username_arg or 'all'}, landId={target_land_id_arg or 'AI choice'})")
    
    # Import traceback for detailed error logging
    import traceback
    
    # Initialize Airtable connection
    try:
        tables = initialize_airtable()
        log_success("Successfully initialized Airtable connection")
    except Exception as e:
        log_error(f"Failed to initialize Airtable: {str(e)}")
        log_error(f"Exception traceback: {traceback.format_exc()}")
        return

    # Get AI citizens, potentially filtered by citizen_username_arg
    try:
        ai_citizens = get_ai_citizens(tables, citizen_username_arg)
        if not ai_citizens:
            # Message already logged by get_ai_citizens if no citizens found
            return
        # Further filtering by ducats is already handled in get_ai_citizens
    except Exception as e:
        log_error(f"Failed to get AI citizens: {str(e)}")
        log_error(f"Exception traceback: {traceback.format_exc()}")
        return
    
    # Get all buildings for reference (used to find existing buildings on lands)
    try:
        all_buildings = get_all_buildings(tables) # This fetches all buildings in the system
        log_success(f"Successfully retrieved {len(all_buildings)} total buildings for context.")
    except Exception as e:
        log_error(f"Failed to get all buildings: {str(e)}")
        log_error(f"Exception traceback: {traceback.format_exc()}")
        return
    
    # Track results for each AI
    ai_strategy_results = {}
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            print("Skipping AI citizen with no username")
            continue
        
        log_header(f"Processing AI citizen: {ai_username}")
        
        try:
            # Get lands for the AI to consider (specific land or all lands)
            # The username parameter for get_citizen_lands is for logging context.
            citizen_lands = get_citizen_lands(tables, ai_username, target_land_id_arg)
            
            if not citizen_lands:
                if target_land_id_arg:
                    log_warning(f"Target land {target_land_id_arg} not found for AI citizen {ai_username}, skipping.")
                else:
                    log_warning(f"AI citizen {ai_username} has no lands to consider (or all lands query returned empty), skipping.")
                ai_strategy_results[ai_username] = False
                continue
            
            # Get buildings owned by this AI (for context in data_package)
            citizen_buildings_owned = get_citizen_buildings(tables, ai_username)
            log_info(f"Retrieved {len(citizen_buildings_owned)} buildings owned by {ai_username} for context.")

            # Get polygon data for the land(s) being considered.
            # get_polygon_data_for_citizen works fine if citizen_lands contains one or more lands.
            polygon_data = get_polygon_data_for_citizen(ai_username, citizen_lands)
            if not polygon_data:
                log_warning(f"No polygon data found for the lands being considered by {ai_username}, skipping.")
                ai_strategy_results[ai_username] = False
                continue
            log_info(f"Retrieved polygon data for {len(polygon_data)} land(s) being considered.")

            # Determine existing buildings on the specific land(s) being considered for point availability.
            considered_land_ids = [land["fields"].get("LandId") for land in citizen_lands if land["fields"].get("LandId")]
            buildings_on_considered_lands = [
                b for b in all_buildings if b["fields"].get("LandId") in considered_land_ids
            ]
            log_info(f"Found {len(buildings_on_considered_lands)} existing buildings on the {len(considered_land_ids)} land(s) under consideration.")

            # Get available building points on the considered land(s)
            available_points = get_available_building_points(polygon_data, buildings_on_considered_lands)
            
            total_points = sum(len(points_list) for points_list in available_points.values())
            log_info(f"Found {total_points} total available building points for {ai_username}")
            
            if total_points == 0:
                log_warning(f"No available building points for AI citizen {ai_username}, skipping")
                ai_strategy_results[ai_username] = False
                continue
            
            # Prepare the data package for the AI.
            # citizen_buildings_owned is for AI's general context.
            # all_buildings is for context of what's on all lands (filtered by prepare_ai_building_strategy for relevant lands).
            data_package = prepare_ai_building_strategy(tables, ai_citizen, citizen_lands, citizen_buildings_owned, all_buildings)
            
            # Fetch and add building ownership relevancies (if any)
            # This part can remain as is, as it's contextual information for the AI.
            building_ownership_relevancies = []
            try:
                api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
                building_ownership_response = requests.get(
                    f"{api_base_url}/api/relevancies/building-ownership?username={ai_username}"
                )
                if building_ownership_response.ok:
                    building_ownership_data = building_ownership_response.json()
                    if building_ownership_data.get("success"):
                        # detailedRelevancy is expected to be an array of relevancy items
                        detailed_relevancy_list = building_ownership_data.get("detailedRelevancy", [])
                        if isinstance(detailed_relevancy_list, list):
                            for relevancy_item in detailed_relevancy_list:
                                if isinstance(relevancy_item, dict): # Ensure item is a dictionary
                                    building_ownership_relevancies.append({
                                        "asset": relevancy_item.get("asset", ""), "asset_type": relevancy_item.get("assetType", ""),
                                        "category": relevancy_item.get("category", ""), "type": relevancy_item.get("type", ""),
                                        "target_citizen": relevancy_item.get("targetCitizen", ""), "score": relevancy_item.get("score", 0),
                                        "time_horizon": relevancy_item.get("timeHorizon", ""), "title": relevancy_item.get("title", ""),
                                        "description": relevancy_item.get("description", ""), "status": relevancy_item.get("status", "")
                                    })
                                else:
                                    log_warning(f"Skipping non-dictionary item in detailedRelevancy list: {relevancy_item}")
                        else:
                            log_warning(f"detailedRelevancy field is not a list: {detailed_relevancy_list}")
                    log_info(f"Retrieved {len(building_ownership_relevancies)} building ownership relevancies for {ai_username}")
                else:
                    log_warning(f"Failed to fetch building ownership relevancies: {building_ownership_response.status_code}")
            except Exception as e_relevancy: # Renamed e to e_relevancy
                log_warning(f"Error fetching building ownership relevancies: {str(e_relevancy)}")
            data_package["building_ownership_relevancies"] = building_ownership_relevancies
            
            log_success(f"Prepared data package for {ai_username}")
            
            if not dry_run:
                log_section(f"STEP 1: Get building decision for {ai_username}")
                decision = send_building_strategy_request(ai_username, data_package, target_land_id=target_land_id_arg)
                
                if decision and decision.get("building_type") and decision.get("land_id"):
                    building_type_chosen = decision["building_type"]
                    building_types_api = get_building_types_from_api() # This fetches all buildable types by the AI

                    # Get construction cost
                    chosen_building_info = building_types_api.get(building_type_chosen)
                    if not chosen_building_info:
                        log_error(f"Building type '{building_type_chosen}' chosen by AI {ai_username} not found in API definitions. Skipping placement.")
                        ai_strategy_results[ai_username] = False
                        continue
                    
                    construction_cost = chosen_building_info.get("constructionCost", float('inf'))
                    citizen_ducats = data_package.get("citizen", {}).get("ducats", 0)

                    if citizen_ducats < construction_cost:
                        log_error(f"AI citizen {ai_username} does not have enough ducats ({citizen_ducats}) to build {building_type_chosen} (cost: {construction_cost}). Skipping placement.")
                        ai_strategy_results[ai_username] = False
                        continue
                    
                    log_success(f"AI citizen {ai_username} has enough ducats ({citizen_ducats}) to build {building_type_chosen} (cost: {construction_cost}). Proceeding to placement.")
                    log_section(f"STEP 2: Get placement decision for {ai_username}")
                    
                    # Ensure polygon_data and available_points are for the specific land chosen by AI or CLI
                    final_land_id = decision["land_id"]
                    final_polygon_data = [p for p in polygon_data if p.get("id") == final_land_id]
                    
                    if not final_polygon_data:
                        log_error(f"Polygon data for chosen/specified land {final_land_id} not found. Skipping placement.")
                        ai_strategy_results[ai_username] = False
                        continue

                    buildings_on_final_land = [b for b in all_buildings if b["fields"].get("LandId") == final_land_id]
                    final_available_points = get_available_building_points(final_polygon_data, buildings_on_final_land)

                    placement_success = send_building_placement_request(
                        ai_username,
                        decision,
                        final_polygon_data, # Use polygon data for the specific chosen land
                        final_available_points, # Use available points for the specific chosen land
                        building_types_api,
                        tables,
                        get_citizen_relevancies(ai_username), # Contextual relevancies
                        target_land_id_arg=final_land_id # Pass the land_id for context in placement
                    )
                    ai_strategy_results[ai_username] = placement_success
                    log_success(f"Building strategy for {ai_username} completed with success: {placement_success}")
                elif decision is None or not decision.get("building_type"): # AI decided not to build or error
                    log_warning(f"AI {ai_username} decided not to build or an error occurred in decision making.")
                    ai_strategy_results[ai_username] = False # Mark as false if no decision to build
            else: # Dry run
                log_info(f"[DRY RUN] Would send building strategy request to AI citizen {ai_username}")
                log_data("Data package summary", {
                    "Citizen": data_package['citizen']['username'],
                    "Lands": len(data_package['lands']),
                    "Buildings": len(data_package['buildings']),
                    "Net Income": data_package['citizen']['financial']['net_income'],
                    "Available building points": total_points
                })
                ai_strategy_results[ai_username] = True
        except Exception as e:
            print(f"Error processing AI citizen {ai_username}: {str(e)}")
            print(f"Exception traceback: {traceback.format_exc()}")
            ai_strategy_results[ai_username] = False
        else:
            # In dry run mode, just log what would happen
            print(f"[DRY RUN] Would send building strategy request to AI citizen {ai_username}")
            print(f"[DRY RUN] Data package summary:")
            print(f"  - Citizen: {data_package['citizen']['username']}")
            print(f"  - Lands: {len(data_package['lands'])}")
            print(f"  - Buildings: {len(data_package['buildings'])}")
            print(f"  - Net Income: {data_package['citizen']['financial']['net_income']}")
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
        log_info(f"[DRY RUN] Would create admin notification with strategy results")
        log_data("Strategy results", ai_strategy_results)
    
    # Print final summary
    log_section("AI Building Strategy Results Summary")
    headers = ["AI Citizen", "Status"]
    rows = [[ai_name, "SUCCESS" if success else "FAILED"] for ai_name, success in ai_strategy_results.items()]
    log_table(headers, rows)
    
    log_success("AI building strategy process completed")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Building Strategy Script")
    parser.add_argument("--dry-run", action="store_true", help="Run the script without making actual changes.")
    parser.add_argument("--citizen", type=str, help="Run the script for a specific citizen username.")
    parser.add_argument("--landId", type=str, help="Run the script for a specific land ID, skipping AI land selection.")
    args = parser.parse_args()

    dry_run_arg = args.dry_run
    citizen_username_arg = args.citizen
    target_land_id_arg = args.landId
    
    # Run the process
    process_ai_building_strategies(dry_run_arg, citizen_username_arg, target_land_id_arg)
