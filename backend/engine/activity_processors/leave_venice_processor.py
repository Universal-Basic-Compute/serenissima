"""
Processor for 'leave_venice' activities.
Handles a Forestiero citizen leaving Venice.
- Deletes their owned merchant_galley, if any.
- Liquidates their owned resources (sells to 'Italia' at importPrice).
- Updates their citizen record (InVenice=FALSE, Position=None).
"""
import json
import logging
import uuid
from datetime import datetime, timezone
import pytz
from typing import Dict, Optional, Any

# Import utility functions from activity_helpers to avoid circular imports
from backend.engine.utils.activity_helpers import (
    get_citizen_record,
    get_building_record,
    _escape_airtable_value,
    VENICE_TIMEZONE, # Import VENICE_TIMEZONE if used for now_iso_venice
    LogColors # Assuming LogColors might be useful here too
)
# Import a function to update ducats, similar to dailywages or define locally
# For now, let's assume a local helper or direct update.
# from backend.engine.dailywages import update_compute_balance as update_citizen_ducats
# For simplicity, we'll implement ducat updates directly or via a local helper.

log = logging.getLogger(__name__)

def _update_citizen_ducats_balance(
    tables: Dict[str, Any], 
    citizen_airtable_id: str, 
    amount_change: float
) -> bool:
    """Safely updates a citizen's Ducats balance."""
    try:
        citizen_rec = tables['citizens'].get(citizen_airtable_id)
        if not citizen_rec:
            log.error(f"Citizen with Airtable ID {citizen_airtable_id} not found for ducat update.")
            return False
        
        current_ducats = float(citizen_rec['fields'].get('Ducats', 0))
        new_ducats = current_ducats + amount_change
        tables['citizens'].update(citizen_airtable_id, {'Ducats': new_ducats})
        log.info(f"Updated Ducats for citizen {citizen_airtable_id}: {current_ducats:.2f} -> {new_ducats:.2f} (Change: {amount_change:.2f})")
        return True
    except Exception as e:
        log.error(f"Error updating Ducats for citizen {citizen_airtable_id}: {e}")
        return False

def process(
    tables: Dict[str, Any], 
    activity_record: Dict, 
    building_type_defs: Dict, # Not directly used but part of signature
    resource_defs: Dict      # For importPrice
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    log.info(f"🚢 Processing 'leave_venice' activity: {activity_guid}")

    forestiero_username = activity_fields.get('Citizen')
    if not forestiero_username:
        log.error(f"Activity {activity_guid} is missing Citizen (Username).")
        return False

    forestiero_citizen_record = get_citizen_record(tables, forestiero_username)
    if not forestiero_citizen_record:
        log.error(f"Forestiero citizen {forestiero_username} not found for activity {activity_guid}.")
        return False
    forestiero_airtable_id = forestiero_citizen_record['id']
    
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
    now_iso_venice = datetime.now(VENICE_TIMEZONE).isoformat()

    # 1. Delete owned merchant_galley, if any
    galley_to_delete_custom_id = None
    details_json_str = activity_fields.get('Details')
    if details_json_str:
        try:
            details_data = json.loads(details_json_str)
            galley_to_delete_custom_id = details_data.get('galley_to_delete_custom_id')
        except json.JSONDecodeError:
            log.warning(f"Could not parse Details JSON for activity {activity_guid}: {details_json_str}")

    galley_name_log = galley_to_delete_custom_id # Use ID if name not available
    if galley_to_delete_custom_id:
        log.info(f"Attempting to delete galley **{galley_name_log}** specified in activity details.")
        galley_record_to_delete = get_building_record(tables, galley_to_delete_custom_id)
        if galley_record_to_delete:
            galley_name_log = galley_record_to_delete['fields'].get('Name', galley_to_delete_custom_id) # Update with actual name
            if galley_record_to_delete['fields'].get('Owner') == forestiero_username:
                try:
                    tables['buildings'].delete(galley_record_to_delete['id'])
                    log.info(f"🗑️ Deleted merchant_galley **{galley_name_log}** ({galley_to_delete_custom_id}) (Airtable ID: {galley_record_to_delete['id']}) owned by **{forestiero_username}**.")
                except Exception as e_delete_galley:
                    log.error(f"Error deleting galley {galley_name_log}: {e_delete_galley}")
            else:
                log.warning(f"Galley {galley_name_log} found but not owned by {forestiero_username}. Owner: {galley_record_to_delete['fields'].get('Owner')}. Skipping deletion.")
        else:
            log.warning(f"Galley {galley_to_delete_custom_id} specified in details not found.")
    else:
        # Fallback or primary method: Query for any merchant_galley owned by the Forestiero
        log.info(f"No galley specified in details, or parsing failed. Querying for galleys owned by **{forestiero_username}**.")
        owned_galleys_formula = f"AND({{Owner}}='{_escape_airtable_value(forestiero_username)}', {{Type}}='merchant_galley')"
        try:
            owned_galleys = tables['buildings'].all(formula=owned_galleys_formula)
            for galley in owned_galleys:
                galley_custom_id_found = galley['fields'].get('BuildingId', galley['id'])
                log.info(f"Found merchant_galley {galley_custom_id_found} owned by {forestiero_username}. Deleting it.")
                tables['buildings'].delete(galley['id'])
                log.info(f"Deleted merchant_galley {galley_custom_id_found} (Airtable ID: {galley['id']}).")
        except Exception as e_query_delete_galley:
            log.error(f"Error querying/deleting galleys for {forestiero_username}: {e_query_delete_galley}")

    # 2. Liquidate owned resources
    total_liquidation_value = 0.0
    resources_to_delete_ids = []
    transactions_for_liquidation = []

    # Resources owned by the citizen: AssetType='citizen', Asset=forestiero_username, Owner=forestiero_username
    owned_resources_formula = f"AND({{AssetType}}='citizen', {{Asset}}='{_escape_airtable_value(forestiero_username)}', {{Owner}}='{_escape_airtable_value(forestiero_username)}')"
    try:
        owned_resources = tables['resources'].all(formula=owned_resources_formula)
        log.info(f"Found {len(owned_resources)} resource stacks owned by {forestiero_username} for liquidation.")
        for res_rec in owned_resources:
            res_type = res_rec['fields'].get('Type')
            res_count = float(res_rec['fields'].get('Count', 0))
            
            res_def = resource_defs.get(res_type)
            if not res_def:
                log.warning(f"Resource definition not found for type '{res_type}'. Cannot determine importPrice. Skipping liquidation for this item.")
                continue
            
            import_price = float(res_def.get('importPrice', 0))
            if import_price <= 0:
                log.warning(f"Resource type '{res_type}' has importPrice <= 0 ({import_price}). Skipping liquidation for this item.")
                continue

            value = res_count * import_price
            total_liquidation_value += value
            resources_to_delete_ids.append(res_rec['id'])

            transactions_for_liquidation.append({
                "Type": "resource_liquidation_on_departure",
                "AssetType": "resource",
                "Asset": res_type,
                "Seller": forestiero_username, # Forestiero "sells" to Italia
                "Buyer": "Italia",           # Italia "buys"
                "Price": value,
                "Notes": json.dumps({
                    "resource_type": res_type, "amount": res_count, 
                    "price_per_unit": import_price, "activity_guid": activity_guid
                }),
                "CreatedAt": now_iso_venice,
                "ExecutedAt": now_iso_venice
            })
            log.info(f"Liquidating {res_count} of {res_type} for {value:.2f} Ducats (Import Price: {import_price}).")

        if resources_to_delete_ids:
            tables['resources'].batch_delete(resources_to_delete_ids)
            log.info(f"{LogColors.OKGREEN}Deleted {len(resources_to_delete_ids)} resource stacks for {forestiero_username}.{LogColors.ENDC}")
        if transactions_for_liquidation:
            tables['transactions'].batch_create(transactions_for_liquidation)
            log.info(f"{LogColors.OKGREEN}Created {len(transactions_for_liquidation)} transaction records for resource liquidation.{LogColors.ENDC}")

    except Exception as e_liquidate:
        log.error(f"Error during resource liquidation for {forestiero_username}: {e_liquidate}")
        # Decide if this is a fatal error for the activity processing
        return False 

    # Update Forestiero's Ducats
    if total_liquidation_value > 0:
        if not _update_citizen_ducats_balance(tables, forestiero_airtable_id, total_liquidation_value):
            log.error(f"Failed to credit {forestiero_username} with {total_liquidation_value:.2f} Ducats from liquidation.")
            # This is a critical failure.
            return False
        
        # Update Italia's Ducats
        italia_citizen_record = get_citizen_record(tables, "Italia")
        if italia_citizen_record:
            if not _update_citizen_ducats_balance(tables, italia_citizen_record['id'], -total_liquidation_value): # Subtract
                log.error(f"Failed to debit 'Italia' with {total_liquidation_value:.2f} Ducats for liquidation.")
                # Also critical. Consider how to handle if one update fails but other succeeded.
                return False
        else:
            log.error("Citizen 'Italia' not found. Cannot debit for resource liquidation.")
            return False
    
    # 3. Update citizen record
    try:
        update_payload = {
            "InVenice": False,
            "Position": None, # Or an empty string, or a specific "Departed" marker if schema allows
            "Notes": f"{forestiero_citizen_record['fields'].get('Notes', '') or ''}\nDeparted Venice on {now_iso_venice}."
        }
        # Optionally, clear Home or other Venice-specific fields if necessary
        # e.g. "Home": None (if Home field stores Airtable record ID of home building)
        
        tables['citizens'].update(forestiero_airtable_id, update_payload)
        log.info(f"{LogColors.OKGREEN}Updated citizen {forestiero_username} record: InVenice=FALSE, Position cleared.{LogColors.ENDC}")
    except Exception as e_update_citizen:
        log.error(f"Error updating citizen record for {forestiero_username} upon departure: {e_update_citizen}")
        return False # Critical failure

    log.info(f"{LogColors.OKGREEN}Successfully processed 'leave_venice' activity {activity_guid} for {forestiero_username}.{LogColors.ENDC}")
    
    # Note: In the new architecture, we don't create follow-up activities here.
    # The activity creator should have already created the entire chain.
    return True
