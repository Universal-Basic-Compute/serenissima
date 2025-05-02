import * as THREE from 'three';

/**
 * Finds the closest point on a polygon edge to a given point
 */
export function findClosestPointOnPolygonEdge(point: THREE.Vector3, polygon: THREE.Vector3[]): THREE.Vector3 {
  let closestPoint = null;
  let minDistance = Infinity;
  
  // Check each edge of the polygon
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length]; // Wrap around to the first point
    
    // Find the closest point on this edge
    const closest = findClosestPointOnLineSegment(point, start, end);
    const distance = point.distanceTo(closest);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = closest;
    }
  }
  
  return closestPoint || new THREE.Vector3();
}

/**
 * Finds the closest point on a line segment to a given point
 */
export function findClosestPointOnLineSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3 {
  const line = new THREE.Line3(start, end);
  const closestPoint = new THREE.Vector3();
  line.closestPointToPoint(point, true, closestPoint);
  return closestPoint;
}

/**
 * Smooths a path of points using Catmull-Rom spline interpolation
 */
export function smoothPath(points: THREE.Vector3[], tension: number = 0.5, segments: number = 10): THREE.Vector3[] {
  if (points.length < 3) return [...points]; // Not enough points to smooth
  
  const curve = new THREE.CatmullRomCurve3(
    points,
    false, // closed
    'centripetal', // curve type
    tension // tension parameter (0-1)
  );
  
  // Sample points along the curve
  return curve.getPoints(segments * (points.length - 1));
}

/**
 * Simplifies a path by removing points that are too close to each other
 */
export function simplifyPath(points: THREE.Vector3[], minDistance: number = 0.1): THREE.Vector3[] {
  if (points.length <= 2) return [...points];
  
  const result: THREE.Vector3[] = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const lastPoint = result[result.length - 1];
    const currentPoint = points[i];
    
    if (lastPoint.distanceTo(currentPoint) >= minDistance) {
      result.push(currentPoint);
    }
  }
  
  // Always include the last point if it's not already included
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  
  return result;
}

/**
 * Calculates the total length of a path
 */
export function calculatePathLength(points: THREE.Vector3[]): number {
  let length = 0;
  
  for (let i = 1; i < points.length; i++) {
    length += points[i].distanceTo(points[i - 1]);
  }
  
  return length;
}

/**
 * Resamples a path to have evenly spaced points
 */
export function resamplePath(points: THREE.Vector3[], numPoints: number): THREE.Vector3[] {
  if (points.length < 2) return [...points];
  
  const curve = new THREE.CatmullRomCurve3(points);
  return curve.getPoints(numPoints - 1);
}

/**
 * Snaps a point to the nearest point on any polygon in the scene
 */
export function snapPointToPolygons(
  point: THREE.Vector3, 
  scene: THREE.Scene, 
  maxDistance: number = 1.0
): THREE.Vector3 | null {
  // Create a small sphere around the point to find nearby objects
  const sphereGeometry = new THREE.SphereGeometry(maxDistance);
  const sphereMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.copy(point);
  
  // Temporarily add to scene
  scene.add(sphere);
  
  // Find intersecting objects
  const intersectingObjects: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && 
        object !== sphere && 
        !object.userData.isRoad &&
        sphere.position.distanceTo(object.position) < maxDistance * 2) {
      intersectingObjects.push(object);
    }
  });
  
  // Remove temporary sphere
  scene.remove(sphere);
  sphereGeometry.dispose();
  sphereMaterial.dispose();
  
  if (intersectingObjects.length === 0) {
    return null;
  }
  
  // Find the closest point on any of the intersecting objects
  let closestPoint = null;
  let minDistance = Infinity;
  
  for (const object of intersectingObjects) {
    if (object instanceof THREE.Mesh && object.geometry) {
      // Get the vertices from the geometry
      const positionAttribute = object.geometry.getAttribute('position');
      if (!positionAttribute) continue;
      
      const vertices: THREE.Vector3[] = [];
      for (let i = 0; i < positionAttribute.count; i++) {
        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(positionAttribute, i);
        // Transform vertex to world space
        vertex.applyMatrix4(object.matrixWorld);
        vertices.push(vertex);
      }
      
      // Find the closest point on this object
      const closest = findClosestPointOnPolygonEdge(point, vertices);
      const distance = point.distanceTo(closest);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = closest;
      }
    }
  }
  
  return closestPoint;
}
