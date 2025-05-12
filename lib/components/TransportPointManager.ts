import * as THREE from 'three';
import { normalizeCoordinates } from '../../components/PolygonViewer/utils';
import { Polygon } from '../../components/PolygonViewer/types';

// Extend the Polygon interface to include transport points
interface TransportPolygon extends Polygon {
  bridgePoints?: Array<{
    edge: { lat: number; lng: number };
    connection?: {
      targetPoint: { lat: number; lng: number };
    };
  }>;
  dockPoints?: Array<{
    edge: { lat: number; lng: number };
    water: { lat: number; lng: number };
  }>;
}

export interface TransportPointManagerProps {
  scene: THREE.Scene;
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export class TransportPointManager {
  private scene: THREE.Scene;
  private bounds: any;
  private bridgePointMarkers: THREE.Object3D[] = [];
  private dockPointMarkers: THREE.Object3D[] = [];
  private hoveredPointId: string | null = null;

  constructor({ scene, bounds }: TransportPointManagerProps) {
    this.scene = scene;
    this.bounds = bounds;
  }

  public createTransportPoints(polygons: TransportPolygon[]): void {
    console.log('Creating bridge and dock points');

    // Clear any existing markers first
    this.clearTransportMarkers();

    // Create materials
    const bridgeMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF5500,
      transparent: true,
      opacity: 0.6
    });

    const dockEdgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00AAFF,
      transparent: true,
      opacity: 0.6
    });

    const dockWaterMaterial = new THREE.MeshBasicMaterial({
      color: 0x0088CC,
      transparent: true,
      opacity: 0.6
    });

    // Process each polygon
    polygons.forEach((polygon: TransportPolygon) => {
      // Process bridge points
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length
> 0) {
        polygon.bridgePoints.forEach((point, index) => {
          try {
            const normalizedCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];

            // Create a marker for the bridge point
            const geometry = new THREE.SphereGeometry(0.3, 12, 12);

            const marker = new THREE.Mesh(geometry, bridgeMaterial);
            marker.position.set(normalizedCoord.x, 0.2, -normalizedCoord.y);
            marker.renderOrder = 100;

            // Add metadata for tooltips
            marker.userData = {
              id: `bridge-${polygon.id}-${index}`,
              type: 'bridge',
              polygonId: polygon.id,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`
            };

            this.scene.add(marker);
            this.bridgePointMarkers.push(marker);

            // If this bridge point has a connection, create a line to the target
            if (point.connection && point.connection.targetPoint) {
              const targetCoord = normalizeCoordinates(
                [point.connection.targetPoint],
                this.bounds.centerLat,
                this.bounds.centerLng,
                this.bounds.scale,
                this.bounds.latCorrectionFactor
              )[0];

              // Create a line geometry
              const lineGeometry = new THREE.BufferGeometry();
              const vertices = new Float32Array([
                normalizedCoord.x, 0.15, -normalizedCoord.y,
                targetCoord.x, 0.15, -targetCoord.y
              ]);
              lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

              // Create a line material
              const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xFF8800,
                transparent: true,
                opacity: 0.8,
                linewidth: 5
              });

              // Create the line
              const line = new THREE.Line(lineGeometry, lineMaterial);
              line.renderOrder = 95;

              this.scene.add(line);
              this.bridgePointMarkers.push(line);
            }
          } catch (error) {
            console.error(`Error creating bridge point for polygon ${polygon.id}:`, error);
          }
        });
      }

      // Process dock points
      if (polygon.dockPoints && Array.isArray(polygon.dockPoints) && polygon.dockPoints.length > 0) {
        polygon.dockPoints.forEach((point, index) => {
          try {
            // Create markers for both edge and water points
            const edgeCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];

            const waterCoord = normalizeCoordinates(
              [point.water],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];

            // Create a marker for the dock point (edge)
            const edgeGeometry = new THREE.SphereGeometry(0.3, 12, 12);

            const edgeMarker = new THREE.Mesh(edgeGeometry, dockEdgeMaterial);
            edgeMarker.position.set(edgeCoord.x, 0.2, -edgeCoord.y);
            edgeMarker.renderOrder = 100;

            // Add metadata for tooltips
            edgeMarker.userData = {
              id: `dock-edge-${polygon.id}-${index}`,
              type: 'dock-edge',
              polygonId: polygon.id,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`
            };

            this.scene.add(edgeMarker);
            this.dockPointMarkers.push(edgeMarker);

            // Create a line connecting edge to water
            const lineGeometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
              edgeCoord.x, 0.15, -edgeCoord.y,
              waterCoord.x, 0.15, -waterCoord.y
            ]);
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

            const lineMaterial = new THREE.LineBasicMaterial({
              color: 0x00CCFF,
              linewidth: 2
            });

            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.renderOrder = 99;

            this.scene.add(line);
            this.dockPointMarkers.push(line);

            // Create a marker for the water point
            const waterGeometry = new THREE.SphereGeometry(0.3, 12, 12);

            const waterMarker = new THREE.Mesh(waterGeometry, dockWaterMaterial);
            waterMarker.position.set(waterCoord.x, 0.2, -waterCoord.y);
            waterMarker.renderOrder = 100;

            // Add metadata for tooltips
            waterMarker.userData = {
              id: `dock-water-${polygon.id}-${index}`,
              type: 'dock-water',
              polygonId: polygon.id,
              position: `${point.water.lat.toFixed(6)}, ${point.water.lng.toFixed(6)}`
            };

            this.scene.add(waterMarker);
            this.dockPointMarkers.push(waterMarker);
          } catch (error) {
            console.error(`Error creating dock point for polygon ${polygon.id}:`, error);
          }
        });
      }
    });

    console.log(`Created ${this.bridgePointMarkers.length} bridge markers and
${this.dockPointMarkers.length} dock markers`);
  }

  public clearTransportMarkers(): void {
    // Clear bridge markers
    this.bridgePointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Line) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        }
      }
    });
    this.bridgePointMarkers = [];

    // Clear dock markers
    this.dockPointMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        } else if (Array.isArray(marker.material)) {
          marker.material.forEach(m => m.dispose());
        }
      } else if (marker instanceof THREE.Line) {
        if (marker.geometry) marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        }
      }
    });
    this.dockPointMarkers = [];
  }

  public setVisible(visible: boolean): void {
    this.bridgePointMarkers.forEach(marker => {
      marker.visible = visible;
    });
    this.dockPointMarkers.forEach(marker => {
      marker.visible = visible;
    });
  }

  public handleHover(raycaster: THREE.Raycaster, onHover: (id: string | null) => void): void {
    // Combine all markers for raycasting (excluding lines)
    const allMarkers = [...this.bridgePointMarkers, ...this.dockPointMarkers].filter(
      obj => obj instanceof THREE.Mesh
    );

    const intersects = raycaster.intersectObjects(allMarkers as THREE.Object3D[]);

    if (intersects.length > 0) {
      const intersected = intersects[0].object;
      const userData = intersected.userData;

      if (userData && userData.id && userData.id !== this.hoveredPointId) {
        this.hoveredPointId = userData.id;

        // Highlight the hovered point
        if (intersected instanceof THREE.Mesh) {
          const highlightMaterial = new THREE.MeshBasicMaterial({
            color: userData.type.startsWith('bridge') ? 0xFF8800 : 0x00CCFF,
            transparent: true,
            opacity: 1.0
          });

          // Store the original material if not already stored
          if (!intersected.userData.originalMaterial) {
            intersected.userData.originalMaterial = intersected.material;
          }

          // Apply the highlight material
          intersected.material = highlightMaterial;
        }

        // Call the hover callback
        onHover(userData.id);
      }
    } else if (this.hoveredPointId) {
      // Reset previously hovered point
      const hoveredPoint = [...this.bridgePointMarkers, ...this.dockPointMarkers].find(
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
          const isBridge = hoveredPoint.userData.type.startsWith('bridge');
          const isWater = hoveredPoint.userData.type === 'dock-water';

          hoveredPoint.material = new THREE.MeshBasicMaterial({
            color: isBridge ? 0xFF5500 : (isWater ? 0x0088CC : 0x00AAFF),
            transparent: true,
            opacity: 0.6
          });
        }
      }

      this.hoveredPointId = null;

      // Call the hover callback with null
      onHover(null);
    }
  }

  public getBridgePointMarkers(): THREE.Object3D[] {
    return this.bridgePointMarkers;
  }

  public getDockPointMarkers(): THREE.Object3D[] {
    return this.dockPointMarkers;
  }

  public cleanup(): void {
    this.clearTransportMarkers();
  }
}
