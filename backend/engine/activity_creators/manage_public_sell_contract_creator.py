import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings_or_coords, # Changed from find_path_between_buildings
    get_building_record,
    get_citizen_record
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    activity_type_param: str, # Added - though not directly used if creator is specific
    details: Dict[str, Any],  # This is activity_parameters from dispatcher
    resource_defs: Dict[str, Any], # Added
    building_type_defs: Dict[str, Any], # Added
    now_venice_dt: datetime, # Added
    now_utc_dt_param: datetime, # Added - renamed to avoid conflict with internal now_utc
    transport_api_url: str, # Added
    api_base_url: str # Added
) -> Optional[List[Dict[str, Any]]]: # Return type changed to Optional[List[Dict]]
    """
    Create the complete manage_public_sell_contract activity chain:
    1. A goto_location activity for travel to the seller's building to prepare goods
    2. A prepare_goods_for_sale activity at the seller's building
    3. A goto_location activity for travel to the market
    4. A register_public_sell_offer activity to finalize the contract creation/modification
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    contract_id = details.get('contractId')  # Optional, only if modifying existing contract
    resource_type = details.get('resourceType')
    price_per_resource = details.get('pricePerResource')
    target_amount = details.get('targetAmount')
    seller_building_id = details.get('sellerBuildingId')
    target_market_building_id = details.get('targetMarketBuildingId')
    
    # Validate required parameters
    if not (resource_type and price_per_resource is not None and target_amount is not None and
            seller_building_id and target_market_building_id):
        log.error(f"Missing required details for manage_public_sell_contract: resourceType, pricePerResource, targetAmount, sellerBuildingId, or targetMarketBuildingId")
        return None # Changed to None

    citizen_username = citizen_record['fields'].get('Username')
    # Use the passed now_venice_dt for timestamp consistency
    ts = int(now_venice_dt.timestamp())
    
    # Get current citizen position to determine first path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            log.error(f"Could not parse citizen position: {citizen_position_str}")
            return None # Changed to None
    
    # Get building records for path calculation
    seller_building_record = get_building_record(tables, seller_building_id)
    market_building_record = get_building_record(tables, target_market_building_id)
    
    if not seller_building_record or not market_building_record:
        log.error(f"Could not find building records for seller ({seller_building_id}) or market ({target_market_building_id})")
        return None # Changed to None
    
    # Verify citizen is owner or operator of seller building
    seller_owner = seller_building_record['fields'].get('Owner')
    seller_operator = seller_building_record['fields'].get('RunBy')
    
    if citizen_username != seller_owner and citizen_username != seller_operator:
        log.error(f"Citizen {citizen_username} is neither owner nor operator of building {seller_building_id}")
        return None # Changed to None
    
    # Create activity IDs
    goto_seller_activity_id = f"goto_seller_for_contract_{citizen_username}_{ts}"
    prepare_goods_activity_id = f"prepare_goods_for_sale_{citizen_username}_{ts}"
    goto_market_activity_id = f"goto_market_for_contract_{citizen_username}_{ts}"
    register_offer_activity_id = f"register_public_sell_offer_{citizen_username}_{ts}"
    
    # Use the passed now_utc_dt_param
    now_utc = now_utc_dt_param 
    
    # Calculate path to seller building
    # Pass api_base_url to find_path_between_buildings_or_coords
    path_to_seller = find_path_between_buildings_or_coords(current_position, seller_building_record, api_base_url)
    if not path_to_seller or not path_to_seller.get('path'):
        log.error(f"Could not find path to seller building {seller_building_id}")
        return None # Changed to None
    
    # Calculate seller travel duration
    seller_duration_seconds = path_to_seller.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_seller_start_date = now_utc.isoformat() # Start immediately
    goto_seller_end_date = (now_utc + timedelta(seconds=seller_duration_seconds)).isoformat()
    
    # Calculate preparation activity times (15 minutes)
    prepare_goods_start_date = goto_seller_end_date
    prepare_goods_end_date = (datetime.fromisoformat(goto_seller_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Calculate path from seller to market
    # Pass api_base_url to find_path_between_buildings_or_coords
    path_to_market = find_path_between_buildings_or_coords(seller_building_record, market_building_record, api_base_url)
    if not path_to_market or not path_to_market.get('path'):
        log.error(f"Could not find path from seller building {seller_building_id} to market {target_market_building_id}")
        return None # Changed to None
    
    # Calculate market travel duration
    market_duration_seconds = path_to_market.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_market_start_date = prepare_goods_end_date
    goto_market_end_date = (datetime.fromisoformat(goto_market_start_date.replace('Z', '+00:00')) + 
                           timedelta(seconds=market_duration_seconds)).isoformat()
    
    # Calculate registration activity times (15 minutes)
    register_offer_start_date = goto_market_end_date
    register_offer_end_date = (datetime.fromisoformat(goto_market_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Prepare activity payloads
    activities_to_create = []
    
    # 1. Create goto_seller activity
    goto_seller_payload = {
        "ActivityId": goto_seller_activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": seller_building_id,
        "Path": json.dumps(path_to_seller.get('path', [])),
        "Notes": json.dumps({ # Changed Details to Notes
            "contractId": contract_id,
            "resourceType": resource_type,
            "pricePerResource": price_per_resource,
            "targetAmount": target_amount,
            "sellerBuildingId": seller_building_id,
            "targetMarketBuildingId": target_market_building_id,
            "activityType": "manage_public_sell_contract",
            "nextStep": "prepare_goods_for_sale"
        }),
        "Status": "created",
        "Title": f"Traveling to prepare goods for sale",
        "Description": f"Traveling to {seller_building_record['fields'].get('Name', seller_building_id)} to prepare goods for public sale",
        "Notes": f"First step of manage_public_sell_contract process. Will be followed by goods preparation.",
        "CreatedAt": goto_seller_start_date,
        "StartDate": goto_seller_start_date,
        "EndDate": goto_seller_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    activities_to_create.append(goto_seller_payload)
    
    # 2. Create prepare_goods_for_sale activity
    prepare_goods_payload = {
        "ActivityId": prepare_goods_activity_id,
        "Type": "prepare_goods_for_sale",
        "Citizen": citizen_username,
        "FromBuilding": seller_building_id,
        "ToBuilding": seller_building_id,  # Same location
        "Notes": json.dumps({ # Changed Details to Notes
            "contractId": contract_id,
            "resourceType": resource_type,
            "pricePerResource": price_per_resource,
            "targetAmount": target_amount,
            "sellerBuildingId": seller_building_id,
            "targetMarketBuildingId": target_market_building_id,
            "activityType": "manage_public_sell_contract",
            "nextStep": "goto_market"
        }),
        "Status": "created",
        "Title": f"Preparing {resource_type} for public sale",
        "Description": f"Preparing {target_amount} units of {resource_type} for public sale at {price_per_resource} Ducats each",
        "Notes": f"Second step of manage_public_sell_contract process. Will be followed by travel to market.",
        "CreatedAt": goto_seller_start_date,
        "StartDate": prepare_goods_start_date,
        "EndDate": prepare_goods_end_date,
        "Priority": 20
    }
    activities_to_create.append(prepare_goods_payload)
    
    # 3. Create goto_market activity
    goto_market_payload = {
        "ActivityId": goto_market_activity_id,
        "Type": "goto_location",
        "Citizen": citizen_username,
        "FromBuilding": seller_building_id,
        "ToBuilding": target_market_building_id,
        "Path": json.dumps(path_to_market.get('path', [])),
        "Notes": json.dumps({ # Changed Details to Notes
            "contractId": contract_id,
            "resourceType": resource_type,
            "pricePerResource": price_per_resource,
            "targetAmount": target_amount,
            "sellerBuildingId": seller_building_id,
            "targetMarketBuildingId": target_market_building_id,
            "activityType": "manage_public_sell_contract",
            "nextStep": "register_public_sell_offer"
        }),
        "Status": "created",
        "Title": f"Traveling to market to register sale offer",
        "Description": f"Traveling to {market_building_record['fields'].get('Name', target_market_building_id)} to register public sale offer",
        "Notes": f"Third step of manage_public_sell_contract process. Will be followed by offer registration.",
        "CreatedAt": goto_seller_start_date,
        "StartDate": goto_market_start_date,
        "EndDate": goto_market_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_market_payload)
    
    # 4. Create register_public_sell_offer activity
    register_offer_payload = {
        "ActivityId": register_offer_activity_id,
        "Type": "register_public_sell_offer",
        "Citizen": citizen_username,
        "FromBuilding": target_market_building_id,
        "ToBuilding": target_market_building_id,  # Same location
        "Notes": json.dumps({ # Changed Details to Notes
            "contractId": contract_id,
            "resourceType": resource_type,
            "pricePerResource": price_per_resource,
            "targetAmount": target_amount,
            "sellerBuildingId": seller_building_id,
            "targetMarketBuildingId": target_market_building_id
        }),
        "Status": "created",
        "Title": f"Registering public sale offer for {resource_type}",
        "Description": f"Registering offer to sell {target_amount} units of {resource_type} at {price_per_resource} Ducats each",
        "Notes": f"Final step of manage_public_sell_contract process. Will create or update the public_sell contract.",
        "CreatedAt": goto_seller_start_date,
        "StartDate": register_offer_start_date,
        "EndDate": register_offer_end_date,
        "Priority": 20
    }
    activities_to_create.append(register_offer_payload)

    # The creator should now return the list of payloads, and the dispatcher will handle creation.
    log.info(f"Prepared manage_public_sell_contract activity chain for citizen {citizen_username}:")
    for idx, activity_payload_log in enumerate(activities_to_create, 1):
        log.info(f"  {idx}. {activity_payload_log['Type']} activity payload {activity_payload_log['ActivityId']} prepared.")
    return activities_to_create # Return the list of payloads

    # The try-except block for Airtable creation is removed as creation is deferred to the dispatcher.
    # Any errors during payload preparation (like pathfinding) are already handled and return None.
