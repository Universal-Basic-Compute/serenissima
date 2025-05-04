import * as THREE from 'three';

/**
 * RoadCreatorFacade handles the Three.js specific logic for road creation
 * Following the architecture principles of separation of concerns
 */
export class RoadCreatorFacade {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private plane: THREE.Plane;
  private previewMesh: THREE.Mesh | null = null;
  private indicatorMesh: THREE.Mesh | null = null;
  private isDisposed: boolean = false;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  /**
   * Update mouse position for raycasting
   */
  public updateMousePosition(clientX: number, clientY: number): void {
    if (this.isDisposed) return;
    
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  }

  /**
   * Find intersection with polygon meshes
   * @returns The intersection point or null if no valid intersection found
   */
  public findIntersection(): THREE.Vector3 | null {
    if (this.isDisposed) return null;
    
    // Update the raycaster with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check for intersections with polygon meshes
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersection that is a polygon mesh
    for (const intersect of intersects) {
      // Check if this is a polygon mesh (not water, not clouds, etc.)
      if (intersect.object instanceof THREE.Mesh && 
          Math.abs(intersect.point.y - 0.1) < 0.2 && 
          !intersect.object.userData?.isRoad) {
        
        return intersect.point;
      }
    }
    
    return null;
  }

  /**
   * Create or update indicator mesh for road placement
   */
  public createIndicatorMesh(position: THREE.Vector3, isSnapped: boolean = false): void {
    if (this.isDisposed) return;
    
    // Remove existing indicator if any
    if (this.indicatorMesh) {
      this.scene.remove(this.indicatorMesh);
      if (this.indicatorMesh.geometry) this.indicatorMesh.geometry.dispose();
      if (this.indicatorMesh.material) {
        if (Array.isArray(this.indicatorMesh.material)) {
          this.indicatorMesh.material.forEach(m => m.dispose());
        } else {
          this.indicatorMesh.material.dispose();
        }
      }
    }

    // Create a circle geometry for the indicator
    const geometry = new THREE.CircleGeometry(0.3, 32);
    const material = new THREE.MeshBasicMaterial({
      color: isSnapped ? 0x00ff00 : 0xffaa00, // Green if snapped, orange otherwise
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const indicator = new THREE.Mesh(geometry, material);
    
    // Position the indicator
    indicator.position.copy(position);
    indicator.position.y += 0.25; // Position slightly above the ground
    
    // Rotate to be horizontal
    indicator.rotation.x = -Math.PI / 2;
    
    // Set high render order to ensure visibility
    indicator.renderOrder = 100;
    
    // Add to scene
    this.scene.add(indicator);
    this.indicatorMesh = indicator;
  }

  /**
   * Create a road mesh from the given points
   */
  public createRoadMesh(roadPoints: THREE.Vector3[], curvature: number): THREE.Mesh | null {
    if (this.isDisposed || roadPoints.length < 2) return null;
    
    // Remove existing preview mesh
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      if (this.previewMesh.geometry) this.previewMesh.geometry.dispose();
      if (this.previewMesh.material) {
        if (Array.isArray(this.previewMesh.material)) {
          this.previewMesh.material.forEach(m => m.dispose());
        } else {
          this.previewMesh.material.dispose();
        }
      }
      this.previewMesh = null;
    }
    
    try {
      // Create a curved path based on the points
      const curve = this.createCurvedPath(roadPoints, curvature);
      
      // Create road geometry
      const roadWidth = 0.15;
      const roadGeometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      
      // Sample points along the curve
      const numPoints = Math.max(roadPoints.length * 10, 50);
      const points = curve.getPoints(numPoints);
      
      // Create road segments
      for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        
        // Calculate direction vector
        const direction = new THREE.Vector3()
          .subVectors(next, current)
          .normalize();
        
        // Calculate perpendicular vector
        const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x)
          .normalize()
          .multiplyScalar(roadWidth / 2);
        
        // Create quad vertices
        const v1 = new THREE.Vector3().addVectors(current, perpendicular);
        const v2 = new THREE.Vector3().subVectors(current, perpendicular);
        const v3 = new THREE.Vector3().addVectors(next, perpendicular);
        const v4 = new THREE.Vector3().subVectors(next, perpendicular);
        
        // First triangle
        positions.push(v1.x, v1.y + 0.2, v1.z);
        positions.push(v2.x, v2.y + 0.2, v2.z);
        positions.push(v3.x, v3.y + 0.2, v3.z);
        
        // Second triangle
        positions.push(v2.x, v2.y + 0.2, v2.z);
        positions.push(v4.x, v4.y + 0.2, v4.z);
        positions.push(v3.x, v3.y + 0.2, v3.z);
        
        // UVs for texture mapping
        const segmentLength = current.distanceTo(next);
        const uOffset = i / (points.length - 1);
        
        uvs.push(0, uOffset);
        uvs.push(1, uOffset);
        uvs.push(0, uOffset + segmentLength);
        
        uvs.push(1, uOffset);
        uvs.push(1, uOffset + segmentLength);
        uvs.push(0, uOffset + segmentLength);
      }
      
      // Set attributes
      roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      roadGeometry.computeVertexNormals();
      
      // Create road material
      const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        transparent: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });
      
      // Create road mesh
      const road = new THREE.Mesh(roadGeometry, roadMaterial);
      road.renderOrder = 30;
      
      // Mark as road for special handling
      road.userData.isRoad = true;
      road.userData.alwaysVisible = true;
      
      // Force the mesh to be visible
      road.visible = true;
      
      // Add to scene
      this.scene.add(road);
      this.previewMesh = road;
      
      return road;
    } catch (error) {
      console.error('Error creating road mesh:', error);
      return null;
    }
  }

  /**
   * Create a curved path based on the points and curvature setting
   */
  private createCurvedPath(roadPoints: THREE.Vector3[], curvature: number): THREE.Curve<THREE.Vector3> {
    // For just two points, use a straight line
    if (roadPoints.length === 2) {
      return new THREE.LineCurve3(roadPoints[0], roadPoints[1]);
    }
    
    // For more points, use a polyline with controlled curvature
    return new THREE.CatmullRomCurve3(
      roadPoints,
      false,
      'centripetal',
      Math.max(0.05, curvature * 0.2) // Scale curvature to a reasonable range (0.05-0.2)
    );
  }

  /**
   * Find the closest snap point to the given position
   * @returns The snap point or null if no valid snap point found
   */
  public findSnapPoint(position: THREE.Vector3, existingPoints: THREE.Vector3[]): THREE.Vector3 | null {
    if (this.isDisposed) return null;
    
    const SNAP_THRESHOLD_WORLD = 0.5; // Distance in world units to snap
    
    // 1. Try to snap to polygon edges
    const polygonMeshes = this.scene.children.filter(
      child => child instanceof THREE.Mesh && 
      !child.userData?.isRoad && 
      Math.abs(child.position.y - 0.1) < 0.2
    );
    
    let closestEdgePoint = null;
    let minEdgeDistance = SNAP_THRESHOLD_WORLD;
    
    for (const mesh of polygonMeshes) {
      if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) continue;
      
      // Extract polygon vertices
      const positionAttr = mesh.geometry.attributes.position;
      const vertices = [];
      
      for (let i = 0; i < positionAttr.count; i++) {
        vertices.push(new THREE.Vector3(
          positionAttr.getX(i),
          positionAttr.getY(i),
          positionAttr.getZ(i)
        ));
      }
      
      // Convert to world coordinates
      const worldVertices = vertices.map(v => {
        const worldVertex = v.clone();
        mesh.localToWorld(worldVertex);
        return worldVertex;
      });
      
      // Find closest point on edges
      for (let i = 0; i < worldVertices.length; i++) {
        const start = worldVertices[i];
        const end = worldVertices[(i + 1) % worldVertices.length];
        
        // Find closest point on this edge segment
        const edge = new THREE.Line3(start, end);
        const closestPoint = new THREE.Vector3();
        edge.closestPointToPoint(position, true, closestPoint);
        
        const distance = closestPoint.distanceTo(position);
        
        if (distance < minEdgeDistance) {
          minEdgeDistance = distance;
          closestEdgePoint = closestPoint;
        }
      }
    }
    
    // 2. Try to snap to existing roads
    const roadMeshes = this.scene.children.filter(
      child => child instanceof THREE.Mesh && child.userData?.isRoad
    );
    
    let closestRoadPoint = null;
    let minRoadDistance = SNAP_THRESHOLD_WORLD;
    
    for (const mesh of roadMeshes) {
      if (!(mesh instanceof THREE.Mesh) || !mesh.geometry) continue;
      
      // Extract road vertices
      const positionAttr = mesh.geometry.attributes.position;
      const vertices = [];
      
      for (let i = 0; i < positionAttr.count; i++) {
        vertices.push(new THREE.Vector3(
          positionAttr.getX(i),
          positionAttr.getY(i),
          positionAttr.getZ(i)
        ));
      }
      
      // Convert to world coordinates
      const worldVertices = vertices.map(v => {
        const worldVertex = v.clone();
        mesh.localToWorld(worldVertex);
        return worldVertex;
      });
      
      // Find closest point on road segments
      for (let i = 0; i < worldVertices.length - 1; i += 3) {
        // Roads are triangles, so we need to check each edge of the triangle
        const v1 = worldVertices[i];
        const v2 = worldVertices[i + 1];
        const v3 = worldVertices[i + 2];
        
        const edges = [
          new THREE.Line3(v1, v2),
          new THREE.Line3(v2, v3),
          new THREE.Line3(v3, v1)
        ];
        
        for (const edge of edges) {
          const closestPoint = new THREE.Vector3();
          edge.closestPointToPoint(position, true, closestPoint);
          
          const distance = closestPoint.distanceTo(position);
          
          if (distance < minRoadDistance) {
            minRoadDistance = distance;
            closestRoadPoint = closestPoint;
          }
        }
      }
    }
    
    // 3. Also try to snap to existing points in the current road
    let closestExistingPoint = null;
    let minExistingDistance = SNAP_THRESHOLD_WORLD;
    
    for (const point of existingPoints) {
      const distance = point.distanceTo(position);
      
      if (distance < minExistingDistance) {
        minExistingDistance = distance;
        closestExistingPoint = point;
      }
    }
    
    // Choose the closest snap point among all options
    if (closestEdgePoint && minEdgeDistance < minRoadDistance && minEdgeDistance < minExistingDistance) {
      return closestEdgePoint;
    } else if (closestRoadPoint && minRoadDistance < minExistingDistance) {
      return closestRoadPoint;
    } else if (closestExistingPoint) {
      return closestExistingPoint;
    }
    
    return null;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    
    // Clean up preview mesh
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      if (this.previewMesh.geometry) this.previewMesh.geometry.dispose();
      if (this.previewMesh.material) {
        if (Array.isArray(this.previewMesh.material)) {
          this.previewMesh.material.forEach(m => m.dispose());
        } else {
          this.previewMesh.material.dispose();
        }
      }
      this.previewMesh = null;
    }
    
    // Clean up indicator mesh
    if (this.indicatorMesh) {
      this.scene.remove(this.indicatorMesh);
      if (this.indicatorMesh.geometry) this.indicatorMesh.geometry.dispose();
      if (this.indicatorMesh.material) {
        if (Array.isArray(this.indicatorMesh.material)) {
          this.indicatorMesh.material.forEach(m => m.dispose());
        } else {
          this.indicatorMesh.material.dispose();
        }
      }
      this.indicatorMesh = null;
    }
  }
}
