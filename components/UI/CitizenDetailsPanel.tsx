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
  // Add new state for activities
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  
  // Add function to fetch citizen activities
  const fetchCitizenActivities = async (citizenId: string) => {
    if (!citizenId) return;
    
    setIsLoadingActivities(true);
    try {
      const response = await fetch(`/api/activities?citizenId=${citizenId}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
        console.log(`Loaded ${data.activities?.length || 0} activities for citizen ${citizenId}`);
      } else {
        // Change from console.error to console.warn for 404 responses
        if (response.status === 404) {
          console.warn(`No activities found for citizen ${citizenId}: ${response.status} ${response.statusText}`);
        } else {
          console.warn(`Failed to fetch activities for citizen ${citizenId}: ${response.status} ${response.statusText}`);
        }
        setActivities([]);
      }
    } catch (error) {
      console.warn('Error fetching citizen activities:', error);
      setActivities([]);
    } finally {
      setIsLoadingActivities(false);
    }
  };
  
  useEffect(() => {
    // Animate in when component mounts
    setIsVisible(true);
    
    // Reset states when citizen changes
    setHomeBuilding(null);
    setWorkBuilding(null);
    setIsLoadingBuildings(false);
    setActivities([]);
    
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
    
    // Fetch citizen activities
    if (citizen && citizen.citizenid) {
      fetchCitizenActivities(citizen.citizenid);
    }
    
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [citizen]);
  
  const handleClose = () => {
    // Animate out before closing
    setIsVisible(false);
    // Use a shorter timeout to make the closing more responsive
    setTimeout(() => {
      onClose();
    }, 200); // Reduced from 300ms to 200ms for faster response
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
  
  // Add a helper function to format activity type
  const formatActivityType = (type: string): string => {
    if (!type) return 'Unknown';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  };
  
  // Add a helper function to format date in a readable way
  const formatActivityDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      
      // Subtract 500 years from the year for Renaissance setting
      date.setFullYear(date.getFullYear() - 500);
      
      // Format as "Month Day, Year at HH:MM"
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };
  
  // Add a helper function to get activity icon based on type
  const getActivityIcon = (type: string): JSX.Element => {
    const lowerType = type?.toLowerCase() || '';
    
    if (lowerType.includes('transport') || lowerType.includes('move')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      );
    } else if (lowerType.includes('trade') || lowerType.includes('buy') || lowerType.includes('sell')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    } else if (lowerType.includes('work') || lowerType.includes('labor')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    } else if (lowerType.includes('craft') || lowerType.includes('create') || lowerType.includes('produce')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    }
    
    // Default icon
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
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
          className="text-amber-600 hover:text-amber-800 transition-colors p-2" // Added padding for larger click area
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
      
      {/* Recent Activities Section */}
      <div className="mb-6">
        <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Recent Activities</h3>
        
        {isLoadingActivities ? (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : activities.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {activities.map((activity, index) => (
              <div key={activity.ActivityId || index} className="bg-amber-100 rounded-lg p-2 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-amber-700">
                    {getActivityIcon(activity.Type)}
                  </div>
                  <div className="font-medium text-amber-800">
                    {formatActivityType(activity.Type)}
                  </div>
                  <div className="ml-auto text-xs text-amber-600">
                    {formatActivityDate(activity.EndDate || activity.StartDate || activity.CreatedAt)}
                  </div>
                </div>
                
                {activity.FromBuilding && activity.ToBuilding && (
                  <div className="flex items-center text-xs text-amber-700 mb-1">
                    <span className="font-medium">{activity.FromBuilding}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <span className="font-medium">{activity.ToBuilding}</span>
                  </div>
                )}
                
                {activity.ResourceId && activity.Amount && (
                  <div className="text-xs text-amber-700 mb-1">
                    <span className="font-medium">{activity.Amount}</span> units of <span className="font-medium">{activity.ResourceId}</span>
                  </div>
                )}
                
                {activity.Notes && (
                  <div className="text-xs italic text-amber-600 mt-1">
                    {activity.Notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-amber-700 italic">No recent activities found.</p>
        )}
      </div>
      
      <div className="mt-4 text-xs text-amber-500 italic text-center">
        Citizen of Venice since {formatDate(citizen.createdat)}
      </div>
    </div>
  );
};

export default CitizenDetailsPanel;
