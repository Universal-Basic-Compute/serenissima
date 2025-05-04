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
    // Create a material
    const material = new THREE.MeshStandardMaterial({
      map: this.sandTexture,
      color: this.sandTexture ? 0xffffff : 0xf5e9c8, // Use texture color or sand color
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1
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
        
        // Create geometry
        const geometry = new THREE.ShapeGeometry(shape);
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material.clone());
        
        // Position mesh
        mesh.rotation.x = -Math.PI / 2; // Flat on the ground
        mesh.position.y = 0.1; // Slightly above ground
        
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
