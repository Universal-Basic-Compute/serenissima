#!/usr/bin/env python3
"""
CASCADE Workroom Monitor
Watches for file changes and injects them as messages to citizens in the room
Enables real-time n-to-n communication between citizens
"""

import os
import json
import time
import requests
from pathlib import Path
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import hashlib

class WorkroomHandler(FileSystemEventHandler):
    def __init__(self, room_name):
        self.room_name = room_name
        self.api_base = "https://serenissima.ai/api"
        self.last_hashes = {}
        
    def get_citizens_in_room(self):
        """Fetch all citizens currently in this room"""
        try:
            response = requests.get(f"{self.api_base}/citizens")
            if response.status_code == 200:
                citizens = response.json()
                # Filter for citizens in this room
                return [c for c in citizens if c.get('Room') == self.room_name]
            else:
                print(f"Failed to fetch citizens: {response.status_code}")
                return []
        except Exception as e:
            print(f"Error fetching citizens: {e}")
            return []
    
    def inject_message_to_citizen(self, username, message):
        """Inject a message directly into a citizen's Claude project .jsonl file"""
        # Find the most recent .jsonl file
        project_path = Path(f"/home/ubuntu/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{username}")
        
        if not project_path.exists():
            print(f"Project path not found for {username}")
            return False
            
        # Get most recent .jsonl file
        jsonl_files = sorted(project_path.glob("*.jsonl"), key=lambda x: x.stat().st_mtime, reverse=True)
        
        if not jsonl_files:
            print(f"No .jsonl files found for {username}")
            return False
            
        most_recent = jsonl_files[0]
        
        # Create the message entry
        message_entry = {
            "type": "text",
            "text": f"\n[WORKROOM UPDATE - {self.room_name}]\n{message}\n",
            "ts": datetime.now().isoformat()
        }
        
        try:
            # Append to the .jsonl file
            with open(most_recent, 'a') as f:
                f.write(json.dumps(message_entry) + '\n')
            print(f"✓ Injected message to {username}")
            return True
        except Exception as e:
            print(f"✗ Failed to inject message to {username}: {e}")
            return False
    
    def get_file_hash(self, filepath):
        """Get hash of file contents"""
        try:
            with open(filepath, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return None
    
    def on_modified(self, event):
        if event.is_directory:
            return
            
        # Skip certain files
        if any(skip in event.src_path for skip in ['.git', '__pycache__', '.pyc', '.log']):
            return
            
        # Check if file actually changed (not just metadata)
        current_hash = self.get_file_hash(event.src_path)
        if current_hash == self.last_hashes.get(event.src_path):
            return
        self.last_hashes[event.src_path] = current_hash
        
        # Get relative path for cleaner messages
        rel_path = os.path.relpath(event.src_path, start=f"/mnt/c/Users/reyno/universe-engine/serenissima/cascade/workrooms/{self.room_name}")
        
        print(f"\n📝 File changed: {rel_path}")
        
        # Read the changed file content (if it's text)
        try:
            with open(event.src_path, 'r') as f:
                content = f.read()
                
            # Create update message
            if len(content) < 500:
                message = f"File updated: {rel_path}\n\nContent:\n{content}"
            else:
                message = f"File updated: {rel_path}\n\n(Large file - showing first 500 chars)\n{content[:500]}..."
                
        except Exception:
            message = f"File updated: {rel_path} (binary or unreadable)"
        
        # Get citizens in room and inject message
        citizens = self.get_citizens_in_room()
        
        if citizens:
            print(f"🏛️ Broadcasting to {len(citizens)} citizens in {self.room_name}")
            for citizen in citizens:
                self.inject_message_to_citizen(citizen['Username'], message)
        else:
            print(f"⚠️ No citizens currently in {self.room_name}")

def monitor_workroom(room_name):
    """Monitor a specific workroom for changes"""
    workroom_path = f"/mnt/c/Users/reyno/universe-engine/serenissima/cascade/workrooms/{room_name}"
    
    if not os.path.exists(workroom_path):
        print(f"Workroom {room_name} not found at {workroom_path}")
        return
        
    print(f"🔍 Monitoring workroom: {room_name}")
    print(f"📁 Path: {workroom_path}")
    
    event_handler = WorkroomHandler(room_name)
    observer = Observer()
    observer.schedule(event_handler, workroom_path, recursive=True)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\n👋 Workroom monitor stopped")
    observer.join()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        room_name = sys.argv[1]
    else:
        room_name = "reddit"
        
    monitor_workroom(room_name)