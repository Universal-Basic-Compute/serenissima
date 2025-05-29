/**
 * Performance utilities for throttling and debouncing functions
 */
import * as THREE from 'three';

/**
 * Throttle a function to limit how often it can be called
 * @param func The function to throttle
 * @param limit The time limit in milliseconds
 * @returns A throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  // Create the throttled function
  const throttled = function(this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
    const now = Date.now();
    
    if (now - lastCall < limit) {
      // If we're still within the limit, schedule a call for later
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          timeoutId = null;
          return func.apply(this, args);
        }, limit - (now - lastCall));
      }
      return undefined;
    }
    
    // If we're outside the limit, call immediately
    lastCall = now;
    return func.apply(this, args);
  } as T & { cancel: () => void };
  
  // Add a cancel method
  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return throttled;
}

/**
 * Debounce a function to delay its execution until after a period of inactivity
 * @param func The function to debounce
 * @param wait The wait time in milliseconds
 * @returns A debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;
  
  // Create the debounced function
  const debounced = function(this: any, ...args: Parameters<T>): void {
    // Clear any existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    // Set a new timeout
    timeoutId = setTimeout(() => {
      timeoutId = null;
      func.apply(this, args);
    }, wait);
  } as T & { cancel: () => void };
  
  // Add a cancel method
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}

/**
 * Simplify a road path by removing points that don't contribute significantly to the shape
 * Uses a simple distance-based algorithm (Douglas-Peucker algorithm)
 * @param points Array of Vector3 points
 * @param tolerance Distance tolerance for simplification
 * @returns Simplified array of Vector3 points
 */
export function simplifyRoadPoints(
  points: THREE.Vector3[],
  tolerance: number = 0.1
): THREE.Vector3[] {
  if (points.length <= 2) return [...points];
  
  // Find the point with the maximum distance
  let maxDistance = 0;
  let index = 0;
  
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  
  // Calculate the line between first and last point
  const line = new THREE.Line3(firstPoint, lastPoint);
  
  // Find the point furthest from the line
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const closestPoint = new THREE.Vector3();
    line.closestPointToPoint(point, true, closestPoint);
    
    const distance = point.distanceTo(closestPoint);
    
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  
  // If the maximum distance is greater than the tolerance, recursively simplify
  if (maxDistance > tolerance) {
    // Recursive case
    const firstHalf = simplifyRoadPoints(points.slice(0, index + 1), tolerance);
    const secondHalf = simplifyRoadPoints(points.slice(index), tolerance);
    
    // Combine the results, removing the duplicate point
    return [...firstHalf.slice(0, -1), ...secondHalf];
  } else {
    // Base case - if all points are within tolerance, return just the endpoints
    return [firstPoint, lastPoint];
  }
}

/**
 * Measure performance of a function
 * @param func The function to measure
 * @param label A label for the performance measurement
 * @returns A wrapped function that logs performance
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  func: T,
  label: string
): (...args: Parameters<T>) => ReturnType<T> {
  return function(this: any, ...args: Parameters<T>): ReturnType<T> {
    const start = performance.now();
    const result = func.apply(this, args);
    const end = performance.now();
    console.log(`${label} took ${(end - start).toFixed(2)}ms`);
    return result;
  };
}
