import React from 'react';
import Image from 'next/image';

interface PlayerProfileProps {
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImage: string | null;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
}

const PlayerProfile: React.FC<PlayerProfileProps> = ({
  username,
  firstName,
  lastName,
  coatOfArmsImage,
  size = 'medium',
  onClick,
  className = ''
}) => {
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

  return (
    <div 
      className={`flex flex-col items-center ${dim.container} ${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Coat of Arms or Initials */}
      {coatOfArmsImage ? (
        <div className="rounded-full border-2 border-amber-600 overflow-hidden bg-amber-50">
          <img 
            src={coatOfArmsImage} 
            alt={`${username}'s Coat of Arms`}
            className={`${dim.image} object-cover`}
          />
        </div>
      ) : (
        <div className={`${dim.initials} rounded-full border-2 border-amber-600 bg-amber-100 flex items-center justify-center`}>
          <span className="text-amber-800 font-bold">
            {firstName.charAt(0)}{lastName.charAt(0)}
          </span>
        </div>
      )}
      
      {/* Username */}
      <div className={`${dim.username} font-medium text-center mt-1 truncate w-full`}>
        {username}
      </div>
      
      {/* Full Name */}
      <div className={`${dim.name} text-gray-600 text-center truncate w-full`}>
        {firstName} {lastName}
      </div>
    </div>
  );
};

export default PlayerProfile;
