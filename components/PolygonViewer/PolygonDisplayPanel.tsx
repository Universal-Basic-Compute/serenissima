import React, { useRef, useState, useEffect } from 'react';

interface Point {
  lat: number;
  lng: number;
}

interface Polygon {
  id: string;
  coordinates: Point[];
  imageOverlayBounds?: google.maps.LatLngBoundsLiteral | null; // Added for map context
  [key: string]: any; 
}

interface PolygonDisplayPanelProps {
  polygon: Polygon;
  onClose: () => void;
  isMapContext?: boolean; // To know if we are in the /map context
  // Callbacks for map context
  onPreviewOverlayBounds?: (polygonId: string, bounds: google.maps.LatLngBoundsLiteral) => void;
  onSaveOverlayBounds?: (polygonId: string, bounds: google.maps.LatLngBoundsLiteral) => void;
}

const PolygonDisplayPanel: React.FC<PolygonDisplayPanelProps> = ({ 
  polygon, 
  onClose, 
  isMapContext = false,
  onPreviewOverlayBounds,
  onSaveOverlayBounds 
}) => {
  const SVG_SIZE = 300;
  const PADDING = 20;
  const svgRef = useRef<SVGSVGElement>(null);

  // State for image bounds input fields
  const [northBound, setNorthBound] = useState<string>('');
  const [southBound, setSouthBound] = useState<string>('');
  const [eastBound, setEastBound] = useState<string>('');
  const [westBound, setWestBound] = useState<string>('');

  useEffect(() => {
    if (isMapContext && polygon.imageOverlayBounds) {
      console.log(`PolygonDisplayPanel: Using stored imageOverlayBounds for polygon ${polygon.id}:`, polygon.imageOverlayBounds);
      setNorthBound(polygon.imageOverlayBounds.north.toString());
      setSouthBound(polygon.imageOverlayBounds.south.toString());
      setEastBound(polygon.imageOverlayBounds.east.toString());
      setWestBound(polygon.imageOverlayBounds.west.toString());
    } else if (isMapContext) {
        // If no stored bounds, try to calculate from coordinates for initial display
        // This is a rough estimate and might not match Google Maps GroundOverlay's default perfectly
        if (polygon.coordinates && polygon.coordinates.length > 0) {
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            polygon.coordinates.forEach(coord => {
                if (coord.lng < minLng) minLng = coord.lng;
                if (coord.lng > maxLng) maxLng = coord.lng;
                if (coord.lat < minLat) minLat = coord.lat;
                if (coord.lat > maxLat) maxLat = coord.lat;
            });
            
            // Add a small padding (5%) to the bounds for better visual appearance
            const latPadding = (maxLat - minLat) * 0.05;
            const lngPadding = (maxLng - minLng) * 0.05;
            
            setNorthBound((maxLat + latPadding).toString());
            setSouthBound((minLat - latPadding).toString());
            setEastBound((maxLng + lngPadding).toString());
            setWestBound((minLng - lngPadding).toString());
            
            console.log(`PolygonDisplayPanel: Calculated bounds for polygon ${polygon.id}:`, {
                north: maxLat + latPadding,
                south: minLat - latPadding,
                east: maxLng + lngPadding,
                west: minLng - lngPadding
            });
        }
    }
  }, [polygon.imageOverlayBounds, polygon.coordinates, isMapContext, polygon.id]);

  if (!polygon || (!polygon.coordinates && !isMapContext) || (polygon.coordinates && polygon.coordinates.length === 0 && !isMapContext)) {
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
  // SVG rendering logic - only if not in map context or if coordinates are present
  let pointsString = '';
  // Variables for SVG scaling, to be used by both polygon and image
  let minLngSvg = Infinity, maxLngSvg = -Infinity, minLatSvg = Infinity, maxLatSvg = -Infinity;
  let scaleSvg = 1, offsetXSvg = 0, offsetYSvg = 0;
  const HEIGHT_ADJUST_FACTOR_SVG = 0.7; // Renamed for clarity, used for polygon and image y-transform

  if (polygon.coordinates && polygon.coordinates.length > 0) {
    polygon.coordinates.forEach(coord => {
        if (coord.lng < minLngSvg) minLngSvg = coord.lng;
        if (coord.lng > maxLngSvg) maxLngSvg = coord.lng;
        if (coord.lat < minLatSvg) minLatSvg = coord.lat;
        if (coord.lat > maxLatSvg) maxLatSvg = coord.lat;
    });
    const polyDataWidthSvg = maxLngSvg - minLngSvg;
    const polyDataHeightSvg = maxLatSvg - minLatSvg;
    
    const drawableWidth = SVG_SIZE - 2 * PADDING;
    const drawableHeight = SVG_SIZE - 2 * PADDING;

    if (polyDataWidthSvg > 0 && polyDataHeightSvg > 0) {
        scaleSvg = Math.min(
          drawableWidth / polyDataWidthSvg,
          drawableHeight / (polyDataHeightSvg / HEIGHT_ADJUST_FACTOR_SVG)
        );
    } else if (polyDataWidthSvg > 0) {
        scaleSvg = drawableWidth / polyDataWidthSvg;
    } else if (polyDataHeightSvg > 0) {
        scaleSvg = drawableHeight / (polyDataHeightSvg / HEIGHT_ADJUST_FACTOR_SVG);
    }

    const scaledWidthSvg = polyDataWidthSvg * scaleSvg;
    const adjustedScaledHeightSvg = (polyDataHeightSvg / HEIGHT_ADJUST_FACTOR_SVG) * scaleSvg;
    offsetXSvg = (SVG_SIZE - scaledWidthSvg) / 2;
    offsetYSvg = (SVG_SIZE - adjustedScaledHeightSvg) / 2;

    pointsString = polygon.coordinates.map(coord => {
        const svgX = (coord.lng - minLngSvg) * scaleSvg + offsetXSvg;
        const svgY = ((maxLatSvg - coord.lat) / HEIGHT_ADJUST_FACTOR_SVG) * scaleSvg + offsetYSvg;
        return `${svgX},${svgY}`;
    }).join(' ');
  }

  // Calculate SVG attributes for the image overlay
  let svgImageX = 0, svgImageY = 0, svgImageWidth = 0, svgImageHeight = 0;
  let showImageOverlayInSvg = false;

  if (isMapContext && polygon.coordinates && polygon.coordinates.length > 0) { // Ensure Svg scaling params are available
    const nb = parseFloat(northBound);
    const sb = parseFloat(southBound);
    const eb = parseFloat(eastBound);
    const wb = parseFloat(westBound);

    if (!isNaN(nb) && !isNaN(sb) && !isNaN(eb) && !isNaN(wb) && polygon.id) {
      svgImageX = (wb - minLngSvg) * scaleSvg + offsetXSvg;
      svgImageY = ((maxLatSvg - nb) / HEIGHT_ADJUST_FACTOR_SVG) * scaleSvg + offsetYSvg;
      svgImageWidth = (eb - wb) * scaleSvg;
      svgImageHeight = ((nb - sb) / HEIGHT_ADJUST_FACTOR_SVG) * scaleSvg;
      
      // Ensure width and height are not negative
      if (svgImageWidth >= 0 && svgImageHeight >= 0) {
        showImageOverlayInSvg = true;
      }
    }
  }

  const handleDownloadImage = () => {
    if (svgRef.current && (pointsString || showImageOverlayInSvg) ) { // Ensure there's something to download
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
          downloadLink.download = `${polygon.id || 'image'}.png`;
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
        {/* SVG Display of Polygon - Conditional */}
        {pointsString && (
            <div className="w-full aspect-square bg-[#F5E8C0] rounded mb-4">
            <svg ref={svgRef} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width="100%" height="100%">
                <rect width="100%" height="100%" fill="#F5E8C0" />
                {pointsString && (
                  <polygon
                      points={pointsString}
                      fill="#E0C9A6"
                      fillOpacity="0.7"
                      stroke="#5D4037"
                      strokeOpacity="0.8"
                      strokeWidth="1"
                  />
                )}
                {showImageOverlayInSvg && (
                  <image
                    href={`/images/lands/${polygon.id}.png`}
                    x={svgImageX}
                    y={svgImageY}
                    width={svgImageWidth}
                    height={svgImageHeight}
                    opacity="0.5"
                    preserveAspectRatio="none"
                  />
                )}
            </svg>
            </div>
        )}

        {polygon.historicalName && (
            <p className="mt-2 text-sm text-gray-700">Historical Name: {polygon.historicalName}</p>
        )}

        {/* Image Bounds Adjustment UI - Only for map context */}
        {isMapContext && onPreviewOverlayBounds && onSaveOverlayBounds && (
          <div className="mt-4 border-t pt-4">
            <h4 className="text-md font-semibold mb-2 text-gray-700">Ajuster l'image sur la carte</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label htmlFor="northBound" className="block text-gray-600">Nord:</label>
                <input type="number" step="any" id="northBound" value={northBound} onChange={(e) => setNorthBound(e.target.value)} className="w-full p-1 border rounded border-gray-300"/>
              </div>
              <div>
                <label htmlFor="southBound" className="block text-gray-600">Sud:</label>
                <input type="number" step="any" id="southBound" value={southBound} onChange={(e) => setSouthBound(e.target.value)} className="w-full p-1 border rounded border-gray-300"/>
              </div>
              <div>
                <label htmlFor="eastBound" className="block text-gray-600">Est:</label>
                <input type="number" step="any" id="eastBound" value={eastBound} onChange={(e) => setEastBound(e.target.value)} className="w-full p-1 border rounded border-gray-300"/>
              </div>
              <div>
                <label htmlFor="westBound" className="block text-gray-600">Ouest:</label>
                <input type="number" step="any" id="westBound" value={westBound} onChange={(e) => setWestBound(e.target.value)} className="w-full p-1 border rounded border-gray-300"/>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-center">
              <button
                onClick={() => {
                  const bounds = {
                    north: parseFloat(northBound),
                    south: parseFloat(southBound),
                    east: parseFloat(eastBound),
                    west: parseFloat(westBound),
                  };
                  if (Object.values(bounds).every(v => !isNaN(v))) {
                    onPreviewOverlayBounds(polygon.id, bounds);
                  } else {
                    alert("Veuillez entrer des valeurs numériques valides pour les limites.");
                  }
                }}
                className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors text-xs"
              >
                Prévisualiser
              </button>
              <button
                onClick={() => {
                  const bounds = {
                    north: parseFloat(northBound),
                    south: parseFloat(southBound),
                    east: parseFloat(eastBound),
                    west: parseFloat(westBound),
                  };
                  if (Object.values(bounds).every(v => !isNaN(v))) {
                    onSaveOverlayBounds(polygon.id, bounds);
                  } else {
                    alert("Veuillez entrer des valeurs numériques valides pour les limites.");
                  }
                }}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-xs"
              >
                Sauvegarder Limites
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          {pointsString && ( /* Only show download if SVG is rendered */
            <button
                onClick={handleDownloadImage}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm mr-2"
            >
                Télécharger l'image (SVG)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PolygonDisplayPanel;
