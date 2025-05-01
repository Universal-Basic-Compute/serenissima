import React, { useEffect, useState } from 'react';

interface PlayerProfileProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImage?: string | null;
  walletAddress?: string; // Add wallet address prop
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
}

// Add a cache for user profiles to avoid redundant fetches
const userProfileCache: Record<string, any> = {};

const PlayerProfile: React.FC<PlayerProfileProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImage,
  walletAddress, // New prop
  size = 'medium',
  onClick,
  className = ''
}) => {
  // Add state for user data
  const [userData, setUserData] = useState<{
    username: string;
    firstName: string;
    lastName: string;
    coatOfArmsImage: string | null;
    familyMotto?: string;
  } | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data if wallet address is provided but no direct data
  useEffect(() => {
    // If we already have the username and other data, use that
    if (username && firstName && lastName) {
      setUserData({
        username,
        firstName,
        lastName,
        coatOfArmsImage: coatOfArmsImage || null
      });
      return;
    }
    
    // If we have a wallet address, fetch the user data
    if (walletAddress) {
      // Check cache first
      if (userProfileCache[walletAddress]) {
        setUserData(userProfileCache[walletAddress]);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      fetch(`http://localhost:8000/api/wallet/${walletAddress}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch user data: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          const profileData = {
            username: data.user_name || 'Unknown User',
            firstName: data.first_name || data.user_name?.split(' ')[0] || 'Unknown',
            lastName: data.last_name || data.user_name?.split(' ').slice(1).join(' ') || 'User',
            coatOfArmsImage: data.coat_of_arms_image,
            familyMotto: data.family_motto
          };
          
          // Store in cache
          userProfileCache[walletAddress] = profileData;
          
          setUserData(profileData);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Error fetching user data:', err);
          setError(err.message);
          setIsLoading(false);
          
          // Set fallback data
          setUserData({
            username: 'Unknown User',
            firstName: 'Unknown',
            lastName: 'User',
            coatOfArmsImage: null
          });
        });
    }
  }, [walletAddress, username, firstName, lastName, coatOfArmsImage]);

  // Determine sizes based on the size prop
  const dimensions = {
    small: {
      container: 'w-16',
      image: 'w-12 h-12',
      initials: 'w-12 h-12 text-xs',
      username: 'text-xs',
      name: 'text-xs'
    },
    medium: {
      container: 'w-24',
      image: 'w-20 h-20',
      initials: 'w-20 h-20 text-base',
      username: 'text-sm',
      name: 'text-xs'
    },
    large: {
      container: 'w-32',
      image: 'w-28 h-28',
      initials: 'w-28 h-28 text-xl',
      username: 'text-base',
      name: 'text-sm'
    }
  };

  const dim = dimensions[size];
  
  // Show loading state
  if (isLoading) {
    return (
      <div className={`flex flex-col items-center ${dim.container} ${className}`}>
        <div className={`${dim.image} rounded-full border-2 border-amber-300 bg-amber-50 flex items-center justify-center`}>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-700"></div>
        </div>
        <div className={`${dim.username} text-center mt-1 text-gray-400`}>Loading...</div>
      </div>
    );
  }
  
  // Use either provided data or fetched data
  const displayData = userData || {
    username: username || 'Unknown',
    firstName: firstName || 'Unknown',
    lastName: lastName || 'User',
    coatOfArmsImage: coatOfArmsImage
  };

  return (
    <div 
      className={`flex flex-col items-center ${dim.container} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Coat of Arms or Initials */}
      {displayData.coatOfArmsImage ? (
        <div className="rounded-full border-2 border-amber-600 overflow-hidden bg-amber-50">
          <img 
            src={displayData.coatOfArmsImage} 
            alt={`${displayData.username}'s Coat of Arms`}
            className={`${dim.image} object-cover`}
          />
        </div>
      ) : (
        <div className={`${dim.initials} rounded-full border-2 border-amber-600 bg-amber-100 flex items-center justify-center`}>
          <span className="text-amber-800 font-bold">
            {displayData.firstName.charAt(0)}{displayData.lastName.charAt(0)}
          </span>
        </div>
      )}
      
      {/* Username */}
      <div className={`${dim.username} font-medium text-center mt-1 truncate w-full`}>
        {displayData.username}
      </div>
      
      {/* Full Name */}
      <div className={`${dim.name} text-gray-600 text-center truncate w-full`}>
        {displayData.firstName} {displayData.lastName}
      </div>
      
      {/* Family Motto (optional) */}
      {userData?.familyMotto && (
        <div className={`${dim.name} italic text-amber-600 text-center mt-1 truncate w-full`}>
          "{userData.familyMotto}"
        </div>
      )}
    </div>
  );
};

export default PlayerProfile;
