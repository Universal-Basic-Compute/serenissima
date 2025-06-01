import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE

log = logging.getLogger(__name__)

def process_manage_public_sell_contract_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the manage_public_sell_contract chain.
    
    This processor handles three types of activities:
    1. goto_location - Travel to seller building or market (no special action needed)
    2. prepare_goods_for_sale - Verify resources at seller building
    3. register_public_sell_offer - Create or update the public_sell contract
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
    if activity_type == "goto_location" and details.get("activityType") == "manage_public_sell_contract":
        # Just log and return success - the next activity is already scheduled
        next_step = details.get("nextStep", "unknown")
        log.info(f"Citizen {citizen} has completed travel for manage_public_sell_contract. Next step: {next_step}")
        return True
    
    # Handle prepare_goods_for_sale activity
    elif activity_type == "prepare_goods_for_sale":
        return _handle_prepare_goods(tables, activity_record, details)
    
    # Handle register_public_sell_offer activity
    elif activity_type == "register_public_sell_offer":
        return _create_or_update_public_sell_contract(tables, activity_record, details)
    
    else:
        log.error(f"Unexpected activity type in manage_public_sell_contract processor: {activity_type}")
        return False

def _handle_prepare_goods(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Handle the prepare_goods_for_sale activity.
    Verify that the seller has enough resources at the building.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    seller_building_id = fields.get('FromBuilding')
    resource_type = details.get('resourceType')
    target_amount = details.get('targetAmount')
    
    if not (citizen and seller_building_id and resource_type and target_amount is not None):
        log.error(f"Missing data for prepare_goods_for_sale: citizen={citizen}, seller_building_id={seller_building_id}, resource_type={resource_type}, target_amount={target_amount}")
        return False
    
    # Check if the building has enough resources of this type owned by the citizen
    formula = f"AND({{AssetType}}='building', {{Asset}}='{_escape_airtable_value(seller_building_id)}', {{Type}}='{_escape_airtable_value(resource_type)}', {{Owner}}='{_escape_airtable_value(citizen)}')"
    try:
        resource_records = tables['resources'].all(formula=formula)
        total_available = sum(float(record['fields'].get('Count', 0)) for record in resource_records)
        
        if total_available < target_amount:
            log.warning(f"Citizen {citizen} has only {total_available} of {resource_type} at building {seller_building_id}, but wants to sell {target_amount}")
            # We'll continue anyway, as the contract can be created with more than available
            # This allows for restocking over time
        
        log.info(f"Citizen {citizen} has prepared {min(total_available, target_amount)} of {resource_type} (of {target_amount} desired) at {seller_building_id} for sale")
        return True
    except Exception as e:
        log.error(f"Error checking resources for prepare_goods_for_sale: {e}")
        return False

def _create_or_update_public_sell_contract(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """Create or update a public_sell contract when the register_public_sell_offer activity is processed."""
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    market_building_id = fields.get('FromBuilding')  # We're at the market now
    resource_type = details.get('resourceType')
    target_amount = details.get('targetAmount')
    price_per_resource = details.get('pricePerResource')
    seller_building_id = details.get('sellerBuildingId')
    existing_contract_id = details.get('contractId')
    
    if not (citizen and market_building_id and resource_type and 
            target_amount is not None and price_per_resource is not None and seller_building_id):
        log.error(f"Missing data for register_public_sell_offer: citizen={citizen}, market={market_building_id}, resource={resource_type}, amount={target_amount}, price={price_per_resource}, seller_building={seller_building_id}")
        return False
    
    # Calculate market fee (typically 5% of total value, minimum 10 Ducats)
    total_value = float(price_per_resource) * float(target_amount)
    market_fee = max(10, total_value * 0.05)  # 5% fee, minimum 10 Ducats
    
    # Check if citizen has enough Ducats to pay the fee
    try:
        citizen_records = tables['citizens'].all(formula=f"{{Username}}='{_escape_airtable_value(citizen)}'", max_records=1)
        if not citizen_records:
            log.error(f"Citizen {citizen} not found")
            return False
        
        citizen_record = citizen_records[0]
        citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
        
        if citizen_ducats < market_fee:
            log.error(f"Citizen {citizen} has insufficient Ducats ({citizen_ducats}) to pay market fee ({market_fee})")
            return False
        
        # Deduct the fee
        tables['citizens'].update(citizen_record['id'], {'Ducats': citizen_ducats - market_fee})
        
        # Record the transaction
        transaction_payload = {
            "Type": "market_registration_fee",
            "AssetType": "contract",
            "Asset": existing_contract_id if existing_contract_id else f"new_contract_{resource_type}_{citizen}",
            "Seller": citizen,  # Citizen pays
            "Buyer": "ConsiglioDeiDieci",  # City receives
            "Price": market_fee,
            "Notes": json.dumps({
                "resource_type": resource_type,
                "target_amount": target_amount,
                "price_per_resource": price_per_resource,
                "market_building_id": market_building_id,
                "seller_building_id": seller_building_id
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
            log.info(f"Updated public_sell contract {existing_contract_id} for {citizen}: {target_amount} {resource_type} at {price_per_resource} Ducats each")
            return True
        else:
            # Create new contract
            now = datetime.utcnow()
            contract_id = f"public_sell_{resource_type}_{_escape_airtable_value(citizen)}_{int(now.timestamp())}"
            
            # Get resource name for title
            resource_name = resource_type.replace('_', ' ').title()
            
            contract_payload = {
                "ContractId": contract_id,
                "Type": "public_sell",
                "Seller": citizen,
                "Buyer": "public",  # Public contract
                "ResourceType": resource_type,
                "SellerBuilding": seller_building_id,
                "PricePerResource": price_per_resource,
                "TargetAmount": target_amount,
                "Status": "active",
                "Title": f"Quality {resource_name} for Sale",
                "Description": f"Offering {target_amount} units of {resource_name} at {price_per_resource} Ducats each. Available at {seller_building_id}.",
                "CreatedAt": now.isoformat(),
                "EndAt": (now + timedelta(days=30)).isoformat()  # Default 30 day expiration
            }
            
            created_contract = tables['contracts'].create(contract_payload)
            log.info(f"Created new public_sell contract {contract_id} for {citizen}: {target_amount} {resource_type} at {price_per_resource} Ducats each")
            return True
            
    except Exception as e:
        log.error(f"Error creating/updating public_sell contract: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
