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

  // Add this function to handle map clicks for bridge creation
  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!bridgeMode || !event.latLng) return;
    
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
  };

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

  // Handle map load
  const onMapLoad = (map: google.maps.Map) => {
    mapRef.current = map;
    
    // Add click listener for bridge creation
    map.addListener('click', handleMapClick);
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
      
      {/* Bridge mode button */}
      {isGoogleLoaded && (
        <div className="absolute bottom-4 left-4 z-10">
          <button
            onClick={handleBridgeMode}
            className={`px-4 py-2 rounded shadow ${
              bridgeMode ? 'bg-red-500 text-white' : 'bg-white'
            }`}
          >
            {bridgeMode ? 'Cancel Bridge' : 'Add Bridge'}
          </button>
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
