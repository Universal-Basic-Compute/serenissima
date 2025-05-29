import os
import sys
import json
import random
import requests
from datetime import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv
from pyairtable import Api, Table
import re # For parsing Kinos response

# Add the parent directory to the path to import utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# from app.citizen_utils import find_citizen_by_identifier # Not strictly needed for this script

# --- Configuration ---
load_dotenv()
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
KINOS_API_KEY = os.getenv("KINOS_API_KEY")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")

# Social class probabilities for joining a guild
GUILD_JOIN_CHANCES = {
    "Nobili": 0.00,  # 0%
    "Cittadini": 0.85,  # 85%
    "Popolani": 1.00,  # 100%
    "Facchini": 0.20,  # 20%
    "Default": 0.10 # Fallback for any other social class
}

# --- Airtable Initialization ---
def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialize connection to Airtable."""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        print("Error: Airtable credentials not found in environment variables.")
        return None
    try:
        api = Api(AIRTABLE_API_KEY)
        tables = {
            "citizens": api.table(AIRTABLE_BASE_ID, "CITIZENS"),
            "notifications": api.table(AIRTABLE_BASE_ID, "NOTIFICATIONS"),
        }
        print("Successfully initialized Airtable connection.")
        return tables
    except Exception as e:
        print(f"Error initializing Airtable: {e}")
        return None

# --- Data Fetching ---
def get_ai_citizens(tables: Dict[str, Table], specific_username: Optional[str] = None) -> List[Dict]:
    """Get AI citizens who are not already in a guild.
    If specific_username is provided, fetches only that citizen if they meet the criteria.
    """
    try:
        base_formula = "AND({IsAI}=1, {GuildId}=BLANK())"
        if specific_username:
            safe_username = _escape_airtable_formula_value(specific_username)
            formula = f"AND({{Username}}='{safe_username}', {base_formula})"
            print(f"Attempting to fetch specific AI citizen: {specific_username} not in a guild.")
        else:
            formula = base_formula
            print("Fetching all AI citizens not currently in a guild.")

        ai_citizens = tables["citizens"].all(formula=formula)
        
        if specific_username and not ai_citizens:
            print(f"Specific AI citizen {specific_username} not found or already in a guild.")
        elif not ai_citizens:
            print("No eligible AI citizens found.")
        else:
            print(f"Found {len(ai_citizens)} eligible AI citizen(s).")
            
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {e}")
        return []

def get_guilds_from_api() -> List[Dict]:
    """Fetch guild data from the API."""
    try:
        url = f"{API_BASE_URL}/api/guilds"
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for HTTP errors
        data = response.json()
        if data.get("guilds") and isinstance(data["guilds"], list):
            print(f"Successfully fetched {len(data['guilds'])} guilds from API.")
            return data["guilds"]
        else:
            print(f"Error: Unexpected guild data format from API: {data}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Error fetching guilds from API: {e}")
        return []
    except json.JSONDecodeError:
        print(f"Error decoding JSON from guild API response: {response.text}")
        return []

# --- AI Decision Making ---
def citizen_decides_to_join(social_class: str) -> bool:
    """Determine if a citizen decides to join a guild based on social class."""
    chance = GUILD_JOIN_CHANCES.get(social_class, GUILD_JOIN_CHANCES["Default"])
    return random.random() < chance

def _escape_airtable_formula_value(value: str) -> str:
    """Escapes single quotes for Airtable formulas."""
    return value

def ask_ai_to_choose_guild(ai_username: str, ai_social_class: str, guilds_data: List[Dict]) -> Optional[str]:
    """Ask the AI to choose a guild using Kinos Engine API."""
    if not KINOS_API_KEY:
        print("Error: KINOS_API_KEY not set.")
        return None

    if not guilds_data:
        print(f"No guilds available for {ai_username} to choose from.")
        return None

    guild_options_text = "\n".join([
        f"- ID: {g['guildId']}, Name: {g['guildName']}, Description: {g.get('shortDescription') or g.get('description', 'No description')}"
        for g in guilds_data
    ])

    prompt = f"""
You are {ai_username}, a citizen of La Serenissima with the social class '{ai_social_class}'.
You are considering joining a guild. Here are the available guilds:
{guild_options_text}

Based on your personality, profession (if any), and aspirations, which guild would you like to join?
Please respond with a JSON object containing the 'GuildId' of your chosen guild.
Example: {{"GuildId": "guild_id_example"}}
If you do not wish to join any guild at this time, respond with an empty JSON object or {{"GuildId": null}}.
"""

    system_prompt = f"""
You are an AI citizen named {ai_username} of social class {ai_social_class} in Renaissance Venice.
You need to decide if you want to join a guild and, if so, which one.
Consider the nature of each guild, its patron saint, entry fees, and how it aligns with your character.
Your response MUST be a valid JSON object with a "GuildId" field.
The value of "GuildId" should be the ID of the guild you choose, or null if you choose not to join.
Available guilds:
{json.dumps(guilds_data, indent=2)}
"""

    try:
        response = requests.post(
            f"https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/{ai_username}/messages",
            headers={
                "Authorization": f"Bearer {KINOS_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "message": prompt,
                "addSystem": system_prompt,
            },
        )
        response.raise_for_status()
        response_data = response.json()
        
        ai_response_content = response_data.get("response", "")
        print(f"AI ({ai_username}) Kinos response content: {ai_response_content}")

        # Extract JSON from the response
        try:
            # Attempt to find JSON within ```json ... ``` blocks
            json_match_str = None # Renamed to avoid conflict with re.match object
            if "```json" in ai_response_content:
                json_block_match = re.search(r"```json\s*([\s\S]*?)\s*```", ai_response_content)
                if json_block_match:
                    json_match_str = json_block_match.group(1)
            
            if not json_match_str: # If not in a code block, try to find the first { and last }
                first_brace = ai_response_content.find('{')
                last_brace = ai_response_content.rfind('}')
                if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
                    json_match_str = ai_response_content[first_brace:last_brace+1]
            
            if json_match_str:
                decision = json.loads(json_match_str)
                chosen_guild_id = decision.get("GuildId")
                if chosen_guild_id and any(g['guildId'] == chosen_guild_id for g in guilds_data):
                    print(f"AI {ai_username} chose to join guild: {chosen_guild_id}")
                    return chosen_guild_id
                elif chosen_guild_id:
                    print(f"AI {ai_username} chose an invalid GuildId: {chosen_guild_id}. Treating as no choice.")
                    return None
                else:
                    print(f"AI {ai_username} chose not to join a guild or provided no GuildId.")
                    return None
            else:
                print(f"AI {ai_username} did not return a parsable JSON response. Response: {ai_response_content}")
                return None

        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from AI response for {ai_username}: {e}. Response: {ai_response_content}")
            return None
        except Exception as e: # Catch any other parsing errors
            print(f"Error parsing AI response for {ai_username}: {e}. Response: {ai_response_content}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"Error calling Kinos API for {ai_username}: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during Kinos API call for {ai_username}: {e}")
        return None

# --- Airtable Update ---
def update_citizen_guild(tables: Dict[str, Table], citizen_record_id: str, guild_id: str) -> bool:
    """Update the citizen's GuildId in Airtable."""
    try:
        tables["citizens"].update(citizen_record_id, {"GuildId": guild_id})
        print(f"Successfully updated citizen {citizen_record_id} to join guild {guild_id}.")
        return True
    except Exception as e:
        print(f"Error updating citizen {citizen_record_id} with guild {guild_id}: {e}")
        return False

# --- Notification ---
def create_admin_notification(tables: Dict[str, Table], joined_guilds_summary: List[Dict]):
    """Create an admin notification summarizing guild joining activities."""
    if not joined_guilds_summary:
        print("No citizens joined guilds, skipping admin notification.")
        return

    summary_lines = [f"- {item['username']} (Social Class: {item['social_class']}) joined Guild: {item['guild_name']} ({item['guild_id']})" for item in joined_guilds_summary]
    content = "AI Guild Joining Summary:\n\n" + "\n".join(summary_lines)

    try:
        tables["notifications"].create({
            "Citizen": "ConsiglioDeiDieci", # Or a generic admin user
            "Type": "ai_guild_join",
            "Content": content,
            "CreatedAt": datetime.now().isoformat(),
            "Details": json.dumps({"summary": joined_guilds_summary})
        })
        print("Admin notification created for guild joining summary.")
    except Exception as e:
        print(f"Error creating admin notification: {e}")

# --- Main Processing Logic ---
def process_ai_guild_joining(dry_run: bool = False, target_username: Optional[str] = None):
    """Main function to process AI citizens joining guilds.
    If target_username is provided, only that citizen will be processed.
    """
    process_target = target_username if target_username else "all eligible AI citizens"
    print(f"--- Starting AI Guild Joining Process for {process_target} (Dry Run: {dry_run}) ---")

    tables = initialize_airtable()
    if not tables:
        return

    ai_citizens = get_ai_citizens(tables, specific_username=target_username)
    if not ai_citizens:
        # Message already printed by get_ai_citizens
        return

    guilds = get_guilds_from_api()
    if not guilds:
        print("No guild data found from API. Exiting.")
        return

    guild_map = {g['guildId']: g for g in guilds} # For easy lookup of guild name

    joined_guilds_summary = []

    for citizen in ai_citizens:
        username = citizen["fields"].get("Username")
        social_class = citizen["fields"].get("SocialClass", "Default")
        citizen_record_id = citizen["id"]

        if not username:
            print(f"Skipping citizen record {citizen_record_id} due to missing Username.")
            continue

        print(f"\nProcessing citizen: {username} (Social Class: {social_class})")

        if citizen_decides_to_join(social_class):
            print(f"{username} decided to consider joining a guild.")
            
            chosen_guild_id = ask_ai_to_choose_guild(username, social_class, guilds)

            if chosen_guild_id:
                guild_name = guild_map.get(chosen_guild_id, {}).get('guildName', 'Unknown Guild')
                print(f"{username} chose to join Guild: {guild_name} ({chosen_guild_id}).")
                if not dry_run:
                    if update_citizen_guild(tables, citizen_record_id, chosen_guild_id):
                        joined_guilds_summary.append({
                            "username": username,
                            "social_class": social_class,
                            "guild_id": chosen_guild_id,
                            "guild_name": guild_name
                        })
                else:
                    print(f"[DRY RUN] Would update {username} to join Guild: {guild_name} ({chosen_guild_id}).")
                    joined_guilds_summary.append({
                            "username": username,
                            "social_class": social_class,
                            "guild_id": chosen_guild_id,
                            "guild_name": guild_name
                        })
            else:
                print(f"{username} did not choose a guild or the choice was invalid.")
        else:
            print(f"{username} (Social Class: {social_class}) did not meet the probability to join a guild this time.")

    if not dry_run:
        create_admin_notification(tables, joined_guilds_summary)
    else:
        if joined_guilds_summary:
            print("\n[DRY RUN] Admin Notification Summary:")
            for item in joined_guilds_summary:
                 print(f"- {item['username']} ({item['social_class']}) would join Guild: {item['guild_name']} ({item['guild_id']})")
        else:
            print("\n[DRY RUN] No citizens would have joined guilds.")


    print(f"--- AI Guild Joining Process Finished ---")

if __name__ == "__main__":
    import argparse
    # import re # For parsing Kinos response # This was already imported at the top

    parser = argparse.ArgumentParser(description="Allow AI citizens to join guilds.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the process without making changes to Airtable.",
    )
    parser.add_argument(
        "--username",
        type=str,
        help="Process guild joining for a specific citizen username.",
        default=None
    )
    args = parser.parse_args()

    process_ai_guild_joining(args.dry_run, target_username=args.username)
