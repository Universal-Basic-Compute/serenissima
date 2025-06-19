#!/usr/bin/env python3
"""
Create Reports script for La Serenissima.

This script:
1. Fetches RSS feeds for different categories using the reports_helper module
2. Calls Claude API to translate modern news into Renaissance-style reports
3. Creates REPORTS records in Airtable with the translated content
4. Includes information about affected resources, price changes, and availability changes

Run this script daily to generate new reports arriving in Venice.
"""

import os
import sys
import json
import logging
import argparse
import requests
import random
from datetime import datetime, timedelta, timezone
import pytz
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv
from pyairtable import Api, Table

# Add the project root to sys.path to allow imports from backend modules
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import the reports_helper module
from backend.engine.utils.reports_helper import fetch_rss_feed, clean_html, truncate_text
from backend.engine.utils.activity_helpers import LogColors, log_header

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("create_reports")

# Load environment variables
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

# Constants
CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-3-7-sonnet-latest"
MAX_REPORTS_TO_FETCH = 20  # Number of recent reports to include in context
VENICE_TIMEZONE = pytz.timezone('Europe/Rome')  # Venice timezone

def initialize_airtable() -> Dict[str, Table]:
    """Initialize Airtable connection."""
    api_key = os.environ.get('AIRTABLE_API_KEY')
    base_id = os.environ.get('AIRTABLE_BASE_ID')
    
    if not api_key or not base_id:
        log.error(f"{LogColors.FAIL}Missing Airtable credentials. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables.{LogColors.ENDC}")
        sys.exit(1)
    
    try:
        api = Api(api_key)
        tables = {
            'reports': api.table(base_id, 'REPORTS'),
            'resources': api.table(base_id, 'RESOURCES')
        }
        log.info(f"{LogColors.OKGREEN}Airtable connection successful.{LogColors.ENDC}")
        return tables
    except Exception as e:
        log.error(f"{LogColors.FAIL}Failed to initialize Airtable: {e}{LogColors.ENDC}")
        sys.exit(1)

def get_resource_types() -> List[str]:
    """Get resource names from the API."""
    try:
        api_base_url = os.getenv("API_BASE_URL", "https://serenissima.ai")
        url = f"{api_base_url}/api/resource-types"
        
        log.info(f"Fetching resource types from API: {url}")
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        if data.get("success") and "resourceTypes" in data:
            resource_types = data["resourceTypes"]
            resource_names = [resource.get("name", "") for resource in resource_types if resource.get("name")]
            log.info(f"Successfully fetched {len(resource_names)} resource names from API")
            return resource_names
        else:
            log.error(f"Unexpected API response format: {data}")
            return []
    except Exception as e:
        log.error(f"Error fetching resource types from API: {e}")
        return []

def get_recent_reports(tables: Dict[str, Table], max_reports: int = MAX_REPORTS_TO_FETCH) -> List[Dict[str, Any]]:
    """Get recent reports from Airtable."""
    try:
        reports = tables['reports'].all(
            sort=[{"field": "CreatedAt", "direction": "desc"}],
            max_records=max_reports
        )
        
        # Ensure all fields are properly formatted for JSON serialization
        sanitized_reports = []
        for report in reports:
            # Create a sanitized copy of each report
            sanitized_report = {
                'id': report.get('id', ''),
                'fields': {}
            }
            
            # Copy fields, ensuring all values are of serializable types
            for key, value in report.get('fields', {}).items():
                # Convert any non-serializable values to strings
                if isinstance(value, (str, int, float, bool, type(None))):
                    sanitized_report['fields'][key] = value
                elif isinstance(value, (list, dict)):
                    # Try to ensure nested structures are serializable
                    try:
                        json.dumps(value)  # Test if serializable
                        sanitized_report['fields'][key] = value
                    except (TypeError, OverflowError):
                        sanitized_report['fields'][key] = str(value)
                else:
                    sanitized_report['fields'][key] = str(value)
            
            sanitized_reports.append(sanitized_report)
        
        log.info(f"Fetched and sanitized {len(sanitized_reports)} recent reports from Airtable")
        return sanitized_reports
    except Exception as e:
        log.error(f"Error fetching recent reports: {e}")
        return []

def call_claude_api(news_entries: List[Dict[str, Any]], recent_reports: List[Dict[str, Any]], resource_names: List[str], category: str) -> Optional[Dict[str, Any]]:
    """
    Call Claude API to translate a news entry into Renaissance style and generate report data.
    
    Args:
        news_entries: List of news entries from RSS feed
        recent_reports: List of recent reports from Airtable
        resource_names: List of resource names in the game
        category: Category of news (international, economic, philosophy, humanities)
        
    Returns:
        Dictionary with translated report data or None if API call fails
    """
    claude_api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not claude_api_key:
        log.error("ANTHROPIC_API_KEY environment variable is not set")
        return None
    
    # Prepare recent reports for context
    recent_reports_context = []
    for report in recent_reports:
        fields = report.get('fields', {})
        recent_reports_context.append({
            "title": fields.get('Title', 'No Title'),
            "content": fields.get('Content', 'No Content'),
            "originCity": fields.get('OriginCity', 'Unknown'),
            "affectedResources": fields.get('AffectedResources', '[]'),
            "createdAt": fields.get('CreatedAt', '')
        })
    
    # Prepare system prompt with news entries, recent reports, and resource names
    system_prompt = f"""You are a Renaissance-era Venetian scribe who translates news from around the world into reports for the Venetian Republic in 1525.

AVAILABLE RESOURCES IN VENICE (ONLY use resources from the list):
{', '.join(resource_names)}

RECENT REPORTS ALREADY RECEIVED IN VENICE (DO NOT DUPLICATE THESE unless evolution):
{json.dumps(recent_reports_context, indent=2)}

NEWS ENTRIES FROM {category.upper()} SOURCES:
{json.dumps([{
    "title": entry.get('title', 'No Title'),
    "content": entry.get('content', 'No Content'),
    "link": entry.get('link', ''),
    "published": entry.get('published').isoformat() if entry.get('published') else None
} for entry in news_entries], indent=2)}
"""

    # Prepare user prompt
    user_prompt = f"""Select ONE news entry from the {category} sources that:
1. Has NOT already been covered in the recent reports
2. Would be most relevant and interesting to Renaissance Venice
3. Could plausibly affect trade, resources, or politics in Venice

You can think through your selection process and reasoning first, then translate this news into a Renaissance-style report as if it were arriving in Venice via merchant ship, diplomatic courier, or traveler.

After your thinking, provide a valid JSON object with these fields:
- OriginalTitle: The original title of the selected news article
- OriginalContent: A shortened version of the original content (max 2000 characters)
- OriginCity: A historically accurate city where this news might originate from
- Title: A Renaissance-style title for the report
- Content: The Renaissance-style report (1-2 paragraphs)
- HistoricalNotes: Brief notes on how this connects to Renaissance history, Venice, or parallels

- AffectedResources: Array of 1-3 resources from the provided list that would be affected
- PriceChanges: Array of objects with {{resource: string, change: number}} where change is between -0.5 and 0.5 representing price multiplier changes
- AvailabilityChanges: Array of objects with {{resource: string, change: number}} where change is between -0.5 and 0.5 representing availability multiplier changes

Example format:
{{
  "OriginalTitle": "Turkish Navy Increases Patrols in Eastern Mediterranean",
  "OriginalContent": "The shortened original content of the news article...",
  "OriginCity": "Constantinople",
  "Title": "Ottoman Fleet Movements Disrupt Spice Routes",
  "Content": "Word arrives from Constantinople that the Ottoman fleet has...",
  "HistoricalNotes": "During the Renaissance, Ottoman naval activity often affected...",
  "AffectedResources": ["silk_fabric", "prepared_silk"],
  "PriceChanges": [
    {{ "resource": "silk_fabric", "change": 0.2 }},
    {{ "resource": "prepared_silk", "change": 0.3 }}
  ],
  "AvailabilityChanges": [
    {{ "resource": "silk_fabric", "change": -0.15 }},
    {{ "resource": "prepared_silk", "change": -0.2 }}
  ]
}}
"""

    try:
        response = requests.post(
            CLAUDE_API_URL,
            headers={
                "Content-Type": "application/json",
                "x-api-key": claude_api_key,
                "anthropic-version": "2023-06-01"
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 4000,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": user_prompt}
                ]
            },
            timeout=90
        )
        
        response.raise_for_status()
        result = response.json()
        
        if "content" in result and len(result["content"]) > 0 and "text" in result["content"][0]:
            response_text = result["content"][0]["text"]
            
            # Extract JSON from response
            try:
                # First, try to extract JSON from the response using regex to find from first { to last }
                import re
                first_brace_index = response_text.find('{')
                last_brace_index = response_text.rfind('}')
                
                if first_brace_index != -1 and last_brace_index != -1 and first_brace_index < last_brace_index:
                    json_str = response_text[first_brace_index:last_brace_index+1]
                    try:
                        report_data = json.loads(json_str)
                        log.info("Successfully extracted and parsed JSON from Claude response")
                        return report_data
                    except json.JSONDecodeError as e:
                        log.warning(f"Failed to parse extracted JSON from first-to-last brace: {e}")
                        # Fall back to regex pattern matching
                        json_match = re.search(r'({[\s\S]*})', response_text)
                        if json_match:
                            try:
                                report_data = json.loads(json_match.group(1))
                                log.info("Successfully extracted and parsed JSON using regex pattern")
                                return report_data
                            except json.JSONDecodeError as e:
                                log.error(f"Failed to parse extracted JSON from regex: {e}")
                                log.error(f"Extracted text: {json_match.group(1)}")
                                return None
                        else:
                            log.error("Could not find JSON object in Claude response")
                            log.error(f"Full response: {response_text}")
                            return None
                else:
                    # If no braces found, try to parse the entire response as JSON (unlikely)
                    try:
                        report_data = json.loads(response_text)
                        log.info("Successfully parsed entire Claude response as JSON")
                        return report_data
                    except json.JSONDecodeError:
                        log.error("Could not find JSON object in Claude response")
                        log.error(f"Full response: {response_text}")
                        return None
            except Exception as e:
                log.error(f"Error processing Claude response: {e}")
                log.error(f"Full response: {response_text}")
                return None
        else:
            log.error("Unexpected Claude API response format")
            log.error(f"Response: {result}")
            return None
    
    except Exception as e:
        log.error(f"Error calling Claude API: {e}")
        return None

def create_report(tables: Dict[str, Table], report_data: Dict[str, Any], category: str) -> Optional[Dict[str, Any]]:
    """
    Create a report in Airtable.
    
    Args:
        tables: Dictionary of Airtable tables
        report_data: Report data from Claude API
        category: Category of news
        
    Returns:
        Created report record or None if creation fails
    """
    try:
        # Generate a unique report ID
        report_id = f"report-{category}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Convert arrays to JSON strings for Airtable
        affected_resources = json.dumps(report_data.get('AffectedResources', []))
        price_changes = json.dumps(report_data.get('PriceChanges', []))
        availability_changes = json.dumps(report_data.get('AvailabilityChanges', []))
        
        # Set end date (reports are valid for 4 days)
        now = datetime.now(timezone.utc)
        end_at = (now + timedelta(days=4)).isoformat()
        
        # Truncate OriginalContent if it's too long
        original_content = report_data.get('OriginalContent', '')
        if len(original_content) > 2000:
            original_content = original_content[:1997] + "..."
        
        # Create report record
        report_record = {
            "ReportId": report_id,
            "Category": category,
            "OriginCity": report_data.get('OriginCity', 'Unknown'),
            "Title": report_data.get('Title', 'No Title'),
            "Content": report_data.get('Content', 'No Content'),
            "HistoricalNotes": report_data.get('HistoricalNotes', ''),
            "OriginalTitle": report_data.get('OriginalTitle', ''),
            "OriginalContent": original_content,
            "AffectedResources": affected_resources,
            "PriceChanges": price_changes,
            "AvailabilityChanges": availability_changes,
            "EndAt": end_at,
            "Notes": f"Generated from {category} news feed"
        }
        
        created_report = tables['reports'].create(report_record)
        log.info(f"{LogColors.OKGREEN}Created report: {report_id} - {report_data.get('Title')}{LogColors.ENDC}")
        return created_report
    
    except Exception as e:
        log.error(f"Error creating report: {e}")
        return None

def process_category(tables: Dict[str, Table], category: str, resource_names: List[str], dry_run: bool = False) -> bool:
    """
    Process a category of news and create a report.
    
    Args:
        tables: Dictionary of Airtable tables
        category: Category of news to process
        resource_names: List of resource names in the game
        dry_run: If True, don't create report in Airtable
        
    Returns:
        True if successful, False otherwise
    """
    log.info(f"{LogColors.HEADER}Processing {category} news...{LogColors.ENDC}")
    
    # Fetch RSS feed for category
    news_entries = fetch_rss_feed(category)
    if not news_entries:
        log.warning(f"No news entries found for category: {category}")
        return False
    
    log.info(f"Fetched {len(news_entries)} news entries for category: {category}")
    
    # Get recent reports for context
    recent_reports = get_recent_reports(tables)
    
    # Call Claude API to translate news
    report_data = call_claude_api(news_entries, recent_reports, resource_names, category)
    if not report_data:
        log.error(f"Failed to generate report data for category: {category}")
        return False
    
    # Print report data for dry run
    if dry_run:
        log.info(f"{LogColors.OKBLUE}[DRY RUN] Would create report:{LogColors.ENDC}")
        log.info(f"Title: {report_data.get('Title')}")
        log.info(f"Origin: {report_data.get('OriginCity')}")
        log.info(f"Content: {report_data.get('Content')[:1000]}...")
        log.info(f"Affected Resources: {report_data.get('AffectedResources')}")
        log.info(f"Price Changes: {report_data.get('PriceChanges')}")
        log.info(f"Availability Changes: {report_data.get('AvailabilityChanges')}")
        return True
    
    # Create report in Airtable
    created_report = create_report(tables, report_data, category)
    return created_report is not None

def main():
    """Main function to create reports."""
    parser = argparse.ArgumentParser(description="Create Renaissance-style reports from modern news feeds")
    parser.add_argument("--category", choices=["international", "economic", "philosophy", "humanities", "all"], 
                        default="all", help="Category of news to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't create reports in Airtable")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    log_header("Renaissance Reports Generator", LogColors.HEADER)
    
    # Initialize Airtable
    tables = initialize_airtable()
    
    # Get resource names
    resource_names = get_resource_types()
    if not resource_names:
        log.warning("No resource names fetched. Using empty list.")
        resource_names = []
    
    # Process categories
    categories = ["international", "economic", "philosophy", "humanities"] if args.category == "all" else [args.category]
    
    success_count = 0
    for category in categories:
        if process_category(tables, category, resource_names, args.dry_run):
            success_count += 1
    
    log.info(f"{LogColors.OKGREEN}Successfully processed {success_count}/{len(categories)} categories.{LogColors.ENDC}")

if __name__ == "__main__":
    main()
