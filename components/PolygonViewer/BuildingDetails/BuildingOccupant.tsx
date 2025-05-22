import { useState, useEffect } from 'react';
import { eventBus } from '@/lib/utils/eventBus'; // Import eventBus

interface CitizenProfileData {
  username: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null;
  imageUrl?: string | null;
  familyMotto?: string | null;
}

interface BuildingOccupantProps {
  occupant: string; // This is likely the username or ID of the occupant
}

const BuildingOccupant: React.FC<BuildingOccupantProps> = ({ occupant }) => {
  const [occupantProfile, setOccupantProfile] = useState<CitizenProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (occupant && occupant.trim() !== "") {
      setIsLoading(true);
      setError(null);
      setOccupantProfile(null);

      fetch(`/api/citizens/${encodeURIComponent(occupant.trim())}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Occupant profile not found for "${occupant}"`);
            }
            throw new Error(`Failed to fetch occupant profile: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.citizen) {
            setOccupantProfile({
              username: data.citizen.username || occupant,
              firstName: data.citizen.FirstName || data.citizen.firstName,
              lastName: data.citizen.LastName || data.citizen.lastName,
              coatOfArmsImageUrl: data.citizen.CoatOfArmsImageUrl || data.citizen.coatOfArmsImageUrl,
              imageUrl: data.citizen.ImageUrl || data.citizen.imageUrl,
              familyMotto: data.citizen.FamilyMotto || data.citizen.familyMotto
            });
          } else {
            throw new Error(data.error || 'Occupant profile data is not in expected format.');
          }
        })
        .catch(err => {
          console.error('Error fetching occupant profile:', err);
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setOccupantProfile(null);
      setIsLoading(false);
      setError(null);
    }
  }, [occupant]);

  if (!occupant) return null;

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Occupant</h3>
      {isLoading && (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
        </div>
      )}
      {error && !isLoading && (
        <p className="text-center text-red-500 italic">{error}</p>
      )}
      {!isLoading && !error && occupantProfile && (
        <div 
          className="flex flex-col items-center space-y-3 cursor-pointer hover:bg-amber-100 p-2 rounded-md transition-colors duration-150"
          onClick={() => {
            if (occupantProfile) {
              eventBus.emit('showCitizenPanelEvent', occupantProfile);
            }
          }}
          title={`View details for ${occupantProfile.firstName} ${occupantProfile.lastName}`}
        >
          <div className="flex space-x-4 items-start">
            {occupantProfile.imageUrl && (
              <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-amber-400 shadow-md">
                <img 
                  src={occupantProfile.imageUrl} 
                  alt={`${occupantProfile.firstName} ${occupantProfile.lastName}`} 
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              </div>
            )}
            {occupantProfile.coatOfArmsImageUrl && (
              <div className="w-20 h-20 rounded-md overflow-hidden border border-amber-300 shadow-sm">
                <img 
                  src={occupantProfile.coatOfArmsImageUrl} 
                  alt="Coat of Arms" 
                  className="w-full h-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              </div>
            )}
          </div>
          
          <div className="text-center">
            <p className="text-lg font-semibold text-amber-800">
              {occupantProfile.firstName} {occupantProfile.lastName}
            </p>
            <p className="text-sm text-amber-600">
              {occupantProfile.username}
            </p>
            {occupantProfile.familyMotto && (
              <p className="text-xs italic text-gray-500 mt-1">
                "{occupantProfile.familyMotto}"
              </p>
            )}
          </div>
        </div>
      )}
      {!isLoading && !error && !occupantProfile && occupant && (
         <p className="text-center text-gray-500 italic">Loading occupant details for {occupant}...</p>
      )}
      {!isLoading && !error && !occupantProfile && !occupant && (
         <p className="text-center text-gray-500 italic">No occupant information</p>
      )}
    </div>
  );
};

export default BuildingOccupant;
