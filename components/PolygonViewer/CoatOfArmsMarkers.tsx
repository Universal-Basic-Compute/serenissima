import { useState, useEffect, useCallback, useMemo } from 'react';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

// Definition of PolygonData based on its use in IsometricViewer
interface PolygonData {
  polygon: any;
  coords: { x: number; y: number }[];
  fillColor: string;
  centroidX: number;
  centroidY: number;
  centerX: number;
  centerY: number;
  hasPublicDock?: boolean;
}

interface CoatOfArmsMarkersProps {
  isVisible: boolean;
  polygonsToRender: PolygonData[];
  landOwners: Record<string, string>;
  coatOfArmsImageUrls: Record<string, HTMLImageElement>;
}

// Utility function to generate a color from a string (for default avatar)
const getColorFromString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`; // Fixed saturation and brightness for good visibility
};

export default function CoatOfArmsMarkers({
  isVisible,
  polygonsToRender,
  landOwners,
  coatOfArmsImageUrls,
}: CoatOfArmsMarkersProps) {
  const [hoveredPolygonId, setHoveredPolygonId] = useState<string | null>(null);

  const handleMouseEnter = useCallback((polygon: any, owner: string) => {
    setHoveredPolygonId(polygon.id);
    // Reuse polygon hover state, adding owner information
    hoverStateService.setHoverState('polygon', polygon.id, { ...polygon, owner });
  }, []); // Dependencies are stable, so this is fine

  const handleMouseLeave = useCallback(() => {
    setHoveredPolygonId(null);
    hoverStateService.clearHoverState();
  }, []); // Dependencies are stable

  const handleClick = useCallback((polygon: any) => {
    // Emit an event similar to building clicks, but for polygons/land
    eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: polygon.id, polygonData: polygon });
  }, []); // Dependencies are stable

  // If the component is not visible, don't render anything
  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {polygonsToRender.map(({ polygon, centerX, centerY }) => {
        const owner = landOwners[polygon.id];
        if (!owner) return null;

        const size = 50; // Fixed size for coat of arms
        const imageElement = coatOfArmsImageUrls[owner];
        const isHovered = hoveredPolygonId === polygon.id;

        // Prepare the image source or fallback
        let imageSrc = '';
        let hasError = false;

        if (imageElement?.src) {
          imageSrc = imageElement.src;
        } else {
          hasError = true;
        }

        return (
          <div
            key={`${polygon.id}-coa-marker`}
            className="absolute pointer-events-auto"
            style={{
              left: `${centerX}px`,
              top: `${centerY}px`,
              zIndex: isHovered ? 22 : 20, // Increased z-index when hovered
              transform: `translate(-50%, -50%) scale(${isHovered ? 1.1 : 1})`,
              transition: 'transform 0.1s ease-out, box-shadow 0.1s ease-out',
              cursor: 'pointer',
              filter: isHovered 
                ? 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.7))' 
                : 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.3))',
            }}
            onMouseEnter={() => handleMouseEnter(polygon, owner)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(polygon)}
            title={`Land owned by ${owner}`}
          >
            {/* Wrapper div for border and image */}
            <div 
              style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid white',
                boxShadow: isHovered 
                  ? '0 0 8px rgba(255, 255, 255, 0.7)' 
                  : '0 0 5px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!hasError ? (
                <img
                  src={imageSrc}
                  alt={`${owner}'s Coat of Arms`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                  onError={() => {
                    // This will trigger a re-render with hasError=true
                    hasError = true;
                  }}
                />
              ) : (
                // Fallback to default avatar with initial
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: getColorFromString(owner),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: `${size * 0.4}px`,
                    fontWeight: 'bold',
                    fontFamily: 'Arial, sans-serif',
                  }}
                >
                  {owner && owner.length > 0 ? owner.charAt(0).toUpperCase() : '?'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
