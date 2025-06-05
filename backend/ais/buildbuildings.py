import os
import sys
import json
import traceback
from datetime import datetime, timedelta # Added timedelta
from typing import Dict, List, Optional, Tuple, Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Table
import colorama
from colorama import Fore, Back, Style
from pprint import pformat
import textwrap
import argparse
import random

# Initialize colorama
colorama.init(autoreset=True)

# Configuration for API calls
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

# Add project root to sys.path to allow imports like backend.engine.utils
PROJECT_ROOT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT_PATH not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_PATH)

from backend.engine.utils.activity_helpers import log_header as shared_log_header, LogColors # Import shared log_header

# Logging functions
# log_header is now imported as shared_log_header

def log_section(message): # log_section remains local as it's not in activity_helpers
    """Print a section header with a colorful border."""
    border = "-" * 80
    print(f"\n{Fore.YELLOW}{border}")
    print(f"{Fore.YELLOW}{Style.BRIGHT}{message.center(80)}")
    print(f"{Fore.YELLOW}{border}{Style.RESET_ALL}\n")

def log_success(message):
    """Print a success message."""
    print(f"{Fore.GREEN}[OK] {message}{Style.RESET_ALL}") # Replaced ✓ with [OK]

def log_info(message):
    """Print an info message."""
    print(f"{Fore.BLUE}[INFO] {message}{Style.RESET_ALL}") # Replaced ℹ with [INFO]

def log_warning(message):
    """Print a warning message."""
    print(f"{Fore.YELLOW}[WARN] {message}{Style.RESET_ALL}") # Replaced ⚠ with [WARN]

def log_error(message):
    """Print an error message."""
    print(f"{Fore.RED}[ERROR] {message}{Style.RESET_ALL}") # Replaced ✗ with [ERROR]

def log_data(label, data, indent=2):
    """Pretty print data with a label."""
    print(f"{Fore.MAGENTA}{label}:{Style.RESET_ALL}")
    formatted_data = pformat(data, indent=indent, width=100)
    indented_data = textwrap.indent(formatted_data, ' ' * indent)
    print(indented_data)

# Adapter to make custom logging functions compatible with log_ref.info/error calls
class CustomLoggerAdapter:
    def info(self, message: str):
        # The message might already contain color codes from the caller.
        # Our log_info function will prepend its own prefix (e.g., [INFO])
        # and handle the overall color styling.
        log_info(message)

    def error(self, message: str):
        log_error(message)

# Global instance of the logger adapter, named 'log' as intended by previous fixes.
log = CustomLoggerAdapter()

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
    
    # session = requests.Session() # Removed custom session
    # session.trust_env = False    # Removed custom session configuration
    api = Api(airtable_api_key) # Let Api manage its own session
    # api.session = session # Removed custom session assignment
    
    tables = {
        "citizens": api.table(airtable_base_id, "CITIZENS"),
        "lands": api.table(airtable_base_id, "LANDS"),
        "buildings": api.table(airtable_base_id, "BUILDINGS"),
        "notifications": api.table(airtable_base_id, "NOTIFICATIONS"),
        "relevancies": api.table(airtable_base_id, "RELEVANCIES"),
        "problems": api.table(airtable_base_id, "PROBLEMS"),
        "contracts": api.table(airtable_base_id, "CONTRACTS"), 
        "transactions": api.table(airtable_base_id, "TRANSACTIONS")
    }
    
    return tables

from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE # Import _escape_airtable_value and VENICE_TIMEZONE

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
        log_warning(f"Failed to get notifications for {username} from API: {data.get('error')}")
        return []
    except requests.exceptions.RequestException as e:
        log_error(f"API request error fetching notifications for {username}: {e}")
        return []
    except json.JSONDecodeError:
        log_error(f"JSON decode error fetching notifications for {username}. Response: {response.text[:200]}")
        return []

def _get_problems_data_api(username: str, limit: int = 20) -> List[Dict]:
    """Fetches active problems for a citizen via the Next.js API."""
    try:
        url = f"{BASE_URL}/api/problems?citizen={username}&status=active&limit={limit}"
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "problems" in data:
            return data["problems"]
        log_warning(f"Failed to get problems for {username} from API: {data.get('error')}")
        return []
    except requests.exceptions.RequestException as e:
        log_error(f"API request error fetching problems for {username}: {e}")
        return []
    except json.JSONDecodeError:
        log_error(f"JSON decode error fetching problems for {username}. Response: {response.text[:200]}")
        return []

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
        base_formula = "AND({IsAI}=1, {InVenice}=1, {Ducats}>=250000, NOT({SocialClass}='Forestieri'))"
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
    # This fallback tier_mapping is less critical if API is source of truth for buildTier.
    # Consider removing or simplifying if API data is reliable.
    fallback_tier_mapping = { # Renamed to avoid confusion with API's 'tier'
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
    if building_type.lower() in fallback_tier_mapping:
        log_warning(f"Building type '{building_type}' buildTier/tier not found in API data, using fallback mapping. Tier: {fallback_tier_mapping[building_type.lower()]}")
        return fallback_tier_mapping[building_type.lower()]

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
                            "constructionCost": ducats_cost, # This is constructionCosts.ducats
                            "constructionCosts": construction_costs, # Full constructionCosts object
                            "constructionMinutes": building.get("constructionMinutes"), # Added constructionMinutes
                            "buildTier": building.get("buildTier"), # Prefer buildTier
                            "tier": building.get("tier"), # Keep tier for other potential uses or fallback
                            "category": building.get("category", "business"),  # Include the category field
                            "pointType": building.get("pointType", None) # Add pointType here
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

def _get_kinos_model_for_citizen(social_class: Optional[str]) -> str:
    """Determines the Kinos model based on social class."""
    if not social_class:
        return "local" # Default model if social class is unknown
    
    s_class_lower = social_class.lower()
    if s_class_lower == "nobili":
        return "gemini-2.5-pro-preview-05-06"
    elif s_class_lower in ["cittadini", "forestieri"]:
        return "gemini-2.5-flash-preview-05-20"
    elif s_class_lower in ["popolani", "facchini"]:
        return "local"
    else: # Default for any other unlisted social class
        return "local"

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
    latest_citizen_problems = _get_citizen_problems(tables, username) # This is direct Airtable
    # Fetch general notifications for the AI (API-based)
    recent_notifications_for_ai = _get_notifications_data_api(username) # New helper needed
    
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
        "recent_notifications_for_ai": recent_notifications_for_ai, # Added notifications
        "building_types": building_types,  # Now contains only the filtered building types
        "timestamp": datetime.now(VENICE_TIMEZONE).isoformat() # Use VENICE_TIMEZONE
    }
        
    return data_package

def send_building_strategy_request(ai_username: str, data_package: Dict, target_land_id: Optional[str] = None, additional_message: Optional[str] = None, kinos_model_override: Optional[str] = None) -> Optional[Dict]:
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

When making your decision, carefully consider the information that you have at your disposition.

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
        
        if additional_message:
            prompt += f"\n\n{additional_message}"

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

The relevancies section contains important information about lands and citizens that are relevant to you. 
The target_relevancies section contains information about how other citizens view you.

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

        actual_model_to_use = kinos_model_override
        if not actual_model_to_use:
            ai_social_class = data_package.get("citizen", {}).get("social_class")
            actual_model_to_use = _get_kinos_model_for_citizen(ai_social_class)

        if actual_model_to_use:
            payload["model"] = actual_model_to_use
            log_info(f"Using Kinos model '{actual_model_to_use}' for {ai_username} (building strategy).")
        else: # Should not be reached
            log_warning(f"Warning: No Kinos model override and could not determine model from social class for {ai_username}. Using Kinos default.")
        
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
        from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
        notification = {
            "Citizen": "ConsiglioDeiDieci", # Standardized admin user
            "Type": "ai_building_strategy",
            "Content": f"🏗️ **AI Building Strategy Results** 🏗️\n\n{message}",
            "CreatedAt": datetime.now(VENICE_TIMEZONE).isoformat(), # Use VENICE_TIMEZONE
            "ReadAt": None, # Mark as unread for admin
            "Status": "unread", # Explicitly unread
            "Details": json.dumps({
                "ai_strategy_results": ai_strategy_results,
                "timestamp": datetime.now(VENICE_TIMEZONE).isoformat() # Use VENICE_TIMEZONE
            })
        }
        
        tables["notifications"].create(notification)
        log_success("📊 Created admin notification with AI building strategy results") # Use log_success
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

        # Collect all occupied logical Point IDs from existing buildings
        occupied_logical_point_ids = set()
        for building_record in existing_buildings: # existing_buildings are from Airtable BUILDINGS table
            point_field_val = building_record.get("fields", {}).get("Point")
            if not point_field_val:
                continue
            
            if isinstance(point_field_val, str):
                if point_field_val.startswith('[') and point_field_val.endswith(']'):
                    try:
                        point_list = json.loads(point_field_val)
                        if isinstance(point_list, list):
                            for p_id_str in point_list:
                                if isinstance(p_id_str, str):
                                    occupied_logical_point_ids.add(p_id_str)
                        else: # Not a list after parsing
                            log_warning(f"Point field for building {building_record.get('id', 'N/A')} looked like a list but parsed to {type(point_list)}: {point_field_val}")
                            occupied_logical_point_ids.add(point_field_val) # Treat as single string
                    except json.JSONDecodeError:
                        log_warning(f"Failed to parse Point field as JSON list for building {building_record.get('id', 'N/A')}: {point_field_val}")
                        occupied_logical_point_ids.add(point_field_val) # Treat as single string if parse fails
                else: # Plain string
                    occupied_logical_point_ids.add(point_field_val)
            elif isinstance(point_field_val, list): # Should not happen if field is Text
                 log_warning(f"Point field for building {building_record.get('id', 'N/A')} is an unexpected list type: {point_field_val}")
                 for p_id_item in point_field_val:
                    if isinstance(p_id_item, str):
                        occupied_logical_point_ids.add(p_id_item)
        log_info(f"Collected {len(occupied_logical_point_ids)} unique occupied logical Point IDs.")
        
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
                        # Check against logical Point ID occupancy
                        if point_with_polygon["id"] in occupied_logical_point_ids:
                            # log_info(f"Point {point_with_polygon['id']} on land {polygon_id} (type: land) is logically occupied. Skipping.")
                            continue
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
                        # Check against logical Point ID occupancy
                        if point_with_polygon["id"] in occupied_logical_point_ids:
                            # log_info(f"Point {point_with_polygon['id']} on land {polygon_id} (type: canal) is logically occupied. Skipping.")
                            continue
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
                        # Check against logical Point ID occupancy
                        if point_with_polygon["id"] in occupied_logical_point_ids:
                            # log_info(f"Point {point_with_polygon['id']} on land {polygon_id} (type: bridge) is logically occupied. Skipping.")
                            continue
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

def send_building_placement_request(ai_username: str, ai_citizen_record: Dict, decision: Dict, polygon_data: List[Dict],
                                   available_points: Dict[str, List[Dict]], building_types: Dict,
                                   tables=None, citizen_relevancies=None, target_land_id_arg: Optional[str] = None, additional_message: Optional[str] = None, kinos_model_override: Optional[str] = None) -> bool:
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
        
        # Get building type details to determine the expected pointType
        building_type_info = building_types.get(building_type, {})
        required_point_type_from_def = building_type_info.get("pointType") 
        
        # Map definition's pointType to the key used in available_points dictionary
        points_list_key_for_available = None
        if required_point_type_from_def == "building":
            points_list_key_for_available = "land"  # 'buildingPoints' from polygon data are stored under 'land' key
        elif required_point_type_from_def == "canal":
            points_list_key_for_available = "canal"
        elif required_point_type_from_def == "bridge":
            points_list_key_for_available = "bridge"
        
        if not points_list_key_for_available:
            log_error(f"Building type '{building_type}' has an unknown or missing 'pointType' in its definition: '{required_point_type_from_def}'. Cannot determine which points list to use.")
            return False

        log_info(f"Building '{building_type}' requires point type from definition: '{required_point_type_from_def}', which maps to available_points key: '{points_list_key_for_available}'.")
        
        # Filter available points by the land_id chosen by AI and the mapped key for the point type
        candidate_points_on_land = [
            point for point in available_points.get(points_list_key_for_available, [])
            if point["polygon_id"] == land_id
        ]
        
        log_info(f"Found {len(candidate_points_on_land)} available points of mapped type '{points_list_key_for_available}' (required: '{required_point_type_from_def}') on land '{land_id}'.")
        
        if not candidate_points_on_land:
            log_error(f"No available points of the required type '{required_point_type_from_def}' (mapped to key '{points_list_key_for_available}') found on land '{land_id}' for building '{building_type}'. Cannot place building.")
            # Log details of available_points for debugging
            log_info(f"Available points on all considered lands (before filtering for land '{land_id}' and mapped type '{points_list_key_for_available}'):")
            for pt_type, points_list in available_points.items(): # pt_type here will be "land", "canal", "bridge"
                log_info(f"  Available points list key '{pt_type}': {len(points_list)} points.")
                land_counts = {}
                for pt in points_list:
                    land_id = pt.get("polygon_id", "unknown")
                    if land_id not in land_counts:
                        land_counts[land_id] = 0
                    land_counts[land_id] += 1
                print(f"    Points by land: {land_counts}")
            return False
        
        # building_type_info was already fetched to determine required_point_type_from_def
        log_info(f"Building type info for '{building_type}': {json.dumps(building_type_info)}")
        
        # NEW: Get existing buildings on this land
        existing_buildings_on_land = []
        if tables:
            try:
                buildings_formula = f"{{LandId}} = '{land_id}'"
                land_buildings = tables["buildings"].all(formula=buildings_formula)
                
                for building_item in land_buildings: # Renamed building to building_item to avoid conflict
                    existing_buildings_on_land.append({
                        "id": building_item.get("fields", {}).get("BuildingId", ""),
                        "type": building_item.get("fields", {}).get("Type", ""),
                        "owner": building_item.get("fields", {}).get("Owner", ""),
                        "position": building_item.get("fields", {}).get("Position", ""),
                        "notes": building_item.get("fields", {}).get("Notes", "")
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
        if additional_message:
            prompt += f"\n\n{additional_message}"
            
        # Create system instructions with the detailed data including relevancies and existing buildings
        system_instructions = f"""
You are {ai_username}, an AI citizen in La Serenissima.

You previously decided to build a {building_type_info['name']} ({building_type}) on land {land_id}.
This building requires a point of type: '{required_point_type_from_def}'.

Here is information about the land:
{json.dumps([p for p in polygon_data if p.get("id") == land_id], indent=2)}

Here are the existing buildings on this land:
{json.dumps(existing_buildings_on_land, indent=2)}

Here are the available building points for this land (for '{required_point_type_from_def}' type buildings, using mapped key '{points_list_key_for_available}'):
{json.dumps(candidate_points_on_land, indent=2)}

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

        # Fetch and add general notifications and problems for the AI for placement decision
        recent_notifications_for_placement = _get_notifications_data_api(ai_username) # Helper needs to be defined/imported
        if recent_notifications_for_placement:
            system_instructions += f"""

Here are your recent notifications:
{json.dumps(recent_notifications_for_placement, indent=2)}
"""

        # Problems are fetched based on citizen username, so it's specific to the AI
        recent_problems_for_placement = _get_problems_data_api(ai_username) # Helper needs to be defined/imported
        if recent_problems_for_placement:
            system_instructions += f"""

Here are your recent problems:
{json.dumps(recent_problems_for_placement, indent=2)}
"""
        system_instructions += f"""
There are {len(candidate_points_on_land)} available points of type '{required_point_type_from_def}'. Choose the best location for your {building_type_info['name']} by selecting the index of one of these points (0 to {len(candidate_points_on_land)-1}).

When choosing a location, consider:
1. Proximity to other buildings of similar type
2. Rent amounts of existing buildings on this land
3. Strategic positioning for maximum visibility and income
4. How your building placement might affect your relationships with other citizens

Your response must be a JSON object with:
1. selected_point_index: The index of your chosen point (0 to {len(candidate_points_on_land)-1})
2. reason: A brief explanation of why you chose this location
"""
        
        # Prepare the request payload
        payload = {
            "message": prompt,
            "addSystem": system_instructions,
            "min_files": 5,
            "max_files": 15
        }

        actual_model_to_use_placement = kinos_model_override
        if not actual_model_to_use_placement:
            # ai_citizen_record is passed to this function, get social class from it
            ai_social_class_placement = ai_citizen_record.get("fields", {}).get("SocialClass")
            actual_model_to_use_placement = _get_kinos_model_for_citizen(ai_social_class_placement)

        if actual_model_to_use_placement:
            payload["model"] = actual_model_to_use_placement
            log_info(f"Using Kinos model '{actual_model_to_use_placement}' for {ai_username} (building placement).")
        else: # Should not be reached
            log_warning(f"Warning: No Kinos model override and could not determine model from social class for {ai_username} (placement). Using Kinos default.")
        
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
                            chosen_index = placement_decision["selected_point_index"]
                            reason = placement_decision.get("reason", "No reason provided")
                            
                            log_data(f"AI {ai_username} placement decision", placement_decision)
                            
                            # Validate the index and point type
                            selected_point = None
                            if 0 <= chosen_index < len(candidate_points_on_land):
                                selected_point = candidate_points_on_land[chosen_index]
                                # The point's actual type is already guaranteed by how candidate_points_on_land was constructed.
                                # log_success(f"AI {ai_username} selected valid point index {chosen_index} of type '{required_point_type_from_def}' at position {selected_point['lat']}, {selected_point['lng']}.")
                                # log_info(f"Reason: {reason}")
                            else:
                                log_warning(f"AI {ai_username} selected an invalid point index: {chosen_index}. Max index is {len(candidate_points_on_land)-1}.")
                                if candidate_points_on_land: # Check if there are any valid points to choose from
                                    selected_point = random.choice(candidate_points_on_land)
                                    log_warning(f"Choosing a random valid point of type '{required_point_type_from_def}' instead: Index {candidate_points_on_land.index(selected_point)} at {selected_point['lat']}, {selected_point['lng']}.")
                                else:
                                    log_error(f"No valid points of type '{required_point_type_from_def}' (mapped key: '{points_list_key_for_available}') were available on land '{land_id}' to choose from randomly. Cannot proceed with building.")
                                    return False # Critical failure, no points to build on.
                            
                            if selected_point: # Proceed if a point was successfully selected (either by AI or randomly)
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
                                
                                # Instead of direct creation, initiate the 'initiate_building_project' activity
                                point_id = selected_point.get("id", f"point-{selected_point['lat']}-{selected_point['lng']}")
                                
                                # Determine builder details (simplified logic from original script)
                                builder_username = None
                                construction_workshops = tables["buildings"].all(formula="AND({SubCategory}='construction', {IsConstructed}=TRUE())")
                                selected_workshop_record = None
                                if construction_workshops:
                                    ai_owned_workshops = [w for w in construction_workshops if w['fields'].get('RunBy') == ai_username]
                                    if ai_owned_workshops:
                                        selected_workshop_record = random.choice(ai_owned_workshops)
                                    else:
                                        selected_workshop_record = random.choice(construction_workshops)
                                if selected_workshop_record:
                                    builder_username = selected_workshop_record['fields'].get('RunBy') or selected_workshop_record['fields'].get('Owner')

                                activity_params = {
                                    "landId": land_id,
                                    "buildingTypeDefinition": building_type, # Pass the string type
                                    "pointDetails": {
                                        "pointId": point_id,
                                        "lat": selected_point["lat"],
                                        "lng": selected_point["lng"]
                                    }
                                }
                                if builder_username:
                                    activity_params["builderContractDetails"] = {
                                        "builderUsername": builder_username,
                                        "contractValue": construction_cost # Pass the ducats cost as contract value
                                    }
                                
                                # The dry_run status for call_try_create_activity_api should come from the main script's dry_run flag
                                # Assuming send_building_placement_request is called with a dry_run parameter
                                # For now, let's assume the main dry_run flag is accessible or passed down.
                                # If this function is called within a non-dry_run block of the main script, this will be False.
                                main_dry_run_flag = "dry_run" in globals() and globals()["dry_run"] # Check if global dry_run exists
                                
                                if call_try_create_activity_api(ai_username, "initiate_building_project", activity_params, main_dry_run_flag, log): # Pass global log object
                                    log_success(f"Successfully initiated 'initiate_building_project' activity for {ai_username} to build {building_type} on {land_id} at point {point_id}.")
                                    # Notifications and ducat transfers will be handled by the activity processor.
                                    return True
                                else:
                                    log_error(f"Failed to initiate 'initiate_building_project' activity for {ai_username}.")
                                    return False
                            else:
                                log_error(f"Failed to select a valid point for building. AI choice was invalid and no random alternative found.")
                                return False
                        else:
                            log_error(f"No 'selected_point_index' in AI placement decision for {ai_username}.")
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

def process_ai_building_strategies(dry_run: bool = False, citizen_username_arg: Optional[str] = None, target_land_id_arg: Optional[str] = None, additional_message_arg: Optional[str] = None, kinos_model_override_arg: Optional[str] = None):
    """Main function to process AI building strategies."""
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "default"
    shared_log_header(f"AI Building Strategy Process (dry_run={dry_run}, citizen={citizen_username_arg or 'all'}, landId={target_land_id_arg or 'AI choice'}, addMessage='{additional_message_arg or ''}', kinos_model={model_status})") # Uses default Fore.CYAN
    
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
        
        shared_log_header(f"Processing AI citizen: {ai_username}", color_code=LogColors.OKBLUE) # Example with a different color
        
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
            # log_info(f"Retrieved {len(citizen_buildings_owned)} buildings owned by {ai_username} for context.")

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
            # log_info(f"Found {len(buildings_on_considered_lands)} existing buildings on the {len(considered_land_ids)} land(s) under consideration.")

            # Get available building points on the considered land(s)
            available_points = get_available_building_points(polygon_data, buildings_on_considered_lands)
        
            total_points = sum(len(points_list) for points_list in available_points.values())
            # log_info(f"Found {total_points} total available building points for {ai_username}")
        
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
        
            # log_success(f"Prepared data package for {ai_username}")
        
            if not dry_run:
                log_section(f"STEP 1: Get building decision for {ai_username}")
                decision = send_building_strategy_request(ai_username, data_package, target_land_id=target_land_id_arg, additional_message=additional_message_arg)
                
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
                
                    # log_success(f"AI citizen {ai_username} has enough ducats ({citizen_ducats}) to build {building_type_chosen} (cost: {construction_cost}). Proceeding to placement.")
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
                        ai_citizen, # Pass the full AI citizen record
                        decision,
                        final_polygon_data, # Use polygon data for the specific chosen land
                        final_available_points, # Use available points for the specific chosen land
                        building_types_api,
                        tables,
                        get_citizen_relevancies(ai_username), # Contextual relevancies
                        target_land_id_arg=final_land_id, # Pass the land_id for context in placement
                        additional_message=additional_message_arg
                    )
                    ai_strategy_results[ai_username] = placement_success
                    # log_success(f"Building strategy for {ai_username} completed with success: {placement_success}")
                elif decision is None or not decision.get("building_type"): # AI decided not to build or error
                    log_warning(f"AI {ai_username} decided not to build or an error occurred in decision making.")
                    ai_strategy_results[ai_username] = False # Mark as false if no decision to build
            else: # Dry run
                log_info(f"[DRY RUN] Would send building strategy request to AI citizen {ai_username}")
                # log_data("Data package summary", {
                #     "Citizen": data_package['citizen']['username'],
                #     "Lands": len(data_package['lands']),
                #     "Buildings": len(data_package['buildings']),
                #     "Net Income": data_package['citizen']['financial']['net_income'],
                #     "Available building points": total_points
                # })
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
    shared_log_header("AI Building Strategy Results Summary", color_code=LogColors.HEADER) # Using shared_log_header for section too
    headers = ["AI Citizen", "Status"]
    rows = [[ai_name, "SUCCESS" if success else "FAILED"] for ai_name, success in ai_strategy_results.items()]
    log_table(headers, rows)
    
    log_success("AI building strategy process completed")

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger (using global log here)
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    # API_BASE_URL is defined globally in this script as BASE_URL
    if dry_run:
        log_ref.info(f"{Fore.YELLOW}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{Style.RESET_ALL}")
        return True # Simulate success for dry run

    api_url = f"{BASE_URL}/api/activities/try-create"
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
            log_ref.info(f"{Fore.GREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{Style.RESET_ALL}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 log_ref.info(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            log_ref.error(f"{Fore.RED}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{Style.RESET_ALL}")
            return False
    except requests.exceptions.RequestException as e:
        log_ref.error(f"{Fore.RED}API request failed for activity '{activity_type}' for {citizen_username}: {e}{Style.RESET_ALL}")
        return False
    except json.JSONDecodeError:
        log_ref.error(f"{Fore.RED}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{Style.RESET_ALL}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Building Strategy Script")
    parser.add_argument("--dry-run", action="store_true", help="Run the script without making actual changes.")
    parser.add_argument("--citizen", type=str, help="Run the script for a specific citizen username.")
    parser.add_argument("--landId", type=str, help="Run the script for a specific land ID, skipping AI land selection.")
    parser.add_argument("--addMessage", type=str, help="A message that will be added at the end of both prompts of the calls to KinOS.")
    parser.add_argument(
        "--model",
        type=str,
        help="Specify a Kinos model override (e.g., 'local', 'gpt-4-turbo')."
    )
    args = parser.parse_args()

    dry_run_arg = args.dry_run
    citizen_username_arg = args.citizen
    target_land_id_arg = args.landId
    additional_message_arg = args.addMessage
    kinos_model_override_arg = args.model
    
    # Run the process
    process_ai_building_strategies(dry_run_arg, citizen_username_arg, target_land_id_arg, additional_message_arg, kinos_model_override_arg)
