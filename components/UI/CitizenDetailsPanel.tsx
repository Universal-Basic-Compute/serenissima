import React from 'react';
import { Citizen } from '@/components/PolygonViewer/types';

interface CitizenDetailsPanelProps {
  citizen: Citizen;
  onClose: () => void;
}

const CitizenDetailsPanel: React.FC<CitizenDetailsPanelProps> = ({ citizen, onClose }) => {
  if (!citizen) return null;
  
  return (
    <div className="absolute top-20 right-4 bg-amber-50 border-2 border-amber-700 rounded-lg p-4 shadow-lg max-w-md z-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-serif text-amber-800">
          {citizen.FirstName} {citizen.LastName}
        </h2>
        <button 
          onClick={onClose}
          className="text-amber-600 hover:text-amber-800"
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
            src={citizen.ImageUrl} 
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
          <div className="w-24 h-24 bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
        
        <div className="ml-4">
          <div className="text-amber-800 font-medium">{citizen.SocialClass}</div>
          <div className="text-amber-600 text-sm">Wealth: {citizen.Wealth || 'Unknown'}</div>
          <div className="text-amber-600 text-sm">Needs Score: {citizen.NeedsCompletionScore.toFixed(2)}</div>
          <div className="text-amber-600 text-sm">Citizen ID: {citizen.CitizenId}</div>
        </div>
      </div>
      
      <div className="mb-4">
        <h3 className="text-lg font-serif text-amber-800 mb-2">About</h3>
        <p className="text-amber-700">{citizen.Description || 'No description available.'}</p>
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
