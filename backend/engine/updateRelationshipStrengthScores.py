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

def get_ai_citizens(tables) -> List[Dict]:
    """Get all AI citizens from Airtable."""
    try:
        log.info("Fetching AI citizens from Airtable...")
        
        # Get all citizens marked as AI
        ai_citizens = tables['citizens'].all(
            formula="{IsAI} = TRUE()",
            fields=["Username", "FirstName", "LastName"]
        )
        
        log.info(f"Found {len(ai_citizens)} AI citizens")
        return ai_citizens
    except Exception as e:
        log.error(f"Error fetching AI citizens: {e}")
        return []

def get_recent_relevancies(tables, ai_username: str) -> List[Dict]:
    """Get recent relevancies for an AI citizen."""
    try:
        log.info(f"Fetching recent relevancies for AI citizen: {ai_username}")
        
        # Calculate timestamp for 24 hours ago
        twenty_four_hours_ago = (datetime.now() - timedelta(hours=24)).isoformat()
        
        # Fetch relevancies created in the last 24 hours for this AI
        formula = f"AND({{RelevantToCitizen}} = '{ai_username}', IS_AFTER({{CreatedAt}}, '{twenty_four_hours_ago}'))"
        
        relevancies = tables['relevancies'].all(
            formula=formula,
            fields=["RelevancyId", "AssetID", "AssetType", "TargetCitizen", "Score", "CreatedAt"],
            sort=[{"field": "CreatedAt", "direction": "desc"}],
            max_records=1000  # Limit to last 1000 relevancies
        )
        
        log.info(f"Found {len(relevancies)} recent relevancies for {ai_username}")
        return relevancies
    except Exception as e:
        log.error(f"Error fetching relevancies for {ai_username}: {e}")
        return []

def get_existing_relationships(tables, ai_username: str) -> Dict[str, Dict]:
    """Get existing relationships for an AI citizen."""
    try:
        log.info(f"Fetching existing relationships for AI citizen: {ai_username}")
        
        # Fetch relationships where this AI is the source
        formula = f"{{AICitizen}} = '{ai_username}'"
        
        relationships = tables['relationships'].all(
            formula=formula,
            fields=["AICitizen", "TargetCitizen", "StrengthScore", "LastUpdated"]
        )
        
        # Create a dictionary mapping target citizens to their relationship records
        relationship_map = {}
        for record in relationships:
            target_citizen = record['fields'].get('TargetCitizen')
            if target_citizen:
                relationship_map[target_citizen] = {
                    'id': record['id'],
                    'strengthScore': record['fields'].get('StrengthScore', 0),
                    'lastUpdated': record['fields'].get('LastUpdated')
                }
        
        log.info(f"Found {len(relationship_map)} existing relationships for {ai_username}")
        return relationship_map
    except Exception as e:
        log.error(f"Error fetching relationships for {ai_username}: {e}")
        return {}

def update_relationship_scores(tables, ai_citizen: Dict, relevancies: List[Dict], existing_relationships: Dict[str, Dict]) -> Dict[str, float]:
    """Update relationship strength scores based on relevancies."""
    try:
        ai_username = ai_citizen['fields']['Username']
        log.info(f"Updating relationship scores for {ai_username}")
        
        # Track new scores for each target citizen
        new_scores = {}
        
        # Process each relevancy
        for relevancy in relevancies:
            target_citizen = relevancy['fields'].get('TargetCitizen')
            
            # Skip if no target citizen or if target is the AI itself
            if not target_citizen or target_citizen == ai_username:
                continue
            
            # Get the relevancy score
            relevancy_score = float(relevancy['fields'].get('Score', 0))
            
            # Add to the new score for this target
            if target_citizen in new_scores:
                new_scores[target_citizen] += relevancy_score
            else:
                new_scores[target_citizen] = relevancy_score
        
        # Now update or create relationships in Airtable
        updated_count = 0
        created_count = 0
        
        for target_citizen, score in new_scores.items():
            # Check if relationship already exists
            if target_citizen in existing_relationships:
                # Get existing record
                record = existing_relationships[target_citizen]
                record_id = record['id']
                
                # Apply 25% decay to existing score
                existing_score = float(record['strengthScore']) * 0.75
                
                # Add new score
                updated_score = existing_score + score
                
                # Update the record
                tables['relationships'].update(record_id, {
                    'StrengthScore': updated_score,
                    'LastUpdated': datetime.now().isoformat()
                })
                
                updated_count += 1
            else:
                # Create new relationship
                tables['relationships'].create({
                    'AICitizen': ai_username,
                    'TargetCitizen': target_citizen,
                    'StrengthScore': score,
                    'LastUpdated': datetime.now().isoformat()
                })
                
                created_count += 1
        
        log.info(f"Updated {updated_count} and created {created_count} relationships for {ai_username}")
        return new_scores
    except Exception as e:
        log.error(f"Error updating relationship scores for {ai_username}: {e}")
        return {}

def update_relationship_strength_scores():
    """Main function to update relationship strength scores."""
    try:
        # Initialize Airtable
        tables = initialize_airtable()
        
        # Get all AI citizens
        ai_citizens = get_ai_citizens(tables)
        
        if not ai_citizens:
            log.warning("No AI citizens found, nothing to do")
            return
        
        # Track statistics for notification
        stats = {
            'total_ai_citizens': len(ai_citizens),
            'total_relevancies_processed': 0,
            'total_relationships_updated': 0,
            'total_relationships_created': 0,
            'ai_details': {}
        }
        
        # Process each AI citizen
        for ai_citizen in ai_citizens:
            ai_username = ai_citizen['fields']['Username']
            
            # Get recent relevancies for this AI
            relevancies = get_recent_relevancies(tables, ai_username)
            stats['total_relevancies_processed'] += len(relevancies)
            
            # Get existing relationships for this AI
            existing_relationships = get_existing_relationships(tables, ai_username)
            
            # Update relationship scores
            new_scores = update_relationship_scores(tables, ai_citizen, relevancies, existing_relationships)
            
            # Update statistics
            stats['ai_details'][ai_username] = {
                'relevancies_processed': len(relevancies),
                'relationships_updated': len(set(existing_relationships.keys()) & set(new_scores.keys())),
                'relationships_created': len(set(new_scores.keys()) - set(existing_relationships.keys()))
            }
            
            stats['total_relationships_updated'] += stats['ai_details'][ai_username]['relationships_updated']
            stats['total_relationships_created'] += stats['ai_details'][ai_username]['relationships_created']
            
            # Add a small delay to avoid rate limiting
            time.sleep(0.5)
        
        # Create admin notification with summary
        notification_title = "Relationship Strength Scores Updated"
        notification_message = (
            f"Updated relationship strength scores for {stats['total_ai_citizens']} AI citizens.\n"
            f"Processed {stats['total_relevancies_processed']} relevancies.\n"
            f"Updated {stats['total_relationships_updated']} existing relationships.\n"
            f"Created {stats['total_relationships_created']} new relationships.\n\n"
            "Details by AI citizen:\n"
        )
        
        for ai_username, details in stats['ai_details'].items():
            notification_message += (
                f"- {ai_username}: Processed {details['relevancies_processed']} relevancies, "
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
