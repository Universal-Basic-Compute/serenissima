'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaHome, FaBuilding, FaRoad, FaTree, FaStore, FaLandmark, FaBook } from 'react-icons/fa';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import WalletButton from '@/components/UI/WalletButton';
import ResourceDropdowns from '@/components/UI/ResourceDropdowns';
import SettingsModal from '@/components/UI/SettingsModal';

// Import the 2D viewer component with no SSR
const IsometricViewer = dynamic(() => import('@/components/PolygonViewer/IsometricViewer'), {
  ssr: false
});

export default function TwoDPage() {
  const router = useRouter();
  
  // UI state
  const [showInfo, setShowInfo] = useState(false);
  type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
  const [activeView, setActiveView] = useState<ViewType>('buildings');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  
  // Handle settings modal
  const handleSettingsClose = () => {
    setShowSettingsModal(false);
  };
  
  // Handle initial view loading and ensure buildings are always visible
  useEffect(() => {
    console.log('Initial page load, ensuring buildings are always visible...');
    
    // Dispatch an event to ensure buildings are visible regardless of view
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    
    // Also listen for the event to ensure buildings stay visible
    const ensureBuildingsVisible = () => {
      console.log('Ensuring buildings are visible in all views');
      // This event will be handled by the building renderer
    };
    
    window.addEventListener('ensureBuildingsVisible', ensureBuildingsVisible);
    
    return () => {
      window.removeEventListener('ensureBuildingsVisible', ensureBuildingsVisible);
    };
  }, []); // Empty dependency array means this runs once on mount

  // Update view when activeView changes
  useEffect(() => {
    console.log(`2D Page: Switching to ${activeView} view`);
    
    // Always ensure buildings are visible regardless of view
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    
    // Dispatch additional events for specific views
    if (activeView === 'land') {
      window.dispatchEvent(new CustomEvent('fetchIncomeData'));
      window.dispatchEvent(new CustomEvent('showIncomeVisualization'));
    } else if (activeView === 'citizens') {
      window.dispatchEvent(new CustomEvent('loadCitizens'));
    }
  }, [activeView]);

  return (
    <div className="relative w-full h-screen">
      {/* Main 2D Isometric Viewer */}
      <IsometricViewer activeView={activeView} />
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-xl font-serif font-bold hover:text-amber-400 transition-colors">
            La Serenissima 2D
          </Link>
              
          <div className="ml-6">
            <ResourceDropdowns />
          </div>
        </div>
            
        <div className="flex space-x-4">
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('showTransportRoutes'))}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors font-serif"
          >
            Transport Routes
          </button>
          <Link 
            href="/"
            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white transition-colors font-serif"
          >
            3D View
          </Link>
        </div>
      </div>
      
      {/* Left Side Menu */}
      <div className="absolute left-0 top-0 bottom-0 bg-black/70 text-white z-20 flex flex-col w-16">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-center">
          <span className="text-2xl font-serif text-amber-500">V</span>
        </div>
        
        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-2 px-2">
            <li>
              <button
                onClick={() => setActiveView('governance')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'governance' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Governance"
              >
                <FaLandmark className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('guilds')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'guilds' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Guilds"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('citizens')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'citizens' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Citizens"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('knowledge')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'knowledge' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Knowledge"
              >
                <FaBook className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('loans')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'loans' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Loans"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12a8 8 0 01-8 8m0 0a8 8 0 01-8-8m8 8a8 8 0 018-8m-8 0a8 8 0 00-8 8m8-8v14m0-14v14" />
                </svg>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('markets')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'markets' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Markets"
              >
                <FaStore className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('resources')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'resources' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Resources"
              >
                <FaTree className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('transport')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'transport' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Transport"
              >
                <FaRoad className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setActiveView('buildings');
                  eventBus.emit(EventTypes.BUILDING_PLACED, { refresh: true });
                }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'buildings' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Buildings"
              >
                <FaBuilding className="mx-auto h-5 w-5" />
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('land')}
                className={`w-full flex items-center p-2 rounded-lg transition-colors ${
                  activeView === 'land' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title="Land"
              >
                <FaHome className="mx-auto h-5 w-5" />
              </button>
            </li>
          </ul>
        </div>
        
        {/* Bottom section with version number */}
        <div className="p-4 border-t border-gray-700 text-center">
          <div className="text-xs text-gray-400">La Serenissima v0.2.1</div>
        </div>
      </div>
      
      {/* Wallet Button */}
      <WalletButton 
        className="absolute top-4 right-4 z-10" 
        onSettingsClick={() => setShowSettingsModal(true)}
      />
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={handleSettingsClose} 
      />
      
      {/* Information Panel */}
      {showInfo && (
        <div className="absolute top-20 right-4 bg-black/70 text-white p-4 rounded-lg max-w-sm border-2 border-amber-600 shadow-lg">
          <h2 className="text-lg font-serif font-bold mb-2 text-amber-400">About 2D View</h2>
          <p className="text-sm mb-3">
            This is a simplified 2D isometric view of La Serenissima, designed for better performance.
            It shows the same data as the 3D view but with a different rendering approach.
          </p>
          
          <h3 className="text-md font-serif font-bold mb-1 text-amber-400">Legend</h3>
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-4 h-4 bg-amber-500 border border-amber-700"></div>
            <span className="text-sm">Land Parcels</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 border border-blue-700"></div>
            <span className="text-sm">Water</span>
          </div>
          
          <div className="mt-4 text-xs text-amber-400">
            2D Isometric View v0.1.0
          </div>
        </div>
      )}
    </div>
  );
}
