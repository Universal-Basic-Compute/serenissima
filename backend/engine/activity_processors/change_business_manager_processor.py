import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE, get_citizen_record

log = logging.getLogger(__name__)

def process_change_business_manager_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the change_business_manager chain.
    
    This processor handles three types of activities:
    1. goto_location (to business) - Travel to the business (no action needed)
    2. goto_location (to office/meeting) - Travel to the office or meeting party (no action needed)
    3. finalize_operator_change - Update the business operator and handle any fees
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
    
    # Handle goto_location activities (first and second steps in chain)
    if activity_type == "goto_location" and details.get("activityType") == "change_business_manager":
        next_step = details.get("nextStep")
        if next_step == "goto_office_or_meeting":
            log.info(f"Citizen {citizen} has arrived at the business for management change.")
            log.info(f"The goto_office_or_meeting activity should already be scheduled to start after this activity.")
        elif next_step == "finalize_operator_change":
            log.info(f"Citizen {citizen} has arrived at the office/meeting location for management change.")
            log.info(f"The finalize_operator_change activity should already be scheduled to start after this activity.")
        return True
    
    # Handle finalize_operator_change activity (final step in chain)
    elif activity_type == "finalize_operator_change":
        return _finalize_operator_change(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in change_business_manager processor: {activity_type}")
        return False

def _finalize_operator_change(
    tables: Dict[str, Any],
    finalize_activity: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Update the business operator when the finalize_operator_change activity is processed."""
    fields = finalize_activity.get('fields', {})
    citizen = fields.get('Citizen')
    business_building_id = details.get('businessBuildingId')
    new_operator_username = details.get('newOperatorUsername')
    current_operator_username = details.get('currentOperatorUsername')
    owner_username = details.get('ownerUsername')
    reason = details.get('reason', 'Not specified')
    operation_type = details.get('operationType', 'delegate')
    
    if not (citizen and business_building_id):
        log.error(f"Missing data for finalizing operator change: citizen={citizen}, business_building_id={business_building_id}")
        return False
    
    # Get the office building where the change is being finalized
    filing_building_id = fields.get('FromBuilding')
    filing_building_operator = "ConsiglioDeiDieci"  # Default to city government
    
    if filing_building_id:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(filing_building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            filing_building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {filing_building_operator} for building {filing_building_id}")
    
    # Verify the business building exists
    building_formula = f"{{BuildingId}}='{_escape_airtable_value(business_building_id)}'"
    building_records = tables["buildings"].all(formula=building_formula, max_records=1)
    
    if not building_records:
        log.error(f"Building {business_building_id} not found")
        return False
    
    building_record = building_records[0]
    building_owner = building_record['fields'].get('Owner')
    building_operator = building_record['fields'].get('RunBy')
    building_category = building_record['fields'].get('Category')
    building_name = building_record['fields'].get('Name', business_building_id)
    
    # Verify the building is a business
    if building_category != 'business':
        log.error(f"Building {business_building_id} is not a business (category: {building_category})")
        return False
    
    # Validate operation type and permissions
    if operation_type == 'delegate':
        # Only the current operator can delegate
        if building_operator != citizen:
            log.error(f"Citizen {citizen} is not the current operator of building {business_building_id}")
            return False
        if not new_operator_username:
            log.error(f"Missing newOperatorUsername for delegate operation")
            return False
        # Verify the new operator exists
        new_operator_record = get_citizen_record(tables, new_operator_username)
        if not new_operator_record:
            log.error(f"New operator {new_operator_username} not found")
            return False
    elif operation_type == 'request_management':
        # For request, we need approval from the current operator
        # In a real implementation, this would create a notification or contract
        # For now, we'll simulate automatic approval if the current operator is an AI
        current_operator_record = get_citizen_record(tables, current_operator_username)
        if not current_operator_record:
            log.error(f"Current operator {current_operator_username} not found")
            return False
        is_ai_operator = current_operator_record['fields'].get('IsAI', False)
        if not is_ai_operator:
            log.info(f"Current operator {current_operator_username} is not an AI. In a real implementation, this would require approval.")
            # For now, we'll proceed anyway for demonstration purposes
    elif operation_type == 'claim_management':
        # Only the owner can claim management
        if building_owner != citizen:
            log.error(f"Citizen {citizen} is not the owner of building {business_building_id}")
            return False
    else:
        log.error(f"Invalid operationType: {operation_type}")
        return False
    
    # Calculate filing fee (50 Ducats flat fee)
    # Based on average daily wage of 2000 Ducats
    filing_fee = 50
    
    # Check if citizen has enough Ducats to pay the filing fee
    citizen_record = get_citizen_record(tables, citizen)
    if not citizen_record:
        log.error(f"Citizen {citizen} not found")
        return False
    
    citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
    
    if citizen_ducats < filing_fee:
        log.error(f"Citizen {citizen} has insufficient funds ({citizen_ducats} Ducats) to pay filing fee of {filing_fee} Ducats")
        return False
    
    try:
        # 1. Deduct filing fee from citizen
        tables["citizens"].update(citizen_record['id'], {'Ducats': citizen_ducats - filing_fee})
        
        # 2. Determine the new operator based on operation type
        final_new_operator = None
        if operation_type == 'delegate':
            final_new_operator = new_operator_username
        elif operation_type == 'request_management':
            final_new_operator = citizen
        elif operation_type == 'claim_management':
            final_new_operator = citizen
        
        # 3. Update building operator
        tables["buildings"].update(building_record['id'], {'RunBy': final_new_operator})
        
        # 4. Add filing fee to filing building operator
        if filing_building_operator != "ConsiglioDeiDieci":
            operator_record = get_citizen_record(tables, filing_building_operator)
            if operator_record:
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + filing_fee})
        
        # 5. Record the filing fee transaction
        transaction_fields = {
            "Type": "management_change_fee",
            "AssetType": "building",
            "Asset": business_building_id,
            "Seller": citizen,  # Citizen pays
            "Buyer": filing_building_operator,  # Filing building operator receives
            "Price": filing_fee,
            "Notes": json.dumps({
                "previous_operator": building_operator,
                "new_operator": final_new_operator,
                "operation_type": operation_type,
                "reason": reason,
                "filing_building_id": filing_building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(transaction_fields)
        
        # 6. Notify relevant parties
        
        # Notify the previous operator if different from the citizen
        if building_operator and building_operator != citizen:
            notification_fields = {
                "Citizen": building_operator,
                "Type": "management_change",
                "Content": f"The management of {building_name} has been changed from you to {final_new_operator}.",
                "Details": json.dumps({
                    "buildingId": business_building_id,
                    "previousOperator": building_operator,
                    "newOperator": final_new_operator,
                    "operationType": operation_type,
                    "reason": reason
                }),
                "Asset": business_building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        # Notify the new operator if different from the citizen
        if final_new_operator and final_new_operator != citizen:
            notification_fields = {
                "Citizen": final_new_operator,
                "Type": "management_change",
                "Content": f"You are now the manager of {building_name}, previously managed by {building_operator}.",
                "Details": json.dumps({
                    "buildingId": business_building_id,
                    "previousOperator": building_operator,
                    "newOperator": final_new_operator,
                    "operationType": operation_type,
                    "reason": reason
                }),
                "Asset": business_building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        # Notify the owner if different from both the citizen and the new operator
        if building_owner and building_owner != citizen and building_owner != final_new_operator:
            notification_fields = {
                "Citizen": building_owner,
                "Type": "management_change",
                "Content": f"The management of your building {building_name} has been changed from {building_operator} to {final_new_operator}.",
                "Details": json.dumps({
                    "buildingId": business_building_id,
                    "previousOperator": building_operator,
                    "newOperator": final_new_operator,
                    "operationType": operation_type,
                    "reason": reason
                }),
                "Asset": business_building_id,
                "AssetType": "building",
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat()
            }
            tables["notifications"].create(notification_fields)
        
        log.info(f"Successfully changed operator of building {business_building_id} from {building_operator} to {final_new_operator}")
        log.info(f"Collected filing fee of {filing_fee} Ducats from {citizen} paid to {filing_building_operator}")
        
        return True
    except Exception as e:
        log.error(f"Failed to finalize operator change: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
