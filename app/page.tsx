'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import dynamic from 'next/dynamic';
import { GoogleMap, LoadScript, DrawingManager } from '@react-google-maps/api';
import ComputeInvestModal from '../components/UI/ComputeInvestModal';
import { transferComputeTokens } from '../lib/tokenUtils';
import { investComputeInAirtable } from '../lib/airtableUtils';

// Import PolygonViewer with no SSR to avoid hydration issues
const PolygonViewer = dynamic(() => import('../components/PolygonViewer/PolygonViewer'), {
  ssr: false
});

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
const libraries = ['drawing', 'geometry'];

export default function Home() {
  // State for wallet connection
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletAdapter, setWalletAdapter] = useState<PhantomWalletAdapter | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [computeModalOpen, setComputeModalOpen] = useState(false);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [familyCoatOfArms, setFamilyCoatOfArms] = useState<string>('');
  const [familyMotto, setFamilyMotto] = useState<string>('');
  const [coatOfArmsImage, setCoatOfArmsImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  
  // Get API key from environment variable
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const [savedPolygons, setSavedPolygons] = useState([]);
  const mapRef = useRef(null);
  const drawingManagerRef = useRef(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  
  // Add these states to the Home component
  const [bridgeMode, setBridgeMode] = useState(false);
  const [bridgeStart, setBridgeStart] = useState<google.maps.LatLng | null>(null);
  const [bridgeStartLandId, setBridgeStartLandId] = useState<string | null>(null);
  const [activeLandPolygons, setActiveLandPolygons] = useState<{[id: string]: google.maps.Polygon}>({});
  
  // Add these new state variables for delete mode
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedMapPolygon, setSelectedMapPolygon] = useState<google.maps.Polygon | null>(null);
  const [selectedMapPolygonId, setSelectedMapPolygonId] = useState<string | null>(null);
  // Add state to track selected polygon in normal mode
  const [selectedPolygon, setSelectedPolygon] = useState<{
    id: string;
    polygon: google.maps.Polygon;
  } | null>(null);
  
  // Initialize wallet adapter
  useEffect(() => {
    const adapter = new PhantomWalletAdapter();
    setWalletAdapter(adapter);
    
    // Check if wallet is already connected in session or local storage
    const storedWallet = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    if (storedWallet) {
      setWalletAddress(storedWallet);
    } else if (adapter.connected) {
      // If adapter is connected but not in storage, update both
      const address = adapter.publicKey?.toString() || null;
      if (address) {
        setWalletAddress(address);
        sessionStorage.setItem('walletAddress', address);
        localStorage.setItem('walletAddress', address);
      }
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
      const response = await fetch('http://localhost:8000/api/wallet', {
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
      
      // Check if the user has a username
      if (!data.user_name) {
        // If no username, show the prompt
        setShowUsernamePrompt(true);
      }
      
      return data;
    } catch (error) {
      console.error('Error storing wallet:', error);
      return null;
    }
  };
  

  // Add this function to generate the coat of arms image
  const generateCoatOfArmsImage = async () => {
    if (!familyCoatOfArms.trim()) {
      alert('Please enter a description of your family coat of arms first');
      return;
    }
    
    try {
      setIsGeneratingImage(true);
      
      const response = await fetch('http://localhost:8000/api/generate-coat-of-arms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: familyCoatOfArms
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate coat of arms image');
      }
      
      const data = await response.json();
      
      if (data.success && data.image_url) {
        setCoatOfArmsImage(data.image_url);
      } else {
        throw new Error(data.error || 'Failed to generate image');
      }
    } catch (error) {
      console.error('Error generating coat of arms image:', error);
      alert(`Failed to generate image: ${error.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleUsernameSubmit = async () => {
    // Combine names to create the username
    const fullUsername = `${firstName} ${lastName}`;
    
    if (!firstName.trim() || !lastName.trim() || !walletAddress) {
      alert('Please enter both first and last name');
      return;
    }
    
    try {
      // Update the user record with the username, coat of arms, family motto, and image URL
      const response = await fetch('http://localhost:8000/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          user_name: fullUsername.trim(),
          family_coat_of_arms: familyCoatOfArms.trim(),
          family_motto: familyMotto.trim(),
          coat_of_arms_image: coatOfArmsImage
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update profile');
      }
      
      const data = await response.json();
      console.log('Profile updated:', data);
      
      // Close the prompt
      setShowUsernamePrompt(false);
      setFirstName('');
      setLastName('');
      setFamilyCoatOfArms('');
      setFamilyMotto('');
      setCoatOfArmsImage(null);
      
      // Show success message
      alert(`Welcome to La Serenissima, ${fullUsername}!`);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  // Handle compute investment
  const handleInvestCompute = async (amount: number) => {
    if (!walletAdapter || !walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    
    try {
      // First, transfer the tokens on Solana
      const signature = await transferComputeTokens(walletAdapter, amount);
      console.log('Token transfer successful:', signature);
      
      // Then, update the compute amount in Airtable
      const airtableResponse = await investComputeInAirtable(walletAddress, amount);
      console.log('Airtable update successful:', airtableResponse);
      
      alert(`Successfully invested ${amount.toLocaleString()} compute tokens!`);
    } catch (error) {
      console.error('Error investing compute:', error);
      alert(`Failed to invest compute: ${error.message}`);
      throw error;
    }
  };

  // Handle wallet connection
  const connectWallet = useCallback(async () => {
    if (!walletAdapter) return;
    
    if (walletAdapter.connected) {
      // If already connected, disconnect
      await walletAdapter.disconnect();
      setWalletAddress(null);
      // Clear wallet from both storages
      sessionStorage.removeItem('walletAddress');
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
      
      // Store wallet in both session and local storage
      if (address) {
        sessionStorage.setItem('walletAddress', address);
        localStorage.setItem('walletAddress', address);
        // Store wallet in Airtable and check for username
        const userData = await storeWalletInAirtable(address);
        
        // If the user doesn't have a username, the prompt will be shown by storeWalletInAirtable
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
    }
  }, [walletAdapter]);

  if (!apiKey && walletAddress) {
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
  const onPolygonComplete = (polygon) => {
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
    // Turn off delete mode if it's on
    if (deleteMode) {
      setDeleteMode(false);
      setSelectedMapPolygon(null);
      setSelectedMapPolygonId(null);
    }
    
    // Reset selected polygon when entering bridge mode
    if (selectedPolygon) {
      selectedPolygon.polygon.setOptions({
        strokeColor: '#3388ff',
        strokeOpacity: 0.8,
        fillColor: '#3388ff',
        fillOpacity: 0.35
      });
      setSelectedPolygon(null);
    }
    
    setBridgeMode(!bridgeMode);
    
    // Reset bridge start if turning off bridge mode
    if (bridgeMode) {
      setBridgeStart(null);
      setBridgeStartLandId(null);
    }
    
    // Change cursor style based on bridge mode
    if (mapRef.current) {
      mapRef.current.setOptions({
        draggableCursor: !bridgeMode ? 'crosshair' : ''
      });
    }
  };

  // Add this function to handle map clicks for bridge creation and polygon selection
  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    
    if (deleteMode) {
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
        // If we didn't click on a polygon, deselect the current one
        if (selectedMapPolygon) {
          selectedMapPolygon.setOptions({
            strokeColor: '#3388ff',
            strokeOpacity: 0.8,
            fillColor: '#3388ff',
            fillOpacity: 0.35
          });
        }
        setSelectedMapPolygon(null);
        setSelectedMapPolygonId(null);
        return;
      }
      
      // If we already had a selected polygon, reset its style
      if (selectedMapPolygon && selectedMapPolygon !== clickedPolygon) {
        selectedMapPolygon.setOptions({
          strokeColor: '#3388ff',
          strokeOpacity: 0.8,
          fillColor: '#3388ff',
          fillOpacity: 0.35
        });
      }
      
      // Select the clicked polygon
      setSelectedMapPolygon(clickedPolygon);
      setSelectedMapPolygonId(clickedPolygonId);
      
      // Highlight the selected polygon
      clickedPolygon.setOptions({
        strokeColor: '#ff0000',
        strokeOpacity: 1.0,
        fillColor: '#ff0000',
        fillOpacity: 0.5
      });
      
      return;
    }
    
    if (bridgeMode) {
      // Find which polygon was clicked
      let clickedPolygonId = null;
      
      for (const [id, polygon] of Object.entries(activeLandPolygons)) {
        if (google.maps.geometry.poly.containsLocation(event.latLng, polygon)) {
          clickedPolygonId = id;
          break;
        }
      }
      
      if (!clickedPolygonId) {
        alert('Please click on a land polygon');
        return;
      }
      
      if (!bridgeStart) {
        // Set bridge start point
        setBridgeStart(event.latLng);
        setBridgeStartLandId(clickedPolygonId);
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
            lat: event.latLng.lat(),
            lng: event.latLng.lng()
          },
          startLandId: bridgeStartLandId,
          endLandId: clickedPolygonId
        };
        
        // Save bridge to file
        saveBridgeToFile(bridge);
        
        // Reset bridge mode
        setBridgeStart(null);
        setBridgeStartLandId(null);
        
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
      }
    } else {
      // Normal mode - select polygon on click
      let clickedPolygonId = null;
      let clickedPolygon = null;
      
      for (const [id, polygon] of Object.entries(activeLandPolygons)) {
        if (google.maps.geometry.poly.containsLocation(event.latLng, polygon)) {
          clickedPolygonId = id;
          clickedPolygon = polygon;
          break;
        }
      }
      
      // If we clicked on a polygon, select it
      if (clickedPolygonId && clickedPolygon) {
        // If we already had a selected polygon, reset its style
        if (selectedPolygon && selectedPolygon.polygon !== clickedPolygon) {
          selectedPolygon.polygon.setOptions({
            strokeColor: '#3388ff',
            strokeOpacity: 0.8,
            fillColor: '#3388ff',
            fillOpacity: 0.35
          });
        }
        
        // Select the clicked polygon
        setSelectedPolygon({
          id: clickedPolygonId,
          polygon: clickedPolygon
        });
        
        // Highlight the selected polygon
        clickedPolygon.setOptions({
          strokeColor: '#ff0000',
          strokeOpacity: 1.0,
          fillColor: '#ff0000',
          fillOpacity: 0.5
        });
      } else {
        // If we clicked on empty space, deselect the current polygon
        if (selectedPolygon) {
          selectedPolygon.polygon.setOptions({
            strokeColor: '#3388ff',
            strokeOpacity: 0.8,
            fillColor: '#3388ff',
            fillOpacity: 0.35
          });
          setSelectedPolygon(null);
        }
      }
    }
  };
  
  // Add this function to handle polygon deletion
  const handleDeletePolygon = async () => {
    if (!selectedMapPolygonId || !selectedMapPolygon) {
      alert('Please select a polygon to delete first');
      return;
    }
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete this polygon: ${selectedMapPolygonId}?`)) {
      return;
    }
    
    try {
      const response = await fetch('/api/delete-polygon', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: selectedMapPolygonId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete polygon');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Remove the polygon from the map
        selectedMapPolygon.setMap(null);
        
        // Remove from active polygons
        const newActiveLandPolygons = { ...activeLandPolygons };
        delete newActiveLandPolygons[selectedMapPolygonId];
        setActiveLandPolygons(newActiveLandPolygons);
        
        // Reset selection
        setSelectedMapPolygon(null);
        setSelectedMapPolygonId(null);
        
        alert('Polygon deleted successfully');
      } else {
        alert(`Failed to delete polygon: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting polygon:', error);
      alert('An error occurred while deleting the polygon');
    }
  };

  // Add this function to save bridge to file
  const saveBridgeToFile = (bridge) => {
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
  const onMapLoad = (map) => {
    console.log('Google Map loaded');
    mapRef.current = map;
    
    // Add click listener for bridge creation
    map.addListener('click', handleMapClick);
    
    // Load polygons immediately when map is ready
    if (isGoogleLoaded) {
      console.log('Loading polygons on map load...');
      loadPolygonsOnMap();
    }
  };

  // Handle drawing manager load
  const onDrawingManagerLoad = (drawingManager) => {
    drawingManagerRef.current = drawingManager;
    setIsGoogleLoaded(true);
  };
  
  // Add a function to load polygons onto the map
  const loadPolygonsOnMap = useCallback(() => {
    console.log('loadPolygonsOnMap called');
    
    if (!mapRef.current) {
      console.warn('Map reference not available');
      return;
    }
    
    if (!isGoogleLoaded) {
      console.warn('Google Maps API not loaded');
      return;
    }
    
    console.log('Loading polygons onto map...');
    
    // Clear existing polygons
    Object.values(activeLandPolygons).forEach(polygon => {
      polygon.setMap(null);
    });
    
    // Reset selected polygon
    if (selectedPolygon) {
      setSelectedPolygon(null);
    }
    
    // Reset active polygons
    const newActiveLandPolygons = {};
    
    // Fetch polygons from API
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        console.log(`Fetched ${data.polygons?.length || 0} polygons from API`);
        
        if (!data.polygons || data.polygons.length === 0) {
          console.warn('No polygons returned from API');
          return;
        }
        
        data.polygons.forEach((polygon, index) => {
          if (polygon.coordinates && polygon.coordinates.length > 2) {
            console.log(`Creating polygon ${index} (${polygon.id}) on map`);
            
            const path = polygon.coordinates.map(coord => ({
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
          } else {
            console.warn(`Polygon ${index} (${polygon.id}) has invalid coordinates:`, polygon.coordinates);
          }
        });
        
        console.log(`Added ${Object.keys(newActiveLandPolygons).length} polygons to map`);
        setActiveLandPolygons(newActiveLandPolygons);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
      });
  }, [isGoogleLoaded]);

  // Add useEffect to load polygons when map is ready
  useEffect(() => {
    if (mapRef.current && isGoogleLoaded) {
      console.log('Map and Google Maps API ready, loading polygons...');
      loadPolygonsOnMap();
    }
  }, [mapRef.current, isGoogleLoaded, loadPolygonsOnMap]);

  // Also add this to ensure polygons are loaded when the component mounts
  useEffect(() => {
    // This will run once when the component mounts
    const loadPolygonsWhenReady = () => {
      if (mapRef.current && isGoogleLoaded) {
        console.log('Loading polygons on mount...');
        loadPolygonsOnMap();
      } else {
        // If map or Google Maps API isn't ready yet, check again in a moment
        // Map or Google Maps API not ready yet, waiting...
        const timer = setTimeout(loadPolygonsWhenReady, 500);
        return () => clearTimeout(timer);
      }
    };
    
    loadPolygonsWhenReady();
  }, []);

  // Handle script load
  const handleScriptLoad = () => {
    setIsGoogleLoaded(true);
  };

  // Create drawing manager options with client-side safety
  const [drawingManagerOptions, setDrawingManagerOptions] = useState({
    drawingControl: true,
    drawingControlOptions: {
      position: 1, // TOP_CENTER
      drawingModes: ['polygon']
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
      {/* View Map button */}
      <a 
        href="/map"
        className="absolute top-4 left-4 z-10 bg-white px-4 py-2 rounded shadow hover:bg-blue-100 transition-colors"
      >
        View Map
      </a>
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
                onClick={() => {
                  setComputeModalOpen(true);
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
      
      {/* Username prompt modal - non-dismissable */}
      {showUsernamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-lg w-[500px] max-w-full border-4 border-amber-700">
            <h2 className="text-2xl font-serif font-semibold mb-4 text-amber-800 text-center">Welcome to La Serenissima</h2>
            
            <div className="mb-6 text-gray-700 italic text-center">
              <p>The year is 1525. The Most Serene Republic of Venice stands as a beacon of wealth and power in the Mediterranean.</p>
              <p className="mt-2">As a noble of Venice, you must now register your identity with the Council of Ten.</p>
            </div>
            
            <div className="mb-6">
              <h3 className="text-lg font-medium text-amber-700 mb-2">Your Noble Identity</h3>
              
              <div className="flex flex-col space-y-4">
                <div className="flex items-center">
                  <div className="w-1/3">
                    <label className="block text-gray-700">First Name</label>
                  </div>
                  <div className="w-2/3 flex">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter your first name..."
                      className="w-full px-3 py-2 border border-amber-300 rounded-l focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => {
                        const venetianFirstNames = [
                          "Marco", "Antonio", "Giovanni", "Francesco", "Alvise",
                          "Domenico", "Pietro", "Paolo", "Nicolo", "Giacomo",
                          "Maria", "Caterina", "Isabella", "Lucia", "Elena",
                          "Beatrice", "Chiara", "Francesca", "Vittoria", "Laura"
                        ];
                        const randomName = venetianFirstNames[Math.floor(Math.random() * venetianFirstNames.length)];
                        setFirstName(randomName);
                      }}
                      className="bg-amber-600 text-white p-2 rounded-r hover:bg-amber-700 transition-colors text-xl"
                      title="Roll the dice for a random name"
                      type="button"
                    >
                      🎲
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center mt-4">
                  <div className="w-1/3">
                    <label className="block text-gray-700">Family Name</label>
                  </div>
                  <div className="w-2/3 flex">
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Enter your family name..."
                      className="w-full px-3 py-2 border border-amber-300 rounded-l focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => {
                        const venetianLastNames = [
                          "Contarini", "Morosini", "Dandolo", "Foscari", "Grimani",
                          "Barbarigo", "Mocenigo", "Venier", "Loredan", "Gritti",
                          "Pisani", "Tiepolo", "Bembo", "Priuli", "Trevisan",
                          "Donato", "Giustinian", "Zeno", "Corner", "Gradenigo"
                        ];
                        const randomName = venetianLastNames[Math.floor(Math.random() * venetianLastNames.length)];
                        setLastName(randomName);
                      }}
                      className="bg-amber-600 text-white p-2 rounded-r hover:bg-amber-700 transition-colors text-xl"
                      title="Roll the dice for a random name"
                      type="button"
                    >
                      🎲
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <div className="w-1/3">
                    <label className="block text-gray-700">Family Coat of Arms</label>
                  </div>
                  <div className="w-2/3 flex flex-col">
                    <div className="flex">
                      <textarea
                        value={familyCoatOfArms}
                        onChange={(e) => setFamilyCoatOfArms(e.target.value)}
                        placeholder="Describe your family's coat of arms..."
                        className="w-full px-3 py-2 border border-amber-300 rounded-l focus:outline-none focus:ring-2 focus:ring-amber-500"
                        rows={3}
                      />
                      <button
                        onClick={() => {
                          const coatOfArmsElements = [
                            "A golden lion rampant on a field of azure",
                            "A silver eagle displayed on a field of gules",
                            "Three golden fleurs-de-lis on a field of azure",
                            "A red rose on a field of silver",
                            "A black wolf passant on a field of gold",
                            "A golden sun with sixteen rays on a field of azure",
                            "A silver crescent moon on a field of sable",
                            "A golden ship with white sails on a sea of azure",
                            "A red griffin segreant on a field of silver",
                            "Three silver stars on a field of gules"
                          ];
                          const randomCoatOfArms = coatOfArmsElements[Math.floor(Math.random() * coatOfArmsElements.length)];
                          setFamilyCoatOfArms(randomCoatOfArms);
                        }}
                        className="bg-amber-600 text-white p-2 rounded-r hover:bg-amber-700 transition-colors text-xl self-stretch"
                        title="Roll the dice for a random coat of arms"
                        type="button"
                      >
                        🎲
                      </button>
                    </div>
                    
                    <div className="mt-2 flex justify-between">
                      <button
                        onClick={generateCoatOfArmsImage}
                        disabled={!familyCoatOfArms.trim() || isGeneratingImage}
                        className={`px-3 py-1 rounded text-white text-sm ${
                          !familyCoatOfArms.trim() || isGeneratingImage 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : 'bg-amber-600 hover:bg-amber-700'
                        }`}
                      >
                        {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                      </button>
                    </div>
                    
                    {/* Display the generated coat of arms image */}
                    {coatOfArmsImage && (
                      <div className="mt-3 border border-amber-300 rounded p-2">
                        <img 
                          src={coatOfArmsImage} 
                          alt="Family Coat of Arms" 
                          className="w-full h-auto max-h-48 object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center mt-4">
                  <div className="w-1/3">
                    <label className="block text-gray-700">Family Motto</label>
                  </div>
                  <div className="w-2/3">
                    <textarea
                      value={familyMotto}
                      onChange={(e) => setFamilyMotto(e.target.value)}
                      placeholder="Enter your family motto..."
                      className="w-full px-3 py-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center">
              <button
                onClick={handleUsernameSubmit}
                className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                disabled={!firstName.trim() || !lastName.trim()}
              >
                Register with the Council
              </button>
              
              <p className="mt-4 text-xs text-gray-600 italic">
                By decree of the Doge, all citizens must register their identity to conduct business in the Republic.
              </p>
            </div>
          </div>
        </div>
      )}
      
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
      
      {/* Delete mode button */}
      {isGoogleLoaded && (
        <div className="absolute bottom-4 left-36 z-10">
          <button
            onClick={() => {
              // Turn off bridge mode if it's on
              if (bridgeMode) {
                setBridgeMode(false);
                setBridgeStart(null);
                setBridgeStartLandId(null);
              }
              
              // Reset selected polygon when entering delete mode
              if (selectedPolygon) {
                selectedPolygon.polygon.setOptions({
                  strokeColor: '#3388ff',
                  strokeOpacity: 0.8,
                  fillColor: '#3388ff',
                  fillOpacity: 0.35
                });
                setSelectedPolygon(null);
              }
              
              // Toggle delete mode
              setDeleteMode(!deleteMode);
              
              // Reset selection when turning off delete mode
              if (deleteMode) {
                if (selectedMapPolygon) {
                  // Reset the polygon style
                  selectedMapPolygon.setOptions({
                    strokeColor: '#3388ff',
                    strokeOpacity: 0.8,
                    fillColor: '#3388ff',
                    fillOpacity: 0.35
                  });
                }
                setSelectedMapPolygon(null);
                setSelectedMapPolygonId(null);
              }
              
              // Change cursor style based on delete mode
              if (mapRef.current) {
                mapRef.current.setOptions({
                  draggableCursor: !deleteMode ? 'crosshair' : ''
                });
              }
            }}
            className={`px-4 py-2 rounded shadow ${
              deleteMode ? 'bg-red-500 text-white' : 'bg-white'
            }`}
          >
            {deleteMode ? 'Cancel Delete' : 'Delete Polygon'}
          </button>
        </div>
      )}
      
      {/* Delete confirmation button - only show when a polygon is selected in delete mode */}
      {deleteMode && selectedMapPolygonId && (
        <div className="absolute bottom-16 left-36 z-10 bg-white p-2 rounded shadow">
          <p className="mb-2">Selected: {selectedMapPolygonId}</p>
          <button
            onClick={handleDeletePolygon}
            className="px-4 py-2 bg-red-500 text-white rounded shadow hover:bg-red-600"
          >
            Confirm Delete
          </button>
        </div>
      )}
      
      {/* Delete button - only show when a polygon is selected in normal mode */}
      {selectedPolygon && !deleteMode && !bridgeMode && (
        <div className="absolute top-16 right-4 z-10 bg-white p-3 rounded shadow">
          <div className="flex flex-col items-start">
            <p className="mb-2 font-medium">Selected: {selectedPolygon.id}</p>
            <button
              onClick={async () => {
                if (!selectedPolygon) return;
                
                // Confirm deletion
                if (!confirm(`Are you sure you want to delete this polygon: ${selectedPolygon.id}?`)) {
                  return;
                }
                
                try {
                  const response = await fetch('/api/delete-polygon', {
                    method: 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: selectedPolygon.id }),
                  });
                  
                  if (!response.ok) {
                    throw new Error('Failed to delete polygon');
                  }
                  
                  const data = await response.json();
                  
                  if (data.success) {
                    // Remove the polygon from the map
                    selectedPolygon.polygon.setMap(null);
                    
                    // Remove from active polygons
                    const newActiveLandPolygons = { ...activeLandPolygons };
                    delete newActiveLandPolygons[selectedPolygon.id];
                    setActiveLandPolygons(newActiveLandPolygons);
                    
                    // Reset selection
                    setSelectedPolygon(null);
                    
                    alert('Polygon deleted successfully');
                  } else {
                    alert(`Failed to delete polygon: ${data.error}`);
                  }
                } catch (error) {
                  console.error('Error deleting polygon:', error);
                  alert('An error occurred while deleting the polygon');
                }
              }}
              className="px-4 py-2 bg-red-500 text-white rounded shadow hover:bg-red-600 w-full"
            >
              Delete Polygon
            </button>
          </div>
        </div>
      )}
      
      {/* Always show the 3D Polygon Viewer regardless of wallet connection status */}
      <PolygonViewer />
    </div>
  );
}
