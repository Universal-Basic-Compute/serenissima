import { useState, useEffect } from 'react';
import BuildingDescription from './BuildingDetails/BuildingDescription';
import BuildingFinancials from './BuildingDetails/BuildingFinancials';
import BuildingImage from './BuildingDetails/BuildingImage';
import BuildingLocation from './BuildingDetails/BuildingLocation';
import BuildingMaintenance from './BuildingDetails/BuildingMaintenance';

export { BuildingDescription };
export { BuildingFinancials };
export { BuildingImage };
export { BuildingLocation };
export { BuildingMaintenance };

export function ResourceList({ 
  title, 
  resources, 
  type, 
  disabledResources = [],
  storageCapacity
}: { 
  title: string; 
  resources: any[]; 
  type: 'sell' | 'buy' | 'store' | 'inventory'; 
  disabledResources?: string[];
  storageCapacity?: number;
}) {
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  
  // Get current username from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const profileStr = localStorage.getItem('citizenProfile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          if (profile && profile.username) {
            setCurrentUsername(profile.username);
          }
        }
      } catch (error) {
        console.error('Error getting current username:', error);
      }
    }
  }, []);
  
  // Handle buy resource
  const handleBuyResource = (resource: any) => {
    console.log('Buy resource:', resource);
    // Implement buy functionality
    alert(`Buying ${resource.name || resource.resourceType} for ${resource.price} Ducats`);
  };
  
  // Handle sell resource
  const handleSellResource = (resource: any) => {
    console.log('Sell resource:', resource);
    // Implement sell functionality
    alert(`Setting up sale for ${resource.name || resource.resourceType}`);
  };
  
  // Check if current user is running the business
  const isRunningBusiness = currentUsername === (window as any).__currentBuildingRunBy;
  
  if (!resources || resources.length === 0) return null;
  
  return (
    <div className="bg-amber-100 rounded-lg p-3 shadow-sm">
      <h3 className="text-amber-800 font-serif font-semibold mb-2">{title}</h3>
      
      {storageCapacity !== undefined && (
        <div className="text-xs text-amber-700 mb-2">
          Storage Capacity: {storageCapacity}
        </div>
      )}
      
      <div className="space-y-2">
        {resources.map((resource, index) => {
          // Check if this resource is disabled
          const isDisabled = disabledResources.includes(resource.resourceType);
          
          // Check if this resource is publicly sold (has price)
          const isPubliclySold = resource.price !== undefined && resource.price > 0;
          
          // Check if this resource is in the publiclySold array
          const isInPubliclySold = (window as any).__buildingPubliclySoldResources?.some(
            (r: any) => r.resourceType === resource.resourceType
          );
          
          return (
            <div 
              key={`${resource.resourceType || resource.name}-${index}`}
              className={`flex items-center justify-between p-2 rounded bg-amber-50 border border-amber-200 ${
                isDisabled ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center">
                <div className="w-8 h-8 mr-2 flex-shrink-0 bg-amber-200 rounded overflow-hidden">
                  <img 
                    src={`/resources/${(resource.icon || resource.resourceType || resource.name || 'default').toLowerCase().replace(/\s+/g, '_')}.png`}
                    alt={resource.name || resource.resourceType}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      // Try alternative paths if the first one fails
                      (e.target as HTMLImageElement).src = `/images/resources/${(resource.icon || resource.resourceType || resource.name || 'default').toLowerCase().replace(/\s+/g, '_')}.png`;
                      (e.target as HTMLImageElement).onerror = () => {
                        (e.target as HTMLImageElement).src = '/images/resources/default.png';
                      };
                    }}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium">{resource.name || resource.resourceType}</div>
                  {resource.amount && (
                    <div className="text-xs text-amber-700">
                      {type === 'inventory' ? 'Quantity: ' : 'Amount: '}{resource.amount}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center">
                {/* Show price for publicly sold resources */}
                {(isPubliclySold || isInPubliclySold) && (
                  <div className="text-sm font-medium text-amber-700 mr-2">
                    {resource.price} ⚜️
                  </div>
                )}
                
                {/* Buy button for publicly sold resources */}
                {(isPubliclySold || isInPubliclySold) && !isDisabled && (
                  <button 
                    onClick={() => handleBuyResource(resource)}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    Buy
                  </button>
                )}
                
                {/* Sell button for resources when user is running the business */}
                {!isPubliclySold && !isInPubliclySold && isRunningBusiness && type === 'sell' && (
                  <button 
                    onClick={() => handleSellResource(resource)}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Sell
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
