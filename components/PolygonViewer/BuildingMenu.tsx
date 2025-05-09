/**
 * Building menu component for browsing and placing buildings
 */
import React, { ErrorInfo, useEffect, useState } from 'react';
import { Tab } from '@headlessui/react';
import BuildingModelViewer from '../UI/BuildingModelViewer';
import PlaceableBuilding from './PlaceableBuilding';
import { Building } from '@/lib/services/BuildingService';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { log } from '@/lib/logUtils';

interface BuildingMenuProps {
  visible: boolean;
  onClose: () => void;
}

interface BuildingCategory {
  id: string;
  name: string;
  buildings: Building[];
}

export default function BuildingMenu({ visible, onClose }: BuildingMenuProps) {
  // Local state to track if the menu should be shown via custom event
  const [showViaEvent, setShowViaEvent] = useState(false);
  
  // Listen for custom events to show the building menu
  useEffect(() => {
    const handleShowBuildingMenu = () => {
      setShowViaEvent(true);
    };
    
    window.addEventListener('showBuildingMenu', handleShowBuildingMenu);
    
    return () => {
      window.removeEventListener('showBuildingMenu', handleShowBuildingMenu);
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
    setShowViaEvent(false);
    onClose();
  };

  if (!visible && !showViaEvent) return null;

  return (
    <ErrorBoundary
      fallback={<div className="p-4 text-red-600">Something went wrong with the Building Menu</div>}
      onError={(error: Error, errorInfo: ErrorInfo) => {
        log.error('BuildingMenu error:', error, errorInfo);
      }}
    >
      <div>
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
                    {categories.map((category, index: number, array): React.ReactElement => {
                      // Create a compatible category object with the required id property
                      const compatibleCategory: BuildingCategory = {
                        ...category,
                        id: category.name // Use the name as id if it doesn't exist
                      };
                      
                      return (
                        <Tab
                          key={compatibleCategory.id}
                          className={({ selected }) =>
                            `w-full py-2.5 text-sm font-medium leading-5 text-amber-700 rounded-lg
                            ${selected 
                              ? 'bg-amber-600 text-white shadow' 
                              : 'hover:bg-amber-200 hover:text-amber-900'}`
                          }
                        >
                          {compatibleCategory.name}
                        </Tab>
                      );
                    })}
                  </Tab.List>
                  <Tab.Panels className="mt-2">
                    {categories.map((category, index: number, array): React.ReactElement => {
                      // Create a compatible category object with the required id property
                      const compatibleCategory: BuildingCategory = {
                        ...category,
                        id: category.name // Use the name as id if it doesn't exist
                      };
                      
                      return (
                        <Tab.Panel
                          key={compatibleCategory.id}
                          className="p-3 bg-white rounded-lg"
                        >
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {compatibleCategory.buildings.map((building) => (
                            <div
                              key={building.id}
                              className="bg-amber-50 rounded-lg p-2 cursor-pointer hover:bg-amber-100 transition-colors"
                              onClick={() => handleSelectBuilding(building)}
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
                  onClick={handleCloseDetailModal}
                  className="text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex-grow overflow-auto p-4 flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/2 bg-amber-100 rounded-lg overflow-hidden">
                  <BuildingModelViewer 
                    buildingName={selectedBuilding.name.toLowerCase().replace(/\s+/g, '-')} 
                    variant={selectedVariant}
                  />
                  
                  {/* Variant selector */}
                  {availableVariants.length > 1 && (
                    <div className="flex items-center justify-center p-2 bg-amber-200">
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
                      onClick={() => handlePlaceBuilding(selectedBuilding, selectedVariant)}
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
          <PlaceableBuilding
            buildingName={placeableBuilding?.name?.toLowerCase().replace(/\s+/g, '-') || ''}
            variant={placeableBuilding?.variant}
            onPlace={handlePlacementComplete}
            onCancel={handleCancelPlacement}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
