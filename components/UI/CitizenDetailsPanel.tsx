import React, { useState, useEffect } from 'react';
import { Citizen } from '@/components/PolygonViewer/types';

interface CitizenDetailsPanelProps {
  citizen: Citizen;
  onClose: () => void;
}

const CitizenDetailsPanel: React.FC<CitizenDetailsPanelProps> = ({ citizen, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  // Add state for home and work buildings
  const [homeBuilding, setHomeBuilding] = useState<any>(null);
  const [workBuilding, setWorkBuilding] = useState<any>(null);
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false);
  
  useEffect(() => {
    // Animate in when component mounts
    setIsVisible(true);
    
    // Reset building states when citizen changes
    setHomeBuilding(null);
    setWorkBuilding(null);
    setIsLoadingBuildings(false);
    
    // Add escape key handler
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    
    // Fetch building details if citizen has home or work
    const fetchBuildingDetails = async () => {
      if (!citizen) return;
      
      // Check if citizen has home or work buildings
      const homeId = citizen.home;
      const workId = citizen.work;
      
      if (!homeId && !workId) return;
      
      setIsLoadingBuildings(true);
      
      try {
        // Fetch home building if exists
        if (homeId) {
          const homeResponse = await fetch(`/api/buildings/${homeId}`);
          if (homeResponse.ok) {
            const homeData = await homeResponse.json();
            setHomeBuilding(homeData.building || homeData);
          }
        }
        
        // Fetch work building if exists
        if (workId) {
          const workResponse = await fetch(`/api/buildings/${workId}`);
          if (workResponse.ok) {
            const workData = await workResponse.json();
            setWorkBuilding(workData.building || workData);
          }
        }
      } catch (error) {
        console.error('Error fetching building details:', error);
      } finally {
        setIsLoadingBuildings(false);
      }
    };
    
    fetchBuildingDetails();
    
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [citizen]);
  
  const handleClose = () => {
    // Animate out before closing
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };
  
  const formatDucats = (amount: number | string) => {
    if (!amount && amount !== 0) return 'Unknown';
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(numericAmount) ? 'Unknown' : numericAmount.toLocaleString() + ' ⚜️'; // Using lys emoji instead of ₫
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      
      // Convert modern date to Renaissance era (1500s)
      // Simply replace the year with 1525 to place it in Renaissance Venice
      const renaissanceDate = new Date(date);
      renaissanceDate.setFullYear(1525);
      
      // Format as "Month Day, Year" without the time
      return renaissanceDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (e) {
      return 'Unknown date';
    }
  };
  
  // Add a helper function to format building type
  const formatBuildingType = (type: string): string => {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  };
  
  if (!citizen) return null;
  
  // Determine social class color
  const getSocialClassColor = (socialClass: string): string => {
    switch (socialClass?.toLowerCase()) {
      case 'nobili':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'; // Gold
      case 'cittadini':
        return 'bg-blue-100 text-blue-800 border-blue-300'; // Blue
      case 'popolani':
        return 'bg-amber-100 text-amber-800 border-amber-300'; // Brown
      case 'facchini':
      case 'laborer':
        return 'bg-gray-100 text-gray-800 border-gray-300'; // Gray
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300'; // Default
    }
  };
  
  const socialClassStyle = getSocialClassColor(citizen.socialclass);
  
  return (
    <div 
      className={`fixed top-20 right-4 bg-amber-50 border-2 border-amber-700 rounded-lg p-6 shadow-lg max-w-md z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-serif text-amber-800">
          {citizen.firstname} {citizen.lastname}
        </h2>
        <button 
          onClick={handleClose}
          className="text-amber-600 hover:text-amber-800 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="flex flex-col items-center mb-6">
        {/* Much larger image */}
        <div className="w-48 h-48 mb-4 relative">
          {citizen.imageurl ? (
            <img 
              src={citizen.imageurl.endsWith('.jpg') ? citizen.imageurl : `/images/citizens/${citizen.citizenid}.jpg`} 
              alt={`${citizen.firstname} ${citizen.lastname}`} 
              className="w-full h-full object-cover rounded-lg border-2 border-amber-600 shadow-lg"
              onLoad={(e) => {
                console.log(`Successfully loaded citizen image: ${(e.target as HTMLImageElement).src}`);
              }}
              onError={(e) => {
                // Log the error
                console.error(`Failed to load citizen image: ${(e.target as HTMLImageElement).src}`);
                
                // Try to fetch the image directly to see if it exists
                fetch((e.target as HTMLImageElement).src, { method: 'HEAD' })
                  .then(response => {
                    console.log(`Image HEAD request returned: ${response.status} ${response.statusText}`);
                  })
                  .catch(error => {
                    console.error(`Image HEAD request failed: ${error}`);
                  });
                
                // Fallback if image fails to load
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                  <div class="w-full h-full bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                `;
              }}
            />
          ) : (
            <img 
              src={`/images/citizens/${citizen.citizenid}.jpg`}
              alt={`${citizen.firstname} ${citizen.lastname}`} 
              className="w-full h-full object-cover rounded-lg border-2 border-amber-600 shadow-lg"
              onLoad={(e) => {
                console.log(`Successfully loaded citizen image: ${(e.target as HTMLImageElement).src}`);
              }}
              onError={(e) => {
                // Log the error
                console.error(`Failed to load citizen image: ${(e.target as HTMLImageElement).src}`);
                
                // Fallback if image fails to load
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                  <div class="w-full h-full bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                `;
              }}
            />
          )}
        </div>
        
        {/* Social class and wealth info */}
        <div className="text-center">
          <div className={`px-3 py-1.5 rounded-full text-sm font-medium inline-block mb-2 ${socialClassStyle}`}>
            {citizen.socialclass}
          </div>
          
          <div className="text-amber-700 text-sm font-medium">
            Wealth: {formatDucats(citizen.wealth)}
          </div>
        </div>
      </div>
      
      {/* Add Home and Work section */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Home</h3>
          <div className="bg-amber-100 p-3 rounded-lg">
            {isLoadingBuildings ? (
              <p className="text-amber-700 italic">Loading...</p>
            ) : homeBuilding ? (
              <div>
                <p className="text-amber-800 font-medium">{homeBuilding.name || formatBuildingType(homeBuilding.type)}</p>
                <p className="text-amber-700 text-sm">{formatBuildingType(homeBuilding.type)}</p>
              </div>
            ) : (
              <p className="text-amber-700 italic">Homeless</p>
            )}
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Work</h3>
          <div className="bg-amber-100 p-3 rounded-lg">
            {isLoadingBuildings ? (
              <p className="text-amber-700 italic">Loading...</p>
            ) : workBuilding ? (
              <div>
                <p className="text-amber-800 font-medium">{workBuilding.name || formatBuildingType(workBuilding.type)}</p>
                <p className="text-amber-700 text-sm">{formatBuildingType(workBuilding.type)}</p>
              </div>
            ) : (
              <p className="text-amber-700 italic">Unemployed</p>
            )}
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">About</h3>
        <p className="text-amber-700 italic">{citizen.description || 'No description available.'}</p>
      </div>
      
      <div className="mt-4 text-xs text-amber-500 italic text-center">
        Citizen of Venice since {formatDate(citizen.createdat)}
      </div>
    </div>
  );
};

export default CitizenDetailsPanel;
