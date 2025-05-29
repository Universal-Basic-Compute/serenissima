import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional
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
    AIRTABLE_TRANSACTIONS_TABLE_NAME = os.getenv("AIRTABLE_TRANSACTIONS_TABLE", "TRANSACTIONS") # For logging
    tables = {
        "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
        "contracts": Table(airtable_api_key, airtable_base_id, AIRTABLE_CONTRACTS_TABLE_NAME),
        "transactions_log_table": Table(airtable_api_key, airtable_base_id, AIRTABLE_TRANSACTIONS_TABLE_NAME),
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
    """Get all available land_sale contracts."""
    try:
        # Query contracts with Type='land_sale' and Status='available'
        formula = "AND({Type}='land_sale', {Status}='available')"
        contracts = tables["contracts"].all(formula=formula)
        
        # Sort by PricePerResource in descending order (AI wants the most expensive it can afford)
        # Or ascending if AI wants cheapest first. Current logic implies most expensive.
        contracts.sort(key=lambda x: x["fields"].get("PricePerResource", 0), reverse=True)
        
        print(f"Found {len(contracts)} available land_sale contracts")
        return contracts
    except Exception as e:
        print(f"Error getting available land transactions: {str(e)}")
        return []

def execute_land_purchase_contract(tables, contract_id: str, buyer_username: str) -> Optional[Dict]:
    """Update a land_sale contract with a buyer, marking it as executed."""
    try:
        now = datetime.now().isoformat()
        
        # Update the contract
        updated_contract = tables["contracts"].update(contract_id, {
            "Buyer": buyer_username,
            "Status": "executed",
            "ExecutedAt": now,
            "UpdatedAt": now
        })
        
        print(f"Executed land_sale contract {contract_id} with buyer {buyer_username}")
        return updated_contract
    except Exception as e:
        print(f"Error executing land_sale contract {contract_id}: {str(e)}")
        return None
        # The 'return True' here is unreachable due to 'return None' above.
        # Assuming the intent was for the try block to return the updated_contract or True on success.
        # However, the current structure returns updated_contract or None.
        # The 'return True' in the except block was likely a copy-paste error or leftover.
        # The original error was about transaction_id, which is fixed below.
    except Exception as e:
        print(f"Error executing land_sale contract {contract_id}: {str(e)}") # Changed transaction_id to contract_id
        return False # Should be None to match the function's return type hint Optional[Dict] or handle error differently

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
            "Owner": owner
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
    total_ai_citizens_for_land = len(ai_citizens)
    print(f"Processing {total_ai_citizens_for_land} AI citizens for land purchases.")
    
    # Process each AI citizen
    for i, ai_citizen in enumerate(ai_citizens):
        ai_username = ai_citizen["fields"].get("Username")
        ai_ducats = ai_citizen["fields"].get("Ducats", 0)
        
        if not ai_username:
            # print(f"Skipping AI citizen at index {i} due to missing Username.")
            continue
        
        # print(f"Processing AI citizen {i+1}/{total_ai_citizens_for_land}: {ai_username} with {ai_ducats} ducats")
        
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
            contract_id = selected_transaction["id"]
            land_id = selected_transaction["fields"].get("ResourceType") # LandId is in ResourceType
            price = selected_transaction["fields"].get("PricePerResource", 0)
            original_seller_username = selected_transaction["fields"].get("Seller") # Who listed the land
            
            print(f"AI {ai_username} can afford land {land_id} (listed by {original_seller_username}) for {price} ducats")
            
            if not dry_run:
                # Execute the land_sale contract
                executed_contract = execute_land_purchase_contract(tables, contract_id, ai_username)
                
                if executed_contract:
                    # Update the land with the new owner
                    land_update_success = update_land_with_owner(tables, land_id, ai_username)
                    
                    if land_update_success:
                        # Update the AI citizen's ducats
                        new_ai_ducats = ai_ducats - price
                        tables["citizens"].update(ai_citizen["id"], {"Ducats": new_ai_ducats})
                        print(f"Updated AI {ai_username}'s ducats from {ai_ducats} to {new_ai_ducats}")

                        # Update original seller's ducats
                        if original_seller_username and original_seller_username != "Republic":
                            seller_record_data = find_citizen_by_identifier(tables, original_seller_username)
                            if seller_record_data:
                                seller_current_ducats = seller_record_data["fields"].get("Ducats", 0)
                                new_seller_ducats = seller_current_ducats + price
                                tables["citizens"].update(seller_record_data["id"], {"Ducats": new_seller_ducats})
                                print(f"Updated seller {original_seller_username}'s ducats from {seller_current_ducats} to {new_seller_ducats}")
                            else:
                                print(f"Warning: Could not find seller {original_seller_username} to update ducats.")
                        
                        # Create a transaction log for the ducat transfer
                        try:
                            tables["transactions_log_table"].create({
                                "Type": "transfer_log",
                                "Asset": "compute_token_for_land_sale",
                                "Seller": original_seller_username, # Receiver of ducats
                                "Buyer": ai_username,             # Payer of ducats
                                "Price": price,
                                "CreatedAt": datetime.now().isoformat(),
                                "ExecutedAt": datetime.now().isoformat(),
                                "Notes": json.dumps({
                                    "contract_id": contract_id,
                                    "land_id": land_id,
                                    "purchase_by_ai": True
                                })
                            })
                            print(f"Created transfer_log for land purchase: {ai_username} paid {price} to {original_seller_username} for {land_id}")
                        except Exception as e:
                            print(f"Error creating transfer_log for land purchase: {str(e)}")

                        # Create notification for the AI citizen
                        create_notification(tables, ai_username, land_id, price)
                        
                        # Create notification for the original seller
                        if original_seller_username and original_seller_username != "Republic" and original_seller_username != ai_username :
                            try:
                                notification_content = f"Your land {land_id} has been purchased by {ai_username} for {price} ducats."
                                tables["notifications"].create({
                                    "Citizen": original_seller_username,
                                    "Type": "land_sold",
                                    "Content": notification_content,
                                    "CreatedAt": datetime.now().isoformat(),
                                    "Details": json.dumps({
                                        "land_id": land_id,
                                        "buyer": ai_username,
                                        "price": price,
                                        "timestamp": datetime.now().isoformat()
                                    })
                                })
                                print(f"Sent land sold notification to {original_seller_username}")
                            except Exception as e:
                                print(f"Error sending land sold notification: {str(e)}")
                        
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
