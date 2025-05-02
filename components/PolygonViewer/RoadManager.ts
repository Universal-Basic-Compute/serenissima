import * as THREE from 'three';

interface Road {
  id: string;
  points: THREE.Vector3[];
  mesh: THREE.Mesh;
  curvature: number;
}

export default class RoadManager {
  private scene: THREE.Scene;
  private roads: Road[] = [];
  private textureLoader: THREE.TextureLoader;
  private roadTexture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    
    // Load road texture
    this.textureLoader.load(
      '/textures/road.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 10);
        this.roadTexture = texture;
      },
      undefined,
      (error) => {
        console.error('Error loading road texture:', error);
      }
    );
  }

  public createRoad(points: THREE.Vector3[], curvature: number = 0.5): string {
    if (points.length < 2) {
      console.error('RoadManager: Cannot create road with less than 2 points');
      return '';
    }
    
    console.log(`RoadManager: Creating road with ${points.length} points and curvature ${curvature}`);
    
    // Create a unique ID for the road
    const id = `road-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Create the road mesh
    const mesh = this.createRoadMesh(points, curvature);
    
    // Add to scene
    console.log(`RoadManager: Adding road mesh to scene with ID ${id}`);
    this.scene.add(mesh);
    
    // Store the road
    const road: Road = {
      id,
      points: points.map(p => p.clone()), // Clone points to avoid reference issues
      mesh,
      curvature
    };
    
    this.roads.push(road);
    console.log(`RoadManager: Road created successfully, total roads: ${this.roads.length}`);
    
    return id;
  }

  public removeRoad(id: string): boolean {
    const index = this.roads.findIndex(road => road.id === id);
    
    if (index === -1) {
      console.warn(`Road with ID ${id} not found`);
      return false;
    }
    
    // Remove from scene
    const road = this.roads[index];
    this.scene.remove(road.mesh);
    
    // Dispose of geometry and material
    if (road.mesh.geometry) {
      road.mesh.geometry.dispose();
    }
    
    if (road.mesh.material) {
      if (Array.isArray(road.mesh.material)) {
        road.mesh.material.forEach(m => m.dispose());
      } else {
        road.mesh.material.dispose();
      }
    }
    
    // Remove from array
    this.roads.splice(index, 1);
    
    return true;
  }

  public getRoads(): Road[] {
    return [...this.roads];
  }

  private createRoadMesh(points: THREE.Vector3[], curvature: number): THREE.Mesh {
    // Create a curved path based on the points
    const curve = this.createCurvedPath(points, curvature);
    
    // Create road geometry
    const roadWidth = 0.3; // Changed from 1.5 to 0.3 (5 times thinner)
    const roadGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    
    // Sample points along the curve
    const numPoints = Math.max(points.length * 10, 50);
    const curvePoints = curve.getPoints(numPoints);
    
    // Create road segments
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const current = curvePoints[i];
      const next = curvePoints[i + 1];
      
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
      positions.push(v1.x, v1.y + 0.15, v1.z); // Slightly above polygons (0.15 instead of 0.05)
      positions.push(v2.x, v2.y + 0.15, v2.z);
      positions.push(v3.x, v3.y + 0.15, v3.z);
      
      // Second triangle
      positions.push(v2.x, v2.y + 0.15, v2.z);
      positions.push(v4.x, v4.y + 0.15, v4.z);
      positions.push(v3.x, v3.y + 0.15, v3.z);
      
      // UVs for texture mapping
      const segmentLength = current.distanceTo(next);
      const uOffset = i / (curvePoints.length - 1);
      
      uvs.push(0, uOffset * 10);
      uvs.push(1, uOffset * 10);
      uvs.push(0, (uOffset + segmentLength) * 10);
      
      uvs.push(1, uOffset * 10);
      uvs.push(1, (uOffset + segmentLength) * 10);
      uvs.push(0, (uOffset + segmentLength) * 10);
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
      map: this.roadTexture,
      side: THREE.DoubleSide
    });
    
    // Create road mesh
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.renderOrder = 15; // Above ground, below buildings
    
    // Mark as road for special handling
    road.userData.isRoad = true;
    
    return road;
  }

  private createCurvedPath(points: THREE.Vector3[], curvature: number): THREE.Curve<THREE.Vector3> {
    if (points.length === 2) {
      // For just two points, use a straight line
      return new THREE.LineCurve3(points[0], points[1]);
    }
    
    // For more points, use a curved path
    if (curvature === 0) {
      // No curvature - use a polyline
      return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0);
    } else {
      // Use Catmull-Rom curve with tension based on curvature
      return new THREE.CatmullRomCurve3(
        points,
        false,
        'centripetal',
        1 - curvature // Convert curvature to tension (1 = straight, 0 = curved)
      );
    }
  }

  public cleanup(): void {
    console.log(`Cleaning up ${this.roads.length} roads`);
    
    // Remove all roads
    this.roads.forEach(road => {
      this.scene.remove(road.mesh);
      
      if (road.mesh.geometry) {
        road.mesh.geometry.dispose();
      }
      
      if (road.mesh.material) {
        if (Array.isArray(road.mesh.material)) {
          road.mesh.material.forEach(m => m.dispose());
        } else {
          road.mesh.material.dispose();
        }
      }
    });
    
    this.roads = [];
    
    // Dispose of texture
    if (this.roadTexture) {
      this.roadTexture.dispose();
      this.roadTexture = null;
    }
    
    // Find and remove any orphaned road meshes in the scene
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData && object.userData.isRoad) {
        console.log('Found orphaned road mesh, removing it');
        this.scene.remove(object);
        
        if (object.geometry) {
          object.geometry.dispose();
        }
        
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });
  }
}
