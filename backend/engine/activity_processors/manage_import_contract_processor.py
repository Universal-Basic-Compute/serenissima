import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_manage_import_contract_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the manage_import_contract chain.
    
    This processor handles three types of activities:
    1. goto_location - Travel to buyer building or customs office (no special action needed)
    2. assess_import_needs - Verify business needs at buyer building
    3. register_import_agreement - Create or update the import contract
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
    
    # Handle goto_location activity (part of chain)
    if activity_type == "goto_location" and details.get("activityType") == "manage_import_contract":
        # Just log and return success - the next activity is already scheduled
        next_step = details.get("nextStep", "unknown")
        log.info(f"Citizen {citizen} has completed travel for manage_import_contract. Next step: {next_step}")
        return True
    
    # Handle assess_import_needs activity
    elif activity_type == "assess_import_needs":
        return _handle_assess_import_needs(tables, activity_record, details)
    
    # Handle register_import_agreement activity
    elif activity_type == "register_import_agreement":
        return _create_or_update_import_contract(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in manage_import_contract processor: {activity_type}")
        return False

def _handle_assess_import_needs(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Handle the assess_import_needs activity.
    Verify that the business has a legitimate need for the imports.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    buyer_building_id = fields.get('FromBuilding')
    resource_type = details.get('resourceType')
    target_amount = details.get('targetAmount')
    
    if not (citizen and buyer_building_id and resource_type and target_amount is not None):
        log.error(f"Missing data for assess_import_needs: citizen={citizen}, buyer_building_id={buyer_building_id}, resource_type={resource_type}, target_amount={target_amount}")
        return False
    
    # Check if the citizen is the owner or operator of the building
    try:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(buyer_building_id)}'"
        building_records = tables['buildings'].all(formula=building_formula, max_records=1)
        
        if not building_records:
            log.error(f"Building {buyer_building_id} not found")
            return False
        
        building_record = building_records[0]
        building_owner = building_record['fields'].get('Owner')
        building_operator = building_record['fields'].get('RunBy')
        
        if citizen != building_owner and citizen != building_operator:
            log.warning(f"Citizen {citizen} is neither the owner nor operator of building {buyer_building_id}")
            # We'll continue anyway, but log the warning
        
        # Check current inventory levels of this resource type at the building
        resource_formula = f"AND({{AssetType}}='building', {{Asset}}='{_escape_airtable_value(buyer_building_id)}', {{Type}}='{_escape_airtable_value(resource_type)}')"
        resource_records = tables['resources'].all(formula=resource_formula)
        
        total_available = sum(float(record['fields'].get('Count', 0)) for record in resource_records)
        
        # Calculate a reasonable import amount based on building type and current inventory
        building_type = building_record['fields'].get('Type')
        
        # This is a simplified assessment - in a real system, you might have more complex logic
        # based on production rates, storage capacity, etc.
        if total_available < target_amount * 0.2:  # Less than 20% of target already in stock
            log.info(f"Building {buyer_building_id} has low stock of {resource_type} ({total_available} units). Import of {target_amount} is justified.")
        else:
            log.info(f"Building {buyer_building_id} already has {total_available} units of {resource_type}. Import of {target_amount} may be excessive but will proceed.")
        
        return True
    except Exception as e:
        log.error(f"Error assessing import needs: {e}")
        return False

def _create_or_update_import_contract(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Create or update an import contract when the register_import_agreement activity is processed."""
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    office_building_id = fields.get('FromBuilding')  # We're at the customs office now
    resource_type = details.get('resourceType')
    target_amount = details.get('targetAmount')
    price_per_resource = details.get('pricePerResource')
    buyer_building_id = details.get('buyerBuildingId')
    existing_contract_id = details.get('contractId')
    
    if not (citizen and office_building_id and resource_type and 
            target_amount is not None and price_per_resource is not None and buyer_building_id):
        log.error(f"Missing data for register_import_agreement: citizen={citizen}, office={office_building_id}, resource={resource_type}, amount={target_amount}, price={price_per_resource}, buyer_building={buyer_building_id}")
        return False
    
    # Calculate broker/customs fee (typically 3% of total value, minimum 15 Ducats)
    total_value = float(price_per_resource) * float(target_amount)
    broker_fee = max(15, total_value * 0.03)  # 3% fee, minimum 15 Ducats
    
    # Check if citizen has enough Ducats to pay the fee
    try:
        citizen_records = tables['citizens'].all(formula=f"{{Username}}='{_escape_airtable_value(citizen)}'", max_records=1)
        if not citizen_records:
            log.error(f"Citizen {citizen} not found")
            return False
        
        citizen_record = citizen_records[0]
        citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
        
        if citizen_ducats < broker_fee:
            log.error(f"Citizen {citizen} has insufficient Ducats ({citizen_ducats}) to pay broker fee ({broker_fee})")
            return False
        
        # Get the building operator (RunBy) to pay the fee to
        building_operator = "ConsiglioDeiDieci"  # Default to city government
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(office_building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            building_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found building operator {building_operator} for building {office_building_id}")
        
        # Deduct the fee from citizen
        tables['citizens'].update(citizen_record['id'], {'Ducats': citizen_ducats - broker_fee})
        
        # Add fee to building operator
        if building_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(building_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + broker_fee})
        
        # Record the transaction
        transaction_payload = {
            "Type": "import_registration_fee",
            "AssetType": "contract",
            "Asset": existing_contract_id if existing_contract_id else f"new_contract_{resource_type}_{citizen}",
            "Seller": citizen,  # Citizen pays
            "Buyer": building_operator,  # Building operator receives
            "Price": broker_fee,
            "Notes": json.dumps({
                "resource_type": resource_type,
                "target_amount": target_amount,
                "price_per_resource": price_per_resource,
                "office_building_id": office_building_id,
                "buyer_building_id": buyer_building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables['transactions'].create(transaction_payload)
        
        # Now create or update the contract
        if existing_contract_id:
            # Update existing contract
            formula = f"{{ContractId}}='{_escape_airtable_value(existing_contract_id)}'"
            contract_records = tables['contracts'].all(formula=formula, max_records=1)
            
            if not contract_records:
                log.error(f"Contract {existing_contract_id} not found")
                return False
            
            contract_record = contract_records[0]
            
            update_payload = {
                "PricePerResource": price_per_resource,
                "TargetAmount": target_amount,
                "UpdatedAt": datetime.utcnow().isoformat()
            }
            
            tables['contracts'].update(contract_record['id'], update_payload)
            log.info(f"Updated import contract {existing_contract_id} for {citizen}: {target_amount} {resource_type} at {price_per_resource} Ducats each")
            return True
        else:
            # Create new contract
            now = datetime.utcnow()
            contract_id = f"import_{resource_type}_{_escape_airtable_value(citizen)}_{int(now.timestamp())}"
            
            # Get resource name for title
            resource_name = resource_type.replace('_', ' ').title()
            
            contract_payload = {
                "ContractId": contract_id,
                "Type": "import",
                "Buyer": citizen,
                "Seller": "Italia",  # Standard foreign source
                "ResourceType": resource_type,
                "BuyerBuilding": buyer_building_id,
                "PricePerResource": price_per_resource,
                "TargetAmount": target_amount,
                "Status": "active",
                "Title": f"Import of {resource_name}",
                "Description": f"Contract to import {target_amount} units of {resource_name} at {price_per_resource} Ducats each to {buyer_building_id}.",
                "CreatedAt": now.isoformat(),
                "EndAt": (now + timedelta(days=14)).isoformat()  # Default 14 day expiration
            }
            
            created_contract = tables['contracts'].create(contract_payload)
            log.info(f"Created new import contract {contract_id} for {citizen}: {target_amount} {resource_type} at {price_per_resource} Ducats each")
            return True
            
    except Exception as e:
        log.error(f"Error creating/updating import contract: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
