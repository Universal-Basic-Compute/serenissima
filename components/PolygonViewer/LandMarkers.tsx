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
    hasPublicDock?: boolean;
  }[];
  isNight: boolean;
  scale: number;
  activeView: string;
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
  activeView
}: LandMarkersProps) {
  const [hoveredPolygonId, setHoveredPolygonId] = useState<string | null>(null);
  const [landImages, setLandImages] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState<boolean>(false);
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
  const [imageSettings, setImageSettings] = useState<Record<string, LandImageSettings>>({});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const positionRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });

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
      setImageSettings(settings);
    };
    
    if (isVisible && polygonsToRender.length > 0) {
      loadLandImagesAndSettings();
    }
  }, [isVisible, polygonsToRender]);

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
    
    e.stopPropagation();
    setIsDragging(true);
    
    dragStartRef.current = { 
      x: e.clientX, 
      y: e.clientY 
    };
    
    // Use current position from settings or default to center
    const currentSettings = imageSettings[polygonId];
    
    // Toujours utiliser la position actuelle du centre du polygone comme point de référence
    // et ajouter l'offset si des paramètres existent
    let posX = centerX;
    let posY = centerY;
    
    // Si nous avons des paramètres, calculer la position absolue actuelle
    if (currentSettings && currentSettings.x !== undefined && currentSettings.y !== undefined) {
      posX = currentSettings.x;
      posY = currentSettings.y;
    }
    
    positionRef.current = { x: posX, y: posY };
    console.log(`Drag start for ${polygonId} at position:`, positionRef.current);
  }, [editMode, selectedLandId, imageSettings]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedLandId) return;
    
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    const newX = positionRef.current.x + dx;
    const newY = positionRef.current.y + dy;
    
    // Find the polygon data for this land
    const polygonData = polygonsToRender.find(p => p.polygon.id === selectedLandId);
    if (!polygonData) return;
    
    // Get existing settings or create defaults
    const existingSettings = imageSettings[selectedLandId] || {};
    const width = existingSettings.width || 75 * scale;
    const height = existingSettings.height || 75 * scale;
    
    // Store the absolute position - we'll calculate the offset when rendering
    setImageSettings(prev => ({
      ...prev,
      [selectedLandId]: {
        ...existingSettings,
        width,
        height,
        referenceScale: scale,
        x: newX,
        y: newY
      }
    }));
    
    // Update drag start position for continuous dragging
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, [isDragging, selectedLandId, scale, imageSettings, polygonsToRender]);

  const handleDragEnd = useCallback(() => {
    if (isDragging && selectedLandId) {
      setIsDragging(false);
      
      // Save the settings to the server
      const settings = imageSettings[selectedLandId];
      if (settings) {
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
    
    // Get current position from existing settings
    const existingSettings = imageSettings[polygonId] || {};
    const x = existingSettings.x || 0;
    const y = existingSettings.y || 0;
    
    // Store current scale with the settings for future reference
    const updatedSettings = {
      ...existingSettings,
      width,
      height,
      referenceScale: scale,
      x,
      y
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
    if (editMode) {
      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging && selectedLandId) {
          handleDrag(e);
        }
      };
      
      const handleMouseUp = () => {
        if (isDragging && selectedLandId) {
          handleDragEnd();
        }
      };
      
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [editMode, isDragging, selectedLandId, handleDrag, handleDragEnd]);

  // Effect to update positions when map is transformed
  useEffect(() => {
    const handleMapTransform = (event: CustomEvent) => {
      if (event.detail && event.detail.offset) {
        // Force re-render when map is transformed
        setImageSettings(prev => {
          // Create a new object to trigger re-render
          return {...prev};
        });
      }
    };
    
    window.addEventListener('mapTransformed', handleMapTransform as EventListener);
    
    return () => {
      window.removeEventListener('mapTransformed', handleMapTransform as EventListener);
    };
  }, []);

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
        
        // If we have settings with a referenceScale, adjust dimensions based on current scale
        let width, height;
        
        if (settings) {
          // If we have settings with a referenceScale, adjust dimensions proportionally
          if (settings.referenceScale) {
            const scaleFactor = scale / settings.referenceScale;
            width = settings.width * scaleFactor;
            height = settings.height * scaleFactor;
          } else {
            width = settings.width || 75 * scale;
            height = settings.height || 75 * scale;
          }
        } else {
          // Default values if no settings
          width = 75 * scale;
          height = 75 * scale;
        }
        
        // Always use the current polygon center position from the map
        // This ensures the marker follows the map as it's transformed
        const posX = polygonData.centerX;
        const posY = polygonData.centerY;
        
        // Always use the current polygon center position
        let finalX = posX;
        let finalY = posY;
        
        if (editMode) {
          // In edit mode, use Resizable component
          return (
            <Resizable
              key={polygon.id}
              className={`absolute ${isSelected ? 'cursor-move' : 'cursor-pointer'}`}
              size={{ width, height }}
              style={{
                position: 'absolute',
                left: `${settings?.x || posX}px`,
                top: `${settings?.y || posY}px`,
                zIndex: isSelected ? 15 : (isHovered ? 12 : 10),
                transform: 'translate(-50%, -50%)',
                border: isSelected 
                  ? '2px dashed red' 
                  : (hasDock ? '2px solid rgba(255, 165, 0, 0.7)' : 'none'),
                opacity: isSelected ? 0.9 : (isHovered ? opacity + 0.1 : opacity),
                pointerEvents: 'auto',
                background: 'rgba(255, 255, 255, 0.1)',
                boxShadow: isSelected ? '0 0 10px rgba(255, 0, 0, 0.5)' : 'none'
              }}
              onMouseDown={(e) => {
                e.preventDefault(); // Empêcher le comportement par défaut
                handleDragStart(e, polygon.id, polygonData.centerX, polygonData.centerY);
              }}
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
                left: `${posX}px`,
                top: `${posY}px`,
                width: `${width}px`,
                height: `${height}px`,
                zIndex: isHovered ? 12 : 10,
                transition: 'transform 0.1s ease-out, opacity 0.2s ease-out',
                transform: `scale(${isHovered ? 1.05 : 1})`,
                left: `${posX}px`,
                top: `${posY}px`,
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
