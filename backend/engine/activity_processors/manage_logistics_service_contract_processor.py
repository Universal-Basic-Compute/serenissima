import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_manage_logistics_service_contract_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the manage_logistics_service_contract chain.
    
    This processor handles three types of activities:
    1. goto_location - Travel to client building or guild hall (no special action needed)
    2. assess_logistics_needs - Verify logistics needs at client building
    3. register_logistics_service_contract - Create or update the logistics_service_request contract
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
    if activity_type == "goto_location" and details.get("activityType") == "manage_logistics_service_contract":
        # Just log and return success - the next activity is already scheduled
        next_step = details.get("nextStep", "unknown")
        log.info(f"Citizen {citizen} has completed travel for manage_logistics_service_contract. Next step: {next_step}")
        return True
    
    # Handle assess_logistics_needs activity
    elif activity_type == "assess_logistics_needs":
        return _handle_assess_logistics_needs(tables, activity_record, details)
    
    # Handle register_logistics_service_contract activity
    elif activity_type == "register_logistics_service_contract":
        return _create_or_update_logistics_contract(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in manage_logistics_service_contract processor: {activity_type}")
        return False

def _handle_assess_logistics_needs(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Handle the assess_logistics_needs activity.
    Verify that the business has legitimate logistics needs.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    client_building_id = fields.get('FromBuilding')
    resource_type = details.get('resourceType')  # Optional for general logistics
    
    if not (citizen and client_building_id):
        log.error(f"Missing data for assess_logistics_needs: citizen={citizen}, client_building_id={client_building_id}")
        return False
    
    # Check if the citizen is the owner or operator of the building
    try:
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(client_building_id)}'"
        building_records = tables['buildings'].all(formula=building_formula, max_records=1)
        
        if not building_records:
            log.error(f"Building {client_building_id} not found")
            return False
        
        building_record = building_records[0]
        building_owner = building_record['fields'].get('Owner')
        building_operator = building_record['fields'].get('RunBy')
        
        if citizen != building_owner and citizen != building_operator:
            log.warning(f"Citizen {citizen} is neither the owner nor operator of building {client_building_id}")
            # We'll continue anyway, but log the warning
        
        # Check if the building is a business that might need logistics services
        building_type = building_record['fields'].get('Type')
        building_category = building_record['fields'].get('Category')
        
        if building_category != 'business':
            log.warning(f"Building {client_building_id} is not a business (category: {building_category}). Logistics services may not be appropriate.")
            # Continue anyway, as non-business buildings might still need logistics
        
        log.info(f"Assessed logistics needs for building {client_building_id} (type: {building_type}). Proceeding with contract registration.")
        return True
    except Exception as e:
        log.error(f"Error assessing logistics needs: {e}")
        return False

def _create_or_update_logistics_contract(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Create or update a logistics_service_request contract when the register_logistics_service_contract activity is processed."""
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    guild_hall_id = fields.get('FromBuilding')  # We're at the porter guild hall now
    resource_type = details.get('resourceType')  # Optional for general logistics
    service_fee_per_unit = details.get('serviceFeePerUnit')
    client_building_id = details.get('clientBuildingId')
    existing_contract_id = details.get('contractId')
    
    if not (citizen and guild_hall_id and service_fee_per_unit is not None and client_building_id):
        log.error(f"Missing data for register_logistics_service_contract: citizen={citizen}, guild_hall={guild_hall_id}, serviceFeePerUnit={service_fee_per_unit}, client_building={client_building_id}")
        return False
    
    # Calculate registration fee (typically 2% of estimated monthly value, minimum 20 Ducats)
    # Estimate monthly value as 100 units * fee per unit
    estimated_monthly_value = 100 * float(service_fee_per_unit)
    registration_fee = max(20, estimated_monthly_value * 0.02)  # 2% fee, minimum 20 Ducats
    
    # Check if citizen has enough Ducats to pay the fee
    try:
        citizen_records = tables['citizens'].all(formula=f"{{Username}}='{_escape_airtable_value(citizen)}'", max_records=1)
        if not citizen_records:
            log.error(f"Citizen {citizen} not found")
            return False
        
        citizen_record = citizen_records[0]
        citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
        
        if citizen_ducats < registration_fee:
            log.error(f"Citizen {citizen} has insufficient Ducats ({citizen_ducats}) to pay registration fee ({registration_fee})")
            return False
        
        # Get the guild hall operator (RunBy) to pay the fee to
        guild_operator = "ConsiglioDeiDieci"  # Default to city government
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(guild_hall_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            guild_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found guild operator {guild_operator} for guild hall {guild_hall_id}")
        
        # Deduct the fee from citizen
        tables['citizens'].update(citizen_record['id'], {'Ducats': citizen_ducats - registration_fee})
        
        # Add fee to guild operator
        if guild_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(guild_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + registration_fee})
        
        # Record the transaction
        transaction_payload = {
            "Type": "logistics_registration_fee",
            "AssetType": "contract",
            "Asset": existing_contract_id if existing_contract_id else f"new_contract_logistics_{citizen}",
            "Seller": citizen,  # Citizen pays
            "Buyer": guild_operator,  # Guild operator receives
            "Price": registration_fee,
            "Notes": json.dumps({
                "resource_type": resource_type,
                "service_fee_per_unit": service_fee_per_unit,
                "guild_hall_id": guild_hall_id,
                "client_building_id": client_building_id
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
                "ServiceFeePerUnit": service_fee_per_unit,
                "UpdatedAt": datetime.utcnow().isoformat()
            }
            
            tables['contracts'].update(contract_record['id'], update_payload)
            log.info(f"Updated logistics_service_request contract {existing_contract_id} for {citizen}: service fee {service_fee_per_unit} Ducats per unit")
            return True
        else:
            # Create new contract
            now = datetime.utcnow()
            contract_id = f"logistics_service_{_escape_airtable_value(citizen)}_{int(now.timestamp())}"
            
            # Get client building name for title
            client_building_name = "Unknown Building"
            client_building_formula = f"{{BuildingId}}='{_escape_airtable_value(client_building_id)}'"
            client_buildings = tables["buildings"].all(formula=client_building_formula, max_records=1)
            if client_buildings:
                client_building_name = client_buildings[0]['fields'].get('Name', client_building_id)
            
            contract_payload = {
                "ContractId": contract_id,
                "Type": "logistics_service_request",
                "Buyer": citizen,  # Client requesting logistics services
                "Seller": guild_operator,  # Porter Guild operator providing services
                "ResourceType": resource_type,  # Optional, can be null for general logistics
                "BuyerBuilding": client_building_id,  # Client's building
                "SellerBuilding": guild_hall_id,  # Porter Guild Hall
                "ServiceFeePerUnit": service_fee_per_unit,
                "Status": "active",
                "Title": f"Logistics Services for {client_building_name}",
                "Description": f"Contract for logistics services at {service_fee_per_unit} Ducats per unit" + 
                               (f" of {resource_type}" if resource_type else "") + 
                               f" for {client_building_name}.",
                "CreatedAt": now.isoformat(),
                "EndAt": (now + timedelta(days=30)).isoformat()  # Default 30 day expiration
            }
            
            created_contract = tables['contracts'].create(contract_payload)
            log.info(f"Created new logistics_service_request contract {contract_id} for {citizen}: service fee {service_fee_per_unit} Ducats per unit")
            return True
            
    except Exception as e:
        log.error(f"Error creating/updating logistics_service_request contract: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
