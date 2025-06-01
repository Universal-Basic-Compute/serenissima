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
  const [imagePath, setImagePath] = useState<string>('https://backend.serenissima.ai/public_assets/images/buildings/hidden_workshop.png');
  
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
      console.log(`BuildingImage: Looking for image for building type: ${type}, variant: ${variant || 'none'}`);
      
      // 1. Check cached building types from API
      const cachedBuildingTypes = (typeof window !== 'undefined' && (window as any).__buildingTypes) 
        ? (window as any).__buildingTypes 
        : null;
      
      if (cachedBuildingTypes) {
        const buildingTypeDef = cachedBuildingTypes.find((bt: any) => 
          bt.type.toLowerCase() === type.toLowerCase() || 
          bt.name?.toLowerCase() === type.toLowerCase()
        );
        
        if (buildingTypeDef && buildingTypeDef.appearance && buildingTypeDef.appearance.imagePath) {
          let potentialPath = buildingTypeDef.appearance.imagePath;
          const baseAssetUrl = 'https://backend.serenissima.ai/public_assets/';

          if (!potentialPath.startsWith('http')) { // If not a full URL, assume relative to public_assets
            potentialPath = `${baseAssetUrl}${potentialPath.replace(/^\//, '')}`;
          }
          
          // Clean up potential double prefixes, similar to HoverTooltip logic
          if (potentialPath.startsWith(baseAssetUrl + 'https://')) {
            potentialPath = potentialPath.substring(baseAssetUrl.length);
          } else if (potentialPath.startsWith('https://https://')) {
            potentialPath = potentialPath.substring('https://'.length);
          }

          console.log(`BuildingImage: Found potential image path in building type data, resolved to: ${potentialPath}`);
          try {
            const response = await fetch(potentialPath, { method: 'GET' }); // Changed HEAD to GET
            if (response.ok) {
              console.log(`BuildingImage: Confirmed image path from definition: ${potentialPath}`);
              return potentialPath;
            }
            console.warn(`BuildingImage: Path from definition ${potentialPath} not found or invalid.`);
          } catch (error) {
            console.warn(`BuildingImage: Error checking path from definition ${potentialPath}:`, error);
          }
        }
      }
      
      // 2. Try converting type to snake_case (e.g., "canal-house" -> "canal_house.png")
      // This is often the convention for filenames if the type uses hyphens.
      const snakeCaseType = type.replace(/-/g, '_').toLowerCase();
      const snakeCasePath = `https://backend.serenissima.ai/public_assets/images/buildings/${snakeCaseType}.png`;
      console.log(`BuildingImage: Trying snake_case path: ${snakeCasePath}`);
      try {
        const response = await fetch(snakeCasePath, { method: 'GET' }); // Changed HEAD to GET
        if (response.ok) {
          console.log(`BuildingImage: Found image at snake_case path: ${snakeCasePath}`);
          return snakeCasePath;
        }
      } catch (error) {
        console.log(`BuildingImage: Image not found at ${snakeCasePath} (or fetch error)`);
      }

      // 3. Try type as is (e.g. if type is already "canal_house" or "some-building" and filename matches "some-building.png")
      const directPath = `https://backend.serenissima.ai/public_assets/images/buildings/${type.toLowerCase()}.png`;
      console.log(`BuildingImage: Trying direct path: ${directPath}`);
      try {
        const response = await fetch(directPath, { method: 'GET' }); // Changed HEAD to GET
        if (response.ok) {
          console.log(`BuildingImage: Found image at direct path: ${directPath}`);
          return directPath;
        }
      } catch (error) {
        console.log(`BuildingImage: Image not found at ${directPath} (or fetch error)`);
      }
      
      // 4. Fallback image
      const fallbackPath = 'https://backend.serenissima.ai/public_assets/images/buildings/contract_stall.png';
      console.log(`BuildingImage: No specific image found for building type: ${type}. Using default: ${fallbackPath}`);
      return fallbackPath;
    } catch (error) {
      console.error('BuildingImage: Error in getBuildingImagePath:', error);
      return 'https://backend.serenissima.ai/public_assets/images/buildings/contract_stall.png'; // Ultimate fallback
    }
  };

  useEffect(() => {
    if (buildingType) {
      getBuildingImagePath(buildingType, buildingVariant)
        .then(path => setImagePath(path))
        .catch(error => {
          console.error('Error resolving building image path:', error);
          setImagePath('https://backend.serenissima.ai/public_assets/images/buildings/contract_stall.png');
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
            console.error('Error loading building image, src was:', e.currentTarget.src);
            // Prevent infinite loop if the fallback image itself is missing or causes an error
            const fallbackSrc = 'https://backend.serenissima.ai/public_assets/images/buildings/contract_stall.png';
            if (e.currentTarget.src !== `${window.location.origin}${fallbackSrc}`) {
              e.currentTarget.src = fallbackSrc;
            }
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
