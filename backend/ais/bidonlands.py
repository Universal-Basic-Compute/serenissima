import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any # Added Any
import requests # Added requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import citizen_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# --- Configuration ---
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
# LogColors and log_header are imported from activity_helpers, so local definition is removed.
from backend.engine.utils.activity_helpers import LogColors, log_header 

def initialize_airtable():
    """Initialize connection to Airtable."""
    load_dotenv()
    
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")
    
    if not airtable_api_key or not airtable_base_id:
        print("Error: Airtable credentials not found in environment variables")
        sys.exit(1)
    
    api = Api(airtable_api_key)
    
    AIRTABLE_CONTRACTS_TABLE_NAME = os.getenv("AIRTABLE_CONTRACTS_TABLE", "CONTRACTS")
    tables = {
        "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
        "lands": Table(airtable_api_key, airtable_base_id, "LANDS"),
        "contracts": Table(airtable_api_key, airtable_base_id, AIRTABLE_CONTRACTS_TABLE_NAME),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice, and have appropriate social class."""
    try:
        # Query citizens with IsAI=true, InVenice=true, and SocialClass is either Nobili or Cittadini
        formula = "AND({IsAI}=1, {InVenice}=1, OR({SocialClass}='Nobili', {SocialClass}='Cittadini'))"
        ai_citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(ai_citizens)} AI citizens in Venice with Nobili or Cittadini social class")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
        return []

def get_lands_with_income(tables) -> List[Dict]:
    """Get all lands that have LastIncome > 0."""
    try:
        # Query lands with LastIncome greater than 0
        formula = "{LastIncome}>0"
        lands = tables["lands"].all(formula=formula)
        print(f"Found {len(lands)} lands with income")
        return lands
    except Exception as e:
        print(f"Error getting lands with income: {str(e)}")
        return []

def get_existing_bids(tables, ai_username: str) -> Dict[str, Dict]:
    """Get existing bids (land_sale_offer contracts) from an AI citizen, indexed by land_id."""
    try:
        # Query contracts where the buyer is the AI citizen, type is 'land_sale_offer', and status is 'pending'
        formula = f"AND({{Buyer}}='{ai_username}', {{Type}}='land_sale_offer', {{Status}}='pending')"
        contracts = tables["contracts"].all(formula=formula)
        
        # Index by ResourceType (land_id)
        bids_by_land = {}
        for contract in contracts:
            resource_type = contract["fields"].get("ResourceType")
            if resource_type:
                bids_by_land[resource_type] = contract
        
        print(f"Found {len(bids_by_land)} existing land_sale_offer contracts for AI citizen {ai_username}")
        return bids_by_land
    except Exception as e:
        print(f"Error getting existing bids: {str(e)}")
        return {}

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    if dry_run:
        print(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return True

    api_url = f"{API_BASE_URL}/api/activities/try-create"
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
            print(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{LogColors.ENDC}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 print(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            print(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"{LogColors.FAIL}API request failed for activity '{activity_type}' for {citizen_username}: {e}{LogColors.ENDC}")
        return False
    except json.JSONDecodeError:
        print(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return False

def create_or_update_bid(tables, ai_citizen: Dict, land: Dict, existing_bid: Optional[Dict] = None, dry_run: bool = False) -> bool:
    """Initiates a bid_on_land activity."""
    try:
        land_id = land["fields"].get("LandId")
        last_income = land["fields"].get("LastIncome", 0)
        
        if not land_id or not last_income:
            print(f"Land missing required fields: {land}")
            return False
        
        # Calculate bid amount (30x the last income)
        bid_amount = last_income * 30
        
        # Get AI citizen's compute balance
        ai_username = ai_citizen["fields"].get("Username")
        ai_compute = ai_citizen["fields"].get("Ducats", 0)
        
        # Check if AI has enough compute (2x the bid amount)
        if ai_compute < bid_amount * 2:
            print(f"AI {ai_username} doesn't have enough compute for bid on {land_id}. Needs {bid_amount * 2}, has {ai_compute}")
            return False
        
        # Get current land owner
        # land_owner = land["fields"].get("Owner") # Land owner info is for Kinos/activity, not direct use here

        final_bid_amount = 0
        if existing_bid:
            # AI wants to increase its existing bid
            current_bid_price = existing_bid["fields"].get("PricePerResource", 0) # Corrected field name
            final_bid_amount = current_bid_price * 1.2 # Increase by 20% (was 1.2 in original logic for new_bid)
            
            if ai_compute < final_bid_amount * 2: # Check affordability for the increased bid
                print(f"{LogColors.WARNING}AI {ai_username} doesn't have enough compute to increase bid on {land_id}. Needs {final_bid_amount * 2:.0f}, has {ai_compute:.0f}{LogColors.ENDC}")
                return False
            print(f"AI {ai_username} is increasing bid on {land_id} from {current_bid_price:.0f} to {final_bid_amount:.0f}.")
        else:
            # AI is placing a new bid
            final_bid_amount = bid_amount
            print(f"AI {ai_username} is placing a new bid of {final_bid_amount:.0f} on {land_id}.")

        activity_params = {
            "landId": land_id,
            "bidAmount": final_bid_amount
            # targetOfficeBuildingId is optional for the activity creator
            # The activity processor for submit_land_bid_offer should handle finding/updating existing pending bids.
        }
        
        return call_try_create_activity_api(ai_username, "bid_on_land", activity_params, dry_run)

    except Exception as e:
        print(f"{LogColors.FAIL}Error preparing bid_on_land activity for {ai_username} on {land_id}: {e}{LogColors.ENDC}")
        return False

def create_admin_notification(tables, ai_bid_counts: Dict[str, int]) -> None:
    """Create a notification for admins with the bidding summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "📊 **AI Land Bidding Summary** 📊\n\n"
        
        for ai_name, bid_count in ai_bid_counts.items():
            message += f"- 👤 **{ai_name}**: {bid_count} bids placed/updated\n"
        
        # Create the notification
        notification = {
            "Citizen": "admin",
            "Type": "ai_bidding",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,  # Changed from "IsRead": False to "ReadAt": None
            "Details": json.dumps({
                "ai_bid_counts": ai_bid_counts,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with bidding summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_land_bidding(dry_run: bool = False):
    """Main function to process AI bidding on lands."""
    log_header(f"AI Land Bidding Process (dry_run={dry_run})", LogColors.HEADER)
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Filter AI citizens to only those with sufficient ducats for bidding (minimum 2,500,000)
    filtered_ai_citizens = []
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        ducats = ai_citizen["fields"].get("Ducats", 0)
        
        if ducats >= 2500000:
            filtered_ai_citizens.append(ai_citizen)
            print(f"AI citizen {ai_username} has {ducats} ducats, including in processing")
        else:
            print(f"AI citizen {ai_username} has insufficient ducats ({ducats}) for bidding, skipping")
    
    # Replace the original list with the filtered list
    ai_citizens = filtered_ai_citizens
    print(f"Filtered down to {len(ai_citizens)} AI citizens with sufficient ducats for bidding")
    
    if not ai_citizens:
        print("No AI citizens with sufficient ducats for bidding, exiting")
        return
    
    # Get lands with income
    lands = get_lands_with_income(tables)
    if not lands:
        print("No lands with income found, exiting")
        return
    
    # Track bid counts for each AI
    ai_bid_counts = {}
    total_ai_for_bidding = len(ai_citizens)
    print(f"Processing {total_ai_for_bidding} AI citizens for land bidding.")
    
    # Process each AI citizen
    for i, ai_citizen in enumerate(ai_citizens):
        ai_username = ai_citizen["fields"].get("Username")
        if not ai_username:
            # print(f"Skipping AI citizen at index {i} due to missing Username.")
            continue
        
        # print(f"Processing AI citizen {i+1}/{total_ai_for_bidding}: {ai_username}")
        ai_bid_counts[ai_username] = 0
        
        # Get existing bids for this AI
        existing_bids = get_existing_bids(tables, ai_username)
        
        # Process each land
        for land in lands:
            land_id = land["fields"].get("LandId")
            if not land_id:
                continue
            
            # Check if AI already has a bid on this land
            existing_bid = existing_bids.get(land_id)
            
            # Create or update bid by initiating activity
            # Pass dry_run to create_or_update_bid
            success = create_or_update_bid(tables, ai_citizen, land, existing_bid, dry_run)
            if success: # This now means activity was successfully initiated (or simulated in dry_run)
                ai_bid_counts[ai_username] += 1
            # Logging of what would happen in dry_run is now inside call_try_create_activity_api
            # and the dry_run path of create_or_update_bid.
            # else:
                # In dry run mode, just log what would happen
                # if existing_bid:
                #     print(f"[DRY RUN] Would update bid for {land_id} by AI {ai_username}")
                # else:
                #     print(f"[DRY RUN] Would create new bid for {land_id} by AI {ai_username}")
                ai_bid_counts[ai_username] += 1
    
    # Create admin notification with summary
    if not dry_run and sum(ai_bid_counts.values()) > 0:
        create_admin_notification(tables, ai_bid_counts)
    else:
        print(f"[DRY RUN] Would create admin notification with bid counts: {ai_bid_counts}")
    
    print("AI land bidding process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_land_bidding(dry_run)
