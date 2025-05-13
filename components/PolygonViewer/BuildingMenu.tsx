/**
 * Building menu component for browsing and placing buildings
 */
import React, { ErrorInfo, useEffect, useState } from 'react';
import { Tab } from '@headlessui/react';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { log } from '@/lib/logUtils';
import { Building as ImportedBuilding } from '@/lib/models/BuildingModels';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';

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
}

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

export default function BuildingMenu({ visible, onClose, onBuildingSelect, onBuildingClose }: BuildingMenuProps) {
  // Local state to track if the menu should be shown via custom event
  const [showViaEvent, setShowViaEvent] = useState(false);
  
  // Listen for custom events to show the building menu
  useEffect(() => {
    const handleShowBuildingMenu = () => {
      console.log('BuildingMenu: Received showBuildingMenu event');
      setShowViaEvent(true);
    };
    
    const handleBuildingPointClick = (event: CustomEvent) => {
      console.log('BuildingMenu: Received buildingPointClick event', event.detail);
      setShowViaEvent(true);
    };
    
    window.addEventListener('showBuildingMenu', handleShowBuildingMenu);
    window.addEventListener('buildingPointClick', handleBuildingPointClick as EventListener);
    
    return () => {
      window.removeEventListener('showBuildingMenu', handleShowBuildingMenu);
      window.removeEventListener('buildingPointClick', handleBuildingPointClick as EventListener);
    };
  }, []);
  
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
  } = useBuildingMenu(visible || showViaEvent);

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

  if (!visible && !showViaEvent) return null;

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
                    {categories.map((category): React.ReactElement => {
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
                    {categories.map((category): React.ReactElement => {
                      return (
                        <Tab.Panel
                          key={category.name}
                          className="p-3 bg-white rounded-lg"
                        >
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {category.buildings.map((building) => (
                            <div
                              key={building.name || building.id}
                              className="bg-amber-50 rounded-lg p-2 cursor-pointer hover:bg-amber-100 transition-colors"
                              onClick={() => {
                                handleSelectBuilding(building);
                                if (onBuildingSelect) onBuildingSelect();
                              }}
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
                            </div>
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
                    <p className="text-amber-700">{selectedBuilding.description}</p>
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
                    </div>
                  </div>
                  
                  <div className="mt-auto">
                    <button
                      onClick={() => {
                        // Call handlePlaceBuilding to set up the placeable building
                        handlePlaceBuilding(selectedBuilding, selectedVariant);
                        
                        // Close the detail modal
                        handleCloseDetailModal();
                        
                        // Close the entire building menu
                        handleClose();
                        
                        // If onBuildingClose callback exists, call it
                        if (onBuildingClose) onBuildingClose();
                      }}
                      className="w-full py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Place Building
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
            objectData={{
              name: placeableBuilding?.name?.toLowerCase().replace(/\s+/g, '-') || '',
              variant: placeableBuilding?.variant
            }}
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
