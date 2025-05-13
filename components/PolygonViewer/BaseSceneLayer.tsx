import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WaterFacade as SimpleWater } from '../../lib/threejs/WaterFacade';
import SimplePolygonRenderer from './SimplePolygonRenderer';
import { calculateBounds } from './utils';
import { eventBus, EventTypes } from '@/lib/eventBus';

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
