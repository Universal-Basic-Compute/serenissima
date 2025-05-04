/**
 * TODO: Refactor according to architecture
 * - Move to lib/threejs directory as part of the rendering layer
 * - Move data persistence to service layer
 * - Implement proper error handling
 * - Add geometry sharing for better performance
 * - Improve resource management in cleanup method
 */
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
  private roadNormalMap: THREE.Texture | null = null;
  private roadRoughnessMap: THREE.Texture | null = null;
  private roadGeometryCache: Map<string, THREE.BufferGeometry> | null = null;

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
          
        // Force update existing roads with the new texture
        this.roads.forEach(road => {
          if (road.mesh && road.mesh.material) {
            if (road.mesh.material instanceof THREE.MeshStandardMaterial) {
              road.mesh.material.map = texture;
              road.mesh.material.needsUpdate = true;
            }
          }
        });
      },
      undefined,
      (error) => {
        console.error('Error loading road texture:', error);
      }
    );
    
    // Load road normal map
    this.textureLoader.load(
      '/textures/road_normal.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 10);
        this.roadNormalMap = texture;
      },
      undefined,
      (error) => {
        console.error('Error loading road normal map:', error);
      }
    );
    
    // Load road roughness map
    this.textureLoader.load(
      '/textures/road_roughness.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 10);
        this.roadRoughnessMap = texture;
      },
      undefined,
      (error) => {
        console.error('Error loading road roughness map:', error);
      }
    );
  }

  public createRoad(points: THREE.Vector3[], curvature: number = 0.5): string {
    if (points.length < 2) {
      console.error('RoadManager: Cannot create road with less than 2 points');
      return '';
    }
    
    console.log(`RoadManager: Creating road with ${points.length} points and curvature ${curvature}`);
    
    // Try to import the 3D utilities for path simplification
    try {
      // Dynamic import of utils3D
      const utils3DModule = require('./utils3D');
      const { simplifyPath } = utils3DModule;
      
      // Simplify the path to remove redundant points
      const simplifiedPoints = simplifyPath(points, 0.05);
      console.log(`RoadManager: Simplified path from ${points.length} to ${simplifiedPoints.length} points`);
      
      // Create a unique ID for the road
      const id = `road-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create the road mesh with simplified points
      const mesh = this.createRoadMesh(simplifiedPoints, curvature);
      
      // Add to scene
      console.log(`RoadManager: Adding road mesh to scene with ID ${id}`);
      this.scene.add(mesh);
      
      // Store the road
      const road: Road = {
        id,
        points: simplifiedPoints.map(p => p.clone()), // Clone points to avoid reference issues
        mesh,
        curvature
      };
      
      this.roads.push(road);
      console.log(`RoadManager: Road created successfully, total roads: ${this.roads.length}`);
      
      return id;
    } catch (error) {
      console.warn('Failed to import utils3D for path simplification:', error);
      
      // Fallback to original method
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
    // Create a static road geometry cache to avoid recreating similar geometries
    if (!this.roadGeometryCache) {
      this.roadGeometryCache = new Map();
    }
    
    // Try to import the 3D utilities for smoother roads
    try {
      // Dynamic import of utils3D
      const utils3DModule = require('./utils3D');
      const { smoothPath } = utils3DModule;
      
      // Smooth the road points for a more natural curve
      const smoothedPoints = smoothPath(points, curvature, Math.max(points.length * 5, 20));
      
      // Create a curved path based on the smoothed points
      const curve = this.createCurvedPath(smoothedPoints, curvature);
      
      // Create road geometry
      const roadWidth = 0.15; // Changed from 0.0735 back to 0.15 (make it thicker)
      const roadGeometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const uvs: number[] = [];
      const normals: number[] = []; // Add normals for better lighting
      
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
        
        // Height offset to prevent z-fighting
        const heightOffset = 0.25; // Increased from 0.2 to 0.25
        
        // First triangle
        positions.push(v1.x, v1.y + heightOffset, v1.z);
        positions.push(v2.x, v2.y + heightOffset, v2.z);
        positions.push(v3.x, v3.y + heightOffset, v3.z);
        
        // Second triangle
        positions.push(v2.x, v2.y + heightOffset, v2.z);
        positions.push(v4.x, v4.y + heightOffset, v4.z);
        positions.push(v3.x, v3.y + heightOffset, v3.z);
        
        // Add normals (all pointing up)
        for (let j = 0; j < 6; j++) {
          normals.push(0, 1, 0);
        }
        
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
      roadGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      
      // Create road material with better visibility
      const roadMaterial = new THREE.MeshBasicMaterial({
        color: 0x555555,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        transparent: false,
        polygonOffset: true,
        polygonOffsetFactor: -12, // Increased from -10 to -12 for even better visibility
        polygonOffsetUnits: -12   // Increased from -10 to -12 for even better visibility
      });
      
      // Apply texture if available
      if (this.roadTexture) {
        roadMaterial.map = this.roadTexture;
        roadMaterial.needsUpdate = true;
      }
      
      // Create road mesh
      const road = new THREE.Mesh(roadGeometry, roadMaterial);
      road.renderOrder = 120; // Increased from 100 to 120 for even higher priority
      
      // Mark as road for special handling
      road.userData.isRoad = true;
      road.userData.alwaysVisible = true;
      road.userData.renderPriority = 'high';
      
      // Force the mesh to be visible
      road.visible = true;
      
      return road;
      
    } catch (error) {
      console.warn('Failed to import utils3D, falling back to basic road creation:', error);
      
      // Fallback to original method
      const curve = this.createCurvedPath(points, curvature);
      
      // Create road geometry
      const roadWidth = 0.15;
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
        positions.push(v1.x, v1.y + 0.25, v1.z); // Increased height offset
        positions.push(v2.x, v2.y + 0.25, v2.z);
        positions.push(v3.x, v3.y + 0.25, v3.z);
        
        // Second triangle
        positions.push(v2.x, v2.y + 0.25, v2.z);
        positions.push(v4.x, v4.y + 0.25, v4.z);
        positions.push(v3.x, v3.y + 0.25, v3.z);
        
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
      
      // Create road material with better visibility
      const roadMaterial = new THREE.MeshBasicMaterial({
        color: 0x555555,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        transparent: false,
        polygonOffset: true,
        polygonOffsetFactor: -12, // Increased for better visibility
        polygonOffsetUnits: -12
      });
      
      // Apply texture if available
      if (this.roadTexture) {
        roadMaterial.map = this.roadTexture;
        roadMaterial.needsUpdate = true;
      }
      
      // Create road mesh
      const road = new THREE.Mesh(roadGeometry, roadMaterial);
      road.renderOrder = 120; // Higher priority
      
      // Mark as road for special handling
      road.userData.isRoad = true;
      road.userData.alwaysVisible = true;
      road.userData.renderPriority = 'high';
      
      // Force the mesh to be visible
      road.visible = true;
      
      return road;
    }
  }

  private createCurvedPath(points: THREE.Vector3[], curvature: number): THREE.Curve<THREE.Vector3> {
    if (points.length === 2) {
      // For just two points, use a straight line
      return new THREE.LineCurve3(points[0], points[1]);
    }
    
    // For Venice, we want straighter roads with sharp corners for snapped points
    // Use a very low tension value for straighter segments
    const curve = new THREE.CatmullRomCurve3(
      points,
      false,
      'centripetal',
      0.1 // Very low tension value for straighter roads
    );
    
    // Set the curve type to ensure sharp corners at snapped points
    curve.curveType = 'centripetal';
    
    return curve;
  }

  // Add method to force update road visibility
  public updateRoadVisibility(): void {
    this.roads.forEach(road => {
      if (road.mesh) {
        // Force the mesh to be visible
        road.mesh.visible = true;
        
        // Ensure high render order
        road.mesh.renderOrder = 100; // Increased from 30 to 100
        
        // Ensure the material is properly configured
        if (road.mesh.material instanceof THREE.MeshBasicMaterial) {
          road.mesh.material.needsUpdate = true;
          road.mesh.material.depthWrite = false;
          road.mesh.material.polygonOffset = true;
          road.mesh.material.polygonOffsetFactor = -10; // Increased from -4 to -10
          road.mesh.material.polygonOffsetUnits = -10;  // Increased from -4 to -10
        } else if (Array.isArray(road.mesh.material)) {
          road.mesh.material.forEach(mat => {
            if (mat instanceof THREE.MeshBasicMaterial) {
              mat.needsUpdate = true;
              mat.depthWrite = false;
              mat.polygonOffset = true;
              mat.polygonOffsetFactor = -10; // Increased from -4 to -10
              mat.polygonOffsetUnits = -10;  // Increased from -4 to -10
            }
          });
        }
        
        // Force geometry update
        if (road.mesh.geometry) {
          road.mesh.geometry.attributes.position.needsUpdate = true;
        }
      }
    });
  }

  // Add a method to remove all roads
  public removeAllRoads(): void {
    console.log(`Removing all ${this.roads.length} roads`);
    
    // Remove all roads from the scene and dispose of resources
    this.roads.forEach(road => {
      if (this.scene) {
        this.scene.remove(road.mesh);
      }
      
      if (road.mesh.geometry) {
        road.mesh.geometry.dispose();
      }
      
      if (road.mesh.material) {
        if (Array.isArray(road.mesh.material)) {
          road.mesh.material.forEach(m => {
            if (m) m.dispose();
          });
        } else if (road.mesh.material) {
          road.mesh.material.dispose();
        }
      }
    });
    
    // Clear the roads array
    this.roads = [];
    
    // Also find and remove any orphaned road meshes
    if (this.scene) {
      try {
        const objectsToRemove: THREE.Object3D[] = [];
        
        // First collect all objects to remove
        this.scene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.userData && object.userData.isRoad) {
            console.log('Found orphaned road mesh, removing it');
            objectsToRemove.push(object);
          }
        });
        
        // Then remove them in a separate step
        objectsToRemove.forEach(object => {
          this.scene.remove(object);
          
          if ((object as THREE.Mesh).geometry) {
            (object as THREE.Mesh).geometry.dispose();
          }
          
          if ((object as THREE.Mesh).material) {
            const material = (object as THREE.Mesh).material;
            if (Array.isArray(material)) {
              material.forEach(m => {
                if (m) m.dispose();
              });
            } else if (material) {
              material.dispose();
            }
          }
        });
        
        console.log(`Removed ${objectsToRemove.length} orphaned road meshes`);
      } catch (error) {
        console.error('Error removing orphaned road meshes:', error);
      }
    }
  }

  public saveRoadToAirtable(roadId: string, landId: string | null, userId: string | null): Promise<any> {
    if (!roadId) {
      console.error('Cannot save road: Missing road ID');
      return Promise.reject(new Error('Missing road ID'));
    }
    
    // Find the road by ID
    const road = this.roads.find(r => r.id === roadId);
    if (!road) {
      console.error(`Road with ID ${roadId} not found`);
      return Promise.reject(new Error(`Road with ID ${roadId} not found`));
    }
    
    // Extract road points for saving
    const roadPoints = road.points.map(point => ({
      x: point.x,
      y: point.y,
      z: point.z
    }));
    
    // Create road data object
    const roadData = {
      id: roadId,
      type: 'road',
      land_id: landId,
      user_id: userId,
      points: JSON.stringify(roadPoints),
      curvature: road.curvature,
      created_at: new Date().toISOString()
    };
    
    // Send to API
    return fetch('/api/save-road', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(roadData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to save road: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log(`Road ${roadId} saved successfully:`, data);
      return data;
    })
    .catch(error => {
      console.error('Error saving road:', error);
      throw error;
    });
  }
  
  public loadRoadsFromAirtable(): Promise<void> {
    return fetch('/api/get-roads')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load roads: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success && Array.isArray(data.roads)) {
          console.log(`Loading ${data.roads.length} roads from Airtable`);
          
          // Clear existing roads first
          this.removeAllRoads();
          
          // Create each road
          data.roads.forEach(roadData => {
            try {
              // Parse the points from the stored string
              const points = JSON.parse(roadData.points).map(point => 
                new THREE.Vector3(point.x, point.y, point.z)
              );
              
              // Create the road with the stored curvature
              const roadId = this.createRoad(points, roadData.curvature || 0.5);
              console.log(`Loaded road ${roadId} from Airtable`);
            } catch (error) {
              console.error(`Error creating road from Airtable data:`, error);
            }
          });
        }
      })
      .catch(error => {
        console.error('Error loading roads from Airtable:', error);
      });
  }

  public cleanup(): void {
    console.log(`Cleaning up ${this.roads.length} roads`);
    
    // Remove all roads
    this.roads.forEach(road => {
      if (this.scene) {
        this.scene.remove(road.mesh);
      }
      
      if (road.mesh.geometry) {
        road.mesh.geometry.dispose();
      }
      
      if (road.mesh.material) {
        if (Array.isArray(road.mesh.material)) {
          road.mesh.material.forEach(m => {
            if (m) m.dispose();
          });
        } else if (road.mesh.material) {
          road.mesh.material.dispose();
        }
      }
    });
    
    this.roads = [];
    
    // Dispose of textures
    if (this.roadTexture) {
      this.roadTexture.dispose();
      this.roadTexture = null;
    }
    
    if (this.roadNormalMap) {
      this.roadNormalMap.dispose();
      this.roadNormalMap = null;
    }
    
    if (this.roadRoughnessMap) {
      this.roadRoughnessMap.dispose();
      this.roadRoughnessMap = null;
    }
    
    // Store a local reference to scene to avoid undefined issues during cleanup
    const currentScene = this.scene;
    
    // Find and remove any orphaned road meshes in the scene
    if (currentScene) {
      try {
        const objectsToRemove: THREE.Object3D[] = [];
        
        // First collect all objects to remove
        currentScene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.userData && object.userData.isRoad) {
            console.log('Found orphaned road mesh, removing it');
            objectsToRemove.push(object);
          }
        });
        
        // Then remove them in a separate step to avoid modifying the scene during traversal
        objectsToRemove.forEach(object => {
          currentScene.remove(object);
          
          if ((object as THREE.Mesh).geometry) {
            (object as THREE.Mesh).geometry.dispose();
          }
          
          if ((object as THREE.Mesh).material) {
            const material = (object as THREE.Mesh).material;
            if (Array.isArray(material)) {
              material.forEach(m => {
                if (m) m.dispose();
              });
            } else if (material) {
              material.dispose();
            }
          }
        });
      } catch (error) {
        console.error('Error cleaning up orphaned road meshes:', error);
      }
    }
  }
}
