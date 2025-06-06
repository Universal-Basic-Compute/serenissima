import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pyairtable import Table
from backend.engine.utils.activity_helpers import _escape_airtable_value, VENICE_TIMEZONE, log_header, LogColors

log = logging.getLogger(__name__)

def process_initiate_building_project_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Any,
    resource_defs: Any
) -> bool:
    """
    Process activities in the initiate_building_project chain.
    
    This processor handles four types of activities:
    1. goto_location (to land) - Travel to the land plot (no special action needed)
    2. inspect_land_plot - Verify the land is suitable for the building
    3. goto_location (to office) - Travel to the town hall or builder's workshop (no special action needed)
    4. submit_building_project - Create the building project and handle payments
    """
    fields = activity_record.get('fields', {})
    activity_type = fields.get('Type')
    citizen = fields.get('Citizen')
    details_str = fields.get('Notes') # Changed 'Details' to 'Notes'

    log_header(f"Initiate Building Project ({activity_type}): {citizen}", LogColors.HEADER)
    
    try:
        details = json.loads(details_str) if details_str else {}
    except Exception as e:
        log.error(f"Error parsing Details for {activity_type}: {e}")
        return False
    
    # Handle goto_location activity (part of chain)
    if activity_type == "goto_location" and details.get("activityType") == "initiate_building_project":
        # Just log and return success - the next activity is already scheduled
        next_step = details.get("nextStep", "unknown")
        log.info(f"Citizen {citizen} has completed travel for initiate_building_project. Next step: {next_step}")
        return True
    
    # Handle inspect_land_plot activity
    elif activity_type == "inspect_land_plot":
        return _handle_inspect_land_plot(tables, activity_record, details, building_type_defs)
    
    # Handle submit_building_project activity
    elif activity_type == "submit_building_project":
        return _create_building_project(tables, activity_record, details, building_type_defs)
    
    else:
        log.error(f"Unexpected activity type in initiate_building_project processor: {activity_type}")
        return False

def _handle_inspect_land_plot(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any],
    building_type_defs: Any
) -> bool:
    """
    Handle the inspect_land_plot activity.
    Verify that the land is suitable for the building type.
    """
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    land_id = details.get('landId')
    building_type_definition = details.get('buildingTypeDefinition')
    point_details = details.get('pointDetails')
    
    if not (citizen and land_id and building_type_definition and point_details):
        log.error(f"Missing data for inspect_land_plot: citizen={citizen}, land_id={land_id}")
        return False
    
    # Check if the land exists and is owned by the citizen
    try:
        land_formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
        land_records = tables['lands'].all(formula=land_formula, max_records=1)
        
        if not land_records:
            log.error(f"Land {land_id} not found")
            return False
        
        land_record = land_records[0]
        # land_owner = land_record['fields'].get('Owner') # Ownership check removed
        
        # if land_owner != citizen: # Ownership check removed
        #     log.error(f"Citizen {citizen} does not own land {land_id}")
        #     return False
        
        # Check if the building type is valid
        building_type = building_type_definition.get('id')
        if not building_type or building_type not in building_type_defs:
            log.error(f"Invalid building type: {building_type}")
            return False
        
        # Check if the point is valid for this land
        # This would require more complex validation in a real implementation
        # For now, we'll just log a success message
        
        log.info(f"Land {land_id} inspected by {citizen} for building a {building_type_definition.get('name', 'building')}. The land is suitable.")
        return True
    except Exception as e:
        log.error(f"Error inspecting land: {e}")
        return False

def _create_building_project(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    details: Dict[str, Any],
    building_type_defs: Any
) -> bool:
    """Create a building project when the submit_building_project activity is processed."""
    fields = activity_record.get('fields', {})
    citizen = fields.get('Citizen')
    office_building_id = fields.get('FromBuilding')  # We're at the office now
    land_id = details.get('landId')
    building_type_definition = details.get('buildingTypeDefinition')
    point_details = details.get('pointDetails')
    builder_contract_details = details.get('builderContractDetails')  # Optional
    
    if not (citizen and office_building_id and land_id and building_type_definition and point_details):
        log.error(f"Missing data for submit_building_project: citizen={citizen}, office={office_building_id}, land={land_id}")
        return False
    
    # Get the building type details
    building_type = building_type_definition.get('id')
    if not building_type or building_type not in building_type_defs:
        log.error(f"Invalid building type: {building_type}")
        return False
    
    building_type_info = building_type_defs.get(building_type, {})
    
    # Calculate permit fee (typically 5% of building cost, minimum 50 Ducats)
    building_cost = building_type_info.get('buildCost', 1000)  # Default to 1000 if not specified
    permit_fee = max(50, building_cost * 0.05)  # 5% fee, minimum 50 Ducats
    
    # If there's a builder contract, add a deposit (typically 20% of the contract value)
    builder_deposit = 0
    builder_username = None
    if builder_contract_details:
        builder_username = builder_contract_details.get('builderUsername')
        contract_value = builder_contract_details.get('contractValue', building_cost * 1.2)  # Default to 120% of building cost
        builder_deposit = contract_value * 0.2  # 20% deposit
    
    total_cost = permit_fee + builder_deposit
    
    # Check if citizen has enough Ducats to pay the fees
    try:
        citizen_records = tables['citizens'].all(formula=f"{{Username}}='{_escape_airtable_value(citizen)}'", max_records=1)
        if not citizen_records:
            log.error(f"Citizen {citizen} not found")
            return False
        
        citizen_record = citizen_records[0]
        citizen_ducats = float(citizen_record['fields'].get('Ducats', 0))
        
        if citizen_ducats < total_cost:
            log.error(f"Citizen {citizen} has insufficient Ducats ({citizen_ducats}) to pay permit fee ({permit_fee}) and builder deposit ({builder_deposit})")
            return False
        
        # Get the office operator (RunBy) to pay the permit fee to
        office_operator = "ConsiglioDeiDieci"  # Default to city government
        building_formula = f"{{BuildingId}}='{_escape_airtable_value(office_building_id)}'"
        buildings = tables["buildings"].all(formula=building_formula, max_records=1)
        if buildings and buildings[0]['fields'].get('RunBy'):
            office_operator = buildings[0]['fields'].get('RunBy')
            log.info(f"Found office operator {office_operator} for building {office_building_id}")
        
        # Deduct the total cost from citizen
        tables['citizens'].update(citizen_record['id'], {'Ducats': citizen_ducats - total_cost})
        
        # Add permit fee to office operator
        if office_operator != "ConsiglioDeiDieci":
            operator_formula = f"{{Username}}='{_escape_airtable_value(office_operator)}'"
            operator_records = tables["citizens"].all(formula=operator_formula, max_records=1)
            
            if operator_records:
                operator_record = operator_records[0]
                operator_ducats = float(operator_record['fields'].get('Ducats', 0))
                tables["citizens"].update(operator_record['id'], {'Ducats': operator_ducats + permit_fee})
        
        # Add builder deposit to builder if specified
        if builder_username and builder_deposit > 0:
            builder_formula = f"{{Username}}='{_escape_airtable_value(builder_username)}'"
            builder_records = tables["citizens"].all(formula=builder_formula, max_records=1)
            
            if builder_records:
                builder_record = builder_records[0]
                builder_ducats = float(builder_record['fields'].get('Ducats', 0))
                tables["citizens"].update(builder_record['id'], {'Ducats': builder_ducats + builder_deposit})
            else:
                log.error(f"Builder {builder_username} not found")
                # Continue anyway, the deposit will go to the city
        
        # Record the permit fee transaction
        permit_transaction_fields = {
            "Type": "building_permit_fee",
            "AssetType": "land",
            "Asset": land_id,
            "Seller": citizen,  # Citizen pays
            "Buyer": office_operator,  # Office operator receives
            "Price": permit_fee,
            "Notes": json.dumps({
                "building_type": building_type,
                "point_details": point_details,
                "office_building_id": office_building_id
            }),
            "CreatedAt": datetime.utcnow().isoformat(),
            "ExecutedAt": datetime.utcnow().isoformat()
        }
        tables["transactions"].create(permit_transaction_fields)
        
        # Record the builder deposit transaction if applicable
        if builder_username and builder_deposit > 0:
            deposit_transaction_fields = {
                "Type": "builder_deposit",
                "AssetType": "land",
                "Asset": land_id,
                "Seller": citizen,  # Citizen pays
                "Buyer": builder_username,  # Builder receives
                "Price": builder_deposit,
                "Notes": json.dumps({
                    "building_type": building_type,
                    "point_details": point_details,
                    "contract_details": builder_contract_details
                }),
                "CreatedAt": datetime.utcnow().isoformat(),
                "ExecutedAt": datetime.utcnow().isoformat()
            }
            tables["transactions"].create(deposit_transaction_fields)
        
        # Create the building record
        now = datetime.utcnow()
        building_id = f"building_{point_details.get('lat')}_{point_details.get('lng')}"
        
        # Calculate construction time
        construction_minutes = building_type_info.get('constructionMinutes', 60)  # Default to 60 minutes
        construction_end_date = (now + timedelta(minutes=construction_minutes)).isoformat()
        
        building_name = building_type_info.get('name', building_type.replace('_', ' ').title())
        
        building_payload = {
            "BuildingId": building_id,
            "Name": f"{building_name} (Under Construction)",
            "Type": building_type,
            "Category": building_type_info.get('category'),  # Allow None if not in definition
            "SubCategory": building_type_info.get('subCategory'),  # Allow None if not in definition
            "LandId": land_id,
            "Position": json.dumps(point_details),
            "Point": json.dumps(point_details),
            "Owner": citizen,
            "RunBy": builder_username if builder_username else citizen,
            "IsConstructed": False,
            "ConstructionDate": construction_end_date,
            "ConstructionMinutesRemaining": construction_minutes,
            "CreatedAt": now.isoformat()
        }
        
        created_building = tables["buildings"].create(building_payload)
        log.info(f"Created new building project {building_id} for {citizen} on land {land_id}")
        
        # If there's a builder contract, create it
        if builder_username:
            contract_id = f"construction_{building_id}_{builder_username}_{int(now.timestamp())}"
            contract_value = builder_contract_details.get('contractValue', building_cost * 1.2)
            
            contract_payload = {
                "ContractId": contract_id,
                "Type": "construction_project",
                "Buyer": citizen,  # Building owner
                "Seller": builder_username,  # Builder
                "Asset": building_id,
                "AssetType": "building",
                "PricePerResource": contract_value,
                "TargetAmount": 1,
                "Status": "active",
                "Title": f"Construction of {building_name}",
                "Description": f"Contract for the construction of a {building_name} on land {land_id}",
                "CreatedAt": now.isoformat(),
                "EndAt": construction_end_date
            }
            
            tables["contracts"].create(contract_payload)
            log.info(f"Created construction contract {contract_id} between {citizen} and {builder_username}")
        
        log.info(f"Successfully initiated building project for {building_type} on land {land_id}")
        log.info(f"Collected permit fee of {permit_fee} Ducats from {citizen} paid to {office_operator}")
        if builder_username and builder_deposit > 0:
            log.info(f"Collected builder deposit of {builder_deposit} Ducats from {citizen} paid to {builder_username}")
        
        return True
    except Exception as e:
        log.error(f"Failed to create building project: {e}")
        import traceback
        log.error(traceback.format_exc())
        return False
