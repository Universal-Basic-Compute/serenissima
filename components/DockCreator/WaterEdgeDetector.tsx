import * as THREE from 'three';

export class WaterEdgeDetector {
  private polygons: any[] = [];
  
  constructor(polygons: any[]) {
    this.polygons = polygons;
    console.log(`Initialized WaterEdgeDetector with ${this.polygons.length} polygons`);
  }
  
  /**
   * Get all polygons
   */
  public getPolygons(): any[] {
    return this.polygons;
  }
  
  /**
   * Get water edges for a specific polygon (for debugging)
   */
  public getWaterEdgesForPolygon(polygon: any): { start: THREE.Vector3, end: THREE.Vector3 }[] {
    return this.getWaterEdges(polygon);
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
    
    // Only return if within a reasonable distance (5 units instead of 10)
    // This makes it snap more precisely to edges
    if (closestDistance < 5 && closestPoint) {
      // Ensure the point is exactly on the edge
      if (closestEdge) {
        // Calculate a position that's slightly offset from the land edge toward the water
        const edgeDirection = new THREE.Vector3().subVectors(closestEdge.end, closestEdge.start).normalize();
        const perpendicular = new THREE.Vector3(-edgeDirection.z, 0, edgeDirection.x).normalize();
        
        // Move the point slightly away from land (0.1 units) to ensure it's over water
        closestPoint.add(perpendicular.multiplyScalar(0.1));
      }
      
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
    
    // Check if polygon has coordinates in the expected format
    if (!polygon.coordinates && !polygon.geometry) {
      console.warn('Polygon missing coordinates and geometry:', polygon);
      return waterEdges;
    }
    
    // Try to get coordinates from different possible locations in the polygon object
    let coordinates;
    
    if (polygon.coordinates) {
      // Coordinates are directly on the polygon object
      if (Array.isArray(polygon.coordinates[0]) && Array.isArray(polygon.coordinates[0][0])) {
        // Format: polygon.coordinates = [[[x1,y1], [x2,y2], ...]]
        coordinates = polygon.coordinates[0];
      } else if (Array.isArray(polygon.coordinates)) {
        // Format: polygon.coordinates = [[x1,y1], [x2,y2], ...]
        coordinates = polygon.coordinates;
      }
    } else if (polygon.geometry && polygon.geometry.coordinates) {
      // Coordinates are in the geometry property
      if (Array.isArray(polygon.geometry.coordinates[0]) && Array.isArray(polygon.geometry.coordinates[0][0])) {
        // Format: polygon.geometry.coordinates = [[[x1,y1], [x2,y2], ...]]
        coordinates = polygon.geometry.coordinates[0];
      } else if (Array.isArray(polygon.geometry.coordinates)) {
        // Format: polygon.geometry.coordinates = [[x1,y1], [x2,y2], ...]
        coordinates = polygon.geometry.coordinates;
      }
    }
    
    if (!coordinates || !Array.isArray(coordinates)) {
      console.warn('Could not find valid coordinates in polygon:', polygon);
      return waterEdges;
    }
    
    // Check each edge of the polygon
    for (let i = 0; i < coordinates.length - 1; i++) {
      // Create vectors for the start and end points of the edge
      let startPoint, endPoint;
      
      if (Array.isArray(coordinates[i])) {
        startPoint = new THREE.Vector3(coordinates[i][0], 0.1, coordinates[i][1]);
        endPoint = new THREE.Vector3(coordinates[i+1][0], 0.1, coordinates[i+1][1]);
        
        // For debugging
        console.log(`Edge ${i}: ${coordinates[i][0]},${coordinates[i][1]} to ${coordinates[i+1][0]},${coordinates[i+1][1]}`);
      } else if (coordinates[i].lat !== undefined && coordinates[i].lng !== undefined) {
        startPoint = new THREE.Vector3(coordinates[i].lng, 0.1, coordinates[i].lat);
        endPoint = new THREE.Vector3(coordinates[i+1].lng, 0.1, coordinates[i+1].lat);
        
        // For debugging
        console.log(`Edge ${i}: ${coordinates[i].lng},${coordinates[i].lat} to ${coordinates[i+1].lng},${coordinates[i+1].lat}`);
      } else {
        console.warn('Unknown coordinate format:', coordinates[i]);
        continue;
      }
      
      // Determine if this is a water edge
      if (this.isWaterEdge(polygon, coordinates[i], coordinates[i+1])) {
        waterEdges.push({ start: startPoint, end: endPoint });
      }
    }
    
    // Check the closing edge (from last point back to first point)
    if (coordinates.length > 1) {
      const lastIndex = coordinates.length - 1;
      let startPoint, endPoint;
      
      if (Array.isArray(coordinates[lastIndex])) {
        startPoint = new THREE.Vector3(coordinates[lastIndex][0], 0.1, coordinates[lastIndex][1]);
        endPoint = new THREE.Vector3(coordinates[0][0], 0.1, coordinates[0][1]);
        
        // For debugging
        console.log(`Closing edge: ${coordinates[lastIndex][0]},${coordinates[lastIndex][1]} to ${coordinates[0][0]},${coordinates[0][1]}`);
      } else if (coordinates[lastIndex].lat !== undefined && coordinates[lastIndex].lng !== undefined) {
        startPoint = new THREE.Vector3(coordinates[lastIndex].lng, 0.1, coordinates[lastIndex].lat);
        endPoint = new THREE.Vector3(coordinates[0].lng, 0.1, coordinates[0].lat);
        
        // For debugging
        console.log(`Closing edge: ${coordinates[lastIndex].lng},${coordinates[lastIndex].lat} to ${coordinates[0].lng},${coordinates[0].lat}`);
      } else {
        console.warn('Unknown coordinate format for closing edge');
      }
      
      if (startPoint && endPoint && this.isWaterEdge(polygon, coordinates[lastIndex], coordinates[0])) {
        waterEdges.push({ start: startPoint, end: endPoint });
      }
    }
    
    console.log(`Found ${waterEdges.length} water edges for polygon ${polygon.id}`);
    return waterEdges;
  }
  
  /**
   * Check if an edge borders water (no adjacent polygon)
   */
  private isWaterEdge(polygon: any, start: any, end: any): boolean {
    // For now, treat all edges as water edges to test basic snapping
    // Later we can re-enable the shared edge check
    // return !this.isEdgeSharedWithAnotherPolygon(polygon, start, end);
    return true;
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
