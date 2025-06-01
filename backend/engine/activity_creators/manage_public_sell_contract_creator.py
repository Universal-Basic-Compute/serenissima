import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings,
    get_building_record
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    details: Dict[str, Any]
) -> bool:
    """
    Create both activities in the manage_public_sell_contract chain at once:
    1. A goto_location activity for travel to the seller's building (to prepare goods)
    2. A goto_location activity for travel to the market location
    3. A register_public_sell_offer activity that will execute after arrival at market
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    contract_id = details.get('contractId')  # Optional for new contracts
    resource_type = details.get('resourceType')
    price_per_resource = details.get('pricePerResource')
    target_amount = details.get('targetAmount')
    seller_building_id = details.get('sellerBuildingId')
    target_market_building_id = details.get('targetMarketBuildingId')
    
    # Validate required parameters
    if not (resource_type and price_per_resource is not None and target_amount is not None and 
            seller_building_id and target_market_building_id):
        log.error(f"Missing required details for manage_public_sell_contract: resourceType, pricePerResource, targetAmount, sellerBuildingId, or targetMarketBuildingId")
        return False

    citizen = citizen_record['fields'].get('Username')
    ts = int(datetime.now(VENICE_TIMEZONE).timestamp())
    
    # Get building records for path calculation
    seller_building_record = get_building_record(tables, seller_building_id)
    market_building_record = get_building_record(tables, target_market_building_id)
    
    if not seller_building_record or not market_building_record:
        log.error(f"Could not find building records for {seller_building_id} or {target_market_building_id}")
        return False
    
    # Get current citizen position to determine first path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse citizen position: {citizen_position_str}")
            return False
    
    # Determine if we need to go to seller building first or if citizen is already there
    citizen_at_seller_building = False
    if current_position:
        seller_position = _get_building_position(seller_building_record)
        if seller_position:
            # Simple check if positions are close enough (within ~10 meters)
            distance = _calculate_distance(current_position, seller_position)
            citizen_at_seller_building = distance < 10
    
    # Create activity IDs
    prepare_activity_id = f"prepare_goods_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    goto_market_activity_id = f"goto_market_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    register_activity_id = f"register_sell_offer_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    
    now_utc = datetime.utcnow()
    
    # Calculate activity times
    if citizen_at_seller_building:
        # Skip the first goto_location if already at seller building
        prepare_start_date = now_utc.isoformat()
        prepare_end_date = (now_utc + timedelta(minutes=15)).isoformat()  # 15 min to prepare goods
        goto_market_start_date = prepare_end_date
    else:
        # Need to go to seller building first
        # Calculate path to seller building
        path_to_seller = find_path_between_buildings(None, seller_building_record, current_position=current_position)
        if not path_to_seller or not path_to_seller.get('path'):
            log.error(f"Could not find path to seller building {seller_building_id}")
            return False
        
        prepare_start_date = now_utc.isoformat()
        # Calculate travel duration to seller building
        seller_duration_seconds = path_to_seller.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
        prepare_end_date = (now_utc + timedelta(seconds=seller_duration_seconds)).isoformat()
        goto_market_start_date = (now_utc + timedelta(seconds=seller_duration_seconds) + timedelta(minutes=15)).isoformat()
    
    # Calculate path from seller building to market
    path_to_market = find_path_between_buildings(seller_building_record, market_building_record)
    if not path_to_market or not path_to_market.get('path'):
        log.error(f"Could not find path from seller building {seller_building_id} to market {target_market_building_id}")
        return False
    
    # Calculate market travel duration
    market_duration_seconds = path_to_market.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_market_end_date = (datetime.fromisoformat(goto_market_start_date.replace('Z', '+00:00')) + 
                           timedelta(seconds=market_duration_seconds)).isoformat()
    
    # Calculate registration activity times (15 minutes after arrival at market)
    register_start_date = goto_market_end_date
    register_end_date = (datetime.fromisoformat(goto_market_end_date.replace('Z', '+00:00')) + 
                         timedelta(minutes=15)).isoformat()
    
    # Prepare activity payloads
    activities_to_create = []
    
    # 1. Create goto_seller_building activity (if needed)
    if not citizen_at_seller_building:
        goto_seller_payload = {
            "ActivityId": prepare_activity_id,
            "Type": "goto_location",
            "Citizen": citizen,
            "FromBuilding": None,  # Starting from current position
            "ToBuilding": seller_building_id,
            "Path": json.dumps(path_to_seller.get('path', [])),
            "Details": json.dumps({
                "resourceType": resource_type,
                "activityType": "manage_public_sell_contract",
                "nextStep": "prepare_goods"
            }),
            "Status": "created",
            "Title": f"Traveling to prepare {resource_type} for sale",
            "Description": f"Traveling to {seller_building_record['fields'].get('Name', seller_building_id)} to prepare {target_amount} {resource_type} for sale",
            "Notes": f"First step of manage_public_sell_contract process. Will be followed by goods preparation.",
            "CreatedAt": prepare_start_date,
            "StartDate": prepare_start_date,
            "EndDate": prepare_end_date,
            "Priority": 20  # Medium-high priority for economic activities
        }
        activities_to_create.append(goto_seller_payload)
    
    # 2. Create prepare_goods activity (short duration at seller building)
    prepare_goods_payload = {
        "ActivityId": f"prepare_goods_{_escape_airtable_value(resource_type)}_{citizen}_{ts}",
        "Type": "prepare_goods_for_sale",
        "Citizen": citizen,
        "FromBuilding": seller_building_id,
        "ToBuilding": seller_building_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "contractId": contract_id,
            "activityType": "manage_public_sell_contract",
            "nextStep": "goto_market"
        }),
        "Status": "created",
        "Title": f"Preparing {resource_type} for sale",
        "Description": f"Preparing {target_amount} {resource_type} for sale at {price_per_resource} Ducats each",
        "Notes": f"{'Modifying' if contract_id else 'Creating new'} public sell contract for {resource_type}",
        "CreatedAt": prepare_start_date,
        "StartDate": prepare_start_date if citizen_at_seller_building else prepare_end_date,
        "EndDate": goto_market_start_date,
        "Priority": 20
    }
    activities_to_create.append(prepare_goods_payload)
    
    # 3. Create goto_market activity
    goto_market_payload = {
        "ActivityId": goto_market_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": seller_building_id,
        "ToBuilding": target_market_building_id,
        "Path": json.dumps(path_to_market.get('path', [])),
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "sellerBuildingId": seller_building_id,
            "activityType": "manage_public_sell_contract",
            "nextStep": "register_public_sell_offer"
        }),
        "Status": "created",
        "Title": f"Traveling to market to {'modify' if contract_id else 'register'} sale offer",
        "Description": f"Traveling to {market_building_record['fields'].get('Name', target_market_building_id)} to {'modify' if contract_id else 'register'} sale offer for {target_amount} {resource_type}",
        "Notes": f"Second step of manage_public_sell_contract process. Will be followed by contract registration.",
        "CreatedAt": prepare_start_date,
        "StartDate": goto_market_start_date,
        "EndDate": goto_market_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_market_payload)
    
    # 4. Create register_public_sell_offer activity
    register_payload = {
        "ActivityId": register_activity_id,
        "Type": "register_public_sell_offer",
        "Citizen": citizen,
        "FromBuilding": target_market_building_id,
        "ToBuilding": target_market_building_id,  # Same location
        "Details": json.dumps({
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "sellerBuildingId": seller_building_id
        }),
        "Status": "created",
        "Title": f"{'Modifying' if contract_id else 'Registering'} sale offer for {resource_type}",
        "Description": f"{'Modifying' if contract_id else 'Registering'} public sale offer for {target_amount} {resource_type} at {price_per_resource} Ducats each",
        "Notes": f"Final step of manage_public_sell_contract process. Will create/update public_sell contract.",
        "CreatedAt": prepare_start_date,
        "StartDate": register_start_date,
        "EndDate": register_end_date,
        "Priority": 20
    }
    activities_to_create.append(register_payload)

    try:
        # Create all activities in sequence
        for activity_payload in activities_to_create:
            tables["activities"].create(activity_payload)
        
        log.info(f"Created complete manage_public_sell_contract activity chain for citizen {citizen}:")
        for idx, activity in enumerate(activities_to_create, 1):
            log.info(f"  {idx}. {activity['Type']} activity {activity['ActivityId']}")
        return True
    except Exception as e:
        log.error(f"Failed to create manage_public_sell_contract activity chain: {e}")
        return False

def _get_building_position(building_record):
    """Extract position from building record."""
    position_str = building_record['fields'].get('Position')
    if position_str:
        try:
            return json.loads(position_str)
        except json.JSONDecodeError:
            return None
    return None

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
