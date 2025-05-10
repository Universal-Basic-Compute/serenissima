import * as THREE from 'three';

export interface CanalFacadeProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  waterLevel?: number;
}

export interface CanalPoint {
  position: THREE.Vector3;
  width?: number;
  depth?: number;
  isTransferPoint?: boolean;
}

export interface TransferPoint {
  id: string;
  position: THREE.Vector3;
  connectedRoadIds: string[];
  createdAt?: string;
}

export interface CanalOptions {
  width?: number;
  depth?: number;
  color?: number | string;
  opacity?: number;
  segments?: number;
  flowSpeed?: number;
  flowDirection?: { x: number; z: number };
  waveHeight?: number;
  waveFrequency?: number;
  transferPoints?: TransferPoint[];
  curvature?: number;
}

/**
 * CanalFacade provides a simplified interface for creating and managing canals
 * (canals) in the 3D scene. It handles the creation, rendering, and animation of canals.
 */
export class CanalFacade {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private waterLevel: number;
  private debug: boolean = false;
  private canals: Map<string, {
    mesh: THREE.Mesh;
    points: CanalPoint[];
    options: CanalOptions;
    flowOffset: number;
    transferPointMarkers?: THREE.Mesh[];
  }> = new Map();
  private transferPoints: Map<string, {
    marker: THREE.Mesh;
    transferPoint: TransferPoint;
  }> = new Map();
  private clock: THREE.Clock;
  private defaultOptions: CanalOptions = {
    width: 5,
    depth: 1,
    color: 0x3366ff,
    opacity: 0.8,
    segments: 32,
    flowSpeed: 0.5,
    flowDirection: { x: 1, z: 0 },
    waveHeight: 0.1,
    waveFrequency: 1
  };

  constructor(props: CanalFacadeProps) {
    this.scene = props.scene;
    this.camera = props.camera;
    this.waterLevel = props.waterLevel || 0;
    this.clock = new THREE.Clock();
    
    if (this.debug) {
      console.log('CanalFacade initialized with water level:', this.waterLevel);
    }
  }

  /**
   * Creates a canal between the specified points
   * @param id Unique identifier for the canal
   * @param points Array of points defining the canal path
   * @param options Options for customizing the canal appearance
   * @returns The ID of the created canal
   */
  public createCanal(
    id: string,
    points: CanalPoint[],
    options: CanalOptions = {}
  ): string {
    if (points.length < 2) {
      console.error('Canal requires at least 2 points');
      return '';
    }
    
    if (this.debug) {
      console.log(`Creating canal with ID: ${id}, points: ${points.length}`);
    }

    // Remove existing road with the same ID if it exists
    this.removeCanal(id);

    // Merge default options with provided options
    const mergedOptions = { ...this.defaultOptions, ...options };

    // Create a curve from the points with curvature parameter
    const curve = this.createCurveFromPoints(points, mergedOptions.curvature);
    
    // Calculate segments based on points and curvature
    const curveSegments = Math.max(
      points.length * 10,
      Math.floor(20 + (points.length - 2) * 10 * (mergedOptions.curvature || 0.5))
    );
    
    // Create the road geometry
    const geometry = new THREE.TubeGeometry(
      curve,
      curveSegments, // More segments for smoother curves
      mergedOptions.width! / 2, // Radius
      mergedOptions.segments!, // Radial segments
      false // Closed
    );

    // Create water material with improved appearance
    const material = new THREE.MeshStandardMaterial({
      color: mergedOptions.color,
      transparent: true,
      opacity: mergedOptions.opacity,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    // Create the mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position the mesh at water level
    mesh.position.y = this.waterLevel;
    
    // Add to scene
    this.scene.add(mesh);
    
    // Create transfer point markers if provided
    const transferPointMarkers: THREE.Mesh[] = [];
    if (mergedOptions.transferPoints && mergedOptions.transferPoints.length > 0) {
      mergedOptions.transferPoints.forEach(tp => {
        const marker = this.createTransferPointMarker(tp, id);
        if (marker) {
          transferPointMarkers.push(marker);
        }
      });
    }
    
    // Also create markers for points marked as transfer points
    points.forEach((point, index) => {
      if (point.isTransferPoint) {
        const transferPoint = {
          id: `transfer-point-${id}-${index}`,
          position: point.position,
          connectedRoadIds: [id],
          createdAt: new Date().toISOString()
        };
        
        const marker = this.createTransferPointMarker(transferPoint, id);
        if (marker) {
          transferPointMarkers.push(marker);
        }
      }
    });
    
    // Store the canal
    this.canals.set(id, {
      mesh,
      points,
      options: mergedOptions,
      flowOffset: 0,
      transferPointMarkers
    });
    
    return id;
  }
  
  /**
   * Creates a visual marker for a transfer point
   * @param transferPoint The transfer point data
   * @param canalId The ID of the canal this transfer point belongs to
   * @returns The created marker mesh
   */
  private createTransferPointMarker(transferPoint: TransferPoint, canalId: string): THREE.Mesh | null {
    if (!transferPoint.position) {
      console.error('Transfer point missing position data');
      return null;
    }
    
    // Create a sphere geometry for the transfer point
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffaa00, // Orange color for transfer points
      emissive: 0x553300,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.7
    });
    
    const marker = new THREE.Mesh(geometry, material);
    
    // Position the marker
    marker.position.set(
      transferPoint.position.x,
      this.waterLevel + 0.5, // Slightly above water level
      transferPoint.position.z
    );
    
    // Add to scene
    this.scene.add(marker);
    
    // Store the transfer point
    this.transferPoints.set(transferPoint.id, {
      marker,
      transferPoint
    });
    
    return marker;
  }

  /**
   * Removes a canal from the scene
   * @param id The ID of the canal to remove
   * @returns True if the canal was removed, false otherwise
   */
  public removeCanal(id: string): boolean {
    const canal = this.canals.get(id);
    if (canal) {
      // Remove the main canal mesh
      this.scene.remove(canal.mesh);
      canal.mesh.geometry.dispose();
      if (Array.isArray(canal.mesh.material)) {
        canal.mesh.material.forEach(m => m.dispose());
      } else {
        canal.mesh.material.dispose();
      }
      
      // Remove any transfer point markers associated with this canal
      if (canal.transferPointMarkers && canal.transferPointMarkers.length > 0) {
        canal.transferPointMarkers.forEach(marker => {
          this.scene.remove(marker);
          marker.geometry.dispose();
          if (marker.material) {
            if (Array.isArray(marker.material)) {
              marker.material.forEach(m => m.dispose());
            } else {
              marker.material.dispose();
            }
          }
        });
      }
      
      // Remove from our maps
      this.canals.delete(id);
      
      // Also remove any transfer points that only connect to this canal
      this.transferPoints.forEach((tp, tpId) => {
        if (tp.transferPoint.connectedRoadIds && 
            tp.transferPoint.connectedRoadIds.length === 1 && 
            tp.transferPoint.connectedRoadIds[0] === id) {
          this.scene.remove(tp.marker);
          tp.marker.geometry.dispose();
          if (tp.marker.material) {
            if (Array.isArray(tp.marker.material)) {
              tp.marker.material.forEach(m => m.dispose());
            } else {
              tp.marker.material.dispose();
            }
          }
          this.transferPoints.delete(tpId);
        }
      });
      
      return true;
    }
    return false;
  }

  /**
   * Updates the canal with new points or options
   * @param id The ID of the canal to update
   * @param points New points for the canal
   * @param options New options for the canal
   * @returns True if the canal was updated, false otherwise
   */
  public updateCanal(
    id: string,
    points?: CanalPoint[],
    options?: CanalOptions
  ): boolean {
    const road = this.canals.get(id);
    if (!road) return false;

    const updatedPoints = points || road.points;
    const updatedOptions = { ...road.options, ...options };

    // Create a new canal with the updated parameters
    this.removeCanal(id);
    this.createCanal(id, updatedPoints, updatedOptions);
    
    return true;
  }

  /**
   * Updates all canals (animations, etc.)
   * @param deltaTime Time elapsed since the last update
   */
  public update(deltaTime?: number): void {
    const dt = deltaTime || this.clock.getDelta();
    
    // Update each canal
    this.canals.forEach((road, id) => {
      // Update flow animation
      road.flowOffset += dt * road.options.flowSpeed!;
      
      // Apply flow animation to material
      const material = road.mesh.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.map.offset.x = road.flowOffset * road.options.flowDirection!.x;
        material.map.offset.y = road.flowOffset * road.options.flowDirection!.z;
        material.needsUpdate = true;
      }
      
      // Apply wave animation
      const geometry = road.mesh.geometry as THREE.BufferGeometry;
      const positionAttribute = geometry.getAttribute('position');
      const count = positionAttribute.count;
      
      for (let i = 0; i < count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);
        
        // Apply wave effect
        const waveOffset = Math.sin(
          (x + z) * road.options.waveFrequency! + road.flowOffset
        ) * road.options.waveHeight!;
        
        positionAttribute.setY(i, y + waveOffset);
      }
      
      positionAttribute.needsUpdate = true;
    });
  }

  /**
   * Gets all canal IDs
   * @returns Array of canal IDs
   */
  public getCanalIds(): string[] {
    return Array.from(this.canals.keys());
  }

  /**
   * Gets a canal by ID
   * @param id The ID of the canal to get
   * @returns The canal data or null if not found
   */
  public getCanal(id: string): {
    points: CanalPoint[];
    options: CanalOptions;
  } | null {
    const road = this.canals.get(id);
    if (!road) return null;
    
    return {
      points: road.points,
      options: road.options
    };
  }

  /**
   * Creates a THREE.Curve from an array of points
   * @param points Array of points
   * @returns THREE.Curve
   */
  private createCurveFromPoints(points: CanalPoint[], curvature: number = 0.5): THREE.Curve<THREE.Vector3> {
    // Extract Vector3 positions from points
    const positions = points.map(p => p.position);
    
    if (curvature <= 0) {
      // For straight lines, use a LineCurve3 for each segment and combine them
      if (positions.length === 2) {
        return new THREE.LineCurve3(positions[0], positions[1]);
      } else {
        // Create a custom curve that combines multiple line segments
        const curvePath = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i < positions.length - 1; i++) {
          curvePath.add(new THREE.LineCurve3(positions[i], positions[i + 1]));
        }
        return curvePath;
      }
    } else if (curvature >= 1) {
      // Maximum curvature - use catmull-rom with 'chordal' tension
      return new THREE.CatmullRomCurve3(positions, false, 'chordal');
    } else {
      // Intermediate curvature - use catmull-rom with 'centripetal' tension
      // and adjust the number of points based on curvature
      const curve = new THREE.CatmullRomCurve3(positions, false, 'centripetal');
      
      // For lower curvature values, we can reduce the curve's influence
      // by interpolating between the original points and the curve points
      if (curvature < 0.8) {
        const originalPoints = [...positions];
        const curvePoints = curve.getPoints(positions.length * 10);
        
        // Create a custom set of points that blend between straight lines and curves
        const blendedPoints: THREE.Vector3[] = [];
        
        // For each original segment, blend between straight and curved
        for (let i = 0; i < originalPoints.length - 1; i++) {
          const start = originalPoints[i];
          const end = originalPoints[i + 1];
          
          // Add the start point
          blendedPoints.push(start.clone());
          
          // Find curve points that fall within this segment
          const segmentStart = i * 10;
          const segmentEnd = (i + 1) * 10;
          
          // Add intermediate points with blending
          for (let j = segmentStart + 1; j < segmentEnd; j++) {
            if (j < curvePoints.length) {
              const curvePoint = curvePoints[j];
              const straightPoint = new THREE.Vector3().lerpVectors(start, end, (j - segmentStart) / 10);
              
              // Blend between straight and curved based on curvature value
              const blendedPoint = new THREE.Vector3().lerpVectors(
                straightPoint, curvePoint, curvature
              );
              
              blendedPoints.push(blendedPoint);
            }
          }
        }
        
        // Add the final point
        blendedPoints.push(originalPoints[originalPoints.length - 1].clone());
        
        // Create a new curve from the blended points
        return new THREE.CatmullRomCurve3(blendedPoints, false, 'centripetal');
      }
      
      return curve;
    }
  }

  /**
   * Disposes of all resources
   */
  public dispose(): void {
    // Remove all canals
    this.canals.forEach((canal, id) => {
      this.removeCanal(id);
    });
    
    // Remove any remaining transfer points
    this.transferPoints.forEach((tp, id) => {
      this.scene.remove(tp.marker);
      tp.marker.geometry.dispose();
      if (tp.marker.material) {
        if (Array.isArray(tp.marker.material)) {
          tp.marker.material.forEach(m => m.dispose());
        } else {
          tp.marker.material.dispose();
        }
      }
    });
    
    this.canals.clear();
    this.transferPoints.clear();
  }

  /**
   * Sets the water level for all canals
   * @param level The new water level
   */
  public setWaterLevel(level: number): void {
    this.waterLevel = level;
    
    // Update all canals
    this.canals.forEach((road, id) => {
      road.mesh.position.y = level;
    });
  }
}
