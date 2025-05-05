'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

// Import SimpleViewer with no SSR to avoid hydration issues
const SimpleViewer = dynamic(() => import('../../components/PolygonViewer/SimpleViewer'), {
  ssr: false
});

export default function SimplePage() {
  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [activeView, setActiveView] = useState<'aerial' | 'street'>('aerial');
  const [qualityMode, setQualityMode] = useState<'high' | 'performance'>('high');
  const [marketPanelVisible, setMarketPanelVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
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
      <SimpleViewer qualityMode={qualityMode} />
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold hover:text-amber-400 transition-colors">
          La Serenissima
        </Link>
        
        <div className="flex space-x-4">
          <button 
            onClick={() => setShowControls(!showControls)}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 rounded text-black transition-colors"
          >
            {showControls ? 'Hide Controls' : 'Show Controls'}
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 rounded text-white transition-colors"
          >
            {showInfo ? 'Hide Info' : 'Show Info'}
          </button>
        </div>
      </div>
      
      {/* Wallet/User Profile Menu */}
      <div className="absolute top-4 right-4 z-10" ref={dropdownRef}>
        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="bg-amber-50 px-4 py-2 rounded-lg shadow-md hover:bg-amber-100 transition-colors flex items-center"
        >
          <span className="mr-2">Guest User</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl py-1 z-20 border-2 border-amber-300">
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50">
              <p className="text-xs text-amber-700">Simple Mode</p>
              <p className="text-sm font-medium">Viewing as Guest</p>
            </div>
            <Link href="/"
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
            >
              Go to Full Experience
            </Link>
          </div>
        )}
      </div>
      
      {/* Controls Panel */}
      {showControls && (
        <div className="absolute bottom-4 left-4 bg-black/70 text-white p-4 rounded-lg max-w-xs">
          <h2 className="text-lg font-bold mb-2">Camera Controls</h2>
          <ul className="space-y-1 text-sm">
            <li>• Left-click + drag: Rotate camera</li>
            <li>• Right-click + drag: Pan camera</li>
            <li>• Scroll wheel: Zoom in/out</li>
            <li>• Double-click: Reset view</li>
          </ul>
          
          <h2 className="text-lg font-bold mt-4 mb-2">View Options</h2>
          <div className="grid grid-cols-2 gap-2">
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                activeView === 'aerial' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setActiveView('aerial')}
            >
              Aerial View
            </button>
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                activeView === 'street' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setActiveView('street')}
            >
              Street View
            </button>
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                qualityMode === 'high' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setQualityMode('high')}
            >
              High Quality
            </button>
            <button 
              className={`px-2 py-1 rounded text-sm transition-colors ${
                qualityMode === 'performance' 
                  ? 'bg-amber-500 text-black' 
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
              onClick={() => setQualityMode('performance')}
            >
              Performance
            </button>
          </div>
        </div>
      )}
      
      {/* Information Panel */}
      {showInfo && (
        <div className="absolute top-20 right-4 bg-black/70 text-white p-4 rounded-lg max-w-sm">
          <h2 className="text-lg font-bold mb-2">About La Serenissima</h2>
          <p className="text-sm mb-3">
            Welcome to a simplified view of La Serenissima, a digital recreation of Renaissance Venice.
            This view shows the basic layout of the city with land and water.
          </p>
          
          <h3 className="text-md font-bold mb-1">Legend</h3>
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-4 h-4 bg-amber-500"></div>
            <span className="text-sm">Land Parcels</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500"></div>
            <span className="text-sm">Water</span>
          </div>
          
          <div className="mt-4 text-xs text-gray-300">
            Simple Viewer v1.0
          </div>
        </div>
      )}
      
      {/* Bottom Right Menu */}
      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-4 rounded-lg">
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm transition-colors">
            Create Land
          </button>
          <button className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm transition-colors">
            Delete Land
          </button>
          <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors">
            Add Bridge
          </button>
          <button className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm transition-colors">
            Add Road
          </button>
        </div>
      </div>
      
      {/* View Mode Selector */}
      <div className="absolute top-20 left-4 bg-black/70 text-white p-3 rounded-lg">
        <h3 className="text-sm font-bold mb-2">View Mode</h3>
        <div className="flex flex-col space-y-2">
          <button 
            className={`px-3 py-1 rounded text-sm transition-colors ${
              !marketPanelVisible ? 'bg-amber-500 text-black' : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
            onClick={() => setMarketPanelVisible(false)}
          >
            Land View
          </button>
          <button 
            className={`px-3 py-1 rounded text-sm transition-colors ${
              marketPanelVisible ? 'bg-amber-500 text-black' : 'bg-gray-600 hover:bg-gray-500 text-white'
            }`}
            onClick={() => setMarketPanelVisible(true)}
          >
            Market View
          </button>
        </div>
      </div>
    </div>
  );
}
