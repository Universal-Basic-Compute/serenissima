import React, { useState, useEffect } from 'react';
import { Citizen } from '@/components/PolygonViewer/types';

interface CitizenDetailsPanelProps {
  citizen: Citizen;
  onClose: () => void;
}

const CitizenDetailsPanel: React.FC<CitizenDetailsPanelProps> = ({ citizen, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Animate in when component mounts
    setIsVisible(true);
    
    // Add escape key handler
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, []);
  
  const handleClose = () => {
    // Animate out before closing
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };
  
  if (!citizen) return null;
  
  // Determine social class color
  const getSocialClassColor = (socialClass: string): string => {
    switch (socialClass.toLowerCase()) {
      case 'nobili':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'; // Gold
      case 'cittadini':
        return 'bg-blue-100 text-blue-800 border-blue-300'; // Blue
      case 'popolani':
        return 'bg-amber-100 text-amber-800 border-amber-300'; // Brown
      case 'facchini':
        return 'bg-gray-100 text-gray-800 border-gray-300'; // Gray
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300'; // Default
    }
  };
  
  const socialClassStyle = getSocialClassColor(citizen.SocialClass);
  
  return (
    <div 
      className={`fixed top-20 right-4 bg-amber-50 border-2 border-amber-700 rounded-lg p-4 shadow-lg max-w-md z-20 transition-all duration-300 ${
        isVisible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'
      }`}
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-serif text-amber-800">
          {citizen.FirstName} {citizen.LastName}
        </h2>
        <button 
          onClick={handleClose}
          className="text-amber-600 hover:text-amber-800 transition-colors"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="flex mb-4">
        {citizen.ImageUrl ? (
          <img 
            src={citizen.ImageUrl.endsWith('.jpg') ? citizen.ImageUrl : `/images/citizens/${citizen.CitizenId}.jpg`} 
            alt={`${citizen.FirstName} ${citizen.LastName}`} 
            className="w-24 h-24 object-cover rounded-lg border-2 border-amber-600"
            onError={(e) => {
              // Fallback if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.innerHTML = `
                <div class="w-24 h-24 bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              `;
            }}
          />
        ) : (
          <img 
            src={`/images/citizens/${citizen.CitizenId}.jpg`}
            alt={`${citizen.FirstName} ${citizen.LastName}`} 
            className="w-24 h-24 object-cover rounded-lg border-2 border-amber-600"
            onError={(e) => {
              // Fallback if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.innerHTML = `
                <div class="w-24 h-24 bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              `;
            }}
          />
        )}
        
        <div className="ml-4">
          <div className={`px-2 py-1 rounded-full text-sm font-medium inline-block ${socialClassStyle}`}>
            {citizen.SocialClass}
          </div>
          <div className="text-amber-600 text-sm mt-2">Wealth: {citizen.Wealth || 'Unknown'}</div>
          <div className="text-amber-600 text-sm">Needs Score: {citizen.NeedsCompletionScore.toFixed(2)}</div>
          <div className="text-amber-600 text-sm">Citizen ID: {citizen.CitizenId}</div>
        </div>
      </div>
      
      <div className="mb-4">
        <h3 className="text-lg font-serif text-amber-800 mb-2">About</h3>
        <p className="text-amber-700 italic">{citizen.Description || 'No description available.'}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-serif text-amber-800 mb-2">Home</h3>
          <div className="bg-amber-100 p-2 rounded-lg">
            <p className="text-amber-700">{citizen.Home || 'Unknown'}</p>
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-serif text-amber-800 mb-2">Work</h3>
          <div className="bg-amber-100 p-2 rounded-lg">
            <p className="text-amber-700">{citizen.Work || 'Unemployed'}</p>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-xs text-amber-500 italic">
        Citizen of Venice since {new Date(citizen.CreatedAt).toLocaleDateString()}
      </div>
    </div>
  );
};

export default CitizenDetailsPanel;
