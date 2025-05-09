'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import SimpleCamera from './SimpleCamera';
import { WaterFacade as SimpleWater, WaterQualityLevel } from '../../lib/threejs/WaterFacade';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import { IncomePolygonRenderer } from '../../lib/threejs/IncomePolygonRenderer';
import { calculateBounds } from './utils';
import { getApiBaseUrl } from '@/lib/apiUtils';
import LandDetailsPanel from './LandDetailsPanel'; // Import the existing panel

export default function SimpleViewer({ qualityMode = 'high', activeView = 'land' }: {
  qualityMode: 'high' | 'performance';
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Record<string, any>>({});
  
  // References to our scene components
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraControllerRef = useRef<SimpleCamera | null>(null);
  const waterRef = useRef<SimpleWater | null>(null);
  const polygonRendererRef = useRef<SimplePolygonRenderer | null>(null);
  const incomeRendererRef = useRef<IncomePolygonRenderer | null>(null);
  
  // State for land selection and details panel
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  
  // Define loadUsers as a reusable function
  const loadUsers = useCallback(async () => {
    try {
      // Add a fallback URL in case getApiBaseUrl() fails
      const apiUrl = getApiBaseUrl() || window.location.origin;
      
      // Try to fetch from the API
      console.log(`Attempting to fetch users from ${apiUrl}/api/users`);
      
      // Add a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${apiUrl}/api/users`, {
        signal: controller.signal
      }).catch(error => {
        console.warn('Fetch request failed:', error);
        return null; // Return null to indicate fetch failed
      });
      
      clearTimeout(timeoutId);
      
      // If fetch failed or returned non-OK status, use fallback data
      if (!response || !response.ok) {
        console.warn(`Using fallback user data because API is unavailable (${response ? response.status : 'connection failed'})`);
        
        // Create default users as fallback
        const defaultUsers = {
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        };
        
        setUsers(defaultUsers);
        console.log('Using default users data due to API error');
        return defaultUsers;
      }
      
      const data = await response.json();
      if (data && Array.isArray(data)) {
        const usersMap: Record<string, any> = {};
        data.forEach(user => {
          if (user.user_name) {
            usersMap[user.user_name] = user;
          }
        });
        
        // Ensure ConsiglioDeiDieci is always present
        if (!usersMap['ConsiglioDeiDieci']) {
          usersMap['ConsiglioDeiDieci'] = {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        }
        
        setUsers(usersMap);
        console.log('Loaded users data:', Object.keys(usersMap).length, 'users');
        return usersMap;
      } else {
        console.warn('Invalid users data format received:', data);
        
        // Return fallback data
        const fallbackUsers = {
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000',
            coat_of_arms_image: null
          }
        };
        
        setUsers(fallbackUsers);
        return fallbackUsers;
      }
    } catch (error) {
      console.error('Error loading users data:', error);
      
      // Create a default ConsiglioDeiDieci user as fallback
      const fallbackUsers = {
        'ConsiglioDeiDieci': {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        }
      };
      
      setUsers(fallbackUsers);
      console.log('Using fallback users data due to error');
      return fallbackUsers;
    }
  }, []);
  
  // Load users data on mount
  useEffect(() => {
    loadUsers();
    
    // Load income data after users
    try {
      const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
      const incomeService = getIncomeDataService();
      
      // Load income data or generate simulated data
      incomeService.loadIncomeData().catch(error => {
        console.error('Error loading income data:', error);
        // Generate simulated data as fallback
        incomeService.generateSimulatedIncomeData(polygons);
      });
    } catch (error) {
      console.warn('Error initializing income data service:', error);
    }
  }, [loadUsers, polygons]);
  
  // Load polygons (still needed to calculate bounds)
  useEffect(() => {
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        if (data.polygons) {
          setPolygons(data.polygons);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
        setLoading(false);
      });
  }, []);
  
  // Fetch land owners
  useEffect(() => {
    const fetchLandOwners = async () => {
      try {
        const response = await fetch('/api/get-land-owners');
        if (response.ok) {
          const data = await response.json();
          if (data.lands && Array.isArray(data.lands)) {
            const ownersMap: Record<string, string> = {};
            data.lands.forEach((land: any) => {
              if (land.id && land.owner) {
                ownersMap[land.id] = land.owner;
              }
            });
            setLandOwners(ownersMap);
          }
        }
      } catch (error) {
        console.error('Error fetching land owners:', error);
      }
    };
    
    fetchLandOwners();
  }, []);
  
  // Event handlers for mouse interaction
  const handleMouseMove = (event: MouseEvent) => {
    if (polygonRendererRef.current && canvasRef.current) {
      polygonRendererRef.current.handleMouseMove(event, canvasRef.current);
    }
  };

  const handleMouseClick = (event: MouseEvent) => {
    if (polygonRendererRef.current && canvasRef.current) {
      polygonRendererRef.current.handleMouseClick(event, canvasRef.current);
    }
  };
  
  // Add event listeners for mouse interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('click', handleMouseClick);
      
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('click', handleMouseClick);
      };
    }
  }, []);
  
  // Set up Three.js scene
  useEffect(() => {
    if (!canvasRef.current || loading || polygons.length === 0) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB'); // Light sky blue
    sceneRef.current = scene;
    
    // Create renderer with logarithmic depth buffer
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      antialias: true,
      logarithmicDepthBuffer: true  // Enable logarithmic depth buffer to prevent z-fighting
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    
    // Calculate bounds for all polygons (still needed for water size)
    const bounds = calculateBounds(polygons);
    
    // Create camera controller
    const cameraController = new SimpleCamera(renderer.domElement);
    cameraControllerRef.current = cameraController;
    
    // IMPORTANT: Expose scene, camera, and polygons to window object
    if (typeof window !== 'undefined') {
      window.__threeContext = {
        scene,
        camera: cameraController.camera,
        renderer
      };
      
      // Also expose on canvas element for backward compatibility
      if (canvasRef.current) {
        canvasRef.current.__scene = scene;
        canvasRef.current.__camera = cameraController.camera;
        canvasRef.current.__renderer = renderer;
      }
      
      // Store polygon data on window
      window.__polygonData = polygons;
    }
    
    // Create water first (so it's rendered first)
    const waterSize = Math.max(bounds.scale * 500, 1000);
    const water = new SimpleWater({
      scene,
      size: waterSize,
      quality: qualityMode === 'high' ? 'high' : 'medium',
      position: { y: 0 } // Explicitly set y position to 0
    });
    waterRef.current = water;
    
    // Create polygon renderer after water, passing activeView, users, camera, and selection callback
    const polygonRenderer = new SimplePolygonRenderer({
      scene,
      polygons,
      bounds,
      activeView,
      users,
      camera: cameraController.camera, // Pass the camera
      onLandSelected: (landId) => {
        // Handle land selection
        setSelectedPolygonId(landId);
      },
      sandColor: 0xfff0c0 // Add this line to make land lighter and more yellow
    });
    polygonRendererRef.current = polygonRenderer;
    
    // Create income renderer if in land view
    if (activeView === 'land') {
      console.log('Creating income renderer for land view');
      const incomeRenderer = new IncomePolygonRenderer({
        scene,
        polygons,
        bounds
      });
      incomeRendererRef.current = incomeRenderer;
    }
    
    // Create income renderer if in land view
    if (activeView === 'land') {
      console.log('Creating income renderer for land view');
      const incomeRenderer = new IncomePolygonRenderer({
        scene,
        polygons,
        bounds
      });
      incomeRendererRef.current = incomeRenderer;
    }
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (cameraController) {
        cameraController.update();
      }
      
      if (waterRef.current) {
        waterRef.current.update();
      }
      
      renderer.render(scene, cameraController.camera);
    };
    
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!cameraController || !renderer) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      cameraController.camera.aspect = width / height;
      cameraController.camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      if (incomeRendererRef.current) incomeRendererRef.current.cleanup();
      if (waterRef.current) waterRef.current.dispose();
      if (cameraController) cameraController.cleanup();
      if (renderer) renderer.dispose();
      
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      
      // Clean up window references
      if (typeof window !== 'undefined') {
        delete window.__threeContext;
        delete window.__polygonData;
        
        if (canvasRef.current) {
          delete canvasRef.current.__scene;
          delete canvasRef.current.__camera;
          delete canvasRef.current.__renderer;
        }
      }
    };
  }, [polygons, loading, qualityMode, activeView, users]);
  
  // Update view mode when activeView changes
  useEffect(() => {
    if (polygonRendererRef.current) {
      polygonRendererRef.current.updateViewMode(activeView);
    }
    
    // Show/hide income visualization based on view mode
    if (incomeRendererRef.current) {
      incomeRendererRef.current.setVisible(activeView === 'land');
    }
  }, [activeView]);
  
  // Add effect to update coat of arms when user data changes
  useEffect(() => {
    const handleUserProfileUpdated = (event: CustomEvent) => {
      console.log('User profile updated event detected in SimpleViewer');
      if (polygonRendererRef.current) {
        // Reload users data
        loadUsers().then(() => {
          // Only update coat of arms in the renderer if we're in land view
          if (polygonRendererRef.current && activeView === 'land') {
            // Force a refresh by updating the coat of arms map
            const updatedUsers = users || {};
            const coatOfArmsMap: Record<string, string> = {};
            
            Object.values(updatedUsers).forEach(user => {
              if (user.user_name && user.coat_of_arms_image) {
                coatOfArmsMap[user.user_name] = user.coat_of_arms_image;
              }
            });
            
            if (Object.keys(coatOfArmsMap).length > 0) {
              polygonRendererRef.current.updateCoatOfArms(coatOfArmsMap);
            }
          }
        });
      }
    };
    
    window.addEventListener('userProfileUpdated', handleUserProfileUpdated as EventListener);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleUserProfileUpdated as EventListener);
    };
  }, [loadUsers, activeView, users]);
  
  
  // The handleMouseDown function is already defined above
  
  
  // Update water quality when parent component changes quality mode
  useEffect(() => {
    if (waterRef.current) {
      waterRef.current.setQuality(qualityMode === 'high' ? 'high' : 'medium');
    }
  }, [qualityMode]);
  
  
  // Update quality mode when it changes from parent
  useEffect(() => {
    console.log('Quality mode changed to:', qualityMode);
    if (waterRef.current) {
      waterRef.current.setQuality(qualityMode === 'high' ? 'high' : 'medium');
    }
  }, [qualityMode]);
  
  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Land Details Panel */}
      <LandDetailsPanel
        selectedPolygonId={selectedPolygonId}
        onClose={() => {
          setSelectedPolygonId(null);
          // Also deselect in the renderer
          if (polygonRendererRef.current) {
            polygonRendererRef.current.deselectLand();
          }
        }}
        polygons={polygons}
        landOwners={landOwners}
      />
    </div>
  );
}
