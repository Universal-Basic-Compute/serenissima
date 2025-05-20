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

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("update_relationship_strength_scores")

# Load environment variables
load_dotenv()

BASE_URL = os.environ.get('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        api = Api(api_key)
        base = Base(api, base_id) # Create a Base object
        
        # Return a dictionary of table objects using pyairtable
        tables = {
            'citizens': Table(None, base, 'CITIZENS'),
            'relevancies': Table(None, base, 'RELEVANCIES'),
            'relationships': Table(None, base, 'RELATIONSHIPS'),
            'notifications': Table(None, base, 'NOTIFICATIONS'),
            'messages': Table(None, base, 'MESSAGES'),
            'loans': Table(None, base, 'LOANS'),
            'contracts': Table(None, base, 'CONTRACTS'),
            'transactions': Table(None, base, 'TRANSACTIONS')
        }
        log.info("Connexion à Airtable initialisée avec des objets Base et Table explicites.")
        return tables
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def create_admin_notification(notifications_table: Table, title: str, message: str) -> bool:
    """Create an admin notification in Airtable."""
    if not notifications_table:
        log.error("Notifications table not provided. Cannot create admin notification.")
        return False
    try:
        notifications_table.create({
            'Content': title,
            'Details': message,
            'Type': 'admin',
            'Status': 'unread',
            'CreatedAt': datetime.now().isoformat(),
            'Citizen': 'ConsiglioDeiDieci' # Or a relevant system user
        })
        log.info(f"Admin notification created: {title}")
        return True
    except Exception as e:
        log.error(f"Failed to create admin notification: {e}")
        return False

def get_all_citizens(tables) -> tuple[List[Dict], Dict[str, str], Dict[str, str]]:
    """Get all citizens from Airtable, a map of record_id to username, and username to record_id."""
    citizens_list = []
    record_id_to_username_map = {}
    username_to_record_id_map = {}
    try:
        log.info("Fetching all citizens from Airtable...")
        
        all_citizen_records = tables['citizens'].all(
            fields=["Username", "FirstName", "LastName"] 
        )
        
        for record in all_citizen_records:
            citizens_list.append(record)
            username_val = record['fields'].get('Username')
            if username_val:
                record_id_to_username_map[record['id']] = username_val
                username_to_record_id_map[username_val] = record['id']
        
        log.info(f"Found {len(citizens_list)} citizens. Mapped {len(record_id_to_username_map)} record IDs and {len(username_to_record_id_map)} usernames.")
        return citizens_list, record_id_to_username_map, username_to_record_id_map
    except Exception as e:
        log.error(f"Error fetching citizens: {e}")
        return [], {}, {}

def get_recent_relevancies(username: str) -> List[Dict]:
    """Get recent relevancies for a citizen by calling the Next.js API."""
    try:
        log.info(f"Fetching recent relevancies for citizen: {username} via API")
        
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
            twenty_four_hours_ago_dt = datetime.now() - timedelta(hours=24)
            
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
                        log.warning(f"Could not parse createdAt date: {created_at_str} for relevancy {r_api.get('relevancyId')}")
                else:
                    # If no createdAt, include it by default or decide on a policy
                    recent_api_relevancies.append(r_api)


            log.info(f"Fetched {len(data['relevancies'])} relevancies from API, filtered to {len(recent_api_relevancies)} recent ones for {username}")
            return recent_api_relevancies
        else:
            log.error(f"API call to fetch relevancies for {username} was not successful or data format is wrong: {data.get('error', 'No error message')}")
            return []
            
    except requests.exceptions.RequestException as e_req:
        log.error(f"Request failed while fetching relevancies for {username} from API: {e_req}")
        return []
    except Exception as e:
        log.error(f"Error fetching or processing relevancies for {username} from API: {e}")
        return []

def get_existing_relationships(tables, username: str) -> Dict[str, Dict]:
    """Get existing relationships for a citizen, regardless of whether they are Citizen1 or Citizen2."""
    try:
        log.info(f"Fetching existing relationships for citizen: {username}")
        
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
        
        log.info(f"Found {len(relationship_map)} existing relationships involving {username}")
        return relationship_map
    except Exception as e:
        log.error(f"Error fetching relationships for {username}: {e}")
        return {}

def _calculate_trust_score_contributions_from_interactions(
    tables: Dict[str, Table],
    username1: str,
    username2: str
) -> tuple[float, set[str]]:
    """Calculate trust score contributions from various interactions between two citizens."""
    trust_score_addition = 0.0
    interaction_types = set()
    twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    now_utc = datetime.now(timezone.utc)

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
            trust_score_addition += len(recent_messages) * 1.0
            interaction_types.add("messages_interaction")
            log.debug(f"Found {len(recent_messages)} recent messages between {username1} and {username2}.")
    except Exception as e:
        log.error(f"Error fetching messages between {username1} and {username2}: {e}")

    # 2. Active Loans
    try:
        loan_formula = (
            f"AND({{Status}}='active',OR(AND({{Lender}}='{username1}',{{Borrower}}='{username2}'),"
            f"AND({{Lender}}='{username2}',{{Borrower}}='{username1}')))"
        )
        active_loans = tables['loans'].all(formula=loan_formula, fields=['PrincipalAmount'])
        for loan in active_loans:
            principal = safe_float(loan['fields'].get('PrincipalAmount'))
            trust_score_addition += principal / 100000.0
            interaction_types.add("loans_interaction")
            log.debug(f"Active loan found between {username1} and {username2} with principal {principal}.")
    except Exception as e:
        log.error(f"Error fetching loans between {username1} and {username2}: {e}")

    # 3. Active Contracts
    try:
        # We need to fetch and then filter EndAt client-side as IS_AFTER might be tricky with future dates in Airtable formulas
        contract_formula = (
            f"OR(AND({{Buyer}}='{username1}',{{Seller}}='{username2}'),"
            f"AND({{Buyer}}='{username2}',{{Seller}}='{username1}'))"
        )
        all_contracts_between_pair = tables['contracts'].all(
            formula=contract_formula,
            fields=['PricePerResource', 'HourlyAmount', 'EndAt'] # Removed 'Status'
        )
        active_future_contracts_count = 0
        for contract in all_contracts_between_pair:
            end_at_str = contract['fields'].get('EndAt')
            # Removed status check as the 'Status' field does not exist in the CONTRACTS table
            if end_at_str: 
                try:
                    end_at_dt = datetime.fromisoformat(end_at_str.replace('Z', '+00:00'))
                    if end_at_dt > now_utc:
                        price_per_resource = safe_float(contract['fields'].get('PricePerResource'))
                        hourly_amount = safe_float(contract['fields'].get('HourlyAmount'))
                        trust_score_addition += (price_per_resource * hourly_amount) / 100.0
                        active_future_contracts_count +=1
                except ValueError:
                    log.warning(f"Could not parse EndAt date: {end_at_str} for contract {contract['id']}")
        if active_future_contracts_count > 0:
            interaction_types.add("contracts_interaction")
            log.debug(f"Found {active_future_contracts_count} active future contracts between {username1} and {username2}.")
    except Exception as e:
        log.error(f"Error fetching contracts between {username1} and {username2}: {e}")

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
            trust_score_addition += price / 10000.0
            interaction_types.add("transactions_interaction")
            log.debug(f"Recent transaction found between {username1} and {username2} with price {price}.")
    except Exception as e:
        log.error(f"Error fetching transactions between {username1} and {username2}: {e}")
        
    log.info(f"Calculated trust score addition of {trust_score_addition} for {username1}-{username2} from types: {interaction_types}")
    return trust_score_addition, interaction_types

def update_relationship_scores(
    tables: Dict[str, Table],
    source_citizen_record: Dict,
    relevancies: List[Dict],
    existing_relationships: Dict[str, Dict],
    record_id_to_username_map: Dict[str, str]
) -> Dict[str, float]:
    """Update relationship strength and trust scores."""
    try:
        source_username = source_citizen_record['fields']['Username']
        log.info(f"Updating relationship scores for source citizen: {source_username}")
    
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
            
            for target_username in potential_target_usernames:
                # Skip if no valid target username or if target is the source citizen itself
                if not target_username or target_username == source_username:
                    continue
                
                # Add relevancy score and type to this target
                current_score, current_types = accumulated_data_for_targets.get(target_username, (0.0, set()))
                current_score += relevancy_score
                current_types.add(relevancy_type)
                accumulated_data_for_targets[target_username] = (current_score, current_types)
                
        # Now update or create relationships in Airtable
        updated_count = 0
        created_count = 0
    
        for target_username, (score_to_add, new_relevancy_types_set) in accumulated_data_for_targets.items():
            notes_string = ""
            if target_username in existing_relationships:
                # Update existing relationship
                record = existing_relationships[target_username]
                record_id = record['id']
                
                # === StrengthScore Calculation (from relevancies) ===
                existing_strength_score = float(record.get('StrengthScore', 0.0)) * 0.75
                updated_strength_score = existing_strength_score + score_to_add # score_to_add is from relevancies

                # === TrustScore Calculation (from interactions) ===
                existing_trust_score = float(record.get('TrustScore', 0.0)) * 0.75
                trust_additions, trust_interaction_types = _calculate_trust_score_contributions_from_interactions(
                    tables, source_username, target_username
                )
                updated_trust_score = existing_trust_score + trust_additions

                # === Notes Update ===
                existing_notes_str = record.get('notes', '')
                current_strength_source_types = set(new_relevancy_types_set) # new_relevancy_types_set is from current relevancy
                
                # Parse existing notes for previous source types
                # This simple parsing assumes "Sources: type1,type2"
                # A more robust parser might be needed if Notes format varies
                parsed_existing_types = set()
                if existing_notes_str and existing_notes_str.startswith("Sources: "):
                    try:
                        types_part = existing_notes_str.replace("Sources: ", "")
                        parsed_existing_types.update(t.strip() for t in types_part.split(','))
                    except Exception:
                        log.warning(f"Could not parse existing notes for {source_username}-{target_username}: {existing_notes_str}")
                
                # Combine all source types: old, new strength-related, new trust-related
                all_source_types = parsed_existing_types.union(current_strength_source_types).union(trust_interaction_types)
                if all_source_types:
                    notes_string = f"Sources: {', '.join(sorted(list(all_source_types)))}"
                
                tables['relationships'].update(record_id, {
                    'StrengthScore': updated_strength_score,
                    'TrustScore': updated_trust_score,
                    'LastInteraction': datetime.now(timezone.utc).isoformat(),
                    'Notes': notes_string
                })
                updated_count += 1
            else:
                # Create new relationship
                # StrengthScore comes from relevancy (score_to_add)
                new_strength_score = score_to_add

                # TrustScore is calculated from interactions (base is 0, so no decay needed for new record)
                trust_additions, trust_interaction_types = _calculate_trust_score_contributions_from_interactions(
                    tables, source_username, target_username
                )
                new_trust_score = trust_additions
                
                # Combine notes sources
                all_source_types = new_relevancy_types_set.union(trust_interaction_types)
                if all_source_types:
                    notes_string = f"Sources: {', '.join(sorted(list(all_source_types)))}"
                else:
                    notes_string = ""


                # Ensure Citizen1 and Citizen2 are stored alphabetically
                c1, c2 = tuple(sorted((source_username, target_username)))
                
                tables['relationships'].create({
                    'Citizen1': c1,
                    'Citizen2': c2,
                    'StrengthScore': new_strength_score,
                    'TrustScore': new_trust_score,
                    'LastInteraction': datetime.now(timezone.utc).isoformat(),
                    'Notes': notes_string
                })
                created_count += 1
            
        log.info(f"For source {source_username}: Updated {updated_count} and created {created_count} relationships.")
        # Return a dictionary of target_username to score_to_add for stats calculation
        return {target: data[0] for target, data in accumulated_data_for_targets.items()}
    except Exception as e:
        log.error(f"Error updating relationship scores for source {source_username}: {e}")
        return {}

def update_relationship_strength_scores():
    """Main function to update relationship strength scores."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get all citizens and the necessary maps
        all_citizen_records, record_id_to_username_map, username_to_record_id_map = get_all_citizens(tables)
        
        if not all_citizen_records:
            log.warning("No citizens found, nothing to do")
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
        for citizen_record in all_citizen_records:
            username = citizen_record['fields'].get('Username')
            if not username:
                log.warning(f"Skipping citizen record {citizen_record['id']} due to missing Username.")
                continue
            
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
                record_id_to_username_map
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
        
        create_admin_notification(tables['notifications'], notification_title, notification_message) # Pass notifications table
        
        log.info("Successfully updated relationship strength scores")
        return True
    except Exception as e:
        log.error(f"Error updating relationship strength scores: {e}")
        
        # Try to create an admin notification about the error
        try:
            # tables should already be initialized if we reached this point from the main try block
            if 'notifications' in tables:
                create_admin_notification(
                    tables['notifications'], # Pass notifications table
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
            log.error(f"Could not create error notification: {notify_e}")
        
        return False

if __name__ == "__main__":
    success = update_relationship_strength_scores()
    sys.exit(0 if success else 1)
