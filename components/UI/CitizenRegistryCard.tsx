import React from 'react';
import Image from 'next/image';

interface CitizenRegistryCardProps {
  username?: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImage?: string | null;
  familyMotto?: string;
  Ducats?: number;
  socialClass?: string;
}

const CitizenRegistryCard: React.FC<CitizenRegistryCardProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImage,
  familyMotto,
  Ducats = 0,
  socialClass = 'Popolani'
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

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-amber-200 hover:shadow-lg transition-shadow">
      <div className="flex items-start">
        {/* Main citizen image - larger */}
        <div className="w-24 h-24 mr-4 rounded-lg border-2 border-amber-600 shadow-md overflow-hidden flex-shrink-0">
          <img 
            src={`/images/citizens/${username || 'default'}.jpg`}
            alt={`${firstName} ${lastName}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to default image if the specific one doesn't exist
              (e.target as HTMLImageElement).src = '/images/citizens/default.jpg';
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
              <p className="text-xs text-gray-500 mt-1">@{username}</p>
            </div>
            
            {/* Coat of arms - smaller */}
            {coatOfArmsImage && (
              <div className="w-12 h-12 rounded-full border border-amber-300 overflow-hidden ml-2">
                <img 
                  src={coatOfArmsImage}
                  alt="Coat of Arms"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to default coat of arms
                    (e.target as HTMLImageElement).src = '/coat-of-arms/default.png';
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
    </div>
  );
};

export default CitizenRegistryCard;
