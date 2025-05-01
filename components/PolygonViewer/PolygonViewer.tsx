'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { calculateBounds } from './utils';
import SceneSetup from './SceneSetup';
import PolygonRenderer from './PolygonRenderer';
import WaterEffect from './WaterEffect';
import InteractionManager from './InteractionManager';
import ViewModeMenu from './ViewModeMenu';
import LandDetailsPanel from './LandDetailsPanel';
import ActionButton from '../UI/ActionButton';
import TransferComputeMenu from '../UI/TransferComputeMenu';
import usePolygonStore from '@/store/usePolygonStore';
import BridgeRenderer from './BridgeRenderer';

export default function PolygonViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const polygonMeshesRef = useRef<Record<string, THREE.Mesh>>({});
  const isInteractingWithPolygon = useRef(false);
  const [transferMenuOpen, setTransferMenuOpen] = useState(false);
  
  // Get state from store
  const {
    polygons,
    loading,
    error,
    activeView,
    highQuality,
    selectedPolygonId,
    landOwners,
    users,
    setActiveView,
    toggleQuality,
    setHoveredPolygonId,
    setSelectedPolygonId,
    loadPolygons,
    loadLandOwners,
    loadUsers
  } = usePolygonStore();
  
  // References to our scene components
  const sceneRef = useRef<SceneSetup | null>(null);
  const polygonRendererRef = useRef<PolygonRenderer | null>(null);
  const waterEffectRef = useRef<WaterEffect | null>(null);
  const interactionManagerRef = useRef<InteractionManager | null>(null);
  const bridgeRendererRef = useRef<BridgeRenderer | null>(null);
  
  
  // Handler for closing the land details panel
  const handleCloseLandDetails = useCallback(() => {
    setSelectedPolygonId(null);
  }, [setSelectedPolygonId]);
  
  // Add function to handle compute transfer
  const handleTransferCompute = async (amount: number) => {
    try {
      // Get the wallet address from session or local storage
      const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      // Call the backend API to transfer compute
      const response = await fetch('http://localhost:8000/api/transfer-compute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          compute_amount: amount,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to transfer compute');
      }
      
      const data = await response.json();
      console.log('Compute transfer successful:', data);
      return data;
    } catch (error) {
      console.error('Error transferring compute:', error);
      throw error;
    }
  };
  
  // Interaction handlers removed to disable polygon interactions
  
  // Removed effect that stores resetCamera function on window
  
  // Add this to the state
  const [bridges, setBridges] = useState([]);
  const [ownerCoatOfArmsMap, setOwnerCoatOfArmsMap] = useState<Record<string, string>>({});

  // Add this function to load bridges
  const loadBridges = useCallback(async () => {
    try {
      const response = await fetch('/api/get-bridges');
      const data = await response.json();
      setBridges(data.bridges || []);
    } catch (error) {
      console.error('Error loading bridges:', error);
    }
  }, []);
  
  // Add this function to load owner coat of arms
  const loadOwnerCoatOfArms = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/api/users/coat-of-arms');
      if (!response.ok) {
        throw new Error(`Failed to fetch owner coat of arms: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Owner coat of arms data:', data);
      
      if (data.success && data.users) {
        // Create a map of owner username to coat of arms URL
        const coatOfArmsMap: Record<string, string> = {};
        
        data.users.forEach(user => {
          if (user.user_name && user.coat_of_arms_image) {
            coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          }
        });
        
        console.log('Processed coat of arms map:', coatOfArmsMap);
        setOwnerCoatOfArmsMap(coatOfArmsMap);
        
        // Update the polygon renderer if it exists
        if (polygonRendererRef.current) {
          polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
        }
      }
    } catch (error) {
      console.error('Error loading owner coat of arms:', error);
    }
  }, []);

  // Load polygons on mount with progressive loading
  useEffect(() => {
    console.log('Starting progressive loading...');
    
    // Set a flag to track if we've already loaded data
    let hasLoadedData = false;
    
    // First load polygons as they're most important
    loadPolygons();
    
    // Set a timeout to force exit from loading state if it takes too long
    const loadingTimeout = setTimeout(() => {
      if (!hasLoadedData) {
        console.log('Loading timeout reached, forcing exit from loading state');
        usePolygonStore.setState({ loading: false });
        hasLoadedData = true;
      }
    }, 10000); // 10 second timeout
    
    // Add a listener to detect when polygons are loaded
    const handlePolygonsLoaded = () => {
      console.log('Polygons loaded event detected');
      hasLoadedData = true;
      
      // Load other data with delays to prevent overwhelming the browser
      setTimeout(() => {
        loadLandOwners(); // Land owners are needed for the default land view
        console.log('Loading land owners data...');
      }, 1000);
      
      setTimeout(() => {
        loadUsers(); // Load all users data
        console.log('Loading users data...');
      }, 2000);
      
      setTimeout(() => {
        loadBridges();
        console.log('Loading bridges data...');
      }, 3000);
      
      // Add an additional timeout to ensure coat of arms are loaded
      setTimeout(() => {
        console.log('Forcing coat of arms update from delayed loader');
        if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
          const coatOfArmsMap: Record<string, string> = {};
          
          Object.values(users).forEach(user => {
            if (user.user_name && user.coat_of_arms_image) {
              coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
            }
          });
          
          if (Object.keys(coatOfArmsMap).length > 0) {
            polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
          }
        }
      }, 4000);
    };
    
    // Listen for a custom event that will be dispatched when polygons are loaded
    window.addEventListener('polygonsLoaded', handlePolygonsLoaded);
    
    return () => {
      clearTimeout(loadingTimeout);
      window.removeEventListener('polygonsLoaded', handlePolygonsLoaded);
    };
  }, [loadPolygons, loadBridges, loadLandOwners, loadUsers, users]);
  
  // Calculate centroids directly in the main thread for polygons without centroids
  useEffect(() => {
    const polygonsWithoutCentroids = polygons.filter(p => !p.centroid);
    
    if (polygonsWithoutCentroids.length > 0) {
      console.log(`Calculating centroids for ${polygonsWithoutCentroids.length} polygons directly`);
      
      // Use a simple timeout to avoid blocking the main thread
      setTimeout(() => {
        const updatedPolygons = [...polygons];
        
        // Calculate centroids for each polygon without one
        polygonsWithoutCentroids.forEach(polygon => {
          if (!polygon.centroid && polygon.coordinates && polygon.coordinates.length > 2) {
            // Simple centroid calculation
            let sumLat = 0;
            let sumLng = 0;
            const coords = polygon.coordinates;
            const n = coords.length;
            
            for (let i = 0; i < n; i++) {
              sumLat += coords[i].lat;
              sumLng += coords[i].lng;
            }
            
            const centroid = {
              lat: sumLat / n,
              lng: sumLng / n
            };
            
            // Find and update the polygon in the array
            const index = updatedPolygons.findIndex(p => p.id === polygon.id);
            if (index !== -1) {
              updatedPolygons[index] = {
                ...updatedPolygons[index],
                centroid
              };
            }
          }
        });
        
        // Update the store with the new centroids
        usePolygonStore.setState({ polygons: updatedPolygons });
      }, 500); // Delay to allow UI to render first
    }
  }, [polygons]);
  
  // Add a separate useEffect to update the renderer when coat of arms data changes
  useEffect(() => {
    if (polygonRendererRef.current && Object.keys(ownerCoatOfArmsMap).length > 0) {
      console.log('Updating coat of arms in renderer with data:', ownerCoatOfArmsMap);
      polygonRendererRef.current.updateOwnerCoatOfArms(ownerCoatOfArmsMap);
    }
  }, [ownerCoatOfArmsMap]);
  
  // Add this useEffect to ensure coat of arms are updated when users data changes
  useEffect(() => {
    if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
      console.log('Updating coat of arms from users data in PolygonViewer:', users);
      
      // Create a map of username to coat of arms URL
      const coatOfArmsMap: Record<string, string> = {};
      
      Object.values(users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Added coat of arms for ${user.user_name}:`, user.coat_of_arms_image);
        }
      });
      
      console.log('Created coat of arms map with', Object.keys(coatOfArmsMap).length, 'entries');
      
      // Update the renderer with the coat of arms map
      polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
      
      // Force an update of the view mode to trigger sprite creation
      polygonRendererRef.current.updateViewMode(activeView);
    }
  }, [users, activeView]);
  
  // Add an effect to listen for polygon deletion events
  useEffect(() => {
    const handlePolygonDeleted = () => {
      // Reload polygons when a polygon is deleted
      loadPolygons();
      loadLandOwners();
    };
    
    // Create a custom event for polygon deletion
    window.addEventListener('polygonDeleted', handlePolygonDeleted);
    
    return () => {
      window.removeEventListener('polygonDeleted', handlePolygonDeleted);
    };
  }, [loadPolygons, loadLandOwners]);
  
  // Add an effect to listen for land ownership changes
  useEffect(() => {
    const handleLandOwnershipChanged = (event: CustomEvent) => {
      const { landId, newOwner, transaction } = event.detail;
      
      // Update the local state with the new owner
      const updatedPolygons = polygons.map(p => 
        p.id === landId ? { ...p, owner: newOwner } : p
      );
      
      // Update the polygons in the store
      usePolygonStore.setState({ polygons: updatedPolygons });
      
      // Update the land owners map
      const updatedLandOwners = { ...landOwners, [landId]: newOwner };
      usePolygonStore.setState({ landOwners: updatedLandOwners });
      
      // Update the polygon renderer if it exists
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updatePolygonOwner(landId, newOwner);
      }
      
      console.log(`Land ownership changed: ${landId} now owned by ${newOwner}`);
    };
    
    // Add event listener for land ownership changes
    window.addEventListener('landOwnershipChanged', handleLandOwnershipChanged as EventListener);
    
    return () => {
      window.removeEventListener('landOwnershipChanged', handleLandOwnershipChanged as EventListener);
    };
  }, [polygons, landOwners]);

  // Update info panel visibility when selectedPolygonId changes
  useEffect(() => {
    if (selectedPolygonId) {
      setInfoVisible(true);
    } else {
      // Delay hiding the info to allow for animation
      const timer = setTimeout(() => {
        setInfoVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedPolygonId]);

  // Set up Three.js scene - only depends on polygons and loading
  // NOT dependent on activeView, highQuality, or selectedPolygonId to prevent scene recreation
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    
    console.log(`Setting up Three.js scene`);

    // Calculate bounds for all polygons
    const bounds = calculateBounds(polygons);
    console.log('Calculated bounds:', bounds);
    
    // Initialize scene
    const scene = new SceneSetup({
      canvas: canvasRef.current,
      activeView, // We'll still pass activeView, but handle view changes separately
      highQuality
    });
    sceneRef.current = scene;
    
    // Add camera reference to window for debugging
    if (typeof window !== 'undefined') {
      (window as any).threeJsCamera = scene.camera;
    }
    
    // Progressive initialization of components
    
    // Step 1: Initialize polygon renderer first (most important)
    const initPolygonRenderer = () => {
      console.log('Initializing polygon renderer with users data:', users);
      const polygonRenderer = new PolygonRenderer({
        scene: scene.scene,
        camera: scene.camera,
        polygons,
        bounds,
        activeView,
        performanceMode: !highQuality,
        polygonMeshesRef,
        users
      });
      polygonRendererRef.current = polygonRenderer;
      
      // Initialize with any existing coat of arms data
      if (Object.keys(ownerCoatOfArmsMap).length > 0) {
        console.log('Initializing with existing coat of arms data:', ownerCoatOfArmsMap);
        polygonRenderer.updateOwnerCoatOfArms(ownerCoatOfArmsMap);
      }
      
      // Force an update of the coat of arms sprites
      if (Object.keys(users).length > 0) {
        const coatOfArmsMap: Record<string, string> = {};
        Object.values(users).forEach(user => {
          if (user.user_name && user.coat_of_arms_image) {
            coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          }
        });
        polygonRenderer.updateOwnerCoatOfArms(coatOfArmsMap);
      }
    };
    
    // Step 2: Initialize water effect
    const initWaterEffect = () => {
      const waterEffect = new WaterEffect({
        scene: scene.scene,
        activeView,
        performanceMode: !highQuality,
        width: 500,  // Significantly increased size for better coverage
        height: 500  // Significantly increased size for better coverage
      });
      waterEffectRef.current = waterEffect;
    };
    
    // Step 3: Initialize interaction manager
    const initInteractionManager = () => {
      const interactionManager = new InteractionManager({
        camera: scene.camera,
        scene: scene.scene,
        polygonMeshesRef,
        activeView,
        hoveredPolygonId: null,
        setHoveredPolygonId,
        selectedPolygonId,
        setSelectedPolygonId
      });
      interactionManagerRef.current = interactionManager;
    };
    
    // Step 4: Initialize bridge renderer (least important)
    const initBridgeRenderer = () => {
      const bridgeRenderer = new BridgeRenderer({
        scene: scene.scene,
        bridges,
        polygons,
        bounds,
        activeView,
        performanceMode: !highQuality
      });
      bridgeRendererRef.current = bridgeRenderer;
    };
    
    // Execute initialization in sequence with delays
    initPolygonRenderer(); // Start with polygons immediately
    
    // Schedule the rest with increasing delays
    setTimeout(initWaterEffect, 100);
    setTimeout(initInteractionManager, 200);
    setTimeout(initBridgeRenderer, 300);
    
    // Add a delayed update for coat of arms
    setTimeout(() => {
      if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
        console.log('Forcing coat of arms update after initialization');
        const coatOfArmsMap: Record<string, string> = {};
        Object.values(users).forEach(user => {
          if (user.user_name && user.coat_of_arms_image) {
            coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          }
        });
        polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
        polygonRendererRef.current.updateViewMode(activeView);
      }
    }, 2000); // Delay by 2 seconds to ensure everything is loaded
    
    // Add a frame counter for less frequent updates
    let frameCount = 0;
    let isFirstRender = true;
  
    // Animation loop with performance optimizations
    const animate = () => {
      const animationId = requestAnimationFrame(animate);
    
      // Skip some frames at the beginning for better initial performance
      if (isFirstRender) {
        isFirstRender = false;
        return;
      }
    
      // Skip frames based on performance mode
      if (!highQuality && frameCount % 2 !== 0) {
        frameCount++;
        return;
      }
    
      // Update controls to enable camera movement
      if (sceneRef.current && sceneRef.current.controls) {
        sceneRef.current.controls.update();
      }
    
      // Update water effect - every frame for smoother animation
      if (waterEffectRef.current) {
        waterEffectRef.current.update(frameCount, !highQuality);
      }
    
      // Update polygon LOD and selection state - less frequently for distant objects
      if (polygonRendererRef.current && (highQuality || frameCount % 3 === 0)) {
        polygonRendererRef.current.update(selectedPolygonId);
      }
    
      frameCount++;
    
      // Use composer instead of renderer directly to include post-processing effects
      if (sceneRef.current && sceneRef.current.composer) {
        // Render the scene
        sceneRef.current.composer.render();
      }
    };
    
    // Start animation loop
    const animationId = requestAnimationFrame(animate);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      
      // Clean up all components
      if (interactionManagerRef.current) interactionManagerRef.current.cleanup();
      if (waterEffectRef.current) waterEffectRef.current.cleanup();
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      if (bridgeRendererRef.current) bridgeRendererRef.current.cleanup();
      if (sceneRef.current) sceneRef.current.cleanup();
      
      // Clear references
      sceneRef.current = null;
      polygonRendererRef.current = null;
      waterEffectRef.current = null;
      interactionManagerRef.current = null;
      bridgeRendererRef.current = null;
    };
  }, [polygons, loading]); // Remove activeView and highQuality dependencies
  
  // We've removed the separate controls update loop to prevent camera resets
  
  // Add a separate effect to handle selection state changes
  useEffect(() => {
    // Only update selection state when selectedPolygonId changes
    // This ensures the selection is durable
    if (polygonRendererRef.current) {
      console.log('Updating selection state:', selectedPolygonId);
      polygonRendererRef.current.updateSelectionState(selectedPolygonId);
    }
  }, [selectedPolygonId]);
  
  // Add a new useEffect to handle hover state changes
  useEffect(() => {
    const handleHoverStateChange = (event: CustomEvent) => {
      if (polygonRendererRef.current && activeView === 'land') {
        polygonRendererRef.current.updateHoverState(event.detail.polygonId);
      }
    };
    
    // Listen for custom hover events
    window.addEventListener('polygonHover', handleHoverStateChange as EventListener);
    
    return () => {
      window.removeEventListener('polygonHover', handleHoverStateChange as EventListener);
    };
  }, [activeView]);
  
  // Add a separate effect to handle view mode changes
  useEffect(() => {
    // Update view mode when activeView changes
    if (sceneRef.current) {
      console.log(`Updating view mode to ${activeView}`);
      
      // Load land owners when switching to land view
      if (activeView === 'land') {
        loadLandOwners();
      }
      
      // Update water effect
      if (waterEffectRef.current) {
        waterEffectRef.current.updateViewMode(activeView);
      }
      
      // Update polygon renderer
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updateViewMode(activeView);
      }
      
      // Update interaction manager
      if (interactionManagerRef.current) {
        interactionManagerRef.current.updateViewMode(activeView);
      }
      
      // Update bridge renderer
      if (bridgeRendererRef.current) {
        bridgeRendererRef.current.updateViewMode(activeView);
      }
    }
  }, [activeView, loadLandOwners]);

  // Add a separate effect to handle quality changes
  useEffect(() => {
    // Update quality when highQuality changes
    if (sceneRef.current) {
      console.log(`Updating quality to ${highQuality ? 'high' : 'low'}`);
      
      // Update water effect
      if (waterEffectRef.current) {
        waterEffectRef.current.updateQuality(!highQuality);
      }
      
      // Update polygon renderer
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updateQuality(!highQuality);
      }
      
      // Update bridge renderer
      if (bridgeRendererRef.current) {
        bridgeRendererRef.current.updateQuality(!highQuality);
      }
    }
  }, [highQuality]);
  
  // Create memoized components before any conditional returns
  const ViewModeMenuMemo = useMemo(() => (
    <ViewModeMenu activeView={activeView} setActiveView={setActiveView} />
  ), [activeView, setActiveView]);
  
  const LandDetailsPanelMemo = useMemo(() => (
    <LandDetailsPanel 
      selectedPolygonId={selectedPolygonId} 
      onClose={handleCloseLandDetails}
      polygons={polygons}
      landOwners={landOwners}
      visible={activeView === 'land'} // Pass visibility as a prop instead
    />
  ), [activeView, selectedPolygonId, handleCloseLandDetails, polygons, landOwners]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50">
        <div className="text-amber-800 text-2xl font-serif mb-4">Mapping the Venetian Republic...</div>
        <div className="text-amber-600 italic text-lg">The Council of Ten is preparing the charts of La Serenissima</div>
        <div className="mt-6 flex flex-col items-center">
          <div className="w-24 h-24 border-t-4 border-amber-600 rounded-full animate-spin mb-4"></div>
          <div className="text-amber-700 text-sm">
            Loading resources... Please wait a moment.
          </div>
          <div className="mt-2 w-64 h-2 bg-amber-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-600 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <p className="text-red-500 mb-4">{error}</p>
        <p>Displaying sample polygon instead</p>
      </div>
    );
  }
  
  return (
    <div className="w-screen h-screen">
      {/* View mode menu */}
      {ViewModeMenuMemo}

      {/* Add the Land Details Panel */}
      {LandDetailsPanelMemo}
      
      {/* Flush Cache button */}
      <div className="absolute bottom-4 left-4 z-10">
        <button
          onClick={() => {
            // Clear all cache keys
            const cacheKeys = [
              'polygons_cache', 'polygons_cache_timestamp',
              'land_owners_cache', 'land_owners_cache_timestamp',
              'users_cache', 'users_cache_timestamp'
            ];
            
            cacheKeys.forEach(key => localStorage.removeItem(key));
            
            // Reload the data
            loadPolygons();
            loadLandOwners();
            loadUsers();
            
            // Show a notification
            alert('Cache flushed successfully! Reloading data...');
          }}
          className="px-4 py-2 rounded shadow bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          Flush Cache
        </button>
      </div>

      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
      
      {/* Removed duplicate Transfer Compute Menu */}
    </div>
  );
}
