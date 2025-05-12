import * as THREE from 'three';
import { normalizeCoordinates } from '../../components/PolygonViewer/utils';
import { Polygon } from '../../components/PolygonViewer/types';

export interface BuildingPointManagerProps {
  scene: THREE.Scene;
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export class BuildingPointManager {
  private scene: THREE.Scene;
  private bounds: any;
  private buildingPointMarkers: THREE.Object3D[] = [];
  private hoveredPointId: string | null = null;

  constructor({ scene, bounds }: BuildingPointManagerProps) {
    this.scene = scene;
    this.bounds = bounds;
  }

  public createBuildingPoints(polygons: Polygon[]): void {
    console.log('Creating building points - START');

    // Clear any existing markers first
    this.clearBuildingPointMarkers();

    // Create a material for building points
    const buildingPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF, // White color for building points
      transparent: true,
      opacity: 0.4
    });

    // Process each polygon
    polygons.forEach(polygon => {
      // Skip if polygon has no building points
      if (!polygon.buildingPoints || !Array.isArray(polygon.buildingPoints) ||
polygon.buildingPoints.length === 0) return;

      polygon.buildingPoints.forEach((point, index) => {
        try {
          const normalizedCoord = normalizeCoordinates(
            [point],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];

          // Create a smaller sphere for better visibility
          const geometry = new THREE.SphereGeometry(0.15, 12, 12);

          const marker = new THREE.Mesh(geometry, buildingPointMaterial);
          // Position closer to the ground level
          marker.position.set(normalizedCoord.x, 0.05, -normalizedCoord.y);
          marker.renderOrder = 100;

          // Add metadata for tooltips
          marker.userData = {
            id: `building-point-${polygon.id}-${index}`,
            type: 'building-point',
            polygonId: polygon.id,
            position: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
          };

          this.scene.add(marker);
          this.buildingPointMarkers.push(marker);
        } catch (error) {
          console.error(`Error creating building point for polygon ${polygon.id}:`, error);
        }
      });
    });

    console.log(`Created ${this.buildingPointMarkers.length} building point markers`);
  }

  public clearBuildingPointMarkers(): void {
    this.buildingPointMarkers.forEach(marker => {
      this.scene.remove(marker);

      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Group) {
        marker.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            }
          }
        });
      }
    });
    this.buildingPointMarkers = [];
  }

  public setVisible(visible: boolean): void {
    this.buildingPointMarkers.forEach(marker => {
      marker.visible = visible;
    });
  }

  public handleHover(raycaster: THREE.Raycaster, onHover: (id: string | null) => void): void {
    // Filter to only include Mesh objects
    const buildingPointMarkers = this.buildingPointMarkers.filter(
      obj => obj instanceof THREE.Mesh
    );

    const intersects = raycaster.intersectObjects(buildingPointMarkers);

    if (intersects.length > 0) {
      const intersected = intersects[0].object;
      const userData = intersected.userData;

      if (userData && userData.id && userData.id !== this.hoveredPointId) {
        this.hoveredPointId = userData.id;

        // Highlight the hovered point
        if (intersected instanceof THREE.Mesh) {
          const highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFF00, // Bright yellow highlight
            transparent: true,
            opacity: 1.0
          });

          // Store the original material if not already stored
          if (!intersected.userData.originalMaterial) {
            intersected.userData.originalMaterial = intersected.material;
          }

          // Apply the highlight material
          intersected.material = highlightMaterial;

          // Scale up the building point slightly for better visibility
          intersected.scale.set(1.5, 1.5, 1.5);

          // Increase render order to ensure it's visible
          intersected.renderOrder = 2500;
        }

        // Call the hover callback
        onHover(userData.id);
      }
    } else if (this.hoveredPointId) {
      // Reset previously hovered point
      const hoveredPoint = this.buildingPointMarkers.find(
        marker => marker instanceof THREE.Mesh && marker.userData && marker.userData.id ===
this.hoveredPointId
      );

      if (hoveredPoint && hoveredPoint instanceof THREE.Mesh) {
        // Restore original material if available
        if (hoveredPoint.userData.originalMaterial) {
          hoveredPoint.material = hoveredPoint.userData.originalMaterial;
          delete hoveredPoint.userData.originalMaterial;
        } else {
          // Fallback to creating a new material
          hoveredPoint.material = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF, // White color for building points
            transparent: true,
            opacity: 0.6
          });
        }

        // Reset scale back to normal
        hoveredPoint.scale.set(1.0, 1.0, 1.0);

        // Reset render order
        hoveredPoint.renderOrder = 2000;
      }

      this.hoveredPointId = null;

      // Call the hover callback with null
      onHover(null);
    }
  }

  public getBuildingPointMarkers(): THREE.Object3D[] {
    return this.buildingPointMarkers;
  }

  public cleanup(): void {
    this.clearBuildingPointMarkers();
  }
}