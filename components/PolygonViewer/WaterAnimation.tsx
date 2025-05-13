import { useEffect, useRef } from 'react';

interface WaterAnimationProps {
  className?: string;
}

export default function WaterAnimation({ className = '' }: WaterAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
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
    const waves = [];
    const waveCount = 5;
    const baseColor = { r: 30, g: 100, b: 180 }; // Base blue color
    
    // Create initial waves
    for (let i = 0; i < waveCount; i++) {
      waves.push({
        amplitude: 2 + Math.random() * 3,
        wavelength: 50 + Math.random() * 100,
        speed: 0.02 + Math.random() * 0.03,
        phase: Math.random() * Math.PI * 2,
        colorVariation: Math.random() * 0.2
      });
    }
    
    // Animation loop
    let animationId: number;
    let lastTime = 0;
    
    const animate = (time: number) => {
      const deltaTime = time - lastTime;
      lastTime = time;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw water background
      ctx.fillStyle = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw waves
      const gridSize = 15; // Size of each grid cell
      const cols = Math.ceil(canvas.width / gridSize);
      const rows = Math.ceil(canvas.height / gridSize);
      
      for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
          const posX = x * gridSize;
          const posY = y * gridSize;
          
          // Calculate wave height at this position
          let waveHeight = 0;
          let colorShift = 0;
          
          for (const wave of waves) {
            // Update wave phase
            wave.phase += wave.speed * (deltaTime || 16);
            
            // Calculate wave contribution at this point
            const angle = (posX / wave.wavelength + posY / wave.wavelength + wave.phase) % (Math.PI * 2);
            waveHeight += Math.sin(angle) * wave.amplitude;
            colorShift += Math.cos(angle) * wave.colorVariation;
          }
          
          // Apply wave effect to color
          const r = Math.max(0, Math.min(255, baseColor.r + colorShift * 20));
          const g = Math.max(0, Math.min(255, baseColor.g + colorShift * 15));
          const b = Math.max(0, Math.min(255, baseColor.b + colorShift * 10 + waveHeight * 5));
          
          // Draw water cell with wave-affected color
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(posX, posY, gridSize, gridSize);
          
          // Add highlights for wave crests
          if (waveHeight > 1.5) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(waveHeight - 1.5) * 0.1})`;
            ctx.fillRect(posX, posY, gridSize, gridSize);
          }
        }
      }
      
      // Add occasional ripple effect
      if (Math.random() < 0.01) {
        const rippleX = Math.random() * canvas.width;
        const rippleY = Math.random() * canvas.height;
        const rippleSize = 20 + Math.random() * 30;
        
        ctx.beginPath();
        ctx.arc(rippleX, rippleY, rippleSize, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef} 
      className={`absolute top-0 left-0 w-full h-full pointer-events-none ${className}`}
      style={{ zIndex: 5 }}
    />
  );
}
