import json
import os

# Tier mapping for workTier (derived from the user's original building tier list)
BUILDING_WORK_TIERS = {
    "apothecary": 3,
    "armory": 3,
    "arsenal_gate": 2,
    "arsenal_workshop": 2,
    "artisan_s_house": 2,
    "art_academy": 4,
    "bakery": 2,
    "blacksmith": 2,
    "boat_workshop": 2,
    "bottega": 2,
    "bridge": 0,
    "broker_s_office": 3,
    "butcher_shop": 2,
    "canal_house": 2,
    "canal_maintenance_office": 2,
    "cargo_landing": 1,
    "chapel": 0,
    "cistern": 0,
    "city_gate": 2,
    "clocktower": 0,
    "confectionery": 3,
    "courthouse": 3,
    "customs_house": 3,
    "dairy": 2,
    "defensive_bastion": 2,
    "doge_s_palace": 4,
    "dye_works": 2,
    "eastern_merchant_house": 3,
    "fisherman_s_cottage": 1,
    "flood_control_station": 2,
    "fondaco_dei_tedeschi": 3,
    "glassblower_workshop": 2,
    "glass_foundry": 2,
    "glass_import_house": 3,
    "goldsmith_workshop": 3,
    "gondola_station": 2,
    "granary": 2,
    "grand_canal_palace": 4,
    "guard_post": 2,
    "guild_hall": 3,
    "harbor_chain_tower": 2,
    "hidden_workshop": 2,
    "hospital": 3,
    "inn": 2,
    "luxury_bakery": 3,
    "luxury_showroom": 3,
    "market_stall": 1,
    "merceria": 3,
    "merchant_s_house": 3,
    "metal_import_warehouse": 2,
    "mint": 3,
    "naval_administration_office": 3,
    "navigation_school": 3,
    "nobili_palazzo": 4,
    "oil_press": 2,
    "paper_mill": 2,
    "parish_church": 0,
    "porter_guild_hall": 1, 
    "printing_house": 3,
    "prison": 2,
    "private_dock": 3,
    "public_archives": 3,
    "public_bath": 2,
    "public_dock": 1,
    "public_well": 0,
    "quarantine_station": 2,
    "rialto_bridge": 0,
    "secure_vault": 3,
    "shipyard": 2,
    "silk_conditioning_house": 3,
    "small_warehouse": 2,
    "smuggler_s_den": 2,
    "soap_workshop": 2,
    "spice_merchant_shop": 3,
    "spice_warehouse": 3,
    "spy_safehouse": 3,
    "st__mark_s_basilica": 0,
    "textile_import_house": 3,
    "theater": 3,
    "timber_yard": 2,
    "town_hall": 3,
    "vegetable_market": 1,
    "watchtower": 2,
    "weapons_smith": 2,
    "weighing_station": 3,
    "wine_cellar": 3
}

# New tier mapping for consumeTier
BUILDING_CONSUME_TIERS = {
    "apothecary": 3,
    "armory": 3,
    "arsenal_gate": 0,
    "arsenal_workshop": 3,
    "artisan_s_house": 2,
    "art_academy": 4,
    "bakery": 1,
    "blacksmith": 2,
    "boat_workshop": 2,
    "bottega": 2,
    "bridge": 0,
    "broker_s_office": 3,
    "butcher_shop": 3,
    "canal_house": 2,
    "canal_maintenance_office": 0,
    "cargo_landing": 2,
    "chapel": 0,
    "cistern": 0,
    "city_gate": 0,
    "clocktower": 0,
    "confectionery": 4,
    "courthouse": 0,
    "customs_house": 3,
    "dairy": 2,
    "defensive_bastion": 0,
    "doge_s_palace": 4,
    "dye_works": 3,
    "eastern_merchant_house": 3,
    "fisherman_s_cottage": 1,
    "flood_control_station": 0,
    "fondaco_dei_tedeschi": 3,
    "glassblower_workshop": 3,
    "glass_foundry": 3,
    "glass_import_house": 4,
    "goldsmith_workshop": 4,
    "gondola_station": 3,
    "granary": 2,
    "grand_canal_palace": 4,
    "guard_post": 0,
    "guild_hall": 3,
    "harbor_chain_tower": 0,
    "hidden_workshop": 2,
    "hospital": 2,
    "inn": 2,
    "luxury_bakery": 3,
    "luxury_showroom": 4,
    "market_stall": 1,
    "merceria": 3,
    "merchant_s_house": 3,
    "metal_import_warehouse": 2,
    "mint": 3,
    "naval_administration_office": 0,
    "navigation_school": 3,
    "nobili_palazzo": 4,
    "oil_press": 2,
    "paper_mill": 3,
    "parish_church": 0,
    "porter_guild_hall": 1,
    "printing_house": 3,
    "prison": 0,
    "private_dock": 3,
    "public_archives": 3,
    "public_bath": 2,
    "public_dock": 2,
    "public_well": 0,
    "quarantine_station": 0,
    "rialto_bridge": 0,
    "secure_vault": 3,
    "shipyard": 3,
    "silk_conditioning_house": 4,
    "small_warehouse": 2,
    "smuggler_s_den": 2,
    "soap_workshop": 2,
    "spice_merchant_shop": 4,
    "spice_warehouse": 3,
    "spy_safehouse": 3,
    "st__mark_s_basilica": 0,
    "textile_import_house": 3,
    "theater": 3,
    "timber_yard": 2,
    "town_hall": 0,
    "vegetable_market": 1,
    "watchtower": 0,
    "weapons_smith": 3,
    "weighing_station": 3,
    "wine_cellar": 3
}

def update_building_tiers():
    """
    Adds or updates 'buildTier', 'workTier', and 'consumeTier' fields in building JSON files.
    The existing 'tier' field will be renamed to 'buildTier'.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    buildings_dir = os.path.join(script_dir, '..', '..', 'data', 'buildings')
    
    if not os.path.isdir(buildings_dir):
        print(f"Error: Buildings directory not found at {buildings_dir}")
        return

    print(f"Scanning building files in: {buildings_dir}")
    updated_files = 0
    skipped_work_tier_info = 0
    skipped_consume_tier_info = 0
    processed_files = 0

    for filename in os.listdir(buildings_dir):
        if filename.endswith(".json"):
            processed_files += 1
            file_path = os.path.join(buildings_dir, filename)
            building_id_from_filename = filename[:-5]  # Remove .json extension

            # Normalize building_id for matching keys with apostrophes or double underscores
            normalized_building_id = building_id_from_filename.replace("_s_", "'s_").replace("__", "_")
            
            def find_matching_key(b_id, norm_b_id, tiers_dict):
                if b_id in tiers_dict:
                    return b_id
                if norm_b_id in tiers_dict:
                    return norm_b_id
                # Check for variants like 'artisan_s_house' (key) vs 'artisans_house' (filename part)
                # or 'doge_s_palace' (key) vs 'doges_palace' (filename part)
                # This handles cases where the dictionary key uses '_s_' but filename might not, or vice-versa.
                if "_s_" in b_id and b_id.replace("_s_", "s_") in tiers_dict: # e.g. filename 'artisan_s_house' to key 'artisans_house'
                     return b_id.replace("_s_", "s_")
                if "s_" in b_id and b_id.replace("s_", "_s_") in tiers_dict: # e.g. filename 'artisans_house' to key 'artisan_s_house'
                     return b_id.replace("s_", "_s_")
                # Handle cases like st__mark_s_basilica (key) vs st_mark_s_basilica (filename part)
                if "__" in b_id and b_id.replace("__", "_") in tiers_dict:
                    return b_id.replace("__", "_")
                if "_" in b_id and b_id.count("_") == 1 and b_id.replace("_", "__", 1) in tiers_dict: # only if one underscore exists
                    # This is to potentially match st_mark to st__mark, less likely but for completeness
                    pass # This case is tricky and might lead to false positives, better rely on direct key match or normalized.

                # Try matching after removing all underscores from filename and key if they are similar
                simplified_b_id = b_id.replace("_", "")
                for key_in_dict in tiers_dict.keys():
                    if key_in_dict.replace("_", "").replace("'", "") == simplified_b_id:
                        return key_in_dict
                return None

            work_tier_key = find_matching_key(building_id_from_filename, normalized_building_id, BUILDING_WORK_TIERS)
            consume_tier_key = find_matching_key(building_id_from_filename, normalized_building_id, BUILDING_CONSUME_TIERS)

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Rename existing 'tier' to 'buildTier'
                if 'tier' in data:
                    data['buildTier'] = data.pop('tier')
                    print(f"Renamed 'tier' to 'buildTier' for '{filename}'. Old value: {data['buildTier']}")
                elif 'buildTier' in data:
                    print(f"'buildTier' already exists in '{filename}'. Value: {data['buildTier']}")
                else:
                    print(f"No 'tier' or 'buildTier' found in '{filename}' to use as buildTier. 'buildTier' will be missing.")

                # Set workTier
                if work_tier_key:
                    work_tier_value = BUILDING_WORK_TIERS[work_tier_key]
                    data['workTier'] = work_tier_value
                    print(f"Set 'workTier' for '{filename}' (matched with key '{work_tier_key}') to {work_tier_value}.")
                else:
                    print(f"Warning: No workTier information found for building ID '{building_id_from_filename}' (normalized: '{normalized_building_id}') ('{filename}'). 'workTier' not set.")
                    skipped_work_tier_info += 1
                
                # Set consumeTier
                if consume_tier_key:
                    consume_tier_value = BUILDING_CONSUME_TIERS[consume_tier_key]
                    data['consumeTier'] = consume_tier_value
                    print(f"Set 'consumeTier' for '{filename}' (matched with key '{consume_tier_key}') to {consume_tier_value}.")
                else:
                    print(f"Warning: No consumeTier information found for building ID '{building_id_from_filename}' (normalized: '{normalized_building_id}') ('{filename}'). 'consumeTier' not set.")
                    skipped_consume_tier_info += 1
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                updated_files += 1

            except json.JSONDecodeError:
                print(f"Error: Could not decode JSON from '{filename}'. Skipping.")
            except Exception as e:
                print(f"Error processing file '{filename}': {e}. Skipping.")

    print(f"\n--- Summary ---")
    print(f"Processed {processed_files} JSON files.")
    print(f"Successfully updated {updated_files} files.")
    print(f"Skipped {skipped_work_tier_info} files for 'workTier' due to missing tier information in the script.")
    print(f"Skipped {skipped_consume_tier_info} files for 'consumeTier' due to missing tier information in the script.")

if __name__ == "__main__":
    update_building_tiers()
