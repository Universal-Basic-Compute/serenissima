import os
import json

# Data provided by the user
LIFETIME_DATA = {
  "banking_services": {"lifetimeHours": None, "consumptionHours": 10},
  "blackmail_evidence": {"lifetimeHours": None, "consumptionHours": None},
  "books": {"lifetimeHours": None, "consumptionHours": 1168},
  "bread": {"lifetimeHours": 1, "consumptionHours": 1},
  "bricks": {"lifetimeHours": None, "consumptionHours": None},
  "building_materials": {"lifetimeHours": None, "consumptionHours": None},
  "clay": {"lifetimeHours": None, "consumptionHours": None},
  "criminal_contacts": {"lifetimeHours": None, "consumptionHours": None},
  "cut_stone": {"lifetimeHours": None, "consumptionHours": None},
  "disguise_materials": {"lifetimeHours": 117, "consumptionHours": 10},
  "dyed_textiles": {"lifetimeHours": 584, "consumptionHours": 117},
  "dyestuffs": {"lifetimeHours": 234, "consumptionHours": None},
  "fine_glassware": {"lifetimeHours": None, "consumptionHours": 584},
  "fish": {"lifetimeHours": 1, "consumptionHours": 1},
  "flax": {"lifetimeHours": 234, "consumptionHours": None},
  "flour": {"lifetimeHours": 29, "consumptionHours": 10},
  "forgery_tools": {"lifetimeHours": None, "consumptionHours": 117},
  "fuel": {"lifetimeHours": 117, "consumptionHours": 2},
  "glass": {"lifetimeHours": None, "consumptionHours": 234},
  "gold": {"lifetimeHours": None, "consumptionHours": None},
  "gold_leaf": {"lifetimeHours": None, "consumptionHours": 117},
  "gondola": {"lifetimeHours": None, "consumptionHours": 1168},
  "grain": {"lifetimeHours": 117, "consumptionHours": 10},
  "hemp": {"lifetimeHours": 234, "consumptionHours": None},
  "iron": {"lifetimeHours": None, "consumptionHours": None},
  "iron_fittings": {"lifetimeHours": None, "consumptionHours": None},
  "iron_ore": {"lifetimeHours": None, "consumptionHours": None},
  "jewelry": {"lifetimeHours": None, "consumptionHours": 2336},
  "limestone": {"lifetimeHours": None, "consumptionHours": None},
  "luxury_silk_garments": {"lifetimeHours": 1168, "consumptionHours": 234},
  "maps": {"lifetimeHours": None, "consumptionHours": 584},
  "marble": {"lifetimeHours": None, "consumptionHours": None},
  "merchant_galley": {"lifetimeHours": None, "consumptionHours": 1168},
  "molten_glass": {"lifetimeHours": 1, "consumptionHours": None},
  "mortar": {"lifetimeHours": 2, "consumptionHours": None},
  "murano_sand": {"lifetimeHours": None, "consumptionHours": None},
  "olives": {"lifetimeHours": 10, "consumptionHours": 4},
  "olive_oil": {"lifetimeHours": 234, "consumptionHours": 19},
  "paper": {"lifetimeHours": 234, "consumptionHours": 10},
  "pine_resin": {"lifetimeHours": 234, "consumptionHours": None},
  "pitch": {"lifetimeHours": 350, "consumptionHours": None},
  "poison_components": {"lifetimeHours": 117, "consumptionHours": None},
  "porter_equipment": {"lifetimeHours": 234, "consumptionHours": 58},
  "prepared_silk": {"lifetimeHours": 350, "consumptionHours": None},
  "preserved_fish": {"lifetimeHours": 58, "consumptionHours": 2},
  "processed_iron": {"lifetimeHours": None, "consumptionHours": None},
  "rags": {"lifetimeHours": 117, "consumptionHours": None},
  "raw_silk": {"lifetimeHours": 350, "consumptionHours": None},
  "rope": {"lifetimeHours": 117, "consumptionHours": 58},
  "sailcloth": {"lifetimeHours": 350, "consumptionHours": 117},
  "salt": {"lifetimeHours": None, "consumptionHours": 29},
  "sand": {"lifetimeHours": None, "consumptionHours": None},
  "ship_components": {"lifetimeHours": None, "consumptionHours": None},
  "silk_fabric": {"lifetimeHours": 584, "consumptionHours": 117},
  "small_boats": {"lifetimeHours": None, "consumptionHours": 584},
  "smuggler_maps": {"lifetimeHours": None, "consumptionHours": None},
  "soap": {"lifetimeHours": 117, "consumptionHours": 10},
  "soda_ash": {"lifetimeHours": None, "consumptionHours": None},
  "spiced_wine": {"lifetimeHours": 584, "consumptionHours": 4},
  "stone": {"lifetimeHours": None, "consumptionHours": None},
  "timber": {"lifetimeHours": 584, "consumptionHours": None},
  "tools": {"lifetimeHours": None, "consumptionHours": 350},
  "venetian_lace": {"lifetimeHours": None, "consumptionHours": 350},
  "war_galley": {"lifetimeHours": None, "consumptionHours": 1168},
  "water": {"lifetimeHours": 2, "consumptionHours": 1},
  "weapons": {"lifetimeHours": None, "consumptionHours": 1168},
  "wine": {"lifetimeHours": 1168, "consumptionHours": 2}
}

RESOURCES_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'resources')

def update_resource_files():
    """
    Adds lifetimeHours and consumptionHours to resource JSON files.
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
                data["lifetimeHours"] = LIFETIME_DATA[resource_id]["lifetimeHours"]
                data["consumptionHours"] = LIFETIME_DATA[resource_id]["consumptionHours"]
                
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
