'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import * as THREE from 'three';
import { calculateBounds } from './utils';
import SceneSetup from './SceneSetup';
import PolygonRenderer from './PolygonRenderer';
import WaterEffect from './WaterEffect';
import InteractionManager from './InteractionManager';
import ViewModeMenu from './ViewModeMenu';
import LandDetailsPanel from './LandDetailsPanel';
import MarketPanel from './MarketPanel';
import ActionButton from '../UI/ActionButton';
import TransferComputeMenu from '../UI/TransferComputeMenu';
import BackgroundMusic from '../UI/BackgroundMusic';
import usePolygonStore from '@/store/usePolygonStore';
import BridgeRenderer from './BridgeRenderer';

export default function PolygonViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const polygonMeshesRef = useRef<Record<string, THREE.Mesh>>({});
  const isInteractingWithPolygon = useRef(false);
  const [transferMenuOpen, setTransferMenuOpen] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  
  // Add refs at the top level of the component
  const hasLoadedDataRef = useRef<boolean>(false);
  const hasUpdatedCoatOfArmsRef = useRef<boolean>(false);
  
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
      const response = await fetch(`${getApiBaseUrl()}/api/transfer-compute`, {
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
  
  // Handle cache flushing
  const handleFlushCache = async () => {
    try {
      setIsFlushing(true);
      
      // Call the API to flush the cache
      const response = await fetch('/api/flush-cache', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to flush cache');
      }
      
      const data = await response.json();
      console.log('Cache flushed successfully:', data);
      
      // Reload the data
      loadPolygons();
      loadLandOwners();
      loadUsers();
      loadBridges();
      
      // Reset the hasLoadedDataRef to allow reloading
      hasLoadedDataRef.current = false;
      
      // Show success message
      alert('Cache flushed successfully. Reloading data...');
      
      // Optional: reload the page for a complete refresh
      // window.location.reload();
    } catch (error) {
      console.error('Error flushing cache:', error);
      alert(`Failed to flush cache: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsFlushing(false);
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
      const response = await fetch(`${getApiBaseUrl()}/api/users/coat-of-arms`);
      if (!response.ok) {
        throw new Error(`Failed to fetch owner coat of arms: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Owner coat of arms data:', data);
      
      if (data.success && data.users) {
        // Create a map of owner username to coat of arms URL
        const coatOfArmsMap: Record<string, string> = {};
        
        data.users.forEach((user: any) => {
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
    if (!hasLoadedDataRef.current) {
      console.log('Starting progressive loading...');
      
      // Set the flag to true to prevent multiple loads
      hasLoadedDataRef.current = true;
      
      // First load polygons as they're most important
      loadPolygons();
      
      // Set a timeout to force exit from loading state if it takes too long
      const loadingTimeout = setTimeout(() => {
        if (loading) {
          console.log('Loading timeout reached, forcing exit from loading state');
          // Fix: Don't call setState inside useEffect callback
          setTimeout(() => {
            usePolygonStore.setState({ loading: false });
          }, 0);
        }
      }, 30000); // 30 second timeout
      
      // Add a listener to detect when polygons are loaded
      const handlePolygonsLoaded = () => {
        console.log('Polygons loaded event detected');
        
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
    }
  }, [loadPolygons, loadLandOwners, loadUsers, loadBridges, loading, users]); // Fix: Add proper dependencies
  
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
        
        // Fix: Move setState outside of useEffect callback
        setTimeout(() => {
          usePolygonStore.setState({ polygons: updatedPolygons });
        }, 0);
      }, 500); // Delay to allow UI to render first
    }
  }, [polygons]);
  
  // Add a separate useEffect to update the renderer when coat of arms data changes
  useEffect(() => {
    if (polygonRendererRef.current && Object.keys(ownerCoatOfArmsMap).length > 0) {
      console.log('Updating coat of arms in renderer with data:', ownerCoatOfArmsMap);
      polygonRendererRef.current.updateOwnerCoatOfArms(ownerCoatOfArmsMap);
      
      // Force an update of the view mode to trigger coat of arms application
      if (activeView === 'land') {
        polygonRendererRef.current.updateViewMode(activeView);
      }
    }
  }, [ownerCoatOfArmsMap, activeView]);
  
  // Add this useEffect to ensure coat of arms are updated when users data changes
  useEffect(() => {
    if (polygonRendererRef.current && users && Object.keys(users).length > 0 && !hasUpdatedCoatOfArmsRef.current) {
      console.log('Updating coat of arms from users data in PolygonViewer:', users);
      
      // Set the flag to true to prevent multiple updates
      hasUpdatedCoatOfArmsRef.current = true;
      
      // Create a map of username to coat of arms URL
      const coatOfArmsMap: Record<string, string> = {};
      
      // Create a map of username to color
      const colorMap: Record<string, string> = {};
      
      Object.values(users).forEach(user => {
        if (user.user_name) {
          // Add coat of arms if available
          if (user.coat_of_arms_image) {
            coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
            console.log(`Added coat of arms for ${user.user_name}:`, user.coat_of_arms_image);
          }
          
          // Add color if available
          if (user.color) {
            colorMap[user.user_name] = user.color;
            console.log(`Added color for ${user.user_name}:`, user.color);
          }
        }
      });
      
      console.log('Created coat of arms map with', Object.keys(coatOfArmsMap).length, 'entries');
      console.log('Created color map with', Object.keys(colorMap).length, 'entries');
      
      // Only update if we have data to update with
      if (Object.keys(coatOfArmsMap).length > 0) {
        polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
      }
      
      // Update the renderer with the color map
      if (Object.keys(colorMap).length > 0) {
        polygonRendererRef.current.updateOwnerColors(colorMap);
      }
      
      // Force an update of the view mode to trigger sprite creation
      if (activeView === 'land') {
        polygonRendererRef.current.updateViewMode(activeView);
      }
    }
  }, [users]); // Only depend on users
  
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
        p.id === landId ? { ...p, owner: newOwner as string | undefined } : p
      );
      
      // Update the polygons in the store
      usePolygonStore.setState({ polygons: updatedPolygons });
      
      // Update the land owners map
      const updatedLandOwners = { ...landOwners, [landId]: newOwner as string };
      usePolygonStore.setState({ landOwners: updatedLandOwners });
      
      // Update the polygon renderer if it exists
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updatePolygonOwner(landId, newOwner as string);
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

  // Define handleContextLost outside of useEffect to make it available in cleanup
  const handleContextLost = useCallback((event: WebGLContextEvent) => {
    console.error('WebGL context lost:', event);
    event.preventDefault();
    // Attempt to recover after a short delay
    setTimeout(() => {
      if (sceneRef.current && sceneRef.current.renderer) {
        try {
          sceneRef.current.renderer.forceContextRestore();
        } catch (e) {
          console.error('Failed to restore WebGL context:', e);
        }
      }
    }, 1000);
  }, []);

  // Define these event handlers before they're used in the useEffect
  const handlePolygonAdded = useCallback(() => {
    if (waterEffectRef.current) {
      console.log('Polygon added, updating water effects');
      setTimeout(() => {
        if (waterEffectRef.current) {
          waterEffectRef.current.update(0, !highQuality);
        }
      }, 500);
    }
  }, [highQuality]);

  const handlePolygonDeleted = useCallback(() => {
    if (waterEffectRef.current) {
      console.log('Polygon deleted, updating water effects');
      setTimeout(() => {
        if (waterEffectRef.current) {
          waterEffectRef.current.update(0, !highQuality);
        }
      }, 500);
    }
  }, [highQuality]);

  // Set up Three.js scene - only depends on polygons and loading
  // NOT dependent on activeView, highQuality, or selectedPolygonId to prevent scene recreation
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    
    console.log(`Setting up Three.js scene`);

    // Calculate bounds for all polygons outside the try block to make it accessible to all nested functions
    const bounds = calculateBounds(polygons);
    console.log('Calculated bounds:', bounds);

    try {
      // Initialize scene
      const sceneSetup = new SceneSetup({
        canvas: canvasRef.current,
        activeView, // We'll still pass activeView, but handle view changes separately
        highQuality
      });
      sceneRef.current = sceneSetup;
      
      // Create water effect directly instead of using sceneSetup.createWater()
      const waterEffectTimeout = setTimeout(() => {
        if (sceneRef.current) {
          const waterEffect = new WaterEffect({
            scene: sceneRef.current.scene,
            activeView,
            performanceMode: !highQuality,
            width: bounds.scale * 200,
            height: bounds.scale * 200,
            renderer: sceneRef.current.renderer
          });
          waterEffectRef.current = waterEffect;
        }
      }, 500);
      
      // Add error handling for WebGL context loss using the function defined outside
      canvasRef.current.addEventListener('webglcontextlost', handleContextLost);
    
      // Add custom event listeners for polygon changes to update water effects
      window.addEventListener('polygonAdded', handlePolygonAdded);
      window.addEventListener('polygonDeleted', handlePolygonDeleted);
    } catch (error) {
      console.error('Error setting up Three.js scene:', error);
    }
    
    // Add camera reference to window for debugging
    if (typeof window !== 'undefined' && sceneRef.current) {
      (window as any).threeJsCamera = sceneRef.current.camera;
    }
    
    // Check if texture files exist and are accessible
    const checkTextureFiles = () => {
      console.log('Checking for texture files...');
      fetch('/textures/sand.jpg')
        .then(response => {
          if (response.ok) {
            console.log('Sand texture file exists and is accessible');
          } else {
            console.error('Sand texture file not found or not accessible:', response.status);
          }
        })
        .catch(error => {
          console.error('Error checking sand texture file:', error);
        });

      fetch('/textures/sand_normal.jpg')
        .then(response => {
          if (response.ok) {
            console.log('Sand normal map file exists and is accessible');
          } else {
            console.error('Sand normal map file not found or not accessible:', response.status);
          }
        })
        .catch(error => {
          console.error('Error checking sand normal map file:', error);
        });
    };
    
    checkTextureFiles();
    
    // Progressive initialization of components
    
    // Step 1: Initialize polygon renderer first (most important)
    const initPolygonRenderer = () => {
      console.log('Initializing polygon renderer with users data:', users);
      const polygonRenderer = new PolygonRenderer({
        scene: sceneRef.current?.scene || new THREE.Scene(),
        camera: sceneRef.current?.camera || new THREE.PerspectiveCamera(),
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
        if (Object.keys(coatOfArmsMap).length > 0) {
          polygonRenderer.updateOwnerCoatOfArms(coatOfArmsMap);
          polygonRenderer.updateViewMode(activeView);
        }
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
      console.log('Creating water effect...');
      if (sceneRef.current) {
        // Create our own water effect reference
        const waterEffect = new WaterEffect({
          scene: sceneRef.current.scene,
          activeView,
          performanceMode: !highQuality,
          width: bounds.scale * 200,
          height: bounds.scale * 200,
          renderer: sceneRef.current.renderer  // Pass the renderer
        });
        waterEffectRef.current = waterEffect;
        
        console.log('Water effect initialized successfully');
      } else {
        console.warn('Cannot create water effect: scene reference is null');
      }
    };
    
    // Step 3: Initialize interaction manager
    const initInteractionManager = () => {
      // Create fallback objects
      const fallbackScene = new THREE.Scene();
      const fallbackCamera = new THREE.PerspectiveCamera();
      
      const interactionManager = new InteractionManager({
        camera: sceneRef.current?.camera || fallbackCamera,
        scene: sceneRef.current?.scene || fallbackScene,
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
        scene: sceneRef.current?.scene || new THREE.Scene(),
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
    const waterEffectTimer = setTimeout(initWaterEffect, 500); // Increased delay to ensure polygons are rendered first
    const interactionManagerTimer = setTimeout(initInteractionManager, 600);
    const bridgeRendererTimer = setTimeout(initBridgeRenderer, 700);
    
    // Add a delayed update for coat of arms
    const coatOfArmsTimer = setTimeout(() => {
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
      // Request the next frame at the beginning to ensure the loop continues even if there's an error
      const animationId = requestAnimationFrame(animate);

      try {
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
          try {
            sceneRef.current.controls.update();
          } catch (error) {
            // Silent fail
          }
        }
      
        // Update water effect - every frame for smoother animation
        if (waterEffectRef.current) {
          try {
            waterEffectRef.current.update(frameCount, !highQuality);
          } catch (error) {
            // Silent fail
          }
        } else if (sceneRef.current && sceneRef.current.water) {
          // Use scene's water if waterEffectRef is not available
          try {
            sceneRef.current.water.update(frameCount);
          } catch (error) {
            // Silent fail
          }
        }
      
        // Update polygon LOD and selection state - less frequently for distant objects
        if (polygonRendererRef.current && (highQuality || frameCount % 3 === 0)) {
          try {
            polygonRendererRef.current.update(selectedPolygonId);
          } catch (error) {
            // Silent fail
          }
        }
        
        // Update clouds based on camera position
        if (sceneRef.current) {
          try {
            sceneRef.current.updateClouds(frameCount);
          } catch (error) {
            // Silent fail
          }
        }
      
        frameCount++;
      
        // Use composer instead of renderer directly to include post-processing effects
        if (sceneRef.current && sceneRef.current.composer) {
          // CRITICAL: Add additional checks to ensure all required objects exist before rendering
          if (sceneRef.current.scene && 
              sceneRef.current.camera && 
              !sceneRef.current.scene.userData.isDisposed) {
            
            // Check if any materials in the scene have issues
            try {
              // Render the scene
              sceneRef.current.composer.render();
            } catch (error) {
              // Silent fail - don't log errors for every frame
            }
          }
        }
      } catch (error) {
        // Silent fail for the entire animation loop
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
      
      // Remove event listeners
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('webglcontextlost', handleContextLost);
      }
      window.removeEventListener('polygonAdded', handlePolygonAdded);
      window.removeEventListener('polygonDeleted', handlePolygonDeleted);
    
      // Clear all timers
      clearTimeout(waterEffectTimer);
      clearTimeout(interactionManagerTimer);
      clearTimeout(bridgeRendererTimer);
      clearTimeout(coatOfArmsTimer);
    
      // Clear references
      sceneRef.current = null;
      polygonRendererRef.current = null;
      waterEffectRef.current = null;
      interactionManagerRef.current = null;
      bridgeRendererRef.current = null;
    };
  }, [polygons, loading, bridges, ownerCoatOfArmsMap, users, setHoveredPolygonId, handleContextLost, handlePolygonAdded, handlePolygonDeleted]); // Removed activeView, highQuality, selectedPolygonId from dependencies
  
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
  
  // Create a ref at the top level of the component to track previous view
  const prevViewRef = useRef(activeView);
  
  // Add a separate effect to handle selection state changes
  useEffect(() => {
    // Only update selection state when selectedPolygonId changes
    if (polygonRendererRef.current) {
      console.log('Updating selection state:', selectedPolygonId);
      polygonRendererRef.current.updateSelectionState(selectedPolygonId);
    }
  }, [selectedPolygonId]);
  
  // Add a separate effect to handle view mode changes
  useEffect(() => {
    // Only update if the view actually changed
    if (prevViewRef.current !== activeView) {
      prevViewRef.current = activeView;
      
      if (sceneRef.current) {
        console.log(`Updating view mode to ${activeView}`);
        
        // Load land owners when switching to land view
        if (activeView === 'land') {
          console.log('Switching to land view, loading land owners and coat of arms');
          loadLandOwners();
          
          // Force an update of coat of arms
          if (polygonRendererRef.current) {
            console.log('Forcing coat of arms update for land view');
            polygonRendererRef.current.updateViewMode(activeView);
          }
        }
        
        // Update market panel visibility based on active view
        setMarketPanelVisible(activeView === 'markets');
        
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
    }
  }, [activeView, loadLandOwners]);

  // Add a separate effect to handle quality changes
  useEffect(() => {
    // Update quality when highQuality changes
    if (sceneRef.current) {
      console.log(`Updating quality to ${highQuality ? 'high' : 'low'}`);
      
      // Update scene quality
      sceneRef.current.updateQuality(highQuality);
      
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
  
  // Add error boundary fallback
  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50">
        <div className="text-red-600 text-2xl font-serif mb-4">An error occurred</div>
        <div className="text-amber-800 italic text-lg max-w-md text-center">
          The Council of Ten regrets to inform you that there was an issue loading the map.
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
        >
          Reload Page
        </button>
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
      
      {/* Add the Market Panel */}
      <MarketPanel 
        visible={marketPanelVisible}
        onClose={() => setActiveView('land')}
      />

      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
      
      {/* Flush Cache Button */}
      <div className="absolute bottom-4 right-4 z-10">
        <button
          onClick={handleFlushCache}
          disabled={isFlushing}
          className={`px-4 py-2 rounded-lg shadow-md ${
            isFlushing 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          } transition-colors`}
        >
          {isFlushing ? 'Flushing...' : 'Flush Cache'}
        </button>
      </div>
    
      {/* Add a persistent BackgroundMusic component */}
      <div className="fixed top-4 right-20 z-10">
        <BackgroundMusic initialVolume={0.24} autoplay={true} />
      </div>
    
      {/* Removed duplicate Transfer Compute Menu */}
    </div>
  );
}
