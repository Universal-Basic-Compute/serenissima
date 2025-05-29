'use client';

import { useState, useEffect, useRef } from 'react';
import { throttle } from '@/lib/utils/performanceUtils';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

interface ViewportControllerProps {
  initialScale?: number;
  initialOffset?: { x: number, y: number };
  minScale?: number;
  maxScale?: number;
  children: (scale: number, offset: { x: number, y: number }, setScale: (scale: number) => void, setOffset: (offset: { x: number, y: number }) => void) => React.ReactNode;
}

export default function ViewportController({
  initialScale = 3,
  initialOffset = { x: 0, y: 0 },
  minScale = 1.0,
  maxScale = 10.8,
  children
}: ViewportControllerProps) {
  const [scale, setScaleState] = useState(initialScale);
  const [offset, setOffsetState] = useState(initialOffset);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Set canvas ref
  const setCanvasRef = (canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  };
  
  // Handle scale changes
  const setScale = (newScale: number) => {
    const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));
    setScaleState(clampedScale);
    
    // Emit scale changed event
    eventBus.emit(EventTypes.VIEWPORT_SCALE_CHANGED, clampedScale);
  };
  
  // Handle offset changes
  const setOffset = (newOffset: { x: number, y: number }) => {
    setOffsetState(newOffset);
    
    // Emit offset changed event
    eventBus.emit(EventTypes.VIEWPORT_OFFSET_CHANGED, newOffset);
  };
  
  // Handle mouse wheel for zooming
  useEffect(() => {
    const handleWheel = throttle((e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.01;
      const newScale = Math.max(minScale, Math.min(maxScale, scale + delta));
      
      // Only trigger a redraw if the scale changed significantly
      if (Math.abs(newScale - scale) > 0.05) {
        setScale(newScale);
        
        // Force a redraw with the new scale
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('scaleChanged', { 
            detail: { scale: newScale } 
          }));
        });
      }
    }, 50); // Throttle to 50ms (20 updates per second max)
    
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel);
    }
    
    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleWheel);
      }
      // Clean up the throttled function
      handleWheel.cancel();
    };
  }, [scale, minScale, maxScale]);
  
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
  
  // Render children with viewport state and setters
  return <>{children(scale, offset, setScale, setOffset)}</>;
}
