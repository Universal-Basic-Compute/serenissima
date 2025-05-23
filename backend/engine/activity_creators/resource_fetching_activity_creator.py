"""
Creator for 'fetch_resource' activities.
"""
import logging
import datetime
import time
import json
import uuid # Already imported in createActivities, but good practice here too
import pytz # For timezone handling
from typing import Dict, Optional, Any

log = logging.getLogger(__name__)

def try_create(
    tables: Dict[str, Any],
    citizen_airtable_id: str, # Airtable record ID of the citizen
    citizen_custom_id: str,   # Custom CitizenId (ctz_...)
    citizen_username: str,    # Username
    contract_airtable_id: str,# Airtable record ID of the contract
    from_building_airtable_id: str, # Airtable record ID of the source building
    to_building_airtable_id: str,   # Airtable record ID of the destination building
    resource_type: str,
    amount: float,
    path_data: Dict # Path data from transport API
) -> Optional[Dict]:
    """Creates a resource fetching activity based on a contract."""
    log.info(f"Attempting to create resource fetching activity for {citizen_username} from {from_building_airtable_id} to {to_building_airtable_id}")

    try:
        now = datetime.datetime.now(pytz.UTC)
        
        travel_time_minutes = 30  # Default
        if 'timing' in path_data and 'durationSeconds' in path_data['timing']:
            travel_time_minutes = path_data['timing']['durationSeconds'] / 60
        
        end_time = now + datetime.timedelta(minutes=travel_time_minutes)
        activity_id_str = f"fetch_{citizen_custom_id}_{uuid.uuid4()}"
        
        # Fetch building names for notes if possible (optional, for richer notes)
        from_building_name = from_building_airtable_id
        to_building_name = to_building_airtable_id
        try:
            from_b_rec = tables['buildings'].get(from_building_airtable_id)
            to_b_rec = tables['buildings'].get(to_building_airtable_id)
            if from_b_rec: from_building_name = from_b_rec['fields'].get('Name', from_building_airtable_id)
            if to_b_rec: to_building_name = to_b_rec['fields'].get('Name', to_building_airtable_id)
        except Exception:
            pass # Ignore if fetching names fails, use IDs

        transporter = path_data.get('transporter') # Get transporter from path_data

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "fetch_resource",
            "Citizen": citizen_username,
            "ContractId": contract_airtable_id, # Link to contract by Airtable ID
            "FromBuilding": from_building_airtable_id,
            "ToBuilding": to_building_airtable_id,
            "ResourceId": resource_type, # Store the specific resource type being fetched
            "Amount": amount,           # Store the amount
            "CreatedAt": now.isoformat(),
            "StartDate": now.isoformat(),
            "EndDate": end_time.isoformat(),
            "Path": json.dumps(path_data.get('path', [])),
            "Transporter": transporter, # Add Transporter field
            "Notes": f"🚚 Fetching **{amount:,.0f}** units of **{resource_type}** from **{from_building_name}** to **{to_building_name}**"
        }
        
        activity = tables['activities'].create(activity_payload)
        
        if activity and activity.get('id'):
            log.info(f"Created resource fetching activity: {activity['id']}")
            try:
                updated_at_ts = datetime.datetime.now(pytz.UTC).isoformat()
                tables['citizens'].update(citizen_airtable_id, {'UpdatedAt': updated_at_ts})
                log.info(f"Updated 'UpdatedAt' for citizen record {citizen_airtable_id}")
            except Exception as e_update:
                log.error(f"Error updating 'UpdatedAt' for citizen record {citizen_airtable_id}: {e_update}")
            return activity
        else:
            log.error(f"Failed to create resource fetching activity for {citizen_username}")
            return None
    except Exception as e:
        log.error(f"Error creating resource fetching activity for {citizen_username}: {e}")
        return None
