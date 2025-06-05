import logging
import json
from datetime import datetime, timezone, timedelta
import uuid

from backend.engine.utils.activity_helpers import LogColors, get_contract_record
from backend.engine.utils.notification_helpers import create_notification

log = logging.getLogger(__name__)

def process_finalize_manage_storage_query_contract_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'finalize_manage_storage_query_contract' activity.
    - Reads contract details from activity Notes.
    - Creates or updates a 'storage_query_contract' in the CONTRACTS table.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen') # Requester

    log.info(f"{LogColors.PROCESS}Processing 'finalize_manage_storage_query_contract' activity {activity_guid} by {citizen_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes')
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes'.{LogColors.ENDC}")
            return False
        
        details = json.loads(notes_str)
        contract_id_to_update = details.get('contractIdToUpdate')
        resource_type = details.get('resourceType')
        amount_needed = details.get('amountNeeded')
        duration_days = details.get('durationDays')
        price_per_unit_per_day = details.get('pricePerUnitPerDay')
        requester_building_id = details.get('requesterBuildingId')
        # requester_username_from_details = details.get('requesterUsername') # Should match activity_citizen_username

        if not resource_type or amount_needed is None or duration_days is None or price_per_unit_per_day is None or not requester_building_id:
            log.error(f"{LogColors.FAIL}Missing required contract details in activity {activity_guid} notes: {details}{LogColors.ENDC}")
            return False

        now_iso = datetime.now(timezone.utc).isoformat()
        now_dt = datetime.now(timezone.utc)
        end_at_dt = now_dt + timedelta(days=int(duration_days))
        end_at_iso = end_at_dt.isoformat()
        
        contract_fields = {
            "Type": "storage_query_contract",
            "ResourceType": resource_type,
            "TargetAmount": float(amount_needed), # Amount of storage space needed
            "PricePerResource": float(price_per_unit_per_day), # Price offered per unit per day
            "Buyer": citizen_username, # The one requesting storage
            "BuyerBuilding": requester_building_id, # Building that needs storage
            "Status": "active", 
            "UpdatedAt": now_iso,
            "EndAt": end_at_iso, # Contract valid for this duration
            # Seller (storage provider) and SellerBuilding are null until a provider accepts
        }

        if contract_id_to_update:
            existing_contract_record = get_contract_record(tables, contract_id_to_update)
            if existing_contract_record:
                if existing_contract_record['fields'].get('Buyer') != citizen_username:
                    log.error(f"{LogColors.FAIL}Citizen {citizen_username} cannot update contract {contract_id_to_update} as they are not the requester.{LogColors.ENDC}")
                    return False
                
                updateable_fields = {
                    "TargetAmount": float(amount_needed),
                    "PricePerResource": float(price_per_unit_per_day),
                    "EndAt": end_at_iso, # Update duration
                    "Status": details.get("newStatus", "active"),
                    "UpdatedAt": now_iso
                }
                if "Notes" in details: updateable_fields["Notes"] = details["Notes"]

                tables['contracts'].update(existing_contract_record['id'], updateable_fields)
                log.info(f"{LogColors.SUCCESS}Updated storage_query_contract {contract_id_to_update} for {citizen_username}.{LogColors.ENDC}")
                create_notification(tables, citizen_username, "storage_query_contract_updated", f"Your storage request for {resource_type} has been updated.", {"contractId": contract_id_to_update})
            else:
                log.warning(f"{LogColors.WARNING}Contract {contract_id_to_update} not found for update. Creating new one instead for {citizen_username}.{LogColors.ENDC}")
                contract_fields["ContractId"] = f"sqc_{citizen_username[:3]}_{resource_type[:4]}_{str(uuid.uuid4())[:4]}"
                contract_fields["CreatedAt"] = now_iso
                new_contract_record = tables['contracts'].create(contract_fields)
                log.info(f"{LogColors.SUCCESS}Created new storage_query_contract {new_contract_record['fields'].get('ContractId')} for {citizen_username}.{LogColors.ENDC}")
                create_notification(tables, citizen_username, "storage_query_contract_created", f"Your storage request for {resource_type} has been placed.", {"contractId": new_contract_record['fields'].get('ContractId')})
        else:
            contract_fields["ContractId"] = f"sqc_{citizen_username[:3]}_{resource_type[:4]}_{str(uuid.uuid4())[:4]}"
            contract_fields["CreatedAt"] = now_iso
            new_contract_record = tables['contracts'].create(contract_fields)
            log.info(f"{LogColors.SUCCESS}Created new storage_query_contract {new_contract_record['fields'].get('ContractId')} for {citizen_username}.{LogColors.ENDC}")
            create_notification(tables, citizen_username, "storage_query_contract_created", f"Your storage request for {resource_type} has been placed.", {"contractId": new_contract_record['fields'].get('ContractId')})
            
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_manage_storage_query_contract' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
