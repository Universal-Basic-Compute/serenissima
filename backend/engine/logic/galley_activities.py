import logging
import json
import datetime
import pytz
import uuid
import re
from collections import defaultdict
from typing import Dict, List, Optional, Any
from pyairtable import Table

# Import helpers from the utils module
from backend.engine.utils.activity_helpers import (
    LogColors,
    _escape_airtable_value,
    _get_building_position_coords,
    _calculate_distance_meters,
    get_path_between_points, # Corrected import name
    _has_recent_failed_activity_for_contract, # Assuming this might be used or adapted
    VENICE_TIMEZONE # Added import for VENICE_TIMEZONE
)
# Import activity creators
from backend.engine.activity_creators import (
    try_create_fetch_from_galley_activity
)
# Import the specific activity creator for deliver_resource_batch
from backend.engine.activity_creators.deliver_resource_batch_activity_creator import try_create as try_create_deliver_resource_batch_activity

# Import other necessary functions if they were originally in createActivities.py and are specific to galley logic
# For example, if get_building_record was defined in createActivities.py and not yet moved to a shared util
# For now, assuming it's available or will be passed/imported appropriately.
# from backend.engine.processActivities import get_building_record # Example if needed

log = logging.getLogger(__name__)

# Constants that might be specific to galley logic or passed as arguments
# TRANSPORT_API_URL would need to be passed or defined globally if used by get_path_between_points_helper

def process_final_deliveries_from_galley(
    tables: Dict[str, Table], 
    citizens_pool: List[Dict], 
    now_utc_dt: datetime.datetime,
    transport_api_url: str, # Added to pass to path helper
    resource_defs: Dict[str, Any] # Added resource_defs
) -> int:
    """
    Identifies citizens at galleys carrying resources from a fetch_from_galley activity
    and creates deliver_resource_batch activities to the final buyer.
    Modifies citizens_pool by removing citizens who are assigned a delivery.
    Returns the number of delivery activities created.
    """
    # VENICE_TIMEZONE is imported from activity_helpers. now_utc_dt is already UTC.
    # current_time_venice = now_utc_dt.astimezone(VENICE_TIMEZONE) # Not strictly needed if creator takes UTC

    activities_created_count = 0
    citizens_assigned_delivery = []

    if not citizens_pool:
        return 0

    try:
        arrived_galleys = tables['buildings'].all(formula="AND({Type}='merchant_galley', {IsConstructed}=TRUE())")
        if not arrived_galleys:
            return 0
        
        galley_locations_map = {
            galley['id']: (_get_building_position_coords(galley), galley['fields'].get('BuildingId'))
            for galley in arrived_galleys if _get_building_position_coords(galley) and galley['fields'].get('BuildingId')
        }
        if not galley_locations_map:
            log.info(f"{LogColors.OKBLUE}No arrived galleys with valid positions found.{LogColors.ENDC}")
            return 0

        for citizen_record in list(citizens_pool): 
            citizen_username = citizen_record['fields'].get('Username')
            citizen_social_class = citizen_record['fields'].get('SocialClass')

            # Skip Forestieri for final delivery tasks
            if citizen_social_class == 'Forestieri':
                log.debug(f"Citizen {citizen_username} is a Forestieri. Skipping for final delivery task consideration.")
                continue
            
            citizen_custom_id = citizen_record['fields'].get('CitizenId', citizen_username)
            citizen_pos_str = citizen_record['fields'].get('Position')
            
            if not citizen_pos_str or not citizen_username: # citizen_username already effectively checked by social_class check if username is blank
                continue
            
            try:
                citizen_current_pos = json.loads(citizen_pos_str)
            except json.JSONDecodeError:
                continue

            at_galley_airtable_id = None
            current_galley_custom_id = None

            for galley_aid, (galley_pos, galley_cid) in galley_locations_map.items():
                if _calculate_distance_meters(citizen_current_pos, galley_pos) < 20: 
                    at_galley_airtable_id = galley_aid
                    current_galley_custom_id = galley_cid
                    break
            
            if not at_galley_airtable_id:
                continue

            carried_res_formula = f"AND({{Asset}}='{_escape_airtable_value(citizen_username)}', {{AssetType}}='citizen')"
            
            try:
                carried_resources_records = tables['resources'].all(formula=carried_res_formula)
            except Exception as e_fetch_carried:
                log.error(f"{LogColors.FAIL}Error fetching carried resources for {citizen_username} at galley: {e_fetch_carried}{LogColors.ENDC}")
                continue

            resources_for_delivery_by_contract: Dict[str, List[Dict]] = defaultdict(list)
            contract_to_buyer_building_map: Dict[str, str] = {}

            for res_rec in carried_resources_records:
                notes = res_rec['fields'].get('Notes', '')
                match = re.search(r"Fetched for contract: (contract-[^\s]+)", notes)
                if match:
                    original_contract_id = match.group(1)
                    resources_for_delivery_by_contract[original_contract_id].append({
                        "ResourceId": res_rec['fields'].get('Type'),
                        "Amount": float(res_rec['fields'].get('Count', 0))
                    })
                    if original_contract_id not in contract_to_buyer_building_map:
                        original_contract_details = tables['contracts'].all(formula=f"{{ContractId}}='{_escape_airtable_value(original_contract_id)}'", max_records=1)
                        if original_contract_details:
                            buyer_building_custom_id = original_contract_details[0]['fields'].get('BuyerBuilding')
                            if buyer_building_custom_id:
                                contract_to_buyer_building_map[original_contract_id] = buyer_building_custom_id
                            else:
                                log.warning(f"{LogColors.WARNING}Original contract {original_contract_id} does not have a BuyerBuilding. Cannot create final delivery.{LogColors.ENDC}")
                        else:
                             log.warning(f"{LogColors.WARNING}Could not fetch original contract details for {original_contract_id}. Cannot create final delivery.{LogColors.ENDC}")

            if not resources_for_delivery_by_contract:
                continue

            for original_contract_id, resources_list in resources_for_delivery_by_contract.items():
                if not resources_list: continue

                buyer_building_custom_id = contract_to_buyer_building_map.get(original_contract_id)
                if not buyer_building_custom_id:
                    log.warning(f"{LogColors.WARNING}No BuyerBuilding found for contract {original_contract_id} for citizen {citizen_username}. Skipping this batch.{LogColors.ENDC}")
                    continue

                buyer_building_record_list = tables['buildings'].all(formula=f"{{BuildingId}}='{_escape_airtable_value(buyer_building_custom_id)}'", max_records=1)
                if not buyer_building_record_list:
                    log.warning(f"{LogColors.WARNING}BuyerBuilding {buyer_building_custom_id} for contract {original_contract_id} not found. Skipping delivery for {citizen_username}.{LogColors.ENDC}")
                    continue
                
                buyer_building_record = buyer_building_record_list[0]
                buyer_building_pos = _get_building_position_coords(buyer_building_record)

                if not buyer_building_pos:
                    log.warning(f"{LogColors.WARNING}BuyerBuilding {buyer_building_custom_id} has no position. Skipping delivery for {citizen_username}.{LogColors.ENDC}")
                    continue

                path_to_buyer = get_path_between_points(citizen_current_pos, buyer_building_pos, transport_api_url)
                if path_to_buyer and path_to_buyer.get('success'):
                    notes_for_activity = f"🚢 Delivering resources from galley {current_galley_custom_id} to {buyer_building_custom_id} for contract {original_contract_id}."
                    transport_mode_from_path = path_to_buyer.get('transporter', 'citizen_carry') # Default if not specified by path

                    created_activity = try_create_deliver_resource_batch_activity(
                        tables=tables,
                        citizen_username_actor=citizen_username,
                        from_building_custom_id=current_galley_custom_id,
                        to_building_custom_id=buyer_building_custom_id,
                        resources_manifest=resources_list,
                        contract_id_ref=original_contract_id,
                        transport_mode=transport_mode_from_path,
                        path_data=path_to_buyer,
                        current_time_utc=now_utc_dt, # Pass UTC time
                        notes=notes_for_activity,
                        priority=9
                    )

                    if created_activity and created_activity.get('id'):
                        log.info(f"{LogColors.OKGREEN}Created final deliver_resource_batch activity {created_activity['id']} for {citizen_username} from galley {current_galley_custom_id} to {buyer_building_custom_id} via new creator.{LogColors.ENDC}")
                        activities_created_count += 1
                        citizens_assigned_delivery.append(citizen_record)
                        break # Citizen assigned, move to next citizen
                    else:
                        log.error(f"{LogColors.FAIL}Failed to create final deliver_resource_batch for {citizen_username} via new creator.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}Pathfinding from galley {current_galley_custom_id} to buyer building {buyer_building_custom_id} failed for {citizen_username}.{LogColors.ENDC}")
            
            if citizen_record in citizens_assigned_delivery and citizen_record in citizens_pool:
                 citizens_pool.remove(citizen_record)

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error in process_final_deliveries_from_galley: {e}{LogColors.ENDC}")
    
    log.info(f"{LogColors.OKGREEN}Created {activities_created_count} final delivery activities from galleys.{LogColors.ENDC}")
    return activities_created_count

def process_galley_unloading_activities(
    tables: Dict[str, Table], 
    idle_citizens: List[Dict], 
    now_utc_dt: datetime.datetime,
    transport_api_url: str, # Added to pass to path helper
    resource_defs: Dict[str, Any] # Added resource_defs
) -> int:
    """
    Identifies merchant galleys with pending deliveries and creates 'fetch_from_galley'
    activities for idle citizens to unload them.
    Returns the number of 'fetch_from_galley' activities created.
    Modifies `idle_citizens` list in place by removing citizens assigned a task.
    """
    # VENICE_TIMEZONE is imported from activity_helpers at the top of the file
    current_time_venice_gu = now_utc_dt.astimezone(VENICE_TIMEZONE) # Convert UTC to Venice time

    activities_created_count = 0
    if not idle_citizens: 
        log.info(f"{LogColors.OKBLUE}No idle citizens available to process galley unloading.{LogColors.ENDC}")
        return 0

    try:
        formula_arrived_galleys = "AND({Type}='merchant_galley', {IsConstructed}=TRUE())"
        arrived_galleys = tables['buildings'].all(formula=formula_arrived_galleys)
        log.info(f"{LogColors.OKBLUE}Found {len(arrived_galleys)} arrived merchant galleys.{LogColors.ENDC}")

        for galley_record in arrived_galleys:
            if not idle_citizens: 
                log.info(f"{LogColors.OKBLUE}No more idle citizens available for further galley unloading tasks.{LogColors.ENDC}")
                break

            galley_airtable_id = galley_record['id']
            galley_custom_id = galley_record['fields'].get('BuildingId')
            galley_owner_username = galley_record['fields'].get('Owner')
            
            galley_position = _get_building_position_coords(galley_record) 

            if not all([galley_custom_id, galley_position, galley_owner_username]):
                log.warning(f"{LogColors.WARNING}Galley {galley_airtable_id} (Custom ID: {galley_custom_id}) missing BuildingId, valid Position, or Owner. Skipping. Position found: {galley_position}{LogColors.ENDC}")
                continue
            
            contracts_to_fetch_formula = (f"AND({{Seller}}='{_escape_airtable_value(galley_owner_username)}', "
                                          f"{{SellerBuilding}}='{_escape_airtable_value(galley_custom_id)}', "
                                          f"{{LastExecutedAt}}=BLANK())")
            try:
                pending_import_contracts = tables['contracts'].all(formula=contracts_to_fetch_formula)
            except Exception as e_fetch_contracts:
                log.error(f"{LogColors.FAIL}Error fetching pending import contracts for galley {galley_custom_id}: {e_fetch_contracts}{LogColors.ENDC}")
                continue

            if not pending_import_contracts:
                continue
            
            log.info(f"{LogColors.OKBLUE}Processing galley {galley_custom_id} with {len(pending_import_contracts)} pending import contracts.{LogColors.ENDC}")

            for contract_to_fetch in pending_import_contracts:
                if not idle_citizens: 
                    log.info(f"{LogColors.OKBLUE}No more idle citizens for items in galley {galley_custom_id}.{LogColors.ENDC}")
                    break 

                original_contract_id = contract_to_fetch['fields'].get('ContractId') 
                resource_type = contract_to_fetch['fields'].get('ResourceType')
                amount = float(contract_to_fetch['fields'].get('TargetAmount', 0)) 

                if not all([original_contract_id, resource_type]) or amount <= 0:
                    log.warning(f"{LogColors.WARNING}Invalid contract data for import from galley {galley_custom_id}: ContractId={original_contract_id}, Resource={resource_type}, Amount={amount}{LogColors.ENDC}")
                    continue
                
                if _has_recent_failed_activity_for_contract(tables, 'fetch_from_galley', original_contract_id):
                    log.info(f"{LogColors.OKBLUE}Skipping fetch_from_galley for contract {original_contract_id} due to recent failure.{LogColors.ENDC}")
                    continue

                activity_exists_formula_broad = (f"AND({{Type}}='fetch_from_galley', "
                                                 f"{{FromBuilding}}='{galley_airtable_id}', " 
                                                 f"{{ContractId}}='{_escape_airtable_value(original_contract_id)}', "
                                                 f"{{Status}}!='processed', {{Status}}!='failed')")
                activity_truly_exists = False
                try:
                    potential_existing_activities = tables['activities'].all(formula=activity_exists_formula_broad)
                    for act in potential_existing_activities:
                        resources_json_str = act['fields'].get('Resources')
                        if resources_json_str:
                            try:
                                resources_list_in_activity = json.loads(resources_json_str)
                                if isinstance(resources_list_in_activity, list) and len(resources_list_in_activity) == 1:
                                    if resources_list_in_activity[0].get('ResourceId') == resource_type:
                                        activity_truly_exists = True
                                        break 
                            except json.JSONDecodeError:
                                log.warning(f"{LogColors.WARNING}Could not parse Resources JSON '{resources_json_str}' for activity {act['id']}{LogColors.ENDC}")
                    
                    if activity_truly_exists:
                        log.info(f"{LogColors.OKBLUE}Active 'fetch_from_galley' already exists for contract {original_contract_id}, resource {resource_type} from galley {galley_custom_id} (checked via Resources field). Skipping.{LogColors.ENDC}")
                        continue
                except Exception as e_check_existing:
                    log.error(f"{LogColors.FAIL}Error checking for existing fetch_from_galley activities: {e_check_existing}{LogColors.ENDC}")
                
                if not idle_citizens: 
                    log.info(f"{LogColors.OKBLUE}No more idle citizens available in the general pool for items in galley {galley_custom_id}.{LogColors.ENDC}")
                    break 

                # Identify the BuyerBuilding and its Occupant for the current contract_to_fetch
                buyer_building_custom_id = contract_to_fetch['fields'].get('BuyerBuilding')
                if not buyer_building_custom_id:
                    log.warning(f"{LogColors.WARNING}Contract {original_contract_id} is missing a BuyerBuilding. Skipping this contract part.{LogColors.ENDC}")
                    continue

                # We need get_building_record, assuming it's available via imports in the calling module (createActivities.py)
                # or passed if this module were more isolated. For now, rely on its availability.
                from backend.engine.utils.activity_helpers import get_building_record # Explicit import for clarity
                
                buyer_building_record = get_building_record(tables, buyer_building_custom_id)
                if not buyer_building_record:
                    log.warning(f"{LogColors.WARNING}BuyerBuilding {buyer_building_custom_id} for contract {original_contract_id} not found. Skipping this contract part.{LogColors.ENDC}")
                    continue

                # Occupant field is expected to be a Username string or null
                occupant_username_for_task = buyer_building_record['fields'].get('Occupant')
                
                if not occupant_username_for_task:
                    log.warning(f"{LogColors.WARNING}BuyerBuilding {buyer_building_custom_id} (Contract: {original_contract_id}) has no Occupant Username. Skipping this contract part.{LogColors.ENDC}")
                    continue
                
                log.info(f"{LogColors.OKBLUE}Contract {original_contract_id}: BuyerBuilding is {buyer_building_custom_id}, its Occupant (Username) is {occupant_username_for_task}. This citizen will fetch the goods.{LogColors.ENDC}")

                # Find the specific Occupant (by username) in the idle_citizens list
                citizen_for_task = None
                selected_citizen_idx = -1
                for idx, potential_citizen in enumerate(idle_citizens):
                    if potential_citizen['fields'].get('Username') == occupant_username_for_task:
                        # Found the Occupant. Check if they are suitable.
                        if potential_citizen['fields'].get('SocialClass') == 'Forestieri':
                            log.warning(f"{LogColors.WARNING}Occupant {occupant_username_for_task} for contract {original_contract_id} (BuyerBuilding: {buyer_building_custom_id}) is a Forestieri. This is unexpected. Skipping task assignment.{LogColors.ENDC}")
                            break 
                        
                        citizen_for_task = potential_citizen
                        selected_citizen_idx = idx
                        break # Found the specific, suitable Occupant in the idle list
                
                if citizen_for_task and selected_citizen_idx != -1:
                    # The specific Occupant is idle and suitable
                    idle_citizens.pop(selected_citizen_idx) # Remove the Occupant from the idle pool
                    log.info(f"{LogColors.OKBLUE}Assigning contract {original_contract_id} (Resource: {resource_type}) to Occupant {occupant_username_for_task} of BuyerBuilding {buyer_building_custom_id}.{LogColors.ENDC}")
                else:
                    # The specific Occupant for this contract is not idle or is unsuitable
                    log.info(f"{LogColors.OKBLUE}Occupant {occupant_username_for_task} of BuyerBuilding {buyer_building_custom_id} (for contract {original_contract_id}, Resource: {resource_type}) is not currently idle or suitable. Resources will remain on galley {galley_custom_id} for now.{LogColors.ENDC}")
                    continue # Move to the next contract_to_fetch, do not assign this one

                # citizen_for_task is now the specific Occupant for this contract part.
                citizen_custom_id = citizen_for_task['fields'].get('CitizenId')
                citizen_username = citizen_for_task['fields'].get('Username', citizen_custom_id)
                citizen_airtable_id = citizen_for_task['id']
                
                citizen_current_pos_str = citizen_for_task['fields'].get('Position')
                citizen_current_pos = None
                if citizen_current_pos_str:
                    try:
                        citizen_current_pos = json.loads(citizen_current_pos_str)
                    except json.JSONDecodeError:
                        log.warning(f"{LogColors.WARNING}Could not parse current position for citizen {citizen_username}. Cannot pathfind to galley.{LogColors.ENDC}")
                        idle_citizens.append(citizen_for_task) 
                        continue 
                
                if not citizen_current_pos: 
                    log.warning(f"{LogColors.WARNING}Citizen {citizen_username} has no current position. Cannot pathfind to galley.{LogColors.ENDC}")
                    idle_citizens.append(citizen_for_task) 
                    continue

                path_to_galley = get_path_between_points(citizen_current_pos, galley_position, transport_api_url) 
                if path_to_galley and path_to_galley.get('success'):
                    activity_created = try_create_fetch_from_galley_activity(
                        tables,
                        citizen_airtable_id,
                        citizen_custom_id,
                        citizen_username,
                        galley_airtable_id,
                        galley_custom_id,
                        original_contract_id,
                        resource_type,
                        amount,
                        path_to_galley,
                        current_time_utc=now_utc_dt, # Pass now_utc_dt
                        resource_defs=resource_defs  # Pass resource_defs
                    )
                    if activity_created:
                        activities_created_count += 1
                        log.info(f"{LogColors.OKGREEN}Created 'fetch_from_galley' for {citizen_username} to galley {galley_custom_id} for {amount} of {resource_type}.{LogColors.ENDC}")
                    else:
                        idle_citizens.append(citizen_for_task) 
                        log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} put back into idle pool after failing to create fetch_from_galley activity.{LogColors.ENDC}")
                else:
                    log.warning(f"{LogColors.WARNING}Pathfinding to galley {galley_custom_id} failed for citizen {citizen_username}. Contract: {contract_to_fetch['fields'].get('ContractId', 'N/A')}{LogColors.ENDC}")
                    idle_citizens.append(citizen_for_task) 
                    log.info(f"{LogColors.OKBLUE}Citizen {citizen_username} put back into idle pool after pathfinding failure to galley.{LogColors.ENDC}")

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing galley unloading activities: {e}{LogColors.ENDC}")
    
    log.info(f"{LogColors.OKGREEN}Created {activities_created_count} 'fetch_from_galley' activities.{LogColors.ENDC}")
    return activities_created_count
