import { useState, useEffect } from 'react';
import PlayerProfile from '../../UI/PlayerProfile';

interface CitizenProfileData {
  username: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null; // This corresponds to PlayerProfile's coatOfArmsImageUrl
  imageUrl?: string | null; // General image URL, if different
  // Add other fields if needed, like Ducats, familyMotto, etc.
}

interface BuildingOwnerProps {
  owner: string; // This is likely the username or ID of the owner
}

const BuildingOwner: React.FC<BuildingOwnerProps> = ({ owner }) => {
  const [ownerProfile, setOwnerProfile] = useState<CitizenProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (owner) {
      setIsLoading(true);
      setError(null);
      setOwnerProfile(null); // Reset previous profile

      // Assuming 'owner' is the username. Adjust if it's an ID.
      fetch(`/api/citizens/${encodeURIComponent(owner)}`)
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
              coatOfArmsImageUrl: data.citizen.CoatOfArmsImageUrl || data.citizen.coatOfArmsImageUrl || data.citizen.imageUrl,
              imageUrl: data.citizen.ImageUrl || data.citizen.imageUrl // A more general image if available
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
      setOwnerProfile(null);
      setIsLoading(false);
      setError(null);
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
        <div className="flex items-center justify-center">
          <PlayerProfile
            username={ownerProfile.username}
            firstName={ownerProfile.firstName}
            lastName={ownerProfile.lastName}
            coatOfArmsImageUrl={ownerProfile.coatOfArmsImageUrl || ownerProfile.imageUrl}
            // walletAddress could be ownerProfile.username or a specific wallet field if available
            walletAddress={ownerProfile.username} 
            size="medium"
            className="mx-auto"
          />
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
