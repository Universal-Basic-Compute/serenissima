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
    // Normalize start and end points
    const normalizedStart = normalizeCoordinates(
      [bridge.startPoint],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    const normalizedEnd = normalizeCoordinates(
      [bridge.endPoint],
      this.bounds.centerLat,
      this.bounds.centerLng,
      this.bounds.scale,
      this.bounds.latCorrectionFactor
    )[0];
    
    // Create a bridge geometry
    const bridgeWidth = 1;
    const bridgeHeight = 0.2;
    
    // Calculate bridge length and angle
    const dx = normalizedEnd.x - normalizedStart.x;
    const dy = normalizedEnd.y - normalizedStart.y;
    const bridgeLength = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    // Create bridge geometry
    const bridgeGeometry = new THREE.BoxGeometry(bridgeLength, bridgeHeight, bridgeWidth);
    
    // Create bridge material
    const bridgeMaterial = new THREE.MeshStandardMaterial({
      color: this.activeView === 'transport' ? '#8B4513' : '#A0522D',
      roughness: 0.8,
      metalness: 0.2
    });
    
    // Create bridge mesh
    const bridgeMesh = new THREE.Mesh(bridgeGeometry, bridgeMaterial);
    
    // Position bridge at midpoint between start and end
    bridgeMesh.position.set(
      (normalizedStart.x + normalizedEnd.x) / 2,
      0.1, // Slightly above water level
      (normalizedStart.y + normalizedEnd.y) / 2
    );
    
    // Rotate bridge to align with start and end points
    bridgeMesh.rotation.y = angle;
    
    // Add bridge name as user data
    bridgeMesh.userData.bridgeId = bridge.id;
    bridgeMesh.userData.startLandId = bridge.startLandId;
    bridgeMesh.userData.endLandId = bridge.endLandId;
    
    return bridgeMesh;
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
