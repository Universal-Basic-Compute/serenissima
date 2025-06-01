import React, { useEffect, useState, useRef } from 'react';
import { landService } from '@/lib/services/LandService';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

interface LandMarkersProps {
  isVisible: boolean;
  polygonsToRender: {
    polygon: any;
    coords: { x: number; y: number }[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
    hasPublicDock?: boolean;
  }[];
  isNight: boolean;
  scale?: number; // Add scale prop
  activeView?: string; // Add activeView prop to check if we're in building view
}

const LandMarkers: React.FC<LandMarkersProps> = ({ isVisible, polygonsToRender, isNight, scale = 1, activeView }) => {
  // Add state for land images
  const [landImages, setLandImages] = useState<Record<string, HTMLImageElement>>({});
  // Add state for resize mode
  const [resizeMode, setResizeMode] = useState<boolean>(false);
  // Add state for currently selected image for resizing
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  // Add state for custom positions and sizes
  const [customImageSettings, setCustomImageSettings] = useState<Record<string, { 
    x: number, 
    y: number, 
    width: number, 
    height: number 
  }>>({});
  // Add refs for drag handling
  const dragRef = useRef<{ 
    isDragging: boolean, 
    startX: number, 
    startY: number, 
    originalX: number, 
    originalY: number,
    isResizing: boolean,
    resizeHandle: string | null
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    originalX: 0,
    originalY: 0,
    isResizing: false,
    resizeHandle: null
  });

  // Load land images when component mounts or polygons change
  useEffect(() => {
    if (!isVisible || polygonsToRender.length === 0) return;

    const loadLandImages = async () => {
      // Extract the polygon data from polygonsToRender
      const polygons = polygonsToRender.map(item => item.polygon);
      const images = await landService.preloadLandImages(polygons);
      setLandImages(images);
    };

    loadLandImages();
  }, [isVisible, polygonsToRender]);

  // Initialize and update custom settings for polygons
  useEffect(() => {
    if (!isVisible || polygonsToRender.length === 0) return;

    const newSettings: Record<string, { x: number, y: number, width: number, height: number }> = {};
    let hasChanges = false;

    polygonsToRender.forEach(({ polygon, centerX, centerY }) => {
      if (!polygon || !polygon.id) return;
      
      const baseSize = 75; // Default base size
      
      if (!customImageSettings[polygon.id]) {
        // Initialize settings for new polygons
        newSettings[polygon.id] = {
          x: centerX - (baseSize * scale) / 2,
          y: centerY - (baseSize * scale) / 2,
          width: baseSize * scale,
          height: baseSize * scale
        };
        hasChanges = true;
      } else if (!resizeMode) {
        // Update position for existing polygons when not in resize mode
        // This makes images move with the map when panning/zooming
        const currentSettings = customImageSettings[polygon.id];
        const newX = centerX - (currentSettings.width / 2);
        const newY = centerY - (currentSettings.height / 2);
        
        // Only update if position has changed significantly
        if (Math.abs(currentSettings.x - newX) > 1 || Math.abs(currentSettings.y - newY) > 1) {
          newSettings[polygon.id] = {
            ...currentSettings,
            x: newX,
            y: newY
          };
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setCustomImageSettings(prev => ({ ...prev, ...newSettings }));
    }
  }, [isVisible, polygonsToRender, scale, customImageSettings, resizeMode]);

  // Add mouse event handlers for the document
  useEffect(() => {
    if (!resizeMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      if (selectedImageId) {
        if (dragRef.current.isResizing && dragRef.current.resizeHandle) {
          // Handle resizing
          const settings = { ...customImageSettings[selectedImageId] };
          
          switch (dragRef.current.resizeHandle) {
            case 'top-left':
              settings.x = dragRef.current.originalX + dx;
              settings.y = dragRef.current.originalY + dy;
              settings.width = Math.max(20, settings.width - dx);
              settings.height = Math.max(20, settings.height - dy);
              break;
            case 'top-right':
              settings.y = dragRef.current.originalY + dy;
              settings.width = Math.max(20, dragRef.current.originalX + dx);
              settings.height = Math.max(20, settings.height - dy);
              break;
            case 'bottom-left':
              settings.x = dragRef.current.originalX + dx;
              settings.width = Math.max(20, settings.width - dx);
              settings.height = Math.max(20, dragRef.current.originalY + dy);
              break;
            case 'bottom-right':
              settings.width = Math.max(20, dragRef.current.originalX + dx);
              settings.height = Math.max(20, dragRef.current.originalY + dy);
              break;
          }
          
          setCustomImageSettings(prev => ({
            ...prev,
            [selectedImageId]: settings
          }));
        } else {
          // Handle moving
          setCustomImageSettings(prev => ({
            ...prev,
            [selectedImageId]: {
              ...prev[selectedImageId],
              x: dragRef.current.originalX + dx,
              y: dragRef.current.originalY + dy
            }
          }));
        }
      }
    };

    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
      dragRef.current.isResizing = false;
      dragRef.current.resizeHandle = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeMode, selectedImageId, customImageSettings]);

  // Toggle resize mode function
  const toggleResizeMode = () => {
    setResizeMode(!resizeMode);
    if (selectedImageId) {
      setSelectedImageId(null);
    }
  };

  // Handle mouse down for dragging
  const handleMouseDown = (e: React.MouseEvent, polygonId: string, isResizeHandle = false, handlePosition: string | null = null) => {
    e.stopPropagation();
    setSelectedImageId(polygonId);
    
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originalX: customImageSettings[polygonId].x,
      originalY: customImageSettings[polygonId].y,
      isResizing: isResizeHandle,
      resizeHandle: handlePosition
    };

    if (isResizeHandle) {
      // For resize handles, we need to store the original width/height
      dragRef.current.originalX = customImageSettings[polygonId].width;
      dragRef.current.originalY = customImageSettings[polygonId].height;
    }
  };

  if (!isVisible) {
    return null;
  }

  // Only show resize toggle in building view
  const showResizeToggle = activeView === 'buildings';

  return (
    <>
      {showResizeToggle && (
        <div className="absolute top-20 right-4 z-40">
          <button
            onClick={toggleResizeMode}
            className={`px-3 py-2 rounded text-white text-sm ${
              resizeMode ? 'bg-amber-600' : 'bg-gray-600'
            }`}
          >
            {resizeMode ? 'Exit Resize Mode' : 'Resize Land Images'}
          </button>
        </div>
      )}

      {polygonsToRender.map(({ polygon, centerX, centerY }) => {
        if (!polygon || !polygon.id) return null;

        const img = landImages[polygon.id];
        if (!img) return null;

        // Get custom settings or use defaults
        const settings = customImageSettings[polygon.id] || {
          x: centerX - (75 * scale) / 2,
          y: centerY - (75 * scale) / 2,
          width: 75 * scale,
          height: 75 * scale
        };
        
        // Apply night effect if needed
        const nightFilter = isNight ? 'brightness(0.6) saturate(0.8)' : '';
        const isSelected = selectedImageId === polygon.id;

        return (
          <div
            key={`land-image-${polygon.id}`}
            style={{
              position: 'absolute',
              left: `${settings.x}px`,
              top: `${settings.y}px`,
              width: `${settings.width}px`,
              height: `${settings.height}px`,
              backgroundImage: `url(${img.src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              pointerEvents: resizeMode ? 'auto' : 'none',
              zIndex: isSelected ? 10 : 5, // Higher z-index when selected
              filter: nightFilter,
              opacity: 1,
              border: isSelected ? '2px dashed yellow' : 'none',
              cursor: resizeMode ? 'move' : 'default',
              transform: resizeMode ? 'none' : undefined // Ensure no transform when in resize mode
            }}
            onMouseEnter={() => {
              if (!resizeMode) {
                hoverStateService.setHoverState('polygon', polygon.id, polygon);
              }
            }}
            onMouseLeave={() => {
              if (!resizeMode) {
                hoverStateService.clearHoverState();
              }
            }}
            onClick={(e) => {
              if (!resizeMode) {
                eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: polygon.id, polygonData: polygon });
              } else {
                e.stopPropagation();
                setSelectedImageId(polygon.id);
              }
            }}
            onMouseDown={(e) => {
              if (resizeMode) {
                handleMouseDown(e, polygon.id);
              }
            }}
          >
            {resizeMode && isSelected && (
              <>
                {/* Resize handles */}
                <div 
                  className="absolute top-0 left-0 w-4 h-4 bg-yellow-400 rounded-full cursor-nw-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'top-left')}
                />
                <div 
                  className="absolute top-0 right-0 w-4 h-4 bg-yellow-400 rounded-full cursor-ne-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'top-right')}
                />
                <div 
                  className="absolute bottom-0 left-0 w-4 h-4 bg-yellow-400 rounded-full cursor-sw-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'bottom-left')}
                />
                <div 
                  className="absolute bottom-0 right-0 w-4 h-4 bg-yellow-400 rounded-full cursor-se-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'bottom-right')}
                />
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

export default LandMarkers;
