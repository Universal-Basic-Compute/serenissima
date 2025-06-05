import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional, Any # Added Any
import requests # Added requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the parent directory to the path to import citizen_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.citizen_utils import find_citizen_by_identifier

# --- Configuration ---
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
# VENICE_TIMEZONE could be imported if needed for date operations.
# from backend.engine.utils.activity_helpers import VENICE_TIMEZONE

# Local LogColors class removed, using imported version.

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

# execute_land_purchase_contract and update_land_with_owner will be removed as their logic is handled by the activity.
# The orphaned try-except block below that belonged to the commented out execute_land_purchase_contract has been removed.

# Removed update_land_with_owner function

def create_notification(tables, citizen: str, land_id: str, price: float) -> bool:
    """Create a notification for the citizen about the land purchase."""
    try:
        now = datetime.now().isoformat()
        
        # Create the notification
        notification = {
            "Citizen": citizen,
            "Type": "land_purchase",
            "Content": f"🎉 Land Acquired! You have successfully purchased land **{land_id}** for **{price} ⚜️ Ducats**.",
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
        message = "📜 **AI Land Purchase Summary** 📜\n\n"
        
        for purchase in purchases:
            message += f"- 👤 **{purchase['citizen']}**: Purchased land **{purchase['land_id']}** for **{purchase['price']} ⚜️ Ducats**\n"
        
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
    log_header(f"AI Land Purchase Process (dry_run={dry_run})", LogColors.HEADER)
    
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
            
            activity_params = {
                "landId": land_id,
                "expectedPrice": price,
                "landSaleContractId": contract_id # Pass the ID of the 'land_sale' contract
                # targetOfficeBuildingId is optional
            }

            if call_try_create_activity_api(ai_username, "buy_available_land", activity_params, dry_run):
                print(f"{LogColors.OKGREEN}Successfully initiated 'buy_available_land' activity for AI {ai_username} for land {land_id}.{LogColors.ENDC}")
                # Add to purchases list for admin notification (even in dry_run for summary)
                purchases.append({
                    "citizen": ai_username,
                    "land_id": land_id,
                    "price": price,
                    "status": "initiated" if not dry_run else "simulated_initiation"
                })
                # Remove this transaction from available transactions so it's not considered again in this run
                available_transactions.remove(selected_transaction)
            else:
                print(f"{LogColors.FAIL}Failed to initiate 'buy_available_land' activity for AI {ai_username} for land {land_id}.{LogColors.ENDC}")
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
