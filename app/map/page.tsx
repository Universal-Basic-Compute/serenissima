'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { GoogleMap, LoadScript, DrawingManager } from '@react-google-maps/api';
import { findClosestPointOnPolygonEdge } from '@/lib/utils/fileUtils';
import PolygonDisplayPanel from '../../components/PolygonViewer/PolygonDisplayPanel'; // Import the new panel using relative path

// Venice coordinates
const center = {
  lat: 45.4371908,
  lng: 12.3345898
};

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

// Polygon styling options
const polygonOptions = {
  fillColor: '#FFF5D0', // Sand color like on the main page during the day
  fillOpacity: 0.1,
  strokeWeight: 1,      // Black stroke, 1px weight like on the main page
  strokeColor: '#000000',
  strokeOpacity: 0.8,
  editable: true,
  draggable: true
};

// Libraries we need to load
const libraries: ("drawing" | "geometry" | "places" | "visualization")[] = ['drawing', 'geometry'];

export default function MapPage() {
  // State for wallet connection
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletAdapter, setWalletAdapter] = useState<PhantomWalletAdapter | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Get API key from environment variable
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const [savedPolygons, setSavedPolygons] = useState<google.maps.Polygon[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [activeLandPolygons, setActiveLandPolygons] = useState<{[id: string]: google.maps.Polygon}>({}); // State for data, not direct map objects for clearing
  const drawnMapPolygonsRef = useRef<google.maps.Polygon[]>([]); // Ref to hold actual google.maps.Polygon objects
  const groundOverlaysMapRef = useRef<Record<string, google.maps.GroundOverlay>>({}); // Use this for overlays by ID
  const [centroidMarkers, setCentroidMarkers] = useState<{[id: string]: google.maps.Marker}>({});
  const [isDraggingCentroid, setIsDraggingCentroid] = useState(false);
  const [centroidDragMode, setCentroidDragMode] = useState(false);
  
  // State for WaterPoints (data loading and display, not creation)
  const [waterPoints, setWaterPoints] = useState<any[]>([]);
  const [waterPointMarkers, setWaterPointMarkers] = useState<{[id: string]: google.maps.Marker}>({});
  const [waterPointConnections, setWaterPointConnections] = useState<google.maps.Polyline[]>([]);

  // State for PolygonDisplayPanel on map page
  const [selectedMapPolygonData, setSelectedMapPolygonData] = useState<any | null>(null);
  const [showMapPolygonDisplayPanel, setShowMapPolygonDisplayPanel] = useState<boolean>(false);

  // State to store raw polygon data for batch download
  const [rawPolygonsData, setRawPolygonsData] = useState<any[]>([]);

  // State for editing GroundOverlays
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const editingOverlayRef = useRef<google.maps.GroundOverlay | null>(null);
  const editingOverlayInitialBoundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const editingHandlesRef = useRef<google.maps.Marker[]>([]);
  const isDraggingHandleRef = useRef<boolean>(false);
  
  // Initialize wallet adapter
  useEffect(() => {
    const adapter = new PhantomWalletAdapter();
    setWalletAdapter(adapter);
    
    // Check if wallet is already connected
    if (adapter.connected) {
      setWalletAddress(adapter.publicKey?.toString() || null);
    }
    
    return () => {
      // Clean up adapter when component unmounts
      if (adapter) {
        adapter.disconnect();
      }
    };
  }, []);
  
  // Add effect to handle clicking outside the dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Functions to interact with the backend
  const storeWalletInAirtable = async (walletAddress: string): Promise<any> => {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to store wallet');
      }
      
      const data = await response.json();
      console.log('Wallet stored in Airtable:', data);
      return data;
    } catch (error) {
      console.error('Error storing wallet:', error);
      return null;
    }
  };

  const investCompute = async (walletAddress: string, amount: number): Promise<any> => {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/invest-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          ducats: amount,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to invest compute');
      }
      
      const data = await response.json();
      console.log('Compute invested:', data);
      return data;
    } catch (error) {
      console.error('Error investing compute:', error);
      return null;
    }
  };

  // Handle wallet connection
  const connectWallet = useCallback(async () => {
    if (!walletAdapter) return;
    
    if (walletAdapter.connected) {
      // If already connected, disconnect
      await walletAdapter.disconnect();
      setWalletAddress(null);
      // Clear wallet from localStorage
      localStorage.removeItem('walletAddress');
      return;
    }
    
    // Check if Phantom is installed
    if (walletAdapter.readyState !== WalletReadyState.Installed) {
      window.open('https://phantom.app/', '_blank');
      return;
    }
    
    try {
      await walletAdapter.connect();
      const address = walletAdapter.publicKey?.toString() || null;
      setWalletAddress(address);
      console.log('Connected to wallet:', address);
      
      // Store wallet in localStorage for use in other components
      if (address) {
        localStorage.setItem('walletAddress', address);
        // Store wallet in Airtable
        await storeWalletInAirtable(address);
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
    }
  }, [walletAdapter]);

  if (!apiKey) {
    return <div className="w-screen h-screen flex items-center justify-center">
      <p>Google Maps API key is missing. Please add it to your .env.local file.</p>
    </div>;
  }

  // Function to save polygon data to a file
  const savePolygonToFile = (polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const coordinates = Array.from({ length: path.getLength() }, (_, i) => {
      const point = path.getAt(i);
      return { lat: point.lat(), lng: point.lng() };
    });

    // In a real app, you would send this to your backend
    // For now, we'll log it to console
    console.log('Saving polygon:', coordinates);
    
    // Add to our local state
    setSavedPolygons(prev => [...prev, polygon]);

    // Send polygon data to the API
    fetch('/api/save-polygon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Polygon ${data.isNew ? 'created' : 'updated'}: ${data.filename}`);
      } else {
        console.error('Failed to save polygon:', data.error);
      }
    })
    .catch(error => {
      console.error('Error saving polygon:', error);
    });
  };

  // Handle polygon complete event
  const onPolygonComplete = (polygon: google.maps.Polygon) => {
    // Apply rounded corners (this is a visual effect only)
    polygon.setOptions({
      ...polygonOptions,
      // The geodesic option helps create slightly rounded paths
      geodesic: true
    });

    // Auto-close the polygon if needed
    const path = polygon.getPath();
    if (path.getLength() > 2) {
      const firstPoint = path.getAt(0);
      const lastPoint = path.getAt(path.getLength() - 1);
      
      // If the first and last points are close enough, snap to close
      const threshold = 0.0001; // Adjust based on your needs
      if (
        Math.abs(firstPoint.lat() - lastPoint.lat()) < threshold &&
        Math.abs(firstPoint.lng() - lastPoint.lng()) < threshold
      ) {
        // Remove the last point and use the first point to close the polygon
        path.removeAt(path.getLength() - 1);
        // No need to add the first point again as polygons auto-close visually
      }
    }

    // Save the polygon
    savePolygonToFile(polygon);

    // Add listener for changes to save updated polygon
    // Use a debounce to prevent saving on every small change
    if (typeof google !== 'undefined') {
      let saveTimeout: NodeJS.Timeout | null = null;
      
      const debouncedSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          savePolygonToFile(polygon);
          saveTimeout = null;
        }, 1000); // Wait 1 second after changes stop before saving
      };
      
      google.maps.event.addListener(polygon.getPath(), 'set_at', debouncedSave);
      google.maps.event.addListener(polygon.getPath(), 'insert_at', debouncedSave);
    }
  };

  // Add a function to get polygon coordinates from a Google Maps polygon
  const getPolygonCoordinates = (polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    return Array.from({ length: path.getLength() }, (_, i) => {
      const point = path.getAt(i);
      return { lat: point.lat(), lng: point.lng() };
    });
  };
  
  

  // Handle map load
  const onMapLoad = (map: google.maps.Map) => {
    console.log('Map loaded');
    mapRef.current = map;

    // If Google API is already loaded by the time map is ready, load polygons.
    if (isGoogleLoaded) {
      console.log('onMapLoad: Google API already loaded, calling loadPolygonsOnMap.');
      loadPolygonsOnMap();
    }
    
    // Remove any existing click listeners to avoid duplicates
    google.maps.event.clearListeners(map, 'click');
    
    // Add click listener for bridge and canal creation
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      // Pass the event to handleMapClick with current state values
      const event = e as google.maps.MapMouseEvent;
      if (!event.latLng) return;

      // TODO: Implement any general map click logic if needed,
      // e.g., deselecting polygons or other elements.
      // For now, this is a placeholder.
      console.log('Map clicked at:', event.latLng.toJSON());

      // If an overlay is being edited, clicking the map deselects it
      if (editingOverlayId && !isDraggingHandleRef.current) {
        console.log('Map clicked while editing overlay, clearing editing state.');
        clearEditingState();
      } else if (showMapPolygonDisplayPanel) {
        // If display panel is open and map is clicked, close it.
        setShowMapPolygonDisplayPanel(false);
        setSelectedMapPolygonData(null);
      }
    });
    
    // Add this debug message
    console.log('Map click handler attached');
  };

  // Handle drawing manager load
  const onDrawingManagerLoad = (drawingManager: google.maps.drawing.DrawingManager) => {
    drawingManagerRef.current = drawingManager;
    setIsGoogleLoaded(true);
  };

  // Define clearEditingState before loadPolygonsOnMap as it's a dependency
  const clearEditingState = useCallback(() => {
    setEditingOverlayId(null);
    if (editingOverlayRef.current) editingOverlayRef.current = null;
    if (editingOverlayInitialBoundsRef.current) editingOverlayInitialBoundsRef.current = null;
    editingHandlesRef.current.forEach(marker => marker.setMap(null));
    editingHandlesRef.current = [];
  }, [setEditingOverlayId]); // setEditingOverlayId is stable
  
  // Add a function to load polygons onto the map
  const loadPolygonsOnMap = useCallback(() => {
    if (!mapRef.current || !isGoogleLoaded) {
      console.log('loadPolygonsOnMap: Aborted. mapRef.current:', !!mapRef.current, 'isGoogleLoaded:', isGoogleLoaded);
      return;
    }
    console.log('loadPolygonsOnMap: Executing.');

    // Clear existing polygons from the map using the ref
    drawnMapPolygonsRef.current.forEach(p => p.setMap(null));
    drawnMapPolygonsRef.current = []; // Reset the ref array

    // Clear existing ground overlays from the map using the ref
    Object.values(groundOverlaysMapRef.current).forEach(overlay => overlay.setMap(null));
    groundOverlaysMapRef.current = {}; // Reset the map of overlays

    const newActivePolygonsState: Record<string, google.maps.Polygon> = {}; // For React state update
    
    // Fetch polygons from API
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        setRawPolygonsData(data.polygons || []); // Store raw polygon data
        (data.polygons || []).forEach((polygon: any, index: number) => {
          if (polygon.coordinates && polygon.coordinates.length > 2) {
            const path = polygon.coordinates.map((coord: any) => ({
              lat: coord.lat,
              lng: coord.lng
            }));
            
            const mapPolygon = new google.maps.Polygon({
              paths: path,
              strokeColor: '#000000', // Black stroke
              strokeOpacity: 0.8,
              strokeWeight: 1,        // 1px weight
              fillColor: '#FFF5D0',   // Sand color
              fillOpacity: 0.1,       // Reduced opacity as requested
              map: mapRef.current
            });
            
            // Store reference to polygon for state, and in ref for direct manipulation
            drawnMapPolygonsRef.current.push(mapPolygon);
            newActivePolygonsState[polygon.id] = mapPolygon;

            // Create and add GroundOverlay for the land image
            const imageUrl = `/images/lands/${polygon.id}.png`;
            let finalImageBounds: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;

            if (polygon.imageOverlayBounds && 
                typeof polygon.imageOverlayBounds.north === 'number' &&
                typeof polygon.imageOverlayBounds.south === 'number' &&
                typeof polygon.imageOverlayBounds.east === 'number' &&
                typeof polygon.imageOverlayBounds.west === 'number') {
              // Use stored bounds if available and valid
              finalImageBounds = polygon.imageOverlayBounds;
              console.log(`Using stored imageOverlayBounds for polygon ${polygon.id}:`, polygon.imageOverlayBounds);
            } else {
              // Calculate bounds from polygon path as fallback
              const pathForBounds = mapPolygon.getPath();
              const calculatedBounds = new google.maps.LatLngBounds();
              for (let k = 0; k < pathForBounds.getLength(); k++) {
                calculatedBounds.extend(pathForBounds.getAt(k));
              }
              finalImageBounds = calculatedBounds;
              console.log(`No stored imageOverlayBounds for polygon ${polygon.id}, using calculated bounds:`, calculatedBounds.toJSON());
            }
            
            // Ensure finalImageBounds is not empty before creating overlay
            const checkBounds = finalImageBounds instanceof google.maps.LatLngBounds ? finalImageBounds : new google.maps.LatLngBounds(
              { lat: (finalImageBounds as google.maps.LatLngBoundsLiteral).south, lng: (finalImageBounds as google.maps.LatLngBoundsLiteral).west },
              { lat: (finalImageBounds as google.maps.LatLngBoundsLiteral).north, lng: (finalImageBounds as google.maps.LatLngBoundsLiteral).east }
            );

            if (!checkBounds.isEmpty() && mapRef.current) {
              const groundOverlay = new google.maps.GroundOverlay(
                imageUrl,
                finalImageBounds,
                {
                  opacity: 0.7, // Changed opacity to 0.7
                  map: mapRef.current
                  // zIndex is not a valid GroundOverlayOption, it's managed by map pane or draw order.
                  // For images on top of polygons, ensure polygons are added first or use map panes if more control is needed.
                }
              );
              groundOverlaysMapRef.current[polygon.id] = groundOverlay; // Store in the map

              // Add click listener to the GroundOverlay
              groundOverlay.addListener('click', () => {
                handleOverlayClick(polygon.id, groundOverlay);
              });

            } else {
              console.warn(`Could not calculate bounds or mapRef not ready for polygon ${polygon.id}, skipping image overlay.`);
            }

            // Add click listener to this mapPolygon
            mapPolygon.addListener('click', (event: google.maps.MapMouseEvent) => {
              // If an overlay is being edited, clicking its polygon should not open the display panel.
              // Instead, it could potentially deselect the overlay editing.
              if (editingOverlayId) {
                // Check if the click was on the polygon associated with the currently edited overlay
                if (editingOverlayId !== polygon.id) {
                  // Clicked on a different polygon while another is being edited
                  clearEditingState(); // Deselect current editing state
                  // Then proceed to select the new polygon for display panel
                  setSelectedMapPolygonData({
                    id: polygon.id,
                    coordinates: polygon.coordinates,
                    historicalName: polygon.historicalName,
                    imageOverlayBounds: polygon.imageOverlayBounds || groundOverlaysMapRef.current[polygon.id]?.getBounds()?.toJSON() || null
                  });
                  setShowMapPolygonDisplayPanel(true);
                } else {
                  // Clicked on the polygon of the currently edited overlay.
                  // Do nothing, or maybe deselect editing state if preferred.
                  // For now, do nothing to keep handles active.
                }
              } else {
                // No overlay is being edited, normal behavior for polygon click
                setSelectedMapPolygonData({
                  id: polygon.id,
                  coordinates: polygon.coordinates,
                  historicalName: polygon.historicalName,
                  imageOverlayBounds: polygon.imageOverlayBounds || groundOverlaysMapRef.current[polygon.id]?.getBounds()?.toJSON() || null
                });
                setShowMapPolygonDisplayPanel(true);
              }
            });
          }
        });
        
        setActiveLandPolygons(newActivePolygonsState);
        console.log(`loadPolygonsOnMap: ${Object.keys(newActivePolygonsState).length} polygons set to state and map.`);
      })
      .catch(error => {
        console.error('loadPolygonsOnMap: Error fetching or processing polygons:', error);
      });
  }, [isGoogleLoaded, setActiveLandPolygons, setSelectedMapPolygonData, setShowMapPolygonDisplayPanel, editingOverlayId, clearEditingState, setRawPolygonsData]); // Added editingOverlayId, clearEditingState, setRawPolygonsData
  
  // Add useEffect to load polygons when map is ready
  useEffect(() => {
    console.log('MapPage: useEffect for loading polygons triggered by isGoogleLoaded/loadPolygonsOnMap change.', { isGoogleLoaded, hasMapRef: !!mapRef.current });
    // This effect runs when isGoogleLoaded becomes true.
    // If map is already loaded by then, loadPolygonsOnMap will execute.
    // If map is not yet loaded, onMapLoad will call loadPolygonsOnMap when map becomes ready.
    if (isGoogleLoaded && mapRef.current) {
      console.log('MapPage: Conditions met (isGoogleLoaded=true, mapRef exists), calling loadPolygonsOnMap.');
      loadPolygonsOnMap();
    }
  }, [isGoogleLoaded, loadPolygonsOnMap]); // mapRef.current is not a direct dependency here.
  
  
  // Function to load WaterPoints
  const loadWaterPoints = useCallback(() => {
    fetch('/api/waterpoint')
      .then(response => response.json())
      .then(data => {
        // Vérifier le format des données
        const points = Array.isArray(data) ? data : (data.waterpoints || []);
        
        console.log('WaterPoints data received:', data);
        console.log(`Loaded ${points.length} existing waterpoints`);
        
        // Créer un ensemble des IDs des points actuels pour vérification rapide
        const currentPointIds = new Set(points.map((point: any) => point.id));
        
        // Visualiser les WaterPoints sur la carte
        if (mapRef.current) {
          // Supprimer les marqueurs des points qui n'existent plus
          Object.entries(waterPointMarkers).forEach(([id, marker]) => {
            if (!currentPointIds.has(id)) {
              // Ce point n'existe plus dans les données, supprimer son marqueur
              marker.setMap(null);
            }
          });
          
          // Supprimer les lignes de connexion existantes
          waterPointConnections.forEach(line => line.setMap(null));
          
          // Créer de nouveaux objets pour stocker les marqueurs et connexions
          const newMarkers: {[id: string]: google.maps.Marker} = {};
          const newConnections: google.maps.Polyline[] = [];
          
          // Créer des marqueurs pour chaque WaterPoint
          points.forEach((point: any) => {
            // Convertir la position si elle est stockée sous forme de chaîne
            const position = typeof point.position === 'string' 
              ? JSON.parse(point.position) 
              : point.position;
            
            // Vérifier si un marqueur existe déjà pour ce point
            const existingMarker = waterPointMarkers[point.id];
            
            if (existingMarker) {
              // Mettre à jour la position du marqueur existant si nécessaire
              const currentPos = existingMarker.getPosition();
              const newPos = new google.maps.LatLng(position.lat, position.lng);
              
              if (currentPos?.lat() !== newPos.lat() || currentPos?.lng() !== newPos.lng()) {
                existingMarker.setPosition(newPos);
              }
              
              // Réutiliser le marqueur existant
              newMarkers[point.id] = existingMarker;
            } else {
              // Créer un nouveau marqueur
              const marker = new google.maps.Marker({
                position: new google.maps.LatLng(position.lat, position.lng),
                map: mapRef.current,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 7,
                  fillColor: point.type === 'dock' ? '#FF8800' : '#0088FF',
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: '#FFFFFF'
                },
                title: point.id
              });
              
              // Ajouter un écouteur de clic pour sélectionner ce WaterPoint
              marker.addListener('click', () => {
                // Placeholder for click action on existing water points if needed
                console.log('WaterPoint clicked:', point);
              });
              
              // Stocker le type dans les propriétés du marqueur
              marker.set('type', point.type);
              newMarkers[point.id] = marker;
            }
          });
          
          // Créer des lignes pour les connexions
          points.forEach((point: any) => {
            const connections = typeof point.connections === 'string' 
              ? JSON.parse(point.connections) 
              : (point.connections || []);
            
            connections.forEach((connection: any) => {
              // Trouver le WaterPoint cible
              const targetPoint = points.find((p: any) => p.id === connection.targetId);
              if (targetPoint) {
                // Convertir les positions si nécessaire
                const sourcePos = typeof point.position === 'string' 
                  ? JSON.parse(point.position) 
                  : point.position;
                
                const targetPos = typeof targetPoint.position === 'string' 
                  ? JSON.parse(targetPoint.position) 
                  : targetPoint.position;
                
                // Créer une ligne pour la connexion
                const line = new google.maps.Polyline({
                  path: [
                    new google.maps.LatLng(sourcePos.lat, sourcePos.lng),
                    new google.maps.LatLng(targetPos.lat, targetPos.lng)
                  ],
                  geodesic: true,
                  strokeColor: '#0088FF',
                  strokeOpacity: 0.7,
                  strokeWeight: 3,
                  map: mapRef.current
                });
                
                newConnections.push(line);
              }
            });
          });
          
          // Mettre à jour les états avec les nouveaux marqueurs et connexions
          setWaterPointMarkers(newMarkers);
          setWaterPointConnections(newConnections);
        }
        
        // Mettre à jour l'état des points
        setWaterPoints(points);
      })
      .catch(error => {
        console.error('Error loading waterpoints:', error);
      });
  }, [waterPointMarkers, waterPointConnections]);
  
  // Load WaterPoints when the map loads
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      // Charger les WaterPoints au démarrage, pas seulement en mode WaterPoint
      loadWaterPoints();
    }
  }, [mapRef.current, isGoogleLoaded, loadWaterPoints]);
  
  // Handle script load
  const handleScriptLoad = () => {
    setIsGoogleLoaded(true);
  };
  
  // Handler to close the map polygon display panel
  const handleCloseMapPolygonDisplayPanel = () => {
    setShowMapPolygonDisplayPanel(false);
    setSelectedMapPolygonData(null);
  };

  const createHandlesForOverlay = (overlay: google.maps.GroundOverlay, overlayId: string) => {
    clearEditingState(); // Clear any existing handles first

    const bounds = overlay.getBounds();
    if (!bounds || !mapRef.current) return;

    editingOverlayRef.current = overlay;
    setEditingOverlayId(overlayId);
    editingOverlayInitialBoundsRef.current = bounds;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const nw = new google.maps.LatLng(ne.lat(), sw.lng());
    const se = new google.maps.LatLng(sw.lat(), ne.lng());
    const center = bounds.getCenter();

    const handlePositions = {
      center: center,
      ne: ne,
      sw: sw,
      nw: nw,
      se: se,
    };

    const newHandles: google.maps.Marker[] = [];

    Object.entries(handlePositions).forEach(([key, pos]) => {
      const handleMarker = new google.maps.Marker({
        position: pos,
        map: mapRef.current,
        draggable: true,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: key === 'center' ? '#FF0000' : '#FFFF00', // Red for move, Yellow for resize
          fillOpacity: 0.8,
          strokeColor: '#000000',
          strokeWeight: 1,
        },
        zIndex: 100 // Ensure handles are on top
      });

      handleMarker.addListener('dragstart', () => {
        isDraggingHandleRef.current = true;
      });

      handleMarker.addListener('drag', () => {
        if (!editingOverlayRef.current || !editingOverlayInitialBoundsRef.current) return;
        
        const currentOverlay = editingOverlayRef.current;
        const initialBounds = editingOverlayInitialBoundsRef.current;
        const newPos = handleMarker.getPosition();
        if (!newPos) return;

        let newBounds = currentOverlay.getBounds();
        if (!newBounds) newBounds = initialBounds;


        if (key === 'center') {
          const oldCenter = initialBounds.getCenter();
          const latDiff = newPos.lat() - oldCenter.lat();
          const lngDiff = newPos.lng() - oldCenter.lng();

          const currentSW = newBounds.getSouthWest();
          const currentNE = newBounds.getNorthEast();
          
          newBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(currentSW.lat() + latDiff, currentSW.lng() + lngDiff),
            new google.maps.LatLng(currentNE.lat() + latDiff, currentNE.lng() + lngDiff)
          );
        } else { // Resize handle
          // Basic resize logic (aspect ratio preservation needs more work)
          let newNELat = newBounds.getNorthEast().lat();
          let newNELng = newBounds.getNorthEast().lng();
          let newSWLat = newBounds.getSouthWest().lat();
          let newSWLng = newBounds.getSouthWest().lng();

          if (key === 'ne') { newNELat = newPos.lat(); newNELng = newPos.lng(); }
          else if (key === 'sw') { newSWLat = newPos.lat(); newSWLng = newPos.lng(); }
          else if (key === 'nw') { newNELat = newPos.lat(); newSWLng = newPos.lng(); } 
          else if (key === 'se') { newSWLat = newPos.lat(); newNELng = newPos.lng(); } 

          if (newNELat < newSWLat) { const temp = newNELat; newNELat = newSWLat; newSWLat = temp;}
          // Longitude check is more complex with antimeridian, simplified here
          // if (newNELng < newSWLng) { const temp = newNELng; newNELng = newSWLng; newSWLng = temp;}

          newBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(newSWLat, newSWLng),
            new google.maps.LatLng(newNELat, newNELng)
          );
           // TODO: Implement aspect ratio preservation here
        }
        
        (currentOverlay as any).setBounds(newBounds);
      });

      handleMarker.addListener('dragend', () => {
        isDraggingHandleRef.current = false;
        if (editingOverlayRef.current) {
            const currentBounds = editingOverlayRef.current.getBounds();
            if (currentBounds) {
                editingOverlayInitialBoundsRef.current = currentBounds; 
                // Refresh all handle positions based on new overlay bounds
                const newNe = currentBounds.getNorthEast();
                const newSw = currentBounds.getSouthWest();
                editingHandlesRef.current.forEach(h => {
                    const title = h.getTitle(); 
                    if (title === 'center') h.setPosition(currentBounds.getCenter());
                    else if (title === 'ne') h.setPosition(newNe);
                    else if (title === 'sw') h.setPosition(newSw);
                    else if (title === 'nw') h.setPosition(new google.maps.LatLng(newNe.lat(), newSw.lng()));
                    else if (title === 'se') h.setPosition(new google.maps.LatLng(newSw.lat(), newNe.lng()));
                });
            }
        }
      });
      handleMarker.setTitle(key); 
      newHandles.push(handleMarker);
    });
    editingHandlesRef.current = newHandles;
  };

  const handleOverlayClick = (polygonId: string, overlay: google.maps.GroundOverlay) => {
    if (mapRef.current) {
      // If already editing this overlay, optionally deselect or do nothing
      if (editingOverlayId === polygonId) {
        // clearEditingState(); // Uncomment to deselect on second click
        return;
      }
      createHandlesForOverlay(overlay, polygonId);
    }
  };

  const handlePreviewOverlayBoundsOnMap = useCallback((polygonId: string, bounds: google.maps.LatLngBoundsLiteral) => {
    const overlay = groundOverlaysMapRef.current[polygonId];
    if (overlay && mapRef.current) {
      try {
        const newBounds = new google.maps.LatLngBounds(
          { lat: bounds.south, lng: bounds.west },
          { lat: bounds.north, lng: bounds.east }
        );
        (overlay as any).setBounds(newBounds);
        // Update the stored raw data for consistency if panel is reopened before save/reload
        const updatedRawData = rawPolygonsData.map(p => 
          p.id === polygonId ? { ...p, imageOverlayBounds: bounds } : p
        );
        setRawPolygonsData(updatedRawData);
        if (selectedMapPolygonData && selectedMapPolygonData.id === polygonId) {
            setSelectedMapPolygonData(prev => prev ? ({...prev, imageOverlayBounds: bounds}) : null);
        }

      } catch (error) {
        console.error("Error setting bounds for preview:", error);
        alert("Erreur lors de la mise à jour des limites pour l'aperçu. Vérifiez les valeurs.");
      }
    }
  }, [rawPolygonsData, selectedMapPolygonData]);

  const handleSaveOverlayBoundsToBackend = useCallback(async (polygonId: string, bounds: google.maps.LatLngBoundsLiteral) => {
    try {
      const response = await fetch(`/api/polygons/${polygonId}/image-bounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`Limites de l'image pour ${polygonId} sauvegardées avec succès!`);
        // Optionally, update local rawPolygonsData to reflect the save without a full reload
        const updatedRawData = rawPolygonsData.map(p => 
          p.id === polygonId ? { ...p, imageOverlayBounds: bounds } : p
        );
        setRawPolygonsData(updatedRawData);
         // Update selectedMapPolygonData if it's the one being edited
        if (selectedMapPolygonData && selectedMapPolygonData.id === polygonId) {
            setSelectedMapPolygonData(prev => prev ? ({...prev, imageOverlayBounds: bounds}) : null);
        }
      } else {
        throw new Error(result.error || `Échec de la sauvegarde des limites de l'image.`);
      }
    } catch (error: any) {
      console.error(`Erreur lors de la sauvegarde des limites pour ${polygonId}:`, error);
      alert(`Erreur: ${error.message}`);
    }
  }, [rawPolygonsData, selectedMapPolygonData]);

  const downloadAllPolygonImages = async () => {
    if (rawPolygonsData.length === 0) {
      alert("Aucun polygone à télécharger.");
      return;
    }

    alert(`Préparation du téléchargement de ${rawPolygonsData.length} images de polygones. Cela peut prendre un moment.`);

    for (let i = 0; i < rawPolygonsData.length; i++) {
      const polygon = rawPolygonsData[i];
      if (!polygon.coordinates || polygon.coordinates.length === 0) {
        console.warn(`Polygone ${polygon.id} ignoré: pas de coordonnées.`);
        continue;
      }

      // Logic duplicated from PolygonDisplayPanel for SVG generation and download
      const SVG_SIZE = 300;
      const PADDING = 20;
      const HEIGHT_ADJUST_FACTOR = 0.7;
      const { coordinates } = polygon;

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      coordinates.forEach((coord: {lng: number, lat: number}) => {
        if (coord.lng < minLng) minLng = coord.lng;
        if (coord.lng > maxLng) maxLng = coord.lng;
        if (coord.lat < minLat) minLat = coord.lat;
        if (coord.lat > maxLat) maxLat = coord.lat;
      });

      const polyDataWidth = maxLng - minLng;
      const polyDataHeight = maxLat - minLat;

      if (polyDataWidth === 0 && polyDataHeight === 0 && coordinates.length > 0) {
        console.warn(`Polygone ${polygon.id} ignoré: sans superficie (dégénéré).`);
        continue;
      }
      
      const drawableWidth = SVG_SIZE - 2 * PADDING;
      const drawableHeight = SVG_SIZE - 2 * PADDING;
      let scale = 1;

      if (polyDataWidth > 0 && polyDataHeight > 0) {
        scale = Math.min(
          drawableWidth / polyDataWidth,
          drawableHeight / (polyDataHeight / HEIGHT_ADJUST_FACTOR)
        );
      } else if (polyDataWidth > 0) {
        scale = drawableWidth / polyDataWidth;
      } else if (polyDataHeight > 0) {
        scale = drawableHeight / (polyDataHeight / HEIGHT_ADJUST_FACTOR);
      }

      const scaledWidth = polyDataWidth * scale;
      const adjustedScaledHeight = (polyDataHeight / HEIGHT_ADJUST_FACTOR) * scale;
      const offsetX = (SVG_SIZE - scaledWidth) / 2;
      const offsetY = (SVG_SIZE - adjustedScaledHeight) / 2;

      const pointsString = coordinates.map((coord: {lng: number, lat: number}) => {
        const svgX = (coord.lng - minLng) * scale + offsetX;
        const svgY = ((maxLat - coord.lat) / HEIGHT_ADJUST_FACTOR) * scale + offsetY;
        return `${svgX},${svgY}`;
      }).join(' ');

      const svgString = `
        <svg viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#F5E8C0" />
          <polygon points="${pointsString}" fill="#E0C9A6" fillOpacity="0.7" stroke="#5D4037" strokeOpacity="0.8" strokeWidth="1" />
        </svg>`;

      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      // Using a Promise to handle async image loading before proceeding
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = SVG_SIZE;
          canvas.height = SVG_SIZE;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, SVG_SIZE, SVG_SIZE);
            const pngUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = `${polygon.id || `image-${i}`}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }
          URL.revokeObjectURL(svgUrl);
          resolve();
        };
        img.onerror = (e) => {
          console.error(`Erreur de chargement du SVG en image pour le polygone ${polygon.id}:`, e);
          URL.revokeObjectURL(svgUrl);
          reject(e);
        };
        img.src = svgUrl;
      });
      
      // Small delay to prevent browser from freezing or blocking downloads
      await new Promise(resolve => setTimeout(resolve, 300)); 
    }
    alert("Téléchargement de toutes les images terminé.");
  };
  
  // Set cursor to crosshair on initial load if waterPointMode is active
  useEffect(() => {
    if (mapRef.current) { // Removed waterPointMode condition
      // mapRef.current.setOptions({ // Default cursor, or remove if not needed
      //   draggableCursor: '' 
      // });
      
      // Charger les WaterPoints existants au démarrage
      loadWaterPoints();
    }
  }, [mapRef.current, loadWaterPoints]); // Removed waterPointMode

  // Create drawing manager options with client-side safety
  const [drawingManagerOptions, setDrawingManagerOptions] = useState<any>({
    drawingControl: true,
    drawingControlOptions: {
      position: 1, // TOP_CENTER
      drawingModes: ['polygon'] as any
    },
    polygonOptions
  });

  // Update drawing manager options when Google is loaded
  useEffect(() => {
    if (isGoogleLoaded && typeof google !== 'undefined') {
      setDrawingManagerOptions({
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [google.maps.drawing.OverlayType.POLYGON]
        },
        polygonOptions
      });
    }
  }, [isGoogleLoaded]);

  return (
    <div className="relative w-screen h-screen">
      {/* Wallet button/dropdown */}
      {walletAddress ? (
        <div className="absolute top-4 right-4 z-10" ref={dropdownRef}>
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="bg-white px-4 py-2 rounded shadow hover:bg-gray-100 transition-colors flex items-center"
          >
            <span className="mr-2">{walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20">
              <button
                onClick={async () => {
                  if (walletAddress) {
                    // Ask for Ducats using a prompt
                    const amountStr = prompt('Enter Ducats to invest:', '1');
                    if (amountStr) {
                      const amount = parseFloat(amountStr);
                      if (!isNaN(amount) && amount > 0) {
                        await investCompute(walletAddress, amount);
                        alert(`Successfully invested ${amount} compute resources!`);
                      } else {
                        alert('Please enter a valid amount greater than 0');
                      }
                    }
                  }
                  setDropdownOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-blue-500 hover:text-white transition-colors"
              >
                Invest Compute
              </button>
              <button
                onClick={() => {
                  connectWallet();
                  setDropdownOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-red-500 hover:text-white transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      ) : (
        <button 
          onClick={connectWallet}
          className="absolute top-4 right-4 z-10 bg-white px-4 py-2 rounded shadow hover:bg-purple-100 transition-colors"
        >
          Connect Wallet
        </button>
      )}
      
      {/* Back to 3D View button */}
      <a 
        href="/"
        className="absolute top-4 left-4 z-10 bg-white px-4 py-2 rounded shadow hover:bg-blue-100 transition-colors"
      >
        Back to 3D View
      </a>

      <button
        onClick={downloadAllPolygonImages}
        className="absolute top-16 left-4 z-10 bg-green-500 text-white px-4 py-2 rounded shadow hover:bg-green-600 transition-colors"
      >
        Télécharger toutes les images
      </button>
      
      
      {/* Google Maps */}
      <LoadScript
        googleMapsApiKey={apiKey}
        libraries={libraries}
        onLoad={handleScriptLoad}
      >
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={15}
          onLoad={onMapLoad}
        >
          {isGoogleLoaded && (
            <DrawingManager
              onLoad={onDrawingManagerLoad}
              onPolygonComplete={onPolygonComplete}
              options={drawingManagerOptions}
            />
          )}
        </GoogleMap>
      </LoadScript>

      {/* Polygon Display Panel for the map */}
      {showMapPolygonDisplayPanel && selectedMapPolygonData && (
        <PolygonDisplayPanel
          polygon={selectedMapPolygonData}
          onClose={handleCloseMapPolygonDisplayPanel}
          isMapContext={true}
          onPreviewOverlayBounds={handlePreviewOverlayBoundsOnMap}
          onSaveOverlayBounds={handleSaveOverlayBoundsToBackend}
        />
      )}
    </div>
  );
}
