import { useCallback, useMemo } from 'react';
import { CoordinateService } from '@/lib/services/CoordinateService';

interface BuildingMarkers2Props {
  scale: number;
  offset: { x: number; y: number };
  canvasWidth: number;
  canvasHeight: number;
  isVisible?: boolean; // Optional prop to control visibility
}

// Static data for the image to be displayed
const STATIC_IMAGE_DATA = {
  url: "/images/lands/polygon-1746052711032.png",
  lat: 45.421545475964706,
  lng: 12.337712685628922,
  worldWidth: 587,  // Dimension along X-axis of the world
  worldHeight: 617, // Dimension along Z-axis of the world (depth on the map)
  // Assuming no specific referenceScale, or it's implicitly 1 for these world dimensions
};

// Isometric projection factor for the Y-axis (depth)
const ISOMETRIC_STRETCH_FACTOR = 1.4;

export default function BuildingMarkers2({
  scale,
  offset,
  canvasWidth,
  canvasHeight,
  isVisible = true, // Default to true if not provided
}: BuildingMarkers2Props) {
  if (!isVisible) {
    return null;
  }

  const screenCoords = useMemo(() => {
    const world = CoordinateService.latLngToWorld(STATIC_IMAGE_DATA.lat, STATIC_IMAGE_DATA.lng);
    return CoordinateService.worldToScreen(world.x, world.y, scale, offset, canvasWidth, canvasHeight);
  }, [scale, offset, canvasWidth, canvasHeight]);

  const displayDimensions = useMemo(() => {
    // The image's width in world units is scaled by 'scale' for screen pixels.
    const pixelWidth = STATIC_IMAGE_DATA.worldWidth * scale;
    // The image's height (depth in world) in world units is scaled by 'scale * ISOMETRIC_STRETCH_FACTOR'
    const pixelHeight = STATIC_IMAGE_DATA.worldHeight * scale * ISOMETRIC_STRETCH_FACTOR;
    return { pixelWidth, pixelHeight };
  }, [scale]);

  return (
    <div
      className="absolute pointer-events-none" // Not interactive by default
      style={{
        left: `${screenCoords.x}px`,
        top: `${screenCoords.y}px`,
        width: `${displayDimensions.pixelWidth}px`,
        height: `${displayDimensions.pixelHeight}px`,
        transform: 'translate(-50%, -50%)', // Center the image based on its screen coordinates
        zIndex: 1, // Render it above the base canvas but below most interactive markers
      }}
    >
      <img
        src={STATIC_IMAGE_DATA.url}
        alt={`Land overlay for polygon at ${STATIC_IMAGE_DATA.lat.toFixed(4)}, ${STATIC_IMAGE_DATA.lng.toFixed(4)}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain', // Ensures the entire image is visible, maintaining aspect ratio
          imageRendering: 'pixelated', // Optional: for a sharper look at low resolutions/high zoom
        }}
        onError={(e) => {
          // Fallback or error logging if image fails to load
          (e.target as HTMLImageElement).style.display = 'none'; // Hide broken image
          console.warn(`Failed to load image: ${STATIC_IMAGE_DATA.url}`);
        }}
      />
    </div>
  );
}
