import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { eventBus, EventTypes } from '@/lib/eventBus';
import { getApiBaseUrl } from '@/lib/apiUtils';

interface DockData {
  id: string;
  landId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  connectionPoints?: { x: number; y: number; z: number }[];
  createdBy: string;
  createdAt: string;
}

interface DockRendererProps {
  scene: THREE.Scene;
  active: boolean;
}

const DockRenderer: React.FC<DockRendererProps> = ({ scene, active }) => {
  const docksRef = useRef<DockData[]>([]);
  const meshesRef = useRef<THREE.Object3D[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const modelRef = useRef<THREE.Group | null>(null);
  const loaderRef = useRef<GLTFLoader>(new GLTFLoader());
  const modelLoadingRef = useRef<boolean>(false);
  
  // Load the dock model once
  useEffect(() => {
    if (!modelRef.current && !modelLoadingRef.current) {
      modelLoadingRef.current = true;
      
      loaderRef.current.load(
        '/assets/buildings/models/public-dock/model.glb',
        (gltf) => {
          console.log('Dock model loaded successfully');
          modelRef.current = gltf.scene;
          
          // If we already have docks to render, render them now
          if (active && docksRef.current.length > 0) {
            renderDocks();
          }
          
          modelLoadingRef.current = false;
        },
        (progress) => {
          console.log(`Loading dock model: ${(progress.loaded / progress.total) * 100}%`);
        },
        (error) => {
          console.error('Error loading dock model:', error);
          modelLoadingRef.current = false;
        }
      );
    }
  }, [active]);
  
  // Load docks on mount and when active changes
  useEffect(() => {
    if (!active) {
      // Hide docks when not active
      meshesRef.current.forEach(mesh => {
        if (mesh) mesh.visible = false;
      });
      return;
    }
    
    const loadDocks = async () => {
      try {
        setIsLoading(true);
        
        // Fetch docks from API
        const response = await fetch(`${getApiBaseUrl()}/api/docks`);
        
        if (!response.ok) {
          throw new Error(`Failed to load docks: ${response.status} ${response.statusText}`);
        }
        
        const docks = await response.json();
        docksRef.current = docks;
        
        // Render docks if model is loaded
        if (modelRef.current) {
          renderDocks();
        }
        
        // Show docks
        meshesRef.current.forEach(mesh => {
          if (mesh) mesh.visible = true;
        });
      } catch (error) {
        console.error('Error loading docks:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadDocks();
  }, [active, scene]);
  
  // Listen for dock events
  useEffect(() => {
    const handleDockPlaced = (data: any) => {
      if (data && data.dockId) {
        // Fetch the new dock data
        fetch(`${getApiBaseUrl()}/api/docks/${data.dockId}`)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch dock: ${response.status} ${response.statusText}`);
            }
            return response.json();
          })
          .then(dock => {
            // Add to our list
            docksRef.current.push(dock);
            // Render the new dock if model is loaded
            if (modelRef.current) {
              renderDock(dock);
            }
          })
          .catch(error => {
            console.error('Error loading new dock:', error);
          });
      }
    };
    
    const handleDockDeleted = (data: any) => {
      if (data && data.dockId) {
        const index = docksRef.current.findIndex(dock => dock.id === data.dockId);
        if (index >= 0) {
          // Remove from our list
          docksRef.current.splice(index, 1);
          
          // Remove the mesh
          if (meshesRef.current[index]) {
            scene.remove(meshesRef.current[index]);
            disposeMesh(meshesRef.current[index]);
            meshesRef.current.splice(index, 1);
          }
        }
      }
    };
    
    // Subscribe to events
    const dockPlacedSubscription = eventBus.subscribe(EventTypes.DOCK_PLACED, handleDockPlaced);
    const dockDeletedSubscription = eventBus.subscribe(EventTypes.DOCK_DELETED, handleDockDeleted);
    
    return () => {
      // Unsubscribe from events
      dockPlacedSubscription.unsubscribe();
      dockDeletedSubscription.unsubscribe();
    };
  }, [scene]);
  
  // Helper function to dispose of a mesh and its children
  const disposeMesh = (object: THREE.Object3D) => {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Remove all dock meshes
      meshesRef.current.forEach(mesh => {
        if (mesh) {
          scene.remove(mesh);
          disposeMesh(mesh);
        }
      });
      meshesRef.current = [];
    };
  }, [scene]);
  
  // Render all docks
  const renderDocks = () => {
    // Clear existing meshes
    meshesRef.current.forEach(mesh => {
      if (mesh) {
        scene.remove(mesh);
        disposeMesh(mesh);
      }
    });
    meshesRef.current = [];
    
    // Render each dock
    docksRef.current.forEach(dock => {
      renderDock(dock);
    });
  };
  
  // Render a single dock
  const renderDock = (dock: DockData) => {
    if (!modelRef.current) {
      console.warn('Dock model not loaded yet');
      return null;
    }
    
    // Clone the model for this dock instance
    const dockModel = modelRef.current.clone();
    
    // Position and rotate the dock
    dockModel.position.set(
      dock.position.x,
      dock.position.y || 0.1, // Default to slightly above water level
      dock.position.z
    );
    dockModel.rotation.y = dock.rotation;
    
    // Scale the model to half its original size
    dockModel.scale.set(0.5, 0.5, 0.5);
    
    // Add to scene
    scene.add(dockModel);
    meshesRef.current.push(dockModel);
    
    // Add connection points
    if (dock.connectionPoints && dock.connectionPoints.length > 0) {
      dock.connectionPoints.forEach(point => {
        const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x4CAF50, // Green for connection points
          transparent: true,
          opacity: 0.7
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        sphere.position.set(point.x, point.y || 0.2, point.z);
        
        scene.add(sphere);
        meshesRef.current.push(sphere);
      });
    }
    
    return dockModel;
  };
  
  // Fallback rendering if model fails to load
  const renderFallbackDock = (dock: DockData) => {
    // Create a more detailed dock mesh at half the original size
    const dockGroup = new THREE.Group();
    
    // Main dock platform - half the original size
    const platformGeometry = new THREE.BoxGeometry(1, 0.2, 2.5); // Was 2x0.2x5
    const woodMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8B4513, // Brown color for wood
      roughness: 0.8,
      metalness: 0.2
    });
    
    const platform = new THREE.Mesh(platformGeometry, woodMaterial);
    dockGroup.add(platform);
    
    // Add posts at corners
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x6B4226, // Darker brown for posts
      roughness: 0.9,
      metalness: 0.1
    });
    
    // Add four posts at the corners - adjust positions for smaller size
    const postPositions = [
      [-0.45, 0.15, -1.2], // Half of original [-0.9, 0.15, -2.4]
      [0.45, 0.15, -1.2],  // Half of original [0.9, 0.15, -2.4]
      [-0.45, 0.15, 1.2],  // Half of original [-0.9, 0.15, 2.4]
      [0.45, 0.15, 1.2]    // Half of original [0.9, 0.15, 2.4]
    ];
    
    postPositions.forEach(pos => {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(pos[0], pos[1], pos[2]);
      dockGroup.add(post);
    });
    
    // Position and rotate the dock
    dockGroup.position.set(
      dock.position.x,
      dock.position.y || 0.1, // Default to slightly above water level
      dock.position.z
    );
    dockGroup.rotation.y = dock.rotation;
    
    // Add to scene
    scene.add(dockGroup);
    meshesRef.current.push(dockGroup);
    
    return dockGroup;
  };
  
  return null; // This is a non-visual component
};

export default DockRenderer;
