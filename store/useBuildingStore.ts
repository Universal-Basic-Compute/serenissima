import { create } from 'zustand';
import { Building, BuildingCategory } from '@/lib/services/BuildingService';
import { getApiBaseUrl } from '@/lib/apiUtils';

interface BuildingState {
  categories: BuildingCategory[];
  loading: boolean;
  error: string | null;
  selectedBuilding: Building | null;
  selectedVariant: string;
  availableVariants: string[];
  placeableBuilding: {
    name: string;
    variant: string;
  } | null;
}

interface BuildingActions {
  loadBuildingCategories: () => Promise<BuildingCategory[]>;
  getBuildingCategories: () => Promise<BuildingCategory[]>;
  getBuildingByName: (name: string) => Promise<Building | null>;
  getBuildingVariants: (buildingName: string) => Promise<string[]>;
  setSelectedBuilding: (building: Building | null) => void;
  setSelectedVariant: (variant: string) => void;
  setAvailableVariants: (variants: string[]) => void;
  setPlaceableBuilding: (building: { name: string; variant: string } | null) => void;
}

const useBuildingStore = create<BuildingState & BuildingActions>((set, get) => ({
  categories: [],
  loading: false,
  error: null,
  selectedBuilding: null,
  selectedVariant: 'model',
  availableVariants: [],
  placeableBuilding: null,

  loadBuildingCategories: async () => {
    set({ loading: true, error: null });
    const categoryFiles = [
      'residential',
      'commercial',
      'production',
      'infrastructure',
      'public&government',
      'military&defence',
      'special'
    ];
    
    try {
      const loadedCategories: BuildingCategory[] = [];
      const apiBaseUrl = getApiBaseUrl();

      for (const category of categoryFiles) {
        try {
          console.log(`Fetching buildings for category: ${category}`);
          
          // Try the Next.js API route first
          let response = await fetch(`/api/buildings/${category}`, {
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          
          // If that fails, try the direct backend API
          if (!response.ok) {
            console.log(`Falling back to direct API for ${category}`);
            response = await fetch(`${apiBaseUrl}/api/buildings/${category}`, {
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
          }
          
          if (response.ok) {
            const buildings = await response.json();
            console.log(`Loaded ${buildings.length} buildings for category ${category}`);
            
            loadedCategories.push({
              name: category.charAt(0).toUpperCase() + category.slice(1).replace('&', ' & '),
              buildings: buildings
            });
          } else {
            console.warn(`Failed to load buildings for ${category}: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error loading ${category} buildings:`, error);
        }
      }

      console.log(`Total categories loaded: ${loadedCategories.length}`);
      set({ categories: loadedCategories, loading: false });
      return loadedCategories;
    } catch (error) {
      console.error('Error loading building data:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      });
      throw error;
    }
  },

  getBuildingCategories: async () => {
    const { categories, loadBuildingCategories } = get();
    if (categories.length === 0) {
      return loadBuildingCategories();
    }
    return categories;
  },

  getBuildingByName: async (name: string) => {
    const { categories, loadBuildingCategories } = get();
    
    if (categories.length === 0) {
      await loadBuildingCategories();
    }

    const allCategories = get().categories;
    for (const category of allCategories) {
      const building = category.buildings.find(
        b => b.name.toLowerCase() === name.toLowerCase()
      );
      if (building) return building;
    }

    return null;
  },

  getBuildingVariants: async (buildingName: string) => {
    try {
      const formattedName = buildingName.toLowerCase().replace(/\s+/g, '-');
      const response = await fetch(`/api/building-variants/${formattedName}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.variants) {
          console.log(`Loaded ${data.variants.length} variants for ${buildingName}`);
          set({ availableVariants: data.variants });
          return data.variants;
        }
      }
      
      const defaultVariants = ['model'];
      set({ availableVariants: defaultVariants });
      return defaultVariants; // Default to just 'model' if no variants found
    } catch (error) {
      console.error('Error fetching variants:', error);
      const defaultVariants = ['model'];
      set({ availableVariants: defaultVariants });
      return defaultVariants; // Default to just 'model' on error
    }
  },

  setSelectedBuilding: (building) => set({ selectedBuilding: building }),
  setSelectedVariant: (variant) => set({ selectedVariant: variant }),
  setAvailableVariants: (variants) => set({ availableVariants: variants }),
  setPlaceableBuilding: (building) => set({ placeableBuilding: building }),
}));

export default useBuildingStore;
