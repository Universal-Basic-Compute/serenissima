'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import SimpleCamera from './SimpleCamera';
import { WaterFacade as SimpleWater, WaterQualityLevel } from './SimpleWater';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import { calculateBounds } from './utils';
import { getApiBaseUrl } from '@/lib/apiUtils';
import LandDetailsPanel from './LandDetailsPanel'; // Import the existing panel

export default function SimpleViewer({ qualityMode = 'high', activeView = 'land' }: {
  qualityMode: 'high' | 'performance';
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance';
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
  
  // State for land selection and details panel
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  
  // Define loadUsers as a reusable function
  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/users`);
      if (response.ok) {
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
            };
          }
          
          setUsers(usersMap);
          console.log('Loaded users data:', Object.keys(usersMap).length, 'users');
          return usersMap;
        }
      }
      return {};
    } catch (error) {
      console.error('Error loading users data:', error);
      return {};
    }
  }, []);
  
  // Load users data on mount
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  
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
  
  // Add state variables for tracking coat of arms dragging
  
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
      }
    });
    polygonRendererRef.current = polygonRenderer;
    
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
    };
  }, [polygons, loading, qualityMode, activeView, users]);
  
  // Update view mode when activeView changes
  useEffect(() => {
    if (polygonRendererRef.current) {
      polygonRendererRef.current.updateViewMode(activeView);
    }
  }, [activeView]);
  
  // Add effect to update coat of arms when user data changes
  useEffect(() => {
    const handleUserProfileUpdated = (event: CustomEvent) => {
      console.log('User profile updated event detected in SimpleViewer');
      if (polygonRendererRef.current) {
        // Reload users data
        loadUsers().then(() => {
          // Update coat of arms in the renderer
          if (polygonRendererRef.current) {
            polygonRendererRef.current.createCoatOfArmsSprites();
          }
        });
      }
    };
    
    window.addEventListener('userProfileUpdated', handleUserProfileUpdated as EventListener);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleUserProfileUpdated as EventListener);
    };
  }, [loadUsers]);
  
  // Add handlers for coat of arms dragging
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!polygonRendererRef.current || !cameraControllerRef.current) return;
    
    // Only handle in land view
    if (activeView !== 'land') return;
    
    // Create a raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    
    // Update the raycaster
    raycaster.setFromCamera(mouse, cameraControllerRef.current.camera);
    
    // Get all coat of arms sprites
    const coatOfArmsSprites = Object.values(polygonRendererRef.current.coatOfArmsSprites);
    
    // Find intersections
    const intersects = raycaster.intersectObjects(coatOfArmsSprites, true);
    
    if (intersects.length > 0) {
      // Find the polygon ID from the intersected object
      let clickedId = null;
      
      // Check if the object or its parent has the polygonId
      let targetObject = intersects[0].object;
      while (targetObject && !clickedId) {
        if (targetObject.userData && targetObject.userData.polygonId) {
          clickedId = targetObject.userData.polygonId;
        }
        targetObject = targetObject.parent;
      }
      
      // If we found a polygon ID, start dragging
      if (clickedId) {
        setIsDraggingCoatOfArms(true);
        setDraggedCoatOfArmsId(clickedId);
        polygonRendererRef.current.startDraggingCoatOfArms(
          clickedId, 
          cameraControllerRef.current.camera, 
          event.clientX, 
          event.clientY
        );
        
        // Prevent other click handlers
        event.stopPropagation();
      }
    }
  }, [activeView]);
  
  const handleCoatOfArmsDrag = useCallback((event: MouseEvent) => {
    if (isDraggingCoatOfArms && draggedCoatOfArmsId && polygonRendererRef.current && cameraControllerRef.current) {
      polygonRendererRef.current.updateDraggingCoatOfArms(
        cameraControllerRef.current.camera,
        event.clientX,
        event.clientY
      );
      
      // Prevent other handlers while dragging
      event.preventDefault();
      event.stopPropagation();
    }
  }, [isDraggingCoatOfArms, draggedCoatOfArmsId]);
  
  const handleMouseUp = useCallback(() => {
    if (isDraggingCoatOfArms && polygonRendererRef.current) {
      polygonRendererRef.current.stopDraggingCoatOfArms();
      setIsDraggingCoatOfArms(false);
      setDraggedCoatOfArmsId(null);
    }
  }, [isDraggingCoatOfArms]);
  
  // The handleMouseDown function is already defined above
  
  // Add event listeners for dragging
  useEffect(() => {
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleCoatOfArmsDrag);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleCoatOfArmsDrag);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleCoatOfArmsDrag, handleMouseUp]);
  
  // Update water quality when parent component changes quality mode
  useEffect(() => {
    if (waterRef.current) {
      waterRef.current.setQuality(qualityMode === 'high' ? 'high' : 'medium');
    }
  }, [qualityMode]);
  
  // Add effect to initialize coat of arms drag and drop
  useEffect(() => {
    if (activeView === 'land' && polygonRendererRef.current && canvasRef.current) {
      console.log('Initializing coat of arms drag and drop');
      polygonRendererRef.current.initCoatOfArmsDragDrop(canvasRef.current);
    }
  }, [activeView]);
  
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
