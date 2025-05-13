import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WaterFacade as SimpleWater } from '../../lib/threejs/WaterFacade';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import { calculateBounds } from './utils';
import { eventBus, EventTypes } from '@/lib/eventBus';

// Extend EventTypes if SCENE_BASE_RENDERED is missing
declare module '@/lib/eventBus' {
  interface EventTypes {
    SCENE_BASE_RENDERED: string;
  }
}
import { buildingRendererManager } from '@/lib/services/BuildingRendererManager';

interface BaseSceneLayerProps {
  scene: THREE.Scene;
  polygons: any[];
  waterQuality: 'high' | 'medium' | 'low';
}

const BaseSceneLayer: React.FC<BaseSceneLayerProps> = ({ 
  scene, 
  polygons, 
  waterQuality 
}) => {
  // References to persistent elements
  const waterRef = useRef<SimpleWater | null>(null);
  const polygonRendererRef = useRef<SimplePolygonRenderer | null>(null);
  const isInitializedRef = useRef<boolean>(false);
  const buildingsInitializedRef = useRef<boolean>(false);

  // Initialize base scene elements once
  useEffect(() => {
    // Skip if already initialized or missing required props
    if (isInitializedRef.current || !scene || polygons.length === 0) return;

    console.log('BaseSceneLayer: Initializing persistent water and land elements');

    // Calculate bounds for all polygons
    const bounds = calculateBounds(polygons);

    // Create water first (so it's rendered first)
    const waterSize = Math.max(bounds.scale * 500, 1000);
    const water = new SimpleWater({
      scene,
      size: waterSize,
      quality: waterQuality,
      position: { y: 0 } // Explicitly set y position to 0
    });
    waterRef.current = water;

    // Create polygon renderer for land only
    const polygonRenderer = new SimplePolygonRenderer({
      scene,
      polygons,
      bounds,
      activeView: 'land', // Initial view doesn't matter, we'll only use this for land
      sandColor: 0xfff0c0, // Lighter, more yellow sand
      landOnly: true // Only render the land, not other elements
    });
    polygonRendererRef.current = polygonRenderer;

    // Mark as initialized
    isInitializedRef.current = true;

    // Emit event to notify that base scene is rendered
    eventBus.emit(EventTypes.SCENE_BASE_RENDERED, { 
      waterInitialized: true,
      landInitialized: true
    });

    // Cleanup function
    return () => {
      console.log('BaseSceneLayer: Cleaning up (this should only happen on unmount)');
      if (waterRef.current) waterRef.current.dispose();
      if (polygonRendererRef.current) polygonRendererRef.current.cleanup();
      isInitializedRef.current = false;
    };
  }, [scene, polygons, waterQuality]);

  // Initialize buildings once after land and water are ready
  useEffect(() => {
    if (!isInitializedRef.current || buildingsInitializedRef.current || !scene) return;

    console.log('BaseSceneLayer: Initializing persistent buildings');

    // Add a delay to ensure water and land are fully rendered before loading buildings
    setTimeout(() => {
      // Check again that scene is still valid
      if (!scene) {
        console.error('BaseSceneLayer: Scene became undefined before initializing buildings');
        return;
      }
      
      // Initialize the building renderer manager
      console.log('BaseSceneLayer: Initializing buildingRendererManager with scene', scene);
      buildingRendererManager.initialize(scene);
      
      // Load all buildings
      buildingRendererManager.refreshBuildings()
        .then(() => {
          console.log('BaseSceneLayer: Buildings loaded successfully');
          buildingsInitializedRef.current = true;
          
          // Emit event to notify that buildings are rendered
          eventBus.emit(EventTypes.SCENE_BASE_RENDERED, {
            buildingsInitialized: true
          });
          
          // Ensure buildings are visible by default
          window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
          
          // Check if buildings are visible after a delay
          setTimeout(() => {
            const buildingCount = buildingRendererManager.getBuildingMeshes().size;
            if (buildingCount === 0) {
              console.warn('BaseSceneLayer: No buildings visible after initialization, refreshing again');
              buildingRendererManager.refreshBuildings()
                .then(() => {
                  console.log(`BaseSceneLayer: Buildings refreshed again, now have ${buildingRendererManager.getBuildingMeshes().size} buildings`);
                });
            } else {
              console.log(`BaseSceneLayer: ${buildingCount} buildings visible after initialization`);
            }
          }, 2000);
        })
        .catch(error => {
          console.error('BaseSceneLayer: Error loading buildings:', error);
        });
    }, 1000); // Add a 1 second delay to ensure water and land are fully rendered

    // No cleanup needed here - buildings will be cleaned up with the scene
  }, [scene, isInitializedRef.current]);

  // Update water quality when it changes
  useEffect(() => {
    if (waterRef.current && isInitializedRef.current) {
      waterRef.current.setQuality(waterQuality);
    }
  }, [waterQuality]);

  // This component doesn't render anything visible directly
  return null;
};

export default BaseSceneLayer;
