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
    const baseColor = { r: 65, g: 105, b: 225 }; // Royal blue
    const waveColor = { r: 135, g: 206, b: 250 }; // Light sky blue
    
    // Extract shore lines from polygons
    const shoreLines: {start: {x: number, y: number}, end: {x: number, y: number}}[] = [];
    
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
    
    // Extract shore segments from polygons
    polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      
      const coords = polygon.coordinates.map((coord: {lat: number, lng: number}) => {
        return latLngToCanvas(coord.lat, coord.lng);
      });
      
      // Create shore line segments
      for (let i = 0; i < coords.length; i++) {
        const start = coords[i];
        const end = coords[(i + 1) % coords.length];
        
        // Add the line segment to shore lines
        shoreLines.push({ start, end });
      }
    });
    
    // Create wave lines that follow the shore
    const waveCount = 3; // Number of wave lines per shore segment
    const waveDistance = 15; // Distance between wave lines
    const waves: {
      points: {x: number, y: number}[],
      amplitude: number,
      speed: number,
      phase: number
    }[] = [];
    
    // Generate waves for each shore line
    shoreLines.forEach(line => {
      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      // Skip very short segments
      if (length < 10) return;
      
      // Calculate perpendicular direction (away from land)
      const perpX = -dy / length;
      const perpY = dx / length;
      
      // Create multiple wave lines at different distances from shore
      for (let i = 1; i <= waveCount; i++) {
        const distance = i * waveDistance;
        const points = [];
        
        // Create points along the shore segment
        const pointCount = Math.max(5, Math.floor(length / 20));
        for (let j = 0; j <= pointCount; j++) {
          const t = j / pointCount;
          const x = line.start.x + dx * t + perpX * distance;
          const y = line.start.y + dy * t + perpY * distance;
          points.push({ x, y });
        }
        
        // Add wave with random properties
        waves.push({
          points,
          amplitude: 1 + Math.random() * 1.5, // Small amplitude
          speed: 0.02 + Math.random() * 0.03, // Slow speed
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
      
      // Draw water background (very subtle)
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.2)`);
      gradient.addColorStop(1, `rgba(${baseColor.r - 20}, ${baseColor.g - 20}, ${baseColor.b - 20}, 0.2)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw waves
      ctx.lineWidth = 1;
      
      waves.forEach(wave => {
        // Update wave phase
        wave.phase += wave.speed * (deltaTime || 16);
        
        ctx.beginPath();
        
        // Draw wave path
        for (let i = 0; i < wave.points.length; i++) {
          const point = wave.points[i];
          
          // Apply sine wave effect
          const waveOffset = Math.sin(wave.phase + i * 0.2) * wave.amplitude;
          
          if (i === 0) {
            ctx.moveTo(point.x, point.y + waveOffset);
          } else {
            ctx.lineTo(point.x, point.y + waveOffset);
          }
        }
        
        // Set line style - more transparent for subtle effect
        ctx.strokeStyle = `rgba(${waveColor.r}, ${waveColor.g}, ${waveColor.b}, 0.2)`;
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
