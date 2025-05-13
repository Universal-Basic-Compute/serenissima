import { useEffect, useState } from 'react';
import { getBackendBaseUrl } from '@/lib/apiUtils';
import PlayerProfile from '../UI/PlayerProfile';

interface BuildingDetailsPanelProps {
  selectedBuildingId: string | null;
  onClose: () => void;
  visible?: boolean;
}

export default function BuildingDetailsPanel({ selectedBuildingId, onClose, visible = true }: BuildingDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [building, setBuilding] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // Add error state
  
  // Fetch building details when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsLoading(true);
      setError(null); // Reset error state when fetching new building
      
      fetch(`/api/buildings/${selectedBuildingId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Building not found (ID: ${selectedBuildingId})`);
            }
            throw new Error(`Failed to fetch building: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Building data:', data);
          if (data && data.building) {
            setBuilding(data.building);
          } else {
            throw new Error('Invalid building data format');
          }
        })
        .catch(error => {
          console.error('Error fetching building details:', error);
          setError(error.message || 'Failed to load building details');
          setBuilding(null); // Clear building data on error
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setBuilding(null);
      setError(null);
    }
  }, [selectedBuildingId]);
  
  // Show panel with animation when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedBuildingId]);
  
  // Early return if not visible or no selected building
  if (!visible || !selectedBuildingId) return null;
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-96 bg-amber-50 shadow-xl transform transition-transform duration-300 ease-in-out z-20 border-l-4 border-amber-600 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-6 h-full flex flex-col">
        {/* Header with improved styling */}
        <div className="flex justify-between items-center mb-6 border-b-2 border-amber-300 pb-3">
          <h2 className="text-2xl font-serif font-semibold text-amber-800">
            {!isLoading && !error && building ? `${building.type} Details` : 'Building Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Error message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-4">
            <h3 className="font-bold mb-1">Error</h3>
            <p>{error}</p>
            <button 
              onClick={onClose}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        ) : !error && building ? (
          <div className="space-y-6 overflow-y-auto flex-grow">
            {/* Building Type */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Building Type</h3>
              <p className="font-serif text-xl font-semibold text-amber-800">{building.type}</p>
              {building.variant && (
                <p className="mt-1 text-sm italic text-amber-600">Variant: {building.variant}</p>
              )}
            </div>
            
            {/* Location */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Location</h3>
              <p className="text-gray-700">Land ID: <span className="font-medium">{building.land_id}</span></p>
              {building.position && (
                <p className="text-xs text-gray-500 mt-1">
                  Position: {typeof building.position === 'string' 
                    ? building.position.substring(0, 20) + '...' 
                    : JSON.stringify(building.position).substring(0, 20) + '...'}
                </p>
              )}
            </div>
            
            {/* Owner information */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
              {building.owner ? (
                <div className="flex items-center justify-center">
                  <PlayerProfile 
                    username={building.owner}
                    walletAddress={building.owner}
                    size="medium"
                    className="mx-auto"
                  />
                </div>
              ) : (
                <p className="text-center text-gray-500 italic">No owner information</p>
              )}
            </div>
            
            {/* Financial Information */}
            {(building.lease_amount || building.rent_amount) && (
              <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Financial Details</h3>
                
                {building.lease_amount !== undefined && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700">Lease Amount:</span>
                    <span className="font-semibold text-amber-800">
                      {building.lease_amount.toLocaleString()} ⚜️ ducats
                    </span>
                  </div>
                )}
                
                {building.rent_amount !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Rent Amount:</span>
                    <span className="font-semibold text-amber-800">
                      {building.rent_amount.toLocaleString()} ⚜️ ducats
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Occupant Information */}
            {building.occupant && (
              <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
                <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Occupant</h3>
                <div className="flex items-center justify-center">
                  <PlayerProfile 
                    username={building.occupant}
                    walletAddress={building.occupant}
                    size="medium"
                    className="mx-auto"
                  />
                </div>
              </div>
            )}
            
            {/* Creation Information */}
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Creation Details</h3>
              <div className="text-sm">
                <p className="text-gray-700">
                  Created: <span className="font-medium">
                    {new Date(building.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </p>
                {building.created_by && (
                  <p className="text-gray-700 mt-1">
                    Created by: <span className="font-medium">{building.created_by}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-gray-500 italic">
              {error ? 'Unable to load building details' : 'No building selected'}
            </p>
          </div>
        )}
        
        {/* Add a decorative Venetian footer */}
        <div className="mt-4 text-center">
          <div className="text-amber-600 text-xs italic">
            La Serenissima Repubblica di Venezia
          </div>
          <div className="flex justify-center mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
