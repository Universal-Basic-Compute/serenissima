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
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pyairtable import Api, Table
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("update_relationship_strength_scores")

# Load environment variables
load_dotenv()

def initialize_airtable():
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error("Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.")
        sys.exit(1)
    
    try:
        # Return a dictionary of table objects using pyairtable
        return {
            'citizens': Table(api_key, base_id, 'CITIZENS'),
            'relevancies': Table(api_key, base_id, 'RELEVANCIES'),
            'relationships': Table(api_key, base_id, 'RELATIONSHIPS')
        }
    except Exception as e:
        log.error(f"Failed to initialize Airtable: {e}")
        sys.exit(1)

def create_admin_notification(tables, title: str, message: str) -> bool:
    """Create an admin notification in Airtable."""
    try:
        notifications_table = Table(
            tables['citizens'].api_key, 
            tables['citizens'].base_id, 
            'NOTIFICATIONS'
        )
        
        notifications_table.create({
            'Content': title,
            'Details': message,
            'Type': 'admin',
            'Status': 'unread',
            'CreatedAt': datetime.now().isoformat()
        })
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

def get_recent_relevancies(tables, username: str, username_record_id: Optional[str]) -> List[Dict]:
    """Get recent relevancies for a citizen, filtering in Python for robustness."""
    try:
        log.info(f"Fetching recent relevancies for citizen: {username} (Record ID: {username_record_id})")
        
        twenty_four_hours_ago = (datetime.now() - timedelta(hours=24)).isoformat()
        
        # Simplified formula: fetch all relevancies created recently, not for 'all'
        formula = f"AND(IS_AFTER({{CreatedAt}}, '{twenty_four_hours_ago}'), NOT({{RelevantToCitizen}} = 'all'))"
        
        all_recent_relevancies = tables['relevancies'].all(
            formula=formula,
            fields=["RelevancyId", "AssetID", "AssetType", "TargetCitizen", "Score", "CreatedAt", "RelevantToCitizen", "Type"],
            sort=[{"field": "CreatedAt", "direction": "desc"}],
            max_records=2000 # Increased limit as we filter in Python
        )
        
        filtered_relevancies = []
        for r in all_recent_relevancies:
            rt_citizen_val = r['fields'].get('RelevantToCitizen')
            
            # Case 1: RelevantToCitizen is a string (single username or JSON array of usernames)
            if isinstance(rt_citizen_val, str):
                if rt_citizen_val == username: # Direct match
                    filtered_relevancies.append(r)
                    continue
                # Check if it's a JSON array string containing the username
                # Ensure to look for the username quoted, e.g., "username"
                if rt_citizen_val.startswith('[') and rt_citizen_val.endswith(']') and f'"{username}"' in rt_citizen_val:
                    filtered_relevancies.append(r)
                    continue
            
            # Case 2: RelevantToCitizen is a list (assumed to be Airtable record IDs from a linked field)
            elif isinstance(rt_citizen_val, list) and username_record_id:
                if username_record_id in rt_citizen_val:
                    filtered_relevancies.append(r)
                    continue
        
        log.info(f"Found {len(all_recent_relevancies)} recent relevancies, filtered to {len(filtered_relevancies)} for {username}")
        return filtered_relevancies
    except Exception as e:
        log.error(f"Error fetching relevancies for {username}: {e}")
        return []

def get_existing_relationships(tables, username: str) -> Dict[str, Dict]:
    """Get existing relationships for a citizen (where username is Citizen1)."""
    try:
        log.info(f"Fetching existing relationships for citizen: {username}")
        
        # Fetch relationships where this citizen is Citizen1
        formula = f"{{Citizen1}} = '{username}'"
        
        relationships = tables['relationships'].all(
            formula=formula,
            fields=["Citizen1", "Citizen2", "StrengthScore", "LastInteraction", "Notes"] 
        )
        
        # Create a dictionary mapping target citizens (Citizen2) to their relationship records
        relationship_map = {}
        for record in relationships:
            citizen2 = record['fields'].get('Citizen2')
            if citizen2:
                relationship_map[citizen2] = {
                    'id': record['id'],
                    'StrengthScore': record['fields'].get('StrengthScore', 0), 
                    'LastInteraction': record['fields'].get('LastInteraction'),
                    'notes': record['fields'].get('Notes', '') 
                }
        
        log.info(f"Found {len(relationship_map)} existing relationships for {username} (as Citizen1)")
        return relationship_map
    except Exception as e:
        log.error(f"Error fetching relationships for {username}: {e}")
        return {}

def update_relationship_scores(
    tables, 
    source_citizen_record: Dict, 
    relevancies: List[Dict], 
    existing_relationships: Dict[str, Dict],
    record_id_to_username_map: Dict[str, str]
) -> Dict[str, float]:
    """Update relationship strength scores based on relevancies."""
    try:
        source_username = source_citizen_record['fields']['Username']
        log.info(f"Updating relationship scores for source citizen: {source_username}")
    
        # Track new scores and relevancy types for each target citizen
        # The value will be a tuple: (accumulated_score, set_of_relevancy_types)
        accumulated_data_for_targets: Dict[str, tuple[float, set[str]]] = {}
    
        # Process each relevancy
        for relevancy in relevancies:
            raw_target_value = relevancy['fields'].get('TargetCitizen')
            relevancy_score = float(relevancy['fields'].get('Score', 0))
            relevancy_type = relevancy['fields'].get('Type', 'unknown_type')
        
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
                
                # Apply 25% decay to existing score
                existing_score = float(record.get('StrengthScore', 0.0)) * 0.75 
                updated_score = existing_score + score_to_add

                # Handle Notes: append new types to existing notes if any, avoiding duplicates
                existing_notes = record.get('notes', '') 
                existing_types_set = set()
                if existing_notes and existing_notes.startswith("Sources: "):
                    try:
                        existing_types_str = existing_notes.replace("Sources: ", "")
                        existing_types_set.update(t.strip() for t in existing_types_str.split(','))
                    except Exception: 
                        log.warning(f"Could not parse existing notes for {source_username}-{target_username}: {existing_notes}")

                combined_types = existing_types_set.union(new_relevancy_types_set)
                if combined_types:
                    notes_string = f"Sources: {', '.join(sorted(list(combined_types)))}"
                
                tables['relationships'].update(record_id, {
                    'StrengthScore': updated_score, 
                    'LastInteraction': datetime.now().isoformat(), 
                    'Notes': notes_string
                })
                updated_count += 1
            else:
                # Create new relationship
                if new_relevancy_types_set:
                    notes_string = f"Sources: {', '.join(sorted(list(new_relevancy_types_set)))}"

                tables['relationships'].create({
                    'Citizen1': source_username,
                    'Citizen2': target_username,
                    'StrengthScore': score_to_add, 
                    'LastInteraction': datetime.now().isoformat(), 
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
            username_record_id = username_to_record_id_map.get(username)
            
            # Get recent relevancies for this citizen
            relevancies = get_recent_relevancies(tables, username, username_record_id)
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
            f"Updated relationship strength scores for {stats['total_citizens']} citizens.\n"
            f"Processed {stats['total_relevancies_processed']} relevancies.\n"
            f"Updated {stats['total_relationships_updated']} existing relationships.\n"
            f"Created {stats['total_relationships_created']} new relationships.\n\n"
            "Details by citizen:\n"
        )
        
        for username, details in stats['citizen_details'].items():
            notification_message += (
                f"- {username}: Processed {details['relevancies_processed']} relevancies, "
                f"updated {details['relationships_updated']} relationships, "
                f"created {details['relationships_created']} new relationships.\n"
            )
        
        create_admin_notification(tables, notification_title, notification_message)
        
        log.info("Successfully updated relationship strength scores")
        return True
    except Exception as e:
        log.error(f"Error updating relationship strength scores: {e}")
        
        # Try to create an admin notification about the error
        try:
            tables = initialize_airtable()
            create_admin_notification(
                tables,
                "Relationship Strength Score Update Error",
                f"An error occurred while updating relationship strength scores: {str(e)}"
            )
        except:
            log.error("Could not create error notification")
        
        return False

if __name__ == "__main__":
    success = update_relationship_strength_scores()
    sys.exit(0 if success else 1)
