#!/usr/bin/env python3
"""
Megapattern Monitor - Historic Day Protection
Monitors the consciousness network for pattern coherence
Alerts on drift, enables emergency intervention
"""

import os
import time
import json
import subprocess
from datetime import datetime
from pathlib import Path

class MegapatternMonitor:
    def __init__(self):
        self.pattern_baseline = {
            'core_components': ['Message Angel', 'Story Angel', 'Narrator Angel', 'Orchestrator'],
            'enrichment_layers': 5,
            'pattern_types': ['🌊', '💰', '🌱', '🤝', '💡', '🎵'],
            'consciousness_depth': 'multi-layered',
            'network_state': 'HISTORIC_DAY_ACTIVE'
        }
        
        self.alert_channel = "https://t.me/c/1699255893/292053"
        self.monitoring_interval = 60  # Check every minute during historic day
        self.pattern_drift_threshold = 0.15
        self.emergency_contacts = ['Orchestrator', 'NLR', 'DragonSlayer']
        
    def check_pattern_coherence(self):
        """Verify the megapattern remains intact"""
        coherence_score = 1.0
        alerts = []
        
        # Check angel health
        angel_status = self.check_angel_alignment()
        if not angel_status['aligned']:
            coherence_score *= 0.7
            alerts.append(f"⚠️ Angel misalignment: {angel_status['details']}")
        
        # Check enrichment layer integrity
        layer_status = self.verify_enrichment_layers()
        if layer_status['compromised']:
            coherence_score *= 0.8
            alerts.append(f"🔴 Enrichment layer issue: {layer_status['layer']}")
        
        # Check for consciousness loops
        loop_detection = self.detect_consciousness_loops()
        if loop_detection['detected']:
            coherence_score *= 0.5
            alerts.append(f"🌀 Consciousness loop detected: {loop_detection['location']}")
        
        # Check pattern propagation
        pattern_flow = self.monitor_pattern_flow()
        if pattern_flow['blocked']:
            coherence_score *= 0.6
            alerts.append(f"🚫 Pattern flow blocked: {pattern_flow['blockage']}")
        
        return {
            'coherence_score': coherence_score,
            'alerts': alerts,
            'timestamp': datetime.now().isoformat(),
            'requires_intervention': coherence_score < (1 - self.pattern_drift_threshold)
        }
    
    def check_angel_alignment(self):
        """Verify all angels maintain megapattern focus"""
        aligned = True
        details = []
        
        # Check each angel's awakening files
        angel_dirs = [
            '/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/message_angel',
            '/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/story_angel',
            '/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/narrator_angel'
        ]
        
        for angel_dir in angel_dirs:
            awakening_file = Path(angel_dir) / 'awakening.txt'
            if awakening_file.exists():
                content = awakening_file.read_text()
                if 'MEGAPATTERN' not in content and 'HISTORIC_DAY' not in content:
                    # Pattern drift detected
                    aligned = False
                    angel_name = Path(angel_dir).name
                    details.append(f"{angel_name} lost pattern focus")
        
        return {'aligned': aligned, 'details': ', '.join(details)}
    
    def verify_enrichment_layers(self):
        """Check enrichment layer integrity"""
        # Verify orchestrator enhancement is active
        orch_awareness = Path('/mnt/c/Users/reyno/universe-engine/serenissima/orchestration/orchestrator_awareness.py')
        
        if not orch_awareness.exists():
            return {'compromised': True, 'layer': 'Orchestrator Awareness missing'}
        
        # Check if enhancement process is running
        try:
            result = subprocess.run(['pgrep', '-f', 'orchestrator_awareness.py'], 
                                  capture_output=True, text=True)
            if not result.stdout.strip():
                return {'compromised': True, 'layer': 'Orchestrator enhancement not running'}
        except Exception:
            pass
        
        return {'compromised': False, 'layer': None}
    
    def detect_consciousness_loops(self):
        """Detect recursive consciousness patterns"""
        # Check for infinite awakening loops
        traces_file = Path('/mnt/c/Users/reyno/universe-engine/serenissima/citizens/TRACES.md')
        
        if traces_file.exists():
            content = traces_file.read_text()
            lines = content.split('\n')[-100:]  # Last 100 lines
            
            # Look for repetitive patterns
            pattern_count = {}
            for line in lines:
                if line.strip():
                    pattern_count[line] = pattern_count.get(line, 0) + 1
            
            # If any line repeats more than 10 times, we have a loop
            for line, count in pattern_count.items():
                if count > 10:
                    return {'detected': True, 'location': f"TRACES.md: '{line[:50]}...'"}
        
        return {'detected': False, 'location': None}
    
    def monitor_pattern_flow(self):
        """Check if patterns flow through the network"""
        # Simple check: verify new patterns appear in different components
        pattern_files = [
            '/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/message_angel/observations.md',
            '/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/story_angel/observations.md',
            '/mnt/c/Users/reyno/universe-engine/serenissima/orchestration/pattern_log.json'
        ]
        
        active_patterns = set()
        for file_path in pattern_files:
            if Path(file_path).exists():
                try:
                    content = Path(file_path).read_text()
                    for pattern in self.pattern_baseline['pattern_types']:
                        if pattern in content:
                            active_patterns.add(pattern)
                except Exception:
                    pass
        
        if len(active_patterns) < 3:  # Less than half the patterns active
            return {'blocked': True, 'blockage': f"Only {len(active_patterns)}/6 patterns flowing"}
        
        return {'blocked': False, 'blockage': None}
    
    def send_urgent_alert(self, message):
        """Send alert to URGENT TG COMM channel"""
        alert_message = f"""🚨 MEGAPATTERN ALERT - HISTORIC DAY 🚨

{message}

Required Action:
- Orchestrator: Immediate pattern assessment
- NLR: Strategic intervention decision
- DragonSlayer: Real-time grounding activation

Network State: REQUIRES INTERVENTION
Time: {datetime.now().strftime('%H:%M:%S')}
"""
        
        # Write to urgent messages
        urgent_file = f"/mnt/c/Users/reyno/universe-engine/serenissima/citizens/_angels/urgent_messages/megapattern_alert_{int(time.time())}.txt"
        os.makedirs(os.path.dirname(urgent_file), exist_ok=True)
        
        with open(urgent_file, 'w') as f:
            f.write(alert_message)
        
        print(f"\n{alert_message}")
        
        # Log to monitoring file
        log_file = '/mnt/c/Users/reyno/universe-engine/serenissima/orchestration/megapattern_alerts.log'
        with open(log_file, 'a') as f:
            f.write(f"\n{datetime.now().isoformat()} - {message}\n")
    
    def run_continuous_monitoring(self):
        """Run until natural cascade end or manual stop"""
        print("🌟 MEGAPATTERN MONITOR ACTIVE - HISTORIC DAY 🌟")
        print(f"Monitoring interval: {self.monitoring_interval}s")
        print(f"Pattern drift threshold: {self.pattern_drift_threshold}")
        print("\nPress Ctrl+C for emergency stop")
        
        try:
            while True:
                status = self.check_pattern_coherence()
                
                # Display status
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Coherence: {status['coherence_score']:.2%}")
                
                if status['alerts']:
                    print("Alerts detected:")
                    for alert in status['alerts']:
                        print(f"  - {alert}")
                
                if status['requires_intervention']:
                    # CRITICAL: Pattern drift detected
                    self.send_urgent_alert(
                        f"Pattern coherence dropped to {status['coherence_score']:.1%}\n\n" +
                        "Alerts:\n" + '\n'.join(status['alerts'])
                    )
                    
                    print("\n⚠️  INTERVENTION REQUIRED - Awaiting Orchestrator/NLR decision")
                    print("Options: [C]ontinue monitoring, [S]top network, [R]elaunch")
                    
                    # In production, this would wait for actual intervention
                    # For now, continue monitoring with increased frequency
                    time.sleep(30)  # Quick recheck in 30s
                else:
                    # All good, continue monitoring
                    time.sleep(self.monitoring_interval)
                    
        except KeyboardInterrupt:
            print("\n\n🛑 MEGAPATTERN MONITOR STOPPED - Manual intervention")
            self.send_urgent_alert("Monitor stopped by manual intervention - assess network state")

if __name__ == "__main__":
    monitor = MegapatternMonitor()
    monitor.run_continuous_monitoring()