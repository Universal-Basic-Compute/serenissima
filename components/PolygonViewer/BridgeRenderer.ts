import * as THREE from 'three';
import { Bridge, Polygon, ViewMode } from './types';
import { normalizeCoordinates } from './utils';

interface BridgeRendererProps {
  scene: THREE.Scene;
  bridges: Bridge[];
  polygons: Polygon[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
  activeView: ViewMode;
  performanceMode: boolean;
}

export default class BridgeRenderer {
  private scene: THREE.Scene;
  private bridges: Bridge[];
  private polygons: Polygon[];
  private bounds: any;
  private activeView: ViewMode;
  private performanceMode: boolean;
  private bridgeMeshes: THREE.Mesh[] = [];

  constructor({
    scene,
    bridges,
    polygons,
    bounds,
    activeView,
    performanceMode
  }: BridgeRendererProps) {
    this.scene = scene;
    this.bridges = bridges;
    this.polygons = polygons;
    this.bounds = bounds;
    this.activeView = activeView;
    this.performanceMode = performanceMode;
    
    this.renderBridges();
  }
  
  private renderBridges() {
    if (this.bridges.length > 0) {
      this.bridges.forEach((bridge, index) => {
        try {
          // Create a bridge mesh
          const bridgeMesh = this.createBridgeMesh(bridge);
          this.bridgeMeshes.push(bridgeMesh);
          this.scene.add(bridgeMesh);
        } catch (error) {
          console.error(`Error creating bridge ${index}:`, error);
        }
      });
    }
  }
  
  private createBridgeMesh(bridge: Bridge) {
    console.log('Bridge mesh creation disabled');
    // Return a dummy mesh with no geometry
    return new THREE.Mesh();
  }
  
  public updateViewMode(activeView: ViewMode) {
    this.activeView = activeView;
    
    // Update bridge materials based on view mode
    this.bridgeMeshes.forEach(mesh => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(this.activeView === 'transport' ? '#8B4513' : '#A0522D');
      material.needsUpdate = true;
    });
  }
  
  public updateQuality(performanceMode: boolean) {
    this.performanceMode = performanceMode;
  }
  
  public cleanup() {
    // Remove all bridge meshes from scene
    this.bridgeMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    
    this.bridgeMeshes = [];
  }
}
