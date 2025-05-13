import { useState, useRef, MouseEvent } from 'react';

export function useDraggable() {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const elementRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: MouseEvent) => {
    if (!elementRef.current) return;
    
    // Calculate the offset from the mouse position to the element's top-left corner
    const rect = elementRef.current.getBoundingClientRect();
    offsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    // Calculate new position based on mouse position and offset
    setPosition({
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return {
    elementRef,
    position,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  };
}
