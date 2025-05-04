'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import * as THREE from 'three';
import { calculateBounds } from './utils';
import SceneSetup from './SceneSetup';
import PolygonRenderer from './PolygonRenderer';
import InteractionManager from './InteractionManager';
import ViewModeMenu from './ViewModeMenu';
import LandDetailsPanel from './LandDetailsPanel';
import MarketPanel from './MarketPanel';
import BuildingMenu from './BuildingMenu';
import ActionButton from '../UI/ActionButton';
import TransferComputeMenu from '../UI/TransferComputeMenu';
import BackgroundMusic from '../UI/BackgroundMusic';
import usePolygonStore from '@/store/usePolygonStore';
import BridgeRenderer from './BridgeRenderer';
import LandPurchaseModal from '../UI/LandPurchaseModal';
import RoadCreator from './RoadCreator';
import RoadManager from './RoadManager';

export default function PolygonViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const polygonMeshesRef = useRef<Record<string, THREE.Mesh>>({});
  const isInteractingWithPolygon = useRef(false);
  const [transferMenuOpen, setTransferMenuOpen] = useState(false);
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [purchaseModalData, setPurchaseModalData] = useState<{
    landId: string | null;
    landName?: string;
    transaction: any;
    onComplete?: () => void;
  }>({
    landId: null,
    landName: undefined,
    transaction: null,
    onComplete: undefined
  });
  
  const [buildingMenuVisible, setBuildingMenuVisible] = useState(false);
  const [roadCreationActive, setRoadCreationActive] = useState(false);
  const roadManagerRef = useRef<RoadManager | null>(null);
  
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
  
  // Function to update polygon colors
  const updatePolygonColors = useCallback(() => {
    if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
      console.log('Updating polygon colors with user data:', users);
      
      // Create a map of user colors
      const colorMap: Record<string, string> = {};
      Object.values(users).forEach(user => {
        if (user.user_name) {
          if (user.color) {
            colorMap[user.user_name] = user.color;
            console.log(`Added color for ${user.user_name}: ${user.color}`);
          } else if (user.user_name === 'ConsiglioDeiDieci') {
            // Special case for ConsiglioDeiDieci
            colorMap[user.user_name] = '#8B0000'; // Dark red
            console.log(`Added default color for ConsiglioDeiDieci: #8B0000`);
          }
        }
      });
      
      // Always add ConsiglioDeiDieci if not present
      if (!colorMap['ConsiglioDeiDieci']) {
        colorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
        console.log('Added missing ConsiglioDeiDieci with default color #8B0000');
      }
      
      // Update colors in the renderer
      if (Object.keys(colorMap).length > 0) {
        polygonRendererRef.current.updateOwnerColors(colorMap);
        // Force an update of owner colors
        polygonRendererRef.current.updatePolygonOwnerColors();
      }
    }
  }, [users]);

  // Function to update coat of arms
  const updateCoatOfArms = useCallback(() => {
    if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
      console.log('Updating coat of arms with user data:', users);
      
      // Create a map of user coat of arms
      const coatOfArmsMap: Record<string, string> = {};
      Object.values(users).forEach(user => {
        if (user.user_name && user.coat_of_arms_image) {
          coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
          console.log(`Added coat of arms for ${user.user_name}:`, user.coat_of_arms_image);
        }
      });
      
      // Update coat of arms in the renderer
      if (Object.keys(coatOfArmsMap).length > 0) {
        polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
        // Force an update of coat of arms sprites
        polygonRendererRef.current.updateCoatOfArmsSprites();
      }
    }
  }, [users]);
  
  // References to our scene components
  const sceneRef = useRef<SceneSetup | null>(null);
  const polygonRendererRef = useRef<PolygonRenderer | null>(null);
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

  // Debug function to help understand what's happening with the polygons
  const debugPolygons = () => {
    console.log(`Total polygons loaded: ${polygons.length}`);
    
    if (polygons.length > 0) {
      console.log('First few polygons:', polygons.slice(0, 5));
      
      // Check if polygons have valid coordinates
      const validPolygons = polygons.filter(p => 
        p.coordinates && p.coordinates.length >= 3
      );
      console.log(`Valid polygons with coordinates: ${validPolygons.length}`);
      
      // Check if polygons have centroids
      const polygonsWithCentroids = polygons.filter(p => p.centroid);
      console.log(`Polygons with centroids: ${polygonsWithCentroids.length}`);
      
      // Check if polygons have owners
      const polygonsWithOwners = polygons.filter(p => p.owner);
      console.log(`Polygons with owners: ${polygonsWithOwners.length}`);
    }
  };

  // Load polygons on mount with progressive loading
  useEffect(() => {
    if (!hasLoadedDataRef.current) {
      console.log('Starting progressive loading...');
      
      // Set the flag to true to prevent multiple loads
      hasLoadedDataRef.current = true;
      
      // First load polygons as they're most important
      loadPolygons().then(() => {
        // Debug polygons after loading
        debugPolygons();
      });
      
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
    if (polygonRendererRef.current && users && Object.keys(users).length > 0) {
      console.log('Updating coat of arms from users data in PolygonViewer:', users);
      
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
          } else if (user.user_name === 'ConsiglioDeiDieci') {
            // Special case for ConsiglioDeiDieci
            colorMap[user.user_name] = '#8B0000'; // Dark red
            console.log(`Added default color for ConsiglioDeiDieci: #8B0000`);
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
        // Force an update of owner colors
        polygonRendererRef.current.updatePolygonOwnerColors();
      }
      
      // Force an update of the view mode to trigger sprite creation
      if (activeView === 'land') {
        polygonRendererRef.current.updateViewMode(activeView);
        // Force an update of coat of arms sprites
        polygonRendererRef.current.updateCoatOfArmsSprites();
      }
    }
  }, [users, activeView]); // Depend on users and activeView
  
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

      console.log(`Land ownership changed event received: ${landId} now owned by ${newOwner}`);

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
        console.log(`Updating polygon owner in renderer: ${landId} -> ${newOwner}`);
        polygonRendererRef.current.updatePolygonOwner(landId, newOwner as string);
      }
      
      // If this is the currently selected polygon, make sure the panel stays open
      if (landId === selectedPolygonId) {
        console.log('Selected polygon ownership changed, keeping panel open');
        // Dispatch event to keep panel open
        window.dispatchEvent(new CustomEvent('keepLandDetailsPanelOpen', {
          detail: { polygonId: landId }
        }));
      }
      
      // Force an update of the polygon colors and coat of arms
      if (polygonRendererRef.current) {
        console.log('Scheduling update of polygon colors and coat of arms');

        // First immediate update
        if (activeView === 'land') {
          if (polygonRendererRef.current) {
            polygonRendererRef.current.updatePolygonOwnerColors();
            polygonRendererRef.current.updateCoatOfArmsSprites();
          }
        }

        // Then a delayed update to ensure everything is properly loaded
        setTimeout(() => {
          console.log('Performing delayed update of polygon colors and coat of arms');
          if (activeView === 'land' && polygonRendererRef.current) {
            polygonRendererRef.current.updatePolygonOwnerColors();
            polygonRendererRef.current.updateCoatOfArmsSprites();
          }
        }, 1000);

        // And another update after a longer delay as a final check
        setTimeout(() => {
          console.log('Performing final update of polygon colors and coat of arms');
          if (activeView === 'land' && polygonRendererRef.current) {
            polygonRendererRef.current.updatePolygonOwnerColors();
            polygonRendererRef.current.updateCoatOfArmsSprites();
          }
        }, 3000);
      }
    };
    
    // Add event listener for land ownership changes
    window.addEventListener('landOwnershipChanged', handleLandOwnershipChanged as EventListener);
    
    return () => {
      window.removeEventListener('landOwnershipChanged', handleLandOwnershipChanged as EventListener);
    };
  }, [polygons, landOwners, selectedPolygonId, activeView]);
  
  // Add this useEffect to listen for compute balance changes
  useEffect(() => {
    const handleComputeBalanceChanged = (event: CustomEvent) => {
      const { buyer, seller, amount } = event.detail;
      
      console.log(`Compute balance changed event received: ${seller} +${amount}, ${buyer} -${amount}`);
      
      // Reload users data to reflect the new compute balances
      loadUsers();
      
      // If the current user is the buyer or seller, update their profile
      const currentWallet = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
      if (currentWallet && (currentWallet === buyer || currentWallet === seller)) {
        console.log(`Current user (${currentWallet}) is involved in the transaction, updating profile`);
        
        // Fetch updated user data with retry logic
        const fetchUserData = async (retries = 3, delay = 1000) => {
          try {
            console.log(`Fetching updated user profile for ${currentWallet}, attempt ${4-retries}/3`);
            const response = await fetch(`${getApiBaseUrl()}/api/wallet/${currentWallet}`);
            if (!response.ok) {
              throw new Error(`Failed to fetch updated user profile: ${response.status}`);
            }
            
            const data = await response.json();
            if (data && data.user_name) {
              console.log(`Successfully fetched updated profile for ${data.user_name} with compute: ${data.compute_amount}`);
              
              // Update local storage with new compute amount
              const storedProfile = localStorage.getItem('userProfile');
              if (storedProfile) {
                try {
                  const profile = JSON.parse(storedProfile);
                  profile.computeAmount = data.compute_amount;
                  localStorage.setItem('userProfile', JSON.stringify(profile));
                  console.log(`Updated localStorage profile with compute amount: ${data.compute_amount}`);
                } catch (e) {
                  console.error('Error updating stored profile:', e);
                }
              }
              
              // Dispatch event to update UI components
              console.log('Dispatching userProfileUpdated event');
              window.dispatchEvent(new CustomEvent('userProfileUpdated', {
                detail: data
              }));
            }
          } catch (error) {
            console.error(`Error fetching updated user profile (attempt ${4-retries}/3):`, error);
            if (retries > 0) {
              console.log(`Retrying in ${delay}ms...`);
              setTimeout(() => fetchUserData(retries - 1, delay * 1.5), delay);
            }
          }
        };
        
        // Start the fetch with retries
        fetchUserData();
      }
    };
    
    window.addEventListener('computeBalanceChanged', handleComputeBalanceChanged as EventListener);
    
    return () => {
      window.removeEventListener('computeBalanceChanged', handleComputeBalanceChanged as EventListener);
    };
  }, [loadUsers]);

  // Add this useEffect to listen for the showLandPurchaseModal event
  useEffect(() => {
    const handleShowPurchaseModal = (event: CustomEvent) => {
      console.log('Show purchase modal event received:', event.detail);
      
      // Validate the transaction data before showing the modal
      if (!event.detail.transaction) {
        console.error('Missing transaction data in showLandPurchaseModal event');
        alert('Cannot process purchase: Missing transaction data');
        return;
      }
      
      if (!event.detail.landId) {
        console.error('Missing landId in showLandPurchaseModal event');
        alert('Cannot process purchase: Missing land ID');
        return;
      }
      
      setPurchaseModalData({
        landId: event.detail.landId,
        landName: event.detail.landName,
        transaction: event.detail.transaction,
        onComplete: event.detail.onComplete
      });
      setPurchaseModalVisible(true);
    };
    
    window.addEventListener('showLandPurchaseModal', handleShowPurchaseModal as EventListener);
    
    return () => {
      window.removeEventListener('showLandPurchaseModal', handleShowPurchaseModal as EventListener);
    };
  }, []);

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
    if (sceneRef.current && sceneRef.current.water) {
      console.log('Polygon added, updating water effects');
      setTimeout(() => {
        if (sceneRef.current && sceneRef.current.water) {
          sceneRef.current.water.update(0);
        }
      }, 500);
    }
  }, []);

  const handlePolygonDeleted = useCallback(() => {
    if (sceneRef.current && sceneRef.current.water) {
      console.log('Polygon deleted, updating water effects');
      setTimeout(() => {
        if (sceneRef.current && sceneRef.current.water) {
          sceneRef.current.water.update(0);
        }
      }, 500);
    }
  }, []);

  // Set up Three.js scene - only depends on polygons and loading
  // NOT dependent on activeView, highQuality, or selectedPolygonId to prevent scene recreation
  useEffect(() => {
    if (!canvasRef.current || loading) return;
    
    // Prevent multiple initializations
    if (sceneRef.current) {
      console.log('Scene already initialized, skipping setup');
      return;
    }
    
    console.log(`Setting up Three.js scene`);

    // Calculate bounds for all polygons outside the try block to make it accessible to all nested functions
    const bounds = calculateBounds(polygons);
    console.log('Calculated bounds:', bounds);
    
    // Ensure ConsiglioDeiDieci exists in users data
    if (!users['ConsiglioDeiDieci']) {
      console.warn('ConsiglioDeiDieci not found in users data during scene setup! Adding default entry.');
      const updatedUsers = {
        ...users,
        'ConsiglioDeiDieci': {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        }
      };
      // Update the store with the modified users data
      usePolygonStore.setState({ users: updatedUsers });
    }
    
    // Add a fallback rendering mechanism
    const ensureRendering = () => {
      if (sceneRef.current && sceneRef.current.renderer && sceneRef.current.scene && sceneRef.current.camera) {
        console.log('Forcing fallback render');
        try {
          // Try direct rendering first
          sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
        } catch (error) {
          console.error('Error in fallback rendering:', error);
        }
      }
    };

    try {
      // Initialize scene
      const sceneSetup = new SceneSetup({
        canvas: canvasRef.current,
        activeView, // We'll still pass activeView, but handle view changes separately
        highQuality
      });
      sceneRef.current = sceneSetup;
      
      // Add a method forceRender to the scene
      if (sceneRef.current) {
        sceneRef.current.scene.userData.forceRender = () => {
          if (sceneRef.current && sceneRef.current.renderer) {
            sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
          }
        };
      }
      
      // Force rendering multiple times during initialization
      setTimeout(ensureRendering, 100);
      setTimeout(ensureRendering, 500);
      setTimeout(ensureRendering, 1000);
      setTimeout(ensureRendering, 2000);

      // Set up a periodic rendering check
      const renderingInterval = setInterval(ensureRendering, 5000);
      
      // Create water effect immediately
      if (sceneRef.current) {
        console.log('Creating advanced water simulation from PolygonViewer');
        const water = sceneRef.current.createWater();
      
        // Force multiple initial updates to ensure water is visible
        if (water) {
          water.update(0);
        
          // Schedule additional updates with delays
          setTimeout(() => {
            if (water) water.update(10);
          }, 100);
        
          setTimeout(() => {
            if (water) water.update(20);
          }, 300);
        
          setTimeout(() => {
            if (water) water.update(30);
          }, 600);
        }
      }
      
      // Add a GUARANTEED fallback water plane that will always be visible
      const createFallbackWater = () => {
        console.log('Creating GUARANTEED fallback water plane');
        
        // Create a simple blue plane
        const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
        const waterMaterial = new THREE.MeshBasicMaterial({
          color: 0x4d94ff,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        
        const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.y = 0.3; // Position it high enough to be visible
        waterMesh.renderOrder = 500; // Lower than the main water but still high
        
        // Add user data for identification
        waterMesh.userData.isFallbackWater = true;
        waterMesh.userData.alwaysVisible = true;
        
        // Add to scene
        if (sceneRef.current && sceneRef.current.scene) {
          sceneRef.current.scene.add(waterMesh);
        }
      };

      // Call this function immediately
      createFallbackWater();

      // Also set up an interval to check if the fallback water is still there
      const fallbackWaterInterval = setInterval(() => {
        if (sceneRef.current && sceneRef.current.scene) {
          let fallbackWaterFound = false;
          
          sceneRef.current.scene.traverse(object => {
            if (object.userData && object.userData.isFallbackWater) {
              fallbackWaterFound = true;
              object.visible = true; // Ensure it's visible
            }
          });
          
          if (!fallbackWaterFound) {
            createFallbackWater();
          }
        }
      }, 2000);
      
      // Add error handling for WebGL context loss using the function defined outside
      canvasRef.current.addEventListener('webglcontextlost', handleContextLost as unknown as EventListener);
    
      // Add custom event listeners for polygon changes to update water effects
      window.addEventListener('polygonAdded', handlePolygonAdded);
      window.addEventListener('polygonDeleted', handlePolygonDeleted);
    } catch (error) {
      console.error('Error setting up Three.js scene:', error);
    }
    
    // Clean up the interval in the return function
    return () => {
      if (typeof fallbackWaterInterval !== 'undefined') {
        clearInterval(fallbackWaterInterval);
      }
      if (typeof renderingInterval !== 'undefined') {
        clearInterval(renderingInterval);
      }
      // ... other cleanup code ...
    };
    
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
    
    // Initialize road manager
    if (sceneRef.current) {
      roadManagerRef.current = new RoadManager(sceneRef.current.scene);
      
      // Load roads from Airtable
      if (roadManagerRef.current) {
        roadManagerRef.current.loadRoadsFromAirtable()
          .then(() => {
            console.log('Roads loaded from Airtable');
          })
          .catch(error => {
            console.error('Failed to load roads from Airtable:', error);
          });
      }
    }
    
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
        const colorMap: Record<string, string> = {};
        
        Object.values(users).forEach(user => {
          if (user.user_name) {
            // Add coat of arms if available
            if (user.coat_of_arms_image) {
              coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
            }
            
            // Add color if available
            if (user.color) {
              colorMap[user.user_name] = user.color;
            }
          }
        });
        
        // Apply coat of arms and colors
        if (Object.keys(coatOfArmsMap).length > 0) {
          polygonRenderer.updateOwnerCoatOfArms(coatOfArmsMap);
          polygonRenderer.updateCoatOfArmsSprites();
        }
        
        if (Object.keys(colorMap).length > 0) {
          polygonRenderer.updateOwnerColors(colorMap);
          polygonRenderer.updatePolygonOwnerColors();
        }
      }
      
      // Apply updates immediately if we have the update functions
      if (typeof updatePolygonColors === 'function') {
        updatePolygonColors();
      }
      
      if (typeof updateCoatOfArms === 'function') {
        updateCoatOfArms();
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
          
          // Force a simple render on first frame
          if (sceneRef.current && sceneRef.current.renderer) {
            sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
          }
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
          
      
        // Update road visibility EVERY frame instead of periodically
        if (roadManagerRef.current) {
          roadManagerRef.current.updateRoadVisibility();
        }
        
        // Force update of all road meshes in the scene
        if (sceneRef.current && sceneRef.current.scene) {
          sceneRef.current.scene.traverse((object) => {
            if (object instanceof THREE.Mesh && 
                object.userData && 
                (object.userData.isRoad || object.userData.alwaysVisible)) {
              // Force visibility
              object.visible = true;
              
              // Ensure high render order
              object.renderOrder = 100; // Increased from 30 to 100
              
              // Update material
              if (object.material) {
                if (Array.isArray(object.material)) {
                  object.material.forEach(mat => {
                    if (mat) {
                      mat.needsUpdate = true;
                      if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) {
                        mat.depthWrite = false;
                        mat.polygonOffset = true;
                        mat.polygonOffsetFactor = -10;
                        mat.polygonOffsetUnits = -10;
                      }
                    }
                  });
                } else {
                  object.material.needsUpdate = true;
                  if (object.material instanceof THREE.MeshBasicMaterial || object.material instanceof THREE.MeshStandardMaterial) {
                    object.material.depthWrite = false;
                    object.material.polygonOffset = true;
                    object.material.polygonOffsetFactor = -10;
                    object.material.polygonOffsetUnits = -10;
                  }
                }
              }
            }
          });
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
              console.error('Composer render failed, using fallback direct rendering');
              if (sceneRef.current && sceneRef.current.renderer) {
                try {
                  sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
                } catch (innerError) {
                  console.error('Fallback rendering also failed:', innerError);
                }
              }
            }
          }
        }
        
        frameCount++;
      } catch (error) {
        console.error('Animation loop error:', error);
        
        // Emergency fallback render
        if (sceneRef.current && sceneRef.current.renderer) {
          try {
            sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
          } catch (fallbackError) {
            // Last resort - create a new renderer
            if (canvasRef.current && sceneRef.current) {
              try {
                const emergencyRenderer = new THREE.WebGLRenderer({ 
                  canvas: canvasRef.current,
                  antialias: false,
                  alpha: true
                });
                emergencyRenderer.setSize(window.innerWidth, window.innerHeight);
                emergencyRenderer.render(sceneRef.current.scene, sceneRef.current.camera);
              } catch (emergencyError) {
                // Give up
              }
            }
          }
        }
      }
    };
    
    // Start animation loop
    const animationId = requestAnimationFrame(animate);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      
      // Clean up all components
      if (interactionManagerRef.current) interactionManagerRef.current.cleanup();
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      if (bridgeRendererRef.current) bridgeRendererRef.current.cleanup();
      if (roadManagerRef.current) roadManagerRef.current.cleanup();
      if (sceneRef.current) sceneRef.current.cleanup();
      
      // Remove event listeners
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('webglcontextlost', handleContextLost as unknown as EventListener);
      }
      window.removeEventListener('polygonAdded', handlePolygonAdded);
      window.removeEventListener('polygonDeleted', handlePolygonDeleted);
    
      // Clear all timers
      clearTimeout(interactionManagerTimer);
      clearTimeout(bridgeRendererTimer);
      clearTimeout(coatOfArmsTimer);
    
      // Clear references
      sceneRef.current = null;
      polygonRendererRef.current = null;
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
  
  // Add a function to force update of all visual elements
  const forceVisualUpdate = useCallback(() => {
    if (polygonRendererRef.current) {
      console.log('Forcing update of all visual elements');
      
      // Update view mode
      polygonRendererRef.current.updateViewMode(activeView);
      
      // Update colors
      updatePolygonColors();
      
      // Update coat of arms
      updateCoatOfArms();
      
      // Force specific updates for land view
      if (activeView === 'land') {
        if (polygonRendererRef.current) {
          if (polygonRendererRef.current) {
            polygonRendererRef.current.updatePolygonOwnerColors();
            polygonRendererRef.current.updateCoatOfArmsSprites();
          }
        }
      }
      
      // Force a render
      if (sceneRef.current && sceneRef.current.scene && sceneRef.current.scene.userData && sceneRef.current.scene.userData.forceRender) {
        sceneRef.current.scene.userData.forceRender();
      }
    }
  }, [activeView, updatePolygonColors, updateCoatOfArms]);
  
  // Add effect to periodically force visual updates when in land view
  useEffect(() => {
    if (activeView === 'land') {
      // Force an initial update
      forceVisualUpdate();
      
      // Set up a timer to periodically force updates
      const timer = setInterval(forceVisualUpdate, 5000);
      
      return () => {
        clearInterval(timer);
      };
    }
  }, [activeView, forceVisualUpdate]);
  
  // Effect to show/hide the building menu based on activeView
  useEffect(() => {
    // Show building menu when in buildings view and a polygon is selected
    if (activeView === 'buildings' && selectedPolygonId) {
      setBuildingMenuVisible(true);
    } else {
      setBuildingMenuVisible(false);
    }
  }, [activeView, selectedPolygonId]);
  
  // Add this effect to disable/enable interaction manager based on road creation mode
  useEffect(() => {
    if (interactionManagerRef.current) {
      interactionManagerRef.current.setEnabled(!roadCreationActive);
    }
  }, [roadCreationActive]);
  
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
            
            // Force an update of owner colors
            polygonRendererRef.current.updatePolygonOwnerColors();
            
            // Force an update of coat of arms sprites
            polygonRendererRef.current.updateCoatOfArmsSprites();
            
            // If we have users data, apply it again to ensure it's displayed
            if (users && Object.keys(users).length > 0) {
              const coatOfArmsMap: Record<string, string> = {};
              const colorMap: Record<string, string> = {};
              
              Object.values(users).forEach(user => {
                if (user.user_name) {
                  if (user.coat_of_arms_image) {
                    coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
                  }
                  if (user.color) {
                    colorMap[user.user_name] = user.color;
                  } else if (user.user_name === 'ConsiglioDeiDieci') {
                    colorMap[user.user_name] = '#8B0000'; // Dark red
                  }
                }
              });
              
              if (Object.keys(coatOfArmsMap).length > 0) {
                polygonRendererRef.current.updateOwnerCoatOfArms(coatOfArmsMap);
              }
              if (Object.keys(colorMap).length > 0) {
                polygonRendererRef.current.updateOwnerColors(colorMap);
              }
            }
          }
        }
        
        // Update market panel visibility based on active view
        setMarketPanelVisible(activeView === 'markets');
        
        
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
  }, [activeView, loadLandOwners, users]);

  // Add handler for road creation completion
  const handleRoadComplete = useCallback((roadPoints: THREE.Vector3[]) => {
    console.log(`PolygonViewer: Road complete with ${roadPoints.length} points`);
    
    if (roadManagerRef.current) {
      // Get the curvature value from a state variable or use a default
      const curvature = 0.5; // Default curvature
      console.log(`PolygonViewer: Creating road with curvature ${curvature}`);
      const roadId = roadManagerRef.current.createRoad(roadPoints, curvature);
      console.log(`PolygonViewer: Road created with ID ${roadId}`);
      
      // Get the current wallet address
      const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
      
      // Save the road to Airtable
      if (roadId) {
        roadManagerRef.current.saveRoadToAirtable(roadId, selectedPolygonId, walletAddress)
          .then(response => {
            console.log('Road saved to Airtable:', response);
            // Show success message
            alert('Road created successfully!');
          })
          .catch(error => {
            console.error('Failed to save road to Airtable:', error);
            // Show error message but don't remove the road from the scene
            alert('Road created but failed to save to database. It may disappear when you reload the page.');
          });
      }
    } else {
      console.error('PolygonViewer: Road manager not initialized');
    }
    
    setRoadCreationActive(false);
  }, [selectedPolygonId]);

  // Add handler for road creation cancellation
  const handleRoadCancel = useCallback(() => {
    setRoadCreationActive(false);
  }, []);

  // Add a separate effect to handle quality changes
  useEffect(() => {
    // Update quality when highQuality changes
    if (sceneRef.current) {
      console.log(`Updating quality to ${highQuality ? 'high' : 'low'}`);
      
      // Update scene quality
      sceneRef.current.updateQuality(highQuality);
      
      // Update polygon renderer
      if (polygonRendererRef.current) {
        polygonRendererRef.current.updateQuality(!highQuality);
      }
      
      // Update bridge renderer
      if (bridgeRendererRef.current) {
        bridgeRendererRef.current.updateQuality(!highQuality);
      }
      
      // Force visual updates after quality change
      setTimeout(() => {
        if (activeView === 'land' && polygonRendererRef.current) {
          console.log('Forcing visual updates after quality change');
          if (polygonRendererRef.current) {
            polygonRendererRef.current.updatePolygonOwnerColors();
            polygonRendererRef.current.updateCoatOfArmsSprites();
          }
        }
      }, 500);
    }
  }, [highQuality, activeView]);
  
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
      preventAutoClose={true} // Add this prop to prevent auto-closing after purchase
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
      
      {/* Add Create Road button when in building view */}
      {activeView === 'buildings' && !roadCreationActive && (
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation(); // Stop propagation to prevent the click from reaching other handlers
              setRoadCreationActive(true);
            }}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-amber-700 transition-colors flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm1 4h10a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Road
          </button>
        </div>
      )}
      
      {/* Add the Market Panel */}
      <MarketPanel 
        visible={marketPanelVisible}
        onClose={() => setActiveView('land')}
      />

      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
      />
      
    
      {/* Add a persistent BackgroundMusic component */}
      <div className="fixed top-4 right-20 z-10">
        <BackgroundMusic initialVolume={0.24} autoplay={true} />
      </div>
    
      {/* Removed duplicate Transfer Compute Menu */}
      
      <LandPurchaseModal
        visible={purchaseModalVisible}
        landId={purchaseModalData.landId}
        landName={purchaseModalData.landName}
        transaction={purchaseModalData.transaction}
        onClose={() => setPurchaseModalVisible(false)}
        onComplete={() => {
          if (purchaseModalData.onComplete) {
            purchaseModalData.onComplete();
          }
        }}
      />
      
      {/* Building Menu */}
      <BuildingMenu 
        visible={buildingMenuVisible}
        onClose={() => {
          setBuildingMenuVisible(false);
          setSelectedPolygonId(null);
        }}
      />
      
      {/* Road Creator */}
      {roadCreationActive && sceneRef.current && sceneRef.current.scene && sceneRef.current.camera && (
        <RoadCreator
          scene={sceneRef.current.scene}
          camera={sceneRef.current.camera}
          active={roadCreationActive}
          onComplete={handleRoadComplete}
          onCancel={handleRoadCancel}
        />
      )}
    </div>
  );
}
