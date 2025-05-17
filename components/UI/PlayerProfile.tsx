import React, { useEffect, useState } from 'react';
import AnimatedDucats from './AnimatedDucats';

interface PlayerProfileProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImage?: string | null;
  familyMotto?: string;
  walletAddress?: string; // Add wallet address prop
  Ducats?: number; // Add this property
  size?: 'tiny' | 'small' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
  showMotto?: boolean;
  showDucats?: boolean; // Add this property to control display
  onSettingsClick?: () => void; // Add this new prop
}

// Add a cache for citizen profiles to avoid redundant fetches
const citizenProfileCache: Record<string, any> = {};

const PlayerProfile: React.FC<PlayerProfileProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImage,
  familyMotto,
  walletAddress, // New prop
  Ducats, // New prop
  size = 'medium',
  onClick,
  className = '',
  showMotto = false,
  showDucats = true, // Default to showing ducats
  onSettingsClick
}) => {
  // Add state for citizen data
  const [citizenData, setCitizenData] = useState<{
    username: string;
    firstName: string;
    lastName: string;
    coatOfArmsImage: string | null;
    familyMotto?: string;
    Ducats?: number; // Add this to the state
  } | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // No scrollbar styles needed

  // Fetch citizen data if wallet address is provided but no direct data
  useEffect(() => {
    // If we already have the username and other data, use that
    if (username && firstName && lastName) {
      setCitizenData({
        username,
        firstName,
        lastName,
        coatOfArmsImage: coatOfArmsImage || null,
        familyMotto,
        Ducats // Include the Ducats if provided directly
      });
      return;
    }
    
    // Listen for profile updates
    const handleProfileUpdate = (event: CustomEvent) => {
      if (event.detail && (
          (username && event.detail.citizen_name === username) || 
          (walletAddress && event.detail.wallet_address === walletAddress)
        )) {
        console.log(`Received profile update for ${username || walletAddress} with compute: ${event.detail.ducats}`);
        setCitizenData({
          username: event.detail.citizen_name || username || 'Unknown',
          firstName: event.detail.first_name || event.detail.citizen_name?.split(' ')[0] || firstName || 'Unknown',
          lastName: event.detail.last_name || event.detail.citizen_name?.split(' ').slice(1).join(' ') || lastName || 'Citizen',
          coatOfArmsImage: event.detail.coat_of_arms_image || coatOfArmsImage,
          familyMotto: event.detail.family_motto || familyMotto,
          Ducats: event.detail.ducats
        });
      }
    };
    
    window.addEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    };
    
  }, [walletAddress, username, firstName, lastName, coatOfArmsImage]);

  // Determine sizes based on the size prop
  const dimensions = {
    tiny: {
      container: 'w-14 max-w-full',
      image: 'w-10 h-10',
      initials: 'w-10 h-10 text-xs',
      username: 'text-xs truncate',
      name: 'text-xs truncate'
    },
    small: {
      container: 'w-18 max-w-full',
      image: 'w-14 h-14',
      initials: 'w-14 h-14 text-sm',
      username: 'text-sm truncate',
      name: 'text-xs truncate'
    },
    medium: {
      container: 'w-32 max-w-full',
      image: 'w-24 h-24',
      initials: 'w-24 h-24 text-lg',
      username: 'text-base font-semibold truncate',
      name: 'text-sm truncate'
    },
    large: {
      container: 'w-40 max-w-full',
      image: 'w-32 h-32',
      initials: 'w-32 h-32 text-2xl',
      username: 'text-lg font-semibold truncate',
      name: 'text-base truncate'
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
  const displayData = citizenData || {
    username: username || 'Unknown',
    firstName: firstName || 'Unknown',
    lastName: lastName || 'Citizen',
    coatOfArmsImage: coatOfArmsImage,
    Ducats: Ducats !== undefined ? Ducats : 0,
    // Don't add any default color here
  };

  return (
    <div 
      className={`flex flex-col items-center ${dim.container} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Create a flex container for the content */}
      <div className="w-full flex flex-col items-center">
        {/* Coat of Arms or Initials */}
        {displayData.coatOfArmsImage ? (
          <div className="rounded-full border-3 border-amber-600 overflow-hidden bg-amber-50 flex items-center justify-center shadow-md mx-auto">
            <img 
              src={displayData.coatOfArmsImage} 
              alt={`${displayData.username}'s Coat of Arms`}
              className={`${dim.image} object-cover`}
              onError={(e) => {
                console.error('Error loading coat of arms image in PlayerProfile:', displayData.coatOfArmsImage);
                // Fallback to initials if image fails to load
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  parent.innerHTML += `<div class="${dim.initials} flex items-center justify-center"><span class="text-amber-800 font-bold">${displayData.firstName.charAt(0)}${displayData.lastName.charAt(0)}</span></div>`;
                }
              }}
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
        <div className={`${dim.username} font-medium text-center mt-1 w-full username-text truncate px-1`}>
          {displayData.username}
        </div>
        
        {/* Ducats (Ducats) */}
        {showDucats && displayData.Ducats !== undefined && (
          <div className={`${dim.name} text-amber-700 font-semibold text-center w-full flex items-center justify-center mt-1 bg-amber-50 py-1 px-2 rounded-full border border-amber-200 ducats-text truncate`}>
            <span className="mr-1">⚜️</span> 
            <AnimatedDucats 
              value={displayData.Ducats} 
              suffix="ducats" 
              prefix=""
              className="inline truncate"
            />
          </div>
        )}
        
        {/* Family Motto - Replace the Full Name section */}
        {(citizenData?.familyMotto || familyMotto) && (
          <div className={`${dim.name} italic text-amber-600 text-center mt-1 w-full font-light motto-text line-clamp-2`}>
            "{citizenData?.familyMotto || familyMotto}"
          </div>
        )}
      </div>
      
      {/* Add responsive styles for very small screens */}
      <style jsx>{`
        @media (max-width: 320px) {
          .${dim.container} {
            width: 100%;
            padding: 0 4px;
          }
          
          .${dim.image}, .${dim.initials} {
            width: 80%;
            height: auto;
            aspect-ratio: 1;
          }
        }
        
        /* Add responsive text sizing */
        @media (max-width: 480px) {
          .username-text {
            font-size: 0.75rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .motto-text {
            font-size: 0.7rem;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .ducats-text {
            font-size: 0.7rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PlayerProfile;
