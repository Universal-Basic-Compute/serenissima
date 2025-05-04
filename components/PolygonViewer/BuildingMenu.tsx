/**
 * Building menu component for browsing and placing buildings
 */
import React, { useEffect } from 'react';
import { Tab } from '@headlessui/react';
import BuildingModelViewer from '../UI/BuildingModelViewer';
import PlaceableBuilding from '../PolygonViewer/PlaceableBuilding';
import { Building } from '@/lib/services/BuildingService';
import useBuildingStore from '@/store/useBuildingStore';
import ErrorBoundary from '../UI/ErrorBoundary';
import { log } from '@/lib/logUtils';

interface BuildingMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function BuildingMenu({ visible, onClose }: BuildingMenuProps) {
  // Get state and actions from the store
  const { 
    categories, 
    loading, 
    selectedBuilding, 
    selectedVariant, 
    availableVariants, 
    placeableBuilding,
    loadBuildingCategories,
    getBuildingVariants,
    setSelectedBuilding,
    setSelectedVariant,
    setPlaceableBuilding
  } = useBuildingStore();
  
  // Fetch available variants when a new building is selected
  useEffect(() => {
    if (selectedBuilding) {
      setSelectedVariant("model");
      
      // Fetch variants from the store
      getBuildingVariants(selectedBuilding.name);
    }
  }, [selectedBuilding, getBuildingVariants, setSelectedVariant]);

  // Load building data when the menu becomes visible
  useEffect(() => {
    if (!visible) return;
    loadBuildingCategories();
  }, [visible, loadBuildingCategories]);

  if (!visible) return null;

  return (
    <ErrorBoundary 
      componentName="BuildingMenu"
      onError={(error, errorInfo) => {
        log.error('BuildingMenu error:', error, errorInfo);
      }}
      fallback={
        <div className="fixed inset-x-0 bottom-0 z-30 bg-amber-50 border-t-4 border-red-600 shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-serif text-red-800">Error Loading Buildings</h2>
            <button 
              onClick={onClose}
              className="text-red-700 hover:text-red-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-red-700 mb-4">We encountered an error while loading the building menu. Please try again later.</p>
          <button 
            onClick={() => loadBuildingCategories()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      }
    >
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
            onClick={onClose}
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
                {categories.map((category) => (
                  <Tab
                    key={category.name}
                    className={({ selected }) =>
                      `w-full py-2.5 text-sm font-medium leading-5 rounded-lg
                      ${
                        selected
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-amber-800 hover:bg-amber-200 hover:text-amber-900'
                      }`
                    }
                    onClick={(e) => {
                      // Ensure the click is properly handled
                      e.stopPropagation();
                    }}
                  >
                    {category.name}
                  </Tab>
                ))}
              </Tab.List>
              <Tab.Panels className="mt-2 p-2">
                {categories.map((category) => (
                  <Tab.Panel
                    key={category.name}
                    className="bg-white rounded-lg p-3 shadow-md"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {category.buildings.map((building, index) => (
                        <div 
                          key={index} 
                          className="bg-amber-50 rounded-lg p-4 border border-amber-200 hover:border-amber-400 cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.stopPropagation(); // Ensure the click doesn't bubble up
                            setSelectedBuilding(building);
                          }}
                        >
                          <div className="flex items-start">
                            {/* 3D Model Viewer */}
                            {building.name ? (
                              <div className="mr-4 flex-shrink-0">
                                <BuildingModelViewer 
                                  buildingName={building.name.toLowerCase().replace(/\s+/g, '-')}
                                  width={120}
                                  height={120}
                                  className="rounded bg-amber-100"
                                  variant="model"  // Default variant
                                />
                              </div>
                            ) : (
                              <div className="mr-4 flex-shrink-0 w-20 h-20 bg-amber-100 rounded flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                              </div>
                            )}
                            
                            {/* Building Info */}
                            <div className="flex-grow">
                              <h3 className="text-lg font-medium text-amber-800 mb-1">{building.name}</h3>
                              <div className="flex justify-between text-xs text-amber-600 mb-2">
                                <span>Tier {building.tier}</span>
                                <span>{building.size}</span>
                                {building.assets?.thumbnail && (
                                  <span className="text-green-600">✓</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 mb-3">{building.shortDescription}</p>
                              <div className="flex justify-between items-center">
                                <div className="text-amber-700 font-medium">
                                  {building.constructionCosts.ducats.toLocaleString()} ⚜️
                                </div>
                                <div className="flex space-x-2"> {/* Add this wrapper div with space-x-2 */}
                                  <button 
                                    className="text-xs bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700"
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevent the parent div's onClick from firing
                                      setSelectedBuilding(building);
                                    }}
                                  >
                                    Details
                                  </button>
                                  <button 
                                    className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevent the parent div's onClick from firing
                                      setPlaceableBuilding({
                                        name: building.name,
                                        variant: 'model'
                                      });
                                    }}
                                  >
                                    Build
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>
          )}
        </div>

        {/* Building Detail Modal */}
        {selectedBuilding && (
          <ErrorBoundary
            componentName="BuildingDetailModal"
            fallback={
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
                <div className="bg-amber-50 rounded-lg shadow-xl max-w-md w-full p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-serif text-red-800">Error Loading Building Details</h2>
                    <button 
                      onClick={() => setSelectedBuilding(null)}
                      className="text-red-700 hover:text-red-900 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-red-700 mb-4">
                    We encountered an error while loading the details for this building. Please try again.
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button 
                      onClick={() => setSelectedBuilding(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Close
                    </button>
                    <button 
                      onClick={() => {
                        // Force a re-render of the building details
                        const currentBuilding = {...selectedBuilding};
                        setSelectedBuilding(null);
                        setTimeout(() => setSelectedBuilding(currentBuilding), 100);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            }
          >
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
            <div className="bg-amber-50 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-serif text-amber-800">{selectedBuilding.name}</h2>
                    <div className="flex space-x-2 text-sm text-amber-600 mt-1">
                      <span>Tier {selectedBuilding.tier}</span>
                      <span>•</span>
                      <span>{selectedBuilding.size}</span>
                      <span>•</span>
                      <span>{selectedBuilding.subcategory}</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBuilding(null);
                    }}
                    className="text-amber-700 hover:text-amber-900 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="bg-amber-100 p-4 rounded-lg border border-amber-200 mb-4 italic text-amber-800">
                  "{selectedBuilding.flavorText}"
                </div>
                
                {/* 3D Model Viewer */}
                {selectedBuilding.name ? (
                  <div className="mb-4 flex justify-center">
                    <BuildingModelViewer 
                      buildingName={selectedBuilding.name.toLowerCase().replace(/\s+/g, '-')}
                      width={400}
                      height={400}
                      className="rounded bg-amber-100 border-2 border-amber-300 shadow-md"
                      variant={selectedVariant}
                    />
                  </div>
                ) : selectedBuilding.assets?.thumbnail ? (
                  <div className="mb-4 flex justify-center">
                    <img 
                      src={selectedBuilding.assets.thumbnail} 
                      alt={`${selectedBuilding.name} thumbnail`}
                      className="max-w-full h-auto rounded-lg border-2 border-amber-300 shadow-md"
                      style={{ maxHeight: '200px' }}
                    />
                  </div>
                ) : null}

                <div className="mb-4">
                  <h3 className="text-lg font-medium text-amber-700 mb-2">Description</h3>
                  <p className="text-gray-700">{selectedBuilding.fullDescription}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg border border-amber-200">
                    <h3 className="text-lg font-medium text-amber-700 mb-2">Construction</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cost:</span>
                        <span className="font-medium">{selectedBuilding.constructionCosts.ducats.toLocaleString()} ⚜️</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Time:</span>
                        <span className="font-medium">{(selectedBuilding.constructionTime / 86400000).toFixed(1)} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Maintenance:</span>
                        <span className="font-medium">{selectedBuilding.maintenanceCost} ⚜️/day</span>
                      </div>
                      {selectedBuilding.incomeGeneration && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Income:</span>
                          <span className="font-medium text-green-600">{selectedBuilding.incomeGeneration} ⚜️/day</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-amber-200">
                    <h3 className="text-lg font-medium text-amber-700 mb-2">Requirements</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-gray-600 block">Unlock Condition:</span>
                        <span className="font-medium">{selectedBuilding.unlockCondition}</span>
                      </div>
                      {selectedBuilding.locationRequirements && (
                        <div>
                          <span className="text-gray-600 block">Location:</span>
                          <span className="font-medium">{selectedBuilding.locationRequirements.districtRestrictions}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedBuilding.gameplayInformation && (
                  <div className="bg-white p-4 rounded-lg border border-amber-200 mb-4">
                    <h3 className="text-lg font-medium text-amber-700 mb-2">Gameplay Effects</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedBuilding.gameplayInformation.unlocks && (
                        <div>
                          <span className="text-gray-600 block">Unlocks:</span>
                          <ul className="list-disc list-inside">
                            {selectedBuilding.gameplayInformation.unlocks.map((unlock: string, i: number) => (
                              <li key={i} className="font-medium">{unlock}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedBuilding.gameplayInformation.specialAbilities && (
                        <div>
                          <span className="text-gray-600 block">Special Abilities:</span>
                          <ul className="list-disc list-inside">
                            {selectedBuilding.gameplayInformation.specialAbilities.map((ability: string, i: number) => (
                              <li key={i} className="font-medium">{ability}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBuilding(null);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaceableBuilding({
                        name: selectedBuilding.name,
                        variant: selectedVariant
                      });
                      setSelectedBuilding(null); // Close the modal
                    }}
                  >
                    Build
                  </button>
                </div>
                
                {/* Variant selection if available - as a proper carousel */}
                {selectedBuilding.name && availableVariants.length > 1 && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h3 className="text-lg font-medium text-amber-700 mb-2">Building Variants</h3>
                    
                    {/* Carousel Container */}
                    <div className="relative">
                      {/* Carousel Navigation */}
                      <div className="flex justify-between px-2 mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentIndex = availableVariants.indexOf(selectedVariant);
                            const prevIndex = currentIndex > 0 ? currentIndex - 1 : availableVariants.length - 1;
                            setSelectedVariant(availableVariants[prevIndex]);
                          }}
                          className="p-2 bg-amber-100 rounded-full hover:bg-amber-200 transition-colors shadow-md"
                          aria-label="Previous variant"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-800" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        
                        <div className="text-center">
                          <span className="text-amber-800 font-medium text-lg">
                            {selectedVariant.charAt(0).toUpperCase() + selectedVariant.slice(1)}
                          </span>
                          <span className="text-amber-500 text-sm ml-2">
                            {availableVariants.indexOf(selectedVariant) + 1} / {availableVariants.length}
                          </span>
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentIndex = availableVariants.indexOf(selectedVariant);
                            const nextIndex = currentIndex < availableVariants.length - 1 ? currentIndex + 1 : 0;
                            setSelectedVariant(availableVariants[nextIndex]);
                          }}
                          className="p-2 bg-amber-100 rounded-full hover:bg-amber-200 transition-colors shadow-md"
                          aria-label="Next variant"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-800" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Variant Name and Counter */}
                    <div className="text-center mt-2 mb-3">
                      <span className="text-amber-800 font-medium text-lg">
                        {selectedVariant.charAt(0).toUpperCase() + selectedVariant.slice(1)}
                      </span>
                      <span className="text-amber-500 text-sm ml-2">
                        {availableVariants.indexOf(selectedVariant) + 1} / {availableVariants.length}
                      </span>
                    </div>
                    
                    {/* Variant Indicators/Dots */}
                    <div className="flex justify-center space-x-2 mb-3">
                      {availableVariants.map((variant, index) => (
                        <button
                          key={variant}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVariant(variant);
                          }}
                          className={`w-3 h-3 rounded-full transition-colors ${
                            selectedVariant === variant 
                              ? 'bg-amber-600' 
                              : 'bg-amber-300 hover:bg-amber-400'
                          }`}
                          aria-label={`Select variant ${variant}`}
                        />
                      ))}
                    </div>
                    
                    {/* Variant Buttons */}
                    <div className="flex flex-wrap gap-2 justify-center">
                      {availableVariants.map(variant => (
                        <button
                          key={variant}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVariant(variant);
                          }}
                          className={`px-3 py-1 rounded text-sm ${
                            selectedVariant === variant 
                              ? 'bg-amber-600 text-white' 
                              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          }`}
                        >
                          {variant.charAt(0).toUpperCase() + variant.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Additional model controls if available */}
                {selectedBuilding.name && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h3 className="text-lg font-medium text-amber-700 mb-2">3D Model Controls</h3>
                    <p className="text-sm text-amber-600 mb-2">
                      Click and drag to rotate the model. Scroll to zoom in/out.
                    </p>
                    <button 
                      className="w-full px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        
                        // Create a fullscreen modal for the 3D model
                        const fullscreenModal = document.createElement('div');
                        fullscreenModal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
                        fullscreenModal.style.zIndex = '9999';
                        
                        // Create a container for the model viewer
                        const modelContainer = document.createElement('div');
                        modelContainer.className = 'relative w-[80vw] h-[80vh] bg-amber-50 rounded-lg border-4 border-amber-600 overflow-hidden';
                        
                        // Create a close button
                        const closeButton = document.createElement('button');
                        closeButton.className = 'absolute top-4 right-4 bg-amber-600 text-white p-2 rounded-full z-10 hover:bg-amber-700 transition-colors';
                        closeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>';
                        
                        // Add the close button to the model container
                        modelContainer.appendChild(closeButton);
                        
                        // Add the model container to the fullscreen modal
                        fullscreenModal.appendChild(modelContainer);
                        
                        // Add the fullscreen modal to the body
                        document.body.appendChild(fullscreenModal);
                        
                        // Create a new model viewer element
                        const modelViewer = document.createElement('div');
                        modelViewer.id = 'fullscreen-model-viewer';
                        modelViewer.className = 'w-full h-full';
                        modelContainer.appendChild(modelViewer);
                        
                        // Use React's createRoot API to render the BuildingModelViewer component
                        import('react-dom/client').then(({ createRoot }) => {
                          import('../UI/BuildingModelViewer').then(({ default: BuildingModelViewer }) => {
                            const root = createRoot(modelViewer);
                            root.render(
                              <BuildingModelViewer
                                buildingName={selectedBuilding.name.toLowerCase().replace(/\s+/g, '-')}
                                width={modelContainer.clientWidth}
                                height={modelContainer.clientHeight}
                                variant={selectedVariant}
                              />
                            );
                          });
                        });
                        
                        // Add event listener to close button
                        closeButton.addEventListener('click', () => {
                          // Unmount the React component first
                          import('react-dom/client').then(({ createRoot }) => {
                            try {
                              // Try to unmount the component if possible
                              const root = createRoot(modelViewer);
                              root.unmount();
                            } catch (e) {
                              console.error('Error unmounting component:', e);
                            }
                            
                            // Remove the modal from the DOM
                            document.body.removeChild(fullscreenModal);
                          });
                        });
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      View Fullscreen
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          </ErrorBoundary>
        )}
      </div>
    </div>
  )  /* Add closing parenthesis for the main return statement */
    
  {/* Placeable Building */}
  {placeableBuilding && (
    <ErrorBoundary 
      componentName="PlaceableBuilding"
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md">
            <h3 className="text-xl font-medium text-red-800 mb-4">Building Placement Error</h3>
            <p className="text-gray-700 mb-4">
              There was an error while trying to place the building. Please try again.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setPlaceableBuilding(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  // Reset the placeable building to try again
                  const currentBuilding = {...placeableBuilding};
                  setPlaceableBuilding(null);
                  setTimeout(() => setPlaceableBuilding(currentBuilding), 100);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      }
    >
      <PlaceableBuilding
        buildingName={placeableBuilding?.name?.toLowerCase().replace(/\s+/g, '-') || ''}
        variant={placeableBuilding?.variant}
        onPlace={(position) => {
          log.info(`Building placed at position: ${position.x}, ${position.y}`);
          // Here you would add code to actually place the building in the world
          
          // Dispatch a custom event to notify other components about building placement
          window.dispatchEvent(new CustomEvent('buildingPlaced', {
            detail: {
              buildingName: placeableBuilding?.name,
              variant: placeableBuilding?.variant,
              position
            }
          }));
          
          setPlaceableBuilding(null);
        }}
        onCancel={() => {
          setPlaceableBuilding(null);
        }}
      />
    </ErrorBoundary>
  )}
}
</ErrorBoundary>
