import * as THREE from 'three';

export class WaterEdgeDetector {
  private scene: THREE.Scene;
  private polygons: any[];
  private waterLevel: number = 0; // Assuming water is at y=0
  private maxDistance: number = 50; // Maximum distance to consider for water edges

  constructor(scene: THREE.Scene, polygons: any[]) {
    this.scene = scene;
    this.polygons = polygons;
  }

  public findNearestWaterEdge(raycaster: THREE.Raycaster): { 
    position: THREE.Vector3 | null; 
    landId: string | null;
    normal?: THREE.Vector3;
  } {
    // Cast ray to find intersection with ground plane
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, target);
    
    if (!target) {
      return { position: null, landId: null };
    }

    // Find the closest water edge
    let closestEdge = null;
    let closestDistance = this.maxDistance;
    let closestLandId = null;
    let closestNormal = null;

    for (const polygon of this.polygons) {
      const waterEdges = this.getWaterEdges(polygon);
      
      for (const edge of waterEdges) {
        const closestPoint = this.getClosestPointOnEdge(edge.start, edge.end, target);
        const distance = target.distanceTo(closestPoint);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEdge = { start: edge.start, end: edge.end };
          closestLandId = polygon.id;
          
          // Calculate normal vector pointing away from land
          const edgeVector = new THREE.Vector3().subVectors(edge.end, edge.start);
          const normalVector = new THREE.Vector3(-edgeVector.z, 0, edgeVector.x).normalize();
          closestNormal = normalVector;
        }
      }
    }

    if (closestEdge && closestDistance < this.maxDistance) {
      // Position the dock at the closest point on the edge
      const dockPosition = this.getClosestPointOnEdge(
        closestEdge.start, 
        closestEdge.end, 
        target
      );
      
      // Move the dock slightly away from the edge into the water
      if (closestNormal) {
        dockPosition.add(closestNormal.multiplyScalar(2.5)); // Half the dock width
      }
      
      return { 
        position: dockPosition, 
        landId: closestLandId,
        normal: closestNormal
      };
    }

    return { position: null, landId: null };
  }

  private getWaterEdges(polygon: any): { start: THREE.Vector3, end: THREE.Vector3 }[] {
    const waterEdges: { start: THREE.Vector3, end: THREE.Vector3 }[] = [];
    
    if (!polygon.geometry || !polygon.geometry.coordinates || polygon.geometry.coordinates.length === 0) {
      return waterEdges;
    }
    
    // Get the outer ring of coordinates
    const coordinates = polygon.geometry.coordinates[0];
    
    // Check each edge to see if it's a water edge
    for (let i = 0; i < coordinates.length - 1; i++) {
      const start = new THREE.Vector3(coordinates[i][0], this.waterLevel, coordinates[i][1]);
      const end = new THREE.Vector3(coordinates[i+1][0], this.waterLevel, coordinates[i+1][1]);
      
      if (this.isWaterEdge(polygon, i, i+1)) {
        waterEdges.push({ start, end });
      }
    }
    
    // Check the closing edge
    const lastIndex = coordinates.length - 1;
    if (lastIndex > 0) {
      const start = new THREE.Vector3(coordinates[lastIndex][0], this.waterLevel, coordinates[lastIndex][1]);
      const end = new THREE.Vector3(coordinates[0][0], this.waterLevel, coordinates[0][1]);
      
      if (this.isWaterEdge(polygon, lastIndex, 0)) {
        waterEdges.push({ start, end });
      }
    }
    
    return waterEdges;
  }

  private isWaterEdge(polygon: any, startIdx: number, endIdx: number): boolean {
    // In a real implementation, this would check if this edge borders water
    // For simplicity, we'll assume edges that don't have neighboring polygons are water edges
    
    // Check if this edge has a neighboring polygon
    if (polygon.neighbors && Array.isArray(polygon.neighbors)) {
      for (const neighbor of polygon.neighbors) {
        // If there's a neighbor polygon that shares this edge, it's not a water edge
        if (this.edgeSharesNeighbor(polygon, neighbor, startIdx, endIdx)) {
          return false;
        }
      }
    }
    
    // If we didn't find a neighbor for this edge, it's a water edge
    return true;
  }

  private edgeSharesNeighbor(polygon: any, neighbor: any, startIdx: number, endIdx: number): boolean {
    // This is a simplified check - in a real implementation, you would need to check
    // if the specific edge is shared with the neighbor
    
    // For now, we'll just return false to treat all edges as water edges for demonstration
    return false;
  }

  private getClosestPointOnEdge(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3): THREE.Vector3 {
    // Create a line from start to end
    const line = new THREE.Line3(start, end);
    
    // Get the closest point on the line
    const closestPoint = new THREE.Vector3();
    line.closestPointToPoint(point, true, closestPoint);
    
    return closestPoint;
  }
}
