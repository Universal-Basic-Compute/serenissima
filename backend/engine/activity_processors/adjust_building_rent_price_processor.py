import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_adjust_building_rent_price_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the adjust_building_rent_price chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the appropriate location (no action needed)
    2. file_rent_adjustment - Update the building rent price and handle any fees
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
    if activity_type == "goto_location" and details.get("activityType") == "adjust_building_rent_price":
        # No need to create the file_rent_adjustment activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the location for adjusting rent price for building {details.get('buildingId')}.")
        log.info(f"The file_rent_adjustment activity should already be scheduled to start after this activity.")
        return True
    
    # Handle file_rent_adjustment activity (second step in chain)
    elif activity_type == "file_rent_adjustment":
        return _update_building_rent_price(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in adjust_building_rent_price processor: {activity_type}")
        return False

def _update_building_rent_price(
    tables: Dict[str, Any],
    adjustment_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Update the building rent price when the file_rent_adjustment activity is processed."""
    fields = adjustment_activity.get('fields', {})
    citizen = fields.get('Citizen')
    building_id = details.get('buildingId')
    new_rent_price = details.get('newRentPrice')
    strategy = details.get('strategy', 'standard')
    
    if not (citizen and building_id and new_rent_price is not None):
        log.error(f"Missing data for updating rent price: citizen={citizen}, building_id={building_id}, new_rent_price={new_rent_price}")
        return False
    
    # Get the building where the adjustment is being filed
    filing_building_id = fields.get('FromBuilding')
    filing_building_operator = "ConsiglioDeiDieci"  # Default to city government
    
    if filing_building_id:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(filing_building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            filing_building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {filing_building_operator} for building {filing_building_id}")
    
    # Verify the building exists and is owned by the citizen
    building_formula = f"{{BuildingId}}='{_escape_airtable_value(building_id)}'"
    building_records = tables["buildings"].all(formula=building_formula, max_records=1)
    
    if not building_records:
        log.error(f"Building {building_id} not found")
        return False
    
    building_record = building_records[0]
    current_owner = building_record['fields'].get('Owner')
    
    if current_owner != citizen:
        log.error(f"Building {building_id} is not owned by {citizen}. Current owner: {current_owner}")
        return False
    
    # Get the current rent price
    current_rent_price = float(building_record['fields'].get('RentPrice', 0))
    
    # Calculate filing fee (1% of new rent price, minimum 5 Ducats)
    # Based on average daily wage of 2000 Ducats
    filing_fee = max(5, new_rent_price * 0.01)
    
    # Check if citizen has enough Ducats to pay the filing fee
    citizen_formula = f"{{Username}}='{_escape_airtable_value(citizen)}'"
    citizen_records = tables["citizens"].all(formula=citizen_formula, max_records=1)
    
    if not citizen_records:
        log.error(f"Citizen {citizen} not found for rent price adjustment")
        return False
        
    citizen_record = citizen_records[0]
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    if citizen_ducats < filing_fee:
        log.error(f"Citizen {citizen} has insufficient funds ({citizen_ducats} Ducats) to pay filing fee of {filing_fee} Ducats")
        return False
    
    try:
        # 1. Deduct filing fee from citizen
        tables["citizens"].update(citizen_record['id'], {'Ducats': citizen_ducats - filing_fee})
        
        # 2. Update building rent price
        tables["buildings"].update(building_record['id'], {'RentPrice': new_rent_price})
        
        # 3. Add filing fee to building operator
        if filing_building_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(filing_building_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + filing_fee})
        
        # 4. Record the filing fee transaction
        transaction_fields = {
            "Type": "rent_adjustment_fee",
            "AssetType": "building",
            "Asset": building_id,
            "Seller": citizen,  # Citizen pays
            "Buyer": filing_building_operator,  # Building operator receives
            "Price": filing_fee,
            "Notes": json.dumps({
                "previous_rent_price": current_rent_price,
                "new_rent_price": new_rent_price,
                "strategy": strategy,
                "filing_building_id": filing_building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(transaction_fields)
        
        # 5. Notify building occupant about the rent price change
        building_occupant = building_record['fields'].get('Occupant')
        
        if building_occupant and building_occupant != citizen:
            # Create notification for building occupant
            notification_fields = {
                "Citizen": building_occupant,
                "Type": "rent_price_change",
                "Content": f"The rent price for building {building_id} has been changed from {current_rent_price} to {new_rent_price} Ducats by the owner {citizen}.",
                "Details": json.dumps({
                    "buildingId": building_id,
                    "previousRentPrice": current_rent_price,
                    "newRentPrice": new_rent_price
                }),
                "Asset": building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        # 6. Notify building operator (if different from owner and occupant)
        building_operator = building_record['fields'].get('RunBy')
        
        if building_operator and building_operator != citizen and building_operator != building_occupant:
            # Create notification for building operator
            notification_fields = {
                "Citizen": building_operator,
                "Type": "rent_price_change",
                "Content": f"The rent price for building {building_id} that you operate has been changed from {current_rent_price} to {new_rent_price} Ducats by the owner {citizen}.",
                "Details": json.dumps({
                    "buildingId": building_id,
                    "previousRentPrice": current_rent_price,
                    "newRentPrice": new_rent_price
                }),
                "Asset": building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully updated rent price for building {building_id} from {current_rent_price} to {new_rent_price} Ducats")
        log.info(f"Collected filing fee of {filing_fee} Ducats from {citizen} paid to {filing_building_operator}")
        
        return True
    except Exception as e:
        log.error(f"Failed to update building rent price: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
