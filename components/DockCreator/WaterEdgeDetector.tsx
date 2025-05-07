import * as THREE from 'three';

export class WaterEdgeDetector {
  private polygons: any[] = [];
  
  constructor(polygons: any[]) {
    this.polygons = polygons;
    console.log(`Initialized WaterEdgeDetector with ${this.polygons.length} polygons`);
  }
  
  /**
   * Find the nearest water edge to a given position
   */
  public findNearestWaterEdge(position: THREE.Vector3): { 
    position: THREE.Vector3 | null; 
    landId: string | null;
    edge: { start: THREE.Vector3, end: THREE.Vector3 } | null;
  } {
    if (this.polygons.length === 0) {
      return { position: null, landId: null, edge: null };
    }
    
    let closestPoint: THREE.Vector3 | null = null;
    let closestDistance = Infinity;
    let closestLandId: string | null = null;
    let closestEdge: { start: THREE.Vector3, end: THREE.Vector3 } | null = null;
    
    // Check each polygon for water edges
    for (const polygon of this.polygons) {
      const waterEdges = this.getWaterEdges(polygon);
      
      for (const edge of waterEdges) {
        // Find closest point on edge to position
        const pointOnEdge = this.getClosestPointOnEdge(edge.start, edge.end, position);
        const distance = position.distanceTo(pointOnEdge);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPoint = pointOnEdge;
          closestLandId = polygon.id;
          closestEdge = edge;
        }
      }
    }
    
    // Only return if within a reasonable distance (10 units)
    if (closestDistance < 10 && closestPoint) {
      return { 
        position: closestPoint, 
        landId: closestLandId,
        edge: closestEdge
      };
    }
    
    return { position: null, landId: null, edge: null };
  }
  
  /**
   * Get water edges for a polygon (edges that border water)
   */
  private getWaterEdges(polygon: any): { start: THREE.Vector3, end: THREE.Vector3 }[] {
    const waterEdges: { start: THREE.Vector3, end: THREE.Vector3 }[] = [];
    
    if (!polygon.coordinates || !polygon.coordinates[0]) {
      return waterEdges;
    }
    
    const coordinates = polygon.coordinates[0];
    
    // Check each edge of the polygon
    for (let i = 0; i < coordinates.length - 1; i++) {
      const start = new THREE.Vector3(coordinates[i][0], 0.1, coordinates[i][1]);
      const end = new THREE.Vector3(coordinates[i+1][0], 0.1, coordinates[i+1][1]);
      
      // Determine if this is a water edge
      if (this.isWaterEdge(polygon, coordinates[i], coordinates[i+1])) {
        waterEdges.push({ start, end });
      }
    }
    
    // Check the closing edge
    if (coordinates.length > 1) {
      const start = new THREE.Vector3(coordinates[coordinates.length-1][0], 0.1, coordinates[coordinates.length-1][1]);
      const end = new THREE.Vector3(coordinates[0][0], 0.1, coordinates[0][1]);
      
      if (this.isWaterEdge(polygon, coordinates[coordinates.length-1], coordinates[0])) {
        waterEdges.push({ start, end });
      }
    }
    
    return waterEdges;
  }
  
  /**
   * Check if an edge borders water (no adjacent polygon)
   */
  private isWaterEdge(polygon: any, start: any, end: any): boolean {
    // Check if the edge is shared with another polygon
    const isSharedEdge = this.isEdgeSharedWithAnotherPolygon(polygon, start, end);
    
    // If it's not shared with another polygon, it's likely a water edge
    return !isSharedEdge;
  }
  
  /**
   * Check if an edge is shared with another polygon
   */
  private isEdgeSharedWithAnotherPolygon(polygon: any, start: any, end: any): boolean {
    for (const otherPolygon of this.polygons) {
      if (otherPolygon.id === polygon.id) continue;
      
      const otherCoordinates = otherPolygon.coordinates[0];
      if (!otherCoordinates) continue;
      
      // Check each edge of the other polygon
      for (let i = 0; i < otherCoordinates.length - 1; i++) {
        if (this.areEdgesEqual(start, end, otherCoordinates[i], otherCoordinates[i+1])) {
          return true;
        }
      }
      
      // Check the closing edge
      if (otherCoordinates.length > 1) {
        if (this.areEdgesEqual(start, end, otherCoordinates[otherCoordinates.length-1], otherCoordinates[0])) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check if two edges are the same (allowing for reversed direction)
   */
  private areEdgesEqual(start1: any, end1: any, start2: any, end2: any): boolean {
    const tolerance = 0.1;
    
    // Check if edges match in either direction
    const isForwardMatch = 
      Math.abs(start1[0] - start2[0]) < tolerance &&
      Math.abs(start1[1] - start2[1]) < tolerance &&
      Math.abs(end1[0] - end2[0]) < tolerance &&
      Math.abs(end1[1] - end2[1]) < tolerance;
      
    const isReverseMatch = 
      Math.abs(start1[0] - end2[0]) < tolerance &&
      Math.abs(start1[1] - end2[1]) < tolerance &&
      Math.abs(end1[0] - start2[0]) < tolerance &&
      Math.abs(end1[1] - start2[1]) < tolerance;
      
    return isForwardMatch || isReverseMatch;
  }
  
  /**
   * Get the closest point on an edge to a given position
   */
  private getClosestPointOnEdge(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3): THREE.Vector3 {
    const edge = end.clone().sub(start);
    const edgeLength = edge.length();
    const edgeDir = edge.clone().normalize();
    
    const pointToStart = point.clone().sub(start);
    const projection = pointToStart.dot(edgeDir);
    
    if (projection <= 0) {
      return start.clone();
    } else if (projection >= edgeLength) {
      return end.clone();
    } else {
      return start.clone().add(edgeDir.multiplyScalar(projection));
    }
  }
}
