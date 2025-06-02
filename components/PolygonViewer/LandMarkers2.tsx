import { useState, useEffect, useCallback } from 'react';
import { landService } from '@/lib/services/LandService';

interface LandMarkers2Props {
  isVisible: boolean;
  polygonsToRender: {
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
    polygonWorldMapCenterX?: number;
    polygonWorldMapCenterY?: number;
  }[];
  isNight: boolean;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  mapTransformOffset: { x: number, y: number };
}

interface LandImageSettings {
  lat?: number; // Latitude absolue du centre de l'image
  lng?: number; // Longitude absolue du centre de l'image
  x?: number; // Ancien offset X (pour la migration)
  y?: number; // Ancien offset Y (pour la migration)
  width: number;
  height: number;
  referenceScale?: number;
}

export default function LandMarkers2({
  isVisible,
  polygonsToRender,
  isNight,
  scale,
  canvasWidth,
  canvasHeight,
  mapTransformOffset
}: LandMarkers2Props) {
  const [landImages, setLandImages] = useState<Record<string, string>>({});
  const [imageSettings, setImageSettings] = useState<Record<string, LandImageSettings>>({});

  // Coordinate transformation utilities (identiques à LandMarkers.tsx)
  const worldToScreenX = (mapWorldX: number, mapWorldY: number, currentScale: number, currentMapTransformOffset: {x: number, y: number}, currentCanvasWidth: number): number => {
    return mapWorldX * currentScale + currentCanvasWidth / 2 + currentMapTransformOffset.x;
  };

  const worldToScreenY = (mapWorldX: number, mapWorldY: number, currentScale: number, currentMapTransformOffset: {x: number, y: number}, currentCanvasHeight: number): number => {
    // Modification : Suppression du facteur 1.4 pour tester
    return (-mapWorldY) * currentScale + currentCanvasHeight / 2 + currentMapTransformOffset.y;
  };

  useEffect(() => {
    const loadLandImagesAndSettings = async () => {
      const images: Record<string, string> = {};
      const settings: Record<string, LandImageSettings> = {};
      
      for (const polygonData of polygonsToRender) {
        if (polygonData.polygon && polygonData.polygon.id) {
          // Charger les paramètres d'image s'ils existent
          if (polygonData.polygon.imageSettings) {
            const loadedSettings = polygonData.polygon.imageSettings as LandImageSettings;

            // Migration à la volée de l'ancien format x,y vers lat,lng
            if (typeof loadedSettings.x === 'number' && typeof loadedSettings.y === 'number' &&
                loadedSettings.lat === undefined && loadedSettings.lng === undefined &&
                typeof polygonData.polygonWorldMapCenterX === 'number' &&
                typeof polygonData.polygonWorldMapCenterY === 'number') {
              
              const pWorldMapCenterX = polygonData.polygonWorldMapCenterX;
              const pWorldMapCenterY = polygonData.polygonWorldMapCenterY;
              const markerWorldX = pWorldMapCenterX + loadedSettings.x;
              const markerWorldY = pWorldMapCenterY + loadedSettings.y;

              const newLng = markerWorldX / 20000 + 12.3326;
              const newLat = markerWorldY / 20000 + 45.4371;
              
              settings[polygonData.polygon.id] = {
                lat: newLat,
                lng: newLng,
                width: loadedSettings.width,
                height: loadedSettings.height,
                referenceScale: loadedSettings.referenceScale
              };
              // console.log(`CONVERTED old imageSettings for ${polygonData.polygon.id} to lat/lng`);
            } else if (loadedSettings.lat !== undefined && loadedSettings.lng !== undefined) {
              // Si lat/lng sont déjà présents, utiliser directement
              settings[polygonData.polygon.id] = loadedSettings;
            }
            // Si ni x,y ni lat,lng ne sont valides, les settings pour ce polygone ne seront pas ajoutés,
            // et donc l'image ne sera pas affichée.
          }

          // Si des settings valides (avec lat/lng) ont été établis, charger l'image
          if (settings[polygonData.polygon.id]) {
            const imageUrl = await landService.getLandImageUrl(polygonData.polygon.id);
            if (imageUrl) {
              images[polygonData.polygon.id] = imageUrl;
            }
          }
        }
      }
      
      setLandImages(images);
      // Fusionner les nouveaux settings avec les settings existants pour préserver l'état
      // si les polygonesToRender ne changent pas mais que d'autres props le font.
      setImageSettings(prevSettings => ({ ...prevSettings, ...settings }));
    };
    
    if (isVisible && polygonsToRender.length > 0) {
      loadLandImagesAndSettings();
    }
  }, [isVisible, polygonsToRender]); // Dépend uniquement de isVisible et polygonsToRender

  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {polygonsToRender.map((polygonData) => {
        const polygon = polygonData.polygon;
        if (!polygon || !polygon.id) return null;

        const settings = imageSettings[polygon.id];
        // Afficher uniquement si les settings existent et ont lat/lng
        if (!settings || typeof settings.lat !== 'number' || typeof settings.lng !== 'number') {
          return null;
        }

        const imageUrl = landImages[polygon.id];
        if (!imageUrl) return null; // Et si l'URL de l'image est disponible
        
        const opacity = isNight ? 0.5 : 0.7;
        
        let width, height;
        if (settings.width !== undefined && settings.height !== undefined) {
          const baseWidth = settings.width;
          const baseHeight = settings.height;
          if (settings.referenceScale) {
            const scaleFactor = scale / settings.referenceScale;
            width = baseWidth * scaleFactor;
            height = baseHeight * scaleFactor;
          } else {
            width = baseWidth * scale;
            height = baseHeight * scale;
          }
        } else {
          width = 75 * scale; // Valeurs par défaut
          height = 75 * scale;
        }
        
        const markerMapWorldX = (settings.lng - 12.3326) * 20000;
        const markerMapWorldY = (settings.lat - 45.4371) * 20000;

        const finalX = worldToScreenX(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
        const finalY = worldToScreenY(markerMapWorldX, markerMapWorldY, scale, mapTransformOffset, canvasWidth, canvasHeight);
        
        return (
          <div
            key={`${polygon.id}-marker2`}
            data-land-id={polygon.id}
            className="absolute"
            style={{
              position: 'absolute',
              left: `${finalX}px`,
              top: `${finalY}px`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex: 10, // Z-index de base
              transform: 'translate(-50%, -50%)',
              opacity: opacity,
              pointerEvents: 'none', // Pas d'interaction
            }}
          >
            <img
              src={imageUrl}
              alt={polygon.historicalName || polygon.id}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: isNight ? 'brightness(0.7) saturate(0.8)' : 'none',
              }}
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          </div>
        );
      })}
    </div>
  );
}
