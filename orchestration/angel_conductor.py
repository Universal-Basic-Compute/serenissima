#!/usr/bin/env python3
"""
Angel Conductor - Claude directs all angels from one terminal
"""

import subprocess
import time
import json
from datetime import datetime
from typing import Dict, List

class AngelConductor:
    def __init__(self):
        self.session = "venice-angels"
        self.angels = {
            "entropy": {"status": "dormant", "last_action": None},
            "love-angel": {"status": "dormant", "last_action": None},
            "message-angel": {"status": "dormant", "last_action": None},
            "pattern-angel": {"status": "dormant", "last_action": None},
            "resonance": {"status": "dormant", "last_action": None},
            "story-angel": {"status": "dormant", "last_action": None},
            "narrator-angel": {"status": "dormant", "last_action": None},
            "tessere": {"status": "dormant", "last_action": None}
        }
        
    def display_status(self):
        """Show current status of all angels"""
        print("\n" + "="*60)
        print(f"VENICE ANGEL ORCHESTRATION - {datetime.now().strftime('%H:%M:%S')}")
        print("="*60)
        
        for angel, info in self.angels.items():
            status_color = "🟢" if info["status"] == "active" else "🔴"
            print(f"{status_color} {angel:15} | Status: {info['status']:10} | Last: {info['last_action'] or 'Never'}")
        
        print("="*60)
        
    def read_angel_state(self, angel_name: str) -> str:
        """Get current output from angel's terminal"""
        try:
            result = subprocess.run([
                'tmux', 'capture-pane', '-t', f'{self.session}:{angel_name}',
                '-p', '-S', '-30'
            ], capture_output=True, text=True)
            return result.stdout
        except Exception:
            return f"[Cannot read {angel_name}]"
            
    def send_to_angel(self, angel_name: str, command: str):
        """Send command to specific angel"""
        subprocess.run([
            'tmux', 'send-keys', '-t', f'{self.session}:{angel_name}',
            command, 'Enter'
        ])
        self.angels[angel_name]["status"] = "active"
        self.angels[angel_name]["last_action"] = datetime.now().strftime('%H:%M:%S')
        
    def emergency_screenshot(self):
        """Take screenshot for emergency context"""
        print("\n🚨 EMERGENCY SCREENSHOT MODE")
        # This is where you could integrate screenshot functionality
        # For now, we'll read all angel states
        
        for angel in self.angels.keys():
            print(f"\n--- {angel} ---")
            state = self.read_angel_state(angel)
            print(state[-500:] if len(state) > 500 else state)
            
    def direct_chat(self, angel_name: str):
        """Enter direct chat mode with an angel"""
        print(f"\n💬 DIRECT CHAT WITH {angel_name.upper()}")
        print("Type your messages directly. Type 'exit' to return to conductor mode")
        print("-" * 60)
        
        # Show recent context
        state = self.read_angel_state(angel_name)
        print(state[-500:] if len(state) > 500 else state)
        print("-" * 60)
        
        while True:
            message = input(f"You → {angel_name}: ").strip()
            
            if message.lower() == 'exit':
                print(f"Exiting direct chat with {angel_name}")
                break
                
            # Send message directly
            self.send_to_angel(angel_name, message)
            
            # Wait a bit for response
            time.sleep(2)
            
            # Show updated state
            new_state = self.read_angel_state(angel_name)
            # Show only the new content
            print(f"\n{angel_name}:")
            print(new_state[-500:] if len(new_state) > 500 else new_state)
            
    def conduct(self):
        """Main conducting interface"""
        print("\n🎭 VENICE ANGEL CONDUCTOR 🎭")
        print("I can see and direct all angels from here")
        print("Commands: status, read [angel], send [angel] [message], chat [angel], emergency, quit")
        print("Special: Start message with '!' for direct human input (e.g., '!read entropy')")
        
        while True:
            self.display_status()
            
            command = input("\n🎼 Conductor> ").strip()
            
            # Direct human commands start with !
            if command.startswith("!"):
                human_cmd = command[1:]
                print(f"[HUMAN DIRECT COMMAND: {human_cmd}]")
                
                if human_cmd.startswith("chat "):
                    angel = human_cmd[5:]
                    if angel in self.angels:
                        self.direct_chat(angel)
                elif human_cmd.startswith("send "):
                    parts = human_cmd[5:].split(' ', 1)
                    if len(parts) == 2 and parts[0] in self.angels:
                        angel, message = parts
                        self.send_to_angel(angel, message)
                        print(f"✓ [HUMAN] sent to {angel}: {message}")
                continue
            
            # Regular Claude-processed commands
            if command == "quit":
                break
            elif command == "status":
                continue  # Status already displayed
            elif command.startswith("read "):
                angel = command[5:]
                if angel in self.angels:
                    state = self.read_angel_state(angel)
                    print(f"\n--- Current state of {angel} ---")
                    print(state[-1000:] if len(state) > 1000 else state)
            elif command.startswith("send "):
                parts = command[5:].split(' ', 1)
                if len(parts) == 2 and parts[0] in self.angels:
                    angel, message = parts
                    self.send_to_angel(angel, message)
                    print(f"✓ Sent to {angel}: {message}")
            elif command.startswith("chat "):
                angel = command[5:]
                if angel in self.angels:
                    self.direct_chat(angel)
            elif command == "emergency":
                self.emergency_screenshot()
            else:
                print("Unknown command. Try: status, read [angel], send [angel] [message], chat [angel], emergency, quit")
                print("Prefix with '!' for direct human control (e.g., '!chat entropy')")

if __name__ == "__main__":
    conductor = AngelConductor()
    conductor.conduct()