import React, { useEffect, useState, useRef } from 'react';
import { hoverStateService, HoverState } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { buildingService } from '@/lib/services/BuildingService';
import { assetService } from '@/lib/services/AssetService';
import { useRouter } from 'next/navigation';
import { throttle, debounce } from '@/lib/utils/performanceUtils';

// Helper function to get current username
const getCurrentUsername = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    
    const profileStr = localStorage.getItem('citizenProfile');
    if (profileStr) {
      const profile = JSON.parse(profileStr);
      if (profile && profile.username) {
        return profile.username;
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting current username:', error);
    return null;
  }
};

interface HoverTooltipProps {
  // Any props you need
}

export const HoverTooltip: React.FC<HoverTooltipProps> = (props) => {
  const router = useRouter();
  const [hoverState, setHoverState] = useState<HoverState>(hoverStateService.getState());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [buildingImagePath, setBuildingImagePath] = useState<string | null>(null);
  
  useEffect(() => {
    const handleHoverStateChanged = throttle((data: any) => {
      console.log('TOOLTIP: Hover state changed event received:', data);
      setHoverState(hoverStateService.getState());
      
      // Fetch additional data based on what's being hovered
      if (data.type === 'building' && data.id) {
        // Fetch building data
        console.log('TOOLTIP: Fetching building data for:', data.id);
        
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
        // For citizens, we need to use the citizen data directly from the event
        console.log('TOOLTIP: Citizen hover data received:', data);
        
        if (data.citizen) {
          // If the citizen data is already provided in the event
          console.log('TOOLTIP: Citizen data available in event:', {
            name: `${data.citizen.firstname || data.citizen.FirstName || ''} ${data.citizen.lastname || data.citizen.LastName || ''}`,
            socialClass: data.citizen.socialclass || data.citizen.SocialClass || data.citizen.socialClass || '',
            imageUrl: data.citizen.imageurl || data.citizen.profileimage || data.citizen.ImageUrl
          });
          
          setTooltipData({
            type: 'citizen',
            citizen: data.citizen,
            buildingId: data.buildingId,
            citizenType: data.citizenType
          });
        } else {
          // If we only have the buildingId, we'll need to fetch the citizen data
          console.log('TOOLTIP: No citizen data in event, only buildingId:', data.buildingId);
          setTooltipData({
            type: 'citizen',
            buildingId: data.buildingId,
            citizenType: data.citizenType
          });
        }
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
      } else if (data.type === 'resource') {
        // For resources, use the data provided in the event
        if (data.id && data.data) {
          setTooltipData({
            type: 'resource',
            resources: data.data.resources,
            locationKey: data.data.locationKey,
            position: data.data.position
          });
        } else {
          setTooltipData(null);
        }
      } else if (data.type === 'clear') {
        setTooltipData(null);
      }
    }, 100), // 100ms throttle
    
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
      
      // Cancel throttled functions
      if (typeof handleHoverStateChanged.cancel === 'function') {
        handleHoverStateChanged.cancel();
      }
      if (typeof handleMouseMove.cancel === 'function') {
        handleMouseMove.cancel();
      }
    };
  }, []);
  
  // Handle contract click
  const handleContractClick = (resource: any) => {
    if (resource.buildingId) {
      // Set the selected building ID in the global state
      window.dispatchEvent(new CustomEvent('showBuildingDetailsPanel', {
        detail: { buildingId: resource.buildingId }
      }));
      
      // Close the tooltip
      hoverStateService.clearHoveredResource();
    }
  };
  
  // Determine if we should show the tooltip
  const shouldShow = 
    hoverState.hoveredPolygonId !== null || 
    hoverState.hoveredBuildingId !== null || 
    hoverState.hoveredCanalPointId !== null || 
    hoverState.hoveredBridgePointId !== null || 
    hoverState.hoveredCitizenBuilding !== null ||
    hoverState.hoveredResourceId !== null;
  
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
        <div className="w-64 h-48 mb-2 overflow-hidden rounded">
          <img 
            src={buildingImagePath || `/images/buildings/${tooltipData.buildingType?.toLowerCase().replace(/[_-]/g, '_')}.jpg`} 
            alt={tooltipData.name || 'Building'}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to default image if the specific one doesn't exist
              e.currentTarget.src = '/images/buildings/contract_stall.jpg';
            }}
          />
        </div>
        <div className="font-bold">{tooltipData.name || 'Building'}</div>
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
    const citizen = tooltipData.citizen;
    
    console.log('TOOLTIP: Rendering citizen tooltip with data:', {
      citizen: citizen ? {
        name: citizen.firstname || citizen.FirstName || '',
        lastName: citizen.lastname || citizen.LastName || '',
        socialClass: citizen.socialclass || citizen.SocialClass || citizen.socialClass || '',
        imageUrl: citizen.imageurl || citizen.profileimage || citizen.ImageUrl || citizen.image
      } : 'No citizen data'
    });
    
    if (citizen) {
      // If we have the citizen data, display it
      // Ensure we have the correct property names for image and social class
      const imageUrl = citizen.imageurl || citizen.profileimage || citizen.ImageUrl || citizen.image || 
                     `/images/citizens/${citizen.username || citizen.citizenid || citizen.CitizenId || 'default'}.jpg`;
    
      console.log('TOOLTIP: Using image URL:', imageUrl);
    
      const firstName = citizen.firstname || citizen.FirstName || citizen.firstName || '';
      const lastName = citizen.lastname || citizen.LastName || citizen.lastName || '';
      const socialClass = citizen.socialclass || citizen.SocialClass || citizen.socialClass || 'Citizen';
      
      console.log('TOOLTIP: Citizen display info:', { firstName, lastName, socialClass });
      
      tooltipContent = (
        <div className="flex flex-col items-center">
          {/* Citizen image with improved styling */}
          <div className="w-32 h-32 mb-2 overflow-hidden rounded-lg border-2 border-amber-600 shadow-md">
            <img 
              src={imageUrl}
              alt={`${firstName} ${lastName}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log(`TOOLTIP: Failed to load citizen image: ${imageUrl}, trying fallback`);
                // Fallback to default image if the specific one doesn't exist
                e.currentTarget.src = '/images/citizens/default.jpg';
              }}
            />
          </div>
          <div className="font-bold text-center text-lg">
            {firstName} {lastName}
          </div>
          <div className="text-amber-400 text-sm font-semibold mb-1">
            {socialClass}
          </div>
          {tooltipData.citizenType && (
            <div className="mt-1 text-xs bg-amber-800/50 px-2 py-1 rounded-full">
              {tooltipData.citizenType === 'home' ? 'Resident' : 'Worker'} at {tooltipData.buildingId}
            </div>
          )}
        </div>
      );
    } else {
      // If we don't have the citizen data, show a simpler tooltip
      console.log('TOOLTIP: No citizen data available for tooltip');
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
  } else if (tooltipData.type === 'resource') {
    // For resources, use the data provided in the event
    if (tooltipData.resources && tooltipData.resources.length > 0) {
      // Check if this is a contract summary
      const isContractSummary = tooltipData.resources[0].contractSummary === true;
      // Check if these are contract resources by looking for contractType property
      const isContractResource = tooltipData.resources[0].contractType !== undefined;
      
      if (isContractSummary) {
        // Display contract summary tooltip
        const summary = tooltipData.resources[0];
        
        // Group contracts by resource type and contract type
        const resourceBreakdown = {};
        
        // Check if we have resourceTypes in the summary
        if (summary.resourceTypes && Array.isArray(summary.resourceTypes)) {
          // Get all contracts at this location from the hover state
          const allContracts = summary.allContracts || [];
          
          // Process each resource type
          summary.resourceTypes.forEach(resourceType => {
            // Find contracts for this resource type
            const contractsForResource = allContracts.filter(c => c.resourceType === resourceType);
            
            // Count public sell contracts for this resource
            const publicSellContracts = contractsForResource.filter(c => c.type === 'public_sell');
            const totalPublicSellAmount = publicSellContracts.reduce((sum, c) => sum + (c.amount || 0), 0);
            const avgPublicSellPrice = publicSellContracts.length > 0 
              ? publicSellContracts.reduce((sum, c) => sum + (c.price || 0), 0) / publicSellContracts.length 
              : 0;
            
            // Only add to breakdown if there are public sell contracts
            if (publicSellContracts.length > 0) {
              resourceBreakdown[resourceType] = {
                count: publicSellContracts.length,
                totalAmount: totalPublicSellAmount,
                avgPrice: avgPublicSellPrice
              };
            }
          });
        }
        
        tooltipContent = (
          <div>
            <div className="font-bold mb-2">Contracts at this location</div>
            <div className="bg-amber-800/50 p-2 rounded mb-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-amber-300">Total Contracts:</span>
                <span className="font-medium">{summary.description.split(' ')[0]}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-amber-300">Total Amount:</span>
                <span className="font-medium">{summary.amount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-amber-300">Resource Types:</span>
                <span className="font-medium">{summary.resourceTypes.length}</span>
              </div>
            </div>
            
            {/* Add a new section specifically for publicly sold resources */}
            {Object.keys(resourceBreakdown).length > 0 && (
              <div className="bg-green-800/30 p-2 rounded mb-2">
                <div className="font-medium text-green-400 mb-1">Publicly Sold Resources:</div>
                {Object.entries(resourceBreakdown).map(([resourceType, data]) => (
                  <div key={resourceType} className="flex justify-between items-center text-sm mb-1 border-b border-green-800/30 pb-1 last:border-0 last:pb-0">
                    <span className="text-white capitalize">{resourceType.replace(/_/g, ' ')}</span>
                    <div className="flex flex-col items-end">
                      <span className="text-green-300">{data.totalAmount} units</span>
                      <span className="text-xs text-green-200">⚜️ {Math.round(data.avgPrice)} each</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="text-sm">
              {summary.publicSellCount > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-green-400">Public Sell:</span>
                  <span>{summary.publicSellCount}</span>
                </div>
              )}
              {summary.citizenSellCount > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-blue-400">Your Sell:</span>
                  <span>{summary.citizenSellCount}</span>
                </div>
              )}
              {summary.citizenBuyCount > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-red-400">Your Buy:</span>
                  <span>{summary.citizenBuyCount}</span>
                </div>
              )}
            </div>
            
            <div className="mt-2 text-xs text-center text-amber-300">
              Click to view building details
            </div>
            
            {tooltipData.position && (
              <div className="text-xs mt-2 text-amber-300">
                Location: {tooltipData.position.lat.toFixed(6)}, {tooltipData.position.lng.toFixed(6)}
              </div>
            )}
          </div>
        );
      } else if (isContractResource) {
        tooltipContent = (
          <div>
            <div className="font-bold mb-2">Contracts at this location</div>
            <div className="max-h-48 overflow-y-auto">
              {tooltipData.resources.map((resource: any) => {
                // Determine contract type label and color
                let contractTypeLabel = 'Contract';
                let contractTypeColor = 'text-amber-300';
                
                if (resource.contractType === 'public_sell') {
                  contractTypeLabel = 'Public Sell';
                  contractTypeColor = 'text-green-400';
                } else if (resource.owner === getCurrentUsername()) {
                  contractTypeLabel = 'Your Sell';
                  contractTypeColor = 'text-blue-400';
                } else {
                  contractTypeLabel = 'Your Buy';
                  contractTypeColor = 'text-red-400';
                }
                
                return (
                  <div 
                    key={resource.id} 
                    className="mb-2 pb-2 border-b border-amber-700/30 last:border-0 hover:bg-amber-900/20 cursor-pointer transition-colors rounded px-1"
                    onClick={() => handleContractClick(resource)}
                  >
                    <div className="flex items-center">
                      <div className="w-6 h-6 mr-2 bg-amber-800/50 rounded overflow-hidden flex items-center justify-center">
                        <img 
                          src={`/images/resources/${resource.name.toLowerCase().replace(/\s+/g, '_')}.png`}
                          alt={resource.name}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/resources/default.png';
                          }}
                        />
                      </div>
                      <div className="font-medium">{resource.name}</div>
                      <div className={`ml-auto ${contractTypeColor} font-medium`}>{contractTypeLabel}</div>
                    </div>
                    <div className="text-xs mt-1 flex justify-between">
                      <span>Price: {resource.price} ⚜️</span>
                      <span>Amount: {resource.amount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {tooltipData.position && (
              <div className="text-xs mt-2 text-amber-300">
                Location: {tooltipData.position.lat.toFixed(6)}, {tooltipData.position.lng.toFixed(6)}
              </div>
            )}
          </div>
        );
      } else {
        tooltipContent = (
          <div>
            <div className="font-bold mb-2">Resources at this location</div>
            <div className="max-h-48 overflow-y-auto">
              {tooltipData.resources.map((resource: any) => (
                <div key={resource.id} className="mb-2 pb-2 border-b border-amber-700/30 last:border-0">
                  <div className="flex items-center">
                    <div className="w-6 h-6 mr-2 bg-amber-800/50 rounded overflow-hidden flex items-center justify-center">
                      <img 
                        src={`/images/resources/${resource.icon}`}
                        alt={resource.name}
                        className="w-5 h-5 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/resources/default.png';
                        }}
                      />
                    </div>
                    <div className="font-medium">{resource.name}</div>
                    <div className="ml-auto text-amber-300 font-medium">x{resource.amount}</div>
                  </div>
                  {resource.rarity && resource.rarity !== 'common' && (
                    <div className="text-xs mt-1 capitalize text-amber-200">
                      Rarity: {resource.rarity}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {tooltipData.position && (
              <div className="text-xs mt-2 text-amber-300">
                Location: {tooltipData.position.lat.toFixed(6)}, {tooltipData.position.lng.toFixed(6)}
              </div>
            )}
          </div>
        );
      }
    }
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
