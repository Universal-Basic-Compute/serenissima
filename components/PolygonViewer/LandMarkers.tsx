import { useState, useEffect, useCallback, useMemo } from 'react';
import { landService } from '@/lib/services/LandService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

interface LandMarkersProps {
  isVisible: boolean;
  polygonsToRender: {
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
    hasPublicDock?: boolean;
  }[];
  isNight: boolean;
  scale: number;
  activeView: string;
}

export default function LandMarkers({
  isVisible,
  polygonsToRender,
  isNight,
  scale,
  activeView
}: LandMarkersProps) {
  const [hoveredPolygonId, setHoveredPolygonId] = useState<string | null>(null);
  const [landImages, setLandImages] = useState<Record<string, string>>({});

  // Load land images when polygons change
  useEffect(() => {
    const loadLandImages = async () => {
      const images: Record<string, string> = {};
      
      for (const polygonData of polygonsToRender) {
        if (polygonData.polygon && polygonData.polygon.id) {
          const imageUrl = await landService.getLandImageUrl(polygonData.polygon.id);
          if (imageUrl) {
            images[polygonData.polygon.id] = imageUrl;
          }
        }
      }
      
      setLandImages(images);
    };
    
    if (isVisible && polygonsToRender.length > 0) {
      loadLandImages();
    }
  }, [isVisible, polygonsToRender]);

  const handleMouseEnter = useCallback((polygon: any) => {
    if (!polygon || !polygon.id) return;
    
    setHoveredPolygonId(polygon.id);
    hoverStateService.setHoverState('polygon', polygon.id, polygon);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredPolygonId(null);
    hoverStateService.clearHoverState();
  }, []);

  const handleClick = useCallback((polygon: any) => {
    if (!polygon || !polygon.id) return;
    
    console.log('Land clicked:', polygon);
    eventBus.emit(EventTypes.POLYGON_SELECTED, { 
      polygonId: polygon.id, 
      polygonData: polygon 
    });
  }, []);

  // If the component is not visible, don't render anything
  if (!isVisible) {
    return null;
  }

  // No need for a separate function - use the scale directly with the polygon size
  // This ensures land images scale exactly with polygons

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* The container is pointer-events-none, individual markers need careful event handling */}
      {polygonsToRender.map((polygonData) => {
        const polygon = polygonData.polygon;
        if (!polygon || !polygon.id || !landImages[polygon.id]) return null;

        const isHovered = hoveredPolygonId === polygon.id;
        const imageUrl = landImages[polygon.id];
        
        // Use the scale directly to match polygon scaling exactly
        // The size is determined by the polygon's actual size in the rendered view
        
        // Apply night effect if needed
        const opacity = isNight ? 0.5 : 0.7; // Reduce opacity at night
        
        // Highlight land with public dock in transport view
        const hasDock = polygonData.hasPublicDock && activeView === 'transport';
        
        return (
          <div
            key={polygon.id}
            className="absolute"
            style={{
              pointerEvents: 'none', // Make lands completely non-interactive
              position: 'absolute',
              left: `${polygonData.centerX}px`,
              top: `${polygonData.centerY}px`,
              width: `${75 * scale}px`, // Scale width directly with zoom level, no minimum size
              height: `${75 * scale}px`, // Scale height directly with zoom level, no minimum size
              zIndex: isHovered ? 12 : 10, // Below buildings (z-index 16-18) but above water
              transition: 'transform 0.1s ease-out, opacity 0.2s ease-out, width 0s, height 0s',
              transform: `translate(-50%, -50%) scale(${isHovered ? 1.05 : 1})`,
              cursor: 'default',
              opacity: isHovered ? opacity + 0.1 : opacity, // Slightly more visible when hovered
              border: hasDock ? '2px solid rgba(255, 165, 0, 0.7)' : 'none', // Orange border for lands with docks in transport view
            }}
            // Removed all mouse event handlers to make lands non-interactive
            title={polygon.historicalName || polygon.id}
          >
            <img
              src={imageUrl}
              alt={polygon.historicalName || polygon.id}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: isNight ? 'brightness(0.7) saturate(0.8)' : 'none', // Darker and less saturated at night
              }}
              onError={(e) => {
                // If image fails to load, hide it
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
