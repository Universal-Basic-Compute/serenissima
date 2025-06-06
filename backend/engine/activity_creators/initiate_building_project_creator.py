import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from backend.engine.utils.activity_helpers import (
    _escape_airtable_value, 
    VENICE_TIMEZONE,
    find_path_between_buildings_or_coords, # Changed import
    get_building_record,
    get_citizen_record
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    activity_parameters: Dict[str, Any], # Renamed from details
    resource_defs: Dict, # Added
    building_type_defs: Dict, # Added
    now_venice_dt: datetime, # Added
    now_utc_dt: datetime, # Added
    transport_api_url: str, # Added
    api_base_url: str # Added
) -> Dict[str, Any]:
    """
    Create the complete initiate_building_project activity chain:
    1. A goto_location activity for travel to the land plot for inspection
    2. An inspect_land_plot activity at the land
    3. A goto_location activity for travel to the town hall or builder's workshop
    4. A submit_building_project activity to finalize the project initiation
    
    This approach creates the complete activity chain upfront.
    """
    # Extract required parameters
    land_id = activity_parameters.get('landId')
    building_type_definition = activity_parameters.get('buildingTypeDefinition') # This is a dict
    point_details = activity_parameters.get('pointDetails')
    builder_contract_details = activity_parameters.get('builderContractDetails')  # Optional
    target_office_building_id = activity_parameters.get('targetOfficeBuildingId')  # town_hall or builder's workshop
    
    # Validate required parameters
    if not land_id:
        error_msg = "Missing required detail for initiate_building_project: landId"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "missing_landId"}
    
    if not building_type_definition: # Handles None or empty dict
        error_msg = "Missing required detail for initiate_building_project: buildingTypeDefinition"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "missing_buildingTypeDefinition"}
    
    if not isinstance(building_type_definition, dict):
        error_msg = f"Parameter 'buildingTypeDefinition' must be a dictionary. Received type: {type(building_type_definition)}, value: {building_type_definition}"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "invalid_buildingTypeDefinition_type"}

    building_type_id_from_def = building_type_definition.get('id')
    if not building_type_id_from_def: # Handles missing 'id' key or if building_type_definition['id'] is None/empty string
        error_msg = f"Missing or invalid 'id' field in 'buildingTypeDefinition'. Received definition: {building_type_definition}"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "missing_or_invalid_id_in_buildingTypeDefinition"}

    if not point_details: # Assuming point_details structure is validated elsewhere or is simple enough
        error_msg = "Missing required detail for initiate_building_project: pointDetails"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "missing_pointDetails"}

    citizen = citizen_record['fields'].get('Username')
    ts = int(now_venice_dt.timestamp()) # Use passed now_venice_dt
    
    # Get current citizen position to determine first path
    citizen_position_str = citizen_record['fields'].get('Position')
    current_position = None
    if citizen_position_str:
        try:
            current_position = json.loads(citizen_position_str)
        except json.JSONDecodeError:
            error_msg = f"Could not parse citizen position: {citizen_position_str}"
            log.error(error_msg)
            return {"success": False, "message": error_msg, "activity_fields": None, "reason": "invalid_citizen_position"}
    
    # Determine the target office building (town_hall or builder's workshop)
    if not target_office_building_id:
        # Find the closest town_hall if not specified
        town_halls = []
        try:
            town_hall_formula = "Type='town_hall'"
            town_halls = tables['buildings'].all(formula=town_hall_formula)
            if not town_halls:
                error_msg = "No town_hall buildings found in the city"
                log.error(error_msg)
                return {"success": False, "message": error_msg, "activity_fields": None, "reason": "no_town_hall_found"}
            
            # Find the closest town_hall to the citizen's current position
            closest_town_hall = None
            min_distance = float('inf')
            
            for hall in town_halls:
                hall_position_str = hall['fields'].get('Position')
                if hall_position_str:
                    try:
                        hall_position = json.loads(hall_position_str)
                        if current_position and hall_position:
                            distance = _calculate_distance(current_position, hall_position)
                            if distance < min_distance:
                                min_distance = distance
                                closest_town_hall = hall
                    except json.JSONDecodeError:
                        continue
            
            if closest_town_hall:
                target_office_building_id = closest_town_hall['fields'].get('BuildingId')
            else:
                error_msg = "Could not find a suitable town_hall"
                log.error(error_msg)
                return {"success": False, "message": error_msg, "activity_fields": None, "reason": "suitable_town_hall_not_found"}
        except Exception as e:
            error_msg = f"Error finding town_hall: {e}"
            log.error(error_msg)
            return {"success": False, "message": error_msg, "activity_fields": None, "reason": "town_hall_search_error"}
    
    # Get building records for path calculation
    target_office_building_record = get_building_record(tables, target_office_building_id)
    
    if not target_office_building_record:
        error_msg = f"Could not find building record for target office: {target_office_building_id}"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "target_office_record_not_found"}
    
    # Create activity IDs
    inspect_land_activity_id = f"inspect_land_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    goto_office_activity_id = f"goto_office_for_building_project_{citizen}_{ts}"
    submit_project_activity_id = f"submit_building_project_{_escape_airtable_value(land_id)}_{citizen}_{ts}"
    
    # now_utc is now passed as now_utc_dt
    
    # Calculate path to land plot
    # For simplicity, we'll use the land's center point as the destination
    land_formula = f"{{LandId}}='{_escape_airtable_value(land_id)}'"
    land_records = tables['lands'].all(formula=land_formula, max_records=1)
    
    if not land_records:
        error_msg = f"Land {land_id} not found"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "land_not_found"}
    
    land_record = land_records[0]
    
    # La vérification de la propriété du terrain par le citoyen a été supprimée conformément à la nouvelle exigence.
    # Le citoyen n'a plus besoin de posséder le terrain pour initier le projet.
    
    # Get land position (we'll use the point_details for a more precise location)
    land_position = None
    if point_details and isinstance(point_details, dict) and 'lat' in point_details and 'lng' in point_details:
        land_position = point_details
    else:
        error_msg = "Invalid point_details format"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "invalid_point_details"}
    
    # Calculate path to land
    path_to_land = find_path_between_buildings_or_coords(current_position, land_position, api_base_url, transport_api_url=transport_api_url)
    if not path_to_land or not path_to_land.get('path'): # path_to_land itself is the path data or None
        error_msg = f"Could not find path to land {land_id}"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "path_to_land_failed"}
    
    # Calculate land inspection duration
    land_duration_seconds = path_to_land.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    inspect_start_date = now_utc_dt.isoformat() # Use passed now_utc_dt
    inspect_end_date = (now_utc_dt + timedelta(seconds=land_duration_seconds)).isoformat() # Use passed now_utc_dt
    
    # Calculate inspection activity times (15 minutes)
    land_inspection_start_date = inspect_end_date
    land_inspection_end_date = (datetime.fromisoformat(inspect_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Calculate path from land to office
    path_to_office = find_path_between_buildings_or_coords(land_position, target_office_building_record, api_base_url, transport_api_url=transport_api_url)
    if not path_to_office or not path_to_office.get('path'): # path_to_office itself is the path data or None
        error_msg = f"Could not find path from land {land_id} to office {target_office_building_id}"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "path_to_office_failed"}
    
    # Calculate office travel duration
    office_duration_seconds = path_to_office.get('timing', {}).get('durationSeconds', 1800)  # Default 30 min
    goto_office_start_date = land_inspection_end_date
    goto_office_end_date = (datetime.fromisoformat(goto_office_start_date.replace('Z', '+00:00')) + 
                           timedelta(seconds=office_duration_seconds)).isoformat()
    
    # Calculate submission activity times (15 minutes)
    submit_start_date = goto_office_end_date
    submit_end_date = (datetime.fromisoformat(goto_office_end_date.replace('Z', '+00:00')) + timedelta(minutes=15)).isoformat()
    
    # Prepare activity payloads
    activities_to_create = []
    
    # 1. Create goto_land activity
    goto_land_payload = {
        "ActivityId": f"goto_land_{_escape_airtable_value(land_id)}_{citizen}_{ts}",
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Starting from current position
        "ToBuilding": None,    # Going to a land plot, not a building
        "Path": json.dumps(path_to_land.get('path', [])),
        "Notes": json.dumps({ # Changed Details to Notes
            "landId": land_id,
            "buildingTypeDefinition": building_type_definition,
            "pointDetails": point_details,
            "activityType": "initiate_building_project",
            "nextStep": "inspect_land_plot"
        }),
        "Status": "created",
        "Title": f"Traveling to inspect land {land_id}",
        "Description": f"Traveling to land {land_id} to inspect it for building a {building_type_definition.get('name', 'building')}. First step of initiate_building_project process. Will be followed by land inspection.",
        "CreatedAt": inspect_start_date,
        "StartDate": inspect_start_date,
        "EndDate": inspect_end_date,
        "Priority": 20  # Medium-high priority for economic activities
    }
    activities_to_create.append(goto_land_payload)
    
    # 2. Create inspect_land_plot activity
    inspect_land_payload = {
        "ActivityId": inspect_land_activity_id,
        "Type": "inspect_land_plot",
        "Citizen": citizen,
        "FromBuilding": None,  # At a land plot, not a building
        "ToBuilding": None,    # At a land plot, not a building
        "Notes": json.dumps({ # Changed Details to Notes
            "landId": land_id,
            "buildingTypeDefinition": building_type_definition,
            "pointDetails": point_details,
            "builderContractDetails": builder_contract_details,
            "activityType": "initiate_building_project",
            "nextStep": "goto_office"
        }),
        "Status": "created",
        "Title": f"Inspecting land {land_id}",
        "Description": f"Inspecting land {land_id} for building a {building_type_definition.get('name', 'building')}. Second step of initiate_building_project process. Will be followed by visit to office.",
        "CreatedAt": inspect_start_date,
        "StartDate": land_inspection_start_date,
        "EndDate": land_inspection_end_date,
        "Priority": 20
    }
    activities_to_create.append(inspect_land_payload)
    
    # 3. Create goto_office activity
    goto_office_payload = {
        "ActivityId": goto_office_activity_id,
        "Type": "goto_location",
        "Citizen": citizen,
        "FromBuilding": None,  # Coming from a land plot, not a building
        "ToBuilding": target_office_building_id,
        "Path": json.dumps(path_to_office.get('path', [])),
        "Notes": json.dumps({ # Changed Details to Notes
            "landId": land_id,
            "buildingTypeDefinition": building_type_definition,
            "pointDetails": point_details,
            "builderContractDetails": builder_contract_details,
            "activityType": "initiate_building_project",
            "nextStep": "submit_building_project"
        }),
        "Status": "created",
        "Title": f"Traveling to office to submit building project",
        "Description": f"Traveling to {target_office_building_record['fields'].get('Name', target_office_building_id)} to submit building project for land {land_id}. Third step of initiate_building_project process. Will be followed by project submission.",
        "CreatedAt": inspect_start_date,
        "StartDate": goto_office_start_date,
        "EndDate": goto_office_end_date,
        "Priority": 20
    }
    activities_to_create.append(goto_office_payload)
    
    # 4. Create submit_building_project activity
    submit_project_payload = {
        "ActivityId": submit_project_activity_id,
        "Type": "submit_building_project",
        "Citizen": citizen,
        "FromBuilding": target_office_building_id,
        "ToBuilding": target_office_building_id,  # Same location
        "Notes": json.dumps({ # Changed Details to Notes
            "landId": land_id,
            "buildingTypeDefinition": building_type_definition,
            "pointDetails": point_details,
            "builderContractDetails": builder_contract_details
        }),
        "Status": "created",
        "Title": f"Submitting building project for land {land_id}",
        "Description": f"Submitting plans to build a {building_type_definition.get('name', 'building')} on land {land_id}. Final step of initiate_building_project process. Will create the building project.",
        "CreatedAt": inspect_start_date,
        "StartDate": submit_start_date,
        "EndDate": submit_end_date,
        "Priority": 20
    }
    activities_to_create.append(submit_project_payload)

    try:
        # Create all activities in sequence
        for activity_payload in activities_to_create:
            tables["activities"].create(activity_payload)
        
        log.info(f"Created complete initiate_building_project activity chain for citizen {citizen}:")
        for idx, activity in enumerate(activities_to_create, 1):
            log.info(f"  {idx}. {activity['Type']} activity {activity['ActivityId']}")
        # Return success with the fields of the first activity in the chain
        return {"success": True, "message": "Building project activity chain initiated.", "activity_fields": activities_to_create[0], "reason": "activity_chain_created"}
    except Exception as e:
        error_msg = f"Failed to create initiate_building_project activity chain: {e}"
        log.error(error_msg)
        return {"success": False, "message": error_msg, "activity_fields": None, "reason": "internal_creator_error"}

def _calculate_distance(pos1, pos2):
    """Calculate simple Euclidean distance between two positions."""
    if not (pos1 and pos2 and 'lat' in pos1 and 'lng' in pos1 and 'lat' in pos2 and 'lng' in pos2):
        return float('inf')
    
    # Simple approximation for small distances
    lat_diff = (pos1['lat'] - pos2['lat']) * 111000  # ~111km per degree of latitude
    lng_diff = (pos1['lng'] - pos2['lng']) * 111000 * 0.85  # Approximate at mid-latitudes
    return (lat_diff**2 + lng_diff**2)**0.5  # Euclidean distance in meters
