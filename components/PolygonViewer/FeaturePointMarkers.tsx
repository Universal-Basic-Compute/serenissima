import React from 'react';
import { CoordinateService } from '@/lib/services/CoordinateService';
import { HoverState, hoverStateService } from '@/lib/services/HoverStateService';

export interface FeaturePoint { // Exporting for use in IsometricViewer if needed for the callback
  lat: number;
  lng: number;
  id?: string; // Optional original ID from polygon data
  type: 'buildingPoint' | 'canalPoint' | 'bridgePoint';
  polygonId: string; // ID of the polygon this point belongs to
}

interface FeaturePointMarkersProps {
  polygonsToRender: any[];
  scale: number;
  offset: { x: number; y: number };
  canvasWidth: number;
  canvasHeight: number;
  activeView: string;
  currentHoverState: HoverState;
  isNight: boolean;
  onPointClick: (point: FeaturePoint) => void;
}

const FeaturePointMarkers: React.FC<FeaturePointMarkersProps> = ({
  polygonsToRender,
  scale,
  offset,
  canvasWidth,
  canvasHeight,
  activeView,
  currentHoverState,
  isNight, // isNight can be used for styling if needed, e.g. opacity adjustments
  onPointClick,
}) => {
  const allPoints: FeaturePoint[] = [];

  polygonsToRender.forEach(polygonData => {
    const polygon = polygonData.polygon;
    if (!polygon || !polygon.id) return;

    // Extract Building Points
    if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
      polygon.buildingPoints.forEach((bp: any) => {
        if (bp && typeof bp.lat === 'number' && typeof bp.lng === 'number') {
          allPoints.push({
            lat: bp.lat,
            lng: bp.lng,
            id: bp.id || `buildingPoint-${polygon.id}-${bp.lat}-${bp.lng}`,
            type: 'buildingPoint',
            polygonId: polygon.id,
          });
        }
      });
    }

    // Extract Canal Points (Docks)
    if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
      polygon.canalPoints.forEach((cp: any) => {
        if (cp && cp.edge && typeof cp.edge.lat === 'number' && typeof cp.edge.lng === 'number') {
          allPoints.push({
            lat: cp.edge.lat,
            lng: cp.edge.lng,
            id: cp.id || `canalPoint-${polygon.id}-${cp.edge.lat}-${cp.edge.lng}`,
            type: 'canalPoint',
            polygonId: polygon.id,
          });
        }
      });
    }

    // Extract Bridge Points
    if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
      polygon.bridgePoints.forEach((brp: any) => {
        if (brp && brp.edge && typeof brp.edge.lat === 'number' && typeof brp.edge.lng === 'number') {
          allPoints.push({
            lat: brp.edge.lat,
            lng: brp.edge.lng,
            id: brp.id || `bridgePoint-${polygon.id}-${brp.edge.lat}-${brp.edge.lng}`,
            type: 'bridgePoint',
            polygonId: polygon.id,
          });
        }
      });
    }
  });

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 16 }}> {/* Ensure this zIndex is above LandMarkers */}
      {allPoints.map((point, index) => {
        const worldPos = CoordinateService.latLngToWorld(point.lat, point.lng);
        const screenPos = CoordinateService.worldToScreen(worldPos.x, worldPos.y, scale, offset, canvasWidth, canvasHeight);

        const isHovered = currentHoverState.type === point.type &&
                          currentHoverState.data &&
                          typeof currentHoverState.data.lat === 'number' &&
                          typeof currentHoverState.data.lng === 'number' &&
                          Math.abs(currentHoverState.data.lat - point.lat) < 0.00001 &&
                          Math.abs(currentHoverState.data.lng - point.lng) < 0.00001;

        let style: React.CSSProperties = {
          position: 'absolute',
          left: `${screenPos.x}px`,
          top: `${screenPos.y}px`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
          transition: 'transform 0.1s ease-out, opacity 0.2s ease-out, background-color 0.2s ease-out',
        };

        let effectivePointSize = 0; // Used for diameter

        if (point.type === 'buildingPoint') {
          effectivePointSize = (activeView === 'buildings' ? 2.2 : 1.8) * scale * (isHovered ? 1.5 : 1) * 2; // diameter
          const baseOpacity = activeView === 'buildings' ? 0.125 : 0.075;
          const finalOpacity = isHovered ? Math.min(1, baseOpacity * 4) : baseOpacity; // Increased hover opacity
          style = {
            ...style,
            width: `${effectivePointSize}px`,
            height: `${effectivePointSize}px`,
            backgroundColor: `rgba(160, 140, 120, ${finalOpacity})`,
            borderRadius: '50%',
            border: isHovered ? `1px solid rgba(255, 255, 255, 0.8)` : `1px solid rgba(160, 140, 120, ${finalOpacity * 2})`,
          };
        } else if (point.type === 'canalPoint') {
          effectivePointSize = 2 * scale * 2; // diameter
          const baseOpacity = activeView === 'transport' ? 0.6 : 0.25; // Slightly increased non-transport opacity
          const finalOpacity = isHovered ? Math.min(1, baseOpacity * 1.5) : baseOpacity;
          style = {
            ...style,
            width: `${effectivePointSize}px`,
            height: `${effectivePointSize}px`,
            backgroundColor: `rgba(0, 120, 215, ${finalOpacity})`,
            borderRadius: '50%',
            border: `1px solid rgba(0, 120, 215, ${Math.min(1, finalOpacity * 1.2)})`,
          };
        } else if (point.type === 'bridgePoint') {
          effectivePointSize = 2 * scale * 2; // diameter for square side
          const baseOpacity = activeView === 'transport' ? 0.6 : 0.25; // Slightly increased non-transport opacity
          const finalOpacity = isHovered ? Math.min(1, baseOpacity * 1.5) : baseOpacity;
          style = {
            ...style,
            width: `${effectivePointSize}px`,
            height: `${effectivePointSize}px`,
            backgroundColor: `rgba(180, 120, 60, ${finalOpacity})`,
            border: `1px solid rgba(180, 120, 60, ${Math.min(1, finalOpacity * 1.2)})`,
          };
        }
        
        if (isHovered) {
            style.transform = 'translate(-50%, -50%) scale(1.3)'; // Slightly larger hover scale
            style.zIndex = 1; 
        }

        return (
          <div
            key={point.id || `${point.type}-${point.lat}-${point.lng}-${index}`}
            style={style}
            onMouseEnter={() => hoverStateService.setHoverState(point.type, point.id || null, { lat: point.lat, lng: point.lng, polygonId: point.polygonId })}
            onMouseLeave={() => hoverStateService.clearHoverState()}
            onClick={(e) => {
              e.stopPropagation();
              onPointClick(point);
            }}
            title={`Type: ${point.type}, Polygon: ${point.polygonId}`}
          />
        );
      })}
    </div>
  );
};

export default FeaturePointMarkers;
