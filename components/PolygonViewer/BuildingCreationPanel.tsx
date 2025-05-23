import React, { useState, useEffect, useMemo } from 'react';
import { fetchBuildingTypes } from '@/lib/utils/buildingTypeUtils';
import { FaTimes } from 'react-icons/fa';

interface BuildingType {
  type: string;
  name: string;
  tier: number;
  pointType: string | null; // Can be 'land', 'canal', 'bridge', or null (assume 'land')
  constructionCosts?: {
    ducats?: number;
    [resource: string]: number | undefined;
  };
  shortDescription?: string;
  category?: string;
  subcategory?: string;
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
};

const BuildingCreationPanel: React.FC<BuildingCreationPanelProps> = ({ selectedPoint, onClose, onBuild }) => {
  const [allBuildingTypes, setAllBuildingTypes] = useState<BuildingType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<number>(1);

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
      // Ensure pointType matches, or if building's pointType is 'land', it can be built on any type of point (as a fallback)
      return bt.pointType === selectedPoint.pointType || (bt.pointType === 'land' && selectedPoint.pointType !== null);
    });
  }, [allBuildingTypes, selectedPoint.pointType]);

  const buildingsByTier = useMemo(() => {
    const grouped: { [key: number]: BuildingType[] } = {};
    filteredBuildingTypes.forEach(bt => {
      if (!grouped[bt.tier]) {
        grouped[bt.tier] = [];
      }
      grouped[bt.tier].push(bt);
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
  
  const handleBuildClick = (building: BuildingType) => {
    const cost = building.constructionCosts?.ducats || 0;
    // Pass the full selectedPoint object which includes lat, lng, polygonId, and pointType
    onBuild(building.type, selectedPoint, cost); 
  };

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
      <div className="bg-amber-50 text-amber-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border-2 border-amber-700">
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

        <div className="overflow-y-auto p-4 flex-grow">
          {availableTiers.length > 0 && buildingsByTier[activeTier] ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                    <p className="text-xs text-amber-700 mb-2 line-clamp-2">{building.shortDescription || 'No description available.'}</p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-sm font-medium text-amber-900 mb-2">
                      Cost: {building.constructionCosts?.ducats ?? 'N/A'} Ducats
                    </p>
                    <button
                      onClick={() => handleBuildClick(building)}
                      className="w-full px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                    >
                      Build
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : availableTiers.length > 0 ? (
             <p className="text-center text-amber-700 py-8">Select a tier to view available buildings.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BuildingCreationPanel;
````

Maintenant, modifions `components/PolygonViewer/IsometricViewer.tsx`.

````typescript
components/PolygonViewer/IsometricViewer.tsx
<<<<<<< SEARCH
import ProblemDetailsPanel from '../UI/ProblemDetailsPanel';
import { renderService } from '@/lib/services/RenderService';
import React, { useState, useEffect, useMemo } from 'react';
import { fetchBuildingTypes } from '@/lib/utils/buildingTypeUtils';
import { FaTimes } from 'react-icons/fa';

interface BuildingType {
  type: string;
  name: string;
  tier: number;
  pointType: string | null; // Can be 'land', 'canal', 'bridge', or null (assume 'land')
  constructionCosts?: {
    ducats?: number;
    [resource: string]: number | undefined;
  };
  shortDescription?: string;
  category?: string;
  subcategory?: string;
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
};

const BuildingCreationPanel: React.FC<BuildingCreationPanelProps> = ({ selectedPoint, onClose, onBuild }) => {
  const [allBuildingTypes, setAllBuildingTypes] = useState<BuildingType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<number>(1);

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
      // Ensure pointType matches, or if building's pointType is 'land', it can be built on any type of point (as a fallback)
      return bt.pointType === selectedPoint.pointType || (bt.pointType === 'land' && selectedPoint.pointType !== null);
    });
  }, [allBuildingTypes, selectedPoint.pointType]);

  const buildingsByTier = useMemo(() => {
    const grouped: { [key: number]: BuildingType[] } = {};
    filteredBuildingTypes.forEach(bt => {
      if (!grouped[bt.tier]) {
        grouped[bt.tier] = [];
      }
      grouped[bt.tier].push(bt);
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
  
  const handleBuildClick = (building: BuildingType) => {
    const cost = building.constructionCosts?.ducats || 0;
    // Pass the full selectedPoint object which includes lat, lng, polygonId, and pointType
    onBuild(building.type, selectedPoint, cost); 
  };

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4">
      <div className="bg-amber-50 text-amber-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border-2 border-amber-700">
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

        <div className="overflow-y-auto p-4 flex-grow">
          {availableTiers.length > 0 && buildingsByTier[activeTier] ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                    <p className="text-xs text-amber-700 mb-2 line-clamp-2">{building.shortDescription || 'No description available.'}</p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-sm font-medium text-amber-900 mb-2">
                      Cost: {building.constructionCosts?.ducats ?? 'N/A'} Ducats
                    </p>
                    <button
                      onClick={() => handleBuildClick(building)}
                      className="w-full px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                    >
                      Build
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : availableTiers.length > 0 ? (
             <p className="text-center text-amber-700 py-8">Select a tier to view available buildings.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BuildingCreationPanel;
