import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DockCreationManager } from './DockCreationManager';
import { eventBus, EventTypes } from '@/lib/eventBus';
import { getApiBaseUrl } from '@/lib/apiUtils';
import { getWalletAddress } from '@/lib/walletUtils';

interface DockCreatorProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  polygons: any[];
  active: boolean;
  onComplete: (dockData: any) => void;
  onCancel: () => void;
}

const DockCreator: React.FC<DockCreatorProps> = ({
  scene,
  camera,
  polygons,
  active,
  onComplete,
  onCancel
}) => {
  const [rotation, setRotation] = useState<number>(0);
  const [isPlacing, setIsPlacing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef<DockCreationManager | null>(null);

  // Initialize the dock creation manager
  useEffect(() => {
    if (active && scene && camera && polygons) {
      managerRef.current = new DockCreationManager({
        scene,
        camera,
        polygons
      });
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
  }, [active, scene, camera, polygons]);

  // Update active state
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.setActive(active);
    }
  }, [active]);

  // Handle mouse movement
  useEffect(() => {
    if (!active) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (managerRef.current) {
        managerRef.current.updateMousePosition(event.clientX, event.clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [active]);

  // Handle click to place dock
  useEffect(() => {
    if (!active) return;

    const handleClick = async (event: MouseEvent) => {
      if (isLoading || !managerRef.current) return;

      const dockData = managerRef.current.placeDock();
      if (dockData) {
        setIsPlacing(true);
        setIsLoading(true);
        
        try {
          // Get wallet address
          const walletAddress = getWalletAddress();
          if (!walletAddress) {
            setError('Please connect your wallet to place a dock');
            setIsLoading(false);
            return;
          }

          // Save dock to server
          const response = await fetch(`${getApiBaseUrl()}/api/docks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              landId: dockData.landId,
              position: {
                x: dockData.position.x,
                y: dockData.position.y,
                z: dockData.position.z
              },
              rotation: dockData.rotation,
              createdBy: walletAddress
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to create dock: ${response.status} ${response.statusText}`);
          }

          const savedDock = await response.json();
          
          // Emit dock placed event
          eventBus.emit(EventTypes.DOCK_PLACED, {
            dock: savedDock
          });
          
          // Call onComplete callback
          onComplete(savedDock);
        } catch (error) {
          console.error('Error creating dock:', error);
          setError(error instanceof Error ? error.message : 'Failed to create dock');
        } finally {
          setIsLoading(false);
          setIsPlacing(false);
        }
      } else {
        setError('Cannot place dock here. Please find a water edge adjacent to land.');
        setTimeout(() => setError(null), 3000);
      }
    };

    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('click', handleClick);
    };
  }, [active, isLoading, onComplete]);

  // Update rotation
  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.updateRotation(rotation);
    }
  }, [rotation]);

  if (!active) return null;

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white p-4 rounded-lg z-30 w-96">
      <h3 className="text-lg font-serif mb-4 text-center">Dock Placement</h3>
      
      {error && (
        <div className="bg-red-500/70 p-2 rounded mb-4 text-white text-sm">
          {error}
        </div>
      )}
      
      <div className="mb-4">
        <label className="block text-sm mb-1">Rotation</label>
        <input
          type="range"
          min="0"
          max={Math.PI * 2}
          step="0.1"
          value={rotation}
          onChange={(e) => setRotation(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      
      <div className="text-sm mb-4">
        <p>Position your cursor where you want to place the dock.</p>
        <p>Docks must be placed at the edge of land parcels adjacent to water.</p>
      </div>
      
      <div className="flex justify-between">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
          disabled={isLoading}
        >
          Cancel
        </button>
        
        {isLoading && (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DockCreator;
