import React, { useState, useEffect } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';
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
    // Convert lat/lng to world coordinates using CoordinateService
    const world = CoordinateService.latLngToWorld(lat, lng);
    
    // Convert world coordinates to screen coordinates
    const screen = CoordinateService.worldToScreen(
      world.x, world.y, scale, offset, canvasWidth, canvasHeight
    );
    
    return screen;
  };
  
  useEffect(() => {
    // Load citizens when the component mounts
    const loadCitizensData = async () => {
      setIsLoading(true);
  
      if (!citizenService.isDataLoaded()) {
        await citizenService.loadCitizens();
      }
  
      const loadedCitizens = citizenService.getCitizens();
      
      // Filter out citizens without positions
      const citizensWithPositions = loadedCitizens.filter(c => c.position);
      setCitizens(citizensWithPositions);
  
      // Add debug logging
      console.log(`CitizenMarkers: Loaded ${loadedCitizens.length} citizens`);
      console.log(`CitizenMarkers: Citizens with positions: ${citizensWithPositions.length}`);
      console.log(`CitizenMarkers: Citizens without positions: ${loadedCitizens.length - citizensWithPositions.length}`);
  
      // Log a sample citizen to check position format
      if (citizensWithPositions.length > 0) {
        console.log('CitizenMarkers: Sample citizen position:', citizensWithPositions[0].position);
      } else {
        console.warn('CitizenMarkers: No citizens with valid positions found');
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
    // Ensure we have a valid citizen object before setting it
    if (citizen && (citizen.CitizenId || citizen.id)) {
      setSelectedCitizen(citizen);
    } else {
      console.warn('Attempted to select invalid citizen:', citizen);
    }
  };
  
  const handleCloseDetails = () => {
    setSelectedCitizen(null);
  };
  
  if (!isVisible) return null;
  
  return (
    <>
      {/* Citizen Markers */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        {citizens.map((citizen) => {
          // Log the original position and the transformed screen coordinates
          const originalPos = citizen.position;
          const position = latLngToScreen(citizen.position.lat, citizen.position.lng);
          
          // Debug log to verify position transformation
          if (Math.random() < 0.05) { // Only log ~5% of citizens to avoid console spam
            console.log(`Citizen ${citizen.FirstName} ${citizen.LastName} position:`, {
              original: originalPos,
              screen: position
            });
          }
          
          // Skip if position is off-screen (with some margin)
          if (position.x < -100 || position.x > canvasWidth + 100 || 
              position.y < -100 || position.y > canvasHeight + 100) {
            return null;
          }
          
          // Ensure we have the required properties for display
          const firstName = citizen.FirstName || citizen.firstName || '';
          const lastName = citizen.LastName || citizen.lastName || '';
          const socialClass = citizen.SocialClass || citizen.socialClass || '';
          const citizenId = citizen.CitizenId || citizen.id;
          
          return (
            <div 
              key={citizenId || `citizen-${Math.random()}`}
              className="absolute pointer-events-auto"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                position: 'absolute' // Ensure absolute positioning works
              }}
              onClick={() => handleCitizenClick(citizen)}
            >
              <div 
                className="w-6 h-6 rounded-full cursor-pointer hover:scale-125 transition-transform flex items-center justify-center"
                style={{ 
                  backgroundColor: citizenService.getSocialClassColor(socialClass),
                  border: '2px solid white',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2)'
                }}
                title={`${firstName} ${lastName} (${socialClass})`}
              >
                <span className="text-white text-xs font-bold">
                  {firstName?.[0] || '?'}{lastName?.[0] || '?'}
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
