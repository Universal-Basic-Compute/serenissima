import logging
import json
from datetime import datetime, timezone
import uuid

from backend.engine.utils.activity_helpers import LogColors, get_contract_record, log_header
# Import create_notification from the new notification_helpers module
from backend.engine.utils.notification_helpers import create_notification

log = logging.getLogger(__name__)

def process_finalize_manage_markup_buy_contract_fn(tables: dict, activity_record: dict, building_type_defs: dict, resource_defs: dict) -> bool:
    """
    Processes the 'finalize_manage_markup_buy_contract' activity.
    - Reads contract details from activity Notes.
    - Creates or updates a 'markup_buy_contract' in the CONTRACTS table.
    """
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_record['id'])
    citizen_username = activity_fields.get('Citizen') # Buyer

    log_header(f"Finalize Markup Buy Contract: {citizen_username}", LogColors.HEADER)
    log.info(f"{LogColors.PROCESS}Processing 'finalize_manage_markup_buy_contract' activity {activity_guid} by {citizen_username}.{LogColors.ENDC}")

    try:
        notes_str = activity_fields.get('Notes')
        if not notes_str:
            log.error(f"{LogColors.FAIL}Activity {activity_guid} is missing 'Notes'.{LogColors.ENDC}")
            return False
        
        details = json.loads(notes_str)
        contract_id_to_update = details.get('contractIdToUpdate') # Custom ContractId if updating
        resource_type = details.get('resourceType')
        target_amount = details.get('targetAmount')
        max_price_per_resource = details.get('maxPricePerResource')
        buyer_building_id = details.get('buyerBuildingId')
        # buyer_username_from_details = details.get('buyerUsername') # Should match activity_citizen_username

        if not resource_type or target_amount is None or max_price_per_resource is None or not buyer_building_id:
            log.error(f"{LogColors.FAIL}Missing required contract details in activity {activity_guid} notes: {details}{LogColors.ENDC}")
            return False

        now_iso = datetime.now(timezone.utc).isoformat()
        
        contract_fields = {
            "Type": "markup_buy_contract",
            "ResourceType": resource_type,
            "TargetAmount": float(target_amount),
            "PricePerResource": float(max_price_per_resource), # Max price buyer is willing to pay
            "Buyer": citizen_username,
            "BuyerBuilding": buyer_building_id,
            "Status": "active", # New buy contracts are active
            "UpdatedAt": now_iso,
            # Seller and SellerBuilding are null until a seller fulfills it
        }

        if contract_id_to_update:
            # Attempt to update existing contract
            existing_contract_record = get_contract_record(tables, contract_id_to_update)
            if existing_contract_record:
                # Ensure the citizen is the buyer of the contract they are trying to update
                if existing_contract_record['fields'].get('Buyer') != citizen_username:
                    log.error(f"{LogColors.FAIL}Citizen {citizen_username} cannot update contract {contract_id_to_update} as they are not the buyer.{LogColors.ENDC}")
                    return False
                
                # Only allow updating certain fields, e.g., price, amount, status
                updateable_fields = {
                    "TargetAmount": float(target_amount),
                    "PricePerResource": float(max_price_per_resource),
                    "Status": details.get("newStatus", "active"), # Allow status update if provided
                    "UpdatedAt": now_iso
                }
                if "Notes" in details: # Allow updating notes
                    updateable_fields["Notes"] = details["Notes"]

                tables['contracts'].update(existing_contract_record['id'], updateable_fields)
                log.info(f"{LogColors.SUCCESS}Updated markup_buy_contract {contract_id_to_update} for {citizen_username}.{LogColors.ENDC}")
                create_notification(tables, citizen_username, "markup_buy_contract_updated", f"Your buy order for {resource_type} has been updated.", details={"contractId": contract_id_to_update})
            else:
                log.warning(f"{LogColors.WARNING}Contract {contract_id_to_update} not found for update. Creating new one instead for {citizen_username}.{LogColors.ENDC}")
                contract_fields["ContractId"] = str(uuid.uuid4()) # Generate new custom ID
                contract_fields["CreatedAt"] = now_iso
                new_contract_record_from_create = tables['contracts'].create(contract_fields) # Renamed to avoid conflict
                log.info(f"{LogColors.SUCCESS}Created new markup_buy_contract {new_contract_record_from_create['fields'].get('ContractId')} for {citizen_username}.{LogColors.ENDC}")
                create_notification(tables, citizen_username, "markup_buy_contract_created", f"Your buy order for {resource_type} has been placed.", details={"contractId": new_contract_record_from_create['fields'].get('ContractId')})
        else:
            # Create new contract
            contract_fields["ContractId"] = f"mbc_{citizen_username[:3]}_{resource_type[:4]}_{str(uuid.uuid4())[:4]}" # Example custom ID
            contract_fields["CreatedAt"] = now_iso
            new_contract_record = tables['contracts'].create(contract_fields)
            log.info(f"{LogColors.SUCCESS}Created new markup_buy_contract {new_contract_record['fields'].get('ContractId')} for {citizen_username}.{LogColors.ENDC}")
            create_notification(tables, citizen_username, "markup_buy_contract_created", f"Your buy order for {resource_type} has been placed.", details={"contractId": new_contract_record['fields'].get('ContractId')})
            
        return True

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error processing 'finalize_manage_markup_buy_contract' activity {activity_guid}: {e}{LogColors.ENDC}", exc_info=True)
        return False
