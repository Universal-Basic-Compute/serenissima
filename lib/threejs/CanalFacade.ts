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
}

/**
 * CanalFacade provides a simplified interface for creating and managing water roads
 * (canals) in the 3D scene. It handles the creation, rendering, and animation of water roads.
 */
export class CanalFacade {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private waterLevel: number;
  private canals: Map<string, {
    mesh: THREE.Mesh;
    points: CanalPoint[];
    options: CanalOptions;
    flowOffset: number;
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
   * Creates a water road between the specified points
   * @param id Unique identifier for the water road
   * @param points Array of points defining the water road path
   * @param options Options for customizing the water road appearance
   * @returns The ID of the created water road
   */
  public createCanal(
    id: string,
    points: CanalPoint[],
    options: CanalOptions = {}
  ): string {
    if (points.length < 2) {
      console.error('Water road requires at least 2 points');
      return '';
    }
    
    if (this.debug) {
      console.log(`Creating canal with ID: ${id}, points: ${points.length}`);
    }

    // Remove existing road with the same ID if it exists
    this.removeCanal(id);

    // Merge default options with provided options
    const mergedOptions = { ...this.defaultOptions, ...options };

    // Create a curve from the points
    const curve = this.createCurveFromPoints(points);
    
    // Create the road geometry
    const geometry = new THREE.TubeGeometry(
      curve,
      points.length * 10, // Segments along the curve
      mergedOptions.width! / 2, // Radius
      mergedOptions.segments!, // Radial segments
      false // Closed
    );

    // Create water material
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
    
    // Store the water road
    this.canals.set(id, {
      mesh,
      points,
      options: mergedOptions,
      flowOffset: 0
    });
    
    return id;
  }

  /**
   * Removes a water road from the scene
   * @param id The ID of the water road to remove
   * @returns True if the water road was removed, false otherwise
   */
  public removeCanal(id: string): boolean {
    const road = this.canals.get(id);
    if (road) {
      this.scene.remove(road.mesh);
      road.mesh.geometry.dispose();
      if (Array.isArray(road.mesh.material)) {
        road.mesh.material.forEach(m => m.dispose());
      } else {
        road.mesh.material.dispose();
      }
      this.canals.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Updates the water road with new points or options
   * @param id The ID of the water road to update
   * @param points New points for the water road
   * @param options New options for the water road
   * @returns True if the water road was updated, false otherwise
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

    // Create a new water road with the updated parameters
    this.removeCanal(id);
    this.createCanal(id, updatedPoints, updatedOptions);
    
    return true;
  }

  /**
   * Updates all water roads (animations, etc.)
   * @param deltaTime Time elapsed since the last update
   */
  public update(deltaTime?: number): void {
    const dt = deltaTime || this.clock.getDelta();
    
    // Update each water road
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
   * Gets all water road IDs
   * @returns Array of water road IDs
   */
  public getCanalIds(): string[] {
    return Array.from(this.canals.keys());
  }

  /**
   * Gets a water road by ID
   * @param id The ID of the water road to get
   * @returns The water road data or null if not found
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
  private createCurveFromPoints(points: CanalPoint[]): THREE.Curve<THREE.Vector3> {
    // Extract Vector3 positions from points
    const positions = points.map(p => p.position);
    
    // Create a catmull-rom spline curve
    return new THREE.CatmullRomCurve3(positions, false, 'centripetal');
  }

  /**
   * Disposes of all resources
   */
  public dispose(): void {
    // Remove all water roads
    this.canals.forEach((road, id) => {
      this.removeCanal(id);
    });
    
    this.canals.clear();
  }

  /**
   * Sets the water level for all water roads
   * @param level The new water level
   */
  public setWaterLevel(level: number): void {
    this.waterLevel = level;
    
    // Update all water roads
    this.canals.forEach((road, id) => {
      road.mesh.position.y = level;
    });
  }
}
