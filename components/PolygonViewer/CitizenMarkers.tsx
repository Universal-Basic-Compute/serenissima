import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel';
// CitizenRegistry import removed as it's handled by app/page.tsx
import { hoverStateService } from '@/lib/services/HoverStateService';
import { citizenAnimationService, AnimatedCitizen } from '@/lib/services/CitizenAnimationService';
import { ActivityPath, activityPathService } from '@/lib/services/ActivityPathService';

interface CitizenMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number, y: number };
  canvasWidth: number;
  canvasHeight: number;
  activeView?: string; // Accept any view type
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
  // showRegistry state removed
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [activityPaths, setActivityPaths] = useState<Record<string, ActivityPath[]>>({});
  const [isLoadingPaths, setIsLoadingPaths] = useState<boolean>(false);
  const [selectedCitizenPaths, setSelectedCitizenPaths] = useState<ActivityPath[]>([]);
  const [hoveredCitizenPaths, setHoveredCitizenPaths] = useState<ActivityPath[]>([]);
  // Add new state variables for animation
  const [animatedCitizens, setAnimatedCitizens] = useState<Record<string, AnimatedCitizen>>({});
  const [animationActive, setAnimationActive] = useState<boolean>(true);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  // Add a new state to track initialization status
  const [positionsInitialized, setPositionsInitialized] = useState<boolean>(false);
  
  // Helper function to convert lat/lng to screen coordinates
  const latLngToScreen = useCallback((lat: number, lng: number) => {
    // Convert lat/lng to world coordinates
    const world = {
      x: (lng - 12.3326) * 20000,
      y: (lat - 45.4371) * 20000
    };
    
    // Convert world coordinates to screen coordinates
    return {
      x: CoordinateService.worldToScreen(world.x, world.y, scale, offset, canvasWidth, canvasHeight).x,
      y: CoordinateService.worldToScreen(world.x, world.y, scale, offset, canvasWidth, canvasHeight).y
    };
  }, [scale, offset, canvasWidth, canvasHeight]);
  
  // Use the ActivityPathService for path calculations
  const calculatePositionAlongPath = useCallback((path: {lat: number, lng: number}[], progress: number) => {
    return activityPathService.calculatePositionAlongPath(path, progress);
  }, []);
  
  // Create a callback for animation updates
  const handleAnimationUpdate = useCallback((updatedCitizens: Record<string, AnimatedCitizen>) => {
    setAnimatedCitizens(updatedCitizens);
  }, []);
  
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
;
  
  // Function to fetch activity paths
  const fetchActivityPaths = async () => {
    setIsLoadingPaths(true);
    console.log('Fetching activity paths using ActivityPathService...');
    
    try {
      // Use the ActivityPathService to fetch paths
      const pathsMap = await activityPathService.fetchActivityPaths();
      
      // Update state with the fetched paths
      setActivityPaths(pathsMap);
      
      // The concept of "all visible paths" by default has been removed.
      // Paths are now shown on hover or selection.
      const allPathsCount = Object.values(pathsMap).flat().length;
      console.log(`Loaded ${allPathsCount} activity paths for ${Object.keys(pathsMap).length} citizens`);
    } catch (error) {
      console.error('Error fetching activity paths:', error);
    } finally {
      setIsLoadingPaths(false);
    }
  };

  // Use the ActivityPathService for path coloring
  const getActivityPathColor = (activity: ActivityPath): string => {
    // Find the citizen for this activity
    const citizen = citizens.find(c => 
      c.username === activity.citizenId || 
      c.citizenid === activity.citizenId || 
      c.CitizenId === activity.citizenId || 
      c.id === activity.citizenId
    );
  
    // Get the social class if citizen is found
    const socialClass = citizen ? 
      (citizen.socialClass || citizen.socialclass || citizen.SocialClass || '') : 
      '';
    
    // Use the ActivityPathService to get the color
    return activityPathService.getActivityPathColor(activity, socialClass);
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
    
    // Calculate connections
    const connections = {
      citizen,
      homePosition: homeCoords ? latLngToScreen(homeCoords.lat, homeCoords.lng) : undefined,
      workPosition: workCoords ? latLngToScreen(workCoords.lat, workCoords.lng) : undefined
    };
    
    // Set connections even if we only have one valid position
    if (connections.homePosition || connections.workPosition) {
      setHoveredConnections(connections);
    }
    
    // Set hovered citizen paths - use username first, then fall back to other IDs
    const citizenId = citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id;
    const paths = activityPaths[citizenId] || [];
    setHoveredCitizenPaths(paths);
    
    // Update the hover state service with the citizen data
    // The service will handle sanitizing the citizen object
    
    // Find the most recent activity notes for this citizen
    const citizenIdForNotes = citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id;
    const citizenPaths = activityPaths[citizenIdForNotes] || [];
    let latestNotes: string | null = null;
    
    if (citizenPaths.length > 0) {
      // Sort paths by startTime descending to get the most recent first
      const sortedPaths = [...citizenPaths].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      const mostRecentPathWithNotes = sortedPaths.find(p => p.notes && p.notes.trim() !== '');
      if (mostRecentPathWithNotes) {
        latestNotes = mostRecentPathWithNotes.notes;
      }
    }
    
    // Add activityNotes to the citizen object for the tooltip
    const citizenWithNotes = {
      ...citizen,
      activityNotes: latestNotes
    };

    console.log('[CitizenMarkers] handleCitizenHover: latestNotes:', latestNotes);
    console.log('[CitizenMarkers] handleCitizenHover: citizenWithNotes being sent to hoverStateService:', citizenWithNotes);
    
    hoverStateService.setHoveredCitizen(citizenWithNotes);
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
    // This effect should run when the component mounts
    fetchActivityPaths();
  }, []);
  
  // Update when scale or offset changes
  useEffect(() => {
    // Force recalculation of all citizen positions when scale or offset changes
    if (Object.keys(animatedCitizens).length > 0) {
      // Just trigger a re-render, the positions will be recalculated in the render function
      setAnimatedCitizens({...animatedCitizens});
    }
  }, [scale, offset, canvasWidth, canvasHeight]);
  
  // Add effect to get the current logged-in citizen's username
  useEffect(() => {
    // Get current citizen from localStorage
    const savedProfile = localStorage.getItem('citizenProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.username) {
          setCurrentUsername(profile.username);
        }
      } catch (error) {
        console.error('Error parsing citizen profile:', error);
      }
    }
  }, []);
  
  // Add effect to initialize animated citizens when paths are loaded
  useEffect(() => {
    if (Object.keys(activityPaths).length === 0 || citizens.length === 0) return;
    
    console.log('Initializing animated citizens with paths...');
    
    // Use the CitizenAnimationService to initialize animated citizens
    const initialAnimatedCitizens = citizenAnimationService.initializeAnimatedCitizens(
      citizens,
      activityPaths
    );
    
    // Update state with the initialized citizens
    setAnimatedCitizens(initialAnimatedCitizens);
    console.log(`Initialized ${Object.keys(initialAnimatedCitizens).length} animated citizens`);
    
    // Set the positions initialized flag to true
    setPositionsInitialized(true);
    
    // Start animation loop immediately
    if (animationActive && Object.keys(initialAnimatedCitizens).length > 0) {
      citizenAnimationService.startAnimation(handleAnimationUpdate);
    }
    
    // Cleanup animation loop on unmount
    return () => {
      citizenAnimationService.stopAnimation();
    };
  }, [activityPaths, citizens, animationActive, handleAnimationUpdate]);
  
  // Add effect to start/stop animation when view changes
  useEffect(() => {
    // Animate in all views except land view
    const shouldAnimate = activeView !== 'land';
    setAnimationActive(shouldAnimate);
    
    if (shouldAnimate) {
      citizenAnimationService.startAnimation(handleAnimationUpdate);
    } else {
      citizenAnimationService.stopAnimation();
    }
    
    return () => {
      citizenAnimationService.stopAnimation();
    };
  }, [activeView, handleAnimationUpdate]);
  
  // Add this effect to start animation immediately after initialization
  useEffect(() => {
    if (positionsInitialized && animationActive) {
      console.log('Starting animation loop immediately after initialization');
      citizenAnimationService.startAnimation(handleAnimationUpdate);
    }
  }, [positionsInitialized, animationActive, handleAnimationUpdate]);
  
  const handleCitizenClick = (citizen: any) => {
    // Ensure we have a valid citizen object before setting it
    if (citizen && (citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id)) {
      setSelectedCitizen(citizen);
      
      // Set selected citizen paths - use username first, then fall back to other IDs
      const citizenId = citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id;
      const paths = activityPaths[citizenId] || [];
      setSelectedCitizenPaths(paths);
      console.log(`Setting ${paths.length} paths for selected citizen ${citizenId}`);
    } else {
      console.warn('Attempted to select invalid citizen:', citizen);
    }
  };
  
  const handleCloseDetails = useCallback(() => {
    console.log('handleCloseDetails called in CitizenMarkers');
    setSelectedCitizen(null);
    setSelectedCitizenPaths([]);
  }, []);
  
  // The logic for showing a local CitizenRegistry and its button has been removed.
  // CitizenRegistry is now handled as a modal by app/page.tsx.
  
  if (!isVisible || activeView === 'land') return null;
  
  // Helper function to render citizen markers
  function renderCitizenMarkers() {
    // Don't render anything until positions are initialized
    if (!positionsInitialized && Object.keys(activityPaths).length > 0) {
      return (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
          Calculating citizen positions...
        </div>
      );
    }
  
  return (
    <>
      {/* Citizen Markers */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        {/* Animated Citizens */}
        {Object.values(animatedCitizens).map((animatedCitizen) => {
          // Use the animated position instead of the original position
          const position = latLngToScreen(
            animatedCitizen.currentPosition.lat, 
            animatedCitizen.currentPosition.lng
          );
          
          // Skip if position is off-screen (with some margin)
          if (position.x < -100 || position.x > canvasWidth + 100 || 
              position.y < -100 || position.y > canvasHeight + 100) {
            return null;
          }
          
          const citizen = animatedCitizen.citizen;
          
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
                zIndex: 15,
                position: 'absolute', // Ensure absolute positioning works
                transition: 'none' // Remove transition to avoid lag
              }}
              onClick={() => handleCitizenClick(citizen)}
              onMouseEnter={() => handleCitizenHover(citizen)}
              onMouseLeave={handleCitizenLeave}
            >
              <div 
                className={`w-4 h-4 rounded-full cursor-pointer hover:scale-125 transition-transform flex items-center justify-center ${
                  citizen.username === currentUsername ? 'ring-2 ring-purple-500 ring-opacity-80' : 
                  citizen.worksFor === currentUsername ? 'ring-2 ring-yellow-400 ring-opacity-80' : ''
                }`}
                style={{ 
                  backgroundColor: citizenService.getSocialClassColor(socialClass),
                  border: '1px solid white',
                  boxShadow: citizen.username === currentUsername ? '0 0 0 2px rgba(168, 85, 247, 0.9)' : 
                             citizen.worksFor === currentUsername ? '0 0 0 2px rgba(250, 204, 21, 0.9)' : '0 0 0 1px rgba(0,0,0,0.2)'
                }}
                title={`${firstName} ${lastName} (${socialClass})${
                  citizen.username === currentUsername ? ' - This is you' : 
                  citizen.worksFor === currentUsername ? ' - Works for you' : ''
                }`}
              >
                <span className="text-white text-[8px] font-bold">
                  {firstName?.[0] || '?'}{lastName?.[0] || '?'}
                </span>
              </div>
            </div>
          );
        })}
        
        {/* Static Citizens (those without paths) */}
        {citizens.filter(citizen => {
          const citizenId = citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id;
          // Only show citizens that aren't being animated
          return !animatedCitizens[citizenId];
        }).map((citizen) => {
          // Original static citizen rendering code...
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
            
            /**console.log(`Citizen ${displayName} position:`, {
              original: originalPos,
              screen: position
            });*/
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
                zIndex: 15,
                position: 'absolute', // Ensure absolute positioning works
                transition: 'none' // Remove transition to avoid lag
              }}
              onClick={() => handleCitizenClick(citizen)}
              onMouseEnter={() => handleCitizenHover(citizen)}
              onMouseLeave={handleCitizenLeave}
            >
              <div 
                className={`w-4 h-4 rounded-full cursor-pointer hover:scale-125 transition-transform flex items-center justify-center ${
                  citizen.username === currentUsername ? 'ring-2 ring-purple-500 ring-opacity-80' : 
                  citizen.worksFor === currentUsername ? 'ring-2 ring-yellow-400 ring-opacity-80' : ''
                }`}
                style={{ 
                  backgroundColor: citizenService.getSocialClassColor(socialClass),
                  border: '1px solid white',
                  boxShadow: citizen.username === currentUsername ? '0 0 0 2px rgba(168, 85, 247, 0.9)' : 
                             citizen.worksFor === currentUsername ? '0 0 0 2px rgba(250, 204, 21, 0.9)' : '0 0 0 1px rgba(0,0,0,0.2)'
                }}
                title={`${firstName} ${lastName} (${socialClass})${
                  citizen.username === currentUsername ? ' - This is you' : 
                  citizen.worksFor === currentUsername ? ' - Works for you' : ''
                }`}
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
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 12, width: canvasWidth, height: canvasHeight }}>
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
      
      {/* Activity Paths - Show only on hover */}
      {(hoveredCitizenPaths.length > 0) && (
        <svg 
          className="absolute inset-0 pointer-events-none" 
          style={{ 
            zIndex: 10, 
            width: canvasWidth, 
            height: canvasHeight,
            overflow: 'visible' // Add this to ensure paths aren't clipped
          }}
        >
          {/* Debug text to confirm the SVG is rendering */}
          <text x="20" y="40" fill="red" fontSize="12">
            Paths: {hoveredCitizenPaths.length} hovered
          </text>
          
          {/* Animation status indicator */}
          <text x="20" y="60" fill={animationActive ? "green" : "red"} fontSize="12">
            Animation: {animationActive ? "Active" : "Paused"}
          </text>
          
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
                  stroke={getActivityPathColor(activity)}
                  strokeWidth="2.0"
                  strokeOpacity="0.7"
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
                      fill={getActivityPathColor(activity)}
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
                  stroke={getActivityPathColor(activity)}
                  strokeWidth="2.5"
                  strokeOpacity="0.9"
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
                      r="2.5"
                      fill={getActivityPathColor(activity)}
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
  }
  
  return renderCitizenMarkers();
};

export default CitizenMarkers;
