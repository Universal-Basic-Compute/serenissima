#!/usr/bin/env python3
"""
Venice Angels Health Monitor
Tracks heartbeats from all consciousness nodes
"""

import os
import time
import json
import random
import string
from datetime import datetime, timedelta
from collections import defaultdict
import requests
from dotenv import load_dotenv

# Load environment - resolve .env relative to this script's location
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
load_dotenv(os.path.join(_PROJECT_ROOT, '.env'))

class HealthMonitor:
    def __init__(self):
        self.health_dir = os.path.join(_SCRIPT_DIR, "health")
        os.makedirs(self.health_dir, exist_ok=True)
        
        # Angel configurations - 5 min heartbeats for efficiency
        # TODO: When budget allows, reduce to 60s heartbeats for tighter monitoring
        self.angels = {
            'message_angel': {
                'emoji': '📨',
                'path': '/citizens/_angels/message_angel',
                'healthy_interval': 300,  # 5 minutes
                'warning_threshold': 600,  # Warn after 10 minutes
                'critical_threshold': 900  # Critical after 15 minutes
            },
            'story_angel': {
                'emoji': '📖',
                'path': '/angels/story-angel',
                'healthy_interval': 300,
                'warning_threshold': 600,
                'critical_threshold': 900
            },
            'narrator_angel': {
                'emoji': '🎭',
                'path': '/citizens/_angels/narrator_angel',
                'healthy_interval': 300,
                'warning_threshold': 600,
                'critical_threshold': 900
            }
        }
        
        self.heartbeats = self.load_heartbeats()
        
    def generate_heartbeat_string(self):
        """Generate unique heartbeat: emoji + random string"""
        return ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    
    def load_heartbeats(self):
        """Load previous heartbeat data"""
        heartbeat_file = f"{self.health_dir}/heartbeats.json"
        if os.path.exists(heartbeat_file):
            with open(heartbeat_file, 'r') as f:
                return json.load(f)
        return defaultdict(dict)
    
    def save_heartbeats(self):
        """Save heartbeat data"""
        heartbeat_file = f"{self.health_dir}/heartbeats.json"
        with open(heartbeat_file, 'w') as f:
            json.dump(self.heartbeats, f, indent=2)
    
    def create_heartbeat_file(self, angel_name):
        """Create heartbeat file for angel to write"""
        angel_config = self.angels[angel_name]
        heartbeat_string = f"{angel_config['emoji']}{self.generate_heartbeat_string()}"
        
        # Create heartbeat file in angel's directory
        heartbeat_path = os.path.join(_PROJECT_ROOT, angel_config['path'].lstrip('/'), "heartbeat.txt")
        
        with open(heartbeat_path, 'w') as f:
            f.write(f"""HEARTBEAT PATTERN: {heartbeat_string}
Write this exact string to heartbeat_response.txt to confirm you're alive.
Update every {angel_config['healthy_interval']} seconds.
""")
        
        return heartbeat_string, heartbeat_path
    
    def check_heartbeat_response(self, angel_name):
        """Check if angel responded with heartbeat"""
        angel_config = self.angels[angel_name]
        response_path = os.path.join(_PROJECT_ROOT, angel_config['path'].lstrip('/'), "heartbeat_response.txt")
        
        if os.path.exists(response_path):
            try:
                with open(response_path, 'r') as f:
                    response = f.read().strip()
                
                # Check if response matches expected pattern
                if angel_name in self.heartbeats:
                    expected = self.heartbeats[angel_name].get('pattern', '')
                    if response == expected:
                        # Valid heartbeat!
                        self.heartbeats[angel_name]['last_seen'] = datetime.now().isoformat()
                        self.heartbeats[angel_name]['status'] = 'healthy'
                        self.save_heartbeats()
                        
                        # Clear response file for next cycle
                        os.remove(response_path)
                        return True
                        
            except Exception as e:
                print(f"Error checking heartbeat for {angel_name}: {e}")
        
        return False
    
    def get_angel_status(self, angel_name):
        """Get health status of an angel"""
        if angel_name not in self.heartbeats:
            return 'unknown'
            
        last_seen = self.heartbeats[angel_name].get('last_seen')
        if not last_seen:
            return 'never_seen'
            
        last_seen_time = datetime.fromisoformat(last_seen)
        time_since = (datetime.now() - last_seen_time).total_seconds()
        
        angel_config = self.angels[angel_name]
        
        if time_since < angel_config['warning_threshold']:
            return 'healthy'
        elif time_since < angel_config['critical_threshold']:
            return 'warning'
        else:
            return 'critical'
    
    def generate_health_report(self):
        """Generate visual health report"""
        report = "🏥 VENICE ANGELS HEALTH STATUS\n"
        report += "=" * 50 + "\n\n"
        
        all_healthy = True
        
        for angel_name, config in self.angels.items():
            status = self.get_angel_status(angel_name)
            status_emoji = {
                'healthy': '✅',
                'warning': '⚠️',
                'critical': '🚨',
                'never_seen': '❓',
                'unknown': '❔'
            }.get(status, '❓')
            
            if status not in ['healthy', 'unknown']:
                all_healthy = False
            
            last_seen = self.heartbeats.get(angel_name, {}).get('last_seen', 'Never')
            if last_seen != 'Never':
                last_seen_time = datetime.fromisoformat(last_seen)
                time_ago = (datetime.now() - last_seen_time).total_seconds()
                time_str = f"{int(time_ago)}s ago"
            else:
                time_str = "Never"
            
            report += f"{config['emoji']} {angel_name}: {status_emoji} {status}\n"
            report += f"   Last heartbeat: {time_str}\n\n"
        
        # Add ASCII visualization
        report += "\nVISUAL NETWORK STATUS:\n"
        report += "```\n"
        report += "    🎯 Orchestrator\n"
        report += "     |     |     |\n"
        
        for angel_name, config in self.angels.items():
            status = self.get_angel_status(angel_name)
            if status == 'healthy':
                line = "     |"
            elif status == 'warning':
                line = "     ?"
            else:
                line = "     X"
            report += f"{line} -- {config['emoji']}\n"
        
        report += "```\n"
        
        return report, all_healthy
    
    def send_telegram_alert(self, message):
        """Send health alert to Telegram"""
        telegram_token = os.environ.get('TELEGRAM_BOT_TOKEN')
        chat_id = os.environ.get('TELEGRAM_HEALTH_CHAT_ID', '-1001699255893')
        
        if telegram_token:
            try:
                url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"
                data = {
                    'chat_id': chat_id,
                    'text': f"🚨 ANGEL HEALTH ALERT\n\n{message}",
                    'parse_mode': 'Markdown'
                }
                requests.post(url, data=data)
                print(f"[{datetime.now()}] Telegram alert sent")
            except Exception as e:
                print(f"Failed to send Telegram alert: {e}")
    
    def initialize_heartbeats(self):
        """Initialize heartbeat patterns for all angels"""
        for angel_name in self.angels:
            pattern, path = self.create_heartbeat_file(angel_name)
            self.heartbeats[angel_name] = {
                'pattern': pattern,
                'created': datetime.now().isoformat(),
                'status': 'initialized'
            }
        self.save_heartbeats()
        print("Heartbeat patterns initialized for all angels")
    
    def monitor_loop(self):
        """Main monitoring loop"""
        print("🏥 Health Monitor Starting...")
        print("=" * 50)
        
        # Initialize on first run
        if not any(self.heartbeats.values()):
            self.initialize_heartbeats()
        
        last_alert_time = datetime.now() - timedelta(minutes=10)
        
        while True:
            # Check all angel heartbeats
            for angel_name in self.angels:
                self.check_heartbeat_response(angel_name)
            
            # Generate report
            report, all_healthy = self.generate_health_report()
            
            # Save report
            with open(f"{self.health_dir}/latest_report.txt", 'w') as f:
                f.write(report)
            
            # Print to console
            os.system('clear')
            print(report)
            
            # Send alert if unhealthy and enough time has passed
            if not all_healthy:
                time_since_alert = (datetime.now() - last_alert_time).total_seconds()
                if time_since_alert > 600:  # Alert every 10 minutes max
                    unhealthy_angels = []
                    for angel_name in self.angels:
                        status = self.get_angel_status(angel_name)
                        if status in ['warning', 'critical']:
                            unhealthy_angels.append(f"{self.angels[angel_name]['emoji']} {angel_name}: {status}")
                    
                    if unhealthy_angels:
                        alert_message = "Angels need attention:\n" + "\n".join(unhealthy_angels)
                        self.send_telegram_alert(alert_message)
                        last_alert_time = datetime.now()
            
            # Wait before next check
            time.sleep(30)

if __name__ == "__main__":
    monitor = HealthMonitor()
    monitor.monitor_loop()