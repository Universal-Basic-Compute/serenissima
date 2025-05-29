import os
import requests
from airtable import Airtable
from dotenv import load_dotenv
import time

# Load environment variables from .env file
load_dotenv()

# Airtable Configuration
AIRTABLE_BASE_KEY = os.getenv("AIRTABLE_BASE_KEY")
AIRTABLE_TABLE_NAME_CITIZENS = "CITIZENS"
airtable_citizens = Airtable(AIRTABLE_BASE_KEY, AIRTABLE_TABLE_NAME_CITIZENS)

# Kinos Engine Configuration
KINOS_ENGINE_API_KEY = os.getenv("KINOS_ENGINE_API_KEY")
KINOS_API_BASE_URL = "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins"
GITHUB_REPO_URL = "https://github.com/Universal-Basic-Compute/serenissima"

# List of citizens to exclude
EXCLUDED_CITIZENS = ["ConsiglioDeiDieci", "Italia", "SerenissimaBank"]

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
        "Authorization": f"Bearer {KINOS_ENGINE_API_KEY}",
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
    Main function to fetch all citizens and link repositories.
    """
    if not AIRTABLE_BASE_KEY:
        print("Error: AIRTABLE_BASE_KEY not found in environment variables.")
        return
    if not KINOS_ENGINE_API_KEY:
        print("Error: KINOS_ENGINE_API_KEY not found in environment variables.")
        return

    print("Fetching all citizens from Airtable...")
    try:
        citizens = airtable_citizens.get_all()
    except Exception as e:
        print(f"Error fetching citizens from Airtable: {e}")
        return

    if not citizens:
        print("No citizens found.")
        return

    print(f"Found {len(citizens)} citizens.")
    
    successful_links = 0
    failed_links = 0

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
    print(f"Successfully linked/verified: {successful_links} citizens")
    print(f"Failed to link: {failed_links} citizens")

if __name__ == "__main__":
    main()
