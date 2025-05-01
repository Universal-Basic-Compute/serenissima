import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ActionButton from '../UI/ActionButton';
import WalletStatus from '../UI/WalletStatus';
import { Polygon } from './types';

interface LandDetailsPanelProps {
  selectedPolygonId: string | null;
  onClose: () => void;
  polygons: Polygon[];
  landOwners: Record<string, string>;
}

export default function LandDetailsPanel({ selectedPolygonId, onClose, polygons, landOwners }: LandDetailsPanelProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  
  // Find the selected polygon
  const selectedPolygon = selectedPolygonId 
    ? polygons.find(p => p.id === selectedPolygonId)
    : null;
  
  // Get the owner for the selected polygon
  const owner = selectedPolygonId ? landOwners[selectedPolygonId] : null;
  
  // Add this function to handle polygon deletion
  const handleDeletePolygon = async () => {
    if (!selectedPolygonId) return;
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete this land: ${selectedPolygon?.historicalName || selectedPolygonId}?`)) {
      return;
    }
    
    try {
      const response = await fetch('/api/delete-polygon', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: selectedPolygonId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete land');
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('Land deleted successfully');
        // Close the panel
        onClose();
        
        // Dispatch a custom event to notify components
        window.dispatchEvent(new Event('polygonDeleted'));
      } else {
        alert(`Failed to delete land: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting land:', error);
      alert('An error occurred while deleting the land');
    }
  };
  
  // Debug logging
  useEffect(() => {
    if (selectedPolygonId) {
      console.log('Selected polygon ID:', selectedPolygonId);
      console.log('Selected polygon data:', selectedPolygon);
      console.log('Land owners data:', landOwners);
      console.log('Owner for selected polygon:', owner);
    }
  }, [selectedPolygonId, selectedPolygon, landOwners, owner]);
  
  // Show panel with animation when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedPolygonId]);
  
  if (!selectedPolygonId) return null;
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-80 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-20 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">
            {selectedPolygon?.historicalName || 'Land Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Owner information - always show this section */}
          <div>
            <h3 className="text-sm font-medium text-gray-500">Owner</h3>
            <p className="mt-1 font-semibold">
              {owner && owner !== "" ? owner : 'Available'}
            </p>
          </div>
          
          {/* Area information */}
          {selectedPolygon?.areaInSquareMeters && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Buildable Area</h3>
              <p className="mt-1 font-semibold">
                {Math.floor(selectedPolygon.areaInSquareMeters).toLocaleString()} m²
              </p>
            </div>
          )}
          
          {/* Historical Name */}
          {selectedPolygon?.historicalName && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Historical Name</h3>
              <p className="mt-1 font-semibold">{selectedPolygon.historicalName}</p>
              {selectedPolygon.englishName && (
                <p className="mt-1 text-sm italic text-gray-600">{selectedPolygon.englishName}</p>
              )}
            </div>
          )}
          
          {/* Historical Description */}
          {selectedPolygon?.historicalDescription && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Historical Description</h3>
              <p className="mt-1 text-sm">{selectedPolygon.historicalDescription}</p>
            </div>
          )}
          
          
          <WalletStatus className="mb-2" />
          
          <div className="pt-2 flex space-x-2">
            <ActionButton 
              onClick={() => {
                if (!selectedPolygonId) return;
                
                // Get the current wallet address from session storage first, then localStorage
                const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
                
                if (!walletAddress) {
                  alert('Please connect your wallet first');
                  return;
                }
                
                // Call the backend API to purchase the land
                fetch('http://localhost:8000/api/land', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    land_id: selectedPolygonId,
                    wallet_address: walletAddress,
                    historical_name: selectedPolygon?.historicalName,
                    english_name: selectedPolygon?.englishName,
                    description: selectedPolygon?.historicalDescription
                  }),
                })
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Failed to purchase land');
                  }
                  return response.json();
                })
                .then(data => {
                  alert(`Successfully purchased land: ${selectedPolygon?.historicalName || selectedPolygonId}`);
                  // Refresh the land owners data
                  window.location.reload();
                })
                .catch(error => {
                  console.error('Error purchasing land:', error);
                  alert('Failed to purchase land. Please try again.');
                });
              }} 
              variant="primary"
              disabled={owner ? true : false}
            >
              {owner ? 'Already Owned' : 'Purchase Land'}
            </ActionButton>
            
            {/* Add Delete button */}
            <ActionButton 
              onClick={handleDeletePolygon}
              variant="danger"
            >
              Delete Land
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
