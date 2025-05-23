import React, { useState, useEffect, useMemo } from 'react';
import { fetchBuildingTypes } from '@/lib/utils/buildingTypeUtils';
import { FaTimes } from 'react-icons/fa';

// Helper function to format numbers with spaces as thousand separators
const formatNumberWithSpaces = (num: number | undefined | null): string => {
  if (num === undefined || num === null) {
    return 'N/A';
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

interface ProductionInfo {
  Arti?: Array<{
    inputs: Record<string, number>;
    outputs: Record<string, number>;
    craftMinutes: number;
  }>;
  storageCapacity?: number;
  stores?: string[];
  sells?: string[];
}

interface BuildingType {
  type: string;
  name: string;
  buildTier: number;
  pointType: string | null;
  constructionCosts?: {
    ducats?: number;
    [resource: string]: number | undefined;
  };
  maintenanceCost?: number;
  shortDescription?: string;
  category?: string;
  subcategory?: string;
  productionInformation?: ProductionInfo;
  canImport?: boolean;
}

interface BuildingCreationPanelProps {
  selectedPoint: {
    lat: number;
    lng: number;
    polygonId: string;
    pointType: 'land' | 'canal' | 'bridge';
  };
  onClose: () => void;
  onBuild: (buildingType: string, point: { lat: number; lng: number; polygonId: string; pointType: string }, cost: number) => void;
}

const TIER_NAMES: { [key: number]: string } = {
  1: 'Tier 1: Facchini',
  2: 'Tier 2: Popolani',
  3: 'Tier 3: Cittadini',
  4: 'Tier 4: Nobili',
  5: 'Tier 5: Unique', // Added Tier 5
};

const BuildingCreationPanel: React.FC<BuildingCreationPanelProps> = ({ selectedPoint, onClose, onBuild }) => {
  const [allBuildingTypes, setAllBuildingTypes] = useState<BuildingType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<number>(1);
  const [detailedBuildingType, setDetailedBuildingType] = useState<BuildingType | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const types = await fetchBuildingTypes();
        // Ensure constructionCosts.ducats is a number, default to 0 if not present
        const processedTypes = types.map(bt => ({
          ...bt,
          constructionCosts: {
            ...bt.constructionCosts,
            ducats: Number(bt.constructionCosts?.ducats) || 0,
          },
          pointType: bt.pointType || 'land' // Default to 'land' if null
        }));
        setAllBuildingTypes(processedTypes);
      } catch (err) {
        console.error('Failed to fetch building types:', err);
        setError('Failed to load building types. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredBuildingTypes = useMemo(() => {
    return allBuildingTypes.filter(bt => {
      const buildingDesignatedPointType = bt.pointType; // Rappel : ceci est 'land' si la valeur originale était null
      const actualSelectedPointType = selectedPoint.pointType;

      if (actualSelectedPointType === 'land') {
        // Pour les points terrestres, autoriser les bâtiments spécifiquement pour 'land' ou 'building'
        return buildingDesignatedPointType === 'land' || buildingDesignatedPointType === 'building';
      } else {
        // Pour les points 'canal' ou 'bridge', autoriser une correspondance directe ou les bâtiments 'land' comme solution de repli
        return buildingDesignatedPointType === actualSelectedPointType || buildingDesignatedPointType === 'land';
      }
    });
  }, [allBuildingTypes, selectedPoint.pointType]);

  const buildingsByTier = useMemo(() => {
    const grouped: { [key: number]: BuildingType[] } = {};
    filteredBuildingTypes.forEach(bt => {
      if (!grouped[bt.buildTier]) { // Changed from bt.tier to bt.buildTier
        grouped[bt.buildTier] = []; // Changed from bt.tier to bt.buildTier
      }
      grouped[bt.buildTier].push(bt); // Changed from bt.tier to bt.buildTier
    });
    // Sort buildings within each tier alphabetically by name
    for (const tier in grouped) {
      grouped[tier].sort((a, b) => a.name.localeCompare(b.name));
    }
    return grouped;
  }, [filteredBuildingTypes]);

  const availableTiers = useMemo(() => {
    return Object.keys(buildingsByTier).map(Number).sort((a, b) => a - b);
  }, [buildingsByTier]);

  useEffect(() => {
    // Set activeTier to the lowest available tier when data loads or pointType changes
    if (availableTiers.length > 0 && !availableTiers.includes(activeTier)) {
      setActiveTier(availableTiers[0]);
    } else if (availableTiers.length > 0 && !activeTier) {
      setActiveTier(availableTiers[0]);
    } else if (availableTiers.length === 0) {
      setActiveTier(0); // No tiers available
    }
  }, [availableTiers, activeTier]);


  const getBuildingImagePath = (type: string): string => {
    const typeFormatted = type.toLowerCase().replace(/[_-]/g, '_');
    // Prioritize .png, then .jpg
    // For now, let's assume a common pattern. This might need adjustment based on actual image availability.
    return `/images/buildings/${typeFormatted}.png`; 
  };

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = event.currentTarget;
    const currentSrc = target.src;
    const typeFormatted = target.alt.toLowerCase().replace(/[_-]/g, '_'); // Assuming alt is building type

    if (currentSrc.endsWith('.png')) {
      target.src = `/images/buildings/${typeFormatted}.jpg`;
    } else if (currentSrc.endsWith('.jpg')) {
      target.src = '/images/buildings/contract_stall.jpg'; // Final fallback
    } else {
      // If it wasn't .png or .jpg (e.g. already fallback), prevent infinite loop
      target.src = '/images/buildings/contract_stall.jpg';
    }
  };

  const getResourceImagePath = (resourceName: string): string => {
    if (!resourceName) return '/images/resources/default.png';
    const formattedName = resourceName.toLowerCase().replace(/\s+/g, '_');
    return `/images/resources/${formattedName}.png`;
  };

  const handleResourceImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = event.currentTarget;
    // Basic fallback, can be expanded if multiple resource image types (jpg, etc.)
    target.src = '/images/resources/default.png'; 
  };
  
  const handleBuildClick = (building: BuildingType) => {
    const cost = building.constructionCosts?.ducats || 0;
    // Pass the full selectedPoint object which includes lat, lng, polygonId, and pointType
    onBuild(building.type, selectedPoint, cost); 
  };

  // Expose methods for the detailed view renderer
  // This is a workaround. Ideally, renderDetailedBuildingView would be a child component.
  (BuildingCreationPanel as any).handleBackToGridClick = () => setDetailedBuildingType(null);
  (BuildingCreationPanel as any).getBuildingImagePath = getBuildingImagePath; // For building images
  (BuildingCreationPanel as any).handleImageError = handleImageError; // For building images
  (BuildingCreationPanel as any).getResourceImagePath = getResourceImagePath; // For resource images
  (BuildingCreationPanel as any).handleResourceImageError = handleResourceImageError; // For resource images
  (BuildingCreationPanel as any).handleBuildClick = handleBuildClick;


  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-amber-50 p-8 rounded-lg shadow-xl text-amber-800">
          Loading building options...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-red-100 p-8 rounded-lg shadow-xl text-red-700">
          <p>{error}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }
  
  const pointTypeDisplay = selectedPoint.pointType.charAt(0).toUpperCase() + selectedPoint.pointType.slice(1);

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-40 p-4">
      <div className="bg-amber-50 text-amber-900 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border-2 border-amber-700">
        <div className="flex justify-between items-center p-4 border-b border-amber-300">
          <h2 className="text-2xl font-serif">Construct Building on {pointTypeDisplay} Point</h2>
          <button onClick={onClose} className="text-amber-600 hover:text-amber-800">
            <FaTimes size={24} />
          </button>
        </div>

        <div className="p-4 border-b border-amber-200">
          <div className="flex space-x-2">
            {availableTiers.length > 0 ? availableTiers.map(tier => (
              <button
                key={tier}
                onClick={() => setActiveTier(tier)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors
                  ${activeTier === tier 
                    ? 'bg-amber-600 text-white shadow-md' 
                    : 'bg-amber-200 hover:bg-amber-300 text-amber-700'
                  }`}
              >
                {TIER_NAMES[tier] || `Tier ${tier}`}
              </button>
            )) : (
              <p className="text-amber-700">No buildings available for this point type.</p>
            )}
          </div>
        </div>

        <div className="overflow-y-auto p-6 flex-grow">
          {!detailedBuildingType ? (
            <>
              {availableTiers.length > 0 && buildingsByTier[activeTier] ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {buildingsByTier[activeTier].map(building => (
                    <div key={building.type} className="bg-amber-100 border border-amber-300 rounded-lg p-3 shadow-md hover:shadow-lg transition-shadow flex flex-col justify-between">
                      <div>
                        <img
                          src={getBuildingImagePath(building.type)}
                          alt={building.type}
                          onError={handleImageError}
                          className="w-full h-32 object-cover rounded-md mb-2 border border-amber-200"
                        />
                        <h3 className="text-md font-semibold font-serif text-amber-800">{building.name}</h3>
                        <p className="text-xs text-amber-600 mb-1 capitalize">{building.category} - {building.subcategory}</p>
                        <p className="text-xs text-amber-700 mb-2 line-clamp-3">{building.shortDescription || 'No description available.'}</p>
                      </div>
                      <div className="mt-auto pt-2">
                        <p className="text-sm font-medium text-amber-900 mb-2">
                          Cost: ⚜️ {formatNumberWithSpaces(building.constructionCosts?.ducats)}
                        </p>
                        <button
                          onClick={() => setDetailedBuildingType(building)}
                          className="w-full px-3 py-1.5 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 transition-colors"
                        >
                          See more
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : availableTiers.length > 0 ? (
                <p className="text-center text-amber-700 py-8">Select a tier to view available buildings.</p>
              ) : null}
            </>
          ) : (
            renderDetailedBuildingView(detailedBuildingType, getResourceImagePath, handleResourceImageError)
          )}
        </div>
      </div>
    </div>
  );
};

// Helper component/function to render the detailed view
const renderDetailedBuildingView = (
  building: BuildingType,
  getResourceImagePath: (resourceName: string) => string,
  handleResourceImageError: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void
) => {
  const { 
    type, name, category, subcategory, buildTier, pointType, 
    constructionCosts, maintenanceCost, shortDescription, 
    productionInformation, canImport 
  } = building;

  const renderResourceList = (items: string[] | undefined, title: string) => {
    if (!items || items.length === 0) return null;
    return (
      <div>
        <strong className="text-amber-700 block mb-1">{title}:</strong>
        <div className="flex flex-wrap gap-2">
          {items.map(item => (
            <div key={item} className="flex items-center bg-amber-200/50 px-2 py-1 rounded-md text-xs">
              <img 
                src={getResourceImagePath(item)} 
                alt={item} 
                className="w-4 h-4 mr-1.5 object-contain" 
                onError={handleResourceImageError} 
              />
              <span className="capitalize">{item.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-amber-50 p-6 rounded-lg shadow-inner text-sm">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-amber-300">
        <h3 className="text-3xl font-serif text-amber-800">{name}</h3>
        <button 
          onClick={() => (BuildingCreationPanel as any).handleBackToGridClick()}
          className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors text-sm"
        >
          Back to List
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Image & Basic Info */}
        <div className="md:col-span-1 space-y-3">
          <img
            src={(BuildingCreationPanel as any).getBuildingImagePath(type)}
            alt={name}
            onError={(e) => (BuildingCreationPanel as any).handleImageError(e)}
            className="w-full h-auto aspect-video object-cover rounded-lg border-2 border-amber-300 shadow-md mb-3"
          />
          <p><strong className="text-amber-700">Type:</strong> <span className="font-mono text-xs bg-amber-200/60 px-1 py-0.5 rounded">{type}</span></p>
          <p><strong className="text-amber-700">Category:</strong> {category} - {subcategory}</p>
          <p><strong className="text-amber-700">Tier:</strong> {TIER_NAMES[buildTier] || `Tier ${buildTier}`}</p>
          <p><strong className="text-amber-700">Point Type:</strong> {pointType || 'N/A'}</p>
        </div>

        {/* Middle Column: Costs & Description */}
        <div className="md:col-span-1 space-y-4">
          <div>
            <h4 className="text-lg font-semibold font-serif text-amber-700 mb-2">Description:</h4>
            <p className="text-amber-800 leading-relaxed">{shortDescription || 'No description available.'}</p>
          </div>
          <div>
            <h4 className="text-lg font-semibold font-serif text-amber-700 mt-3 mb-2">Construction Costs:</h4>
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="text-xl">⚜️</span>
                <span className="text-amber-800">{formatNumberWithSpaces(constructionCosts?.ducats)} Ducats</span>
              </div>
              {constructionCosts && Object.entries(constructionCosts).map(([resource, amount]) => {
                if (resource !== 'ducats' && amount) {
                  return (
                    <div key={resource} className="flex items-center space-x-2">
                      <img 
                        src={getResourceImagePath(resource)} 
                        alt={resource} 
                        className="w-5 h-5 object-contain" 
                        onError={handleResourceImageError} 
                      />
                      <span className="capitalize text-amber-800">{resource.replace(/_/g, ' ')}: {amount}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
          <p className="mt-2"><strong className="text-amber-700">Maintenance Cost:</strong> {maintenanceCost ? `${formatNumberWithSpaces(maintenanceCost)} Ducats/cycle` : 'N/A'}</p>
          <p><strong className="text-amber-700">Can Import Resources:</strong> {canImport ? 'Yes' : 'No'}</p>
        </div>
        
        {/* Right Column: Production Info */}
        <div className="md:col-span-1 space-y-4">
          {productionInformation && (
            <div>
              <h4 className="text-lg font-semibold font-serif text-amber-700 mb-2">Production Information:</h4>
              <div className="space-y-3">
                {productionInformation.storageCapacity !== undefined && (
                  <p><strong className="text-amber-700">Storage Capacity:</strong> {productionInformation.storageCapacity} units</p>
                )}
                
                {renderResourceList(productionInformation.stores, "Stores")}
                {renderResourceList(productionInformation.sells, "Sells")}

                {productionInformation.Arti && productionInformation.Arti.length > 0 && (
                  <div>
                    <h5 className="text-md font-semibold text-amber-700 mt-3 mb-2">Recipes (Arti):</h5>
                    <div className="space-y-3">
                      {productionInformation.Arti.map((recipe, index) => (
                        <div key={index} className="p-3 border border-amber-200 rounded-lg bg-amber-50/70 shadow-sm">
                          <p className="font-medium text-amber-800 mb-1.5">Recipe {index + 1} (Craft Time: {recipe.craftMinutes} min)</p>
                          <div>
                            <strong className="text-amber-600 text-xs block mb-0.5">Inputs:</strong>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(recipe.inputs).map(([item, qty]) => (
                                <div key={item} className="flex items-center bg-red-100/70 px-1.5 py-0.5 rounded text-xs">
                                  <img src={getResourceImagePath(item)} alt={item} className="w-3.5 h-3.5 mr-1 object-contain" onError={handleResourceImageError} />
                                  <span>{qty} {item.replace(/_/g, ' ')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mt-1.5">
                            <strong className="text-amber-600 text-xs block mb-0.5">Outputs:</strong>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(recipe.outputs).map(([item, qty]) => (
                                <div key={item} className="flex items-center bg-green-100/70 px-1.5 py-0.5 rounded text-xs">
                                  <img src={getResourceImagePath(item)} alt={item} className="w-3.5 h-3.5 mr-1 object-contain" onError={handleResourceImageError} />
                                  <span>{qty} {item.replace(/_/g, ' ')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 pt-4 border-t border-amber-300 text-center">
        <button
          onClick={() => (BuildingCreationPanel as any).handleBuildClick(building)} // Accessing via panel instance
          className="px-6 py-2 bg-green-600 text-white text-lg rounded hover:bg-green-700 transition-colors"
        >
          Build {name} for ⚜️ {formatNumberWithSpaces(constructionCosts?.ducats)}
        </button>
      </div>
    </div>
  );
};

// Need to expose handleBackToGridClick and other methods if they are called from renderDetailedBuildingView
// This is a bit of a hack due to the functional component structure.
// A class component or a more structured state management (like context/redux) would handle this cleaner.
// For now, we'll assign them to the component function itself.
(BuildingCreationPanel as any).handleBackToGridClick = () => {
  // This will be set correctly inside the component's scope
};
(BuildingCreationPanel as any).getBuildingImagePath = (type: string) => `/images/buildings/${type.toLowerCase().replace(/[_-]/g, '_')}.png`; // Kept for building image
(BuildingCreationPanel as any).handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => { // Kept for building image
  const target = event.currentTarget;
  const currentSrc = target.src;
  const typeFormatted = target.alt.toLowerCase().replace(/[_-]/g, '_');
  if (currentSrc.endsWith('.png')) target.src = `/images/buildings/${typeFormatted}.jpg`;
  else if (currentSrc.endsWith('.jpg')) target.src = '/images/buildings/contract_stall.jpg';
  else target.src = '/images/buildings/contract_stall.jpg';
};
// getResourceImagePath and handleResourceImageError are now passed as arguments to renderDetailedBuildingView
// So they don't need to be attached to (BuildingCreationPanel as any) for that specific use case.
// However, if they were used elsewhere in BuildingCreationPanel directly, they would still be accessible.

(BuildingCreationPanel as any).handleBuildClick = (building: BuildingType) => {
  // This will be set correctly inside the component's scope
};


export default BuildingCreationPanel;
