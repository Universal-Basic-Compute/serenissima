import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
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
        
        // Render docks
        renderDocks();
        
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
            // Render the new dock
            renderDock(dock);
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
            meshesRef.current[index].geometry.dispose();
            if (Array.isArray(meshesRef.current[index].material)) {
              meshesRef.current[index].material.forEach(m => m.dispose());
            } else if (meshesRef.current[index].material) {
              meshesRef.current[index].material.dispose();
            }
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
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Remove all dock meshes
      meshesRef.current.forEach(mesh => {
        if (mesh) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
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
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
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
    // Create a simple dock mesh
    const geometry = new THREE.BoxGeometry(2, 0.2, 5);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x8B4513, // Brown color for wood
      roughness: 0.8,
      metalness: 0.2
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position and rotate the dock
    mesh.position.set(
      dock.position.x,
      dock.position.y || 0.1, // Default to slightly above water level
      dock.position.z
    );
    mesh.rotation.y = dock.rotation;
    
    // Add to scene
    scene.add(mesh);
    meshesRef.current.push(mesh);
    
    // Add connection points (simplified)
    if (dock.connectionPoints && dock.connectionPoints.length > 0) {
      dock.connectionPoints.forEach(point => {
        const sphereGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        sphere.position.set(point.x, point.y || 0.2, point.z);
        
        scene.add(sphere);
        meshesRef.current.push(sphere);
      });
    }
    
    return mesh;
  };
  
  return null; // This is a non-visual component
};

export default DockRenderer;
