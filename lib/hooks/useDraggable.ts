import { useState, useRef, MouseEvent } from 'react';

export function useDraggable() {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: MouseEvent) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragStartPos.current.x,
      y: e.clientY - dragStartPos.current.y
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
