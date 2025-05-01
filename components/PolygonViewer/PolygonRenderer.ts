import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode } from './types';
import { normalizeCoordinates, createPolygonShape } from './utils';

interface PolygonRendererProps {
  scene: THREE.Scene;
  polygons: Polygon[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
  activeView: ViewMode;
  performanceMode: boolean;
  polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
}

export default class PolygonRenderer {
  private scene: THREE.Scene;
  private polygons: Polygon[];
  private bounds: any;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  private textureLoader: THREE.TextureLoader;
  private sandBaseColor: THREE.Texture;
  private sandNormalMap: THREE.Texture;
  private sandRoughnessMap: THREE.Texture;
  private meshes: THREE.Mesh[] = [];

  constructor({
    scene,
    polygons,
    bounds,
    activeView,
    performanceMode,
    polygonMeshesRef
  }: PolygonRendererProps) {
    this.scene = scene;
    this.polygons = polygons;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    this.polygonMeshesRef = polygonMeshesRef;
    
    // Create textures
    this.textureLoader = new THREE.TextureLoader();
    
    // Sand textures
    this.sandBaseColor = this.textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    this.sandNormalMap = this.textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big-nm.jpg');
    this.sandRoughnessMap = this.textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big-ao.jpg');
    
    this.sandBaseColor.wrapS = this.sandBaseColor.wrapT = THREE.RepeatWrapping;
    this.sandNormalMap.wrapS = this.sandNormalMap.wrapT = THREE.RepeatWrapping;
    this.sandRoughnessMap.wrapS = this.sandRoughnessMap.wrapT = THREE.RepeatWrapping;
    
    // Make the texture 4x bigger by reducing the repeat value to 1/4 of the original
    this.sandBaseColor.repeat.set(1.25, 1.25);
    this.sandNormalMap.repeat.set(1.25, 1.25);
    this.sandRoughnessMap.repeat.set(1.25, 1.25);
    
    this.renderPolygons();
  }
  
  private renderPolygons() {
    if (this.polygons.length > 0) {
      this.polygons.forEach((polygon, index) => {
        console.log(`Processing polygon ${index}:`, polygon);
        
        if (polygon.coordinates && polygon.coordinates.length > 2) {
          try {
            // Normalize coordinates relative to center and apply scale
            const normalizedCoords = normalizeCoordinates(
              polygon.coordinates,
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            );
            
            // Create shape from normalized coordinates
            const shape = createPolygonShape(normalizedCoords);
            
            // Create extruded geometry for the island with a slight height
            const extrudeSettings = {
              steps: this.performanceMode ? 1 : 2,
              depth: 0.025 + Math.random() * 0.025, // 75% thinner
              bevelEnabled: false // Disable bevel completely
            };
            
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            
            // Rotate to lay flat on the "ground" but facing upward
            geometry.rotateX(-Math.PI / 2);
            
            // Create a realistic sand material
            const sandMaterial = new THREE.MeshStandardMaterial({ 
              color: '#e6d2a8', // More yellow/tan color
              map: this.performanceMode ? null : this.sandBaseColor,
              normalMap: this.performanceMode ? null : this.sandNormalMap,
              roughnessMap: this.performanceMode ? null : this.sandRoughnessMap,
              roughness: 0.7,
              metalness: 0.1,
              side: this.performanceMode ? THREE.FrontSide : THREE.DoubleSide,
              flatShading: this.performanceMode,
              wireframe: false,
              // Remove polygon edges by setting these properties:
              polygonOffset: true,
              polygonOffsetFactor: 1,
              polygonOffsetUnits: 1
            });
            
            // Modify the material based on the active view
            if (this.activeView === 'land') {
              // For land view, use a more terrain-like material
              sandMaterial.color.set('#7cac6a'); // More green for land view
              sandMaterial.roughness = 0.9;
              sandMaterial.metalness = 0.0;
            }
            
            const mesh = new THREE.Mesh(geometry, sandMaterial);
            
            // Store reference to the mesh
            this.polygonMeshesRef.current[polygon.id] = mesh;
            this.meshes.push(mesh);
            
            // Store the original material properties explicitly on creation
            mesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
            mesh.userData.originalEmissiveIntensity = 0;
            
            // Position at ground level
            mesh.position.y = 0;
            
            // Enable shadows
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            this.scene.add(mesh);
            console.log(`Added polygon ${index} to scene`);
          } catch (error) {
            console.error(`Error creating polygon ${index}:`, error);
          }
        } else {
          console.warn(`Polygon ${index} has invalid coordinates:`, polygon.coordinates);
        }
      });
    } else {
      console.warn('No polygons to display');
      this.createSamplePolygon();
    }
  }
  
  private createSamplePolygon() {
    // Add a sample polygon for testing
    const sampleShape = new THREE.Shape();
    // Make the sample polygon wider to account for latitude correction
    const sampleWidth = 10 / this.bounds.latCorrectionFactor;
    sampleShape.moveTo(-sampleWidth, -10);
    sampleShape.lineTo(-sampleWidth, 10);
    sampleShape.lineTo(sampleWidth, 10);
    sampleShape.lineTo(sampleWidth, -10);
    
    const extrudeSettings = {
      steps: 1,
      depth: 0.04, // 75% thinner
      bevelEnabled: false // Disable bevel completely
    };
    
    const sampleGeometry = new THREE.ExtrudeGeometry(sampleShape, extrudeSettings);
    sampleGeometry.rotateX(-Math.PI / 2);
    
    const sampleMaterial = new THREE.MeshStandardMaterial({
      color: '#e6d2a8', // More yellow/tan color
      map: this.sandBaseColor,
      normalMap: this.sandNormalMap,
      roughnessMap: this.sandRoughnessMap,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: false,
      // Remove polygon edges by setting these properties:
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    
    if (this.activeView === 'land') {
      // For land view, use a more terrain-like material
      sampleMaterial.color.set('#7cac6a'); // More green for land view
      sampleMaterial.roughness = 0.9;
      sampleMaterial.metalness = 0.0;
    }
    
    const sampleMesh = new THREE.Mesh(sampleGeometry, sampleMaterial);
    sampleMesh.castShadow = true;
    sampleMesh.receiveShadow = true;
    
    // Store the original material properties explicitly
    sampleMesh.userData.originalEmissive = new THREE.Color(0, 0, 0);
    sampleMesh.userData.originalEmissiveIntensity = 0;
    
    this.meshes.push(sampleMesh);
    this.scene.add(sampleMesh);
    console.log('Added sample polygon to scene');
  }
  
  public cleanup() {
    // Remove all meshes from the scene and dispose of resources
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
    
    // Dispose of textures
    this.sandBaseColor.dispose();
    this.sandNormalMap.dispose();
    this.sandRoughnessMap.dispose();
  }
}
