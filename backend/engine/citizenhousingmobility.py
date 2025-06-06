#!/usr/bin/env python3
"""
Citizen Housing Mobility script for La Serenissima.

This script:
1. Checks all housed citizens
2. Based on social class, determines if they look for cheaper housing:
   - Nobili: 10% chance
   - Cittadini: 20% chance
   - Popolani: 30% chance
   - Facchini: 40% chance
3. If they decide to look, finds available housing of the appropriate type with rent below a threshold:
   - Nobili: 12% cheaper
   - Cittadini: 8% cheaper
   - Popolani: 6% cheaper
   - Facchini: 4% cheaper
4. Moves citizens to cheaper housing if found
5. Sends notifications to relevant parties

Run this script daily to simulate housing mobility in Venice.
"""

import os
import sys
import logging
import argparse
import random
import json
import datetime
import subprocess
import requests
import math
import traceback # Ajout de l'import pour traceback
from typing import Dict, List, Optional, Any, Tuple
from pyairtable import Api, Table
from dotenv import load_dotenv

# Importer les fonctions nécessaires depuis activity_helpers
from backend.engine.utils.activity_helpers import _escape_airtable_value, LogColors, log_header

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("citizen_housing_mobility")

# Load environment variables
load_dotenv()

# Constants for mobility chances by social class
MOBILITY_CHANCE = {
    "Nobili": 0.10,  # 10% chance
    "Cittadini": 0.20,  # 20% chance
    "Popolani": 0.30,   # 30% chance
    "Facchini": 0.40    # 40% chance
}

# Constants for rent reduction thresholds by social class
RENT_REDUCTION_THRESHOLD = {
    "Nobili": 0.12,  # 12% cheaper
    "Cittadini": 0.08,  # 8% cheaper
    "Popolani": 0.06,   # 6% cheaper
    "Facchini": 0.04    # 4% cheaper
}

# Constants for building types by social class (same as in househomelesscitizens.py)
# Cette constante sera toujours utilisée pour déterminer QUELS TYPES de bâtiments chercher.
# Le filtrage par TIER se fera ensuite sur les bâtiments de ces types.
BUILDING_PREFERENCES = {
    "Nobili": ["canal_house"],
    "Cittadini": ["merchant_s_house"],
    "Popolani": ["artisan_s_house"],
    "Facchini": ["fisherman_s_cottage"]
}

# --- Fonctions utilitaires (potentiellement copiées/adaptées de buildbuildings.py) ---

def get_building_types_from_api() -> Dict:
    """Get information about different building types from the API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")
        url = f"{api_base_url}/api/building-types"
        log.info(f"Fetching building types from API: {url}")
        response = requests.get(url)
        if response.status_code == 200:
            response_data = response.json()
            if response_data.get("success") and "buildingTypes" in response_data:
                building_types = response_data["buildingTypes"]
                log.info(f"Successfully fetched {len(building_types)} building types from API")
                transformed_types = {}
                for building in building_types:
                    if "type" in building and "name" in building:
                        building_type_key = building["type"]
                        transformed_types[building_type_key] = {
                            "type": building_type_key,
                            "name": building["name"],
                            "consumeTier": building.get("consumeTier"),
                            "buildTier": building.get("buildTier"),
                            "tier": building.get("tier"),
                            # Ajouter d'autres champs si nécessaire
                        }
                return transformed_types
            else:
                log.warning(f"Unexpected API response format for building types: {response_data}")
                return {}
        else:
            log.error(f"Error fetching building types from API: {response.status_code} - {response.text}")
            return {}
    except Exception as e:
        log.error(f"Exception fetching building types from API: {str(e)}")
        return {}

def get_building_tier(building_type: str, building_types_data: Dict) -> int:
    """Determine the tier of a building type, prioritizing consumeTier."""
    if building_type in building_types_data:
        bt_data = building_types_data[building_type]
        tier_val = bt_data.get("consumeTier")
        if tier_val is None:
            tier_val = bt_data.get("buildTier")
        if tier_val is None:
            tier_val = bt_data.get("tier")
        
        if tier_val is not None:
            try:
                return int(tier_val)
            except ValueError:
                log.warning(f"Building type '{building_type}' has non-integer tier value: '{tier_val}'. Defaulting to 1.")
                return 1
    
    log.warning(f"Building type '{building_type}' consumeTier/buildTier/tier not found in API data, defaulting to tier 1.")
    return 1

def get_allowed_building_tiers(social_class: str) -> List[int]:
    """Determine which building tiers a citizen can occupy based on their social class."""
    # Inversé par rapport à buildbuildings: ici c'est le tier MAXIMAL qu'ils peuvent occuper.
    # Ou plutôt, les tiers qu'ils sont susceptibles de vouloir/pouvoir occuper.
    # Pour la mobilité vers le moins cher, on peut supposer qu'ils peuvent occuper des tiers inférieurs.
    # La demande est "tier adaptés", ce qui suggère une plage.
    # Facchini: Tier 1
    # Popolani: Tier 1, 2
    # Cittadini: Tier 1, 2, 3
    # Nobili: Tier 1, 2, 3, 4 (peuvent occuper tous les tiers, mais chercheront probablement dans leur rang ou en dessous)
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

# --- Fin des fonctions utilitaires ---

def get_building_coords(building_record: Dict) -> Optional[Dict[str, float]]:
    """Extracts and parses lat/lng coordinates from a building's Position field."""
    position_str = building_record.get('fields', {}).get('Position')
    if not position_str:
        return None
    try:
        position_data = json.loads(position_str)
        if isinstance(position_data, dict) and 'lat' in position_data and 'lng' in position_data:
            return {'lat': float(position_data['lat']), 'lng': float(position_data['lng'])}
    except (json.JSONDecodeError, ValueError, TypeError):
        log.warning(f"Could not parse Position JSON for building {building_record.get('id', 'N/A')}: {position_str}")
    return None

def calculate_distance_meters(coord1: Dict[str, float], coord2: Dict[str, float]) -> float:
    """Calculate Haversine distance between two lat/lng coordinates in meters."""
    R = 6371000  # Rayon de la Terre en mètres
    lat1_rad = math.radians(coord1['lat'])
    lng1_rad = math.radians(coord1['lng'])
    lat2_rad = math.radians(coord2['lat'])
    lng2_rad = math.radians(coord2['lng'])

    d_lng = lng2_rad - lng1_rad
    d_lat = lat2_rad - lat1_rad

    a = math.sin(d_lat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return distance

def get_citizen_workplace_coords(citizen_username: str, tables: Dict[str, Table]) -> Optional[Dict[str, float]]:
    """Get the coordinates of a citizen's workplace."""
    if not citizen_username:
        return None
    try:
        # Occupant in BUILDINGS stores the Username.
        # Fetches buildings where the citizen is an occupant and category is 'business'.
        # Using _escape_airtable_value for safety, though pyairtable might handle simple cases.
        escaped_username = _escape_airtable_value(citizen_username)
        formula = f"AND(OR(CONTAINS(ARRAYJOIN({{OccupantUsernames}}, ','), '{escaped_username}'), {{Occupant}} = '{escaped_username}'), {{Category}}='business')"
        
        workplace_buildings = tables['buildings'].all(
            formula=formula,
            fields=['Position'] # Only need Position
        )
        if workplace_buildings:
            # If multiple workplaces, take the first one for simplicity
            return get_building_coords(workplace_buildings[0])
        return None
    except Exception as e:
        log.error(f"Error fetching workplace for {citizen_username}: {e}")
        return None


def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        # Use the new recommended way to initialize tables
        api = Api(api_key)
        base = api.base(base_id)
        
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': base.table('CITIZENS'),
            'buildings': base.table('BUILDINGS'),
            'notifications': base.table('NOTIFICATIONS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def get_housed_citizens(tables) -> List[Dict]:
    """Fetch citizens who have homes."""
    log.info("Fetching housed citizens...")
    
    try:
        # Get buildings with non-empty Occupant field
        # We also need the building's Type to determine its Tier later if not directly on building record
        occupied_buildings = tables['buildings'].all(
            formula="NOT(OR({Occupant} = '', {Occupant} = BLANK()))",
            fields=['Occupant', 'Name', 'RentPrice', 'Citizen', 'Type', 'Tier'] # Added Tier
        )
        
        # Extract the occupant IDs
        occupant_ids = [building['fields'].get('Occupant') for building in occupied_buildings if building['fields'].get('Occupant')]
        
        # If no citizens are housed, return empty list
        if not occupant_ids:
            log.info("No housed citizens found")
            return []
        
        # Create a formula to get these citizens, including their SocialClass
        citizen_conditions = [f"RECORD_ID()='{occupant_id}'" for occupant_id in occupant_ids]
        formula = f"OR({', '.join(citizen_conditions)})"
        
        all_housed_citizens_records = tables['citizens'].all(
            formula=formula,
            fields=['FirstName', 'LastName', 'SocialClass', 'Ducats', 'Username'] # Added SocialClass
        )

        # Filter out Forestieri and Nobili, and add building information
        housed_citizens_filtered = []
        for citizen_record in all_housed_citizens_records:
            social_class = citizen_record['fields'].get('SocialClass', '')
            if social_class.lower() in ['forestieri', 'nobili']:
                log.info(f"Skipping {social_class}: {citizen_record['fields'].get('FirstName')} {citizen_record['fields'].get('LastName')} from work mobility.")
                continue

            # Find the building this citizen occupies
            for building in occupied_buildings:
                if building['fields'].get('Occupant') == citizen_record['id']:
                    citizen_record['current_building'] = building
                    break
            housed_citizens_filtered.append(citizen_record)
        
        log.info(f"Found {len(housed_citizens_filtered)} housed citizens (excluding Forestieri).")
        return housed_citizens_filtered
    except Exception as e:
        log.error(f"Error fetching housed citizens: {e}")
        return []

def get_building_details(tables, building_id: str) -> Optional[Dict]:
    """Get details of a specific building."""
    try:
        building = tables['buildings'].get(building_id)
        return building
    except Exception as e:
        log.error(f"Error fetching building {building_id}: {e}")
        return None

def get_available_buildings(
    tables: Dict[str, Table], 
    building_type_preference: str, 
    social_class: str,
    all_building_type_definitions: Dict
) -> List[Dict]:
    """Fetch available buildings of a specific type, filtered by allowed tier, sorted by rent."""
    log.info(f"Fetching available buildings of type '{building_type_preference}' for social class '{social_class}'.")
    
    try:
        # Get buildings of the specified type that are not already occupied and are constructed
        # Also fetch 'Tier' if it exists, or 'Type' to determine tier later.
        formula = f"AND({{Type}} = '{building_type_preference}', OR({{Occupant}} = '', {{Occupant}} = BLANK()), {{IsConstructed}}=TRUE())"
        candidate_buildings = tables['buildings'].all(
            formula=formula,
            fields=['Name', 'RentPrice', 'Citizen', 'Type', 'Tier', 'Position'] # Ensure Position is fetched
        )
        
        allowed_tiers_for_class = get_allowed_building_tiers(social_class)
        log.info(f"Social class '{social_class}' can occupy tiers: {allowed_tiers_for_class}")

        suitable_buildings_by_tier = []
        for building in candidate_buildings:
            building_actual_type = building['fields'].get('Type') # This should match building_type_preference
            
            # Determine the tier of this specific building instance
            # Option 1: Building record has a 'Tier' field directly
            building_instance_tier_str = building['fields'].get('Tier')
            building_instance_tier = None
            if building_instance_tier_str is not None:
                try:
                    building_instance_tier = int(building_instance_tier_str)
                except ValueError:
                    log.warning(f"Building {building['id']} has non-integer Tier value: '{building_instance_tier_str}'. Skipping.")
                    continue
            
            # Option 2: Determine tier from its Type definition if not on instance
            if building_instance_tier is None and building_actual_type:
                building_instance_tier = get_building_tier(building_actual_type, all_building_type_definitions)
            
            if building_instance_tier is None:
                log.warning(f"Could not determine tier for building {building['id']} of type {building_actual_type}. Skipping.")
                continue

            if building_instance_tier in allowed_tiers_for_class:
                suitable_buildings_by_tier.append(building)
            else:
                log.debug(f"Building {building['id']} (Type: {building_actual_type}, Tier: {building_instance_tier}) is not suitable for social class '{social_class}' (Allowed Tiers: {allowed_tiers_for_class}).")

        # Sort by RentPrice in ascending order
        suitable_buildings_by_tier.sort(key=lambda b: float(b['fields'].get('RentPrice', 0) or 0))
        
        log.info(f"Found {len(suitable_buildings_by_tier)} available buildings of type '{building_type_preference}' and suitable tier for '{social_class}'.")
        return suitable_buildings_by_tier
    except Exception as e:
        log.error(f"Error fetching buildings of type {building_type_preference} for {social_class}: {e}")
        return []

def move_citizen_to_new_building(tables, citizen: Dict, old_building: Dict, new_building: Dict) -> bool:
    """Move a citizen from one building to another."""
    citizen_id = citizen['id']
    old_building_id = old_building['id']
    new_building_id = new_building['id']
    
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    old_building_name = old_building['fields'].get('Name', old_building_id)
    new_building_name = new_building['fields'].get('Name', new_building_id)
    
    log.info(f"Moving {citizen_name} from {old_building_name} to {new_building_name}")
    
    try:
        # Update old building record to remove occupant
        tables['buildings'].update(old_building_id, {
            'Occupant': ""
        })
        
        # Update new building record with new occupant
        tables['buildings'].update(new_building_id, {
            'Occupant': citizen_id
        })
        
        # Call updatecitizenDescriptionAndImage.py to update the citizen's description and image
        try:
            # Get the citizen's username
            citizen_username = citizen['fields'].get('Username', citizen_id)
            
            # Get the path to the updatecitizenDescriptionAndImage.py script
            script_dir = os.path.dirname(os.path.abspath(__file__))
            update_script_path = os.path.join(script_dir, "..", "scripts", "updatecitizenDescriptionAndImage.py")
            
            if os.path.exists(update_script_path):
                # Call the script to update the citizen's description and image
                log.info(f"Calling updatecitizenDescriptionAndImage.py for citizen {citizen_username} after housing move")
                result = subprocess.run(
                    [sys.executable, update_script_path, citizen_username],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode != 0:
                    log.warning(f"Error updating citizen description and image: {result.stderr}")
                else:
                    log.info(f"Successfully updated description and image for citizen {citizen_username}")
            else:
                log.warning(f"Update script not found at: {update_script_path}")
        except Exception as e:
            log.warning(f"Error calling updatecitizenDescriptionAndImage.py: {e}")
            # Continue anyway as this is not critical
        
        log.info(f"Successfully moved {citizen_name} to {new_building_name}")
        return True
    except Exception as e:
        log.error(f"Error moving citizen to new building: {e}")
        return False

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

def send_notifications(tables, citizen: Dict, old_building: Dict, new_building: Dict) -> None:
    """Send notifications to old landlord, new landlord, and admin."""
    citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
    old_building_name = old_building['fields'].get('Name', old_building['id'])
    new_building_name = new_building['fields'].get('Name', new_building['id'])
    
    old_rent = old_building['fields'].get('RentPrice', 0)
    new_rent = new_building['fields'].get('RentPrice', 0)
    
    # Get landlords (building owners)
    old_landlord = old_building['fields'].get('Citizen', 'Unknown')
    new_landlord = new_building['fields'].get('Citizen', 'Unknown')
    
    # Notification for old landlord
    if old_landlord and old_landlord != 'Unknown':
        content = f"🏠 **{citizen_name}** has moved out of your property **{old_building_name}**"
        details = {
            "event_type": "tenant_moved_out",
            "citizen_id": citizen['id'],
            "citizen_name": citizen_name,
            "building_id": old_building['id'],
            "building_name": old_building_name,
            "rent_price": old_rent
        }
        create_notification(tables, old_landlord, content, details)
    
    # Notification for new landlord
    if new_landlord and new_landlord != 'Unknown':
        content = f"🏠 **{citizen_name}** has moved into your property **{new_building_name}**"
        details = {
            "event_type": "tenant_moved_in",
            "citizen_id": citizen['id'],
            "citizen_name": citizen_name,
            "building_id": new_building['id'],
            "building_name": new_building_name,
            "rent_price": new_rent
        }
        create_notification(tables, new_landlord, content, details)
    
    # Notification for citizen
    savings = old_rent - new_rent
    formatted_savings = f"{savings:,.0f}" if savings >= 1000 else f"{savings:.1f}"
    content = f"🏠 You have moved from **{old_building_name}** to **{new_building_name}**, saving **{formatted_savings} ⚜️ Ducats** in rent"
    details = {
        "event_type": "housing_changed",
        "old_building_id": old_building['id'],
        "old_building_name": old_building_name,
        "new_building_id": new_building['id'],
        "new_building_name": new_building_name,
        "old_rent": old_rent,
        "new_rent": new_rent,
        "savings": old_rent - new_rent
    }
    create_notification(tables, citizen['id'], content, details)

def create_admin_summary(tables, mobility_summary) -> None:
    """Create a summary notification for the admin."""
    try:
        # Create notification content
        content = f"🏠 **Housing Mobility Report**: **{mobility_summary['total_moved']}** citizens moved to cheaper housing"
        
        # Create detailed information
        details = {
            "event_type": "housing_mobility_summary",
            "timestamp": datetime.datetime.now().isoformat(),
            "total_citizens_checked": mobility_summary['total_checked'],
            "total_citizens_looking": mobility_summary['total_looking'],
            "total_citizens_moved": mobility_summary['total_moved'],
            "by_social_class": {
                "Nobili": {
                    "checked": mobility_summary['by_class'].get('Nobili', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Nobili', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Nobili', {}).get('moved', 0)
                },
                "Cittadini": {
                    "checked": mobility_summary['by_class'].get('Cittadini', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Cittadini', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Cittadini', {}).get('moved', 0)
                },
                "Popolani": {
                    "checked": mobility_summary['by_class'].get('Popolani', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Popolani', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Popolani', {}).get('moved', 0)
                },
                "Facchini": {
                    "checked": mobility_summary['by_class'].get('Facchini', {}).get('checked', 0),
                    "looking": mobility_summary['by_class'].get('Facchini', {}).get('looking', 0),
                    "moved": mobility_summary['by_class'].get('Facchini', {}).get('moved', 0)
                }
            },
            "average_savings": mobility_summary['total_savings'] / mobility_summary['total_moved'] if mobility_summary['total_moved'] > 0 else 0
        }
        
        # Create the notification record
        tables['notifications'].create({
            "Type": "housing_mobility_summary",
            "Content": content,
            "Details": json.dumps(details),
            "CreatedAt": datetime.datetime.now().isoformat(),
            "ReadAt": None,
            "Citizen": "ConsiglioDeiDieci"  # Admin citizen
        })
        
        log.info(f"Created admin summary notification")
    except Exception as e:
        log.error(f"Error creating admin summary notification: {e}")

def get_citizen_owned_vacant_suitable_homes(
    tables: Dict[str, Table], 
    citizen_username: str, 
    social_class: str, 
    all_building_type_definitions: Dict,
    workplace_coords: Optional[Dict[str, float]]
) -> List[Dict]:
    """Fetch vacant, suitable-tier homes owned by the citizen, sorted by effective rent (distance to work)."""
    log.info(f"Checking for owned, vacant, suitable homes for {citizen_username} ({social_class}).")
    owned_homes = []
    try:
        escaped_username = _escape_airtable_value(citizen_username)
        formula = (f"AND({{Owner}}='{escaped_username}', {{Category}}='home', "
                   f"OR({{Occupant}} = '', {{Occupant}} = BLANK()), {{IsConstructed}}=TRUE())")
        
        candidate_owned_buildings = tables['buildings'].all(
            formula=formula,
            fields=['Name', 'RentPrice', 'Citizen', 'Type', 'Tier', 'Position', 'BuildingId'] # Added BuildingId
        )

        allowed_tiers_for_class = get_allowed_building_tiers(social_class)
        
        for building in candidate_owned_buildings:
            building_actual_type = building['fields'].get('Type')
            building_instance_tier_str = building['fields'].get('Tier')
            building_instance_tier = None
            if building_instance_tier_str is not None:
                try: building_instance_tier = int(building_instance_tier_str)
                except ValueError: continue
            
            if building_instance_tier is None and building_actual_type:
                building_instance_tier = get_building_tier(building_actual_type, all_building_type_definitions)
            
            if building_instance_tier is None or building_instance_tier not in allowed_tiers_for_class:
                continue # Not a suitable tier

            # Calculate effective rent (0 rent + distance to work)
            effective_rent = 0.0 # Rent is 0 for self-owned
            building_coords = get_building_coords(building)
            distance_to_work_for_log = -1.0

            if workplace_coords and building_coords:
                distance_m = calculate_distance_meters(building_coords, workplace_coords)
                effective_rent += distance_m
                distance_to_work_for_log = distance_m
            elif workplace_coords and not building_coords: # Has workplace, but building has no coords
                effective_rent = float('inf') # Penalize if building coords are missing
                log.warning(f"Owned building {building['id']} missing coords, cannot calculate precise effective rent.")
            
            building['effective_rent'] = effective_rent
            building['distance_to_work'] = distance_to_work_for_log # For logging/decision clarity
            owned_homes.append(building)

        owned_homes.sort(key=lambda b: b.get('effective_rent', float('inf')))
        log.info(f"Found {len(owned_homes)} owned, vacant, and suitable homes for {citizen_username}.")
        # for oh in owned_homes:
        #     log.debug(f"  Owned suitable: {oh['fields'].get('Name', oh['id'])}, EffectiveRent (dist): {oh.get('effective_rent', -1):.2f}")

    except Exception as e:
        log.error(f"Error fetching owned vacant homes for {citizen_username}: {e}")
        log.error(traceback.format_exc()) # Added traceback
    return owned_homes


def process_housing_mobility(dry_run: bool = False):
    """Main function to process housing mobility."""
    log_header(f"Citizen Housing Mobility Process (dry_run={dry_run})", LogColors.HEADER)
    
    tables = initialize_airtable()
    all_building_type_definitions = get_building_types_from_api()
    if not all_building_type_definitions:
        log.error("Failed to load building type definitions. Aborting housing mobility.")
        return

    housed_citizens = get_housed_citizens(tables)
    
    if not housed_citizens:
        log.info("No housed citizens found. Mobility process complete.")
        return
    
    # Sort citizens by wealth in ascending order
    housed_citizens.sort(key=lambda c: float(c['fields'].get('Ducats', 0) or 0))
    log.info(f"Sorted {len(housed_citizens)} citizens by wealth in ascending order")
    
    # Track mobility statistics
    mobility_summary = {
        "total_checked": 0,
        "total_looking": 0,
        "total_moved": 0,
        "total_savings": 0,
        "by_class": {
            "Nobili": {"checked": 0, "looking": 0, "moved": 0},
            "Cittadini": {"checked": 0, "looking": 0, "moved": 0},
            "Popolani": {"checked": 0, "looking": 0, "moved": 0},
            "Facchini": {"checked": 0, "looking": 0, "moved": 0}
        }
    }
    
    for citizen in housed_citizens:
        citizen_id = citizen['id']
        social_class = citizen['fields'].get('SocialClass', '')
        
        # Get current building from the attached building info
        current_building = citizen.get('current_building')
        if not current_building:
            citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
            log.warning(f"Citizen {citizen_name} has no current building information despite being in housed list")
            continue
        
        citizen_name = f"{citizen['fields'].get('FirstName', '')} {citizen['fields'].get('LastName', '')}"
        
        # Skip if social class is unknown or Nobili (Nobili don't participate in this type of work mobility)
        if not social_class or social_class == 'Nobili':
            log.info(f"Citizen {citizen_name} has social class '{social_class}'. Skipping work mobility.")
            continue
        
        mobility_summary["total_checked"] += 1
        if social_class in mobility_summary["by_class"]:
            mobility_summary["by_class"][social_class]["checked"] += 1
        else:
            log.warning(f"Social class '{social_class}' not in mobility_summary init for citizen {citizen_name}")

        citizen_username = citizen['fields'].get('Username')
        workplace_coords = None
        if citizen_username:
            workplace_coords = get_citizen_workplace_coords(citizen_username, tables)
        
        if workplace_coords:
            log.info(f"Citizen {citizen_name} works at {workplace_coords['lat']:.4f}, {workplace_coords['lng']:.4f}")
        else:
            log.info(f"Citizen {citizen_name} has no defined workplace. Distance to work will not be a factor.")

        # Determine current building's actual tier
        current_building_type = current_building['fields'].get('Type')
        current_building_tier_from_record = current_building['fields'].get('Tier')
        current_building_actual_tier = None
        if current_building_tier_from_record is not None:
            try:
                current_building_actual_tier = int(current_building_tier_from_record)
            except ValueError:
                log.warning(f"Citizen {citizen_name}'s current building {current_building['id']} has non-integer Tier: '{current_building_tier_from_record}'.")
        if current_building_actual_tier is None and current_building_type:
            current_building_actual_tier = get_building_tier(current_building_type, all_building_type_definitions)

        if current_building_actual_tier is None:
            log.warning(f"Could not determine tier for {citizen_name}'s current building {current_building['id']} (Type: {current_building_type}). Skipping mobility check.")
            continue
            
        allowed_tiers_for_class = get_allowed_building_tiers(social_class)
        is_mismatched_housing = current_building_actual_tier not in allowed_tiers_for_class
        
        new_building_to_move_to = None
        current_rent_price = float(current_building['fields'].get('RentPrice', 0) or 0)
        current_effective_rent = current_rent_price

        if workplace_coords:
            current_home_coords = get_building_coords(current_building)
            if current_home_coords:
                distance_current_home_to_work = calculate_distance_meters(current_home_coords, workplace_coords)
                current_effective_rent += distance_current_home_to_work
                log.info(f"Citizen {citizen_name}'s current home {current_building['id']}: Rent {current_rent_price:.2f}, DistToWork {distance_current_home_to_work:.0f}m, EffectiveRent {current_effective_rent:.2f}")
            else:
                log.warning(f"Could not get coords for current building {current_building['id']} of {citizen_name}. Using raw rent for current effective rent.")
        
        # --- Check for self-owned suitable housing first ---
        owned_suitable_homes = get_citizen_owned_vacant_suitable_homes(
            tables, citizen_username, social_class, all_building_type_definitions, workplace_coords
        )

        # --- Case 1: Mismatched Housing ---
        if is_mismatched_housing:
            log.info(f"Citizen {citizen_name} ({social_class}) in mismatched housing (Tier {current_building_actual_tier}, Allowed: {allowed_tiers_for_class}). MUST MOVE.")
            mobility_summary["total_looking"] += 1
            if social_class in mobility_summary["by_class"]:
                 mobility_summary["by_class"][social_class]["looking"] += 1

            # Prioritize owned suitable homes for mismatch
            if owned_suitable_homes:
                new_building_to_move_to = owned_suitable_homes[0] # Already sorted by effective_rent (distance)
                log.info(f"Mismatch move: Prioritizing owned suitable home {new_building_to_move_to['fields'].get('Name', new_building_to_move_to['id'])} for {citizen_name} (EffectiveRent: {new_building_to_move_to.get('effective_rent',0):.2f}).")
            else:
                # Search market if no owned suitable home
                building_types_to_search = BUILDING_PREFERENCES.get(social_class, [])
                potential_new_homes_mismatch = []
                for type_pref in building_types_to_search:
                    available_homes_of_type = get_available_buildings(
                        tables, type_pref, social_class, all_building_type_definitions
                    )
                    for home in available_homes_of_type:
                        home_rent_price = float(home['fields'].get('RentPrice', 0) or 0)
                        home_effective_rent = home_rent_price
                        if workplace_coords:
                            home_coords = get_building_coords(home)
                            if home_coords:
                                distance_to_work = calculate_distance_meters(home_coords, workplace_coords)
                                home_effective_rent += distance_to_work
                            # No else needed for missing home_coords, as effective_rent remains home_rent_price
                        home['effective_rent'] = home_effective_rent
                    potential_new_homes_mismatch.extend(available_homes_of_type)
                
                if potential_new_homes_mismatch:
                    potential_new_homes_mismatch.sort(key=lambda b: b.get('effective_rent', float('inf')))
                    new_building_to_move_to = potential_new_homes_mismatch[0]
                    log.info(f"Mismatch move (market): Found suitable new home {new_building_to_move_to['fields'].get('Name', new_building_to_move_to['id'])} for {citizen_name} (EffectiveRent: {new_building_to_move_to.get('effective_rent',0):.2f}).")
                else:
                    log.warning(f"Mismatch move: No suitable (by tier) new housing found (neither owned nor market) for {citizen_name}. They remain in mismatched housing.")
        
        # --- Case 2: Standard Mobility (Not a Mismatch) ---
        else:
            if social_class not in MOBILITY_CHANCE:
                 log.warning(f"Citizen {citizen_name} social class '{social_class}' not in MOBILITY_CHANCE. Skipping standard mobility.")
                 continue

            mobility_chance_roll = random.random()
            is_looking_for_cheaper = mobility_chance_roll < MOBILITY_CHANCE.get(social_class, 0.0)
            
            if not is_looking_for_cheaper:
                log.info(f"Citizen {citizen_name} ({social_class}) is not looking for new housing (chance: {mobility_chance_roll:.2f} vs threshold {MOBILITY_CHANCE.get(social_class, 0.0):.2f}).")
                continue

            mobility_summary["total_looking"] += 1
            if social_class in mobility_summary["by_class"]:
                mobility_summary["by_class"][social_class]["looking"] += 1
            
            log.info(f"Citizen {citizen_name} ({social_class}) is looking for cheaper housing (chance-based).")
            
            rent_reduction_needed = RENT_REDUCTION_THRESHOLD.get(social_class, 0.0)
            max_new_effective_rent = current_effective_rent * (1 - rent_reduction_needed)
            log.info(f"Citizen {citizen_name} is looking for effective rent below {max_new_effective_rent:.2f} (current effective: {current_effective_rent:.2f})")

            # Check owned suitable homes first for standard mobility
            best_owned_option = None
            if owned_suitable_homes:
                if owned_suitable_homes[0].get('effective_rent', float('inf')) < max_new_effective_rent:
                    best_owned_option = owned_suitable_homes[0]
                    log.info(f"Standard mobility: Found owned suitable home {best_owned_option['fields'].get('Name', best_owned_option['id'])} (EffectiveRent: {best_owned_option.get('effective_rent',0):.2f}) meeting criteria.")
            
            if best_owned_option:
                new_building_to_move_to = best_owned_option
            else:
                # If no suitable owned home, or owned home not cheap enough, search market
                log.info(f"Standard mobility: No suitable owned home found or owned home not cheap enough. Searching market.")
                building_types_to_search = BUILDING_PREFERENCES.get(social_class, [])
                if not building_types_to_search:
                    log.warning(f"No building preferences for social class: {social_class}")
                    continue

                potential_cheaper_homes_market = []
                for type_pref in building_types_to_search:
                    available_homes_of_type = get_available_buildings(
                        tables, type_pref, social_class, all_building_type_definitions
                    )
                    for home in available_homes_of_type:
                        home_rent_price = float(home['fields'].get('RentPrice', 0) or 0)
                        home_effective_rent = home_rent_price
                        if workplace_coords:
                            home_coords = get_building_coords(home)
                            if home_coords:
                                distance_to_work = calculate_distance_meters(home_coords, workplace_coords)
                                home_effective_rent += distance_to_work
                        
                        if home_effective_rent < max_new_effective_rent:
                            home['effective_rent'] = home_effective_rent
                            potential_cheaper_homes_market.append(home)
                
                if potential_cheaper_homes_market:
                    potential_cheaper_homes_market.sort(key=lambda b: b.get('effective_rent', float('inf')))
                    new_building_to_move_to = potential_cheaper_homes_market[0]
                    log.info(f"Standard mobility (market): Found cheaper suitable new home {new_building_to_move_to['fields'].get('Name', new_building_to_move_to['id'])} for {citizen_name} (EffectiveRent: {new_building_to_move_to.get('effective_rent',0):.2f}).")
                else:
                    log.info(f"Standard mobility: No suitable cheaper housing found (neither owned nor market) for {citizen_name}.")

        # --- Perform the move if a new building was found ---
        if new_building_to_move_to:
            new_rent_price = float(new_building_to_move_to['fields'].get('RentPrice', 0) or 0) # Rent is 0 if owned
            if new_building_to_move_to['fields'].get('Owner') == citizen_username: # Check if it's an owned property
                new_rent_price = 0.0 # Explicitly set rent to 0 for owned property for clarity in logs/notifications
            
            new_effective_rent = new_building_to_move_to.get('effective_rent', new_rent_price)

            if new_effective_rent < current_effective_rent or is_mismatched_housing:
                if dry_run:
                    log.info(f"[DRY RUN] Would move {citizen_name} from {current_building['fields'].get('Name', current_building['id'])} (EffectiveRent: {current_effective_rent:.2f}) to {new_building_to_move_to['fields'].get('Name', new_building_to_move_to['id'])} (EffectiveRent: {new_effective_rent:.2f}).")
                    mobility_summary["total_moved"] += 1
                    if social_class in mobility_summary["by_class"]:
                        mobility_summary["by_class"][social_class]["moved"] += 1
                    mobility_summary["total_savings"] += (current_effective_rent - new_effective_rent) # Savings based on effective rent
                else:
                    success = move_citizen_to_new_building(tables, citizen, current_building, new_building_to_move_to)
                    if success:
                        send_notifications(tables, citizen, current_building, new_building_to_move_to)
                        mobility_summary["total_moved"] += 1
                        if social_class in mobility_summary["by_class"]:
                             mobility_summary["by_class"][social_class]["moved"] += 1
                        mobility_summary["total_savings"] += (current_effective_rent - new_effective_rent)
            else:
                log.info(f"Citizen {citizen_name} found a potential new home {new_building_to_move_to['fields'].get('Name', new_building_to_move_to['id'])} but its effective rent ({new_effective_rent:.2f}) is not better than current ({current_effective_rent:.2f}). Not moving.")
    
    log.info(f"Housing mobility process complete. Checked: {mobility_summary['total_checked']}, Looking: {mobility_summary['total_looking']}, Moved: {mobility_summary['total_moved']}")
    
    if not dry_run and mobility_summary['total_moved'] > 0:
        create_admin_summary(tables, mobility_summary)
    elif dry_run and mobility_summary['total_moved'] > 0:
        log.info(f"[DRY RUN] Would create admin summary for {mobility_summary['total_moved']} moves.")
    else:
        log.info("No citizens moved, so no admin summary created.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process housing mobility for citizens.")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    process_housing_mobility(dry_run=args.dry_run)
    # The call to create_admin_summary is now inside process_housing_mobility
