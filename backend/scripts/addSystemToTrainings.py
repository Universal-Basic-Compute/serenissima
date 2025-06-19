import os
import sys
import json
import logging
import requests
from typing import Dict, List, Any, Optional
from datetime import datetime
from pyairtable import Table
from dotenv import load_dotenv
from tqdm import tqdm

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(PROJECT_ROOT, 'logs', 'add_system_to_trainings.log'))
    ]
)
log = logging.getLogger(__name__)

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

# Airtable Configuration
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
NEXT_PUBLIC_BASE_URL = os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000")

if not all([AIRTABLE_API_KEY, AIRTABLE_BASE_ID]):
    log.error("Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID")
    sys.exit(1)

def get_citizen_ledger(username: str) -> Optional[str]:
    """
    Fetch the ledger for a citizen in markdown format.
    
    Args:
        username: The username of the citizen
        
    Returns:
        The ledger in markdown format, or None if there was an error
    """
    try:
        url = f"{NEXT_PUBLIC_BASE_URL}/api/get-ledger?citizenUsername={username}"
        log.info(f"Fetching ledger for {username} from {url}")
        
        response = requests.get(url, timeout=60)  # Increased timeout for potentially large ledgers
        
        if response.status_code == 200:
            log.info(f"Successfully fetched ledger for {username} ({len(response.text)} characters)")
            return response.text
        else:
            log.error(f"Failed to fetch ledger for {username}: HTTP {response.status_code}")
            log.error(f"Response: {response.text[:200]}...")
            return None
    except Exception as e:
        log.error(f"Error fetching ledger for {username}: {e}")
        return None

def main():
    """
    Main function to update the System field of TRAININGS records with citizen ledgers.
    """
    try:
        # Initialize Airtable tables
        trainings_table = Table(AIRTABLE_API_KEY, AIRTABLE_BASE_ID, "TRAININGS")
        
        # Get all TRAININGS records ordered by Citizen
        log.info("Fetching all TRAININGS records...")
        all_trainings = trainings_table.all(sort=["Citizen"])
        
        if not all_trainings:
            log.warning("No TRAININGS records found.")
            return
        
        log.info(f"Found {len(all_trainings)} TRAININGS records.")
        
        # Group records by Citizen
        trainings_by_citizen = {}
        for record in all_trainings:
            citizen = record.get('fields', {}).get('Citizen')
            if citizen:
                if citizen not in trainings_by_citizen:
                    trainings_by_citizen[citizen] = []
                trainings_by_citizen[citizen].append(record)
        
        log.info(f"Found {len(trainings_by_citizen)} unique citizens with TRAININGS records.")
        
        # Process each citizen
        for citizen, records in tqdm(trainings_by_citizen.items(), desc="Processing citizens"):
            log.info(f"Processing {len(records)} TRAININGS records for citizen {citizen}")
            
            # Fetch the ledger for this citizen
            ledger = get_citizen_ledger(citizen)
            
            if not ledger:
                log.warning(f"Skipping citizen {citizen} due to missing ledger.")
                continue
            
            # Update each training record for this citizen
            for record in tqdm(records, desc=f"Updating records for {citizen}", leave=False):
                record_id = record['id']
                
                try:
                    # Update the System field with the ledger
                    trainings_table.update(record_id, {"System": ledger})
                    log.info(f"Updated System field for TRAININGS record {record_id} (Citizen: {citizen})")
                except Exception as e:
                    log.error(f"Error updating TRAININGS record {record_id} (Citizen: {citizen}): {e}")
        
        log.info("Finished updating TRAININGS records.")
        
    except Exception as e:
        log.error(f"Error in main function: {e}", exc_info=True)

if __name__ == "__main__":
    log.info("Starting addSystemToTrainings script")
    main()
    log.info("addSystemToTrainings script completed")
