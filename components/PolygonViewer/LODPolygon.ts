import * as THREE from 'three';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';

export default class LODPolygon {
  private scene: THREE.Scene;
  private polygon: Polygon;
  private bounds: any;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private mesh: THREE.Mesh;
  private highDetailMesh: THREE.Mesh | null = null;
  private lowDetailMesh: THREE.Mesh | null = null;
  private textureLoader: THREE.TextureLoader;
  private sandBaseColor: THREE.Texture;
  private sandNormalMap: THREE.Texture;
  private sandRoughnessMap: THREE.Texture;
  private distanceThreshold: number = 150;
  private isSelected: boolean = false;
  private originalColor: THREE.Color | null = null;

  constructor(
    scene: THREE.Scene,
    polygon: Polygon,
    bounds: any,
    activeView: ViewMode,
    performanceMode: boolean,
    textureLoader: THREE.TextureLoader,
    textures: {
      sandBaseColor: THREE.Texture;
      sandNormalMap: THREE.Texture;
      sandRoughnessMap: THREE.Texture;
    }
  ) {
    this.scene = scene;
    this.polygon = polygon;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.textureLoader = textureLoader;
    this.sandBaseColor = textures.sandBaseColor;
    this.sandNormalMap = textures.sandNormalMap;
    this.sandRoughnessMap = textures.sandRoughnessMap;
    
    // Create both detail levels
    this.createLowDetailMesh();
    this.createHighDetailMesh();
    
    // Start with high detail mesh
    this.mesh = this.highDetailMesh!;
    this.scene.add(this.mesh);
  }
  
  private createLowDetailMesh() {
    // Create a simplified version of the polygon with fewer vertices
    const normalizedCoords = normalizeCoordinates(
      this.polygon.coordinates,
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    );
    
    // Simplify coordinates by taking every other point
    const simplifiedCoords = normalizedCoords.filter((_, i) => i % 2 === 0);
    
    // Ensure we have at least 3 points
    if (simplifiedCoords.length < 3) {
      simplifiedCoords.push(...normalizedCoords.slice(simplifiedCoords.length));
    }
    
    const shape = createPolygonShape(simplifiedCoords);
    
    // Create extruded geometry with minimal settings
    const extrudeSettings = {
      steps: 1,
      depth: 0.025 + Math.random() * 0.025,
      bevelEnabled: false
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    
    // Create a simple material
    const material = new THREE.MeshStandardMaterial({ 
      color: this.activeView === 'land' ? '#7cac6a' : '#e6d2a8',
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.FrontSide,
      flatShading: true
    });
    
    this.lowDetailMesh = new THREE.Mesh(geometry, material);
    this.lowDetailMesh.castShadow = true;
    this.lowDetailMesh.receiveShadow = true;
    this.lowDetailMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    this.lowDetailMesh.userData.originalEmissiveIntensity = 0;
    this.lowDetailMesh.userData.isLowDetail = true;
  }
  
  private createHighDetailMesh() {
    const normalizedCoords = normalizeCoordinates(
      this.polygon.coordinates,
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    );
    
    const shape = createPolygonShape(normalizedCoords);
    
    // Create extruded geometry with full settings
    const extrudeSettings = {
      steps: this.performanceMode ? 1 : 2,
      depth: 0.025 + Math.random() * 0.025,
      bevelEnabled: false
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);
    
    // Create a detailed material with enhanced land view appearance
    const material = new THREE.MeshStandardMaterial({ 
      color: this.activeView === 'land' 
        ? new THREE.Color(0x7cac6a).lerp(new THREE.Color(0x8fbc8f), Math.random() * 0.3) // Varied green colors
        : '#e6d2a8',
      map: this.performanceMode ? null : this.sandBaseColor,
      normalMap: this.performanceMode ? null : this.sandNormalMap,
      roughnessMap: this.performanceMode ? null : this.sandRoughnessMap,
      roughness: this.activeView === 'land' ? 0.9 : 0.7,
      metalness: this.activeView === 'land' ? 0.0 : 0.1,
      side: this.performanceMode ? THREE.FrontSide : THREE.DoubleSide,
      flatShading: this.performanceMode,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    
    this.highDetailMesh = new THREE.Mesh(geometry, material);
    this.highDetailMesh.castShadow = true;
    this.highDetailMesh.receiveShadow = true;
    this.highDetailMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    this.highDetailMesh.userData.originalEmissiveIntensity = 0;
    this.highDetailMesh.userData.isLowDetail = false;
  }
  
  public updateLOD(cameraPosition: THREE.Vector3) {
    // Calculate distance to camera
    const distance = cameraPosition.distanceTo(this.mesh.position);
    
    // Switch based on distance
    if (distance > this.distanceThreshold && this.mesh !== this.lowDetailMesh) {
      // Switch to low detail
      this.scene.remove(this.mesh);
      this.mesh = this.lowDetailMesh!;
      this.scene.add(this.mesh);
    } else if (distance <= this.distanceThreshold && this.mesh !== this.highDetailMesh) {
      // Switch to high detail
      this.scene.remove(this.mesh);
      this.mesh = this.highDetailMesh!;
      this.scene.add(this.mesh);
    }
  }
  
  public getMesh() {
    return this.mesh;
  }
  
  public cleanup() {
    this.scene.remove(this.mesh);
    
    if (this.lowDetailMesh) {
      this.lowDetailMesh.geometry.dispose();
      (this.lowDetailMesh.material as THREE.Material).dispose();
    }
    
    if (this.highDetailMesh) {
      this.highDetailMesh.geometry.dispose();
      (this.highDetailMesh.material as THREE.Material).dispose();
    }
  }
  
  public updateSelectionState(isSelected: boolean) {
    // If selection state hasn't changed, do nothing
    if (this.isSelected === isSelected) return;
    
    this.isSelected = isSelected;
    
    // Apply visual changes to both high and low detail meshes
    const meshes = [this.highDetailMesh, this.lowDetailMesh].filter(Boolean);
    
    meshes.forEach(mesh => {
      if (!mesh) return;
      
      const material = mesh.material as THREE.MeshStandardMaterial;
      
      if (isSelected) {
        // Store original color if not already stored
        if (!this.originalColor) {
          this.originalColor = material.color.clone();
        }
        
        // Highlight the selected polygon with a bright color
        material.color.set('#ffcc00'); // Bright yellow
        material.emissive.set('#ff6600'); // Orange glow
        material.emissiveIntensity = 0.3;
      } else {
        // Restore original color
        if (this.originalColor) {
          material.color.copy(this.originalColor);
          material.emissive.set('#000000');
          material.emissiveIntensity = 0;
        }
      }
    });
  }
}
