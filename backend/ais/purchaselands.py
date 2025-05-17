import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv
from pyairtable import Api, Table

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
        "transactions": Table(airtable_api_key, airtable_base_id, "TRANSACTIONS"),
        "lands": Table(airtable_api_key, airtable_base_id, "LANDS"),
        "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS")
    }
    
    return tables

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, excluding ConsiglioDeiDieci, ordered by Ducats DESC."""
    try:
        # Query citizens with IsAI=true and Username is not ConsiglioDeiDieci
        formula = "AND({IsAI}=1, {Username}!='ConsiglioDeiDieci')"
        ai_citizens = tables["citizens"].all(formula=formula)
        
        # Sort by Ducats in descending order
        ai_citizens.sort(key=lambda x: x["fields"].get("Ducats", 0), reverse=True)
        
        print(f"Found {len(ai_citizens)} AI citizens (excluding ConsiglioDeiDieci)")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
        return []

def get_available_land_transactions(tables) -> List[Dict]:
    """Get all land transactions where Buyer is null."""
    try:
        # Query transactions with Type=land and Buyer is null
        formula = "AND({Type}='land', {Buyer}='')"
        transactions = tables["transactions"].all(formula=formula)
        
        # Sort by Price in descending order
        transactions.sort(key=lambda x: x["fields"].get("Price", 0), reverse=True)
        
        print(f"Found {len(transactions)} available land transactions")
        return transactions
    except Exception as e:
        print(f"Error getting available land transactions: {str(e)}")
        return []

def update_transaction_with_buyer(tables, transaction_id: str, buyer: str) -> bool:
    """Update a transaction with a buyer."""
    try:
        now = datetime.now().isoformat()
        
        # Update the transaction
        tables["transactions"].update(transaction_id, {
            "Buyer": buyer,
            "ExecutedAt": now
        })
        
        print(f"Updated transaction {transaction_id} with buyer {buyer}")
        return True
    except Exception as e:
        print(f"Error updating transaction {transaction_id}: {str(e)}")
        return False

def update_land_with_owner(tables, land_id: str, owner: str) -> bool:
    """Update a land with a new owner."""
    try:
        # Find the land record
        formula = f"{{LandId}}='{land_id}'"
        lands = tables["lands"].all(formula=formula)
        
        if not lands:
            print(f"Land {land_id} not found")
            return False
        
        # Update the land with the new owner
        tables["lands"].update(lands[0]["id"], {
            "Citizen": owner
        })
        
        print(f"Updated land {land_id} with owner {owner}")
        return True
    except Exception as e:
        print(f"Error updating land {land_id}: {str(e)}")
        return False

def create_notification(tables, citizen: str, land_id: str, price: float) -> bool:
    """Create a notification for the citizen about the land purchase."""
    try:
        now = datetime.now().isoformat()
        
        # Create the notification
        notification = {
            "Citizen": citizen,
            "Type": "land_purchase",
            "Content": f"You have successfully purchased land {land_id} for {price} ducats.",
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "land_id": land_id,
                "price": price,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print(f"Created notification for {citizen} about land purchase")
        return True
    except Exception as e:
        print(f"Error creating notification: {str(e)}")
        return False

def create_admin_notification(tables, purchases: List[Dict]) -> None:
    """Create a notification for admins with the AI land purchase summary."""
    try:
        if not purchases:
            return
            
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Land Purchase Summary:\n\n"
        
        for purchase in purchases:
            message += f"- {purchase['citizen']}: Purchased land {purchase['land_id']} for {purchase['price']} ducats\n"
        
        # Create the notification
        notification = {
            "Citizen": "ConsiglioDeiDieci",
            "Type": "ai_land_purchases",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": None,
            "Details": json.dumps({
                "purchases": purchases,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI land purchase summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_land_purchases(dry_run: bool = False):
    """Main function to process AI land purchases."""
    print(f"Starting AI land purchase process (dry_run={dry_run})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens sorted by Ducats DESC
    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("No AI citizens found, exiting")
        return
    
    # Get available land transactions sorted by Price DESC
    available_transactions = get_available_land_transactions(tables)
    if not available_transactions:
        print("No available land transactions found, exiting")
        return
    
    # Track purchases for admin notification
    purchases = []
    
    # Process each AI citizen
    for ai_citizen in ai_citizens:
        ai_username = ai_citizen["fields"].get("Username")
        ai_ducats = ai_citizen["fields"].get("Ducats", 0)
        
        if not ai_username:
            continue
        
        print(f"Processing AI citizen: {ai_username} with {ai_ducats} ducats")
        
        # Calculate maximum spending amount (90% of ducats)
        max_spend = ai_ducats * 0.9
        
        # Find the most expensive land the AI can afford
        selected_transaction = None
        for transaction in available_transactions:
            price = transaction["fields"].get("Price", 0)
            
            if price <= max_spend:
                selected_transaction = transaction
                break
        
        if selected_transaction:
            transaction_id = selected_transaction["id"]
            land_id = selected_transaction["fields"].get("AssetId")
            price = selected_transaction["fields"].get("Price", 0)
            
            print(f"AI {ai_username} can afford land {land_id} for {price} ducats")
            
            if not dry_run:
                # Update the transaction with the buyer
                update_success = update_transaction_with_buyer(tables, transaction_id, ai_username)
                
                if update_success:
                    # Update the land with the new owner
                    land_update_success = update_land_with_owner(tables, land_id, ai_username)
                    
                    # Update the citizen's ducats
                    if land_update_success:
                        new_ducats = ai_ducats - price
                        tables["citizens"].update(ai_citizen["id"], {
                            "Ducats": new_ducats
                        })
                        print(f"Updated {ai_username}'s ducats from {ai_ducats} to {new_ducats}")
                        
                        # Create notification for the citizen
                        create_notification(tables, ai_username, land_id, price)
                        
                        # Add to purchases list for admin notification
                        purchases.append({
                            "citizen": ai_username,
                            "land_id": land_id,
                            "price": price
                        })
                        
                        # Remove this transaction from available transactions
                        available_transactions.remove(selected_transaction)
            else:
                print(f"[DRY RUN] Would purchase land {land_id} for {price} ducats for AI {ai_username}")
        else:
            print(f"AI {ai_username} cannot afford any available land")
    
    # Create admin notification with summary
    if not dry_run and purchases:
        create_admin_notification(tables, purchases)
    else:
        print(f"[DRY RUN] Would create admin notification with purchases: {purchases}")
    
    print("AI land purchase process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_land_purchases(dry_run)
