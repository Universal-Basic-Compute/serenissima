import { useEffect, useState, useRef } from 'react';

interface BuildingLocationProps {
  building: any;
  landData: any;
  pointData: any;
}

const BuildingLocation: React.FC<BuildingLocationProps> = ({
  building,
  landData,
  pointData
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [landRendered, setLandRendered] = useState<boolean>(false);

  // Function to render a top-down view of the land
  const renderLandTopView = (polygon: any, canvas: HTMLCanvasElement): void => {
    if (!polygon.coordinates || polygon.coordinates.length < 3) return;
    
    // Set canvas size
    canvas.width = 300;
    canvas.height = 200;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Extract coordinates
    const coords = polygon.coordinates;
    
    // Find min/max to scale the polygon to fit the canvas
    let minLat = coords[0]?.lat || 0, maxLat = coords[0]?.lat || 0;
    let minLng = coords[0]?.lng || 0, maxLng = coords[0]?.lng || 0;
    
    coords.forEach((coord: any) => {
      if (coord) {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      }
    });
    
    // Add padding
    const padding = 20;
    const W = canvas.width - padding * 2;
    const H = canvas.height - padding * 2;

    const deltaLng = maxLng - minLng;
    const deltaLat = maxLat - minLat;

    let s_x: number, s_y: number;

    if (deltaLng === 0 && deltaLat === 0) { // Single point
      s_x = 1; s_y = 1;
    } else if (deltaLng === 0) { // Vertical line
      s_y = H / deltaLat;
      s_x = 0.7 * s_y; 
    } else if (deltaLat === 0) { // Horizontal line
      s_x = W / deltaLng;
      s_y = s_x / 0.7;
    } else {
      const scaleX_orig = W / deltaLng;
      const scaleY_orig = H / deltaLat;
      
      s_x = Math.min(scaleX_orig, 0.7 * scaleY_orig);
      s_y = s_x / 0.7;
    }
    
    // Calculate offsets for centering the polygon
    const renderedWidth = deltaLng * s_x;
    const renderedHeight = deltaLat * s_y;
    const offsetX = (W - renderedWidth) / 2;
    const offsetY = (H - renderedHeight) / 2;
    
    // Draw the polygon
    ctx.beginPath();
    coords.forEach((coord: any, index: number) => {
      const x = padding + offsetX + (coord.lng - minLng) * s_x;
      const y = padding + offsetY + (maxLat - coord.lat) * s_y; // Y is inverted (maxLat at top)
        
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
      
    // Fill with a sand color
    ctx.fillStyle = '#f5e9c8';
    ctx.fill();
      
    // Draw border
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Mark the building position if available
    if (building && building.position) {
      try {
        let position;
        if (typeof building.position === 'string') {
          position = JSON.parse(building.position);
        } else {
          position = building.position;
        }
        
        if (position && typeof position.lat === 'number' && typeof position.lng === 'number') {
          const markerX = padding + offsetX + (position.lng - minLng) * s_x;
          const markerY = padding + offsetY + (maxLat - position.lat) * s_y;
          
          // Draw a marker for the building
          ctx.beginPath();
          ctx.arc(markerX, markerY, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#FF5500'; // Bright orange color for visibility
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF'; // White border for contrast
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          console.warn('Building position is invalid or missing lat/lng numbers:', position);
        }
      } catch (error) {
        console.error('Error parsing or drawing building position marker:', error);
      }
    }
  };

  // Render land when data is available
  useEffect(() => {
    if (landData && canvasRef.current && !landRendered) {
      renderLandTopView(landData, canvasRef.current);
      setLandRendered(true);
    }
  }, [landData, landRendered, building]);

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Location</h3>
      
      <div className="flex flex-col items-center">
        {/* Point name */}
        {pointData ? (
          <>
            {/* Street name or bridge/canal name */}
            <p className="font-serif text-lg font-semibold text-amber-800 mb-2">
              {pointData.streetName || pointData.connection?.historicalName || 'Building Location'}
            </p>
            
            {/* English name */}
            {(pointData.streetNameEnglish || pointData.connection?.englishName) && (
              <p className="text-gray-700 italic mb-2">
                {pointData.streetNameEnglish || pointData.connection?.englishName}
              </p>
            )}
            
            {/* Description */}
            {(pointData.streetDescription || pointData.connection?.historicalDescription) && (
              <p className="text-sm text-gray-600 mb-3">
                {pointData.streetDescription || pointData.connection?.historicalDescription}
              </p>
            )}
          </>
        ) : (
          landData ? (
            <p className="font-serif text-lg font-semibold text-amber-800 mb-2">
              {landData.historicalName || landData.englishName || 'Land Plot'}
            </p>
          ) : (
            <p className="text-gray-500 italic">Location details unavailable</p>
          )
        )}
        
        {/* Land coordinates */}
        {building?.position && (
          <p className="text-xs text-gray-500 mb-2">
            {typeof building.position === 'string' 
              ? String(building.position) 
              : `Lat: ${String(building.position.lat?.toFixed(6) || '')}, Lng: ${String(building.position.lng?.toFixed(6) || '')}`
            }
          </p>
        )}
        
        {/* Canvas for land visualization */}
        <canvas 
          ref={canvasRef} 
          className="w-full h-[200px] border border-amber-100 rounded-lg mb-2"
          style={{ maxWidth: '300px' }}
        />
      </div>
    </div>
  );
};

export default BuildingLocation;
