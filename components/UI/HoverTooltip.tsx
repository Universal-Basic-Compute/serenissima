import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hoverStateService, HOVER_STATE_CHANGED, HoverState } from '@/lib/services/HoverStateService';
import { eventBus } from '@/lib/utils/eventBus';
import { buildingService } from '@/lib/services/BuildingService';
import { assetService } from '@/lib/services/AssetService';
import { throttle } from '@/lib/utils/performanceUtils';

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

export const HoverTooltip: React.FC = () => {
  const [hoverState, setHoverState] = useState<HoverState>(hoverStateService.getState());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [buildingImagePath, setBuildingImagePath] = useState<string | null>(null);
  
  useEffect(() => {
    const handleHoverStateChanged = throttle((newState: HoverState) => {
      //console.log('TOOLTIP: Hover state changed event received:', newState);
      setHoverState(newState); // Update local copy of the hover state

      // Reset tooltip data and building-specific image path by default
      // This ensures that data from a previous hover type does not persist.
      setTooltipData(null);
      setBuildingImagePath(null);
      
      // Fetch additional data based on hover type
      if (newState.type === 'building' && newState.id) {
        fetchBuildingData(newState.id); // This will call setTooltipData and setBuildingImagePath
      } else if (newState.type === 'polygon' && newState.id) {
        fetchPolygonData(newState.id); // This will call setTooltipData
      } else if (newState.type === 'citizen') {
        handleCitizenHover(newState); // This will call setTooltipData
      } else if (newState.type === 'resource') {
        handleResourceHover(newState); // This will call setTooltipData
      } else if (newState.type === 'canalPoint' && newState.id) {
        setTooltipData({
          type: 'canalPoint',
          id: newState.id
        });
      } else if (newState.type === 'bridgePoint' && newState.id) {
        setTooltipData({
          type: 'bridgePoint',
          id: newState.id
        });
      } else if (newState.type === 'problem' && newState.data) {
        setTooltipData({
          type: 'problem',
          problem: newState.data
        });
      }
      // If newState.type is 'none' or any other unhandled type,
      // tooltipData and buildingImagePath remain null due to the reset at the beginning of this function.
    }, 100); // 100ms throttle
    
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    
    // Subscribe to events
    eventBus.subscribe(HOVER_STATE_CHANGED, handleHoverStateChanged);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      eventBus.subscribe(HOVER_STATE_CHANGED, handleHoverStateChanged).unsubscribe();
      window.removeEventListener('mousemove', handleMouseMove);
      
      // Cancel throttled functions
      if (typeof handleHoverStateChanged.cancel === 'function') {
        handleHoverStateChanged.cancel();
      }
    };
  }, []);
  
  // Helper functions for fetching data
  const fetchBuildingData = async (buildingId: string) => {
    try {
      console.log('TOOLTIP: Fetching building data for:', buildingId);
      const response = await fetch(`/api/buildings/${buildingId}`);
      if (!response.ok) {
        console.error(`Error fetching building data: HTTP ${response.status}`);
        return;
      }
      
      const buildingData = await response.json();
      if (buildingData) {
        console.log('Building data received:', buildingData);
        
        // Handle different response formats
        const actualBuildingData = buildingData.building || buildingData;
        
        // Get building image path
        const imagePath = await assetService.getBuildingImagePath(actualBuildingData.type);
        console.log('TOOLTIP: Building image path:', imagePath);
        setBuildingImagePath(imagePath);
        
        setTooltipData({
          type: 'building',
          name: actualBuildingData.name || (actualBuildingData.type ? buildingService.formatBuildingType(actualBuildingData.type) : 'Unknown Building'),
          buildingType: actualBuildingData.type, // This is used by the fallback logic for image path
          owner: actualBuildingData.owner
        });
      }
    } catch (error) {
      console.error('Error fetching building data:', error);
    }
  };
  
  const fetchPolygonData = async (polygonId: string) => {
    try {
      const response = await fetch(`/api/polygons/${polygonId}`);
      if (!response.ok) return;
      
      const polygonData = await response.json();
      if (polygonData) {
        setTooltipData({
          type: 'polygon',
          name: polygonData.historicalName || polygonId,
          owner: polygonData.owner
        });
      }
    } catch (error) {
      console.error('Error fetching polygon data:', error);
    }
  };
  
  const handleCitizenHover = (state: HoverState) => {
    if (state.data && state.data.citizen) {
      console.log('TOOLTIP: Citizen data received from HoverStateService (state.data.citizen):', JSON.stringify(state.data.citizen)); // Log the received citizen object
      const citizen = state.data.citizen;
      
      // Ensure citizen data is safe for rendering
      const safeCitizen = {
        firstName: typeof citizen.firstName === 'string' ? citizen.firstName : '',
        lastName: typeof citizen.lastName === 'string' ? citizen.lastName : '',
        socialClass: typeof citizen.socialClass === 'string' ? citizen.socialClass : '',
        imageUrl: typeof citizen.imageUrl === 'string' && citizen.imageUrl !== '' ? citizen.imageUrl : null,
        // Ensure 'id' is present for fallback or other uses, prefer 'id' then 'citizenid' from the source 'citizen' object
        id: typeof citizen.id === 'string' ? citizen.id : (typeof citizen.citizenid === 'string' ? citizen.citizenid : ''),
        // Explicitly add username if it exists on 'citizen' (which is state.data.citizen)
        username: typeof citizen.username === 'string' ? citizen.username : null,
        activityNotes: typeof citizen.activityNotes === 'string' ? citizen.activityNotes : null
      };
      
      setTooltipData({
        type: 'citizen',
        citizen: safeCitizen,
        buildingId: state.data.buildingId,
        citizenType: state.data.citizenType
      });
    } else if (state.data) {
      console.log('TOOLTIP: No citizen data, only buildingId:', state.data.buildingId);
      setTooltipData({
        type: 'citizen',
        buildingId: state.data.buildingId,
        citizenType: state.data.citizenType
      });
    }
  };
  
  const handleResourceHover = (state: HoverState) => {
    if (state.data) {
      setTooltipData({
        type: 'resource',
        resources: state.data.resources,
        locationKey: state.data.locationKey,
        position: state.data.position
      });
    }
  };
  
  // Handle contract click
  const handleContractClick = (resource: any) => {
    if (resource.buildingId) {
      // Set the selected building ID in the global state
      window.dispatchEvent(new CustomEvent('showBuildingDetailsPanel', {
        detail: { buildingId: resource.buildingId }
      }));
      
      // Close the tooltip
      hoverStateService.clearHoverState();
    }
  };
  
  // Determine if we should show the tooltip
  const shouldShow = hoverState.type !== 'none' && tooltipData !== null;
  
  if (!shouldShow) return null;
  
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
        <div className="w-96 h-80 mb-2 overflow-hidden rounded">
          <img 
            src={(() => {
              const baseAssetUrl = 'https://backend.serenissima.ai/public_assets/';
              let finalImagePath: string;

              if (buildingImagePath) { // buildingImagePath comes from state, which is from assetService
                  if (buildingImagePath.startsWith('https://') || buildingImagePath.startsWith('http://')) {
                      // It's already a full URL. Check for common double prefix issues.
                      const doublePrefix1 = baseAssetUrl + 'https://'; // e.g. "https://backend.../public_assets/https://"
                      const doublePrefix2 = 'https://https://'; // More general double https

                      if (buildingImagePath.startsWith(doublePrefix1)) {
                          finalImagePath = buildingImagePath.substring(baseAssetUrl.length); // Remove the first baseAssetUrl
                      } else if (buildingImagePath.startsWith(doublePrefix2)) {
                          finalImagePath = buildingImagePath.substring('https://'.length); // Remove one 'https://'
                      } else {
                          finalImagePath = buildingImagePath; // Assume it's a correct full URL
                      }
                  } else {
                      // Assume it's a path relative to baseAssetUrl (e.g., "images/buildings/foo.png")
                      // Ensure no leading slash if buildingImagePath is like "/images/..."
                      finalImagePath = baseAssetUrl + buildingImagePath.replace(/^\//, '');
                  }
              } else {
                  // Fallback if buildingImagePath is null or empty
                  const typeForPath = tooltipData.buildingType?.toLowerCase().replace(/[_-]/g, '_') || 'default';
                  finalImagePath = `${baseAssetUrl}images/buildings/${typeForPath}.png`;
              }
              return finalImagePath;
            })()}
            alt={tooltipData.name || 'Building'}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.log(`Failed to load building image: ${e.currentTarget.src}`);
              // Fallback to default image if the specific one doesn't exist
              e.currentTarget.src = 'https://backend.serenissima.ai/public_assets/images/buildings/contract_stall.png';
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
    
    /**console.log('TOOLTIP: Rendering citizen tooltip with data:', {
      citizen: citizen ? { // citizen here is safeCitizen
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        socialClass: citizen.socialClass,
        imageUrl: citizen.imageUrl,
        activityNotes: citizen.activityNotes // Add activityNotes to the log
      } : 'No citizen data'
    });*/
    
    if (citizen) {
      // If we have the citizen data, display it
      // Ensure we have the correct property names for image and social class
      
      let imageUrl;
      if (citizen.imageUrl) { // citizen.imageUrl is from safeCitizen, so it's a non-empty string or null
        if (citizen.imageUrl.startsWith('/')) {
          imageUrl = `https://backend.serenissima.ai/public_assets${citizen.imageUrl}`;
        } else {
          // Assumed to be a full URL or already correctly formed relative path not starting with '/'
          imageUrl = citizen.imageUrl; 
        }
      } else { // If citizen.imageUrl is null (or was empty and became null via safeCitizen)
        // Prioritize citizen.username for the image path, then citizen.id, then 'default'
        const identifierForImage = citizen.username || citizen.id || 'default';
        imageUrl = `https://backend.serenissima.ai/public_assets/images/citizens/${identifierForImage}.jpg`;
      }
    
      // This console.log can be removed or kept, but the one above is more comprehensive now.
      // console.log('TOOLTIP: Using image URL:', imageUrl); 
    
      const firstName = typeof citizen.firstName === 'string' ? citizen.firstName : '';
      const lastName = typeof citizen.lastName === 'string' ? citizen.lastName : '';
      const socialClass = typeof citizen.socialClass === 'string' ? citizen.socialClass : 'Citizen';
      
      // This console.log can be removed or kept.
      // console.log('TOOLTIP: Citizen display info:', { firstName, lastName, socialClass });
      
      tooltipContent = (
        <div className="flex flex-col items-center">
          {/* Citizen image with improved styling */}
          <div className="w-64 h-64 mb-2 overflow-hidden rounded-lg border-2 border-amber-600 shadow-md">
            <img 
              src={imageUrl}
              alt={`${firstName} ${lastName}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log(`TOOLTIP: Failed to load citizen image: ${imageUrl}, trying fallback`);
                // Fallback to default image if the specific one doesn't exist
                e.currentTarget.src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
              }}
            />
          </div>
          <div className="font-bold text-center text-lg">
            {firstName} {lastName}
          </div>
          <div className="text-amber-400 text-sm font-semibold mb-1">
            {socialClass}
          </div>
          {/* Display Activity Notes if available */}
          {citizen.activityNotes && (
            <div className="mt-2 text-xs text-gray-300 prose prose-sm prose-invert max-w-full">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{citizen.activityNotes}</ReactMarkdown>
            </div>
          )}
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
                {Object.entries(resourceBreakdown).map(([resourceType, data]: [string, { totalAmount: number, avgPrice: number, count: number }]) => (
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
                          src={`https://backend.serenissima.ai/public_assets/images/resources/${resource.name.toLowerCase().replace(/\s+/g, '_')}.png`}
                          alt={resource.name}
                          className="w-5 h-5 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/resources/default.png';
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
                        src={`https://backend.serenissima.ai/public_assets/images/resources/${resource.icon}`}
                        alt={resource.name}
                        className="w-5 h-5 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/resources/default.png';
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
    } else if (tooltipData.type === 'problem') {
      const problem = tooltipData.problem;
      
      // Get severity color
      const getSeverityColor = (severity: string): string => {
        switch (severity.toLowerCase()) {
          case 'critical': return 'text-red-600';
          case 'high': return 'text-orange-500';
          case 'medium': return 'text-yellow-500';
          case 'low': return 'text-green-500';
          default: return 'text-yellow-500';
        }
      };
      
      tooltipContent = (
        <div>
          <div className="font-bold text-lg mb-1">{problem.title || problem.problemId || 'Problem Details'}</div>
          <div className="flex items-center mb-2">
            <span className={`font-medium ${getSeverityColor(problem.severity)}`}>
              {(problem.severity || 'medium').toUpperCase()} Severity
            </span>
            <span className="mx-2">•</span>
            <span className="text-amber-300">{problem.location || 'Unknown location'}</span>
          </div>
          <div className="text-sm mb-2 line-clamp-3">
            {problem.description || 'No additional details available for this problem.'}
          </div>
          <div className="text-xs text-amber-300 mt-2">
            Click for details
          </div>
        </div>
      );
    }
  }
  
  return (
    <div 
      className="absolute z-50 bg-black/80 text-white px-4 py-3 rounded text-sm pointer-events-none max-w-md"
      data-ui-panel="true" // The tooltip itself should prevent hover on items below it
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
