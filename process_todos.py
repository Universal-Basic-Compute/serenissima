#!/usr/bin/env python3
# Make sure this file has executable permissions (chmod +x process_todos.py)
import json
import subprocess
import os
import time
from pathlib import Path

# Function to mark a task as done
def mark_todo_as_done(todo_id):
    done_file = 'todos_done.json'
    done_todos = []
    
    # Load existing done TODOs if file exists
    if os.path.exists(done_file):
        try:
            with open(done_file, 'r') as f:
                done_todos = json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: Could not parse {done_file}, creating new file")
            done_todos = []
    
    # Add the new TODO ID if not already in the list
    if todo_id not in done_todos:
        done_todos.append(todo_id)
        
        # Save the updated list
        with open(done_file, 'w') as f:
            json.dump(done_todos, f, indent=2)
        
        print(f"Marked TODO {todo_id} as done")
    else:
        print(f"TODO {todo_id} was already marked as done")

# Function to check if a task is done
def is_todo_done(todo_id):
    done_file = 'todos_done.json'
    
    if not os.path.exists(done_file):
        return False
        
    try:
        with open(done_file, 'r') as f:
            done_todos = json.load(f)
            return todo_id in done_todos
    except (json.JSONDecodeError, FileNotFoundError):
        return False

# Load the TODOs from the JSON file
def load_todos():
    with open('todos.json', 'r') as f:
        return json.load(f)

# Process TODOs in batches of 3
def process_todos(todos, batch_size=3, start_from=0):
    # Filter out already completed TODOs
    active_todos = [todo for todo in todos if not is_todo_done(todo.get('id', 'Unknown'))]
    
    total_todos = len(active_todos)
    if total_todos < len(todos):
        print(f"Skipping {len(todos) - total_todos} already completed TODOs")
    
    print(f"Processing {total_todos} TODOs in batches of {batch_size}, starting from index {start_from}...")

    # Create log file if it doesn't exist
    if not os.path.exists('todo_progress.log'):
        with open('todo_progress.log', 'w') as log_file:
            log_file.write(f"TODO Processing Log - Started at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            log_file.write(f"Total TODOs: {total_todos}, Batch Size: {batch_size}, Starting Index: {start_from}\n\n")

    for i in range(start_from, total_todos, batch_size):
        batch = active_todos[i:i+batch_size]
        batch_num = i//batch_size + 1
        total_batches = (total_todos + batch_size - 1)//batch_size
        
        print(f"\n{'='*80}")
        print(f"Processing batch {batch_num} of {total_batches} (TODOs {i+1}-{min(i+batch_size, total_todos)} of {total_todos})")
        
        with open('todo_progress.log', 'a') as log_file:
            log_file.write(f"Starting batch {batch_num} of {total_batches} at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")

        for j, todo in enumerate(batch):
            todo_index = i + j
            print(f"\nProcessing TODO {todo_index + 1}/{total_todos}: {todo.get('id', 'Unknown')}")
            process_todo(todo)
            
            # Save current progress to a file so we can resume if needed
            with open('todo_last_processed.txt', 'w') as f:
                f.write(str(todo_index + 1))
                
            # Add a short delay between TODOs to avoid overwhelming the system
            if j < len(batch) - 1:  # Don't delay after the last item in batch
                print(f"Waiting 2 seconds before next TODO...")
                time.sleep(2)

        # Add a longer delay between batches
        if i + batch_size < total_todos:  # Don't delay after the last batch
            print(f"Completed batch {batch_num}. Waiting 10 seconds before next batch...")
            
            with open('todo_progress.log', 'a') as log_file:
                log_file.write(f"Completed batch {batch_num} at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                
            time.sleep(10)

# Process a single TODO
def process_todo(todo):
    todo_id = todo.get('id', 'Unknown')
    
    # Skip if already done
    if is_todo_done(todo_id):
        print(f"Skipping TODO {todo_id} - already completed")
        return
        
    description = todo.get('description', '')
    details = todo.get('details', '')
    files = todo.get('files', [])

    print(f"\n{'-'*80}")
    print(f"Processing TODO: {todo_id}")
    print(f"Description: {description}")
    print(f"Files: {', '.join(files)}")

    # Verify files exist
    valid_files = []
    missing_files = []
    for file in files:
        if Path(file).exists():
            valid_files.append(file)
        else:
            missing_files.append(file)
            print(f"Warning: File {file} does not exist")
    
    # Check if we have enough valid files to proceed
    if not valid_files:
        print(f"Error: No valid files found for TODO {todo_id}, skipping")
        return
    
    # Log missing files but continue if we have at least some valid files
    if missing_files:
        print(f"Note: {len(missing_files)} files were not found but continuing with {len(valid_files)} valid files")
    
    # Check if we need to create any directories for missing files
    for file in missing_files:
        dir_path = os.path.dirname(file)
        if dir_path and not os.path.exists(dir_path):
            try:
                os.makedirs(dir_path, exist_ok=True)
                print(f"Created directory: {dir_path}")
            except Exception as e:
                print(f"Error creating directory {dir_path}: {e}")

    # Construct the Aider command
    message = f"{description}\n\n{details}\n\nProcess the task autonomously without asking for confirmation." if details else f"{description}\n\nProcess the task autonomously without asking for confirmation."
    aider_cmd = ["aider", "--message", message, "--yes-always"]

    # Add files to modify
    for file in valid_files:
        aider_cmd.extend(["--file", file])

    # Execute Aider command with streaming output
    print(f"Executing: {' '.join(aider_cmd)}")
    try:
        # Replace the subprocess.run with Popen to stream output
        process = subprocess.Popen(
            aider_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1  # Line buffered
        )
        
        print("\nAider Output (streaming):")
        
        # Stream stdout in real-time
        stdout_lines = []
        for line in iter(process.stdout.readline, ''):
            print(line, end='')  # Print to console in real-time
            stdout_lines.append(line)
            
            # Optionally log to file in real-time
            with open('aider_output.log', 'a') as log_file:
                log_file.write(line)
        
        # Get stderr after process completes
        stderr = process.stderr.read()
        
        # Wait for process to complete and get return code
        return_code = process.wait()
        
        # Store the complete output
        stdout = ''.join(stdout_lines)
        
        if stderr:
            print("\nAider Errors:")
            print(stderr)

        # Check return code
        if return_code != 0:
            print(f"Warning: Aider exited with code {return_code}")
        else:
            print(f"Successfully processed TODO {todo_id}")
            mark_todo_as_done(todo_id)
            
        # Log completion to a file
        with open('todo_progress.log', 'a') as log_file:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            log_file.write(f"{timestamp} - {todo_id}: {'Success' if return_code == 0 else 'Failed'}\n")

    except Exception as e:
        print(f"Error executing Aider: {e}")
        with open('todo_progress.log', 'a') as log_file:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            log_file.write(f"{timestamp} - {todo_id}: Error - {str(e)}\n")

# Main function
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Process TODOs from a JSON file')
    parser.add_argument('--batch-size', type=int, default=3, help='Number of TODOs to process in each batch')
    parser.add_argument('--start-from', type=int, default=0, help='Index of the first TODO to process')
    parser.add_argument('--resume', action='store_true', help='Resume from last processed TODO')
    parser.add_argument('--todo-id', type=str, help='Process a specific TODO by ID')
    args = parser.parse_args()
    
    todos = load_todos()
    
    # Process a specific TODO by ID
    if args.todo_id:
        for todo in todos:
            if todo.get('id') == args.todo_id:
                print(f"Processing single TODO: {args.todo_id}")
                process_todo(todo)
                return
        print(f"Error: TODO with ID {args.todo_id} not found")
        return
    
    # Resume from last processed TODO
    start_index = args.start_from
    if args.resume:
        try:
            with open('todo_last_processed.txt', 'r') as f:
                start_index = int(f.read().strip())
                print(f"Resuming from TODO #{start_index}")
        except FileNotFoundError:
            print("No saved progress found, starting from the beginning")
        except ValueError:
            print("Invalid saved progress, starting from the beginning")
    
    process_todos(todos, args.batch_size, start_index)
    print("\nAll TODOs processed!")
    
    # Mark completion in log
    with open('todo_progress.log', 'a') as log_file:
        log_file.write(f"\nProcessing completed at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")

if __name__ == "__main__":
    main()
