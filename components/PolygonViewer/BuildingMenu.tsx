import React, { useState, useEffect, useCallback } from 'react';
import { Tab } from '@headlessui/react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import BuildingModelViewer from '../UI/BuildingModelViewer';

interface Building {
  name: string;
  category: string;
  subcategory: string;
  tier: number;
  size: string;
  unlockCondition: string;
  shortDescription: string;
  fullDescription: string;
  flavorText: string;
  constructionCosts: {
    ducats: number;
    [key: string]: number;
  };
  maintenanceCost: number;
  constructionTime: number;
  assets?: {
    models?: string;  // This will now be the base path to the models directory
    variants?: string[];  // Optional list of variant names (without .glb extension)
    thumbnail?: string;
  };
  [key: string]: any; // For other properties
}

interface BuildingCategory {
  name: string;
  buildings: Building[];
}

interface BuildingMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function BuildingMenu({ visible, onClose }: BuildingMenuProps) {
  const [categories, setCategories] = useState<BuildingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>("model");
  const [availableVariants, setAvailableVariants] = useState<string[]>([]);
  
  // Reset the selected variant and fetch available variants when a new building is selected
  useEffect(() => {
    if (selectedBuilding) {
      setSelectedVariant("model");
      
      // Fetch available variants for this building
      const buildingName = selectedBuilding.name.toLowerCase().replace(/\s+/g, '-');
      
      fetch(`/api/building-variants/${buildingName}`)
        .then(response => {
          if (response.ok) return response.json();
          throw new Error('Failed to fetch variants');
        })
        .then(data => {
          if (data.success && data.variants) {
            setAvailableVariants(data.variants);
            console.log(`Loaded ${data.variants.length} variants for ${buildingName}`);
          } else {
            setAvailableVariants(['model']); // Default to just 'model' if no variants found
          }
        })
        .catch(error => {
          console.error('Error fetching variants:', error);
          setAvailableVariants(['model']); // Default to just 'model' on error
        });
    }
  }, [selectedBuilding]);

  // Memoized function to load building data
  const loadBuildingData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all building categories
      const categoryFiles = [
        'residential',
        'commercial',
        'production',
        'infrastructure',
        'public&government',
        'military&defence',
        'special'
      ];

      const loadedCategories: BuildingCategory[] = [];
      const apiBaseUrl = getApiBaseUrl();

      for (const category of categoryFiles) {
        try {
          console.log(`Fetching buildings for category: ${category}`);
          
          // Try the Next.js API route first
          let response = await fetch(`/api/buildings/${category}`, {
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          
          // If that fails, try the direct backend API
          if (!response.ok) {
            console.log(`Falling back to direct API for ${category}`);
            response = await fetch(`${apiBaseUrl}/api/buildings/${category}`, {
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
          }
          
          if (response.ok) {
            const buildings = await response.json();
            console.log(`Loaded ${buildings.length} buildings for category ${category}`);
            
            loadedCategories.push({
              name: category.charAt(0).toUpperCase() + category.slice(1).replace('&', ' & '),
              buildings: buildings
            });
          } else {
            console.warn(`Failed to load buildings for ${category}: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error loading ${category} buildings:`, error);
        }
      }

      console.log(`Total categories loaded: ${loadedCategories.length}`);
      setCategories(loadedCategories);
    } catch (error) {
      console.error('Error loading building data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load building data when the menu becomes visible
  useEffect(() => {
    if (!visible) return;
    loadBuildingData();
  }, [visible, loadBuildingData]);

  if (!visible) return null;

  return (
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
                                      // Dispatch a custom event to notify other components about building selection
                                      window.dispatchEvent(new CustomEvent('buildingSelected', {
                                        detail: building
                                      }));
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
                      // Dispatch a custom event to notify other components about building selection
                      window.dispatchEvent(new CustomEvent('buildingSelected', {
                        detail: selectedBuilding
                      }));
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
                        // Dispatch event to show 3D model in fullscreen
                        window.dispatchEvent(new CustomEvent('showBuildingModel', {
                          detail: {
                            modelUrl: `/assets/buildings/models/${selectedBuilding.name.toLowerCase().replace(/\s+/g, '-')}/${selectedVariant}.glb`,
                            buildingName: selectedBuilding.name
                          }
                        }));
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
        )}
      </div>
    </div>
  );
}
