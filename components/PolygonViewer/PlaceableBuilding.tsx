import React, { useState, useEffect, useRef } from 'react';

interface PlaceableBuildingProps {
  buildingName: string;
  variant?: string;
  onPlace: (position: { x: number, y: number }) => void;
  onCancel: () => void;
}

const PlaceableBuilding: React.FC<PlaceableBuildingProps> = ({
  buildingName,
  variant = 'model',
  onPlace,
  onCancel
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Update position on mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    
    // Handle right-click to cancel
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onCancel();
    };
    
    // Handle left-click to place
    const handleClick = (e: MouseEvent) => {
      // Left click only
      if (e.button === 0) {
        onPlace({ x: e.clientX, y: e.clientY });
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClick);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClick);
    };
  }, [onPlace, onCancel]);
  
  return (
    <div 
      ref={containerRef}
      className="absolute pointer-events-none z-50"
      style={{ 
        left: position.x - 75, // Half of width
        top: position.y - 75,  // Half of height
      }}
    >
      <div className="relative">
        <div className="w-[150px] h-[150px] bg-amber-600 bg-opacity-80 rounded-lg flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div className="absolute bottom-0 left-0 right-0 text-center text-white text-xs bg-black bg-opacity-50 py-1">
          Left-click to place • Right-click to cancel
        </div>
      </div>
    </div>
  );
};

export default PlaceableBuilding;
