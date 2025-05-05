import * as THREE from 'three';

export class RaycastingUtils {
  /**
   * Find intersection points between a ray and objects
   * @param origin Ray origin
   * @param direction Ray direction
   * @param objects Objects to test against
   * @param maxDistance Maximum distance to check
   * @returns Array of intersection points
   */
  public static findIntersections(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    objects: THREE.Object3D[],
    maxDistance: number = 100
  ): THREE.Vector3[] {
    const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, maxDistance);
    const intersections = raycaster.intersectObjects(objects, true);
    
    return intersections.map(intersection => intersection.point);
  }
  
  /**
   * Find the closest point on any object to the given point
   * @param point Point to check from
   * @param objects Objects to check against
   * @param maxDistance Maximum distance to check
   * @returns Closest point or null if none found
   */
  public static findClosestPoint(
    point: THREE.Vector3,
    objects: THREE.Object3D[],
    maxDistance: number = 100
  ): THREE.Vector3 | null {
    // Cast rays in multiple directions
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1)
    ];
    
    let closestPoint: THREE.Vector3 | null = null;
    let closestDistance = maxDistance;
    
    // Check each direction
    for (const direction of directions) {
      const intersections = this.findIntersections(point, direction, objects, maxDistance);
      
      // Find closest intersection
      for (const intersection of intersections) {
        const distance = point.distanceTo(intersection);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPoint = intersection;
        }
      }
    }
    
    return closestPoint;
  }
}
