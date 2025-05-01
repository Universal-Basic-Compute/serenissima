import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';

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

  // Load building data
  useEffect(() => {
    if (!visible) return;

    const loadBuildingData = async () => {
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

        for (const category of categoryFiles) {
          try {
            const response = await fetch(`/data/buildings/${category}.json`);
            if (response.ok) {
              const buildings = await response.json();
              loadedCategories.push({
                name: category.charAt(0).toUpperCase() + category.slice(1).replace('&', ' & '),
                buildings: buildings
              });
            }
          } catch (error) {
            console.error(`Error loading ${category} buildings:`, error);
          }
        }

        setCategories(loadedCategories);
      } catch (error) {
        console.error('Error loading building data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadBuildingData();
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 transform transition-transform duration-300 ease-in-out">
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
                          onClick={() => setSelectedBuilding(building)}
                        >
                          <h3 className="text-lg font-medium text-amber-800 mb-1">{building.name}</h3>
                          <div className="flex justify-between text-xs text-amber-600 mb-2">
                            <span>Tier {building.tier}</span>
                            <span>{building.size}</span>
                          </div>
                          <p className="text-sm text-gray-700 mb-3">{building.shortDescription}</p>
                          <div className="flex justify-between items-center">
                            <div className="text-amber-700 font-medium">
                              {building.constructionCosts.ducats.toLocaleString()} ⚜️
                            </div>
                            <button className="text-xs bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700">
                              Details
                            </button>
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
                    onClick={() => setSelectedBuilding(null)}
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
                    onClick={() => setSelectedBuilding(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                  >
                    Build
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
