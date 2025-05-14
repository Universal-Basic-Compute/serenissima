'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { GoogleMap, LoadScript, DrawingManager } from '@react-google-maps/api';
import { findClosestPointOnPolygonEdge } from '@/lib/utils/fileUtils';

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
  fillColor: '#3388ff',
  fillOpacity: 0.3,
  strokeWeight: 2,
  strokeColor: '#3388ff',
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
  
  // Add these states to the Home component
  const [bridgeMode, setBridgeMode] = useState(false);
  const [bridgeStart, setBridgeStart] = useState<google.maps.LatLng | null>(null);
  const [bridgeStartLandId, setBridgeStartLandId] = useState<string | null>(null);
  const [activeLandPolygons, setActiveLandPolygons] = useState<{[id: string]: google.maps.Polygon}>({});
  const [bridgeStartMarker, setBridgeStartMarker] = useState<google.maps.Marker | null>(null);
  const [centroidMarkers, setCentroidMarkers] = useState<{[id: string]: google.maps.Marker}>({});
  const [isDraggingCentroid, setIsDraggingCentroid] = useState(false);
  const [centroidDragMode, setCentroidDragMode] = useState(false);
  
  
  // State for WaterPoints
  const [waterPointMode, setWaterPointMode] = useState<boolean>(true);
  const [connectWaterPointMode, setConnectWaterPointMode] = useState<boolean>(false);
  const [selectedWaterPoint, setSelectedWaterPoint] = useState<any>(null);
  const [waterPoints, setWaterPoints] = useState<any[]>([]);
  const [waterPointMarkers, setWaterPointMarkers] = useState<{[id: string]: google.maps.Marker}>({});
  const [waterPointConnections, setWaterPointConnections] = useState<google.maps.Polyline[]>([]);
  const [previewWaterPoint, setPreviewWaterPoint] = useState<google.maps.Marker | null>(null);
  const [creationSuccess, setCreationSuccess] = useState<{id: string, position: google.maps.LatLng} | null>(null);
  
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

  // Add this function to handle bridge creation
  const handleBridgeMode = () => {
    setBridgeMode(!bridgeMode);
    
    // Turn off waterpoint mode if it's on
    if (waterPointMode) {
      setWaterPointMode(false);
      setConnectWaterPointMode(false);
      setSelectedWaterPoint(null);
    }
    
    // Reset bridge start if turning off bridge mode
    if (bridgeMode) {
      setBridgeStart(null);
      setBridgeStartLandId(null);
      
      // Remove the start marker if it exists
      if (bridgeStartMarker) {
        bridgeStartMarker.setMap(null);
        setBridgeStartMarker(null);
      }
    }
    
    // Change cursor style based on bridge mode
    if (mapRef.current) {
      mapRef.current.setOptions({
        draggableCursor: !bridgeMode ? 'crosshair' : ''
      });
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
  
  

  // This function is no longer needed as we've moved its logic directly into the map click listener

  // Add this function to save bridge to file
  const saveBridgeToFile = (bridge: any) => {
    // Send bridge data to the API
    fetch('/api/save-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bridge)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Bridge created: ${data.filename}`);
        alert(`Bridge created between lands ${bridge.startLandId} and ${bridge.endLandId}`);
      } else {
        console.error('Failed to save bridge:', data.error);
        alert('Failed to create bridge');
      }
    })
    .catch(error => {
      console.error('Error saving bridge:', error);
      alert('Error creating bridge');
    });
  };
  

  // Handle map mouse move for WaterPoint preview
  const handleMapMouseMove = useCallback((event: google.maps.MapMouseEvent) => {
    if (!waterPointMode || !mapRef.current) return;
    
    const position = event.latLng;
    if (!position) return;
    
    // Mettre à jour ou créer le marqueur d'aperçu
    if (previewWaterPoint) {
      previewWaterPoint.setPosition(position);
    } else {
      const marker = new google.maps.Marker({
        position: position,
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#0088FF',
          fillOpacity: 0.5, // Semi-transparent pour l'aperçu
          strokeWeight: 2,
          strokeColor: '#FFFFFF'
        },
        title: 'Preview WaterPoint',
        clickable: false,
        zIndex: 0 // Placer sous les autres marqueurs
      });
      setPreviewWaterPoint(marker);
    }
  }, [waterPointMode, previewWaterPoint]);

  // Add this function to provide visual feedback for right-clicks
  const showRightClickFeedback = (position: google.maps.LatLng) => {
    if (!mapRef.current) return;
    
    // Create a ripple effect
    const ripple = new google.maps.Circle({
      center: position,
      radius: 5,
      strokeColor: '#FF0000',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#FF0000',
      fillOpacity: 0.35,
      map: mapRef.current,
      zIndex: 1
    });
    
    // Animate the ripple
    let radius = 5;
    const expandInterval = setInterval(() => {
      radius += 2;
      ripple.setRadius(radius);
      ripple.setOptions({
        strokeOpacity: 0.8 * (1 - radius / 30),
        fillOpacity: 0.35 * (1 - radius / 30)
      });
      
      if (radius >= 30) {
        clearInterval(expandInterval);
        ripple.setMap(null);
      }
    }, 20);
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
      
      // Get the DOM event to check for right click
      const domEvent = e.domEvent as MouseEvent;
      const isRightClick = domEvent && domEvent.button === 2;
      
      console.log('Map clicked in mode:', bridgeMode ? 'bridge' : waterPointMode ? 'waterpoint' : 'normal');
      console.log('Click type:', isRightClick ? 'right click' : 'left click');
      
      // For right clicks, create a new waterpoint
      if (isRightClick) {
        if (waterPointMode) {
          console.log('Processing right click in waterpoint mode');
          // Create a new waterpoint at the clicked location
          createWaterPoint(event.latLng);
          
          // The connection will be handled automatically in the createWaterPoint function
        }
        return; // Exit early for right clicks after handling waterpoint creation
      }
      
      // Handle left clicks for other functionality
      if (bridgeMode) {
        // Find which polygon was clicked
        let clickedPolygonId = null;
        let clickedPolygon = null;
        
        for (const [id, polygon] of Object.entries(activeLandPolygons)) {
          if (google.maps.geometry.poly.containsLocation(event.latLng, polygon)) {
            clickedPolygonId = id;
            clickedPolygon = polygon;
            break;
          }
        }
        
        if (!clickedPolygonId || !clickedPolygon) {
          alert('Please click on a land polygon');
          return;
        }
        
        // Get the polygon coordinates
        const polygonCoords = getPolygonCoordinates(clickedPolygon);
        
        // Get the clicked point
        const clickedPoint = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };
        
        // Find the closest point on the polygon edge
        const closestPoint = findClosestPointOnPolygonEdge(clickedPoint, polygonCoords);
        
        if (!closestPoint) {
          console.error('Could not find closest point on polygon edge');
          return;
        }
        
        // Create a LatLng object from the closest point
        const snappedPoint = new google.maps.LatLng(closestPoint.lat, closestPoint.lng);
        
        if (!bridgeStart) {
          // Set bridge start point
          setBridgeStart(snappedPoint);
          setBridgeStartLandId(clickedPolygonId);
          
          // Show a marker at the snapped point
          const startMarker = new google.maps.Marker({
            position: snappedPoint,
            map: mapRef.current,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: '#FF0000',
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: '#FFFFFF'
            }
          });
          
          // Store the marker to remove it later
          setBridgeStartMarker(startMarker);
          
          alert(`Bridge start point set on land ${clickedPolygonId}`);
        } else {
          // Set bridge end point and create bridge
          if (clickedPolygonId === bridgeStartLandId) {
            alert('Bridge must connect two different lands');
            return;
          }
          
          // Create bridge
          const bridge = {
            id: `bridge-${Date.now()}`,
            startPoint: {
              lat: bridgeStart.lat(),
              lng: bridgeStart.lng()
            },
            endPoint: {
              lat: snappedPoint.lat(),
              lng: snappedPoint.lng()
            },
            startLandId: bridgeStartLandId,
            endLandId: clickedPolygonId
          };
          
          // Save bridge to file
          saveBridgeToFile(bridge);
          
          // Draw bridge line on map
          const bridgeLine = new google.maps.Polyline({
            path: [
              { lat: bridge.startPoint.lat, lng: bridge.startPoint.lng },
              { lat: bridge.endPoint.lat, lng: bridge.endPoint.lng }
            ],
            geodesic: true,
            strokeColor: '#FF0000',
            strokeOpacity: 1.0,
            strokeWeight: 3
          });
          
          bridgeLine.setMap(mapRef.current);
          
          // Remove the start marker
          if (bridgeStartMarker) {
            bridgeStartMarker.setMap(null);
            setBridgeStartMarker(null);
          }
          
          // Reset bridge mode
          setBridgeStart(null);
          setBridgeStartLandId(null);
        }
      } else if (waterPointMode) {
        // Left click - create a new WaterPoint
        createWaterPoint(event.latLng);
      } else if (connectWaterPointMode && selectedWaterPoint) {
        // In connect mode, check if we clicked on another waterpoint
        let targetPoint = null;
        for (const point of waterPoints) {
          const pointPos = typeof point.position === 'string' 
            ? JSON.parse(point.position) 
            : point.position;
          
          const clickPos = {
            lat: event.latLng.lat(),
            lng: event.latLng.lng()
          };
          
          // Calculate distance between click and point
          const distance = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(clickPos.lat, clickPos.lng),
            new google.maps.LatLng(pointPos.lat, pointPos.lng)
          );
          
          // If click is close enough to a point (within 10 meters)
          if (distance < 10 && point.id !== selectedWaterPoint.id) {
            targetPoint = point;
            break;
          }
        }
        
        // If we found a target point, create connection
        if (targetPoint) {
          createWaterPointConnection(selectedWaterPoint, targetPoint);
        }
      }
    });
    
    // Add a dedicated right-click handler to ensure we catch all right-clicks
    map.addListener('rightclick', (e: google.maps.MapMouseEvent) => {
      console.log('Right click detected directly');
      
      // Prevent default context menu
      e.stop();
      
      if (!waterPointMode) return;
      
      const event = e as google.maps.MapMouseEvent;
      if (!event.latLng) return;
      
      // Create a new waterpoint at the clicked location
      createWaterPoint(event.latLng);
      
      // The connection will be handled automatically in the createWaterPoint function
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
              strokeColor: '#3388ff',
              strokeOpacity: 0.8,
              strokeWeight: 2,
              fillColor: '#3388ff',
              fillOpacity: 0.35,
              map: mapRef.current
            });
            
            // Store reference to polygon
            newActiveLandPolygons[polygon.id] = mapPolygon;
          }
        });
        
        setActiveLandPolygons(newActiveLandPolygons);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
      });
  }, [isGoogleLoaded]);
  
  // Add useEffect to clean up preview marker when component unmounts
  useEffect(() => {
    return () => {
      if (previewWaterPoint) {
        previewWaterPoint.setMap(null);
      }
    };
  }, [previewWaterPoint]);

  // Add useEffect to prevent context menu on the page
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Only prevent default context menu behavior, but still allow our custom handler to run
      if (waterPointMode) {
        e.preventDefault();
      }
    };
    
    // Add the event listener to the document
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [waterPointMode]);
  
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
                if (connectWaterPointMode && selectedWaterPoint && selectedWaterPoint.id !== point.id) {
                  // Créer une connexion entre les deux WaterPoints
                  createWaterPointConnection(selectedWaterPoint, point);
                } else {
                  // Sélectionner ce WaterPoint
                  setSelectedWaterPoint(point);
                  
                  // Mettre à jour l'apparence du marqueur pour montrer qu'il est sélectionné
                  marker.setIcon({
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#FF0000',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#FFFFFF'
                  });
                  
                  // Réinitialiser les autres marqueurs
                  Object.entries(newMarkers).forEach(([id, m]) => {
                    if (id !== point.id) {
                      m.setIcon({
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 7,
                        fillColor: m.get('type') === 'dock' ? '#FF8800' : '#0088FF',
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: '#FFFFFF'
                      });
                    }
                  });
                }
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
  }, [waterPointMarkers, waterPointConnections, connectWaterPointMode, selectedWaterPoint]);
  
  // Load WaterPoints when the map loads
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      // Charger les WaterPoints au démarrage, pas seulement en mode WaterPoint
      loadWaterPoints();
    }
  }, [mapRef.current, isGoogleLoaded, loadWaterPoints]);
  
  // Add this function to handle adding connection points
  const addConnectionPoint = (position: google.maps.LatLng, waterPoint: any) => {
    if (!mapRef.current || !position || !waterPoint) return;
    
    // Create a marker for the connection point
    const marker = new google.maps.Marker({
      position: position,
      map: mapRef.current,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 5, // Smaller than waterpoints
        fillColor: '#FFA500', // Orange for connection points
        fillOpacity: 0.7,
        strokeWeight: 1,
        strokeColor: '#FFFFFF'
      },
      title: 'Connection Point'
    });
    
    // Get the current connection points for this waterpoint
    const connectionPoints = waterPoint.connectionPoints || [];
    
    // Add the new point
    const newPoint = {
      lat: position.lat(),
      lng: position.lng()
    };
    
    // Update the waterpoint with the new connection point
    const updatedConnectionPoints = [...connectionPoints, newPoint];
    
    // Update the waterpoint in the database
    fetch('/api/waterpoint', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: waterPoint.id,
        connectionPoints: updatedConnectionPoints
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        console.log('Connection point added:', newPoint);
        
        // Update the waterpoint in state
        setWaterPoints(prev => 
          prev.map(wp => 
            wp.id === waterPoint.id 
              ? { ...wp, connectionPoints: updatedConnectionPoints } 
              : wp
          )
        );
        
        // If there are at least 2 connection points, draw a line between them
        if (updatedConnectionPoints.length >= 2) {
          // Create a path from all connection points
          const path = updatedConnectionPoints.map(point => 
            new google.maps.LatLng(point.lat, point.lng)
          );
          
          // Create or update the polyline
          const connectionLine = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#FFA500', // Orange for connection lines
            strokeOpacity: 0.7,
            strokeWeight: 2,
            map: mapRef.current
          });
          
          // Add to connections array
          setWaterPointConnections(prev => [...prev, connectionLine]);
        }
        
        // Show success notification
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        successMessage.innerHTML = `
          <div class="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Connection point added</span>
          </div>
        `;
        document.body.appendChild(successMessage);
        
        // Remove message after 2 seconds
        setTimeout(() => {
          document.body.removeChild(successMessage);
        }, 2000);
      } else {
        console.error('Failed to add connection point:', data.error);
        alert('Failed to add connection point: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      console.error('Error adding connection point:', error);
      alert('Error adding connection point: ' + error.message);
    });
  };

  // Function to create a new WaterPoint
  const createWaterPoint = (position: google.maps.LatLng, type: string = 'regular') => {
    // Validate that we have a valid position
    if (!position) {
      console.error('Invalid position for waterpoint creation');
      return;
    }

    // Check if the point is too close to an existing point
    const MIN_DISTANCE = 10; // Minimum distance in meters
    let isTooClose = false;
    let closestPoint = null;
    let closestDistance = Infinity;
    
    // Check distance to all existing points
    for (const point of waterPoints) {
      const pointPos = typeof point.position === 'string' 
        ? JSON.parse(point.position) 
        : point.position;
      
      const distance = google.maps.geometry.spherical.computeDistanceBetween(
        position,
        new google.maps.LatLng(pointPos.lat, pointPos.lng)
      );
      
      // Update closest point info
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
      }
      
      // Check if too close
      if (distance <= MIN_DISTANCE) {
        isTooClose = true;
        break;
      }
    }
    
    // If too close, show error message
    if (isTooClose) {
      // Remove preview marker if it exists
      if (previewWaterPoint) {
        previewWaterPoint.setMap(null);
        setPreviewWaterPoint(null);
      }
      
      // Show error message
      const errorMessage = document.createElement('div');
      errorMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
      errorMessage.innerHTML = `
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Cannot create WaterPoint: Too close to an existing point (${Math.round(closestDistance)}m)</span>
        </div>
      `;
      document.body.appendChild(errorMessage);
      
      // Remove message after 3 seconds
      setTimeout(() => {
        document.body.removeChild(errorMessage);
      }, 3000);
      
      return;
    }
    
    // Remove preview marker if it exists
    if (previewWaterPoint) {
      previewWaterPoint.setMap(null);
      setPreviewWaterPoint(null);
    }
    
    // Create temporary marker to show loading state
    const tempMarker = new google.maps.Marker({
      position: position,
      map: mapRef.current,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: type === 'dock' ? '#FF8800' : '#0088FF',
        fillOpacity: 0.5, // Semi-transparent to indicate it's being created
        strokeWeight: 2,
        strokeColor: '#FFFFFF'
      },
      title: 'Creating WaterPoint...'
    });
    
    // Prepare waterpoint data
    const waterPoint = {
      position: {
        lat: position.lat(),
        lng: position.lng()
      },
      type,
      connections: []
    };
    
    // Send API request
    fetch('/api/waterpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(waterPoint)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        console.log('WaterPoint created:', data.waterpoint);
        
        // Remove temporary marker
        tempMarker.setMap(null);
        
        // Create permanent marker
        if (mapRef.current) {
          const marker = new google.maps.Marker({
            position: position,
            map: mapRef.current,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: type === 'dock' ? '#FF8800' : '#0088FF',
              fillOpacity: 1, // Full opacity for permanent marker
              strokeWeight: 2,
              strokeColor: '#FFFFFF'
            },
            title: data.waterpoint.id,
            animation: google.maps.Animation.DROP
          });
          
          // Add click listener
          marker.addListener('click', () => {
            if (connectWaterPointMode && selectedWaterPoint && selectedWaterPoint.id !== data.waterpoint.id) {
              // Create connection between points
              createWaterPointConnection(selectedWaterPoint, data.waterpoint);
            } else {
              // Select this point
              setSelectedWaterPoint(data.waterpoint);
              
              // Update marker appearance
              marker.setIcon({
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: '#FF0000',
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: '#FFFFFF'
              });
              
              // Reset other markers
              Object.entries(waterPointMarkers).forEach(([id, m]) => {
                if (id !== data.waterpoint.id) {
                  m.setIcon({
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: m.get('type') === 'dock' ? '#FF8800' : '#0088FF',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#FFFFFF'
                  });
                }
              });
            }
          });
          
          // Store type in marker properties
          marker.set('type', type);
          
          // Add marker to state
          setWaterPointMarkers(prev => ({
            ...prev,
            [data.waterpoint.id]: marker
          }));
          
          // Add waterpoint to state
          setWaterPoints(prev => [...prev, data.waterpoint]);
          
          // Show success notification
          setCreationSuccess({id: data.waterpoint.id, position: position});
          
          // Hide notification after 3 seconds
          setTimeout(() => {
            setCreationSuccess(null);
          }, 3000);
          
          // Automatically connect to the previously created waterpoint
          if (selectedWaterPoint) {
            createWaterPointConnection(selectedWaterPoint, data.waterpoint);
          }
          
          // Set this as the selected waterpoint for the next connection
          setSelectedWaterPoint(data.waterpoint);
        }
      } else {
        // Remove temporary marker on error
        tempMarker.setMap(null);
        console.error('Failed to create WaterPoint:', data.error);
        alert('Failed to create WaterPoint: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      // Remove temporary marker on error
      tempMarker.setMap(null);
      console.error('Error creating WaterPoint:', error);
      alert('Error creating WaterPoint: ' + error.message);
    });
  };
  
  // Function to create a connection between two WaterPoints
  const createWaterPointConnection = (sourcePoint: any, targetPoint: any) => {
    // Validate source and target points
    if (!sourcePoint || !targetPoint) {
      console.error('Invalid source or target point for connection');
      alert('Cannot create connection: Invalid source or target point');
      return;
    }
    
    // Check if connection already exists
    const sourceConnections = typeof sourcePoint.connections === 'string' 
      ? JSON.parse(sourcePoint.connections) 
      : (sourcePoint.connections || []);
    
    const connectionExists = sourceConnections.some((conn: any) => 
      conn.targetId === targetPoint.id
    );
    
    if (connectionExists) {
      alert('Connection already exists between these points');
      return;
    }

    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    loadingIndicator.innerHTML = `
      <div class="bg-white p-4 rounded-lg shadow-lg">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <p>Creating canal connection...</p>
        </div>
      </div>
    `;
    document.body.appendChild(loadingIndicator);
    
    // Create a unique connection ID
    const connectionId = `connection-${Date.now()}-${sourcePoint.id}-${targetPoint.id}`;
    
    // First, create the connection record
    fetch('/api/waterpoint-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: connectionId,
        sourceId: sourcePoint.id,
        targetId: targetPoint.id,
        width: 3,
        depth: 1,
        createdAt: new Date().toISOString()
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(connectionData => {
      console.log('Connection record created:', connectionData);
      
      // Now update the source waterpoint
      return fetch('/api/waterpoint', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sourcePoint.id,
          addConnection: {
            targetId: targetPoint.id,
            connectionId: connectionId,
            width: 3,
            depth: 1
          }
        })
      });
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        console.log('Connection added to source WaterPoint:', data.waterpoint);
        
        // Create the reverse connection in the target WaterPoint
        return fetch('/api/waterpoint', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetPoint.id,
            addConnection: {
              targetId: sourcePoint.id,
              connectionId: connectionId,
              width: 3,
              depth: 1
            }
          })
        });
      } else {
        throw new Error('Failed to add connection to source WaterPoint');
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        console.log('Connection added to target WaterPoint:', data.waterpoint);
        
        // Remove loading indicator
        document.body.removeChild(loadingIndicator);
        
        // Create visual connection line
        if (mapRef.current) {
          const sourcePos = typeof sourcePoint.position === 'string' 
            ? JSON.parse(sourcePoint.position) 
            : sourcePoint.position;
          
          const targetPos = typeof targetPoint.position === 'string' 
            ? JSON.parse(targetPoint.position) 
            : targetPoint.position;
          
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
          
          // Add to connections array
          setWaterPointConnections(prev => [...prev, line]);
        }
        
        // Reload WaterPoints to show the new connection
        loadWaterPoints();
        
        // Reset connection mode
        setConnectWaterPointMode(false);
        setSelectedWaterPoint(null);
        
        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-bounce';
        successMessage.innerHTML = `
          <div class="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Canal connection created successfully!</span>
          </div>
        `;
        document.body.appendChild(successMessage);
        
        // Remove success message after 3 seconds
        setTimeout(() => {
          document.body.removeChild(successMessage);
        }, 3000);
      } else {
        // Remove loading indicator
        document.body.removeChild(loadingIndicator);
        console.error('Failed to add connection to target WaterPoint:', data.error);
        alert('Failed to complete canal connection');
      }
    })
    .catch(error => {
      // Remove loading indicator
      if (document.body.contains(loadingIndicator)) {
        document.body.removeChild(loadingIndicator);
      }
      console.error('Error creating WaterPoint connection:', error);
      alert('Error creating canal connection: ' + error.message);
    });
  };
  
  // Helper function to find the intersection of two line segments
  const findLineIntersection = (x1, y1, x2, y2, x3, y3, x4, y4) => {
    // Calculate the denominator
    const denominator = ((y4 - y3) * (x2 - x1)) - ((x4 - x3) * (y2 - y1));
    
    // Lines are parallel if denominator is zero
    if (denominator === 0) return null;
    
    // Calculate the numerators
    const ua = (((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3))) / denominator;
    const ub = (((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3))) / denominator;
    
    // Check if intersection is within both line segments
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
    
    // Calculate the intersection point
    const x = x1 + (ua * (x2 - x1));
    const y = y1 + (ua * (y2 - y1));
    
    return { lat: y, lng: x };
  };

  // Add this function to create waterPoints algorithmically
  const createWaterPointsAlgorithmically = () => {
    if (!mapRef.current || !isGoogleLoaded || Object.keys(activeLandPolygons).length === 0) {
      alert('Map not ready yet or no polygons loaded. Please try again in a moment.');
      return;
    }
    
    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    loadingIndicator.innerHTML = `
      <div class="bg-white p-4 rounded-lg shadow-lg">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <p>Creating waterPoints algorithmically...</p>
        </div>
      </div>
    `;
    document.body.appendChild(loadingIndicator);
    
    // Process polygons one by one to avoid overwhelming the browser
    const polygonEntries = Object.entries(activeLandPolygons);
    let processedCount = 0;
    let createdCount = 0;
    
    const processNextPolygon = async (index) => {
      if (index >= polygonEntries.length) {
        // All polygons processed, remove loading indicator
        document.body.removeChild(loadingIndicator);
        
        // Show completion message
        alert(`Processing complete! Created ${createdCount} waterPoints from ${processedCount} polygon points.`);
        return;
      }
      
      const [polygonId, polygon] = polygonEntries[index];
      
      // Get polygon path
      const path = polygon.getPath();
      const pathLength = path.getLength();
      
      // Calculate polygon centroid
      let centroidLat = 0;
      let centroidLng = 0;
      
      for (let i = 0; i < pathLength; i++) {
        const point = path.getAt(i);
        centroidLat += point.lat();
        centroidLng += point.lng();
      }
      
      centroidLat /= pathLength;
      centroidLng /= pathLength;
      
      const centroid = new google.maps.LatLng(centroidLat, centroidLng);
      
      // Process each point of the polygon
      for (let i = 0; i < pathLength; i++) {
        processedCount++;
        
        const point = path.getAt(i);
        
        // Create a line from the point through the centroid
        const pointToCenter = {
          lat: centroid.lat() - point.lat(),
          lng: centroid.lng() - point.lng()
        };
        
        // Extend this line to find intersections with other polygons
        const extendedPoint = new google.maps.LatLng(
          point.lat() - pointToCenter.lat * 2,
          point.lng() - pointToCenter.lng * 2
        );
        
        // Create a line between the point and the extended point
        const line = new google.maps.Polyline({
          path: [
            { lat: point.lat(), lng: point.lng() },
            { lat: extendedPoint.lat(), lng: extendedPoint.lng() }
          ],
          map: null // Don't display on map
        });
        
        // Find closest intersection with another polygon
        let closestIntersection = null;
        let closestDistance = Infinity;
        let intersectingPolygonId = null;
        
        for (const [otherPolygonId, otherPolygon] of Object.entries(activeLandPolygons)) {
          if (otherPolygonId === polygonId) continue; // Skip self
          
          const otherPath = otherPolygon.getPath();
          const otherPathLength = otherPath.getLength();
          
          // Check each edge of the other polygon for intersection
          for (let j = 0; j < otherPathLength; j++) {
            const start = otherPath.getAt(j);
            const end = otherPath.getAt((j + 1) % otherPathLength);
            
            // Check if the line intersects this edge
            const intersection = findLineIntersection(
              point.lat(), point.lng(),
              extendedPoint.lat(), extendedPoint.lng(),
              start.lat(), start.lng(),
              end.lat(), end.lng()
            );
            
            if (intersection) {
              // Calculate distance from original point to intersection
              const distance = google.maps.geometry.spherical.computeDistanceBetween(
                point,
                new google.maps.LatLng(intersection.lat, intersection.lng)
              );
              
              if (distance < closestDistance) {
                closestDistance = distance;
                closestIntersection = intersection;
                intersectingPolygonId = otherPolygonId;
              }
            }
          }
        }
        
        // If we found an intersection, create a point halfway between
        if (closestIntersection) {
          const halfwayPoint = new google.maps.LatLng(
            (point.lat() + closestIntersection.lat) / 2,
            (point.lng() + closestIntersection.lng) / 2
          );
          
          // Check if this point is in water (not in any polygon)
          let isInWater = true;
          
          for (const otherPolygon of Object.values(activeLandPolygons)) {
            if (google.maps.geometry.poly.containsLocation(halfwayPoint, otherPolygon)) {
              isInWater = false;
              break;
            }
          }
          
          // If in water, create a waterPoint
          if (isInWater) {
            // Check if too close to existing waterPoints
            let isTooClose = false;
            const MIN_DISTANCE = 10; // meters
            
            for (const point of waterPoints) {
              const pointPos = typeof point.position === 'string' 
                ? JSON.parse(point.position) 
                : point.position;
              
              const distance = google.maps.geometry.spherical.computeDistanceBetween(
                halfwayPoint,
                new google.maps.LatLng(pointPos.lat, pointPos.lng)
              );
              
              if (distance <= MIN_DISTANCE) {
                isTooClose = true;
                break;
              }
            }
            
            if (!isTooClose) {
              // Create waterPoint
              await new Promise<void>(resolve => {
                // Create the waterPoint
                fetch('/api/waterpoint', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    position: {
                      lat: halfwayPoint.lat(),
                      lng: halfwayPoint.lng()
                    },
                    type: 'regular',
                    connections: []
                  })
                })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    createdCount++;
                    console.log(`Created waterPoint at ${halfwayPoint.lat()}, ${halfwayPoint.lng()}`);
                    
                    // Add to waterPoints array
                    setWaterPoints(prev => [...prev, data.waterpoint]);
                    
                    // Create marker
                    if (mapRef.current) {
                      const marker = new google.maps.Marker({
                        position: halfwayPoint,
                        map: mapRef.current,
                        icon: {
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 7,
                          fillColor: '#0088FF',
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: '#FFFFFF'
                        },
                        title: data.waterpoint.id
                      });
                      
                      // Add to markers
                      setWaterPointMarkers(prev => ({
                        ...prev,
                        [data.waterpoint.id]: marker
                      }));
                    }
                  }
                  resolve();
                })
                .catch(error => {
                  console.error('Error creating waterPoint:', error);
                  resolve();
                });
              });
            }
          }
        }
      }
      
      // Process next polygon with a small delay to avoid freezing the browser
      setTimeout(() => processNextPolygon(index + 1), 100);
    };
    
    // Start processing polygons
    processNextPolygon(0);
  };
  
  // Handle WaterPoint mode
  const handleWaterPointMode = () => {
    // Si on désactive le mode, supprimer le marqueur d'aperçu
    if (waterPointMode && previewWaterPoint) {
      previewWaterPoint.setMap(null);
      setPreviewWaterPoint(null);
    }
    
    setWaterPointMode(!waterPointMode);
    
    // Désactiver les autres modes
    if (bridgeMode) {
      setBridgeMode(false);
      setBridgeStart(null);
      setBridgeStartLandId(null);
      
      if (bridgeStartMarker) {
        bridgeStartMarker.setMap(null);
        setBridgeStartMarker(null);
      }
    }
    
    // Changer le style du curseur
    if (mapRef.current) {
      mapRef.current.setOptions({
        draggableCursor: !waterPointMode ? 'crosshair' : ''
      });
    }
    
    // Charger les WaterPoints existants si on active le mode
    if (!waterPointMode) {
      loadWaterPoints();
    }
  };
  
  // Handle connect WaterPoint mode
  const handleConnectWaterPointMode = () => {
    if (!selectedWaterPoint) {
      alert('Please select a WaterPoint first');
      return;
    }
    
    setConnectWaterPointMode(!connectWaterPointMode);
    
    // Changer le style du curseur
    if (mapRef.current) {
      mapRef.current.setOptions({
        draggableCursor: !connectWaterPointMode ? 'crosshair' : ''
      });
    }
    
    // Show instructions tooltip
    if (!connectWaterPointMode) {
      const tooltip = document.createElement('div');
      tooltip.className = 'fixed bottom-20 right-4 bg-blue-500 text-white p-3 rounded-lg shadow-lg z-50';
      tooltip.innerHTML = `
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          <span>Click on another WaterPoint to create a connection</span>
        </div>
      `;
      tooltip.id = 'connection-tooltip';
      document.body.appendChild(tooltip);
      
      // Remove tooltip after 5 seconds
      setTimeout(() => {
        const existingTooltip = document.getElementById('connection-tooltip');
        if (existingTooltip) {
          document.body.removeChild(existingTooltip);
        }
      }, 5000);
    } else {
      // Remove tooltip if canceling
      const existingTooltip = document.getElementById('connection-tooltip');
      if (existingTooltip) {
        document.body.removeChild(existingTooltip);
      }
    }
  };

  // Handle script load
  const handleScriptLoad = () => {
    setIsGoogleLoaded(true);
  };
  
  // Add mousemove listener to map
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      // Add mousemove listener for WaterPoint preview
      google.maps.event.clearListeners(mapRef.current, 'mousemove');
      mapRef.current.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
        handleMapMouseMove(e);
      });
    }
  }, [mapRef.current, isGoogleLoaded, handleMapMouseMove]);
  
  // Set cursor to crosshair on initial load if waterPointMode is active
  useEffect(() => {
    if (mapRef.current && waterPointMode) {
      mapRef.current.setOptions({
        draggableCursor: 'crosshair'
      });
      
      // Charger les WaterPoints existants au démarrage
      loadWaterPoints();
    }
  }, [mapRef.current, waterPointMode, loadWaterPoints]);

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
      
      {/* Bridge and WaterPoint mode buttons */}
      {isGoogleLoaded && (
        <div className="absolute bottom-4 left-4 z-10 flex space-x-2">
          <button
            onClick={handleBridgeMode}
            className={`px-4 py-2 rounded shadow ${
              bridgeMode ? 'bg-red-500 text-white' : 'bg-white'
            }`}
          >
            {bridgeMode ? 'Cancel Bridge' : 'Add Bridge'}
          </button>
          
          <button
            onClick={handleWaterPointMode}
            className={`px-4 py-2 rounded shadow ${
              waterPointMode ? 'bg-green-500 text-white' : 'bg-white'
            }`}
          >
            {waterPointMode ? 'Cancel WaterPoint' : 'Add WaterPoint'}
          </button>
        </div>
      )}
      
      {/* WaterPoint mode buttons */}
      {isGoogleLoaded && selectedWaterPoint && (
        <div className="absolute bottom-20 left-4 z-10 flex space-x-2">
          <button
            onClick={handleConnectWaterPointMode}
            className={`px-4 py-2 rounded shadow ${
              connectWaterPointMode ? 'bg-purple-500 text-white' : 'bg-white'
            }`}
          >
            {connectWaterPointMode ? 'Cancel Connection' : 'Connect WaterPoints'}
          </button>
        </div>
      )}
      
      {/* Algorithmic WaterPoint Creation Button */}
      {isGoogleLoaded && (
        <div className="absolute bottom-52 left-4 z-10">
          <button
            onClick={createWaterPointsAlgorithmically}
            className="px-4 py-2 rounded shadow bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            Create WaterPoints Algorithmically
          </button>
        </div>
      )}
      
      {/* WaterPoint Info Panel */}
      {selectedWaterPoint && (
        <div className="absolute top-20 right-4 z-10 bg-white p-4 rounded shadow w-80">
          <h3 className="text-lg font-bold mb-2">WaterPoint Details</h3>
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">ID:</span> {selectedWaterPoint.id}
            </div>
            <div className="text-sm">
              <span className="font-medium">Type:</span> {selectedWaterPoint.type}
            </div>
            <div className="text-sm">
              <span className="font-medium">Depth:</span> {selectedWaterPoint.depth}m
            </div>
            <div className="text-sm">
              <span className="font-medium">Connections:</span> {
                (typeof selectedWaterPoint.connections === 'string' 
                  ? JSON.parse(selectedWaterPoint.connections) 
                  : (selectedWaterPoint.connections || [])
                ).length
              }
            </div>
            
            {/* Connection list */}
            {(typeof selectedWaterPoint.connections === 'string' 
              ? JSON.parse(selectedWaterPoint.connections) 
              : (selectedWaterPoint.connections || [])
            ).length > 0 && (
              <div className="mt-2 border-t border-gray-200 pt-2">
                <h4 className="text-sm font-medium mb-1">Connected to:</h4>
                <div className="max-h-32 overflow-y-auto">
                  {(typeof selectedWaterPoint.connections === 'string' 
                    ? JSON.parse(selectedWaterPoint.connections) 
                    : (selectedWaterPoint.connections || [])
                  ).map((conn: any, index: number) => (
                    <div key={index} className="text-xs bg-gray-100 p-1 rounded mb-1 flex justify-between items-center">
                      <span>{conn.targetId}</span>
                      <span className="text-gray-500">{conn.width}m × {conn.depth}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex space-x-2 mt-4">
              <button
                onClick={() => {
                  setSelectedWaterPoint(null);
                  setConnectWaterPointMode(false);
                  
                  // Réinitialiser l'apparence des marqueurs
                  Object.values(waterPointMarkers).forEach(marker => {
                    marker.setIcon({
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: 7,
                      fillColor: marker.get('type') === 'dock' ? '#FF8800' : '#0088FF',
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: '#FFFFFF'
                    });
                  });
                  
                  // Remove any connection tooltip
                  const existingTooltip = document.getElementById('connection-tooltip');
                  if (existingTooltip) {
                    document.body.removeChild(existingTooltip);
                  }
                }}
                className="px-3 py-1 bg-gray-200 rounded text-sm"
              >
                Close
              </button>
              
              <button
                onClick={handleConnectWaterPointMode}
                className={`px-3 py-1 rounded text-sm ${
                  connectWaterPointMode ? 'bg-purple-500 text-white' : 'bg-blue-500 text-white'
                }`}
              >
                {connectWaterPointMode ? 'Cancel Connection' : 'Connect to Another Point'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Indicateur de statut pour les WaterPoints */}
      {waterPointMode && (
        <div className="absolute bottom-36 left-4 z-10 bg-white px-4 py-2 rounded shadow">
          <p className="text-sm font-bold text-blue-600">
            WaterPoint Mode Active
          </p>
          <p className="text-sm">
            <span className="font-medium">WaterPoints:</span> {waterPoints.length}
          </p>
          <div className="mt-2 border-t border-gray-200 pt-1">
            <p className="text-xs text-gray-700 mb-1">
              <span className="font-medium text-green-600">LEFT CLICK:</span> Add new WaterPoint and connect to previous
            </p>
            <p className="text-xs text-gray-700 mb-1">
              <span className="font-medium text-red-600">RIGHT CLICK:</span> Add new WaterPoint and connect to previous
            </p>
            <p className="text-xs text-gray-700">
              <span className="font-medium">Note:</span> Points are automatically connected in sequence
            </p>
          </div>
        </div>
      )}
      
      {/* Visual indicator when a waterpoint is selected */}
      {selectedWaterPoint && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-red-500 text-white px-4 py-2 rounded shadow animate-pulse">
          <p className="text-sm font-bold flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            WaterPoint Selected - Right Click on another point to connect
          </p>
        </div>
      )}
      
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
      
      {/* Notification de succès pour la création de WaterPoint */}
      {creationSuccess && (
        <div className="absolute z-20 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-bounce"
             style={{
               top: '50%',
               left: '50%',
               transform: 'translate(-50%, -50%)'
             }}>
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>WaterPoint created successfully!</span>
          </div>
        </div>
      )}
    </div>
  );
}
