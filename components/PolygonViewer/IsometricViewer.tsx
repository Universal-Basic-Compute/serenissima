'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { eventBus, EventTypes } from '@/lib/eventBus';
import { fetchCoatOfArmsImage } from '@/app/utils/coatOfArmsUtils';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';
import LandDetailsPanel from './LandDetailsPanel';
import BuildingDetailsPanel from './BuildingDetailsPanel';
import CitizenDetailsPanel from '../UI/CitizenDetailsPanel';

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
}

// Define a type for all possible view types to use throughout the component
type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';

export default function IsometricViewer({ activeView }: IsometricViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, any>>({});
  const [scale, setScale] = useState(3); // Start with a 3x zoom for a closer view
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [buildings, setBuildings] = useState<any[]>([]);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [minIncome, setMinIncome] = useState<number>(0);
  const [maxIncome, setMaxIncome] = useState<number>(1000);
  const [incomeDataLoaded, setIncomeDataLoaded] = useState<boolean>(false);
  const [ownerCoatOfArmsMap, setOwnerCoatOfArmsMap] = useState<Record<string, string>>({});
  const [coatOfArmsImages, setCoatOfArmsImages] = useState<Record<string, HTMLImageElement>>({});
  const [loadingCoatOfArms, setLoadingCoatOfArms] = useState<boolean>(false);
  const [hoveredPolygonId, setHoveredPolygonId] = useState<string | null>(null);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [showLandDetailsPanel, setShowLandDetailsPanel] = useState<boolean>(false);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [showBuildingDetailsPanel, setShowBuildingDetailsPanel] = useState<boolean>(false);
  const [mousePosition, setMousePosition] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [polygonsToRender, setPolygonsToRender] = useState<{
    polygon: any;
    coords: {x: number, y: number}[];
    fillColor: string;
    centroidX: number;
    centroidY: number;
    centerX: number;
    centerY: number;
  }[]>([]);
  const [emptyBuildingPoints, setEmptyBuildingPoints] = useState<{lat: number, lng: number}[]>([]);
  
  // Function to load citizens data - declared early to avoid reference before declaration
  const loadCitizens = useCallback(async () => {
    try {
      console.log('Loading citizens data...');
      const response = await fetch('/api/citizens');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setCitizens(data);
          
          // Group citizens by building
          const byBuilding: Record<string, any[]> = {};
          
          data.forEach(citizen => {
            // Add to home building
            if (citizen.Home) {
              if (!byBuilding[citizen.Home]) {
                byBuilding[citizen.Home] = [];
              }
              byBuilding[citizen.Home].push({
                ...citizen,
                markerType: 'home'
              });
            }
            
            // Add to work building
            if (citizen.Work) {
              if (!byBuilding[citizen.Work]) {
                byBuilding[citizen.Work] = [];
              }
              byBuilding[citizen.Work].push({
                ...citizen,
                markerType: 'work'
              });
            }
          });
          
          setCitizensByBuilding(byBuilding);
          setCitizensLoaded(true);
          console.log(`Loaded ${data.length} citizens in ${Object.keys(byBuilding).length} buildings`);
        }
      }
    } catch (error) {
      console.error('Error loading citizens:', error);
    }
  }, []);
  
  // Citizen-related state
  const [citizens, setCitizens] = useState<any[]>([]);
  const [citizensByBuilding, setCitizensByBuilding] = useState<Record<string, any[]>>({});
  const [citizensLoaded, setCitizensLoaded] = useState<boolean>(false);
  const [hoveredCitizenBuilding, setHoveredCitizenBuilding] = useState<string | null>(null);
  const [hoveredCitizenType, setHoveredCitizenType] = useState<'home' | 'work' | null>(null);
  const [selectedCitizen, setSelectedCitizen] = useState<any>(null);
  const [showCitizenDetailsPanel, setShowCitizenDetailsPanel] = useState<boolean>(false);
  
  // State for dock and bridge points
  const [hoveredCanalPoint, setHoveredCanalPoint] = useState<{lat: number, lng: number} | null>(null);
  const [hoveredBridgePoint, setHoveredBridgePoint] = useState<{lat: number, lng: number} | null>(null);
  
  // Transport route planning state
  const [transportMode, setTransportMode] = useState<boolean>(false);
  const [transportStartPoint, setTransportStartPoint] = useState<{lat: number, lng: number} | null>(null);
  const [transportEndPoint, setTransportEndPoint] = useState<{lat: number, lng: number} | null>(null);
  const [transportPath, setTransportPath] = useState<any[]>([]);
  const [calculatingPath, setCalculatingPath] = useState<boolean>(false);
  const [gondolaPositions, setGondolaPositions] = useState<{x: number, y: number, angle: number}[]>([]);
  const gondolaAnimationRef = useRef<number | null>(null);

  // Load polygons
  useEffect(() => {
    fetch('/api/get-polygons')
      .then(response => response.json())
      .then(data => {
        if (data.polygons) {
          setPolygons(data.polygons);
          
          // Store in window for other components
          if (typeof window !== 'undefined') {
            window.__polygonData = data.polygons;
          }
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading polygons:', error);
        setLoading(false);
      });
  }, []);
  
  // Handle transport mode activation
  useEffect(() => {
    const handleShowTransportRoutes = () => {
      console.log('Activating transport route planning mode');
      
      // Force the active view to be 'transport' first
      if (activeView !== 'transport') {
        console.log('Switching to transport view');
        window.dispatchEvent(new CustomEvent('switchToTransportView', {
          detail: { view: 'transport' }
        }));
      }
      
      // Set a small timeout to ensure view has changed before activating transport mode
      setTimeout(() => {
        setTransportMode(true);
        setTransportStartPoint(null);
        setTransportEndPoint(null);
        setTransportPath([]);
        console.log('Transport mode state set to:', true);
      }, 100);
    };
    
    window.addEventListener('showTransportRoutes', handleShowTransportRoutes);
    
    return () => {
      window.removeEventListener('showTransportRoutes', handleShowTransportRoutes);
    };
  }, [activeView]);
  
  // Add useEffect to animate gondolas
  useEffect(() => {
    if (transportPath.length > 0 && transportMode) {
      // Find all gondola segments
      const gondolaSegments: {start: any, end: any}[] = [];

      for (let i = 0; i < transportPath.length - 1; i++) {
        if (transportPath[i].transportMode === 'gondola') {
          gondolaSegments.push({
            start: transportPath[i],
            end: transportPath[i + 1]
          });
        }
      }

      if (gondolaSegments.length > 0) {
        // Initialize gondola positions
        const initialPositions = gondolaSegments.map(segment => {
          const x1 = (segment.start.lng - 12.3326) * 20000;
          const y1 = (segment.start.lat - 45.4371) * 20000;
          const x2 = (segment.end.lng - 12.3326) * 20000;
          const y2 = (segment.end.lat - 45.4371) * 20000;

          // Calculate angle
          const angle = Math.atan2(y2 - y1, x2 - x1);

          return {
            x: x1,
            y: y1,
            targetX: x2,
            targetY: y2,
            progress: Math.random(), // Start at random positions along the path
            speed: 0.0001 + (Math.random() * 0.00005), // Slightly different speeds
            angle
          };
        });

        // Start animation
        let lastTime = performance.now();
        
        const animateGondolas = (time: number) => {
          const deltaTime = time - lastTime;
          lastTime = time;

          // Update gondola positions
          const newPositions = initialPositions.map(gondola => {
            // Update progress based on individual gondola speed
            gondola.progress += deltaTime * gondola.speed;

            if (gondola.progress > 1) {
              gondola.progress = 0;
            }

            // Calculate new position
            const x = gondola.x + (gondola.targetX - gondola.x) * gondola.progress;
            const y = gondola.y + (gondola.targetY - gondola.y) * gondola.progress;

            return {
              x,
              y,
              angle: gondola.angle
            };
          });

          setGondolaPositions(newPositions);
          gondolaAnimationRef.current = requestAnimationFrame(animateGondolas);
        };

        gondolaAnimationRef.current = requestAnimationFrame(animateGondolas);

        return () => {
          if (gondolaAnimationRef.current) {
            cancelAnimationFrame(gondolaAnimationRef.current);
          }
        };
      }
    }
  }, [transportPath, transportMode]);
  
  // Fetch income data
  const fetchIncomeData = useCallback(async () => {
    try {
      console.log('Fetching income data...');
      setIncomeDataLoaded(false); // Reset to false when starting to fetch
      
      const response = await fetch('/api/get-income-data');
      if (response.ok) {
        const data = await response.json();
        if (data.incomeData && Array.isArray(data.incomeData)) {
          // Create a map of polygon ID to income
          const incomeMap: Record<string, number> = {};
          let min = Infinity;
          let max = -Infinity;
          
          data.incomeData.forEach((item: any) => {
            if (item.polygonId && typeof item.income === 'number') {
              incomeMap[item.polygonId] = item.income;
              min = Math.min(min, item.income);
              max = Math.max(max, item.income);
            }
          });
          
          // Set min/max income values (with reasonable defaults if needed)
          setMinIncome(min !== Infinity ? min : 0);
          setMaxIncome(max !== -Infinity ? max : 1000);
          setIncomeData(incomeMap);
          setIncomeDataLoaded(true); // Set to true when data is loaded
          console.log(`Income data loaded: ${Object.keys(incomeMap).length} entries, min=${min}, max=${max}`);
        }
      }
    } catch (error) {
      console.error('Error fetching income data:', error);
    }
  }, []);
  
  // Fetch coat of arms data
  useEffect(() => {
    const fetchCoatOfArms = async () => {
      try {
        setLoadingCoatOfArms(true);
        const response = await fetch('/api/get-coat-of-arms');
        if (response.ok) {
          const data = await response.json();
          if (data.coatOfArms && typeof data.coatOfArms === 'object') {
            setOwnerCoatOfArmsMap(data.coatOfArms);
            
            // Preload images
            const imagePromises: Promise<void>[] = [];
            const newImages: Record<string, HTMLImageElement> = {};
            
            Object.entries(data.coatOfArms).forEach(([owner, url]) => {
              if (url) {
                // Create an array of URLs to try in order
                const urlsToTry = [
                  // 1. Use the URL from the API directly
                  url as string,
                  
                  // 2. Try with serenissima.ai domain
                  `https://serenissima.ai/coat-of-arms/${owner}.png`,
                  
                  // 3. Try with current origin as fallback
                  `${window.location.origin}/coat-of-arms/${owner}.png`
                ];
                
                console.log(`Will try these URLs for ${owner}:`, urlsToTry);
                
                // Create a promise that tries each URL in sequence
                const tryLoadImage = async (): Promise<HTMLImageElement> => {
                  for (let i = 0; i < urlsToTry.length; i++) {
                    try {
                      const currentUrl = urlsToTry[i];
                      console.log(`Trying URL ${i + 1}/${urlsToTry.length} for ${owner}: ${currentUrl}`);
                      
                      const img = new Image();
                      img.crossOrigin = "anonymous"; // Important for CORS
                      
                      // Create a promise for this specific URL
                      const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
                        img.onload = () => {
                          console.log(`Successfully loaded coat of arms for ${owner} from ${currentUrl}`);
                          resolve(img);
                        };
                        img.onerror = () => {
                          console.warn(`Failed to load coat of arms for ${owner} from ${currentUrl}`);
                          reject(new Error(`Failed to load image from ${currentUrl}`));
                        };
                        img.src = currentUrl;
                      });
                      
                      // Wait for this URL to load or fail
                      return await loadPromise;
                    } catch (error) {
                      // If we're at the last URL and it failed, throw the error
                      if (i === urlsToTry.length - 1) {
                        throw error;
                      }
                      // Otherwise continue to the next URL
                    }
                  }
                  
                  // This should never be reached due to the throw above, but TypeScript needs it
                  throw new Error("All URLs failed to load");
                };
                
                // Add the promise to our array
                const imagePromise = tryLoadImage()
                  .then(img => {
                    newImages[owner] = img;
                  })
                  .catch(error => {
                    console.error(`All URLs failed for ${owner}:`, error);
                    // We'll handle this case in the createDefaultCircularAvatar function
                  });
                
                imagePromises.push(imagePromise);
              }
            });
            
            // Wait for all images to either load or fail
            await Promise.allSettled(imagePromises);
            setCoatOfArmsImages(newImages);
          }
        }
      } catch (error) {
        console.error('Error fetching coat of arms:', error);
      } finally {
        setLoadingCoatOfArms(false);
      }
    };
    
    fetchCoatOfArms();
  }, []);
  
  // Function to create a circular clipping of an image
  const createCircularImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) => {
    // Check if the image has loaded successfully
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.warn(`Image not loaded properly, using default avatar instead`);
      // Use the default avatar as fallback
      createDefaultCircularAvatar(ctx, "Unknown", x, y, size);
      return;
    }
    
    try {
      // Save the current context state
      ctx.save();
      
      // Create a circular clipping path
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      
      // Add a white border around the circle
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Clip to the circle
      ctx.clip();
      
      // Calculate dimensions to maintain aspect ratio
      let drawWidth = size;
      let drawHeight = size;
      let offsetX = 0;
      let offsetY = 0;
      
      if (img.width > img.height) {
        // Landscape image
        drawHeight = (img.height / img.width) * size;
        offsetY = (size - drawHeight) / 2;
      } else if (img.height > img.width) {
        // Portrait image
        drawWidth = (img.width / img.height) * size;
        offsetX = (size - drawWidth) / 2;
      }
      
      // Draw the image with proper aspect ratio
      ctx.drawImage(img, x - (drawWidth / 2) + offsetX, y - (drawHeight / 2) + offsetY, drawWidth, drawHeight);
      
      // Restore the context state
      ctx.restore();
    } catch (error) {
      console.error('Error drawing circular image:', error);
      // If drawing fails, use default avatar
      ctx.restore(); // Restore context before trying again
      createDefaultCircularAvatar(ctx, "Error", x, y, size);
    }
  };
  
  // Function to create a default circular avatar for owners without coat of arms
  const createDefaultCircularAvatar = (ctx: CanvasRenderingContext2D, owner: string, x: number, y: number, size: number) => {
    // Save the current context state
    ctx.save();
    
    // Generate a deterministic color based on the owner name
    const getColorFromString = (str: string): string => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Generate a hue between 0 and 360
      const hue = Math.abs(hash) % 360;
      
      // Use a fixed saturation and lightness for better visibility
      return `hsl(${hue}, 70%, 60%)`;
    };
    
    // Get a color based on the owner name
    const baseColor = getColorFromString(owner);
    
    // Draw a circular background
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    
    // Add a white border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add the owner's initials
    ctx.font = `bold ${size * 0.4}px Arial`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get the first letter of the owner name
    const initial = owner.charAt(0).toUpperCase();
    ctx.fillText(initial, x, y);
    
    // Restore the context state
    ctx.restore();
  };
  
  // Fetch income data when in land view
  useEffect(() => {
    if (activeView === 'land') {
      fetchIncomeData();
    }
  }, [activeView, fetchIncomeData]);

  // Fetch land owners
  useEffect(() => {
    const fetchLandOwners = async () => {
      try {
        const response = await fetch('/api/get-land-owners');
        if (response.ok) {
          const data = await response.json();
          if (data.lands && Array.isArray(data.lands)) {
            const ownersMap: Record<string, string> = {};
            data.lands.forEach((land: any) => {
              if (land.id && land.owner) {
                ownersMap[land.id] = land.owner;
              }
            });
            setLandOwners(ownersMap);
          }
        }
      } catch (error) {
        console.error('Error fetching land owners:', error);
      }
    };
    
    fetchLandOwners();
  }, []);

  // Load users data
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/users`);
        
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data)) {
            const usersMap: Record<string, any> = {};
            data.forEach(user => {
              if (user.user_name) {
                usersMap[user.user_name] = user;
              }
            });
            
            // Ensure ConsiglioDeiDieci is always present
            if (!usersMap['ConsiglioDeiDieci']) {
              usersMap['ConsiglioDeiDieci'] = {
                user_name: 'ConsiglioDeiDieci',
                color: '#8B0000', // Dark red
                coat_of_arms_image: null
              }
            }
            
            setUsers(usersMap);
          }
        }
      } catch (error) {
        console.warn('Error loading users data:', error);
        
        // Create a default ConsiglioDeiDieci user as fallback
        const fallbackUsers = {
          'ConsiglioDeiDieci': {
            user_name: 'ConsiglioDeiDieci',
            color: '#8B0000', // Dark red
            coat_of_arms_image: null
          }
        };
        
        setUsers(fallbackUsers);
      }
    };
    
    loadUsers();
  }, []);

  // Load buildings if in buildings view
  useEffect(() => {
    if (activeView === 'buildings') {
      const fetchBuildings = async () => {
        try {
          // First, ensure building points are loaded
          if (!buildingPointsService.isPointsLoaded()) {
            await buildingPointsService.loadBuildingPoints();
          }
          
          const response = await fetch('/api/buildings');
          if (response.ok) {
            const data = await response.json();
            if (data.buildings) {
              // Process buildings to ensure they all have position data
              const processedBuildings = data.buildings.map((building: any) => {
                // If building already has a position, use it
                if (building.position && building.position.lat && building.position.lng) {
                  return building;
                }
                
                // If building has a point_id but no position, try to get position from the service
                if (building.point_id) {
                  const position = buildingPointsService.getPositionForPoint(building.point_id);
                  if (position) {
                    return {
                      ...building,
                      position
                    };
                  }
                }
                
                // If we couldn't resolve a position, return the building as is
                return building;
              });
              
              setBuildings(processedBuildings);
            }
          }
        } catch (error) {
          console.error('Error fetching buildings:', error);
        }
      };
      
      fetchBuildings();
      
      // Set up interval to refresh buildings
      const interval = setInterval(fetchBuildings, 30000);
      
      return () => clearInterval(interval);
    }
  }, [activeView]);
  
  
  
  
  // Load citizens if in citizens view
  useEffect(() => {
    if (activeView === 'citizens') {
      loadCitizens();
    }
  }, [activeView, loadCitizens]);
  
  // Check image paths when citizens are loaded
  const checkImagePaths = async () => {
    console.log('Checking image paths...');
    
    // Check if the citizens directory exists
    try {
      const response = await fetch('/images/citizens/default.jpg', { method: 'HEAD' });
      console.log(`Default image check: ${response.ok ? 'EXISTS' : 'NOT FOUND'} (${response.status})`);
    } catch (error) {
      console.error('Error checking default image:', error);
    }
    
    // Check a few citizen images
    if (citizens.length > 0) {
      for (let i = 0; i < Math.min(5, citizens.length); i++) {
        const citizen = citizens[i];
        const imageUrl = citizen.ImageUrl || `/images/citizens/${citizen.CitizenId}.jpg`;
        
        // Try multiple possible paths for each citizen
        const urlsToTry = [
          imageUrl,
          `/images/citizens/${citizen.CitizenId}.jpg`,
          `/images/citizens/${citizen.CitizenId}.png`,
          `/images/citizens/default.jpg`
        ];
        
        for (const url of urlsToTry) {
          try {
            const response = await fetch(url, { method: 'HEAD' });
            console.log(`Citizen ${citizen.CitizenId} image check: ${url} - ${response.ok ? 'EXISTS' : 'NOT FOUND'} (${response.status})`);
            if (response.ok) break; // Stop checking if we found a working URL
          } catch (error) {
            console.error(`Error checking image for citizen ${citizen.CitizenId} at ${url}:`, error);
          }
        }
      }
    }
  };
  
  // Call image path check when citizens are loaded
  useEffect(() => {
    if (activeView === 'citizens' && citizensLoaded) {
      checkImagePaths();
    }
  }, [activeView, citizensLoaded, citizens]);
  
  
  // Listen for loadCitizens event
  useEffect(() => {
    const handleLoadCitizens = () => {
      console.log('Received loadCitizens event in IsometricViewer');
      loadCitizens();
    };
    
    window.addEventListener('loadCitizens', handleLoadCitizens);
    
    return () => {
      window.removeEventListener('loadCitizens', handleLoadCitizens);
    };
  }, [loadCitizens]);
  
  // Identify empty building points when in buildings view
  useEffect(() => {
    if (activeView === 'buildings' && polygons.length > 0 && buildings.length > 0) {
      // Collect all building points from all polygons
      const allBuildingPoints: {lat: number, lng: number}[] = [];
      
      polygons.forEach(polygon => {
        if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
          polygon.buildingPoints.forEach(point => {
            if (point && typeof point === 'object' && 'lat' in point && 'lng' in point) {
              allBuildingPoints.push({
                lat: point.lat,
                lng: point.lng
              });
            }
          });
        }
      });
      
      // Check which building points don't have buildings on them
      const emptyPoints = allBuildingPoints.filter(point => {
        // Check if there's no building at this point
        return !buildings.some(building => {
          if (!building.position) return false;
          
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              return false;
            }
          } else {
            position = building.position;
          }
          
          // Check if position matches the building point
          // Use a small threshold for floating point comparison
          const threshold = 0.0001;
          if ('lat' in position && 'lng' in position) {
            return Math.abs(position.lat - point.lat) < threshold && 
                   Math.abs(position.lng - point.lng) < threshold;
          }
          return false;
        });
      });
      
      setEmptyBuildingPoints(emptyPoints);
    } else {
      setEmptyBuildingPoints([]);
    }
  }, [activeView, polygons, buildings]);

  // Handle mouse wheel for zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.01;
      // Change the minimum zoom to 1.0 to allow one more level of unzoom
      // Keep the maximum zoom at 10.8
      setScale(prevScale => Math.max(1.0, Math.min(10.8, prevScale + delta)));
    };
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel);
    }
    
    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  // Handle mouse events for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Emit map transformation events for other components to sync with
  useEffect(() => {
    // Create a function to emit the current map transformation state
    const emitMapTransform = () => {
      window.dispatchEvent(new CustomEvent('mapTransformed', {
        detail: {
          offset,
          scale,
          rotation: 0, // Add rotation if implemented
          tilt: 0 // Add tilt if implemented
        }
      }));
    };
    
    // Emit on any transformation change
    emitMapTransform();
    
    // Also listen for requests for the current transformation
    const handleRequestTransform = () => {
      emitMapTransform();
    };
    
    window.addEventListener('requestMapTransform', handleRequestTransform);
    
    return () => {
      window.removeEventListener('requestMapTransform', handleRequestTransform);
    };
  }, [offset, scale]);

  // Get color based on income using a gradient with softer, Renaissance-appropriate colors
  // Income is normalized by building points count for better comparison
  const getIncomeColor = (income: number | undefined): string => {
    if (income === undefined) return '#E8DCC0'; // Softer parchment color for no data
    
    // Normalize income to a 0-1 scale
    const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
    
    // Create a gradient from soft blue (low) to muted gold (medium) to terracotta red (high)
    // These colors are more appropriate for Renaissance Venice
    if (normalizedIncome <= 0.5) {
      // Soft blue to muted gold (0-0.5)
      const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
      const r = Math.floor(102 + t * (204 - 102)); // 102 to 204
      const g = Math.floor(153 + t * (178 - 153)); // 153 to 178
      const b = Math.floor(204 - t * (204 - 102)); // 204 to 102
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Muted gold to terracotta red (0.5-1)
      const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1 to 0-1
      const r = Math.floor(204 + t * (165 - 204)); // 204 to 165
      const g = Math.floor(178 - t * (178 - 74)); // 178 to 74
      const b = Math.floor(102 - t * (102 - 42)); // 102 to 42
      return `rgb(${r}, ${g}, ${b})`;
    }
  };
  
  // Add this useEffect for mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Always update mouse position regardless of other hover states
      setMousePosition({ x: mouseX, y: mouseY });
      
      // Log mouse position when in transport mode
      if (transportMode) {
        console.log('Mouse position in transport mode:', { x: mouseX, y: mouseY });
      }
      
      // Only process hover detection in land view or buildings view
      if (activeView !== 'land' && activeView !== 'buildings') {
        // Reset hover states if not in land or buildings view
        if (hoveredPolygonId) {
          setHoveredPolygonId(null);
        }
        if (hoveredBuildingId) {
          setHoveredBuildingId(null);
        }
        canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        return;
      }
      
      if (isDragging) return; // Skip hover detection while dragging
      
      // Check if mouse is over any polygon (for land view)
      if (activeView === 'land') {
        let hoveredId = null;
        for (const { polygon, coords } of polygonsToRender) {
          if (isPointInPolygon(mouseX, mouseY, coords)) {
            hoveredId = polygon.id;
            canvas.style.cursor = 'pointer';
            break;
          }
        }
        
        if (!hoveredId) {
          canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
        
        setHoveredPolygonId(hoveredId);
      }
      
      // Check if mouse is over any building (for buildings view)
      if (activeView === 'buildings') {
        let foundHoveredBuilding = false;
    
        // Calculate building positions and check if mouse is over any
        for (const building of buildings) {
          if (!building.position) continue;
      
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              continue;
            }
          } else {
            position = building.position;
          }
      
          // Convert lat/lng to isometric coordinates
          let x, y;
          if ('lat' in position && 'lng' in position) {
            x = (position.lng - 12.3326) * 20000;
            y = (position.lat - 45.4371) * 20000;
          } else if ('x' in position && 'z' in position) {
            x = position.x;
            y = position.z;
          } else {
            continue;
          }
      
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
      
          // Get building size
          const size = getBuildingSize(building.type);
          // Increase the hit area by 20% to make it easier to hover
          const squareSize = Math.max(size.width, size.depth) * scale * 0.6 * 1.2;
      
          // Check if mouse is over this building using a more generous hit area
          if (
            mouseX >= isoPos.x - squareSize/2 &&
            mouseX <= isoPos.x + squareSize/2 &&
            mouseY >= isoPos.y - squareSize/2 &&
            mouseY <= isoPos.y + squareSize/2
          ) {
            foundHoveredBuilding = true;
        
            // Only update state if it's a different building
            if (hoveredBuildingId !== building.id) {
              console.log('HOVER DETECTED! Setting hoveredBuildingId to:', building.id);
              setHoveredBuildingId(building.id);
              canvas.style.cursor = 'pointer';
              console.log('Hovering over building:', building.id, building.type);
            }
            break; // Break after finding the first hovered building
          }
        }
        
        // Check if mouse is over any empty building point
        if (!foundHoveredBuilding) {
          for (const point of emptyBuildingPoints) {
            // Convert lat/lng to isometric coordinates
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;
          
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
          
            // Check if mouse is over this building point
            const pointSize = 2.8 * scale;
            if (
              mouseX >= isoPos.x - pointSize && 
              mouseX <= isoPos.x + pointSize && 
              mouseY >= isoPos.y - pointSize && 
              mouseY <= isoPos.y + pointSize
            ) {
              foundHoveredBuilding = true;
              canvas.style.cursor = 'pointer';
              break;
            }
          }
        }
  
        // If no building is hovered, clear the hover state
        if (!foundHoveredBuilding && hoveredBuildingId !== null) {
          console.log('No building hovered, clearing hoveredBuildingId');
          setHoveredBuildingId(null);
          canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
      
        // Check if mouse is over any dock point
        let foundHoveredCanalPoint = false;
      
        for (const polygon of polygons) {
          if (foundHoveredCanalPoint) break;
        
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
            
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
            
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
            
              // Check if mouse is over this dock point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                foundHoveredCanalPoint = true;
                setHoveredCanalPoint(point.edge);
                canvas.style.cursor = 'pointer';
                break;
              }
            }
          }
        }
      
        if (!foundHoveredCanalPoint && hoveredCanalPoint !== null) {
          setHoveredCanalPoint(null);
        }
      
        // Check if mouse is over any bridge point
        let foundHoveredBridgePoint = false;
      
        for (const polygon of polygons) {
          if (foundHoveredBridgePoint) break;
        
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
            
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
            
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
            
              // Check if mouse is over this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                foundHoveredBridgePoint = true;
                setHoveredBridgePoint(point.edge);
                canvas.style.cursor = 'pointer';
                break;
              }
            }
          }
        }
      
        if (!foundHoveredBridgePoint && hoveredBridgePoint !== null) {
          setHoveredBridgePoint(null);
        }
      } else if (hoveredBuildingId !== null) {
        // If not in buildings view, ensure building hover state is cleared
        setHoveredBuildingId(null);
      }
      
      // Check if mouse is over any citizen marker (for citizens view)
      if (activeView === 'citizens' as ViewType) {
        let foundHoveredCitizen = false;
        
        // Check each building with citizens
        for (const [buildingId, buildingCitizens] of Object.entries(citizensByBuilding)) {
          // Find the building position
          const position = findBuildingPosition(buildingId);
          if (!position) continue;
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if mouse is over the home marker
            const homeX = position.x - 15;
            const homeY = position.y;
            const homeRadius = homeCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - homeX, 2) + Math.pow(mouseY - homeY, 2)) <= homeRadius) {
              foundHoveredCitizen = true;
              setHoveredCitizenBuilding(buildingId);
              setHoveredCitizenType('home');
              canvas.style.cursor = 'pointer';
              break;
            }
          }
          
          // Check work citizens
          const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
          if (workCitizens.length > 0) {
            // Check if mouse is over the work marker
            const workX = position.x + 15;
            const workY = position.y;
            const workRadius = workCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - workX, 2) + Math.pow(mouseY - workY, 2)) <= workRadius) {
              foundHoveredCitizen = true;
              setHoveredCitizenBuilding(buildingId);
              setHoveredCitizenType('work');
              canvas.style.cursor = 'pointer';
              break;
            }
          }
        }
        
        // If no citizen is hovered, reset the hover state
        if (!foundHoveredCitizen && (hoveredCitizenBuilding !== null || hoveredCitizenType !== null)) {
          setHoveredCitizenBuilding(null);
          setHoveredCitizenType(null);
          canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
      }
    };
    
    const handleClick = (e: MouseEvent) => {
      if (isDragging) return; // Skip click handling while dragging
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      console.log('Click detected at:', { x: mouseX, y: mouseY });
      console.log('Current mode:', { activeView, transportMode });
      
      // Handle transport mode clicks - make sure this is the first condition checked
      if (activeView === 'transport' && transportMode) {
        console.log('Transport mode click detected');
        // Convert screen coordinates to lat/lng
        const point = screenToLatLng(mouseX, mouseY, scale, offset, canvas.width, canvas.height);
        
        if (!transportStartPoint) {
          // First click - set start point
          setTransportStartPoint(point);
          console.log('Transport start point set:', point);
        } else if (!transportEndPoint) {
          // Second click - set end point and calculate route
          setTransportEndPoint(point);
          console.log('Transport end point set:', point);
          
          // Calculate route
          calculateTransportRoute(transportStartPoint, point);
        } else {
          // Third click - reset and start over
          setTransportStartPoint(point);
          setTransportEndPoint(null);
          setTransportPath([]);
          console.log('Transport route reset, new start point:', point);
        }
        
        return; // Skip other click handling when in transport mode
      }
      
      // Handle clicks in land view
      if (activeView === 'land') {
        // Check if click is on any polygon
        for (const { polygon, coords } of polygonsToRender) {
          if (isPointInPolygon(mouseX, mouseY, coords)) {
            // Set the selected polygon and show details panel
            setSelectedPolygonId(polygon.id);
            setShowLandDetailsPanel(true);
            
            // Dispatch an event for other components to respond to
            window.dispatchEvent(new CustomEvent('showLandDetailsPanel', {
              detail: { polygonId: polygon.id }
            }));
            
            return;
          }
        }
        
        // If click is not on any polygon, deselect
        setSelectedPolygonId(null);
      }
      
      // Handle clicks in buildings view
      if (activeView === 'buildings') {
        // Check if click is on any building
        for (const building of buildings) {
          if (!building.position) continue;
          
          let position;
          if (typeof building.position === 'string') {
            try {
              position = JSON.parse(building.position);
            } catch (e) {
              continue;
            }
          } else {
            position = building.position;
          }
          
          // Convert lat/lng to isometric coordinates
          let x, y;
          if ('lat' in position && 'lng' in position) {
            x = (position.lng - 12.3326) * 20000;
            y = (position.lat - 45.4371) * 20000;
          } else if ('x' in position && 'z' in position) {
            x = position.x;
            y = position.z;
          } else {
            continue;
          }
          
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
          
          // Get building size
          const size = getBuildingSize(building.type);
          const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
          
          // Check if click is on this building
          if (
            mouseX >= isoPos.x - squareSize/2 &&
            mouseX <= isoPos.x + squareSize/2 &&
            mouseY >= isoPos.y - squareSize/2 &&
            mouseY <= isoPos.y + squareSize/2
          ) {
            // Set the selected building and show details panel
            setSelectedBuildingId(building.id);
            setShowBuildingDetailsPanel(true);
            
            // Dispatch an event for other components to respond to
            window.dispatchEvent(new CustomEvent('showBuildingDetailsPanel', {
              detail: { buildingId: building.id }
            }));
            
            return;
          }
        }
        
        // Check if click is on any empty building point
        for (const point of emptyBuildingPoints) {
          // Convert lat/lng to isometric coordinates
          const x = (point.lng - 12.3326) * 20000;
          const y = (point.lat - 45.4371) * 20000;
          
          const isoPos = {
            x: calculateIsoX(x, y, scale, offset, canvas.width),
            y: calculateIsoY(x, y, scale, offset, canvas.height)
          };
          
          // Check if click is on this building point
          const pointSize = 2.8 * scale;
          if (
            mouseX >= isoPos.x - pointSize && 
            mouseX <= isoPos.x + pointSize && 
            mouseY >= isoPos.y - pointSize && 
            mouseY <= isoPos.y + pointSize
          ) {
            console.log('Building point clicked at position:', point);
                
            // Store the selected building point in window for the BuildingMenu to use
            window.__selectedBuildingPoint = {
              pointId: `point-${point.lat}-${point.lng}`,
              polygonId: findPolygonIdForPoint(point),
              position: point
            };
                
            console.log('Dispatching buildingPointClick event with data:', { position: point });
                
            // Dispatch an event to open the building menu at this position
            const event = new CustomEvent('buildingPointClick', {
              detail: { position: point }
            });
            window.dispatchEvent(event);
                
            console.log('buildingPointClick event dispatched');
                
            // Deselect any selected building
            setSelectedBuildingId(null);
                
            return;
          }
        }
        
        // If click is not on any building, deselect
        setSelectedBuildingId(null);
      }
      
      // Check if click is on any dock point
      if (activeView === 'buildings') {
        let canalPointClicked = false;
        
        for (const polygon of polygons) {
          if (canalPointClicked) break;
          
          if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
            for (const point of polygon.canalPoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
              
              // Check if click is on this dock point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                console.log('Dock point clicked at position:', point.edge);
                
                // Store the selected point in window for the BuildingMenu to use
                window.__selectedBuildingPoint = {
                  pointId: `dock-${point.edge.lat}-${point.edge.lng}`,
                  polygonId: findPolygonIdForPoint(point.edge),
                  position: point.edge,
                  pointType: 'canal'
                };
                
                // Dispatch an event to open the building menu at this position
                window.dispatchEvent(new CustomEvent('buildingPointClick', {
                  detail: { 
                    position: point.edge,
                    pointType: 'canal'
                  }
                }));
                
                // Deselect any selected building
                setSelectedBuildingId(null);
                
                canalPointClicked = true;
                break;
              }
            }
          }
        }
        
        if (canalPointClicked) return;
        
        // Check if click is on any bridge point
        let bridgePointClicked = false;
        
        for (const polygon of polygons) {
          if (bridgePointClicked) break;
          
          if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
            for (const point of polygon.bridgePoints) {
              if (!point.edge) continue;
              
              // Convert lat/lng to isometric coordinates
              const x = (point.edge.lng - 12.3326) * 20000;
              const y = (point.edge.lat - 45.4371) * 20000;
              
              const isoPos = {
                x: calculateIsoX(x, y, scale, offset, canvas.width),
                y: calculateIsoY(x, y, scale, offset, canvas.height)
              };
              
              // Check if click is on this bridge point
              const pointSize = 2 * scale;
              if (
                mouseX >= isoPos.x - pointSize && 
                mouseX <= isoPos.x + pointSize && 
                mouseY >= isoPos.y - pointSize && 
                mouseY <= isoPos.y + pointSize
              ) {
                console.log('Bridge point clicked at position:', point.edge);
                
                // Store the selected point in window for the BuildingMenu to use
                window.__selectedBuildingPoint = {
                  pointId: `bridge-${point.edge.lat}-${point.edge.lng}`,
                  polygonId: findPolygonIdForPoint(point.edge),
                  position: point.edge,
                  pointType: 'bridge'
                };
                
                // Dispatch an event to open the building menu at this position
                window.dispatchEvent(new CustomEvent('buildingPointClick', {
                  detail: { 
                    position: point.edge,
                    pointType: 'bridge'
                  }
                }));
                
                // Deselect any selected building
                setSelectedBuildingId(null);
                
                bridgePointClicked = true;
                break;
              }
            }
          }
        }
        
        if (bridgePointClicked) return;
      }
      
      // Handle clicks in citizens view
      if (activeView === 'citizens') {
        // Check each building with citizens
        for (const [buildingId, buildingCitizens] of Object.entries(citizensByBuilding)) {
          // Find the building position
          const position = findBuildingPosition(buildingId);
          if (!position) continue;
          
          // Check home citizens
          const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
          if (homeCitizens.length > 0) {
            // Check if click is on the home marker
            const homeX = position.x - 15;
            const homeY = position.y;
            const homeRadius = homeCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - homeX, 2) + Math.pow(mouseY - homeY, 2)) <= homeRadius) {
              // If there's only one citizen, show details
              if (homeCitizens.length === 1) {
                setSelectedCitizen(homeCitizens[0]);
                setShowCitizenDetailsPanel(true);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${homeCitizens.length} residents at building ${buildingId}`);
                // For now, just show the first citizen
                setSelectedCitizen(homeCitizens[0]);
                setShowCitizenDetailsPanel(true);
              }
              return;
            }
          }
          
          // Check work citizens
          const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
          if (workCitizens.length > 0) {
            // Check if click is on the work marker
            const workX = position.x + 15;
            const workY = position.y;
            const workRadius = workCitizens.length > 1 ? 25 : 20;
            
            if (Math.sqrt(Math.pow(mouseX - workX, 2) + Math.pow(mouseY - workY, 2)) <= workRadius) {
              // If there's only one citizen, show details
              if (workCitizens.length === 1) {
                setSelectedCitizen(workCitizens[0]);
                setShowCitizenDetailsPanel(true);
              } else {
                // For multiple citizens, show a selection dialog
                console.log(`${workCitizens.length} workers at building ${buildingId}`);
                // For now, just show the first citizen
                setSelectedCitizen(workCitizens[0]);
                setShowCitizenDetailsPanel(true);
              }
              return;
            }
          }
        }
        
        // If click is not on any citizen marker, deselect
        setSelectedCitizen(null);
        setShowCitizenDetailsPanel(false);
      }
    };
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [polygonsToRender, buildings, isDragging, activeView, hoveredPolygonId, hoveredBuildingId, scale]);

  // Helper function to check if a point is inside a polygon
  function isPointInPolygon(x: number, y: number, polygon: {x: number, y: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  // Helper function to convert screen coordinates to lat/lng
  const screenToLatLng = (
    screenX: number, 
    screenY: number, 
    currentScale: number, 
    currentOffset: {x: number, y: number}, 
    canvasWidth: number, 
    canvasHeight: number
  ): {lat: number, lng: number} => {
    // Reverse the isometric projection
    const x = (screenX - canvasWidth / 2 - currentOffset.x) / currentScale;
    const y = -(screenY - canvasHeight / 2 - currentOffset.y) / (currentScale * 1.4);
    
    // Convert back to lat/lng
    const lng = x / 20000 + 12.3326;
    const lat = y / 20000 + 45.4371;
    
    return { lat, lng };
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
  
  // Function to calculate the transport route
  const calculateTransportRoute = async (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    try {
      setCalculatingPath(true);
      console.log('Calculating transport route from', start, 'to', end);
      
      const response = await fetch('/api/transport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startPoint: start,
          endPoint: end
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Transport route calculated:', data);
        
        if (data.success && data.path) {
          setTransportPath(data.path);
        } else {
          console.error('Failed to calculate route:', data.error);
          // Show error to user
          alert(`Could not find a route: ${data.error || 'Unknown error'}`);
          // Reset end point to allow trying again
          setTransportEndPoint(null);
        }
      } else {
        console.error('API error:', response.status);
        alert('Error calculating route. Please try again.');
        setTransportEndPoint(null);
      }
    } catch (error) {
      console.error('Error calculating transport route:', error);
      alert('Error calculating route. Please try again.');
      setTransportEndPoint(null);
    } finally {
      setCalculatingPath(false);
    }
  };
  
  // Function to find building position
  const findBuildingPosition = (buildingId: string): {x: number, y: number} | null => {
    // First check if any building in the buildings array matches
    const building = buildings.find(b => b.id === buildingId);
    if (building && building.position) {
      let position;
      if (typeof building.position === 'string') {
        try {
          position = JSON.parse(building.position);
        } catch (e) {
          return null;
        }
      } else {
        position = building.position;
      }
      
      // Convert lat/lng to isometric coordinates
      let x, y;
      if ('lat' in position && 'lng' in position) {
        x = (position.lng - 12.3326) * 20000;
        y = (position.lat - 45.4371) * 20000;
      } else if ('x' in position && 'z' in position) {
        x = position.x;
        y = position.z;
      } else {
        return null;
      }
      
      return {
        x: calculateIsoX(x, y, scale, offset, canvasRef.current?.width || 0),
        y: calculateIsoY(x, y, scale, offset, canvasRef.current?.height || 0)
      };
    }
    
    // If not found in buildings, check building points in polygons
    for (const polygon of polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        const buildingPoint = polygon.buildingPoints.find((bp: any) => 
          bp.BuildingId === buildingId || 
          bp.buildingId === buildingId || 
          bp.id === buildingId
        );
        
        if (buildingPoint) {
          // Convert lat/lng to isometric coordinates
          const x = (buildingPoint.lng - 12.3326) * 20000;
          const y = (buildingPoint.lat - 45.4371) * 20000;
          
          return {
            x: calculateIsoX(x, y, scale, offset, canvasRef.current?.width || 0),
            y: calculateIsoY(x, y, scale, offset, canvasRef.current?.height || 0)
          };
        }
      }
    }
    
    return null;
  };
  
  // Function to create a citizen marker
  const createCitizenMarker = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    citizen: any, 
    markerType: 'home' | 'work',
    size: number = 20,
    isHovered: boolean = false
  ) => {
    // Log citizen data for debugging
    console.log(`Creating citizen marker for:`, {
      citizenId: citizen.CitizenId || citizen.id,
      name: `${citizen.FirstName || citizen.firstName || ''} ${citizen.LastName || citizen.lastName || ''}`,
      imageUrl: citizen.ImageUrl || citizen.profileImage,
      socialClass: citizen.SocialClass || citizen.socialClass,
      markerType
    });

    // Determine color based on social class
    const getSocialClassColor = (socialClass: string): string => {
      const baseClass = socialClass?.toLowerCase() || '';
      
      // Base colors for different social classes
      if (baseClass.includes('nobili')) {
        // Gold/yellow for nobility
        return markerType === 'home' 
          ? (isHovered ? 'rgba(255, 215, 0, 0.9)' : 'rgba(218, 165, 32, 0.8)')
          : (isHovered ? 'rgba(255, 215, 0, 0.9)' : 'rgba(218, 165, 32, 0.8)');
      } else if (baseClass.includes('cittadini')) {
        // Blue for citizens
        return markerType === 'home' 
          ? (isHovered ? 'rgba(70, 130, 180, 0.9)' : 'rgba(70, 130, 180, 0.8)')
          : (isHovered ? 'rgba(70, 130, 180, 0.9)' : 'rgba(70, 130, 180, 0.8)');
      } else if (baseClass.includes('popolani')) {
        // Brown/amber for common people
        return markerType === 'home' 
          ? (isHovered ? 'rgba(205, 133, 63, 0.9)' : 'rgba(205, 133, 63, 0.8)')
          : (isHovered ? 'rgba(205, 133, 63, 0.9)' : 'rgba(205, 133, 63, 0.8)');
      } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
        // Gray for laborers
        return markerType === 'home' 
          ? (isHovered ? 'rgba(128, 128, 128, 0.9)' : 'rgba(128, 128, 128, 0.8)')
          : (isHovered ? 'rgba(128, 128, 128, 0.9)' : 'rgba(128, 128, 128, 0.8)');
      }
      
      // Default colors if social class is unknown or not matched
      return markerType === 'home' 
        ? (isHovered ? 'rgba(120, 170, 255, 0.9)' : 'rgba(100, 150, 255, 0.8)')
        : (isHovered ? 'rgba(255, 170, 120, 0.9)' : 'rgba(255, 150, 100, 0.8)');
    };

    // Get color based on social class
    const fillColor = getSocialClassColor(citizen.SocialClass || citizen.socialClass);

    // Draw a circular background with color based on social class
    ctx.beginPath();
    ctx.arc(x, y, size + (isHovered ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    
    // Add a white border, thicker when hovered
    ctx.strokeStyle = isHovered ? '#FFFF00' : '#FFFFFF';
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.stroke();
    
    // Add the citizen's initials
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get the first letters of the first and last name
    const firstInitial = (citizen.FirstName || citizen.firstName || '').charAt(0).toUpperCase();
    const lastInitial = (citizen.LastName || citizen.lastName || '').charAt(0).toUpperCase();
    ctx.fillText(firstInitial + lastInitial, x, y);
    
    // Add a small icon to indicate home or work
    const iconSize = size / 2;
    const iconX = x + size - iconSize / 2;
    const iconY = y - size + iconSize / 2;
  
    // Draw the icon background
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconSize, 0, Math.PI * 2);
    ctx.fillStyle = markerType === 'home' ? '#4b70e2' : '#e27a4b';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();
  
    // Draw icon symbol - house for home, tools for work
    if (markerType === 'home') {
      // Draw a house icon instead of just the letter 'H'
      ctx.fillStyle = '#FFFFFF';
    
      // Calculate house dimensions based on icon size
      const houseWidth = iconSize * 0.8;
      const houseHeight = iconSize * 0.6;
      const roofHeight = iconSize * 0.4;
    
      // Draw the roof (triangle)
      ctx.beginPath();
      ctx.moveTo(iconX - houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
      ctx.lineTo(iconX, iconY - houseHeight/2 - roofHeight/2);
      ctx.lineTo(iconX + houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
      ctx.closePath();
      ctx.fill();
    
      // Draw the house body (rectangle)
      ctx.fillRect(
        iconX - houseWidth/2, 
        iconY - houseHeight/2 + roofHeight/2, 
        houseWidth, 
        houseHeight
      );
    
      // Draw a small door
      ctx.fillStyle = '#4b70e2'; // Same as background color
      const doorWidth = houseWidth * 0.4;
      const doorHeight = houseHeight * 0.6;
      ctx.fillRect(
        iconX - doorWidth/2,
        iconY - houseHeight/2 + roofHeight/2 + houseHeight - doorHeight,
        doorWidth,
        doorHeight
      );
    } else {
      // For work, keep the 'W' text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${iconSize * 0.8}px Arial`;
      ctx.fillText('W', iconX, iconY);
    }
  };

  // Define isometric projection functions at the component level
  const calculateIsoX = (x: number, y: number, currentScale: number, currentOffset: {x: number, y: number}, canvasWidth: number) => {
    return x * currentScale + canvasWidth / 2 + currentOffset.x; // Correct east-west orientation
  };
  
  const calculateIsoY = (x: number, y: number, currentScale: number, currentOffset: {x: number, y: number}, canvasHeight: number) => {
    return (-y) * currentScale * 1.4 + canvasHeight / 2 + currentOffset.y; // Multiply by 1.4 to stretch vertically
  };

  // Draw the isometric view
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    // Debug logging for hover state
    if (hoveredBuildingId) {
      console.log('Drawing with hoveredBuildingId:', hoveredBuildingId);
    }
    
    // Reset hover and selection state when switching away from land view
    if (activeView !== 'land') {
      if (hoveredPolygonId) setHoveredPolygonId(null);
      if (selectedPolygonId) setSelectedPolygonId(null);
      if (showLandDetailsPanel) setShowLandDetailsPanel(false);
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Create local shorthand functions that use the current state values
    const isoX = (x: number, y: number) => calculateIsoX(x, y, scale, offset, canvas.width);
    const isoY = (x: number, y: number) => calculateIsoY(x, y, scale, offset, canvas.height);
    
    // Draw water background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Collect all polygons and their data for rendering
    const newPolygonsToRender = [];

    // Process all polygons first
    polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      
      // Get polygon owner color or income-based color
      let fillColor = '#FFF5D0'; // Default sand color
      if (activeView === 'land') {
        if (incomeDataLoaded && polygon.id && incomeData[polygon.id] !== undefined) {
          // Use income-based color in land view ONLY if income data is loaded
          fillColor = getIncomeColor(incomeData[polygon.id]);
        } else if (polygon.id && landOwners[polygon.id]) {
          // Use owner color in land view
          const owner = landOwners[polygon.id];
          const user = users[owner];
          if (user && user.color) {
            fillColor = user.color;
          }
        }
      }
      // For other views, keep the default yellow color
      
      // Convert lat/lng to isometric coordinates
      const coords = polygon.coordinates.map((coord: {lat: number, lng: number}) => {
        // Normalize coordinates relative to center of Venice
        // Scale factor adjusted to make the map more readable
        const x = (coord.lng - 12.3326) * 20000;
        const y = (coord.lat - 45.4371) * 20000; // Remove the 0.7 factor here since we're applying it in the projection
        
        return {
          x: isoX(x, y),
          y: isoY(x, y)
        };
      });
      
      // Use the polygon's center property if available, otherwise calculate centroid
      let centerX, centerY;
      
      if (polygon.center && polygon.center.lat && polygon.center.lng) {
        // Use the provided center
        const centerLat = polygon.center.lat;
        const centerLng = polygon.center.lng;
        
        // Convert center to isometric coordinates
        const x = (centerLng - 12.3326) * 20000;
        const y = (centerLat - 45.4371) * 20000;
        
        centerX = isoX(x, y);
        centerY = isoY(x, y);
      } else {
        // Calculate centroid as fallback
        centerX = 0;
        centerY = 0;
        coords.forEach(coord => {
          centerX += coord.x;
          centerY += coord.y;
        });
        centerX /= coords.length;
        centerY /= coords.length;
      }
      
      // Store polygon data for rendering
      newPolygonsToRender.push({
        polygon,
        coords,
        fillColor,
        centroidX: centerX, // Store both for compatibility
        centroidY: centerY,
        centerX: centerX,    // Add these explicitly
        centerY: centerY
      });
    });

    // Update the polygonsToRender state
    setPolygonsToRender(newPolygonsToRender);

    // Now render in two passes: first the polygons, then the text
    // First pass: Draw all polygon shapes
    newPolygonsToRender.forEach(({ polygon, coords, fillColor }) => {
      // Draw polygon path
      ctx.beginPath();
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
      ctx.closePath();
      
      // Determine if this polygon is hovered or selected
      const isHovered = hoveredPolygonId === polygon.id;
      const isSelected = selectedPolygonId === polygon.id;
      
      // Apply different styles for hover and selected states
      if (isSelected) {
        // Selected state: much brighter with a thicker border
        ctx.fillStyle = lightenColor(fillColor, 35); // Increased brightness for selection
        ctx.fill();
        ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
        ctx.lineWidth = 3.5;
      } else if (isHovered) {
        // Hover state: significantly brighter with a more vibrant border
        ctx.fillStyle = lightenColor(fillColor, 25); // Increased brightness for hover
        ctx.fill();
        ctx.strokeStyle = '#FFCC00'; // Bright yellow for hover
        ctx.lineWidth = 3; // Thicker border
      } else {
        // Normal state
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
      }
      
      ctx.stroke();
    });

    // Second pass: Draw all polygon names (only in land view)
    if (activeView === 'land') {
      // Only show text if zoom level is above a certain threshold (closer zoom)
      const showText = scale >= 2.0; // Further reduced threshold to match new minimum zoom level
        
      if (showText) {
        polygonsToRender.forEach(({ polygon, centerX, centerY }) => {
          if (polygon.historicalName) {
            // Use a fixed font size regardless of zoom level
            ctx.font = `10px Arial`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            
            // Calculate offset to position text below coat of arms
            const coatOfArmsSize = Math.min(71, Math.max(35, Math.floor(scale * 18.84)));
            const fontSize = 10; // Define the font size to match the fixed font size we're using
            const textYOffset = coatOfArmsSize / 2 + fontSize + 5; // Half the coat of arms size + font size + padding
            
            // Draw text below the coat of arms at the center position
            ctx.fillText(polygon.historicalName, centerX, centerY + textYOffset);
          }
        });
      }
    }
      
    // Third pass: Draw coat of arms for lands with owners (only in land view)
    if (activeView === 'land') {
      // Always show coat of arms in land view regardless of zoom level
      polygonsToRender.forEach(({ polygon, centerX, centerY }) => {
        // Check if polygon has an owner
        const owner = landOwners[polygon.id];
        if (!owner) return;
          
        // Calculate size based on zoom level - INCREASED BY 60% (original + 40% + 20%)
        const size = Math.min(71, Math.max(35, Math.floor(scale * 18.84))); // Increased by 60% total
            
          // Check if we have a coat of arms image for this owner
          if (owner in coatOfArmsImages && coatOfArmsImages[owner]) {
            // Draw circular coat of arms with error handling
            try {
              createCircularImage(ctx, coatOfArmsImages[owner], centerX, centerY, size);
            } catch (error) {
              console.error(`Error rendering coat of arms for ${owner}:`, error);
              // Fallback to default avatar
              createDefaultCircularAvatar(ctx, owner, centerX, centerY, size);
            }
          } else {
            // Draw default avatar with initial
            createDefaultCircularAvatar(ctx, owner, centerX, centerY, size);
          }
        });
    }
    
    // Draw buildings if in buildings view
    if (activeView === 'buildings' && buildings.length > 0) {
      buildings.forEach(building => {
        if (!building.position) return;
            
        let position;
        if (typeof building.position === 'string') {
          try {
            position = JSON.parse(building.position);
          } catch (e) {
            return;
          }
        } else {
          position = building.position;
        }
            
        // Convert lat/lng to isometric coordinates
        let x, y;
        if ('lat' in position && 'lng' in position) {
          // Normalize coordinates relative to center of Venice
          // Scale factor adjusted to match the map
          x = (position.lng - 12.3326) * 20000;
          y = (position.lat - 45.4371) * 20000; // Remove the 0.7 factor
        } else if ('x' in position && 'z' in position) {
          x = position.x;
          y = position.z;
        } else {
          return;
        }
            
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
        
        // Draw building based on type
        const size = getBuildingSize(building.type);
        const color = getBuildingColor(building.type);
        
        // Determine if this building is hovered or selected with more explicit check
        const isHovered = hoveredBuildingId !== null && hoveredBuildingId === building.id;
        const isSelected = selectedBuildingId !== null && selectedBuildingId === building.id;
        
        // Debug logging for hover state
        if (isHovered) {
          console.log(`Building ${building.id} is hovered, applying hover style`);
        }
        
        // Draw simple square for building with hover/select states
        const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
        
        // Apply different styles for hover and selected states
        if (isSelected) {
          // Selected state: much brighter with a thicker border
          ctx.fillStyle = lightenColor(color, 35); // Increased brightness for selection
          ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
          ctx.lineWidth = 3.5;
        } else if (isHovered) {
          // Make hover state MUCH more dramatic for testing
          ctx.fillStyle = '#FF00FF'; // Bright magenta for hover - very obvious
          ctx.strokeStyle = '#FFFF00'; // Bright yellow border
          ctx.lineWidth = 5; // Extra thick border
        } else {
          // Normal state
          ctx.fillStyle = color;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
        }
        
        ctx.beginPath();
        ctx.rect(
          isoPos.x - squareSize/2, 
          isoPos.y - squareSize/2, 
          squareSize, 
          squareSize
        );
        ctx.fill();
        ctx.stroke();
        
        // Add a small indicator for the building type with fixed font size
        ctx.fillStyle = isHovered ? '#FFFFFF' : '#000'; // White text on hover for better visibility
        ctx.font = `10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Use first letter of building type as an indicator
        const typeIndicator = building.type.charAt(0).toUpperCase();
        ctx.fillText(
          typeIndicator, 
          isoPos.x, 
          isoPos.y
        );
      });
    }
    
    // Draw transport points if in transport view
    if (activeView === 'transport') {
      polygons.forEach(polygon => {
        // Draw bridge points
        if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
          polygon.bridgePoints.forEach((point: any) => {
            if (!point.edge) return;
                
            // Normalize coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000; // Remove the 0.7 factor
                
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
                
            // Draw bridge point
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 5 * scale, 0, Math.PI * 2);
            ctx.fillStyle = '#FF5500';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
            
        // Draw dock points
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          polygon.canalPoints.forEach((point: any) => {
            if (!point.edge) return;
                
            // Normalize coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000; // Remove the 0.7 factor
                
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
                
            // Draw dock point
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 5 * scale, 0, Math.PI * 2);
            ctx.fillStyle = '#00AAFF';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
      });
      
      // Draw transport route planning UI if in transport mode
      if (activeView === 'transport' && transportMode) {
        console.log('Drawing transport mode UI', { 
          transportStartPoint, 
          transportEndPoint, 
          mousePosition,
          activeView,
          transportMode
        });
        
        // Add a legend for path types
        if (transportMode && transportPath.length > 0) {
          const legendX = 20;
          const legendY = canvas.height - 120;
          const legendWidth = 150;
          const legendHeight = 100;
          const legendPadding = 10;
          
          // Draw legend background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(
            legendX - legendPadding,
            legendY - legendPadding,
            legendWidth + legendPadding * 2,
            legendHeight + legendPadding * 2
          );
          
          // Draw legend border
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            legendX - legendPadding,
            legendY - legendPadding,
            legendWidth + legendPadding * 2,
            legendHeight + legendPadding * 2
          );
          
          // Draw legend title
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.font = '14px "Times New Roman", serif';
          ctx.fillText('Legenda', legendX, legendY + 15);
          
          // Draw legend items
          ctx.font = '12px "Times New Roman", serif';
          
          // Bridge point
          ctx.beginPath();
          ctx.arc(legendX + 10, legendY + 40, 3 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 100, 50, 0.8)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText('Ponte', legendX + 25, legendY + 43);
          
          // Building point
          ctx.beginPath();
          ctx.arc(legendX + 10, legendY + 60, 3 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(70, 130, 180, 0.8)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText('Edificio', legendX + 25, legendY + 63);
          
          // Centroid point
          ctx.beginPath();
          ctx.arc(legendX + 10, legendY + 80, 2 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 102, 153, 0.7)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText('Piazza', legendX + 25, legendY + 83);
        }
        
        // Draw instructions with Venetian styling
        ctx.font = '16px "Times New Roman", serif';
        ctx.textAlign = 'center';

        // Create a semi-transparent background for the text
        const instructionText = calculatingPath 
          ? 'Calcolando il percorso...' // "Calculating route..." in Italian
          : !transportStartPoint 
            ? 'Clicca per impostare il punto di partenza' // "Click to set starting point" in Italian
            : !transportEndPoint 
              ? 'Clicca per impostare la destinazione' // "Click to set destination" in Italian
              : 'Percorso trovato! Clicca per impostare un nuovo punto di partenza'; // "Route found!" in Italian

        const textWidth = ctx.measureText(instructionText).width;
        const textHeight = 20;
        const padding = 10;

        // Draw text background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(
          canvas.width / 2 - textWidth / 2 - padding,
          30 - padding,
          textWidth + padding * 2,
          textHeight + padding * 2
        );

        // Draw text border with Venetian gold
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          canvas.width / 2 - textWidth / 2 - padding,
          30 - padding,
          textWidth + padding * 2,
          textHeight + padding * 2
        );

        // Draw the text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(instructionText, canvas.width / 2, 40);
        
        // Draw start point if set
        if (transportStartPoint) {
          const startX = (transportStartPoint.lng - 12.3326) * 20000;
          const startY = (transportStartPoint.lat - 45.4371) * 20000;
          
          const startScreenX = isoX(startX, startY);
          const startScreenY = isoY(startX, startY);
          
          // Draw a gold circle for start point with Venetian styling
          ctx.beginPath();
          ctx.arc(startScreenX, startScreenY, 8 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(218, 165, 32, 0.8)'; // Venetian gold
          ctx.fill();
          
          // Add a white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Add a subtle outer glow
          ctx.beginPath();
          ctx.arc(startScreenX, startScreenY, 10 * scale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Add "Start" label with Venetian styling
          ctx.font = `${Math.max(10, 12 * scale)}px 'Times New Roman', serif`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText('Partenza', startScreenX, startScreenY - 15 * scale); // Italian for "Departure"
        }
        
        // Draw end point if set
        if (transportEndPoint) {
          const endX = (transportEndPoint.lng - 12.3326) * 20000;
          const endY = (transportEndPoint.lat - 45.4371) * 20000;
          
          const endScreenX = isoX(endX, endY);
          const endScreenY = isoY(endX, endY);
          
          // Draw a red circle for end point with Venetian styling
          ctx.beginPath();
          ctx.arc(endScreenX, endScreenY, 8 * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 30, 30, 0.8)'; // Venetian red
          ctx.fill();
          
          // Add a white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Add a subtle outer glow
          ctx.beginPath();
          ctx.arc(endScreenX, endScreenY, 10 * scale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(180, 30, 30, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Add "End" label with Venetian styling
          ctx.font = `${Math.max(10, 12 * scale)}px 'Times New Roman', serif`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText('Arrivo', endScreenX, endScreenY - 15 * scale); // Italian for "Arrival"
        }
        
        // Draw the calculated path if available
        if (transportPath.length > 0) {
          // First draw a subtle shadow/glow effect
          ctx.beginPath();

          // Start at the first point
          const firstPoint = transportPath[0];
          const firstX = (firstPoint.lng - 12.3326) * 20000;
          const firstY = (firstPoint.lat - 45.4371) * 20000;

          ctx.moveTo(isoX(firstX, firstY), isoY(firstX, firstY));

          // Connect all points
          for (let i = 1; i < transportPath.length; i++) {
            const point = transportPath[i];
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;

            ctx.lineTo(isoX(x, y), isoY(x, y));
          }

          // Style the path shadow
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 6 * scale;
          ctx.stroke();

          // Now draw segments with different colors based on transport mode
          for (let i = 0; i < transportPath.length - 1; i++) {
            const point1 = transportPath[i];
            const point2 = transportPath[i + 1];

            const x1 = (point1.lng - 12.3326) * 20000;
            const y1 = (point1.lat - 45.4371) * 20000;
            const x2 = (point2.lng - 12.3326) * 20000;
            const y2 = (point2.lat - 45.4371) * 20000;

            // For gondola paths, draw curved lines
            if (point1.transportMode === 'gondola') {
              // Draw a curved path for gondolas
              ctx.beginPath();

              // Start point
              const startX = isoX(x1, y1);
              const startY = isoY(x1, y1);
              ctx.moveTo(startX, startY);

              // End point
              const endX = isoX(x2, y2);
              const endY = isoY(x2, y2);

              // If this is an intermediate point, draw a curved line
              if (point1.isIntermediatePoint || point2.isIntermediatePoint) {
                // Draw a simple curve
                ctx.quadraticCurveTo(
                  (startX + endX) / 2 + (Math.random() * 10 - 5) * scale,
                  (startY + endY) / 2 + (Math.random() * 10 - 5) * scale,
                  endX,
                  endY
                );
              } else {
                // Draw a straight line
                ctx.lineTo(endX, endY);
              }

              // Venetian blue for water transport
              ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
              ctx.lineWidth = 4 * scale;
              ctx.stroke();

              // Add a wavy effect for water
              ctx.beginPath();
              ctx.moveTo(startX, startY);

              // Add a slight wave effect
              const waveOffset = Math.sin(i * 0.5) * 0.5 * scale;

              // If this is an intermediate point, draw a curved line with wave effect
              if (point1.isIntermediatePoint || point2.isIntermediatePoint) {
                ctx.quadraticCurveTo(
                  (startX + endX) / 2 + (Math.random() * 10 - 5) * scale + waveOffset,
                  (startY + endY) / 2 + (Math.random() * 10 - 5) * scale + waveOffset,
                  endX + waveOffset,
                  endY + waveOffset
                );
              } else {
                ctx.lineTo(endX + waveOffset, endY + waveOffset);
              }

              // Style the water effect
              ctx.strokeStyle = 'rgba(135, 206, 235, 0.6)'; // Light blue
              ctx.lineWidth = 2 * scale;
              ctx.stroke();

              // Add ripple effects along the path
              const segments = 5;
              for (let s = 1; s < segments; s++) {
                const segX = startX + (endX - startX) * (s / segments);
                const segY = startY + (endY - startY) * (s / segments);
                  
                // Draw small ripple circles
                ctx.beginPath();
                const rippleSize = 1 * scale * Math.random();
                ctx.arc(segX + (Math.random() * 6 - 3) * scale, 
                        segY + (Math.random() * 6 - 3) * scale, 
                        rippleSize, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fill();
              }
            } else {
              // For walking paths, draw straight lines with texture
              ctx.beginPath();
              ctx.moveTo(isoX(x1, y1), isoY(x1, y1));
              ctx.lineTo(isoX(x2, y2), isoY(x2, y2));

              // Terracotta for walking paths
              ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
              ctx.lineWidth = 4 * scale;
              ctx.stroke();

              // Add a subtle texture for walking paths
              ctx.beginPath();
              ctx.setLineDash([2 * scale, 2 * scale]);
              ctx.moveTo(isoX(x1, y1), isoY(x1, y1));
              ctx.lineTo(isoX(x2, y2), isoY(x2, y2));
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
              ctx.lineWidth = 1 * scale;
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          // Draw waypoints with improved styling
          for (let i = 0; i < transportPath.length; i++) {
            // Skip intermediate points for cleaner visualization
            if (transportPath[i].isIntermediatePoint) continue;

            const point = transportPath[i];
            const x = (point.lng - 12.3326) * 20000;
            const y = (point.lat - 45.4371) * 20000;

            const screenX = isoX(x, y);
            const screenY = isoY(x, y);

            // Determine node size based on type
            let nodeSize = 2.5 * scale;
            let nodeColor = 'rgba(218, 165, 32, 0.7)'; // Default gold

            // Color and size based on node type
            if (point.type === 'bridge') {
              nodeSize = 3 * scale;
              nodeColor = 'rgba(180, 100, 50, 0.8)'; // Brown for bridges
            } else if (point.type === 'building') {
              nodeSize = 3 * scale;
              nodeColor = 'rgba(70, 130, 180, 0.8)'; // Steel blue for buildings
            } else if (point.type === 'centroid') {
              nodeSize = 2 * scale;
              nodeColor = 'rgba(0, 102, 153, 0.7)'; // Venetian blue for centroids
            } else if (point.type === 'canal') {
              nodeSize = 3 * scale;
              nodeColor = 'rgba(0, 150, 200, 0.8)'; // Bright blue for canal points
            }

            // Draw a small circle for each waypoint
            ctx.beginPath();
            ctx.arc(screenX, screenY, nodeSize, 0, Math.PI * 2);
            ctx.fillStyle = nodeColor;
            ctx.fill();

            // Add a subtle white border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
              
          // Draw gondolas
          gondolaPositions.forEach(gondola => {
            const screenX = isoX(gondola.x, gondola.y);
            const screenY = isoY(gondola.x, gondola.y);

            // Draw gondola
            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.rotate(gondola.angle);

            // Draw gondola body (elongated ellipse)
            const gondolaLength = 6 * scale;
            const gondolaWidth = 2 * scale;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.ellipse(0, 0, gondolaLength, gondolaWidth, 0, 0, Math.PI * 2);
            ctx.fill();

            // Draw gondolier
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(gondolaLength * 0.3, 0, gondolaWidth * 0.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          });
            
          // Update the legend to include canal points and transport modes
          if (transportMode && transportPath.length > 0) {
            const legendX = 20;
            const legendY = canvas.height - 160; // Increased height for more items
            const legendWidth = 180;
            const legendHeight = 140;
            const legendPadding = 10;
              
            // Draw legend background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(
              legendX - legendPadding,
              legendY - legendPadding,
              legendWidth + legendPadding * 2,
              legendHeight + legendPadding * 2
            );
              
            // Draw legend border
            ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(
              legendX - legendPadding,
              legendY - legendPadding,
              legendWidth + legendPadding * 2,
              legendHeight + legendPadding * 2
            );
              
            // Draw legend title
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.font = '14px "Times New Roman", serif';
            ctx.fillText('Legenda', legendX, legendY + 15);
              
            // Draw legend items
            ctx.font = '12px "Times New Roman", serif';
              
            // Bridge point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 40, 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180, 100, 50, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Ponte', legendX + 25, legendY + 43);
              
            // Building point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 60, 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(70, 130, 180, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Edificio', legendX + 25, legendY + 63);
              
            // Centroid point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 80, 2 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 102, 153, 0.7)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Piazza', legendX + 25, legendY + 83);
              
            // Canal point
            ctx.beginPath();
            ctx.arc(legendX + 10, legendY + 100, 3 * scale, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 150, 200, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Canale', legendX + 25, legendY + 103);
              
            // Walking path
            ctx.beginPath();
            ctx.moveTo(legendX + 5, legendY + 120);
            ctx.lineTo(legendX + 15, legendY + 120);
            ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('A piedi', legendX + 25, legendY + 123);
              
            // Water path
            ctx.beginPath();
            ctx.moveTo(legendX + 5, legendY + 140);
            ctx.lineTo(legendX + 15, legendY + 140);
            ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('In gondola', legendX + 25, legendY + 143);
          }
            
          // Calculate total distance and time
          let totalDistance = 0;
          let walkingDistance = 0;
          let waterDistance = 0;
            
          for (let i = 1; i < transportPath.length; i++) {
            const point1 = transportPath[i-1];
            const point2 = transportPath[i];
              
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
            
          // Calculate estimated time (walking at 5 km/h, gondola at 10 km/h)
          const walkingTimeHours = walkingDistance / 1000 / 5;
          const waterTimeHours = waterDistance / 1000 / 10;
          const totalTimeMinutes = Math.round((walkingTimeHours + waterTimeHours) * 60);
            
          // Format distances for display
          let distanceText = '';
          if (totalDistance < 1000) {
            distanceText = `${Math.round(totalDistance)} metri`; // meters in Italian
          } else {
            distanceText = `${(totalDistance / 1000).toFixed(2)} km`;
          }
            
          // Create a distance and time indicator box
          const infoLabel = `Distanza: ${distanceText} | Tempo: ${totalTimeMinutes} min`;
          const walkingLabel = `A piedi: ${Math.round(walkingDistance)} m`;
          const gondolaLabel = `In gondola: ${Math.round(waterDistance)} m`;
            
          const labelWidth = Math.max(
            ctx.measureText(infoLabel).width,
            ctx.measureText(walkingLabel).width,
            ctx.measureText(gondolaLabel).width
          );
          const labelHeight = 60; // Height for three lines of text
          const labelPadding = 10;
            
          // Position in bottom right
          const labelX = canvas.width - labelWidth - labelPadding * 3;
          const labelY = canvas.height - labelHeight - labelPadding * 3;
            
          // Draw background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(
            labelX - labelPadding,
            labelY - labelPadding,
            labelWidth + labelPadding * 2,
            labelHeight + labelPadding * 2
          );
            
          // Draw border with Venetian gold
          ctx.strokeStyle = 'rgba(218, 165, 32, 0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            labelX - labelPadding,
            labelY - labelPadding,
            labelWidth + labelPadding * 2,
            labelHeight + labelPadding * 2
          );
            
          // Draw text
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.fillText(infoLabel, labelX, labelY + 15);
          ctx.fillText(walkingLabel, labelX, labelY + 35);
          ctx.fillText(gondolaLabel, labelX, labelY + 55);
        }
        
        // Draw hover indicator for transport mode - ALWAYS draw this when in transport mode
        if (activeView === 'transport' && transportMode) {
          // Draw a circle at mouse position with Venetian styling
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, 6 * scale, 0, Math.PI * 2);
          
          // Use Venetian colors - gold for start point, red for end point
          const fillColor = transportStartPoint 
            ? 'rgba(180, 30, 30, 0.6)'  // Red for end point
            : 'rgba(218, 165, 32, 0.6)'; // Gold for start point
          
          ctx.fillStyle = fillColor;
          ctx.fill();
          
          // Add a subtle white border
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Add a pulsing effect to make it more noticeable
          const pulseSize = 8 * scale * (0.8 + 0.2 * Math.sin(Date.now() / 300));
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, pulseSize, 0, Math.PI * 2);
          ctx.strokeStyle = fillColor;
          ctx.lineWidth = 0.8;
          ctx.stroke();
          
          // Change cursor style to crosshair for better precision
          canvas.style.cursor = 'crosshair';
        }
      }
    }
    
    // Draw empty building points if in buildings view
    if (activeView === 'buildings' && emptyBuildingPoints.length > 0) {
      emptyBuildingPoints.forEach(point => {
        // Convert lat/lng to isometric coordinates
        const x = (point.lng - 12.3326) * 20000;
        const y = (point.lat - 45.4371) * 20000;
        
        const isoPos = {
          x: calculateIsoX(x, y, scale, offset, canvas.width),
          y: calculateIsoY(x, y, scale, offset, canvas.height)
        };
        
        // Check if mouse is over this building point
        const pointSize = 2.2 * scale; // Even smaller (was 2.5)
        const isHovered = 
          mousePosition.x >= isoPos.x - pointSize && 
          mousePosition.x <= isoPos.x + pointSize && 
          mousePosition.y >= isoPos.y - pointSize && 
          mousePosition.y <= isoPos.y + pointSize;
        
        // Draw a small circle for empty building points with even more subtle colors
        ctx.beginPath();
        ctx.arc(isoPos.x, isoPos.y, pointSize, 0, Math.PI * 2);
    
        // Apply different opacity and color based on hover state
        // Use an even more muted, earthy color that better blends with the map
        // Normal: very low opacity, Hovered: slightly higher opacity
        ctx.fillStyle = isHovered 
          ? 'rgba(160, 140, 120, 0.3)' // Hovered: muted sand/earth tone with 30% opacity (was 40%)
          : 'rgba(160, 140, 120, 0.15)'; // Normal: muted sand/earth tone with 15% opacity (was 20%)
        
        ctx.fill();
        
        // Add a subtle border when hovered
        if (isHovered) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Less opaque white (was 0.6)
          ctx.lineWidth = 0.8; // Thinner line (was 1)
          ctx.stroke();
          
          // Update cursor to pointer when hovering over a building point
          canvas.style.cursor = 'pointer';
        }
      });
    }
    
    // Draw dock points and bridge points if in buildings view, but more discreet
    if (activeView === 'buildings' && polygons.length > 0) {
      // Draw dock points with subtle styling
      polygons.forEach(polygon => {
        if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
          polygon.canalPoints.forEach((point: any) => {
            if (!point.edge) return;
            
            // Convert lat/lng to isometric coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000;
            
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
            
            // Check if this point is hovered
            const isHovered = hoveredCanalPoint && 
              Math.abs(hoveredCanalPoint.lat - point.edge.lat) < 0.0001 && 
              Math.abs(hoveredCanalPoint.lng - point.edge.lng) < 0.0001;
            
            // Draw a small, semi-transparent circle for dock points
            ctx.beginPath();
            ctx.arc(isoPos.x, isoPos.y, 2 * scale, 0, Math.PI * 2);
            
            // Use a subtle blue color with low opacity, brighter when hovered
            ctx.fillStyle = isHovered 
              ? 'rgba(0, 120, 215, 0.7)' // Brighter and more opaque when hovered
              : 'rgba(0, 120, 215, 0.3)';
            ctx.fill();
            
            // Add a border, more visible when hovered
            ctx.strokeStyle = isHovered
              ? 'rgba(255, 255, 255, 0.8)' // White border when hovered
              : 'rgba(0, 120, 215, 0.4)';
            ctx.lineWidth = isHovered ? 1.5 : 0.5;
            ctx.stroke();
          });
        }
        
        // Draw bridge points with subtle styling
        if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
          polygon.bridgePoints.forEach((point: any) => {
            if (!point.edge) return;
            
            // Convert lat/lng to isometric coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000;
            
            const isoPos = {
              x: calculateIsoX(x, y, scale, offset, canvas.width),
              y: calculateIsoY(x, y, scale, offset, canvas.height)
            };
            
            // Check if this point is hovered
            const isHovered = hoveredBridgePoint && 
              Math.abs(hoveredBridgePoint.lat - point.edge.lat) < 0.0001 && 
              Math.abs(hoveredBridgePoint.lng - point.edge.lng) < 0.0001;
            
            // Draw a small, semi-transparent square for bridge points
            const pointSize = 2 * scale;
            
            // Use a subtle orange/brown color with low opacity, brighter when hovered
            ctx.fillStyle = isHovered
              ? 'rgba(180, 120, 60, 0.7)' // Brighter and more opaque when hovered
              : 'rgba(180, 120, 60, 0.3)';
            ctx.beginPath();
            ctx.rect(
              isoPos.x - pointSize/2, 
              isoPos.y - pointSize/2, 
              pointSize, 
              pointSize
            );
            ctx.fill();
            
            // Add a border, more visible when hovered
            ctx.strokeStyle = isHovered
              ? 'rgba(255, 255, 255, 0.8)' // White border when hovered
              : 'rgba(180, 120, 60, 0.4)';
            ctx.lineWidth = isHovered ? 1.5 : 0.5;
            ctx.stroke();
          });
        }
      });
    }
    
    // Draw citizen markers if in citizens view
    if (activeView === 'citizens' && citizensLoaded) {
      // Draw citizens at their home and work locations
      Object.entries(citizensByBuilding).forEach(([buildingId, buildingCitizens]) => {
        // Find the building position
        const position = findBuildingPosition(buildingId);
        if (!position) return;
        
        // Group citizens by marker type
        const homeCitizens = buildingCitizens.filter(c => c.markerType === 'home');
        const workCitizens = buildingCitizens.filter(c => c.markerType === 'work');
        
        // Draw home citizens
        if (homeCitizens.length > 0) {
          // If multiple citizens, draw a group marker
          if (homeCitizens.length > 1) {
            // Determine color based on social class of the first citizen
            const socialClass = homeCitizens[0].SocialClass || homeCitizens[0].socialClass || '';
            const baseClass = socialClass.toLowerCase();
            
            // Choose color based on social class
            let fillColor = 'rgba(100, 150, 255, 0.8)'; // Default blue
            if (baseClass.includes('nobili')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(255, 215, 0, 0.9)' // Gold for nobility (hovered)
                : 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
            } else if (baseClass.includes('cittadini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(70, 130, 180, 0.9)' // Blue for citizens (hovered)
                : 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
            } else if (baseClass.includes('popolani')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(205, 133, 63, 0.9)' // Brown for common people (hovered)
                : 'rgba(205, 133, 63, 0.8)'; // Brown for common people
            } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
                ? 'rgba(128, 128, 128, 0.9)' // Gray for laborers (hovered)
                : 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
            }
            
            // Draw a slightly larger marker with count
            ctx.beginPath();
            ctx.arc(position.x - 15, position.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
              ? '#FFFF00'
              : '#FFFFFF';
            ctx.lineWidth = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home' ? 3 : 2;
            ctx.stroke();
            
            // Add count
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(homeCitizens.length.toString(), position.x - 15, position.y);
            
            // Add home icon
            ctx.beginPath();
            ctx.arc(position.x - 15 + 15, position.y - 15, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#4b70e2';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw a house icon instead of just the letter 'H'
            ctx.fillStyle = '#FFFFFF';
            
            // Calculate house dimensions
            const houseWidth = 8;
            const houseHeight = 6;
            const roofHeight = 4;
            const iconX = position.x - 15 + 15;
            const iconY = position.y - 15;
            
            // Draw the roof (triangle)
            ctx.beginPath();
            ctx.moveTo(iconX - houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
            ctx.lineTo(iconX, iconY - houseHeight/2 - roofHeight/2);
            ctx.lineTo(iconX + houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
            ctx.closePath();
            ctx.fill();
            
            // Draw the house body (rectangle)
            ctx.fillRect(
              iconX - houseWidth/2, 
              iconY - houseHeight/2 + roofHeight/2, 
              houseWidth, 
              houseHeight
            );
            
            // Draw a small door
            ctx.fillStyle = '#4b70e2'; // Same as background color
            const doorWidth = houseWidth * 0.4;
            const doorHeight = houseHeight * 0.6;
            ctx.fillRect(
              iconX - doorWidth/2,
              iconY - houseHeight/2 + roofHeight/2 + houseHeight - doorHeight,
              doorWidth,
              doorHeight
            );
          } else {
            // Draw a single citizen marker
            createCitizenMarker(
              ctx, 
              position.x - 15, 
              position.y, 
              homeCitizens[0], 
              'home', 
              20, 
              hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'home'
            );
          }
        }
        
        // Draw work citizens
        if (workCitizens.length > 0) {
          // If multiple citizens, draw a group marker
          if (workCitizens.length > 1) {
            // Determine color based on social class of the first citizen
            const socialClass = workCitizens[0].SocialClass || workCitizens[0].socialClass || '';
            const baseClass = socialClass.toLowerCase();
            
            // Choose color based on social class
            let fillColor = 'rgba(255, 150, 100, 0.8)'; // Default orange
            if (baseClass.includes('nobili')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(255, 215, 0, 0.9)' // Gold for nobility (hovered)
                : 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
            } else if (baseClass.includes('cittadini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(70, 130, 180, 0.9)' // Blue for citizens (hovered)
                : 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
            } else if (baseClass.includes('popolani')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(205, 133, 63, 0.9)' // Brown for common people (hovered)
                : 'rgba(205, 133, 63, 0.8)'; // Brown for common people
            } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
              fillColor = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
                ? 'rgba(128, 128, 128, 0.9)' // Gray for laborers (hovered)
                : 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
            }
            
            // Draw a slightly larger marker with count
            ctx.beginPath();
            ctx.arc(position.x + 15, position.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
              ? '#FFFF00'
              : '#FFFFFF';
            ctx.lineWidth = hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work' ? 3 : 2;
            ctx.stroke();
            
            // Add count
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(workCitizens.length.toString(), position.x + 15, position.y);
            
            // Add work icon
            ctx.beginPath();
            ctx.arc(position.x + 15 + 15, position.y - 15, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#e27a4b';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('W', position.x + 15 + 15, position.y - 15);
          } else {
            // Draw a single citizen marker
            createCitizenMarker(
              ctx, 
              position.x + 15, 
              position.y, 
              workCitizens[0], 
              'work', 
              20, 
              hoveredCitizenBuilding === buildingId && hoveredCitizenType === 'work'
            );
          }
        }
      });
      
      // Add a legend for citizen markers
      const legendX = 20;
      const legendY = canvas.height - 100;
      
      // Home marker legend
      createCitizenMarker(ctx, legendX + 15, legendY, { FirstName: 'H', LastName: 'M' }, 'home', 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Home', legendX + 40, legendY);
      
      // Work marker legend
      createCitizenMarker(ctx, legendX + 15, legendY + 40, { FirstName: 'W', LastName: 'K' }, 'work', 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Work', legendX + 40, legendY + 40);
    }
    
  }, [loading, polygons, landOwners, users, activeView, buildings, scale, offset, incomeData, minIncome, maxIncome, hoveredPolygonId, selectedPolygonId, hoveredBuildingId, selectedBuildingId, emptyBuildingPoints, mousePosition, citizensLoaded, citizensByBuilding, hoveredCitizenBuilding, hoveredCitizenType]);
  

  // Handle window resize
  useEffect(() => {
    const handleResize = debounce(() => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        
        // Redraw everything
        const event = new Event('redraw');
        window.dispatchEvent(event);
      }
    }, 200);
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Helper function to get building size based on type
  function getBuildingSize(type: string): {width: number, height: number, depth: number} {
    switch(type.toLowerCase()) {
      case 'market-stall':
        return {width: 15, height: 15, depth: 15};
      case 'dock':
        return {width: 30, height: 5, depth: 30};
      case 'house':
        return {width: 20, height: 25, depth: 20};
      case 'workshop':
        return {width: 25, height: 20, depth: 25};
      case 'warehouse':
        return {width: 30, height: 20, depth: 30};
      case 'tavern':
        return {width: 25, height: 25, depth: 25};
      case 'church':
        return {width: 30, height: 50, depth: 30};
      case 'palace':
        return {width: 40, height: 40, depth: 40};
      default:
        return {width: 20, height: 20, depth: 20};
    }
  }

  // Helper function to get building color based on type
  function getBuildingColor(type: string): string {
    // Generate a deterministic color based on the building type
    const getColorFromType = (str: string): string => {
      // Create a hash from the string
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Use the hash to generate HSL values in appropriate ranges for Venetian architecture
      // Hue: Limit to earthy/warm tones (20-50 for browns/oranges/reds, 180-220 for blues)
      let hue = Math.abs(hash) % 360;
      
      // Adjust hue to be in appropriate ranges for Venetian architecture
      if (hue > 50 && hue < 180) {
        hue = 30 + (hue % 20); // Redirect to earthy tones
      } else if (hue > 220 && hue < 350) {
        hue = 200 + (hue % 20); // Redirect to Venetian blues
      }
      
      // Saturation: Muted for period-appropriate look (30-60%)
      const saturation = 30 + (Math.abs(hash >> 8) % 30);
      
      // Lightness: Medium to light for visibility (45-75%)
      const lightness = 45 + (Math.abs(hash >> 16) % 30);
      
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };
    
    // Special cases for common building types
    switch(type.toLowerCase()) {
      case 'market-stall':
        return '#E6C275'; // Warm gold/amber for market stalls
      case 'house':
        return '#E8D2B5'; // Venetian terracotta/sand for houses
      case 'workshop':
        return '#A67D5D'; // Rich wood brown for workshops
      case 'warehouse':
        return '#8C7B68'; // Darker earthy brown for warehouses
      case 'tavern':
        return '#B5835A'; // Warm oak brown for taverns
      case 'church':
        return '#E6E6D9'; // Off-white/ivory for churches
      case 'palace':
        return '#D9C7A7'; // Pale stone/marble for palaces
      case 'dock':
        return '#7D6C55'; // Dark wood brown for docks
      case 'bridge':
        return '#C9B18F'; // Stone bridge color
      case 'gondola-station':
        return '#5D7A8C'; // Blue-gray for gondola stations
      case 'gondola_station':
        return '#5D7A8C'; // Blue-gray for gondola stations
      default:
        // For any other building type, generate a deterministic color
        return getColorFromType(type);
    }
  }

  // Helper function to draw a building (simplified for 2D view)
  function drawBuildingSquare(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number,
    color: string,
    typeIndicator: string
  ) {
    // Draw square
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - size/2, y - size/2, size, size);
    ctx.fill();
    ctx.stroke();
    
    // Add type indicator
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(8, 10 * (size/20))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typeIndicator, x, y);
  }

  // Helper function to find which polygon contains this building point
  function findPolygonIdForPoint(point: {lat: number, lng: number}): string {
    for (const polygon of polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        // Check if this point is in the polygon's buildingPoints
        const found = polygon.buildingPoints.some((bp: any) => {
          const threshold = 0.0001; // Small threshold for floating point comparison
          return Math.abs(bp.lat - point.lat) < threshold && 
                 Math.abs(bp.lng - point.lng) < threshold;
        });
        
        if (found) {
          return polygon.id;
        }
      }
    }
    
    // If we can't find the exact polygon, try to find which polygon contains this point
    for (const polygon of polygons) {
      if (polygon.coordinates && polygon.coordinates.length > 2) {
        if (isPointInPolygonCoordinates(point, polygon.coordinates)) {
          return polygon.id;
        }
      }
    }
    
    return 'unknown';
  }

  // Helper function to check if a point is inside polygon coordinates
  function isPointInPolygonCoordinates(point: {lat: number, lng: number}, coordinates: {lat: number, lng: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const xi = coordinates[i].lng, yi = coordinates[i].lat;
      const xj = coordinates[j].lng, yj = coordinates[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat))
          && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Helper function to lighten a color
  function lightenColor(color: string, percent: number): string {
    // For debugging
    console.log(`Lightening color ${color} by ${percent}%`);
    
    // If color doesn't start with #, return a default color
    if (!color.startsWith('#')) {
      console.warn(`Invalid color format: ${color}, using default`);
      return '#FF00FF'; // Bright magenta as fallback
    }
    
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    const result = '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
    
    console.log(`Lightened color: ${result}`);
    return result;
  }

  // Helper function to darken a color
  function darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    
    return '#' + (
      0x1000000 +
      (R > 0 ? (R < 255 ? R : 255) : 0) * 0x10000 +
      (G > 0 ? (G < 255 ? G : 255) : 0) * 0x100 +
      (B > 0 ? (B < 255 ? B : 255) : 0)
    ).toString(16).slice(1);
  }

  return (
    <div className="w-screen h-screen">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      />
      
      {/* Land Details Panel */}
      {showLandDetailsPanel && selectedPolygonId && (
        <LandDetailsPanel
          selectedPolygonId={selectedPolygonId}
          onClose={() => {
            setShowLandDetailsPanel(false);
            setSelectedPolygonId(null);
          }}
          polygons={polygons}
          landOwners={landOwners}
          visible={showLandDetailsPanel}
        />
      )}
      
      {/* Building Details Panel */}
      {showBuildingDetailsPanel && selectedBuildingId && (activeView === 'buildings' || activeView === 'land' || activeView === 'citizens') && (
        <BuildingDetailsPanel
          selectedBuildingId={selectedBuildingId}
          onClose={() => {
            setShowBuildingDetailsPanel(false);
            setSelectedBuildingId(null);
          }}
          visible={showBuildingDetailsPanel}
        />
      )}
      
      {/* Citizen Details Panel */}
      {showCitizenDetailsPanel && selectedCitizen && (
        <CitizenDetailsPanel
          citizen={selectedCitizen}
          onClose={() => {
            setShowCitizenDetailsPanel(false);
            setSelectedCitizen(null);
          }}
        />
      )}
      
      {/* Income Legend - only visible in land view */}
      {activeView === 'land' && (
        <div className="absolute top-20 left-20 bg-black/70 text-white px-3 py-2 rounded text-sm pointer-events-none">
          <p>Income per building point</p>
          <div className="w-full h-2 mt-1 rounded" style={{background: 'linear-gradient(to right, #6699CC, #CCB266, #A54A2A)'}}></div>
          <div className="flex justify-between text-xs mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      )}
      
      {/* Controls */}
      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => {
              setScale(3); // Reset to 3x zoom instead of 1x
              setOffset({ x: 0, y: 0 });
            }}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white ml-2"
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <p className="text-lg font-serif">Loading Venice...</p>
          </div>
        </div>
      )}
      
      {/* Debug button for citizen images */}
      {activeView === 'citizens' && (
        <button
          onClick={async () => {
            console.log('Checking citizen images...');
            try {
              const response = await fetch('/api/check-citizen-images');
              const data = await response.json();
              console.log('Citizen images check result:', data);
              
              // Also check a few specific citizen images
              if (citizens.length > 0) {
                console.log('Checking specific citizen images...');
                for (let i = 0; i < Math.min(3, citizens.length); i++) {
                  const citizen = citizens[i];
                  
                  // Try multiple possible paths for each citizen
                  const urlsToTry = [
                    citizen.ImageUrl,
                    `/images/citizens/${citizen.CitizenId}.jpg`,
                    `/images/citizens/${citizen.CitizenId}.png`,
                    `/images/citizens/default.jpg`
                  ].filter(Boolean); // Remove any undefined/null values
                  
                  console.log(`URLs to try for citizen ${citizen.CitizenId}:`, urlsToTry);
                  
                  for (const url of urlsToTry) {
                    try {
                      const imgResponse = await fetch(url, { method: 'HEAD' });
                      console.log(`Image check for ${citizen.CitizenId}: ${url} - ${imgResponse.ok ? 'EXISTS' : 'NOT FOUND'} (${imgResponse.status})`);
                      if (imgResponse.ok) break; // Stop checking if we found a working URL
                    } catch (error) {
                      console.error(`Error checking image for ${citizen.CitizenId} at ${url}:`, error);
                    }
                  }
                }
              }
              
              alert(`Citizen images directory exists: ${data.directoryExists}\nTotal image files: ${data.imageFiles}\nDefault image exists: ${data.defaultImageExists}`);
            } catch (error) {
              console.error('Error checking citizen images:', error);
              alert(`Error checking citizen images: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
          className="absolute bottom-20 right-4 bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Debug Images
        </button>
      )}
      
      {/* Exit Transport Mode button */}
      {activeView === 'transport' && transportMode && (
        <button
          onClick={() => setTransportMode(false)}
          className="absolute top-20 right-4 bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Exit Transport Mode
        </button>
      )}
      
      {/* Debug Transport Mode Toggle */}
      <button
        onClick={() => {
          console.log('Manually toggling transport mode from:', transportMode);
          setTransportMode(!transportMode);
          if (!transportMode) {
            setTransportStartPoint(null);
            setTransportEndPoint(null);
            setTransportPath([]);
          }
          console.log('Transport mode toggled to:', !transportMode);
        }}
        className="absolute top-28 right-4 bg-blue-600 text-white px-3 py-1 rounded text-sm"
      >
        {transportMode ? 'Disable Transport Mode' : 'Enable Transport Mode'}
      </button>
    </div>
  );
}
