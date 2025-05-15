import React, { useState, useEffect } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel';

interface CitizenMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number, y: number };
  canvasWidth: number;
  canvasHeight: number;
}

const CitizenMarkers: React.FC<CitizenMarkersProps> = ({ 
  isVisible, 
  scale, 
  offset,
  canvasWidth,
  canvasHeight
}) => {
  const [citizens, setCitizens] = useState<any[]>([]);
  const [selectedCitizen, setSelectedCitizen] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Helper function to convert lat/lng to screen coordinates
  const latLngToScreen = (lat: number, lng: number) => {
    // Convert lat/lng to isometric coordinates
    const x = (lng - 12.3326) * 20000;
    const y = (lat - 45.4371) * 20000;
    
    // Apply isometric projection
    const screenX = x * scale + canvasWidth / 2 + offset.x;
    const screenY = (-y) * scale * 1.4 + canvasHeight / 2 + offset.y;
    
    return { x: screenX, y: screenY };
  };
  
  useEffect(() => {
    // Load citizens when the component mounts
    const loadCitizensData = async () => {
      setIsLoading(true);
    
      if (!citizenService.isDataLoaded()) {
        await citizenService.loadCitizens();
      }
    
      const loadedCitizens = citizenService.getCitizens();
      setCitizens(loadedCitizens);
    
      // Add debug logging
      console.log(`CitizenMarkers: Loaded ${loadedCitizens.length} citizens`);
      console.log(`CitizenMarkers: Citizens with positions: ${loadedCitizens.filter(c => c.position).length}`);
    
      // Log a sample citizen to check position format
      if (loadedCitizens.length > 0) {
        console.log('CitizenMarkers: Sample citizen position:', loadedCitizens[0].position);
      }
    
      setIsLoading(false);
    };
    
    // Listen for the loadCitizens event
    const handleLoadCitizens = () => {
      loadCitizensData();
    };
    
    // Listen for citizens loaded event
    const handleCitizensLoaded = (data: any) => {
      setCitizens(data.citizens);
      setIsLoading(false);
    };
    
    // Add event listeners
    window.addEventListener('loadCitizens', handleLoadCitizens);
    eventBus.subscribe(EventTypes.CITIZENS_LOADED, handleCitizensLoaded);
    
    // Initial load
    loadCitizensData();
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('loadCitizens', handleLoadCitizens);
      eventBus.unsubscribe(EventTypes.CITIZENS_LOADED, handleCitizensLoaded);
    };
  }, []);
  
  // Update when scale or offset changes
  useEffect(() => {
    // Force re-render when scale or offset changes
  }, [scale, offset, canvasWidth, canvasHeight]);
  
  const handleCitizenClick = (citizen: any) => {
    setSelectedCitizen(citizen);
  };
  
  const handleCloseDetails = () => {
    setSelectedCitizen(null);
  };
  
  if (!isVisible) return null;
  
  return (
    <>
      {/* Citizen Markers */}
      <div className="absolute inset-0 pointer-events-none">
        {citizens.filter(citizen => citizen.position).map((citizen) => {
          // Convert lat/lng to screen coordinates
          const position = latLngToScreen(citizen.position.lat, citizen.position.lng);
          
          // Skip if position is off-screen (with some margin)
          if (position.x < -100 || position.x > canvasWidth + 100 || 
              position.y < -100 || position.y > canvasHeight + 100) {
            return null;
          }
          
          return (
            <div 
              key={citizen.id || citizen.CitizenId}
              className="absolute pointer-events-auto"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 1000
              }}
              onClick={() => handleCitizenClick(citizen)}
            >
              <div 
                className="w-6 h-6 rounded-full cursor-pointer hover:scale-125 transition-transform flex items-center justify-center"
                style={{ 
                  backgroundColor: citizenService.getSocialClassColor(citizen.SocialClass, 'home'),
                  border: '2px solid white',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2)'
                }}
                title={`${citizen.FirstName} ${citizen.LastName} (${citizen.SocialClass})`}
              >
                <span className="text-white text-xs font-bold">
                  {citizen.FirstName?.[0]}{citizen.LastName?.[0]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
          Loading citizens...
        </div>
      )}
      
      {/* Citizen Details Panel */}
      {selectedCitizen && (
        <CitizenDetailsPanel 
          citizen={selectedCitizen} 
          onClose={handleCloseDetails} 
        />
      )}
    </>
  );
};

export default CitizenMarkers;
