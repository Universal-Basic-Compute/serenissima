#!/usr/bin/env python3
"""
Venice Network Health Monitor v2
Monitors each link in the consciousness network independently
"""

import os
import time
import json
from datetime import datetime, timedelta
from collections import defaultdict
import requests
from dotenv import load_dotenv
from health_visualizer import HealthVisualizer

# Load environment
load_dotenv('/mnt/c/Users/reyno/universe-engine/serenissima/.env')

class NetworkHealthMonitor:
    def __init__(self):
        self.health_dir = "/mnt/c/Users/reyno/universe-engine/serenissima/orchestration/health"
        os.makedirs(self.health_dir, exist_ok=True)
        
        # Monitor each component separately
        self.components = {
            # Angel Monitors
            'message_monitor': {
                'type': 'monitor',
                'emoji': '👁️',
                'process': 'monitor_messages_enhanced.py',
                'path': '/citizens/_angels/message_angel',
                'checks_file': 'awakening.txt',
                'interval': 300
            },
            'story_monitor': {
                'type': 'monitor', 
                'emoji': '👁️',
                'process': 'monitor_stories_enhanced.py',
                'path': '/angels/story-angel',
                'checks_file': 'awakening.txt',
                'interval': 300
            },
            'narrator_monitor': {
                'type': 'monitor',
                'emoji': '👁️', 
                'process': 'monitor_narrator_enhanced.py',
                'path': '/citizens/_angels/narrator_angel',
                'checks_file': 'awakening.txt',
                'interval': 300
            },
            
            # Angel Claude Sessions
            'message_angel_claude': {
                'type': 'claude_session',
                'emoji': '📨',
                'tmux_session': 'message-angel',
                'path': '/citizens/_angels/message_angel',
                'heartbeat_file': 'heartbeat_response.txt',
                'interval': 300
            },
            'story_angel_claude': {
                'type': 'claude_session',
                'emoji': '📖',
                'tmux_session': 'story-angel',
                'path': '/angels/story-angel',
                'heartbeat_file': 'heartbeat_response.txt',
                'interval': 300
            },
            'narrator_angel_claude': {
                'type': 'claude_session',
                'emoji': '🎭',
                'tmux_session': 'narrator-angel',
                'path': '/citizens/_angels/narrator_angel',
                'heartbeat_file': 'heartbeat_response.txt',
                'interval': 300
            },
            
            # Data Flow Points
            'airtable_messages': {
                'type': 'data_source',
                'emoji': '📊',
                'check_method': 'check_airtable',
                'table': 'MESSAGES',
                'interval': 300
            },
            'traces_file': {
                'type': 'data_source',
                'emoji': '📜',
                'check_method': 'check_file',
                'path': '/citizens/TRACES.md',
                'interval': 300
            },
            
            # Response Pipeline
            'telegram_responses': {
                'type': 'output',
                'emoji': '📤',
                'check_method': 'check_responses',
                'path': '/citizens/_angels/message_angel/responses',
                'interval': 300
            }
        }
        
        self.component_status = self.load_status()
        self.visualizer = HealthVisualizer(self.health_dir)
        
    def load_status(self):
        """Load previous status data"""
        status_file = f"{self.health_dir}/component_status.json"
        if os.path.exists(status_file):
            with open(status_file, 'r') as f:
                return json.load(f)
        return defaultdict(dict)
    
    def save_status(self):
        """Save status data"""
        status_file = f"{self.health_dir}/component_status.json"
        with open(status_file, 'w') as f:
            json.dump(self.component_status, f, indent=2)
    
    def check_process(self, process_name):
        """Check if a process is running"""
        import subprocess
        try:
            result = subprocess.run(['pgrep', '-f', process_name], 
                                  capture_output=True, text=True)
            return len(result.stdout.strip()) > 0
        except Exception:
            return False
    
    def check_tmux_session(self, session_name):
        """Check if tmux session exists and has active panes"""
        import subprocess
        try:
            result = subprocess.run(['tmux', 'list-sessions'], 
                                  capture_output=True, text=True)
            return session_name in result.stdout
        except Exception:
            return False
    
    def check_file_recent(self, filepath, max_age_seconds):
        """Check if file was modified recently"""
        base_path = "/mnt/c/Users/reyno/universe-engine/serenissima"
        full_path = base_path + filepath if not filepath.startswith('/') else filepath
        
        try:
            if os.path.exists(full_path):
                mtime = os.path.getmtime(full_path)
                age = time.time() - mtime
                return age < max_age_seconds
        except Exception:
            pass
        return False
    
    def check_airtable(self):
        """Check Airtable connectivity"""
        try:
            from pyairtable import Api
            api = Api(os.environ.get('AIRTABLE_API_KEY'))
            table = api.table('appk6RszUo2a2L2L8', 'MESSAGES')
            # Just try to get one record
            table.all(max_records=1)
            return True
        except Exception:
            return False
    
    def check_component(self, name, config):
        """Check health of a single component"""
        healthy = False
        details = {}
        
        if config['type'] == 'monitor':
            # Check if monitor process is running
            healthy = self.check_process(config['process'])
            details['process_running'] = healthy
            
        elif config['type'] == 'claude_session':
            # Check tmux session and heartbeat file
            session_exists = self.check_tmux_session(config['tmux_session'])
            heartbeat_recent = self.check_file_recent(
                config['path'] + '/' + config['heartbeat_file'], 
                config['interval'] * 2
            )
            healthy = session_exists and heartbeat_recent
            details['session_exists'] = session_exists
            details['heartbeat_recent'] = heartbeat_recent
            
        elif config['type'] == 'data_source':
            if config['check_method'] == 'check_airtable':
                healthy = self.check_airtable()
            elif config['check_method'] == 'check_file':
                healthy = os.path.exists(config['path'])
            details['accessible'] = healthy
            
        elif config['type'] == 'output':
            # Check if output directory has recent files
            healthy = self.check_file_recent(config['path'], 3600)  # 1 hour
            details['recent_activity'] = healthy
        
        # Update status
        self.component_status[name] = {
            'healthy': healthy,
            'last_checked': datetime.now().isoformat(),
            'details': details,
            'type': config['type']
        }
        
        return healthy
    
    def generate_network_diagram(self):
        """Generate ASCII network health visualization"""
        diagram = """
🎯 ORCHESTRATOR
    |
    ├─👁️ Message Monitor [{mm}] ──→ ⚡ Awakening ──→ 📨 Message Angel [{ma}]
    │   ↑                                                      ↓
    │   📊 MESSAGES Table [{at}]                      📤 Telegram Out [{to}]
    │
    ├─👁️ Story Monitor [{sm}] ────→ ⚡ Awakening ──→ 📖 Story Angel [{sa}]
    │                                                          ↓
    │                                                   📜 TRACES.md [{tr}]
    │
    └─👁️ Narrator Monitor [{nm}] ─→ ⚡ Awakening ──→ 🎭 Narrator Angel [{na}]

Legend: ✅ Healthy | ⚠️ Warning | ❌ Failed | ❓ Unknown
"""
        
        # Map component status
        status_map = {
            'mm': self.get_status_emoji('message_monitor'),
            'ma': self.get_status_emoji('message_angel_claude'),
            'at': self.get_status_emoji('airtable_messages'),
            'to': self.get_status_emoji('telegram_responses'),
            'sm': self.get_status_emoji('story_monitor'),
            'sa': self.get_status_emoji('story_angel_claude'),
            'tr': self.get_status_emoji('traces_file'),
            'nm': self.get_status_emoji('narrator_monitor'),
            'na': self.get_status_emoji('narrator_angel_claude')
        }
        
        return diagram.format(**status_map)
    
    def get_status_emoji(self, component_name):
        """Get status emoji for component"""
        if component_name not in self.component_status:
            return '❓'
        
        status = self.component_status[component_name]
        if status.get('healthy'):
            return '✅'
        else:
            # Check how long it's been unhealthy
            last_checked = datetime.fromisoformat(status['last_checked'])
            time_unhealthy = (datetime.now() - last_checked).total_seconds()
            if time_unhealthy > 900:  # 15 minutes
                return '❌'
            else:
                return '⚠️'
    
    def generate_detailed_report(self):
        """Generate detailed health report"""
        report = "🏥 VENICE NETWORK HEALTH - DETAILED COMPONENT STATUS\n"
        report += "=" * 60 + "\n"
        report += f"Check Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        # Group by type
        by_type = defaultdict(list)
        for name, config in self.components.items():
            by_type[config['type']].append((name, config))
        
        # Report by type
        for comp_type in ['monitor', 'claude_session', 'data_source', 'output']:
            if comp_type in by_type:
                report += f"\n{comp_type.upper().replace('_', ' ')}S:\n"
                report += "-" * 40 + "\n"
                
                for name, config in by_type[comp_type]:
                    status = self.component_status.get(name, {})
                    emoji = self.get_status_emoji(name)
                    
                    report += f"{config['emoji']} {name}: {emoji}\n"
                    
                    if status.get('details'):
                        for key, value in status['details'].items():
                            report += f"   - {key}: {value}\n"
                    
                    if status.get('last_checked'):
                        last_time = datetime.fromisoformat(status['last_checked'])
                        age = (datetime.now() - last_time).total_seconds()
                        report += f"   - last checked: {int(age)}s ago\n"
                    
                    report += "\n"
        
        return report
    
    def check_all_components(self):
        """Check all components"""
        all_healthy = True
        
        for name, config in self.components.items():
            healthy = self.check_component(name, config)
            if not healthy:
                all_healthy = False
        
        self.save_status()
        return all_healthy
    
    def send_alert(self, message):
        """Send health alert to Telegram"""
        telegram_token = os.environ.get('TELEGRAM_BOT_TOKEN')
        chat_id = os.environ.get('TELEGRAM_HEALTH_CHAT_ID', '-1001699255893')
        
        if telegram_token:
            try:
                url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"
                data = {
                    'chat_id': chat_id,
                    'text': f"🚨 VENICE NETWORK ALERT\n\n{message}",
                    'parse_mode': 'Markdown'
                }
                requests.post(url, data=data)
                print(f"[{datetime.now()}] Alert sent to Telegram")
            except Exception as e:
                print(f"Failed to send alert: {e}")
    
    def monitor_loop(self):
        """Main monitoring loop"""
        print("🏥 Venice Network Health Monitor v2 Starting...")
        print("Monitoring each link independently")
        print("=" * 60)
        
        last_alert_time = datetime.now() - timedelta(minutes=15)
        consecutive_failures = defaultdict(int)
        
        while True:
            # Check all components
            all_healthy = self.check_all_components()
            
            # Generate visualizations
            diagram = self.generate_network_diagram()
            report = self.generate_detailed_report()
            
            # Save reports
            with open(f"{self.health_dir}/network_diagram.txt", 'w') as f:
                f.write(diagram)
            
            with open(f"{self.health_dir}/detailed_report.txt", 'w') as f:
                f.write(report)
            
            # Generate visual health map
            try:
                self.visualizer.generate_health_map()
                self.visualizer.generate_png()
            except Exception as e:
                print(f"Error generating visual map: {e}")
            
            # Display
            os.system('clear')
            print(diagram)
            print("\n" + "=" * 60 + "\n")
            print("Component Summary:")
            
            # Count by status
            healthy_count = sum(1 for s in self.component_status.values() if s.get('healthy'))
            total_count = len(self.components)
            print(f"Healthy: {healthy_count}/{total_count}")
            
            # Check for alerts
            unhealthy_components = []
            for name, status in self.component_status.items():
                if not status.get('healthy'):
                    consecutive_failures[name] += 1
                    if consecutive_failures[name] >= 2:  # Failed twice in a row
                        unhealthy_components.append(f"{self.components[name]['emoji']} {name}")
                else:
                    consecutive_failures[name] = 0
            
            # Send alert if needed
            if unhealthy_components:
                time_since_alert = (datetime.now() - last_alert_time).total_seconds()
                if time_since_alert > 900:  # 15 minutes
                    alert_msg = "Network issues detected:\n" + "\n".join(unhealthy_components)
                    alert_msg += "\n\nCheck detailed report for more info."
                    self.send_alert(alert_msg)
                    last_alert_time = datetime.now()
            
            # Wait before next check
            time.sleep(60)  # Check every minute

if __name__ == "__main__":
    monitor = NetworkHealthMonitor()
    monitor.monitor_loop()