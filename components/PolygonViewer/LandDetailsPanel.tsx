import { useEffect, useState } from 'react';
import ActionButton from '../UI/ActionButton';

interface LandDetailsPanelProps {
  selectedPolygonId: string | null;
  onClose: () => void;
}

export default function LandDetailsPanel({ selectedPolygonId, onClose }: LandDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  
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
          <h2 className="text-xl font-semibold">Land Details</h2>
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
          <div>
            <h3 className="text-sm font-medium text-gray-500">Land ID</h3>
            <p className="mt-1">{selectedPolygonId}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <p className="mt-1">Available</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500">Size</h3>
            <p className="mt-1">0.25 acres</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-500">Location</h3>
            <p className="mt-1">Venice, Italy</p>
          </div>
          
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
