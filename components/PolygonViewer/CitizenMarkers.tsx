import React, { useState, useEffect, useRef, useMemo } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel';

interface ActivityPath {
  id: string;
  citizenId: string;
  path: {lat: number, lng: number}[];
  type: string;
  startTime: string;
  endTime?: string;
}

interface CitizenMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number, y: number };
  canvasWidth: number;
  canvasHeight: number;
  activeView?: string; // Add this prop
}

const CitizenMarkers: React.FC<CitizenMarkersProps> = ({ 
  isVisible, 
  scale, 
  offset,
  canvasWidth,
  canvasHeight,
  activeView = 'citizens' // Default to 'citizens'
}) => {
  const [citizens, setCitizens] = useState<any[]>([]);
  const [selectedCitizen, setSelectedCitizen] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Add a new state to track the hovered citizen's connections
  const [hoveredConnections, setHoveredConnections] = useState<{
    citizen: any;
    homePosition?: {x: number, y: number};
    workPosition?: {x: number, y: number};
  } | null>(null);
  const [activityPaths, setActivityPaths] = useState<Record<string, ActivityPath[]>>({});
  const [isLoadingPaths, setIsLoadingPaths] = useState<boolean>(false);
  const [selectedCitizenPaths, setSelectedCitizenPaths] = useState<ActivityPath[]>([]);
  const [hoveredCitizenPaths, setHoveredCitizenPaths] = useState<ActivityPath[]>([]);
  // Add a new state to track all visible paths
  const [visiblePaths, setVisiblePaths] = useState<ActivityPath[]>([]);
  
  // Helper function to convert lat/lng to screen coordinates
  const latLngToScreen = (lat: number, lng: number) => {
    // Convert lat/lng to world coordinates using CoordinateService
    const world = CoordinateService.latLngToWorld(lat, lng);
    
    // Convert world coordinates to screen coordinates
    const screen = CoordinateService.worldToScreen(
      world.x, world.y, scale, offset, canvasWidth, canvasHeight
    );
    
    return screen;
  };
  
  // Add a function to parse building coordinates from building ID
  const parseBuildingCoordinates = (buildingId: string): {lat: number, lng: number} | null => {
    if (!buildingId) return null;
    
    // Check if it's in the format "building_45.433265_12.340372"
    const parts = buildingId.split('_');
    if (parts.length >= 3 && parts[0] === 'building') {
      const lat = parseFloat(parts[1]);
      const lng = parseFloat(parts[2]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    
    return null;
  };
  
  // Function to fetch activity paths
  const fetchActivityPaths = async () => {
    if (citizens.length === 0) return;
    
    setIsLoadingPaths(true);
    console.log(`Fetching activity paths for ${citizens.length} citizens...`);
    
    try {
      // Get unique citizen IDs
      const citizenIds = [...new Set(citizens.map(c => c.citizenid || c.CitizenId || c.id))];
      console.log(`Found ${citizenIds.length} unique citizen IDs for path fetching`);
      
      // Fetch activities for all citizens in chunks to avoid URL length limits
      const chunkSize = 10;
      const pathsMap: Record<string, ActivityPath[]> = {};
      const allPaths: ActivityPath[] = []; // Collect all paths in a single array
      
      for (let i = 0; i < citizenIds.length; i += chunkSize) {
        const chunk = citizenIds.slice(i, i + chunkSize);
        const queryParams = chunk.map(id => `citizenId=${encodeURIComponent(id)}`).join('&');
        
        const response = await fetch(`/api/activities?${queryParams}&limit=100&hasPath=true`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.activities && Array.isArray(data.activities)) {
            // Process activities with paths
            data.activities.forEach((activity: any) => {
              if (activity.Path) {
                let path;
                try {
                  // Parse path if it's a string
                  path = typeof activity.Path === 'string' ? JSON.parse(activity.Path) : activity.Path;
                  
                  // Log the parsed path for debugging
                  console.log(`Parsed path for activity ${activity.ActivityId || 'unknown'}, citizen ${activity.CitizenId}:`, 
                    path.length > 0 ? `${path.length} points, first: ${JSON.stringify(path[0])}` : 'empty path');
                  
                  // Skip activities without valid paths
                  if (!Array.isArray(path) || path.length < 2) {
                    console.warn(`Skipping invalid path for activity ${activity.ActivityId || 'unknown'}: not an array or too short`);
                    return;
                  }
                  
                  // Validate each point in the path
                  const validPath = path.filter(point => 
                    point && typeof point === 'object' && 
                    'lat' in point && 'lng' in point &&
                    typeof point.lat === 'number' && typeof point.lng === 'number'
                  );
                  
                  if (validPath.length < 2) {
                    console.warn(`Skipping path with insufficient valid points: ${validPath.length} valid out of ${path.length}`);
                    return;
                  }
                  
                  const citizenId = activity.CitizenId;
                  
                  if (!pathsMap[citizenId]) {
                    pathsMap[citizenId] = [];
                  }
                  
                  const activityPath = {
                    id: activity.ActivityId || `activity-${Math.random()}`,
                    citizenId,
                    path: validPath, // Use the validated path
                    type: activity.Type || 'unknown',
                    startTime: activity.StartDate || activity.CreatedAt,
                    endTime: activity.EndDate
                  };
                  
                  pathsMap[citizenId].push(activityPath);
                  allPaths.push(activityPath); // Add to the all paths array
                } catch (e) {
                  console.warn(`Failed to parse activity path for ${activity.ActivityId || 'unknown'}:`, e);
                  return;
                }
              }
            });
          }
        }
      }
      
      console.log(`Loaded activity paths for ${Object.keys(pathsMap).length} citizens, total paths: ${allPaths.length}`);
      setActivityPaths(pathsMap);
      setVisiblePaths(allPaths); // Set all paths to be visible
      
      // Log the first few paths for debugging
      if (allPaths.length > 0) {
        console.log('Sample paths:', allPaths.slice(0, 3));
      }
    } catch (error) {
      console.error('Error fetching activity paths:', error);
    } finally {
      setIsLoadingPaths(false);
    }
  };

  // Add a function to get path color based on activity type
  const getActivityPathColor = (type: string): string => {
    const lowerType = type.toLowerCase();
    
    if (lowerType.includes('transport') || lowerType.includes('move')) {
      return '#4b70e2'; // Blue
    } else if (lowerType.includes('trade') || lowerType.includes('buy') || lowerType.includes('sell')) {
      return '#e27a4b'; // Orange
    } else if (lowerType.includes('work') || lowerType.includes('labor')) {
      return '#4be27a'; // Green
    } else if (lowerType.includes('craft') || lowerType.includes('create') || lowerType.includes('produce')) {
      return '#e24b7a'; // Pink
    }
    
    return '#aaaaaa'; // Default gray
  };
  
  // Add a function to handle citizen hover
  const handleCitizenHover = (citizen: any) => {
    // Skip if citizen doesn't have a position
    if (!citizen || !citizen.position) {
      console.warn('Citizen without position in handleCitizenHover:', citizen);
      return;
    }
    
    // Parse home and work building coordinates
    const homeCoords = parseBuildingCoordinates(citizen.home);
    const workCoords = parseBuildingCoordinates(citizen.work);
    
    // Log more detailed information for debugging
    console.log('Citizen hover:', {
      citizen: citizen.firstname + ' ' + citizen.lastname,
      home: citizen.home,
      work: citizen.work,
      homeCoords,
      workCoords,
      position: citizen.position
    });
    
    // Calculate connections
    const connections = {
      citizen,
      homePosition: homeCoords ? latLngToScreen(homeCoords.lat, homeCoords.lng) : undefined,
      workPosition: workCoords ? latLngToScreen(workCoords.lat, workCoords.lng) : undefined
    };
    
    // Log the calculated screen positions
    if (homeCoords || workCoords) {
      console.log('Connection screen positions:', {
        homePosition: connections.homePosition,
        workPosition: connections.workPosition,
        citizenScreenPos: latLngToScreen(citizen.position.lat, citizen.position.lng)
      });
    }
    
    // Set connections even if we only have one valid position
    if (connections.homePosition || connections.workPosition) {
      setHoveredConnections(connections);
      console.log('Set hovered connections:', connections);
    } else {
      console.log('No valid connections found for citizen:', citizen);
    }
    
    // Set hovered citizen paths
    const citizenId = citizen.citizenid || citizen.CitizenId || citizen.id;
    const paths = activityPaths[citizenId] || [];
    
    console.log(`Citizen hover: ${citizenId} has ${paths.length} activity paths`);
    if (paths.length > 0) {
      console.log(`First path has ${paths[0].path.length} points`);
    }
    
    setHoveredCitizenPaths(paths);
    
    // Log the paths for debugging
    if (paths.length > 0) {
      console.log(`Found ${paths.length} activity paths for citizen ${citizenId}`);
    }
  };
  
  // Add a function to handle mouse leave
  const handleCitizenLeave = () => {
    setHoveredConnections(null);
    setHoveredCitizenPaths([]);
  };
  
  useEffect(() => {
    // Load citizens when the component mounts
    const loadCitizensData = async () => {
      setIsLoading(true);
  
      if (!citizenService.isDataLoaded()) {
        await citizenService.loadCitizens();
      }
  
      const loadedCitizens = citizenService.getCitizens();
      
      // Log all citizens to debug position issues
      console.log(`CitizenMarkers: All citizens:`, loadedCitizens);
      
      // Filter out citizens without positions
      const citizensWithPositions = loadedCitizens.filter(c => c.position);
      setCitizens(citizensWithPositions);
  
      // Add debug logging
      console.log(`CitizenMarkers: Loaded ${loadedCitizens.length} citizens`);
      console.log(`CitizenMarkers: Citizens with positions: ${citizensWithPositions.length}`);
      console.log(`CitizenMarkers: Citizens without positions: ${loadedCitizens.length - citizensWithPositions.length}`);
  
      // Log a sample citizen to check position format
      if (citizensWithPositions.length > 0) {
        console.log('CitizenMarkers: Sample citizen position:', citizensWithPositions[0].position);
      } else {
        console.warn('CitizenMarkers: No citizens with valid positions found');
        
        // If no citizens with positions, create some with positions
        if (loadedCitizens.length > 0) {
          const citizensWithAddedPositions = loadedCitizens.map(citizen => ({
            ...citizen,
            position: citizen.position || {
              lat: 45.4371 + Math.random() * 0.01,
              lng: 12.3326 + Math.random() * 0.01
            }
          }));
          console.log('CitizenMarkers: Created positions for citizens:', citizensWithAddedPositions.length);
          setCitizens(citizensWithAddedPositions);
        }
      }
  
      setIsLoading(false);
    };
    
    // Listen for the loadCitizens event
    const handleLoadCitizens = () => {
      loadCitizensData();
    };
    
    // Listen for citizens loaded event
    const handleCitizensLoaded = (data: any) => {
      setCitizens(data.citizens);
      setIsLoading(false);
    };
    
    // Add event listeners
    window.addEventListener('loadCitizens', handleLoadCitizens);
    eventBus.subscribe(EventTypes.CITIZENS_LOADED, handleCitizensLoaded);
    
    // Initial load
    loadCitizensData().then(() => {
      // After citizens are loaded, fetch their activity paths
      fetchActivityPaths();
    });
    
    // Subscribe to events and store the subscription
    const subscription = eventBus.subscribe(EventTypes.CITIZENS_LOADED, handleCitizensLoaded);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('loadCitizens', handleLoadCitizens);
      subscription.unsubscribe();
    };
  }, []);
  
  // Add a separate effect to update paths when citizens change
  useEffect(() => {
    // This effect should run when the component mounts and when citizens change
    if (citizens.length > 0) {
      fetchActivityPaths();
    }
  }, [citizens]);
  
  // Update when scale or offset changes
  useEffect(() => {
    // Force re-render when scale or offset changes
  }, [scale, offset, canvasWidth, canvasHeight]);
  
  // Add an additional useEffect to update visiblePaths when activeView changes
  useEffect(() => {
    if (activeView === 'citizens') {
      // When in citizens view, make all paths visible
      const allPaths = Object.values(activityPaths).flat();
      setVisiblePaths(allPaths);
      console.log(`Setting ${allPaths.length} paths as visible in citizens view`);
    }
  }, [activeView, activityPaths]);
  
  const handleCitizenClick = (citizen: any) => {
    // Ensure we have a valid citizen object before setting it
    if (citizen && (citizen.CitizenId || citizen.id)) {
      setSelectedCitizen(citizen);
      
      // Set selected citizen paths
      const citizenId = citizen.citizenid || citizen.CitizenId || citizen.id;
      const paths = activityPaths[citizenId] || [];
      setSelectedCitizenPaths(paths);
      console.log(`Setting ${paths.length} paths for selected citizen ${citizenId}`);
    } else {
      console.warn('Attempted to select invalid citizen:', citizen);
    }
  };
  
  const handleCloseDetails = () => {
    console.log('handleCloseDetails called in CitizenMarkers');
    setSelectedCitizen(null);
    setSelectedCitizenPaths([]);
  };
  
  if (!isVisible) return null;
  
  return (
    <>
      {/* Citizen Markers */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        {citizens.map((citizen) => {
          // Log the original position and the transformed screen coordinates
          const originalPos = citizen.position;
          const position = latLngToScreen(citizen.position.lat, citizen.position.lng);
          
          // Debug log to verify position transformation
          if (Math.random() < 0.05) { // Only log ~5% of citizens to avoid console spam
            const firstName = citizen.firstname || citizen.FirstName || '';
            const lastName = citizen.lastname || citizen.LastName || '';
            const displayName = firstName || lastName ? 
              `${firstName} ${lastName}`.trim() : 
              `Citizen ${citizen.citizenid || citizen.CitizenId || citizen.id || 'unknown'}`;
            
            console.log(`Citizen ${displayName} position:`, {
              original: originalPos,
              screen: position
            });
          }
          
          // Skip if position is off-screen (with some margin)
          if (position.x < -100 || position.x > canvasWidth + 100 || 
              position.y < -100 || position.y > canvasHeight + 100) {
            return null;
          }
          
          // Ensure we have the required properties for display
          const firstName = citizen.firstname || citizen.FirstName || citizen.firstName || '';
          const lastName = citizen.lastname || citizen.LastName || citizen.lastName || '';
          const socialClass = citizen.socialclass || citizen.SocialClass || citizen.socialClass || '';
          const citizenId = citizen.citizenid || citizen.CitizenId || citizen.id;
          
          return (
            <div 
              key={citizenId || `citizen-${Math.random()}`}
              className="absolute pointer-events-auto"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 50,
                position: 'absolute' // Ensure absolute positioning works
              }}
              onClick={() => handleCitizenClick(citizen)}
              onMouseEnter={() => handleCitizenHover(citizen)}
              onMouseLeave={handleCitizenLeave}
            >
              <div 
                className="w-4 h-4 rounded-full cursor-pointer hover:scale-125 transition-transform flex items-center justify-center"
                style={{ 
                  backgroundColor: citizenService.getSocialClassColor(socialClass),
                  border: '1px solid white',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2)'
                }}
                title={`${firstName} ${lastName} (${socialClass})`}
              >
                <span className="text-white text-[8px] font-bold">
                  {firstName?.[0] || '?'}{lastName?.[0] || '?'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Connection lines to home and work when hovering */}
      {hoveredConnections && hoveredConnections.citizen && hoveredConnections.citizen.position && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 45, width: canvasWidth, height: canvasHeight }}>
          {/* Debug info - add this to see if the SVG is rendering */}
          <text x="20" y="20" fill="red" fontSize="12">
            Hover connections active: {hoveredConnections.homePosition ? 'Home' : ''} {hoveredConnections.workPosition ? 'Work' : ''}
          </text>
          
          {/* Home connection line */}
          {hoveredConnections.homePosition && (
            <>
              <line 
                x1={latLngToScreen(hoveredConnections.citizen.position.lat, hoveredConnections.citizen.position.lng).x}
                y1={latLngToScreen(hoveredConnections.citizen.position.lat, hoveredConnections.citizen.position.lng).y}
                x2={hoveredConnections.homePosition.x}
                y2={hoveredConnections.homePosition.y}
                stroke="#4b70e2" // Blue for home
                strokeWidth="2"
                strokeDasharray="5,5"
              />
              {/* Home icon */}
              <circle 
                cx={hoveredConnections.homePosition.x} 
                cy={hoveredConnections.homePosition.y} 
                r="6" 
                fill="#4b70e2" 
              />
              <text 
                x={hoveredConnections.homePosition.x} 
                y={hoveredConnections.homePosition.y} 
                textAnchor="middle" 
                dominantBaseline="middle" 
                fill="white" 
                fontSize="8"
              >
                H
              </text>
            </>
          )}
          
          {/* Work connection line */}
          {hoveredConnections.workPosition && (
            <>
              <line 
                x1={latLngToScreen(hoveredConnections.citizen.position.lat, hoveredConnections.citizen.position.lng).x}
                y1={latLngToScreen(hoveredConnections.citizen.position.lat, hoveredConnections.citizen.position.lng).y}
                x2={hoveredConnections.workPosition.x}
                y2={hoveredConnections.workPosition.y}
                stroke="#e27a4b" // Orange for work
                strokeWidth="2"
                strokeDasharray="5,5"
              />
              {/* Work icon */}
              <circle 
                cx={hoveredConnections.workPosition.x} 
                cy={hoveredConnections.workPosition.y} 
                r="6" 
                fill="#e27a4b" 
              />
              <text 
                x={hoveredConnections.workPosition.x} 
                y={hoveredConnections.workPosition.y} 
                textAnchor="middle" 
                dominantBaseline="middle" 
                fill="white" 
                fontSize="8"
              >
                W
              </text>
            </>
          )}
        </svg>
      )}
      
      {/* Activity Paths - Modified to show all paths in citizens view */}
      {((activeView === 'citizens' && visiblePaths.length > 0) || hoveredCitizenPaths.length > 0 || selectedCitizenPaths.length > 0) && (
        <svg 
          className="absolute inset-0 pointer-events-none" 
          style={{ 
            zIndex: 40, 
            width: canvasWidth, 
            height: canvasHeight,
            overflow: 'visible' // Add this to ensure paths aren't clipped
          }}
        >
          {/* Debug text to confirm the SVG is rendering */}
          <text x="20" y="40" fill="red" fontSize="12">
            Paths: {hoveredCitizenPaths.length} hovered, {selectedCitizenPaths.length} selected, {activeView === 'citizens' ? visiblePaths.length : 0} visible
          </text>
          
          {/* Render all paths when in citizens view */}
          {activeView === 'citizens' && visiblePaths.map((activity) => {
            // Generate points string with validation
            const pointsString = activity.path
              .filter(point => point && typeof point.lat === 'number' && typeof point.lng === 'number')
              .map(point => {
                const screenPos = latLngToScreen(point.lat, point.lng);
                return `${screenPos.x},${screenPos.y}`;
              })
              .join(' ');
            
            // Only render if we have valid points
            if (!pointsString) return null;
            
            return (
              <g key={activity.id}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity.type)}
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                  strokeDasharray="3,3"
                />
                {/* Add small circles at path endpoints only to reduce visual clutter */}
                {activity.path.length > 0 && [
                  activity.path[0],
                  activity.path[activity.path.length - 1]
                ].map((point, index) => {
                  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
                  
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`endpoint-${index}`}
                      cx={screenPos.x}
                      cy={screenPos.y}
                      r="2"
                      fill={getActivityPathColor(activity.type)}
                      opacity="0.6"
                    />
                  );
                })}
              </g>
            );
          })}
          
          {/* Render paths for hovered citizen */}
          {hoveredCitizenPaths.map((activity) => {
            // Generate points string with validation
            const pointsString = activity.path
              .filter(point => point && typeof point.lat === 'number' && typeof point.lng === 'number')
              .map(point => {
                const screenPos = latLngToScreen(point.lat, point.lng);
                return `${screenPos.x},${screenPos.y}`;
              })
              .join(' ');
            
            // Only render if we have valid points
            if (!pointsString) return null;
            
            return (
              <g key={activity.id}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity.type)}
                  strokeWidth="2"
                  strokeOpacity="0.6"
                  strokeDasharray="5,5"
                />
                {/* Add small circles at path points */}
                {activity.path.map((point, index) => {
                  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
                  
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`point-${index}`}
                      cx={screenPos.x}
                      cy={screenPos.y}
                      r="2"
                      fill={getActivityPathColor(activity.type)}
                      opacity="0.8"
                    />
                  );
                })}
              </g>
            );
          })}
          
          {/* Render paths for selected citizen with higher opacity */}
          {selectedCitizenPaths.map((activity) => {
            // Generate points string with validation
            const pointsString = activity.path
              .filter(point => point && typeof point.lat === 'number' && typeof point.lng === 'number')
              .map(point => {
                const screenPos = latLngToScreen(point.lat, point.lng);
                return `${screenPos.x},${screenPos.y}`;
              })
              .join(' ');
            
            // Only render if we have valid points
            if (!pointsString) return null;
            
            return (
              <g key={activity.id}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity.type)}
                  strokeWidth="3"
                  strokeOpacity="0.8"
                />
                {/* Add small circles at path points */}
                {activity.path.map((point, index) => {
                  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
                  
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`point-${index}`}
                      cx={screenPos.x}
                      cy={screenPos.y}
                      r="3"
                      fill={getActivityPathColor(activity.type)}
                      opacity="1"
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
      
      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
          Loading citizens...
        </div>
      )}
      
      {isLoadingPaths && (
        <div className="absolute top-32 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
          Loading activity paths...
        </div>
      )}
      
      {/* Citizen Details Panel */}
      {selectedCitizen && (
        <CitizenDetailsPanel 
          citizen={selectedCitizen} 
          onClose={() => {
            console.log('CitizenMarkers: onClose callback executed');
            // Clear both selected citizen and paths
            setSelectedCitizen(null);
            setSelectedCitizenPaths([]);
          }} 
        />
      )}
    </>
  );
};

export default CitizenMarkers;
