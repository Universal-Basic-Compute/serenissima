import React, { useEffect, useState } from 'react';
import { hoverStateService, HoverState } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { BuildingService } from '@/lib/services/BuildingService';

interface HoverTooltipProps {
  // Any props you need
}

export const HoverTooltip: React.FC<HoverTooltipProps> = (props) => {
  const [hoverState, setHoverState] = useState<HoverState>(hoverStateService.getState());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<any>(null);
  
  useEffect(() => {
    const handleHoverStateChanged = (data: any) => {
      setHoverState(hoverStateService.getState());
      
      // Fetch additional data based on what's being hovered
      if (data.type === 'building' && data.id) {
        // Fetch building data
        fetch(`/api/buildings/${data.id}`)
          .then(res => res.ok ? res.json() : null)
          .then(buildingData => {
            if (buildingData) {
              setTooltipData({
                type: 'building',
                name: buildingData.name || BuildingService.prototype.formatBuildingType(buildingData.type),
                type: buildingData.type,
                owner: buildingData.owner
              });
            }
          })
          .catch(err => console.error('Error fetching building data:', err));
      } else if (data.type === 'polygon' && data.id) {
        // Fetch polygon data
        fetch(`/api/polygons/${data.id}`)
          .then(res => res.ok ? res.json() : null)
          .then(polygonData => {
            if (polygonData) {
              setTooltipData({
                type: 'polygon',
                name: polygonData.historicalName || polygonData.id,
                owner: polygonData.owner
              });
            }
          })
          .catch(err => console.error('Error fetching polygon data:', err));
      } else if (data.type === 'citizen') {
        // For citizens, we don't need to fetch additional data
        setTooltipData({
          type: 'citizen',
          buildingId: data.buildingId,
          citizenType: data.citizenType
        });
      } else if (data.type === 'canalPoint') {
        setTooltipData({
          type: 'canalPoint',
          id: data.id
        });
      } else if (data.type === 'bridgePoint') {
        setTooltipData({
          type: 'bridgePoint',
          id: data.id
        });
      } else if (data.type === 'clear') {
        setTooltipData(null);
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    
    eventBus.subscribe(EventTypes.HOVER_STATE_CHANGED, handleHoverStateChanged);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      eventBus.unsubscribe(EventTypes.HOVER_STATE_CHANGED, handleHoverStateChanged);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  // Determine if we should show the tooltip
  const shouldShow = 
    hoverState.hoveredPolygonId !== null || 
    hoverState.hoveredBuildingId !== null || 
    hoverState.hoveredCanalPointId !== null || 
    hoverState.hoveredBridgePointId !== null || 
    hoverState.hoveredCitizenBuilding !== null;
  
  if (!shouldShow || !tooltipData) return null;
  
  // Render different tooltip content based on what's hovered
  let tooltipContent = null;
  
  if (tooltipData.type === 'polygon') {
    tooltipContent = (
      <div>
        <div className="font-bold">{tooltipData.name}</div>
        {tooltipData.owner && <div>Owner: {tooltipData.owner}</div>}
      </div>
    );
  } else if (tooltipData.type === 'building') {
    tooltipContent = (
      <div>
        <div className="font-bold">{tooltipData.name}</div>
        <div>Type: {BuildingService.prototype.formatBuildingType(tooltipData.type)}</div>
        {tooltipData.owner && <div>Owner: {tooltipData.owner}</div>}
      </div>
    );
  } else if (tooltipData.type === 'canalPoint') {
    tooltipContent = (
      <div>
        <div className="font-bold">Canal Point</div>
        <div>Click to build a dock</div>
      </div>
    );
  } else if (tooltipData.type === 'bridgePoint') {
    tooltipContent = (
      <div>
        <div className="font-bold">Bridge Point</div>
        <div>Click to build a bridge</div>
      </div>
    );
  } else if (tooltipData.type === 'citizen') {
    tooltipContent = (
      <div>
        <div className="font-bold">
          {tooltipData.citizenType === 'home' ? 'Residents' : 'Workers'}
        </div>
        <div>Building: {tooltipData.buildingId}</div>
        <div>Click to view details</div>
      </div>
    );
  }
  
  return (
    <div 
      className="absolute z-50 bg-black/80 text-white px-3 py-2 rounded text-sm pointer-events-none"
      style={{
        left: position.x + 15,
        top: position.y + 15
      }}
    >
      {tooltipContent}
    </div>
  );
};
