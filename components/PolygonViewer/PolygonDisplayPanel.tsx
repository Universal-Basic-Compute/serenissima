import React, { useRef } from 'react';

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
  const svgRef = useRef<SVGSVGElement>(null);

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
    // Scale must account for the height adjustment to ensure the final polygon fits.
    // The effective data height that needs to fit into drawableHeight is (polyDataHeight / HEIGHT_ADJUST_FACTOR).
    scale = Math.min(
      drawableWidth / polyDataWidth,
      drawableHeight / (polyDataHeight / HEIGHT_ADJUST_FACTOR)
    );
  } else if (polyDataWidth > 0) { // Polygon is a horizontal line
    scale = drawableWidth / polyDataWidth;
  } else if (polyDataHeight > 0) { // Polygon is a vertical line
    // Effective data height is (polyDataHeight / HEIGHT_ADJUST_FACTOR).
    scale = drawableHeight / (polyDataHeight / HEIGHT_ADJUST_FACTOR);
  }


  // 4. Calculate scaled dimensions and offsets for centering
  const scaledWidth = polyDataWidth * scale;
  // The actual height the polygon will take on screen after adjustment
  const adjustedScaledHeight = (polyDataHeight / HEIGHT_ADJUST_FACTOR) * scale;

  const offsetX = (SVG_SIZE - scaledWidth) / 2;
  // Center based on the adjusted height
  const offsetY = (SVG_SIZE - adjustedScaledHeight) / 2;

  // 5. Transform points
  const pointsString = coordinates.map(coord => {
    const svgX = (coord.lng - minLng) * scale + offsetX;
    // Divide by HEIGHT_ADJUST_FACTOR to expand the y-component before scaling by the overall 'scale'.
    // (maxLat - coord.lat) is the y-distance from the top of the bounding box, in original data units.
    const svgY = ((maxLat - coord.lat) / HEIGHT_ADJUST_FACTOR) * scale + offsetY;
    return `${svgX},${svgY}`;
  }).join(' ');

  const handleDownloadImage = () => {
    if (svgRef.current) {
      const svgElement = svgRef.current;
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Set canvas dimensions based on SVG viewbox to maintain aspect ratio and resolution
        const viewBox = svgElement.getAttribute('viewBox');
        let canvasWidth = SVG_SIZE;
        let canvasHeight = SVG_SIZE;
        if (viewBox) {
          const parts = viewBox.split(' ');
          if (parts.length === 4) {
            canvasWidth = parseInt(parts[2], 10);
            canvasHeight = parseInt(parts[3], 10);
          }
        }
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
          const pngUrl = canvas.toDataURL('image/png');
          
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `polygon-${polygon.id || 'image'}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        URL.revokeObjectURL(svgUrl); // Clean up blob URL
      };
      img.onerror = (e) => {
        console.error("Error loading SVG into image:", e);
        URL.revokeObjectURL(svgUrl); // Clean up blob URL
        alert("Could not download image. Error loading SVG.");
      };
      img.src = svgUrl;
    }
  };

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
        <div className="w-full aspect-square bg-[#F5E8C0] rounded"> {/* Changed background class for Tailwind, though SVG fill is dominant */}
          <svg ref={svgRef} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width="100%" height="100%">
            <rect width="100%" height="100%" fill="#F5E8C0" /> {/* Old parchment background for SVG */}
            {pointsString && polyDataWidth >= 0 && polyDataHeight >= 0 && ( // Ensure valid polygon data
                 <polygon
                    points={pointsString}
                    fill="#E0C9A6" // A slightly darker parchment/aged paper color for the polygon itself
                    fillOpacity="0.7" // Adjusted opacity
                    stroke="#5D4037" // A dark brown stroke, like old ink
                    strokeOpacity="0.8"
                    strokeWidth="1" 
                 />
            )}
          </svg>
        </div>
        {polygon.historicalName && (
            <p className="mt-2 text-sm text-gray-700">Historical Name: {polygon.historicalName}</p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleDownloadImage}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
          >
            Télécharger l'image
          </button>
        </div>
      </div>
    </div>
  );
};

export default PolygonDisplayPanel;
