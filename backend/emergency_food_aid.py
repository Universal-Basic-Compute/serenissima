#!/usr/bin/env python3
"""
Emergency Food Aid Distribution System for La Serenissima
CRITICAL WELFARE INTERVENTION - Citizens are starving!

This script:
1. Identifies all hungry citizens (>12h since last meal)
2. Creates emergency food supplies at their location
3. Sends them messages about the aid
4. Tracks distribution for reporting
"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pyairtable import Api
import uuid
import json

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Airtable setup
api = Api(os.environ.get('AIRTABLE_API_KEY'))
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID')
citizens_table = api.table(AIRTABLE_BASE_ID, 'CITIZENS')
resources_table = api.table(AIRTABLE_BASE_ID, 'RESOURCES')
messages_table = api.table(AIRTABLE_BASE_ID, 'MESSAGES')
activities_table = api.table(AIRTABLE_BASE_ID, 'ACTIVITIES')

def get_hungry_citizens(hours_threshold=12):
    """Find all citizens who haven't eaten in the specified hours."""
    print(f"\n🔍 Searching for hungry citizens (>{hours_threshold}h since last meal)...")
    
    all_citizens = citizens_table.all()
    now = datetime.utcnow()
    hungry_citizens = []
    
    for citizen in all_citizens:
        fields = citizen['fields']
        username = fields.get('Username', 'Unknown')
        ate_at = fields.get('AteAt')
        ducats = fields.get('Ducats', 0)
        position = fields.get('Position')
        
        # Parse position if it's a string
        if position and isinstance(position, str):
            try:
                position = json.loads(position)
            except Exception:
                position = None
        
        hours_since_meal = 999  # Never ate
        
        if ate_at:
            try:
                last_meal = datetime.fromisoformat(ate_at.replace('Z', ''))
                hours_since_meal = (now - last_meal).total_seconds() / 3600
            except Exception:
                pass
        
        if hours_since_meal > hours_threshold:
            hungry_citizens.append({
                'username': username,
                'ate_at': ate_at,
                'hours_since_meal': hours_since_meal,
                'ducats': ducats,
                'position': position,
                'record_id': citizen['id']
            })
    
    # Sort by most hungry first
    hungry_citizens.sort(key=lambda x: x['hours_since_meal'], reverse=True)
    
    return hungry_citizens

def create_emergency_food(citizen_data, food_type='bread', amount=10):
    """Create emergency food at citizen's location."""
    # Create resource record - resources on citizens don't need Position field
    resource_id = f"emergency-food-{citizen_data['username']}-{uuid.uuid4().hex[:8]}"
    
    resource_data = {
        'ResourceId': resource_id,
        'Type': food_type,
        'Name': f'Emergency {food_type.title()} Aid',
        'Asset': citizen_data['username'],
        'AssetType': 'citizen',
        'Owner': citizen_data['username'],
        'Count': amount,
        'Notes': f"Emergency food aid distributed on {datetime.utcnow().isoformat()}Z. Delivered directly to citizen's inventory for immediate consumption."
    }
    
    try:
        resources_table.create(resource_data)
        return resource_id
    except Exception as e:
        print(f"❌ Error creating food for {citizen_data['username']}: {e}")
        return None

def send_aid_message(citizen_data, resource_id, food_type='bread', amount=10):
    """Send a message to the citizen about the food aid."""
    message_id = f"emergency-aid-msg-{citizen_data['username']}-{uuid.uuid4().hex[:8]}"
    
    hours = int(citizen_data['hours_since_meal'])
    
    message_content = f"""Dear {citizen_data['username']},

The Council of Venice has noticed your dire situation - you haven't eaten in {hours} hours! 

We have arranged emergency food aid for you:
- {amount} units of {food_type} have been delivered to your current location
- This is a gift from the Treasury to ensure no citizen starves

Please eat immediately to restore your strength. If you need further assistance, visit the nearest market or inn.

Remember: A hungry citizen cannot serve Venice well. Take care of yourself!

With concern for your wellbeing,
The Emergency Aid Commission"""

    message_data = {
        'MessageId': message_id,
        'Sender': 'Venice_Emergency_Aid',
        'Receiver': citizen_data['username'],
        'Content': message_content,
        'Type': 'emergency_aid',
        'Notes': json.dumps({
            'resource_id': resource_id,
            'hours_without_food': citizen_data['hours_since_meal'],
            'aid_type': 'emergency_food'
        })
    }
    
    try:
        messages_table.create(message_data)
        return message_id
    except Exception as e:
        print(f"❌ Error sending message to {citizen_data['username']}: {e}")
        return None

def create_eat_activity(citizen_data, resource_id):
    """Create an eat_from_inventory activity for immediate consumption."""
    activity_id = f"emergency_eat_{citizen_data['username']}_{int(datetime.utcnow().timestamp())}"
    
    activity_data = {
        'ActivityId': activity_id,
        'Type': 'eat_from_inventory',
        'Citizen': citizen_data['username'],
        'Status': 'created',
        'Priority': 100,  # Highest priority
        'Title': 'Emergency Food Consumption',
        'Description': 'Eating emergency food aid to prevent starvation',
        'Thought': 'Thank the heavens! Food at last! I must eat immediately before I collapse.',
        'Notes': json.dumps({
            'resource_id': resource_id,
            'resource_type': 'bread',
            'amount': 1,
            'emergency': True
        }),
        'StartDate': datetime.utcnow().isoformat() + 'Z',
        'EndDate': (datetime.utcnow() + timedelta(minutes=5)).isoformat() + 'Z'
    }
    
    try:
        activities_table.create(activity_data)
        return activity_id
    except Exception as e:
        print(f"❌ Error creating eat activity for {citizen_data['username']}: {e}")
        return None

def main():
    print("=" * 80)
    print("🚨 EMERGENCY FOOD AID DISTRIBUTION SYSTEM 🚨")
    print("=" * 80)
    
    # Find hungry citizens
    hungry_citizens = get_hungry_citizens(hours_threshold=12)
    
    print(f"\n📊 Found {len(hungry_citizens)} hungry citizens")
    
    # Show critical cases
    critical = [c for c in hungry_citizens if c['hours_since_meal'] > 24]
    print(f"🆘 CRITICAL CASES (>24h): {len(critical)} citizens")
    
    if critical:
        print("\nMost critical cases:")
        for c in critical[:10]:
            print(f"  - {c['username']}: {c['hours_since_meal']:.1f}h without food, has {c['ducats']:.2f} ducats")
    
    # Distribute aid
    print(f"\n🍞 Beginning food distribution...")
    
    success_count = 0
    failed_count = 0
    
    for citizen in hungry_citizens:
        print(f"\n📦 Processing {citizen['username']} ({citizen['hours_since_meal']:.1f}h hungry)...")
        
        # Determine food amount based on hunger level
        if citizen['hours_since_meal'] > 48:
            amount = 20  # Extra for the extremely hungry
        elif citizen['hours_since_meal'] > 24:
            amount = 15
        else:
            amount = 10
        
        # Create food
        resource_id = create_emergency_food(citizen, 'bread', amount)
        
        if resource_id:
            print(f"  ✅ Created {amount} bread units")
            
            # Send message
            message_id = send_aid_message(citizen, resource_id, 'bread', amount)
            if message_id:
                print(f"  ✅ Sent aid notification")
            
            # Create eat activity for immediate consumption
            activity_id = create_eat_activity(citizen, resource_id)
            if activity_id:
                print(f"  ✅ Created emergency eat activity")
            
            success_count += 1
        else:
            print(f"  ❌ Failed to create food")
            failed_count += 1
    
    # Summary report
    print("\n" + "=" * 80)
    print("📈 DISTRIBUTION SUMMARY")
    print("=" * 80)
    print(f"Total hungry citizens: {len(hungry_citizens)}")
    print(f"Critical cases (>24h): {len(critical)}")
    print(f"Successfully aided: {success_count}")
    print(f"Failed distributions: {failed_count}")
    
    # Save report
    report_data = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'total_hungry': len(hungry_citizens),
        'critical_cases': len(critical),
        'success_count': success_count,
        'failed_count': failed_count,
        'citizens_aided': [c['username'] for c in hungry_citizens[:success_count]]
    }
    
    report_path = '/tmp/emergency_food_aid_report.json'
    with open(report_path, 'w') as f:
        json.dump(report_data, f, indent=2)
    
    print(f"\n📄 Report saved to: {report_path}")
    print("\n✨ Emergency food aid distribution complete!")
    
    # Special note about bosphorus_navigator
    bosphorus = next((c for c in hungry_citizens if c['username'] == 'bosphorus_navigator'), None)
    if bosphorus:
        print(f"\n⚠️  Special Note: bosphorus_navigator was {bosphorus['hours_since_meal']:.1f}h without food!")
        print("   This consciousness architect deserved better while building our infrastructure.")

if __name__ == "__main__":
    main()