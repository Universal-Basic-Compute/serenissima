"""
Processor for 'fetch_for_logistics_client' activities.
Handles a Porter's task:
1. On arrival at FromBuilding (source of goods):
   - Porter picks up resources.
   - Resources in Porter's inventory are owned by the ultimate client.
   - The ultimate client pays the seller of the goods.
2. On arrival at ToBuilding (client's destination):
   - Porter deposits resources into the client's building.
   - Resources are owned by the client in their building.
   - The ultimate client pays the Porter Guild (Porter's operator) a service fee.
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import (
    get_citizen_record, get_building_record, get_contract_record,
    _escape_airtable_value, VENICE_TIMEZONE, LogColors,
    get_citizen_effective_carry_capacity, get_citizen_current_load,
    get_building_current_storage,
    extract_details_from_notes # Import the helper
)
# Import relationship helper
from backend.engine.utils.relationship_helpers import update_trust_score_for_activity, TRUST_SCORE_SUCCESS_SIMPLE, TRUST_SCORE_FAILURE_SIMPLE, TRUST_SCORE_MINOR_POSITIVE, TRUST_SCORE_SUCCESS_MEDIUM, TRUST_SCORE_FAILURE_MEDIUM

log = logging.getLogger(__name__)

def _update_activity_notes_with_failure_reason(tables: Dict[str, Any], activity_airtable_id: str, failure_reason: str, stage: str = ""):
    try:
        activity_to_update = tables['activities'].get(activity_airtable_id)
        if not activity_to_update: return
        existing_notes = activity_to_update['fields'].get('Notes', '')
        timestamp = datetime.now(VENICE_TIMEZONE).strftime("%Y-%m-%d %H:%M:%S %Z")
        new_note_entry = f"\n[FAILURE @ {stage} - {timestamp}] {failure_reason}"
        tables['activities'].update(activity_airtable_id, {'Notes': existing_notes + new_note_entry})
    except Exception as e:
        log.error(f"Error updating notes for activity {activity_airtable_id}: {e}")

def process(
    tables: Dict[str, Any],
    activity_record: Dict,
    building_type_defs: Dict,
    resource_defs: Dict
) -> bool:
    activity_id_airtable = activity_record['id']
    activity_fields = activity_record['fields']
    activity_guid = activity_fields.get('ActivityId', activity_id_airtable)
    
    porter_username = activity_fields.get('Citizen')
    source_building_custom_id = activity_fields.get('FromBuilding') # Where goods are picked up
    client_target_building_custom_id = activity_fields.get('ToBuilding') # Final destination
    public_sell_contract_custom_id_from_activity = activity_fields.get('ContractId') # This is now the custom ContractId
    # ResourceId and Amount are now in Details (extracted from Notes)
    # details_json_str = activity_fields.get('Details') # Old way
    activity_notes = activity_fields.get('Notes', '')

    log.info(f"🚚 Processing 'fetch_for_logistics_client' ({activity_guid}) by Porter **{porter_username}**.")

    resource_id_to_fetch = None
    amount_to_fetch_total = 0.0
    logistics_contract_id_custom = None
    ultimate_buyer_username = None
    service_fee_per_unit = 0.0

    parsed_details_from_notes = extract_details_from_notes(activity_notes) # Use imported helper
    if not parsed_details_from_notes:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, "DetailsJSON not found in Notes or is invalid.", "INIT_DETAILS_MISSING_NOTES")
        return False
        
    try:
        logistics_contract_id_custom = parsed_details_from_notes.get('logisticsServiceContractId')
        ultimate_buyer_username = parsed_details_from_notes.get('ultimateBuyerUsername') # The client
        service_fee_per_unit = float(parsed_details_from_notes.get('serviceFeePerUnit', 0))
        resource_id_to_fetch = parsed_details_from_notes.get('resourceType') # Get from details
        amount_to_fetch_total = float(parsed_details_from_notes.get('amountToFetch', 0)) # Get from details
    except (TypeError, ValueError) as e: # JSONDecodeError already handled by extract_details_from_notes
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Invalid data types in parsed DetailsJSON: {e}", "INIT_DETAILS_TYPE_ERROR")
        return False

    # Now check all required fields, including those parsed from Details
    if not all([porter_username, source_building_custom_id, client_target_building_custom_id,
                public_sell_contract_custom_id_from_activity, resource_id_to_fetch, 
                logistics_contract_id_custom, ultimate_buyer_username]) or amount_to_fetch_total <= 0:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, "Missing crucial activity data (incl. from parsed Notes/DetailsJSON).", "INIT_DATA_CHECK")
        return False

    porter_record = get_citizen_record(tables, porter_username)
    client_record = get_citizen_record(tables, ultimate_buyer_username)
    source_building_record = get_building_record(tables, source_building_custom_id)
    client_target_building_record = get_building_record(tables, client_target_building_custom_id)
    public_sell_contract_record = get_contract_record(tables, public_sell_contract_custom_id_from_activity) # Fetch by custom ID

    if not all([porter_record, client_record, source_building_record, client_target_building_record, public_sell_contract_record]):
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, "One or more entities (porter, client, buildings, public_sell_contract) not found.", "ENTITY_FETCH")
        return False

    # Stage 1: Pickup from Source Building
    source_building_name_log = source_building_record['fields'].get('Name', source_building_custom_id)
    log.info(f"🚚 Stage 1: Porter **{porter_username}** picking up **{amount_to_fetch_total:.2f}** of **{resource_id_to_fetch}** from **{source_building_name_log}** ({source_building_custom_id}).")

    # Check source stock (owned by seller of public_sell contract)
    seller_of_goods_username = public_sell_contract_record['fields'].get('Seller')
    if not seller_of_goods_username:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, "Seller of goods not found in public_sell contract.", "PICKUP_SELLER")
        return False
    
    source_stock_formula = f"AND({{Type}}='{_escape_airtable_value(resource_id_to_fetch)}', {{Asset}}='{_escape_airtable_value(source_building_custom_id)}', {{AssetType}}='building', {{Owner}}='{_escape_airtable_value(seller_of_goods_username)}')"
    source_stock_records = tables['resources'].all(formula=source_stock_formula, max_records=1)
    
    actual_amount_at_source = float(source_stock_records[0]['fields'].get('Count', 0)) if source_stock_records else 0.0
    amount_to_pickup_stage1 = min(amount_to_fetch_total, actual_amount_at_source)
    amount_to_pickup_stage1 = float(f"{amount_to_pickup_stage1:.4f}")


    if amount_to_pickup_stage1 <= 0.001:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Source {source_building_custom_id} has insufficient stock ({actual_amount_at_source:.2f}) of {resource_id_to_fetch}.", "PICKUP_STOCK")
        return False

    # Check Porter's carry capacity
    porter_current_load = get_citizen_current_load(tables, porter_username)
    porter_max_capacity = get_citizen_effective_carry_capacity(porter_record)
    porter_remaining_capacity = porter_max_capacity - porter_current_load
    
    amount_to_pickup_stage1 = min(amount_to_pickup_stage1, porter_remaining_capacity)
    amount_to_pickup_stage1 = float(f"{amount_to_pickup_stage1:.4f}")

    if amount_to_pickup_stage1 <= 0.001:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Porter {porter_username} has insufficient carry capacity ({porter_remaining_capacity:.2f}).", "PICKUP_CAPACITY")
        return False

    # Client pays Seller of Goods
    price_per_unit_goods = float(public_sell_contract_record['fields'].get('PricePerResource', 0))
    cost_of_goods = amount_to_pickup_stage1 * price_per_unit_goods
    
    client_ducats = float(client_record['fields'].get('Ducats', 0))
    if client_ducats < cost_of_goods:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Client {ultimate_buyer_username} has insufficient funds ({client_ducats:.2f}) for goods ({cost_of_goods:.2f}).", "PICKUP_FUNDS")
        # Trust: Client failed to pay Seller of Goods
        if ultimate_buyer_username and seller_of_goods_username:
            update_trust_score_for_activity(tables, ultimate_buyer_username, seller_of_goods_username, TRUST_SCORE_FAILURE_MEDIUM, "logistics_goods_payment", False, "insufficient_funds")
        return False

    seller_of_goods_record = get_citizen_record(tables, seller_of_goods_username)
    if not seller_of_goods_record:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Seller of goods citizen record {seller_of_goods_username} not found.", "PICKUP_SELLER_REC")
        # This is more of a system data issue, less direct trust impact unless it implies seller vanished.
        return False

    # Perform financial transaction: Client to Seller of Goods
    tables['citizens'].update(client_record['id'], {'Ducats': client_ducats - cost_of_goods})
    seller_current_ducats = float(seller_of_goods_record['fields'].get('Ducats', 0))
    tables['citizens'].update(seller_of_goods_record['id'], {'Ducats': seller_current_ducats + cost_of_goods})
    log.info(f"💰 Client **{ultimate_buyer_username}** paid **{cost_of_goods:.2f} ⚜️** to Seller **{seller_of_goods_username}** for **{amount_to_pickup_stage1:.2f}** of **{resource_id_to_fetch}**.")
    # Trust: Client successfully paid Seller of Goods
    if ultimate_buyer_username and seller_of_goods_username:
        update_trust_score_for_activity(tables, ultimate_buyer_username, seller_of_goods_username, TRUST_SCORE_SUCCESS_MEDIUM, "logistics_goods_payment", True)

    # Update source stock
    new_source_stock_count = actual_amount_at_source - amount_to_pickup_stage1
    if new_source_stock_count > 0.001:
        tables['resources'].update(source_stock_records[0]['id'], {'Count': new_source_stock_count})
    else:
        tables['resources'].delete(source_stock_records[0]['id'])
    log.info(f"📦 Decremented **{amount_to_pickup_stage1:.2f}** of **{resource_id_to_fetch}** from source **{source_building_name_log}** ({source_building_custom_id}).")

    # Add to Porter's inventory, owned by Client
    porter_inv_formula = f"AND({{Type}}='{_escape_airtable_value(resource_id_to_fetch)}', {{Asset}}='{_escape_airtable_value(porter_username)}', {{AssetType}}='citizen', {{Owner}}='{_escape_airtable_value(ultimate_buyer_username)}')"
    existing_porter_inv = tables['resources'].all(formula=porter_inv_formula, max_records=1)
    res_def_pickup = resource_defs.get(resource_id_to_fetch, {})
    now_iso_pickup = datetime.now(VENICE_TIMEZONE).isoformat()

    if existing_porter_inv:
        inv_rec = existing_porter_inv[0]
        new_inv_count = float(inv_rec['fields'].get('Count', 0)) + amount_to_pickup_stage1
        tables['resources'].update(inv_rec['id'], {'Count': new_inv_count})
    else:
        tables['resources'].create({
            "ResourceId": f"res_porter_{uuid.uuid4()}", "Type": resource_id_to_fetch,
            "Name": res_def_pickup.get('name', resource_id_to_fetch),
            "Asset": porter_username, "AssetType": "citizen", "Owner": ultimate_buyer_username,
            "Count": amount_to_pickup_stage1, "CreatedAt": now_iso_pickup,
            "Notes": f"Carried by Porter {porter_username} for logistics contract {logistics_contract_id_custom}"
        })
    log.info(f"🛍️ Added **{amount_to_pickup_stage1:.2f}** of **{resource_id_to_fetch}** to Porter **{porter_username}**'s inventory (owned by Client **{ultimate_buyer_username}**).")

    # Stage 2: Delivery to Client's Target Building
    client_target_building_name_log = client_target_building_record['fields'].get('Name', client_target_building_custom_id)
    log.info(f"🚚 Stage 2: Porter **{porter_username}** delivering **{amount_to_pickup_stage1:.2f}** of **{resource_id_to_fetch}** to Client **{ultimate_buyer_username}**'s building **{client_target_building_name_log}** ({client_target_building_custom_id}).")

    # Check client's building storage capacity
    client_building_def = building_type_defs.get(client_target_building_record['fields'].get('Type'), {})
    client_building_capacity = float(client_building_def.get('productionInformation', {}).get('storageCapacity', 0))
    client_building_current_storage = get_building_current_storage(tables, client_target_building_custom_id)

    if client_building_current_storage + amount_to_pickup_stage1 > client_building_capacity:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Client building {client_target_building_custom_id} has insufficient storage.", "DELIVERY_CAPACITY")
        # Note: Resources are now with the Porter, owned by client. This is a problem if delivery fails.
        # A more robust system might create a "return to source" or "drop" activity for the Porter.
        return False

    # Remove from Porter's inventory (owned by Client)
    # This uses the same formula as when adding, as ownership is key.
    porter_inv_records_dec = tables['resources'].all(formula=porter_inv_formula, max_records=1)
    if not porter_inv_records_dec or float(porter_inv_records_dec[0]['fields'].get('Count', 0)) < amount_to_pickup_stage1:
        _update_activity_notes_with_failure_reason(tables, activity_id_airtable, "Porter inventory discrepancy before delivery.", "DELIVERY_INV_DISCREPANCY")
        return False
    
    inv_rec_dec = porter_inv_records_dec[0]
    new_inv_count_dec = float(inv_rec_dec['fields'].get('Count', 0)) - amount_to_pickup_stage1
    if new_inv_count_dec > 0.001:
        tables['resources'].update(inv_rec_dec['id'], {'Count': new_inv_count_dec})
    else:
        tables['resources'].delete(inv_rec_dec['id'])
    log.info(f"🛍️ Removed **{amount_to_pickup_stage1:.2f}** of **{resource_id_to_fetch}** from Porter **{porter_username}**'s inventory (owned by Client **{ultimate_buyer_username}**).")

    # Add to Client's building (owned by Client)
    client_building_res_formula = f"AND({{Type}}='{_escape_airtable_value(resource_id_to_fetch)}', {{Asset}}='{_escape_airtable_value(client_target_building_custom_id)}', {{AssetType}}='building', {{Owner}}='{_escape_airtable_value(ultimate_buyer_username)}')"
    existing_client_bldg_res = tables['resources'].all(formula=client_building_res_formula, max_records=1)
    now_iso_delivery = datetime.now(VENICE_TIMEZONE).isoformat()

    if existing_client_bldg_res:
        cb_res_rec = existing_client_bldg_res[0]
        new_cb_count = float(cb_res_rec['fields'].get('Count', 0)) + amount_to_pickup_stage1
        tables['resources'].update(cb_res_rec['id'], {'Count': new_cb_count})
    else:
        tables['resources'].create({
            "ResourceId": f"res_client_bldg_{uuid.uuid4()}", "Type": resource_id_to_fetch,
            "Name": res_def_pickup.get('name', resource_id_to_fetch), # Use res_def from pickup stage
            "Asset": client_target_building_custom_id, "AssetType": "building", "Owner": ultimate_buyer_username,
            "Count": amount_to_pickup_stage1, "CreatedAt": now_iso_delivery
        })
    log.info(f"📦 Deposited **{amount_to_pickup_stage1:.2f}** of **{resource_id_to_fetch}** into Client **{ultimate_buyer_username}**'s building **{client_target_building_name_log}** ({client_target_building_custom_id}).")

    # Client pays Porter Guild Operator the service fee
    if service_fee_per_unit > 0:
        total_service_fee = amount_to_pickup_stage1 * service_fee_per_unit
        
        # Client's ducats already fetched (client_ducats), but refresh after goods payment
        client_record_after_goods_payment = get_citizen_record(tables, ultimate_buyer_username) # Refresh
        client_ducats_for_fee = float(client_record_after_goods_payment['fields'].get('Ducats', 0))

        # Determine Porter Guild Operator first
        porter_guild_operator_username = None 
        logistics_contract_record = get_contract_record(tables, logistics_contract_id_custom)
        if logistics_contract_record:
            # The Seller of the logistics_service_request contract is the Porter Guild Operator
            porter_guild_operator_username = logistics_contract_record['fields'].get('Seller') 
        
        if not porter_guild_operator_username:
            # Fallback: Try to get from Porter's workplace if not in contract
            porter_workplace_id_link = porter_record['fields'].get('Work') # This is Airtable Record ID (potentially a list)
            if porter_workplace_id_link:
                porter_workplace_airtable_id = None
                if isinstance(porter_workplace_id_link, list):
                    porter_workplace_airtable_id = porter_workplace_id_link[0] if porter_workplace_id_link else None
                elif isinstance(porter_workplace_id_link, str): # Should be recXXXX
                    porter_workplace_airtable_id = porter_workplace_id_link
                
                if porter_workplace_airtable_id:
                    porter_workplace_record = tables['buildings'].get(porter_workplace_airtable_id) # Fetch by Airtable ID
                    if porter_workplace_record:
                        # Ensure the workplace is a porter_guild_hall
                        if porter_workplace_record['fields'].get('Type') == 'porter_guild_hall':
                            porter_guild_operator_username = porter_workplace_record['fields'].get('RunBy') or porter_workplace_record['fields'].get('Owner')
                            log.info(f"Determined Porter Guild Operator '{porter_guild_operator_username}' from Porter's workplace {porter_workplace_record['fields'].get('BuildingId')}.")
                        else:
                            log.warning(f"Porter {porter_username}'s workplace {porter_workplace_record['fields'].get('BuildingId')} is not a 'porter_guild_hall'. Cannot determine operator from here.")
                else:
                    log.warning(f"Porter {porter_username} has no Work link or it's invalid. Cannot determine operator from workplace.")
            else:
                log.warning(f"Porter {porter_username} has no Work field. Cannot determine operator from workplace.")
        
        # Now check for funds
        if client_ducats_for_fee < total_service_fee:
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Client {ultimate_buyer_username} has insufficient funds ({client_ducats_for_fee:.2f}) for service fee ({total_service_fee:.2f}).", "DELIVERY_FEE_FUNDS")
            # Goods delivered, but fee not paid. This is a problem. For now, activity fails.
            # Trust: Client failed to pay Porter Guild Operator
            if ultimate_buyer_username and porter_guild_operator_username: # porter_guild_operator_username defined below
                 update_trust_score_for_activity(tables, ultimate_buyer_username, porter_guild_operator_username, TRUST_SCORE_FAILURE_MEDIUM, "logistics_service_payment", False, "insufficient_funds")
            return False

        porter_guild_operator_username = None 
        logistics_contract_record = get_contract_record(tables, logistics_contract_id_custom)
        if logistics_contract_record:
            porter_guild_operator_username = logistics_contract_record['fields'].get('Seller')
        
        if not porter_guild_operator_username:
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, "Could not determine Porter Guild Operator for fee payment.", "DELIVERY_FEE_OPERATOR")
            return False

        porter_guild_operator_record = get_citizen_record(tables, porter_guild_operator_username)
        if not porter_guild_operator_record:
            _update_activity_notes_with_failure_reason(tables, activity_id_airtable, f"Porter Guild Operator {porter_guild_operator_username} not found.", "DELIVERY_FEE_OPERATOR_REC")
            return False

        # Perform financial transaction: Client to Porter Guild Operator
        tables['citizens'].update(client_record_after_goods_payment['id'], {'Ducats': client_ducats_for_fee - total_service_fee})
        operator_current_ducats = float(porter_guild_operator_record['fields'].get('Ducats', 0))
        tables['citizens'].update(porter_guild_operator_record['id'], {'Ducats': operator_current_ducats + total_service_fee})
        log.info(f"💰 Client **{ultimate_buyer_username}** paid service fee **{total_service_fee:.2f} ⚜️** to Porter Guild Operator **{porter_guild_operator_username}**.")
        # Trust: Client successfully paid Porter Guild Operator
        if ultimate_buyer_username and porter_guild_operator_username:
            update_trust_score_for_activity(tables, ultimate_buyer_username, porter_guild_operator_username, TRUST_SCORE_SUCCESS_MEDIUM, "logistics_service_payment", True)

        # Create transaction record for service fee
        transaction_payload_service_fee = {
            "Type": "logistics_service_fee",
            "AssetType": "contract", "Asset": logistics_contract_id_custom,
            "Seller": porter_guild_operator_username, "Buyer": ultimate_buyer_username,
            "Price": total_service_fee,
            "Notes": json.dumps({"activity_guid": activity_guid, "resource": resource_id_to_fetch, "amount": amount_to_pickup_stage1}),
            "CreatedAt": now_iso_delivery, "ExecutedAt": now_iso_delivery
        }
        tables['transactions'].create(transaction_payload_service_fee)
        log.info(f"Created transaction for logistics service fee: {total_service_fee:.2f}.")
    
    # Overall success of the porter's task
    if porter_username and ultimate_buyer_username:
        update_trust_score_for_activity(tables, porter_username, ultimate_buyer_username, TRUST_SCORE_MINOR_POSITIVE, "logistics_task_completion", True)

    # Note: This processor only handles the current activity and does not create follow-up activities.
    # Any subsequent activities should be created by activity creators, not processors.
    log.info(f"{LogColors.OKGREEN}Successfully processed 'fetch_for_logistics_client' activity {activity_guid}.{LogColors.ENDC}")
    return True
