'use client';

import { useEffect, useState } from 'react';
import { GoogleMap, LoadScript } from '@react-google-maps/api';

// Venice coordinates
const center = {
  lat: 45.4371908,
  lng: 12.3345898
};

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

export default function Home() {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    // You should set up your Google Maps API key in your environment variables
    // For development, you can use this approach, but for production,
    // make sure to properly secure your API key
    setApiKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '');
  }, []);

  if (!apiKey) {
    return <div className="w-screen h-screen flex items-center justify-center">Loading map...</div>;
  }

  return (
    <LoadScript googleMapsApiKey={apiKey}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={14}
        options={{
          fullscreenControl: false,
        }}
      />
    </LoadScript>
  );
}
