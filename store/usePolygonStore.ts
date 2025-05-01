import { create } from 'zustand';
import { ViewMode, Polygon } from '@/components/PolygonViewer/types';

interface PolygonState {
  polygons: Polygon[];
  loading: boolean;
  error: string | null;
  activeView: ViewMode;
  highQuality: boolean;
  hoveredPolygonId: string | null;
  selectedPolygonId: string | null;
  landOwners: Record<string, string>; // Map of land ID to owner
  
  // Actions
  setPolygons: (polygons: Polygon[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveView: (view: ViewMode) => void;
  toggleQuality: () => void;
  setHoveredPolygonId: (id: string | null) => void;
  setSelectedPolygonId: (id: string | null) => void;
  loadPolygons: () => Promise<void>;
  loadLandOwners: () => Promise<void>;
}

const usePolygonStore = create<PolygonState>((set, get) => ({
  polygons: [],
  loading: true,
  error: null,
  activeView: 'land',
  highQuality: false,
  hoveredPolygonId: null,
  selectedPolygonId: null,
  landOwners: {},
  
  setPolygons: (polygons) => set({ polygons }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setActiveView: (view) => set({ activeView: view }),
  toggleQuality: () => set((state) => ({ highQuality: !state.highQuality })),
  // Make hover a no-op function
  setHoveredPolygonId: () => {},
  setSelectedPolygonId: (id) => {
    // Use a function form of set to ensure we're not causing unnecessary rerenders
    set(state => {
      // Only update if the ID actually changed
      if (state.selectedPolygonId !== id) {
        return { selectedPolygonId: id };
      }
      return state; // Return unchanged state if ID is the same
    });
  },
  
  loadPolygons: async () => {
    try {
      console.log('Starting to load polygons...');
      set({ loading: true, error: null });
      const response = await fetch('/api/get-polygons');
      const data = await response.json();
      
      console.log('Loaded polygons from API:', data);
      
      if (data.polygons && data.polygons.length > 0) {
        console.log(`Successfully loaded ${data.polygons.length} polygons`);
        set({ polygons: data.polygons });
        
        // After loading polygons, immediately load land owners to associate owners with polygons
        const ownersResponse = await fetch('/api/get-land-owners');
        if (ownersResponse.ok) {
          const ownersData = await ownersResponse.json();
          if (ownersData.success && ownersData.lands) {
            const ownerMap = {};
            
            ownersData.lands.forEach(land => {
              if (land.id && land.owner) {
                ownerMap[land.id] = land.owner;
                
                // Also try with "polygon-" prefix if the ID doesn't have it
                if (!land.id.startsWith('polygon-')) {
                  ownerMap[`polygon-${land.id}`] = land.owner;
                }
                
                // Also try without "polygon-" prefix if the ID has it
                if (land.id.startsWith('polygon-')) {
                  ownerMap[land.id.replace('polygon-', '')] = land.owner;
                }
              }
            });
            
            console.log('Processed land owners map:', ownerMap);
            set({ landOwners: ownerMap });
            
            // Update the polygons with owner information
            const updatedPolygons = data.polygons.map(polygon => ({
              ...polygon,
              owner: ownerMap[polygon.id] || null
            }));
            
            set({ polygons: updatedPolygons });
          }
        }
      } else {
        console.warn('No polygons found in API response');
        // If no polygons, create a sample one for testing
        set({
          polygons: [{
            id: 'sample',
            coordinates: [
              { lat: 0, lng: 0 },
              { lat: 0, lng: 1 },
              { lat: 1, lng: 1 },
              { lat: 1, lng: 0 }
            ]
          }]
        });
      }
    } catch (error) {
      console.error('Error loading polygons:', error);
      set({ 
        error: 'Failed to load polygons',
        polygons: [{
          id: 'sample',
          coordinates: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 1 },
            { lat: 1, lng: 1 },
            { lat: 1, lng: 0 }
          ]
        }]
      });
    } finally {
      set({ loading: false });
    }
  },
  
  loadLandOwners: async () => {
    try {
      console.log('Loading land owners...');
      const response = await fetch('/api/get-land-owners');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch land owners: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Land owners API response:', data);
      
      if (data.success && data.lands) {
        // Create a map of land ID to owner
        const ownerMap = {};
        
        // Get current polygons to check ID formats
        const currentPolygons = get().polygons;
        console.log('Current polygon IDs:', currentPolygons.map(p => p.id));
        
        data.lands.forEach(land => {
          if (land.id && land.owner) {
            // Try different ID formats
            ownerMap[land.id] = land.owner;
            
            // Also try with "polygon-" prefix if the ID doesn't have it
            if (!land.id.startsWith('polygon-')) {
              ownerMap[`polygon-${land.id}`] = land.owner;
            }
            
            // Also try without "polygon-" prefix if the ID has it
            if (land.id.startsWith('polygon-')) {
              ownerMap[land.id.replace('polygon-', '')] = land.owner;
            }
          }
        });
        
        console.log('Processed land owners map:', ownerMap);
        set({ landOwners: ownerMap });
        
        // Update the polygons with owner information
        const updatedPolygons = get().polygons.map(polygon => ({
          ...polygon,
          owner: ownerMap[polygon.id] || null
        }));
        
        set({ polygons: updatedPolygons });
      } else {
        console.error('Invalid response format from land owners API:', data);
      }
    } catch (error) {
      console.error('Error loading land owners:', error);
    }
  }
}));

export default usePolygonStore;
