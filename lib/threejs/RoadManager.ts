import * as THREE from 'three';
import { RoadService, RoadData } from '../services/RoadService';
import { log } from '../logUtils';

/**
 * Interface for road data structure
 */
interface Road {
  id: string;
  points: THREE.Vector3[];
  mesh: THREE.Mesh;
  curvature: number;
}

/**
 * Manages road creation, rendering and persistence in the 3D scene
 * Part of the rendering layer in the architecture
 */
export class RoadManager {
  private scene: THREE.Scene;
  private roads: Road[] = [];
  private textureLoader: THREE.TextureLoader;
  private roadTexture: THREE.Texture | null = null;
  private roadNormalMap: THREE.Texture | null = null;
  private roadRoughnessMap: THREE.Texture | null = null;
  private roadGeometryCache: Map<string, THREE.BufferGeometry> = new Map();
  private geometryUsageCount: Map<string, number> = new Map();
  private isDisposed: boolean = false;
  private roadService: RoadService;
  private disposableResources: Array<{ dispose: () => void }> = [];

  /**
   * Creates a new RoadManager
   * @param scene The THREE.js scene to add roads to
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
    this.roadService = RoadService.getInstance();
    
    // Load road texture
    this.loadTextures();
  }

  /**
   * Load all road textures
   */
  private loadTextures(): void {
    try {
      // Load road texture
      this.textureLoader.load(
        '/textures/road.jpg',
        (texture) => {
          try {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 10);
            this.roadTexture = texture;
            // Track for disposal
            this.disposableResources.push(texture);
              
            // Force update existing roads with the new texture
            this.updateRoadTextures();
          } catch (textureSetupError) {
            log.error('Error setting up road texture:', textureSetupError);
          }
        },
        undefined,
        (error) => {
          log.error('Error loading road texture:', error);
        }
      );
      
      // Load road normal map
      this.textureLoader.load(
        '/textures/road_normal.jpg',
        (texture) => {
          try {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 10);
            this.roadNormalMap = texture;
            // Track for disposal
            this.disposableResources.push(texture);
          } catch (normalMapSetupError) {
            log.warn('Error setting up road normal map:', normalMapSetupError);
            // Continue without normal map
          }
        },
        undefined,
        (error) => {
          log.warn('Error loading road normal map:', error);
          // Continue without normal map
        }
      );
      
      // Load road roughness map
      this.textureLoader.load(
        '/textures/road_roughness.jpg',
        (texture) => {
          try {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 10);
            this.roadRoughnessMap = texture;
            // Track for disposal
            this.disposableResources.push(texture);
          } catch (roughnessMapSetupError) {
            log.warn('Error setting up road roughness map:', roughnessMapSetupError);
            // Continue without roughness map
          }
        },
        undefined,
        (error) => {
          log.warn('Error loading road roughness map:', error);
          // Continue without roughness map
        }
      );
    } catch (error) {
      log.error('Failed to load road textures:', error);
    }
  }

  /**
   * Update textures on existing roads
   */
  private updateRoadTextures(): void {
    try {
      this.roads.forEach(road => {
        try {
          if (road.mesh && road.mesh.material) {
            if (road.mesh.material instanceof THREE.MeshStandardMaterial) {
              road.mesh.material.map = this.roadTexture;
              road.mesh.material.needsUpdate = true;
            }
          }
        } catch (textureUpdateError) {
          log.warn('Failed to update road texture for a road:', textureUpdateError);
          // Continue with other roads even if one fails
        }
      });
    } catch (error) {
      log.error('Error updating road textures:', error);
    }
  }

  /**
   * Creates a new road in the scene
   * @param points Array of 3D points defining the road path
   * @param curvature Road curvature factor (0-1)
   * @param userId Optional creator user ID
   * @param landId Optional associated land ID
   * @returns ID of the created road
   */
  public createRoad(
    points: THREE.Vector3[], 
    curvature: number = 0.5,
    userId?: string,
    landId?: string
  ): string {
    if (this.isDisposed) return '';
    
    try {
      if (points.length < 2) {
        log.error('RoadManager: Cannot create road with less than 2 points');
        return '';
      }
      
      log.info(`RoadManager: Creating road with ${points.length} points and curvature ${curvature}`);
      
      // Try to import the 3D utilities for path simplification
      try {
        // Import from the correct location
        const utils3DModule = require('../../components/PolygonViewer/utils3D');
        const { simplifyPath } = utils3DModule;
        
        try {
          // Simplify the path to remove redundant points
          const simplifiedPoints = simplifyPath(points, 0.05);
          log.info(`RoadManager: Simplified path from ${points.length} to ${simplifiedPoints.length} points`);
              
          try {
            // Save to service and get ID
            const roadData = this.roadService.saveRoad(
              simplifiedPoints.map((p: THREE.Vector3) => p.clone()), // Clone points to avoid reference issues
              curvature,
              userId,
              landId
            );
            
            try {
              // Create the road mesh with simplified points
              const mesh = this.createRoadMesh(simplifiedPoints, curvature);
              
              if (!mesh) {
                throw new Error('Failed to create road mesh');
              }
              
              // Add to scene
              log.info(`RoadManager: Adding road mesh to scene with ID ${roadData.id}`);
              if (!this.scene) {
                throw new Error('Scene is null, cannot add road mesh');
              }
              this.scene.add(mesh);
              
              // Store the road
              const road: Road = {
                id: roadData.id,
                points: simplifiedPoints.map((p: THREE.Vector3) => p.clone()), // Clone points to avoid reference issues
                mesh,
                curvature
              };
              
              this.roads.push(road);
              log.info(`RoadManager: Road created successfully, total roads: ${this.roads.length}`);
              
              return roadData.id;
            } catch (meshError) {
              log.error('Failed to create or add road mesh:', meshError);
              // Try to clean up the saved road data since we couldn't create the mesh
              this.roadService.deleteRoad(roadData.id);
              throw meshError;
            }
          } catch (saveError) {
            log.error('Failed to save road to service:', saveError);
            throw saveError;
          }
        } catch (simplifyError) {
          log.warn('Failed to simplify path:', simplifyError);
          throw simplifyError;
        }
      } catch (error) {
        log.warn('Failed to import utils3D for path simplification:', error);
        
        // Fallback to original method
        try {
          // Save to service and get ID
          const roadData = this.roadService.saveRoad(
            points.map((p: THREE.Vector3) => p.clone()), // Clone points to avoid reference issues
            curvature,
            userId,
            landId
          );
          
          try {
            // Create the road mesh
            const mesh = this.createRoadMesh(points, curvature);
            
            if (!mesh) {
              throw new Error('Failed to create road mesh in fallback mode');
            }
            
            // Add to scene
            log.info(`RoadManager: Adding road mesh to scene with ID ${roadData.id} (fallback mode)`);
            if (!this.scene) {
              throw new Error('Scene is null, cannot add road mesh in fallback mode');
            }
            this.scene.add(mesh);
            
            // Store the road
            const road: Road = {
              id: roadData.id,
              points: points.map((p: THREE.Vector3) => p.clone()), // Clone points to avoid reference issues
              mesh,
              curvature
            };
            
            this.roads.push(road);
            log.info(`RoadManager: Road created successfully in fallback mode, total roads: ${this.roads.length}`);
            
            return roadData.id;
          } catch (meshError) {
            log.error('Failed to create or add road mesh in fallback mode:', meshError);
            // Try to clean up the saved road data since we couldn't create the mesh
            this.roadService.deleteRoad(roadData.id);
            return '';
          }
        } catch (saveError) {
          log.error('Failed to save road to service in fallback mode:', saveError);
          return '';
        }
      }
    } catch (unexpectedError) {
      log.error('Unexpected error in createRoad:', unexpectedError);
      return '';
    }
  }

  /**
   * Removes a road from the scene
   * @param id ID of the road to remove
   * @returns true if road was found and removed, false otherwise
   */
  public removeRoad(id: string): boolean {
    if (this.isDisposed) return false;
    
    try {
      const index = this.roads.findIndex(road => road.id === id);
      
      if (index === -1) {
        log.warn(`Road with ID ${id} not found`);
        return false;
      }
      
      try {
        // Remove from scene
        const road = this.roads[index];
        if (this.scene) {
          this.scene.remove(road.mesh);
        } else {
          log.warn(`Cannot remove road mesh from scene: scene is null`);
        }
        
        try {
          // Dispose of geometry and material
          if (road.mesh.geometry) {
            road.mesh.geometry.dispose();
          }
          
          if (road.mesh.material) {
            if (Array.isArray(road.mesh.material)) {
              road.mesh.material.forEach(m => {
                try {
                  if (m) m.dispose();
                } catch (materialDisposeError) {
                  log.warn(`Failed to dispose of road material:`, materialDisposeError);
                }
              });
            } else {
              try {
                road.mesh.material.dispose();
              } catch (materialDisposeError) {
                log.warn(`Failed to dispose of road material:`, materialDisposeError);
              }
            }
          }
        } catch (resourceDisposeError) {
          log.warn(`Error disposing road resources:`, resourceDisposeError);
          // Continue with removal even if resource disposal fails
        }
        
        // Remove from array
        this.roads.splice(index, 1);
        
        try {
          // Remove from service
          this.roadService.deleteRoad(id);
        } catch (serviceDeleteError) {
          log.error(`Failed to delete road from service:`, serviceDeleteError);
          // Continue with removal even if service deletion fails
        }
        
        return true;
      } catch (sceneRemoveError) {
        log.error(`Error removing road from scene:`, sceneRemoveError);
        
        // Try to remove from array and service even if scene removal fails
        try {
          this.roads.splice(index, 1);
          this.roadService.deleteRoad(id);
        } catch (cleanupError) {
          log.error(`Failed cleanup after scene removal error:`, cleanupError);
        }
        
        return false;
      }
    } catch (error) {
      log.error(`Unexpected error in removeRoad:`, error);
      return false;
    }
  }

  /**
   * Gets all roads
   * @returns Array of road objects
   */
  public getRoads(): Road[] {
    return [...this.roads];
  }

  /**
   * Generates a cache key for road geometry based on its properties
   * @param points Array of 3D points defining the road path
   * @param curvature Road curvature factor
   * @returns A string key for caching
   */
  private generateGeometryCacheKey(points: THREE.Vector3[], curvature: number): string {
    try {
      // Create a simplified representation of points for the key
      // We don't use the exact points to allow for reuse of similar geometries
      const simplifiedPoints = points.map((p: THREE.Vector3, i) => {
        // Only use every 3rd point for the key to allow more reuse
        if (i % 3 === 0) {
          // Round coordinates to reduce unique variations
          return `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10},${Math.round(p.z * 10) / 10}`;
        }
        return '';
      }).filter(p => p !== '').join('|');
      
      // Include point count and curvature in the key
      return `${points.length}:${Math.round(curvature * 10) / 10}:${simplifiedPoints}`;
    } catch (error) {
      log.warn('Error generating geometry cache key:', error);
      // Fallback to a simple key that will be less effective for caching
      return `${points.length}:${curvature}`;
    }
  }

  /**
   * Creates a mesh for a road
   * @param points Array of 3D points defining the road path
   * @param curvature Road curvature factor (0-1)
   * @returns THREE.js mesh for the road
   */
  private createRoadMesh(points: THREE.Vector3[], curvature: number): THREE.Mesh | null {
    try {
      // Try to import the 3D utilities for smoother roads
      try {
        // Import from the correct location
        const utils3DModule = require('../../components/PolygonViewer/utils3D');
        const { smoothPath } = utils3DModule;
        
        try {
          // Smooth the road points for a more natural curve
          const smoothedPoints = smoothPath(points, curvature, Math.max(points.length * 5, 20));
          
          try {
            // Create a curved path based on the smoothed points
            const curve = this.createCurvedPath(smoothedPoints, curvature);
        
            // Generate a cache key for this geometry
            const cacheKey = this.generateGeometryCacheKey(smoothedPoints, curvature);
            
            // Check if we already have this geometry in cache
            let roadGeometry: THREE.BufferGeometry;
            if (this.roadGeometryCache.has(cacheKey)) {
              // Reuse existing geometry
              const cachedGeometry = this.roadGeometryCache.get(cacheKey);
              if (cachedGeometry) {
                roadGeometry = cachedGeometry.clone();
              } else {
                // This shouldn't happen, but handle it gracefully
                log.warn(`Cache key ${cacheKey} exists but geometry is null, creating new geometry`);
                roadGeometry = new THREE.BufferGeometry();
              }
              
              // Update usage count
              const currentCount = this.geometryUsageCount.get(cacheKey) || 0;
              this.geometryUsageCount.set(cacheKey, currentCount + 1);
              
              log.info(`Reusing cached road geometry (key: ${cacheKey}, usage: ${currentCount + 1})`);
            } else {
              // Create new road geometry
              const roadWidth = 0.15; // Changed from 0.0735 back to 0.15 (make it thicker)
              roadGeometry = new THREE.BufferGeometry();
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
              
              // Store in cache for future reuse
              this.roadGeometryCache.set(cacheKey, roadGeometry.clone());
              this.geometryUsageCount.set(cacheKey, 1);
              
              log.info(`Created and cached new road geometry (key: ${cacheKey})`);
              
              // Limit cache size to prevent memory issues
              this.pruneGeometryCache();
            }
          
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
            
            // Track material for disposal
            this.disposableResources.push(roadMaterial);
            
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
          } catch (curveError) {
            log.error('Failed to create curved path:', curveError);
            throw curveError;
          }
        } catch (smoothError) {
          log.error('Failed to smooth path:', smoothError);
          throw smoothError;
        }
      } catch (utils3DError) {
        log.warn('Failed to import utils3D, falling back to basic road creation:', utils3DError);
        
        try {
          // Fallback to original method
          const curve = this.createCurvedPath(points, curvature);
          
          try {
            // Generate a cache key for this geometry
            const cacheKey = this.generateGeometryCacheKey(points, curvature);
            
            // Check if we already have this geometry in cache
            let roadGeometry: THREE.BufferGeometry;
            if (this.roadGeometryCache.has(cacheKey)) {
              // Reuse existing geometry
              const cachedGeometry = this.roadGeometryCache.get(cacheKey);
              if (cachedGeometry) {
                roadGeometry = cachedGeometry.clone();
                
                // Update usage count
                const currentCount = this.geometryUsageCount.get(cacheKey) || 0;
                this.geometryUsageCount.set(cacheKey, currentCount + 1);
                
                log.info(`Reusing cached road geometry in fallback mode (key: ${cacheKey}, usage: ${currentCount + 1})`);
              } else {
                // This shouldn't happen, but handle it gracefully
                log.warn(`Cache key ${cacheKey} exists but geometry is null, creating new geometry`);
                roadGeometry = new THREE.BufferGeometry();
              }
            } else {
              // Create new road geometry
              const roadWidth = 0.15;
              roadGeometry = new THREE.BufferGeometry();
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
              
              // Store in cache for future reuse
              this.roadGeometryCache.set(cacheKey, roadGeometry.clone());
              this.geometryUsageCount.set(cacheKey, 1);
              
              log.info(`Created and cached new road geometry in fallback mode (key: ${cacheKey})`);
              
              // Limit cache size to prevent memory issues
              this.pruneGeometryCache();
            }
        
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
          } catch (geometryError) {
            log.error('Failed to create road geometry in fallback mode:', geometryError);
            return null;
          }
        } catch (curveError) {
          log.error('Failed to create curved path in fallback mode:', curveError);
          return null;
        }
      }
    } catch (unexpectedError) {
      log.error('Unexpected error in createRoadMesh:', unexpectedError);
      return null;
    }
  }

  /**
   * Prunes the geometry cache when it gets too large
   * Removes least used geometries first
   */
  private pruneGeometryCache(): void {
    try {
      const MAX_CACHE_SIZE = 50; // Maximum number of cached geometries
      
      if (this.roadGeometryCache.size <= MAX_CACHE_SIZE) {
        return; // Cache is still within limits
      }
      
      log.info(`Pruning geometry cache (current size: ${this.roadGeometryCache.size})`);
      
      // Convert to array for sorting
      const entries = Array.from(this.geometryUsageCount.entries());
      
      // Sort by usage count (ascending)
      entries.sort((a, b) => a[1] - b[1]);
      
      // Remove least used entries until we're under the limit
      const entriesToRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      
      for (const [key, count] of entriesToRemove) {
        try {
          // Get the geometry before removing it from cache
          const geometry = this.roadGeometryCache.get(key);
          
          // Remove from caches
          this.roadGeometryCache.delete(key);
          this.geometryUsageCount.delete(key);
          
          // Dispose of the geometry
          if (geometry) {
            geometry.dispose();
          }
          
          log.info(`Removed geometry from cache (key: ${key}, usage count: ${count})`);
        } catch (error) {
          log.warn(`Error removing geometry from cache (key: ${key}):`, error);
          // Continue with other entries
        }
      }
      
      log.info(`Geometry cache pruned (new size: ${this.roadGeometryCache.size})`);
    } catch (error) {
      log.error('Error pruning geometry cache:', error);
      // Method fails gracefully
    }
  }

  /**
   * Creates a curved path from points
   * @param points Array of 3D points
   * @param curvature Curvature factor (0-1)
   * @returns THREE.js curve
   */
  private createCurvedPath(points: THREE.Vector3[], curvature: number): THREE.Curve<THREE.Vector3> {
    try {
      if (points.length === 2) {
        // For just two points, use a straight line
        return new THREE.LineCurve3(points[0], points[1]);
      }
      
      try {
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
      } catch (curveError) {
        log.error('Failed to create CatmullRomCurve3:', curveError);
        
        // Fallback to a simple line curve connecting the first and last points
        log.warn('Falling back to simple line curve');
        return new THREE.LineCurve3(points[0], points[points.length - 1]);
      }
    } catch (error) {
      log.error('Unexpected error in createCurvedPath:', error);
      
      // Ultimate fallback - create a minimal valid curve
      // This ensures we always return something rather than throwing
      const fallbackPoint1 = new THREE.Vector3(0, 0, 0);
      const fallbackPoint2 = new THREE.Vector3(0, 0, 1);
      return new THREE.LineCurve3(fallbackPoint1, fallbackPoint2);
    }
  }

  /**
   * Forces update of road visibility
   * Ensures roads are always visible in the scene
   */
  public updateRoadVisibility(): void {
    if (this.isDisposed) return;
    
    try {
      this.roads.forEach(road => {
        try {
          if (road && road.mesh) {
            // Force the mesh to be visible
            road.mesh.visible = true;
            
            // Ensure high render order
            road.mesh.renderOrder = 100; // Increased from 30 to 100
            
            try {
              // Ensure the material is properly configured
              if (road.mesh.material instanceof THREE.MeshBasicMaterial) {
                road.mesh.material.needsUpdate = true;
                road.mesh.material.depthWrite = false;
                road.mesh.material.polygonOffset = true;
                road.mesh.material.polygonOffsetFactor = -10; // Increased from -4 to -10
                road.mesh.material.polygonOffsetUnits = -10;  // Increased from -4 to -10
              } else if (Array.isArray(road.mesh.material)) {
                road.mesh.material.forEach(mat => {
                  try {
                    if (mat instanceof THREE.MeshBasicMaterial) {
                      mat.needsUpdate = true;
                      mat.depthWrite = false;
                      mat.polygonOffset = true;
                      mat.polygonOffsetFactor = -10; // Increased from -4 to -10
                      mat.polygonOffsetUnits = -10;  // Increased from -4 to -10
                    }
                  } catch (materialError) {
                    log.warn('Error updating individual material:', materialError);
                    // Continue with other materials
                  }
                });
              }
            } catch (materialError) {
              log.warn('Error updating road material:', materialError);
              // Continue with other aspects of visibility
            }
            
            try {
              // Force geometry update
              if (road.mesh.geometry && road.mesh.geometry.attributes.position) {
                road.mesh.geometry.attributes.position.needsUpdate = true;
              }
            } catch (geometryError) {
              log.warn('Error updating road geometry:', geometryError);
              // Continue with other roads
            }
          }
        } catch (roadError) {
          log.warn('Error updating road visibility for a road:', roadError);
          // Continue with other roads
        }
      });
    } catch (error) {
      log.error('Unexpected error in updateRoadVisibility:', error);
      // Method fails gracefully
    }
  }

  /**
   * Removes all roads from the scene
   */
  public removeAllRoads(): void {
    if (this.isDisposed) return;
    
    try {
      log.info(`Removing all ${this.roads.length} roads`);
      
      // Create a copy of the roads array to avoid modification during iteration
      const roadsToRemove = [...this.roads];
      
      // Remove all roads from the scene and dispose of resources
      roadsToRemove.forEach(road => {
        try {
          if (this.scene && road.mesh) {
            this.scene.remove(road.mesh);
          }
          
          try {
            if (road.mesh && road.mesh.geometry) {
              road.mesh.geometry.dispose();
            }
          } catch (geometryError) {
            log.warn(`Error disposing road geometry:`, geometryError);
          }
          
          try {
            if (road.mesh && road.mesh.material) {
              if (Array.isArray(road.mesh.material)) {
                road.mesh.material.forEach(m => {
                  try {
                    if (m) m.dispose();
                  } catch (materialError) {
                    log.warn(`Error disposing road material:`, materialError);
                  }
                });
              } else if (road.mesh.material) {
                road.mesh.material.dispose();
              }
            }
          } catch (materialError) {
            log.warn(`Error disposing road materials:`, materialError);
          }
          
          try {
            // Delete from service
            this.roadService.deleteRoad(road.id);
          } catch (serviceError) {
            log.warn(`Error deleting road from service:`, serviceError);
          }
        } catch (roadError) {
          log.error(`Error removing road:`, roadError);
          // Continue with other roads
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
            try {
              if (object instanceof THREE.Mesh && object.userData && object.userData.isRoad) {
                log.info('Found orphaned road mesh, removing it');
                objectsToRemove.push(object);
              }
            } catch (traverseError) {
              log.warn('Error during scene traversal:', traverseError);
              // Continue traversal
            }
          });
          
          // Then remove them in a separate step
          objectsToRemove.forEach(object => {
            try {
              this.scene.remove(object);
              
              try {
                if ((object as THREE.Mesh).geometry) {
                  (object as THREE.Mesh).geometry.dispose();
                }
              } catch (geometryError) {
                log.warn('Error disposing orphaned mesh geometry:', geometryError);
              }
              
              try {
                if ((object as THREE.Mesh).material) {
                  const material = (object as THREE.Mesh).material;
                  if (Array.isArray(material)) {
                    material.forEach(m => {
                      try {
                        if (m) m.dispose();
                      } catch (materialError) {
                        log.warn('Error disposing orphaned mesh material:', materialError);
                      }
                    });
                  } else if (material) {
                    material.dispose();
                  }
                }
              } catch (materialError) {
                log.warn('Error disposing orphaned mesh materials:', materialError);
              }
            } catch (objectError) {
              log.error('Error removing orphaned mesh:', objectError);
              // Continue with other objects
            }
          });
          
          log.info(`Removed ${objectsToRemove.length} orphaned road meshes`);
        } catch (error) {
          log.error('Error removing orphaned road meshes:', error);
        }
      }
    } catch (unexpectedError) {
      log.error('Unexpected error in removeAllRoads:', unexpectedError);
      // Try to reset the roads array as a last resort
      this.roads = [];
    }
  }

  /**
   * Saves a road to the server via the service
   * @param roadId ID of the road to save
   * @returns Promise resolving to true if successful
   */
  public saveRoadToServer(roadId: string): Promise<boolean> {
    if (this.isDisposed) return Promise.reject(new Error('RoadManager is disposed'));
    
    try {
      if (!roadId) {
        log.error('Cannot save road: Missing road ID');
        return Promise.reject(new Error('Missing road ID'));
      }
      
      // Check if the road exists before trying to save it
      const roadExists = this.roads.some(road => road.id === roadId);
      if (!roadExists) {
        log.warn(`Cannot save road: Road with ID ${roadId} not found in RoadManager`);
        return Promise.reject(new Error(`Road with ID ${roadId} not found`));
      }
      
      return this.roadService.saveRoadToServer(roadId)
        .catch(error => {
          log.error(`Error saving road ${roadId} to server:`, error);
          throw error; // Re-throw to allow caller to handle
        });
    } catch (error) {
      log.error('Unexpected error in saveRoadToServer:', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * Loads roads from the server via the service
   * @returns Promise that resolves when roads are loaded
   */
  public loadRoadsFromServer(): Promise<void> {
    if (this.isDisposed) return Promise.reject(new Error('RoadManager is disposed'));
    
    try {
      return this.roadService.loadRoadsFromServer()
        .then(roadDataArray => {
          try {
            log.info(`Loading ${roadDataArray.length} roads from server`);
            
            // Clear existing roads first
            try {
              this.removeAllRoads();
            } catch (removeError) {
              log.error('Error clearing existing roads:', removeError);
              // Continue with loading even if clearing fails
            }
            
            // Track successful and failed roads
            let successCount = 0;
            let failCount = 0;
            
            // Create each road
            roadDataArray.forEach(roadData => {
              try {
                if (!roadData || !roadData.id || !roadData.points || !Array.isArray(roadData.points)) {
                  log.warn('Invalid road data received from server:', roadData);
                  failCount++;
                  return; // Skip this road
                }
                
                // Convert the points to Vector3
                const points = this.roadService.convertToVector3Points(roadData.points);
                
                if (points.length < 2) {
                  log.warn(`Road ${roadData.id} has insufficient points (${points.length}), skipping`);
                  failCount++;
                  return; // Skip this road
                }
                
                // Create the road mesh
                const mesh = this.createRoadMesh(points, roadData.curvature || 0.5);
                
                if (!mesh) {
                  log.error(`Failed to create mesh for road ${roadData.id}, skipping`);
                  failCount++;
                  return; // Skip this road
                }
                
                // Add to scene
                this.scene.add(mesh);
                
                // Store the road
                const road: Road = {
                  id: roadData.id,
                  points,
                  mesh,
                  curvature: roadData.curvature || 0.5
                };
                
                this.roads.push(road);
                log.info(`Loaded road ${roadData.id} from server`);
                successCount++;
              } catch (roadError) {
                log.error(`Error creating road ${roadData?.id || 'unknown'} from server data:`, roadError);
                failCount++;
                // Continue with other roads
              }
            });
            
            log.info(`Road loading complete: ${successCount} successful, ${failCount} failed`);
          } catch (processingError) {
            log.error('Error processing roads from server:', processingError);
            throw processingError;
          }
        })
        .catch(error => {
          log.error('Error loading roads from server:', error);
          
          // Return a resolved promise to prevent cascading failures
          // The error has been logged, but we don't want to break the application
          return Promise.resolve();
        });
    } catch (unexpectedError) {
      log.error('Unexpected error in loadRoadsFromServer:', unexpectedError);
      return Promise.resolve(); // Prevent application crash
    }
  }

  /**
   * Cleans up resources used by the RoadManager
   */
  public dispose(): void {
    if (this.isDisposed) return;
    
    try {
      this.isDisposed = true;
      log.info(`Cleaning up ${this.roads.length} roads`);
      
      // Create a copy of the roads array to avoid modification during iteration
      const roadsToDispose = [...this.roads];
      
      // Remove all roads
      roadsToDispose.forEach(road => {
        try {
          if (this.scene && road.mesh) {
            this.scene.remove(road.mesh);
          }
          
          try {
            if (road.mesh && road.mesh.geometry) {
              // Properly dispose of geometry buffers
              if (road.mesh.geometry.index) {
                // Don't try to modify read-only array property
                road.mesh.geometry.index = null as unknown as THREE.BufferAttribute;
              }
              
              // Dispose of all geometry attributes
              Object.keys(road.mesh.geometry.attributes).forEach(attributeName => {
                const attribute = road.mesh.geometry.attributes[attributeName];
                if (attribute) {
                  // Don't try to modify read-only array property
                  road.mesh.geometry.deleteAttribute(attributeName);
                }
              });
              
              road.mesh.geometry.dispose();
            }
          } catch (geometryError) {
            log.warn(`Error disposing road geometry during cleanup:`, geometryError);
          }
          
          try {
            if (road.mesh && road.mesh.material) {
              if (Array.isArray(road.mesh.material)) {
                road.mesh.material.forEach(m => {
                  try {
                    if (m) {
                      // Dispose of all textures on the material
                      this.disposeTexturesFromMaterial(m);
                      m.dispose();
                    }
                  } catch (materialError) {
                    log.warn(`Error disposing road material during cleanup:`, materialError);
                  }
                });
              } else if (road.mesh.material) {
                // Dispose of all textures on the material
                this.disposeTexturesFromMaterial(road.mesh.material);
                road.mesh.material.dispose();
              }
            }
          } catch (materialError) {
            log.warn(`Error disposing road materials during cleanup:`, materialError);
          }
          
          // Clear all references to help garbage collection
          if (road.mesh) {
            road.mesh.userData = {};
          }
        } catch (roadError) {
          log.error(`Error disposing road during cleanup:`, roadError);
          // Continue with other roads
        }
      });
      
      this.roads = [];
      
      // Dispose of textures
      try {
        if (this.roadTexture) {
          this.roadTexture.dispose();
          this.roadTexture = null as unknown as THREE.Texture;
        }
      } catch (textureError) {
        log.warn('Error disposing road texture:', textureError);
      }
      
      try {
        if (this.roadNormalMap) {
          this.roadNormalMap.dispose();
          this.roadNormalMap = null as unknown as THREE.Texture;
        }
      } catch (normalMapError) {
        log.warn('Error disposing road normal map:', normalMapError);
      }
      
      try {
        if (this.roadRoughnessMap) {
          this.roadRoughnessMap.dispose();
          this.roadRoughnessMap = null as unknown as THREE.Texture;
        }
      } catch (roughnessMapError) {
        log.warn('Error disposing road roughness map:', roughnessMapError);
      }
      
      // Dispose of all tracked resources
      try {
        this.disposableResources.forEach(resource => {
          try {
            if (resource && typeof resource.dispose === 'function') {
              resource.dispose();
            }
          } catch (resourceError) {
            log.warn('Error disposing tracked resource:', resourceError);
          }
        });
        this.disposableResources = [];
      } catch (resourcesError) {
        log.warn('Error disposing tracked resources:', resourcesError);
      }
      
      // Dispose of the texture loader
      try {
        if (this.textureLoader) {
          // Release any references the texture loader might hold
          (this.textureLoader as any) = null;
        }
      } catch (loaderError) {
        log.warn('Error disposing texture loader:', loaderError);
      }
    
      // Store a local reference to scene to avoid undefined issues during cleanup
      const currentScene = this.scene;
      
      // Find and remove any orphaned road meshes in the scene
      if (currentScene) {
        try {
          const objectsToRemove: THREE.Object3D[] = [];
          
          // First collect all objects to remove
          try {
            currentScene.traverse((object) => {
              try {
                if (object instanceof THREE.Mesh && object.userData && 
                    (object.userData.isRoad || object.userData.roadId)) {
                  log.info('Found orphaned road mesh during cleanup, removing it');
                  objectsToRemove.push(object);
                }
              } catch (traverseError) {
                log.warn('Error during scene traversal for cleanup:', traverseError);
                // Continue traversal
              }
            });
          } catch (traverseError) {
            log.error('Error traversing scene for cleanup:', traverseError);
          }
          
          // Then remove them in a separate step to avoid modifying the scene during traversal
          objectsToRemove.forEach(object => {
            try {
              currentScene.remove(object);
              
              try {
                if ((object as THREE.Mesh).geometry) {
                  // Properly dispose of geometry buffers
                  const geometry = (object as THREE.Mesh).geometry;
                  if (geometry.index) {
                    // Don't try to modify read-only array property
                    geometry.index = null as unknown as THREE.BufferAttribute;
                  }
                  
                  // Dispose of all geometry attributes
                  Object.keys(geometry.attributes || {}).forEach(attributeName => {
                    const attribute = geometry.attributes?.[attributeName];
                    if (attribute) {
                      // Don't try to modify read-only array property
                      geometry.deleteAttribute(attributeName);
                    }
                  });
                  
                  geometry.dispose();
                }
              } catch (geometryError) {
                log.warn('Error disposing orphaned mesh geometry during cleanup:', geometryError);
              }
              
              try {
                if ((object as THREE.Mesh).material) {
                  const material = (object as THREE.Mesh).material;
                  if (Array.isArray(material)) {
                    material.forEach(m => {
                      try {
                        if (m) {
                          // Dispose of all textures on the material
                          this.disposeTexturesFromMaterial(m);
                          m.dispose();
                        }
                      } catch (materialError) {
                        log.warn('Error disposing orphaned mesh material during cleanup:', materialError);
                      }
                    });
                  } else if (material) {
                    // Dispose of all textures on the material
                    this.disposeTexturesFromMaterial(material);
                    material.dispose();
                  }
                }
              } catch (materialError) {
                log.warn('Error disposing orphaned mesh materials during cleanup:', materialError);
              }
              
              // Clear all references to help garbage collection
              object.userData = {};
            } catch (objectError) {
              log.error('Error removing orphaned mesh during cleanup:', objectError);
              // Continue with other objects
            }
          });
          
          log.info(`Removed ${objectsToRemove.length} orphaned road meshes during cleanup`);
        } catch (error) {
          log.error('Error cleaning up orphaned road meshes:', error);
        }
      }
      
      // Clear geometry cache
      try {
        if (this.roadGeometryCache) {
          // Dispose of all cached geometries
          this.roadGeometryCache.forEach((geometry, key) => {
            try {
              if (geometry) {
                // Dispose of any attributes and index buffers
                if (geometry.index) {
                  // Don't try to modify read-only array property
                  geometry.index = null!;
                }
                
                Object.keys(geometry.attributes).forEach(attributeName => {
                  const attribute = geometry.attributes[attributeName];
                  if (attribute) {
                    // Don't try to modify read-only array property
                    geometry.deleteAttribute(attributeName);
                  }
                });
                
                geometry.dispose();
                log.info(`Disposed of cached geometry (key: ${key})`);
              }
            } catch (geometryError) {
              log.warn(`Error disposing cached geometry (key: ${key}):`, geometryError);
            }
          });
          
          this.roadGeometryCache.clear();
          this.geometryUsageCount.clear();
          log.info('Road geometry cache cleared');
        }
      } catch (cacheError) {
        log.warn('Error clearing road geometry cache:', cacheError);
      }
      
      // Clear references to help garbage collection
      this.scene = null as any; // Using any to avoid type error while still clearing the reference
      
      log.info('RoadManager disposed successfully');
    } catch (unexpectedError) {
      log.error('Unexpected error during RoadManager disposal:', unexpectedError);
      // Mark as disposed even if there was an error
      this.isDisposed = true;
      this.roads = [];
      this.scene = null as unknown as THREE.Scene;
    }
  }

  /**
   * Helper method to dispose of all textures on a material
   * @param material The material to clean up
   */
  private disposeTexturesFromMaterial(material: THREE.Material): void {
    try {
      // Check for standard material properties
      if (material instanceof THREE.MeshStandardMaterial || 
          material instanceof THREE.MeshPhysicalMaterial ||
          material instanceof THREE.MeshBasicMaterial ||
          material instanceof THREE.MeshLambertMaterial ||
          material instanceof THREE.MeshPhongMaterial) {
        
        // Dispose of all possible texture maps
        if (material.map) material.map.dispose();
        
        // Check for properties that might not exist on all material types
        if ('normalMap' in material && (material as THREE.MeshStandardMaterial).normalMap) 
          (material as THREE.MeshStandardMaterial).normalMap.dispose();
        if ('roughnessMap' in material && (material as THREE.MeshStandardMaterial).roughnessMap) 
          (material as THREE.MeshStandardMaterial).roughnessMap.dispose();
        if ('metalnessMap' in material && (material as THREE.MeshStandardMaterial).metalnessMap) {
          (material as THREE.MeshStandardMaterial).metalnessMap.dispose();
        }
        if ('aoMap' in material && material.aoMap) material.aoMap.dispose();
        if ('emissiveMap' in material) {
          // Check each material type that can have emissiveMap
          if (material instanceof THREE.MeshStandardMaterial && material.emissiveMap) {
            material.emissiveMap.dispose();
          } else if (material instanceof THREE.MeshPhongMaterial && material.emissiveMap) {
            material.emissiveMap.dispose();
          } else if (material instanceof THREE.MeshLambertMaterial && material.emissiveMap) {
            material.emissiveMap.dispose();
          }
        }
        if ('bumpMap' in material) {
          // Check each material type that can have bumpMap
          if (material instanceof THREE.MeshStandardMaterial && material.bumpMap) {
            material.bumpMap.dispose();
          } else if (material instanceof THREE.MeshPhongMaterial && material.bumpMap) {
            material.bumpMap.dispose();
          }
        }
        if ('displacementMap' in material) {
          // Check each material type that can have displacementMap
          if (material instanceof THREE.MeshStandardMaterial && material.displacementMap) {
            material.displacementMap.dispose();
          } else if (material instanceof THREE.MeshPhongMaterial && material.displacementMap) {
            material.displacementMap.dispose();
          }
        }
        if ('envMap' in material && material.envMap) material.envMap.dispose();
        if ('lightMap' in material && material.lightMap) material.lightMap.dispose();
        if ('alphaMap' in material && material.alphaMap) material.alphaMap.dispose();
        
        // Clear references
        if (material.map) material.map = null! as unknown as THREE.Texture;
        
        // Clear references for properties that might not exist on all material types
        if ('normalMap' in material && (material as THREE.MeshStandardMaterial).normalMap) 
          (material as THREE.MeshStandardMaterial).normalMap = null! as unknown as THREE.Texture;
        if ('roughnessMap' in material && (material as THREE.MeshStandardMaterial).roughnessMap) 
          (material as THREE.MeshStandardMaterial).roughnessMap = null! as unknown as THREE.Texture;
        if ('metalnessMap' in material && (material as THREE.MeshStandardMaterial).metalnessMap) 
          (material as THREE.MeshStandardMaterial).metalnessMap = null! as unknown as THREE.Texture;
        if ('aoMap' in material && material.aoMap) 
          material.aoMap = null! as unknown as THREE.Texture;
        
        // Clear emissiveMap based on material type
        if ('emissiveMap' in material) {
          if (material instanceof THREE.MeshStandardMaterial && material.emissiveMap) {
            material.emissiveMap = null as unknown as THREE.Texture;
          } else if (material instanceof THREE.MeshPhongMaterial && material.emissiveMap) {
            material.emissiveMap = null as unknown as THREE.Texture;
          } else if (material instanceof THREE.MeshLambertMaterial && material.emissiveMap) {
            material.emissiveMap = null as unknown as THREE.Texture;
          }
        }
        
        // Clear bumpMap based on material type
        if ('bumpMap' in material) {
          if (material instanceof THREE.MeshStandardMaterial && material.bumpMap) {
            material.bumpMap = null as unknown as THREE.Texture;
          } else if (material instanceof THREE.MeshPhongMaterial && material.bumpMap) {
            material.bumpMap = null as unknown as THREE.Texture;
          }
        }
        if ('displacementMap' in material) {
          if (material instanceof THREE.MeshStandardMaterial && material.displacementMap) {
            material.displacementMap = null as unknown as THREE.Texture;
          } else if (material instanceof THREE.MeshPhongMaterial && material.displacementMap) {
            material.displacementMap = null as unknown as THREE.Texture;
          }
        }
        if ('envMap' in material && material.envMap) material.envMap = null as unknown as THREE.Texture;
        if ('lightMap' in material && material.lightMap) material.lightMap = null as unknown as THREE.Texture;
        if ('alphaMap' in material && material.alphaMap) material.alphaMap = null as unknown as THREE.Texture;
      }
    } catch (error) {
      log.warn('Error disposing textures from material:', error);
    }
  }

  /**
   * Loads roads from Airtable
   * @returns Promise that resolves when roads are loaded
   */
  public loadRoadsFromAirtable(): Promise<void> {
    if (this.isDisposed) return Promise.reject(new Error('RoadManager is disposed'));
    
    try {
      log.info('RoadManager: Loading roads from Airtable');
      return this.roadService.loadRoadsFromAirtable()
        .then(roadDataArray => {
          try {
            log.info(`Loading ${roadDataArray.length} roads from Airtable`);
            
            // Clear existing roads first
            try {
              this.removeAllRoads();
            } catch (removeError) {
              log.error('Error clearing existing roads:', removeError);
              // Continue with loading even if clearing fails
            }
            
            // Track successful and failed roads
            let successCount = 0;
            let failCount = 0;
            
            // Create each road
            roadDataArray.forEach(roadData => {
              try {
                if (!roadData || !roadData.id || !roadData.points || !Array.isArray(roadData.points)) {
                  log.warn('Invalid road data received from Airtable:', roadData);
                  failCount++;
                  return; // Skip this road
                }
                
                // Convert the points to Vector3
                const points = this.roadService.convertToVector3Points(roadData.points);
                
                if (points.length < 2) {
                  log.warn(`Road ${roadData.id} has insufficient points (${points.length}), skipping`);
                  failCount++;
                  return; // Skip this road
                }
                
                // Create the road mesh
                const mesh = this.createRoadMesh(points, roadData.curvature || 0.5);
                
                if (!mesh) {
                  log.error(`Failed to create mesh for road ${roadData.id}, skipping`);
                  failCount++;
                  return; // Skip this road
                }
                
                // Add to scene
                if (this.scene) {
                  this.scene.add(mesh);
                } else {
                  log.error(`Cannot add road mesh: scene is null`);
                  failCount++;
                  return; // Skip this road
                }
                
                // Store the road
                const road: Road = {
                  id: roadData.id,
                  points,
                  mesh,
                  curvature: roadData.curvature || 0.5
                };
                
                this.roads.push(road);
                log.info(`Loaded road ${roadData.id} from Airtable`);
                successCount++;
              } catch (roadError) {
                log.error(`Error creating road ${roadData?.id || 'unknown'} from Airtable data:`, roadError);
                failCount++;
                // Continue with other roads
              }
            });
            
            log.info(`Road loading from Airtable complete: ${successCount} successful, ${failCount} failed`);
          } catch (processingError) {
            log.error('Error processing roads from Airtable:', processingError);
            throw processingError;
          }
        })
        .catch(error => {
          log.error('Error loading roads from Airtable:', error);
          
          // Return a resolved promise to prevent cascading failures
          // The error has been logged, but we don't want to break the application
          return Promise.resolve();
        });
    } catch (unexpectedError) {
      log.error('Unexpected error in loadRoadsFromAirtable:', unexpectedError);
      return Promise.resolve(); // Prevent application crash
    }
  }

  /**
   * Saves a road to Airtable
   * @param roadId ID of the road to save
   * @param landId Optional associated land ID
   * @param walletAddress Optional creator wallet address
   * @returns Promise resolving to the saved road data
   */
  public saveRoadToAirtable(roadId: string, landId?: string, walletAddress?: string): Promise<any> {
    if (this.isDisposed) return Promise.reject(new Error('RoadManager is disposed'));
    
    try {
      if (!roadId) {
        log.error('Cannot save road to Airtable: Missing road ID');
        return Promise.reject(new Error('Missing road ID'));
      }
      
      // Check if the road exists before trying to save it
      const roadExists = this.roads.some(road => road.id === roadId);
      if (!roadExists) {
        log.warn(`Cannot save road to Airtable: Road with ID ${roadId} not found in RoadManager`);
        return Promise.reject(new Error(`Road with ID ${roadId} not found`));
      }
      
      return this.roadService.saveRoadToAirtable(roadId, landId, walletAddress)
        .catch(error => {
          log.error(`Error saving road ${roadId} to Airtable:`, error);
          throw error; // Re-throw to allow caller to handle
        });
    } catch (error) {
      log.error('Unexpected error in saveRoadToAirtable:', error);
      return Promise.reject(error);
    }
  }
}
