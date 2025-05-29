import { useState, useEffect } from 'react';
import BuildingDescription from './BuildingDetails/BuildingDescription';
import BuildingFinancials from './BuildingDetails/BuildingFinancials';
import BuildingImage from './BuildingDetails/BuildingImage';
import BuildingLocation from './BuildingDetails/BuildingLocation';
import BuildingMaintenance from './BuildingDetails/BuildingMaintenance';
import { getNormalizedResourceIconPath } from '@/lib/utils/resourceUtils'; // Corrected import path
import BuildingOccupant from './BuildingDetails/BuildingOccupant';
import BuildingOwner from './BuildingDetails/BuildingOwner';
import ContractList from './BuildingDetails/ContractList';
import RecipeList from './BuildingDetails/RecipeList';
// import PlayerProfile from '../UI/PlayerProfile'; // PlayerProfile import removed
// import ChatCitizenDisplay from './BuildingDetails/ChatCitizenDisplay'; // Removed direct import

interface ResourceListProps {
  title: string;
  resources: any[];
  type: 'sell' | 'buy' | 'store' | 'inventory';
  disabledResources?: string[];
  storageCapacity?: number;
  onStartNegotiation?: (resource: any) => void;
  buildingId?: string; // Added for contract management
  buildingOwnerOrOperator?: string; // Added for contract management
}
    
export { BuildingDescription };
export { BuildingFinancials };
export { BuildingImage };
export { BuildingLocation };
export { BuildingMaintenance };
export { BuildingOccupant };
export { BuildingOwner };
export { ContractList };
export { RecipeList };

export function ResourceList({ 
  title,
  resources,
  type,
  disabledResources = [],
  storageCapacity,
  onStartNegotiation,
  buildingId,
  buildingOwnerOrOperator,
}: ResourceListProps) {
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [storageFeeRates, setStorageFeeRates] = useState<Record<string, number>>({}); // For store type: resourceType -> feeRate (e.g., 0.02 for 2%)
  const [existingStorageContracts, setExistingStorageContracts] = useState<Record<string, any>>({}); // resourceType -> contract
  const [isLoadingContracts, setIsLoadingContracts] = useState<boolean>(false);

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

  useEffect(() => {
    if (type === 'store' && buildingId) {
      const fetchStorageContracts = async () => {
        setIsLoadingContracts(true);
        try {
          const response = await fetch(`/api/contracts?sellerBuilding=${buildingId}&type=public_storage`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.contracts) {
              const contractsMap: Record<string, any> = {};
              const feeRatesMap: Record<string, number> = {}; // Stores the calculated rate (e.g., 0.02 for 2%)

              data.contracts.forEach((contract: any) => {
                if (contract.resourceType) {
                  contractsMap[contract.resourceType] = contract;
                  const resource = resources.find(r => r.resourceType === contract.resourceType || r.name === contract.resourceType);
                  const importPrice = resource?.importPrice;
                  
                  if (importPrice && importPrice > 0 && contract.pricePerResource !== undefined) {
                    // PricePerResource from contract is the absolute Ducat fee. Calculate rate.
                    feeRatesMap[contract.resourceType] = contract.pricePerResource / importPrice;
                  } else {
                    // Fallback: Assume contract.pricePerResource is the rate, or default.
                    feeRatesMap[contract.resourceType] = contract.pricePerResource || 0.02; 
                  }
                }
              });
              setExistingStorageContracts(contractsMap);
              setStorageFeeRates(prevRates => ({ ...prevRates, ...feeRatesMap }));
            }
          } else {
            console.error('Failed to fetch storage contracts:', response.statusText);
          }
        } catch (error) {
          console.error('Error fetching storage contracts:', error);
        } finally {
          setIsLoadingContracts(false);
        }
      };
      fetchStorageContracts();
    }
  }, [type, buildingId]);
  
  const handleStorageFeeChange = (resourceType: string, newRate: number) => {
    setStorageFeeRates(prev => ({ ...prev, [resourceType]: newRate }));
  };

  const handleUpdateStorageFee = async (resourceType: string, resourceName?: string) => {
    if (!buildingId || !buildingOwnerOrOperator) {
      alert("Building information is missing to update storage fee.");
      return;
    }
    const feeRate = storageFeeRates[resourceType] ?? 0.02; // This is the percentage rate (e.g., 0.02 for 2%)

    const resource = resources.find(r => r.resourceType === resourceType || r.name === resourceType);
    const importPrice = resource?.importPrice;
    let actualPricePerResourceToSave: number;

    if (importPrice && importPrice > 0) {
      actualPricePerResourceToSave = feeRate * importPrice;
    } else {
      // Fallback: if importPrice is invalid, save the rate itself as PricePerResource.
      // This implies the contract's PricePerResource would store a rate (0.02) not an absolute fee.
      // This might be okay if the backend or other systems can handle it, or if importPrice is always expected.
      actualPricePerResourceToSave = feeRate;
      console.warn(`Resource ${resourceType} has no valid importPrice. Saving fee rate (${feeRate}) directly as PricePerResource.`);
    }

    const existingContract = existingStorageContracts[resourceType];
    const contractId = existingContract?.contractId || `public_storage_${buildingId}_${resourceType}`;

    const contractPayload = {
      ContractId: contractId,
      Type: 'public_storage',
      Seller: buildingOwnerOrOperator,
      SellerBuilding: buildingId,
      ResourceType: resourceType,
      PricePerResource: actualPricePerResourceToSave, // Save the calculated absolute Ducat fee (or rate as fallback)
      TargetAmount: 9999999, // Large number for ongoing service
      Status: 'active',
      Title: `${resourceName || resourceType} Public Storage`,
      Description: `Public storage service for ${resourceName || resourceType} at a rate of ${(feeRate * 100).toFixed(2)}%.`,
      // Buyer is implicitly 'public'
    };

    try {
      setIsLoadingContracts(true); // Use general loading state for simplicity
      const response = await fetch('/api/contracts', {
        method: 'POST', // API should handle upsert
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractPayload),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.contract) {
          setExistingStorageContracts(prev => ({ ...prev, [resourceType]: data.contract }));
          // Update local feeRate state to match the contract, ensuring consistency
          setStorageFeeRates(prev => ({ ...prev, [resourceType]: data.contract.pricePerResource || 0.02 }));
          alert(`${resourceName || resourceType} storage fee updated to ${(feeRate * 100).toFixed(2)}%.`);
        } else {
          throw new Error(data.error || 'Failed to update storage fee contract.');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: `API Error: ${response.status}` }));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating storage fee:', error);
      alert(`Failed to update storage fee: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingContracts(false);
    }
  };
  
  // Handle buy resource
  const handleNegotiateResource = (resource: any) => {
    if (onStartNegotiation) {
      console.log('Start negotiation for resource:', resource);
      onStartNegotiation(resource);
    } else {
      console.warn('onStartNegotiation prop not provided to ResourceList. Cannot start negotiation.');
      alert(`Negotiating for ${resource.name || resource.resourceType}`);
    }
  };
  
  // Handle sell resource
  const handleSellResource = (resource: any) => {
    console.log('Sell resource:', resource);
    // Implement sell functionality
    alert(`Setting up sale for ${resource.name || resource.resourceType}`);
  };
  
  // Check if current user is running the business
  const isRunningBusiness = currentUsername === (window as any).__currentBuildingRunBy || currentUsername === buildingOwnerOrOperator;


  // Helper function to format Ducats price
  const formatDucatsPrice = (price: number | undefined | null): string => {
    if (price === undefined || price === null) return 'N/A';
    const wholePrice = Math.floor(price); // Remove decimals
    return wholePrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); // Add spaces as thousand separators
  };
  
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
          
          const resourceType = resource.resourceType || resource.name;
          // currentFeeRate is the rate (e.g., 0.02) from the slider/state
          const currentFeeRate = storageFeeRates[resourceType] ?? 0.02; 
          
          const displayFeePercent = (currentFeeRate * 100).toFixed(2);
          // sliderValue represents the rate * 10000 (e.g., 0.02 rate -> 200 for slider)
          const sliderValue = Math.round(currentFeeRate * 10000); 
          
          const existingContract = existingStorageContracts[resourceType];
          const hasActiveContract = !!existingContract;
          
          let initialSliderValueForComparison = sliderValue; // Default to current slider if no contract
          if (hasActiveContract) {
            const contractResource = resources.find(r => r.resourceType === resourceType || r.name === resourceType);
            const contractImportPrice = contractResource?.importPrice;
            let contractRate = 0.02; // Default rate
            if (contractImportPrice && contractImportPrice > 0 && existingContract.pricePerResource !== undefined) {
              contractRate = existingContract.pricePerResource / contractImportPrice;
            } else if (existingContract.pricePerResource !== undefined) {
              // Fallback: assume pricePerResource in contract is the rate
              contractRate = existingContract.pricePerResource;
            }
            initialSliderValueForComparison = Math.round(contractRate * 10000);
          }


          return (
            <div 
              key={`${type}-${resourceType}-${index}`}
              className={`p-2 rounded bg-amber-50 border border-amber-200`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-16 h-16 mr-3 flex-shrink-0 bg-amber-200 rounded overflow-hidden"> {/* Image size increased, margin adjusted */}
                    <img 
                      src={getNormalizedResourceIconPath(resource.icon, resourceType)}
                      alt={resource.name || resourceType}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        // Fallback to default if normalized path also fails
                        (e.target as HTMLImageElement).src = getNormalizedResourceIconPath(undefined, 'default'); 
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{resource.name || resourceType}</div>
                    {resource.amount && (
                      <div className="text-xs text-amber-700">
                        {type === 'inventory' ? 'Quantity: ' : 'Amount: '}{resource.amount}
                      </div>
                    )}
                  </div>
                </div>
                
                {type !== 'store' && (
                  <div className="flex items-center">
                    {(isPubliclySold || isInPubliclySold) && (
                      <div className="text-sm font-medium text-amber-700 mr-2">
                        {formatDucatsPrice(resource.price)} ⚜️
                      </div>
                    )}
                    {(isPubliclySold || isInPubliclySold) && !isDisabled && (
                      <button 
                        onClick={() => handleNegotiateResource(resource)}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        Negotiate
                      </button>
                    )}
                    {!isPubliclySold && !isInPubliclySold && isRunningBusiness && type === 'sell' && (
                      <button 
                        onClick={() => handleSellResource(resource)}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Sell
                      </button>
                    )}
                  </div>
                )}
              </div>

              {type === 'store' && isRunningBusiness && (
                <div className="mt-2 pt-2 border-t border-amber-100">
                  <label htmlFor={`fee-slider-${resourceType}`} className="block text-xs font-medium text-amber-700 mb-1">
                    Public Storage Fee: <span className="font-bold">{displayFeePercent}%/day</span>
                    {!hasActiveContract && !isLoadingContracts && (
                       <span className="text-xs text-red-500 italic ml-1">(Not currently offered)</span>
                    )}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id={`fee-slider-${resourceType}`}
                      type="range"
                      min="0" // Represents 0.00%
                      max="1000" // Represents 10.00% (0.10 rate * 10000 / 100 for percent * 100 for two decimal places)
                      value={sliderValue} // Use sliderValue which is rate * 10000
                      onChange={(e) => handleStorageFeeChange(resourceType, parseInt(e.target.value) / 10000)} // Convert slider value back to rate
                      className="w-full h-1.5 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      disabled={isLoadingContracts}
                    />
                    <button
                      onClick={() => handleUpdateStorageFee(resourceType, resource.name)}
                      disabled={isLoadingContracts || (hasActiveContract && sliderValue === initialSliderValueForComparison)}
                      className={`px-2 py-1 text-xs text-white rounded disabled:bg-gray-400 transition-colors ${
                        hasActiveContract 
                          ? 'bg-orange-700 hover:bg-orange-800' // Darker orange for "Update"
                          : 'bg-red-800 hover:bg-red-900' // Burgundy for "Offer"
                      }`}
                    >
                      {isLoadingContracts ? '...' : (hasActiveContract ? 'Update' : 'Offer')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
