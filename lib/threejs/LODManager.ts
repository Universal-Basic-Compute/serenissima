/**
 * Level of Detail (LOD) manager for Three.js objects
 * Dynamically adjusts geometry detail based on distance from camera
 */
import * as THREE from 'three';
import { Polygon } from '../../components/PolygonViewer/types';

export interface LODLevel {
  distance: number;
  detailReduction: number; // Factor to reduce detail (1.0 = full detail, 0.1 = 10% detail)
}

export class LODManager {
  private camera: THREE.PerspectiveCamera;
  private lodLevels: LODLevel[];
  private updateInterval: number = 500; // ms between LOD updates
  private lastUpdateTime: number = 0;
  private enabled: boolean = true;
  
  constructor(camera: THREE.PerspectiveCamera, lodLevels?: LODLevel[]) {
    this.camera = camera;
    
    // Default LOD levels if none provided
    this.lodLevels = lodLevels || [
      { distance: 10, detailReduction: 1.0 },   // Full detail when close
      { distance: 30, detailReduction: 0.75 },  // 75% detail at medium distance
      { distance: 60, detailReduction: 0.5 },   // 50% detail at far distance
      { distance: 100, detailReduction: 0.25 }, // 25% detail at very far distance
      { distance: Infinity, detailReduction: 0.1 } // Minimum detail for extreme distances
    ];
    
    // Sort LOD levels by distance (ascending)
    this.lodLevels.sort((a, b) => a.distance - b.distance);
  }
  
  /**
   * Get the appropriate detail level for a position
   */
  public getDetailLevel(position: THREE.Vector3): number {
    if (!this.enabled) return 1.0; // Full detail if LOD is disabled
    
    const distance = this.camera.position.distanceTo(position);
    
    // Find the appropriate LOD level based on distance
    for (const level of this.lodLevels) {
      if (distance <= level.distance) {
        return level.detailReduction;
      }
    }
    
    // If no level matches (shouldn't happen with Infinity in the last level)
    return this.lodLevels[this.lodLevels.length - 1].detailReduction;
  }
  
  /**
   * Check if it's time to update LOD
   */
  public shouldUpdate(): boolean {
    const now = performance.now();
    if (now - this.lastUpdateTime > this.updateInterval) {
      this.lastUpdateTime = now;
      return true;
    }
    return false;
  }
  
  /**
   * Set the update interval for LOD checks
   */
  public setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
  }
  
  /**
   * Enable or disable LOD
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Simplify polygon coordinates based on LOD level
   */
  public simplifyPolygon(polygon: Polygon, centroidPosition: THREE.Vector3): Coordinate[] {
    const detailLevel = this.getDetailLevel(centroidPosition);
    
    // If full detail, return original coordinates
    if (detailLevel >= 0.99) {
      return polygon.coordinates;
    }
    
    // Calculate how many points to keep based on detail level
    const originalLength = polygon.coordinates.length;
    const targetLength = Math.max(3, Math.floor(originalLength * detailLevel));
    
    // If we're keeping most points, use simple decimation
    if (targetLength > originalLength * 0.7) {
      return this.decimatePoints(polygon.coordinates, targetLength);
    }
    
    // For more aggressive reduction, use Douglas-Peucker algorithm
    return this.douglasPeuckerSimplify(polygon.coordinates, detailLevel);
  }
  
  /**
   * Simple point decimation - keeps every nth point
   */
  private decimatePoints(points: Coordinate[], targetLength: number): Coordinate[] {
    if (points.length <= targetLength) return points;
    
    const result: Coordinate[] = [];
    const step = points.length / targetLength;
    
    // Always include the first and last points
    result.push(points[0]);
    
    // Add evenly spaced points
    for (let i = 1; i < points.length - 1; i++) {
      if (i % Math.ceil(step) === 0 && result.length < targetLength - 1) {
        result.push(points[i]);
      }
    }
    
    // Add the last point
    result.push(points[points.length - 1]);
    
    return result;
  }
  
  /**
   * Douglas-Peucker algorithm for polygon simplification
   */
  private douglasPeuckerSimplify(points: Coordinate[], detailLevel: number): Coordinate[] {
    // Calculate epsilon based on detail level (higher epsilon = more simplification)
    const epsilon = 0.0001 * (1 - detailLevel) * 10;
    
    // Base case: if only 2 points or fewer, return them
    if (points.length <= 2) return points;
    
    // Find the point with the maximum distance
    let maxDistance = 0;
    let maxIndex = 0;
    
    // Calculate the line from first to last point
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    
    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(points[i], firstPoint, lastPoint);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    
    // If max distance is greater than epsilon, recursively simplify
    if (maxDistance > epsilon) {
      // Recursive case
      const firstHalf = this.douglasPeuckerSimplify(points.slice(0, maxIndex + 1), detailLevel);
      const secondHalf = this.douglasPeuckerSimplify(points.slice(maxIndex), detailLevel);
      
      // Combine the results (remove duplicate point)
      return [...firstHalf.slice(0, -1), ...secondHalf];
    } else {
      // All points are within epsilon of the line, so we can simplify to just the endpoints
      return [firstPoint, lastPoint];
    }
  }
  
  /**
   * Calculate perpendicular distance from a point to a line
   */
  private perpendicularDistance(point: Coordinate, lineStart: Coordinate, lineEnd: Coordinate): number {
    // Convert to cartesian coordinates for simplicity
    const x = point.lng;
    const y = point.lat;
    const x1 = lineStart.lng;
    const y1 = lineStart.lat;
    const x2 = lineEnd.lng;
    const y2 = lineEnd.lat;
    
    // Calculate the line length
    const lineLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    
    // If the line has zero length, return distance to the point
    if (lineLength === 0) return Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2));
    
    // Calculate the perpendicular distance
    const area = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / 2;
    return (2 * area) / lineLength;
  }
}

// Type definition needed for the simplifyPolygon method
interface Coordinate {
  lat: number;
  lng: number;
}
