/**
 * Building menu component for browsing and placing buildings
 */
import React, { ErrorInfo, useEffect, useState, useRef } from 'react';
import { Tab } from '@headlessui/react';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { log } from '@/lib/logUtils';
import { Building as ImportedBuilding } from '@/lib/models/BuildingModels';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';
import { BuildingService } from '@/lib/services/BuildingService';
import { getWalletAddress } from '../../lib/utils/walletUtils';
import { eventBus, EventTypes } from '@/lib/eventBus';

// Add global type declaration for the selected building point
declare global {
  interface Window {
    __selectedBuildingPoint?: {
      pointId: string;
      polygonId: string;
      position: any;
      pointType?: 'canal' | 'bridge';
    };
  }
}

// Building Card Component
interface BuildingCardProps {
  building: Building;
  onSelect: (building: Building) => void;
}

const BuildingCard: React.FC<BuildingCardProps> = ({ building, onSelect }) => {
  // Now these hooks are in a stable component, not inside a map function
  const [buildingCost, setBuildingCost] = useState<number | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState<boolean>(false);
  
  // Fetch the cost when the building card is rendered
  useEffect(() => {
    const fetchBuildingCost = async () => {
      setIsLoadingCost(true);
      try {
        const cost = await calculateBuildingCost(building.type || building.name);
        setBuildingCost(cost);
      } catch (error) {
        console.error(`Error fetching cost for ${building.name}:`, error);
        setBuildingCost(null);
      } finally {
        setIsLoadingCost(false);
      }
    };
    
    fetchBuildingCost();
  }, [building.type, building.name]);
  
  return (
    <div
      className="bg-amber-50 rounded-lg p-2 cursor-pointer hover:bg-amber-100 transition-colors"
      onClick={() => onSelect(building)}
    >
      <div className="aspect-square bg-amber-100 rounded-lg overflow-hidden mb-2">
        {building.thumbnail && (
          <img
            src={building.thumbnail}
            alt={building.name}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <h3 className="text-sm font-medium text-amber-800 truncate">
        {building.name}
      </h3>
      <p className="text-xs text-amber-600 truncate">
        {building.subcategory}
      </p>
      {/* Add the cost display here */}
      <p className="text-xs font-medium mt-1">
        {isLoadingCost ? (
          <span className="text-gray-500">Loading cost...</span>
        ) : buildingCost !== null ? (
          <span className="text-amber-700">{buildingCost.toLocaleString()} $COMPUTE</span>
        ) : (
          <span className="text-red-500">Cost unavailable</span>
        )}
      </p>
    </div>
  );
};

// This declaration is already defined above with the complete type

// Define the Building interface with all required properties
interface Building extends Partial<ImportedBuilding> {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description: string; // Make description required instead of optional
  thumbnail?: string;
  size?: string;
  era?: string;
  variant?: string;
  model?: string;
  scale?: number;
  rotation?: number;
  height?: number;
  type: string; // Make type required instead of optional
}

// Ensure the Building type is properly recognized throughout the component
type BuildingWithDescription = Building & { description: string };

interface BuildingMenuProps {
  visible: boolean;
  onClose: () => void;
  onBuildingSelect?: () => void;
  onBuildingClose?: () => void;
}

interface BuildingCategory {
  id: string;
  name: string;
  buildings: Building[];
}

// Helper function to calculate building cost
const calculateBuildingCost = async (buildingType: string): Promise<number> => {
  try {
    // Normalize building type (remove spaces, lowercase)
    const normalizedType = buildingType.toLowerCase().replace(/\s+/g, '-');
    
    // First try to get the building data directly from the API
    try {
      const response = await fetch(`/api/building-data/${normalizedType}`);
      if (response.ok) {
        const buildingData = await response.json();
        if (buildingData.constructionCosts && buildingData.constructionCosts.ducats !== undefined) {
          console.log(`Found cost for ${buildingType} via API: ${buildingData.constructionCosts.ducats} ducats`);
          return buildingData.constructionCosts.ducats;
        }
      }
    } catch (apiError) {
      console.log(`API fetch failed for ${buildingType}, trying direct file access`);
    }
    
    // If API fails, try direct file access
    // Get the list of main categories
    const categoriesResponse = await fetch('/api/building-categories');
    if (!categoriesResponse.ok) {
      throw new Error(`Failed to fetch building categories: ${categoriesResponse.status}`);
    }
    
    const categories = await categoriesResponse.json();
    
    // Search through each category and its subcategories
    for (const category of categories) {
      // Get subcategories for this category
      const subcategoriesResponse = await fetch(`/api/building-subcategories/${category}`);
      if (!subcategoriesResponse.ok) continue;
      
      const subcategories = await subcategoriesResponse.json();
      
      // Try each subcategory
      for (const subcategory of subcategories) {
        try {
          const response = await fetch(`/data/buildings/${category}/${subcategory}/${normalizedType}.json`);
          
          if (response.ok) {
            const buildingData = await response.json();
            
            if (buildingData.constructionCosts && buildingData.constructionCosts.ducats !== undefined) {
              console.log(`Found cost for ${buildingType} in ${category}/${subcategory}: ${buildingData.constructionCosts.ducats} ducats`);
              return buildingData.constructionCosts.ducats;
            }
          }
        } catch (error) {
          // Continue searching in other subcategories
          continue;
        }
      }
    }
    
    // If we couldn't find the building data, use fallback values
    console.warn(`Could not find cost data for ${buildingType}, using fallback values`);
    
    // Fallback costs for common building types
    const fallbackCosts: Record<string, number> = {
      'market-stall': 100,
      'house': 200,
      'workshop': 300,
      'warehouse': 400,
      'tavern': 250,
      'church': 500,
      'palace': 1000,
      'town-hall': 5000000, // Special case for town hall
    };
    
    // Return the fallback cost or default if not found
    return fallbackCosts[normalizedType] || 150;
  } catch (error) {
    console.error(`Error getting building cost for ${buildingType}:`, error);
    return 150; // Default cost on error
  }
};

export default function BuildingMenu({ visible, onClose, onBuildingSelect, onBuildingClose }: BuildingMenuProps) {
  // Local state to track if the menu should be shown via custom event
  const [showViaEvent, setShowViaEvent] = useState(false);
  // Add state to track the point type
  const [pointType, setPointType] = useState<'canal' | 'bridge' | null>(null);
  // Add state for filtered categories
  const [filteredCategories, setFilteredCategories] = useState<BuildingCategory[]>([]);
  const [usingFilteredCategories, setUsingFilteredCategories] = useState<boolean>(false);
  
  // Listen for custom events to show the building menu
  useEffect(() => {
    console.log('BuildingMenu: Setting up event listeners');
    
    const handleShowBuildingMenu = () => {
      console.log('BuildingMenu: Received showBuildingMenu event');
      setShowViaEvent(true);
    };
    
    const handleBuildingPointClick = (event: CustomEvent) => {
      console.log('BuildingMenu: Received buildingPointClick event with data:', event.detail);
      
      // Store the point type if provided
      if (event.detail && event.detail.pointType) {
        setPointType(event.detail.pointType);
      } else {
        // Reset point type if not provided
        setPointType(null);
      }
      
      // Make sure to set the menu to visible
      setShowViaEvent(true);
    };
    
    window.addEventListener('showBuildingMenu', handleShowBuildingMenu);
    window.addEventListener('buildingPointClick', handleBuildingPointClick as EventListener);
    
    return () => {
      window.removeEventListener('showBuildingMenu', handleShowBuildingMenu);
      window.removeEventListener('buildingPointClick', handleBuildingPointClick as EventListener);
    };
  }, []);
  
  // Define the return type of useBuildingMenu hook
  interface BuildingMenuHookResult {
    categories: BuildingCategory[];
    loading: boolean;
    selectedBuilding: Building | null;
    selectedVariant: string | null;
    availableVariants: string[];
    placeableBuilding: { name: string; variant: string; } | null;
    handleSelectBuilding: (building: Building) => void;
    handleSelectVariant: (variant: string) => void;
    handlePlaceBuilding: () => void;
    handlePlacementComplete: () => void;
    handleCancelPlacement: () => void;
    handleCloseDetailModal: () => void;
    handlePreviousVariant: () => void;
    handleNextVariant: () => void;
    loadBuildingCategories: () => Promise<void>;
    setSelectedBuilding: React.Dispatch<React.SetStateAction<Building | null>>;
  }


  // Use the custom hook to handle all building menu logic
  const {
    categories,
    loading,
    selectedBuilding,
    selectedVariant,
    availableVariants,
    placeableBuilding,
    handleSelectBuilding,
    handleSelectVariant,
    handlePlaceBuilding,
    handlePlacementComplete,
    handleCancelPlacement,
    handleCloseDetailModal,
    handlePreviousVariant,
    handleNextVariant,
    loadBuildingCategories,
    setSelectedBuilding
  } = useBuildingMenu(visible || showViaEvent) as unknown as BuildingMenuHookResult;

  // Add this useEffect to filter buildings based on pointType - MOVED HERE after categories is defined
  useEffect(() => {
    if (pointType && categories.length > 0) {
      // Create a filtered copy of the categories
      const filteredCategories = categories.map(category => {
        // Deep clone the category
        const newCategory = { ...category, buildings: [...category.buildings] };
        
        // Filter buildings based on pointType
        if (pointType === 'canal') {
          // Filter for canal-related buildings
          newCategory.buildings = newCategory.buildings.filter(building => 
            ['cargo_landing', 'gondola_station', 'private_dock', 'public_dock', 
             'flood_control_station', 'harbor_chain_tower', 'shipyard', 
             'boat_workshop', 'navigation_school', 'canal_house', 'grand_canal_palace']
              .includes(building.type.toLowerCase().replace(/\s+/g, '_'))
          );
        } else if (pointType === 'bridge') {
          // Filter for bridge-related buildings
          newCategory.buildings = newCategory.buildings.filter(building => 
            ['bridge', 'arsenal_gate', 'rialto_bridge']
              .includes(building.type.toLowerCase().replace(/\s+/g, '_'))
          );
        }
        
        return newCategory;
      });
      
      // Filter out empty categories
      const nonEmptyCategories = filteredCategories.filter(category => category.buildings.length > 0);
      
      // Update the categories state with the filtered categories
      setFilteredCategories(nonEmptyCategories);
      setUsingFilteredCategories(true);
    } else {
      setUsingFilteredCategories(false);
    }
  }, [pointType, categories]);

  // Add state to track the building cost in the detail view
  const [buildingCost, setBuildingCost] = useState<number | undefined>(undefined);

  // Add this effect to fetch the cost when a building is selected
  useEffect(() => {
    if (selectedBuilding) {
      const fetchCost = async () => {
        try {
          const cost = await calculateBuildingCost(selectedBuilding.type || selectedBuilding.name);
          setBuildingCost(cost);
        } catch (error) {
          console.error(`Error fetching cost for ${selectedBuilding.name}:`, error);
          setBuildingCost(undefined);
        }
      };
      
      fetchCost();
    } else {
      setBuildingCost(undefined);
    }
  }, [selectedBuilding]);

  // Handle closing the menu
  const handleClose = () => {
    // Reset local state
    setShowViaEvent(false);
    
    // Reset any selected building if there is one
    if (selectedBuilding) {
      // Call handleCloseDetailModal to properly clean up the selected building state
      handleCloseDetailModal();
    }
    
    // Call the parent's onClose callback
    if (onClose) {
      onClose();
    }
    
    // Explicitly dispatch an event to notify other components that the menu is closed
    window.dispatchEvent(new CustomEvent('buildingMenuClosed'));
    
    // Log to verify the function is being called
    console.log('Building menu close button clicked, dispatching buildingMenuClosed event');
    
    // IMPORTANT: Force the menu to close by directly manipulating the DOM
    // This is a last resort but should ensure the menu closes
    if (typeof window !== 'undefined') {
      // Force the menu to close by setting display: none on the menu element
      const menuElement = document.querySelector('.building-menu-container');
      if (menuElement) {
        (menuElement as HTMLElement).style.display = 'none';
      }
    }
    
    // Force a state update in the parent component
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    }
  };

  if (!visible && !showViaEvent) {
    console.log('BuildingMenu: Not visible, returning null');
    return null;
  }

  return (
    <ErrorBoundary
      fallback={<div className="p-4 text-red-600">Something went wrong with the Building Menu</div>}
      onError={(error: Error, errorInfo: ErrorInfo) => {
        log.error('BuildingMenu error:', error, errorInfo);
      }}
    >
      <div className="building-menu-container">
        <div className="fixed inset-x-0 bottom-0 z-30 transform transition-transform duration-300 ease-in-out" 
          onClick={(e) => {
            // Only stop propagation, don't close the menu when clicking inside
            e.stopPropagation();
          }}
        >
          <div className="bg-amber-50 border-t-4 border-amber-600 shadow-lg max-h-[70vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-amber-300">
              <h2 className="text-2xl font-serif text-amber-800">Buildings of La Serenissima</h2>
              <button 
                onClick={handleClose}
                className="text-amber-700 hover:text-amber-900 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-auto">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
                </div>
              ) : (
                <Tab.Group>
                  <Tab.List className="flex space-x-1 bg-amber-100 p-1">
                    {/* Show a special header if we're in a filtered mode */}
                    {pointType && (
                      <div className="w-full py-2.5 text-sm font-medium leading-5 text-amber-700 bg-amber-200 rounded-lg px-3">
                        {pointType === 'canal' ? 'Canal Structures' : 'Bridge Structures'}
                      </div>
                    )}
                    
                    {/* Only show tabs if we're not in a filtered mode */}
                    {!pointType && (usingFilteredCategories ? filteredCategories : categories).map((category): React.ReactElement => {
                      return (
                        <Tab
                          key={category.name}
                          className={({ selected }) =>
                            `w-full py-2.5 text-sm font-medium leading-5 text-amber-700 rounded-lg
                            ${selected 
                              ? 'bg-amber-600 text-white shadow' 
                              : 'hover:bg-amber-200 hover:text-amber-900'}`
                          }
                        >
                          {category.name}
                        </Tab>
                      );
                    })}
                  </Tab.List>
                  <Tab.Panels className="mt-2">
                    {(usingFilteredCategories ? filteredCategories : categories).map((category): React.ReactElement => {
                      return (
                        <Tab.Panel
                          key={category.name}
                          className="p-3 bg-white rounded-lg"
                        >
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {category.buildings.map((building) => (
                              <BuildingCard 
                                key={building.name || building.id}
                                building={building}
                                onSelect={(building) => {
                                  handleSelectBuilding(building);
                                  if (onBuildingSelect) onBuildingSelect();
                                }}
                              />
                            ))}
                          </div>
                      </Tab.Panel>
                      );
                    })}
                  </Tab.Panels>
                </Tab.Group>
              )}
            </div>
          </div>
        </div>
        
        {/* Building Detail Modal */}
        {selectedBuilding && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div 
              className="bg-amber-50 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-4 border-b border-amber-300">
                <h2 className="text-2xl font-serif text-amber-800">{selectedBuilding.name}</h2>
                <button 
                  onClick={() => {
                    handleCloseDetailModal();
                    if (onBuildingClose) onBuildingClose();
                  }}
                  className="text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex-grow overflow-auto p-4 flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/2 bg-amber-100 rounded-lg overflow-hidden p-4">
                  <div className="flex flex-col items-center justify-center h-[300px]">
                    <div className="w-32 h-32 bg-amber-200 rounded-lg flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-amber-800 mb-2">{selectedBuilding.name}</h3>
                    
                    {/* Variant selector - keep this if you still want to select variants */}
                    {availableVariants.length > 1 && (
                      <div className="flex items-center justify-center p-2 bg-amber-200 rounded-lg mt-4 w-full">
                        <button 
                          onClick={handlePreviousVariant}
                          className="p-1 text-amber-800 hover:text-amber-950"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <span className="mx-2 text-sm font-medium text-amber-900">
                          Variant: {selectedVariant || 'Default'} ({availableVariants.indexOf(selectedVariant || 'default') + 1}/{availableVariants.length})
                        </span>
                        <button 
                          onClick={handleNextVariant}
                          className="p-1 text-amber-800 hover:text-amber-950"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="w-full md:w-1/2 flex flex-col">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-amber-800 mb-1">Description</h3>
                    <p className="text-amber-700">{selectedBuilding?.description || 'No description available'}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-amber-800 mb-1">Details</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm">
                        <span className="font-medium text-amber-800">Category:</span>{' '}
                        <span className="text-amber-700">{selectedBuilding.category}</span>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium text-amber-800">Subcategory:</span>{' '}
                        <span className="text-amber-700">{selectedBuilding.subcategory}</span>
                      </div>
                      {selectedBuilding.size && (
                        <div className="text-sm">
                          <span className="font-medium text-amber-800">Size:</span>{' '}
                          <span className="text-amber-700">{selectedBuilding.size}</span>
                        </div>
                      )}
                      {selectedBuilding.era && (
                        <div className="text-sm">
                          <span className="font-medium text-amber-800">Era:</span>{' '}
                          <span className="text-amber-700">{selectedBuilding.era}</span>
                        </div>
                      )}
                      
                      {/* Add cost information here */}
                      <div className="text-sm col-span-2 mt-2 p-2 bg-amber-100 rounded-md">
                        <span className="font-medium text-amber-800">Construction Cost:</span>{' '}
                        <span className="text-amber-700 font-bold">
                          {buildingCost !== undefined ? (
                            `${buildingCost.toLocaleString()} $COMPUTE`
                          ) : (
                            <span className="text-gray-500">Loading...</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-auto">
                    <button
                      onClick={async (event) => {
                        try {
                          // Get the current wallet address
                          const walletAddress = getWalletAddress();
                          
                          if (!walletAddress) {
                            alert('Please connect your wallet first');
                            return;
                          }
                          
                          // Get the selected building point from the event that triggered the menu
                          const buildingPoint = window.__selectedBuildingPoint;
                          
                          if (!buildingPoint) {
                            alert('No building point selected. Please select a building point first.');
                            return;
                          }
                          
                          // Ensure we have a valid building type
                          if (!selectedBuilding) {
                            alert('No building selected');
                            return;
                          }
                          
                          // Normalize the building type, ensuring we always have a valid string
                          const buildingType = (selectedBuilding.type || selectedBuilding.name || "unknown").toLowerCase();
                          
                          // Check if this is a special point type (canal or bridge)
                          if (buildingPoint.pointType) {
                            // Ensure the selected building is appropriate for this point type
                            const isAppropriateBuilding = 
                              (buildingPoint.pointType === 'canal' && 
                                ['cargo_landing', 'gondola_station', 'private_dock', 'public_dock', 
                                 'flood_control_station', 'harbor_chain_tower', 'shipyard', 
                                 'boat_workshop', 'navigation_school', 'canal_house', 'grand_canal_palace']
                                  .includes(buildingType.replace(/\s+/g, '_'))) ||
                              (buildingPoint.pointType === 'bridge' && 
                                ['bridge', 'arsenal_gate', 'rialto_bridge']
                                  .includes(buildingType.replace(/\s+/g, '_')));
                            
                            if (!isAppropriateBuilding) {
                              alert(`This building cannot be placed at a ${buildingPoint.pointType} point. Please select an appropriate ${buildingPoint.pointType} structure.`);
                              return;
                            }
                          }
                          
                          // Get the building cost from the JSON file
                          const buildingCost = await calculateBuildingCost(buildingType);
                          
                          // Show confirmation dialog
                          if (!window.confirm(`Confirm building construction: ${selectedBuilding.name}\nCost: ${buildingCost.toLocaleString()} $COMPUTE`)) {
                            return;
                          }
                          
                          // Show loading state
                          const originalButtonText = (event.target as HTMLButtonElement).innerText;
                          (event.target as HTMLButtonElement).innerText = 'Building...';
                          (event.target as HTMLButtonElement).disabled = true;
                          
                          // Create the building directly via API
                          const buildingService = BuildingService.getInstance();
                          const buildingData = {
                            // Use the already normalized type
                            type: buildingType.replace(/\s+/g, '-'),
                            land_id: buildingPoint.polygonId,
                            position: buildingPoint.position,
                            rotation: 0, // Default rotation
                            variant: selectedVariant,
                            created_by: walletAddress,
                            created_at: new Date().toISOString()
                          };
                          
                          // Call the API to create the building
                          const result = await buildingService.createBuildingAtPoint(buildingData, buildingCost);
                          
                          // Reset button state
                          (event.target as HTMLButtonElement).innerText = originalButtonText;
                          (event.target as HTMLButtonElement).disabled = false;
                          
                          // Close the detail modal
                          handleCloseDetailModal();
                          
                          // Close the entire building menu
                          handleClose();
                          
                          // If onBuildingClose callback exists, call it
                          if (onBuildingClose) onBuildingClose();
                          
                          // Emit event to place the 3D model without refreshing the map
                          eventBus.emit(EventTypes.BUILDING_PLACED, {
                            buildingId: result.id,
                            type: result.type,
                            variant: result.variant,
                            data: result
                          });
                          
                          // Show success message
                          alert(`Successfully built ${selectedBuilding.name}!`);
                          
                        } catch (error) {
                          console.error('Error building:', error);
                          alert(`Failed to build: ${error instanceof Error ? error.message : String(error)}`);
                          
                          // Reset button state if needed
                          if ((event.target as HTMLButtonElement).disabled) {
                            (event.target as HTMLButtonElement).innerText = 'Build Building';
                            (event.target as HTMLButtonElement).disabled = false;
                          }
                        }
                      }}
                      className="w-full py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Build Building
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Placeable Building */}
        {placeableBuilding && (
          <PlaceableObjectManager
            active={true}
            type="building"
            objectData={placeableBuilding}
            constraints={{
              requireLandOwnership: true
            }}
            onComplete={handlePlacementComplete}
            onCancel={handleCancelPlacement}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
