#!/usr/bin/env python3
"""
Script to adjust building maintenance costs by dividing by a specified factor.

This script:
1. Scans the data/buildings directory and subfolders for building JSON files
2. Divides the maintenanceCost value by the specified factor (default: 10)
3. Updates the files with the new values
4. Keeps a log of all changes made

Usage:
    python adjust_maintenance_cost.py [--factor FACTOR] [--dry-run]

Example:
    python adjust_maintenance_cost.py --factor 10  # Divides all maintenance costs by 10
    python adjust_maintenance_cost.py --dry-run     # Shows what would change without making changes
"""

import os
import sys
import logging
import argparse
import json
import time
from typing import Dict, List, Optional, Any
from pathlib import Path

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("adjust_maintenance_cost")

# Constants
BUILDINGS_DATA_DIR = os.path.join(os.getcwd(), 'data', 'buildings')
LOG_FILE = os.path.join(os.getcwd(), 'maintenance_cost_adjustments.log')

def scan_building_files() -> List[Dict[str, Any]]:
    """Scan the buildings directory for JSON files and load their contents."""
    log.info(f"Scanning for building files in {BUILDINGS_DATA_DIR}")
    
    buildings = []
    
    # Walk through all subdirectories
    for root, dirs, files in os.walk(BUILDINGS_DATA_DIR):
        for file in files:
            if file.endswith('.json'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, BUILDINGS_DATA_DIR)
                
                # Skip index files and other non-building files in the root directory
                if os.path.dirname(relative_path) == '' and file.lower() in ['index.json', 'readme.json', 'metadata.json']:
                    log.info(f"Skipping non-building file: {file}")
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        building_data = json.load(f)
                    
                    # Validate that this is actually a building file
                    if not isinstance(building_data, dict):
                        log.warning(f"Skipping {file_path}: Not a valid building JSON object")
                        continue
                    
                    # Skip files that don't have a name or type - likely not buildings
                    if 'name' not in building_data and 'type' not in building_data:
                        log.warning(f"Skipping {file_path}: Not a building (missing name and type)")
                        continue
                    
                    # Skip files that don't have a maintenanceCost field
                    if 'maintenanceCost' not in building_data:
                        log.warning(f"Skipping {file_path}: No maintenanceCost field")
                        continue
                    
                    # Add file path information
                    building_data['_file_path'] = file_path
                    building_data['_relative_path'] = relative_path
                    building_data['_file_name'] = file
                    
                    # Extract category and subCategory from path
                    path_parts = relative_path.split(os.sep)
                    
                    if len(path_parts) >= 2:
                        building_data['_category_dir'] = path_parts[0]
                        building_data['_subCategory_dir'] = path_parts[1] if len(path_parts) > 2 else None
                    
                    buildings.append(building_data)
                    log.info(f"Loaded building: {building_data.get('name', file)} from {relative_path}")
                except json.JSONDecodeError as e:
                    log.error(f"Error parsing JSON in {file_path}: {e}")
                except Exception as e:
                    log.error(f"Error loading building file {file_path}: {e}")
    
    log.info(f"Found {len(buildings)} building files with maintenanceCost field")
    return buildings

def adjust_maintenance_cost(building: Dict[str, Any], factor: float) -> Dict[str, Any]:
    """Adjust the maintenance cost of a building by dividing by the specified factor."""
    # Get the current maintenance cost
    current_cost = building.get('maintenanceCost', 0)
    
    # Skip if maintenance cost is 0 or not a number
    if not isinstance(current_cost, (int, float)) or current_cost == 0:
        log.warning(f"Skipping {building.get('name', 'unknown')}: Invalid maintenanceCost: {current_cost}")
        return building
    
    # Calculate the new maintenance cost
    new_cost = current_cost / factor
    
    # Round to the nearest integer if the original was an integer
    if isinstance(current_cost, int):
        new_cost = round(new_cost)
    
    # Create a copy of the building data with the updated maintenance cost
    updated_building = building.copy()
    updated_building['maintenanceCost'] = new_cost
    
    # Add adjustment metadata
    if '_adjustments' not in updated_building:
        updated_building['_adjustments'] = {}
    
    updated_building['_adjustments']['maintenanceCost'] = {
        'original': current_cost,
        'factor': factor,
        'adjusted': new_cost,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    
    return updated_building

def save_building_file(building: Dict[str, Any]) -> bool:
    """Save the building data back to its file."""
    file_path = building.get('_file_path')
    if not file_path:
        log.error(f"Cannot save building {building.get('name', 'unknown')}: No file path")
        return False
    
    try:
        # Create a clean copy without the metadata fields we added
        clean_building = building.copy()
        for key in ['_file_path', '_relative_path', '_file_name', '_category_dir', '_subCategory_dir', '_adjustments']:
            if key in clean_building:
                del clean_building[key]
        
        # Write the updated building data back to the file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(clean_building, f, indent=2, ensure_ascii=False)
        
        log.info(f"Saved updated building to {file_path}")
        return True
    except Exception as e:
        log.error(f"Error saving building file {file_path}: {e}")
        return False

def log_adjustment(building: Dict[str, Any], success: bool) -> None:
    """Log the adjustment to a file."""
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            name = building.get('name', 'unknown')
            file_path = building.get('_file_path', 'unknown')
            original = building.get('_adjustments', {}).get('maintenanceCost', {}).get('original', 'unknown')
            adjusted = building.get('_adjustments', {}).get('maintenanceCost', {}).get('adjusted', 'unknown')
            factor = building.get('_adjustments', {}).get('maintenanceCost', {}).get('factor', 'unknown')
            
            log_entry = f"{time.strftime('%Y-%m-%d %H:%M:%S')} | {name} | {file_path} | {original} -> {adjusted} (÷{factor}) | {'SUCCESS' if success else 'FAILED'}\n"
            f.write(log_entry)
    except Exception as e:
        log.error(f"Error writing to log file: {e}")

def main():
    """Main function to adjust building maintenance costs."""
    parser = argparse.ArgumentParser(description="Adjust building maintenance costs by dividing by a specified factor")
    parser.add_argument("--factor", type=float, default=10.0, help="Factor to divide maintenance costs by (default: 10)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without making changes")
    parser.add_argument("--category", help="Only process buildings in this category")
    parser.add_argument("--subCategory", help="Only process buildings in this subCategory")
    parser.add_argument("--building", help="Only process a specific building by name")
    
    args = parser.parse_args()
    
    log.info(f"Starting maintenance cost adjustment script")
    log.info(f"Division factor: {args.factor}")
    log.info(f"Dry run: {args.dry_run}")
    
    # Initialize the log file
    if not args.dry_run:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"\n{'='*80}\n")
            f.write(f"MAINTENANCE COST ADJUSTMENT - {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Division factor: {args.factor}\n")
            f.write(f"{'='*80}\n\n")
    
    # Scan for building files
    buildings = scan_building_files()
    
    if not buildings:
        log.error("No building files found. Exiting.")
        return
    
    # Filter buildings based on command-line arguments
    if args.category:
        category_lower = args.category.lower()
        buildings = [b for b in buildings if 
                    b.get('category', '').lower() == category_lower or 
                    b.get('_category_dir', '').lower() == category_lower]
        log.info(f"Filtered to {len(buildings)} buildings in category '{args.category}'")
    
    if args.subCategory:
        subCategory_lower = args.subCategory.lower()
        buildings = [b for b in buildings if 
                    b.get('subCategory', '').lower() == subCategory_lower or 
                    b.get('_subCategory_dir', '').lower() == subCategory_lower]
        log.info(f"Filtered to {len(buildings)} buildings in subCategory '{args.subCategory}'")
    
    if args.building:
        building_name_lower = args.building.lower()
        buildings = [b for b in buildings if b.get('name', '').lower() == building_name_lower]
        log.info(f"Filtered to {len(buildings)} buildings with name '{args.building}'")
    
    if not buildings:
        log.error("No buildings match the specified filters. Exiting.")
        return
    
    # Confirm with citizen before proceeding
    if not args.dry_run:
        confirmation = input(f"This will adjust maintenance costs for {len(buildings)} buildings by dividing by {args.factor}. Continue? (y/n): ")
        if confirmation.lower() != 'y':
            log.info("Operation cancelled by citizen.")
            return
    
    # Process buildings
    adjusted_count = 0
    success_count = 0
    
    for i, building in enumerate(buildings):
        name = building.get('name', f"Building {i+1}")
        log.info(f"Processing building {i+1}/{len(buildings)}: {name}")
        
        # Adjust the maintenance cost
        updated_building = adjust_maintenance_cost(building, args.factor)
        
        # Check if anything changed
        if updated_building.get('maintenanceCost') != building.get('maintenanceCost'):
            adjusted_count += 1
            
            # Log the change
            original = building.get('maintenanceCost')
            adjusted = updated_building.get('maintenanceCost')
            log.info(f"Adjusted maintenance cost for {name}: {original} -> {adjusted}")
            
            # Save the updated building file if not a dry run
            if not args.dry_run:
                success = save_building_file(updated_building)
                if success:
                    success_count += 1
                
                # Log the adjustment
                log_adjustment(updated_building, success)
        else:
            log.info(f"No change needed for {name}")
    
    # Print summary
    log.info(f"Summary:")
    log.info(f"Processed {len(buildings)} buildings")
    log.info(f"Adjusted {adjusted_count} buildings")
    if not args.dry_run:
        log.info(f"Successfully saved {success_count} buildings")
    else:
        log.info("This was a dry run. No changes were made.")
    
    # Add summary to log file
    if not args.dry_run:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"\nSUMMARY:\n")
            f.write(f"Processed: {len(buildings)} buildings\n")
            f.write(f"Adjusted: {adjusted_count} buildings\n")
            f.write(f"Successfully saved: {success_count} buildings\n")
            f.write(f"{'='*80}\n\n")

if __name__ == "__main__":
    main()
