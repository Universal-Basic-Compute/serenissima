import React, { useEffect, useRef, useState } from 'react';
import { Polygon } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import ActionButton from '../UI/ActionButton'; // Added for action buttons
import AnimatedDucats from '../UI/AnimatedDucats'; // Added for displaying prices

type ActiveLeftTabType = 'info' | 'buildings' | 'realEstate';

// Format a snake_case or kebab-case building type into a human-readable label
function formatBuildingType(type: string | null | undefined): string {
  if (!type) return 'Building';
  return type
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface LandInfoColumnProps {
  selectedPolygon: Polygon | null;
  selectedPolygonId: string | null;
  activeLeftTab: ActiveLeftTabType;
  setActiveLeftTab: (tab: ActiveLeftTabType) => void;
  // Props for Real Estate Tab
  landListingByOwner: any | null;
  incomingBuyOffers: any[];
  isOwner: boolean;
  currentCitizenUsername: string | null;
  handleGenericActivity: (activityType: string, parameters: Record<string, any>) => Promise<void>;
  normalizeIdentifier: (id: string | null | undefined) => string | null;
  isLoadingMarketData: boolean;
}

interface BuildingInfo {
  id: string;
  type: string;
  name: string;
  owner: string | null;
  occupant: string | null;
  category: string | null;
  runBy: string | null;
  isConstructed: boolean;
}

const LandInfoColumn: React.FC<LandInfoColumnProps> = ({
  selectedPolygon,
  selectedPolygonId,
  activeLeftTab,
  setActiveLeftTab,
  // Props for Real Estate Tab
  landListingByOwner,
  incomingBuyOffers,
  isOwner,
  currentCitizenUsername,
  handleGenericActivity,
  normalizeIdentifier,
  isLoadingMarketData,
}) => {
  const [isImageHovered, setIsImageHovered] = useState(false);
  const hoverIntentRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buildings state for the Buildings tab
  const [buildings, setBuildings] = useState<BuildingInfo[]>([]);
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);

  // Fetch buildings when the Buildings tab is active and a land parcel is selected
  useEffect(() => {
    if (activeLeftTab !== 'buildings' || !selectedPolygonId) {
      return;
    }

    const fetchBuildings = async () => {
      setIsLoadingBuildings(true);
      setBuildingsError(null);
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        const response = await fetch(`${API_BASE_URL}/api/buildings?landId=${encodeURIComponent(selectedPolygonId)}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch buildings: ${response.status}`);
        }
        const data = await response.json();
        if (data.buildings && Array.isArray(data.buildings)) {
          const mapped: BuildingInfo[] = data.buildings.map((b: any) => ({
            id: b.id || b.buildingId || '',
            type: b.type || 'unknown',
            name: b.name || formatBuildingType(b.type),
            owner: b.owner || null,
            occupant: b.occupant || null,
            category: b.category || null,
            runBy: b.runBy || null,
            isConstructed: b.isConstructed === true,
          }));
          setBuildings(mapped);
        } else {
          setBuildings([]);
        }
      } catch (err) {
        console.error('Error fetching buildings for land:', err);
        setBuildingsError(err instanceof Error ? err.message : 'Failed to load buildings');
        setBuildings([]);
      } finally {
        setIsLoadingBuildings(false);
      }
    };

    fetchBuildings();
  }, [activeLeftTab, selectedPolygonId]);

  if (!selectedPolygon) return null;

  const handleMouseEnter = () => {
    if (hoverIntentRef.current) {
      clearTimeout(hoverIntentRef.current);
      hoverIntentRef.current = null;
    }
    setIsImageHovered(true);
  };

  const handleMouseLeave = () => {
    hoverIntentRef.current = setTimeout(() => {
      setIsImageHovered(false);
    }, 200); // Délai de 200ms avant de cacher
  };

  return (
    <div className="flex flex-col">
      {/* Tab Navigation */}
      <div className="mb-3 border-b border-amber-300 flex-shrink-0">
        <nav className="flex space-x-1" aria-label="Left Column Tabs">
          <button
            onClick={() => setActiveLeftTab('info')}
            className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
              ${activeLeftTab === 'info' 
                ? 'bg-amber-600 text-white' 
                : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
              }`}
          >
            Info
          </button>
          <button
            onClick={() => setActiveLeftTab('buildings')}
            className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
              ${activeLeftTab === 'buildings' 
                ? 'bg-amber-600 text-white' 
                : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
              }`}
          >
            Buildings
          </button>
          <button
            onClick={() => setActiveLeftTab('realEstate')}
            className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
              ${activeLeftTab === 'realEstate' 
                ? 'bg-amber-600 text-white' 
                : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
              }`}
          >
            Real Estate
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1">
        {activeLeftTab === 'info' && (
          <>
            {/* Land Overview (Top View) */}
            <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Overview</h3>
              <div 
                className="flex flex-col items-center relative" // Relative for potential local popups, but zoomed is now fixed
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {selectedPolygon.id && (
                  <>
                    <img
                      src={`/images/lands/${selectedPolygon.id}.png`}
                      alt={`Image of ${selectedPolygon.historicalName || selectedPolygon.id}`}
                      className="w-[150px] h-[150px] border border-amber-100 rounded-lg mb-2 object-cover cursor-pointer"
                      style={{ aspectRatio: '1/1' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/default_land_image.png'; 
                        (e.target as HTMLImageElement).alt = 'Default land image';
                      }}
                    />
                    {isImageHovered && (
                      <div 
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-1 bg-white border-2 border-amber-500 rounded-lg shadow-xl"
                        onMouseEnter={handleMouseEnter} // Keep open if mouse moves onto the zoomed image
                        onMouseLeave={handleMouseLeave} // Hide if mouse leaves the zoomed image
                      >
                        <img
                          src={`/images/lands/${selectedPolygon.id}.png`}
                          alt={`Zoomed image of ${selectedPolygon.historicalName || selectedPolygon.id}`}
                          className="w-[600px] h-[600px] object-cover rounded"
                          style={{ aspectRatio: '1/1' }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/default_land_image.png';
                            (e.target as HTMLImageElement).alt = 'Default land image';
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
                {selectedPolygon?.buildingPoints && (
                  <div className="text-center mt-1">
                    <span className="text-xs text-amber-700">Buildable: </span>
                    <span className="text-xs font-semibold text-amber-800">
                      {selectedPolygon.buildingPoints.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Income information */}
            {(selectedPolygon?.lastIncome !== undefined || 
              (selectedPolygonId && (() => {
                try {
                  const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
                  return getIncomeDataService().getIncome(selectedPolygonId) !== undefined;
                } catch (error) { return false; }
              })())) && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Income</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Daily Income:</span>
                  <span className="font-semibold text-amber-800">
                    {(() => {
                      try {
                        const income = selectedPolygon?.lastIncome !== undefined 
                          ? selectedPolygon.lastIncome 
                          : (() => {
                              const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
                              return getIncomeDataService().getIncome(selectedPolygonId!);
                            })();
                        return income !== undefined ? income.toLocaleString() : '0';
                      } catch (error) {
                        return selectedPolygon?.lastIncome !== undefined 
                          ? selectedPolygon.lastIncome.toLocaleString() 
                          : '0';
                      }
                    })()} ⚜️
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full" 
                    style={{
                      width: `${(() => {
                        try {
                          const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
                          const incomeService = getIncomeDataService();
                          const income = selectedPolygon?.lastIncome !== undefined 
                            ? selectedPolygon.lastIncome 
                            : incomeService.getIncome(selectedPolygonId!);
                          return Math.min(100, Math.max(5, ((income || 0) / incomeService.getMaxIncome()) * 100));
                        } catch (error) {
                          return selectedPolygon?.lastIncome !== undefined 
                            ? Math.min(100, Math.max(5, (selectedPolygon.lastIncome / 1000) * 100))
                            : 5;
                        }
                      })()}%`,
                      background: 'linear-gradient(90deg, #33cc33 0%, #ffcc00 50%, #ff3300 100%)'
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Historical Info */}
            {selectedPolygon?.historicalName && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-1">Historical Name</h3>
                <p className="font-serif text-md font-semibold text-amber-800">{selectedPolygon.historicalName}</p>
                {selectedPolygon.englishName && (
                  <p className="mt-0.5 text-xs italic text-amber-600">{selectedPolygon.englishName}</p>
                )}
              </div>
            )}
            {selectedPolygon?.historicalDescription && (
              <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-1">Description</h3>
                <div className="text-xs text-gray-700 leading-relaxed custom-scrollbar max-h-24 overflow-y-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPolygon.historicalDescription}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
        {activeLeftTab === 'buildings' && (
          <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Buildings on this Land</h3>
            {isLoadingBuildings && (
              <p className="text-xs text-amber-700">Loading buildings...</p>
            )}
            {buildingsError && (
              <p className="text-xs text-red-600">Error: {buildingsError}</p>
            )}
            {!isLoadingBuildings && !buildingsError && buildings.length === 0 && (
              <p className="text-xs text-gray-500 italic">No buildings on this land parcel.</p>
            )}
            {!isLoadingBuildings && !buildingsError && buildings.length > 0 && (
              <div className="space-y-2">
                {buildings.map((building) => (
                  <div
                    key={building.id}
                    className="p-2 rounded-lg bg-amber-50 border border-amber-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-amber-800 truncate">
                        {building.name}
                      </span>
                      {building.isConstructed ? (
                        <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                          Built
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
                          Under Construction
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Type:</span>
                        <span className="font-medium text-amber-700">{formatBuildingType(building.type)}</span>
                      </div>
                      {building.category && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Category:</span>
                          <span className="font-medium text-amber-700">{formatBuildingType(building.category)}</span>
                        </div>
                      )}
                      {building.owner && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Owner:</span>
                          <span className="font-medium text-amber-700 truncate ml-2">{building.owner}</span>
                        </div>
                      )}
                      {building.runBy && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Run by:</span>
                          <span className="font-medium text-amber-700 truncate ml-2">{building.runBy}</span>
                        </div>
                      )}
                      {building.occupant && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Occupant:</span>
                          <span className="font-medium text-amber-700 truncate ml-2">{building.occupant}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-gray-400 text-right pt-1">
                  {buildings.length} building{buildings.length !== 1 ? 's' : ''} total
                </div>
              </div>
            )}
          </div>
        )}
        {activeLeftTab === 'realEstate' && (
          <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200 space-y-3">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Real Estate Market</h3>
            {isLoadingMarketData && <p className="text-xs text-amber-700">Loading market data...</p>}

            {!isLoadingMarketData && !landListingByOwner && incomingBuyOffers.length === 0 && (
              <p className="text-xs text-gray-500 italic">No active listings or offers for this land.</p>
            )}

            {/* Display Owner's Listing */}
            {landListingByOwner && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-md font-semibold text-amber-800">
                  For Sale by {landListingByOwner.SellerName || landListingByOwner.Seller}
                </p>
                <p className="text-xl font-semibold text-center my-1">
                  <span style={{ color: '#d4af37' }}>
                    <AnimatedDucats 
                      value={landListingByOwner.PricePerResource} 
                      suffix="⚜️ ducats" 
                      duration={1500}
                    />
                  </span>
                </p>
                {!isOwner && currentCitizenUsername && normalizeIdentifier(landListingByOwner.Seller) !== normalizeIdentifier(currentCitizenUsername) && (
                  <ActionButton
                    onClick={() => handleGenericActivity('buy_listed_land', { contractId: landListingByOwner.contractId || landListingByOwner.id, landId: selectedPolygonId, price: landListingByOwner.PricePerResource })}
                    variant="primary"
                    className="w-full mt-2 text-xs"
                  >
                    Buy Now at {landListingByOwner.PricePerResource.toLocaleString()} ⚜️
                  </ActionButton>
                )}
                {isOwner && normalizeIdentifier(landListingByOwner.Seller) === normalizeIdentifier(currentCitizenUsername) && (
                   <ActionButton
                    onClick={() => handleGenericActivity('cancel_land_listing', { contractId: landListingByOwner.id, landId: selectedPolygonId })}
                    variant="danger"
                    className="w-full mt-2 text-xs"
                  >
                    Cancel Your Listing
                  </ActionButton>
                )}
              </div>
            )}

            {/* Display Incoming Buy Offers */}
            {incomingBuyOffers.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold text-amber-700 mb-1">Incoming Buy Offers:</h4>
                {incomingBuyOffers.map(offer => (
                  <div key={offer.id} className="p-2 mb-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                    <p>Offer from: {offer.BuyerName || offer.Buyer}</p>
                    <p>Amount: {offer.PricePerResource.toLocaleString()} ⚜️ ducats</p>
                    {isOwner && (
                      <ActionButton
                        onClick={() => handleGenericActivity('accept_land_offer', { contractId: offer.id, landId: selectedPolygonId })}
                        variant="primary"
                        className="w-full mt-1 text-xs"
                      >
                        Accept Offer
                      </ActionButton>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LandInfoColumn;
