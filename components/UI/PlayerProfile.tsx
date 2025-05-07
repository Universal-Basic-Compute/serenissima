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
  size?: 'tiny' | 'small' | 'medium' | 'large';
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
  
  // Scrollbar styles
  const scrollbarStyles = `
    .scrollbar-thin::-webkit-scrollbar {
      width: 6px;
    }
    
    .scrollbar-thin::-webkit-scrollbar-track {
      background: var(--scrollbar-track, #f5e9c8);
      border-radius: 3px;
    }
    
    .scrollbar-thin::-webkit-scrollbar-thumb {
      background-color: var(--scrollbar-thumb, #d97706);
      border-radius: 3px;
    }
    
    .scrollbar-thin::-webkit-scrollbar-thumb:hover {
      background-color: var(--scrollbar-thumb-hover, #b45309);
    }
    
    /* For Firefox */
    .scrollbar-thin {
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar-thumb, #d97706) var(--scrollbar-track, #f5e9c8);
    }
    
    /* Hide scrollbar when not needed */
    .scrollbar-thin {
      overflow-y: auto;
      scrollbar-width: thin;
    }
    
    @media (max-width: 640px) {
      .scrollbar-thin {
        max-height: 80vh;
      }
    }
  `;

  // Add the scrollbar styles to the document
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = scrollbarStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      // Clean up the styles when the component unmounts
      document.head.removeChild(styleElement);
    };
  }, []);

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
    
  }, [walletAddress, username, firstName, lastName, coatOfArmsImage]);

  // Determine sizes based on the size prop
  const dimensions = {
    tiny: {
      container: 'w-16 max-w-full',
      image: 'w-12 h-12',
      initials: 'w-12 h-12 text-xs',
      username: 'text-xs',
      name: 'text-xs'
    },
    small: {
      container: 'w-20 max-w-full', // Added max-w-full
      image: 'w-16 h-16', // Increased from w-12 h-12
      initials: 'w-16 h-16 text-sm', // Increased from w-12 h-12 text-xs
      username: 'text-sm', // Increased from text-xs
      name: 'text-xs'
    },
    medium: {
      container: 'w-32 max-w-full', // Added max-w-full
      image: 'w-24 h-24', // Increased from w-20 h-20
      initials: 'w-24 h-24 text-lg', // Increased from w-20 h-20 text-base
      username: 'text-base font-semibold', // Added font-semibold
      name: 'text-sm'
    },
    large: {
      container: 'w-40 max-w-full', // Added max-w-full
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
      {/* Create a scrollable container for the content */}
      <div className="w-full overflow-y-auto max-h-full scrollbar-thin scrollbar-thumb-amber-400 scrollbar-track-amber-100">
        {/* Coat of Arms or Initials */}
        {displayData.coatOfArmsImage ? (
          <div className="rounded-full border-3 border-amber-600 overflow-hidden bg-amber-50 flex items-center justify-center shadow-md mx-auto">
            <img 
              src={displayData.coatOfArmsImage} 
              alt={`${displayData.username}'s Coat of Arms`}
              className={`${dim.image} object-cover`}
            />
          </div>
        ) : (
          <div className={`${dim.initials} rounded-full border-3 border-amber-600 bg-amber-100 flex items-center justify-center shadow-md mx-auto`}>
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
      
      {/* Add responsive styles for very small screens */}
      <style jsx>{`
        @media (max-width: 320px) {
          .${dim.container} {
            width: 100%;
            padding: 0 8px;
          }
          
          .${dim.image}, .${dim.initials} {
            width: 80%;
            height: auto;
            aspect-ratio: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default PlayerProfile;
