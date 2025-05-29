import os
import json
import glob

# Define the directory containing the resource JSON files
RESOURCES_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'resources')
MULTIPLIER = 75

def multiply_lifetime_hours():
    """
    Multiplies the 'lifetimeHours' field by a constant in all JSON files
    within the data/resources/ directory.
    """
    print(f"Starting to process JSON files in: {RESOURCES_DIR}")
    print(f"Multiplying 'lifetimeHours' by: {MULTIPLIER}\n")

    json_files = glob.glob(os.path.join(RESOURCES_DIR, '*.json'))

    if not json_files:
        print("No JSON files found in the directory.")
        return

    modified_files_count = 0
    for file_path in json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if 'lifetimeHours' in data and isinstance(data['lifetimeHours'], (int, float)):
                original_value = data['lifetimeHours']
                data['lifetimeHours'] = original_value * MULTIPLIER
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                print(f"Modified '{os.path.basename(file_path)}': lifetimeHours changed from {original_value} to {data['lifetimeHours']}")
                modified_files_count += 1
            elif 'lifetimeHours' in data:
                print(f"Skipped '{os.path.basename(file_path)}': 'lifetimeHours' is not a number (value: {data['lifetimeHours']}).")
            else:
                # print(f"Skipped '{os.path.basename(file_path)}': 'lifetimeHours' field not found.")
                pass # Silently skip if field not found to reduce noise

        except json.JSONDecodeError:
            print(f"Error decoding JSON from file: {file_path}")
        except Exception as e:
            print(f"An error occurred while processing file {file_path}: {e}")

    print(f"\nProcessing complete. Modified {modified_files_count} files out of {len(json_files)} JSON files found.")

if __name__ == "__main__":
    multiply_lifetime_hours()
