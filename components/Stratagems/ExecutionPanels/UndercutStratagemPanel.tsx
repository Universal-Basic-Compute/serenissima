import React, { useState, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import { StratagemSpecificPanelProps, StratagemSpecificPanelRef, StratagemData, CitizenOption, ResourceTypeOption, BuildingOption } from './types';
import { FaUserShield, FaBuilding, FaBoxOpen, FaTimes } from 'react-icons/fa';

const UndercutStratagemPanel = forwardRef<StratagemSpecificPanelRef, StratagemSpecificPanelProps>((props, ref) => {
  const { stratagemData, citizens, buildings, resourceTypes, isLoading, currentUserUsername, currentUserFirstName, currentUserLastName } = props;
  // currentUserFirstName et currentUserLastName ne sont pas utilisés ici, mais sont acceptés pour la cohérence du type.

  const [selectedVariant, setSelectedVariant] = useState<'Mild' | 'Standard' | 'Aggressive'>('Standard');
  
  // States for Target Resource Type
  const [targetResourceType, setTargetResourceType] = useState<string | null>(null);
  const [resourceTypeSearch, setResourceTypeSearch] = useState('');
  const [isResourceTypeDropdownOpen, setIsResourceTypeDropdownOpen] = useState(false);
  const resourceTypeInputRef = useRef<HTMLInputElement>(null);

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
  
  const stratagemHasVariants = stratagemData.hasVariants !== false;

  // const calculatedInfluenceCost = stratagemHasVariants // Removed
  //   ? stratagemData.influenceCostBase * (selectedVariant === 'Mild' ? 1 : selectedVariant === 'Standard' ? 2 : 3) // Removed
  //   : stratagemData.influenceCostBase; // Removed

  // Exposer les méthodes via ref
  useImperativeHandle(ref, () => ({
    getStratagemDetails: () => {
      if (!targetResourceType) {
        // Le panneau principal affichera une erreur plus générique si nécessaire,
        // mais le bouton Exécuter sera désactivé par la logique du panneau principal.
        // On pourrait aussi lancer une alerte ici ou retourner un message d'erreur.
        console.error("UndercutStratagemPanel: Target Resource Type is required.");
        return null; 
      }
      const details: Record<string, any> = {
        targetResourceType: targetResourceType,
      };
      if (stratagemHasVariants) {
        details.variant = selectedVariant;
      }
      if (targetCitizen) {
        details.targetCitizen = targetCitizen;
      }
      if (targetBuilding) {
        details.targetBuilding = targetBuilding;
      }
      // TODO: Ajouter durationHours, name, description si ces champs sont ajoutés au panneau
      return details;
    },
    // getCalculatedInfluenceCost: () => { // Removed
    //   return calculatedInfluenceCost; // Removed
    // } // Removed
  }));

  // Informer le parent du changement de coût d'influence (si la prop est fournie) // Removed
  // Ceci est géré par getCalculatedInfluenceCost, le parent peut l'appeler. // Removed

  return (
    <div>
      {/* Variant Selection */}
      {stratagemHasVariants && (
        <div className="mb-4">
          <label htmlFor="undercut_variant" className="block text-sm font-medium text-amber-800 mb-1">
            Aggressiveness Variant
          </label>
          <select
            id="undercut_variant"
            value={selectedVariant}
            onChange={(e) => setSelectedVariant(e.target.value as 'Mild' | 'Standard' | 'Aggressive')}
            className="w-full p-2 border border-amber-300 rounded-md bg-white text-amber-900 focus:ring-amber-500 focus:border-amber-500"
            disabled={isLoading}
          >
            <option value="Mild">Mild (10% Undercut)</option>
            <option value="Standard">Standard (15% Undercut)</option>
            <option value="Aggressive">Aggressive (20% Undercut)</option>
          </select>
        </div>
      )}

      {/* Target Resource Type */}
      <div className="mb-4">
        <label htmlFor="undercut_targetResourceType_search" className="block text-sm font-medium text-amber-800 mb-1 flex items-center">
          <FaBoxOpen className="mr-2" /> Target Resource Type <span className="text-red-500 ml-1">*</span>
        </label>
        <div className="relative">
          <input
            id="undercut_targetResourceType_search"
            type="text"
            ref={resourceTypeInputRef}
            value={resourceTypeSearch}
            onChange={(e) => {
              setResourceTypeSearch(e.target.value);
              if (!isResourceTypeDropdownOpen) setIsResourceTypeDropdownOpen(true);
              if (targetResourceType) setTargetResourceType(null); // Clear selection if user types
            }}
            onFocus={() => setIsResourceTypeDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsResourceTypeDropdownOpen(false), 150)} // Delay to allow click on dropdown
            placeholder={targetResourceType ? resourceTypes.find(rt => rt.id === targetResourceType)?.name || 'Search...' : 'Search Resource Types...'}
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
                    key={`undercut-resource-opt-${rt.id}`}
                    onClick={() => {
                      setTargetResourceType(rt.id);
                      setResourceTypeSearch(rt.name); // Display selected name in input
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

      {/* Target Citizen */}
      <div className="mb-4">
        <label htmlFor="undercut_targetCitizen_search" className="block text-sm font-medium text-amber-800 mb-1 flex items-center">
          <FaUserShield className="mr-2" /> Target Competitor Citizen (Optional)
        </label>
        <div className="relative">
          <input
            id="undercut_targetCitizen_search"
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
                      key={`undercut-citizen-opt-${c.username || index}`}
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
      
      {/* Target Building */}
      <div className="mb-4">
        <label htmlFor="undercut_targetBuilding_search" className="block text-sm font-medium text-amber-800 mb-1 flex items-center">
          <FaBuilding className="mr-2" /> Target Competitor Building (Optional)
        </label>
        <div className="relative">
          <input
            id="undercut_targetBuilding_search"
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
                .filter(b => !currentUserUsername || (b.owner !== currentUserUsername))
                .filter(b => !targetCitizen || (b.owner === targetCitizen))
                .filter(b => {
                  const searchTermLower = buildingSearch.toLowerCase();
                  return (b.name && b.name.toLowerCase().includes(searchTermLower)) ||
                         (b.buildingId && b.buildingId.toLowerCase().includes(searchTermLower)) ||
                         (b.type && b.type.toLowerCase().includes(searchTermLower)) ||
                         (b.owner && b.owner.toLowerCase().includes(searchTermLower));
                })
                .map(b => (
                  <li
                    key={`undercut-building-opt-${b.buildingId}`}
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
    </div>
  );
});

UndercutStratagemPanel.displayName = 'UndercutStratagemPanel';
export default UndercutStratagemPanel;
