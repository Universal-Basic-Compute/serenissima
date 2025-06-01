import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_adjust_land_lease_price_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the adjust_land_lease_price chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the appropriate location (no action needed)
    2. file_lease_adjustment - Update the land lease price and handle any fees
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
    if activity_type == "goto_location" and details.get("activityType") == "adjust_land_lease_price":
        # No need to create the file_lease_adjustment activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the location for adjusting lease price for land {details.get('landId')}.")
        log.info(f"The file_lease_adjustment activity should already be scheduled to start after this activity.")
        return True
    
    # Handle file_lease_adjustment activity (second step in chain)
    elif activity_type == "file_lease_adjustment":
        return _update_land_lease_price(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in adjust_land_lease_price processor: {activity_type}")
        return False

def _update_land_lease_price(
    tables: Dict[str, Any],
    adjustment_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Update the land lease price when the file_lease_adjustment activity is processed."""
    fields = adjustment_activity.get('fields', {})
    citizen = fields.get('Citizen')
    land_id = details.get('landId')
    new_lease_price = details.get('newLeasePrice')
    strategy = details.get('strategy', 'standard')
    
    if not (citizen and land_id and new_lease_price is not None):
        log.error(f"Missing data for updating lease price: citizen={citizen}, land_id={land_id}, new_lease_price={new_lease_price}")
        return False
    
    # Get the building where the adjustment is being filed
    building_id = fields.get('FromBuilding')
    building_operator = "ConsiglioDeiDieci"  # Default to city government
    
    if building_id:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {building_operator} for building {building_id}")
    
    # Verify the land exists and is owned by the citizen
    land_formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
    land_records = tables["lands"].all(formula=land_formula, max_records=1)
    
    if not land_records:
        log.error(f"Land {land_id} not found")
        return False
    
    land_record = land_records[0]
    current_owner = land_record['fields'].get('Owner')
    
    if current_owner != citizen:
        log.error(f"Land {land_id} is not owned by {citizen}. Current owner: {current_owner}")
        return False
    
    # Get the current lease price
    current_lease_price = float(land_record['fields'].get('LeasePrice', 0))
    
    # Calculate filing fee (1% of new lease price, minimum 5 Ducats)
    # Based on average daily wage of 2000 Ducats
    filing_fee = max(5, new_lease_price * 0.01)
    
    # Check if citizen has enough Ducats to pay the filing fee
    citizen_formula = f"{{Username}}='{_escape_airtable_value(citizen)}'"
    citizen_records = tables["citizens"].all(formula=citizen_formula, max_records=1)
    
    if not citizen_records:
        log.error(f"Citizen {citizen} not found for lease price adjustment")
        return False
        
    citizen_record = citizen_records[0]
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    if citizen_ducats < filing_fee:
        log.error(f"Citizen {citizen} has insufficient funds ({citizen_ducats} Ducats) to pay filing fee of {filing_fee} Ducats")
        return False
    
    try:
        # 1. Deduct filing fee from citizen
        tables["citizens"].update(citizen_record['id'], {'Ducats': citizen_ducats - filing_fee})
        
        # 2. Update land lease price
        tables["lands"].update(land_record['id'], {'LeasePrice': new_lease_price})
        
        # 3. Add filing fee to building operator
        if building_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(building_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + filing_fee})
        
        # 4. Record the filing fee transaction
        transaction_fields = {
            "Type": "lease_adjustment_fee",
            "AssetType": "land",
            "Asset": land_id,
            "Seller": citizen,  # Citizen pays
            "Buyer": building_operator,  # Building operator receives
            "Price": filing_fee,
            "Notes": json.dumps({
                "previous_lease_price": current_lease_price,
                "new_lease_price": new_lease_price,
                "strategy": strategy,
                "building_id": building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(transaction_fields)
        
        # 5. Notify buildings on this land about the lease price change
        buildings_on_land_formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
        buildings_on_land = tables["buildings"].all(formula=buildings_on_land_formula)
        
        for building in buildings_on_land:
            building_id = building['fields'].get('BuildingId')
            building_owner = building['fields'].get('Owner')
            
            if building_owner and building_owner != citizen:
                # Create notification for building owner
                notification_fields = {
                    "Citizen": building_owner,
                    "Type": "lease_price_change",
                    "Content": f"The lease price for land {land_id} has been changed from {current_lease_price} to {new_lease_price} Ducats by the landowner {citizen}.",
                    "Details": json.dumps({
                        "landId": land_id,
                        "buildingId": building_id,
                        "previousLeasePrice": current_lease_price,
                        "newLeasePrice": new_lease_price
                    }),
                    "Asset": land_id,
                    "AssetType": "land",
                    "Status": "unread",
                    "CreatedAt": datetime.utcnow().isoformat()
                }
                tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully updated lease price for land {land_id} from {current_lease_price} to {new_lease_price} Ducats")
        log.info(f"Collected filing fee of {filing_fee} Ducats from {citizen} paid to {building_operator}")
        
        return True
    except Exception as e:
        log.error(f"Failed to update land lease price: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
