import React, { useEffect, useRef, useState } from 'react';
import { Polygon } from './types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import ActionButton from '../UI/ActionButton'; // Added for action buttons
import AnimatedDucats from '../UI/AnimatedDucats'; // Added for displaying prices

type ActiveLeftTabType = 'info' | 'buildings' | 'realEstate';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [landRendered, setLandRendered] = useState<boolean>(false);

  // Function to render a top-down view of the land
  const renderLandTopView = (polygon: Polygon, canvas: HTMLCanvasElement): void => {
    if (!polygon.coordinates || polygon.coordinates.length < 3) return;

    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const coords = polygon.coordinates;
    let minLat = coords[0]?.lat || 0, maxLat = coords[0]?.lat || 0;
    let minLng = coords[0]?.lng || 0, maxLng = coords[0]?.lng || 0;

    coords.forEach(coord => {
      if (coord) {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      }
    });

    const latRange = (maxLat - minLat) * 0.7;
    const lngRange = maxLng - minLng;
    const padding = 20;
    const scaleX = (canvas.width - padding * 2) / lngRange;
    const scaleY = (canvas.height - padding * 2) / latRange;
    const scale = Math.min(scaleX, scaleY);
    const centerX = (canvas.width / 2) - ((minLng + maxLng) / 2) * scale;
    const centerY = (canvas.height / 2) + ((minLat + maxLat) / 2) * scale;

    ctx.beginPath();
    coords.forEach((coord, index) => {
      const x = (coord.lng * scale) + centerX;
      const y = centerY - (coord.lat * scale * 0.7);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#f5e9c8';
    ctx.fill();
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.stroke();

    const hasIncome = polygon.lastIncome !== undefined || (() => {
      try {
        const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
        return getIncomeDataService().getIncome(polygon.id) !== undefined;
      } catch (error) { return false; }
    })();

    if (hasIncome) {
      try {
        const income = polygon.lastIncome !== undefined 
          ? polygon.lastIncome 
          : (() => {
              const { getIncomeDataService } = require('../../lib/services/IncomeDataService');
              return getIncomeDataService().getIncome(polygon.id);
            })();
        const minIncome = (() => {
          try { const { getIncomeDataService } = require('../../lib/services/IncomeDataService'); return getIncomeDataService().getMinIncome(); }
          catch (error) { return 0; }
        })();
        const maxIncome = (() => {
          try { const { getIncomeDataService } = require('../../lib/services/IncomeDataService'); return getIncomeDataService().getMaxIncome(); }
          catch (error) { return 1000; }
        })();
        const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
        ctx.globalAlpha = 0.4;
        if (normalizedIncome >= 0.5) {
          const t = (normalizedIncome - 0.5) * 2;
          const r = 255; const g = Math.floor(255 * (1 - t)); const b = 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          const t = normalizedIncome * 2;
          const r = Math.floor(255 * t); const g = 255; const b = 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;
      } catch (error) {
        console.warn('Error applying income-based coloring:', error);
        // Fallback for polygon.lastIncome if service fails
        if (polygon.lastIncome !== undefined) {
            const maxIncomeVal = 1000;
            const normalizedIncomeVal = Math.min(Math.max(polygon.lastIncome / maxIncomeVal, 0), 1);
            ctx.globalAlpha = 0.4;
            if (normalizedIncomeVal >= 0.5) {
                const t = (normalizedIncomeVal - 0.5) * 2;
                const r = 255; const g = Math.floor(255 * (1 - t)); const b = 0;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
            } else {
                const t = normalizedIncomeVal * 2;
                const r = Math.floor(255 * t); const g = 255; const b = 0;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
            }
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
      }
    }
    
    if (polygon.centroid) {
      const x = (polygon.centroid.lng * scale) + centerX;
      const y = centerY - (polygon.centroid.lat * scale);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0000';
      ctx.fill();
    }
  };

  useEffect(() => {
    if (selectedPolygon && canvasRef.current && !landRendered) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      renderLandTopView(selectedPolygon, canvasRef.current);
      setLandRendered(true);
    }
  }, [selectedPolygon, landRendered, renderLandTopView]); // renderLandTopView added

  useEffect(() => {
    if (selectedPolygonId) {
      setLandRendered(false); // Reset when polygon changes, to trigger re-render
    }
  }, [selectedPolygonId]);


  if (!selectedPolygon) return null;

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
            Immobilier
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
              <div className="flex flex-col items-center">
                <canvas 
                  ref={canvasRef} 
                  className="w-[150px] h-[150px] border border-amber-100 rounded-lg mb-2"
                  style={{ aspectRatio: '1/1' }}
                />
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
            <p className="text-xs text-gray-500 italic">Building list coming soon.</p>
            {/* TODO: Implement building list display here */}
          </div>
        )}
        {activeLeftTab === 'realEstate' && (
          <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200 space-y-3">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Marché Immobilier</h3>
            {isLoadingMarketData && <p className="text-xs text-amber-700">Chargement des données du marché...</p>}

            {!isLoadingMarketData && !landListingByOwner && incomingBuyOffers.length === 0 && (
              <p className="text-xs text-gray-500 italic">Aucune annonce ou offre active pour ce terrain.</p>
            )}

            {/* Affichage de l'annonce du propriétaire */}
            {landListingByOwner && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-md font-semibold text-amber-800">
                  À Vendre par {landListingByOwner.SellerName || landListingByOwner.Seller}
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
                    onClick={() => handleGenericActivity('buy_listed_land', { contractId: landListingByOwner.id, landId: selectedPolygonId, price: landListingByOwner.PricePerResource })}
                    variant="primary"
                    className="w-full mt-2 text-xs"
                  >
                    Acheter Maintenant à {landListingByOwner.PricePerResource.toLocaleString()} ⚜️
                  </ActionButton>
                )}
                {isOwner && normalizeIdentifier(landListingByOwner.Seller) === normalizeIdentifier(currentCitizenUsername) && (
                   <ActionButton
                    onClick={() => handleGenericActivity('cancel_land_listing', { contractId: landListingByOwner.id, landId: selectedPolygonId })}
                    variant="danger"
                    className="w-full mt-2 text-xs"
                  >
                    Annuler Votre Annonce
                  </ActionButton>
                )}
              </div>
            )}

            {/* Affichage des offres d'achat reçues */}
            {incomingBuyOffers.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold text-amber-700 mb-1">Offres d'Achat Reçues :</h4>
                {incomingBuyOffers.map(offer => (
                  <div key={offer.id} className="p-2 mb-2 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                    <p>Offre de : {offer.BuyerName || offer.Buyer}</p>
                    <p>Montant : {offer.PricePerResource.toLocaleString()} ⚜️ ducats</p>
                    {isOwner && (
                      <ActionButton
                        onClick={() => handleGenericActivity('accept_land_offer', { contractId: offer.id, landId: selectedPolygonId })}
                        variant="primary"
                        className="w-full mt-1 text-xs"
                      >
                        Accepter l'Offre
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
