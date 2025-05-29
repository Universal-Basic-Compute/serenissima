"""
Creator for 'fetch_for_logistics_client' activities.
A Porter fetches resources from a source (e.g., public_sell contract) and delivers
them to a client's building, as per a logistics_service_request contract.
"""
import logging
import datetime
import json
import pytz
import uuid
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import VENICE_TIMEZONE

log = logging.getLogger(__name__)

DEFAULT_PRIORITY_FETCH_LOGISTICS = 6 # Example priority

def try_create(
    tables: Dict[str, Any],
    porter_citizen_custom_id: str,
    porter_username: str,
    # Source of goods (e.g., from a public_sell contract)
    source_building_custom_id: str,
    public_sell_contract_custom_id: str, # Custom ContractId string of the public_sell contract
    # Destination for goods (client's building from logistics_service_request)
    client_target_building_custom_id: str,
    # Details of the logistics service
    logistics_service_contract_custom_id: str, # Custom ID of the logistics_service_request
    ultimate_buyer_username: str, # The client who will own and pay for the goods
    service_fee_per_unit: float,
    # Resource details
    resource_to_fetch_id: str,
    amount_to_fetch: float,
    # Path and timing
    path_data: Dict, # Path from porter's current location to source_building, then to client_target_building
    current_time_utc: datetime.datetime, # Changed from current_time_venice to current_time_utc
    resource_defs: Dict[str, Any] # Added resource_defs
    # tables: Dict[str, Any] # Removed duplicate tables argument
) -> Optional[Dict]:
    """
    Creates a 'fetch_for_logistics_client' activity.
    The path_data should ideally cover the full trip: Porter -> Source -> Client.
    If path_data only covers Porter -> Source, the processor will need to handle the next leg.
    For simplicity, let's assume path_data is for Porter -> Source for now, and the processor
    will create a subsequent delivery activity or this activity itself has two "stages".
    Let's design this as a single activity with two effective destinations processed sequentially.
    The 'ToBuilding' will be the client's target building. 'FromBuilding' is the source.
    """
    log.info(f"Attempting to create 'fetch_for_logistics_client' for Porter {porter_username} from {source_building_custom_id} to {client_target_building_custom_id} for client {ultimate_buyer_username}.")

    try:
        activity_id_str = f"fetch_logistics_{porter_citizen_custom_id}_{uuid.uuid4()}"

        # Timing from path_data (assumed to be for the entire journey or at least to source)
        start_date_iso_to_use = path_data.get('timing', {}).get('startDate', current_time_utc.isoformat())
        end_date_iso_to_use = path_data.get('timing', {}).get('endDate')
        if not end_date_iso_to_use:
            # Estimate duration if not provided (e.g., 1 hour to source, 1 hour to client)
            estimated_duration_hours = 2
            # Ensure start_date_iso_to_use is a datetime object for timedelta if it came from current_time_utc
            start_datetime_obj_for_calc = datetime.datetime.fromisoformat(start_date_iso_to_use.replace("Z", "+00:00")) if isinstance(start_date_iso_to_use, str) else start_date_iso_to_use
            if start_datetime_obj_for_calc.tzinfo is None: # Ensure timezone aware
                 start_datetime_obj_for_calc = pytz.UTC.localize(start_datetime_obj_for_calc)

            end_datetime_obj = start_datetime_obj_for_calc + datetime.timedelta(hours=estimated_duration_hours)
            end_date_iso_to_use = end_datetime_obj.isoformat()

        path_points_json = json.dumps(path_data.get('path', []))
        transporter = path_data.get('transporter') # Porter might use a cart, or this is for gondola sections

        details_payload = {
            "logisticsServiceContractId": logistics_service_contract_custom_id,
            "ultimateBuyerUsername": ultimate_buyer_username,
            "serviceFeePerUnit": service_fee_per_unit,
            "sourceBuildingId": source_building_custom_id, 
            "publicSellContractCustomId": public_sell_contract_custom_id, # Store custom ID
            "resourceType": resource_to_fetch_id, 
            "amountToFetch": amount_to_fetch      
        }

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_for_logistics_client",
            "Citizen": porter_username,
            "FromBuilding": source_building_custom_id, 
            "ToBuilding": client_target_building_custom_id, 
            "ContractId": public_sell_contract_custom_id, # Use custom ContractId string
            "Path": path_points_json,
            "Transporter": transporter,
            # "Details": json.dumps(details_payload), # Details now contains resource info - MOVING TO NOTES
            "CreatedAt": current_time_utc.isoformat(),    # Use current_time_utc
            "StartDate": start_date_iso_to_use,         # Use determined start date
            "EndDate": end_date_iso_to_use,             # Use determined end date
            "Status": "created",
            "Priority": DEFAULT_PRIORITY_FETCH_LOGISTICS,
            # Notes will be constructed and then details_payload appended
        }
        base_notes = f"Porter {porter_username} fetching {amount_to_fetch:.2f} {resource_to_fetch_id} from {source_building_custom_id} for {ultimate_buyer_username} (delivering to {client_target_building_custom_id}). Logistics: {logistics_service_contract_custom_id}."
        details_json_str = json.dumps(details_payload)
        activity_payload["Notes"] = f"{base_notes}\nDetailsJSON: {details_json_str}".strip()

        resource_name = resource_defs.get(resource_to_fetch_id, {}).get('name', resource_to_fetch_id)
        activity_payload["Description"] = f"Fetching {amount_to_fetch:.2f} {resource_name} for {ultimate_buyer_username}"

        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created 'fetch_for_logistics_client' activity: {created_activity['id']}")
            return created_activity
        else:
            log.error("Failed to create 'fetch_for_logistics_client' activity in Airtable.")
            return None

    except Exception as e:
        log.error(f"Error creating 'fetch_for_logistics_client' activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
