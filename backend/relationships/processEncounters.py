import os
import sys
import json
import logging
import argparse
import time
import random
import itertools
from typing import Dict, List, Optional, Any, Tuple

import requests
from pyairtable import Api, Table
from dotenv import load_dotenv

# Add project root to sys.path
PROJECT_ROOT_ENCOUNTERS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT_ENCOUNTERS not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_ENCOUNTERS)

try:
    from backend.engine.utils.conversation_helper import generate_conversation_turn
    from backend.engine.utils.activity_helpers import (
        LogColors, VENICE_TIMEZONE, _escape_airtable_value,
        get_citizen_record, get_building_record, get_closest_building_to_position,
        log_header
    )
    # Import for trust score update
    from backend.engine.utils.relationship_helpers import (
        update_trust_score_for_activity,
        TRUST_SCORE_MINOR_POSITIVE
    )
except ImportError as e:
    print(f"Error importing modules: {e}. Ensure PYTHONPATH is set correctly or script is run from project root.")
    sys.exit(1)

# Load environment variables
dotenv_path = os.path.join(PROJECT_ROOT_ENCOUNTERS, '.env')
load_dotenv(dotenv_path)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("processEncounters")

# Configuration
KINOS_API_KEY = os.getenv("KINOS_API_KEY")
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
API_BASE_URL = os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000")

# Constants
# MAX_ENCOUNTERS_PER_RUN = 10 # Removed
# MAX_ENCOUNTERS_PER_LOCATION = 3 # Removed
DELAY_BETWEEN_TURNS_SECONDS = 0 # Delay between Kinos calls for a single conversation
DELAY_BETWEEN_PAIRS_SECONDS = 0 # Delay between processing different pairs

def initialize_airtable_tables() -> Optional[Dict[str, Table]]:
    """Initializes and returns a dictionary of Airtable Table objects."""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        log.error(f"{LogColors.FAIL}Airtable API Key or Base ID not configured.{LogColors.ENDC}")
        return None
    try:
        api = Api(AIRTABLE_API_KEY)
        tables = {
            'citizens': api.table(AIRTABLE_BASE_ID, 'CITIZENS'),
            'messages': api.table(AIRTABLE_BASE_ID, 'MESSAGES'),
            'relationships': api.table(AIRTABLE_BASE_ID, 'RELATIONSHIPS'),
            'problems': api.table(AIRTABLE_BASE_ID, 'PROBLEMS'), # Needed by conversation_helper
            'buildings': api.table(AIRTABLE_BASE_ID, 'BUILDINGS') # Needed for location context
        }
        log.info(f"{LogColors.OKGREEN}Airtable tables initialized successfully.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable tables: {e}{LogColors.ENDC}")
        return None

def group_citizens_by_location(tables: Dict[str, Table]) -> Dict[str, List[Dict]]:
    """Groups citizens by their current building location."""
    citizens_by_location: Dict[str, List[Dict]] = {}
    try:
        all_citizens_in_venice = tables['citizens'].all(formula="{InVenice}=1")
        log.info(f"Fetched {len(all_citizens_in_venice)} citizens in Venice.")

        for citizen_record in all_citizens_in_venice:
            citizen_fields = citizen_record.get('fields', {})
            position_str = citizen_fields.get('Position') # This is the JSON string "{\"lat\": ..., \"lng\": ...}"
            username = citizen_fields.get('Username')

            if not position_str or not username:
                log.debug(f"Citizen {citizen_record.get('id')} missing Position string or Username. Skipping.")
                continue
            
            # Use the raw position_str as the key for grouping.
            # This ensures only citizens with IDENTICAL Position strings are grouped.
            if position_str not in citizens_by_location:
                citizens_by_location[position_str] = []
            citizens_by_location[position_str].append(citizen_record)
        
        # Filter out locations (exact position strings) with fewer than 2 citizens
        return {pos_str_key: citizens for pos_str_key, citizens in citizens_by_location.items() if len(citizens) >= 2}

    except Exception as e:
        log.error(f"{LogColors.FAIL}Error grouping citizens by exact Position string: {e}{LogColors.ENDC}")
        return {}

def process_encounter_pair(
    tables: Dict[str, Table],
    kinos_api_key: str,
    api_base_url: str,
    citizen1_username: str,
    citizen2_username: str,
    location_id: str, # Represents the shared location (e.g., Position string or BuildingId)
    dry_run: bool = False,
    num_turns: int = 3 # Default to 3 turns (opener, reaction, reply to reaction)
):
    """
    Generates a conversation for an encounter pair for a specified number of turns.
    A "turn" here means one message generated.
    """
    
    # Randomly decide who speaks first in this encounter
    original_speaker_username = random.choice([citizen1_username, citizen2_username])
    original_listener_username = citizen2_username if original_speaker_username == citizen1_username else citizen1_username

    log.info(f"{LogColors.OKCYAN}Processing encounter: {original_speaker_username} will initiate with {original_listener_username} at {location_id} for {num_turns} turns.{LogColors.ENDC}")

    current_turn_count = 0
    last_message_record_fields: Optional[Dict[str, Any]] = None
    
    # Turn 1: Opener
    if dry_run:
        log.info(f"    [DRY RUN] Would call generate_conversation_turn for {original_speaker_username} to initiate with {original_listener_username}.")
        # Simulate a successful opener for dry run to test further logic if num_turns > 1
        last_message_record_fields = {"DryRun": True, "Content": "Dry run opener", "Type": "conversation_opener"}
        current_turn_count = 1
    else:
        try:
            opener_message_record = generate_conversation_turn(
                tables=tables,
                kinos_api_key=kinos_api_key,
                speaker_username=original_speaker_username,
                listener_username=original_listener_username,
                api_base_url=api_base_url,
                interaction_mode="conversation_opener"
            )
            if opener_message_record:
                log.info(f"    Opening line by {original_speaker_username} to {original_listener_username} generated. ID: {opener_message_record.get('id')}")
                last_message_record_fields = opener_message_record.get('fields')
                current_turn_count = 1
                
                # Augment trust score based on the opener
                # If num_turns == 1, we don't want the reaction/reply, so pass None for activity_record_for_kinos
                # Otherwise, pass the opener to trigger the reaction/reply cycle.
                activity_to_pass_for_trust = last_message_record_fields if num_turns > 1 else None
                update_trust_score_for_activity(
                    tables=tables,
                    citizen1_username=original_speaker_username,
                    citizen2_username=original_listener_username,
                    trust_change_amount=TRUST_SCORE_MINOR_POSITIVE,
                    activity_type_for_notes="encounter_initiated_opener",
                    success=True,
                    notes_detail=f"{original_speaker_username} opened conversation with {original_listener_username} at {location_id}.",
                    activity_record_for_kinos=activity_to_pass_for_trust
                )
                log.info(f"    Augmented trust for opener between {original_speaker_username} and {original_listener_username}.")

            else:
                log.warning(f"    Failed to generate or persist opening line from {original_speaker_username} to {original_listener_username}.")
                return # Stop if opener fails
        except Exception as e_opener:
            log.error(f"    Error during conversation opener generation for {original_speaker_username} to {original_listener_username}: {e_opener}")
            return # Stop if opener errors

    if current_turn_count == 0: # Opener failed or was skipped in dry_run without simulation
        return

    # If num_turns is 1, we've already done the opener.
    # If num_turns > 1, the update_trust_score_for_activity above (if not dry_run and opener succeeded)
    # would have passed the opener_message_record.get('fields').
    # This, in turn, calls _initiate_reaction_dialogue_if_both_ai from relationship_helpers.py,
    # which generates the listener's reaction (turn 2) and the original speaker's reply to that reaction (turn 3).
    if not dry_run and last_message_record_fields and num_turns > 1:
        # These two turns are implicitly handled by _initiate_reaction_dialogue_if_both_ai
        # if both are AI and the opener was passed to update_trust_score_for_activity.
        # We assume they happen if conditions are met.
        if current_turn_count < num_turns: current_turn_count = min(num_turns, 3) 
        # If num_turns was 2, current_turn_count becomes 2. If num_turns was 3 or more, it becomes 3.
    elif dry_run and num_turns > 1:
        log.info(f"    [DRY RUN] Simulating reaction and reply to opener (turns 2 & 3 if applicable).")
        if current_turn_count < num_turns: current_turn_count = min(num_turns, 3)


    # For turns beyond the initial opener + reaction + reply_to_reaction cycle
    # Current speaker for turn 4 would be the original listener.
    # Current listener for turn 4 would be the original speaker.
    current_speaker_for_loop = original_listener_username
    current_listener_for_loop = original_speaker_username
    
    while current_turn_count < num_turns:
        log.info(f"    Continuing conversation: Turn {current_turn_count + 1}. {current_speaker_for_loop} to {current_listener_for_loop}.")
        if dry_run:
            log.info(f"        [DRY RUN] Would generate conversation turn from {current_speaker_for_loop} to {current_listener_for_loop}.")
            current_turn_count += 1
            # Swap for next simulated turn
            current_speaker_for_loop, current_listener_for_loop = current_listener_for_loop, current_speaker_for_loop
            if current_turn_count < num_turns: # Avoid sleep if it's the last turn
                time.sleep(DELAY_BETWEEN_TURNS_SECONDS)
            continue

        try:
            next_message_record = generate_conversation_turn(
                tables=tables,
                kinos_api_key=kinos_api_key,
                speaker_username=current_speaker_for_loop,
                listener_username=current_listener_for_loop,
                api_base_url=api_base_url,
                interaction_mode="conversation" # Subsequent turns are standard conversation
            )
            if next_message_record:
                log.info(f"        Turn {current_turn_count + 1} by {current_speaker_for_loop} generated. ID: {next_message_record.get('id')}")
                current_turn_count += 1
                # Optionally, update trust score for each subsequent turn as well
                update_trust_score_for_activity(
                    tables=tables,
                    citizen1_username=current_speaker_for_loop,
                    citizen2_username=current_listener_for_loop,
                    trust_change_amount=TRUST_SCORE_MINOR_POSITIVE * 0.5, # Smaller impact for subsequent turns
                    activity_type_for_notes="encounter_continued_turn",
                    success=True,
                    notes_detail=f"Turn {current_turn_count} in conversation.",
                    activity_record_for_kinos=next_message_record.get('fields') 
                    # Passing this might trigger another reaction/reply cycle if not careful.
                    # For simple turn-by-turn, maybe pass None or a simplified record.
                    # For now, let's pass it; the impact should be minimal if history is used.
                )
                # Swap for next turn
                current_speaker_for_loop, current_listener_for_loop = current_listener_for_loop, current_speaker_for_loop
            else:
                log.warning(f"        Failed to generate turn {current_turn_count + 1} from {current_speaker_for_loop}.")
                break # Stop if a turn fails
            
            if current_turn_count < num_turns: # Avoid sleep if it's the last turn
                 log.info(f"    Waiting {DELAY_BETWEEN_TURNS_SECONDS}s before next turn in this pair...")
                 time.sleep(DELAY_BETWEEN_TURNS_SECONDS)

        except Exception as e_subsequent_turn:
            log.error(f"    Error during conversation turn {current_turn_count + 1} for {current_speaker_for_loop}: {e_subsequent_turn}")
            break # Stop on error
            
    log.info(f"    Encounter between {original_speaker_username} and {original_listener_username} completed with {current_turn_count} turns.")


def main(args):
    """Main function to process encounters."""
    log_header("Process Encounters Script", LogColors.HEADER)
    if args.dry_run:
        log.info(f"{LogColors.WARNING}Running in DRY RUN mode. No actual Kinos calls or Airtable writes will occur.{LogColors.ENDC}")

    if not KINOS_API_KEY:
        log.error(f"{LogColors.FAIL}KINOS_API_KEY not found in environment. Exiting.{LogColors.ENDC}")
        return

    tables = initialize_airtable_tables()
    if not tables:
        return

    citizens_by_loc = group_citizens_by_location(tables)

    if args.location:
        if args.location in citizens_by_loc:
            log.info(f"Focusing on specified location: {args.location}")
            citizens_by_loc = {args.location: citizens_by_loc[args.location]}
        else:
            log.warning(f"Specified location {args.location} not found or has fewer than 2 citizens. Exiting.")
            return

    log.info(f"Found {len(citizens_by_loc)} locations with 2 or more citizens.")

    processed_pairs_total = 0

    # Shuffle locations to vary processing order if not targeting a specific location
    location_ids_to_process = list(citizens_by_loc.keys())
    if not args.location:
        random.shuffle(location_ids_to_process)

    for location_id in location_ids_to_process:
        # Removed MAX_ENCOUNTERS_PER_RUN check here

        citizens_at_location = citizens_by_loc[location_id]
        location_name = location_id # Default to ID
        try:
            # Attempt to get building name for better logging
            building_rec_for_name = get_building_record(tables, location_id)
            if building_rec_for_name:
                location_name = building_rec_for_name['fields'].get('Name', location_id)
        except Exception:
            pass # Stick with location_id if name lookup fails

        log.info(f"\nProcessing location: {location_name} (ID: {location_id}) with {len(citizens_at_location)} citizens.")

        # Generate pairs of citizens at this location
        citizen_pairs = list(itertools.combinations(citizens_at_location, 2))
        random.shuffle(citizen_pairs) # Shuffle pairs within this location

        processed_pairs_at_location = 0
        for pair in citizen_pairs:
            # Removed MAX_ENCOUNTERS_PER_RUN and MAX_ENCOUNTERS_PER_LOCATION checks here

            citizen1_record, citizen2_record = pair
            citizen1_username = citizen1_record['fields'].get('Username')
            citizen2_username = citizen2_record['fields'].get('Username')

            if not citizen1_username or not citizen2_username:
                log.warning("Skipping pair due to missing username.")
                continue

            if args.citizen and args.citizen not in [citizen1_username, citizen2_username]:
                continue # Skip if not involving the target citizen

            process_encounter_pair(
                tables, KINOS_API_KEY, API_BASE_URL,
                citizen1_username, citizen2_username, location_id, args.dry_run, args.turns
            )
            processed_pairs_total += 1
            processed_pairs_at_location +=1

            # Removed MAX_ENCOUNTERS_PER_RUN check before sleep
            log.info(f"Waiting {DELAY_BETWEEN_PAIRS_SECONDS}s before next pair...")
            time.sleep(DELAY_BETWEEN_PAIRS_SECONDS)


    log.info(f"\n{LogColors.OKGREEN}Encounter processing finished. Total pairs processed: {processed_pairs_total}.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process encounters between citizens in the same location.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate the process without making Kinos calls or Airtable writes.")
    parser.add_argument("--citizen", type=str, help="Focus processing on encounters involving this citizen (by username).")
    parser.add_argument("--location", type=str, help="Focus processing on a specific location (BuildingId).")
    parser.add_argument("--turns", type=int, default=3, help="Number of conversational turns (messages) per encounter pair. Default is 3.")

    cli_args = parser.parse_args()
    main(cli_args)

def main(args):
    """Main function to process encounters."""
    log_header("Process Encounters Script", LogColors.HEADER)
    if args.dry_run:
        log.info(f"{LogColors.WARNING}Running in DRY RUN mode. No actual Kinos calls or Airtable writes will occur.{LogColors.ENDC}")

    if not KINOS_API_KEY:
        log.error(f"{LogColors.FAIL}KINOS_API_KEY not found in environment. Exiting.{LogColors.ENDC}")
        return

    tables = initialize_airtable_tables()
    if not tables:
        return

    citizens_by_loc = group_citizens_by_location(tables)

    if args.location:
        if args.location in citizens_by_loc:
            log.info(f"Focusing on specified location: {args.location}")
            citizens_by_loc = {args.location: citizens_by_loc[args.location]}
        else:
            log.warning(f"Specified location {args.location} not found or has fewer than 2 citizens. Exiting.")
            return

    log.info(f"Found {len(citizens_by_loc)} locations with 2 or more citizens.")

    processed_pairs_total = 0

    # Shuffle locations to vary processing order if not targeting a specific location
    location_ids_to_process = list(citizens_by_loc.keys())
    if not args.location:
        random.shuffle(location_ids_to_process)

    for location_id in location_ids_to_process:
        # Removed MAX_ENCOUNTERS_PER_RUN check here

        citizens_at_location = citizens_by_loc[location_id]
        location_name = location_id # Default to ID
        try:
            # Attempt to get building name for better logging
            building_rec_for_name = get_building_record(tables, location_id)
            if building_rec_for_name:
                location_name = building_rec_for_name['fields'].get('Name', location_id)
        except Exception:
            pass # Stick with location_id if name lookup fails

        log.info(f"\nProcessing location: {location_name} (ID: {location_id}) with {len(citizens_at_location)} citizens.")

        # Generate pairs of citizens at this location
        citizen_pairs = list(itertools.combinations(citizens_at_location, 2))
        random.shuffle(citizen_pairs) # Shuffle pairs within this location

        processed_pairs_at_location = 0
        for pair in citizen_pairs:
            # Removed MAX_ENCOUNTERS_PER_RUN and MAX_ENCOUNTERS_PER_LOCATION checks here

            citizen1_record, citizen2_record = pair
            citizen1_username = citizen1_record['fields'].get('Username')
            citizen2_username = citizen2_record['fields'].get('Username')

            if not citizen1_username or not citizen2_username:
                log.warning("Skipping pair due to missing username.")
                continue

            if args.citizen and args.citizen not in [citizen1_username, citizen2_username]:
                continue # Skip if not involving the target citizen

            process_encounter_pair(
                tables, KINOS_API_KEY, API_BASE_URL,
                citizen1_username, citizen2_username, location_id, args.dry_run
            )
            processed_pairs_total += 1
            processed_pairs_at_location +=1

            # Removed MAX_ENCOUNTERS_PER_RUN check before sleep
            log.info(f"Waiting {DELAY_BETWEEN_PAIRS_SECONDS}s before next pair...")
            time.sleep(DELAY_BETWEEN_PAIRS_SECONDS)


    log.info(f"\n{LogColors.OKGREEN}Encounter processing finished. Total pairs processed: {processed_pairs_total}.{LogColors.ENDC}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process encounters between citizens in the same location.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate the process without making Kinos calls or Airtable writes.")
    parser.add_argument("--citizen", type=str, help="Focus processing on encounters involving this citizen (by username).")
    parser.add_argument("--location", type=str, help="Focus processing on a specific location (BuildingId).")

    cli_args = parser.parse_args()
    main(cli_args)
