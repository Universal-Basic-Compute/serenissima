import React from 'react';
import PlaceableObjectManager from '@/lib/components/PlaceableObjectManager';

interface PlaceableBuildingProps {
  buildingName: string;
  variant?: string;
  onPlace: (position: { x: number, y: number }) => void;
  onCancel: () => void;
}

/**
 * PlaceableBuilding - Wrapper around PlaceableObjectManager for backward compatibility
 * @deprecated Use PlaceableObjectManager directly instead
 */
const PlaceableBuilding: React.FC<PlaceableBuildingProps> = ({
  buildingName,
  variant = 'model',
  onPlace,
  onCancel
}) => {
  return (
    <PlaceableObjectManager
      active={true}
      type="building"
      objectData={{
        name: buildingName,
        variant: variant
      }}
      constraints={{
        requireLandOwnership: true
      }}
      onComplete={(data) => {
        // Convert the data to the expected format for backward compatibility
        onPlace({
          x: data.position.x,
          y: data.position.y
        });
      }}
      onCancel={onCancel}
    />
  );
};

export default PlaceableBuilding;
