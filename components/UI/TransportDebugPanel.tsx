import React, { useState, useEffect } from 'react';
import { FaTimes, FaRoute, FaWater, FaRoad, FaExchangeAlt, FaInfoCircle } from 'react-icons/fa';

interface TransportDebugPanelProps {
  onClose: () => void;
  visible: boolean;
}

const TransportDebugPanel: React.FC<TransportDebugPanelProps> = ({ onClose, visible }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [graphInfo, setGraphInfo] = useState<any>(null);
  const [bridges, setBridges] = useState<any[]>([]);
  const [docks, setDocks] = useState<any[]>([]);
  const [allModeInfo, setAllModeInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'bridges' | 'docks' | 'path'>('graph');
  const [pathfindingMode, setPathfindingMode] = useState<'real' | 'all'>('real');
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      fetchDebugInfo();
    }
  }, [visible, pathfindingMode]);
  
  // Add an effect to listen for path changes
  useEffect(() => {
    const handlePathCalculated = (event: CustomEvent) => {
      if (event.detail && event.detail.path) {
        setCurrentPath(event.detail.path);
      }
    };

    // Listen for the transport route calculated event
    window.addEventListener('TRANSPORT_ROUTE_CALCULATED', handlePathCalculated as EventListener);
    
    return () => {
      window.removeEventListener('TRANSPORT_ROUTE_CALCULATED', handlePathCalculated as EventListener);
    };
  }, []);

  const fetchDebugInfo = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch debug info with the current pathfinding mode
      const response = await fetch(`/api/transport/debug?mode=${pathfindingMode === 'all' ? 'all' : 'real'}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setGraphInfo(data.graphInfo);
        setBridges(data.bridges || []);
        setDocks(data.docks || []);
        
        if (pathfindingMode === 'all') {
          setAllModeInfo(data.allModeGraphInfo);
        }
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching transport debug info:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePathfindingMode = () => {
    setPathfindingMode(prev => prev === 'real' ? 'all' : 'real');
  };

  const handleRefresh = () => {
    fetchDebugInfo();
  };

  // Helper function to format numbers with commas
  const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  // Helper function to calculate distance between two points
  const calculateDistance = (point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number => {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1.lat * Math.PI / 180;
    const lat2 = point2.lat * Math.PI / 180;
    const deltaLat = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLng = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  
  // Function to calculate path statistics
  const calculatePathStats = (path: any[]) => {
    if (!path || path.length === 0) return null;
    
    // Calculate total distance
    let totalDistance = 0;
    let walkingDistance = 0;
    let waterDistance = 0;
    
    for (let i = 1; i < path.length; i++) {
      const point1 = path[i-1];
      const point2 = path[i];
      
      // Calculate distance between consecutive points
      const distance = calculateDistance(
        { lat: point1.lat, lng: point1.lng },
        { lat: point2.lat, lng: point2.lng }
      );
      
      totalDistance += distance;
      
      // Track distance by mode
      if (point1.transportMode === 'gondola') {
        waterDistance += distance;
      } else {
        walkingDistance += distance;
      }
    }
    
    // Count points by type
    const pointsByType = path.reduce((acc: Record<string, number>, point: any) => {
      const type = point.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    // Count points by transport mode
    const pointsByMode = path.reduce((acc: Record<string, number>, point: any) => {
      const mode = point.transportMode || 'unknown';
      acc[mode] = (acc[mode] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalPoints: path.length,
      totalDistance,
      walkingDistance,
      waterDistance,
      pointsByType,
      pointsByMode,
      intermediatePoints: path.filter(p => p.isIntermediatePoint).length
    };
  };

  return (
    <div className={`fixed top-20 right-4 bg-amber-50 border-2 border-amber-700 rounded-lg shadow-lg z-50 transition-all duration-300 ${
      visible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'
    }`} style={{ width: '500px', maxHeight: '80vh' }}>
      <div className="bg-amber-700 text-white p-4 flex justify-between items-center">
        <h2 className="text-xl font-serif flex items-center">
          <FaRoute className="mr-2" /> Transport Debug Panel
        </h2>
        <button 
          onClick={onClose}
          className="text-white hover:text-amber-200 transition-colors"
        >
          <FaTimes size={20} />
        </button>
      </div>
      
      <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
        {/* Mode toggle and refresh button */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <span className="text-amber-800 mr-2">Pathfinding Mode:</span>
            <button
              onClick={handleTogglePathfindingMode}
              className={`px-3 py-1 rounded text-white ${
                pathfindingMode === 'real' 
                  ? 'bg-green-600 hover:bg-green-500' 
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {pathfindingMode === 'real' ? 'Real Infrastructure' : 'All Points'}
            </button>
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={`px-3 py-1 rounded text-white ${
              isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {/* Error message */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}
        
        {/* Tabs */}
        <div className="border-b border-amber-300 mb-4">
          <div className="flex">
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'graph' 
                  ? 'border-b-2 border-amber-600 text-amber-800' 
                  : 'text-amber-600 hover:text-amber-800'
              }`}
              onClick={() => setActiveTab('graph')}
            >
              Graph Info
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'bridges' 
                  ? 'border-b-2 border-amber-600 text-amber-800' 
                  : 'text-amber-600 hover:text-amber-800'
              }`}
              onClick={() => setActiveTab('bridges')}
            >
              Bridges ({bridges.length})
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'docks' 
                  ? 'border-b-2 border-amber-600 text-amber-800' 
                  : 'text-amber-600 hover:text-amber-800'
              }`}
              onClick={() => setActiveTab('docks')}
            >
              Docks ({docks.length})
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'path' 
                  ? 'border-b-2 border-amber-600 text-amber-800' 
                  : 'text-amber-600 hover:text-amber-800'
              }`}
              onClick={() => setActiveTab('path')}
            >
              Current Path {currentPath.length > 0 ? `(${currentPath.length})` : ''}
            </button>
          </div>
        </div>
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        {/* Content based on active tab */}
        {!isLoading && (
          <>
            {activeTab === 'graph' && graphInfo && (
              <div className="space-y-4">
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2 flex items-center">
                    <FaInfoCircle className="mr-2" /> Graph Overview
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-sm text-amber-600">Total Nodes</p>
                      <p className="text-2xl font-bold text-amber-800">{formatNumber(graphInfo.totalNodes)}</p>
                    </div>
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-sm text-amber-600">Total Edges</p>
                      <p className="text-2xl font-bold text-amber-800">{formatNumber(graphInfo.totalEdges)}</p>
                    </div>
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-sm text-amber-600">Connected Components</p>
                      <p className="text-2xl font-bold text-amber-800">{formatNumber(graphInfo.connectedComponents)}</p>
                    </div>
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-sm text-amber-600">Canal Network Segments</p>
                      <p className="text-2xl font-bold text-amber-800">{formatNumber(graphInfo.canalNetworkSegments)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">Node Types</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(graphInfo.nodesByType).map(([type, count]: [string, any]) => (
                      <div key={type} className="bg-white p-3 rounded shadow-sm">
                        <p className="text-sm text-amber-600">{type.charAt(0).toUpperCase() + type.slice(1)}</p>
                        <p className="text-2xl font-bold text-amber-800">{formatNumber(count)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                
                {allModeInfo && (
                  <div className="bg-amber-100 p-4 rounded-lg">
                    <h3 className="text-lg font-medium text-amber-800 mb-2 flex items-center">
                      <FaExchangeAlt className="mr-2" /> Comparison with "All Points" Mode
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white">
                        <thead>
                          <tr>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Metric</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-right text-amber-800">Real Mode</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-right text-amber-800">All Mode</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-right text-amber-800">Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-2 px-4 border-b border-amber-200">Total Nodes</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">{formatNumber(graphInfo.totalNodes)}</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">{formatNumber(allModeInfo.totalNodes)}</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">
                              {formatNumber(allModeInfo.totalNodes - graphInfo.totalNodes)}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 border-b border-amber-200">Total Edges</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">{formatNumber(graphInfo.totalEdges)}</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">{formatNumber(allModeInfo.totalEdges)}</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">
                              {formatNumber(allModeInfo.totalEdges - graphInfo.totalEdges)}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 border-b border-amber-200">Connected Components</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">{formatNumber(graphInfo.connectedComponents)}</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">{formatNumber(allModeInfo.connectedComponents)}</td>
                            <td className="py-2 px-4 border-b border-amber-200 text-right">
                              {formatNumber(allModeInfo.connectedComponents - graphInfo.connectedComponents)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">Component Sizes</h3>
                  <div className="bg-white p-3 rounded shadow-sm">
                    <p className="text-sm text-amber-600 mb-2">Size distribution of connected components:</p>
                    <div className="flex flex-wrap gap-2">
                      {graphInfo.componentSizes.map((size: number, index: number) => (
                        <div 
                          key={index} 
                          className="px-2 py-1 bg-amber-200 text-amber-800 rounded text-sm"
                          title={`Component #${index + 1}: ${size} nodes`}
                        >
                          {size}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'bridges' && (
              <div>
                <div className="bg-amber-100 p-4 rounded-lg mb-4">
                  <h3 className="text-lg font-medium text-amber-800 mb-2 flex items-center">
                    <FaRoad className="mr-2" /> Bridges ({bridges.length})
                  </h3>
                  <p className="text-sm text-amber-700 mb-4">
                    Bridges connect land areas across canals, allowing pedestrian travel.
                  </p>
                  
                  {bridges.length === 0 ? (
                    <p className="text-amber-700 italic">No bridges found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white">
                        <thead>
                          <tr>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Name</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Status</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Owner</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bridges.map((bridge: any, index: number) => (
                            <tr key={bridge.id || index} className={index % 2 === 0 ? 'bg-amber-50' : 'bg-white'}>
                              <td className="py-2 px-4 border-b border-amber-200">{bridge.name || 'Unnamed Bridge'}</td>
                              <td className="py-2 px-4 border-b border-amber-200">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  bridge.isConstructed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {bridge.isConstructed ? 'Constructed' : 'Planned'}
                                </span>
                              </td>
                              <td className="py-2 px-4 border-b border-amber-200">{bridge.owner || 'Public'}</td>
                              <td className="py-2 px-4 border-b border-amber-200">
                                {bridge.position ? 
                                  `${bridge.position.lat.toFixed(6)}, ${bridge.position.lng.toFixed(6)}` : 
                                  'Unknown'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'docks' && (
              <div>
                <div className="bg-amber-100 p-4 rounded-lg mb-4">
                  <h3 className="text-lg font-medium text-amber-800 mb-2 flex items-center">
                    <FaWater className="mr-2" /> Docks ({docks.length})
                  </h3>
                  <p className="text-sm text-amber-700 mb-4">
                    Docks are water access points that allow transition between land and water transport.
                  </p>
                  
                  {docks.length === 0 ? (
                    <p className="text-amber-700 italic">No docks found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white">
                        <thead>
                          <tr>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Name</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Status</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Owner</th>
                            <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docks.map((dock: any, index: number) => (
                            <tr key={dock.id || index} className={index % 2 === 0 ? 'bg-amber-50' : 'bg-white'}>
                              <td className="py-2 px-4 border-b border-amber-200">{dock.name || 'Unnamed Dock'}</td>
                              <td className="py-2 px-4 border-b border-amber-200">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  dock.isConstructed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {dock.isConstructed ? 'Constructed' : 'Planned'}
                                </span>
                              </td>
                              <td className="py-2 px-4 border-b border-amber-200">{dock.owner || 'Public'}</td>
                              <td className="py-2 px-4 border-b border-amber-200">
                                {dock.position ? 
                                  `${dock.position.lat.toFixed(6)}, ${dock.position.lng.toFixed(6)}` : 
                                  'Unknown'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        
        {/* Path Tab Content */}
        {activeTab === 'path' && (
          <div>
            {currentPath.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Path Overview
                  </h3>
                  
                  {(() => {
                    const stats = calculatePathStats(currentPath);
                    if (!stats) return <p>No path statistics available</p>;
                    
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-3 rounded shadow-sm">
                          <p className="text-sm text-amber-600">Total Points</p>
                          <p className="text-2xl font-bold text-amber-800">{stats.totalPoints}</p>
                          <p className="text-xs text-amber-500">{stats.intermediatePoints} intermediate</p>
                        </div>
                        <div className="bg-white p-3 rounded shadow-sm">
                          <p className="text-sm text-amber-600">Total Distance</p>
                          <p className="text-2xl font-bold text-amber-800">
                            {stats.totalDistance < 1000 
                              ? `${Math.round(stats.totalDistance)}m` 
                              : `${(stats.totalDistance / 1000).toFixed(2)}km`}
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded shadow-sm">
                          <p className="text-sm text-amber-600">Walking Distance</p>
                          <p className="text-xl font-bold text-amber-800">
                            {stats.walkingDistance < 1000 
                              ? `${Math.round(stats.walkingDistance)}m` 
                              : `${(stats.walkingDistance / 1000).toFixed(2)}km`}
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded shadow-sm">
                          <p className="text-sm text-amber-600">Water Distance</p>
                          <p className="text-xl font-bold text-amber-800">
                            {stats.waterDistance < 1000 
                              ? `${Math.round(stats.waterDistance)}m` 
                              : `${(stats.waterDistance / 1000).toFixed(2)}km`}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">Point Types</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {(() => {
                      const stats = calculatePathStats(currentPath);
                      if (!stats) return null;
                      
                      return Object.entries(stats.pointsByType).map(([type, count]) => (
                        <div key={type} className="bg-white p-3 rounded shadow-sm">
                          <p className="text-sm text-amber-600">{type.charAt(0).toUpperCase() + type.slice(1)}</p>
                          <p className="text-2xl font-bold text-amber-800">{count}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">Transport Modes</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {(() => {
                      const stats = calculatePathStats(currentPath);
                      if (!stats) return null;
                      
                      return Object.entries(stats.pointsByMode).map(([mode, count]) => (
                        <div key={mode} className="bg-white p-3 rounded shadow-sm">
                          <p className="text-sm text-amber-600">{mode.charAt(0).toUpperCase() + mode.slice(1)}</p>
                          <p className="text-2xl font-bold text-amber-800">{count}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">Path Points</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead>
                        <tr>
                          <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">#</th>
                          <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Type</th>
                          <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Mode</th>
                          <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Polygon</th>
                          <th className="py-2 px-4 border-b border-amber-300 text-left text-amber-800">Coordinates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPath.map((point, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-amber-50' : 'bg-white'}>
                            <td className="py-2 px-4 border-b border-amber-200">
                              {index + 1}
                              {point.isIntermediatePoint && (
                                <span className="ml-1 text-xs text-amber-500">(i)</span>
                              )}
                            </td>
                            <td className="py-2 px-4 border-b border-amber-200">
                              {point.type || 'unknown'}
                            </td>
                            <td className="py-2 px-4 border-b border-amber-200">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                point.transportMode === 'gondola' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {point.transportMode || 'unknown'}
                              </span>
                            </td>
                            <td className="py-2 px-4 border-b border-amber-200 text-xs">
                              {point.polygonId ? (
                                <span className="font-mono">{point.polygonId.substring(0, 10)}...</span>
                              ) : (
                                'N/A'
                              )}
                            </td>
                            <td className="py-2 px-4 border-b border-amber-200 font-mono text-xs">
                              {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">Raw Path Data</h3>
                  <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto">
                    <pre>{JSON.stringify(currentPath, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-100 p-6 rounded-lg text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-amber-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <h3 className="text-lg font-medium text-amber-800 mb-2">No Active Path</h3>
                <p className="text-amber-700">
                  Create a transport route on the map to see detailed path information here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransportDebugPanel;
