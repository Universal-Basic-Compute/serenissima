import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import user_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.user_utils import find_user_by_identifier

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
        "users": Table(airtable_api_key, airtable_base_id, "Users"),
        "lands": Table(airtable_api_key, airtable_base_id, "LANDS"),
        "buildings": Table(airtable_api_key, airtable_base_id, "BUILDINGS"),
        "transactions": Table(airtable_api_key, airtable_base_id, "TRANSACTIONS"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_users(tables) -> List[Dict]:
    """Get all users that are marked as AI."""
    try:
        # Query users with IsAI field set to true
        formula = "{IsAI}=1"
        ai_users = tables["users"].all(formula=formula)
        print(f"Found {len(ai_users)} AI users")
        return ai_users
    except Exception as e:
        print(f"Error getting AI users: {str(e)}")
        return []

def get_ai_owned_lands(tables, ai_username: str) -> List[Dict]:
    """Get all lands owned by a specific AI user."""
    try:
        # Query lands owned by the AI user
        formula = f"{{User}}='{ai_username}'"
        lands = tables["lands"].all(formula=formula)
        print(f"Found {len(lands)} lands owned by AI user {ai_username}")
        return lands
    except Exception as e:
        print(f"Error getting AI owned lands: {str(e)}")
        return []

def get_existing_buildings_on_land(tables, land_id: str) -> List[Dict]:
    """Get all buildings on a specific land."""
    try:
        # Query buildings on the land
        formula = f"{{Land}}='{land_id}'"
        buildings = tables["buildings"].all(formula=formula)
        print(f"Found {len(buildings)} existing buildings on land {land_id}")
        return buildings
    except Exception as e:
        print(f"Error getting existing buildings on land: {str(e)}")
        return []

def get_building_types(tables) -> List[Dict]:
    """Get all available building types."""
    try:
        # Query all building types
        formula = "{Type}='building_type'"
        building_types = tables["buildings"].all(formula=formula)
        print(f"Found {len(building_types)} building types")
        return building_types
    except Exception as e:
        print(f"Error getting building types: {str(e)}")
        return []

def can_afford_building(ai_user: Dict, building_type: Dict) -> bool:
    """Check if AI user can afford to build this building type."""
    ai_compute = ai_user["fields"].get("Ducats", 0)
    building_cost = building_type["fields"].get("BuildCost", 0)
    
    # AI should have at least 2x the building cost to ensure they have funds for other activities
    return ai_compute >= building_cost * 2

def should_build_on_land(land: Dict, existing_buildings: List[Dict], building_types: List[Dict]) -> Optional[Dict]:
    """Determine if AI should build on this land and which building type to build."""
    # Get land details
    land_id = land["fields"].get("LandId")
    land_points = land["fields"].get("BuildingPoints", 0)
    land_income = land["fields"].get("LastIncome", 0)
    
    # If land has no income or building points, don't build
    if not land_income or not land_points:
        print(f"Land {land_id} has no income or building points, skipping")
        return None
    
    # Calculate used building points
    used_points = sum(building.get("fields", {}).get("BuildingPoints", 0) for building in existing_buildings)
    
    # If land is fully developed, don't build
    if used_points >= land_points:
        print(f"Land {land_id} is fully developed ({used_points}/{land_points} points used), skipping")
        return None
    
    # Calculate remaining points
    remaining_points = land_points - used_points
    
    # Find building types that fit within remaining points
    suitable_types = [bt for bt in building_types if bt["fields"].get("BuildingPoints", 0) <= remaining_points]
    
    if not suitable_types:
        print(f"No suitable building types found for land {land_id} with {remaining_points} points remaining")
        return None
    
    # Prioritize buildings with higher income potential
    suitable_types.sort(key=lambda bt: bt["fields"].get("IncomeAmount", 0), reverse=True)
    
    # Return the best building type
    return suitable_types[0]

def create_building(tables, ai_user: Dict, land: Dict, building_type: Dict) -> bool:
    """Create a new building on the land."""
    try:
        ai_username = ai_user["fields"].get("Username")
        land_id = land["fields"].get("LandId")
        building_type_name = building_type["fields"].get("Name")
        building_cost = building_type["fields"].get("BuildCost", 0)
        
        # Check if AI has enough compute
        ai_compute = ai_user["fields"].get("Ducats", 0)
        if ai_compute < building_cost:
            print(f"AI {ai_username} doesn't have enough compute to build {building_type_name} on {land_id}. Needs {building_cost}, has {ai_compute}")
            return False
        
        # Create the building
        now = datetime.now().isoformat()
        
        building_data = {
            "Name": f"{building_type_name} on {land_id}",
            "Type": building_type["fields"].get("BuildingType"),
            "Land": land_id,
            "User": ai_username,
            "BuildingPoints": building_type["fields"].get("BuildingPoints", 0),
            "IncomeAmount": building_type["fields"].get("IncomeAmount", 0),
            "RentAmount": building_type["fields"].get("RentAmount", 0),
            "LeaseAmount": building_type["fields"].get("LeaseAmount", 0),
            "CreatedAt": now,
            "UpdatedAt": now
        }
        
        # Create the building record
        building_record = tables["buildings"].create(building_data)
        print(f"Created new building {building_type_name} on land {land_id} for AI {ai_username}")
        
        # Deduct the cost from AI's compute balance
        new_compute = ai_compute - building_cost
        tables["users"].update(ai_user["id"], {
            "Ducats": new_compute
        })
        print(f"Updated AI {ai_username} compute balance from {ai_compute} to {new_compute}")
        
        # Create a transaction record
        transaction_data = {
            "Type": "building",
            "AssetId": building_record["id"],
            "Seller": "Republic",
            "Buyer": ai_username,
            "Price": building_cost,
            "CreatedAt": now,
            "UpdatedAt": now,
            "ExecutedAt": now
        }
        
        tables["transactions"].create(transaction_data)
        print(f"Created transaction record for building purchase by AI {ai_username}")
        
        # Create notification for land owner if different from AI
        land_owner = land["fields"].get("User")
        if land_owner and land_owner != ai_username:
            notification_content = f"AI {ai_username} has constructed a {building_type_name} on your land {land_id}."
            tables["notifications"].create({
                "User": land_owner,
                "Type": "new_building",
                "Content": notification_content,
                "CreatedAt": now,
                "ReadAt": None,
                "Details": json.dumps({
                    "land_id": land_id,
                    "builder": ai_username,
                    "building_type": building_type_name,
                    "timestamp": now
                })
            })
            print(f"Sent new building notification to land owner {land_owner}")
        
        return True
    except Exception as e:
        print(f"Error creating building: {str(e)}")
        return False

def create_admin_notification(tables, ai_building_counts: Dict[str, int]) -> None:
    """Create a notification for admins with the building summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Building Construction Summary:\n\n"
        
        for ai_name, building_count in ai_building_counts.items():
            message += f"- {ai_name}: {building_count} buildings constructed\n"
        
        # Create the notification
        notification = {
            "User": "admin",
            "Type": "ai_building",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "ai_building_counts": ai_building_counts,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with building summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_building_construction(dry_run: bool = False):
    """Main function to process AI building construction on lands."""
    print(f"Starting AI building construction process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Get building types
    building_types = get_building_types(tables)
    if not building_types:
        print("No building types found, exiting")
        return
    
    # Track building counts for each AI
    ai_building_counts = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
        ai_building_counts[ai_username] = 0
        
        # Get lands owned by this AI
        ai_lands = get_ai_owned_lands(tables, ai_username)
        
        # Process each land
        for land in ai_lands:
            land_id = land["fields"].get("LandId")
            if not land_id:
                continue
            
            # Get existing buildings on this land
            existing_buildings = get_existing_buildings_on_land(tables, land_id)
            
            # Determine if AI should build on this land
            building_type = should_build_on_land(land, existing_buildings, building_types)
            
            if building_type and can_afford_building(ai_user, building_type):
                # Create the building
                if not dry_run:
                    success = create_building(tables, ai_user, land, building_type)
                    if success:
                        ai_building_counts[ai_username] += 1
                else:
                    # In dry run mode, just log what would happen
                    print(f"[DRY RUN] Would build {building_type['fields'].get('Name')} on land {land_id} by AI {ai_username}")
                    ai_building_counts[ai_username] += 1
    
    # Create admin notification with summary
    if not dry_run and sum(ai_building_counts.values()) > 0:
        create_admin_notification(tables, ai_building_counts)
    else:
        print(f"[DRY RUN] Would create admin notification with building counts: {ai_building_counts}")
    
    print("AI building construction process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_building_construction(dry_run)
