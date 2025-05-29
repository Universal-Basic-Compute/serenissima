import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple
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

def create_or_update_bid(tables, ai_citizen: Dict, land: Dict, existing_bid: Optional[Dict] = None) -> bool:
    """Create a new bid or update an existing one."""
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
        land_owner = land["fields"].get("Owner")
        
        if existing_bid:
            # Increase existing bid by 14% if AI has enough compute
            current_bid = existing_bid["fields"].get("Price", 0)
            new_bid = current_bid * 1.2
            
            if ai_compute < new_bid * 2:
                print(f"AI {ai_username} doesn't have enough compute to increase bid on {land_id}. Needs {new_bid * 2}, has {ai_compute}")
                return False
            
            # Update the contract with the new bid price
            now = datetime.now().isoformat()
            tables["contracts"].update(existing_bid["id"], {
                "PricePerResource": new_bid,
                "UpdatedAt": now
            })
            
            print(f"Updated land_sale_offer contract for {land_id} from {current_bid} to {new_bid} by AI {ai_username}")
            
            # Send notification to land owner about the updated bid
            if land_owner:
                try:
                    notification_content = f"AI {ai_username} has increased their bid on your land {land_id} from {current_bid} to {new_bid} compute."
                    tables["notifications"].create({
                        "Citizen": land_owner,
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
            
            # Create a new land_sale_offer contract
            contract_data = {
                "Type": "land_sale_offer",
                "ResourceType": land_id,
                "Buyer": ai_username, # AI is offering to buy
                "Seller": land_owner if land_owner else "Republic", # Current land owner or Republic
                "PricePerResource": bid_amount,
                "Amount": 1,
                "Status": "pending", # This offer needs to be accepted by the seller
                "CreatedAt": now,
                "UpdatedAt": now,
                "Notes": json.dumps({"bidder_ai": ai_username, "land_owner_at_bid_time": land_owner})
            }
            
            tables["contracts"].create(contract_data)
            print(f"Created new land_sale_offer contract for {land_id} at {bid_amount} by AI {ai_username} to {land_owner if land_owner else 'Republic'}")
            
            # Send notification to land owner about the new bid
            if land_owner:
                try:
                    notification_content = f"AI {ai_username} has placed a bid of {bid_amount} compute on your land {land_id}."
                    tables["notifications"].create({
                        "Citizen": land_owner,
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
    print(f"Starting AI land bidding process (dry_run={dry_run})")
    
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
            
            # Create or update bid
            if not dry_run:
                success = create_or_update_bid(tables, ai_citizen, land, existing_bid)
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
