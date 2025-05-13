'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { eventBus, EventTypes } from '@/lib/eventBus';
import { fetchCoatOfArmsImage } from '@/app/utils/coatOfArmsUtils';

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
}

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
                const img = new Image();
                const imagePromise = new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve(); // Continue even if image fails to load
                  img.src = url as string;
                });
                
                imagePromises.push(imagePromise);
                newImages[owner] = img;
              }
            });
            
            await Promise.all(imagePromises);
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
          const response = await fetch('/api/buildings');
          if (response.ok) {
            const data = await response.json();
            if (data.buildings) {
              setBuildings(data.buildings);
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
  
  // Draw the isometric view
  useEffect(() => {
    if (loading || !canvasRef.current || polygons.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate isometric projection - modified to make north up with proper aspect ratio
    const isoX = (x: number, y: number) => (x) * scale + canvas.width / 2 + offset.x; // Remove negation to fix east-west orientation
    const isoY = (x: number, y: number) => (-y) * scale * 1.4 + canvas.height / 2 + offset.y; // Multiply by 1.4 to stretch vertically
    
    // Draw water background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Collect all polygons and their data for rendering
    const polygonsToRender = [];

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
      
      // Calculate centroid for text placement
      let centroidX = 0, centroidY = 0;
      coords.forEach(coord => {
        centroidX += coord.x;
        centroidY += coord.y;
      });
      centroidX /= coords.length;
      centroidY /= coords.length;
      
      // Store polygon data for rendering
      polygonsToRender.push({
        polygon,
        coords,
        fillColor,
        centroidX,
        centroidY
      });
    });

    // Now render in two passes: first the polygons, then the text
    // First pass: Draw all polygon shapes
    polygonsToRender.forEach(({ coords, fillColor }) => {
      // Draw polygon path
      ctx.beginPath();
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
      ctx.closePath();
      
      // Fill and stroke
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Second pass: Draw all polygon names (only in land view)
    if (activeView === 'land') {
      // Only show text if zoom level is above a certain threshold (closer zoom)
      const showText = scale >= 2.0; // Further reduced threshold to match new minimum zoom level
        
      if (showText) {
        polygonsToRender.forEach(({ polygon, centroidX, centroidY }) => {
          if (polygon.historicalName) {
            // Use a fixed font size regardless of zoom level
            ctx.font = `10px Arial`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            
            // Calculate offset to position text below coat of arms
            // The coat of arms size is calculated as: Math.min(59, Math.max(29, Math.floor(scale * 15.7)))
            const coatOfArmsSize = Math.min(59, Math.max(29, Math.floor(scale * 15.7)));
            const fontSize = 10; // Define the font size to match the fixed font size we're using
            const textYOffset = coatOfArmsSize / 2 + fontSize + 5; // Half the coat of arms size + font size + padding
            
            // Draw text below the coat of arms
            ctx.fillText(polygon.historicalName, centroidX, centroidY + textYOffset);
          }
        });
      }
    }
      
    // Third pass: Draw coat of arms for lands with owners (only in land view)
    if (activeView === 'land') {
      // Always show coat of arms in land view regardless of zoom level
      polygonsToRender.forEach(({ polygon, centroidX, centroidY }) => {
        // Check if polygon has an owner
        const owner = landOwners[polygon.id];
        if (!owner) return;
          
        // Calculate size based on zoom level - INCREASED BY 60% (original + 40% + 20%)
        const size = Math.min(71, Math.max(35, Math.floor(scale * 18.84))); // Increased by 60% total
            
          // Check if we have a coat of arms image for this owner
          if (owner in coatOfArmsImages && coatOfArmsImages[owner]) {
            // Draw circular coat of arms
            createCircularImage(ctx, coatOfArmsImages[owner], centroidX, centroidY, size);
          } else {
            // Draw default avatar with initial
            createDefaultCircularAvatar(ctx, owner, centroidX, centroidY, size);
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
          x: isoX(x, y),
          y: isoY(x, y)
        };
        
        // Draw building based on type
        const size = getBuildingSize(building.type);
        const color = getBuildingColor(building.type);
        
        // Draw building as a simple colored rectangle
        ctx.fillStyle = color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        // Draw simple square for building
        const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
        ctx.fillStyle = color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
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
        ctx.fillStyle = '#000';
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
              x: isoX(x, y),
              y: isoY(x, y)
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
        if (polygon.dockPoints && Array.isArray(polygon.dockPoints)) {
          polygon.dockPoints.forEach((point: any) => {
            if (!point.edge) return;
            
            // Normalize coordinates
            const x = (point.edge.lng - 12.3326) * 20000;
            const y = (point.edge.lat - 45.4371) * 20000; // Remove the 0.7 factor
            
            const isoPos = {
              x: isoX(x, y),
              y: isoY(x, y)
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
    }
    
  }, [loading, polygons, landOwners, users, activeView, buildings, scale, offset, incomeData, minIncome, maxIncome]);
  

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
    switch(type.toLowerCase()) {
      case 'market-stall':
        return '#f5a442'; // Orange
      case 'house':
        return '#e8c39e'; // Light tan for houses
      case 'workshop':
        return '#c77f3f'; // Brown for workshops
      case 'warehouse':
        return '#8c7f5d'; // Dark tan for warehouses
      case 'tavern':
        return '#d4a76a'; // Warm tan for taverns
      case 'church':
        return '#f5f5f5'; // White for churches
      case 'palace':
        return '#f5e7c1'; // Cream for palaces
      case 'dock':
        return '#8b7355'; // Wood brown for docks
      default:
        return '#D2B48C'; // Tan (default)
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

  // Helper function to lighten a color
  function lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
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
    </div>
  );
}
