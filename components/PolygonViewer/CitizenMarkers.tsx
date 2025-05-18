import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel';
import { hoverStateService } from '@/lib/services/HoverStateService';
import { citizenAnimationService, ActivityPath, AnimatedCitizen } from '@/lib/services/CitizenAnimationService';

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
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [activityPaths, setActivityPaths] = useState<Record<string, ActivityPath[]>>({});
  const [isLoadingPaths, setIsLoadingPaths] = useState<boolean>(false);
  const [selectedCitizenPaths, setSelectedCitizenPaths] = useState<ActivityPath[]>([]);
  const [hoveredCitizenPaths, setHoveredCitizenPaths] = useState<ActivityPath[]>([]);
  // Add a new state to track all visible paths
  const [visiblePaths, setVisiblePaths] = useState<ActivityPath[]>([]);
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
  
  // Add function to calculate position along a path based on progress
  const calculatePositionAlongPath = useCallback((path: {lat: number, lng: number}[], progress: number) => {
    if (!path || path.length < 2) return null;
    
    // Calculate total path length
    let totalDistance = 0;
    const segments: {start: number, end: number, distance: number}[] = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const distance = calculateDistance(path[i], path[i+1]);
      segments.push({
        start: totalDistance,
        end: totalDistance + distance,
        distance
      });
      totalDistance += distance;
    }
    
    // Find the segment where the progress falls
    const targetDistance = progress * totalDistance;
    const segment = segments.find(seg => targetDistance >= seg.start && targetDistance <= seg.end);
    
    if (!segment) return path[0]; // Default to start if no segment found
    
    // Calculate position within the segment
    const segmentProgress = (targetDistance - segment.start) / segment.distance;
    const segmentIndex = segments.indexOf(segment);
    
    const p1 = path[segmentIndex];
    const p2 = path[segmentIndex + 1];
    
    // Interpolate between the two points
    return {
      lat: p1.lat + (p2.lat - p1.lat) * segmentProgress,
      lng: p1.lng + (p2.lng - p1.lng) * segmentProgress
    };
  }, []);
  
  // Add animation loop function
  const animateCitizens = useCallback((timestamp: number) => {
    if (!lastFrameTimeRef.current) {
      lastFrameTimeRef.current = timestamp;
      animationFrameRef.current = requestAnimationFrame(animateCitizens);
      return;
    }
    
    // Calculate time delta in seconds
    const deltaTime = (timestamp - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = timestamp;
    
    // Update each animated citizen
    setAnimatedCitizens(prev => {
      const updated = {...prev};
      let hasChanges = false;
      
      Object.keys(updated).forEach(citizenId => {
        const citizen = updated[citizenId];
        
        // Skip if no current path
        if (!citizen.currentPath || !citizen.currentPath.path || citizen.currentPath.path.length < 2) return;
        
        // Update progress based on speed and time
        const pathLength = citizen.currentPath.path.reduce((total, point, index, array) => {
          if (index === 0) return total;
          return total + calculateDistance(array[index-1], point);
        }, 0);
        
        // Calculate progress increment based on speed and path length
        const progressIncrement = (citizen.speed * deltaTime) / pathLength;
        let newProgress = citizen.progress + progressIncrement;
        
        // If path is complete, move to next path or reset
        if (newProgress >= 1) {
          // Find the next path for this citizen
          const citizenPaths = activityPaths[citizenId] || [];
          const currentPathIndex = citizenPaths.findIndex(p => p.id === citizen.currentPath?.id);
          
          if (currentPathIndex >= 0 && currentPathIndex < citizenPaths.length - 1) {
            // Move to next path
            const nextPath = citizenPaths[currentPathIndex + 1];
            updated[citizenId] = {
              ...citizen,
              currentPath: nextPath,
              progress: 0,
              pathIndex: currentPathIndex + 1
            };
          } else {
            // Reset to beginning of current path or a random path
            const randomPathIndex = Math.floor(Math.random() * citizenPaths.length);
            updated[citizenId] = {
              ...citizen,
              currentPath: citizenPaths[randomPathIndex] || null,
              progress: 0,
              pathIndex: randomPathIndex
            };
          }
        } else {
          // Update position along the path
          const newPosition = calculatePositionAlongPath(citizen.currentPath.path, newProgress);
          
          if (newPosition) {
            updated[citizenId] = {
              ...citizen,
              currentPosition: newPosition,
              progress: newProgress
            };
            hasChanges = true;
          }
        }
      });
      
      return hasChanges ? updated : prev;
    });
    
    // Continue animation loop regardless of mouse movement
    if (animationActive) {
      animationFrameRef.current = requestAnimationFrame(animateCitizens);
    }
  }, [animationActive, activityPaths, calculatePositionAlongPath]);
  
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
    console.log('Fetching recent activity paths with routes...');
    
    try {
      // Instead of fetching by citizen IDs, just get the most recent activities with paths
      const response = await fetch(`/api/activities?limit=100&hasPath=true`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.activities && Array.isArray(data.activities)) {
          // Process activities with paths
          const pathsMap: Record<string, ActivityPath[]> = {};
          const allPaths: ActivityPath[] = []; // Collect all paths in a single array
          
          data.activities.forEach((activity: any) => {
            if (activity.Path) {
              let path;
              try {
                // Parse path if it's a string
                path = typeof activity.Path === 'string' ? JSON.parse(activity.Path) : activity.Path;
                
                // Log the parsed path for debugging
                console.log(`Parsed path for activity ${activity.ActivityId || 'unknown'}, citizen ${activity.Citizen || activity.CitizenId}:`, 
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
              
                // Use Citizen (Username) field first, then fall back to CitizenId
                const citizenId = activity.Citizen || activity.CitizenId;
              
                if (!citizenId) {
                  console.warn(`Activity ${activity.ActivityId || 'unknown'} has no Citizen or CitizenId field, skipping`);
                  return;
                }
                
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
          
          console.log(`Loaded activity paths for ${Object.keys(pathsMap).length} citizens, total paths: ${allPaths.length}`);
          setActivityPaths(pathsMap);
          setVisiblePaths(allPaths); // Set all paths to be visible
          
          // Log the first few paths for debugging
          if (allPaths.length > 0) {
            console.log('Sample paths:', allPaths.slice(0, 3));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching activity paths:', error);
    } finally {
      setIsLoadingPaths(false);
    }
  };

  // Add a function to get path color based on activity type
  const getActivityPathColor = (activity: ActivityPath): string => {
    // Find the citizen for this activity
    const citizen = citizens.find(c => 
      c.username === activity.citizenId || 
      c.citizenid === activity.citizenId || 
      c.CitizenId === activity.citizenId || 
      c.id === activity.citizenId
    );
  
    if (citizen) {
      // Get the social class
      const socialClass = citizen.socialclass || citizen.SocialClass || citizen.socialClass || '';
      // Return the color based on social class
      return citizenService.getSocialClassColor(socialClass);
    }
  
    // Fallback to default colors if citizen not found
    const lowerType = activity.type.toLowerCase();
  
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
    hoverStateService.setHoveredCitizen(citizen);
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
  
  // Add an additional useEffect to update visiblePaths when activeView changes
  useEffect(() => {
    // Show paths in all views except land
    if (activeView !== 'land') {
      const allPaths = Object.values(activityPaths).flat();
      setVisiblePaths(allPaths);
      console.log(`Setting ${allPaths.length} paths as visible in ${activeView} view`);
    } else {
      // Clear paths in land view
      setVisiblePaths([]);
    }
  }, [activeView, activityPaths]);
  
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
  
  if (!isVisible || activeView === 'land') return null;
  
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
      
      {/* Activity Paths - Modified to show in all views except land */}
      {((activeView !== 'land' && visiblePaths.length > 0) || hoveredCitizenPaths.length > 0 || selectedCitizenPaths.length > 0) && (
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
            Paths: {hoveredCitizenPaths.length} hovered, {selectedCitizenPaths.length} selected, {activeView !== 'land' ? visiblePaths.length : 0} visible
          </text>
          
          {/* Animation status indicator */}
          <text x="20" y="60" fill={animationActive ? "green" : "red"} fontSize="12">
            Animation: {animationActive ? "Active" : "Paused"}
          </text>
          
          {/* Render all paths when not in land view */}
          {activeView !== 'land' && visiblePaths.map((activity) => {
            // Get the animated citizen for this path
            const animatedCitizen = Object.values(animatedCitizens).find(
              ac => ac.currentPath?.id === activity.id
            );
            
            // If this path is being animated, only show the remaining portion
            let pathToRender = activity.path;
            if (animatedCitizen && animatedCitizen.currentPath?.id === activity.id) {
              // Find the current segment
              const totalLength = activity.path.length;
              const segmentIndex = Math.floor(animatedCitizen.progress * (totalLength - 1));
              
              // Instead of including all points in the current segment,
              // just create a direct path from current position to the end of the current segment
              // and then include all remaining points
              if (segmentIndex + 1 < totalLength) {
                const currentSegmentEnd = activity.path[segmentIndex + 1];
                
                // Create a new path that starts at the current position, goes to the end of the current segment,
                // and then includes all remaining points
                pathToRender = [
                  animatedCitizen.currentPosition, 
                  currentSegmentEnd, 
                  ...activity.path.slice(segmentIndex + 2)
                ];
              } else {
                // If we're at the last segment, just show a path from current position to end
                pathToRender = [animatedCitizen.currentPosition, activity.path[totalLength - 1]];
              }
            }
            
            // Generate points string with validation
            const pointsString = pathToRender
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
                  strokeOpacity="0.6"
                  strokeDasharray="4,4"
                />
                {/* Add small circles at path endpoints only to reduce visual clutter */}
                {pathToRender.length > 0 && [
                  pathToRender[0],
                  pathToRender[pathToRender.length - 1]
                ].map((point, index) => {
                  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
                  
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`endpoint-${index}`}
                      cx={screenPos.x}
                      cy={screenPos.y}
                      r="3"
                      fill={getActivityPathColor(activity)}
                      opacity="0.7"
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
                  stroke={getActivityPathColor(activity)}
                  strokeWidth="3.5"
                  strokeOpacity="0.7"
                  strokeDasharray="6,4"
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
                      r="3.5"
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
                  strokeWidth="4.5"
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
                      r="4.5"
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
};

export default CitizenMarkers;
