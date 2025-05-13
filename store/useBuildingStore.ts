import { create } from 'zustand';
import { Building, BuildingCategory } from '@/lib/models/BuildingModels';
import { getBackendBaseUrl } from '@/lib/apiUtils';

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
      'public_government', // Changed from public&government to avoid URL encoding issues
      'military_defence',  // Changed from military&defence to avoid URL encoding issues
      'special',
      'criminal'           // Added criminal category
    ];
    
    try {
      const loadedCategories: BuildingCategory[] = [];
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      for (const category of categoryFiles) {
        try {
          console.log(`Fetching buildings for category: ${category}`);
          
          // Format display name (convert underscores to spaces and capitalize)
          const displayName = category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' & ');
          
          // Try the Next.js API route first with a longer timeout
          let response;
          try {
            response = await fetch(`/api/buildings/${category}`, {
              signal: AbortSignal.timeout(8000) // Increased from 5s to 8s timeout
            });
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.warn(`Timeout fetching buildings for ${category} from Next.js API, falling back to direct API`);
            } else {
              console.warn(`Error fetching buildings for ${category} from Next.js API:`, error);
            }
            // Continue to fallback
            response = { ok: false };
          }
          
          // If that fails, try the direct backend API
          if (!response.ok) {
            console.warn(`Falling back to direct API for ${category}`);
            try {
              response = await fetch(`${apiBaseUrl}/api/buildings/${category}`, {
                signal: AbortSignal.timeout(8000) // Increased from 5s to 8s timeout
              });
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                console.warn(`Timeout fetching buildings for ${category} from direct API`);
                // Don't throw, just continue with other categories
                continue;
              }
              console.warn(`Error fetching from direct API: ${error instanceof Error ? error.message : String(error)}`);
              continue; // Skip to next category instead of throwing
            }
          }
          
          if (response.ok) {
            const buildings = await response.json();
            console.log(`Loaded ${buildings.length} buildings for category ${category}`);
            
            // Only add the category if we have buildings
            if (buildings && buildings.length > 0) {
              loadedCategories.push({
                name: displayName,
                buildings: buildings
              });
            } else {
              console.warn(`No buildings found for category ${category}`);
            }
          } else {
            console.warn(`Failed to load buildings for ${category}: ${response.status}`);
            
            // Try to load from a mock/fallback source for development
            try {
              // Check if we're in development mode
              if (process.env.NODE_ENV === 'development') {
                // Try to load a mock building for this category
                const mockBuilding: Building = {
                  name: `Mock ${displayName} Building`,
                  category: displayName,
                  subcategory: "Development",
                  tier: 1,
                  size: "Medium",
                  unlockCondition: "None",
                  shortDescription: `This is a mock building for the ${displayName} category.`,
                  fullDescription: "This building is only used during development when real building data isn't available.",
                  flavorText: "A placeholder building for development purposes.",
                  constructionCosts: { ducats: 1000 },
                  maintenanceCost: 100,
                  constructionTime: 1
                };
                
                loadedCategories.push({
                  name: displayName,
                  buildings: [mockBuilding]
                });
                
                console.log(`Added mock building for ${category}`);
              }
            } catch (mockError) {
              console.warn(`Error creating mock building for ${category}:`, mockError);
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.warn(`Request aborted for ${category} buildings - this is normal during navigation or timeout`);
          } else {
            console.warn(`Error loading ${category} buildings:`, error);
          }
        }
      }

      console.log(`Total categories loaded: ${loadedCategories.length}`);
      set({ categories: loadedCategories, loading: false });
      return loadedCategories;
    } catch (error) {
      console.warn('Error loading building data:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      });
      // Return empty array instead of throwing
      return [];
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
