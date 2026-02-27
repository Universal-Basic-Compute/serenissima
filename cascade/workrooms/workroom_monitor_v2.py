#!/usr/bin/env python3
"""
CASCADE Workroom Monitor V2
Uses a local room assignment file instead of database Room field
Watches for file changes and injects them as messages to citizens in the room
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import hashlib

class WorkroomHandler(FileSystemEventHandler):
    def __init__(self, room_name):
        self.room_name = room_name
        self.room_file = Path(__file__).parent / f"{room_name}_members.json"
        self.last_hashes = {}
        
    def get_room_members(self):
        """Get citizens assigned to this room from local file"""
        if self.room_file.exists():
            with open(self.room_file, 'r') as f:
                data = json.load(f)
                return data.get('members', [])
        return []
    
    def inject_message_to_citizen(self, username, message):
        """Inject a message directly into a citizen's Claude project .jsonl file"""
        # Claude projects are stored in home directory
        project_pattern = f"/home/ubuntu/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{username}"
        
        # Try WSL path if Linux path doesn't exist
        if not Path(project_pattern).exists():
            project_pattern = f"/mnt/c/Users/reyno/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{username}"
        
        project_path = Path(project_pattern)
        
        if not project_path.exists():
            print(f"⚠️  Project path not found for {username} at {project_path}")
            # Create a notification file instead
            notify_path = Path(f"/mnt/c/Users/reyno/universe-engine/serenissima/citizens/{username}/workroom_notification.txt")
            with open(notify_path, 'w') as f:
                f.write(f"[WORKROOM UPDATE - {self.room_name}]\n{message}\n")
            print(f"✓ Created notification file for {username}")
            return True
            
        # Get most recent .jsonl file
        jsonl_files = sorted(project_path.glob("*.jsonl"), key=lambda x: x.stat().st_mtime, reverse=True)
        
        if not jsonl_files:
            print(f"No .jsonl files found for {username}")
            return False
            
        most_recent = jsonl_files[0]
        
        # Create the message entry in Claude's format
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
        if any(skip in event.src_path for skip in ['.git', '__pycache__', '.pyc', '.log', '_members.json']):
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
        
        # Get room members and inject message
        members = self.get_room_members()
        
        if members:
            print(f"🏛️ Broadcasting to {len(members)} citizens in {self.room_name}: {', '.join(members)}")
            for username in members:
                self.inject_message_to_citizen(username, message)
        else:
            print(f"⚠️ No citizens currently in {self.room_name}")

def add_citizen_to_room(room_name, username):
    """Add a citizen to a workroom"""
    room_file = Path(__file__).parent / f"{room_name}_members.json"
    
    # Load existing members
    if room_file.exists():
        with open(room_file, 'r') as f:
            data = json.load(f)
    else:
        data = {'room': room_name, 'members': []}
    
    # Add new member if not already there
    if username not in data['members']:
        data['members'].append(username)
        
    # Save
    with open(room_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Added {username} to {room_name} workroom")

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
    
    if len(sys.argv) > 2 and sys.argv[1] == "add":
        # Add citizen to room mode
        room_name = sys.argv[2]
        username = sys.argv[3] if len(sys.argv) > 3 else None
        if username:
            add_citizen_to_room(room_name, username)
        else:
            print("Usage: python3 workroom_monitor_v2.py add <room> <username>")
    else:
        # Monitor mode
        room_name = sys.argv[1] if len(sys.argv) > 1 else "reddit"
        monitor_workroom(room_name)