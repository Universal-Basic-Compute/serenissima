import os
import json

# Data provided by the user
LIFETIME_DATA = {
  "banking_services": {"lifetime_hours": None, "consumption_hours": 720},
  "blackmail_evidence": {"lifetime_hours": None, "consumption_hours": None},
  "books": {"lifetime_hours": None, "consumption_hours": 87600},
  "bread": {"lifetime_hours": 72, "consumption_hours": 24},
  "bricks": {"lifetime_hours": None, "consumption_hours": None},
  "building_materials": {"lifetime_hours": None, "consumption_hours": None},
  "clay": {"lifetime_hours": None, "consumption_hours": None},
  "criminal_contacts": {"lifetime_hours": None, "consumption_hours": None},
  "cut_stone": {"lifetime_hours": None, "consumption_hours": None},
  "disguise_materials": {"lifetime_hours": 8760, "consumption_hours": 720},
  "dyed_textiles": {"lifetime_hours": 43800, "consumption_hours": 8760},
  "dyestuffs": {"lifetime_hours": 17520, "consumption_hours": None},
  "fine_glassware": {"lifetime_hours": None, "consumption_hours": 43800},
  "fish": {"lifetime_hours": 48, "consumption_hours": 24},
  "flax": {"lifetime_hours": 17520, "consumption_hours": None},
  "flour": {"lifetime_hours": 2160, "consumption_hours": 720},
  "forgery_tools": {"lifetime_hours": None, "consumption_hours": 8760},
  "fuel": {"lifetime_hours": 8760, "consumption_hours": 168},
  "glass": {"lifetime_hours": None, "consumption_hours": 17520},
  "gold": {"lifetime_hours": None, "consumption_hours": None},
  "gold_leaf": {"lifetime_hours": None, "consumption_hours": 8760},
  "gondola": {"lifetime_hours": None, "consumption_hours": 87600},
  "grain": {"lifetime_hours": 8760, "consumption_hours": 720},
  "hemp": {"lifetime_hours": 17520, "consumption_hours": None},
  "iron": {"lifetime_hours": None, "consumption_hours": None},
  "iron_fittings": {"lifetime_hours": None, "consumption_hours": None},
  "iron_ore": {"lifetime_hours": None, "consumption_hours": None},
  "jewelry": {"lifetime_hours": None, "consumption_hours": 175200},
  "limestone": {"lifetime_hours": None, "consumption_hours": None},
  "luxury_silk_garments": {"lifetime_hours": 87600, "consumption_hours": 17520},
  "maps": {"lifetime_hours": None, "consumption_hours": 43800},
  "marble": {"lifetime_hours": None, "consumption_hours": None},
  "merchant_galley": {"lifetime_hours": None, "consumption_hours": 87600},
  "molten_glass": {"lifetime_hours": 1, "consumption_hours": None},
  "mortar": {"lifetime_hours": 168, "consumption_hours": None},
  "murano_sand": {"lifetime_hours": None, "consumption_hours": None},
  "olives": {"lifetime_hours": 720, "consumption_hours": 336},
  "olive_oil": {"lifetime_hours": 17520, "consumption_hours": 1440},
  "paper": {"lifetime_hours": 17520, "consumption_hours": 720},
  "pine_resin": {"lifetime_hours": 17520, "consumption_hours": None},
  "pitch": {"lifetime_hours": 26280, "consumption_hours": None},
  "poison_components": {"lifetime_hours": 8760, "consumption_hours": None},
  "porter_equipment": {"lifetime_hours": 17520, "consumption_hours": 4320},
  "prepared_silk": {"lifetime_hours": 26280, "consumption_hours": None},
  "preserved_fish": {"lifetime_hours": 4320, "consumption_hours": 168},
  "processed_iron": {"lifetime_hours": None, "consumption_hours": None},
  "rags": {"lifetime_hours": 8760, "consumption_hours": None},
  "raw_silk": {"lifetime_hours": 26280, "consumption_hours": None},
  "rope": {"lifetime_hours": 8760, "consumption_hours": 4320},
  "sailcloth": {"lifetime_hours": 26280, "consumption_hours": 8760},
  "salt": {"lifetime_hours": None, "consumption_hours": 2160},
  "sand": {"lifetime_hours": None, "consumption_hours": None},
  "ship_components": {"lifetime_hours": None, "consumption_hours": None},
  "silk_fabric": {"lifetime_hours": 43800, "consumption_hours": 8760},
  "small_boats": {"lifetime_hours": None, "consumption_hours": 43800},
  "smuggler_maps": {"lifetime_hours": None, "consumption_hours": None},
  "soap": {"lifetime_hours": 8760, "consumption_hours": 720},
  "soda_ash": {"lifetime_hours": None, "consumption_hours": None},
  "spiced_wine": {"lifetime_hours": 43800, "consumption_hours": 336},
  "stone": {"lifetime_hours": None, "consumption_hours": None},
  "timber": {"lifetime_hours": 43800, "consumption_hours": None},
  "tools": {"lifetime_hours": None, "consumption_hours": 26280},
  "venetian_lace": {"lifetime_hours": None, "consumption_hours": 26280},
  "war_galley": {"lifetime_hours": None, "consumption_hours": 87600},
  "water": {"lifetime_hours": 168, "consumption_hours": 24},
  "weapons": {"lifetime_hours": None, "consumption_hours": 87600},
  "wine": {"lifetime_hours": 87600, "consumption_hours": 168}
}

RESOURCES_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'resources')

def update_resource_files():
    """
    Adds lifetime_hours and consumption_hours to resource JSON files.
    """
    if not os.path.isdir(RESOURCES_DIR):
        print(f"Error: Directory not found: {RESOURCES_DIR}")
        return

    updated_files_count = 0
    for filename in os.listdir(RESOURCES_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(RESOURCES_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception as e:
                print(f"Error reading {filepath}: {e}")
                continue

            resource_id = data.get("id")
            if not resource_id:
                print(f"Warning: No 'id' field in {filepath}. Skipping.")
                continue

            if resource_id in LIFETIME_DATA:
                data["lifetime_hours"] = LIFETIME_DATA[resource_id]["lifetime_hours"]
                data["consumption_hours"] = LIFETIME_DATA[resource_id]["consumption_hours"]
                
                try:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    print(f"Updated {filepath} with lifetime and consumption hours.")
                    updated_files_count += 1
                except Exception as e:
                    print(f"Error writing to {filepath}: {e}")
            else:
                print(f"Warning: No lifetime data found for resource id '{resource_id}' in {filepath}. Skipping.")
    
    print(f"\nUpdate complete. {updated_files_count} files were modified.")

if __name__ == "__main__":
    update_resource_files()
