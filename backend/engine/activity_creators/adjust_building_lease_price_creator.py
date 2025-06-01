"""
Activity Creator for 'adjust_building_lease_price'.

This activity allows a landowner to adjust the LeasePrice of a building on their land.
It involves the citizen going to a relevant office (e.g., their home, a business they run, or a public_archives)
to file the adjustment.
"""

import logging
from typing import Dict, Any, Optional
from backend.engine.utils.activity_helpers import (
    get_citizen_home,
    get_citizen_businesses_run,
    get_building_record,
    create_activity_record,
    LogColors
)

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_record: Dict[str, Any],
    activity_params: Dict[str, Any],
    resource_defs: Dict[str, Any],
    building_type_defs: Dict[str, Any],
    now_venice_dt: Any,
    now_utc_dt: Any,
    transport_api_url: str,
    api_base_url: str
) -> bool:
    """
    Tries to create the initial 'goto_location' activity for adjusting a building's lease price.

    Expected activity_params:
    - buildingId (str): The BuildingId of the building whose lease price is being adjusted.
    - newLeasePrice (float): The new lease price.
    - strategy (str): The pricing strategy used.
    - targetOfficeBuildingId (str, optional): The BuildingId of a specific office (e.g., public_archives) to file the adjustment.
    """
    citizen_username = citizen_record['fields'].get('Username')
    building_id_to_adjust = activity_params.get('buildingId')
    new_lease_price = activity_params.get('newLeasePrice')
    strategy = activity_params.get('strategy')
    target_office_building_id_param = activity_params.get('targetOfficeBuildingId')

    if not all([citizen_username, building_id_to_adjust, isinstance(new_lease_price, (int, float)), strategy]):
        log.error(f"{LogColors.FAIL}Missing required parameters for adjust_building_lease_price for {citizen_username}. Params: {activity_params}{LogColors.ENDC}")
        return False

    # Validate the building being adjusted
    building_to_adjust_record = get_building_record(tables, building_id_to_adjust)
    if not building_to_adjust_record:
        log.error(f"{LogColors.FAIL}Building {building_id_to_adjust} not found for lease price adjustment by {citizen_username}.{LogColors.ENDC}")
        return False
    
    # Ensure the citizen initiating this owns the land the building is on
    land_id_of_building = building_to_adjust_record['fields'].get('LandId')
    if not land_id_of_building:
        log.error(f"{LogColors.FAIL}Building {building_id_to_adjust} does not have a LandId. Cannot adjust lease price.{LogColors.ENDC}")
        return False
        
    land_record = tables['lands'].first(formula=f"{{LandId}}='{land_id_of_building}'")
    if not land_record or land_record['fields'].get('Owner') != citizen_username:
        log.error(f"{LogColors.FAIL}{citizen_username} does not own the land {land_id_of_building} where building {building_id_to_adjust} is located. Cannot adjust lease price.{LogColors.ENDC}")
        return False

    # Determine the target building for filing the adjustment
    target_building_for_filing_id = None
    target_building_for_filing_record = None

    if target_office_building_id_param:
        target_building_for_filing_record = get_building_record(tables, target_office_building_id_param)
        if target_building_for_filing_record:
            target_building_for_filing_id = target_office_building_id_param
            log.info(f"Using specified target office {target_building_for_filing_id} for {citizen_username} to file lease adjustment.")
        else:
            log.warning(f"{LogColors.WARNING}Specified targetOfficeBuildingId {target_office_building_id_param} not found. Falling back.{LogColors.ENDC}")

    if not target_building_for_filing_id:
        # Try citizen's home
        home_building_record = get_citizen_home(tables, citizen_username)
        if home_building_record:
            target_building_for_filing_id = home_building_record['fields'].get('BuildingId')
            target_building_for_filing_record = home_building_record
            log.info(f"Using citizen's home {target_building_for_filing_id} for {citizen_username} to file lease adjustment.")
        else:
            # Try a business run by the citizen
            businesses_run = get_citizen_businesses_run(tables, citizen_username)
            if businesses_run:
                # Prefer a business that is a known office type, or just the first one
                office_types = ['public_archives', 'courthouse', 'town_hall', 'notary_office'] # Add more as needed
                office_building = next((b for b in businesses_run if b['fields'].get('Type') in office_types), None)
                if office_building:
                    target_building_for_filing_id = office_building['fields'].get('BuildingId')
                    target_building_for_filing_record = office_building
                else:
                    target_building_for_filing_id = businesses_run[0]['fields'].get('BuildingId')
                    target_building_for_filing_record = businesses_run[0]
                log.info(f"Using citizen's business {target_building_for_filing_id} for {citizen_username} to file lease adjustment.")
    
    if not target_building_for_filing_id or not target_building_for_filing_record:
        log.error(f"{LogColors.FAIL}Could not determine a target building for {citizen_username} to file lease adjustment. No home, run business, or valid office specified.{LogColors.ENDC}")
        return False

    # Prepare details for the 'goto_location' activity
    # The 'goto_location' processor will use these to create the subsequent 'file_building_lease_adjustment' activity
    next_activity_parameters = {
        "buildingIdToAdjust": building_id_to_adjust,
        "newLeasePrice": new_lease_price,
        "strategy": strategy,
        "originalLandOwner": citizen_username # For verification in the processor
    }
    
    activity_details_for_goto = {
        "nextActivityType": "file_building_lease_adjustment",
        "nextActivityParameters": next_activity_parameters,
        "targetReason": f"file adjustment for building lease {building_id_to_adjust}"
    }

    from backend.engine.activity_creators.goto_location_activity_creator import try_create as try_create_goto_location
    
    goto_activity_params = {
        "targetBuildingId": target_building_for_filing_id,
        "details": activity_details_for_goto # Pass the chain details here
    }

    log.info(f"{LogColors.OKBLUE}Attempting to create 'goto_location' for {citizen_username} to {target_building_for_filing_id} for lease adjustment of {building_id_to_adjust}.{LogColors.ENDC}")
    
    return try_create_goto_location(
        tables,
        citizen_record,
        goto_activity_params, # Use the specifically prepared params for goto_location
        resource_defs,
        building_type_defs,
        now_venice_dt,
        now_utc_dt,
        transport_api_url,
        api_base_url
    )
