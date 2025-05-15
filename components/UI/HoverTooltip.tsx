import React, { useEffect, useState } from 'react';
import { hoverStateService, HoverState } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { buildingService } from '@/lib/services/BuildingService';
import { assetService } from '@/lib/services/AssetService';

interface HoverTooltipProps {
  // Any props you need
}

export const HoverTooltip: React.FC<HoverTooltipProps> = (props) => {
  const [hoverState, setHoverState] = useState<HoverState>(hoverStateService.getState());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [buildingImagePath, setBuildingImagePath] = useState<string | null>(null);
  
  useEffect(() => {
    const handleHoverStateChanged = (data: any) => {
      setHoverState(hoverStateService.getState());
      
      // Fetch additional data based on what's being hovered
      if (data.type === 'building' && data.id) {
        // Fetch building data
        console.log('Fetching building data for:', data.id);
        
        fetch(`/api/buildings/${data.id}`)
          .then(res => {
            if (!res.ok) {
              console.error(`Error fetching building data: HTTP ${res.status}`);
              return null;
            }
            return res.json();
          })
          .then(async buildingData => {
            if (buildingData) {
              console.log('Building data received:', buildingData);
              
              // Handle different response formats
              const actualBuildingData = buildingData.building || buildingData;
              
              // Get building image path
              const imagePath = await assetService.getBuildingImagePath(actualBuildingData.type);
              setBuildingImagePath(imagePath);
              
              setTooltipData({
                type: 'building',
                name: actualBuildingData.name || (actualBuildingData.type ? buildingService.formatBuildingType(actualBuildingData.type) : 'Unknown Building'),
                buildingType: actualBuildingData.type,
                owner: actualBuildingData.owner
              });
            } else {
              // Set default tooltip data if building data couldn't be fetched
              setTooltipData({
                type: 'building',
                name: 'Building',
                buildingType: 'Unknown',
                owner: 'Unknown'
              });
            }
          })
          .catch(err => {
            console.error('Error fetching building data:', err);
            // Set default tooltip data on error
            setTooltipData({
              type: 'building',
              name: 'Building',
              buildingType: 'Unknown',
              owner: 'Unknown'
            });
          });
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
    
    // Assuming EventTypes.HOVER_STATE_CHANGED should be a valid event type
    // If it doesn't exist in EventTypes, you need to add it there
    const hoverStateChangedEvent = 'HOVER_STATE_CHANGED';
    eventBus.subscribe(hoverStateChangedEvent, handleHoverStateChanged);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      // Use the same event name as above
      const hoverStateChangedEvent = 'HOVER_STATE_CHANGED';
      // Use the public method to unsubscribe
      eventBus.subscribe(hoverStateChangedEvent, handleHoverStateChanged).unsubscribe();
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
      <div className="flex flex-col items-center">
        {/* Add the building image */}
        <div className="w-48 h-36 mb-2 overflow-hidden rounded">
          <img 
            src={buildingImagePath || `/images/buildings/${tooltipData.buildingType?.toLowerCase().replace(/[_-]/g, '_')}.jpg`} 
            alt={tooltipData.name || 'Building'}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to default image if the specific one doesn't exist
              e.currentTarget.src = '/images/buildings/market_stall.jpg';
            }}
          />
        </div>
        <div className="font-bold">{tooltipData.name || 'Building'}</div>
        <div>Type: {tooltipData.buildingType ? buildingService.formatBuildingType(tooltipData.buildingType) : 'Unknown'}</div>
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
      className="absolute z-50 bg-black/80 text-white px-4 py-3 rounded text-sm pointer-events-none max-w-xs"
      style={{
        left: position.x + 15,
        top: position.y + 15,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}
    >
      {tooltipContent}
    </div>
  );
};
