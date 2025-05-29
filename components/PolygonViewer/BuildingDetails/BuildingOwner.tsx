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

interface BuildingOwnerProps {
  owner: string; // This is likely the username or ID of the owner
}

const BuildingOwner: React.FC<BuildingOwnerProps> = ({ owner }) => {
  const [ownerProfile, setOwnerProfile] = useState<CitizenProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Log the received owner prop value
  console.log('[BuildingOwner] Received owner prop:', owner);

  useEffect(() => {
    // Log when the effect runs and with what owner value
    console.log('[BuildingOwner] useEffect triggered with owner:', owner);

    if (owner && owner.trim() !== "") { // Check if owner is not null, undefined, or an empty/whitespace string
      setIsLoading(true);
      setError(null); // Clear previous errors before a new fetch
      setOwnerProfile(null); // Reset previous profile

      // Assuming 'owner' is the username. Adjust if it's an ID.
      fetch(`/api/citizens/${encodeURIComponent(owner.trim())}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Owner profile not found for "${owner}"`);
            }
            throw new Error(`Failed to fetch owner profile: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.citizen) {
            // Map API response to CitizenProfileData
            // Ensure the field names match what PlayerProfile expects or what your API returns
            setOwnerProfile({
              username: data.citizen.username || owner,
              firstName: data.citizen.FirstName || data.citizen.firstName,
              lastName: data.citizen.LastName || data.citizen.lastName,
              // PlayerProfile uses coatOfArmsImageUrl, ensure your API provides this or an equivalent
              coatOfArmsImageUrl: data.citizen.CoatOfArmsImageUrl || data.citizen.coatOfArmsImageUrl,
              imageUrl: data.citizen.ImageUrl || data.citizen.imageUrl, // A more general image if available
              familyMotto: data.citizen.FamilyMotto || data.citizen.familyMotto
            });
          } else {
            throw new Error(data.error || 'Owner profile data is not in expected format.');
          }
        })
        .catch(err => {
          console.error('Error fetching owner profile:', err);
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // Owner is null, undefined, or an empty/whitespace string
      setOwnerProfile(null);
      setIsLoading(false);
      setError(null); // Clear any existing error if owner becomes invalid
      console.log('[BuildingOwner] Owner prop is empty or invalid, clearing profile and error states.');
    }
  }, [owner]);

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
      {isLoading && (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
        </div>
      )}
      {error && !isLoading && (
        <p className="text-center text-red-500 italic">{error}</p>
      )}
      {!isLoading && !error && ownerProfile && (
        <div 
          className="flex flex-col items-center space-y-3 cursor-pointer hover:bg-amber-100 p-2 rounded-md transition-colors duration-150"
          onClick={() => {
            if (ownerProfile) {
              console.log('Emitting showCitizenPanelEvent with owner profile:', ownerProfile);
              eventBus.emit('showCitizenPanelEvent', ownerProfile);
            }
          }}
          title={`View details for ${ownerProfile.firstName} ${ownerProfile.lastName}`}
        >
          <div className="flex space-x-4 items-start">
            {/* Main Image */}
            {ownerProfile.imageUrl && (
              <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-amber-400 shadow-md">
                <img 
                  src={ownerProfile.imageUrl} 
                  alt={`${ownerProfile.firstName} ${ownerProfile.lastName}`} 
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              </div>
            )}
            {/* Coat of Arms */}
            {ownerProfile.coatOfArmsImageUrl && (
              <div className="w-20 h-20 rounded-md overflow-hidden border border-amber-300 shadow-sm">
                <img 
                  src={ownerProfile.coatOfArmsImageUrl} 
                  alt="Coat of Arms" 
                  className="w-full h-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')} 
                />
              </div>
            )}
          </div>
          
          <div className="text-center">
            <p className="text-lg font-semibold text-amber-800">
              {ownerProfile.firstName} {ownerProfile.lastName}
            </p>
            <p className="text-sm text-amber-600">
              {ownerProfile.username}
            </p>
            {ownerProfile.familyMotto && (
              <p className="text-xs italic text-gray-500 mt-1">
                "{ownerProfile.familyMotto}"
              </p>
            )}
          </div>
        </div>
      )}
      {!isLoading && !error && !ownerProfile && !owner && (
         <p className="text-center text-gray-500 italic">No owner information</p>
      )}
       {!isLoading && !error && !ownerProfile && owner && ( // Case where owner prop is present but profile fetch failed or is pending
         <p className="text-center text-gray-500 italic">Loading owner details for {owner}...</p>
      )}
    </div>
  );
};

export default BuildingOwner;
