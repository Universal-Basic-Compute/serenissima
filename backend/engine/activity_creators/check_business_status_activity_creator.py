"""
Creator for 'check_business_status' activities.
"""
import logging
import datetime
import time
import json
import uuid
import pytz
from typing import Dict, Optional, Any

from backend.engine.utils.activity_helpers import get_building_record, _get_building_position_coords, get_path_between_points, _calculate_distance_meters, LogColors

log = logging.getLogger(__name__)

DEFAULT_PRIORITY_CHECK_BUSINESS = 12 # High priority, but after critical needs

def try_create(
    tables: Dict[str, Any],
    citizen_custom_id: str,
    citizen_username: str,
    citizen_airtable_id: str,
    business_building_custom_id: str, # The business building to check
    path_data: Optional[Dict], # Path from citizen's current location to the business
    current_time_utc: datetime.datetime,
    start_time_utc_iso: Optional[str] = None # New parameter
) -> Optional[Dict]:
    """
    Creates a 'check_business_status' activity.
    If path_data is None, citizen is assumed to be at the business.
    """
    log.info(f"Attempting to create 'check_business_status' for {citizen_username} at business {business_building_custom_id} with explicit start: {start_time_utc_iso}")

    try:
        activity_id_str = f"chk_biz_{citizen_custom_id}_{uuid.uuid4()}"
        
        effective_start_date_iso: str
        effective_end_date_iso: str
        path_json = "[]"
        transporter = None
        
        check_duration_minutes = 15 # Duration of the check itself

        if start_time_utc_iso:
            effective_start_date_iso = start_time_utc_iso
            start_dt_obj = datetime.datetime.fromisoformat(effective_start_date_iso.replace("Z", "+00:00"))
            if start_dt_obj.tzinfo is None: start_dt_obj = pytz.UTC.localize(start_dt_obj)

            if path_data and path_data.get('success') and path_data.get('timing', {}).get('durationSeconds') is not None:
                travel_duration_seconds = path_data['timing']['durationSeconds']
                arrival_dt = start_dt_obj + datetime.timedelta(seconds=travel_duration_seconds)
                effective_end_date_iso = (arrival_dt + datetime.timedelta(minutes=check_duration_minutes)).isoformat()
                path_json = json.dumps(path_data.get('path', []))
                transporter = path_data.get('transporter')
            else: # No travel or path_data missing duration
                effective_end_date_iso = (start_dt_obj + datetime.timedelta(minutes=check_duration_minutes)).isoformat()
        
        elif path_data and path_data.get('success') and path_data.get('timing', {}).get('startDate') and path_data.get('timing', {}).get('endDate'):
            effective_start_date_iso = path_data['timing']['startDate']
            arrival_at_business_iso = path_data['timing']['endDate']
            arrival_dt = datetime.datetime.fromisoformat(arrival_at_business_iso.replace("Z", "+00:00"))
            if arrival_dt.tzinfo is None: arrival_dt = pytz.UTC.localize(arrival_dt)
            effective_end_date_iso = (arrival_dt + datetime.timedelta(minutes=check_duration_minutes)).isoformat()
            path_json = json.dumps(path_data.get('path', []))
            transporter = path_data.get('transporter')
        else: # Fallback to current_time_utc and default duration for check only
            effective_start_date_iso = current_time_utc.isoformat()
            effective_end_date_iso = (current_time_utc + datetime.timedelta(minutes=check_duration_minutes)).isoformat()

        business_record = get_building_record(tables, business_building_custom_id)
        business_name_desc = business_record['fields'].get('Name', business_record['fields'].get('Type', business_building_custom_id)) if business_record else business_building_custom_id

        activity_payload = {
            "ActivityId": activity_id_str,
            "Type": "check_business_status",
            "Citizen": citizen_username,
            "FromBuilding": business_building_custom_id, # From and To are the same if no pathing, or citizen is already there
            "ToBuilding": business_building_custom_id,   # This is the business to check
            "Path": path_json,
            "Transporter": transporter,
            "CreatedAt": effective_start_date_iso,
            "StartDate": effective_start_date_iso,
            "EndDate": effective_end_date_iso,
            "Status": "created",
            "Priority": DEFAULT_PRIORITY_CHECK_BUSINESS,
            "Notes": f"💼 Checking status of business: {business_name_desc}",
            "Description": f"Going to {business_name_desc} to manage the business"
        }
        
        created_activity = tables['activities'].create(activity_payload)
        if created_activity and created_activity.get('id'):
            log.info(f"Successfully created 'check_business_status' activity: {created_activity['id']}")
            return created_activity
        else:
            log.error(f"Failed to create 'check_business_status' activity for {citizen_username} at {business_building_custom_id}")
            return None

    except Exception as e:
        log.error(f"Error creating 'check_business_status' activity: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
