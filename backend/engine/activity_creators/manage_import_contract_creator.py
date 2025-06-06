import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List, Union # Added Union
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings_or_coords, # Changed from find_path_between_buildings
    get_building_record,
    get_closest_building_of_type, # Added for finding office
    _get_building_position_coords # Added for reference position
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
) -> Union[List[Dict[str, Any]], Dict[str, Any]]: # Return type changed to allow error dict
    """
    Create the complete manage_import_contract activity chain at once:
    1. A goto_location activity for travel to the buyer's building (to assess needs)
    2. An assess_import_needs activity at the buyer's building
    3. A goto_location activity for travel to the customs house or broker's office
    4. A register_import_agreement activity that will execute after arrival
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    contract_id = details.get('contractId')  # Optional for new contracts
    resource_type = details.get('resourceType')
    price_per_resource = details.get('pricePerResource')
    target_amount = details.get('targetAmount')
    buyer_building_id = details.get('buyerBuildingId')
    target_office_building_id = details.get('targetOfficeBuildingId')  # customs_house or broker_s_office
    
    # Validate required parameters (targetOfficeBuildingId will be handled/found below)
    if not (resource_type and price_per_resource is not None and target_amount is not None):
        err_msg = "Missing required details for manage_import_contract: resourceType, pricePerResource, or targetAmount"
        log.error(err_msg)
        return {"success": False, "message": err_msg, "reason": "missing_contract_details"}

    citizen = citizen_record['fields'].get('Username')
    # Use the passed now_venice_dt for timestamp consistency
    ts = int(now_venice_dt.timestamp())

    # Get buyer building record if specified (needed for reference position if office not specified)
    buyer_asset_record = None # Can be a building or land
    reference_pos_for_office_search = None

    if buyer_building_id:
        # Try fetching as a building first
        buyer_asset_record = get_building_record(tables, buyer_building_id)
        if buyer_asset_record:
            log.info(f"Buyer asset {buyer_building_id} is a building. Using its position for office search.")
            reference_pos_for_office_search = _get_building_position_coords(buyer_asset_record) # Use _get_building_position_coords
        else:
            # If not a building, try fetching as land
            from backend.engine.utils.activity_helpers import get_land_record # Local import
            land_record = get_land_record(tables, buyer_building_id)
            if land_record:
                log.info(f"Buyer asset {buyer_building_id} is land. Trying to find a building on it for reference position.")
                # Find a building on this land to use as reference
                buildings_on_land = tables['buildings'].all(formula=f"{{LandId}}='{_escape_airtable_value(buyer_building_id)}'", max_records=1)
                if buildings_on_land:
                    reference_pos_for_office_search = _get_building_position_coords(buildings_on_land[0])
                    log.info(f"Using position of building {buildings_on_land[0]['fields'].get('BuildingId')} on land {buyer_building_id} for office search.")
                else: # No building on land, try to get land's centroid if available (requires polygon data access, complex here)
                      # For now, fallback to citizen position if land has no buildings.
                    log.warning(f"Land {buyer_building_id} has no buildings. Will use citizen's position for office search.")
            else:
                # Not a known building or land ID
                err_msg = f"Could not find building or land record for buyer asset ID: {buyer_building_id}"
                log.error(err_msg)
                return {"success": False, "message": err_msg, "reason": "buyer_asset_not_found"}

    # Determine target_office_building_id if not provided
    if not target_office_building_id:
        log.info(f"targetOfficeBuildingId not provided for manage_import_contract. Attempting to find a suitable office.")
        
        if not reference_pos_for_office_search: # Fallback to citizen's current position if no buyer asset position
            log.info("No reference position from buyer asset. Using citizen's current position for office search.")
            citizen_pos_str_office = citizen_record['fields'].get('Position')
            if citizen_pos_str_office:
                try:
                    reference_pos_for_office_search = json.loads(citizen_pos_str_office)
                except json.JSONDecodeError:
                    log.warning(f"Could not parse citizen position for office search: {citizen_pos_str_office}")
        
        if not reference_pos_for_office_search:
            err_msg = "Cannot determine reference position to find a suitable trade office (no buyer asset position and no citizen position)."
            log.error(err_msg)
            return {"success": False, "message": err_msg, "reason": "cannot_determine_reference_position_for_office"}

        log.info(f"Searching for closest office near reference position: {reference_pos_for_office_search}")
        # Try finding customs_house first, then broker_s_office
        found_office_rec = get_closest_building_of_type(tables, reference_pos_for_office_search, "customs_house")
        if not found_office_rec:
            log.info("No customs_house found nearby. Trying broker_s_office.")
            found_office_rec = get_closest_building_of_type(tables, reference_pos_for_office_search, "broker_s_office")
        
        if found_office_rec and found_office_rec['fields'].get('BuildingId'):
            target_office_building_id = found_office_rec['fields']['BuildingId']
            log.info(f"Dynamically selected office: {target_office_building_id} ({found_office_rec['fields'].get('Name', 'Unknown Name')})")
        else:
            err_msg = "No suitable trade office (customs_house or broker_s_office) found automatically."
            log.error(err_msg)
            return {"success": False, "message": err_msg, "reason": "no_trade_office_found"}

    # Now, target_office_building_id should be set (either from input or dynamically found)
    # Get building record for the determined office
    office_building_record = get_building_record(tables, target_office_building_id)
    if not office_building_record: # This check is now more critical
        err_msg = f"Could not find office building record for determined/provided ID: {target_office_building_id}"
        log.error(err_msg)
        return {"success": False, "message": err_msg, "reason": "office_building_not_found"}
    
    
    # Get current citizen position to determine first path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None # This is the citizen's current position for pathfinding
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            # If citizen position is invalid, we might still proceed if office was found via buyer asset.
            # Pathfinding will fail later if current_position is None and needed.
            log.warning(f"Could not parse current citizen position: {citizen_position_str}. Pathfinding might fail if needed.")
            # Not returning error here, let pathfinding handle it.
    
    if not current_position:
        # This is a more critical issue if we need to pathfind from citizen's location.
        err_msg = "Citizen's current position is unknown or invalid. Cannot create travel activities."
        log.error(err_msg)
        return {"success": False, "message": err_msg, "reason": "invalid_citizen_current_position"}

    # Create activity IDs
    # assess_activity_id = f"assess_import_needs_{_escape_airtable_value(resource_type)}_{citizen}_{ts}" # Assess step removed
    goto_office_activity_id = f"goto_office_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    register_activity_id = f"register_import_{_escape_airtable_value(resource_type)}_{citizen}_{ts}"
    
    # Use the passed now_utc_dt_param
    now_utc = now_utc_dt_param
    
    # Skip the buyer building step entirely and go directly to the office
    # Calculate activity times for direct path to office
    # Pass api_base_url to find_path_between_buildings_or_coords
    path_to_office = find_path_between_buildings_or_coords(current_position, office_building_record, api_base_url)
    if not path_to_office or not path_to_office.get('path'):
        err_msg = f"Could not find path to office building {target_office_building_id}"
        log.error(err_msg)
        return {"success": False, "message": err_msg, "reason": "path_to_office_failed"}
    
    # Set start times
    # assess_start_date = now_utc.isoformat() # Assess step removed
    chain_created_at = now_utc.isoformat() # Timestamp for the creation of this chain

    goto_office_start_date = chain_created_at # Travel to office starts immediately
    
    # Calculate office travel duration
    office_duration_seconds = path_to_office.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_office_end_date_dt = datetime.fromisoformat(goto_office_start_date.replace('Z', '+00:00')) + timedelta(seconds=office_duration_seconds)
    goto_office_end_date = goto_office_end_date_dt.isoformat()
    
    # Calculate registration activity times (15 minutes after arrival at office)
    register_start_date = goto_office_end_date # Starts when travel ends
    register_end_date_dt = goto_office_end_date_dt + timedelta(minutes=15)
    register_end_date = register_end_date_dt.isoformat()
    
    # Prepare activity payloads
    activities_to_create = []
    
    # Create goto_office activity (direct from current position)
    goto_office_payload = {
        "ActivityId": goto_office_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": target_office_building_id,
        "Path": json.dumps(path_to_office.get('path', [])),
        "Notes": json.dumps({ # Changed Details to Notes
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "buyerBuildingId": buyer_building_id,
            "activityType": "manage_import_contract",
            "nextStep": "register_import_agreement"
        }),
        "Status": "created",
        "Title": f"Traveling to {'modify' if contract_id else 'register'} import contract",
        "Description": f"Traveling to {office_building_record['fields'].get('Name', target_office_building_id)} to {'modify' if contract_id else 'register'} import contract for {target_amount} {resource_type}",
        # "Notes": f"Travel to office for manage_import_contract. Will be followed by contract registration.", # This descriptive note is covered by Description. The JSON Notes above is needed by the processor.
        "CreatedAt": chain_created_at, # Use chain creation time
        "StartDate": goto_office_start_date,
        "EndDate": goto_office_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_office_payload)
    
    # 4. Create register_import_agreement activity
    register_payload = {
        "ActivityId": register_activity_id,
        "Type": "register_import_agreement",
        "Citizen": citizen,
        "FromBuilding": target_office_building_id,
        "ToBuilding": target_office_building_id,  # Same location
        "Notes": json.dumps({ # Changed Details to Notes
            "resourceType": resource_type,
            "targetAmount": target_amount,
            "pricePerResource": price_per_resource,
            "contractId": contract_id,
            "buyerBuildingId": buyer_building_id
        }),
        "Status": "created",
        "Title": f"{'Modifying' if contract_id else 'Registering'} import contract for {resource_type}",
        "Description": f"{'Modifying' if contract_id else 'Registering'} import contract for {target_amount} {resource_type} at {price_per_resource} Ducats each",
        # "Notes": f"Final step of manage_import_contract process. Will create/update import contract.", # This descriptive note is covered by Description. The JSON Notes above is needed by the processor.
        "CreatedAt": chain_created_at, # Use chain creation time
        "StartDate": register_start_date,
        "EndDate": register_end_date,
        "Priority": 20
    }
    activities_to_create.append(register_payload)

    # The creator should now return the list of payloads, and the dispatcher will handle creation.
    log.info(f"Prepared manage_import_contract activity chain for citizen {citizen}:")
    for idx, activity_payload_log in enumerate(activities_to_create, 1):
        log.info(f"  {idx}. {activity_payload_log['Type']} activity payload {activity_payload_log['ActivityId']} prepared.")
    return activities_to_create # Return the list of payloads

    # The try-except block for Airtable creation is removed as creation is deferred to the dispatcher.
    # Any errors during payload preparation (like pathfinding) are already handled and return an error dict.

def _get_building_position(building_record: Dict[str, Any]) -> Optional[Dict[str, float]]: # Added type hints
    """Extract position from building record. Uses _get_building_position_coords."""
    # This function is now a simple wrapper or can be replaced by direct calls to _get_building_position_coords
    return _get_building_position_coords(building_record)

def _calculate_distance(pos1, pos2): # This seems unused now, consider removing if _calculate_distance_meters is preferred
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
