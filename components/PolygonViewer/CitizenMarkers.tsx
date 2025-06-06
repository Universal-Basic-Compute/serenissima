import React, { useState, useEffect, useRef, useMemo, useCallback, CSSProperties } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { CoordinateService } from '@/lib/services/CoordinateService';
import CitizenDetailsPanel from '@/components/UI/CitizenDetailsPanel';
// CitizenRegistry import removed as it's handled by app/page.tsx
import { hoverStateService } from '@/lib/services/HoverStateService';
import { citizenAnimationService, AnimatedCitizen } from '@/lib/services/CitizenAnimationService';
import { ActivityPath, activityPathService } from '@/lib/services/ActivityPathService';
import ThoughtBubble from '@/components/UI/ThoughtBubble'; // Import the new component
import { HoverState, HOVER_STATE_CHANGED } from '@/lib/services/HoverStateService'; // Import HoverState and event type

interface CitizenMarkersProps {
  isVisible: boolean;
  scale: number;
  offset: { x: number, y: number };
  canvasWidth: number;
  canvasHeight: number;
  activeView?: string; // Accept any view type
  financialAspect?: 'default' | 'lease' | 'rent' | 'wages'; // Added
  financialDataRange?: { min: number, max: number } | null; // Added
  getFinancialAspectColor?: (value: number | undefined, min: number, max: number) => string; // Added
}

const CitizenMarkers: React.FC<CitizenMarkersProps> = ({ 
  isVisible, 
  scale, 
  offset,
  canvasWidth,
  canvasHeight,
  activeView = 'citizens', // Default to 'citizens'
  financialAspect = 'default', // Added default
  financialDataRange = null,   // Added default
  getFinancialAspectColor      // Added
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
  const [hoveredBuildingActivityPaths, setHoveredBuildingActivityPaths] = useState<ActivityPath[]>([]); // New state for building hover paths
  const [involvedCitizenIdsInBuildingHover, setInvolvedCitizenIdsInBuildingHover] = useState<Set<string>>(new Set()); // For scaling citizens in building hover paths
  const [hoveredBuildingOccupantUsername, setHoveredBuildingOccupantUsername] = useState<string | null>(null); // For scaling the occupant
  // Add new state variables for animation
  const [animatedCitizens, setAnimatedCitizens] = useState<Record<string, AnimatedCitizen>>({});
  const [animationActive, setAnimationActive] = useState<boolean>(true);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  // Add a new state to track initialization status
  const [positionsInitialized, setPositionsInitialized] = useState<boolean>(false);
  const [readyToRenderMarkers, setReadyToRenderMarkers] = useState<boolean>(false); // New state for render readiness
  const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

  // State for thoughts
  interface ThoughtData {
    messageId: string;
    citizenUsername: string;
    originalContent: string;
    mainThought: string;
    createdAt: string;
  }
  const [allThoughts, setAllThoughts] = useState<ThoughtData[]>([]);
  const [activeThought, setActiveThought] = useState<{
    thought: ThoughtData;
    citizenId: string; // Username of the citizen
    position: { x: number; y: number };
    socialClass: string; // Added social class for styling
  } | null>(null);
  const [isFetchingThoughts, setIsFetchingThoughts] = useState<boolean>(false);
  const thoughtCycleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const thoughtDisplayDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isThoughtBubbleHovered, setIsThoughtBubbleHovered] = useState<boolean>(false);

  const handleThoughtBubbleDurationEnd = useCallback(() => {
    // This function is intentionally empty because the thought cycle logic
    // in CitizenMarkers.useEffect (around line 450) already handles clearing activeThought
    // and scheduling the next one. This callback is primarily to satisfy
    // ThoughtBubble's prop and ensure its useEffect dependency is stable.
  }, []);

  // Define these constants outside useEffect so they are accessible in the render method
  const WPM = 120; // Words per minute for reading speed (reduced from 180)
  const MIN_DISPLAY_TIME = 6000; // Minimum 6 seconds (doubled)
  const MAX_DISPLAY_TIME = 20000; // Maximum 20 seconds (doubled)

  // Helper function to ensure a citizen object has a valid position
  const ensureCitizenPosition = (citizen: any): any => {
    const hasValidPosition = citizen.position &&
                             typeof citizen.position.lat === 'number' &&
                             typeof citizen.position.lng === 'number';
    if (hasValidPosition) {
      return citizen;
    }
    // Log if position is missing or invalid, then provide a fallback
    // console.warn(`CitizenMarkers: Citizen ${citizen.username || citizen.id || citizen.citizenid || 'Unknown ID'} missing valid position. Assigning fallback. Original:`, citizen.position);
    return {
      ...citizen,
      position: {
        lat: 45.4371 + Math.random() * 0.01, // Default/fallback latitude
        lng: 12.3326 + Math.random() * 0.01  // Default/fallback longitude
      }
    };
  };
  
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
  const fetchActivityPaths = async (forceRefresh: boolean = false, ongoing: boolean = false) => {
    setIsLoadingPaths(true);
    console.log(`Fetching activity paths using ActivityPathService (forceRefresh: ${forceRefresh}, ongoing: ${ongoing})...`);
    
    try {
      // Use the ActivityPathService to fetch paths
      const pathsMap = await activityPathService.fetchActivityPaths(forceRefresh, ongoing);
      
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
      // p.notes is now guaranteed to be a non-empty string or null by ActivityPathService
      const mostRecentPathWithNotes = sortedPaths.find(p => p.notes);
      if (mostRecentPathWithNotes) {
        latestNotes = mostRecentPathWithNotes.notes;
      } else {
        // Log if no paths with notes were found for this citizen
        console.log(`[CitizenMarkers] No paths with notes found for citizen ${citizenIdForNotes}. All paths for this citizen:`, sortedPaths.map(p => ({ id: p.id, type: p.type, startTime: p.startTime, notes: p.notes })));
      }
    } else {
      // Log if no activity paths were found at all for this citizen
      console.log(`[CitizenMarkers] No activity paths found at all for citizen ${citizenIdForNotes}.`);
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
    hoverStateService.clearHoverState(); // Explicitly clear hover state
  };
  
  useEffect(() => {
    // Load citizens when the component mounts
    const loadCitizensData = async () => {
      setIsLoading(true);
  
      if (!citizenService.isDataLoaded()) {
        await citizenService.loadCitizens();
      }
  
      const loadedCitizens = citizenService.getCitizens();
      const citizensWithGuaranteedPositions = loadedCitizens.map(ensureCitizenPosition);
      
      // Log all citizens to debug position issues
      console.log(`CitizenMarkers: All citizens (after ensuring position):`, citizensWithGuaranteedPositions);
      
      setCitizens(citizensWithGuaranteedPositions);
  
      // Add debug logging
      const citizensActuallyWithOriginalPositions = loadedCitizens.filter(c => c.position && typeof c.position.lat === 'number' && typeof c.position.lng === 'number');
      console.log(`CitizenMarkers: Loaded ${loadedCitizens.length} citizens originally.`);
      console.log(`CitizenMarkers: Citizens with guaranteed positions: ${citizensWithGuaranteedPositions.length}`);
      console.log(`CitizenMarkers: Citizens who had valid original positions: ${citizensActuallyWithOriginalPositions.length}`);
  
      // Log a sample citizen to check position format
      if (citizensWithGuaranteedPositions.length > 0) {
        console.log('CitizenMarkers: Sample citizen with guaranteed position:', citizensWithGuaranteedPositions[0].position);
      } else {
        console.warn('CitizenMarkers: No citizens found or processed.');
      }
  
      setIsLoading(false);
    };
    
    // Listen for the loadCitizens event
    const handleLoadCitizens = () => {
      loadCitizensData();
    };
    
    // Listen for citizens loaded event
    const handleCitizensLoaded = (data: any) => {
      // Ensure data.citizens is an array before setting
      if (data && Array.isArray(data.citizens)) {
        const citizensWithGuaranteedPositions = data.citizens.map(ensureCitizenPosition);
        setCitizens(citizensWithGuaranteedPositions);
      } else {
        console.warn("CitizenMarkers: CITIZENS_LOADED event received with invalid data structure. Expected data.citizens to be an array.", data);
        // Optionally, set to empty array or handle error appropriately
        // setCitizens([]); 
      }
      setIsLoading(false);
    };
    
    // Add event listeners
    window.addEventListener('loadCitizens', handleLoadCitizens);
    const citizensLoadedSubscription = eventBus.subscribe(EventTypes.CITIZENS_LOADED, handleCitizensLoaded);
    
    // Initial load
    loadCitizensData().then(() => {
      // After citizens are loaded, fetch their activity paths
      // This fetchActivityPaths() call is for the very first load.
      // Subsequent refreshes are handled by the setInterval.
      // For the main map, fetch ongoing activities.
      fetchActivityPaths(false, true); 
    });
        
    // Clean up event listeners
    return () => {
      window.removeEventListener('loadCitizens', handleLoadCitizens);
      citizensLoadedSubscription.unsubscribe();
    };
  }, []); // Keep empty to run once on mount for initial load & listener setup
  
  // This effect is for the initial fetch of activity paths.
  // It was previously duplicated. Now consolidated into the above useEffect's .then() block for initial load.
  // useEffect(() => {
  //   fetchActivityPaths();
  // }, []); // This can be removed if fetchActivityPaths is reliably called after initial citizen load.
  
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
    setReadyToRenderMarkers(false);

    if (Object.keys(activityPaths).length === 0 || citizens.length === 0) {
      if (Object.keys(animatedCitizens).length > 0) { // Only update if it's actually changing
        setAnimatedCitizens({});
      }
      if (positionsInitialized) { // Only update if it's actually changing
        setPositionsInitialized(false);
      }
      setReadyToRenderMarkers(true); 
      return;
    }
    
    // console.log('CitizenMarkers: (Re)Initializing animated citizens with paths...'); // Reduced logging
    
    const newAnimatedCitizens = citizenAnimationService.initializeAnimatedCitizens(
      citizens,
      activityPaths
    );
    
    // Only update if the new object is different from the current one to prevent loops
    if (JSON.stringify(newAnimatedCitizens) !== JSON.stringify(animatedCitizens)) {
      setAnimatedCitizens(newAnimatedCitizens);
      // console.log(`CitizenMarkers: Updated animatedCitizens. New count: ${Object.keys(newAnimatedCitizens).length}`);
    }
    
    if (!positionsInitialized) { // Only update if it's actually changing
      setPositionsInitialized(true);
    }
    setReadyToRenderMarkers(true);
    
    if (animationActive && Object.keys(newAnimatedCitizens).length > 0) {
      citizenAnimationService.startAnimation(handleAnimationUpdate);
    }
    
    return () => {
      citizenAnimationService.stopAnimation();
    };
  }, [activityPaths, citizens, animationActive, handleAnimationUpdate, positionsInitialized]); // Removed animatedCitizens from dependencies
  
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

  // Effect for periodic data refresh
  useEffect(() => {
    const refreshData = async () => {
      console.log(`CitizenMarkers: Refreshing citizen and activity data (Interval: ${REFRESH_INTERVAL / 1000}s)`);
      try {
        // Force refresh citizen data
        await citizenService.loadCitizens(true); 
        // The CITIZENS_LOADED event will be emitted by the service, 
        // and the existing event listener in this component will update the 'citizens' state.

        // Force refresh activity paths, ensuring we get ongoing ones for the map
        const pathsMap = await activityPathService.fetchActivityPaths(true, true);
        setActivityPaths(pathsMap); // Update paths state directly

        // Re-initialize animations if necessary (the existing useEffect for [activityPaths, citizens] should handle this)
        console.log('CitizenMarkers: Data refreshed. Animation service will re-initialize if data changed.');
      } catch (error) {
        console.error('CitizenMarkers: Error during periodic data refresh:', error);
      }
    };

    // Call it once initially after a short delay to ensure first load is complete
    // The initial load is already handled by other useEffect hooks.
    // This interval is purely for subsequent refreshes.
    const intervalId = setInterval(refreshData, REFRESH_INTERVAL);

    // Cleanup interval on component unmount
    return () => {
      clearInterval(intervalId);
      console.log('CitizenMarkers: Cleared data refresh interval.');
    };
  }, [REFRESH_INTERVAL]); // Empty dependency array ensures this runs once to set up the interval
  
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

  // Fetch thoughts from API
  const fetchThoughts = useCallback(async () => {
    if (isFetchingThoughts) return;
    setIsFetchingThoughts(true);
    try {
      const response = await fetch('/api/get-thoughts');
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.thoughts)) {
          setAllThoughts(data.thoughts);
          console.log(`[CitizenMarkers] Fetched ${data.thoughts.length} thoughts.`);
        } else {
          console.error('[CitizenMarkers] Failed to fetch thoughts or invalid format:', data.error);
          setAllThoughts([]);
        }
      } else {
        console.error('[CitizenMarkers] API error fetching thoughts:', response.status);
        setAllThoughts([]);
      }
    } catch (error) {
      console.error('[CitizenMarkers] Exception fetching thoughts:', error);
      setAllThoughts([]);
    } finally {
      setIsFetchingThoughts(false);
    }
  }, []); // Removed isFetchingThoughts from dependencies

  // Effect to fetch thoughts once on mount
  useEffect(() => {
    const doFetchThoughts = async () => {
      if (isFetchingThoughts) return; // Should not be necessary with useEffect once, but good guard
      setIsFetchingThoughts(true);
      try {
        const response = await fetch('/api/get-thoughts');
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.thoughts)) {
            setAllThoughts(data.thoughts);
            console.log(`[CitizenMarkers] Fetched ${data.thoughts.length} thoughts.`);
          } else {
            console.error('[CitizenMarkers] Failed to fetch thoughts or invalid format:', data.error);
            setAllThoughts([]);
          }
        } else {
          console.error('[CitizenMarkers] API error fetching thoughts:', response.status);
          setAllThoughts([]);
        }
      } catch (error) {
        console.error('[CitizenMarkers] Exception fetching thoughts:', error);
        setAllThoughts([]);
      } finally {
        setIsFetchingThoughts(false);
      }
    };

    doFetchThoughts();
  }, []); // Empty dependency array ensures this runs only once on mount.


  // Effect to manage the thought display cycle
  useEffect(() => {
    const FADE_OUT_MS_FROM_THOUGHT_BUBBLE = 1400; // Doit correspondre à FADE_OUT_MS dans ThoughtBubble.tsx

    const scheduleNextThought = () => {
      // Effacer les minuteurs précédents
      if (thoughtCycleTimeoutRef.current) {
        clearTimeout(thoughtCycleTimeoutRef.current);
      }
      if (thoughtDisplayDurationTimeoutRef.current) {
        clearTimeout(thoughtDisplayDurationTimeoutRef.current);
      }

      const randomInterval = Math.random() * 2000 + 2000; // 2-4 secondes

      thoughtCycleTimeoutRef.current = setTimeout(() => {
        // Ce bloc s'exécute après randomInterval
        if (isThoughtBubbleHovered) {
          // Si toujours survolé, replanifier la vérification, mettant en pause efficacement.
          scheduleNextThought();
          return;
        }

        if (allThoughts.length === 0 || citizens.length === 0 || !isVisible || activeView === 'land') {
          setActiveThought(null);
          scheduleNextThought(); // Replanifier si les conditions ne sont pas remplies
          return;
        }

        // Choisir une pensée aléatoire pour un citoyen visible
        const potentialCitizenUsernames = citizens.map(c => c.username).filter(username => username);
        
        const thoughtsForPotentialCitizens = allThoughts.filter(t => 
          potentialCitizenUsernames.includes(t.citizenUsername)
        );

        if (thoughtsForPotentialCitizens.length === 0) {
          setActiveThought(null);
          scheduleNextThought(); // Reschedule if no suitable thoughts
          return;
        }
        
        const randomThought = thoughtsForPotentialCitizens[Math.floor(Math.random() * thoughtsForPotentialCitizens.length)];
        
        // Find the citizen from the main citizens list
        const citizenForThought = citizens.find(c => c.username === randomThought.citizenUsername);

        if (citizenForThought) {
          // Determine current position: prioritize animated, fallback to static
          const animatedCitizenData = animatedCitizens[randomThought.citizenUsername];
          const currentCitizenPosition = animatedCitizenData 
            ? animatedCitizenData.currentPosition 
            : citizenForThought.position;

          if (!currentCitizenPosition) {
            // Should not happen if ensureCitizenPosition works, but as a safeguard
            setActiveThought(null);
            scheduleNextThought();
            return;
          }

          const screenPos = latLngToScreen(currentCitizenPosition.lat, currentCitizenPosition.lng);

          // Check if citizen is roughly on screen
           if (screenPos.x < -50 || screenPos.x > canvasWidth + 50 || 
              screenPos.y < -100 || screenPos.y > canvasHeight + 50) {
            setActiveThought(null); // Citizen not visible
            scheduleNextThought();
            return;
          }

          setActiveThought({
            thought: randomThought,
            citizenId: randomThought.citizenUsername,
            position: screenPos,
            socialClass: citizenForThought.socialClass || 'Popolani', // Pass social class
          });

          const wordCount = randomThought.mainThought.split(/\s+/).length;
          let displayDuration = Math.max(MIN_DISPLAY_TIME, (wordCount / WPM) * 60 * 1000 * 3); // Reading speed 1.5x slower (original * 1.5, so 2 * 1.5 = 3)
          displayDuration = Math.min(displayDuration, MAX_DISPLAY_TIME);

          // Ce minuteur est pour la fin de la durée d'affichage naturelle de la pensée actuelle.
          thoughtDisplayDurationTimeoutRef.current = setTimeout(() => {
            if (!isThoughtBubbleHovered) {
              setActiveThought(null); // Effacer la pensée actuelle
              scheduleNextThought();  // Planifier le prochain cycle de pensée
            }
            // Si survolé, la pensée reste active. Le cycle reprendra via le useEffect principal lors du dé-survol.
          }, displayDuration);

        } else {
          setActiveThought(null); // Citoyen non trouvé ou pas de position
          scheduleNextThought();
        }
      }, randomInterval);
    };

    if (isVisible && activeView !== 'land') {
      if (!isThoughtBubbleHovered) {
        scheduleNextThought(); // Démarrer/reprendre le cycle si non survolé
      } else {
        // Est survolé : mettre en pause le cycle en effaçant les minuteurs.
        // activeThought reste, donc la bulle reste.
        if (thoughtCycleTimeoutRef.current) clearTimeout(thoughtCycleTimeoutRef.current);
        if (thoughtDisplayDurationTimeoutRef.current) clearTimeout(thoughtDisplayDurationTimeoutRef.current);
      }
    } else { // Non visible ou vue 'land'
      setActiveThought(null);
      if (thoughtCycleTimeoutRef.current) clearTimeout(thoughtCycleTimeoutRef.current);
      if (thoughtDisplayDurationTimeoutRef.current) clearTimeout(thoughtDisplayDurationTimeoutRef.current);
    }

    return () => { // Nettoyage
      if (thoughtCycleTimeoutRef.current) clearTimeout(thoughtCycleTimeoutRef.current);
      if (thoughtDisplayDurationTimeoutRef.current) clearTimeout(thoughtDisplayDurationTimeoutRef.current);
    };
  }, [allThoughts, citizens, isVisible, activeView, latLngToScreen, canvasWidth, canvasHeight, WPM, MIN_DISPLAY_TIME, MAX_DISPLAY_TIME, isThoughtBubbleHovered]);
  
  // Update activeThought position if the citizen moves
  useEffect(() => {
    if (activeThought && animatedCitizens[activeThought.citizenId]) {
      const newPos = animatedCitizens[activeThought.citizenId].currentPosition;
      const newScreenPos = latLngToScreen(newPos.lat, newPos.lng);
      if (Math.abs(newScreenPos.x - activeThought.position.x) > 1 || Math.abs(newScreenPos.y - activeThought.position.y) > 1) {
        setActiveThought(prev => prev ? { ...prev, position: newScreenPos } : null);
      }
    } else if (activeThought) { // For static citizens, their position doesn't change via animation service
        const staticCitizen = citizens.find(c => c.username === activeThought.citizenId);
        if (staticCitizen && staticCitizen.position) {
            const screenPos = latLngToScreen(staticCitizen.position.lat, staticCitizen.position.lng);
             if (Math.abs(screenPos.x - activeThought.position.x) > 1 || Math.abs(screenPos.y - activeThought.position.y) > 1) {
                setActiveThought(prev => prev ? { ...prev, position: screenPos } : null);
            }
        }
    }
  }, [animatedCitizens, activeThought, latLngToScreen, citizens]);

  // Effect to handle hover state changes for buildings and update related activity paths
  useEffect(() => {
    const handleHoverChange = (hoverState: HoverState) => {
      if (hoverState.type === 'building' && hoverState.id) {
        const buildingId = hoverState.id;
        const allActivities = Object.values(activityPaths).flat();
        const buildingPaths = allActivities.filter(
          act => (act.fromBuilding === buildingId || act.toBuilding === buildingId)
        );
        setHoveredBuildingActivityPaths(buildingPaths);
        setHoveredBuildingOccupantUsername(hoverState.data?.occupant || null); // Set occupant
        // console.log(`[CitizenMarkers] Hovering building ${buildingId}, found ${buildingPaths.length} related paths. Occupant: ${hoverState.data?.occupant}`);
      } else if (hoverState.type !== 'building') {
        // If the hover is no longer on a building, clear building-specific paths and occupant
        setHoveredBuildingActivityPaths([]);
        setHoveredBuildingOccupantUsername(null);
      }
    };

    const subscription = eventBus.subscribe(HOVER_STATE_CHANGED, handleHoverChange);
    return () => {
      subscription.unsubscribe();
    };
  }, [activityPaths]); // Re-filter if activityPaths data changes

  // Effect to update the set of involved citizen IDs when building hover paths or occupant change
  useEffect(() => {
    const ids = new Set<string>();
    if (hoveredBuildingActivityPaths.length > 0) {
      hoveredBuildingActivityPaths.forEach(path => ids.add(path.citizenId));
    }
    if (hoveredBuildingOccupantUsername) {
      ids.add(hoveredBuildingOccupantUsername);
    }
    setInvolvedCitizenIdsInBuildingHover(ids);
  }, [hoveredBuildingActivityPaths, hoveredBuildingOccupantUsername]);


  // The logic for showing a local CitizenRegistry and its button has been removed.
  // CitizenRegistry is now handled as a modal by app/page.tsx.
  
  if (!isVisible || activeView === 'land') return null;
  
  // Helper function to render citizen markers
  function renderCitizenMarkers() {
    // If not ready to render (e.g., during a refresh cycle), show an updating message or return null
    if (!readyToRenderMarkers) {
      return (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg animate-pulse">
          Updating citizen positions...
        </div>
      );
    }

    // If positions are initialized but there are no citizens to show (e.g. after filtering or no data)
    if (positionsInitialized && citizens.length === 0 && Object.keys(animatedCitizens).length === 0) {
        // Optionally, display a "No citizens to display" message or return null
        // For now, returning null to keep it clean if no citizens.
        return null; 
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
          const citizenId = citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id; // Use username first for ID check
          const isCitizenInvolvedInBuildingHover = involvedCitizenIdsInBuildingHover.has(citizenId);

          const socialClassRaw = (citizen.socialclass || citizen.SocialClass || citizen.socialClass || 'Citizen').trim();
          let socialClassForIcon = socialClassRaw || 'Citizen'; // Fallback for empty string after trim
          if (socialClassForIcon) { // Normalize to PascalCase
            socialClassForIcon = socialClassForIcon.charAt(0).toUpperCase() + socialClassForIcon.slice(1).toLowerCase();
            if (socialClassRaw.includes('Dei') || socialClassRaw.includes('dei')) { // Preserve multi-word names like ConsiglioDeiDieci
                socialClassForIcon = socialClassRaw;
            }
          }
          const iconFilename = `${socialClassForIcon}.png`;
          const iconSrc = `/images/icons/${iconFilename}`;
          const fallbackIconSrc = '/images/icons/Citizen.png';

          const getInitialsColor = (socialClass: string): string => {
            switch (socialClass.toLowerCase()) {
              case 'nobili': return '#FF6347'; // Tomato (Light Red)
              case 'cittadini': return '#ADD8E6'; // Light Blue
              case 'popolani': return '#FFC107'; // Amber (Brighter Gold/Orange)
              case 'forestieri': return '#90EE90'; // Light Green
              case 'facchini': return '#2F4F4F'; // DarkSlateGray (Almost Black)
              default: return '#FFFFFF'; // White
            }
          };
          const initialsColor = getInitialsColor(socialClassForIcon);

          return (
            <div 
              key={citizenId || `citizen-${Math.random()}`}
              className="absolute pointer-events-auto"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 19, // Increased z-index
                position: 'absolute', // Ensure absolute positioning works
                transition: 'none' // Remove transition to avoid lag
              }}
              onClick={() => handleCitizenClick(citizen)}
              onMouseEnter={() => handleCitizenHover(citizen)}
              onMouseLeave={handleCitizenLeave}
            >
              <div 
                className={`w-5 h-5 cursor-pointer hover:scale-200 transition-transform flex items-center justify-center relative ${
                  isCitizenInvolvedInBuildingHover ? 'scale-150' : '' // Apply scale if citizen is involved
                } `} // Removed rounded-full, ring classes, and shadow-md
                style={{ 
                  // backgroundColor is removed
                  // border: '1px solid white', // Removed white border
                  // boxShadow is removed, will be handled by filter on img
                }}
                title={`${firstName} ${lastName} (${socialClassRaw})${ // Use socialClassRaw for animated citizens
                  citizen.username === currentUsername ? ' - This is you' : 
                  citizen.worksFor === currentUsername ? ' - Works for you' : ''
                }`}
              >
                <img
                  src={iconSrc}
                  alt={`${socialClassForIcon} icon`}
                  className="w-full h-full object-contain" // Use object-contain to maintain aspect ratio
                  style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.5))' }} // Adjusted drop-shadow for more emphasis
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== fallbackIconSrc) { // Avoid infinite loop if default also fails
                      target.src = fallbackIconSrc;
                      target.alt = `${socialClassForIcon} (icon missing, fallback to Citizen)`;
                    }
                  }}
                />
                <span
                  className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none" // Adjusted font size
                  style={{ color: initialsColor, textShadow: '0px 0px 1px rgba(0,0,0,0.6)' }} 
                >
                  {firstName?.[0]?.toUpperCase() || ''}{lastName?.[0]?.toUpperCase() || ''}
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
          const originalPos = citizen.position;
          const position = latLngToScreen(citizen.position.lat, citizen.position.lng);
          
          if (Math.random() < 0.05) {
            const firstName = citizen.firstname || citizen.FirstName || '';
            const lastName = citizen.lastname || citizen.LastName || '';
            const displayName = firstName || lastName ? 
              `${firstName} ${lastName}`.trim() : 
              `Citizen ${citizen.citizenid || citizen.CitizenId || citizen.id || 'unknown'}`;
          }
          
          if (position.x < -100 || position.x > canvasWidth + 100 || 
              position.y < -100 || position.y > canvasHeight + 100) {
            return null;
          }
          
          const firstName = citizen.firstname || citizen.FirstName || citizen.firstName || '';
          const lastName = citizen.lastname || citizen.LastName || citizen.lastName || '';
          const socialClassRawStatic = (citizen.socialclass || citizen.SocialClass || citizen.socialClass || 'Citizen').trim();
          const citizenId = citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id;
          const isCitizenInvolvedInBuildingHover = involvedCitizenIdsInBuildingHover.has(citizenId);

          let socialClassForIcon = socialClassRawStatic || 'Citizen';
          if (socialClassForIcon) { // Normalize to PascalCase
            socialClassForIcon = socialClassForIcon.charAt(0).toUpperCase() + socialClassForIcon.slice(1).toLowerCase();
            if (socialClassRawStatic.includes('Dei') || socialClassRawStatic.includes('dei')) { // Preserve multi-word names
                socialClassForIcon = socialClassRawStatic;
            }
          }
          const iconFilename = `${socialClassForIcon}.png`;
          const iconSrc = `/images/icons/${iconFilename}`;
          const fallbackIconSrc = '/images/icons/Citizen.png';

          const getInitialsColor = (socialClass: string): string => {
            switch (socialClass.toLowerCase()) {
              case 'nobili': return '#FF6347'; // Tomato (Light Red)
              case 'cittadini': return '#ADD8E6'; // Light Blue
              case 'popolani': return '#FFC107'; // Amber (Brighter Gold/Orange)
              case 'forestieri': return '#90EE90'; // Light Green
              case 'facchini': return '#2F4F4F'; // DarkSlateGray (Almost Black)
              default: return '#FFFFFF'; // White
            }
          };
          const initialsColor = getInitialsColor(socialClassForIcon);
          
          return (
            <div 
              key={citizenId || `citizen-${Math.random()}`}
              className="absolute pointer-events-auto"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                transform: 'translate(-50%, -50%)',
                zIndex: 19,
                position: 'absolute',
                transition: 'none'
              }}
              onClick={() => handleCitizenClick(citizen)}
              onMouseEnter={() => handleCitizenHover(citizen)}
              onMouseLeave={handleCitizenLeave}
            >
              <div 
                className={`w-5 h-5 cursor-pointer hover:scale-200 transition-transform flex items-center justify-center relative ${
                  isCitizenInvolvedInBuildingHover ? 'scale-150' : ''
                } `} // Removed rounded-full, ring classes, and shadow-md
                style={{ 
                  // border: '1px solid white', // Removed white border
                  // boxShadow is removed, will be handled by filter on img
                }}
                title={`${firstName} ${lastName} (${socialClassRawStatic})${ // Changed socialClass to socialClassRawStatic
                  citizen.username === currentUsername ? ' - This is you' : 
                  citizen.worksFor === currentUsername ? ' - Works for you' : ''
                }`}
              >
                <img
                  src={iconSrc}
                  alt={`${socialClassForIcon} icon`}
                  className="w-full h-full object-contain"
                  style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.5))' }} // Adjusted drop-shadow for more emphasis
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== fallbackIconSrc) {
                      target.src = fallbackIconSrc;
                      target.alt = `${socialClassForIcon} (icon missing, fallback to Citizen)`;
                    }
                  }}
                />
                <span
                  className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none" // Adjusted font size
                  style={{ color: initialsColor, textShadow: '0px 0px 1px rgba(0,0,0,0.6)' }} 
                >
                  {firstName?.[0]?.toUpperCase() || ''}{lastName?.[0]?.toUpperCase() || ''}
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
      {/* Activity Paths - Show merchant_galley paths always, others on hover/selection */}
      {(Object.keys(activityPaths).length > 0) && (
        <svg 
          className="absolute inset-0 pointer-events-none" 
          style={{ 
            zIndex: 10, 
            width: canvasWidth, 
            height: canvasHeight,
            overflow: 'visible' // Add this to ensure paths aren't clipped
          }}
        >
          
          {/* Render always-visible merchant galley paths */}
          {Object.values(activityPaths).flat().filter(activity => activity.transportMode === "merchant_galley").map((activity) => {
            if (!activity || !Array.isArray(activity.path) || activity.path.length === 0) {
              return null;
            }
            const validPoints = activity.path.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
            if (validPoints.length === 0) return null;

            const pointsString = validPoints
              .map(point => { const screenPos = latLngToScreen(point.lat, point.lng); return `${screenPos.x},${screenPos.y}`; })
              .join(' ');
            
            return (
              <g key={`${activity.id}-merchant-galley`}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity)} // Or a specific color for merchant galleys
                  strokeWidth="4.0" // Twice as bold
                  strokeOpacity="0.5" // Reduced opacity
                />
                {validPoints.map((point, index) => {
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`mg-point-${index}`}
                      cx={screenPos.x}
                      cy={screenPos.y}
                      r="3" // Slightly larger points for bold paths
                      fill={getActivityPathColor(activity)}
                      opacity="0.9"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Render paths for selected citizen (if not a merchant galley path) */}
          {selectedCitizenPaths.filter(activity => activity.transportMode !== "merchant_galley").map((activity) => {
            if (!activity || !Array.isArray(activity.path) || activity.path.length === 0) {
              return null;
            }
            const validPoints = activity.path.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
            if (validPoints.length === 0) return null;

            const pointsString = validPoints
              .map(point => { const screenPos = latLngToScreen(point.lat, point.lng); return `${screenPos.x},${screenPos.y}`; })
              .join(' ');

            return (
              <g key={`${activity.id}-selected`}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity)}
                  strokeWidth="2.5"
                  strokeOpacity="0.9"
                />
                {validPoints.map((point, index) => {
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`sel-point-${index}`}
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

          {/* Render paths for hovered citizen (if not merchant galley and not already selected) */}
          {hoveredCitizenPaths.filter(activity => 
            activity.transportMode !== "merchant_galley" && 
            !selectedCitizenPaths.find(selActivity => selActivity.id === activity.id)
          ).map((activity) => {
            if (!activity || !Array.isArray(activity.path) || activity.path.length === 0) {
              return null;
            }
            const validPoints = activity.path.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
            if (validPoints.length === 0) return null;

            const pointsString = validPoints
              .map(point => { const screenPos = latLngToScreen(point.lat, point.lng); return `${screenPos.x},${screenPos.y}`; })
              .join(' ');

            return (
              <g key={`${activity.id}-hovered`}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity)}
                  strokeWidth="2.0"
                  strokeOpacity="0.7"
                />
                {validPoints.map((point, index) => {
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`hov-point-${index}`}
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

          {/* Render paths for hovered building (if not merchant galley and not already shown for selected/hovered citizen) */}
          {hoveredBuildingActivityPaths.filter(activity =>
            activity.transportMode !== "merchant_galley" &&
            !selectedCitizenPaths.find(selActivity => selActivity.id === activity.id) &&
            !hoveredCitizenPaths.find(hovActivity => hovActivity.id === activity.id)
          ).map((activity) => {
            if (!activity || !Array.isArray(activity.path) || activity.path.length === 0) {
              return null;
            }
            const validPoints = activity.path.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
            if (validPoints.length === 0) return null;

            const pointsString = validPoints
              .map(point => { const screenPos = latLngToScreen(point.lat, point.lng); return `${screenPos.x},${screenPos.y}`; })
              .join(' ');

            return (
              <g key={`${activity.id}-building-hover`}>
                <polyline 
                  points={pointsString}
                  fill="none"
                  stroke={getActivityPathColor(activity)} // Using same color logic for now
                  strokeWidth="2.0" // Style similar to hovered citizen paths
                  strokeOpacity="0.7"
                />
                {validPoints.map((point, index) => {
                  const screenPos = latLngToScreen(point.lat, point.lng);
                  return (
                    <circle 
                      key={`bld-hov-point-${index}`}
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
        </svg>
      )}
      
      
      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
           Welcoming the Citizens of La Serenissima…
        </div>
      )}
      
      {isLoadingPaths && (
        <div className="absolute top-32 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
          Tracing the Citizens' Routes...
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

      {/* Thought Bubble */}
      {activeThought && activeThought.thought && activeThought.socialClass && (
        <ThoughtBubble
          mainThought={activeThought.thought.mainThought}
          originalContent={activeThought.thought.originalContent}
          citizenPosition={activeThought.position}
          socialClass={activeThought.socialClass}
          isVisible={!!activeThought}
          onDurationEnd={handleThoughtBubbleDurationEnd}
          displayDuration={ // Calculer la durée en fonction de la longueur du texte
            Math.min(MAX_DISPLAY_TIME, Math.max(MIN_DISPLAY_TIME, (activeThought.thought.mainThought.split(/\s+/).length / WPM) * 60 * 1000 * 3))
          }
          onBubbleMouseEnter={() => setIsThoughtBubbleHovered(true)}
          onBubbleMouseLeave={() => setIsThoughtBubbleHovered(false)}
          isHovered={isThoughtBubbleHovered}
        />
      )}
    </>
  );
  }
  
  return renderCitizenMarkers();
};

export default CitizenMarkers;
