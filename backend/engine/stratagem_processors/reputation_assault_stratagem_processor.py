"""
Stratagem Processor for "reputation_assault".

This processor:
1. Identifies citizens related to the target.
2. For each related citizen, generates a negative message using KinOS.
3. Sends the message from the executor to the related citizen.
4. Damages the relationship between the executor and the target.
"""

import logging
import json
import os
import requests
import pytz
from datetime import datetime
from typing import Dict, Any, Optional, List

from backend.engine.utils.activity_helpers import (
    LogColors,
    _escape_airtable_value,
    get_citizen_record,
    clean_thought_content # For cleaning AI generated messages
)
from backend.engine.utils.relationship_helpers import (
    update_trust_score_for_activity,
    _rh_get_relationship_data, # Helper to get relationship details
    _rh_get_notifications_data_api, # Helper for context
    _rh_get_relevancies_data_api, # Helper for context
    _rh_get_problems_data_api, # Helper for context
    _get_kinos_api_key, # Helper for KinOS API key
    _generate_kinos_message_content, # Helper to call KinOS
    _store_message_via_api, # Helper to store message
    _rh_get_kinos_model_for_citizen # Helper to get model based on social class
)
# _call_kinos_analysis_api is no longer used here, trust impact is handled by conversation_helper

log = logging.getLogger(__name__)

# Helper function to safely parse JSON from requests.Response
def _safe_response_json(response: requests.Response, context_msg: str) -> Optional[Dict]:
    """Safely parses JSON from a requests.Response object."""
    try:
        return response.json()
    except json.JSONDecodeError as e:
        log.error(f"{LogColors.FAIL}JSONDecodeError for {context_msg}: {e}. Status: {response.status_code}. Response text (first 200 chars): {response.text[:200]}{LogColors.ENDC}")
        return None

# KINOS_API_URL_BASE = "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins" # Defined in relationship_helpers
NEXT_JS_BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

def _get_related_citizens(tables: Dict[str, Any], target_username: str, limit: int = 50) -> List[str]:
    """
    Fetches usernames of citizens who have a relationship with the target_username,
    ordered by StrengthScore descending, up to a specified limit.
    """
    related_usernames_set: set[str] = set()
    try:
        escaped_target_username = _escape_airtable_value(target_username)
        formula = f"OR({{Citizen1}}='{escaped_target_username}', {{Citizen2}}='{escaped_target_username}')"
        
        # Fetch relationships, sorted by StrengthScore descending
        # Ensure StrengthScore is a number in Airtable for correct sorting.
        # Pyairtable handles missing fields by typically sorting them last.
        relationships = tables['relationships'].all(
            formula=formula,
            fields=['Citizen1', 'Citizen2', 'StrengthScore'], # StrengthScore needed for sorting
            sort=['-StrengthScore'], # Use string format for descending sort
            max_records=limit * 2 # Fetch a bit more to account for filtering out target_username and ensuring enough unique results
        )
        
        log.info(f"{LogColors.PROCESS}Fetched {len(relationships)} raw relationship records for {target_username} (sorted by StrengthScore desc).")

        count = 0
        for rel in relationships:
            if count >= limit:
                break

            c1 = rel['fields'].get('Citizen1')
            c2 = rel['fields'].get('Citizen2')
            
            other_citizen = None
            if c1 == target_username:
                other_citizen = c2
            elif c2 == target_username:
                other_citizen = c1
            
            if other_citizen and other_citizen != target_username: # Ensure it's not the target themselves
                if other_citizen not in related_usernames_set:
                    related_usernames_set.add(other_citizen)
                    count += 1
        
        unique_related_list = list(related_usernames_set)
        # The list is already effectively sorted by StrengthScore due to the query order and set insertion order (for unique elements)
        # If strict top N by score is needed even after deduplication, a re-sort might be needed if many duplicates exist among top scores.
        # However, for this use case, this should be sufficient.

        log.info(f"{LogColors.PROCESS}Found {len(unique_related_list)} unique citizens related to {target_username} (top {limit} by StrengthScore): {unique_related_list}{LogColors.ENDC}")
        return unique_related_list
    except Exception as e:
        log.error(f"{LogColors.FAIL}Error fetching related citizens for {target_username}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
        return []

def process(
    tables: Dict[str, Any],
    stratagem_record: Dict[str, Any],
    resource_defs: Optional[Dict[str, Any]] = None,
    building_type_defs: Optional[Dict[str, Any]] = None,
    api_base_url: Optional[str] = None # This is the Python engine's own base URL if needed
) -> bool:
    stratagem_fields = stratagem_record['fields']
    stratagem_id = stratagem_fields.get('StratagemId', stratagem_record['id'])
    executed_by_username = stratagem_fields.get('ExecutedBy')
    target_citizen_username = stratagem_fields.get('TargetCitizen')
    stratagem_notes = stratagem_fields.get('Notes', "")

    # Extract assaultAngle and kinosModelOverride from notes
    assault_angle_from_notes: Optional[str] = None
    kinos_model_override_from_notes: Optional[str] = None

    notes_lines = stratagem_notes.split('\n')
    remaining_notes_for_log = []
    for line in notes_lines:
        if line.startswith("Angle: "):
            assault_angle_from_notes = line.split("Angle: ", 1)[1].strip()
        elif line.startswith("KinosModelOverride: "):
            kinos_model_override_from_notes = line.split("KinosModelOverride: ", 1)[1].strip()
        else:
            remaining_notes_for_log.append(line)
    
    log_message_parts = [
        f"{LogColors.STRATAGEM_PROCESSOR}Processing 'reputation_assault' stratagem {stratagem_id} ",
        f"by {executed_by_username} against {target_citizen_username}."
    ]
    if assault_angle_from_notes:
        log_message_parts.append(f" Angle: '{assault_angle_from_notes}'.")
    if kinos_model_override_from_notes:
        log_message_parts.append(f" KinOS Model Override: '{kinos_model_override_from_notes}'.")
    
    log.info("".join(log_message_parts) + LogColors.ENDC)

    if not executed_by_username or not target_citizen_username:
        log.error(f"{LogColors.FAIL}Stratagem {stratagem_id} missing ExecutedBy or TargetCitizen. Cannot process.{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': 'Missing ExecutedBy or TargetCitizen.'})
        return False

    kinos_api_key = _get_kinos_api_key()
    if not kinos_api_key:
        log.error(f"{LogColors.FAIL}KinOS API key not found. Cannot generate messages for stratagem {stratagem_id}.{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': 'KinOS API key missing.'})
        return False

    # 1. Fetch data packages for executor and target
    log.info(f"{LogColors.PROCESS}Fetching data package for executor {executed_by_username}...{LogColors.ENDC}")
    executor_dp_response = requests.get(f"{NEXT_JS_BASE_URL}/api/get-data-package?citizenUsername={executed_by_username}&format=json", timeout=30)
    if not executor_dp_response.ok:
        log.error(f"{LogColors.FAIL}Failed to fetch data package for executor {executed_by_username}. Status: {executor_dp_response.status_code}, Response: {executor_dp_response.text[:200]}{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': f'Failed to fetch data for executor {executed_by_username}.'})
        return False
    
    executor_dp_json = _safe_response_json(executor_dp_response, f"executor data package for {executed_by_username}")
    if not executor_dp_json:
        log.error(f"{LogColors.FAIL}Failed to parse JSON for executor data package {executed_by_username}. Marking stratagem as failed.{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': f'Failed to parse JSON data for executor {executed_by_username}.'})
        return False
    executor_data_package = executor_dp_json.get('data', {})
    executor_profile_for_kinos = executor_data_package.get('citizen', {})
    if not executor_profile_for_kinos: # Check if citizen profile itself is missing after successful parse
        log.warning(f"{LogColors.WARNING}Executor profile missing in data package for {executed_by_username}. Proceeding with empty profile.{LogColors.ENDC}")
        executor_profile_for_kinos = {}
    executor_display_name = executor_profile_for_kinos.get('FirstName', executed_by_username)
    
    # Determine model for executor: use override if present, else default to social class
    model_for_executor = kinos_model_override_from_notes
    if not model_for_executor:
        executor_social_class = executor_profile_for_kinos.get("SocialClass")
        model_for_executor = _rh_get_kinos_model_for_citizen(executor_social_class)
    log.info(f"{LogColors.PROCESS}Executor '{executed_by_username}' will use KinOS model: '{model_for_executor}' for generating messages.{LogColors.ENDC}")

    log.info(f"{LogColors.PROCESS}Fetching data package for target {target_citizen_username}...{LogColors.ENDC}")
    target_dp_response = requests.get(f"{NEXT_JS_BASE_URL}/api/get-data-package?citizenUsername={target_citizen_username}&format=json", timeout=30)
    if not target_dp_response.ok:
        log.error(f"{LogColors.FAIL}Failed to fetch data package for target {target_citizen_username}. Status: {target_dp_response.status_code}, Response: {target_dp_response.text[:200]}{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': f'Failed to fetch data for target {target_citizen_username}.'})
        return False
    
    target_dp_json = _safe_response_json(target_dp_response, f"target data package for {target_citizen_username}")
    if not target_dp_json:
        log.error(f"{LogColors.FAIL}Failed to parse JSON for target data package {target_citizen_username}. Marking stratagem as failed.{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': f'Failed to parse JSON data for target {target_citizen_username}.'})
        return False
    target_data_package = target_dp_json.get('data', {})
    target_profile_for_kinos = target_data_package.get('citizen', {})
    if not target_profile_for_kinos:
        log.warning(f"{LogColors.WARNING}Target profile missing in data package for {target_citizen_username}. Proceeding with empty profile.{LogColors.ENDC}")
        target_profile_for_kinos = {} # Ensure it's a dict
    target_display_name = target_profile_for_kinos.get('FirstName', target_citizen_username)

    # 2. Generate Core Attack Narrative (KinOS Call 1: Executor to Self)
    log.info(f"{LogColors.PROCESS}Generating core attack narrative for {executed_by_username} against {target_citizen_username}...{LogColors.ENDC}")
    add_system_for_narrative_gen = {
        "executor_profile_and_data": executor_data_package,
        "target_profile_and_data": target_data_package,
        "assault_angle_directive": assault_angle_from_notes or "any effective angle"
    }
    prompt_for_narrative_gen = (
        f"You are {executor_display_name}. You are planning a reputation assault against {target_display_name}. "
        f"Your goal is to craft a compelling narrative or set of talking points that will damage their reputation. "
        f"Use the provided `assault_angle_directive` ('{assault_angle_from_notes or 'any effective angle'}') as the core theme. "
        f"You have access to your own data (`executor_profile_and_data`) and the target's data (`target_profile_and_data`). "
        f"You can use factual information, misinterpretations, or even plausible fabrications to build your case. "
        f"Your output should be ONLY the core attack narrative/talking points you will use. Be strategic and persuasive. This text will be used by you in subsequent messages."
    )
    
    core_attack_narrative = _generate_kinos_message_content(
        kin_username=executed_by_username,
        channel_username=executed_by_username, # Self-chat
        prompt=prompt_for_narrative_gen,
        kinos_api_key=kinos_api_key,
        kinos_model_override=model_for_executor,
        add_system_data=add_system_for_narrative_gen,
        tables=tables # Pass tables for summarization if local model
    )

    if not core_attack_narrative:
        log.error(f"{LogColors.FAIL}Failed to generate core attack narrative for stratagem {stratagem_id}. Aborting.{LogColors.ENDC}")
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'failed', 'Notes': 'Failed to generate core attack narrative.'})
        return False
    
    cleaned_core_attack_narrative = clean_thought_content(tables, core_attack_narrative)
    log.info(f"{LogColors.PROCESS}Generated Core Attack Narrative (cleaned, first 100 chars): '{cleaned_core_attack_narrative[:100]}...'{LogColors.ENDC}")
    
    # Store this narrative as a self-message (thought) for the executor
    _store_message_via_api(
        tables, 
        executed_by_username, 
        executed_by_username, 
        f"Strategizing Reputation Assault against {target_citizen_username} (Angle: {assault_angle_from_notes or 'N/A'}):\n\n{cleaned_core_attack_narrative}", 
        f"stratagem_plan_{stratagem_id}",
        message_type="stratagem_plan_thought" # Specific message type
    )

    # 3. Identify citizens related to the target
    related_citizens_usernames = _get_related_citizens(tables, target_citizen_username)
    if not related_citizens_usernames:
        log.info(f"{LogColors.PROCESS}Target {target_citizen_username} has no known relationships. Stratagem {stratagem_id} has no one to message.{LogColors.ENDC}")
        # Stratagem still considered "processed" as the core damage to executor-target relationship will occur.
        # No messages sent, but the intent was there.
    
    messages_sent_count = 0
    for related_citizen_username in related_citizens_usernames:
        if related_citizen_username == executed_by_username: # Don't message self with smear
            continue

        log.info(f"{LogColors.PROCESS}Preparing to generate and send message to {related_citizen_username} about {target_citizen_username} (Stratagem {stratagem_id}).{LogColors.ENDC}")

        # Fetch related citizen's data package
        related_citizen_dp_response = requests.get(f"{NEXT_JS_BASE_URL}/api/get-data-package?citizenUsername={related_citizen_username}&format=json", timeout=30)
        if not related_citizen_dp_response.ok:
            log.warning(f"{LogColors.WARNING}Failed to fetch data package for related citizen {related_citizen_username}. Status: {related_citizen_dp_response.status_code}, Response: {related_citizen_dp_response.text[:200]}. Skipping message to them.{LogColors.ENDC}")
            continue
        
        related_citizen_dp_json = _safe_response_json(related_citizen_dp_response, f"related citizen data package for {related_citizen_username}")
        if not related_citizen_dp_json:
            log.warning(f"{LogColors.WARNING}Failed to parse JSON for related citizen data package {related_citizen_username}. Skipping message to them.{LogColors.ENDC}")
            continue
        related_citizen_data_package = related_citizen_dp_json.get('data', {})
        related_citizen_profile_for_kinos = related_citizen_data_package.get('citizen', {})
        if not related_citizen_profile_for_kinos: # Ensure it's a dict
            log.warning(f"{LogColors.WARNING}Related citizen profile missing in data package for {related_citizen_username}. Proceeding with empty profile for this interaction.{LogColors.ENDC}")
            related_citizen_profile_for_kinos = {}
        related_citizen_display_name = related_citizen_profile_for_kinos.get('FirstName', related_citizen_username)
        
        # --- New KinOS Self-Chat to Prepare Specific Message ---
        log.info(f"{LogColors.PROCESS}Executor {executed_by_username} self-chatting to prepare message for {related_citizen_username}...{LogColors.ENDC}")
        add_system_for_specific_message_prep = {
            "your_profile_and_full_data": executor_data_package,
            "original_target_profile_and_data": target_data_package,
            "intended_recipient_profile_and_data": related_citizen_data_package,
            "your_core_attack_narrative": cleaned_core_attack_narrative,
            "your_relationship_with_intended_recipient": _rh_get_relationship_data(tables, executed_by_username, related_citizen_username),
            "original_target_relationship_with_intended_recipient": _rh_get_relationship_data(tables, target_citizen_username, related_citizen_username),
            "assault_angle_reminder": assault_angle_from_notes or "any effective angle"
        }
        prompt_for_specific_message_prep = (
            f"You are {executor_display_name}. Your objective is to damage the reputation of {target_display_name} in the eyes of {related_citizen_display_name}. "
            f"You have already formulated a `your_core_attack_narrative` (see addSystem). "
            f"Now, using that core narrative as a foundation, and considering all the contextual information provided in `addSystem` "
            f"(about yourself, {target_display_name}, and especially {related_citizen_display_name}, including your relationships), "
            f"craft the specific message you will send TO {related_citizen_display_name}. "
            f"Your message should be conversational, persuasive, and tailored to {related_citizen_display_name}. "
            f"Your output should be ONLY the content of this message. Do not include any other commentary or explanation."
        )
        specific_message_content = _generate_kinos_message_content(
            kin_username=executed_by_username,
            channel_username=executed_by_username, # Self-chat channel
            prompt=prompt_for_specific_message_prep,
            kinos_api_key=kinos_api_key,
            kinos_model_override=model_for_executor,
            add_system_data=add_system_for_specific_message_prep,
            tables=tables
        )

        if specific_message_content:
            cleaned_specific_message = clean_thought_content(tables, specific_message_content)
            log.info(f"{LogColors.PROCESS}Generated specific message from {executed_by_username} (self-chat) for {related_citizen_username}: '{cleaned_specific_message[:100]}...'{LogColors.ENDC}")

            # --- Create send_message activity ---
            if not api_base_url:
                log.error(f"{LogColors.FAIL}Python engine API base URL not provided. Cannot create send_message activity for stratagem {stratagem_id}.{LogColors.ENDC}")
                continue

            activity_payload = {
                "citizenUsername": executed_by_username,
                "activityType": "send_message",
                "activityParameters": {
                    "receiverUsername": related_citizen_username,
                    "content": cleaned_specific_message,
                    "messageType": "stratagem_smear_delivery", # New type to distinguish
                    "notes": { # Optional, but good for tracking
                        "stratagemId": stratagem_id,
                        "originalTarget": target_citizen_username, # This is the one being smeared
                        "assaultAngle": assault_angle_from_notes or "N/A",
                        "targetCitizenUsernameForTrustImpact": target_citizen_username # Pass the smeared target for trust impact
                    }
                }
            }
            try:
                create_activity_url = f"{api_base_url}/api/v1/engine/try-create-activity"
                log.info(f"{LogColors.PROCESS}Attempting to create send_message activity via: {create_activity_url}{LogColors.ENDC}")
                response = requests.post(create_activity_url, json=activity_payload, timeout=30)
                response.raise_for_status()
                response_data = response.json()
                if response_data.get("success"):
                    log.info(f"{LogColors.OKGREEN}Successfully initiated send_message activity for {executed_by_username} to {related_citizen_username}. Activity: {response_data.get('activity', {}).get('Type', 'N/A')}{LogColors.ENDC}")
                    messages_sent_count += 1
                else:
                    log.warning(f"{LogColors.WARNING}Failed to create send_message activity for {related_citizen_username}. API Response: {response_data.get('message', 'Unknown error')}{LogColors.ENDC}")
            except requests.exceptions.RequestException as e_activity:
                log.error(f"{LogColors.FAIL}Error creating send_message activity for {related_citizen_username}: {e_activity}{LogColors.ENDC}")
            except json.JSONDecodeError as e_json_activity:
                log.error(f"{LogColors.FAIL}Error decoding JSON response from create activity API for {related_citizen_username}: {e_json_activity}. Response text: {response.text[:200] if 'response' in locals() and hasattr(response, 'text') else 'N/A'}{LogColors.ENDC}")
        else:
            log.warning(f"{LogColors.WARNING}Failed to generate specific message content (self-chat) for {related_citizen_username} (re: {target_citizen_username}) for stratagem {stratagem_id}.{LogColors.ENDC}")

    # 4. Damage relationship between executor and target (regardless of messages sent/activities created)
    trust_change = -50.0 # Significant negative impact
    update_trust_score_for_activity(
        tables,
        executed_by_username,
        target_citizen_username,
        trust_change,
        activity_type_for_notes=f"stratagem_reputation_assault_on_{target_citizen_username}",
        success=False, # From target's perspective, this is a negative action
        notes_detail=f"executed_by_{executed_by_username}",
        activity_record_for_kinos=stratagem_record # Pass the stratagem record for context
    )
    log.info(f"{LogColors.PROCESS}Trust score between {executed_by_username} and {target_citizen_username} impacted by {trust_change} due to stratagem {stratagem_id}.{LogColors.ENDC}")

    # 5. Update stratagem status
    final_notes = f"Reputation assault executed. {messages_sent_count} 'send_message' activities initiated to relations of {target_citizen_username}."
    if not stratagem_fields.get('ExecutedAt'):
        tables['stratagems'].update(stratagem_record['id'], {'ExecutedAt': datetime.now(pytz.utc).isoformat(), 'Status': 'executed', 'Notes': final_notes})
    else:
        tables['stratagems'].update(stratagem_record['id'], {'Status': 'executed', 'Notes': final_notes})
    
    log.info(f"{LogColors.OKGREEN}Stratagem {stratagem_id} (reputation_assault) marked as executed. {final_notes}{LogColors.ENDC}")
    return True
