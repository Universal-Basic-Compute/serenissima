#!/usr/bin/env python3
"""
Emergency direct feeding for CRITICAL starvation cases
This updates AteAt directly for citizens who have been without food for >24 hours
"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pyairtable import Api

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Airtable setup
api = Api(os.environ.get('AIRTABLE_API_KEY'))
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID')
citizens_table = api.table(AIRTABLE_BASE_ID, 'CITIZENS')

def emergency_feed_critical():
    """Directly update AteAt for citizens in critical starvation."""
    print("🚨 EMERGENCY DIRECT FEEDING FOR CRITICAL CASES")
    print("=" * 60)
    
    all_citizens = citizens_table.all()
    now = datetime.utcnow()
    current_time = now.isoformat() + 'Z'
    
    critical_fed = 0
    
    for citizen in all_citizens:
        fields = citizen['fields']
        username = fields.get('Username', 'Unknown')
        ate_at = fields.get('AteAt')
        
        hours_since = 999
        
        if ate_at:
            try:
                last_meal = datetime.fromisoformat(ate_at.replace('Z', ''))
                hours_since = (now - last_meal).total_seconds() / 3600
            except Exception:
                pass
        
        # Critical threshold: >24 hours without food
        if hours_since > 24:
            print(f"\n🆘 CRITICAL: {username} - {hours_since:.1f}h without food")
            print(f"   Administering emergency feeding...")
            
            try:
                # Update AteAt to current time
                citizens_table.update(citizen['id'], {'AteAt': current_time})
                print(f"   ✅ Fed successfully at {current_time}")
                critical_fed += 1
            except Exception as e:
                print(f"   ❌ Failed to feed: {e}")
    
    print(f"\n{'=' * 60}")
    print(f"📊 Emergency feeding complete:")
    print(f"   Critical citizens fed: {critical_fed}")
    print(f"\n💡 Note: This was a direct database intervention.")
    print(f"   The emergency food packages will still be consumed")
    print(f"   when activities process in the next cycle.")

if __name__ == "__main__":
    emergency_feed_critical()