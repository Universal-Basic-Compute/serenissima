#!/usr/bin/env python3
"""
Script to format notifications in engine files using aider.

This script:
1. Finds all Python files in the backend/engine directory
2. For each file, calls aider with a specific message to add markdown formatting to notifications
3. Uses the --yes-always flag to automatically accept changes
"""

import os
import subprocess
import glob
import sys
from pathlib import Path

# Define the directory containing engine files
ENGINE_DIR = os.path.join('backend', 'engine')

# Define the aider message for formatting notifications
AIDER_MESSAGE = """
Please add markdown formatting to all notification content strings in this file. 
Specifically:
1. Add bold formatting (**text**) to important information like amounts, names, and key terms
2. Add emoji where appropriate (e.g., 🏠 for housing, 💰 for money/payments, 🏛️ for government)
3. Format numbers with commas for thousands
4. Make sure the notifications are clear and readable

Only modify the notification content strings, not other parts of the code.
"""

def run_aider_on_file(file_path):
    """Run aider on a specific file with the formatting message."""
    print(f"Processing {file_path}...")
    
    try:
        # Construct the aider command
        cmd = [
            "aider",
            "--message", AIDER_MESSAGE,
            "--yes-always",
            "--file", file_path
        ]
        
        # Run the command
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Check if the command was successful
        if result.returncode == 0:
            print(f"Successfully processed {file_path}")
        else:
            print(f"Error processing {file_path}: {result.stderr}")
            
        # Print aider's output for reference
        if result.stdout:
            print("Aider output:")
            print(result.stdout[:500] + "..." if len(result.stdout) > 500 else result.stdout)
            
    except Exception as e:
        print(f"Exception while processing {file_path}: {str(e)}")

def main():
    """Main function to process all engine files."""
    # Check if the engine directory exists
    if not os.path.isdir(ENGINE_DIR):
        print(f"Error: Directory {ENGINE_DIR} not found!")
        sys.exit(1)
    
    # Find all Python files in the engine directory
    python_files = glob.glob(os.path.join(ENGINE_DIR, "*.py"))
    
    # Also check subdirectories
    for subdir in os.listdir(ENGINE_DIR):
        subdir_path = os.path.join(ENGINE_DIR, subdir)
        if os.path.isdir(subdir_path):
            python_files.extend(glob.glob(os.path.join(subdir_path, "*.py")))
    
    if not python_files:
        print(f"No Python files found in {ENGINE_DIR}")
        sys.exit(1)
    
    print(f"Found {len(python_files)} Python files to process")
    
    # Process each file
    for file_path in python_files:
        run_aider_on_file(file_path)
        print("-" * 80)  # Separator between files
    
    print("All files processed!")

if __name__ == "__main__":
    main()
