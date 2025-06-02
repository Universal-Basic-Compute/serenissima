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
  // Add ref to track previous scale
  const prevScale = useRef<number>(scale);
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

  // Get land images from LandService when component mounts or polygons change
  useEffect(() => {
    if (!isVisible || polygonsToRender.length === 0) return;

    // Instead of loading images here, just get the already preloaded images from the service
    const images = landService.getLandImages();
    setLandImages(images);
    
    // Set up an interval to check for new images periodically
    // This helps when new polygons are added or images are loaded after initial render
    const checkInterval = setInterval(() => {
      const currentImages = landService.getLandImages();
      if (Object.keys(currentImages).length !== Object.keys(images).length) {
        setLandImages({...currentImages});
      }
    }, 5000); // Check every 5 seconds
    
    return () => {
      clearInterval(checkInterval);
    };
  }, [isVisible, polygonsToRender]);

  // Add a separate effect to handle scale changes
  useEffect(() => {
    if (!isVisible || polygonsToRender.length === 0) return;
    
    // When scale changes, update positions AND sizes
    const updatedSettings: Record<string, { x: number, y: number, width: number, height: number }> = {};
    let hasUpdates = false;
    
    polygonsToRender.forEach(({ polygon, centerX, centerY, coords }) => {
      if (!polygon || !polygon.id) return;
      
      // Calculate the polygon's bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      coords.forEach(coord => {
        minX = Math.min(minX, coord.x);
        minY = Math.min(minY, coord.y);
        maxX = Math.max(maxX, coord.x);
        maxY = Math.max(maxY, coord.y);
      });
      
      // Calculate width and height based on the polygon's actual dimensions
      const polygonWidth = maxX - minX;
      const polygonHeight = maxY - minY;
      
      const currentSettings = customImageSettings[polygon.id];
      if (currentSettings) {
        // For saved settings with a reference scale, use that for scaling
        if (polygon.imageSettings && polygon.imageSettings.referenceScale) {
          const referenceScale = polygon.imageSettings.referenceScale;
          const scaleRatio = scale / referenceScale;
          
          // Scale dimensions based on the reference scale
          const scaledWidth = polygon.imageSettings.width * scaleRatio;
          const scaledHeight = polygon.imageSettings.height * scaleRatio;
          
          updatedSettings[polygon.id] = {
            x: centerX - (scaledWidth / 2),
            y: centerY - (scaledHeight / 2),
            width: scaledWidth,
            height: scaledHeight
          };
          hasUpdates = true;
        } else if (!resizeMode) {
          // For other settings, maintain the position relative to the polygon
          // But always update position to follow the polygon center
          
          // Calculate the size relative to the polygon size
          const widthRatio = currentSettings.width / polygonWidth;
          const heightRatio = currentSettings.height / polygonHeight;
          
          // Apply the same ratios to the new polygon dimensions
          const newWidth = polygonWidth * widthRatio;
          const newHeight = polygonHeight * heightRatio;
          
          // Always center on the polygon's center
          updatedSettings[polygon.id] = {
            x: centerX - (newWidth / 2),
            y: centerY - (newHeight / 2),
            width: newWidth,
            height: newHeight
          };
          hasUpdates = true;
        }
      }
    });
    
    if (hasUpdates) {
      setCustomImageSettings(prev => ({ ...prev, ...updatedSettings }));
      prevScale.current = scale; // Update previous scale reference
    }
  }, [isVisible, polygonsToRender, scale, customImageSettings, resizeMode]);

  // Initialize and update custom settings for polygons
  useEffect(() => {
    if (!isVisible || polygonsToRender.length === 0) return;

    const newSettings: Record<string, { x: number, y: number, width: number, height: number }> = {};
    let hasChanges = false;

    polygonsToRender.forEach(({ polygon, centerX, centerY, coords }) => {
      if (!polygon || !polygon.id) return;
      
      // Calculate the polygon's bounding box to determine appropriate size
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      coords.forEach(coord => {
        minX = Math.min(minX, coord.x);
        minY = Math.min(minY, coord.y);
        maxX = Math.max(maxX, coord.x);
        maxY = Math.max(maxY, coord.y);
      });
      
      // Calculate width and height based on the polygon's actual dimensions
      const polygonWidth = maxX - minX;
      const polygonHeight = maxY - minY;
      
      if (!customImageSettings[polygon.id]) {
        // First check if polygon has saved imageSettings
        if (polygon.imageSettings) {
          // Use the saved settings, but adjust position based on current center
          const savedSettings = polygon.imageSettings;
          
          // If we have a reference scale from when the settings were saved, use it for proper scaling
          const referenceScale = savedSettings.referenceScale || prevScale.current;
          const scaleRatio = scale / referenceScale;
          
          // Scale dimensions based on the reference scale
          const scaledWidth = savedSettings.width * scaleRatio;
          const scaledHeight = savedSettings.height * scaleRatio;
          
          newSettings[polygon.id] = {
            x: centerX - (scaledWidth / 2),
            y: centerY - (scaledHeight / 2),
            width: scaledWidth,
            height: scaledHeight
          };
        }
        // If no imageSettings, check if polygon has imageOverlayBounds
        else if (polygon.imageOverlayBounds) {
          // Calculate position and size based on stored bounds
          try {
            // Use the center of the polygon as a reference point
            const aspectRatio = 
              (polygon.imageOverlayBounds.east - polygon.imageOverlayBounds.west) / 
              (polygon.imageOverlayBounds.north - polygon.imageOverlayBounds.south);
            
            // Use the polygon's actual dimensions for sizing
            let width = polygonWidth * 0.95; // 95% of polygon width
            let height = width / aspectRatio;
            
            // If height is too large compared to polygon height, adjust
            if (height > polygonHeight * 1.2) {
              height = polygonHeight * 0.95;
              width = height * aspectRatio;
            }
            
            newSettings[polygon.id] = {
              x: centerX - width / 2,
              y: centerY - height / 2,
              width: width,
              height: height
            };
          } catch (error) {
            console.warn(`Error calculating image position for polygon ${polygon.id}:`, error);
            // Fall back to sizing based on polygon dimensions
            newSettings[polygon.id] = {
              x: minX,
              y: minY,
              width: polygonWidth,
              height: polygonHeight
            };
          }
        } else {
          // Initialize settings for new polygons without bounds or saved settings
          // Use the polygon's actual dimensions
          newSettings[polygon.id] = {
            x: minX,
            y: minY,
            width: polygonWidth,
            height: polygonHeight
          };
        }
        hasChanges = true;
      } else {
        // Always update position for existing polygons, even in resize mode
        // This ensures images move with the map
        const currentSettings = customImageSettings[polygon.id];
        
        // Always update position based on the current center point
        newSettings[polygon.id] = {
          x: centerX - (currentSettings.width / 2),
          y: centerY - (currentSettings.height / 2),
          width: currentSettings.width,
          height: currentSettings.height
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setCustomImageSettings(prev => ({ ...prev, ...newSettings }));
      prevScale.current = scale; // Update previous scale reference
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
          const originalWidth = dragRef.current.originalX; // Width is stored in originalX for resize
          const originalHeight = dragRef.current.originalY; // Height is stored in originalY for resize
          
          switch (dragRef.current.resizeHandle) {
            case 'top-left':
              // Move top-left corner while resizing
              settings.x += dx;
              settings.y += dy;
              settings.width = Math.max(20, originalWidth - dx);
              settings.height = Math.max(20, originalHeight - dy);
              break;
            case 'top-right':
              // Move top-right corner while resizing
              settings.y += dy;
              settings.width = Math.max(20, originalWidth + dx);
              settings.height = Math.max(20, originalHeight - dy);
              break;
            case 'bottom-left':
              // Move bottom-left corner while resizing
              settings.x += dx;
              settings.width = Math.max(20, originalWidth - dx);
              settings.height = Math.max(20, originalHeight + dy);
              break;
            case 'bottom-right':
              // Move bottom-right corner while resizing
              settings.width = Math.max(20, originalWidth + dx);
              settings.height = Math.max(20, originalHeight + dy);
              break;
          }
          
          setCustomImageSettings(prev => ({
            ...prev,
            [selectedImageId]: settings
          }));
        } else {
          // Handle moving (not resizing)
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
      // Save settings when mouse is released
      if (dragRef.current.isDragging && selectedImageId) {
        const settings = customImageSettings[selectedImageId];
        if (settings) {
          // Save the settings to the server
          landService.saveImageSettings(selectedImageId, settings)
            .then(success => {
              if (success) {
                console.log(`Saved image settings for ${selectedImageId}`);
              }
            });
        }
      }
      
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
    
    if (isResizeHandle) {
      // For resize handles, store both position and dimensions
      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        originalX: customImageSettings[polygonId].width, // Store width for resize
        originalY: customImageSettings[polygonId].height, // Store height for resize
        isResizing: true, // Always true for resize handles
        resizeHandle: handlePosition
      };
    } else {
      // For moving the entire image
      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        originalX: customImageSettings[polygonId].x, // Store position for moving
        originalY: customImageSettings[polygonId].y, // Store position for moving
        isResizing: false, // Always false for moving
        resizeHandle: null
      };
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
        <div className="absolute top-20 right-4 z-40 flex flex-col space-y-2">
          <button
            onClick={toggleResizeMode}
            className={`px-3 py-2 rounded text-white text-sm ${
              resizeMode ? 'bg-amber-600' : 'bg-gray-600'
            }`}
          >
            {resizeMode ? 'Exit Resize Mode' : 'Resize Land Images'}
          </button>
          
          {resizeMode && selectedImageId && (
            <button
              onClick={() => {
                if (selectedImageId) {
                  // Store the current scale with the settings to use as a reference
                  const settings = customImageSettings[selectedImageId];
                  if (settings) {
                    // Save the settings with a reference scale
                    const settingsToSave = {
                      ...settings,
                      referenceScale: scale // Save the current scale as reference
                    };
                    landService.saveImageSettings(selectedImageId, settingsToSave)
                      .then(success => {
                        if (success) {
                          alert(`Saved image settings for ${selectedImageId}`);
                        } else {
                          alert(`Failed to save image settings for ${selectedImageId}`);
                        }
                      });
                  }
                }
              }}
              className="px-3 py-2 rounded text-white text-sm bg-green-600 hover:bg-green-500"
            >
              Save Current Position
            </button>
          )}
        </div>
      )}

      {/* Debug info */}
      <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs p-2 rounded z-50 pointer-events-none">
        Polygons: {polygonsToRender.length} | Scale: {scale.toFixed(2)}
      </div>

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
              backgroundSize: 'contain', // Changed from 'cover' to 'contain'
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat', // Added to prevent tiling
              pointerEvents: resizeMode ? 'auto' : 'none',
              zIndex: isSelected ? 10 : 5, // Higher z-index when selected
              filter: nightFilter,
              opacity: 0.9, // Slightly transparent to blend better
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
                  className="absolute top-0 left-0 w-5 h-5 bg-yellow-400 rounded-full cursor-nw-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'top-left')}
                  style={{ transform: 'translate(-50%, -50%)' }} // Center the handle on the corner
                />
                <div 
                  className="absolute top-0 right-0 w-5 h-5 bg-yellow-400 rounded-full cursor-ne-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'top-right')}
                  style={{ transform: 'translate(50%, -50%)' }} // Center the handle on the corner
                />
                <div 
                  className="absolute bottom-0 left-0 w-5 h-5 bg-yellow-400 rounded-full cursor-sw-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'bottom-left')}
                  style={{ transform: 'translate(-50%, 50%)' }} // Center the handle on the corner
                />
                <div 
                  className="absolute bottom-0 right-0 w-5 h-5 bg-yellow-400 rounded-full cursor-se-resize z-20"
                  onMouseDown={(e) => handleMouseDown(e, polygon.id, true, 'bottom-right')}
                  style={{ transform: 'translate(50%, 50%)' }} // Center the handle on the corner
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
