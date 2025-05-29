import React from 'react';
import Image from 'next/image';

interface CitizenRegistryCardProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null;
  familyMotto?: string;
  Ducats?: number;
  socialClass?: string;
  isCurrentUser?: boolean;
  onViewProfile?: (citizen: any) => void; // Add this prop
  citizenId?: string; // Add citizenId prop
}

const CitizenRegistryCard: React.FC<CitizenRegistryCardProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImageUrl,
  familyMotto,
  Ducats = 0,
  socialClass = 'Popolani',
  isCurrentUser = false,
  onViewProfile, // Add this prop
  citizenId // Destructure citizenId
}) => {
  // Format the Ducats without decimal places
  const formattedDucats = Math.floor(Ducats).toLocaleString();
  
  // Get social class color
  const getSocialClassColor = (socialClass: string): string => {
    const baseClass = socialClass?.toLowerCase() || '';
    
    if (baseClass.includes('nobili')) {
      return 'text-amber-700'; // Gold for nobility
    } else if (baseClass.includes('cittadini')) {
      return 'text-blue-700'; // Blue for citizens
    } else if (baseClass.includes('popolani')) {
      return 'text-amber-600'; // Brown/amber for common people
    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
      return 'text-gray-700'; // Gray for laborers
    }
    
    return 'text-gray-700'; // Default color
  };

  // Get social class background color for the card
  const getSocialClassBgColor = (socialClass: string): string => {
    const baseClass = socialClass?.toLowerCase() || '';
    
    if (baseClass.includes('nobili')) {
      return 'bg-gradient-to-br from-white to-amber-100'; // Subtle gold gradient for nobility
    } else if (baseClass.includes('cittadini')) {
      return 'bg-gradient-to-br from-white to-blue-50'; // Subtle blue gradient for citizens
    } else if (baseClass.includes('popolani')) {
      return 'bg-white'; // White for common people
    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
      return 'bg-gradient-to-br from-white to-gray-100'; // Subtle gray gradient for laborers
    }
    
    return 'bg-white'; // Default background
  };

  return (
    <div className={`${getSocialClassBgColor(socialClass)} rounded-lg shadow-md p-4 border ${
      isCurrentUser ? 'border-purple-400 ring-2 ring-purple-300' : 'border-amber-200'
    } hover:shadow-lg transition-shadow relative`}>
      {/* Current user indicator */}
      {isCurrentUser && (
        <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
          You
        </div>
      )}
      
      <div className="flex items-start">
        {/* Main citizen image - larger */}
        <div className="w-24 h-24 mr-4 rounded-lg border-2 border-amber-600 shadow-md overflow-hidden flex-shrink-0">
          <img 
            src={`https://backend.serenissima.ai/public_assets/images/citizens/${username || 'default'}.jpg`}
            alt={`${firstName} ${lastName}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to default image if the specific one doesn't exist
              (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
            }}
          />
        </div>
        
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <div>
              {/* Name and social class */}
              <h3 className="font-serif text-lg font-bold">{firstName} {lastName}</h3>
              <p className={`text-sm font-medium ${getSocialClassColor(socialClass)}`}>
                {socialClass}
              </p>
              
              {/* Username */}
              <p className="text-xs text-gray-500 mt-1">{username}</p>
            </div>
            
            {/* Coat of arms - smaller */}
            {coatOfArmsImageUrl && (
              <div className="w-12 h-12 rounded-full border border-amber-300 overflow-hidden ml-2">
                <img 
                  src={coatOfArmsImageUrl}
                  alt="Coat of Arms"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to default coat of arms
                    (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public/assets/images/coat-of-arms/default.png';
                  }}
                />
              </div>
            )}
          </div>
          
          {/* Ducats */}
          <div className="mt-2 flex items-center">
            <span className="text-amber-700 font-medium text-lg">⚜️ {formattedDucats}</span>
            <span className="text-xs text-gray-500 ml-1">ducats</span>
          </div>
        </div>
      </div>
      
      {/* Family motto - full width */}
      {familyMotto && (
        <div className="mt-3 pt-2 border-t border-amber-100 italic text-sm text-gray-700 w-full">
          "{familyMotto}"
        </div>
      )}
      
      {/* Action buttons */}
      <div className="mt-3 pt-2 border-t border-amber-100 flex justify-between">
        <button 
          className="text-xs text-amber-700 hover:text-amber-900 transition-colors"
          onClick={() => onViewProfile && onViewProfile({
            username,
            firstName,
            lastName,
            coatOfArmsImageUrl,
            familyMotto,
            Ducats,
            socialClass,
            isCurrentUser,
            citizenId // Include citizenId in the passed object
          })}
        >
          View Profile
        </button>
        {!isCurrentUser && (
          <button className="text-xs text-amber-700 hover:text-amber-900 transition-colors">
            Send Message
          </button>
        )}
      </div>
    </div>
  );
};

export default CitizenRegistryCard;
