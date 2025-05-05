'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import Link from 'next/link';

// Import SimpleViewer with no SSR to avoid hydration issues
const SimpleViewer = dynamic(() => import('../../components/PolygonViewer/SimpleViewer'), {
  ssr: false
});

export default function SimplePage() {
  return (
    <div className="relative w-full h-screen">
      {/* Debug overlay - will show even if other components fail */}
      <div className="fixed top-0 left-0 z-50 bg-white p-2 text-xs">
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-500 text-white px-2 py-1 rounded mr-2"
        >
          Reload
        </button>
        <span>Simple Viewer</span>
      </div>
      
      {/* Main 3D Viewer */}
      <SimpleViewer />
    </div>
  );
}
