import { useState, useEffect, useCallback, useRef, MouseEvent as ReactMouseEvent } from 'react';
import { landService } from '@/lib/services/LandService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

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
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const operationStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    elementX: number;
    elementY: number;
    width: number;
    height: number;
    worldOffsetX?: number;
    worldOffsetY?: number;
    baseWidth?: number;
    baseHeight?: number;
    referenceScale?: number;
  } | null>(null);
  const dragStartRef = useRef<{x: number, y: number}>({ x: 0, y: 0 }); // For original drag logic
  const positionRef = useRef<{x: number, y: number}>({ x: 0, y: 0 }); // For original drag logic

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

  const handleDragStart = useCallback((e: ReactMouseEvent<HTMLDivElement>, polygonId: string, centerX: number, centerY: number) => {
    if (!editMode || selectedLandId !== polygonId || isResizing) return; // Do not start drag if resizing
    
    e.preventDefault();
    e.stopPropagation();
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
  }, [editMode, selectedLandId, imageSettings, polygonsToRender, scale, mapTransformOffset, canvasWidth, canvasHeight, isResizing]);

  const handleResizeStart = useCallback((e: ReactMouseEvent<HTMLDivElement>, handleName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editMode || !selectedLandId) return;

    setIsResizing(true);
    setActiveHandle(handleName);

    const landElement = document.querySelector(`[data-land-id="${selectedLandId}"]`) as HTMLElement;
    if (!landElement) return;

    const rect = landElement.getBoundingClientRect();
    const currentSettings = imageSettings[selectedLandId] || {};
    
    // finalX, finalY, width, height are screen values at current scale
    // Need to calculate them as they are in the render function
    const polygonData = polygonsToRender.find(p => p.polygon.id === selectedLandId);
    if (!polygonData) return;

    let currentScreenX, currentScreenY, currentScreenWidth, currentScreenHeight;

    if (typeof polygonData.polygonWorldMapCenterX === 'number' && typeof polygonData.polygonWorldMapCenterY === 'number') {
      const pWorldMapCenterX = polygonData.polygonWorldMapCenterX;
      const pWorldMapCenterY = polygonData.polygonWorldMapCenterY;
      if (currentSettings && typeof currentSettings.x === 'number' && typeof currentSettings.y === 'number') {
        const markerMapWorldX = pWorldMapCenterX + currentSettings.x;
        const markerMapWorldY = pWorldMapCenterY + currentSettings.y;
        currentScreenX = worldToScreenX(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
        currentScreenY = worldToScreenY(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
      } else {
        currentScreenX = polygonData.centerX;
        currentScreenY = polygonData.centerY;
      }
    } else {
      currentScreenX = polygonData.centerX;
      currentScreenY = polygonData.centerY;
    }
    
    if (currentSettings.referenceScale && currentSettings.width !== undefined && currentSettings.height !== undefined) {
        const scaleFactor = scale / currentSettings.referenceScale;
        currentScreenWidth = currentSettings.width * scaleFactor;
        currentScreenHeight = currentSettings.height * scaleFactor;
    } else {
        currentScreenWidth = (currentSettings.width !== undefined ? currentSettings.width : 75 * scale);
        currentScreenHeight = (currentSettings.height !== undefined ? currentSettings.height : 75 * scale);
    }

    operationStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elementX: currentScreenX - currentScreenWidth / 2, // Assuming translate(-50%, -50%)
      elementY: currentScreenY - currentScreenHeight / 2, // Assuming translate(-50%, -50%)
      width: currentScreenWidth,
      height: currentScreenHeight,
      worldOffsetX: currentSettings.x, // world offset
      worldOffsetY: currentSettings.y, // world offset
      baseWidth: currentSettings.width, // base width
      baseHeight: currentSettings.height, // base height
      referenceScale: currentSettings.referenceScale,
    };

  }, [editMode, selectedLandId, imageSettings, scale, mapTransformOffset, canvasWidth, canvasHeight, polygonsToRender]);


  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedLandId) return;
    
    e.preventDefault(); 
    e.stopPropagation(); 
    
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
    // The state update for imageSettings should store BASE width/height and referenceScale.
    const polyData = polygonsToRender.find(p => p.polygon.id === selectedLandId);
    
    const currentSettings = imageSettings[selectedLandId] || {};
    // Determine base width/height and reference scale to store in state.
    // These should not change during a drag, only x and y (world offsets) change.
    // If currentSettings are empty, initialize with defaults.
    const baseWidthToStore = currentSettings.width !== undefined ? currentSettings.width : 75;
    const baseHeightToStore = currentSettings.height !== undefined ? currentSettings.height : 75;
    const refScaleToStore = currentSettings.referenceScale !== undefined ? currentSettings.referenceScale : scale;
    if (polyData && typeof polyData.polygonWorldMapCenterX === 'number' && typeof polyData.polygonWorldMapCenterY === 'number') {
      const pWorldMapCenterX = polyData.polygonWorldMapCenterX;
      const pWorldMapCenterY = polyData.polygonWorldMapCenterY;

      // Conversion pour X (inchangée et correcte)
      const markerMapWorldX_drag = screenToWorldX(newX, newY, scale, mapTransformOffset, canvasWidth, canvasHeight); // newY n'est pas utilisé par screenToWorldX pour le calcul de X monde
      const markerMapWorldY_drag = screenToWorldY(newX, newY, scale, mapTransformOffset, canvasWidth, canvasHeight); // newX n'est pas utilisé par screenToWorldY pour le calcul de Y monde

      const mapWorldOffsetX = markerMapWorldX_drag - pWorldMapCenterX;
      const mapWorldOffsetY = markerMapWorldY_drag - pWorldMapCenterY;
      
      setImageSettings(prev => ({
        ...prev,
        [selectedLandId]: {
          // ...currentSettings, // Spread current settings to preserve any other fields
          width: baseWidthToStore,    // Store base width
          height: baseHeightToStore,   // Store base height
          referenceScale: refScaleToStore, // Store reference scale
          x: mapWorldOffsetX,         // Store new world offset X
          y: mapWorldOffsetY          // Store new world offset Y (revenu à la logique originale)
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


  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing && activeHandle && operationStartRef.current && selectedLandId) {
      e.preventDefault();
      e.stopPropagation();

      const { mouseX, mouseY, elementX, elementY, width, height } = operationStartRef.current;
      const deltaX = e.clientX - mouseX;
      const deltaY = e.clientY - mouseY;

      let newX = elementX;
      let newY = elementY;
      let newWidth = width;
      let newHeight = height;

      // Apply resizing logic based on the active handle
      if (activeHandle.includes('left')) {
        newWidth = width - deltaX;
        newX = elementX + deltaX;
      }
      if (activeHandle.includes('right')) {
        newWidth = width + deltaX;
      }
      if (activeHandle.includes('top')) {
        newHeight = height - deltaY;
        newY = elementY + deltaY;
      }
      if (activeHandle.includes('bottom')) {
        newHeight = height + deltaY;
      }

      // Ensure minimum size
      newWidth = Math.max(newWidth, 20); // Min width 20px
      newHeight = Math.max(newHeight, 20); // Min height 20px
      
      // If width/height changed from top/left, adjust X/Y so the opposite side stays put
      if (activeHandle.includes('left') && newWidth < 20) newX = elementX + width - 20;
      if (activeHandle.includes('top') && newHeight < 20) newY = elementY + height - 20;


      const landElement = document.querySelector(`[data-land-id="${selectedLandId}"]`) as HTMLElement;
      if (landElement) {
        landElement.style.width = `${newWidth}px`;
        landElement.style.height = `${newHeight}px`;
        landElement.style.left = `${newX + newWidth / 2}px`; // Center X
        landElement.style.top = `${newY + newHeight / 2}px`;  // Center Y
      }
      
      // Update imageSettings state
      const polyData = polygonsToRender.find(p => p.polygon.id === selectedLandId);
      if (!polyData || typeof polyData.polygonWorldMapCenterX !== 'number' || typeof polyData.polygonWorldMapCenterY !== 'number') {
        console.warn("Cannot update imageSettings during resize: missing polygon world center data.");
        return;
      }
      const pWorldMapCenterX = polyData.polygonWorldMapCenterX;
      const pWorldMapCenterY = polyData.polygonWorldMapCenterY;

      // New screen center after resize
      const newScreenCenterX = newX + newWidth / 2;
      const newScreenCenterY = newY + newHeight / 2;

      const markerMapWorldX = screenToWorldX(newScreenCenterX, newScreenCenterY, scale, mapTransformOffset, canvasWidth, canvasHeight);
      const markerMapWorldY = screenToWorldY(newScreenCenterX, newScreenCenterY, scale, mapTransformOffset, canvasWidth, canvasHeight);

      const mapWorldOffsetX = markerMapWorldX - pWorldMapCenterX;
      const mapWorldOffsetY = markerMapWorldY - pWorldMapCenterY;
      
      const baseWidthToStore = newWidth; // Screen width at current scale
      const baseHeightToStore = newHeight; // Screen height at current scale
      const refScaleToStore = scale; // Current map scale is the reference

      setImageSettings(prev => ({
        ...prev,
        [selectedLandId]: {
          ...prev[selectedLandId],
          width: baseWidthToStore,
          height: baseHeightToStore,
          referenceScale: refScaleToStore,
          x: mapWorldOffsetX,
          y: mapWorldOffsetY,
        }
      }));

    } else if (isDragging) {
      handleDrag(e); // Call original drag handler
    }
  }, [isResizing, activeHandle, selectedLandId, scale, imageSettings, polygonsToRender, mapTransformOffset, canvasWidth, canvasHeight, handleDrag, isDragging]);

  const handleGlobalMouseUp = useCallback(() => {
    if (isDragging && selectedLandId) {
      setIsDragging(false);
      const settings = imageSettings[selectedLandId];
      if (settings) {
        landService.saveImageSettings(selectedLandId, settings)
          .then(success => {
            console.log(success ? `Saved dragged settings for ${selectedLandId}` : `Failed to save dragged settings for ${selectedLandId}`);
            if (success) {
              eventBus.emit(EventTypes.LAND_MARKER_SETTINGS_UPDATED, { polygonId: selectedLandId, settings });
            }
          });
      }
    }

    if (isResizing && selectedLandId) {
      setIsResizing(false);
      setActiveHandle(null);
      operationStartRef.current = null;
      const settings = imageSettings[selectedLandId];
      if (settings) {
        landService.saveImageSettings(selectedLandId, settings)
          .then(success => {
            console.log(success ? `Saved resized settings for ${selectedLandId}` : `Failed to save resized settings for ${selectedLandId}`);
            if (success) {
              eventBus.emit(EventTypes.LAND_MARKER_SETTINGS_UPDATED, { polygonId: selectedLandId, settings });
            }
          });
      }
    }
  }, [isDragging, isResizing, selectedLandId, imageSettings]);

  // const handleResize = useCallback((e: any, direction: any, ref: any, d: any, polygonId: string) => {
    // This function is removed as we are implementing custom resize.
  // }, [editMode, selectedLandId, imageSettings, scale]);

  // Set up global mouse event listeners for drag AND RESIZE
  useEffect(() => {
    // Définir les gestionnaires d'événements
    // const handleMouseMove = (e: MouseEvent) => { // Replaced by handleGlobalMouseMove
    //   if (isDragging && selectedLandId) {
    //     e.preventDefault(); // Empêcher le comportement par défaut
    //     handleDrag(e);
    //   }
    // };
    
    // const handleMouseUp = (e: MouseEvent) => { // Replaced by handleGlobalMouseUp
    //   if (isDragging && selectedLandId) {
    //     e.preventDefault(); // Empêcher le comportement par défaut
    //     handleDragEnd();
    //   }
    // };
    
    // Désactiver le comportement de glisser-déposer natif du navigateur
    const preventDragStartNative = (e: DragEvent) => {
      if (isDragging || isResizing) { // Also prevent for resizing
        e.preventDefault();
      }
    };
    
    // Ajouter les écouteurs d'événements si en mode édition
    if (editMode) {
      window.addEventListener('mousemove', handleGlobalMouseMove, { capture: true });
      window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });
      window.addEventListener('dragstart', preventDragStartNative, { capture: true });
    }
    
    // Nettoyer les écouteurs d'événements
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true });
      window.removeEventListener('dragstart', preventDragStartNative, { capture: true });
    };
  }, [editMode, isDragging, isResizing, selectedLandId, handleGlobalMouseMove, handleGlobalMouseUp]); // Added isResizing and new handlers

  // Effect to update positions when map is transformed
  useEffect(() => {
    const handleMapTransform = (event: CustomEvent) => {
      if (event.detail && event.detail.offset) {
        // Ne pas forcer de re-render pendant le glissement ou redimensionnement
        if (!isDragging && !isResizing) {
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
  }, [isDragging, isResizing]); // Added isResizing

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
            if (settings.width !== undefined && settings.height !== undefined) {
                if (settings.referenceScale) { // If referenceScale is present, use it
                    const scaleFactor = scale / settings.referenceScale;
                    width = settings.width * scaleFactor;
                    height = settings.height * scaleFactor;
                } else {
                    // If no referenceScale, assume settings.width/height are base dimensions
                    // and scale them by the current map scale.
                    width = settings.width * scale;
                    height = settings.height * scale;
                }
            } else { // settings.width or settings.height are undefined
                width = 75 * scale; // Default base size * current map scale
                height = 75 * scale; // Default base size * current map scale
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
            // La coordonnée Y du monde pour le marqueur est toujours pWorldMapCenterY + settings.y
            const markerMapWorldY = pWorldMapCenterY + settings.y;

            // Pour X, la logique reste la même, car settings.x est un décalage du monde mis à l'échelle par 'scale'.
            // worldToScreenX n'utilise pas son argument mapWorldY, donc on peut passer markerMapWorldY ou pWorldMapCenterY.
            finalX = worldToScreenX(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);

            // Pour X, la logique reste la même, car settings.x est un décalage du monde mis à l'échelle par 'scale'.
            // worldToScreenX n'utilise pas son argument mapWorldY pour le calcul de la coordonnée X écran.
            finalX = worldToScreenX(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);

            // Pour Y, la contribution de settings.y est maintenant également mise à l'échelle par 'scale',
            // en utilisant la coordonnée Y du monde absolue du marqueur.
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
          // In edit mode, use a standard div with custom drag/resize handles
          const handleSize = 16; // Size of the square handles
          const handleOffset = - (handleSize / 2);
          const resizeHandles = [
            { name: 'top-left', cursor: 'nwse-resize', style: { top: `${handleOffset}px`, left: `${handleOffset}px` } },
            { name: 'top', cursor: 'ns-resize', style: { top: `${handleOffset}px`, left: `calc(50% - ${handleSize/2}px)` } },
            { name: 'top-right', cursor: 'nesw-resize', style: { top: `${handleOffset}px`, right: `${handleOffset}px` } },
            { name: 'left', cursor: 'ew-resize', style: { top: `calc(50% - ${handleSize/2}px)`, left: `${handleOffset}px` } },
            { name: 'right', cursor: 'ew-resize', style: { top: `calc(50% - ${handleSize/2}px)`, right: `${handleOffset}px` } },
            { name: 'bottom-left', cursor: 'nesw-resize', style: { bottom: `${handleOffset}px`, left: `${handleOffset}px` } },
            { name: 'bottom', cursor: 'ns-resize', style: { bottom: `${handleOffset}px`, left: `calc(50% - ${handleSize/2}px)` } },
            { name: 'bottom-right', cursor: 'nwse-resize', style: { bottom: `${handleOffset}px`, right: `${handleOffset}px` } },
          ];

          return (
            <div
              key={polygon.id}
              data-land-id={polygon.id}
              className={`absolute ${isSelected && !isResizing ? 'cursor-move' : 'cursor-pointer'}`}
              style={{
                position: 'absolute',
                left: `${finalX}px`,
                top: `${finalY}px`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: isSelected ? 15 : (isHovered ? 12 : 10),
                transform: 'translate(-50%, -50%)',
                border: isSelected 
                  ? '2px dashed red' 
                  : (hasDock ? '2px solid rgba(255, 165, 0, 0.7)' : 'none'),
                opacity: isSelected ? 0.9 : (isHovered ? opacity + 0.1 : opacity),
                pointerEvents: 'auto', // Make sure it can receive mouse events
                background: 'rgba(255, 255, 255, 0.1)', // Slight background for visibility
                boxShadow: isSelected ? '0 0 10px rgba(255, 0, 0, 0.5)' : 'none',
                touchAction: 'none'
              }}
              onMouseDown={(e) => {
                if (isSelected) { // Only allow drag if selected
                  handleDragStart(e, polygon.id, polygonData.centerX, polygonData.centerY);
                }
              }}
              onClick={(e) => {
                // Prevent click from propagating if dragging or resizing
                if (isDragging || isResizing) {
                  e.stopPropagation();
                  return;
                }
                handleClick(polygon);
              }}
              onMouseEnter={() => handleMouseEnter(polygon)}
              onMouseLeave={handleMouseLeave}
            >
              <div className="relative w-full h-full pointer-events-none"> {/* Content wrapper */}
                <img
                  src={imageUrl}
                  alt={polygon.historicalName || polygon.id}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain', // Or 'cover' or 'fill' based on desired behavior
                    filter: isNight ? 'brightness(0.7) saturate(0.8)' : 'none',
                    pointerEvents: 'none' // Image itself should not capture events
                  }}
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                {isSelected && (
                  <>
                    <div className="absolute top-0 left-0 bg-black/70 text-white text-xs p-1 rounded pointer-events-none">
                      {polygon.historicalName || polygon.id}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs p-1 rounded pointer-events-none">
                      {Math.round(width)}×{Math.round(height)}
                    </div>
                  </>
                )}
              </div>

              {/* Custom Resize Handles */}
              {isSelected && editMode && resizeHandles.map(handle => (
                <div
                  key={handle.name}
                  className="absolute bg-white border-2 border-red-500 rounded-full"
                  style={{
                    width: `${handleSize}px`,
                    height: `${handleSize}px`,
                    cursor: handle.cursor,
                    zIndex: 20, // Above the main element
                    ...handle.style
                  }}
                  onMouseDown={(e) => handleResizeStart(e, handle.name)}
                />
              ))}
            </div>
          );
        } else {
          // In normal mode, use regular div (no interaction)
          return (
            <div
              key={polygon.id}
              className="absolute"
              style={{
                pointerEvents: 'none', // No pointer events in normal mode
                position: 'absolute',
                left: `${finalX}px`,
                top: `${finalY}px`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: isHovered ? 12 : 10,
                transition: 'transform 0.1s ease-out, opacity 0.2s ease-out',
                transform: `translate(-50%, -50%) scale(${isHovered ? 1.05 : 1})`,
                // left and top are repeated, remove one set
                cursor: 'default',
                opacity: isHovered ? opacity + 0.1 : opacity,
                border: hasDock ? '2px solid rgba(255, 165, 0, 0.7)' : 'none',
              }}
              title={polygon.historicalName || polygon.id}
              onMouseEnter={() => handleMouseEnter(polygon)} // Still allow hover effects
              onMouseLeave={handleMouseLeave}
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
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
            </div>
          );
        }
      })}
    </div>
  );
}
