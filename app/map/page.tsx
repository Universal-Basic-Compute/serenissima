'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { GoogleMap, LoadScript, DrawingManager } from '@react-google-maps/api';
import { findClosestPointOnPolygonEdge } from '@/lib/fileUtils';

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
  
  // Canal creation states
  const [canalMode, setCanalMode] = useState(false);
  const [canalPoints, setCanalPoints] = useState<google.maps.LatLng[]>([]);
  const [canalMarkers, setCanalMarkers] = useState<google.maps.Marker[]>([]);
  const [canalLines, setCanalLines] = useState<google.maps.Polyline[]>([]);
  const canalModeRef = useRef(false);
  const [existingCanals, setExistingCanals] = useState<any[]>([]);
  const [snapDistance, setSnapDistance] = useState<number>(0.0001); // Adjust based on your map zoom level
  const [transferConnections, setTransferConnections] = useState<Array<{
    canalId: string;
    handleType: 'start' | 'end';
    position: { lat: number; lng: number };
  }>>([]);
  
  // State for WaterPoints
  const [waterPointMode, setWaterPointMode] = useState<boolean>(false);
  const [connectWaterPointMode, setConnectWaterPointMode] = useState<boolean>(false);
  const [selectedWaterPoint, setSelectedWaterPoint] = useState<any>(null);
  const [waterPoints, setWaterPoints] = useState<any[]>([]);
  const [waterPointMarkers, setWaterPointMarkers] = useState<{[id: string]: google.maps.Marker}>({});
  const [waterPointConnections, setWaterPointConnections] = useState<google.maps.Polyline[]>([]);
  
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
  const storeWalletInAirtable = async (walletAddress: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wallet`, {
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

  const investCompute = async (walletAddress: string, amount: number) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/invest-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          compute_amount: amount,
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
    
    // Turn off canal mode if it's on
    if (canalMode) {
      setCanalMode(false);
      clearCanalData();
    }
    
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
  
  // Handle canal mode button
  const handleCanalMode = () => {
    setCanalMode(prevMode => {
      const newMode = !prevMode;
      console.log('Setting canal mode to:', newMode);
      
      // Show/hide canals list when toggling canal mode
      setShowCanalsList(newMode);
      
      // If turning on canal mode, load the existing canals
      if (newMode) {
        loadExistingCanals();
      }
      
      // Turn off bridge mode if it's on
      if (bridgeMode) {
        setBridgeMode(false);
        setBridgeStart(null);
        setBridgeStartLandId(null);
        
        // Remove the start marker if it exists
        if (bridgeStartMarker) {
          bridgeStartMarker.setMap(null);
          setBridgeStartMarker(null);
        }
      }
      
      // Turn off waterpoint mode if it's on
      if (waterPointMode) {
        setWaterPointMode(false);
        setConnectWaterPointMode(false);
        setSelectedWaterPoint(null);
      }
      
      // Clear canal data if turning off canal mode
      if (prevMode) {
        clearCanalData();
        setShowCanalsList(false); // Also hide the canals list
      }
      
      // Change cursor style based on canal mode
      if (mapRef.current) {
        mapRef.current.setOptions({
          draggableCursor: newMode ? 'crosshair' : ''
        });
      }
      
      // Add this debug message
      console.log('Canal mode is now:', newMode);
      console.log('Map ref exists:', !!mapRef.current);
      
      return newMode;
    });
  };
  
  // Keep the ref in sync with the state
  useEffect(() => {
    canalModeRef.current = canalMode;
  }, [canalMode]);
  
  // Clear canal data
  const clearCanalData = () => {
    // Remove all canal markers
    canalMarkers.forEach(marker => marker.setMap(null));
    setCanalMarkers([]);
    
    // Remove all canal lines
    canalLines.forEach(line => line.setMap(null));
    setCanalLines([]);
    
    // Clear canal points
    setCanalPoints([]);
    
    // Reset transfer connections
    setTransferConnections([]);
  };

  // Add a function to get polygon coordinates from a Google Maps polygon
  const getPolygonCoordinates = (polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    return Array.from({ length: path.getLength() }, (_, i) => {
      const point = path.getAt(i);
      return { lat: point.lat(), lng: point.lng() };
    });
  };
  
  // State for showing canals list
  const [showCanalsList, setShowCanalsList] = useState<boolean>(false);
  
  // Function to add handles to canal endpoints
  const addCanalHandles = (canals: any[]) => {
    // Remove existing handles
    const existingHandles = document.querySelectorAll('.canal-handle');
    existingHandles.forEach(handle => handle.remove());
    
    if (!mapRef.current) return;
    
    // Create handles for each canal endpoint
    canals.forEach(canal => {
      if (!canal.points || canal.points.length < 2) return;
      
      // Get canal points
      const points = typeof canal.points === 'string' 
        ? JSON.parse(canal.points) 
        : canal.points;
      
      // Create a handle for the start point
      const startPoint = points[0];
      const startLatLng = new google.maps.LatLng(startPoint.lat, startPoint.lng);
      createCanalHandle(startLatLng, canal.id, 'start');
      
      // Create a handle for the end point
      const endPoint = points[points.length - 1];
      const endLatLng = new google.maps.LatLng(endPoint.lat, endPoint.lng);
      createCanalHandle(endLatLng, canal.id, 'end');
    });
  };

  // Function to create a visual handle for a canal point
  const createCanalHandle = (position: google.maps.LatLng, canalId: string, type: 'start' | 'end') => {
    if (!mapRef.current) return;
    
    // Create a DOM element for the handle
    const handleDiv = document.createElement('div');
    handleDiv.className = 'canal-handle';
    handleDiv.style.position = 'absolute';
    handleDiv.style.width = '16px';
    handleDiv.style.height = '16px';
    handleDiv.style.borderRadius = '50%';
    handleDiv.style.backgroundColor = type === 'start' ? '#00FF00' : '#FF8800';
    handleDiv.style.border = '2px solid white';
    handleDiv.style.cursor = 'pointer';
    handleDiv.style.zIndex = '1000';
    
    // Store handle data
    handleDiv.dataset.canalId = canalId;
    handleDiv.dataset.handleType = type;
    
    // Add the handle to the map
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = function() {
      const panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(handleDiv);
    };
    
    overlay.draw = function() {
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(position);
      
      if (point) {
        handleDiv.style.left = (point.x - 8) + 'px';
        handleDiv.style.top = (point.y - 8) + 'px';
      }
    };
    
    overlay.onRemove = function() {
      handleDiv.parentNode?.removeChild(handleDiv);
    };
    
    overlay.setMap(mapRef.current);
    
    // Add events for snapping
    handleDiv.addEventListener('mousedown', (e) => {
      if (canalMode) {
        e.stopPropagation();
        
        // Add this point to the canal being created
        const latLng = position;
        
        // Create a marker at this point
        const marker = new google.maps.Marker({
          position: latLng,
          map: mapRef.current,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: '#FF8800', // Orange for snapped points
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
          }
        });
        
        // Add the marker to our array
        setCanalMarkers(prev => [...prev, marker]);
        
        // Add the point to our array with transfer information
        setCanalPoints(prev => {
          const newPoints = [...prev, latLng];
          
          // If we have at least 2 points, draw or update the line
          if (newPoints.length >= 2) {
            // Remove existing lines
            canalLines.forEach(line => line.setMap(null));
            
            // Create a new line with all points
            const line = new google.maps.Polyline({
              path: newPoints,
              geodesic: true,
              strokeColor: '#0088FF',
              strokeOpacity: 1.0,
              strokeWeight: 3,
              map: mapRef.current
            });
            
            // Update the lines array
            setCanalLines([line]);
          }
          
          return newPoints;
        });
        
        // Store transfer information
        const transferInfo = {
          canalId: canalId,
          handleType: type,
          position: { lat: latLng.lat(), lng: latLng.lng() }
        };
        
        // Add this information to state for use when saving
        setTransferConnections(prev => [...prev, transferInfo]);
      }
    });
  };

  // Add this function to load existing canals
  const loadExistingCanals = useCallback(() => {
    fetch('/api/canal')
      .then(response => response.json())
      .then(data => {
        // Check both data.canals and direct data array format
        const canals = Array.isArray(data) ? data : (data.canals || []);
        
        console.log('Canal data received:', data);
        console.log(`Loaded ${canals.length} existing canals`);
        
        setExistingCanals(canals);
        
        // Visualize existing canals on the map
        if (mapRef.current) {
          // Clear any existing canal visualizations first
          canalLines.forEach(line => line.setMap(null));
          
          canals.forEach((canal: any) => {
            if (canal.points && canal.points.length >= 2) {
              // Convert points to LatLng if they're stored as strings
              const path = typeof canal.points === 'string' 
                ? JSON.parse(canal.points).map((p: any) => new google.maps.LatLng(p.lat, p.lng))
                : canal.points.map((p: any) => new google.maps.LatLng(p.lat, p.lng));
              
              // Draw the canal on the map
              const canalLine = new google.maps.Polyline({
                path,
                geodesic: true,
                strokeColor: '#0088FF',
                strokeOpacity: 0.7,
                strokeWeight: 3,
                map: mapRef.current
              });
              
              // Store the canal ID as a property of the line for reference
              canalLine.set('canalId', canal.id);
              
              // Add to canalLines state to track for cleanup
              setCanalLines(prev => [...prev, canalLine]);
            }
          });
          
          // Add handles to canal endpoints
          addCanalHandles(canals);
        }
      })
      .catch(error => {
        console.error('Error loading canals:', error);
      });
  }, [canalLines]);
  
  // Add this function to find the nearest snap point
  const findNearestSnapPoint = (point: google.maps.LatLng): google.maps.LatLng | null => {
    if (!existingCanals || existingCanals.length === 0) return null;
    
    let closestPoint: google.maps.LatLng | null = null;
    let minDistance = Number.MAX_VALUE;
    
    // Check each canal
    existingCanals.forEach(canal => {
      if (!canal.points || canal.points.length < 2) return;
      
      // Parse points if they're stored as a string
      const canalPoints = typeof canal.points === 'string' 
        ? JSON.parse(canal.points) 
        : canal.points;
      
      // Check start and end points of the canal
      const startPoint = canalPoints[0];
      const endPoint = canalPoints[canalPoints.length - 1];
      
      // Calculate distance to start point
      const startLatLng = new google.maps.LatLng(startPoint.lat, startPoint.lng);
      const startDistance = google.maps.geometry.spherical.computeDistanceBetween(point, startLatLng);
      
      // Calculate distance to end point
      const endLatLng = new google.maps.LatLng(endPoint.lat, endPoint.lng);
      const endDistance = google.maps.geometry.spherical.computeDistanceBetween(point, endLatLng);
      
      // Check if start point is closer than current closest
      if (startDistance < minDistance && startDistance < snapDistance * 1000) { // Convert to meters
        minDistance = startDistance;
        closestPoint = startLatLng;
      }
      
      // Check if end point is closer than current closest
      if (endDistance < minDistance && endDistance < snapDistance * 1000) { // Convert to meters
        minDistance = endDistance;
        closestPoint = endLatLng;
      }
    });
    
    return closestPoint;
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
  
  // Add this function to save canal to file
  const saveCanalToFile = (canal: any) => {
    // Send canal data to the API
    fetch('/api/save-canal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(canal)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Canal created: ${data.filename}`);
        const transferPointsCount = canal.transferPoints ? canal.transferPoints.length : 0;
        alert(`Canal created with ${canal.points.length} points and ${transferPointsCount} transfer points`);
      } else {
        console.error('Failed to save canal:', data.error);
        alert('Failed to create canal');
      }
    })
    .catch(error => {
      console.error('Error saving canal:', error);
      alert('Error creating canal');
    });
  };
  
  // Complete canal creation
  const completeCanal = () => {
    if (canalPoints.length < 2) {
      alert('Canal must have at least 2 points');
      return;
    }
    
    // Create canal object
    const canalId = `canal-${Date.now()}`;
    const canal = {
      id: canalId,
      points: canalPoints.map(point => ({
        lat: point.lat(),
        lng: point.lng()
      })),
      width: 3, // Default width in meters
      depth: 1  // Default depth in meters
    };
    
    // Prepare transfer points
    const transferPoints = transferConnections.map(connection => ({
      position: {
        x: connection.position.lat,
        y: 0.1, // Slightly above water level
        z: connection.position.lng
      },
      connectedRoadIds: [canalId, connection.canalId]
    }));
    
    // Save canal with transfer points
    saveCanalToFile({
      ...canal,
      transferPoints
    });
    
    // Reset canal mode
    clearCanalData();
    setCanalMode(false);
    
    // Reset cursor
    if (mapRef.current) {
      mapRef.current.setOptions({
        draggableCursor: ''
      });
    }
    
    // Reload canals to show updates
    loadExistingCanals();
  };

  // Handle map load
  const onMapLoad = (map: google.maps.Map) => {
    console.log('Map loaded');
    mapRef.current = map;
    
    // Remove any existing click listeners to avoid duplicates
    google.maps.event.clearListeners(map, 'click');
    
    // Add click listener for bridge and canal creation
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      // Use the ref instead of the state
      const currentCanalMode = canalModeRef.current;
      console.log('Map click event triggered, canal mode:', currentCanalMode);
      
      // Pass the event to handleMapClick with current state values
      const event = e as google.maps.MapMouseEvent;
      if (!event.latLng) return;
      
      console.log('Map clicked in mode:', bridgeMode ? 'bridge' : currentCanalMode ? 'canal' : waterPointMode ? 'waterpoint' : 'normal');
      
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
        // Create a new WaterPoint at the clicked location
        createWaterPoint(event.latLng);
      } else if (currentCanalMode) {
        console.log('Processing click in canal mode');
        
        // Get the clicked point
        let pointToUse = event.latLng;
        
        // Check if we should snap to an existing canal point
        const snapPoint = findNearestSnapPoint(event.latLng);
        if (snapPoint) {
          console.log('Snapping to existing canal point');
          pointToUse = snapPoint;
        }
        
        // Create a marker at the point (use the snapped point if available)
        const marker = new google.maps.Marker({
          position: pointToUse,
          map: mapRef.current,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: snapPoint ? '#FF8800' : '#0088FF', // Use orange for snapped points
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
          }
        });
        
        // Add the marker to our array
        setCanalMarkers(prev => [...prev, marker]);
        
        // Add the point to our array
        setCanalPoints(prev => {
          const newPoints = [...prev, pointToUse];
          
          // If we have at least 2 points, draw or update the line
          if (newPoints.length >= 2) {
            // Remove any existing lines
            canalLines.forEach(line => line.setMap(null));
            
            // Create a new line with all points
            const line = new google.maps.Polyline({
              path: newPoints,
              geodesic: true,
              strokeColor: '#0088FF',
              strokeOpacity: 1.0,
              strokeWeight: 3,
              map: mapRef.current
            });
            
            // Update the lines array
            setCanalLines([line]);
          }
          
          return newPoints;
        });
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

  // Add useEffect to load polygons when map is ready
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      loadPolygonsOnMap();
    }
  }, [mapRef.current, isGoogleLoaded, loadPolygonsOnMap, centroidDragMode]);
  
  // Load existing canals when the map loads
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      loadExistingCanals();
    }
  }, [mapRef.current, isGoogleLoaded, loadExistingCanals]);
  
  // Function to load WaterPoints
  const loadWaterPoints = useCallback(() => {
    fetch('/api/waterpoint')
      .then(response => response.json())
      .then(data => {
        // Vérifier le format des données
        const points = Array.isArray(data) ? data : (data.waterpoints || []);
        
        console.log('WaterPoints data received:', data);
        console.log(`Loaded ${points.length} existing waterpoints`);
        
        setWaterPoints(points);
        
        // Visualiser les WaterPoints sur la carte
        if (mapRef.current) {
          // Supprimer les marqueurs existants
          Object.values(waterPointMarkers).forEach(marker => marker.setMap(null));
          const newMarkers: {[id: string]: google.maps.Marker} = {};
          
          // Supprimer les lignes de connexion existantes
          waterPointConnections.forEach(line => line.setMap(null));
          const newConnections: google.maps.Polyline[] = [];
          
          // Créer des marqueurs pour chaque WaterPoint
          points.forEach((point: any) => {
            // Convertir la position si elle est stockée sous forme de chaîne
            const position = typeof point.position === 'string' 
              ? JSON.parse(point.position) 
              : point.position;
            
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
              }
            });
            
            newMarkers[point.id] = marker;
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
          
          setWaterPointMarkers(newMarkers);
          setWaterPointConnections(newConnections);
        }
      })
      .catch(error => {
        console.error('Error loading waterpoints:', error);
      });
  }, [waterPointMarkers, waterPointConnections]);
  
  // Load WaterPoints when the map loads
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded && waterPointMode) {
      loadWaterPoints();
    }
  }, [mapRef.current, isGoogleLoaded, loadWaterPoints, waterPointMode]);
  
  // Function to create a new WaterPoint
  const createWaterPoint = (position: google.maps.LatLng, type: string = 'regular') => {
    const waterPoint = {
      position: {
        lat: position.lat(),
        lng: position.lng()
      },
      type,
      connections: []
    };
    
    fetch('/api/waterpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(waterPoint)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('WaterPoint created:', data.waterpoint);
        
        // Recharger les WaterPoints pour afficher le nouveau
        loadWaterPoints();
      } else {
        console.error('Failed to create WaterPoint:', data.error);
        alert('Failed to create WaterPoint');
      }
    })
    .catch(error => {
      console.error('Error creating WaterPoint:', error);
      alert('Error creating WaterPoint');
    });
  };
  
  // Function to create a connection between two WaterPoints
  const createWaterPointConnection = (sourcePoint: any, targetPoint: any) => {
    // Créer la connexion dans le WaterPoint source
    const connection = {
      targetId: targetPoint.id,
      width: 3, // Largeur par défaut en mètres
      depth: 1  // Profondeur par défaut en mètres
    };
    
    fetch('/api/waterpoint', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sourcePoint.id,
        addConnection: connection
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('Connection added to source WaterPoint:', data.waterpoint);
        
        // Créer la connexion inverse dans le WaterPoint cible
        const reverseConnection = {
          targetId: sourcePoint.id,
          width: 3,
          depth: 1
        };
        
        return fetch('/api/waterpoint', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetPoint.id,
            addConnection: reverseConnection
          })
        });
      } else {
        throw new Error('Failed to add connection to source WaterPoint');
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('Connection added to target WaterPoint:', data.waterpoint);
        
        // Recharger les WaterPoints pour afficher la nouvelle connexion
        loadWaterPoints();
        
        // Réinitialiser le mode de connexion
        setConnectWaterPointMode(false);
        setSelectedWaterPoint(null);
        
        alert('Canal connection created successfully');
      } else {
        console.error('Failed to add connection to target WaterPoint:', data.error);
        alert('Failed to complete canal connection');
      }
    })
    .catch(error => {
      console.error('Error creating WaterPoint connection:', error);
      alert('Error creating canal connection');
    });
  };
  
  // Handle WaterPoint mode
  const handleWaterPointMode = () => {
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
    
    if (canalMode) {
      setCanalMode(false);
      clearCanalData();
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
  };

  // Handle script load
  const handleScriptLoad = () => {
    setIsGoogleLoaded(true);
  };

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
                    // Ask for compute amount using a prompt
                    const amountStr = prompt('Enter compute amount to invest:', '1');
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
      
      {/* Bridge and Canal mode buttons */}
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
            onClick={handleCanalMode}
            className={`px-4 py-2 rounded shadow ${
              canalMode ? 'bg-blue-500 text-white' : 'bg-white'
            }`}
          >
            {canalMode ? 'Cancel Canal' : 'Add Canal'}
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
      
      {/* Canal point counter and controls */}
      {canalMode && (
        <div className="absolute top-20 left-4 z-10 bg-white px-4 py-2 rounded shadow">
          <p>Canal Points: {canalPoints.length}</p>
          {canalPoints.length > 0 && (
            <button
              onClick={() => {
                // Remove the last point
                if (canalPoints.length > 0) {
                  // Remove the last point
                  setCanalPoints(prev => prev.slice(0, -1));
                  
                  // Remove the last marker
                  if (canalMarkers.length > 0) {
                    const lastMarker = canalMarkers[canalMarkers.length - 1];
                    lastMarker.setMap(null);
                    setCanalMarkers(prev => prev.slice(0, -1));
                  }
                  
                  // Update the line
                  if (canalLines.length > 0) {
                    const lastLine = canalLines[canalLines.length - 1];
                    lastLine.setMap(null);
                    setCanalLines(prev => prev.slice(0, -1));
                    
                    // If we still have points, draw a new line
                    if (canalPoints.length > 1) {
                      const newLine = new google.maps.Polyline({
                        path: canalPoints.slice(0, -1),
                        geodesic: true,
                        strokeColor: '#0088FF',
                        strokeOpacity: 1.0,
                        strokeWeight: 3,
                        map: mapRef.current
                      });
                      
                      setCanalLines(prev => [...prev, newLine]);
                    }
                  }
                }
              }}
              className="mt-2 px-2 py-1 bg-red-500 text-white text-sm rounded"
            >
              Remove Last Point
            </button>
          )}
        </div>
      )}
      
      {/* Existing Canals List */}
      {showCanalsList && (
        <div className="absolute top-20 right-4 z-10 bg-white p-4 rounded shadow max-h-[60vh] overflow-auto w-80">
          <h3 className="text-lg font-bold mb-2">Existing Canals</h3>
          {existingCanals.length > 0 ? (
            <div className="space-y-2">
              {existingCanals.map((canal, index) => (
                <div 
                  key={canal.id || index} 
                  className="border border-blue-200 p-2 rounded bg-blue-50 hover:bg-blue-100 cursor-pointer"
                  onClick={() => {
                    // Center the map on the first point of the canal
                    const points = typeof canal.points === 'string' 
                      ? JSON.parse(canal.points) 
                      : canal.points;
                    
                    if (points && points.length > 0 && mapRef.current) {
                      mapRef.current.panTo(new google.maps.LatLng(
                        points[0].lat,
                        points[0].lng
                      ));
                      mapRef.current.setZoom(17); // Zoom in a bit
                    }
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{canal.id}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(canal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span>{typeof canal.points === 'string' 
                      ? JSON.parse(canal.points).length 
                      : canal.points?.length || 0} points</span>
                    {canal.width && <span> • Width: {canal.width}m</span>}
                    {canal.depth && <span> • Depth: {canal.depth}m</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No canals found</p>
          )}
          <div className="mt-4 text-xs text-gray-500">
            Click on a canal to center the map on it. Click on the map to add new canal points.
          </div>
        </div>
      )}
      
      {/* Complete Canal button */}
      {canalMode && canalPoints.length >= 2 && (
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={completeCanal}
            className="px-4 py-2 bg-green-500 text-white rounded shadow hover:bg-green-600 transition-colors"
          >
            Complete Canal ({canalPoints.length} points)
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
                      fillColor: '#0088FF',
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: '#FFFFFF'
                    });
                  });
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
    </div>
  );
}
