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
  users: Record<string, any>; // Map of username to user data
  
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
  loadUsers: () => Promise<void>;
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
  users: {},
  
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
      
      // Use a timeout to ensure the loading state is rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Create a cache key based on timestamp (cache for 5 minutes)
      const cacheKey = 'polygons_cache';
      const cacheTimestampKey = 'polygons_cache_timestamp';
      const currentTime = Date.now();
      const cacheTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      // Check if we have cached data
      const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
      const isCacheValid = cachedTimestamp && (currentTime - parseInt(cachedTimestamp)) < cacheTime;
      
      let data;
      
      if (isCacheValid) {
        // Use cached data
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          console.log('Using cached polygon data');
          data = JSON.parse(cachedData);
        }
      }
      
      // If no valid cache, fetch from API
      if (!data) {
        console.log('Fetching fresh polygon data from API');
        const response = await fetch('/api/get-polygons');
        data = await response.json();
        
        // Cache the response
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheTimestampKey, currentTime.toString());
      }
      
      console.log('Processing polygon data:', data);
      
      if (data.polygons && data.polygons.length > 0) {
        console.log(`Successfully loaded ${data.polygons.length} polygons`);
        set({ polygons: data.polygons, loading: false });
        
        // Return early to allow UI to render with the polygons
        // Land owners will be loaded separately
        return;
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
          }],
          loading: false
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
        }],
        loading: false
      });
    }
  },
  
  loadLandOwners: async () => {
    try {
      console.log('Loading land owners...');
      
      // Create a cache key based on timestamp (cache for 5 minutes)
      const cacheKey = 'land_owners_cache';
      const cacheTimestampKey = 'land_owners_cache_timestamp';
      const currentTime = Date.now();
      const cacheTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      // Check if we have cached data
      const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
      const isCacheValid = cachedTimestamp && (currentTime - parseInt(cachedTimestamp)) < cacheTime;
      
      let data;
      
      if (isCacheValid) {
        // Use cached data
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          console.log('Using cached land owners data');
          data = JSON.parse(cachedData);
        }
      }
      
      // If no valid cache, fetch from API
      if (!data) {
        console.log('Fetching fresh land owners data from API');
        const response = await fetch('/api/get-land-owners');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch land owners: ${response.status}`);
        }
        
        data = await response.json();
        
        // Cache the response
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheTimestampKey, currentTime.toString());
      }
      
      if (data.success && data.lands) {
        // Create a map of land ID to owner
        const ownerMap = {};
        
        // Get current polygons to check ID formats
        const currentPolygons = get().polygons;
        
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
        
        console.log('Processed land owners map');
        set({ landOwners: ownerMap });
        
        // Update the polygons with owner information
        const updatedPolygons = get().polygons.map(polygon => ({
          ...polygon,
          owner: ownerMap[polygon.id] || null
        }));
        
        set({ polygons: updatedPolygons });
      } else {
        console.error('Invalid response format from land owners API');
      }
    } catch (error) {
      console.error('Error loading land owners:', error);
    }
  },
  
  loadUsers: async () => {
    try {
      console.log('Loading users data...');
      
      // Create a cache key based on timestamp (cache for 5 minutes)
      const cacheKey = 'users_cache';
      const cacheTimestampKey = 'users_cache_timestamp';
      const currentTime = Date.now();
      const cacheTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      // Check if we have cached data
      const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
      const isCacheValid = cachedTimestamp && (currentTime - parseInt(cachedTimestamp)) < cacheTime;
      
      let data;
      
      if (isCacheValid) {
        // Use cached data
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          console.log('Using cached users data');
          data = JSON.parse(cachedData);
        }
      }
      
      // If no valid cache, fetch from API
      if (!data) {
        console.log('Fetching fresh users data from API');
        const response = await fetch('/api/get-all-users');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch users: ${response.status}`);
        }
        
        data = await response.json();
        
        // Cache the response
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheTimestampKey, currentTime.toString());
      }
      
      if (data.success && data.users) {
        // Create a map of username to user data
        const usersMap = {};
        
        data.users.forEach(user => {
          if (user.user_name) {
            usersMap[user.user_name] = user;
            
            // Also map by wallet address if available
            if (user.wallet_address) {
              usersMap[user.wallet_address] = user;
            }
          }
        });
        
        console.log('Processed users map with', Object.keys(usersMap).length, 'entries');
        set({ users: usersMap });
      } else {
        console.error('Invalid response format from users API');
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }
}));

export default usePolygonStore;
