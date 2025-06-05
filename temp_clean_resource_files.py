import os
import json
import glob

def clean_resource_files():
    """
    Iterates through all JSON files in data/resources/ and removes
    the 'icon', 'variants', and 'varieties' fields if they exist.
    """
    resource_dir = os.path.join('data', 'resources')
    json_files = glob.glob(os.path.join(resource_dir, '*.json'))
    
    if not json_files:
        print(f"No JSON files found in {resource_dir}")
        return

    print(f"Found {len(json_files)} JSON files to process in {resource_dir}...")

    fields_to_remove = ['icon', 'variants', 'varieties']
    files_changed_count = 0

    for file_path in json_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            original_data_str = json.dumps(data) # For comparison later
            changed = False

            if isinstance(data, list): # Handle cases where the root is a list of objects
                for item in data:
                    if isinstance(item, dict):
                        for field in fields_to_remove:
                            if field in item:
                                del item[field]
                                changed = True
            elif isinstance(data, dict): # Handle cases where the root is a single object
                for field in fields_to_remove:
                    if field in data:
                        del data[field]
                        changed = True
            else:
                print(f"Skipping {file_path}: Root is not a list or dict.")
                continue

            if changed:
                # Check if data actually changed (e.g. fields were present)
                # This avoids re-writing files unnecessarily if fields were already absent
                if json.dumps(data) != original_data_str:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False) # ensure_ascii=False for non-ASCII chars
                    print(f"Cleaned and updated: {file_path}")
                    files_changed_count += 1
                else:
                    print(f"No relevant fields to remove in: {file_path} (already clean or fields not present)")
            else:
                 print(f"No changes made to: {file_path} (fields not present)")


        except json.JSONDecodeError:
            print(f"Error decoding JSON from {file_path}. Skipping.")
        except Exception as e:
            print(f"An error occurred while processing {file_path}: {e}")

    print(f"\nProcessing complete. {files_changed_count} file(s) were modified.")

if __name__ == "__main__":
    clean_resource_files()
