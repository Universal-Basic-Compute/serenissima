import React, { useState, useEffect, useRef } from 'react';
import BuildingModelViewer from '../UI/BuildingModelViewer';

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
        <BuildingModelViewer
          buildingName={buildingName}
          width={150}
          height={150}
          variant={variant}
          className="opacity-80"
        />
        <div className="absolute bottom-0 left-0 right-0 text-center text-white text-xs bg-black bg-opacity-50 py-1">
          Left-click to place • Right-click to cancel
        </div>
      </div>
    </div>
  );
};

export default PlaceableBuilding;
