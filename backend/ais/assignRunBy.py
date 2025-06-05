import os
import sys
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
import json # For parsing position strings

# Add the project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from dotenv import load_dotenv
from pyairtable import Api, Table
from backend.engine.utils.activity_helpers import calculate_haversine_distance_meters, _get_building_position_coords, LogColors, log_header

# --- Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout) # Ensure logs go to stdout
    ]
)
log = logging.getLogger(__name__)

# LogColors will be imported from activity_helpers
# from backend.engine.utils.activity_helpers import LogColors, log_header # Added log_header

# Explicitly load .env from the project root
dotenv_path = os.path.join(PROJECT_ROOT, '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path=dotenv_path)
    log.info(f"Loaded environment variables from: {dotenv_path}")
else:
    log.warning(f".env file not found at: {dotenv_path}. Relying on system environment variables.")
    # Attempt to load from default locations if not found at root (optional, default behavior of load_dotenv())
    load_dotenv() 

AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

MAX_BUSINESSES_PER_CITIZEN = 10

SOCIAL_CLASS_TIER_MAP = {
    "Facchini": 1,
    "Popolani": 2,
    "Cittadini": 3,
    # Nobili and Forestieri are excluded from running businesses via this script
}

# --- Airtable Initialization ---
def initialize_airtable() -> Dict[str, Table]:
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error("Airtable API Key or Base ID not configured. Exiting.")
        sys.exit(1)
    api = Api(AIRTABLE_API_KEY)
    return {
        "citizens": api.table(AIRTABLE_BASE_ID, "CITIZENS"),
        "buildings": api.table(AIRTABLE_BASE_ID, "BUILDINGS"),
        "relationships": api.table(AIRTABLE_BASE_ID, "RELATIONSHIPS"),
        "notifications": api.table(AIRTABLE_BASE_ID, "NOTIFICATIONS"),
    }

# --- Helper Functions ---
def get_relationship_score(citizen1_username: Optional[str], citizen2_username: Optional[str], relationships_map: Dict[Tuple[str, str], Dict[str, Any]]) -> float:
    if not citizen1_username or not citizen2_username:
        return 0.0
    key = tuple(sorted((citizen1_username, citizen2_username)))
    relationship = relationships_map.get(key)
    if relationship:
        strength = float(relationship.get('StrengthScore', 0.0) or 0.0)
        trust = float(relationship.get('TrustScore', 0.0) or 0.0)
        return strength + trust # Or however you want to combine them
    return 0.0

def count_businesses_run_by_citizen(citizen_username: str, all_buildings: List[Dict[str, Any]]) -> int:
    count = 0
    for building in all_buildings:
        if building['fields'].get('RunBy') == citizen_username and building['fields'].get('Category') == 'business':
            count += 1
    return count

def get_citizen_home_coords(citizen_username: str, all_citizens_records: List[Dict[str, Any]], all_buildings_records: List[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    """Get the coordinates of a citizen's home building."""
    home_building_record = None
    for building in all_buildings_records:
        if building['fields'].get('Occupant') == citizen_username and building['fields'].get('Category') == 'home':
            home_building_record = building
            break
    
    if home_building_record:
        coords = _get_building_position_coords(home_building_record)
        if coords: return coords # Ensure coords are valid
    
    # Fallback to citizen's direct position if no home building found or home has no coords
    citizen_record = next((c for c in all_citizens_records if c['fields'].get('Username') == citizen_username), None)
    if citizen_record:
        pos_str = citizen_record['fields'].get('Position')
        if pos_str:
            try:
                pos_data = json.loads(pos_str)
                if isinstance(pos_data, dict) and 'lat' in pos_data and 'lng' in pos_data:
                    return {'lat': float(pos_data['lat']), 'lng': float(pos_data['lng'])}
            except (json.JSONDecodeError, TypeError, ValueError) as e:
                log.debug(f"Could not parse position for citizen {citizen_username}: {pos_str}. Error: {e}")
    return None

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str, # The citizen initiating the activity (e.g., building owner)
    activity_type: str,
    activity_parameters: Dict[str, Any],
    dry_run: bool,
    log_ref: Any # Pass the script's logger
) -> bool:
    """Calls the /api/activities/try-create endpoint."""
    # API_BASE_URL needs to be defined globally or passed. Assuming it's global for now.
    # If not, it should be loaded from os.getenv("API_BASE_URL", "http://localhost:3000")
    # For this script, API_BASE_URL is not defined. Let's define it.
    # This should ideally be at the top of the file.
    current_api_base_url = os.getenv("API_BASE_URL", "http://localhost:3000")

    if dry_run:
        log_ref.info(f"{LogColors.OKCYAN}[DRY RUN] Would call /api/activities/try-create for {citizen_username} with type '{activity_type}' and params: {json.dumps(activity_parameters)}{LogColors.ENDC}")
        return True # Simulate success for dry run

    api_url = f"{current_api_base_url}/api/activities/try-create"
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": activity_parameters
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        # This script uses 'requests' which is not imported. It needs to be imported.
        # import requests # Should be at the top of the file.
        # For now, assuming requests is available in the environment this helper is pasted into.
        # If this script is run standalone, it will fail without `import requests`.
        # Let's add the import within the function for now, though it's not best practice.
        import requests 
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        if response_data.get("success"):
            log_ref.info(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{LogColors.ENDC}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 log_ref.info(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            log_ref.error(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        log_ref.error(f"{LogColors.FAIL}API request failed for activity '{activity_type}' for {citizen_username}: {e}{LogColors.ENDC}")
        return False
    except json.JSONDecodeError:
        log_ref.error(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return False

# --- Main Logic ---
def assign_runby_to_buildings(tables: Dict[str, Table], dry_run: bool = False):
    log_header(f"Assign RunBy to Buildings Process (dry_run={dry_run})", LogColors.HEADER)

    all_citizens_records = tables["citizens"].all()
    all_buildings_records = tables["buildings"].all()
    all_relationships_records = tables["relationships"].all()

    relationships_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for rel in all_relationships_records:
        c1 = rel['fields'].get('Citizen1')
        c2 = rel['fields'].get('Citizen2')
        if c1 and c2:
            relationships_map[tuple(sorted((c1, c2)))] = rel['fields']

    buildings_needing_runby: List[Dict[str, Any]] = []
    skipped_has_runby = 0
    skipped_no_owner = 0
    skipped_not_business = 0
    total_buildings_processed = 0

    for building in all_buildings_records:
        total_buildings_processed +=1
        fields = building['fields']
        building_id_for_log = building.get('id', 'N/A') # Use record ID if BuildingId is missing

        if fields.get('Category') != 'business':
            skipped_not_business += 1
            # log.debug(f"Building {building_id_for_log} skipped: Not a business (Category: {fields.get('Category')}).")
            continue 
        
        if not fields.get('Owner'):
            skipped_no_owner += 1
            log.debug(f"Business building {building_id_for_log} skipped: No Owner.")
            continue

        if fields.get('RunBy'):
            skipped_has_runby += 1
            log.debug(f"Business building {building_id_for_log} skipped: Already has RunBy ({fields.get('RunBy')}).")
            continue
            
        buildings_needing_runby.append(building)
    
    log.info(f"Processed {total_buildings_processed} total building records.")
    log.info(f"Skipped {skipped_not_business} non-business buildings.")
    log.info(f"Skipped {skipped_no_owner} business buildings with no Owner.")
    log.info(f"Skipped {skipped_has_runby} business buildings that already have a RunBy.")
    log.info(f"Identified {len(buildings_needing_runby)} business buildings needing a RunBy assignment.")

    # Sort buildings by Wages in descending order. Buildings without 'Wages' or with None are treated as 0.
    buildings_needing_runby.sort(key=lambda b: b['fields'].get('Wages', 0) or 0, reverse=True)
    if buildings_needing_runby:
        log.info(f"Buildings needing RunBy sorted by Wages (DESC). Top 5 wages: {[b['fields'].get('Wages', 0) for b in buildings_needing_runby[:5]]}")
    else:
        log.info("No buildings to sort by wages as the list is empty.")


    if not buildings_needing_runby:
        log.info("No buildings require RunBy assignment after filtering.")
        return

    citizen_business_counts: Dict[str, int] = {}
    eligible_citizens_initial: List[Dict[str, Any]] = []
    for citizen in all_citizens_records:
        fields = citizen['fields']
        username = fields.get('Username')
        if not username: continue
        # Condition modifiée: InVenice == 1 est la clé, IsAI n'est plus un critère ici.
        if fields.get('InVenice') == 1 and fields.get('SocialClass') not in ['Nobili', 'Forestieri']:
            num_businesses = count_businesses_run_by_citizen(username, all_buildings_records)
            citizen_business_counts[username] = num_businesses
            if num_businesses < MAX_BUSINESSES_PER_CITIZEN:
                eligible_citizens_initial.append(citizen)

    log.info(f"Found {len(eligible_citizens_initial)} citizens initially eligible to run businesses.")
    if not eligible_citizens_initial:
        log.info("No eligible citizens to assign as RunBy.")
        return

    assignments_made = 0
    updates_to_batch: List[Dict[str, Any]] = []

    for building_to_assign in buildings_needing_runby:
        building_id = building_to_assign['id']
        building_owner_username = building_to_assign['fields'].get('Owner')
        building_name = building_to_assign['fields'].get('Name', building_id)
        business_building_coords = _get_building_position_coords(building_to_assign)


        best_candidate_username: Optional[str] = None
        highest_score = -float('inf') # Initialize with negative infinity for proper comparison

        current_eligible_candidates = [
            c for c in eligible_citizens_initial
            if citizen_business_counts.get(c['fields'].get('Username'), 0) < MAX_BUSINESSES_PER_CITIZEN
        ]

        if not current_eligible_candidates:
            log.warning(f"No eligible candidates left with capacity for building {building_name}.")
            continue

        for candidate_citizen in current_eligible_candidates:
            candidate_fields = candidate_citizen['fields']
            candidate_username = candidate_fields.get('Username')
            if not candidate_username: continue

            relationship_score = get_relationship_score(building_owner_username, candidate_username, relationships_map)
            influence = float(candidate_fields.get('Influence', 0.0) or 0.0)
            daily_income = float(candidate_fields.get('DailyIncome', 0.0) or 0.0)
            daily_turnover = float(candidate_fields.get('DailyTurnover', 0.0) or 0.0)
            social_class = candidate_fields.get('SocialClass')
            social_class_tier = SOCIAL_CLASS_TIER_MAP.get(social_class, 0)
            is_owner_factor = 4 if candidate_username == building_owner_username else 1
            num_businesses_run = citizen_business_counts.get(candidate_username, 0)

            distance_to_home_m = 0.0
            if business_building_coords: # Only calculate distance if business has coords
                candidate_home_coords = get_citizen_home_coords(candidate_username, all_citizens_records, all_buildings_records)
                if candidate_home_coords:
                    try:
                        distance_to_home_m = calculate_haversine_distance_meters(
                            candidate_home_coords['lat'], candidate_home_coords['lng'],
                            business_building_coords['lat'], business_building_coords['lng']
                        )
                    except Exception as e_dist:
                        log.warning(f"Could not calculate distance for {candidate_username} to {building_name}: {e_dist}")
                        distance_to_home_m = 20000.0 # Penalize heavily if distance calc fails but coords exist
                else: # Candidate has no home coords
                    log.debug(f"Candidate {candidate_username} has no home coordinates for distance calculation. Using large distance penalty.")
                    distance_to_home_m = 20000.0 # Penalize if no home coords
            else: # Business building has no coords
                log.debug(f"Business building {building_name} has no coordinates. Using large distance penalty for all candidates.")
                distance_to_home_m = 20000.0 # Penalize if business has no coords

            # Score calculation: (Rel*10 + Inf*10 + Income + Turnover - Distance) * Tier * OwnerFactor / (BizRun + 1)
            # Subtracting distance_to_home_m so that SHORTER distances are better.
            # We use a large penalty for missing coords to push these candidates down.
            base_score_components = (relationship_score * 10) + \
                                    (influence * 10) + \
                                    daily_income + \
                                    daily_turnover - \
                                    distance_to_home_m
            
            numerator = base_score_components * social_class_tier * is_owner_factor
            denominator = num_businesses_run + 1
            score = numerator / denominator if denominator > 0 else 0.0

            log.debug(f"  Candidate {candidate_username} for building {building_name}: RelScore={relationship_score:.2f}, Inf={influence:.2f}, Inc={daily_income:.2f}, Turn={daily_turnover:.2f}, DistHome={distance_to_home_m:.0f}m, Tier={social_class_tier}, OwnerF={is_owner_factor}, BizRun={num_businesses_run}, Score={score:.2f}")

            if score > highest_score:
                highest_score = score
                best_candidate_username = candidate_username
        
        if best_candidate_username:
            # Retrieve the full record of the best candidate to get all details for reasoning
            final_candidate_record = next((c for c in current_eligible_candidates if c['fields'].get('Username') == best_candidate_username), None)
            
            reasoning_details = {}
            if final_candidate_record:
                fc_fields = final_candidate_record['fields']
                fc_relationship_score = get_relationship_score(building_owner_username, best_candidate_username, relationships_map)
                fc_influence = float(fc_fields.get('Influence', 0.0) or 0.0)
                fc_daily_income = float(fc_fields.get('DailyIncome', 0.0) or 0.0)
                fc_daily_turnover = float(fc_fields.get('DailyTurnover', 0.0) or 0.0)
                fc_social_class = fc_fields.get('SocialClass')
                fc_social_class_tier = SOCIAL_CLASS_TIER_MAP.get(fc_social_class, 0)
                fc_is_owner_factor = 4 if best_candidate_username == building_owner_username else 1
                fc_num_businesses_run = citizen_business_counts.get(best_candidate_username, 0) # This is before incrementing for the current assignment

                fc_distance_to_home_m = 0.0
                if business_building_coords:
                    fc_home_coords = get_citizen_home_coords(best_candidate_username, all_citizens_records, all_buildings_records)
                    if fc_home_coords:
                        try:
                            fc_distance_to_home_m = calculate_haversine_distance_meters(
                                fc_home_coords['lat'], fc_home_coords['lng'],
                                business_building_coords['lat'], business_building_coords['lng']
                            )
                        except: fc_distance_to_home_m = 20000.0
                    else: fc_distance_to_home_m = 20000.0
                else: fc_distance_to_home_m = 20000.0

                fc_base_score_components = (fc_relationship_score * 10) + \
                                           (fc_influence * 10) + \
                                           fc_daily_income + \
                                           fc_daily_turnover - \
                                           fc_distance_to_home_m
                fc_numerator = fc_base_score_components * fc_social_class_tier * fc_is_owner_factor
                fc_denominator = fc_num_businesses_run + 1 # Denominator for the score that was calculated

                reasoning_details = {
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "assignedRunBy": best_candidate_username,
                    "score": highest_score,
                    "components": {
                        "relationshipScoreWithOwner": round(fc_relationship_score, 2),
                        "influence": round(fc_influence, 2),
                        "dailyIncome": round(fc_daily_income, 2),
                        "dailyTurnover": round(fc_daily_turnover, 2),
                        "distanceToHomeM": round(fc_distance_to_home_m, 0),
                        "socialClassTier": fc_social_class_tier,
                        "isOwnerFactor": fc_is_owner_factor,
                        "numBusinessesAlreadyRun_before_assign": fc_num_businesses_run, # num_businesses_run at the time of scoring
                        "baseScoreComponents": round(fc_base_score_components, 2),
                        "numerator": round(fc_numerator, 2),
                        "denominator": fc_denominator
                    }
                }
                log.info(f"Assigning {LogColors.OKGREEN}{best_candidate_username}{LogColors.ENDC} to run building {LogColors.OKCYAN}{building_name}{LogColors.ENDC} (Owner: {building_owner_username}, Score: {highest_score:.2f})")
                log.info(f"  Reasoning details: {json.dumps(reasoning_details, indent=2)}")

            current_notes_str = building_to_assign['fields'].get('Notes', '{}')
            try:
                current_notes_json = json.loads(current_notes_str) if current_notes_str else {}
                if not isinstance(current_notes_json, dict): # If Notes was plain text
                    current_notes_json = {"previousNotes": current_notes_str}
            except json.JSONDecodeError:
                current_notes_json = {"previousNotes": current_notes_str} # Preserve non-JSON notes
            
            current_notes_json["runByAssignment"] = reasoning_details
            # updated_notes_str = json.dumps(current_notes_json) # Notes will be handled by activity if needed

            # Initiate activity instead of direct update
            operation_type = "claim_management" if best_candidate_username == building_owner_username else "delegate"
            activity_params = {
                "businessBuildingId": building_to_assign['fields'].get('BuildingId', building_id), # Use custom BuildingId
                "newOperatorUsername": best_candidate_username,
                "ownerUsername": building_owner_username, # Pass owner for verification/context in activity
                "reason": f"System assignment: {best_candidate_username} chosen for {building_name} based on scoring. Score: {highest_score:.2f}",
                "operationType": operation_type,
                "notes": current_notes_json # Pass the full notes dict to be handled by the activity
            }

            # The initiator of this activity is the building_owner_username
            if call_try_create_activity_api(building_owner_username, "change_business_manager", activity_params, dry_run, log):
                # Increment business count for the chosen candidate for subsequent iterations in this run
                citizen_business_counts[best_candidate_username] = citizen_business_counts.get(best_candidate_username, 0) + 1
                assignments_made += 1
                # Add to a list for admin summary if needed, but direct updates_to_batch is removed
            else:
                log.error(f"Failed to initiate 'change_business_manager' activity for building {building_name}, owner {building_owner_username}, new operator {best_candidate_username}.")
        else:
            log.warning(f"No suitable candidate found to run building {building_name} (Owner: {building_owner_username}).")

    # Admin notification for the script's run can remain, summarizing assignments_made
    if assignments_made > 0 and not dry_run:
        try:
            admin_notification_content = f"Assign RunBy Script: {assignments_made} 'change_business_manager' activities were initiated."
            tables["notifications"].create({
                "Citizen": "ConsiglioDeiDieci",
                "Type": "admin_report_assign_runby",
                "Content": admin_notification_content,
                "Status": "unread",
                "CreatedAt": datetime.utcnow().isoformat() + "Z"
            })
            log.info(f"Admin notification created for {assignments_made} initiated assignments.")
        except Exception as e:
            log.error(f"{LogColors.FAIL}Error during admin notification creation: {e}{LogColors.ENDC}")
    elif assignments_made > 0 and dry_run:
        log.info(f"{LogColors.OKBLUE}[DRY RUN] Would have initiated {assignments_made} 'change_business_manager' activities and sent an admin notification.{LogColors.ENDC}")
    else:
        log.info("No RunBy assignments were made or initiated in this run.")

    log.info(f"{LogColors.HEADER}Assign RunBy to Buildings process finished. {assignments_made} assignments initiated/simulated.{LogColors.ENDC}")

# --- CLI Argument Parsing ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Assign RunBy to buildings that have an Owner but no RunBy.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the script without making any changes to Airtable."
    )
    args = parser.parse_args()

    try:
        airtable_tables = initialize_airtable()
        assign_runby_to_buildings(airtable_tables, args.dry_run)
    except Exception as e:
        log.critical(f"{LogColors.FAIL}An unexpected error occurred: {e}{LogColors.ENDC}", exc_info=True)
        sys.exit(1)
