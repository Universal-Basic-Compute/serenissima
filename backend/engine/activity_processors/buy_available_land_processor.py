import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_buy_available_land_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the buy_available_land chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at courthouse/town_hall (no action needed as finalize_land_purchase is already created)
    2. finalize_land_purchase - Complete the land purchase transaction
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    citizen = fields.get('Citizen')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for {activity_type}: {e}")
        return False
    
    # Handle goto_location activity (first step in chain)
    if activity_type == "goto_location" and details.get("activityType") == "buy_available_land":
        # No need to create the finalize_land_purchase activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the official location for land purchase {details.get('landId')}.")
        log.info(f"The finalize_land_purchase activity should already be scheduled to start after this activity.")
        return True
    
    # Handle finalize_land_purchase activity (second step in chain)
    elif activity_type == "finalize_land_purchase":
        return _finalize_land_purchase(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in buy_available_land processor: {activity_type}")
        return False

def _finalize_land_purchase(
    tables: Dict[str, Any],
    purchase_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Complete the land purchase transaction when the finalize_land_purchase activity is processed."""
    fields = purchase_activity.get('fields', {})
    citizen = fields.get('Citizen')
    land_id = details.get('landId')
    expected_price = details.get('expectedPrice')
    
    if not (citizen and land_id and expected_price is not None):
        log.error(f"Missing data for finalizing land purchase: citizen={citizen}, land_id={land_id}, expected_price={expected_price}")
        return False
    
    # Get the building where the purchase is being finalized (courthouse/town_hall)
    building_id = fields.get('ToBuilding')
    building_operator = "ConsiglioDeiDieci"  # Default to city government
    
    if building_id:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {building_operator} for building {building_id}")
    
    # Verify the land exists and is available for purchase
    land_formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
    land_records = tables["lands"].all(formula=land_formula, max_records=1)
    
    if not land_records:
        log.error(f"Land {land_id} not found")
        return False
    
    land_record = land_records[0]
    current_owner = land_record['fields'].get('Owner')
    
    # Check if land is owned by the government (available for purchase)
    if current_owner != "ConsiglioDeiDieci":
        log.error(f"Land {land_id} is not available for purchase. Current owner: {current_owner}")
        return False
    
    # Calculate transaction fee (1% of land price, minimum 20 Ducats)
    # Based on average daily wage of 2000 Ducats
    land_price = float(expected_price)
    transaction_fee = max(20, land_price * 0.01)
    total_cost = land_price + transaction_fee
    
    # Check if citizen has enough Ducats to pay for the land and fees
    citizen_formula = f"{{Username}}='{_escape_airtable_value(citizen)}'"
    citizen_records = tables["citizens"].all(formula=citizen_formula, max_records=1)
    
    if not citizen_records:
        log.error(f"Citizen {citizen} not found for land purchase")
        return False
        
    citizen_record = citizen_records[0]
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    if citizen_ducats < total_cost:
        log.error(f"Citizen {citizen} has insufficient funds ({citizen_ducats} Ducats) to purchase land {land_id} for {land_price} Ducats plus {transaction_fee} Ducats in fees")
        return False
    
    try:
        # 1. Deduct total cost from citizen
        tables["citizens"].update(citizen_record['id'], {'Ducats': citizen_ducats - total_cost})
        
        # 2. Transfer land ownership
        tables["lands"].update(land_record['id'], {'Owner': citizen})
        
        # 3. Add transaction fee to building operator
        if building_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(building_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + transaction_fee})
        
        # 4. Record the land purchase transaction
        land_transaction_fields = {
            "Type": "land_purchase",
            "AssetType": "land",
            "Asset": land_id,
            "Seller": "ConsiglioDeiDieci",  # Government sells
            "Buyer": citizen,  # Citizen buys
            "Price": land_price,
            "Notes": json.dumps({
                "building_id": building_id,
                "transaction_type": "direct_purchase"
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(land_transaction_fields)
        
        # 5. Record the transaction fee
        fee_transaction_fields = {
            "Type": "land_purchase_fee",
            "AssetType": "land",
            "Asset": land_id,
            "Seller": citizen,  # Citizen pays
            "Buyer": building_operator,  # Building operator receives
            "Price": transaction_fee,
            "Notes": json.dumps({
                "building_id": building_id,
                "transaction_type": "purchase_fee"
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(fee_transaction_fields)
        
        log.info(f"Successfully completed purchase of land {land_id} by {citizen} for {land_price} Ducats")
        log.info(f"Collected transaction fee of {transaction_fee} Ducats from {citizen} paid to {building_operator}")
        
        return True
    except Exception as e:
        log.error(f"Failed to complete land purchase transaction: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
