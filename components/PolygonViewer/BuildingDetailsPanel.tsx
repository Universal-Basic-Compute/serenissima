import { useEffect, useState, useRef } from 'react';
import { getBackendBaseUrl } from '@/lib/apiUtils';
import PlayerProfile from '../UI/PlayerProfile';

interface BuildingDetailsPanelProps {
  selectedBuildingId: string | null;
  onClose: () => void;
  visible?: boolean;
}

export default function BuildingDetailsPanel({ selectedBuildingId, onClose, visible = true }: BuildingDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [building, setBuilding] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landData, setLandData] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [landRendered, setLandRendered] = useState<boolean>(false);
  
  // Fetch building details when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsLoading(true);
      setError(null);
      
      fetch(`/api/buildings/${selectedBuildingId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Building not found (ID: ${selectedBuildingId})`);
            }
            throw new Error(`Failed to fetch building: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Building data:', data);
          if (data && data.building) {
            setBuilding(data.building);
            
            // If we have a land_id, fetch the land data
            if (data.building.land_id) {
              fetchLandData(data.building.land_id);
            }
          } else {
            throw new Error('Invalid building data format');
          }
        })
        .catch(error => {
          console.error('Error fetching building details:', error);
          setError(error.message || 'Failed to load building details');
          setBuilding(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setBuilding(null);
      setError(null);
    }
  }, [selectedBuildingId]);
  
  // Function to fetch land data
  const fetchLandData = async (landId: string) => {
    try {
      // First try to get land data from window.__polygonData if available
      if (typeof window !== 'undefined' && window.__polygonData) {
        const polygon = window.__polygonData.find((p: any) => p.id === landId);
        if (polygon) {
          setLandData(polygon);
          return;
        }
      }
      
      // Otherwise fetch from API
      const response = await fetch(`/api/get-polygon/${landId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch land data: ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.polygon) {
        setLandData(data.polygon);
      }
    } catch (error) {
      console.error('Error fetching land data:', error);
    }
  };
  
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
    const scaleX = (canvas.width - padding * 2) / (maxLng - minLng);
    const scaleY = (canvas.height - padding * 2) / (maxLat - minLat);
    
    // Use the smaller scale to maintain aspect ratio
    const scale = Math.min(scaleX, scaleY);
    
    // Center the polygon
    const centerX = (canvas.width / 2) - ((minLng + maxLng) / 2) * scale;
    const centerY = (canvas.height / 2) + ((minLat + maxLat) / 2) * scale;
    
    // Draw the polygon
    ctx.beginPath();
    coords.forEach((coord: any, index: number) => {
      const x = (coord.lng * scale) + centerX;
      const y = centerY - (coord.lat * scale);
        
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
        
        if (position && position.lat && position.lng) {
          const x = (position.lng * scale) + centerX;
          const y = centerY - (position.lat * scale);
          
          // Draw a marker for the building
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#FF5500';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } catch (error) {
        console.error('Error parsing building position:', error);
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
  
  // Reset landRendered when selectedBuildingId changes
  useEffect(() => {
    if (selectedBuildingId) {
      setLandRendered(false);
    }
  }, [selectedBuildingId]);
  
  // Show panel with animation when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedBuildingId]);
  
  // Function to adjust date by subtracting 500 years
  const adjustDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      date.setFullYear(date.getFullYear() - 500);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error adjusting date:', error);
      return 'Unknown date';
    }
  };
  
  // Early return if not visible or no selected building
  if (!visible || !selectedBuildingId) return null;
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-96 bg-amber-50 shadow-xl transform transition-transform duration-300 ease-in-out z-20 border-l-4 border-amber-600 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-6 h-full flex flex-col">
        {/* Header with improved styling */}
        <div className="flex justify-between items-center mb-6 border-b-2 border-amber-300 pb-3">
          <h2 className="text-2xl font-serif font-semibold text-amber-800">
            {!isLoading && !error && building ? `${building.type} Details` : 'Building Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Error message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-4">
            <h3 className="font-bold mb-1">Error</h3>
            <p>{error}</p>
            <button 
              onClick={onClose}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        ) : !error && building ? (
          <div className="space-y-6 overflow-y-auto flex-grow">
            {/* Building Type */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Building Type</h3>
              <p className="font-serif text-xl font-semibold text-amber-800">{building.type}</p>
              {building.variant && (
                <p className="mt-1 text-sm italic text-amber-600">Variant: {building.variant}</p>
              )}
            </div>
            
            {/* Location with land visualization */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Location</h3>
              
              {landData ? (
                <div className="flex flex-col items-center">
                  {/* Land name */}
                  <p className="font-serif text-lg font-semibold text-amber-800 mb-2">
                    {landData.historicalName || landData.englishName || 'Land Plot'}
                  </p>
                  
                  {/* Canvas for land visualization */}
                  <canvas 
                    ref={canvasRef} 
                    className="w-full h-[200px] border border-amber-100 rounded-lg mb-2"
                    style={{ maxWidth: '300px' }}
                  />
                  
                  {/* Land ID in small text */}
                  <p className="text-xs text-gray-500 mt-1">
                    Land ID: <span className="font-medium">{building.land_id}</span>
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700">Land ID: <span className="font-medium">{building.land_id}</span></p>
                  <p className="text-xs text-gray-500 mt-1 italic">Loading land details...</p>
                </div>
              )}
              
              {building.position && (
                <p className="text-xs text-gray-500 mt-2">
                  Position: {typeof building.position === 'string' 
                    ? building.position.substring(0, 20) + '...' 
                    : JSON.stringify(building.position).substring(0, 20) + '...'}
                </p>
              )}
            </div>
            
            {/* Owner information */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
              {building.owner ? (
                <div className="flex items-center justify-center">
                  <PlayerProfile 
                    username={building.owner}
                    walletAddress={building.owner}
                    size="medium"
                    className="mx-auto"
                  />
                </div>
              ) : (
                <p className="text-center text-gray-500 italic">No owner information</p>
              )}
            </div>
            
            {/* Financial Information */}
            {(building.lease_amount || building.rent_amount) && (
              <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Financial Details</h3>
                
                {building.lease_amount !== undefined && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700">Lease Amount:</span>
                    <span className="font-semibold text-amber-800">
                      {building.lease_amount.toLocaleString()} ⚜️ ducats
                    </span>
                  </div>
                )}
                
                {building.rent_amount !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Rent Amount:</span>
                    <span className="font-semibold text-amber-800">
                      {building.rent_amount.toLocaleString()} ⚜️ ducats
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Occupant Information */}
            {building.occupant && (
              <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Occupant</h3>
                <div className="flex items-center justify-center">
                  <PlayerProfile 
                    username={building.occupant}
                    walletAddress={building.occupant}
                    size="medium"
                    className="mx-auto"
                  />
                </div>
              </div>
            )}
            
            {/* Creation Information with adjusted date (500 years earlier) */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Creation Details</h3>
              <div className="text-sm">
                <p className="text-gray-700">
                  Created: <span className="font-medium">
                    {adjustDate(building.created_at)}
                  </span>
                </p>
                {building.created_by && (
                  <p className="text-gray-700 mt-1">
                    Created by: <span className="font-medium">{building.created_by}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-gray-500 italic">
              {error ? 'Unable to load building details' : 'No building selected'}
            </p>
          </div>
        )}
        
        {/* Add a decorative Venetian footer */}
        <div className="mt-4 text-center">
          <div className="text-amber-600 text-xs italic">
            La Serenissima Repubblica di Venezia
          </div>
          <div className="flex justify-center mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
