import json
import os

# Tier mapping provided by the user
RESOURCE_TIERS = {
    "banking_services": 3,
    "blackmail_evidence": 4,
    "books": 3,
    "bread": 1,
    "bricks": 0,
    "building_materials": 0,
    "clay": 0,
    "criminal_contacts": 2,
    "cut_stone": 0,
    "disguise_materials": 2,
    "dyed_textiles": 3,
    "dyestuffs": 0,
    "fine_glassware": 4,
    "fish": 1,
    "flax": 0,
    "flour": 0,
    "forgery_tools": 3,
    "fuel": 1,
    "glass": 2,
    "gold": 4,
    "gold_leaf": 4,
    "gondola": 3,
    "grain": 0,
    "hemp": 0,
    "iron": 0,
    "iron_fittings": 0,
    "iron_ore": 0,
    "jewelry": 4,
    "limestone": 0,
    "luxury_silk_garments": 4,
    "maps": 3,
    "marble": 4,
    "merchant_galley": 3,
    "molten_glass": 0,
    "mortar": 0,
    "murano_sand": 0,
    "olives": 2,
    "olive_oil": 2,
    "paper": 3,
    "pine_resin": 0,
    "pitch": 0,
    "poison_components": 3,
    "porter_equipment": 1,
    "prepared_silk": 0,
    "preserved_fish": 2,
    "processed_iron": 0,
    "rags": 0,
    "raw_silk": 0,
    "rope": 1,
    "sailcloth": 2,
    "salt": 2,
    "sand": 0,
    "ship_components": 0,
    "silk_fabric": 3,
    "small_boats": 2,
    "smuggler_maps": 2,
    "soap": 2,
    "soda_ash": 0,
    "spiced_wine": 3,
    "stone": 0,
    "timber": 0,
    "tools": 2,
    "venetian_lace": 4,
    "war_galley": 4,
    "water": 1,
    "weapons": 3,
    "vegetables": 1,
    "cheese": 2,
    "meat": 3,
    "pastries": 3,
    "spices": 4,
    "game_meat": 4,
    "sugar_confections": 4
}

def update_resource_tiers():
    """
    Adds or updates the 'tier' field in resource JSON files.
    """
    # Assuming the script is in backend/scripts, data/resources is ../../data/resources
    script_dir = os.path.dirname(os.path.abspath(__file__))
    resources_dir = os.path.join(script_dir, '..', '..', 'data', 'resources')
    
    if not os.path.isdir(resources_dir):
        print(f"Error: Resources directory not found at {resources_dir}")
        return

    print(f"Scanning resource files in: {resources_dir}")
    updated_files = 0
    skipped_files_no_tier_info = 0
    processed_files = 0

    for filename in os.listdir(resources_dir):
        if filename.endswith(".json"):
            processed_files += 1
            file_path = os.path.join(resources_dir, filename)
            resource_id = filename[:-5]  # Remove .json extension

            if resource_id in RESOURCE_TIERS:
                tier_value = RESOURCE_TIERS[resource_id]
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    data['tier'] = tier_value
                    
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    print(f"Updated tier for '{filename}' to {tier_value}.")
                    updated_files += 1
                except json.JSONDecodeError:
                    print(f"Error: Could not decode JSON from '{filename}'. Skipping.")
                except Exception as e:
                    print(f"Error processing file '{filename}': {e}. Skipping.")
            else:
                print(f"Warning: No tier information found for '{resource_id}' ('{filename}'). Skipping.")
                skipped_files_no_tier_info +=1

    print(f"\n--- Summary ---")
    print(f"Processed {processed_files} JSON files.")
    print(f"Successfully updated {updated_files} files with tier information.")
    print(f"Skipped {skipped_files_no_tier_info} files due to missing tier information in the script.")

if __name__ == "__main__":
    update_resource_tiers()
