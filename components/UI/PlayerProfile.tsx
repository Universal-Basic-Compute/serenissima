import React, { useEffect, useState } from 'react';
import AnimatedDucats from './AnimatedDucats';

interface PlayerProfileProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImage?: string | null;
  familyMotto?: string;
  walletAddress?: string; // Add wallet address prop
  computeAmount?: number; // Add this property
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
  showMotto?: boolean;
  showDucats?: boolean; // Add this property to control display
}

// Add a cache for user profiles to avoid redundant fetches
const userProfileCache: Record<string, any> = {};

const PlayerProfile: React.FC<PlayerProfileProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImage,
  familyMotto,
  walletAddress, // New prop
  computeAmount, // New prop
  size = 'medium',
  onClick,
  className = '',
  showMotto = false,
  showDucats = true // Default to showing ducats
}) => {
  // Add state for user data
  const [userData, setUserData] = useState<{
    username: string;
    firstName: string;
    lastName: string;
    coatOfArmsImage: string | null;
    familyMotto?: string;
    computeAmount?: number; // Add this to the state
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
        coatOfArmsImage: coatOfArmsImage || null,
        familyMotto,
        computeAmount // Include the compute amount if provided directly
      });
      return;
    }
    
    // Listen for profile updates
    const handleProfileUpdate = (event: CustomEvent) => {
      if (event.detail && (
          (username && event.detail.user_name === username) || 
          (walletAddress && event.detail.wallet_address === walletAddress)
        )) {
        console.log(`Received profile update for ${username || walletAddress} with compute: ${event.detail.compute_amount}`);
        setUserData({
          username: event.detail.user_name || username || 'Unknown',
          firstName: event.detail.first_name || event.detail.user_name?.split(' ')[0] || firstName || 'Unknown',
          lastName: event.detail.last_name || event.detail.user_name?.split(' ').slice(1).join(' ') || lastName || 'User',
          coatOfArmsImage: event.detail.coat_of_arms_image || coatOfArmsImage,
          familyMotto: event.detail.family_motto || familyMotto,
          computeAmount: event.detail.compute_amount
        });
      }
    };
    
    window.addEventListener('userProfileUpdated', handleProfileUpdate as EventListener);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdate as EventListener);
    };
    
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
            familyMotto: data.family_motto,
            computeAmount: data.compute_amount // Include the compute amount from API response
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
      container: 'w-20', // Increased from w-16
      image: 'w-16 h-16', // Increased from w-12 h-12
      initials: 'w-16 h-16 text-sm', // Increased from w-12 h-12 text-xs
      username: 'text-sm', // Increased from text-xs
      name: 'text-xs'
    },
    medium: {
      container: 'w-32', // Increased from w-24
      image: 'w-24 h-24', // Increased from w-20 h-20
      initials: 'w-24 h-24 text-lg', // Increased from w-20 h-20 text-base
      username: 'text-base font-semibold', // Added font-semibold
      name: 'text-sm'
    },
    large: {
      container: 'w-40', // Increased from w-32
      image: 'w-32 h-32', // Increased from w-28 h-28
      initials: 'w-32 h-32 text-2xl', // Increased from w-28 h-28 text-xl
      username: 'text-lg font-semibold', // Added font-semibold
      name: 'text-base'
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
  
  // Format the ducats with commas for better readability
  const formatDucats = (amount: number = 0) => {
    return amount.toLocaleString();
  };

  // Use either provided data or fetched data
  const displayData = userData || {
    username: username || 'Unknown',
    firstName: firstName || 'Unknown',
    lastName: lastName || 'User',
    coatOfArmsImage: coatOfArmsImage,
    computeAmount: computeAmount !== undefined ? computeAmount : 0,
    // Don't add any default color here
  };

  return (
    <div 
      className={`flex flex-col items-center ${dim.container} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Coat of Arms or Initials */}
      {displayData.coatOfArmsImage ? (
        <div className="rounded-full border-3 border-amber-600 overflow-hidden bg-amber-50 flex items-center justify-center shadow-md">
          <img 
            src={displayData.coatOfArmsImage} 
            alt={`${displayData.username}'s Coat of Arms`}
            className={`${dim.image} object-cover`}
          />
        </div>
      ) : (
        <div className={`${dim.initials} rounded-full border-3 border-amber-600 bg-amber-100 flex items-center justify-center shadow-md`}>
          <span className="text-amber-800 font-bold">
            {displayData.firstName.charAt(0)}{displayData.lastName.charAt(0)}
          </span>
        </div>
      )}
      
      {/* Username */}
      <div className={`${dim.username} font-medium text-center mt-1 w-full`}>
        {displayData.username}
      </div>
      
      {/* Ducats (Compute Amount) */}
      {showDucats && displayData.computeAmount !== undefined && (
        <div className={`${dim.name} text-amber-700 font-semibold text-center w-full flex items-center justify-center mt-1 bg-amber-50 py-1 px-2 rounded-full border border-amber-200`}>
          <span className="mr-1">⚜️</span> 
          <AnimatedDucats 
            value={displayData.computeAmount} 
            suffix="ducats" 
            prefix=""
            className="inline"
          />
        </div>
      )}
      
      {/* Family Motto - Replace the Full Name section */}
      {(userData?.familyMotto || familyMotto) && (
        <div className={`${dim.name} italic text-amber-600 text-center mt-1 w-full overflow-hidden text-ellipsis font-light`}>
          "{userData?.familyMotto || familyMotto}"
        </div>
      )}
    </div>
  );
};

export default PlayerProfile;
