import os
import sys # Added import
import requests
import argparse
from pyairtable import Api, Base # Changed import
from dotenv import load_dotenv
import time

# Load environment variables from .env file
load_dotenv()

# Airtable Configuration
AIRTABLE_API_KEY_ENV = os.getenv("AIRTABLE_API_KEY") # For pyairtable
AIRTABLE_BASE_ID_ENV = os.getenv("AIRTABLE_BASE_ID") # Consistent naming
AIRTABLE_TABLE_NAME_CITIZENS = "CITIZENS"

# Initialize Airtable connection using pyairtable
if not AIRTABLE_API_KEY_ENV or not AIRTABLE_BASE_ID_ENV:
    print("Error: Airtable API key or Base ID not found in environment variables.")
    # Depending on how critical this is, you might exit or handle it.
    # For now, let's allow it to proceed and fail later if these are truly needed.
    # However, linkrepos.py DOES need it.
    sys.exit("Airtable API Key and Base ID are required.")

api = Api(AIRTABLE_API_KEY_ENV)
base = Base(api, AIRTABLE_BASE_ID_ENV)
citizens_table = base.table(AIRTABLE_TABLE_NAME_CITIZENS)


# Kinos Engine Configuration
KINOS_API_KEY = os.getenv("KINOS_API_KEY")
KINOS_API_BASE_URL = "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins"
GITHUB_REPO_URL = "https://github.com/Universal-Basic-Compute/serenissima"

# List of citizens to exclude
EXCLUDED_CITIZENS = ["ConsiglioDeiDieci", "Italia"]

def link_repo_for_citizen(username):
    """
    Links the GitHub repository to a specific citizen in Kinos Engine.
    """
    if username in EXCLUDED_CITIZENS:
        print(f"Skipping excluded citizen: {username}")
        return False

    url = f"{KINOS_API_BASE_URL}/{username}/link-repo"
    payload = {
        "github_url": GITHUB_REPO_URL,
        "branchName": username  # Using username as branch name
    }
    headers = {
        "Authorization": f"Bearer {KINOS_API_KEY}",
        "Content-Type": "application/json"
    }

    print(f"Attempting to link repo for {username}...")
    print(f"  URL: {url}")
    print(f"  Payload: {payload}")

    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
        print(f"Successfully linked repo for {username}. Status: {response.status_code}")
        return True
    except requests.exceptions.HTTPError as e:
        print(f"Error linking repo for {username}: {e.response.status_code} - {e.response.text}")
        if e.response.status_code == 409: # Conflict, likely already linked
            print(f"  Repository might already be linked for {username}.")
            return True # Treat as success if already linked
    except requests.exceptions.RequestException as e:
        print(f"Request failed for {username}: {e}")
    return False

def main():
    """
    Main function to fetch all citizens and link repositories,
    or link for a specific citizen if provided.
    """
    parser = argparse.ArgumentParser(description="Link GitHub repositories to Kinos Engine for Serenissima AI citizens.")
    parser.add_argument("--citizen", type=str, help="Specify a single citizen username to link.")
    args = parser.parse_args()

    # Environment variable check for Airtable is now at the top level
    if not AIRTABLE_API_KEY_ENV or not AIRTABLE_BASE_ID_ENV:
        print("Error: Airtable credentials (AIRTABLE_API_KEY, AIRTABLE_BASE_ID) not properly set.")
        return
    if not KINOS_API_KEY:
        print("Error: KINOS_API_KEY not found in environment variables.")
        return

    successful_links = 0
    failed_links = 0

    if args.citizen:
        print(f"Attempting to link repo for specified citizen: {args.citizen}")
        if link_repo_for_citizen(args.citizen):
            successful_links += 1
        else:
            failed_links += 1
    else:
        print("Fetching all citizens from Airtable to link repositories...")
        try:
            citizens = citizens_table.all() # Use pyairtable method
        except Exception as e:
            print(f"Error fetching citizens from Airtable: {e}")
            return

        if not citizens:
            print("No citizens found.")
            return

        print(f"Found {len(citizens)} citizens.")

        for citizen_record in citizens:
            fields = citizen_record.get('fields', {})
            username = fields.get('Username')

            if not username:
                print(f"Skipping record with no Username: {citizen_record.get('id')}")
                continue
            
            if link_repo_for_citizen(username):
                successful_links += 1
            else:
                failed_links += 1
            
            # Adding a small delay to avoid overwhelming the API
            time.sleep(0.5) # 500ms delay

    print("\n--- Summary ---")
    print(f"Successfully linked/verified: {successful_links} citizen(s)")
    print(f"Failed to link: {failed_links} citizen(s)")

if __name__ == "__main__":
    main()
