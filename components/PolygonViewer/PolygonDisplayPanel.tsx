import React from 'react';

interface Point {
  lat: number;
  lng: number;
}

interface Polygon {
  id: string;
  coordinates: Point[];
  // Add other polygon properties if needed, e.g., name, color
  [key: string]: any; // Allow other properties
}

interface PolygonDisplayPanelProps {
  polygon: Polygon;
  onClose: () => void;
}

const PolygonDisplayPanel: React.FC<PolygonDisplayPanelProps> = ({ polygon, onClose }) => {
  const SVG_SIZE = 300;
  const PADDING = 20;

  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return null;
  }

  const { coordinates } = polygon;

  // 1. Find bounding box of the polygon
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coordinates.forEach(coord => {
    if (coord.lng < minLng) minLng = coord.lng;
    if (coord.lng > maxLng) maxLng = coord.lng;
    if (coord.lat < minLat) minLat = coord.lat;
    if (coord.lat > maxLat) maxLat = coord.lat;
  });

  // 2. Calculate polygon data width and height
  const polyDataWidth = maxLng - minLng;
  const polyDataHeight = maxLat - minLat;

  // Handle cases where polygon is a line or point (or invalid)
  if (polyDataWidth === 0 && polyDataHeight === 0) {
      // If it's a single point, draw a small circle
      // Or handle as an error/empty display
      // For now, let's not draw anything if it's not a valid area
      console.warn("PolygonDisplayPanel: Polygon has no area (degenerate).");
      // return null; // Or display a message
  }


  // 3. Calculate scale factor
  const drawableWidth = SVG_SIZE - 2 * PADDING;
  const drawableHeight = SVG_SIZE - 2 * PADDING;
  const HEIGHT_ADJUST_FACTOR = 0.7; // Factor to adjust the height

  let scale = 1;
  if (polyDataWidth > 0 && polyDataHeight > 0) {
    // Scale is determined by the original dimensions to fit the container
    scale = Math.min(drawableWidth / polyDataWidth, drawableHeight / polyDataHeight);
  } else if (polyDataWidth > 0) { // Polygon is a horizontal line
    scale = drawableWidth / polyDataWidth;
  } else if (polyDataHeight > 0) { // Polygon is a vertical line
    // If it's a vertical line, scale is based on its height,
    // but we want its displayed height to be drawableHeight * HEIGHT_ADJUST_FACTOR.
    // So, the scale should make polyDataHeight * HEIGHT_ADJUST_FACTOR * scale = drawableHeight.
    // This means scale = drawableHeight / (polyDataHeight * HEIGHT_ADJUST_FACTOR)
    // However, to maintain consistency with how scale is used later for points,
    // it's better to calculate scale based on original polyDataHeight and apply factor during point transformation.
    // For a pure vertical line, polyDataHeight is the main dimension.
    // The scale should make polyDataHeight fit drawableHeight.
    // The 0.7 factor will then be applied to its apparent height.
    scale = drawableHeight / polyDataHeight;
  }


  // 4. Calculate scaled dimensions and offsets for centering
  const scaledWidth = polyDataWidth * scale;
  // The actual height the polygon will take on screen after adjustment
  const adjustedScaledHeight = polyDataHeight * scale * HEIGHT_ADJUST_FACTOR;

  const offsetX = (SVG_SIZE - scaledWidth) / 2;
  // Center based on the adjusted height
  const offsetY = (SVG_SIZE - adjustedScaledHeight) / 2;

  // 5. Transform points
  const pointsString = coordinates.map(coord => {
    const svgX = (coord.lng - minLng) * scale + offsetX;
    // Apply HEIGHT_ADJUST_FACTOR to the y-component of the point before scaling by the overall 'scale'.
    // (maxLat - coord.lat) is the y-distance from the top of the bounding box, in original data units.
    // We scale this distance by HEIGHT_ADJUST_FACTOR, then by the overall 'scale'.
    const svgY = (maxLat - coord.lat) * HEIGHT_ADJUST_FACTOR * scale + offsetY;
    return `${svgX},${svgY}`;
  }).join(' ');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Polygon: {polygon.id}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
            aria-label="Close panel"
          >
            &times;
          </button>
        </div>
        <div className="w-full aspect-square bg-lightblue rounded">
          <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width="100%" height="100%">
            <rect width="100%" height="100%" fill="lightblue" />
            {pointsString && polyDataWidth >= 0 && polyDataHeight >= 0 && ( // Ensure valid polygon data
                 <polygon
                    points={pointsString}
                    fill="#FFF5D0"
                    fillOpacity="0.6"
                    stroke="#000000"
                    strokeOpacity="0.8"
                    strokeWidth="1.5" // Changed to a fixed value for consistent stroke appearance
                 />
            )}
          </svg>
        </div>
        {polygon.historicalName && (
            <p className="mt-2 text-sm text-gray-700">Historical Name: {polygon.historicalName}</p>
        )}
      </div>
    </div>
  );
};

export default PolygonDisplayPanel;
