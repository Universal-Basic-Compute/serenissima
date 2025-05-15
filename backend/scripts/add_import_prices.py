#!/usr/bin/env python3
"""
Import Price Updater for La Serenissima.

This script updates resource JSON files with import prices from a predefined price list.
"""

import os
import sys
import logging
import json
from typing import Dict, Any, List

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("import_price_updater")

# The prices data
PRICES = [
    {"id": "banking_services", "name": "Banking Services", "category": "utility_resources", "price": 60},
    {"id": "blackmail_evidence", "name": "Blackmail Evidence", "category": "finished_goods", "price": 600},
    {"id": "books", "name": "Books", "category": "finished_goods", "price": 144},
    {"id": "bread", "name": "Bread", "category": "finished_goods", "price": 24},
    {"id": "bricks", "name": "Bricks", "category": "processed_materials", "price": 18},
    {"id": "building_materials", "name": "Building Materials", "category": "processed_materials", "price": 48},
    {"id": "clay", "name": "Clay", "category": "raw_materials", "price": 4},
    {"id": "clean-water", "name": "Clean Water", "category": "utility_resources", "price": 6},
    {"id": "criminal_contacts", "name": "Criminal Contacts", "category": "utility_resources", "price": 240},
    {"id": "cut_stone", "name": "Cut Stone", "category": "processed_materials", "price": 30},
    {"id": "disguise_materials", "name": "Disguise Materials", "category": "finished_goods", "price": 216},
    {"id": "dyed_textiles", "name": "Dyed Textiles", "category": "processed_materials", "price": 54},
    {"id": "dyestuffs", "name": "Dyestuffs", "category": "raw_materials", "price": 96},
    {"id": "fine_glassware", "name": "Fine Glassware", "category": "finished_goods", "price": 480},
    {"id": "fish", "name": "Fish", "category": "raw_materials", "price": 4},
    {"id": "flax", "name": "Flax", "category": "raw_materials", "price": 5},
    {"id": "flour", "name": "Flour", "category": "processed_materials", "price": 14},
    {"id": "forgery_tools", "name": "Forgery Tools", "category": "finished_goods", "price": 300},
    {"id": "fuel", "name": "Fuel", "category": "utility_resources", "price": 18},
    {"id": "glass", "name": "Glass", "category": "processed_materials", "price": 72},
    {"id": "gold", "name": "Gold", "category": "raw_materials", "price": 360},
    {"id": "gold_leaf", "name": "Gold Leaf", "category": "processed_materials", "price": 420},
    {"id": "gondola", "name": "Gondola", "category": "finished_goods", "price": 3000},
    {"id": "grain", "name": "Grain", "category": "raw_materials", "price": 6},
    {"id": "hemp", "name": "Hemp", "category": "raw_materials", "price": 7},
    {"id": "iron", "name": "Iron", "category": "raw_materials", "price": 18},
    {"id": "iron_fittings", "name": "Iron Fittings", "category": "processed_materials", "price": 48},
    {"id": "iron_ore", "name": "Iron Ore", "category": "raw_materials", "price": 10},
    {"id": "jewelry", "name": "Jewelry", "category": "finished_goods", "price": 1200},
    {"id": "limestone", "name": "Limestone", "category": "raw_materials", "price": 5},
    {"id": "luxury_silk_garments", "name": "Luxury Silk Garments", "category": "finished_goods", "price": 1440},
    {"id": "maps", "name": "Maps", "category": "finished_goods", "price": 180},
    {"id": "marble", "name": "Marble", "category": "raw_materials", "price": 144},
    {"id": "merchant_galley", "name": "Merchant Galley", "category": "finished_goods", "price": 18000},
    {"id": "molten_glass", "name": "Molten Glass", "category": "processed_materials", "price": 54},
    {"id": "mortar", "name": "Mortar", "category": "processed_materials", "price": 22},
    {"id": "murano_sand", "name": "Murano Sand", "category": "raw_materials", "price": 36},
    {"id": "olive_oil", "name": "Olive Oil", "category": "processed_materials", "price": 26},
    {"id": "olives", "name": "Olives", "category": "raw_materials", "price": 7},
    {"id": "paper", "name": "Paper", "category": "processed_materials", "price": 42},
    {"id": "pine_resin", "name": "Pine Resin", "category": "raw_materials", "price": 14},
    {"id": "pitch", "name": "Pitch", "category": "processed_materials", "price": 34},
    {"id": "poison_components", "name": "Poison Components", "category": "finished_goods", "price": 360},
    {"id": "porter_equipment", "name": "Porter Equipment", "category": "finished_goods", "price": 96},
    {"id": "prepared_silk", "name": "Prepared Silk", "category": "processed_materials", "price": 216},
    {"id": "preserved_fish", "name": "Preserved Fish", "category": "finished_goods", "price": 18},
    {"id": "processed_iron", "name": "Processed Iron", "category": "processed_materials", "price": 42},
    {"id": "rags", "name": "Rags", "category": "raw_materials", "price": 2},
    {"id": "raw_silk", "name": "Raw Silk", "category": "raw_materials", "price": 180},
    {"id": "rope", "name": "Rope", "category": "processed_materials", "price": 94},
    {"id": "sailcloth", "name": "Sailcloth", "category": "processed_materials", "price": 36},
    {"id": "salt", "name": "Salt", "category": "raw_materials", "price": 10},
    {"id": "sand", "name": "Sand", "category": "raw_materials", "price": 1},
    {"id": "ship_components", "name": "Ship Components", "category": "processed_materials", "price": 180},
    {"id": "silk_fabric", "name": "Silk Fabric", "category": "processed_materials", "price": 300},
    {"id": "small_boats", "name": "Small Boats", "category": "finished_goods", "price": 960},
    {"id": "smuggler_maps", "name": "Smuggler's Maps", "category": "finished_goods", "price": 420},
    {"id": "soap", "name": "Soap", "category": "finished_goods", "price": 30},
    {"id": "soda_ash", "name": "Soda Ash", "category": "raw_materials", "price": 22},
    {"id": "spiced_wine", "name": "Spiced Wine", "category": "finished_goods", "price": 72},
    {"id": "stone", "name": "Stone", "category": "raw_materials", "price": 6},
    {"id": "timber", "name": "Timber", "category": "raw_materials", "price": 12},
    {"id": "tools", "name": "Tools", "category": "processed_materials", "price": 60},
    {"id": "venetian_lace", "name": "Venetian Lace", "category": "finished_goods", "price": 960},
    {"id": "war_galley", "name": "War Galley", "category": "finished_goods", "price": 30000},
    {"id": "water", "name": "Water", "category": "raw_materials", "price": 1},
    {"id": "weapons", "name": "Weapons", "category": "finished_goods", "price": 420},
    {"id": "wine", "name": "Wine", "category": "finished_goods", "price": 10}
]

def create_price_map() -> Dict[str, int]:
    """Create a lookup map from resource ID to price.
    
    Returns:
        A dictionary mapping resource IDs to their prices
    """
    price_map = {}
    for item in PRICES:
        price_map[item["id"]] = item["price"]
    return price_map

def update_resource_file(file_path: str, price_map: Dict[str, int]) -> bool:
    """Update a resource file with the import price.
    
    Args:
        file_path: Path to the resource JSON file
        price_map: Dictionary mapping resource IDs to prices
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Read the resource file
        with open(file_path, 'r', encoding='utf-8') as f:
            resource_data = json.load(f)
        
        # Get the resource ID
        resource_id = resource_data.get('id')
        if not resource_id:
            log.warning(f"Resource file {file_path} has no ID field, skipping")
            return False
        
        # Check if we have a price for this resource
        if resource_id in price_map:
            # Add the importPrice field
            resource_data['importPrice'] = price_map[resource_id]
            
            # Write the updated resource data back to the file
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(resource_data, f, indent=2)
            
            log.info(f"Updated {os.path.basename(file_path)} with importPrice: {price_map[resource_id]}")
            return True
        else:
            log.warning(f"No price found for resource: {resource_id} ({os.path.basename(file_path)})")
            return False
    except Exception as e:
        log.error(f"Error updating resource file {file_path}: {e}")
        return False

def process_all_resources(resources_dir: str) -> None:
    """Process all resource files in the specified directory.
    
    Args:
        resources_dir: Path to the directory containing resource JSON files
    """
    # Ensure the directory exists
    if not os.path.exists(resources_dir):
        log.error(f"Directory {resources_dir} does not exist")
        return
    
    # Create the price map
    price_map = create_price_map()
    
    # Get all JSON files in the directory
    resource_files = [
        os.path.join(resources_dir, f) for f in os.listdir(resources_dir)
        if f.endswith('.json')
    ]
    
    log.info(f"Found {len(resource_files)} resource files to process")
    
    success_count = 0
    missing_count = 0
    missing_resources = []
    
    for file_path in resource_files:
        if update_resource_file(file_path, price_map):
            success_count += 1
        else:
            # If update failed due to missing price, track the resource ID
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    resource_data = json.load(f)
                resource_id = resource_data.get('id')
                if resource_id and resource_id not in price_map:
                    missing_count += 1
                    missing_resources.append(resource_id)
            except Exception:
                pass
    
    log.info(f"\nSummary:")
    log.info(f"- Updated {success_count} resource files with import prices")
    log.info(f"- Missing prices for {missing_count} resources")
    
    if missing_resources:
        log.info(f"\nResources missing prices:")
        for resource_id in missing_resources:
            log.info(f"- {resource_id}")
    
    log.info("\nProcess completed!")

if __name__ == "__main__":
    # Get resources directory from command line or use default
    resources_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.getcwd(), 'data', 'resources')
    
    log.info(f"Starting import price updates for resources in {resources_dir}")
    process_all_resources(resources_dir)
