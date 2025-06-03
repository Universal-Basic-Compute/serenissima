import { useState, useEffect, useCallback } from 'react';
import { landService } from '@/lib/services/LandService';
import { CoordinateService } from '@/lib/services/CoordinateService';

interface LandMarkers2Props {
  isVisible: boolean;
  rawPolygons: any[]; // Nouvelle prop pour les données brutes des polygones
  polygonsToRender: { // Conservé pour la partie rendu, mais l'effet principal utilisera rawPolygons
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
  rawPolygons,
  polygonsToRender,
  isNight,
  scale,
  canvasWidth,
  canvasHeight,
  mapTransformOffset
}: LandMarkers2Props) {
  const [landImages, setLandImages] = useState<Record<string, string>>({});
  const [imageSettings, setImageSettings] = useState<Record<string, LandImageSettings>>({});

  useEffect(() => {
    const loadLandImagesAndSettings = async () => {
      const images: Record<string, string> = {};
      const settingsRecord: Record<string, LandImageSettings> = {}; // Renommé pour éviter conflit de nom
      
      for (const rawPolygon of rawPolygons) { // Itérer sur rawPolygons
        if (rawPolygon && rawPolygon.id) {
          // Charger les paramètres d'image s'ils existent
          if (rawPolygon.imageSettings) {
            const loadedSettings = rawPolygon.imageSettings as LandImageSettings;

            // Migration à la volée de l'ancien format x,y vers lat,lng
            if (typeof loadedSettings.x === 'number' && typeof loadedSettings.y === 'number' &&
                loadedSettings.lat === undefined && loadedSettings.lng === undefined) {
              
              // Calculer polygonWorldMapCenterX/Y à partir de rawPolygon.center ou rawPolygon.centroid
              const centerLat = rawPolygon.center?.lat || rawPolygon.centroid?.lat;
              const centerLng = rawPolygon.center?.lng || rawPolygon.centroid?.lng;

              if (typeof centerLat === 'number' && typeof centerLng === 'number') {
                const polygonCenterWorld = CoordinateService.latLngToWorld(centerLat, centerLng);
                const markerWorld = { 
                  x: polygonCenterWorld.x + loadedSettings.x, 
                  y: polygonCenterWorld.y + loadedSettings.y 
                };
                const newLatLng = CoordinateService.worldToLatLng(markerWorld.x, markerWorld.y);
                
                settingsRecord[rawPolygon.id] = {
                  lat: newLatLng.lat,
                  lng: newLatLng.lng,
                  width: loadedSettings.width,
                  height: loadedSettings.height,
                  referenceScale: loadedSettings.referenceScale
                };
                // console.log(`CONVERTED old imageSettings for ${rawPolygon.id} to lat/lng`);
              } else {
                // Impossible de migrer sans centre/centroïde, conserver les anciens settings si lat/lng non définis
                // ou ignorer si on veut forcer la nouvelle structure. Pour l'instant, on ne l'ajoute pas à settingsRecord.
                console.warn(`Cannot migrate imageSettings for ${rawPolygon.id} due to missing center/centroid in rawPolygon data.`);
              }
            } else if (loadedSettings.lat !== undefined && loadedSettings.lng !== undefined) {
              // Si lat/lng sont déjà présents, utiliser directement
              settingsRecord[rawPolygon.id] = loadedSettings;
            }
            // Si ni x,y (migrables) ni lat,lng ne sont valides, les settings pour ce polygone ne seront pas ajoutés,
            // et donc l'image ne sera pas affichée.
          }

          // Si des settings valides (avec lat/lng) ont été établis, charger l'image
          if (settingsRecord[rawPolygon.id]) {
            const imageUrl = await landService.getLandImageUrl(rawPolygon.id);
            if (imageUrl) {
              images[rawPolygon.id] = imageUrl;
            }
          }
        }
      }
      
      setLandImages(images);
      // Fusionner les nouveaux settings avec les settings existants pour préserver l'état
      // si les polygonesToRender ne changent pas mais que d'autres props le font.
      setImageSettings(prevSettings => ({ ...prevSettings, ...settingsRecord }));
    };
    
    if (isVisible && rawPolygons.length > 0) { // Utiliser rawPolygons.length
      loadLandImagesAndSettings();
    }
  }, [isVisible, rawPolygons]); // Dépend de rawPolygons

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

        const worldCoords = CoordinateService.latLngToWorld(settings.lat, settings.lng);
        const screenCoords = CoordinateService.worldToScreen(worldCoords.x, worldCoords.y, scale, mapTransformOffset, canvasWidth, canvasHeight);
        const finalX = screenCoords.x;
        const finalY = screenCoords.y;
        
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
