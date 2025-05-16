import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel';

// Helper function to calculate distance between two geographic points using the Haversine formula
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

interface ActivityPath {
  id: string;
  citizenId: string;
  path: {lat: number, lng: number}[];
  type: string;
  startTime: string;
  endTime?: string;
}

interface AnimatedCitizen {
  citizen: any;
  currentPosition: {lat: number, lng: number};
  pathIndex: number;
  currentPath: ActivityPath | null;
  progress: number;
  speed: number; // meters per second
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
  // Add new state variables for animation
  const [animatedCitizens, setAnimatedCitizens] = useState<Record<string, AnimatedCitizen>>({});
  const [animationActive, setAnimationActive] = useState<boolean>(true);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  // Add a new state to track initialization status
  const [positionsInitialized, setPositionsInitialized] = useState<boolean>(false);
  
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
    
    // Continue animation loop
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
  
  // Toggle animation function
  const toggleAnimation = () => {
    setAnimationActive(prev => {
      const newState = !prev;
      
      if (newState && !animationFrameRef.current) {
        // Restart animation
        lastFrameTimeRef.current = 0;
        animationFrameRef.current = requestAnimationFrame(animateCitizens);
      } else if (!newState && animationFrameRef.current) {
        // Stop animation
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      return newState;
    });
  };
  
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
  
  // Function to fetch real-time positions
  const fetchRealTimePositions = async (citizenIds: string[]) => {
    try {
      // Build URL with citizen IDs
      const params = new URLSearchParams();
      citizenIds.forEach(id => params.append('citizenId', id));
      params.append('includeActivities', 'true');
      
      const response = await fetch(`/api/citizens/positions?${params.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.positions) {
          console.log(`Fetched ${data.positions.length} real-time positions`);
          
          // Update animated citizens with real-time data
          setAnimatedCitizens(prev => {
            const updated = {...prev};
            
            data.positions.forEach(positionData => {
              const { citizenId, position, activity } = positionData;
              
              // Find the citizen in our state
              const citizen = citizens.find(c => 
                c.citizenid === citizenId || 
                c.CitizenId === citizenId || 
                c.id === citizenId
              );
              
              if (citizen && position) {
                // If citizen has an active activity with a path, update their animation data
                if (activity && activity.Path) {
                  let path;
                  try {
                    path = typeof activity.Path === 'string' ? 
                      JSON.parse(activity.Path) : activity.Path;
                  } catch (e) {
                    console.warn(`Failed to parse path for citizen ${citizenId}:`, e);
                    return;
                  }
                  
                  // Calculate progress based on time
                  const startTime = new Date(activity.StartDate).getTime();
                  const endTime = new Date(activity.EndDate).getTime();
                  const currentTime = Date.now();
                  const totalDuration = endTime - startTime;
                  const progress = Math.min(1.0, Math.max(0.0, 
                    (currentTime - startTime) / totalDuration));
                  
                  // Update or create animated citizen
                  updated[citizenId] = {
                    citizen,
                    currentPosition: position,
                    pathIndex: 0,
                    currentPath: {
                      id: activity.ActivityId,
                      citizenId,
                      path,
                      type: activity.Type,
                      startTime: activity.StartDate,
                      endTime: activity.EndDate
                    },
                    progress,
                    speed: 5 // Default speed
                  };
                } else {
                  // If no active activity, just update position
                  if (updated[citizenId]) {
                    updated[citizenId].currentPosition = position;
                  } else {
                    // Create a static citizen (no animation)
                    citizen.position = position;
                  }
                }
              }
            });
            
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Error fetching real-time positions:', error);
    }
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
      
      // Get citizen IDs for real-time position updates
      const citizenIds = loadedCitizens
        .map(c => c.citizenid || c.CitizenId || c.id)
        .filter(Boolean);
      
      // Fetch real-time positions
      if (citizenIds.length > 0) {
        await fetchRealTimePositions(citizenIds);
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
    
    // Set up interval to refresh real-time positions
    const refreshInterval = setInterval(() => {
      const citizenIds = citizens
        .map(c => c.citizenid || c.CitizenId || c.id)
        .filter(Boolean);
      
      if (citizenIds.length > 0) {
        fetchRealTimePositions(citizenIds);
      }
    }, 10000); // Refresh every 10 seconds
    
    // Subscribe to events and store the subscription
    const subscription = eventBus.subscribe(EventTypes.CITIZENS_LOADED, handleCitizensLoaded);
    
    // Clean up event listeners and interval
    return () => {
      window.removeEventListener('loadCitizens', handleLoadCitizens);
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);
  
  // Add a separate effect to update paths when citizens change
  useEffect(() => {
    // This effect should run when the component mounts
    fetchActivityPaths();
  }, []);
  
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
  
  // Add effect to initialize animated citizens when paths are loaded
  useEffect(() => {
    if (Object.keys(activityPaths).length === 0) return;
    
    // Initialize animated citizens from the activity paths
    const initialAnimatedCitizens: Record<string, AnimatedCitizen> = {};
    
    Object.entries(activityPaths).forEach(([citizenId, paths]) => {
      if (paths.length === 0) return;
      
      // Find the citizen object
      const citizen = citizens.find(c => c.citizenid === citizenId || c.CitizenId === citizenId || c.id === citizenId);
      if (!citizen) return;
      
      // Find the most appropriate path based on time
      const now = new Date();
      let selectedPath: ActivityPath | null = null;
      let initialProgress = 0;
      
      // First, check for paths that are currently in progress (between start and end dates)
      for (const path of paths) {
        if (!path.path || path.path.length < 2) continue;
        
        const startTime = path.startTime ? new Date(path.startTime) : null;
        const endTime = path.endTime ? new Date(path.endTime) : null;
        
        // Skip paths without a valid start time
        if (!startTime) continue;
        
        // If the path has both start and end times, check if we're within that timeframe
        if (startTime && endTime) {
          if (now >= startTime && now <= endTime) {
            // This path is currently active - calculate progress based on elapsed time
            const totalDuration = endTime.getTime() - startTime.getTime();
            const elapsedTime = now.getTime() - startTime.getTime();
            initialProgress = Math.min(Math.max(elapsedTime / totalDuration, 0), 1);
            selectedPath = path;
            console.log(`Found active path for ${citizenId} with progress ${initialProgress.toFixed(2)}`);
            break; // Found an active path, no need to check others
          }
        } 
        // If the path only has a start time (no end time), check if it started in the last hour
        else if (startTime) {
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          if (startTime >= oneHourAgo) {
            // This path started recently - estimate progress based on typical speed
            // Assume a typical activity takes about 1 hour to complete
            const elapsedTime = now.getTime() - startTime.getTime();
            initialProgress = Math.min(Math.max(elapsedTime / (60 * 60 * 1000), 0), 1);
            selectedPath = path;
            console.log(`Found recent path for ${citizenId} with estimated progress ${initialProgress.toFixed(2)}`);
            break; // Found a recent path, no need to check others
          }
        }
      }
      
      // If no active or recent path was found, just use the first path with random progress
      if (!selectedPath && paths.length > 0) {
        selectedPath = paths[0];
        initialProgress = Math.random(); // Random progress between 0 and 1
        console.log(`Using random progress ${initialProgress.toFixed(2)} for ${citizenId} with no active paths`);
      }
      
      // Skip if no suitable path was found
      if (!selectedPath || !selectedPath.path || selectedPath.path.length < 2) return;
      
      // Calculate position based on progress
      const initialPosition = calculatePositionAlongPath(selectedPath.path, initialProgress) || selectedPath.path[0];
      
      // Random speed between 1-5 m/s (walking to running)
      // Adjust speed based on activity type - slower for work, faster for transport
      let speed = 1 + Math.random() * 4;
      if (selectedPath.type.toLowerCase().includes('work')) {
        speed = 0.5 + Math.random() * 1.5; // Slower for work activities
      } else if (selectedPath.type.toLowerCase().includes('transport')) {
        speed = 3 + Math.random() * 3; // Faster for transport activities
      }
      
      initialAnimatedCitizens[citizenId] = {
        citizen,
        currentPosition: initialPosition,
        pathIndex: paths.indexOf(selectedPath),
        currentPath: selectedPath,
        progress: initialProgress,
        speed
      };
    });
    
    setAnimatedCitizens(initialAnimatedCitizens);
    console.log(`Initialized ${Object.keys(initialAnimatedCitizens).length} animated citizens`);
    
    // Set the positions initialized flag to true
    setPositionsInitialized(true);
    
    // Start animation loop
    if (animationActive && Object.keys(initialAnimatedCitizens).length > 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(animateCitizens);
    }
    
    // Cleanup animation loop on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [activityPaths, citizens, animationActive, animateCitizens, calculatePositionAlongPath]);
  
  // Add effect to start/stop animation when view changes
  useEffect(() => {
    // Only animate in citizens view
    const shouldAnimate = activeView === 'citizens';
    setAnimationActive(shouldAnimate);
    
    if (shouldAnimate) {
      if (!animationFrameRef.current) {
        lastFrameTimeRef.current = 0;
        animationFrameRef.current = requestAnimationFrame(animateCitizens);
      }
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [activeView, animateCitizens]);
  
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
                zIndex: 50,
                position: 'absolute', // Ensure absolute positioning works
                transition: 'left 0.5s linear, top 0.5s linear' // Add smooth transition
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
        
        {/* Static Citizens (those without paths) */}
        {citizens.filter(citizen => {
          const citizenId = citizen.citizenid || citizen.CitizenId || citizen.id;
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
      
      {/* Activity Paths - Modified to show remaining portions of paths */}
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
          
          {/* Animation status indicator */}
          <text x="20" y="60" fill={animationActive ? "green" : "red"} fontSize="12">
            Animation: {animationActive ? "Active" : "Paused"}
          </text>
          
          {/* Render all paths when in citizens view */}
          {activeView === 'citizens' && visiblePaths.map((activity) => {
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
              
              // Only render from current position to end
              pathToRender = activity.path.slice(segmentIndex);
              
              // Add the current interpolated position as the first point
              const currentPosition = animatedCitizen.currentPosition;
              pathToRender = [currentPosition, ...pathToRender.slice(1)];
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
                  stroke={getActivityPathColor(activity.type)}
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                  strokeDasharray="3,3"
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
      
      {/* Animation Control Button */}
      {activeView === 'citizens' && (
        <button
          className="absolute bottom-20 left-20 bg-amber-600 text-white px-3 py-1 rounded text-sm flex items-center"
          onClick={toggleAnimation}
        >
          {animationActive ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pause Citizens
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Animate Citizens
            </>
          )}
        </button>
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
