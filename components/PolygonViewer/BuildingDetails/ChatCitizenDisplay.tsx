import React from 'react';
import { eventBus } from '@/lib/utils/eventBus'; // Import eventBus

interface CitizenProfileData {
  username: string;
  firstName?: string;
  lastName?: string;
  coatOfArmsImageUrl?: string | null;
  imageUrl?: string | null; // For consistency with BuildingOwner/Occupant
}

interface ChatCitizenDisplayProps {
  citizen: CitizenProfileData | null;
  title: string;
}

const ChatCitizenDisplay: React.FC<ChatCitizenDisplayProps> = ({ citizen, title }) => {
  if (!citizen) {
    return (
      <div className="mb-2 p-2 bg-amber-100 rounded-md border border-amber-200 flex-shrink-0">
        <h4 className="text-xs text-amber-700 font-semibold mb-1">{title}</h4>
        <p className="text-xs text-gray-500 italic">Information non disponible.</p>
      </div>
    );
  }

  const displayName = `${citizen.firstName || ''} ${citizen.lastName || ''}`.trim() || citizen.username;
  const mainImage = citizen.imageUrl;
  const coatOfArms = citizen.coatOfArmsImageUrl;

  const handleCitizenClick = () => {
    if (citizen) {
      // Ensure the event payload matches what CitizenDetailsPanel expects
      // Typically, this would be the full citizen object fetched from the API
      // For now, we pass what we have.
      eventBus.emit('showCitizenPanelEvent', citizen);
    }
  };

  return (
    <div 
      className="mb-2 p-2 bg-amber-100 rounded-md border border-amber-200 flex-shrink-0 cursor-pointer hover:bg-amber-200 transition-colors"
      onClick={handleCitizenClick}
      title={`View details for ${displayName}`}
    >
      <h4 className="text-base text-amber-700 font-semibold mb-3">{title}</h4> {/* Increased title size and margin */}
      <div className="flex items-center space-x-4"> {/* Increased spacing */}
        {/* Main Image */}
        {mainImage ? (
          <img
            src={mainImage}
            alt={displayName}
            className="w-24 h-24 rounded-lg object-cover border-2 border-amber-400 shadow-md"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null; 
              target.src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
            }}
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-amber-300 flex items-center justify-center text-amber-700 text-3xl font-bold border-2 border-amber-400 shadow-md">
            {citizen.firstName ? citizen.firstName.charAt(0).toUpperCase() : citizen.username.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Coat of Arms */}
        {coatOfArms && (
          <img
            src={coatOfArms}
            alt={`${displayName}'s Coat of Arms`}
            className="w-20 h-20 rounded-md object-contain border border-amber-300 shadow"
            onError={(e) => {
              // Fallback for coat of arms can be to hide it or show a placeholder
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <div className="flex-grow min-w-0"> {/* Added min-w-0 to help with flex truncation issues if parent is also flex */}
          <p className="text-xl font-bold text-amber-900 break-words">{displayName}</p> {/* Removed truncate, added break-words */}
          <p className="text-base text-amber-600 truncate">{citizen.username}</p> {/* Username can still be truncated */}
        </div>
      </div>
    </div>
  );
};

export default ChatCitizenDisplay;
