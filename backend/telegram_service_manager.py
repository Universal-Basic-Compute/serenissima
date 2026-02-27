#!/usr/bin/env python3
"""
Telegram Service Manager - Ensures only one instance runs
Prevents message duplication issues
"""

import os
import sys
import fcntl
import signal
import subprocess
import time
from pathlib import Path

LOCK_FILE = '/tmp/telegram_unified_service.lock'
PID_FILE = '/tmp/telegram_unified_service.pid'

def kill_all_instances():
    """Kill all existing telegram service instances"""
    # Find all processes
    result = subprocess.run(['pgrep', '-f', 'telegram_unified_service.py'], 
                          capture_output=True, text=True)
    
    if result.returncode == 0:
        pids = result.stdout.strip().split('\n')
        print(f"Found {len(pids)} existing instances to kill")
        
        for pid in pids:
            if pid:
                try:
                    os.kill(int(pid), signal.SIGTERM)
                    print(f"Killed PID {pid}")
                except ProcessLookupError:
                    pass
        
        # Wait for processes to die
        time.sleep(2)
        
        # Force kill any remaining
        result = subprocess.run(['pgrep', '-f', 'telegram_unified_service.py'], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            remaining_pids = result.stdout.strip().split('\n')
            for pid in remaining_pids:
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGKILL)
                        print(f"Force killed PID {pid}")
                    except ProcessLookupError:
                        pass

def start_service():
    """Start telegram service with single instance protection"""
    # Kill all existing instances first
    kill_all_instances()
    
    # Create lock file
    lock_file = open(LOCK_FILE, 'w')
    
    try:
        # Try to acquire exclusive lock
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        
        # Start the service
        print("Starting Telegram Unified Service (single instance)...")
        
        # Get the service path
        service_path = Path(__file__).parent / 'telegram_unified_service.py'
        
        # Start as subprocess
        process = subprocess.Popen([sys.executable, str(service_path)],
                                 stdout=sys.stdout,
                                 stderr=sys.stderr)
        
        # Save PID
        with open(PID_FILE, 'w') as f:
            f.write(str(process.pid))
        
        print(f"Service started with PID {process.pid}")
        
        # Wait for process to complete
        process.wait()
        
    except IOError:
        print("Another instance is already running!")
        sys.exit(1)
    finally:
        # Clean up
        try:
            os.unlink(PID_FILE)
        except Exception:
            pass
        lock_file.close()

def stop_service():
    """Stop the telegram service"""
    kill_all_instances()
    
    # Clean up files
    for file_path in [LOCK_FILE, PID_FILE]:
        try:
            os.unlink(file_path)
        except Exception:
            pass
    
    print("Service stopped")

def restart_service():
    """Restart the service"""
    print("Restarting service...")
    stop_service()
    time.sleep(2)
    start_service()

def status():
    """Check service status"""
    result = subprocess.run(['pgrep', '-f', 'telegram_unified_service.py'], 
                          capture_output=True, text=True)
    
    if result.returncode == 0:
        pids = result.stdout.strip().split('\n')
        print(f"Service is running ({len(pids)} instances):")
        for pid in pids:
            if pid:
                print(f"  PID: {pid}")
        
        if len(pids) > 1:
            print("⚠️  WARNING: Multiple instances detected! Use 'restart' to fix.")
    else:
        print("Service is not running")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: telegram_service_manager.py {start|stop|restart|status}")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'start':
        start_service()
    elif command == 'stop':
        stop_service()
    elif command == 'restart':
        restart_service()
    elif command == 'status':
        status()
    else:
        print(f"Unknown command: {command}")
        print("Usage: telegram_service_manager.py {start|stop|restart|status}")