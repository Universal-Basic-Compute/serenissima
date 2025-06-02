import { useState, useEffect, useCallback, useRef } from 'react';
import { landService } from '@/lib/services/LandService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { Resizable } from 're-resizable';

interface LandMarkersProps {
  isVisible: boolean;
  polygonsToRender: {
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
    polygonWorldMapCenterX?: number;
    polygonWorldMapCenterY?: number;
    hasPublicDock?: boolean;
  }[];
  isNight: boolean;
  scale: number;
  activeView: string;
  canvasWidth: number;
  canvasHeight: number;
  mapTransformOffset: { x: number, y: number };
}

interface LandImageSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  referenceScale?: number;
}

export default function LandMarkers({
  isVisible,
  polygonsToRender,
  isNight,
  scale,
  activeView,
  canvasWidth,
  canvasHeight,
  mapTransformOffset
}: LandMarkersProps) {
  const [hoveredPolygonId, setHoveredPolygonId] = useState<string | null>(null);
  const [landImages, setLandImages] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState<boolean>(false);
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
  const [imageSettings, setImageSettings] = useState<Record<string, LandImageSettings>>({});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const positionRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });

  // Coordinate transformation utilities
  const worldToScreenX = (mapWorldX: number, mapWorldY: number, currentScale: number, currentMapTransformOffset: {x: number, y: number}, currentCanvasWidth: number): number => {
    return mapWorldX * currentScale + currentCanvasWidth / 2 + currentMapTransformOffset.x;
  };

  const worldToScreenY = (mapWorldX: number, mapWorldY: number, currentScale: number, currentMapTransformOffset: {x: number, y: number}, currentCanvasHeight: number): number => {
    return (-mapWorldY) * currentScale * 1.4 + currentCanvasHeight / 2 + currentMapTransformOffset.y; // Assuming 1.4 factor for Y
  };

  const screenToWorldX = (screenX: number, screenY: number, currentScale: number, currentMapTransformOffset: {x: number, y: number}, currentCanvasWidth: number): number => {
    return (screenX - currentCanvasWidth / 2 - currentMapTransformOffset.x) / currentScale;
  };

  const screenToWorldY = (screenX: number, screenY: number, currentScale: number, currentMapTransformOffset: {x: number, y: number}, currentCanvasHeight: number): number => {
    return -(screenY - currentCanvasHeight / 2 - currentMapTransformOffset.y) / (currentScale * 1.4); // Assuming 1.4 factor for Y
  };

  // Load land images and settings when polygons change
  useEffect(() => {
    const loadLandImagesAndSettings = async () => {
      const images: Record<string, string> = {};
      const settings: Record<string, LandImageSettings> = {};
      
      for (const polygonData of polygonsToRender) {
        if (polygonData.polygon && polygonData.polygon.id) {
          const imageUrl = await landService.getLandImageUrl(polygonData.polygon.id);
          if (imageUrl) {
            images[polygonData.polygon.id] = imageUrl;
          }
          
          // Load image settings if available
          if (polygonData.polygon.imageSettings) {
            console.log(`Loaded image settings for ${polygonData.polygon.id}:`, polygonData.polygon.imageSettings);
            settings[polygonData.polygon.id] = polygonData.polygon.imageSettings;
          }
        }
      }
      
      setLandImages(images);
      // Merge newSettingsFromFile with existing imageSettings.
      // If in editMode and a specific land is selected, preserve its current settings from state
      // to avoid clobbering optimistic updates made by handleResize or handleDrag.
      setImageSettings(prevSettings => {
        const mergedSettings = { ...settings }; // Start with settings from polygon props
        if (editMode && selectedLandId && prevSettings[selectedLandId]) {
          // If editing a land, its current state (potentially with unsaved changes) takes precedence
          mergedSettings[selectedLandId] = prevSettings[selectedLandId];
        }
        return mergedSettings;
      });
    };
    
    if (isVisible && polygonsToRender.length > 0) {
      loadLandImagesAndSettings();
    }
  }, [isVisible, polygonsToRender, editMode, selectedLandId]);

  const handleMouseEnter = useCallback((polygon: any) => {
    if (!polygon || !polygon.id || editMode) return;
    
    setHoveredPolygonId(polygon.id);
    hoverStateService.setHoverState('polygon', polygon.id, polygon);
  }, [editMode]);

  const handleMouseLeave = useCallback(() => {
    if (editMode) return;
    
    setHoveredPolygonId(null);
    hoverStateService.clearHoverState();
  }, [editMode]);

  const handleClick = useCallback((polygon: any) => {
    if (!polygon || !polygon.id) return;
    
    if (editMode) {
      setSelectedLandId(selectedLandId === polygon.id ? null : polygon.id);
    } else {
      console.log('Land clicked:', polygon);
      eventBus.emit(EventTypes.POLYGON_SELECTED, { 
        polygonId: polygon.id, 
        polygonData: polygon 
      });
    }
  }, [editMode, selectedLandId]);

  const toggleEditMode = useCallback(() => {
    setEditMode(!editMode);
    setSelectedLandId(null);
  }, [editMode]);

  const handleDragStart = useCallback((e: React.MouseEvent, polygonId: string, centerX: number, centerY: number) => {
    if (!editMode || selectedLandId !== polygonId) return;
    
    e.preventDefault(); // Empêcher le comportement par défaut
    e.stopPropagation(); // Empêcher la propagation aux éléments parents
    setIsDragging(true);
    
    const polyData = polygonsToRender.find(p => p.polygon.id === polygonId);
    if (!polyData) {
      console.error("Polygon data not found for drag start:", polygonId);
      setIsDragging(false);
      return;
    }

    const pWorldMapCenterX = polyData.polygonWorldMapCenterX;
    const pWorldMapCenterY = polyData.polygonWorldMapCenterY;
    const currentSettings = imageSettings[polygonId];
    
    let initialScreenX, initialScreenY;

    if (currentSettings && typeof currentSettings.x === 'number' && typeof currentSettings.y === 'number' && typeof pWorldMapCenterX === 'number' && typeof pWorldMapCenterY === 'number') {
      // settings.x and .y are world offsets
      const markerMapWorldX = pWorldMapCenterX + currentSettings.x;
      const markerMapWorldY = pWorldMapCenterY + currentSettings.y;
      initialScreenX = worldToScreenX(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
      initialScreenY = worldToScreenY(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
    } else {
      // Fallback to polygon's screen center (passed as centerX, centerY to this handler)
      initialScreenX = centerX;
      initialScreenY = centerY;
      if (typeof pWorldMapCenterX !== 'number' || typeof pWorldMapCenterY !== 'number') {
        console.warn(`DragStart: Missing world center for ${polygonId}. Custom position may not work correctly if saved.`);
      }
    }
    
    positionRef.current = { x: initialScreenX, y: initialScreenY };
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    console.log(`Drag start for ${polygonId} at screen position:`, positionRef.current, "world center:", {pWorldMapCenterX, pWorldMapCenterY});
  }, [editMode, selectedLandId, imageSettings, polygonsToRender, scale, mapTransformOffset, canvasWidth, canvasHeight]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedLandId) return;
    
    e.preventDefault(); // Empêcher le comportement par défaut
    e.stopPropagation(); // Empêcher la propagation aux éléments parents
    
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    const newX = positionRef.current.x + dx;
    const newY = positionRef.current.y + dy;
    
    console.log(`Dragging to: ${newX}, ${newY}`);
    
    // Get existing settings or create defaults
    const existingSettings = imageSettings[selectedLandId] || {};
    const width = existingSettings.width || 75 * scale; // This is the base width or default base * current scale
    const height = existingSettings.height || 75 * scale; // This is the base height or default base * current scale
    
    // Calculate display width/height for DOM update, consistent with main render logic
    let displayWidth, displayHeight;
    const sDrag = imageSettings[selectedLandId] || {};

    if (sDrag.referenceScale && sDrag.width !== undefined && sDrag.height !== undefined) {
        const scaleFactor = scale / sDrag.referenceScale;
        displayWidth = sDrag.width * scaleFactor;
        displayHeight = sDrag.height * scaleFactor;
    } else {
        // If no referenceScale, or width/height are undefined in settings,
        // use sDrag.width (if defined, assumed to be screen pixels) or default to (75 * scale)
        displayWidth = sDrag.width !== undefined ? sDrag.width : (75 * scale);
        displayHeight = sDrag.height !== undefined ? sDrag.height : (75 * scale);
    }

    // Mettre à jour le DOM directement pour un glissement fluide
    const landElement = document.querySelector(`[data-land-id="${selectedLandId}"]`);
    if (landElement) {
      const styleString = `
        position: absolute;
        left: ${newX}px;
        top: ${newY}px;
        width: ${displayWidth}px;
        height: ${displayHeight}px;
        z-index: 15;
        transform: translate(-50%, -50%);
        border: 2px dashed red;
        opacity: 0.9;
        cursor: move;
        pointer-events: auto;
        background: rgba(255, 255, 255, 0.1);
        box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
        touch-action: none;
      `;
      
      landElement.setAttribute('style', styleString);
    }
    
    // Mettre à jour l'état immédiatement pour un meilleur suivi
    const polyData = polygonsToRender.find(p => p.polygon.id === selectedLandId);
    if (polyData && typeof polyData.polygonWorldMapCenterX === 'number' && typeof polyData.polygonWorldMapCenterY === 'number') {
      const pWorldMapCenterX = polyData.polygonWorldMapCenterX;
      const pWorldMapCenterY = polyData.polygonWorldMapCenterY;

      const markerMapWorldX = screenToWorldX(newX, newY, scale, mapTransformOffset, canvasWidth, canvasHeight);
      const markerMapWorldY = screenToWorldY(newX, newY, scale, mapTransformOffset, canvasWidth, canvasHeight);

      const mapWorldOffsetX = markerMapWorldX - pWorldMapCenterX;
      const mapWorldOffsetY = markerMapWorldY - pWorldMapCenterY;
      
      setImageSettings(prev => ({
        ...prev,
        [selectedLandId]: {
          // ...currentSettings, // Spread current settings to preserve any other fields
          width: baseWidthToStore,    // Store base width
          height: baseHeightToStore,   // Store base height
          referenceScale: refScaleToStore, // Store reference scale
          x: mapWorldOffsetX,         // Store new world offset X
          y: mapWorldOffsetY          // Store new world offset Y
        }
      }));
    } else {
      console.warn(`Cannot update imageSettings for ${selectedLandId}: missing polygon world center data.`);
      // Fallback: store screen coordinates if world center is not available.
      // Also store base width/height and ref scale with defaults.
      setImageSettings(prev => ({
        ...prev,
        [selectedLandId]: {
          // ...currentSettings,
          width: baseWidthToStore,
          height: baseHeightToStore,
          referenceScale: refScaleToStore,
          x: newX, // Storing screenX as fallback for position
          y: newY  // Storing screenY as fallback for position
        }
      }));
    }
    
    // dragStartRef.current should hold the initial mouse position for the entire drag operation
    // when using positionRef for the initial element position.
    // dragStartRef.current = { x: e.clientX, y: e.clientY }; 
  }, [isDragging, selectedLandId, scale, imageSettings, polygonsToRender, mapTransformOffset, canvasWidth, canvasHeight]);

  const handleDragEnd = useCallback(() => {
    if (isDragging && selectedLandId) {
      setIsDragging(false);
      
      // Récupérer les paramètres actuels
      const settings = imageSettings[selectedLandId];
      if (settings) {
        // Save the settings to the server
        landService.saveImageSettings(selectedLandId, settings)
          .then(success => {
            if (success) {
              console.log(`Saved image settings for ${selectedLandId}`);
            } else {
              console.error(`Failed to save image settings for ${selectedLandId}`);
            }
          });
      }
    }
  }, [isDragging, selectedLandId, imageSettings]);

  const handleResize = useCallback((e: any, direction: any, ref: any, d: any, polygonId: string) => {
    if (!editMode || selectedLandId !== polygonId) return;
    
    const width = parseInt(ref.style.width, 10);
    const height = parseInt(ref.style.height, 10);
    
    // Get current position from existing settings (which are world offsets)
    const existingSettings = imageSettings[polygonId] || {};
    // x and y are world offsets, they don't change on resize.
    // If they are not set (e.g. first time), they will be undefined here.
    // When saved, if x or y are undefined, saveImageSettings might need a default (e.g. 0 for offset).
    // Or, ensure x and y are initialized to 0 if not present in existingSettings.
    const x = existingSettings.x || 0; // Default to 0 if no world offset x exists
    const y = existingSettings.y || 0; // Default to 0 if no world offset y exists
    
    // Store current scale with the settings for future reference
    const updatedSettings = {
      ...existingSettings, // Keep other potential fields
      width,
      height,
      referenceScale: scale,
      x, // Keep existing world offset x
      y  // Keep existing world offset y
    };
    
    setImageSettings(prev => ({
      ...prev,
      [polygonId]: updatedSettings
    }));
    
    // Save the settings to the server
    landService.saveImageSettings(polygonId, updatedSettings)
    .then(success => {
      if (success) {
        console.log(`Saved resized image settings for ${polygonId}`);
      } else {
        console.error(`Failed to save resized image settings for ${polygonId}`);
      }
    });
  }, [editMode, selectedLandId, imageSettings, scale]);

  // Set up global mouse event listeners for drag
  useEffect(() => {
    // Définir les gestionnaires d'événements
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && selectedLandId) {
        e.preventDefault(); // Empêcher le comportement par défaut
        handleDrag(e);
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging && selectedLandId) {
        e.preventDefault(); // Empêcher le comportement par défaut
        handleDragEnd();
      }
    };
    
    // Désactiver le comportement de glisser-déposer natif du navigateur
    const preventDragStart = (e: DragEvent) => {
      if (isDragging) {
        e.preventDefault();
      }
    };
    
    // Ajouter les écouteurs d'événements si en mode édition
    if (editMode) {
      window.addEventListener('mousemove', handleMouseMove, { capture: true });
      window.addEventListener('mouseup', handleMouseUp, { capture: true });
      window.addEventListener('dragstart', preventDragStart, { capture: true });
    }
    
    // Nettoyer les écouteurs d'événements
    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
      window.removeEventListener('dragstart', preventDragStart, { capture: true });
    };
  }, [editMode, isDragging, selectedLandId, handleDrag, handleDragEnd]);

  // Effect to update positions when map is transformed
  useEffect(() => {
    const handleMapTransform = (event: CustomEvent) => {
      if (event.detail && event.detail.offset) {
        // Ne pas forcer de re-render pendant le glissement
        if (!isDragging) {
          // Force re-render when map is transformed
          setImageSettings(prev => {
            // Create a new object to trigger re-render
            return {...prev};
          });
        }
      }
    };
    
    window.addEventListener('mapTransformed', handleMapTransform as EventListener);
    
    return () => {
      window.removeEventListener('mapTransformed', handleMapTransform as EventListener);
    };
  }, [isDragging]);

  // If the component is not visible, don't render anything
  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Edit Mode Toggle Button */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
        <button
          onClick={toggleEditMode}
          className={`px-4 py-2 rounded-lg shadow-lg font-medium transition-colors ${
            editMode 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {editMode ? 'Exit Land Edit Mode' : 'Edit Land Markers'}
        </button>
        
        {editMode && (
          <div className="mt-2 bg-black/70 text-white p-2 rounded text-sm text-center">
            <p>Cliquez sur une terre pour la sélectionner</p>
            <p>Utilisez les poignées pour redimensionner</p>
            <p>Glissez-déposez pour repositionner</p>
          </div>
        )}
      </div>

      {/* Land Markers */}
      {polygonsToRender.map((polygonData) => {
        const polygon = polygonData.polygon;
        if (!polygon || !polygon.id || !landImages[polygon.id]) return null;

        const isHovered = hoveredPolygonId === polygon.id;
        const isSelected = selectedLandId === polygon.id;
        const imageUrl = landImages[polygon.id];
        
        // Apply night effect if needed
        const opacity = isNight ? 0.5 : 0.7; // Reduce opacity at night
        
        // Highlight land with public dock in transport view
        const hasDock = polygonData.hasPublicDock && activeView === 'transport';
        
        // Get custom settings or use defaults
        const settings = imageSettings[polygon.id];
        
        let width, height;
        
        if (settings && settings.width !== undefined && settings.height !== undefined) {
          const baseWidth = settings.width;
          const baseHeight = settings.height;
          if (settings.referenceScale) {
            const scaleFactor = scale / settings.referenceScale;
            width = baseWidth * scaleFactor;
            height = baseHeight * scaleFactor;
          } else {
            // If no referenceScale, but width/height are defined, assume they are screen pixel values
            // OR they are base values that should be scaled by current map scale.
            // To match the drag logic, let's assume:
            // if settings.width is defined, it's used as is (screen pixels). Otherwise, 75 * scale.
            width = settings.width; // Use as is if defined
            height = settings.height; // Use as is if defined
            // The || 75 * scale was in the original, let's re-evaluate.
            // The most consistent is: settings.width/height are ALWAYS base.
            // If referenceScale is missing, it implies it was the scale at which these base values were set.
            // For now, to match the refined drag logic:
            // width = settings.width !== undefined ? settings.width : (75 * scale);
            // height = settings.height !== undefined ? settings.height : (75 * scale);
            // Let's use the version that assumes settings.width/height are base and scale by current `scale` if no refScale
            width = baseWidth * scale;
            height = baseHeight * scale;
          }
        } else {
          // Default values if no settings or settings are incomplete
          width = 75 * scale;
          height = 75 * scale;
        }

        // Correction based on the refined logic for displayWidth/displayHeight in handleDrag:
        // This should exactly mirror that logic.
        if (settings) {
            if (settings.referenceScale && settings.width !== undefined && settings.height !== undefined) {
                const scaleFactor = scale / settings.referenceScale;
                width = settings.width * scaleFactor;
                height = settings.height * scaleFactor;
            } else { // No referenceScale, or width/height are undefined in settings
                width = (settings.width !== undefined ? settings.width : 75 * scale);
                height = (settings.height !== undefined ? settings.height : 75 * scale);
            }
        } else {
            width = 75 * scale;
            height = 75 * scale;
        }
        
        // Screen coordinates of the polygon's center
        const pScreenCenterX = polygonData.centerX;
        const pScreenCenterY = polygonData.centerY;
        
        let finalX, finalY;

        // Check if world map center coordinates are available for this polygon
        if (typeof polygonData.polygonWorldMapCenterX === 'number' && typeof polygonData.polygonWorldMapCenterY === 'number') {
          const pWorldMapCenterX = polygonData.polygonWorldMapCenterX;
          const pWorldMapCenterY = polygonData.polygonWorldMapCenterY;

          if (settings && typeof settings.x === 'number' && typeof settings.y === 'number') {
            // settings.x and .y are world offsets
            const markerMapWorldX = pWorldMapCenterX + settings.x;
            const markerMapWorldY = pWorldMapCenterY + settings.y;
            finalX = worldToScreenX(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
            finalY = worldToScreenY(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
          } else {
            // No custom settings, use polygon's screen center
            finalX = pScreenCenterX;
            finalY = pScreenCenterY;
          }
        } else {
          // Fallback if world map center is not available (e.g., polygon.center was missing in source data)
          // In this case, custom positioning won't work correctly with map transforms.
          // Use screen center, and if settings.x/y exist, they might be screen coords (old data) or invalid.
          // For simplicity, just use screen center. A warning will be logged during drag if this happens.
          finalX = pScreenCenterX;
          finalY = pScreenCenterY;
          if (settings && (typeof settings.x === 'number' || typeof settings.y === 'number')) {
             console.warn(`LandMarker ${polygon.id}: Missing world center. Custom position from settings may be incorrect.`);
          }
        }
        
        if (editMode) {
          // In edit mode, use Resizable component
          return (
            <Resizable
              key={polygon.id}
              data-land-id={polygon.id}
              className={`absolute ${isSelected ? 'cursor-move' : 'cursor-pointer'}`}
              size={{ width, height }}
              style={{
                position: 'absolute',
                left: `${finalX}px`,
                top: `${finalY}px`,
                zIndex: isSelected ? 15 : (isHovered ? 12 : 10),
                transform: 'translate(-50%, -50%)',
                border: isSelected 
                  ? '2px dashed red' 
                  : (hasDock ? '2px solid rgba(255, 165, 0, 0.7)' : 'none'),
                opacity: isSelected ? 0.9 : (isHovered ? opacity + 0.1 : opacity),
                pointerEvents: 'auto',
                background: 'rgba(255, 255, 255, 0.1)',
                boxShadow: isSelected ? '0 0 10px rgba(255, 0, 0, 0.5)' : 'none',
                touchAction: 'none' // Empêche le comportement de défilement par défaut sur les appareils tactiles
              }}
              onMouseDown={(e) => {
                e.preventDefault(); // Empêcher le comportement par défaut
                e.stopPropagation(); // Empêcher la propagation aux éléments parents
                handleDragStart(e, polygon.id, polygonData.centerX, polygonData.centerY);
              }}
              draggable={false} // Désactiver le comportement de glisser-déposer natif du navigateur
              onClick={() => handleClick(polygon)}
              onMouseEnter={() => handleMouseEnter(polygon)}
              onMouseLeave={handleMouseLeave}
              onResizeStop={(e, direction, ref, d) => handleResize(e, direction, ref, d, polygon.id)}
              enable={{
                top: isSelected,
                right: isSelected,
                bottom: isSelected,
                left: isSelected,
                topRight: isSelected,
                bottomRight: isSelected,
                bottomLeft: isSelected,
                topLeft: isSelected
              }}
              handleStyles={{
                topRight: { 
                  right: '-8px', 
                  top: '-8px', 
                  cursor: 'ne-resize',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  border: '2px solid red',
                  borderRadius: '50%',
                  zIndex: 20
                },
                bottomRight: { 
                  right: '-8px', 
                  bottom: '-8px', 
                  cursor: 'se-resize',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  border: '2px solid red',
                  borderRadius: '50%',
                  zIndex: 20
                },
                bottomLeft: { 
                  left: '-8px', 
                  bottom: '-8px', 
                  cursor: 'sw-resize',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  border: '2px solid red',
                  borderRadius: '50%',
                  zIndex: 20
                },
                topLeft: { 
                  left: '-8px', 
                  top: '-8px', 
                  cursor: 'nw-resize',
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  border: '2px solid red',
                  borderRadius: '50%',
                  zIndex: 20
                }
              }}
              handleComponent={{
                right: <div className="h-full w-2 bg-red-500 opacity-70 hover:opacity-100 transition-opacity" />,
                left: <div className="h-full w-2 bg-red-500 opacity-70 hover:opacity-100 transition-opacity" />,
                top: <div className="h-2 w-full bg-red-500 opacity-70 hover:opacity-100 transition-opacity" />,
                bottom: <div className="h-2 w-full bg-red-500 opacity-70 hover:opacity-100 transition-opacity" />
              }}
            >
              <div className="relative w-full h-full">
                <img
                  src={imageUrl}
                  alt={polygon.historicalName || polygon.id}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: isNight ? 'brightness(0.7) saturate(0.8)' : 'none',
                    pointerEvents: 'none'
                  }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                {isSelected && (
                  <>
                    <div className="absolute top-0 left-0 bg-black/70 text-white text-xs p-1 rounded">
                      {polygon.historicalName || polygon.id}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs p-1 rounded">
                      {Math.round(width)}×{Math.round(height)}
                    </div>
                  </>
                )}
              </div>
            </Resizable>
          );
        } else {
          // In normal mode, use regular div
          return (
            <div
              key={polygon.id}
              className="absolute"
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                left: `${finalX}px`,
                top: `${finalY}px`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: isHovered ? 12 : 10,
                transition: 'transform 0.1s ease-out, opacity 0.2s ease-out',
                transform: `translate(-50%, -50%) scale(${isHovered ? 1.05 : 1})`,
                left: `${finalX}px`,
                top: `${finalY}px`,
                cursor: 'default',
                opacity: isHovered ? opacity + 0.1 : opacity,
                border: hasDock ? '2px solid rgba(255, 165, 0, 0.7)' : 'none',
              }}
              title={polygon.historicalName || polygon.id}
            >
              <img
                src={imageUrl}
                alt={polygon.historicalName || polygon.id}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: isNight ? 'brightness(0.7) saturate(0.8)' : 'none',
                }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          );
        }
      })}
    </div>
  );
}
