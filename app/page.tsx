'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleMap, LoadScript, DrawingManager } from '@react-google-maps/api';

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
const libraries = ['drawing'];

export default function Home() {
  // Get API key from environment variable
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const [savedPolygons, setSavedPolygons] = useState([]);
  const mapRef = useRef(null);
  const drawingManagerRef = useRef(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  
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
    if (typeof google !== 'undefined') {
      google.maps.event.addListener(polygon.getPath(), 'set_at', () => {
        savePolygonToFile(polygon);
      });
      
      google.maps.event.addListener(polygon.getPath(), 'insert_at', () => {
        savePolygonToFile(polygon);
      });
    }
  };

  // Handle map load
  const onMapLoad = (map) => {
    mapRef.current = map;
  };

  // Handle drawing manager load
  const onDrawingManagerLoad = (drawingManager) => {
    drawingManagerRef.current = drawingManager;
    setIsGoogleLoaded(true);
  };
  
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
    <LoadScript 
      googleMapsApiKey={apiKey}
      libraries={libraries}
      onLoad={handleScriptLoad}
    >
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        options={{
          fullscreenControl: false,
        }}
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
  );
}
