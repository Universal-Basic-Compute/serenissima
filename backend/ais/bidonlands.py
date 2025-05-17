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
        "users": Table(airtable_api_key, airtable_base_id, "USERS"),
        "lands": Table(airtable_api_key, airtable_base_id, "LANDS"),
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

def get_existing_bids(tables, ai_user_id: str) -> Dict[str, Dict]:
    """Get existing bids from an AI user, indexed by land_id."""
    try:
        # Query transactions where the buyer is the AI user and type is 'land'
        formula = f"AND({{Buyer}}='{ai_user_id}', {{Type}}='land', {{ExecutedAt}}=BLANK())"
        transactions = tables["transactions"].all(formula=formula)
        
        # Index by asset_id (land_id)
        bids_by_land = {}
        for transaction in transactions:
            asset_id = transaction["fields"].get("AssetId")
            if asset_id:
                bids_by_land[asset_id] = transaction
        
        print(f"Found {len(bids_by_land)} existing bids for AI user {ai_user_id}")
        return bids_by_land
    except Exception as e:
        print(f"Error getting existing bids: {str(e)}")
        return {}

def create_or_update_bid(tables, ai_user: Dict, land: Dict, existing_bid: Optional[Dict] = None) -> bool:
    """Create a new bid or update an existing one."""
    try:
        land_id = land["fields"].get("LandId")
        last_income = land["fields"].get("LastIncome", 0)
        
        if not land_id or not last_income:
            print(f"Land missing required fields: {land}")
            return False
        
        # Calculate bid amount (30x the last income)
        bid_amount = last_income * 30
        
        # Get AI user's compute balance
        ai_username = ai_user["fields"].get("Username")
        ai_compute = ai_user["fields"].get("Ducats", 0)
        
        # Check if AI has enough compute (2x the bid amount)
        if ai_compute < bid_amount * 2:
            print(f"AI {ai_username} doesn't have enough compute for bid on {land_id}. Needs {bid_amount * 2}, has {ai_compute}")
            return False
        
        # Get current land owner
        land_owner = land["fields"].get("User")
        
        if existing_bid:
            # Increase existing bid by 14% if AI has enough compute
            current_bid = existing_bid["fields"].get("Price", 0)
            new_bid = current_bid * 1.2
            
            if ai_compute < new_bid * 2:
                print(f"AI {ai_username} doesn't have enough compute to increase bid on {land_id}. Needs {new_bid * 2}, has {ai_compute}")
                return False
            
            # Update the transaction with the new bid
            now = datetime.now().isoformat()
            tables["transactions"].update(existing_bid["id"], {
                "Price": new_bid,
                "UpdatedAt": now
            })
            
            print(f"Updated bid for {land_id} from {current_bid} to {new_bid} by AI {ai_username}")
            
            # Send notification to land owner about the updated bid
            if land_owner:
                try:
                    notification_content = f"AI {ai_username} has increased their bid on your land {land_id} from {current_bid} to {new_bid} compute."
                    tables["notifications"].create({
                        "User": land_owner,
                        "Type": "bid_update",
                        "Content": notification_content,
                        "CreatedAt": now,
                        "ReadAt": None,
                        "Details": json.dumps({
                            "land_id": land_id,
                            "bidder": ai_username,
                            "previous_bid": current_bid,
                            "new_bid": new_bid,
                            "timestamp": now
                        })
                    })
                    print(f"Sent bid update notification to land owner {land_owner}")
                except Exception as e:
                    print(f"Error sending notification to land owner: {str(e)}")
            
            return True
        else:
            # Create a new bid
            now = datetime.now().isoformat()
            
            # Create transaction record
            transaction = {
                "Type": "land",
                "AssetId": land_id,
                "Seller": land_owner if land_owner else "Republic",
                "Buyer": ai_username,
                "Price": bid_amount,
                "CreatedAt": now,
                "UpdatedAt": now
            }
            
            tables["transactions"].create(transaction)
            print(f"Created new bid for {land_id} at {bid_amount} by AI {ai_username}")
            
            # Send notification to land owner about the new bid
            if land_owner:
                try:
                    notification_content = f"AI {ai_username} has placed a bid of {bid_amount} compute on your land {land_id}."
                    tables["notifications"].create({
                        "User": land_owner,
                        "Type": "new_bid",
                        "Content": notification_content,
                        "CreatedAt": now,
                        "ReadAt": None,
                        "Details": json.dumps({
                            "land_id": land_id,
                            "bidder": ai_username,
                            "bid_amount": bid_amount,
                            "timestamp": now
                        })
                    })
                    print(f"Sent new bid notification to land owner {land_owner}")
                except Exception as e:
                    print(f"Error sending notification to land owner: {str(e)}")
            
            return True
    except Exception as e:
        print(f"Error creating/updating bid: {str(e)}")
        return False

def create_admin_notification(tables, ai_bid_counts: Dict[str, int]) -> None:
    """Create a notification for admins with the bidding summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Land Bidding Summary:\n\n"
        
        for ai_name, bid_count in ai_bid_counts.items():
            message += f"- {ai_name}: {bid_count} bids\n"
        
        # Create the notification
        notification = {
            "User": "admin",
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
    print(f"Starting AI land bidding process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI users
    ai_users = get_ai_users(tables)
    if not ai_users:
        print("No AI users found, exiting")
        return
    
    # Get lands with income
    lands = get_lands_with_income(tables)
    if not lands:
        print("No lands with income found, exiting")
        return
    
    # Track bid counts for each AI
    ai_bid_counts = {}
    
    # Process each AI user
    for ai_user in ai_users:
        ai_username = ai_user["fields"].get("Username")
        if not ai_username:
            continue
        
        print(f"Processing AI user: {ai_username}")
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
            
            # Create or update bid
            if not dry_run:
                success = create_or_update_bid(tables, ai_user, land, existing_bid)
                if success:
                    ai_bid_counts[ai_username] += 1
            else:
                # In dry run mode, just log what would happen
                if existing_bid:
                    print(f"[DRY RUN] Would update bid for {land_id} by AI {ai_username}")
                else:
                    print(f"[DRY RUN] Would create new bid for {land_id} by AI {ai_username}")
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
