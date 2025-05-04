import * as THREE from 'three';
import { normalizeCoordinates, createPolygonShape } from './utils';

interface SimplePolygonRendererProps {
  scene: THREE.Scene;
  polygons: any[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export default class SimplePolygonRenderer {
  private scene: THREE.Scene;
  private polygons: any[];
  private bounds: any;
  private meshes: THREE.Mesh[] = [];
  private textureLoader: THREE.TextureLoader;
  private sandTexture: THREE.Texture | null = null;
  
  constructor({ scene, polygons, bounds }: SimplePolygonRendererProps) {
    this.scene = scene;
    this.polygons = polygons;
    this.bounds = bounds;
    this.textureLoader = new THREE.TextureLoader();
    
    // Load sand texture
    this.textureLoader.load(
      '/textures/sand.jpg',
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        this.sandTexture = texture;
        
        // Render polygons once texture is loaded
        this.renderPolygons();
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', error);
        // Render polygons without texture if loading fails
        this.renderPolygons();
      }
    );
  }
  
  private renderPolygons() {
    // Create a material with sand texture and improved appearance
    const material = new THREE.MeshStandardMaterial({
      map: this.sandTexture,
      color: this.sandTexture ? 0xffffff : 0xf5e9c8, // Use texture color or sand color
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
      // Add slight bumpiness to the land
      bumpScale: 0.05
    });
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      try {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          console.warn(`Invalid polygon coordinates for ${polygon.id}`);
          return;
        }
        
        // Normalize coordinates
        const normalizedCoords = normalizeCoordinates(
          polygon.coordinates,
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        );
        
        // Create shape
        const shape = createPolygonShape(normalizedCoords);
        
        // Create geometry with slight extrusion for elevation
        const extrudeSettings = {
          depth: 0.2,  // Increased from 0 to 0.2 for slight elevation
          bevelEnabled: true,
          bevelSegments: 1,
          bevelSize: 0.1,
          bevelThickness: 0.1
        };
        
        // Use ExtrudeGeometry instead of ShapeGeometry for elevation
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material.clone());
        
        // Position mesh - adjust rotation to make top surface flat
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.2; // Increase height to ensure clear separation from water
        mesh.renderOrder = 1; // Ensure it renders after water
        
        // Apply polygon offset to prevent z-fighting
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.polygonOffset = true;
          mesh.material.polygonOffsetFactor = 1;
          mesh.material.polygonOffsetUnits = 1;
        }
        
        // Add to scene
        this.scene.add(mesh);
        
        // Store reference
        this.meshes.push(mesh);
        
      } catch (error) {
        console.error(`Error rendering polygon ${polygon.id}:`, error);
      }
    });
    
    console.log(`Rendered ${this.meshes.length} polygons`);
  }
  
  public cleanup() {
    // Remove meshes from scene and dispose resources
    this.meshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => material.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    
    // Clear array
    this.meshes = [];
    
    // Dispose texture
    if (this.sandTexture) {
      this.sandTexture.dispose();
      this.sandTexture = null;
    }
  }
}
