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
  activeView: 'land', // Default to land view
  highQuality: true, // Changed to true to enable high quality mode by default
  hoveredPolygonId: null,
  selectedPolygonId: null,
  landOwners: {},
  users: {},
  
  setPolygons: (polygons) => set({ polygons }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setActiveView: (view: ViewMode) => {
    // Only allow switching to buildings or land view
    if (view === 'buildings' || view === 'land') {
      set({ activeView: view });
    } else {
      console.log(`View mode ${view} is not yet available`);
      // Optionally show a toast or notification here
    }
  },
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
      
      // Set loading state immediately
      set({ loading: true, error: null });
      
      // Create a timeout to ensure we don't get stuck in loading state
      const loadingTimeout = setTimeout(() => {
        console.log('Loading timeout reached, forcing completion with sample data');
        set({
          loading: false,
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
        
        // Dispatch event to notify that polygons are loaded
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('polygonsLoaded'));
        }
      }, 30000); // 30 second timeout
      
      // First try to load from cache to avoid network requests entirely
      const cacheKey = 'polygons_cache';
      const cacheTimestampKey = 'polygons_cache_timestamp';
      const currentTime = Date.now();
      const cacheTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      // Check if we have cached data
      const cachedTimestamp = localStorage.getItem(cacheTimestampKey);
      const isCacheValid = cachedTimestamp && (currentTime - parseInt(cachedTimestamp)) < cacheTime;
      
      if (isCacheValid) {
        // Use cached data
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            console.log('Using cached polygon data');
            const data = JSON.parse(cachedData);
            
            if (data.polygons && data.polygons.length > 0) {
              console.log(`Loaded ${data.polygons.length} polygons from cache`);
              
              // Clear the timeout since we have data
              clearTimeout(loadingTimeout);
              
              // Set the data and exit loading state
              set({ polygons: data.polygons, loading: false });
              
              // Dispatch event to notify that polygons are loaded
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('polygonsLoaded'));
              }
              
              return;
            }
          } catch (cacheError) {
            console.error('Error parsing cached data:', cacheError);
            // Continue to fetch from API
          }
        }
      }
      
      try {
        // Try to load a minimal set of polygons
        console.log('Loading minimal polygon set...');
        const response = await fetch('/api/get-polygons?limit=5', {
          // Add a timeout to prevent hanging requests
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch initial polygons: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.polygons && data.polygons.length > 0) {
          console.log(`Loaded ${data.polygons.length} initial polygons`);
          
          // Clear the timeout since we have data
          clearTimeout(loadingTimeout);
          
          // Cache the response
          localStorage.setItem(cacheKey, JSON.stringify(data));
          localStorage.setItem(cacheTimestampKey, currentTime.toString());
          
          // Set the data and exit loading state
          set({ polygons: data.polygons, loading: false });
          
          // Dispatch event to notify that polygons are loaded
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('polygonsLoaded'));
          }
          
          // Load more data in the background
          setTimeout(() => {
            console.log('Loading full polygon set in background...');
            fetch('/api/get-polygons')
              .then(response => {
                if (!response.ok) {
                  throw new Error(`Failed to fetch full polygons: ${response.status}`);
                }
                return response.json();
              })
              .then(fullData => {
                if (fullData.polygons && fullData.polygons.length > 0) {
                  console.log(`Loaded ${fullData.polygons.length} total polygons`);
                  
                  // Cache the full response
                  localStorage.setItem(cacheKey, JSON.stringify(fullData));
                  localStorage.setItem(cacheTimestampKey, currentTime.toString());
                  
                  set({ polygons: fullData.polygons });
                }
              })
              .catch(error => {
                console.error('Error loading full polygon set:', error);
                // Don't change loading state since we already have data
              });
          }, 2000); // Reduced from 5000ms to 2000ms
          
          return;
        }
      } catch (error) {
        console.error('Error loading minimal polygon set:', error);
        // Continue to fallback
      }
      
      // If we get here, we couldn't load any real data, so show a sample polygon
      console.log('Using sample polygon as fallback');
      
      // Clear the timeout since we're manually setting the state
      clearTimeout(loadingTimeout);
      
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
      
      // Dispatch event to notify that polygons are loaded
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('polygonsLoaded'));
      }
      
    } catch (error) {
      console.error('Error in loadPolygons:', error);
      
      // Ensure we always set loading to false to prevent getting stuck
      set({ 
        loading: false,
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
      
      // Dispatch event to notify that polygons are loaded (even with error)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('polygonsLoaded'));
      }
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
        try {
          const response = await fetch('/api/get-land-owners', {
            // Add a timeout to prevent hanging requests
            signal: AbortSignal.timeout(30000) // 30 second timeout
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch land owners: ${response.status}`);
          }
          
          data = await response.json();
          
          // Cache the response
          localStorage.setItem(cacheKey, JSON.stringify(data));
          localStorage.setItem(cacheTimestampKey, currentTime.toString());
        } catch (fetchError) {
          console.error('Error fetching land owners:', fetchError);
          
          // Try to use stale cache if available
          const staleCachedData = localStorage.getItem(cacheKey);
          if (staleCachedData) {
            console.log('Using stale cached land owners data due to fetch error');
            data = JSON.parse(staleCachedData);
            data._stale = true; // Mark as stale
          } else {
            // If no cache at all, create an empty response
            console.log('No cached data available, using empty land owners data');
            data = { success: true, lands: [], _error: (fetchError as Error).message };
          }
        }
      }
      
      if (data.success && data.lands) {
        // Create a map of land ID to owner
        const ownerMap: Record<string, string> = {};
        
        // Get current polygons to check ID formats
        const currentPolygons = get().polygons;
        
        data.lands.forEach((land: any) => {
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
        
        console.log('Processed land owners map with', Object.keys(ownerMap).length, 'entries');
        set({ landOwners: ownerMap });
        
        // Update the polygons with owner information
        const updatedPolygons = get().polygons.map(polygon => ({
          ...polygon,
          owner: (ownerMap as Record<string, string>)[polygon.id] || undefined
        }));
        
        set({ polygons: updatedPolygons });
      } else {
        console.error('Invalid response format from land owners API:', data);
        // Set empty land owners to prevent further errors
        set({ landOwners: {} });
      }
    } catch (error) {
      console.error('Error loading land owners:', error);
      // Set empty land owners to prevent further errors
      set({ landOwners: {} });
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
        const usersMap: Record<string, any> = {};
        
        data.users.forEach((user: any) => {
          if (user.user_name) {
            usersMap[user.user_name] = user;
            
            // Also map by wallet address if available
            if (user.wallet_address) {
              usersMap[user.wallet_address] = user;
            }
            
            // Add specific debug for ConsiglioDeiDieci
            if (user.user_name === 'ConsiglioDeiDieci') {
              console.log('ConsiglioDeiDieci user data found:', user);
              console.log('ConsiglioDeiDieci color value:', user.color);
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
