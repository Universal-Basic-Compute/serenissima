import React, { useEffect, useState } from 'react';
import AnimatedDucats from './AnimatedDucats';

interface PlayerProfileProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null; // For actual coat of arms display
  imageUrl?: string | null; // For main profile image
  familyMotto?: string;
  walletAddress?: string; // Add wallet address prop
  Ducats?: number; // Add this property
  influence?: number; // Add influence property
  size?: 'tiny' | 'small' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
  showMotto?: boolean;
  showDucats?: boolean; // Add this property to control display
  showInfluence?: boolean; // Add this property to control influence display
  onSettingsClick?: () => void; // Add this new prop
}

// Add a cache for citizen profiles to avoid redundant fetches
const citizenProfileCache: Record<string, any> = {};

const PlayerProfile: React.FC<PlayerProfileProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImageUrl,
  imageUrl: profileImgUrl, // Ajout de la prop imageUrl, aliasée en profileImgUrl
  familyMotto,
  walletAddress, // New prop
  Ducats, // New prop
  influence, // Add influence to destructuring
  size = 'medium',
  onClick,
  className = '',
  showMotto = false,
  showDucats = true, // Default to showing ducats
  showInfluence = true, // Default to showing influence
  onSettingsClick
}) => {
  // Add state for citizen data
  const [citizenData, setCitizenData] = useState<{
    username: string;
    firstName: string;
    lastName: string;
    coatOfArmsImageUrl: string | null; // For actual coat of arms display
    imageUrl: string | null; // For main profile image
    familyMotto?: string;
    Ducats?: number; // Add this to the state
    influence?: number; // Add influence to the state
    socialClass?: string; // Add socialClass to the state type
  } | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // No scrollbar styles needed

  // Fetch citizen data if wallet address is provided but no direct data
  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent) => {
      const profileDetail = event.detail;
      if (!profileDetail) return;

      // Update if the event matches the component's specific username or walletAddress prop
      const specificUserMatch = (username && profileDetail.citizen_name === username) ||
                               (walletAddress && profileDetail.wallet_address === walletAddress);

      // If PlayerProfile is used without username/walletAddress (e.g. for current user display in WalletButton),
      // it might listen for any 'citizenProfileUpdated' if profileDetail indicates it's for 'self'.
      // For now, we'll keep it simple: only update if props match.
      // Add `profileDetail.isSelf` or similar flag in the event if generic updates are needed.
      if (specificUserMatch) {
        console.log(`PlayerProfile: Event update for ${profileDetail.citizen_name}`);
        setCitizenData({
          username: profileDetail.username || profileDetail.citizen_name, // Prefer camelCase
          firstName: profileDetail.firstName || profileDetail.first_name,
          lastName: profileDetail.lastName || profileDetail.last_name,
          coatOfArmsImageUrl: profileDetail.coatOfArmsImageUrl || profileDetail.coat_of_arms_image, // For actual CoA
          imageUrl: profileDetail.imageUrl || profileDetail.image_url, // For main profile image
          familyMotto: profileDetail.familyMotto || profileDetail.family_motto,
          Ducats: profileDetail.ducats, // Expect lowercase 'ducats' from normalized event
          influence: profileDetail.influence, // Expect lowercase 'influence'
          socialClass: profileDetail.socialClass || profileDetail.social_class // Prefer camelCase
        });
      }
    };

    window.addEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    };
  }, [username, walletAddress]); // Effect only re-subscribes if identifier props change

  // Determine sizes based on the size prop
  const dimensions = {
    tiny: { // Good for lists, very compact
      container: 'w-20', // Overall width
      // Image section takes full width of container and is square
      // coatOfArmsContainer is removed as PlayerProfile uses its single image prop as the main image
      nameOverlayPadding: 'p-1',
      nameText: 'text-xs',
      socialClassText: 'text-[0.6rem] px-1 py-0', // Tiny text for social class
      // ducatsOverlayPos: 'top-1 right-1', // Removed
      ducatsIconSize: 'text-[0.5rem]',
      ducatsTextSize: 'text-xs', // Increased size
      // Username and Motto below
      username: 'text-[0.65rem] truncate mt-0.5',
      name: 'text-[0.6rem] truncate' // Used for motto if shown
    },
    small: { // Good for cards or slightly larger lists
      container: 'w-32',
      // coatOfArmsContainer removed
      nameOverlayPadding: 'p-2',
      nameText: 'text-sm',
      socialClassText: 'text-xs',
      // ducatsOverlayPos: 'top-1.5 right-1.5', // Removed
      ducatsIconSize: 'text-xs',
      ducatsTextSize: 'text-base', // Increased size
      username: 'text-xs truncate mt-1',
      name: 'text-xs truncate'
    },
    medium: { // Default, good for sidebars or prominent displays
      container: 'w-48',
      // coatOfArmsContainer removed
      nameOverlayPadding: 'p-3',
      nameText: 'text-lg',
      socialClassText: 'text-sm',
      // ducatsOverlayPos: 'top-2 right-2', // Removed
      ducatsIconSize: 'text-sm',
      ducatsTextSize: 'text-lg', // Increased size
      username: 'text-sm truncate mt-1',
      name: 'text-sm truncate'
    },
    large: { // For main profile views
      container: 'w-64',
      // coatOfArmsContainer removed
      nameOverlayPadding: 'p-4',
      nameText: 'text-xl',
      socialClassText: 'text-base',
      // ducatsOverlayPos: 'top-3 right-3', // Removed
      ducatsIconSize: 'text-base',
      ducatsTextSize: 'text-xl', // Increased size
      username: 'text-base truncate mt-2',
      name: 'text-base truncate'
    }
  };

  const dim = dimensions[size];
  
  // Show loading state
  if (isLoading) {
    return (
      <div className={`flex flex-col items-center ${dim.container} ${className}`}>
        {/* Use a generic placeholder for the image area during loading */}
        <div className={`w-full aspect-square rounded-lg border-2 border-amber-300 bg-amber-50 flex items-center justify-center`}>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-700"></div>
        </div>
        <div className={`${dim.username} text-center mt-1 text-gray-400`}>Loading...</div>
      </div>
    );
  }
  
  // Format the ducats with commas for better readability
  const formatDucats = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return '0'; // Default to 0 if undefined
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return '0';
    return numericAmount.toLocaleString();
  };

  // Use either provided data or fetched data
  // Prioritize citizenData (from event/fetch), then fall back to props.
  const sourceData = citizenData || {
    username: username, // prop
    firstName: firstName, // prop
    lastName: lastName, // prop
    coatOfArmsImageUrl: coatOfArmsImageUrl, // prop for actual coat of arms
    imageUrl: profileImgUrl, // Use the renamed prop here
    familyMotto: familyMotto, // prop
    Ducats: Ducats, // prop
    influence: influence, // prop
    socialClass: undefined // Social class typically comes from fetched/event data or props
  };

  // Consolidate and provide final defaults for displayData
  const displayData = {
    username: sourceData.username ?? 'Unknown',
    firstName: sourceData.firstName ?? 'Unknown',
    lastName: sourceData.lastName ?? 'Citizen',
    coatOfArmsImageUrl: sourceData.coatOfArmsImageUrl ?? null, // For actual CoA display
    imageUrl: sourceData.imageUrl ?? null, // This remains sourceData.imageUrl, which now gets its value from profileImgUrl
    familyMotto: sourceData.familyMotto, // familyMotto can be undefined; handled by showMotto prop
    Ducats: Math.floor(sourceData.Ducats ?? 0), // Ensure Ducats is an integer, defaulting to 0
    influence: Math.floor(sourceData.influence ?? 0), // Ensure influence is an integer, defaulting to 0
    socialClass: sourceData.socialClass ?? 'Popolani' // Default social class
  };
  
  // Determine social class color
  const getSocialClassColor = (socialClass: string | undefined): string => {
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

  const socialClassStyle = getSocialClassColor(displayData.socialClass);

  return (
    <div 
      className={`${dim.container} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="w-full aspect-square relative overflow-hidden rounded-lg border-2 border-amber-600 shadow-lg">
        {/* Main citizen image - now using imageUrl */}
        {displayData.imageUrl ? (
          <img 
            src={displayData.imageUrl}
            alt={`${displayData.firstName} ${displayData.lastName} Profile`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback for imageUrl: try username-based, then default
              if (displayData.username) {
                (e.target as HTMLImageElement).src = `https://backend.serenissima.ai/public_assets/images/citizens/${displayData.username}.jpg`;
                (e.target as HTMLImageElement).onerror = () => {
                  (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
                };
              } else {
                (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
              }
            }}
          />
        ) : displayData.username ? ( // Fallback to username.jpg if no imageUrl
          <img
            src={`https://backend.serenissima.ai/public_assets/images/citizens/${displayData.username}.jpg`}
            alt={`${displayData.firstName} ${displayData.lastName} Profile`}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';}}
          />
        ) : ( // Placeholder if no images available
          <div className="w-full h-full bg-amber-200 flex items-center justify-center text-amber-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-1/2 w-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}

        {/* Coat of arms overlay - This section is removed for PlayerProfile as it only has one image prop (coatOfArmsImageUrl) which is now used as the main image.
            If PlayerProfile gets a dedicated `profileImageUrl` prop in the future, this section can be re-added for `coatOfArmsImageUrl`.
        */}
        
        {/* Name and social class overlay */}
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent ${dim.nameOverlayPadding}`}>
          {!(displayData.firstName === "Unknown" && displayData.lastName === "Citizen") && (
            <h3 className={`${dim.nameText} text-white font-serif font-bold truncate`}>
              {displayData.firstName} {displayData.lastName}
            </h3>
          )}
          <div className="flex justify-between items-center">
            <div className={`${dim.socialClassText} px-2 py-0.5 rounded-full font-medium inline-block ${socialClassStyle}`}>
              {displayData.socialClass}
            </div>
          </div>
        </div>

        {/* Ducats display overlay - REMOVED */}
      </div>
      
      {/* Username and Family Motto below the image block */}
      <div className={`${dim.username} font-medium text-center mt-2 w-full username-text truncate px-1`}>
        {displayData.username}
      </div>
      {(displayData.familyMotto) && showMotto && (
        <div className={`${dim.name} italic text-amber-600 text-center mt-1 w-full font-light motto-text line-clamp-2`}>
          "{displayData.familyMotto}"
        </div>
      )}
      
      {/* New Ducats display area */}
      {showDucats && displayData.Ducats !== undefined && (
        <div className={`text-center mt-1 w-full flex items-center justify-center`}>
          <span className={`${dim.ducatsIconSize} mr-1 text-amber-100`}>⚜️</span>
          <AnimatedDucats 
            value={displayData.Ducats} 
            suffix="" 
            prefix=""
            className={`${dim.ducatsTextSize} font-bold inline truncate text-orange-700`}
          />
        </div>
      )}
      {showInfluence && displayData.influence !== undefined && (
        <div className={`text-center mt-0.5 w-full flex items-center justify-center`}>
          <span className={`${dim.ducatsIconSize} mr-1`}>🎭</span>
          <AnimatedDucats 
            value={displayData.influence} 
            suffix="" 
            prefix=""
            className={`${dim.ducatsTextSize} font-bold inline truncate text-purple-700`} // Example color for influence
          />
        </div>
      )}
    </div>
  );
};

export default PlayerProfile;
