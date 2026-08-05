import React, { useMemo } from 'react';
import InfoIcon from './InfoIcon'; // Assurez-vous que ce chemin est correct

interface CitizenProfileColumnProps {
  citizen: any;
  homeBuilding: any;
  workBuilding: any;
  isLoadingBuildings: boolean;
  coatOfArmsSrc: string | undefined;
}

const CitizenProfileColumn: React.FC<CitizenProfileColumnProps> = ({
  citizen,
  homeBuilding,
  workBuilding,
  isLoadingBuildings,
  coatOfArmsSrc,
}) => {

  const formatDucats = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return 'Unknown';
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'Unknown';
    const formattedAmount = Math.floor(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return formattedAmount + ' ⚜️';
  };

  const formatInfluence = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return 'Unknown';
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'Unknown';
    const formattedAmount = Math.floor(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return formattedAmount + ' 🎭';
  };
  
  const formatBuildingType = (type: string): string => {
    if (!type) return 'Building';
    let formatted = type.replace(/[_-]/g, ' ');
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return formatted;
  };
  
  const getSocialClassColor = (socialClass: string): string => {
    switch (socialClass?.toLowerCase()) {
      case 'nobili': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'cittadini': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'popolani': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'facchini': case 'laborer': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-amber-100 text-amber-800 border-amber-300';
    }
  };
  
  const socialClassStyle = getSocialClassColor(citizen.socialClass);

  return (
    <div className="flex flex-col h-full"> {/* Ensure column takes full height */}
      <div className="w-full mb-6 flex-shrink-0">
        <div className="w-full aspect-square relative mb-4 overflow-hidden rounded-lg border-2 border-amber-600 shadow-lg">
          <img 
            src={citizen.username ? `/public_assets/images/citizens/${citizen.username}.jpg` : `/public_assets/images/citizens/default_citizen.png`}
            alt={`${citizen.firstName} ${citizen.lastName}`} 
            className="w-full h-full object-cover"
            onError={(e) => {
              console.warn(`Failed to load citizen image for ${citizen.username}: ${(e.target as HTMLImageElement).src}. Falling back to default.`);
              (e.target as HTMLImageElement).src = '/public_assets/images/citizens/default_citizen.png';
              (e.target as HTMLImageElement).onerror = () => {
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  parent.innerHTML = `
                    <div class="w-full h-full bg-amber-200 flex items-center justify-center text-amber-800">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  `;
                }
              };
            }}
          />
          
          {coatOfArmsSrc && (
            <div className="absolute bottom-3 right-3 w-20 h-20 rounded-full overflow-hidden border-2 border-amber-600 shadow-lg bg-amber-100 z-10">
              <img 
                src={coatOfArmsSrc}
                alt="Coat of Arms"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/public_assets/images/coat-of-arms/default.png';
                }}
              />
            </div>
          )}
          
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4"> 
            <h3 className="text-white text-2xl font-serif font-bold"> 
              {citizen.firstName} {citizen.lastName} 
            </h3>
            <div className="flex justify-between items-center">
              <div className={`px-3 py-1 rounded-full text-sm font-medium inline-flex items-center ${socialClassStyle}`}>
                {citizen.socialClass && (
                  <img
                    src={`/images/${citizen.socialClass.toLowerCase()}.png`}
                    alt=""
                    className="w-4 h-4 mr-1.5 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                {citizen.socialClass} 
              </div>
            </div>
          </div>

          <div className="absolute top-3 right-3 flex flex-col items-end space-y-1">
            {citizen.ducats !== undefined && (
              <div className="bg-black/60 text-white px-3 py-1 rounded-lg shadow-md">
                <span className="text-lg font-bold">{formatDucats(citizen.ducats)}</span>
              </div>
            )}
            {citizen.influence !== undefined && (
              <div className="bg-black/60 text-white px-3 py-1 rounded-lg shadow-md">
                <span className="text-lg font-bold">{formatInfluence(citizen.influence)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-grow min-h-0 overflow-y-auto pr-1 custom-scrollbar">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Home</h3>
              <InfoIcon tooltipText="The primary residence of this citizen within Venice." />
            </div>
            <div className="bg-amber-100 p-3 rounded-lg">
              {isLoadingBuildings ? (
                <p className="text-amber-700 italic">Loading...</p>
              ) : homeBuilding ? (
                <div>
                  <p className="text-amber-800 font-medium">{homeBuilding.name || formatBuildingType(homeBuilding.type)}</p>
                  <p className="text-amber-700 text-sm">{formatBuildingType(homeBuilding.type)}</p>
                </div>
              ) : (
                <p className="text-amber-700 italic">Homeless</p>
              )}
            </div>
          </div>
            
          <div>
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Work</h3>
              <InfoIcon tooltipText="The primary place of employment or business operation for this citizen." />
            </div>
            <div className="bg-amber-100 p-3 rounded-lg">
              {isLoadingBuildings ? (
                <p className="text-amber-700 italic">Loading...</p>
              ) : workBuilding ? (
                <div>
                  <p className="text-amber-800 font-medium">{workBuilding.name || formatBuildingType(workBuilding.type)}</p>
                  <p className="text-amber-700 text-sm">{formatBuildingType(workBuilding.type)}</p>
                </div>
              ) : citizen.worksFor ? (
                <div>
                  <p className="text-amber-800 font-medium">
                    <span className="font-bold">{citizen.worksFor}</span>
                  </p>
                  {citizen.workplace && (
                    <>
                      <p className="text-amber-600 text-xs">
                        {formatBuildingType(citizen.workplace.type || '')}
                      </p>
                    </>
                  )}
                </div>
              ) : citizen.socialClass === 'Nobili' ? (
                <p className="text-amber-700 italic">Gentleman of Private Life</p>
              ) : (
                <p className="text-amber-700 italic">Unemployed</p>
              )}
            </div>
          </div>
        </div>
          
        <div className="mb-6">
          <div className="flex items-center">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Personality</h3>
            <InfoIcon tooltipText="Key personality traits and a general description of this citizen's character and demeanor." />
          </div>
          {citizen.corePersonality && Array.isArray(citizen.corePersonality) && citizen.corePersonality.length === 3 && (
            <div className="flex space-x-2 mb-3">
              <div className="px-3 py-1 text-xs font-medium text-green-800 bg-green-100 border border-green-300 rounded-full shadow-sm">
                {citizen.corePersonality[0]}
              </div>
              <div className="px-3 py-1 text-xs font-medium text-red-800 bg-red-100 border border-red-300 rounded-full shadow-sm">
                {citizen.corePersonality[1]}
              </div>
              <div className="px-3 py-1 text-xs font-medium text-blue-800 bg-blue-100 border border-blue-300 rounded-full shadow-sm">
                {citizen.corePersonality[2]}
              </div>
            </div>
          )}
          <p className="text-amber-700 italic text-sm">{citizen.personality || 'No personality description available.'}</p>
        </div>

        <div className="mb-6">
          <div className="flex items-center">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">About {citizen.firstName}</h3>
            <InfoIcon tooltipText="A brief biography or notable information about this citizen." />
          </div> 
          <p className="text-amber-700 italic text-sm">{citizen.description || 'No description available.'}</p>
        </div>
      </div>
    </div>
  );
};

export default CitizenProfileColumn;
