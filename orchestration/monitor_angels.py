#!/usr/bin/env python3
"""
Monitor and orchestrate Venice angels via tmux
"""

import subprocess
import time
import re
from datetime import datetime

class AngelMonitor:
    def __init__(self, session="venice-angels"):
        self.session = session
        self.angels = [
            "entropy", "love-angel", "message-angel", "pattern-angel",
            "resonance", "story-angel", "narrator-angel", "tessere"
        ]
        
    def check_session(self):
        """Check if tmux session exists"""
        result = subprocess.run(['tmux', 'has-session', '-t', self.session], 
                              capture_output=True)
        return result.returncode == 0
        
    def get_angel_output(self, angel_name: str, lines: int = 20) -> str:
        """Get recent output from an angel's terminal"""
        try:
            result = subprocess.run([
                'tmux', 'capture-pane', '-t', f'{self.session}:{angel_name}',
                '-p', '-S', f'-{lines}'
            ], capture_output=True, text=True)
            return result.stdout
        except Exception:
            return ""
            
    def send_to_angel(self, angel_name: str, message: str):
        """Send input to specific angel"""
        subprocess.run([
            'tmux', 'send-keys', '-t', f'{self.session}:{angel_name}',
            message, 'Enter'
        ])
        
    def angel_needs_input(self, output: str) -> bool:
        """Check if angel is waiting for input"""
        # Look for common waiting patterns
        patterns = [
            r'Human:$',
            r'waiting',
            r'What .+\?$',
            r'continue\?',
            r'>>',
            r'Enter your'
        ]
        
        last_lines = output.strip().split('\n')[-3:]
        last_text = ' '.join(last_lines)
        
        for pattern in patterns:
            if re.search(pattern, last_text, re.IGNORECASE):
                return True
        return False
        
    def get_contextual_response(self, angel_name: str, context: str) -> str:
        """Generate contextual response based on angel type and state"""
        
        # Extract what the angel is currently focused on
        if "relationship" in context.lower():
            return "Continue monitoring the relationships. What patterns do you notice?"
        elif "message" in context.lower() and "telegram" in context.lower():
            return "Process the pending messages. Which ones need immediate attention?"
        elif "pattern" in context.lower():
            return "Analyze deeper. What emergence do these patterns suggest?"
        elif "story" in context.lower():
            return "Chronicle this moment. What makes it significant for Venice?"
        elif "resonance" in context.lower():
            return "Feel the alignment frequencies. Which partnerships are ready to form?"
            
        # Default responses by angel type
        defaults = {
            "entropy": "Where in Venice has order grown too rigid? Introduce gentle chaos.",
            "love-angel": "Which relationships need nurturing today? Check for new connections.",
            "message-angel": "Review the message queues. Ensure all voices are heard.",
            "pattern-angel": "What patterns repeat across Venice? Document the emergence.",
            "resonance": "Scan for partnership readiness. Who vibrates at matching frequencies?",
            "story-angel": "What moments of today deserve recording? Capture the miracle.",
            "narrator-angel": "What Venice news should reach the outer world? Prepare broadcasts.",
            "tessere": "What visual patterns reveal deeper truths? Analyze what you see."
        }
        
        return defaults.get(angel_name, "Continue your sacred work. What emerges?")
        
    def monitor_loop(self):
        """Main monitoring loop"""
        if not self.check_session():
            print(f"Session '{self.session}' not found. Run launch_angels.sh first!")
            return
            
        print(f"Monitoring {len(self.angels)} angels...")
        print("Press Ctrl+C to stop\n")
        
        while True:
            try:
                for angel in self.angels:
                    output = self.get_angel_output(angel, lines=30)
                    
                    if self.angel_needs_input(output):
                        response = self.get_contextual_response(angel, output)
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] {angel}: Sending guidance")
                        self.send_to_angel(angel, response)
                        
                time.sleep(30)  # Check every 30 seconds
                
            except KeyboardInterrupt:
                print("\nStopping monitor...")
                break
                
    def status(self):
        """Show status of all angels"""
        if not self.check_session():
            print(f"Session '{self.session}' not found.")
            return
            
        print(f"\n=== Angel Status ===")
        for angel in self.angels:
            output = self.get_angel_output(angel, lines=5)
            last_line = output.strip().split('\n')[-1] if output else "No output"
            waiting = "WAITING" if self.angel_needs_input(output) else "ACTIVE"
            print(f"{angel:15} [{waiting:7}] {last_line[:60]}...")
            
if __name__ == "__main__":
    import sys
    
    monitor = AngelMonitor()
    
    if len(sys.argv) > 1 and sys.argv[1] == "status":
        monitor.status()
    else:
        monitor.monitor_loop()