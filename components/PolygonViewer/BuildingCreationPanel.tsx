import React, { useState, useEffect, useMemo } from 'react';
import { fetchBuildingTypes } from '@/lib/utils/buildingTypeUtils';
import { FaTimes } from 'react-icons/fa';
import { eventBus, EventTypes } from '@/lib/utils/eventBus'; // Added import

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
  subCategory?: string;
  productionInformation?: ProductionInfo;
  canImport?: boolean;
  size?: number; // Ajout de la taille du bâtiment
  constructionMinutes?: number; // Ajout des minutes de construction
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
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null); // For Ducats and SocialClass
  const [publicConstructionContracts, setPublicConstructionContracts] = useState<any[]>([]);
  const [isLoadingBuilders, setIsLoadingBuilders] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchProfileAndTypes = async () => {
      // Fetch current user profile
      if (typeof window !== 'undefined') {
        const profileStr = localStorage.getItem('citizenProfile');
        if (profileStr) {
          try {
            let profile = JSON.parse(profileStr);
            if (!isMounted) return;
            
            // Set initial profile, even if potentially incomplete
            setCurrentUserProfile(profile); 

            // If socialClass is missing, and we have a username, try to refresh the profile
            if (profile.username && profile.socialClass === undefined) {
              try {
                const res = await fetch(`/api/citizens/${profile.username}`);
                if (!isMounted) return; 
                
                if (res.ok) {
                  const apiData = await res.json();
                  if (!isMounted) return;

                  if (apiData.success && apiData.citizen) {
                    setCurrentUserProfile(apiData.citizen); // Update state with refreshed profile
                    localStorage.setItem('citizenProfile', JSON.stringify(apiData.citizen)); // Update localStorage
                    profile = apiData.citizen; // Update local 'profile' variable for subsequent logs
                  } else {
                    // console.error(`[BuildingCreationPanel] Failed to refresh profile for ${profile.username}:`, apiData.error);
                  }
                } else {
                  // console.error(`[BuildingCreationPanel] API error during profile refresh for ${profile.username}: ${res.status}`);
                }
              } catch (err) {
                if (!isMounted) return;
                // console.error(`[BuildingCreationPanel] Network error during profile refresh for ${profile.username}:`, err);
              }
            }
          } catch (e) {
            if (!isMounted) return;
            console.error("Failed to parse user profile:", e);
            setError("Could not load your profile. Please try again.");
          }
        } else {
          if (!isMounted) return;
          setError("User profile not found. Please log in.");
        }
      }

      // Load building types
      setLoading(true); // For building types
      setError(null);
      try {
        const types = await fetchBuildingTypes();
        if (!isMounted) return;

        const processedTypes = types.map(bt => ({
          ...bt,
          constructionCosts: {
            ...bt.constructionCosts,
            ducats: Number(bt.constructionCosts?.ducats) || 0,
          },
          pointType: bt.pointType || 'land', // Default to 'land' if null
          size: bt.size || bt.Size // Ensure 'size' is camelCase, checking for PascalCase 'Size' as fallback
        }));
        setAllBuildingTypes(processedTypes);
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to fetch building types:', err);
        setError('Failed to load building types. Please try again.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfileAndTypes();

    return () => {
      isMounted = false;
    };
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

  useEffect(() => {
    const fetchPublicConstructionContracts = async () => {
      if (!detailedBuildingType) {
        setPublicConstructionContracts([]);
        return;
      }
      setIsLoadingBuilders(true);
      try {
        const response = await fetch(`/api/get-public-builders`); // Use the new endpoint
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.builders) { // Expect 'builders' array now
            setPublicConstructionContracts(data.builders);
          } else {
            setPublicConstructionContracts([]);
            console.error("Failed to fetch public builders:", data.error);
          }
        } else {
          setPublicConstructionContracts([]);
          console.error("Error fetching public builders:", response.statusText);
        }
      } catch (error) {
        setPublicConstructionContracts([]);
        console.error("Error fetching public builders:", error);
      } finally {
        setIsLoadingBuilders(false);
      }
    };

    fetchPublicConstructionContracts();
  }, [detailedBuildingType]);


  const getBuildingImagePath = (type: string): string => {
    const typeFormatted = type.toLowerCase().replace(/[_-]/g, '_');
    // Prioritize .png, then .jpg
    // For now, let's assume a common pattern. This might need adjustment based on actual image availability.
    return `https://backend.serenissima.ai/public_assets/images/buildings/${typeFormatted}.png`; 
  };

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = event.currentTarget;
    const currentSrc = target.src;
    const typeFormatted = target.alt.toLowerCase().replace(/[_-]/g, '_'); // Assuming alt is building type

    if (currentSrc.endsWith('.png')) {
      target.src = `https://backend.serenissima.ai/public_assets/images/buildings/${typeFormatted}.jpg`;
    } else if (currentSrc.endsWith('.jpg')) {
      target.src = 'https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png'; // Final fallback
    } else {
      // If it wasn't .png or .jpg (e.g. already fallback), prevent infinite loop
      target.src = 'https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png';
    }
  };

  const getResourceImagePath = (resourceName: string): string => {
    if (!resourceName) return 'https://backend.serenissima.ai/public_assets/images/resources/default.png';
    const formattedName = resourceName.toLowerCase().replace(/\s+/g, '_');
    return `https://backend.serenissima.ai/public_assets/images/resources/${formattedName}.png`;
  };

  const handleResourceImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = event.currentTarget;
    // Basic fallback, can be expanded if multiple resource image types (jpg, etc.)
    target.src = 'https://backend.serenissima.ai/public_assets/images/resources/default.png'; 
  };

  // This function will handle building when a contractor is chosen
  const handleBuildWithContractorClick = async (building: BuildingType, contractorContract: any) => {
    if (!currentUserProfile) {
      alert("User profile not loaded. Cannot proceed with construction.");
      return;
    }

    const baseCost = building.constructionCosts?.ducats || 0;
    const contractorRate = contractorContract.pricePerResource || contractorContract.price || 1.0;
    const totalConstructionCost = baseCost * contractorRate;
    const userDucats = currentUserProfile.ducats ?? 0;

    // 1. Verification: Money Check
    if (userDucats < totalConstructionCost) {
      alert(`Not enough Ducats. You need ${formatNumberWithSpaces(totalConstructionCost)}, but you have ${formatNumberWithSpaces(userDucats)}.`);
      return;
    }

    // 2. Verification: Point Type Check (already done partially by filtering, but good to double check)
    const buildingPointType = building.pointType || 'land';
    const selectedPointType = selectedPoint.pointType;
    let isCompatiblePointType = false;
    if (selectedPointType === 'land') {
      isCompatiblePointType = buildingPointType === 'land' || buildingPointType === 'building';
    } else {
      isCompatiblePointType = buildingPointType === selectedPointType || buildingPointType === 'land';
    }
    if (!isCompatiblePointType) {
      alert(`This building type (${building.name} - requires ${buildingPointType}) cannot be built on a ${selectedPointType} point.`);
      return;
    }

    // 3. Verification: Tier Check
    const socialClassToTier = (socialClass: string | undefined | null): number => {
      const lowerSocialClass = socialClass?.toLowerCase();
      if (lowerSocialClass === 'consigliodeidieci') return 5;
      if (lowerSocialClass === 'nobili') return TIER_NAMES[4] ? 4 : 5;
      if (lowerSocialClass === 'cittadini') return 3;
      if (lowerSocialClass === 'popolani') return 2;
      if (lowerSocialClass === 'facchini') return 1;
      return 0;
    };
    const citizenTier = socialClassToTier(currentUserProfile.socialClass);
    if (citizenTier < building.buildTier) {
      alert(`Your social standing (Tier ${citizenTier}) is not high enough to construct this building (Requires Tier ${building.buildTier}).`);
      return;
    }

    // All client-side checks passed, proceed to call the API
    setLoading(true);
    try {
      const response = await fetch('/api/actions/construct-building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingTypeDefinition: building,
          pointDetails: selectedPoint,
          citizenUsername: currentUserProfile.username,
          builderContractDetails: { // Pass builder details
            sellerUsername: contractorContract.seller,
            sellerBuildingId: contractorContract.sellerBuilding, // Assuming this is the builder's workshop ID
            rate: contractorRate,
            publicContractId: contractorContract.contractId || contractorContract.id
          }
        }),
      });

      const result = await response.json();
      setLoading(false);

      if (response.ok && result.success) {
        alert(`Construction of ${building.name} with ${contractorContract.seller} started successfully! It will appear shortly.`);
        // Call original onBuild for UI updates/closing panel, pass total cost
        onBuild(building.type, selectedPoint, totalConstructionCost); 
        const updatedDucats = (currentUserProfile.ducats ?? 0) - totalConstructionCost;
        window.dispatchEvent(new CustomEvent('citizenProfileUpdated', { detail: { ...currentUserProfile, ducats: updatedDucats } }));
        eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
      } else {
        alert(`Failed to start construction: ${result.error || 'Unknown server error'}`);
      }
    } catch (apiError) {
      setLoading(false);
      console.error("API error during construction with contractor:", apiError);
      alert("An error occurred while trying to start construction. Please check the console and try again.");
    }
  };
  
  // The old handleBuildClick is removed as direct building is no longer the primary UI path.
  // If direct building without a contractor is still desired, it would need a separate UI element and logic.
  // For now, we assume all construction goes through a "Build with <Builder>" button.

  const handleBuilderProfileClick = (citizenProfile: any) => {
    if (citizenProfile) {
      console.log("Requesting to show citizen panel for builder:", citizenProfile);
      eventBus.emit('showCitizenPanelEvent', citizenProfile);
    } else {
      console.warn("handleBuilderProfileClick called with no citizenProfile");
    }
  };

  // Expose methods for the detailed view renderer
  // This is a workaround. Ideally, renderDetailedBuildingView would be a child component.
  (BuildingCreationPanel as any).handleBackToGridClick = () => setDetailedBuildingType(null);
  (BuildingCreationPanel as any).getBuildingImagePath = getBuildingImagePath; // For building images
  (BuildingCreationPanel as any).handleImageError = handleImageError; // For building images
  (BuildingCreationPanel as any).getResourceImagePath = getResourceImagePath; // For resource images
  (BuildingCreationPanel as any).handleResourceImageError = handleResourceImageError; // For resource images
  (BuildingCreationPanel as any).handleBuildWithContractorClick = handleBuildWithContractorClick; // New build with contractor
  (BuildingCreationPanel as any).handleBuilderProfileClick = handleBuilderProfileClick; // Expose new handler
  // Expose new state for builders to the renderDetailedBuildingView function
  (BuildingCreationPanel as any).publicConstructionContracts = publicConstructionContracts;
  (BuildingCreationPanel as any).isLoadingBuilders = isLoadingBuilders;


  if (loading && !currentUserProfile) { // Ensure profile is loaded too before hiding main loader
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-amber-50 p-8 rounded-lg shadow-xl text-amber-800">
          Fetching building options...
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 p-4"> {/* Changed background opacity */}
      <div className="bg-amber-50 text-amber-900 rounded-lg shadow-2xl w-full max-w-[90vw] max-h-[95vh] flex flex-col border-2 border-amber-700"> {/* Increased size */}
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

        <div className={detailedBuildingType ? "flex-grow" : "overflow-y-auto p-6 flex-grow"}>
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
                        <p className="text-xs text-amber-600 mb-1 capitalize">{building.category} - {building.subCategory}</p>
                        <p className="text-xs text-amber-700 mb-2 line-clamp-3">{building.shortDescription || 'No description available.'}</p>
                      </div>
                      <div className="mt-auto pt-2">
                        <p className="text-sm font-medium text-amber-900 mb-2">
                          Base Cost: ⚜️ {formatNumberWithSpaces(building.constructionCosts?.ducats)}
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
    type, name, category, subCategory, buildTier, pointType, 
    constructionCosts, maintenanceCost, shortDescription, 
    productionInformation, canImport 
  } = building;

  // Note: The `onBuild` prop is available in the outer BuildingCreationPanel's scope.
  // We'll call it via (BuildingCreationPanel as any).handleBuildClick(building) as before.
  // Or now, (BuildingCreationPanel as any).handleBuildWithContractorClick(building, contract)

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
    // Make this root div a flex column that tries to take full height
    <div className="bg-amber-50 p-6 rounded-lg shadow-inner text-sm flex flex-col h-full">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-amber-300 flex-shrink-0">
        <h3 className="text-3xl font-serif text-amber-800">{name}</h3>
        <button 
          onClick={() => (BuildingCreationPanel as any).handleBackToGridClick()}
          className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors text-sm"
        >
          Back to List
        </button>
      </div>

      {/* Make the grid container grow and handle overflow for its children */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left Column: Image & Basic Info - Changed to flex column for height management */}
        <div className="md:col-span-1 flex flex-col space-y-3 overflow-hidden"> 
          {/* Container for non-growing items (image and basic info) */}
          <div>
            <img
              src={(BuildingCreationPanel as any).getBuildingImagePath(type)}
            alt={name}
            onError={(e) => (BuildingCreationPanel as any).handleImageError(e)}
            className="w-full h-auto aspect-video object-cover rounded-lg border-2 border-amber-300 shadow-md mb-3"
          />
          <p><strong className="text-amber-700">Type:</strong> <span className="font-mono text-xs bg-amber-200/60 px-1 py-0.5 rounded">{type}</span></p>
          <p><strong className="text-amber-700">Category:</strong> {category} - {subCategory}</p>
          <p><strong className="text-amber-700">Tier:</strong> {TIER_NAMES[buildTier] || `Tier ${buildTier}`}</p>
          <p><strong className="text-amber-700">Point Type:</strong> {pointType || 'N/A'}</p>
          </div> {/* End of non-growing items container */}

          {/* Builders Section - Moved to the first column, now flex-grow */}
          <div className="mt-4 flex-grow flex flex-col min-h-0"> {/* Added flex-grow, flex-col, min-h-0 */}
            <h4 className="text-lg font-semibold font-serif text-amber-700 mb-2 flex-shrink-0">Construction Services:</h4> {/* flex-shrink-0 for title */}
            {(BuildingCreationPanel as any).isLoadingBuilders ? (
              <p className="text-amber-600 italic flex-shrink-0">Loading available builders...</p> // flex-shrink-0 for loading message
            ) : (BuildingCreationPanel as any).publicConstructionContracts.length > 0 ? (
              // This div will now grow and scroll its content
              <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 space-y-3"> 
                {(BuildingCreationPanel as any).publicConstructionContracts
                  .filter((builderContract: any) => (builderContract.resourceType || builderContract.ResourceType)?.toLowerCase() === 'construction_service') // Still filter for construction_service
                  .map((builderContract: any) => ( // Renamed to builderContract for clarity
                  <div key={builderContract.id || builderContract.contractId} className="p-3 border border-amber-200 rounded-lg bg-amber-50/70 shadow-sm">
                    <button
                      type="button"
                      onClick={() => (BuildingCreationPanel as any).handleBuilderProfileClick(builderContract.sellerDetails)}
                      className="flex items-center mb-2 text-left hover:bg-amber-200/30 p-1 -m-1 rounded-md transition-colors w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                      aria-label={`View profile of builder ${builderContract.sellerDetails?.firstName && builderContract.sellerDetails?.lastName ? `${builderContract.sellerDetails.firstName} ${builderContract.sellerDetails.lastName}` : builderContract.seller}`}
                    >
                      {builderContract.sellerDetails?.coatOfArmsImageUrl && (
                        <img 
                          src={builderContract.sellerDetails.coatOfArmsImageUrl} 
                          alt={`${builderContract.sellerDetails.username || builderContract.seller}'s Coat of Arms`} 
                          className="w-10 h-10 rounded-full mr-3 border border-amber-300 object-cover" // Added object-cover
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div>
                        <p className="font-medium text-amber-800">
                          Builder: {builderContract.sellerDetails?.firstName && builderContract.sellerDetails?.lastName 
                            ? `${builderContract.sellerDetails.firstName} ${builderContract.sellerDetails.lastName}` 
                            : builderContract.seller}
                        </p>
                        {builderContract.sellerDetails?.socialClass && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            builderContract.sellerDetails.socialClass === 'Nobili' ? 'bg-red-100 text-red-700' :
                            builderContract.sellerDetails.socialClass === 'Cittadini' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {builderContract.sellerDetails.socialClass}
                          </span>
                        )}
                      </div>
                    </button>

                    <p className="text-md font-semibold text-amber-700 mt-1">
                      {builderContract.title || `Service: Build ${name}`}
                    </p>
                    <div className="flex items-center my-2">
                      <span className="text-sm text-amber-900 mr-2">Rate Multiplier:</span>
                      <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded-md text-sm font-semibold">
                        x{(builderContract.pricePerResource || builderContract.price || 1.0).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-amber-900 mt-1">
                      Total Cost: ⚜️ {formatNumberWithSpaces((building.constructionCosts?.ducats || 0) * (builderContract.pricePerResource || builderContract.price || 1.0))}
                    </p>
                    {(builderContract.description || builderContract.notes) && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-amber-700">Details:</p>
                        <p className="text-xs italic text-gray-600">{builderContract.description || builderContract.notes}</p>
                      </div>
                    )}
                    <button
                      onClick={() => (BuildingCreationPanel as any).handleBuildWithContractorClick(building, builderContract)}
                      className="mt-3 w-full px-4 py-2 bg-green-600 text-white text-lg rounded hover:bg-green-700 transition-colors"
                    >
                      Build with {builderContract.seller}
                    </button>
                  </div>
                ))}
                {/* Message if no builders for this specific type after filtering */}
                {(BuildingCreationPanel as any).publicConstructionContracts.filter((builderContract: any) => (builderContract.resourceType || builderContract.ResourceType)?.toLowerCase() === 'construction_service').length === 0 && (
                  <p className="text-amber-600 italic">No public construction services currently available.</p>
                )}
              </div>
            ) : (
              <p className="text-amber-600 italic">No public construction services currently available.</p>
            )}
          </div>
        </div>

        {/* Middle Column: Costs & Description */}
        <div className="md:col-span-1 space-y-4 overflow-y-auto"> {/* Allow individual column scroll if needed */}
          <div>
            <h4 className="text-lg font-semibold font-serif text-amber-700 mb-2">Description:</h4>
            <p className="text-amber-800 leading-relaxed">{shortDescription || 'No description available.'}</p>
          </div>
          <div>
            <h4 className="text-lg font-semibold font-serif text-amber-700 mt-3 mb-2">Base Construction Costs:</h4>
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
        
        {/* Right Column: Production Info & Builders - Make this column scrollable */}
        <div className="md:col-span-1 space-y-4 overflow-y-auto">
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
      
      {/* Build button section - flex-shrink-0 to prevent it from shrinking */}
      {/* The main build button is removed as per request. Construction is now initiated via "Build with <Builder>" */}
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
(BuildingCreationPanel as any).getBuildingImagePath = (type: string) => `https://backend.serenissima.ai/public_assets/images/buildings/${type.toLowerCase().replace(/[_-]/g, '_')}.png`; // Kept for building image
(BuildingCreationPanel as any).handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => { // Kept for building image
  const target = event.currentTarget;
  const currentSrc = target.src;
  const typeFormatted = target.alt.toLowerCase().replace(/[_-]/g, '_');
  if (currentSrc.endsWith('.png')) target.src = `https://backend.serenissima.ai/public_assets/images/buildings/${typeFormatted}.jpg`;
  else if (currentSrc.endsWith('.jpg')) target.src = 'https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png';
  else target.src = 'https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png';
};
// getResourceImagePath and handleResourceImageError are now passed as arguments to renderDetailedBuildingView
// So they don't need to be attached to (BuildingCreationPanel as any) for that specific use case.
// However, if they were used elsewhere in BuildingCreationPanel directly, they would still be accessible.

// (BuildingCreationPanel as any).handleBuildClick = (building: BuildingType) => { // Old direct build removed
// This will be set correctly inside the component's scope
// };
(BuildingCreationPanel as any).handleBuildWithContractorClick = (building: BuildingType, contractorContract: any) => {
  // This will be set correctly inside the component's scope
};


export default BuildingCreationPanel;


// Need to expose handleBackToGridClick and other methods if they are called from renderDetailedBuildingView
// This is a bit of a hack due to the functional component structure.
// A class component or a more structured state management (like context/redux) would handle this cleaner.
// For now, we'll assign them to the component function itself.
(BuildingCreationPanel as any).handleBackToGridClick = () => {
  // This will be set correctly inside the component's scope
};
(BuildingCreationPanel as any).getBuildingImagePath = (type: string) => `https://backend.serenissima.ai/public_assets/images/buildings/${type.toLowerCase().replace(/[_-]/g, '_')}.png`; // Kept for building image
(BuildingCreationPanel as any).handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => { // Kept for building image
  const target = event.currentTarget;
  const currentSrc = target.src;
  const typeFormatted = target.alt.toLowerCase().replace(/[_-]/g, '_');
  if (currentSrc.endsWith('.png')) target.src = `https://backend.serenissima.ai/public_assets/images/buildings/${typeFormatted}.jpg`;
  else if (currentSrc.endsWith('.jpg')) target.src = 'https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png';
  else target.src = 'https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png';
};
// getResourceImagePath and handleResourceImageError are now passed as arguments to renderDetailedBuildingView
// So they don't need to be attached to (BuildingCreationPanel as any) for that specific use case.
// However, if they were used elsewhere in BuildingCreationPanel directly, they would still be accessible.

(BuildingCreationPanel as any).handleBuildClick = (building: BuildingType) => {
  // This will be set correctly inside the component's scope
};
