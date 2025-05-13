import { useEffect, useRef, useState } from 'react';

interface WaterAnimationProps {
  className?: string;
}

export default function WaterAnimation({ className = '' }: WaterAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [polygons, setPolygons] = useState<any[]>([]);
  
  // Load polygons for shore detection
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__polygonData) {
      setPolygons(window.__polygonData);
    } else {
      fetch('/api/get-polygons')
        .then(response => response.json())
        .then(data => {
          if (data.polygons) {
            setPolygons(data.polygons);
          }
        })
        .catch(error => {
          console.error('Error loading polygons for water animation:', error);
        });
    }
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || polygons.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions to match parent container
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Track map transformations
    let mapOffset = { x: 0, y: 0 };
    let mapScale = 1;
    let mapRotation = 0;
    let mapTilt = 0;
    
    // Listen for map transformation events
    const handleMapTransform = (event: CustomEvent) => {
      if (event.detail) {
        mapOffset = event.detail.offset || mapOffset;
        mapScale = event.detail.scale || mapScale;
        mapRotation = event.detail.rotation || mapRotation;
        mapTilt = event.detail.tilt || mapTilt;
      }
    };
    
    // Create a custom event to request map transformation data
    window.addEventListener('mapTransformed', handleMapTransform as EventListener);
    
    // Dispatch an event to request current map transformation
    window.dispatchEvent(new CustomEvent('requestMapTransform'));
    
    // Water animation parameters
    const waveColor = { r: 135, g: 206, b: 250 }; // Light sky blue
    
    // Function to convert lat/lng to canvas coordinates with map transformations
    const latLngToCanvas = (lat: number, lng: number) => {
      // Use the same conversion as in IsometricViewer
      const x = (lng - 12.3326) * 20000;
      const y = (lat - 45.4371) * 20000;
      
      // Apply rotation transformation if needed
      let transformedX = x;
      let transformedY = y;
      
      if (mapRotation !== 0) {
        const radians = (mapRotation * Math.PI) / 180;
        const rotatedX = x * Math.cos(radians) - y * Math.sin(radians);
        const rotatedY = x * Math.sin(radians) + y * Math.cos(radians);
        transformedX = rotatedX;
        transformedY = rotatedY;
      }
      
      // Apply the same projection with map transformations
      const tiltFactor = mapTilt !== 0 ? 1.4 - (mapTilt / 120) : 1.4;
      const isoX = (transformedX) * mapScale + canvas.width / 2 + mapOffset.x;
      const isoY = (-transformedY) * mapScale * tiltFactor + canvas.height / 2 + mapOffset.y;
      
      return { x: isoX, y: isoY };
    };
    
    // Create wave polygons - multiple expanding versions of each land polygon
    const wavePolygons: {
      points: {x: number, y: number}[],
      expansionFactor: number,
      speed: number,
      phase: number,
      basePoints: {lat: number, lng: number}[]
    }[] = [];
    
    // Number of wave layers per polygon
    const waveLayerCount = 3;
    
    // Generate expanding polygons for each land polygon
    polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      
      // Store original lat/lng coordinates for recalculation during animation
      const basePoints = polygon.coordinates;
      
      // Create multiple expanding versions of the polygon
      for (let i = 1; i <= waveLayerCount; i++) {
        // Create a new wave polygon with random properties
        wavePolygons.push({
          points: [], // Will be calculated during animation
          basePoints: basePoints,
          expansionFactor: 1 + (i * 0.02), // Very small expansion for subtle effect
          speed: 0.0002 + (Math.random() * 0.0002), // Very slow speed for serene effect
          phase: Math.random() * Math.PI * 2
        });
      }
    });
    
    // Animation loop
    let animationId: number;
    let lastTime = 0;
    
    const animate = (time: number) => {
      const deltaTime = time - lastTime;
      lastTime = time;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw wave polygons
      wavePolygons.forEach(wavePoly => {
        // Update phase - make sure it's actually moving
        wavePoly.phase += wavePoly.speed * (deltaTime || 16);
        
        // Calculate current expansion based on sine wave
        const currentExpansion = 1 + (Math.sin(wavePoly.phase) * 0.03); // Increased amplitude for more visible movement
        const totalExpansion = wavePoly.expansionFactor * currentExpansion;
        
        // Convert base points to canvas coordinates (recalculate each frame to follow map transformations)
        const canvasPoints = wavePoly.basePoints.map((coord: {lat: number, lng: number}) => {
          return latLngToCanvas(coord.lat, coord.lng);
        });
        
        // Calculate polygon centroid for expansion
        let centroidX = 0, centroidY = 0;
        canvasPoints.forEach(point => {
          centroidX += point.x;
          centroidY += point.y;
        });
        centroidX /= canvasPoints.length;
        centroidY /= canvasPoints.length;
        
        // Draw expanded polygon
        ctx.beginPath();
        
        canvasPoints.forEach((point, index) => {
          // Calculate expanded point position
          const dx = point.x - centroidX;
          const dy = point.y - centroidY;
          const expandedX = centroidX + (dx * totalExpansion);
          const expandedY = centroidY + (dy * totalExpansion);
          
          if (index === 0) {
            ctx.moveTo(expandedX, expandedY);
          } else {
            ctx.lineTo(expandedX, expandedY);
          }
        });
        
        ctx.closePath();
        
        // Set very transparent blue stroke for wave effect
        const opacity = 0.15 - (wavePoly.expansionFactor - 1) * 0.05; // Slightly increased opacity
        ctx.strokeStyle = `rgba(${waveColor.r}, ${waveColor.g}, ${waveColor.b}, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mapTransformed', handleMapTransform as EventListener);
    };
  }, [polygons]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className={`absolute top-0 left-0 w-full h-full pointer-events-none ${className}`}
      style={{ zIndex: 5 }}
    />
  );
}
