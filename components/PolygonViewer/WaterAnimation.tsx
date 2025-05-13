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
    const baseColor = { r: 65, g: 105, b: 225 }; // Royal blue
    const waveColor = { r: 135, g: 206, b: 250 }; // Light sky blue
    
    // Create wave lines
    const waveLines = [];
    const lineCount = 20; // Number of wave lines
    const lineSpacing = canvas.height / lineCount;
    
    for (let i = 0; i < lineCount; i++) {
      waveLines.push({
        y: i * lineSpacing,
        amplitude: 1 + Math.random() * 2, // Small amplitude
        wavelength: 100 + Math.random() * 150,
        speed: 0.01 + Math.random() * 0.02, // Slow speed
        phase: Math.random() * Math.PI * 2
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
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.6)`);
      gradient.addColorStop(1, `rgba(${baseColor.r - 20}, ${baseColor.g - 20}, ${baseColor.b - 20}, 0.6)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw wave lines
      ctx.lineWidth = 1;
      
      for (const line of waveLines) {
        // Update wave phase
        line.phase += line.speed * (deltaTime || 16);
        
        ctx.beginPath();
        
        // Start at the left edge
        ctx.moveTo(0, line.y);
        
        // Draw wave path
        for (let x = 0; x < canvas.width; x += 5) {
          const waveY = line.y + Math.sin(x / line.wavelength + line.phase) * line.amplitude;
          ctx.lineTo(x, waveY);
        }
        
        // Set line style
        ctx.strokeStyle = `rgba(${waveColor.r}, ${waveColor.g}, ${waveColor.b}, 0.3)`;
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
