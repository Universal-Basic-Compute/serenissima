import { useEffect, useState } from 'react';
import ActionButton from '../UI/ActionButton';
import { Polygon } from './types';

interface LandDetailsPanelProps {
  selectedPolygonId: string | null;
  onClose: () => void;
  polygons: Polygon[];
  landOwners: Record<string, string>;
}

export default function LandDetailsPanel({ selectedPolygonId, onClose, polygons, landOwners }: LandDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  // Find the selected polygon
  const selectedPolygon = selectedPolygonId 
    ? polygons.find(p => p.id === selectedPolygonId)
    : null;
  
  // Get the owner for the selected polygon
  const owner = selectedPolygonId ? landOwners[selectedPolygonId] : null;
  
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
            <h3 className="text-sm font-medium text-gray-500">Architect</h3>
            <p className="mt-1 font-semibold">
              {owner ? owner : 'Available'}
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
          
          
          <div className="pt-4">
            <ActionButton onClick={() => alert('Purchase action')} variant="primary">
              Purchase Land
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
