import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_adjust_business_wages_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the adjust_business_wages chain.
    
    This processor handles two types of activities:
    1. goto_location - When citizen arrives at the business (no action needed)
    2. update_wage_ledger - Update the business wages
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
    if activity_type == "goto_location" and details.get("activityType") == "adjust_business_wages":
        # No need to create the update_wage_ledger activity as it's already created
        # Just log and return success
        log.info(f"Citizen {citizen} has arrived at the business for adjusting wages for building {details.get('businessBuildingId')}.")
        log.info(f"The update_wage_ledger activity should already be scheduled to start after this activity.")
        return True
    
    # Handle update_wage_ledger activity (second step in chain)
    elif activity_type == "update_wage_ledger":
        return _update_business_wages(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in adjust_business_wages processor: {activity_type}")
        return False

def _update_business_wages(
    tables: Dict[str, Any],
    adjustment_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Update the business wages when the update_wage_ledger activity is processed."""
    fields = adjustment_activity.get('fields', {})
    citizen = fields.get('Citizen')
    business_building_id = details.get('businessBuildingId')
    new_wage_amount = details.get('newWageAmount')
    strategy = details.get('strategy', 'standard')
    
    if not (citizen and business_building_id and new_wage_amount is not None):
        log.error(f"Missing data for updating wages: citizen={citizen}, business_building_id={business_building_id}, new_wage_amount={new_wage_amount}")
        return False
    
    # Verify the business exists and is operated by the citizen
    building_formula = f"{{BuildingId}}='{_escape_airtable_value(business_building_id)}'"
    building_records = tables["buildings"].all(formula=building_formula, max_records=1)
    
    if not building_records:
        log.error(f"Building {business_building_id} not found")
        return False
    
    building_record = building_records[0]
    building_operator = building_record['fields'].get('RunBy')
    building_category = building_record['fields'].get('Category')
    building_name = building_record['fields'].get('Name', business_building_id)
    
    if building_operator != citizen:
        log.error(f"Citizen {citizen} does not operate building {business_building_id}")
        return False
    
    if building_category != 'business':
        log.error(f"Building {business_building_id} is not a business (category: {building_category})")
        return False
    
    # Get the current wages
    current_wages = float(building_record['fields'].get('Wages', 0))
    
    try:
        # Update building wages
        tables["buildings"].update(building_record['id'], {'Wages': new_wage_amount})
        
        # Update the CheckedAt timestamp to indicate active management
        tables["buildings"].update(building_record['id'], {'CheckedAt': datetime.utcnow().isoformat()})
        
        # Notify current occupant about the wage change if there is one
        building_occupant = building_record['fields'].get('Occupant')
        
        if building_occupant and building_occupant != citizen:
            # Create notification for building occupant
            notification_fields = {
                "Citizen": building_occupant,
                "Type": "wage_change",
                "Content": f"The wages for {building_name} have been changed from {current_wages} to {new_wage_amount} Ducats by the operator {citizen}.",
                "Details": json.dumps({
                    "buildingId": business_building_id,
                    "previousWages": current_wages,
                    "newWages": new_wage_amount
                }),
                "Asset": business_building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        # Notify building owner if different from operator
        building_owner = building_record['fields'].get('Owner')
        
        if building_owner and building_owner != citizen:
            # Create notification for building owner
            notification_fields = {
                "Citizen": building_owner,
                "Type": "wage_change",
                "Content": f"The wages for your building {building_name} have been changed from {current_wages} to {new_wage_amount} Ducats by the operator {citizen}.",
                "Details": json.dumps({
                    "buildingId": business_building_id,
                    "previousWages": current_wages,
                    "newWages": new_wage_amount
                }),
                "Asset": business_building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully updated wages for business {business_building_id} from {current_wages} to {new_wage_amount} Ducats")
        
        return True
    except Exception as e:
        log.error(f"Failed to update business wages: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
