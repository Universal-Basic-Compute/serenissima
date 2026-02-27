#!/usr/bin/env python3
"""Simple test script to verify PostToolUse hook execution"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path

def main():
    # Log that the hook was called
    log_file = Path("/tmp/hook_test.log")
    
    with open(log_file, "a") as f:
        f.write(f"\n=== HOOK CALLED AT {datetime.now()} ===\n")
        f.write(f"Working directory: {os.getcwd()}\n")
        f.write(f"Args: {sys.argv}\n")
        
        # Try to read stdin (hook input)
        try:
            if not sys.stdin.isatty():
                stdin_data = sys.stdin.read()
                f.write(f"STDIN data: {stdin_data}\n")
                
                # Try to parse as JSON
                try:
                    data = json.loads(stdin_data)
                    f.write(f"Parsed JSON: {json.dumps(data, indent=2)}\n")
                except Exception:
                    f.write("STDIN data is not valid JSON\n")
            else:
                f.write("No STDIN data available\n")
        except Exception as e:
            f.write(f"Error reading STDIN: {e}\n")
        
        # Check environment
        f.write(f"Environment variables:\n")
        for key, value in os.environ.items():
            if 'CLAUDE' in key or 'HOOK' in key:
                f.write(f"  {key}={value}\n")
        
        f.write("=== END HOOK LOG ===\n")

if __name__ == "__main__":
    main()