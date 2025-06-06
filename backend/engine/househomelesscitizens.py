#!/usr/bin/env python3
"""
Script to house homeless citizens in appropriate buildings based on their social class.

This script:
1. Fetches all citizens without homes
2. Sorts them by wealth (descending)
3. For each citizen, finds an appropriate building based on social class:
   - Nobili: canal_house
   - Cittadini: merchant_s_house
   - Popolani: artisan_s_house
   - Facchini: fisherman_s_cottage
4. Assigns the citizen to the building with the lowest rent
5. Updates the citizen's record with their new home
"""

import os
import sys
import logging
import argparse
import datetime
import json
import traceback # Ajout de l'import pour traceback
from typing import Dict, List, Optional, Any
import math # Pour math.inf
import requests # Ajout de l'import pour requests
from pyairtable import Api, Table
from dotenv import load_dotenv

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Ajout des imports nécessaires pour le calcul de distance et l'échappement
from backend.engine.utils.activity_helpers import calculate_haversine_distance_meters, _get_building_position_coords, _escape_airtable_value, LogColors, log_header

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("house_homeless_citizens")

# Load environment variables
load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

# Constants for building types by social class
BUILDING_PREFERENCES = {
    "Nobili": ["canal_house"],  # Keep preferences for sorting, but will filter by Category=home
    "Cittadini": ["merchant_s_house"],
    "Popolani": ["artisan_s_house"],
    "Facchini": ["fisherman_s_cottage"],
    # Fallback options for any social class
    "ANY": []  # Will be populated with all home buildings
}

# --- Fonctions utilitaires pour les types et tiers de bâtiments (adaptées de citizenhousingmobility.py) ---

def get_building_types_from_api() -> Dict:
    """Get information about different building types from the API."""
    try:
        url = f"{API_BASE_URL}/api/building-types"
        log.info(f"Fetching building types from API: {url}")
        response = requests.get(url, timeout=10) # Ajout d'un timeout
        response.raise_for_status() # Lèvera une exception pour les codes d'erreur HTTP
        
        response_data = response.json()
        if response_data.get("success") and "buildingTypes" in response_data:
            building_types = response_data["buildingTypes"]
            log.info(f"Successfully fetched {len(building_types)} building types from API")
            transformed_types = {}
            for building in building_types:
                if "type" in building and "name" in building: # Assurer que les champs clés existent
                    building_type_key = building["type"]
                    transformed_types[building_type_key] = {
                        "type": building_type_key,
                        "name": building["name"],
                        "consumeTier": building.get("consumeTier"),
                        "buildTier": building.get("buildTier"),
                        "tier": building.get("tier"),
                        # Conserver d'autres champs si nécessaire
                    }
            return transformed_types
        else:
            log.warning(f"Unexpected API response format for building types: {response_data}")
            return {}
    except requests.exceptions.RequestException as e: # Gérer les erreurs réseau/HTTP
        log.error(f"Error fetching building types from API: {e}")
        return {}
    except json.JSONDecodeError as e: # Gérer les erreurs de parsing JSON
        log.error(f"Error parsing JSON from building types API response: {e}")
        return {}
    except Exception as e: # Gérer les autres exceptions
        log.error(f"An unexpected error occurred while fetching building types: {e}")
        return {}

def get_allowed_building_tiers(social_class: str) -> List[int]:
    """Determine which building tiers a citizen can occupy based on their social class."""
    if social_class == 'Nobili':
        return [1, 2, 3, 4]
    elif social_class == 'Cittadini':
        return [1, 2, 3]
    elif social_class == 'Popolani':
        return [1, 2]
    elif social_class == 'Facchini':
        return [1]
    else:
        log.warning(f"Unknown social class '{social_class}', defaulting to Tier 1 allowed.")
        return [1]

def get_building_tier(building_type: str, building_types_data: Dict) -> Optional[int]:
    """Determine the tier of a building type. Returns None if tier cannot be determined."""
    if not building_type or not building_types_data:
        return None
        
    bt_data = building_types_data.get(building_type)
    if bt_data:
        # Prioriser consumeTier, puis buildTier, puis tier
        tier_val = bt_data.get("consumeTier")
        if tier_val is None:
            tier_val = bt_data.get("buildTier")
        if tier_val is None:
            tier_val = bt_data.get("tier")
        
        if tier_val is not None:
            try:
                return int(tier_val)
            except ValueError:
                log.warning(f"Building type '{building_type}' has non-integer tier value: '{tier_val}'.")
                return None # Ou retourner un défaut comme 1, mais None est plus strict
    
    log.warning(f"Building type '{building_type}' tier not found in API data.")
    return None # Ou retourner un défaut

# --- Fin des fonctions utilitaires ---

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        api = Api(api_key)
        # base = api.base(base_id) # Not strictly needed if using pyairtable.Table directly with api_key, base_id
        
        tables = {
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'buildings': Table(api_key, base_id, 'BUILDINGS'),
            'notifications': Table(api_key, base_id, 'NOTIFICATIONS')
        }
        
        # Test connection with one primary table (e.g., citizens)
        log.info("Testing Airtable connection by fetching one record from CITIZENS table...")
        try:
            tables['citizens'].all(max_records=1) 
            log.info("Airtable connection successful.")
        except Exception as conn_e:
            log.error(f"Airtable connection test failed for CITIZENS table: {conn_e}")
            raise conn_e # Re-raise to be caught by the outer try-except

        return tables
    except Exception as e: # This will catch the re-raised conn_e or other init errors
        log.error(f"Failed to initialize Airtable or connection test failed: {e}")
        sys.exit(1) 

def get_homeless_citizens(tables) -> List[Dict]:
    """Fetch citizens without homes, sorted by wealth in descending order."""
    log.info("Fetching homeless citizens...")
    
    try:
        # Get all citizens who are in Venice and are not Forestieri
        citizens_in_venice_formula = "AND({InVenice}=TRUE(), {SocialClass}!='Forestieri')"
        eligible_citizens = tables['citizens'].all(formula=citizens_in_venice_formula)
        
        # Get all HOME buildings with occupants
        # The Occupant field in BUILDINGS stores the Username.
        # We need to map these usernames to citizen Airtable IDs if we want to compare with citizen['id'].
        # However, it's simpler to get the Usernames of occupants and then filter eligible_citizens.
        
        occupied_home_buildings_formula = "AND({Category}='home', NOT(OR({Occupant} = '', {Occupant} = BLANK())))"
        occupied_home_buildings = tables['buildings'].all(formula=occupied_home_buildings_formula)
        
        # Extract the Usernames of occupants of homes
        housed_citizen_usernames = {
            building['fields'].get('Occupant') 
            for building in occupied_home_buildings 
            if building['fields'].get('Occupant')
        }
        
        # Filter eligible citizens to find those whose Username is not in the set of housed citizen usernames
        homeless_citizens = [
            citizen for citizen in eligible_citizens 
            if citizen['fields'].get('Username') not in housed_citizen_usernames
        ]
        
        # Sort by Ducats in descending order
        homeless_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0), reverse=True)
        
        log.info(f"Found {len(homeless_citizens)} homeless citizens")
        return homeless_citizens
    except Exception as e:
        log.error(f"Error fetching homeless citizens: {e}")
        return []

def create_notification(tables, citizen: str, content: str, details: Dict) -> None:
    """Create a notification for a citizen."""
    try:
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_mobility",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": citizen
        })
        
        log.info(f"Created notification for citizen {citizen}")
    except Exception as e:
        log.error(f"Error creating notification: {e}")

def get_available_buildings(tables, building_type: str = None, citizen_position: Optional[Dict[str, float]] = None) -> List[Dict]:
    """Fetch available buildings with Category=home, optionally filtered by type, and sorted by RentPrice + distance."""
    log.info(f"Fetching available home buildings{' of type: ' + building_type if building_type else ''}")
    
    try:
        # Base formula to get buildings with Category=home that are not already occupied and are constructed
        common_filters = "AND({Category} = 'home', OR({Occupant} = '', {Occupant} = BLANK()), {IsConstructed}=TRUE())"
        if building_type:
            formula = f"AND({{Type}} = '{building_type}', {common_filters})"
        else:
            formula = common_filters
            
        buildings_raw = tables['buildings'].all(formula=formula)
        
        buildings_with_score = []
        for building in buildings_raw:
            rent_price = float(building['fields'].get('RentPrice', 0) or 0)
            distance_m = 0.0 # Default distance if citizen_position or building_position is not available

            if citizen_position:
                building_pos = _get_building_position_coords(building)
                if building_pos:
                    try:
                        distance_m = calculate_haversine_distance_meters(
                            citizen_position['lat'], citizen_position['lng'],
                            building_pos['lat'], building_pos['lng']
                        )
                    except Exception as dist_e:
                        log.warning(f"Could not calculate distance for building {building['id']}: {dist_e}")
                        distance_m = float('inf') # Penalize buildings where distance calculation fails
                else:
                    log.warning(f"Building {building['id']} has no position data. Treating distance as very far.")
                    distance_m = float('inf') # Penalize buildings without position
            
            # Score = RentPrice + Distance. If distance is inf, score will be inf.
            score = rent_price + distance_m
            buildings_with_score.append({'building': building, 'score': score, 'rent': rent_price, 'distance': distance_m if distance_m != float('inf') else -1 })

        # Sort by score in ascending order
        buildings_with_score.sort(key=lambda b_info: b_info['score'])
        
        # Log sorted buildings for debugging
        # for b_info in buildings_with_score[:5]: # Log top 5
        #     log.debug(f"  Building: {b_info['building']['fields'].get('Name', b_info['building']['id'])}, Rent: {b_info['rent']:.2f}, Dist: {b_info['distance']:.2f}, Score: {b_info['score']:.2f}")

        sorted_buildings = [b_info['building'] for b_info in buildings_with_score]
        
        log.info(f"Found and sorted {len(sorted_buildings)} available home buildings{' of type ' + building_type if building_type else ''} by score (Rent+Distance).")
        return sorted_buildings
    except Exception as e:
        log.error(f"Error fetching or sorting home buildings{' of type ' + building_type if building_type else ''}: {e}")
        log.error(traceback.format_exc())
        return []

def get_citizen_workplace_coords(tables: Dict[str, Table], citizen_username: str) -> Optional[Dict[str, float]]:
    """Get the coordinates of a citizen's workplace."""
    if not citizen_username:
        return None
    try:
        # Assumes Occupant in BUILDINGS stores the Username.
        # Fetches buildings where the citizen is an occupant and category is 'business'.
        formula = f"AND(OR(CONTAINS(ARRAYJOIN({{OccupantUsernames}}, ','), '{_escape_airtable_value(citizen_username)}'), {{Occupant}} = '{_escape_airtable_value(citizen_username)}'), {{Category}}='business')"
        
        workplace_buildings = tables['buildings'].all(
            formula=formula,
            fields=['Position', 'Point'] # Need fields used by _get_building_position_coords
        )
        if workplace_buildings:
            # If multiple workplaces, take the first one for simplicity.
            # _get_building_position_coords is already imported from activity_helpers
            return _get_building_position_coords(workplace_buildings[0])
        log.debug(f"No workplace found for citizen {citizen_username}.")
        return None
    except Exception as e:
        log.error(f"Error fetching workplace for {citizen_username}: {e}")
        return None

def find_suitable_building(tables, citizen: Dict) -> Optional[Dict]:
    """Find a suitable building for a citizen based on their social class, considering rent and distance to workplace."""
    social_class = citizen['fields'].get('SocialClass', '')
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    citizen_username = citizen['fields'].get('Username') # Get username for workplace lookup

    workplace_coords = None
    if citizen_username:
        workplace_coords = get_citizen_workplace_coords(tables, citizen_username)
        if workplace_coords:
            log.info(f"Citizen {citizen_name} works at {workplace_coords['lat']:.4f}, {workplace_coords['lng']:.4f}. Distance to workplace will be factored.")
        else:
            log.info(f"Citizen {citizen_name} has no defined workplace. Distance to workplace will not be a factor.")
    else:
        log.warning(f"Citizen {citizen_name} (ID: {citizen['id']}) has no Username. Cannot determine workplace.")
            
    log.info(f"Finding suitable building for {citizen_name} (Social Class: {social_class})")
    
    building_types = BUILDING_PREFERENCES.get(social_class, [])
    
    for building_type in building_types:
        # Pass workplace_coords as the reference for distance calculation
        buildings = get_available_buildings(tables, building_type, workplace_coords)
        if buildings:
            log.info(f"Found {len(buildings)} of type {building_type}. Best score (Rent+DistToWork): {buildings[0]['fields'].get('Name', buildings[0]['id'])}")
            return buildings[0] 
    
    log.info(f"No preferred buildings found for {citizen_name}, trying any available home building.")
    # Pass workplace_coords as the reference for distance calculation
    buildings = get_available_buildings(tables, citizen_position=workplace_coords) 
    
    if buildings:
        log.info(f"Found {len(buildings)} of any home type. Best score (Rent+DistToWork): {buildings[0]['fields'].get('Name', buildings[0]['id'])}")
        return buildings[0]
    
    log.warning(f"No suitable home building found for {citizen_name}")
    return None

def assign_citizen_to_building(tables, citizen: Dict, building: Dict) -> bool:
    """Assign a citizen to a building by updating the Occupant field and sending notifications."""
    try:
        citizen_id = citizen['id']
        # Get the citizen's username
        citizen_username = citizen['fields'].get('Username', '')
        
        # If username is missing, fall back to ID
        if not citizen_username:
            citizen_username = citizen_id
            
        building_id = building['id']
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        building_name = building['fields'].get('Name', building['fields'].get('Type', 'Unknown building'))
        
        log.info(f"Assigning {citizen_name} to {building_name}")
        
        # Update the building's Occupant field with the username instead of ID
        tables['buildings'].update(
            building_id,
            {
                'Occupant': citizen_username
            }
        )
        
        # Create notification for the citizen
        rent_price = building['fields'].get('RentPrice', 0)
        notification_content = f"🏠 You have been assigned housing at **{building_name}**. Monthly rent: **{rent_price:,}** 💰 Ducats."
        
        details = {
            "event_type": "housing_assignment",
            "building_id": building_id,
            "building_name": building_name,
            "rent_price": rent_price,
            "timestamp": datetime.datetime.now().isoformat()
        }
        
        create_notification(tables, citizen_id, notification_content, details)
        
        # If the building has a RunBy field, send notification to that citizen too
        ran_by_citizen = building['fields'].get('RunBy')
        if ran_by_citizen:
            manager_notification = f"🏠 **{citizen_name}** has been assigned to your building **{building_name}**."
            manager_details = {
                "event_type": "new_tenant",
                "citizen_id": citizen_id,
                "citizen_name": citizen_name,
                "building_id": building_id,
                "building_name": building_name,
                "timestamp": datetime.datetime.now().isoformat()
            }
            
            create_notification(tables, ran_by_citizen, manager_notification, manager_details)
            log.info(f"Sent notification to building manager {ran_by_citizen}")
        
        return True
    except Exception as e:
        log.error(f"Error assigning citizen to building: {e}")
        return False

def create_admin_notification(tables, housing_summary) -> None:
    """Create a notification for the admin citizen about the housing process."""
    try:
        # Create notification content with summary of all housed citizens
        content = f"🏠 **Housing Report**: {housing_summary['total']:,} citizens housed"
        
        # Create detailed information about the housed citizens by building type
        details = {
            "event_type": "housing_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_housed": housing_summary['total'],
            "by_building_type": {
                "canal_house": housing_summary.get('canal_house', 0),
                "merchant_s_house": housing_summary.get('merchant_s_house', 0),
                "artisan_s_house": housing_summary.get('artisan_s_house', 0),
                "fisherman_s_cottage": housing_summary.get('fisherman_s_cottage', 0)
            },
            "message": f"🏛️ **Housing process complete**. **{housing_summary['total']:,}** citizens were housed: **{housing_summary.get('canal_house', 0):,}** in canal houses, **{housing_summary.get('merchant_s_house', 0):,}** in merchant houses, **{housing_summary.get('artisan_s_house', 0):,}** in artisan houses, and **{housing_summary.get('fisherman_s_cottage', 0):,}** in fisherman cottages."
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Specific citizen to receive the notification
        })
        
        log.info(f"Created admin notification for citizen ConsiglioDeiDieci with housing summary")
    except Exception as e:
        log.error(f"Error creating admin notification: {e}")

def house_homeless_citizens(dry_run: bool = False):
    """Main function to house homeless citizens."""
    log_header(f"Housing Homeless Citizens Process (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    all_building_type_definitions = get_building_types_from_api()
    if not all_building_type_definitions:
        log.error("Failed to load building type definitions. Aborting housing process.")
        return

    homeless_citizens = get_homeless_citizens(tables)
    
    if not homeless_citizens:
        log.info("No homeless citizens found. Exiting.")
        return
    
    log.info(f"Found {len(homeless_citizens)} homeless citizens to house")
    
    # Initialize counters for housing summary
    housing_summary = {
        "total": 0
    }
    
    # FIRST PASS: Prioritize citizens who own buildings of Category 'home' that are tier-appropriate
    log.info("First pass: Prioritizing citizens who own tier-appropriate homes")
    
    try:
        home_buildings_formula = "AND({Category} = 'home', OR({Occupant} = '', {Occupant} = BLANK()), {IsConstructed}=TRUE())"
        all_vacant_home_buildings = tables['buildings'].all(formula=home_buildings_formula)
        log.info(f"Found {len(all_vacant_home_buildings)} unoccupied and constructed home buildings for ownership check.")
    except Exception as e:
        log.error(f"Error fetching home buildings for ownership check: {e}")
        all_vacant_home_buildings = []
    
    owner_to_owned_homes_map = {}
    for building_record in all_vacant_home_buildings:
        owner_username = building_record['fields'].get('Owner')
        if owner_username:
            if owner_username not in owner_to_owned_homes_map:
                owner_to_owned_homes_map[owner_username] = []
            owner_to_owned_homes_map[owner_username].append(building_record)

    citizens_housed_in_first_pass = []

    for citizen in homeless_citizens:
        citizen_username = citizen['fields'].get('Username', '')
        citizen_social_class = citizen['fields'].get('SocialClass', '')
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"

        # Skip citizens without necessary info for owned home check
        if not citizen_username or not citizen_social_class:
            log.warning(f"Citizen {citizen_name} (ID: {citizen['id']}) missing Username or SocialClass. Skipping owned home check.")
            # If they are truly homeless and don't own a home, they will be processed in the second pass.
            # If they do own a home but we can't check it due to missing info, this is a data issue.
            continue

        if citizen_username in owner_to_owned_homes_map:
            allowed_tiers = get_allowed_building_tiers(citizen_social_class)
            suitable_owned_buildings = []

            for owned_building_candidate in list(owner_to_owned_homes_map[citizen_username]):
                owned_building_type = owned_building_candidate['fields'].get('Type')
                owned_building_tier_from_record = owned_building_candidate['fields'].get('Tier')
                actual_owned_building_tier = None

                if owned_building_tier_from_record is not None:
                    try: actual_owned_building_tier = int(owned_building_tier_from_record)
                    except ValueError:
                        log.warning(f"Owned building {owned_building_candidate['id']} for {citizen_username} has non-integer Tier: '{owned_building_tier_from_record}'.")
                        continue
                
                if actual_owned_building_tier is None and owned_building_type:
                    actual_owned_building_tier = get_building_tier(owned_building_type, all_building_type_definitions)
                
                if actual_owned_building_tier is None:
                    log.warning(f"Could not determine tier for owned building {owned_building_candidate['id']} (Type: {owned_building_type}) for {citizen_username}. Skipping.")
                    continue

                if actual_owned_building_tier in allowed_tiers:
                    # Store the building and its tier for later selection
                    suitable_owned_buildings.append({
                        "record": owned_building_candidate,
                        "tier": actual_owned_building_tier
                    })
                else:
                    log.info(f"Owned building {owned_building_candidate['fields'].get('Name', owned_building_candidate['id'])} (Tier: {actual_owned_building_tier}) is not a suitable tier for {citizen_username} (Social Class: {citizen_social_class}, Allowed Tiers: {allowed_tiers}).")

            if suitable_owned_buildings:
                # Sort suitable owned buildings by tier, descending (highest tier first)
                suitable_owned_buildings.sort(key=lambda x: x["tier"], reverse=True)
                
                # Select the best (highest tier) owned building
                best_owned_building_info = suitable_owned_buildings[0]
                owned_building_to_assign = best_owned_building_info["record"]
                assigned_building_tier = best_owned_building_info["tier"]
                
                building_name = owned_building_to_assign['fields'].get('Name', owned_building_to_assign['fields'].get('Type', 'Unknown building'))
                log.info(f"Prioritizing {citizen_name} to live in their own BEST suitable building: {building_name} (Tier: {assigned_building_tier})")
                
                if dry_run:
                    log.info(f"[DRY RUN] Would assign {citizen_name} to their own building {building_name}")
                else:
                    success = assign_citizen_to_building(tables, citizen, owned_building_to_assign)
                    if success:
                        log.info(f"Successfully housed {citizen_name} in their own building {building_name}")
                        housing_summary["total"] += 1
                        summary_building_type_key = owned_building_to_assign['fields'].get('Type', 'unknown_owned')
                        housing_summary[summary_building_type_key] = housing_summary.get(summary_building_type_key, 0) + 1
                        
                        citizens_housed_in_first_pass.append(citizen)
                        # Remove the assigned building from the map to prevent re-assignment
                        owner_to_owned_homes_map[citizen_username].remove(owned_building_to_assign)
                        if not owner_to_owned_homes_map[citizen_username]:
                            del owner_to_owned_homes_map[citizen_username]
                        # No break here, as we've processed this citizen's owned homes.
                    else:
                        log.error(f"Failed to house {citizen_name} in their own building {building_name}")
            # End if suitable_owned_buildings found
    
    # Update homeless_citizens list after the first pass
    if citizens_housed_in_first_pass:
        original_homeless_count = len(homeless_citizens)
        homeless_citizens = [c for c in homeless_citizens if c not in citizens_housed_in_first_pass]
        log.info(f"First pass completed. {original_homeless_count - len(homeless_citizens)} citizens processed or housed in their own properties.")

    # SECOND PASS: Process remaining homeless citizens for market housing
    log.info(f"Second pass: Processing {len(homeless_citizens)} remaining homeless citizens for market housing")
    
    # Sort remaining homeless citizens by wealth (descending)
    homeless_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0), reverse=True)
    
    # Process each remaining homeless citizen
    for citizen in homeless_citizens:
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        social_class = citizen['fields'].get('SocialClass', '')
        
        log.info(f"Processing {citizen_name} ({social_class})")
        
        # Find a suitable building
        building = find_suitable_building(tables, citizen)
        
        if not building:
            log.warning(f"No suitable building found for {citizen_name}")
            continue
        
        building_type = building['fields'].get('Type', 'unknown')
        building_name = building['fields'].get('Name', building_type)
        
        # Update housing summary counters
        housing_summary["total"] = housing_summary.get("total", 0) + 1
        housing_summary[building_type] = housing_summary.get(building_type, 0) + 1
        
        if dry_run:
            log.info(f"[DRY RUN] Would assign {citizen_name} to {building_name}")
        else:
            # Assign the citizen to the building
            success = assign_citizen_to_building(tables, citizen, building)
            if success:
                log.info(f"Successfully housed {citizen_name} in {building_name}")
            else:
                log.error(f"Failed to house {citizen_name} in {building_name}")
    
    # Create admin notification with housing summary
    if housing_summary["total"] > 0 and not dry_run:
        create_admin_notification(tables, housing_summary)
    
    log.info(f"Housing process complete. {housing_summary['total']} citizens housed.")
    
    # Log detailed summary
    for building_type, count in housing_summary.items():
        if building_type != "total":
            log.info(f"  {building_type}: {count} citizens")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="House homeless citizens in appropriate buildings.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    house_homeless_citizens(dry_run=args.dry_run)
