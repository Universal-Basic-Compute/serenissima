import React, { useState, useEffect, useRef } from 'react';

interface AnimatedDucatsProps {
  value: number;
  duration?: number; // Animation duration in ms
  className?: string;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
}

const AnimatedDucats: React.FC<AnimatedDucatsProps> = ({
  value,
  duration = 1000,
  className = '',
  prefix = '',
  suffix = 'ducats',
  style = {}
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip animation on initial render
    if (previousValueRef.current === value) {
      return;
    }

    // Cancel any ongoing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startValue = previousValueRef.current;
    const endValue = value;
    const difference = endValue - startValue;
    
    // If there's no change, don't animate
    if (difference === 0) {
      return;
    }

    // Animation function
    const animateValue = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (cubic ease out) for smoother animation
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      // Calculate current value
      const currentValue = Math.round(startValue + difference * easedProgress);
      setDisplayValue(currentValue);

      // Continue animation if not complete
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateValue);
      } else {
        // Ensure we end exactly at the target value
        setDisplayValue(endValue);
        startTimeRef.current = null;
        animationFrameRef.current = null;
        previousValueRef.current = endValue;
      }
    };

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animateValue);
    
    // Cleanup function
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration]);

  // Update ref when value changes
  useEffect(() => {
    previousValueRef.current = value;
  }, [value]);

  // Format the number with commas
  const formattedValue = displayValue.toLocaleString();

  return (
    <span className={className} style={style}>
      {prefix}{formattedValue} <span className="text-sm">{suffix}</span>
    </span>
  );
};

export default AnimatedDucats;
