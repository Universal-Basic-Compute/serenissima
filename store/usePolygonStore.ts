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
  
  // Actions
  setPolygons: (polygons: Polygon[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveView: (view: ViewMode) => void;
  toggleQuality: () => void;
  setHoveredPolygonId: (id: string | null) => void;
  setSelectedPolygonId: (id: string | null) => void;
  loadPolygons: () => Promise<void>;
}

const usePolygonStore = create<PolygonState>((set, get) => ({
  polygons: [],
  loading: true,
  error: null,
  activeView: 'buildings',
  highQuality: false,
  hoveredPolygonId: null,
  selectedPolygonId: null,
  
  setPolygons: (polygons) => set({ polygons }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setActiveView: (view) => set({ activeView: view }),
  toggleQuality: () => set((state) => ({ highQuality: !state.highQuality })),
  // Make hover a no-op function
  setHoveredPolygonId: () => {},
  setSelectedPolygonId: (id) => {
    console.log('setSelectedPolygonId called with:', id);
    
    // If we have access to the camera, log its position
    if (typeof window !== 'undefined' && (window as any).threeJsCamera) {
      console.log('Camera position in setSelectedPolygonId:', {
        position: (window as any).threeJsCamera.position.clone(),
        quaternion: (window as any).threeJsCamera.quaternion.clone()
      });
    }
    
    set({ selectedPolygonId: id });
  },
  
  loadPolygons: async () => {
    try {
      set({ loading: true, error: null });
      const response = await fetch('/api/get-polygons');
      const data = await response.json();
      
      console.log('Loaded polygons:', data);
      
      if (data.polygons && data.polygons.length > 0) {
        set({ polygons: data.polygons });
      } else {
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
  }
}));

export default usePolygonStore;
