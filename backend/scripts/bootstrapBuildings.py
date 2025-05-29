#!/usr/bin/env python3
"""
Script to bootstrap Venice's economy by placing ~50 buildings at random building points.
All buildings will be owned by ConsiglioDeiDieci.

Usage:
    python bootstrapBuildings.py [--dry-run] [--public] [--bridges] [--docks] [--wells]

Options:
    --dry-run    Show what would be created without actually creating buildings
    --public     Create only public infrastructure (bridges, docks, cisterns)
    --bridges    Create only bridges
    --docks      Create only docks
    --wells      Create only public wells/cisterns
"""

import os
import sys
import json
import random
import uuid
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional
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
        "polygons": Table(airtable_api_key, airtable_base_id, "POLYGONS")
    }
    
    return tables

def get_polygons_data():
    """Get polygon data from the data directory."""
    try:
        # Get all JSON files in the data directory
        data_dir = os.path.join(os.getcwd(), 'data')
        polygons = []
        
        # Check if the directory exists
        if not os.path.exists(data_dir):
            print(f"Error: Data directory not found at {data_dir}")
            return []
        
        # Walk through all files in the data directory
        for root, dirs, files in os.walk(data_dir):
            for file in files:
                if file.endswith('.json') and not file.startswith('index'):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            polygon_data = json.load(f)
                            if isinstance(polygon_data, dict) and 'id' in polygon_data:
                                polygons.append(polygon_data)
                    except Exception as e:
                        print(f"Error reading file {file_path}: {str(e)}")
        
        print(f"Loaded {len(polygons)} polygons from data directory")
        return polygons
    except Exception as e:
        print(f"Error getting polygon data: {str(e)}")
        return []

def get_building_points_by_type(polygons: List[Dict]) -> Dict[str, List[Dict]]:
    """Extract building points from polygons, categorized by point type."""
    building_points = {
        "null": [],  # Regular building points (null pointType)
        "canal": [],  # Canal points
        "bridge": []  # Bridge points
    }
    
    for polygon in polygons:
        polygon_id = polygon.get('id', 'unknown')
        
        # Process regular building points
        if 'buildingPoints' in polygon and isinstance(polygon['buildingPoints'], list):
            for point in polygon['buildingPoints']:
                if isinstance(point, dict) and 'lat' in point and 'lng' in point:
                    point_with_metadata = {
                        'lat': point['lat'],
                        'lng': point['lng'],
                        'polygon_id': polygon_id,
                        'point_type': 'null',
                        'id': point.get('id', f"point-{point['lat']}-{point['lng']}")
                    }
                    building_points['null'].append(point_with_metadata)
        
        # Process canal points
        if 'canalPoints' in polygon and isinstance(polygon['canalPoints'], list):
            for point in polygon['canalPoints']:
                if isinstance(point, dict) and 'edge' in point:
                    edge = point['edge']
                    if isinstance(edge, dict) and 'lat' in edge and 'lng' in edge:
                        point_with_metadata = {
                            'lat': edge['lat'],
                            'lng': edge['lng'],
                            'polygon_id': polygon_id,
                            'point_type': 'canal',
                            'id': point.get('id', f"canal-{edge['lat']}-{edge['lng']}")
                        }
                        building_points['canal'].append(point_with_metadata)
        
        # Process bridge points
        if 'bridgePoints' in polygon and isinstance(polygon['bridgePoints'], list):
            for point in polygon['bridgePoints']:
                if isinstance(point, dict) and 'edge' in point:
                    edge = point['edge']
                    if isinstance(edge, dict) and 'lat' in edge and 'lng' in edge:
                        point_with_metadata = {
                            'lat': edge['lat'],
                            'lng': edge['lng'],
                            'polygon_id': polygon_id,
                            'point_type': 'bridge',
                            'id': point.get('id', f"bridge-{edge['lat']}-{edge['lng']}")
                        }
                        building_points['bridge'].append(point_with_metadata)
    
    # Print summary
    total_points = sum(len(points) for points in building_points.values())
    print(f"Found {total_points} total building points:")
    print(f"  - Regular building points: {len(building_points['null'])}")
    print(f"  - Canal points: {len(building_points['canal'])}")
    print(f"  - Bridge points: {len(building_points['bridge'])}")
    
    return building_points

def get_existing_buildings(tables):
    """Get existing buildings from Airtable."""
    try:
        buildings = tables["buildings"].all()
        print(f"Found {len(buildings)} existing buildings in Airtable")
        
        # Extract positions for checking
        existing_positions = []
        for building in buildings:
            position = building["fields"].get("Position")
            if position:
                try:
                    if isinstance(position, str):
                        position = json.loads(position)
                    if isinstance(position, dict) and "lat" in position and "lng" in position:
                        existing_positions.append({
                            "lat": position["lat"],
                            "lng": position["lng"]
                        })
                except:
                    pass
        
        print(f"Extracted {len(existing_positions)} existing building positions")
        return existing_positions
    except Exception as e:
        print(f"Error getting existing buildings: {str(e)}")
        return []

def filter_available_points(building_points: Dict[str, List[Dict]], existing_positions: List[Dict]) -> Dict[str, List[Dict]]:
    """Filter out building points that already have buildings on them."""
    available_points = {
        "null": [],
        "canal": [],
        "bridge": []
    }
    
    for point_type, points in building_points.items():
        for point in points:
            # Check if this point is already occupied
            is_occupied = any(
                abs(pos["lat"] - point["lat"]) < 0.0001 and 
                abs(pos["lng"] - point["lng"]) < 0.0001 
                for pos in existing_positions
            )
            
            if not is_occupied:
                available_points[point_type].append(point)
    
    # Print summary
    total_available = sum(len(points) for points in available_points.values())
    print(f"Found {total_available} available building points after filtering:")
    print(f"  - Regular building points: {len(available_points['null'])}")
    print(f"  - Canal points: {len(available_points['canal'])}")
    print(f"  - Bridge points: {len(available_points['bridge'])}")
    
    return available_points

def get_building_types():
    """Get building types from the API or use a hardcoded list."""
    try:
        # Try to get building types from the API
        import requests
        
        api_url = os.getenv("API_URL", "http://localhost:3000")
        response = requests.get(f"{api_url}/api/building-types")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and "buildingTypes" in data:
                building_types = data["buildingTypes"]
                print(f"Successfully loaded {len(building_types)} building types from API")
                return building_types
    except Exception as e:
        print(f"Error getting building types from API: {str(e)}")
    
    # Fallback to hardcoded list
    print("Using hardcoded building types list")
    return [
        {"type": "bakery", "pointType": None},
        {"type": "contract_stall", "pointType": None},
        {"type": "fisherman_s_cottage", "pointType": "canal"},
        {"type": "artisan_s_house", "pointType": None},
        {"type": "merchant_s_house", "pointType": None},
        {"type": "canal_house", "pointType": "canal"},
        {"type": "public_dock", "pointType": "canal"},
        {"type": "gondola_station", "pointType": "canal"},
        {"type": "bridge", "pointType": "bridge"},
        {"type": "public_well", "pointType": None},
        {"type": "small_warehouse", "pointType": None},
        {"type": "blacksmith", "pointType": None},
        {"type": "bottega", "pointType": None},
        {"type": "apothecary", "pointType": None},
        {"type": "boat_workshop", "pointType": "canal"},
        {"type": "guard_post", "pointType": None},
        {"type": "chapel", "pointType": None},
        {"type": "public_bath", "pointType": None},
        {"type": "glassblower_workshop", "pointType": None},
        {"type": "merceria", "pointType": None},
        {"type": "parish_church", "pointType": None},
        {"type": "town_hall", "pointType": None},
        {"type": "cargo_landing", "pointType": "canal"}
    ]

def get_bootstrap_buildings():
    """Define the buildings to bootstrap Venice with."""
    return [
        {"type": "bakery", "pointType": None, "count": 3},
        {"type": "contract_stall", "pointType": None, "count": 5},
        {"type": "fisherman_s_cottage", "pointType": "canal", "count": 4},
        {"type": "artisan_s_house", "pointType": None, "count": 4},
        {"type": "merchant_s_house", "pointType": None, "count": 3},
        {"type": "canal_house", "pointType": "canal", "count": 3},
        {"type": "public_dock", "pointType": "canal", "count": 4},
        {"type": "gondola_station", "pointType": "canal", "count": 2},
        {"type": "bridge", "pointType": "bridge", "count": 3},
        {"type": "public_well", "pointType": None, "count": 3},
        {"type": "small_warehouse", "pointType": None, "count": 2},
        {"type": "blacksmith", "pointType": None, "count": 2},
        {"type": "bottega", "pointType": None, "count": 3},
        {"type": "apothecary", "pointType": None, "count": 1},
        {"type": "boat_workshop", "pointType": "canal", "count": 1},
        {"type": "guard_post", "pointType": None, "count": 2},
        {"type": "chapel", "pointType": None, "count": 2},
        {"type": "public_bath", "pointType": None, "count": 1},
        {"type": "glassblower_workshop", "pointType": None, "count": 1},
        {"type": "merceria", "pointType": None, "count": 1},
        {"type": "parish_church", "pointType": None, "count": 1},
        {"type": "town_hall", "pointType": None, "count": 1},
        {"type": "cargo_landing", "pointType": "canal", "count": 1}
    ]

def create_building(tables, building_type: str, point: Dict, owner: str, dry_run: bool = False) -> Optional[Dict]:
    """Create a building at the specified point."""
    try:
        # Generate a unique building ID
        building_id = f"building-{uuid.uuid4()}"
        
        # Create the building record
        building_record = {
            "BuildingId": building_id,
            "Type": building_type,
            "LandId": point["polygon_id"],
            "LeasePrice": 0,
            "Variant": "model",
            "Owner": owner,
            "Point": point["id"],
            "RentPrice": 0,
            "CreatedAt": datetime.now().isoformat()
        }
        
        if dry_run:
            print(f"[DRY RUN] Would create {building_type} at {point['lat']}, {point['lng']} in polygon {point['polygon_id']}")
            return building_record
        else:
            # Create the building in Airtable
            new_building = tables["buildings"].create(building_record)
            print(f"Created {building_type} with ID {building_id} at {point['lat']}, {point['lng']} in polygon {point['polygon_id']}")
            return new_building
    except Exception as e:
        print(f"Error creating building {building_type}: {str(e)}")
        return None

def bootstrap_buildings(dry_run: bool = False, public_mode: bool = False, 
                       bridges_only: bool = False, docks_only: bool = False, 
                       wells_only: bool = False):
    """Main function to bootstrap Venice with buildings."""
    print(f"Starting building bootstrap process (dry_run={dry_run}, public_mode={public_mode}, "
          f"bridges_only={bridges_only}, docks_only={docks_only}, wells_only={wells_only})")
    
    # Initialize Airtable
    tables = initialize_airtable()
    
    # Get polygon data
    polygons = get_polygons_data()
    if not polygons:
        print("No polygon data found, exiting")
        return
    
    # Get building points by type
    building_points = get_building_points_by_type(polygons)
    
    # Get existing buildings
    existing_positions = get_existing_buildings(tables)
    
    # Filter available points
    available_points = filter_available_points(building_points, existing_positions)
    
    # Check if we have enough available points
    total_available = sum(len(points) for points in available_points.values())
    if total_available == 0:
        print("No available building points found, exiting")
        return
    
    # Set the owner to ConsiglioDeiDieci
    owner = "ConsiglioDeiDieci"
    
    # Create buildings
    created_buildings = []
    failed_buildings = []
    
    if public_mode or bridges_only or docks_only or wells_only:
        # Define public infrastructure
        public_buildings = []
        
        if bridges_only:
            public_buildings.append({"type": "bridge", "pointType": "bridge", "count": 10})
            print("Bridges only mode: Creating only bridges")
        elif docks_only:
            public_buildings.append({"type": "public_dock", "pointType": "canal", "count": 10})
            print("Docks only mode: Creating only public docks")
        elif wells_only:
            public_buildings.append({"type": "public_well", "pointType": None, "count": 10})
            print("Wells only mode: Creating only public wells/cisterns")
        else:  # public_mode
            public_buildings = [
                {"type": "bridge", "pointType": "bridge", "count": 10},
                {"type": "public_dock", "pointType": "canal", "count": 10},
                {"type": "public_well", "pointType": None, "count": 10}  # Cisterns/wells
            ]
            print("Public mode: Creating all public infrastructure")
        
        for building in public_buildings:
            building_type = building["type"]
            point_type = "null" if building["pointType"] is None else building["pointType"]
            count = building["count"]
            
            print(f"Creating {count} {building_type} buildings (point type: {point_type})")
            
            # Check if we have enough points of this type
            if len(available_points[point_type]) < count:
                print(f"Warning: Not enough {point_type} points for {building_type}. Need {count}, have {len(available_points[point_type])}")
                count = len(available_points[point_type])
            
            # Create the buildings
            for i in range(count):
                if not available_points[point_type]:
                    print(f"Ran out of {point_type} points, skipping remaining {building_type} buildings")
                    break
                
                # Get a random point
                point_index = random.randint(0, len(available_points[point_type]) - 1)
                point = available_points[point_type].pop(point_index)
                
                # Create the building
                new_building = create_building(tables, building_type, point, owner, dry_run)
                
                if new_building:
                    created_buildings.append(new_building)
                else:
                    failed_buildings.append({
                        "type": building_type,
                        "point": point
                    })
    else:
        # In normal mode, use the bootstrap buildings list
        bootstrap_buildings = get_bootstrap_buildings()
        
        # Calculate total buildings to create
        total_buildings = sum(building["count"] for building in bootstrap_buildings)
        print(f"Planning to create {total_buildings} buildings")
        
        # Check if we have enough points
        null_points_needed = sum(b["count"] for b in bootstrap_buildings if b["pointType"] is None)
        canal_points_needed = sum(b["count"] for b in bootstrap_buildings if b["pointType"] == "canal")
        bridge_points_needed = sum(b["count"] for b in bootstrap_buildings if b["pointType"] == "bridge")
        
        if len(available_points["null"]) < null_points_needed:
            print(f"Warning: Not enough regular building points. Need {null_points_needed}, have {len(available_points['null'])}")
        
        if len(available_points["canal"]) < canal_points_needed:
            print(f"Warning: Not enough canal points. Need {canal_points_needed}, have {len(available_points['canal'])}")
        
        if len(available_points["bridge"]) < bridge_points_needed:
            print(f"Warning: Not enough bridge points. Need {bridge_points_needed}, have {len(available_points['bridge'])}")
        
        # Create buildings
        for building in bootstrap_buildings:
            building_type = building["type"]
            point_type = "null" if building["pointType"] is None else building["pointType"]
            count = building["count"]
            
            print(f"Creating {count} {building_type} buildings (point type: {point_type})")
            
            # Check if we have enough points of this type
            if len(available_points[point_type]) < count:
                print(f"Warning: Not enough {point_type} points for {building_type}. Need {count}, have {len(available_points[point_type])}")
                count = len(available_points[point_type])
            
            # Create the buildings
            for i in range(count):
                if not available_points[point_type]:
                    print(f"Ran out of {point_type} points, skipping remaining {building_type} buildings")
                    break
                
                # Get a random point
                point_index = random.randint(0, len(available_points[point_type]) - 1)
                point = available_points[point_type].pop(point_index)
                
                # Create the building
                new_building = create_building(tables, building_type, point, owner, dry_run)
                
                if new_building:
                    created_buildings.append(new_building)
                else:
                    failed_buildings.append({
                        "type": building_type,
                        "point": point
                    })
    
    # Print summary
    print("\nBootstrap Summary:")
    print(f"Created {len(created_buildings)} buildings")
    print(f"Failed to create {len(failed_buildings)} buildings")
    
    if not dry_run:
        print("\nBuildings created:")
        building_counts = {}
        for building in created_buildings:
            building_type = building["fields"]["Type"] if isinstance(building, dict) and "fields" in building else building["Type"]
            building_counts[building_type] = building_counts.get(building_type, 0) + 1
        
        for building_type, count in building_counts.items():
            print(f"  - {building_type}: {count}")
    else:
        print("\n[DRY RUN] Buildings that would be created:")
        building_counts = {}
        for building in created_buildings:
            building_type = building["Type"]
            building_counts[building_type] = building_counts.get(building_type, 0) + 1
        
        for building_type, count in building_counts.items():
            print(f"  - {building_type}: {count}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap Venice with buildings")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without actually creating buildings")
    parser.add_argument("--public", action="store_true", help="Create only public infrastructure (bridges, docks, cisterns)")
    parser.add_argument("--bridges", action="store_true", help="Create only bridges")
    parser.add_argument("--docks", action="store_true", help="Create only docks")
    parser.add_argument("--wells", action="store_true", help="Create only public wells/cisterns")
    
    args = parser.parse_args()
    
    # Check for conflicting options
    if sum([args.public, args.bridges, args.docks, args.wells]) > 1:
        print("Error: Please specify only one of --public, --bridges, --docks, or --wells")
        sys.exit(1)
    
    bootstrap_buildings(args.dry_run, args.public, args.bridges, args.docks, args.wells)
