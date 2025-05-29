import React, { useState } from 'react';

// Définition du type PolygonData basée sur son utilisation dans IsometricViewer
interface PolygonData {
  polygon: any; // Envisagez de définir cela plus strictement si possible
  coords: { x: number; y: number }[];
  fillColor: string;
  centroidX: number;
  centroidY: number;
  centerX: number;
  centerY: number;
  hasPublicDock?: boolean;
}

interface CoatOfArmsMarkersProps {
  isVisible: boolean;
  polygonsToRender: PolygonData[];
  landOwners: Record<string, string>;
  coatOfArmsImageUrls: Record<string, HTMLImageElement>; // Attend des objets HTMLImageElement
}

// Fonction utilitaire pour générer une couleur à partir d'une chaîne (pour l'avatar par défaut)
const getColorFromString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`; // Saturation et luminosité fixes pour une bonne visibilité
};

// Sous-composant pour afficher une image avec un fallback
const CoatOfArmsImage: React.FC<{
  src: string | undefined;
  ownerName: string;
  size: number;
  baseStyle: React.CSSProperties;
}> = ({ src, ownerName, size, baseStyle }) => {
  const [error, setError] = useState(false);

  if (error || !src) {
    // Avatar par défaut
    const initial = ownerName && ownerName.length > 0 ? ownerName.charAt(0).toUpperCase() : '?';
    const backgroundColor = getColorFromString(ownerName);
    return (
      <div
        style={{
          ...baseStyle,
          backgroundColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: `${size * 0.4}px`,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${ownerName}'s Coat of Arms`}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      onError={() => setError(true)}
    />
  );
};

const CoatOfArmsMarkers: React.FC<CoatOfArmsMarkersProps> = ({
  isVisible,
  polygonsToRender,
  landOwners,
  coatOfArmsImageUrls,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {polygonsToRender.map(({ polygon, centerX, centerY }) => {
        const owner = landOwners[polygon.id];
        if (!owner) return null;

        const size = 50; // Taille fixe pour les blasons
        const imageElement = coatOfArmsImageUrls[owner];
        // L'élément image peut être un HTMLImageElement (image chargée ou data URL du fallback)
        // ou undefined si l'owner n'est pas dans coatOfArmsImageUrls.

        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${centerX - size / 2}px`,
          top: `${centerY - size / 2}px`,
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid white',
          boxShadow: '0 0 5px rgba(0,0,0,0.3)',
          zIndex: 20, // Increased z-index to be above citizens
          pointerEvents: 'none', 
        };

        return (
          <div key={`${polygon.id}-coa-marker`} style={style}>
            <CoatOfArmsImage
              src={imageElement?.src} // Utilise .src de HTMLImageElement
              ownerName={owner}
              size={size}
              baseStyle={{ width: '100%', height: '100%' }} // Style de base pour l'image ou le div de fallback
            />
          </div>
        );
      })}
    </>
  );
};

export default CoatOfArmsMarkers;
