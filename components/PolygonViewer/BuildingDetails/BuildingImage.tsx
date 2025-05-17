import { useState, useEffect } from 'react';

interface BuildingImageProps {
  buildingType: string;
  buildingVariant?: string;
  buildingName?: string;
  shortDescription?: string;
  flavorText?: string;
}

const BuildingImage: React.FC<BuildingImageProps> = ({
  buildingType,
  buildingVariant,
  buildingName,
  shortDescription,
  flavorText
}) => {
  const [imagePath, setImagePath] = useState<string>('/images/buildings/contract_stall.jpg');
  
  // Helper function to format building types for display
  const formatBuildingType = (type: string): string => {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  };

  // Add this function to dynamically find the building image path
  const getBuildingImagePath = async (type: string, variant?: string): Promise<string> => {
    try {
      console.log(`Looking for image for building type: ${type}, variant: ${variant || 'none'}`);
      
      // First check if we have building types data with image path
      const cachedBuildingTypes = (typeof window !== 'undefined' && (window as any).__buildingTypes) 
        ? (window as any).__buildingTypes 
        : null;
      
      if (cachedBuildingTypes) {
        const buildingType = cachedBuildingTypes.find((bt: any) => 
          bt.type.toLowerCase() === type.toLowerCase() || 
          bt.name?.toLowerCase() === type.toLowerCase()
        );
        
        if (buildingType && buildingType.appearance && buildingType.appearance.imagePath) {
          console.log(`Found image path in building type data: ${buildingType.appearance.imagePath}`);
          return buildingType.appearance.imagePath;
        }
      }
      
      // Try the direct flat path first
      const flatImagePath = `/images/buildings/${type}.jpg`;
      console.log(`Trying flat path: ${flatImagePath}`);
      
      try {
        const response = await fetch(flatImagePath, { method: 'HEAD' });
        if (response.ok) {
          console.log(`Found image at flat path: ${flatImagePath}`);
          return flatImagePath;
        }
      } catch (error) {
        console.log(`Image not found at ${flatImagePath}`);
      }
      
      // Try with underscores instead of spaces
      const underscorePath = `/images/buildings/${type.replace(/\s+/g, '_').toLowerCase()}.jpg`;
      console.log(`Trying underscore path: ${underscorePath}`);
      
      try {
        const response = await fetch(underscorePath, { method: 'HEAD' });
        if (response.ok) {
          console.log(`Found image at underscore path: ${underscorePath}`);
          return underscorePath;
        }
      } catch (error) {
        console.log(`Image not found at ${underscorePath}`);
      }
      
      // Try with hyphens instead of spaces
      const hyphenPath = `/images/buildings/${type.replace(/\s+/g, '-').toLowerCase()}.jpg`;
      console.log(`Trying hyphen path: ${hyphenPath}`);
      
      try {
        const response = await fetch(hyphenPath, { method: 'HEAD' });
        if (response.ok) {
          console.log(`Found image at hyphen path: ${hyphenPath}`);
          return hyphenPath;
        }
      } catch (error) {
        console.log(`Image not found at ${hyphenPath}`);
      }
      
      // If all else fails, use a default image
      console.log(`No image found for building type: ${type}, using default contract_stall.jpg`);
      return '/images/buildings/contract_stall.jpg';
    } catch (error) {
      console.error('Error getting building image path:', error);
      return '/images/buildings/contract_stall.jpg';
    }
  };

  useEffect(() => {
    if (buildingType) {
      getBuildingImagePath(buildingType, buildingVariant)
        .then(path => setImagePath(path))
        .catch(error => {
          console.error('Error resolving building image path:', error);
          setImagePath('/images/buildings/contract_stall.jpg');
        });
    }
  }, [buildingType, buildingVariant]);

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <div className="relative w-full aspect-square overflow-hidden rounded-lg mb-3">
        <img 
          src={imagePath}
          alt={buildingName || formatBuildingType(buildingType)}
          className="w-full h-full object-cover"
          onError={(e) => {
            console.error('Error loading building image:', e);
            e.currentTarget.src = '/images/buildings/contract_stall.jpg';
          }}
        />
      </div>
      
      <h3 className="text-xl font-serif font-semibold text-amber-800 mb-2">
        {buildingName || formatBuildingType(buildingType)}
      </h3>
      
      {shortDescription && (
        <p className="text-gray-700 mb-3">{shortDescription}</p>
      )}
      
      {flavorText && (
        <p className="italic text-gray-600 border-l-4 border-amber-200 pl-3 py-1">
          "{flavorText}"
        </p>
      )}
    </div>
  );
};

export default BuildingImage;
