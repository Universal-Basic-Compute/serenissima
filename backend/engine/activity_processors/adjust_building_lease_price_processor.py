"""
Activity Processor for 'file_building_lease_adjustment'.

This processor handles the final step of adjusting a building's lease price
after the citizen has arrived at the designated filing location.
"""

import logging
import json
from typing import Dict, Any
from datetime import datetime

from backend.engine.utils.activity_helpers import (
    get_building_record,
    get_citizen_record,
    # update_citizen_ducats, # Retiré d'ici
    # create_notification_record, # Removed from here
    LogColors,
    VENICE_TIMEZONE,
    update_citizen_ducats # Import from activity_helpers
)
from backend.engine.utils.notification_helpers import create_notification # Added import
# from backend.engine.utils.financial_helpers import update_citizen_ducats # Original incorrect import

log = logging.getLogger(__name__)

FILING_FEE = 5.0 # Cost in Ducats to file the adjustment

def process_file_building_lease_adjustment_fn(
    tables: Dict[str, Any],
    activity_record: Dict[str, Any],
    building_type_defs: Dict[str, Any], # Not directly used, but part of standard signature
    resource_defs: Dict[str, Any]       # Not directly used, but part of standard signature
) -> bool:
    """
    Processes the 'file_building_lease_adjustment' activity.
    Updates the building's LeasePrice and charges a filing fee.
    """
    fields = activity_record['fields']
    citizen_username = fields.get('Citizen')
    activity_guid = fields.get('ActivityId', activity_record['id'])
    
    notes_str = fields.get('Notes') # Changed Details to Notes
    if not notes_str:
        log.error(f"{LogColors.FAIL}Activity {activity_guid} for {citizen_username} is missing 'Notes'. Cannot process lease adjustment.{LogColors.ENDC}") # Changed Details to Notes
        return False

    try:
        details = json.loads(notes_str) # Changed details_str to notes_str
    except json.JSONDecodeError:
        log.error(f"{LogColors.FAIL}Failed to parse 'Notes' JSON for activity {activity_guid}: {notes_str}{LogColors.ENDC}") # Changed Details to Notes
        return False

    building_id_to_adjust = details.get('buildingIdToAdjust')
    new_lease_price = details.get('newLeasePrice')
    # strategy = details.get('strategy') # Strategy might be used for logging or future complex fee structures
    original_land_owner = details.get('originalLandOwner') # The citizen who initiated the chain

    if not all([building_id_to_adjust, isinstance(new_lease_price, (int, float)), original_land_owner]):
        log.error(f"{LogColors.FAIL}Activity {activity_guid} 'Details' missing required fields (buildingIdToAdjust, newLeasePrice, originalLandOwner). Details: {details}{LogColors.ENDC}")
        return False

    if citizen_username != original_land_owner:
        log.error(f"{LogColors.FAIL}Citizen {citizen_username} completing 'file_building_lease_adjustment' is not the original land owner {original_land_owner} who initiated it. Aborting.{LogColors.ENDC}")
        return False

    # Fetch citizen record to charge fee
    citizen_record = get_citizen_record(tables, citizen_username)
    if not citizen_record:
        log.error(f"{LogColors.FAIL}Citizen {citizen_username} not found. Cannot process lease adjustment {activity_guid}.{LogColors.ENDC}")
        return False

    # Fetch building record to update
    building_to_adjust_airtable_record = tables['buildings'].first(formula=f"{{BuildingId}}='{building_id_to_adjust}'")
    if not building_to_adjust_airtable_record:
        log.error(f"{LogColors.FAIL}Building {building_id_to_adjust} not found. Cannot adjust lease price for activity {activity_guid}.{LogColors.ENDC}")
        return False
        
    # Verify land ownership again at point of processing (important!)
    land_id_of_building = building_to_adjust_airtable_record['fields'].get('LandId')
    if not land_id_of_building:
        log.error(f"{LogColors.FAIL}Building {building_id_to_adjust} does not have a LandId. Cannot adjust lease price.{LogColors.ENDC}")
        return False
    land_record = tables['lands'].first(formula=f"{{LandId}}='{land_id_of_building}'")
    if not land_record or land_record['fields'].get('Owner') != citizen_username:
        log.error(f"{LogColors.FAIL}{citizen_username} no longer owns the land {land_id_of_building} for building {building_id_to_adjust} at time of processing. Cannot adjust lease price.{LogColors.ENDC}")
        return False

    # Charge filing fee
    if not update_citizen_ducats(tables, citizen_record['id'], -FILING_FEE, f"Filing fee for lease adjustment of building {building_id_to_adjust}"):
        log.error(f"{LogColors.FAIL}{citizen_username} has insufficient funds for filing fee ({FILING_FEE} Ducats) for lease adjustment of {building_id_to_adjust}.{LogColors.ENDC}")
        # Create a problem for the citizen
        from backend.engine.utils.problem_helpers import create_problem_record
        create_problem_record(
            tables, citizen_username, "insufficient_funds",
            f"Insufficient Ducats to pay {FILING_FEE} filing fee for adjusting lease price of building {building_id_to_adjust}.",
            asset_type="building", asset_id=building_id_to_adjust, severity="medium"
        )
        return False

    # Update LeasePrice
    try:
        old_lease_price = building_to_adjust_airtable_record['fields'].get('LeasePrice', 0.0)
        tables['buildings'].update(building_to_adjust_airtable_record['id'], {'LeasePrice': new_lease_price})
        log.info(f"{LogColors.OKGREEN}Successfully updated LeasePrice for building {building_id_to_adjust} from {old_lease_price} to {new_lease_price} by {citizen_username}.{LogColors.ENDC}")

        # Create notification for the building operator (if different from landowner)
        building_operator_username = building_to_adjust_airtable_record['fields'].get('RunBy')
        building_owner_username = building_to_adjust_airtable_record['fields'].get('Owner') # This is the owner of the building structure itself
        
        # Notify the building operator if they are not the land owner (who is citizen_username)
        if building_operator_username and building_operator_username != citizen_username:
            notif_content_operator = (f"The landowner, {citizen_username}, has adjusted the lease price for the building "
                                      f"'{building_to_adjust_airtable_record['fields'].get('Name', building_id_to_adjust)}' "
                                      f"that you operate. New lease price: {new_lease_price:.2f} Ducats.")
            create_notification(tables, building_operator_username, "lease_price_changed_operator", notif_content_operator,
                                       asset_type="building", asset_id=building_id_to_adjust,
                                       details_json=json.dumps({"buildingId": building_id_to_adjust, "newLeasePrice": new_lease_price, "landOwner": citizen_username}))
        
        # Notify the building owner (if they are not the land owner)
        if building_owner_username and building_owner_username != citizen_username:
            notif_content_owner = (f"The landowner, {citizen_username}, has adjusted the lease price for the building "
                                   f"'{building_to_adjust_airtable_record['fields'].get('Name', building_id_to_adjust)}' "
                                   f"that you own (but is on their land). New lease price: {new_lease_price:.2f} Ducats.")
            create_notification(tables, building_owner_username, "lease_price_changed_owner", notif_content_owner,
                                       asset_type="building", asset_id=building_id_to_adjust,
                                       details_json=json.dumps({"buildingId": building_id_to_adjust, "newLeasePrice": new_lease_price, "landOwner": citizen_username}))

        # Notification for the land owner (self-notification for their records)
        notif_content_landowner = (f"You have successfully adjusted the lease price for building "
                                   f"'{building_to_adjust_airtable_record['fields'].get('Name', building_id_to_adjust)}' "
                                   f"on your land {land_id_of_building} to {new_lease_price:.2f} Ducats.")
        create_notification(tables, citizen_username, "lease_price_adjusted_self", notif_content_landowner,
                                   asset_type="building", asset_id=building_id_to_adjust,
                                   details_json=json.dumps({"buildingId": building_id_to_adjust, "newLeasePrice": new_lease_price}))
        return True
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to update LeasePrice for building {building_id_to_adjust}: {e}{LogColors.ENDC}", exc_info=True)
        return False
