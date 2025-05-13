'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { eventBus, EventTypes } from '@/lib/eventBus';

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
}

export default function IsometricViewer({ activeView }: IsometricViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [landOwners, setLandOwners] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, any>>({});
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [buildings, setBuildings] = useState<any[]>([]);
  const [incomeData, setIncomeData] = useState<Record<string, number>>({});
  const [minIncome, setMinIncome] = useState<number>(0);
  const [maxIncome, setMaxIncome] = useState<number>(1000);

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
          console.log(`Income data loaded: ${Object.keys(incomeMap).length} entries, min=${min}, max=${max}`);
        }
      }
    } catch (error) {
      console.error('Error fetching income data:', error);
    }
  }, []);
  
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
      setScale(prevScale => Math.max(0.5, Math.min(5, prevScale + delta)));
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

  // Get color based on income using a gradient
  const getIncomeColor = (income: number | undefined): string => {
    if (income === undefined) return '#FFF5D0'; // Default sand color for no data
    
    // Normalize income to a 0-1 scale
    const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
    
    // Create a gradient from blue (low) to yellow (medium) to red (high)
    if (normalizedIncome <= 0.5) {
      // Blue to Yellow (0-0.5)
      const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
      const r = Math.floor(0 + t * 255);
      const g = Math.floor(0 + t * 255);
      const b = Math.floor(255 - t * 255);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Red (0.5-1)
      const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1 to 0-1
      const r = 255;
      const g = Math.floor(255 - t * 255);
      const b = 0;
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
    
    // Draw polygons
    polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      
      // Get polygon owner color or income-based color
      let fillColor = '#FFF5D0'; // Default sand color
      if (activeView === 'land' && polygon.id && incomeData[polygon.id] !== undefined) {
        // Use income-based color in land view
        fillColor = getIncomeColor(incomeData[polygon.id]);
      } else if (polygon.id && landOwners[polygon.id]) {
        // Use owner color in other views
        const owner = landOwners[polygon.id];
        const user = users[owner];
        if (user && user.color) {
          fillColor = user.color;
        }
      }
      
      // Start drawing polygon
      ctx.beginPath();
      
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
      
      // Draw polygon path
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
      
      // Draw polygon name if in land view
      if (activeView === 'land' && polygon.historicalName) {
        // Calculate centroid
        let centroidX = 0, centroidY = 0;
        coords.forEach(coord => {
          centroidX += coord.x;
          centroidY += coord.y;
        });
        centroidX /= coords.length;
        centroidY /= coords.length;
        
        ctx.font = '10px Arial';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText(polygon.historicalName, centroidX, centroidY);
      }
    });
    
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
        
        // Add a small indicator for the building type
        ctx.fillStyle = '#000';
        ctx.font = `${Math.max(8, 10 * scale)}px Arial`;
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
  
  // Add a legend for income colors when in land view
  useEffect(() => {
    // Create or update legend element
    if (activeView === 'land') {
      let legend = document.getElementById('income-legend');
      if (!legend) {
        legend = document.createElement('div');
        legend.id = 'income-legend';
        legend.className = 'absolute bottom-20 left-20 bg-black/70 text-white p-3 rounded-lg z-30';
        document.body.appendChild(legend);
      }
      
      // Create gradient for legend
      const gradientHtml = `
        <div class="w-full h-6 mb-1 rounded" style="background: linear-gradient(to right, #0000FF, #FFFF00, #FF0000);"></div>
      `;
      
      // Update legend content
      legend.innerHTML = `
        <h3 class="text-sm font-bold mb-2">Income Legend</h3>
        ${gradientHtml}
        <div class="flex justify-between text-xs">
          <span>${minIncome.toFixed(0)} Ducats</span>
          <span>${((maxIncome + minIncome) / 2).toFixed(0)} Ducats</span>
          <span>${maxIncome.toFixed(0)} Ducats</span>
        </div>
      `;
      
      return () => {
        // Remove legend when component unmounts or view changes
        if (legend && legend.parentNode) {
          legend.parentNode.removeChild(legend);
        }
      };
    } else {
      // Remove legend if not in land view
      const legend = document.getElementById('income-legend');
      if (legend && legend.parentNode) {
        legend.parentNode.removeChild(legend);
      }
    }
  }, [activeView, minIncome, maxIncome]);

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
      
      {/* Controls */}
      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setScale(prev => Math.max(0.5, prev - 0.1))}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white"
          >
            -
          </button>
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => setScale(prev => Math.min(5, prev + 0.1))}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white"
          >
            +
          </button>
          <button 
            onClick={() => {
              setScale(1);
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
