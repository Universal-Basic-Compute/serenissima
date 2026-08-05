import React, { useState, useImperativeHandle, forwardRef, useRef, useMemo } from 'react';
import { StratagemSpecificPanelProps, StratagemSpecificPanelRef, CitizenOption, ResourceTypeOption, BuildingOption } from './types';
import { FaUserShield, FaBuilding, FaBoxOpen, FaTimes, FaLongArrowAltRight } from 'react-icons/fa'; // Changé FaInfoCircle en FaLongArrowAltRight

const CoordinatePricingStratagemPanel = forwardRef<StratagemSpecificPanelRef, StratagemSpecificPanelProps>((props, ref) => {
  const { stratagemData, citizens, buildings, resourceTypes, isLoading, currentUserUsername, currentUserFirstName, currentUserLastName } = props;

  // States for Target Citizen
  const [targetCitizen, setTargetCitizen] = useState<string | null>(null);
  const [citizenSearch, setCitizenSearch] = useState('');
  const [isCitizenDropdownOpen, setIsCitizenDropdownOpen] = useState(false);
  const citizenInputRef = useRef<HTMLInputElement>(null);

  // States for Target Building
  const [targetBuilding, setTargetBuilding] = useState<string | null>(null);
  const [buildingSearch, setBuildingSearch] = useState('');
  const [isBuildingDropdownOpen, setIsBuildingDropdownOpen] = useState(false);
  const buildingInputRef = useRef<HTMLInputElement>(null);

  // States for Target Resource Type (now optional)
  const [targetResourceType, setTargetResourceType] = useState<string | null>(null);
  const [resourceTypeSearch, setResourceTypeSearch] = useState('');
  const [isResourceTypeDropdownOpen, setIsResourceTypeDropdownOpen] = useState(false);
  const resourceTypeInputRef = useRef<HTMLInputElement>(null);
  
  // Ce stratagème n'a pas de variantes affectant le coût de base de l'influence via le panneau. // Removed
  // const calculatedInfluenceCost = stratagemData.influenceCostBase; // Removed

  const summaryElements = useMemo(() => {
    const executorName = (currentUserFirstName && currentUserLastName)
      ? `${currentUserFirstName} ${currentUserLastName}`
      : currentUserUsername || "You";

    let resourceDisplayElement: JSX.Element | string = "all their sellable resources";
    if (targetResourceType) {
      const resource = resourceTypes.find(rt => rt.id === targetResourceType);
      const resourceName = resource?.name || targetResourceType;
      const resourceImageUrl = resource ? `/public_assets/images/resources/${resource.id}.png` : null;
      resourceDisplayElement = (
        <>
          {resourceImageUrl && (
            <img src={resourceImageUrl} alt={resourceName} className="inline-block w-4 h-4 mx-1 object-contain" />
          )}
          <span className="font-bold">{resourceName}</span>
        </>
      );
    } else {
      resourceDisplayElement = <span className="font-bold">all their sellable resources</span>;
    }
    
    let targetDescriptionElements: JSX.Element | string;

    if (targetCitizen) {
      const citizen = citizens.find(c => c.username === targetCitizen);
      const citizenDisplayName = (citizen?.firstName && citizen?.lastName)
        ? `${citizen.firstName} ${citizen.lastName}`
        : citizen?.username || targetCitizen;

      const citizenOwnedBuildings = buildings.filter(b => b.owner === targetCitizen);

      if (citizenOwnedBuildings.length === 0) {
        // Le citoyen cible est sélectionné, mais ne possède aucun bâtiment dans la liste fournie.
        // Le processeur essaiera toujours de se coordonner avec les ventes directes de ce citoyen.
        targetDescriptionElements = (
          <>
            the prices of <span className="font-bold">{citizenDisplayName}</span>. 
            Note: this citizen does not appear to own any listed business buildings.
          </>
        );
      } else {
        // Le citoyen cible est sélectionné et possède des bâtiments.
        targetDescriptionElements = (
          <>
            the prices of <span className="font-bold">{citizenDisplayName}</span>.
          </>
        );
      }
    } else if (targetBuilding) { // targetCitizen n'est PAS sélectionné, mais targetBuilding l'EST
      const building = buildings.find(b => b.buildingId === targetBuilding);
      const buildingDisplayName = building?.name || targetBuilding;
      targetDescriptionElements = (
        <>
          the prices of building <span className="font-bold">{buildingDisplayName}</span>.
        </>
      );
    } else { // Ni targetCitizen ni targetBuilding ne sont sélectionnés
      targetDescriptionElements = `the general market average.`;
    }

    return (
      <>
        <span className="font-bold">{executorName}</span> will coordinate their prices for {resourceDisplayElement} to match {targetDescriptionElements}
      </>
    );
  }, [targetResourceType, targetCitizen, targetBuilding, currentUserUsername, currentUserFirstName, currentUserLastName, resourceTypes, citizens, buildings]);

  useImperativeHandle(ref, () => ({
    getStratagemDetails: () => {
      // TargetResourceType is now optional. If not selected, it won't be included in details.
      const details: Record<string, any> = {};
      if (targetResourceType) {
        details.targetResourceType = targetResourceType;
      }
      if (targetCitizen) {
        details.targetCitizen = targetCitizen;
      }
      if (targetBuilding) {
        details.targetBuilding = targetBuilding;
      }
      // durationHours, name, description, notes sont gérés avec des valeurs par défaut par le créateur pour l'instant.
      return details;
    },
    // getCalculatedInfluenceCost: () => { // Removed
    //   return calculatedInfluenceCost; // Removed
    // } // Removed
  }));

  return (
    <div>
      {/* Target Citizen (Optional) */}
      <div className="mb-4">
        <label htmlFor="coordinate_targetCitizen_search" className="block text-sm font-medium text-amber-800 mb-1 flex items-center">
          <FaUserShield className="mr-2" /> Target Reference Citizen (Optional)
        </label>
        <p className="text-xs text-amber-600 mb-1">If neither citizen nor building is selected, prices will coordinate with the general market average.</p>
        <div className="relative">
          <input
            id="coordinate_targetCitizen_search"
            type="text"
            ref={citizenInputRef}
            value={citizenSearch}
            onChange={(e) => {
              setCitizenSearch(e.target.value);
              if (!isCitizenDropdownOpen) setIsCitizenDropdownOpen(true);
              if (targetCitizen) setTargetCitizen(null);
            }}
            onFocus={() => setIsCitizenDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsCitizenDropdownOpen(false), 150)}
            placeholder={targetCitizen ? citizens.find(c => c.username === targetCitizen)?.username || 'Search...' : 'Search Citizens...'}
            className="w-full p-2 border border-amber-300 rounded-md bg-white text-amber-900 focus:ring-amber-500 focus:border-amber-500"
            disabled={isLoading}
          />
          {targetCitizen && (
            <button
              type="button"
              onClick={() => {
                setTargetCitizen(null);
                setCitizenSearch('');
                citizenInputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              aria-label="Clear selection"
            >
              <FaTimes />
            </button>
          )}
          {isCitizenDropdownOpen && (
            <ul className="absolute z-10 w-full bg-white border border-amber-300 rounded-md mt-1 shadow-lg max-h-60 overflow-y-auto">
              {citizens
                .filter(c => c.username !== currentUserUsername)
                .filter(c => {
                  const searchTermLower = citizenSearch.toLowerCase();
                  const namePart = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase();
                  return (c.username && c.username.toLowerCase().includes(searchTermLower)) ||
                         namePart.includes(searchTermLower) ||
                         (c.socialClass && c.socialClass.toLowerCase().includes(searchTermLower));
                })
                .map((c, index) => {
                  const namePart = [c.firstName, c.lastName].filter(Boolean).join(' ');
                  const citizenMainIdentifier = namePart ? `${namePart} (${c.username || 'ID Manquant'})` : (c.username || '');
                  const socialClassDisplay = c.socialClass || 'N/A';
                  const finalDisplayString = citizenMainIdentifier ? `${citizenMainIdentifier} - ${socialClassDisplay}` : `[Citoyen Inconnu] - ${socialClassDisplay}`;
                  return (
                    <li
                      key={`coordinate-citizen-opt-${c.username || index}`}
                      onClick={() => {
                        setTargetCitizen(c.username || null);
                        setCitizenSearch(finalDisplayString);
                        setIsCitizenDropdownOpen(false);
                      }}
                      className="p-2 hover:bg-amber-100 cursor-pointer text-amber-800"
                    >
                      {finalDisplayString}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
      
      {/* Target Building (Optional) */}
      <div className="mb-4">
        <label htmlFor="coordinate_targetBuilding_search" className="block text-sm font-medium text-amber-800 mb-1 flex items-center">
          <FaBuilding className="mr-2" /> Target Reference Building (Optional)
        </label>
        <div className="relative">
          <input
            id="coordinate_targetBuilding_search"
            type="text"
            ref={buildingInputRef}
            value={buildingSearch}
            onChange={(e) => {
              setBuildingSearch(e.target.value);
              if (!isBuildingDropdownOpen) setIsBuildingDropdownOpen(true);
              if (targetBuilding) setTargetBuilding(null);
            }}
            onFocus={() => setIsBuildingDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsBuildingDropdownOpen(false), 150)}
            placeholder={targetBuilding ? buildings.find(b => b.buildingId === targetBuilding)?.name || 'Search...' : 'Search Buildings...'}
            className="w-full p-2 border border-amber-300 rounded-md bg-white text-amber-900 focus:ring-amber-500 focus:border-amber-500"
            disabled={isLoading}
          />
          {targetBuilding && (
            <button
              type="button"
              onClick={() => {
                setTargetBuilding(null);
                setBuildingSearch('');
                buildingInputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              aria-label="Clear selection"
            >
              <FaTimes />
            </button>
          )}
          {isBuildingDropdownOpen && (
            <ul className="absolute z-10 w-full bg-white border border-amber-300 rounded-md mt-1 shadow-lg max-h-60 overflow-y-auto">
              {buildings
                // .filter(b => !currentUserUsername || (b.owner !== currentUserUsername)) // Pour la coordination, on peut vouloir cibler n'importe quel bâtiment
                .filter(b => !targetCitizen || (b.owner === targetCitizen)) // Filtrer par citoyen cible si sélectionné
                .filter(b => {
                  const searchTermLower = buildingSearch.toLowerCase();
                  return (b.name && b.name.toLowerCase().includes(searchTermLower)) ||
                         (b.buildingId && b.buildingId.toLowerCase().includes(searchTermLower)) ||
                         (b.type && b.type.toLowerCase().includes(searchTermLower)) ||
                         (b.owner && b.owner.toLowerCase().includes(searchTermLower));
                })
                .map(b => (
                  <li
                    key={`coordinate-building-opt-${b.buildingId}`}
                    onClick={() => {
                      setTargetBuilding(b.buildingId);
                      setBuildingSearch(b.name || b.buildingId);
                      setIsBuildingDropdownOpen(false);
                    }}
                    className="p-2 hover:bg-amber-100 cursor-pointer text-amber-800"
                  >
                    {b.name || b.buildingId} (Owner: {b.owner || 'N/A'})
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Target Resource Type (Optional) - Moved here */}
      <div className="mb-4">
        <label htmlFor="coordinate_targetResourceType_search" className="block text-sm font-medium text-amber-800 mb-1 flex items-center">
          <FaBoxOpen className="mr-2" /> Target Resource Type (Optional)
        </label>
        <p className="text-xs text-amber-600 mb-1">If no resource type is selected, coordination will apply to all sellable resources.</p>
        <div className="relative">
          <input
            id="coordinate_targetResourceType_search"
            type="text"
            ref={resourceTypeInputRef}
            value={resourceTypeSearch}
            onChange={(e) => {
              setResourceTypeSearch(e.target.value);
              if (!isResourceTypeDropdownOpen) setIsResourceTypeDropdownOpen(true);
              if (targetResourceType) setTargetResourceType(null);
            }}
            onFocus={() => setIsResourceTypeDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsResourceTypeDropdownOpen(false), 150)}
            placeholder={targetResourceType ? resourceTypes.find(rt => rt.id === targetResourceType)?.name || 'Search...' : 'Search Resource Types (or leave blank for all)...'}
            className="w-full p-2 border border-amber-300 rounded-md bg-white text-amber-900 focus:ring-amber-500 focus:border-amber-500"
            disabled={isLoading}
          />
          {targetResourceType && (
            <button
              type="button"
              onClick={() => {
                setTargetResourceType(null);
                setResourceTypeSearch('');
                resourceTypeInputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              aria-label="Clear selection"
            >
              <FaTimes />
            </button>
          )}
          {isResourceTypeDropdownOpen && (
            <ul className="absolute z-10 w-full bg-white border border-amber-300 rounded-md mt-1 shadow-lg max-h-60 overflow-y-auto">
              {resourceTypes
                .filter(rt => rt.name.toLowerCase().includes(resourceTypeSearch.toLowerCase()) || (rt.category && rt.category.toLowerCase().includes(resourceTypeSearch.toLowerCase())))
                .map(rt => (
                  <li
                    key={`coordinate-resource-opt-${rt.id}`}
                    onClick={() => {
                      setTargetResourceType(rt.id);
                      setResourceTypeSearch(rt.name);
                      setIsResourceTypeDropdownOpen(false);
                    }}
                    className="p-2 hover:bg-amber-100 cursor-pointer text-amber-800 flex items-center"
                  >
                    <img 
                      src={`/public_assets/images/resources/${rt.id}.png`} 
                      alt={rt.name} 
                      className="w-5 h-5 mr-2 object-contain" 
                    />
                    {rt.name}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {summaryElements && (
        <div className="mt-6 p-3 bg-amber-100 border border-amber-200 rounded-md text-base text-amber-800 flex items-start">
          <FaLongArrowAltRight className="text-amber-600 mr-2 mt-1 flex-shrink-0" size={18} />
          <span>{summaryElements}</span>
        </div>
      )}
    </div>
  );
});

CoordinatePricingStratagemPanel.displayName = 'CoordinatePricingStratagemPanel';
export default CoordinatePricingStratagemPanel;
