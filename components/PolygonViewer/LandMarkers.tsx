import React, { useEffect, useState } from 'react';
import { landService } from '@/lib/services/LandService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

interface LandMarkersProps {
  isVisible: boolean;
  polygonsToRender: {
    polygon: any;
    coords: { x: number; y: number }[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
    hasPublicDock?: boolean;
  }[];
  isNight: boolean;
}

const LandMarkers: React.FC<LandMarkersProps> = ({ isVisible, polygonsToRender, isNight }) => {
  // Add state for land images
  const [landImages, setLandImages] = useState<Record<string, HTMLImageElement>>({});

  // Load land images when component mounts or polygons change
  useEffect(() => {
    if (!isVisible || polygonsToRender.length === 0) return;

    const loadLandImages = async () => {
      // Extract the polygon data from polygonsToRender
      const polygons = polygonsToRender.map(item => item.polygon);
      const images = await landService.preloadLandImages(polygons);
      setLandImages(images);
    };

    loadLandImages();
  }, [isVisible, polygonsToRender]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {polygonsToRender.map(({ polygon, centerX, centerY }) => {
        if (!polygon || !polygon.id) return null;

        const img = landImages[polygon.id];
        if (!img) return null;

        // Calculate image size based on scale to zoom with the map
        const size = Math.min(300, Math.max(150, Math.floor(150 * (window.innerWidth / 1920)))); // Base size adjusted by window ratio

        // Apply night effect if needed
        const nightFilter = isNight ? 'brightness(0.6) saturate(0.8)' : '';

        return (
          <div
            key={`land-image-${polygon.id}`}
            style={{
              position: 'absolute',
              left: `${centerX - size / 2}px`,
              top: `${centerY - size / 2}px`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundImage: `url(${img.src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              pointerEvents: 'none',
              zIndex: 5, // Above polygons but below other markers
              filter: nightFilter,
              opacity: 1, // Full opacity as requested
              transform: `scale(${Math.max(0.5, Math.min(2, window.innerWidth / 1920))})`, // Scale based on window size
            }}
            onMouseEnter={() => {
              hoverStateService.setHoverState('polygon', polygon.id, polygon);
            }}
            onMouseLeave={() => {
              hoverStateService.clearHoverState();
            }}
            onClick={() => {
              eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: polygon.id, polygonData: polygon });
            }}
          />
        );
      })}
    </>
  );
};

export default LandMarkers;
