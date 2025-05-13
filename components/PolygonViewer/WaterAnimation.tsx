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
    
    // Water animation parameters
    const waveColor = { r: 135, g: 206, b: 250 }; // Light sky blue
    
    // Function to convert lat/lng to canvas coordinates
    const latLngToCanvas = (lat: number, lng: number) => {
      // Use the same conversion as in IsometricViewer
      const x = (lng - 12.3326) * 20000;
      const y = (lat - 45.4371) * 20000;
      
      // Apply the same projection
      const isoX = (x) * 1 + canvas.width / 2;
      const isoY = (-y) * 1.4 + canvas.height / 2;
      
      return { x: isoX, y: isoY };
    };
    
    // Create wave polygons - multiple expanding versions of each land polygon
    const wavePolygons: {
      points: {x: number, y: number}[],
      expansionFactor: number,
      speed: number,
      phase: number
    }[] = [];
    
    // Number of wave layers per polygon
    const waveLayerCount = 3;
    
    // Generate expanding polygons for each land polygon
    polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      
      // Convert polygon coordinates to canvas coordinates
      const basePoints = polygon.coordinates.map((coord: {lat: number, lng: number}) => {
        return latLngToCanvas(coord.lat, coord.lng);
      });
      
      // Calculate polygon centroid for expansion
      let centroidX = 0, centroidY = 0;
      basePoints.forEach(point => {
        centroidX += point.x;
        centroidY += point.y;
      });
      centroidX /= basePoints.length;
      centroidY /= basePoints.length;
      
      // Create multiple expanding versions of the polygon
      for (let i = 1; i <= waveLayerCount; i++) {
        // Create a new wave polygon with random properties
        wavePolygons.push({
          points: basePoints,
          expansionFactor: 1 + (i * 0.02), // Very small expansion for subtle effect
          speed: 0.0005 + (Math.random() * 0.0005), // Very slow speed for serene effect
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
        // Update phase
        wavePoly.phase += wavePoly.speed * (deltaTime || 16);
        
        // Calculate current expansion based on sine wave
        const currentExpansion = 1 + (Math.sin(wavePoly.phase) * 0.01); // Very subtle pulsing
        const totalExpansion = wavePoly.expansionFactor * currentExpansion;
        
        // Calculate polygon centroid for expansion
        let centroidX = 0, centroidY = 0;
        wavePoly.points.forEach(point => {
          centroidX += point.x;
          centroidY += point.y;
        });
        centroidX /= wavePoly.points.length;
        centroidY /= wavePoly.points.length;
        
        // Draw expanded polygon
        ctx.beginPath();
        
        wavePoly.points.forEach((point, index) => {
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
        const opacity = 0.1 - (wavePoly.expansionFactor - 1) * 0.05; // Fade out as it expands
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
