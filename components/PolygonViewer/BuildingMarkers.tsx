import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { buildingPointsService } from '@/lib/services/BuildingPointsService'; // For position lookup if needed
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';

interface BuildingMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number; y: number };
  canvasWidth: number;
  canvasHeight: number;
  activeView: string; 
  buildings: any[]; 
  buildingFilterMode: 'city' | 'me';
  getCurrentCitizenIdentifier: () => string | null;
  financialAspect: 'default' | 'lease' | 'rent' | 'wages';
  financialDataRange: { min: number, max: number } | null;
  getFinancialAspectColor: (value: number | undefined, min: number, max: number) => string;
  // getDefaultBuildingMarkerColor prop removed
  // citizens: Record<string, any>; // Prop for citizens data if needed for other purposes
}

// Constante pour définir le seuil de zoom à partir duquel on affiche les intérieurs
const INTERIOR_VIEW_ZOOM_THRESHOLD = 12.0;

export default function BuildingMarkers({
  isVisible,
  scale,
  offset,
  canvasWidth,
  canvasHeight,
  activeView,
  buildings: initialBuildings,
  buildingFilterMode,
  getCurrentCitizenIdentifier,
  financialAspect,
  financialDataRange,
  getFinancialAspectColor,
  // getDefaultBuildingMarkerColor prop removed from destructuring
}: BuildingMarkersProps) {
  const [buildings, setBuildings] = useState<any[]>(initialBuildings);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [showInteriors, setShowInteriors] = useState<boolean>(false);
  const [interiorImageCache, setInteriorImageCache] = useState<Record<string, { loaded: boolean, url: string }>>({});
  const prevScaleRef = useRef<number>(scale);

  useEffect(() => {
    setBuildings(initialBuildings);
  }, [initialBuildings]);
  
  // Effet pour détecter quand le zoom dépasse le seuil pour afficher les intérieurs
  useEffect(() => {
    const isMaxZoom = scale >= INTERIOR_VIEW_ZOOM_THRESHOLD;
    
    // Si on vient de dépasser le seuil (dans un sens ou dans l'autre)
    if (isMaxZoom !== showInteriors) {
      // Petit délai pour permettre une transition fluide
      setTimeout(() => {
        setShowInteriors(isMaxZoom);
      }, 100);
    }
    
    prevScaleRef.current = scale;
  }, [scale, showInteriors]);
  
  const currentCitizen = getCurrentCitizenIdentifier();

  // Filter buildings for rendering as DOM icons:
  // Apply ownership filter and exclude types handled by canvas (bridges, merchant_galleys)
  const buildingsToRenderAsIcons = useMemo(() => {
    let buildingsToProcess = buildings; 
    if (buildingFilterMode === 'me') {
      buildingsToProcess = buildings.filter(b => b.owner === currentCitizen);
    }
    // Exclude bridges and merchant galleys, as they are drawn on canvas by RenderService
    return buildingsToProcess.filter(
      b => !(b.type && (b.type.toLowerCase().includes('bridge') || b.type.toLowerCase() === 'merchant_galley'))
    );
  }, [buildings, buildingFilterMode, currentCitizen]);

  const latLngToScreen = useCallback((lat: number, lng: number): { x: number; y: number } => {
    const world = CoordinateService.latLngToWorld(lat, lng);
    return CoordinateService.worldToScreen(world.x, world.y, scale, offset, canvasWidth, canvasHeight);
  }, [scale, offset, canvasWidth, canvasHeight]);

  const handleMouseEnter = useCallback((building: any) => {
    setHoveredBuildingId(building.id); // Assuming building.id is the unique identifier
    hoverStateService.setHoverState('building', building.id, {
      ...building, // Pass full building data
      // Ensure position is in lat/lng for the tooltip if it expects that
      position: building.position, // Assuming building.position is {lat, lng} or similar
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredBuildingId(null);
    hoverStateService.clearHoverState();
  }, []);

  const handleClick = useCallback((building: any) => {
    console.log('Building clicked:', building);
    eventBus.emit(EventTypes.BUILDING_SELECTED, { buildingId: building.id, buildingData: building });
    // IsometricViewer will listen to this event to show BuildingDetailsPanel
  }, []);

  // If the component is marked as not visible by the parent, don't render anything.
  // The activeView check is removed to allow markers in all views.
  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {buildingsToRenderAsIcons.map((building) => {
        // Bridges and merchant galleys are already filtered out by buildingsToRenderAsIcons
        if (!building.position) return null;

        let pos: { lat: number; lng: number } | null = null;
        if (typeof building.position === 'string') {
          try {
            const parsed = JSON.parse(building.position);
            if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
              pos = parsed;
            }
          } catch (e) { /* ignore */ }
        } else if (building.position && typeof building.position.lat === 'number' && typeof building.position.lng === 'number') {
          pos = building.position;
        } else if (building.point_id) {
          // Fallback to buildingPointsService if direct position is missing/invalid
          const pointPosition = buildingPointsService.getPositionForPoint(building.point_id);
          if (pointPosition) pos = pointPosition;
        }


        if (!pos) {
          // console.warn(`Building ${building.id} has no valid position data.`, building);
          return null;
        }

        const { x, y } = latLngToScreen(pos.lat, pos.lng);
        const isHovered = hoveredBuildingId === building.id;

        // Marker style using an image
        // Size now scales directly with the map's scale factor
        let sizeMultiplier = 1;
        if (building.size === 2) {
          sizeMultiplier = 1.25;
        } else if (building.size === 3) {
          sizeMultiplier = 1.5;
        } else if (building.size && building.size >= 4) {
          sizeMultiplier = 2.0;
        }

        const baseMarkerSize = 13.2 * scale; // Increased by 10% (12 * 1.1 = 13.2)
        const markerSize = baseMarkerSize * sizeMultiplier;

        let haloColorValue: string | null = null; // null means no halo

        if (building.isConstructed === false) {
          if (financialAspect !== 'default') {
            haloColorValue = 'rgba(136, 136, 136, 0.7)'; // Grey halo for unconstructed buildings in financial views
          }
        } else { // Building is constructed
          if (financialAspect !== 'default' && financialDataRange) {
            let rawValue: number | undefined;
            switch (financialAspect) {
              case 'lease': rawValue = building.leasePrice; break;
              case 'rent': rawValue = building.rentPrice; break;
              case 'wages': rawValue = building.wages; break;
              default: rawValue = undefined;
            }

            if (rawValue === undefined || rawValue === null || rawValue <= 0) { // Also check for non-positive for log
              haloColorValue = 'rgba(170, 170, 170, 0.7)'; // Lighter grey halo
            } else {
              const logTransformedValue = Math.log1p(rawValue);
              const rgbColor = getFinancialAspectColor(logTransformedValue, financialDataRange.min, financialDataRange.max);
              if (rgbColor.startsWith('rgb(')) {
                haloColorValue = rgbColor.replace('rgb(', 'rgba(').replace(')', ', 1.0)'); // Add 1.0 alpha for full opacity
              } else {
                haloColorValue = rgbColor; 
              }
            }
          }
        }
        
        // Define icon type and URLs
        const iconType = building.type ? building.type.toLowerCase().replace(/\s+/g, '_') : 'default';
        const iconUrl = `/public_assets/images/buildings/icons/${iconType}.png`;
        const defaultIconUrl = '/public_assets/images/buildings/icons/default.png';
          
        // URL pour l'image d'intérieur
        const interiorUrl = `/images/interiors/${iconType}.png`;
        const defaultInteriorUrl = '/images/interiors/default.png';
          
        // Vérifier si l'image d'intérieur est dans le cache
        if (!interiorImageCache[iconType]) {
          // Ajouter au cache avec un état initial
          setInteriorImageCache(prev => ({
            ...prev,
            [iconType]: { loaded: false, url: interiorUrl }
          }));
            
          // Précharger l'image d'intérieur
          const img = new Image();
          img.onload = () => {
            setInteriorImageCache(prev => ({
              ...prev,
              [iconType]: { loaded: true, url: interiorUrl }
            }));
          };
          img.onerror = () => {
            setInteriorImageCache(prev => ({
              ...prev,
              [iconType]: { loaded: true, url: defaultInteriorUrl }
            }));
          };
          img.src = interiorUrl;
        }
          
        // Déterminer quelle image afficher
        const displayUrl = showInteriors 
          ? (interiorImageCache[iconType]?.loaded ? interiorImageCache[iconType].url : iconUrl) 
          : iconUrl;
          
        return (
          <div
            key={building.id}
            className="absolute pointer-events-auto" // Tailwind transform classes removed
            style={{
              left: `${x}px`,
              top: `${y}px`,
              zIndex: isHovered ? 18 : (building.type?.toLowerCase() === 'merchant_galley' ? 17 : 16), // Adjusted z-index
              transition: 'transform 0.1s ease-out, box-shadow 0.1s ease-out, opacity 0.2s ease-out',
              transform: `translate(-50%, -50%) scale(${isHovered ? 2 : 1})`,
              cursor: 'pointer',
              filter: isHovered 
                ? 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.7))' 
                : `drop-shadow(0 ${Math.max(1, Math.round(scale * 0.5))}px ${Math.max(1, Math.round(scale * 1))}px rgba(0,0,0,0.125))`,
              opacity: building.isConstructed === false ? 0.5 : 1, // Opacité augmentée à 0.5
            }}
            onMouseEnter={() => handleMouseEnter(building)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(building)}
            title={building.name || building.type}
          >
            {/* Wrapper div for border and icon */}
            <div 
              style={{
                width: `${markerSize}px`,
                height: `${markerSize}px`,
                borderRadius: '8px', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(218, 165, 32, 0.15)', // Gold tint with 50% reduced opacity
                padding: '2px', 
                boxShadow: haloColorValue 
                  ? `0 0 15px 5px ${haloColorValue}` // Increased halo size and spread
                  : `0 ${Math.max(1, Math.round(scale * 0.5))}px ${Math.max(2, Math.round(scale * 1.5))}px rgba(0,0,0,0.075)`, // Apply halo or scaled default shadow
                overflow: 'hidden', // Ensures the image is clipped by the borderRadius
              }}
            >
              {/* Utiliser une div avec deux images pour permettre la transition */}
              <div className="relative w-full h-full">
                {/* Image d'icône (toujours présente) */}
                <img
                  src={iconUrl}
                  alt={building.name || building.type}
                  className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
                  style={{
                    opacity: showInteriors && interiorImageCache[iconType]?.loaded ? 0 : 1,
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = defaultIconUrl;
                  }}
                />
                  
                {/* Image d'intérieur (visible uniquement au zoom max) */}
                {interiorImageCache[iconType]?.loaded && (
                  <img
                    src={interiorImageCache[iconType].url}
                    alt={`Interior of ${building.name || building.type}`}
                    className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
                    style={{
                      opacity: showInteriors ? 1 : 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = defaultInteriorUrl;
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
