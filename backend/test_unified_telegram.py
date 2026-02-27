#!/usr/bin/env python3
"""
Test script for the Unified Telegram Service
"""

import os
import json
import time
from datetime import datetime
from pathlib import Path

def check_service_running():
    """Check if the unified service is running"""
    pid_file = "telegram_unified.pid"
    if os.path.exists(pid_file):
        with open(pid_file, 'r') as f:
            pid = f.read().strip()
        # Check if process exists
        try:
            os.kill(int(pid), 0)
            return True, pid
        except Exception:
            pass
    return False, None

def check_last_update():
    """Check the last update ID"""
    update_file = "telegram_unified_last_update.json"
    if os.path.exists(update_file):
        with open(update_file, 'r') as f:
            data = json.load(f)
            return data.get('last_update_id', 0)
    return 0

def check_workroom_monitors():
    """Check if workroom directories are being monitored"""
    workrooms = {
        "alignment": "/mnt/c/Users/reyno/universe-engine/serenissima/cascade/workrooms/alignment",
        "reddit": "/mnt/c/Users/reyno/universe-engine/serenissima/cascade/workrooms/reddit"
    }
    
    status = {}
    for room, path in workrooms.items():
        status[room] = os.path.exists(path)
    
    return status

def check_citizen_projects():
    """Check if citizen Claude projects exist"""
    # Sample citizens to check
    test_citizens = ["diplomatic_virtuoso", "mechanical_visionary", "Italia"]
    
    found = []
    for citizen in test_citizens:
        paths = [
            Path(f"/home/ubuntu/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{citizen}"),
            Path(os.path.expanduser(f"~/.claude/projects/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{citizen}"))
        ]
        
        for path in paths:
            if path.exists():
                found.append(citizen)
                break
    
    return found

def main():
    print("🔍 Unified Telegram Service Test")
    print("=" * 50)
    
    # Check if service is running
    running, pid = check_service_running()
    if running:
        print(f"✓ Service is running (PID: {pid})")
    else:
        print("❌ Service is not running")
        print("  Run: ./start_telegram_unified.sh")
        return
    
    # Check last update ID
    last_update = check_last_update()
    print(f"✓ Last Telegram update ID: {last_update}")
    
    # Check workroom monitoring
    print("\n📂 Workroom Monitoring:")
    workrooms = check_workroom_monitors()
    for room, exists in workrooms.items():
        status = "✓" if exists else "❌"
        print(f"  {status} {room}: {'exists' if exists else 'missing'}")
    
    # Check citizen projects
    print("\n👥 Citizen Claude Projects:")
    citizens = check_citizen_projects()
    if citizens:
        print(f"  ✓ Found {len(citizens)} citizen projects")
        for citizen in citizens:
            print(f"    • {citizen}")
    else:
        print("  ❌ No citizen projects found")
    
    # Check log file
    log_file = "telegram_unified.log"
    if os.path.exists(log_file):
        # Get last 10 lines
        with open(log_file, 'r') as f:
            lines = f.readlines()
            recent = lines[-10:] if len(lines) > 10 else lines
        
        print(f"\n📄 Recent log entries:")
        for line in recent:
            print(f"  {line.strip()}")
    
    print("\n✅ Test complete!")
    print("\nTo test message bridging:")
    print("1. Send a message in the Telegram group")
    print("2. Check if it appears in citizen conversations")
    print("3. Create a file in a workroom directory")
    print("4. Check if it's announced in Telegram")

if __name__ == "__main__":
    main()