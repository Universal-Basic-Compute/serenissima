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
MAX_ENCOUNTERS_PER_RUN = 10 # Limit total number of pairs processed per run
MAX_ENCOUNTERS_PER_LOCATION = 3 # Limit pairs processed per location
DELAY_BETWEEN_TURNS_SECONDS = 5 # Delay between Kinos calls for a single conversation
DELAY_BETWEEN_PAIRS_SECONDS = 15 # Delay between processing different pairs

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
    location_id: str, # BuildingId
    dry_run: bool = False
):
    """Generates a 3-turn conversation between two citizens."""
    # Ensure citizen1_username is alphabetically first
    if citizen1_username > citizen2_username:
        citizen1_username, citizen2_username = citizen2_username, citizen1_username
    
    log.info(f"{LogColors.OKCYAN}Processing encounter between {citizen1_username} and {citizen2_username} at {location_id}.{LogColors.ENDC}")

    conversation_participants = [citizen1_username, citizen2_username]

    for i in range(3): # 3 turns
        speaker_idx = i % 2
        listener_idx = (i + 1) % 2

        speaker = conversation_participants[speaker_idx]
        listener = conversation_participants[listener_idx]

        log.info(f"  Turn {i+1}: {speaker} (speaker) to {listener} (listener).")
        if dry_run:
            log.info(f"    [DRY RUN] Would call generate_conversation_turn for {speaker} to talk to {listener}.")
        else:
            try:
                new_message = generate_conversation_turn(
                    tables=tables,
                    kinos_api_key=kinos_api_key,
                    speaker_username=speaker,
                    listener_username=listener,
                    api_base_url=api_base_url
                )
                if new_message:
                    log.info(f"    Message generated and persisted. ID: {new_message.get('id')}")
                    log.debug(f"    Content: {new_message.get('fields', {}).get('Content', '')[:100]}...")
                else:
                    log.warning(f"    Failed to generate or persist message for turn {i+1} ({speaker} to {listener}).")
                    break # Stop this encounter if a turn fails

                if i < 2: # If not the last turn
                    log.info(f"    Waiting {DELAY_BETWEEN_TURNS_SECONDS}s before next turn...")
                    time.sleep(DELAY_BETWEEN_TURNS_SECONDS)

            except Exception as e_turn:
                log.error(f"    Error during conversation turn {i+1} ({speaker} to {listener}): {e_turn}")
                break # Stop this encounter on error

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
        if processed_pairs_total >= MAX_ENCOUNTERS_PER_RUN and not args.location and not args.citizen:
            log.info(f"Reached max encounters per run ({MAX_ENCOUNTERS_PER_RUN}). Stopping.")
            break

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
            if processed_pairs_total >= MAX_ENCOUNTERS_PER_RUN and not args.location and not args.citizen:
                break
            if processed_pairs_at_location >= MAX_ENCOUNTERS_PER_LOCATION and not args.location and not args.citizen:
                log.info(f"Reached max encounters for location {location_name}. Moving to next location.")
                break

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

            if processed_pairs_total < MAX_ENCOUNTERS_PER_RUN : # Check before sleeping
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
