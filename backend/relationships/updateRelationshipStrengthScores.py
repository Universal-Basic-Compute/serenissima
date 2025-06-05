#!/usr/bin/env python3
"""
Update relationship strength scores based on relevancy data.

This script:
1. Fetches all AI citizens
2. For each AI citizen, fetches recent relevancies (created in the last 24 hours)
3. Updates relationship strength scores based on these relevancies
4. Applies a 25% decay to existing relationship scores

It can be run directly or imported and used by other scripts.
"""

import os
import sys
import logging
import time
import json
import requests # Added import for requests
from datetime import datetime, timedelta, timezone # Added import for timezone
from typing import Dict, List, Optional, Any
from pyairtable import Api, Base, Table # Import Base
from dotenv import load_dotenv

# Add the project root to sys.path and load .env immediately
# This ensures that 'backend' can be imported as a package.
_REL_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if _REL_PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _REL_PROJECT_ROOT)
load_dotenv(os.path.join(_REL_PROJECT_ROOT, '.env')) # Load .env from the project root

# Import the helper function
from backend.engine.utils.activity_helpers import _escape_airtable_value, LogColors as Colors # Import and alias LogColors

# ANSI color codes
# class Colors: # Definition removed

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format=f'%(asctime)s - %(name)s - {Colors.BOLD}%(levelname)s{Colors.ENDC} - %(message)s'
)
log = logging.getLogger("update_relationship_strength_scores")

# BASE_URL definition moved after sys.path and dotenv load
# _REL_PROJECT_ROOT and load_dotenv() were moved to the top of the file.


BASE_URL = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

# Constants for Trust Score Adjustments
TRUST_SCORE_MESSAGE_INTERACTION = 1.0
TRUST_SCORE_LOAN_PRINCIPAL_DIVISOR = 100000.0
TRUST_SCORE_CONTRACT_VALUE_DIVISOR = 100.0
TRUST_SCORE_TRANSACTION_VALUE_DIVISOR = 10000.0
TRUST_SCORE_EMPLOYEE_FED = 2.0
TRUST_SCORE_EMPLOYEE_HUNGRY = -15.0
TRUST_SCORE_EMPLOYEE_HOUSED = 3.0
TRUST_SCORE_EMPLOYEE_HOMELESS = -20.0
TRUST_SCORE_EMPLOYEE_PAID_RECENTLY = 15.0
TRUST_SCORE_EMPLOYEE_WAGE_ISSUE = -30.0
TRUST_SCORE_PUBLIC_WELFARE_HUNGRY_HOMELESS = -25.0
TRUST_SCORE_PUBLIC_WELFARE_HUNGRY = -10.0
TRUST_SCORE_PUBLIC_WELFARE_HOMELESS = -15.0
TRUST_SCORE_CO_GUILD_MEMBER = 1.0 # Bonus pour être dans la même guilde
RELATIONSHIP_STRENGTH_DECAY_FACTOR = 0.75 # Facteur de déclin pour le score latent
RELATIONSHIP_TRUST_DECAY_FACTOR = 0.75 # Facteur de déclin pour le score latent
RAW_POINT_TOTAL_MULTIPLIER = 0.1 # Multiplicateur global pour l'impact des points bruts journaliers

# Importer les fonctions de conversion et constantes
from backend.engine.utils.relationship_helpers import (
    apply_scaled_score_change, # Nouvelle fonction principale
    RAW_POINT_SCALE_FACTOR,    # Nouveau facteur
    DEFAULT_NORMALIZED_SCORE, # Pour TrustScore (point neutre 50)
    DEFAULT_NORMALIZED_STRENGTH_SCORE # Pour StrengthScore (point de base 0)
)

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')

    if api_key: api_key = api_key.strip()
    if base_id: base_id = base_id.strip()
    
    if not api_key or not base_id:
        log.error(f"{Colors.FAIL}Missing Airtable credentials (or empty after strip). Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.{Colors.ENDC}")
        sys.exit(1)
    
    try:
        # session = requests.Session() # Removed custom session
        # session.trust_env = False    # Removed custom session configuration

        log.info(f"{Colors.OKBLUE}Initializing Airtable connection...{Colors.ENDC}")
        
        api = Api(api_key) # Instantiate Api, let it manage its own session
        # api.session = session # Removed custom session assignment
        
        # Return a dictionary of table objects using pyairtable
        tables = {
            'citizens': api.table(base_id, 'CITIZENS'),
            'relevancies': api.table(base_id, 'RELEVANCIES'),
            'relationships': api.table(base_id, 'RELATIONSHIPS'),
            'notifications': api.table(base_id, 'NOTIFICATIONS'),
            'messages': api.table(base_id, 'MESSAGES'),
            'loans': api.table(base_id, 'LOANS'),
            'contracts': api.table(base_id, 'CONTRACTS'),
            'transactions': api.table(base_id, 'TRANSACTIONS'),
            'buildings': api.table(base_id, 'BUILDINGS')
        }
        # Test connection (optional, but good practice)
        try:
            tables['citizens'].all(max_records=1)
            log.info(f"{Colors.OKGREEN}Airtable connection initialized and tested successfully.{Colors.ENDC}")
        except Exception as conn_e:
            log.error(f"{Colors.FAIL}Airtable connection test failed: {conn_e}{Colors.ENDC}")
            raise conn_e # Re-raise to be caught by the outer try-except

        return tables
    except Exception as e:
        log.error(f"{Colors.FAIL}Failed to initialize Airtable: {e}{Colors.ENDC}")
        sys.exit(1)

def create_admin_notification(notifications_table: Table, title: str, message: str) -> bool:
    """Create an admin notification in Airtable."""
    if not notifications_table:
        log.error(f"{Colors.FAIL}Notifications table not provided. Cannot create admin notification.{Colors.ENDC}")
        return False
    try:
        from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
        notifications_table.create({
            'Content': title,
            'Details': message,
            'Type': 'admin',
            'Status': 'unread',
            'CreatedAt': datetime.now(VENICE_TIMEZONE).isoformat(), # Use VENICE_TIMEZONE
            'Citizen': 'ConsiglioDeiDieci' # Or a relevant system user
        })
        log.info(f"{Colors.OKCYAN}Admin notification created: {title}{Colors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{Colors.FAIL}Failed to create admin notification: {e}{Colors.ENDC}")
        return False

def get_all_citizens(tables) -> tuple[List[Dict], Dict[str, str], Dict[str, str]]:
    """Get all citizens from Airtable, a map of record_id to username, and username to record_id."""
    citizens_list = []
    record_id_to_username_map = {}
    username_to_record_id_map = {}
    username_to_citizen_record_map = {} # New map
    try:
        log.info(f"{Colors.OKBLUE}Fetching all citizens from Airtable...{Colors.ENDC}")
        
        # Step 1: Fetch all citizens with basic info + AteAt + GuildId
        all_citizen_records_raw = tables['citizens'].all(
            fields=["Username", "FirstName", "LastName", "AteAt", "GuildId"] # Added GuildId
        )
        
        for record in all_citizen_records_raw:
            citizens_list.append(record)
            username_val = record['fields'].get('Username')
            if username_val:
                record_id_to_username_map[record['id']] = username_val
                username_to_record_id_map[username_val] = record['id']
                record['fields']['works_for_employers'] = [] # Initialize employer list
                username_to_citizen_record_map[username_val] = record
        
        log.info(f"{Colors.OKGREEN}Fetched {Colors.BOLD}{len(citizens_list)}{Colors.ENDC}{Colors.OKGREEN} initial citizen records.{Colors.ENDC}")

        # Step 2: Fetch business buildings to determine employer-employee relationships
        log.info(f"{Colors.OKBLUE}Fetching business buildings to determine employment...{Colors.ENDC}")
        business_buildings = tables['buildings'].all(
            formula="{Category}='business'",
            fields=["Occupant", "RunBy"] # Occupant (employee), RunBy (employer)
        )
        log.info(f"{Colors.OKGREEN}Fetched {Colors.BOLD}{len(business_buildings)}{Colors.ENDC}{Colors.OKGREEN} business buildings.{Colors.ENDC}")

        # Step 3: Populate 'works_for_employers' list for each citizen
        for building in business_buildings:
            # Occupant and RunBy are expected to be Username strings
            employee_username = building['fields'].get('Occupant')
            employer_username = building['fields'].get('RunBy')

            if not employee_username or not employer_username:
                continue # Skip if either is missing

            # Check if the employee_username exists in our map of citizen records
            if employee_username in username_to_citizen_record_map:
                employee_record = username_to_citizen_record_map[employee_username]
                
                # An employer cannot be their own employee in this specific context
                if employer_username != employee_username:
                    # Add employer to the employee's list if not already present
                    if employer_username not in employee_record['fields']['works_for_employers']:
                        employee_record['fields']['works_for_employers'].append(employer_username)
        
        log.info(f"{Colors.OKGREEN}Processed employment data. Mapped {Colors.BOLD}{len(record_id_to_username_map)}{Colors.ENDC}{Colors.OKGREEN} record IDs, {Colors.BOLD}{len(username_to_record_id_map)}{Colors.ENDC}{Colors.OKGREEN} usernames, and {Colors.BOLD}{len(username_to_citizen_record_map)}{Colors.ENDC}{Colors.OKGREEN} full citizen records.{Colors.ENDC}")
        return citizens_list, record_id_to_username_map, username_to_record_id_map, username_to_citizen_record_map
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching and processing citizen/employment data: {e}{Colors.ENDC}")
        return [], {}, {}, {}

def get_recent_relevancies(username: str) -> List[Dict]:
    """Get recent relevancies for a citizen by calling the Next.js API."""
    try:
        log.info(f"{Colors.OKBLUE}Fetching recent relevancies for citizen: {Colors.BOLD}{username}{Colors.ENDC}{Colors.OKBLUE} via API...{Colors.ENDC}")
        
        # The API /api/relevancies already filters by CreatedAt (desc) and limits records.
        # It also handles 'RelevantToCitizen' = 'all' and JSON array matching.
        # Add excludeAll=true to ensure 'all' relevancies are not fetched for relationship calculations.
        api_url = f"{BASE_URL}/api/relevancies?relevantToCitizen={username}&excludeAll=true"
        
        response = requests.get(api_url, timeout=60)
        response.raise_for_status() # Raise an exception for HTTP errors
        
        data = response.json()
        
        if data.get('success') and isinstance(data.get('relevancies'), list):
            # Filter for relevancies created in the last 24 hours client-side,
            # as the API might not filter by date for this specific query.
            # However, the API sorts by CreatedAt desc, so we can optimize.
            from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
            twenty_four_hours_ago_dt = datetime.now(VENICE_TIMEZONE) - timedelta(hours=24) # Use VENICE_TIMEZONE
            
            recent_api_relevancies = []
            for r_api in data['relevancies']:
                created_at_str = r_api.get('createdAt')
                if created_at_str:
                    try:
                        # Airtable's ISO format often includes 'Z'
                        created_at_dt = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                        # Ensure it's timezone-aware for comparison if needed, or make both naive
                        if created_at_dt.tzinfo is None: # If API returns naive datetime
                             created_at_dt = created_at_dt.replace(tzinfo=timezone.utc) # Assume UTC if naive
                        
                        # Make twenty_four_hours_ago_dt timezone-aware (UTC) for comparison
                        # This depends on how your system handles timezones. Assuming UTC for consistency.
                        # If datetime.now() is naive, this will be naive.
                        # If datetime.now() is aware, this will be aware.
                        # For simplicity, if created_at_dt is aware, make twenty_four_hours_ago_dt aware too.
                        # Or, convert both to naive UTC timestamps for comparison.
                        
                        # Simplest: if API returns ISO string, parse and compare
                        if created_at_dt >= twenty_four_hours_ago_dt.replace(tzinfo=created_at_dt.tzinfo): # Match timezone awareness
                            recent_api_relevancies.append(r_api)
                        else:
                            # Since API sorts by CreatedAt desc, we can stop once we hit older records
                            break 
                    except ValueError:
                        log.warning(f"{Colors.WARNING}Could not parse createdAt date: {created_at_str} for relevancy {r_api.get('relevancyId')}{Colors.ENDC}")
                else:
                    # If no createdAt, include it by default or decide on a policy
                    recent_api_relevancies.append(r_api)


            log.info(f"{Colors.OKGREEN}Fetched {Colors.BOLD}{len(data['relevancies'])}{Colors.ENDC}{Colors.OKGREEN} relevancies from API, filtered to {Colors.BOLD}{len(recent_api_relevancies)}{Colors.ENDC}{Colors.OKGREEN} recent ones for {Colors.BOLD}{username}{Colors.ENDC}")
            return recent_api_relevancies
        else:
            log.error(f"{Colors.FAIL}API call to fetch relevancies for {Colors.BOLD}{username}{Colors.ENDC}{Colors.FAIL} was not successful or data format is wrong: {data.get('error', 'No error message')}{Colors.ENDC}")
            return []
            
    except requests.exceptions.RequestException as e_req:
        log.error(f"{Colors.FAIL}Request failed while fetching relevancies for {Colors.BOLD}{username}{Colors.ENDC}{Colors.FAIL} from API: {e_req}{Colors.ENDC}")
        return []
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching or processing relevancies for {Colors.BOLD}{username}{Colors.ENDC}{Colors.FAIL} from API: {e}{Colors.ENDC}")
        return []

def get_existing_relationships(tables, username: str) -> Dict[str, Dict]:
    """Get existing relationships for a citizen, regardless of whether they are Citizen1 or Citizen2."""
    try:
        log.info(f"{Colors.OKBLUE}Fetching existing relationships for citizen: {Colors.BOLD}{username}{Colors.ENDC}{Colors.OKBLUE}...{Colors.ENDC}")
        
        # Fetch relationships where this citizen is either Citizen1 or Citizen2
        formula = f"OR({{Citizen1}} = '{username}', {{Citizen2}} = '{username}')"
        
        relationships = tables['relationships'].all(
            formula=formula,
            fields=["Citizen1", "Citizen2", "StrengthScore", "TrustScore", "LastInteraction", "Notes"]
        )
        
        # Create a dictionary mapping the *other* citizen in the relationship to their record details
        relationship_map = {}
        for record in relationships:
            c1 = record['fields'].get('Citizen1')
            c2 = record['fields'].get('Citizen2')
            other_citizen = None
            if c1 == username:
                other_citizen = c2
            elif c2 == username:
                other_citizen = c1
            
            if other_citizen:
                relationship_map[other_citizen] = {
                    'id': record['id'],
                    'StrengthScore': record['fields'].get('StrengthScore', 0),
                    'TrustScore': record['fields'].get('TrustScore', 0),
                    'LastInteraction': record['fields'].get('LastInteraction'),
                    'notes': record['fields'].get('Notes', '')
                }
        
        log.info(f"{Colors.OKGREEN}Found {Colors.BOLD}{len(relationship_map)}{Colors.ENDC}{Colors.OKGREEN} existing relationships involving {Colors.BOLD}{username}{Colors.ENDC}")
        return relationship_map
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching relationships for {Colors.BOLD}{username}{Colors.ENDC}{Colors.FAIL}: {e}{Colors.ENDC}")
        return {}

def _calculate_trust_score_contributions_from_interactions( #NOSONAR
    tables: Dict[str, Table],
    username1: str, # Represents citizen_A
    username2: str, # Represents citizen_B
    citizen1_fields: Optional[Dict[str, Any]], # Fields for username1
    citizen2_fields: Optional[Dict[str, Any]], # Fields for username2
    username_to_record_id_map: Dict[str, str]
) -> tuple[float, set[str]]:
    """
    Calculate trust score contributions from various interactions between two citizens.
    Includes specific logic for employer-employee dynamics.
    """
    trust_score_addition = 0.0
    interaction_types = set()
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE
    now_venice = datetime.now(VENICE_TIMEZONE) # Use VENICE_TIMEZONE
    now_utc = now_venice.astimezone(timezone.utc) # Convert to UTC
    twenty_four_hours_ago = now_utc - timedelta(hours=24)


    # Helper to safely get float from record
    def safe_float(value, default=0.0):
        try:
            return float(value) if value is not None else default
        except (ValueError, TypeError):
            return default

    # 1. Messages in the last 24 hours
    try:
        message_formula = (
            f"AND(OR(AND({{Sender}}='{username1}',{{Receiver}}='{username2}'),"
            f"AND({{Sender}}='{username2}',{{Receiver}}='{username1}')),"
            f"IS_AFTER({{CreatedAt}}, DATETIME_PARSE('{twenty_four_hours_ago.isoformat()}')))"
        )
        # Removed fields=['id'] as it caused an UNKNOWN_FIELD_NAME error.
        # The primary field will be returned by default, and len() will work correctly.
        recent_messages = tables['messages'].all(formula=message_formula)
        if recent_messages:
            contribution = len(recent_messages) * TRUST_SCORE_MESSAGE_INTERACTION
            trust_score_addition += contribution
            interaction_types.add("messages_interaction")
            # log.info(f"{Colors.OKCYAN}Found {len(recent_messages)} recent messages between {username1} and {username2}. Trust +{contribution:.2f}{Colors.ENDC}")
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching messages between {username1} and {username2}: {e}{Colors.ENDC}")

    # 2. Active Loans
    try:
        loan_formula = (
            f"AND({{Status}}='active',OR(AND({{Lender}}='{username1}',{{Borrower}}='{username2}'),"
            f"AND({{Lender}}='{username2}',{{Borrower}}='{username1}')))"
        )
        active_loans = tables['loans'].all(formula=loan_formula, fields=['PrincipalAmount'])
        for loan in active_loans:
            principal = safe_float(loan['fields'].get('PrincipalAmount'))
            trust_score_addition += principal / TRUST_SCORE_LOAN_PRINCIPAL_DIVISOR
            interaction_types.add("loans_interaction")
            # log.info(f"{Colors.OKCYAN}Active loan found between {username1} and {username2} with principal {principal}. Trust +{principal / TRUST_SCORE_LOAN_PRINCIPAL_DIVISOR:.2f}{Colors.ENDC}")
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching loans between {username1} and {username2}: {e}{Colors.ENDC}")

    # 3. Active Contracts
    try:
        # We need to fetch and then filter EndAt client-side as IS_AFTER might be tricky with future dates in Airtable formulas
        contract_formula = (
            f"OR(AND({{Buyer}}='{username1}',{{Seller}}='{username2}'),"
            f"AND({{Buyer}}='{username2}',{{Seller}}='{username1}'))"
        )
        all_contracts_between_pair = tables['contracts'].all(
            formula=contract_formula,
            fields=['PricePerResource', 'TargetAmount', 'EndAt'] # Removed 'Status'
        )
        active_future_contracts_count = 0
        total_contracts_trust_contribution = 0.0
        for contract in all_contracts_between_pair:
            end_at_str = contract['fields'].get('EndAt')
            # Removed status check as the 'Status' field does not exist in the CONTRACTS table
            if end_at_str: 
                try:
                    end_at_dt = datetime.fromisoformat(end_at_str.replace('Z', '+00:00'))
                    if end_at_dt > now_utc:
                        price_per_resource = safe_float(contract['fields'].get('PricePerResource'))
                        target_amount = safe_float(contract['fields'].get('TargetAmount'))
                        contract_value_contribution = (price_per_resource * target_amount) / TRUST_SCORE_CONTRACT_VALUE_DIVISOR
                        trust_score_addition += contract_value_contribution
                        total_contracts_trust_contribution += contract_value_contribution
                        active_future_contracts_count +=1
                        # log.info(f"{Colors.OKCYAN}Active contract {contract['id']} with {username1}-{username2}. Trust +{contract_value_contribution:.2f}{Colors.ENDC}")
                except ValueError:
                    log.warning(f"{Colors.WARNING}Could not parse EndAt date: {end_at_str} for contract {contract['id']}{Colors.ENDC}")
        if active_future_contracts_count > 0:
            interaction_types.add("contracts_interaction")
            # log.info(f"{Colors.OKCYAN}Found {active_future_contracts_count} active future contracts between {username1} and {username2}, total trust contribution: +{total_contracts_trust_contribution:.2f}{Colors.ENDC}")
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching contracts between {username1} and {username2}: {e}{Colors.ENDC}")

    # 4. Transactions in the last 24 hours
    try:
        transaction_formula = (
            f"AND(OR(AND({{Seller}}='{username1}',{{Buyer}}='{username2}'),"
            f"AND({{Seller}}='{username2}',{{Buyer}}='{username1}')),"
            f"IS_AFTER({{ExecutedAt}}, DATETIME_PARSE('{twenty_four_hours_ago.isoformat()}')))"
        )
        recent_transactions = tables['transactions'].all(formula=transaction_formula, fields=['Price'])
        for transaction in recent_transactions:
            price = safe_float(transaction['fields'].get('Price'))
            transaction_value_contribution = price / TRUST_SCORE_TRANSACTION_VALUE_DIVISOR
            trust_score_addition += transaction_value_contribution
            interaction_types.add("transactions_interaction")
            # log.info(f"{Colors.OKCYAN}Recent transaction found between {username1} and {username2} with price {price}. Trust +{transaction_value_contribution:.2f}{Colors.ENDC}")
    except Exception as e:
        log.error(f"{Colors.FAIL}Error fetching transactions between {username1} and {username2}: {e}{Colors.ENDC}")

    # 5. Employer-Employee specific trust adjustments
    # Ensure citizen1_fields and citizen2_fields are available
    if citizen1_fields and citizen2_fields:
        # Scenario 1: username1 is employee, username2 is employer
        # 'works_for_employers' now contains a list of employer usernames
        employee1_employers = citizen1_fields.get('works_for_employers', []) 

        if username2 in employee1_employers:
            # username1 works for username2
            ate_at_str_c1 = citizen1_fields.get('AteAt')
            if ate_at_str_c1:
                try:
                    ate_at_dt_c1 = datetime.fromisoformat(ate_at_str_c1.replace('Z', '+00:00')).astimezone(timezone.utc)
                    if ate_at_dt_c1 >= twenty_four_hours_ago:
                        trust_score_addition += TRUST_SCORE_EMPLOYEE_FED
                        interaction_types.add("employee_fed")
                        # log.info(f"{Colors.OKCYAN}{username1} (employee) is fed. Trust +{TRUST_SCORE_EMPLOYEE_FED:.2f} towards {username2} (employer).{Colors.ENDC}")
                    else:
                        trust_score_addition += TRUST_SCORE_EMPLOYEE_HUNGRY # Note: HUNGRY is negative
                        interaction_types.add("employee_hungry")
                        # log.info(f"{Colors.WARNING}{username1} (employee) is hungry. Trust {TRUST_SCORE_EMPLOYEE_HUNGRY:.2f} towards {username2} (employer).{Colors.ENDC}")
                except ValueError:
                    # log.warning(f"{Colors.WARNING}Could not parse AteAt date '{ate_at_str_c1}' for {username1}. Assuming hungry. Trust {TRUST_SCORE_EMPLOYEE_HUNGRY:.2f}{Colors.ENDC}")
                    trust_score_addition += TRUST_SCORE_EMPLOYEE_HUNGRY
                    interaction_types.add("employee_hungry_parse_error")
            else: # No AteAt record
                trust_score_addition += TRUST_SCORE_EMPLOYEE_HUNGRY
                interaction_types.add("employee_hungry_no_record")
                # log.info(f"{Colors.WARNING}{username1} (employee) has no AteAt record. Assuming hungry. Trust {TRUST_SCORE_EMPLOYEE_HUNGRY:.2f} towards {username2} (employer).{Colors.ENDC}")

        # Scenario 2: username2 is employee, username1 is employer
        # 'works_for_employers' now contains a list of employer usernames
        employee2_employers = citizen2_fields.get('works_for_employers', [])

        if username1 in employee2_employers:
            # username2 works for username1
            # Check if employee username2 owns a home. Owner field is a username string.
            home_formula = f"AND({{Category}}='home', {{Owner}}='{_escape_airtable_value(username2)}')"
            try:
                # Requesting no specific fields, just checking for existence.
                home_records = tables['buildings'].all(formula=home_formula, fields=[]) 
                if home_records:
                    trust_score_addition += TRUST_SCORE_EMPLOYEE_HOUSED
                    interaction_types.add("employee_housed")
                    # log.info(f"{Colors.OKCYAN}{username2} (employee) is housed. Trust +{TRUST_SCORE_EMPLOYEE_HOUSED:.2f} towards {username1} (employer).{Colors.ENDC}")
                else:
                    trust_score_addition += TRUST_SCORE_EMPLOYEE_HOMELESS # Note: HOMELESS is negative
                    interaction_types.add("employee_homeless")
                    # log.info(f"{Colors.WARNING}{username2} (employee) is homeless. Trust {TRUST_SCORE_EMPLOYEE_HOMELESS:.2f} towards {username1} (employer).{Colors.ENDC}")
            except Exception as e_build:
                trust_score_addition += TRUST_SCORE_EMPLOYEE_HOMELESS # Penalize if check fails
                interaction_types.add("employee_homeless_check_error")
                # log.error(f"{Colors.FAIL}Error checking home for {username2}: {e_build}. Trust {TRUST_SCORE_EMPLOYEE_HOMELESS:.2f} (penalty for check error).{Colors.ENDC}")

            # Wage payment check (username1 is employer, username2 is employee)
            try:
                wage_formula = f"AND({{Type}}='wage_payment', {{Seller}}='{username1}', {{Buyer}}='{username2}')"
                # Fetch the most recent wage payment
                wage_transactions = tables['transactions'].all(
                    formula=wage_formula,
                    fields=['ExecutedAt', 'Price'],
                    sort=[('-ExecutedAt')] # Sort by ExecutedAt descending
                )
                
                if wage_transactions:
                    latest_wage = wage_transactions[0]['fields']
                    executed_at_str = latest_wage.get('ExecutedAt')
                    wage_price = safe_float(latest_wage.get('Price'))

                    if executed_at_str:
                        executed_at_dt = datetime.fromisoformat(executed_at_str.replace('Z', '+00:00')).astimezone(timezone.utc)
                        if executed_at_dt >= twenty_four_hours_ago and wage_price > 0:
                            trust_score_addition += TRUST_SCORE_EMPLOYEE_PAID_RECENTLY
                            interaction_types.add("employee_paid_recently")
                            # log.info(f"{Colors.OKCYAN}{username2} (employee) paid recently (wage: {wage_price}). Trust +{TRUST_SCORE_EMPLOYEE_PAID_RECENTLY:.2f} towards {username1} (employer).{Colors.ENDC}")
                        else:
                            trust_score_addition += TRUST_SCORE_EMPLOYEE_WAGE_ISSUE # Note: WAGE_ISSUE is negative
                            interaction_types.add("employee_wage_issue_late_or_zero")
                            # log.info(f"{Colors.FAIL}{username2} (employee) not paid recently or wage was zero (last wage: {wage_price} at {executed_at_str}). Trust {TRUST_SCORE_EMPLOYEE_WAGE_ISSUE:.2f} towards {username1} (employer).{Colors.ENDC}")
                    else: # No ExecutedAt timestamp on the latest wage payment record
                        trust_score_addition += TRUST_SCORE_EMPLOYEE_WAGE_ISSUE
                        interaction_types.add("employee_wage_issue_no_timestamp")
                        # log.info(f"{Colors.FAIL}{username2} (employee) latest wage payment has no timestamp. Trust {TRUST_SCORE_EMPLOYEE_WAGE_ISSUE:.2f} towards {username1} (employer).{Colors.ENDC}")
                else: # No wage payment transactions found
                    trust_score_addition += TRUST_SCORE_EMPLOYEE_WAGE_ISSUE
                    interaction_types.add("employee_wage_issue_none_found")
                    # log.info(f"{Colors.FAIL}No wage payments found from {username1} (employer) to {username2} (employee). Trust {TRUST_SCORE_EMPLOYEE_WAGE_ISSUE:.2f}.{Colors.ENDC}")
            except Exception as e_wage:
                trust_score_addition += TRUST_SCORE_EMPLOYEE_WAGE_ISSUE # Penalize if check fails
                interaction_types.add("employee_wage_check_error")
                # log.error(f"{Colors.FAIL}Error checking wage payments for {username1} (employer) to {username2} (employee): {e_wage}. Trust {TRUST_SCORE_EMPLOYEE_WAGE_ISSUE:.2f} (penalty for check error).{Colors.ENDC}")
    else:
        log.debug(f"Citizen fields not provided for {username1} or {username2}, skipping employer-employee trust checks.")

    # 6. Public Welfare Check (Relationship with ConsiglioDeiDieci)
    consiglio_username = "ConsiglioDeiDieci"
    citizen_to_check_username = None
    citizen_to_check_fields = None

    if username1 == consiglio_username and citizen2_fields:
        citizen_to_check_username = username2
        citizen_to_check_fields = citizen2_fields
    elif username2 == consiglio_username and citizen1_fields:
        citizen_to_check_username = username1
        citizen_to_check_fields = citizen1_fields

    if citizen_to_check_username and citizen_to_check_fields: # This is for public welfare vs Consiglio
        is_hungry = False
        is_homeless = False

        # Check for hunger
        ate_at_str = citizen_to_check_fields.get('AteAt')
        if ate_at_str:
            try:
                ate_at_dt = datetime.fromisoformat(ate_at_str.replace('Z', '+00:00')).astimezone(timezone.utc)
                if ate_at_dt < twenty_four_hours_ago:
                    is_hungry = True
            except ValueError:
                log.warning(f"{Colors.WARNING}Could not parse AteAt date '{ate_at_str}' for {citizen_to_check_username} in public welfare check. Assuming hungry.{Colors.ENDC}")
                is_hungry = True # Assume hungry if parse fails
        else: # No AteAt record
            is_hungry = True
        
        # Check for homelessness
        # Owner field in BUILDINGS is a username string.
        home_formula_welfare = f"AND({{Category}}='home', {{Owner}}='{_escape_airtable_value(citizen_to_check_username)}')"
        try:
            # Requesting no specific fields, just checking for existence.
            home_records_welfare = tables['buildings'].all(formula=home_formula_welfare, fields=[])
            if not home_records_welfare:
                is_homeless = True
        except Exception as e_build_welfare:
            log.error(f"{Colors.FAIL}Error checking home for {citizen_to_check_username} in public welfare check: {e_build_welfare}{Colors.ENDC}")
            is_homeless = True # Assume homeless if check fails
        
        # Apply trust penalties
        if is_hungry and is_homeless:
            trust_score_addition += TRUST_SCORE_PUBLIC_WELFARE_HUNGRY_HOMELESS # Note: This is negative
            interaction_types.add("public_welfare_suffering")
            # log.info(f"{Colors.FAIL}{citizen_to_check_username} is hungry AND homeless. Trust with ConsiglioDeiDieci {TRUST_SCORE_PUBLIC_WELFARE_HUNGRY_HOMELESS:.2f}.{Colors.ENDC}")
        elif is_hungry:
            trust_score_addition += TRUST_SCORE_PUBLIC_WELFARE_HUNGRY # Note: This is negative
            interaction_types.add("public_welfare_hungry")
            # log.info(f"{Colors.WARNING}{citizen_to_check_username} is hungry. Trust with ConsiglioDeiDieci {TRUST_SCORE_PUBLIC_WELFARE_HUNGRY:.2f}.{Colors.ENDC}")
        elif is_homeless:
            trust_score_addition += TRUST_SCORE_PUBLIC_WELFARE_HOMELESS # Note: This is negative
            interaction_types.add("public_welfare_homeless")
            # log.info(f"{Colors.WARNING}{citizen_to_check_username} is homeless. Trust with ConsiglioDeiDieci {TRUST_SCORE_PUBLIC_WELFARE_HOMELESS:.2f}.{Colors.ENDC}")

    # 7. Co-Guild Membership (Bonus if not ConsiglioDeiDieci)
    # This check is for general relationships, not specifically with Consiglio.
    if username1 != consiglio_username and username2 != consiglio_username:
        if citizen1_fields and citizen2_fields:
            guild1_id = citizen1_fields.get('GuildId')
            guild2_id = citizen2_fields.get('GuildId')
            if guild1_id and guild2_id and guild1_id == guild2_id:
                trust_score_addition += TRUST_SCORE_CO_GUILD_MEMBER
                interaction_types.add("co_guild_members_interaction")
                # log.info(f"{Colors.OKCYAN}{username1} and {username2} are in the same guild ({guild1_id}). Trust +{TRUST_SCORE_CO_GUILD_MEMBER:.2f}{Colors.ENDC}")

    # log.info(f"{Colors.OKGREEN}Calculated trust score addition of {Colors.BOLD}{trust_score_addition:.2f}{Colors.ENDC}{Colors.OKGREEN} for {Colors.BOLD}{username1}-{username2}{Colors.ENDC}{Colors.OKGREEN} from types: {Colors.BOLD}{interaction_types}{Colors.ENDC}")
    return trust_score_addition, interaction_types

def update_relationship_scores(
    tables: Dict[str, Table],
    source_citizen_record: Dict,
    relevancies: List[Dict],
    existing_relationships: Dict[str, Dict],
    record_id_to_username_map: Dict[str, str],
    username_to_citizen_record_map: Dict[str, Dict], # New parameter
    username_to_record_id_map: Dict[str, str] # New parameter
) -> Dict[str, float]:
    """Update relationship strength and trust scores."""
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE # Import VENICE_TIMEZONE here
    source_username = source_citizen_record['fields']['Username']
    try:
        log.info(f"{Colors.OKBLUE}Processing scores for {source_username}: Found {len(relevancies)} new relevancies and {len(existing_relationships)} existing relationships to consider.{Colors.ENDC}")
        # log.info(f"{Colors.HEADER}Updating relationship scores for source citizen: {Colors.BOLD}{source_username}{Colors.ENDC}")
    
        # Track new scores and relevancy types for each target citizen
        # The value will be a tuple: (accumulated_score, set_of_relevancy_types)
        accumulated_data_for_targets: Dict[str, tuple[float, set[str]]] = {}
    
        # Process each relevancy (structure is now flat from API)
        for relevancy in relevancies:
            raw_target_value = relevancy.get('targetCitizen') # Adjusted access
            relevancy_score = float(relevancy.get('score', 0)) # Adjusted access
            relevancy_type = relevancy.get('type', 'unknown_type') # Adjusted access
        
            potential_target_usernames: set[str] = set()

            if isinstance(raw_target_value, str):
                # Could be a single username, or a JSON string array of usernames
                try:
                    if raw_target_value.startswith('[') and raw_target_value.endswith(']'):
                        # import json # Already imported at the top of the file
                        parsed_targets = json.loads(raw_target_value)
                        if isinstance(parsed_targets, list):
                            potential_target_usernames.update(str(t) for t in parsed_targets)
                        else: # Should not happen if JSON is a list, but as a fallback
                            potential_target_usernames.add(raw_target_value)
                    else: # Assume it's a single username string
                        potential_target_usernames.add(raw_target_value)
                except json.JSONDecodeError:
                    # Not a valid JSON string, treat as a single username
                    potential_target_usernames.add(raw_target_value)
            elif isinstance(raw_target_value, list):
                # Assumed to be a list of Airtable Record IDs (from a linked field)
                for rec_id in raw_target_value:
                    mapped_username = record_id_to_username_map.get(rec_id)
                    if mapped_username:
                        potential_target_usernames.add(mapped_username)
                    else: # New log for unmapped record ID
                        log.warning(f"{Colors.WARNING}Could not map record ID '{rec_id}' from relevancy "
                                    f"'{relevancy.get('relevancyId', 'UnknownRelevancyID')}' (for source '{source_username}') to a username. "
                                    f"This target will be skipped for relationship scoring.{Colors.ENDC}")
            
            for target_username_from_relevancy in potential_target_usernames:
                # Skip if no valid target username or if target is the source citizen itself
                if not target_username_from_relevancy or target_username_from_relevancy == source_username:
                    continue
                
                # Add relevancy score and type to this target
                current_score, current_types = accumulated_data_for_targets.get(target_username_from_relevancy, (0.0, set()))
                current_score += relevancy_score
                current_types.add(relevancy_type)
                accumulated_data_for_targets[target_username_from_relevancy] = (current_score, current_types)
                
        # Now update or create relationships in Airtable
        updated_count = 0
        created_count = 0
        
        # Combine targets from new relevancies and existing relationships
        all_target_usernames_to_process = set(accumulated_data_for_targets.keys())
        all_target_usernames_to_process.update(existing_relationships.keys())

        processed_scores_for_stats = {} # For returning stats for notification

        for target_username in all_target_usernames_to_process:
            # Get data from new relevancies, if any
            score_to_add, new_relevancy_types_set = accumulated_data_for_targets.get(target_username, (0.0, set()))
            notes_string = ""

            if target_username in existing_relationships:
                # Update existing relationship
                record = existing_relationships[target_username]
                record_id = record['id']

                # --- StrengthScore (0-100 en BDD, base 0) ---
                current_strength_score = float(record.get('StrengthScore', DEFAULT_NORMALIZED_STRENGTH_SCORE))
                # 1. Appliquer le déclin (vers 0)
                strength_score_decayed = current_strength_score * RELATIONSHIP_STRENGTH_DECAY_FACTOR
                strength_score_decayed = max(0.0, strength_score_decayed) # S'assurer qu'il ne descend pas sous 0
                # 2. Ajouter les points bruts de pertinence (score_to_add)
                scaled_score_to_add = score_to_add * RAW_POINT_TOTAL_MULTIPLIER
                updated_strength_score = apply_scaled_score_change(
                    strength_score_decayed, 
                    scaled_score_to_add, 
                    RAW_POINT_SCALE_FACTOR, 
                    min_score=0.0, 
                    max_score=100.0
                )

                # --- TrustScore (0-100 en BDD, neutre 50) ---
                current_trust_score = float(record.get('TrustScore', DEFAULT_NORMALIZED_SCORE))
                # 1. Appliquer le déclin (vers 50)
                trust_score_decayed = DEFAULT_NORMALIZED_SCORE + (current_trust_score - DEFAULT_NORMALIZED_SCORE) * RELATIONSHIP_TRUST_DECAY_FACTOR
                # 2. Calculer les points bruts d'interaction
                target_citizen_record = username_to_citizen_record_map.get(target_username)
                trust_additions_raw, trust_interaction_types = (0.0, set())
                if target_citizen_record:
                    trust_additions_raw, trust_interaction_types = _calculate_trust_score_contributions_from_interactions(
                        tables,
                        source_username,
                        target_username,
                        source_citizen_record['fields'],
                        target_citizen_record['fields'],
                        username_to_record_id_map
                    )
                else:
                    log.warning(f"{Colors.WARNING}Target citizen '{target_username}' (for source '{source_username}') not found in map for trust calculation on existing relationship. Trust additions from interactions will be 0.{Colors.ENDC}")
                # 3. Ajouter les points bruts d'interaction
                scaled_trust_additions_raw = trust_additions_raw * RAW_POINT_TOTAL_MULTIPLIER
                updated_trust_score = apply_scaled_score_change(
                    trust_score_decayed,
                    scaled_trust_additions_raw,
                    RAW_POINT_SCALE_FACTOR,
                    min_score=0.0,
                    max_score=100.0
                )
                
                # === Notes Update ===
                existing_notes_str = record.get('notes', '')
                # new_relevancy_types_set is from current relevancy for this target_username
                
                # Parse existing notes for previous source types
                # This simple parsing assumes "Sources: type1,type2"
                # A more robust parser might be needed if Notes format varies
                parsed_existing_types = set()
                if existing_notes_str and existing_notes_str.startswith("Sources: "):
                    try:
                        types_part = existing_notes_str.replace("Sources: ", "")
                        parsed_existing_types.update(t.strip() for t in types_part.split(','))
                    except Exception:
                        log.warning(f"{Colors.WARNING}Could not parse existing notes for {source_username}-{target_username}: {existing_notes_str}{Colors.ENDC}")
                
                # Combine all source types: old, new strength-related, new trust-related
                all_source_types = parsed_existing_types.union(new_relevancy_types_set).union(trust_interaction_types)
                if all_source_types:
                    notes_string = f"Sources: {', '.join(sorted(list(all_source_types)))}"
                
                # Log avec couleurs pour les deltas
                strength_delta = updated_strength_score - current_strength_score
                trust_delta = updated_trust_score - current_trust_score
                
                strength_color = Colors.OKGREEN if strength_delta >= 0 else Colors.FAIL
                trust_color = Colors.OKGREEN if trust_delta >= 0 else Colors.FAIL
                
                log_message_update = (
                    f"{Colors.OKCYAN}Updating existing relationship for {Colors.BOLD}{source_username}{Colors.ENDC}{Colors.OKCYAN} with {Colors.BOLD}{target_username}{Colors.ENDC}:\n"
                    f"  StrengthScore: {current_strength_score:.2f} -> {updated_strength_score:.2f} "
                    f"({strength_color}{strength_delta:+.2f}{Colors.ENDC})\n"
                    f"  TrustScore:    {current_trust_score:.2f} -> {updated_trust_score:.2f} "
                    f"({trust_color}{trust_delta:+.2f}{Colors.ENDC})\n"
                    f"  Decayed Strength: {strength_score_decayed:.2f}, Decayed Trust: {trust_score_decayed:.2f}\n"
                    f"  Contributing Notes: {notes_string}{Colors.ENDC}"
                )
                log.info(log_message_update)
                
                tables['relationships'].update(record_id, {
                    'StrengthScore': updated_strength_score,
                    'TrustScore': updated_trust_score,
                    'LastInteraction': datetime.now(VENICE_TIMEZONE).isoformat(), # Use VENICE_TIMEZONE
                    'Notes': notes_string,
                    'Status': 'Active'  # Assurer que le statut est Actif lors de la mise à jour
                })
                updated_count += 1
                processed_scores_for_stats[target_username] = score_to_add # For stats
            
            elif score_to_add > 0 or new_relevancy_types_set: # Only create if there's a new relevancy
                # Create new relationship
                # Initial StrengthScore starts at base (0) and applies relevancy points
                scaled_score_to_add_new_rel = score_to_add * RAW_POINT_TOTAL_MULTIPLIER
                initial_strength_score = apply_scaled_score_change(
                    DEFAULT_NORMALIZED_STRENGTH_SCORE, 
                    scaled_score_to_add_new_rel, 
                    RAW_POINT_SCALE_FACTOR, 
                    min_score=0.0, 
                    max_score=100.0
                )

                # Initial TrustScore starts at neutral (50) and applies interaction points
                target_citizen_record = username_to_citizen_record_map.get(target_username)
                trust_additions_raw, trust_interaction_types = (0.0, set())
                if target_citizen_record:
                    trust_additions_raw, trust_interaction_types = _calculate_trust_score_contributions_from_interactions(
                        tables,
                        source_username,
                        target_username,
                        source_citizen_record['fields'],
                        target_citizen_record['fields'],
                        username_to_record_id_map
                    )
                else:
                    log.warning(f"{Colors.WARNING}Target citizen '{target_username}' (for source '{source_username}') not found in map for new trust calculation. Trust score for new relationship will be based on 0 initial trust additions from interactions.{Colors.ENDC}")
                
                scaled_trust_additions_new_rel = trust_additions_raw * RAW_POINT_TOTAL_MULTIPLIER
                initial_trust_score = apply_scaled_score_change(
                    DEFAULT_NORMALIZED_SCORE,
                    scaled_trust_additions_new_rel,
                    RAW_POINT_SCALE_FACTOR,
                    min_score=0.0,
                    max_score=100.0
                )
                
                # Combine notes sources
                all_source_types = new_relevancy_types_set.union(trust_interaction_types)
                if all_source_types: # This check was missing in the previous REPLACE block
                    notes_string = f"Sources: {', '.join(sorted(list(all_source_types)))}"
                else:
                    notes_string = ""

                # Log avec couleurs pour les deltas par rapport aux valeurs par défaut
                strength_delta_new = initial_strength_score - DEFAULT_NORMALIZED_STRENGTH_SCORE
                trust_delta_new = initial_trust_score - DEFAULT_NORMALIZED_SCORE
                
                strength_color_new = Colors.OKGREEN if strength_delta_new >= 0 else Colors.FAIL
                trust_color_new = Colors.OKGREEN if trust_delta_new >= 0 else Colors.FAIL

                log_message_create = (
                    f"{Colors.OKGREEN}Creating new relationship for {Colors.BOLD}{source_username}{Colors.ENDC}{Colors.OKGREEN} with {Colors.BOLD}{target_username}{Colors.ENDC}:\n"
                    f"  StrengthScore: {DEFAULT_NORMALIZED_STRENGTH_SCORE:.2f} -> {initial_strength_score:.2f} "
                    f"({strength_color_new}{strength_delta_new:+.2f}{Colors.ENDC}) (Relevancies: {new_relevancy_types_set})\n"
                    f"  TrustScore:    {DEFAULT_NORMALIZED_SCORE:.2f} -> {initial_trust_score:.2f} "
                    f"({trust_color_new}{trust_delta_new:+.2f}{Colors.ENDC}) (Interactions: {trust_interaction_types})\n"
                    f"  Contributing Notes: {notes_string}{Colors.ENDC}"
                )
                log.info(log_message_create)

                # Ensure Citizen1 and Citizen2 are stored alphabetically
                c1, c2 = tuple(sorted((source_username, target_username)))
                
                tables['relationships'].create({
                    'Citizen1': c1,
                    'Citizen2': c2,
                    'StrengthScore': initial_strength_score,
                    'TrustScore': initial_trust_score,
                    'LastInteraction': datetime.now(VENICE_TIMEZONE).isoformat(), # Use VENICE_TIMEZONE
                    'Notes': notes_string
                })
                created_count += 1
                processed_scores_for_stats[target_username] = score_to_add # For stats
            
        log.info(f"{Colors.OKGREEN}For source {Colors.BOLD}{source_username}{Colors.ENDC}{Colors.OKGREEN}: Updated {Colors.BOLD}{updated_count}{Colors.ENDC}{Colors.OKGREEN} and created {Colors.BOLD}{created_count}{Colors.ENDC}{Colors.OKGREEN} relationships (scores are 0-100).{Colors.ENDC}")
        # Return a dictionary of target_username to score_to_add for stats calculation
        return processed_scores_for_stats
    except Exception as e:
        log.error(f"{Colors.FAIL}Error updating relationship scores for source {Colors.BOLD}{source_username}{Colors.ENDC}{Colors.FAIL}: {e}{Colors.ENDC}")
        return {}

def update_relationship_strength_scores():
    """Main function to update relationship strength scores."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        log.info(f"{Colors.HEADER}--- Starting Relationship Strength Score Update ---{Colors.ENDC}")
        # Get all citizens and the necessary maps
        all_citizen_records, record_id_to_username_map, username_to_record_id_map, username_to_citizen_record_map = get_all_citizens(tables)
        
        if not all_citizen_records:
            log.warning(f"{Colors.WARNING}No citizens found, nothing to do.{Colors.ENDC}")
            return True # No error, just nothing to process
        
        # Track statistics for notification
        stats = {
            'total_citizens_processed': 0,
            'total_relevancies_fetched': 0,
            'total_relationships_updated': 0,
            'total_relationships_created': 0,
            'citizen_details': {}
        }
        
        # Process each citizen
        total_citizens_to_process_rels = len(all_citizen_records)
        log.info(f"Starting relationship score update for {total_citizens_to_process_rels} citizens.")
        total_citizens_to_process_rels = len(all_citizen_records)
        log.info(f"Starting relationship score update for {total_citizens_to_process_rels} citizens.")
        for i, citizen_record in enumerate(all_citizen_records):
            username = citizen_record['fields'].get('Username')
            if not username:
                # log.warning(f"{Colors.WARNING}Skipping citizen record {citizen_record['id']} (index {i}) due to missing Username.{Colors.ENDC}")
                continue
            
            # log.info(f"{Colors.OKBLUE}Processing citizen {i+1}/{total_citizens_to_process_rels}: {Colors.BOLD}{username}{Colors.ENDC}")
            stats['total_citizens_processed'] += 1
            # username_record_id is no longer needed for get_recent_relevancies
            
            # Get recent relevancies for this citizen via API
            relevancies = get_recent_relevancies(username)
            stats['total_relevancies_fetched'] += len(relevancies)
            
            # Get existing relationships for this citizen
            existing_relationships = get_existing_relationships(tables, username)
            
            # Update relationship scores
            processed_target_scores = update_relationship_scores(
                tables, 
                citizen_record, 
                relevancies, 
                existing_relationships,
                record_id_to_username_map,
                username_to_citizen_record_map, # Pass new map
                username_to_record_id_map # Pass map
            )
            
            # Update statistics based on what was actually processed
            current_updated = 0
            current_created = 0
            for target, _ in processed_target_scores.items():
                if target in existing_relationships:
                    current_updated +=1
                else:
                    current_created +=1
            
            stats['citizen_details'][username] = {
                'relevancies_fetched': len(relevancies),
                'relationships_updated': current_updated,
                'relationships_created': current_created
            }
            
            stats['total_relationships_updated'] += current_updated
            stats['total_relationships_created'] += current_created
            
            # Add a small delay to avoid rate limiting
            time.sleep(0.5)
        
        # Create admin notification with summary
        notification_title = "Relationship Strength Scores Updated"
        notification_message = (
            f"Updated relationship strength scores for {stats['total_citizens_processed']} citizens.\n" # Corrected key
            f"Processed {stats['total_relevancies_fetched']} relevancies.\n" # Corrected key
            f"Updated {stats['total_relationships_updated']} existing relationships.\n"
            f"Created {stats['total_relationships_created']} new relationships.\n\n"
            "Details by citizen:\n"
        )
        
        for username, details in stats['citizen_details'].items():
            notification_message += (
                f"- {username}: Processed {details['relevancies_fetched']} relevancies, " # Corrected key
                f"updated {details['relationships_updated']} relationships, "
                f"created {details['relationships_created']} new relationships.\n"
            )
        
        create_admin_notification(tables['notifications'], notification_title, notification_message)
        
        log.info(f"{Colors.OKGREEN}{Colors.BOLD}--- Successfully updated relationship strength scores ---{Colors.ENDC}")
        return True
    except Exception as e:
        log.error(f"{Colors.FAIL}Error updating relationship strength scores: {e}{Colors.ENDC}")
        
        # Try to create an admin notification about the error
        try:
            # tables should already be initialized if we reached this point from the main try block
            if 'notifications' in tables:
                create_admin_notification(
                    tables['notifications'],
                    "Relationship Strength Score Update Error",
                    f"An error occurred while updating relationship strength scores: {str(e)}"
                )
            else: # Fallback if tables somehow not fully initialized
                temp_tables = initialize_airtable()
                if temp_tables and 'notifications' in temp_tables:
                    create_admin_notification(
                        temp_tables['notifications'],
                        "Relationship Strength Score Update Error",
                        f"An error occurred while updating relationship strength scores: {str(e)}"
                    )
        except Exception as notify_e:
            log.error(f"{Colors.FAIL}Could not create error notification: {notify_e}{Colors.ENDC}")
        
        return False

if __name__ == "__main__":
    log.info(f"{Colors.HEADER}Starting relationship strength score update script...{Colors.ENDC}")
    start_time = time.time()
    success = update_relationship_strength_scores()
    end_time = time.time()
    duration = end_time - start_time
    if success:
        log.info(f"{Colors.OKGREEN}Script finished successfully in {duration:.2f} seconds.{Colors.ENDC}")
    else:
        log.error(f"{Colors.FAIL}Script failed after {duration:.2f} seconds.{Colors.ENDC}")
    sys.exit(0 if success else 1)
