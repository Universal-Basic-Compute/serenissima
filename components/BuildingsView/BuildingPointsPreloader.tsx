'use client';

import { useEffect } from 'react';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';

/**
 * Component that preloads building points data as early as possible
 * This is a hidden component that just runs the preload logic
 */
export default function BuildingPointsPreloader() {
  useEffect(() => {
    // Preload building points
    const preloadBuildingPoints = async () => {
      try {
        if (!buildingPointsService.isPointsLoaded()) {
          console.log('Preloading building points...');
          await buildingPointsService.loadBuildingPoints();
          console.log('Building points preloaded successfully');
        }
      } catch (error) {
        console.error('Error preloading building points:', error);
      }
    };
    
    preloadBuildingPoints();
  }, []);
  
  // This component doesn't render anything
  return null;
}
