import * as THREE from 'three';

export class WaterEdgeDetector {
  private scene: THREE.Scene;
  private polygons: any[] = [];
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loadPolygons();
  }
  
  /**
   * Load polygon data for edge detection
   */
  private async loadPolygons(): Promise<void> {
    try {
      // Get polygons from scene
      this.scene.traverse((object) => {
        if (object.userData && object.userData.isLandPolygon) {
          this.polygons.push({
            id: object.userData.id,
            object: object,
            coordinates: object.userData.coordinates
          });
        }
      });
      
      console.log(`Loaded ${this.polygons.length} polygons for water edge detection`);
    } catch (error) {
      console.error('Failed to load polygons for water edge detection:', error);
    }
  }
  
  /**
   * Find the nearest water edge to a given position
   */
  public findNearestWaterEdge(position: THREE.Vector3): { position: THREE.Vector3 | null, landId: string | null } {
    if (this.polygons.length === 0) {
      return { position: null, landId: null };
    }
    
    let closestEdge: THREE.Vector3 | null = null;
    let closestDistance = Infinity;
    let closestLandId: string | null = null;
    
    // Check each polygon for water edges
    for (const polygon of this.polygons) {
      const edges = this.getWaterEdges(polygon);
      
      for (const edge of edges) {
        // Find closest point on edge to position
        const closestPoint = this.getClosestPointOnEdge(edge.start, edge.end, position);
        const distance = position.distanceTo(closestPoint);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEdge = closestPoint;
          closestLandId = polygon.id;
        }
      }
    }
    
    // Only return if within a reasonable distance (20 units)
    if (closestDistance < 20 && closestEdge) {
      return { position: closestEdge, landId: closestLandId };
    }
    
    return { position: null, landId: null };
  }
  
  /**
   * Get water edges for a polygon (edges that border water)
   */
  private getWaterEdges(polygon: any): { start: THREE.Vector3, end: THREE.Vector3 }[] {
    const waterEdges: { start: THREE.Vector3, end: THREE.Vector3 }[] = [];
    
    // Get coordinates from polygon
    const coordinates = polygon.coordinates;
    if (!coordinates || coordinates.length < 3) {
      return waterEdges;
    }
    
    // Check each edge
    for (let i = 0; i < coordinates.length; i++) {
      const start = coordinates[i];
      const end = coordinates[(i + 1) % coordinates.length];
      
      // Check if this edge borders water (no adjacent polygon)
      if (this.isWaterEdge(polygon, start, end)) {
        waterEdges.push({
          start: new THREE.Vector3(start.x || start.lng, 0, start.z || start.lat),
          end: new THREE.Vector3(end.x || end.lng, 0, end.z || end.lat)
        });
      }
    }
    
    return waterEdges;
  }
  
  /**
   * Check if an edge borders water (no adjacent polygon)
   */
  private isWaterEdge(polygon: any, start: any, end: any): boolean {
    // This is a simplified implementation
    // In a real system, you would check if there's another polygon adjacent to this edge
    
    // For now, we'll assume edges on the outer boundary of the polygon are water edges
    // This is a simplification and would need to be improved for a real implementation
    return true;
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
