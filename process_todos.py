#!/usr/bin/env python3
import json
import subprocess
import os
import time
from pathlib import Path

# Load the TODOs from the JSON file
def load_todos():
    with open('todos.json', 'r') as f:
        return json.load(f)

# Process TODOs in batches of 3
def process_todos(todos, batch_size=3):
    total_todos = len(todos)
    print(f"Processing {total_todos} TODOs in batches of {batch_size}...")

    for i in range(0, total_todos, batch_size):
        batch = todos[i:i+batch_size]
        print(f"\n{'='*80}\nProcessing batch {i//batch_size + 1} of {(total_todos +
batch_size - 1)//batch_size}")

        for todo in batch:
            process_todo(todo)
            # Add a short delay between TODOs to avoid overwhelming the system
            time.sleep(2)

        # Add a longer delay between batches
        print(f"Completed batch {i//batch_size + 1}. Waiting before next batch...")
        time.sleep(10)

# Process a single TODO
def process_todo(todo):
    todo_id = todo.get('id', 'Unknown')
    description = todo.get('description', '')
    details = todo.get('details', '')
    files = todo.get('files', [])

    print(f"\n{'-'*80}")
    print(f"Processing TODO: {todo_id}")
    print(f"Description: {description}")
    print(f"Files: {', '.join(files)}")

    # Verify files exist
    valid_files = []
    for file in files:
        if Path(file).exists():
            valid_files.append(file)
        else:
            print(f"Warning: File {file} does not exist, skipping")

    if not valid_files:
        print(f"Error: No valid files found for TODO {todo_id}, skipping")
        return

    # Construct the Aider command
    message = f"{description}\n\n{details}" if details else description
    aider_cmd = ["aider", "--message", message]

    # Add files to read
    for file in valid_files:
        aider_cmd.extend(["--read", file])

    # Execute Aider command
    print(f"Executing: {' '.join(aider_cmd)}")
    try:
        result = subprocess.run(aider_cmd, capture_output=True, text=True)

        # Print the output
        print("\nAider Output:")
        print(result.stdout)

        if result.stderr:
            print("\nAider Errors:")
            print(result.stderr)

        # Check return code
        if result.returncode != 0:
            print(f"Warning: Aider exited with code {result.returncode}")
        else:
            print(f"Successfully processed TODO {todo_id}")

    except Exception as e:
        print(f"Error executing Aider: {e}")

# Main function
def main():
    todos = load_todos()
    process_todos(todos)
    print("\nAll TODOs processed!")

if __name__ == "__main__":
    main()
