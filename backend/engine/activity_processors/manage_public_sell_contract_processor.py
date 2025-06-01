import logging
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    get_building_record,
    get_citizen_record
)

log = logging.getLogger(__name__)

def process_manage_public_sell_contract_fn(
    tables: Dict[str, Table],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any],
    resource_defs: Dict[str, Any]
) -> bool:
    """
    Process activities in the manage_public_sell_contract chain.
    
    This processor handles:
    1. prepare_goods_for_sale - Verify resources are available at seller building
    2. register_public_sell_offer - Create or update the public_sell contract
    
    The goto_location activities are handled by the standard activity processor.
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    
    if activity_type == "prepare_goods_for_sale":
        return _process_prepare_goods_for_sale(tables, activity_record, resource_defs)
    elif activity_type == "register_public_sell_offer":
        return _process_register_public_sell_offer(tables, activity_record, resource_defs)
    else:
        log.error(f"Unexpected activity type in manage_public_sell_contract processor: {activity_type}")
        return False

def _process_prepare_goods_for_sale(
    tables: Dict[str, Table],
    activity_record: Dict[str, Any],
    resource_defs: Dict[str, Any]
) -> bool:
    """
    Process the prepare_goods_for_sale activity.
    Verify that the resources are available at the seller building.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    seller_building_id = fields.get('FromBuilding')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for prepare_goods_for_sale: {e}")
        return False
    
    resource_type = details.get('resourceType')
    target_amount = details.get('targetAmount')
    
    if not (citizen and seller_building_id and resource_type and target_amount):
        log.error(f"Missing data for prepare_goods_for_sale: citizen={citizen}, building={seller_building_id}, resource={resource_type}, amount={target_amount}")
        return False
    
    # Check if the resources are available at the seller building
    try:
        # Get the building record
        building_record = get_building_record(tables, seller_building_id)
        if not building_record:
            log.error(f"Building {seller_building_id} not found")
            return False
        
        # Check if citizen is owner or operator
        building_owner = building_record['fields'].get('Owner')
        building_operator = building_record['fields'].get('RunBy')
        
        if citizen != building_owner and citizen != building_operator:
            log.error(f"Citizen {citizen} is neither owner nor operator of building {seller_building_id}")
            return False
        
        # Check if the resources are available
        resource_owner = building_operator if building_operator else building_owner
        
        formula = (f"AND({{Asset}}='{_escape_airtable_value(seller_building_id)}', "
                  f"{{AssetType}}='building', "
                  f"{{Type}}='{_escape_airtable_value(resource_type)}', "
                  f"{{Owner}}='{_escape_airtable_value(resource_owner)}')")
        
        resources = tables['resources'].all(formula=formula)
        
        total_available = 0
        for resource in resources:
            total_available += float(resource['fields'].get('Count', 0))
        
        if total_available < target_amount:
            log.error(f"Insufficient {resource_type} at {seller_building_id}. Available: {total_available}, Required: {target_amount}")
            return False
        
        log.info(f"Citizen {citizen} has prepared {target_amount} units of {resource_type} at {seller_building_id} for public sale")
        return True
    except Exception as e:
        log.error(f"Error in prepare_goods_for_sale: {e}")
        return False

def _process_register_public_sell_offer(
    tables: Dict[str, Table],
    activity_record: Dict[str, Any],
    resource_defs: Dict[str, Any]
) -> bool:
    """
    Process the register_public_sell_offer activity.
    Create or update the public_sell contract.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    market_building_id = fields.get('FromBuilding')
    details_str = fields.get('Details')
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for register_public_sell_offer: {e}")
        return False
    
    contract_id = details.get('contractId')  # May be None for new contracts
    resource_type = details.get('resourceType')
    price_per_resource = details.get('pricePerResource')
    target_amount = details.get('targetAmount')
    seller_building_id = details.get('sellerBuildingId')
    
    if not (citizen and market_building_id and resource_type and price_per_resource is not None and 
            target_amount is not None and seller_building_id):
        log.error(f"Missing data for register_public_sell_offer")
        return False
    
    try:
        # Get the market building record
        market_record = get_building_record(tables, market_building_id)
        if not market_record:
            log.error(f"Market building {market_building_id} not found")
            return False
        
        # Get the seller building record
        seller_record = get_building_record(tables, seller_building_id)
        if not seller_record:
            log.error(f"Seller building {seller_building_id} not found")
            return False
        
        # Get the citizen record
        citizen_record = get_citizen_record(tables, citizen)
        if not citizen_record:
            log.error(f"Citizen {citizen} not found")
            return False
        
        # Calculate market fee (typically 1% of total value, minimum 5 Ducats)
        total_value = price_per_resource * target_amount
        market_fee = max(5, total_value * 0.01)  # 1% fee, minimum 5 Ducats
        
        # Check if citizen has enough Ducats to pay the fee
        citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
        
        if citizen_ducats < market_fee:
            log.error(f"Citizen {citizen} has insufficient Ducats ({citizen_ducats}) to pay market fee ({market_fee})")
            return False
        
        # Get the market operator to pay the fee to
        market_operator = "ConsiglioDeiDieci"  # Default to city government
        if market_record['fields'].get('RunBy'):
            market_operator = market_record['fields'].get('RunBy')
        
        # Deduct the fee from citizen
        tables['citizens'].update(citizen_record['id'], {'Ducats': citizen_ducats - market_fee})
        
        # Add fee to market operator if not the city
        if market_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(market_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + market_fee})
        
        # Record the market fee transaction
        now = datetime.now(timezone.utc)
        transaction_fields = {
            "Type": "market_registration_fee",
            "AssetType": "contract",
            "Asset": contract_id if contract_id else f"new_contract_{uuid.uuid4()}",
            "Seller": citizen,  # Citizen pays
            "Buyer": market_operator,  # Market operator receives
            "Price": market_fee,
            "Notes": json.dumps({
                "resource_type": resource_type,
                "price_per_resource": price_per_resource,
                "target_amount": target_amount,
                "seller_building_id": seller_building_id,
                "market_building_id": market_building_id
            }),
            "CreatedAt": now.isoformat(),
            "ExecutedAt": now.isoformat()
        }
        tables["transactions"].create(transaction_fields)
        
        # Create or update the contract
        if contract_id:
            # Update existing contract
            contract_formula = f"{{ContractId}}='{_escape_airtable_value(contract_id)}'"
            existing_contracts = tables["contracts"].all(formula=contract_formula, max_records=1)
            
            if not existing_contracts:
                log.error(f"Contract {contract_id} not found for update")
                return False
            
            existing_contract = existing_contracts[0]
            
            # Update the contract
            contract_update = {
                "PricePerResource": price_per_resource,
                "TargetAmount": target_amount,
                "UpdatedAt": now.isoformat()
            }
            
            tables["contracts"].update(existing_contract['id'], contract_update)
            log.info(f"Updated public_sell contract {contract_id} for {citizen}")
        else:
            # Create new contract
            # Generate a deterministic contract ID
            new_contract_id = f"public_sell_{seller_building_id}_{resource_type}_{int(now.timestamp())}"
            
            # Get resource name from resource_defs
            resource_name = resource_type
            if resource_type in resource_defs:
                resource_name = resource_defs[resource_type].get('name', resource_type)
            
            # Create contract with 30-day expiration
            expiration_date = (now + timezone.timedelta(days=30)).isoformat()
            
            contract_payload = {
                "ContractId": new_contract_id,
                "Type": "public_sell",
                "Buyer": "public",  # Public contract
                "Seller": citizen,
                "ResourceType": resource_type,
                "SellerBuilding": seller_building_id,
                "Title": f"Public Sale: {resource_name}",
                "Description": f"Public offer to sell {target_amount} units of {resource_name} at {price_per_resource} Ducats each from {seller_record['fields'].get('Name', seller_building_id)}",
                "TargetAmount": target_amount,
                "PricePerResource": price_per_resource,
                "Status": "active",
                "CreatedAt": now.isoformat(),
                "EndAt": expiration_date
            }
            
            tables["contracts"].create(contract_payload)
            log.info(f"Created new public_sell contract {new_contract_id} for {citizen}")
        
        log.info(f"Successfully registered public sell offer for {target_amount} units of {resource_type} at {price_per_resource} Ducats each")
        log.info(f"Collected market fee of {market_fee} Ducats from {citizen} paid to {market_operator}")
        
        return True
    except Exception as e:
        log.error(f"Error in register_public_sell_offer: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
