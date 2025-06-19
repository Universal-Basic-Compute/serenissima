"""
Reports Helper Module for La Serenissima.

This module provides functions to fetch and format RSS feeds for different categories
of news that can be used to generate reports in the game.
"""

import logging
import requests
import feedparser
import html
import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone
import pytz

# Set up logging
log = logging.getLogger(__name__)

# Constants for RSS feeds
RSS_FEEDS = {
    "international": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "economic": "https://feeds.bloomberg.com/markets/news.rss",
    "philosophy": "https://blog.apaonline.org/feed/",
    "humanities": "https://www.insidehighered.com/rss.xml"
}

# Maximum content length (characters)
MAX_CONTENT_LENGTH = 5000
# Maximum title length
MAX_TITLE_LENGTH = 200
# Maximum number of entries to return
MAX_ENTRIES = 10

def clean_html(html_content: str) -> str:
    """
    Remove HTML tags and decode HTML entities from content.
    
    Args:
        html_content: String containing HTML
        
    Returns:
        Cleaned text without HTML tags
    """
    # Remove HTML tags
    clean_text = re.sub(r'<[^>]+>', ' ', html_content)
    # Decode HTML entities
    clean_text = html.unescape(clean_text)
    # Remove extra whitespace
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    return clean_text

def truncate_text(text: str, max_length: int) -> str:
    """
    Truncate text to max_length and add ellipsis if needed.
    
    Args:
        text: Text to truncate
        max_length: Maximum length in characters
        
    Returns:
        Truncated text
    """
    if not text:
        return ""
    
    if len(text) <= max_length:
        return text
    
    # Try to truncate at a sentence boundary
    sentences = re.split(r'(?<=[.!?])\s+', text[:max_length])
    if len(sentences) > 1:
        return ' '.join(sentences[:-1]) + "..."
    
    # If no sentence boundary, truncate at word boundary
    return text[:max_length].rsplit(' ', 1)[0] + "..."

def fetch_rss_feed(category: str, max_entries: int = MAX_ENTRIES) -> List[Dict[str, Any]]:
    """
    Fetch and parse RSS feed for the specified category.
    
    Args:
        category: Category of news to fetch (international, economic, philosophy, humanities)
        max_entries: Maximum number of entries to return
        
    Returns:
        List of dictionaries containing parsed feed entries
    """
    if category not in RSS_FEEDS:
        log.error(f"Unknown category: {category}. Available categories: {', '.join(RSS_FEEDS.keys())}")
        return []
    
    feed_url = RSS_FEEDS[category]
    log.info(f"Fetching RSS feed for category '{category}' from {feed_url}")
    
    try:
        # Parse the feed
        feed = feedparser.parse(feed_url)
        
        if feed.bozo and hasattr(feed, 'bozo_exception'):
            log.warning(f"Feed parsing warning: {feed.bozo_exception}")
        
        # Check if feed has entries
        if not hasattr(feed, 'entries') or not feed.entries:
            log.warning(f"No entries found in feed for category '{category}'")
            return []
        
        # Process entries
        processed_entries = []
        for entry in feed.entries[:max_entries]:
            # Extract and clean content
            content = ""
            if hasattr(entry, 'content') and entry.content:
                content = entry.content[0].value
            elif hasattr(entry, 'summary'):
                content = entry.summary
            elif hasattr(entry, 'description'):
                content = entry.description
            
            # Clean and truncate content
            content = clean_html(content)
            content = truncate_text(content, MAX_CONTENT_LENGTH)
            
            # Extract and clean title
            title = entry.title if hasattr(entry, 'title') else "No Title"
            title = clean_html(title)
            title = truncate_text(title, MAX_TITLE_LENGTH)
            
            # Extract publication date
            published = None
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                try:
                    published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                except Exception as e:
                    log.warning(f"Error parsing date: {e}")
            
            # Extract link
            link = entry.link if hasattr(entry, 'link') else ""
            
            processed_entries.append({
                'title': title,
                'content': content,
                'link': link,
                'published': published,
                'category': category
            })
        
        log.info(f"Successfully processed {len(processed_entries)} entries for category '{category}'")
        return processed_entries
    
    except Exception as e:
        log.error(f"Error fetching RSS feed for category '{category}': {e}")
        return []

def format_entries_markdown(entries: List[Dict[str, Any]]) -> str:
    """
    Format feed entries as Markdown.
    
    Args:
        entries: List of feed entry dictionaries
        
    Returns:
        Markdown formatted string
    """
    if not entries:
        return "No news entries available."
    
    markdown = f"# {entries[0]['category'].capitalize()} News\n\n"
    
    for entry in entries:
        # Add title as heading
        markdown += f"## {entry['title']}\n\n"
        
        # Add publication date if available
        if entry['published']:
            markdown += f"*Published: {entry['published'].strftime('%Y-%m-%d %H:%M UTC')}*\n\n"
        
        # Add content
        markdown += f"{entry['content']}\n\n"
        
        # Add source link
        markdown += f"[Read more]({entry['link']})\n\n"
        
        # Add separator
        markdown += "---\n\n"
    
    return markdown

def get_news_markdown(category: str, max_entries: int = 5) -> str:
    """
    Fetch and format news in markdown for the specified category.
    
    Args:
        category: Category of news to fetch (international, economic, philosophy, humanities)
        max_entries: Maximum number of entries to return
        
    Returns:
        Markdown formatted string with news entries
    """
    entries = fetch_rss_feed(category, max_entries)
    return format_entries_markdown(entries)

def get_random_news_entry(category: str) -> Optional[Dict[str, Any]]:
    """
    Fetch and return a random news entry from the specified category.
    
    Args:
        category: Category of news to fetch (international, economic, philosophy, humanities)
        
    Returns:
        Dictionary containing a single random news entry or None if no entries available
    """
    import random
    
    entries = fetch_rss_feed(category)
    if not entries:
        return None
    
    return random.choice(entries)

if __name__ == "__main__":
    # Configure logging for standalone execution
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Example usage
    for category in RSS_FEEDS.keys():
        print(f"\n\nTesting category: {category}")
        markdown = get_news_markdown(category, 2)
        print(markdown[:500] + "..." if len(markdown) > 500 else markdown)
