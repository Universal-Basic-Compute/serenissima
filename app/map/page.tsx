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
  fillOpacity: 0.6,
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
  const [activeLandPolygons, setActiveLandPolygons] = useState<{[id: string]: google.maps.Polygon}>({});
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
    });
    
    // Add this debug message
    console.log('Map click handler attached');
  };

  // Handle drawing manager load
  const onDrawingManagerLoad = (drawingManager: google.maps.drawing.DrawingManager) => {
    drawingManagerRef.current = drawingManager;
    setIsGoogleLoaded(true);
  };
  
  // Add a function to load polygons onto the map
  const loadPolygonsOnMap = useCallback(() => {
    if (!mapRef.current || !isGoogleLoaded) return;
    
    // Clear existing polygons
    Object.values(activeLandPolygons).forEach(polygon => {
      polygon.setMap(null);
    });
    
    // Reset active polygons
    const newActiveLandPolygons: Record<string, google.maps.Polygon> = {};
    
    // Fetch polygons from API
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        data.polygons.forEach((polygon: any, index: number) => {
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
              fillOpacity: 0.6,       // Adjusted opacity for lighter color
              map: mapRef.current
            });
            
            // Store reference to polygon
            newActiveLandPolygons[polygon.id] = mapPolygon;

            // Add click listener to this mapPolygon
            mapPolygon.addListener('click', () => {
              setSelectedMapPolygonData({
                id: polygon.id,
                coordinates: polygon.coordinates, // Ensure this is in {lat, lng} format
                historicalName: polygon.historicalName // Pass historicalName if available
              });
              setShowMapPolygonDisplayPanel(true);
            });
          }
        });
        
        setActiveLandPolygons(newActiveLandPolygons);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
      });
  }, [isGoogleLoaded]);
  
  // Add useEffect to load polygons when map is ready
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      loadPolygonsOnMap();
    }
  }, [mapRef.current, isGoogleLoaded, loadPolygonsOnMap, centroidDragMode]);
  
  
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
        />
      )}
    </div>
  );
}
